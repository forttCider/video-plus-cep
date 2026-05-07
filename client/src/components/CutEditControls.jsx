import React, { useState } from "react"
import { Mic, AudioLines, VolumeX, MessageCircle, Loader2, ChevronDown } from "lucide-react"
import { Button } from "./ui/button"
import { Input } from "./ui/input"
import { Slider } from "./ui/slider"
import SavedStateBanner from "./SavedStateBanner"
import UploadProgress from "./UploadProgress"

export default function CutEditControls({
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
  numSpeakers,
  onNumSpeakersChange,
  availableAudioTracks = [],
  selectedTrackIndices,
  onToggleTrack,
  hasSavedState,
  isRestoring,
  onLoadSavedState,
  uploadFile,
  onClickCancel,
}) {
  const hasNoSelectedTracks =
    availableAudioTracks.length > 0 &&
    (!selectedTrackIndices || selectedTrackIndices.size === 0)

  // 사용자가 받아쓰기 버튼 누르려 했지만 선택 안 한 경우만 경고 표시
  const [attemptedWithNoSelection, setAttemptedWithNoSelection] = useState(false)
  const showSelectionWarning = hasNoSelectedTracks && attemptedWithNoSelection
  const handleTranscribeClick = () => {
    if (hasNoSelectedTracks) {
      setAttemptedWithNoSelection(true)
      return
    }
    setAttemptedWithNoSelection(false)
    onTranscribe?.()
  }
  // 트랙이 선택되면 경고 자동 해제
  React.useEffect(() => {
    if (!hasNoSelectedTracks) setAttemptedWithNoSelection(false)
  }, [hasNoSelectedTracks])
  // 받아쓰기 전: 중앙 정렬 초기 화면
  if (sentences.length === 0) {
    return (
      <div className="flex flex-col flex-1 relative">
        {/* 불러오기 배너 + 업로드 진행 - 상단 고정 */}
        <div className="absolute top-4 left-4 right-4 z-50">
          <SavedStateBanner
            hasSavedState={hasSavedState}
            isUpload={isUpload}
            isRestoring={isRestoring}
            onLoad={onLoadSavedState}
          />
          <UploadProgress
            isUpload={isUpload}
            uploadFile={uploadFile}
            onCancel={onClickCancel}
          />
        </div>
        <div className="flex flex-col items-center justify-center flex-1 px-6 text-center gap-4">
        {/* Icon */}
        <div className="flex items-center justify-center w-16 h-16 rounded-full bg-muted mb-2">
          {isUpload ? (
            <AudioLines className="h-7 w-7 text-muted-foreground" />
          ) : (
            <Mic className="h-7 w-7 text-muted-foreground" />
          )}
        </div>

        {/* Title & subtitle */}
        <div className="space-y-1.5">
          <h2 className="text-lg font-bold">
            {isUpload ? "받아쓰기 진행 중..." : "받아쓰기를 시작하세요"}
          </h2>
          <p className="text-sm text-muted-foreground leading-relaxed">
            {isUpload ? (
              "오디오를 분석하고 있습니다. 잠시만 기다려주세요."
            ) : (
              <>
                타임라인의 오디오를 자동으로 텍스트로 변환합니다
                <br />
                화자 수를 선택하고 시작하세요
              </>
            )}
          </p>
        </div>

        {/* Audio track select card */}
        {availableAudioTracks.length > 0 && (
          <div className={`w-full max-w-sm border border-border rounded-lg overflow-hidden ${isUpload ? "opacity-60" : ""}`}>
            <div className="flex items-center gap-2 px-4 py-2 bg-muted/30 border-b border-border text-left">
              <span className="text-xs text-muted-foreground">
                {isUpload ? "받아쓰는 오디오" : "받아쓸 오디오 선택"}
              </span>
              {!isUpload && showSelectionWarning && (
                <span className="text-xs text-destructive ml-auto">
                  오디오를 선택해주세요
                </span>
              )}
            </div>
            <div className="flex flex-col">
              {availableAudioTracks.map((track) => {
                const checked = selectedTrackIndices?.has(track.trackIndex) || false
                return (
                  <label
                    key={track.trackIndex}
                    className={`flex items-center gap-2 px-4 py-2 text-left text-sm ${isUpload ? "cursor-not-allowed" : "cursor-pointer hover:bg-muted/20"}`}
                  >
                    <input
                      type="checkbox"
                      checked={checked}
                      onChange={() => !isUpload && onToggleTrack?.(track.trackIndex)}
                      disabled={isUpload}
                      className="accent-primary"
                    />
                    <span className="flex-1">
                      {track.name || `오디오 ${track.trackIndex + 1}`}
                    </span>
                    <span className="text-xs text-muted-foreground">
                      {track.clipCount}개
                    </span>
                  </label>
                )
              })}
            </div>
          </div>
        )}

        {/* Speaker select card */}
        <div className={`w-full max-w-sm border border-border rounded-lg flex items-stretch overflow-hidden ${isUpload ? "opacity-50 pointer-events-none" : ""}`}>
          <span className="text-sm text-muted-foreground px-4 flex items-center bg-muted/30 border-r border-border whitespace-nowrap">
            화자 수
          </span>
          <div className="flex-1 relative">
            <select
              className="w-full bg-transparent text-sm px-4 py-3 pr-8 outline-none cursor-pointer text-foreground appearance-none"
              value={numSpeakers}
              onChange={(e) => onNumSpeakersChange(parseInt(e.target.value, 10))}
              disabled={isUpload}
            >
              {[1, 2, 3, 4, 5, 6].map((n) => (
                <option key={n} value={n} style={{ background: "#1e1e1e", color: "#fff" }}>
                  {n}명
                </option>
              ))}
            </select>
            <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none" />
          </div>
        </div>

        {/* Start button */}
        <Button
          className={`w-full max-w-sm h-10 ${hasNoSelectedTracks ? "opacity-50 cursor-not-allowed" : ""}`}
          disabled={!isConnected || isUpload}
          onClick={handleTranscribeClick}
        >
          {isUpload ? (
            <>
              <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              받아쓰는 중...
            </>
          ) : (
            <>
              <Mic className="h-4 w-4 mr-2" />
              받아쓰기 시작
            </>
          )}
        </Button>

        {/* Footer hint */}
        <p className="text-[11px] text-muted-foreground">
          1시간 짜리 영상 &middot; 평균 4~5분 소요
        </p>
        </div>
      </div>
    )
  }

  // 받아쓰기 후: 무음 슬라이더 + 다시 받아쓰기 + 무음/간투사 버튼
  return (
    <div className="flex flex-wrap gap-2 mb-3 items-center">
      <div className="flex items-center gap-2 w-full mb-1">
        <span className="text-xs text-muted-foreground whitespace-nowrap">
          최소 무음 길이
        </span>
        <Slider
          value={[
            isNaN(parseFloat(silenceSeconds))
              ? 1
              : parseFloat(silenceSeconds),
          ]}
          onValueChange={([v]) => onSilenceChange(String(v))}
          min={0.5}
          max={5}
          step={0.05}
          disabled={isUpload}
          className="flex-1"
        />
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
        <span className="text-xs text-muted-foreground">seconds</span>
      </div>
      <Button
        size="sm"
        disabled={!isConnected || isUpload}
        onClick={onTranscribe}
      >
        <Mic className="h-4 w-4 mr-1.5" />
        {isUpload ? "받아쓰는 중..." : "다시 받아쓰기"}
      </Button>
      <Button
        variant="secondary"
        size="sm"
        className={
          allSilenceSelected ? "border border-[#ffa500] text-[#ffa500]" : ""
        }
        style={
          allSilenceSelected
            ? { border: "1px solid #ffa500", color: "#ffa500" }
            : {}
        }
        disabled={
          !isConnected || isUpload || isProcessing || sentences.length === 0
        }
        onClick={onSelectSilence}
      >
        <VolumeX
          className={`h-4 w-4 mr-1.5 ${allSilenceSelected ? "text-[#ffa500]" : ""}`}
        />
        {allSilenceSelected ? "무음 선택해제" : "무음 선택"}
      </Button>
      <Button
        variant="secondary"
        size="sm"
        className={
          allFillerSelected ? "border border-[#ffa500] text-[#ffa500]" : ""
        }
        style={
          allFillerSelected
            ? { border: "1px solid #ffa500", color: "#ffa500" }
            : {}
        }
        disabled={
          !isConnected || isUpload || isProcessing || sentences.length === 0
        }
        onClick={onSelectFiller}
      >
        <MessageCircle
          className={`h-4 w-4 mr-1.5 ${allFillerSelected ? "text-[#ffa500]" : ""}`}
        />
        {allFillerSelected ? "간투사 선택해제" : "간투사 선택"}
      </Button>
    </div>
  )
}
