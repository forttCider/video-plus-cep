import { useState, useEffect } from "react"
import { Folder, Check } from "lucide-react"
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

function getSpkName(spk, spkNames) {
  return spkNames?.[spk] || spkLabels[spk] || String.fromCharCode(65 + (spk || 0))
}

function getDefaultDir() {
  try {
    const os = window.require("os")
    const path = window.require("path")
    return path.join(os.homedir(), "Desktop")
  } catch {
    return ""
  }
}

function subsToText(subsSentences, { includeTime, includeSpeaker, spkNames }) {
  return subsSentences
    .filter((s) => !s.is_deleted)
    .map((s) => {
      // s.msg 캐시는 인라인 편집/K 삭제 후 stale일 수 있어 매번 재계산
      const msg = (s.words || [])
        .filter((w) => !w.is_deleted && w.text)
        .map((w) => w.text)
        .join(" ")
      // 모든 단어가 K 삭제된 문장은 화자/시간만 남게 되니 줄 전체 건너뜀
      if (!msg.trim()) return null
      const parts = []
      if (includeSpeaker) parts.push(getSpkName(s.spk, spkNames))
      if (includeTime) parts.push(`[${s.start_time || ""}]`)
      parts.push(msg)
      return parts.join(" ")
    })
    .filter((line) => line !== null)
    .join("\n")
}

function summaryToText(summary) {
  const segments = summary?.data?.segments || summary?.segments || []
  return segments
    .map((seg) => {
      const idx = seg.segment_index + 1
      const title = seg.topic || `구간 ${idx}`
      const time =
        seg.start_time || seg.end_time
          ? `\n   ${seg.start_time} — ${seg.end_time}`
          : ""
      const subs = (seg.subtopics || [])
        .map((sub, si) => {
          const points = (sub.points || [])
            .map((p) => `      · ${p}`)
            .join("\n")
          return `   ${idx}.${si + 1} ${sub.title}${points ? "\n" + points : ""}`
        })
        .join("\n\n")
      return `${idx}. ${title}${time}${subs ? "\n\n" + subs : ""}`
    })
    .join("\n\n\n")
}

function msToSRTTime(ms) {
  const total = Math.max(0, Math.floor(ms))
  const h = Math.floor(total / 3600000)
  const m = Math.floor((total % 3600000) / 60000)
  const s = Math.floor((total % 60000) / 1000)
  const msec = total % 1000
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")},${String(msec).padStart(3, "0")}`
}

function sentenceToSRTBlock(idx, sentence) {
  const words = (sentence.words || []).filter((w) => !w.is_deleted && w.text)
  if (words.length === 0) return null
  const start = words[0].start_at
  const end = words[words.length - 1].end_at || start
  // sentence.msg 캐시는 stale일 수 있어 현재 단어들에서 재계산
  const msg = words.map((w) => w.text).join(" ")
  return `${idx}\n${msToSRTTime(start)} --> ${msToSRTTime(end)}\n${msg}\n`
}

function subsToCombinedSRT(subsSentences) {
  let idx = 1
  const lines = []
  for (const s of subsSentences) {
    if (s.is_deleted) continue
    const block = sentenceToSRTBlock(idx, s)
    if (block) {
      lines.push(block)
      idx += 1
    }
  }
  return lines.join("\n")
}

function subsToSpeakerSRTs(subsSentences, spkNames) {
  // spk별로 그룹핑
  const bySpk = new Map()
  for (const s of subsSentences) {
    if (s.is_deleted) continue
    const spk = s.spk || 0
    if (!bySpk.has(spk)) bySpk.set(spk, [])
    bySpk.get(spk).push(s)
  }

  const result = []
  for (const [spk, sentences] of bySpk) {
    let idx = 1
    const lines = []
    for (const s of sentences) {
      const block = sentenceToSRTBlock(idx, s)
      if (block) {
        lines.push(block)
        idx += 1
      }
    }
    if (lines.length > 0) {
      result.push({
        spk,
        name: getSpkName(spk, spkNames),
        content: lines.join("\n"),
      })
    }
  }
  return result
}

function sanitizeFilename(name) {
  return String(name).replace(/[\\/:*?"<>|]/g, "_").trim() || "unknown"
}

export default function DownloadDialog({
  open,
  onClose,
  subsSentences,
  summary,
  spkNames,
  addLog,
}) {
  const [fileTypes, setFileTypes] = useState({
    subs: true,
    summary: false,
    srt: false,
  })
  const [subsOptions, setSubsOptions] = useState({
    includeTime: true,
    includeSpeaker: true,
  })
  const [srtMode, setSrtMode] = useState("perSpeaker") // perSpeaker | combined
  const [filePath, setFilePath] = useState("")
  const [saved, setSaved] = useState(false)
  const [warning, setWarning] = useState("")

  const toggleType = (key) =>
    setFileTypes((prev) => ({ ...prev, [key]: !prev[key] }))
  const toggleSubsOption = (key) =>
    setSubsOptions((prev) => ({ ...prev, [key]: !prev[key] }))

  useEffect(() => {
    if (open && !filePath) setFilePath(getDefaultDir())
    if (open) {
      setSaved(false)
      setWarning("")
    }
  }, [open, filePath])

  const summaryAvailable = !!(
    summary?.data?.segments?.length || summary?.segments?.length
  )

  const handleBrowse = () => {
    try {
      const cepFs = window.cep?.fs
      if (cepFs?.showOpenDialogEx) {
        const result = cepFs.showOpenDialogEx(
          false,
          true,
          "저장할 폴더 선택",
          filePath || getDefaultDir(),
        )
        const picked = result?.data?.[0]
        if (picked) setFilePath(picked)
      }
    } catch (e) {
      // 폴더 선택 실패 무시
    }
  }

  const handleDownload = () => {
    try {
      const fs = window.require("fs")
      const path = window.require("path")
      const ts = Date.now()
      const dir = filePath || getDefaultDir()
      const savedPaths = []

      const targets = []
      if (fileTypes.subs) {
        targets.push({
          content: subsToText(subsSentences, {
            includeTime: subsOptions.includeTime,
            includeSpeaker: subsOptions.includeSpeaker,
            spkNames,
          }),
          filename: `subtitle_${ts}.txt`,
        })
      }
      if (fileTypes.summary) {
        targets.push({
          content: summaryToText(summary),
          filename: `summary_${ts}.txt`,
        })
      }
      if (fileTypes.srt) {
        if (srtMode === "combined") {
          targets.push({
            content: subsToCombinedSRT(subsSentences),
            filename: `subtitle_${ts}.srt`,
          })
        } else {
          const perSpeaker = subsToSpeakerSRTs(subsSentences, spkNames)
          for (const item of perSpeaker) {
            targets.push({
              content: item.content,
              filename: `subtitle_${sanitizeFilename(item.name)}_${ts}.srt`,
            })
          }
        }
      }

      if (targets.length === 0) {
        setWarning("파일 유형을 하나 이상 선택해주세요")
        return
      }
      setWarning("")

      for (const t of targets) {
        const fullPath = path.join(dir, t.filename)
        fs.writeFileSync(fullPath, t.content, "utf8")
        savedPaths.push(fullPath)
      }
      addLog &&
        addLog(
          "info",
          `파일 ${savedPaths.length}개 저장됨:\n${savedPaths.join("\n")}`,
        )
      setSaved(true)
      setTimeout(() => {
        onClose()
      }, 1200)
    } catch (e) {
      addLog && addLog("warn", `다운로드 실패: ${e.message}`)
      alert("저장 실패: " + e.message)
    }
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(v) => {
        if (!v && !saved) onClose()
      }}
    >
      <DialogContent className="max-w-sm">
        {saved && (
          <div className="absolute inset-0 z-10 flex flex-col items-center justify-center bg-background/95 rounded-lg">
            <div className="w-14 h-14 rounded-full bg-green-500/20 flex items-center justify-center mb-3">
              <Check className="w-8 h-8 text-green-500" strokeWidth={3} />
            </div>
            <p className="text-sm font-medium">저장 완료</p>
          </div>
        )}
        <DialogHeader>
          <DialogTitle>다운로드</DialogTitle>
        </DialogHeader>

        <div className="flex flex-col divide-y divide-border">
          {/* 일반 자막 텍스트 파일 */}
          <div className="flex flex-col gap-2 pb-3">
            <CheckOption
              checked={fileTypes.subs}
              onToggle={() => toggleType("subs")}
              label="일반 자막 텍스트 파일"
            />
            {fileTypes.subs && (
              <div className="pl-6 flex flex-col gap-1.5">
                <p className="text-xs text-muted-foreground">옵션</p>
                <CheckOption
                  checked={subsOptions.includeTime}
                  onToggle={() => toggleSubsOption("includeTime")}
                  label="타임코드"
                />
                <CheckOption
                  checked={subsOptions.includeSpeaker}
                  onToggle={() => toggleSubsOption("includeSpeaker")}
                  label="화자 이름"
                />
              </div>
            )}
          </div>

          {/* 요약 텍스트 파일 */}
          <div className="py-3">
            <CheckOption
              checked={fileTypes.summary}
              onToggle={() => toggleType("summary")}
              label="요약 텍스트 파일"
              disabled={!summaryAvailable}
            />
          </div>

          {/* SRT 파일 */}
          <div className="flex flex-col gap-2 py-3">
            <CheckOption
              checked={fileTypes.srt}
              onToggle={() => toggleType("srt")}
              label="SRT 파일"
            />
            {fileTypes.srt && (
              <div className="pl-6 flex flex-col gap-1.5">
                <p className="text-xs text-muted-foreground">옵션</p>
                <CheckOption
                  checked={srtMode === "perSpeaker"}
                  onToggle={() => setSrtMode("perSpeaker")}
                  label="화자별"
                />
                <CheckOption
                  checked={srtMode === "combined"}
                  onToggle={() => setSrtMode("combined")}
                  label="통합"
                />
              </div>
            )}
          </div>

          {/* 파일 위치 */}
          <div className="pt-3">
            <p className="text-xs text-muted-foreground mb-2">파일 위치</p>
            <div className="flex items-center gap-2">
              <Input
                value={filePath}
                onChange={(e) => setFilePath(e.target.value)}
                className="flex-1 text-xs"
              />
              <Button
                variant="outline"
                size="sm"
                onClick={handleBrowse}
                className="shrink-0"
              >
                <Folder className="h-3 w-3 mr-1" />
                변경
              </Button>
            </div>
          </div>
        </div>

        {warning && (
          <div className="rounded-md border border-red-500/40 bg-red-500/10 px-3 py-2 text-xs text-red-400">
            {warning}
          </div>
        )}

        <DialogFooter className="gap-2">
          <Button variant="secondary" onClick={onClose}>
            닫기
          </Button>
          <Button onClick={handleDownload}>다운로드</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

function CheckOption({ checked, onToggle, label, disabled }) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onToggle}
      className="flex items-center gap-2 text-sm text-left disabled:opacity-40 disabled:cursor-not-allowed"
    >
      <span
        className={`inline-flex items-center justify-center w-4 h-4 rounded border shrink-0 ${checked ? "bg-primary border-primary" : "border-muted-foreground"}`}
      >
        {checked && (
          <svg
            className="w-3 h-3 text-primary-foreground"
            viewBox="0 0 12 12"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
          >
            <path d="M2 6l3 3 5-6" />
          </svg>
        )}
      </span>
      {label}
    </button>
  )
}
