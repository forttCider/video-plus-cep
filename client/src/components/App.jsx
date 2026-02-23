import React, { useState, useEffect, useRef } from "react"
import {
  Mic,
  VolumeX,
  MessageCircle,
  Scissors,
  History,
  FolderOpen,
} from "lucide-react"
import { Button } from "./ui/button"
import { Badge } from "./ui/badge"
import { Card, CardContent } from "./ui/card"
import { Progress } from "./ui/progress"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "./ui/dialog"
import {
  testConnection,
  getActiveSequenceInfo,
  setPlayerPosition,
  setPlayerPositionByTicks,
  getPlayerPosition,
  togglePlayback,
  isPlaying,
  backupSequence,
  getBackupList,
  openBackupSequence,
  restoreFromBackup,
  saveWordsData,
  loadWordsData,
  registerKeyEvents,
  setAllTracksLocked,
} from "../js/cep-bridge"
import useAudioUpload from "../hooks/useAudioUpload"
import initWords from "../js/initWords"
import Sentence from "./Sentence"
import ContextMenu from "./ContextMenu"
import WaveformPanel from "./WaveformPanel"
import {
  getTimelinePosition,
  getTimelinePositionTick,
  buildTimelineIndex,
  findCurrentWordFromIndex,
} from "../js/calculateTimeOffset"
import { deleteWordFromTimeline } from "../js/deleteWord"
import { restoreWordFromTimeline } from "../js/restoreWord"
import {
  batchDeleteWords,
  applyDeleteResult,
  FILLER_TYPES,
} from "../js/batchEditWords"

const API_URL =
  process.env.REACT_APP_VIDEO_API_URL || "https://vapi.cidermics.com"

function generateRandomId() {
  return Math.random().toString(36).substring(2, 15)
}

function formatBackupName() {
  const now = new Date()
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")} ${String(now.getHours()).padStart(2, "0")}:${String(now.getMinutes()).padStart(2, "0")}:${String(now.getSeconds()).padStart(2, "0")}`
}

export default function App() {
  const [status, setStatus] = useState("로딩 중...")
  const [isConnected, setIsConnected] = useState(false)
  const [sequenceInfo, setSequenceInfo] = useState(null)
  const [error, setError] = useState(null)
  const [sentences, setSentences] = useState([])
  const [currentWordId, setCurrentWordId] = useState(null)
  const [searchResultsSet, setSearchResultsSet] = useState(new Set())
  const [currentSearchWordId, setCurrentSearchWordId] = useState(null)
  const [contextMenu, setContextMenu] = useState(null)
  const [isProcessing, setIsProcessing] = useState(false)
  const [batchProgress, setBatchProgress] = useState(null)
  const [showHistory, setShowHistory] = useState(false)
  const [selectedWordIds, setSelectedWordIds] = useState(new Set())
  const [backupList, setBackupList] = useState([])
  const [restoreConfirm, setRestoreConfirm] = useState(null)
  const [focusedWord, setFocusedWord] = useState(null)
  const [audioPath, setAudioPath] = useState(null) // 파형 표시용 오디오 경로
  const [showProcessingModal, setShowProcessingModal] = useState(false)
  const wordRefs = useRef({})
  const sentencesRef = useRef(sentences)
  const timelineIndexRef = useRef(null)
  const containerRef = useRef(null)

  useEffect(() => {
    sentencesRef.current = sentences
    if (sentences.length > 0) {
      timelineIndexRef.current = buildTimelineIndex(sentences)
      setTimeout(() => containerRef.current?.focus(), 100)
    }
  }, [sentences])

  useEffect(() => {
    const onKeyDown = (e) => handleKeyDown(e)
    window.addEventListener("keydown", onKeyDown)
    return () => window.removeEventListener("keydown", onKeyDown)
  }, [focusedWord])

  useEffect(() => {
    if (!isConnected || sentences.length === 0 || isProcessing) return
    const pollInterval = setInterval(async () => {
      try {
        const playingResult = await isPlaying()
        if (!playingResult?.isPlaying) {
          setCurrentWordId(null)
          return
        }
        const result = await getPlayerPosition()
        if (result?.success && timelineIndexRef.current) {
          const found = findCurrentWordFromIndex(
            timelineIndexRef.current,
            result.seconds,
          )
          if (found?.word) setCurrentWordId(found.word.start_at)
        }
      } catch (e) {}
    }, 100)
    return () => clearInterval(pollInterval)
  }, [isConnected, sentences.length, isProcessing])

  useEffect(() => {
    if (!currentWordId || !wordRefs.current[currentWordId]) return
    wordRefs.current[currentWordId].scrollIntoView({
      behavior: "instant",
      block: "center",
    })
  }, [currentWordId])

  const handleKeyDown = (e) => {
    if (!sentencesRef.current || sentencesRef.current.length === 0) return
    if (e.target.tagName === "INPUT" || e.target.tagName === "TEXTAREA") return
    const sentences = sentencesRef.current
    const currentSentenceIdx = focusedWord?.sentenceIdx ?? 0
    const currentWordIdx = focusedWord?.wordIdx ?? 0
    const key = e.key?.toLowerCase()
    const keyCode = e.keyCode
    const isLeft = key === "a" || key === "ㅁ" || keyCode === 37 || key === "arrowleft"
    const isRight = key === "d" || key === "ㅇ" || keyCode === 39 || key === "arrowright"
    const isUp = key === "w" || key === "ㅈ" || keyCode === 38 || key === "arrowup"
    const isDown = key === "s" || key === "ㄴ" || keyCode === 40 || key === "arrowdown"
    const isK = key === "k" || key === "ㅏ"
    const isSpace = key === " " || keyCode === 32

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
        if (word && !word.isDeleted) return { sentenceIdx: s, wordIdx: w, word }
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
        if (word && !word.isDeleted) return { sentenceIdx: s, wordIdx: w, word }
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
        if (word.isDeleted) return
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
        if (!sentence.words[i].isDeleted)
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
        // 다음 문장 중 삭제 안 된 단어가 있는 문장 찾기
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
        // 이전 문장 중 삭제 안 된 단어가 있는 문장 찾기
        for (let i = 1; i <= sentences.length; i++) {
          const prevSentenceIdx = (currentSentenceIdx - i + sentences.length) % sentences.length
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
      if (!word || word.isDeleted) return
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

  // 파형에서 단어 구간 드래그로 변경 시
  const handleWordTimeChange = (wordId, newStart, newEnd) => {
    console.log('[파형] 단어 시간 변경:', wordId, newStart, '→', newEnd)
    
    setSentences(prev => {
      return prev.map(sentence => ({
        ...sentence,
        words: sentence.words?.map(word => {
          const wId = word.id || word.start_at
          if (wId === wordId) {
            return {
              ...word,
              start_at: newStart,
              end_at: newEnd,
              // tick 값도 업데이트 (초 → tick 변환)
              // TICKS_PER_SECOND = 254016000000
              start_at_tick: BigInt(Math.floor(newStart * 254016000000)),
              end_at_tick: BigInt(Math.floor(newEnd * 254016000000)),
            }
          }
          return word
        })
      }))
    })
  }

  // 파형에서 클릭으로 재생 위치 이동
  const handleWaveformSeek = async (time) => {
    console.log('[파형] 재생 위치 이동:', time)
    await setPlayerPosition(time)
  }

  const handleWordClick = async (word) => {
    let sIdx = -1,
      wIdx = -1
    sentencesRef.current.forEach((s, si) => {
      s.words?.forEach((w, wi) => {
        if (w.start_at === word.start_at) {
          sIdx = si
          wIdx = wi
        }
      })
    })
    if (sIdx === -1) return
    setFocusedWord({ sentenceIdx: sIdx, wordIdx: wIdx })
    const result = getTimelinePositionTick(word, sentencesRef.current)
    if (result?.startTick !== undefined)
      await setPlayerPositionByTicks(result.startTick.toString())
    containerRef.current?.focus()
  }

  const handleWordContextMenu = (e, word, sentenceStartAt) => {
    e.preventDefault()
    setContextMenu({
      position: { x: e.clientX, y: e.clientY },
      word,
      sentenceStartAt,
    })
  }
  const handleCloseContextMenu = () => setContextMenu(null)

  const handleDeleteWord = async () => {
    if (isProcessing || !contextMenu) return
    setIsProcessing(true)
    try {
      const result = await deleteWordFromTimeline(contextMenu.word, sentences)
      if (!result.success) {
        alert("삭제 실패: " + (result.error || "알 수 없는 오류"))
        return
      }
      setSentences((prev) => {
        const updated = prev.map((s) =>
          s.start_at !== contextMenu.sentenceStartAt
            ? s
            : {
                ...s,
                words: s.words.map((w) =>
                  w.start_at !== contextMenu.word.start_at
                    ? w
                    : { ...w, isDeleted: true },
                ),
              },
        )
        sentencesRef.current = updated
        return updated
      })
    } catch (error) {
      alert("삭제 실패: " + error.message)
    } finally {
      setIsProcessing(false)
    }
    setContextMenu(null)
  }

  const handleRestoreWord = async () => {
    if (isProcessing || !contextMenu) return
    setIsProcessing(true)
    try {
      const result = await restoreWordFromTimeline(contextMenu.word, sentences)
      if (!result.success) {
        alert("복원 실패: " + (result.error || "알 수 없는 오류"))
        return
      }
      setSentences((prev) => {
        const updated = prev.map((s) =>
          s.start_at !== contextMenu.sentenceStartAt
            ? s
            : {
                ...s,
                words: s.words.map((w) =>
                  w.start_at !== contextMenu.word.start_at
                    ? w
                    : { ...w, isDeleted: false },
                ),
              },
        )
        sentencesRef.current = updated
        return updated
      })
    } catch (error) {
      alert("복원 실패: " + error.message)
    } finally {
      setIsProcessing(false)
    }
    setContextMenu(null)
  }

  const handleMark = () => setContextMenu(null)

  const handleApplySelected = async () => {
    if (isProcessing || selectedWordIds.size === 0) {
      setStatus("선택된 단어가 없습니다")
      return
    }
    setIsProcessing(true)
    setShowProcessingModal(true)
    setStatus("트랙 잠금 해제...")
    try {
      // 트랙 잠금 해제
      await setAllTracksLocked(false)
      
      setStatus("백업 중...")
      const backupResult = await backupSequence(formatBackupName())
      if (backupResult?.success)
        await saveWordsData(backupResult.backupId, sentencesRef.current)
      setStatus("일괄 적용 중...")
      setBatchProgress({
        current: 0,
        total: selectedWordIds.size,
        label: "일괄 적용",
      })
      // 디버그: 선택된 단어들의 tick 확인
      console.log("[일괄적용] selectedWordIds:", [...selectedWordIds])
      sentencesRef.current.forEach(s => {
        s.words?.forEach(w => {
          const wordId = w.id || w.start_at
          if (selectedWordIds.has(wordId)) {
            console.log("[일괄적용] 선택된 단어:", w.text || w.word, "tick:", w.start_at_tick, w.end_at_tick)
          }
        })
      })
      
      const filterFn = (word) => {
        const wordId = word.id || word.start_at
        return (
          selectedWordIds.has(wordId) &&
          word.start_at_tick !== undefined &&
          word.end_at_tick !== undefined
        )
      }
      const { deletedWordIds: actuallyDeleted, success } =
        await batchDeleteWords(
          filterFn,
          sentencesRef.current,
          (current, total) =>
            setBatchProgress({ current, total, label: "일괄 적용" }),
        )
      if (success && actuallyDeleted.size > 0) {
        const updated = applyDeleteResult(sentencesRef.current, actuallyDeleted)
        sentencesRef.current = updated
        setSentences(updated)
        setSelectedWordIds(new Set())
        setStatus(`일괄 적용 완료: ${actuallyDeleted.size}개 단어`)
      } else setStatus("적용할 단어가 없습니다")
    } catch (error) {
      setStatus("일괄 적용 실패: " + error.message)
    } finally {
      // 트랙 다시 잠금
      await setAllTracksLocked(true)
      setIsProcessing(false)
      setBatchProgress(null)
      setShowProcessingModal(false)
    }
  }

  const handleDeleteSentence = (sentence) => {
    const selectableWords = sentence.words.filter(
      (w) =>
        !w.isDeleted &&
        w.start_at_tick !== undefined &&
        w.end_at_tick !== undefined,
    )
    const selectableIds = selectableWords.map((w) => w.id || w.start_at)
    if (selectableIds.length === 0) {
      setStatus("선택할 단어가 없습니다")
      return
    }
    const allSelected = selectableIds.every((id) => selectedWordIds.has(id))
    setSelectedWordIds((prev) => {
      const newSet = new Set(prev)
      allSelected
        ? selectableIds.forEach((id) => newSet.delete(id))
        : selectableIds.forEach((id) => newSet.add(id))
      return newSet
    })
    setStatus(
      allSelected
        ? `${selectableIds.length}개 단어 선택 해제`
        : `${selectableIds.length}개 단어 선택됨`,
    )
  }

  const handleRestoreSentence = () =>
    setStatus("복원은 백업 히스토리에서 해주세요")
  const handleOpenHistory = async () => {
    const result = await getBackupList()
    if (result?.success) {
      setBackupList(result.backups || [])
      setShowHistory(true)
    }
  }
  const handleBackupClick = (backup) => setRestoreConfirm({ backup })

  const handleRestoreConfirm = async () => {
    if (!restoreConfirm?.backup) return
    const backupId = restoreConfirm.backup.backupId
    setRestoreConfirm(null)
    setStatus("복원 중...")
    const result = await restoreFromBackup(backupId)
    if (result?.success) {
      setShowHistory(false)
      setStatus(`복원 완료: ${result.restoredName}`)
      loadSequenceInfo()
      const wordsResult = await loadWordsData(backupId)
      if (wordsResult?.success) {
        const deletedWordSet = new Set(wordsResult.deletedWords || [])
        const deletedSentenceSet = new Set(wordsResult.deletedSentences || [])
        const updatedSentences = sentencesRef.current.map((sentence) => ({
          ...sentence,
          isDeleted: deletedSentenceSet.has(sentence.id),
          words: sentence.words?.map((word) => ({
            ...word,
            isDeleted: deletedWordSet.has(word.id),
          })),
        }))
        sentencesRef.current = updatedSentences
        setSentences(updatedSentences)
      }
    } else setStatus(`복원 실패: ${result?.error || "알 수 없는 오류"}`)
  }

  // 무음/간투사 단어 목록 계산
  const silenceWordIds = React.useMemo(() => {
    const ids = new Set()
    sentences.forEach(sentence => {
      sentence.words?.forEach(word => {
        if (!word.isDeleted && 
            word.edit_points?.type === "silence" && 
            word.start_at_tick !== undefined && 
            word.end_at_tick !== undefined) {
          ids.add(word.id || word.start_at)
        }
      })
    })
    return ids
  }, [sentences])

  const fillerWordIds = React.useMemo(() => {
    const ids = new Set()
    sentences.forEach(sentence => {
      sentence.words?.forEach(word => {
        if (!word.isDeleted && 
            FILLER_TYPES.includes(word.edit_points?.type) && 
            word.start_at_tick !== undefined && 
            word.end_at_tick !== undefined) {
          ids.add(word.id || word.start_at)
        }
      })
    })
    return ids
  }, [sentences])

  // 모든 무음/간투사가 선택되었는지 확인
  const allSilenceSelected = silenceWordIds.size > 0 && 
    [...silenceWordIds].every(id => selectedWordIds.has(id))
  const allFillerSelected = fillerWordIds.size > 0 && 
    [...fillerWordIds].every(id => selectedWordIds.has(id))

  const handleSelectSilence = () => {
    if (silenceWordIds.size === 0) {
      setStatus("선택할 무음이 없습니다")
      return
    }
    
    setSelectedWordIds(prev => {
      const next = new Set(prev)
      if (allSilenceSelected) {
        silenceWordIds.forEach(id => next.delete(id))
        setStatus(`무음 ${silenceWordIds.size}개 선택 해제`)
      } else {
        silenceWordIds.forEach(id => next.add(id))
        setStatus(`무음 ${silenceWordIds.size}개 선택`)
      }
      return next
    })
  }

  const handleDeleteSilence_UNUSED = async () => {
    if (isProcessing) return
    setIsProcessing(true)
    setStatus("시퀀스 백업 중...")
    try {
      const backupResult = await backupSequence(formatBackupName())
      if (backupResult?.success)
        await saveWordsData(backupResult.backupId, sentencesRef.current)
      setStatus("무음 삭제 중...")
      setBatchProgress({ current: 0, total: 0, label: "무음 삭제" })
      const filterFn = (word) =>
        !word.isDeleted && word.edit_points?.type === "silence"
      const { deletedWordIds, success } = await batchDeleteWords(
        filterFn,
        sentencesRef.current,
        (current, total) =>
          setBatchProgress({ current, total, label: "무음 삭제" }),
      )
      if (success && deletedWordIds.size > 0) {
        const updated = applyDeleteResult(sentencesRef.current, deletedWordIds)
        sentencesRef.current = updated
        setSentences(updated)
        setStatus(`무음 삭제 완료: ${deletedWordIds.size}개`)
      } else setStatus("삭제할 무음이 없습니다")
    } catch (error) {
      setStatus("무음 삭제 실패: " + error.message)
    } finally {
      setIsProcessing(false)
      setBatchProgress(null)
    }
  }

  const handleSelectFiller = () => {
    if (fillerWordIds.size === 0) {
      setStatus("선택할 간투사가 없습니다")
      return
    }
    
    setSelectedWordIds(prev => {
      const next = new Set(prev)
      if (allFillerSelected) {
        fillerWordIds.forEach(id => next.delete(id))
        setStatus(`간투사 ${fillerWordIds.size}개 선택 해제`)
      } else {
        fillerWordIds.forEach(id => next.add(id))
        setStatus(`간투사 ${fillerWordIds.size}개 선택`)
      }
      return next
    })
  }

  const handleDeleteFiller_UNUSED = async () => {
    if (isProcessing) return
    setIsProcessing(true)
    setStatus("시퀀스 백업 중...")
    try {
      const backupResult = await backupSequence(formatBackupName())
      if (backupResult?.success)
        await saveWordsData(backupResult.backupId, sentencesRef.current)
      setStatus("간투사 삭제 중...")
      setBatchProgress({ current: 0, total: 0, label: "간투사 삭제" })
      const filterFn = (word) =>
        !word.isDeleted &&
        FILLER_TYPES.includes(word.edit_points?.type) &&
        word.start_at_tick !== undefined &&
        word.end_at_tick !== undefined
      const { deletedWordIds, success } = await batchDeleteWords(
        filterFn,
        sentencesRef.current,
        (current, total) =>
          setBatchProgress({ current, total, label: "간투사 삭제" }),
      )
      if (success && deletedWordIds.size > 0) {
        const updated = applyDeleteResult(sentencesRef.current, deletedWordIds)
        sentencesRef.current = updated
        setSentences(updated)
        setStatus(`간투사 삭제 완료: ${deletedWordIds.size}개`)
      } else setStatus("삭제할 간투사가 없습니다")
    } catch (error) {
      setStatus("간투사 삭제 실패: " + error.message)
    } finally {
      setIsProcessing(false)
      setBatchProgress(null)
    }
  }

  const handleTranscribeFinish = async (taskId) => {
    console.log(taskId)
    if (!taskId) return
    setStatus("받아쓰기 결과 가져오는 중...")
    try {
      const response = await fetch(`${API_URL}/transcribe/cut/${taskId}`)
      if (!response.ok) {
        setStatus("결과 가져오기 실패: " + response.status)
        return
      }
      const getSentences = await response.json()
      const newSentences = getSentences.data.utterances.map((sentence) => {
        const editPoint = sentence.edit_points
        const sentenceId = generateRandomId()
        const newFormWord = sentence.words.flatMap((word) => {
          const wordId = generateRandomId()
          const formattedWord = {
            ...word,
            id: wordId,
            isDeleted: false,
            isHighlight: false,
            parentId: sentenceId,
          }
          if (word.edit_points?.type === "silence") {
            const silenceWord = {
              duration: word.edit_points.duration_ms,
              edit_points: {
                type: word.edit_points.type,
                reason: word.edit_points.reason,
              },
              end_at: word.edit_points.end_ms,
              end_time: word.edit_points.end_time,
              start_at: word.edit_points.start_ms,
              start_time: word.edit_points.start_time,
              text: "",
              id: generateRandomId(),
              parentId: sentenceId,
              isEdit: true,
              silence_seconds: word.edit_points.silence_seconds,
              isDeleted: false,
              isHighlight: false,
            }
            formattedWord.edit_points = {}
            return [silenceWord, formattedWord]
          }
          return [formattedWord]
        })
        const newWords = editPoint?.reason
          ? [
              {
                duration: editPoint.duration_ms,
                edit_points: { type: editPoint.type, reason: editPoint.reason },
                end_at: editPoint.end_ms,
                end_time: editPoint.end_time,
                start_at: editPoint.start_ms,
                start_time: editPoint.start_time,
                text: "",
                id: generateRandomId(),
                parentId: sentenceId,
                isEdit: true,
                silence_seconds: editPoint.silence_seconds,
                isDeleted: false,
                isHighlight: false,
              },
              ...newFormWord,
            ]
          : newFormWord
        return {
          ...sentence,
          id: sentenceId,
          isDeleted: false,
          isHighlight: false,
          words: newWords,
        }
      })
      setStatus("타임라인 정보 처리 중...")
      const gapSentences = await initWords(newSentences)
      const lockResult = await setAllTracksLocked(true)
      console.log("[handleTranscribeFinish] 트랙 잠금 결과:", lockResult)
      setSentences(gapSentences)
      setStatus(`받아쓰기 완료: ${gapSentences.length}개 문장`)
    } catch (e) {
      setStatus("결과 가져오기 실패: " + e.message)
    }
  }

  const { uploadFile, onClickRenderAudio, onClickCancel, isUpload, audioPath: uploadedAudioPath } =
    useAudioUpload({
      onFinish: handleTranscribeFinish,
      onClose: () => setStatus("취소됨"),
    })

  // audioPath 동기화
  useEffect(() => {
    if (uploadedAudioPath) {
      setAudioPath(uploadedAudioPath)
    }
  }, [uploadedAudioPath])

  useEffect(() => {
    checkConnection()
  }, [])

  // 개발용: taskId로 바로 결과 가져오기
  useEffect(() => {
    const testTaskId = "b036dae0-7f14-44e7-ac7a-a694ecb33e8f"
    if (testTaskId && isConnected && sentences.length === 0) {
      handleTranscribeFinish(testTaskId)
    }
  }, [isConnected])

  const checkConnection = async () => {
    try {
      setStatus("ExtendScript 연결 중...")
      const result = await testConnection()
      if (result === "ExtendScript OK") {
        setIsConnected(true)
        setStatus("연결됨")
        registerKeyEvents()
        loadSequenceInfo()
      } else setError("연결 실패: " + result)
    } catch (e) {
      setError("연결 오류: " + e.message)
    }
  }

  const loadSequenceInfo = async () => {
    try {
      const info = await getActiveSequenceInfo()
      if (info?.name) {
        setSequenceInfo(info)
        setStatus("시퀀스: " + info.name)
      } else if (info?.error) setStatus(info.error)
      else setStatus("시퀀스를 열어주세요")
    } catch (e) {
      setStatus("시퀀스 정보 조회 실패")
    }
  }

  if (error) {
    return (
      <div className="p-4 h-screen flex flex-col">
        <Card className="mb-3 border-destructive">
          <CardContent className="py-3 px-4 text-destructive">
            {error}
          </CardContent>
        </Card>
        <Button
          onClick={() => {
            setError(null)
            checkConnection()
          }}
        >
          다시 연결
        </Button>
      </div>
    )
  }

  return (
    <div
      className="p-4 h-screen flex flex-col overflow-hidden outline-none"
      ref={containerRef}
      tabIndex={0}
    >
      {/* 헤더 */}
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <h1 className="text-base font-semibold">컷편집</h1>
          <Button
            variant="ghost"
            size="icon"
            onClick={handleOpenHistory}
            title="백업 히스토리"
          >
            <History className="h-4 w-4" />
          </Button>
        </div>
        <div className="flex items-center gap-2">
          <Badge variant={isConnected ? "default" : "secondary"}>
            {isConnected ? "연결됨" : "연결 중..."}
          </Badge>
          {sequenceInfo && (
            <Badge variant="secondary" className="gap-1">
              <FolderOpen className="h-3 w-3" />
              {sequenceInfo.name}
            </Badge>
          )}
        </div>
      </div>

      {/* 상태 바 */}
      <Card className="mb-3">
        <CardContent className="py-2 px-3 text-sm text-muted-foreground">
          {status}
        </CardContent>
      </Card>

      {/* 업로드 진행 */}
      {isUpload && uploadFile && (
        <Card className="mb-3">
          <CardContent className="py-3 px-3">
            <div className="flex justify-between mb-2 text-sm">
              <span>{uploadFile.message}</span>
              {uploadFile.progress > 0 && (
                <span className="text-primary">{uploadFile.progress}%</span>
              )}
            </div>
            <Progress value={uploadFile.progress || 0} className="mb-3" />
            <Button
              variant="destructive"
              size="sm"
              className="w-full"
              onClick={onClickCancel}
            >
              취소
            </Button>
          </CardContent>
        </Card>
      )}

      {/* 배치 진행 */}
      {batchProgress && (
        <Card className="mb-3">
          <CardContent className="py-3 px-3">
            <div className="flex justify-between mb-2 text-sm">
              <span>{batchProgress.label}</span>
              <span className="text-muted-foreground">
                {batchProgress.current} / {batchProgress.total} 단어{" "}
                {batchProgress.total > 0 && (
                  <span className="text-primary ml-2">
                    {Math.round(
                      (batchProgress.current / batchProgress.total) * 100,
                    )}
                    %
                  </span>
                )}
              </span>
            </div>
            <Progress
              value={
                batchProgress.total > 0
                  ? (batchProgress.current / batchProgress.total) * 100
                  : 0
              }
            />
          </CardContent>
        </Card>
      )}

      {/* 액션 버튼 */}
      <div className="flex flex-wrap gap-2 mb-3">
        <Button
          size="sm"
          disabled={!isConnected || isUpload}
          onClick={onClickRenderAudio}
        >
          <Mic className="h-4 w-4 mr-1.5" />
          {isUpload ? "받아쓰는 중..." : "받아쓰기"}
        </Button>
        <Button
          variant="secondary"
          size="sm"
          disabled={
            !isConnected || isUpload || isProcessing || sentences.length === 0
          }
          onClick={handleSelectSilence}
        >
          <VolumeX className="h-4 w-4 mr-1.5" />
          {allSilenceSelected ? "무음 선택해제" : "무음 선택"}
        </Button>
        <Button
          variant="secondary"
          size="sm"
          disabled={
            !isConnected || isUpload || isProcessing || sentences.length === 0
          }
          onClick={handleSelectFiller}
        >
          <MessageCircle className="h-4 w-4 mr-1.5" />
          {allFillerSelected ? "간투사 선택해제" : "간투사 선택"}
        </Button>
      </div>

      {/* 문장 목록 */}
      <Card className="flex-1 overflow-hidden">
        <CardContent className="p-3 overflow-y-auto h-full">
          {sentences.length > 0 ? (
            sentences.map((sentence, sentenceIdx) => (
              <Sentence
                key={sentence.id}
                sentence={sentence}
                sentences={sentences}
                sentenceIdx={sentenceIdx}
                focusedWord={focusedWord}
                currentWordId={currentWordId}
                selectedWordIds={selectedWordIds}
                onWordClick={handleWordClick}
                onWordContextMenu={handleWordContextMenu}
                onDeleteSentence={handleDeleteSentence}
                onRestoreSentence={handleRestoreSentence}
                searchResultsSet={searchResultsSet}
                currentSearchWordId={currentSearchWordId}
                wordRefs={wordRefs}
              />
            ))
          ) : (
            <p className="text-muted-foreground text-center py-8">
              소스클립을 받아쓰지 않았습니다
            </p>
          )}
        </CardContent>
      </Card>

      {/* 플로팅 버튼 */}
      <Button
        className="fixed bottom-5 right-5 z-50 shadow-lg"
        variant={selectedWordIds.size > 0 ? "default" : "secondary"}
        disabled={
          selectedWordIds.size === 0 || !isConnected || isUpload || isProcessing
        }
        onClick={handleApplySelected}
      >
        <Scissors className="h-4 w-4 mr-2" />
        시퀀스에 적용 {selectedWordIds.size > 0 && `(${selectedWordIds.size})`}
      </Button>

      {contextMenu && (
        <ContextMenu
          position={contextMenu.position}
          word={contextMenu.word}
          onDelete={handleDeleteWord}
          onRestore={handleRestoreWord}
          onClose={handleCloseContextMenu}
          onMark={handleMark}
        />
      )}

      {/* 백업 히스토리 */}
      <Dialog open={showHistory} onOpenChange={setShowHistory}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>백업 히스토리</DialogTitle>
          </DialogHeader>
          <div className="max-h-[300px] overflow-y-auto">
            {backupList.length > 0 ? (
              <div className="space-y-2">
                {backupList.map((backup, idx) => (
                  <Card
                    key={backup.backupId || idx}
                    className="cursor-pointer hover:bg-accent transition-colors"
                    onClick={() => handleBackupClick(backup)}
                  >
                    <CardContent className="py-2.5 px-3 flex items-center gap-2.5">
                      <FolderOpen className="h-4 w-4 text-muted-foreground" />
                      <span className="text-sm">{backup.name}</span>
                    </CardContent>
                  </Card>
                ))}
              </div>
            ) : (
              <p className="text-sm text-muted-foreground text-center py-4">
                백업이 없습니다
              </p>
            )}
          </div>
          <DialogFooter>
            <Button variant="secondary" onClick={() => setShowHistory(false)}>
              닫기
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* 복원 확인 */}
      <Dialog
        open={!!restoreConfirm}
        onOpenChange={() => setRestoreConfirm(null)}
      >
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>복원 확인</DialogTitle>
          </DialogHeader>
          {restoreConfirm && (
            <div>
              <Card className="mb-4">
                <CardContent className="py-3 px-3">
                  <p className="text-xs text-muted-foreground mb-0.5">
                    백업 이름
                  </p>
                  <p className="text-sm font-medium">
                    {restoreConfirm.backup.name}
                  </p>
                </CardContent>
              </Card>
              <p className="text-sm text-muted-foreground text-center">
                이 백업으로 복원하시겠습니까?
                <br />
                현재 시퀀스는 Archive 폴더로 이동됩니다.
              </p>
            </div>
          )}
          <DialogFooter className="gap-2">
            <Button variant="secondary" onClick={() => setRestoreConfirm(null)}>
              취소
            </Button>
            <Button onClick={handleRestoreConfirm}>확인</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* 작업 중 안내 모달 */}
      <Dialog open={showProcessingModal}>
        <DialogContent className="max-w-sm" onPointerDownOutside={(e) => e.preventDefault()}>
          <DialogHeader>
            <DialogTitle>⚠️ 작업 중</DialogTitle>
          </DialogHeader>
          <div className="py-4">
            <p className="text-sm text-muted-foreground text-center mb-4">
              시퀀스에 편집을 적용하고 있습니다.<br />
              <strong>완료될 때까지 시퀀스를 이동하거나<br />조작하지 마세요!</strong>
            </p>
            {batchProgress && (
              <div>
                <div className="flex justify-between mb-2 text-sm">
                  <span>{batchProgress.label}</span>
                  <span>{batchProgress.current} / {batchProgress.total}</span>
                </div>
                <Progress value={batchProgress.total > 0 ? (batchProgress.current / batchProgress.total) * 100 : 0} />
              </div>
            )}
          </div>
        </DialogContent>
      </Dialog>

      {/* 하단 파형 패널 */}
      <WaveformPanel
        audioPath={audioPath}
        sentences={sentences}
        currentWordId={currentWordId}
        focusedWord={focusedWord}
        onWordTimeChange={handleWordTimeChange}
        onSeek={handleWaveformSeek}
      />
    </div>
  )
}
