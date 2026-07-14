import React, { useEffect } from "react"
import { X, ChevronLeft, ChevronRight } from "lucide-react"

/**
 * 이미지 확대 보기 (라이트박스) + 좌우 이동.
 * @param {string[]} images - 이미지 url 목록
 * @param {number|null} index - 현재 인덱스 (null이면 닫힘)
 * @param {function} onClose
 * @param {function} onIndex - (newIndex) => void
 */
export default function ImageLightbox({ images, index, onClose, onIndex }) {
  const open = index != null && Array.isArray(images) && images.length > 0
  const len = open ? images.length : 0

  useEffect(() => {
    if (!open) return
    const onKey = (e) => {
      if (e.key === "Escape") onClose()
      else if (e.key === "ArrowLeft") onIndex((index - 1 + len) % len)
      else if (e.key === "ArrowRight") onIndex((index + 1) % len)
    }
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  }, [open, index, len, onClose, onIndex])

  if (!open) return null
  const multi = len > 1
  const go = (d, e) => {
    e.stopPropagation()
    onIndex((index + d + len) % len)
  }

  return (
    <div
      onClick={onClose}
      className="fixed inset-0 z-50 bg-black/85 flex items-center justify-center p-6 cursor-zoom-out"
    >
      <button
        onClick={onClose}
        className="absolute top-3 right-3 text-white/80 hover:text-white"
        title="닫기 (Esc)"
      >
        <X className="h-6 w-6" />
      </button>

      {multi && (
        <button
          onClick={(e) => go(-1, e)}
          className="absolute left-4 top-1/2 -translate-y-1/2 rounded-full bg-black/70 hover:bg-black text-white p-3 shadow-lg ring-1 ring-white/30"
          title="이전 (←)"
        >
          <ChevronLeft className="h-7 w-7" />
        </button>
      )}

      <img
        src={images[index]}
        alt="확대"
        onClick={(e) => e.stopPropagation()}
        className="max-w-full max-h-full object-contain cursor-default"
      />

      {multi && (
        <button
          onClick={(e) => go(1, e)}
          className="absolute right-4 top-1/2 -translate-y-1/2 rounded-full bg-black/70 hover:bg-black text-white p-3 shadow-lg ring-1 ring-white/30"
          title="다음 (→)"
        >
          <ChevronRight className="h-7 w-7" />
        </button>
      )}

      {multi && (
        <span className="absolute bottom-4 left-1/2 -translate-x-1/2 text-white/80 text-xs bg-black/50 rounded-full px-2.5 py-0.5">
          {index + 1} / {len}
        </span>
      )}
    </div>
  )
}
