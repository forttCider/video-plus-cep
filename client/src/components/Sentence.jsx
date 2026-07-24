import React, { forwardRef, useState, useRef, useEffect, useLayoutEffect } from "react";
import { Scissors, Undo2, Play, ChevronDown } from "lucide-react";
import Word from "./Word";
import "./css/Sentence.css";
import { getTimelinePosition } from "../js/calculateTimeOffset";
import {
  setPlayerPosition,
  beginTextEditing,
  endTextEditing,
} from "../js/cep-bridge";

const spkBadgeColors = ["#4caf50", "#2196f3", "#f44336", "#ff9800", "#9c27b0", "#00bcd4"];
const spkLabels = ["A", "B", "C", "D", "E", "F"];

// 단어 사이 커서 (브루식) — 클릭해서 커서 놓고 Enter=분할 / Backspace=이전 문장과 병합
function WordGap({ sentenceIdx, arrayIdx, canSplit, canMerge, onSplit, onMerge }) {
  return (
    <span
      className="word-gap"
      tabIndex={0}
      role="button"
      aria-label={canMerge ? "이전 자막과 병합" : "여기서 자막 분할"}
      title={
        canMerge
          ? "Backspace: 이전 자막과 병합"
          : canSplit
            ? "Enter: 여기서 자막 분할"
            : ""
      }
      onKeyDown={(e) => {
        if (e.key === "Enter" && canSplit) {
          e.preventDefault();
          onSplit(sentenceIdx, arrayIdx);
        } else if (e.key === "Backspace" && canMerge) {
          e.preventDefault();
          onMerge(sentenceIdx);
        }
      }}
    >
      <span className="word-gap-caret" />
    </span>
  );
}

// 문장 단위 편집 인풋 (브루식) — 단어 칩 아래에서 문장 전체를 자유롭게 수정
function SentenceCaptionInput({ value, onCommit }) {
  const [text, setText] = useState(value);
  const focusedRef = useRef(false);
  const syncingRef = useRef(false); // 캐럿 동기화용 blur→focus 중 commit/키원복 건너뛰기
  const taRef = useRef(null);

  // 외부(재분할·다른 편집)로 값이 바뀌면 포커스 없을 때만 동기화
  useEffect(() => {
    if (!focusedRef.current) setText(value);
  }, [value]);

  // 내용에 맞춰 높이 자동 조절 (paint 전에 측정 → 깜빡임/눌림 방지)
  useLayoutEffect(() => {
    const el = taRef.current;
    if (!el) return;
    el.style.height = "auto";
    const h = Math.max(el.scrollHeight, 20);
    el.style.height = h + "px";
  }, [text]);

  const commit = () => {
    if (text !== value) onCommit(text);
  };

  return (
    <textarea
      ref={taRef}
      className="sentence-caption-input"
      value={text}
      rows={1}
      spellCheck={false}
      onChange={(e) => setText(e.target.value)}
      onFocus={() => {
        focusedRef.current = true;
        // 편집 중 키 가로채기 억제 → CEP 캐럿/한글 IME 정상화
        beginTextEditing();
      }}
      onBlur={() => {
        if (syncingRef.current) return; // 동기화용 blur는 무시
        focusedRef.current = false;
        endTextEditing();
        commit();
      }}
      onMouseDown={() => beginTextEditing()}
      onMouseUp={(e) => {
        // 클릭 위치 저장 후 blur→focus로 CEF 편집 컨텍스트 리셋 → 클릭 위치 채택
        const el = e.target;
        const s = el.selectionStart;
        const en = el.selectionEnd;
        syncingRef.current = true;
        el.blur();
        el.focus();
        try {
          el.setSelectionRange(s, en);
        } catch (err) {}
        syncingRef.current = false;
      }}
      onKeyDown={(e) => {
        if (e.key === "Enter" && !e.shiftKey) {
          e.preventDefault();
          e.target.blur();
        }
      }}
    />
  );
}

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
      onDeleteSentence,
      onSentencePlay,
      searchResultsSet = new Set(),
      currentSearchWordId = null,
      searchQuery = "",
      searchCaseSensitive = false,
      searchWholeWord = false,
      wordRefs = { current: {} },
      silenceThresholdMs = 1000,
      mode = "cut",
      onChangeSpk,
      spkList = [0, 1],
      editingWord = null,
      onStartEditing,
      onWordTextUpdate,
      onSentenceTextUpdate,
      onSplitCaption,
      onMergeCaption,
      onWordEditingEnd,
      originalSentences,
      isChecked = false,
      onCheckChange,
      onSelectSameSpk,
      spkNames = {},
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
    const customName = spkNames[spk];
    const badgeLabel = customName || spkLabels[spk] || String(spk);

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
                style={{ color: badgeColor, background: "transparent" }}
              >
                {badgeLabel}
              </span>
              <span className="sentence-time">
                {sentence.start_time} — {sentence.end_time}
              </span>
            </div>
            {onCheckChange ? (
              <div className="sentence-check-group">
                <label className={`sentence-custom-checkbox ${isChecked ? "checked" : ""}`}>
                  <input
                    type="checkbox"
                    checked={isChecked}
                    onChange={(e) => onCheckChange(sentenceIdx, e.target.checked)}
                  />
                  {isChecked && <svg viewBox="0 0 12 10" className="sentence-check-icon"><polyline points="1.5 5 4.5 8 10.5 2" /></svg>}
                </label>
                {onSelectSameSpk && (() => {
                  const [menuOpen, setMenuOpen] = useState(false)
                  const menuRef = useRef(null)

                  useEffect(() => {
                    if (!menuOpen) return
                    const handleClickOutside = (e) => {
                      if (menuRef.current && !menuRef.current.contains(e.target)) setMenuOpen(false)
                    }
                    document.addEventListener("mousedown", handleClickOutside)
                    return () => document.removeEventListener("mousedown", handleClickOutside)
                  }, [menuOpen])

                  return (
                    <div className="sentence-check-dropdown" ref={menuRef}>
                      <button
                        className="sentence-check-arrow"
                        onClick={() => setMenuOpen(!menuOpen)}
                      >
                        <ChevronDown size={12} />
                      </button>
                      {menuOpen && (
                        <div className="sentence-check-menu">
                          <button
                            className="sentence-check-menu-item"
                            onClick={() => { onSelectSameSpk(spk); setMenuOpen(false) }}
                          >
                            {customName || `화자 ${spkLabels[spk] || spk + 1}`} 모두 선택
                          </button>
                        </div>
                      )}
                    </div>
                  )
                })()}
              </div>
            ) : (
              <select
                className="sentence-spk-select"
                value={spk}
                onChange={(e) => onChangeSpk?.(sentenceIdx, parseInt(e.target.value, 10))}
              >
              {spkList.map((s) => (
                <option key={s} value={s} style={{ background: "#1e1e1e", color: "#fff" }}>
                  {spkNames[s] || `화자 ${spkLabels[s] || s + 1}`}
                </option>
              ))}
            </select>
            )}
          </div>

          {/* 하단: 단어들 */}
          <div className={"sentence-words" + (mode === "subs" ? " sentence-words--chips" : "")}>
            {(() => {
              const renderWord = (word, wordIdx) => {
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
                    sentenceIdx={sentenceIdx}
                    wordIdx={wordIdx}
                    isCurrentWord={currentWordId === word.start_at}
                    isFocused={isFocused}
                    isSelected={isSelected}
                    isSearchMatch={isSearchMatch}
                    isCurrentSearchMatch={isCurrentSearchMatch}
                    searchQuery={searchQuery}
                    searchCaseSensitive={searchCaseSensitive}
                    searchWholeWord={searchWholeWord}
                    isEditing={isEditingThis}
                    onClick={(e) => {
                      onWordClick(word, sentenceIdx, wordIdx);
                      // 자막 모드: 단어 칩은 나누기/타이밍용 — 클릭 시 해당 시간으로 재생헤드 이동
                      if (mode === "subs") {
                        const { start } = getTimelinePosition(
                          word,
                          originalSentences || sentences,
                        );
                        setPlayerPosition(start);
                      }
                    }}
                    onTextUpdate={(newText) => onWordTextUpdate?.(sentenceIdx, wordIdx, newText, word.id)}
                    onEditingEnd={onWordEditingEnd}
                    mode={mode}
                    ref={(el) => (wordRefs.current[word.start_at] = el)}
                  />
                );
              };

              // 렌더 대상 단어 (무음/편집마커 제외)
              const rendered = [];
              sentence.words.forEach((word, wordIdx) => {
                if (isSilenceHidden(word)) return;
                if (mode === "subs" && word.is_edit) return;
                rendered.push({ word, wordIdx });
              });

              // 자막 모드: 단어 사이 커서(gap) 끼워넣기
              if (mode === "subs" && onSplitCaption) {
                return rendered.map(({ word, wordIdx }, i) => (
                  <React.Fragment key={word.id}>
                    <WordGap
                      sentenceIdx={sentenceIdx}
                      arrayIdx={wordIdx}
                      canSplit={i > 0}
                      canMerge={i === 0}
                      onSplit={onSplitCaption}
                      onMerge={onMergeCaption}
                    />
                    {renderWord(word, wordIdx)}
                  </React.Fragment>
                ));
              }
              return rendered.map(({ word, wordIdx }) => renderWord(word, wordIdx));
            })()}
          </div>

          {/* 문장 단위 편집 (브루식) — 자막 모드에서만 */}
          {mode === "subs" && onSentenceTextUpdate && (
            <SentenceCaptionInput
              value={
                sentence.captionText ??
                sentence.words
                  .filter((w) => !w.is_deleted && !w.is_edit && w.text)
                  .map((w) => w.text)
                  .join(" ")
              }
              onCommit={(t) => onSentenceTextUpdate(sentenceIdx, t)}
            />
          )}
        </div>
      </div>
    );
  }
);

Sentence.displayName = "Sentence";

export default React.memo(Sentence, (prevProps, nextProps) => {
  // focusedWord: 이 문장에 영향을 주는 경우만 리렌더
  const prevFocusedHere = prevProps.focusedWord?.sentenceIdx === prevProps.sentenceIdx;
  const nextFocusedHere = nextProps.focusedWord?.sentenceIdx === nextProps.sentenceIdx;
  const focusedChanged = prevFocusedHere || nextFocusedHere
    ? prevProps.focusedWord?.sentenceIdx !== nextProps.focusedWord?.sentenceIdx ||
      prevProps.focusedWord?.wordIdx !== nextProps.focusedWord?.wordIdx
    : false;

  // currentWordId: 이 문장 내 단어에 해당하는지 직접 확인 (subs 모드 대응)
  const currentChanged = prevProps.currentWordId !== nextProps.currentWordId
    && (
      prevProps.sentence?.words?.some((w) => w.start_at === prevProps.currentWordId) ||
      nextProps.sentence?.words?.some((w) => w.start_at === nextProps.currentWordId)
    );

  // editingWord: 이 문장에 영향을 주는 경우만 리렌더
  const prevEditingHere = prevProps.editingWord?.sentenceIdx === prevProps.sentenceIdx;
  const nextEditingHere = nextProps.editingWord?.sentenceIdx === nextProps.sentenceIdx;
  const editingChanged = prevEditingHere || nextEditingHere
    ? prevProps.editingWord?.sentenceIdx !== nextProps.editingWord?.sentenceIdx ||
      prevProps.editingWord?.wordIdx !== nextProps.editingWord?.wordIdx
    : false;

  // spkNames: 현재 문장의 화자 이름만 비교 (다른 화자 이름 바뀌어도 영향 없음)
  const spk = nextProps.sentence?.spk || 0;
  const spkNameChanged =
    (prevProps.spkNames?.[spk] || "") !== (nextProps.spkNames?.[spk] || "");

  // 검색 결과 변경: 이 문장에 영향이 있을 때만 리렌더
  const searchSetChanged =
    prevProps.searchResultsSet !== nextProps.searchResultsSet &&
    nextProps.sentence?.words?.some(
      (w) =>
        (prevProps.searchResultsSet?.has(w.id) || false) !==
        (nextProps.searchResultsSet?.has(w.id) || false),
    );
  const currentSearchChanged =
    prevProps.currentSearchWordId !== nextProps.currentSearchWordId &&
    nextProps.sentence?.words?.some(
      (w) =>
        w.id === prevProps.currentSearchWordId ||
        w.id === nextProps.currentSearchWordId,
    );

  return (
    prevProps.sentence === nextProps.sentence &&
    prevProps.sentenceIdx === nextProps.sentenceIdx &&
    !focusedChanged &&
    !currentChanged &&
    !editingChanged &&
    prevProps.selectedWordIds === nextProps.selectedWordIds &&
    prevProps.mode === nextProps.mode &&
    prevProps.isChecked === nextProps.isChecked &&
    prevProps.silenceThresholdMs === nextProps.silenceThresholdMs &&
    !spkNameChanged &&
    !searchSetChanged &&
    !currentSearchChanged &&
    prevProps.searchQuery === nextProps.searchQuery &&
    prevProps.searchCaseSensitive === nextProps.searchCaseSensitive &&
    prevProps.searchWholeWord === nextProps.searchWholeWord
  );
});
