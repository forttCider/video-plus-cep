import React, { useState, useMemo, useEffect, useRef } from "react"
import { Loader2, Sparkles, RotateCcw, ChevronDown, ChevronUp } from "lucide-react"
import { Button } from "./ui/button"
import PersonImageTab from "./PersonImageTab"
import BackgroundTab from "./BackgroundTab"
import RemoveBgCredits from "./RemoveBgCredits"
import DevSwitches from "./DevSwitches"
import { summaryToText, parseUnits } from "../js/summaryText"
import { splitIntoParts, relabelParts } from "../js/title-bridge"
import { CHANNELS } from "../js/channels"

const SUB_TABS = [
  { key: "person", label: "인물" },
  { key: "bg", label: "배경" },
]
const PART_COUNTS = [1, 2, 3, 4, 5]

/**
 * 썸네일 소스 제작 도구 모음 (인물 / 배경 / 제목 서브탭)
 * 배경/제목 탭은 상단 "부 편성" 바 + 하단 결과가 하나의 스크롤 영역에 함께 들어간다.
 * ① 입력(요약 자동 채움 · 붙여넣기) → ② 부 개수 → AI 편성 → 인풋 아래 부별 구간(접기 가능) → 부별 생성.
 */
export default function ThumbnailTab({ isConnected, worker, summary }) {
  const [subTab, setSubTab] = useState("person")
  const [channelId, setChannelId] = useState("") // 미선택 — 먼저 채널을 골라야 진행

  // ① 분리 대상 텍스트 (요약 자동 채움 · 직접 입력 가능)
  const [splitText, setSplitText] = useState("")
  const units = useMemo(() => parseUnits(splitText), [splitText])

  // 부 편성 상태
  const [numParts, setNumParts] = useState(3)
  const [partOf, setPartOf] = useState({}) // { [unit.index]: partNo }
  const [partTitles, setPartTitles] = useState({}) // { [partNo]: title }
  const [partColors, setPartColors] = useState({}) // { [partNo]: colorKey }
  const [activePart, setActivePart] = useState(1)
  const [hasPlan, setHasPlan] = useState(false)
  const [planOpen, setPlanOpen] = useState(false) // 구간 편성 펼침 여부 (기본 접힘)
  const [splitting, setSplitting] = useState(false)
  const [splitError, setSplitError] = useState(null)
  const [relabeling, setRelabeling] = useState(false)

  const resetPlan = () => {
    setPartOf({})
    setPartTitles({})
    setPartColors({})
    setHasPlan(false)
    setActivePart(1)
    setSplitError(null)
  }

  // 재조합(구간 이동) 시 라벨 자동 재생성용 — 디바운스 + 최신값 ref
  const partOfRef = useRef(partOf)
  const numPartsRef = useRef(numParts)
  const unitsRef = useRef(units)
  const relabelTimer = useRef(null)
  useEffect(() => {
    partOfRef.current = partOf
  }, [partOf])
  useEffect(() => {
    numPartsRef.current = numParts
  }, [numParts])
  useEffect(() => {
    unitsRef.current = units
  }, [units])
  useEffect(() => () => relabelTimer.current && clearTimeout(relabelTimer.current), [])

  // 요약이 들어오면 입력창에 자동 채움 + 편성 초기화
  useEffect(() => {
    const t = summary ? summaryToText(summary) : ""
    if (t.trim()) setSplitText(t)
    resetPlan()
  }, [summary])

  // 현재 부에 속한 구간 텍스트 (제목 탭 맥락 — 부 하나씩)
  const activePartText = useMemo(() => {
    if (!hasPlan) return undefined
    return units
      .filter((u) => partOf[u.index] === activePart)
      .map((u) => u.text)
      .join("\n\n")
  }, [hasPlan, units, partOf, activePart])

  const handleSplit = async () => {
    if (!channelId) {
      setSplitError("먼저 채널을 선택하세요.")
      return
    }
    if (!units.length) {
      setSplitError("먼저 요약/내용을 입력하세요.")
      return
    }
    setSplitting(true)
    setSplitError(null)
    try {
      const items = units.map((u) => ({ segment_index: u.index, topic: u.topic }))
      const r = await splitIntoParts(items, numParts)
      if (r.success) {
        const po = {}
        const pt = {}
        const pc = {}
        r.parts.forEach((p) => {
          p.segments.forEach((id) => (po[id] = p.part))
          pt[p.part] = p.title
          if (p.color) pc[p.part] = p.color
        })
        setPartOf(po)
        setPartTitles(pt)
        setPartColors(pc)
        setActivePart(1)
        setHasPlan(true)
        setPlanOpen(false)
      } else {
        setSplitError(r.error || "부 편성 실패")
      }
    } catch (e) {
      setSplitError(e.message || String(e))
    } finally {
      setSplitting(false)
    }
  }

  // 현재 편성 기준으로 각 부 라벨만 다시 생성 (구간 재조합 후 자동 호출)
  const runRelabel = async () => {
    const po = partOfRef.current
    const us = unitsRef.current
    const groups = []
    PART_COUNTS.forEach((n) => {
      if (n > numPartsRef.current) return
      const topics = us
        .filter((u) => po[u.index] === n)
        .map((u) => u.topic)
        .filter(Boolean)
      if (topics.length) groups.push({ part: n, topics })
    })
    if (!groups.length) return
    setRelabeling(true)
    try {
      const r = await relabelParts(groups)
      if (r.success) {
        setPartTitles((pt) => ({ ...pt, ...r.titles }))
        if (r.colors) setPartColors((pc) => ({ ...pc, ...r.colors }))
      }
    } catch (e) {
      /* 라벨 실패는 조용히 무시 (기존 라벨 유지) */
    } finally {
      setRelabeling(false)
    }
  }
  const scheduleRelabel = () => {
    if (relabelTimer.current) clearTimeout(relabelTimer.current)
    relabelTimer.current = setTimeout(runRelabel, 1200)
  }

  const moveUnit = (idx, toPart) => {
    setPartOf((po) => ({ ...po, [idx]: toPart }))
    scheduleRelabel() // 잠깐 멈추면 라벨 자동 갱신 (디바운스)
  }
  const setPartTitle = (n, v) => setPartTitles((pt) => ({ ...pt, [n]: v }))

  // 실제 구간이 배정된 부 번호 목록 (1..numParts 중 비어있지 않은 것)
  const activeParts = useMemo(() => {
    const set = new Set(Object.values(partOf))
    return PART_COUNTS.filter((n) => n <= numParts && set.has(n))
  }, [partOf, numParts])

  // 배경 탭용: 모든 부 + 각 부 텍스트 (부별 블록으로 펼침)
  const partList = useMemo(() => {
    if (!hasPlan) return null
    return activeParts.map((n) => ({
      part: n,
      title: partTitles[n] || "",
      color: partColors[n] || null,
      text: units
        .filter((u) => partOf[u.index] === n)
        .map((u) => u.text)
        .join("\n\n"),
    }))
  }, [hasPlan, activeParts, partTitles, partColors, units, partOf])

  const countOf = (partNo) => units.filter((u) => partOf[u.index] === partNo).length

  // 부 편성 바 (배경/제목 탭 상단에 공유, 각 탭 스크롤 안에 렌더)
  const renderPlanner = () => (
    <div className="px-4 pt-2">
      <div className="border border-border rounded-md bg-neutral-900/40 px-3 py-2 flex flex-col gap-2">
        {/* 채널 (요소 추출·배경 프롬프트 스타일) — 먼저 선택해야 진행 */}
        <div className="flex items-center gap-2">
          <span className="text-[11px] font-semibold text-muted-foreground">채널</span>
          <select
            value={channelId}
            onChange={(e) => setChannelId(e.target.value)}
            className={`text-[11px] bg-background border rounded-md px-2 py-1 outline-none focus:border-white/40 ${
              channelId ? "border-border" : "border-amber-500/70 text-amber-300"
            }`}
            title="채널마다 요소 추출·배경 생성 프롬프트 스타일이 달라집니다"
          >
            <option value="" disabled>
              채널 선택…
            </option>
            {CHANNELS.map((c) => (
              <option key={c.id} value={c.id}>
                {c.label}
              </option>
            ))}
          </select>
          <span className="text-[10px] text-muted-foreground">
            {channelId
              ? "요소 추출·배경 스타일이 채널에 맞게 바뀝니다"
              : "먼저 채널을 선택하세요 — 편성·추출·배경이 채널 스타일로 진행됩니다"}
          </span>
        </div>

        {/* ① 입력 */}
        <div className="flex flex-col gap-1">
          <span className="text-[11px] font-semibold text-muted-foreground">
            ① 내용 입력 (요약 자동 입력 — 직접 수정·붙여넣기 가능)
          </span>
          <textarea
            value={splitText}
            onChange={(e) => {
              setSplitText(e.target.value)
              if (hasPlan) resetPlan()
            }}
            placeholder="받아쓰기 요약이 자동으로 채워집니다. 없으면 내용을 직접 붙여넣으세요. (번호 매긴 구간 또는 문단 단위로 나뉩니다)"
            rows={4}
            className="w-full text-xs bg-transparent border border-border rounded-md px-2 py-1.5 outline-none focus:border-white/40 resize-y"
          />
        </div>

        {/* ② 부 개수 + 편성 */}
        <div className="flex flex-col gap-2">
          <span className="text-[11px] font-semibold text-muted-foreground">
            ② 몇 부로 나눌까요? (구간 {units.length}개)
          </span>
          <div className="flex items-center gap-2 flex-wrap">
            <div className="flex items-center gap-0.5">
              {PART_COUNTS.map((n) => (
                <button
                  key={n}
                  onClick={() => setNumParts(n)}
                  disabled={splitting}
                  className={`text-xs font-semibold w-8 h-7 rounded-md transition-colors ${
                    numParts === n
                      ? "bg-white text-black"
                      : "bg-transparent text-muted-foreground hover:bg-white/10"
                  }`}
                >
                  {n}
                </button>
              ))}
            </div>
            <Button
              size="sm"
              onClick={handleSplit}
              disabled={splitting || !units.length || !channelId}
            >
              {splitting ? (
                <Loader2 className="h-4 w-4 mr-1.5 animate-spin" />
              ) : (
                <Sparkles className="h-4 w-4 mr-1.5" />
              )}
              {hasPlan ? "AI 재편성" : "AI 자동 편성"}
            </Button>
            {hasPlan && (
              <button
                onClick={resetPlan}
                className="flex items-center gap-1 text-[10px] px-2 py-1 rounded-md border border-border text-muted-foreground hover:bg-white/5"
              >
                <RotateCcw className="h-3 w-3" />
                초기화
              </button>
            )}
            {relabeling && (
              <span className="flex items-center gap-1 text-[10px] text-muted-foreground">
                <Loader2 className="h-3 w-3 animate-spin" />
                라벨 갱신 중
              </span>
            )}
            {!hasPlan && (
              <span className="text-[10px] text-muted-foreground">1부면 전체를 한 번에</span>
            )}
          </div>
        </div>

        {/* 부 나누는 구간 (편성 후 · 접기 가능) */}
        {hasPlan && (
          <div className="flex flex-col gap-2 pt-1 border-t border-border">
            <div className="flex items-center gap-1.5 flex-wrap">
              {subTab === "title" && (
                <>
                  <span className="text-[11px] font-semibold text-muted-foreground mr-1">
                    부 선택
                  </span>
                  {activeParts.map((n) => (
                    <button
                      key={n}
                      onClick={() => setActivePart(n)}
                      className={`text-[11px] px-2 py-1 rounded-md border transition-colors ${
                        activePart === n
                          ? "bg-white text-black border-white"
                          : "border-border text-muted-foreground hover:bg-white/5"
                      }`}
                      title={partTitles[n] || `${n}부`}
                    >
                      {n}부{partTitles[n] ? ` · ${partTitles[n]}` : ""} ({countOf(n)})
                    </button>
                  ))}
                </>
              )}
              <button
                onClick={() => setPlanOpen((v) => !v)}
                className="ml-auto flex items-center gap-1 text-[10px] px-2 py-1 rounded-md border border-border text-muted-foreground hover:bg-white/5"
              >
                {planOpen ? (
                  <ChevronUp className="h-3 w-3" />
                ) : (
                  <ChevronDown className="h-3 w-3" />
                )}
                부별 구간 편성
              </button>
            </div>

            {planOpen && (
              <>
                <p className="text-[10px] text-muted-foreground">
                  구간을 다른 부로 옮기면 잠시 뒤 라벨이 자동 갱신됩니다. 라벨 직접 수정도 가능.
                </p>
                <div className="flex flex-col gap-2 max-h-56 overflow-auto">
                  {activeParts.map((n) => (
                    <div key={n} className="flex flex-col gap-1">
                      <div className="flex items-center gap-1">
                        <span className="text-[10px] font-semibold text-white/80 shrink-0">
                          {n}부
                        </span>
                        <input
                          value={partTitles[n] || ""}
                          onChange={(e) => setPartTitle(n, e.target.value)}
                          placeholder="부 라벨 (자동 생성 · 수정 가능)"
                          className="flex-1 min-w-0 text-[10px] bg-transparent border border-border rounded px-1.5 py-0.5 outline-none focus:border-white/40 text-white/80"
                        />
                      </div>
                      {units
                        .filter((u) => partOf[u.index] === n)
                        .map((u) => (
                          <div key={u.index} className="flex items-center gap-1.5 pl-2">
                            <select
                              value={n}
                              onChange={(e) => moveUnit(u.index, parseInt(e.target.value, 10))}
                              className="shrink-0 text-[10px] rounded border border-border bg-background px-1 py-0.5 outline-none"
                              title="다른 부로 이동"
                            >
                              {PART_COUNTS.filter((p) => p <= numParts).map((p) => (
                                <option key={p} value={p}>
                                  {p}부
                                </option>
                              ))}
                            </select>
                            <span className="text-[11px] text-muted-foreground truncate">
                              {u.index + 1}. {u.topic}
                            </span>
                          </div>
                        ))}
                    </div>
                  ))}
                </div>
              </>
            )}
          </div>
        )}

        {splitError && <span className="text-[11px] text-red-400">{splitError}</span>}
      </div>
    </div>
  )

  return (
    <div className="flex flex-col flex-1 min-h-0">
      {/* 서브탭 네비게이션 + 배경제거 크레딧(인물·배경 공통) */}
      <div className="flex items-center gap-0.5 px-4 pt-3 pb-2">
        {SUB_TABS.map((t) => (
          <button
            key={t.key}
            onClick={() => setSubTab(t.key)}
            className={`text-xs font-semibold px-3 py-1 rounded-md transition-colors ${
              subTab === t.key
                ? "bg-white text-black"
                : "bg-transparent text-muted-foreground hover:text-white hover:bg-white/10"
            }`}
          >
            {t.label}
          </button>
        ))}
        <div className="ml-auto flex items-center gap-2">
          <DevSwitches />
          <RemoveBgCredits />
        </div>
      </div>

      {/* 인물: 자체 스크롤 */}
      <div className={`flex flex-col flex-1 min-h-0 ${subTab !== "person" ? "hidden" : ""}`}>
        <PersonImageTab isConnected={isConnected} worker={worker} />
      </div>

      {/* 배경: 편성 바 + 부별 블록이 하나의 스크롤 영역에 */}
      <div className={`flex-1 min-h-0 overflow-auto ${subTab !== "bg" ? "hidden" : ""}`}>
        {renderPlanner()}
        <BackgroundTab worker={worker} parts={partList} channelId={channelId} />
      </div>
    </div>
  )
}
