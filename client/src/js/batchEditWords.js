/**
 * batchEditWords - 무음/간투사 일괄 삭제 (CEP 버전)
 */
import { deleteWordByTimelineTicks } from "./cep-bridge";
import { getTimelinePositionTick } from "./calculateTimeOffset";

// 간투사 타입 상수 (interjection만)
export const FILLER_TYPES = [
  "interjection",
];

/**
 * 단어가 다른 단어들과 시간상 겹치는지 확인
 * @param {Object} word - 확인할 단어
 * @param {Array} allWords - 모든 단어 배열 (삭제 안 된 것들)
 * @returns {boolean} - 겹치면 true
 */
function isOverlapping(word, allWords) {
  const wordStart = word.start_at;
  const wordEnd = word.end_at;
  
  for (const other of allWords) {
    // 자기 자신은 스킵
    if ((other.id || other.start_at) === (word.id || word.start_at)) continue;
    // 이미 삭제된 단어는 스킵
    if (other.isDeleted) continue;
    
    const otherStart = other.start_at;
    const otherEnd = other.end_at;
    
    // 겹침 체크: 두 구간이 겹치는지
    // (A.start < B.end) && (A.end > B.start)
    if (wordStart < otherEnd && wordEnd > otherStart) {
      // 완전히 같은 구간이 아니고, 부분적으로 겹치면 true
      if (!(wordStart === otherStart && wordEnd === otherEnd)) {
        return true;
      }
    }
  }
  return false;
}

/**
 * 연속된 단어들을 그룹으로 묶기
 */
function groupConsecutiveWords(words) {
  if (words.length === 0) return [];
  
  const groups = [];
  let currentGroup = [words[0]];
  
  for (let i = 1; i < words.length; i++) {
    const prev = words[i - 1];
    const curr = words[i];
    
    // 이전 단어의 end와 현재 단어의 start가 같으면 연속
    if (Math.abs(prev.end_at - curr.start_at) < 10) { // 10ms 허용
      currentGroup.push(curr);
    } else {
      groups.push(currentGroup);
      currentGroup = [curr];
    }
  }
  
  if (currentGroup.length > 0) {
    groups.push(currentGroup);
  }
  
  return groups;
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
    s.words.map((w) => ({ ...w, sentenceStartAt: s.start_at }))
  );

  // 1. 전체 단어에서 조건에 맞는 단어 필터링 + 겹침 체크
  const allWords = sentences.flatMap((s) =>
    s.words
      .filter((w) => {
        if (!filterFn(w)) return false;
        // 겹침 체크 - 겹치면 스킵
        if (isOverlapping(w, allWordsFlat)) {
          return false;
        }
        return true;
      })
      .map((w) => ({ ...w, sentenceStartAt: s.start_at }))
  );

  if (allWords.length === 0) {
    return { deletedWordIds: new Set(), success: true };
  }

  allWords.forEach((w, i) => {
  });

  // 2. 시간순 정렬 (앞에서부터)
  const sortedWords = [...allWords].sort((a, b) => a.start_at - b.start_at);
  
  // 3. 연속된 단어들을 그룹으로 묶기
  const groups = groupConsecutiveWords(sortedWords);
  
  // 4. 그룹을 역순으로 (뒤에서부터 삭제해야 앞 위치 안 바뀜)
  const reversedGroups = [...groups].reverse();

  // 5. 로컬 상태 복사본
  let currentSentences = sentences.map((s) => ({
    ...s,
    words: s.words.map((w) => ({ ...w })),
  }));

  // 6. 그룹 단위로 삭제 실행
  const deletedWords = [];
  let processedCount = 0;

  for (let i = 0; i < reversedGroups.length; i++) {
    const group = reversedGroups[i];

    // 그룹의 시작과 끝 (연속된 단어들의 전체 범위)
    // 그룹 내부는 시간순, 그룹들만 역순으로 처리
    const groupStart = group[0]; // 시간상 첫 번째 단어
    const groupEnd = group[group.length - 1]; // 시간상 마지막 단어
    
    // 타임라인 위치 계산 (삭제된 단어들의 오프셋 적용)
    const { startTick: timelineStartTick } = getTimelinePositionTick(
      groupStart,
      currentSentences
    );
    
    // 그룹 전체 duration
    const groupDuration = BigInt(groupEnd.end_at_tick || 0) - BigInt(groupStart.start_at_tick || 0);
    const timelineEndTick = timelineStartTick + groupDuration;


    try {
      // razor + delete
      const result = await deleteWordByTimelineTicks(
        timelineStartTick.toString(),
        timelineEndTick.toString()
      );
      
      // 실제 삭제된 범위 로깅
      if (result?.razorStart && result?.razorEnd) {
        const requestedDuration = groupDuration;
        const actualDuration = BigInt(result.actualDuration || 0);
        const diff = requestedDuration - actualDuration;
      }

      if (result?.success) {
        deletedWords.push(...group);
        
        // 로컬 복사본 업데이트
        const groupIds = new Set(group.map((w) => w.id || w.start_at));
        currentSentences = currentSentences.map((s) => ({
          ...s,
          words: s.words.map((w) =>
            groupIds.has(w.id || w.start_at) ? { ...w, isDeleted: true } : w
          ),
        }));
      }

      processedCount += group.length;
      if (onProgress) {
        onProgress(processedCount, allWords.length);
      }
    } catch (error) {
      console.error(`[batchDelete] 그룹 삭제 실패:`, error);
      processedCount += group.length;
      continue;
    }
  }


  return {
    deletedWordIds: new Set(deletedWords.map((w) => w.id || w.start_at)),
    success: true,
  };
}

/**
 * 삭제 결과를 sentences 상태에 적용
 */
export function applyDeleteResult(sentences, deletedWordIds) {
  return sentences.map((s) => {
    const updatedWords = s.words.map((w) =>
      deletedWordIds.has(w.id || w.start_at) ? { ...w, isDeleted: true } : w
    );
    const allDeleted = updatedWords.every((w) => w.isDeleted);
    return {
      ...s,
      isDeleted: allDeleted ? true : s.isDeleted,
      words: updatedWords,
    };
  });
}
