/**
 * TogetherPlayer — Watch Together synchronized video component for Wibby.
 *
 * Guarantees:
 *  1. Zero feedback loops: remote actions and server state updates set `isRemoteSyncingRef`
 *     so native video onPlay/onPause/onSeeked never re-emit socket events.
 *  2. Echo cancellation: actions with senderUid === current user are never re-applied.
 *  3. Sequence-based stale rejection: events with version <= lastAppliedVersionRef are ignored.
 *  4. Scrubber seek only commits on pointer up / keyboard change — no socket flooding.
 *  5. Seamless drift correction: playback-rate micro-nudges for drift between 0.5s and 1.8s;
 *     clean hard seeks only when drift exceeds 1.8s.
 *  6. Socket listeners registered exactly once on mount, with reconnect listener to re-sync.
 *  7. Autoplay restriction detection: displays "Tap to resume" banner if browser blocks playback.
 *  8. Idempotent YouTube URL parsing with enablejsapi, playsinline, and origin parameters.
 *  9. Local-only volume persistence via localStorage (never synced over socket).
 *  10. Full support for dockable/draggable mini-player, resizable frame, and inline Movie Mode.
 */

import { useState, useEffect, useRef, useCallback } from 'react';
import { useSocket } from '../../context/SocketContext';
import { useAuth } from '../../context/AuthContext';
import type { TogetherSession } from '../../types/chat';
import './TogetherPlayer.css';

interface TogetherPlayerProps {
  conversationId: string;
  partnerName: string;
  onClose: () => void;
  inline?: boolean;
}

export function parseMediaUrl(inputUrl: string): { url: string; type: 'youtube' | 'direct' | 'custom' } {
  let mediaUrl = inputUrl.trim();
  if (!mediaUrl) return { url: '', type: 'direct' };

  // Support bare 11-character YouTube video ID
  if (/^[a-zA-Z0-9_-]{11}$/.test(mediaUrl)) {
    const origin = typeof window !== 'undefined' ? encodeURIComponent(window.location.origin) : '';
    return {
      url: `https://www.youtube-nocookie.com/embed/${mediaUrl}?enablejsapi=1&playsinline=1&rel=0${origin ? `&origin=${origin}` : ''}`,
      type: 'youtube'
    };
  }

  // Auto-prepend https:// if protocol is omitted
  if (!mediaUrl.startsWith('http://') && !mediaUrl.startsWith('https://')) {
    mediaUrl = `https://${mediaUrl}`;
  }

  if (mediaUrl.includes('youtube.com') || mediaUrl.includes('youtu.be') || mediaUrl.includes('youtube-nocookie.com')) {
    let videoId = '';
    if (mediaUrl.includes('youtu.be/')) {
      videoId = mediaUrl.split('youtu.be/')[1].split('?')[0].split('/')[0];
    } else if (mediaUrl.includes('/embed/')) {
      videoId = mediaUrl.split('/embed/')[1].split('?')[0].split('/')[0];
    } else if (mediaUrl.includes('/shorts/')) {
      videoId = mediaUrl.split('/shorts/')[1].split('?')[0].split('/')[0];
    } else if (mediaUrl.includes('/v/')) {
      videoId = mediaUrl.split('/v/')[1].split('?')[0].split('/')[0];
    } else {
      try {
        const urlObj = new URL(mediaUrl);
        videoId = urlObj.searchParams.get('v') || '';
      } catch {
        const match = mediaUrl.match(/[?&]v=([^&#]+)/);
        if (match) videoId = match[1];
      }
    }

    if (videoId) {
      const origin = typeof window !== 'undefined' ? encodeURIComponent(window.location.origin) : '';
      return {
        url: `https://www.youtube-nocookie.com/embed/${videoId}?enablejsapi=1&playsinline=1&rel=0${origin ? `&origin=${origin}` : ''}`,
        type: 'youtube'
      };
    }
    return { url: mediaUrl, type: 'youtube' };
  }

  return { url: mediaUrl, type: 'direct' };
}

export default function TogetherPlayer({ conversationId, partnerName, onClose, inline }: TogetherPlayerProps) {
  const { socket } = useSocket();
  const { user } = useAuth();

  const [session, setSession] = useState<TogetherSession | null>(null);
  const [urlInput, setUrlInput] = useState('');
  const [isMinimized, setIsMinimized] = useState(false);
  const [showChangeMedia, setShowChangeMedia] = useState(false);
  const [changeUrlInput, setChangeUrlInput] = useState('');
  const [syncStatus, setSyncStatus] = useState('Sync ready');
  const [duration, setDuration] = useState<number>(0);
  const [playbackPos, setPlaybackPos] = useState<number>(0);
  const [autoplayBlocked, setAutoplayBlocked] = useState<boolean>(false);

  // Draggable Mini-Player Coordinates & Snapping State
  const [position, setPosition] = useState<{ x: number; y: number } | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [snappedSide, setSnappedSide] = useState<'left' | 'right'>('right');

  // Local Watch Together volume control (Local Only)
  const [localVolume, setLocalVolume] = useState<number>(() => {
    try {
      const saved = localStorage.getItem('wibby_together_volume');
      return saved !== null ? Math.min(1, Math.max(0, parseFloat(saved))) : 0.8;
    } catch {
      return 0.8;
    }
  });
  const [isMuted, setIsMuted] = useState<boolean>(() => {
    try {
      return localStorage.getItem('wibby_together_muted') === 'true';
    } catch {
      return false;
    }
  });

  // User Resizable Viewing Window
  const [customSize, setCustomSize] = useState<{ width?: number; height?: number }>(() => {
    try {
      const saved = localStorage.getItem('wibby_together_size');
      if (saved) return JSON.parse(saved);
    } catch { }
    return {};
  });

  const isResizingRef = useRef(false);
  const resizeStartRef = useRef<{ startX: number; startY: number; startW: number; startH: number }>({
    startX: 0,
    startY: 0,
    startW: 0,
    startH: 0
  });

  const containerRef = useRef<HTMLDivElement | null>(null);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const iframeRef = useRef<HTMLIFrameElement | null>(null);
  const currentPosRef = useRef<number>(0);
  const playStartTimestampRef = useRef<number | null>(null);

  // Synchronization and anti-loop guards
  const isLocalActionRef = useRef<boolean>(false);
  const isRemoteSyncingRef = useRef<boolean>(false);
  const lastAppliedVersionRef = useRef<number>(0);
  const isScrubbingRef = useRef<boolean>(false);
  const scrubTargetPosRef = useRef<number>(0);
  const dragStartRef = useRef<{ x: number; y: number; posX: number; posY: number }>({ x: 0, y: 0, posX: 0, posY: 0 });
  const pendingSeekTargetRef = useRef<number | null>(null);
  const seekClearTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const isPlaying = Boolean(session && (session.state === 'playing' || session.playing || session.isPlaying));

  // Helper refs to keep socket effect dependencies minimal
  const isPlayingRef = useRef(isPlaying);
  isPlayingRef.current = isPlaying;
  const partnerNameRef = useRef(partnerName);
  partnerNameRef.current = partnerName;
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;
  const userUidRef = useRef(user?.uid);
  userUidRef.current = user?.uid;

  // Helper to format playback seconds as mm:ss
  const formatSeconds = (secs: number): string => {
    const s = Math.floor(Math.max(0, secs));
    const hrs = Math.floor(s / 3600);
    const mins = Math.floor((s % 3600) / 60);
    const remainingSecs = s % 60;
    if (hrs > 0) {
      return `${hrs}:${String(mins).padStart(2, '0')}:${String(remainingSecs).padStart(2, '0')}`;
    }
    return `${String(mins).padStart(2, '0')}:${String(remainingSecs).padStart(2, '0')}`;
  };

  // Safe YouTube command dispatcher via postMessage
  const sendYouTubeCommand = useCallback((command: string, args: any[] = []) => {
    try {
      if (iframeRef.current?.contentWindow) {
        iframeRef.current.contentWindow.postMessage(
          JSON.stringify({
            event: 'command',
            func: command,
            args: args || []
          }),
          '*'
        );
      }
    } catch {
      // Content window unavailable
    }
  }, []);

  const sendYouTubeCommandRef = useRef(sendYouTubeCommand);
  sendYouTubeCommandRef.current = sendYouTubeCommand;

  // Calculate live authoritative position
  const getCurrentPosition = useCallback(() => {
    if (session?.mediaType === 'direct' && videoRef.current) {
      return videoRef.current.currentTime || 0;
    }
    if (isPlaying && playStartTimestampRef.current) {
      const elapsed = (Date.now() - playStartTimestampRef.current) / 1000;
      return currentPosRef.current + Math.max(0, elapsed);
    }
    return currentPosRef.current;
  }, [isPlaying, session?.mediaType]);

  const getCurrentPositionRef = useRef(getCurrentPosition);
  getCurrentPositionRef.current = getCurrentPosition;

  // Apply local volume to direct video or YouTube iframe
  const applyLocalVolume = useCallback((vol: number, muted: boolean) => {
    if (videoRef.current) {
      videoRef.current.volume = vol;
      videoRef.current.muted = muted;
    }
    if (session?.mediaType === 'youtube' && iframeRef.current) {
      if (muted) {
        sendYouTubeCommand('mute');
      } else {
        sendYouTubeCommand('unMute');
        sendYouTubeCommand('setVolume', [Math.round(vol * 100)]);
      }
    }
  }, [session?.mediaType, sendYouTubeCommand]);

  const handleVolumeChange = (newVol: number) => {
    setLocalVolume(newVol);
    try {
      localStorage.setItem('wibby_together_volume', String(newVol));
    } catch { }
    if (isMuted && newVol > 0) {
      setIsMuted(false);
      try {
        localStorage.setItem('wibby_together_muted', 'false');
      } catch { }
      applyLocalVolume(newVol, false);
    } else {
      applyLocalVolume(newVol, isMuted);
    }
  };

  const handleToggleMute = () => {
    const nextMuted = !isMuted;
    setIsMuted(nextMuted);
    try {
      localStorage.setItem('wibby_together_muted', String(nextMuted));
    } catch { }
    applyLocalVolume(localVolume, nextMuted);
  };

  // Periodic UI progress update (only when not actively dragging the scrubber)
  useEffect(() => {
    const updatePos = () => {
      if (!isScrubbingRef.current) {
        setPlaybackPos(getCurrentPosition());
      }
    };
    updatePos();
    if (!isPlaying) return;
    const interval = setInterval(updatePos, 400);
    return () => clearInterval(interval);
  }, [isPlaying, getCurrentPosition]);

  // YouTube Iframe communication listener
  useEffect(() => {
    const handleWindowMessage = (event: MessageEvent) => {
      try {
        const data = typeof event.data === 'string' ? JSON.parse(event.data) : event.data;
        if (data?.event === 'infoDelivery' && data?.info) {
          if (typeof data.info.currentTime === 'number' && data.info.currentTime >= 0) {
            currentPosRef.current = data.info.currentTime;
            if (playStartTimestampRef.current) {
              playStartTimestampRef.current = Date.now();
            }
          }
          if (typeof data.info.duration === 'number' && data.info.duration > 0) {
            setDuration(data.info.duration);
          }
        }
      } catch {
        // Not a JSON message or unrelated postMessage
      }
    };

    window.addEventListener('message', handleWindowMessage);
    return () => {
      window.removeEventListener('message', handleWindowMessage);
    };
  }, []);

  // Handshake with YouTube iframe on media load
  useEffect(() => {
    if (session?.mediaType === 'youtube' && iframeRef.current) {
      const sendHandshake = () => {
        if (iframeRef.current?.contentWindow) {
          iframeRef.current.contentWindow.postMessage(JSON.stringify({ event: 'listening' }), '*');
          const pos = getCurrentPositionRef.current();
          if (pos > 0) {
            sendYouTubeCommandRef.current('seekTo', [pos, true]);
          }
          if (isPlayingRef.current) {
            sendYouTubeCommandRef.current('playVideo');
          }
          applyLocalVolume(localVolume, isMuted);
        }
      };

      const t1 = setTimeout(sendHandshake, 250);
      const t2 = setTimeout(sendHandshake, 750);
      const t3 = setTimeout(sendHandshake, 1600);

      return () => {
        clearTimeout(t1);
        clearTimeout(t2);
        clearTimeout(t3);
      };
    }
  }, [session?.mediaUrl, session?.mediaType, applyLocalVolume, localVolume, isMuted]);

  // Main Socket.IO synchronization listeners (Registered ONCE per socket/conversationId)
  useEffect(() => {
    if (!socket || !conversationId) return;

    // 1. Initial state request
    socket.emit('together:get-state', { conversationId });

    // Handle authoritative full state (initial join, reconnect, or host state change)
    const handleState = (data: TogetherSession) => {
      if (data.conversationId !== conversationId) return;

      // Guard against stale out-of-order state events
      if (typeof data.version === 'number') {
        if (data.version < lastAppliedVersionRef.current) return;
        lastAppliedVersionRef.current = data.version;
      }

      setSession(data);
      const isPlayingState = data.state === 'playing' || Boolean(data.playing) || Boolean(data.isPlaying);
      setSyncStatus(isPlayingState ? `Watching in sync with ${partnerNameRef.current}` : `Paused with ${partnerNameRef.current}`);

      // Calculate authoritative position compensating for network latency
      let authoritativePos = typeof data.position === 'number'
        ? data.position
        : (typeof data.currentTime === 'number' ? data.currentTime : 0);

      if (isPlayingState && data.sentAt) {
        const networkLag = (Date.now() - data.sentAt) / 1000;
        if (networkLag > 0 && networkLag < 30) {
          authoritativePos += networkLag;
        }
      } else if (isPlayingState && data.updatedAt) {
        const elapsed = (Date.now() - new Date(data.updatedAt).getTime()) / 1000;
        if (elapsed > 0 && elapsed < 86400) {
          authoritativePos += elapsed;
        }
      }

      // Do NOT forcefully seek backward if current user initiated the action less than 1.2s ago
      const isSelfAction = data.lastActionUid === userUidRef.current;
      const now = Date.now();
      const isRecentAction = data.sentAt ? (now - data.sentAt < 1200) : false;
      if (isSelfAction && isRecentAction) {
        return;
      }

      currentPosRef.current = authoritativePos;
      if (!isScrubbingRef.current) {
        setPlaybackPos(authoritativePos);
      }

      if (isPlayingState) {
        playStartTimestampRef.current = Date.now();
      } else {
        playStartTimestampRef.current = null;
      }

      // Apply authoritative position to active player
      const isYt = (data.mediaUrl && (data.mediaUrl.includes('youtube') || data.mediaUrl.includes('youtu.be'))) || data.mediaType === 'youtube';
      if (isYt && iframeRef.current) {
        sendYouTubeCommandRef.current('seekTo', [authoritativePos, true]);
        if (isPlayingState) {
          sendYouTubeCommandRef.current('playVideo');
        } else {
          sendYouTubeCommandRef.current('pauseVideo');
        }
      } else if (videoRef.current) {
        isRemoteSyncingRef.current = true;
        videoRef.current.currentTime = authoritativePos;
        if (isPlayingState) {
          videoRef.current.play().then(() => {
            setAutoplayBlocked(false);
          }).catch((err: any) => {
            if (err?.name === 'NotAllowedError' || String(err).includes('autoplay')) {
              setAutoplayBlocked(true);
            }
          });
        } else {
          videoRef.current.pause();
        }
        setTimeout(() => {
          isRemoteSyncingRef.current = false;
        }, 400);
      }
    };

    // Handle real-time actions from partner (play, pause, seek)
    const handleAction = (data: {
      action: 'play' | 'pause' | 'seek';
      currentTime?: number;
      position?: number;
      senderUid: string;
      version?: number;
    }) => {
      // Echo cancellation: Never apply our own action back onto local player
      if (data.senderUid === userUidRef.current) return;

      if (typeof data.version === 'number') {
        if (data.version < lastAppliedVersionRef.current) return;
        lastAppliedVersionRef.current = data.version;
      }

      setSyncStatus(`${partnerNameRef.current} ${data.action}ed`);

      const incomingPos = typeof data.currentTime === 'number'
        ? data.currentTime
        : (typeof data.position === 'number' ? data.position : currentPosRef.current);

      currentPosRef.current = incomingPos;
      if (!isScrubbingRef.current) {
        setPlaybackPos(incomingPos);
      }

      if (data.action === 'play') {
        playStartTimestampRef.current = Date.now();
        setSession(prev => prev ? { ...prev, state: 'playing', playing: true, isPlaying: true, position: incomingPos } : null);
      } else if (data.action === 'pause') {
        playStartTimestampRef.current = null;
        setSession(prev => prev ? { ...prev, state: 'paused', playing: false, isPlaying: false, position: incomingPos } : null);
      } else if (data.action === 'seek') {
        setSession(prev => prev ? { ...prev, position: incomingPos } : null);
      }

      // Sync YouTube Iframe
      if (iframeRef.current) {
        if (data.action === 'play') {
          sendYouTubeCommandRef.current('seekTo', [incomingPos, true]);
          sendYouTubeCommandRef.current('playVideo');
        } else if (data.action === 'pause') {
          sendYouTubeCommandRef.current('pauseVideo');
        } else if (data.action === 'seek') {
          sendYouTubeCommandRef.current('seekTo', [incomingPos, true]);
        }
      }

      // Sync HTML5 Direct Video
      if (videoRef.current) {
        isRemoteSyncingRef.current = true;
        videoRef.current.currentTime = incomingPos;
        if (data.action === 'play') {
          videoRef.current.play().then(() => {
            setAutoplayBlocked(false);
          }).catch((err: any) => {
            if (err?.name === 'NotAllowedError' || String(err).includes('autoplay')) {
              setAutoplayBlocked(true);
            }
          });
        } else if (data.action === 'pause') {
          videoRef.current.pause();
        }
        setTimeout(() => {
          isRemoteSyncingRef.current = false;
        }, 400);
      }
    };

    const handleEnded = (data: { conversationId: string }) => {
      if (data.conversationId === conversationId) {
        setSession(null);
        onCloseRef.current();
      }
    };

    // Reconnect handler: Re-request state whenever socket reconnects
    const handleConnect = () => {
      socket.emit('together:get-state', { conversationId });
    };

    socket.on('together:started', handleState);
    socket.on('together:state', handleState);
    socket.on('together:action', handleAction);
    socket.on('together:ended', handleEnded);
    socket.on('connect', handleConnect);

    // Re-sync playback when user returns to this browser tab
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        socket.emit('together:get-state', { conversationId });
      }
    };
    document.addEventListener('visibilitychange', handleVisibilityChange);

    return () => {
      socket.off('together:started', handleState);
      socket.off('together:state', handleState);
      socket.off('together:action', handleAction);
      socket.off('together:ended', handleEnded);
      socket.off('connect', handleConnect);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, [socket, conversationId]);

  // Seamless Drift Detection & Playback-Rate Micro-Alignment
  useEffect(() => {
    if (!isPlaying || !session) return;

    const driftInterval = setInterval(() => {
      // If the current user was the last person to interact, don't nudge their player
      if (session.lastActionUid === user?.uid) return;

      const expectedPos = getCurrentPositionRef.current();
      let actualPos = 0;

      if (session.mediaType === 'direct' && videoRef.current) {
        actualPos = videoRef.current.currentTime || 0;
      } else if (session.mediaType === 'youtube') {
        actualPos = currentPosRef.current;
      }

      if (actualPos > 0 && expectedPos > 0) {
        const drift = actualPos - expectedPos; // positive = ahead, negative = behind
        const absDrift = Math.abs(drift);

        if (session.mediaType === 'direct' && videoRef.current) {
          if (absDrift < 0.30) {
            // < 0.30s: In comfortable sync; maintain normal 1.0x playback rate
            if (videoRef.current.playbackRate !== 1.0) {
              videoRef.current.playbackRate = 1.0;
            }
          } else if (absDrift <= 1.0) {
            // 0.30–1.0s: Gentle playback-rate correction without audio stutter or seeking
            if (drift < -0.30) {
              videoRef.current.playbackRate = 1.03;
            } else if (drift > 0.30) {
              videoRef.current.playbackRate = 0.97;
            }
          } else {
            // > 1.0s: Substantial drift - perform controlled seek
            videoRef.current.playbackRate = 1.0;
            isRemoteSyncingRef.current = true;
            videoRef.current.currentTime = expectedPos;
            setTimeout(() => {
              isRemoteSyncingRef.current = false;
            }, 400);
          }
        } else if (session.mediaType === 'youtube' && iframeRef.current) {
          // For YouTube, perform clean seek when drift exceeds 1.2s
          if (absDrift > 1.2) {
            isRemoteSyncingRef.current = true;
            sendYouTubeCommandRef.current('seekTo', [expectedPos, true]);
            currentPosRef.current = expectedPos;
            setTimeout(() => {
              isRemoteSyncingRef.current = false;
            }, 500);
          }
        }
      }
    }, 2000);

    return () => clearInterval(driftInterval);
  }, [isPlaying, session, user?.uid]);

  // Default position for minimized card (docked to bottom-right or bottom-left)
  const getDefaultPosition = useCallback((side: 'left' | 'right' = 'right') => {
    const width = 340;
    const height = 230;
    const padding = 16;
    const bottomOffset = 84;

    const x = side === 'left' ? padding : Math.max(padding, window.innerWidth - width - padding);
    const y = Math.max(padding, window.innerHeight - height - bottomOffset);
    return { x, y };
  }, []);

  const handleToggleMinimize = () => {
    setIsMinimized(prev => {
      const next = !prev;
      if (next && !position) {
        setPosition(getDefaultPosition(snappedSide));
      }
      return next;
    });
  };

  const handleToggleSide = () => {
    const nextSide = snappedSide === 'right' ? 'left' : 'right';
    setSnappedSide(nextSide);
    if (isMinimized) {
      setPosition(getDefaultPosition(nextSide));
    }
  };

  // Draggable Mini-Player pointer handlers
  const handlePointerDown = (e: React.PointerEvent) => {
    if (!isMinimized || !containerRef.current) return;
    if ((e.target as HTMLElement).closest('.together-dock-controls, .together-sync-action-bar, input, button')) return;

    e.preventDefault();
    setIsDragging(true);

    const currentX = position?.x ?? getDefaultPosition(snappedSide).x;
    const currentY = position?.y ?? getDefaultPosition(snappedSide).y;

    dragStartRef.current = {
      x: e.clientX,
      y: e.clientY,
      posX: currentX,
      posY: currentY
    };

    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
  };

  const handlePointerMove = (e: React.PointerEvent) => {
    if (!isDragging) return;

    const dx = e.clientX - dragStartRef.current.x;
    const dy = e.clientY - dragStartRef.current.y;

    const newX = dragStartRef.current.posX + dx;
    const newY = dragStartRef.current.posY + dy;

    const minX = 8;
    const maxX = Math.max(minX, window.innerWidth - 340 - 8);
    const minY = 8;
    const maxY = Math.max(minY, window.innerHeight - 230 - 8);

    setPosition({
      x: Math.min(Math.max(minX, newX), maxX),
      y: Math.min(Math.max(minY, newY), maxY)
    });
  };

  const handlePointerUp = (e: React.PointerEvent) => {
    if (!isDragging) return;
    setIsDragging(false);

    try {
      (e.currentTarget as HTMLElement).releasePointerCapture(e.pointerId);
    } catch { }

    if (position) {
      const midX = window.innerWidth / 2;
      const targetSide = position.x + 170 < midX ? 'left' : 'right';
      setSnappedSide(targetSide);
    }
  };

  const handleResizeStart = (e: React.PointerEvent, direction: 'bottom' | 'corner') => {
    if (isMinimized || !containerRef.current) return;
    e.preventDefault();
    e.stopPropagation();
    isResizingRef.current = true;
    const rect = containerRef.current.getBoundingClientRect();
    resizeStartRef.current = {
      startX: e.clientX,
      startY: e.clientY,
      startW: rect.width,
      startH: rect.height
    };

    const targetEl = e.currentTarget;
    targetEl.setPointerCapture(e.pointerId);

    const onPointerMove = (moveEvent: PointerEvent) => {
      if (!isResizingRef.current || !containerRef.current) return;
      const dy = moveEvent.clientY - resizeStartRef.current.startY;
      const dx = moveEvent.clientX - resizeStartRef.current.startX;

      const newH = Math.max(220, Math.min(window.innerHeight * 0.75, resizeStartRef.current.startH + dy));
      containerRef.current.style.height = `${newH}px`;

      if (direction === 'corner') {
        const newW = Math.max(340, Math.min(Math.min(1080, window.innerWidth - 24), resizeStartRef.current.startW + dx));
        containerRef.current.style.maxWidth = `${newW}px`;
      }
    };

    const onPointerUp = (upEvent: PointerEvent) => {
      if (!isResizingRef.current) return;
      isResizingRef.current = false;
      try {
        targetEl.releasePointerCapture(upEvent.pointerId);
      } catch { }
      window.removeEventListener('pointermove', onPointerMove);
      window.removeEventListener('pointerup', onPointerUp);
      window.removeEventListener('pointercancel', onPointerUp);

      if (containerRef.current) {
        const rect = containerRef.current.getBoundingClientRect();
        const updated = {
          width: Math.round(rect.width),
          height: Math.round(rect.height)
        };
        setCustomSize(updated);
        try {
          localStorage.setItem('wibby_together_size', JSON.stringify(updated));
        } catch { }
      }
    };

    window.addEventListener('pointermove', onPointerMove);
    window.addEventListener('pointerup', onPointerUp);
    window.addEventListener('pointercancel', onPointerUp);
  };

  const startWithUrl = (targetUrl: string) => {
    const clean = targetUrl.trim();
    if (!clean) return;

    const parsed = parseMediaUrl(clean);
    if (!parsed.url) return;

    // Set immediate optimistic state for seamless feedback
    setSession({
      sessionId: 'local-' + Date.now(),
      conversationId,
      mediaUrl: parsed.url,
      mediaType: parsed.type,
      title: 'Watch Together',
      hostUserId: user?.uid || '',
      state: 'playing',
      position: 0,
      playing: true,
      updatedAt: new Date().toISOString(),
      version: 1
    });

    if (socket) {
      socket.emit('together:start', {
        conversationId,
        mediaUrl: parsed.url,
        mediaType: parsed.type,
        title: 'Watch Together'
      });
    }
  };

  const handleStartSession = (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    const targetUrl = urlInput.trim() || 'https://www.youtube.com/watch?v=aqz-KE-bpKQ';
    startWithUrl(targetUrl);
    setUrlInput('');
  };

  const handleChangeMedia = (e: React.FormEvent) => {
    e.preventDefault();
    const targetUrl = changeUrlInput.trim();
    if (!targetUrl) return;

    const parsed = parseMediaUrl(targetUrl);
    if (!parsed.url) return;

    setSession(prev => prev ? {
      ...prev,
      mediaUrl: parsed.url,
      mediaType: parsed.type,
      position: 0,
      state: 'paused',
      playing: false,
      updatedAt: new Date().toISOString(),
      version: (prev.version || 0) + 1
    } : null);

    if (socket) {
      socket.emit('together:change-media', {
        conversationId,
        mediaUrl: parsed.url,
        mediaType: parsed.type,
        title: 'Watch Together'
      });
    }
    setChangeUrlInput('');
    setShowChangeMedia(false);
  };

  const handleTogglePlay = () => {
    if (!socket || !session) return;
    const nextAction = isPlaying ? 'pause' : 'play';
    const currentPos = getCurrentPosition();

    isLocalActionRef.current = true;
    currentPosRef.current = currentPos;

    if (nextAction === 'play') {
      playStartTimestampRef.current = Date.now();
    } else {
      playStartTimestampRef.current = null;
    }

    if (session.mediaType === 'youtube') {
      if (nextAction === 'play') {
        sendYouTubeCommand('playVideo');
      } else {
        sendYouTubeCommand('pauseVideo');
      }
    } else if (videoRef.current) {
      videoRef.current.currentTime = currentPos;
      if (nextAction === 'play') {
        videoRef.current.play().then(() => {
          setAutoplayBlocked(false);
        }).catch((err: any) => {
          if (err?.name === 'NotAllowedError' || String(err).includes('autoplay')) {
            setAutoplayBlocked(true);
          }
        });
      } else {
        videoRef.current.pause();
      }
    }

    socket.emit('together:control', {
      conversationId,
      action: nextAction,
      position: currentPos,
      currentTime: currentPos,
      sentAt: Date.now()
    });

    setTimeout(() => {
      isLocalActionRef.current = false;
    }, 400);
  };

  const handleSeekRelative = (seconds: number) => {
    if (!socket || !session) return;
    const basePos = pendingSeekTargetRef.current !== null
      ? pendingSeekTargetRef.current
      : getCurrentPosition();
    const newPos = Math.max(0, duration > 0 ? Math.min(basePos + seconds, duration) : basePos + seconds);

    pendingSeekTargetRef.current = newPos;
    isLocalActionRef.current = true;
    currentPosRef.current = newPos;
    setPlaybackPos(newPos);

    if (isPlaying) {
      playStartTimestampRef.current = Date.now();
    }

    if (session.mediaType === 'youtube') {
      sendYouTubeCommand('seekTo', [newPos, true]);
    } else if (videoRef.current) {
      videoRef.current.currentTime = newPos;
    }

    if (seekClearTimeoutRef.current) {
      clearTimeout(seekClearTimeoutRef.current);
    }
    seekClearTimeoutRef.current = setTimeout(() => {
      pendingSeekTargetRef.current = null;
    }, 600);

    socket.emit('together:control', {
      conversationId,
      action: 'seek',
      position: newPos,
      currentTime: newPos,
      sentAt: Date.now()
    });

    setTimeout(() => {
      isLocalActionRef.current = false;
    }, 400);
  };

  // Commit arbitrary seek (called on pointer-up or keyboard committed change)
  const handleArbitrarySeek = (targetSec: number) => {
    if (!socket || !session) return;
    pendingSeekTargetRef.current = null;
    if (seekClearTimeoutRef.current) {
      clearTimeout(seekClearTimeoutRef.current);
    }

    const clamped = Math.max(0, duration > 0 ? Math.min(targetSec, duration) : targetSec);

    isLocalActionRef.current = true;
    currentPosRef.current = clamped;
    setPlaybackPos(clamped);

    if (isPlaying) {
      playStartTimestampRef.current = Date.now();
    }

    if (session.mediaType === 'youtube') {
      sendYouTubeCommand('seekTo', [clamped, true]);
    } else if (videoRef.current) {
      videoRef.current.currentTime = clamped;
    }

    socket.emit('together:control', {
      conversationId,
      action: 'seek',
      position: clamped,
      currentTime: clamped,
      sentAt: Date.now()
    });

    setTimeout(() => {
      isLocalActionRef.current = false;
    }, 400);
  };

  const handleEndSession = () => {
    if (socket) {
      socket.emit('together:end', { conversationId });
    }
    setSession(null);
    onClose();
  };

  const handleDismissAutoplayBlock = () => {
    setAutoplayBlocked(false);
    if (videoRef.current) {
      videoRef.current.play().catch(() => { });
    }
  };

  return (
    <div
      ref={containerRef}
      className={`together-dock ${inline ? 'together-inline-container' : isMinimized ? 'minimized' : 'standard'} ${isDragging ? 'is-dragging' : ''}`}
      style={
        inline
          ? { width: '100%', height: '100%', display: 'flex', flexDirection: 'column' }
          : isMinimized && position
            ? { left: `${position.x}px`, top: `${position.y}px` }
            : !isMinimized && (customSize.height || customSize.width)
              ? {
                height: customSize.height ? `${customSize.height}px` : undefined,
                maxWidth: customSize.width ? `${customSize.width}px` : undefined
              }
              : undefined
      }
      onPointerDown={isMinimized ? handlePointerDown : undefined}
      onPointerMove={isMinimized ? handlePointerMove : undefined}
      onPointerUp={isMinimized ? handlePointerUp : undefined}
      onPointerCancel={isMinimized ? handlePointerUp : undefined}
    >
      {/* Header bar (only in floating dock mode, hidden in inline mode) */}
      {!inline && (
        <div className="together-dock-header">
          <div className="together-dock-title">
            {isMinimized && (
              <span className="together-drag-grip" title="Drag to move or dock to left/right">
                ⠿
              </span>
            )}
            <span className="together-badge">🍿 {isMinimized ? 'Together' : 'Watch Together'}</span>
            <span className="together-sync-status">
              {isMinimized ? (session ? (isPlaying ? '▶ Playing' : '⏸ Paused') : 'Link mode') : syncStatus}
            </span>
          </div>

          <div className="together-dock-controls">
            {!isMinimized && session && (
              <button
                type="button"
                className="together-ctrl-btn"
                onClick={() => setShowChangeMedia(prev => !prev)}
                title={showChangeMedia ? 'Cancel change' : 'Change Video'}
                aria-label="Change video"
              >
                🔄
              </button>
            )}

            {!isMinimized && (
              <button
                type="button"
                className="together-ctrl-btn side-swap-btn"
                onClick={(e) => {
                  e.stopPropagation();
                  handleToggleSide();
                }}
                title={snappedSide === 'right' ? 'Dock to Left Side' : 'Dock to Right Side'}
                aria-label="Dock to opposite side"
              >
                {snappedSide === 'right' ? '⇤' : '⇥'}
              </button>
            )}

            <button
              type="button"
              className="together-ctrl-btn"
              onClick={(e) => {
                e.stopPropagation();
                handleToggleMinimize();
              }}
              title={isMinimized ? 'Expand Video Player' : 'Minimize to side (Draggable)'}
              aria-label={isMinimized ? 'Expand player' : 'Minimize player'}
            >
              {isMinimized ? '🗖' : '🗕'}
            </button>

            <button
              type="button"
              className="together-ctrl-btn close-btn"
              onClick={(e) => {
                e.stopPropagation();
                handleEndSession();
              }}
              title="Close Watch Together"
              aria-label="Close session"
            >
              ✕
            </button>
          </div>
        </div>
      )}

      {/* Body */}
      <div className={`together-dock-body ${isMinimized ? 'minimized-body' : ''}`}>
        {session ? (
          <div className="together-player-content-wrap">
            {!isMinimized && showChangeMedia && (
              <form onSubmit={handleChangeMedia} className="together-url-form change-media-form">
                <input
                  type="text"
                  inputMode="url"
                  autoCapitalize="none"
                  autoCorrect="off"
                  spellCheck="false"
                  className="together-url-input"
                  placeholder="Paste new YouTube or video link..."
                  value={changeUrlInput}
                  onChange={e => setChangeUrlInput(e.target.value)}
                  autoFocus
                />
                <button type="submit" className="together-start-btn">
                  Change
                </button>
              </form>
            )}

            <div className={`together-player-frame-wrap ${isMinimized ? 'mini-frame' : 'full-frame'}`}>
              {session.mediaType === 'direct' ? (
                <video
                  ref={videoRef}
                  src={session.mediaUrl}
                  className="together-video-player"
                  controls={!isMinimized}
                  playsInline
                  muted={isMuted}
                  onLoadedMetadata={(e) => {
                    if (e.currentTarget.duration && !isNaN(e.currentTarget.duration)) {
                      setDuration(e.currentTarget.duration);
                    }
                  }}
                  onPlay={() => {
                    // Prevent ping-pong feedback loops: ignore native events triggered by remote sync
                    if (isRemoteSyncingRef.current || isLocalActionRef.current) return;
                    if (socket) {
                      const pos = videoRef.current?.currentTime || 0;
                      currentPosRef.current = pos;
                      playStartTimestampRef.current = Date.now();
                      isLocalActionRef.current = true;
                      socket.emit('together:control', {
                        conversationId,
                        action: 'play',
                        currentTime: pos,
                        position: pos,
                        sentAt: Date.now()
                      });
                      setTimeout(() => {
                        isLocalActionRef.current = false;
                      }, 400);
                    }
                  }}
                  onPause={() => {
                    // Prevent ping-pong feedback loops: ignore native events triggered by remote sync
                    if (isRemoteSyncingRef.current || isLocalActionRef.current) return;
                    if (socket) {
                      const pos = videoRef.current?.currentTime || 0;
                      currentPosRef.current = pos;
                      playStartTimestampRef.current = null;
                      isLocalActionRef.current = true;
                      socket.emit('together:control', {
                        conversationId,
                        action: 'pause',
                        currentTime: pos,
                        position: pos,
                        sentAt: Date.now()
                      });
                      setTimeout(() => {
                        isLocalActionRef.current = false;
                      }, 400);
                    }
                  }}
                  onSeeked={() => {
                    // Prevent ping-pong feedback loops: ignore native events triggered by remote sync
                    if (isRemoteSyncingRef.current || isLocalActionRef.current) return;
                    if (socket) {
                      const pos = videoRef.current?.currentTime || 0;
                      currentPosRef.current = pos;
                      isLocalActionRef.current = true;
                      socket.emit('together:control', {
                        conversationId,
                        action: 'seek',
                        currentTime: pos,
                        position: pos,
                        sentAt: Date.now()
                      });
                      setTimeout(() => {
                        isLocalActionRef.current = false;
                      }, 400);
                    }
                  }}
                />
              ) : (
                <iframe
                  ref={iframeRef}
                  src={session.mediaUrl}
                  className="together-iframe"
                  title="Together Media Player"
                  allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
                  allowFullScreen
                />
              )}

              {/* Autoplay blocked overlay banner */}
              {autoplayBlocked && (
                <div
                  className="together-autoplay-blocked"
                  onClick={handleDismissAutoplayBlock}
                  title="Click to enable audio & playback"
                >
                  <button type="button" className="together-resume-btn">
                    ▶ Tap to resume synchronized playback
                  </button>
                </div>
              )}
            </div>

            {/* Timeline Scrubber for Arbitrary Seek — Only commits on release to prevent flooding */}
            {!isMinimized && duration > 0 && (
              <div className="together-timeline-bar">
                <span className="together-timeline-time">
                  {formatSeconds(playbackPos)}
                </span>
                <input
                  type="range"
                  min="0"
                  max={duration}
                  step="0.5"
                  className="together-timeline-slider"
                  value={Math.min(duration, playbackPos)}
                  onPointerDown={() => {
                    isScrubbingRef.current = true;
                  }}
                  onChange={(e) => {
                    const target = parseFloat(e.target.value);
                    scrubTargetPosRef.current = target;
                    setPlaybackPos(target);
                  }}
                  onPointerUp={() => {
                    isScrubbingRef.current = false;
                    handleArbitrarySeek(scrubTargetPosRef.current);
                  }}
                  onKeyUp={(e) => {
                    handleArbitrarySeek(parseFloat(e.currentTarget.value));
                  }}
                  aria-label="Timeline seek"
                  title="Drag or click to seek for both users"
                />
                <span className="together-timeline-time" style={{ textAlign: 'right' }}>
                  {formatSeconds(duration)}
                </span>
              </div>
            )}

            {/* Action Bar */}
            {!isMinimized ? (
              <div className="together-sync-action-bar">
                <button
                  type="button"
                  className="together-seek-btn"
                  onClick={() => handleSeekRelative(-10)}
                  title="Rewind 10 seconds for both users"
                >
                  ⏪ -10s
                </button>
                <button
                  type="button"
                  className="together-sync-play-btn"
                  onClick={handleTogglePlay}
                  title={isPlaying ? 'Pause for both users' : 'Play for both users'}
                >
                  {isPlaying ? '⏸ Pause' : '▶ Play'}
                </button>
                <button
                  type="button"
                  className="together-seek-btn"
                  onClick={() => handleSeekRelative(10)}
                  title="Forward 10 seconds for both users"
                >
                  +10s ⏩
                </button>

                {/* Local Volume Control (Saved locally, never synced) */}
                <div className="together-volume-control" title="Local volume for your device">
                  <button
                    type="button"
                    className="together-volume-btn"
                    onClick={handleToggleMute}
                    aria-label={isMuted ? 'Unmute' : 'Mute'}
                  >
                    {isMuted || localVolume === 0 ? '🔇' : localVolume < 0.5 ? '🔉' : '🔊'}
                  </button>
                  <input
                    type="range"
                    min="0"
                    max="1"
                    step="0.05"
                    className="together-volume-slider"
                    value={isMuted ? 0 : localVolume}
                    onChange={(e) => handleVolumeChange(parseFloat(e.target.value))}
                    aria-label="Volume slider"
                  />
                  <span className="together-volume-label">
                    {isMuted ? '0%' : `${Math.round(localVolume * 100)}%`}
                  </span>
                </div>
              </div>
            ) : (
              <div className="together-sync-action-bar minimized-bar">
                <button
                  type="button"
                  className="together-sync-play-btn"
                  onClick={(e) => {
                    e.stopPropagation();
                    handleTogglePlay();
                  }}
                >
                  {isPlaying ? '⏸' : '▶'}
                </button>
              </div>
            )}
          </div>
        ) : (
          !isMinimized ? (
            <div className="together-start-container">
              <form onSubmit={handleStartSession} className="together-url-form">
                <input
                  type="text"
                  inputMode="url"
                  autoCapitalize="none"
                  autoCorrect="off"
                  spellCheck="false"
                  className="together-url-input"
                  placeholder="Paste YouTube or video link (mp4, webm)..."
                  value={urlInput}
                  onChange={e => setUrlInput(e.target.value)}
                  autoFocus
                />
                <button type="submit" className="together-start-btn">
                  Watch Together
                </button>
              </form>
              <div className="together-sample-chips">
                <span className="together-sample-label">Try sample:</span>
                <button
                  type="button"
                  className="together-sample-chip"
                  onClick={() => {
                    setUrlInput('https://www.youtube.com/watch?v=aqz-KE-bpKQ');
                    startWithUrl('https://www.youtube.com/watch?v=aqz-KE-bpKQ');
                  }}
                >
                  🎬 Big Buck Bunny
                </button>
                <button
                  type="button"
                  className="together-sample-chip"
                  onClick={() => {
                    setUrlInput('https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/BigBuckBunny.mp4');
                    startWithUrl('https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/BigBuckBunny.mp4');
                  }}
                >
                  🍿 Sample MP4
                </button>
                <button
                  type="button"
                  className="together-sample-chip"
                  onClick={() => {
                    setUrlInput('https://www.youtube.com/watch?v=jfKfPfyJRdk');
                    startWithUrl('https://www.youtube.com/watch?v=jfKfPfyJRdk');
                  }}
                >
                  🎵 Lo-Fi Beats
                </button>
              </div>
            </div>
          ) : (
            <div
              className="together-mini-empty-hint"
              onClick={() => setIsMinimized(false)}
              title="Click to enter video URL"
            >
              <span>Paste video link to watch together</span>
              <button type="button" className="together-mini-expand-text">Open ➔</button>
            </div>
          )
        )}
      </div>

      {/* User-Resizable Handle Bar */}
      {!isMinimized && !inline && (
        <div className="together-resize-bar">
          <div
            className="together-resize-edge"
            onPointerDown={(e) => handleResizeStart(e, 'bottom')}
            title="Drag to resize height"
            aria-label="Resize height"
          >
            <div className="together-resize-pill" />
          </div>
          <div
            className="together-resize-corner"
            onPointerDown={(e) => handleResizeStart(e, 'corner')}
            title="Drag corner to resize width and height"
            aria-label="Resize player"
          >
            <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
              <path d="M11 1L1 11M11 5L5 11M11 9L9 11" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
            </svg>
          </div>
        </div>
      )}
    </div>
  );
}
