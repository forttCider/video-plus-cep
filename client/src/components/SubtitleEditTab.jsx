import { startTransition, useState, useCallback } from "react"
import { Button } from "./ui/button"
import SentenceList from "./SentenceList"
import { splitForSubtitles } from "../js/subtitleSplitter"

const spkLabels = ["A", "B", "C", "D", "E", "F"]

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
}) {
  const [checkedSentences, setCheckedSentences] = useState(new Set())
  const [extraSpkList, setExtraSpkList] = useState([])

  // 전체 사용 가능한 화자 목록 (원본 + 추가된 화자)
  const allSpkList = [...new Set([...originalSpkList, ...extraSpkList])].sort()

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
                    화자 {spkLabels[spk] || spk + 1}
                  </Button>
                )
              })}
              {allSpkList.length < 6 && (
                <Button
                  variant="outline"
                  size="sm"
                  className="h-7 text-xs px-3 text-muted-foreground"
                  onClick={() => {
                    const nextSpk = allSpkList.length > 0 ? Math.max(...allSpkList) + 1 : 0
                    if (nextSpk < 6) setExtraSpkList((prev) => [...prev, nextSpk])
                  }}
                >
                  + 화자 추가
                </Button>
              )}
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
                // 기존 화자 변경 매핑 보존 (word id → spk)
                const wordSpkMap = new Map()
                subsSentences.forEach((s) => {
                  s.words?.forEach((w) => {
                    if (w.id) wordSpkMap.set(w.id, s.spk)
                  })
                })
                const subs = splitForSubtitles(sentences, val).map((s) => {
                  // 첫 번째 단어의 spk로 문장 화자 결정
                  const firstWord = s.words?.find((w) => w.id && wordSpkMap.has(w.id))
                  if (firstWord) {
                    return { ...s, spk: wordSpkMap.get(firstWord.id) }
                  }
                  return s
                })
                subsSentencesRef.current = subs
                startTransition(() => {
                  setSubsSentences(subs)
                })
              }}
            />
            <div className="flex-1" />
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
      />
      </div>
    </div>
  )
}
