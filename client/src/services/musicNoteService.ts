// Music Note Audio Service — Synthesizes and plays 30s song previews for Instagram Music Notes

type MusicListener = (currentSong: string | null, isPlaying: boolean) => void;

class MusicNoteService {
  private audioCtx: AudioContext | null = null;
  private currentSong: string | null = null;
  private isPlayingState: boolean = false;
  private stopPlaybackFn: (() => void) | null = null;
  private listeners: Set<MusicListener> = new Set();
  private autoStopTimeout: ReturnType<typeof setTimeout> | null = null;

  private initAudioContext() {
    if (!this.audioCtx) {
      const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext;
      if (AudioContextClass) {
        this.audioCtx = new AudioContextClass();
      }
    }
    if (this.audioCtx && this.audioCtx.state === 'suspended') {
      this.audioCtx.resume().catch(() => {});
    }
  }

  public subscribe(listener: MusicListener): () => void {
    this.listeners.add(listener);
    listener(this.currentSong, this.isPlayingState);
    return () => this.listeners.delete(listener);
  }

  private notify() {
    for (const l of this.listeners) {
      l(this.currentSong, this.isPlayingState);
    }
  }

  public isPlaying(songTitle?: string): boolean {
    if (!songTitle) return this.isPlayingState;
    return this.isPlayingState && this.currentSong === songTitle;
  }

  public getCurrentSong(): string | null {
    return this.currentSong;
  }

  public stop() {
    if (this.autoStopTimeout) {
      clearTimeout(this.autoStopTimeout);
      this.autoStopTimeout = null;
    }
    if (this.stopPlaybackFn) {
      try {
        this.stopPlaybackFn();
      } catch {}
      this.stopPlaybackFn = null;
    }
    this.currentSong = null;
    this.isPlayingState = false;
    this.notify();
  }

  public playSong(songTitle: string, onEnded?: () => void): boolean {
    this.initAudioContext();
    if (!this.audioCtx) return false;

    // If already playing this song, toggle stop
    if (this.isPlayingState && this.currentSong === songTitle) {
      this.stop();
      return false;
    }

    this.stop();

    const ctx = this.audioCtx;
    const cleanTitle = songTitle.toLowerCase();

    // Select harmonic profile based on song
    let bpm = 120;
    let chordProgression: number[][] = [];
    let leadNotes: number[] = [];

    if (cleanTitle.includes('blinding') || cleanTitle.includes('weeknd')) {
      // 80s Synthwave in F Minor (F, Ab, C, Eb)
      bpm = 171;
      chordProgression = [
        [174.61, 220.00, 261.63], // F Minor
        [155.56, 196.00, 233.08], // Eb Major
        [130.81, 164.81, 196.00], // C Minor
        [146.83, 174.61, 220.00]  // Bb Major
      ];
      leadNotes = [349.23, 392.00, 440.00, 523.25, 440.00, 392.00, 349.23, 329.63];
    } else if (cleanTitle.includes('smile') || cleanTitle.includes('bruno') || cleanTitle.includes('gaga')) {
      // Warm ballad in G Major (G, B, D, F#)
      bpm = 84;
      chordProgression = [
        [196.00, 246.94, 293.66], // G Major
        [164.81, 196.00, 246.94], // E Minor
        [130.81, 164.81, 196.00], // C Major
        [146.83, 185.00, 220.00]  // D Major
      ];
      leadNotes = [293.66, 329.63, 392.00, 440.00, 493.88, 392.00, 329.63, 293.66];
    } else if (cleanTitle.includes('golden') || cleanTitle.includes('jvke')) {
      // Ambient Piano in E Major (E, G#, B)
      bpm = 92;
      chordProgression = [
        [164.81, 207.65, 246.94], // E Major
        [220.00, 277.18, 329.63], // A Major
        [185.00, 220.00, 277.18], // F# Minor
        [246.94, 311.13, 369.99]  // B Major
      ];
      leadNotes = [329.63, 415.30, 493.88, 659.25, 493.88, 415.30, 369.99, 329.63];
    } else if (cleanTitle.includes('espresso') || cleanTitle.includes('sabrina')) {
      // Upbeat Disco Pop in C Major (C, E, G, A)
      bpm = 104;
      chordProgression = [
        [130.81, 164.81, 196.00], // C Major
        [146.83, 174.61, 220.00], // D Minor
        [164.81, 196.00, 246.94], // E Minor
        [174.61, 220.00, 261.63]  // F Major
      ];
      leadNotes = [261.63, 329.63, 392.00, 440.00, 523.25, 440.00, 392.00, 329.63];
    } else if (cleanTitle.includes('feather') || cleanTitle.includes('billie')) {
      // Indie Acoustic in D Major (D, F#, A)
      bpm = 105;
      chordProgression = [
        [146.83, 185.00, 220.00], // D Major
        [196.00, 246.94, 293.66], // G Major
        [220.00, 277.18, 329.63], // A Major
        [185.00, 220.00, 277.18]  // B Minor
      ];
      leadNotes = [293.66, 369.99, 440.00, 587.33, 440.00, 369.99, 293.66, 220.00];
    } else {
      // Harmonic Lo-Fi Sunset Chords
      bpm = 95;
      chordProgression = [
        [174.61, 220.00, 261.63],
        [130.81, 164.81, 196.00],
        [146.83, 174.61, 220.00],
        [196.00, 246.94, 293.66]
      ];
      leadNotes = [349.23, 440.00, 523.25, 659.25, 523.25, 440.00, 392.00, 349.23];
    }

    const masterGain = ctx.createGain();
    masterGain.gain.setValueAtTime(0.18, ctx.currentTime);
    masterGain.connect(ctx.destination);

    const activeNodes: (AudioNode | number)[] = [];
    let isStopped = false;

    // Rhythm and harmonic arpeggiator loop
    const beatInterval = 60 / bpm;
    let step = 0;

    const intervalId = window.setInterval(() => {
      if (isStopped || ctx.state === 'closed') return;

      const now = ctx.currentTime;
      const currentChordIndex = Math.floor(step / 4) % chordProgression.length;
      const currentChord = chordProgression[currentChordIndex];

      // Play soft pad/chord voice
      currentChord.forEach((freq, idx) => {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();

        osc.type = idx === 0 ? 'triangle' : 'sine';
        osc.frequency.setValueAtTime(freq, now);

        gain.gain.setValueAtTime(0.04, now);
        gain.gain.exponentialRampToValueAtTime(0.001, now + beatInterval * 1.5);

        osc.connect(gain);
        gain.connect(masterGain);

        osc.start(now);
        osc.stop(now + beatInterval * 1.5);
      });

      // Play melody lead note
      const leadFreq = leadNotes[step % leadNotes.length];
      const leadOsc = ctx.createOscillator();
      const leadGain = ctx.createGain();

      leadOsc.type = 'sine';
      leadOsc.frequency.setValueAtTime(leadFreq, now);

      leadGain.gain.setValueAtTime(0.08, now);
      leadGain.gain.exponentialRampToValueAtTime(0.001, now + beatInterval * 0.9);

      leadOsc.connect(leadGain);
      leadGain.connect(masterGain);

      leadOsc.start(now);
      leadOsc.stop(now + beatInterval * 0.9);

      step++;
    }, beatInterval * 1000);

    activeNodes.push(intervalId as any);

    this.stopPlaybackFn = () => {
      isStopped = true;
      clearInterval(intervalId);
      try {
        masterGain.gain.linearRampToValueAtTime(0.001, ctx.currentTime + 0.3);
        setTimeout(() => masterGain.disconnect(), 350);
      } catch {}
    };

    this.currentSong = songTitle;
    this.isPlayingState = true;
    this.notify();

    // 30 seconds preview limit
    this.autoStopTimeout = setTimeout(() => {
      this.stop();
      if (onEnded) onEnded();
    }, 30000);

    return true;
  }
}

export const musicNoteService = new MusicNoteService();
