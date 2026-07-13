/**
 * 받아쓰기 요약(summary) 객체를 사람이 읽기 좋은 텍스트로 변환.
 * CutEditTab(표시용)과 TitleTab/BackgroundTab(생성 맥락)에서 공유.
 */

/** 요약 객체에서 세그먼트 배열 추출 (data.segments 또는 segments) */
export function getSegments(summary) {
  return summary?.data?.segments || summary?.segments || []
}

/** 세그먼트 배열(부분집합 가능)을 사람이 읽기 좋은 텍스트로 변환 */
export function segmentsToText(segments) {
  return (segments || [])
    .map((seg) => {
      const idx = seg.segment_index + 1
      const title = seg.topic || `구간 ${idx}`
      const time =
        seg.start_time || seg.end_time
          ? `\n   ${seg.start_time} — ${seg.end_time}`
          : ""
      const subs = (seg.subtopics || [])
        .map((sub, si) => {
          const points = (sub.points || []).map((p) => `      · ${p}`).join("\n")
          return `   ${idx}.${si + 1} ${sub.title}${points ? "\n" + points : ""}`
        })
        .join("\n\n")
      return `${idx}. ${title}${time}${subs ? "\n\n" + subs : ""}`
    })
    .join("\n\n\n")
}

/** 요약 객체 전체를 텍스트로 변환 */
export function summaryToText(summary) {
  return segmentsToText(getSegments(summary))
}

/**
 * 임의 텍스트(요약 자동입력 또는 직접 붙여넣기)를 '구간(unit)' 배열로 파싱.
 * 최상위 번호 제목("1. ", "2. ")이 2개 이상이면 그 단위로, 아니면 빈 줄 문단 단위로 나눈다.
 * @returns {Array<{index:number, topic:string, text:string}>}
 */
export function parseUnits(text) {
  const t = (text || "").trim()
  if (!t) return []
  const lines = t.split("\n")
  const headings = []
  lines.forEach((ln, i) => {
    if (/^\s*\d+\.\s/.test(ln)) headings.push(i)
  })
  let blocks
  if (headings.length >= 2) {
    blocks = headings.map((start, h) => {
      const end = h + 1 < headings.length ? headings[h + 1] : lines.length
      return lines.slice(start, end).join("\n").trim()
    })
  } else {
    blocks = t.split(/\n\s*\n/).map((b) => b.trim())
  }
  return blocks
    .filter(Boolean)
    .map((b, i) => {
      const first = (b.split("\n")[0] || "").trim()
      const topic = first.replace(/^\s*\d+\.\s*/, "").trim() || `구간 ${i + 1}`
      return { index: i, topic, text: b }
    })
}
