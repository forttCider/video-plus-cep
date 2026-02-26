/**
 * CEP ↔ ExtendScript 통신 브릿지
 * CSInterface.evalScript()로 ExtendScript 함수 호출
 */

let csInterface = null;
let extendScriptLoaded = false;

/**
 * CSInterface 초기화
 */
function getCSInterface() {
  if (!csInterface) {
    if (typeof CSInterface !== "undefined") {
      csInterface = new CSInterface();
    } else {
      throw new Error("CSInterface를 찾을 수 없습니다. CEP 환경이 아닙니다.");
    }
  }
  return csInterface;
}

/**
 * ExtendScript 파일 로드
 */
export function loadExtendScript() {
  return new Promise((resolve, reject) => {
    if (extendScriptLoaded) {
      resolve(true);
      return;
    }
    
    try {
      const cs = getCSInterface();
      const extPath = cs.getSystemPath(SystemPath.EXTENSION) + "/host/index.jsx";
      
      cs.evalScript('$.evalFile("' + extPath + '")', (result) => {
        extendScriptLoaded = true;
        resolve(true);
      });
    } catch (e) {
      reject(e);
    }
  });
}

/**
 * 키보드 이벤트 등록 (Premiere가 가로채지 않도록)
 * Mac: 123=←, 124=→, 125=↓, 126=↑
 * Windows: 37=←, 39=→, 40=↓, 38=↑
 * K: 75 (공통)
 */
export function registerKeyEvents() {
  try {
    const cs = getCSInterface();
    const isMac = navigator.userAgent.indexOf("Mac") !== -1;
    
    // 모든 키코드 등록 (0-126) - Premiere 키보드 가로채기 우회
    const keyEvents = [];
    for (let i = 0; i <= 126; i++) {
      keyEvents.push({ "keyCode": i });
    }
    
    cs.registerKeyEventsInterest(JSON.stringify(keyEvents));
    return isMac;
  } catch (e) {
    console.error("[CEP] 키보드 이벤트 등록 실패:", e);
    return false;
  }
}

/**
 * ExtendScript 함수 호출 (Promise)
 */
export function evalScript(script) {
  return new Promise((resolve, reject) => {
    try {
      const cs = getCSInterface();
      cs.evalScript(script, (result) => {
        if (result === "EvalScript error.") {
          reject(new Error(`ExtendScript 오류: ${script}`));
        } else {
          resolve(result);
        }
      });
    } catch (e) {
      reject(e);
    }
  });
}

/**
 * ExtendScript 함수 호출 + JSON 파싱
 */
export async function evalJSON(script) {
  await loadExtendScript();
  const result = await evalScript(script);
  
  if (!result || result === "undefined" || result === "null") {
    return null;
  }
  
  try {
    return JSON.parse(result);
  } catch (e) {
    console.warn("[CEP] JSON 파싱 실패:", result);
    return result;
  }
}

/**
 * 시퀀스 정보 가져오기
 */
export async function getActiveSequenceInfo() {
  return evalJSON("getActiveSequenceInfo()");
}

/**
 * 연결 테스트
 */
export async function testConnection() {
  await loadExtendScript();
  return evalScript("testConnection()");
}

/**
 * PluginData 폴더 경로 가져오기
 */
export function getPluginDataPath() {
  const cs = getCSInterface();
  const userDataPath = cs.getSystemPath(SystemPath.USER_DATA);
  const pluginPath = `${userDataPath}/videoPlus`;
  return pluginPath;
}

/**
 * 폴더 생성 (없으면)
 */
function ensureDir(dirPath) {
  const fs = require("fs");
  if (!fs.existsSync(dirPath)) {
    fs.mkdirSync(dirPath, { recursive: true });
  }
}

/**
 * 오디오 렌더링 (트랙 0번만)
 * @returns {Promise<{success: boolean, outputPath?: string, error?: string}>}
 */
export async function renderAudio() {
  // PluginData 폴더에 저장
  const pluginDataPath = getPluginDataPath();
  ensureDir(pluginDataPath);
  const outputPath = `${pluginDataPath}/videoplus_audio.wav`;
  return evalJSON(`renderAudio("${outputPath}")`);
}

/**
 * 파일을 ArrayBuffer로 읽기 (Node.js fs 사용)
 * @param {string} filePath
 * @returns {Promise<ArrayBuffer>}
 */
export function readFileAsArrayBuffer(filePath) {
  return new Promise((resolve, reject) => {
    try {
      // CEP에서 Node.js require 사용 가능
      const fs = require("fs");
      
      fs.readFile(filePath, (err, buffer) => {
        if (err) {
          reject(err);
          return;
        }
        // Node.js Buffer → ArrayBuffer
        const arrayBuffer = buffer.buffer.slice(
          buffer.byteOffset,
          buffer.byteOffset + buffer.byteLength
        );
        resolve(arrayBuffer);
      });
    } catch (e) {
      reject(e);
    }
  });
}

/**
 * 파일 삭제 (Node.js fs 사용)
 * @param {string} filePath
 */
export function deleteFile(filePath) {
  return new Promise((resolve) => {
    try {
      const fs = require("fs");
      fs.unlink(filePath, () => resolve());
    } catch (e) {
      resolve(); // 삭제 실패해도 무시
    }
  });
}

/**
 * 파일 복사 (Node.js fs 사용)
 * @param {string} src
 * @param {string} dest
 */
export function copyFile(src, dest) {
  return new Promise((resolve, reject) => {
    try {
      const fs = require("fs");
      fs.copyFile(src, dest, (err) => {
        if (err) reject(err);
        else resolve();
      });
    } catch (e) {
      reject(e);
    }
  });
}

/**
 * 오디오 렌더링 + ArrayBuffer 반환 (UXP renderAudioIMMEDIATELY와 동일한 인터페이스)
 * @returns {Promise<{arrayBuffer: ArrayBuffer, audioPath: string}>}
 */
export async function renderAudioAndRead() {
  // 1. 오디오 렌더링
  const result = await renderAudio();
  
  if (!result.success) {
    throw new Error(result.error || "렌더링 실패");
  }
  
  // 2. 파일을 ArrayBuffer로 읽기
  const arrayBuffer = await readFileAsArrayBuffer(result.outputPath);
  
  // 3. waveAudio.wav로 복사 (파형용 - 삭제 안 함)
  const pluginDataPath = getPluginDataPath();
  const waveAudioPath = `${pluginDataPath}/waveAudio.wav`;
  try {
    await copyFile(result.outputPath, waveAudioPath);
  } catch (e) {
    // 복사 실패해도 계속 진행
  }
  
  // 4. 원본 파일 삭제
  await deleteFile(result.outputPath);
  
  return { arrayBuffer, audioPath: waveAudioPath, waveAudioPath };
}

/**
 * 시퀀스 프레임레이트 가져오기
 */
export async function getSequenceFramerate() {
  return evalJSON("getSequenceFramerate()");
}

/**
 * 비디오 트랙 0번 클립 정보 가져오기
 */
export async function getVideoTrackItems() {
  return evalJSON("getVideoTrackItems()");
}

/**
 * 플레이헤드 위치 설정 (초 단위)
 */
export async function setPlayerPosition(seconds) {
  return evalJSON(`setPlayerPosition(${seconds})`);
}

/**
 * 플레이헤드 위치 설정 (tick 단위, 정밀도 손실 없음)
 */
export async function setPlayerPositionByTicks(ticks) {
  return evalJSON(`setPlayerPositionByTicks("${ticks}")`);
}

/**
 * 플레이헤드 위치 가져오기 (초 단위)
 */
export async function getPlayerPosition() {
  return evalJSON(`getPlayerPosition()`);
}

/**
 * 프로젝트 경로 가져오기
 */
export async function getProjectPath() {
  return evalJSON(`getProjectPath()`);
}

/**
 * 시퀀스 백업 (bin 폴더에 복제)
 */
export async function backupSequence(backupName) {
  const nameArg = backupName ? `"${backupName}"` : '""';
  return evalJSON(`backupSequence(${nameArg})`);
}

/**
 * 삭제된 단어 ID 저장 (XMP 메타데이터 - 백업 시퀀스에)
 * @param {string} backupId - 백업 UUID
 * @param {Array} sentences - 단어 데이터
 */
export async function saveWordsData(backupId, sentences) {
  try {
    // 삭제된 단어 및 문장 id 목록 추출
    const deletedWords = [];
    const deletedSentences = [];
    
    for (const sentence of sentences) {
      if (sentence.isDeleted && sentence.id) {
        deletedSentences.push(sentence.id);
      }
      if (sentence.words) {
        for (const word of sentence.words) {
          if (word.isDeleted && word.id) {
            deletedWords.push(word.id);
          }
        }
      }
    }
    
    const jsonData = JSON.stringify({ deletedWords, deletedSentences });
    
    // 백업 시퀀스의 sequenceId 찾기
    const backupSeqResult = await evalJSON(`getBackupSequenceId("${backupId}")`);
    if (!backupSeqResult?.success) {
      console.error("[saveWordsData] 백업 시퀀스 찾기 실패:", backupSeqResult?.error);
      return { success: false, error: backupSeqResult?.error };
    }
    
    const sequenceId = backupSeqResult.sequenceId;
    
    // XMP에 저장 (JSON 문자열 이스케이프)
    const escapedJson = jsonData.replace(/\\/g, '\\\\').replace(/"/g, '\\"');
    const result = await evalJSON(`saveWordsToSequence("${escapedJson}", "${sequenceId}")`);
    
    return result;
  } catch (e) {
    console.error("[saveWordsData] 예외:", e);
    return { success: false, error: e.message };
  }
}

/**
 * 삭제된 단어 ID 불러오기 (XMP 메타데이터 - 백업 시퀀스에서)
 * @param {string} backupId - 백업 UUID
 */
export async function loadWordsData(backupId) {
  try {
    // 백업 시퀀스의 sequenceId 찾기
    const backupSeqResult = await evalJSON(`getBackupSequenceId("${backupId}")`);
    if (!backupSeqResult?.success) {
      console.error("[loadWordsData] 백업 시퀀스 찾기 실패:", backupSeqResult?.error);
      return { success: false, error: backupSeqResult?.error };
    }
    
    const sequenceId = backupSeqResult.sequenceId;
    
    // XMP에서 읽기
    const result = await evalJSON(`loadWordsFromSequence("${sequenceId}")`);
    
    if (result?.success && result.data) {
      const deletedWords = result.data.deletedWords || [];
      const deletedSentences = result.data.deletedSentences || [];
      return { success: true, deletedWords, deletedSentences };
    }
    
    console.error("[loadWordsData] XMP 읽기 실패:", result?.error);
    return { success: false, error: result?.error || "데이터 없음" };
  } catch (e) {
    console.error("[loadWordsData] 예외:", e);
    return { success: false, error: e.message };
  }
}

/**
 * 백업 목록 가져오기
 */
export async function getBackupList() {
  return evalJSON(`getBackupList()`);
}

/**
 * 백업 시퀀스 열기
 */
export async function openBackupSequence(backupId) {
  return evalJSON(`openBackupSequence("${backupId}")`);
}

/**
 * 백업에서 완전 복원
 * - 백업 시퀀스 복제 → 원래 위치로 이동 → 원래 이름으로
 * - 현재 시퀀스는 Archive 폴더로 이동
 */
export async function restoreFromBackup(backupId) {
  return evalJSON(`restoreFromBackup("${backupId}")`);
}

/**
 * 시간 범위 삭제 (razor + ripple delete) - 단일 트랙
 * @param {string} startTicks - 시작 시간 (ticks 문자열)
 * @param {string} endTicks - 끝 시간 (ticks 문자열)
 * @param {number} trackIndex - 트랙 인덱스 (기본 0)
 */
export async function deleteTimeRange(startTicks, endTicks, trackIndex = 0) {
  return evalJSON(`deleteTimeRange("${startTicks}", "${endTicks}", ${trackIndex})`);
}

/**
 * QE razor로 모든 트랙에서 구간 삭제 (초 단위)
 * @param {number} startSec - 시작 시간 (초)
 * @param {number} endSec - 끝 시간 (초)
 */
export async function razorDeleteAllTracks(startSec, endSec) {
  return evalJSON(`razorDeleteAllTracks(${startSec}, ${endSec})`);
}

/**
 * QE razor로 모든 트랙에서 구간 삭제 (ticks 단위 - 정확)
 * @param {string} startTicks - 시작 시간 (ticks 문자열)
 * @param {string} endTicks - 끝 시간 (ticks 문자열)
 */
export async function razorDeleteAllTracksTicks(startTicks, endTicks) {
  return evalJSON(`razorDeleteAllTracksTicks("${startTicks}", "${endTicks}")`);
}

/**
 * 소스 미디어 시간 기준으로 단어 삭제
 * @param {string} sourceInPointTicks - 소스 미디어 시작 ticks
 * @param {string} sourceOutPointTicks - 소스 미디어 끝 ticks
 */
export async function deleteWordBySourceTicks(sourceInPointTicks, sourceOutPointTicks) {
  return evalJSON(`deleteWordBySourceTicks("${sourceInPointTicks}", "${sourceOutPointTicks}")`);
}

/**
 * 타임라인 위치 기준으로 단어 삭제 (연속 삭제 지원)
 * @param {string} timelineStartTicks - 타임라인 시작 ticks
 * @param {string} timelineEndTicks - 타임라인 끝 ticks
 */
export async function deleteWordByTimelineTicks(timelineStartTicks, timelineEndTicks) {
  return evalJSON(`deleteWordByTimelineTicks("${timelineStartTicks}", "${timelineEndTicks}")`);
}

/**
 * 단어 복원 (ticks 단위)
 * @param {string} startTicks - 원본 시작 ticks
 * @param {string} endTicks - 원본 끝 ticks
 * @param {string} gapTicks - 누적 gap ticks
 */
export async function restoreWordTicks(startTicks, endTicks, gapTicks) {
  return evalJSON(`restoreWordTicks("${startTicks}", "${endTicks}", "${gapTicks}")`);
}

/**
 * 단어 복원 (실제 razor 지점 ticks 사용)
 * @param {string} razorInPointTicks - razor 지점의 소스 미디어 inPoint
 * @param {string} razorOutPointTicks - razor 지점의 소스 미디어 outPoint
 */
export async function restoreWordByRazorTicks(razorInPointTicks, razorOutPointTicks) {
  return evalJSON(`restoreWordByRazorTicks("${razorInPointTicks}", "${razorOutPointTicks}")`);
}

/**
 * 단어 복원 (삭제 시 저장된 실제 ticks 사용) - 레거시
 * @param {string} leftOutPoint - 왼쪽 클립의 outPoint ticks
 * @param {string} rightInPoint - 오른쪽 클립의 inPoint ticks
 */
export async function restoreWordByActualTicks(leftOutPoint, rightInPoint) {
  return evalJSON(`restoreWordByActualTicks("${leftOutPoint}", "${rightInPoint}")`);
}

/**
 * 단어 복원 (projectItem.setInPoint/setOutPoint + overwriteClip 방식) - 레거시
 * @param {string} sourceInTicks - 복원할 구간의 소스 시작 ticks (= actualLeftOutPoint)
 * @param {string} sourceOutTicks - 복원할 구간의 소스 끝 ticks (= actualRightInPoint)
 * @param {string} durationTicks - 복원할 duration (ticks 문자열) - 정확한 BigInt 값
 */
export async function restoreWordByOverwrite(sourceInTicks, sourceOutTicks, durationTicks) {
  return evalJSON(`restoreWordByOverwrite("${sourceInTicks}", "${sourceOutTicks}", "${durationTicks}")`);
}

/**
 * 단어 복원 (timecode 기반 - 프레임 정렬된 소스 미디어 위치)
 * @param {string} sourceInTC - 단어 시작 timecode (= 왼쪽 클립의 outPoint)
 * @param {string} sourceOutTC - 단어 끝 timecode (= 오른쪽 클립의 inPoint)
 * @param {string} durationTC - 복원할 duration timecode
 * @param {string} timelinePositionTC - 타임라인 삽입 위치 timecode (insertClip 용)
 */
export async function restoreWordByTimecode(sourceInTC, sourceOutTC, durationTC, timelinePositionTC) {
  return evalJSON(`restoreWordByTimecode("${sourceInTC}", "${sourceOutTC}", "${durationTC}", "${timelinePositionTC}")`);
}

/**
 * Clone API 검사 (CEP ExtendScript에서 clone/duplicate 메서드 확인)
 */
export async function inspectCloneAPI() {
  return evalJSON("inspectCloneAPI()");
}

/**
 * executeCommand 메서드 확인
 */
export async function findExecuteCommand() {
  return evalJSON("findExecuteCommand()");
}

/**
 * Essential Sound / 프리셋 API 확인
 */
export async function inspectEssentialSound() {
  return evalJSON("inspectEssentialSound()");
}

/**
 * 시퀀스를 FCP XML로 익스포트
 * @param {string} outputPath - XML 파일 저장 경로
 */
export async function exportSequenceAsXML(outputPath) {
  return evalJSON(`exportSequenceAsXML("${outputPath.replace(/\\/g, "\\\\")}")`);
}

/**
 * XML 파일을 PPro에 임포트
 * @param {string} xmlPath - XML 파일 경로
 */
export async function importXMLSequence(xmlPath) {
  return evalJSON(`importXMLSequence("${xmlPath.replace(/\\/g, "\\\\")}")`);
}

/**
 * XML 파일을 PPro에 임포트하고 시퀀스 열기
 * @param {string} xmlPath - XML 파일 경로
 */
export async function importXMLAndOpen(xmlPath) {
  return evalJSON(`importXMLAndOpen("${xmlPath.replace(/\\/g, "\\\\")}")`);
}

/**
 * 시퀀스 ID로 시퀀스 열기
 */
export async function openSequenceById(sequenceId) {
  return evalJSON(`openSequenceById("${sequenceId}")`);
}

/**
 * 프로젝트의 모든 시퀀스 목록 가져오기
 */
export async function listSequences() {
  return evalJSON("listSequences()");
}

/**
 * XML 파일 읽기 (Node.js fs)
 */
export function readXMLFile(filePath) {
  return new Promise((resolve, reject) => {
    try {
      const fs = require("fs");
      fs.readFile(filePath, "utf8", (err, data) => {
        if (err) reject(err);
        else {
          // BOM 제거 + trim
          let cleaned = data;
          if (cleaned.charCodeAt(0) === 0xFEFF) {
            cleaned = cleaned.slice(1);
          }
          cleaned = cleaned.trim();
          // <?xml이 맨 앞에 오도록
          const xmlIndex = cleaned.indexOf("<?xml");
          if (xmlIndex > 0) {
            cleaned = cleaned.slice(xmlIndex);
          }
          resolve(cleaned);
        }
      });
    } catch (e) {
      reject(e);
    }
  });
}

/**
 * XML 파일 쓰기 (Node.js fs)
 */
export function writeXMLFile(filePath, content) {
  return new Promise((resolve, reject) => {
    try {
      const fs = require("fs");
      fs.writeFile(filePath, content, "utf8", (err) => {
        if (err) reject(err);
        else resolve(true);
      });
    } catch (e) {
      reject(e);
    }
  });
}

/**
 * Adjustment Layer 정보 가져오기
 */
export async function getAdjustmentLayerInfo() {
  return evalJSON("getAdjustmentLayerInfo()");
}

/**
 * Adjustment Layer 삽입
 * @param {string} filePath - adjustment_layers.json 파일 경로
 */
export async function insertAdjustmentLayers(filePath) {
  return evalJSON(`insertAdjustmentLayers('${filePath}')`);
}

/**
 * 재생/정지 토글
 */
export async function togglePlayback() {
  return evalJSON(`togglePlayback()`);
}

/**
 * 재생 상태 확인
 */
export async function isPlaying() {
  return evalJSON(`isPlaying()`);
}

/**
 * 모든 트랙 잠금/해제
 * @param {boolean} lock - true면 잠금, false면 해제
 */
export async function setAllTracksLocked(lock) {
  return evalJSON(`setAllTracksLocked(${lock})`);
}
