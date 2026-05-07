/**
 * 오디오 업로드 훅 (받아쓰기용)
 * UXP videoPlus의 useAudioUpload.js 포팅
 */
import { useEffect, useState, useRef } from "react"
import { flushSync } from "react-dom"
import {
  renderAudioAndRead,
  cleanupAudioFile,
  getProjectDocumentID,
  getActiveSequenceInfo,
} from "../js/cep-bridge"

const API_URL =
  process.env.REACT_APP_VIDEO_API_URL || "https://vapi.cidermics.com"
const CHUNK_SIZE = 64 * 1024 * 1024 // 64MB

export default function useAudioUpload({
  onFinish,
  onClose,
  onStart,
  addLog,
  numSpeakersRef,
  selectedTrackIndicesRef,
}) {
  const [isUpload, setIsUpload] = useState(false)
  const [isCanceled, setIsCanceled] = useState(false)
  const [isError, setIsError] = useState(false)
  const [uploadFile, setUploadFile] = useState(null)
  const [audioPath, setAudioPathState] = useState(null) // 파형 표시용 오디오 경로
  const audioPathRef = useRef(null)
  const setAudioPath = (p) => {
    audioPathRef.current = p
    setAudioPathState(p)
  }
  const intervalRef = useRef(null)
  const isCanceledRef = useRef(false) // 🔥 클로저 문제 해결용
  const isErrorRef = useRef(false)
  const currentTaskIdRef = useRef(null) // 🔥 현재 진행 중인 taskId
  const abortControllerRef = useRef(null) // 🔥 fetch 취소용
  const isMultichannelRef = useRef(false) // 🔥 현재 업로드가 멀티채널 WAV인지

  // 렌더링 + 업로드 시작
  const onClickRenderAudio = async () => {
    // 🔥 이전 요청/폴링 정리
    if (abortControllerRef.current) {
      abortControllerRef.current.abort()
    }
    abortControllerRef.current = new AbortController() // 🔥 새 AbortController

    if (intervalRef.current) {
      clearInterval(intervalRef.current)
      intervalRef.current = null
    }
    currentTaskIdRef.current = null
    isCanceledRef.current = false
    isErrorRef.current = false

    // 🔥 새 상태로 한 번에 설정 (중간 상태 없이)
    const filename = "오디오1"
    flushSync(() => {
      setAudioPath(null)
      setIsError(false)
      setIsCanceled(false)
      setIsUpload(true)
      setUploadFile({
        name: filename,
        message: "오디오 파일 생성 중...",
        progress: 0,
        taskId: "",
      })
    })

    // 🔥 onStart 콜백 호출 (시퀀스 백업 + clone + 초기화)
    onStart && (await onStart())
    addLog && addLog("info", "오디오 렌더링 시작...")

    try {
      // 선택된 트랙 인덱스 (없으면 전체 렌더)
      const trackIndices = selectedTrackIndicesRef?.current
        ? Array.from(selectedTrackIndicesRef.current).sort((a, b) => a - b)
        : undefined
      if (trackIndices && trackIndices.length > 0) {
        addLog &&
          addLog("info", `선택된 오디오 트랙: [${trackIndices.join(", ")}]`)
      }

      // 오디오 렌더링 + ArrayBuffer 읽기
      const result = await renderAudioAndRead(
        (msg) => addLog && addLog("info", msg),
        { trackIndices },
      )

      const {
        arrayBuffer,
        audioPath: renderedAudioPath, // 표시용 (mono amix)
        uploadPath, // 실제 업로드된 파일 경로 (로그용)
        isMultichannel,
      } = result

      // 오디오 경로 저장 (파형 표시용 — gate 안 걸린 mono amix)
      setAudioPath(renderedAudioPath)

      // 업로드 엔드포인트 결정: 멀티채널 WAV면 /transcribe/multichannel, 아니면 /transcribe
      isMultichannelRef.current = !!isMultichannel

      // 업로드 대상 파일 로그 (실제 업로드되는 파일)
      const uploadFileName = uploadPath
        ? uploadPath.split(/[\\/]/).pop()
        : "(경로 없음)"
      addLog &&
        addLog(
          "info",
          `업로드 파일: ${uploadFileName} (엔드포인트: ${isMultichannel ? "/transcribe/multichannel" : "/transcribe"})`,
        )

      setUploadFile((prev) => ({
        ...prev,
        message: "자막 받아쓰는 중...",
        progress: 0,
      }))

      // 업로드 큐 등록
      await publishQueue(arrayBuffer, uploadFileName)
    } catch (error) {
      console.error("[useAudioUpload] 렌더링 오류:", error)
      addLog && addLog("error", "오디오 렌더링 실패: " + error.message)
      isErrorRef.current = true
      setIsError(true)
      setIsUpload(false)
      setUploadFile((prev) =>
        prev ? { ...prev, message: error.message } : null,
      )
    }
  }

  // 업로드 큐 등록
  const publishQueue = async (arrayBuffer, filename = "audio.wav") => {
    addLog && addLog("info", "받아쓰기 요청 중...")
    const queueUrl = `${API_URL}/transcribe/queue`
    const fileSizeMB = (arrayBuffer.byteLength / 1024 / 1024).toFixed(2)
    addLog && addLog("info", `요청 URL: ${queueUrl}`)
    addLog && addLog("info", `업로드 파일명: ${filename}`)
    addLog &&
      addLog(
        "info",
        `오디오 크기: ${fileSizeMB} MB (${arrayBuffer.byteLength} bytes)`,
      )
    addLog && addLog("info", `화자 수: ${numSpeakersRef?.current || 2}`)
    try {
      // 프로젝트/시퀀스 ID 가져오기 (청크 업로드 시 전달용)
      const documentID = await getProjectDocumentID()
      const seqInfo = await getActiveSequenceInfo()
      addLog &&
        addLog("info", `documentID: ${documentID}, sequenceID: ${seqInfo?.id}`)

      const requestBody = JSON.stringify({
        filename,
        file_size: arrayBuffer.byteLength,
        num_speakers: numSpeakersRef?.current || 2,
      })

      addLog && addLog("info", "fetch 호출 시작...")
      const fetchStart = Date.now()
      let response
      try {
        response = await fetch(queueUrl, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: requestBody,
        })
      } catch (fetchErr) {
        const elapsed = Date.now() - fetchStart
        addLog &&
          addLog(
            "error",
            `fetch 실패 (${elapsed}ms): ${fetchErr.name} - ${fetchErr.message}`,
          )
        addLog &&
          addLog("error", `에러 스택: ${fetchErr.stack || "(스택 없음)"}`)
        throw fetchErr
      }
      addLog &&
        addLog(
          "info",
          `fetch 응답: status=${response.status} (${Date.now() - fetchStart}ms)`,
        )

      if (!response.ok) {
        let errorDetail
        try {
          const error = await response.json()
          errorDetail = error.detail || JSON.stringify(error)
        } catch (e) {
          errorDetail = await response.text().catch(() => "(응답 본문 없음)")
        }
        addLog &&
          addLog("error", `서버 응답 오류 ${response.status}: ${errorDetail}`)
        isErrorRef.current = true
        setIsError(true)
        setIsUpload(false)
        setUploadFile((prev) =>
          prev ? { ...prev, message: errorDetail } : null,
        )
        return
      }

      const resData = await response.json()
      addLog &&
        addLog(
          "info",
          `task_id 발급: ${resData.task_id}, total_chunks: ${resData.total_chunks}`,
        )
      currentTaskIdRef.current = resData.task_id // 🔥 현재 taskId 저장
      setUploadFile((prev) =>
        prev ? { ...prev, taskId: resData.task_id } : null,
      )

      // 청크 업로드 시작
      uploadChunks(
        resData.total_chunks,
        arrayBuffer,
        resData.task_id,
        documentID,
        seqInfo?.id,
      )

      // 상태 폴링 시작
      startPolling(resData.task_id)
    } catch (error) {
      console.error("[useAudioUpload] 큐 등록 오류:", error)
      addLog &&
        addLog("error", `서버 연결 오류: ${error.name} - ${error.message}`)
      isErrorRef.current = true
      setIsError(true)
      setIsUpload(false)
      setUploadFile((prev) =>
        prev ? { ...prev, message: error.message } : null,
      )
    }
  }

  // 청크 업로드
  const uploadChunks = async (
    totalChunks,
    arrayBuffer,
    taskId,
    projectId,
    sequenceId,
  ) => {
    for (let i = 0; i < totalChunks; i++) {
      if (isCanceledRef.current || isErrorRef.current) break

      const start = i * CHUNK_SIZE
      const end = Math.min(start + CHUNK_SIZE, arrayBuffer.byteLength)
      const chunkBuffer = arrayBuffer.slice(start, end)
      const chunkBlob = new Blob([chunkBuffer], { type: "audio/wav" })

      const success = await uploadSingleChunk(
        i,
        chunkBlob,
        taskId,
        projectId,
        sequenceId,
      )
      if (!success) {
        clearInterval(intervalRef.current)
        break
      }
    }
  }

  // 단일 청크 업로드
  const uploadSingleChunk = async (
    chunkIndex,
    chunk,
    taskId,
    projectId,
    sequenceId,
  ) => {
    if (isCanceledRef.current || isErrorRef.current) return false

    try {
      const formData = new FormData()
      formData.append("task_id", taskId)
      formData.append("chunk_index", String(chunkIndex))
      formData.append("chunk", chunk, `chunk_${chunkIndex}.bin`)
      if (projectId) formData.append("project_id", projectId)
      if (sequenceId) formData.append("sequence_id", sequenceId)
      if (numSpeakersRef?.current)
        formData.append("spk_count", String(numSpeakersRef.current))
      addLog &&
        addLog(
          "info",
          `[청크 업로드] chunk_index=${chunkIndex}, spk_count=${numSpeakersRef?.current || "(없음)"}`,
        )

      const endpoint = isMultichannelRef.current
        ? `${API_URL}/transcribe/multichannel`
        : `${API_URL}/transcribe`
      const response = await fetch(endpoint, {
        method: "POST",
        body: formData,
        signal: abortControllerRef.current?.signal, // 🔥 취소 가능하게
      })

      if (!response.ok) {
        const error = await response.json()
        addLog &&
          addLog("error", "업로드 실패: " + (error.detail || response.status))
        isErrorRef.current = true
        setIsError(true)
        setIsUpload(false)
        setUploadFile((prev) =>
          prev ? { ...prev, message: error.detail } : null,
        )
        return false
      }

      return true
    } catch (error) {
      // 🔥 abort된 경우 무시
      if (error.name === "AbortError") {
        return false
      }
      console.error("[useAudioUpload] 청크 업로드 오류:", error)
      addLog && addLog("error", "업로드 오류: " + error.message)
      isErrorRef.current = true
      setIsError(true)
      setIsUpload(false)
      setUploadFile((prev) =>
        prev ? { ...prev, message: error.message } : null,
      )
      return false
    }
  }

  // 상태 조회
  const getStatus = async (taskId) => {
    // 🔥 현재 taskId와 다르면 무시 (이전 요청)
    if (taskId !== currentTaskIdRef.current) return

    try {
      const response = await fetch(`${API_URL}/transcribe/status/${taskId}`, {
        method: "GET",
        cache: "no-cache",
      })

      if (!response.ok) return

      // 🔥 다시 체크 (요청 중에 바뀔 수 있음)
      if (taskId !== currentTaskIdRef.current) return

      const data = await response.json()
      setUploadFile((prev) =>
        prev
          ? {
              ...prev,
              message: data.message,
              progress: data.progress,
            }
          : null,
      )

      if (data.status === "completed") {
        addLog && addLog("info", "받아쓰기 완료")
        clearInterval(intervalRef.current)
        localStorage.removeItem("canceledTaskId")
        // 🔥 onFinish 완료까지 isUpload 유지 (빈 화면 방지)
        if (onFinish) {
          await onFinish(taskId)
        }
        // 오디오 파일 정리
        cleanupAudioFile(audioPathRef.current)
        setIsUpload(false)
        setUploadFile(null)
      }
    } catch (error) {
      // 에러 무시
    }
  }

  // 폴링 시작
  const startPolling = (taskId) => {
    intervalRef.current = setInterval(() => getStatus(taskId), 10000)
    getStatus(taskId) // 즉시 한 번 호출
  }

  // 취소
  const onClickCancel = async () => {
    if (!uploadFile?.taskId) return

    try {
      await fetch(`${API_URL}/transcribe/${uploadFile.taskId}`, {
        method: "DELETE",
        keepalive: true,
      })
      // 🔥 진행 중인 fetch 중단
      if (abortControllerRef.current) {
        abortControllerRef.current.abort()
        abortControllerRef.current = null
      }
      isCanceledRef.current = true
      setIsCanceled(true)
      setIsUpload(false)
      setUploadFile(null)
      cleanupAudioFile(audioPathRef.current) // 오디오 파일 정리
      setAudioPath(null) // 🔥 파형 초기화
      clearInterval(intervalRef.current)
      currentTaskIdRef.current = null // 🔥 taskId 초기화
      localStorage.removeItem("canceledTaskId")
      onClose && onClose()
    } catch (error) {
      // 에러 무시
    }
  }

  // 정리
  useEffect(() => {
    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current)
      }
    }
  }, [])

  return {
    uploadFile,
    onClickRenderAudio,
    onClickCancel,
    isUpload,
    isError,
    isCanceled,
    audioPath,
  }
}
