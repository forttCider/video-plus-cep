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
        if (confirmedRef.current) return // 이중 호출 방지
        confirmedRef.current = true
        if (onTextUpdate && editText !== word.text) {
          onTextUpdate(editText)
        } else if (onTextUpdate) {
          onTextUpdate(null)
        }
      }

      const handleEditKeyDown = (e) => {
        e.stopPropagation()
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
        word.isEdit || word.edit_points?.reason ? "word-edit" : "",
        word.isDeleted ? "word-deleted" : "",
        isSearchMatch ? "word-search-match" : "",
        isCurrentSearchMatch ? "word-search-current" : "",
        isEditing ? "word-editing" : "",
      ]
        .filter(Boolean)
        .join(" ")

      const reason = word.edit_points?.reason

      const wordContent = (
        <div ref={ref} className={classNames} onClick={onClick}>
          {isEditing ? (
            <input
              ref={inputRef}
              className="word-edit-input"
              value={editText}
              style={{ width: `${Math.max(1, editText.length) + 2}ch` }}
              onChange={(e) => setEditText(e.target.value)}
              onKeyDown={handleEditKeyDown}
              onBlur={handleEditConfirm}
              autoFocus
            />
          ) : word.isEdit ? (
            <div>[...]</div>
          ) : (
            <div>{word.text}</div>
          )}
        </div>
      )

      // reason이 있으면 tooltip으로 감싸기
      if (reason && !isEditing) {
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
