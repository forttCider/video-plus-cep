import React, { forwardRef } from "react";
import "./css/Word.css";

const Word = React.memo(
  forwardRef(
    (
      {
        word,
        isCurrentWord,
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
        word.isEdit || word.edit_points?.reason ? "word-edit" : "",
        word.isDeleted ? "word-deleted" : "",
        isSearchMatch ? "word-search-match" : "",
        isCurrentSearchMatch ? "word-search-current" : "",
      ]
        .filter(Boolean)
        .join(" ");

      return (
        <div
          ref={ref}
          className={classNames}
          onClick={onClick}
          onContextMenu={handleContextMenu}
        >
          {word.isEdit ? <div>[...]</div> : <div>{word.text}</div>}
        </div>
      );
    }
  ),
  (prevProps, nextProps) => {
    return (
      prevProps.isCurrentWord === nextProps.isCurrentWord &&
      prevProps.isSearchMatch === nextProps.isSearchMatch &&
      prevProps.isCurrentSearchMatch === nextProps.isCurrentSearchMatch &&
      prevProps.word.isDeleted === nextProps.word.isDeleted &&
      prevProps.word.isEdit === nextProps.word.isEdit &&
      prevProps.word.text === nextProps.word.text
    );
  }
);

export default Word;
