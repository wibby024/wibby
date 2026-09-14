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

  const videoRef = useRef<HTMLVideoElement | null>(null);
  const iframeRef = useRef<HTMLIFrameElement | null>(null);
  const isLocalActionRef = useRef(false);

  // Position & playback clock tracking
  const currentPosRef = useRef<number>(0);
  const playStartTimestampRef = useRef<number | null>(null);

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

    return () => {
      socket.off('together:started', handleState);
      socket.off('together:state', handleState);
      socket.off('together:action', handleAction);
      socket.off('together:ended', handleEnded);
    };
  }, [socket, conversationId, partnerName, onClose, user?.uid, sendYouTubeCommand]);

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
    <div className={`together-dock ${isMinimized ? 'minimized' : ''}`}>
      <div className="together-dock-header">
        <div className="together-dock-title-wrap">
          <span className="together-badge">🍿 Together Mode</span>
          <span className="together-sync-status">{syncStatus}</span>
        </div>

        <div className="together-dock-controls">
          {session && (
            <button
              type="button"
              className="together-ctrl-btn"
              onClick={() => setShowChangeMedia(prev => !prev)}
              title={showChangeMedia ? 'Cancel change' : 'Change Video'}
            >
              🔄
            </button>
          )}
          <button
            type="button"
            className="together-ctrl-btn"
            onClick={() => setIsMinimized(prev => !prev)}
            title={isMinimized ? 'Expand' : 'Minimize'}
          >
            {isMinimized ? '▲' : '▼'}
          </button>
          <button
            type="button"
            className="together-ctrl-btn close-btn"
            onClick={handleEndSession}
            title="End Session"
          >
            ✕
          </button>
        </div>
      </div>

      {!isMinimized && (
        <div className="together-dock-body">
          {session ? (
            <div className="together-player-frame-wrap">
              {showChangeMedia && (
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

              {session.mediaType === 'direct' ? (
                <video
                  ref={videoRef}
                  src={session.mediaUrl}
                  className="together-video-player"
                  controls
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
                  allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                  allowFullScreen
                />
              )}

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
            </div>
          ) : (
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
          )}
        </div>
      )}
    </div>
  );
}
