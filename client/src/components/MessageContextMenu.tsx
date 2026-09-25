import React, { useRef, useEffect } from 'react';
import './MessageContextMenu.css';
import {
  IconReply,
  IconEdit,
  IconCopy,
  IconStar,
  IconStarOutline,
  IconPin,
  IconForward,
  IconInfo,
  IconCheckSquare,
  IconTrash,
  IconBan
} from './common/Icons';

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
          <IconReply size={16} />
          <span>Reply</span>
        </button>
        {isOwn && onEdit && (
          <button className="menu-item" aria-label="Edit" onClick={() => { onEdit(); onClose(); }}>
            <IconEdit size={16} />
            <span>Edit</span>
          </button>
        )}
        <button className="menu-item" aria-label="Copy" onClick={() => { onCopy(); onClose(); }}>
          <IconCopy size={16} />
          <span>Copy</span>
        </button>
        {onStar && (
          <button className="menu-item" aria-label={isStarred ? 'Unstar' : 'Star'} onClick={() => { onStar(); onClose(); }}>
            {isStarred ? <IconStar size={16} color="#FBBF24" /> : <IconStarOutline size={16} />}
            <span>{isStarred ? 'Unstar' : 'Star'}</span>
          </button>
        )}
        {onPin && (
          <button className="menu-item" aria-label={isPinned ? 'Unpin' : 'Pin'} onClick={() => { onPin(); onClose(); }}>
            <IconPin size={16} color={isPinned ? 'var(--wibby-primary)' : 'currentColor'} />
            <span>{isPinned ? 'Unpin' : 'Pin'}</span>
          </button>
        )}
        <button className="menu-item" aria-label="Forward" onClick={() => { onForward(); onClose(); }}>
          <IconForward size={16} />
          <span>Forward</span>
        </button>
        {onInfo && (
          <button className="menu-item" aria-label="Message info" onClick={() => { onInfo(); onClose(); }}>
            <IconInfo size={16} />
            <span>Message Info</span>
          </button>
        )}
        <button className="menu-item" aria-label="Select" onClick={() => { onSelect(); onClose(); }}>
          <IconCheckSquare size={16} />
          <span>Select</span>
        </button>
        <div className="menu-divider" />
        <button className="menu-item danger" aria-label="Delete for me" onClick={() => { onDelete(); onClose(); }}>
          <IconTrash size={16} color="#ef4444" />
          <span>Delete for me</span>
        </button>
        {onDeleteForEveryone && (
          <button className="menu-item danger" aria-label="Delete for everyone" onClick={() => { onDeleteForEveryone(); onClose(); }}>
            <IconBan size={16} color="#ef4444" />
            <span>Delete for everyone</span>
          </button>
        )}
      </div>
    </div>
  );
}
