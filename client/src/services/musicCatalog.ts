// Legal Royalty-Free Music Catalog and Audio Service for Wibby Music Notes

export interface MusicTrack {
  id: string;
  title: string;
  artist: string;
  genre: string;
  duration: number; // in seconds (e.g. 60s preview)
  artworkGradient: string;
  coverEmoji: string;
  bpm: number;
  key: string;
  chords: number[][];
  melody: number[];
}

export interface SelectedMusicClip {
  track: MusicTrack;
  clipStart: number; // in seconds
  clipDuration: number; // in seconds (default 15 or 30s)
}

export interface MusicPlayerState {
  currentTrack: MusicTrack | null;
  isPlaying: boolean;
  currentTime: number;
  duration: number;
  clipStart: number;
  clipDuration: number;
  progress: number; // 0 to 1
}

type PlayerStateListener = (state: MusicPlayerState) => void;

// Curated 100% legal, royalty-free catalog
export const LEGAL_MUSIC_CATALOG: MusicTrack[] = [
  {
    id: 'track-1',
    title: 'Midnight Glow',
    artist: 'The Nocturnes',
    genre: 'Lo-Fi / R&B',
    duration: 60,
    artworkGradient: 'linear-gradient(135deg, #833AB4 0%, #FD1D1D 50%, #FCB045 100%)',
    coverEmoji: '🌙',
    bpm: 88,
    key: 'F Minor',
    chords: [
      [174.61, 220.00, 261.63],
      [155.56, 196.00, 233.08],
      [130.81, 164.81, 196.00],
      [146.83, 174.61, 220.00]
    ],
    melody: [349.23, 392.00, 440.00, 523.25, 440.00, 392.00, 349.23, 329.63]
  },
  {
    id: 'track-2',
    title: 'Sunset Boulevard',
    artist: 'Coastal Dreams',
    genre: 'Synthwave / Chill',
    duration: 60,
    artworkGradient: 'linear-gradient(135deg, #F43F5E 0%, #FB7185 50%, #FDA4AF 100%)',
    coverEmoji: '🌇',
    bpm: 110,
    key: 'G Major',
    chords: [
      [196.00, 246.94, 293.66],
      [164.81, 196.00, 246.94],
      [130.81, 164.81, 196.00],
      [146.83, 185.00, 220.00]
    ],
    melody: [293.66, 329.63, 392.00, 440.00, 493.88, 392.00, 329.63, 293.66]
  },
  {
    id: 'track-3',
    title: 'Neon Horizon',
    artist: 'Cyberpulse',
    genre: 'Retrowave / Electronic',
    duration: 60,
    artworkGradient: 'linear-gradient(135deg, #00F0FF 0%, #7000FF 50%, #FF007A 100%)',
    coverEmoji: '⚡',
    bpm: 128,
    key: 'C Minor',
    chords: [
      [130.81, 155.56, 196.00],
      [146.83, 174.61, 220.00],
      [174.61, 207.65, 261.63],
      [196.00, 233.08, 293.66]
    ],
    melody: [261.63, 311.13, 392.00, 466.16, 523.25, 392.00, 311.13, 261.63]
  },
  {
    id: 'track-4',
    title: 'Golden Hour Reverie',
    artist: 'Luna Sol',
    genre: 'Acoustic / Indie Pop',
    duration: 60,
    artworkGradient: 'linear-gradient(135deg, #F59E0B 0%, #EF4444 50%, #EC4899 100%)',
    coverEmoji: '✨',
    bpm: 96,
    key: 'E Major',
    chords: [
      [164.81, 207.65, 246.94],
      [220.00, 277.18, 329.63],
      [185.00, 220.00, 277.18],
      [246.94, 311.13, 369.99]
    ],
    melody: [329.63, 415.30, 493.88, 659.25, 493.88, 415.30, 369.99, 329.63]
  },
  {
    id: 'track-5',
    title: 'Coffee & Rainy Days',
    artist: 'Lofi Lounge',
    genre: 'Chillhop / Beats',
    duration: 60,
    artworkGradient: 'linear-gradient(135deg, #06B6D4 0%, #3B82F6 50%, #1D4ED8 100%)',
    coverEmoji: '☕',
    bpm: 82,
    key: 'D Major',
    chords: [
      [146.83, 185.00, 220.00],
      [196.00, 246.94, 293.66],
      [220.00, 277.18, 329.63],
      [185.00, 220.00, 277.18]
    ],
    melody: [293.66, 369.99, 440.00, 587.33, 440.00, 369.99, 293.66, 220.00]
  },
  {
    id: 'track-6',
    title: 'Electric Heartbeat',
    artist: 'Solar Echo',
    genre: 'Disco / Dance Pop',
    duration: 60,
    artworkGradient: 'linear-gradient(135deg, #10B981 0%, #059669 50%, #047857 100%)',
    coverEmoji: '💖',
    bpm: 122,
    key: 'C Major',
    chords: [
      [130.81, 164.81, 196.00],
      [146.83, 174.61, 220.00],
      [164.81, 196.00, 246.94],
      [174.61, 220.00, 261.63]
    ],
    melody: [261.63, 329.63, 392.00, 440.00, 523.25, 440.00, 392.00, 329.63]
  },
  {
    id: 'track-7',
    title: 'Starlight Serenade',
    artist: 'Velvet Whisper',
    genre: 'R&B / Soul',
    duration: 60,
    artworkGradient: 'linear-gradient(135deg, #6366F1 0%, #8B5CF6 50%, #4C1D95 100%)',
    coverEmoji: '🌟',
    bpm: 90,
    key: 'A Minor',
    chords: [
      [220.00, 261.63, 329.63],
      [174.61, 220.00, 261.63],
      [130.81, 164.81, 196.00],
      [196.00, 246.94, 293.66]
    ],
    melody: [440.00, 523.25, 659.25, 523.25, 440.00, 392.00, 329.63, 261.63]
  },
  {
    id: 'track-8',
    title: 'Velvet Horizon',
    artist: 'Ocean Mist',
    genre: 'Ambient / Chill',
    duration: 60,
    artworkGradient: 'linear-gradient(135deg, #0EA5E9 0%, #0284C7 50%, #0369A1 100%)',
    coverEmoji: '🌊',
    bpm: 76,
    key: 'F# Minor',
    chords: [
      [185.00, 220.00, 277.18],
      [146.83, 185.00, 220.00],
      [164.81, 207.65, 246.94],
      [130.81, 164.81, 196.00]
    ],
    melody: [369.99, 440.00, 554.37, 440.00, 369.99, 329.63, 277.18, 246.94]
  },
  {
    id: 'track-9',
    title: 'Dreamcatcher',
    artist: 'Aurora Nova',
    genre: 'Dream Pop / Indie',
    duration: 60,
    artworkGradient: 'linear-gradient(135deg, #EC4899 0%, #DB2777 50%, #9D174D 100%)',
    coverEmoji: '🦋',
    bpm: 102,
    key: 'Bb Major',
    chords: [
      [233.08, 293.66, 349.23],
      [174.61, 220.00, 261.63],
      [196.00, 233.08, 293.66],
      [155.56, 196.00, 233.08]
    ],
    melody: [466.16, 587.33, 698.46, 587.33, 466.16, 392.00, 349.23, 293.66]
  },
  {
    id: 'track-10',
    title: 'City Lights',
    artist: 'Metro Drift',
    genre: 'Future Bass / Melodic',
    duration: 60,
    artworkGradient: 'linear-gradient(135deg, #8B5CF6 0%, #6366F1 50%, #3B82F6 100%)',
    coverEmoji: '🌃',
    bpm: 135,
    key: 'Eb Major',
    chords: [
      [155.56, 196.00, 233.08],
      [207.65, 261.63, 311.13],
      [130.81, 164.81, 196.00],
      [174.61, 220.00, 261.63]
    ],
    melody: [311.13, 392.00, 466.16, 622.25, 466.16, 392.00, 311.13, 233.08]
  }
];

/**
 * Pluggable Provider Interface
 * Allows integrating Spotify Web API, Jamendo, Free Music Archive, etc.,
 * without modifying any component rendering code.
 */
export interface IMusicProvider {
  search(query: string): Promise<MusicTrack[]>;
  getTrack(id: string): Promise<MusicTrack | null>;
}

export class BuiltinLegalCatalogProvider implements IMusicProvider {
  async search(query: string): Promise<MusicTrack[]> {
    const q = query.trim().toLowerCase();
    if (!q) return LEGAL_MUSIC_CATALOG;
    return LEGAL_MUSIC_CATALOG.filter(
      t =>
        t.title.toLowerCase().includes(q) ||
        t.artist.toLowerCase().includes(q) ||
        t.genre.toLowerCase().includes(q)
    );
  }

  async getTrack(id: string): Promise<MusicTrack | null> {
    const track = LEGAL_MUSIC_CATALOG.find(t => t.id === id);
    return track || null;
  }
}

/**
 * Music Note Player Engine
 * Handles high-fidelity harmonic preview synthesis, clip looping, seeking, and state sync.
 */
class MusicCatalogService {
  private provider: IMusicProvider = new BuiltinLegalCatalogProvider();
  private audioCtx: AudioContext | null = null;
  private currentTrack: MusicTrack | null = null;
  private isPlayingState: boolean = false;
  private clipStart: number = 0;
  private clipDuration: number = 30;
  private elapsedSeconds: number = 0;
  private stopPlaybackFn: (() => void) | null = null;
  private listeners: Set<PlayerStateListener> = new Set();

  constructor() {
    this.provider = new BuiltinLegalCatalogProvider();
  }

  public setProvider(provider: IMusicProvider) {
    this.provider = provider;
  }

  public async search(query: string): Promise<MusicTrack[]> {
    return this.provider.search(query);
  }

  public async getTrack(id: string): Promise<MusicTrack | null> {
    return this.provider.getTrack(id);
  }

  public subscribe(listener: PlayerStateListener): () => void {
    this.listeners.add(listener);
    listener(this.getState());
    return () => this.listeners.delete(listener);
  }

  public getState(): MusicPlayerState {
    const duration = this.currentTrack ? this.currentTrack.duration : 60;
    const progress = this.clipDuration > 0 ? Math.min(1, Math.max(0, this.elapsedSeconds / this.clipDuration)) : 0;
    return {
      currentTrack: this.currentTrack,
      isPlaying: this.isPlayingState,
      currentTime: this.clipStart + this.elapsedSeconds,
      duration,
      clipStart: this.clipStart,
      clipDuration: this.clipDuration,
      progress
    };
  }

  private notify() {
    const state = this.getState();
    for (const l of this.listeners) {
      try {
        l(state);
      } catch {}
    }
  }

  private initAudio() {
    if (!this.audioCtx) {
      const AudioCtxClass = window.AudioContext || (window as any).webkitAudioContext;
      if (AudioCtxClass) {
        this.audioCtx = new AudioCtxClass();
      }
    }
    if (this.audioCtx && this.audioCtx.state === 'suspended') {
      this.audioCtx.resume().catch(() => {});
    }
  }

  public playClip(track: MusicTrack, clipStart: number = 0, clipDuration: number = 30): void {
    this.initAudio();
    if (!this.audioCtx) return;

    // Toggle stop if already playing the exact clip
    if (
      this.isPlayingState &&
      this.currentTrack?.id === track.id &&
      Math.abs(this.clipStart - clipStart) < 1
    ) {
      this.stop();
      return;
    }

    this.stop();

    this.currentTrack = track;
    this.clipStart = clipStart;
    this.clipDuration = clipDuration;
    this.elapsedSeconds = 0;
    this.isPlayingState = true;

    const ctx = this.audioCtx;
    const masterGain = ctx.createGain();
    masterGain.gain.setValueAtTime(0.18, ctx.currentTime);
    masterGain.connect(ctx.destination);

    const beatInterval = 60 / track.bpm;
    let step = Math.floor((clipStart / beatInterval));
    let isStopped = false;

    // Progress counter (updates 10x per second for smooth progress bars)
    const tickInterval = window.setInterval(() => {
      if (isStopped) return;
      this.elapsedSeconds += 0.1;
      if (this.elapsedSeconds >= this.clipDuration) {
        // Loop the clip seamlessly
        this.elapsedSeconds = 0;
      }
      this.notify();
    }, 100);

    // Audio notes engine
    const noteInterval = window.setInterval(() => {
      if (isStopped || ctx.state === 'closed') return;

      const now = ctx.currentTime;
      const currentChordIndex = Math.floor(step / 4) % track.chords.length;
      const currentChord = track.chords[currentChordIndex];

      // Polyphonic chord pad voice
      currentChord.forEach((freq, idx) => {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();

        osc.type = idx === 0 ? 'triangle' : 'sine';
        osc.frequency.setValueAtTime(freq, now);

        gain.gain.setValueAtTime(0.04, now);
        gain.gain.exponentialRampToValueAtTime(0.001, now + beatInterval * 1.6);

        osc.connect(gain);
        gain.connect(masterGain);

        osc.start(now);
        osc.stop(now + beatInterval * 1.6);
      });

      // Lead melody voice
      const leadFreq = track.melody[step % track.melody.length];
      const leadOsc = ctx.createOscillator();
      const leadGain = ctx.createGain();

      leadOsc.type = 'sine';
      leadOsc.frequency.setValueAtTime(leadFreq, now);

      leadGain.gain.setValueAtTime(0.08, now);
      leadGain.gain.exponentialRampToValueAtTime(0.001, now + beatInterval * 0.95);

      leadOsc.connect(leadGain);
      leadGain.connect(masterGain);

      leadOsc.start(now);
      leadOsc.stop(now + beatInterval * 0.95);

      step++;
    }, beatInterval * 1000);

    this.stopPlaybackFn = () => {
      isStopped = true;
      clearInterval(tickInterval);
      clearInterval(noteInterval);
      try {
        masterGain.gain.linearRampToValueAtTime(0.001, ctx.currentTime + 0.2);
        setTimeout(() => masterGain.disconnect(), 250);
      } catch {}
    };

    this.notify();
  }

  public stop(): void {
    if (this.stopPlaybackFn) {
      try {
        this.stopPlaybackFn();
      } catch {}
      this.stopPlaybackFn = null;
    }
    this.currentTrack = null;
    this.isPlayingState = false;
    this.elapsedSeconds = 0;
    this.notify();
  }
}

export const musicCatalogService = new MusicCatalogService();
