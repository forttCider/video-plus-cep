/**
 * restoreWord - 삭제된 단어를 타임라인에서 복원
 * 소스 미디어 위치로 클립 찾기 (프레임 정렬된 tick 사용)
 */
import { restoreWordByTimecode, getSequenceFramerate } from "./cep-bridge";
import { getTimelinePositionTick } from "./calculateTimeOffset";

const TICKS_PER_SECOND = 254016000000n;

/**
 * 틱을 timecode 문자열로 변환 ("HH:MM:SS:FF")
 */
function ticksToTimecode(ticks, fps) {
  const ticksNum = BigInt(ticks);
  const ticksPerFrame = TICKS_PER_SECOND / BigInt(fps);
  const totalFrames = Number(ticksNum / ticksPerFrame);
  
  const frames = totalFrames % fps;
  const totalSeconds = Math.floor(totalFrames / fps);
  const seconds = totalSeconds % 60;
  const totalMinutes = Math.floor(totalSeconds / 60);
  const minutes = totalMinutes % 60;
  const hours = Math.floor(totalMinutes / 60);
  
  const pad = (n) => String(n).padStart(2, '0');
  return `${pad(hours)}:${pad(minutes)}:${pad(seconds)}:${pad(frames)}`;
}

/**
 * 삭제된 단어를 타임라인에서 복원
 * @param {object} word - 복원할 단어 객체
 * @param {Array} sentences - 전체 문장 배열 (타임라인 위치 계산용)
 */
export async function restoreWordFromTimeline(word, sentences) {
  // fps 가져오기
  const fpsInfo = await getSequenceFramerate();
  const fps = Math.round(fpsInfo?.frameRate || 30);
  
  // 소스 미디어 위치 계산 (프레임 정렬된 tick - initWords에서 이미 정렬됨)
  const startAtTick = BigInt(word.start_at_tick || 0);
  const endAtTick = BigInt(word.end_at_tick || 0);
  const firstGapTick = BigInt(word.firstGapTick || 0);
  
  // 소스 미디어 위치
  const sourceIn = startAtTick + firstGapTick;
  const sourceOut = endAtTick + firstGapTick;
  
  // timecode 변환
  const sourceInTC = ticksToTimecode(sourceIn, fps);
  const sourceOutTC = ticksToTimecode(sourceOut, fps);
  
  // duration
  const durationTicks = endAtTick - startAtTick;
  const durationTC = ticksToTimecode(durationTicks, fps);
  
  // 타임라인 위치 계산 (insertClip 용)
  const { startTick: timelineStartTick } = getTimelinePositionTick(word, sentences);
  const timelinePositionTC = ticksToTimecode(timelineStartTick, fps);

  
  // ExtendScript에서 클립 찾아서 복원 (timecode 기반)
  const result = await restoreWordByTimecode(sourceInTC, sourceOutTC, durationTC, timelinePositionTC);


  return {
    success: result?.success || false,
    error: result?.error || null,
    method: result?.method,
    leftIdx: result?.leftIdx,
    rightIdx: result?.rightIdx,
  };
}
