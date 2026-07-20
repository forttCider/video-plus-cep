import { useState } from "react"
import { Plus, X } from "lucide-react"
import { Button } from "./ui/button"
import { Input } from "./ui/input"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "./ui/dialog"

const spkLabels = ["A", "B", "C", "D", "E", "F"]
const spkColors = ["#4caf50", "#2196f3", "#f44336", "#ff9800", "#9c27b0", "#00bcd4"]

// 간투사로 추가할 단어 입력 + 자동완성 드롭다운 (오타 방지)
function WordAdder({ wordTextOptions, onAdd }) {
  const [query, setQuery] = useState("")
  const [focused, setFocused] = useState(false)
  const q = query.trim()
  const matches = q
    ? wordTextOptions.filter((o) => o.text.includes(q)).slice(0, 8)
    : []
  // 실제 추가는 텍스트가 정확히 같은 단어에만 적용 → 정확히 일치할 때만 추가 버튼 활성화
  const canAdd = !!q && wordTextOptions.some((o) => o.text === q)
  // 추가 버튼/Enter로만 실제 추가 (드롭다운 선택은 입력창 채우기만)
  const submit = () => {
    if (!canAdd) return
    onAdd?.(q)
    setQuery("")
    setFocused(false)
  }
  // 드롭다운 항목 선택 → 입력창만 채우고 닫음 (추가는 하지 않음)
  const pick = (text) => {
    setQuery(text)
    setFocused(false)
  }
  return (
    <div>
      <span className="text-xs font-medium text-muted-foreground mb-1 block">
        간투사로 추가할 단어
      </span>
      <div className="relative">
        <div className="flex gap-1.5">
          <Input
            value={query}
            onChange={(e) => {
              setQuery(e.target.value)
              setFocused(true)
            }}
            onFocus={() => setFocused(true)}
            onBlur={() => setTimeout(() => setFocused(false), 150)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault()
                submit()
              }
            }}
            placeholder="단어 입력 (예: 근데)"
            className="h-8 text-sm flex-1"
          />
          <Button
            size="sm"
            className="h-8 shrink-0"
            disabled={!canAdd}
            onClick={submit}
            title={
              !q
                ? "단어를 입력하세요"
                : canAdd
                  ? "간투사로 추가"
                  : "일치하는 단어가 없습니다"
            }
          >
            <Plus className="h-3.5 w-3.5 mr-0.5" />
            추가
          </Button>
        </div>
        {focused && q && (
          <div className="absolute z-50 left-0 right-0 mt-1 max-h-48 overflow-y-auto border border-border rounded bg-popover shadow-md">
            {matches.length === 0 ? (
              <div className="px-2 py-2 text-xs text-muted-foreground">
                일치하는 단어가 없습니다
              </div>
            ) : (
              matches.map((o) => (
                <button
                  key={o.text}
                  type="button"
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => pick(o.text)}
                  className="flex items-center justify-between w-full px-2 py-1.5 text-sm text-left hover:bg-muted/50"
                >
                  <span className="truncate">{o.text}</span>
                  <span className="text-xs text-muted-foreground shrink-0 ml-2">
                    {o.count}
                  </span>
                </button>
              ))
            )}
          </div>
        )}
      </div>
      <p className="text-[11px] text-muted-foreground/70 mt-1">
        목록에서 선택 후 <b>추가</b> 버튼을 눌러야 지정됩니다. 같은 단어 전체가 간투사가 됩니다.
      </p>
    </div>
  )
}

// 태그(칩) — 본체는 선택 토글, × 는 간투사 지정 해제(별도 클릭 영역)
function Tag({ checked, disabled, onToggle, onRemove, title, children }) {
  return (
    <span
      className={`inline-flex items-center h-6 rounded-full border text-xs overflow-hidden transition-colors ${
        disabled
          ? "opacity-40 border-border text-muted-foreground"
          : checked
            ? "border-[#ffa500] text-[#ffa500] bg-[#ffa500]/10"
            : "border-border text-muted-foreground"
      }`}
    >
      <button
        type="button"
        onClick={onToggle}
        disabled={disabled}
        title={title}
        className={`inline-flex items-center gap-1 h-full pl-2 ${onRemove ? "pr-1" : "pr-2"} ${
          disabled ? "cursor-not-allowed" : "hover:bg-neutral-700"
        }`}
      >
        {children}
      </button>
      {onRemove && (
        <button
          type="button"
          onClick={onRemove}
          title="간투사 지정 해제 (일반 단어로)"
          className="inline-flex items-center h-full pl-0.5 pr-1.5 hover:bg-neutral-700 hover:text-red-400"
        >
          <X className="h-3 w-3" />
        </button>
      )}
    </span>
  )
}

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
    <div className="flex items-center justify-between mb-2.5">
      <span className="text-xs font-medium text-muted-foreground">{title}</span>
      <Button
        variant="outline"
        size="sm"
        className="h-6 text-xs px-2 text-muted-foreground hover:bg-neutral-700"
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
  wordTextOptions = [],
  disabledFillerTexts,
  disabledFillerSpeakers,
  onToggleText,
  onToggleSpeaker,
  onSetAllTexts,
  onSetAllSpeakers,
  onAddFillerWord,
  onRemoveText,
  onSave,
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
          {/* 간투사로 추가할 단어 */}
          <WordAdder wordTextOptions={wordTextOptions} onAdd={onAddFillerWord} />

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
              <div className="flex flex-wrap gap-1.5 max-h-[40vh] overflow-y-auto">
                {fillerTextOptions.map(({ text, count, deleted, unavailable }) => (
                  <Tag
                    key={text}
                    checked={!deleted && !unavailable && !disabledFillerTexts.has(text)}
                    onToggle={() => onToggleText(text)}
                    disabled={deleted || unavailable}
                    // 이미 전부 삭제된 단어는 되돌릴 대상이 없으므로 × 숨김
                    onRemove={deleted ? undefined : () => onRemoveText?.(text)}
                    title={
                      deleted
                        ? "컷 적용으로 모두 삭제됨"
                        : unavailable
                          ? "선택한 화자에 없음"
                          : `${text} · ${count}개`
                    }
                  >
                    <span className="truncate max-w-[110px]">{text}</span>
                    <span className="opacity-60 tabular-nums">
                      {deleted ? "삭제됨" : count}
                    </span>
                  </Tag>
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
          <Button
            onClick={() => {
              onSave?.()
              onClose()
            }}
          >
            저장
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
