import React from "react"
import { ClipboardCopy, X } from "lucide-react"
import { Button } from "./ui/button"
import { Card } from "./ui/card"

export default function LogPanel({ logs, onCopy, onClear, logPanelRef }) {
  if (logs.length === 0) return null

  return (
    <Card className="mb-3 flex-shrink-0">
      <div className="flex items-center justify-between px-3 py-1.5 border-b border-border">
        <span className="text-xs text-muted-foreground font-mono">
          로그 ({logs.length})
        </span>
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
      <div
        ref={logPanelRef}
        className="h-[100px] overflow-y-auto p-2 font-mono text-[11px]"
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
    </Card>
  )
}
