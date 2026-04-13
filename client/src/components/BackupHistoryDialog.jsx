import React from "react"
import { FolderOpen, RefreshCw } from "lucide-react"
import { Button } from "./ui/button"
import { Card, CardContent } from "./ui/card"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "./ui/dialog"

export default function BackupHistoryDialog({ open, onClose, backupList, isLoading, onBackupClick }) {
  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>백업 히스토리</DialogTitle>
        </DialogHeader>
        <div className="max-h-[300px] overflow-y-auto">
          {isLoading ? (
            <div className="flex flex-col items-center py-6">
              <RefreshCw className="w-5 h-5 animate-spin text-muted-foreground mb-2" />
              <p className="text-sm text-muted-foreground">불러오는 중...</p>
            </div>
          ) : backupList.length > 0 ? (
            <div className="space-y-2">
              {backupList.map((backup, idx) => (
                <Card
                  key={backup.backupId || idx}
                  className="cursor-pointer hover:bg-accent transition-colors"
                  onClick={() => onBackupClick(backup)}
                >
                  <CardContent className="py-2.5 px-3 flex items-center gap-2.5">
                    <FolderOpen className="h-4 w-4 text-muted-foreground" />
                    <span className="text-sm">{backup.name}</span>
                  </CardContent>
                </Card>
              ))}
            </div>
          ) : (
            <p className="text-sm text-muted-foreground text-center py-4">
              백업이 없습니다
            </p>
          )}
        </div>
        <DialogFooter>
          <Button variant="secondary" onClick={() => onClose(false)}>
            닫기
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
