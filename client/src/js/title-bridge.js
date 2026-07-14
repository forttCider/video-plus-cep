/**
 * 썸네일 제목 추천 - Claude(Anthropic) 브리지
 *
 * 받아쓰기 요약/직접입력 맥락 + 채널별 예시(headlineExamples)를 few-shot으로 주고
 * 채널 스타일의 2줄 썸네일 제목 후보 N개를 생성한다.
 *
 * 브라우저 fetch의 CORS 회피를 위해 Node https.request 사용 (이미지 브리지와 동일).
 */
import { loadConfig } from "./personimage-bridge"
import { getChannel } from "./channels"

/** 활성 채널 목록/기본값 조회 ({ channels, activeChannel }) */
export function loadChannels() {
  const cfg = loadConfig()
  return {
    channels: cfg.channels || {},
    activeChannel: cfg.activeChannel || Object.keys(cfg.channels || {})[0] || "",
  }
}

// 부별 색 팔레트 — 편성 단계에서 각 부의 감정/각도에 맞게, 부끼리 겹치지 않게 배정
const PART_COLOR_KEYS = ["red", "gold", "teal", "green", "blue", "purple"]
const normPartColor = (c) => (PART_COLOR_KEYS.includes(c) ? c : null)
const COLOR_RULE_TEXT =
  `각 부에 색(color)도 배정하라. 업종(전기차·배터리 등)이 아니라 그 부의 '감정·각도'에 맞는 색을 아래에서 고를 것:\n` +
  `- red: 위기·대결·경쟁·붕괴\n` +
  `- gold: 재평가·금융·호재·수익 상승\n` +
  `- teal: 에너지·전력·배터리 셀\n` +
  `- green: 친환경·성장\n` +
  `- blue: 폭락·하락·냉각\n` +
  `- purple: 기술·AI·반도체\n`

/**
 * 요약 세그먼트를 질문 흐름(주제 응집도) 기준으로 정확히 N개 '부'로 편성 (Claude).
 * @param {Array} segments  summary 세그먼트 배열 ({segment_index, topic, start_time, end_time})
 * @param {number} numParts  부 개수 N
 * @param {object} opts  { apiKey, model }
 * @returns {Promise<{success, parts?:Array<{part,title,segments:number[]}>, error?, status?}>}
 */
export async function splitIntoParts(segments, numParts, opts = {}) {
  const cfg = loadConfig()
  const apiKey = opts.apiKey || cfg.claudeApiKey
  if (!apiKey)
    return { success: false, error: "Claude API 키가 없습니다 (config.json claudeApiKey)." }
  const segs = (segments || []).filter((s) => s && s.segment_index != null)
  if (!segs.length) return { success: false, error: "요약 구간이 없습니다." }
  const N = Math.max(1, Math.min(5, parseInt(numParts, 10) || 1))

  const https = require("https")
  const model = opts.model || cfg.titleModel || "claude-sonnet-4-6"

  const list = segs
    .map((s) => {
      const t = s.start_time || s.end_time ? ` (${s.start_time || ""}~${s.end_time || ""})` : ""
      return `[${s.segment_index}] ${s.topic || "구간"}${t}`
    })
    .join("\n")

  const systemPrompt =
    `너는 한국 시사·경제 유튜브 편집 보조다. 한 편의 긴 인터뷰/방송 받아쓰기 요약의 '구간(segment)' 목록을 보고, 편집자가 1부/2부/... 로 나누듯 정확히 ${N}개 '부'로 편성한다.\n` +
    `규칙:\n` +
    `1. 부는 시간 균등이 아니라 '주제 응집도(질문 블록)' 기준으로 나눈다. 주제 클러스터가 바뀌는 지점이 부 경계.\n` +
    `2. 맨 앞 인트로 구간(도입 인사·자기소개·출연자 소개·주제 예고 등 '본론 시작 전 도입부')은 어느 부에도 넣지 말고 제외한다(segments에서 빼라). 인트로를 뺀 '나머지 모든 구간'을 정확히 ${N}개 부로 묶는다(한 부 안의 구간은 연속). 인트로 외에는 어떤 구간도 빠뜨리지 말 것.\n` +
    `3. '짧은 배경 소개 구간 + 뒤이은 본답변 구간'은 한 세트다 — 절대 서로 다른 부로 쪼개지 말 것. 짧은 인지/반응 구간은 바로 다음 본문 구간과 같은 부에 넣는다. (단 규칙 2의 맨 앞 인트로는 예외로 제외)\n` +
    `4. 마무리(총평·인사) 구간은 마지막 부에 붙인다. (맨 앞 인트로는 규칙 2에 따라 제외)\n` +
    `5. 각 부에 그 부의 주제를 대표하는 짧은 소제목을 단다.\n` +
    `6. 균형은 참고만, 규칙 1·3이 우선.\n` +
    `7. ${COLOR_RULE_TEXT}` +
    `- 반드시 JSON 배열만 출력. 설명/마크다운 금지.\n` +
    `형식: [{"part":1,"title":"완성차 격변·대결","color":"red","segments":[0,1,2,3]},{"part":2,"title":"셀·ESS 상승","color":"teal","segments":[4,5,6]}]\n` +
    `segments 값은 위 목록의 대괄호 안 번호를 그대로 쓴다.`

  const payload = JSON.stringify({
    model,
    max_tokens: 1500,
    system: systemPrompt,
    messages: [
      {
        role: "user",
        content: `# 구간 목록 (총 ${segs.length}개)\n${list}\n\n위를 정확히 ${N}개 '부'로 편성해 JSON 배열로만 출력해줘.`,
      },
    ],
  })

  return new Promise((resolve) => {
    const req = https.request(
      {
        hostname: "api.anthropic.com",
        path: "/v1/messages",
        method: "POST",
        headers: {
          "x-api-key": apiKey,
          "anthropic-version": "2023-06-01",
          "Content-Type": "application/json",
          "Content-Length": Buffer.byteLength(payload),
        },
      },
      (res) => {
        const chunks = []
        res.on("data", (c) => chunks.push(c))
        res.on("end", () => {
          const raw = Buffer.concat(chunks).toString("utf8")
          let json
          try {
            json = JSON.parse(raw)
          } catch (e) {
            return resolve({ success: false, error: "응답 파싱 실패: " + raw.slice(0, 200) })
          }
          if (res.statusCode !== 200)
            return resolve({
              success: false,
              error: (json.error && json.error.message) || `HTTP ${res.statusCode}`,
              status: res.statusCode,
            })
          const text = (json.content || [])
            .map((b) => (b.type === "text" ? b.text : ""))
            .join("")
          const parts = parseParts(text, segs, N)
          if (!parts) resolve({ success: false, error: "부 편성 결과를 파싱하지 못했습니다." })
          else resolve({ success: true, parts })
        })
      },
    )
    req.on("error", (e) => resolve({ success: false, error: "네트워크 오류: " + e.message }))
    req.write(payload)
    req.end()
  })
}

/** 시간순 균등 N등분 (fallback) */
function evenSplit(segs, N) {
  const per = Math.ceil(segs.length / N)
  const parts = []
  for (let i = 0; i < N; i++) {
    const chunk = segs.slice(i * per, (i + 1) * per)
    if (chunk.length)
      parts.push({ part: i + 1, title: `${i + 1}부`, segments: chunk.map((s) => s.segment_index) })
  }
  return parts
}

/** 모델 출력에서 부 편성 배열 추출 → [{part,title,segments:number[]}] (검증 + 누락 보정) */
function parseParts(text, segs, N) {
  const validIds = new Set(segs.map((s) => s.segment_index))
  const match = text && text.match(/\[[\s\S]*\]/)
  let arr
  if (match) {
    try {
      arr = JSON.parse(match[0])
    } catch (e) {}
  }
  if (!Array.isArray(arr) || !arr.length) return evenSplit(segs, N)

  const seen = new Set()
  const parts = arr
    .map((o, i) => {
      const ids = (Array.isArray(o?.segments) ? o.segments : [])
        .map((v) => parseInt(v, 10))
        .filter((v) => validIds.has(v) && !seen.has(v))
      ids.forEach((v) => seen.add(v))
      return {
        part: i + 1,
        title: String(o?.title || `${i + 1}부`).trim(),
        color: normPartColor(o?.color),
        segments: ids,
      }
    })
    .filter((p) => p.segments.length)

  if (!parts.length) return evenSplit(segs, N)

  // 누락된 구간은 시간상 가장 가까운(직전) 부에 붙인다 — 단, '맨 앞 인트로'는 예외.
  // 배정된 첫 구간보다 앞선(작은 index) 누락은 의도적으로 제외한 인트로이므로 채우지 않는다.
  // (중간/뒤에서 실수로 빠진 본문 구간만 되살린다)
  const assignedMin = seen.size ? Math.min(...seen) : Infinity
  const missing = segs.map((s) => s.segment_index).filter((id) => !seen.has(id))
  missing.forEach((id) => {
    if (id < assignedMin) return // 맨 앞 인트로 등 의도적 제외 → 채우지 않음
    // id보다 작은 마지막 id를 포함한 부를 찾음, 없으면 첫 부
    let target = parts[0]
    for (const p of parts) {
      if (Math.min(...p.segments) <= id) target = p
    }
    target.segments.push(id)
  })
  parts.forEach((p) => p.segments.sort((a, b) => a - b))
  return parts
}

/**
 * 분할(그룹)은 그대로 두고, 각 부의 현재 내용에 맞는 짧은 소제목(라벨)만 다시 생성.
 * 구간을 재조합하면 자동 호출된다. 단순 작업이라 기본 Haiku(저렴).
 * @param {Array<{part:number, topics:string[]}>} groups  부별 구간 주제 목록
 * @param {object} opts  { apiKey, model }
 * @returns {Promise<{success, titles?:{[part:number]:string}, error?, status?}>}
 */
export async function relabelParts(groups, opts = {}) {
  const cfg = loadConfig()
  const apiKey = opts.apiKey || cfg.claudeApiKey
  if (!apiKey)
    return { success: false, error: "Claude API 키가 없습니다 (config.json claudeApiKey)." }
  const valid = (groups || []).filter((g) => g && g.topics && g.topics.length)
  if (!valid.length) return { success: false, error: "라벨을 붙일 부가 없습니다." }

  const https = require("https")
  const model = opts.model || cfg.relabelModel || "claude-haiku-4-5"
  const block = valid.map((g) => `${g.part}부: ${g.topics.join(" / ")}`).join("\n")

  const systemPrompt =
    `각 '부'에 담긴 구간 주제 목록을 보고, 그 부의 내용을 한 눈에 보여주는 짧은 한국어 소제목(15자 내외)과 색(color)을 붙여라.\n` +
    COLOR_RULE_TEXT +
    `반드시 JSON 배열만 출력. 설명/마크다운 금지. 형식: [{"part":1,"title":"완성차 격변·대결","color":"red"}]`

  const payload = JSON.stringify({
    model,
    max_tokens: 600,
    system: systemPrompt,
    messages: [
      { role: "user", content: `${block}\n\n각 부의 소제목을 JSON 배열로만 출력해줘.` },
    ],
  })

  return new Promise((resolve) => {
    const req = https.request(
      {
        hostname: "api.anthropic.com",
        path: "/v1/messages",
        method: "POST",
        headers: {
          "x-api-key": apiKey,
          "anthropic-version": "2023-06-01",
          "Content-Type": "application/json",
          "Content-Length": Buffer.byteLength(payload),
        },
      },
      (res) => {
        const chunks = []
        res.on("data", (c) => chunks.push(c))
        res.on("end", () => {
          const raw = Buffer.concat(chunks).toString("utf8")
          let json
          try {
            json = JSON.parse(raw)
          } catch (e) {
            return resolve({ success: false, error: "응답 파싱 실패: " + raw.slice(0, 200) })
          }
          if (res.statusCode !== 200)
            return resolve({
              success: false,
              error: (json.error && json.error.message) || `HTTP ${res.statusCode}`,
              status: res.statusCode,
            })
          const text = (json.content || [])
            .map((b) => (b.type === "text" ? b.text : ""))
            .join("")
          const m = text.match(/\[[\s\S]*\]/)
          let arr
          if (m) {
            try {
              arr = JSON.parse(m[0])
            } catch (e) {}
          }
          if (!Array.isArray(arr))
            return resolve({ success: false, error: "라벨 파싱 실패" })
          const titles = {}
          const colors = {}
          arr.forEach((o) => {
            const p = parseInt(o?.part, 10)
            const t = String(o?.title || "").trim()
            if (p && t) titles[p] = t
            const c = normPartColor(o?.color)
            if (p && c) colors[p] = c
          })
          resolve({ success: true, titles, colors })
        })
      },
    )
    req.on("error", (e) => resolve({ success: false, error: "네트워크 오류: " + e.message }))
    req.write(payload)
    req.end()
  })
}

/**
 * @param {object} opts
 *   { context, channel, count, apiKey, model }
 *   - context: 영상 맥락 텍스트 (받아쓰기 요약 또는 직접입력)
 *   - channel: 채널 slug (config.channels 키)
 *   - count: 생성할 후보 개수 (기본 10)
 * @returns {Promise<{success, titles?:string[], error?, status?}>}
 */
export async function generateTitles(opts = {}) {
  const cfg = loadConfig()
  const apiKey = opts.apiKey || cfg.claudeApiKey
  if (!apiKey)
    return { success: false, error: "Claude API 키가 없습니다 (config.json claudeApiKey)." }

  const context = (opts.context || "").trim()
  if (!context)
    return { success: false, error: "영상 맥락(요약 또는 직접 입력)이 필요합니다." }

  const https = require("https")
  const model = opts.model || cfg.titleModel || "claude-sonnet-4-6"
  const count = Math.max(1, Math.min(20, opts.count || 10))

  const channelSlug = opts.channel || cfg.activeChannel
  const channel = (cfg.channels || {})[channelSlug] || {}
  const examples = channel.headlineExamples || []
  const channelName = channel.displayName || channelSlug || "채널"

  const exampleBlock = examples.length
    ? examples.map((e, i) => `예시 ${i + 1}:\n${e}`).join("\n\n")
    : "(예시 없음 — 자극적이고 클릭을 유도하는 한국어 유튜브 썸네일 제목 스타일)"

  const systemPrompt =
    `너는 한국 유튜브 채널 "${channelName}"의 썸네일 제목 카피라이터다. ` +
    `아래 예시들의 톤·말투·길이·줄바꿈(2줄) 스타일을 그대로 따라, 주어진 영상 내용에 맞는 제목을 만든다.\n\n` +
    `# 채널 제목 예시\n${exampleBlock}\n\n` +
    `# 규칙\n` +
    `- 기본은 2줄 구성(줄바꿈 \\n 1개). 대부분의 후보를 2줄로 만들 것.\n` +
    `- 강한 발언/인용구를 맨 윗줄에 따옴표("...")로 따로 둔 3줄 형태는 "가끔만" 사용 — 전체 후보 중 1/3 이하로 제한.\n` +
    `- 호기심/충격/이득을 자극하되 영상 내용과 어긋나지 않게.\n` +
    `- 후보 ${count}개를 서로 다른 각도로.\n` +
    `# 글자 색 (핵심)\n` +
    `- 각 제목을 색 세그먼트(parts) 배열로 표현한다. 기본 글자색은 "white"(흰색).\n` +
    `- 실제 썸네일처럼 "펀치가 되는 단어/구절"에만 강조색을 찍고 나머지는 흰색으로 둘 것. 한 줄 전체를 한 색으로 칠하지 말 것.\n` +
    `- 강조색: "yellow"=가장 강한 강조(핵심 구절), "red"=위험·폭락·경고·충격·붕괴 키워드, "green"=기회·상승·호재·이득 키워드.\n` +
    `- 한 제목에 보통 흰색 + 강조색 1~2종. 색을 남발하지 말 것.\n` +
    `- 줄바꿈은 part의 text 안에 \\n 으로 넣는다.\n` +
    `- 반드시 JSON 배열(객체 배열)만 출력. 설명/마크다운 금지.\n` +
    `형식: [{"parts":[{"text":"금값 52년만의 대폭락","color":"yellow"},{"text":"\\n곧 ","color":"white"},{"text":"무시무시한 일 터진다","color":"red"}]},{"parts":[{"text":"지금 안팔면 ","color":"white"},{"text":"'이렇게'","color":"green"},{"text":" 된다","color":"white"}]}]`

  const payload = JSON.stringify({
    model,
    max_tokens: 2200,
    system: systemPrompt,
    messages: [
      {
        role: "user",
        content: `# 영상 내용\n${context}\n\n위 영상의 썸네일 제목 후보 ${count}개를 색 세그먼트(parts) JSON 배열로만 출력해줘.`,
      },
    ],
  })

  return new Promise((resolve) => {
    const req = https.request(
      {
        hostname: "api.anthropic.com",
        path: "/v1/messages",
        method: "POST",
        headers: {
          "x-api-key": apiKey,
          "anthropic-version": "2023-06-01",
          "Content-Type": "application/json",
          "Content-Length": Buffer.byteLength(payload),
        },
      },
      (res) => {
        const chunks = []
        res.on("data", (c) => chunks.push(c))
        res.on("end", () => {
          const raw = Buffer.concat(chunks).toString("utf8")
          let json
          try {
            json = JSON.parse(raw)
          } catch (e) {
            resolve({ success: false, error: "응답 파싱 실패: " + raw.slice(0, 200) })
            return
          }
          if (res.statusCode !== 200) {
            resolve({
              success: false,
              error: (json.error && json.error.message) || `HTTP ${res.statusCode}`,
              status: res.statusCode,
            })
            return
          }
          const text = (json.content || [])
            .map((b) => (b.type === "text" ? b.text : ""))
            .join("")
          const titles = parseTitles(text)
          if (!titles.length)
            resolve({ success: false, error: "제목을 파싱하지 못했습니다." })
          else resolve({ success: true, titles })
        })
      },
    )
    req.on("error", (e) => resolve({ success: false, error: "네트워크 오류: " + e.message }))
    req.write(payload)
    req.end()
  })
}

/**
 * 영상 요약에서 썸네일에 쓸 "구체적 시각 요소" 추출 (Claude).
 * 전투기/제품/브랜드/국기/인물 등 → 각 요소에 이미지 생성용 프롬프트 포함.
 * @param {string} context - 영상 요약/맥락 텍스트
 * @param {object} opts { apiKey, model }
 * @returns {Promise<{success, subjects?:Array<{name,category,prompt}>, error?, status?}>}
 */
export async function extractBackgroundSubjects(context, opts = {}) {
  const cfg = loadConfig()
  const apiKey = opts.apiKey || cfg.claudeApiKey
  if (!apiKey)
    return { success: false, error: "Claude API 키가 없습니다 (config.json claudeApiKey)." }
  const ctx = (context || "").trim()
  if (!ctx) return { success: false, error: "영상 맥락(요약)이 필요합니다." }

  const https = require("https")
  const model = opts.model || cfg.titleModel || "claude-sonnet-4-6"

  const ch = getChannel(opts.channelId)
  const typesBlock = ch.elementTypes.map((t) => `- ${t}`).join("\n")

  const moodClause = opts.mood
    ? `- 이 부의 감정·무드는 '${opts.mood}'다. 요소를 이 무드에 맞게 뽑아라 — 위기·대결·폭락 같은 어두운 무드면 트로피·메달·폭죽·색종이 등 승리·축하 상징은 뽑지 말 것(무드와 모순됨), 호재·상승 무드면 그런 축하 요소도 괜찮다.\n`
    : ""

  const systemPrompt =
    `너는 ${ch.domain} 유튜브 썸네일 디자이너의 보조다. 영상의 핵심 주제와 감정(${ch.emotions})을 먼저 판단한 뒤, 썸네일 배경에 쓸 "구체적인 시각 요소"를 추출한다.\n` +
    `뽑을 종류:\n` +
    typesBlock +
    `\n각 요소에 중요도(importance)를 매겨라 — 썸네일 안에서 차지할 비중:\n` +
    `- 3 (핵심): 그 부에서 '가장 많이·비중 있게 다뤄진 주제'를 압축해 보여주는 장면·상징 오브젝트 단 하나. 먼저 이 부의 본문 대부분이 무엇에 관한 것인지(주인공 기업·제품·사건)를 판단하고, 그 지배적 주제를 대표하는 것을 골라라. 회사 이름을 그냥 로고로 띄우지 말고 상황이 드러나는 장면/상징물을 우선하되, 그 장면은 반드시 '본문에 실제로 서술된 상황'에서 끌어낼 것(예: ${ch.heroExamples}). ⚠️ 두 가지를 모두 피하라 — (a) 단지 그림 되기 좋다는 이유로 본문에서 잠깐 스친 곁가지 소재(원료 채굴 현장·소금 염호·광산·염전 등)를 핵심으로 뽑는 것, (b) 본문에 없는 화재·폭발·대참사·붕괴 같은 과장된 장면을 극적으로 지어내는 것. 핵심은 본문의 무게중심을 '있는 그대로' 대표해야 한다(감정·명암 연출은 배경 단계에서 따로 준다). 화면 중앙을 압도. **importance:3은 딱 1개만.**\n` +
    `- 2 (보조): 핵심을 받쳐주는 실제 오브젝트(${ch.sideExamples}). 핵심보다 작게, 상단/주변에.\n` +
    `- 1 (배경): ${ch.bgTypeExamples}. **작게** 깔릴 것 — 특히 방향성 그래픽(${ch.colorConvention})은 작은 보조로만(크게 그리지 말 것).\n` +
    `규칙:\n` +
    `- 추상적 개념(경제·정책 등 그림으로 못 그리는 것)은 제외, 구체물만.\n` +
    `- name(요소 이름)과 category는 반드시 한국어로 쓸 것(브랜드·고유명사는 원표기 허용: BYD·SAMSUNG·SK하이닉스 등). prompt만 영어로.\n` +
    moodClause +
    `- 각 요소에 이미지 생성용 영어 프롬프트(배경 없는 깔끔한 단독 오브젝트, 고해상도, 극적인 라이팅).\n` +
    `- 개수는 기본 3개로 하고, 4번째는 그 부에 정말 빠지면 안 될 요소가 더 있을 때만 추가(최대 4개). 습관적으로 4개를 채우지 말 것 — 3개로 충분하면 3개. 정말 핵심적인 요소만 절제해서 추출. 반드시 JSON 배열만 출력. 설명/마크다운 금지.\n` +
    `형식: [{"name":"천궁2 미사일","category":"군사장비","importance":3,"prompt":"Cheongung-II surface-to-air missile, dynamic angle, isolated on plain white background, dramatic studio lighting, high detail"}]`

  const payload = JSON.stringify({
    model,
    max_tokens: 2500,
    system: systemPrompt,
    messages: [
      {
        role: "user",
        content: `# 영상 요약\n${ctx}\n\n위에서 썸네일에 쓸 구체적 시각 요소를 JSON 배열로만 출력해줘.`,
      },
    ],
  })

  return new Promise((resolve) => {
    const req = https.request(
      {
        hostname: "api.anthropic.com",
        path: "/v1/messages",
        method: "POST",
        headers: {
          "x-api-key": apiKey,
          "anthropic-version": "2023-06-01",
          "Content-Type": "application/json",
          "Content-Length": Buffer.byteLength(payload),
        },
      },
      (res) => {
        const chunks = []
        res.on("data", (c) => chunks.push(c))
        res.on("end", () => {
          const raw = Buffer.concat(chunks).toString("utf8")
          let json
          try {
            json = JSON.parse(raw)
          } catch (e) {
            resolve({ success: false, error: "응답 파싱 실패: " + raw.slice(0, 200) })
            return
          }
          if (res.statusCode !== 200) {
            resolve({
              success: false,
              error: (json.error && json.error.message) || `HTTP ${res.statusCode}`,
              status: res.statusCode,
            })
            return
          }
          const text = (json.content || [])
            .map((b) => (b.type === "text" ? b.text : ""))
            .join("")
          const subjects = parseSubjects(text)
          if (!subjects.length)
            resolve({ success: false, error: "추출된 요소가 없습니다." })
          else resolve({ success: true, subjects })
        })
      },
    )
    req.on("error", (e) => resolve({ success: false, error: "네트워크 오류: " + e.message }))
    req.write(payload)
    req.end()
  })
}

/**
 * 단일 요소 이름 → 이미지 생성용 영어 프롬프트 1줄 (Claude).
 * @returns {Promise<{success, prompt?, error?}>}
 */
export async function generateElementPrompt(name, opts = {}) {
  const cfg = loadConfig()
  const apiKey = opts.apiKey || cfg.claudeApiKey
  if (!apiKey)
    return { success: false, error: "Claude API 키가 없습니다 (config.json claudeApiKey)." }
  if (!(name || "").trim()) return { success: false, error: "요소 이름이 비었습니다." }

  const https = require("https")
  const model = opts.model || cfg.titleModel || "claude-sonnet-4-6"
  const system =
    "유튜브 썸네일 배경에 쓸 단일 오브젝트의 이미지 생성 프롬프트를 영어로 한 줄 만든다. " +
    "배경 없는 깔끔한 단독 오브젝트, 고해상도, 극적인 라이팅. 설명·따옴표·마크다운 없이 프롬프트 문장만 출력."
  const payload = JSON.stringify({
    model,
    max_tokens: 300,
    system,
    messages: [
      { role: "user", content: `요소: ${name}\n이 요소의 이미지 생성 영어 프롬프트 한 줄만 출력해줘.` },
    ],
  })

  return new Promise((resolve) => {
    const req = https.request(
      {
        hostname: "api.anthropic.com",
        path: "/v1/messages",
        method: "POST",
        headers: {
          "x-api-key": apiKey,
          "anthropic-version": "2023-06-01",
          "Content-Type": "application/json",
          "Content-Length": Buffer.byteLength(payload),
        },
      },
      (res) => {
        const chunks = []
        res.on("data", (c) => chunks.push(c))
        res.on("end", () => {
          const raw = Buffer.concat(chunks).toString("utf8")
          let json
          try {
            json = JSON.parse(raw)
          } catch (e) {
            return resolve({ success: false, error: "응답 파싱 실패: " + raw.slice(0, 200) })
          }
          if (res.statusCode !== 200)
            return resolve({
              success: false,
              error: (json.error && json.error.message) || `HTTP ${res.statusCode}`,
            })
          const text = (json.content || [])
            .map((b) => (b.type === "text" ? b.text : ""))
            .join("")
            .trim()
            .replace(/^["'`]+|["'`]+$/g, "")
            .replace(/\s*\n\s*/g, " ")
          if (!text) resolve({ success: false, error: "프롬프트를 생성하지 못했습니다." })
          else resolve({ success: true, prompt: text })
        })
      },
    )
    req.on("error", (e) => resolve({ success: false, error: "네트워크 오류: " + e.message }))
    req.write(payload)
    req.end()
  })
}

/** 모델 출력에서 요소 객체 배열 추출 */
function parseSubjects(text) {
  if (!text) return []
  const match = text.match(/\[[\s\S]*\]/)
  if (!match) return []
  try {
    const arr = JSON.parse(match[0])
    if (!Array.isArray(arr)) return []
    return arr
      .filter((o) => o && o.name)
      .map((o) => {
        let imp = parseInt(o.importance, 10)
        if (!(imp >= 1 && imp <= 3)) imp = 2
        return {
          name: String(o.name).trim(),
          category: String(o.category || "").trim(),
          importance: imp,
          prompt: String(o.prompt || o.name).trim(),
        }
      })
  } catch (e) {
    return []
  }
}

const TITLE_COLORS = ["white", "yellow", "red", "green"]
const normColor = (c) => (TITLE_COLORS.includes(c) ? c : "white")

/** parts 배열 정규화 → [{text, color}] */
function normParts(parts) {
  if (!Array.isArray(parts)) return null
  const out = parts
    .filter((p) => p && p.text != null)
    .map((p) => ({ text: String(p.text), color: normColor(p.color) }))
    .filter((p) => p.text.length)
  return out.length ? out : null
}

/**
 * 모델 출력에서 제목 추출 → [{text, parts:[{text,color}]}].
 * parts(색 세그먼트) 우선, 구버전(title/color 또는 문자열)·줄 단위 fallback 지원.
 */
function parseTitles(text) {
  if (!text) return []
  const toText = (parts) => parts.map((p) => p.text).join("")
  // 1) JSON 배열 추출
  const match = text.match(/\[[\s\S]*\]/)
  if (match) {
    try {
      const arr = JSON.parse(match[0])
      if (Array.isArray(arr)) {
        return arr
          .map((o) => {
            if (o && typeof o === "object") {
              const parts = normParts(o.parts)
              if (parts) return { text: toText(parts), parts }
              // 구버전: {title, color}
              const t = String(o.title || "").trim()
              if (t) return { text: t, parts: [{ text: t, color: normColor(o.color) }] }
              return null
            }
            // 문자열
            const s = String(o).trim()
            return s ? { text: s, parts: [{ text: s, color: "white" }] } : null
          })
          .filter(Boolean)
      }
    } catch (e) {}
  }
  // 2) fallback: 빈 줄로 구분된 블록
  return text
    .split(/\n{2,}/)
    .map((s) => s.replace(/^\s*[-*\d.]+\s*/, "").trim())
    .filter(Boolean)
    .map((s) => ({ text: s, parts: [{ text: s, color: "white" }] }))
}
