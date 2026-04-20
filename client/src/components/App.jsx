import React, { useState, useEffect, useRef, useCallback } from "react"
import { RefreshCw } from "lucide-react"
import { Button } from "./ui/button"
import { Card, CardContent } from "./ui/card"
import AppHeader from "./AppHeader"

import BatchProgress from "./BatchProgress"
import LogPanel from "./LogPanel"
import CutEditControls from "./CutEditControls"
import CutEditTab from "./CutEditTab"
import SubtitleEditTab from "./SubtitleEditTab"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "./ui/dialog"
import BackupHistoryDialog from "./BackupHistoryDialog"
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
import { setPlayerPosition } from "../js/cep-bridge"

function formatBackupName() {
  const now = new Date()
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")} ${String(now.getHours()).padStart(2, "0")}:${String(now.getMinutes()).padStart(2, "0")}:${String(now.getSeconds()).padStart(2, "0")}`
}

export default function App() {
  // === States ===
  const [sequenceInfo, setSequenceInfo] = useState(null)
  const [numSpeakers, setNumSpeakers] = useState(2)
  const numSpeakersRef = useRef(2)
  const [summary, setSummary] = useState(null)
  const [summaryLoading, setSummaryLoading] = useState(false)
  const [sentences, setSentences] = useState([])
  const [currentWordId, setCurrentWordId] = useState(null)
  const [searchResultsSet] = useState(new Set())
  const [currentSearchWordId] = useState(null)
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
  const [logs, setLogs] = useState([])
  const [hasSavedState, setHasSavedState] = useState(false)
  const [isRestoring, setIsRestoring] = useState(false)
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

  // === Refs ===
  const logPanelRef = useRef(null)
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
  const addLog = useCallback((level, message) => {
    setLogs((prev) => [...prev, { level, message, time: new Date() }])
    setTimeout(() => {
      logPanelRef.current?.scrollTo({ top: logPanelRef.current.scrollHeight })
    }, 50)
  }, [])
  const clearLogs = useCallback(() => setLogs([]), [])
  const copyLogs = useCallback(() => {
    const text = logs
      .map(
        (l) =>
          `[${l.time.toLocaleTimeString("ko-KR", { hour: "2-digit", minute: "2-digit", second: "2-digit" })}] ${l.message}`,
      )
      .join("\n")
    const textarea = document.createElement("textarea")
    textarea.value = text
    textarea.style.position = "fixed"
    textarea.style.opacity = "0"
    document.body.appendChild(textarea)
    textarea.select()
    document.execCommand("copy")
    document.body.removeChild(textarea)
    addLog("info", "로그가 클립보드에 복사되었습니다")
  }, [logs, addLog])

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
  })

  const { handleTranscribeFinish, resetAllState } = useTranscribe({
    setStatus,
    setSentences,
    sentencesRef,
    timebaseRef,
    setOriginalSpkList,
    setHasSavedState,
    saveState,
    setSummary,
    setSummaryLoading,
    numSpeakersRef,
    addLog,
    setAudioPath,
    setCurrentWordId,
    setSelectedWordIds,
    setFocusedWord,
    setCurrentTime,
    setIsPlayingState,
    timelineIndexRef,
  })

  const silenceThresholdMs = React.useMemo(
    () => Math.round((parseFloat(silenceSeconds) || 1) * 1000),
    [silenceSeconds],
  )

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
            if (orig.is_deleted !== w.is_deleted) {
              return { ...w, is_deleted: orig.is_deleted }
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

  const handleWaveformSeek = async (time) => {
    const timelineTime = getTimelineTimeFromOriginal(time)
    await setPlayerPosition(timelineTime)
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
      setPlayerPositionByTicks(result.startTick.toString())
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
      setHasSavedState(false)
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

  // === Load saved state ===
  const handleLoadSavedState = async () => {
    try {
      setIsRestoring(true)
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
          addLog("info", "요약본 복원됨")
        } else if (savedState.taskId) {
          setSummaryLoading(true)
          addLog(
            "info",
            `[불러오기] 요약본 API 요청 시작 (taskId: ${savedState.taskId}, spk_count: ${numSpeakersRef.current || 2})`,
          )
          fetch(
            `https://vapi.cidermics.com/transcribe/summary/${savedState.taskId}?spk_count=${numSpeakersRef.current || 2}`,
          )
            .then((res) => res.json())
            .then((data) => {
              addLog(
                "info",
                `[불러오기] 요약본 API 응답 수신 (data: ${data ? JSON.stringify(data).slice(0, 200) : "null"})`,
              )
              if (data) {
                setSummary(data)
                addLog("info", "요약본 불러오기 완료")
              }
            })
            .catch((e) =>
              addLog("warn", `[불러오기] 요약본 불러오기 실패: ${e.message}`),
            )
            .finally(() => setSummaryLoading(false))
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

      <AppHeader
        activeTab={activeTab}
        onTabChange={(tab) => {
          setFocusedWord(null)
          setActiveTab(tab)
        }}
        onOpenHistory={handleOpenHistory}
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
        onCopy={copyLogs}
        onClear={clearLogs}
        logPanelRef={logPanelRef}
      />
      <div className="flex flex-col flex-1 min-h-0">
        <div className="px-4">
          <BatchProgress batchProgress={batchProgress} />
        </div>

        {/* 다른 시퀀스의 저장된 상태가 있으면 배너 표시 */}
        {sentences.length > 0 &&
          sequenceInfo?.id &&
          sequenceInfo.id !== loadedSequenceIdRef.current &&
          !isRefreshing && (
            <div className="px-4 pt-2">
              <SavedStateBanner
                hasSavedState={hasSavedState}
                isUpload={isUpload}
                isRestoring={isRestoring}
                onLoad={handleLoadSavedState}
              />
            </div>
          )}

        {/* 받아쓰기 전 */}
        {sentences.length === 0 && (
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
            hasSavedState={hasSavedState}
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
            onTranscribe={onClickRenderAudio}
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
            focusedWord={activeTab === "cut" ? focusedWord : null}
            currentWordId={currentWordId}
            currentWordSentenceIdx={currentWordSentenceIdx}
            selectedWordIds={selectedWordIds}
            searchResultsSet={searchResultsSet}
            currentSearchWordId={currentSearchWordId}
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
            onWaveformSeek={handleWaveformSeek}
            spkNames={spkNames}
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
            searchResultsSet={searchResultsSet}
            currentSearchWordId={currentSearchWordId}
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
