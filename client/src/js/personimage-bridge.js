/**
 * 인물 이미지 생성 - CEP(Node) ↔ ExtendScript/OpenAI 브릿지
 *
 * 흐름: 시퀀스에서 얼굴 프레임 3~5장 캡쳐 → OpenAI 이미지 편집으로 표정 재생성 → 다운로드
 *
 * 프레임 추출용 ExtendScript: host/personimage.jsx 의 tm_getPlayheadClips / tm_getTrackClips
 */

import { evalJSON } from "./cep-bridge"

const API_URL =
  (typeof process !== "undefined" &&
    process.env &&
    process.env.REACT_APP_VIDEO_API_URL) ||
  "http://localhost:8000"

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

// 다운로드한 누끼 이미지 데이터 저장 엔드포인트
const DOWNLOAD_HISTORY_ENDPOINT = "/thumbnail/images/upload"

/**
 * 데이터 수집: 다운로드한 누끼 이미지 전송
 * POST /thumbnail/images/upload (multipart/form-data)
 *  - worker: string
 *  - image: file (누끼 따진 PNG 바이너리)
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
function ensureFFmpegExecutable(ffmpegPath) {
  const { execSync } = require("child_process")
  const fs = require("fs")
  if (!fs.existsSync(ffmpegPath)) throw new Error(`ffmpeg 없음: ${ffmpegPath}`)
  if (process.platform === "darwin") {
    try {
      if ((fs.statSync(ffmpegPath).mode & 0o111) === 0) execSync(`chmod +x "${ffmpegPath}"`)
    } catch (e) {}
    try {
      if (execSync(`xattr -l "${ffmpegPath}"`).toString().includes("com.apple.quarantine"))
        execSync(`xattr -dr com.apple.quarantine "${ffmpegPath}"`)
    } catch (e) {}
  }
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
  const count = Math.max(1, Math.min(8, opts.count || 4))

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

  // 길이 비례 랜덤 샘플: 전체 소스 길이에서 무작위 지점 → 해당 클립+시각
  const total = media.reduce((s, c) => s + c.sourceDurationSeconds, 0)
  const picks = []
  for (let i = 0; i < count; i++) {
    let r = Math.random() * total
    let chosen = media[media.length - 1]
    let off = 0
    for (const c of media) {
      if (r < c.sourceDurationSeconds) {
        chosen = c
        off = r
        break
      }
      r -= c.sourceDurationSeconds
    }
    picks.push({
      mediaPath: chosen.mediaPath,
      sourceTimeSeconds: chosen.inPointSeconds + off,
      // 타임라인(시퀀스) 기준 시각 = 클립 시작 + 구간 오프셋
      timelineTimeSeconds:
        typeof chosen.timelineStartSeconds === "number"
          ? chosen.timelineStartSeconds + off
          : null,
      clipName: chosen.clipName,
    })
  }

  const path = require("path")
  const dir = getDir("person-frames")
  const results = await Promise.all(
    picks.map(async (p, i) => {
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
    }),
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
  const n = Math.max(1, Math.min(4, opts.n || 1))
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
    fields.background = "transparent" // 투명 배경(누끼) PNG
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
 * remove.bg 로 배경 제거(누끼) → 투명 PNG
 * 재생성으로 사물 제거된 깨끗한 인물에 적용하면 잘 잘림.
 * @param {string} imagePath 입력 PNG/JPEG
 * @param {object} opts { apiKey, size="auto" }
 * @returns {Promise<{success, path?, error?, status?}>}
 */
export async function removeBackground(imagePath, opts = {}) {
  const apiKey = opts.apiKey
  if (!apiKey) return { success: false, error: "remove.bg API 키가 없습니다 (config.json removeBgApiKey)." }
  const fs = require("fs")
  const path = require("path")
  const https = require("https")
  if (!fs.existsSync(imagePath)) return { success: false, error: "입력 이미지를 찾을 수 없습니다." }

  const { boundary, body } = buildMultipartMulti(
    { size: opts.size || "auto", type: "person", format: "png" },
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
    const dest = path.join(destDir, path.basename(srcPath))
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
