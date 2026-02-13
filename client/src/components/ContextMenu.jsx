import React, { useEffect, useRef } from "react";
import "./css/ContextMenu.css";

const MENU_WIDTH = 130;
const MENU_HEIGHT = 80;

export default function ContextMenu({
  position,
  word,
  onDelete,
  onRestore,
  onClose,
  onMark,
}) {
  const menuRef = useRef(null);

  useEffect(() => {
    const handleClickOutside = (e) => {
      if (menuRef.current && !menuRef.current.contains(e.target)) {
        onClose();
      }
    };

    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [onClose]);

  if (!position || !word) return null;

  // 컨테이너(패널) 크기 가져오기
  const containerWidth = document.documentElement.clientWidth;
  const containerHeight = document.documentElement.clientHeight;

  let adjustedX = position.x;
  let adjustedY = position.y;

  // 오른쪽 경계 체크
  if (position.x + MENU_WIDTH > containerWidth) {
    adjustedX = position.x - MENU_WIDTH;
  }

  // 아래쪽 경계 체크
  if (position.y + MENU_HEIGHT > containerHeight) {
    adjustedY = position.y - MENU_HEIGHT;
  }

  // 음수 방지
  if (adjustedX < 0) adjustedX = 0;
  if (adjustedY < 0) adjustedY = 0;

  return (
    <div
      ref={menuRef}
      className="context-menu"
      style={{
        left: adjustedX,
        top: adjustedY,
      }}
    >
      {!word.isDeleted ? (
        <div className="context-menu-item" onClick={onDelete}>
          삭제
        </div>
      ) : (
        <div className="context-menu-item" onClick={onRestore}>
          삭제 취소
        </div>
      )}

      <div className="context-menu-item" onClick={onMark}>
        범위표시
      </div>
    </div>
  );
}
