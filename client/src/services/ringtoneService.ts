/**
 * Dedicated Incoming Call Ringtone Service for Wibby.
 * 
 * Completely isolated from:
 * - RTCPeerConnection
 * - WebRTC remote MediaStream / <audio>
 * - Local microphone MediaStream
 * - VoiceRecorder & VoiceMessagePlayer
 * 
 * Uses a dedicated HTMLAudioElement with bundled pristine audio asset (/audio/wibby-ringtone.mp3).
 * Audio fallback to /audio/wibby-ringtone.wav if needed.
 * 
 * Features:
 * - Zero clicks, pops, crackles, or loop distortion.
 * - Single controlled instance per call session.
 * - Resilient autoplay handling with passive gesture unlock (no console spam).
 * - Immediate, complete stop on Accept, Decline, Cancel, Hangup, Timeout, Unmount.
 */

class RingtoneService {
  private audioElement: HTMLAudioElement | null = null;
  private isPlaying = false;
  private autoplayBlocked = false;
  private currentCallId: string | null = null;
  private instanceId: string = 'rt_' + Math.random().toString(36).substring(2, 8);
  private userGestureAttached = false;
  private startCountPerCall: Record<string, number> = {};

  constructor() {
    this.initAudioElement();
  }

  private initAudioElement() {
    if (typeof window === 'undefined') return;
    if (this.audioElement) return;

    this.instanceId = 'rt_' + Math.random().toString(36).substring(2, 8);
    const audio = new Audio('/audio/wibby-ringtone.mp3');
    audio.preload = 'auto';
    audio.loop = true;
    audio.volume = 0.65; // Conservative headroom, pleasant, clean, zero clipping

    // Fallback to WAV if MP3 is not supported or fails
    audio.addEventListener('error', (e) => {
      console.warn('[RINGTONE] Audio asset warning, checking format fallback:', e);
      if (audio.src.endsWith('.mp3')) {
        audio.src = '/audio/wibby-ringtone.wav';
        audio.load();
      }
    });

    this.audioElement = audio;
    console.log(`[RINGTONE] create: instanceId=${this.instanceId} timestamp=${Date.now()} src=${audio.src}`);
  }

  private attachGestureUnlock() {
    if (this.userGestureAttached || typeof window === 'undefined') return;
    this.userGestureAttached = true;

    const unlockHandler = () => {
      if (this.isPlaying && this.autoplayBlocked && this.audioElement) {
        console.log(`[RINGTONE] User gesture detected; unlocking blocked ringtone: callId=${this.currentCallId}`);
        this.audioElement.play()
          .then(() => {
            this.autoplayBlocked = false;
            console.log(`[RINGTONE] Playback resumed on gesture: callId=${this.currentCallId}`);
          })
          .catch(() => {});
      }
      if (!this.isPlaying || !this.autoplayBlocked) {
        window.removeEventListener('pointerdown', unlockHandler);
        window.removeEventListener('keydown', unlockHandler);
        window.removeEventListener('touchstart', unlockHandler);
        this.userGestureAttached = false;
      }
    };

    window.addEventListener('pointerdown', unlockHandler, { passive: true });
    window.addEventListener('keydown', unlockHandler, { passive: true });
    window.addEventListener('touchstart', unlockHandler, { passive: true });
  }

  /**
   * Start incoming call ringtone for a specific callId.
   */
  start(callId: string = 'call_incoming') {
    if (!this.audioElement) {
      this.initAudioElement();
    }
    const audio = this.audioElement;
    if (!audio) return;

    // Deduplication: If already playing for this exact callId, avoid double trigger
    if (this.isPlaying && this.currentCallId === callId) {
      if (this.autoplayBlocked) {
        audio.play().then(() => { this.autoplayBlocked = false; }).catch(() => {});
      }
      return;
    }

    this.currentCallId = callId;
    this.isPlaying = true;
    this.startCountPerCall[callId] = (this.startCountPerCall[callId] || 0) + 1;
    const count = this.startCountPerCall[callId];

    console.log(`[RINGTONE] start: callId=${callId} instanceId=${this.instanceId} ringtoneStartCount=${count} timestamp=${Date.now()}`);

    audio.currentTime = 0;
    const playPromise = audio.play();
    if (playPromise !== undefined) {
      playPromise
        .then(() => {
          this.autoplayBlocked = false;
          console.log(`[RINGTONE] Ringtone playing cleanly: callId=${callId}`);
        })
        .catch((err: any) => {
          if (err.name === 'NotAllowedError') {
            this.autoplayBlocked = true;
            console.log(`[RINGTONE] Autoplay blocked by browser policy (Incognito/uninteracted window); gesture unlock attached.`);
            this.attachGestureUnlock();
          } else {
            console.warn(`[RINGTONE] Playback warning:`, err?.message || err);
          }
        });
    }
  }

  /**
   * Immediately and cleanly stop ringtone playback.
   */
  stop(callId?: string) {
    if (!this.isPlaying && (!this.audioElement || this.audioElement.paused)) return;

    const stoppedCallId = callId || this.currentCallId;
    console.log(`[RINGTONE] stop: callId=${stoppedCallId} instanceId=${this.instanceId} timestamp=${Date.now()}`);

    this.isPlaying = false;
    this.autoplayBlocked = false;

    if (this.audioElement) {
      try {
        this.audioElement.pause();
        this.audioElement.currentTime = 0;
      } catch (e) {
        // ignore
      }
      console.log(`[RINGTONE] stop complete: paused=${this.audioElement.paused} currentTime=${this.audioElement.currentTime}`);
    }

    if (this.userGestureAttached && typeof window !== 'undefined') {
      this.userGestureAttached = false;
    }
  }

  /**
   * Complete destruction of ringtone resources.
   */
  destroy() {
    this.stop();
    if (this.audioElement) {
      console.log(`[RINGTONE] destroy: instanceId=${this.instanceId} timestamp=${Date.now()}`);
      this.audioElement.src = '';
      this.audioElement = null;
    }
  }
}

export const ringtoneService = new RingtoneService();
