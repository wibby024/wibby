type PauseCallback = () => void;

class PlaybackCoordinator {
  private activePlayerId: string | null = null;
  private players = new Map<string, PauseCallback>();
  private listeners = new Set<(activeId: string | null) => void>();

  /**
   * Register a player instance with its pause callback.
   */
  register(id: string, pauseCb: PauseCallback): void {
    this.players.set(id, pauseCb);
  }

  /**
   * Unregister a player instance when unmounting.
   * If this unmounting player is the active one, clear activePlayerId.
   */
  unregister(id: string): void {
    this.players.delete(id);
    if (this.activePlayerId === id) {
      this.activePlayerId = null;
      this.notify();
    }
  }

  /**
   * Request playback for a given player ID.
   * Automatically pauses any currently playing voice message.
   */
  play(id: string, pauseCb?: PauseCallback): void {
    if (pauseCb) {
      this.players.set(id, pauseCb);
    }

    if (this.activePlayerId && this.activePlayerId !== id) {
      const activeCb = this.players.get(this.activePlayerId);
      if (activeCb) {
        try {
          activeCb();
        } catch (err) {
          console.error('[PLAYBACK COORDINATOR] Error pausing previous audio player:', err);
        }
      }
    }

    this.activePlayerId = id;
    this.notify();
  }

  /**
   * Notify coordinator that player has paused.
   */
  pause(id: string): void {
    if (this.activePlayerId === id) {
      this.activePlayerId = null;
      this.notify();
    }
  }

  /**
   * Notify coordinator that player has stopped/ended.
   */
  stop(id?: string): void {
    if (!id || this.activePlayerId === id) {
      this.activePlayerId = null;
      this.notify();
    }
  }

  /**
   * Check if the given player is currently the active one.
   */
  isPlaying(id: string): boolean {
    return this.activePlayerId === id;
  }

  /**
   * Get the current active player ID.
   */
  getActiveId(): string | null {
    return this.activePlayerId;
  }

  /**
   * Subscribe to active player changes.
   */
  subscribe(listener: (activeId: string | null) => void): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  private notify(): void {
    for (const listener of this.listeners) {
      try {
        listener(this.activePlayerId);
      } catch (err) {
        console.error('[PLAYBACK COORDINATOR] Listener error:', err);
      }
    }
  }
}

export const playbackCoordinator = new PlaybackCoordinator();
