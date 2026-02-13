import React, { forwardRef } from "react";
import Word from "./Word";
import "./css/Sentence.css";
import { getTimelinePosition } from "../js/calculateTimeOffset";
import { setPlayerPosition } from "../js/cep-bridge";

const Sentence = forwardRef(
  (
    {
      sentence,
      sentences,
      currentWordId,
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

    return (
      <div className="sentence" ref={ref}>
        <div className="sentence-options">
          <div className="sentence-edit">
            <p
              className="sentence-cut"
              onClick={() =>
                sentence.isDeleted
                  ? onRestoreSentence(sentence)
                  : onDeleteSentence(sentence)
              }
            >
              {sentence.isDeleted ? "↩" : "✂"}
            </p>
            <p className="sentence-play" onClick={onClickPlaySentence}>
              ▶
            </p>
          </div>
          <p className="sentence-spk">🎤 {(sentence.spk || 0) + 1}</p>
        </div>
        <div className="sentence-info">
          <p>
            {sentence.start_time} - {sentence.end_time}
          </p>
          <div className="sentence-words">
            {sentence.words.map((word) => {
              const isSearchMatch = searchResultsSet.has(word.id);
              const isCurrentSearchMatch = currentSearchWordId === word.id;
              return (
                <Word
                  key={word.id}
                  word={word}
                  isCurrentWord={currentWordId === word.start_at}
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
