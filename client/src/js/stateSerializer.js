/**
 * 플러그인 상태 직렬화/역직렬화 유틸리티
 * BigInt 필드를 제거하여 JSON.stringify 가능하게 만듦
 * 복원 시 initWords()로 BigInt 필드 재생성
 */

import { normalizeFillerText } from "./batchEditWords"

// initWords()에서 생성되는 BigInt 필드 목록
const BIGINT_WORD_FIELDS = [
  "start_at_tick",
  "end_at_tick",
  "first_gap_tick",
  "second_gap_tick",
  "first_clip_out_point_tick",
  "second_clip_in_point_tick",
  "gap_after_tick",
]

/**
 * 저장용 상태 객체 생성 (JSON-safe)
 * audioPath는 S3에서 관리하므로 저장하지 않음
 */
export function prepareStateForSave(
  sentences,
  silenceSeconds,
  selectedWordIds,
  timebase,
  speakers,
  fillerSettings,
) {
  // sentences에서 BigInt 필드를 Number(String)로 변환하여 JSON-safe하게 저장
  const cleanSentences = sentences.map((sentence) => ({
    ...sentence,
    words: sentence.words?.map((word) => {
      const cleanWord = { ...word }
      for (const field of BIGINT_WORD_FIELDS) {
        if (cleanWord[field] != null) {
          cleanWord[field] = String(cleanWord[field])
        }
      }
      return cleanWord
    }),
  }))

  return {
    sentences: cleanSentences,
    silence_seconds: silenceSeconds,
    selected_word_ids: Array.from(selectedWordIds),
    timebase: timebase ? String(timebase) : null,
    speaker: speakers || {},
    // 간투사 설정: 사용자가 추가한 단어 + 일괄선택 제외 목록(사용자 의도만 저장)
    filler: {
      added_words: Array.from(fillerSettings?.addedWords || []),
      disabled_texts: Array.from(fillerSettings?.disabledTexts || []),
      disabled_speakers: Array.from(fillerSettings?.disabledSpeakers || []),
    },
    saved_at: new Date().toISOString(),
  }
}

/**
 * API 응답 데이터를 React state용 객체로 변환
 * audioPath는 API 응답에 포함되어 있으면 사용 (S3 URL)
 */
export function restoreStateFromData(data, audioPath) {
  return {
    sentences: data.sentences || [],
    silenceSeconds: data.silence_seconds || "1",
    audioPath: audioPath || null,
    selectedWordIds: new Set(data.selected_word_ids || []),
    timebase: data.timebase ? BigInt(data.timebase) : null,
    speakers: data.speaker || data.speakers || {},
    // 저장된 간투사 설정이 있을 때만 반환. 없으면 null → 복원을 건너뛰고
    // 간투사 리스트는 순수하게 단어(edit_points.type)에서만 파생된다.
    // 텍스트 키는 정규화(끝 구두점 제거) — 예전에 "음." 원문으로 저장된 데이터도 매칭되게.
    fillerSettings: data.filler
      ? {
          addedWords: new Set(
            (data.filler.added_words || []).map(normalizeFillerText),
          ),
          disabledTexts: new Set(
            (data.filler.disabled_texts || []).map(normalizeFillerText),
          ),
          disabledSpeakers: new Set(data.filler.disabled_speakers || []),
        }
      : null,
  }
}

/**
 * 자막 편집 데이터를 JSON-safe 객체로 변환 (저장용)
 */
export function prepareSubtitleDataForSave(subsSentences, maxWords, speakers) {
  const cleanSentences = subsSentences.map((sentence) => ({
    ...sentence,
    words: sentence.words?.map((word) => {
      const cleanWord = { ...word }
      for (const field of BIGINT_WORD_FIELDS) {
        if (cleanWord[field] != null) {
          cleanWord[field] = String(cleanWord[field])
        }
      }
      return cleanWord
    }),
  }))

  return {
    max_words: maxWords,
    speakers,
    sentences: cleanSentences,
  }
}

/**
 * 저장된 자막 데이터를 복원 (BigInt 필드 복원)
 */
export function restoreSubtitleData(subtitleData) {
  if (!subtitleData?.sentences) return null

  const sentences = subtitleData.sentences.map((sentence) => ({
    ...sentence,
    words: sentence.words?.map((word) => {
      const restored = { ...word }
      for (const field of BIGINT_WORD_FIELDS) {
        if (restored[field] != null) {
          restored[field] = BigInt(restored[field])
        }
      }
      return restored
    }),
  }))

  return {
    maxWords: subtitleData.max_words || 4,
    speakers: subtitleData.speakers || null,
    sentences,
  }
}
