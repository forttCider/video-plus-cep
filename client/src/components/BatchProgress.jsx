import React from "react"
import { Card, CardContent } from "./ui/card"
import { Progress } from "./ui/progress"

export default function BatchProgress({ batchProgress }) {
  if (!batchProgress) return null

  return (
    <Card className="mb-3">
      <CardContent className="py-3 px-3">
        <div className="flex justify-between mb-2 text-sm">
          <span>{batchProgress.label}</span>
          <span className="text-muted-foreground">
            {batchProgress.current} / {batchProgress.total} 단어{" "}
            {batchProgress.total > 0 && (
              <span className="text-primary ml-2">
                {Math.round(
                  (batchProgress.current / batchProgress.total) * 100,
                )}
                %
              </span>
            )}
          </span>
        </div>
        <Progress
          value={
            batchProgress.total > 0
              ? (batchProgress.current / batchProgress.total) * 100
              : 0
          }
        />
      </CardContent>
    </Card>
  )
}
