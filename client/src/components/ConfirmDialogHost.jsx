import React, { useEffect, useState } from "react"
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "./ui/dialog"
import { Button } from "./ui/button"
import { registerConfirmListener, resolveConfirm } from "../js/confirmDialog"

/**
 * confirmDialog() 호출을 받아 shadcn Dialog 로 띄우는 호스트. App 에 1회 마운트.
 */
export default function ConfirmDialogHost() {
  const [open, setOpen] = useState(false)
  const [opts, setOpts] = useState({})

  useEffect(() => {
    registerConfirmListener((o) => {
      setOpts(o || {})
      setOpen(true)
    })
  }, [])

  const done = (val) => {
    setOpen(false)
    resolveConfirm(val)
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        if (!o) done(false)
      }}
    >
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>{opts.title || "확인"}</DialogTitle>
        </DialogHeader>
        {opts.message && (
          <p className="text-sm text-muted-foreground whitespace-pre-line leading-relaxed">
            {opts.message}
          </p>
        )}
        <DialogFooter className="gap-2">
          <Button variant="outline" onClick={() => done(false)}>
            {opts.cancelText || "취소"}
          </Button>
          <Button onClick={() => done(true)}>{opts.confirmText || "확인"}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
