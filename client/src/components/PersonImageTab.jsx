import React, { useState, useEffect } from "react"
import {
  Camera,
  Loader2,
  ImageOff,
  Grid2x2,
  Check,
  Sparkles,
  Download,
  RefreshCw,
} from "lucide-react"
import { Button } from "./ui/button"
import {
  getPlayheadClips,
  captureFrames,
  regenerateFace,
  removeBackground,
  clearResults,
  cleanupLegacy,
  recordImageHistory,
  recordImageDownload,
  loadConfig,
  fileToUrl,
  pickFolder,
  downloadImageTo,
} from "../js/personimage-bridge"

/**
 * 인물 이미지 생성 탭
 * 1) 시퀀스에서 얼굴 프레임 3~5장 캡쳐
 * 2) 프롬프트(예: "환희에 찬 얼굴로 바꿔줘")로 AI 재생성
 * 3) 결과 다운로드
 */

const COUNT_OPTIONS = [3, 4, 5]
const N_OPTIONS = [1, 2, 3]
// 투명 결과를 보여줄 체커보드
const CHECKER_STYLE = {
  backgroundImage:
    "linear-gradient(45deg, #2a2a2a 25%, transparent 25%), linear-gradient(-45deg, #2a2a2a 25%, transparent 25%), linear-gradient(45deg, transparent 75%, #2a2a2a 75%), linear-gradient(-45deg, transparent 75%, #2a2a2a 75%)",
  backgroundSize: "16px 16px",
  backgroundPosition: "0 0, 0 8px, 8px -8px, -8px 0px",
  backgroundColor: "#3a3a3a",
}

// 초 → m:ss (캡쳐 위치 표시용, 소스 미디어 기준 시각)
function fmtTime(s) {
  if (typeof s !== "number") return ""
  const m = Math.floor(s / 60)
  const sec = Math.floor(s % 60)
  return `${m}:${String(sec).padStart(2, "0")}`
}

const PROMPT_PRESETS = [
  "환희에 찬 표정",
  "놀란 표정",
  "진지하고 강렬한 표정",
  "활짝 웃는 표정",
  "충격받은 표정",
]

export default function PersonImageTab({ isConnected, worker }) {
  const [apiKey, setApiKey] = useState("")
  const [removeBgKey, setRemoveBgKey] = useState("")
  const [count, setCount] = useState(4)
  const [capturing, setCapturing] = useState(false)
  const [error, setError] = useState(null)
  const [frames, setFrames] = useState([]) // [{path, url}]
  const [selected, setSelected] = useState({}) // path -> bool
  const [usedClip, setUsedClip] = useState(null)
  const [allClips, setAllClips] = useState([]) // 재생헤드 위 트랙별 클립
  const [selectedTrack, setSelectedTrack] = useState(null) // 선택된 trackIndex
  const [loadingTracks, setLoadingTracks] = useState(false)

  const [prompt, setPrompt] = useState("")
  const [removeProps, setRemoveProps] = useState(true) // 마이크/노트북 등 제거
  const [n, setN] = useState(2)
  const [generating, setGenerating] = useState(false)
  const [genError, setGenError] = useState(null)
  const [results, setResults] = useState([]) // [{path, url}]
  const [savedMsg, setSavedMsg] = useState(null)

  useEffect(() => {
    const cfg = loadConfig()
    if (cfg.imageGenApiKey) setApiKey(cfg.imageGenApiKey)
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
    setGenError(null)
    try {
      const opts = { count }
      if (typeof selectedTrack === "number") opts.trackIndex = selectedTrack
      const r = await captureFrames(opts)
      if (r.allClips) setAllClips(r.allClips)
      if (r.success) {
        const fs = r.frames.map((f) => ({ ...f, url: fileToUrl(f.path) }))
        setFrames(fs)
        setUsedClip(r.usedClip || null)
        // 기본: 전체 선택
        const sel = {}
        fs.forEach((f) => (sel[f.path] = true))
        setSelected(sel)
      } else {
        setError(r.error || "캡쳐 실패")
        setFrames([])
      }
    } catch (e) {
      setError(e.message || String(e))
    } finally {
      setCapturing(false)
    }
  }

  const toggleSelect = (path) =>
    setSelected((s) => ({ ...s, [path]: !s[path] }))

  const selectedPaths = frames.filter((f) => selected[f.path]).map((f) => f.path)

  const handleGenerate = async () => {
    setGenerating(true)
    setGenError(null)
    setResults([])
    setSavedMsg(null)
    clearResults() // 이전 재생성 결과 캐시 정리 (입력 캡쳐는 유지)
    try {
      const cleanup =
        " 마이크, 마이크 암(스탠드), 노트북, 책상 위 사물과 잡다한 배경을 모두 제거하고 인물(얼굴과 상반신)만 깔끔하게 남겨줘. 인물의 생김새는 그대로 유지. 유튜브 썸네일에 쓸 인물 컷."
      let base = prompt.trim()
      if (removeProps) base += cleanup
      base +=
        " 인물만 또렷하게. 배경은 투명 표시용 회색/검정 체커보드(격자) 무늬로 균일하게 채워줘 (포토샵 투명 배경 격자처럼)."

      // 정면/측면 두 포즈로 각각 n장 생성
      const expr = prompt.trim()
      const POSES = [
        {
          label: "정면",
          hint: ` 정면(카메라를 똑바로 바라보는 얼굴). 표정은 "${expr}" 그대로 강하게 유지.`,
        },
        {
          label: "측면",
          hint: ` 측면(고개를 옆으로 살짝 돌린 옆모습). 단 각도만 바꾸고 표정은 "${expr}" 그대로 강하게 유지할 것 — 무표정/중립으로 바꾸지 말 것.`,
        },
      ]
      const all = []
      const errs = []
      for (const p of POSES) {
        const r = await regenerateFace(selectedPaths, base + p.hint, { apiKey, n })
        if (r.success) {
          r.results.forEach((x) =>
            all.push({
              regenPath: x.path,
              path: x.path,
              url: fileToUrl(x.path),
              cut: false,
              cutting: false,
              pose: p.label,
            }),
          )
        } else {
          errs.push(`${p.label}: ${r.error}`)
        }
      }
      if (!all.length) {
        setGenError(errs.join(" / ") || "재생성 실패")
        return
      }
      if (errs.length) setGenError(errs.join(" / "))
      setResults(all)

      // 데이터 수집: 재생성 이력 기록 (실패해도 결과 표시엔 영향 없음)
      recordImageHistory({ worker, generatedCount: all.length }).catch((e) =>
        console.warn("이미지 이력 기록 실패:", e),
      )
    } catch (e) {
      setGenError(e.message || String(e))
    } finally {
      setGenerating(false)
    }
  }

  // 다운로드: remove.bg 누끼 → API 전송 → 폴더 선택 → 투명 PNG 저장
  const handleDownload = async (regenPath) => {
    const item = results.find((x) => x.regenPath === regenPath)
    if (!item) return
    setGenError(null)

    // 위치 선택 완료 + 저장까지 로딩 유지 (cutting = 진행 중 표시)
    const setCutting = (v) =>
      setResults((rs) =>
        rs.map((x) => (x.regenPath === regenPath ? { ...x, cutting: v } : x)),
      )
    setCutting(true)

    try {
      // 1) 누끼
      let savePath = item.path
      if (removeBgKey && !item.cut) {
        const rb = await removeBackground(item.regenPath, { apiKey: removeBgKey, size: "preview" })
        if (rb.success) {
          savePath = rb.path
          setResults((rs) =>
            rs.map((x) =>
              x.regenPath === regenPath
                ? { ...x, path: rb.path, url: fileToUrl(rb.path), cut: true }
                : x,
            ),
          )
        } else {
          setGenError("누끼 실패: " + (rb.error || "") + " — 원본으로 저장합니다.")
        }
      } else if (!removeBgKey) {
        setGenError("remove.bg 키가 없어 누끼 없이 저장합니다 (config.json removeBgApiKey).")
      } else if (item.cut) {
        savePath = item.path // 이미 누끼됨
      }

      // 2) 데이터 수집: 누끼 이미지 전송 (실패해도 다운로드는 진행)
      await recordImageDownload({ worker, imagePath: savePath }).catch((e) =>
        console.warn("다운로드 이미지 전송 실패:", e),
      )

      // 3) 폴더 선택 (로딩 유지 상태에서 다이얼로그 표시)
      const dir = pickFolder()
      if (!dir) return // 취소

      // 4) 저장
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

  return (
    <div className="flex flex-col flex-1 min-h-0 overflow-auto p-4 gap-4">
      <div>
        <h2 className="text-sm font-semibold">인물 이미지 생성</h2>
        <p className="text-[11px] text-muted-foreground">
          시퀀스에서 얼굴을 캡쳐해 원하는 표정으로 재생성합니다.
        </p>
      </div>

      {/* 1) 트랙 선택 + 캡쳐 */}
      <div className="flex flex-col gap-2">
        <div className="flex items-center justify-between">
          <span className="text-[11px] font-semibold text-muted-foreground">
            ① 트랙 선택 후 캡쳐
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
            {count}장 캡쳐
          </Button>
          <div className="flex items-center gap-0.5">
            {COUNT_OPTIONS.map((c) => (
              <button
                key={c}
                onClick={() => setCount(c)}
                disabled={capturing}
                className={`text-xs font-semibold w-7 h-7 rounded-md transition-colors ${
                  count === c
                    ? "bg-white text-black"
                    : "bg-transparent text-muted-foreground hover:bg-white/10"
                }`}
              >
                {c}
              </button>
            ))}
          </div>
        </div>
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

      {/* 캡쳐 결과 (참조 선택) */}
      {frames.length > 0 && (
        <div className="flex flex-col gap-1.5">
          <div className="text-[11px] font-semibold text-muted-foreground">
            참조로 쓸 캡쳐 선택 ({selectedPaths.length}/{frames.length})
          </div>
          <div className="grid grid-cols-3 gap-1.5">
            {frames.map((f) => (
              <button
                key={f.path}
                onClick={() => toggleSelect(f.path)}
                className={`relative rounded-md overflow-hidden border transition-colors ${
                  selected[f.path]
                    ? "border-white ring-1 ring-white"
                    : "border-border opacity-60 hover:opacity-100"
                }`}
              >
                <img src={f.url} alt="capture" className="w-full h-auto block" />
                {selected[f.path] && (
                  <span className="absolute top-1 right-1 bg-white text-black rounded-full p-0.5">
                    <Check className="h-3 w-3" />
                  </span>
                )}
                <span className="absolute bottom-0 inset-x-0 bg-black/60 text-white text-[10px] px-1 py-0.5 text-center">
                  {fmtTime(
                    typeof f.timelineTimeSeconds === "number"
                      ? f.timelineTimeSeconds
                      : f.sourceTimeSeconds,
                  )}
                </span>
              </button>
            ))}
          </div>
        </div>
      )}

      {/* 2) 재생성 */}
      {frames.length > 0 && (
        <div className="flex flex-col gap-2 pt-1 border-t border-border">
          <span className="text-[11px] font-semibold text-muted-foreground">
            ② 표정 재생성
          </span>
          <textarea
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
            placeholder='원하는 표정/연출 (예: "환희에 찬 얼굴로 바꿔줘")'
            rows={2}
            className="w-full text-xs bg-transparent border border-border rounded-md px-2 py-1.5 outline-none focus:border-white/40 resize-y"
          />
          <div className="flex flex-wrap gap-1">
            {PROMPT_PRESETS.map((p) => (
              <button
                key={p}
                onClick={() => setPrompt(p)}
                className="text-[10px] px-2 py-0.5 rounded-md border border-border text-muted-foreground hover:bg-white/5"
              >
                {p}
              </button>
            ))}
          </div>
          <label className="flex items-center gap-1.5 text-[11px] text-muted-foreground cursor-pointer">
            <input
              type="checkbox"
              checked={removeProps}
              onChange={(e) => setRemoveProps(e.target.checked)}
            />
            주변 사물 제거 (마이크/노트북 등) — 인물만 남기기
          </label>
          <div className="flex items-center gap-2">
            <Button
              size="sm"
              onClick={handleGenerate}
              disabled={generating || !apiKey || !selectedPaths.length || !prompt.trim()}
              className="flex-1"
            >
              {generating ? (
                <Loader2 className="h-4 w-4 mr-1.5 animate-spin" />
              ) : (
                <Sparkles className="h-4 w-4 mr-1.5" />
              )}
              재생성
            </Button>
            <div className="flex items-center gap-0.5" title="포즈별 장수 (정면/측면 각각)">
              {N_OPTIONS.map((v) => (
                <button
                  key={v}
                  onClick={() => setN(v)}
                  disabled={generating}
                  className={`text-xs font-semibold w-7 h-7 rounded-md transition-colors ${
                    n === v
                      ? "bg-white text-black"
                      : "bg-transparent text-muted-foreground hover:bg-white/10"
                  }`}
                >
                  {v}
                </button>
              ))}
            </div>
          </div>
          {!apiKey && (
            <div className="text-[11px] text-amber-400">
              이미지 생성 API 키가 설정되지 않았습니다 (config.json imageGenApiKey).
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

      {/* 3) 결과 + 다운로드 */}
      {results.length > 0 && (
        <div className="flex flex-col gap-2 pt-1 border-t border-border">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-semibold text-muted-foreground">
              ③ 결과 ({results.length})
            </span>
          </div>
          {savedMsg && (
            <span className="text-[11px] text-green-400 break-all">{savedMsg}</span>
          )}
          <div className="grid grid-cols-2 gap-2">
            {results.map((r) => (
              <div key={r.regenPath} className="flex flex-col gap-1">
                <div
                  className="relative rounded-md overflow-hidden border border-border"
                  style={CHECKER_STYLE}
                >
                  <img src={r.url} alt="result" className="w-full h-auto block" />
                  {r.pose && (
                    <span className="absolute top-1 left-1 bg-black/70 text-white text-[10px] px-1.5 py-0.5 rounded">
                      {r.pose}
                    </span>
                  )}
                </div>
                <Button
                  size="sm"
                  variant="secondary"
                  onClick={() => handleDownload(r.regenPath)}
                  disabled={r.cutting || r.downloaded}
                  title="누끼 처리 후 투명 PNG로 저장"
                  className={r.downloaded ? "text-green-400" : ""}
                >
                  {r.cutting ? (
                    <>
                      <Loader2 className="h-4 w-4 mr-1.5 animate-spin" />
                      다운로드
                    </>
                  ) : r.downloaded ? (
                    <>
                      <Check className="h-4 w-4 mr-1.5" />
                      다운로드 완료!
                    </>
                  ) : (
                    <>
                      <Download className="h-4 w-4 mr-1.5" />
                      다운로드
                    </>
                  )}
                </Button>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
