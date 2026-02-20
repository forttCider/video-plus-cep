import React, { forwardRef } from "react";
import { Scissors, Undo2, Mic, Play } from "lucide-react";
import Word from "./Word";
import "./css/Sentence.css";
import { getTimelinePosition } from "../js/calculateTimeOffset";
import { setPlayerPosition } from "../js/cep-bridge";

const Sentence = forwardRef(
  (
    {
      sentence,
      sentences,
      sentenceIdx,
      focusedWord,
      currentWordId,
      selectedWordIds = new Set(),
      onWordClick,
      onWordContextMenu,
      onDeleteSentence,
      onRestoreSentence,
      searchResultsSet = new Set(),
      currentSearchWordId = null,
      wordRefs = { current: {} },
    },
    ref
  ) => {
    // 문장 재생
    const onClickPlaySentence = async () => {
      const words = sentence.words.filter((item) => !item.isDeleted);
      if (words.length === 0) return;

      const { start } = getTimelinePosition(words[0], sentences);
      await setPlayerPosition(start);
    };

    // 문장의 선택 가능한 단어들 (0n도 유효한 값으로 처리)
    const selectableWords = sentence.words.filter(
      (w) => !w.isDeleted && w.start_at_tick !== undefined && w.end_at_tick !== undefined
    );
    
    // 문장의 모든 선택 가능한 단어가 선택되었는지 확인
    const allWordsSelected = selectableWords.length > 0 && 
      selectableWords.every((w) => selectedWordIds.has(w.id || w.start_at));

    return (
      <div className="sentence" ref={ref}>
        <div className="sentence-options">
          <div className="sentence-edit">
            <p
              className={`sentence-cut ${allWordsSelected ? 'selected' : ''}`}
              onClick={() => onDeleteSentence(sentence)}
              title={allWordsSelected ? "선택 해제" : "선택 추가"}
            >
              {allWordsSelected ? <Undo2 size={14} /> : <Scissors size={14} />}
            </p>
            <p className="sentence-play" onClick={onClickPlaySentence}>
              <Play size={14} />
            </p>
          </div>
          <p className="sentence-spk"><Mic size={12} /> {(sentence.spk || 0) + 1}</p>
        </div>
        <div className="sentence-info">
          <p>
            {sentence.start_time} - {sentence.end_time}
          </p>
          <div className="sentence-words">
            {sentence.words.map((word, wordIdx) => {
              const isSearchMatch = searchResultsSet.has(word.id);
              const isCurrentSearchMatch = currentSearchWordId === word.id;
              const isFocused = focusedWord?.sentenceIdx === sentenceIdx && 
                               focusedWord?.wordIdx === wordIdx;
              const wordId = word.id || word.start_at;
              const isSelected = selectedWordIds.has(wordId);
              return (
                <Word
                  key={word.id}
                  word={word}
                  isCurrentWord={currentWordId === word.start_at}
                  isFocused={isFocused}
                  isSelected={isSelected}
                  isSearchMatch={isSearchMatch}
                  isCurrentSearchMatch={isCurrentSearchMatch}
                  onClick={() => onWordClick(word)}
                  onContextMenu={(e) =>
                    onWordContextMenu(e, word, sentence.start_at)
                  }
                  ref={(el) => (wordRefs.current[word.start_at] = el)}
                />
              );
            })}
          </div>
        </div>
      </div>
    );
  }
);

export default React.memo(Sentence, (prevProps, nextProps) => {
  // 같은 sentence 참조면 내부 변경 없음
  if (prevProps.sentence !== nextProps.sentence) return false;

  // focusedWord가 이 문장에 해당하는지 확인
  const prevHasFocus = prevProps.focusedWord?.sentenceIdx === prevProps.sentenceIdx;
  const nextHasFocus = nextProps.focusedWord?.sentenceIdx === nextProps.sentenceIdx;
  if (prevHasFocus !== nextHasFocus) return false;
  if (prevHasFocus && prevProps.focusedWord?.wordIdx !== nextProps.focusedWord?.wordIdx)
    return false;

  // currentWordId가 이 문장의 단어에 해당하는지 확인
  const prevHasCurrentWord = prevProps.sentence.words.some(
    (w) => w.start_at === prevProps.currentWordId
  );
  const nextHasCurrentWord = nextProps.sentence.words.some(
    (w) => w.start_at === nextProps.currentWordId
  );
  if (prevHasCurrentWord !== nextHasCurrentWord) return false;
  if (prevHasCurrentWord && prevProps.currentWordId !== nextProps.currentWordId)
    return false;

  // selectedWordIds 변경 확인
  if (prevProps.selectedWordIds !== nextProps.selectedWordIds) return false;

  // 검색 현재 단어가 이 문장에 해당하는지 확인
  const prevHasSearch = prevProps.sentence.words.some(
    (w) => w.id === prevProps.currentSearchWordId
  );
  const nextHasSearch = nextProps.sentence.words.some(
    (w) => w.id === nextProps.currentSearchWordId
  );
  if (prevHasSearch !== nextHasSearch) return false;

  // searchResultsSet 변경 확인
  if (prevProps.searchResultsSet !== nextProps.searchResultsSet) return false;

  return true;
});
