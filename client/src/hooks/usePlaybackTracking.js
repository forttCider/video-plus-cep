import { useEffect } from "react"
import { isPlaying, getPlayerPosition } from "../js/cep-bridge"
import { findCurrentWordFromIndex } from "../js/calculateTimeOffset"

export default function usePlaybackTracking({
  isConnected,
  sentencesLength,
  isProcessing,
  currentTimeRef,
  setCurrentTime,
  currentWordIdRef,
  setCurrentWordId,
  setCurrentWordSentenceIdx,
  wordSentenceIdxRef,
  isPlayingStateRef,
  setIsPlayingState,
  timelineIndexRef,
  wordRefs,
  subsWordRefs,
  activeTabRef,
}) {
  // 재생 위치 폴링
  useEffect(() => {
    if (!isConnected || sentencesLength === 0 || isProcessing) return
    const pollInterval = setInterval(async () => {
      try {
        const playingResult = await isPlaying()
        const nowPlaying = playingResult?.isPlaying || false
        if (nowPlaying !== isPlayingStateRef.current) {
          isPlayingStateRef.current = nowPlaying
          setIsPlayingState(nowPlaying)
        }
        if (!nowPlaying) {
          return
        }
        const result = await getPlayerPosition()
        if (result?.success) {
          if (result.seconds !== currentTimeRef.current) {
            currentTimeRef.current = result.seconds
            setCurrentTime(result.seconds)
          }
          if (timelineIndexRef.current) {
            const found = findCurrentWordFromIndex(
              timelineIndexRef.current,
              result.seconds,
            )
            if (
              found?.word &&
              found.word.start_at !== currentWordIdRef.current
            ) {
              currentWordIdRef.current = found.word.start_at
              setCurrentWordId(found.word.start_at)
              const sIdx =
                wordSentenceIdxRef.current.get(found.word.start_at) ?? null
              setCurrentWordSentenceIdx(sIdx)
              // 현재 단어로 스크롤 (활성 탭에 따라 적절한 ref 사용)
              const refs = activeTabRef?.current === "subs" ? subsWordRefs : wordRefs
              refs.current[found.word.start_at]?.scrollIntoView({
                behavior: "instant",
                block: "center",
              })
            }
          }
        }
      } catch (e) {}
    }, 100)
    return () => clearInterval(pollInterval)
  }, [isConnected, sentencesLength, isProcessing])

}
