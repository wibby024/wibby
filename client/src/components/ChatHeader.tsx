import { useState, useRef, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { useSocket } from '../context/SocketContext';
import { useAuth } from '../context/AuthContext';
import { useCall } from '../context/CallContext';
import { formatLastSeen } from '../utils/time';
import { resolvePartnerName } from '../utils/partnerName';
import './ChatHeader.css';

interface ChatHeaderProps {
  onMenuClick: () => void;
  partner?: {
    firebaseUid?: string;
    display_name?: string;
    displayName?: string;
    username?: string;
    email?: string;
    avatarUrl?: string;
    online?: boolean;
    lastSeen?: string;
  };
  conversationId?: string;
  onOpenSearch?: () => void;
  onOpenInfoDrawer?: () => void;
  onOpenTogether?: () => void;
  onOpenGame?: () => void;
  onClearChat?: () => void;
}

export default function ChatHeader({ 
  onMenuClick, 
  partner, 
  conversationId,
  onOpenSearch,
  onOpenInfoDrawer,
  onOpenTogether,
  onOpenGame,
  onClearChat
}: ChatHeaderProps) {
  const { socket } = useSocket();
  const { user } = useAuth();
  const { startCall, callState } = useCall();
  const [isTyping, setIsTyping] = useState(false);
  const [showClearConfirm, setShowClearConfirm] = useState(false);
  const typingTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const name = resolvePartnerName(partner);
  const initial = name.charAt(0).toUpperCase();

  useEffect(() => {
    if (!socket || !conversationId) return;

    setIsTyping(false);
    if (typingTimeoutRef.current) {
      clearTimeout(typingTimeoutRef.current);
      typingTimeoutRef.current = null;
    }

    const handleTypingStart = (data: { conversationId: string, userId: string }) => {
      if (data.conversationId !== conversationId) return;
      if (data.userId === user?.uid) return; // Do not show for self

      setIsTyping(true);

      // Inactivity timeout safety fallback (3.5s)
      if (typingTimeoutRef.current) {
        clearTimeout(typingTimeoutRef.current);
      }
      typingTimeoutRef.current = setTimeout(() => {
        setIsTyping(false);
        typingTimeoutRef.current = null;
      }, 3500);
    };

    const handleTypingStop = (data: { conversationId: string, userId: string }) => {
      if (data.conversationId !== conversationId) return;
      if (data.userId === user?.uid) return;

      setIsTyping(false);
      if (typingTimeoutRef.current) {
        clearTimeout(typingTimeoutRef.current);
        typingTimeoutRef.current = null;
      }
    };

    const handleNewMessage = () => {
      setIsTyping(false);
      if (typingTimeoutRef.current) {
        clearTimeout(typingTimeoutRef.current);
        typingTimeoutRef.current = null;
      }
    };

    socket.on('typing:start', handleTypingStart);
    socket.on('typing:stop', handleTypingStop);
    socket.on('new_message', handleNewMessage);

    return () => {
      socket.off('typing:start', handleTypingStart);
      socket.off('typing:stop', handleTypingStop);
      socket.off('new_message', handleNewMessage);
      if (typingTimeoutRef.current) {
        clearTimeout(typingTimeoutRef.current);
        typingTimeoutRef.current = null;
      }
    };
  }, [socket, conversationId, user?.uid]);

  const [toastMessage, setToastMessage] = useState<string | null>(null);
  const [showMoreMenu, setShowMoreMenu] = useState(false);
  const moreMenuRef = useRef<HTMLDivElement>(null);

  const showToast = (msg: string) => {
    setToastMessage(msg);
    setTimeout(() => setToastMessage(null), 2500);
  };

  useEffect(() => {
    if (!showMoreMenu && !showClearConfirm) return;
    const handleClickOutside = (e: MouseEvent) => {
      if (moreMenuRef.current && !moreMenuRef.current.contains(e.target as Node)) {
        setShowMoreMenu(false);
      }
    };
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setShowMoreMenu(false);
        setShowClearConfirm(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [showMoreMenu, showClearConfirm]);

  return (
    <header className="chat-header">
      <div className="chat-header-left">
        {/* Mobile menu button */}
        <button className="chat-header-menu" onClick={onMenuClick} aria-label="Open sidebar" title="Open sidebar">
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <line x1="3" y1="6" x2="21" y2="6" />
            <line x1="3" y1="12" x2="17" y2="12" />
            <line x1="3" y1="18" x2="13" y2="18" />
          </svg>
        </button>

        <div 
          className="chat-header-user" 
          onClick={onOpenInfoDrawer}
          role="button"
          tabIndex={0}
          style={{ cursor: 'pointer' }}
          title="View profile & shared media"
        >
          <div className="chat-header-avatar" style={{ background: 'linear-gradient(135deg, #A78BFA, #7C3AED)' }}>
            <span>{initial}</span>
          </div>
          <div className="chat-header-info">
            <h2 className="chat-header-name">{name}</h2>
            <div 
              className={`chat-header-status ${isTyping ? 'is-typing' : partner?.online ? 'is-online' : 'is-offline'}`}
              aria-live="polite"
            >
              {isTyping ? (
                <div className="typing-status" aria-label={`${name} is typing`}>
                  <div className="typing-dots-header">
                    <span className="dot dot-1" />
                    <span className="dot dot-2" />
                    <span className="dot dot-3" />
                  </div>
                  <span className="typing-text">Typing...</span>
                </div>
              ) : partner?.online ? (
                <>
                  <div className="status-dot online" />
                  <span>Online</span>
                </>
              ) : (
                <span className="last-seen">{formatLastSeen(partner?.lastSeen)}</span>
              )}
            </div>
          </div>
        </div>
      </div>

      <div className="chat-header-actions">
        {/* Watch Together (desktop only — on mobile it's in More menu) */}
        {onOpenTogether && (
          <button
            className="header-action-btn desktop-only"
            onClick={onOpenTogether}
            aria-label="Watch Together"
            title="Watch Together"
          >
            <svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <polygon points="5 3 19 12 5 21 5 3" />
            </svg>
          </button>
        )}

        {/* Mini Games (desktop only — on mobile it's in More menu) */}
        {onOpenGame && (
          <button
            className="header-action-btn desktop-only"
            onClick={onOpenGame}
            aria-label="Play Game"
            title="Play Mini Game"
          >
            <svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <rect x="2" y="6" width="20" height="12" rx="3" />
              <path d="M6 12h4m-2-2v4m9-3h.01m2 2h.01" />
            </svg>
          </button>
        )}

        {/* Search (desktop only — on mobile it's in More menu) */}
        {onOpenSearch && (
          <button
            className="header-action-btn desktop-only"
            onClick={onOpenSearch}
            aria-label="Search messages"
            title="Search messages"
          >
            <svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="11" cy="11" r="8" />
              <line x1="21" y1="21" x2="16.65" y2="16.65" />
            </svg>
          </button>
        )}

        {/* Voice call */}
        <button 
          className="header-action-btn" 
          onClick={() => {
            if (!conversationId) {
              showToast('Conversation not ready');
              return;
            }
            if (callState !== 'IDLE') {
              showToast('Call already in progress');
              return;
            }
            startCall(conversationId, partner);
          }}
          disabled={callState !== 'IDLE'}
          aria-label="Start voice call"
          title="Voice call"
        >
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z" />
          </svg>
        </button>

        {/* Video call */}
        <button 
          className="header-action-btn" 
          onClick={() => {
            if (!conversationId) {
              showToast('Conversation not ready');
              return;
            }
            if (callState !== 'IDLE') {
              showToast('Call already in progress');
              return;
            }
            startCall(conversationId, partner, 'video');
          }}
          disabled={callState !== 'IDLE'}
          aria-label="Start video call"
          title="Video call"
        >
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <polygon points="23 7 16 12 23 17 23 7" />
            <rect x="1" y="5" width="15" height="14" rx="2" ry="2" />
          </svg>
        </button>

        {/* More options */}
        <div className="header-more-wrapper" ref={moreMenuRef}>
          <button 
            className={`header-action-btn ${showMoreMenu ? 'active' : ''}`}
            onClick={() => setShowMoreMenu(prev => !prev)}
            aria-label="More options"
            aria-haspopup="true"
            aria-expanded={showMoreMenu}
            title="More options"
          >
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="12" cy="5" r="1" />
              <circle cx="12" cy="12" r="1" />
              <circle cx="12" cy="19" r="1" />
            </svg>
          </button>

          {showMoreMenu && (
            <div className="header-more-dropdown" role="menu">
              <button className="dropdown-item" role="menuitem" onClick={() => { setShowMoreMenu(false); onOpenSearch?.(); }}>
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <circle cx="11" cy="11" r="8" />
                  <line x1="21" y1="21" x2="16.65" y2="16.65" />
                </svg>
                <span>Search</span>
              </button>
              <button className="dropdown-item" role="menuitem" onClick={() => { setShowMoreMenu(false); onOpenInfoDrawer?.(); }}>
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <rect x="3" y="3" width="18" height="18" rx="2" ry="2" />
                  <circle cx="8.5" cy="8.5" r="1.5" />
                  <polyline points="21 15 16 10 5 21" />
                </svg>
                <span>Chat info & Shared media</span>
              </button>
              {onOpenTogether && (
                <button className="dropdown-item" role="menuitem" onClick={() => { setShowMoreMenu(false); onOpenTogether(); }}>
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <polygon points="5 3 19 12 5 21 5 3" />
                  </svg>
                  <span>Watch Together</span>
                </button>
              )}
              {onOpenGame && (
                <button className="dropdown-item" role="menuitem" onClick={() => { setShowMoreMenu(false); onOpenGame(); }}>
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <rect x="2" y="6" width="20" height="12" rx="3" />
                    <path d="M6 12h4m-2-2v4m9-3h.01m2 2h.01" />
                  </svg>
                  <span>Play Mini Game</span>
                </button>
              )}
              {onClearChat && (
                <>
                  <div className="dropdown-divider" />
                  <button className="dropdown-item danger" role="menuitem" onClick={() => { setShowMoreMenu(false); setShowClearConfirm(true); }}>
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <polyline points="3 6 5 6 21 6" />
                      <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
                      <line x1="10" y1="11" x2="10" y2="17" />
                      <line x1="14" y1="11" x2="14" y2="17" />
                    </svg>
                    <span>Clear chat</span>
                  </button>
                </>
              )}
            </div>
          )}
        </div>
      </div>

      {showClearConfirm && createPortal(
        <div 
          className="clear-confirm-overlay" 
          onClick={() => setShowClearConfirm(false)} 
          role="dialog" 
          aria-modal="true"
          aria-labelledby="clear-chat-title"
        >
          <div className="clear-confirm-card" onClick={e => e.stopPropagation()}>
            <div className="clear-confirm-icon-badge">
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M3 6h18" />
                <path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6" />
                <path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2" />
                <line x1="10" y1="11" x2="10" y2="17" />
                <line x1="14" y1="11" x2="14" y2="17" />
              </svg>
            </div>
            <h3 id="clear-chat-title" className="clear-confirm-title">Clear chat history?</h3>
            <p className="clear-confirm-desc">
              This will remove all messages from your chat view. Your partner's chat history and all other shared data will remain untouched.
            </p>
            <div className="clear-confirm-actions">
              <button
                type="button"
                className="clear-confirm-btn cancel"
                onClick={() => setShowClearConfirm(false)}
              >
                Cancel
              </button>
              <button
                type="button"
                className="clear-confirm-btn confirm"
                onClick={() => {
                  setShowClearConfirm(false);
                  onClearChat?.();
                }}
              >
                Clear chat
              </button>
            </div>
          </div>
        </div>,
        document.body
      )}

      {toastMessage && (
        <div className="header-toast-notification" role="status">
          {toastMessage}
        </div>
      )}
    </header>
  );
}
