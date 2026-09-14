import React, { useState, useMemo, useRef, useEffect, useLayoutEffect } from 'react';
import { createPortal } from 'react-dom';
import { emojiCategories, searchEmojis } from '../utils/emojis';
import './EmojiPicker.css';

interface EmojiPickerProps {
  onSelect: (emoji: string) => void;
  onSelectSticker?: (sticker: { emoji: string; url?: string; name: string }) => void;
  onClose: () => void;
  anchorRect?: DOMRect;
  isOwn?: boolean;
  style?: React.CSSProperties;
}

const STICKERS = [
  { emoji: '🐱', name: 'Cat Wave', label: 'Waving Cat' },
  { emoji: '💖', name: 'Sparkle Heart', label: 'Love' },
  { emoji: '🎉', name: 'Party Popper', label: 'Celebrate' },
  { emoji: '🔥', name: 'Fire', label: 'Lit' },
  { emoji: '🥺', name: 'Pleading', label: 'Please' },
  { emoji: '✨', name: 'Sparkles', label: 'Magic' },
  { emoji: '🚀', name: 'Rocket', label: 'To the Moon' },
  { emoji: '🍕', name: 'Pizza', label: 'Food time' },
  { emoji: '☕', name: 'Coffee', label: 'Coffee break' },
  { emoji: '🧸', name: 'Teddy Bear', label: 'Cuddle' },
  { emoji: '🌈', name: 'Rainbow', label: 'Good vibes' },
  { emoji: '💯', name: '100', label: 'Perfect' }
];

const GIFS = [
  { title: 'Celebrate', url: 'https://media.giphy.com/media/artj92V8o75VPL7AeQ/giphy.gif' },
  { title: 'Thumbs Up', url: 'https://media.giphy.com/media/111ebonMs90YLu/giphy.gif' },
  { title: 'Dance', url: 'https://media.giphy.com/media/blSTtZehjAZ8I/giphy.gif' },
  { title: 'Laugh', url: 'https://media.giphy.com/media/10JhviFuU2gWD6/giphy.gif' },
  { title: 'Hug', url: 'https://media.giphy.com/media/od5H3PmEG5EVq/giphy.gif' },
  { title: 'Heart', url: 'https://media.giphy.com/media/M90mJvfWfd5mbUuULX/giphy.gif' }
];

export default function EmojiPicker({ onSelect, onSelectSticker, onClose, anchorRect, isOwn, style }: EmojiPickerProps) {
  const [tab, setTab] = useState<'emoji' | 'sticker' | 'gif'>('emoji');
  const [search, setSearch] = useState('');
  const [activeCategory, setActiveCategory] = useState(emojiCategories[0].id);
  const [position, setPosition] = useState<{ top: number, left: number, maxHeight: number } | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const gridContainerRef = useRef<HTMLDivElement>(null);
  
  const searchResults = useMemo(() => searchEmojis(search), [search]);

  // Handle escape key
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopPropagation();
        onClose();
      }
    };
    
    document.addEventListener('keydown', handleKeyDown, true);
    return () => {
      document.removeEventListener('keydown', handleKeyDown, true);
    };
  }, [onClose]);

  // Calculate position avoiding viewport collision
  useLayoutEffect(() => {
    if (!anchorRect || !containerRef.current) return;
    
    const pickerRect = containerRef.current.getBoundingClientRect();
    const SAFE_MARGIN = 12;
    const pickerWidth = pickerRect.width;
    const preferredHeight = pickerRect.height;
    
    let top = 0;
    let maxHeight = window.innerHeight - SAFE_MARGIN * 2;
    
    const availableHeightBelow = window.innerHeight - anchorRect.bottom - SAFE_MARGIN;
    const availableHeightAbove = anchorRect.top - SAFE_MARGIN;
    
    if (preferredHeight <= availableHeightBelow) {
      top = anchorRect.bottom + 8;
    } else if (preferredHeight <= availableHeightAbove) {
      top = anchorRect.top - preferredHeight - 8;
    } else {
      top = SAFE_MARGIN;
    }
    
    if (top < SAFE_MARGIN) top = SAFE_MARGIN;
    if (top + preferredHeight > window.innerHeight - SAFE_MARGIN) {
      top = Math.max(SAFE_MARGIN, window.innerHeight - preferredHeight - SAFE_MARGIN);
      maxHeight = window.innerHeight - top - SAFE_MARGIN;
    }
    
    let left = 0;
    if (isOwn) {
      left = anchorRect.right - pickerWidth;
    } else {
      left = anchorRect.left;
    }
    
    if (left + pickerWidth > window.innerWidth - SAFE_MARGIN) {
      left = window.innerWidth - pickerWidth - SAFE_MARGIN;
    }
    if (left < SAFE_MARGIN) {
      left = SAFE_MARGIN;
    }
    
    setPosition({ left, top, maxHeight });
  }, [anchorRect, isOwn]);

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        onClose();
      }
    };
    
    document.addEventListener('mousedown', handleClickOutside);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [onClose]);

  const scrollToCategory = (categoryId: string) => {
    setActiveCategory(categoryId);
    const element = document.getElementById(`category-${categoryId}`);
    if (element && gridContainerRef.current) {
      const containerTop = gridContainerRef.current.getBoundingClientRect().top;
      const elementTop = element.getBoundingClientRect().top;
      gridContainerRef.current.scrollTop += (elementTop - containerTop);
    }
  };

  const content = (
    <div 
      className="emoji-picker-container" 
      style={{ 
        ...style, 
        ...(position ? { 
          position: 'fixed', 
          top: position.top, 
          left: position.left,
          maxHeight: position.maxHeight,
          opacity: 1,
          zIndex: 10000 
        } : { 
          position: 'fixed',
          top: anchorRect ? anchorRect.bottom : 0,
          left: anchorRect ? anchorRect.left : 0,
          opacity: 0,
          pointerEvents: 'none'
        }) 
      }} 
      ref={containerRef}
    >
      {/* Top Tab Switcher */}
      <div className="emoji-picker-top-tabs">
        <button
          className={`top-tab-btn ${tab === 'emoji' ? 'active' : ''}`}
          onClick={() => setTab('emoji')}
        >
          😊 Emojis
        </button>
        <button
          className={`top-tab-btn ${tab === 'sticker' ? 'active' : ''}`}
          onClick={() => setTab('sticker')}
        >
          🎨 Stickers
        </button>
        <button
          className={`top-tab-btn ${tab === 'gif' ? 'active' : ''}`}
          onClick={() => setTab('gif')}
        >
          🎬 GIFs
        </button>
      </div>

      {tab === 'emoji' && (
        <>
          <div className="emoji-search-bar">
            <span className="search-icon">🔍</span>
            <input 
              type="text" 
              placeholder="Search emoji" 
              value={search}
              onChange={e => setSearch(e.target.value)}
              autoFocus
            />
            {search && (
              <button className="search-clear-btn" onClick={() => setSearch('')} aria-label="Clear search">✕</button>
            )}
          </div>
          
          {!search && (
            <div className="emoji-categories-nav">
              {emojiCategories.map(cat => (
                <button
                  key={cat.id}
                  className={`category-btn ${activeCategory === cat.id ? 'active' : ''}`}
                  onClick={() => scrollToCategory(cat.id)}
                  aria-label={cat.name}
                  title={cat.name}
                >
                  <span className="category-btn-icon">{cat.icon}</span>
                  <span className="category-btn-name">{cat.name.split(' ')[0]}</span>
                </button>
              ))}
            </div>
          )}

          <div className="emoji-grid-container" ref={gridContainerRef}>
            {search ? (
              <div className="emoji-search-results">
                {searchResults.length > 0 ? (
                  <div className="emoji-grid">
                    {searchResults.map(emoji => (
                      <button key={emoji} className="emoji-btn" onClick={() => { onSelect(emoji); onClose(); }}>
                        {emoji}
                      </button>
                    ))}
                  </div>
                ) : (
                  <div className="no-emojis">No emojis found</div>
                )}
              </div>
            ) : (
              emojiCategories.map(cat => (
                <div key={cat.id} id={`category-${cat.id}`} className="emoji-category-section">
                  <div className="category-header">{cat.name}</div>
                  <div className="emoji-grid">
                    {cat.emojis.map(emoji => (
                      <button key={emoji} className="emoji-btn" onClick={() => { onSelect(emoji); onClose(); }}>
                        {emoji}
                      </button>
                    ))}
                  </div>
                </div>
              ))
            )}
          </div>
        </>
      )}

      {tab === 'sticker' && (
        <div className="stickers-grid-container">
          <div className="stickers-grid">
            {STICKERS.map(s => (
              <button
                key={s.name}
                className="sticker-item-btn"
                onClick={() => {
                  if (onSelectSticker) {
                    onSelectSticker(s);
                  } else {
                    onSelect(s.emoji);
                  }
                  onClose();
                }}
              >
                <span className="sticker-emoji">{s.emoji}</span>
                <span className="sticker-name">{s.label}</span>
              </button>
            ))}
          </div>
        </div>
      )}

      {tab === 'gif' && (
        <div className="gifs-grid-container">
          <div className="gifs-grid">
            {GIFS.map(g => (
              <div
                key={g.title}
                className="gif-item-wrap"
                onClick={() => {
                  onSelect(g.url);
                  onClose();
                }}
              >
                <img src={g.url} alt={g.title} className="gif-img" loading="lazy" />
                <span className="gif-title-tag">{g.title}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );

  return createPortal(content, document.body);
}
