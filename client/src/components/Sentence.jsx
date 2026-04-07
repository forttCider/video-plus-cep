import React, { forwardRef } from "react";
import { Scissors, Undo2, Play } from "lucide-react";
import Word from "./Word";
import "./css/Sentence.css";
import { getTimelinePosition } from "../js/calculateTimeOffset";
import { setPlayerPosition } from "../js/cep-bridge";

const spkBadgeColors = ["#4caf50", "#2196f3", "#f44336", "#ff9800", "#9c27b0", "#00bcd4"];
const spkLabels = ["A", "B", "C", "D", "E", "F"];

const Sentence = forwardRef(
  (
    {
      sentence,
      sentences,
      sentenceIdx,
      focusedWord,
      currentWordId,
      currentWordSentenceIdx,
      selectedWordIds = new Set(),
      onWordClick,
      onDeleteSentence,
      onSentencePlay,
      searchResultsSet = new Set(),
      currentSearchWordId = null,
      wordRefs = { current: {} },
      silenceThresholdMs = 1000,
      mode = "cut",
      onChangeSpk,
      spkList = [0, 1],
      editingWord = null,
      onStartEditing,
      onWordTextUpdate,
      onWordEditingEnd,
      originalSentences,
    },
    ref
  ) => {
    const onClickPlaySentence = async () => {
      const words = sentence.words.filter((item) => !item.is_deleted);
      if (words.length === 0) return;
      const { start } = getTimelinePosition(words[0], originalSentences || sentences);
      await setPlayerPosition(start);
      if (onSentencePlay) onSentencePlay(sentenceIdx, 0);
    };

    const isSilenceHidden = (w) =>
      w.edit_points?.type === "silence" && w.duration < silenceThresholdMs;

    const selectableWords = sentence.words.filter(
      (w) => !w.is_deleted && !isSilenceHidden(w) && w.start_at_tick !== undefined && w.end_at_tick !== undefined
    );
    const allWordsSelected = selectableWords.length > 0 &&
      selectableWords.every((w) => selectedWordIds.has(w.id || w.start_at));

    const spk = sentence.spk || 0;
    const badgeColor = spkBadgeColors[spk] || spkBadgeColors[0];
    const badgeLabel = spkLabels[spk] || String(spk);

    const spkStyle = {
      borderLeft: "3px solid " + badgeColor,
    };

    return (
      <div className="sentence" ref={ref} style={spkStyle}>
        {/* 왼쪽: 가위/재생 */}
        <div className="sentence-actions">
          {mode === "cut" && (
            <button
              className={`sentence-action-btn ${allWordsSelected ? "selected" : ""}`}
              onClick={() => onDeleteSentence(sentence)}
              title={allWordsSelected ? "선택 해제" : "선택 추가"}
            >
              {allWordsSelected ? <Undo2 size={14} /> : <Scissors size={14} />}
            </button>
          )}
          <button className="sentence-action-btn" onClick={onClickPlaySentence}>
            <Play size={14} />
          </button>
        </div>

        {/* 오른쪽: 내용 */}
        <div className="sentence-content">
          {/* 상단: 화자뱃지 + 시간 + 화자 select */}
          <div className="sentence-header">
            <div className="sentence-header-left">
              <span
                className="sentence-spk-badge"
                style={{ background: badgeColor }}
              >
                {badgeLabel}
              </span>
              <span className="sentence-time">
                {sentence.start_time} — {sentence.end_time}
              </span>
            </div>
            <select
              className="sentence-spk-select"
              value={spk}
              onChange={(e) => onChangeSpk?.(sentenceIdx, parseInt(e.target.value, 10))}
            >
              {spkList.map((s) => (
                <option key={s} value={s} style={{ background: "#1e1e1e", color: "#fff" }}>
                  화자 {spkLabels[s] || s + 1}
                </option>
              ))}
            </select>
          </div>

          {/* 하단: 단어들 */}
          <div className="sentence-words">
            {sentence.words.map((word, wordIdx) => {
              if (isSilenceHidden(word)) return null;
              if (mode === "subs" && word.is_edit) return null;
              const isSearchMatch = searchResultsSet.has(word.id);
              const isCurrentSearchMatch = currentSearchWordId === word.id;
              const isFocused = focusedWord?.sentenceIdx === sentenceIdx &&
                               focusedWord?.wordIdx === wordIdx;
              const wordId = word.id || word.start_at;
              const isSelected = mode === "cut" && selectedWordIds.has(wordId);
              const isEditingThis = editingWord?.sentenceIdx === sentenceIdx &&
                                    editingWord?.wordIdx === wordIdx;
              return (
                <Word
                  key={word.id}
                  word={word}
                  isCurrentWord={currentWordId === word.start_at}
                  isFocused={isFocused}
                  isSelected={isSelected}
                  isSearchMatch={isSearchMatch}
                  isCurrentSearchMatch={isCurrentSearchMatch}
                  isEditing={isEditingThis}
                  onClick={(e) => {
                    onWordClick(word);
                    if (mode === "subs" && e.detail >= 2 && !word.is_deleted) {
                      onStartEditing?.(sentenceIdx, wordIdx);
                    }
                  }}
                  onTextUpdate={(newText) => onWordTextUpdate?.(sentenceIdx, wordIdx, newText, word.id)}
                  onEditingEnd={onWordEditingEnd}
                  mode={mode}
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

Sentence.displayName = "Sentence";

export default React.memo(Sentence, (prevProps, nextProps) => {
  return (
    prevProps.sentence === nextProps.sentence &&
    prevProps.focusedWord === nextProps.focusedWord &&
    prevProps.currentWordId === nextProps.currentWordId &&
    prevProps.selectedWordIds === nextProps.selectedWordIds &&
    prevProps.editingWord === nextProps.editingWord &&
    prevProps.mode === nextProps.mode
  );
});
