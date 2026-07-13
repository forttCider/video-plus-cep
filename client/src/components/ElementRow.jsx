import React, { useState } from "react"
import { Loader2, Sparkles, X, MoreVertical, ChevronDown, ChevronUp } from "lucide-react"
import { IMP_LABELS } from "../js/bgPrompt"

const IMP_STYLE = {
  3: "border-amber-500/60 text-amber-300",
  2: "border-border text-muted-foreground",
  1: "border-border text-muted-foreground/60",
}

/**
 * 요소 1행. 접힌 상태(카테고리·이름·중요도·⋮) + 펼친 편집.
 * props: el {id,name,category,importance,prompt,promptLoading}
 *        onChange(patch), onRegenPrompt(), onRemove()
 */
export default function ElementRow({ el, onChange, onRegenPrompt, onRemove }) {
  const [open, setOpen] = useState(false)
  const [menu, setMenu] = useState(false)
  const imp = el.importance >= 1 && el.importance <= 3 ? el.importance : 2

  return (
    <div className="border border-border rounded-md bg-background/40">
      {/* 접힌 행 */}
      <div className="flex items-center gap-1.5 px-2 py-1.5">
        <button
          onClick={() => setOpen((v) => !v)}
          className="text-muted-foreground hover:text-foreground shrink-0"
          title={open ? "접기" : "펼쳐 편집"}
        >
          {open ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
        </button>
        <span
          className={`shrink-0 text-[9px] px-1 py-0.5 rounded border ${IMP_STYLE[imp]}`}
          title="중요도"
        >
          {IMP_LABELS[imp]}
        </span>
        {el.category && (
          <span className="shrink-0 text-[9px] px-1.5 py-0.5 rounded bg-white/10 text-muted-foreground">
            {el.category}
          </span>
        )}
        <span
          onClick={() => setOpen((v) => !v)}
          className="flex-1 min-w-0 text-xs truncate cursor-pointer"
        >
          {el.name || <span className="text-muted-foreground/60">(이름 없음)</span>}
        </span>
        <div className="relative shrink-0">
          <button
            onClick={() => setMenu((v) => !v)}
            className="text-muted-foreground hover:text-foreground"
            title="더보기"
          >
            <MoreVertical className="h-3.5 w-3.5" />
          </button>
          {menu && (
            <div className="absolute right-0 top-5 z-10 flex flex-col bg-neutral-900 border border-border rounded-md shadow-lg text-[11px] min-w-[110px] py-1">
              <button
                onClick={() => {
                  setMenu(false)
                  onRegenPrompt()
                }}
                disabled={el.promptLoading || !(el.name || "").trim()}
                className="flex items-center gap-1.5 px-2.5 py-1.5 hover:bg-white/5 text-left disabled:opacity-40"
              >
                {el.promptLoading ? (
                  <Loader2 className="h-3 w-3 animate-spin" />
                ) : (
                  <Sparkles className="h-3 w-3" />
                )}
                프롬프트 {el.prompt ? "재생성" : "생성"}
              </button>
              <button
                onClick={() => {
                  setMenu(false)
                  onRemove()
                }}
                className="flex items-center gap-1.5 px-2.5 py-1.5 hover:bg-white/5 text-left text-red-400"
              >
                <X className="h-3 w-3" />
                삭제
              </button>
            </div>
          )}
        </div>
      </div>

      {/* 프롬프트 (muted mono, 전체폭) */}
      {el.prompt && !open && (
        <div className="px-2 pb-1.5 -mt-0.5">
          <p className="text-[10px] font-mono text-muted-foreground/70 truncate" title={el.prompt}>
            {el.prompt}
          </p>
        </div>
      )}

      {/* 펼친 편집 */}
      {open && (
        <div className="flex flex-col gap-1.5 px-2 pb-2 pt-0.5 border-t border-border/60">
          <div className="flex items-center gap-1.5">
            <select
              value={imp}
              onChange={(e) => onChange({ importance: parseInt(e.target.value, 10) })}
              className={`shrink-0 text-[10px] rounded-md border px-1 py-1 outline-none bg-background ${IMP_STYLE[imp]}`}
              title="중요도"
            >
              <option value={3}>핵심</option>
              <option value={2}>보조</option>
              <option value={1}>배경</option>
            </select>
            <input
              value={el.category || ""}
              onChange={(e) => onChange({ category: e.target.value })}
              placeholder="카테고리"
              className="w-24 shrink-0 text-[11px] bg-transparent border border-border rounded-md px-2 py-1 outline-none focus:border-white/40"
            />
            <input
              value={el.name || ""}
              onChange={(e) => onChange({ name: e.target.value })}
              placeholder="요소 이름"
              className="flex-1 min-w-0 text-xs bg-transparent border border-border rounded-md px-2 py-1 outline-none focus:border-white/40"
            />
          </div>
          <textarea
            value={el.prompt || ""}
            onChange={(e) => onChange({ prompt: e.target.value })}
            placeholder="이미지 생성 프롬프트 (⋮ 메뉴로 자동 생성 · 수정 가능)"
            rows={2}
            className="w-full text-[11px] font-mono bg-transparent border border-border rounded-md px-2 py-1.5 outline-none focus:border-white/40 text-muted-foreground resize-y"
          />
          <div className="flex items-center gap-1.5">
            <button
              onClick={onRegenPrompt}
              disabled={el.promptLoading || !(el.name || "").trim()}
              className="flex items-center gap-1 text-[10px] px-2 py-1 rounded-md border border-border text-muted-foreground hover:bg-white/5 disabled:opacity-50"
            >
              {el.promptLoading ? (
                <Loader2 className="h-3 w-3 animate-spin" />
              ) : (
                <Sparkles className="h-3 w-3" />
              )}
              프롬프트 {el.prompt ? "재생성" : "생성"}
            </button>
            <button
              onClick={onRemove}
              className="flex items-center gap-1 text-[10px] px-2 py-1 rounded-md border border-border text-red-400 hover:bg-red-950/30"
            >
              <X className="h-3 w-3" />
              삭제
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
