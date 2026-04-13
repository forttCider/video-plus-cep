import { RefreshCw, Play } from "lucide-react"

export default function SummaryPanel({ summary, loading, onSeek }) {
  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center py-8">
        <RefreshCw className="h-5 w-5 animate-spin text-muted-foreground mb-2" />
        <span className="text-sm text-muted-foreground">요약 생성 중...</span>
      </div>
    )
  }

  if (!summary) return null

  const segments = summary.data?.segments || summary.segments || []
  if (segments.length === 0) return null

  return (
    <div style={{ wordBreak: "keep-all" }}>
      <div className="flex flex-col" style={{ gap: 40 }}>
        {segments.map((seg) => (
          <div key={seg.segment_index}>
            {/* 대제목 */}
            <div className="flex items-start gap-2 mb-2">
              <span className="font-bold shrink-0" style={{ fontSize: 20 }}>{seg.segment_index + 1}.</span>
              <p className="font-bold leading-snug" style={{ fontSize: 20 }}>{seg.topic || `구간 ${seg.segment_index + 1}`}</p>
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
                    {seg.segment_index + 1}.{si + 1} {sub.title}
                  </p>
                  {/* 본문 */}
                  <div className="flex flex-col" style={{ gap: 6, paddingLeft: 16 }}>
                    {sub.points?.map((point, pi) => (
                      <p key={pi} className="text-muted-foreground leading-relaxed" style={{ fontSize: 14 }}>
                        · {point}
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
