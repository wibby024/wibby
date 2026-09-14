/**
 * WIBBY — Offline Message Queue & Reconnect Synchronizer
 * 
 * Queues messages locally when offline or disconnected,
 * and synchronizes automatically on socket reconnect.
 */

const QUEUE_STORAGE_KEY = 'wibby_offline_msg_queue';

export interface QueuedMessage {
  id: string;
  conversationId: string;
  text: string;
  type: string;
  clientMessageId: string;
  queuedAt: string;
}

class OfflineQueueService {
  private queue: QueuedMessage[] = [];
  private isFlushing = false;

  constructor() {
    this.loadQueue();
  }

  private loadQueue() {
    try {
      const stored = localStorage.getItem(QUEUE_STORAGE_KEY);
      if (stored) {
        this.queue = JSON.parse(stored);
      }
    } catch {
      this.queue = [];
    }
  }

  private saveQueue() {
    try {
      localStorage.setItem(QUEUE_STORAGE_KEY, JSON.stringify(this.queue));
    } catch (err) {
      console.warn('[WIBBY OFFLINE] Save queue error:', err);
    }
  }

  /**
   * Enqueue a message for sending when online
   */
  enqueue(message: Omit<QueuedMessage, 'queuedAt'>) {
    const item: QueuedMessage = {
      ...message,
      queuedAt: new Date().toISOString()
    };
    this.queue.push(item);
    this.saveQueue();
    console.log('[WIBBY OFFLINE] Queued message:', item.id);
  }

  /**
   * Flush queued messages using active token
   */
  async flush(getAuthToken: () => Promise<string | null>, onMessageSent?: (msg: any) => void) {
    if (this.isFlushing || this.queue.length === 0) return;
    this.isFlushing = true;

    try {
      const token = await getAuthToken();
      if (!token) {
        this.isFlushing = false;
        return;
      }

      const itemsToSend = [...this.queue];
      for (const item of itemsToSend) {
        try {
          const res = await fetch(
            `${import.meta.env.VITE_API_URL || 'http://localhost:3000'}/api/conversations/${item.conversationId}/messages`,
            {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${token}`
              },
              body: JSON.stringify({
                text: item.text,
                type: item.type,
                clientMessageId: item.clientMessageId
              })
            }
          );

          if (res.ok) {
            const data = await res.json();
            this.queue = this.queue.filter(q => q.id !== item.id);
            this.saveQueue();
            onMessageSent?.(data.message || data);
          }
        } catch (err) {
          console.warn('[WIBBY OFFLINE] Failed to send queued message, will retry on next reconnect:', err);
          break; // Stop loop and keep remaining in queue
        }
      }
    } finally {
      this.isFlushing = false;
    }
  }

  getQueueLength(): number {
    return this.queue.length;
  }
}

export const offlineQueue = new OfflineQueueService();
