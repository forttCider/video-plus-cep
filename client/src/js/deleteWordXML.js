/**
 * XML 기반 단어 삭제
 */

import { 
  exportSequenceAsXML, 
  importXMLAndOpen,
  readXMLFile,
  writeXMLFile,
  ensureDir,
  getSequenceFramerate,
  getAdjustmentLayerInfo,
  insertAdjustmentLayers
} from "./cep-bridge";
import { deleteWordFromXML, cleanupXML, XML_DIR } from "./xmlEditor";
import { getTimelinePosition } from "./calculateTimeOffset";

const TICKS_PER_SECOND = 254016000000n;

/**
 * 초를 ticks로 변환 (BigInt)
 */
function secondsToTicks(seconds) {
  return BigInt(Math.round(seconds * Number(TICKS_PER_SECOND)));
}

const ADJ_LAYER_INFO_PATH = `${XML_DIR}/adjustment_layers.json`;

/**
 * Adjustment Layer 복원
 */
async function restoreAdjustmentLayers() {
  const fs = require("fs");
  
  // 파일 존재 확인
  if (!fs.existsSync(ADJ_LAYER_INFO_PATH)) {
    return { success: true, inserted: 0 };
  }
  
  // 파일 내용 확인
  try {
    const data = fs.readFileSync(ADJ_LAYER_INFO_PATH, "utf8");
    const adjInfo = JSON.parse(data);
    if (!adjInfo.adjustmentLayers || adjInfo.adjustmentLayers.length === 0) {
      return { success: true, inserted: 0 };
    }
  } catch (e) {
    console.error("[deleteWordXML] Adjustment Layer 정보 확인 실패:", e);
    return { success: false, error: e.message };
  }
  
  // ExtendScript에 파일 경로 전달
  const result = await insertAdjustmentLayers(ADJ_LAYER_INFO_PATH);
  return result;
}

/**
 * 받아쓰기 완료 후 original.xml 저장
 * Adjustment Layer 정보 저장 + 트랙 제거 포함
 */
export async function saveOriginalXML() {
  await ensureDir(XML_DIR);
  const outputPath = `${XML_DIR}/original.xml`;
  
  // 1. Adjustment Layer 정보 저장 (XML 내보내기 전에!)
  try {
    const adjInfo = await getAdjustmentLayerInfo();
    if (adjInfo && adjInfo.adjustmentLayers && adjInfo.adjustmentLayers.length > 0) {
      const fs = require("fs");
      fs.writeFileSync(ADJ_LAYER_INFO_PATH, JSON.stringify(adjInfo, null, 2));
    }
  } catch (e) {
    console.error("[deleteWordXML] Adjustment Layer 정보 저장 실패:", e);
  }
  
  // 2. XML 내보내기
  const result = await exportSequenceAsXML(outputPath);
  
  if (result.success) {
    
    // 3. Adjustment Layer 제거
    try {
      const rawXML = await readXMLFile(outputPath);
      const cleanedXML = cleanupXML(rawXML);
      await writeXMLFile(outputPath, cleanedXML);
    } catch (e) {
      console.error("[deleteWordXML] Adjustment Layer 제거 실패:", e);
    }
  } else {
    console.error("[deleteWordXML] original.xml 저장 실패:", result.error);
  }
  
  return result;
}

/**
 * 현재 시퀀스를 XML로 저장 (word_id 기준)
 * Adjustment Layer 트랙 제거 포함
 */
async function saveCurrentXML(wordId) {
  await ensureDir(XML_DIR);
  const outputPath = `${XML_DIR}/${wordId}.xml`;
  const result = await exportSequenceAsXML(outputPath);
  
  if (result.success) {
    // Adjustment Layer 제거
    try {
      const rawXML = await readXMLFile(outputPath);
      const cleanedXML = cleanupXML(rawXML);
      await writeXMLFile(outputPath, cleanedXML);
    } catch (e) {
      console.error(`[deleteWordXML] ${wordId}.xml Adjustment Layer 제거 실패:`, e);
    }
  }
  
  return result;
}

/**
 * 가장 최근 XML 파일 경로 반환
 * (삭제 작업은 항상 최신 상태에서 진행)
 */
async function getLatestXMLPath() {
  const fs = require("fs");
  const files = fs.readdirSync(XML_DIR);
  
  // xml 파일들 중 가장 최근 수정된 파일
  let latestFile = "original.xml";
  let latestTime = 0;
  
  for (const file of files) {
    if (file.endsWith(".xml")) {
      const stat = fs.statSync(`${XML_DIR}/${file}`);
      if (stat.mtimeMs > latestTime) {
        latestTime = stat.mtimeMs;
        latestFile = file;
      }
    }
  }
  
  return `${XML_DIR}/${latestFile}`;
}

/**
 * XML 방식으로 단어 삭제
 * @param {object} word - 삭제할 단어 객체
 * @param {array} sentences - 문장 배열
 * @returns {Promise<{success: boolean, error?: string}>}
 */
export async function deleteWordXML(word, sentences) {
  try {
    
    // 1. 현재 상태를 word_id.xml로 저장 (복원용)
    const wordId = word.id || word.start_at || Date.now().toString();
    await saveCurrentXML(wordId);
    
    // 2. 가장 최근 XML 읽기
    const latestXMLPath = await getLatestXMLPath();
    const xmlContent = await readXMLFile(latestXMLPath);
    
    // 3. 프레임레이트 가져오기
    const framerateInfo = await getSequenceFramerate();
    const fps = framerateInfo?.frameRate || 30;
    
    // 4. 소스 미디어 ticks 계산
    // word.start_at, word.end_at은 밀리초 단위 (타임라인 위치)
    // XML의 pproTicksIn/Out은 소스 미디어 위치
    // 변환: 소스 위치 = 타임라인 위치 + firstGapTick
    
    let start, end;
    
    if (word.start_at !== undefined && word.end_at !== undefined) {
      // 밀리초 → 초
      start = word.start_at / 1000;
      end = word.end_at / 1000;
    } else {
      // fallback: getTimelinePosition
      const pos = getTimelinePosition(word, sentences);
      start = pos.start;
      end = pos.end;
    }
    
    
    if (isNaN(start) || isNaN(end)) {
      return { success: false, error: "시작/끝 시간이 유효하지 않습니다" };
    }
    
    // 앞에 삭제된 단어들의 duration 합계 계산 (offset)
    let deletedOffset = 0;
    for (const sentence of sentences) {
      if (sentence.words) {
        for (const w of sentence.words) {
          // 현재 단어보다 앞에 있고, 이미 삭제된 단어
          if (w.isDeleted && w.start_at < word.start_at) {
            const wDuration = (w.end_at - w.start_at) / 1000; // ms → sec
            deletedOffset += wDuration;
          }
        }
      }
    }
    
    // 실제 삭제 위치 = 원본 위치 - offset
    const adjustedStart = start - deletedOffset;
    const adjustedEnd = end - deletedOffset;
    
    
    // 5. XML 수정 (조정된 타임라인 위치 기준)
    const modifiedXML = deleteWordFromXML(xmlContent, adjustedStart, adjustedEnd, fps);
    
    // 6. 수정된 XML 저장
    const modifiedPath = `${XML_DIR}/modified_${wordId}.xml`;
    await writeXMLFile(modifiedPath, modifiedXML);
    
    // 7. 수정된 XML 임포트 + 시퀀스 열기
    const importResult = await importXMLAndOpen(modifiedPath);
    
    if (!importResult.success) {
      return { success: false, error: importResult.error };
    }
    
    // 8. Adjustment Layer 복원
    await restoreAdjustmentLayers();
    
    return { success: true, wordId };
    
  } catch (e) {
    console.error("[deleteWordXML] 에러:", e);
    return { success: false, error: e.message };
  }
}

/**
 * XML 방식으로 단어 복원
 * @param {object} word - 복원할 단어 객체
 * @returns {Promise<{success: boolean, error?: string}>}
 */
export async function restoreWordXML(word) {
  try {
    const wordId = word.id || word.start_at;
    const xmlPath = `${XML_DIR}/${wordId}.xml`;
    
    
    // 저장된 XML 임포트 + 시퀀스 열기
    const result = await importXMLAndOpen(xmlPath);
    
    if (!result.success) {
      return { success: false, error: result.error };
    }
    
    // Adjustment Layer 복원
    await restoreAdjustmentLayers();
    
    return { success: true };
    
  } catch (e) {
    console.error("[restoreWordXML] 에러:", e);
    return { success: false, error: e.message };
  }
}
