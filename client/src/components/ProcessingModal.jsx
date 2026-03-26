import React from "react"
import { X } from "lucide-react"
import { Button } from "./ui/button"
import { Progress } from "./ui/progress"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "./ui/dialog"

export default function ProcessingModal({ open, batchProgress, onAbort }) {
  return (
    <Dialog open={open}>
      <DialogContent
        className="max-w-sm [&>button]:hidden"
        onPointerDownOutside={(e) => e.preventDefault()}
      >
        <DialogHeader>
          <DialogTitle>⚠️ 작업 중</DialogTitle>
        </DialogHeader>
        <div className="py-4">
          <p className="text-sm text-muted-foreground text-center mb-4">
            시퀀스에 편집을 적용하고 있습니다.
            <br />
            <strong>
              완료될 때까지 시퀀스를 이동하거나
              <br />
              조작하지 마세요!
            </strong>
          </p>
          {batchProgress && (
            <div>
              <div className="flex justify-between mb-2 text-sm">
                <span>{batchProgress.label}</span>
                <span>
                  {batchProgress.current} / {batchProgress.total}
                </span>
              </div>
              <Progress
                value={
                  batchProgress.total > 0
                    ? (batchProgress.current / batchProgress.total) * 100
                    : 0
                }
              />
              <div className="flex justify-center mt-4">
                <Button
                  variant="destructive"
                  size="sm"
                  onClick={onAbort}
                >
                  <X className="h-3 w-3 mr-1" />
                  중단
                </Button>
              </div>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  )
}
