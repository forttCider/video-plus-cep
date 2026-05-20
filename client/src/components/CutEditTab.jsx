import { useState, useCallback } from "react"
import { VolumeX, MessageCircle, Mic, Scissors, Copy, Check, Search } from "lucide-react"
import { Button } from "./ui/button"
import { Input } from "./ui/input"
import { Slider } from "./ui/slider"
import SentenceList from "./SentenceList"
import SummaryPanel from "./SummaryPanel"
import WaveformPanel from "./WaveformPanel"
import SearchReplaceSidebar from "./SearchReplaceSidebar"
import { getOriginalTimeFromTimeline } from "../js/calculateTimeOffset"

const spkLabels = ["A", "B", "C", "D", "E", "F"]
const spkColors = ["#4caf50", "#2196f3", "#f44336", "#ff9800", "#9c27b0", "#00bcd4"]

function summaryToText(summary) {
  const segments = summary?.data?.segments || summary?.segments || []
  return segments.map((seg) => {
    const idx = seg.segment_index + 1
    const title = seg.topic || `구간 ${idx}`
    const time = seg.start_time || seg.end_time ? `\n   ${seg.start_time} — ${seg.end_time}` : ""
    const subs = (seg.subtopics || []).map((sub, si) => {
      const points = (sub.points || []).map((p) => `      · ${p}`).join("\n")
      return `   ${idx}.${si + 1} ${sub.title}${points ? "\n" + points : ""}`
    }).join("\n\n")
    return `${idx}. ${title}${time}${subs ? "\n\n" + subs : ""}`
  }).join("\n\n\n")
}

export default function CutEditTab({
  silenceSeconds,
  onSilenceChange,
  onTranscribe,
  isUpload,
  isConnected,
  isProcessing,
  sentences,
  allSilenceSelected,
  allFillerSelected,
  silenceCount = 0,
  fillerCount = 0,
  onSelectSilence,
  onSelectFiller,
  summary,
  summaryLoading,
  summaryError,
  onRetrySummary,
  focusedWord,
  currentWordId,
  currentWordSentenceIdx,
  selectedWordIds,
  searchResultsSet,
  currentSearchWordId,
  silenceThresholdMs,
  wordRefs,
  onWordClick,
  onDeleteSentence,
  setFocusedWord,
  onChangeSpk,
  onApply,
  onSummarySeek,
  audioPath,
  peaks,
  peaksDuration,
  currentTime,
  isPlayingState,
  onWordTimeChange,
  onWaveformSeek,
  spkNames = {},
  search,
}) {
  const [checkedSentences, setCheckedSentences] = useState(new Set())
  const [summaryCopied, setSummaryCopied] = useState(false)

  const allSpkList = [
    ...new Set([
      ...sentences.map((s) => s.spk || 0),
      ...Object.keys(spkNames).map(Number),
    ]),
  ].sort((a, b) => a - b)

  const handleCheckChange = useCallback((sentenceIdx, checked) => {
    setCheckedSentences((prev) => {
      const next = new Set(prev)
      if (checked) next.add(sentenceIdx)
      else next.delete(sentenceIdx)
      return next
    })
  }, [])

  const handleBulkSpkChange = useCallback((newSpk) => {
    // onChangeSpk는 개별 호출이므로 직접 sentences를 변경할 수 없음
    // 대신 checkedSentences를 순회하며 개별 호출
    checkedSentences.forEach((idx) => {
      onChangeSpk(idx, newSpk)
    })
    setCheckedSentences(new Set())
  }, [checkedSentences, onChangeSpk])

  return (
    <div className="flex flex-1 min-h-0 gap-0">
      {/* 왼쪽 사이드바 */}
      <div className="flex flex-col border-r border-border" style={{ width: 320, minWidth: 320 }}>
        {/* 무음 길이 */}
        <div className="px-4 pt-3 pb-3 border-b border-border">
          <div className="flex items-center justify-between mb-2">
            <span className="text-sm text-muted-foreground">최소 무음 길이</span>
            <Input
              type="number"
              step="0.05"
              min="0.5"
              max="5"
              value={silenceSeconds}
              onChange={(e) => onSilenceChange(e.target.value)}
              disabled={isUpload}
              className="w-[70px] h-7 text-xs text-center"
            />
          </div>
          <Slider
            value={[isNaN(parseFloat(silenceSeconds)) ? 1 : parseFloat(silenceSeconds)]}
            onValueChange={([v]) => onSilenceChange(String(v))}
            min={0.5}
            max={5}
            step={0.05}
            disabled={isUpload}
          />
          <Button
            size="sm"
            className="w-full mt-3"
            disabled={!isConnected || isUpload}
            onClick={onTranscribe}
          >
            <Mic className="h-4 w-4 mr-1.5" />
            {isUpload ? "받아쓰는 중..." : "다시 받아쓰기"}
          </Button>
        </div>

        {/* 요약 */}
        {(summary || summaryLoading || summaryError) && (
          <>
            <div className="flex items-center justify-between px-4 py-2 border-b border-border">
              <span className="text-xs text-muted-foreground">스크립트 개요</span>
              {summary && (
                <button
                  className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors"
                  onClick={() => {
                    const textarea = document.createElement("textarea")
                    textarea.value = summaryToText(summary)
                    textarea.style.position = "fixed"
                    textarea.style.opacity = "0"
                    document.body.appendChild(textarea)
                    textarea.select()
                    document.execCommand("copy")
                    document.body.removeChild(textarea)
                    setSummaryCopied(true)
                    setTimeout(() => setSummaryCopied(false), 1500)
                  }}
                >
                  {summaryCopied ? (
                    <>
                      <Check className="h-3 w-3" />
                      복사됨
                    </>
                  ) : (
                    <>
                      <Copy className="h-3 w-3" />
                      복사
                    </>
                  )}
                </button>
              )}
            </div>
            <div className="flex-1 min-h-0 overflow-y-auto px-4 py-3">
              <SummaryPanel
                summary={summary}
                loading={summaryLoading}
                error={summaryError}
                onRetry={onRetrySummary}
                onSeek={onSummarySeek}
              />
            </div>
          </>
        )}
      </div>

      {/* 오른쪽 메인 */}
      <div className="flex flex-col flex-1 min-h-0">
        {/* 세그먼트 헤더 */}
        <div className="flex items-center justify-between py-2 px-4 border-b border-border">
          <div className="flex items-center gap-2">
            {checkedSentences.size > 0 ? (
              <>
                <span className="text-xs font-medium text-primary">
                  {checkedSentences.size}개 선택 →
                </span>
                {allSpkList.map((spk) => (
                  <Button
                    key={spk}
                    variant="secondary"
                    size="sm"
                    className="h-7 text-xs px-3 gap-1.5"
                    onClick={() => handleBulkSpkChange(spk)}
                  >
                    <span className="inline-block w-2 h-2 rounded-full" style={{ background: spkColors[spk] || spkColors[0] }} />
                    {spkNames[spk] || `화자 ${spkLabels[spk] || spk + 1}`}
                  </Button>
                ))}
                <Button
                  variant="outline"
                  size="sm"
                  className="h-7 text-xs px-3 text-muted-foreground"
                  onClick={() => setCheckedSentences(new Set())}
                >
                  선택 해제
                </Button>
              </>
            ) : (
              <>
                <Button
                  variant="secondary"
                  size="sm"
                  className={`h-7 text-xs ${allSilenceSelected ? "border border-[#ffa500] text-[#ffa500]" : ""}`}
                  style={allSilenceSelected ? { border: "1px solid #ffa500", color: "#ffa500" } : {}}
                  disabled={!isConnected || isUpload || isProcessing || silenceCount === 0}
                  onClick={onSelectSilence}
                >
                  <VolumeX className={`h-3.5 w-3.5 mr-1 ${allSilenceSelected ? "text-[#ffa500]" : ""}`} />
                  {allSilenceSelected ? "무음 해제" : "무음 선택"} ({silenceCount})
                </Button>
                <Button
                  variant="secondary"
                  size="sm"
                  className={`h-7 text-xs ${allFillerSelected ? "border border-[#ffa500] text-[#ffa500]" : ""}`}
                  style={allFillerSelected ? { border: "1px solid #ffa500", color: "#ffa500" } : {}}
                  disabled={!isConnected || isUpload || isProcessing || fillerCount === 0}
                  onClick={onSelectFiller}
                >
                  <MessageCircle className={`h-3.5 w-3.5 mr-1 ${allFillerSelected ? "text-[#ffa500]" : ""}`} />
                  {allFillerSelected ? "간투사 해제" : "간투사 선택"} ({fillerCount})
                </Button>
              </>
            )}
          </div>
          <div className="flex items-center gap-1.5">
            {search && (
              <Button
                size="sm"
                variant={search.isOpen ? "default" : "ghost"}
                className="h-7 text-xs px-2"
                onClick={search.toggle}
                title="찾기 / 바꾸기"
              >
                <Search className="h-3.5 w-3.5" />
              </Button>
            )}
            <Button
              size="sm"
              className="h-7"
              variant={selectedWordIds.size > 0 ? "default" : "secondary"}
              disabled={selectedWordIds.size === 0 || !isConnected || isUpload || isProcessing}
              onClick={onApply}
            >
              <Scissors className="h-3.5 w-3.5 mr-1" />
              시퀀스 적용 {selectedWordIds.size > 0 && `(${selectedWordIds.size})`}
            </Button>
          </div>
        </div>

        {/* 문장 리스트 */}
        <div className="flex-1 min-h-0 overflow-y-auto px-4 py-3">
        <SentenceList
          sentences={sentences}
          focusedWord={focusedWord}
          currentWordId={currentWordId}
          currentWordSentenceIdx={currentWordSentenceIdx}
          selectedWordIds={selectedWordIds}
          searchResultsSet={searchResultsSet}
          currentSearchWordId={currentSearchWordId}
          searchQuery={search?.debouncedQuery || ""}
          searchCaseSensitive={search?.caseSensitive || false}
          searchWholeWord={search?.wholeWord || false}
          silenceThresholdMs={silenceThresholdMs}
          wordRefs={wordRefs}
          onWordClick={onWordClick}
          onDeleteSentence={onDeleteSentence}
          onSentencePlay={(sIdx, wIdx) =>
            setFocusedWord({ sentenceIdx: sIdx, wordIdx: wIdx })
          }
          isUpload={isUpload}
          onChangeSpk={onChangeSpk}
          spkList={[...new Set(sentences.map((s) => s.spk || 0))].sort()}
          checkedSentences={checkedSentences}
          onCheckChange={handleCheckChange}
          onSelectSameSpk={(spk) => {
            const indices = new Set()
            sentences.forEach((s, idx) => {
              if ((s.spk || 0) === spk) indices.add(idx)
            })
            setCheckedSentences(indices)
          }}
          spkNames={spkNames}
        />
        </div>

        {/* 파형 */}
        <WaveformPanel
          key={`${audioPath || "no-audio"}-${peaks ? peaks.length : 0}`}
          audioPath={audioPath}
          peaks={peaks}
          peaksDuration={peaksDuration}
          sentences={sentences}
          currentWordId={currentWordId}
          currentTime={getOriginalTimeFromTimeline(currentTime)}
          focusedWord={focusedWord}
          onWordTimeChange={onWordTimeChange}
          onSeek={onWaveformSeek}
          isPlaying={isPlayingState}
          isUpload={isUpload}
          silenceThresholdMs={silenceThresholdMs}
        />
      </div>

      {/* 검색 사이드바 */}
      {search && <SearchReplaceSidebar search={search} mode="cut" spkNames={spkNames} />}
    </div>
  )
}
