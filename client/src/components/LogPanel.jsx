import { ClipboardCopy, X, ChevronDown, ChevronRight } from "lucide-react"
import { Button } from "./ui/button"

export default function LogPanel({
  logs,
  open = true,
  onToggle,
  onCopy,
  onClear,
  logPanelRef,
}) {
  if (logs.length === 0) return null

  return (
    <div className="flex-shrink-0 border-b border-border">
      <div className="flex items-center justify-between py-1.5 px-4 border-b border-border" style={{ background: "rgba(255,255,255,0.03)" }}>
        <button
          onClick={onToggle}
          className="flex items-center gap-1 text-xs text-muted-foreground/40 hover:text-muted-foreground"
          title={open ? "로그 접기" : "로그 펼치기"}
        >
          {open ? (
            <ChevronDown className="h-3 w-3" />
          ) : (
            <ChevronRight className="h-3 w-3" />
          )}
          로그 ({logs.length})
        </button>
        <div className="flex gap-1">
          <Button
            variant="ghost"
            size="icon"
            className="h-5 w-5"
            onClick={onCopy}
            title="로그 복사"
          >
            <ClipboardCopy className="h-3 w-3" />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            className="h-5 w-5"
            onClick={onClear}
            title="로그 삭제"
          >
            <X className="h-3 w-3" />
          </Button>
        </div>
      </div>
      {open && (
      <div
        ref={logPanelRef}
        className="h-[70px] overflow-y-auto px-4 py-2 font-mono text-[11px]"
      >
        {logs.map((log, i) => (
          <div
            key={i}
            className={`leading-relaxed break-all ${
              log.level === "error"
                ? "text-red-400"
                : log.level === "warn"
                  ? "text-yellow-400"
                  : "text-green-400"
            }`}
          >
            <span className="text-muted-foreground mr-1.5">
              {log.time.toLocaleTimeString("ko-KR", {
                hour: "2-digit",
                minute: "2-digit",
                second: "2-digit",
              })}
            </span>
            {log.message}
          </div>
        ))}
      </div>
      )}
    </div>
  )
}
