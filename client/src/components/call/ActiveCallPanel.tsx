import React, { useState, useRef, useEffect, useCallback } from 'react';

import { useCall } from '../../context/CallContext';
import { useSocket } from '../../context/SocketContext';
import { rtcService } from '../../services/rtcService';
import { resolvePartnerName } from '../../utils/partnerName';
import { resolveAvatarUrl } from '../../utils/avatar';
import TogetherPlayer, { parseMediaUrl } from '../together/TogetherPlayer';
import MessageArea from '../MessageArea';
import './CallModal.css';

function formatCallDuration(seconds: number): string {
  const mins = Math.floor(seconds / 60);
  const secs = seconds % 60;
  const paddedMins = String(mins).padStart(2, '0');
  const paddedSecs = String(secs).padStart(2, '0');
  return `${paddedMins}:${paddedSecs}`;
}

const PIP_CONFIG = {
  mobile: { width: 108, height: 156, bottomOffset: 96, rightOffset: 12 },
  laptop: { width: 180, height: 112, bottomOffset: 24, rightOffset: 24 }
} as const;

const MemoizedVideoStage = React.memo(function MemoizedVideoStage({
  viewMode,
  setViewMode,
  isScreenSharing,
  isRemoteScreenSharing,
  isScreenshareFullscreen,
  setIsScreenshareFullscreen: _setIsScreenshareFullscreen,
  hideFloatingTiles,
  setHideFloatingTiles: _setHideFloatingTiles,
  toggleFullscreen,
  isFullscreen,
  focusedParticipant,
  setFocusedParticipant,
  remoteVideoRef,
  localVideoRef,
  screenVideoRef,
  remoteScreenVideoRef,
  isRemoteCameraOff,
  isCameraOff,
  isCameraUnavailable,
  isRemoteMuted,
  isConnected,
  isReconnecting,
  reconnectStatusMessage,
  isRemoteSpeaking,
  partnerName,
  initial,
  avatar,
  flipCamera,
  currentFacingMode,
  stopScreenSharing,
  conversationId,
  socket,
  movieUrl,
  setMovieUrl,
  movieInput,
  setMovieInput,
  handleStartMovie,
  partner,
  isVideo = true,
  isLocalMuted = false
}: {
  viewMode: 'grid' | 'stacked' | 'pip' | 'screenshare' | 'moviemode';
  setViewMode: React.Dispatch<React.SetStateAction<'stacked' | 'pip' | 'screenshare' | 'moviemode'>>;
  isScreenSharing: boolean;
  isRemoteScreenSharing: boolean;
  isScreenshareFullscreen: boolean;
  setIsScreenshareFullscreen: React.Dispatch<React.SetStateAction<boolean>>;
  hideFloatingTiles?: boolean;
  setHideFloatingTiles?: React.Dispatch<React.SetStateAction<boolean>>;
  toggleFullscreen?: () => Promise<void>;
  isFullscreen?: boolean;
  focusedParticipant: 'none' | 'remote' | 'local';
  setFocusedParticipant: React.Dispatch<React.SetStateAction<'none' | 'remote' | 'local'>>;
  remoteVideoRef: React.RefObject<HTMLVideoElement | null>;
  localVideoRef: React.RefObject<HTMLVideoElement | null>;
  screenVideoRef?: React.RefObject<HTMLVideoElement | null>;
  remoteScreenVideoRef?: React.RefObject<HTMLVideoElement | null>;
  isRemoteCameraOff: boolean;
  isCameraOff: boolean;
  isCameraUnavailable: boolean;
  isRemoteMuted: boolean;
  isConnected: boolean;
  isReconnecting: boolean;
  reconnectStatusMessage: string | null;
  isRemoteSpeaking: boolean;
  partnerName: string;
  initial: string;
  avatar?: string;
  flipCamera: () => Promise<boolean>;
  currentFacingMode: 'user' | 'environment';
  stopScreenSharing?: () => Promise<void> | void;
  conversationId?: string;
  socket?: any;
  movieUrl?: string;
  setMovieUrl?: React.Dispatch<React.SetStateAction<string>>;
  movieInput?: string;
  setMovieInput?: React.Dispatch<React.SetStateAction<string>>;
  handleStartMovie?: (url: string) => void;
  partner?: any;
  isVideo?: boolean;
  isLocalMuted?: boolean;
}) {
  const { isMinimized, minimizeCall, expandCall, toggleMute, toggleCamera } = useCall();
  const localPanelRef = useRef<HTMLDivElement | null>(null);
  const posRef = useRef<{ x: number; y: number } | null>(null);
  const isDraggingRef = useRef(false);
  const hasDraggedRef = useRef(false);
  const dragStartRef = useRef<{ pointerX: number; pointerY: number; pipX: number; pipY: number } | null>(null);
  const [isMobile, setIsMobile] = useState<boolean>(() => typeof window !== 'undefined' ? window.innerWidth < 640 : false);

  useEffect(() => {
    const handleWinResize = () => {
      setIsMobile(window.innerWidth < 640);
    };
    window.addEventListener('resize', handleWinResize);
    return () => window.removeEventListener('resize', handleWinResize);
  }, []);

  const isLocalPip = viewMode === 'pip' || focusedParticipant === 'remote';

  // Handle positioning when entering PiP mode vs Stacked mode
  useEffect(() => {
    if (!localPanelRef.current) return;
    if (isLocalPip) {
      const mobileActive = window.innerWidth <= 768;
      const dims = mobileActive ? PIP_CONFIG.mobile : PIP_CONFIG.laptop;
      const safeX = Math.max(8, window.innerWidth - dims.width - dims.rightOffset);
      const safeY = Math.max(mobileActive ? 64 : 8, window.innerHeight - dims.height - dims.bottomOffset);
      posRef.current = { x: safeX, y: safeY };
      localPanelRef.current.style.transform = `translate3d(${safeX}px, ${safeY}px, 0)`;
    } else {
      // In Grid or Stacked mode, or when local is focused, clear inline transform so it naturally docks
      localPanelRef.current.style.transform = '';
      posRef.current = null;
    }
  }, [isLocalPip, viewMode, focusedParticipant]);

  // Window resize handler: clamps PiP within safe boundaries
  useEffect(() => {
    const handleResize = () => {
      if (!isLocalPip || !localPanelRef.current || !posRef.current) return;
      const mobileActive = window.innerWidth <= 768;
      const dims = mobileActive ? PIP_CONFIG.mobile : PIP_CONFIG.laptop;
      const minX = 8;
      const minY = mobileActive ? 64 : 8;
      const maxX = Math.max(minX, window.innerWidth - dims.width - (mobileActive ? 12 : 16));
      const maxY = Math.max(minY, window.innerHeight - dims.height - (mobileActive ? 84 : 16));
      const clampedX = Math.max(minX, Math.min(posRef.current.x, maxX));
      const clampedY = Math.max(minY, Math.min(posRef.current.y, maxY));
      posRef.current = { x: clampedX, y: clampedY };
      localPanelRef.current.style.transform = `translate3d(${clampedX}px, ${clampedY}px, 0)`;
    };
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, [isLocalPip]);

  // Global safety net for pointer releases while dragging
  useEffect(() => {
    const handleGlobalPointerUp = () => {
      if (isDraggingRef.current) {
        isDraggingRef.current = false;
        dragStartRef.current = null;
        if (localPanelRef.current) {
          localPanelRef.current.classList.remove('is-dragging');
        }
      }
    };
    window.addEventListener('pointerup', handleGlobalPointerUp);
    window.addEventListener('pointercancel', handleGlobalPointerUp);
    return () => {
      window.removeEventListener('pointerup', handleGlobalPointerUp);
      window.removeEventListener('pointercancel', handleGlobalPointerUp);
    };
  }, []);

  // Drag handlers for PiP mode (zero React re-renders during dragging)
  const handlePointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!isLocalPip) return;
    if ((e.target as HTMLElement).closest('button')) return;
    if (!localPanelRef.current) return;

    e.preventDefault();
    e.stopPropagation();

    try {
      e.currentTarget.setPointerCapture(e.pointerId);
    } catch { }

    const mobileActive = window.innerWidth <= 768;
    const dims = mobileActive ? PIP_CONFIG.mobile : PIP_CONFIG.laptop;
    const currentPos = posRef.current || {
      x: Math.max(8, window.innerWidth - dims.width - dims.rightOffset),
      y: Math.max(mobileActive ? 64 : 8, window.innerHeight - dims.height - dims.bottomOffset)
    };

    dragStartRef.current = {
      pointerX: e.clientX,
      pointerY: e.clientY,
      pipX: currentPos.x,
      pipY: currentPos.y
    };
    isDraggingRef.current = true;
    hasDraggedRef.current = false;
    localPanelRef.current.classList.add('is-dragging');
  };

  const handlePointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!isLocalPip || !isDraggingRef.current || !dragStartRef.current || !localPanelRef.current) return;

    const deltaX = e.clientX - dragStartRef.current.pointerX;
    const deltaY = e.clientY - dragStartRef.current.pointerY;
    if (Math.hypot(deltaX, deltaY) > 3) {
      hasDraggedRef.current = true;
    }

    const targetX = dragStartRef.current.pipX + deltaX;
    const targetY = dragStartRef.current.pipY + deltaY;

    const mobileActive = window.innerWidth <= 768;
    const dims = mobileActive ? PIP_CONFIG.mobile : PIP_CONFIG.laptop;

    const minX = 8;
    const minY = mobileActive ? 64 : 8;
    const maxX = Math.max(minX, window.innerWidth - dims.width - (mobileActive ? 12 : 16));
    const maxY = Math.max(minY, window.innerHeight - dims.height - (mobileActive ? 84 : 16));

    const clampedX = Math.max(minX, Math.min(targetX, maxX));
    const clampedY = Math.max(minY, Math.min(targetY, maxY));

    posRef.current = { x: clampedX, y: clampedY };
    localPanelRef.current.style.transform = `translate3d(${clampedX}px, ${clampedY}px, 0)`;
  };

  const handlePointerUp = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!isDraggingRef.current) return;
    isDraggingRef.current = false;
    dragStartRef.current = null;
    if (localPanelRef.current) {
      localPanelRef.current.classList.remove('is-dragging');
    }
    try {
      e.currentTarget.releasePointerCapture(e.pointerId);
    } catch { }
  };

  const handleRemoteClick = (e: React.MouseEvent) => {
    if ((e.target as HTMLElement).closest('button')) return;
    // On mobile touch viewports, tapping video should not trigger accidental layout swaps
    if (isMobile) return;
    if (viewMode === 'pip' || focusedParticipant === 'remote') {
      setViewMode('stacked');
      setFocusedParticipant('none');
    } else {
      setViewMode('pip');
      setFocusedParticipant('none');
    }
  };

  const handleLocalClick = (e: React.MouseEvent) => {
    if (hasDraggedRef.current) return;
    if ((e.target as HTMLElement).closest('button')) return;
    // When in PiP mode (small popup), clicking the popup should NOT disrupt or hijack the other user's video!
    if (isLocalPip) return;
    if (isMobile) return;
    setFocusedParticipant(prev => (prev === 'local' ? 'none' : 'local'));
  };

  const isScreenshareActive = Boolean(isScreenSharing || isRemoteScreenSharing || viewMode === 'screenshare');

  if (isScreenshareActive) {
    const isLocalSharing = isScreenSharing;

    return (
      <div className={`call-video-stage view-mode-screenshare ${isScreenshareFullscreen ? 'is-hero-fullscreen' : ''}`}>
        <div className="call-stage-presentation-frame">
          {/* Main Hero: Shared Screen (Uncropped, Crystal 1080p, Black Background, Never Mirrored) */}
          <div className="call-screenshare-main">
            {/* Clean Screen-Share HUD (Compact, Non-intrusive) */}
            <div className="call-screenshare-hud">
              <div className="call-screenshare-hud-info">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                  <rect x="2" y="3" width="20" height="14" rx="2" />
                  <line x1="8" y1="21" x2="16" y2="21" />
                  <line x1="12" y1="17" x2="12" y2="21" />
                </svg>
                <span className="call-screenshare-hud-text">
                  {isLocalSharing ? "You're sharing" : `${partnerName} is sharing`}
                </span>
              </div>
              {isLocalSharing && stopScreenSharing && (
                <button
                  type="button"
                  className="call-screenshare-hud-stop-btn"
                  onClick={() => stopScreenSharing()}
                  title="Stop sharing"
                  aria-label="Stop sharing"
                >
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                    <line x1="18" y1="6" x2="6" y2="18" />
                    <line x1="6" y1="18" x2="18" y2="6" />
                  </svg>
                  <span>Stop</span>
                </button>
              )}
            </div>

            {/* Main Shared Screen Presentation: exactly ONE video element */}
            {isLocalSharing ? (
              <video
                ref={(el) => {
                  if (screenVideoRef) (screenVideoRef as any).current = el;
                  if (el) {
                    rtcService.bindScreenVideoElement(el);
                    const stream = rtcService.getScreenStream();
                    if (stream && el.srcObject !== stream) {
                      el.srcObject = stream;
                    }
                    el.play().catch(() => { });
                  }
                }}
                className="call-video-fg-live is-screen-share"
                autoPlay
                playsInline
                muted
              />
            ) : (
              <video
                ref={(el) => {
                  if (remoteScreenVideoRef) (remoteScreenVideoRef as any).current = el;
                  if (el) {
                    rtcService.bindScreenVideoElement(el);
                    const stream = rtcService.getRemoteScreenStream() || rtcService.getRemoteVideoStream();
                    if (stream && el.srcObject !== stream) {
                      el.srcObject = stream;
                    }
                    el.play().catch(() => { });
                  }
                }}
                className="call-video-fg-live is-screen-share"
                autoPlay
                playsInline
                muted
              />
            )}
          </div>

          {/* Right Stacked Column: Both users stacked vertically (floating when full screen) */}
          <div className={`call-screenshare-sidebar ${isScreenshareFullscreen && hideFloatingTiles ? 'tiles-hidden' : ''}`}>
            {/* Top Tile: Partner User (Live Remote Video Feed) */}
            <div className="call-sidebar-user-tile remote">
              <video
                ref={(el) => {
                  if (remoteVideoRef) (remoteVideoRef as any).current = el;
                  if (el) {
                    rtcService.bindRemoteVideoElement(el);
                    const stream = rtcService.getRemoteVideoStream();
                    if (stream && el.srcObject !== stream) {
                      el.srcObject = stream;
                    }
                    el.play().catch(() => { });
                  }
                }}
                className={`call-video-fg-live ${isRemoteCameraOff || !isConnected ? 'hidden' : ''}`}
                autoPlay
                playsInline
                muted
              />
              {(isRemoteCameraOff || !isConnected) && (
                <div className="call-video-placeholder">
                  <div className="call-avatar-wrapper" style={{ width: 56, height: 56 }}>
                    <div className="call-avatar" style={{ width: 50, height: 50, fontSize: 20 }}>
                      {avatar ? <img src={avatar} alt="" /> : <span>{initial}</span>}
                    </div>
                  </div>
                </div>
              )}
            </div>

            {/* Bottom Tile: You (Live Local Camera Feed) */}
            <div className={`call-sidebar-user-tile local ${currentFacingMode === 'environment' ? 'is-rear-camera' : ''}`}>
              <video
                ref={(el) => {
                  if (localVideoRef) (localVideoRef as any).current = el;
                  if (el) {
                    rtcService.bindLocalVideoElement(el);
                    const stream = rtcService.getLocalStream();
                    if (stream && el.srcObject !== stream) {
                      el.srcObject = stream;
                    }
                    el.play().catch(() => { });
                  }
                }}
                className={`call-video-fg-live local-main ${currentFacingMode === 'environment' ? 'is-rear-camera' : ''} ${isCameraOff || isCameraUnavailable ? 'hidden' : ''}`}
                autoPlay
                playsInline
                muted
              />
              {(isCameraOff || isCameraUnavailable) && (
                <div className="call-video-placeholder">
                  <div className="call-avatar-wrapper" style={{ width: 56, height: 56 }}>
                    <div className="call-avatar" style={{ width: 50, height: 50, fontSize: 20 }}>
                      <span>Y</span>
                    </div>
                  </div>
                </div>
              )}
              {!isCameraOff && !isCameraUnavailable && (
                <button
                  type="button"
                  className="call-panel-switch-cam-btn"
                  style={{
                    position: 'absolute',
                    bottom: 8,
                    right: 8,
                    zIndex: 10,
                    width: 26,
                    height: 26,
                    background: 'rgba(0, 0, 0, 0.45)',
                    backdropFilter: 'blur(8px)',
                    WebkitBackdropFilter: 'blur(8px)',
                    border: '1px solid rgba(255, 255, 255, 0.15)',
                    borderRadius: '50%',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    cursor: 'pointer',
                    color: '#fff'
                  }}
                  onClick={(e) => {
                    e.stopPropagation();
                    flipCamera();
                  }}
                  title={currentFacingMode === 'user' ? 'Switch camera' : 'Front camera'}
                >
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                    <polyline points="23 4 23 10 17 10" />
                    <polyline points="1 20 1 14 7 14" />
                    <path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15" />
                  </svg>
                </button>
              )}
            </div>
          </div>
        </div>
      </div>
    );
  }

  if (viewMode === 'moviemode') {
    return (
      <div className="call-video-stage view-mode-moviemode">
        {/* Compact Modern Movie Header */}
        <div className="call-moviemode-header">
          <div className="call-moviemode-header-left">
            <div className="call-moviemode-brand">
              <span className="call-moviemode-brand-icon">🎬</span>
              <span className="call-moviemode-brand-title">Movie Mode</span>
            </div>
            <div className="call-moviemode-sync-pill" title="Synchronized playback engine active">
              <span className="call-moviemode-sync-dot" />
              <span>Synced</span>
            </div>
          </div>
          <div className="call-moviemode-header-actions">
            {movieUrl && setMovieUrl && (
              <button
                type="button"
                className="call-moviemode-hdr-btn"
                onClick={() => {
                  setMovieUrl('');
                  if (socket && conversationId) {
                    socket.emit('together:end', { conversationId });
                  }
                }}
                title="Change movie source"
                aria-label="Change movie"
              >
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                  <polyline points="23 4 23 10 17 10" />
                  <path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10" />
                </svg>
                <span>Change</span>
              </button>
            )}
            <button
              type="button"
              className="call-moviemode-hdr-btn"
              onClick={minimizeCall}
              title="Minimize to floating card"
              aria-label="Minimize Movie Mode"
            >
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                <line x1="5" y1="12" x2="19" y2="12" />
              </svg>
              <span>Minimize</span>
            </button>
            <button
              type="button"
              className="call-moviemode-hdr-btn"
              onClick={() => toggleFullscreen?.()}
              title={isFullscreen ? 'Exit Fullscreen' : 'Enter Fullscreen'}
              aria-label="Toggle Fullscreen"
            >
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                {isFullscreen ? (
                  <>
                    <polyline points="4 14 10 14 10 20" />
                    <polyline points="20 10 14 10 14 4" />
                    <line x1="14" y1="10" x2="21" y2="3" />
                    <line x1="3" y1="21" x2="10" y2="14" />
                  </>
                ) : (
                  <>
                    <polyline points="15 3 21 3 21 9" />
                    <polyline points="9 21 3 21 3 15" />
                    <line x1="21" y1="3" x2="14" y2="10" />
                    <line x1="3" y1="21" x2="10" y2="14" />
                  </>
                )}
              </svg>
              <span>{isFullscreen ? 'Exit Full' : 'Fullscreen'}</span>
            </button>
            <button
              type="button"
              className="call-moviemode-hdr-btn exit-btn"
              onClick={() => setViewMode('stacked')}
              title="Exit Movie Mode"
              aria-label="Exit Movie Mode"
            >
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <line x1="18" y1="6" x2="6" y2="18" />
                <line x1="6" y1="18" x2="18" y2="6" />
              </svg>
              <span>Exit</span>
            </button>
          </div>
        </div>

        <div className="call-stage-presentation-frame">
          {/* Main Hero: Large Movie (70-75% Desktop) */}
          <div className="call-moviemode-main">
            {movieUrl ? (
              <div className="call-moviemode-player-container">
                <TogetherPlayer
                  inline
                  isCallMinimized={isMinimized}
                  onExpandCall={expandCall}
                  onMinimizeCall={minimizeCall}
                  onToggleFullscreen={toggleFullscreen}
                  conversationId={conversationId || ''}
                  partnerName={partnerName}
                  onClose={() => {
                    setMovieUrl?.('');
                    setViewMode?.('stacked');
                  }}
                />
              </div>
            ) : (
              <div className="call-moviemode-empty-state">
                <div className="call-moviemode-empty-card">
                  <div className="call-moviemode-empty-icon-box">
                    <span className="call-moviemode-empty-icon">🎬</span>
                  </div>
                  <h3 className="call-moviemode-empty-title">Start Watching Together</h3>
                  <p className="call-moviemode-empty-desc">
                    Paste a YouTube or supported video link to stream synchronously with live video feeds
                  </p>
                  <form
                    className="call-moviemode-empty-form"
                    onSubmit={(e) => {
                      e.preventDefault();
                      const target = movieInput?.trim() || 'https://www.youtube.com/watch?v=aqz-KE-bpKQ';
                      if (handleStartMovie) {
                        handleStartMovie(target);
                      }
                    }}
                  >
                    <div className="call-moviemode-input-row">
                      <input
                        type="text"
                        inputMode="url"
                        autoCapitalize="none"
                        autoCorrect="off"
                        spellCheck="false"
                        className="call-moviemode-input"
                        placeholder="Paste YouTube or video link..."
                        value={movieInput || ''}
                        onChange={(e) => setMovieInput?.(e.target.value)}
                        autoFocus
                      />
                      <button
                        type="submit"
                        className="call-moviemode-submit-btn"
                      >
                        Play Movie
                      </button>
                    </div>
                  </form>
                  <div className="call-moviemode-sample-chips">
                    <span className="call-moviemode-chip-label">Try sample:</span>
                    <button
                      type="button"
                      className="call-moviemode-chip"
                      onClick={() => {
                        setMovieInput?.('https://www.youtube.com/watch?v=aqz-KE-bpKQ');
                        handleStartMovie?.('https://www.youtube.com/watch?v=aqz-KE-bpKQ');
                      }}
                    >
                      🎬 Big Buck Bunny
                    </button>
                    <button
                      type="button"
                      className="call-moviemode-chip"
                      onClick={() => {
                        setMovieInput?.('https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/BigBuckBunny.mp4');
                        handleStartMovie?.('https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/BigBuckBunny.mp4');
                      }}
                    >
                      🍿 Sample MP4
                    </button>
                    <button
                      type="button"
                      className="call-moviemode-chip"
                      onClick={() => {
                        setMovieInput?.('https://www.youtube.com/watch?v=jfKfPfyJRdk');
                        handleStartMovie?.('https://www.youtube.com/watch?v=jfKfPfyJRdk');
                      }}
                    >
                      🎵 Lo-Fi Beats
                    </button>
                  </div>
                  <span className="call-moviemode-supported-hint">
                    Supports YouTube • MP4 / WebM • Spotify
                  </span>
                </div>
              </div>
            )}
          </div>

          {/* Right Column: Stacked Users (Top) + Movie Chat (Bottom) (25-30% Desktop) */}
          <div className="call-moviemode-sidebar">
            <div className="call-moviemode-users-strip">
              {/* User 1: Partner User (Taller, object-fit: cover) */}
              <div className="call-moviemode-user-tile remote">
                <video
                  ref={(el) => {
                    if (remoteVideoRef) (remoteVideoRef as any).current = el;
                    if (el) {
                      rtcService.bindRemoteVideoElement(el);
                      const stream = rtcService.getRemoteVideoStream();
                      if (stream && el.srcObject !== stream) {
                        el.srcObject = stream;
                      }
                      el.play().catch(() => { });
                    }
                  }}
                  className={`call-video-fg-live ${(!isVideo || isRemoteCameraOff || !isConnected) ? 'hidden' : ''}`}
                  autoPlay
                  playsInline
                  muted
                />
                {(!isVideo || isRemoteCameraOff || !isConnected) && (
                  <div className="call-video-placeholder">
                    <div className="call-avatar-wrapper" style={{ width: 56, height: 56, position: 'relative' }}>
                      {isConnected && isRemoteSpeaking && <div className="call-pulse-ring speaking" />}
                      <div className={`call-avatar ${isRemoteSpeaking ? 'avatar-speaking' : ''}`} style={{ width: 50, height: 50, fontSize: 20 }}>
                        {avatar ? (
                          <img
                            src={resolveAvatarUrl(avatar) || avatar}
                            alt=""
                            onError={(e) => {
                              (e.target as HTMLElement).style.display = 'none';
                            }}
                          />
                        ) : (
                          <span>{initial}</span>
                        )}
                      </div>
                    </div>
                  </div>
                )}
                <div className="call-moviemode-tile-badge">
                  <span className="call-moviemode-tile-name">{partnerName}</span>
                  {isRemoteMuted && <span className="call-moviemode-tile-mute" title="Partner muted">🔇</span>}
                </div>
              </div>

              {/* User 2: You (Taller, object-fit: cover) */}
              <div className={`call-moviemode-user-tile local ${currentFacingMode === 'environment' ? 'is-rear-camera' : ''}`}>
                <video
                  ref={(el) => {
                    if (localVideoRef) (localVideoRef as any).current = el;
                    if (el) {
                      rtcService.bindLocalVideoElement(el);
                      const stream = rtcService.getLocalStream();
                      if (stream && el.srcObject !== stream) {
                        el.srcObject = stream;
                      }
                      el.play().catch(() => { });
                    }
                  }}
                  className={`call-video-fg-live local-main ${currentFacingMode === 'environment' ? 'is-rear-camera' : ''} ${(!isVideo || isCameraOff || isCameraUnavailable) ? 'hidden' : ''}`}
                  autoPlay
                  playsInline
                  muted
                />
                {(!isVideo || isCameraOff || isCameraUnavailable) && (
                  <div className="call-video-placeholder">
                    <div className="call-avatar-wrapper" style={{ width: 56, height: 56, position: 'relative' }}>
                      <div className="call-avatar" style={{ width: 50, height: 50, fontSize: 20 }}>
                        <span>Y</span>
                      </div>
                    </div>
                  </div>
                )}
                <div className="call-moviemode-tile-badge">
                  <span className="call-moviemode-tile-name">You</span>
                  {isLocalMuted && <span className="call-moviemode-tile-mute" title="You are muted">🔇</span>}
                </div>
                {/* Tile Action Controls for Quick Interaction */}
                <div className="call-moviemode-tile-actions">
                  <button
                    type="button"
                    className={`call-moviemode-tile-action-btn ${isLocalMuted ? 'muted' : ''}`}
                    onClick={(e) => {
                      e.stopPropagation();
                      toggleMute();
                    }}
                    title={isLocalMuted ? 'Unmute microphone' : 'Mute microphone'}
                    aria-label={isLocalMuted ? 'Unmute microphone' : 'Mute microphone'}
                  >
                    {isLocalMuted ? '🔇' : '🎙️'}
                  </button>
                  <button
                    type="button"
                    className={`call-moviemode-tile-action-btn ${isCameraOff ? 'cam-off' : ''}`}
                    onClick={(e) => {
                      e.stopPropagation();
                      toggleCamera();
                    }}
                    title={isCameraOff ? 'Turn camera on' : 'Turn camera off'}
                    aria-label={isCameraOff ? 'Turn camera on' : 'Turn camera off'}
                  >
                    {isCameraOff ? '🚫' : '📹'}
                  </button>
                  {isVideo && !isCameraOff && !isCameraUnavailable && (
                    <button
                      type="button"
                      className="call-moviemode-tile-action-btn"
                      onClick={(e) => {
                        e.stopPropagation();
                        flipCamera();
                      }}
                      title="Switch camera"
                      aria-label="Switch camera"
                    >
                      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M20 7h-3a2 2 0 0 1-2-2V2" />
                        <path d="M9 2H4a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-5" />
                        <path d="M14 2v3a2 2 0 0 0 2 2h4" />
                        <circle cx="10" cy="13" r="3" />
                        <path d="M16 10l2 2-2 2" />
                      </svg>
                    </button>
                  )}
                </div>
              </div>
            </div>

            {/* Integrated Movie Chat with Independent Scrolling */}
            <div className="call-moviemode-chat-container">
              <div className="call-moviemode-chat-header">
                <span>💬 Movie Chat</span>
              </div>
              <div className="call-moviemode-chat-body">
                <MessageArea
                  conversationId={conversationId || ''}
                  partner={partner}
                  isMovieMode={true}
                />
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className={`call-video-stage view-mode-${viewMode} ${focusedParticipant !== 'none' ? 'has-focused-participant' : ''}`}>
      <div className="call-stage-presentation-frame">
        {/* REMOTE PARTICIPANT (Phone or Laptop) */}
        <div
          className={`call-video-panel remote-panel ${focusedParticipant === 'remote'
            ? 'is-focused-main'
            : focusedParticipant === 'local'
              ? 'is-pip-window'
              : ''
            }`}
          onClick={handleRemoteClick}
          aria-label={`Live video of ${partnerName}`}
        >
          {/* Focus Hint on Hover */}
          <div className={`call-panel-focus-hint ${viewMode === 'pip' || focusedParticipant === 'remote' ? 'exit' : ''}`}>
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              {viewMode === 'pip' || focusedParticipant === 'remote' ? (
                <>
                  <line x1="18" y1="6" x2="6" y2="18" />
                  <line x1="6" y1="6" x2="18" y2="18" />
                </>
              ) : (
                <>
                  <polyline points="15 3 21 3 21 9" />
                  <polyline points="9 21 3 21 3 15" />
                  <line x1="21" y1="3" x2="14" y2="10" />
                  <line x1="3" y1="21" x2="10" y2="14" />
                </>
              )}
            </svg>
            <span>{viewMode === 'pip' || focusedParticipant === 'remote' ? 'Exit full screen' : 'Click for full screen'}</span>
          </div>

          {/* Main Remote Video (100% sharp, uncropped, native aspect ratio) */}
          <video
            ref={(el) => {
              if (remoteVideoRef) (remoteVideoRef as any).current = el;
              if (el) {
                rtcService.bindRemoteVideoElement(el);
                const stream = rtcService.getRemoteVideoStream();
                if (stream && el.srcObject !== stream) {
                  el.srcObject = stream;
                }
                el.play().catch(() => {});
              }
            }}
            className={`call-video-fg-live remote-main ${isRemoteCameraOff || !isConnected ? 'hidden' : ''}`}
            autoPlay
            playsInline
            muted
          />

          {/* Remote Camera Off / Connecting Placeholder */}
          {(isRemoteCameraOff || !isConnected) && (
            <div className="call-video-placeholder">
              <div className="call-avatar-wrapper">
                {isConnected && isRemoteSpeaking && <div className="call-pulse-ring speaking" />}
                <div className={`call-avatar ${isRemoteSpeaking ? 'avatar-speaking' : ''}`}>
                  {avatar ? (
                    <img src={avatar} alt={partnerName} />
                  ) : (
                    <span>{initial}</span>
                  )}
                </div>
              </div>
              <h3 className="call-video-placeholder-name">{partnerName}</h3>
              <span className="call-video-placeholder-status">
                {isReconnecting
                  ? (reconnectStatusMessage || 'Connection lost / Trying to reconnect…')
                  : isConnected
                    ? 'Camera is turned off'
                    : 'Connecting video…'}
              </span>
            </div>
          )}

          {/* Remote Identity Badge */}
          <div className="call-panel-identity-label top-user">
            <span className={`call-identity-dot ${isConnected ? 'online' : 'reconnecting'}`} />
            <span className="call-identity-name">{partnerName}</span>
            {isRemoteSpeaking && isConnected && !isRemoteMuted && (
              <span className="call-speaking-wave-tag" title="Speaking">
                <span className="call-wave-bar b1" />
                <span className="call-wave-bar b2" />
                <span className="call-wave-bar b3" />
              </span>
            )}
            {isRemoteMuted && (
              <span className="call-muted-tag" title="Remote user muted" style={{ marginLeft: '6px', color: '#f87171', display: 'flex', alignItems: 'center' }}>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="1" y1="1" x2="23" y2="23"></line><path d="M9 9v3a3 3 0 0 0 5.12 2.12M15 9.34V4a3 3 0 0 0-5.94-.6"></path><path d="M17 16.95A7 7 0 0 1 5 12v-2m14 0v2a7 7 0 0 1-.11 1.23"></path><line x1="12" y1="19" x2="12" y2="23"></line><line x1="8" y1="23" x2="16" y2="23"></line></svg>
              </span>
            )}
          </div>
        </div>

        {/* LOCAL PARTICIPANT (You) */}
        <div
          ref={localPanelRef}
          className={`call-video-panel local-panel ${currentFacingMode === 'environment' ? 'is-rear-camera' : ''
            } ${focusedParticipant === 'local'
              ? 'is-focused-main'
              : isLocalPip
                ? 'is-pip-window'
                : 'is-stacked-tile'
            }`}
          onClick={handleLocalClick}
          onPointerDown={isLocalPip ? handlePointerDown : undefined}
          onPointerMove={isLocalPip ? handlePointerMove : undefined}
          onPointerUp={isLocalPip ? handlePointerUp : undefined}
          onPointerCancel={isLocalPip ? handlePointerUp : undefined}
          aria-label="Your live video preview"
          role={isLocalPip ? 'region' : undefined}
        >
          {/* Focus Hint on Hover */}
          <div className={`call-panel-focus-hint ${focusedParticipant === 'local' ? 'exit' : ''}`}>
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              {focusedParticipant === 'local' ? (
                <>
                  <line x1="18" y1="6" x2="6" y2="18" />
                  <line x1="6" y1="6" x2="18" y2="18" />
                </>
              ) : (
                <>
                  <polyline points="15 3 21 3 21 9" />
                  <polyline points="9 21 3 21 3 15" />
                  <line x1="21" y1="3" x2="14" y2="10" />
                  <line x1="3" y1="21" x2="10" y2="14" />
                </>
              )}
            </svg>
            <span>{focusedParticipant === 'local' ? 'Exit full screen' : 'Click for full screen'}</span>
          </div>

          {/* Main Local Video (100% sharp, complete native frame; un-mirrored when rear camera) */}
          <video
            ref={(el) => {
              if (localVideoRef) (localVideoRef as any).current = el;
              if (el) {
                rtcService.bindLocalVideoElement(el);
                const stream = rtcService.getLocalStream();
                if (stream && el.srcObject !== stream) {
                  el.srcObject = stream;
                }
                el.play().catch(() => {});
              }
            }}
            className={`call-video-fg-live local-main ${currentFacingMode === 'environment' ? 'is-rear-camera' : ''} ${isCameraOff || isCameraUnavailable ? 'hidden' : ''}`}
            autoPlay
            playsInline
            muted
          />

          {/* Camera Off / Unavailable Placeholder */}
          {(isCameraOff || isCameraUnavailable) && (
            <div className={`call-video-placeholder ${isLocalPip ? 'in-pip' : ''}`}>
              <div className="call-avatar-wrapper">
                <div className="call-avatar">
                  <span>Y</span>
                </div>
              </div>
              <h3 className="call-video-placeholder-name">You</h3>
              <span className="call-video-placeholder-status">
                {isCameraUnavailable ? 'Camera unavailable' : 'Camera is turned off'}
              </span>
            </div>
          )}

          {/* Local Identity Badge, Camera Switch, Drag Handle */}
          <div className={`call-panel-identity-label ${isLocalPip ? 'pip-header' : 'bottom-user'}`}>
            <div className="call-pip-badge">
              <span className="call-identity-dot online" />
              <span className="call-identity-name">You</span>
            </div>
            <div className="call-panel-actions">
              {!isCameraOff && !isCameraUnavailable && (
                <button
                  type="button"
                  className="call-panel-switch-cam-btn"
                  onClick={(e) => {
                    e.stopPropagation();
                    flipCamera();
                  }}
                  title={currentFacingMode === 'user' ? 'Switch to rear camera' : 'Switch to front camera'}
                  aria-label={currentFacingMode === 'user' ? 'Switch to rear camera' : 'Switch to front camera'}
                >
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                    <polyline points="23 4 23 10 17 10" />
                    <polyline points="1 20 1 14 7 14" />
                    <path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15" />
                  </svg>
                </button>
              )}
              {isLocalPip && (
                <div className="call-pip-drag-handle" title="Drag to move">
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor">
                    <circle cx="8" cy="6" r="2" />
                    <circle cx="16" cy="6" r="2" />
                    <circle cx="8" cy="12" r="2" />
                    <circle cx="16" cy="12" r="2" />
                    <circle cx="8" cy="18" r="2" />
                    <circle cx="16" cy="18" r="2" />
                  </svg>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
});


interface ActiveCallPanelProps {
  partner?: any;
}

export default function ActiveCallPanel({ partner }: ActiveCallPanelProps = {}) {

  const {
    activeCall,
    callState,
    toggleMute,
    toggleCamera,
    flipCamera,
    isCameraOff,
    isRemoteCameraOff,
    isCameraUnavailable,
    isRemoteMuted,
    remoteMuteNotification,
    currentFacingMode,
    reconnectStatusMessage,
    hangup,
    voiceExperience,
    setVoiceExperience,
    callQuality,
    minimizeCall,
    isRemoteSpeaking,
    availableOutputDevices,
    selectedOutputDeviceId,
    setAudioOutputDevice,
    // Phase 10: Screen Sharing
    isScreenSharing,
    isRemoteScreenSharing,
    startScreenSharing,
    stopScreenSharing,
    requestKeyframe
  } = useCall();

  const containerRef = useRef<HTMLDivElement | null>(null);
  const localVideoRef = useRef<HTMLVideoElement | null>(null);
  const remoteVideoRef = useRef<HTMLVideoElement | null>(null);
  const screenVideoRef = useRef<HTMLVideoElement | null>(null);
  const remoteScreenVideoRef = useRef<HTMLVideoElement | null>(null);

  const { socket } = useSocket();
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [viewMode, setViewMode] = useState<'stacked' | 'pip' | 'screenshare' | 'moviemode'>('stacked');
  const [isScreenshareFullscreen, setIsScreenshareFullscreen] = useState(false);
  const [hideFloatingTiles, setHideFloatingTiles] = useState(false);
  const [focusedParticipant, setFocusedParticipant] = useState<'none' | 'remote' | 'local'>('none');
  const [showControls, setShowControls] = useState(true);
  const controlsTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [screenShareNotice, setScreenShareNotice] = useState<string | null>(null);

  // Movie Mode States
  const [movieUrl, setMovieUrl] = useState<string>('');

  const [movieInput, setMovieInput] = useState<string>('');

  useEffect(() => {
    const handleOpenMovie = () => {
      setViewMode('moviemode');
    };
    window.addEventListener('wibby:open-moviemode', handleOpenMovie);
    return () => window.removeEventListener('wibby:open-moviemode', handleOpenMovie);
  }, []);

  useEffect(() => {
    if (!socket || !activeCall?.conversationId) return;

    /**
     * ActiveCallPanel only tracks session existence to manage viewMode ('moviemode' vs 'stacked').
     * All media playback, syncing, play/pause, volume, and drift handling are encapsulated in <TogetherPlayer inline>.
     */
    const handleSessionActive = (s: any) => {
      if (s && s.mediaUrl) {
        setMovieUrl(s.mediaUrl);
      }
    };
    const handleTogetherEnded = () => {
      setMovieUrl('');
      setViewMode(prev => (prev === 'moviemode' ? 'stacked' : prev));
    };

    socket.on('together:started', handleSessionActive);
    socket.on('together:state', handleSessionActive);
    socket.on('together:ended', handleTogetherEnded);
    return () => {
      socket.off('together:started', handleSessionActive);
      socket.off('together:state', handleSessionActive);
      socket.off('together:ended', handleTogetherEnded);
    };
  }, [socket, activeCall?.conversationId]);

  // Screen share audio availability notification listener
  useEffect(() => {
    const handleNotice = (e: any) => {
      setScreenShareNotice(e.detail || "Screen audio isn't available for this share source/browser.");
      setTimeout(() => setScreenShareNotice(null), 4000);
    };
    window.addEventListener('wibby:screen-audio-notice', handleNotice);
    return () => window.removeEventListener('wibby:screen-audio-notice', handleNotice);
  }, []);

  const handleStartMovie = (url: string) => {
    if (!socket || !activeCall?.conversationId) return;
    const parsed = parseMediaUrl(url);
    setMovieUrl(parsed.url);
    setViewMode('moviemode');
    socket.emit('together:start', {
      conversationId: activeCall.conversationId,
      mediaUrl: parsed.url,
      mediaType: parsed.type,
      title: 'Movie Mode'
    });
  };

  // Auto-switch to screenshare layout when either participant shares screen
  useEffect(() => {
    if (isScreenSharing || isRemoteScreenSharing) {
      setViewMode('screenshare');
      setFocusedParticipant('none');
    } else {
      setViewMode(prev => (prev === 'screenshare' ? 'stacked' : prev));
      setIsScreenshareFullscreen(false);
      setHideFloatingTiles(false);
    }
  }, [isScreenSharing, isRemoteScreenSharing]);

  const isConnected = callState === 'CONNECTED';
  const isReconnecting = callState === 'RECONNECTING';
  const isScreenShareSupported = typeof navigator !== 'undefined' && !!navigator.mediaDevices && typeof (navigator.mediaDevices as any).getDisplayMedia === 'function';

  // In-call connection restored UX (Phase 9 Final)
  const prevCallStateRef = useRef<string>(callState);
  const [showRestoredToast, setShowRestoredToast] = useState(false);

  useEffect(() => {
    if (prevCallStateRef.current === 'RECONNECTING' && callState === 'CONNECTED') {
      setShowRestoredToast(true);
      const timer = setTimeout(() => setShowRestoredToast(false), 3000);
      return () => clearTimeout(timer);
    }
    prevCallStateRef.current = callState;
  }, [callState]);

  // Bind video elements when in video call
  useEffect(() => {
    if (activeCall?.callType === 'video') {
      if (localVideoRef.current) {
        rtcService.bindLocalVideoElement(localVideoRef.current);
      }
      if (remoteVideoRef.current) {
        rtcService.bindRemoteVideoElement(remoteVideoRef.current);
      }
      if (remoteScreenVideoRef.current) {
        rtcService.bindScreenVideoElement(remoteScreenVideoRef.current);
      }
      if (isScreenSharing && screenVideoRef.current) {
        rtcService.bindScreenVideoElement(screenVideoRef.current);
      }
      rtcService.triggerVideoPlayback();
      requestKeyframe();
    }
    const localEl = localVideoRef.current;
    const remoteEl = remoteVideoRef.current;
    const screenEl = screenVideoRef.current;
    const remoteScreenEl = remoteScreenVideoRef.current;
    return () => {
      if (localEl) rtcService.unbindLocalVideoElement(localEl);
      if (remoteEl) rtcService.unbindRemoteVideoElement(remoteEl);
      if (screenEl) rtcService.unbindScreenVideoElement(screenEl);
      if (remoteScreenEl) rtcService.unbindScreenVideoElement(remoteScreenEl);
    };
  }, [activeCall?.callType, callState, isScreenSharing, isRemoteScreenSharing, requestKeyframe, viewMode]);

  // Imperatively attach screen share stream to hero video element as soon as available
  useEffect(() => {
    if (isScreenSharing && screenVideoRef.current) {
      const stream = rtcService.getScreenStream();
      if (stream) {
        if (screenVideoRef.current.srcObject !== stream) {
          screenVideoRef.current.srcObject = stream;
        }
        screenVideoRef.current.play().catch(() => { });
      }
    } else if (isRemoteScreenSharing && remoteScreenVideoRef.current) {
      const stream = rtcService.getRemoteScreenStream() || rtcService.getRemoteVideoStream();
      if (stream) {
        if (remoteScreenVideoRef.current.srcObject !== stream) {
          remoteScreenVideoRef.current.srcObject = stream;
        }
        remoteScreenVideoRef.current.play().catch(() => { });
      }
    }
  }, [isScreenSharing, isRemoteScreenSharing]);

  // Imperatively trigger video playback when connection stabilizes or camera states change
  // This is required to fix black video in Safari when removing 'display: none' (hidden class)
  useEffect(() => {
    if (isConnected && activeCall?.callType === 'video') {
      const timerId = setTimeout(() => {
        rtcService.triggerVideoPlayback();
      }, 50);
      return () => clearTimeout(timerId);
    }
  }, [isConnected, activeCall?.callType, isCameraOff, isRemoteCameraOff, isCameraUnavailable, isScreenSharing, isRemoteScreenSharing, isScreenshareFullscreen]);

  // Window visibility / focus recovery for minimize-maximize and tab switching
  useEffect(() => {
    const handleVisibilityRecovery = () => {
      if (document.visibilityState === 'visible' && activeCall?.callType === 'video') {
        console.log('[WIBBY WEBRTC] Window restored to foreground — recovering video playback and requesting keyframe');
        rtcService.recoverVideoPlayback();
        requestKeyframe();
      }
    };
    document.addEventListener('visibilitychange', handleVisibilityRecovery);
    window.addEventListener('focus', handleVisibilityRecovery);
    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityRecovery);
      window.removeEventListener('focus', handleVisibilityRecovery);
    };
  }, [activeCall?.callType, requestKeyframe]);

  // Fullscreen change listener
  useEffect(() => {
    const handleFsChange = () => {
      setIsFullscreen(!!document.fullscreenElement);
      setTimeout(() => {
        rtcService.recoverVideoPlayback();
        requestKeyframe();
      }, 50);
    };
    document.addEventListener('fullscreenchange', handleFsChange);
    return () => document.removeEventListener('fullscreenchange', handleFsChange);
  }, [requestKeyframe]);

  // Controls auto-hiding during active video calls (3.5s inactivity)
  const handleUserActivity = useCallback(() => {
    setShowControls(true);
    if (controlsTimeoutRef.current) {
      clearTimeout(controlsTimeoutRef.current);
    }
    if (activeCall?.callType === 'video' && isConnected) {
      controlsTimeoutRef.current = setTimeout(() => {
        setShowControls(false);
      }, 3500);
    }
  }, [activeCall?.callType, isConnected]);

  useEffect(() => {
    if (activeCall?.callType === 'video' && isConnected) {
      handleUserActivity();
    } else {
      setShowControls(true);
      if (controlsTimeoutRef.current) clearTimeout(controlsTimeoutRef.current);
    }
    return () => {
      if (controlsTimeoutRef.current) clearTimeout(controlsTimeoutRef.current);
    };
  }, [activeCall?.callType, isConnected, handleUserActivity]);

  const toggleFullscreen = async () => {
    try {
      if (!document.fullscreenElement) {
        if (containerRef.current?.requestFullscreen) {
          await containerRef.current.requestFullscreen();
          setIsFullscreen(true);
          // If in stacked mode, switch layout to full screen (pip)
          if (viewMode === 'stacked') {
            setViewMode('pip');
            setFocusedParticipant('none');
          }
        }
      } else {
        if (document.exitFullscreen) {
          await document.exitFullscreen();
          setIsFullscreen(false);
        }
      }
      setTimeout(() => {
        rtcService.recoverVideoPlayback();
        requestKeyframe();
      }, 50);
    } catch (e) {
      console.warn('Fullscreen toggle failed:', e);
    }
  };

  if (!activeCall) return null;

  const partnerName = resolvePartnerName(activeCall.remoteUser);
  const partnerUsername = (activeCall.remoteUser as any).username ? `@${(activeCall.remoteUser as any).username}` : '';

  const initial = partnerName.charAt(0).toUpperCase();
  const isVideo = activeCall.callType === 'video';

  // -------------------------------------------------------------
  // CALL PRESENTATION STAGE (Video Call or Movie Mode)
  // -------------------------------------------------------------
  if (isVideo || viewMode === 'moviemode') {
    return (
      <div
        ref={containerRef}
        className={`call-overlay call-video-overlay ${isFullscreen ? 'is-fullscreen' : ''} ${isScreenSharing || isRemoteScreenSharing || viewMode === 'screenshare' ? 'is-screenshare-mode' : ''} ${viewMode === 'moviemode' ? 'is-moviemode-mode' : ''}`}
        role="dialog"
        aria-modal="true"
        aria-labelledby="active-video-call-title"
        onMouseMove={handleUserActivity}
        onTouchStart={handleUserActivity}
        onPointerDown={handleUserActivity}
      >
        <MemoizedVideoStage
          viewMode={viewMode}
          setViewMode={setViewMode}
          isScreenSharing={isScreenSharing}
          isRemoteScreenSharing={isRemoteScreenSharing}
          isScreenshareFullscreen={isScreenshareFullscreen}
          setIsScreenshareFullscreen={setIsScreenshareFullscreen}
          hideFloatingTiles={hideFloatingTiles}
          setHideFloatingTiles={setHideFloatingTiles}
          toggleFullscreen={toggleFullscreen}
          isFullscreen={isFullscreen}
          focusedParticipant={focusedParticipant}
          setFocusedParticipant={setFocusedParticipant}
          remoteVideoRef={remoteVideoRef}
          localVideoRef={localVideoRef}
          screenVideoRef={screenVideoRef}
          remoteScreenVideoRef={remoteScreenVideoRef}
          isRemoteCameraOff={!isVideo || isRemoteCameraOff}
          isCameraOff={!isVideo || isCameraOff}
          isCameraUnavailable={isCameraUnavailable}
          isRemoteMuted={isRemoteMuted}
          isConnected={isConnected}
          isReconnecting={isReconnecting}
          reconnectStatusMessage={reconnectStatusMessage}
          isRemoteSpeaking={isRemoteSpeaking}
          partnerName={partnerName}
          initial={initial}
          avatar={resolveAvatarUrl(activeCall.remoteUser.avatar) || activeCall.remoteUser.avatar || undefined}
          flipCamera={flipCamera}
          currentFacingMode={currentFacingMode}
          stopScreenSharing={stopScreenSharing}
          conversationId={activeCall?.conversationId}
          socket={socket}
          movieUrl={movieUrl}
          setMovieUrl={setMovieUrl}
          movieInput={movieInput}
          setMovieInput={setMovieInput}
          handleStartMovie={handleStartMovie}
          partner={partner}
          isVideo={isVideo}
          isLocalMuted={activeCall.isMuted}
        />

        {/* Top Bar Header (Auto-Hiding) */}
        <div className={`call-video-top-bar ${showControls ? 'visible' : 'hidden'}`}>
          <div className="call-video-header-info">
            <span className="call-video-partner-name">{partnerName}</span>
            {partnerUsername && <span className="call-video-partner-handle" style={{ opacity: 0.75, fontSize: '0.85em', marginLeft: '4px' }}>{partnerUsername}</span>}
            <span className="call-status-divider">•</span>
            <span className="call-duration">{formatCallDuration(activeCall.duration)}</span>
            <span className="call-status-divider">•</span>
            {/* Human-Readable In-Call Status Pill (Phase 9 Final) */}
            <span className={`call-header-status-pill ${isReconnecting ? 'reconnecting' : showRestoredToast ? 'restored' : callQuality === 'poor' ? 'unstable' : 'connected'}`}>
              {isReconnecting ? (
                <>
                  <span className="call-status-dot yellow">●</span>
                  <span>Reconnecting…</span>
                </>
              ) : showRestoredToast ? (
                <>
                  <span className="call-status-dot green">●</span>
                  <span>Connection restored</span>
                </>
              ) : callQuality === 'poor' ? (
                <>
                  <span className="call-status-dot yellow">●</span>
                  <span>Connection unstable</span>
                </>
              ) : isConnected ? (
                <>
                  <span className="call-status-dot green">●</span>
                  <span>Connected</span>
                </>
              ) : (
                <>
                  <span className="call-status-dot yellow">●</span>
                  <span>Connecting…</span>
                </>
              )}
            </span>
            {isRemoteSpeaking && isConnected && (
              <>
                <span className="call-status-divider">•</span>
                <span className="call-speaking-tag active">Speaking</span>
              </>
            )}
          </div>

          <div className="call-video-top-actions">
            {/* If full screen or focused, show Split View button to exit full video */}
            {(viewMode === 'pip' || focusedParticipant !== 'none') && (
              <button
                type="button"
                className="call-restore-split-btn"
                onClick={() => {
                  setViewMode('stacked');
                  setFocusedParticipant('none');
                }}
                title="Exit full video and return to split view"
                aria-label="Return to split view"
              >
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <rect x="3" y="3" width="18" height="8" rx="2" />
                  <rect x="3" y="13" width="18" height="8" rx="2" />
                </svg>
                <span>Split View</span>
              </button>
            )}

            {/* Audio Output Device Selector in Video / Movie Mode */}
            {isConnected && availableOutputDevices.length > 1 && (
              <div className="call-device-selector-wrap" style={{ margin: '0 4px', maxWidth: 160 }}>
                <select
                  className="call-device-select"
                  value={selectedOutputDeviceId || ''}
                  onChange={(e) => setAudioOutputDevice(e.target.value)}
                  title="Select audio output device"
                >
                  <option value="">Default Speaker</option>
                  {availableOutputDevices.map((d) => (
                    <option key={d.deviceId} value={d.deviceId}>
                      {d.label || `Device ${d.deviceId.slice(0, 5)}`}
                    </option>
                  ))}
                </select>
              </div>
            )}

            {/* Fullscreen Button */}
            <button
              type="button"
              className="call-icon-btn"
              onClick={toggleFullscreen}
              title={isFullscreen ? 'Exit fullscreen' : 'Fullscreen'}
              aria-label={isFullscreen ? 'Exit fullscreen' : 'Fullscreen'}
            >
              {isFullscreen ? (
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <polyline points="4 14 10 14 10 20" />
                  <polyline points="20 10 14 10 14 4" />
                  <line x1="14" y1="10" x2="21" y2="3" />
                  <line x1="3" y1="21" x2="10" y2="14" />
                </svg>
              ) : (
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <polyline points="15 3 21 3 21 9" />
                  <polyline points="9 21 3 21 3 15" />
                  <line x1="21" y1="3" x2="14" y2="10" />
                  <line x1="3" y1="21" x2="10" y2="14" />
                </svg>
              )}
            </button>

            {/* Minimize Button */}
            <button
              type="button"
              className="call-icon-btn"
              onClick={minimizeCall}
              title="Minimize call to chat"
              aria-label="Minimize call to floating capsule"
            >
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <line x1="5" y1="12" x2="19" y2="12" />
              </svg>
            </button>
          </div>
        </div>



        {/* Dedicated In-Call Connection Status Overlay Card (Phase 9 Final) */}
        {isReconnecting && (
          <div className="call-status-card warning" role="alert">
            <div className="call-status-card-header">
              <span className="call-status-card-spinner" />
              <span className="call-status-card-title">Reconnecting…</span>
              <span className="call-status-dots-anim">
                <span>•</span><span>•</span><span>•</span>
              </span>
            </div>
            <p className="call-status-card-subtitle">
              {reconnectStatusMessage || 'Connection lost / Trying to reconnect…'}
            </p>
          </div>
        )}

        {/* Connection Restored Temporary Toast Notification */}
        {showRestoredToast && (
          <div className="call-status-toast success" role="status">
            <span className="call-status-toast-dot green">●</span>
            <span>Connection restored</span>
          </div>
        )}

        {/* Microphone Unavailable Alert */}
        {activeCall?.error && activeCall.error.toLowerCase().includes('mic') && (
          <div className="call-status-toast error" role="alert">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <circle cx="12" cy="12" r="10" />
              <line x1="12" y1="8" x2="12" y2="12" />
              <line x1="12" y1="16" x2="12.01" y2="16" />
            </svg>
            <span>Microphone unavailable</span>
          </div>
        )}

        {/* Remote Mute Notification Banner (Req 16) */}
        {remoteMuteNotification && (
          <div className="call-status-toast muted-toast" role="status">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <line x1="1" y1="1" x2="23" y2="23" />
              <path d="M9 9v3a3 3 0 0 0 5.12 2.12M15 9.34V4a3 3 0 0 0-5.94-.6" />
              <path d="M17 16.95A7 7 0 0 1 5 12v-2m14 0v2a7 7 0 0 1-.11 1.23" />
            </svg>
            <span>{remoteMuteNotification}</span>
          </div>
        )}

        {/* Screen Share Feedback Toast Notification */}
        {screenShareNotice && (
          <div className="call-status-toast" role="status">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <rect x="2" y="3" width="20" height="14" rx="2" />
              <line x1="8" y1="21" x2="16" y2="21" />
              <line x1="12" y1="17" x2="12" y2="21" />
            </svg>
            <span>{screenShareNotice}</span>
          </div>
        )}

        {/* Bottom Floating Control Bar (Auto-Hiding) */}
        <div className={`call-video-controls-bar ${showControls ? 'visible' : 'hidden'}`}>
          {/* View Layout Toggle Button: Exactly 2 options (Stacked & Full Screen) */}
          <div className="call-control-item">
            <button
              type="button"
              className={`call-btn view-ctrl ${viewMode === 'pip' || focusedParticipant !== 'none' || isScreenshareFullscreen ? 'active' : ''}`}
              onClick={() => {
                if (isScreenSharing || isRemoteScreenSharing || viewMode === 'screenshare') {
                  setIsScreenshareFullscreen(prev => !prev);
                } else {
                  if (viewMode === 'pip' || focusedParticipant !== 'none') {
                    setFocusedParticipant('none');
                    setViewMode('stacked');
                  } else {
                    setFocusedParticipant('none');
                    setViewMode('pip');
                  }
                }
              }}
              title={`Switch layout (Current: ${isScreenSharing || isRemoteScreenSharing || viewMode === 'screenshare'
                ? isScreenshareFullscreen
                  ? 'Screen Share (Full Hero)'
                  : 'Screen Share (Sidebar)'
                : viewMode === 'pip' || focusedParticipant !== 'none'
                  ? 'Full Screen'
                  : 'Stacked'
                })`}
              aria-label="Switch layout"
            >
              {(isScreenSharing || isRemoteScreenSharing || viewMode === 'screenshare') && (
                <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <rect x="2" y="3" width="13" height="18" rx="2" />
                  <rect x="17" y="3" width="5" height="8" rx="1.5" />
                  <rect x="17" y="13" width="5" height="8" rx="1.5" />
                </svg>
              )}
              {!(isScreenSharing || isRemoteScreenSharing || viewMode === 'screenshare') && viewMode === 'stacked' && focusedParticipant === 'none' && (
                <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <rect x="3" y="3" width="18" height="8" rx="2" />
                  <rect x="3" y="13" width="18" height="8" rx="2" />
                </svg>
              )}
              {!(isScreenSharing || isRemoteScreenSharing || viewMode === 'screenshare') && (viewMode === 'pip' || focusedParticipant !== 'none') && (
                <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <rect x="2" y="3" width="20" height="18" rx="2" />
                  <rect x="13" y="12" width="7" height="7" rx="1.5" fill="currentColor" fillOpacity="0.3" />
                </svg>
              )}
            </button>
            <span className="call-btn-label">
              {isScreenSharing || isRemoteScreenSharing || viewMode === 'screenshare'
                ? isScreenshareFullscreen
                  ? 'Full Hero'
                  : 'Sidebar'
                : viewMode === 'pip' || focusedParticipant !== 'none'
                  ? 'Full Screen'
                  : 'Stacked'}
            </span>
          </div>

          {/* Camera Toggle Button (Visible in Video Calls) */}
          {isVideo && (
            <div className="call-control-item">
              <button
                type="button"
                className={`call-btn video-ctrl ${isCameraOff || isCameraUnavailable ? 'muted' : 'active'}`}
                onClick={toggleCamera}
                disabled={isCameraUnavailable}
                title={isCameraOff ? 'Turn on camera' : 'Turn off camera'}
                aria-label={isCameraOff ? 'Turn on camera' : 'Turn off camera'}
              >
                {isCameraOff || isCameraUnavailable ? (
                  <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <line x1="1" y1="1" x2="23" y2="23" />
                    <path d="M21 21H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h3m3-3h6l2 3h4a2 2 0 0 1 2 2v9.34m-7.72-2.06a4 4 0 1 1-5.56-5.56" />
                  </svg>
                ) : (
                  <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <polygon points="23 7 16 12 23 17 23 7" />
                    <rect x="1" y="5" width="15" height="14" rx="2" ry="2" />
                  </svg>
                )}
              </button>
              <span className="call-btn-label">{isCameraOff ? 'Camera off' : 'Camera on'}</span>
            </div>
          )}

          {/* Flip / Switch Camera Button — visible when camera is active in video calls */}
          {isVideo && !isCameraOff && !isCameraUnavailable && (
            <div className="call-control-item">
              <button
                type="button"
                className="call-btn switch-cam-ctrl"
                onClick={() => flipCamera()}
                title={currentFacingMode === 'user' ? 'Switch to rear camera' : 'Switch to front camera'}
                aria-label={currentFacingMode === 'user' ? 'Switch to rear camera' : 'Switch to front camera'}
              >
                {/* Camera flip icon */}
                <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M20 7h-3a2 2 0 0 1-2-2V2" />
                  <path d="M9 2H4a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-5" />
                  <path d="M14 2v3a2 2 0 0 0 2 2h4" />
                  <circle cx="10" cy="13" r="3" />
                  <path d="M16 10l2 2-2 2" />
                </svg>
              </button>
              <span className="call-btn-label">{currentFacingMode === 'user' ? 'Rear' : 'Front'}</span>
            </div>
          )}

          {/* Screen Share Button (Capability detected: only shown when supported) */}
          {isScreenShareSupported && (
            <div className="call-control-item">
              <button
                type="button"
                id="screen-share-btn"
                className={`call-btn screen-share ${isScreenSharing ? 'active' : ''}`}
                onClick={async () => {
                  try {
                    if (isScreenSharing) {
                      stopScreenSharing();
                    } else {
                      await startScreenSharing();
                    }
                  } catch (err: any) {
                    setScreenShareNotice(err?.message || 'Failed to start screen sharing');
                    setTimeout(() => setScreenShareNotice(null), 3500);
                  }
                }}
                title={isScreenSharing ? 'Stop screen sharing' : 'Share screen'}
                aria-label={isScreenSharing ? 'Stop screen sharing' : 'Share screen'}
              >
                {isScreenSharing ? (
                  /* Stop-share icon: monitor with X */
                  <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <rect x="2" y="3" width="20" height="14" rx="2" />
                    <line x1="8" y1="21" x2="16" y2="21" />
                    <line x1="12" y1="17" x2="12" y2="21" />
                    <line x1="9" y1="8" x2="15" y2="14" />
                    <line x1="15" y1="8" x2="9" y2="14" />
                  </svg>
                ) : (
                  /* Share icon: monitor with upward arrow */
                  <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <rect x="2" y="3" width="20" height="14" rx="2" />
                    <line x1="8" y1="21" x2="16" y2="21" />
                    <line x1="12" y1="17" x2="12" y2="21" />
                    <polyline points="8 9 12 5 16 9" />
                    <line x1="12" y1="5" x2="12" y2="13" />
                  </svg>
                )}
              </button>
              <span className="call-btn-label">{isScreenSharing ? 'Stop screen' : 'Screen'}</span>
            </div>
          )}

          {/* Movie Mode Button (Watch Together in Call) */}
          <div className="call-control-item">
            <button
              type="button"
              id="movie-mode-btn"
              className={`call-btn movie-ctrl ${viewMode === 'moviemode' ? 'active' : ''}`}
              onClick={() => {
                if (viewMode === 'moviemode') {
                  setViewMode('stacked');
                } else {
                  setViewMode('moviemode');
                  if (!movieUrl && socket && activeCall?.conversationId) {
                    socket.emit('together:get-state', { conversationId: activeCall.conversationId });
                  }
                }
              }}
              title={viewMode === 'moviemode' ? 'Exit Movie Mode' : 'Movie Mode (Watch Together in Call)'}
              aria-label={viewMode === 'moviemode' ? 'Exit Movie Mode' : 'Movie Mode'}
            >
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <rect x="2" y="2" width="20" height="20" rx="2.18" ry="2.18" />
                <line x1="7" y1="2" x2="7" y2="22" />
                <line x1="17" y1="2" x2="17" y2="22" />
                <line x1="2" y1="12" x2="22" y2="12" />
                <line x1="2" y1="7" x2="7" y2="7" />
                <line x1="2" y1="17" x2="7" y2="17" />
                <line x1="17" y1="17" x2="22" y2="17" />
                <line x1="17" y1="7" x2="22" y2="7" />
              </svg>
            </button>
            <span className="call-btn-label">{viewMode === 'moviemode' ? 'Exit Movie' : 'Movie'}</span>
          </div>

          {/* Microphone Mute Button */}
          <div className="call-control-item">
            <button
              type="button"
              className={`call-btn mute ${activeCall.isMuted ? 'active' : ''}`}
              onClick={toggleMute}
              title={activeCall.isMuted ? 'Unmute microphone' : 'Mute microphone'}
              aria-label={activeCall.isMuted ? 'Unmute microphone' : 'Mute microphone'}
            >
              {activeCall.isMuted ? (
                <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <line x1="1" y1="1" x2="23" y2="23" />
                  <path d="M9 9v3a3 3 0 0 0 5.12 2.12M15 9.34V4a3 3 0 0 0-5.94-.6" />
                  <path d="M17 16.95A7 7 0 0 1 5 12v-2m14 0v2a7 7 0 0 1-.11 1.23" />
                  <line x1="12" y1="19" x2="12" y2="23" />
                  <line x1="8" y1="23" x2="16" y2="23" />
                </svg>
              ) : (
                <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z" />
                  <path d="M19 10v2a7 7 0 0 1-14 0v-2" />
                  <line x1="12" y1="19" x2="12" y2="23" />
                  <line x1="8" y1="23" x2="16" y2="23" />
                </svg>
              )}
            </button>
            <span className="call-btn-label">{activeCall.isMuted ? 'Unmute' : 'Mute'}</span>
          </div>

          {/* End Call Button */}
          <div className="call-control-item">
            <button
              type="button"
              className="call-btn hangup"
              onClick={hangup}
              title="End video call"
              aria-label="End video call"
            >
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <path d="M10.68 13.31a16 16 0 0 0 3.41 2.6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7 2 2 0 0 1 1.72 2v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.42 19.42 0 0 1-3.33-2.67m-2.67-3.34a19.79 19.79 0 0 1-3.07-8.63A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91" />
                <line x1="23" y1="1" x2="1" y2="23" />
              </svg>
            </button>
            <span className="call-btn-label">End</span>
          </div>
        </div>
      </div>
    );
  }

  // -------------------------------------------------------------
  // VOICE CALL LAYOUT (Preserved Phase 8 Voice Experience)
  // -------------------------------------------------------------
  return (
    <div className="call-overlay" role="dialog" aria-modal="true" aria-labelledby="active-call-title">
      <div className="call-card">
        {/* Top Bar: Diagnostics & Minimize to Floating Capsule */}
        <div className="call-card-top-bar" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', width: '100%' }}>


          <button
            type="button"
            className="call-minimize-btn"
            onClick={minimizeCall}
            aria-label="Minimize call to floating capsule"
            title="Minimize call to chat"
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="4 14 10 14 10 20" />
              <polyline points="20 10 14 10 14 4" />
              <line x1="14" y1="10" x2="21" y2="3" />
              <line x1="3" y1="21" x2="10" y2="14" />
            </svg>
          </button>
        </div>



        {/* Reconnecting Status Notification Bar */}
        {isReconnecting && (
          <div className="call-card-reconnecting-bar" role="alert">
            <span className="call-reconnecting-spinner" />
            <span>{reconnectStatusMessage || 'Connection lost / Reconnecting...'}</span>
          </div>
        )}

        {/* Avatar with dynamic speaking indicator */}
        <div className="call-avatar-wrapper">
          {isConnected && isRemoteSpeaking && <div className="call-pulse-ring speaking" />}
          <div className={`call-avatar ${isRemoteSpeaking ? 'avatar-speaking' : ''}`}>
            {activeCall.remoteUser.avatar ? (
              <img
                src={resolveAvatarUrl(activeCall.remoteUser.avatar) || activeCall.remoteUser.avatar}
                alt={partnerName}
                onError={(e) => {
                  (e.target as HTMLElement).style.display = 'none';
                }}
              />
            ) : (
              <span>{initial}</span>
            )}
          </div>
        </div>

        <h2 id="active-call-title" className="call-name">{partnerName}</h2>
        {partnerUsername && (
          <div className="call-partner-handle" style={{ fontSize: '0.9rem', color: 'var(--wibby-text-muted, rgba(255,255,255,0.7))', marginTop: '-2px', marginBottom: '8px' }}>
            {partnerUsername}
          </div>
        )}

        <div className={`call-status-badge ${isConnected ? 'connected' : isReconnecting ? 'reconnecting' : 'connecting'}`}>
          {isReconnecting ? (
            <span>Reconnecting...</span>
          ) : isConnected ? (
            <>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5" />
                <path d="M19.07 4.93a10 10 0 0 1 0 14.14M15.54 8.46a5 5 0 0 1 0 7.07" />
              </svg>
              <span className="call-duration">{formatCallDuration(activeCall.duration)}</span>
              {isRemoteMuted ? (
                <>
                  <span className="call-status-divider">•</span>
                  <span className="call-remote-muted-badge" title={`${partnerName} is muted`}>
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                      <line x1="1" y1="1" x2="23" y2="23" />
                      <path d="M9 9v3a3 3 0 0 0 5.12 2.12M15 9.34V4a3 3 0 0 0-5.94-.6" />
                      <path d="M17 16.95A7 7 0 0 1 5 12v-2m14 0v2a7 7 0 0 1-.11 1.23" />
                      <line x1="12" y1="19" x2="12" y2="23" />
                      <line x1="8" y1="23" x2="16" y2="23" />
                    </svg>
                    <span>Muted</span>
                  </span>
                </>
              ) : (
                <>
                  <span className="call-status-divider">•</span>
                  <span className={`call-speaking-tag ${isRemoteSpeaking ? 'active' : ''}`}>
                    {isRemoteSpeaking ? 'Speaking' : 'Listening'}
                  </span>
                </>
              )}
              <span className="call-status-divider">•</span>
              <span className={`call-quality-dot ${callQuality}`} title={`Audio Quality: ${callQuality}`}>
                {callQuality === 'excellent' && 'HD'}
                {callQuality === 'degraded' && 'Degraded'}
                {callQuality === 'poor' && 'Poor'}
              </span>
            </>
          ) : (
            <span>Connecting...</span>
          )}
        </div>

        {/* Wibby Voice Engine 1.0 Experience Selector (Natural vs Focused vs Spatial) */}
        {isConnected && (
          <div className="call-voice-exp-selector" role="group" aria-label="Voice Experience">
            <button
              type="button"
              className={`call-voice-exp-btn ${voiceExperience === 'natural' ? 'active' : ''}`}
              onClick={() => setVoiceExperience('natural')}
              title="Natural: Pure native WebRTC audio baseline"
              aria-pressed={voiceExperience === 'natural'}
            >
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z" />
                <path d="M19 10v2a7 7 0 0 1-14 0v-2" />
              </svg>
              <span>Natural</span>
            </button>

            <button
              type="button"
              className={`call-voice-exp-btn ${voiceExperience === 'focused' ? 'active' : ''}`}
              onClick={() => setVoiceExperience('focused')}
              title="Focused: Vocal clarity filter & gentle dynamics leveling"
              aria-pressed={voiceExperience === 'focused'}
            >
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                <line x1="4" y1="21" x2="4" y2="14" />
                <line x1="4" y1="10" x2="4" y2="3" />
                <line x1="12" y1="21" x2="12" y2="12" />
                <line x1="12" y1="8" x2="12" y2="3" />
                <line x1="20" y1="21" x2="20" y2="16" />
                <line x1="20" y1="12" x2="20" y2="3" />
                <line x1="1" y1="14" x2="7" y2="14" />
                <line x1="9" y1="8" x2="15" y2="8" />
                <line x1="17" y1="16" x2="23" y2="16" />
              </svg>
              <span>Focused</span>
            </button>

            <button
              type="button"
              className={`call-voice-exp-btn ${voiceExperience === 'spatial' ? 'active' : ''}`}
              onClick={() => setVoiceExperience('spatial')}
              title="Spatial: Natural front conversational presence (mono-safe HRTF)"
              aria-pressed={voiceExperience === 'spatial'}
            >
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="12" cy="12" r="10" />
                <circle cx="12" cy="12" r="3" />
                <path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1 4-10z" />
              </svg>
              <span>Spatial</span>
            </button>
          </div>
        )}

        {/* Audio Output Device Selector */}
        {isConnected && availableOutputDevices.length > 1 && (
          <div className="call-device-selector-wrap">
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M3 18v-6a9 9 0 0 1 18 0v6" />
              <path d="M21 19a2 2 0 0 1-2 2h-1a2 2 0 0 1-2-2v-3a2 2 0 0 1 2-2h3zM3 19a2 2 0 0 0 2 2h1a2 2 0 0 0 2-2v-3a2 2 0 0 0-2-2H3z" />
            </svg>
            <select
              className="call-device-select"
              value={selectedOutputDeviceId || ''}
              onChange={(e) => setAudioOutputDevice(e.target.value)}
              title="Select audio output device"
            >
              <option value="">Default Speaker / Headphones</option>
              {availableOutputDevices.map((d) => (
                <option key={d.deviceId} value={d.deviceId}>
                  {d.label || `Device ${d.deviceId.slice(0, 5)}`}
                </option>
              ))}
            </select>
          </div>
        )}

        {/* Action Controls */}
        <div className="call-actions">
          {/* Watch Together in Voice Call */}
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
            <button
              id="voice-movie-mode-btn"
              type="button"
              className="call-btn movie-ctrl"
              onClick={() => {
                setViewMode('moviemode');
                if (!movieUrl && socket && activeCall?.conversationId) {
                  socket.emit('together:get-state', { conversationId: activeCall.conversationId });
                }
              }}
              title="Watch Together in Call"
              aria-label="Watch Together in Call"
            >
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <rect x="2" y="2" width="20" height="20" rx="2.18" ry="2.18" />
                <line x1="7" y1="2" x2="7" y2="22" />
                <line x1="17" y1="2" x2="17" y2="22" />
                <line x1="2" y1="12" x2="22" y2="12" />
              </svg>
            </button>
            <span className="call-btn-label">Watch</span>
          </div>

          {/* Mute Button */}
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
            <button
              className={`call-btn mute ${activeCall.isMuted ? 'active' : ''}`}
              onClick={toggleMute}
              aria-label={activeCall.isMuted ? 'Unmute microphone' : 'Mute microphone'}
              title={activeCall.isMuted ? 'Unmute' : 'Mute'}
            >
              {activeCall.isMuted ? (
                <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <line x1="1" y1="1" x2="23" y2="23" />
                  <path d="M9 9v3a3 3 0 0 0 5.12 2.12M15 9.34V4a3 3 0 0 0-5.94-.6" />
                  <path d="M17 16.95A7 7 0 0 1 5 12v-2m14 0v2a7 7 0 0 1-.11 1.23" />
                  <line x1="12" y1="19" x2="12" y2="23" />
                  <line x1="8" y1="23" x2="16" y2="23" />
                </svg>
              ) : (
                <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z" />
                  <path d="M19 10v2a7 7 0 0 1-14 0v-2" />
                  <line x1="12" y1="19" x2="12" y2="23" />
                  <line x1="8" y1="23" x2="16" y2="23" />
                </svg>
              )}
            </button>
            <span className="call-btn-label">{activeCall.isMuted ? 'Unmute' : 'Mute'}</span>
          </div>

          {/* End Call Button */}
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
            <button
              className="call-btn hangup"
              onClick={hangup}
              aria-label="End call"
              title="End call"
            >
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <path d="M10.68 13.31a16 16 0 0 0 3.41 2.6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7 2 2 0 0 1 1.72 2v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.42 19.42 0 0 1-3.33-2.67m-2.67-3.34a19.79 19.79 0 0 1-3.07-8.63A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91" />
                <line x1="23" y1="1" x2="1" y2="23" />
              </svg>
            </button>
            <span className="call-btn-label">End</span>
          </div>
        </div>
      </div>
    </div>
  );
}
