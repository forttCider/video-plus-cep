/**
 * deleteWord - 단어를 타임라인에서 삭제 (QE razor 사용)
 */
import { deleteWordByTimelineTicks } from "./cep-bridge";
import { getTimelinePositionTick } from "./calculateTimeOffset";

/**
 * 단어를 타임라인에서 삭제 (타임라인 위치 기준)
 * @param {object} word - 삭제할 단어 객체
 * @param {Array} sentences - 전체 문장 배열 (오프셋 계산용)
 */
export async function deleteWordFromTimeline(word, sentences) {
  // 삭제된 단어 수 확인
  const allWords = sentences.flatMap((s) => s.words);
  const deletedWords = allWords.filter((w) => w.isDeleted);
  deletedWords.forEach((w, i) => {
  });
  
  // 타임라인 위치 계산 (삭제된 단어들의 오프셋 적용)
  const { startTick: timelineStartTick } = getTimelinePositionTick(word, sentences);
  
  // 단어 duration 계산
  const wordDuration = BigInt(word.end_at_tick || 0) - BigInt(word.start_at_tick || 0);
  const timelineEndTick = timelineStartTick + wordDuration;


  // ExtendScript에서 타임라인 위치로 razor + 삭제
  const result = await deleteWordByTimelineTicks(
    timelineStartTick.toString(),
    timelineEndTick.toString()
  );


  return {
    success: result?.success || false,
    error: result?.error || null,
    deletedClips: result?.deletedClips || 0,
  };
}
