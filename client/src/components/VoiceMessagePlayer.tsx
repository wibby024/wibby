import React, { useState, useEffect, useRef, useCallback } from 'react';
import { formatAudioDuration } from '../config/media';
import { getAuthenticatedMediaBlobUrl, downloadMediaFile } from '../services/mediaService';
import { playbackCoordinator } from '../services/playbackCoordinator';
import type { Message } from './MessageArea';
import './VoiceMessagePlayer.css';

interface VoiceMessagePlayerProps {
  message: Message;
  isOwn?: boolean;
}

export default function VoiceMessagePlayer({ message, isOwn = false }: VoiceMessagePlayerProps) {
  const [isPlaying, setIsPlaying] = useState<boolean>(false);
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [currentTime, setCurrentTime] = useState<number>(0);
  const [duration, setDuration] = useState<number>(message.duration || 0);
  const [playbackSpeed, setPlaybackSpeed] = useState<number>(1.0);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // Stable references across renders and StrictMode cycles
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const playerIdRef = useRef<string>(message._id || message.clientMessageId || `voice_${Date.now()}`);
  const isMountedRef = useRef<boolean>(true);
  const isAudioLoadingRef = useRef<boolean>(false);
  const cachedBlobUrlRef = useRef<string | null>(null);

  // Generate 32 waveform bars if not provided
  const waveformBars = React.useMemo(() => {
    if (message.waveform && Array.isArray(message.waveform) && message.waveform.length > 0) {
      return message.waveform;
    }
    // Fallback deterministic waveform
    const bars: number[] = [];
    for (let i = 0; i < 32; i++) {
      const h = 0.25 + 0.45 * Math.abs(Math.sin((i / 32) * Math.PI * 3 + (message.duration || 2)));
      bars.push(Number(h.toFixed(2)));
    }
    return bars;
  }, [message.waveform, message.duration]);

  // Pause callback invoked by PlaybackCoordinator when another voice player starts
  const handleCoordinatorPause = useCallback(() => {
    if (audioRef.current && !audioRef.current.paused) {
      audioRef.current.pause();
    }
    if (isMountedRef.current) {
      setIsPlaying(false);
    }
  }, []);

  // Register with playback coordinator on mount and clean up on unmount
  useEffect(() => {
    isMountedRef.current = true;
    const id = playerIdRef.current;
    playbackCoordinator.register(id, handleCoordinatorPause);

    return () => {
      isMountedRef.current = false;
      playbackCoordinator.unregister(id);

      if (audioRef.current) {
        try {
          audioRef.current.pause();
          audioRef.current.onplay = null;
          audioRef.current.onpause = null;
          audioRef.current.onended = null;
          audioRef.current.ontimeupdate = null;
          audioRef.current.onloadedmetadata = null;
          audioRef.current.onerror = null;
          audioRef.current.src = '';
        } catch {}
        audioRef.current = null;
      }
    };
  }, [handleCoordinatorPause]);

  /**
   * Loads the authenticated media blob and sets up the single stable HTMLAudioElement.
   * Idempotent: returns existing Audio instance if already initialized.
   */
  const getOrCreateAudio = async (): Promise<HTMLAudioElement> => {
    if (audioRef.current && cachedBlobUrlRef.current) {
      return audioRef.current;
    }

    if (isAudioLoadingRef.current) {
      // If already loading in parallel, poll briefly
      while (isAudioLoadingRef.current && !audioRef.current && isMountedRef.current) {
        await new Promise(r => setTimeout(r, 50));
      }
      if (audioRef.current) return audioRef.current;
    }

    isAudioLoadingRef.current = true;
    setIsLoading(true);
    setErrorMessage(null);

    try {
      if (!message.mediaUrl) {
        throw new Error('Missing voice message audio URL');
      }

      const blobUrl = await getAuthenticatedMediaBlobUrl(message.conversationId, message.mediaUrl);
      if (!isMountedRef.current) {
        throw new Error('Component unmounted');
      }

      cachedBlobUrlRef.current = blobUrl;

      // Create exactly one Audio element
      const audio = new Audio();
      audio.preload = 'metadata';
      audio.playbackRate = playbackSpeed;
      audio.loop = false; // Explicitly ensure loop is false

      audio.onplay = () => {
        if (isMountedRef.current) {
          setIsPlaying(true);
        }
      };

      audio.onpause = () => {
        if (isMountedRef.current) {
          setIsPlaying(false);
        }
      };

      audio.onended = () => {
        if (isMountedRef.current) {
          setIsPlaying(false);
          setCurrentTime(0); // Reset scrubber position to beginning
        }
        playbackCoordinator.stop(playerIdRef.current);
      };

      audio.ontimeupdate = () => {
        if (isMountedRef.current && !audio.paused) {
          setCurrentTime(audio.currentTime);
        }
      };

      audio.onloadedmetadata = () => {
        if (isMountedRef.current && audio.duration && !isNaN(audio.duration) && isFinite(audio.duration)) {
          setDuration(audio.duration);
        }
      };

      audio.onerror = () => {
        console.error('[WIBBY VOICE] Audio element playback error:', audio.error);
        if (isMountedRef.current) {
          setIsPlaying(false);
          setErrorMessage('Audio couldn’t be played');
        }
        playbackCoordinator.stop(playerIdRef.current);
      };

      audio.src = blobUrl;
      audioRef.current = audio;

      setIsLoading(false);
      isAudioLoadingRef.current = false;
      return audio;
    } catch (err: any) {
      isAudioLoadingRef.current = false;
      if (isMountedRef.current) {
        setIsLoading(false);
        setErrorMessage(err.message || 'Failed to load audio');
      }
      throw err;
    }
  };

  /**
   * Play / Pause toggle with single-playback coordination and ended state handling
   */
  const togglePlay = async () => {
    try {
      if (isPlaying && audioRef.current) {
        audioRef.current.pause();
        playbackCoordinator.pause(playerIdRef.current);
        return;
      }

      const audio = await getOrCreateAudio();

      // If audio has ended or is at the end, rewind to start before playing again
      if (audio.ended || (audio.duration && audio.currentTime >= audio.duration - 0.05)) {
        audio.currentTime = 0;
        setCurrentTime(0);
      }

      // Notify coordinator to pause any other active voice message
      playbackCoordinator.play(playerIdRef.current, handleCoordinatorPause);

      audio.playbackRate = playbackSpeed;
      await audio.play();
    } catch (err) {
      console.error('[WIBBY VOICE] togglePlay error:', err);
    }
  };

  /**
   * Seek by clicking or scrubbing the waveform (supports mouse and mobile touch)
   */
  const applySeekFromClientX = async (clientX: number, container: HTMLElement) => {
    const effectiveDuration = duration || message.duration || 1;
    const rect = container.getBoundingClientRect();
    const clickX = clientX - rect.left;
    const ratio = Math.max(0, Math.min(1, clickX / rect.width));
    const targetTime = ratio * effectiveDuration;

    setCurrentTime(targetTime);

    try {
      const audio = await getOrCreateAudio();
      audio.currentTime = targetTime;
    } catch (err) {
      console.error('[WIBBY VOICE] Seek error:', err);
    }
  };

  const handleSeek = (e: React.MouseEvent<HTMLDivElement>) => {
    applySeekFromClientX(e.clientX, e.currentTarget);
  };

  const handleTouchSeek = (e: React.TouchEvent<HTMLDivElement>) => {
    if (e.touches && e.touches.length > 0) {
      applySeekFromClientX(e.touches[0].clientX, e.currentTarget);
    }
  };

  /**
   * Speed Toggle: 1.0x -> 1.5x -> 2.0x -> 1.0x
   */
  const toggleSpeed = () => {
    let nextSpeed = 1.0;
    if (playbackSpeed === 1.0) nextSpeed = 1.5;
    else if (playbackSpeed === 1.5) nextSpeed = 2.0;
    else nextSpeed = 1.0;

    setPlaybackSpeed(nextSpeed);
    if (audioRef.current) {
      audioRef.current.playbackRate = nextSpeed;
    }
  };

  /**
   * Download Voice Message
   */
  const handleDownload = async () => {
    if (!message.mediaUrl) return;
    try {
      await downloadMediaFile(message.conversationId, message.mediaUrl, message.fileName || `voice_note_${message._id}.webm`);
    } catch (err) {
      console.error('[WIBBY VOICE] Download failed:', err);
    }
  };

  const effectiveDuration = duration || message.duration || 0;
  const progressRatio = effectiveDuration > 0 ? currentTime / effectiveDuration : 0;

  return (
    <div className={`voice-message-player ${isOwn ? 'own' : 'peer'}`}>
      {/* Error alert fallback */}
      {errorMessage ? (
        <div className="voice-player-error">
          <span className="voice-error-text">⚠️ {errorMessage}</span>
          <div className="voice-error-actions">
            <button className="voice-retry-btn" onClick={togglePlay}>
              Retry
            </button>
            <button className="voice-download-btn-mini" onClick={handleDownload} title="Download voice file">
              Download
            </button>
          </div>
        </div>
      ) : (
        <div className="voice-player-main">
          
          {/* Play / Pause / Loading Button */}
          <button 
            className={`voice-player-btn ${isPlaying ? 'playing' : ''}`}
            onClick={togglePlay}
            disabled={isLoading}
            aria-label={isPlaying ? 'Pause voice message' : 'Play voice message'}
            title={isPlaying ? 'Pause' : 'Play'}
          >
            {isLoading ? (
              <span className="voice-loading-spinner" />
            ) : isPlaying ? (
              <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
                <rect x="6" y="4" width="4" height="16" rx="1" />
                <rect x="14" y="4" width="4" height="16" rx="1" />
              </svg>
            ) : (
              <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" style={{ marginLeft: '2px' }}>
                <polygon points="5 3 19 12 5 21 5 3" />
              </svg>
            )}
          </button>

          {/* Interactive Waveform Visualizer */}
          <div 
            className="voice-waveform-container" 
            onClick={handleSeek}
            onTouchStart={handleTouchSeek}
            onTouchMove={handleTouchSeek}
            title="Click or drag to seek"
            role="slider"
            aria-label="Audio scrubber"
            aria-valuenow={currentTime}
            aria-valuemin={0}
            aria-valuemax={effectiveDuration}
          >
            <div className="voice-waveform-bars">
              {waveformBars.map((barHeight, idx) => {
                const barRatio = idx / waveformBars.length;
                const isPlayed = barRatio <= progressRatio;
                return (
                  <div
                    key={idx}
                    className={`voice-bar-item ${isPlayed ? 'played' : 'unplayed'}`}
                    style={{ height: `${Math.max(4, Math.round(barHeight * 30))}px` }}
                  />
                );
              })}
            </div>
          </div>

          {/* Player Metadata & Controls */}
          <div className="voice-player-side">
            {/* Speed Toggle Button */}
            <button 
              className="voice-speed-badge" 
              onClick={toggleSpeed}
              title="Change playback speed"
              aria-label={`Playback speed ${playbackSpeed}x`}
            >
              {playbackSpeed}x
            </button>

            {/* Time Stamp */}
            <span className="voice-time-label">
              {currentTime > 0 ? formatAudioDuration(currentTime) : formatAudioDuration(effectiveDuration)}
            </span>
          </div>

        </div>
      )}
    </div>
  );
}
