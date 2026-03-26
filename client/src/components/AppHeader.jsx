import React from "react"
import { History, FolderOpen, RefreshCw } from "lucide-react"
import { Button } from "./ui/button"
import { Badge } from "./ui/badge"

export default function AppHeader({
  activeTab,
  onTabChange,
  onOpenHistory,
  sequenceInfo,
  isRefreshing,
  onRefresh,
  status,
}) {
  return (
    <div className="mb-2">
      {/* 1줄: 탭 + 연결 */}
      <div className="flex items-center justify-between mb-1">
        <div className="flex items-center gap-1">
          <Button
            variant={activeTab === "cut" ? "default" : "ghost"}
            size="sm"
            className="h-7 px-3 text-xs"
            onClick={() => onTabChange("cut")}
          >
            컷편집
          </Button>
          <Button
            variant={activeTab === "subs" ? "default" : "ghost"}
            size="sm"
            className="h-7 px-3 text-xs"
            onClick={() => onTabChange("subs")}
          >
            자막편집
          </Button>
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
            ) : (
              <FolderOpen className="h-3 w-3" />
            )}
            {isRefreshing
              ? "확인 중..."
              : sequenceInfo
                ? "연결됨"
                : "미연결"}
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

      {/* 2줄: 제목/히스토리 + 상태 */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-1">
          <span className="text-xs font-medium text-muted-foreground">
            {sequenceInfo?.name || "시퀀스 없음"}
          </span>
          <Button
            variant="ghost"
            size="icon"
            className="h-5 w-5"
            onClick={onOpenHistory}
            title="백업 히스토리"
          >
            <History className="h-3 w-3" />
          </Button>
        </div>

        <span className="text-[10px] text-muted-foreground truncate max-w-[160px]">
          {status}
        </span>
      </div>
    </div>
  )
}
