/**
 * Dedicated Modern Incoming Call Ringtone Service for Wibby.
 * 
 * Features:
 * - Plays original modern, warm Wibby incoming call ringtone (/audio/wibby-ringtone.mp3).
 * - High-fidelity Web Audio API melodic synthesizer fallback (D-maj9 / B-min11 chime motif).
 * - Controlled single-instance lifecycle: zero overlapping audio instances, zero leaks.
 * - Immediate, reliable stop on accept, reject, caller cancel, or component unmount.
 * - Resilient autoplay unlock on first user interaction if browser policy blocks initial audio.
 * - Clean zero-crossing loop boundary: no clicks, pops, or audible glitches.
 */

interface SynthesizedVoice {
  start: number;
  duration: number;
  freq: number;
  gain: number;
  decayRate?: number;
}

// Custom Ringtone IndexedDB helper
const DB_NAME = 'wibby_ringtone_db';
const STORE_NAME = 'ringtone_store';

function openRingtoneDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (typeof window === 'undefined' || !window.indexedDB) {
      return reject(new Error('IndexedDB not supported'));
    }
    const req = window.indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME);
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function getStoredCustomRingtone(): Promise<{ blob: Blob; name: string } | null> {
  try {
    const db = await openRingtoneDB();
    return new Promise((resolve) => {
      const tx = db.transaction(STORE_NAME, 'readonly');
      const store = tx.objectStore(STORE_NAME);
      const req = store.get('custom_ringtone');
      req.onsuccess = () => resolve(req.result || null);
      req.onerror = () => resolve(null);
    });
  } catch {
    return null;
  }
}

async function saveStoredCustomRingtone(blob: Blob, name: string): Promise<void> {
  const db = await openRingtoneDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readwrite');
    const store = tx.objectStore(STORE_NAME);
    const req = store.put({ blob, name }, 'custom_ringtone');
    req.onsuccess = () => resolve();
    req.onerror = () => reject(req.error);
  });
}

async function deleteStoredCustomRingtone(): Promise<void> {
  try {
    const db = await openRingtoneDB();
    return new Promise((resolve) => {
      const tx = db.transaction(STORE_NAME, 'readwrite');
      const store = tx.objectStore(STORE_NAME);
      const req = store.delete('custom_ringtone');
      req.onsuccess = () => resolve();
      req.onerror = () => resolve();
    });
  } catch {}
}

class RingtoneService {
  private audioCtx: AudioContext | null = null;
  private isPlaying = false;
  private isPreviewing = false;
  private currentCallId: string | null = null;
  private ringCycleTimer: ReturnType<typeof setTimeout> | null = null;
  private activeOscillators: OscillatorNode[] = [];
  private activeGainNodes: GainNode[] = [];
  private audioElement: HTMLAudioElement | null = null;
  private previewElement: HTMLAudioElement | null = null;
  private customBlobUrl: string | null = null;
  private customRingtoneName: string | null = null;
  private userGestureAttached = false;
  private autoplayBlocked = false;

  constructor() {
    this.initAudioElement();
    this.loadCustomRingtone();
    if (typeof window !== 'undefined') {
      window.addEventListener('pagehide', () => this.stop());
      window.addEventListener('beforeunload', () => this.stop());
    }
  }

  private async loadCustomRingtone() {
    const stored = await getStoredCustomRingtone();
    if (stored && stored.blob) {
      if (this.customBlobUrl) {
        URL.revokeObjectURL(this.customBlobUrl);
      }
      this.customBlobUrl = URL.createObjectURL(stored.blob);
      this.customRingtoneName = stored.name;
      if (this.audioElement) {
        this.audioElement.src = this.customBlobUrl;
        this.audioElement.load();
      }
    }
  }

  getCustomRingtoneInfo(): { hasCustom: boolean; name: string | null } {
    return {
      hasCustom: !!this.customBlobUrl,
      name: this.customRingtoneName
    };
  }

  async saveCustomRingtone(file: File): Promise<{ success: boolean; name: string }> {
    // 1. Size limit: 8MB
    const MAX_SIZE = 8 * 1024 * 1024;
    if (file.size > MAX_SIZE) {
      throw new Error('Ringtone file size exceeds 8MB limit.');
    }

    // 2. Playability validation
    const testAudio = new Audio();
    const canPlay = testAudio.canPlayType(file.type);
    const ext = file.name.split('.').pop()?.toLowerCase();
    const isMp4 = ext === 'mp4' || file.type.includes('mp4');

    if (canPlay === '' && !isMp4 && ext !== 'mp3' && ext !== 'wav' && ext !== 'ogg' && ext !== 'm4a') {
      throw new Error(`Audio format '${file.type || ext}' cannot be decoded by your browser.`);
    }

    // Validate that browser can actually decode it
    const testUrl = URL.createObjectURL(file);
    try {
      await new Promise<void>((resolve, reject) => {
        const timeout = setTimeout(() => {
          cleanup();
          reject(new Error('Audio validation timed out.'));
        }, 5000);

        const onLoaded = () => {
          cleanup();
          resolve();
        };

        const onError = () => {
          cleanup();
          reject(new Error('Browser could not decode this audio file.'));
        };

        const cleanup = () => {
          clearTimeout(timeout);
          testAudio.removeEventListener('canplay', onLoaded);
          testAudio.removeEventListener('error', onError);
        };

        testAudio.addEventListener('canplay', onLoaded);
        testAudio.addEventListener('error', onError);
        testAudio.src = testUrl;
        testAudio.load();
      });
    } finally {
      URL.revokeObjectURL(testUrl);
    }

    // 3. Persist to IndexedDB
    await saveStoredCustomRingtone(file, file.name);

    if (this.customBlobUrl) {
      URL.revokeObjectURL(this.customBlobUrl);
    }
    this.customBlobUrl = URL.createObjectURL(file);
    this.customRingtoneName = file.name;

    if (this.audioElement) {
      this.audioElement.src = this.customBlobUrl;
      this.audioElement.load();
    }

    return { success: true, name: file.name };
  }

  async resetToDefault(): Promise<void> {
    this.stop();
    await deleteStoredCustomRingtone();
    if (this.customBlobUrl) {
      URL.revokeObjectURL(this.customBlobUrl);
      this.customBlobUrl = null;
    }
    this.customRingtoneName = null;
    if (this.audioElement) {
      this.audioElement.src = '/audio/wibby-ringtone.mp3';
      this.audioElement.load();
    }
  }

  startPreview(onEnded?: () => void) {
    this.stop();
    this.isPreviewing = true;
    if (!this.previewElement) {
      this.previewElement = new Audio();
    }
    this.previewElement.src = this.customBlobUrl || '/audio/wibby-ringtone.mp3';
    this.previewElement.currentTime = 0;
    this.previewElement.volume = 0.70;
    this.previewElement.onended = () => {
      this.isPreviewing = false;
      onEnded?.();
    };
    this.previewElement.play().catch(() => {
      this.isPreviewing = false;
      onEnded?.();
    });
  }

  stopPreview() {
    if (this.previewElement) {
      try {
        this.previewElement.pause();
        this.previewElement.currentTime = 0;
      } catch {}
    }
    this.isPreviewing = false;
  }

  getIsPreviewing(): boolean {
    return this.isPreviewing;
  }

  private initAudioElement() {
    if (typeof window === 'undefined') return;
    try {
      const audio = new Audio('/audio/wibby-ringtone.mp3');
      audio.preload = 'auto';
      audio.loop = true;
      audio.volume = 0.70;

      audio.addEventListener('error', () => {
        if (!this.customBlobUrl && audio.src.endsWith('.mp3')) {
          audio.src = '/audio/wibby-ringtone.wav';
          audio.load();
        }
      });
      this.audioElement = audio;
    } catch {
      // Audio element creation failure handled gracefully by Web Audio fallback
    }
  }

  private getAudioContext(): AudioContext | null {
    if (typeof window === 'undefined') return null;
    if (!this.audioCtx || this.audioCtx.state === 'closed') {
      const AudioCtxClass = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
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
        // Attempt unlock on HTML5 audio element
        if (this.audioElement) {
          this.audioElement.play().then(() => {
            this.autoplayBlocked = false;
          }).catch((err) => {
            if (err?.name === 'AbortError') return;
            // If still blocked, attempt Web Audio context resume
            const ctx = this.getAudioContext();
            if (ctx && ctx.state === 'suspended') {
              ctx.resume().then(() => {
                this.autoplayBlocked = false;
                this.playModernSynthesisBurst();
              }).catch(() => {});
            }
          });
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
   * High-fidelity Web Audio fallback synthesizing Wibby's signature modern chime motif.
   * Key: E Major 9 / C# minor 9.
   * Warm ambient pads + crystalline bell chimes.
   */
  private playModernSynthesisBurst() {
    if (!this.isPlaying) return;

    const ctx = this.getAudioContext();
    if (!ctx) return;

    if (ctx.state === 'suspended') {
      ctx.resume().catch(() => {
        this.autoplayBlocked = true;
        this.attachGestureUnlock();
      });
      if (ctx.state === 'suspended') return;
    }

    const now = ctx.currentTime;
    const CYCLE_DURATION_MS = 3200;

    const voices: SynthesizedVoice[] = [
      // Pulse 1: The Calling Wave (Emaj9)
      // Warm Sub/Pad Bed (E3 + B3 + F#4)
      { start: 0.04, duration: 1.35, freq: 164.81, gain: 0.12, decayRate: 1.8 },
      { start: 0.04, duration: 1.35, freq: 246.94, gain: 0.09, decayRate: 2.0 },
      { start: 0.04, duration: 1.35, freq: 369.99, gain: 0.07, decayRate: 2.2 },

      // Melodic Chimes (B4 -> E5 -> G#5 -> F#5)
      { start: 0.06, duration: 0.40, freq: 493.88, gain: 0.32, decayRate: 4.8 },
      { start: 0.24, duration: 0.40, freq: 659.25, gain: 0.35, decayRate: 4.5 },
      { start: 0.44, duration: 0.48, freq: 830.61, gain: 0.38, decayRate: 4.2 },
      { start: 0.68, duration: 0.85, freq: 739.99, gain: 0.42, decayRate: 3.2 },

      // Pulse 2: The Warm Answer (C#m9 resolution)
      // Warm Sub/Pad Bed (C#3 + G#3 + D#4)
      { start: 1.22, duration: 1.45, freq: 138.59, gain: 0.11, decayRate: 1.6 },
      { start: 1.22, duration: 1.45, freq: 207.65, gain: 0.08, decayRate: 1.8 },
      { start: 1.22, duration: 1.45, freq: 311.13, gain: 0.06, decayRate: 2.0 },

      // Melodic Chimes (D#5 -> B4 -> G#4 -> E4)
      { start: 1.24, duration: 0.38, freq: 622.25, gain: 0.34, decayRate: 4.6 },
      { start: 1.44, duration: 0.38, freq: 493.88, gain: 0.30, decayRate: 4.8 },
      { start: 1.66, duration: 0.45, freq: 415.30, gain: 0.28, decayRate: 4.2 },
      { start: 1.92, duration: 0.95, freq: 329.63, gain: 0.36, decayRate: 2.8 },
    ];

    voices.forEach(voice => {
      const start = now + voice.start;
      const end = start + voice.duration;

      // Primary oscillator (sine)
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(voice.freq, start);

      // Raised cosine attack (12ms) to prevent clicks
      gain.gain.setValueAtTime(0, start);
      gain.gain.linearRampToValueAtTime(voice.gain, start + 0.012);
      gain.gain.exponentialRampToValueAtTime(0.001, end - 0.02);
      gain.gain.linearRampToValueAtTime(0, end);

      osc.connect(gain);
      gain.connect(ctx.destination);

      osc.start(start);
      osc.stop(end + 0.02);

      this.activeOscillators.push(osc);
      this.activeGainNodes.push(gain);

      // Sparkle overtone (4.2x frequency, soft metallic chime)
      if (voice.freq >= 300) {
        const osc2 = ctx.createOscillator();
        const gain2 = ctx.createGain();
        osc2.type = 'sine';
        osc2.frequency.setValueAtTime(voice.freq * 4.2, start);
        gain2.gain.setValueAtTime(0, start);
        gain2.gain.linearRampToValueAtTime(voice.gain * 0.18, start + 0.008);
        gain2.gain.exponentialRampToValueAtTime(0.0005, start + Math.min(voice.duration * 0.45, 0.25));
        gain2.gain.linearRampToValueAtTime(0, start + Math.min(voice.duration * 0.45, 0.25) + 0.01);
        osc2.connect(gain2);
        gain2.connect(ctx.destination);
        osc2.start(start);
        osc2.stop(start + Math.min(voice.duration * 0.45, 0.25) + 0.02);
        this.activeOscillators.push(osc2);
        this.activeGainNodes.push(gain2);
      }
    });

    // Schedule next cycle if still ringing and using fallback
    this.ringCycleTimer = setTimeout(() => {
      if (this.isPlaying) {
        this.cleanupWebAudioNodes();
        this.playModernSynthesisBurst();
      }
    }, CYCLE_DURATION_MS);
  }

  private cleanupWebAudioNodes() {
    this.activeOscillators.forEach(osc => {
      try {
        osc.stop();
        osc.disconnect();
      } catch {}
    });
    this.activeGainNodes.forEach(g => {
      try {
        g.disconnect();
      } catch {}
    });
    this.activeOscillators = [];
    this.activeGainNodes = [];
  }

  /**
   * Start the incoming call ringtone.
   * Uses single-instance audio playback with Web Audio synthesis fallback.
   */
  start(callId: string = 'call_incoming') {
    // Prevent re-triggering if already actively playing for the same call
    if (this.isPlaying && this.currentCallId === callId) return;

    this.stop();
    this.currentCallId = callId;
    this.isPlaying = true;
    this.autoplayBlocked = false;

    // Primary: play high-quality audio element asset
    if (this.audioElement) {
      this.audioElement.currentTime = 0;
      const playPromise = this.audioElement.play();
      if (playPromise !== undefined) {
        playPromise.catch((err: any) => {
          if (err.name === 'AbortError') {
            // Intentionally aborted by pause() on fast stop/accept/reject
            return;
          }
          if (err.name === 'NotAllowedError') {
            console.warn('[RINGTONE] Autoplay policy blocked audio playback; awaiting user interaction.');
            this.autoplayBlocked = true;
            this.attachGestureUnlock();
          } else {
            console.warn('[RINGTONE] Audio element playback failed, falling back to Web Audio synthesis:', err.message);
            this.playModernSynthesisBurst();
          }
        });
      }
    } else {
      this.playModernSynthesisBurst();
    }
  }

  /**
   * Immediately and cleanly stop all ringtone audio.
   */
  stop(callId?: string) {
    if (!this.isPlaying && this.activeOscillators.length === 0 && !this.audioElement) return;

    this.isPlaying = false;
    this.currentCallId = null;
    this.autoplayBlocked = false;
    this.stopPreview();

    if (this.ringCycleTimer) {
      clearTimeout(this.ringCycleTimer);
      this.ringCycleTimer = null;
    }

    // Stop audio element cleanly
    if (this.audioElement) {
      try {
        this.audioElement.pause();
        this.audioElement.currentTime = 0;
      } catch {}
    }

    // Stop and disconnect Web Audio nodes
    this.cleanupWebAudioNodes();

    console.log(`[RINGTONE] Ringtone stopped cleanly for callId=${callId || 'all'}`);
  }

  /**
   * Complete destruction of resources on app / context unmount.
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
