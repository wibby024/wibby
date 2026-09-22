/**
 * Dedicated Phone-Like Incoming Call Ringtone Service for Wibby.
 * 
 * Generates an authentic, familiar phone ringtone using Web Audio API synthesis
 * with graceful fallback to bundled audio asset (/audio/wibby-ringtone.mp3).
 * 
 * Features:
 * - Familiar, phone-like dual-frequency harmonic caller ringtone (melodic & clear).
 * - Immediate, reliable stopping on accept, decline, cancel, timeout, or call end.
 * - Resilient autoplay unlock on first user interaction if browser policy blocks initial audio.
 * - Zero clicks, zero audio loops left running after call completion.
 */

class RingtoneService {
  private audioCtx: AudioContext | null = null;
  private isPlaying = false;
  private currentCallId: string | null = null;
  private ringCycleTimer: any = null;
  private activeOscillators: OscillatorNode[] = [];
  private activeGainNodes: GainNode[] = [];
  private audioElement: HTMLAudioElement | null = null;
  private userGestureAttached = false;
  private autoplayBlocked = false;

  constructor() {
    this.initAudioElement();
  }

  private initAudioElement() {
    if (typeof window === 'undefined') return;
    try {
      const audio = new Audio('/audio/wibby-ringtone.mp3');
      audio.preload = 'auto';
      audio.loop = true;
      audio.volume = 0.65;

      audio.addEventListener('error', () => {
        if (audio.src.endsWith('.mp3')) {
          audio.src = '/audio/wibby-ringtone.wav';
          audio.load();
        }
      });
      this.audioElement = audio;
    } catch {
      // Audio element creation failure is fine, Web Audio API handles it
    }
  }

  private getAudioContext(): AudioContext | null {
    if (typeof window === 'undefined') return null;
    if (!this.audioCtx || this.audioCtx.state === 'closed') {
      const AudioCtxClass = window.AudioContext || (window as any).webkitAudioContext;
      if (AudioCtxClass) {
        this.audioCtx = new AudioCtxClass();
      }
    }
    return this.audioCtx;
  }

  private attachGestureUnlock() {
    if (this.userGestureAttached || typeof window === 'undefined') return;
    this.userGestureAttached = true;

    const unlockHandler = () => {
      if (this.isPlaying && this.autoplayBlocked) {
        const ctx = this.getAudioContext();
        if (ctx && ctx.state === 'suspended') {
          ctx.resume().then(() => {
            this.autoplayBlocked = false;
          }).catch(() => {});
        }
        if (this.audioElement) {
          this.audioElement.play().then(() => {
            this.autoplayBlocked = false;
          }).catch(() => {});
        }
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
   * Plays a single melodic double-ring burst using Web Audio API synthesis.
   * Cadence: Ring (0.8s) -> Pause (0.25s) -> Ring (0.8s) -> Wait (2.5s) -> Repeat
   */
  private playPhoneBurst() {
    if (!this.isPlaying) return;

    const ctx = this.getAudioContext();
    if (!ctx) {
      // Fallback to audio element if Web Audio is unsupported
      this.playAudioElementFallback();
      return;
    }

    if (ctx.state === 'suspended') {
      ctx.resume().catch(() => {
        this.autoplayBlocked = true;
        this.attachGestureUnlock();
      });
    }

    const now = ctx.currentTime;

    // Modern, soft bell/marimba arpeggio: C6 (1046.50Hz), E6 (1318.51Hz), G6 (1567.98Hz), C7 (2093.00Hz)
    // Warm harmonic envelope with smooth exponential decay
    const notes = [
      { freq: 1046.50, time: 0.00, dur: 0.40 },
      { freq: 1318.51, time: 0.15, dur: 0.40 },
      { freq: 1567.98, time: 0.30, dur: 0.40 },
      { freq: 2093.00, time: 0.45, dur: 0.80 },
      // Second melodic phrase
      { freq: 1567.98, time: 1.20, dur: 0.40 },
      { freq: 1318.51, time: 1.35, dur: 0.40 },
      { freq: 1046.50, time: 1.50, dur: 0.40 },
      { freq: 1318.51, time: 1.65, dur: 0.80 }
    ];

    notes.forEach(note => {
      const startTime = now + note.time;
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();

      osc.type = 'sine';
      osc.frequency.setValueAtTime(note.freq, startTime);

      // Add a subtle harmonic overtone for warm acoustic richness
      const overtone = ctx.createOscillator();
      const overtoneGain = ctx.createGain();
      overtone.type = 'sine';
      overtone.frequency.setValueAtTime(note.freq * 2.01, startTime); // Slight detune for bell-like quality
      overtoneGain.gain.setValueAtTime(0, startTime);
      overtoneGain.gain.linearRampToValueAtTime(0.02, startTime + 0.015);
      overtoneGain.gain.exponentialRampToValueAtTime(0.0001, startTime + note.dur * 0.6);

      gain.gain.setValueAtTime(0, startTime);
      gain.gain.linearRampToValueAtTime(0.15, startTime + 0.015); // Faster attack
      gain.gain.exponentialRampToValueAtTime(0.0001, startTime + note.dur);

      osc.connect(gain);
      gain.connect(ctx.destination);
      overtone.connect(overtoneGain);
      overtoneGain.connect(ctx.destination);

      osc.start(startTime);
      osc.stop(startTime + note.dur);
      overtone.start(startTime);
      overtone.stop(startTime + note.dur);

      this.activeOscillators.push(osc, overtone);
      this.activeGainNodes.push(gain, overtoneGain);
    });

    // Schedule next ring cycle after 3.6 seconds
    this.ringCycleTimer = setTimeout(() => {
      if (this.isPlaying) {
        this.playPhoneBurst();
      }
    }, 3600);
  }

  private playAudioElementFallback() {
    if (!this.audioElement || !this.isPlaying) return;
    this.audioElement.currentTime = 0;
    this.audioElement.play().catch((err: any) => {
      if (err.name === 'NotAllowedError') {
        this.autoplayBlocked = true;
        this.attachGestureUnlock();
      }
    });
  }

  /**
   * Start the incoming call ringtone.
   */
  start(callId: string = 'call_incoming') {
    if (this.isPlaying && this.currentCallId === callId) return;

    this.stop();
    this.currentCallId = callId;
    this.isPlaying = true;
    this.autoplayBlocked = false;

    console.log(`[RINGTONE] Starting phone ringtone for call: ${callId}`);
    this.playPhoneBurst();
  }

  /**
   * Immediately and cleanly stop all ringtone audio.
   */
  stop(callId?: string) {
    if (!this.isPlaying && this.activeOscillators.length === 0) return;

    this.isPlaying = false;
    this.currentCallId = null;

    if (this.ringCycleTimer) {
      clearTimeout(this.ringCycleTimer);
      this.ringCycleTimer = null;
    }

    // Stop and disconnect all Web Audio oscillators
    this.activeOscillators.forEach(osc => {
      try {
        osc.stop();
        osc.disconnect();
      } catch {}
    });
    this.activeOscillators = [];

    // Fade out and disconnect gain nodes
    this.activeGainNodes.forEach(gain => {
      try {
        gain.gain.setValueAtTime(0, 0);
        gain.disconnect();
      } catch {}
    });
    this.activeGainNodes = [];

    // Stop audio element if running
    if (this.audioElement) {
      try {
        this.audioElement.pause();
        this.audioElement.currentTime = 0;
      } catch {}
    }

    console.log(`[RINGTONE] Ringtone stopped cleanly for callId=${callId || 'all'}`);
  }

  /**
   * Complete destruction of resources.
   */
  destroy() {
    this.stop();
    if (this.audioCtx && this.audioCtx.state !== 'closed') {
      try {
        this.audioCtx.close().catch(() => {});
      } catch {}
      this.audioCtx = null;
    }
    if (this.audioElement) {
      this.audioElement.src = '';
      this.audioElement = null;
    }
  }
}

export const ringtoneService = new RingtoneService();
