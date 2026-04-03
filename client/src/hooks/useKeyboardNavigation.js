import { togglePlayback } from "../js/cep-bridge"

export default function useKeyboardNavigation({
  sentencesRef,
  focusedWord,
  setFocusedWord,
  setSelectedWordIds,
  wordRefs,
  isSilenceHidden,
}) {
  const handleKey = (e) => {
    if (!sentencesRef.current || sentencesRef.current.length === 0) return
    if ((e.target.tagName === "INPUT" || e.target.tagName === "TEXTAREA") && !e.target.dataset.focusTrap) return
    const kc = e.keyCode

    // Space: keydown에서 처리 (preventDefault로 스크롤 방지)
    if (e.type === "keydown") {
      if (kc === 32) { e.preventDefault(); togglePlayback().catch(() => {}); }
      return
    }

    // keyup에서 나머지 처리 (WASD, 화살표, K - 한국어 IME 229 우회)
    if (kc === 229) return

    const sentences = sentencesRef.current
    const currentSentenceIdx = focusedWord?.sentenceIdx ?? 0
    const currentWordIdx = focusedWord?.wordIdx ?? 0
    const isLeft = kc === 65 || kc === 37
    const isRight = kc === 68 || kc === 39
    const isUp = kc === 87 || kc === 38
    const isDown = kc === 83 || kc === 40
    const isK = kc === 75
    const isSpace = false // 이미 위에서 처리됨

    const findNextWord = (sIdx, wIdx) => {
      let s = sIdx,
        w = wIdx + 1
      const maxIterations = sentences.reduce(
        (sum, s) => sum + (s.words?.length || 0),
        0,
      )
      let iterations = 0
      while (iterations < maxIterations) {
        if (w >= (sentences[s]?.words?.length || 0)) {
          s = (s + 1) % sentences.length
          w = 0
        }
        const word = sentences[s]?.words?.[w]
        if (word && !word.is_deleted && !isSilenceHidden(word))
          return { sentenceIdx: s, wordIdx: w, word }
        w++
        iterations++
      }
      return null
    }

    const findPrevWord = (sIdx, wIdx) => {
      let s = sIdx,
        w = wIdx - 1
      const maxIterations = sentences.reduce(
        (sum, s) => sum + (s.words?.length || 0),
        0,
      )
      let iterations = 0
      while (iterations < maxIterations) {
        if (w < 0) {
          s = s > 0 ? s - 1 : sentences.length - 1
          w = (sentences[s]?.words?.length || 1) - 1
        }
        const word = sentences[s]?.words?.[w]
        if (word && !word.is_deleted && !isSilenceHidden(word))
          return { sentenceIdx: s, wordIdx: w, word }
        w--
        iterations++
      }
      return null
    }

    if (isRight) {
      e.preventDefault()
      const next = findNextWord(currentSentenceIdx, currentWordIdx)
      if (next) {
        setFocusedWord({ sentenceIdx: next.sentenceIdx, wordIdx: next.wordIdx })
        wordRefs.current[next.word.start_at]?.scrollIntoView({
          behavior: "instant",
          block: "center",
        })
      }
    }
    if (isLeft) {
      e.preventDefault()
      const prev = findPrevWord(currentSentenceIdx, currentWordIdx)
      if (prev) {
        setFocusedWord({ sentenceIdx: prev.sentenceIdx, wordIdx: prev.wordIdx })
        wordRefs.current[prev.word.start_at]?.scrollIntoView({
          behavior: "instant",
          block: "center",
        })
      }
    }

    const getWordLines = (sentence) => {
      const lines = []
      let currentLine = []
      let currentY = null
      sentence.words?.forEach((word, idx) => {
        if (word.is_deleted || isSilenceHidden(word)) return
        const el = wordRefs.current[word.start_at]
        if (!el) return
        const y = Math.round(el.getBoundingClientRect().top)
        if (currentY === null || Math.abs(y - currentY) < 10) {
          currentLine.push({ word, idx, y })
          currentY = y
        } else {
          if (currentLine.length > 0) lines.push(currentLine)
          currentLine = [{ word, idx, y }]
          currentY = y
        }
      })
      if (currentLine.length > 0) lines.push(currentLine)
      return lines
    }

    const findFirstNonDeletedWord = (sentence) => {
      for (let i = 0; i < (sentence.words?.length || 0); i++) {
        if (!sentence.words[i].is_deleted && !isSilenceHidden(sentence.words[i]))
          return { idx: i, word: sentence.words[i] }
      }
      return null
    }

    if (isDown) {
      e.preventDefault()
      const currentSentence = sentences[currentSentenceIdx]
      if (!currentSentence?.words) return
      const lines = getWordLines(currentSentence)
      const currentLineIdx = lines.findIndex((line) =>
        line.some((item) => item.idx === currentWordIdx),
      )
      if (currentLineIdx >= 0 && currentLineIdx < lines.length - 1) {
        const nextLine = lines[currentLineIdx + 1]
        const posInLine = lines[currentLineIdx].findIndex(
          (item) => item.idx === currentWordIdx,
        )
        const nextWord = nextLine[Math.min(posInLine, nextLine.length - 1)]
        setFocusedWord({
          sentenceIdx: currentSentenceIdx,
          wordIdx: nextWord.idx,
        })
        wordRefs.current[nextWord.word.start_at]?.scrollIntoView({
          behavior: "instant",
          block: "center",
        })
      } else {
        for (let i = 1; i <= sentences.length; i++) {
          const nextSentenceIdx = (currentSentenceIdx + i) % sentences.length
          const firstWord = findFirstNonDeletedWord(sentences[nextSentenceIdx])
          if (firstWord) {
            setFocusedWord({
              sentenceIdx: nextSentenceIdx,
              wordIdx: firstWord.idx,
            })
            wordRefs.current[firstWord.word.start_at]?.scrollIntoView({
              behavior: "instant",
              block: "center",
            })
            break
          }
        }
      }
    }

    if (isUp) {
      e.preventDefault()
      const currentSentence = sentences[currentSentenceIdx]
      if (!currentSentence?.words) return
      const lines = getWordLines(currentSentence)
      const currentLineIdx = lines.findIndex((line) =>
        line.some((item) => item.idx === currentWordIdx),
      )
      if (currentLineIdx > 0) {
        const prevLine = lines[currentLineIdx - 1]
        const posInLine = lines[currentLineIdx].findIndex(
          (item) => item.idx === currentWordIdx,
        )
        const prevWord = prevLine[Math.min(posInLine, prevLine.length - 1)]
        setFocusedWord({
          sentenceIdx: currentSentenceIdx,
          wordIdx: prevWord.idx,
        })
        wordRefs.current[prevWord.word.start_at]?.scrollIntoView({
          behavior: "instant",
          block: "center",
        })
      } else {
        for (let i = 1; i <= sentences.length; i++) {
          const prevSentenceIdx =
            (currentSentenceIdx - i + sentences.length) % sentences.length
          const prevLines = getWordLines(sentences[prevSentenceIdx])
          if (prevLines.length > 0) {
            const lastWord = prevLines[prevLines.length - 1][0]
            setFocusedWord({
              sentenceIdx: prevSentenceIdx,
              wordIdx: lastWord.idx,
            })
            wordRefs.current[lastWord.word.start_at]?.scrollIntoView({
              behavior: "instant",
              block: "center",
            })
            break
          }
        }
      }
    }

    if (isK) {
      e.preventDefault()
      if (!focusedWord) {
        if (sentences[0]?.words?.length > 0)
          setFocusedWord({ sentenceIdx: 0, wordIdx: 0 })
        return
      }
      const word =
        sentences[focusedWord.sentenceIdx]?.words?.[focusedWord.wordIdx]
      if (!word || word.is_deleted) return
      const wordId = word.id || word.start_at
      setSelectedWordIds((prev) => {
        const newSet = new Set(prev)
        newSet.has(wordId) ? newSet.delete(wordId) : newSet.add(wordId)
        return newSet
      })
    }
    if (isSpace) {
      e.preventDefault()
      togglePlayback().catch(() => {})
    }
  }

  return { handleKeyDown: handleKey }
}
