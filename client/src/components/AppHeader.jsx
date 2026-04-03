import React from "react"
import { History, RefreshCw, Undo2, Redo2 } from "lucide-react"
import { Button } from "./ui/button"
import { Badge } from "./ui/badge"

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
  status,
}) {
  return (
    <div className="mb-2">
      {/* 1줄: 탭 + 연결 상태 */}
      <div className="flex items-center justify-between mb-1">
        <div className="flex items-center gap-3">
          <button
            className={`text-xs font-semibold pb-1 border-b-2 transition-colors ${
              activeTab === "cut"
                ? "border-white text-white"
                : "border-transparent text-muted-foreground hover:text-white"
            }`}
            onClick={() => onTabChange("cut")}
          >
            컷편집
          </button>
          <button
            className={`text-xs font-semibold pb-1 border-b-2 transition-colors ${
              activeTab === "subs"
                ? "border-white text-white"
                : "border-transparent text-muted-foreground hover:text-white"
            }`}
            onClick={() => onTabChange("subs")}
          >
            자막편집
          </button>
        </div>

        <div className="flex items-center gap-1">
          <Badge
            variant={
              sequenceInfo
                ? "default"
                : isRefreshing
                  ? "secondary"
                  : "destructive"
            }
            className="gap-1 text-[10px]"
          >
            {isRefreshing ? (
              <RefreshCw className="h-3 w-3 animate-spin" />
            ) : isRefreshing ? (
              "확인 중..."
            ) : sequenceInfo ? (
              <>연결됨 &middot; {sequenceInfo.name}</>
            ) : (
              "미연결"
            )}
          </Badge>
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

      {/* 2줄: 탭 제목 + 히스토리/undo/redo + 상태 */}
      <div className="flex items-center justify-between mt-5">
        <div className="flex items-center gap-1">
          <span className="text-xl font-bold">
            {activeTab === "cut" ? "컷편집" : "자막편집"}
          </span>
          <Button
            variant="ghost"
            size="icon"
            className="h-7 w-7"
            onClick={onOpenHistory}
            title="백업 히스토리"
          >
            <History className="h-4 w-4" />
          </Button>
          {activeTab === "subs" && (
            <>
              <Button
                variant="ghost"
                size="icon"
                className="h-7 w-7"
                onClick={onUndo}
                disabled={!canUndo}
                title="실행 취소"
              >
                <Undo2 className="h-4 w-4" />
              </Button>
              <Button
                variant="ghost"
                size="icon"
                className="h-7 w-7"
                onClick={onRedo}
                disabled={!canRedo}
                title="다시 실행"
              >
                <Redo2 className="h-4 w-4" />
              </Button>
            </>
          )}
        </div>

        <span className="text-xs text-muted-foreground truncate max-w-[200px]">
          {status}
        </span>
      </div>
    </div>
  )
}
