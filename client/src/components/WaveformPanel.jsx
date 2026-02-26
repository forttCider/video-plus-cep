import React, { useEffect, useRef, useState, useMemo } from "react"
import WaveSurfer from "wavesurfer.js"
import RegionsPlugin from "wavesurfer.js/dist/plugin/wavesurfer.regions.min.js"
import "./css/WaveformPanel.css"

/**
 * 하단 고정 파형 패널 (WaveSurfer v6)
 */
export default function WaveformPanel({
  audioPath,
  sentences,
  currentWordId,
  currentTime,
  focusedWord,
  onWordTimeChange,
  onSeek,
}) {
  const containerRef = useRef(null)
  const wavesurferRef = useRef(null)
  const activeRegionsRef = useRef(new Map())
  const onWordTimeChangeRef = useRef(onWordTimeChange)
  const onSeekRef = useRef(onSeek)
  const isDraggingRef = useRef(false)
  const isInternalSeekRef = useRef(false) // 내부 seek 여부
  const lastSeekTimeRef = useRef(0) // 마지막 seek 시간
  const [isReady, setIsReady] = useState(false)
  const [duration, setDuration] = useState(0)
  const [scrollTrigger, setScrollTrigger] = useState(0) // 스크롤 시 regions 업데이트용

  // refs 업데이트
  useEffect(() => {
    onWordTimeChangeRef.current = onWordTimeChange
    onSeekRef.current = onSeek
  }, [onWordTimeChange, onSeek])

  // 모든 단어 flat 배열
  const allWords = useMemo(() => {
    const words = []
    if (!sentences) return words
    sentences.forEach((sentence, sIdx) => {
      sentence.words?.forEach((word, wIdx) => {
        if (!word.isDeleted && word.start_at !== undefined && word.end_at !== undefined) {
          words.push({
            ...word,
            sentenceIdx: sIdx,
            wordIdx: wIdx,
            id: word.id || word.start_at,
            startSec: word.start_at / 1000,
            endSec: word.end_at / 1000,
          })
        }
      })
    })
    return words
  }, [sentences])

  // WaveSurfer v6 초기화
  useEffect(() => {
    if (!containerRef.current) return

    const ws = WaveSurfer.create({
      container: containerRef.current,
      waveColor: "#4a5568",
      progressColor: "#4a5568",
      cursorColor: "#fff",
      cursorWidth: 2,
      height: 100,
      normalize: true,
      minPxPerSec: 200,
      scrollParent: true,
      backend: "MediaElement",
      plugins: [
        RegionsPlugin.create({
          dragSelection: false, // 새 region 생성 비활성화
        }),
      ],
    })

    wavesurferRef.current = ws

    ws.on("ready", () => {
      setDuration(ws.getDuration())
      
      // 파형 렌더링 완료 후 isReady 설정
      setTimeout(() => {
        setIsReady(true)
        
        // 스크롤 시 regions 업데이트 (throttle 적용)
        const wrapper = ws.drawer?.wrapper
        if (wrapper) {
          let scrollTimeout = null
          wrapper.addEventListener("scroll", () => {
            if (scrollTimeout) return
            scrollTimeout = setTimeout(() => {
              setScrollTrigger(n => n + 1)
              scrollTimeout = null
            }, 200) // 200ms throttle
          })
        }
      }, 500) // 파형 렌더링 대기
    })

    // v6 방식: wavesurfer.on('region-*')
    ws.on("region-update-end", (region) => {
      isDraggingRef.current = false
      
      if (onWordTimeChangeRef.current && region.id) {
        onWordTimeChangeRef.current(region.id, region.start * 1000, region.end * 1000)
      }
    })

    ws.on("region-updated", (region) => {
      isDraggingRef.current = true
    })

    ws.on("region-click", (region, e) => {
      e.stopPropagation()
      
      // 해당 단어 위치로 이동
      if (onSeekRef.current) {
        onSeekRef.current(region.start)
      }
      
      // 클릭한 위치를 화면 가운데로 스크롤
      const wrapper = ws.drawer?.wrapper
      if (wrapper) {
        const dur = ws.getDuration()
        if (dur) {
          const scrollWidth = wrapper.scrollWidth
          const clientWidth = wrapper.clientWidth
          const scrollPos = (region.start / dur) * scrollWidth - (clientWidth / 2)
          wrapper.scrollLeft = Math.max(0, scrollPos)
        }
      }
    })

    ws.on("seek", (progress) => {
      if (isDraggingRef.current || isInternalSeekRef.current) return
      const time = progress * ws.getDuration()
      if (onSeekRef.current) onSeekRef.current(time)
    })

    return () => {
      ws.destroy()
      wavesurferRef.current = null
      activeRegionsRef.current.clear()
      setIsReady(false)
    }
  }, [])

  // 오디오 파일 로드
  useEffect(() => {
    if (!audioPath || !wavesurferRef.current) return

    setIsReady(false)
    activeRegionsRef.current.clear()
    
    // 기존 regions 제거
    wavesurferRef.current.clearRegions()

    let url = audioPath
    if (!audioPath.startsWith("blob:") && !audioPath.startsWith("http") && !audioPath.startsWith("file://")) {
      url = `file://${audioPath}`
    }

    wavesurferRef.current.load(url)
  }, [audioPath])

  // regions 업데이트 (v6 방식: wavesurfer.addRegion)
  useEffect(() => {
    if (!isReady || !wavesurferRef.current || !duration) return

    const ws = wavesurferRef.current

    // 현재 보이는 범위 계산
    const wrapper = ws.drawer?.wrapper
    let visibleStart = 0
    let visibleEnd = duration

    if (wrapper) {
      const scrollLeft = wrapper.scrollLeft
      const width = wrapper.clientWidth
      const scrollWidth = wrapper.scrollWidth
      if (scrollWidth > 0) {
        const pxPerSec = scrollWidth / duration
        visibleStart = scrollLeft / pxPerSec - 5
        visibleEnd = (scrollLeft + width) / pxPerSec + 5
      }
    }

    // 보이는 범위의 단어 필터
    const visibleWords = allWords.filter(
      word => word.endSec >= visibleStart && word.startSec <= visibleEnd
    )
    const visibleIds = new Set(visibleWords.map(w => String(w.id)))

    // 보이지 않는 region 제거
    activeRegionsRef.current.forEach((region, id) => {
      if (!visibleIds.has(id)) {
        region.remove()
        activeRegionsRef.current.delete(id)
      }
    })

    // 새로 보이는 region 추가
    visibleWords.forEach((word) => {
      const id = String(word.id)
      const isFocused = focusedWord?.sentenceIdx === word.sentenceIdx && 
                        focusedWord?.wordIdx === word.wordIdx
      // currentTime 기준으로 현재 단어인지 판단 (더 정확함)
      const isCurrent = currentTime >= word.startSec && currentTime < word.endSec

      const color = (isCurrent || isFocused)
        ? "rgba(255, 230, 0, 0.25)" 
        : "rgba(100, 100, 100, 0.1)"

      if (!activeRegionsRef.current.has(id)) {
        // v6 방식: wavesurfer.addRegion()
        const region = ws.addRegion({
          id,
          start: word.startSec,
          end: word.endSec,
          color,
          drag: false,
          resize: true,
          data: { text: word.text },
        })
        
        // v6: region 요소에 텍스트 직접 추가
        if (region.element) {
          const label = document.createElement('span')
          label.textContent = word.text
          label.style.cssText = 'position:absolute;top:2px;left:4px;font-size:11px;color:#fff;white-space:nowrap;pointer-events:none;text-shadow:0 0 2px #000;'
          region.element.appendChild(label)
        }
        
        activeRegionsRef.current.set(id, region)
      } else {
        const region = activeRegionsRef.current.get(id)
        if (region && region.element) {
          region.element.style.backgroundColor = color
        }
      }
    })
  }, [isReady, duration, allWords, focusedWord, currentTime, scrollTrigger])

  // 커서를 화면 중앙으로 스크롤
  const scrollToCursor = (time) => {
    try {
      const ws = wavesurferRef.current
      if (!ws) return
      
      const wrapper = ws.drawer?.wrapper || ws.container?.querySelector('wave')
      if (!wrapper) return
      
      const scrollWidth = wrapper.scrollWidth
      const clientWidth = wrapper.clientWidth
      const dur = ws.getDuration()
      if (!dur || !scrollWidth) return
      
      const scrollPos = (time / dur) * scrollWidth - (clientWidth / 2)
      wrapper.scrollLeft = Math.max(0, scrollPos)
    } catch (e) {
      console.error("[파형] scrollToCursor 오류:", e)
    }
  }

  // 현재 재생 위치로 파형 커서 이동
  useEffect(() => {
    if (!isReady || !wavesurferRef.current || !duration) return
    if (currentTime <= 0) return

    const progress = Math.min(currentTime / duration, 1)
    isInternalSeekRef.current = true
    wavesurferRef.current.seekTo(progress)
    scrollToCursor(currentTime)
    setTimeout(() => { isInternalSeekRef.current = false }, 50)
    
    // regions 업데이트는 0.3초마다만
    if (Math.abs(currentTime - lastSeekTimeRef.current) >= 0.3) {
      lastSeekTimeRef.current = currentTime
      setScrollTrigger(n => n + 1)
    }
  }, [currentTime, isReady, duration])

  // 단어 클릭(포커스) 시 파형 커서 이동
  useEffect(() => {
    if (!isReady || !wavesurferRef.current || !duration || !focusedWord) return

    const word = sentences[focusedWord.sentenceIdx]?.words?.[focusedWord.wordIdx]
    if (!word || word.start_at === undefined) return

    const startSeconds = word.start_at / 1000
    const progress = Math.min(startSeconds / duration, 1)
    isInternalSeekRef.current = true
    wavesurferRef.current.seekTo(progress)
    scrollToCursor(startSeconds)
    setTimeout(() => { isInternalSeekRef.current = false }, 50)
    
    // regions 업데이트 트리거
    setScrollTrigger(n => n + 1)
  }, [focusedWord, isReady, duration, sentences])

  return (
    <div className="waveform-panel">
      {!audioPath && (
        <div className="waveform-empty-overlay">
          <p>받아쓰기 후 파형이 표시됩니다</p>
        </div>
      )}
      {audioPath && !isReady && (
        <div className="waveform-loading">
          <p>파형 로딩 중...</p>
        </div>
      )}
      <div 
        ref={containerRef} 
        className="waveform-container"
        style={{ opacity: !audioPath ? 0 : isReady ? 1 : 0.3 }}
      />
    </div>
  )
}
