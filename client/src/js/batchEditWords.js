/**
 * batchEditWords - 무음/간투사 일괄 삭제 (CEP 버전)
 */
import { deleteWordByTimelineTicks } from "./cep-bridge"
import { getTimelinePositionTick } from "./calculateTimeOffset"

// 간투사 타입 상수 (interjection만)
export const FILLER_TYPES = ["interjection"]

/**
 * 단어가 다른 단어들과 시간상 겹치는지 확인
 * @param {Object} word - 확인할 단어
 * @param {Array} allWords - 모든 단어 배열 (삭제 안 된 것들)
 * @returns {boolean} - 겹치면 true
 */
function isOverlapping(word, allWords) {
  const wordStart = word.start_at
  const wordEnd = word.end_at

  for (const other of allWords) {
    // 자기 자신은 스킵
    if ((other.id || other.start_at) === (word.id || word.start_at)) continue
    // 이미 삭제된 단어는 스킵
    if (other.isDeleted) continue

    const otherStart = other.start_at
    const otherEnd = other.end_at

    // 겹침 체크: 두 구간이 겹치는지
    // (A.start < B.end) && (A.end > B.start)
    if (wordStart < otherEnd && wordEnd > otherStart) {
      // 완전히 같은 구간이 아니고, 부분적으로 겹치면 true
      if (!(wordStart === otherStart && wordEnd === otherEnd)) {
        return true
      }
    }
  }
  return false
}

/**
 * 인접 기반 그룹핑: 선택된 단어 사이에 비삭제/비선택 단어가 없으면 같은 그룹
 * @param {Array} selectedWords - 선택된 단어 (시간순 정렬됨)
 * @param {Array} allWords - 전체 단어 목록
 */
function groupConsecutiveWords(selectedWords, allWords) {
  if (selectedWords.length === 0) return []

  const selectedIds = new Set(selectedWords.map((w) => w.id || w.start_at))
  const sortedAll = [...allWords].sort((a, b) => a.start_at - b.start_at)
  const sortedSelected = [...selectedWords].sort(
    (a, b) => a.start_at - b.start_at,
  )

  const groups = []
  let currentGroup = [sortedSelected[0]]

  for (let i = 1; i < sortedSelected.length; i++) {
    const prev = sortedSelected[i - 1]
    const curr = sortedSelected[i]

    // prev와 curr 사이에 비삭제/비선택 단어가 있는지 확인
    const hasActiveWordBetween = sortedAll.some((w) => {
      const wId = w.id || w.start_at
      if (selectedIds.has(wId)) return false
      if (w.isDeleted) return false
      // prev.end_at ~ curr.start_at 사이에 있는 단어
      return w.start_at >= prev.end_at && w.end_at <= curr.start_at
    })

    if (hasActiveWordBetween) {
      groups.push(currentGroup)
      currentGroup = [curr]
    } else {
      currentGroup.push(curr)
    }
  }

  if (currentGroup.length > 0) {
    groups.push(currentGroup)
  }

  return groups
}

/**
 * 그룹 내 각 단어의 gapAfterTick 계산
 * (다음 단어 start_at_tick - 현재 단어 end_at_tick)
 * @param {Array<Array>} groups - 그룹 배열
 * @returns {Map<any, BigInt>} wordId → gapAfterTick
 */
function calculateGroupGaps(groups) {
  const wordGaps = new Map()

  for (const group of groups) {
    for (let i = 0; i < group.length; i++) {
      const word = group[i]
      const wordId = word.id || word.start_at

      if (i < group.length - 1) {
        const nextWord = group[i + 1]
        const gap =
          BigInt(nextWord.start_at_tick || 0) - BigInt(word.end_at_tick || 0)
        wordGaps.set(wordId, gap > 0n ? gap : 0n)
      } else {
        wordGaps.set(wordId, 0n)
      }
    }
  }

  return wordGaps
}

/**
 * 조건에 맞는 단어들을 일괄 삭제
 * @param {Function} filterFn - 필터 조건 함수
 * @param {Array} sentences - 현재 sentences 상태
 * @param {Function} onProgress - 진행률 콜백 (current, total)
 * @returns {Promise<{deletedWordIds: Set, success: boolean}>}
 */
export async function batchDeleteWords(filterFn, sentences, onProgress) {
  // 0. 전체 단어 목록 (겹침 체크용)
  const allWordsFlat = sentences.flatMap((s) =>
    s.words.map((w) => ({ ...w, sentenceStartAt: s.start_at })),
  )

  // 1. 전체 단어에서 조건에 맞는 단어 필터링 + 겹침 체크
  const allWords = sentences.flatMap((s) =>
    s.words
      .filter((w) => {
        if (!filterFn(w)) return false
        // 겹침 체크 - 겹치면 스킵
        if (isOverlapping(w, allWordsFlat)) {
          return false
        }
        return true
      })
      .map((w) => ({ ...w, sentenceStartAt: s.start_at })),
  )

  if (allWords.length === 0) {
    return { deletedWordIds: new Set(), success: true }
  }

  // 2. 시간순 정렬 (앞에서부터)
  const sortedWords = [...allWords].sort((a, b) => a.start_at - b.start_at)

  // 3. 인접 기반으로 연속된 단어들을 그룹으로 묶기
  const allWordsFromSentences = sentences.flatMap((s) => s.words)
  const groups = groupConsecutiveWords(sortedWords, allWordsFromSentences)

  // 3-1. 그룹 내 gap 계산
  const wordGaps = calculateGroupGaps(groups)

  // 4. 그룹을 역순으로 (뒤에서부터 삭제해야 앞 위치 안 바뀜)
  const reversedGroups = [...groups].reverse()

  // 5. 로컬 상태 복사본
  let currentSentences = sentences.map((s) => ({
    ...s,
    words: s.words.map((w) => ({ ...w })),
  }))

  // 6. 그룹 단위로 삭제 실행
  const deletedWords = []
  let processedCount = 0

  for (let i = 0; i < reversedGroups.length; i++) {
    const group = reversedGroups[i]

    // 그룹의 시작과 끝 (연속된 단어들의 전체 범위)
    // 그룹 내부는 시간순, 그룹들만 역순으로 처리
    const groupStart = group[0] // 시간상 첫 번째 단어
    const groupEnd = group[group.length - 1] // 시간상 마지막 단어

    // 타임라인 위치 계산 (삭제된 단어들의 오프셋 적용)
    const { startTick: timelineStartTick } = getTimelinePositionTick(
      groupStart,
      currentSentences,
    )

    // 그룹 전체 duration
    const groupDuration =
      BigInt(groupEnd.end_at_tick || 0) - BigInt(groupStart.start_at_tick || 0)
    const timelineEndTick = timelineStartTick + groupDuration

    try {
      // razor + delete
      const result = await deleteWordByTimelineTicks(
        timelineStartTick.toString(),
        timelineEndTick.toString(),
      )

      if (result?.success) {
        deletedWords.push(...group)

        // 로컬 복사본 업데이트
        const groupIds = new Set(group.map((w) => w.id || w.start_at))
        currentSentences = currentSentences.map((s) => ({
          ...s,
          words: s.words.map((w) =>
            groupIds.has(w.id || w.start_at) ? { ...w, isDeleted: true } : w
          ),
        }))
      }

      processedCount += group.length
      if (onProgress) {
        onProgress(processedCount, allWords.length)
      }
    } catch (error) {
      console.error(`[batchDelete] 그룹 삭제 실패:`, error)
      processedCount += group.length
      continue
    }
  }

  return {
    deletedWordIds: new Set(deletedWords.map((w) => w.id || w.start_at)),
    wordGaps,
    success: true,
  }
}

/**
 * 삭제 결과를 sentences 상태에 적용
 * @param {Array} sentences
 * @param {Set} deletedWordIds
 * @param {Map|null} wordGaps - wordId → gapAfterTick (BigInt)
 */
export function applyDeleteResult(sentences, deletedWordIds, wordGaps = null) {
  return sentences.map((s) => {
    const updatedWords = s.words.map((w) => {
      const wordId = w.id || w.start_at
      if (!deletedWordIds.has(wordId)) return w

      const updates = { ...w, isDeleted: true }
      if (wordGaps && wordGaps.has(wordId)) {
        updates.gapAfterTick = wordGaps.get(wordId)
      }
      return updates
    })
    const allDeleted = updatedWords.every((w) => w.isDeleted)
    return {
      ...s,
      isDeleted: allDeleted ? true : s.isDeleted,
      words: updatedWords,
    }
  })
}
