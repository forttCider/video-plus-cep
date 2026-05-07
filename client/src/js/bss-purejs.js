/**
 * Pure-JS 크로스토크(블리드) 제거 + WAV I/O
 * ffmpeg 의존성 없음. Node 내장 모듈(fs)만 사용.
 *
 * 알고리즘: 사이드체인 게이팅 (binary gate)
 *   - 각 트랙의 RMS 엔벨로프를 계산
 *   - 반대 트랙이 ratio(dB) 이상 크면 현재 트랙을 reduction(dB) 만큼 감쇠
 *   - 게인은 이동평균으로 평활화 (클릭 방지)
 */


/**
 * WAV 파일 읽기
 * 지원: PCM 8/16/24/32-bit, IEEE float 32/64-bit, 모노/스테레오/멀티채널
 * @returns {{ channels: Float32Array[], sampleRate: number, numChannels: number, numSamples: number }}
 */
export function readWav(filePath) {
  const fs = require("fs")
  const buf = fs.readFileSync(filePath)
  if (buf.toString("ascii", 0, 4) !== "RIFF")
    throw new Error(`not a RIFF file: ${filePath}`)
  if (buf.toString("ascii", 8, 12) !== "WAVE")
    throw new Error(`not a WAVE file: ${filePath}`)

  let offset = 12
  let fmt = null
  let dataOffset = null
  let dataSize = null

  while (offset <= buf.length - 8) {
    const chunkId = buf.toString("ascii", offset, offset + 4)
    const chunkSize = buf.readUInt32LE(offset + 4)
    if (chunkId === "fmt ") {
      fmt = {
        audioFormat: buf.readUInt16LE(offset + 8),
        numChannels: buf.readUInt16LE(offset + 10),
        sampleRate: buf.readUInt32LE(offset + 12),
        bitsPerSample: buf.readUInt16LE(offset + 22),
      }
      // WAVE_FORMAT_EXTENSIBLE: 실제 포맷은 SubFormat 시작 16bit에서 읽음
      if (fmt.audioFormat === 0xfffe && chunkSize >= 40) {
        fmt.audioFormat = buf.readUInt16LE(offset + 32)
      }
    } else if (chunkId === "data") {
      dataOffset = offset + 8
      dataSize = chunkSize
      break
    }
    offset += 8 + chunkSize + (chunkSize % 2)
  }

  if (!fmt || dataOffset === null)
    throw new Error(`invalid WAV: ${filePath}`)

  const { audioFormat, numChannels, bitsPerSample, sampleRate } = fmt
  const bytesPerSample = bitsPerSample / 8
  const numSamples = Math.floor(dataSize / (bytesPerSample * numChannels))

  let readSample
  if (audioFormat === 1) {
    if (bitsPerSample === 8)
      readSample = (off) => (buf.readUInt8(off) - 128) / 128
    else if (bitsPerSample === 16)
      readSample = (off) => buf.readInt16LE(off) / 32768
    else if (bitsPerSample === 24)
      readSample = (off) => {
        const v =
          buf.readUInt8(off) |
          (buf.readUInt8(off + 1) << 8) |
          (buf.readInt8(off + 2) << 16)
        return v / 8388608
      }
    else if (bitsPerSample === 32)
      readSample = (off) => buf.readInt32LE(off) / 2147483648
  } else if (audioFormat === 3) {
    if (bitsPerSample === 32)
      readSample = (off) => buf.readFloatLE(off)
    else if (bitsPerSample === 64)
      readSample = (off) => buf.readDoubleLE(off)
  }
  if (!readSample)
    throw new Error(
      `unsupported WAV: format=${audioFormat}, ${bitsPerSample}bit`,
    )

  const channels = []
  for (let c = 0; c < numChannels; c++)
    channels.push(new Float32Array(numSamples))

  for (let i = 0; i < numSamples; i++) {
    for (let c = 0; c < numChannels; c++) {
      channels[c][i] = readSample(
        dataOffset + (i * numChannels + c) * bytesPerSample,
      )
    }
  }
  return { channels, sampleRate, numChannels, numSamples }
}


/**
 * 16-bit PCM WAV 파일 쓰기 (청크 스트리밍 — 긴 파일도 메모리 안전)
 * @param {string} filePath
 * @param {(Float32Array|Float64Array)[]} channelsArr - 채널별 샘플 배열 (값 범위 [-1, 1])
 * @param {number} sampleRate
 */
export function writeWav16(filePath, channelsArr, sampleRate) {
  const fs = require("fs")
  const numChannels = channelsArr.length
  const numSamples = channelsArr[0].length
  const bytesPerSample = 2
  const blockAlign = numChannels * bytesPerSample
  const byteRate = sampleRate * blockAlign
  const dataSize = numSamples * blockAlign

  const header = Buffer.alloc(44)
  header.write("RIFF", 0, "ascii")
  header.writeUInt32LE(36 + dataSize, 4)
  header.write("WAVE", 8, "ascii")
  header.write("fmt ", 12, "ascii")
  header.writeUInt32LE(16, 16)
  header.writeUInt16LE(1, 20) // PCM
  header.writeUInt16LE(numChannels, 22)
  header.writeUInt32LE(sampleRate, 24)
  header.writeUInt32LE(byteRate, 28)
  header.writeUInt16LE(blockAlign, 32)
  header.writeUInt16LE(16, 34)
  header.write("data", 36, "ascii")
  header.writeUInt32LE(dataSize, 40)

  const CHUNK_SAMPLES = 65536
  const chunkBuf = Buffer.alloc(CHUNK_SAMPLES * blockAlign)

  const fd = fs.openSync(filePath, "w")
  try {
    fs.writeSync(fd, header, 0, 44)
    for (let base = 0; base < numSamples; base += CHUNK_SAMPLES) {
      const count = Math.min(CHUNK_SAMPLES, numSamples - base)
      let off = 0
      for (let i = 0; i < count; i++) {
        const si = base + i
        for (let c = 0; c < numChannels; c++) {
          let v = channelsArr[c][si]
          if (v > 1) v = 1
          else if (v < -1) v = -1
          chunkBuf.writeInt16LE(Math.round(v * 32767), off)
          off += 2
        }
      }
      fs.writeSync(fd, chunkBuf, 0, count * blockAlign)
    }
  } finally {
    fs.closeSync(fd)
  }
}


/**
 * 저역통과 FIR 설계 (Hamming 윈도우드 싱크)
 */
function designLowPassFIR(cutoffHz, sampleRate, numTaps) {
  const coeffs = new Float32Array(numTaps)
  const fc = cutoffHz / sampleRate
  const center = (numTaps - 1) / 2
  let sum = 0
  for (let i = 0; i < numTaps; i++) {
    const n = i - center
    let h
    if (Math.abs(n) < 1e-12) {
      h = 2 * fc
    } else {
      h = Math.sin(2 * Math.PI * fc * n) / (Math.PI * n)
    }
    const w = 0.54 - 0.46 * Math.cos((2 * Math.PI * i) / (numTaps - 1))
    coeffs[i] = h * w
    sum += coeffs[i]
  }
  for (let i = 0; i < numTaps; i++) coeffs[i] /= sum
  return coeffs
}

/**
 * 정수비율 다운샘플링 (안티앨리어싱 FIR + 데시메이션)
 * - inRate는 outRate의 정수배여야 함 (예: 48000→16000, M=3)
 * - Nyquist 대비 여유 95% 지점에 컷오프 → STT용 8kHz 대역 안전 보존
 */
export function downsample(input, inRate, outRate) {
  if (inRate === outRate) return input
  if (inRate < outRate) throw new Error("업샘플링은 지원하지 않음")
  if (inRate % outRate !== 0) {
    throw new Error(`정수비율만 지원: ${inRate} → ${outRate}`)
  }
  const M = inRate / outRate
  const numTaps = 64
  const cutoffHz = (outRate / 2) * 0.95
  const coeffs = designLowPassFIR(cutoffHz, inRate, numTaps)
  const center = (numTaps - 1) >> 1
  const inLen = input.length
  const outLen = Math.floor(inLen / M)
  const out = new Float32Array(outLen)

  for (let i = 0; i < outLen; i++) {
    const base = i * M - center
    let sum = 0
    for (let k = 0; k < numTaps; k++) {
      const idx = base + k
      if (idx >= 0 && idx < inLen) {
        sum += input[idx] * coeffs[k]
      }
    }
    out[i] = sum
  }
  return out
}


/**
 * 멀티채널을 모노로 다운믹스 (채널 평균)
 */
export function toMono(wav) {
  if (wav.numChannels === 1) return wav.channels[0]
  const n = wav.numSamples
  const out = new Float32Array(n)
  for (let c = 0; c < wav.numChannels; c++) {
    const ch = wav.channels[c]
    for (let i = 0; i < n; i++) out[i] += ch[i]
  }
  const inv = 1 / wav.numChannels
  for (let i = 0; i < n; i++) out[i] *= inv
  return out
}


/**
 * 박스 필터 이동평균 (np.convolve mode='same' 동등)
 * 슬라이딩 윈도우 — 추가 버퍼 없이 O(N), Float64 누적기로 드리프트 방지
 */
export function movingAvgSame(x, win) {
  const n = x.length
  const out = new Float32Array(n)
  const leftHalf = Math.floor((win - 1) / 2)
  const rightHalf = win - 1 - leftHalf
  const invWin = 1 / win

  let sum = 0
  let curStart = 0
  let curEnd = Math.min(rightHalf + 1, n)
  for (let j = 0; j < curEnd; j++) sum += x[j]

  for (let i = 0; i < n; i++) {
    const start = i - leftHalf > 0 ? i - leftHalf : 0
    const end = i + rightHalf + 1 < n ? i + rightHalf + 1 : n
    while (curStart < start) sum -= x[curStart++]
    while (curEnd < end) sum += x[curEnd++]
    out[i] = sum * invWin
  }
  return out
}


/**
 * RMS 엔벨로프 (x^2의 이동평균 + sqrt)
 * 슬라이딩 윈도우로 sq/avg 중간 배열 제거
 */
export function envelope(x, win) {
  const n = x.length
  const out = new Float32Array(n)
  const leftHalf = Math.floor((win - 1) / 2)
  const rightHalf = win - 1 - leftHalf
  const invWin = 1 / win

  let sum = 0
  let curStart = 0
  let curEnd = Math.min(rightHalf + 1, n)
  for (let j = 0; j < curEnd; j++) {
    const v = x[j]
    sum += v * v
  }

  for (let i = 0; i < n; i++) {
    const start = i - leftHalf > 0 ? i - leftHalf : 0
    const end = i + rightHalf + 1 < n ? i + rightHalf + 1 : n
    while (curStart < start) {
      const v = x[curStart++]
      sum -= v * v
    }
    while (curEnd < end) {
      const v = x[curEnd++]
      sum += v * v
    }
    // FP 드리프트로 sum이 살짝 음수로 빠질 수 있어 clamp — sqrt NaN 방지
    const s = sum > 0 ? sum : 0
    out[i] = Math.sqrt(s * invWin + 1e-12)
  }
  return out
}


/**
 * N-트랙 사이드체인 크로스토크 제거
 * 각 트랙마다 "나머지 트랙 중 가장 큰 엔벨로프"를 기준으로 사이드체인 게이트 적용
 * → 다른 화자가 자기 트랙에서 말하는 순간 현재 트랙은 "블리드"로 판정되어 감쇠
 *
 * 게인 평활화: 비대칭 AR (attack/release) smoother
 *   - attackMs: 게이트 열림 응답 시간 (느릴수록 채터링/전환 시 bleed 누출 감소)
 *   - releaseMs: 게이트 닫힘 응답 시간 (짧을수록 bleed tone-tail 최소화)
 *   - smoothMs (하위호환): 설정 시 attackMs=releaseMs=smoothMs로 치환 → 대칭 단일 τ
 *
 * @param {(Float32Array|Float64Array)[]} tracks - 모노 트랙 배열 (값 [-1, 1], 모두 같은 길이)
 * @param {number} sr - 샘플레이트
 * @param {{ envMs?: number, ratioDb?: number, reductionDb?: number, attackMs?: number, releaseMs?: number, smoothMs?: number }} opts
 * @returns {Float32Array[]} 크로스토크 제거된 트랙 배열 (입력과 동일 순서/길이)
 */
export function crosstalkReduceMulti(tracks, sr, opts) {
  opts = opts || {}
  const envMs = opts.envMs !== undefined ? opts.envMs : 30
  const ratioDb = opts.ratioDb !== undefined ? opts.ratioDb : 3
  const reductionDb = opts.reductionDb !== undefined ? opts.reductionDb : -60
  // smoothMs가 오면 대칭 AR로 치환, 아니면 attackMs/releaseMs 따로 사용
  const attackMs =
    opts.attackMs !== undefined
      ? opts.attackMs
      : opts.smoothMs !== undefined
        ? opts.smoothMs
        : 30
  const releaseMs =
    opts.releaseMs !== undefined
      ? opts.releaseMs
      : opts.smoothMs !== undefined
        ? opts.smoothMs
        : 3

  const N = tracks.length
  if (N < 2) throw new Error("crosstalkReduceMulti: 최소 2개 트랙 필요")
  const n = tracks[0].length
  for (let k = 1; k < N; k++) {
    if (tracks[k].length !== n)
      throw new Error("crosstalkReduceMulti: 모든 트랙 길이가 같아야 함")
  }

  const envWin = Math.max(1, Math.floor((sr * envMs) / 1000))
  const ratio = Math.pow(10, ratioDb / 20)
  const reduction = Math.pow(10, reductionDb / 20)
  // AR smoother 계수 — 1 - exp(-dt/τ), dt=1/sr, τ=ms/1000
  const attackCoef = 1 - Math.exp(-1000 / (Math.max(0.1, attackMs) * sr))
  const releaseCoef = 1 - Math.exp(-1000 / (Math.max(0.1, releaseMs) * sr))

  const envs = tracks.map((t) => envelope(t, envWin))

  // 각 프레임에서 최대값/argmax/두번째최대값을 O(N)으로 구해,
  // 각 트랙 k의 "나머지 중 최대"는 (k가 argmax면 secondMax, 아니면 maxVal)
  const gains = Array.from({ length: N }, () => new Float32Array(n))
  for (let i = 0; i < n; i++) {
    let maxVal = 0
    let maxIdx = 0
    let secondVal = 0
    for (let k = 0; k < N; k++) {
      const v = envs[k][i]
      if (v > maxVal) {
        secondVal = maxVal
        maxVal = v
        maxIdx = k
      } else if (v > secondVal) {
        secondVal = v
      }
    }
    for (let k = 0; k < N; k++) {
      const maxOther = k === maxIdx ? secondVal : maxVal
      gains[k][i] = maxOther > envs[k][i] * ratio ? reduction : 1.0
    }
  }

  // envs 조기 해제 — 평활화/적용 단계에서는 불필요
  for (let k = 0; k < N; k++) envs[k] = null

  // 비대칭 AR smoother + 트랙 곱셈 단일 패스
  //   target > y (열림 방향): attackCoef로 수렴
  //   target < y (닫힘 방향): releaseCoef로 수렴
  const result = new Array(N)
  for (let k = 0; k < N; k++) {
    const g = gains[k]
    const t = tracks[k]
    const out = new Float32Array(n)
    let y = g[0]
    for (let i = 0; i < n; i++) {
      const target = g[i]
      const coef = target > y ? attackCoef : releaseCoef
      y += (target - y) * coef
      out[i] = t[i] * y
    }
    gains[k] = null
    result[k] = out
  }
  return result
}


/**
 * 2트랙 사이드체인 크로스토크 제거 (편의 래퍼)
 * @deprecated 새 코드는 crosstalkReduceMulti 사용 권장
 */
export function crosstalkReduce(a, b, sr, opts) {
  const [cleanA, cleanB] = crosstalkReduceMulti([a, b], sr, opts)
  return { cleanA, cleanB }
}


/**
 * 피크 정규화 (단일 신호)
 */
export function normalizePeak(x, peak) {
  peak = peak === undefined ? 0.95 : peak
  let m = 0
  for (let i = 0; i < x.length; i++) {
    const v = Math.abs(x[i])
    if (v > m) m = v
  }
  if (m === 0) return x
  const out = new Float32Array(x.length)
  const g = peak / m
  for (let i = 0; i < x.length; i++) out[i] = x[i] * g
  return out
}


/**
 * 피크 정규화 (N채널 공유 피크 기준 — 채널 간 상대 밸런스 유지)
 */
export function normalizePeakSharedMulti(tracks, peak) {
  peak = peak === undefined ? 0.95 : peak
  let m = 0
  for (const t of tracks) {
    for (let i = 0; i < t.length; i++) {
      const v = Math.abs(t[i])
      if (v > m) m = v
    }
  }
  if (m === 0) return tracks
  const g = peak / m
  return tracks.map((t) => {
    const out = new Float32Array(t.length)
    for (let i = 0; i < t.length; i++) out[i] = t[i] * g
    return out
  })
}


/**
 * 피크 정규화 (2채널 편의 래퍼)
 * @deprecated 새 코드는 normalizePeakSharedMulti 사용 권장
 */
export function normalizePeakShared(a, b, peak) {
  return normalizePeakSharedMulti([a, b], peak)
}
