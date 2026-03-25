/**
 * 플러그인 상태 직렬화/역직렬화 유틸리티
 * BigInt 필드를 제거하여 JSON.stringify 가능하게 만듦
 * 복원 시 initWords()로 BigInt 필드 재생성
 */

// initWords()에서 생성되는 BigInt 필드 목록
const BIGINT_WORD_FIELDS = [
  "start_at_tick",
  "end_at_tick",
  "firstGapTick",
  "secondGapTick",
  "firstClipOutPointTick",
  "secondClipInPointTick",
  "gapAfterTick",
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
    silenceSeconds,
    selectedWordIds: Array.from(selectedWordIds),
    timebase: timebase ? String(timebase) : null,
    savedAt: new Date().toISOString(),
  }
}

/**
 * API 응답 데이터를 React state용 객체로 변환
 * audioPath는 API 응답에 포함되어 있으면 사용 (S3 URL)
 */
export function restoreStateFromData(data, audioPath) {
  return {
    sentences: data.sentences || [],
    silenceSeconds: data.silenceSeconds || "1",
    audioPath: audioPath || null,
    selectedWordIds: new Set(data.selectedWordIds || []),
    timebase: data.timebase ? BigInt(data.timebase) : null,
  }
}
