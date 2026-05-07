import { useCallback } from "react"
import {
  getActiveSequenceInfo,
  getSequenceFramerate,
  setAllTracksLocked,
} from "../js/cep-bridge"
import initWords from "../js/initWords"

const API_URL =
  process.env.REACT_APP_VIDEO_API_URL || "https://vapi.cidermics.com"

function generateRandomId() {
  return Math.random().toString(36).substring(2, 15)
}

export default function useTranscribe({
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
}) {
  const fetchSummary = useCallback(
    async (taskId) => {
      if (!taskId) return
      setSummaryTaskId(taskId)
      setSummaryError(false)
      setSummary(null)
      setSummaryLoading(true)
      addLog(
        "info",
        `요약본 API 요청 시작 (taskId: ${taskId}, spk_count: ${numSpeakersRef?.current || 2})`,
      )
      try {
        const res = await fetch(
          `${API_URL}/transcribe/summary/${taskId}?spk_count=${numSpeakersRef?.current || 2}`,
        )
        if (!res.ok) throw new Error(`HTTP ${res.status}`)
        const data = await res.json()
        const segments = data?.data?.segments || data?.segments
        if (!segments || segments.length === 0) {
          throw new Error("요약 결과 없음")
        }
        setSummary(data)
        addLog("info", "요약본 불러오기 완료")
      } catch (e) {
        addLog("warn", `요약본 불러오기 실패: ${e.message}`)
        setSummaryError(true)
      } finally {
        setSummaryLoading(false)
      }
    },
    [
      setSummary,
      setSummaryLoading,
      setSummaryError,
      setSummaryTaskId,
      numSpeakersRef,
      addLog,
    ],
  )

  const handleTranscribeFinish = useCallback(
    async (taskId) => {
      if (!taskId) return
      setStatus("받아쓰기 결과 가져오는 중...")
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
              // STT 원본 시간 (드래그 후 ↺ 리셋 기준점, 절대 변경 안 함)
              original_start_at: word.start_at,
              original_end_at: word.end_at,
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
                original_start_at: word.edit_points.start_ms,
                original_end_at: word.edit_points.end_ms,
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
                  edit_points: {
                    type: editPoint.type,
                    reason: editPoint.reason,
                  },
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
                  original_start_at: editPoint.start_ms,
                  original_end_at: editPoint.end_ms,
                },
                ...newFormWord,
              ]
            : newFormWord
          return {
            ...sentence,
            id: sentenceId,
            is_deleted: false,
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
        gapSentences.forEach((s) => {
          s.original_spk = s.spk || 0
        })
        setOriginalSpkList(
          [...new Set(gapSentences.map((s) => s.spk || 0))].sort(),
        )
        setHasSavedState(false)
        sentencesRef.current = gapSentences
        const currentSeqInfo = await getActiveSequenceInfo()
        addLog("info", "편집 상태 저장 시작...")
        await saveState({
          sentences: gapSentences,
          sequenceId: currentSeqInfo?.id,
        })
        addLog("info", "편집 상태 저장 완료")

        // 요약본 불러오기 (백그라운드)
        fetchSummary(taskId)
      } catch (e) {
        setStatus("결과 가져오기 실패: " + e.message)
      }
    },
    [
      setStatus,
      setSentences,
      sentencesRef,
      timebaseRef,
      setOriginalSpkList,
      setHasSavedState,
      saveState,
      fetchSummary,
      addLog,
    ],
  )

  const resetAllState = useCallback(() => {
    setAudioPath(null)
    setSentences([])
    setCurrentWordId(null)
    setSelectedWordIds(new Set())
    setFocusedWord(null)
    setCurrentTime(0)
    setIsPlayingState(false)
    sentencesRef.current = []
    timelineIndexRef.current = null
  }, [
    setAudioPath,
    setSentences,
    setCurrentWordId,
    setSelectedWordIds,
    setFocusedWord,
    setCurrentTime,
    setIsPlayingState,
    sentencesRef,
    timelineIndexRef,
  ])

  return { handleTranscribeFinish, resetAllState, fetchSummary }
}
