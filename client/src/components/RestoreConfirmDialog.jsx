import React from "react"
import { Button } from "./ui/button"
import { Card, CardContent } from "./ui/card"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "./ui/dialog"

export default function RestoreConfirmDialog({ restoreConfirm, onConfirm, onCancel }) {
  return (
    <Dialog open={!!restoreConfirm} onOpenChange={() => onCancel()}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>복원 확인</DialogTitle>
        </DialogHeader>
        {restoreConfirm && (
          <div>
            <Card className="mb-4">
              <CardContent className="py-3 px-3">
                <p className="text-xs text-muted-foreground mb-0.5">
                  백업 이름
                </p>
                <p className="text-sm font-medium">
                  {restoreConfirm.backup.name}
                </p>
              </CardContent>
            </Card>
            <p className="text-sm text-muted-foreground text-center">
              이 백업으로 복원하시겠습니까?
              <br />
              현재 시퀀스는 Archive 폴더로 이동됩니다.
            </p>
          </div>
        )}
        <DialogFooter className="gap-2">
          <Button variant="secondary" onClick={onCancel}>
            취소
          </Button>
          <Button onClick={onConfirm}>확인</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
