# videoPlus CEP

Premiere Pro CEP 확장 - 음성 받아쓰기 + 자막 편집 + 무음/간투사 일괄 제거

## 구조

```
videoPlusCEP/
├── CSXS/manifest.xml        # CEP 매니페스트 (PPro 25.x ~ 26.x)
├── client/                   # React 프론트엔드
│   ├── public/index.html
│   ├── src/
│   │   ├── components/       # React 컴포넌트
│   │   ├── js/
│   │   │   ├── cep-bridge.js # CSInterface ↔ ExtendScript 통신
│   │   │   ├── split/        # 클립 편집 (razor 기반)
│   │   │   └── merge/        # 클립 병합
│   │   └── store/            # Jotai 상태관리
│   ├── package.json
│   └── webpack.config.js
├── host/                     # ExtendScript (PPro 자동화)
│   └── index.jsx             # razor, deleteTimeRange 등
├── scripts/
│   ├── link.js               # 심볼릭 링크 (개발용)
│   └── unlink.js
├── .debug                    # 디버그 포트 설정
└── package.json
```

## CEP vs UXP 핵심 차이

| 기능 | UXP (기존) | CEP (현재) |
|------|-----------|-----------|
| 클립 분할 | clone+trim+ripple 6단계 | **razor 1줄** |
| 구간 삭제 | 6트랜잭션 + 딜레이 | **razor+extract 3줄** |
| 브라우저 API | 제한적 (no ResizeObserver) | **완전한 Chromium** |
| Node.js | 없음 | **지원** |
| React | 16 (shim 필요) | **18 (네이티브)** |
| 성능 | lockedAccess 병목 | **직접 DOM 접근** |

## 설치 & 실행

```bash
# 1. 디버그 모드 활성화 (최초 1회)
defaults write com.adobe.CSXS.12 PlayerDebugMode 1

# 2. 클라이언트 빌드
cd client && npm install && npm run build

# 3. CEP 확장 폴더에 링크
node scripts/link.js

# 4. Premiere Pro 재시작 → Window > Extensions > videoPlus
```

## 개발 모드

```bash
cd client && npm run dev   # webpack --watch
# Chrome에서 http://localhost:8088 로 디버그 가능
```
