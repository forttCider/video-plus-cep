import {
  backupSequence,
  saveWordsData,
  setAllTracksLocked,
} from "../js/cep-bridge"
import {
  batchDeleteWords,
  applyDeleteResult,
} from "../js/batchEditWords"

// 컷 지점 클릭 노이즈 제거용 크로스페이드 길이(초). 프레임 제약상 최소 1프레임으로 적용됨.
const CROSSFADE_SECONDS = 0.02

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
  loadedSequenceIdRef,
  sequenceInfo,
  crossfadeEnabledRef,
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
      const crossfadeSeconds = crossfadeEnabledRef?.current
        ? CROSSFADE_SECONDS
        : 0
      const { deletedWordIds: actuallyDeleted, wordGaps } =
        await batchDeleteWords(
          filterFn,
          sentencesRef.current,
          (current, total) =>
            setBatchProgress({ current, total, label: "일괄 적용" }),
          addLog,
          batchAbortRef.current.signal,
          crossfadeSeconds,
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
      // 컷편집 적용 도중/후 sequenceInfo가 바뀌었더라도 "현재 시퀀스가 로드된 시퀀스"로 간주 — 불필요한 SavedStateBanner 노출 방지
      if (loadedSequenceIdRef && sequenceInfo?.id) {
        loadedSequenceIdRef.current = sequenceInfo.id
      }
    }
  }

  const handleDeleteSentence = (sentence) => {
    const selectableWords = sentence.words.filter(
      (w) =>
        !w.is_deleted &&
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
