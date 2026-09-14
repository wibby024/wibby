import React, { useState, useEffect, useRef, useCallback } from 'react';
import { getBestAudioRecorderMimeType, formatAudioDuration } from '../config/media';
import './VoiceRecorder.css';

export type RecordingState = 
  | 'IDLE'
  | 'REQUESTING_PERMISSION'
  | 'RECORDING'
  | 'PAUSED'
  | 'PROCESSING'
  | 'PREVIEW'
  | 'UPLOADING'
  | 'SENT'
  | 'ERROR'
  | 'CANCELLED';

export interface VoiceRecordingResult {
  audioBlob: Blob;
  mimeType: string;
  duration: number;
  waveform: number[];
  fileName: string;
}

interface VoiceRecorderProps {
  isOpen: boolean;
  onSend: (result: VoiceRecordingResult) => Promise<void> | void;
  onCancel: () => void;
  maxDurationSeconds?: number;
}

const MAX_RECORDING_DURATION = 600; // 10 minutes maximum
const MIN_RECORDING_DURATION = 0.5; // 0.5s minimum

export default function VoiceRecorder({
  isOpen,
  onSend,
  onCancel,
  maxDurationSeconds = MAX_RECORDING_DURATION
}: VoiceRecorderProps) {
  const [state, setState] = useState<RecordingState>('IDLE');
  const [duration, setDuration] = useState<number>(0);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [actualMimeType, setActualMimeType] = useState<string>('audio/webm');
  const [audioBlob, setAudioBlob] = useState<Blob | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [waveform, setWaveform] = useState<number[]>([]);
  const [liveLevels, setLiveLevels] = useState<number[]>(new Array(24).fill(0.15));

  // Preview playback state
  const [isPreviewPlaying, setIsPreviewPlaying] = useState<boolean>(false);
  const [previewCurrentTime, setPreviewCurrentTime] = useState<number>(0);
  const [isSending, setIsSending] = useState<boolean>(false);

  // References for hardware, active session and streams
  const activeSessionIdRef = useRef<string | null>(null);
  const mediaStreamRef = useRef<MediaStream | null>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const animFrameRef = useRef<number | null>(null);
  const timerIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const startTimeRef = useRef<number>(0);
  const pausedTimeAccumulatorRef = useRef<number>(0);
  const pauseStartRef = useRef<number>(0);
  const previewAudioRef = useRef<HTMLAudioElement | null>(null);
  const recordedRmsHistoryRef = useRef<number[]>([]);

  // Cleanup all hardware media streams, audio contexts, timers, and object URLs
  const cleanupHardwareAndStreams = useCallback(() => {
    // Invalidate active recording session
    activeSessionIdRef.current = null;

    // 1. Stop and detach MediaRecorder
    if (mediaRecorderRef.current) {
      try {
        if (mediaRecorderRef.current.state !== 'inactive') {
          mediaRecorderRef.current.stop();
        }
      } catch {}
      mediaRecorderRef.current.ondataavailable = null;
      mediaRecorderRef.current.onstop = null;
      mediaRecorderRef.current.onerror = null;
      mediaRecorderRef.current = null;
    }

    // 2. Stop all microphone tracks immediately
    if (mediaStreamRef.current) {
      try {
        mediaStreamRef.current.getTracks().forEach(track => {
          track.stop();
          console.log('[WIBBY AUDIO FORENSICS] Microphone track stopped:', track.kind, track.label);
        });
      } catch (err) {
        console.error('[WIBBY AUDIO FORENSICS] Error stopping media stream tracks:', err);
      }
      mediaStreamRef.current = null;
    }

    // 3. Clear timers and animation frames
    if (timerIntervalRef.current) {
      clearInterval(timerIntervalRef.current);
      timerIntervalRef.current = null;
    }
    if (animFrameRef.current) {
      cancelAnimationFrame(animFrameRef.current);
      animFrameRef.current = null;
    }

    // 4. Close audio context
    if (audioContextRef.current && audioContextRef.current.state !== 'closed') {
      try {
        audioContextRef.current.close().catch(() => {});
      } catch {}
      audioContextRef.current = null;
    }

    // 5. Pause and cleanup preview audio
    if (previewAudioRef.current) {
      try {
        previewAudioRef.current.pause();
        previewAudioRef.current.src = '';
      } catch {}
      previewAudioRef.current = null;
    }
  }, []);

  // Cleanup on unmount or modal close
  useEffect(() => {
    if (!isOpen) {
      cleanupHardwareAndStreams();
      if (previewUrl) {
        URL.revokeObjectURL(previewUrl);
        setPreviewUrl(null);
      }
      setState('IDLE');
    }
    return () => {
      cleanupHardwareAndStreams();
    };
  }, [isOpen, cleanupHardwareAndStreams, previewUrl]);

  // Audio level visualizer loop (analyzes live microphone audio independently from recorder chunks)
  const updateVisualizer = useCallback(() => {
    if (!analyserRef.current) return;
    const bufferLength = analyserRef.current.frequencyBinCount;
    const dataArray = new Uint8Array(bufferLength);
    analyserRef.current.getByteFrequencyData(dataArray);

    let sum = 0;
    for (let i = 0; i < bufferLength; i++) {
      sum += dataArray[i];
    }
    const avg = sum / bufferLength / 255; // 0.0 to 1.0
    const normalizedAvg = Math.max(0.12, Math.min(1.0, avg * 1.8));

    // Keep history for fallback waveform
    recordedRmsHistoryRef.current.push(normalizedAvg);

    // Update 24 visualizer bars with a wave shift
    setLiveLevels(prev => {
      const next = [...prev.slice(1), normalizedAvg];
      return next;
    });

    animFrameRef.current = requestAnimationFrame(updateVisualizer);
  }, []);

  /**
   * Generates a normalized 32-bar waveform from the audio Blob.
   * Never throws or blocks sending - falls back to deterministic/analyser waveform.
   */
  const extractWaveform = async (blob: Blob, durationSec: number): Promise<number[]> => {
    try {
      const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
      if (!AudioCtx) throw new Error('Web Audio API not supported');

      const arrayBuffer = await blob.arrayBuffer();
      const ctx = new AudioCtx();
      const audioBuffer = await ctx.decodeAudioData(arrayBuffer);
      const rawData = audioBuffer.getChannelData(0);
      const samples = 32;
      const blockSize = Math.floor(rawData.length / samples);
      const peaks: number[] = [];

      let maxPeak = 0;
      for (let i = 0; i < samples; i++) {
        const start = blockSize * i;
        let sum = 0;
        for (let j = 0; j < blockSize; j++) {
          sum += Math.abs(rawData[start + j] || 0);
        }
        const avg = sum / blockSize;
        peaks.push(avg);
        if (avg > maxPeak) maxPeak = avg;
      }

      ctx.close().catch(() => {});

      // Normalize peaks between 0.15 and 1.0
      const normFactor = maxPeak > 0 ? 0.95 / maxPeak : 1;
      return peaks.map(p => {
        const val = Math.max(0.15, Math.min(1.0, p * normFactor));
        return Number(val.toFixed(3));
      });
    } catch (decodeErr) {
      console.warn('[WIBBY AUDIO FORENSICS] decodeAudioData fallback:', decodeErr);

      // Try utilizing recorded live analyser history
      const history = recordedRmsHistoryRef.current;
      if (history.length >= 10) {
        const samples = 32;
        const step = Math.floor(history.length / samples) || 1;
        const fallbackPeaks: number[] = [];
        for (let i = 0; i < samples; i++) {
          const index = Math.min(i * step, history.length - 1);
          fallbackPeaks.push(Number(Math.max(0.18, Math.min(0.95, history[index])).toFixed(3)));
        }
        return fallbackPeaks;
      }

      // Pure deterministic fallback waveform
      const deterministicPeaks: number[] = [];
      for (let i = 0; i < 32; i++) {
        const wave = 0.25 + 0.5 * Math.abs(Math.sin((i / 32) * Math.PI * 3 + durationSec));
        deterministicPeaks.push(Number(wave.toFixed(3)));
      }
      return deterministicPeaks;
    }
  };

  /**
   * Start microphone recording with unique session ID isolation and continuous encoding.
   */
  const startRecording = async () => {
    // Generate unique session identifier
    const sessionId = `rec_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
    activeSessionIdRef.current = sessionId;

    console.log(`[WIBBY AUDIO FORENSICS] Initializing new recording session: ${sessionId}`);

    // Pre-cleanup any existing stream or recorder
    cleanupHardwareAndStreams();
    activeSessionIdRef.current = sessionId; // Re-set after cleanup

    try {
      setErrorMessage(null);
      setState('REQUESTING_PERMISSION');
      recordedRmsHistoryRef.current = [];
      setDuration(0);
      pausedTimeAccumulatorRef.current = 0;

      if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
        throw new Error('Microphone access is not supported by this browser');
      }

      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true
        }
      });

      // Verify this session is still active (e.g. user didn't cancel during permission prompt)
      if (activeSessionIdRef.current !== sessionId) {
        console.log(`[WIBBY AUDIO FORENSICS] Session ${sessionId} superseded/cancelled during getUserMedia. Stopping stream.`);
        stream.getTracks().forEach(t => t.stop());
        return;
      }

      mediaStreamRef.current = stream;

      // Detect optimal MIME type
      const preferredMime = getBestAudioRecorderMimeType();
      const options: MediaRecorderOptions = preferredMime ? { mimeType: preferredMime } : {};

      let recorder: MediaRecorder;
      try {
        recorder = new MediaRecorder(stream, options);
      } catch {
        // Fallback to default
        recorder = new MediaRecorder(stream);
      }

      mediaRecorderRef.current = recorder;
      const actualMime = recorder.mimeType || preferredMime || 'audio/webm';
      setActualMimeType(actualMime);
      console.log(`[WIBBY AUDIO FORENSICS] Session ${sessionId} MediaRecorder created. MIME: ${actualMime}`);

      // Web Audio analyser for live visualizer
      try {
        const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
        if (AudioCtx) {
          const audioCtx = new AudioCtx();
          audioContextRef.current = audioCtx;
          const source = audioCtx.createMediaStreamSource(stream);
          const analyser = audioCtx.createAnalyser();
          analyser.fftSize = 64;
          source.connect(analyser);
          analyserRef.current = analyser;
          animFrameRef.current = requestAnimationFrame(updateVisualizer);
        }
      } catch (audioErr) {
        console.warn('[WIBBY AUDIO FORENSICS] Web Audio Analyser setup note:', audioErr);
      }

      // Session-scoped chunk collection array (isolated from other sessions)
      const sessionChunks: Blob[] = [];
      let hasFinalized = false;

      recorder.ondataavailable = (event: BlobEvent) => {
        if (activeSessionIdRef.current !== sessionId) {
          console.warn(`[WIBBY AUDIO FORENSICS] Ignoring chunk from stale session: ${sessionId}`);
          return;
        }
        if (event.data && event.data.size > 0) {
          sessionChunks.push(event.data);
          console.log(`[WIBBY AUDIO FORENSICS] Session ${sessionId} chunk #${sessionChunks.length}: ${event.data.size} bytes (type: ${event.data.type})`);
        }
      };

      recorder.onerror = (err) => {
        if (activeSessionIdRef.current !== sessionId) return;
        console.error(`[WIBBY AUDIO FORENSICS] Session ${sessionId} error:`, err);
        setErrorMessage('Recording error occurred');
        setState('ERROR');
        cleanupHardwareAndStreams();
      };

      recorder.onstop = async () => {
        if (activeSessionIdRef.current !== sessionId) {
          console.warn(`[WIBBY AUDIO FORENSICS] Ignoring stop event from stale session: ${sessionId}`);
          return;
        }

        if (hasFinalized) {
          console.warn(`[WIBBY AUDIO FORENSICS] Stop event already finalized for session: ${sessionId}`);
          return;
        }
        hasFinalized = true;

        console.log(`[WIBBY AUDIO FORENSICS] Session ${sessionId} stopped. Finalizing ${sessionChunks.length} chunks...`);

        // Stop microphone tracks immediately
        if (mediaStreamRef.current) {
          mediaStreamRef.current.getTracks().forEach(t => t.stop());
          mediaStreamRef.current = null;
        }
        if (timerIntervalRef.current) {
          clearInterval(timerIntervalRef.current);
          timerIntervalRef.current = null;
        }
        if (animFrameRef.current) {
          cancelAnimationFrame(animFrameRef.current);
          animFrameRef.current = null;
        }
        if (audioContextRef.current) {
          try { audioContextRef.current.close(); } catch {}
          audioContextRef.current = null;
        }

        const totalBlob = new Blob(sessionChunks, { type: actualMime });
        console.log(`[WIBBY AUDIO FORENSICS] Session ${sessionId} final Blob: size=${totalBlob.size} bytes, type=${totalBlob.type}`);

        if (totalBlob.size === 0) {
          setErrorMessage('Empty voice recording');
          setState('ERROR');
          return;
        }

        setAudioBlob(totalBlob);
        const url = URL.createObjectURL(totalBlob);
        setPreviewUrl(url);

        setState('PROCESSING');
        const calculatedWaveform = await extractWaveform(totalBlob, duration);
        setWaveform(calculatedWaveform);
        setState('PREVIEW');
      };

      // Continuous recording without timeslice fragmentation
      // This produces a monolithic, valid container header with monotonic timestamps
      recorder.start();
      startTimeRef.current = Date.now();
      setState('RECORDING');

      // Timer update
      timerIntervalRef.current = setInterval(() => {
        if (activeSessionIdRef.current !== sessionId) return;
        const now = Date.now();
        const elapsed = (now - startTimeRef.current - pausedTimeAccumulatorRef.current) / 1000;
        setDuration(elapsed);

        if (elapsed >= maxDurationSeconds) {
          console.log('[WIBBY AUDIO FORENSICS] Maximum recording duration reached. Auto-stopping.');
          stopRecording();
        }
      }, 100);

    } catch (err: any) {
      if (activeSessionIdRef.current !== sessionId) return;
      console.error('[WIBBY AUDIO FORENSICS] Permission or recording setup error:', err);
      cleanupHardwareAndStreams();
      let msg = 'Could not access microphone';
      if (err.name === 'NotAllowedError' || err.name === 'PermissionDeniedError') {
        msg = 'Microphone permission denied. Please allow microphone access in your browser settings.';
      } else if (err.name === 'NotFoundError' || err.name === 'DevicesNotFoundError') {
        msg = 'No microphone device found on your system.';
      } else if (err.message) {
        msg = err.message;
      }
      setErrorMessage(msg);
      setState('ERROR');
    }
  };

  /**
   * Pause recording (does NOT finalize audio Blob)
   */
  const pauseRecording = () => {
    if (state !== 'RECORDING' || !mediaRecorderRef.current) return;
    if (mediaRecorderRef.current.state === 'recording') {
      mediaRecorderRef.current.pause();
    }
    pauseStartRef.current = Date.now();
    if (timerIntervalRef.current) {
      clearInterval(timerIntervalRef.current);
      timerIntervalRef.current = null;
    }
    if (animFrameRef.current) {
      cancelAnimationFrame(animFrameRef.current);
      animFrameRef.current = null;
    }
    setState('PAUSED');
  };

  /**
   * Resume recording from paused state
   */
  const resumeRecording = () => {
    if (state !== 'PAUSED' || !mediaRecorderRef.current) return;
    if (pauseStartRef.current > 0) {
      pausedTimeAccumulatorRef.current += (Date.now() - pauseStartRef.current);
      pauseStartRef.current = 0;
    }
    if (mediaRecorderRef.current.state === 'paused') {
      mediaRecorderRef.current.resume();
    }

    if (analyserRef.current) {
      animFrameRef.current = requestAnimationFrame(updateVisualizer);
    }

    timerIntervalRef.current = setInterval(() => {
      const now = Date.now();
      const elapsed = (now - startTimeRef.current - pausedTimeAccumulatorRef.current) / 1000;
      setDuration(elapsed);

      if (elapsed >= maxDurationSeconds) {
        stopRecording();
      }
    }, 100);

    setState('RECORDING');
  };

  /**
   * Stop recording and finalize audio Blob
   */
  const stopRecording = () => {
    if (!mediaRecorderRef.current || (state !== 'RECORDING' && state !== 'PAUSED')) return;

    if (duration < MIN_RECORDING_DURATION) {
      setErrorMessage('Voice message too short');
      cancelRecording();
      return;
    }

    try {
      if (mediaRecorderRef.current.state !== 'inactive') {
        mediaRecorderRef.current.stop();
      }
    } catch (err) {
      console.error('[WIBBY AUDIO FORENSICS] Error stopping MediaRecorder:', err);
    }
  };

  /**
   * Cancel and discard recording
   */
  const cancelRecording = () => {
    cleanupHardwareAndStreams();
    if (previewUrl) {
      URL.revokeObjectURL(previewUrl);
      setPreviewUrl(null);
    }
    setState('CANCELLED');
    onCancel();
  };

  // Preview play/pause toggle
  const togglePreviewPlay = () => {
    if (!previewUrl) return;

    if (!previewAudioRef.current) {
      const audio = new Audio(previewUrl);
      audio.loop = false;
      previewAudioRef.current = audio;

      audio.onplay = () => setIsPreviewPlaying(true);
      audio.onpause = () => setIsPreviewPlaying(false);
      audio.onended = () => {
        setIsPreviewPlaying(false);
        setPreviewCurrentTime(0);
      };
      audio.ontimeupdate = () => {
        setPreviewCurrentTime(audio.currentTime);
      };
    }

    const audio = previewAudioRef.current;
    if (audio.paused) {
      if (audio.ended || (audio.duration && audio.currentTime >= audio.duration - 0.05)) {
        audio.currentTime = 0;
        setPreviewCurrentTime(0);
      }
      audio.play().catch(err => {
        console.error('[WIBBY AUDIO FORENSICS] Preview playback error:', err);
      });
    } else {
      audio.pause();
    }
  };

  const seekPreview = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!previewAudioRef.current || !previewUrl || duration <= 0) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const clickX = e.clientX - rect.left;
    const ratio = Math.max(0, Math.min(1, clickX / rect.width));
    const targetTime = ratio * duration;
    previewAudioRef.current.currentTime = targetTime;
    setPreviewCurrentTime(targetTime);
  };

  // Final Send
  const handleFinalSend = async () => {
    if (isSending || state !== 'PREVIEW' || !audioBlob) return;
    setIsSending(true);
    setState('UPLOADING');

    try {
      // Choose extension matching actual MIME
      let ext = 'webm';
      if (actualMimeType.includes('mp4')) ext = 'mp4';
      else if (actualMimeType.includes('aac')) ext = 'aac';
      else if (actualMimeType.includes('ogg')) ext = 'ogg';
      else if (actualMimeType.includes('wav')) ext = 'wav';

      const fileName = `voice_${Date.now()}.${ext}`;

      console.log(`[WIBBY AUDIO FORENSICS] Sending voice note: fileName=${fileName}, size=${audioBlob.size}, type=${actualMimeType}, duration=${duration}`);

      await onSend({
        audioBlob,
        mimeType: actualMimeType,
        duration: Math.max(0.5, Number(duration.toFixed(2))),
        waveform,
        fileName
      });

      setState('SENT');
      cleanupHardwareAndStreams();
      if (previewUrl) {
        URL.revokeObjectURL(previewUrl);
        setPreviewUrl(null);
      }
    } catch (err: any) {
      console.error('[WIBBY AUDIO FORENSICS] Error sending voice note:', err);
      setErrorMessage(err.message || 'Failed to upload voice message');
      setState('ERROR');
      setIsSending(false);
    }
  };

  // Automatically start recording when mounted if in IDLE
  useEffect(() => {
    if (isOpen && state === 'IDLE') {
      startRecording();
    }
  }, [isOpen, state]);

  if (!isOpen) return null;

  return (
    <div className="voice-recorder-overlay" role="dialog" aria-modal="true" aria-label="Voice Message Recorder">
      <div className="voice-recorder-card">
        
        {/* Header with Title & Cancel */}
        <div className="voice-recorder-header">
          <div className="voice-recorder-title">
            <span className="voice-mic-icon">🎙️</span>
            <span>Voice Message</span>
          </div>
          <button 
            className="voice-btn-close" 
            onClick={cancelRecording}
            aria-label="Cancel recording"
            title="Cancel"
          >
            ✕
          </button>
        </div>

        {/* Error View */}
        {errorMessage && (
          <div className="voice-recorder-error" role="alert">
            <span className="error-icon">⚠️</span>
            <div className="error-text">{errorMessage}</div>
            <div className="error-actions">
              <button className="voice-btn-retry" onClick={startRecording}>
                Try Again
              </button>
              <button className="voice-btn-cancel-flat" onClick={cancelRecording}>
                Cancel
              </button>
            </div>
          </div>
        )}

        {/* Recording or Paused View */}
        {(state === 'RECORDING' || state === 'PAUSED' || state === 'REQUESTING_PERMISSION') && (
          <div className="voice-recording-body">
            <div className="voice-status-indicator">
              <span className={`voice-pulsing-dot ${state === 'PAUSED' ? 'paused' : 'recording'}`} />
              <span className="voice-state-label">
                {state === 'REQUESTING_PERMISSION' && 'Accessing microphone...'}
                {state === 'RECORDING' && 'Recording...'}
                {state === 'PAUSED' && 'Recording paused'}
              </span>
            </div>

            {/* Live Visualizer Waveform */}
            <div className="voice-live-bars" aria-hidden="true">
              {liveLevels.map((lvl, idx) => (
                <div 
                  key={idx} 
                  className={`voice-bar ${state === 'PAUSED' ? 'paused' : ''}`}
                  style={{ transform: `scaleY(${lvl})` }}
                />
              ))}
            </div>

            {/* Timer */}
            <div className="voice-timer" aria-live="polite">
              {formatAudioDuration(duration)}
              <span className="voice-max-hint"> / {formatAudioDuration(maxDurationSeconds)}</span>
            </div>

            {/* Recording Controls */}
            <div className="voice-controls-row">
              <button 
                className="voice-btn-circle voice-btn-trash" 
                onClick={cancelRecording}
                title="Discard recording"
                aria-label="Discard recording"
              >
                🗑️
              </button>

              {state === 'RECORDING' ? (
                <button 
                  className="voice-btn-circle voice-btn-pause" 
                  onClick={pauseRecording}
                  title="Pause recording"
                  aria-label="Pause recording"
                >
                  ⏸️
                </button>
              ) : (
                <button 
                  className="voice-btn-circle voice-btn-resume" 
                  onClick={resumeRecording}
                  title="Resume recording"
                  aria-label="Resume recording"
                >
                  ▶️
                </button>
              )}

              <button 
                className="voice-btn-circle voice-btn-stop" 
                onClick={stopRecording}
                title="Stop and preview"
                aria-label="Stop recording"
              >
                ⏹️
              </button>
            </div>
          </div>
        )}

        {/* Processing State */}
        {state === 'PROCESSING' && (
          <div className="voice-processing-body">
            <div className="voice-spinner" />
            <span>Processing voice message...</span>
          </div>
        )}

        {/* Preview State */}
        {state === 'PREVIEW' && (
          <div className="voice-preview-body">
            <div className="voice-preview-player">
              <button 
                className="voice-preview-play-btn"
                onClick={togglePreviewPlay}
                aria-label={isPreviewPlaying ? 'Pause preview' : 'Play preview'}
              >
                {isPreviewPlaying ? '⏸' : '▶'}
              </button>

              {/* Seekable Waveform Preview */}
              <div 
                className="voice-preview-waveform" 
                onClick={seekPreview}
                title="Click to seek preview"
              >
                {waveform.map((barHeight, idx) => {
                  const progressRatio = duration > 0 ? previewCurrentTime / duration : 0;
                  const isPlayed = (idx / waveform.length) <= progressRatio;
                  return (
                    <div 
                      key={idx} 
                      className={`voice-preview-bar ${isPlayed ? 'played' : 'unplayed'}`}
                      style={{ height: `${Math.round(barHeight * 36)}px` }}
                    />
                  );
                })}
              </div>

              <div className="voice-preview-time">
                {formatAudioDuration(previewCurrentTime > 0 ? previewCurrentTime : duration)}
              </div>
            </div>

            {/* Preview Action Buttons */}
            <div className="voice-preview-actions">
              <button 
                className="voice-btn-cancel-review"
                onClick={cancelRecording}
                disabled={isSending}
              >
                Discard
              </button>

              <button 
                className="voice-btn-send"
                onClick={handleFinalSend}
                disabled={isSending}
              >
                {isSending ? (
                  <>
                    <span className="voice-btn-spinner" />
                    <span>Sending...</span>
                  </>
                ) : (
                  <>
                    <span>Send Voice Message</span>
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <line x1="22" y1="2" x2="11" y2="13" />
                      <polygon points="22 2 15 22 11 13 2 9 22 2" />
                    </svg>
                  </>
                )}
              </button>
            </div>
          </div>
        )}

        {/* Uploading State */}
        {state === 'UPLOADING' && !errorMessage && (
          <div className="voice-processing-body">
            <div className="voice-spinner" />
            <span>Sending voice message...</span>
          </div>
        )}

      </div>
    </div>
  );
}
