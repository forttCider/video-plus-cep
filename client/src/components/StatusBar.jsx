import React from "react"
import { RefreshCw } from "lucide-react"
import { Button } from "./ui/button"
import { Card, CardContent } from "./ui/card"

export default function StatusBar({ status, isRefreshing, onRefresh }) {
  return (
    <Card className="mb-3">
      <CardContent className="py-2 px-3 text-sm text-muted-foreground flex items-center justify-between">
        <span>{status}</span>
        {status === "시퀀스를 열어주세요" && (
          <Button
            variant="ghost"
            size="sm"
            className="h-6 gap-1 px-2"
            onClick={onRefresh}
          >
            <RefreshCw
              className={`h-3.5 w-3.5 ${isRefreshing ? "animate-spin" : ""}`}
            />
            새로고침
          </Button>
        )}
      </CardContent>
    </Card>
  )
}
