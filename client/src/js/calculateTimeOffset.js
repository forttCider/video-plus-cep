/**
 * calculateTimeOffset - 타임라인 오프셋 계산 (tick 기반으로 통일)
 */

const TICKS_PER_SECOND = 254016000000;
const TICKS_PER_SECOND_BIGINT = 254016000000n;

// ========== 성능 최적화: 프리컴퓨팅 + 이진 탐색 ==========

/**
 * 타임라인 인덱스 생성 (sentences 변경 시 한 번만 호출) - tick 기반 (BigInt)
 */
export function buildTimelineIndex(sentences) {
  if (!sentences || sentences.length === 0) {
    return { entries: [] };
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
  let accumulatedOffsetTick = 0n;

  for (const word of sortedWords) {
    if (word.isDeleted) {
      const durationTick = BigInt(word.end_at_tick || 0) - BigInt(word.start_at_tick || 0);
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
      sentence: sentenceMap.get(word.parentId),
    });
  }

  return { entries };
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
  
  // 삭제된 단어 확인 (디버그)
  const deletedWords = words.filter((w) => w.isDeleted);

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

    if (word.isDeleted) {
      accumulatedOffset += word.end_at_sec - word.start_at_sec;
    }
  }

  return { start: targetWord.start_at_sec, prevEnd: targetWord.start_at_sec };
}

/**
 * Tick 기반 타임라인 위치 계산 (BigInt)
 */
export function getTimelinePositionTick(targetWord, sentences) {
  let accumulatedOffsetTick = 0n;

  const words = sentences.flatMap((item) => item.words);
  
  // 디버그: 삭제된 단어 목록
  const deletedWords = words.filter(w => w.isDeleted);
  deletedWords.forEach((w, i) => {
    const dur = BigInt(w.end_at_tick || 0) - BigInt(w.start_at_tick || 0);
  });

  // 시간순 정렬 (start_at_tick 기준)
  const sortedWords = [...words].sort((a, b) => {
    const aStart = BigInt(a.start_at_tick || 0);
    const bStart = BigInt(b.start_at_tick || 0);
    if (aStart < bStart) return -1;
    if (aStart > bStart) return 1;
    return 0;
  });

  const targetStartTick = BigInt(targetWord.start_at_tick || 0);

  for (let i = 0; i < sortedWords.length; i++) {
    const word = sortedWords[i];
    const wordStartTick = BigInt(word.start_at_tick || 0);

    // 대상 단어에 도달하면 중단
    if (wordStartTick >= targetStartTick) {
      const timelineStartTick = targetStartTick - accumulatedOffsetTick;
      return { startTick: timelineStartTick };
    }

    if (word.isDeleted && word.start_at_tick && word.end_at_tick) {
      accumulatedOffsetTick +=
        BigInt(word.end_at_tick) - BigInt(word.start_at_tick);
    }
  }

  return { startTick: BigInt(targetWord.start_at_tick || 0) };
}
