import { useState, useEffect, useRef, useCallback } from 'react';
import { useSocket } from '../../context/SocketContext';
import { useAuth } from '../../context/AuthContext';
import type { TogetherSession } from '../../types/chat';
import './TogetherPlayer.css';

interface TogetherPlayerProps {
  conversationId: string;
  partnerName: string;
  onClose: () => void;
}

function parseMediaUrl(inputUrl: string): { url: string; type: 'youtube' | 'direct' | 'custom' } {
  let mediaUrl = inputUrl.trim();
  let mediaType: 'youtube' | 'direct' | 'custom' = 'direct';

  if (mediaUrl.includes('youtube.com') || mediaUrl.includes('youtu.be')) {
    mediaType = 'youtube';
    let videoId = '';
    if (mediaUrl.includes('youtu.be/')) {
      videoId = mediaUrl.split('youtu.be/')[1].split('?')[0];
    } else {
      try {
        const urlParams = new URLSearchParams(new URL(mediaUrl).search);
        videoId = urlParams.get('v') || '';
      } catch {
        videoId = '';
      }
    }
    if (videoId) {
      mediaUrl = `https://www.youtube-nocookie.com/embed/${videoId}?enablejsapi=1&autoplay=1`;
    }
  }
  return { url: mediaUrl, type: mediaType };
}

export default function TogetherPlayer({ conversationId, partnerName, onClose }: TogetherPlayerProps) {
  const { socket } = useSocket();
  const { user } = useAuth();

  const [session, setSession] = useState<TogetherSession | null>(null);
  const [urlInput, setUrlInput] = useState('');
  const [isMinimized, setIsMinimized] = useState(false);
  const [showChangeMedia, setShowChangeMedia] = useState(false);
  const [changeUrlInput, setChangeUrlInput] = useState('');
  const [syncStatus, setSyncStatus] = useState('Sync ready');

  // Draggable Mini-Player Coordinates & Snapping State
  const [position, setPosition] = useState<{ x: number; y: number } | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [snappedSide, setSnappedSide] = useState<'left' | 'right'>('right');

  const containerRef = useRef<HTMLDivElement | null>(null);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const iframeRef = useRef<HTMLIFrameElement | null>(null);
  const isLocalActionRef = useRef(false);

  // Position & playback clock tracking
  const currentPosRef = useRef<number>(0);
  const playStartTimestampRef = useRef<number | null>(null);

  const dragStartRef = useRef<{
    startX: number;
    startY: number;
    initialX: number;
    initialY: number;
    moved: boolean;
  }>({
    startX: 0,
    startY: 0,
    initialX: 0,
    initialY: 0,
    moved: false
  });

  const sendYouTubeCommand = useCallback((func: 'playVideo' | 'pauseVideo' | 'seekTo', args: any[] = []) => {
    if (iframeRef.current && iframeRef.current.contentWindow) {
      iframeRef.current.contentWindow.postMessage(
        JSON.stringify({
          event: 'command',
          func,
          args
        }),
        '*'
      );
    }
  }, []);

  const isPlaying = Boolean(session?.state === 'playing' || session?.playing || session?.isPlaying);

  const getCurrentPosition = useCallback((): number => {
    if (session?.mediaType === 'direct' && videoRef.current) {
      return videoRef.current.currentTime || 0;
    }
    let pos = currentPosRef.current;
    if (isPlaying && playStartTimestampRef.current) {
      const elapsedSecs = (Date.now() - playStartTimestampRef.current) / 1000;
      if (elapsedSecs > 0) {
        pos += elapsedSecs;
      }
    }
    return Math.max(0, pos);
  }, [session?.mediaType, isPlaying]);

  // Listen to YouTube player messages for live time update
  useEffect(() => {
    const handleWindowMessage = (event: MessageEvent) => {
      try {
        const data = typeof event.data === 'string' ? JSON.parse(event.data) : event.data;
        if (data?.event === 'infoDelivery' && data?.info) {
          if (typeof data.info.currentTime === 'number' && data.info.currentTime > 0) {
            currentPosRef.current = data.info.currentTime;
            if (playStartTimestampRef.current) {
              playStartTimestampRef.current = Date.now();
            }
          }
        }
      } catch {
        // Not a JSON message or non-YouTube postMessage
      }
    };

    window.addEventListener('message', handleWindowMessage);
    return () => {
      window.removeEventListener('message', handleWindowMessage);
    };
  }, []);

  // Tell YouTube iframe to listen for API commands
  useEffect(() => {
    if (session?.mediaType === 'youtube' && iframeRef.current) {
      const timer = setTimeout(() => {
        if (iframeRef.current?.contentWindow) {
          iframeRef.current.contentWindow.postMessage(JSON.stringify({ event: 'listening' }), '*');
        }
      }, 800);
      return () => clearTimeout(timer);
    }
  }, [session?.mediaUrl, session?.mediaType]);

  // Request initial authoritative session state and register socket listeners
  useEffect(() => {
    if (!socket || !conversationId) return;

    socket.emit('together:get-state', { conversationId });

    const handleState = (data: TogetherSession) => {
      if (data.conversationId === conversationId) {
        setSession(data);
        const isPlayingState = data.state === 'playing' || data.playing || data.isPlaying;
        setSyncStatus(isPlayingState ? `Watching in sync with ${partnerName}` : `Paused with ${partnerName}`);

        const authoritativePos = typeof data.position === 'number' ? data.position : (typeof data.currentTime === 'number' ? data.currentTime : 0);
        currentPosRef.current = authoritativePos;
        if (isPlayingState) {
          playStartTimestampRef.current = Date.now();
        } else {
          playStartTimestampRef.current = null;
        }
      }
    };

    const handleAction = (data: { action: 'play' | 'pause' | 'seek'; currentTime?: number; position?: number; senderUid: string }) => {
      if (data.senderUid !== user?.uid) {
        setSyncStatus(`${partnerName} ${data.action}ed`);
      }

      const incomingPos = typeof data.currentTime === 'number' ? data.currentTime : (typeof data.position === 'number' ? data.position : currentPosRef.current);
      currentPosRef.current = incomingPos;

      if (data.action === 'play') {
        playStartTimestampRef.current = Date.now();
      } else if (data.action === 'pause') {
        playStartTimestampRef.current = null;
      }

      // Sync YouTube Iframe
      if (iframeRef.current && data.senderUid !== user?.uid) {
        if (data.action === 'play') {
          sendYouTubeCommand('seekTo', [incomingPos, true]);
          sendYouTubeCommand('playVideo');
        } else if (data.action === 'pause') {
          sendYouTubeCommand('pauseVideo');
        } else if (data.action === 'seek') {
          sendYouTubeCommand('seekTo', [incomingPos, true]);
        }
      }

      // Sync HTML5 Direct Video
      if (videoRef.current && !isLocalActionRef.current) {
        videoRef.current.currentTime = incomingPos;
        if (data.action === 'play') {
          videoRef.current.play().catch(() => {});
        } else if (data.action === 'pause') {
          videoRef.current.pause();
        }
      }
    };

    const handleEnded = (data: { conversationId: string }) => {
      if (data.conversationId === conversationId) {
        setSession(null);
        onClose();
      }
    };

    socket.on('together:started', handleState);
    socket.on('together:state', handleState);
    socket.on('together:action', handleAction);
    socket.on('together:ended', handleEnded);

    // Re-sync YouTube playback when user switches back to this tab
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible' && iframeRef.current) {
        setTimeout(() => {
          const pos = getCurrentPosition();
          sendYouTubeCommand('seekTo', [pos, true]);
          if (isPlaying) {
            sendYouTubeCommand('playVideo');
          }
        }, 400);
      }
    };
    document.addEventListener('visibilitychange', handleVisibilityChange);

    return () => {
      socket.off('together:started', handleState);
      socket.off('together:state', handleState);
      socket.off('together:action', handleAction);
      socket.off('together:ended', handleEnded);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, [socket, conversationId, partnerName, onClose, user?.uid, sendYouTubeCommand, getCurrentPosition, isPlaying]);

  // Default position for minimized card (docked to bottom-right or bottom-left)
  const getDefaultPosition = useCallback((side: 'left' | 'right' = 'right') => {
    if (typeof window === 'undefined') return { x: 20, y: 120 };
    const cardW = Math.min(290, window.innerWidth - 32);
    const cardH = session ? 230 : 54;
    const padding = 16;
    const bottomComposerSpace = 92;

    const x = side === 'left' ? padding : window.innerWidth - cardW - padding;
    const y = Math.max(padding + 60, window.innerHeight - cardH - bottomComposerSpace);
    return { x, y };
  }, [session]);

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
    setSnappedSide(prev => {
      const nextSide = prev === 'right' ? 'left' : 'right';
      const elW = containerRef.current?.offsetWidth || 290;
      const padding = 16;
      const nextX = nextSide === 'left' ? padding : window.innerWidth - elW - padding;
      setPosition(p => ({
        x: nextX,
        y: p ? p.y : (window.innerHeight - 280)
      }));
      return nextSide;
    });
  };

  // Draggable Pointer Events
  const handlePointerDown = (e: React.PointerEvent) => {
    if (!isMinimized) return;
    if ((e.target as HTMLElement).closest('button, input, a')) return;
    if (e.button !== 0 && e.pointerType === 'mouse') return;

    const el = containerRef.current;
    if (!el) return;

    const rect = el.getBoundingClientRect();
    const curX = position ? position.x : rect.left;
    const curY = position ? position.y : rect.top;

    dragStartRef.current = {
      startX: e.clientX,
      startY: e.clientY,
      initialX: curX,
      initialY: curY,
      moved: false
    };

    setIsDragging(true);
    el.setPointerCapture(e.pointerId);
  };

  const handlePointerMove = (e: React.PointerEvent) => {
    if (!isDragging || !isMinimized) return;

    const dx = e.clientX - dragStartRef.current.startX;
    const dy = e.clientY - dragStartRef.current.startY;

    if (Math.abs(dx) > 3 || Math.abs(dy) > 3) {
      dragStartRef.current.moved = true;
    }

    const el = containerRef.current;
    const currentW = el?.offsetWidth || 290;
    const currentH = el?.offsetHeight || 200;

    const padding = 12;
    const maxX = window.innerWidth - currentW - padding;
    const maxY = window.innerHeight - currentH - padding;

    const newX = Math.max(padding, Math.min(maxX, dragStartRef.current.initialX + dx));
    const newY = Math.max(padding + 50, Math.min(maxY, dragStartRef.current.initialY + dy));

    setPosition({ x: newX, y: newY });
  };

  const handlePointerUp = (e: React.PointerEvent) => {
    if (!isDragging || !isMinimized) return;
    setIsDragging(false);

    const el = containerRef.current;
    if (el && el.hasPointerCapture(e.pointerId)) {
      el.releasePointerCapture(e.pointerId);
    }

    // Snap to left or right side smoothly
    if (position) {
      const elW = el?.offsetWidth || 290;
      const centerX = position.x + elW / 2;
      const screenCenterX = window.innerWidth / 2;
      const snapLeft = centerX < screenCenterX;
      const padding = 16;
      const snappedX = snapLeft ? padding : window.innerWidth - elW - padding;
      setSnappedSide(snapLeft ? 'left' : 'right');
      setPosition(prev => prev ? { x: snappedX, y: prev.y } : null);
    }
  };

  // Adjust on window resize
  useEffect(() => {
    if (!isMinimized) return;
    const handleResize = () => {
      if (position && containerRef.current) {
        const elW = containerRef.current.offsetWidth || 290;
        const elH = containerRef.current.offsetHeight || 200;
        const padding = 16;
        const maxX = window.innerWidth - elW - padding;
        const maxY = window.innerHeight - elH - padding;
        const newX = snappedSide === 'left' ? padding : maxX;
        const newY = Math.max(padding + 50, Math.min(maxY, position.y));
        setPosition({ x: newX, y: newY });
      }
    };
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, [isMinimized, position, snappedSide]);

  const handleStartSession = (e: React.FormEvent) => {
    e.preventDefault();
    if (!urlInput.trim() || !socket) return;

    const { url, type } = parseMediaUrl(urlInput);

    currentPosRef.current = 0;
    playStartTimestampRef.current = Date.now();

    socket.emit('together:start', {
      conversationId,
      mediaUrl: url,
      mediaType: type,
      title: 'Synchronized Watch Party'
    });

    setUrlInput('');
  };

  const handleChangeMedia = (e: React.FormEvent) => {
    e.preventDefault();
    if (!changeUrlInput.trim() || !socket) return;

    const { url, type } = parseMediaUrl(changeUrlInput);

    currentPosRef.current = 0;
    playStartTimestampRef.current = Date.now();

    socket.emit('together:change-media', {
      conversationId,
      mediaUrl: url,
      mediaType: type,
      title: 'Synchronized Watch Party'
    });

    setChangeUrlInput('');
    setShowChangeMedia(false);
  };

  const handleEndSession = () => {
    if (socket) {
      socket.emit('together:end', { conversationId });
    }
    onClose();
  };

  const handleTogglePlay = () => {
    if (!socket || !session) return;
    const nextAction = isPlaying ? 'pause' : 'play';
    const currentPos = getCurrentPosition();

    if (nextAction === 'pause') {
      currentPosRef.current = currentPos;
      playStartTimestampRef.current = null;
    } else {
      currentPosRef.current = currentPos;
      playStartTimestampRef.current = Date.now();
    }

    if (session.mediaType === 'youtube') {
      if (nextAction === 'play') {
        sendYouTubeCommand('seekTo', [currentPos, true]);
        sendYouTubeCommand('playVideo');
      } else {
        sendYouTubeCommand('pauseVideo');
      }
    } else if (videoRef.current) {
      videoRef.current.currentTime = currentPos;
      if (nextAction === 'play') {
        videoRef.current.play().catch(() => {});
      } else {
        videoRef.current.pause();
      }
    }

    isLocalActionRef.current = true;
    socket.emit('together:control', {
      conversationId,
      action: nextAction,
      position: currentPos,
      currentTime: currentPos
    });
    setTimeout(() => {
      isLocalActionRef.current = false;
    }, 200);
  };

  const handleSeekRelative = (seconds: number) => {
    if (!socket || !session) return;
    const currentPos = getCurrentPosition();
    const newPos = Math.max(0, currentPos + seconds);

    currentPosRef.current = newPos;
    if (isPlaying) {
      playStartTimestampRef.current = Date.now();
    }

    if (session.mediaType === 'youtube') {
      sendYouTubeCommand('seekTo', [newPos, true]);
    } else if (videoRef.current) {
      videoRef.current.currentTime = newPos;
    }

    socket.emit('together:control', {
      conversationId,
      action: 'seek',
      position: newPos,
      currentTime: newPos
    });
  };

  const hostUid = session?.hostUserId || session?.hostUid;
  const isHost = hostUid === user?.uid;

  return (
    <div
      ref={containerRef}
      className={`together-dock ${isMinimized ? 'minimized' : 'standard'} ${isDragging ? 'dragging' : ''} ${snappedSide}`}
      style={isMinimized && position ? { left: `${position.x}px`, top: `${position.y}px` } : undefined}
      onPointerDown={isMinimized ? handlePointerDown : undefined}
      onPointerMove={isMinimized ? handlePointerMove : undefined}
      onPointerUp={isMinimized ? handlePointerUp : undefined}
      onPointerCancel={isMinimized ? handlePointerUp : undefined}
    >
      {/* Header Bar */}
      <div className={`together-dock-header ${isMinimized ? 'minimized-header' : ''}`}>
        <div className="together-dock-title-wrap">
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

          {isMinimized && (
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

      {/* Body */}
      <div className={`together-dock-body ${isMinimized ? 'minimized-body' : ''}`}>
        {session ? (
          <div className="together-player-content-wrap">
            {!isMinimized && showChangeMedia && (
              <form onSubmit={handleChangeMedia} className="together-url-form change-media-form">
                <input
                  type="url"
                  className="together-url-input"
                  placeholder="Paste new YouTube or video link..."
                  value={changeUrlInput}
                  onChange={e => setChangeUrlInput(e.target.value)}
                  autoFocus
                />
                <button type="submit" className="together-start-btn" disabled={!changeUrlInput.trim()}>
                  Update Media
                </button>
              </form>
            )}

            {/* Video Frame: EXACT 16:9 Aspect Ratio in Both Full and Minimized Modes */}
            <div className={`together-player-frame-wrap ${isMinimized ? 'mini-frame' : 'full-frame'}`}>
              {session.mediaType === 'direct' ? (
                <video
                  ref={videoRef}
                  src={session.mediaUrl}
                  className="together-video-player"
                  controls={!isMinimized}
                  playsInline
                  onPlay={() => {
                    if (!isLocalActionRef.current && socket) {
                      const pos = videoRef.current?.currentTime || 0;
                      currentPosRef.current = pos;
                      playStartTimestampRef.current = Date.now();
                      socket.emit('together:control', {
                        conversationId,
                        action: 'play',
                        currentTime: pos,
                        position: pos
                      });
                    }
                  }}
                  onPause={() => {
                    if (!isLocalActionRef.current && socket) {
                      const pos = videoRef.current?.currentTime || 0;
                      currentPosRef.current = pos;
                      playStartTimestampRef.current = null;
                      socket.emit('together:control', {
                        conversationId,
                        action: 'pause',
                        currentTime: pos,
                        position: pos
                      });
                    }
                  }}
                  onSeeked={() => {
                    if (!isLocalActionRef.current && socket) {
                      const pos = videoRef.current?.currentTime || 0;
                      currentPosRef.current = pos;
                      socket.emit('together:control', {
                        conversationId,
                        action: 'seek',
                        currentTime: pos,
                        position: pos
                      });
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
            </div>

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
                  title="Play / Pause for both users"
                >
                  {isPlaying ? '⏸ Pause Both' : '▶ Play Both'}
                </button>
                <button
                  type="button"
                  className="together-seek-btn"
                  onClick={() => handleSeekRelative(10)}
                  title="Forward 10 seconds for both users"
                >
                  +10s ⏩
                </button>
                <span className="together-host-tag">
                  {isHost ? '🎮 Synced Host' : `🎮 Synced with ${partnerName}`}
                </span>
              </div>
            ) : (
              <div className="together-mini-action-bar">
                <button
                  type="button"
                  className="together-seek-btn mini"
                  onClick={() => handleSeekRelative(-10)}
                  title="Rewind 10s"
                >
                  ⏪
                </button>
                <button
                  type="button"
                  className="together-sync-play-btn mini"
                  onClick={handleTogglePlay}
                  title={isPlaying ? 'Pause Both' : 'Play Both'}
                >
                  {isPlaying ? '⏸' : '▶'}
                </button>
                <button
                  type="button"
                  className="together-seek-btn mini"
                  onClick={() => handleSeekRelative(10)}
                  title="Forward 10s"
                >
                  ⏩
                </button>
              </div>
            )}
          </div>
        ) : (
          !isMinimized ? (
            <form onSubmit={handleStartSession} className="together-url-form">
              <input
                type="url"
                className="together-url-input"
                placeholder="Paste YouTube or video link..."
                value={urlInput}
                onChange={e => setUrlInput(e.target.value)}
                autoFocus
              />
              <button type="submit" className="together-start-btn" disabled={!urlInput.trim()}>
                Watch Together
              </button>
            </form>
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
    </div>
  );
}
