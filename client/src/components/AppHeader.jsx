import React from "react"
import {
  History,
  RefreshCw,
  Undo2,
  Redo2,
  Download,
  Users,
  User,
} from "lucide-react"
import { Button } from "./ui/button"
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
  TooltipProvider,
} from "./ui/tooltip"

// 툴팁이 달린 아이콘 버튼 (헤더 공용)
function IconBtn({ tip, children, ...rest }) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button variant="ghost" size="icon" className="h-6 w-6" {...rest}>
          {children}
        </Button>
      </TooltipTrigger>
      <TooltipContent>{tip}</TooltipContent>
    </Tooltip>
  )
}

export default function AppHeader({
  worker,
  activeTab,
  onTabChange,
  onOpenHistory,
  canOpenHistory,
  onUndo,
  onRedo,
  canUndo,
  canRedo,
  sequenceInfo,
  isRefreshing,
  onRefresh,
  version,
  onOpenDownload,
  canDownload,
  onOpenSpeakers,
  canEditSpeakers,
}) {
  return (
    <TooltipProvider delayDuration={200}>
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
            <button
              className={`text-xs font-semibold px-3 py-1 rounded-md transition-colors ${
                activeTab === "person"
                  ? "bg-white text-black"
                  : "bg-transparent text-muted-foreground hover:text-white hover:bg-white/10"
              }`}
              onClick={() => onTabChange("person")}
            >
              인물 이미지 생성
            </button>
            <button
              className={`text-xs font-semibold px-3 py-1 rounded-md transition-colors ${
                activeTab === "tts"
                  ? "bg-white text-black"
                  : "bg-transparent text-muted-foreground hover:text-white hover:bg-white/10"
              }`}
              onClick={() => onTabChange("tts")}
            >
              발음 교정
            </button>
          </div>

          {activeTab === "subs" && (
            <>
              <IconBtn tip="실행 취소" onClick={onUndo} disabled={!canUndo}>
                <Undo2 className="h-3.5 w-3.5" />
              </IconBtn>
              <IconBtn tip="다시 실행" onClick={onRedo} disabled={!canRedo}>
                <Redo2 className="h-3.5 w-3.5" />
              </IconBtn>
            </>
          )}

          <IconBtn
            tip="히스토리"
            onClick={onOpenHistory}
            disabled={!canOpenHistory}
          >
            <History className="h-3.5 w-3.5" />
          </IconBtn>
        </div>

        {/* Right: worker + speakers + download + version + connection + refresh */}
        <div className="flex items-center gap-2">
          {worker && (
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="ghost"
                  className="h-6 px-2 gap-1 text-[11px] text-muted-foreground"
                >
                  <User className="h-3.5 w-3.5" />
                  {worker}
                </Button>
              </TooltipTrigger>
              <TooltipContent>
                현재 편집자: {worker} | 수정을 원할 경우 플러그인을
                재시작해주세요
              </TooltipContent>
            </Tooltip>
          )}
          <IconBtn
            tip="화자 관리"
            onClick={onOpenSpeakers}
            disabled={!canEditSpeakers}
          >
            <Users className="h-3.5 w-3.5" />
          </IconBtn>
          <IconBtn
            tip="다운로드"
            onClick={onOpenDownload}
            disabled={!canDownload}
          >
            <Download className="h-3.5 w-3.5" />
          </IconBtn>
          {version && (
            <span className="text-[11px] text-muted-foreground">
              v{version}
            </span>
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
          <IconBtn
            tip="시퀀스 새로고침"
            onClick={onRefresh}
            disabled={isRefreshing}
          >
            <RefreshCw
              className={`h-3.5 w-3.5 ${isRefreshing ? "animate-spin" : ""}`}
            />
          </IconBtn>
        </div>
      </div>
    </TooltipProvider>
  )
}
