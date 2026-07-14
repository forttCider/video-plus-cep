import React from "react"
import { FILLER_TYPES } from "../js/batchEditWords"

export default function useWordSelection({
  sentences,
  selectedWordIds,
  setSelectedWordIds,
  silenceThresholdMs,
  setStatus,
  spkNames = {},
}) {
  // 간투사 일괄 선택 필터 (세션 유지 · 새 받아쓰기 시 초기화)
  //   - disabledFillerTexts: 체크 해제된 간투사 텍스트 → 일괄 선택에서 제외
  //   - disabledFillerSpeakers: 체크 해제된 화자(spk) → 일괄 선택에서 제외
  //   - 비어 있으면 전부 활성(기존 동작과 동일)
  const [disabledFillerTexts, setDisabledFillerTexts] = React.useState(
    () => new Set(),
  )
  const [disabledFillerSpeakers, setDisabledFillerSpeakers] = React.useState(
    () => new Set(),
  )

  // 받아쓰기 전(문장 없음)으로 돌아오면 필터 초기화 → 다음 영상엔 깨끗한 상태
  const isEmpty = sentences.length === 0
  React.useEffect(() => {
    if (isEmpty) {
      setDisabledFillerTexts(new Set())
      setDisabledFillerSpeakers(new Set())
    }
  }, [isEmpty])

  const silenceWordIds = React.useMemo(() => {
    const ids = new Set()
    sentences.forEach((sentence) => {
      sentence.words?.forEach((word) => {
        if (
          !word.is_deleted &&
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

  // 다이얼로그 렌더용: 간투사 텍스트/화자 목록
  //   - 이미 삭제(is_deleted)된 간투사도 목록에는 유지 → 삭제 후 항목이 사라져 보이지 않게
  //   - 비대칭 집계:
  //       · 텍스트 count = 현재 선택된 화자 기준 (화자 토글 시 실시간 반영, 0이면 선택 불가)
  //       · 화자 count = 그 화자의 고유 간투사 총량 (텍스트 필터와 무관 → 화자가 통째로
  //         비활성화되어 "선택할 게 없어" 보이는 문제 방지)
  //   - deleted: 전부 삭제됨 / unavailable: 남아는 있으나 화자 필터로 지금은 선택 불가(텍스트만)
  const { fillerTextOptions, fillerSpeakerOptions } = React.useMemo(() => {
    const textStats = new Map() // text -> { remaining, active(선택된 화자 기준) }
    const spkStats = new Map() // spk -> { remaining, total }
    // 모든 화자를 미리 시드 → 화자 관리에서 추가만 하고 아직 간투사가 없는 화자도 목록에 표시
    const seedSpk = (spk) => {
      if (!spkStats.has(spk)) spkStats.set(spk, { remaining: 0, total: 0 })
    }
    Object.keys(spkNames || {}).forEach((k) => seedSpk(Number(k)))
    sentences.forEach((sentence) => {
      const spk = sentence.spk || 0
      seedSpk(spk)
      const spkEnabled = !disabledFillerSpeakers.has(spk)
      sentence.words?.forEach((word) => {
        if (
          FILLER_TYPES.includes(word.edit_points?.type) &&
          word.start_at_tick !== undefined &&
          word.end_at_tick !== undefined
        ) {
          const alive = !word.is_deleted
          const text = (word.text || "").trim()
          if (text) {
            const t = textStats.get(text) || { remaining: 0, active: 0 }
            if (alive) t.remaining += 1
            if (alive && spkEnabled) t.active += 1
            textStats.set(text, t)
          }
          const s = spkStats.get(spk)
          s.total += 1
          if (alive) s.remaining += 1
        }
      })
    })
    const textOpts = [...textStats.entries()]
      .map(([text, { remaining, active }]) => ({
        text,
        count: active,
        deleted: remaining === 0,
        unavailable: remaining > 0 && active === 0,
      }))
      .sort((a, b) => b.count - a.count || a.text.localeCompare(b.text))
    const spkOpts = [...spkStats.entries()]
      .map(([spk, { remaining, total }]) => ({
        spk,
        count: remaining,
        // 간투사가 "있었는데" 전부 삭제된 경우만 삭제됨. 추가만 된 화자(total 0)는 count 0으로 정상 표시
        deleted: total > 0 && remaining === 0,
        unavailable: false,
      }))
      .sort((a, b) => a.spk - b.spk)
    return { fillerTextOptions: textOpts, fillerSpeakerOptions: spkOpts }
  }, [sentences, disabledFillerSpeakers, spkNames])

  const fillerWordIds = React.useMemo(() => {
    const ids = new Set()
    sentences.forEach((sentence) => {
      const spk = sentence.spk || 0
      if (disabledFillerSpeakers.has(spk)) return
      sentence.words?.forEach((word) => {
        if (
          !word.is_deleted &&
          FILLER_TYPES.includes(word.edit_points?.type) &&
          word.start_at_tick !== undefined &&
          word.end_at_tick !== undefined &&
          !disabledFillerTexts.has((word.text || "").trim())
        ) {
          ids.add(word.id || word.start_at)
        }
      })
    })
    return ids
  }, [sentences, disabledFillerTexts, disabledFillerSpeakers])

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

  // === 필터 토글 핸들러 ===
  const toggleFillerText = (text) => {
    setDisabledFillerTexts((prev) => {
      const next = new Set(prev)
      if (next.has(text)) next.delete(text)
      else next.add(text)
      return next
    })
  }

  const toggleFillerSpeaker = (spk) => {
    setDisabledFillerSpeakers((prev) => {
      const next = new Set(prev)
      if (next.has(spk)) next.delete(spk)
      else next.add(spk)
      return next
    })
  }

  // enabled=true → 전체 선택(disabled 비우기), false → 전체 해제(선택 가능한 항목 모두 disabled)
  // 선택 불가 항목(deleted·unavailable)은 대상에서 제외
  const setAllFillerTexts = (enabled) => {
    setDisabledFillerTexts(
      enabled
        ? new Set()
        : new Set(
            fillerTextOptions
              .filter((o) => !o.deleted && !o.unavailable)
              .map((o) => o.text),
          ),
    )
  }

  const setAllFillerSpeakers = (enabled) => {
    setDisabledFillerSpeakers(
      enabled
        ? new Set()
        : new Set(
            fillerSpeakerOptions
              .filter((o) => !o.deleted && !o.unavailable)
              .map((o) => o.spk),
          ),
    )
  }

  return {
    silenceWordIds,
    fillerWordIds,
    allSilenceSelected,
    allFillerSelected,
    handleSelectSilence,
    handleSelectFiller,
    // 간투사 필터
    fillerTextOptions,
    fillerSpeakerOptions,
    disabledFillerTexts,
    disabledFillerSpeakers,
    toggleFillerText,
    toggleFillerSpeaker,
    setAllFillerTexts,
    setAllFillerSpeakers,
  }
}
