import React from "react"
import { FILLER_TYPES } from "../js/batchEditWords"

export default function useWordSelection({
  sentences,
  selectedWordIds,
  setSelectedWordIds,
  silenceThresholdMs,
  setStatus,
}) {
  const silenceWordIds = React.useMemo(() => {
    const ids = new Set()
    sentences.forEach((sentence) => {
      sentence.words?.forEach((word) => {
        if (
          !word.isDeleted &&
          word.edit_points?.type === "silence" &&
          word.duration >= silenceThresholdMs &&
          word.start_at_tick !== undefined &&
          word.end_at_tick !== undefined
        ) {
          ids.add(word.id || word.start_at)
        }
      })
    })
    return ids
  }, [sentences, silenceThresholdMs])

  const fillerWordIds = React.useMemo(() => {
    const ids = new Set()
    sentences.forEach((sentence) => {
      sentence.words?.forEach((word) => {
        if (
          !word.isDeleted &&
          FILLER_TYPES.includes(word.edit_points?.type) &&
          word.start_at_tick !== undefined &&
          word.end_at_tick !== undefined
        ) {
          ids.add(word.id || word.start_at)
        }
      })
    })
    return ids
  }, [sentences])

  const allSilenceSelected =
    silenceWordIds.size > 0 &&
    [...silenceWordIds].every((id) => selectedWordIds.has(id))
  const allFillerSelected =
    fillerWordIds.size > 0 &&
    [...fillerWordIds].every((id) => selectedWordIds.has(id))

  const handleSelectSilence = () => {
    if (silenceWordIds.size === 0) {
      setStatus("선택할 무음이 없습니다")
      return
    }
    setSelectedWordIds((prev) => {
      const next = new Set(prev)
      if (allSilenceSelected) {
        silenceWordIds.forEach((id) => next.delete(id))
        setStatus(`무음 ${silenceWordIds.size}개 선택 해제`)
      } else {
        silenceWordIds.forEach((id) => next.add(id))
        setStatus(`무음 ${silenceWordIds.size}개 선택`)
      }
      return next
    })
  }

  const handleSelectFiller = () => {
    if (fillerWordIds.size === 0) {
      setStatus("선택할 간투사가 없습니다")
      return
    }
    setSelectedWordIds((prev) => {
      const next = new Set(prev)
      if (allFillerSelected) {
        fillerWordIds.forEach((id) => next.delete(id))
        setStatus(`간투사 ${fillerWordIds.size}개 선택 해제`)
      } else {
        fillerWordIds.forEach((id) => next.add(id))
        setStatus(`간투사 ${fillerWordIds.size}개 선택`)
      }
      return next
    })
  }

  return {
    silenceWordIds,
    fillerWordIds,
    allSilenceSelected,
    allFillerSelected,
    handleSelectSilence,
    handleSelectFiller,
  }
}
