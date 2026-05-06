/**
 * FastICA 기반 2-트랙 블리드 분리 (Pure JS, Node.js 내장만 사용)
 * CEP 패널 내장 Node.js 환경에서 동작
 */

const fs = require("fs")

/**
 * WAV 파일 파싱 (PCM 16-bit, mono/stereo → Float32 mono)
 */
function readWav(filePath) {
  const buf = fs.readFileSync(filePath)

  if (buf.toString("ascii", 0, 4) !== "RIFF") throw new Error("Not a RIFF file")
  if (buf.toString("ascii", 8, 12) !== "WAVE") throw new Error("Not a WAVE file")

  let offset = 12
  let sampleRate = 0
  let channels = 0
  let bitsPerSample = 0
  let dataOffset = -1
  let dataSize = 0

  while (offset + 8 <= buf.length) {
    const chunkId = buf.toString("ascii", offset, offset + 4)
    const chunkSize = buf.readUInt32LE(offset + 4)

    if (chunkId === "fmt ") {
      channels = buf.readUInt16LE(offset + 10)
      sampleRate = buf.readUInt32LE(offset + 12)
      bitsPerSample = buf.readUInt16LE(offset + 22)
    } else if (chunkId === "data") {
      dataOffset = offset + 8
      dataSize = chunkSize
      break
    }
    offset += 8 + chunkSize
  }

  if (dataOffset < 0) throw new Error("data chunk not found")
  if (bitsPerSample !== 16) throw new Error(`Only 16-bit PCM supported (got ${bitsPerSample})`)
  if (channels < 1 || channels > 2) throw new Error(`Only mono/stereo supported (got ${channels})`)

  const bytesPerFrame = 2 * channels
  const numSamples = Math.floor(dataSize / bytesPerFrame)
  const samples = new Float32Array(numSamples)

  for (let i = 0; i < numSamples; i++) {
    if (channels === 1) {
      samples[i] = buf.readInt16LE(dataOffset + i * 2) / 32768
    } else {
      const l = buf.readInt16LE(dataOffset + i * 4)
      const r = buf.readInt16LE(dataOffset + i * 4 + 2)
      samples[i] = (l + r) / 65536
    }
  }

  return { samples, sampleRate }
}

/**
 * Float32 mono 샘플을 PCM 16-bit WAV로 저장
 */
function writeWav(filePath, samples, sampleRate) {
  const dataSize = samples.length * 2
  const buf = Buffer.alloc(44 + dataSize)

  buf.write("RIFF", 0, "ascii")
  buf.writeUInt32LE(36 + dataSize, 4)
  buf.write("WAVE", 8, "ascii")

  buf.write("fmt ", 12, "ascii")
  buf.writeUInt32LE(16, 16)
  buf.writeUInt16LE(1, 20) // PCM
  buf.writeUInt16LE(1, 22) // mono
  buf.writeUInt32LE(sampleRate, 24)
  buf.writeUInt32LE(sampleRate * 2, 28)
  buf.writeUInt16LE(2, 32)
  buf.writeUInt16LE(16, 34)

  buf.write("data", 36, "ascii")
  buf.writeUInt32LE(dataSize, 40)

  for (let i = 0; i < samples.length; i++) {
    const s = Math.max(-1, Math.min(1, samples[i]))
    buf.writeInt16LE(Math.round(s * 32767), 44 + i * 2)
  }

  fs.writeFileSync(filePath, buf)
}

/**
 * 평균 계산
 */
function mean(arr) {
  let s = 0
  const n = arr.length
  for (let i = 0; i < n; i++) s += arr[i]
  return s / n
}

/**
 * 센터링 (평균 제거)
 */
function centerSignals(signals) {
  const result = []
  for (const sig of signals) {
    const m = mean(sig)
    const out = new Float32Array(sig.length)
    for (let i = 0; i < sig.length; i++) out[i] = sig[i] - m
    result.push(out)
  }
  return result
}

/**
 * 2x2 대칭 행렬의 고유값/고유벡터 (공분산 행렬용)
 */
function eigSym2x2(a, b, d) {
  const trace = a + d
  const det = a * d - b * b
  const half = trace / 2
  const disc = Math.sqrt(Math.max(0, half * half - det))
  const l1 = half + disc
  const l2 = half - disc

  let v1, v2
  if (Math.abs(b) > 1e-12) {
    const n1 = Math.sqrt((l1 - d) * (l1 - d) + b * b)
    const n2 = Math.sqrt((l2 - d) * (l2 - d) + b * b)
    v1 = [(l1 - d) / n1, b / n1]
    v2 = [(l2 - d) / n2, b / n2]
  } else {
    v1 = [1, 0]
    v2 = [0, 1]
  }
  return { eigenvalues: [l1, l2], eigenvectors: [v1, v2] }
}

/**
 * 화이트닝: X_whitened = D^(-1/2) E^T X
 * E = 공분산의 고유벡터 행렬, D = 고유값 대각행렬
 */
function whiten2(signals) {
  const x1 = signals[0]
  const x2 = signals[1]
  const n = x1.length

  // 공분산 행렬 [[c11, c12], [c12, c22]]
  let c11 = 0
  let c12 = 0
  let c22 = 0
  for (let i = 0; i < n; i++) {
    c11 += x1[i] * x1[i]
    c12 += x1[i] * x2[i]
    c22 += x2[i] * x2[i]
  }
  c11 /= n
  c12 /= n
  c22 /= n

  const { eigenvalues, eigenvectors } = eigSym2x2(c11, c12, c22)
  const d1 = 1 / Math.sqrt(Math.max(eigenvalues[0], 1e-12))
  const d2 = 1 / Math.sqrt(Math.max(eigenvalues[1], 1e-12))

  // W = D^(-1/2) * E^T  (각 고유벡터가 행)
  // W row 0 = d1 * eigenvectors[0]
  // W row 1 = d2 * eigenvectors[1]
  const W00 = d1 * eigenvectors[0][0]
  const W01 = d1 * eigenvectors[0][1]
  const W10 = d2 * eigenvectors[1][0]
  const W11 = d2 * eigenvectors[1][1]

  const w0 = new Float32Array(n)
  const w1 = new Float32Array(n)
  for (let i = 0; i < n; i++) {
    w0[i] = W00 * x1[i] + W01 * x2[i]
    w1[i] = W10 * x1[i] + W11 * x2[i]
  }
  return [w0, w1]
}

/**
 * FastICA (2개 성분 추출)
 * negentropy 최대화, tanh 비선형성 사용
 */
function fastICA2(whitened, maxIter = 1000, tol = 1e-4) {
  const x1 = whitened[0]
  const x2 = whitened[1]
  const n = x1.length

  // 랜덤 초기 w (단위 벡터)
  let w0 = Math.random() - 0.5
  let w1 = Math.random() - 0.5
  let wn = Math.sqrt(w0 * w0 + w1 * w1) || 1
  w0 /= wn
  w1 /= wn

  for (let iter = 0; iter < maxIter; iter++) {
    let Exg0 = 0
    let Exg1 = 0
    let Egp = 0

    for (let i = 0; i < n; i++) {
      const proj = w0 * x1[i] + w1 * x2[i]
      const g = Math.tanh(proj)
      const gp = 1 - g * g
      Exg0 += x1[i] * g
      Exg1 += x2[i] * g
      Egp += gp
    }
    Exg0 /= n
    Exg1 /= n
    Egp /= n

    // w_new = E[x g(w^T x)] - E[g'(w^T x)] w
    let wNew0 = Exg0 - Egp * w0
    let wNew1 = Exg1 - Egp * w1
    const norm = Math.sqrt(wNew0 * wNew0 + wNew1 * wNew1) || 1
    wNew0 /= norm
    wNew1 /= norm

    // 수렴 체크: |w_new · w| ≈ 1
    const dot = Math.abs(wNew0 * w0 + wNew1 * w1)
    w0 = wNew0
    w1 = wNew1
    if (Math.abs(dot - 1) < tol) break
  }

  // 두 번째 성분 = 첫 성분에 직교 (2D에서는 회전 90도)
  const w2_0 = -w1
  const w2_1 = w0

  const s1 = new Float32Array(n)
  const s2 = new Float32Array(n)
  for (let i = 0; i < n; i++) {
    s1[i] = w0 * x1[i] + w1 * x2[i]
    s2[i] = w2_0 * x1[i] + w2_1 * x2[i]
  }
  return [s1, s2]
}

/**
 * 최대 절댓값 기준 [-1, 1]로 정규화 (클리핑 방지)
 */
function normalizePeak(sig, target = 0.95) {
  let maxAbs = 0
  for (let i = 0; i < sig.length; i++) {
    const a = Math.abs(sig[i])
    if (a > maxAbs) maxAbs = a
  }
  if (maxAbs < 1e-10) return sig
  const scale = target / maxAbs
  const out = new Float32Array(sig.length)
  for (let i = 0; i < sig.length; i++) out[i] = sig[i] * scale
  return out
}

/**
 * 두 오디오 트랙의 블리드를 FastICA로 분리
 * 어느 쪽이 화자 A/B인지는 결과를 들어봐야 함 (ICA는 순서 보장 X)
 *
 * @param {string} trackAPath  입력 WAV (mono, 16-bit)
 * @param {string} trackBPath
 * @param {string} outputAPath 분리된 성분 1 출력 경로
 * @param {string} outputBPath 분리된 성분 2 출력 경로
 * @returns {string[]} [outputAPath, outputBPath]
 */
function separateBleedICA(trackAPath, trackBPath, outputAPath, outputBPath) {
  const a = readWav(trackAPath)
  const b = readWav(trackBPath)

  if (a.sampleRate !== b.sampleRate) {
    throw new Error(`sample rate mismatch: ${a.sampleRate} vs ${b.sampleRate}`)
  }
  const sampleRate = a.sampleRate

  // 짧은 쪽 길이에 맞춤
  const n = Math.min(a.samples.length, b.samples.length)
  const sigA = a.samples.length === n ? a.samples : a.samples.slice(0, n)
  const sigB = b.samples.length === n ? b.samples : b.samples.slice(0, n)

  const centered = centerSignals([sigA, sigB])
  const whitened = whiten2(centered)
  const [s1, s2] = fastICA2(whitened)

  writeWav(outputAPath, normalizePeak(s1), sampleRate)
  writeWav(outputBPath, normalizePeak(s2), sampleRate)

  return [outputAPath, outputBPath]
}

module.exports = { separateBleedICA, readWav, writeWav }
