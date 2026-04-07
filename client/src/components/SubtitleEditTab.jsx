import { Button } from "./ui/button"
import SentenceList from "./SentenceList"
import { splitForSubtitles } from "../js/subtitleSplitter"

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
}) {
  return (
    <div className="flex flex-col flex-1 min-h-0">
      <div className="px-4 py-2 border-b border-border">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <span className="text-xs font-medium text-muted-foreground">
              화자 {originalSpkList.length}명
            </span>
            {originalSpkList.map((fromSpk) => {
              const spkColors = [
                "#4caf50",
                "#2196f3",
                "#f44336",
                "#ff9800",
                "#9c27b0",
                "#00bcd4",
              ]
              const color = spkColors[fromSpk] || spkColors[0]
              return (
                <div key={fromSpk} className="flex items-center gap-1.5">
                  <span
                    className="inline-block w-2.5 h-2.5 rounded-full"
                    style={{ background: color }}
                  />
                  <select
                    className="bg-transparent text-xs border border-border rounded px-1.5 py-0.5 outline-none cursor-pointer"
                    style={{ color }}
                    value={(() => {
                      const matched = sentences.find(
                        (s) => s.original_spk === fromSpk,
                      )
                      return matched ? matched.spk || 0 : fromSpk
                    })()}
                    onChange={(e) => {
                      const toSpk = parseInt(e.target.value, 10)
                      if (!isNaN(toSpk)) {
                        setSentences((prev) =>
                          prev.map((s) =>
                            s.original_spk === fromSpk
                              ? { ...s, spk: toSpk }
                              : s,
                          ),
                        )
                        setSubsSentences((prev) => {
                          const next = prev.map((s) =>
                            s.original_spk === fromSpk
                              ? { ...s, spk: toSpk }
                              : s,
                          )
                          subsSentencesRef.current = next
                          return next
                        })
                      }
                    }}
                  >
                    {originalSpkList.map((spk) => (
                      <option
                        key={spk}
                        value={spk}
                        style={{ background: "#1e1e1e", color: "#fff" }}
                      >
                        화자 {["A","B","C","D","E","F"][spk] || spk + 1}
                      </option>
                    ))}
                  </select>
                </div>
              )
            })}
          </div>
          <div className="flex items-center gap-3">
            <span className="text-[11px] text-muted-foreground whitespace-nowrap">
              {subsMaxWords}단어
            </span>
            <input
              type="range"
              min={2}
              max={8}
              value={subsMaxWords}
              className="word-count-slider"
              style={{ flex: 1 }}
              onChange={(e) => {
                setSubsMaxWords(parseInt(e.target.value, 10))
              }}
              onMouseUp={(e) => {
                const val = parseInt(e.target.value, 10)
                const subs = splitForSubtitles(sentences, val)
                setSubsSentences(subs)
                subsSentencesRef.current = subs
              }}
            />
            <Button
              size="sm"
              className="h-7 shrink-0"
              onClick={handleCaptionClick}
              disabled={!isConnected || subsSentences.length === 0}
            >
              시퀀스에 자막 적용
            </Button>
          </div>
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
      />
      </div>
    </div>
  )
}
