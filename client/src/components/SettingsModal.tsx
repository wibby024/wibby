import { useState, useEffect, useRef } from 'react';
import { useAuth } from '../context/AuthContext';
import type { ChatThemePreset } from '../types/chat';
import { updatePassword, EmailAuthProvider, reauthenticateWithCredential } from 'firebase/auth';
import './SettingsModal.css';

interface SettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
  theme: 'light' | 'dark';
  onToggleTheme: () => void;
  currentThemePreset?: ChatThemePreset;
  onSelectThemePreset?: (preset: ChatThemePreset) => void;
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

export default function SettingsModal({
  isOpen,
  onClose,
  theme,
  onToggleTheme,
  currentThemePreset = 'classic-purple',
  onSelectThemePreset
}: SettingsModalProps) {

  const { user, profile, refreshProfile, signOut } = useAuth();
  const [activeTab, setActiveTab] = useState<'profile' | 'appearance' | 'privacy' | 'security' | 'account'>('profile');

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
    if (profile) {
      setDisplayName(profile.displayName || '');
      setUsername(profile.username || '');
      setBio((profile as any).bio || '');
      setCustomStatus((profile as any).customStatus || '');
    }
  }, [profile]);

  useEffect(() => {
    if (!isOpen) return;

    const fetchPrivacyAndDevices = async () => {
      try {
        const token = localStorage.getItem('wibby-token') || '';
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
  }, [isOpen]);

  if (!isOpen) return null;

  const handleSaveProfile = async (e: React.FormEvent) => {
    e.preventDefault();
    setSavingProfile(true);
    setProfileMsg('');
    setIsProfileError(false);
    try {
      const token = localStorage.getItem('wibby-token') || '';
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
    if (!e.target.files || !e.target.files[0]) return;
    const file = e.target.files[0];
    const fd = new FormData();
    fd.append('avatar', file);

    try {
      const token = localStorage.getItem('wibby-token') || '';
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
    try {
      const token = localStorage.getItem('wibby-token') || '';
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
    setDeleting(true);
    try {
      const token = localStorage.getItem('wibby-token') || '';
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
            <span className="settings-header-icon">⚙️</span>
            <h3 className="settings-header-title">Settings</h3>
          </div>
          <button className="settings-modal-close" onClick={onClose} aria-label="Close">✕</button>
        </div>

        <div className="settings-modal-layout">
          {/* Sidebar Tabs */}
          <nav className="settings-modal-nav">
            <button
              className={`settings-nav-item ${activeTab === 'profile' ? 'active' : ''}`}
              onClick={() => setActiveTab('profile')}
            >
              👤 Profile
            </button>
            <button
              className={`settings-nav-item ${activeTab === 'appearance' ? 'active' : ''}`}
              onClick={() => setActiveTab('appearance')}
            >
              🎨 Appearance
            </button>
            <button
              className={`settings-nav-item ${activeTab === 'privacy' ? 'active' : ''}`}
              onClick={() => setActiveTab('privacy')}
            >
              🔒 Privacy
            </button>
            <button
              className={`settings-nav-item ${activeTab === 'security' ? 'active' : ''}`}
              onClick={() => setActiveTab('security')}
            >
              🛡️ Security & Sessions
            </button>
            <button
              className={`settings-nav-item danger ${activeTab === 'account' ? 'active' : ''}`}
              onClick={() => setActiveTab('account')}
            >
              ⚠️ Account
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
                  <label className="settings-group-title">Chat Wallpaper / Theme</label>
                  <div className="settings-theme-grid">
                    {THEME_PRESETS.map(preset => (
                      <button
                        key={preset.id}
                        type="button"
                        className={`preset-select-card ${currentThemePreset === preset.id ? 'active' : ''}`}
                        onClick={() => onSelectThemePreset?.(preset.id)}
                      >
                        <div className="preset-swatch-large" style={{ background: preset.gradient }} />
                        <span className="preset-name">{preset.name}</span>
                      </button>
                    ))}
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
