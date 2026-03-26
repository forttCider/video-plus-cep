import React from "react"
import { History, FolderOpen, RefreshCw } from "lucide-react"
import { Button } from "./ui/button"
import { Badge } from "./ui/badge"

export default function AppHeader({
  onOpenHistory,
  sequenceInfo,
  isRefreshing,
  onRefresh,
  extensionVersion,
}) {
  return (
    <div className="flex items-center justify-between mb-3">
      <div className="flex items-center gap-2">
        <h1 className="text-base font-semibold">컷편집</h1>
        <Button
          variant="ghost"
          size="icon"
          onClick={onOpenHistory}
          title="백업 히스토리"
        >
          <History className="h-4 w-4" />
        </Button>
      </div>

      <div className="flex items-center gap-2">
        <Badge className="bg-white text-[#2a2a2a] border-0">
          v{extensionVersion}
        </Badge>
        <Badge
          variant={
            sequenceInfo
              ? "default"
              : isRefreshing
                ? "secondary"
                : "destructive"
          }
          className="gap-1"
        >
          {isRefreshing ? (
            <RefreshCw className="h-3 w-3 animate-spin" />
          ) : (
            <FolderOpen className="h-3 w-3" />
          )}
          {isRefreshing
            ? "확인 중..."
            : sequenceInfo
              ? `연결됨 · ${sequenceInfo.name}`
              : "시퀀스 연결 안됨"}
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
  )
}
