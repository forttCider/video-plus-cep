import React, { useState, useEffect, useCallback } from "react"
import { RefreshCw, Loader2, Scissors } from "lucide-react"
import { getRemoveBgAccount, loadConfig } from "../js/personimage-bridge"
import { isDevMode } from "../js/devSettings"

/**
 * remove.bg 잔여 크레딧·무료 호출 배지 (인물·배경 공통).
 * 마운트 시 1회 조회, 클릭으로 새로고침. 키 없으면 렌더 안 함.
 */
export default function RemoveBgCredits() {
  const [hasKey, setHasKey] = useState(false)
  const [data, setData] = useState(null) // {credits, freeCalls}
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    const r = await getRemoveBgAccount()
    setLoading(false)
    if (r.success) setData({ credits: r.credits, freeCalls: r.freeCalls })
    else setError(r.error || "조회 실패")
  }, [])

  useEffect(() => {
    const cfg = loadConfig()
    const key = !!cfg.removeBgApiKey
    setHasKey(key)
    if (key) load()
  }, [load])

  // 배경제거 호출 때마다 자동 재조회. 계정 반영이 느릴 수 있어 두 번(1.5s·5s) 조회
  // — 무료 호출은 빨리, 크레딧(auto)은 늦게 반영되므로.
  useEffect(() => {
    if (!hasKey) return
    let t1 = null
    let t2 = null
    const onUsed = () => {
      if (t1) clearTimeout(t1)
      if (t2) clearTimeout(t2)
      t1 = setTimeout(() => load(), 1500)
      t2 = setTimeout(() => load(), 5000)
    }
    window.addEventListener("removebg:used", onUsed)
    return () => {
      window.removeEventListener("removebg:used", onUsed)
      if (t1) clearTimeout(t1)
      if (t2) clearTimeout(t2)
    }
  }, [hasKey, load])

  if (!hasKey) return null

  return (
    <button
      onClick={load}
      disabled={loading}
      title="remove.bg 잔여 크레딧 · 무료 호출 (클릭하여 새로고침)"
      className="flex items-center gap-1.5 text-[10px] px-2 py-1 rounded-md border border-border text-muted-foreground hover:bg-white/5 disabled:opacity-60"
    >
      <Scissors className="h-3 w-3 shrink-0" />
      {loading ? (
        <Loader2 className="h-3 w-3 animate-spin" />
      ) : error ? (
        <span className="text-red-400">배경제거 크레딧 오류</span>
      ) : data ? (
        <span>
          배경제거 크레딧 <b className="text-foreground tabular-nums">{data.credits}</b>
          {isDevMode() && (
            <span className="text-muted-foreground/70"> · 무료 {data.freeCalls}</span>
          )}
        </span>
      ) : (
        <span>배경제거 크레딧 —</span>
      )}
      <RefreshCw className={`h-3 w-3 shrink-0 ${loading ? "animate-spin" : ""}`} />
    </button>
  )
}
