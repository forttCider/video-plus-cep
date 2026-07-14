import React, { useState, useEffect } from "react"
import {
  Camera,
  Loader2,
  ImageOff,
  Check,
  Sparkles,
  Download,
  RefreshCw,
  Maximize2,
  Minus,
  Plus,
} from "lucide-react"
import { Button } from "./ui/button"
import ImageLightbox from "./ImageLightbox"
import {
  getPlayheadClips,
  captureFrames,
  regenerateFace,
  scoreFramesVision,
  removeBackground,
  ensureRemoveBg,
  clearResults,
  cleanupLegacy,
  recordImageHistory,
  recordImageDownload,
  loadConfig,
  fileToUrl,
  pickFolder,
  downloadImageTo,
} from "../js/personimage-bridge"
import { useDevSettings } from "../js/devSettings"

/**
 * 인물 이미지 생성 탭 (영상당 1회 · 전체 파트 공통 자산)
 * 경로 A(실제 컷): 찾은 정면 컷을 바로 배경제거 PNG로 다운로드
 * 경로 B(재생성): 참조 3장+ 를 골라 같은 인물의 정면 이미지를 생성 → 최종 인물 확정
 */

const FIND_MIN = 5
const FIND_MAX = 10
const REGEN_MIN = 3
const REGEN_MAX = 8
// 재생성 표정 3종 — 모두 정면·발화 기반, 감정만 다르게. 표정마다 별도 API 호출.
const EXPRESSIONS = [
  {
    key: "talk",
    label: "정면/말하는",
    mouth:
      "입은 자연스럽게 '말하는 듯한 모양'(입을 살짝 벌린 발화 표정)으로, 표정은 편안하고 자연스럽게 할 것.",
  },
  {
    key: "surprise",
    label: "놀라며 말하는",
    mouth:
      "눈을 아주 약간만 크게 뜨고 눈썹을 살짝 올려 '살짝 놀란 듯한' 미묘한 느낌만 줄 것 — 눈을 부릅뜨거나 입을 크게 벌리는 등 과장된 충격 표정은 금지. 입은 자연스럽게 말하는 듯 벌린 발화 표정.",
  },
  {
    key: "serious",
    label: "심각하게 말하는",
    mouth:
      "눈빛은 진지하고 눈썹을 살짝 모아 '심각한' 분위기를 주되, 입은 말하는 듯한 발화 표정으로 할 것(찡그리거나 화난 표정은 아님).",
  },
]

// 로컬 파일 존재 확인 (캐시된 배경제거 파일 유효성)
function fileExists(p) {
  try {
    return !!p && require("fs").existsSync(p)
  } catch (e) {
    return false
  }
}

// 초 → m:ss (캡쳐 위치 표시용, 소스 미디어 기준 시각)
function fmtTime(s) {
  if (typeof s !== "number") return ""
  const m = Math.floor(s / 60)
  const sec = Math.floor(s % 60)
  return `${m}:${String(sec).padStart(2, "0")}`
}

// 라벨 붙은 스테퍼 (맨숫자 셀렉터 대체)
function Stepper({ label, value, min, max, onChange, disabled }) {
  const btn =
    "flex items-center justify-center h-6 w-6 rounded text-muted-foreground hover:text-foreground hover:bg-white/10 disabled:opacity-40 disabled:hover:bg-transparent"
  return (
    <div className="flex items-center gap-1.5">
      {label && <span className="text-[10px] text-muted-foreground">{label}</span>}
      <div className="flex items-center gap-0.5 border border-border rounded-md px-1 py-0.5">
        <button
          onClick={() => onChange(Math.max(min, value - 1))}
          disabled={disabled || value <= min}
          className={btn}
          title="줄이기"
        >
          <Minus className="h-3 w-3" />
        </button>
        <span className="text-xs font-semibold w-6 text-center tabular-nums">{value}</span>
        <button
          onClick={() => onChange(Math.min(max, value + 1))}
          disabled={disabled || value >= max}
          className={btn}
          title="늘리기"
        >
          <Plus className="h-3 w-3" />
        </button>
      </div>
    </div>
  )
}

export default function PersonImageTab({ isConnected, worker }) {
  const { previewMode, simulateEmpty } = useDevSettings()
  const rbgSize = previewMode ? "preview" : "auto"
  const [apiKey, setApiKey] = useState("")
  const [geminiKey, setGeminiKey] = useState("") // 정면 컷 선별(Gemini 비전)
  const [removeBgKey, setRemoveBgKey] = useState("")
  const [count, setCount] = useState(FIND_MIN)
  const [capturing, setCapturing] = useState(false)
  const [error, setError] = useState(null)
  const [frames, setFrames] = useState([]) // [{path, url}]
  const [selected, setSelected] = useState({}) // path -> bool (참조 선택)
  const [usedClip, setUsedClip] = useState(null)
  const [allClips, setAllClips] = useState([]) // 재생헤드 위 트랙별 클립
  const [selectedTrack, setSelectedTrack] = useState(null) // 선택된 trackIndex
  const [loadingTracks, setLoadingTracks] = useState(false)
  const [frameDl, setFrameDl] = useState({}) // path -> {downloading, downloaded}
  const [zoom, setZoom] = useState(null) // {images:[url], index} 확대 보기

  const [removeProps, setRemoveProps] = useState(true) // 마이크/노트북 등 제거
  const [exprCounts, setExprCounts] = useState({ talk: 4, surprise: 0, serious: 0 }) // 표정별 생성 장수
  const [generating, setGenerating] = useState(false)
  const [genError, setGenError] = useState(null)
  const [results, setResults] = useState([]) // [{path, url}]
  const [resultSel, setResultSel] = useState({}) // regenPath -> bool (다운로드 선택)
  const [dlAll, setDlAll] = useState(false)
  const [savedMsg, setSavedMsg] = useState(null)

  useEffect(() => {
    const cfg = loadConfig()
    if (cfg.imageGenApiKey) setApiKey(cfg.imageGenApiKey)
    if (cfg.geminiApiKey) setGeminiKey(cfg.geminiApiKey)
    if (cfg.removeBgApiKey) setRemoveBgKey(cfg.removeBgApiKey)
    cleanupLegacy() // 옛 thumb-frames 캐시 삭제
  }, [])

  // 재생헤드 위 트랙 목록 불러오기 (프레임 추출 없이)
  const loadTracks = async () => {
    setLoadingTracks(true)
    setError(null)
    try {
      const info = await getPlayheadClips()
      if (info && info.success) {
        const clips = info.clips || []
        setAllClips(clips)
        const def = clips.find((c) => c.hasMedia) || clips[0]
        setSelectedTrack(def ? def.trackIndex : null)
        if (!clips.length) setError("재생헤드 위치에 비디오 클립이 없습니다.")
      } else {
        setAllClips([])
        setError((info && info.error) || "트랙 정보를 가져오지 못했습니다")
      }
    } catch (e) {
      setError(e.message || String(e))
    } finally {
      setLoadingTracks(false)
    }
  }

  // 연결되면 트랙 자동 로드
  useEffect(() => {
    if (isConnected) loadTracks()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isConnected])

  const handleCapture = async () => {
    setCapturing(true)
    setError(null)
    setResults([])
    setResultSel({})
    setGenError(null)
    // 스피너가 먼저 그려지도록 한 프레임 양보 (캐시 정리 등 동기 작업 전)
    await new Promise((r) => setTimeout(r, 30))
    try {
      const useFilter = !!geminiKey // Gemini 비전으로 선별 (키 있을 때)
      // 선별 시: 인트로 10 / 중간 20 균등 / 마무리 10 = 40 후보 → 비전으로 상위 count장
      const candCount = useFilter ? 40 : count
      const opts = { count: candCount, zoned: useFilter }
      if (typeof selectedTrack === "number") opts.trackIndex = selectedTrack
      const r = await captureFrames(opts)
      if (r.allClips) setAllClips(r.allClips)
      if (!r.success) {
        setError(r.error || "캡쳐 실패")
        setFrames([])
        return
      }
      let fs = r.frames.map((f) => ({ ...f, url: fileToUrl(f.path) }))

      if (useFilter && fs.length > count) {
        // 후보가 많을 때 한 번에 다 평가하면 정확도가 떨어지므로 배치로 나눠 병렬 평가
        const CHUNK = 12
        const chunks = []
        for (let i = 0; i < fs.length; i += CHUNK) chunks.push(fs.slice(i, i + CHUNK))
        const svs = await Promise.all(
          chunks.map((ch) => scoreFramesVision(ch.map((f) => f.path), { apiKey: geminiKey })),
        )
        const rank = (s) =>
          s ? (s.frontFacing ? 1000 : 0) + (s.talking ? 300 : 0) + (s.score || 0) : -1
        const scored = []
        let anyOk = false
        chunks.forEach((ch, ci) => {
          const sv = svs[ci]
          if (sv && sv.success) anyOk = true
          ch.forEach((f, li) => {
            const s = sv && sv.success ? (sv.scores || []).find((x) => x.index === li) : null
            scored.push({ f, s })
          })
        })
        if (anyOk) {
          scored.sort((a, b) => rank(b.s) - rank(a.s))
          fs = scored.slice(0, count).map((x) => x.f)
        } else {
          fs = fs.slice(0, count)
          setError("AI 선별 실패 — 랜덤 컷으로 표시합니다.")
        }
      }

      setFrames(fs)
      setUsedClip(r.usedClip || null)
      setFrameDl({})
      setSelected({}) // 기본: 미선택 (참조로 쓸 컷만 체크)
    } catch (e) {
      setError(e.message || String(e))
    } finally {
      setCapturing(false)
    }
  }

  const toggleSelect = (path) => setSelected((s) => ({ ...s, [path]: !s[path] }))

  const setDl = (path, patch) =>
    setFrameDl((m) => ({ ...m, [path]: { ...(m[path] || {}), ...patch } }))

  // 경로 A: 이 컷을 바로 사용 — remove.bg 배경제거 → 투명 PNG로 저장
  const handleFrameDownload = async (path) => {
    setError(null)
    // 이미 배경제거한 컷이 있으면 재사용 (재다운로드 시 크레딧 절약). 파일이 없어졌으면 무효.
    const cached = frameDl[path]?.cutPath
    const cachedValid = fileExists(cached)
    // 캐시가 있으면 크레딧 확인 불필요(재호출 안 함)
    let cut = false
    if (removeBgKey && !cachedValid) {
      const gate = await ensureRemoveBg({ apiKey: removeBgKey, forceEmpty: simulateEmpty })
      if (gate.cancelled) return
      cut = !!gate.cut
    }
    setDl(path, { downloading: true })
    try {
      let savePath = cachedValid ? cached : path
      if (removeBgKey && cut && !cachedValid) {
        const rb = await removeBackground(path, {
          apiKey: removeBgKey,
          size: rbgSize,
          type: "person",
        })
        if (rb.success) {
          savePath = rb.path
          setDl(path, { cutPath: rb.path }) // 캐시 저장
        } else {
          setError("배경제거 실패: " + (rb.error || "") + " — 원본으로 저장합니다.")
        }
      } else if (!removeBgKey) {
        setError("remove.bg 키가 없어 배경제거 없이 저장합니다 (config.json removeBgApiKey).")
      }

      // 데이터 수집: 저장 이미지 전송 (실패해도 다운로드는 진행)
      await recordImageDownload({ worker, imagePath: savePath }).catch((e) =>
        console.warn("다운로드 이미지 전송 실패:", e),
      )

      const dir = pickFolder()
      if (!dir) return
      const r = downloadImageTo(savePath, dir)
      if (r.success) {
        setDl(path, { downloaded: true })
        setTimeout(() => setDl(path, { downloaded: false }), 10000)
      } else {
        setError("저장 실패: " + r.error)
      }
    } finally {
      setDl(path, { downloading: false })
    }
  }

  const selectedPaths = frames.filter((f) => selected[f.path]).map((f) => f.path)
  const refCount = selectedPaths.length
  const totalGen = EXPRESSIONS.reduce((a, e) => a + (exprCounts[e.key] || 0), 0)
  const canRegenerate = refCount >= 3 && totalGen >= REGEN_MIN && totalGen <= REGEN_MAX

  // 표정별 장수 변경 — 합계가 REGEN_MAX를 넘지 않도록 캡
  const setExprCount = (key, val) =>
    setExprCounts((prev) => {
      const others = EXPRESSIONS.reduce((a, e) => a + (e.key === key ? 0 : prev[e.key] || 0), 0)
      const capped = Math.max(0, Math.min(val, REGEN_MAX - others))
      return { ...prev, [key]: capped }
    })
  // 표정별 이 스테퍼가 올릴 수 있는 최대값 (합계 ≤ REGEN_MAX)
  const exprMax = (key) => REGEN_MAX - (totalGen - (exprCounts[key] || 0))

  // 표정별 프롬프트 (입·표정 지시만 다르게, 정체성·정면·배경은 공통)
  const buildFacePrompt = (expr) => {
    const propsLine = removeProps
      ? " 마이크·마이크 스탠드·노트북·책상 위 사물·잡다한 배경을 제거하고 인물(얼굴과 상반신)만 남길 것."
      : ""
    return (
      "제공된 참조 이미지들은 모두 동일 인물이다. 이 이미지들을 인물(정체성) 기준으로 삼아, 같은 인물의 정면 인물 컷을 만든다." +
      " [수정] 고개 방향과 눈동자(시선)만 카메라 정면을 똑바로 바라보도록 바꿀 것. 옆을 보거나 시선을 돌리거나 고개를 숙이지 말 것. " +
      expr.mouth +
      " [보존] 이목구비, 얼굴 뼈대·얼굴형, 눈 모양, 코, 피부톤·피부 질감, 나이, 헤어스타일을 그대로 유지하고 인물의 정체성은 절대 바꾸지 말 것." +
      " [금지] 미화·보정·스타일화·만화/애니화 금지. 다른 사람처럼 보이게 하지 말 것. 결과는 반드시 원본과 동일 인물로 인식되어야 한다." +
      propsLine +
      " [배경] 단색 흰색. 사실적인 사진, 왜곡 없음."
    )
  }

  const handleGenerate = async () => {
    if (refCount < 3) {
      setGenError("참조 최소 3장 필요 · 표본이 적으면 외형이 변형될 수 있습니다.")
      return
    }
    const jobs = EXPRESSIONS.filter((e) => (exprCounts[e.key] || 0) > 0)
    if (!jobs.length) {
      setGenError("표정별 생성 장수를 1장 이상 지정하세요.")
      return
    }
    setGenerating(true)
    setGenError(null)
    setResults([])
    setResultSel({})
    setSavedMsg(null)
    clearResults() // 이전 재생성 결과 캐시 정리 (입력 캡쳐는 유지)
    try {
      // 전체 예상 장수만큼 '로딩 자리표시자'를 먼저 띄움 → 진행 상황이 한눈에
      let pid = 0
      const placeholders = []
      jobs.forEach((e) => {
        for (let i = 0; i < (exprCounts[e.key] || 0); i++) {
          placeholders.push({
            regenPath: `__ph_${e.key}_${pid++}`,
            loading: true,
            exprLabel: e.label,
            exprKey: e.key,
          })
        }
      })
      setResults(placeholders)

      const errs = []
      let generated = 0
      // 표정마다 별도 호출 (표정 1종이면 1회) — 완료되는 대로 자리표시자를 교체
      for (const e of jobs) {
        const r = await regenerateFace(selectedPaths, buildFacePrompt(e), {
          apiKey,
          n: exprCounts[e.key],
        })
        if (r && r.success && r.results.length) {
          generated += r.results.length
          setResults((prev) => {
            let ri = 0
            return prev.map((x) => {
              if (x.loading && x.exprKey === e.key) {
                const rr = r.results[ri++]
                if (rr)
                  return {
                    regenPath: rr.path,
                    path: rr.path,
                    url: fileToUrl(rr.path),
                    cut: false,
                    cutting: false,
                    exprLabel: e.label,
                    exprKey: e.key,
                  }
                return { ...x, loading: false, error: "생성 실패" }
              }
              return x
            })
          })
        } else {
          errs.push(`${e.label}: ${(r && r.error) || "실패"}`)
          setResults((prev) =>
            prev.map((x) =>
              x.loading && x.exprKey === e.key
                ? { ...x, loading: false, error: (r && r.error) || "실패" }
                : x,
            ),
          )
        }
      }
      if (!generated) {
        setGenError(errs.join(" / ") || "재생성 실패")
        return
      }
      if (errs.length) setGenError("일부 표정 실패 — " + errs.join(" / "))

      // 데이터 수집: 재생성 이력 기록 (실패해도 결과 표시엔 영향 없음)
      recordImageHistory({ worker, generatedCount: generated }).catch((e) =>
        console.warn("이미지 이력 기록 실패:", e),
      )
    } catch (e) {
      setGenError(e.message || String(e))
    } finally {
      setGenerating(false)
    }
  }

  const toggleResult = (regenPath) =>
    setResultSel((s) => ({ ...s, [regenPath]: !s[regenPath] }))

  // 결과 1장 저장: remove.bg 배경제거 → API 전송 → 지정 폴더에 투명 PNG 저장 (폴더·게이트는 호출부에서 1회)
  const saveResult = async (item, dir, cut) => {
    const regenPath = item.regenPath
    const setCutting = (v) =>
      setResults((rs) =>
        rs.map((x) => (x.regenPath === regenPath ? { ...x, cutting: v } : x)),
      )
    setCutting(true)
    try {
      // 1) 배경제거 (게이트가 cut=true일 때만 · 이미 배경제거된 파일이 있으면 재사용)
      //    화면 표시는 원본(하얀 배경) 그대로 두고, 배경제거 파일은 다운로드에만 사용.
      const hasCache = item.cut && fileExists(item.cutPath)
      let savePath = hasCache ? item.cutPath : item.path
      if (removeBgKey && cut && !hasCache) {
        const rb = await removeBackground(item.regenPath, {
          apiKey: removeBgKey,
          size: rbgSize,
          type: "person",
        })
        if (rb.success) {
          savePath = rb.path
          // 배경제거 파일 경로만 기억(재다운로드 시 재사용) — 표시 이미지(url/path)는 원본 유지
          setResults((rs) =>
            rs.map((x) => (x.regenPath === regenPath ? { ...x, cutPath: rb.path, cut: true } : x)),
          )
        } else {
          setGenError("배경제거 실패: " + (rb.error || "") + " — 원본으로 저장합니다.")
        }
      }

      // 2) 데이터 수집: 배경제거 이미지 전송 (실패해도 다운로드는 진행)
      await recordImageDownload({ worker, imagePath: savePath }).catch((e) =>
        console.warn("다운로드 이미지 전송 실패:", e),
      )

      // 3) 저장
      const r = downloadImageTo(savePath, dir)
      if (r.success) {
        setResults((rs) =>
          rs.map((x) => (x.regenPath === regenPath ? { ...x, downloaded: true } : x)),
        )
        setTimeout(() => {
          setResults((rs) =>
            rs.map((x) => (x.regenPath === regenPath ? { ...x, downloaded: false } : x)),
          )
        }, 10000)
      } else {
        setGenError("저장 실패: " + r.error)
      }
    } finally {
      setCutting(false)
    }
  }

  // 선택한 결과들 일괄 다운로드 — 폴더는 1회만 선택, remove.bg 레이트리밋 대비 순차 저장
  const handleDownloadSelected = async () => {
    const items = results.filter((x) => resultSel[x.regenPath])
    if (!items.length) return
    setGenError(null)
    // 새로 배경제거가 필요한 항목이 있을 때만 잔여 확인(경고). 이미 배경제거된 건 캐시로 다운되므로 게이트 불필요.
    const cachedCount = items.filter((x) => x.cut && fileExists(x.cutPath)).length
    const needsCut = cachedCount < items.length
    let cut = true
    if (!removeBgKey) {
      cut = false
      setGenError("remove.bg 키가 없어 배경제거 없이 저장합니다 (config.json removeBgApiKey).")
    } else if (needsCut) {
      const gate = await ensureRemoveBg({
        apiKey: removeBgKey,
        forceEmpty: simulateEmpty,
        cachedCount,
      })
      if (gate.cancelled) return
      cut = !!gate.cut
    }
    const dir = pickFolder()
    if (!dir) return // 취소
    setDlAll(true)
    try {
      for (const item of items) {
        await saveResult(item, dir, cut)
      }
    } finally {
      setDlAll(false)
    }
  }

  const selResultCount = results.filter((x) => resultSel[x.regenPath]).length
  const doneUrls = results.filter((x) => x.url).map((x) => x.url) // 완료된 결과 URL (자리표시자 제외)
  const doneCount = doneUrls.length

  return (
    <div className="flex flex-col flex-1 min-h-0 overflow-auto p-4 gap-4">
      <div>
        <h2 className="text-sm font-semibold">인물 이미지 생성</h2>
        <p className="text-[11px] text-muted-foreground">
          시퀀스에서 얼굴을 캡처해 원하는 표정으로 재생성합니다.
        </p>
      </div>

      {/* 1) 트랙 선택 + 캡쳐 */}
      <div className="flex flex-col gap-2">
        <div className="flex items-center justify-between">
          <span className="text-[11px] font-semibold text-muted-foreground">
            ① 정면 컷 찾기 (트랙 선택)
          </span>
          <button
            onClick={loadTracks}
            disabled={loadingTracks || !isConnected}
            className="flex items-center gap-1 text-[11px] text-muted-foreground hover:text-foreground"
            title="재생헤드 위 트랙 다시 불러오기 (재생헤드 옮긴 뒤)"
          >
            <RefreshCw className={`h-3 w-3 ${loadingTracks ? "animate-spin" : ""}`} />
            트랙 새로고침
          </button>
        </div>
        {allClips.length > 0 && (
          <div className="flex flex-wrap gap-1">
            {allClips.map((c) => (
              <button
                key={c.trackIndex}
                onClick={() => setSelectedTrack(c.trackIndex)}
                disabled={!c.hasMedia}
                className={`text-[11px] px-2.5 py-1 rounded-md border transition-colors ${
                  selectedTrack === c.trackIndex
                    ? "border-white bg-white/10 text-foreground"
                    : "border-border text-muted-foreground hover:bg-white/5"
                } ${!c.hasMedia ? "opacity-50 cursor-not-allowed" : ""}`}
                title={c.hasMedia ? c.clipName || "" : "미디어 없음"}
              >
                {c.trackLabel}
                {!c.hasMedia && " (미디어 없음)"}
              </button>
            ))}
          </div>
        )}
        <div className="flex items-center gap-2">
          <Button
            size="sm"
            onClick={() => handleCapture()}
            disabled={capturing || !isConnected || selectedTrack === null}
            className="flex-1"
          >
            {capturing ? (
              <Loader2 className="h-4 w-4 mr-1.5 animate-spin" />
            ) : (
              <Camera className="h-4 w-4 mr-1.5" />
            )}
            정면 컷 {count}장 찾기
          </Button>
          <Stepper
            label="찾을 장수"
            value={count}
            min={FIND_MIN}
            max={FIND_MAX}
            onChange={setCount}
            disabled={capturing}
          />
        </div>
        <p className="text-[10px] text-muted-foreground">
          {geminiKey
            ? "AI가 영상 전체(인트로·중간·마무리)에서 정면으로 말하는 컷을 찾아줍니다."
            : "Gemini 키가 없어 랜덤 캡쳐로 동작합니다 (config.json geminiApiKey)."}
        </p>
        {!isConnected && (
          <div className="text-[11px] text-muted-foreground">
            시퀀스가 연결되어야 캡쳐할 수 있습니다.
          </div>
        )}
        {error && (
          <div className="flex items-start gap-2 text-xs text-red-400 border border-red-900/40 bg-red-950/30 rounded-md px-3 py-2">
            <ImageOff className="h-4 w-4 mt-0.5 shrink-0" />
            <span className="break-words">{error}</span>
          </div>
        )}
      </div>

      {/* 찾은 컷 그리드 (참조 선택 · 직접 다운로드) */}
      {frames.length > 0 && (
        <div className="flex flex-col gap-1.5">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-semibold text-muted-foreground">찾은 정면 컷</span>
            <span
              className={`text-[10px] px-1.5 py-0.5 rounded-md ${
                refCount > 0
                  ? "bg-blue-950/40 border border-blue-900/50 text-blue-300"
                  : "text-muted-foreground"
              }`}
            >
              참조 {refCount}장 선택됨
            </span>
          </div>
          <p className="text-[10px] text-muted-foreground">
            쓸 만하면 바로 <b>다운로드</b>, 마땅치 않으면 <b>참조</b>로 골라 아래에서 재생성하세요.
          </p>
          <div className="grid grid-cols-3 gap-2">
            {frames.map((f, i) => {
              const dl = frameDl[f.path] || {}
              const isRef = !!selected[f.path]
              return (
                <div key={f.path} className="flex flex-col gap-1">
                  <div
                    className={`relative rounded-md overflow-hidden border-2 transition-colors ${
                      isRef ? "border-blue-500" : "border-border"
                    }`}
                  >
                    <img
                      src={f.url}
                      alt="capture"
                      onClick={() => toggleSelect(f.path)}
                      className="w-full h-auto block cursor-pointer"
                      title="클릭하여 참조 선택/해제"
                    />
                    {/* 확대 */}
                    <button
                      onClick={() => setZoom({ images: frames.map((x) => x.url), index: i })}
                      title="크게 보기"
                      className="absolute top-1 left-1 rounded p-0.5 bg-black/70 text-white hover:bg-black/90"
                    >
                      <Maximize2 className="h-3 w-3" />
                    </button>
                    <span className="absolute bottom-0 inset-x-0 bg-black/60 text-white text-[10px] px-1 py-0.5 text-center">
                      {fmtTime(
                        typeof f.timelineTimeSeconds === "number"
                          ? f.timelineTimeSeconds
                          : f.sourceTimeSeconds,
                      )}
                    </span>
                  </div>
                  {/* 타일 하단: 참조 | 다운로드 2분할 (컷의 이중 역할 구분) */}
                  <div className="grid grid-cols-2 gap-1">
                    <button
                      onClick={() => toggleSelect(f.path)}
                      className={`flex items-center justify-center gap-1 h-7 rounded-md text-[11px] font-semibold border transition-colors ${
                        isRef
                          ? "bg-blue-500 border-blue-500 text-white"
                          : "border-border text-muted-foreground hover:bg-white/5"
                      }`}
                      title="재생성 참조로 선택/해제"
                    >
                      {isRef ? <Check className="h-3.5 w-3.5" /> : null}
                      참조
                    </button>
                    <button
                      onClick={() => handleFrameDownload(f.path)}
                      disabled={dl.downloading}
                      className={`flex items-center justify-center gap-1 h-7 rounded-md text-[11px] font-semibold border border-border transition-colors hover:bg-white/5 disabled:opacity-60 ${
                        dl.downloaded ? "text-green-400" : "text-muted-foreground"
                      }`}
                      title="이 컷을 배경제거(투명 PNG)로 저장"
                    >
                      {dl.downloading ? (
                        <Loader2 className="h-3.5 w-3.5 animate-spin" />
                      ) : dl.downloaded ? (
                        <>
                          <Check className="h-3.5 w-3.5" />
                          완료!
                        </>
                      ) : (
                        <>
                          <Download className="h-3.5 w-3.5" />
                          다운로드
                        </>
                      )}
                    </button>
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      )}

      {/* 2) 재생성 (accent 배경 — 위 참조 N장 의존을 시각화) */}
      {frames.length > 0 && (
        <div className="flex flex-col gap-2 rounded-md border border-blue-900/50 bg-blue-950/20 p-3">
          <div className="flex items-center gap-1.5">
            <Sparkles className="h-3.5 w-3.5 text-blue-300" />
            <span className="text-[11px] font-semibold text-blue-200">
              ② 정면으로 재생성 (정면 컷이 마땅치 않을 때)
            </span>
            <span className="ml-auto text-[10px] text-muted-foreground px-1.5 py-0.5 rounded border border-border">
              ChatGPT
            </span>
          </div>
          <p className="text-[10px] text-muted-foreground">
            위에서 선택한 참조 <b>{refCount}장</b>으로 같은 인물의 정면 이미지를 생성합니다. (표정·생김새 유지)
          </p>
          <label className="flex items-center gap-1.5 text-[11px] text-muted-foreground cursor-pointer">
            <input
              type="checkbox"
              checked={removeProps}
              onChange={(e) => setRemoveProps(e.target.checked)}
            />
            주변 사물 제거 (마이크/노트북 등) — 인물만 남기기
          </label>
          {/* 표정별 생성 장수 (합계 3~8) */}
          <div className="flex flex-col gap-1.5">
            <div className="flex items-center justify-between">
              <span className="text-[11px] text-muted-foreground">
                표정별 생성 장수 ({REGEN_MIN}~{REGEN_MAX}장)
              </span>
              <span className="flex items-baseline gap-1 px-2 py-0.5 rounded-md border border-border bg-white/5">
                <span className="text-[10px] text-muted-foreground">합계</span>
                <b
                  className={`text-base tabular-nums leading-none ${
                    totalGen < REGEN_MIN || totalGen > REGEN_MAX ? "text-amber-400" : "text-foreground"
                  }`}
                >
                  {totalGen}
                </b>
                <span className="text-[10px] text-muted-foreground">/ {REGEN_MAX}장</span>
              </span>
            </div>
            {EXPRESSIONS.map((e) => (
              <div key={e.key} className="flex items-center justify-between">
                <span className="text-[11px] text-muted-foreground">{e.label}</span>
                <Stepper
                  value={exprCounts[e.key] || 0}
                  min={0}
                  max={exprMax(e.key)}
                  onChange={(v) => setExprCount(e.key, v)}
                  disabled={generating}
                />
              </div>
            ))}
          </div>
          <Button
            size="sm"
            onClick={handleGenerate}
            disabled={generating || !apiKey || !canRegenerate}
          >
            {generating ? (
              <Loader2 className="h-4 w-4 mr-1.5 animate-spin" />
            ) : (
              <Sparkles className="h-4 w-4 mr-1.5" />
            )}
            참조 {refCount}장 → {totalGen}장 재생성
          </Button>
          {refCount < 3 && (
            <p className="text-[10px] text-amber-400">
              참조 최소 3장 필요 · 표본이 적으면 외형이 변형될 수 있습니다 (현재 {refCount}장).
            </p>
          )}
          {refCount >= 3 && totalGen < REGEN_MIN && (
            <p className="text-[10px] text-amber-400">
              표정별 생성 장수를 합계 {REGEN_MIN}장 이상 지정하세요 (현재 {totalGen}장).
            </p>
          )}
          {!apiKey && (
            <div className="text-[11px] text-amber-400">
              ChatGPT 이미지 키가 없습니다 (config.json imageGenApiKey).
            </div>
          )}
          {genError && (
            <div className="flex items-start gap-2 text-xs text-red-400 border border-red-900/40 bg-red-950/30 rounded-md px-3 py-2">
              <ImageOff className="h-4 w-4 mt-0.5 shrink-0" />
              <span className="break-words">{genError}</span>
            </div>
          )}
        </div>
      )}

      {/* 3) 결과 · 선택 다운로드 */}
      {results.length > 0 && (
        <div className="flex flex-col gap-2 pt-1 border-t border-border">
          <div className="flex items-center justify-between gap-2">
            <span className="text-[11px] font-semibold text-muted-foreground">
              ③ 결과 · 투명 PNG(배경제거)로 저장 ({doneCount}/{results.length})
              {generating && <span className="ml-1 text-blue-300">생성 중…</span>}
            </span>
            <Button
              size="sm"
              onClick={handleDownloadSelected}
              disabled={dlAll || !selResultCount}
              title="선택한 인물들을 배경제거(투명 PNG)로 저장"
            >
              {dlAll ? (
                <Loader2 className="h-4 w-4 mr-1.5 animate-spin" />
              ) : (
                <Download className="h-4 w-4 mr-1.5" />
              )}
              선택 다운로드{selResultCount ? ` (${selResultCount})` : ""}
            </Button>
          </div>
          <p className="text-[10px] text-muted-foreground">
            저장할 인물을 <b>여러 장 선택</b>한 뒤 다운로드하세요. 다운로드 시 배경을 제거한 투명 PNG로 저장됩니다.
          </p>
          {savedMsg && <span className="text-[11px] text-green-400 break-all">{savedMsg}</span>}
          <div className="grid grid-cols-4 gap-2">
            {results.map((r, i) => {
              const isSel = !!resultSel[r.regenPath]
              return (
                <div key={r.regenPath} className="flex flex-col gap-1">
                  <div
                    className={`relative rounded-md overflow-hidden border-2 aspect-square bg-neutral-900 transition-colors ${
                      isSel ? "border-blue-500" : "border-border"
                    }`}
                  >
                    {r.loading ? (
                      <div className="absolute inset-0 flex flex-col items-center justify-center gap-1 text-muted-foreground">
                        <Loader2 className="h-5 w-5 animate-spin" />
                        <span className="text-[10px]">생성 중…</span>
                        {r.exprLabel && (
                          <span className="text-[9px] text-muted-foreground/70">{r.exprLabel}</span>
                        )}
                      </div>
                    ) : r.error ? (
                      <div className="absolute inset-0 flex flex-col items-center justify-center gap-1 px-2 text-center text-red-400">
                        <ImageOff className="h-5 w-5" />
                        <span className="text-[9px] break-words line-clamp-2">{r.error}</span>
                        {r.exprLabel && (
                          <span className="text-[9px] text-muted-foreground/70">{r.exprLabel}</span>
                        )}
                      </div>
                    ) : (
                      <>
                        <img
                          src={r.url}
                          alt="result"
                          onClick={() => toggleResult(r.regenPath)}
                          className="w-full h-full object-cover block cursor-pointer"
                          title="클릭하여 다운로드 선택/해제"
                        />
                        <button
                          onClick={() => setZoom({ images: doneUrls, index: doneUrls.indexOf(r.url) })}
                          title="크게 보기"
                          className="absolute top-1 left-1 rounded p-0.5 bg-black/70 text-white hover:bg-black/90"
                        >
                          <Maximize2 className="h-3 w-3" />
                        </button>
                        {isSel && (
                          <span className="absolute top-1 right-1 bg-blue-500 text-white rounded-full p-0.5">
                            <Check className="h-3 w-3" />
                          </span>
                        )}
                        {r.exprLabel && (
                          <span className="absolute bottom-1 left-1 bg-black/70 text-white text-[9px] px-1 py-0.5 rounded">
                            {r.exprLabel}
                          </span>
                        )}
                        {r.downloaded && (
                          <span className="absolute bottom-1 right-1 flex items-center gap-1 bg-black/70 text-green-400 text-[10px] px-1.5 py-0.5 rounded">
                            <Check className="h-3 w-3" />
                            완료
                          </span>
                        )}
                        {r.cutting && (
                          <div className="absolute inset-0 flex items-center justify-center bg-black/40">
                            <Loader2 className="h-5 w-5 animate-spin text-white" />
                          </div>
                        )}
                      </>
                    )}
                  </div>
                  {!r.loading && !r.error && (
                    <button
                      onClick={() => toggleResult(r.regenPath)}
                      className={`flex items-center justify-center gap-1 h-7 rounded-md text-[11px] font-semibold border transition-colors ${
                        isSel
                          ? "bg-blue-500 border-blue-500 text-white"
                          : "border-border text-muted-foreground hover:bg-white/5"
                      }`}
                      title="다운로드 선택/해제"
                    >
                      {isSel ? (
                        <>
                          <Check className="h-3.5 w-3.5" />
                          선택됨
                        </>
                      ) : (
                        "선택"
                      )}
                    </button>
                  )}
                </div>
              )
            })}
          </div>
        </div>
      )}

      <ImageLightbox
        images={zoom?.images}
        index={zoom ? zoom.index : null}
        onClose={() => setZoom(null)}
        onIndex={(i) => setZoom((z) => ({ ...z, index: i }))}
      />
    </div>
  )
}
