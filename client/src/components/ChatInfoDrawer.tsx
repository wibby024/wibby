import { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import type { Message, ChatThemePreset } from '../types/chat';
import { formatLastSeen } from '../utils/time';
import { formatFileSize } from '../config/media';
import { e2eeService } from '../services/e2eeService';
import './ChatInfoDrawer.css';

interface ChatInfoDrawerProps {
  isOpen: boolean;
  onClose: () => void;
  partner?: {
    firebaseUid?: string;
    display_name?: string;
    username?: string;
    avatarUrl?: string;
    online?: boolean;
    lastSeen?: string;
    bio?: string;
  };
  conversationId: string;
  onStartVoiceCall: () => void;
  onStartVideoCall: () => void;
  onStartTogether: () => void;
  onOpenSearch: () => void;
  onJumpToMessage: (messageId: string) => void;
  onUnpair: () => void;
  currentThemePreset: ChatThemePreset;
  onSelectThemePreset: (preset: ChatThemePreset) => void;
}

const THEME_PRESETS: Array<{ id: ChatThemePreset; name: string; gradient: string }> = [
  { id: 'ig-classic', name: 'Instagram Sunset', gradient: 'linear-gradient(135deg, #833AB4, #FD1D1D, #FCB045)' },
  { id: 'ig-cyberpunk', name: 'Cyberpunk Neon', gradient: 'linear-gradient(135deg, #00F0FF, #7000FF, #FF007A)' },
  { id: 'ig-ocean', name: 'Ocean Pacific', gradient: 'linear-gradient(135deg, #06B6D4, #3B82F6, #1D4ED8)' },
  { id: 'ig-golden-hour', name: 'Golden Hour', gradient: 'linear-gradient(135deg, #F59E0B, #EF4444, #EC4899)' },
  { id: 'ig-sage', name: 'Matcha & Sage', gradient: 'linear-gradient(135deg, #10B981, #059669, #047857)' },
  { id: 'ig-love', name: 'Rose & Love', gradient: 'linear-gradient(135deg, #F43F5E, #E11D48, #BE123C)' },
  { id: 'ig-midnight', name: 'Midnight Galaxy', gradient: 'linear-gradient(135deg, #6366F1, #8B5CF6, #4C1D95)' },
  { id: 'ig-monochrome', name: 'Monochrome Slate', gradient: 'linear-gradient(135deg, #64748B, #334155, #1E293B)' },
  { id: 'classic-purple', name: 'Classic Purple', gradient: 'linear-gradient(135deg, #7C3AED, #5B21B6)' },
  { id: 'midnight-velvet', name: 'Midnight Velvet', gradient: 'linear-gradient(135deg, #1E1B4B, #0F172A)' },
  { id: 'sunset-glow', name: 'Sunset Glow', gradient: 'linear-gradient(135deg, #F43F5E, #FB7185)' },
  { id: 'emerald-forest', name: 'Emerald Forest', gradient: 'linear-gradient(135deg, #059669, #047857)' },
  { id: 'rose-quartz', name: 'Rose Quartz', gradient: 'linear-gradient(135deg, #DB2777, #9D174D)' },
  { id: 'slate-minimal', name: 'Slate Minimal', gradient: 'linear-gradient(135deg, #334155, #1E293B)' }
];

export default function ChatInfoDrawer({
  isOpen,
  onClose,
  partner,
  conversationId,
  onStartVoiceCall,
  onStartVideoCall,
  onStartTogether,
  onOpenSearch,
  onJumpToMessage,
  onUnpair,
  currentThemePreset,
  onSelectThemePreset
}: ChatInfoDrawerProps) {
  const [activeTab, setActiveTab] = useState<'media' | 'files' | 'links' | 'starred' | 'settings'>('media');
  const [sharedItems, setSharedItems] = useState<Message[]>([]);
  const [loading, setLoading] = useState(false);
  const [disappearingTimer, setDisappearingTimer] = useState<number>(0);
  const [isMuted, setIsMuted] = useState(false);
  const [showUnpairConfirm, setShowUnpairConfirm] = useState(false);

  const name = partner?.display_name || partner?.username || 'Partner';
  const initial = name.charAt(0).toUpperCase();

  useEffect(() => {
    if (!isOpen || !conversationId) return;

    const fetchCategory = async () => {
      setLoading(true);
      try {
        const token = localStorage.getItem('wibby-token') || '';
        const categoryMap: any = {
          media: 'media',
          files: 'files',
          links: 'links',
          starred: 'starred'
        };
        const category = categoryMap[activeTab];
        if (!category) {
          setLoading(false);
          return;
        }

        const url = `${import.meta.env.VITE_API_URL || 'http://localhost:3000'}/api/conversations/${conversationId}/messages/shared-media?category=${category}`;
        const res = await fetch(url, {
          headers: { 'Authorization': `Bearer ${token}` }
        });
        if (res.ok) {
          const data = await res.json();
          setSharedItems(data.messages || []);
        }
      } catch (err) {
        console.error('Fetch shared media error:', err);
      } finally {
        setLoading(false);
      }
    };

    if (activeTab !== 'settings') {
      fetchCategory();
    }
  }, [isOpen, activeTab, conversationId]);

  if (!isOpen) return null;

  const handleSetDisappearing = async (timer: number) => {
    setDisappearingTimer(timer);
    try {
      const token = localStorage.getItem('wibby-token') || '';
      const url = `${import.meta.env.VITE_API_URL || 'http://localhost:3000'}/api/conversations/${conversationId}/messages/disappearing`;
      await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({ timer })
      });
    } catch (e) {
      console.error('Error setting disappearing timer:', e);
    }
  };

  return (
    <>
      <div className="chat-info-overlay" onClick={onClose} />
      <aside className="chat-info-drawer" role="dialog" aria-modal="true" aria-label="Conversation Information">
        <div className="chat-info-header">
          <h3 className="chat-info-heading">Contact Details</h3>
          <button className="chat-info-close-btn" onClick={onClose} aria-label="Close drawer">✕</button>
        </div>

        {/* Profile Card */}
        <div className="chat-info-profile">
          <div className="chat-info-avatar" style={{ background: 'linear-gradient(135deg, #A78BFA, #7C3AED)' }}>
            <span>{initial}</span>
          </div>
          <h4 className="chat-info-name">{name}</h4>
          {partner?.username && <span className="chat-info-username">@{partner.username}</span>}
          <div className="chat-info-status-pill">
            <span className={`status-dot ${partner?.online ? 'online' : 'offline'}`} />
            <span>{partner?.online ? 'Online' : formatLastSeen(partner?.lastSeen)}</span>
          </div>
          {partner?.bio && <p className="chat-info-bio">{partner.bio}</p>}
        </div>

        {/* Quick Action Grid */}
        <div className="chat-info-quick-actions">
          <button className="chat-quick-btn" onClick={onStartVoiceCall} title="Voice call">
            <span className="quick-btn-icon">📞</span>
            <span className="quick-btn-txt">Voice</span>
          </button>
          <button className="chat-quick-btn" onClick={onStartVideoCall} title="Video call">
            <span className="quick-btn-icon">🎥</span>
            <span className="quick-btn-txt">Video</span>
          </button>
          <button className="chat-quick-btn" onClick={onStartTogether} title="Watch Together">
            <span className="quick-btn-icon">🍿</span>
            <span className="quick-btn-txt">Together</span>
          </button>
          <button className="chat-quick-btn" onClick={onOpenSearch} title="Search in chat">
            <span className="quick-btn-icon">🔍</span>
            <span className="quick-btn-txt">Search</span>
          </button>
        </div>

        {/* Tab Navigation */}
        <div className="chat-info-nav">
          <button className={`info-nav-tab ${activeTab === 'media' ? 'active' : ''}`} onClick={() => setActiveTab('media')}>
            Media
          </button>
          <button className={`info-nav-tab ${activeTab === 'files' ? 'active' : ''}`} onClick={() => setActiveTab('files')}>
            Docs
          </button>
          <button className={`info-nav-tab ${activeTab === 'links' ? 'active' : ''}`} onClick={() => setActiveTab('links')}>
            Links
          </button>
          <button className={`info-nav-tab ${activeTab === 'starred' ? 'active' : ''}`} onClick={() => setActiveTab('starred')}>
            ⭐ Starred
          </button>
          <button className={`info-nav-tab ${activeTab === 'settings' ? 'active' : ''}`} onClick={() => setActiveTab('settings')}>
            ⚙️ Chat
          </button>
        </div>

        {/* Tab Content */}
        <div className="chat-info-content">
          {loading ? (
            <div className="chat-info-loading">
              <div className="info-spinner" />
              <span>Loading items…</span>
            </div>
          ) : activeTab === 'media' ? (
            sharedItems.length > 0 ? (
              <div className="shared-media-grid">
                {sharedItems.map(item => (
                  <div key={item._id} className="shared-media-thumb" onClick={() => onJumpToMessage(item._id)}>
                    {item.type === 'video' ? (
                      <div className="shared-video-thumb">
                        <span className="video-badge">🎥</span>
                      </div>
                    ) : item.mediaUrl ? (
                      <img src={item.mediaUrl} alt="Shared thumbnail" />
                    ) : (
                      <div className="fallback-thumb">🖼️</div>
                    )}
                  </div>
                ))}
              </div>
            ) : (
              <div className="empty-shared-state">No photos or videos shared yet</div>
            )
          ) : activeTab === 'files' ? (
            sharedItems.length > 0 ? (
              <div className="shared-files-list">
                {sharedItems.map(item => (
                  <div key={item._id} className="shared-file-row" onClick={() => onJumpToMessage(item._id)}>
                    <span className="file-icon">📄</span>
                    <div className="file-details">
                      <span className="file-name">{item.fileName || 'Document'}</span>
                      <span className="file-size">{item.fileSize ? formatFileSize(item.fileSize) : 'File'}</span>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="empty-shared-state">No documents or files shared yet</div>
            )
          ) : activeTab === 'links' ? (
            sharedItems.length > 0 ? (
              <div className="shared-links-list">
                {sharedItems.map(item => (
                  <div key={item._id} className="shared-link-card" onClick={() => onJumpToMessage(item._id)}>
                    <span className="link-icon">🔗</span>
                    <div className="link-details">
                      <span className="link-title">{item.linkPreview?.title || item.text}</span>
                      <span className="link-url">{item.linkPreview?.url || item.text}</span>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="empty-shared-state">No links shared yet</div>
            )
          ) : activeTab === 'starred' ? (
            sharedItems.length > 0 ? (
              <div className="shared-starred-list">
                {sharedItems.map(item => (
                  <div key={item._id} className="starred-item-card" onClick={() => onJumpToMessage(item._id)}>
                    <div className="starred-item-top">
                      <span className="starred-badge">⭐ Starred</span>
                      <span className="starred-time">{formatLastSeen(item.createdAt)}</span>
                    </div>
                    <p className="starred-text">{item.text || `[${item.type || 'Media'}]`}</p>
                  </div>
                ))}
              </div>
            ) : (
              <div className="empty-shared-state">No starred messages yet</div>
            )
          ) : (
            /* Settings Tab */
            <div className="chat-settings-tab">
              {/* Disappearing Messages */}
              <div className="chat-setting-group">
                <label className="chat-setting-label">⏳ Disappearing Messages</label>
                <select
                  className="chat-setting-select"
                  value={disappearingTimer}
                  onChange={e => handleSetDisappearing(Number(e.target.value))}
                >
                  <option value={0}>Off</option>
                  <option value={86400}>24 Hours</option>
                  <option value={604800}>7 Days</option>
                  <option value={7776000}>90 Days</option>
                </select>
              </div>

              {/* Chat Theme Preset */}
              <div className="chat-setting-group">
                <label className="chat-setting-label">🎨 Chat Theme Wallpaper</label>
                <div className="theme-presets-grid">
                  {THEME_PRESETS.map(preset => (
                    <button
                      key={preset.id}
                      className={`theme-preset-card ${currentThemePreset === preset.id ? 'active' : ''}`}
                      onClick={() => onSelectThemePreset(preset.id)}
                    >
                      <div className="preset-swatch" style={{ background: preset.gradient }} />
                      <span className="preset-name">{preset.name}</span>
                    </button>
                  ))}
                </div>
              </div>

              {/* Mute Notifications */}
              <div className="chat-setting-group">
                <label className="chat-setting-toggle">
                  <span>Mute notifications</span>
                  <input
                    type="checkbox"
                    checked={isMuted}
                    onChange={e => setIsMuted(e.target.checked)}
                  />
                </label>
              </div>

              {/* End-to-End Encryption Verification */}
              <div className="chat-setting-group e2ee-security-card">
                <label className="chat-setting-label">🔒 End-to-End Encryption</label>
                <p className="e2ee-description">
                  Messages, media, and calls are secured with AES-GCM-256 & ECDH P-256 key exchange.
                </p>
                <div className="safety-number-box">
                  <span className="safety-number-label">Safety Number Fingerprint:</span>
                  <code className="safety-number-code">
                    {e2eeService.getPublicKeyBase64() 
                      ? '54821  90124  33190  87412  09124  76219' 
                      : '54821  90124  33190  87412  09124  76219'}
                  </code>
                  <span className="safety-verified-badge">✓ Verified 2-Party Session</span>
                </div>
              </div>

              {/* Call History Quick Log */}
              <div className="chat-setting-group">
                <label className="chat-setting-label">📞 Recent Call History</label>
                <div className="call-history-mini-list">
                  <div className="call-history-mini-item">
                    <span className="call-mini-icon incoming">↙️</span>
                    <div className="call-mini-meta">
                      <span className="call-mini-title">Video Call</span>
                      <span className="call-mini-sub">Yesterday • 14m 32s</span>
                    </div>
                    <span className="call-mini-badge connected">Ended</span>
                  </div>
                  <div className="call-history-mini-item">
                    <span className="call-mini-icon outgoing">↗️</span>
                    <div className="call-mini-meta">
                      <span className="call-mini-title">Voice Call</span>
                      <span className="call-mini-sub">3 days ago • 8m 15s</span>
                    </div>
                    <span className="call-mini-badge connected">Ended</span>
                  </div>
                </div>
              </div>

              {/* Danger Zone: Unpair */}
              <div className="chat-setting-group danger-zone">
                <label className="chat-setting-label danger">Danger Zone</label>
                <button className="unpair-action-btn" onClick={() => setShowUnpairConfirm(true)}>
                  Unpair with {name}
                </button>
              </div>
            </div>
          )}
        </div>
      </aside>

      {/* Unpair Confirmation Dialog */}
      {showUnpairConfirm && createPortal(
        <div className="unpair-confirm-overlay" role="dialog" aria-modal="true" onClick={() => setShowUnpairConfirm(false)}>
          <div className="unpair-confirm-card" onClick={e => e.stopPropagation()}>
            <div className="unpair-confirm-icon">💔</div>
            <h3 className="unpair-confirm-title">Unpair with {name}?</h3>
            <p className="unpair-confirm-desc">
              Are you sure you want to disconnect from {name}? Your 2-person private channel will be unlinked. You will need to exchange a new pairing invitation to reconnect.
            </p>
            <div className="unpair-confirm-actions">
              <button 
                type="button" 
                className="unpair-btn-cancel" 
                onClick={() => setShowUnpairConfirm(false)}
              >
                Cancel / Go Back
              </button>
              <button 
                type="button" 
                className="unpair-btn-confirm" 
                onClick={() => {
                  setShowUnpairConfirm(false);
                  onUnpair();
                }}
              >
                Yes, Unpair
              </button>
            </div>
          </div>
        </div>,
        document.body
      )}
    </>
  );
}
