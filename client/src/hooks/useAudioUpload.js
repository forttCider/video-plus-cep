/**
 * 오디오 업로드 훅 (받아쓰기용)
 * UXP videoPlus의 useAudioUpload.js 포팅
 */
import { useEffect, useState, useRef } from "react"
import { flushSync } from "react-dom"
import { renderAudioAndRead } from "../js/cep-bridge"

const API_URL =
  process.env.REACT_APP_VIDEO_API_URL || "https://vapi.cidermics.com"
const CHUNK_SIZE = 64 * 1024 * 1024 // 64MB

export default function useAudioUpload({ onFinish, onClose, onStart }) {
  const [isUpload, setIsUpload] = useState(false)
  const [isCanceled, setIsCanceled] = useState(false)
  const [isError, setIsError] = useState(false)
  const [uploadFile, setUploadFile] = useState(null)
  const [audioPath, setAudioPath] = useState(null) // 파형 표시용 오디오 경로
  const intervalRef = useRef(null)
  const isCanceledRef = useRef(false) // 🔥 클로저 문제 해결용
  const isErrorRef = useRef(false)
  const currentTaskIdRef = useRef(null) // 🔥 현재 진행 중인 taskId
  const abortControllerRef = useRef(null) // 🔥 fetch 취소용

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

    // 🔥 onStart 콜백 호출 (sentences 초기화 등)
    onStart && onStart()

    try {
      // 오디오 렌더링 + ArrayBuffer 읽기
      const result = await renderAudioAndRead()

      const { arrayBuffer, audioPath: renderedAudioPath } = result

      // 오디오 경로 저장 (파형 표시용)
      setAudioPath(renderedAudioPath)

      setUploadFile((prev) => ({
        ...prev,
        message: "자막 받아쓰는 중...",
        progress: 0,
      }))

      // 업로드 큐 등록
      await publishQueue(arrayBuffer)
    } catch (error) {
      console.error("[useAudioUpload] 렌더링 오류:", error)
      isErrorRef.current = true
      setIsError(true)
      setIsUpload(false)
      setUploadFile((prev) =>
        prev ? { ...prev, message: error.message } : null,
      )
    }
  }

  // 업로드 큐 등록
  const publishQueue = async (arrayBuffer) => {
    try {
      const response = await fetch(`${API_URL}/transcribe/queue`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          filename: "audio.wav",
          file_size: arrayBuffer.byteLength,
        }),
      })

      if (!response.ok) {
        const error = await response.json()
        isErrorRef.current = true
        setIsError(true)
        setIsUpload(false)
        setUploadFile((prev) =>
          prev ? { ...prev, message: error.detail } : null,
        )
        return
      }

      const resData = await response.json()
      currentTaskIdRef.current = resData.task_id // 🔥 현재 taskId 저장
      setUploadFile((prev) =>
        prev ? { ...prev, taskId: resData.task_id } : null,
      )

      // 청크 업로드 시작
      uploadChunks(resData.total_chunks, arrayBuffer, resData.task_id)

      // 상태 폴링 시작
      startPolling(resData.task_id)
    } catch (error) {
      console.error("[useAudioUpload] 큐 등록 오류:", error)
      isErrorRef.current = true
      setIsError(true)
      setIsUpload(false)
      setUploadFile((prev) =>
        prev ? { ...prev, message: error.message } : null,
      )
    }
  }

  // 청크 업로드
  const uploadChunks = async (totalChunks, arrayBuffer, taskId) => {
    for (let i = 0; i < totalChunks; i++) {
      if (isCanceledRef.current || isErrorRef.current) break

      const start = i * CHUNK_SIZE
      const end = Math.min(start + CHUNK_SIZE, arrayBuffer.byteLength)
      const chunkBuffer = arrayBuffer.slice(start, end)
      const chunkBlob = new Blob([chunkBuffer], { type: "audio/wav" })

      const success = await uploadSingleChunk(i, chunkBlob, taskId)
      if (!success) {
        clearInterval(intervalRef.current)
        break
      }
    }
  }

  // 단일 청크 업로드
  const uploadSingleChunk = async (chunkIndex, chunk, taskId) => {
    if (isCanceledRef.current || isErrorRef.current) return false

    try {
      const formData = new FormData()
      formData.append("task_id", taskId)
      formData.append("chunk_index", String(chunkIndex))
      formData.append("chunk", chunk, `chunk_${chunkIndex}.bin`)

      const response = await fetch(`${API_URL}/transcribe`, {
        method: "POST",
        body: formData,
        signal: abortControllerRef.current?.signal, // 🔥 취소 가능하게
      })

      if (!response.ok) {
        const error = await response.json()
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
        clearInterval(intervalRef.current)
        localStorage.removeItem("canceledTaskId")
        // 🔥 onFinish 완료까지 isUpload 유지 (빈 화면 방지)
        if (onFinish) {
          await onFinish(taskId)
        }
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
