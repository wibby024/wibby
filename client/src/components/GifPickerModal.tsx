import React, { useState, useEffect, useRef, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { auth } from '../lib/firebase';
import { IconClose, IconGif } from './common/Icons';
import './GifPickerModal.css';

export interface GifItem {
  id: string;
  title: string;
  url: string;
  previewUrl: string;
  width?: number;
  height?: number;
  category?: string;
}

export interface SelectedGifPayload {
  url: string;
  title: string;
  caption?: string;
  width?: number;
  height?: number;
}

interface GifPickerModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSelectGif: (gif: SelectedGifPayload) => void;
}

export default function GifPickerModal({
  isOpen,
  onClose,
  onSelectGif
}: GifPickerModalProps) {
  const [query, setQuery] = useState('');
  const [activeCategory, setActiveCategory] = useState('trending');
  const [categories, setCategories] = useState<{ id: string; name: string; icon: string }[]>([
    { id: 'trending', name: 'Trending', icon: '🔥' },
    { id: 'reactions', name: 'Reactions', icon: '👀' },
    { id: 'happy', name: 'Happy', icon: '😄' },
    { id: 'love', name: 'Love', icon: '❤️' },
    { id: 'celebrate', name: 'Celebrate', icon: '🎉' },
    { id: 'dance', name: 'Dance', icon: '💃' },
    { id: 'funny', name: 'Funny', icon: '😂' },
    { id: 'cats', name: 'Cats & Pets', icon: '🐱' }
  ]);
  const [gifs, setGifs] = useState<GifItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Preview state (WhatsApp style)
  const [previewGif, setPreviewGif] = useState<GifItem | null>(null);
  const [caption, setCaption] = useState('');

  const searchDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);

  // Fetch GIFs from backend
  const fetchGifs = useCallback(async (searchQuery: string, cat: string) => {
    setLoading(true);
    setError(null);
    try {
      const user = auth.currentUser;
      const token = user ? await user.getIdToken() : '';
      const baseUrl = import.meta.env.VITE_API_URL || 'http://localhost:3000';

      let endpoint = '';
      if (searchQuery.trim().length > 0) {
        endpoint = `${baseUrl}/api/gifs/search?q=${encodeURIComponent(searchQuery.trim())}`;
      } else {
        endpoint = `${baseUrl}/api/gifs/trending?category=${encodeURIComponent(cat)}`;
      }

      const res = await fetch(endpoint, {
        headers: {
          'Authorization': `Bearer ${token}`
        }
      });

      if (!res.ok) {
        throw new Error('Failed to load GIFs');
      }

      const data = await res.json();
      if (Array.isArray(data.results)) {
        setGifs(data.results);
      } else {
        setGifs([]);
      }
      if (Array.isArray(data.categories) && data.categories.length > 0) {
        setCategories(data.categories);
      }
    } catch (err: any) {
      console.error('[WIBBY GIF] Fetch error:', err);
      setError('Could not load GIFs. Check connection.');
    } finally {
      setLoading(false);
    }
  }, []);

  // Initial load
  useEffect(() => {
    if (isOpen) {
      fetchGifs('', activeCategory);
      setTimeout(() => {
        searchInputRef.current?.focus();
      }, 100);
    } else {
      setPreviewGif(null);
      setCaption('');
      setQuery('');
    }
  }, [isOpen, activeCategory, fetchGifs]);

  // Handle Search Input Change with Debounce
  const handleQueryChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value;
    setQuery(val);

    if (searchDebounceRef.current) {
      clearTimeout(searchDebounceRef.current);
    }

    searchDebounceRef.current = setTimeout(() => {
      fetchGifs(val, activeCategory);
    }, 350);
  };

  const handleClearSearch = () => {
    setQuery('');
    fetchGifs('', activeCategory);
    searchInputRef.current?.focus();
  };

  // Handle Category Click
  const handleSelectCategory = (catId: string) => {
    setActiveCategory(catId);
    setQuery('');
    fetchGifs('', catId);
  };

  // Keyboard accessibility
  useEffect(() => {
    if (!isOpen) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        if (previewGif) {
          setPreviewGif(null);
        } else {
          onClose();
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, previewGif, onClose]);

  // Handle Send from Preview
  const handleSend = () => {
    if (!previewGif) return;
    onSelectGif({
      url: previewGif.url,
      title: previewGif.title,
      caption: caption.trim() || undefined,
      width: previewGif.width,
      height: previewGif.height
    });
    setPreviewGif(null);
    setCaption('');
    onClose();
  };

  if (!isOpen) return null;

  const content = (
    <div className="gif-modal-backdrop" onClick={onClose} role="dialog" aria-modal="true">
      <div 
        className={`gif-modal-card ${previewGif ? 'in-preview' : ''}`} 
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div className="gif-modal-header">
          <div className="gif-modal-title-row">
            <div className="gif-modal-badge">
              <IconGif size={20} color="currentColor" />
            </div>
            <h3 className="gif-modal-title">
              {previewGif ? 'Preview & Send GIF' : 'Send a GIF'}
            </h3>
          </div>
          <button 
            className="gif-modal-close-btn" 
            onClick={previewGif ? () => setPreviewGif(null) : onClose}
            aria-label="Close GIF picker"
            title="Close (Esc)"
          >
            <IconClose size={18} />
          </button>
        </div>

        {/* WhatsApp-Style GIF Preview Screen */}
        {previewGif ? (
          <div className="gif-preview-view">
            <div className="gif-preview-media-container">
              <img 
                src={previewGif.url} 
                alt={previewGif.title} 
                className="gif-preview-large-img" 
              />
            </div>

            <div className="gif-preview-caption-bar">
              <input
                type="text"
                className="gif-caption-input"
                placeholder="Add a caption... (optional)"
                value={caption}
                onChange={e => setCaption(e.target.value)}
                onKeyDown={e => {
                  if (e.key === 'Enter') {
                    e.preventDefault();
                    handleSend();
                  }
                }}
                autoFocus
                maxLength={300}
              />
              <div className="gif-preview-actions">
                <button 
                  className="gif-preview-back-btn" 
                  onClick={() => setPreviewGif(null)}
                  type="button"
                >
                  Back
                </button>
                <button 
                  className="gif-preview-send-btn" 
                  onClick={handleSend}
                  type="button"
                  aria-label="Send GIF"
                >
                  <span>Send</span>
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <line x1="22" y1="2" x2="11" y2="13" />
                    <polygon points="22 2 15 22 11 13 2 9 22 2" />
                  </svg>
                </button>
              </div>
            </div>
          </div>
        ) : (
          /* Browser / Search / Grid View */
          <div className="gif-browser-view">
            {/* Search Bar */}
            <div className="gif-search-container">
              <div className="gif-search-icon">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <circle cx="11" cy="11" r="8" />
                  <line x1="21" y1="21" x2="16.65" y2="16.65" />
                </svg>
              </div>
              <input
                ref={searchInputRef}
                type="text"
                className="gif-search-input"
                placeholder="Search GIFs & reactions..."
                value={query}
                onChange={handleQueryChange}
                aria-label="Search GIFs"
              />
              {query && (
                <button 
                  className="gif-search-clear-btn" 
                  onClick={handleClearSearch}
                  aria-label="Clear search"
                >
                  <IconClose size={14} />
                </button>
              )}
            </div>

            {/* Category Chips */}
            <div className="gif-categories-bar">
              {categories.map(cat => (
                <button
                  key={cat.id}
                  className={`gif-cat-chip ${activeCategory === cat.id && !query ? 'active' : ''}`}
                  onClick={() => handleSelectCategory(cat.id)}
                  type="button"
                >
                  <span className="gif-cat-icon">{cat.icon}</span>
                  <span className="gif-cat-name">{cat.name}</span>
                </button>
              ))}
            </div>

            {/* Loading / Error / Empty / Grid */}
            <div className="gif-grid-scroll-area">
              {loading && gifs.length === 0 ? (
                <div className="gif-skeleton-grid">
                  {[...Array(6)].map((_, i) => (
                    <div key={i} className="gif-skeleton-card" />
                  ))}
                </div>
              ) : error ? (
                <div className="gif-error-state">
                  <p>{error}</p>
                  <button 
                    className="gif-retry-btn" 
                    onClick={() => fetchGifs(query, activeCategory)}
                  >
                    Retry
                  </button>
                </div>
              ) : gifs.length === 0 ? (
                <div className="gif-empty-state">
                  <div className="gif-empty-icon">🔍</div>
                  <p className="gif-empty-text">No GIFs found for "{query}"</p>
                  <button 
                    className="gif-retry-btn" 
                    onClick={handleClearSearch}
                  >
                    Show Trending
                  </button>
                </div>
              ) : (
                <div className="gif-grid">
                  {gifs.map(item => (
                    <div 
                      key={item.id} 
                      className="gif-card"
                      onClick={() => setPreviewGif(item)}
                      role="button"
                      tabIndex={0}
                      aria-label={`Select GIF ${item.title}`}
                      onKeyDown={e => {
                        if (e.key === 'Enter' || e.key === ' ') {
                          e.preventDefault();
                          setPreviewGif(item);
                        }
                      }}
                    >
                      <img 
                        src={item.previewUrl || item.url} 
                        alt={item.title} 
                        className="gif-card-image"
                        loading="lazy" 
                      />
                      <span className="gif-card-overlay-title">{item.title}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );

  return createPortal(content, document.body);
}
