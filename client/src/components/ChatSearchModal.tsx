import { useState, useEffect } from 'react';
import { useAuth } from '../context/AuthContext';
import type { Message } from '../types/chat';
import { formatLastSeen } from '../utils/time';
import './ChatSearchModal.css';

interface ChatSearchModalProps {
  isOpen: boolean;
  conversationId: string;
  onClose: () => void;
  onSelectMessage: (messageId: string) => void;
}

export default function ChatSearchModal({
  isOpen,
  conversationId,
  onClose,
  onSelectMessage
}: ChatSearchModalProps) {
  const { user } = useAuth();
  const [query, setQuery] = useState('');
  const [filterType, setFilterType] = useState<'all' | 'media' | 'files' | 'links'>('all');
  const [results, setResults] = useState<Message[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!isOpen || !conversationId || !user) return;

    const delayDebounce = setTimeout(async () => {
      setLoading(true);
      try {
        const token = await user.getIdToken();
        let url = `${import.meta.env.VITE_API_URL || 'http://localhost:3000'}/api/conversations/${conversationId}/messages/search?`;
        if (query.trim()) url += `q=${encodeURIComponent(query.trim())}&`;
        if (filterType !== 'all') url += `type=${filterType}&`;

        const res = await fetch(url, {
          headers: { 'Authorization': `Bearer ${token}` }
        });
        if (res.ok) {
          const data = await res.json();
          setResults(data.messages || []);
        }
      } catch (err) {
        console.error('Search error:', err);
      } finally {
        setLoading(false);
      }
    }, 250);

    return () => clearTimeout(delayDebounce);
  }, [isOpen, query, filterType, conversationId, user]);


  if (!isOpen) return null;

  const highlightMatch = (text: string, q: string) => {
    if (!q.trim() || !text) return text;
    const regex = new RegExp(`(${q.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')})`, 'gi');
    const parts = text.split(regex);
    return parts.map((part, i) =>
      regex.test(part) ? <mark key={i} className="search-highlight">{part}</mark> : part
    );
  };

  return (
    <div className="search-modal-overlay" onClick={onClose} role="dialog" aria-modal="true" aria-label="Search Messages">
      <div className="search-modal-card" onClick={e => e.stopPropagation()}>
        {/* Search Header */}
        <div className="search-modal-header">
          <div className="search-input-box">
            <span className="search-icon">🔍</span>
            <input
              type="text"
              className="search-text-input"
              placeholder="Search messages, links, files..."
              value={query}
              onChange={e => setQuery(e.target.value)}
              autoFocus
            />
            {query && (
              <button className="search-clear-btn" onClick={() => setQuery('')}>✕</button>
            )}
          </div>
          <button className="search-modal-close" onClick={onClose} aria-label="Close">Cancel</button>
        </div>

        {/* Filter Tabs */}
        <div className="search-filter-chips">
          <button
            className={`filter-chip ${filterType === 'all' ? 'active' : ''}`}
            onClick={() => setFilterType('all')}
          >
            All
          </button>
          <button
            className={`filter-chip ${filterType === 'media' ? 'active' : ''}`}
            onClick={() => setFilterType('media')}
          >
            🖼️ Media
          </button>
          <button
            className={`filter-chip ${filterType === 'files' ? 'active' : ''}`}
            onClick={() => setFilterType('files')}
          >
            📄 Files
          </button>
          <button
            className={`filter-chip ${filterType === 'links' ? 'active' : ''}`}
            onClick={() => setFilterType('links')}
          >
            🔗 Links
          </button>
        </div>

        {/* Search Results List */}
        <div className="search-results-container">
          {loading ? (
            <div className="search-loading-state">
              <div className="search-spinner" />
              <span>Searching…</span>
            </div>
          ) : results.length > 0 ? (
            <div className="search-results-list">
              {results.map(msg => (
                <div
                  key={msg._id}
                  className="search-result-row"
                  onClick={() => {
                    onSelectMessage(msg._id);
                    onClose();
                  }}
                >
                  <div className="result-type-icon">
                    {msg.type === 'image' ? '🖼️' : msg.type === 'video' ? '🎥' : msg.type === 'file' ? '📄' : msg.type === 'audio' ? '🎙️' : '💬'}
                  </div>
                  <div className="result-content-wrap">
                    <div className="result-top-line">
                      <span className="result-sender">{msg.senderId ? 'Message' : 'You'}</span>
                      <span className="result-time">{formatLastSeen(msg.createdAt)}</span>
                    </div>
                    <p className="result-snippet">
                      {highlightMatch(msg.text || msg.fileName || `[${msg.type}]`, query)}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="search-empty-state">
              <span>{query ? 'No matching messages found' : 'Type to search in this conversation'}</span>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
