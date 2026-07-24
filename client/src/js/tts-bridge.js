/**
 * 발음 교정 TTS - CEP(Node) ↔ API/ExtendScript 브릿지
 *
 * 흐름:
 *   1) 화자 트랙 재렌더(renderAudioPerTrack) → ffmpeg로 10초 샘플 추출
 *   2) POST /voice/clone → voice_id (localStorage에 시퀀스별 영속 저장)
 *   3) POST /voice/synthesize (target_duration_ms) → 원본 구간과 같은 길이의 WAV
 *   4) host insertTtsAudioClip → 화자 트랙의 정확한 틱 위치에 overwrite
 */

import { evalJSON } from "./cep-bridge"

const API_URL =
  (typeof process !== "undefined" &&
    process.env &&
    process.env.REACT_APP_VIDEO_API_URL) ||
  "http://localhost:8000"

/* ── 로컬 파일 유틸 (personimage-bridge와 동일 패턴) ── */
function getCS() {
  if (typeof CSInterface === "undefined") {
    throw new Error("CSInterface를 찾을 수 없습니다 (CEP 환경 아님).")
  }
  return new CSInterface()
}

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

function getTtsDir() {
  const os = require("os")
  const path = require("path")
  const fs = require("fs")
  const dir = path.join(os.homedir(), ".videoPlus", "tts")
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true })
  return dir
}

export function fileToUrl(p) {
  if (!p) return ""
  const normalized = p.replace(/\\/g, "/")
  const prefixed = normalized.startsWith("/") ? normalized : "/" + normalized
  return "file://" + prefixed + "?v=" + new Date().getTime()
}

/* ── voice_id 영속 저장 (시퀀스별, localStorage) ── */
const VOICE_STORE_PREFIX = "videoplus.tts.voices."

/** @returns {{[spk:number]: {voiceId, title, trainedAt, sampleStartSec, sampleDurSec}}} */
export function loadVoiceStore(sequenceId) {
  try {
    const raw = localStorage.getItem(VOICE_STORE_PREFIX + (sequenceId || "default"))
    return raw ? JSON.parse(raw) : {}
  } catch (e) {
    return {}
  }
}

export function saveVoiceStore(sequenceId, store) {
  try {
    localStorage.setItem(VOICE_STORE_PREFIX + (sequenceId || "default"), JSON.stringify(store || {}))
  } catch (e) {}
}

/* ── 1) 샘플 추출 ── */

/**
 * 화자 트랙 하나만 재렌더 (기존 host renderAudioPerTrack 재사용, 48kHz WAV)
 * 받아쓰기용 트랙 파일은 STT 후 정리되므로 학습 시점에 다시 렌더한다.
 * @returns {Promise<{success, outputPath?, error?}>}
 */
export async function renderSpeakerTrack(trackIndex) {
  const result = await evalJSON(`renderAudioPerTrack("${trackIndex}")`)
  if (!result || !result.success || !result.tracks || !result.tracks.length) {
    return { success: false, error: (result && result.error) || "트랙 렌더링 실패" }
  }
  return { success: true, outputPath: result.tracks[0].outputPath }
}

/**
 * 렌더된 트랙 WAV에서 참조 샘플 컷 (48kHz mono pcm_s16le)
 * @param {string} trackWavPath - 렌더된 트랙 WAV (시퀀스 타임라인 기준)
 * @param {number} startSec - 타임라인 시작 초 (컷편집 보정 완료된 값)
 * @param {number} durSec - 샘플 길이 (기본 10초)
 * @param {number} spk - 화자 번호 (파일명용)
 * @returns {Promise<{success, path?, error?}>}
 */
export function extractVoiceSample(trackWavPath, startSec, durSec, spk) {
  return new Promise((resolve) => {
    try {
      const { execFile } = require("child_process")
      const path = require("path")
      const fs = require("fs")
      const ffmpegPath = getFFmpegPath()
      ensureFFmpegExecutable(ffmpegPath)
      const outPath = path.join(getTtsDir(), `voice_sample_spk${spk}_${Date.now()}.wav`)
      const args = [
        "-y",
        "-ss", Math.max(0, startSec).toFixed(3),
        "-i", trackWavPath,
        "-t", Math.max(1, durSec).toFixed(3),
        "-ar", "48000", "-ac", "1", "-c:a", "pcm_s16le",
        outPath,
      ]
      execFile(ffmpegPath, args, { maxBuffer: 1024 * 1024 * 64 }, (err, stdout, stderr) => {
        if (err || !fs.existsSync(outPath)) {
          resolve({ success: false, error: "샘플 추출 실패: " + (stderr || (err && err.message)) })
        } else {
          resolve({ success: true, path: outPath })
        }
      })
    } catch (e) {
      resolve({ success: false, error: e.message })
    }
  })
}

/**
 * 여러 발화 구간을 잘라 이어붙인 참조 샘플 생성 (30초 목표 — 화자 유사도 향상)
 * 모든 조각이 동일 포맷(48kHz mono pcm_s16le)이므로 concat demuxer -c copy 사용.
 * @param {string} trackWavPath
 * @param {Array<{startSec:number, durSec:number}>} segments - 타임라인 기준 구간들
 * @param {number} spk
 * @returns {Promise<{success, path?, error?}>}
 */
export async function extractVoiceSampleMulti(trackWavPath, segments, spk) {
  const fs = require("fs")
  const path = require("path")
  if (!segments || !segments.length) return { success: false, error: "샘플 구간이 없습니다." }

  const parts = []
  try {
    for (let i = 0; i < segments.length; i++) {
      const r = await extractVoiceSample(trackWavPath, segments[i].startSec, segments[i].durSec, `${spk}_part${i}`)
      if (!r.success) return { success: false, error: r.error }
      parts.push(r.path)
    }
    if (parts.length === 1) return { success: true, path: parts[0] }

    // concat 목록 파일 작성 후 -c copy 결합
    const listPath = path.join(getTtsDir(), `concat_spk${spk}_${Date.now()}.txt`)
    fs.writeFileSync(listPath, parts.map((p) => `file '${p.replace(/'/g, "'\\''")}'`).join("\n"))
    const outPath = path.join(getTtsDir(), `voice_sample_spk${spk}_${Date.now()}.wav`)

    return await new Promise((resolve) => {
      const { execFile } = require("child_process")
      const ffmpegPath = getFFmpegPath()
      execFile(
        ffmpegPath,
        ["-y", "-f", "concat", "-safe", "0", "-i", listPath, "-c", "copy", outPath],
        { maxBuffer: 1024 * 1024 * 64 },
        (err, stdout, stderr) => {
          try { fs.rmSync(listPath, { force: true }) } catch (e) {}
          parts.forEach((p) => { try { fs.rmSync(p, { force: true }) } catch (e) {} })
          if (err || !fs.existsSync(outPath)) {
            resolve({ success: false, error: "샘플 결합 실패: " + (stderr || (err && err.message)) })
          } else {
            resolve({ success: true, path: outPath })
          }
        },
      )
    })
  } catch (e) {
    return { success: false, error: e.message }
  }
}

/**
 * 통합 라우드니스(LUFS) 측정 — 학습 샘플의 음량을 기억해 합성 시 음량 매칭에 사용
 * @returns {Promise<{success, lufs?, error?}>}
 */
export function measureLufs(wavPath) {
  return new Promise((resolve) => {
    try {
      const { execFile } = require("child_process")
      const ffmpegPath = getFFmpegPath()
      ensureFFmpegExecutable(ffmpegPath)
      execFile(
        ffmpegPath,
        ["-nostats", "-i", wavPath, "-af", "ebur128=framelog=quiet", "-f", "null", "-"],
        { maxBuffer: 1024 * 1024 * 16 },
        (err, stdout, stderr) => {
          const matches = String(stderr || "").match(/I:\s*(-?[\d.]+)\s*LUFS/g)
          if (!matches || !matches.length) {
            resolve({ success: false, error: "LUFS 측정 실패" })
            return
          }
          const last = matches[matches.length - 1].match(/(-?[\d.]+)/)
          resolve({ success: true, lufs: parseFloat(last[1]) })
        },
      )
    } catch (e) {
      resolve({ success: false, error: e.message })
    }
  })
}

/* ── 2) 보이스 학습 (clone) ── */

/**
 * POST /voice/clone — 샘플 업로드 → voice_id
 * @returns {Promise<{success, voiceId?, error?}>}
 */
export async function cloneVoice(samplePath, title) {
  try {
    const fs = require("fs")
    const path = require("path")
    const buf = fs.readFileSync(samplePath)
    const blob = new Blob([buf], { type: "audio/wav" })

    const form = new FormData()
    form.append("audio", blob, path.basename(samplePath))
    form.append("title", title || "videoplus-voice")

    const res = await fetch(`${API_URL}/voice/clone`, { method: "POST", body: form })
    const json = await res.json().catch(() => ({}))
    if (!res.ok || !json.voice_id) {
      return { success: false, error: json.detail || `보이스 학습 실패 (${res.status})` }
    }
    return { success: true, voiceId: json.voice_id }
  } catch (e) {
    return { success: false, error: "네트워크 오류: " + e.message }
  }
}

/**
 * DELETE /voice/{voice_id} — 재학습 시 기존 보이스 교체 삭제 (베스트 에포트)
 * @returns {Promise<{success, error?}>}
 */
export async function deleteVoice(voiceId) {
  try {
    const res = await fetch(`${API_URL}/voice/${encodeURIComponent(voiceId)}`, { method: "DELETE" })
    if (!res.ok) {
      const json = await res.json().catch(() => ({}))
      return { success: false, error: json.detail || `보이스 삭제 실패 (${res.status})` }
    }
    return { success: true }
  } catch (e) {
    return { success: false, error: "네트워크 오류: " + e.message }
  }
}

/* ── 3) 합성 (길이 정합) ── */

/**
 * POST /voice/synthesize — 교정 텍스트를 원본 구간 길이(target_duration_ms)에
 * 정합된 48kHz WAV로 합성해 로컬에 저장한다.
 *
 * @returns {Promise<{success, path?, appliedTempo?, status?, error?, voiceNotFound?}>}
 *   voiceNotFound=true 면 서버/ElevenLabs에서 보이스가 삭제된 것 → 재학습 유도
 */
export async function synthesizeTts({ voiceId, text, targetDurationMs, targetLufs }) {
  try {
    const res = await fetch(`${API_URL}/voice/synthesize`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        voice_id: voiceId,
        text,
        target_duration_ms: targetDurationMs || null,
        target_lufs: typeof targetLufs === "number" ? targetLufs : null,
      }),
    })

    if (!res.ok) {
      const json = await res.json().catch(() => ({}))
      return {
        success: false,
        status: res.status,
        voiceNotFound: res.status === 404,
        error: json.detail || `합성 실패 (${res.status})`,
      }
    }

    const appliedTempo = parseFloat(res.headers.get("X-Applied-Tempo") || "1") || 1
    const buf = Buffer.from(await res.arrayBuffer())

    const fs = require("fs")
    const path = require("path")
    const ext = targetDurationMs ? "wav" : "mp3"
    const outPath = path.join(getTtsDir(), `tts_fit_${Date.now()}.${ext}`)
    fs.writeFileSync(outPath, buf)
    return { success: true, path: outPath, appliedTempo }
  } catch (e) {
    return { success: false, error: "네트워크 오류: " + e.message }
  }
}

/* ── 4) 타임라인 반영 ── */

/**
 * 합성 WAV를 프로젝트에 import 후 지정 오디오 트랙의 정확한 틱 위치에
 * overwrite (host/index.jsx insertTtsAudioClip). 틱은 문자열로 전달 (정밀도).
 * @returns {Promise<{success, error?, clipStartTicks?}>}
 */
export async function insertTtsAudioClip(filePath, trackIndex, startTicks, durationTicks) {
  const esc = String(filePath).replace(/\\/g, "/").replace(/"/g, '\\"')
  return evalJSON(
    `insertTtsAudioClip("${esc}", ${trackIndex}, "${String(startTicks)}", "${String(durationTicks)}")`,
  )
}

/** 미리듣기 등 임시 파일 정리 */
export function cleanupTtsFiles() {
  try {
    const fs = require("fs")
    const path = require("path")
    const dir = getTtsDir()
    for (const f of fs.readdirSync(dir)) {
      try {
        fs.rmSync(path.join(dir, f), { force: true })
      } catch (e) {}
    }
  } catch (e) {}
}
