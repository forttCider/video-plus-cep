/**
 * 앱 어디서든 Promise 기반 확인 다이얼로그를 띄우는 imperative 유틸.
 * ConfirmDialogHost(앱에 1회 마운트)가 리스너로 등록되어 shadcn Dialog 를 렌더한다.
 * 호스트가 없으면 네이티브 confirm 으로 폴백.
 */
let listener = null
let pending = null

export function confirmDialog(opts = {}) {
  return new Promise((resolve) => {
    if (typeof window === "undefined" || !listener) {
      resolve(
        typeof window !== "undefined" && window.confirm
          ? window.confirm(opts.message || "계속할까요?")
          : true,
      )
      return
    }
    pending = resolve
    listener({ ...opts })
  })
}

export function registerConfirmListener(fn) {
  listener = fn
}

export function resolveConfirm(val) {
  const r = pending
  pending = null
  if (r) r(val)
}
