import React, { useRef, useEffect } from 'react';
import './MessageContextMenu.css';

interface MessageContextMenuProps {
  x: number;
  y: number;
  isOwn: boolean;
  isStarred?: boolean;
  isPinned?: boolean;
  onClose: () => void;
  onReply: () => void;
  onEdit?: () => void;
  onCopy: () => void;
  onForward: () => void;
  onStar?: () => void;
  onPin?: () => void;
  onInfo?: () => void;
  onDelete: () => void;
  onDeleteForEveryone?: () => void;
  onSelect: () => void;
}

export default function MessageContextMenu({
  x, y, isOwn, isStarred, isPinned, onClose, onReply, onEdit, onCopy, onForward, onStar, onPin, onInfo, onDelete, onDeleteForEveryone, onSelect
}: MessageContextMenuProps) {
  const ref = useRef<HTMLDivElement>(null);
  const [menuStyle, setMenuStyle] = React.useState<React.CSSProperties>({ opacity: 0 });

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    const handleClickOutside = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        onClose();
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [onClose]);

  React.useLayoutEffect(() => {
    if (!ref.current) return;
    const menuEl = ref.current.querySelector('.menu-options') as HTMLElement;
    if (!menuEl) return;

    const menuRect = menuEl.getBoundingClientRect();
    const safeMargin = 10;

    let menuLeft = x;
    if (menuLeft + menuRect.width > window.innerWidth - safeMargin) {
      menuLeft = window.innerWidth - menuRect.width - safeMargin;
    }
    if (menuLeft < safeMargin) menuLeft = safeMargin;

    let menuTop = y;
    if (menuTop + menuRect.height > window.innerHeight - safeMargin) {
      menuTop = window.innerHeight - menuRect.height - safeMargin;
    }

    setMenuStyle({
      position: 'fixed',
      top: `${menuTop}px`,
      left: `${menuLeft}px`,
      opacity: 1
    });
  }, [x, y]);

  return (
    <div className="message-context-menu" ref={ref} style={{ position: 'fixed', top: 0, left: 0, zIndex: 1000, pointerEvents: 'none' }}>
      <div className="menu-options" style={{ ...menuStyle, pointerEvents: 'auto' }}>
        <button className="menu-item" aria-label="Reply" onClick={() => { onReply(); onClose(); }}>
          ↩️ Reply
        </button>
        {isOwn && onEdit && (
          <button className="menu-item" aria-label="Edit" onClick={() => { onEdit(); onClose(); }}>
            ✏️ Edit
          </button>
        )}
        <button className="menu-item" aria-label="Copy" onClick={() => { onCopy(); onClose(); }}>
          📋 Copy
        </button>
        {onStar && (
          <button className="menu-item" aria-label="Star" onClick={() => { onStar(); onClose(); }}>
            {isStarred ? '⭐ Unstar' : '☆ Star'}
          </button>
        )}
        {onPin && (
          <button className="menu-item" aria-label="Pin" onClick={() => { onPin(); onClose(); }}>
            {isPinned ? '📌 Unpin' : '📌 Pin'}
          </button>
        )}
        <button className="menu-item" aria-label="Forward" onClick={() => { onForward(); onClose(); }}>
          ↗️ Forward
        </button>
        {onInfo && (
          <button className="menu-item" aria-label="Message info" onClick={() => { onInfo(); onClose(); }}>
            ℹ️ Message Info
          </button>
        )}
        <button className="menu-item" aria-label="Select" onClick={() => { onSelect(); onClose(); }}>
          ☑️ Select
        </button>
        <div className="menu-divider" />
        <button className="menu-item danger" aria-label="Delete for me" onClick={() => { onDelete(); onClose(); }}>
          🗑️ Delete for me
        </button>
        {onDeleteForEveryone && (
          <button className="menu-item danger" aria-label="Delete for everyone" onClick={() => { onDeleteForEveryone(); onClose(); }}>
            🚫 Delete for everyone
          </button>
        )}
      </div>
    </div>
  );
}
