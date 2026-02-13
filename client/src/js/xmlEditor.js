/**
 * XML 기반 단어 삭제/복원
 * FCP XML 파일을 파싱하고 clipitem을 수정
 */

const XML_DIR = "/tmp/videoplus_xml";
const TICKS_PER_SECOND = 254016000000n;  // BigInt

/**
 * ticks를 프레임으로 변환
 */
function ticksToFrames(ticks, fps = 30) {
  const seconds = Number(ticks) / Number(TICKS_PER_SECOND);
  return Math.floor(seconds * fps);
}

/**
 * 프레임을 ticks로 변환
 */
function framesToTicks(frames, fps = 30) {
  const seconds = frames / fps;
  return BigInt(Math.round(seconds * Number(TICKS_PER_SECOND)));
}

/**
 * XML에서 clipitem 찾기 (타임라인 위치 기준)
 * @param {Document} xmlDoc - 파싱된 XML
 * @param {number} timelineStartFrame - 삭제 시작 (타임라인 프레임)
 * @param {number} timelineEndFrame - 삭제 끝 (타임라인 프레임)
 * @returns {Element[]} 매칭되는 clipitem들
 */
function findClipItemsByTimelinePosition(xmlDoc, timelineStartFrame, timelineEndFrame) {
  const clipItems = xmlDoc.getElementsByTagName("clipitem");
  const matches = [];
  
  
  for (let i = 0; i < clipItems.length; i++) {
    const clip = clipItems[i];
    const startEl = clip.getElementsByTagName("start")[0];
    const endEl = clip.getElementsByTagName("end")[0];
    const nameEl = clip.getElementsByTagName("name")[0];
    
    if (!startEl || !endEl) {
      continue;
    }
    
    const clipStart = parseInt(startEl.textContent);
    const clipEnd = parseInt(endEl.textContent);
    const clipName = nameEl?.textContent || "unknown";
    
    // Adjustment Layer만 제외 (both는 편집 대상!)
    const lowerName = clipName.toLowerCase();
    if (lowerName.includes("adjustment")) {
      continue;
    }
    
    // 삭제 구간이 클립 내부에 있는지 확인 (타임라인 위치 기준)
    if (clipStart <= timelineStartFrame && clipEnd >= timelineEndFrame) {
      matches.push(clip);
    }
  }
  
  return matches;
}

/**
 * clipitem을 분할 (단어 삭제) - 타임라인 위치 기준
 * @param {Document} xmlDoc - 파싱된 XML
 * @param {Element} clipItem - 분할할 clipitem
 * @param {number} deleteStartFrame - 삭제 시작 (타임라인 프레임)
 * @param {number} deleteEndFrame - 삭제 끝 (타임라인 프레임)
 * @param {number} fps - 프레임레이트
 */
function splitClipItem(xmlDoc, clipItem, deleteStartFrame, deleteEndFrame, fps = 30) {
  const parent = clipItem.parentNode;
  
  // 기존 값 읽기
  const startEl = clipItem.getElementsByTagName("start")[0];
  const endEl = clipItem.getElementsByTagName("end")[0];
  const inEl = clipItem.getElementsByTagName("in")[0];
  const outEl = clipItem.getElementsByTagName("out")[0];
  const pproTicksInEl = clipItem.getElementsByTagName("pproTicksIn")[0];
  const pproTicksOutEl = clipItem.getElementsByTagName("pproTicksOut")[0];
  
  const origStart = parseInt(startEl.textContent);  // 타임라인 시작 (프레임)
  const origEnd = parseInt(endEl.textContent);      // 타임라인 끝 (프레임)
  const origIn = parseInt(inEl.textContent);        // 소스 in (프레임)
  const origOut = parseInt(outEl.textContent);      // 소스 out (프레임)
  const origTicksIn = BigInt(pproTicksInEl?.textContent || "0");
  const origTicksOut = BigInt(pproTicksOutEl?.textContent || "0");
  
  const deleteDurationFrames = deleteEndFrame - deleteStartFrame;
  
  // 타임라인 위치에서 소스 위치로 변환
  // 삭제 시작점의 소스 위치 = origIn + (deleteStartFrame - origStart)
  const sourceDeleteStart = origIn + (deleteStartFrame - origStart);
  const sourceDeleteEnd = origIn + (deleteEndFrame - origStart);
  
  // ticks 계산 (프레임 → ticks)
  const ticksPerFrame = TICKS_PER_SECOND / BigInt(fps);
  const frameOffsetStart = BigInt(deleteStartFrame - origStart);
  const frameOffsetEnd = BigInt(deleteEndFrame - origStart);
  const sourceDeleteStartTicks = origTicksIn + frameOffsetStart * ticksPerFrame;
  const sourceDeleteEndTicks = origTicksIn + frameOffsetEnd * ticksPerFrame;
  
  // 클립 1 (삭제 전 부분): A
  const clip1 = clipItem.cloneNode(true);
  const clip1End = clip1.getElementsByTagName("end")[0];
  const clip1Out = clip1.getElementsByTagName("out")[0];
  const clip1TicksOut = clip1.getElementsByTagName("pproTicksOut")[0];
  
  clip1End.textContent = deleteStartFrame;          // 타임라인 끝 = 삭제 시작
  clip1Out.textContent = sourceDeleteStart;         // 소스 out = 삭제 시작점
  if (clip1TicksOut) clip1TicksOut.textContent = sourceDeleteStartTicks.toString();
  
  // 클립 2 (삭제 후 부분): C - start를 앞당김 (ripple)
  const clip2 = clipItem.cloneNode(true);
  const clip2Start = clip2.getElementsByTagName("start")[0];
  const clip2End = clip2.getElementsByTagName("end")[0];
  const clip2In = clip2.getElementsByTagName("in")[0];
  const clip2TicksIn = clip2.getElementsByTagName("pproTicksIn")[0];
  
  // ripple: 클립2 시작 = 클립1 끝 (삭제 구간만큼 앞당김)
  clip2Start.textContent = deleteStartFrame;        // 타임라인 시작 = 삭제 시작
  clip2End.textContent = origEnd - deleteDurationFrames;  // 타임라인 끝 = 원본끝 - 삭제길이
  clip2In.textContent = sourceDeleteEnd;            // 소스 in = 삭제 끝점
  if (clip2TicksIn) clip2TicksIn.textContent = sourceDeleteEndTicks.toString();
  
  // ID 수정 (중복 방지)
  const clip1Id = clip1.getAttribute("id");
  const clip2Id = clip2.getAttribute("id");
  if (clip1Id) clip1.setAttribute("id", clip1Id + "-a");
  if (clip2Id) clip2.setAttribute("id", clip2Id + "-b");
  
  // 원본 제거, 새 클립 삽입
  parent.insertBefore(clip1, clipItem);
  parent.insertBefore(clip2, clipItem);
  parent.removeChild(clipItem);
  
  return { clip1, clip2, deleteDurationFrames };
}

/**
 * 분할 후 뒤따르는 클립들의 start/end 조정 (ripple)
 * @param {Document} xmlDoc - 파싱된 XML
 * @param {number} splitPointFrame - 분할 지점 (프레임)
 * @param {number} deleteDurationFrames - 삭제된 길이 (프레임)
 */
function rippleFollowingClips(xmlDoc, splitPointFrame, deleteDurationFrames) {
  const clipItems = xmlDoc.getElementsByTagName("clipitem");
  
  for (let i = 0; i < clipItems.length; i++) {
    const clip = clipItems[i];
    const startEl = clip.getElementsByTagName("start")[0];
    const endEl = clip.getElementsByTagName("end")[0];
    
    if (!startEl || !endEl) continue;
    
    const start = parseInt(startEl.textContent);
    
    // 분할 지점 이후 클립들만 조정
    if (start > splitPointFrame) {
      startEl.textContent = start - deleteDurationFrames;
      endEl.textContent = parseInt(endEl.textContent) - deleteDurationFrames;
    }
  }
}

/**
 * Adjustment Layer 트랙만 제거 (both는 유지)
 * @param {Document} xmlDoc - 파싱된 XML
 */
function removeSpecialTracks(xmlDoc) {
  const tracks = xmlDoc.getElementsByTagName("track");
  const toRemove = [];
  
  
  for (let i = 0; i < tracks.length; i++) {
    const track = tracks[i];
    const clipItems = track.getElementsByTagName("clipitem");
    
    // 트랙 내 모든 clipitem 확인
    let shouldRemove = false;
    let removedClipName = "";
    
    for (let j = 0; j < clipItems.length; j++) {
      const nameEl = clipItems[j].getElementsByTagName("name")[0];
      const clipName = nameEl?.textContent || "";
      const lowerName = clipName.toLowerCase();
      
      // Adjustment Layer만 제거 (both는 유지!)
      if (lowerName.includes("adjustment")) {
        shouldRemove = true;
        removedClipName = clipName;
        break;
      }
    }
    
    if (shouldRemove) {
      toRemove.push({ track, name: removedClipName });
    }
  }
  
  // 트랙 제거
  for (const { track, name } of toRemove) {
    track.parentNode.removeChild(track);
  }
  
}

/**
 * XML 문자열을 Document로 파싱
 */
export function parseXML(xmlString) {
  
  const parser = new DOMParser();
  const doc = parser.parseFromString(xmlString, "text/xml");
  
  // 파싱 에러 체크
  const parseError = doc.getElementsByTagName("parsererror");
  if (parseError.length > 0) {
    console.error("[xmlEditor] XML 파싱 에러:", parseError[0].textContent);
  }
  
  // clipitem 수 확인
  const clipItems = doc.getElementsByTagName("clipitem");
  
  return doc;
}

/**
 * Document를 XML 문자열로 변환
 */
export function serializeXML(xmlDoc) {
  const serializer = new XMLSerializer();
  return serializer.serializeToString(xmlDoc);
}

/**
 * 단어 삭제를 위한 XML 수정 - 타임라인 위치 기준
 * @param {string} xmlContent - XML 파일 내용
 * @param {number} timelineStartSec - 삭제 시작 (타임라인 초)
 * @param {number} timelineEndSec - 삭제 끝 (타임라인 초)
 * @param {number} fps - 프레임레이트
 * @returns {string} 수정된 XML
 */
export function deleteWordFromXML(xmlContent, timelineStartSec, timelineEndSec, fps = 30) {
  const xmlDoc = parseXML(xmlContent);
  
  // 특수 트랙 제거 (Adjustment Layer, both)
  removeSpecialTracks(xmlDoc);
  
  // 초 → 프레임 변환
  const deleteStartFrame = Math.floor(timelineStartSec * fps);
  const deleteEndFrame = Math.floor(timelineEndSec * fps);
  const deleteDurationFrames = deleteEndFrame - deleteStartFrame;
  
  
  // 매칭되는 clipitem 찾기 (타임라인 위치 기준)
  const matchingClips = findClipItemsByTimelinePosition(xmlDoc, deleteStartFrame, deleteEndFrame);
  
  if (matchingClips.length === 0) {
    console.warn("[xmlEditor] 매칭되는 클립 없음");
    return serializeXML(xmlDoc);  // Adjustment Layer 제거된 XML 반환
  }
  
  
  // 각 클립 분할
  for (const clip of matchingClips) {
    splitClipItem(xmlDoc, clip, deleteStartFrame, deleteEndFrame, fps);
  }
  
  // ripple 적용 (분할 지점 이후 클립들 앞당김)
  rippleFollowingClips(xmlDoc, deleteStartFrame, deleteDurationFrames);
  
  return serializeXML(xmlDoc);
}

/**
 * XML 정리 (특수 트랙 제거: Adjustment Layer, both)
 * 초기 XML 내보내기 후 사용
 */
export function cleanupXML(xmlContent) {
  const xmlDoc = parseXML(xmlContent);
  removeSpecialTracks(xmlDoc);
  return serializeXML(xmlDoc);
}

export { XML_DIR };
