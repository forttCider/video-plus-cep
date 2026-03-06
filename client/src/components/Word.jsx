import React, { forwardRef } from "react"
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
        onClick,
      },
      ref,
    ) => {
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
      ]
        .filter(Boolean)
        .join(" ")

      const reason = word.edit_points?.reason

      const wordContent = (
        <div ref={ref} className={classNames} onClick={onClick}>
          {word.isEdit ? <div>[...]</div> : <div>{word.text}</div>}
        </div>
      )

      // reason이 있으면 tooltip으로 감싸기
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
      prevProps.word.isDeleted === nextProps.word.isDeleted &&
      prevProps.word.isEdit === nextProps.word.isEdit &&
      prevProps.word.text === nextProps.word.text &&
      prevProps.word.frameCount === nextProps.word.frameCount
    )
  },
)

export default Word
