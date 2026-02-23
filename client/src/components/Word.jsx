import React, { forwardRef } from "react";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "./ui/tooltip";
import "./css/Word.css";

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
        onContextMenu,
      },
      ref
    ) => {
      const handleContextMenu = (e) => {
        e.preventDefault();
        onContextMenu(e);
      };

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
        .join(" ");

      const reason = word.edit_points?.reason;

      const wordElement = (
        <div
          ref={ref}
          className={classNames}
          onClick={onClick}
          onContextMenu={handleContextMenu}
        >
          {word.isEdit ? <div>[...]</div> : <div>{word.text}</div>}
        </div>
      );

      if (reason) {
        return (
          <Tooltip>
            <TooltipTrigger asChild>{wordElement}</TooltipTrigger>
            <TooltipContent>{reason}</TooltipContent>
          </Tooltip>
        );
      }

      return wordElement;
    }
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
      prevProps.word.text === nextProps.word.text
    );
  }
);

export default Word;
