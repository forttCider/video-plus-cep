/**
 * calculateTimeOffset - 타임라인 오프셋 계산 (tick 기반으로 통일)
 */

const TICKS_PER_SECOND = 254016000000;
const TICKS_PER_SECOND_BIGINT = 254016000000n;

// ========== 삭제 구간 캐시 (매 렌더링마다 재계산 방지) ==========
let deletedIntervalsCache = null;
let deletedIntervalsCacheKey = null;

// ========== 성능 최적화: 프리컴퓨팅 + 이진 탐색 ==========

/**
 * 타임라인 인덱스 생성 (sentences 변경 시 한 번만 호출) - tick 기반 (BigInt)
 */
export function buildTimelineIndex(sentences) {
  if (!sentences || sentences.length === 0) {
    deletedIntervalsCache = null;
    deletedIntervalsCacheKey = null;
    return { entries: [], deletedIntervals: [] };
  }

  const words = sentences.flatMap((item) => item.words);

  // 시간순 정렬 (tick 기준)
  const sortedWords = [...words].sort((a, b) => {
    const aStart = BigInt(a.start_at_tick || 0);
    const bStart = BigInt(b.start_at_tick || 0);
    if (aStart < bStart) return -1;
    if (aStart > bStart) return 1;
    return 0;
  });

  // 문장 Map (O(1) 조회)
  const sentenceMap = new Map(sentences.map((s) => [s.id, s]));

  // 오프셋 프리컴퓨팅 (BigInt로 정밀도 유지) + 삭제되지 않은 단어만 수집
  const entries = [];
  const deletedIntervals = []; // 🔥 삭제 구간도 저장
  let accumulatedOffsetTick = 0n;

  for (const word of sortedWords) {
    if (word.is_deleted) {
      const startTick = BigInt(word.start_at_tick || 0);
      const endTick = BigInt(word.end_at_tick || 0);
      const gapTick = BigInt(word.gap_after_tick || 0);
      const durationTick = endTick - startTick + gapTick;

      // 삭제 구간 저장 (연속/겹치는 구간 병합 — gap 포함)
      // 새 word가 lastInterval 내부에 완전히 포함되거나 끝점이 lastInterval보다
      // 작은 경우에도 interval이 줄어들지 않도록 max로 확장
      const lastInterval = deletedIntervals[deletedIntervals.length - 1];
      const newEnd = endTick + gapTick;
      if (lastInterval && lastInterval.endTick >= startTick) {
        if (newEnd > lastInterval.endTick) {
          lastInterval.endTick = newEnd;
          lastInterval.durationTick = lastInterval.endTick - lastInterval.startTick;
        }
        // newEnd <= lastInterval.endTick: 새 word가 기존 interval 안에 포함 → 확장 불필요
      } else {
        deletedIntervals.push({
          startTick,
          endTick: newEnd,
          durationTick,
        });
      }

      accumulatedOffsetTick += durationTick;
      continue;
    }

    const startTick = BigInt(word.start_at_tick || 0);
    const endTick = BigInt(word.end_at_tick || 0);

    // 초 단위로 변환 (하이라이트 계산용)
    entries.push({
      adjustedStart: Number(startTick - accumulatedOffsetTick) / TICKS_PER_SECOND,
      adjustedEnd: Number(endTick - accumulatedOffsetTick) / TICKS_PER_SECOND,
      word,
      sentence: sentenceMap.get(word.parent_id),
    });
  }

  // 디버그: 오프셋 계산 결과


  // 캐시 업데이트
  deletedIntervalsCache = deletedIntervals;
  deletedIntervalsCacheKey = sentences.length;

  return { entries, deletedIntervals };
}

/**
 * 이진 탐색으로 현재 재생 위치에 해당하는 단어 찾기 - O(log n)
 */
export function findCurrentWordFromIndex(index, currentTimeSec) {
  if (!index || !index.entries || index.entries.length === 0) return null;

  const { entries } = index;

  let low = 0;
  let high = entries.length - 1;

  while (low <= high) {
    const mid = (low + high) >>> 1;
    const entry = entries[mid];

    if (currentTimeSec < entry.adjustedStart) {
      high = mid - 1;
    } else if (currentTimeSec >= entry.adjustedEnd) {
      low = mid + 1;
    } else {
      return { sentence: entry.sentence, word: entry.word };
    }
  }

  return null;
}

/**
 * 단어 클릭 시 타임라인 위치 계산 (앞에 삭제된 단어들의 오프셋 적용)
 */
export function getTimelinePosition(targetWord, sentences) {
  let accumulatedOffset = 0;

  const words = sentences.flatMap((item) => item.words);

  // 시간순 정렬 (start_at_sec 기준)
  const sortedWords = [...words].sort((a, b) => {
    const aStart = a.start_at_sec || 0;
    const bStart = b.start_at_sec || 0;
    return aStart - bStart;
  });

  const targetStartSec = targetWord.start_at_sec;

  for (let i = 0; i < sortedWords.length; i++) {
    const word = sortedWords[i];

    // 대상 단어에 도달하면 중단
    if (word.start_at_sec >= targetStartSec) {
      const timelineStart = targetStartSec - accumulatedOffset;
      return {
        start: timelineStart,
        prevEnd: timelineStart,
        originStart: targetStartSec,
      };
    }

    if (word.is_deleted) {
      const wordDuration = word.end_at_sec - word.start_at_sec;
      const gapSec = Number(BigInt(word.gap_after_tick || 0)) / TICKS_PER_SECOND;
      accumulatedOffset += wordDuration + gapSec;
    }
  }

  return { start: targetWord.start_at_sec, prevEnd: targetWord.start_at_sec };
}

/**
 * Tick 기반 타임라인 위치 계산 (BigInt)
 * 겹치는 deleted 구간을 중복 카운트하지 않도록 interval union으로 누적
 */
export function getTimelinePositionTick(targetWord, sentences) {
  const words = sentences.flatMap((item) => item.words);

  // target 이전의 deleted word들만 모아서 interval union 계산
  const targetStartTick = BigInt(targetWord.start_at_tick || 0);

  const deletedIntervals = [];
  for (const word of words) {
    if (!word.is_deleted) continue;
    // BigInt(0n)은 falsy라 !word.start_at_tick으로 거르면 0초로 드래그된 첫 단어가 누락됨
    if (word.start_at_tick == null || word.end_at_tick == null) continue;
    const wordStart = BigInt(word.start_at_tick);
    if (wordStart >= targetStartTick) continue; // target 이후는 무관
    const gapTick = BigInt(word.gap_after_tick || 0);
    const wordEnd = BigInt(word.end_at_tick) + gapTick;
    deletedIntervals.push({ start: wordStart, end: wordEnd });
  }

  // start로 정렬 후 union
  deletedIntervals.sort((a, b) => (a.start < b.start ? -1 : a.start > b.start ? 1 : 0));

  let accumulatedOffsetTick = 0n;
  let cur = null;
  for (const iv of deletedIntervals) {
    if (!cur) {
      cur = { start: iv.start, end: iv.end };
    } else if (iv.start <= cur.end) {
      // 겹치거나 인접 → 확장
      if (iv.end > cur.end) cur.end = iv.end;
    } else {
      accumulatedOffsetTick += cur.end - cur.start;
      cur = { start: iv.start, end: iv.end };
    }
  }
  if (cur) accumulatedOffsetTick += cur.end - cur.start;

  // target이 어떤 interval 내부에 있다면 그 interval 시작점부터의 차이까지만 빼야
  // 함. 대신 일반적 케이스(target은 살아있는 word)에서는 직접 빼도 OK
  const timelineStartTick = targetStartTick - accumulatedOffsetTick;
  return { startTick: timelineStartTick };
}

/**
 * 🔥 타임라인 시간 → 원본 오디오 시간 변환 (waveform 동기화용)
 * 캐시된 deletedIntervals 사용으로 O(n) 최적화
 * @param {number} timelineSec - Premiere 타임라인 시간 (초)
 * @returns {number} - 원본 오디오 시간 (초)
 */
export function getOriginalTimeFromTimeline(timelineSec) {
  if (!deletedIntervalsCache || deletedIntervalsCache.length === 0) {
    return timelineSec;
  }

  // 🔥 tick 기반 계산 (BigInt 정밀도)
  const timelineTick = BigInt(Math.floor(timelineSec * TICKS_PER_SECOND));
  let totalDeletedTick = 0n;

  for (const interval of deletedIntervalsCache) {
    const estimatedOriginalTick = timelineTick + totalDeletedTick;
    if (estimatedOriginalTick < interval.startTick) {
      break;
    }
    totalDeletedTick += interval.durationTick;
  }

  return Number(timelineTick + totalDeletedTick) / TICKS_PER_SECOND;
}

/**
 * 🔥 원본 오디오 시간 → 타임라인 시간 변환 (waveform 클릭 → Premiere 이동용)
 * @param {number} originalSec - 원본 오디오 시간 (초)
 * @returns {number} - Premiere 타임라인 시간 (초)
 */
export function getTimelineTimeFromOriginal(originalSec) {
  if (!deletedIntervalsCache || deletedIntervalsCache.length === 0) {
    return originalSec;
  }

  // 🔥 tick 기반 계산 (BigInt 정밀도)
  const originalTick = BigInt(Math.floor(originalSec * TICKS_PER_SECOND));
  let totalDeletedTick = 0n;
  
  for (const interval of deletedIntervalsCache) {
    // 원본 tick이 이 삭제 구간보다 앞에 있으면 중단
    if (originalTick < interval.startTick) {
      break;
    }
    
    // 원본 tick이 삭제 구간 안에 있으면, 구간 시작까지만 계산
    if (originalTick < interval.endTick) {
      break;
    }
    
    // 이 삭제 구간을 완전히 지났으면 duration 누적
    totalDeletedTick += interval.durationTick;
  }

  // tick → 초 변환
  const resultTick = originalTick - totalDeletedTick;
  return Number(resultTick) / TICKS_PER_SECOND;
}
