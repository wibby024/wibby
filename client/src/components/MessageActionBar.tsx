import React, { useRef, useLayoutEffect, useState } from 'react';
import './MessageActionBar.css';

interface MessageActionBarProps {
  isOwn: boolean;
  onReact: (emoji: string) => void;
  onContextMenu: (e: React.MouseEvent | React.TouchEvent) => void;
  onEmojiPicker: (e: React.MouseEvent) => void;
}

export default function MessageActionBar({ isOwn, onReact, onContextMenu, onEmojiPicker }: MessageActionBarProps) {
  const ref = useRef<HTMLDivElement>(null);
  const [style, setStyle] = useState<React.CSSProperties>({ opacity: 0 });

  useLayoutEffect(() => {
    if (!ref.current) return;
    const parent = ref.current.closest('.message-container') || ref.current.parentElement;
    if (!parent) return;

    const barRect = ref.current.getBoundingClientRect();
    const parentRect = parent.getBoundingClientRect();
    
    // Default positioning relative to the message-wrapper
    let top = -barRect.height + 12; // Slightly overlap top of message
    
    // If outgoing, place to the left of the message. If incoming, place to the right.
    let left = isOwn ? -barRect.width + 40 : parentRect.width - 40;

    // Global collision logic
    const globalTop = parentRect.top + top;
    const globalLeft = parentRect.left + left;

    // Shift down if clipping top of screen
    if (globalTop < 12) {
      top = parentRect.height + 4;
    }

    // Shift horizontally if clipping screen edges
    if (globalLeft < 12) {
      left = 12 - parentRect.left;
    } else if (globalLeft + barRect.width > window.innerWidth - 12) {
      left = window.innerWidth - barRect.width - 12 - parentRect.left;
    }

    setStyle({
      top: `${top}px`,
      left: `${left}px`,
      opacity: 1,
      transform: 'scale(1)'
    });
  }, [isOwn]);

  return (
    <div className={`message-action-bar ${isOwn ? 'outgoing' : 'incoming'}`} ref={ref} style={style}>
      <div className="action-bar-reactions">
        {['👍', '❤️', '😂', '😮', '😢', '🔥'].map(emoji => (
          <button 
            key={emoji} 
            className="action-btn reaction-btn" 
            onClick={() => onReact(emoji)} 
            aria-label={`React with ${emoji}`}
          >
            {emoji}
          </button>
        ))}
        <button className="action-btn plus-btn" onClick={onEmojiPicker} aria-label="Open emoji picker">＋</button>
      </div>
      <div className="action-bar-divider" />
      <button className="action-btn context-menu-btn" onClick={onContextMenu} aria-label="More message actions">⋯</button>
    </div>
  );
}
