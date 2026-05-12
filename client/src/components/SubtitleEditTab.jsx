import { startTransition, useState, useCallback } from "react"
import { Copy, Check } from "lucide-react"
import { Button } from "./ui/button"
import SentenceList from "./SentenceList"
import { splitForSubtitles } from "../js/subtitleSplitter"

const spkLabels = ["A", "B", "C", "D", "E", "F"]

function subsToText(subsSentences, spkNames = {}) {
  return subsSentences
    .map((s) => {
      const spk =
        spkNames[s.spk] ||
        spkLabels[s.spk] ||
        String.fromCharCode(65 + (s.spk || 0))
      const time = s.start_time || ""
      const msg = s.msg || (s.words || []).map((w) => w.text).join(" ")
      return `${spk} [${time}] ${msg}`
    })
    .join("\n")
}

export default function SubtitleEditTab({
  sentences,
  subsSentences,
  setSubsSentences,
  subsSentencesRef,
  originalSpkList,
  setSentences,
  subsMaxWords,
  setSubsMaxWords,
  focusedWord,
  currentWordId,
  currentWordSentenceIdx,
  selectedWordIds,
  searchResultsSet,
  currentSearchWordId,
  silenceThresholdMs,
  wordRefs,
  onWordClick,
  onDeleteSentence,
  setFocusedWord,
  isUpload,
  onChangeSpk,
  editingWord,
  onStartEditing,
  onWordTextUpdate,
  onWordEditingEnd,
  handleCaptionClick,
  isConnected,
  pushUndo,
  spkNames = {},
}) {
  const [checkedSentences, setCheckedSentences] = useState(new Set())
  const [subsCopied, setSubsCopied] = useState(false)

  const allSpkList = [
    ...new Set([
      ...originalSpkList,
      ...Object.keys(spkNames).map(Number),
    ]),
  ].sort((a, b) => a - b)

  const handleCheckChange = useCallback((sentenceIdx, checked) => {
    setCheckedSentences((prev) => {
      const next = new Set(prev)
      if (checked) next.add(sentenceIdx)
      else next.delete(sentenceIdx)
      return next
    })
  }, [])

  const handleBulkSpkChange = useCallback((newSpk) => {
    if (pushUndo) pushUndo()
    setSubsSentences((prev) => {
      const next = prev.map((s, idx) =>
        checkedSentences.has(idx) ? { ...s, spk: newSpk } : s
      )
      subsSentencesRef.current = next
      return next
    })
    setCheckedSentences(new Set())
  }, [checkedSentences, setSubsSentences, subsSentencesRef, pushUndo])

  const handleSelectAll = useCallback(() => {
    if (checkedSentences.size === subsSentences.length) {
      setCheckedSentences(new Set())
    } else {
      setCheckedSentences(new Set(subsSentences.map((_, i) => i)))
    }
  }, [checkedSentences.size, subsSentences.length])

  return (
    <div className="flex flex-col flex-1 min-h-0">
      <div className="px-4 py-2 border-b border-border">
        <div className="flex items-center justify-between">
          {checkedSentences.size > 0 ? (
            <div className="flex items-center gap-2">
              <span className="text-xs font-medium text-primary">
                {checkedSentences.size}개 선택 →
              </span>
              {allSpkList.map((spk) => {
                const spkColors = ["#4caf50", "#2196f3", "#f44336", "#ff9800", "#9c27b0", "#00bcd4"]
                const color = spkColors[spk] || spkColors[0]
                return (
                  <Button
                    key={spk}
                    variant="secondary"
                    size="sm"
                    className="h-7 text-xs px-3 gap-1.5"
                    onClick={() => handleBulkSpkChange(spk)}
                  >
                    <span className="inline-block w-2 h-2 rounded-full" style={{ background: color }} />
                    {spkNames[spk] || `화자 ${spkLabels[spk] || spk + 1}`}
                  </Button>
                )
              })}
              <Button
                variant="outline"
                size="sm"
                className="h-7 text-xs px-3 text-muted-foreground"
                onClick={() => setCheckedSentences(new Set())}
              >
                선택 해제
              </Button>
            </div>
          ) : (
            <div className="flex items-center gap-3 w-full">
            <span className="text-[11px] text-muted-foreground whitespace-nowrap">
              {subsMaxWords}단어
            </span>
            <input
              type="range"
              min={2}
              max={8}
              value={subsMaxWords}
              className="word-count-slider"
              style={{ width: 200 }}
              onChange={(e) => {
                setSubsMaxWords(parseInt(e.target.value, 10))
              }}
              onMouseUp={(e) => {
                const val = parseInt(e.target.value, 10)
                // 기존 화자 변경 매핑 + 자막에서 K로 토글한 is_deleted 보존
                const wordSpkMap = new Map()
                const wordDeletedMap = new Map()
                subsSentences.forEach((s) => {
                  s.words?.forEach((w) => {
                    if (!w.id) return
                    wordSpkMap.set(w.id, s.spk)
                    wordDeletedMap.set(w.id, w.is_deleted)
                  })
                })
                const subs = splitForSubtitles(sentences, val).map((s) => {
                  // 자막 단위 is_deleted 복원
                  const words = s.words?.map((w) =>
                    wordDeletedMap.has(w.id)
                      ? { ...w, is_deleted: wordDeletedMap.get(w.id) }
                      : w,
                  )
                  // 첫 번째 단어의 spk로 문장 화자 결정
                  const firstWord = words?.find((w) => w.id && wordSpkMap.has(w.id))
                  const spkOverride = firstWord ? wordSpkMap.get(firstWord.id) : s.spk
                  return { ...s, words, spk: spkOverride }
                })
                subsSentencesRef.current = subs
                startTransition(() => {
                  setSubsSentences(subs)
                })
              }}
            />
            <div className="flex-1" />
            <button
              className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors mr-2"
              disabled={subsSentences.length === 0}
              onClick={() => {
                const textarea = document.createElement("textarea")
                textarea.value = subsToText(subsSentences, spkNames)
                textarea.style.position = "fixed"
                textarea.style.opacity = "0"
                document.body.appendChild(textarea)
                textarea.select()
                document.execCommand("copy")
                document.body.removeChild(textarea)
                setSubsCopied(true)
                setTimeout(() => setSubsCopied(false), 1500)
              }}
            >
              {subsCopied ? (
                <>
                  <Check className="h-3 w-3" />
                  복사됨
                </>
              ) : (
                <>
                  <Copy className="h-3 w-3" />
                  텍스트 복사
                </>
              )}
            </button>
            <Button
              size="sm"
              className="h-7 shrink-0"
              onClick={handleCaptionClick}
              disabled={!isConnected || subsSentences.length === 0}
            >
              시퀀스에 자막 적용
            </Button>
            </div>
          )}
        </div>
      </div>
      <div className="flex-1 min-h-0 overflow-y-auto px-4 py-3">
      <SentenceList
        sentences={subsSentences}
        originalSentences={sentences}
        mode="subs"
        focusedWord={focusedWord}
        currentWordId={currentWordId}
        currentWordSentenceIdx={currentWordSentenceIdx}
        selectedWordIds={selectedWordIds}
        searchResultsSet={searchResultsSet}
        currentSearchWordId={currentSearchWordId}
        silenceThresholdMs={silenceThresholdMs}
        wordRefs={wordRefs}
        onWordClick={onWordClick}
        onDeleteSentence={onDeleteSentence}
        onSentencePlay={(sIdx, wIdx) =>
          setFocusedWord({ sentenceIdx: sIdx, wordIdx: wIdx })
        }
        isUpload={isUpload}
        onChangeSpk={onChangeSpk}
        spkList={[...new Set(subsSentences.map((s) => s.spk || 0))].sort()}
        editingWord={editingWord}
        onStartEditing={onStartEditing}
        onWordTextUpdate={onWordTextUpdate}
        onWordEditingEnd={onWordEditingEnd}
        checkedSentences={checkedSentences}
        onCheckChange={handleCheckChange}
        onSelectSameSpk={(spk) => {
          const indices = new Set()
          subsSentences.forEach((s, idx) => {
            if ((s.spk || 0) === spk) indices.add(idx)
          })
          setCheckedSentences(indices)
        }}
        spkNames={spkNames}
      />
      </div>
    </div>
  )
}
