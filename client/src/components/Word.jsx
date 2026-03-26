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
        mode = "cut",
      },
      ref,
    ) => {
      const [editText, setEditText] = useState(word.text)
      const inputRef = useRef(null)
      const confirmedRef = useRef(false)

      useEffect(() => {
        if (isEditing) {
          confirmedRef.current = false
          setEditText(word.text)
          setTimeout(() => inputRef.current?.select(), 0)
        }
      }, [isEditing, word.text])

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

      const handleEditKeyDown = (e) => {
        e.stopPropagation()
        e.nativeEvent.stopImmediatePropagation()
        if (e.isComposing || e.keyCode === 229) return
        if (e.key === "Enter") {
          e.preventDefault()
          handleEditConfirm()
        } else if (e.key === "Escape") {
          e.preventDefault()
          confirmedRef.current = true
          onTextUpdate?.(null)
        }
      }

      const classNames = [
        "word",
        "word-normal",
        isCurrentWord ? "word-current" : "",
        isFocused ? "word-focused" : "",
        isSelected ? "word-selected" : "",
        mode === "cut" && (word.isEdit || word.edit_points?.reason) ? "word-edit" : "",
        word.isDeleted ? (mode === "subs" ? "word-deleted-subs" : "word-deleted") : "",
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
              value={editText}
              onChange={(e) => setEditText(e.target.value)}
              onKeyDown={handleEditKeyDown}
              onBlur={handleEditConfirm}
              onClick={(e) => e.stopPropagation()}
              style={{ width: Math.max(1, editText.length) + 2 + "ch" }}
            />
          ) : word.isEdit ? (
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
      prevProps.word.isDeleted === nextProps.word.isDeleted &&
      prevProps.word.isEdit === nextProps.word.isEdit &&
      prevProps.word.text === nextProps.word.text &&
      prevProps.word.frameCount === nextProps.word.frameCount
    )
  },
)

export default Word
