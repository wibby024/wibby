export type NotificationTone = 'wibby' | 'ding' | 'on-time' | 'soft-pop' | 'none';

export interface NotificationToneOption {
  id: NotificationTone;
  name: string;
  badge?: string;
  icon: string;
  description: string;
}

export const NOTIFICATION_TONES: NotificationToneOption[] = [
  {
    id: 'wibby',
    name: 'Wibby',
    badge: 'Default',
    icon: '💜',
    description: 'Warm harmonic signature chime'
  },
  {
    id: 'ding',
    name: 'Ding',
    icon: '🔔',
    description: 'Crisp crystalline bell sound'
  },
  {
    id: 'on-time',
    name: 'On Time',
    icon: '🎵',
    description: 'Lively 4-note ascending melody'
  },
  {
    id: 'soft-pop',
    name: 'Soft Pop',
    icon: '🫧',
    description: 'Subtle water bubble pop'
  },
  {
    id: 'none',
    name: 'None',
    icon: '🔕',
    description: 'Silent (no notification sound)'
  }
];

export const normalizeTone = (raw: string | null): NotificationTone => {
  if (!raw) return 'wibby';
  if (raw === 'apple-ding') return 'ding';
  if (raw === 'samsung-on-time') return 'on-time';
  if (raw === 'wibby-chime') return 'wibby';
  if (raw === 'gentle-pop') return 'soft-pop';
  if (['wibby', 'ding', 'on-time', 'soft-pop', 'none'].includes(raw)) {
    return raw as NotificationTone;
  }
  return 'wibby';
};

export const detectDefaultTone = (): NotificationTone => {
  return 'wibby';
};

class NotificationService {
  private permission: NotificationPermission = 'default';
  private audioCtx: AudioContext | null = null;
  private unreadCount: number = 0;
  private baseTitle: string = 'Wibby';
  private soundEnabled: boolean = true;
  private browserNotificationsEnabled: boolean = false;
  private currentTone: NotificationTone = 'wibby';

  constructor() {
    this.init();
  }

  public init() {
    if (typeof window !== 'undefined') {
      if ('Notification' in window) {
        this.permission = Notification.permission;
      }
      const savedSound = localStorage.getItem('wibby-sound-notifications');
      this.soundEnabled = savedSound !== 'disabled';

      const savedBrowser = localStorage.getItem('wibby-browser-notifications');
      this.browserNotificationsEnabled = savedBrowser === 'enabled' && this.permission === 'granted';

      const savedTone = localStorage.getItem('wibby-notification-tone');
      this.currentTone = normalizeTone(savedTone);
      localStorage.setItem('wibby-notification-tone', this.currentTone);
    }
  }

  public isSoundEnabled(): boolean {
    return this.soundEnabled;
  }

  public setSoundEnabled(enabled: boolean): void {
    this.soundEnabled = enabled;
    if (typeof window !== 'undefined') {
      localStorage.setItem('wibby-sound-notifications', enabled ? 'enabled' : 'disabled');
      window.dispatchEvent(new CustomEvent('wibby:sound-setting-changed', { detail: { enabled } }));
    }
  }

  public getNotificationTone(): NotificationTone {
    return this.currentTone;
  }

  public setNotificationTone(tone: NotificationTone): void {
    this.currentTone = normalizeTone(tone);
    if (typeof window !== 'undefined') {
      localStorage.setItem('wibby-notification-tone', this.currentTone);
      window.dispatchEvent(new CustomEvent('wibby:notification-tone-changed', { detail: { tone: this.currentTone } }));
    }
  }

  public isBrowserNotificationsEnabled(): boolean {
    return this.browserNotificationsEnabled;
  }

  public async setBrowserNotificationsEnabled(enabled: boolean): Promise<boolean> {
    if (!enabled) {
      this.browserNotificationsEnabled = false;
      if (typeof window !== 'undefined') {
        localStorage.setItem('wibby-browser-notifications', 'disabled');
        window.dispatchEvent(new CustomEvent('wibby:browser-notification-changed', { detail: { enabled: false } }));
      }
      return false;
    }

    const granted = await this.requestPermission();
    this.browserNotificationsEnabled = granted;
    if (typeof window !== 'undefined') {
      localStorage.setItem('wibby-browser-notifications', granted ? 'enabled' : 'disabled');
      window.dispatchEvent(new CustomEvent('wibby:browser-notification-changed', { detail: { enabled: granted } }));
    }
    return granted;
  }

  public async requestPermission(): Promise<boolean> {
    if (typeof window === 'undefined' || !('Notification' in window)) {
      return false;
    }
    try {
      this.permission = await Notification.requestPermission();
      return this.permission === 'granted';
    } catch {
      return false;
    }
  }

  public playTone(tone?: NotificationTone, force: boolean = false) {
    const toneToPlay = normalizeTone(tone || this.currentTone);
    if (toneToPlay === 'none') return;
    if (!force && !this.soundEnabled) return;

    // 1. Try playing high-fidelity bundled audio asset
    if (typeof Audio !== 'undefined') {
      try {
        const audio = new Audio(`/audio/${toneToPlay}.mp3`);
        audio.volume = 0.65;
        const playPromise = audio.play();
        if (playPromise !== undefined) {
          playPromise.catch(() => {
            this.synthesizeTone(toneToPlay);
          });
        }
        return;
      } catch {
        // Fallback to Web Audio synthesis
      }
    }

    this.synthesizeTone(toneToPlay);
  }

  public playChime(force: boolean = false) {
    this.playTone(this.currentTone, force);
  }

  public playTestTone(tone: NotificationTone) {
    this.playTone(tone, true);
  }

  public playTestChime() {
    this.playTone(this.currentTone, true);
  }

  private synthesizeTone(tone: NotificationTone) {
    if (tone === 'none') return;

    try {
      const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext;
      if (!AudioContextClass) return;
      if (!this.audioCtx || this.audioCtx.state === 'closed') {
        this.audioCtx = new AudioContextClass();
      }
      if (this.audioCtx.state === 'suspended') {
        this.audioCtx.resume();
      }
      const now = this.audioCtx.currentTime;

      if (tone === 'ding') {
        // Ding: Crisp crystal bell chime (C7 2093 Hz + harmonic shimmer)
        const osc1 = this.audioCtx.createOscillator();
        const osc2 = this.audioCtx.createOscillator();
        const oscSub = this.audioCtx.createOscillator();
        const gain = this.audioCtx.createGain();

        osc1.type = 'sine';
        osc2.type = 'sine';
        oscSub.type = 'sine';

        osc1.frequency.setValueAtTime(2093.0, now);
        osc2.frequency.setValueAtTime(4186.0, now);
        oscSub.frequency.setValueAtTime(1046.50, now);

        gain.gain.setValueAtTime(0.0001, now);
        gain.gain.linearRampToValueAtTime(0.18, now + 0.003); // 3ms crisp glass attack
        gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.65); // long crystalline decay

        osc1.connect(gain);
        osc2.connect(gain);
        oscSub.connect(gain);
        gain.connect(this.audioCtx.destination);

        osc1.start(now);
        osc1.stop(now + 0.65);
        osc2.start(now);
        osc2.stop(now + 0.65);
        oscSub.start(now);
        oscSub.stop(now + 0.65);
      } else if (tone === 'on-time') {
        // On Time: 4-note ascending marimba glockenspiel phrase (G5 -> C6 -> D6 -> G6)
        const notes = [
          { start: 0.00, dur: 0.10, freq: 783.99 },
          { start: 0.09, dur: 0.10, freq: 1046.50 },
          { start: 0.18, dur: 0.10, freq: 1174.66 },
          { start: 0.27, dur: 0.45, freq: 1567.98 }
        ];

        for (const n of notes) {
          const noteStart = now + n.start;
          const oscFundamental = this.audioCtx.createOscillator();
          const oscOvertone = this.audioCtx.createOscillator();
          const noteGain = this.audioCtx.createGain();

          oscFundamental.type = 'sine';
          oscOvertone.type = 'sine';

          oscFundamental.frequency.setValueAtTime(n.freq, noteStart);
          oscOvertone.frequency.setValueAtTime(n.freq * 2.76, noteStart); // Glockenspiel metallic bar mode

          noteGain.gain.setValueAtTime(0.0001, noteStart);
          noteGain.gain.linearRampToValueAtTime(0.14, noteStart + 0.004); // Mallet attack
          noteGain.gain.exponentialRampToValueAtTime(0.0001, noteStart + n.dur);

          oscFundamental.connect(noteGain);
          oscOvertone.connect(noteGain);
          noteGain.connect(this.audioCtx.destination);

          oscFundamental.start(noteStart);
          oscFundamental.stop(noteStart + n.dur);
          oscOvertone.start(noteStart);
          oscOvertone.stop(noteStart + n.dur);
        }
      } else if (tone === 'soft-pop') {
        // Soft Pop: Gentle bubble pop
        const osc = this.audioCtx.createOscillator();
        const gain = this.audioCtx.createGain();
        osc.type = 'sine';
        osc.frequency.setValueAtTime(1400, now);
        osc.frequency.exponentialRampToValueAtTime(650, now + 0.08);

        gain.gain.setValueAtTime(0.0001, now);
        gain.gain.linearRampToValueAtTime(0.16, now + 0.005);
        gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.15);

        osc.connect(gain);
        gain.connect(this.audioCtx.destination);
        osc.start(now);
        osc.stop(now + 0.15);
      } else {
        // Wibby (Default)
        const filter = this.audioCtx.createBiquadFilter();
        filter.type = 'lowpass';
        filter.frequency.setValueAtTime(3200, now);

        const osc1 = this.audioCtx.createOscillator();
        const osc2 = this.audioCtx.createOscillator();
        const gain = this.audioCtx.createGain();

        osc1.type = 'sine';
        osc2.type = 'sine';

        osc1.frequency.setValueAtTime(698.46, now);
        osc1.frequency.exponentialRampToValueAtTime(740, now + 0.06);

        osc2.frequency.setValueAtTime(1046.50, now + 0.05);
        osc2.frequency.exponentialRampToValueAtTime(1046.50, now + 0.28);

        gain.gain.setValueAtTime(0.0001, now);
        gain.gain.linearRampToValueAtTime(0.15, now + 0.02);
        gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.35);

        osc1.connect(gain);
        osc2.connect(gain);
        gain.connect(filter);
        filter.connect(this.audioCtx.destination);

        osc1.start(now);
        osc1.stop(now + 0.1);
        osc2.start(now + 0.05);
        osc2.stop(now + 0.35);
      }
    } catch {
      // Audio context error handling
    }
  }

  public onNewMessage(senderName: string, text: string) {
    // 1. Play chosen in-app notification sound if not muted or set to 'none'
    if (this.soundEnabled && this.currentTone !== 'none') {
      this.playTone(this.currentTone);
    }

    // 2. Tab title unread indicator (gentle, zero popup disturbance)
    const isInactive = typeof document !== 'undefined' && (document.hidden || !document.hasFocus());
    if (isInactive) {
      this.unreadCount++;
      document.title = `(${this.unreadCount}) Wibby`;

      // 3. ONLY spawn browser popup if user explicitly enabled browser notifications
      if (this.browserNotificationsEnabled) {
        this.notifyMessage(senderName, text);
      }
    }
  }

  public resetUnread() {
    this.unreadCount = 0;
    if (typeof document !== 'undefined') {
      document.title = this.baseTitle;
    }
  }

  public notifyMessage(senderName: string, text: string, tag: string = 'message') {
    if (typeof window === 'undefined' || !('Notification' in window)) return;
    if (!this.browserNotificationsEnabled) return;
    if (this.permission !== 'granted') return;
    if (document.visibilityState === 'visible' && document.hasFocus()) return;

    try {
      const notification = new Notification(`Wibby • ${senderName}`, {
        body: text || 'Sent a message',
        icon: '/favicon.svg',
        tag: `wibby-${tag}`,
        silent: true
      });

      notification.onclick = () => {
        window.focus();
        this.resetUnread();
        notification.close();
      };
    } catch (e) {
      console.warn('Browser notification error:', e);
    }
  }

  public notifyCall(callerName: string, isVideo: boolean = false) {
    if (typeof window === 'undefined' || !('Notification' in window)) return;
    if (!this.browserNotificationsEnabled) return;
    if (this.permission !== 'granted') return;
    if (document.visibilityState === 'visible' && document.hasFocus()) return;

    try {
      const notification = new Notification(`Incoming ${isVideo ? 'Video' : 'Voice'} Call`, {
        body: `${callerName} is calling you on Wibby`,
        icon: '/favicon.svg',
        tag: 'wibby-incoming-call',
        requireInteraction: true
      });

      notification.onclick = () => {
        window.focus();
        notification.close();
      };
    } catch (e) {
      console.warn('Call notification error:', e);
    }
  }
}

export const notificationService = new NotificationService();
