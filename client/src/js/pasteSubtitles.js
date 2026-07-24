/**
 * 편집자가 미리 작성한 자막 텍스트(줄바꿈 = 자막 경계)를 붙여넣어
 * STT 단어 타이밍에 맞춰 자막(subsSentences)으로 재조합.
 *
 * - 각 줄 = 하나의 자막
 * - 줄 앞의 "숫자 + 공백"(편집자 참고용 번호)은 제거하고 텍스트만 사용
 *   (숫자 뒤에 공백이 있을 때만 제거 → "2024년..." 같은 정상 숫자는 보존)
 * - 붙여넣은 단어를 STT 단어에 순서대로 매칭해 타이밍 부여 (v1: 위치 기반)
 */

// 붙여넣은 텍스트 → 자막 줄 배열 (숫자 제거 + 빈 줄 제거)
export function parsePastedLines(text) {
  return (text || "")
    .split(/\r?\n/)
    .map((line) => line.replace(/^\s*\d+\s+/, "").trim())
    .filter((line) => line.length > 0)
}

let _uid = 0
function genId(prefix) {
  _uid += 1
  return prefix + _uid + "_" + Math.random().toString(36).slice(2, 8)
}

/**
 * 자막 줄 배열 + STT sentences → subsSentences 재조합
 * @param {string[]} lines - parsePastedLines 결과
 * @param {Array} sentences - STT 대본 (타이밍 원천)
 * @returns {Array} subsSentences
 */
export function composeSubsFromLines(lines, sentences) {
  // STT 단어 평탄화 (타이밍 있는 것만) + 화자
  const sttFlat = []
  ;(sentences || []).forEach((s) => {
    ;(s.words || []).forEach((w) => {
      if (w.is_deleted || w.is_edit) return
      if (w.start_at == null) return
      sttFlat.push({ w, spk: s.spk || 0 })
    })
  })

  let gi = 0 // STT 단어 진행 인덱스
  const out = []

  for (const line of lines) {
    const tokens = line.split(/\s+/).filter(Boolean)
    if (tokens.length === 0) continue

    const firstEntry = sttFlat[Math.min(gi, Math.max(0, sttFlat.length - 1))]
    const spk = firstEntry ? firstEntry.spk : 0

    const words = tokens.map((tok) => {
      // 위치 기반 매칭 — STT 단어가 모자라면 마지막 단어 타이밍 재사용
      const entry = sttFlat[gi] || sttFlat[sttFlat.length - 1]
      gi += 1
      const base = entry ? entry.w : {}
      return { ...base, id: genId("w"), text: tok, is_deleted: false, is_edit: false }
    })

    const f = words[0] || {}
    const l = words[words.length - 1] || {}
    out.push({
      id: genId("sub"),
      spk,
      words,
      captionText: line,
      start_at: f.start_at,
      end_at: l.end_at,
      start_time: f.start_time,
      end_time: l.end_time,
    })
  }

  return out
}
