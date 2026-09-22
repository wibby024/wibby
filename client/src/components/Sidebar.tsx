import { useState } from 'react';
import { useAuth } from '../context/AuthContext';
import WibbyLogo from './WibbyLogo';
import './Sidebar.css';

interface SidebarProps {
  isOpen: boolean;
  onClose: () => void;
  isPaired?: boolean;
  partner?: {
    display_name?: string;
    displayName?: string;
    username?: string;
    email?: string;
    online?: boolean;
    lastSeen?: string;
  };
  theme?: 'light' | 'dark';
  onToggleTheme?: () => void;
  onOpenSettings?: () => void;
  onOpenSearch?: () => void;
}

export default function Sidebar({ 
  isOpen, 
  onClose, 
  isPaired, 
  partner, 
  theme = 'dark', 
  onToggleTheme,
  onOpenSettings,
  onOpenSearch
}: SidebarProps) {
  const [searchQuery, setSearchQuery] = useState('');
  const [showLogoutConfirm, setShowLogoutConfirm] = useState(false);
  const { user, profile, signOut } = useAuth();

  const rawDisplayName = profile?.displayName || user?.displayName;
  const isBadDisplayName = !rawDisplayName || rawDisplayName === 'Unknown' || rawDisplayName === 'unknown';
  const displayName = !isBadDisplayName
    ? rawDisplayName
    : (profile?.username ? profile.username.replace(/^@+/, '').charAt(0).toUpperCase() + profile.username.replace(/^@+/, '').slice(1) : '') ||
      (user?.email ? user.email.split('@')[0].charAt(0).toUpperCase() + user.email.split('@')[0].slice(1) : '') ||
      'You';
  const rawUsername = (profile?.username && profile.username !== 'unknown' ? profile.username : '') || (user?.email ? user.email.split('@')[0] : '');
  const cleanUsername = rawUsername ? rawUsername.replace(/^@+/, '') : '';
  const formattedUsername = cleanUsername ? `@${cleanUsername}` : '';
  const initial = (displayName.charAt(0) || cleanUsername.charAt(0) || 'U').toUpperCase();

  const rawPartnerName = partner?.display_name || partner?.displayName;
  const isBadPartnerName = !rawPartnerName || rawPartnerName === 'Unknown' || rawPartnerName === 'unknown';
  const partnerName = !isBadPartnerName
    ? rawPartnerName
    : (partner?.username && partner.username !== 'unknown' ? partner.username : (partner?.email ? partner.email.split('@')[0] : 'Partner'));
  const partnerInitial = partnerName.charAt(0).toUpperCase();

  const handleSignOut = async () => {
    try {
      await signOut();
    } catch (err) {
      console.error('Logout error:', err);
    }
  };

  return (
    <>
      <div
        className={`sidebar-overlay ${isOpen ? 'visible' : ''}`}
        onClick={onClose}
        style={{ pointerEvents: isOpen ? 'auto' : 'none' }}
      />

      <aside className={`sidebar ${isOpen ? 'open' : ''}`}>
        <div className="sidebar-header">
          <div 
            className="sidebar-brand"
            onClick={onClose}
            role="button"
            tabIndex={0}
            title="Return to chat"
            style={{ cursor: 'pointer' }}
          >
            <WibbyLogo size={32} />
            <h1 className="sidebar-title">Wibby</h1>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
            {onOpenSettings && (
              <button className="sidebar-btn" aria-label="Settings" title="Settings" onClick={onOpenSettings}>
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <circle cx="12" cy="12" r="3" />
                  <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z" />
                </svg>
              </button>
            )}

            <button className="sidebar-btn" aria-label="Toggle theme" title="Toggle theme" onClick={onToggleTheme}>
              {theme === 'dark' ? (
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <circle cx="12" cy="12" r="5" />
                  <line x1="12" y1="1" x2="12" y2="3" />
                  <line x1="12" y1="21" x2="12" y2="23" />
                  <line x1="4.22" y1="4.22" x2="5.64" y2="5.64" />
                  <line x1="18.36" y1="18.36" x2="19.78" y2="19.78" />
                  <line x1="1" y1="12" x2="3" y2="12" />
                  <line x1="21" y1="12" x2="23" y2="12" />
                  <line x1="4.22" y1="19.78" x2="5.64" y2="18.36" />
                  <line x1="18.36" y1="5.64" x2="19.78" y2="4.22" />
                </svg>
              ) : (
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z" />
                </svg>
              )}
            </button>

            <button 
              className="sidebar-btn sidebar-close-btn" 
              aria-label="Close menu" 
              title="Close menu" 
              onClick={onClose}
            >
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                <line x1="18" y1="6" x2="6" y2="18" />
                <line x1="6" y1="6" x2="18" y2="18" />
              </svg>
            </button>
          </div>
        </div>

        <div className="sidebar-search">
          <div 
            className="search-input-wrapper"
            onClick={() => onOpenSearch?.()}
            style={{ cursor: onOpenSearch ? 'pointer' : 'default' }}
          >
            <svg className="search-icon" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="11" cy="11" r="8" />
              <line x1="21" y1="21" x2="16.65" y2="16.65" />
            </svg>
            <input
              type="text"
              className="search-input"
              placeholder="Search messages, media..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              onFocus={() => onOpenSearch?.()}
            />
          </div>
        </div>

        <div className="sidebar-section">
          <span className="sidebar-section-label">Your Connection</span>
        </div>

        <div className="sidebar-conversations">
          {isPaired ? (
            <button className="conversation-item active" onClick={onClose} title="Return to chat">
              <div className="conversation-avatar">
                <div className="avatar" style={{ background: 'linear-gradient(135deg, #A78BFA, #7C3AED)' }}>
                  <span>{partnerInitial}</span>
                </div>
                <div className={`avatar-status ${partner?.online ? 'online' : 'offline'}`} />
              </div>

              <div className="conversation-content">
                <div className="conversation-top">
                  <span className="conversation-name">{partnerName}</span>
                </div>
                <p className="conversation-preview">
                  Connected
                </p>
              </div>
            </button>
          ) : (
            <div 
              className="conversation-empty" 
              onClick={onClose}
              role="button"
              tabIndex={0}
              style={{ padding: '0.75rem 1rem', color: 'var(--wibby-text-muted)', fontSize: '0.875rem', cursor: 'pointer' }}
              title="Return to home"
            >
              Not paired yet — tap to return
            </div>
          )}
        </div>

        <div className="sidebar-footer">
          <div className="sidebar-user">
            <div 
              className="avatar user-avatar" 
              style={{ background: 'linear-gradient(135deg, #7C3AED, #5B21B6)', cursor: 'pointer' }}
              onClick={onOpenSettings}
              title="Edit Profile Settings"
            >
              {profile?.avatarUrl ? (
                <img 
                  src={profile.avatarUrl} 
                  alt={displayName} 
                  className="user-avatar-img"
                  onError={(e) => {
                    (e.target as HTMLElement).style.display = 'none';
                  }}
                />
              ) : (
                <span>{initial}</span>
              )}
              <div className="avatar-status online" title="Online" />
            </div>

            <div className="user-info" onClick={onOpenSettings} style={{ cursor: 'pointer' }} title="Edit Profile Settings">
              <span className="user-name">{displayName}</span>
              {formattedUsername && <span className="user-username">{formattedUsername}</span>}
            </div>

            <button
              className="sidebar-logout-btn"
              onClick={() => setShowLogoutConfirm(true)}
              title="Log out"
              aria-label="Log out"
            >
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
                <polyline points="16 17 21 12 16 7" />
                <line x1="21" y1="12" x2="9" y2="12" />
              </svg>
            </button>
          </div>
        </div>
      </aside>

      {/* Logout Confirmation Dialog */}
      {showLogoutConfirm && (
        <div className="logout-confirm-overlay" role="dialog" aria-modal="true" onClick={() => setShowLogoutConfirm(false)}>
          <div className="logout-confirm-card" onClick={e => e.stopPropagation()}>
            <div className="logout-confirm-icon">🚪</div>
            <h3 className="logout-confirm-title">Log out of Wibby?</h3>
            <p className="logout-confirm-desc">Are you sure you want to log out? You will need to sign in again to access your messages.</p>
            <div className="logout-confirm-actions">
              <button 
                type="button" 
                className="logout-btn-cancel" 
                onClick={() => setShowLogoutConfirm(false)}
              >
                Keep Logged In
              </button>
              <button 
                type="button" 
                className="logout-btn-confirm" 
                onClick={() => {
                  setShowLogoutConfirm(false);
                  handleSignOut();
                }}
              >
                Yes, Log Out
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

