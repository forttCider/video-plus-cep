import { useState, useMemo, useCallback, useRef, useEffect } from "react"

const EMPTY_SET = new Set()

function escapeRegex(s) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
}

// 단어 코어(앞뒤 구두점 제외)
function getCore(text) {
  return text.replace(/^[^\p{L}\p{N}]+|[^\p{L}\p{N}]+$/gu, "")
}

function wordMatches(text, query, { caseSensitive, wholeWord }) {
  if (!query) return false
  if (wholeWord) {
    const a = caseSensitive ? getCore(text) : getCore(text).toLowerCase()
    const b = caseSensitive ? query : query.toLowerCase()
    return a === b
  }
  const a = caseSensitive ? text : text.toLowerCase()
  const b = caseSensitive ? query : query.toLowerCase()
  return a.includes(b)
}

export function getHighlightSegments(text, query, caseSensitive, wholeWord) {
  if (!query || !text) return [{ text, match: false }]
  if (wholeWord) {
    const m = text.match(/^([^\p{L}\p{N}]*)(.*?)([^\p{L}\p{N}]*)$/u)
    if (!m) return [{ text, match: true }]
    const [, leading, core, trailing] = m
    const segs = []
    if (leading) segs.push({ text: leading, match: false })
    if (core) segs.push({ text: core, match: true })
    if (trailing) segs.push({ text: trailing, match: false })
    return segs
  }
  const segs = []
  const hay = caseSensitive ? text : text.toLowerCase()
  const needle = caseSensitive ? query : query.toLowerCase()
  let i = 0
  while (i < text.length) {
    const idx = hay.indexOf(needle, i)
    if (idx === -1) {
      if (i < text.length) segs.push({ text: text.slice(i), match: false })
      break
    }
    if (idx > i) segs.push({ text: text.slice(i, idx), match: false })
    segs.push({ text: text.slice(idx, idx + needle.length), match: true })
    i = idx + needle.length
  }
  return segs
}

function replaceInWord(text, query, replaceText, { caseSensitive, wholeWord }) {
  if (wholeWord) {
    const m = text.match(/^([^\p{L}\p{N}]*)(.*?)([^\p{L}\p{N}]*)$/u)
    if (!m) return replaceText
    const [, leading, , trailing] = m
    return leading + replaceText + trailing
  }
  if (caseSensitive) {
    return text.split(query).join(replaceText)
  }
  return text.replace(new RegExp(escapeRegex(query), "gi"), replaceText)
}

export default function useSearchAndReplace({
  sentences,
  setSentences,
  sentencesRef,
  wordRefs,
  pushUndo,
  isActiveTab,
  onAfterChange,
}) {
  const [isOpen, setIsOpen] = useState(false)
  const [isReplaceOpen, setIsReplaceOpen] = useState(false)
  const [query, setQuery] = useState("")
  // 디바운스된 검색어 (실제 매칭/치환에 사용)
  const [debouncedQuery, setDebouncedQuery] = useState("")
  const [replaceText, setReplaceText] = useState("")
  const [caseSensitive, setCaseSensitive] = useState(false)
  const [wholeWord, setWholeWord] = useState(false)
  const [currentIdx, setCurrentIdx] = useState(0)
  // 사용자가 명시적으로 체크 해제한 wordId 집합 (기본: 모두 선택됨)
  const [excludedIds, setExcludedIds] = useState(() => new Set())

  // 입력 후 200ms 멈추면 검색어 확정
  useEffect(() => {
    if (query === debouncedQuery) return
    const t = setTimeout(() => setDebouncedQuery(query), 200)
    return () => clearTimeout(t)
  }, [query, debouncedQuery])

  // 단어 데이터는 띄어쓰기로 분리되어 있어 양끝 공백은 매칭에서 무시
  const effectiveQuery = debouncedQuery.trim()
  // 검색어 중간에 공백이 있으면 다단어 검색 — 단어 단위 데이터에선 지원 안 함
  const isPhraseQuery = effectiveQuery.length > 0 && /\s/.test(effectiveQuery)

  const matches = useMemo(() => {
    if (!effectiveQuery || isPhraseQuery) return []
    const CONTEXT_WORDS = 3
    const out = []
    sentences.forEach((s, sIdx) => {
      const words = s.words || []
      words.forEach((w, wIdx) => {
        if (!w?.text) return
        if (w.is_deleted) return
        if (wordMatches(w.text, effectiveQuery, { caseSensitive, wholeWord })) {
          const before = words
            .slice(Math.max(0, wIdx - CONTEXT_WORDS), wIdx)
            .filter((x) => !x.is_deleted)
            .map((x) => x.text)
            .join(" ")
          const after = words
            .slice(wIdx + 1, wIdx + 1 + CONTEXT_WORDS)
            .filter((x) => !x.is_deleted)
            .map((x) => x.text)
            .join(" ")
          out.push({
            sentenceIdx: sIdx,
            wordIdx: wIdx,
            wordId: w.id,
            startAt: w.start_at,
            spk: s.spk || 0,
            before,
            matchText: w.text,
            after,
          })
        }
      })
    })
    return out
  }, [sentences, effectiveQuery, isPhraseQuery, caseSensitive, wholeWord])

  const matchesSetRef = useRef(new Set())
  const matchesSet = useMemo(() => {
    const s = new Set(matches.map((m) => m.wordId))
    matchesSetRef.current = s
    return s
  }, [matches])

  // currentIdx 범위 보정 (-1은 "선택 해제" 상태로 보존)
  useEffect(() => {
    if (matches.length === 0) {
      if (currentIdx > 0) setCurrentIdx(0)
    } else if (currentIdx >= matches.length) {
      setCurrentIdx(0)
    }
  }, [matches.length])

  // 검색 조건이 바뀌면 선택 상태 초기화 (모두 선택으로)
  useEffect(() => {
    setExcludedIds(new Set())
  }, [effectiveQuery, caseSensitive, wholeWord])

  const selectedCount = useMemo(
    () => matches.filter((m) => !excludedIds.has(m.wordId)).length,
    [matches, excludedIds],
  )
  const allSelected = matches.length > 0 && selectedCount === matches.length
  const noneSelected = selectedCount === 0

  const toggleMatchSelected = useCallback((wordId) => {
    setExcludedIds((prev) => {
      const next = new Set(prev)
      if (next.has(wordId)) next.delete(wordId)
      else next.add(wordId)
      return next
    })
  }, [])

  const setAllSelected = useCallback(
    (selectAll) => {
      if (selectAll) {
        setExcludedIds(new Set())
      } else {
        setExcludedIds(new Set(matches.map((m) => m.wordId)))
      }
    },
    [matches],
  )

  const toggleAllSelected = useCallback(() => {
    setAllSelected(!allSelected)
  }, [allSelected, setAllSelected])

  const currentMatch = currentIdx >= 0 ? matches[currentIdx] || null : null
  const currentSearchWordId = currentMatch?.wordId ?? null

  const scrollToCurrent = useCallback(
    (idx) => {
      if (!isActiveTab) return
      const m = matches[idx]
      if (!m) return
      // 다음 프레임에서 스크롤 (렌더 직후 ref가 잡힌 상태 보장)
      requestAnimationFrame(() => {
        const el = wordRefs?.current?.[m.startAt]
        if (el && el.scrollIntoView) {
          el.scrollIntoView({ block: "center" })
        }
      })
    },
    [matches, wordRefs, isActiveTab],
  )

  // query/matches가 바뀌어 currentMatch가 새로 잡히면 자동으로 스크롤
  useEffect(() => {
    if (isOpen && currentMatch) {
      scrollToCurrent(currentIdx)
    }
  }, [isOpen, currentSearchWordId])

  const findNext = useCallback(() => {
    if (matches.length === 0) return
    const next = currentIdx < 0 ? 0 : (currentIdx + 1) % matches.length
    setCurrentIdx(next)
    scrollToCurrent(next)
  }, [matches.length, currentIdx, scrollToCurrent])

  const findPrev = useCallback(() => {
    if (matches.length === 0) return
    const prev = currentIdx < 0 ? matches.length - 1 : (currentIdx - 1 + matches.length) % matches.length
    setCurrentIdx(prev)
    scrollToCurrent(prev)
  }, [matches.length, currentIdx, scrollToCurrent])

  const jumpTo = useCallback(
    (idx) => {
      if (idx < 0 || idx >= matches.length) return
      setCurrentIdx(idx)
      scrollToCurrent(idx)
    },
    [matches.length, scrollToCurrent],
  )

  const applyReplace = useCallback(
    (ids) => {
      if (!effectiveQuery || ids.size === 0) return
      if (pushUndo) pushUndo()
      const current = sentencesRef?.current || sentences
      const next = current.map((s) => ({
        ...s,
        words: s.words?.map((w) => {
          if (!ids.has(w.id)) return w
          const newText = replaceInWord(w.text || "", effectiveQuery, replaceText, {
            caseSensitive,
            wholeWord,
          })
          return { ...w, text: newText }
        }),
      }))
      if (sentencesRef) sentencesRef.current = next
      setSentences(next)
      if (onAfterChange) onAfterChange(next)
    },
    [effectiveQuery, replaceText, caseSensitive, wholeWord, pushUndo, setSentences, sentencesRef, sentences, onAfterChange],
  )

  const replaceCurrent = useCallback(() => {
    if (!currentMatch || !effectiveQuery) return
    const replacedStartAt = currentMatch.startAt
    applyReplace(new Set([currentMatch.wordId]))
    // 치환된 단어 위치로 스크롤 + 현재 매치 해제 (auto-advance 방지)
    setCurrentIdx(-1)
    requestAnimationFrame(() => {
      const el = wordRefs?.current?.[replacedStartAt]
      if (el && el.scrollIntoView) {
        el.scrollIntoView({ block: "center" })
      }
    })
  }, [currentMatch, effectiveQuery, applyReplace, wordRefs])

  const replaceSelected = useCallback(() => {
    if (!effectiveQuery || matches.length === 0) return
    const ids = new Set(
      matches.filter((m) => !excludedIds.has(m.wordId)).map((m) => m.wordId),
    )
    applyReplace(ids)
    setCurrentIdx(-1)
  }, [matches, excludedIds, effectiveQuery, applyReplace])

  // 포커스 요청 카운터 — Cmd/Ctrl+F 같은 외부 트리거에서 사용
  const [focusRequest, setFocusRequest] = useState(0)
  const open = useCallback(() => setIsOpen(true), [])
  const close = useCallback(() => setIsOpen(false), [])
  const toggle = useCallback(() => setIsOpen((v) => !v), [])
  const toggleReplace = useCallback(() => setIsReplaceOpen((v) => !v), [])
  const focusInput = useCallback(() => {
    setIsOpen(true)
    setFocusRequest((c) => c + 1)
  }, [])

  return {
    isOpen,
    open,
    close,
    toggle,
    query,
    setQuery,
    replaceText,
    setReplaceText,
    caseSensitive,
    setCaseSensitive,
    wholeWord,
    setWholeWord,
    matches,
    matchCount: matches.length,
    currentIdx,
    setCurrentIdx,
    findNext,
    findPrev,
    jumpTo,
    replaceCurrent,
    replaceSelected,
    excludedIds,
    toggleMatchSelected,
    toggleAllSelected,
    setAllSelected,
    selectedCount,
    allSelected,
    noneSelected,
    debouncedQuery: effectiveQuery,
    isPending: query.trim() !== effectiveQuery,
    isPhraseQuery,
    isReplaceOpen,
    toggleReplace,
    focusInput,
    focusRequest,
    // 사이드바가 닫혀있으면 하이라이트도 숨김
    searchResultsSet: isOpen ? matchesSet : EMPTY_SET,
    currentSearchWordId: isOpen ? currentSearchWordId : null,
  }
}
