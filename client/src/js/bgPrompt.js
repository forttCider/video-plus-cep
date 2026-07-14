/**
 * 배경 생성 프롬프트 상수 + 조립 헬퍼 (배치 파이프라인과 파트 상세가 공용).
 * 기존 BackgroundTab의 힌트/조립 로직을 추출한 것.
 *
 * 채널마다 다른 부분(스타일·효과·색 관습·레이아웃·무드)은 channels.js 프로파일에서 주입하고,
 * 여기 상수/함수는 채널 무관 공통 코어(텍스트 금지·로고 통합·크기 위계·합성)만 담는다.
 */
import { getChannel } from "./channels"

export const PROMPT_PRESETS = [
  "강렬한 빨강/노랑 방사형 폭발 배경",
  "도시 야경 보케 흐림 배경",
  "차분한 뉴스 스튜디오 느낌 배경",
  "돈/주식 차트 상승 그래픽 배경",
]
export const N_OPTIONS = [1, 2]
export const IMP_LABELS = { 3: "핵심", 2: "보조", 1: "배경" }

// 편성 단계에서 배정된 색 key → 부 헤더 표시용 라벨/점 (배경 색 강제는 하지 않음)
export const COLOR_DESC = {
  red: "위기·대결 (어둡고 극적)",
  gold: "재평가·호재 (밝고 화사)",
  teal: "에너지 (맑고 시원)",
  green: "성장 (밝고 생동)",
  blue: "하락 (차갑고 어두움)",
  purple: "기술 (미래적)",
}
export const COLOR_DOT = {
  red: "bg-red-500",
  gold: "bg-amber-400",
  teal: "bg-teal-400",
  green: "bg-green-500",
  blue: "bg-blue-500",
  purple: "bg-purple-500",
}

// 채널별 배경 스타일 힌트 (스타일 문장·효과·히어로 예시·색 관습·회피 풍경만 채널에서 주입, 나머지 구성 원칙은 공통)
function bgHint(ch) {
  return (
    " " +
    ch.styleLine +
    " 배경을 한 가지 색으로 물들이거나 단색화하지 말 것 — 국기·로고·차트·오브젝트의 고유색이 배경 위에서 또렷하고 다채롭게 살아나게. " +
    "구성(우선순위): " +
    `(1) 중앙에 '그 부의 사건을 압축한 장면형 히어로' 1개를 크고 선명하게 — 단순히 회사 로고를 띄우지 말고 상황을 보여주는 장면·상징물을 우선(예: ${ch.heroSceneExamples}). 히어로가 화면 높이의 절반~3분의 2를 차지하고 시선을 압도. ` +
    `(2) 분위기 효과를 화면에 '크게' 깔아 드라마를 만든다(작은 장식이 아니라 화면을 채우는 주요 요소): ${ch.effects}. 주제에 맞는 효과 1종을 크게. ` +
    (ch.flagClause || "") +
    `(4) 차트·화살표·지도·부차 로고는 작게 보조로만(큰 화살표를 크게 그리지 말 것). 방향성 그래픽 색은 의미대로 — ${ch.colorConvention}. ` +
    `주제가 한눈에 안 읽히는 밋밋한 일반 풍경(${ch.avoidScenes})을 화면을 크게 채우는 배경 장면으로 쓰지 말 것 — 배경 장면도 그 부의 주제를 분명히 드러내는 것이어야 하며, 뜬금없는 풍경으로 오른쪽/화면 대부분을 채우지 말 것. ` +
    "여러 요소를 같은 크기로 욱여넣은 콜라주 금지, 히어로 1개에 시선 집중. 클릭을 부르는 강렬하고 또렷한 가로 16:9 배경."
  )
}

// 텍스트/로고 규칙 — 채널이 브랜드 로고를 허용하는지(allowBrandLogos)에 따라 달라진다.
function noTextHint(ch) {
  if (ch && ch.allowBrandLogos) {
    return (
      " 브랜드 로고·기업명 워드마크는 실제 모양 그대로(정확한 철자로) 넣어도 된다 — 로고 안의 글자는 허용(예: SAMSUNG, SK hynix, Palantir, BYD 등). 단, 그 외의 임의 글자·캡션·라벨·설명 문구·지도 지명·국가명·차트 수치·워터마크는 넣지 말 것(AI가 지어낸 엉터리 글자는 조잡해 보임). 제목은 편집에서 따로 얹으므로, 배경에는 로고 워드마크 외의 텍스트가 없어야 한다. 로고는 화면 위에 평면으로 얹지 말 것 — 반드시 장면 안 '실제 표면'에 얹혀 그 장면의 일부처럼 보이게 하라: 제품·기기 몸체나 화면, 공장·건물 외벽 간판, 차량 차체, 현수막/배너/깃발, 전시 부스 벽면 등 물리적 표면 위에 원근과 곡률에 맞춰 얹고, 장면의 조명·그림자·색조·반사를 그대로 받게 하라(표면이 휘면 로고도 휘고, 측면 조명이면 로고에도 같은 방향 그림자·하이라이트). 자연스러운 표면이 없으면 은은하게 발광하는 홀로그램/입체 엠블럼으로 공간감 있게 통합할 것. ⚠️ 딱딱한 사각 테두리로 오려붙인 평면 스티커, 화면 앞에 붕 떠 있는 로고, 장면과 조명·원근이 따로 노는 로고는 금지."
    )
  }
  // 브랜드 미허용 채널(건강 등) — 어떤 글자·로고·깃발도 금지
  return " 화면에 어떤 글자·로고도 넣지 말 것 — 성분명(비타민C 등)·제품명·브랜드 로고·기업명·깃발·캡션·라벨·설명 문구·차트 수치·워터마크를 지어내 넣지 마라. 특히 알약·정제·캡슐·제품 표면에 글자나 로고를 새기지 말고 '민무늬'로 그릴 것(AI가 그린 글자·로고는 깨지거나 가짜라 조잡하다 — 한글도 엉터리로 깨짐). 존재하지 않는 브랜드나 깃발을 지어내지 말 것. 제목·화살표·자막은 편집에서 따로 얹으므로, 배경에는 텍스트가 전혀 없어야 한다."
}

const ADAPT_HINT =
  " 제공된 요소 이미지는 그대로 붙여넣지 말고 참고용으로만 사용할 것. 장면에 어울리도록 크기·각도·개수·형태를 자유롭게 변형하고 재해석해도 된다(예: 인물은 더 작게, 반도체는 여러 개로 다양한 형태로). 똑같이 복제하기보다 전체 구도와 자연스럽게 어우러지는 것을 최우선으로."
const COHESION_HINT =
  " 모든 요소를 하나의 장면으로 자연스럽게 합성할 것 — 빛의 방향과 색감, 원근, 비율, 그림자를 통일하고, 요소끼리 이질감 없이 어우러지게 해서 스티커를 붙인 것처럼 떠 보이지 않게. 전체적으로 사실적이고 조화로운 합성 이미지. 특히 제공된 로고 이미지는 원본을 그대로 오려 화면 위에 얹지 말고, 장면 안 실제 표면(제품·기기·건물 간판·차체·현수막 등) 위에 원근·곡률·조명·그림자를 맞춰 다시 얹혀 있는 것처럼 재렌더링할 것 — 로고만 평면으로 떠 보이면 안 된다."
const COMPOSE_HINT = " 위 요소 이미지들은 화면 가운데~왼쪽 위주로 크게 배치할 것." + ADAPT_HINT + COHESION_HINT

// 채널별 레이아웃(컷아웃 자리·제목 위치 등)
function layoutHint(ch) {
  return " " + ch.layout
}

const HIERARCHY_HINT =
  " 모든 요소를 같은 크기로 욱여넣지 말 것. 명확한 크기 위계를 만들어라 — '핵심'으로 표시된 1~2개에 시선이 집중되도록 화면 가운데~왼쪽에 다른 요소보다 크고 선명하게 배치하되, 화면을 꽉 채우거나 가장자리에 잘릴 만큼 과하게 키우지 말고 주위에 적당한 여백을 둘 것(핵심이 화면 높이의 절반~3분의 2 정도). '보조'는 그보다 작게 핵심 주변에, '배경'으로 표시된 요소는 작고 흐리게 분위기용으로만 깔 것. 비중이 낮은 요소를 크게 그리거나 화면을 콜라주처럼 균등하게 꽉 채우지 말 것."

// 부 색(편성이 감정·각도로 배정) → 명암·분위기 신호 (색으로 화면을 물들이지 않고 명암/무드만).
// 색→무드 매핑은 채널 프로파일(moodMap)에서 가져온다.
function moodHint(color, ch) {
  const d = ch && ch.moodMap && ch.moodMap[color]
  return d
    ? ` 이 부의 전체 명암·분위기는 '${d}'로 잡을 것 — 색으로 화면을 물들이지 말고 명암과 분위기만 그렇게 하고, 오브젝트·국기·로고의 고유색은 유지.`
    : ""
}

/** [{name, importance}] → "핵심(...): A, B / 보조(...): C / 배경(...): D" */
export function tierLines(items) {
  const byTier = { 3: [], 2: [], 1: [] }
  ;(items || []).forEach((it) => {
    const name = (it.name || "").trim()
    if (!name) return
    const imp = it.importance >= 1 && it.importance <= 3 ? it.importance : 2
    byTier[imp].push(name)
  })
  const parts = []
  if (byTier[3].length)
    parts.push(`핵심(화면을 지배하게 가장 크고 선명하게): ${byTier[3].join(", ")}`)
  if (byTier[2].length) parts.push(`보조(중간 크기, 핵심 주변에): ${byTier[2].join(", ")}`)
  if (byTier[1].length) parts.push(`배경(작게·흐리게 분위기용으로만): ${byTier[1].join(", ")}`)
  return parts.join(" / ")
}

/**
 * 이미 생성된 배경을 지시대로 수정할 때의 프롬프트.
 * 전체 구도·스타일은 유지하고 지시한 부분만 바꾸도록.
 */
export function buildEditPrompt({ instruction = "", color = null, channelId = null }) {
  const ch = getChannel(channelId)
  const ins = (instruction || "").trim()
  return (
    "이 유튜브 썸네일 배경 이미지를 아래 지시대로 수정해줘. 지시한 부분만 바꾸고, 전체 구도·요소·색감·스타일은 최대한 그대로 유지할 것." +
    (ins ? ` 지시: ${ins}.` : "") +
    moodHint(color, ch) +
    layoutHint(ch) +
    noTextHint(ch)
  )
}

/**
 * 배경 생성 프롬프트 조립.
 * @param {object} o { subjects, selectedEls, finalPrompt }
 *   - subjects: 추출/편집된 요소 [{name, importance, category}]
 *   - selectedEls: 선택한 요소 이미지 [{name, path}] (있으면 합성 경로)
 *   - finalPrompt: 추가 지시사항(선택)
 * @returns {{ prompt, useCompose, selectedPaths }}
 */
export function buildBgPrompt({
  subjects = [],
  selectedEls = [],
  finalPrompt = "",
  color = null,
  channelId = null,
}) {
  const ch = getChannel(channelId)
  const extra = (finalPrompt || "").trim()
  const extraPart = extra ? ` 추가 지시사항: ${extra}` : ""
  const mood = moodHint(color, ch)
  const BG = bgHint(ch)
  const LAYOUT = layoutHint(ch)

  if (selectedEls.length) {
    // 비중 목록은 '전체 요소' 기준 (참고 이미지가 없는 요소도 장면에 직접 그려지도록)
    const selectedNames = selectedEls.map((e) => e.name)
    const tierText = tierLines(subjects.length ? subjects : selectedEls)
    const tierPart = tierText ? ` 요소별 비중 — ${tierText}.` : ""
    // 참고 이미지가 제공되지 않은 요소 → 모델이 직접 그리도록 명시
    const drawNames = subjects
      .map((s) => (s.name || "").trim())
      .filter((n) => n && !selectedNames.includes(n))
    const drawPart = drawNames.length
      ? ` 이 중 참고 이미지가 제공되지 않은 요소(${drawNames.join(", ")})는 네가 장면에 직접 그려 넣어라.`
      : ""
    const prompt =
      "제공된 요소 이미지들을 활용해 유튜브 썸네일용 배경 이미지를 만들어줘." +
      mood +
      tierPart +
      drawPart +
      extraPart +
      COMPOSE_HINT +
      BG +
      HIERARCHY_HINT +
      LAYOUT +
      noTextHint(ch)
    return { prompt, useCompose: true, selectedPaths: selectedEls.map((e) => e.path) }
  }

  const tierText = tierLines(subjects)
  const subjectsPart = tierText
    ? ` 다음 요소들을 중요도에 따라 비중을 다르게 배치할 것 — ${tierText}.`
    : ""
  const prompt =
    "유튜브 썸네일용 배경 이미지를 만들어줘." +
    mood +
    subjectsPart +
    extraPart +
    BG +
    HIERARCHY_HINT +
    LAYOUT +
    noTextHint(ch)
  return { prompt, useCompose: false, selectedPaths: [] }
}
