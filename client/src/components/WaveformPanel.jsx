import React, { useEffect, useRef, useState, useMemo, useCallback } from "react"
import WaveSurfer from "wavesurfer.js"
import RegionsPlugin from "wavesurfer.js/dist/plugin/wavesurfer.regions.min.js"
import { computePeaksForFile } from "../js/cep-bridge"
import "./css/WaveformPanel.css"

/**
 * 정규화 + 다이내믹 레인지 압축
 *   1) 최대값으로 정규화 → 모든 peak이 [-1, 1] 범위
 *   2) sign(x) * |x|^exponent — 작은 peak을 시각적으로 키움
 *
 * 큰 peak은 canvas 끝에 그대로 닿고(클리핑 없음), 작은 peak/숨소리가
 * 비례 이상으로 보이게 됨. exponent < 1 일수록 더 압축.
 *   exponent=0.5: 0.1 → 0.32, 0.5 → 0.71 (적당)
 *   exponent=0.3: 0.1 → 0.50, 0.5 → 0.81 (강한 압축)
 *   exponent=1.0: 변환 안 함 (단순 정규화)
 */
// CutEditTab의 spkColors와 동일 — 파형 위 화자별 region 색상에 사용
const spkColors = ["#4caf50", "#2196f3", "#f44336", "#ff9800", "#9c27b0", "#00bcd4"]

function hexToRgba(hex, alpha) {
  const r = parseInt(hex.slice(1, 3), 16)
  const g = parseInt(hex.slice(3, 5), 16)
  const b = parseInt(hex.slice(5, 7), 16)
  return `rgba(${r}, ${g}, ${b}, ${alpha})`
}

function colorForSpk(spk, alpha) {
  const hex = spkColors[spk % spkColors.length] || spkColors[0]
  return hexToRgba(hex, alpha)
}

function normalizePeaksP90(peaks, exponent = 0.5) {
  if (!peaks || peaks.length === 0) return peaks
  let absMax = 0
  for (let i = 0; i < peaks.length; i++) {
    const v = Math.abs(peaks[i])
    if (v > absMax) absMax = v
  }
  if (absMax <= 0) return peaks
  const isFloat32 = peaks instanceof Float32Array
  const out = isFloat32 ? new Float32Array(peaks.length) : new Array(peaks.length)
  for (let i = 0; i < peaks.length; i++) {
    const norm = peaks[i] / absMax
    out[i] = norm >= 0
      ? Math.pow(norm, exponent)
      : -Math.pow(-norm, exponent)
  }
  return out
}

export default function WaveformPanel({
  audioPath,
  peaks,
  peaksDuration,
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
  const scrollToCursorRef = useRef(null)
  const [isReady, setIsReady] = useState(false)
  const [isRegionsLoading, setIsRegionsLoading] = useState(false)
  const [duration, setDuration] = useState(0)
  const [scrollTrigger, setScrollTrigger] = useState(0)
  const [containerVisible, setContainerVisible] = useState(false)
  const loadedAudioPathRef = useRef(null)

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
          !word.is_deleted &&
          !(
            word.edit_points?.type === "silence" &&
            word.duration < silenceThresholdMs
          ) &&
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
            spk: sentence.spk || 0,
          })
        }
      })
    })
    return words
  }, [sentences, silenceThresholdMs])

  // 🔥 현재 단어만 빠르게 찾기 위한 인덱스 (Map으로 O(1) 조회)
  const wordTimeIndex = useMemo(() => {
    const map = new Map()
    allWords.forEach((w) =>
      map.set(String(w.id), { start: w.startSec, end: w.endSec }),
    )
    return map
  }, [allWords])

  // 🔥 각 단어의 드래그 경계 계산 — 같은 화자(spk) 내에서 이전/다음 단어 기준
  useEffect(() => {
    wordBoundsRef.current.clear()

    // 화자(spk)별로 그룹핑 후 각 그룹 내에서 시간순 prev/next 결정
    const bySpk = new Map()
    allWords.forEach((w) => {
      const arr = bySpk.get(w.spk) || []
      arr.push(w)
      bySpk.set(w.spk, arr)
    })

    bySpk.forEach((words) => {
      const sorted = [...words].sort((a, b) => a.startSec - b.startSec)
      sorted.forEach((word, idx) => {
        const prevWord = sorted[idx - 1]
        const nextWord = sorted[idx + 1]
        wordBoundsRef.current.set(String(word.id), {
          minStart: prevWord ? prevWord.endSec : 0,
          maxEnd: nextWord ? nextWord.startSec : duration || 9999,
        })
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
      barHeight: 1,
      normalize: false,
      minPxPerSec: 400,
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
      const dur = ws.getDuration()
      setDuration(dur)

      setTimeout(() => {
        setIsReady(true)
        setIsRegionsLoading(true) // 🔥 region 로딩 시작

        const wrapper = ws.drawer?.wrapper
        if (wrapper) {
          let scrollTimeout = null
          wrapper.addEventListener(
            "scroll",
            () => {
              if (scrollTimeout) return
              scrollTimeout = setTimeout(() => {
                setScrollTrigger((n) => n + 1)
                scrollTimeout = null
              }, 300)
            },
            { passive: true },
          )
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
        clampSide = "left"
      }

      // 오른쪽 핸들 제한 (end가 다음 단어 시작보다 크면 안 됨)
      if (region.end > bounds.maxEnd) {
        region.end = bounds.maxEnd
        clamped = true
        clampSide = "right"
      }

      // 경계에 닿으면 빨간색 flash
      if (clamped && region.element) {
        const handles = region.element.querySelectorAll(".wavesurfer-handle")
        const handle = clampSide === "left" ? handles[0] : handles[1]
        if (handle) {
          handle.classList.add("handle-limit")
          setTimeout(() => {
            handle.classList.remove("handle-limit")
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
      // 파형 클릭 시 왼쪽 10% 위치로 스크롤
      if (scrollToCursorRef.current) scrollToCursorRef.current(time, true)
    })

    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current)
      ws.destroy()
      wavesurferRef.current = null
      activeRegionsRef.current.clear()
      setIsReady(false)
    }
  }, [])

  // 오디오 파일 로드 (container가 visible해진 후에만 실행 — hidden 상태에선
  // ws.load 시 wrapper width=0이라 canvas anchor가 모두 0으로 잘못 계산됨)
  useEffect(() => {
    if (!wavesurferRef.current) return
    if (!containerVisible) return
    if (!audioPath && !(peaks && peaks.length > 0)) return
    // 같은 audioPath 재load 방지 (visibility 토글 시)
    if (audioPath && audioPath === loadedAudioPathRef.current) return
    loadedAudioPathRef.current = audioPath || null

    setIsReady(false)
    activeRegionsRef.current.clear()
    wavesurferRef.current.clearRegions()

    // peaks가 있고 audioPath가 없으면 → peaks만으로 파형 렌더링 (오디오 불필요)
    if (peaks && peaks.length > 0 && !audioPath) {
      const ws = wavesurferRef.current
      ws.backend.peaks = normalizePeaksP90(peaks)
      ws.backend.getPlayedPercents = () => 0
      ws.backend.getDuration = () => peaksDuration
      setDuration(peaksDuration)
      ws.drawBuffer()
      ws.zoom(400)
      setTimeout(() => {
        setIsReady(true)
        setIsRegionsLoading(true)
        const wrapper = ws.drawer?.wrapper
        if (wrapper) {
          let scrollTimeout = null
          wrapper.addEventListener(
            "scroll",
            () => {
              if (scrollTimeout) return
              scrollTimeout = setTimeout(() => {
                setScrollTrigger((n) => n + 1)
                scrollTimeout = null
              }, 300)
            },
            { passive: true },
          )
        }
      }, 500)
      return
    }

    if (!audioPath) return

    // ?v=timestamp suffix는 cache-buster 용도. 실제 파일 경로엔 포함되면 안 됨
    const cleanPath = audioPath.split("?")[0]

    if (cleanPath.startsWith("http")) {
      wavesurferRef.current.load(cleanPath)
    } else {
      let url = cleanPath
      if (!cleanPath.startsWith("blob:") && !cleanPath.startsWith("file://")) {
        url = `file://${cleanPath}`
      }
      // 로컬 파일이면 직접 peaks 계산 후 정규화+압축 적용
      let preparedPeaks = null
      let preparedDuration = null
      try {
        const localPath = cleanPath.startsWith("file://")
          ? cleanPath.replace(/^file:\/\//, "")
          : cleanPath
        if (localPath.startsWith("/")) {
          const result = computePeaksForFile(localPath, 400)
          preparedPeaks = normalizePeaksP90(result.peaks)
          preparedDuration = result.duration
        }
      } catch (e) {
        console.warn("[WaveformPanel] peaks 사전계산 실패, 기본 디코드 경로:", e.message)
      }
      if (preparedPeaks && preparedDuration) {
        wavesurferRef.current.load(url, preparedPeaks, "metadata", preparedDuration)
      } else {
        wavesurferRef.current.load(url)
      }
    }
  }, [audioPath, peaks, containerVisible])

  // 🔥 다시 받아쓰기 시 이전 regions 정리
  useEffect(() => {
    if (isUpload && wavesurferRef.current) {
      activeRegionsRef.current.clear()
      wavesurferRef.current.clearRegions()
      setIsRegionsLoading(true)
    }
  }, [isUpload])

  // 현재 단어 하이라이트만 빠르게 업데이트
  const updateCurrentWordHighlight = useCallback(
    (time) => {
      if (!activeRegionsRef.current.size) return

      activeRegionsRef.current.forEach((region, id) => {
        const word = wordTimeIndex.get(id)
        if (!word) return

        const isCurrent = time >= word.start && time < word.end
        if (region.element) {
          const spk = region.data?.spk ?? 0
          region.element.style.backgroundColor = isCurrent
            ? "rgba(255, 230, 0, 0.35)"
            : colorForSpk(spk, 0.25)
        }
      })
    },
    [wordTimeIndex],
  )

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
          ? "rgba(255, 230, 0, 0.35)"
          : colorForSpk(word.spk, 0.25)

      if (!activeRegionsRef.current.has(id)) {
        const region = ws.addRegion({
          id,
          start: word.startSec,
          end: word.endSec,
          color,
          drag: false,
          resize: true,
          data: { text: word.text, spk: word.spk },
        })

        if (region.element) {
          const label = document.createElement("span")
          // 🔥 무음일 때만 edit_points.reason 표시
          label.textContent =
            word.edit_points?.type === "silence"
              ? word.edit_points?.reason || "무음"
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
      // 단어/파형 클릭 시 왼쪽 10% 위치에 놓기
      const scrollPos = cursorPos - clientWidth * 0.1
      wrapper.scrollTo({
        left: Math.max(0, scrollPos),
        behavior: "auto",
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
          behavior: "auto",
        })
      }
    }
  }, [])

  // scrollToCursor를 ref에 저장 (초기화 시점의 이벤트에서 접근 가능)
  useEffect(() => {
    scrollToCursorRef.current = scrollToCursor
  }, [scrollToCursor])

  // container visibility 추적 — width>0 되면 audio load 트리거
  // 이후 resize 시 region 가시 범위 재계산 (200ms debounce)
  useEffect(() => {
    if (!containerRef.current) return
    const target = containerRef.current
    let didSetVisible = false
    let resizeTimeout = null
    const ro = new ResizeObserver((entries) => {
      for (const e of entries) {
        if (e.contentRect.width > 0) {
          if (!didSetVisible) {
            didSetVisible = true
            setContainerVisible(true)
          } else {
            if (resizeTimeout) return
            resizeTimeout = setTimeout(() => {
              setScrollTrigger((n) => n + 1)
              resizeTimeout = null
            }, 200)
          }
        }
      }
    })
    ro.observe(target)
    if (target.getBoundingClientRect().width > 0) {
      didSetVisible = true
      setContainerVisible(true)
    }
    return () => {
      ro.disconnect()
      if (resizeTimeout) clearTimeout(resizeTimeout)
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
        setTimeout(() => {
          isInternalSeekRef.current = false
        }, 30)
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
  }, [
    currentTime,
    isReady,
    duration,
    isPlaying,
    updateCurrentWordHighlight,
    scrollToCursor,
  ])

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

    // 🔥 직접 region 색상 업데이트 (focused는 노랑, 나머지는 화자별 색상)
    const focusedId = String(word.id || word.start_at)
    activeRegionsRef.current.forEach((region, id) => {
      if (region?.element) {
        const isFocused = id === focusedId
        const spk = region.data?.spk ?? 0
        region.element.style.backgroundColor = isFocused
          ? "rgba(255, 230, 0, 0.35)"
          : colorForSpk(spk, 0.25)
      }
    })

    setScrollTrigger((n) => n + 1)
  }, [focusedWord, isReady, duration, sentences, scrollToCursor])

  return (
    <div className="waveform-panel">
      {!audioPath && !(peaks && peaks.length > 0) && (
        <div className="waveform-empty-overlay">
          <p>받아쓰기 후 파형이 표시됩니다</p>
        </div>
      )}
      {(audioPath || (peaks && peaks.length > 0)) && !isReady && (
        <div className="waveform-loading">
          <p>파형 로딩 중...</p>
        </div>
      )}
      {(audioPath || (peaks && peaks.length > 0)) &&
        isReady &&
        (isRegionsLoading || isUpload) && (
          <div className="waveform-loading">
            <p>받아쓰는 중...</p>
          </div>
        )}
      <div
        ref={containerRef}
        className="waveform-container"
        style={{
          opacity:
            !audioPath && !(peaks && peaks.length > 0) ? 0 : isReady ? 1 : 0.3,
        }}
      />
    </div>
  )
}
