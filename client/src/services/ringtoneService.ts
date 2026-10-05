/**
 * Dedicated Modern Incoming Call Ringtone Service for Wibby.
 * 
 * Account-Wide Architecture:
 * - Server/database (MongoDB Atlas) is the authoritative source of truth for ringtone preferences.
 * - IndexedDB serves as a high-performance local audio cache across page reloads.
 * - Supports presets ('Wibby Classic', 'Wibby Neon', 'Wibby Gentle', 'Wibby Chime') and 'Custom Upload'.
 * - Custom uploads are safely streamed from /api/users/ringtone-audio and cached locally.
 * - Controlled single-instance lifecycle: zero overlapping audio instances, zero leaks.
 * - Clean Web Audio synthesis for custom presets and fallback on autoplay blockage.
 */

export interface RingtonePreset {
  id: string;
  name: string;
  description: string;
  icon: string;
}

export const WIBBY_RINGTONE_PRESETS: RingtonePreset[] = [
  { id: 'default', name: 'Wibby Classic', description: 'Original harmonic acoustic incoming call chime', icon: '🔔' },
  { id: 'wibby-neon', name: 'Wibby Neon', description: 'Upbeat electric synth chime motif', icon: '⚡' },
  { id: 'wibby-gentle', name: 'Wibby Gentle', description: 'Warm ambient rhodes melody', icon: '🌿' },
  { id: 'wibby-chime', name: 'Wibby Chime', description: 'Crystalline celeste bell motif', icon: '✨' },
  { id: 'custom', name: 'Custom Upload', description: 'Your personal uploaded audio file', icon: '🎵' }
];

export interface RingtoneStateInfo {
  activeId: string;
  activeName: string;
  hasCustom: boolean;
  name: string | null;
  customName: string | null;
  isAccountSynced: boolean;
}

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

async function getStoredCustomRingtone(userId: string): Promise<{ blob: Blob; name: string } | null> {
  try {
    const db = await openRingtoneDB();
    return new Promise((resolve) => {
      const tx = db.transaction(STORE_NAME, 'readonly');
      const store = tx.objectStore(STORE_NAME);
      const req = store.get(`custom_ringtone_${userId}`);
      req.onsuccess = () => resolve(req.result || null);
      req.onerror = () => resolve(null);
    });
  } catch {
    return null;
  }
}

async function saveStoredCustomRingtone(blob: Blob, name: string, userId: string): Promise<void> {
  const db = await openRingtoneDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readwrite');
    const store = tx.objectStore(STORE_NAME);
    const req = store.put({ blob, name }, `custom_ringtone_${userId}`);
    req.onsuccess = () => resolve();
    req.onerror = () => reject(req.error);
  });
}

async function deleteStoredCustomRingtone(userId: string): Promise<void> {
  try {
    const db = await openRingtoneDB();
    return new Promise((resolve) => {
      const tx = db.transaction(STORE_NAME, 'readwrite');
      const store = tx.objectStore(STORE_NAME);
      const req = store.delete(`custom_ringtone_${userId}`);
      req.onsuccess = () => resolve();
      req.onerror = () => resolve();
    });
  } catch {}
}

type RingtoneStateListener = (info: RingtoneStateInfo) => void;

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

  private currentUserId: string | null = null;
  private authToken: string | null = null;
  private currentPresetId: string = 'default';
  private currentPresetName: string = 'Wibby Classic';
  private isAccountSynced = false;
  private stateListeners: RingtoneStateListener[] = [];

  constructor() {
    this.initAudioElement();
    if (typeof window !== 'undefined') {
      window.addEventListener('pagehide', () => this.stop());
      window.addEventListener('beforeunload', () => this.stop());
    }
  }

  onStateChange(listener: RingtoneStateListener): () => void {
    this.stateListeners.push(listener);
    return () => {
      this.stateListeners = this.stateListeners.filter(l => l !== listener);
    };
  }

  private notifyStateListeners() {
    const info = this.getCustomRingtoneInfo();
    this.stateListeners.forEach(l => {
      try { l(info); } catch {}
    });
  }

  async setUserId(userId: string) {
    if (this.currentUserId !== userId) {
      this.currentUserId = userId;
      await this.loadLocalCustomRingtone();
    }
  }

  /**
   * Authoritative account sync on login/app mount.
   * Fetches preference from backend MongoDB, downloads custom ringtone if needed, and caches locally.
   */
  async syncWithAccount(token: string, userId: string) {
    this.currentUserId = userId;
    this.authToken = token;

    try {
      const res = await fetch('/api/users/preferences', {
        headers: { Authorization: `Bearer ${token}` }
      });
      if (res.ok) {
        const data = await res.json();
        const r = data?.preferences?.ringtone;
        if (r && r.id) {
          this.currentPresetId = r.id;
          this.currentPresetName = r.name || 'Wibby Classic';

          if (r.id === 'custom') {
            const cached = await getStoredCustomRingtone(userId);
            if (cached && cached.blob) {
              if (this.customBlobUrl) URL.revokeObjectURL(this.customBlobUrl);
              this.customBlobUrl = URL.createObjectURL(cached.blob);
              this.customRingtoneName = cached.name || r.name || 'Custom Ringtone';
            } else {
              // Download from server GridFS
              try {
                const audioRes = await fetch('/api/users/ringtone-audio', {
                  headers: { Authorization: `Bearer ${token}` }
                });
                if (audioRes.ok) {
                  const blob = await audioRes.blob();
                  await saveStoredCustomRingtone(blob, r.name || 'Custom Ringtone', userId);
                  if (this.customBlobUrl) URL.revokeObjectURL(this.customBlobUrl);
                  this.customBlobUrl = URL.createObjectURL(blob);
                  this.customRingtoneName = r.name || 'Custom Ringtone';
                }
              } catch (downloadErr) {
                console.warn('[RINGTONE] Could not download remote custom ringtone:', downloadErr);
              }
            }
          }
        }
      }
      this.isAccountSynced = true;
    } catch (err) {
      console.warn('[RINGTONE] Account sync error, using local fallback:', err);
    }

    this.updateActiveAudioSource();
    this.notifyStateListeners();
  }

  private async loadLocalCustomRingtone() {
    if (!this.currentUserId) return;
    const stored = await getStoredCustomRingtone(this.currentUserId);
    if (stored && stored.blob) {
      if (this.customBlobUrl) {
        URL.revokeObjectURL(this.customBlobUrl);
      }
      this.customBlobUrl = URL.createObjectURL(stored.blob);
      this.customRingtoneName = stored.name;
      this.updateActiveAudioSource();
      this.notifyStateListeners();
    }
  }

  private updateActiveAudioSource() {
    if (!this.audioElement) return;
    if (this.currentPresetId === 'custom' && this.customBlobUrl) {
      this.audioElement.src = this.customBlobUrl;
    } else {
      this.audioElement.src = '/audio/wibby-ringtone.mp3';
    }
    this.audioElement.load();
  }

  getCustomRingtoneInfo(): RingtoneStateInfo {
    return {
      activeId: this.currentPresetId,
      activeName: this.currentPresetName,
      hasCustom: !!this.customBlobUrl,
      name: this.currentPresetId === 'custom' ? this.customRingtoneName : this.currentPresetName,
      customName: this.customRingtoneName,
      isAccountSynced: this.isAccountSynced
    };
  }

  async selectPreset(presetId: string, presetName?: string, token?: string): Promise<void> {
    const found = WIBBY_RINGTONE_PRESETS.find(p => p.id === presetId);
    this.currentPresetId = presetId;
    this.currentPresetName = presetName || found?.name || 'Wibby Classic';

    this.updateActiveAudioSource();
    this.notifyStateListeners();

    const effectiveToken = token || this.authToken;
    if (effectiveToken) {
      try {
        await fetch('/api/users/preferences', {
          method: 'PATCH',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${effectiveToken}`
          },
          body: JSON.stringify({
            ringtone: {
              id: this.currentPresetId,
              name: this.currentPresetName,
              version: Date.now()
            }
          })
        });
        this.isAccountSynced = true;
      } catch (err) {
        console.warn('[RINGTONE] Failed to persist ringtone preset to account:', err);
      }
    }
  }

  async saveCustomRingtone(file: File, token?: string): Promise<{ success: boolean; name: string }> {
    if (!this.currentUserId) throw new Error('User not identified');

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

    // 3. Persist to server (MongoDB Atlas GridFS) if authenticated
    const effectiveToken = token || this.authToken;
    if (effectiveToken) {
      try {
        const formData = new FormData();
        formData.append('file', file);
        const uploadRes = await fetch('/api/users/ringtone', {
          method: 'POST',
          headers: { Authorization: `Bearer ${effectiveToken}` },
          body: formData
        });
        if (!uploadRes.ok) {
          const errData = await uploadRes.json().catch(() => ({}));
          console.warn('[RINGTONE] Server upload warning:', errData.error);
        }
      } catch (uploadErr) {
        console.warn('[RINGTONE] Server upload failed, persisting locally:', uploadErr);
      }
    }

    // 4. Cache in IndexedDB
    await saveStoredCustomRingtone(file, file.name, this.currentUserId);

    if (this.customBlobUrl) {
      URL.revokeObjectURL(this.customBlobUrl);
    }
    this.customBlobUrl = URL.createObjectURL(file);
    this.customRingtoneName = file.name;
    this.currentPresetId = 'custom';
    this.currentPresetName = file.name;

    this.updateActiveAudioSource();
    this.notifyStateListeners();
    return { success: true, name: file.name };
  }

  async resetToDefault(token?: string): Promise<void> {
    if (this.currentUserId) {
      await deleteStoredCustomRingtone(this.currentUserId);
    }
    if (this.customBlobUrl) {
      URL.revokeObjectURL(this.customBlobUrl);
      this.customBlobUrl = null;
    }
    this.customRingtoneName = null;
    await this.selectPreset('default', 'Wibby Classic', token);
  }

  startPreview(presetId?: string, onEnded?: () => void) {
    this.stop();
    this.isPreviewing = true;
    const targetPreset = presetId || this.currentPresetId;

    if (targetPreset === 'wibby-neon' || targetPreset === 'wibby-gentle' || targetPreset === 'wibby-chime') {
      this.playModernSynthesisBurst(targetPreset);
      // Auto-end preview after 4 seconds
      setTimeout(() => {
        if (this.isPreviewing) {
          this.stopPreview();
          onEnded?.();
        }
      }, 4000);
      return;
    }

    if (!this.previewElement) {
      this.previewElement = new Audio();
    }

    if (targetPreset === 'custom' && this.customBlobUrl) {
      this.previewElement.src = this.customBlobUrl;
    } else {
      this.previewElement.src = '/audio/wibby-ringtone.mp3';
    }

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
    this.cleanupWebAudioNodes();
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
        if (this.audioElement) {
          this.audioElement.play().then(() => {
            this.autoplayBlocked = false;
          }).catch((err) => {
            if (err?.name === 'AbortError') return;
            const ctx = this.getAudioContext();
            if (ctx && ctx.state === 'suspended') {
              ctx.resume().then(() => {
                this.autoplayBlocked = false;
                this.playModernSynthesisBurst(this.currentPresetId);
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
   * Synthesize presets and fallback audio using Web Audio API.
   */
  private playModernSynthesisBurst(preset: string = 'default') {
    if (!this.isPlaying && !this.isPreviewing) return;

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
    let CYCLE_DURATION_MS = 3200;
    let voices: SynthesizedVoice[] = [];

    if (preset === 'wibby-neon') {
      CYCLE_DURATION_MS = 2800;
      voices = [
        // Upbeat electronic chime motif (A4 -> C#5 -> E5 -> A5 -> B5)
        { start: 0.04, duration: 1.2, freq: 110, gain: 0.14, decayRate: 2.0 },
        { start: 0.05, duration: 0.35, freq: 440, gain: 0.32, decayRate: 4.8 },
        { start: 0.20, duration: 0.35, freq: 554.37, gain: 0.34, decayRate: 4.8 },
        { start: 0.38, duration: 0.40, freq: 659.25, gain: 0.36, decayRate: 4.5 },
        { start: 0.58, duration: 0.55, freq: 880, gain: 0.40, decayRate: 3.8 },
        { start: 0.90, duration: 0.35, freq: 554.37, gain: 0.32, decayRate: 4.8 },
        { start: 1.08, duration: 0.35, freq: 659.25, gain: 0.34, decayRate: 4.8 },
        { start: 1.25, duration: 0.75, freq: 987.77, gain: 0.42, decayRate: 3.2 }
      ];
    } else if (preset === 'wibby-gentle') {
      CYCLE_DURATION_MS = 3400;
      voices = [
        // Warm ambient rhodes chords (Emaj9 / Bmin)
        { start: 0.04, duration: 1.8, freq: 164.81, gain: 0.12, decayRate: 1.5 },
        { start: 0.04, duration: 1.8, freq: 246.94, gain: 0.09, decayRate: 1.6 },
        { start: 0.10, duration: 0.60, freq: 329.63, gain: 0.26, decayRate: 2.8 },
        { start: 0.42, duration: 0.60, freq: 493.88, gain: 0.28, decayRate: 2.8 },
        { start: 0.85, duration: 0.90, freq: 659.25, gain: 0.32, decayRate: 2.5 }
      ];
    } else if (preset === 'wibby-chime') {
      CYCLE_DURATION_MS = 3000;
      voices = [
        // Crystalline bell celeste motif (F#5, A#5, C#6, F#6)
        { start: 0.05, duration: 0.50, freq: 739.99, gain: 0.32, decayRate: 4.2 },
        { start: 0.25, duration: 0.50, freq: 932.33, gain: 0.34, decayRate: 4.2 },
        { start: 0.48, duration: 0.65, freq: 1108.73, gain: 0.36, decayRate: 3.8 },
        { start: 0.85, duration: 1.10, freq: 1479.98, gain: 0.38, decayRate: 2.8 }
      ];
    } else {
      // Default signature Wibby motif (E Major 9 / C# minor 9)
      CYCLE_DURATION_MS = 3200;
      voices = [
        { start: 0.04, duration: 1.35, freq: 164.81, gain: 0.12, decayRate: 1.8 },
        { start: 0.04, duration: 1.35, freq: 246.94, gain: 0.09, decayRate: 2.0 },
        { start: 0.04, duration: 1.35, freq: 369.99, gain: 0.07, decayRate: 2.2 },
        { start: 0.06, duration: 0.40, freq: 493.88, gain: 0.32, decayRate: 4.8 },
        { start: 0.24, duration: 0.40, freq: 659.25, gain: 0.35, decayRate: 4.5 },
        { start: 0.44, duration: 0.48, freq: 830.61, gain: 0.38, decayRate: 4.2 },
        { start: 0.68, duration: 0.85, freq: 739.99, gain: 0.42, decayRate: 3.2 },
        { start: 1.22, duration: 1.45, freq: 138.59, gain: 0.11, decayRate: 1.6 },
        { start: 1.22, duration: 1.45, freq: 207.65, gain: 0.08, decayRate: 1.8 },
        { start: 1.22, duration: 1.45, freq: 311.13, gain: 0.06, decayRate: 2.0 },
        { start: 1.24, duration: 0.38, freq: 622.25, gain: 0.34, decayRate: 4.6 },
        { start: 1.44, duration: 0.38, freq: 493.88, gain: 0.30, decayRate: 4.8 },
        { start: 1.66, duration: 0.45, freq: 415.30, gain: 0.28, decayRate: 4.2 },
        { start: 1.92, duration: 0.95, freq: 329.63, gain: 0.36, decayRate: 2.8 }
      ];
    }

    voices.forEach(voice => {
      const start = now + voice.start;
      const end = start + voice.duration;

      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(voice.freq, start);

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

      // Sparkle chime overtone
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

    if (this.isPlaying) {
      this.ringCycleTimer = setTimeout(() => {
        if (this.isPlaying) {
          this.cleanupWebAudioNodes();
          this.playModernSynthesisBurst(preset);
        }
      }, CYCLE_DURATION_MS);
    }
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

  start(callId: string = 'call_incoming') {
    if (this.isPlaying && this.currentCallId === callId) return;

    this.stop();
    this.currentCallId = callId;
    this.isPlaying = true;
    this.autoplayBlocked = false;

    // If preset is synthesizer-based
    if (this.currentPresetId === 'wibby-neon' || this.currentPresetId === 'wibby-gentle' || this.currentPresetId === 'wibby-chime') {
      this.playModernSynthesisBurst(this.currentPresetId);
      return;
    }

    // Primary: play high-quality audio element asset (custom or default)
    if (this.audioElement) {
      this.audioElement.currentTime = 0;
      const playPromise = this.audioElement.play();
      if (playPromise !== undefined) {
        playPromise.catch((err: any) => {
          if (err.name === 'AbortError') return;
          if (err.name === 'NotAllowedError') {
            console.warn('[RINGTONE] Autoplay policy blocked audio playback; awaiting user interaction.');
            this.autoplayBlocked = true;
            this.attachGestureUnlock();
          } else {
            console.warn('[RINGTONE] Audio playback failed, falling back to Web Audio synthesis:', err.message);
            this.playModernSynthesisBurst('default');
          }
        });
      }
    } else {
      this.playModernSynthesisBurst('default');
    }
  }

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

    if (this.audioElement) {
      try {
        this.audioElement.pause();
        this.audioElement.currentTime = 0;
      } catch {}
    }

    this.cleanupWebAudioNodes();
    console.log(`[RINGTONE] Ringtone stopped cleanly for callId=${callId || 'all'}`);
  }

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
