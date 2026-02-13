/* videoPlus - Client-side JavaScript */

// 1) CSInterface 인스턴스 생성
var csInterface = new CSInterface();

// 2) 상태 표시 함수
function setStatus(message, isError) {
    var status = document.getElementById('status');
    status.innerHTML = '상태: ' + message;
    status.className = isError ? 'error' : 'success';
}

// 2.5) 로그 추가
function addLog(message) {
    var logDiv = document.getElementById('log');
    if (logDiv) {
        logDiv.innerHTML += message + '<br>';
    }
}

// 3) 연결 테스트 버튼
document.getElementById('btn-test').addEventListener('click', function() {
    setStatus('ExtendScript 로드 및 테스트 중...');
    
    // jsx 경로 확인
    var extPath = csInterface.getSystemPath(SystemPath.EXTENSION) + "/host/index.jsx";
    addLog('경로: ' + extPath);
    
    // jsx 로드
    csInterface.evalScript('$.evalFile("' + extPath + '")', function(loadResult) {
        addLog('로드 결과: ' + loadResult);
        
        // 테스트 함수 호출
        csInterface.evalScript('testConnection()', function(result) {
            addLog('테스트 결과: ' + result);
            if (result && result !== 'EvalScript error.' && result !== 'undefined') {
                setStatus('성공! ' + result, false);
            } else {
                setStatus('연결 실패: ' + result, true);
            }
        });
    });
});

// 4) 앱 정보 버튼
document.getElementById('btn-app').addEventListener('click', function() {
    setStatus('앱 정보 조회 중...');
    
    var extPath = csInterface.getSystemPath(SystemPath.EXTENSION) + "/host/index.jsx";
    csInterface.evalScript('$.evalFile("' + extPath + '")', function(loadResult) {
        csInterface.evalScript('testApp()', function(result) {
            addLog('앱 정보: ' + result);
            setStatus('앱 정보 - 로그 확인', false);
        });
    });
});

// 5) 시퀀스 정보 버튼
document.getElementById('btn-seq').addEventListener('click', function() {
    setStatus('시퀀스 정보 조회 중...');
    
    var extPath = csInterface.getSystemPath(SystemPath.EXTENSION) + "/host/index.jsx";
    csInterface.evalScript('$.evalFile("' + extPath + '")', function(loadResult) {
        csInterface.evalScript('getActiveSequenceInfo()', function(result) {
            addLog('시퀀스 결과: ' + result);
            if (result && result !== 'EvalScript error.' && result !== 'undefined') {
                try {
                    var info = JSON.parse(result);
                    if (info && info.name) {
                        setStatus('시퀀스: ' + info.name, false);
                    } else if (info && info.error) {
                        setStatus('오류: ' + info.error, true);
                    } else {
                        setStatus('시퀀스를 열어주세요', true);
                    }
                } catch (e) {
                    setStatus('결과: ' + result, false);
                }
            } else {
                setStatus('오류: ' + result, true);
            }
        });
    });
});

// 5) 초기화
setStatus('준비 완료 - 버튼을 클릭하세요');
addLog('CSInterface 로드됨');
addLog('Extension Path: ' + csInterface.getSystemPath(SystemPath.EXTENSION));
