class NotificationService {
  private permission: NotificationPermission = 'default';

  constructor() {
    this.init();
  }

  public init() {
    if (typeof window !== 'undefined' && 'Notification' in window) {
      this.permission = Notification.permission;
    }
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

  public notifyMessage(senderName: string, text: string, tag: string = 'message') {
    if (typeof window === 'undefined' || !('Notification' in window)) return;
    if (this.permission !== 'granted') return;
    // Only notify if tab is hidden / not focused
    if (document.visibilityState === 'visible' && document.hasFocus()) return;

    try {
      const notification = new Notification(`Wibby • ${senderName}`, {
        body: text || 'Sent a message',
        icon: '/favicon.ico',
        tag: `wibby-${tag}`,
        silent: false
      });

      notification.onclick = () => {
        window.focus();
        notification.close();
      };
    } catch (e) {
      console.warn('Browser notification error:', e);
    }
  }

  public notifyCall(callerName: string, isVideo: boolean = false) {
    if (typeof window === 'undefined' || !('Notification' in window)) return;
    if (this.permission !== 'granted') return;
    if (document.visibilityState === 'visible' && document.hasFocus()) return;

    try {
      const notification = new Notification(`Incoming ${isVideo ? 'Video' : 'Voice'} Call`, {
        body: `${callerName} is calling you on Wibby`,
        icon: '/favicon.ico',
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
