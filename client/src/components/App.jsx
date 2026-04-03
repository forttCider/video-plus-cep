import React, { useState, useEffect, useRef, useCallback } from "react"
import { RefreshCw } from "lucide-react"
import { Button } from "./ui/button"
import { Card, CardContent } from "./ui/card"
import AppHeader from "./AppHeader"
import UploadProgress from "./UploadProgress"
import BatchProgress from "./BatchProgress"
import LogPanel from "./LogPanel"
import CutEditControls from "./CutEditControls"
import SavedStateBanner from "./SavedStateBanner"
import SentenceList from "./SentenceList"
import ApplyButton from "./ApplyButton"
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
import { splitForSubtitles } from "../js/subtitleSplitter"
import {
  testConnection,
  getActiveSequenceInfo,
  onSequenceOpened,
  onSequenceClosed,
  registerSequenceChangeEvent,
  setPlayerPosition,
  setPlayerPositionByTicks,
  registerKeyEvents,
  setAllTracksLocked,
  getSequenceFramerate,
  getProjectDocumentID,
  cloneAndArchiveSequence,
  exportCaptionsAsSRT,
  hasCaptionsBin,
} from "../js/cep-bridge"
import useAudioUpload from "../hooks/useAudioUpload"
import useKeyboardNavigation from "../hooks/useKeyboardNavigation"
import useWordSelection from "../hooks/useWordSelection"
import useBatchEdit from "../hooks/useBatchEdit"
import useBackupRestore from "../hooks/useBackupRestore"
import usePlaybackTracking from "../hooks/usePlaybackTracking"
import useStatePersistence from "../hooks/useStatePersistence"
import initWords, { secondsToTicksAligned } from "../js/initWords"
import WaveformPanel from "./WaveformPanel"
import {
  getTimelinePositionTick,
  buildTimelineIndex,
  findCurrentWordFromIndex,
  getOriginalTimeFromTimeline,
  getTimelineTimeFromOriginal,
} from "../js/calculateTimeOffset"
import useSubtitleKeyboard from "../hooks/useSubtitleKeyboard"

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
  const [isProcessing, setIsProcessing] = useState(false)
  const [batchProgress, setBatchProgress] = useState(null)
  const [showHistory, setShowHistory] = useState(false)
  const [selectedWordIds, setSelectedWordIds] = useState(new Set())
  const [backupList, setBackupList] = useState([])
  const [restoreConfirm, setRestoreConfirm] = useState(null)
  const [focusedWord, setFocusedWordState] = useState(null)
  const focusedWordRef = useRef(null)
  const setFocusedWord = useCallback((value) => {
    focusedWordRef.current = value
    setFocusedWordState(value)
  }, [])
  const [audioPath, setAudioPath] = useState(null) // 파형 표시용 오디오 경로
  const [silenceSeconds, setSilenceSeconds] = useState("1")
  const [showProcessingModal, setShowProcessingModal] = useState(false)
  const [currentTime, setCurrentTime] = useState(0) // 현재 재생 위치 (초)
  const [isPlayingState, setIsPlayingState] = useState(false) // 재생 상태
  const [currentWordSentenceIdx, setCurrentWordSentenceIdx] = useState(null)
  const [logs, setLogs] = useState([])
  const [hasSavedState, setHasSavedState] = useState(false) // 저장 기록 존재 여부
  const [isInitializing, setIsInitializing] = useState(true) // 초기화 로딩 상태
  const [isRestoring, setIsRestoring] = useState(false) // 불러오기 로딩 상태
  const [activeTab, setActiveTab] = useState("cut") // "cut" | "subs"
  const [originalSpkList, setOriginalSpkList] = useState([]) // 원본 화자 목록
  const [subsMaxWords, setSubsMaxWordsState] = useState(4) // 자막 최대 단어 수
  const subsMaxWordsRef = useRef(4)
  const setSubsMaxWords = useCallback((val) => {
    subsMaxWordsRef.current = val
    setSubsMaxWordsState(val)
  }, [])
  const [editingWord, setEditingWordState] = useState(null) // { sentenceIdx, wordIdx }
  const editingWordRef = useRef(null)
  const setEditingWord = useCallback((value) => {
    editingWordRef.current = value
    setEditingWordState(value)
  }, [])
  const [showCaptionConfirm, setShowCaptionConfirm] = useState(false)
  const [subsSentences, setSubsSentences] = useState([]) // 자막편집 전용 sentences
  const subsSentencesRef = useRef([])
  const [peaks, setPeaks] = useState(null) // 파형 peaks 데이터
  const [peaksDuration, setPeaksDuration] = useState(null) // peaks 오디오 duration
  const logPanelRef = useRef(null)
  const batchAbortRef = useRef(null)
  const wordRefs = useRef({})
  const sentencesRef = useRef(sentences)
  const timelineIndexRef = useRef(null)
  const containerRef = useRef(null)
  const focusTrapRef = useRef(null)
  const currentTimeRef = useRef(0)
  const currentWordIdRef = useRef(null)
  const isPlayingStateRef = useRef(false)
  const wordSentenceIdxRef = useRef(new Map())
  const timebaseRef = useRef(8467200000n)
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

  // 상태 저장/복원 훅
  const { saveState, saveSubtitleData, loadState, checkSavedState, isSaving } =
    useStatePersistence({
      sequenceInfo,
      sentences,
      silenceSeconds,
      selectedWordIds,
      timebaseRef,
      addLog,
    })

  // 슬라이더 threshold (ms)
  const silenceThresholdMs = React.useMemo(
    () => Math.round((parseFloat(silenceSeconds) || 1) * 1000),
    [silenceSeconds],
  )

  // 숨겨진 무음 판별 헬퍼
  const isSilenceHidden = useCallback(
    (word) =>
      word.edit_points?.type === "silence" &&
      word.duration < silenceThresholdMs,
    [silenceThresholdMs],
  )

  useEffect(() => {
    sentencesRef.current = sentences
    if (sentences.length > 0) {
      timelineIndexRef.current = buildTimelineIndex(sentences)
      // wordSentenceIdx Map 갱신
      const map = new Map()
      sentences.forEach((s, sIdx) => {
        s.words?.forEach((w) => map.set(w.start_at, sIdx))
      })
      wordSentenceIdxRef.current = map
      setTimeout(() => focusTrapRef.current?.focus(), 100)

      // subsSentences 동기화: 아직 초기화 안 됐으면 splitForSubtitles로 초기화
      // 이미 있으면 is_deleted/text만 동기화
      if (subsSentencesRef.current.length === 0) {
        const subs = splitForSubtitles(sentences, subsMaxWords)
        setSubsSentences(subs)
        subsSentencesRef.current = subs
      } else {
        // word.id 기준으로 is_deleted 동기화 (원본 상태에 맞춤, text는 자막 편집에서 독립 관리)
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

  useEffect(() => {
    const onKey = (e) => handleKeyDown(e)
    window.addEventListener("keydown", onKey)
    window.addEventListener("keyup", onKey)
    return () => {
      window.removeEventListener("keydown", onKey)
      window.removeEventListener("keyup", onKey)
    }
  }, [focusedWord])

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
  })

  const navSentencesRef = activeTab === "subs" ? subsSentencesRef : sentencesRef
  const { handleKeyDown } = useKeyboardNavigation({
    sentencesRef: navSentencesRef,
    focusedWord,
    setFocusedWord,
    setSelectedWordIds,
    wordRefs,
    isSilenceHidden,
  })

  // 파형에서 단어 구간 드래그로 변경 시
  const handleWordTimeChange = (wordId, newStart, newEnd) => {
    setSentences((prev) => {
      return prev.map((sentence) => ({
        ...sentence,
        words: sentence.words?.map((word) => {
          const wId = String(word.id || word.start_at)
          if (wId === String(wordId)) {
            return {
              ...word,
              start_at: newStart,
              end_at: newEnd,
              // tick 값도 업데이트 (프레임 정렬됨)
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
      }))
    })
  }

  // 파형에서 클릭으로 재생 위치 이동 + 단어 포커스
  const handleWaveformSeek = async (time) => {
    // 원본 오디오 시간 → 타임라인 시간 변환
    const timelineTime = getTimelineTimeFromOriginal(time)
    await setPlayerPosition(timelineTime)

    // 해당 시간의 단어 찾아서 포커스 (타임라인 시간 기준)
    if (timelineIndexRef.current) {
      const found = findCurrentWordFromIndex(
        timelineIndexRef.current,
        timelineTime,
      )
      if (found?.word) {
        // sentenceIdx/wordIdx 찾기
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
        }
        setCurrentWordId(found.word.start_at)
      }
    }
  }

  const handleWordClick = (word) => {
    if (editingWord) setEditingWord(null)
    let sIdx = -1,
      wIdx = -1
    const searchSentences =
      activeTab === "subs" ? subsSentencesRef.current : sentencesRef.current
    searchSentences.forEach((s, si) => {
      s.words?.forEach((w, wi) => {
        if (w.start_at === word.start_at) {
          sIdx = si
          wIdx = wi
        }
      })
    })
    if (sIdx === -1) return
    setFocusedWord({ sentenceIdx: sIdx, wordIdx: wIdx })
    focusTrapRef.current?.focus()
    {
      const result = getTimelinePositionTick(word, sentencesRef.current)
      if (result?.startTick !== undefined) {
        setPlayerPositionByTicks(result.startTick.toString()).catch(() => {})
      }
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
      // 자막편집 탭: subsSentences에만 반영 (원본 sentences는 건드리지 않음)
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
        // 자막 편집 데이터 API 저장
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

  const handleChangeSpk = useCallback(
    (sentenceIdx, newSpk) => {
      if (activeTab === "subs") {
        setSubsSentences((prev) => {
          const next = [...prev]
          next[sentenceIdx] = { ...next[sentenceIdx], spk: newSpk }
          subsSentencesRef.current = next
          return next
        })
      } else {
        setSentences((prev) => {
          const next = [...prev]
          next[sentenceIdx] = { ...next[sentenceIdx], spk: newSpk }
          return next
        })
      }
    },
    [activeTab],
  )

  const {
    undo: subsUndo,
    redo: subsRedo,
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

  const [isRefreshing, setIsRefreshing] = useState(true)

  const loadSequenceInfo = async () => {
    setIsRefreshing(true)
    try {
      const [info] = await Promise.all([
        getActiveSequenceInfo(),
        new Promise((r) => setTimeout(r, 500)),
      ])
      if (info?.name) {
        setSequenceInfo(info)
        setStatus("연결됨")
        const docId = await getProjectDocumentID()
        addLog("info", `프로젝트 ID: ${docId}`)
        addLog("info", `시퀀스 ID: ${info.id}`)
        addLog("info", `시퀀스 이름: ${info.name}`)
        if (info.id) {
          const exists = await checkSavedState(info.id)
          setHasSavedState(exists)
        }
      } else {
        setSequenceInfo(null)
        setStatus("시퀀스를 열어주세요")
      }
    } catch (e) {
      setSequenceInfo(null)
      setStatus("시퀀스를 열어주세요")
    } finally {
      setIsRefreshing(false)
      setIsInitializing(false)
    }
  }

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
      setBackupList,
      setStatus,
      loadSequenceInfo,
    })

  const {
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

  const handleTranscribeFinish = async (taskId) => {
    if (!taskId) return
    setStatus("받아쓰기 결과 가져오는 중...")
    // console.log(taskId)
    try {
      const response = await fetch(
        `${API_URL}/transcribe/cut/${taskId}?silence_ms=500`,
      )
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
            is_deleted: false,

            parent_id: sentenceId,
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
              parent_id: sentenceId,
              is_edit: true,
              silence_seconds: word.edit_points.silence_seconds,

              is_deleted: false,
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
                parent_id: sentenceId,
                is_edit: true,
                silence_seconds: editPoint.silence_seconds,
                is_deleted: false,
              },
              ...newFormWord,
            ]
          : newFormWord
        return {
          ...sentence,
          id: sentenceId,
          is_deleted: false,
          isHighlight: false,
          words: newWords,
        }
      })
      setStatus("타임라인 정보 처리 중...")
      const framerateInfo = await getSequenceFramerate()
      if (framerateInfo.timebase) {
        timebaseRef.current = BigInt(framerateInfo.timebase)
      }
      const gapSentences = await initWords(newSentences)
      await setAllTracksLocked(true)
      setSentences(gapSentences)
      setStatus(`받아쓰기 완료: ${gapSentences.length}개 문장`)
      // 원본 화자 정보 저장
      gapSentences.forEach((s) => {
        s.original_spk = s.spk || 0
      })
      setOriginalSpkList(
        [...new Set(gapSentences.map((s) => s.spk || 0))].sort(),
      )
      setHasSavedState(false)
      // 받아쓰기 완료 후 상태 저장 (setState 비동기이므로 overrides로 직접 전달)
      sentencesRef.current = gapSentences
      const currentSeqInfo = await getActiveSequenceInfo()
      saveState({ sentences: gapSentences, sequenceId: currentSeqInfo?.id })
    } catch (e) {
      setStatus("결과 가져오기 실패: " + e.message)
    }
  }

  // 🔥 완전 초기화 함수
  const resetAllState = () => {
    setAudioPath(null)
    setSentences([])
    setCurrentWordId(null)
    setSelectedWordIds(new Set())
    setFocusedWord(null)
    setCurrentTime(0)
    setIsPlayingState(false)
    sentencesRef.current = []
    timelineIndexRef.current = null
  }

  const {
    uploadFile,
    onClickRenderAudio,
    onClickCancel,
    isUpload,
    audioPath: uploadedAudioPath,
  } = useAudioUpload({
    onFinish: handleTranscribeFinish,
    onClose: () => {
      setStatus("취소됨")
      resetAllState()
    },
    onStart: async () => {
      // 시퀀스 백업 + clone (새 sequenceID 부여)
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
      // 기존 데이터 초기화
      setHasSavedState(false)
      setSentences([])
      setCurrentWordId(null)
      setSelectedWordIds(new Set())
      setFocusedWord(null)
      setPeaks(null)
      setPeaksDuration(null)
      setAudioPath(null)
      sentencesRef.current = []
      timelineIndexRef.current = null
    },
    addLog,
  })

  // audioPath 동기화 (null도 처리)
  useEffect(() => {
    setAudioPath(uploadedAudioPath || null)
  }, [uploadedAudioPath])

  useEffect(() => {
    checkConnection()
    let lastCheckedSeqId = null
    const removeOpened = onSequenceOpened(async (name) => {
      setSequenceInfo({ name })
      setStatus("연결됨")
      // 저장 기록 확인 (같은 시퀀스 중복 확인 방지)
      try {
        const info = await getActiveSequenceInfo()
        if (info?.id) {
          setSequenceInfo(info)
          if (info.id !== lastCheckedSeqId) {
            lastCheckedSeqId = info.id
            const exists = await checkSavedState(info.id)
            setHasSavedState(exists)
          }
        }
      } catch (e) {
        // 무시
      }
    })
    const removeClosed = onSequenceClosed(() => {
      setSequenceInfo(null)
      setStatus("시퀀스를 열어주세요")
    })
    return () => {
      removeOpened()
      removeClosed()
    }
  }, [])

  // 개발용: taskId로 바로 결과 가져오기
  // useEffect(() => {
  //   const testTaskId = "799ae2af-1d7e-4d16-9aff-ec5f3309dc5a"
  //   if (testTaskId && isConnected && sentences.length === 0) {
  //     handleTranscribeFinish(testTaskId)
  //   }
  // }, [isConnected])

  const checkConnection = async () => {
    try {
      setStatus("ExtendScript 연결 중...")
      const result = await testConnection()
      if (result === "ExtendScript OK") {
        setIsConnected(true)
        registerKeyEvents()
        registerSequenceChangeEvent()
        loadSequenceInfo()
      } else {
        setError("연결 실패: " + result)
        setIsInitializing(false)
      }
    } catch (e) {
      setError("연결 오류: " + e.message)
      setIsInitializing(false)
    }
  }

  // 저장된 상태 불러오기 핸들러
  const handleLoadSavedState = async () => {
    try {
      setIsRestoring(true)
      setStatus("이전 편집 상태 불러오는 중...")
      const savedState = await loadState()
      if (savedState && savedState.sentences?.length > 0) {
        const framerateInfo = await getSequenceFramerate()
        if (framerateInfo.timebase) {
          timebaseRef.current = BigInt(framerateInfo.timebase)
        }
        const { restoreWords } = await import("../js/initWords")
        const gapSentences = restoreWords(savedState.sentences)
        setSentences(gapSentences)
        sentencesRef.current = gapSentences
        setSilenceSeconds(savedState.silenceSeconds || "1")
        setAudioPath(null) // peaks만으로 파형 표시
        // peaks 로드 (API waveform 데이터)
        if (savedState.waveform) {
          const waveformData = savedState.waveform
          setPeaks(waveformData.data || waveformData)
          setPeaksDuration(waveformData.duration || null)
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
        // 자막 편집 데이터 복원
        const subtitleData = savedState.subtitleData
        if (subtitleData) {
          setSubsSentences(subtitleData.sentences)
          subsSentencesRef.current = subtitleData.sentences
          setSubsMaxWords(subtitleData.maxWords || 4)
          addLog("info", "자막 편집 데이터 복원됨")
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
      onMouseDown={(e) => {
        if (
          e.target.tagName !== "INPUT" &&
          e.target.tagName !== "TEXTAREA" &&
          e.target.tagName !== "SELECT"
        ) {
          focusTrapRef.current?.focus()
        }
      }}
    >
      {/* CEP 키보드 포커스 홀더: input이 포커스돼야 Premiere Pro가 키보드를 패널에 넘겨줌 */}
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
      {/* 초기화 로딩 오버레이 */}
      {isInitializing && (
        <div className="fixed inset-0 bg-background z-50 flex flex-col items-center justify-center">
          <RefreshCw className="w-8 h-8 animate-spin text-muted-foreground mb-3" />
          <p className="text-sm text-muted-foreground">{status}</p>
        </div>
      )}

      <AppHeader
        activeTab={activeTab}
        onTabChange={setActiveTab}
        onOpenHistory={handleOpenHistory}
        onUndo={subsUndo}
        onRedo={subsRedo}
        canUndo={undoStackRef.current.length > 0}
        canRedo={redoStackRef.current.length > 0}
        sequenceInfo={sequenceInfo}
        isRefreshing={isRefreshing}
        onRefresh={loadSequenceInfo}
        status={status}
      />

      <LogPanel
        logs={logs}
        onCopy={copyLogs}
        onClear={clearLogs}
        logPanelRef={logPanelRef}
      />

      <UploadProgress
        isUpload={isUpload}
        uploadFile={uploadFile}
        onCancel={onClickCancel}
      />

      <BatchProgress batchProgress={batchProgress} />

      {/* 공통 영역: 받아쓰기 + 불러오기 */}
      {sentences.length === 0 && (
        <>
          <CutEditControls
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
          />

          <SavedStateBanner
            hasSavedState={hasSavedState}
            isUpload={isUpload}
            isRestoring={isRestoring}
            onLoad={handleLoadSavedState}
          />
        </>
      )}

      {/* 탭 내용: 컷편집 */}
      {sentences.length > 0 && activeTab === "cut" && (
        <>
          <CutEditControls
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
          />

          <SentenceList
            sentences={sentences}
            focusedWord={focusedWord}
            currentWordId={currentWordId}
            currentWordSentenceIdx={currentWordSentenceIdx}
            selectedWordIds={selectedWordIds}
            searchResultsSet={searchResultsSet}
            currentSearchWordId={currentSearchWordId}
            silenceThresholdMs={silenceThresholdMs}
            wordRefs={wordRefs}
            onWordClick={handleWordClick}
            onDeleteSentence={handleDeleteSentence}
            onSentencePlay={(sIdx, wIdx) =>
              setFocusedWord({ sentenceIdx: sIdx, wordIdx: wIdx })
            }
            isUpload={isUpload}
            onChangeSpk={handleChangeSpk}
            spkList={[...new Set(sentences.map((s) => s.spk || 0))].sort()}
          />

          <ApplyButton
            selectedWordIds={selectedWordIds}
            onApply={handleApplySelected}
            isProcessing={isProcessing}
            isConnected={isConnected}
            isUpload={isUpload}
          />
        </>
      )}

      {/* 탭 내용: 자막편집 */}
      {sentences.length > 0 && activeTab === "subs" && (
        <>
          <div className="rounded-lg border border-border bg-card/50 p-2 mb-2">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <span className="text-xs font-medium text-muted-foreground">
                  화자 {originalSpkList.length}명
                </span>
                {originalSpkList.map((fromSpk) => {
                  const spkColors = [
                    "#4caf50",
                    "#2196f3",
                    "#f44336",
                    "#ff9800",
                    "#9c27b0",
                    "#00bcd4",
                  ]
                  const color = spkColors[fromSpk] || spkColors[0]
                  return (
                    <div key={fromSpk} className="flex items-center gap-1.5">
                      <span
                        className="inline-block w-2.5 h-2.5 rounded-full"
                        style={{ background: color }}
                      />
                      <select
                        className="bg-transparent text-xs border border-border rounded px-1.5 py-0.5 outline-none cursor-pointer"
                        style={{ color }}
                        value={(() => {
                          const matched = sentences.find(
                            (s) => s.original_spk === fromSpk,
                          )
                          return matched ? matched.spk || 0 : fromSpk
                        })()}
                        onChange={(e) => {
                          const toSpk = parseInt(e.target.value, 10)
                          if (!isNaN(toSpk)) {
                            setSentences((prev) =>
                              prev.map((s) =>
                                s.original_spk === fromSpk
                                  ? { ...s, spk: toSpk }
                                  : s,
                              ),
                            )
                            setSubsSentences((prev) => {
                              const next = prev.map((s) =>
                                s.original_spk === fromSpk
                                  ? { ...s, spk: toSpk }
                                  : s,
                              )
                              subsSentencesRef.current = next
                              return next
                            })
                          }
                        }}
                      >
                        {originalSpkList.map((spk) => (
                          <option
                            key={spk}
                            value={spk}
                            style={{ background: "#1e1e1e", color: "#fff" }}
                          >
                            화자 {spk + 1}
                          </option>
                        ))}
                      </select>
                    </div>
                  )
                })}
              </div>
              <div
                className="flex items-center gap-2"
                style={{ minWidth: 120 }}
              >
                <span className="text-[11px] text-muted-foreground whitespace-nowrap">
                  {subsMaxWords}단어
                </span>
                <input
                  type="range"
                  min={2}
                  max={8}
                  value={subsMaxWords}
                  className="word-count-slider"
                  style={{ flex: 1 }}
                  onChange={(e) => {
                    setSubsMaxWords(parseInt(e.target.value, 10))
                  }}
                  onMouseUp={(e) => {
                    const val = parseInt(e.target.value, 10)
                    const subs = splitForSubtitles(sentences, val)
                    setSubsSentences(subs)
                    subsSentencesRef.current = subs
                  }}
                />
              </div>
            </div>
          </div>
          <SentenceList
            sentences={subsSentences}
            originalSentences={sentences}
            mode="subs"
            focusedWord={focusedWord}
            currentWordId={currentWordId}
            currentWordSentenceIdx={currentWordSentenceIdx}
            selectedWordIds={selectedWordIds}
            searchResultsSet={searchResultsSet}
            currentSearchWordId={currentSearchWordId}
            silenceThresholdMs={silenceThresholdMs}
            wordRefs={wordRefs}
            onWordClick={handleWordClick}
            onDeleteSentence={handleDeleteSentence}
            onSentencePlay={(sIdx, wIdx) =>
              setFocusedWord({ sentenceIdx: sIdx, wordIdx: wIdx })
            }
            isUpload={isUpload}
            onChangeSpk={handleChangeSpk}
            spkList={[...new Set(subsSentences.map((s) => s.spk || 0))].sort()}
            editingWord={editingWord}
            onStartEditing={handleStartEditing}
            onWordTextUpdate={handleWordTextUpdate}
            onWordEditingEnd={() => {
              setEditingWord(null)
            }}
          />
          <div className="flex justify-end mt-2">
            <Button
              size="sm"
              onClick={handleCaptionClick}
              disabled={!isConnected || subsSentences.length === 0}
            >
              시퀀스에 자막 적용
            </Button>
          </div>
        </>
      )}

      <BackupHistoryDialog
        open={showHistory}
        onClose={setShowHistory}
        backupList={backupList}
        onBackupClick={handleBackupClick}
      />

      <RestoreConfirmDialog
        restoreConfirm={restoreConfirm}
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

      {/* 하단 파형 패널 (컷편집만) */}
      {activeTab === "cut" && sentences.length > 0 && (
        <WaveformPanel
          key={`${audioPath || "no-audio"}-${peaks ? peaks.length : 0}`}
          audioPath={audioPath}
          peaks={peaks}
          peaksDuration={peaksDuration}
          sentences={sentences}
          currentWordId={currentWordId}
          currentTime={getOriginalTimeFromTimeline(currentTime)}
          focusedWord={focusedWord}
          onWordTimeChange={handleWordTimeChange}
          onSeek={handleWaveformSeek}
          isPlaying={isPlayingState}
          isUpload={isUpload}
          silenceThresholdMs={silenceThresholdMs}
        />
      )}
    </div>
  )
}
