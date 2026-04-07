import React from "react"
import { History, RefreshCw, Undo2, Redo2 } from "lucide-react"
import { Button } from "./ui/button"

export default function AppHeader({
  activeTab,
  onTabChange,
  onOpenHistory,
  onUndo,
  onRedo,
  canUndo,
  canRedo,
  sequenceInfo,
  isRefreshing,
  onRefresh,
  version,
}) {
  return (
    <div className="flex items-center justify-between py-2 px-4 border-b border-border">
      {/* Left: tabs + undo/redo + history */}
      <div className="flex items-center gap-1">
        <div className="flex items-center gap-0.5 mr-1">
          <button
            className={`text-xs font-semibold px-3 py-1 rounded-md transition-colors ${
              activeTab === "cut"
                ? "bg-white text-black"
                : "bg-transparent text-muted-foreground hover:text-white hover:bg-white/10"
            }`}
            onClick={() => onTabChange("cut")}
          >
            컷편집
          </button>
          <button
            className={`text-xs font-semibold px-3 py-1 rounded-md transition-colors ${
              activeTab === "subs"
                ? "bg-white text-black"
                : "bg-transparent text-muted-foreground hover:text-white hover:bg-white/10"
            }`}
            onClick={() => onTabChange("subs")}
          >
            자막편집
          </button>
        </div>

        {activeTab === "subs" && (
          <>
            <Button
              variant="ghost"
              size="icon"
              className="h-6 w-6"
              onClick={onUndo}
              disabled={!canUndo}
              title="실행 취소"
            >
              <Undo2 className="h-3.5 w-3.5" />
            </Button>
            <Button
              variant="ghost"
              size="icon"
              className="h-6 w-6"
              onClick={onRedo}
              disabled={!canRedo}
              title="다시 실행"
            >
              <Redo2 className="h-3.5 w-3.5" />
            </Button>
          </>
        )}

        <Button
          variant="ghost"
          size="icon"
          className="h-6 w-6"
          onClick={onOpenHistory}
          title="백업 히스토리"
        >
          <History className="h-3.5 w-3.5" />
        </Button>
      </div>

      {/* Right: version + connection + refresh */}
      <div className="flex items-center gap-2">
        {version && (
          <span className="text-[11px] text-muted-foreground">v{version}</span>
        )}
        {sequenceInfo ? (
          <div className="flex items-center gap-1.5 text-[11px] text-muted-foreground border border-border rounded-full px-2.5 py-0.5">
            <span className="inline-block h-2 w-2 rounded-full bg-green-500" />
            {sequenceInfo.name}
          </div>
        ) : (
          <div className="flex items-center gap-1.5 text-[11px] text-muted-foreground border border-border rounded-full px-2.5 py-0.5">
            {isRefreshing ? (
              <RefreshCw className="h-3 w-3 animate-spin" />
            ) : (
              "미연결"
            )}
          </div>
        )}
        <Button
          variant="ghost"
          size="icon"
          className="h-6 w-6"
          onClick={onRefresh}
          disabled={isRefreshing}
          title="시퀀스 새로고침"
        >
          <RefreshCw
            className={`h-3.5 w-3.5 ${isRefreshing ? "animate-spin" : ""}`}
          />
        </Button>
      </div>
    </div>
  )
}
