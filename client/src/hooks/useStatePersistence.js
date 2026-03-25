/**
 * 플러그인 상태 저장/복원 훅
 * 받아쓰기 완료, 시퀀스 적용 후 API로 상태 저장
 * 시퀀스 열림 시 저장 기록 확인 및 복원
 */
import { useState, useRef, useCallback } from "react"
import { getProjectDocumentID } from "../js/cep-bridge"
import {
  prepareStateForSave,
  restoreStateFromData,
} from "../js/stateSerializer"

const API_URL =
  process.env.REACT_APP_VIDEO_API_URL || "https://vapi.cidermics.com"

// 디바운스: 5초 이내 재호출 무시
const DEBOUNCE_MS = 5000

export default function useStatePersistence({
  sequenceInfo,
  sentences,
  silenceSeconds,
  selectedWordIds,
  timebaseRef,
  addLog,
}) {
  const [isSaving, setIsSaving] = useState(false)
  const [isLoading, setIsLoading] = useState(false)
  const [lastSavedAt, setLastSavedAt] = useState(null)
  const lastSaveTimeRef = useRef(0)

  /**
   * 현재 상태를 API에 저장
   */
  const saveState = useCallback(
    async (overrides = {}) => {
      if (!sequenceInfo?.id) return

      // 디바운스 (overrides가 있는 명시적 저장은 항상 실행)
      const now = Date.now()
      const hasOverrides = Object.keys(overrides).length > 0
      if (!hasOverrides && now - lastSaveTimeRef.current < DEBOUNCE_MS) return

      try {
        setIsSaving(true)
        const documentID = await getProjectDocumentID()
        if (!documentID) {
          addLog("warn", "프로젝트 documentID를 가져올 수 없습니다")
          return
        }

        const stateData = prepareStateForSave(
          overrides.sentences ?? sentences,
          overrides.silenceSeconds ?? silenceSeconds,
          overrides.selectedWordIds ?? selectedWordIds,
          timebaseRef.current,
        )

        const payload = {
          project_id: documentID,
          sequence_id: overrides.sequenceId ?? sequenceInfo.id,
          ...stateData,
        }
        const response = await fetch(`${API_URL}/transcribe/cut-points`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        })

        if (!response.ok) {
          throw new Error(`저장 실패: ${response.status}`)
        }

        lastSaveTimeRef.current = now
        setLastSavedAt(new Date())
        addLog("info", "편집 상태 저장됨")
      } catch (e) {
        addLog("warn", "상태 저장 실패: " + e.message)
      } finally {
        setIsSaving(false)
      }
    },
    [
      sequenceInfo,
      sentences,
      silenceSeconds,
      selectedWordIds,
      timebaseRef,
      addLog,
    ],
  )

  /**
   * API에서 저장된 상태 불러오기
   * @param {string} sequenceId - 시퀀스 ID (선택, 없으면 sequenceInfo.id 사용)
   * @returns {Object|null} 복원된 상태 또는 null
   */
  const loadState = useCallback(
    async (sequenceId) => {
      const seqId = sequenceId || sequenceInfo?.id
      if (!seqId) return null

      try {
        setIsLoading(true)
        const documentID = await getProjectDocumentID()
        if (!documentID) return null

        const response = await fetch(
          `${API_URL}/transcribe/cut-points?project_id=${encodeURIComponent(documentID)}&sequence_id=${encodeURIComponent(seqId)}`,
        )

        if (response.status === 404) return null
        if (!response.ok) throw new Error(`불러오기 실패: ${response.status}`)

        const data = await response.json()
        const cutPoints = data.cut_points || data
        const audioPath = data.audio_filepath || null
        const waveform = data.waveform || null
        return { ...restoreStateFromData(cutPoints, audioPath), waveform }
      } catch (e) {
        addLog("warn", "상태 불러오기 실패: " + e.message)
        return null
      } finally {
        setIsLoading(false)
      }
    },
    [sequenceInfo, addLog],
  )

  /**
   * 저장 기록 존재 여부만 확인
   * @param {string} sequenceId
   * @returns {boolean}
   */
  const checkSavedState = useCallback(async (sequenceId) => {
    try {
      const documentID = await getProjectDocumentID()
      if (!documentID || !sequenceId) return false

      const response = await fetch(
        `${API_URL}/transcribe/cut-points/exists?project_id=${encodeURIComponent(documentID)}&sequence_id=${encodeURIComponent(sequenceId)}`,
      )

      if (!response.ok) return false
      const data = await response.json()
      return data?.data?.exists === true
    } catch {
      return false
    }
  }, [])

  return {
    saveState,
    loadState,
    checkSavedState,
    isSaving,
    isLoading,
    lastSavedAt,
  }
}
