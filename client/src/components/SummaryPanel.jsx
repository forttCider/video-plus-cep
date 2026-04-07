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
      <div className="flex flex-col" style={{ gap: 56 }}>
        {segments.map((seg) => (
          <div key={seg.segment_index}>
            <p className="font-bold leading-snug mb-3" style={{ fontSize: 20 }}>{seg.topic || `구간 ${seg.segment_index + 1}`}</p>
            {(seg.start_time || seg.end_time) && (
              <button
                className="inline-flex items-center gap-1.5 text-[11px] text-blue-400 hover:text-blue-300 bg-blue-500/10 border border-blue-500/20 rounded-full px-2.5 py-0.5 mb-5 cursor-pointer transition-colors"
                onClick={() => onSeek?.(seg.start_at / 1000)}
              >
                <Play className="h-3 w-3 fill-current" />
                {seg.start_time} — {seg.end_time}
              </button>
            )}
            <div className="flex flex-col" style={{ gap: 24 }}>
              {seg.subtopics?.map((sub, si) => (
                <div key={si}>
                  <p className="font-semibold text-foreground leading-snug mb-3" style={{ fontSize: 16 }}>{sub.title}</p>
                  <ul className="list-disc list-outside pl-4 flex flex-col" style={{ gap: 8 }}>
                    {sub.points?.map((point, pi) => (
                      <li key={pi} className="text-muted-foreground leading-relaxed" style={{ fontSize: 14 }}>
                        {point}
                      </li>
                    ))}
                  </ul>
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
