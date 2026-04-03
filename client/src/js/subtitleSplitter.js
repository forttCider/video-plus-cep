/**
 * 문장을 자막 단위(3~4단어)로 분할
 * 구두점 + 시간 갭 기반 분할
 */

const DEFAULT_maxWords = 4
const GAP_THRESHOLD_MS = 300 // 단어 사이 갭이 300ms 이상이면 분할 지점

/**
 * sentences 배열을 자막 단위로 분할
 * @param {number} maxWords - 한 자막에 최대 단어 수 (기본 4)
 * @param {Array} sentences - 원본 문장 배열
 * @returns {Array} 자막 단위로 분할된 문장 배열
 */
export function splitForSubtitles(sentences, maxWords = DEFAULT_maxWords) {
  const result = []

  for (const sentence of sentences) {
    if (sentence.is_deleted) {
      result.push(sentence)
      continue
    }

    const visibleWords = (sentence.words || []).filter(
      (w) => !w.is_deleted && !w.is_edit && w.text,
    )

    if (visibleWords.length === 0) {
      result.push(sentence)
      continue
    }

    // 분할 지점 찾기
    const breakPoints = findBreakPoints(visibleWords)
    const chunks = splitByBreakPoints(visibleWords, breakPoints, maxWords)

    for (let i = 0; i < chunks.length; i++) {
      const chunk = chunks[i]
      const firstWord = chunk[0]
      const lastWord = chunk[chunk.length - 1]

      // 원본 sentence의 words에서 chunk에 해당하는 범위 추출 (gap 단어 포함)
      const allWords = sentence.words || []
      const startIdx = allWords.indexOf(firstWord)
      const endIdx = allWords.indexOf(lastWord)

      // startIdx ~ endIdx 범위의 모든 단어 (gap 포함)
      const chunkWords =
        startIdx >= 0 && endIdx >= 0
          ? allWords.slice(startIdx, endIdx + 1)
          : chunk

      result.push({
        ...sentence,
        id: `${sentence.id}_sub${i}`,
        words: chunkWords,
        msg: chunk.map((w) => w.text).join(" "),
        start_at: firstWord.start_at,
        duration: (lastWord.end_at || lastWord.start_at) - firstWord.start_at,
        start_time: firstWord.start_time,
        end_time: lastWord.end_time,
      })
    }
  }

  return result
}

/**
 * 분할 지점 인덱스 배열 반환
 * @param {Array} words - 표시 가능한 단어 배열
 * @returns {Array<number>} 분할 지점 인덱스 (해당 인덱스 앞에서 자름)
 */
function findBreakPoints(words) {
  const breaks = []

  for (let i = 1; i < words.length; i++) {
    const prev = words[i - 1]
    const curr = words[i]

    // 구두점 뒤에서 분할
    if (/[.。!?]$/.test(prev.text)) {
      breaks.push(i)
      continue
    }

    // 쉼표 뒤 + 3단어 이상 쌓였으면 분할
    const lastBreak = breaks.length > 0 ? breaks[breaks.length - 1] : 0
    const wordsSinceBreak = i - lastBreak
    if (/[,，]$/.test(prev.text) && wordsSinceBreak >= 2) {
      breaks.push(i)
      continue
    }

    // 시간 갭이 큰 곳에서 분할 (2단어 이상 쌓였을 때)
    const gap = curr.start_at - (prev.end_at || prev.start_at)
    if (gap >= GAP_THRESHOLD_MS && wordsSinceBreak >= 2) {
      breaks.push(i)
      continue
    }
  }

  return breaks
}

/**
 * 분할 지점에 따라 단어를 청크로 나누고, maxWords 초과 시 추가 분할
 */
function splitByBreakPoints(words, breakPoints, maxWords) {
  const chunks = []
  let start = 0

  for (const bp of breakPoints) {
    if (bp > start) {
      chunks.push(words.slice(start, bp))
      start = bp
    }
  }
  if (start < words.length) {
    chunks.push(words.slice(start))
  }

  // maxWords 초과하는 청크를 추가 분할
  const result = []
  for (const chunk of chunks) {
    if (chunk.length <= maxWords) {
      result.push(chunk)
    } else {
      for (let i = 0; i < chunk.length; i += maxWords) {
        result.push(chunk.slice(i, i + maxWords))
      }
    }
  }

  return result
}
