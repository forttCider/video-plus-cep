import { useEffect, useRef, useState } from "react"
import { Play, RefreshCw } from "lucide-react"
import { Button } from "./ui/button"
import { renderPreview } from "../js/cep-bridge"

/**
 * 컷편집 미리보기 패널
 * 사용자가 버튼 누르면 저해상도 렌더링 후 컷 구간 skip 재생
 */
export default function PreviewPanel({ sentences, selectedWordIds, addLog }) {
  const [state, setState] = useState("idle") // idle | rendering | ready | error
  const [videoPath, setVideoPath] = useState(null)
  const [error, setError] = useState(null)
  const videoRef = useRef(null)

  // 삭제 예정 + 이미 삭제된 단어들의 시간 범위 (ms)
  const deletedRanges = []
  sentences?.forEach((s) => {
    s.words?.forEach((w) => {
      if (w.start_at == null || w.end_at == null) return
      const wid = w.id || w.start_at
      const willBeDeleted = w.is_deleted || selectedWordIds?.has(wid)
      if (willBeDeleted) {
        deletedRanges.push([w.start_at, w.end_at])
      }
    })
  })

  // timeupdate에서 컷 구간 skip
  const handleTimeUpdate = () => {
    const v = videoRef.current
    if (!v) return
    const t = v.currentTime * 1000
    const cut = deletedRanges.find(([s, e]) => t >= s && t < e)
    if (cut) v.currentTime = cut[1] / 1000
  }

  const handleGenerate = async () => {
    setState("rendering")
    setError(null)
    try {
      addLog && addLog("info", "프리뷰 렌더링 시작...")
      const result = await renderPreview()
      if (result?.success && result.outputPath) {
        setVideoPath(result.outputPath)
        setState("ready")
        addLog && addLog("info", "프리뷰 렌더링 완료: " + result.outputPath)
      } else {
        throw new Error(result?.error || "렌더링 실패")
      }
    } catch (e) {
      setError(e.message)
      setState("error")
      addLog && addLog("warn", "프리뷰 렌더링 실패: " + e.message)
    }
  }

  // videoPath 변경 시 video 엘리먼트에 src 적용
  useEffect(() => {
    if (state === "ready" && videoPath && videoRef.current) {
      videoRef.current.src = `file://${videoPath}`
    }
  }, [state, videoPath])

  return (
    <div
      className="w-full bg-black flex items-center justify-center"
      style={{ aspectRatio: "16/9", minHeight: 120 }}
    >
      {state === "idle" && (
        <Button size="sm" onClick={handleGenerate} className="gap-1.5">
          <Play className="h-3.5 w-3.5" />
          미리보기 생성하기
        </Button>
      )}
      {state === "rendering" && (
        <div className="flex flex-col items-center gap-2 text-muted-foreground">
          <RefreshCw className="h-5 w-5 animate-spin" />
          <span className="text-xs">렌더링 중...</span>
        </div>
      )}
      {state === "error" && (
        <div className="flex flex-col items-center gap-2 px-4 text-center">
          <span className="text-xs text-red-400">{error}</span>
          <Button size="sm" variant="outline" onClick={handleGenerate}>
            다시 시도
          </Button>
        </div>
      )}
      {state === "ready" && (
        <video
          ref={videoRef}
          controls
          onTimeUpdate={handleTimeUpdate}
          className="w-full h-full"
        />
      )}
    </div>
  )
}
