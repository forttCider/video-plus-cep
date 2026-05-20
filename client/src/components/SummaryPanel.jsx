import { useEffect, useMemo, useRef } from "react"
import { RefreshCw, Play, AlertCircle } from "lucide-react"

// 텍스트를 검색어 기준 segment로 쪼개고 globalIdx 기반 하이라이트 span 반환
function renderTextWithHighlight(text, query, caseSensitive, startIdx, currentIdx, refMap) {
  if (!query || !text) return text
  const segs = []
  const hay = caseSensitive ? text : text.toLowerCase()
  const needle = caseSensitive ? query : query.toLowerCase()
  let i = 0
  let matchIdx = startIdx
  while (i < text.length) {
    const idx = hay.indexOf(needle, i)
    if (idx === -1) {
      if (i < text.length) segs.push(<span key={`t-${i}`}>{text.slice(i)}</span>)
      break
    }
    if (idx > i) segs.push(<span key={`t-${i}`}>{text.slice(i, idx)}</span>)
    const thisIdx = matchIdx
    segs.push(
      <span
        key={`m-${thisIdx}`}
        ref={(el) => {
          if (el) refMap.set(thisIdx, el)
          else refMap.delete(thisIdx)
        }}
        className={
          thisIdx === currentIdx
            ? "word-search-current-char"
            : "word-search-match-char"
        }
      >
        {text.slice(idx, idx + needle.length)}
      </span>,
    )
    matchIdx += 1
    i = idx + needle.length
  }
  return segs
}

function countMatches(text, query, caseSensitive) {
  if (!query || !text) return 0
  const hay = caseSensitive ? text : text.toLowerCase()
  const needle = caseSensitive ? query : query.toLowerCase()
  let count = 0
  let i = 0
  while ((i = hay.indexOf(needle, i)) !== -1) {
    count += 1
    i += needle.length
  }
  return count
}

export default function SummaryPanel({
  summary,
  loading,
  error,
  onRetry,
  onSeek,
  searchQuery = "",
  searchCaseSensitive = false,
  currentMatchIdx = -1,
  onMatchCountChange,
}) {
  const matchRefMap = useRef(new Map())

  const segments = summary?.data?.segments || summary?.segments || []
  const overallRaw = summary?.data?.overall_summary ?? summary?.overall_summary
  const overallLines = Array.isArray(overallRaw)
    ? overallRaw.filter(Boolean)
    : typeof overallRaw === "string"
      ? overallRaw.split(/\r?\n/).map((l) => l.trim()).filter(Boolean)
      : []

  // 모든 텍스트 조각 순서대로 수집 (렌더 순서와 동일하게 globalIdx 부여)
  const totalMatchCount = useMemo(() => {
    if (!searchQuery) return 0
    let n = 0
    for (const line of overallLines) n += countMatches(line, searchQuery, searchCaseSensitive)
    for (const seg of segments) {
      n += countMatches(seg.topic || "", searchQuery, searchCaseSensitive)
      if (seg.subtopics) {
        for (const sub of seg.subtopics) {
          n += countMatches(sub.title || "", searchQuery, searchCaseSensitive)
          if (sub.points) {
            for (const p of sub.points) {
              n += countMatches(p, searchQuery, searchCaseSensitive)
            }
          }
        }
      }
    }
    return n
  }, [searchQuery, searchCaseSensitive, overallLines, segments])

  useEffect(() => {
    onMatchCountChange?.(totalMatchCount)
  }, [totalMatchCount, onMatchCountChange])

  // currentMatchIdx 변경 시 해당 span으로 스크롤
  useEffect(() => {
    if (currentMatchIdx < 0) return
    const el = matchRefMap.current.get(currentMatchIdx)
    if (el && el.scrollIntoView) {
      el.scrollIntoView({ block: "center" })
    }
  }, [currentMatchIdx])

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center py-8">
        <RefreshCw className="h-5 w-5 animate-spin text-muted-foreground mb-2" />
        <span className="text-sm text-muted-foreground">요약 생성 중...</span>
      </div>
    )
  }

  if (error) {
    return (
      <div className="flex flex-col items-center justify-center py-8 gap-3">
        <AlertCircle className="h-5 w-5 text-muted-foreground" />
        <span className="text-sm text-muted-foreground">요약에 실패했습니다</span>
        <button
          type="button"
          onClick={onRetry}
          disabled={!onRetry}
          className="inline-flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-md border border-border hover:bg-accent hover:text-accent-foreground transition-colors disabled:opacity-50"
        >
          <RefreshCw className="h-3 w-3" />
          다시 쓰기
        </button>
      </div>
    )
  }

  if (!summary) return null
  if (segments.length === 0 && overallLines.length === 0) return null

  // 렌더 순서대로 globalIdx 증가시키며 highlight 적용 헬퍼
  let runningIdx = 0
  const renderText = (text) => {
    if (!searchQuery) return text
    const startIdx = runningIdx
    const cnt = countMatches(text, searchQuery, searchCaseSensitive)
    runningIdx += cnt
    return renderTextWithHighlight(
      text || "",
      searchQuery,
      searchCaseSensitive,
      startIdx,
      currentMatchIdx,
      matchRefMap.current,
    )
  }

  return (
    <div style={{ wordBreak: "keep-all" }}>
      {overallLines.length > 0 && (
        <div className="border-b border-border pb-3 mb-3 -mx-4 px-4">
          <p className="font-bold mb-1.5" style={{ fontSize: 12 }}>전체 요약</p>
          <div className="flex flex-col" style={{ gap: 6 }}>
            {overallLines.map((line, i) => (
              <p
                key={i}
                className="text-muted-foreground leading-snug"
                style={{ fontSize: 12, wordBreak: "break-all" }}
              >
                · {renderText(line)}
              </p>
            ))}
          </div>
        </div>
      )}
      <div className="flex flex-col" style={{ gap: 40 }}>
        {segments.map((seg) => (
          <div key={seg.segment_index}>
            {/* 대제목 */}
            <div className="flex items-start gap-2 mb-2">
              <span className="font-bold shrink-0" style={{ fontSize: 20 }}>{seg.segment_index + 1}.</span>
              <p className="font-bold leading-snug" style={{ fontSize: 20 }}>{renderText(seg.topic || `구간 ${seg.segment_index + 1}`)}</p>
            </div>
            {(seg.start_time || seg.end_time) && (
              <button
                className="inline-flex items-center gap-1.5 text-[11px] text-blue-400 hover:text-blue-300 bg-blue-500/10 border border-blue-500/20 rounded-full px-2.5 py-0.5 mb-4 cursor-pointer transition-colors"
                onClick={() => onSeek?.(seg.start_at / 1000)}
              >
                <Play className="h-3 w-3 fill-current" />
                {seg.start_time} — {seg.end_time}
              </button>
            )}

            {/* 소제목 목록 */}
            <div className="flex flex-col" style={{ gap: 20, paddingLeft: 16 }}>
              {seg.subtopics?.map((sub, si) => (
                <div key={si}>
                  <p className="font-semibold text-foreground leading-snug mb-2" style={{ fontSize: 16 }}>
                    {seg.segment_index + 1}.{si + 1} {renderText(sub.title)}
                  </p>
                  {/* 본문 */}
                  <div className="flex flex-col" style={{ gap: 6, paddingLeft: 16 }}>
                    {sub.points?.map((point, pi) => (
                      <p key={pi} className="text-muted-foreground leading-relaxed" style={{ fontSize: 14 }}>
                        · {renderText(point)}
                      </p>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
