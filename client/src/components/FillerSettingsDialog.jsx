import { Button } from "./ui/button"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "./ui/dialog"

const spkLabels = ["A", "B", "C", "D", "E", "F"]
const spkColors = ["#4caf50", "#2196f3", "#f44336", "#ff9800", "#9c27b0", "#00bcd4"]

function CheckRow({ checked, onToggle, disabled, children }) {
  return (
    <label
      className={`flex items-center gap-2 px-2 py-1.5 rounded text-sm ${
        disabled
          ? "opacity-40 cursor-not-allowed"
          : "cursor-pointer hover:bg-muted/40"
      }`}
    >
      <input
        type="checkbox"
        checked={checked}
        onChange={onToggle}
        disabled={disabled}
        className="accent-primary shrink-0"
      />
      {children}
    </label>
  )
}

function SectionHeader({ title, allChecked, onToggleAll, disabled }) {
  return (
    <div className="flex items-center justify-between mb-1">
      <span className="text-xs font-medium text-muted-foreground">{title}</span>
      <Button
        variant="ghost"
        size="sm"
        className="h-6 text-xs px-2"
        disabled={disabled}
        onClick={() => onToggleAll(!allChecked)}
      >
        {allChecked ? "전체 해제" : "전체 선택"}
      </Button>
    </div>
  )
}

export default function FillerSettingsDialog({
  open,
  onClose,
  fillerCount = 0,
  fillerTextOptions = [],
  fillerSpeakerOptions = [],
  disabledFillerTexts,
  disabledFillerSpeakers,
  onToggleText,
  onToggleSpeaker,
  onSetAllTexts,
  onSetAllSpeakers,
  spkNames = {},
}) {
  // 선택 불가 항목(삭제됨·상대 필터로 0)은 전체 선택/해제 판정에서 제외
  const activeTexts = fillerTextOptions.filter((o) => !o.deleted && !o.unavailable)
  const activeSpeakers = fillerSpeakerOptions.filter(
    (o) => !o.deleted && !o.unavailable,
  )
  const allTextsChecked =
    activeTexts.length > 0 &&
    activeTexts.every((o) => !disabledFillerTexts.has(o.text))
  const showSpeakers = fillerSpeakerOptions.length >= 2
  const allSpeakersChecked =
    activeSpeakers.length > 0 &&
    activeSpeakers.every((o) => !disabledFillerSpeakers.has(o.spk))

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) onClose() }}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>간투사 일괄 선택 설정</DialogTitle>
        </DialogHeader>

        <div className="flex items-baseline gap-1.5 -mt-1">
          <span className="text-xs text-muted-foreground">선택될 간투사</span>
          <span className="text-sm font-semibold text-[#ffa500] tabular-nums">
            {fillerCount}
          </span>
          <span className="text-xs text-muted-foreground">개</span>
        </div>

        <div className="flex flex-col gap-4">
          {/* 간투사 텍스트 */}
          <div>
            <SectionHeader
              title="선택할 간투사"
              allChecked={allTextsChecked}
              onToggleAll={onSetAllTexts}
              disabled={fillerTextOptions.length === 0}
            />
            {fillerTextOptions.length === 0 ? (
              <p className="text-xs text-muted-foreground px-2 py-3">
                간투사가 없습니다.
              </p>
            ) : (
              <div className="max-h-60 overflow-y-auto border border-border rounded">
                {fillerTextOptions.map(({ text, count, deleted, unavailable }) => (
                  <CheckRow
                    key={text}
                    checked={!deleted && !unavailable && !disabledFillerTexts.has(text)}
                    onToggle={() => onToggleText(text)}
                    disabled={deleted || unavailable}
                  >
                    <span className="flex-1 truncate">{text}</span>
                    <span className="text-xs text-muted-foreground shrink-0">
                      {deleted ? "삭제됨" : count}
                    </span>
                  </CheckRow>
                ))}
              </div>
            )}
          </div>

          {/* 화자 (2명 이상일 때만) */}
          {showSpeakers && (
            <div>
              <SectionHeader
                title="선택할 화자"
                allChecked={allSpeakersChecked}
                onToggleAll={onSetAllSpeakers}
              />
              <div className="border border-border rounded">
                {fillerSpeakerOptions.map(({ spk, count, deleted, unavailable }) => (
                  <CheckRow
                    key={spk}
                    checked={!deleted && !unavailable && !disabledFillerSpeakers.has(spk)}
                    onToggle={() => onToggleSpeaker(spk)}
                    disabled={deleted || unavailable}
                  >
                    <span
                      className="inline-block w-2 h-2 rounded-full shrink-0"
                      style={{ background: spkColors[spk] || spkColors[0] }}
                    />
                    <span className="flex-1 truncate">
                      {spkNames[spk] || `화자 ${spkLabels[spk] || spk + 1}`}
                    </span>
                    <span className="text-xs text-muted-foreground shrink-0">
                      {deleted ? "삭제됨" : count}
                    </span>
                  </CheckRow>
                ))}
              </div>
            </div>
          )}
        </div>

        <DialogFooter>
          <Button onClick={onClose}>저장</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
