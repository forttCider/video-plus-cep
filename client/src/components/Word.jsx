import React, { forwardRef, useState, useRef, useEffect } from "react"
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
  TooltipProvider,
} from "./ui/tooltip"
import "./css/Word.css"

const Word = React.memo(
  forwardRef(
    (
      {
        word,
        isCurrentWord,
        isFocused,
        isSelected,
        isSearchMatch,
        isCurrentSearchMatch,
        isEditing,
        onClick,
        onTextUpdate,
        onEditingEnd,
        mode = "cut",
      },
      ref,
    ) => {
      const [editText, setEditText] = useState(word.text || "")
      const inputRef = useRef(null)
      const confirmedRef = useRef(false)
      const wasEditingRef = useRef(false)

      // isEditing 전환 시 동기적으로 텍스트 초기화
      if (isEditing && !wasEditingRef.current) {
        confirmedRef.current = false
        setEditText(word.text || "")
      }
      wasEditingRef.current = isEditing

      useEffect(() => {
        if (isEditing) {
          setTimeout(() => inputRef.current?.select(), 0)
        }
      }, [isEditing])

      const handleEditConfirm = () => {
        if (confirmedRef.current) return
        confirmedRef.current = true
        if (!editText.trim()) {
          onTextUpdate?.(null)
        } else if (onTextUpdate && editText !== word.text) {
          onTextUpdate(editText)
        } else if (onTextUpdate) {
          onTextUpdate(null)
        }
      }

      const composingRef = useRef(false)
      const wasComposingRef = useRef(false)

      const handleEditKeyDown = (e) => {
        e.stopPropagation()
        e.nativeEvent.stopImmediatePropagation()
        if (e.isComposing || e.keyCode === 229) {
          composingRef.current = true
          return
        }
        if (e.key === "Enter") {
          e.preventDefault()
          handleEditConfirm()
        } else if (e.key === "Escape") {
          e.preventDefault()
          confirmedRef.current = true
          onTextUpdate?.(null)
        }
      }

      const handleCompositionEnd = () => {
        wasComposingRef.current = true
        composingRef.current = false
      }

      const handleEditKeyUp = (e) => {
        e.stopPropagation()
        e.nativeEvent.stopImmediatePropagation()
        // IME 조합 확정 직후 Enter에서만 편집 종료
        if (wasComposingRef.current && e.keyCode === 13) {
          wasComposingRef.current = false
          handleEditConfirm()
        }
      }

      const classNames = [
        "word",
        "word-normal",
        isCurrentWord ? "word-current" : "",
        isFocused ? "word-focused" : "",
        isSelected ? "word-selected" : "",
        mode === "cut" && (word.is_edit || word.edit_points?.reason) ? "word-edit" : "",
        word.is_deleted ? (mode === "subs" ? "word-deleted-subs" : "word-deleted") : "",
        isSearchMatch ? "word-search-match" : "",
        isCurrentSearchMatch ? "word-search-current" : "",
        isEditing ? "word-editing" : "",
      ]
        .filter(Boolean)
        .join(" ")

      const reason = mode === "cut" ? word.edit_points?.reason : null

      const wordContent = (
        <div ref={ref} className={classNames} onClick={onClick}>
          {isEditing ? (
            <input
              ref={inputRef}
              className="word-edit-input"
              autoFocus
              value={editText}
              onChange={(e) => setEditText(e.target.value)}
              onKeyDown={handleEditKeyDown}
              onKeyUp={handleEditKeyUp}
              onCompositionEnd={handleCompositionEnd}
              onBlur={() => {
                if (!confirmedRef.current) {
                  confirmedRef.current = true
                  if (editText.trim() && editText !== word.text) {
                    onTextUpdate?.(editText)
                  } else {
                    onTextUpdate?.(null)
                  }
                }
                onEditingEnd?.()
                setTimeout(() => {
                  document.querySelector('[data-focus-trap="true"]')?.focus()
                }, 0)
              }}
              onClick={(e) => e.stopPropagation()}
              style={{ width: Math.max(1, editText.length) + 2 + "ch" }}
            />
          ) : word.is_edit ? (
            <div>[...]</div>
          ) : (
            <div>{word.text}</div>
          )}
        </div>
      )

      if (reason) {
        return (
          <TooltipProvider delayDuration={300}>
            <Tooltip>
              <TooltipTrigger asChild>{wordContent}</TooltipTrigger>
              <TooltipContent>
                <p>{reason}</p>
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>
        )
      }

      return wordContent
    },
  ),
  (prevProps, nextProps) => {
    return (
      prevProps.isCurrentWord === nextProps.isCurrentWord &&
      prevProps.isFocused === nextProps.isFocused &&
      prevProps.isSelected === nextProps.isSelected &&
      prevProps.isSearchMatch === nextProps.isSearchMatch &&
      prevProps.isCurrentSearchMatch === nextProps.isCurrentSearchMatch &&
      prevProps.isEditing === nextProps.isEditing &&
      prevProps.word.is_deleted === nextProps.word.is_deleted &&
      prevProps.word.is_edit === nextProps.word.is_edit &&
      prevProps.word.text === nextProps.word.text
    )
  },
)

export default Word
