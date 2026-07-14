import React, { useState, useEffect, useRef, useCallback } from "react"
import { RefreshCw } from "lucide-react"
import { Button } from "./ui/button"
import { Card, CardContent } from "./ui/card"
import AppHeader from "./AppHeader"
import LogPanel from "./LogPanel"

import CutEditControls from "./CutEditControls"
import CutEditTab from "./CutEditTab"
import SubtitleEditTab from "./SubtitleEditTab"
import ThumbnailTab from "./ThumbnailTab"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "./ui/dialog"
import BackupHistoryDialog from "./BackupHistoryDialog"
import ConfirmDialogHost from "./ConfirmDialogHost"
import RestoreConfirmDialog from "./RestoreConfirmDialog"
import ProcessingModal from "./ProcessingModal"
import DownloadDialog from "./DownloadDialog"
import SpeakerNameDialog from "./SpeakerNameDialog"
import SavedStateBanner from "./SavedStateBanner"
import { splitForSubtitles } from "../js/subtitleSplitter"
import {
  getActiveSequenceInfo,
  setPlayerPositionByTicks,
  setAllTracksLocked,
  getSequenceFramerate,
  cloneAndArchiveSequence,
  exportCaptionsAsSRT,
  hasCaptionsBin,
  getExtensionVersion,
  getAudioTracksWithClips,
} from "../js/cep-bridge"
import useAudioUpload from "../hooks/useAudioUpload"
import useKeyboardNavigation from "../hooks/useKeyboardNavigation"
import useWordSelection from "../hooks/useWordSelection"
import useBatchEdit from "../hooks/useBatchEdit"
import useBackupRestore from "../hooks/useBackupRestore"
import usePlaybackTracking from "../hooks/usePlaybackTracking"
import useStatePersistence from "../hooks/useStatePersistence"
import useConnection from "../hooks/useConnection"
import useTranscribe from "../hooks/useTranscribe"
import { secondsToTicksAligned } from "../js/initWords"
import {
  getTimelinePositionTick,
  buildTimelineIndex,
  findCurrentWordFromIndex,
  getTimelineTimeFromOriginal,
} from "../js/calculateTimeOffset"
import useSubtitleKeyboard from "../hooks/useSubtitleKeyboard"
import useSearchAndReplace from "../hooks/useSearchAndReplace"
import { setPlayerPosition } from "../js/cep-bridge"

function formatBackupName() {
  const now = new Date()
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")} ${String(now.getHours()).padStart(2, "0")}:${String(now.getMinutes()).padStart(2, "0")}:${String(now.getSeconds()).padStart(2, "0")}`
}

// CEP(file://)에서는 navigator.clipboard가 막혀 execCommand 방식 사용
// (TitleTab 등 기존에 동작 검증된 패턴 그대로). 성공 시 "execCommand", 실패 시 null
function copyToClipboard(text) {
  try {
    const textarea = document.createElement("textarea")
    textarea.value = text
    textarea.style.position = "fixed"
    textarea.style.opacity = "0"
    document.body.appendChild(textarea)
    textarea.select()
    const ok = document.execCommand("copy")
    document.body.removeChild(textarea)
    if (ok) return "execCommand"
  } catch (e) {}
  return null
}

export default function App() {
  // === States ===
  const [sequenceInfo, setSequenceInfo] = useState(null)
  const [numSpeakers, setNumSpeakers] = useState(2)
  const numSpeakersRef = useRef(2)
  const [availableAudioTracks, setAvailableAudioTracks] = useState([]) // [{trackIndex, clipCount, name}]
  const [selectedTrackIndices, setSelectedTrackIndices] = useState(new Set())
  const selectedTrackIndicesRef = useRef(new Set())
  const isUploadRef = useRef(false) // 업로드 중엔 트랙 리로드/선택 리셋 방지
  const updateSelectedTrackIndices = useCallback((next) => {
    selectedTrackIndicesRef.current = next
    setSelectedTrackIndices(next)
  }, [])
  const [summary, setSummary] = useState(null)
  const [summaryLoading, setSummaryLoading] = useState(false)
  const [summaryError, setSummaryError] = useState(false)
  const [summaryTaskId, setSummaryTaskId] = useState(null)
  const [sentences, setSentences] = useState([])
  const [currentWordId, setCurrentWordId] = useState(null)
  const [isProcessing, setIsProcessing] = useState(false)
  const [batchProgress, setBatchProgress] = useState(null)
  const [showHistory, setShowHistory] = useState(false)
  const [showDownload, setShowDownload] = useState(false)
  const [showSpeakers, setShowSpeakers] = useState(false)
  const [spkNames, setSpkNames] = useState({})
  const spkNamesRef = useRef({})
  const loadedSequenceIdRef = useRef(null)
  const [isLoadingHistory, setIsLoadingHistory] = useState(false)
  const [selectedWordIds, setSelectedWordIds] = useState(new Set())
  const [backupList, setBackupList] = useState([])
  const [restoreConfirm, setRestoreConfirm] = useState(null)
  const [focusedWord, setFocusedWordState] = useState(null)
  const focusedWordRef = useRef(null)
  const setFocusedWord = useCallback((value) => {
    focusedWordRef.current = value
    setFocusedWordState(value)
  }, [])
  const [audioPath, setAudioPath] = useState(null)
  const [silenceSeconds, setSilenceSeconds] = useState("1")
  const [showProcessingModal, setShowProcessingModal] = useState(false)
  const [currentTime, setCurrentTime] = useState(0)
  const [isPlayingState, setIsPlayingState] = useState(false)
  const [currentWordSentenceIdx, setCurrentWordSentenceIdx] = useState(null)
  const [hasSavedState, setHasSavedState] = useState(false)
  const [isRestoring, setIsRestoring] = useState(false)
  const [bannerDismissed, setBannerDismissed] = useState(false)
  const [activeTab, setActiveTab] = useState("cut")
  const [originalSpkList, setOriginalSpkList] = useState([])
  const [subsMaxWords, setSubsMaxWordsState] = useState(4)
  const subsMaxWordsRef = useRef(4)
  const setSubsMaxWords = useCallback((val) => {
    subsMaxWordsRef.current = val
    setSubsMaxWordsState(val)
  }, [])
  const [editingWord, setEditingWordState] = useState(null)
  const editingWordRef = useRef(null)
  const setEditingWord = useCallback((value) => {
    editingWordRef.current = value
    setEditingWordState(value)
  }, [])
  const [showCaptionConfirm, setShowCaptionConfirm] = useState(false)
  const [subsSentences, setSubsSentences] = useState([])
  const subsSentencesRef = useRef([])
  const [peaks, setPeaks] = useState(null)
  const [peaksDuration, setPeaksDuration] = useState(null)

  // === 편집자 확인 (입력값은 메모리에만 보관, 저장 시 서버로 전송) ===
  const [workerName, setWorkerName] = useState("")
  const [workerConfirmed, setWorkerConfirmed] = useState(false)
  const workerRef = useRef(null)

  const confirmWorker = useCallback(() => {
    const name = (workerName || "").trim()
    if (!name) return
    workerRef.current = name
    setWorkerConfirmed(true)
  }, [workerName])

  // === Refs ===
  const batchAbortRef = useRef(null)
  const wordRefs = useRef({})
  const subsWordRefs = useRef({})
  const sentencesRef = useRef(sentences)
  const timelineIndexRef = useRef(null)
  const containerRef = useRef(null)
  const focusTrapRef = useRef(null)
  const currentTimeRef = useRef(0)
  const currentWordIdRef = useRef(null)
  const isPlayingStateRef = useRef(false)
  const wordSentenceIdxRef = useRef(new Map())
  const timebaseRef = useRef(8467200000n)

  // === Logging ===
  const [logs, setLogs] = useState([])
  const [logPanelOpen, setLogPanelOpen] = useState(true)
  const logPanelRef = useRef(null)
  const addLog = useCallback((level, message) => {
    const msg = String(message)
    // CEP 디버거 콘솔에도 출력
    if (level === "error") console.error(`[${level}]`, msg)
    else if (level === "warn") console.warn(`[${level}]`, msg)
    else console.log(`[${level}]`, msg)
    setLogs((prev) => {
      const next = [...prev, { level, message: msg, time: new Date() }]
      // 최근 500줄만 유지 (메모리 누적 방지)
      return next.length > 500 ? next.slice(next.length - 500) : next
    })
  }, [])
  // 로그 추가 시 열려 있으면 맨 아래로 스크롤 (닫혀 있으면 그대로 — 자동으로 열지 않음)
  useEffect(() => {
    if (logPanelOpen && logPanelRef.current) {
      logPanelRef.current.scrollTop = logPanelRef.current.scrollHeight
    }
  }, [logs, logPanelOpen])
  const handleClearLogs = useCallback(() => setLogs([]), [])

  // === Hooks ===
  const { saveState, saveSubtitleData, loadState, checkSavedState, isSaving } =
    useStatePersistence({
      sequenceInfo,
      sentences,
      silenceSeconds,
      selectedWordIds,
      timebaseRef,
      spkNamesRef,
      addLog,
    })

  const {
    isConnected,
    error,
    setError,
    isRefreshing,
    isInitializing,
    status,
    setStatus,
    loadSequenceInfo,
    checkConnection,
  } = useConnection({
    checkSavedState,
    setHasSavedState,
    setSequenceInfo,
    addLog,
    isUploadRef,
    sentencesRef,
  })

  // setStatus 필요 → useConnection 이후에 정의
  const handleCopyLogs = useCallback(() => {
    const text = logs
      .map(
        (l) => `${l.time.toLocaleTimeString("ko-KR")} [${l.level}] ${l.message}`,
      )
      .join("\n")
    const ok = copyToClipboard(text)
    setStatus(ok ? "로그 복사됨" : "로그 복사 실패")
    return !!ok
  }, [logs, setStatus])

  const { handleTranscribeFinish, resetAllState, fetchSummary } = useTranscribe(
    {
      setStatus,
      setSentences,
      sentencesRef,
      timebaseRef,
      setOriginalSpkList,
      setHasSavedState,
      saveState,
      setSummary,
      setSummaryLoading,
      setSummaryError,
      setSummaryTaskId,
      numSpeakersRef,
      addLog,
      setAudioPath,
      setCurrentWordId,
      setSelectedWordIds,
      setFocusedWord,
      setCurrentTime,
      setIsPlayingState,
      timelineIndexRef,
    },
  )

  const handleRetrySummary = useCallback(() => {
    if (summaryTaskId) fetchSummary(summaryTaskId)
  }, [summaryTaskId, fetchSummary])

  // "다시 받아쓰기" — 바로 시작하지 않고 홈 화면으로 돌려서 사용자가 트랙/화자 재설정 가능하게
  const handleReturnToHome = useCallback(() => {
    // 받아쓰기 결과가 있는 상태에서 다시 받아쓰기로 돌아가면 저장된 상태 복원 가능 — SavedStateBanner 노출
    if (sentencesRef.current.length > 0) {
      setHasSavedState(true)
      setBannerDismissed(false)
    }
    setSentences([])
    sentencesRef.current = []
    setSelectedWordIds(new Set())
    setCurrentWordId(null)
    setFocusedWord(null)
    setAudioPath(null)
    setSummary(null)
    setSummaryError(false)
    setSummaryTaskId(null)
    setSpkNames({})
    spkNamesRef.current = {}
    timelineIndexRef.current = null
  }, [setFocusedWord])

  const silenceThresholdMs = React.useMemo(() => {
    const parsed = parseFloat(silenceSeconds)
    return Math.round((Number.isFinite(parsed) ? parsed : 1) * 1000)
  }, [silenceSeconds])

  const isSilenceHidden = useCallback(
    (word) =>
      word.edit_points?.type === "silence" &&
      word.duration < silenceThresholdMs,
    [silenceThresholdMs],
  )

  // === Sentences sync ===
  useEffect(() => {
    sentencesRef.current = sentences
    if (sentences.length > 0) {
      timelineIndexRef.current = buildTimelineIndex(sentences)
      const map = new Map()
      sentences.forEach((s, sIdx) => {
        s.words?.forEach((w) => map.set(w.start_at, sIdx))
      })
      wordSentenceIdxRef.current = map
      setTimeout(() => focusTrapRef.current?.focus(), 100)

      if (subsSentencesRef.current.length === 0) {
        const subs = splitForSubtitles(sentences, subsMaxWords)
        setSubsSentences(subs)
        subsSentencesRef.current = subs
      } else {
        const wordMap = new Map()
        sentences.forEach((s) => s.words?.forEach((w) => wordMap.set(w.id, w)))
        const synced = subsSentencesRef.current.map((s) => ({
          ...s,
          words: s.words.map((w) => {
            const orig = wordMap.get(w.id)
            if (!orig) return w
            // 드래그/편집으로 바뀐 tick·시간 필드까지 sync (is_deleted만 sync 시
            // subs 탭이 stale tick으로 시킹/재생되는 문제 방지)
            // 자막 K 삭제는 자막에서만 적용되므로 OR로 보존 (컷편집에서 삭제 || 자막에서 K 삭제)
            const mergedDeleted = !!orig.is_deleted || !!w.is_deleted
            if (
              mergedDeleted !== w.is_deleted ||
              orig.start_at !== w.start_at ||
              orig.end_at !== w.end_at ||
              orig.start_at_tick !== w.start_at_tick ||
              orig.end_at_tick !== w.end_at_tick
            ) {
              return {
                ...w,
                is_deleted: mergedDeleted,
                start_at: orig.start_at,
                end_at: orig.end_at,
                start_at_tick: orig.start_at_tick,
                end_at_tick: orig.end_at_tick,
                start_at_sec: orig.start_at_sec,
                end_at_sec: orig.end_at_sec,
                original_start_at: orig.original_start_at,
                original_end_at: orig.original_end_at,
              }
            }
            return w
          }),
        }))
        setSubsSentences(synced)
        subsSentencesRef.current = synced
      }
    } else {
      setSubsSentences([])
      subsSentencesRef.current = []
    }
  }, [sentences])

  // 시퀀스 변경 시 오디오 트랙 목록 조회 (받아쓰기 전에만 필요)
  const loadAudioTracks = useCallback(async () => {
    const res = await getAudioTracksWithClips()
    if (res?.success && res.tracks) {
      setAvailableAudioTracks(res.tracks)
      // 기본: 아무것도 선택 안 함 (사용자가 명시적으로 골라야 함)
      updateSelectedTrackIndices(new Set())
    } else {
      setAvailableAudioTracks([])
      updateSelectedTrackIndices(new Set())
    }
  }, [updateSelectedTrackIndices])

  useEffect(() => {
    // 업로드 중에는 시퀀스가 cloneAndArchiveSequence로 바뀌어도 선택을 보존
    if (sequenceInfo?.id && sentences.length === 0 && !isUploadRef.current) {
      loadAudioTracks()
    }
  }, [sequenceInfo?.id, sentences.length, loadAudioTracks])

  useEffect(() => {
    // 새로고침 시작 시 배너 dismiss 상태 리셋(필요하면 다시 노출되도록)
    if (isRefreshing) setBannerDismissed(false)
  }, [isRefreshing])

  const toggleTrackSelection = useCallback(
    (trackIndex) => {
      const next = new Set(selectedTrackIndicesRef.current)
      if (next.has(trackIndex)) next.delete(trackIndex)
      else next.add(trackIndex)
      updateSelectedTrackIndices(next)
    },
    [updateSelectedTrackIndices],
  )

  // === Keyboard ===
  const navSentencesRef = activeTab === "subs" ? subsSentencesRef : sentencesRef
  const navWordRefs = activeTab === "subs" ? subsWordRefs : wordRefs
  const activeTabRef = useRef(activeTab)
  activeTabRef.current = activeTab
  const { handleKeyDown } = useKeyboardNavigation({
    sentencesRef: navSentencesRef,
    focusedWord,
    setFocusedWord,
    setSelectedWordIds,
    wordRefs: navWordRefs,
    isSilenceHidden,
    activeTabRef,
  })

  useEffect(() => {
    const onKey = (e) => handleKeyDown(e)
    window.addEventListener("keydown", onKey)
    window.addEventListener("keyup", onKey)
    return () => {
      window.removeEventListener("keydown", onKey)
      window.removeEventListener("keyup", onKey)
    }
  }, [focusedWord, activeTab])

  usePlaybackTracking({
    isConnected,
    sentencesLength: sentences.length,
    isProcessing,
    currentTimeRef,
    setCurrentTime,
    currentWordIdRef,
    setCurrentWordId,
    setCurrentWordSentenceIdx,
    wordSentenceIdxRef,
    isPlayingStateRef,
    setIsPlayingState,
    timelineIndexRef,
    wordRefs,
    subsWordRefs,
    activeTabRef,
  })

  // === Handlers ===
  const handleWordTimeChange = (wordId, newStart, newEnd) => {
    setSentences((prev) =>
      prev.map((sentence) => ({
        ...sentence,
        words: sentence.words?.map((word) => {
          const wId = String(word.id || word.start_at)
          if (wId === String(wordId)) {
            return {
              ...word,
              start_at: newStart,
              end_at: newEnd,
              start_at_sec: newStart / 1000,
              end_at_sec: newEnd / 1000,
              start_at_tick: secondsToTicksAligned(
                newStart / 1000,
                timebaseRef.current,
              ),
              end_at_tick: secondsToTicksAligned(
                newEnd / 1000,
                timebaseRef.current,
              ),
            }
          }
          return word
        }),
      })),
    )
  }

  // 드래그된 단어 region을 원본 STT 위치로 되돌림 (↺ 버튼)
  const handleResetWordTime = (wordId) => {
    setSentences((prev) =>
      prev.map((sentence) => ({
        ...sentence,
        words: sentence.words?.map((word) => {
          const wId = String(word.id || word.start_at)
          if (wId !== String(wordId)) return word
          if (word.original_start_at == null || word.original_end_at == null) {
            return word
          }
          return {
            ...word,
            start_at: word.original_start_at,
            end_at: word.original_end_at,
            start_at_sec: word.original_start_at / 1000,
            end_at_sec: word.original_end_at / 1000,
            start_at_tick: secondsToTicksAligned(
              word.original_start_at / 1000,
              timebaseRef.current,
            ),
            end_at_tick: secondsToTicksAligned(
              word.original_end_at / 1000,
              timebaseRef.current,
            ),
          }
        }),
      })),
    )
  }

  const handleSummarySeek = async (timeSec) => {
    const timelineTime = getTimelineTimeFromOriginal(timeSec)
    await setPlayerPosition(timelineTime)
    // 해당 위치의 단어 찾아서 포커스 + 스크롤
    if (timelineIndexRef.current) {
      const found = findCurrentWordFromIndex(
        timelineIndexRef.current,
        timelineTime,
      )
      if (found?.word) {
        let sIdx = -1,
          wIdx = -1
        sentencesRef.current.forEach((s, si) => {
          s.words?.forEach((w, wi) => {
            if (w.start_at === found.word.start_at) {
              sIdx = si
              wIdx = wi
            }
          })
        })
        if (sIdx >= 0) {
          setFocusedWord({ sentenceIdx: sIdx, wordIdx: wIdx })
          setCurrentWordId(found.word.start_at)
          wordRefs.current[found.word.start_at]?.scrollIntoView({
            behavior: "instant",
            block: "center",
          })
        }
      }
    }
  }

  const handleWaveformSeek = async (time, hintedWordId = null) => {
    const timelineTime = getTimelineTimeFromOriginal(time)
    await setPlayerPosition(timelineTime)

    // hint가 있으면(파형 region 클릭) 시간 lookup 대신 그 단어로 직접 점프
    if (hintedWordId != null) {
      let foundWord = null
      let sIdx = -1,
        wIdx = -1
      sentencesRef.current.forEach((s, si) => {
        s.words?.forEach((w, wi) => {
          if ((w.id || w.start_at) === hintedWordId) {
            foundWord = w
            sIdx = si
            wIdx = wi
          }
        })
      })
      if (foundWord) {
        setFocusedWord({ sentenceIdx: sIdx, wordIdx: wIdx })
        setCurrentWordId(foundWord.start_at)
        wordRefs.current[foundWord.start_at]?.scrollIntoView({
          behavior: "instant",
          block: "center",
        })
        return
      }
    }

    if (timelineIndexRef.current) {
      const found = findCurrentWordFromIndex(
        timelineIndexRef.current,
        timelineTime,
      )
      if (found?.word) {
        let sIdx = -1,
          wIdx = -1
        sentencesRef.current.forEach((s, si) => {
          s.words?.forEach((w, wi) => {
            if (w.start_at === found.word.start_at) {
              sIdx = si
              wIdx = wi
            }
          })
        })
        if (sIdx >= 0) setFocusedWord({ sentenceIdx: sIdx, wordIdx: wIdx })
        setCurrentWordId(found.word.start_at)
        wordRefs.current[found.word.start_at]?.scrollIntoView({
          behavior: "instant",
          block: "center",
        })
      }
    }
  }

  const handleWordClick = (word, sentenceIdx, wordIdx) => {
    if (editingWord) setEditingWord(null)
    let sIdx = sentenceIdx
    let wIdx = wordIdx
    // 렌더링된 인덱스가 전달되지 않은 경우에만 검색 폴백
    if (sIdx == null || wIdx == null) {
      sIdx = -1
      wIdx = -1
      const searchSentences =
        activeTab === "subs" ? subsSentencesRef.current : sentencesRef.current
      const matchById = word.id != null
      outer: for (let si = 0; si < searchSentences.length; si++) {
        const s = searchSentences[si]
        for (let wi = 0; wi < (s.words?.length || 0); wi++) {
          const w = s.words[wi]
          const isMatch = matchById
            ? w.id === word.id
            : w.start_at === word.start_at
          if (isMatch) {
            sIdx = si
            wIdx = wi
            break outer
          }
        }
      }
    }
    if (sIdx === -1 || sIdx == null) return
    setFocusedWord({ sentenceIdx: sIdx, wordIdx: wIdx })
    setCurrentWordId(word.start_at)
    const result = getTimelinePositionTick(word, sentencesRef.current)
    if (result?.startTick !== undefined) {
      // result.startTick = word.start_at_tick(frame-floor) - offset
      // 단어의 정확한 source ms 위치로 seek 보정 — frame-floor 때문에 단어 시작
      // 직전(최대 33ms@30fps)으로 점프하던 문제 해결. razor는 그대로 floor 유지.
      const exactWordTick = BigInt(
        Math.round((word.start_at / 1000) * 254016000000),
      )
      const flooredOffset = BigInt(word.start_at_tick || 0) - result.startTick
      const seekTick = exactWordTick - flooredOffset
      setPlayerPositionByTicks(seekTick.toString())
        .then(() => {
          // Premiere seek 후 패널 포커스 확실히 회복 (편집 중이면 input 포커스 유지)
          setTimeout(() => {
            if (!editingWordRef.current) focusTrapRef.current?.focus()
          }, 0)
        })
        .catch(() => {
          if (!editingWordRef.current) focusTrapRef.current?.focus()
        })
    } else if (!editingWordRef.current) {
      focusTrapRef.current?.focus()
    }
  }

  const { handleApplySelected, handleDeleteSentence } = useBatchEdit({
    sentencesRef,
    setSentences,
    selectedWordIds,
    setSelectedWordIds,
    batchAbortRef,
    isProcessing,
    setIsProcessing,
    setBatchProgress,
    setShowProcessingModal,
    setStatus,
    addLog,
    saveState,
    formatBackupName,
    loadedSequenceIdRef,
    sequenceInfo,
  })

  const handleStartEditing = useCallback((sentenceIdx, wordIdx) => {
    setEditingWord({ sentenceIdx, wordIdx })
  }, [])

  const handleWordTextUpdate = useCallback(
    (sentenceIdx, wordIdx, newText, wordId) => {
      setEditingWord(null)
      focusTrapRef.current?.focus()
      if (newText === null) return
      setSubsSentences((prev) => {
        const next = prev.map((s) => ({
          ...s,
          words: s.words.map((w) =>
            w.id === wordId ? { ...w, text: newText } : w,
          ),
        }))
        subsSentencesRef.current = next
        return next
      })
    },
    [],
  )

  const handleCaptionClick = useCallback(async () => {
    const exists = await hasCaptionsBin()
    if (exists) {
      setShowCaptionConfirm(true)
    } else {
      handleApplyCaptions()
    }
  }, [])

  const handleApplyCaptions = useCallback(async () => {
    setShowCaptionConfirm(false)
    try {
      setStatus("자막 적용 중...")
      addLog("info", "캡션 SRT 생성 시작")
      const result = await exportCaptionsAsSRT(
        sentencesRef.current,
        subsSentencesRef.current,
      )
      if (result?.success) {
        setStatus(`캡션 적용 완료: 화자 ${result.speakers}명`)
        addLog("info", `캡션 적용 완료: ${result.files}개 트랙`)
        const spkList = [
          ...new Set(subsSentencesRef.current.map((s) => s.spk || 0)),
        ].sort()
        saveSubtitleData(subsSentencesRef.current, subsMaxWordsRef.current, {
          count: spkList.length,
          list: spkList,
        })
      } else {
        setStatus("캡션 적용 실패")
        addLog(
          "warn",
          "캡션 적용 실패: " + (result?.error || "알 수 없는 오류"),
        )
      }
    } catch (e) {
      setStatus("캡션 적용 실패")
      addLog("warn", "캡션 적용 오류: " + e.message)
    }
  }, [addLog, saveSubtitleData])

  const handleChangeSpkCut = useCallback((sentenceIdx, newSpk) => {
    setSentences((prev) => {
      const next = [...prev]
      next[sentenceIdx] = { ...next[sentenceIdx], spk: newSpk }
      return next
    })
  }, [])

  const handleChangeSpkSubs = useCallback((sentenceIdx, newSpk) => {
    setSubsSentences((prev) => {
      const next = [...prev]
      next[sentenceIdx] = { ...next[sentenceIdx], spk: newSpk }
      subsSentencesRef.current = next
      return next
    })
  }, [])

  const {
    undo: subsUndo,
    redo: subsRedo,
    pushUndo: subsPushUndo,
    undoStackRef,
    redoStackRef,
  } = useSubtitleKeyboard({
    activeTab,
    subsSentencesRef,
    focusedWordRef,
    setSubsSentences,
    setFocusedWord,
    sentencesRef,
  })

  const cutSearch = useSearchAndReplace({
    sentences,
    setSentences,
    sentencesRef,
    wordRefs,
    pushUndo: null,
    isActiveTab: activeTab === "cut",
    onAfterChange: useCallback(
      (next) => saveState({ sentences: next }),
      [saveState],
    ),
  })

  const subsSearch = useSearchAndReplace({
    sentences: subsSentences,
    setSentences: setSubsSentences,
    sentencesRef: subsSentencesRef,
    wordRefs: subsWordRefs,
    pushUndo: subsPushUndo,
    isActiveTab: activeTab === "subs",
    onAfterChange: useCallback(
      (next) => {
        const spkList = [...new Set(next.map((s) => s.spk || 0))].sort()
        saveSubtitleData(next, subsMaxWordsRef.current, {
          count: spkList.length,
          list: spkList,
        })
      },
      [saveSubtitleData],
    ),
  })

  // Cmd/Ctrl+F → 활성 탭의 검색 사이드바 토글 (열려있으면 닫기, 닫혀있으면 열기+포커스)
  const cutFocusInput = cutSearch.focusInput
  const subsFocusInput = subsSearch.focusInput
  const cutClose = cutSearch.close
  const subsClose = subsSearch.close
  const cutIsOpen = cutSearch.isOpen
  const subsIsOpen = subsSearch.isOpen
  useEffect(() => {
    const handler = (e) => {
      // 한국어 IME 활성 시 e.key가 "f"가 아닌 한글 자모가 되므로 e.code/e.keyCode로도 확인
      const isFKey =
        e.key === "f" || e.key === "F" || e.code === "KeyF" || e.keyCode === 70
      if ((e.metaKey || e.ctrlKey) && isFKey) {
        if (sentencesRef.current.length === 0) return
        e.preventDefault()
        e.stopPropagation()
        const isOpen = activeTab === "subs" ? subsIsOpen : cutIsOpen
        if (isOpen) {
          if (activeTab === "subs") subsClose()
          else cutClose()
        } else {
          if (activeTab === "subs") subsFocusInput()
          else cutFocusInput()
        }
      }
    }
    window.addEventListener("keydown", handler, true)
    return () => window.removeEventListener("keydown", handler, true)
  }, [
    activeTab,
    cutFocusInput,
    subsFocusInput,
    cutClose,
    subsClose,
    cutIsOpen,
    subsIsOpen,
  ])

  const { handleOpenHistory, handleBackupClick, handleRestoreConfirm } =
    useBackupRestore({
      sentencesRef,
      setSentences,
      selectedWordIds,
      silenceSeconds,
      timebaseRef,
      restoreConfirm,
      setRestoreConfirm,
      setShowHistory,
      setIsLoadingHistory,
      setBackupList,
      setHasSavedState,
      loadedSequenceIdRef,
      setStatus,
      setIsRestoring,
      loadSequenceInfo,
    })

  const {
    silenceWordIds,
    fillerWordIds,
    allSilenceSelected,
    allFillerSelected,
    handleSelectSilence,
    handleSelectFiller,
  } = useWordSelection({
    sentences,
    selectedWordIds,
    setSelectedWordIds,
    silenceThresholdMs,
    setStatus,
  })

  const {
    uploadFile,
    onClickRenderAudio,
    onClickCancel,
    isUpload,
    audioPath: uploadedAudioPath,
  } = useAudioUpload({
    numSpeakersRef,
    selectedTrackIndicesRef,
    workerRef,
    onFinish: async (taskId) => {
      await handleTranscribeFinish(taskId)
      loadedSequenceIdRef.current = sequenceInfo?.id
    },
    onClose: () => {
      setStatus("취소됨")
      resetAllState()
    },
    onStart: async () => {
      // 먼저 화면 초기화
      // 시퀀스 클론으로 시퀀스 ID가 바뀌어도 트랙 선택을 보존하기 위해 즉시 set
      isUploadRef.current = true
      // 다시 받아쓰기인 경우(이전 받아쓰기 결과가 있음) → 저장된 상태가 있으니 초기 화면에서 SavedStateBanner 노출
      if (sentencesRef.current.length > 0) {
        setHasSavedState(true)
        setBannerDismissed(false)
      }
      setSentences([])
      setCurrentWordId(null)
      setSelectedWordIds(new Set())
      setFocusedWord(null)
      setPeaks(null)
      setPeaksDuration(null)
      setAudioPath(null)
      setSummary(null)
      setSpkNames({})
      spkNamesRef.current = {}
      sentencesRef.current = []
      timelineIndexRef.current = null
      // 백그라운드로 시퀀스 복제
      const cloneResult = await cloneAndArchiveSequence()
      if (cloneResult.success) {
        const newInfo = await getActiveSequenceInfo()
        if (newInfo?.name) {
          setSequenceInfo(newInfo)
          addLog("info", `새 시퀀스 생성: ${newInfo.id}`)
        }
      } else {
        addLog("warn", `시퀀스 복제 실패: ${cloneResult.error}`)
      }
    },
    addLog,
  })

  useEffect(() => {
    setAudioPath(uploadedAudioPath || null)
  }, [uploadedAudioPath])

  useEffect(() => {
    isUploadRef.current = isUpload
  }, [isUpload])

  // === Load saved state ===
  const handleLoadSavedState = async () => {
    try {
      setIsRestoring(true)
      // 받아쓰기 진행 중이면 먼저 취소
      if (isUploadRef.current) {
        await onClickCancel()
      }
      setStatus("이전 편집 상태 불러오는 중...")
      const savedState = await loadState()
      if (savedState && savedState.sentences?.length > 0) {
        loadedSequenceIdRef.current = sequenceInfo?.id
        const framerateInfo = await getSequenceFramerate()
        if (framerateInfo.timebase)
          timebaseRef.current = BigInt(framerateInfo.timebase)
        const { restoreWords } = await import("../js/initWords")
        const gapSentences = restoreWords(savedState.sentences)
        setSentences(gapSentences)
        sentencesRef.current = gapSentences
        setSilenceSeconds(savedState.silenceSeconds || "1")
        setAudioPath(null)
        if (savedState.waveform) {
          setPeaks(savedState.waveform.data || savedState.waveform)
          setPeaksDuration(savedState.waveform.duration || null)
          addLog("info", "peaks 로드 완료")
        }
        setSelectedWordIds(savedState.selectedWordIds || new Set())
        if (savedState.timebase) timebaseRef.current = savedState.timebase
        await setAllTracksLocked(true)
        setStatus(`복원 완료: ${gapSentences.length}개 문장`)
        addLog("info", "이전 편집 상태 복원됨")
        gapSentences.forEach((s) => {
          s.original_spk = s.spk || 0
        })
        setOriginalSpkList(
          [...new Set(gapSentences.map((s) => s.spk || 0))].sort(),
        )
        if (
          savedState.speakers &&
          Object.keys(savedState.speakers).length > 0
        ) {
          setSpkNames(savedState.speakers)
          spkNamesRef.current = savedState.speakers
        }
        const subtitleData = savedState.subtitleData
        if (subtitleData) {
          setSubsSentences(subtitleData.sentences)
          subsSentencesRef.current = subtitleData.sentences
          setSubsMaxWords(subtitleData.maxWords || 4)
          addLog("info", "자막 편집 데이터 복원됨")
        }
        // 요약본: 불러오기 데이터에 포함되면 바로 사용, 없으면 task_id로 API 호출
        addLog(
          "info",
          `[불러오기] summaryData: ${savedState.summaryData ? "있음" : "없음"}, taskId: ${savedState.taskId || "없음"}`,
        )
        if (savedState.summaryData) {
          setSummary(savedState.summaryData)
          setSummaryTaskId(savedState.taskId || null)
          setSummaryError(false)
          addLog("info", "요약본 복원됨")
        } else if (savedState.taskId) {
          fetchSummary(savedState.taskId)
        }
      } else {
        setStatus("복원할 데이터가 없습니다")
      }
    } catch (e) {
      setStatus("복원 실패: " + e.message)
      addLog("warn", "상태 복원 실패: " + e.message)
    } finally {
      setIsRestoring(false)
      setHasSavedState(false)
    }
  }

  // === Render ===
  if (error) {
    return (
      <div className="px-4 pt-4 h-screen flex flex-col">
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
      className="h-screen flex flex-col overflow-hidden outline-none"
      ref={containerRef}
      tabIndex={0}
      onMouseDown={(e) => {
        if (
          e.target.tagName !== "INPUT" &&
          e.target.tagName !== "TEXTAREA" &&
          e.target.tagName !== "SELECT"
        ) {
          focusTrapRef.current?.focus()
          if (!e.target.closest(".word")) {
            setFocusedWord(null)
          }
        }
      }}
    >
      <input
        ref={focusTrapRef}
        data-focus-trap="true"
        readOnly
        style={{
          position: "fixed",
          opacity: 0,
          pointerEvents: "none",
          width: 1,
          height: 1,
          top: -10,
          left: -10,
          border: "none",
          outline: "none",
          padding: 0,
        }}
      />

      {isInitializing && (
        <div className="fixed inset-0 bg-background z-50 flex flex-col items-center justify-center">
          <RefreshCw className="w-8 h-8 animate-spin text-muted-foreground mb-3" />
          <p className="text-sm text-muted-foreground">{status}</p>
        </div>
      )}

      {/* 편집자 확인 게이트: 연결 확인 후 편집 화면 전에 먼저 표시 */}
      {!isInitializing && !workerConfirmed && (
        <div className="fixed inset-0 bg-background z-40 overflow-y-auto">
          <div className="min-h-full flex flex-col items-center justify-center px-6 py-6">
          <div className="w-full max-w-xs flex flex-col gap-3">
            <div className="text-center">
              <h2 className="text-base font-semibold">편집자 확인</h2>
              <p className="text-xs text-muted-foreground mt-1">
                데이터 수집을 위해 편집자를 입력해주세요.
              </p>
            </div>
            <input
              autoFocus
              type="text"
              value={workerName}
              onChange={(e) => setWorkerName(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") confirmWorker()
              }}
              placeholder="이름"
              className="w-full text-sm bg-transparent border border-border rounded-md px-3 py-2 outline-none focus:border-white/40"
            />
            <Button onClick={confirmWorker} disabled={!workerName.trim()}>
              다음
            </Button>
          </div>
          </div>
        </div>
      )}

      <ConfirmDialogHost />

      <AppHeader
        worker={workerConfirmed ? workerName : ""}
        activeTab={activeTab}
        onTabChange={(tab) => {
          setFocusedWord(null)
          setActiveTab(tab)
        }}
        onOpenHistory={handleOpenHistory}
        canOpenHistory={sentences.length > 0}
        onUndo={subsUndo}
        onRedo={subsRedo}
        canUndo={undoStackRef.current.length > 0}
        canRedo={redoStackRef.current.length > 0}
        sequenceInfo={sequenceInfo}
        isRefreshing={isRefreshing}
        onRefresh={loadSequenceInfo}
        version={getExtensionVersion()}
        onOpenDownload={() => setShowDownload(true)}
        canDownload={sentences.length > 0}
        onOpenSpeakers={() => setShowSpeakers(true)}
        canEditSpeakers={sentences.length > 0}
      />

      <LogPanel
        logs={logs}
        open={logPanelOpen}
        onToggle={() => setLogPanelOpen((v) => !v)}
        onCopy={handleCopyLogs}
        onClear={handleClearLogs}
        logPanelRef={logPanelRef}
      />

      <div className="flex flex-col flex-1 min-h-0">
        {/* 다른 시퀀스의 저장된 상태가 있으면 배너 표시 */}
        {workerConfirmed &&
          hasSavedState &&
          !isUpload &&
          !isProcessing &&
          !bannerDismissed &&
          sentences.length > 0 &&
          sequenceInfo?.id &&
          sequenceInfo.id !== loadedSequenceIdRef.current &&
          !isRefreshing && (
            <div className="px-4 pt-2">
              <SavedStateBanner
                hasSavedState={hasSavedState}
                isUpload={isUpload}
                isRestoring={isRestoring}
                onLoad={handleLoadSavedState}
                onDismiss={() => setBannerDismissed(true)}
              />
            </div>
          )}

        {/* 받아쓰기 전 (썸네일 탭에서는 숨김) */}
        {sentences.length === 0 && activeTab !== "thumb" && (
          <CutEditControls
            uploadFile={uploadFile}
            onClickCancel={onClickCancel}
            silenceSeconds={silenceSeconds}
            onSilenceChange={setSilenceSeconds}
            onTranscribe={onClickRenderAudio}
            isUpload={isUpload}
            isConnected={isConnected}
            isProcessing={isProcessing}
            sentences={sentences}
            allSilenceSelected={allSilenceSelected}
            allFillerSelected={allFillerSelected}
            onSelectSilence={handleSelectSilence}
            onSelectFiller={handleSelectFiller}
            numSpeakers={numSpeakers}
            onNumSpeakersChange={(val) => {
              setNumSpeakers(val)
              numSpeakersRef.current = val
            }}
            availableAudioTracks={availableAudioTracks}
            selectedTrackIndices={selectedTrackIndices}
            onToggleTrack={toggleTrackSelection}
            hasSavedState={workerConfirmed && hasSavedState}
            isRestoring={isRestoring}
            onLoadSavedState={handleLoadSavedState}
          />
        )}

        {/* 컷편집 탭 */}
        <div
          className={`flex flex-col flex-1 min-h-0 ${sentences.length === 0 || activeTab !== "cut" ? "hidden" : ""}`}
        >
          <CutEditTab
            silenceSeconds={silenceSeconds}
            onSilenceChange={setSilenceSeconds}
            onTranscribe={handleReturnToHome}
            isUpload={isUpload}
            isConnected={isConnected}
            isProcessing={isProcessing}
            sentences={sentences}
            allSilenceSelected={allSilenceSelected}
            allFillerSelected={allFillerSelected}
            silenceCount={silenceWordIds.size}
            fillerCount={fillerWordIds.size}
            onSelectSilence={handleSelectSilence}
            onSelectFiller={handleSelectFiller}
            numSpeakers={numSpeakers}
            onNumSpeakersChange={(val) => {
              setNumSpeakers(val)
              numSpeakersRef.current = val
            }}
            summary={summary}
            summaryLoading={summaryLoading}
            summaryError={summaryError}
            onRetrySummary={handleRetrySummary}
            focusedWord={activeTab === "cut" ? focusedWord : null}
            currentWordId={currentWordId}
            currentWordSentenceIdx={currentWordSentenceIdx}
            selectedWordIds={selectedWordIds}
            searchResultsSet={cutSearch.searchResultsSet}
            currentSearchWordId={cutSearch.currentSearchWordId}
            search={cutSearch}
            silenceThresholdMs={silenceThresholdMs}
            wordRefs={wordRefs}
            onWordClick={handleWordClick}
            onDeleteSentence={handleDeleteSentence}
            setFocusedWord={setFocusedWord}
            onChangeSpk={handleChangeSpkCut}
            onApply={handleApplySelected}
            onSummarySeek={handleSummarySeek}
            audioPath={audioPath}
            peaks={peaks}
            peaksDuration={peaksDuration}
            currentTime={currentTime}
            isPlayingState={isPlayingState}
            onWordTimeChange={handleWordTimeChange}
            onResetWordTime={handleResetWordTime}
            onWaveformSeek={handleWaveformSeek}
            spkNames={spkNames}
          />
        </div>

        {/* 썸네일 소스 제작 탭 - 받아쓰기 여부와 무관하게 동작 */}
        <div
          className={`flex flex-col flex-1 min-h-0 ${activeTab !== "thumb" ? "hidden" : ""}`}
        >
          <ThumbnailTab
            isConnected={isConnected}
            worker={workerConfirmed ? workerName : ""}
            summary={summary}
          />
        </div>

        {/* 자막편집 탭 */}
        <div
          className={`flex flex-col flex-1 min-h-0 ${sentences.length === 0 || activeTab !== "subs" ? "hidden" : ""}`}
        >
          <SubtitleEditTab
            sentences={sentences}
            subsSentences={subsSentences}
            setSubsSentences={setSubsSentences}
            subsSentencesRef={subsSentencesRef}
            originalSpkList={originalSpkList}
            setSentences={setSentences}
            subsMaxWords={subsMaxWords}
            setSubsMaxWords={setSubsMaxWords}
            focusedWord={activeTab === "subs" ? focusedWord : null}
            currentWordId={currentWordId}
            currentWordSentenceIdx={currentWordSentenceIdx}
            selectedWordIds={selectedWordIds}
            searchResultsSet={subsSearch.searchResultsSet}
            currentSearchWordId={subsSearch.currentSearchWordId}
            search={subsSearch}
            silenceThresholdMs={silenceThresholdMs}
            wordRefs={subsWordRefs}
            onWordClick={handleWordClick}
            onDeleteSentence={handleDeleteSentence}
            setFocusedWord={setFocusedWord}
            isUpload={isUpload}
            onChangeSpk={handleChangeSpkSubs}
            editingWord={editingWord}
            onStartEditing={handleStartEditing}
            onWordTextUpdate={handleWordTextUpdate}
            onWordEditingEnd={() => setEditingWord(null)}
            handleCaptionClick={handleCaptionClick}
            isConnected={isConnected}
            pushUndo={subsPushUndo}
            spkNames={spkNames}
          />
        </div>

        <BackupHistoryDialog
          open={showHistory}
          onClose={setShowHistory}
          backupList={backupList}
          isLoading={isLoadingHistory}
          onBackupClick={handleBackupClick}
        />
        <DownloadDialog
          open={showDownload}
          onClose={() => setShowDownload(false)}
          subsSentences={subsSentences}
          summary={summary}
          spkNames={spkNames}
          addLog={addLog}
        />
        <SpeakerNameDialog
          open={showSpeakers}
          onClose={() => setShowSpeakers(false)}
          initialSpeakers={[
            ...new Set([
              ...originalSpkList,
              ...sentences.map((s) => s.spk || 0),
              ...subsSentences.map((s) => s.spk || 0),
              ...Object.keys(spkNames).map(Number),
            ]),
          ]
            .sort((a, b) => a - b)
            .map((id) => ({ id, name: spkNames[id] || "" }))}
          usedSpkIds={
            new Set([
              ...sentences.map((s) => s.spk || 0),
              ...subsSentences.map((s) => s.spk || 0),
            ])
          }
          onSave={(list) => {
            const next = {}
            for (const s of list) next[s.id] = s.name
            setSpkNames(next)
            spkNamesRef.current = next
            saveState({ speakers: next })
          }}
        />
        <RestoreConfirmDialog
          restoreConfirm={restoreConfirm}
          isRestoring={isRestoring}
          onConfirm={handleRestoreConfirm}
          onCancel={() => setRestoreConfirm(null)}
        />

        <Dialog
          open={showCaptionConfirm}
          onOpenChange={() => setShowCaptionConfirm(false)}
        >
          <DialogContent className="max-w-sm">
            <DialogHeader>
              <DialogTitle>기존 캡션이 있습니다</DialogTitle>
            </DialogHeader>
            <p className="text-sm text-muted-foreground">
              시퀀스에 이미 적용된 캡션 트랙은 자동으로 삭제되지 않습니다.
              <br />
              기존 캡션 트랙을 시퀀스에서 직접 삭제한 후 적용하시는 것을
              권장합니다.
            </p>
            <DialogFooter className="gap-2">
              <Button
                variant="secondary"
                onClick={() => setShowCaptionConfirm(false)}
              >
                취소
              </Button>
              <Button onClick={handleApplyCaptions}>그래도 적용</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        <ProcessingModal
          open={showProcessingModal}
          batchProgress={batchProgress}
          onAbort={() => {
            if (batchAbortRef.current) {
              batchAbortRef.current.abort()
              addLog("warn", "사용자가 작업을 중단했습니다")
            }
          }}
        />
      </div>
    </div>
  )
}
