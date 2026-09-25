import { useState, useEffect, useRef } from 'react';
import { useAuth } from '../context/AuthContext';
import type { ChatThemePreset } from '../types/chat';
import { updatePassword, EmailAuthProvider, reauthenticateWithCredential } from 'firebase/auth';
import { notificationService, NOTIFICATION_TONES, type NotificationTone } from '../services/notificationService';
import {
  IconSettings,
  IconClose,
  IconUser,
  IconPalette,
  IconBell,
  IconLock,
  IconShield,
  IconAlertTriangle,
  IconFolder,
  IconInfo
} from './common/Icons';
import './SettingsModal.css';

interface SettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
  theme: 'light' | 'dark';
  onToggleTheme: () => void;
  currentThemePreset?: ChatThemePreset;
  onSelectThemePreset?: (preset: ChatThemePreset) => void;
}

const THEME_PRESETS: Array<{ id: ChatThemePreset; name: string; gradient: string; description: string }> = [
  { id: 'classic', name: 'Wibby Classic', gradient: 'linear-gradient(135deg, #7C3AED, #5B21B6)', description: 'Signature Purple & Violet' },
  { id: 'sunset', name: 'Sunset Glow', gradient: 'linear-gradient(135deg, #F43F5E, #FB7185)', description: 'Warm Amber, Coral & Rose' },
  { id: 'ocean', name: 'Ocean Breeze', gradient: 'linear-gradient(135deg, #06B6D4, #3B82F6)', description: 'Deep Cyan & Electric Blue' },
  { id: 'emerald', name: 'Emerald Forest', gradient: 'linear-gradient(135deg, #059669, #047857)', description: 'Sage, Mint & Emerald' },
  { id: 'rose', name: 'Rose Quartz', gradient: 'linear-gradient(135deg, #DB2777, #9D174D)', description: 'Blush Pink & Berry' },
  { id: 'midnight', name: 'Midnight Slate', gradient: 'linear-gradient(135deg, #6366F1, #1E1B4B)', description: 'Slate, Indigo & Monochrome' },
  { id: 'cyberpunk', name: 'Neon Cyberpunk', gradient: 'linear-gradient(135deg, #00F0FF, #FF007A)', description: 'Electric Cyan & Neon Magenta' },
  { id: 'sage', name: 'Calm Sage', gradient: 'linear-gradient(135deg, #10B981, #047857)', description: 'Eucalyptus & Earthy Greens' },
  { id: 'monochrome', name: 'Monochrome Slate', gradient: 'linear-gradient(135deg, #64748B, #1E293B)', description: 'Minimalist Steel & Charcoal' }
];

export default function SettingsModal({
  isOpen,
  onClose,
  theme,
  onToggleTheme,
  currentThemePreset = 'classic',
  onSelectThemePreset
}: SettingsModalProps) {

  const { user, profile, refreshProfile, signOut } = useAuth();
  const [activeTab, setActiveTab] = useState<'profile' | 'appearance' | 'notifications' | 'privacy' | 'security' | 'storage' | 'account'>('profile');

  // Storage Audit State
  const [storageAudit, setStorageAudit] = useState<any>(null);
  const [loadingStorage, setLoadingStorage] = useState(false);
  const [cleanupResult, setCleanupResult] = useState<string | null>(null);
  const [cleaningUp, setCleaningUp] = useState(false);

  // Notification Sound & Browser Notification State
  const [soundEnabled, setSoundEnabled] = useState(() => notificationService.isSoundEnabled());
  const [selectedTone, setSelectedTone] = useState<NotificationTone>(() => notificationService.getNotificationTone());
  const [browserNotifications, setBrowserNotifications] = useState(() => notificationService.isBrowserNotificationsEnabled());

  useEffect(() => {
    const handleSoundChange = (e: any) => {
      if (e.detail && typeof e.detail.enabled === 'boolean') {
        setSoundEnabled(e.detail.enabled);
      }
    };
    const handleBrowserChange = (e: any) => {
      if (e.detail && typeof e.detail.enabled === 'boolean') {
        setBrowserNotifications(e.detail.enabled);
      }
    };
    const handleToneChange = (e: any) => {
      if (e.detail?.tone) {
        setSelectedTone(e.detail.tone);
      }
    };
    window.addEventListener('wibby:sound-setting-changed', handleSoundChange);
    window.addEventListener('wibby:browser-notification-changed', handleBrowserChange);
    window.addEventListener('wibby:notification-tone-changed', handleToneChange);
    return () => {
      window.removeEventListener('wibby:sound-setting-changed', handleSoundChange);
      window.removeEventListener('wibby:browser-notification-changed', handleBrowserChange);
      window.removeEventListener('wibby:notification-tone-changed', handleToneChange);
    };
  }, []);

  const handleToggleSound = (enabled: boolean) => {
    setSoundEnabled(enabled);
    notificationService.setSoundEnabled(enabled);
    if (enabled) {
      notificationService.playTestTone(selectedTone);
    }
  };

  const handleSelectTone = (tone: NotificationTone) => {
    setSelectedTone(tone);
    notificationService.setNotificationTone(tone);
    notificationService.playTestTone(tone);
  };

  const handleToggleBrowserNotifications = async (enabled: boolean) => {
    if (enabled) {
      const granted = await notificationService.setBrowserNotificationsEnabled(true);
      setBrowserNotifications(granted);
    } else {
      await notificationService.setBrowserNotificationsEnabled(false);
      setBrowserNotifications(false);
    }
  };

  // Profile Form State
  const [displayName, setDisplayName] = useState('');
  const [username, setUsername] = useState('');
  const [bio, setBio] = useState('');
  const [customStatus, setCustomStatus] = useState('');
  const [savingProfile, setSavingProfile] = useState(false);
  const [profileMsg, setProfileMsg] = useState('');
  const [isProfileError, setIsProfileError] = useState(false);
  const avatarInputRef = useRef<HTMLInputElement>(null);

  // Privacy State
  const [lastSeen, setLastSeen] = useState<'partner' | 'nobody'>('partner');
  const [readReceipts, setReadReceipts] = useState(true);
  const [typingIndicator, setTypingIndicator] = useState(true);

  // Password Form State
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [passwordMsg, setPasswordMsg] = useState('');
  const [passwordError, setPasswordError] = useState('');
  const [changingPass, setChangingPass] = useState(false);

  // Devices State
  const [devices, setDevices] = useState<any[]>([]);

  // Delete Account State
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [deleting, setDeleting] = useState(false);

  useEffect(() => {
    if (profile || user) {
      const rawName = profile?.displayName || user?.displayName;
      const initialDisplayName = (rawName && rawName !== 'Unknown' && rawName !== 'unknown') ? rawName : '';
      const rawUsername = profile?.username;
      const initialUsername = (rawUsername && rawUsername !== 'unknown') ? rawUsername : '';
      setDisplayName(initialDisplayName);
      setUsername(initialUsername);
      setBio((profile as any)?.bio || '');
      setCustomStatus((profile as any)?.customStatus || '');
    }
  }, [profile, user]);

  useEffect(() => {
    if (!isOpen || !user) return;

    const fetchPrivacyAndDevices = async () => {
      try {
        const token = await user.getIdToken();
        const baseUrl = import.meta.env.VITE_API_URL || 'http://localhost:3000';

        const privRes = await fetch(`${baseUrl}/api/users/privacy`, {
          headers: { 'Authorization': `Bearer ${token}` }
        });
        if (privRes.ok) {
          const privData = await privRes.json();
          if (privData.lastSeen) setLastSeen(privData.lastSeen);
          if (privData.readReceipts !== undefined) setReadReceipts(privData.readReceipts);
          if (privData.typingIndicator !== undefined) setTypingIndicator(privData.typingIndicator);
        }

        const devRes = await fetch(`${baseUrl}/api/users/devices`, {
          headers: { 'Authorization': `Bearer ${token}` }
        });
        if (devRes.ok) {
          const devData = await devRes.json();
          setDevices(devData.devices || []);
        }
      } catch (err) {
        console.error('Fetch settings error:', err);
      }
    };

    fetchPrivacyAndDevices();
  }, [isOpen, user]);

  const fetchStorageAudit = async () => {
    setLoadingStorage(true);
    try {
      const baseUrl = import.meta.env.VITE_API_URL || 'http://localhost:3000';
      const res = await fetch(`${baseUrl}/api/storage/status`);
      if (res.ok) {
        const data = await res.json();
        setStorageAudit(data);
      }
    } catch (err) {
      console.error('Fetch storage audit error:', err);
    } finally {
      setLoadingStorage(false);
    }
  };

  useEffect(() => {
    if (activeTab === 'storage') {
      fetchStorageAudit();
    }
  }, [activeTab]);

  const handleRunSafeCleanup = async () => {
    setCleaningUp(true);
    setCleanupResult(null);
    try {
      const baseUrl = import.meta.env.VITE_API_URL || 'http://localhost:3000';
      const res = await fetch(`${baseUrl}/api/storage/cleanup-temporary`, {
        method: 'POST'
      });
      if (res.ok) {
        const data = await res.json();
        const r = data.result;
        setCleanupResult(`Cleaned ${r.deletedPairingCodes} expired codes, ${r.deletedExpiredStories} expired stories, and ${r.deletedOrphanedChunks} orphaned chunks. All permanent messages and user data are 100% protected.`);
        fetchStorageAudit();
      }
    } catch {
      setCleanupResult('Failed to run safe cleanup');
    } finally {
      setCleaningUp(false);
    }
  };

  if (!isOpen) return null;

  const handleSaveProfile = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) return;
    setSavingProfile(true);
    setProfileMsg('');
    setIsProfileError(false);
    try {
      const token = await user.getIdToken();
      const url = `${import.meta.env.VITE_API_URL || 'http://localhost:3000'}/api/users/profile`;
      const payload: any = { displayName, bio, customStatus };
      if (username && username.trim() !== (profile?.username || '')) {
        payload.username = username.trim().toLowerCase();
      }

      const res = await fetch(url, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify(payload)
      });
      const data = await res.json();
      if (res.ok) {
        setProfileMsg('Profile updated successfully!');
        setIsProfileError(false);
        if (refreshProfile) refreshProfile();
      } else {
        setProfileMsg(data.error || 'Failed to update profile');
        setIsProfileError(true);
      }
    } catch {
      setProfileMsg('Failed to update profile');
      setIsProfileError(true);
    } finally {
      setSavingProfile(false);
    }
  };

  const handleAvatarUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!e.target.files || !e.target.files[0] || !user) return;
    const file = e.target.files[0];
    const fd = new FormData();
    fd.append('avatar', file);

    try {
      const token = await user.getIdToken();
      const url = `${import.meta.env.VITE_API_URL || 'http://localhost:3000'}/api/users/avatar`;
      const res = await fetch(url, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${token}` },
        body: fd
      });
      if (res.ok) {
        setProfileMsg('Avatar updated!');
        if (refreshProfile) refreshProfile();
      }
    } catch {
      setProfileMsg('Failed to upload avatar');
    }
  };

  const handleSavePrivacy = async (updated: { lastSeen?: string; readReceipts?: boolean; typingIndicator?: boolean }) => {
    if (!user) return;
    try {
      const token = await user.getIdToken();
      const url = `${import.meta.env.VITE_API_URL || 'http://localhost:3000'}/api/users/privacy`;
      await fetch(url, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify(updated)
      });
    } catch (e) {
      console.error('Save privacy error:', e);
    }
  };

  const handleChangePassword = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user || !user.email) return;
    if (newPassword.length < 6) {
      setPasswordError('New password must be at least 6 characters');
      return;
    }

    setChangingPass(true);
    setPasswordMsg('');
    setPasswordError('');

    try {
      const cred = EmailAuthProvider.credential(user.email, currentPassword);
      await reauthenticateWithCredential(user, cred);
      await updatePassword(user, newPassword);
      setPasswordMsg('Password changed successfully!');
      setCurrentPassword('');
      setNewPassword('');
    } catch (err: any) {
      setPasswordError(err.message?.includes('auth/wrong-password') ? 'Current password is incorrect' : 'Failed to change password');
    } finally {
      setChangingPass(false);
    }
  };

  const handleDeleteAccount = async () => {
    if (!user) return;
    setDeleting(true);
    try {
      const token = await user.getIdToken();
      const url = `${import.meta.env.VITE_API_URL || 'http://localhost:3000'}/api/users/account`;
      await fetch(url, {
        method: 'DELETE',
        headers: { 'Authorization': `Bearer ${token}` }
      });
      await signOut();
      window.location.reload();
    } catch (err) {
      console.error('Delete account error:', err);
    } finally {
      setDeleting(false);
    }
  };

  return (
    <div className="settings-modal-overlay" onClick={onClose} role="dialog" aria-modal="true" aria-label="Settings and Profile">
      <div className="settings-modal-card" onClick={e => e.stopPropagation()}>
        {/* Settings Header */}
        <div className="settings-modal-header">
          <div className="settings-header-title-wrap">
            <span className="settings-header-icon"><IconSettings size={20} color="var(--wibby-primary)" /></span>
            <h3 className="settings-header-title">Settings</h3>
          </div>
          <button className="settings-modal-close" onClick={onClose} aria-label="Close">
            <IconClose size={18} />
          </button>
        </div>

        <div className="settings-modal-layout">
          {/* Sidebar Tabs */}
          <nav className="settings-modal-nav">
            <button
              className={`settings-nav-item ${activeTab === 'profile' ? 'active' : ''}`}
              onClick={() => setActiveTab('profile')}
            >
              <IconUser size={16} />
              <span>Profile</span>
            </button>
            <button
              className={`settings-nav-item ${activeTab === 'appearance' ? 'active' : ''}`}
              onClick={() => setActiveTab('appearance')}
            >
              <IconPalette size={16} />
              <span>Appearance</span>
            </button>
            <button
              className={`settings-nav-item ${activeTab === 'notifications' ? 'active' : ''}`}
              onClick={() => setActiveTab('notifications')}
            >
              <IconBell size={16} />
              <span>Notifications & Sound</span>
            </button>
            <button
              className={`settings-nav-item ${activeTab === 'privacy' ? 'active' : ''}`}
              onClick={() => setActiveTab('privacy')}
            >
              <IconLock size={16} />
              <span>Privacy</span>
            </button>
            <button
              className={`settings-nav-item ${activeTab === 'security' ? 'active' : ''}`}
              onClick={() => setActiveTab('security')}
            >
              <IconShield size={16} />
              <span>Security & Sessions</span>
            </button>
            <button
              className={`settings-nav-item ${activeTab === 'storage' ? 'active' : ''}`}
              onClick={() => setActiveTab('storage')}
            >
              <IconFolder size={16} />
              <span>Storage & Data</span>
            </button>
            <button
              className={`settings-nav-item danger ${activeTab === 'account' ? 'active' : ''}`}
              onClick={() => setActiveTab('account')}
            >
              <IconAlertTriangle size={16} />
              <span>Account</span>
            </button>
          </nav>

          {/* Main Tab Panel */}
          <div className="settings-modal-panel">
            {/* 1. Profile Tab */}
            {activeTab === 'profile' && (
              <form onSubmit={handleSaveProfile} className="settings-panel-form">
                <div className="avatar-edit-section">
                  <div className="settings-avatar-preview" style={{ background: 'linear-gradient(135deg, #7C3AED, #5B21B6)' }}>
                    <span>{(displayName || profile?.username || 'You').charAt(0).toUpperCase()}</span>
                  </div>
                  <button
                    type="button"
                    className="avatar-change-btn"
                    onClick={() => avatarInputRef.current?.click()}
                  >
                    Change Picture
                  </button>
                  <input
                    ref={avatarInputRef}
                    type="file"
                    accept="image/*"
                    style={{ display: 'none' }}
                    onChange={handleAvatarUpload}
                  />
                </div>

                {profileMsg && (
                  <div className={`settings-alert ${isProfileError ? 'error' : 'success'}`}>
                    {profileMsg}
                  </div>
                )}

                <div className="settings-field-group">
                  <label className="settings-label">Display Name <span className="settings-field-hint">(Unlimited changes)</span></label>
                  <input
                    type="text"
                    className="settings-input"
                    value={displayName}
                    onChange={e => setDisplayName(e.target.value)}
                    maxLength={50}
                    placeholder="Your Display Name"
                  />
                </div>

                <div className="settings-field-group">
                  <label className="settings-label">
                    Username <span className="settings-field-hint">(1 change every 14 days)</span>
                  </label>
                  <input
                    type="text"
                    className="settings-input"
                    value={username}
                    onChange={e => setUsername(e.target.value.toLowerCase().replace(/[^a-z0-9_]/g, ''))}
                    maxLength={30}
                    placeholder="username"
                  />
                </div>

                <div className="settings-field-group">
                  <label className="settings-label">Bio / Status</label>
                  <textarea
                    className="settings-textarea"
                    placeholder="Tell your partner what you're up to..."
                    value={bio}
                    onChange={e => setBio(e.target.value)}
                    maxLength={150}
                  />
                </div>

                <button type="submit" className="settings-submit-btn" disabled={savingProfile}>
                  {savingProfile ? 'Saving…' : 'Save Changes'}
                </button>
              </form>
            )}

            {/* 2. Appearance Tab */}
            {activeTab === 'appearance' && (
              <div className="settings-appearance-section">
                <div className="settings-group-card">
                  <label className="settings-group-title">App Theme</label>
                  <div className="theme-toggle-row">
                    <span>Current mode: <strong>{theme === 'dark' ? '🌙 Dark Mode' : '☀️ Light Mode'}</strong></span>
                    <button type="button" className="theme-switch-btn" onClick={onToggleTheme}>
                      Switch to {theme === 'dark' ? 'Light' : 'Dark'}
                    </button>
                  </div>
                </div>

                <div className="settings-group-card">
                  <div className="theme-group-header" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '0.25rem' }}>
                    <label className="settings-group-title" style={{ margin: 0 }}>Shared Theme Family</label>
                    <span className="theme-sync-badge" style={{ fontSize: '0.75rem', color: 'var(--wibby-primary)', fontWeight: 500 }}>⚡ Synced with partner</span>
                  </div>
                  <p className="settings-field-hint" style={{ marginBottom: '0.75rem', fontSize: '0.8125rem', color: 'var(--wibby-text-muted)' }}>
                    Selected theme family synchronizes with your partner. Light/Dark mode remains personal to each device.
                  </p>
                  <div className="settings-theme-grid">
                    {THEME_PRESETS.map(preset => {
                      const isSelected = currentThemePreset === preset.id ||
                        (preset.id === 'classic' && currentThemePreset === 'classic-purple') ||
                        (preset.id === 'sunset' && currentThemePreset === 'sunset-glow') ||
                        (preset.id === 'ocean' && currentThemePreset === 'ig-ocean') ||
                        (preset.id === 'emerald' && currentThemePreset === 'emerald-forest') ||
                        (preset.id === 'rose' && currentThemePreset === 'rose-quartz') ||
                        (preset.id === 'midnight' && (currentThemePreset === 'midnight-velvet' || currentThemePreset === 'slate-minimal'));

                      return (
                        <button
                          key={preset.id}
                          type="button"
                          className={`preset-select-card ${isSelected ? 'active' : ''}`}
                          onClick={() => onSelectThemePreset?.(preset.id)}
                        >
                          <div className="preset-swatch-large" style={{ background: preset.gradient }} />
                          <div className="preset-meta" style={{ display: 'flex', flexDirection: 'column', gap: '2px', textAlign: 'left', marginTop: '4px' }}>
                            <span className="preset-name" style={{ fontWeight: 600 }}>{preset.name}</span>
                            <span className="preset-desc" style={{ fontSize: '0.75rem', color: 'var(--wibby-text-muted)' }}>{preset.description}</span>
                          </div>
                        </button>
                      );
                    })}
                  </div>
                </div>
              </div>
            )}

            {/* Notifications & Sound Tab */}
            {activeTab === 'notifications' && (
              <div className="settings-notifications-section">
                <div className="settings-group-card">
                  <label className="settings-group-title">In-App Notification Sounds</label>
                  <div className="privacy-toggle-row">
                    <div>
                      <span className="privacy-title">Message sound notifications</span>
                      <p className="privacy-desc">Play an acoustic tone inside Wibby when your partner sends a message</p>
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                      <input
                        type="checkbox"
                        className="settings-checkbox"
                        checked={soundEnabled}
                        onChange={e => handleToggleSound(e.target.checked)}
                      />
                    </div>
                  </div>

                  {soundEnabled && (
                    <div className="settings-tone-selection">
                      <div className="settings-tone-header-meta">
                        <span className="settings-tone-label">Notification Tone</span>
                        <span className="settings-tone-subtext">Select your preferred incoming message chime</span>
                      </div>
                      <div className="settings-tone-grid">
                        {NOTIFICATION_TONES.map(tone => {
                          const isSelected = selectedTone === tone.id;
                          return (
                            <div
                              key={tone.id}
                              className={`settings-tone-card ${isSelected ? 'active' : ''}`}
                              onClick={() => handleSelectTone(tone.id)}
                              role="button"
                              tabIndex={0}
                              onKeyDown={e => {
                                if (e.key === 'Enter' || e.key === ' ') {
                                  e.preventDefault();
                                  handleSelectTone(tone.id);
                                }
                              }}
                            >
                              <div className="settings-tone-card-top">
                                <span className="settings-tone-icon">{tone.icon}</span>
                                <div className="settings-tone-info">
                                  <div className="settings-tone-name-row">
                                    <span className="settings-tone-name">
                                      {tone.name} {tone.badge ? `(${tone.badge.toLowerCase()})` : ''}
                                    </span>
                                  </div>
                                  <p className="settings-tone-desc">{tone.description}</p>
                                </div>
                                <div className={`settings-tone-radio ${isSelected ? 'checked' : ''}`}>
                                  {isSelected && <span className="settings-tone-radio-dot" />}
                                </div>
                              </div>
                              <div className="settings-tone-actions" onClick={e => e.stopPropagation()}>
                                {tone.id === 'none' ? (
                                  <span className="settings-tone-muted-hint">Muted</span>
                                ) : (
                                  <button
                                    type="button"
                                    className="settings-tone-preview-btn"
                                    onClick={() => notificationService.playTestTone(tone.id)}
                                    title={`Listen to sample ${tone.name}`}
                                  >
                                    ▶ Preview Sound
                                  </button>
                                )}
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  )}
                </div>

                <div className="settings-group-card">
                  <label className="settings-group-title">Desktop Browser Notifications</label>
                  <div className="privacy-toggle-row">
                    <div>
                      <span className="privacy-title">Operating system popup banners</span>
                      <p className="privacy-desc">Show browser OS notification banners when Wibby is running in a background tab</p>
                      {!browserNotifications && (
                        <span className="notifications-quiet-hint">✓ Quiet mode active: no disruptive browser popups</span>
                      )}
                    </div>
                    <input
                      type="checkbox"
                      className="settings-checkbox"
                      checked={browserNotifications}
                      onChange={e => handleToggleBrowserNotifications(e.target.checked)}
                    />
                  </div>
                </div>
              </div>
            )}

            {/* 3. Privacy Tab */}
            {activeTab === 'privacy' && (
              <div className="settings-privacy-section">
                <div className="privacy-toggle-row">
                  <div>
                    <span className="privacy-title">Last Seen & Online</span>
                    <p className="privacy-desc">Share when you were last active with your partner</p>
                  </div>
                  <select
                    className="settings-select"
                    value={lastSeen}
                    onChange={e => {
                      const val = e.target.value as 'partner' | 'nobody';
                      setLastSeen(val);
                      handleSavePrivacy({ lastSeen: val });
                    }}
                  >
                    <option value="partner">Partner</option>
                    <option value="nobody">Nobody</option>
                  </select>
                </div>

                <div className="privacy-toggle-row">
                  <div>
                    <span className="privacy-title">Read Receipts</span>
                    <p className="privacy-desc">Show blue checkmarks when you have read messages</p>
                  </div>
                  <input
                    type="checkbox"
                    className="settings-checkbox"
                    checked={readReceipts}
                    onChange={e => {
                      setReadReceipts(e.target.checked);
                      handleSavePrivacy({ readReceipts: e.target.checked });
                    }}
                  />
                </div>

                <div className="privacy-toggle-row">
                  <div>
                    <span className="privacy-title">Typing Indicator</span>
                    <p className="privacy-desc">Show when you are typing or recording in chat</p>
                  </div>
                  <input
                    type="checkbox"
                    className="settings-checkbox"
                    checked={typingIndicator}
                    onChange={e => {
                      setTypingIndicator(e.target.checked);
                      handleSavePrivacy({ typingIndicator: e.target.checked });
                    }}
                  />
                </div>
              </div>
            )}

            {/* 4. Security & Sessions Tab */}
            {activeTab === 'security' && (
              <div className="settings-security-section">
                <form onSubmit={handleChangePassword} className="settings-password-form">
                  <label className="settings-group-title">Change Password</label>
                  {passwordMsg && <div className="settings-alert success">{passwordMsg}</div>}
                  {passwordError && <div className="settings-alert error">{passwordError}</div>}

                  <div className="settings-field-group">
                    <label className="settings-label">Current Password</label>
                    <input
                      type="password"
                      className="settings-input"
                      value={currentPassword}
                      onChange={e => setCurrentPassword(e.target.value)}
                    />
                  </div>

                  <div className="settings-field-group">
                    <label className="settings-label">New Password</label>
                    <input
                      type="password"
                      className="settings-input"
                      value={newPassword}
                      onChange={e => setNewPassword(e.target.value)}
                    />
                  </div>

                  <button type="submit" className="settings-submit-btn" disabled={changingPass}>
                    {changingPass ? 'Updating…' : 'Update Password'}
                  </button>
                </form>

                <div className="settings-devices-card">
                  <label className="settings-group-title">Active Devices</label>
                  {devices.map(d => (
                    <div key={d.deviceId} className="device-row">
                      <span className="device-icon">💻</span>
                      <div className="device-info">
                        <span className="device-name">{d.browser} {d.isCurrent && <span className="current-pill">Current Session</span>}</span>
                        <span className="device-meta">IP: {d.ip}</span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Storage & Data Protection Tab */}
            {activeTab === 'storage' && (
              <div className="settings-storage-section">
                <div className="storage-status-card">
                  <div className="storage-card-header">
                    <div>
                      <h4 className="storage-card-title">MongoDB Storage Capacity</h4>
                      <p className="storage-card-sub">Real-time database utilization and threshold status</p>
                    </div>
                    {storageAudit && (
                      <span className={`storage-status-pill status-${storageAudit.status.toLowerCase()}`}>
                        {storageAudit.status} ({storageAudit.percentUsed}%)
                      </span>
                    )}
                  </div>

                  {loadingStorage ? (
                    <div className="storage-loading">Auditing MongoDB storage…</div>
                  ) : storageAudit ? (
                    <>
                      <div className="storage-meter-wrap">
                        <div className="storage-meter-track">
                          <div
                            className={`storage-meter-fill fill-${storageAudit.status.toLowerCase()}`}
                            style={{ width: `${Math.min(100, storageAudit.percentUsed)}%` }}
                          />
                        </div>
                        <div className="storage-meter-labels">
                          <span>{storageAudit.usedMb} MB Used</span>
                          <span>{storageAudit.limitMb} MB Limit ({storageAudit.percentUsed}%)</span>
                        </div>
                      </div>

                      <div className="storage-threshold-legend">
                        <span className="legend-chip normal">&lt;60% Normal</span>
                        <span className="legend-chip watch">60-75% Watch</span>
                        <span className="legend-chip warning">75-85% Warning</span>
                        <span className="legend-chip critical">85-90% Critical</span>
                        <span className="legend-chip emergency">&gt;90% Emergency</span>
                      </div>
                    </>
                  ) : (
                    <button type="button" className="refresh-audit-btn" onClick={fetchStorageAudit}>
                      Load Storage Metrics
                    </button>
                  )}
                </div>

                {/* Permanent Data Safety Guarantee */}
                <div className="storage-guarantee-card">
                  <div className="guarantee-header">
                    <IconShield size={20} color="#10B981" />
                    <h4>Permanent User Data Protected</h4>
                  </div>
                  <p className="guarantee-text">
                    Wibby <strong>never automatically wipes</strong> your messages, two-user conversations, call history, media files, or profiles based on age. All permanent user content is strictly preserved and protected from scheduled wipes.
                  </p>
                </div>

                {/* Safe Temporary Cleanup */}
                <div className="storage-cleanup-card">
                  <div className="cleanup-header">
                    <IconInfo size={18} color="var(--wibby-primary)" />
                    <h4>Safe Temporary Cleanup</h4>
                  </div>
                  <p className="cleanup-text">
                    Safely purges only temporary artifacts: expired 15-minute pairing codes, expired stories past retention grace period, and abandoned upload chunks. Permanent messages and user files are never touched.
                  </p>

                  {cleanupResult && (
                    <div className="cleanup-result-banner">
                      {cleanupResult}
                    </div>
                  )}

                  <button
                    type="button"
                    className="run-cleanup-btn"
                    disabled={cleaningUp}
                    onClick={handleRunSafeCleanup}
                  >
                    {cleaningUp ? 'Running Safe Cleanup…' : 'Run Safe Temporary Cleanup'}
                  </button>
                </div>

                {/* Collections Breakdown */}
                {storageAudit?.collections && (
                  <div className="storage-breakdown-card">
                    <h4 className="breakdown-title">Database Collections Breakdown</h4>
                    <div className="breakdown-table">
                      <div className="breakdown-row header">
                        <span>Collection</span>
                        <span>Type</span>
                        <span>Documents</span>
                        <span>Size</span>
                      </div>
                      {storageAudit.collections.permanent.map((col: any) => (
                        <div key={col.name} className="breakdown-row">
                          <span className="col-name font-mono">{col.name}</span>
                          <span className="col-badge permanent">Permanent</span>
                          <span className="col-count">{col.count}</span>
                          <span className="col-size">{col.sizeFormatted}</span>
                        </div>
                      ))}
                      {storageAudit.collections.media.map((col: any) => (
                        <div key={col.name} className="breakdown-row">
                          <span className="col-name font-mono">{col.name}</span>
                          <span className="col-badge media">Media GridFS</span>
                          <span className="col-count">{col.count}</span>
                          <span className="col-size">{col.sizeFormatted}</span>
                        </div>
                      ))}
                      {storageAudit.collections.temporary.map((col: any) => (
                        <div key={col.name} className="breakdown-row">
                          <span className="col-name font-mono">{col.name}</span>
                          <span className="col-badge temp">Temporary</span>
                          <span className="col-count">{col.count}</span>
                          <span className="col-size">{col.sizeFormatted}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* 5. Account Deletion Tab */}
            {activeTab === 'account' && (
              <div className="settings-account-section">
                <div className="danger-box">
                  <h4 className="danger-title">Delete Account</h4>
                  <p className="danger-desc">
                    Permanently delete your Wibby account, unpair your connection, and remove all your messages and stories. This action cannot be undone.
                  </p>

                  {!confirmDelete ? (
                    <button
                      type="button"
                      className="danger-btn"
                      onClick={() => setConfirmDelete(true)}
                    >
                      Delete Account
                    </button>
                  ) : (
                    <div className="confirm-delete-box">
                      <p className="confirm-warn">Are you absolutely sure?</p>
                      <div className="confirm-actions">
                        <button
                          type="button"
                          className="cancel-delete-btn"
                          onClick={() => setConfirmDelete(false)}
                        >
                          Cancel
                        </button>
                        <button
                          type="button"
                          className="confirm-delete-btn"
                          disabled={deleting}
                          onClick={handleDeleteAccount}
                        >
                          {deleting ? 'Deleting…' : 'Yes, Delete Everything'}
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
