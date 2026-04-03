import {
  getBackupList,
  restoreFromBackup,
  loadWordsData,
  setAllTracksLocked,
  getProjectDocumentID,
} from "../js/cep-bridge"
import { prepareStateForSave } from "../js/stateSerializer"

const API_URL =
  process.env.REACT_APP_VIDEO_API_URL || "https://vapi.cidermics.com"

export default function useBackupRestore({
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
}) {
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
      await setAllTracksLocked(true)
      setStatus(`복원 완료: ${result.restoredName}`)
      loadSequenceInfo()
      const wordsResult = await loadWordsData(backupId, result.newSequenceId)
      if (wordsResult?.success) {
        const deletedWordSet = new Set(wordsResult.deletedWords || [])
        const deletedSentenceSet = new Set(wordsResult.deletedSentences || [])
        const updatedSentences = sentencesRef.current.map((sentence) => ({
          ...sentence,
          is_deleted: deletedSentenceSet.has(sentence.id),
          words: sentence.words?.map((word) => ({
            ...word,
            is_deleted: deletedWordSet.has(word.id),
          })),
        }))
        sentencesRef.current = updatedSentences
        setSentences(updatedSentences)
      }
      // 백그라운드: 복원 매핑 API 호출
      if (result.oldSequenceId && result.newSequenceId) {
        const documentID = await getProjectDocumentID()
        const cutPoints = prepareStateForSave(
          sentencesRef.current,
          silenceSeconds,
          selectedWordIds,
          timebaseRef.current,
        )
        fetch(`${API_URL}/transcribe/cut-points/copy`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            project_id: documentID,
            sequence_id: result.newSequenceId,
            prev_sequence_id: result.oldSequenceId,
            cut_points: cutPoints,
          }),
        })
          .then((res) => res.json())
          .then((data) => console.log("[복원 매핑] 응답:", data))
          .catch((e) => console.warn("[복원 매핑] 실패:", e.message))
      }
    } else setStatus(`복원 실패: ${result?.error || "알 수 없는 오류"}`)
  }

  return { handleOpenHistory, handleBackupClick, handleRestoreConfirm }
}
