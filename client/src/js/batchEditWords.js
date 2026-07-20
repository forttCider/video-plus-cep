/**
 * batchEditWords - 무음/간투사 일괄 삭제 (CEP 버전)
 */
import { deleteWordByTimelineTicks } from "./cep-bridge"
import { getTimelinePositionTick } from "./calculateTimeOffset"

// 간투사 타입 상수 (interjection만)
export const FILLER_TYPES = ["interjection"]

/**
 * 간투사 그룹핑 키 정규화.
 * STT가 문장 위치에 따라 붙이는 끝 구두점(마침표·쉼표 등)을 제거해
 * "음"·"음."·"음," 를 같은 간투사로 취급한다. (앞·중간 구두점은 유지)
 * @param {string} text
 * @returns {string}
 */
export function normalizeFillerText(text) {
  return (text || "").trim().replace(/[\s.,!?。、！？…·]+$/, "")
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

    // prev와 curr 사이에 "실제 타임라인 클립인 잔존 단어"가 있는지 확인
    const hasActiveWordBetween = sortedAll.some((w) => {
      const wId = w.id || w.start_at
      if (selectedIds.has(wId)) return false
      if (w.is_deleted) return false
      // 편집 마커(무음 등 is_edit) — 타임라인에 클립 없음 → 그룹 분리 사유 아님
      if (w.is_edit) return false
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
 * 그룹 내 각 단어의 gap_after_tick 계산
 *   - 그룹 내 다음 단어와의 raw gap 에서 "이미 is_deleted된 단어"가 차지하는 시간을 빼야
 *     (이전 삭제에서 이미 offset에 누적된 부분이 중복 카운트되지 않음)
 * @param {Array<Array>} groups - 그룹 배열
 * @param {Array} allWords - 전체 단어 (이미 삭제된 단어 정보 조회용)
 * @returns {Map<any, BigInt>} wordId → gap_after_tick
 */
function calculateGroupGaps(groups, allWords) {
  const wordGaps = new Map()

  for (const group of groups) {
    for (let i = 0; i < group.length; i++) {
      const word = group[i]
      const wordId = word.id || word.start_at

      if (i < group.length - 1) {
        const nextWord = group[i + 1]
        const rawGap =
          BigInt(nextWord.start_at_tick || 0) - BigInt(word.end_at_tick || 0)

        // word.end ~ nextWord.start 사이의 이미 is_deleted된 단어들 길이 합산
        let alreadyDeletedTick = 0n
        const wEnd = BigInt(word.end_at_tick || 0)
        const nStart = BigInt(nextWord.start_at_tick || 0)
        for (const other of allWords) {
          if (!other.is_deleted) continue
          const oStart = BigInt(other.start_at_tick || 0)
          const oEnd = BigInt(other.end_at_tick || 0)
          // 완전히 word와 nextWord 사이에 들어가는 already-deleted만
          if (oStart >= wEnd && oEnd <= nStart) {
            const oGap = BigInt(other.gap_after_tick || 0)
            alreadyDeletedTick += oEnd - oStart + oGap
          }
        }

        const gap = rawGap - alreadyDeletedTick
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
export async function batchDeleteWords(filterFn, sentences, onProgress, addLog, signal) {
  // 1. 전체 단어에서 조건에 맞는 단어 필터링
  const allWords = sentences.flatMap((s) =>
    s.words
      .filter(filterFn)
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
  // [DIAG] 그룹 결과 출력 — 어떤 단어가 어느 그룹에 묶이는지 확인
  addLog &&
    addLog(
      "info",
      `[그룹] ${groups.length}개 그룹: ${groups.map((g, gi) => `[${gi}] "${g[0].text || ""}"~"${g[g.length - 1].text || ""}" (${g.length}개)`).join(" / ")}`,
    )

  // 3-1. 그룹 내 gap 계산 (이미-삭제된 단어 시간 제외)
  const wordGaps = calculateGroupGaps(groups, allWordsFromSentences)

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
    // 취소 시그널 확인
    if (signal?.aborted) {
      addLog && addLog("warn", `⚠️ 사용자 중단: ${deletedWords.length}개 삭제 완료`)
      break
    }

    const group = reversedGroups[i]

    // 그룹의 시작과 끝 (연속된 단어들의 전체 범위)
    // 그룹 내부는 시간순, 그룹들만 역순으로 처리
    const groupStart = group[0] // 시간상 첫 번째 단어
    const groupEnd = group[group.length - 1] // 시간상 마지막 단어

    // 타임라인 시작/끝 각각 계산
    //   - groupStart의 timeline 시작점
    //   - groupEnd의 timeline 시작점 + groupEnd의 원본 duration
    //   그룹 사이에 이미 삭제된 단어가 있어도 razor 범위가 실제 timeline 길이와 일치
    const { startTick: timelineStartTick } = getTimelinePositionTick(
      groupStart,
      currentSentences,
    )
    const { startTick: groupEndTimelineStartTick } = getTimelinePositionTick(
      groupEnd,
      currentSentences,
    )
    const groupEndDuration =
      BigInt(groupEnd.end_at_tick || 0) - BigInt(groupEnd.start_at_tick || 0)
    const timelineEndTick = groupEndTimelineStartTick + groupEndDuration

    // [DIAG] razor 범위 출력
    const TICKS_PER_SEC = 254016000000n
    const tStartSec = Number(timelineStartTick) / Number(TICKS_PER_SEC)
    const tEndSec = Number(timelineEndTick) / Number(TICKS_PER_SEC)
    addLog &&
      addLog(
        "info",
        `[razor] "${groupStart.text || ""}"~"${groupEnd.text || ""}" timeline ${tStartSec.toFixed(3)}s~${tEndSec.toFixed(3)}s (orig ${(groupStart.start_at / 1000).toFixed(3)}~${(groupEnd.end_at / 1000).toFixed(3)}s)`,
      )

    try {
      // razor + delete
      const result = await deleteWordByTimelineTicks(
        timelineStartTick.toString(),
        timelineEndTick.toString(),
      )

      if (result?.success) {
        deletedWords.push(...group)
        for (const w of group) {
          addLog && addLog("info", `✅ 삭제: "${w.text || ""}" (${w.start_at.toFixed(2)}s)`)
        }

        // 로컬 복사본 업데이트
        const groupIds = new Set(group.map((w) => w.id || w.start_at))
        currentSentences = currentSentences.map((s) => ({
          ...s,
          words: s.words.map((w) =>
            groupIds.has(w.id || w.start_at) ? { ...w, is_deleted: true } : w
          ),
        }))
      } else {
        for (const w of group) {
          addLog && addLog("error", `❌ 실패: "${w.text || ""}" (${w.start_at.toFixed(2)}s) - ${result?.error || "클립 없음"}`)
        }
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
 * @param {Map|null} wordGaps - wordId → gap_after_tick (BigInt)
 */
export function applyDeleteResult(sentences, deletedWordIds, wordGaps = null) {
  return sentences.map((s) => {
    const updatedWords = s.words.map((w) => {
      const wordId = w.id || w.start_at
      if (!deletedWordIds.has(wordId)) return w

      const updates = { ...w, is_deleted: true }
      if (wordGaps && wordGaps.has(wordId)) {
        updates.gap_after_tick = wordGaps.get(wordId)
      }
      return updates
    })
    const allDeleted = updatedWords.every((w) => w.is_deleted)
    return {
      ...s,
      is_deleted: allDeleted ? true : s.is_deleted,
      words: updatedWords,
    }
  })
}
