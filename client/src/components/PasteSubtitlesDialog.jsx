import { useState, useEffect, useRef } from "react"
import { ClipboardPaste } from "lucide-react"
import { Button } from "./ui/button"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "./ui/dialog"
import { parsePastedLines } from "../js/pasteSubtitles"
import {
  readClipboard,
  beginTextEditing,
  endTextEditing,
} from "../js/cep-bridge"

export default function PasteSubtitlesDialog({ open, onClose, onApply }) {
  // 비제어 textarea + ref — CEP에서 컨트롤드 인풋은 커서가 튀어서(React가 value 재적용)
  const taRef = useRef(null)
  const [count, setCount] = useState(0)

  const recount = (v) => setCount(parsePastedLines(v).length)

  // 다이얼로그 열려 있는 동안 키 가로채기 억제 → 텍스트 편집(캐럿/한글) 정상화.
  // 열릴 때 시작, 닫힐 때/언마운트 시 복구.
  useEffect(() => {
    if (open) {
      if (taRef.current) {
        taRef.current.value = ""
        setCount(0)
      }
      beginTextEditing()
      return () => endTextEditing()
    }
  }, [open])

  const handlePasteFromClipboard = () => {
    const clip = readClipboard()
    if (clip == null) return
    const v = clip.replace(/\r\n/g, "\n")
    if (taRef.current) taRef.current.value = v
    recount(v)
  }

  const handleApply = () => {
    const v = taRef.current?.value || ""
    if (parsePastedLines(v).length === 0) return
    onApply?.(v)
    if (taRef.current) taRef.current.value = ""
    setCount(0)
    onClose()
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(v) => {
        if (!v) onClose()
      }}
    >
      <DialogContent
        className="max-w-lg"
        onOpenAutoFocus={(e) => {
          // Radix 기본 자동 포커스를 막고 textarea를 직접 포커스 → 첫 클릭 전에
          // CEF가 "입력창 포커스" 상태가 되어 키 위임(해제)이 실제 효과를 낸다.
          e.preventDefault()
          beginTextEditing()
          taRef.current?.focus()
        }}
      >
        <DialogHeader>
          <DialogTitle>자막 붙여넣기</DialogTitle>
        </DialogHeader>

        <div className="flex items-center justify-between -mt-1">
          <p className="text-xs text-muted-foreground">
            한 줄 = 한 자막. 줄 앞의 번호는 자동 제거, 기존 자막은 교체됩니다.
          </p>
          <Button
            size="sm"
            variant="secondary"
            className="h-7 text-xs shrink-0"
            onClick={handlePasteFromClipboard}
          >
            <ClipboardPaste className="h-3.5 w-3.5 mr-1" />
            클립보드에서 붙여넣기
          </Button>
        </div>

        <textarea
          ref={taRef}
          defaultValue=""
          onChange={(e) => recount(e.target.value)}
          onFocus={() => beginTextEditing()}
          onMouseDown={() => beginTextEditing()}
          onMouseUp={(e) => {
            // 클릭 위치를 저장 후 blur→focus로 CEF 편집 컨텍스트를 리셋하고
            // 그 위치로 캐럿을 강제 재지정 → 내부 캐럿이 클릭 위치를 채택하도록.
            const el = e.target
            const s = el.selectionStart
            const en = el.selectionEnd
            el.blur()
            el.focus()
            try {
              el.setSelectionRange(s, en)
            } catch (err) {}
          }}
          placeholder={"1575 전기차 관련에 대해서\n1590 질문하도록 하겠습니다"}
          rows={12}
          spellCheck={false}
          className="w-full resize-none rounded-md border border-border bg-background p-3 text-sm leading-relaxed outline-none focus:border-primary"
        />

        <div className="text-xs text-muted-foreground">
          인식된 자막:{" "}
          <span className="font-semibold text-foreground">{count}</span>개
        </div>

        <DialogFooter className="gap-2">
          <Button variant="secondary" onClick={onClose}>
            취소
          </Button>
          <Button onClick={handleApply} disabled={count === 0}>
            적용
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
