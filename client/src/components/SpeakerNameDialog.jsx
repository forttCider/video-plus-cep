import { useState, useEffect } from "react"
import { Plus, Trash2 } from "lucide-react"
import { Button } from "./ui/button"
import { Input } from "./ui/input"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "./ui/dialog"
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
  TooltipProvider,
} from "./ui/tooltip"

const spkLabels = ["A", "B", "C", "D", "E", "F"]
const spkColors = ["#4caf50", "#2196f3", "#f44336", "#ff9800", "#9c27b0", "#00bcd4"]

export default function SpeakerNameDialog({
  open,
  onClose,
  onSave,
  initialSpeakers,
  usedSpkIds,
}) {
  const [speakers, setSpeakers] = useState([])

  useEffect(() => {
    if (open) {
      setSpeakers(
        (initialSpeakers && initialSpeakers.length > 0
          ? initialSpeakers
          : [{ id: 0, name: "" }]
        ).map((s) => ({ ...s })),
      )
    }
  }, [open, initialSpeakers])

  const handleChangeName = (idx, name) => {
    setSpeakers((prev) => prev.map((s, i) => (i === idx ? { ...s, name } : s)))
  }

  const handleAdd = () => {
    if (speakers.length >= 6) return
    const used = new Set(speakers.map((s) => s.id))
    let nextId = 0
    while (used.has(nextId) && nextId < 6) nextId += 1
    setSpeakers((prev) => [...prev, { id: nextId, name: "" }])
  }

  const handleDelete = (idx) => {
    if (speakers.length <= 1) return
    setSpeakers((prev) => prev.filter((_, i) => i !== idx))
  }

  const handleSave = () => {
    onSave && onSave(speakers)
    onClose()
  }

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) onClose() }}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>화자 관리</DialogTitle>
        </DialogHeader>

        <div className="flex flex-col gap-2">
          {speakers.map((s, idx) => {
            const isUsed = usedSpkIds?.has(s.id)
            const canDelete = speakers.length > 1 && !isUsed
            return (
              <div key={idx} className="flex items-center gap-2">
                <span
                  className="inline-block w-2.5 h-2.5 rounded-full shrink-0"
                  style={{ background: spkColors[s.id] || spkColors[0] }}
                />
                <span className="text-sm font-medium w-14 shrink-0">
                  화자 {spkLabels[s.id] || String.fromCharCode(65 + s.id)}
                </span>
                <Input
                  value={s.name}
                  onChange={(e) => handleChangeName(idx, e.target.value)}
                  placeholder="이름 입력"
                  className="flex-1 text-sm"
                />
                <TooltipProvider delayDuration={200}>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <span className="inline-flex shrink-0">
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-8 w-8"
                          onClick={() => handleDelete(idx)}
                          disabled={!canDelete}
                          style={!canDelete ? { pointerEvents: "none" } : {}}
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                      </span>
                    </TooltipTrigger>
                    <TooltipContent>
                      {isUsed
                        ? "사용 중인 화자는 삭제할 수 없습니다"
                        : speakers.length <= 1
                          ? "최소 1명은 있어야 합니다"
                          : "삭제"}
                    </TooltipContent>
                  </Tooltip>
                </TooltipProvider>
              </div>
            )
          })}

          <Button
            variant="outline"
            size="sm"
            className="mt-2 h-8 text-xs w-full"
            onClick={handleAdd}
            disabled={speakers.length >= 6}
          >
            <Plus className="h-3 w-3 mr-1" />
            화자 추가
          </Button>
        </div>

        <DialogFooter className="gap-2">
          <Button variant="secondary" onClick={onClose}>
            취소
          </Button>
          <Button onClick={handleSave}>저장</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
