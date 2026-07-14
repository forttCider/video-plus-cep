import React from "react"
import { useDevSettings } from "../js/devSettings"

/**
 * 개발자용 토글 (config.json devMode: true 일 때만 렌더).
 *  - 프리뷰: ON=preview(저해상도) / OFF=auto(풀 해상도)로 배경제거 다운로드
 *  - 크레딧소진: ON이면 배경제거 다운로드 시 소진 확인창 강제 표시(테스트)
 */
function Toggle({ label, on, onChange, title }) {
  return (
    <button
      onClick={() => onChange(!on)}
      title={title}
      className={`flex items-center gap-1 text-[10px] px-2 py-1 rounded-md border transition-colors ${
        on
          ? "border-amber-500/70 text-amber-300 bg-amber-500/10"
          : "border-border text-muted-foreground hover:bg-white/5"
      }`}
    >
      <span
        className={`inline-block w-2 h-2 rounded-full ${on ? "bg-amber-400" : "bg-muted-foreground/40"}`}
      />
      {label} {on ? "ON" : "OFF"}
    </button>
  )
}

export default function DevSwitches() {
  const { devMode, previewMode, simulateEmpty, setPreviewMode, setSimulateEmpty } = useDevSettings()
  if (!devMode) return null
  return (
    <div className="flex items-center gap-1.5">
      <span className="text-[9px] font-semibold text-amber-400/80">DEV</span>
      <Toggle
        label="프리뷰"
        on={previewMode}
        onChange={setPreviewMode}
        title="ON: preview(저해상도, 개발용) · OFF: auto(풀 해상도)로 배경제거 다운로드"
      />
      <Toggle
        label="크레딧소진"
        on={simulateEmpty}
        onChange={setSimulateEmpty}
        title="ON: 배경제거 다운로드 시 '소진' 확인창을 강제로 띄움(테스트)"
      />
    </div>
  )
}
