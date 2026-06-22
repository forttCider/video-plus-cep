/**
 * videoPlus - AI 썸네일 테스트 모듈 (ExtendScript Host)
 * ES3 기반 - 세미콜론 필수, JSON은 문자열 직접 조립
 *
 * 기존 host/index.jsx 와 분리된 독립 모듈.
 * 모든 함수는 충돌 방지를 위해 tm_ 접두사를 사용한다.
 *
 * 이 파일은 panel(Node)에서 $.evalFile 로 로드된 뒤 호출된다.
 */

var TM_TICKS_PER_SECOND = 254016000000;

/**
 * JSON 문자열 값으로 안전하게 escape (경로의 백슬래시/따옴표 처리)
 */
function tm_jsonStr(s) {
    if (s === null || s === undefined) return "";
    s = String(s);
    s = s.replace(/\\/g, "\\\\");
    s = s.replace(/"/g, '\\"');
    return s;
}

/**
 * 연결 확인용
 */
function tm_testConnection() {
    return '{"success":true,"module":"thumbnail"}';
}

/**
 * 재생헤드 위치의 비디오 클립들을 위쪽 트랙(topmost) 순서로 반환.
 *
 * - PPro 트랙 인덱스: videoTracks[0] = V1(맨 아래), 인덱스 클수록 위쪽.
 *   화면 합성에서 topmost(가장 위 트랙)가 최종적으로 보이는 레이어이므로
 *   배열 첫 번째 = topmost 가 되도록 역순으로 담는다.
 * - 각 클립의 sourceTimeSeconds = inPoint + (playhead - start) 로 계산.
 *   (속도 변경/리매핑 클립은 MVP 범위 밖 — sourceTime 이 부정확할 수 있음)
 */
function tm_getPlayheadClips() {
    try {
        var seq = app.project.activeSequence;
        if (!seq) return '{"success":false,"error":"활성 시퀀스가 없습니다"}';

        var playhead = seq.getPlayerPosition();
        var playheadSeconds = playhead.seconds;
        var playheadTicks = String(playhead.ticks);

        var numTracks = seq.videoTracks.numTracks;
        var clips = [];

        // 위쪽 트랙부터(topmost first) 순회
        for (var i = numTracks - 1; i >= 0; i--) {
            var track = seq.videoTracks[i];
            if (!track || track.clips.numItems === 0) continue;

            for (var c = 0; c < track.clips.numItems; c++) {
                var clip = track.clips[c];
                var startTicks = parseFloat(clip.start.ticks);
                var endTicks = parseFloat(clip.end.ticks);
                var phTicks = parseFloat(playheadTicks);

                // 재생헤드를 포함하는 클립만 (start <= playhead < end)
                if (phTicks < startTicks || phTicks >= endTicks) continue;

                var mediaPath = "";
                var hasMedia = false;
                var isStillOrTitle = false;
                try {
                    if (clip.projectItem && clip.projectItem.getMediaPath) {
                        mediaPath = clip.projectItem.getMediaPath();
                        if (mediaPath && mediaPath.length > 0) hasMedia = true;
                    }
                } catch (mpErr) {
                    mediaPath = "";
                }

                // 소스 시각(초) = inPoint + (playhead - timelineStart)
                var sourceTimeSeconds =
                    clip.inPoint.seconds + (playheadSeconds - clip.start.seconds);
                if (sourceTimeSeconds < 0) sourceTimeSeconds = 0;

                // 정지영상/타이틀 추정: 미디어 경로 없거나 이미지 확장자
                if (!hasMedia) {
                    isStillOrTitle = true;
                } else {
                    var lower = mediaPath.toLowerCase();
                    if (
                        lower.indexOf(".png") !== -1 ||
                        lower.indexOf(".jpg") !== -1 ||
                        lower.indexOf(".jpeg") !== -1 ||
                        lower.indexOf(".psd") !== -1 ||
                        lower.indexOf(".ai") !== -1
                    ) {
                        isStillOrTitle = true;
                    }
                }

                var name = "";
                try { name = clip.name || ""; } catch (nErr) { name = ""; }

                // 클립이 실제 사용하는 소스 구간 [inPoint, outPoint] (초)
                var inSec = clip.inPoint.seconds;
                var outSec = clip.outPoint.seconds;
                var srcDuration = outSec - inSec;
                if (srcDuration < 0) srcDuration = 0;

                clips.push(
                    '{' +
                    '"trackIndex":' + i + ',' +
                    '"trackLabel":"V' + (i + 1) + '",' +
                    '"clipName":"' + tm_jsonStr(name) + '",' +
                    '"mediaPath":"' + tm_jsonStr(mediaPath.replace(/\\/g, '/')) + '",' +
                    '"hasMedia":' + hasMedia + ',' +
                    '"isStillOrTitle":' + isStillOrTitle + ',' +
                    '"sourceTimeSeconds":' + sourceTimeSeconds + ',' +
                    '"timelineStartSeconds":' + clip.start.seconds + ',' +
                    '"timelineEndSeconds":' + clip.end.seconds + ',' +
                    '"inPointSeconds":' + inSec + ',' +
                    '"outPointSeconds":' + outSec + ',' +
                    '"sourceDurationSeconds":' + srcDuration +
                    '}'
                );
                // 한 트랙당 재생헤드를 포함하는 클립은 하나뿐이므로 다음 트랙으로
                break;
            }
        }

        return '{"success":true,"playheadSeconds":' + playheadSeconds +
            ',"playheadTicks":"' + playheadTicks +
            '","numVideoTracks":' + numTracks +
            ',"clips":[' + clips.join(',') + ']}';
    } catch (e) {
        return '{"success":false,"error":"' + tm_jsonStr(e.toString()) + '"}';
    }
}

/**
 * 특정 비디오 트랙의 "모든 클립" 정보 반환 (재생헤드 무관).
 * 트랙 전체 구간에서 랜덤 캡쳐할 때 사용.
 */
function tm_getTrackClips(trackIndex) {
    try {
        var seq = app.project.activeSequence;
        if (!seq) return '{"success":false,"error":"활성 시퀀스가 없습니다"}';
        var ti = parseInt(trackIndex, 10);
        if (isNaN(ti) || ti < 0 || ti >= seq.videoTracks.numTracks) {
            return '{"success":false,"error":"트랙 인덱스 범위를 벗어남"}';
        }
        var track = seq.videoTracks[ti];
        var clips = [];
        for (var c = 0; c < track.clips.numItems; c++) {
            var clip = track.clips[c];
            var mediaPath = "";
            var hasMedia = false;
            try {
                if (clip.projectItem && clip.projectItem.getMediaPath) {
                    mediaPath = clip.projectItem.getMediaPath();
                    if (mediaPath && mediaPath.length > 0) hasMedia = true;
                }
            } catch (mpErr) { mediaPath = ""; }

            var isStillOrTitle = false;
            if (!hasMedia) {
                isStillOrTitle = true;
            } else {
                var lower = mediaPath.toLowerCase();
                if (lower.indexOf(".png") !== -1 || lower.indexOf(".jpg") !== -1 ||
                    lower.indexOf(".jpeg") !== -1 || lower.indexOf(".psd") !== -1 ||
                    lower.indexOf(".ai") !== -1) {
                    isStillOrTitle = true;
                }
            }

            var inSec = clip.inPoint.seconds;
            var outSec = clip.outPoint.seconds;
            var dur = outSec - inSec;
            if (dur < 0) dur = 0;

            var name = "";
            try { name = clip.name || ""; } catch (nErr) { name = ""; }

            clips.push(
                '{' +
                '"index":' + c + ',' +
                '"clipName":"' + tm_jsonStr(name) + '",' +
                '"mediaPath":"' + tm_jsonStr(mediaPath.replace(/\\/g, '/')) + '",' +
                '"hasMedia":' + hasMedia + ',' +
                '"isStillOrTitle":' + isStillOrTitle + ',' +
                '"inPointSeconds":' + inSec + ',' +
                '"outPointSeconds":' + outSec + ',' +
                '"sourceDurationSeconds":' + dur + ',' +
                '"timelineStartSeconds":' + clip.start.seconds + ',' +
                '"timelineEndSeconds":' + clip.end.seconds +
                '}'
            );
        }
        return '{"success":true,"trackIndex":' + ti + ',"trackLabel":"V' + (ti + 1) +
            '","clips":[' + clips.join(',') + ']}';
    } catch (e) {
        return '{"success":false,"error":"' + tm_jsonStr(e.toString()) + '"}';
    }
}
