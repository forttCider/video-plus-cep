import { useEffect, useRef, useCallback } from "react"

/**
 * 자막편집 전용 키보드 단축키
 * N: 이전 단어와 합치기
 * M: 다음 단어와 합치기
 * Enter: 현재 위치에서 문장 나누기
 * Backspace: 이전 단어와 합치기 (N과 동일)
 * Ctrl+Z: 실행 취소
 * Ctrl+Shift+Z: 다시 실행
 */
export default function useSubtitleKeyboard({
  activeTab,
  subsSentencesRef,
  focusedWordRef,
  setSubsSentences,
  setFocusedWord,
  sentencesRef,
}) {
  const undoStackRef = useRef([])
  const redoStackRef = useRef([])

  const serialize = (data) =>
    JSON.stringify(data, (_, v) => (typeof v === "bigint" ? `__bigint__${v}` : v))
  const deserialize = (str) =>
    JSON.parse(str, (_, v) =>
      typeof v === "string" && v.startsWith("__bigint__") ? BigInt(v.slice(10)) : v,
    )

  const pushUndo = useCallback(() => {
    if (!subsSentencesRef.current) return
    undoStackRef.current.push(serialize(subsSentencesRef.current))
    redoStackRef.current = []
    // 최대 50개
    if (undoStackRef.current.length > 50) undoStackRef.current.shift()
  }, [sentencesRef])

  const undo = useCallback(() => {
    if (undoStackRef.current.length === 0) return
    redoStackRef.current.push(serialize(subsSentencesRef.current))
    const prev = deserialize(undoStackRef.current.pop())
    setSubsSentences(prev)
    subsSentencesRef.current = prev
  }, [subsSentencesRef, setSubsSentences])

  const redo = useCallback(() => {
    if (redoStackRef.current.length === 0) return
    undoStackRef.current.push(serialize(subsSentencesRef.current))
    const next = deserialize(redoStackRef.current.pop())
    setSubsSentences(next)
    subsSentencesRef.current = next
  }, [subsSentencesRef, setSubsSentences])

  // Backspace: 이전 문장과 현재 문장 합치기 (단어 합치기 없음)
  const mergeSentenceWithPrev = useCallback(() => {
    if (!focusedWordRef.current || !subsSentencesRef.current) return
    const { sentenceIdx } = focusedWordRef.current
    if (sentenceIdx <= 0) return
    const subs = subsSentencesRef.current
    const sentence = subs[sentenceIdx]
    const prevSentence = subs[sentenceIdx - 1]
    if (!sentence || !prevSentence) return

    pushUndo()
    const merged = {
      ...prevSentence,
      words: [...prevSentence.words, ...sentence.words],
      end_time: sentence.end_time,
      duration: (sentence.end_at || sentence.start_at) - prevSentence.start_at,
      msg: [prevSentence.msg, sentence.msg].filter(Boolean).join(" "),
    }
    const newSubs = [
      ...subs.slice(0, sentenceIdx - 1),
      merged,
      ...subs.slice(sentenceIdx + 1),
    ]
    setSubsSentences(newSubs)
    subsSentencesRef.current = newSubs
    setFocusedWord({ sentenceIdx: sentenceIdx - 1, wordIdx: prevSentence.words.length })
  }, [focusedWordRef, subsSentencesRef, setSubsSentences, setFocusedWord, pushUndo])

  // 이전 단어와 합치기: focusedWord의 텍스트를 이전 단어에 붙이고 현재 단어 제거
  const mergeWithPrev = useCallback(() => {
    if (!focusedWordRef.current || !subsSentencesRef.current) return
    const { sentenceIdx, wordIdx } = focusedWordRef.current
    const subs = subsSentencesRef.current
    const sentence = subs[sentenceIdx]
    if (!sentence) return

    // 현재 문장에서 표시 가능한 단어만 (is_edit, is_deleted 제외)
    const visibleWords = sentence.words.filter(
      (w) => !w.is_deleted && !w.is_edit && w.text,
    )
    const currentWord = sentence.words[wordIdx]
    // indexOf 대신 id로 찾기
    const visibleIdx = visibleWords.findIndex((w) => w.id === currentWord?.id)

    if (visibleIdx <= 0) {
      // 첫 단어면 이전 문장과 합치기
      if (sentenceIdx <= 0) return
      const prevSentence = subs[sentenceIdx - 1]
      if (!prevSentence) return

      pushUndo()
      // 이전 문장에 현재 문장의 모든 단어를 합침
      const merged = {
        ...prevSentence,
        words: [...prevSentence.words, ...sentence.words],
        end_time: sentence.end_time,
        duration: (sentence.end_at || sentence.start_at) - prevSentence.start_at,
        msg: [prevSentence.msg, sentence.msg].filter(Boolean).join(" "),
      }
      const newSubs = [
        ...subs.slice(0, sentenceIdx - 1),
        merged,
        ...subs.slice(sentenceIdx + 1),
      ]
      setSubsSentences(newSubs)
      subsSentencesRef.current = newSubs
      setFocusedWord({ sentenceIdx: sentenceIdx - 1, wordIdx: prevSentence.words.length })
      return
    }

    pushUndo()
    const prevWord = visibleWords[visibleIdx - 1]
    const prevWordIdx = sentence.words.indexOf(prevWord)

    const newSubs = subs.map((s, si) => {
      if (si !== sentenceIdx) return s
      return {
        ...s,
        words: s.words.map((w, wi) => {
          if (wi === prevWordIdx) {
            return { ...w, text: w.text + currentWord.text, end_at: currentWord.end_at, end_at_tick: currentWord.end_at_tick, end_time: currentWord.end_time }
          }
          if (wi === wordIdx) {
            return { ...w, is_deleted: true }
          }
          return w
        }),
      }
    })
    setSubsSentences(newSubs)
    subsSentencesRef.current = newSubs
    setFocusedWord({ sentenceIdx, wordIdx: prevWordIdx })
  }, [focusedWordRef, subsSentencesRef, setSubsSentences, setFocusedWord, pushUndo])

  // 다음 단어와 합치기
  const mergeWithNext = useCallback(() => {
    if (!focusedWordRef.current || !subsSentencesRef.current) return
    const { sentenceIdx, wordIdx } = focusedWordRef.current
    const subs = subsSentencesRef.current
    const sentence = subs[sentenceIdx]
    if (!sentence) return

    const visibleWords = sentence.words.filter(
      (w) => !w.is_deleted && !w.is_edit && w.text,
    )
    const currentWord = sentence.words[wordIdx]
    const visibleIdx = visibleWords.indexOf(currentWord)

    if (visibleIdx < 0 || visibleIdx >= visibleWords.length - 1) return

    pushUndo()
    const nextWord = visibleWords[visibleIdx + 1]
    const nextWordIdx = sentence.words.indexOf(nextWord)

    const newSubs = subs.map((s, si) => {
      if (si !== sentenceIdx) return s
      return {
        ...s,
        words: s.words.map((w, wi) => {
          if (wi === wordIdx) {
            return { ...w, text: w.text + nextWord.text, end_at: nextWord.end_at, end_at_tick: nextWord.end_at_tick, end_time: nextWord.end_time }
          }
          if (wi === nextWordIdx) {
            return { ...w, is_deleted: true }
          }
          return w
        }),
      }
    })
    setSubsSentences(newSubs)
    subsSentencesRef.current = newSubs
  }, [focusedWordRef, subsSentencesRef, setSubsSentences, pushUndo])

  // 현재 위치에서 문장 나누기
  const splitSentence = useCallback(() => {
    if (!focusedWordRef.current || !subsSentencesRef.current) return
    const { sentenceIdx, wordIdx } = focusedWordRef.current
    const subs = subsSentencesRef.current
    const sentence = subs[sentenceIdx]
    if (!sentence || wordIdx <= 0) return

    pushUndo()
    const beforeWords = sentence.words.slice(0, wordIdx)
    const afterWords = sentence.words.slice(wordIdx)

    if (beforeWords.length === 0 || afterWords.length === 0) return

    const firstAfter = afterWords.find((w) => !w.is_deleted && w.text)
    const lastBefore = [...beforeWords].reverse().find((w) => !w.is_deleted && w.text)

    const genId = () => Math.random().toString(36).substring(2, 15)
    const newSentence1 = {
      ...sentence,
      id: genId(),
      words: beforeWords,
      msg: beforeWords.filter((w) => !w.is_deleted && w.text).map((w) => w.text).join(" "),
      end_time: lastBefore?.end_time || sentence.end_time,
    }
    const newSentence2 = {
      ...sentence,
      id: genId(),
      words: afterWords,
      msg: afterWords.filter((w) => !w.is_deleted && w.text).map((w) => w.text).join(" "),
      start_at: firstAfter?.start_at || sentence.start_at,
      start_time: firstAfter?.start_time || sentence.start_time,
    }

    const newSubs = [
      ...subs.slice(0, sentenceIdx),
      newSentence1,
      newSentence2,
      ...subs.slice(sentenceIdx + 1),
    ]
    setSubsSentences(newSubs)
    subsSentencesRef.current = newSubs
    setFocusedWord({ sentenceIdx: sentenceIdx + 1, wordIdx: 0 })
  }, [focusedWordRef, subsSentencesRef, setSubsSentences, setFocusedWord, pushUndo])

  useEffect(() => {
    if (activeTab !== "subs") return

    let inputKeyDownTime = 0

    // capture phase: stopPropagation 전에 실행되므로 편집 input의 keydown도 감지 가능
    const handleKeyDownCapture = (e) => {
      const isInput = (e.target.tagName === "INPUT" || e.target.tagName === "TEXTAREA") && !e.target.dataset.focusTrap
      if (isInput) {
        inputKeyDownTime = Date.now()
      }
    }

    const handleKeyDown = (e) => {
      if ((e.target.tagName === "INPUT" || e.target.tagName === "TEXTAREA") && !e.target.dataset.focusTrap) return
      const kc = e.keyCode
      if (kc === 8 || kc === 13) { e.preventDefault() }
    }

    const handleKeyUp = (e) => {
      // 편집 input에서 keydown 직후(100ms 이내) keyup은 무시 (편집 종료 후 keyup 방지)
      if (Date.now() - inputKeyDownTime < 100) return
      if ((e.target.tagName === "INPUT" || e.target.tagName === "TEXTAREA") && !e.target.dataset.focusTrap) return
      const kc = e.keyCode
      if (kc === 229) return

      if ((e.ctrlKey || e.metaKey) && kc === 90) {
        if (e.shiftKey) { redo() } else { undo() }
        return
      }
      if (kc === 8) { mergeSentenceWithPrev(); return }
      if (kc === 78) { mergeWithPrev(); return }
      if (kc === 77) { mergeWithNext(); return }
      if (kc === 13) { splitSentence(); return }
    }

    window.addEventListener("keydown", handleKeyDownCapture, true)
    window.addEventListener("keydown", handleKeyDown)
    window.addEventListener("keyup", handleKeyUp)
    return () => {
      window.removeEventListener("keydown", handleKeyDownCapture, true)
      window.removeEventListener("keydown", handleKeyDown)
      window.removeEventListener("keyup", handleKeyUp)
    }
  }, [activeTab, mergeSentenceWithPrev, mergeWithPrev, mergeWithNext, splitSentence, undo, redo])

  return { undo, redo, pushUndo, undoStackRef, redoStackRef }
}
