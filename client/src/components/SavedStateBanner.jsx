import React from "react"
import { History, RefreshCw, X } from "lucide-react"
import { Button } from "./ui/button"
import { Card, CardContent } from "./ui/card"

export default function SavedStateBanner({ hasSavedState, isUpload, isRestoring, onLoad, onDismiss }) {
  if (!hasSavedState || isUpload) return null

  return (
    <Card className="mb-3 border-blue-500 bg-blue-950/30">
      <CardContent className="py-3 px-5 flex items-center justify-between gap-4">
        <div className="flex items-center gap-2">
          <History className="w-4 h-4 text-blue-400" />
          <span className="text-sm font-medium text-blue-300">
            이미 받아쓴 기록이 있습니다
          </span>
        </div>
        <div className="flex items-center gap-2">
          <Button
            size="sm"
            variant="default"
            className="bg-blue-600 hover:bg-blue-700"
            onClick={onLoad}
            disabled={isRestoring}
          >
            {isRestoring ? (
              <RefreshCw className="w-4 h-4 animate-spin" />
            ) : (
              "불러오기"
            )}
          </Button>
          {onDismiss && (
            <Button
              size="sm"
              variant="ghost"
              className="h-8 w-8 p-0 text-blue-300 hover:bg-blue-900/40 hover:text-blue-100"
              onClick={onDismiss}
              disabled={isRestoring}
              aria-label="닫기"
            >
              <X className="w-4 h-4" />
            </Button>
          )}
        </div>
      </CardContent>
    </Card>
  )
}
