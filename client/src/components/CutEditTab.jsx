import { useState, useCallback, useRef } from "react"
import {
  VolumeX,
  MessageCircle,
  Mic,
  Scissors,
  Copy,
  Check,
  Search,
  PanelLeftClose,
  PanelLeftOpen,
  Settings2,
} from "lucide-react"
import { Button } from "./ui/button"
import { Input } from "./ui/input"
import { Slider } from "./ui/slider"
import { ResizablePanelGroup, ResizablePanel, ResizableHandle } from "./ui/resizable"
import SentenceList from "./SentenceList"
import SummaryPanel from "./SummaryPanel"
import SummaryFinder from "./SummaryFinder"
import WaveformPanel from "./WaveformPanel"
import SearchReplaceSidebar from "./SearchReplaceSidebar"
import FillerSettingsDialog from "./FillerSettingsDialog"
import { getOriginalTimeFromTimeline } from "../js/calculateTimeOffset"
import { summaryToText } from "../js/summaryText"

const spkLabels = ["A", "B", "C", "D", "E", "F"]
const spkColors = ["#4caf50", "#2196f3", "#f44336", "#ff9800", "#9c27b0", "#00bcd4"]

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
  fillerTextOptions = [],
  fillerSpeakerOptions = [],
  wordTextOptions = [],
  disabledFillerTexts,
  disabledFillerSpeakers,
  onToggleFillerText,
  onToggleFillerSpeaker,
  onSetAllFillerTexts,
  onSetAllFillerSpeakers,
  onAddFillerWord,
  onRemoveFillerWord,
  onSaveFillerSettings,
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
  onResetWordTime,
  onWaveformSeek,
  spkNames = {},
  search,
}) {
  const [checkedSentences, setCheckedSentences] = useState(new Set())
  const [summaryCopied, setSummaryCopied] = useState(false)
  const [fillerSettingsOpen, setFillerSettingsOpen] = useState(false)
  // 사이드바(리사이즈·접기) 제어
  const sidebarRef = useRef(null)
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false)
  const toggleSidebar = useCallback(() => {
    const panel = sidebarRef.current
    if (!panel) return
    if (panel.isCollapsed()) panel.expand()
    else panel.collapse()
  }, [])
  // 드래그 중에는 파형 너비를 현재 값으로 고정 → WaveSurfer 재드로우를 멈춰(얼림) 버벅임 방지.
  // 놓으면 고정 해제 → 새 너비로 한 번만 다시 그림.
  const waveWrapRef = useRef(null)
  const [frozenWaveWidth, setFrozenWaveWidth] = useState(null)
  const handleDragging = useCallback((dragging) => {
    if (dragging) {
      const w = waveWrapRef.current?.offsetWidth
      setFrozenWaveWidth(w || null)
    } else {
      setFrozenWaveWidth(null)
    }
  }, [])
  // 요약 검색 상태
  const [finderOpen, setFinderOpen] = useState(false)
  const [finderQuery, setFinderQuery] = useState("")
  const [finderCaseSensitive, setFinderCaseSensitive] = useState(false)
  const [finderMatchCount, setFinderMatchCount] = useState(0)
  const [finderCurrentIdx, setFinderCurrentIdx] = useState(-1)
  const [finderFocusReq, setFinderFocusReq] = useState(0)
  const handleFinderToggle = useCallback(() => {
    setFinderOpen((v) => {
      if (v) return false
      setFinderFocusReq((n) => n + 1)
      return true
    })
  }, [])
  const handleFinderClose = useCallback(() => setFinderOpen(false), [])
  const handleFinderNext = useCallback(() => {
    setFinderCurrentIdx((i) => {
      if (finderMatchCount === 0) return -1
      return i < 0 ? 0 : (i + 1) % finderMatchCount
    })
  }, [finderMatchCount])
  const handleFinderPrev = useCallback(() => {
    setFinderCurrentIdx((i) => {
      if (finderMatchCount === 0) return -1
      return i < 0
        ? finderMatchCount - 1
        : (i - 1 + finderMatchCount) % finderMatchCount
    })
  }, [finderMatchCount])
  const handleMatchCountChange = useCallback((n) => {
    setFinderMatchCount(n)
    if (n === 0) setFinderCurrentIdx(-1)
    else
      setFinderCurrentIdx((i) => {
        if (i < 0) return 0 // 첫 매치로 자동 점프
        if (i >= n) return 0
        return i
      })
  }, [])

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
    <div className="flex flex-col flex-1 min-h-0">
      {/* 상단 헤더: 최소 무음 길이 + 무음/간투사(또는 벌크 화자변경) + 시퀀스 적용 */}
      <div className="flex items-center justify-between py-2 px-3 border-b border-border gap-2">
        <div className="flex items-center gap-2 min-w-0">
          {/* 사이드바 접기/펼치기 */}
          <Button
            size="icon"
            variant="ghost"
            className="h-7 w-7 shrink-0"
            onClick={toggleSidebar}
            title={sidebarCollapsed ? "패널 펼치기" : "패널 접기"}
          >
            {sidebarCollapsed ? (
              <PanelLeftOpen className="h-4 w-4" />
            ) : (
              <PanelLeftClose className="h-4 w-4" />
            )}
          </Button>

          {/* 최소 무음 길이 */}
          <span className="text-xs text-muted-foreground shrink-0">최소 무음</span>
          <div className="w-[80px] shrink-0">
            <Slider
              value={[isNaN(parseFloat(silenceSeconds)) ? 1 : parseFloat(silenceSeconds)]}
              onValueChange={([v]) => onSilenceChange(String(v))}
              min={0.1}
              max={5}
              step={0.05}
              disabled={isUpload}
            />
          </div>
          <Input
            type="number"
            step="0.05"
            min="0.1"
            max="5"
            value={silenceSeconds}
            onChange={(e) => onSilenceChange(e.target.value)}
            disabled={isUpload}
            className="w-[64px] h-7 text-xs text-center px-1 shrink-0"
          />

          <div className="w-px h-5 bg-border mx-1 shrink-0" />

          {/* 무음/간투사 또는 벌크 화자 변경 */}
          {checkedSentences.size > 0 ? (
            <>
              <span className="text-xs font-medium text-primary shrink-0">
                {checkedSentences.size}개 선택 →
              </span>
              {allSpkList.map((spk) => (
                <Button
                  key={spk}
                  variant="secondary"
                  size="sm"
                  className="h-7 text-xs px-3 gap-1.5 shrink-0"
                  onClick={() => handleBulkSpkChange(spk)}
                >
                  <span className="inline-block w-2 h-2 rounded-full" style={{ background: spkColors[spk] || spkColors[0] }} />
                  {spkNames[spk] || `화자 ${spkLabels[spk] || spk + 1}`}
                </Button>
              ))}
              <Button
                variant="outline"
                size="sm"
                className="h-7 text-xs px-3 text-muted-foreground shrink-0"
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
                className={`h-7 text-xs shrink-0 hover:bg-neutral-700 ${allSilenceSelected ? "border border-[#ffa500] text-[#ffa500]" : ""}`}
                style={allSilenceSelected ? { border: "1px solid #ffa500", color: "#ffa500" } : {}}
                disabled={!isConnected || isUpload || isProcessing || silenceCount === 0}
                onClick={onSelectSilence}
              >
                <VolumeX className={`h-3.5 w-3.5 mr-1 ${allSilenceSelected ? "text-[#ffa500]" : ""}`} />
                {allSilenceSelected ? "무음 해제" : "무음 선택"} ({silenceCount})
              </Button>
              {/* 껍데기(pill): 호버 배경 없음 → 본체/기어가 각각 독립적으로 하이라이트 */}
              <div
                className={`inline-flex items-center h-7 shrink-0 rounded-md overflow-hidden bg-secondary text-secondary-foreground text-xs font-medium shadow-sm ${allFillerSelected ? "text-[#ffa500]" : ""}`}
                style={allFillerSelected ? { border: "1px solid #ffa500", color: "#ffa500" } : {}}
              >
                <button
                  type="button"
                  disabled={!isConnected || isUpload || isProcessing}
                  onClick={onSelectFiller}
                  className="inline-flex items-center h-full pl-3 pr-2 hover:bg-neutral-700 transition-colors disabled:opacity-50 disabled:pointer-events-none"
                >
                  <MessageCircle className={`h-3.5 w-3.5 mr-1 ${allFillerSelected ? "text-[#ffa500]" : ""}`} />
                  {allFillerSelected ? "간투사 해제" : "간투사 선택"} ({fillerCount})
                </button>
                <button
                  type="button"
                  title="간투사 일괄 선택 설정"
                  disabled={!isConnected || isUpload || isProcessing}
                  onClick={() => setFillerSettingsOpen(true)}
                  className="inline-flex items-center h-full px-2 border-l border-current/30 hover:bg-neutral-700 transition-colors disabled:opacity-50 disabled:pointer-events-none"
                >
                  <Settings2 className="h-3.5 w-3.5" />
                </button>
              </div>
            </>
          )}
        </div>

        <div className="flex items-center gap-1.5 shrink-0">
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

      {/* 본문: 리사이즈 패널 (사이드바 | 메인) + 검색 사이드바 */}
      <div className="flex flex-1 min-h-0">
        <ResizablePanelGroup direction="horizontal" className="flex-1 min-h-0">
          <ResizablePanel
            id="cut-sidebar"
            order={1}
            ref={sidebarRef}
            collapsible
            collapsedSize={0}
            minSize={14}
            defaultSize={24}
            onCollapse={() => setSidebarCollapsed(true)}
            onExpand={() => setSidebarCollapsed(false)}
            className="flex flex-col border-r border-border min-w-0 overflow-hidden"
          >
            {/* 다시 받아쓰기 */}
            <div className="px-3 py-3 border-b border-border">
              <Button
                size="sm"
                className="w-full"
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
                <div className="flex items-center gap-1">
                  <Button
                    size="icon"
                    variant="ghost"
                    className="h-6 w-6"
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
                    title={summaryCopied ? "복사됨" : "복사"}
                  >
                    {summaryCopied ? (
                      <Check className="h-3.5 w-3.5" />
                    ) : (
                      <Copy className="h-3.5 w-3.5" />
                    )}
                  </Button>
                  <Button
                    size="icon"
                    variant={finderOpen ? "default" : "ghost"}
                    className="h-6 w-6"
                    onClick={handleFinderToggle}
                    title="찾기"
                  >
                    <Search className="h-3.5 w-3.5" />
                  </Button>
                </div>
              )}
            </div>
            <SummaryFinder
              isOpen={finderOpen}
              onClose={handleFinderClose}
              query={finderQuery}
              setQuery={setFinderQuery}
              caseSensitive={finderCaseSensitive}
              setCaseSensitive={setFinderCaseSensitive}
              currentIdx={finderCurrentIdx}
              matchCount={finderMatchCount}
              onNext={handleFinderNext}
              onPrev={handleFinderPrev}
              focusRequest={finderFocusReq}
            />
            <div
              className="flex-1 min-h-0 px-4 py-3"
              style={{ overflowY: "overlay" }}
            >
              <SummaryPanel
                summary={summary}
                loading={summaryLoading}
                error={summaryError}
                onRetry={onRetrySummary}
                onSeek={onSummarySeek}
                searchQuery={finderOpen ? finderQuery.trim() : ""}
                searchCaseSensitive={finderCaseSensitive}
                currentMatchIdx={finderOpen ? finderCurrentIdx : -1}
                onMatchCountChange={handleMatchCountChange}
              />
            </div>
          </>
        )}
          </ResizablePanel>

          <ResizableHandle withHandle onDragging={handleDragging} />

          <ResizablePanel id="cut-main" order={2} defaultSize={76} minSize={30} className="flex flex-col min-w-0">

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

        {/* 파형 — 드래그 중에는 너비를 고정해 재드로우를 멈춤(얼림), 놓으면 새 너비로 재계산 */}
        <div
          ref={waveWrapRef}
          className="w-full"
          style={
            frozenWaveWidth
              ? { width: frozenWaveWidth, overflow: "hidden", flexShrink: 0 }
              : undefined
          }
        >
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
          onResetWordTime={onResetWordTime}
          onSeek={onWaveformSeek}
          isPlaying={isPlayingState}
          isUpload={isUpload}
          silenceThresholdMs={silenceThresholdMs}
        />
        </div>
          </ResizablePanel>
        </ResizablePanelGroup>

        {/* 검색 사이드바 */}
        {search && <SearchReplaceSidebar search={search} mode="cut" spkNames={spkNames} />}
      </div>

      <FillerSettingsDialog
        open={fillerSettingsOpen}
        onClose={() => setFillerSettingsOpen(false)}
        fillerCount={fillerCount}
        fillerTextOptions={fillerTextOptions}
        fillerSpeakerOptions={fillerSpeakerOptions}
        wordTextOptions={wordTextOptions}
        disabledFillerTexts={disabledFillerTexts}
        disabledFillerSpeakers={disabledFillerSpeakers}
        onToggleText={onToggleFillerText}
        onToggleSpeaker={onToggleFillerSpeaker}
        onSetAllTexts={onSetAllFillerTexts}
        onSetAllSpeakers={onSetAllFillerSpeakers}
        onAddFillerWord={onAddFillerWord}
        onRemoveText={onRemoveFillerWord}
        onSave={onSaveFillerSettings}
        spkNames={spkNames}
      />
    </div>
  )
}
