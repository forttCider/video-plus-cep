import React, { useEffect, useRef, useState, useCallback } from "react"
import WaveSurfer from "wavesurfer.js"
import RegionsPlugin from "wavesurfer.js/dist/plugins/regions.esm.js"
import "./css/WaveformPanel.css"

/**
 * 하단 고정 파형 패널
 * - 오디오 파형 표시
 * - 단어별 구간 표시 (regions)
 * - 드래그로 구간 편집
 * - 가로 스크롤
 */
export default function WaveformPanel({
  audioPath,
  sentences,
  currentWordId,
  focusedWord,
  onWordTimeChange,
  onSeek,
}) {
  const containerRef = useRef(null)
  const wavesurferRef = useRef(null)
  const regionsRef = useRef(null)
  const [isReady, setIsReady] = useState(false)
  const [wsInitialized, setWsInitialized] = useState(false) // wavesurfer 초기화 완료 여부
  const [duration, setDuration] = useState(0)
  const [isLoading, setIsLoading] = useState(false)

  // 모든 단어 flat 배열
  const allWords = React.useMemo(() => {
    const words = []
    sentences.forEach((sentence, sIdx) => {
      sentence.words?.forEach((word, wIdx) => {
        if (!word.isDeleted && word.start_at !== undefined && word.end_at !== undefined) {
          words.push({
            ...word,
            sentenceIdx: sIdx,
            wordIdx: wIdx,
            id: word.id || word.start_at,
          })
        }
      })
    })
    return words
  }, [sentences])

  // WaveSurfer 초기화
  useEffect(() => {
    if (!containerRef.current || wavesurferRef.current) return

    const regions = RegionsPlugin.create()
    regionsRef.current = regions

    const ws = WaveSurfer.create({
      container: containerRef.current,
      waveColor: "#4a5568",
      progressColor: "#4caf50",
      cursorColor: "#fff",
      cursorWidth: 2,
      height: 80,
      barWidth: 2,
      barGap: 1,
      barRadius: 2,
      normalize: true,
      minPxPerSec: 100, // 줌 레벨 (픽셀/초) - 단어 보일 정도로
      scrollParent: true, // 가로 스크롤 활성화
      autoScroll: true,
      autoCenter: false,
      plugins: [regions],
    })

    ws.on("ready", () => {
      setIsReady(true)
      setDuration(ws.getDuration())
      setIsLoading(false)
    })

    ws.on("click", (relativeX) => {
      const time = relativeX * ws.getDuration()
      if (onSeek) onSeek(time)
    })

    ws.on("error", (err) => {
      console.error("[Waveform] 오류:", err)
      setIsLoading(false)
    })

    wavesurferRef.current = ws
    setWsInitialized(true)
    console.log("[Waveform] wavesurfer 초기화 완료")

    return () => {
      ws.destroy()
      wavesurferRef.current = null
      setWsInitialized(false)
    }
  }, [])

  // 오디오 파일 로드 (wavesurfer 초기화 완료 후)
  useEffect(() => {
    console.log("[Waveform] audioPath 변경:", audioPath, "wsInitialized:", wsInitialized)
    if (!audioPath || !wsInitialized || !wavesurferRef.current) return

    setIsLoading(true)
    setIsReady(false)

    // file:// 프로토콜 또는 경로 처리
    const url = audioPath.startsWith("file://") ? audioPath : `file://${audioPath}`
    
    console.log("[Waveform] 오디오 로드 시작:", url)
    wavesurferRef.current.load(url)
  }, [audioPath, wsInitialized])

  // Regions 업데이트 (단어 구간)
  useEffect(() => {
    if (!isReady || !regionsRef.current) return

    const regions = regionsRef.current

    // 기존 regions 제거
    regions.clearRegions()

    // 단어별 region 추가
    allWords.forEach((word) => {
      const isFocused = focusedWord?.sentenceIdx === word.sentenceIdx && 
                        focusedWord?.wordIdx === word.wordIdx
      const isCurrent = currentWordId === word.start_at

      const region = regions.addRegion({
        id: String(word.id),
        start: word.start_at,
        end: word.end_at,
        color: isCurrent 
          ? "rgba(76, 175, 80, 0.5)" 
          : isFocused 
            ? "rgba(59, 130, 246, 0.5)" 
            : "rgba(100, 100, 100, 0.3)",
        drag: false, // 전체 드래그 비활성화
        resize: true, // 양쪽 끝 리사이즈 활성화
        content: word.text,
      })

      // 리사이즈 완료 시 단어 시간 업데이트
      region.on("update-end", () => {
        if (onWordTimeChange) {
          onWordTimeChange(word.id, region.start, region.end)
        }
      })
    })
  }, [isReady, allWords, focusedWord, currentWordId, onWordTimeChange])

  // 현재 재생/포커스 위치로 스크롤
  useEffect(() => {
    if (!isReady || !wavesurferRef.current) return

    let targetTime = null
    
    if (currentWordId) {
      const word = allWords.find(w => w.start_at === currentWordId)
      if (word) targetTime = word.start_at
    } else if (focusedWord) {
      const word = sentences[focusedWord.sentenceIdx]?.words?.[focusedWord.wordIdx]
      if (word) targetTime = word.start_at
    }

    if (targetTime !== null && duration > 0) {
      const progress = targetTime / duration
      wavesurferRef.current.seekTo(progress)
    }
  }, [currentWordId, focusedWord, isReady, duration, allWords, sentences])

  return (
    <div className="waveform-panel">
      {!audioPath && (
        <div className="waveform-empty-overlay">
          <p>받아쓰기 후 파형이 표시됩니다</p>
        </div>
      )}
      {isLoading && (
        <div className="waveform-loading">
          <p>파형 로딩 중...</p>
        </div>
      )}
      <div 
        ref={containerRef} 
        className="waveform-container"
        style={{ opacity: !audioPath ? 0 : isLoading ? 0.3 : 1 }}
      />
    </div>
  )
}
