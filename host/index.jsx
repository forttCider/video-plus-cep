/**
 * videoPlus - ExtendScript (PPro CEP Host)
 * ES3 기반 - 세미콜론 필수, return 문 한 줄로
 */

// XMP 라이브러리 초기화
if (ExternalObject.AdobeXMPScript === undefined) {
    ExternalObject.AdobeXMPScript = new ExternalObject('lib:AdobeXMPScript');
}

var kPProPrivateProjectMetadataURI = "http://ns.adobe.com/premierePrivateProjectMetaData/1.0/";
var VIDEOPLUS_FIELD_NAME = "VideoPlusData";

function testConnection() {
    return "ExtendScript OK";
}

/**
 * 시퀀스에 단어 데이터 저장 (XMP 메타데이터)
 * @param {string} jsonData - JSON 문자열
 * @param {string} sequenceId - (선택) 특정 시퀀스 ID, 없으면 activeSequence
 */
function saveWordsToSequence(jsonData, sequenceId) {
    try {
        var seq = null;
        
        if (sequenceId) {
            // sequenceId로 시퀀스 찾기
            for (var i = 0; i < app.project.sequences.numSequences; i++) {
                if (app.project.sequences[i].sequenceID === sequenceId) {
                    seq = app.project.sequences[i];
                    break;
                }
            }
        } else {
            seq = app.project.activeSequence;
        }
        
        if (!seq || !seq.projectItem) {
            return '{"success":false,"error":"시퀀스를 찾을 수 없습니다"}';
        }
        
        // 스키마에 커스텀 필드 등록
        app.project.addPropertyToProjectMetadataSchema(VIDEOPLUS_FIELD_NAME, "VideoPlus Words Data", 2);
        
        // 현재 메타데이터 가져오기
        var projectMetadata = seq.projectItem.getProjectMetadata();
        var xmp = new XMPMeta(projectMetadata);
        
        // 값 설정
        xmp.setProperty(kPProPrivateProjectMetadataURI, VIDEOPLUS_FIELD_NAME, jsonData);
        
        // 저장
        seq.projectItem.setProjectMetadata(xmp.serialize(), [VIDEOPLUS_FIELD_NAME]);
        
        return '{"success":true}';
    } catch (e) {
        return '{"success":false,"error":"' + e.toString().replace(/"/g, '\\"') + '"}';
    }
}

/**
 * 시퀀스에서 단어 데이터 읽기 (XMP 메타데이터)
 * @param {string} sequenceId - (선택) 특정 시퀀스 ID, 없으면 activeSequence
 */
function loadWordsFromSequence(sequenceId) {
    try {
        var seq = null;
        
        if (sequenceId) {
            // sequenceId로 시퀀스 찾기
            for (var i = 0; i < app.project.sequences.numSequences; i++) {
                if (app.project.sequences[i].sequenceID === sequenceId) {
                    seq = app.project.sequences[i];
                    break;
                }
            }
        } else {
            seq = app.project.activeSequence;
        }
        
        if (!seq || !seq.projectItem) {
            return '{"success":false,"error":"시퀀스를 찾을 수 없습니다"}';
        }
        
        var projectMetadata = seq.projectItem.getProjectMetadata();
        var xmp = new XMPMeta(projectMetadata);
        
        // 필드 존재 여부 확인
        if (xmp.doesPropertyExist(kPProPrivateProjectMetadataURI, VIDEOPLUS_FIELD_NAME)) {
            var value = xmp.getProperty(kPProPrivateProjectMetadataURI, VIDEOPLUS_FIELD_NAME);
            // value.toString()이 JSON 문자열
            return '{"success":true,"data":' + value.toString() + '}';
        }
        
        return '{"success":false,"error":"저장된 데이터가 없습니다"}';
    } catch (e) {
        return '{"success":false,"error":"' + e.toString().replace(/"/g, '\\"') + '"}';
    }
}

function getProjectPath() {
    try {
        if (!app.project || !app.project.path) {
            return '{"success":false,"error":"프로젝트가 저장되지 않았습니다"}';
        }
        var projectPath = app.project.path;
        // 파일명 제거하고 폴더 경로만
        var folderPath = projectPath.substring(0, projectPath.lastIndexOf('/'));
        return '{"success":true,"path":"' + folderPath.replace(/\\/g, '/') + '"}';
    } catch (e) {
        return '{"success":false,"error":"' + e.toString().replace(/"/g, '\\"') + '"}';
    }
}

function importFileToBackup(filePath, backupId) {
    try {
        var rootItem = app.project.rootItem;
        var binName = "videoPlus Backups";
        var backupBin = null;
        
        // 백업 bin 찾기
        for (var i = 0; i < rootItem.children.numItems; i++) {
            var child = rootItem.children[i];
            if (child.name === binName && child.type === 2) {
                backupBin = child;
                break;
            }
        }
        
        if (!backupBin) return '{"success":false,"error":"백업 폴더 없음"}';
        
        // UUID 폴더 찾기
        var backupFolder = null;
        for (var j = 0; j < backupBin.children.numItems; j++) {
            var folder = backupBin.children[j];
            if (folder.name === backupId && folder.type === 2) {
                backupFolder = folder;
                break;
            }
        }
        
        if (!backupFolder) return '{"success":false,"error":"백업 폴더를 찾을 수 없음: ' + backupId + '"}';
        
        // 파일 import
        var importResult = app.project.importFiles([filePath], true, backupFolder, false);
        
        if (importResult) {
            return '{"success":true}';
        } else {
            return '{"success":false,"error":"파일 import 실패"}';
        }
    } catch (e) {
        return '{"success":false,"error":"' + e.toString().replace(/"/g, '\\"') + '"}';
    }
}

function getBackupWordsPath(backupId) {
    try {
        var rootItem = app.project.rootItem;
        var binName = "videoPlus Backups";
        var backupBin = null;
        
        // 백업 bin 찾기
        for (var i = 0; i < rootItem.children.numItems; i++) {
            var child = rootItem.children[i];
            if (child.name === binName && child.type === 2) {
                backupBin = child;
                break;
            }
        }
        
        if (!backupBin) return '{"success":false,"error":"백업 폴더 없음"}';
        
        // UUID 폴더 찾기
        var backupFolder = null;
        for (var j = 0; j < backupBin.children.numItems; j++) {
            var folder = backupBin.children[j];
            if (folder.name === backupId && folder.type === 2) {
                backupFolder = folder;
                break;
            }
        }
        
        if (!backupFolder) return '{"success":false,"error":"백업 폴더를 찾을 수 없음"}';
        
        // .srt 파일 찾기
        for (var k = 0; k < backupFolder.children.numItems; k++) {
            var item = backupFolder.children[k];
            if (item.name && item.name.indexOf('.srt') !== -1) {
                var mediaPath = item.getMediaPath ? item.getMediaPath() : null;
                if (mediaPath) {
                    return '{"success":true,"path":"' + mediaPath.replace(/\\/g, '/') + '"}';
                }
            }
        }
        
        return '{"success":false,"error":"단어 데이터 파일을 찾을 수 없음"}';
    } catch (e) {
        return '{"success":false,"error":"' + e.toString().replace(/"/g, '\\"') + '"}';
    }
}

function getActiveSequenceInfo() {
    try {
        if (!app) return '{"error":"app 없음"}';
        if (!app.project) return '{"error":"project 없음"}';
        var seq = app.project.activeSequence;
        if (!seq) return '{"error":"시퀀스를 열어주세요"}';
        return '{"name":"' + seq.name + '","id":"' + seq.sequenceID + '"}';
    } catch (e) {
        return '{"error":"' + e.toString() + '"}';
    }
}

function ticksToSeconds(ticks) {
    return parseFloat(ticks) / 254016000000;
}

function secondsToTicks(seconds) {
    return Math.round(seconds * 254016000000);
}

function ticksToTimecode(ticks) {
    var seq = app.project.activeSequence;
    var fps = 30;
    if (seq && seq.timebase) {
        fps = Math.round(254016000000 / parseInt(seq.timebase));
    }
    var ticksNum = parseFloat(ticks);
    var ticksPerFrame = 254016000000 / fps;
    var totalFrames = Math.floor(ticksNum / ticksPerFrame);  // 내림 (floor)으로 통일
    var frames = totalFrames % fps;
    var totalSeconds = Math.floor(totalFrames / fps);
    var seconds = totalSeconds % 60;
    var totalMinutes = Math.floor(totalSeconds / 60);
    var minutes = totalMinutes % 60;
    var hours = Math.floor(totalMinutes / 60);
    function pad(n) { var s = String(n); while (s.length < 2) s = '0' + s; return s; }
    return pad(hours) + ':' + pad(minutes) + ':' + pad(seconds) + ':' + pad(frames);
}

function timecodeToTicks(timecode) {
    var seq = app.project.activeSequence;
    var fps = 30;
    if (seq && seq.timebase) {
        fps = Math.round(254016000000 / parseInt(seq.timebase));
    }
    var parts = timecode.split(':');
    var hours = parseInt(parts[0], 10);
    var minutes = parseInt(parts[1], 10);
    var seconds = parseInt(parts[2], 10);
    var frames = parseInt(parts[3], 10);
    var totalFrames = frames + (seconds * fps) + (minutes * 60 * fps) + (hours * 3600 * fps);
    var ticksPerFrame = 254016000000 / fps;
    return String(Math.round(totalFrames * ticksPerFrame));
}

function getVideoTrackItems() {
    try {
        var seq = app.project.activeSequence;
        if (!seq) return '{"error":"시퀀스 없음"}';
        if (seq.videoTracks.numTracks === 0) return '{"error":"비디오 트랙 없음"}';
        var track = seq.videoTracks[0];
        var clips = track.clips;
        var result = '{"items":[';
        for (var i = 0; i < clips.numItems; i++) {
            if (i > 0) result += ',';
            var clip = clips[i];
            result += '{';
            result += '"index":' + i + ',';
            result += '"startTime":' + clip.start.seconds + ',';
            result += '"endTime":' + clip.end.seconds + ',';
            result += '"inPoint":' + clip.inPoint.seconds + ',';
            result += '"outPoint":' + clip.outPoint.seconds + ',';
            result += '"startTicks":"' + clip.start.ticks + '",';
            result += '"endTicks":"' + clip.end.ticks + '",';
            result += '"inPointTicks":"' + clip.inPoint.ticks + '",';
            result += '"outPointTicks":"' + clip.outPoint.ticks + '"';
            result += '}';
        }
        result += ']}';
        return result;
    } catch (e) {
        return '{"error":"' + e.toString() + '"}';
    }
}

function setPlayerPosition(seconds) {
    try {
        var seq = app.project.activeSequence;
        if (!seq) return '{"success":false,"error":"시퀀스 없음"}';
        var ticks = secondsToTicks(seconds);
        seq.setPlayerPosition(ticks.toString());
        return '{"success":true}';
    } catch (e) {
        return '{"success":false,"error":"' + e.toString() + '"}';
    }
}

function setPlayerPositionByTicks(ticks) {
    try {
        var seq = app.project.activeSequence;
        if (!seq) return '{"success":false,"error":"시퀀스 없음"}';
        seq.setPlayerPosition(ticks);
        return '{"success":true}';
    } catch (e) {
        return '{"success":false,"error":"' + e.toString() + '"}';
    }
}

function getPlayerPosition() {
    try {
        var seq = app.project.activeSequence;
        if (!seq) return '{"success":false,"error":"시퀀스 없음"}';
        var ticks = seq.getPlayerPosition().ticks;
        var seconds = parseFloat(ticks) / 254016000000;
        return '{"success":true,"seconds":' + seconds + ',"ticks":"' + ticks + '"}';
    } catch (e) {
        return '{"success":false,"error":"' + e.toString() + '"}';
    }
}

function razorAllTracks(timecode) {
    try {
        app.enableQE();
        var qeSeq = qe.project.getActiveSequence();
        if (!qeSeq) return '{"success":false,"error":"QE 시퀀스 없음"}';
        var videoCount = qeSeq.numVideoTracks;
        var audioCount = qeSeq.numAudioTracks;
        for (var v = 0; v < videoCount; v++) {
            var vTrack = qeSeq.getVideoTrackAt(v);
            if (vTrack) { try { vTrack.razor(timecode); } catch (e) {} }
        }
        for (var a = 0; a < audioCount; a++) {
            var aTrack = qeSeq.getAudioTrackAt(a);
            if (aTrack) { try { aTrack.razor(timecode); } catch (e) {} }
        }
        return '{"success":true,"timecode":"' + timecode + '"}';
    } catch (e) {
        return '{"success":false,"error":"' + e.toString() + '"}';
    }
}

// 이진 탐색으로 해당 시간 근처의 클립 인덱스 찾기
function findClipIndexNear(track, targetTicks) {
    var numClips = track.clips.numItems;
    if (numClips === 0) return -1;
    
    var target = parseFloat(targetTicks);
    var low = 0;
    var high = numClips - 1;
    
    while (low <= high) {
        var mid = Math.floor((low + high) / 2);
        var clip = track.clips[mid];
        var clipStart = parseFloat(clip.start.ticks);
        var clipEnd = parseFloat(clip.end.ticks);
        
        if (target >= clipStart && target < clipEnd) {
            return mid; // 정확히 포함
        } else if (target < clipStart) {
            high = mid - 1;
        } else {
            low = mid + 1;
        }
    }
    
    // 못 찾으면 가장 가까운 인덱스 반환 (low)
    return Math.min(low, numClips - 1);
}

// 최적화된 razor - 이진 탐색 + 주변 N개만 확인
function razorTracksAtTime(timecode, targetTicks) {
    try {
        app.enableQE();
        var seq = app.project.activeSequence;
        var qeSeq = qe.project.getActiveSequence();
        if (!seq || !qeSeq) return '{"success":false,"error":"시퀀스 없음"}';
        
        var target = parseFloat(targetTicks);
        var tolerance = 1000000000; // 약 4ms
        var SEARCH_RANGE = 5; // 앞뒤로 5개씩만 확인
        
        // 비디오 트랙
        for (var v = 0; v < seq.videoTracks.numTracks; v++) {
            var vt = seq.videoTracks[v];
            if (vt.clips.numItems === 0) continue;
            
            var nearIdx = findClipIndexNear(vt, targetTicks);
            var startIdx = Math.max(0, nearIdx - SEARCH_RANGE);
            var endIdx = Math.min(vt.clips.numItems - 1, nearIdx + SEARCH_RANGE);
            
            for (var j = startIdx; j <= endIdx; j++) {
                var c = vt.clips[j];
                var cStart = parseFloat(c.start.ticks);
                var cEnd = parseFloat(c.end.ticks);
                if (cStart <= target + tolerance && cEnd >= target - tolerance) {
                    var qeTrack = qeSeq.getVideoTrackAt(v);
                    if (qeTrack) { try { qeTrack.razor(timecode); } catch (e) {} }
                    break;
                }
            }
        }
        
        // 오디오 트랙
        for (var a = 0; a < seq.audioTracks.numTracks; a++) {
            var at = seq.audioTracks[a];
            if (at.clips.numItems === 0) continue;
            
            var nearIdxA = findClipIndexNear(at, targetTicks);
            var startIdxA = Math.max(0, nearIdxA - SEARCH_RANGE);
            var endIdxA = Math.min(at.clips.numItems - 1, nearIdxA + SEARCH_RANGE);
            
            for (var k = startIdxA; k <= endIdxA; k++) {
                var ac = at.clips[k];
                var acStart = parseFloat(ac.start.ticks);
                var acEnd = parseFloat(ac.end.ticks);
                if (acStart <= target + tolerance && acEnd >= target - tolerance) {
                    var qeATrack = qeSeq.getAudioTrackAt(a);
                    if (qeATrack) { try { qeATrack.razor(timecode); } catch (e) {} }
                    break;
                }
            }
        }
        
        return '{"success":true}';
    } catch (e) {
        return '{"success":false,"error":"' + e.toString() + '"}';
    }
}

function deleteWordByTimelineTicks(timelineStartTicks, timelineEndTicks) {
    try {
        app.enableQE();
        var seq = app.project.activeSequence;
        if (!seq) return '{"success":false,"error":"시퀀스 없음"}';
        var qeSeq = qe.project.getActiveSequence();
        if (!qeSeq) return '{"success":false,"error":"QE 시퀀스 없음"}';

        var startTC = ticksToTimecode(timelineStartTicks);
        var endTC = ticksToTimecode(timelineEndTicks);

        // 최적화: 해당 시간에 클립이 있는 트랙만 razor
        razorTracksAtTime(startTC, timelineStartTicks);
        razorTracksAtTime(endTC, timelineEndTicks);

        var razorStartTicks = timecodeToTicks(startTC);
        var razorEndTicks = timecodeToTicks(endTC);
        var razorStart = parseFloat(razorStartTicks);
        var razorEnd = parseFloat(razorEndTicks);

        var actualLeftOutPoint = "";
        var actualRightInPoint = "";
        var deletedCount = 0;
        var SEARCH_RANGE = 5;
        var tolerance = 1000000000;

        // 비디오 트랙 - 이진 탐색 최적화
        for (var v = 0; v < seq.videoTracks.numTracks; v++) {
            var vt = seq.videoTracks[v];
            if (vt.clips.numItems === 0) continue;
            
            var nearIdx = findClipIndexNear(vt, timelineStartTicks);
            var startIdx = Math.max(0, nearIdx - SEARCH_RANGE);
            var endIdx = Math.min(vt.clips.numItems - 1, nearIdx + SEARCH_RANGE);
            
            // 역순으로 삭제 (인덱스 꼬임 방지)
            for (var j = endIdx; j >= startIdx; j--) {
                var c = vt.clips[j];
                var cStart = parseFloat(c.start.ticks);
                var cEnd = parseFloat(c.end.ticks);
                if (cStart >= razorStart - tolerance && cEnd <= razorEnd + tolerance) {
                    if (v === 0) {
                        if (j > 0) {
                            actualLeftOutPoint = vt.clips[j - 1].outPoint.ticks;
                        }
                        if (j + 1 < vt.clips.numItems) {
                            var nextClip = vt.clips[j + 1];
                            var deletedOutPoint = c.outPoint.ticks;
                            var nextInPoint = nextClip.inPoint.ticks;
                            if (deletedOutPoint === nextInPoint) {
                                actualRightInPoint = nextInPoint;
                            }
                        }
                    }
                    c.remove(true, true);
                    deletedCount++;
                }
            }
        }

        // 오디오 트랙 - 이진 탐색 최적화
        for (var a = 0; a < seq.audioTracks.numTracks; a++) {
            var at = seq.audioTracks[a];
            if (at.clips.numItems === 0) continue;
            
            var nearIdxA = findClipIndexNear(at, timelineStartTicks);
            var startIdxA = Math.max(0, nearIdxA - SEARCH_RANGE);
            var endIdxA = Math.min(at.clips.numItems - 1, nearIdxA + SEARCH_RANGE);
            
            for (var k = endIdxA; k >= startIdxA; k--) {
                var ac = at.clips[k];
                var acStart = parseFloat(ac.start.ticks);
                var acEnd = parseFloat(ac.end.ticks);
                if (acStart >= razorStart - tolerance && acEnd <= razorEnd + tolerance) {
                    ac.remove(true, true);
                    deletedCount++;
                }
            }
        }

        // 삭제된 클립이 없으면 실패로 처리
        if (deletedCount === 0) {
            return '{"success":false,"error":"삭제할 클립을 찾지 못함","deletedClips":0,"requestedStart":"' + timelineStartTicks + '","requestedEnd":"' + timelineEndTicks + '","razorStart":"' + razorStartTicks + '","razorEnd":"' + razorEndTicks + '"}';
        }
        // 실제 삭제된 tick 범위도 반환
        var actualDuration = razorEndTicks - razorStartTicks;
        return '{"success":true,"deletedClips":' + deletedCount + ',"actualLeftOutPoint":"' + actualLeftOutPoint + '","actualRightInPoint":"' + actualRightInPoint + '","razorStart":"' + razorStartTicks + '","razorEnd":"' + razorEndTicks + '","actualDuration":"' + actualDuration + '"}';
    } catch (e) {
        return '{"success":false,"error":"' + e.toString().replace(/"/g, '\\"') + '"}';
    }
}

function deleteWordBySourceTicks(sourceInPointTicks, sourceOutPointTicks) {
    try {
        app.enableQE();
        var seq = app.project.activeSequence;
        if (!seq) return '{"success":false,"error":"시퀀스 없음"}';
        var qeSeq = qe.project.getActiveSequence();
        if (!qeSeq) return '{"success":false,"error":"QE 시퀀스 없음"}';

        var sourceIn = parseFloat(sourceInPointTicks);
        var sourceOut = parseFloat(sourceOutPointTicks);

        var vTrack = seq.videoTracks[0];
        var targetClip = null;
        for (var i = 0; i < vTrack.clips.numItems; i++) {
            var clip = vTrack.clips[i];
            var clipInPoint = parseFloat(clip.inPoint.ticks);
            var clipOutPoint = parseFloat(clip.outPoint.ticks);
            if (clipInPoint <= sourceOut && clipOutPoint >= sourceOut) {
                targetClip = clip;
                if (sourceIn < clipInPoint) sourceIn = clipInPoint;
                break;
            }
        }

        if (!targetClip) return '{"success":false,"error":"클립 없음"}';

        // === 삭제 전 클립 상태 ===
        var beforeClips = "";
        for (var bi = 0; bi < vTrack.clips.numItems; bi++) {
            var bc = vTrack.clips[bi];
            beforeClips += "{" + bi + ":" + bc.inPoint.ticks + "-" + bc.outPoint.ticks + "}";
        }

        var clipStart = parseFloat(targetClip.start.ticks);
        var clipInPoint = parseFloat(targetClip.inPoint.ticks);
        var timelineStartTicks = clipStart + (sourceIn - clipInPoint);
        var timelineEndTicks = clipStart + (sourceOut - clipInPoint);

        var startTC = ticksToTimecode(timelineStartTicks.toString());
        var endTC = ticksToTimecode(timelineEndTicks.toString());

        razorAllTracks(startTC);
        razorAllTracks(endTC);

        // === razor 후 클립 상태 ===
        var afterRazorClips = "";
        for (var ari = 0; ari < vTrack.clips.numItems; ari++) {
            var arc = vTrack.clips[ari];
            afterRazorClips += "{" + ari + ":" + arc.inPoint.ticks + "-" + arc.outPoint.ticks + "}";
        }

        var razorStartTicks = timecodeToTicks(startTC);
        var razorEndTicks = timecodeToTicks(endTC);
        var razorStart = parseFloat(razorStartTicks);
        var razorEnd = parseFloat(razorEndTicks);

        var actualLeftOutPoint = "";
        var actualRightInPoint = "";
        var deletedCount = 0;

        for (var v = 0; v < seq.videoTracks.numTracks; v++) {
            var vt = seq.videoTracks[v];
            for (var j = vt.clips.numItems - 1; j >= 0; j--) {
                var c = vt.clips[j];
                var cStart = parseFloat(c.start.ticks);
                var cEnd = parseFloat(c.end.ticks);
                if (cStart >= razorStart - 1000000000 && cEnd <= razorEnd + 1000000000) {
                    if (v === 0) {
                        // 왼쪽 클립
                        if (j > 0) {
                            actualLeftOutPoint = vt.clips[j - 1].outPoint.ticks;
                        }
                        // 오른쪽 클립: 소스 미디어상 연속인지 확인
                        if (j + 1 < vt.clips.numItems) {
                            var nextClip2 = vt.clips[j + 1];
                            var deletedOutPoint2 = c.outPoint.ticks;
                            var nextInPoint2 = nextClip2.inPoint.ticks;
                            if (deletedOutPoint2 === nextInPoint2) {
                                actualRightInPoint = nextInPoint2;
                            }
                        }
                    }
                    c.remove(true, true);
                    deletedCount++;
                }
            }
        }

        for (var a = 0; a < seq.audioTracks.numTracks; a++) {
            var at = seq.audioTracks[a];
            for (var k = at.clips.numItems - 1; k >= 0; k--) {
                var ac = at.clips[k];
                var acStart = parseFloat(ac.start.ticks);
                var acEnd = parseFloat(ac.end.ticks);
                if (acStart >= razorStart - 1000000000 && acEnd <= razorEnd + 1000000000) {
                    ac.remove(true, true);
                    deletedCount++;
                }
            }
        }

        // === 삭제 후 클립 상태 ===
        var afterDeleteClips = "";
        for (var adi = 0; adi < vTrack.clips.numItems; adi++) {
            var adc = vTrack.clips[adi];
            afterDeleteClips += "{" + adi + ":" + adc.inPoint.ticks + "-" + adc.outPoint.ticks + "}";
        }

        return '{"success":true,"deletedClips":' + deletedCount + ',"actualLeftOutPoint":"' + actualLeftOutPoint + '","actualRightInPoint":"' + actualRightInPoint + '","debug":{"sourceIn":"' + sourceInPointTicks + '","sourceOut":"' + sourceOutPointTicks + '","razorStart":"' + razorStartTicks + '","razorEnd":"' + razorEndTicks + '","beforeClips":"' + beforeClips + '","afterRazor":"' + afterRazorClips + '","afterDelete":"' + afterDeleteClips + '"}}';
    } catch (e) {
        return '{"success":false,"error":"' + e.toString().replace(/"/g, '\\"') + '"}';
    }
}

function restoreWordByActualTicks(leftOutPoint, rightInPoint) {
    try {
        var seq = app.project.activeSequence;
        if (!seq) return '{"success":false,"error":"시퀀스 없음"}';

        leftOutPoint = leftOutPoint ? String(leftOutPoint) : null;
        rightInPoint = rightInPoint ? String(rightInPoint) : null;

        var vTrack = seq.videoTracks[0];
        var leftClip = null;
        var rightClip = null;
        var leftIdx = -1;
        var rightIdx = -1;

        for (var i = 0; i < vTrack.clips.numItems; i++) {
            var clip = vTrack.clips[i];
            if (leftOutPoint && String(clip.outPoint.ticks) === leftOutPoint) {
                leftClip = clip;
                leftIdx = i;
            }
            if (rightInPoint && String(clip.inPoint.ticks) === rightInPoint) {
                rightClip = clip;
                rightIdx = i;
            }
        }

        var restored = false;

        if (leftClip && rightClip && leftIdx !== rightIdx && leftIdx + 1 === rightIdx) {
            for (var v = 0; v < seq.videoTracks.numTracks; v++) {
                var vt = seq.videoTracks[v];
                if (leftIdx >= vt.clips.numItems || rightIdx >= vt.clips.numItems) continue;
                var vLeftClip = vt.clips[leftIdx];
                var vRightClip = vt.clips[rightIdx];
                if (!vLeftClip || !vRightClip) continue;
                var vTargetEndTicks = vRightClip.end.ticks;
                var vTargetOutTicks = vRightClip.outPoint.ticks;
                vRightClip.remove(false, true);
                var vNewEnd = vLeftClip.end;
                vNewEnd.ticks = String(vTargetEndTicks);
                vLeftClip.end = vNewEnd;
                var vNewOut = vLeftClip.outPoint;
                vNewOut.ticks = String(vTargetOutTicks);
                vLeftClip.outPoint = vNewOut;
            }
            for (var a = 0; a < seq.audioTracks.numTracks; a++) {
                var aTrack = seq.audioTracks[a];
                if (rightIdx >= aTrack.clips.numItems) continue;
                var aLeftClip = aTrack.clips[leftIdx];
                var aRightClip = aTrack.clips[rightIdx];
                if (!aLeftClip || !aRightClip) continue;
                var aTargetEndTicks = aRightClip.end.ticks;
                var aTargetOutTicks = aRightClip.outPoint.ticks;
                aRightClip.remove(false, true);
                var aNewEnd = aLeftClip.end;
                aNewEnd.ticks = String(aTargetEndTicks);
                aLeftClip.end = aNewEnd;
                var aNewOut = aLeftClip.outPoint;
                aNewOut.ticks = String(aTargetOutTicks);
                aLeftClip.outPoint = aNewOut;
            }
            restored = true;
        }

        return '{"success":' + restored + ',"leftFound":' + (leftClip !== null) + ',"rightFound":' + (rightClip !== null) + '}';
    } catch (e) {
        return '{"success":false,"error":"' + e.toString().replace(/"/g, '\\"') + '"}';
    }
}

function restoreWordByOverwrite(sourceInTicks, sourceOutTicks, durationTicks) {
    try {
        var seq = app.project.activeSequence;
        if (!seq) return '{"success":false,"error":"시퀀스 없음"}';

        // 클라이언트에서 이미 프레임 반올림됨 (BigInt로 정확하게)
        var vTrack = seq.videoTracks[0];
        if (!vTrack || vTrack.clips.numItems === 0) return '{"success":false,"error":"비디오 트랙 없음"}';

        var leftClip = null;
        var rightClip = null;
        var leftIdx = -1;
        var rightIdx = -1;

        // === 클립 inPoint/outPoint 로그 ===
        var clipsLog = "";
        for (var i = 0; i < vTrack.clips.numItems; i++) {
            var clip = vTrack.clips[i];
            var clipIn = String(clip.inPoint.ticks);
            var clipOut = String(clip.outPoint.ticks);
            clipsLog += "clip[" + i + "] inPoint=" + clipIn + " outPoint=" + clipOut + "; ";
            // 왼쪽 클립: outPoint === sourceIn (클라이언트에서 이미 프레임 반올림됨)
            if (clipOut === sourceInTicks) {
                leftClip = clip;
                leftIdx = i;
                clipsLog += "(LEFT) ";
            }
            // 오른쪽 클립: inPoint === sourceOut (클라이언트에서 이미 프레임 반올림됨)
            if (clipIn === sourceOutTicks) {
                rightClip = clip;
                rightIdx = i;
                clipsLog += "(RIGHT) ";
            }
        }
        
        var debugInfo = "sourceIn=" + sourceInTicks + " | sourceOut=" + sourceOutTicks + " | " + clipsLog;

        var method = "none";

        // 케이스 1: 둘 다 있고 소스 미디어상 연속 → merge
        // 연속 조건: 왼쪽 outPoint + 삭제 구간 = 오른쪽 inPoint
        var isContiguous = false;
        var deletedDuration = parseFloat(sourceOutTicks) - parseFloat(sourceInTicks);
        
        if (leftClip && rightClip) {
            var leftOut = parseFloat(leftClip.outPoint.ticks);
            var rightIn = parseFloat(rightClip.inPoint.ticks);
            // 왼쪽 outPoint가 sourceIn이고, 오른쪽 inPoint가 sourceOut이면
            // 삭제된 구간이 정확히 leftOut ~ rightIn 사이
            // 즉 leftOut + deletedDuration = rightIn 이어야 연속
            if (Math.abs((leftOut + deletedDuration) - rightIn) < 254016000) { // 1ms 오차 허용
                isContiguous = true;
            }
        }
        
        if (leftClip && rightClip && leftIdx + 1 === rightIdx && isContiguous) {
            method = "merge";
            // 모든 비디오 트랙 처리
            for (var v = 0; v < seq.videoTracks.numTracks; v++) {
                var vt = seq.videoTracks[v];
                if (leftIdx >= vt.clips.numItems || rightIdx >= vt.clips.numItems) continue;
                var vLeftClip = vt.clips[leftIdx];
                var vRightClip = vt.clips[rightIdx];
                if (!vLeftClip || !vRightClip) continue;
                var vTargetEndTicks = vRightClip.end.ticks;
                var vTargetOutTicks = vRightClip.outPoint.ticks;
                vRightClip.remove(false, true);
                var vNewEnd = vLeftClip.end;
                vNewEnd.ticks = String(vTargetEndTicks);
                vLeftClip.end = vNewEnd;
                var vNewOut = vLeftClip.outPoint;
                vNewOut.ticks = String(vTargetOutTicks);
                vLeftClip.outPoint = vNewOut;
            }
            // 모든 오디오 트랙 처리
            for (var a = 0; a < seq.audioTracks.numTracks; a++) {
                var aTrack = seq.audioTracks[a];
                if (rightIdx >= aTrack.clips.numItems) continue;
                var aLeftClip = aTrack.clips[leftIdx];
                var aRightClip = aTrack.clips[rightIdx];
                if (!aLeftClip || !aRightClip) continue;
                var aTargetEndTicks = aRightClip.end.ticks;
                var aTargetOutTicks = aRightClip.outPoint.ticks;
                aRightClip.remove(false, true);
                var aNewEnd = aLeftClip.end;
                aNewEnd.ticks = String(aTargetEndTicks);
                aLeftClip.end = aNewEnd;
                var aNewOut = aLeftClip.outPoint;
                aNewOut.ticks = String(aTargetOutTicks);
                aLeftClip.outPoint = aNewOut;
            }
        }
        // 케이스 2: 왼쪽만 있음 → 뒤 클립들 밀고 왼쪽 확장
        else if (leftClip && !rightClip) {
            method = "extendRight";
            // leftClip의 타임라인 위치 기준 (다른 트랙 매칭용)
            var refEndTicks2 = parseFloat(leftClip.end.ticks);
            var refStartSec2 = leftClip.start.seconds;
            var refEndSec2 = leftClip.end.seconds;
            // durationTicks를 client에서 전달받음 (정확한 BigInt 값)
            var extendTicks = parseFloat(durationTicks);
            var extendSec = ticksToSeconds(extendTicks);
            
            // 1단계: 모든 트랙에서 refEnd 이후 클립들을 뒤로 밀기
            // move()는 상대 이동! move(0.5) = 현재 위치 + 0.5초
            var movedCount = 0;
            for (var v2a = 0; v2a < seq.videoTracks.numTracks; v2a++) {
                var vTrack2a = seq.videoTracks[v2a];
                for (var vi2a = vTrack2a.clips.numItems - 1; vi2a >= 0; vi2a--) {
                    var vClip2a = vTrack2a.clips[vi2a];
                    // 타임라인 위치로 비교: leftClip.end 이후에 시작하는 클립만
                    if (parseFloat(vClip2a.start.ticks) >= refEndTicks2) {
                        vClip2a.move(extendSec);
                        movedCount++;
                    }
                }
            }
            for (var a2a = 0; a2a < seq.audioTracks.numTracks; a2a++) {
                var aTrack2a = seq.audioTracks[a2a];
                for (var ai2a = aTrack2a.clips.numItems - 1; ai2a >= 0; ai2a--) {
                    var aClip2a = aTrack2a.clips[ai2a];
                    if (parseFloat(aClip2a.start.ticks) >= refEndTicks2) {
                        aClip2a.move(extendSec);
                        movedCount++;
                    }
                }
            }
            
            // 2단계: 같은 타임라인 위치의 클립들 확장 (타임라인 위치로 매칭)
            for (var v2b = 0; v2b < seq.videoTracks.numTracks; v2b++) {
                var vTrack2b = seq.videoTracks[v2b];
                for (var vi2b = 0; vi2b < vTrack2b.clips.numItems; vi2b++) {
                    var vClip2b = vTrack2b.clips[vi2b];
                    // 타임라인 위치로 매칭 (0.05초 오차)
                    if (Math.abs(vClip2b.start.seconds - refStartSec2) < 0.05 && 
                        Math.abs(vClip2b.end.seconds - refEndSec2) < 0.05) {
                        var vNewEnd2 = vClip2b.end;
                        vNewEnd2.ticks = String(parseFloat(vClip2b.end.ticks) + extendTicks);
                        vClip2b.end = vNewEnd2;
                        var vNewOut2 = vClip2b.outPoint;
                        vNewOut2.ticks = String(parseFloat(vClip2b.outPoint.ticks) + extendTicks);
                        vClip2b.outPoint = vNewOut2;
                        break;
                    }
                }
            }
            for (var a2b = 0; a2b < seq.audioTracks.numTracks; a2b++) {
                var aTrack2b = seq.audioTracks[a2b];
                for (var ai2b = 0; ai2b < aTrack2b.clips.numItems; ai2b++) {
                    var aClip2b = aTrack2b.clips[ai2b];
                    if (Math.abs(aClip2b.start.seconds - refStartSec2) < 0.05 && 
                        Math.abs(aClip2b.end.seconds - refEndSec2) < 0.05) {
                        var aNewEnd2 = aClip2b.end;
                        aNewEnd2.ticks = String(parseFloat(aClip2b.end.ticks) + extendTicks);
                        aClip2b.end = aNewEnd2;
                        var aNewOut2 = aClip2b.outPoint;
                        aNewOut2.ticks = String(parseFloat(aClip2b.outPoint.ticks) + extendTicks);
                        aClip2b.outPoint = aNewOut2;
                        break;
                    }
                }
            }
        }
        // 케이스 3: 오른쪽만 있음 → 오른쪽 클립 포함 뒤로 밀고, 앞으로 확장
        else if (!leftClip && rightClip) {
            method = "extendLeft";
            var refStartTicks3 = parseFloat(rightClip.start.ticks);
            var refStartSec3 = rightClip.start.seconds;
            var refEndSec3 = rightClip.end.seconds;
            // durationTicks를 client에서 전달받음 (정확한 BigInt 값)
            var extendTicks3 = parseFloat(durationTicks);
            var extendSec3 = ticksToSeconds(extendTicks3);
            
            // 1단계: rightClip 포함 뒤 클립들을 뒤로 밀기 (공간 확보)
            // move()는 상대 이동! move(0.5) = 현재 위치 + 0.5초
            for (var v3a = 0; v3a < seq.videoTracks.numTracks; v3a++) {
                var vTrack3a = seq.videoTracks[v3a];
                for (var vi3a = vTrack3a.clips.numItems - 1; vi3a >= 0; vi3a--) {
                    var vClip3a = vTrack3a.clips[vi3a];
                    // rightClip.start 이후 (포함) 클립들 밀기
                    if (parseFloat(vClip3a.start.ticks) >= refStartTicks3) {
                        vClip3a.move(extendSec3);
                    }
                }
            }
            for (var a3a = 0; a3a < seq.audioTracks.numTracks; a3a++) {
                var aTrack3a = seq.audioTracks[a3a];
                for (var ai3a = aTrack3a.clips.numItems - 1; ai3a >= 0; ai3a--) {
                    var aClip3a = aTrack3a.clips[ai3a];
                    if (parseFloat(aClip3a.start.ticks) >= refStartTicks3) {
                        aClip3a.move(extendSec3);
                    }
                }
            }
            
            // 2단계: 같은 타임라인 위치 클립들 앞으로 확장 (move 후 위치 변경됨)
            var newRefStartSec3 = refStartSec3 + extendSec3;
            var newRefEndSec3 = refEndSec3 + extendSec3;
            
            for (var v3b = 0; v3b < seq.videoTracks.numTracks; v3b++) {
                var vTrack3b = seq.videoTracks[v3b];
                for (var vi3b = 0; vi3b < vTrack3b.clips.numItems; vi3b++) {
                    var vClip3b = vTrack3b.clips[vi3b];
                    if (Math.abs(vClip3b.start.seconds - newRefStartSec3) < 0.05 && 
                        Math.abs(vClip3b.end.seconds - newRefEndSec3) < 0.05) {
                        var vNewStart3 = vClip3b.start;
                        vNewStart3.ticks = String(parseFloat(vClip3b.start.ticks) - extendTicks3);
                        vClip3b.start = vNewStart3;
                        var vNewIn3 = vClip3b.inPoint;
                        vNewIn3.ticks = String(parseFloat(vClip3b.inPoint.ticks) - extendTicks3);
                        vClip3b.inPoint = vNewIn3;
                        break;
                    }
                }
            }
            for (var a3b = 0; a3b < seq.audioTracks.numTracks; a3b++) {
                var aTrack3b = seq.audioTracks[a3b];
                for (var ai3b = 0; ai3b < aTrack3b.clips.numItems; ai3b++) {
                    var aClip3b = aTrack3b.clips[ai3b];
                    if (Math.abs(aClip3b.start.seconds - newRefStartSec3) < 0.05 && 
                        Math.abs(aClip3b.end.seconds - newRefEndSec3) < 0.05) {
                        var aNewStart3 = aClip3b.start;
                        aNewStart3.ticks = String(parseFloat(aClip3b.start.ticks) - extendTicks3);
                        aClip3b.start = aNewStart3;
                        var aNewIn3 = aClip3b.inPoint;
                        aNewIn3.ticks = String(parseFloat(aClip3b.inPoint.ticks) - extendTicks3);
                        aClip3b.inPoint = aNewIn3;
                        break;
                    }
                }
            }
        }
        // 케이스 4: 둘 다 없음 → 복원 불가
        else {
            return '{"success":false,"error":"복원할 클립을 찾을 수 없습니다","leftFound":false,"rightFound":false,"debug":"' + debugInfo.replace(/"/g, '\\"') + '"}';
        }

        var movedInfo = (typeof movedCount !== 'undefined') ? ',"movedCount":' + movedCount + ',"extendSec":' + (typeof extendSec !== 'undefined' ? extendSec : 0) : '';
        return '{"success":true,"method":"' + method + '","leftIdx":' + leftIdx + ',"rightIdx":' + rightIdx + ',"isContiguous":' + isContiguous + ',"durationTicks":"' + durationTicks + '"' + movedInfo + ',"clipsLog":"' + clipsLog.replace(/"/g, '\\"') + '"}';
    } catch (e) {
        return '{"success":false,"error":"' + e.toString().replace(/"/g, '\\"') + '"}';
    }
}

function getSequenceFramerate() {
    try {
        var seq = app.project.activeSequence;
        if (!seq) return '{"error":"시퀀스 없음"}';
        var ticksPerSecond = 254016000000;
        var frameRate = ticksPerSecond / parseInt(seq.timebase);
        return '{"frameRate":' + frameRate + ',"timebase":"' + seq.timebase + '"}';
    } catch (e) {
        return '{"error":"' + e.toString() + '"}';
    }
}

function getBackupList() {
    try {
        var rootItem = app.project.rootItem;
        var backupBin = null;
        var binName = "videoPlus Backups";
        
        // 백업 bin 찾기
        for (var i = 0; i < rootItem.children.numItems; i++) {
            var child = rootItem.children[i];
            if (child.name === binName && child.type === 2) {
                backupBin = child;
                break;
            }
        }
        
        if (!backupBin) {
            return '{"success":true,"backups":[]}';
        }
        
        var backups = [];
        // UUID 폴더들 순회
        for (var j = 0; j < backupBin.children.numItems; j++) {
            var folder = backupBin.children[j];
            if (folder.type === 2) { // bin (폴더)
                var backupId = folder.name;
                // 폴더 안의 시퀀스 찾기
                for (var k = 0; k < folder.children.numItems; k++) {
                    var item = folder.children[k];
                    if (item.type === 1) { // sequence
                        backups.push('{"backupId":"' + backupId + '","name":"' + item.name.replace(/"/g, '\\"') + '","nodeId":"' + item.nodeId + '"}');
                        break; // 폴더당 하나의 시퀀스만
                    }
                }
            }
        }
        
        return '{"success":true,"backups":[' + backups.join(',') + ']}';
    } catch (e) {
        return '{"success":false,"error":"' + e.toString().replace(/"/g, '\\"') + '"}';
    }
}

function openBackupSequence(backupId) {
    try {
        var rootItem = app.project.rootItem;
        var binName = "videoPlus Backups";
        var backupBin = null;
        
        for (var i = 0; i < rootItem.children.numItems; i++) {
            var child = rootItem.children[i];
            if (child.name === binName && child.type === 2) {
                backupBin = child;
                break;
            }
        }
        
        if (!backupBin) return '{"success":false,"error":"백업 폴더 없음"}';
        
        // UUID 폴더 찾기
        for (var j = 0; j < backupBin.children.numItems; j++) {
            var folder = backupBin.children[j];
            if (folder.name === backupId && folder.type === 2) {
                // 폴더 안의 시퀀스 찾아서 열기
                for (var k = 0; k < folder.children.numItems; k++) {
                    var item = folder.children[k];
                    if (item.type === 1) { // sequence
                        app.project.openSequence(item.nodeId);
                        return '{"success":true,"name":"' + item.name + '"}';
                    }
                }
            }
        }
        
        return '{"success":false,"error":"백업을 찾을 수 없음"}';
    } catch (e) {
        return '{"success":false,"error":"' + e.toString().replace(/"/g, '\\"') + '"}';
    }
}

function getBackupSequenceId(backupId) {
    try {
        var rootItem = app.project.rootItem;
        var binName = "videoPlus Backups";
        var backupBin = null;
        
        for (var i = 0; i < rootItem.children.numItems; i++) {
            var child = rootItem.children[i];
            if (child.name === binName && child.type === 2) {
                backupBin = child;
                break;
            }
        }
        
        if (!backupBin) return '{"success":false,"error":"백업 폴더 없음"}';
        
        // UUID 폴더 찾기
        for (var j = 0; j < backupBin.children.numItems; j++) {
            var folder = backupBin.children[j];
            if (folder.name === backupId && folder.type === 2) {
                // 폴더 안의 시퀀스 찾기
                for (var k = 0; k < folder.children.numItems; k++) {
                    var item = folder.children[k];
                    if (item.type === 1) { // sequence
                        // 시퀀스 객체에서 sequenceID 찾기
                        for (var s = 0; s < app.project.sequences.numSequences; s++) {
                            var seq = app.project.sequences[s];
                            if (seq.projectItem && seq.projectItem.nodeId === item.nodeId) {
                                return '{"success":true,"sequenceId":"' + seq.sequenceID + '"}';
                            }
                        }
                        return '{"success":false,"error":"시퀀스 ID를 찾을 수 없음"}';
                    }
                }
            }
        }
        
        return '{"success":false,"error":"백업을 찾을 수 없음"}';
    } catch (e) {
        return '{"success":false,"error":"' + e.toString().replace(/"/g, '\\"') + '"}';
    }
}

function restoreFromBackup(backupId) {
    try {
        var currentSeq = app.project.activeSequence;
        if (!currentSeq) return '{"success":false,"error":"활성 시퀀스 없음"}';
        
        var currentSeqName = currentSeq.name;
        var currentSeqId = currentSeq.sequenceID;
        var currentSeqParent = currentSeq.projectItem ? currentSeq.projectItem.parent : null;
        
        var rootItem = app.project.rootItem;
        var binName = "videoPlus Backups";
        var backupBin = null;
        
        // 백업 bin 찾기
        for (var i = 0; i < rootItem.children.numItems; i++) {
            var child = rootItem.children[i];
            if (child.name === binName && child.type === 2) {
                backupBin = child;
                break;
            }
        }
        
        if (!backupBin) return '{"success":false,"error":"백업 폴더 없음"}';
        
        // UUID 폴더에서 백업 시퀀스 찾기
        var backupFolder = null;
        var backupSeqItem = null;
        var backupSeq = null;
        
        for (var j = 0; j < backupBin.children.numItems; j++) {
            var folder = backupBin.children[j];
            if (folder.name === backupId && folder.type === 2) {
                backupFolder = folder;
                for (var k = 0; k < folder.children.numItems; k++) {
                    var item = folder.children[k];
                    if (item.type === 1) {
                        backupSeqItem = item;
                        // 시퀀스 객체 찾기
                        for (var s = 0; s < app.project.sequences.numSequences; s++) {
                            if (app.project.sequences[s].projectItem && 
                                app.project.sequences[s].projectItem.nodeId === item.nodeId) {
                                backupSeq = app.project.sequences[s];
                                break;
                            }
                        }
                        break;
                    }
                }
                break;
            }
        }
        
        if (!backupSeqItem) return '{"success":false,"error":"백업 시퀀스를 찾을 수 없음"}';
        
        // 백업 시퀀스 복제
        if (!backupSeq) {
            // 시퀀스를 열어서 참조 얻기
            app.project.openSequence(backupSeqItem.nodeId);
            backupSeq = app.project.activeSequence;
        }
        
        var cloneCountBefore = rootItem.children.numItems;
        var cloneResult = backupSeq.clone();
        
        if (!cloneResult) return '{"success":false,"error":"백업 복제 실패"}';
        
        // 복제된 시퀀스 찾기
        var clonedItem = null;
        for (var m = 0; m < rootItem.children.numItems; m++) {
            var child = rootItem.children[m];
            if (child.name.indexOf(backupSeqItem.name) === 0 && child.name.indexOf("Copy") !== -1) {
                clonedItem = child;
                break;
            }
        }
        
        if (!clonedItem && rootItem.children.numItems > cloneCountBefore) {
            clonedItem = rootItem.children[rootItem.children.numItems - 1];
        }
        
        if (!clonedItem) return '{"success":false,"error":"복제된 시퀀스를 찾을 수 없음"}';
        
        // 현재 시퀀스를 아카이브 폴더로 이동
        var archiveBinName = "videoPlus Archive";
        var archiveBin = null;
        for (var n = 0; n < rootItem.children.numItems; n++) {
            var child = rootItem.children[n];
            if (child.name === archiveBinName && child.type === 2) {
                archiveBin = child;
                break;
            }
        }
        if (!archiveBin) {
            archiveBin = rootItem.createBin(archiveBinName);
        }
        
        // 현재 시퀀스 아카이브
        var timestamp = new Date();
        var timeStr = timestamp.getFullYear() + 
            ("0" + (timestamp.getMonth() + 1)).slice(-2) +
            ("0" + timestamp.getDate()).slice(-2) + "_" +
            ("0" + timestamp.getHours()).slice(-2) +
            ("0" + timestamp.getMinutes()).slice(-2) +
            ("0" + timestamp.getSeconds()).slice(-2);
        
        // 현재 시퀀스 아카이브 + 탭 닫기
        if (currentSeq.projectItem) {
            currentSeq.projectItem.name = currentSeqName + "_archived_" + timeStr;
            currentSeq.projectItem.moveBin(archiveBin);
        }
        // 아카이브된 시퀀스 탭 닫기
        if (currentSeq && currentSeq.close) {
            try { currentSeq.close(); } catch (e) {}
        }
        
        // "sequence" 폴더 찾기 또는 생성
        var seqBinName = "sequence";
        var seqBin = null;
        for (var q = 0; q < rootItem.children.numItems; q++) {
            var child = rootItem.children[q];
            if (child.name === seqBinName && child.type === 2) {
                seqBin = child;
                break;
            }
        }
        if (!seqBin) {
            seqBin = rootItem.createBin(seqBinName);
        }
        
        // 복제본을 "sequence" 폴더로 이동하고 이름 변경
        clonedItem.name = currentSeqName;
        clonedItem.moveBin(seqBin);
        
        // 복원된 시퀀스 열기
        var restoredSeq = null;
        for (var p = 0; p < app.project.sequences.numSequences; p++) {
            var seq = app.project.sequences[p];
            if (seq.projectItem && seq.projectItem.nodeId === clonedItem.nodeId) {
                restoredSeq = seq;
                break;
            }
        }
        
        if (restoredSeq) {
            app.project.activeSequence = restoredSeq;
            // 백업 시퀀스 탭 닫기
            if (backupSeq && backupSeq.close) {
                try { backupSeq.close(); } catch (e) {}
            }
        }
        
        return '{"success":true,"restoredName":"' + currentSeqName + '","archivedName":"' + currentSeqName + '_archived_' + timeStr + '"}';
    } catch (e) {
        return '{"success":false,"error":"' + e.toString().replace(/"/g, '\\"') + '"}';
    }
}

function generateRandomId() {
    var chars = 'abcdef0123456789';
    var segments = [8, 4, 4, 4, 12];
    var result = [];
    for (var i = 0; i < segments.length; i++) {
        var segment = '';
        for (var j = 0; j < segments[i]; j++) {
            segment += chars.charAt(Math.floor(Math.random() * chars.length));
        }
        result.push(segment);
    }
    return result.join('-');
}

function backupSequence(backupName) {
    try {
        var seq = app.project.activeSequence;
        if (!seq) return '{"success":false,"error":"시퀀스 없음"}';
        
        var rootItem = app.project.rootItem;
        var backupBin = null;
        var binName = "videoPlus Backups";
        
        // 백업 bin 찾기 또는 생성
        for (var i = 0; i < rootItem.children.numItems; i++) {
            var child = rootItem.children[i];
            if (child.name === binName && child.type === 2) {
                backupBin = child;
                break;
            }
        }
        
        if (!backupBin) {
            backupBin = rootItem.createBin(binName);
        }
        
        var originalName = seq.name;
        
        // UUID 폴더 생성
        var backupId = generateRandomId();
        var backupFolder = backupBin.createBin(backupId);
        
        // 복제 전 rootItem 개수 기록
        var childCountBefore = rootItem.children.numItems;
        
        // 시퀀스 복제 (복제본이 자동으로 열림)
        var cloneResult = seq.clone();
        
        if (cloneResult) {
            // rootItem.children에서 새로 추가된 항목 찾기
            var clonedItem = null;
            var expectedName = originalName + " Copy";
            
            for (var i = 0; i < rootItem.children.numItems; i++) {
                var child = rootItem.children[i];
                if (child.name === expectedName || child.name.indexOf(originalName + " Copy") === 0) {
                    clonedItem = child;
                    break;
                }
            }
            
            if (!clonedItem && rootItem.children.numItems > childCountBefore) {
                clonedItem = rootItem.children[rootItem.children.numItems - 1];
            }
            
            if (clonedItem) {
                // 시퀀스 이름 설정 (backupName 포함)
                var displayName = backupName ? backupName : originalName;
                clonedItem.name = displayName;
                
                // UUID 폴더로 이동
                var moveResult = clonedItem.moveBin(backupFolder);
                
                // 원래 시퀀스로 전환
                app.project.activeSequence = seq;
                
                // 복제된 시퀀스 탭 닫기
                var clonedSeq = null;
                for (var k = 0; k < app.project.sequences.numSequences; k++) {
                    var s = app.project.sequences[k];
                    if (s.name === displayName && s.sequenceID !== seq.sequenceID) {
                        clonedSeq = s;
                        break;
                    }
                }
                if (clonedSeq && clonedSeq.close) {
                    try { clonedSeq.close(); } catch (closeErr) {}
                }
                
                // 타임스탬프 생성
                var timestamp = new Date();
                var createdAt = timestamp.getFullYear() + '-' +
                    ("0" + (timestamp.getMonth() + 1)).slice(-2) + '-' +
                    ("0" + timestamp.getDate()).slice(-2) + ' ' +
                    ("0" + timestamp.getHours()).slice(-2) + ':' +
                    ("0" + timestamp.getMinutes()).slice(-2) + ':' +
                    ("0" + timestamp.getSeconds()).slice(-2);
                
                return '{"success":true,"backupId":"' + backupId + '","backupName":"' + displayName + '","createdAt":"' + createdAt + '"}';
            }
        }
        
        return '{"success":false,"error":"복제된 시퀀스를 찾을 수 없음"}';
    } catch (e) {
        return '{"success":false,"error":"' + e.toString().replace(/"/g, '\\"') + '"}';
    }
}

function restoreWordByTimecode(sourceInTC, sourceOutTC, durationTC, timelinePositionTC) {
    try {
        var seq = app.project.activeSequence;
        if (!seq) return '{"success":false,"error":"시퀀스 없음"}';

        var vTrack = seq.videoTracks[0];
        if (!vTrack || vTrack.clips.numItems === 0) return '{"success":false,"error":"비디오 트랙 없음"}';

        var leftClip = null;
        var rightClip = null;
        var leftIdx = -1;
        var rightIdx = -1;

        // timecode 기반으로 클립 찾기 (exact match)
        // sourceIn = 단어 시작 = 왼쪽 클립의 outPoint
        // sourceOut = 단어 끝 = 오른쪽 클립의 inPoint
        var clipsLog = "";
        for (var i = 0; i < vTrack.clips.numItems; i++) {
            var clip = vTrack.clips[i];
            var clipInTC = ticksToTimecode(clip.inPoint.ticks);
            var clipOutTC = ticksToTimecode(clip.outPoint.ticks);
            clipsLog += "clip[" + i + "] in=" + clipInTC + " out=" + clipOutTC + "; ";
            
            // 왼쪽 클립: outPoint === sourceIn (단어 시작 지점)
            if (sourceInTC && clipOutTC === sourceInTC) {
                leftClip = clip;
                leftIdx = i;
                clipsLog += "(LEFT) ";
            }
            // 오른쪽 클립: inPoint === sourceOut (단어 끝 지점)
            if (sourceOutTC && clipInTC === sourceOutTC) {
                rightClip = clip;
                rightIdx = i;
                clipsLog += "(RIGHT) ";
            }
        }
        
        var debugInfo = "sourceIn=" + sourceInTC + " | sourceOut=" + sourceOutTC + " | timelinePos=" + timelinePositionTC + " | " + clipsLog;

        var method = "none";

        // 케이스 1: 둘 다 있고 인접 → merge
        if (leftClip && rightClip && leftIdx + 1 === rightIdx) {
            // 소스 미디어상 연속인지 확인 (leftOut + duration = rightIn)
            var leftOutTicks = parseFloat(leftClip.outPoint.ticks);
            var rightInTicks = parseFloat(rightClip.inPoint.ticks);
            var durationTicks = parseFloat(timecodeToTicks(durationTC));
            var isContiguous = Math.abs((leftOutTicks + durationTicks) - rightInTicks) < 254016000;
            
            if (isContiguous) {
                method = "merge";
                // 모든 비디오 트랙 처리
                for (var v = 0; v < seq.videoTracks.numTracks; v++) {
                    var vt = seq.videoTracks[v];
                    if (leftIdx >= vt.clips.numItems || rightIdx >= vt.clips.numItems) continue;
                    var vLeftClip = vt.clips[leftIdx];
                    var vRightClip = vt.clips[rightIdx];
                    if (!vLeftClip || !vRightClip) continue;
                    var vTargetEndTicks = vRightClip.end.ticks;
                    var vTargetOutTicks = vRightClip.outPoint.ticks;
                    vRightClip.remove(false, true);
                    var vNewEnd = vLeftClip.end;
                    vNewEnd.ticks = String(vTargetEndTicks);
                    vLeftClip.end = vNewEnd;
                    var vNewOut = vLeftClip.outPoint;
                    vNewOut.ticks = String(vTargetOutTicks);
                    vLeftClip.outPoint = vNewOut;
                }
                // 모든 오디오 트랙 처리
                for (var a = 0; a < seq.audioTracks.numTracks; a++) {
                    var aTrack = seq.audioTracks[a];
                    if (rightIdx >= aTrack.clips.numItems) continue;
                    var aLeftClip = aTrack.clips[leftIdx];
                    var aRightClip = aTrack.clips[rightIdx];
                    if (!aLeftClip || !aRightClip) continue;
                    var aTargetEndTicks = aRightClip.end.ticks;
                    var aTargetOutTicks = aRightClip.outPoint.ticks;
                    aRightClip.remove(false, true);
                    var aNewEnd = aLeftClip.end;
                    aNewEnd.ticks = String(aTargetEndTicks);
                    aLeftClip.end = aNewEnd;
                    var aNewOut = aLeftClip.outPoint;
                    aNewOut.ticks = String(aTargetOutTicks);
                    aLeftClip.outPoint = aNewOut;
                }
                
                return '{"success":true,"method":"merge","leftIdx":' + leftIdx + ',"rightIdx":' + rightIdx + ',"isContiguous":true}';
            }
        }
        
        // 케이스 2: 왼쪽만 있음 → 뒤 클립들 밀고 왼쪽 확장
        if (leftClip && !rightClip) {
            method = "extendRight";
            var refEndTicks = parseFloat(leftClip.end.ticks);
            var refStartSec = leftClip.start.seconds;
            var refEndSec = leftClip.end.seconds;
            var extendTicks2 = parseFloat(timecodeToTicks(durationTC));
            var extendSec = ticksToSeconds(extendTicks2);
            
            // 1단계: 뒤 클립들 밀기
            var movedCount = 0;
            for (var v2a = 0; v2a < seq.videoTracks.numTracks; v2a++) {
                var vTrack2a = seq.videoTracks[v2a];
                for (var vi2a = vTrack2a.clips.numItems - 1; vi2a >= 0; vi2a--) {
                    var vClip2a = vTrack2a.clips[vi2a];
                    if (parseFloat(vClip2a.start.ticks) >= refEndTicks) {
                        vClip2a.move(extendSec);
                        movedCount++;
                    }
                }
            }
            for (var a2a = 0; a2a < seq.audioTracks.numTracks; a2a++) {
                var aTrack2a = seq.audioTracks[a2a];
                for (var ai2a = aTrack2a.clips.numItems - 1; ai2a >= 0; ai2a--) {
                    var aClip2a = aTrack2a.clips[ai2a];
                    if (parseFloat(aClip2a.start.ticks) >= refEndTicks) {
                        aClip2a.move(extendSec);
                        movedCount++;
                    }
                }
            }
            
            // 2단계: 왼쪽 클립 확장
            for (var v2b = 0; v2b < seq.videoTracks.numTracks; v2b++) {
                var vTrack2b = seq.videoTracks[v2b];
                for (var vi2b = 0; vi2b < vTrack2b.clips.numItems; vi2b++) {
                    var vClip2b = vTrack2b.clips[vi2b];
                    if (Math.abs(vClip2b.start.seconds - refStartSec) < 0.05 && 
                        Math.abs(vClip2b.end.seconds - refEndSec) < 0.05) {
                        var vNewEnd2 = vClip2b.end;
                        vNewEnd2.ticks = String(parseFloat(vClip2b.end.ticks) + extendTicks2);
                        vClip2b.end = vNewEnd2;
                        var vNewOut2 = vClip2b.outPoint;
                        vNewOut2.ticks = String(parseFloat(vClip2b.outPoint.ticks) + extendTicks2);
                        vClip2b.outPoint = vNewOut2;
                        break;
                    }
                }
            }
            for (var a2b = 0; a2b < seq.audioTracks.numTracks; a2b++) {
                var aTrack2b = seq.audioTracks[a2b];
                for (var ai2b = 0; ai2b < aTrack2b.clips.numItems; ai2b++) {
                    var aClip2b = aTrack2b.clips[ai2b];
                    if (Math.abs(aClip2b.start.seconds - refStartSec) < 0.05 && 
                        Math.abs(aClip2b.end.seconds - refEndSec) < 0.05) {
                        var aNewEnd2 = aClip2b.end;
                        aNewEnd2.ticks = String(parseFloat(aClip2b.end.ticks) + extendTicks2);
                        aClip2b.end = aNewEnd2;
                        var aNewOut2 = aClip2b.outPoint;
                        aNewOut2.ticks = String(parseFloat(aClip2b.outPoint.ticks) + extendTicks2);
                        aClip2b.outPoint = aNewOut2;
                        break;
                    }
                }
            }
            
            return '{"success":true,"method":"extendRight","leftIdx":' + leftIdx + ',"movedCount":' + movedCount + '}';
        }
        
        // 케이스 3: 오른쪽만 있음 → 오른쪽 클립 포함 밀고 앞으로 확장
        if (!leftClip && rightClip) {
            method = "extendLeft";
            var refStartTicks3 = parseFloat(rightClip.start.ticks);
            var refStartSec3 = rightClip.start.seconds;
            var refEndSec3 = rightClip.end.seconds;
            var extendTicks3 = parseFloat(timecodeToTicks(durationTC));
            var extendSec3 = ticksToSeconds(extendTicks3);
            
            // 1단계: rightClip 포함 뒤로 밀기
            for (var v3a = 0; v3a < seq.videoTracks.numTracks; v3a++) {
                var vTrack3a = seq.videoTracks[v3a];
                for (var vi3a = vTrack3a.clips.numItems - 1; vi3a >= 0; vi3a--) {
                    var vClip3a = vTrack3a.clips[vi3a];
                    if (parseFloat(vClip3a.start.ticks) >= refStartTicks3) {
                        vClip3a.move(extendSec3);
                    }
                }
            }
            for (var a3a = 0; a3a < seq.audioTracks.numTracks; a3a++) {
                var aTrack3a = seq.audioTracks[a3a];
                for (var ai3a = aTrack3a.clips.numItems - 1; ai3a >= 0; ai3a--) {
                    var aClip3a = aTrack3a.clips[ai3a];
                    if (parseFloat(aClip3a.start.ticks) >= refStartTicks3) {
                        aClip3a.move(extendSec3);
                    }
                }
            }
            
            // 2단계: 앞으로 확장
            var newRefStartSec3 = refStartSec3 + extendSec3;
            var newRefEndSec3 = refEndSec3 + extendSec3;
            
            for (var v3b = 0; v3b < seq.videoTracks.numTracks; v3b++) {
                var vTrack3b = seq.videoTracks[v3b];
                for (var vi3b = 0; vi3b < vTrack3b.clips.numItems; vi3b++) {
                    var vClip3b = vTrack3b.clips[vi3b];
                    if (Math.abs(vClip3b.start.seconds - newRefStartSec3) < 0.05 && 
                        Math.abs(vClip3b.end.seconds - newRefEndSec3) < 0.05) {
                        var vNewStart3 = vClip3b.start;
                        vNewStart3.ticks = String(parseFloat(vClip3b.start.ticks) - extendTicks3);
                        vClip3b.start = vNewStart3;
                        var vNewIn3 = vClip3b.inPoint;
                        vNewIn3.ticks = String(parseFloat(vClip3b.inPoint.ticks) - extendTicks3);
                        vClip3b.inPoint = vNewIn3;
                        break;
                    }
                }
            }
            for (var a3b = 0; a3b < seq.audioTracks.numTracks; a3b++) {
                var aTrack3b = seq.audioTracks[a3b];
                for (var ai3b = 0; ai3b < aTrack3b.clips.numItems; ai3b++) {
                    var aClip3b = aTrack3b.clips[ai3b];
                    if (Math.abs(aClip3b.start.seconds - newRefStartSec3) < 0.05 && 
                        Math.abs(aClip3b.end.seconds - newRefEndSec3) < 0.05) {
                        var aNewStart3 = aClip3b.start;
                        aNewStart3.ticks = String(parseFloat(aClip3b.start.ticks) - extendTicks3);
                        aClip3b.start = aNewStart3;
                        var aNewIn3 = aClip3b.inPoint;
                        aNewIn3.ticks = String(parseFloat(aClip3b.inPoint.ticks) - extendTicks3);
                        aClip3b.inPoint = aNewIn3;
                        break;
                    }
                }
            }
            
            return '{"success":true,"method":"extendLeft","rightIdx":' + rightIdx + '}';
        }
        
        // 케이스 4: 둘 다 없음 → insertClip으로 삽입
        method = "insertClip";
        
        // 소스 미디어 in/out (ticks → seconds)
        var sourceInTicks4 = parseFloat(timecodeToTicks(sourceInTC));
        var sourceOutTicks4 = parseFloat(timecodeToTicks(sourceOutTC));
        var durationTicks4 = sourceOutTicks4 - sourceInTicks4;
        var durationSec4 = ticksToSeconds(durationTicks4);
        
        // 타임라인 위치 (seconds)
        var timelinePosTicks4 = parseFloat(timecodeToTicks(timelinePositionTC));
        var timelinePosSec4 = ticksToSeconds(timelinePosTicks4);
        
        // 뒤 클립들 먼저 밀기 (공간 확보)
        for (var vm4 = 0; vm4 < seq.videoTracks.numTracks; vm4++) {
            var vtm4 = seq.videoTracks[vm4];
            for (var vim4 = vtm4.clips.numItems - 1; vim4 >= 0; vim4--) {
                var vcm4 = vtm4.clips[vim4];
                if (parseFloat(vcm4.start.ticks) >= timelinePosTicks4) {
                    vcm4.move(durationSec4);
                }
            }
        }
        for (var am4 = 0; am4 < seq.audioTracks.numTracks; am4++) {
            var atm4 = seq.audioTracks[am4];
            for (var aim4 = atm4.clips.numItems - 1; aim4 >= 0; aim4--) {
                var acm4 = atm4.clips[aim4];
                if (parseFloat(acm4.start.ticks) >= timelinePosTicks4) {
                    acm4.move(durationSec4);
                }
            }
        }
        
        // 비디오 트랙 0 기준으로 gap 계산
        var videoTrack0 = seq.videoTracks[0];
        if (!videoTrack0 || videoTrack0.clips.numItems === 0) {
            return '{"success":false,"error":"비디오 트랙 0에 클립이 없습니다"}';
        }
        var baseClip = videoTrack0.clips[0];
        var baseInPoint = parseFloat(baseClip.inPoint.ticks);
        var baseOutPoint = parseFloat(baseClip.outPoint.ticks);
        
        // gap 계산 (비디오 트랙 0 기준)
        var videoInGap = sourceInTicks4 - baseInPoint;
        var videoOutGap = sourceOutTicks4 - baseOutPoint;
        
        var insertedCount = 0;
        var insertErrors = [];
        
        // 비디오 트랙 처리 (각각 따로)
        for (var vi4 = 0; vi4 < seq.videoTracks.numTracks; vi4++) {
            var vti4 = seq.videoTracks[vi4];
            if (vti4.clips.numItems > 0) {
                var refClip4 = vti4.clips[0];
                var projItem4 = refClip4.projectItem;
                
                if (projItem4) {
                    try {
                        // 이 트랙의 in/out에 gap 적용
                        var thisInPoint = parseFloat(refClip4.inPoint.ticks);
                        var thisOutPoint = parseFloat(refClip4.outPoint.ticks);
                        var newIn4 = thisInPoint + videoInGap;
                        var newOut4 = thisOutPoint + videoOutGap;
                        
                        // setInPoint/setOutPoint (초 단위)
                        projItem4.setInPoint(ticksToSeconds(newIn4), 4); // 4 = VIDEO
                        projItem4.setOutPoint(ticksToSeconds(newOut4), 4);
                        
                        // overwriteClip (비디오만)
                        if (typeof vti4.overwriteClip === 'function') {
                            vti4.overwriteClip(projItem4, timelinePosSec4);
                        } else {
                            vti4.insertClip(projItem4, timelinePosSec4);
                        }
                        insertedCount++;
                    } catch (vInsertErr) {
                        insertErrors.push("V" + vi4 + ":" + vInsertErr.toString());
                    }
                }
            }
        }
        
        // 오디오 트랙 처리 (각각 따로)
        for (var ai4 = 0; ai4 < seq.audioTracks.numTracks; ai4++) {
            var ati4 = seq.audioTracks[ai4];
            if (ati4.clips.numItems > 0) {
                var aRefClip4 = ati4.clips[0];
                var aProjItem4 = aRefClip4.projectItem;
                
                if (aProjItem4) {
                    try {
                        // 이 트랙의 in/out에 gap 적용
                        var aThisInPoint = parseFloat(aRefClip4.inPoint.ticks);
                        var aThisOutPoint = parseFloat(aRefClip4.outPoint.ticks);
                        var aNewIn4 = aThisInPoint + videoInGap;
                        var aNewOut4 = aThisOutPoint + videoOutGap;
                        
                        // setInPoint/setOutPoint (초 단위)
                        aProjItem4.setInPoint(ticksToSeconds(aNewIn4), 2); // 2 = AUDIO
                        aProjItem4.setOutPoint(ticksToSeconds(aNewOut4), 2);
                        
                        // overwriteClip (오디오만)
                        if (typeof ati4.overwriteClip === 'function') {
                            ati4.overwriteClip(aProjItem4, timelinePosSec4);
                        } else {
                            ati4.insertClip(aProjItem4, timelinePosSec4);
                        }
                        insertedCount++;
                    } catch (aInsertErr) {
                        insertErrors.push("A" + ai4 + ":" + aInsertErr.toString());
                    }
                }
            }
        }
        
        var errStr = insertErrors.length > 0 ? ',"errors":"' + insertErrors.join(';').replace(/"/g, '\\"') + '"' : '';
        return '{"success":true,"method":"insertClip","insertedCount":' + insertedCount + ',"videoInGap":' + videoInGap + ',"videoOutGap":' + videoOutGap + ',"timelinePosition":"' + timelinePositionTC + '"' + errStr + '}';
    } catch (e) {
        return '{"success":false,"error":"' + e.toString().replace(/"/g, '\\"') + '"}';
    }
}

function findAudioPreset() {
    var versions = ["2025", "2024", "2023", "2022"];
    var presetFiles = ["3F3F3F3F_57415645/Waveform Audio 48kHz 16-bit.epr", "3F3F3F3F_57415645/Waveform Audio 44.1kHz 16-bit.epr"];
    for (var v = 0; v < versions.length; v++) {
        var basePath = "/Applications/Adobe Media Encoder " + versions[v] + "/Adobe Media Encoder " + versions[v] + ".app/Contents/MediaIO/systempresets";
        for (var p = 0; p < presetFiles.length; p++) {
            var presetPath = basePath + "/" + presetFiles[p];
            var presetFile = new File(presetPath);
            if (presetFile.exists) return presetPath;
        }
    }
    return null;
}

function renderAudio(outputPath) {
    try {
        if (!app || !app.project) return '{"success":false,"error":"프로젝트가 없습니다"}';
        var seq = app.project.activeSequence;
        if (!seq) return '{"success":false,"error":"시퀀스를 열어주세요"}';

        var originalVideoMutes = [];
        var originalAudioMutes = [];

        for (var i = 0; i < seq.videoTracks.numTracks; i++) {
            var vTrack = seq.videoTracks[i];
            originalVideoMutes.push(vTrack.isMuted());
            vTrack.setMute(1);
        }

        for (var j = 0; j < seq.audioTracks.numTracks; j++) {
            var aTrack = seq.audioTracks[j];
            originalAudioMutes.push(aTrack.isMuted());
            aTrack.setMute(j !== 0 ? 1 : 0);
        }

        var presetPath = findAudioPreset();
        if (!presetPath) {
            restoreTracks(seq, originalVideoMutes, originalAudioMutes);
            return '{"success":false,"error":"오디오 프리셋을 찾을 수 없습니다"}';
        }

        var success = seq.exportAsMediaDirect(outputPath, presetPath, 0);
        restoreTracks(seq, originalVideoMutes, originalAudioMutes);

        if (success) {
            return '{"success":true,"outputPath":"' + outputPath.replace(/\\/g, "\\\\") + '"}';
        } else {
            return '{"success":false,"error":"렌더링 실패"}';
        }
    } catch (e) {
        return '{"success":false,"error":"' + e.toString().replace(/"/g, '\\"') + '"}';
    }
}

function restoreTracks(seq, videoMutes, audioMutes) {
    try {
        for (var i = 0; i < seq.videoTracks.numTracks; i++) {
            seq.videoTracks[i].setMute(videoMutes[i] ? 1 : 0);
        }
        for (var j = 0; j < seq.audioTracks.numTracks; j++) {
            seq.audioTracks[j].setMute(audioMutes[j] ? 1 : 0);
        }
    } catch (e) {}
}

function debugClipPoints() {
    try {
        var seq = app.project.activeSequence;
        if (!seq) return '{"error":"시퀀스 없음"}';
        var vTrack = seq.videoTracks[0];
        var result = '{"clips":[';
        for (var i = 0; i < vTrack.clips.numItems; i++) {
            if (i > 0) result += ',';
            var c = vTrack.clips[i];
            result += '{"idx":' + i + ',"inPointTicks":"' + c.inPoint.ticks + '","outPointTicks":"' + c.outPoint.ticks + '"}';
        }
        result += ']}';
        return result;
    } catch (e) {
        return '{"error":"' + e.toString() + '"}';
    }
}

function inspectClipMethods() {
    try {
        var seq = app.project.activeSequence;
        if (!seq) return '{"error":"시퀀스 없음"}';
        var track = seq.videoTracks[0];
        if (!track || track.clips.numItems === 0) return '{"error":"클립 없음"}';
        var clip = track.clips[0];
        var methods = [];
        if (typeof clip.move === 'function') methods.push('move');
        if (typeof clip.remove === 'function') methods.push('remove');
        if (typeof clip.setSpeed === 'function') methods.push('setSpeed');
        if (typeof clip.getSpeed === 'function') methods.push('getSpeed');
        // start/end 속성
        var hasStart = (clip.start !== undefined);
        var hasEnd = (clip.end !== undefined);
        return '{"methods":["' + methods.join('","') + '"],"hasStart":' + hasStart + ',"hasEnd":' + hasEnd + '}';
    } catch (e) {
        return '{"error":"' + e.toString() + '"}';
    }
}

function inspectInsertClip() {
    try {
        var seq = app.project.activeSequence;
        if (!seq) return '{"error":"시퀀스 없음"}';
        var track = seq.videoTracks[0];
        if (!track) return '{"error":"트랙 없음"}';
        
        var methods = [];
        if (typeof track.insertClip === 'function') methods.push('insertClip');
        if (typeof track.overwriteClip === 'function') methods.push('overwriteClip');
        
        // insertClip 파라미터 확인 (함수 toString)
        var insertClipStr = "";
        try {
            insertClipStr = track.insertClip.toString().substring(0, 200);
        } catch(e) {}
        
        return '{"methods":["' + methods.join('","') + '"],"insertClip":"' + insertClipStr + '"}';
    } catch (e) {
        return '{"error":"' + e.toString() + '"}';
    }
}

function inspectQEClipMethods() {
    try {
        app.enableQE();
        var qeSeq = qe.project.getActiveSequence();
        if (!qeSeq) return '{"error":"QE 시퀀스 없음"}';
        
        var qeAudioTrack = qeSeq.getAudioTrackAt(0);
        if (!qeAudioTrack) return '{"error":"QE 오디오 트랙 없음"}';
        
        // QE 트랙 메서드
        var trackMethods = [];
        for (var prop in qeAudioTrack) {
            if (typeof qeAudioTrack[prop] === 'function') {
                trackMethods.push(prop);
            }
        }
        
        // QE 클립 메서드 (첫 번째 클립)
        var clipMethods = [];
        var qeClip = qeAudioTrack.getItemAt(0);
        if (qeClip) {
            for (var cprop in qeClip) {
                if (typeof qeClip[cprop] === 'function') {
                    clipMethods.push(cprop);
                }
            }
        }
        
        // qe.project 메서드
        var projectMethods = [];
        for (var pprop in qe.project) {
            if (typeof qe.project[pprop] === 'function') {
                projectMethods.push(pprop);
            }
        }
        
        return '{"trackMethods":["' + trackMethods.join('","') + '"],"clipMethods":["' + clipMethods.join('","') + '"],"projectMethods":["' + projectMethods.join('","') + '"]}';
    } catch (e) {
        return '{"error":"' + e.toString() + '"}';
    }
}

function exportSequenceAsXML(outputPath) {
    try {
        var seq = app.project.activeSequence;
        if (!seq) return '{"success":false,"error":"시퀀스 없음"}';
        
        // FCP XML로 익스포트
        seq.exportAsFinalCutProXML(outputPath);
        
        return '{"success":true,"outputPath":"' + outputPath.replace(/\\/g, "\\\\") + '","sequenceName":"' + seq.name + '"}';
    } catch (e) {
        return '{"success":false,"error":"' + e.toString().replace(/"/g, '\\"') + '"}';
    }
}

function importXMLSequence(xmlPath) {
    try {
        // XML 파일 임포트
        var importSuccess = app.project.importFiles([xmlPath], true, app.project.rootItem, false);
        
        if (importSuccess) {
            return '{"success":true,"xmlPath":"' + xmlPath.replace(/\\/g, "\\\\") + '"}';
        } else {
            return '{"success":false,"error":"임포트 실패"}';
        }
    } catch (e) {
        return '{"success":false,"error":"' + e.toString().replace(/"/g, '\\"') + '"}';
    }
}

/**
 * nodeId로 프로젝트 아이템 찾기 (재귀)
 */
function findProjectItemByNodeId(parentItem, nodeId) {
    if (!parentItem) return null;
    
    for (var i = 0; i < parentItem.children.numItems; i++) {
        var item = parentItem.children[i];
        if (item.nodeId === nodeId) {
            return item;
        }
        // 폴더면 재귀 탐색
        try {
            if (item.children && item.children.numItems > 0) {
                var found = findProjectItemByNodeId(item, nodeId);
                if (found) return found;
            }
        } catch (e) {}
    }
    return null;
}

/**
 * 프로젝트 아이템을 재귀적으로 찾기
 */
function findProjectItemByName(name, parentItem) {
    if (!parentItem) parentItem = app.project.rootItem;
    
    for (var i = 0; i < parentItem.children.numItems; i++) {
        var item = parentItem.children[i];
        if (item.name === name) {
            $.writeln("[findProjectItemByName] 찾음: " + name + " in " + parentItem.name);
            return { item: item, parent: parentItem };
        }
        // children이 있으면 재귀 탐색 (폴더)
        try {
            if (item.children && item.children.numItems > 0) {
                $.writeln("[findProjectItemByName] 폴더 탐색: " + item.name);
                var found = findProjectItemByName(name, item);
                if (found) return found;
            }
        } catch (e) {
            // children 접근 실패 - 스킵 (시퀀스 등)
        }
    }
    return null;
}

/**
 * 새 시퀀스의 projectItem 찾기
 */
function findNewSequenceProjectItem(seqName) {
    var rootItem = app.project.rootItem;
    for (var i = 0; i < rootItem.children.numItems; i++) {
        var item = rootItem.children[i];
        if (item.name === seqName) {
            return item;
        }
    }
    return null;
}

function importXMLAndOpen(xmlPath, originalSequenceName) {
    try {
        // 현재 시퀀스 정보 저장
        var currentSeq = app.project.activeSequence;
        var currentSeqId = currentSeq ? currentSeq.sequenceID : null;
        var currentSeqName = currentSeq ? currentSeq.name : "monitor";
        
        // 원본 이름 사용 (전달받거나 현재 시퀀스 이름)
        var origName = originalSequenceName || currentSeqName;
        
        $.writeln("[importXMLAndOpen] origName: " + origName);
        
        // 현재 활성 시퀀스의 projectItem과 부모 저장 (임포트 전에!)
        var oldSeqProjectItem = null;
        var oldSeqParentBin = null;
        var oldSeqProjectItemNodeId = null;
        
        if (currentSeq && currentSeq.projectItem) {
            oldSeqProjectItem = currentSeq.projectItem;
            oldSeqProjectItemNodeId = oldSeqProjectItem.nodeId; // nodeId 저장
            if (oldSeqProjectItem.parent) {
                oldSeqParentBin = oldSeqProjectItem.parent;
            }
        }
        
        // 임포트 전 시퀀스 ID 목록 저장
        var existingIds = {};
        var sequences = app.project.sequences;
        for (var i = 0; i < sequences.numSequences; i++) {
            existingIds[sequences[i].sequenceID] = true;
        }
        
        // XML 파일 임포트
        var importSuccess = app.project.importFiles([xmlPath], true, app.project.rootItem, false);
        
        if (!importSuccess) {
            return '{"success":false,"error":"임포트 실패"}';
        }
        
        // 새로 추가된 시퀀스들 찾기
        sequences = app.project.sequences;
        var newSequences = [];
        var mainSeq = null;
        
        for (var j = 0; j < sequences.numSequences; j++) {
            var seq = sequences[j];
            if (!existingIds[seq.sequenceID]) {
                newSequences.push(seq);
                // 메인 시퀀스 찾기 (이름이 "monitor"인 것)
                if (seq.name === origName || seq.name === "monitor") {
                    mainSeq = seq;
                }
            }
        }
        
        // 메인 시퀀스를 못 찾으면 새 시퀀스 중 첫 번째 사용
        if (!mainSeq && newSequences.length > 0) {
            // nested 시퀀스("both" 등) 제외하고 찾기
            for (var k = 0; k < newSequences.length; k++) {
                if (newSequences[k].name !== "both") {
                    mainSeq = newSequences[k];
                    break;
                }
            }
            if (!mainSeq) {
                mainSeq = newSequences[0];
            }
        }
        
        if (!mainSeq) {
            return '{"success":false,"error":"새 시퀀스를 찾을 수 없습니다. 임포트된 시퀀스 수: ' + newSequences.length + '"}';
        }
        
        // 원본 시퀀스 이름 변경 (삭제가 안 되므로 이름 변경으로 대체)
        var renamedOld = false;
        if (currentSeq) {
            try {
                var timestamp = new Date().getTime();
                currentSeq.name = origName + "_old_" + timestamp;
                renamedOld = true;
            } catch (renameErr) {}
        }
        
        // 새 시퀀스 열기
        app.project.openSequence(mainSeq.sequenceID);
        
        // 새 시퀀스 projectItem 찾기 (시퀀스 객체에서 직접)
        var newSeqProjectItem = mainSeq.projectItem || null;
        
        // 새 시퀀스를 원본 폴더로 이동
        var movedToFolder = false;
        var moveErr = "";
        if (newSeqProjectItem && oldSeqParentBin && oldSeqParentBin !== app.project.rootItem) {
            try {
                $.writeln("[importXMLAndOpen] 이동 시도: " + oldSeqParentBin.name + "로");
                newSeqProjectItem.moveBin(oldSeqParentBin);
                movedToFolder = true;
                $.writeln("[importXMLAndOpen] 이동 성공");
            } catch (mvErr) {
                moveErr = mvErr.toString();
                $.writeln("[importXMLAndOpen] 이동 실패: " + moveErr);
            }
        } else {
            $.writeln("[importXMLAndOpen] 이동 스킵 - newSeqProjectItem:" + !!newSeqProjectItem + " oldSeqParentBin:" + !!oldSeqParentBin);
        }
        
        // 새 시퀀스 이름을 원본 이름으로 변경
        mainSeq.name = origName;
        
        return '{"success":true,"newSequenceName":"' + mainSeq.name + '","importedCount":' + newSequences.length + ',"renamedOld":' + renamedOld + ',"movedToFolder":' + movedToFolder + '}';
    } catch (e) {
        return '{"success":false,"error":"' + e.toString().replace(/"/g, '\\"') + '"}';
    }
}

function openSequenceById(sequenceId) {
    try {
        app.project.openSequence(sequenceId);
        return '{"success":true}';
    } catch (e) {
        return '{"success":false,"error":"' + e.toString().replace(/"/g, '\\"') + '"}';
    }
}

/**
 * 클립의 효과를 다른 클립에 복사
 */
function copyClipEffects(sourceClip, targetClip) {
    try {
        if (!sourceClip.components || !targetClip.components) {
            return false;
        }
        
        // 소스 클립의 모든 컴포넌트(효과) 순회
        for (var i = 0; i < sourceClip.components.numItems; i++) {
            var srcComp = sourceClip.components[i];
            var compName = srcComp.displayName;
            
            // 기본 효과(Motion, Opacity, Time Remapping 등)는 이미 있을 수 있음
            // 타겟 클립에서 같은 이름의 컴포넌트 찾기
            var tgtComp = null;
            for (var j = 0; j < targetClip.components.numItems; j++) {
                if (targetClip.components[j].displayName === compName) {
                    tgtComp = targetClip.components[j];
                    break;
                }
            }
            
            if (tgtComp && srcComp.properties) {
                // 속성 값 복사
                for (var p = 0; p < srcComp.properties.numItems; p++) {
                    var srcProp = srcComp.properties[p];
                    var propName = srcProp.displayName;
                    
                    // 타겟에서 같은 속성 찾기
                    for (var tp = 0; tp < tgtComp.properties.numItems; tp++) {
                        var tgtProp = tgtComp.properties[tp];
                        if (tgtProp.displayName === propName) {
                            try {
                                var val = srcProp.getValue();
                                if (val !== undefined && val !== null) {
                                    tgtProp.setValue(val, true);
                                }
                            } catch (e) {}
                            break;
                        }
                    }
                }
            }
        }
        return true;
    } catch (e) {
        return false;
    }
}

/**
 * 삽입된 클립에 원본 클립의 효과 복사
 */
function applyEffectsToInsertedClip(track, insertPosition, sourceClip) {
    try {
        // 삽입 위치에 있는 클립 찾기
        for (var i = 0; i < track.clips.numItems; i++) {
            var clip = track.clips[i];
            if (Math.abs(clip.start.seconds - insertPosition) < 0.1) {
                copyClipEffects(sourceClip, clip);
                return true;
            }
        }
        return false;
    } catch (e) {
        return false;
    }
}

function closeActiveSequence() {
    try {
        var seq = app.project.activeSequence;
        if (!seq) return '{"success":false,"error":"활성 시퀀스 없음"}';
        
        // QE로 닫기 시도
        app.enableQE();
        var qeSeq = qe.project.getActiveSequence();
        if (qeSeq && typeof qeSeq.close === 'function') {
            qeSeq.close();
            return '{"success":true,"method":"qe.close"}';
        }
        
        return '{"success":false,"error":"닫기 메서드 없음"}';
    } catch (e) {
        return '{"success":false,"error":"' + e.toString().replace(/"/g, '\\"') + '"}';
    }
}

function listSequences() {
    try {
        var sequences = app.project.sequences;
        var result = '{"sequences":[';
        for (var i = 0; i < sequences.numSequences; i++) {
            if (i > 0) result += ',';
            var seq = sequences[i];
            result += '{"name":"' + seq.name + '","id":"' + seq.sequenceID + '"}';
        }
        result += ']}';
        return result;
    } catch (e) {
        return '{"error":"' + e.toString() + '"}';
    }
}

function inspectAdjustmentLayerAPI() {
    try {
        var seq = app.project.activeSequence;
        if (!seq) return '{"error":"시퀀스 없음"}';
        
        // 프로젝트에서 Adjustment Layer 생성 가능한지 확인
        var methods = [];
        
        // qe 확인
        app.enableQE();
        var qeSeq = qe.project.getActiveSequence();
        
        // 프로젝트 메서드
        var projectMethods = [];
        for (var prop in app.project) {
            if (typeof app.project[prop] === 'function') {
                projectMethods.push(prop);
            }
        }
        
        // 시퀀스 메서드
        var seqMethods = [];
        for (var sprop in seq) {
            if (typeof seq[sprop] === 'function') {
                seqMethods.push(sprop);
            }
        }
        
        return '{"projectMethods":["' + projectMethods.join('","') + '"],"seqMethods":["' + seqMethods.join('","') + '"]}';
    } catch (e) {
        return '{"error":"' + e.toString() + '"}';
    }
}

function inspectEssentialSound() {
    try {
        var seq = app.project.activeSequence;
        if (!seq) return '{"error":"시퀀스 없음"}';
        var track = seq.audioTracks[0];
        if (!track || track.clips.numItems === 0) return '{"error":"오디오 클립 없음"}';
        var clip = track.clips[0];
        
        // 클립의 모든 속성/메서드 나열
        var clipProps = [];
        var clipMethods = [];
        for (var prop in clip) {
            if (typeof clip[prop] === 'function') {
                clipMethods.push(prop);
            } else {
                clipProps.push(prop);
            }
        }
        
        // Essential Sound 관련 키워드 찾기
        var essentialMethods = [];
        var presetMethods = [];
        for (var i = 0; i < clipMethods.length; i++) {
            var m = clipMethods[i].toLowerCase();
            if (m.indexOf('essential') >= 0 || m.indexOf('sound') >= 0 || m.indexOf('audio') >= 0) {
                essentialMethods.push(clipMethods[i]);
            }
            if (m.indexOf('preset') >= 0 || m.indexOf('effect') >= 0 || m.indexOf('component') >= 0) {
                presetMethods.push(clipMethods[i]);
            }
        }
        
        // projectItem 메서드도 확인
        var projectItemMethods = [];
        if (clip.projectItem) {
            for (var pp in clip.projectItem) {
                if (typeof clip.projectItem[pp] === 'function') {
                    projectItemMethods.push(pp);
                }
            }
        }
        
        return '{"clipMethods":["' + clipMethods.join('","') + '"],"essentialMethods":["' + essentialMethods.join('","') + '"],"presetMethods":["' + presetMethods.join('","') + '"],"projectItemMethods":["' + projectItemMethods.join('","') + '"]}';
    } catch (e) {
        return '{"error":"' + e.toString() + '"}';
    }
}

function findExecuteCommand() {
    try {
        var result = "";
        
        // app 메서드 확인
        result += "app.executeCommand: " + (typeof app.executeCommand) + "; ";
        result += "app.project.executeCommand: " + (typeof app.project.executeCommand) + "; ";
        
        // QE 메서드 확인
        app.enableQE();
        result += "qe.executeCommand: " + (typeof qe.executeCommand) + "; ";
        result += "qe.project.executeCommand: " + (typeof qe.project.executeCommand) + "; ";
        
        // app의 모든 함수형 속성 나열
        var appMethods = [];
        for (var prop in app) {
            if (typeof app[prop] === 'function') {
                appMethods.push(prop);
            }
        }
        result += "appMethods: " + appMethods.join(",");
        
        return '{"result":"' + result + '"}';
    } catch (e) {
        return '{"error":"' + e.toString() + '"}';
    }
}

function testSetSelected() {
    try {
        var seq = app.project.activeSequence;
        if (!seq) return '{"error":"시퀀스 없음"}';
        var track = seq.videoTracks[0];
        if (!track || track.clips.numItems === 0) return '{"error":"클립 없음"}';
        var clip = track.clips[0];
        
        // CEP 일반 클립 메서드 확인
        var hasCepSetSelected = (typeof clip.setSelected === 'function');
        
        // QE 클립 메서드 확인
        app.enableQE();
        var qeSeq = qe.project.getActiveSequence();
        var qeTrack = qeSeq.getVideoTrackAt(0);
        var qeClip = qeTrack.getItemAt(0);
        var hasQeSetSelected = (typeof qeClip.setSelected === 'function');
        
        // QE 클립의 모든 메서드 나열
        var qeClipMethods = [];
        for (var prop in qeClip) {
            if (typeof qeClip[prop] === 'function') {
                qeClipMethods.push(prop);
            }
        }
        
        return '{"cepSetSelected":' + hasCepSetSelected + ',"qeSetSelected":' + hasQeSetSelected + ',"qeClipMethods":["' + qeClipMethods.join('","') + '"]}';
    } catch (e) {
        return '{"error":"' + e.toString() + '"}';
    }
}

function inspectCloneAPI() {
    try {
        var seq = app.project.activeSequence;
        if (!seq) return '{"error":"시퀀스 없음"}';
        var track = seq.videoTracks[0];
        if (!track || track.clips.numItems === 0) return '{"error":"클립 없음"}';
        var clip = track.clips[0];
        
        var clipMethods = [];
        var trackMethods = [];
        var qeMethods = [];
        
        // 클립 메서드 확인
        var clipMethodsToCheck = ['clone', 'duplicate', 'copy', 'createClone', 'duplicateClip'];
        for (var i = 0; i < clipMethodsToCheck.length; i++) {
            var m = clipMethodsToCheck[i];
            if (typeof clip[m] === 'function') clipMethods.push(m);
        }
        
        // 트랙 메서드 확인
        var trackMethodsToCheck = ['clone', 'duplicate', 'copy', 'duplicateClip', 'copyClip', 'cloneClip'];
        for (var j = 0; j < trackMethodsToCheck.length; j++) {
            var tm = trackMethodsToCheck[j];
            if (typeof track[tm] === 'function') trackMethods.push(tm);
        }
        
        // QE 확인
        try {
            app.enableQE();
            var qeSeq = qe.project.getActiveSequence();
            if (qeSeq) {
                var qeTrack = qeSeq.getVideoTrackAt(0);
                if (qeTrack) {
                    var qeMethodsToCheck = ['clone', 'duplicate', 'copy', 'getItemAt'];
                    for (var l = 0; l < qeMethodsToCheck.length; l++) {
                        var qm = qeMethodsToCheck[l];
                        if (typeof qeTrack[qm] === 'function') qeMethods.push(qm);
                    }
                }
            }
        } catch(qeErr) {}
        
        // 모든 클립 함수 나열
        var allClipFuncs = [];
        for (var prop in clip) {
            if (typeof clip[prop] === 'function') {
                allClipFuncs.push(prop);
            }
        }
        
        // 모든 트랙 함수 나열
        var allTrackFuncs = [];
        for (var tprop in track) {
            if (typeof track[tprop] === 'function') {
                allTrackFuncs.push(tprop);
            }
        }
        
        // 수동으로 JSON 문자열 생성 (ES3)
        var result = '{"clipMethods":["' + clipMethods.join('","') + '"]';
        result += ',"trackMethods":["' + trackMethods.join('","') + '"]';
        result += ',"qeMethods":["' + qeMethods.join('","') + '"]';
        result += ',"allClipFuncs":["' + allClipFuncs.join('","') + '"]';
        result += ',"allTrackFuncs":["' + allTrackFuncs.join('","') + '"]}';
        
        return result;
    } catch (e) {
        return '{"error":"' + e.toString() + '"}';
    }
}

/**
 * 현재 시퀀스의 Adjustment Layer 정보 수집 (both는 제외 - XML에서 편집됨)
 * @returns JSON 문자열 {adjustmentLayers: [{trackIndex, startTicks, endTicks, inPointTicks, outPointTicks, name}]}
 */
function getAdjustmentLayerInfo() {
    try {
        var seq = app.project.activeSequence;
        if (!seq) return '{"error":"시퀀스 없음"}';
        
        var layers = [];
        
        for (var v = 0; v < seq.videoTracks.numTracks; v++) {
            var track = seq.videoTracks[v];
            for (var c = 0; c < track.clips.numItems; c++) {
                var clip = track.clips[c];
                var name = clip.name || "";
                var lowerName = name.toLowerCase();
                
                // Adjustment Layer만 수집 (both는 XML에서 편집되므로 제외)
                if (lowerName.indexOf("adjustment") !== -1) {
                    var layerInfo = '{';
                    layerInfo += '"trackIndex":' + v + ',';
                    layerInfo += '"startTicks":"' + clip.start.ticks + '",';
                    layerInfo += '"endTicks":"' + clip.end.ticks + '",';
                    layerInfo += '"inPointTicks":"' + clip.inPoint.ticks + '",';
                    layerInfo += '"outPointTicks":"' + clip.outPoint.ticks + '",';
                    layerInfo += '"name":"' + name.replace(/"/g, '\\"') + '",';
                    layerInfo += '"type":"adjustment"';
                    
                    // projectItem 경로 (나중에 insertClip에 사용)
                    if (clip.projectItem && clip.projectItem.treePath) {
                        layerInfo += ',"projectItemPath":"' + clip.projectItem.treePath.replace(/"/g, '\\"') + '"';
                    }
                    
                    layerInfo += '}';
                    layers.push(layerInfo);
                }
            }
        }
        
        return '{"adjustmentLayers":[' + layers.join(',') + '],"count":' + layers.length + '}';
    } catch (e) {
        return '{"error":"' + e.toString().replace(/"/g, '\\"') + '"}';
    }
}

/**
 * 프로젝트에서 특수 아이템 찾기 (이름으로)
 * @param targetName - 찾을 아이템 이름 (예: "Adjustment Layer", "both")
 * @param rootItem - 시작 폴더 (기본: rootItem)
 */
function findProjectItemByName(targetName, rootItem) {
    if (!rootItem) rootItem = app.project.rootItem;
    var lowerTarget = targetName.toLowerCase();
    
    for (var i = 0; i < rootItem.children.numItems; i++) {
        var item = rootItem.children[i];
        var name = item.name || "";
        var lowerName = name.toLowerCase();
        
        // 이름 매칭 (adjustment는 부분 매칭, both는 정확히)
        if (lowerTarget === "both") {
            if (lowerName === "both") return item;
        } else if (lowerTarget.indexOf("adjustment") !== -1) {
            if (lowerName.indexOf("adjustment") !== -1) return item;
        } else {
            if (lowerName === lowerTarget) return item;
        }
        
        // 폴더면 재귀 탐색
        if (item.type === 2) { // ProjectItemType.BIN
            var found = findProjectItemByName(targetName, item);
            if (found) return found;
        }
    }
    
    return null;
}

/**
 * 프로젝트에서 Adjustment Layer 아이템 찾기 (하위 호환)
 */
function findAdjustmentLayerItem(rootItem) {
    return findProjectItemByName("adjustment", rootItem);
}

/**
 * 새 시퀀스에 특수 클립 삽입 (Adjustment Layer, both 등)
 * @param filePath - adjustment_layers.json 파일 경로
 * @returns JSON 결과
 */
function insertAdjustmentLayers(filePath) {
    try {
        var seq = app.project.activeSequence;
        if (!seq) return '{"success":false,"error":"시퀀스 없음"}';
        
        // 파일에서 JSON 읽기
        var file = new File(filePath);
        if (!file.exists) {
            return '{"success":false,"error":"파일 없음: ' + filePath + '"}';
        }
        
        file.open('r');
        var content = file.read();
        file.close();
        
        // JSON 파싱 (ES3 방식)
        var info;
        try {
            info = eval('(' + content + ')');
        } catch (parseErr) {
            return '{"success":false,"error":"JSON 파싱 실패: ' + parseErr.toString().replace(/"/g, '\\"') + '"}';
        }
        
        if (!info.adjustmentLayers || info.adjustmentLayers.length === 0) {
            return '{"success":true,"inserted":0,"message":"삽입할 특수 클립 없음"}';
        }
        
        var insertedCount = 0;
        var errors = [];
        
        for (var i = 0; i < info.adjustmentLayers.length; i++) {
            var layer = info.adjustmentLayers[i];
            var trackIdx = layer.trackIndex;
            var startTicks = layer.startTicks;
            var inPointTicks = layer.inPointTicks;
            var outPointTicks = layer.outPointTicks;
            var clipName = layer.name || "";
            var clipType = layer.type || "adjustment";
            
            // 프로젝트에서 해당 아이템 찾기
            var projectItem = findProjectItemByName(clipName);
            if (!projectItem) {
                // 이름으로 못 찾으면 타입으로 시도
                projectItem = findProjectItemByName(clipType);
            }
            
            if (!projectItem) {
                errors.push("프로젝트에서 찾을 수 없음: " + clipName);
                continue;
            }
            
            // 트랙 확인
            if (trackIdx >= seq.videoTracks.numTracks) {
                errors.push("트랙 없음: " + trackIdx);
                continue;
            }
            
            var track = seq.videoTracks[trackIdx];
            
            // insertClip(projectItem, startTime, trackIndex, takeVideo, takeAudio)
            // startTime은 초 단위
            var startSec = ticksToSeconds(startTicks);
            
            // insertClip 호출
            var inserted = track.insertClip(projectItem, startSec);
            
            if (inserted) {
                // 삽입된 클립의 in/out 포인트 조정
                var newClip = track.clips[track.clips.numItems - 1];
                if (newClip) {
                    // outPoint 조정 (길이 맞추기)
                    var newOut = newClip.outPoint;
                    newOut.ticks = String(outPointTicks);
                    newClip.outPoint = newOut;
                    
                    // end 조정 (타임라인 끝 위치)
                    var duration = parseFloat(outPointTicks) - parseFloat(inPointTicks);
                    var newEnd = newClip.end;
                    newEnd.ticks = String(parseFloat(startTicks) + duration);
                    newClip.end = newEnd;
                }
                insertedCount++;
            }
        }
        
        var errorStr = errors.length > 0 ? ',"errors":"' + errors.join('; ').replace(/"/g, '\\"') + '"' : '';
        return '{"success":true,"inserted":' + insertedCount + ',"total":' + info.adjustmentLayers.length + errorStr + '}';
    } catch (e) {
        return '{"success":false,"error":"' + e.toString().replace(/"/g, '\\"') + '"}';
    }
}
