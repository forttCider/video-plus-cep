import { VolumeX, MessageCircle, Mic, Scissors } from "lucide-react"
import { Button } from "./ui/button"
import { Input } from "./ui/input"
import { Slider } from "./ui/slider"
import SentenceList from "./SentenceList"
import SummaryPanel from "./SummaryPanel"
import WaveformPanel from "./WaveformPanel"
import { getOriginalTimeFromTimeline } from "../js/calculateTimeOffset"

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
  onSelectSilence,
  onSelectFiller,
  summary,
  summaryLoading,
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
}) {
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
        {(summary || summaryLoading) && (
          <>
            <div className="px-4 py-2 border-b border-border">
              <span className="text-xs text-muted-foreground">스크립트 개요</span>
            </div>
            <div className="flex-1 min-h-0 overflow-y-auto px-4 py-3">
              <SummaryPanel summary={summary} loading={summaryLoading} onSeek={onSummarySeek} />
            </div>
          </>
        )}
      </div>

      {/* 오른쪽 메인 */}
      <div className="flex flex-col flex-1 min-h-0">
        {/* 세그먼트 헤더 */}
        <div className="flex items-center justify-between py-2 px-4 border-b border-border">
          <div className="flex items-center gap-2">
            <Button
              variant="secondary"
              size="sm"
              className={`h-7 text-xs ${allSilenceSelected ? "border border-[#ffa500] text-[#ffa500]" : ""}`}
              style={allSilenceSelected ? { border: "1px solid #ffa500", color: "#ffa500" } : {}}
              disabled={!isConnected || isUpload || isProcessing}
              onClick={onSelectSilence}
            >
              <VolumeX className={`h-3.5 w-3.5 mr-1 ${allSilenceSelected ? "text-[#ffa500]" : ""}`} />
              {allSilenceSelected ? "무음 해제" : "무음 선택"}
            </Button>
            <Button
              variant="secondary"
              size="sm"
              className={`h-7 text-xs ${allFillerSelected ? "border border-[#ffa500] text-[#ffa500]" : ""}`}
              style={allFillerSelected ? { border: "1px solid #ffa500", color: "#ffa500" } : {}}
              disabled={!isConnected || isUpload || isProcessing}
              onClick={onSelectFiller}
            >
              <MessageCircle className={`h-3.5 w-3.5 mr-1 ${allFillerSelected ? "text-[#ffa500]" : ""}`} />
              {allFillerSelected ? "간투사 해제" : "간투사 선택"}
            </Button>
          </div>
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
    </div>
  )
}
