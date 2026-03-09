import React, { useEffect, useRef, useState, useMemo, useCallback } from "react"
import WaveSurfer from "wavesurfer.js"
import RegionsPlugin from "wavesurfer.js/dist/plugin/wavesurfer.regions.min.js"
import "./css/WaveformPanel.css"

export default function WaveformPanel({
  audioPath,
  sentences,
  currentWordId,
  currentTime,
  focusedWord,
  onWordTimeChange,
  onSeek,
  isPlaying,
  isUpload,
  silenceThresholdMs = 1000,
}) {
  const containerRef = useRef(null)
  const wavesurferRef = useRef(null)
  const activeRegionsRef = useRef(new Map())
  const wordBoundsRef = useRef(new Map()) // 🔥 각 단어의 드래그 경계
  const onWordTimeChangeRef = useRef(onWordTimeChange)
  const onSeekRef = useRef(onSeek)
  const isDraggingRef = useRef(false)
  const justDraggedRef = useRef(false)
  const isInternalSeekRef = useRef(false)
  const lastRegionUpdateRef = useRef(0)
  const rafRef = useRef(null)
  const [isReady, setIsReady] = useState(false)
  const [isRegionsLoading, setIsRegionsLoading] = useState(false)
  const [duration, setDuration] = useState(0)
  const [scrollTrigger, setScrollTrigger] = useState(0)

  useEffect(() => {
    onWordTimeChangeRef.current = onWordTimeChange
    onSeekRef.current = onSeek
  }, [onWordTimeChange, onSeek])

  const allWords = useMemo(() => {
    const words = []
    if (!sentences) return words
    sentences.forEach((sentence, sIdx) => {
      sentence.words?.forEach((word, wIdx) => {
        if (
          !word.isDeleted &&
          !(word.edit_points?.type === "silence" && word.duration < silenceThresholdMs) &&
          word.start_at !== undefined &&
          word.end_at !== undefined
        ) {
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
  }, [sentences, silenceThresholdMs])

  // 🔥 현재 단어만 빠르게 찾기 위한 인덱스 (Map으로 O(1) 조회)
  const wordTimeIndex = useMemo(() => {
    const map = new Map()
    allWords.forEach(w => map.set(String(w.id), { start: w.startSec, end: w.endSec }))
    return map
  }, [allWords])

  // 🔥 각 단어의 드래그 경계 계산 (이전 단어 끝 ~ 다음 단어 시작)
  useEffect(() => {
    wordBoundsRef.current.clear()
    
    // 시간순 정렬
    const sorted = [...allWords].sort((a, b) => a.startSec - b.startSec)
    
    sorted.forEach((word, idx) => {
      const prevWord = sorted[idx - 1]
      const nextWord = sorted[idx + 1]
      
      wordBoundsRef.current.set(String(word.id), {
        minStart: prevWord ? prevWord.endSec : 0,
        maxEnd: nextWord ? nextWord.startSec : duration || 9999,
      })
    })
  }, [allWords, duration])

  // WaveSurfer 초기화
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
      pixelRatio: 1,
      plugins: [
        RegionsPlugin.create({
          dragSelection: false,
        }),
      ],
    })

    wavesurferRef.current = ws

    ws.on("ready", () => {
      setDuration(ws.getDuration())

      setTimeout(() => {
        setIsReady(true)
        setIsRegionsLoading(true) // 🔥 region 로딩 시작

        const wrapper = ws.drawer?.wrapper
        if (wrapper) {
          let scrollTimeout = null
          wrapper.addEventListener("scroll", () => {
            if (scrollTimeout) return
            scrollTimeout = setTimeout(() => {
              setScrollTrigger((n) => n + 1)
              scrollTimeout = null
            }, 300)
          }, { passive: true })
        }
      }, 500)
    })

    ws.on("region-update-end", (region) => {
      isDraggingRef.current = false
      justDraggedRef.current = true

      if (onWordTimeChangeRef.current && region.id) {
        onWordTimeChangeRef.current(
          region.id,
          region.start * 1000,
          region.end * 1000,
        )
      }

      setTimeout(() => {
        justDraggedRef.current = false
      }, 500)
    })

    // 🔥 드래그 중 범위 제한
    ws.on("region-updated", (region) => {
      isDraggingRef.current = true
      
      const bounds = wordBoundsRef.current.get(region.id)
      if (!bounds) return
      
      let clamped = false
      let clampSide = null
      
      // 왼쪽 핸들 제한 (start가 이전 단어 끝보다 작으면 안 됨)
      if (region.start < bounds.minStart) {
        region.start = bounds.minStart
        clamped = true
        clampSide = 'left'
      }
      
      // 오른쪽 핸들 제한 (end가 다음 단어 시작보다 크면 안 됨)
      if (region.end > bounds.maxEnd) {
        region.end = bounds.maxEnd
        clamped = true
        clampSide = 'right'
      }
      
      // 경계에 닿으면 빨간색 flash
      if (clamped && region.element) {
        const handles = region.element.querySelectorAll('.wavesurfer-handle')
        const handle = clampSide === 'left' ? handles[0] : handles[1]
        if (handle) {
          handle.classList.add('handle-limit')
          setTimeout(() => {
            handle.classList.remove('handle-limit')
          }, 300)
        }
      }
    })

    ws.on("region-click", (region, e) => {
      e.stopPropagation()
      if (onSeekRef.current) {
        onSeekRef.current(region.start)
      }
    })

    ws.on("seek", (progress) => {
      if (isDraggingRef.current || isInternalSeekRef.current) return
      const time = progress * ws.getDuration()
      if (onSeekRef.current) onSeekRef.current(time)
    })

    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current)
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
    wavesurferRef.current.clearRegions()

    let url = audioPath
    if (
      !audioPath.startsWith("blob:") &&
      !audioPath.startsWith("http") &&
      !audioPath.startsWith("file://")
    ) {
      url = `file://${audioPath}`
    }

    wavesurferRef.current.load(url)
  }, [audioPath])

  // 🔥 다시 받아쓰기 시 이전 regions 정리
  useEffect(() => {
    if (isUpload && wavesurferRef.current) {
      activeRegionsRef.current.clear()
      wavesurferRef.current.clearRegions()
      setIsRegionsLoading(true)
    }
  }, [isUpload])

  // 현재 단어 하이라이트만 빠르게 업데이트
  const updateCurrentWordHighlight = useCallback((time) => {
    if (!activeRegionsRef.current.size) return

    activeRegionsRef.current.forEach((region, id) => {
      const word = wordTimeIndex.get(id)
      if (!word) return

      const isCurrent = time >= word.start && time < word.end
      if (region.element) {
        region.element.style.backgroundColor = isCurrent
          ? "rgba(255, 230, 0, 0.25)"
          : "rgba(100, 100, 100, 0.1)"
      }
    })
  }, [wordTimeIndex])

  // regions 전체 업데이트 (스크롤/초기화 시에만)
  useEffect(() => {
    if (!isReady || !wavesurferRef.current || !duration) return
    if (isDraggingRef.current) return

    const ws = wavesurferRef.current
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

    const visibleWords = allWords.filter(
      (word) => word.endSec >= visibleStart && word.startSec <= visibleEnd,
    )
    const visibleIds = new Set(visibleWords.map((w) => String(w.id)))

    activeRegionsRef.current.forEach((region, id) => {
      if (!visibleIds.has(id)) {
        region.remove()
        activeRegionsRef.current.delete(id)
      }
    })

    visibleWords.forEach((word) => {
      const id = String(word.id)
      const isFocused =
        focusedWord?.sentenceIdx === word.sentenceIdx &&
        focusedWord?.wordIdx === word.wordIdx
      const isCurrent =
        currentTime >= word.startSec && currentTime < word.endSec

      const color =
        isCurrent || isFocused
          ? "rgba(255, 230, 0, 0.25)"
          : "rgba(100, 100, 100, 0.1)"

      if (!activeRegionsRef.current.has(id)) {
        const region = ws.addRegion({
          id,
          start: word.startSec,
          end: word.endSec,
          color,
          drag: false,
          resize: true,
          data: { text: word.text },
        })

        if (region.element) {
          const label = document.createElement("span")
          // 🔥 무음일 때만 edit_points.reason 표시
          label.textContent = word.edit_points?.type === "silence" 
            ? (word.edit_points?.reason || "무음")
            : word.text
          label.style.cssText =
            "position:absolute;top:2px;left:4px;font-size:11px;color:#fff;white-space:nowrap;pointer-events:none;text-shadow:0 0 2px #000;"
          region.element.appendChild(label)
        }

        activeRegionsRef.current.set(id, region)
      } else {
        // 🔥 기존 region 색상 업데이트
        const region = activeRegionsRef.current.get(id)
        if (region?.element) {
          region.element.style.backgroundColor = color
        }
      }
    })
    
    // 🔥 region 로딩 완료 (단어가 있을 때만)
    if (allWords.length > 0 && activeRegionsRef.current.size > 0) {
      setIsRegionsLoading(false)
    }
  }, [isReady, duration, allWords, focusedWord, scrollTrigger])

  // 스크롤 함수 - Premiere Pro 스타일 (페이지 넘기기)
  const scrollToCursor = useCallback((time, forceCenter = false) => {
    if (isDraggingRef.current || justDraggedRef.current) return

    const ws = wavesurferRef.current
    if (!ws) return

    const wrapper = ws.drawer?.wrapper
    if (!wrapper) return

    const scrollWidth = wrapper.scrollWidth
    const clientWidth = wrapper.clientWidth
    const dur = ws.getDuration()
    if (!dur || !scrollWidth) return

    const cursorPos = (time / dur) * scrollWidth
    const scrollLeft = wrapper.scrollLeft

    if (forceCenter) {
      // 단어 클릭 시 가운데로
      const scrollPos = cursorPos - clientWidth / 2
      wrapper.scrollTo({
        left: Math.max(0, scrollPos),
        behavior: 'auto'
      })
    } else {
      // 🔥 재생 중: 커서가 보이는 영역 밖이면 스크롤
      const leftEdge = scrollLeft
      const rightEdge = scrollLeft + clientWidth * 0.9
      if (cursorPos < leftEdge || cursorPos >= rightEdge) {
        // 커서를 왼쪽 10% 위치에 놓기
        const scrollPos = cursorPos - clientWidth * 0.1
        wrapper.scrollTo({
          left: Math.max(0, scrollPos),
          behavior: 'auto'
        })
      }
    }
  }, [])

  // 재생 중 커서 업데이트
  useEffect(() => {
    if (!isReady || !wavesurferRef.current || !duration) return
    if (currentTime <= 0) return

    const progress = Math.min(currentTime / duration, 1)

    if (isPlaying) {
      // 재생 중에도 seekTo 호출 (커서 이동)
      if (rafRef.current) cancelAnimationFrame(rafRef.current)
      rafRef.current = requestAnimationFrame(() => {
        isInternalSeekRef.current = true
        wavesurferRef.current.seekTo(progress)
        setTimeout(() => { isInternalSeekRef.current = false }, 30)
        updateCurrentWordHighlight(currentTime)
        scrollToCursor(currentTime, false) // 🔥 페이지 넘기기 방식
      })
    } else {
      // 일시정지 상태 - 스크롤 안 함 (제자리 유지)
      isInternalSeekRef.current = true
      wavesurferRef.current.seekTo(progress)
      updateCurrentWordHighlight(currentTime)
      setTimeout(() => {
        isInternalSeekRef.current = false
      }, 50)
    }

    const now = performance.now()
    if (now - lastRegionUpdateRef.current >= 1000) {
      lastRegionUpdateRef.current = now
      setScrollTrigger((n) => n + 1)
    }
  }, [currentTime, isReady, duration, isPlaying, updateCurrentWordHighlight, scrollToCursor])

  // 단어 클릭(포커스) 시
  useEffect(() => {
    if (!isReady || !wavesurferRef.current || !duration || !focusedWord) return

    const word =
      sentences[focusedWord.sentenceIdx]?.words?.[focusedWord.wordIdx]
    if (!word || word.start_at === undefined) return

    const startSeconds = word.start_at / 1000
    const progress = Math.min(startSeconds / duration, 1)
    isInternalSeekRef.current = true
    wavesurferRef.current.seekTo(progress)
    scrollToCursor(startSeconds, true)
    setTimeout(() => {
      isInternalSeekRef.current = false
    }, 50)

    // 🔥 직접 region 색상 업데이트
    const focusedId = String(word.id || word.start_at)
    activeRegionsRef.current.forEach((region, id) => {
      if (region?.element) {
        const isFocused = id === focusedId
        region.element.style.backgroundColor = isFocused
          ? "rgba(255, 230, 0, 0.25)"
          : "rgba(100, 100, 100, 0.1)"
      }
    })

    setScrollTrigger((n) => n + 1)
  }, [focusedWord, isReady, duration, sentences, scrollToCursor])

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
      {audioPath && isReady && (isRegionsLoading || isUpload) && (
        <div className="waveform-loading">
          <p>받아쓰는 중...</p>
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
