import { useEffect, useRef, useState } from "react"
import { Search, ChevronUp, ChevronDown, X, Replace, CaseSensitive, WholeWord, Plus, Minus } from "lucide-react"
import { Button } from "./ui/button"
import { Input } from "./ui/input"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "./ui/dialog"
import { getHighlightSegments } from "../hooks/useSearchAndReplace"

const spkLabels = ["A", "B", "C", "D", "E", "F"]

export default function SearchReplaceSidebar({
  search,
  mode = "subs",
  spkNames = {},
}) {
  const {
    isOpen,
    close,
    query,
    setQuery,
    replaceText,
    setReplaceText,
    caseSensitive,
    setCaseSensitive,
    wholeWord,
    setWholeWord,
    matches,
    matchCount,
    currentIdx,
    findNext,
    findPrev,
    jumpTo,
    replaceCurrent,
    replaceSelected,
    excludedIds,
    toggleMatchSelected,
    toggleAllSelected,
    selectedCount,
    allSelected,
    debouncedQuery,
    isPending,
    isPhraseQuery,
    isReplaceOpen,
    toggleReplace,
    focusRequest,
  } = search

  const queryInputRef = useRef(null)
  // 중복 트리거 방지용 타임스탬프 (compositionend + keydown 둘 다 도는 경우)
  const lastQueryNavRef = useRef(0)
  // shift 키 마지막 상태 추적 (compositionend에는 shift 정보가 없음)
  const lastShiftRef = useRef(false)
  // 가상 스크롤
  const listContainerRef = useRef(null)
  const [scrollTop, setScrollTop] = useState(0)
  const [viewportHeight, setViewportHeight] = useState(400)
  // 대량 치환 확인 다이얼로그
  const [showConfirm, setShowConfirm] = useState(false)
  const CONFIRM_THRESHOLD = 3

  useEffect(() => {
    if (isOpen) {
      setTimeout(() => {
        queryInputRef.current?.focus()
        queryInputRef.current?.select()
      }, 0)
    }
  }, [isOpen, focusRequest])

  // 리스트 컨테이너 스크롤/리사이즈 추적
  useEffect(() => {
    if (!isOpen) return
    const el = listContainerRef.current
    if (!el) return
    const handleScroll = () => setScrollTop(el.scrollTop)
    el.addEventListener("scroll", handleScroll, { passive: true })
    setViewportHeight(el.clientHeight)
    setScrollTop(el.scrollTop)
    const ro = typeof ResizeObserver !== "undefined" && new ResizeObserver(() => {
      setViewportHeight(el.clientHeight)
    })
    if (ro) ro.observe(el)
    return () => {
      el.removeEventListener("scroll", handleScroll)
      if (ro) ro.disconnect()
    }
  }, [isOpen, isReplaceOpen, matchCount > 0, isPhraseQuery])

  if (!isOpen) return null

  const safeFindNav = (shift) => {
    const now = Date.now()
    if (now - lastQueryNavRef.current < 100) return
    lastQueryNavRef.current = now
    if (shift) findPrev()
    else findNext()
  }

  const handleQueryKeyDown = (e) => {
    e.stopPropagation()
    lastShiftRef.current = e.shiftKey
    // IME 조합 중 Enter는 compositionend에서 처리
    if (e.isComposing || e.keyCode === 229) return
    if (e.key === "Enter") {
      e.preventDefault()
      safeFindNav(e.shiftKey)
    } else if (e.key === "Escape") {
      e.preventDefault()
      close()
    }
  }

  // 조합 종료가 Enter로 인한 것인지 판별
  // — Enter: 입력값 변화 없음 (조합 확정만)
  // — Space/다른 문자: 다음 tick에 input 이벤트 발생, value가 늘어남
  // — Tab/외부 클릭: 포커스 빠짐
  // — Backspace로 조합 취소: e.data가 비어있음
  const handleQueryCompositionEnd = (e) => {
    if (!e.data) return
    const valueAtEnd = e.target.value
    const inputEl = queryInputRef.current
    const shift = lastShiftRef.current
    setTimeout(() => {
      const valueNow = inputEl?.value
      if (valueNow !== valueAtEnd) return
      if (document.activeElement !== inputEl) return
      safeFindNav(shift)
    }, 0)
  }

  // 바꾸기는 키보드 트리거 없음 — 버튼으로만 실행
  const handleReplaceKeyDown = (e) => {
    e.stopPropagation()
    if (e.key === "Escape" && !e.isComposing && e.keyCode !== 229) {
      e.preventDefault()
      close()
    }
  }

  const countLabel =
    matchCount > 0
      ? currentIdx < 0
        ? `${matchCount}개`
        : `${currentIdx + 1} / ${matchCount}`
      : query
        ? "결과 없음"
        : ""
  const showReplacePreview = isReplaceOpen && replaceText.length > 0

  const handleReplaceSelectedClick = () => {
    if (selectedCount > CONFIRM_THRESHOLD) {
      setShowConfirm(true)
    } else {
      replaceSelected()
    }
  }
  const handleConfirmReplace = () => {
    setShowConfirm(false)
    replaceSelected()
  }

  return (
    <div
      className="flex flex-col border-l border-border bg-background"
      style={{ width: 300, minWidth: 300 }}
    >
      {/* 헤더 */}
      <div className="flex items-center justify-between px-3 py-2 border-b border-border">
        <div className="flex items-center gap-1.5 text-xs font-medium">
          <Search className="h-3.5 w-3.5" />
          {isReplaceOpen ? "찾기 / 바꾸기" : "찾기"}
        </div>
        <button
          className="text-muted-foreground hover:text-foreground"
          onClick={close}
          aria-label="닫기"
        >
          <X className="h-4 w-4" />
        </button>
      </div>

      {/* 검색 */}
      <div className="px-3 pt-3 pb-2 flex flex-col gap-2">
        <div className="flex items-center gap-1">
          <Input
            ref={queryInputRef}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={handleQueryKeyDown}
            onCompositionEnd={handleQueryCompositionEnd}
            placeholder="찾을 단어"
            className="h-7 text-xs"
          />
          <Button
            size="icon"
            variant="ghost"
            className="h-7 w-7 shrink-0"
            onClick={findPrev}
            disabled={matchCount === 0}
            title="이전 (Shift+Enter)"
          >
            <ChevronUp className="h-3.5 w-3.5" />
          </Button>
          <Button
            size="icon"
            variant="ghost"
            className="h-7 w-7 shrink-0"
            onClick={findNext}
            disabled={matchCount === 0}
            title="다음 (Enter)"
          >
            <ChevronDown className="h-3.5 w-3.5" />
          </Button>
        </div>

        {/* 옵션 */}
        <div className="flex items-center gap-1">
          <Button
            size="icon"
            variant={caseSensitive ? "default" : "ghost"}
            className="h-6 w-6"
            onClick={() => setCaseSensitive((v) => !v)}
            title="대소문자 구분"
          >
            <CaseSensitive className="h-3.5 w-3.5" />
          </Button>
          <Button
            size="icon"
            variant={wholeWord ? "default" : "ghost"}
            className="h-6 w-6"
            onClick={() => setWholeWord((v) => !v)}
            title="단어 단위"
          >
            <WholeWord className="h-3.5 w-3.5" />
          </Button>
          <div className="flex-1" />
          <span className="text-[11px] text-muted-foreground">{countLabel}</span>
        </div>

        {/* 바꾸기 토글 */}
        <Button
          size="sm"
          variant={isReplaceOpen ? "secondary" : "ghost"}
          className="h-7 text-xs justify-start gap-1.5 px-2"
          onClick={toggleReplace}
        >
          {isReplaceOpen ? (
            <Minus className="h-3.5 w-3.5" />
          ) : (
            <Plus className="h-3.5 w-3.5" />
          )}
          바꾸기
        </Button>
      </div>

      {/* 치환 영역 (펼친 상태일 때만) */}
      {isReplaceOpen && (
        <div className="px-3 pb-3 pt-2 border-t border-border flex flex-col gap-2">
          <div className="flex items-center gap-1">
            <Replace className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
            <Input
              value={replaceText}
              onChange={(e) => setReplaceText(e.target.value)}
              onKeyDown={handleReplaceKeyDown}
              placeholder="바꿀 단어"
              className="h-7 text-xs"
            />
          </div>
          <div className="flex items-center gap-1.5">
            <Button
              size="sm"
              variant="secondary"
              className="h-7 text-xs flex-1"
              onClick={replaceCurrent}
              disabled={matchCount === 0 || !debouncedQuery || isPending}
              title="현재 매치만 바꾸기"
            >
              바꾸기
            </Button>
            <Button
              size="sm"
              className="h-7 text-xs flex-1"
              onClick={handleReplaceSelectedClick}
              disabled={selectedCount === 0 || !debouncedQuery || isPending}
              title={`선택한 ${selectedCount}개 변경`}
            >
              선택 바꾸기{selectedCount > 0 ? ` (${selectedCount})` : ""}
            </Button>
          </div>
        </div>
      )}

      {/* 매치 리스트 */}
      <div className="flex flex-col flex-1 min-h-0 border-t border-border">
        {isPhraseQuery ? (
          <div className="px-3 py-4 text-[11px] text-muted-foreground text-center leading-relaxed">
            단어 단위로만 검색됩니다.
            <br />
            띄어쓰기 없이 입력해주세요.
          </div>
        ) : matchCount === 0 ? (
          <div className="px-3 py-4 text-[11px] text-muted-foreground text-center">
            {query ? "결과 없음" : "검색어를 입력하세요"}
          </div>
        ) : (
          <>
            {isReplaceOpen && (
              <div className="px-3 py-1.5 border-b border-border flex items-center gap-2 shrink-0">
                <input
                  type="checkbox"
                  checked={allSelected}
                  ref={(el) => {
                    if (el) el.indeterminate = !allSelected && selectedCount > 0
                  }}
                  onChange={toggleAllSelected}
                  className="h-3.5 w-3.5 cursor-pointer accent-primary"
                  aria-label="모두 선택"
                />
                <span className="text-[11px]">모두 선택</span>
                <span className="text-[11px] text-muted-foreground ml-auto">
                  {selectedCount} / {matchCount}
                </span>
              </div>
            )}
            {(() => {
              const ITEM_HEIGHT = 56
              const OVERSCAN = 5
              const startIdx = Math.max(
                0,
                Math.floor(scrollTop / ITEM_HEIGHT) - OVERSCAN,
              )
              const endIdx = Math.min(
                matchCount,
                Math.ceil((scrollTop + viewportHeight) / ITEM_HEIGHT) + OVERSCAN,
              )
              const topPad = startIdx * ITEM_HEIGHT
              const bottomPad = (matchCount - endIdx) * ITEM_HEIGHT
              const visible = matches.slice(startIdx, endIdx)
              return (
                <div
                  ref={listContainerRef}
                  className="flex-1 min-h-0 overflow-y-auto"
                >
                  <div style={{ height: topPad }} />
                  {visible.map((m, vi) => {
                    const i = startIdx + vi
                    const isCurrent = i === currentIdx
                    const isChecked = !excludedIds.has(m.wordId)
                    const spkName =
                      spkNames[m.spk] || `화자 ${spkLabels[m.spk] || m.spk + 1}`
                    const segs = getHighlightSegments(
                      m.matchText || "",
                      debouncedQuery,
                      caseSensitive,
                      wholeWord,
                    )
                    return (
                      <div
                        key={`${m.wordId}-${i}`}
                        className={`flex items-start gap-2 px-3 py-1.5 border-l-2 ${
                          isCurrent
                            ? "bg-accent border-l-primary"
                            : "border-l-transparent hover:bg-accent/50"
                        }`}
                        style={{ height: ITEM_HEIGHT }}
                      >
                        {isReplaceOpen && (
                          <input
                            type="checkbox"
                            checked={isChecked}
                            onChange={() => toggleMatchSelected(m.wordId)}
                            onClick={(e) => e.stopPropagation()}
                            className="mt-0.5 h-3.5 w-3.5 cursor-pointer accent-primary shrink-0"
                            aria-label="선택"
                          />
                        )}
                        <button
                          type="button"
                          onClick={() => jumpTo(i)}
                          className="flex-1 text-left text-[13px] leading-snug min-w-0"
                        >
                          <div className="text-muted-foreground text-[11px] mb-0.5">
                            {spkName} · 문장 {m.sentenceIdx + 1}
                          </div>
                          <div className="truncate">
                            {m.before && (
                              <span className="text-muted-foreground">
                                …{m.before}{" "}
                              </span>
                            )}
                            {segs.map((s, si) => {
                              if (!s.match)
                                return <span key={si}>{s.text}</span>
                              if (showReplacePreview) {
                                return (
                                  <span key={si}>
                                    <span className="word-search-replace-old">
                                      {s.text}
                                    </span>
                                    <span className="word-search-replace-new">
                                      {replaceText}
                                    </span>
                                  </span>
                                )
                              }
                              return (
                                <span
                                  key={si}
                                  className={
                                    isCurrent
                                      ? "word-search-current-char"
                                      : "word-search-match-char"
                                  }
                                >
                                  {s.text}
                                </span>
                              )
                            })}
                            {m.after && (
                              <span className="text-muted-foreground">
                                {" "}
                                {m.after}…
                              </span>
                            )}
                          </div>
                        </button>
                      </div>
                    )
                  })}
                  <div style={{ height: bottomPad }} />
                </div>
              )
            })()}
          </>
        )}
      </div>

      {/* 푸터 안내 (바꾸기 모드일 때만) */}
      {isReplaceOpen && (
        <div className="px-3 py-1.5 border-t border-border">
          <p className="text-[10px] text-muted-foreground leading-tight">
            {mode === "cut"
              ? "컷편집의 단어 텍스트만 변경됩니다."
              : "자막편집의 단어 텍스트만 변경됩니다."}
          </p>
        </div>
      )}

      {/* 대량 치환 확인 다이얼로그 */}
      <Dialog open={showConfirm} onOpenChange={setShowConfirm}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>일괄 바꾸기 확인</DialogTitle>
          </DialogHeader>
          <div className="text-sm text-muted-foreground space-y-2">
            <p>
              <span className="font-medium text-foreground">{selectedCount}개</span>의
              단어를 변경합니다.
            </p>
            <div className="rounded-md bg-muted p-2 text-xs space-y-1">
              <div className="flex gap-2">
                <span className="text-muted-foreground shrink-0">찾기:</span>
                <span className="font-medium text-foreground break-all">
                  {debouncedQuery}
                </span>
              </div>
              <div className="flex gap-2">
                <span className="text-muted-foreground shrink-0">바꾸기:</span>
                <span className="font-medium text-foreground break-all">
                  {replaceText || <em className="text-muted-foreground">(비어 있음)</em>}
                </span>
              </div>
            </div>
            <p className="text-xs">계속하시겠습니까?</p>
          </div>
          <DialogFooter className="gap-2">
            <Button variant="secondary" onClick={() => setShowConfirm(false)}>
              취소
            </Button>
            <Button onClick={handleConfirmReplace}>확인</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
