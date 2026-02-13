/**
 * initWords - 타임라인 정보 추가 (UXP initWords.js 포팅)
 * 각 단어에 tick, gap 정보 추가 (프레임 정렬됨)
 */
import { getVideoTrackItems, getSequenceFramerate } from "./cep-bridge";

const TICKS_PER_SECOND = 254016000000n; // BigInt

/**
 * 밀리초 → 초
 */
function getSecondTime(ms) {
  return ms / 1000;
}

/**
 * 초 → ticks (BigInt) - 프레임 정렬됨
 */
function secondsToTicksAligned(seconds, fps) {
  const ticksPerFrame = TICKS_PER_SECOND / BigInt(fps);
  const rawTicks = BigInt(Math.round(seconds * Number(TICKS_PER_SECOND)));
  // 프레임 단위로 내림 (floor)
  const frames = rawTicks / ticksPerFrame;
  return frames * ticksPerFrame;
}

/**
 * initWords - 단어에 타임라인 정보 추가
 * @param {Array} sentences - 문장 배열
 * @returns {Promise<Array>} - gap 정보가 추가된 문장 배열
 */
export default async function initWords(sentences) {
  try {
    // 프레임레이트 가져오기
    const framerateInfo = await getSequenceFramerate();
    if (framerateInfo.error) {
      console.error("[initWords] 프레임레이트 오류:", framerateInfo.error);
      return sentences;
    }
    const fps = Math.round(framerateInfo.frameRate || 30);
    
    // 비디오 트랙 클립 정보 가져오기
    const trackInfo = await getVideoTrackItems();
    if (trackInfo.error) {
      console.error("[initWords] 트랙 정보 오류:", trackInfo.error);
      return sentences;
    }
    
    const items = trackInfo.items || [];
    if (items.length === 0) {
      console.warn("[initWords] 비디오 클립 없음");
      return sentences;
    }
    
    // inOutPoints 배열 생성
    const inOutPoints = items.map((item) => ({
      startTime: item.startTime,
      endTime: item.endTime,
      inPoint: item.inPoint,
      outPoint: item.outPoint,
      inPointTick: BigInt(item.inPointTicks),
      outPointTick: BigInt(item.outPointTicks),
    }));
    
    // 누적 gap 계산
    let accumulatedGap = 0;
    let accumulatedGapTick = 0n;
    
    const inOutPointsWithGap = inOutPoints.map((item, index) => {
      if (index === 0) {
        accumulatedGap = item.inPoint;
        accumulatedGapTick = item.inPointTick;
      } else {
        accumulatedGap += item.inPoint - inOutPoints[index - 1].outPoint;
        accumulatedGapTick += item.inPointTick - inOutPoints[index - 1].outPointTick;
      }
      return { ...item, accumulatedGap, accumulatedGapTick };
    });
    
    // 모든 단어 flat
    const allWords = sentences.flatMap((sentence) => sentence.words);
    
    // 각 단어에 gap 정보 추가
    const newSentences = sentences.map((sentence) => {
      const newGapWords = sentence.words.map((item, idx) => {
        const wordIndex = allWords.findIndex((w) => w.start_at === item.start_at);
        const prevWord = allWords[wordIndex - 1];
        
        const segStartSec = prevWord
          ? getSecondTime(prevWord.end_at)
          : getSecondTime(item.start_at);
        const segEndSec = getSecondTime(item.end_at);
        
        // 해당 클립 찾기
        const containingClip = inOutPointsWithGap.find(
          (clip) => clip.startTime <= segStartSec && clip.endTime >= segEndSec
        );
        
        // tick 값 계산 (프레임 정렬됨)
        const startTick = secondsToTicksAligned(item.start_at / 1000, fps);
        const endTick = secondsToTicksAligned(item.end_at / 1000, fps);
        
        if (containingClip) {
          // 일반 단어 - 하나의 클립에 포함
          return {
            ...item,
            start_at_tick: startTick,
            end_at_tick: endTick,
            start_at_sec: item.start_at / 1000,
            end_at_sec: item.end_at / 1000,
            isOverlapped: false,
            firstGap: containingClip.accumulatedGap,
            firstGapTick: containingClip.accumulatedGapTick,
          };
        } else {
          // 겹친 단어 - 두 클립에 걸침
          const firstClip = inOutPointsWithGap.find(
            (clip) => clip.startTime <= segStartSec && clip.endTime >= segStartSec
          );
          const secondClip = inOutPointsWithGap.find(
            (clip) => clip.startTime <= segEndSec && clip.endTime >= segEndSec
          );
          
          return {
            ...item,
            start_at_tick: startTick,
            end_at_tick: endTick,
            start_at_sec: item.start_at / 1000,
            end_at_sec: item.end_at / 1000,
            isOverlapped: true,
            firstGap: firstClip?.accumulatedGap || 0,
            firstGapTick: firstClip?.accumulatedGapTick || 0n,
            secondGap: secondClip?.accumulatedGap || 0,
            secondGapTick: secondClip?.accumulatedGapTick || 0n,
            firstClipOutPointTick: firstClip?.outPointTick,
            secondClipInPointTick: secondClip?.inPointTick,
          };
        }
      });
      
      return { ...sentence, words: newGapWords };
    });
    
    return newSentences;
  } catch (e) {
    console.error("[initWords] 오류:", e);
    return sentences;
  }
}
