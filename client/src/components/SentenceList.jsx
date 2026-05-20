import React from "react"

import Sentence from "./Sentence"

export default function SentenceList({
  sentences,
  focusedWord,
  currentWordId,
  currentWordSentenceIdx,
  selectedWordIds,
  searchResultsSet,
  currentSearchWordId,
  searchQuery,
  searchCaseSensitive,
  searchWholeWord,
  silenceThresholdMs,
  wordRefs,
  onWordClick,
  onDeleteSentence,
  onSentencePlay,
  isUpload,
  mode = "cut",
  onChangeSpk,
  spkList = [0, 1],
  editingWord,
  onStartEditing,
  onWordTextUpdate,
  onWordEditingEnd,
  originalSentences,
  checkedSentences,
  onCheckChange,
  onSelectSameSpk,
  spkNames,
}) {
  return (
    <div className="flex-1 overflow-y-auto">
        {isUpload ? (
          <div className="text-muted-foreground text-center py-8">
            <div className="animate-pulse">
              <p className="text-base">받아쓰는 중...</p>
            </div>
          </div>
        ) : sentences.length > 0 ? (
          sentences.map((sentence, sentenceIdx) => (
            <Sentence
              key={sentence.id}
              sentence={sentence}
              sentences={sentences}
              sentenceIdx={sentenceIdx}
              focusedWord={focusedWord}
              currentWordId={currentWordId}
              currentWordSentenceIdx={currentWordSentenceIdx}
              selectedWordIds={selectedWordIds}
              onWordClick={onWordClick}
              onDeleteSentence={onDeleteSentence}
              onSentencePlay={(sIdx, wIdx) =>
                onSentencePlay(sIdx, wIdx)
              }
              searchResultsSet={searchResultsSet}
              currentSearchWordId={currentSearchWordId}
              searchQuery={searchQuery}
              searchCaseSensitive={searchCaseSensitive}
              searchWholeWord={searchWholeWord}
              wordRefs={wordRefs}
              silenceThresholdMs={silenceThresholdMs}
              mode={mode}
              onChangeSpk={onChangeSpk}
              spkList={spkList}
              editingWord={editingWord}
              onStartEditing={onStartEditing}
              onWordTextUpdate={onWordTextUpdate}
              onWordEditingEnd={onWordEditingEnd}
              originalSentences={originalSentences}
              isChecked={checkedSentences ? checkedSentences.has(sentenceIdx) : false}
              onCheckChange={onCheckChange}
              onSelectSameSpk={onSelectSameSpk}
              spkNames={spkNames}
            />
          ))
        ) : (
          <p className="text-muted-foreground text-center py-8">
            소스클립을 받아쓰지 않았습니다
          </p>
        )}
    </div>
  )
}
