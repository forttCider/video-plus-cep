/**
 * 오디오 업로드 훅 (받아쓰기용)
 * UXP videoPlus의 useAudioUpload.js 포팅
 */
import { useEffect, useState, useRef } from "react";
import { renderAudioAndRead } from "../js/cep-bridge";

const API_URL = process.env.REACT_APP_VIDEO_API_URL || "https://vapi.cidermics.com";
const CHUNK_SIZE = 64 * 1024 * 1024; // 64MB

export default function useAudioUpload({ onFinish, onClose }) {
  const [isUpload, setIsUpload] = useState(false);
  const [isCanceled, setIsCanceled] = useState(false);
  const [isError, setIsError] = useState(false);
  const [uploadFile, setUploadFile] = useState(null);
  const intervalRef = useRef(null);

  // 렌더링 + 업로드 시작
  const onClickRenderAudio = async () => {
    const filename = "오디오1";
    setIsUpload(true);
    setIsError(false);
    setIsCanceled(false);
    setUploadFile({
      name: filename,
      message: "오디오 파일 생성 중...",
      progress: 0,
      taskId: "",
    });

    try {
      // 오디오 렌더링 + ArrayBuffer 읽기
      const arrayBuffer = await renderAudioAndRead();
      
      setUploadFile((prev) => ({
        ...prev,
        message: "자막 받아쓰는 중...",
        progress: 0,
      }));

      // 업로드 큐 등록
      await publishQueue(arrayBuffer);
    } catch (error) {
      console.error("[useAudioUpload] 렌더링 오류:", error);
      setIsError(true);
      setIsUpload(false);
      setUploadFile((prev) => prev ? { ...prev, message: error.message } : null);
    }
  };

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
      });

      if (!response.ok) {
        const error = await response.json();
        setIsError(true);
        setIsUpload(false);
        setUploadFile((prev) => prev ? { ...prev, message: error.detail } : null);
        return;
      }

      const resData = await response.json();
      setUploadFile((prev) => prev ? { ...prev, taskId: resData.task_id } : null);

      // 청크 업로드 시작
      uploadChunks(resData.total_chunks, arrayBuffer, resData.task_id);
      
      // 상태 폴링 시작
      startPolling(resData.task_id);
    } catch (error) {
      console.error("[useAudioUpload] 큐 등록 오류:", error);
      setIsError(true);
      setIsUpload(false);
      setUploadFile((prev) => prev ? { ...prev, message: error.message } : null);
    }
  };

  // 청크 업로드
  const uploadChunks = async (totalChunks, arrayBuffer, taskId) => {
    for (let i = 0; i < totalChunks; i++) {
      if (isCanceled || isError) break;

      const start = i * CHUNK_SIZE;
      const end = Math.min(start + CHUNK_SIZE, arrayBuffer.byteLength);
      const chunkBuffer = arrayBuffer.slice(start, end);
      const chunkBlob = new Blob([chunkBuffer], { type: "audio/wav" });

      const success = await uploadSingleChunk(i, chunkBlob, taskId);
      if (!success) {
        clearInterval(intervalRef.current);
        break;
      }
    }
  };

  // 단일 청크 업로드
  const uploadSingleChunk = async (chunkIndex, chunk, taskId) => {
    if (isCanceled || isError) return false;

    try {
      const formData = new FormData();
      formData.append("task_id", taskId);
      formData.append("chunk_index", String(chunkIndex));
      formData.append("chunk", chunk, `chunk_${chunkIndex}.bin`);

      const response = await fetch(`${API_URL}/transcribe`, {
        method: "POST",
        body: formData,
      });

      if (!response.ok) {
        const error = await response.json();
        setIsError(true);
        setIsUpload(false);
        setUploadFile((prev) => prev ? { ...prev, message: error.detail } : null);
        return false;
      }

      return true;
    } catch (error) {
      console.error("[useAudioUpload] 청크 업로드 오류:", error);
      setIsError(true);
      setIsUpload(false);
      setUploadFile((prev) => prev ? { ...prev, message: error.message } : null);
      return false;
    }
  };

  // 상태 조회
  const getStatus = async (taskId) => {
    try {
      const response = await fetch(`${API_URL}/transcribe/status/${taskId}`, {
        method: "GET",
        cache: "no-cache",
      });

      if (!response.ok) return;

      const data = await response.json();
      setUploadFile((prev) => prev ? {
        ...prev,
        message: data.message,
        progress: data.progress,
      } : null);

      if (data.status === "completed") {
        clearInterval(intervalRef.current);
        localStorage.removeItem("canceledTaskId");
        setIsUpload(false);  // 업로드 완료 상태로 변경
        setUploadFile(null); // 업로드 UI 숨기기
        onFinish && onFinish(taskId);
      }
    } catch (error) {
      // 에러 무시
    }
  };

  // 폴링 시작
  const startPolling = (taskId) => {
    intervalRef.current = setInterval(() => getStatus(taskId), 10000);
    getStatus(taskId); // 즉시 한 번 호출
  };

  // 취소
  const onClickCancel = async () => {
    if (!uploadFile?.taskId) return;

    try {
      await fetch(`${API_URL}/transcribe/${uploadFile.taskId}`, {
        method: "DELETE",
        keepalive: true,
      });
      setIsCanceled(true);
      clearInterval(intervalRef.current);
      localStorage.removeItem("canceledTaskId");
      onClose && onClose();
    } catch (error) {
      // 에러 무시
    }
  };

  // 정리
  useEffect(() => {
    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
      }
    };
  }, []);

  return {
    uploadFile,
    onClickRenderAudio,
    onClickCancel,
    isUpload,
    isError,
    isCanceled,
  };
}
