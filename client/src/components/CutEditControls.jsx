import React from "react"
import { Mic, VolumeX, MessageCircle } from "lucide-react"
import { Button } from "./ui/button"
import { Input } from "./ui/input"
import { Slider } from "./ui/slider"

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
}) {
  return (
    <div className="flex flex-wrap gap-2 mb-3 items-center">
      {sentences.length > 0 && (
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
      )}
      <Button
        size="sm"
        disabled={!isConnected || isUpload}
        onClick={onTranscribe}
      >
        <Mic className="h-4 w-4 mr-1.5" />
        {isUpload
          ? "받아쓰는 중..."
          : sentences.length > 0
            ? "다시 받아쓰기"
            : "받아쓰기"}
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
