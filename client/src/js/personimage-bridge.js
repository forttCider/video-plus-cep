/**
 * 인물 이미지 생성 - CEP(Node) ↔ ExtendScript/OpenAI 브릿지
 *
 * 흐름: 시퀀스에서 얼굴 프레임 3~5장 캡쳐 → OpenAI 이미지 편집으로 표정 재생성 → 다운로드
 *
 * 프레임 추출용 ExtendScript: host/personimage.jsx 의 tm_getPlayheadClips / tm_getTrackClips
 */

import { evalJSON } from "./cep-bridge"
import { confirmDialog } from "./confirmDialog"

const API_URL =
  (typeof process !== "undefined" &&
    process.env &&
    process.env.REACT_APP_VIDEO_API_URL) ||
  "https://vapi.cidermics.com"

let personHostLoaded = false

/**
 * 데이터 수집: AI 이미지 재생성 이력 기록
 * POST /thumbnail/images/history (application/x-www-form-urlencoded)
 */
export async function recordImageHistory({
  worker,
  generatedCount,
  projectId,
  sequenceId,
}) {
  const body = new URLSearchParams()
  body.append("worker", worker || "")
  body.append("generated_count", String(generatedCount || 0))
  if (projectId) body.append("project_id", projectId)
  if (sequenceId) body.append("sequence_id", sequenceId)

  const res = await fetch(`${API_URL}/thumbnail/images/history`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: body.toString(),
  })
  if (!res.ok) throw new Error(`이미지 이력 기록 실패 (${res.status})`)
  return res.json().catch(() => ({}))
}

// 다운로드한 배경제거 이미지 데이터 저장 엔드포인트
const DOWNLOAD_HISTORY_ENDPOINT = "/thumbnail/images/upload"

/**
 * 데이터 수집: 다운로드한 배경제거 이미지 전송
 * POST /thumbnail/images/upload (multipart/form-data)
 *  - worker: string
 *  - image: file (배경제거 따진 PNG 바이너리)
 */
export async function recordImageDownload({
  worker,
  imagePath,
  projectId,
  sequenceId,
}) {
  if (!DOWNLOAD_HISTORY_ENDPOINT) {
    console.warn("[recordImageDownload] API 주소 미설정 — 전송 건너뜀")
    return { skipped: true }
  }
  const fs = require("fs")
  const path = require("path")
  const buf = fs.readFileSync(imagePath) // Node Buffer (Uint8Array)
  const blob = new Blob([buf], { type: "image/png" })

  const form = new FormData()
  form.append("worker", worker || "")
  form.append("image", blob, path.basename(imagePath) || "image.png")
  if (projectId) form.append("project_id", projectId)
  if (sequenceId) form.append("sequence_id", sequenceId)

  // multipart/form-data — Content-Type(boundary)은 브라우저가 자동 설정
  const res = await fetch(`${API_URL}${DOWNLOAD_HISTORY_ENDPOINT}`, {
    method: "POST",
    body: form,
  })
  if (!res.ok) throw new Error(`다운로드 이미지 전송 실패 (${res.status})`)
  return res.json().catch(() => ({}))
}

function getCS() {
  if (typeof CSInterface === "undefined") {
    throw new Error("CSInterface를 찾을 수 없습니다 (CEP 환경 아님).")
  }
  return new CSInterface()
}

/** 프레임 추출 ExtendScript 로드 (host/personimage.jsx) */
export function loadPersonHost() {
  return new Promise((resolve, reject) => {
    if (personHostLoaded) return resolve(true)
    try {
      const cs = getCS()
      const jsxPath = cs.getSystemPath(SystemPath.EXTENSION) + "/host/personimage.jsx"
      cs.evalScript('$.evalFile("' + jsxPath + '")', () => {
        personHostLoaded = true
        resolve(true)
      })
    } catch (e) {
      reject(e)
    }
  })
}

/* ── config (API 키) — 확장 루트 config.json (repo 루트, ZXP 포함) ── */
function getConfigPath() {
  const path = require("path")
  const cs = getCS()
  return path.join(cs.getSystemPath(SystemPath.EXTENSION), "config.json")
}
export function loadConfig() {
  try {
    const fs = require("fs")
    const p = getConfigPath()
    if (!fs.existsSync(p)) return {}
    return JSON.parse(fs.readFileSync(p, "utf8")) || {}
  } catch (e) {
    return {}
  }
}

/* ── ffmpeg ── */
function getFFmpegPath() {
  const path = require("path")
  const cs = getCS()
  const ext = process.platform === "win32" ? ".exe" : ""
  return path.join(cs.getSystemPath(SystemPath.EXTENSION), "bin", "ffmpeg" + ext)
}
// 권한/격리(quarantine) 해제는 세션당 1회면 충분 — 프레임마다 execSync(동기)로 xattr/chmod를
// 돌리면 CEP 단일 스레드(UI+Node 공유)가 프레임 수만큼 멈춰 탭 전환 등 UI가 얼어붙는다.
let ffmpegPrepared = false
function ensureFFmpegExecutable(ffmpegPath) {
  const fs = require("fs")
  if (!fs.existsSync(ffmpegPath)) throw new Error(`ffmpeg 없음: ${ffmpegPath}`)
  if (ffmpegPrepared) return
  const { execSync } = require("child_process")
  if (process.platform === "darwin") {
    try {
      if ((fs.statSync(ffmpegPath).mode & 0o111) === 0) execSync(`chmod +x "${ffmpegPath}"`)
    } catch (e) {}
    try {
      if (execSync(`xattr -l "${ffmpegPath}"`).toString().includes("com.apple.quarantine"))
        execSync(`xattr -dr com.apple.quarantine "${ffmpegPath}"`)
    } catch (e) {}
  }
  ffmpegPrepared = true
}
function getDir(sub) {
  const os = require("os")
  const path = require("path")
  const fs = require("fs")
  const dir = path.join(os.homedir(), ".videoPlus", sub)
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true })
  return dir
}

// 디렉터리 안 파일 비우기 (폴더는 유지)
function clearDirFiles(dir) {
  const fs = require("fs")
  const path = require("path")
  try {
    if (!fs.existsSync(dir)) return
    for (const f of fs.readdirSync(dir)) {
      try {
        fs.rmSync(path.join(dir, f), { force: true, recursive: true })
      } catch (e) {}
    }
  } catch (e) {}
}

export function clearFrames() {
  clearDirFiles(getDir("person-frames"))
}
export function clearResults() {
  clearDirFiles(getDir("person-results"))
}
// 더 이상 안 쓰는 옛 캐시(썸네일 위저드 잔여) 삭제
export function cleanupLegacy() {
  const fs = require("fs")
  const os = require("os")
  const path = require("path")
  for (const name of ["thumb-frames", "library"]) {
    try {
      const d = path.join(os.homedir(), ".videoPlus", name)
      if (fs.existsSync(d)) fs.rmSync(d, { recursive: true, force: true })
    } catch (e) {}
  }
}

function ffmpegExtractFrame(mediaPath, sourceTimeSeconds, outPath) {
  return new Promise((resolve, reject) => {
    const { execFile } = require("child_process")
    const ffmpegPath = getFFmpegPath()
    ensureFFmpegExecutable(ffmpegPath)
    const t = Math.max(0, sourceTimeSeconds)
    const args =
      t > 1
        ? ["-y", "-ss", (t - 1).toFixed(3), "-i", mediaPath, "-ss", "1", "-frames:v", "1", "-q:v", "2", outPath]
        : ["-y", "-i", mediaPath, "-ss", t.toFixed(3), "-frames:v", "1", "-q:v", "2", outPath]
    execFile(ffmpegPath, args, { maxBuffer: 1024 * 1024 * 16 }, (err, stdout, stderr) => {
      const fs = require("fs")
      if (err || !fs.existsSync(outPath)) reject(new Error("ffmpeg 실패: " + (stderr || (err && err.message))))
      else resolve(outPath)
    })
  })
}

export async function getPlayheadClips() {
  await loadPersonHost()
  return evalJSON("tm_getPlayheadClips()")
}

export async function getTrackClips(trackIndex) {
  await loadPersonHost()
  return evalJSON("tm_getTrackClips(" + trackIndex + ")")
}

/**
 * 선택한 트랙의 "모든 클립" 전체 구간에서 N장 랜덤 캡쳐
 * (재생헤드 클립 하나가 아니라 트랙 전체 대상, 길이 비례 랜덤)
 * @returns {Promise<{success, frames?:Array<{path,url,sourceTimeSeconds,clipName}>, trackIndex?, error?}>}
 */
export async function captureFrames(opts = {}) {
  const count = Math.max(1, Math.min(40, opts.count || 4))

  // 새 캡쳐 = 새 세션: 이전 프레임/결과 캐시 정리 (누적 방지)
  clearFrames()
  clearResults()

  // 트랙 결정: 지정 없으면 재생헤드 위 미디어 보유 topmost
  let trackIndex = opts.trackIndex
  if (typeof trackIndex !== "number") {
    const info = await getPlayheadClips()
    if (!info || !info.success) return { success: false, error: (info && info.error) || "클립 정보를 가져오지 못했습니다" }
    const def = (info.clips || []).find((c) => c.hasMedia) || (info.clips || [])[0]
    if (!def) return { success: false, error: "재생헤드 위치에 비디오 클립이 없습니다." }
    trackIndex = def.trackIndex
  }

  const tc = await getTrackClips(trackIndex)
  if (!tc || !tc.success) return { success: false, error: (tc && tc.error) || "트랙 클립 조회 실패" }
  const media = (tc.clips || []).filter((c) => c.hasMedia && c.sourceDurationSeconds > 0)
  if (!media.length) return { success: false, error: "해당 트랙에 추출 가능한 클립이 없습니다.", trackIndex }

  // 전체 소스 길이를 이어붙인 연속 공간(시간 순) — pos∈[0,total) → 클립+오프셋
  const total = media.reduce((s, c) => s + c.sourceDurationSeconds, 0)
  const pickAt = (pos) => {
    let r = pos
    let chosen = media[media.length - 1]
    let off = Math.max(0, Math.min(chosen.sourceDurationSeconds, pos))
    for (const c of media) {
      if (r < c.sourceDurationSeconds) {
        chosen = c
        off = r
        break
      }
      r -= c.sourceDurationSeconds
    }
    return {
      mediaPath: chosen.mediaPath,
      sourceTimeSeconds: chosen.inPointSeconds + off,
      // 타임라인(시퀀스) 기준 시각 = 클립 시작 + 구간 오프셋
      timelineTimeSeconds:
        typeof chosen.timelineStartSeconds === "number"
          ? chosen.timelineStartSeconds + off
          : null,
      clipName: chosen.clipName,
    }
  }

  const picks = []
  if (opts.zoned) {
    // 인트로/마무리 구간에서 더 촘촘히, 나머지(중간)는 균등 분배
    const introFrac = opts.introFrac || 0.15
    const outroFrac = opts.outroFrac || 0.15
    const introEnd = total * introFrac
    const outroStart = total * (1 - outroFrac)
    const introN = Math.round(count * 0.25)
    const outroN = Math.round(count * 0.25)
    const middleN = Math.max(0, count - introN - outroN)
    for (let i = 0; i < introN; i++) picks.push(pickAt(Math.random() * introEnd))
    for (let i = 0; i < middleN; i++) {
      const pos = introEnd + ((i + 0.5) / middleN) * (outroStart - introEnd)
      picks.push(pickAt(pos))
    }
    for (let i = 0; i < outroN; i++)
      picks.push(pickAt(outroStart + Math.random() * (total - outroStart)))
  } else {
    // 길이 비례 랜덤 샘플
    for (let i = 0; i < count; i++) picks.push(pickAt(Math.random() * total))
  }

  const path = require("path")
  const dir = getDir("person-frames")
  const extractOne = async (p, i) => {
    const outPath = path.join(
      dir,
      "cap_" + String(i).padStart(2, "0") + "_t" + p.sourceTimeSeconds.toFixed(2).replace(".", "_") + ".jpg",
    )
    try {
      await ffmpegExtractFrame(p.mediaPath, p.sourceTimeSeconds, outPath)
      return {
        path: outPath,
        sourceTimeSeconds: p.sourceTimeSeconds,
        timelineTimeSeconds: p.timelineTimeSeconds,
        clipName: p.clipName,
      }
    } catch (e) {
      return null
    }
  }
  // 동시 실행 제한 — 40장을 한꺼번에 ffmpeg로 띄우면 디스크/CPU 폭주로 Premiere가 멈춘다.
  // 한 번에 CONCURRENCY개씩만 추출 (순서 보존).
  const CONCURRENCY = 3
  const results = new Array(picks.length)
  let cursor = 0
  const worker = async () => {
    while (cursor < picks.length) {
      const i = cursor++
      results[i] = await extractOne(picks[i], i)
    }
  }
  await Promise.all(
    Array.from({ length: Math.min(CONCURRENCY, picks.length) }, worker),
  )
  const frames = results.filter(Boolean)
  if (!frames.length) return { success: false, error: "프레임 추출에 실패했습니다.", trackIndex }
  return { success: true, frames, trackIndex }
}

/* ── OpenAI 이미지 편집 (얼굴 재생성) ── */
function buildMultipartMulti(fields, files) {
  const boundary = "----personImage" + Math.random().toString(16).slice(2)
  const parts = []
  Object.keys(fields).forEach((k) => {
    parts.push(Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="${k}"\r\n\r\n${fields[k]}\r\n`))
  })
  files.forEach((f) => {
    parts.push(
      Buffer.from(
        `--${boundary}\r\nContent-Disposition: form-data; name="${f.field}"; filename="${f.filename}"\r\nContent-Type: ${f.contentType}\r\n\r\n`,
      ),
    )
    parts.push(f.data)
    parts.push(Buffer.from("\r\n"))
  })
  parts.push(Buffer.from(`--${boundary}--\r\n`))
  return { boundary, body: Buffer.concat(parts) }
}

/**
 * 캡쳐 이미지들을 레퍼런스로, 프롬프트대로 표정 재생성 (OpenAI images/edits)
 * @param {string[]} imagePaths - 입력(레퍼런스) 이미지 경로들
 * @param {string} prompt - 예: "환희에 찬 얼굴로 바꿔줘"
 * @param {object} opts { apiKey, model, n, size }
 * @returns {Promise<{success, results?:Array<{path,url}>, error?, status?}>}
 */
export async function regenerateFace(imagePaths, prompt, opts = {}) {
  const apiKey = opts.apiKey
  if (!apiKey) return { success: false, error: "이미지 생성 API 키가 없습니다 (config.json imageGenApiKey)." }
  if (!imagePaths || !imagePaths.length) return { success: false, error: "입력 이미지가 없습니다." }
  if (!(prompt || "").trim()) return { success: false, error: "프롬프트를 입력해주세요." }

  const fs = require("fs")
  const path = require("path")
  const https = require("https")
  const model = opts.model || loadConfig().imageGenModel || "gpt-image-1"
  const n = Math.max(1, Math.min(8, opts.n || 1))
  const size = opts.size || "1024x1024"

  const files = imagePaths
    .filter((p) => fs.existsSync(p))
    .map((p, i) => ({
      field: "image[]",
      filename: "ref_" + i + ".jpg",
      contentType: "image/jpeg",
      data: fs.readFileSync(p),
    }))
  if (!files.length) return { success: false, error: "입력 이미지를 찾을 수 없습니다." }

  const fields = { model, prompt: prompt.trim(), n: String(n), size }
  if (opts.transparent) {
    fields.background = "transparent" // 투명 배경(배경제거) PNG
    fields.output_format = "png"
    fields.quality = "high" // 투명은 medium/high에서 깔끔
  }
  const { boundary, body } = buildMultipartMulti(fields, files)

  return new Promise((resolve) => {
    const req = https.request(
      {
        hostname: "api.openai.com",
        path: "/v1/images/edits",
        method: "POST",
        headers: {
          Authorization: "Bearer " + apiKey,
          "Content-Type": `multipart/form-data; boundary=${boundary}`,
          "Content-Length": body.length,
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
            resolve({ success: false, error: (json.error && json.error.message) || `HTTP ${res.statusCode}`, status: res.statusCode })
            return
          }
          const dir = getDir("person-results")
          const out = []
          ;(json.data || []).forEach((d, i) => {
            if (!d.b64_json) return
            const outPath = path.join(dir, "face_" + String(new Date().getTime()).slice(-9) + "_" + i + ".png")
            try {
              fs.writeFileSync(outPath, Buffer.from(d.b64_json, "base64"))
              out.push({ path: outPath })
            } catch (e) {}
          })
          if (!out.length) resolve({ success: false, error: "결과 이미지가 없습니다." })
          else resolve({ success: true, results: out })
        })
      },
    )
    req.on("error", (e) => resolve({ success: false, error: "네트워크 오류: " + e.message }))
    req.write(body)
    req.end()
  })
}

/**
 * 캡쳐 후보 프레임들을 Gemini 비전으로 평가 — 정면 응시 + 말하는 표정 컷 선별용.
 * (Claude/Sonnet보다 이 다중 이미지 선별 작업에서 체감 성능이 더 좋아 Gemini 사용)
 * @param {string[]} framePaths - 후보 프레임 경로(전달 순서가 index)
 * @param {object} opts { apiKey(gemini), model }
 * @returns {Promise<{success, scores?:Array<{index,frontFacing,talking,score}>, error?}>}
 */
export async function scoreFramesVision(framePaths, opts = {}) {
  const cfg = loadConfig()
  const apiKey = opts.apiKey || cfg.geminiApiKey
  if (!apiKey)
    return { success: false, error: "Gemini API 키가 없습니다 (config.json geminiApiKey)." }
  const fs = require("fs")
  const https = require("https")
  const model = opts.model || cfg.visionModel || "gemini-2.5-flash"
  const imgs = framePaths
    .filter((p) => fs.existsSync(p))
    .map((p) => ({
      inlineData: { mimeType: "image/jpeg", data: fs.readFileSync(p).toString("base64") },
    }))
  if (!imgs.length) return { success: false, error: "이미지를 찾을 수 없습니다." }

  const instruction =
    `다음 ${imgs.length}개 이미지를 0번부터 순서대로 평가해줘. ` +
    `각 이미지에서 인물이 카메라 정면을 바라보는지(frontFacing), 말하는 중(입이 벌어진 발화) 표정인지(talking)를 판단하고, ` +
    `유튜브 썸네일용 인물 컷으로서의 점수(score, 0~100; 정면일수록·말하는 표정일수록·얼굴이 크고 선명할수록 높게)를 매겨줘. ` +
    `반드시 JSON 배열만 출력(설명 금지): [{"index":0,"frontFacing":true,"talking":false,"score":80}, ...]`

  const body = JSON.stringify({ contents: [{ parts: [{ text: instruction }, ...imgs] }] })

  return new Promise((resolve) => {
    const req = https.request(
      {
        hostname: "generativelanguage.googleapis.com",
        path: `/v1beta/models/${model}:generateContent?key=${apiKey}`,
        method: "POST",
        headers: { "Content-Type": "application/json", "Content-Length": Buffer.byteLength(body) },
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
          const cand = (json.candidates || [])[0]
          const text = ((cand && cand.content && cand.content.parts) || [])
            .map((p) => p.text || "")
            .join("")
          const m = text.match(/\[[\s\S]*\]/)
          if (!m) return resolve({ success: false, error: "점수 파싱 실패" })
          try {
            const arr = JSON.parse(m[0])
            resolve({ success: true, scores: Array.isArray(arr) ? arr : [] })
          } catch (e) {
            resolve({ success: false, error: "점수 JSON 파싱 실패" })
          }
        })
      },
    )
    req.on("error", (e) => resolve({ success: false, error: "네트워크 오류: " + e.message }))
    req.write(body)
    req.end()
  })
}

/* ── 썸네일 배경 생성 (요소 추출 → 요소 이미지 → 배경 합성) ── */

// OpenAI 이미지 응답(b64_json[]) → dir에 PNG 저장 (generations/edits 공용)
function handleImageResponse(res, dir, prefix, resolve) {
  const fs = require("fs")
  const path = require("path")
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
    const out = []
    ;(json.data || []).forEach((d, i) => {
      if (!d.b64_json) return
      const outPath = path.join(
        dir,
        prefix + String(new Date().getTime()).slice(-9) + "_" + i + ".png",
      )
      try {
        fs.writeFileSync(outPath, Buffer.from(d.b64_json, "base64"))
        out.push({ path: outPath })
      } catch (e) {}
    })
    if (!out.length) resolve({ success: false, error: "결과 이미지가 없습니다." })
    else resolve({ success: true, results: out })
  })
}

// 텍스트→이미지 (images/generations)
function openaiGenerate(prompt, { apiKey, model, n, size, dir, prefix }) {
  const https = require("https")
  const payload = JSON.stringify({ model, prompt: prompt.trim(), n, size })
  return new Promise((resolve) => {
    const req = https.request(
      {
        hostname: "api.openai.com",
        path: "/v1/images/generations",
        method: "POST",
        headers: {
          Authorization: "Bearer " + apiKey,
          "Content-Type": "application/json",
          "Content-Length": Buffer.byteLength(payload),
        },
      },
      (res) => handleImageResponse(res, dir, prefix, resolve),
    )
    req.on("error", (e) => resolve({ success: false, error: "네트워크 오류: " + e.message }))
    req.write(payload)
    req.end()
  })
}

// 부(部)별 하위 폴더 접미사 (여러 부의 배경이 서로 덮어쓰지 않도록 분리)
function nsSuffix(ns) {
  return ns ? "/" + String(ns).replace(/[^a-zA-Z0-9_-]/g, "") : ""
}

export function clearElements(ns) {
  clearDirFiles(getDir("bg-elements" + nsSuffix(ns)))
}

/**
 * 단일 요소(소스) 이미지 생성 — 전투기/제품/국기/인물 등 깔끔한 단독 오브젝트.
 * ~/.videoPlus/bg-elements 에 저장(캐시는 비우지 않음 — 호출부에서 batch 시작 시 clearElements()).
 * @returns {Promise<{success, results?:[{path}], error?}>}
 */
export async function generateElementImage(prompt, opts = {}) {
  const apiKey = opts.apiKey
  if (!apiKey)
    return { success: false, error: "이미지 생성 API 키가 없습니다 (config.json imageGenApiKey)." }
  if (!(prompt || "").trim()) return { success: false, error: "프롬프트가 없습니다." }
  const model = opts.model || loadConfig().imageGenModel || "gpt-image-1"
  const size = opts.size || "1024x1024"
  return openaiGenerate(prompt, {
    apiKey,
    model,
    n: 1,
    size,
    dir: getDir("bg-elements" + nsSuffix(opts.ns)),
    prefix: "el_",
  })
}

/**
 * 단독 배경 이미지 생성 (text→image). 요소 없이 프롬프트만으로.
 * @returns {Promise<{success, results?:[{path}], error?}>}
 */
export async function generateBackground(prompt, opts = {}) {
  const apiKey = opts.apiKey
  if (!apiKey)
    return { success: false, error: "이미지 생성 API 키가 없습니다 (config.json imageGenApiKey)." }
  if (!(prompt || "").trim()) return { success: false, error: "프롬프트를 입력해주세요." }
  const model = opts.model || loadConfig().imageGenModel || "gpt-image-1"
  const n = Math.max(1, Math.min(4, opts.n || 1))
  const size = opts.size || "1536x1024" // 가로형(16:9에 가장 근접)
  const dir = getDir("bg-results" + nsSuffix(opts.ns))
  clearDirFiles(dir)
  return openaiGenerate(prompt, {
    apiKey,
    model,
    n,
    size,
    dir,
    prefix: "bg_",
  })
}

/**
 * 선택한 요소 이미지들을 레퍼런스로 넣어 배경 합성 (images/edits 멀티 입력).
 * @param {string[]} elementPaths - 합성에 넣을 요소 PNG 경로들
 * @param {string} prompt - 배경/배치 지시
 * @param {object} opts { apiKey, model, n, size }
 * @returns {Promise<{success, results?:[{path}], error?}>}
 */
export async function composeBackground(elementPaths, prompt, opts = {}) {
  const apiKey = opts.apiKey
  if (!apiKey)
    return { success: false, error: "이미지 생성 API 키가 없습니다 (config.json imageGenApiKey)." }
  if (!elementPaths || !elementPaths.length)
    return { success: false, error: "합성할 요소 이미지를 선택해주세요." }
  if (!(prompt || "").trim()) return { success: false, error: "프롬프트를 입력해주세요." }

  const fs = require("fs")
  const https = require("https")
  const model = opts.model || loadConfig().imageGenModel || "gpt-image-1"
  const n = Math.max(1, Math.min(4, opts.n || 1))
  const size = opts.size || "1536x1024"

  const files = elementPaths
    .filter((p) => fs.existsSync(p))
    .map((p, i) => ({
      field: "image[]",
      filename: "el_" + i + ".png",
      contentType: "image/png",
      data: fs.readFileSync(p),
    }))
  if (!files.length) return { success: false, error: "요소 이미지를 찾을 수 없습니다." }

  const { boundary, body } = buildMultipartMulti(
    { model, prompt: prompt.trim(), n: String(n), size },
    files,
  )
  const outDir = getDir("bg-results" + nsSuffix(opts.ns))
  clearDirFiles(outDir)

  return new Promise((resolve) => {
    const req = https.request(
      {
        hostname: "api.openai.com",
        path: "/v1/images/edits",
        method: "POST",
        headers: {
          Authorization: "Bearer " + apiKey,
          "Content-Type": `multipart/form-data; boundary=${boundary}`,
          "Content-Length": body.length,
        },
      },
      (res) => handleImageResponse(res, outDir, "bg_", resolve),
    )
    req.on("error", (e) => resolve({ success: false, error: "네트워크 오류: " + e.message }))
    req.write(body)
    req.end()
  })
}

/**
 * 이미 생성된 배경 이미지를 지시 프롬프트대로 수정(img2img, images/edits 단일 입력).
 * 다른 변형은 지우지 않고(clear 안 함) 새 결과 1장을 만들어 반환 → 호출부에서 해당 타일 교체.
 * @param {string} imagePath 수정할 배경 PNG 경로
 * @param {string} prompt 수정 지시
 * @param {object} opts { apiKey, model, n, size, ns }
 * @returns {Promise<{success, results?:[{path}], error?}>}
 */
export async function editBackground(imagePath, prompt, opts = {}) {
  const apiKey = opts.apiKey
  if (!apiKey)
    return { success: false, error: "이미지 생성 API 키가 없습니다 (config.json imageGenApiKey)." }
  const fs = require("fs")
  const https = require("https")
  if (!imagePath || !fs.existsSync(imagePath))
    return { success: false, error: "수정할 이미지를 찾을 수 없습니다." }
  if (!(prompt || "").trim()) return { success: false, error: "수정 지시를 입력해주세요." }

  const model = opts.model || loadConfig().imageGenModel || "gpt-image-1"
  const n = Math.max(1, Math.min(4, opts.n || 1))
  const size = opts.size || "1536x1024"
  const files = [
    { field: "image[]", filename: "src.png", contentType: "image/png", data: fs.readFileSync(imagePath) },
  ]
  const { boundary, body } = buildMultipartMulti(
    { model, prompt: prompt.trim(), n: String(n), size },
    files,
  )
  const outDir = getDir("bg-results" + nsSuffix(opts.ns)) // 기존 결과 유지 (clear 안 함)

  return new Promise((resolve) => {
    const req = https.request(
      {
        hostname: "api.openai.com",
        path: "/v1/images/edits",
        method: "POST",
        headers: {
          Authorization: "Bearer " + apiKey,
          "Content-Type": `multipart/form-data; boundary=${boundary}`,
          "Content-Length": body.length,
        },
      },
      (res) => handleImageResponse(res, outDir, "bgedit_", resolve),
    )
    req.on("error", (e) => resolve({ success: false, error: "네트워크 오류: " + e.message }))
    req.write(body)
    req.end()
  })
}

/**
 * remove.bg 로 배경 제거(배경제거) → 투명 PNG
 * 재생성으로 사물 제거된 깨끗한 인물에 적용하면 잘 잘림.
 * @param {string} imagePath 입력 PNG/JPEG
 * @param {object} opts { apiKey, size="auto" }
 * @returns {Promise<{success, path?, error?, status?}>}
 */
/**
 * remove.bg 계정 조회 — 남은 크레딧·무료 호출 수.
 * @returns {Promise<{success, credits?, freeCalls?, error?}>}
 */
export async function getRemoveBgAccount(opts = {}) {
  const cfg = loadConfig()
  const apiKey = opts.apiKey || cfg.removeBgApiKey
  if (!apiKey)
    return { success: false, error: "remove.bg 키가 없습니다 (config.json removeBgApiKey)." }
  const https = require("https")
  return new Promise((resolve) => {
    const req = https.request(
      {
        hostname: "api.remove.bg",
        path: "/v1.0/account",
        method: "GET",
        headers: { "X-Api-Key": apiKey },
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
            resolve({ success: false, error: "응답 파싱 실패" })
            return
          }
          if (res.statusCode !== 200) {
            const msg =
              (json.errors && json.errors[0] && json.errors[0].title) || `HTTP ${res.statusCode}`
            resolve({ success: false, error: msg })
            return
          }
          const attr = (json.data && json.data.attributes) || {}
          const credits = attr.credits || {}
          const api = attr.api || {}
          resolve({
            success: true,
            credits: typeof credits.total === "number" ? credits.total : 0,
            freeCalls: typeof api.free_calls === "number" ? api.free_calls : 0,
          })
        })
      },
    )
    req.on("error", (e) => resolve({ success: false, error: "네트워크 오류: " + e.message }))
    req.end()
  })
}

/**
 * 배경제거 다운로드 직전 게이트 — remove.bg 잔여를 재조회해서 결정.
 * (플러그인/크레딧을 여러 사용자가 공유하므로 클릭 시점에 확인)
 *  - 남아있으면 { cut: true }
 *  - 소진이면 사용자에게 "원본 그대로 다운로드" 안내 → 확인 시 { cut: false }, 취소 시 { cancelled: true }
 *  - 조회 실패면 일단 시도 { cut: true, unknown: true } (실제 호출에서 실패하면 호출부가 원본 폴백)
 * @returns {Promise<{cut?:boolean, cancelled?:boolean, unknown?:boolean, credits?:number, freeCalls?:number}>}
 */
export async function ensureRemoveBg(opts = {}) {
  // 개발자용: 크레딧 소진 시뮬 (확인창 테스트). 실제 조회 없이 소진 취급.
  const acc = opts.forceEmpty
    ? { success: true, credits: 0, freeCalls: 0 }
    : await getRemoveBgAccount(opts)
  if (!acc.success) return { cut: true, unknown: true }
  const has = (acc.freeCalls || 0) > 0 || (acc.credits || 0) > 0
  if (has) return { cut: true, credits: acc.credits, freeCalls: acc.freeCalls }
  const cachedNote = opts.cachedCount
    ? `\n\n(이미 배경제거된 ${opts.cachedCount}장은 배경제거된 상태로 저장됩니다.)`
    : ""
  const ok = await confirmDialog({
    title: "배경제거 크레딧 소진",
    message:
      "배경제거 크레딧이 모두 소진되었습니다.\n\n배경제거 없이 원본이미지 그대로 다운로드 합니다." +
      cachedNote +
      "\n계속 하시겠습니까?",
    confirmText: "원본 다운로드",
    cancelText: "취소",
  })
  return ok ? { cut: false } : { cancelled: true }
}

export async function removeBackground(imagePath, opts = {}) {
  const apiKey = opts.apiKey
  if (!apiKey) return { success: false, error: "remove.bg API 키가 없습니다 (config.json removeBgApiKey)." }
  const fs = require("fs")
  const path = require("path")
  const https = require("https")
  if (!fs.existsSync(imagePath)) return { success: false, error: "입력 이미지를 찾을 수 없습니다." }

  const { boundary, body } = buildMultipartMulti(
    { size: opts.size || "auto", type: opts.type || "auto", format: "png" },
    [{ field: "image_file", filename: "src.png", contentType: "image/png", data: fs.readFileSync(imagePath) }],
  )
  const outPath = path.join(getDir("person-results"), path.basename(imagePath).replace(/\.[^.]+$/, "") + "_cut.png")

  return new Promise((resolve) => {
    const req = https.request(
      {
        hostname: "api.remove.bg",
        path: "/v1.0/removebg",
        method: "POST",
        headers: { "X-Api-Key": apiKey, "Content-Type": `multipart/form-data; boundary=${boundary}`, "Content-Length": body.length },
      },
      (res) => {
        const chunks = []
        res.on("data", (c) => chunks.push(c))
        res.on("end", () => {
          const buf = Buffer.concat(chunks)
          if (res.statusCode === 200) {
            try {
              fs.writeFileSync(outPath, buf)
              // 배경제거 1회 소모 → 크레딧 배지 자동 갱신 신호
              if (typeof window !== "undefined" && window.dispatchEvent) {
                window.dispatchEvent(new CustomEvent("removebg:used"))
              }
              resolve({ success: true, path: outPath })
            } catch (e) {
              resolve({ success: false, error: "PNG 저장 실패: " + e.message })
            }
          } else {
            let msg = `HTTP ${res.statusCode}`
            try {
              const j = JSON.parse(buf.toString("utf8"))
              if (j.errors && j.errors.length) msg = j.errors[0].title || msg
            } catch (e) {}
            resolve({ success: false, error: msg, status: res.statusCode })
          }
        })
      },
    )
    req.on("error", (e) => resolve({ success: false, error: "네트워크 오류: " + e.message }))
    req.write(body)
    req.end()
  })
}

/* ── 파일 유틸 ── */
export function fileToUrl(p) {
  if (!p) return ""
  const normalized = p.replace(/\\/g, "/")
  const prefixed = normalized.startsWith("/") ? normalized : "/" + normalized
  return "file://" + prefixed + "?v=" + new Date().getTime()
}

/** 저장 폴더 선택 (CEP 네이티브 폴더 선택 다이얼로그). 취소 시 null */
export function pickFolder() {
  try {
    const os = require("os")
    const path = require("path")
    const initial = path.join(os.homedir(), "Desktop")
    const result = window.cep.fs.showOpenDialog(false, true, "저장할 폴더 선택", initial)
    if (result && result.data && result.data.length) {
      // CEP가 file:// URL(%20 인코딩)을 돌려줄 수 있어 실제 경로로 정규화
      let p = result.data[0]
      p = p.replace(/^file:\/\//, "").replace(/^file:/, "")
      try {
        p = decodeURIComponent(p)
      } catch (e) {}
      return p
    }
  } catch (e) {}
  return null
}

/** 이미지를 지정 폴더에 다운로드(복사) — 하위 폴더 생성 없음 */
export function downloadImageTo(srcPath, destDir) {
  try {
    const fs = require("fs")
    const path = require("path")
    const base = path.basename(srcPath)
    const ext = path.extname(base)
    const stem = base.slice(0, base.length - ext.length)
    // 같은 이름이 있으면 덮어쓰지 않고 (1), (2)… 를 붙여 새 파일로 저장
    let dest = path.join(destDir, base)
    let i = 1
    while (fs.existsSync(dest)) {
      dest = path.join(destDir, `${stem} (${i})${ext}`)
      i++
    }
    fs.copyFileSync(srcPath, dest)
    return { success: true, path: dest }
  } catch (e) {
    return { success: false, error: e.message }
  }
}

export function revealResultsFolder() {
  try {
    const { execFile } = require("child_process")
    const dir = getDir("person-results")
    if (process.platform === "darwin") execFile("open", [dir])
    else if (process.platform === "win32") execFile("explorer", [dir])
    else execFile("xdg-open", [dir])
    return { success: true, path: dir }
  } catch (e) {
    return { success: false, error: e.message }
  }
}
