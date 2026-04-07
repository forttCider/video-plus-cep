import { useState, useEffect, useCallback } from "react"
import {
  testConnection,
  getActiveSequenceInfo,
  onSequenceOpened,
  onSequenceClosed,
  registerSequenceChangeEvent,
  registerKeyEvents,
  getProjectDocumentID,
} from "../js/cep-bridge"

export default function useConnection({
  checkSavedState,
  setHasSavedState,
  setSequenceInfo,
  addLog,
}) {
  const [isConnected, setIsConnected] = useState(false)
  const [error, setError] = useState(null)
  const [isRefreshing, setIsRefreshing] = useState(true)
  const [isInitializing, setIsInitializing] = useState(true)
  const [status, setStatus] = useState("로딩 중...")

  const loadSequenceInfo = useCallback(async () => {
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
  }, [checkSavedState, setHasSavedState, setSequenceInfo, addLog])

  const checkConnection = useCallback(async () => {
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
  }, [loadSequenceInfo])

  useEffect(() => {
    checkConnection()
    let lastCheckedSeqId = null
    const removeOpened = onSequenceOpened(async (name) => {
      setSequenceInfo({ name })
      setStatus("연결됨")
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

  return {
    isConnected,
    error,
    setError,
    isRefreshing,
    isInitializing,
    status,
    setStatus,
    loadSequenceInfo,
    checkConnection,
  }
}
