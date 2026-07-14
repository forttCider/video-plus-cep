/**
 * 개발자용 설정 — config.json 의 `devMode: true` 일 때만 활성.
 * 배포 시 config.json 에서 devMode 를 false/생략하면 모든 개발자 옵션·UI 가 사라지고
 * 프로덕션 기본값(배경제거는 auto 해상도, 소진 시뮬 off)으로 동작한다.
 *
 * 토글 상태는 localStorage 에 저장, 변경 시 'devsettings:change' 이벤트로 구독자에게 알림.
 */
import { useState, useEffect } from "react"
import { loadConfig } from "./personimage-bridge"

const KEY_PREVIEW = "videoPlus.dev.previewMode"
const KEY_EMPTY = "videoPlus.dev.simulateEmpty"

let _dev = null
export function isDevMode() {
  if (_dev === null) {
    try {
      _dev = !!loadConfig().devMode
    } catch (e) {
      _dev = false
    }
  }
  return _dev
}

function readBool(key, defWhenDev) {
  if (!isDevMode()) return false // 프로덕션에선 항상 off
  try {
    const v = localStorage.getItem(key)
    return v === null ? defWhenDev : v === "1"
  } catch (e) {
    return defWhenDev
  }
}
function writeBool(key, on) {
  try {
    localStorage.setItem(key, on ? "1" : "0")
  } catch (e) {}
  try {
    window.dispatchEvent(new CustomEvent("devsettings:change"))
  } catch (e) {}
}

// 배경제거 해상도: 프리뷰 모드 ON → preview(저해상도, 개발용) / OFF → auto(풀 해상도)
export function getPreviewMode() {
  return readBool(KEY_PREVIEW, true) // 개발자 기본 ON
}
export function setPreviewMode(on) {
  writeBool(KEY_PREVIEW, on)
}

// 크레딧 소진 시뮬 — 확인창 테스트용
export function getSimulateEmpty() {
  return readBool(KEY_EMPTY, false)
}
export function setSimulateEmpty(on) {
  writeBool(KEY_EMPTY, on)
}

// 배경제거 다운로드 크기 (preview | auto)
export function removeBgSize() {
  return getPreviewMode() ? "preview" : "auto"
}

/** 개발자 설정을 구독하는 훅 — 변경 시 리렌더 */
export function useDevSettings() {
  const [, setTick] = useState(0)
  useEffect(() => {
    const h = () => setTick((t) => t + 1)
    window.addEventListener("devsettings:change", h)
    return () => window.removeEventListener("devsettings:change", h)
  }, [])
  return {
    devMode: isDevMode(),
    previewMode: getPreviewMode(),
    simulateEmpty: getSimulateEmpty(),
    setPreviewMode,
    setSimulateEmpty,
  }
}
