import { useEffect, useRef, useState } from "react"
import { ChevronUp, ChevronDown, X, CaseSensitive } from "lucide-react"
import { Button } from "./ui/button"
import { Input } from "./ui/input"

// VSCode 스타일 작은 검색 바 — SummaryPanel 상단에 떠 있음
export default function SummaryFinder({
  isOpen,
  onClose,
  query,
  setQuery,
  caseSensitive,
  setCaseSensitive,
  currentIdx,
  matchCount,
  onNext,
  onPrev,
  focusRequest,
}) {
  const inputRef = useRef(null)
  const lastShiftRef = useRef(false)

  useEffect(() => {
    if (isOpen) {
      setTimeout(() => {
        inputRef.current?.focus()
        inputRef.current?.select()
      }, 0)
    }
  }, [isOpen, focusRequest])

  if (!isOpen) return null

  const handleKeyDown = (e) => {
    e.stopPropagation()
    lastShiftRef.current = e.shiftKey
    if (e.isComposing || e.keyCode === 229) return
    if (e.key === "Enter") {
      e.preventDefault()
      if (e.shiftKey) onPrev()
      else onNext()
    } else if (e.key === "Escape") {
      e.preventDefault()
      onClose()
    }
  }

  const handleCompositionEnd = (e) => {
    if (!e.data) return
    const valueAtEnd = e.target.value
    const inputEl = inputRef.current
    const shift = lastShiftRef.current
    setTimeout(() => {
      const valueNow = inputEl?.value
      if (valueNow !== valueAtEnd) return
      if (document.activeElement !== inputEl) return
      if (shift) onPrev()
      else onNext()
    }, 0)
  }

  const countLabel =
    matchCount > 0
      ? currentIdx < 0
        ? `${matchCount}개`
        : `${currentIdx + 1} / ${matchCount}`
      : query
        ? "결과 없음"
        : ""

  return (
    <div
      className="flex items-center gap-1 px-2 py-1.5 bg-background border-b border-border shrink-0"
      onKeyDown={(e) => e.stopPropagation()}
    >
      <Input
        ref={inputRef}
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        onKeyDown={handleKeyDown}
        onCompositionEnd={handleCompositionEnd}
        placeholder="찾기"
        className="h-7 text-xs flex-1"
      />
      <Button
        size="icon"
        variant={caseSensitive ? "default" : "ghost"}
        className="h-6 w-6 shrink-0"
        onClick={() => setCaseSensitive((v) => !v)}
        title="대소문자 구분"
      >
        <CaseSensitive className="h-3.5 w-3.5" />
      </Button>
      <span className="text-[11px] text-muted-foreground min-w-[60px] text-right shrink-0">
        {countLabel}
      </span>
      <Button
        size="icon"
        variant="ghost"
        className="h-6 w-6 shrink-0"
        onClick={onPrev}
        disabled={matchCount === 0}
        title="이전 (Shift+Enter)"
      >
        <ChevronUp className="h-3.5 w-3.5" />
      </Button>
      <Button
        size="icon"
        variant="ghost"
        className="h-6 w-6 shrink-0"
        onClick={onNext}
        disabled={matchCount === 0}
        title="다음 (Enter)"
      >
        <ChevronDown className="h-3.5 w-3.5" />
      </Button>
      <Button
        size="icon"
        variant="ghost"
        className="h-6 w-6 shrink-0"
        onClick={onClose}
        title="닫기 (Esc)"
      >
        <X className="h-3.5 w-3.5" />
      </Button>
    </div>
  )
}
