import React, { useState, useRef, useEffect, useCallback } from 'react';

import { useCall } from '../../context/CallContext';
import { rtcService } from '../../services/rtcService';
import { resolvePartnerName } from '../../utils/partnerName';
import './CallModal.css';

function formatCallDuration(seconds: number): string {
  const mins = Math.floor(seconds / 60);
  const secs = seconds % 60;
  const paddedMins = String(mins).padStart(2, '0');
  const paddedSecs = String(secs).padStart(2, '0');
  return `${paddedMins}:${paddedSecs}`;
}

const MemoizedVideoStage = React.memo(function MemoizedVideoStage({
  viewMode,
  isScreenSharing,
  isRemoteScreenSharing,
  isScreenshareFullscreen,
  setIsScreenshareFullscreen,
  hideFloatingTiles,
  setHideFloatingTiles,
  toggleFullscreen,
  isFullscreen,
  focusedParticipant,
  setFocusedParticipant,
  remoteVideoRef,
  remoteBgVideoRef,
  localVideoRef,
  localBgVideoRef,
  screenVideoRef,
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
  currentFacingMode
}: {
  viewMode: 'grid' | 'stacked' | 'pip' | 'screenshare';
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
  remoteBgVideoRef: React.RefObject<HTMLVideoElement | null>;
  localVideoRef: React.RefObject<HTMLVideoElement | null>;
  localBgVideoRef: React.RefObject<HTMLVideoElement | null>;
  screenVideoRef?: React.RefObject<HTMLVideoElement | null>;
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
}) {
  const localPanelRef = useRef<HTMLDivElement | null>(null);
  const posRef = useRef<{ x: number; y: number } | null>(null);
  const isDraggingRef = useRef(false);
  const hasDraggedRef = useRef(false);
  const dragStartRef = useRef<{ pointerX: number; pointerY: number; pipX: number; pipY: number } | null>(null);
  const [remoteAspect, setRemoteAspect] = useState<number>(16 / 9);
  const [localAspect, setLocalAspect] = useState<number>(16 / 9);
  const [isMobile, setIsMobile] = useState<boolean>(() => typeof window !== 'undefined' ? window.innerWidth <= 768 : false);

  useEffect(() => {
    const handleWinResize = () => {
      setIsMobile(window.innerWidth <= 768);
    };
    window.addEventListener('resize', handleWinResize);
    return () => window.removeEventListener('resize', handleWinResize);
  }, []);

  // Dynamic aspect ratio calculation from remote camera stream
  useEffect(() => {
    const videoEl = remoteVideoRef.current;
    if (!videoEl) return;
    const updateAspect = () => {
      if (videoEl.videoWidth > 0 && videoEl.videoHeight > 0) {
        setRemoteAspect(videoEl.videoWidth / videoEl.videoHeight);
      }
    };
    videoEl.addEventListener('loadedmetadata', updateAspect);
    videoEl.addEventListener('resize', updateAspect);
    videoEl.addEventListener('timeupdate', updateAspect);
    videoEl.addEventListener('play', updateAspect);
    updateAspect();
    return () => {
      videoEl.removeEventListener('loadedmetadata', updateAspect);
      videoEl.removeEventListener('resize', updateAspect);
      videoEl.removeEventListener('timeupdate', updateAspect);
      videoEl.removeEventListener('play', updateAspect);
    };
  }, [remoteVideoRef]);

  // Dynamic aspect ratio calculation from local camera stream
  useEffect(() => {
    const videoEl = localVideoRef.current;
    if (!videoEl) return;
    const updateAspect = () => {
      if (videoEl.videoWidth > 0 && videoEl.videoHeight > 0) {
        setLocalAspect(videoEl.videoWidth / videoEl.videoHeight);
      }
    };
    videoEl.addEventListener('loadedmetadata', updateAspect);
    videoEl.addEventListener('resize', updateAspect);
    videoEl.addEventListener('timeupdate', updateAspect);
    videoEl.addEventListener('play', updateAspect);
    updateAspect();
    return () => {
      videoEl.removeEventListener('loadedmetadata', updateAspect);
      videoEl.removeEventListener('resize', updateAspect);
      videoEl.removeEventListener('timeupdate', updateAspect);
      videoEl.removeEventListener('play', updateAspect);
    };
  }, [localVideoRef]);

  // Update on connection state changes
  useEffect(() => {
    if (isConnected) {
      if (remoteVideoRef.current && remoteVideoRef.current.videoWidth > 0 && remoteVideoRef.current.videoHeight > 0) {
        setRemoteAspect(remoteVideoRef.current.videoWidth / remoteVideoRef.current.videoHeight);
      }
      if (localVideoRef.current && localVideoRef.current.videoWidth > 0 && localVideoRef.current.videoHeight > 0) {
        setLocalAspect(localVideoRef.current.videoWidth / localVideoRef.current.videoHeight);
      }
    }
  }, [isConnected, remoteVideoRef, localVideoRef]);

  const isLocalPip = viewMode === 'pip' || focusedParticipant === 'remote';

  // Handle positioning when entering PiP mode vs Stacked mode
  useEffect(() => {
    if (!localPanelRef.current) return;
    if (isLocalPip) {
      const rect = localPanelRef.current.getBoundingClientRect();
      const mobileActive = window.innerWidth <= 768;
      const pipW = mobileActive ? 108 : (rect.width || 320);
      const pipH = mobileActive ? 156 : (rect.height || 180);
      const bottomOffset = mobileActive ? 96 : 28;
      const rightOffset = mobileActive ? 12 : 28;
      const safeX = Math.max(10, window.innerWidth - pipW - rightOffset);
      const safeY = Math.max(mobileActive ? 64 : 12, window.innerHeight - pipH - bottomOffset);
      posRef.current = { x: safeX, y: safeY };
      localPanelRef.current.style.transform = `translate3d(${safeX}px, ${safeY}px, 0)`;
    } else {
      // In Grid or Stacked mode, or when local is focused, clear inline transform so it naturally docks
      localPanelRef.current.style.transform = '';
    }
  }, [isLocalPip, viewMode, focusedParticipant]);

  // Window resize handler: clamps PiP within safe boundaries
  useEffect(() => {
    const handleResize = () => {
      if (!isLocalPip || !localPanelRef.current || !posRef.current) return;
      const rect = localPanelRef.current.getBoundingClientRect();
      const mobileActive = window.innerWidth <= 768;
      const pipW = mobileActive ? 108 : (rect.width || 320);
      const pipH = mobileActive ? 156 : (rect.height || 180);
      const minX = 10;
      const minY = mobileActive ? 64 : 12;
      const bottomOffset = mobileActive ? 96 : 12;
      const rightOffset = mobileActive ? 12 : 12;
      const maxX = Math.max(minX, window.innerWidth - pipW - rightOffset);
      const maxY = Math.max(minY, window.innerHeight - pipH - bottomOffset);
      const clampedX = Math.max(minX, Math.min(posRef.current.x, maxX));
      const clampedY = Math.max(minY, Math.min(posRef.current.y, maxY));
      posRef.current = { x: clampedX, y: clampedY };
      localPanelRef.current.style.transform = `translate3d(${clampedX}px, ${clampedY}px, 0)`;
    };
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, [isLocalPip]);

  // Drag handlers for PiP mode (zero React re-renders during dragging)
  const handlePointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!isLocalPip) return;
    if ((e.target as HTMLElement).closest('button')) return;
    if (!localPanelRef.current) return;

    e.preventDefault();
    e.stopPropagation();

    try {
      e.currentTarget.setPointerCapture(e.pointerId);
    } catch {}

    const rect = localPanelRef.current.getBoundingClientRect();
    const mobileActive = window.innerWidth <= 768;
    const pipW = mobileActive ? 108 : (rect.width || 320);
    const pipH = mobileActive ? 156 : (rect.height || 180);
    const bottomOffset = mobileActive ? 96 : 28;
    const rightOffset = mobileActive ? 12 : 28;
    const currentPos = posRef.current || {
      x: Math.max(10, window.innerWidth - pipW - rightOffset),
      y: Math.max(mobileActive ? 64 : 12, window.innerHeight - pipH - bottomOffset)
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
    if (Math.hypot(deltaX, deltaY) > 6) {
      hasDraggedRef.current = true;
    }

    const targetX = dragStartRef.current.pipX + deltaX;
    const targetY = dragStartRef.current.pipY + deltaY;

    const rect = localPanelRef.current.getBoundingClientRect();
    const mobileActive = window.innerWidth <= 768;
    const pipW = mobileActive ? 108 : (rect.width || 320);
    const pipH = mobileActive ? 156 : (rect.height || 180);

    const minX = 10;
    const minY = mobileActive ? 64 : 12;
    const bottomOffset = mobileActive ? 96 : 12;
    const rightOffset = mobileActive ? 12 : 12;
    const maxX = Math.max(minX, window.innerWidth - pipW - rightOffset);
    const maxY = Math.max(minY, window.innerHeight - pipH - bottomOffset);

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
    } catch {}
  };

  const handleRemoteClick = (e: React.MouseEvent) => {
    if ((e.target as HTMLElement).closest('button')) return;
    // On mobile touch viewports, tapping video should not trigger accidental layout swaps
    if (isMobile) return;
    setFocusedParticipant(prev => (prev === 'remote' ? 'none' : 'remote'));
  };

  const handleLocalClick = (e: React.MouseEvent) => {
    if (hasDraggedRef.current) return;
    if ((e.target as HTMLElement).closest('button')) return;
    // On mobile touch viewports, tapping video should not trigger accidental layout swaps
    if (isMobile) {
      if (isLocalPip) {
        setFocusedParticipant(prev => (prev === 'remote' ? 'none' : 'remote'));
      }
      return;
    }
    setFocusedParticipant(prev => (prev === 'local' ? 'none' : 'local'));
  };

  if (viewMode === 'screenshare') {
    const isRemoteSharing = isRemoteScreenSharing;
    const isLocalSharing = isScreenSharing;

    return (
      <div className={`call-video-stage view-mode-screenshare ${isScreenshareFullscreen ? 'is-hero-fullscreen' : ''}`}>
        {/* Hidden background video refs to preserve rtcService bindings */}
        <video ref={remoteBgVideoRef} className="hidden" aria-hidden="true" muted playsInline />
        <video ref={localBgVideoRef} className="hidden" aria-hidden="true" muted playsInline />

        <div className="call-stage-presentation-frame">
          {/* Main Hero: Shared Screen (Uncropped, Crystal 1080p, Black Background, Never Mirrored) */}
          <div className="call-screenshare-main">
            {/* Top Left Badge */}
            <div className="call-screenshare-badge-bar">
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <rect x="2" y="3" width="20" height="14" rx="2" />
                <line x1="8" y1="21" x2="16" y2="21" />
                <line x1="12" y1="17" x2="12" y2="21" />
              </svg>
              <span>{isRemoteSharing ? `${partnerName}'s Screen` : isLocalSharing ? 'Your Screen (Sharing)' : 'Screen Share'}</span>
              <span className="call-screenshare-hd-pill">1080p Crystal Clear</span>
            </div>

            {/* Top Right Actions: Toggle Full Screen / Sidebar, Hide/Show Tiles, Browser Fullscreen */}
            <div className="call-screenshare-top-actions">
              <button
                type="button"
                className="call-screenshare-action-btn"
                onClick={() => setIsScreenshareFullscreen(prev => !prev)}
                title={isScreenshareFullscreen ? 'Show both users on right' : 'Expand screen to full view'}
                aria-label={isScreenshareFullscreen ? 'Show both users on right' : 'Expand screen to full view'}
              >
                {isScreenshareFullscreen ? (
                  <>
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <rect x="2" y="3" width="13" height="18" rx="2" />
                      <rect x="17" y="3" width="5" height="8" rx="1.5" />
                      <rect x="17" y="13" width="5" height="8" rx="1.5" />
                    </svg>
                    <span>Sidebar View</span>
                  </>
                ) : (
                  <>
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <polyline points="15 3 21 3 21 9" />
                      <polyline points="9 21 3 21 3 15" />
                      <line x1="21" y1="3" x2="14" y2="10" />
                      <line x1="3" y1="21" x2="10" y2="14" />
                    </svg>
                    <span>Full Screen</span>
                  </>
                )}
              </button>

              {isScreenshareFullscreen && setHideFloatingTiles && (
                <button
                  type="button"
                  className={`call-screenshare-action-btn ${hideFloatingTiles ? 'active' : ''}`}
                  onClick={() => setHideFloatingTiles(prev => !prev)}
                  title={hideFloatingTiles ? 'Show floating user tiles' : 'Hide floating user tiles for 100% unobstructed view'}
                  aria-label={hideFloatingTiles ? 'Show floating user tiles' : 'Hide floating user tiles'}
                >
                  {hideFloatingTiles ? (
                    <>
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
                        <circle cx="12" cy="12" r="3" />
                      </svg>
                      <span>Show Tiles</span>
                    </>
                  ) : (
                    <>
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24" />
                        <line x1="1" y1="1" x2="23" y2="23" />
                      </svg>
                      <span>Hide Tiles</span>
                    </>
                  )}
                </button>
              )}

              {toggleFullscreen && (
                <button
                  type="button"
                  className="call-screenshare-action-btn icon-only"
                  onClick={toggleFullscreen}
                  title={isFullscreen ? 'Exit browser fullscreen' : 'Browser fullscreen'}
                  aria-label={isFullscreen ? 'Exit browser fullscreen' : 'Browser fullscreen'}
                >
                  {isFullscreen ? (
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <polyline points="4 14 10 14 10 20" />
                      <polyline points="20 10 14 10 14 4" />
                      <line x1="14" y1="10" x2="21" y2="3" />
                      <line x1="3" y1="21" x2="10" y2="14" />
                    </svg>
                  ) : (
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <polyline points="15 3 21 3 21 9" />
                      <polyline points="9 21 3 21 3 15" />
                      <line x1="21" y1="3" x2="14" y2="10" />
                      <line x1="3" y1="21" x2="10" y2="14" />
                    </svg>
                  )}
                </button>
              )}
            </div>

            {/* Main Shared Screen Presentation: exactly ONE video element */}
            {isLocalSharing ? (
              <video
                ref={screenVideoRef || localVideoRef}
                className="call-video-fg-live is-screen-share"
                autoPlay
                playsInline
                muted
              />
            ) : (
              <video
                ref={remoteVideoRef}
                className="call-video-fg-live is-screen-share"
                autoPlay
                playsInline
                muted
              />
            )}
          </div>

          {/* Right Stacked Column: Both users stacked vertically (floating when full screen) */}
          <div className={`call-screenshare-sidebar ${isScreenshareFullscreen && hideFloatingTiles ? 'tiles-hidden' : ''}`}>
            {/* Top Tile: Partner User */}
            <div className="call-sidebar-user-tile remote">
              {isRemoteSharing ? (
                // If partner is sharing, their avatar & status card goes here
                <div className="call-video-placeholder">
                  <div className="call-avatar-wrapper" style={{ width: 56, height: 56, marginBottom: 6 }}>
                    {isConnected && isRemoteSpeaking && <div className="call-pulse-ring speaking" />}
                    <div className={`call-avatar ${isRemoteSpeaking ? 'avatar-speaking' : ''}`} style={{ width: 50, height: 50, fontSize: 20 }}>
                      {avatar ? <img src={avatar} alt={partnerName} /> : <span>{initial}</span>}
                    </div>
                  </div>
                  <span className="call-video-placeholder-name" style={{ fontSize: 13 }}>{partnerName}</span>
                  <span style={{ fontSize: 11, color: '#c4b5fd' }}>🖥️ Sharing screen</span>
                </div>
              ) : (
                // If partner is NOT sharing (local is sharing), partner's live camera video goes here!
                <>
                  <video
                    ref={remoteVideoRef}
                    className={`call-video-fg-live ${isRemoteCameraOff || !isConnected ? 'hidden' : ''}`}
                    autoPlay
                    playsInline
                    muted
                  />
                  {(isRemoteCameraOff || !isConnected) && (
                    <div className="call-video-placeholder">
                      <div className="call-avatar-wrapper" style={{ width: 56, height: 56, marginBottom: 6 }}>
                        <div className="call-avatar" style={{ width: 50, height: 50, fontSize: 20 }}>
                          {avatar ? <img src={avatar} alt={partnerName} /> : <span>{initial}</span>}
                        </div>
                      </div>
                      <span className="call-video-placeholder-name" style={{ fontSize: 13 }}>{partnerName}</span>
                    </div>
                  )}
                </>
              )}

              {/* Partner Badge */}
              <div className="call-panel-identity-label" style={{ bottom: 8, left: 8, padding: '3px 8px', fontSize: 11 }}>
                <span className={`call-identity-dot ${isConnected ? 'online' : 'reconnecting'}`} />
                <span className="call-identity-name">{partnerName}</span>
                {isRemoteSpeaking && isConnected && !isRemoteMuted && (
                  <span className="call-speaking-wave-tag" title="Speaking" style={{ marginLeft: 4 }}>
                    <span className="call-wave-bar b1" />
                    <span className="call-wave-bar b2" />
                    <span className="call-wave-bar b3" />
                  </span>
                )}
                {isRemoteMuted && (
                  <span className="call-muted-tag" title="Muted" style={{ marginLeft: 4, color: '#f87171' }}>
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <line x1="1" y1="1" x2="23" y2="23" />
                      <path d="M9 9v3a3 3 0 0 0 5.12 2.12M15 9.34V4a3 3 0 0 0-5.94-.6" />
                      <path d="M17 16.95A7 7 0 0 1 5 12v-2m14 0v2a7 7 0 0 1-.11 1.23"></path>
                    </svg>
                  </span>
                )}
              </div>
            </div>

            {/* Bottom Tile: You */}
            <div className="call-sidebar-user-tile local">
              {isLocalSharing ? (
                // If local is sharing, local user's info card goes here
                <div className="call-video-placeholder">
                  <div className="call-avatar-wrapper" style={{ width: 56, height: 56, marginBottom: 6 }}>
                    <div className="call-avatar" style={{ width: 50, height: 50, fontSize: 20 }}>
                      <span>Y</span>
                    </div>
                  </div>
                  <span className="call-video-placeholder-name" style={{ fontSize: 13 }}>You</span>
                  <span style={{ fontSize: 11, color: '#a78bfa' }}>🖥️ Sharing screen</span>
                </div>
              ) : (
                // If local is NOT sharing (remote is sharing), your live camera goes here (mirrored selfie)
                <>
                  <video
                    ref={localVideoRef}
                    className={`call-video-fg-live local-main ${currentFacingMode === 'environment' ? 'is-rear-camera' : ''} ${isCameraOff || isCameraUnavailable ? 'hidden' : ''}`}
                    autoPlay
                    playsInline
                    muted
                  />
                  {(isCameraOff || isCameraUnavailable) && (
                    <div className="call-video-placeholder">
                      <div className="call-avatar-wrapper" style={{ width: 56, height: 56, marginBottom: 6 }}>
                        <div className="call-avatar" style={{ width: 50, height: 50, fontSize: 20 }}>
                          <span>Y</span>
                        </div>
                      </div>
                      <span className="call-video-placeholder-name" style={{ fontSize: 13 }}>You</span>
                    </div>
                  )}
                </>
              )}

              {/* Local Badge & Flip Camera */}
              <div className="call-panel-identity-label" style={{ bottom: 8, left: 8, right: 8, display: 'flex', justifyContent: 'space-between', padding: '3px 8px', fontSize: 11 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                  <span className="call-identity-dot online" />
                  <span className="call-identity-name">You</span>
                </div>
                {!isLocalSharing && !isCameraOff && !isCameraUnavailable && (
                  <button
                    type="button"
                    className="call-panel-switch-cam-btn"
                    style={{ width: 22, height: 22 }}
                    onClick={(e) => {
                      e.stopPropagation();
                      flipCamera();
                    }}
                    title={currentFacingMode === 'user' ? 'Switch camera' : 'Front camera'}
                  >
                    <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
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
      </div>
    );
  }

  return (
    <div className={`call-video-stage view-mode-${viewMode} ${focusedParticipant !== 'none' ? 'has-focused-participant' : ''}`}>
      <div className="call-stage-presentation-frame">
        {/* REMOTE PARTICIPANT (Phone or Laptop) */}
        <div
          className={`call-video-panel remote-panel ${
            isRemoteScreenSharing ? 'is-screen-share' : ''
          } ${
            focusedParticipant === 'remote'
              ? 'is-focused-main'
              : focusedParticipant === 'local'
              ? 'is-pip-window'
              : ''
          }`}
          style={isMobile ? undefined : { aspectRatio: `${remoteAspect}` }}
          onClick={handleRemoteClick}
          aria-label={`Live video of ${partnerName}`}
        >
          {/* Focus Hint on Hover */}
          <div className={`call-panel-focus-hint ${focusedParticipant === 'remote' ? 'exit' : ''}`}>
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              {focusedParticipant === 'remote' ? (
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
            <span>{focusedParticipant === 'remote' ? 'Exit full video' : 'Click for full video'}</span>
          </div>

          {/* Layer 1: Ambient live video background (Same live stream, cover, subdued, NO blur) */}
          <video
            ref={remoteBgVideoRef}
            className={`call-video-bg-live ${isRemoteScreenSharing || isRemoteCameraOff || !isConnected ? 'hidden' : ''}`}
            autoPlay
            playsInline
            muted
            aria-hidden="true"
          />

          {/* Vignette mask to blend boundaries and prevent duplicate person effect */}
          <div className={`call-video-vignette-overlay ${isRemoteScreenSharing || isRemoteCameraOff || !isConnected ? 'hidden' : ''}`} />

          {/* Layer 2: Main Remote Video (100% sharp, uncropped, native aspect ratio) */}
          <video
            ref={remoteVideoRef}
            className={`call-video-fg-live remote-main ${isRemoteScreenSharing ? 'is-screen-share' : ''} ${isRemoteCameraOff || !isConnected ? 'hidden' : ''}`}
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
          className={`call-video-panel local-panel ${
            isScreenSharing ? 'is-screen-share' : ''
          } ${
            focusedParticipant === 'local'
              ? 'is-focused-main'
              : isLocalPip
              ? 'is-pip-window'
              : viewMode === 'grid'
              ? 'is-grid-tile'
              : 'is-stacked-tile'
          }`}
          style={isMobile || isLocalPip ? undefined : { aspectRatio: `${localAspect}` }}
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
            <span>{focusedParticipant === 'local' ? 'Exit full video' : 'Click for full video'}</span>
          </div>

          {/* In Stacked Mode: Ambient live video background (Same live stream, cover, subdued, mirrored, NO blur) */}
          <video
            ref={localBgVideoRef}
            className={`call-video-bg-live local ${currentFacingMode === 'environment' ? 'is-rear-camera' : ''} ${isScreenSharing ? 'is-screen-share' : ''} ${isCameraOff || isCameraUnavailable || isLocalPip ? 'hidden' : ''}`}
            autoPlay
            playsInline
            muted
            aria-hidden="true"
          />

          {/* Vignette mask for stacked mode */}
          <div className={`call-video-vignette-overlay ${isScreenSharing || isCameraOff || isCameraUnavailable || isLocalPip ? 'hidden' : ''}`} />

          {/* Main Local Video (100% sharp, complete native frame; un-mirrored when screen sharing or rear camera) */}
          <video
            ref={localVideoRef}
            className={`call-video-fg-live local-main ${currentFacingMode === 'environment' ? 'is-rear-camera' : ''} ${isScreenSharing ? 'is-screen-share' : ''} ${isCameraOff || isCameraUnavailable ? 'hidden' : ''}`}
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
                {isCameraUnavailable ? '🔴 Camera unavailable' : 'Camera is turned off'}
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


export default function ActiveCallPanel() {

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
    stopScreenSharing
  } = useCall();

  const containerRef = useRef<HTMLDivElement | null>(null);
  const localVideoRef = useRef<HTMLVideoElement | null>(null);
  const localBgVideoRef = useRef<HTMLVideoElement | null>(null);
  const remoteVideoRef = useRef<HTMLVideoElement | null>(null);
  const remoteBgVideoRef = useRef<HTMLVideoElement | null>(null);
  const screenVideoRef = useRef<HTMLVideoElement | null>(null);

  const [isFullscreen, setIsFullscreen] = useState(false);
  const [viewMode, setViewMode] = useState<'grid' | 'stacked' | 'pip' | 'screenshare'>('stacked');
  const [isScreenshareFullscreen, setIsScreenshareFullscreen] = useState(false);
  const [hideFloatingTiles, setHideFloatingTiles] = useState(false);
  const [focusedParticipant, setFocusedParticipant] = useState<'none' | 'remote' | 'local'>('none');
  const [showControls, setShowControls] = useState(true);
  const controlsTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [isMobile, setIsMobile] = useState<boolean>(() => typeof window !== 'undefined' ? window.innerWidth <= 768 : false);

  useEffect(() => {
    const handleResize = () => setIsMobile(window.innerWidth <= 768);
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

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
      if (localBgVideoRef.current) {
        rtcService.bindLocalVideoElement(localBgVideoRef.current);
      }
      if (localVideoRef.current) {
        rtcService.bindLocalVideoElement(localVideoRef.current);
      }
      if (remoteBgVideoRef.current) {
        rtcService.bindRemoteVideoElement(remoteBgVideoRef.current);
      }
      if (remoteVideoRef.current) {
        rtcService.bindRemoteVideoElement(remoteVideoRef.current);
      }
      if (isScreenSharing && screenVideoRef.current) {
        rtcService.bindScreenVideoElement(screenVideoRef.current);
      }
      rtcService.triggerVideoPlayback();
    }
    const localEl = localVideoRef.current;
    const localBgEl = localBgVideoRef.current;
    const remoteEl = remoteVideoRef.current;
    const remoteBgEl = remoteBgVideoRef.current;
    const screenEl = screenVideoRef.current;
    return () => {
      if (localEl) rtcService.unbindLocalVideoElement(localEl);
      if (localBgEl) rtcService.unbindLocalVideoElement(localBgEl);
      if (remoteEl) rtcService.unbindRemoteVideoElement(remoteEl);
      if (remoteBgEl) rtcService.unbindRemoteVideoElement(remoteBgEl);
      if (screenEl) rtcService.unbindScreenVideoElement(screenEl);
    };
  }, [activeCall?.callType, callState, viewMode, isScreenSharing, isRemoteScreenSharing, isScreenshareFullscreen, focusedParticipant]);

  // Imperatively attach screen share stream to hero video element as soon as available
  useEffect(() => {
    if (isScreenSharing && screenVideoRef.current) {
      const stream = rtcService.getScreenStream();
      if (stream) {
        if (screenVideoRef.current.srcObject !== stream) {
          screenVideoRef.current.srcObject = stream;
        }
        screenVideoRef.current.play().catch(() => {});
      }
    }
  }, [isScreenSharing, viewMode]);

  // Imperatively trigger video playback when connection stabilizes or camera states change
  // This is required to fix black video in Safari when removing 'display: none' (hidden class)
  useEffect(() => {
    if (isConnected && activeCall?.callType === 'video') {
      const timerId = setTimeout(() => {
        rtcService.triggerVideoPlayback();
      }, 50);
      return () => clearTimeout(timerId);
    }
  }, [isConnected, activeCall?.callType, isCameraOff, isRemoteCameraOff, isCameraUnavailable, viewMode, isScreenSharing, isRemoteScreenSharing, isScreenshareFullscreen]);

  // Fullscreen change listener
  useEffect(() => {
    const handleFsChange = () => {
      setIsFullscreen(!!document.fullscreenElement);
    };
    document.addEventListener('fullscreenchange', handleFsChange);
    return () => document.removeEventListener('fullscreenchange', handleFsChange);
  }, []);

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
        }
      } else {
        if (document.exitFullscreen) {
          await document.exitFullscreen();
          setIsFullscreen(false);
        }
      }
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
  // VIDEO CALL LAYOUT (Phase 9)
  // -------------------------------------------------------------
  if (isVideo) {
    return (
      <div
        ref={containerRef}
        className={`call-overlay call-video-overlay ${isFullscreen ? 'is-fullscreen' : ''}`}
        role="dialog"
        aria-modal="true"
        aria-labelledby="active-video-call-title"
        onMouseMove={handleUserActivity}
        onTouchStart={handleUserActivity}
        onPointerDown={handleUserActivity}
      >
        <MemoizedVideoStage
          viewMode={viewMode}
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
          remoteBgVideoRef={remoteBgVideoRef}
          localVideoRef={localVideoRef}
          localBgVideoRef={localBgVideoRef}
          screenVideoRef={screenVideoRef}
          isRemoteCameraOff={isRemoteCameraOff}
          isCameraOff={isCameraOff}
          isCameraUnavailable={isCameraUnavailable}
          isRemoteMuted={isRemoteMuted}
          isConnected={isConnected}
          isReconnecting={isReconnecting}
          reconnectStatusMessage={reconnectStatusMessage}
          isRemoteSpeaking={isRemoteSpeaking}
          partnerName={partnerName}
          initial={initial}
          avatar={activeCall.remoteUser.avatar || undefined}
          flipCamera={flipCamera}
          currentFacingMode={currentFacingMode}
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
              {/* If focused, show Split View button to exit full video */}
              {focusedParticipant !== 'none' && (
                <button
                  type="button"
                  className="call-restore-split-btn"
                  onClick={() => setFocusedParticipant('none')}
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

          {/* Connection Unstable Notification Banner */}
          {isConnected && callQuality === 'poor' && (
            <div className="call-status-unstable-pill" role="status">
              <span className="call-status-toast-dot yellow">●</span>
              <span>Connection unstable — Adjusting video…</span>
            </div>
          )}

          {/* Microphone Unavailable Alert */}
          {activeCall?.error && activeCall.error.toLowerCase().includes('mic') && (
            <div className="call-status-toast error" role="alert">
              <span>🔴 Microphone unavailable</span>
            </div>
          )}


          {/* Remote Mute Notification Banner (Req 16) */}
          {remoteMuteNotification && (
            <div className="call-status-toast muted-toast" role="status">
              <span>🎙️ {remoteMuteNotification}</span>
            </div>
          )}

          {/* Bottom Floating Control Bar (Auto-Hiding) */}
          <div className={`call-video-controls-bar ${showControls ? 'visible' : 'hidden'}`}>
            {/* View Layout Toggle Button */}
            <div className="call-control-item">
              <button
                type="button"
                className={`call-btn view-ctrl ${viewMode !== 'stacked' || focusedParticipant !== 'none' ? 'active' : ''}`}
                onClick={() => {
                  setFocusedParticipant('none');
                  if (isScreenSharing || isRemoteScreenSharing) {
                    setViewMode(prev => (prev === 'screenshare' ? 'stacked' : prev === 'stacked' ? 'grid' : 'screenshare'));
                  } else if (isMobile) {
                    setViewMode(prev => (prev === 'stacked' ? 'pip' : 'stacked'));
                  } else {
                    setViewMode(prev => (prev === 'stacked' ? 'grid' : prev === 'grid' ? 'pip' : 'stacked'));
                  }
                }}
                title={`Switch layout (Current: ${
                  focusedParticipant !== 'none'
                    ? 'Full Video'
                    : viewMode === 'screenshare'
                    ? 'Screen Share'
                    : viewMode === 'stacked'
                    ? 'Stacked'
                    : viewMode === 'grid'
                    ? 'Side-by-Side'
                    : 'Main + PiP'
                })`}
                aria-label="Switch layout"
              >
                {viewMode === 'screenshare' && (
                  <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <rect x="2" y="3" width="13" height="18" rx="2" />
                    <rect x="17" y="3" width="5" height="8" rx="1.5" />
                    <rect x="17" y="13" width="5" height="8" rx="1.5" />
                  </svg>
                )}
                {viewMode === 'stacked' && (
                  <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <rect x="3" y="3" width="18" height="8" rx="2" />
                    <rect x="3" y="13" width="18" height="8" rx="2" />
                  </svg>
                )}
                {viewMode === 'grid' && (
                  <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <rect x="3" y="3" width="8" height="18" rx="2" />
                    <rect x="13" y="3" width="8" height="18" rx="2" />
                  </svg>
                )}
                {viewMode === 'pip' && (
                  <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <rect x="2" y="3" width="20" height="18" rx="2" />
                    <rect x="13" y="12" width="7" height="7" rx="1.5" fill="currentColor" fillOpacity="0.3" />
                  </svg>
                )}
              </button>
              <span className="call-btn-label">
                {focusedParticipant !== 'none'
                  ? 'Full Video'
                  : viewMode === 'screenshare'
                  ? 'Screen'
                  : viewMode === 'stacked'
                  ? 'Stacked'
                  : viewMode === 'grid'
                  ? 'Side by Side'
                  : 'Main + PiP'}
              </span>
            </div>

            {/* Camera Toggle Button */}
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

            {/* Flip / Switch Camera Button — always visible in video calls */}
            {!isCameraOff && !isCameraUnavailable && (
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

            {/* Screen Share Button (Phase 10 - Supported browsers only) */}
            {isScreenShareSupported && (
              <div className="call-control-item">
                <button
                  type="button"
                  id="screen-share-btn"
                  className={`call-btn screen-share ${isScreenSharing ? 'active' : ''}`}
                  onClick={() => isScreenSharing ? stopScreenSharing() : startScreenSharing()}
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
              <img src={activeCall.remoteUser.avatar} alt={partnerName} />
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
                <path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z"/>
                <path d="M19 10v2a7 7 0 0 1-14 0v-2"/>
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
                <path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1 4-10z"/>
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
