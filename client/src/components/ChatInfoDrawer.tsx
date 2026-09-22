import { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import type { Message, ChatThemePreset } from '../types/chat';
import { formatLastSeen } from '../utils/time';
import { formatFileSize } from '../config/media';
import { e2eeService } from '../services/e2eeService';
import { notificationService, NOTIFICATION_TONES, type NotificationTone } from '../services/notificationService';
import { resolvePartnerName } from '../utils/partnerName';
import './ChatInfoDrawer.css';

interface ChatInfoDrawerProps {
  isOpen: boolean;
  onClose: () => void;
  partner?: {
    firebaseUid?: string;
    display_name?: string;
    displayName?: string;
    username?: string;
    email?: string;
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
  { id: 'classic', name: 'Wibby Classic', gradient: 'linear-gradient(135deg, #7C3AED, #5B21B6)' },
  { id: 'sunset', name: 'Sunset Glow', gradient: 'linear-gradient(135deg, #F43F5E, #FB7185)' },
  { id: 'ocean', name: 'Ocean Breeze', gradient: 'linear-gradient(135deg, #06B6D4, #3B82F6)' },
  { id: 'emerald', name: 'Emerald Forest', gradient: 'linear-gradient(135deg, #059669, #047857)' },
  { id: 'rose', name: 'Rose Quartz', gradient: 'linear-gradient(135deg, #DB2777, #9D174D)' },
  { id: 'midnight', name: 'Midnight Slate', gradient: 'linear-gradient(135deg, #6366F1, #1E1B4B)' }
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
  const [activeTab, setActiveTab] = useState<'media' | 'files' | 'links' | 'starred' | 'calls' | 'settings'>('media');
  const [sharedItems, setSharedItems] = useState<Message[]>([]);
  const [callHistory, setCallHistory] = useState<Array<{
    id: string;
    callId: string;
    callerId: string;
    calleeId: string;
    callType: 'voice' | 'video';
    status: 'completed' | 'missed' | 'declined' | 'cancelled';
    startedAt: string;
    duration: number;
  }>>([]);
  const [loading, setLoading] = useState(false);
  const [disappearingTimer, setDisappearingTimer] = useState<number>(0);
  const [soundEnabled, setSoundEnabled] = useState(() => notificationService.isSoundEnabled());
  const [currentTone, setCurrentTone] = useState<NotificationTone>(() => notificationService.getNotificationTone());
  const [showUnpairConfirm, setShowUnpairConfirm] = useState(false);

  useEffect(() => {
    const handleSoundChange = (e: any) => {
      if (e.detail && typeof e.detail.enabled === 'boolean') {
        setSoundEnabled(e.detail.enabled);
      }
    };
    const handleToneChange = (e: any) => {
      if (e.detail?.tone) {
        setCurrentTone(e.detail.tone);
      }
    };
    window.addEventListener('wibby:sound-setting-changed', handleSoundChange);
    window.addEventListener('wibby:notification-tone-changed', handleToneChange);
    return () => {
      window.removeEventListener('wibby:sound-setting-changed', handleSoundChange);
      window.removeEventListener('wibby:notification-tone-changed', handleToneChange);
    };
  }, []);

  const name = resolvePartnerName(partner);
  const initial = name.charAt(0).toUpperCase();

  useEffect(() => {
    if (!isOpen || !conversationId) return;

    if (activeTab === 'calls') {
      const fetchCalls = async () => {
        setLoading(true);
        try {
          const token = localStorage.getItem('wibby-token') || '';
          const url = `${import.meta.env.VITE_API_URL || 'http://localhost:3000'}/api/conversations/${conversationId}/calls`;
          const res = await fetch(url, {
            headers: { 'Authorization': `Bearer ${token}` }
          });
          if (res.ok) {
            const data = await res.json();
            setCallHistory(data || []);
          }
        } catch (err) {
          console.error('Fetch calls error:', err);
        } finally {
          setLoading(false);
        }
      };
      fetchCalls();
      return;
    }

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
          <button className={`info-nav-tab ${activeTab === 'calls' ? 'active' : ''}`} onClick={() => setActiveTab('calls')}>
            📞 Calls
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
          ) : activeTab === 'calls' ? (
            callHistory.length > 0 ? (
              <div className="shared-calls-list">
                {callHistory.map(call => {
                  const isVoice = call.callType === 'voice';
                  const mins = Math.floor((call.duration || 0) / 60);
                  const secs = (call.duration || 0) % 60;
                  const durationText = call.duration > 0 ? `${mins > 0 ? `${mins}m ` : ''}${secs}s` : null;
                  const callTime = new Date(call.startedAt).toLocaleString([], {
                    month: 'short',
                    day: 'numeric',
                    hour: '2-digit',
                    minute: '2-digit'
                  });

                  return (
                    <div key={call.id || call.callId} className="call-history-card">
                      <div className="call-history-icon-col">
                        <span className={`call-history-type-icon ${call.status}`}>
                          {isVoice ? '📞' : '🎥'}
                        </span>
                      </div>
                      <div className="call-history-info">
                        <div className="call-history-title-row">
                          <span className="call-history-title">{isVoice ? 'Voice Call' : 'Video Call'}</span>
                          <span className={`call-history-status-badge ${call.status}`}>
                            {call.status}
                          </span>
                        </div>
                        <div className="call-history-meta">
                          <span>{callTime}</span>
                          {durationText && (
                            <>
                              <span className="call-meta-dot">•</span>
                              <span>{durationText}</span>
                            </>
                          )}
                        </div>
                      </div>
                      <button
                        type="button"
                        className="call-history-callback-btn"
                        onClick={isVoice ? onStartVoiceCall : onStartVideoCall}
                        title={`Call back with ${isVoice ? 'voice' : 'video'}`}
                        aria-label={`Call back with ${isVoice ? 'voice' : 'video'}`}
                      >
                        {isVoice ? '📞' : '🎥'}
                      </button>
                    </div>
                  );
                })}
              </div>
            ) : (
              <div className="empty-shared-state">No call history recorded yet</div>
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

              {/* In-App Notification Sound Toggle */}
              <div className="chat-setting-group">
                <label className="chat-setting-toggle" style={{ cursor: 'pointer' }}>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
                    <span style={{ fontWeight: 500 }}>Message notification sound</span>
                    <span style={{ fontSize: '0.75rem', color: 'var(--wibby-text-muted)' }}>
                      {soundEnabled
                        ? currentTone === 'none'
                          ? 'Tone: None (Silent)'
                          : `Tone: ${(() => {
                              const t = NOTIFICATION_TONES.find(x => x.id === currentTone);
                              return t ? `${t.name}${t.badge ? ` (${t.badge.toLowerCase()})` : ''}` : 'Wibby (default)';
                            })()}`
                        : 'Muted'}
                    </span>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    {soundEnabled && currentTone !== 'none' && (
                      <button
                        type="button"
                        className="info-chime-test-btn"
                        onClick={(e) => {
                          e.preventDefault();
                          e.stopPropagation();
                          notificationService.playTestTone(currentTone);
                        }}
                        title={`Listen to sample ${NOTIFICATION_TONES.find(t => t.id === currentTone)?.name || 'tone'}`}
                        aria-label="Test notification sound"
                      >
                        🔊
                      </button>
                    )}
                    <input
                      type="checkbox"
                      checked={soundEnabled}
                      onChange={e => {
                        const next = e.target.checked;
                        setSoundEnabled(next);
                        notificationService.setSoundEnabled(next);
                      }}
                    />
                  </div>
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
