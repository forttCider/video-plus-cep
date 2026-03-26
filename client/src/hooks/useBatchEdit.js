import {
  backupSequence,
  saveWordsData,
  setAllTracksLocked,
} from "../js/cep-bridge"
import {
  batchDeleteWords,
  applyDeleteResult,
} from "../js/batchEditWords"

export default function useBatchEdit({
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
}) {
  const handleApplySelected = async () => {
    if (isProcessing || selectedWordIds.size === 0) {
      setStatus("선택된 단어가 없습니다")
      return
    }
    setIsProcessing(true)
    setShowProcessingModal(true)
    setStatus("트랙 잠금 해제...")
    try {
      await setAllTracksLocked(false)

      setStatus("백업 중...")
      const backupResult = await backupSequence(formatBackupName())
      if (backupResult?.success)
        await saveWordsData(backupResult.backupId, sentencesRef.current)
      setStatus("일괄 적용 중...")
      setBatchProgress({
        current: 0,
        total: selectedWordIds.size,
        label: "일괄 적용",
      })

      const filterFn = (word) => {
        const wordId = word.id || word.start_at
        return (
          selectedWordIds.has(wordId) &&
          word.start_at_tick !== undefined &&
          word.end_at_tick !== undefined
        )
      }
      batchAbortRef.current = new AbortController()
      const { deletedWordIds: actuallyDeleted, wordGaps } =
        await batchDeleteWords(
          filterFn,
          sentencesRef.current,
          (current, total) =>
            setBatchProgress({ current, total, label: "일괄 적용" }),
          addLog,
          batchAbortRef.current.signal,
        )
      if (actuallyDeleted.size > 0) {
        const updated = applyDeleteResult(
          sentencesRef.current,
          actuallyDeleted,
          wordGaps,
        )
        sentencesRef.current = updated
        setSentences(updated)
        setSelectedWordIds(new Set())
        const aborted = batchAbortRef.current?.signal?.aborted
        setStatus(
          aborted
            ? `중단됨: ${actuallyDeleted.size}개 삭제 완료`
            : `일괄 적용 완료: ${actuallyDeleted.size}개 단어`,
        )
      } else setStatus("적용할 단어가 없습니다")
    } catch (error) {
      setStatus("일괄 적용 실패: " + error.message)
    } finally {
      await setAllTracksLocked(true)
      setIsProcessing(false)
      setBatchProgress(null)
      setShowProcessingModal(false)
      saveState({
        sentences: sentencesRef.current,
        selectedWordIds: new Set(),
      })
    }
  }

  const handleDeleteSentence = (sentence) => {
    const selectableWords = sentence.words.filter(
      (w) =>
        !w.isDeleted &&
        w.start_at_tick !== undefined &&
        w.end_at_tick !== undefined,
    )
    const selectableIds = selectableWords.map((w) => w.id || w.start_at)
    if (selectableIds.length === 0) {
      setStatus("선택할 단어가 없습니다")
      return
    }
    const allSelected = selectableIds.every((id) => selectedWordIds.has(id))
    setSelectedWordIds((prev) => {
      const newSet = new Set(prev)
      allSelected
        ? selectableIds.forEach((id) => newSet.delete(id))
        : selectableIds.forEach((id) => newSet.add(id))
      return newSet
    })
    setStatus(
      allSelected
        ? `${selectableIds.length}개 단어 선택 해제`
        : `${selectableIds.length}개 단어 선택됨`,
    )
  }

  return { handleApplySelected, handleDeleteSentence }
}
