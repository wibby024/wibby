import { useState, useRef, useEffect, useCallback } from 'react';
import { useCall } from '../../context/CallContext';
import { rtcService } from '../../services/rtcService';
import { resolvePartnerName } from '../../utils/partnerName';
import './FloatingCallCapsule.css';

function formatDuration(seconds: number): string {
  const mins = Math.floor(seconds / 60);
  const secs = seconds % 60;
  return `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
}

export default function FloatingCallCapsule() {
  const {
    activeCall,
    callState,
    callQuality,
    isRemoteSpeaking,
    isCameraOff,
    isRemoteCameraOff,
    isCameraUnavailable,
    toggleCamera,
    expandCall,
    toggleMute,
    hangup,
    isScreenSharing,
    isRemoteScreenSharing
  } = useCall();

  const miniRemoteVideoRef = useRef<HTMLVideoElement | null>(null);
  const miniRemoteBgVideoRef = useRef<HTMLVideoElement | null>(null);
  const miniLocalVideoRef = useRef<HTMLVideoElement | null>(null);
  const miniLocalBgVideoRef = useRef<HTMLVideoElement | null>(null);
  const windowRef = useRef<HTMLDivElement | null>(null);

  const [position, setPosition] = useState<{ x: number; y: number } | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const dragStartRef = useRef<{ startX: number; startY: number; initialX: number; initialY: number; moved: boolean }>({
    startX: 0,
    startY: 0,
    initialX: 0,
    initialY: 0,
    moved: false
  });

  // Dynamic aspect ratio tracking (Phase 9 Final UI Fix)
  const [remoteDimensions, setRemoteDimensions] = useState<{ width: number; height: number; aspect: number }>({
    width: 1920,
    height: 1080,
    aspect: 16 / 9
  });
  const [localDimensions, setLocalDimensions] = useState<{ width: number; height: number; aspect: number }>({
    width: 1920,
    height: 1080,
    aspect: 16 / 9
  });

  const checkDimensions = useCallback(() => {
    const rEl = miniRemoteVideoRef.current;
    if (rEl && rEl.videoWidth > 0 && rEl.videoHeight > 0) {
      const w = rEl.videoWidth;
      const h = rEl.videoHeight;
      const aspect = w / h;
      setRemoteDimensions(prev => (prev.width === w && prev.height === h ? prev : { width: w, height: h, aspect }));
    }

    const lEl = miniLocalVideoRef.current;
    if (lEl && lEl.videoWidth > 0 && lEl.videoHeight > 0) {
      const w = lEl.videoWidth;
      const h = lEl.videoHeight;
      const aspect = w / h;
      setLocalDimensions(prev => (prev.width === w && prev.height === h ? prev : { width: w, height: h, aspect }));
    }
  }, []);

  const partnerName = resolvePartnerName(activeCall?.remoteUser);
  const initial = partnerName.charAt(0).toUpperCase();
  const isConnected = callState === 'CONNECTED';
  const isReconnecting = callState === 'RECONNECTING';
  const isVideo = activeCall?.callType === 'video';

  // Bind video streams into mini video elements
  useEffect(() => {
    if (isVideo) {
      if (miniRemoteBgVideoRef.current) {
        rtcService.bindRemoteVideoElement(miniRemoteBgVideoRef.current);
      }
      if (miniRemoteVideoRef.current) {
        rtcService.bindRemoteVideoElement(miniRemoteVideoRef.current);
      }
      if (miniLocalBgVideoRef.current) {
        rtcService.bindLocalVideoElement(miniLocalBgVideoRef.current);
      }
      if (miniLocalVideoRef.current) {
        rtcService.bindLocalVideoElement(miniLocalVideoRef.current);
      }
    }
    const remoteEl = miniRemoteVideoRef.current;
    const remoteBgEl = miniRemoteBgVideoRef.current;
    const localEl = miniLocalVideoRef.current;
    const localBgEl = miniLocalBgVideoRef.current;
    return () => {
      if (remoteEl) rtcService.unbindRemoteVideoElement(remoteEl);
      if (remoteBgEl) rtcService.unbindRemoteVideoElement(remoteBgEl);
      if (localEl) rtcService.unbindLocalVideoElement(localEl);
      if (localBgEl) rtcService.unbindLocalVideoElement(localBgEl);
    };
  }, [isVideo, callState]);

  // Dimension inspection listeners
  useEffect(() => {
    if (!isVideo) return;
    checkDimensions();
    const rEl = miniRemoteVideoRef.current;
    const lEl = miniLocalVideoRef.current;
    if (rEl) {
      rEl.addEventListener('loadedmetadata', checkDimensions);
      rEl.addEventListener('resize', checkDimensions);
      rEl.addEventListener('playing', checkDimensions);
    }
    if (lEl) {
      lEl.addEventListener('loadedmetadata', checkDimensions);
      lEl.addEventListener('resize', checkDimensions);
      lEl.addEventListener('playing', checkDimensions);
    }
    const interval = setInterval(checkDimensions, 1000);
    return () => {
      clearInterval(interval);
      if (rEl) {
        rEl.removeEventListener('loadedmetadata', checkDimensions);
        rEl.removeEventListener('resize', checkDimensions);
        rEl.removeEventListener('playing', checkDimensions);
      }
      if (lEl) {
        lEl.removeEventListener('loadedmetadata', checkDimensions);
        lEl.removeEventListener('resize', checkDimensions);
        lEl.removeEventListener('playing', checkDimensions);
      }
    };
  }, [checkDimensions, isVideo, callState]);

  const isRemotePortrait = remoteDimensions.aspect < 1.0;
  const isLocalPortrait = localDimensions.aspect < 1.0;

  // Calculate container dimensions respecting viewport bounds & source aspect ratio
  const getContainerDimensions = useCallback(() => {
    if (typeof window === 'undefined') {
      return { width: 360, height: 203 };
    }

    const isMobile = window.innerWidth < 480;
    const maxViewportW = window.innerWidth - 32;
    const maxViewportH = window.innerHeight - 130; // Leave space above composer

    if (isMobile) {
      if (isRemotePortrait) {
        const maxH = Math.min(360, maxViewportH);
        const w = Math.min(Math.round(maxH * remoteDimensions.aspect), maxViewportW);
        const h = Math.round(w / remoteDimensions.aspect);
        return { width: w, height: h };
      } else {
        const maxW = Math.min(260, maxViewportW);
        const h = Math.min(Math.round(maxW / remoteDimensions.aspect), maxViewportH);
        const w = Math.round(h * remoteDimensions.aspect);
        return { width: w, height: h };
      }
    }

    // Desktop
    if (isRemotePortrait) {
      // Portrait video on desktop (e.g. 9:16 or 3:4): target height ~500-530px
      const targetH = Math.min(520, maxViewportH);
      const calculatedW = Math.round(targetH * remoteDimensions.aspect);
      const clampedW = Math.min(Math.max(calculatedW, 260), 340, maxViewportW);
      const finalH = Math.round(clampedW / remoteDimensions.aspect);
      return { width: clampedW, height: finalH };
    } else {
      // Landscape video on desktop (340–380px target, default 360px)
      const targetW = Math.min(360, maxViewportW);
      const calculatedH = Math.round(targetW / remoteDimensions.aspect);
      const clampedH = Math.min(calculatedH, maxViewportH);
      const finalW = Math.round(clampedH * remoteDimensions.aspect);
      return { width: finalW, height: clampedH };
    }
  }, [isRemotePortrait, remoteDimensions.aspect]);

  const containerSize = getContainerDimensions();

  // Calculate local PiP dimensions respecting its OWN aspect ratio
  const getLocalPipDimensions = useCallback(() => {
    const isMobile = typeof window !== 'undefined' && window.innerWidth < 480;
    const W = containerSize.width;
    const H = containerSize.height;

    if (isMobile) {
      if (isLocalPortrait) {
        const h = Math.min(84, Math.round(H * 0.28));
        const w = Math.round(h * localDimensions.aspect);
        return { width: w, height: h };
      } else {
        const w = Math.min(74, Math.round(W * 0.3));
        const h = Math.round(w / localDimensions.aspect);
        return { width: w, height: h };
      }
    }

    // Desktop: local PiP is ~25-30% of linear visual scale
    if (isLocalPortrait) {
      const h = Math.min(130, Math.max(90, Math.round(H * 0.26)));
      const w = Math.round(h * localDimensions.aspect);
      return { width: w, height: h };
    } else {
      const w = Math.min(115, Math.max(90, Math.round(W * 0.3)));
      const h = Math.round(w / localDimensions.aspect);
      return { width: w, height: h };
    }
  }, [containerSize, isLocalPortrait, localDimensions.aspect]);

  const localPipSize = getLocalPipDimensions();

  // Pointer drag logic
  const handlePointerDown = useCallback((e: React.PointerEvent) => {
    // Only left click / touch
    if (e.button !== 0 && e.pointerType === 'mouse') return;
    // Don't drag if clicking buttons
    if ((e.target as HTMLElement).closest('button')) return;

    const el = windowRef.current;
    if (!el) return;

    const rect = el.getBoundingClientRect();
    dragStartRef.current = {
      startX: e.clientX,
      startY: e.clientY,
      initialX: position ? position.x : rect.left,
      initialY: position ? position.y : rect.top,
      moved: false
    };

    setIsDragging(true);
    el.setPointerCapture(e.pointerId);
  }, [position]);

  const handlePointerMove = useCallback((e: React.PointerEvent) => {
    if (!isDragging) return;

    const dx = e.clientX - dragStartRef.current.startX;
    const dy = e.clientY - dragStartRef.current.startY;

    if (Math.abs(dx) > 3 || Math.abs(dy) > 3) {
      dragStartRef.current.moved = true;
    }

    const el = windowRef.current;
    const currentWidth = el?.offsetWidth || containerSize.width;
    const currentHeight = el?.offsetHeight || containerSize.height;

    let newX = dragStartRef.current.initialX + dx;
    let newY = dragStartRef.current.initialY + dy;

    // Clamp inside screen bounds with padding
    const padding = 12;
    newX = Math.max(padding, Math.min(window.innerWidth - currentWidth - padding, newX));
    newY = Math.max(padding, Math.min(window.innerHeight - currentHeight - padding, newY));

    setPosition({ x: newX, y: newY });
  }, [isDragging, containerSize]);

  const handlePointerUp = useCallback((e: React.PointerEvent) => {
    if (!isDragging) return;
    setIsDragging(false);

    try {
      windowRef.current?.releasePointerCapture(e.pointerId);
    } catch {}

    // If pointer didn't move significantly, user just tapped/clicked the window to expand
    if (!dragStartRef.current.moved) {
      expandCall();
    }
  }, [isDragging, expandCall]);
 
  if (!activeCall) return null;

  // -------------------------------------------------------------
  // 1. VIDEO CALL: FLOATING LIVE MINI VIDEO WINDOW (Guardrail #5)
  // -------------------------------------------------------------
  if (isVideo) {
    const style: React.CSSProperties = {
      width: `${containerSize.width}px`,
      height: `${containerSize.height}px`,
      ...(position
        ? { left: `${position.x}px`, top: `${position.y}px`, right: 'auto', bottom: 'auto' }
        : {})
    };

    return (
      <div
        ref={windowRef}
        className={`floating-mini-video-window ${isDragging ? 'is-dragging' : ''} ${isRemotePortrait ? 'is-portrait' : 'is-landscape'}`}
        style={style}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerCancel={() => setIsDragging(false)}
        role="region"
        aria-label={`Live video call with ${partnerName}. Drag to reposition or click to expand.`}
      >
        <div
          className="floating-video-frame"
          style={{
            aspectRatio: `${remoteDimensions.width} / ${remoteDimensions.height}`
          }}
        >
          {/* Layer 1: Remote Background Fill (Same Live MediaStream, object-fit: cover, NO BLUR) */}
          <video
            ref={miniRemoteBgVideoRef}
            className={`mini-video-element remote-bg ${isRemoteCameraOff || !isConnected ? 'hidden' : ''}`}
            autoPlay
            playsInline
            muted
            aria-hidden="true"
          />

          {/* Layer 2: Remote Main Video (Same Live MediaStream, object-fit: contain, complete frame) */}
          <video
            ref={miniRemoteVideoRef}
            className={`mini-video-element remote ${isRemoteScreenSharing ? 'is-screen-share' : ''} ${isRemoteCameraOff || !isConnected ? 'hidden' : ''}`}
            autoPlay
            playsInline
            muted
          />

          {/* Remote Camera Off / Connecting Placeholder */}
          {(isRemoteCameraOff || !isConnected) && (
            <div className="mini-video-placeholder">
              <div className={`mini-placeholder-avatar ${isRemoteSpeaking ? 'speaking' : ''}`}>
                {activeCall.remoteUser.avatar ? (
                  <img src={activeCall.remoteUser.avatar} alt={partnerName} />
                ) : (
                  <span>{initial}</span>
                )}
              </div>
              <span className="mini-placeholder-text">
                {isReconnecting ? 'Reconnecting...' : isConnected ? 'Camera off' : 'Connecting...'}
              </span>
            </div>
          )}

          {/* Local Preview PiP in corner (independently respecting local camera aspect ratio) */}
          <div
            className={`mini-video-pip-wrap ${isRemotePortrait ? 'portrait-parent' : ''}`}
            title="Your preview"
            style={{
              width: `${localPipSize.width}px`,
              height: `${localPipSize.height}px`,
              aspectRatio: `${localDimensions.width} / ${localDimensions.height}`
            }}
          >
            {/* Layer 1: Local PiP Background Fill (Same Live MediaStream, object-fit: cover, NO BLUR) */}
            <video
              ref={miniLocalBgVideoRef}
              className={`mini-video-element local-bg ${isCameraOff || isCameraUnavailable ? 'hidden' : ''}`}
              autoPlay
              playsInline
              muted
              aria-hidden="true"
            />

            {/* Layer 2: Local PiP Main Video (Same Live MediaStream, object-fit: contain, complete frame) */}
            <video
              ref={miniLocalVideoRef}
              className={`mini-video-element local ${isScreenSharing ? 'is-screen-share' : ''} ${isCameraOff || isCameraUnavailable ? 'hidden' : ''}`}
              autoPlay
              playsInline
              muted
            />
            {(isCameraOff || isCameraUnavailable) && (
              <div className="mini-pip-off-badge">
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                  <line x1="1" y1="1" x2="23" y2="23" />
                  <path d="M21 21H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h3m3-3h6l2 3h4a2 2 0 0 1 2 2v9.34m-7.72-2.06a4 4 0 1 1-5.56-5.56" />
                </svg>
              </div>
            )}
          </div>

          {/* Top Header Overlay */}
          <div className="mini-video-header-overlay">
            <div className="mini-header-user">
              <span className="mini-partner-name">{partnerName}</span>
              {isRemoteSpeaking && <span className="mini-speaking-indicator" title="Speaking" />}
            </div>
            <div className="mini-header-badges">
              <span className={`mini-quality-badge ${callQuality}`}>
                {callQuality === 'excellent' ? '1080p' : callQuality === 'degraded' ? 'HD' : 'SD'}
              </span>
              <span className="mini-duration-badge">{formatDuration(activeCall.duration)}</span>
            </div>
          </div>

          {/* Hover / Tap Quick Controls Bar */}
          <div className="mini-video-controls-overlay">
          {/* Mute toggle */}
          <button
            type="button"
            className={`mini-ctrl-btn ${activeCall.isMuted ? 'active' : ''}`}
            onClick={(e) => {
              e.stopPropagation();
              toggleMute();
            }}
            title={activeCall.isMuted ? 'Unmute' : 'Mute'}
            aria-label={activeCall.isMuted ? 'Unmute' : 'Mute'}
          >
            {activeCall.isMuted ? (
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <line x1="1" y1="1" x2="23" y2="23" />
                <path d="M9 9v3a3 3 0 0 0 5.12 2.12M15 9.34V4a3 3 0 0 0-5.94-.6" />
                <path d="M17 16.95A7 7 0 0 1 5 12v-2m14 0v2a7 7 0 0 1-.11 1.23" />
                <line x1="12" y1="19" x2="12" y2="23" />
              </svg>
            ) : (
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z" />
                <path d="M19 10v2a7 7 0 0 1-14 0v-2" />
                <line x1="12" y1="19" x2="12" y2="23" />
              </svg>
            )}
          </button>

          {/* Camera toggle */}
          <button
            type="button"
            className={`mini-ctrl-btn ${isCameraOff || isCameraUnavailable ? 'active' : ''}`}
            onClick={(e) => {
              e.stopPropagation();
              toggleCamera();
            }}
            disabled={isCameraUnavailable}
            title={isCameraOff ? 'Camera on' : 'Camera off'}
            aria-label={isCameraOff ? 'Camera on' : 'Camera off'}
          >
            {isCameraOff || isCameraUnavailable ? (
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <line x1="1" y1="1" x2="23" y2="23" />
                <path d="M21 21H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h3m3-3h6l2 3h4a2 2 0 0 1 2 2v9.34m-7.72-2.06a4 4 0 1 1-5.56-5.56" />
              </svg>
            ) : (
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <polygon points="23 7 16 12 23 17 23 7" />
                <rect x="1" y="5" width="15" height="14" rx="2" ry="2" />
              </svg>
            )}
          </button>

          {/* Expand to full view */}
          <button
            type="button"
            className="mini-ctrl-btn expand"
            onClick={(e) => {
              e.stopPropagation();
              expandCall();
            }}
            title="Expand to full video call"
            aria-label="Expand call"
          >
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="15 3 21 3 21 9" />
              <polyline points="9 21 3 21 3 15" />
              <line x1="21" y1="3" x2="14" y2="10" />
              <line x1="3" y1="21" x2="10" y2="14" />
            </svg>
          </button>

          {/* Hangup */}
          <button
            type="button"
            className="mini-ctrl-btn hangup"
            onClick={(e) => {
              e.stopPropagation();
              hangup();
            }}
            title="End call"
            aria-label="End call"
          >
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <path d="M10.68 13.31a16 16 0 0 0 3.41 2.6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7 2 2 0 0 1 1.72 2v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.42 19.42 0 0 1-3.33-2.67m-2.67-3.34a19.79 19.79 0 0 1-3.07-8.63A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91" />
              <line x1="23" y1="1" x2="1" y2="23" />
            </svg>
          </button>
        </div>
      </div>
    </div>
    );
  }

  // -------------------------------------------------------------
  // 2. VOICE CALL: COMPACT FLOATING AUDIO CAPSULE
  // -------------------------------------------------------------
  return (
    <div
      className="floating-call-capsule"
      role="region"
      aria-label={`Active voice call with ${partnerName}`}
    >
      {/* Clickable body area to expand */}
      <button
        type="button"
        className="floating-capsule-main"
        onClick={expandCall}
        title="Click to expand call"
        aria-label="Expand voice call"
      >
        <div className={`floating-capsule-avatar-wrap ${isRemoteSpeaking ? 'speaking' : ''}`}>
          {activeCall.remoteUser.avatar ? (
            <img
              src={activeCall.remoteUser.avatar}
              alt={partnerName}
              className="floating-capsule-avatar"
            />
          ) : (
            <div className="floating-capsule-avatar-placeholder">{initial}</div>
          )}
          {isRemoteSpeaking && <span className="floating-speaking-ring" />}
        </div>

        <div className="floating-capsule-info">
          <div className="floating-capsule-name-row">
            <span className="floating-capsule-name">{partnerName}</span>
            <span className={`floating-quality-badge ${callQuality}`}>
              {callQuality === 'excellent' ? 'HD' : callQuality === 'degraded' ? 'SD' : 'POOR'}
            </span>
          </div>

          <div className="floating-capsule-status-row">
            {isReconnecting ? (
              <span className="floating-status-reconnecting">Reconnecting...</span>
            ) : isConnected ? (
              <>
                <span className="floating-duration">{formatDuration(activeCall.duration)}</span>
                <span className="floating-divider">•</span>
                <span className={`floating-status-activity ${isRemoteSpeaking ? 'speaking' : ''}`}>
                  {isRemoteSpeaking ? 'Speaking' : 'Connected'}
                </span>
              </>
            ) : (
              <span className="floating-status-connecting">Connecting...</span>
            )}
          </div>
        </div>
      </button>

      {/* Action Controls */}
      <div className="floating-capsule-actions">
        {/* Mute Button */}
        <button
          type="button"
          className={`floating-action-btn mute ${activeCall.isMuted ? 'muted' : ''}`}
          onClick={toggleMute}
          title={activeCall.isMuted ? 'Unmute microphone' : 'Mute microphone'}
          aria-label={activeCall.isMuted ? 'Unmute microphone' : 'Mute microphone'}
        >
          {activeCall.isMuted ? (
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <line x1="1" y1="1" x2="23" y2="23" />
              <path d="M9 9v3a3 3 0 0 0 5.12 2.12M15 9.34V4a3 3 0 0 0-5.94-.6" />
              <path d="M17 16.95A7 7 0 0 1 5 12v-2m14 0v2a7 7 0 0 1-.11 1.23" />
              <line x1="12" y1="19" x2="12" y2="23" />
              <line x1="8" y1="23" x2="16" y2="23" />
            </svg>
          ) : (
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z" />
              <path d="M19 10v2a7 7 0 0 1-14 0v-2" />
              <line x1="12" y1="19" x2="12" y2="23" />
              <line x1="8" y1="23" x2="16" y2="23" />
            </svg>
          )}
        </button>

        {/* Expand Button */}
        <button
          type="button"
          className="floating-action-btn expand"
          onClick={expandCall}
          title="Open call modal"
          aria-label="Open call modal"
        >
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <polyline points="15 3 21 3 21 9" />
            <polyline points="9 21 3 21 3 15" />
            <line x1="21" y1="3" x2="14" y2="10" />
            <line x1="3" y1="21" x2="10" y2="14" />
          </svg>
        </button>

        {/* End Call Button */}
        <button
          type="button"
          className="floating-action-btn hangup"
          onClick={hangup}
          title="End call"
          aria-label="End call"
        >
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <path d="M10.68 13.31a16 16 0 0 0 3.41 2.6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7 2 2 0 0 1 1.72 2v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.42 19.42 0 0 1-3.33-2.67m-2.67-3.34a19.79 19.79 0 0 1-3.07-8.63A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91" />
            <line x1="23" y1="1" x2="1" y2="23" />
          </svg>
        </button>
      </div>
    </div>
  );
}
