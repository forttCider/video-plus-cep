import React, { useState, useEffect } from "react"
import { Loader2, ImageOff, Sparkles, Copy, Check, Palette } from "lucide-react"
import { Button } from "./ui/button"
import { generateTitles, loadChannels } from "../js/title-bridge"

const COUNT_OPTIONS = [5, 10, 15]

// 글자 색 추천 (편집 시 단어/구절별로 입힐 색)
const COLOR_CLS = {
  white: "text-white",
  yellow: "text-yellow-300",
  red: "text-red-400",
  green: "text-green-400",
}
const COLOR_KO = { yellow: "노랑", red: "빨강", green: "초록" }

// parts → 색 표시 텍스트. 흰색은 표시 안 하고, 강조색은 (색)단어(색)로 감쌈
function partsToMarked(parts) {
  return parts
    .map((p) => {
      const ko = COLOR_KO[p.color]
      return ko ? `(${ko})${p.text}(${ko})` : p.text
    })
    .join("")
}

/**
 * 썸네일 제목 추천 탭
 * 받아쓰기 요약을 맥락으로 자동 채우고(직접 수정 가능),
 * 채널별 예시 스타일로 Claude가 제목 후보를 생성.
 */
export default function TitleTab({ worker, partContext, fallbackContext }) {
  const [context, setContext] = useState("")
  const [channels, setChannels] = useState({})
  const [channel, setChannel] = useState("")
  const [count, setCount] = useState(10)
  const [generating, setGenerating] = useState(false)
  const [error, setError] = useState(null)
  const [titles, setTitles] = useState([]) // [{text, color}]
  const [copiedKey, setCopiedKey] = useState(null) // `${idx}:plain` | `${idx}:mark`

  useEffect(() => {
    const { channels, activeChannel } = loadChannels()
    setChannels(channels)
    setChannel(activeChannel)
  }, [])

  // 맥락 자동 프리필: 부 편성이 있으면 선택한 부 텍스트(partContext), 없으면 입력 전체 (직접 수정 가능)
  useEffect(() => {
    const text = partContext != null ? partContext : fallbackContext || ""
    if (text.trim()) setContext(text)
  }, [fallbackContext, partContext])

  const handleGenerate = async () => {
    setGenerating(true)
    setError(null)
    setTitles([])
    try {
      const r = await generateTitles({ context, channel, count })
      if (r.success) setTitles(r.titles)
      else setError(r.error || "제목 생성 실패")
    } catch (e) {
      setError(e.message || String(e))
    } finally {
      setGenerating(false)
    }
  }

  const handleCopy = (text, key) => {
    // CEP(file://)에서는 navigator.clipboard가 막혀 execCommand 방식 사용
    let ok = false
    try {
      const textarea = document.createElement("textarea")
      textarea.value = text
      textarea.style.position = "fixed"
      textarea.style.opacity = "0"
      document.body.appendChild(textarea)
      textarea.select()
      ok = document.execCommand("copy")
      document.body.removeChild(textarea)
    } catch (e) {}
    if (ok) {
      setCopiedKey(key)
      setTimeout(() => setCopiedKey(null), 2000)
    }
  }

  const channelKeys = Object.keys(channels)

  return (
    <div className="flex flex-col p-4 gap-4">
      <div>
        <h2 className="text-sm font-semibold">썸네일 제목 추천</h2>
        <p className="text-[11px] text-muted-foreground">
          영상 내용(받아쓰기 요약)을 바탕으로 채널 스타일의 제목 후보를 만듭니다.
        </p>
      </div>

      {/* 1) 맥락 + 옵션 */}
      <div className="flex flex-col gap-2">
        <span className="text-[11px] font-semibold text-muted-foreground">
          ① 영상 내용 (요약 자동 입력 — 수정 가능)
        </span>
        <textarea
          value={context}
          onChange={(e) => setContext(e.target.value)}
          placeholder="받아쓰기 요약이 자동으로 채워집니다. 없으면 영상 주제/키워드를 직접 입력하세요."
          rows={6}
          className="w-full text-xs bg-transparent border border-border rounded-md px-2 py-1.5 outline-none focus:border-white/40 resize-y"
        />

        <div className="flex items-center gap-2">
          {channelKeys.length > 0 && (
            <select
              value={channel}
              onChange={(e) => setChannel(e.target.value)}
              className="text-xs bg-transparent border border-border rounded-md px-2 py-1 outline-none focus:border-white/40"
              title="채널 (제목 예시 스타일)"
            >
              {channelKeys.map((k) => (
                <option key={k} value={k} className="bg-neutral-900">
                  {channels[k]?.displayName || k}
                </option>
              ))}
            </select>
          )}
          <div className="flex items-center gap-0.5 ml-auto" title="후보 개수">
            {COUNT_OPTIONS.map((v) => (
              <button
                key={v}
                onClick={() => setCount(v)}
                disabled={generating}
                className={`text-xs font-semibold w-8 h-7 rounded-md transition-colors ${
                  count === v
                    ? "bg-white text-black"
                    : "bg-transparent text-muted-foreground hover:bg-white/10"
                }`}
              >
                {v}
              </button>
            ))}
          </div>
        </div>

        <Button
          size="sm"
          onClick={handleGenerate}
          disabled={generating || !context.trim()}
        >
          {generating ? (
            <Loader2 className="h-4 w-4 mr-1.5 animate-spin" />
          ) : (
            <Sparkles className="h-4 w-4 mr-1.5" />
          )}
          제목 추천
        </Button>

        {error && (
          <div className="flex items-start gap-2 text-xs text-red-400 border border-red-900/40 bg-red-950/30 rounded-md px-3 py-2">
            <ImageOff className="h-4 w-4 mt-0.5 shrink-0" />
            <span className="break-words">{error}</span>
          </div>
        )}
      </div>

      {/* 2) 후보 */}
      {titles.length > 0 && (
        <div className="flex flex-col gap-2 pt-1 border-t border-border">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-[11px] font-semibold text-muted-foreground">
              ② 제목 후보 ({titles.length})
            </span>
            <span className="text-[10px] text-muted-foreground">
              색 = 추천 강조색(<span className="text-yellow-300">노랑</span>강조 ·{" "}
              <span className="text-red-400">빨강</span>위험 ·{" "}
              <span className="text-green-400">초록</span>기회)
            </span>
          </div>
          <div className="flex flex-col gap-1.5">
            {titles.map((t, i) => {
              const parts =
                t.parts && t.parts.length
                  ? t.parts
                  : [{ text: t.text || "", color: "white" }]
              return (
                <div
                  key={i}
                  className="flex items-start gap-2 border border-border rounded-md px-2.5 py-2 bg-neutral-900/40"
                >
                  {/* 색 미리보기 (단어별 추천 색) */}
                  <div className="flex-1 min-w-0 text-xs font-semibold break-words leading-snug whitespace-pre-wrap">
                    {parts.map((p, pi) => (
                      <span key={pi} className={COLOR_CLS[p.color] || COLOR_CLS.white}>
                        {p.text}
                      </span>
                    ))}
                  </div>
                  <div className="shrink-0 flex items-center gap-1.5">
                    <button
                      onClick={() => handleCopy(t.text, `${i}:plain`)}
                      className="text-muted-foreground hover:text-foreground"
                      title="글자만 복사"
                    >
                      {copiedKey === `${i}:plain` ? (
                        <Check className="h-3.5 w-3.5 text-green-400" />
                      ) : (
                        <Copy className="h-3.5 w-3.5" />
                      )}
                    </button>
                    <button
                      onClick={() => handleCopy(partsToMarked(parts), `${i}:mark`)}
                      className="text-muted-foreground hover:text-foreground"
                      title="색 표시 복사  예: (빨강)지금 난리난 이유(빨강)"
                    >
                      {copiedKey === `${i}:mark` ? (
                        <Check className="h-3.5 w-3.5 text-green-400" />
                      ) : (
                        <Palette className="h-3.5 w-3.5" />
                      )}
                    </button>
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      )}
    </div>
  )
}
