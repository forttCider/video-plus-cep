import React from "react"
import { History, RefreshCw } from "lucide-react"
import { Button } from "./ui/button"
import { Card, CardContent } from "./ui/card"

export default function SavedStateBanner({ hasSavedState, isUpload, isRestoring, onLoad }) {
  if (!hasSavedState || isUpload) return null

  return (
    <Card className="mb-3 border-blue-500 bg-blue-950/30">
      <CardContent className="py-4 px-4 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <History className="w-4 h-4 text-blue-400" />
          <span className="text-sm font-medium text-blue-300">
            이미 받아쓴 기록이 있습니다
          </span>
        </div>
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
      </CardContent>
    </Card>
  )
}
