import { Server as SocketIOServer, Socket } from 'socket.io';
import { ObjectId } from 'mongodb';
import { getDb } from '../lib/mongodb.js';
import crypto from 'crypto';

export interface TogetherSessionState {
  sessionId: string;
  conversationId: string;
  mediaUrl: string;
  mediaType: 'youtube' | 'direct' | 'custom' | 'spotify';
  title?: string;
  hostUserId: string;
  state: 'playing' | 'paused' | 'stopped';
  position: number;
  playing: boolean;
  updatedAt: string;
  sentAt?: number;
  lastActionUid?: string;
  version: number;
}

const activeTogetherSessions = new Map<string, TogetherSessionState>();

function saveSessionToDb(session: TogetherSessionState): void {
  try {
    const db = getDb();
    db.collection('together_sessions').updateOne(
      { conversationId: session.conversationId },
      { $set: session },
      { upsert: true }
    ).catch(err => {
      console.warn('[together] Failed to persist session to MongoDB:', err);
    });
  } catch {
    // DB might not be ready or in-memory tests
  }
}

function deleteSessionFromDb(conversationId: string): void {
  try {
    const db = getDb();
    db.collection('together_sessions').deleteOne({ conversationId }).catch(err => {
      console.warn('[together] Failed to remove session from MongoDB:', err);
    });
  } catch {
    // Ignore
  }
}

function getAuthoritativePosition(session: TogetherSessionState): number {
  if (session.state === 'playing' && session.playing) {
    const elapsedSecs = (Date.now() - new Date(session.updatedAt).getTime()) / 1000;
    if (elapsedSecs > 0 && elapsedSecs < 86400) {
      return Math.max(0, session.position + elapsedSecs);
    }
  }
  return Math.max(0, session.position);
}

function buildClientState(session: TogetherSessionState): TogetherSessionState & {
  currentTime: number;
  isPlaying: boolean;
  sentAt: number;
} {
  const computedPos = getAuthoritativePosition(session);
  const isPlaying = session.state === 'playing' && session.playing;
  return {
    ...session,
    position: computedPos,
    currentTime: computedPos,
    playing: isPlaying,
    isPlaying,
    sentAt: Date.now()
  };
}

export function registerTogetherHandlers(
  io: SocketIOServer,
  socket: Socket,
  _userSockets: Map<string, Set<string>>
) {
  const uid = socket.data.uid;

  // 1. Start or join existing session
  socket.on('together:start', async (data: {
    conversationId: string;
    mediaUrl: string;
    mediaType?: 'youtube' | 'direct' | 'custom' | 'spotify';
    title?: string;
  }) => {
    try {
      if (!data?.conversationId || !data?.mediaUrl) return;

      const db = getDb();
      const conversation = await db.collection('conversations').findOne({
        $or: [
          ...(ObjectId.isValid(data.conversationId) ? [{ _id: new ObjectId(data.conversationId) }] : []),
          { _id: data.conversationId as any }
        ]
      });
      if (!conversation || !conversation.members?.includes(uid)) {
        console.warn(`[together] User ${uid} unauthorized or conversation ${data.conversationId} not found`);
        return;
      }

      const now = Date.now();
      const session: TogetherSessionState = {
        sessionId: crypto.randomUUID(),
        conversationId: data.conversationId,
        mediaUrl: data.mediaUrl,
        mediaType: data.mediaType || 'youtube',
        title: data.title || 'Together Session',
        hostUserId: uid,
        state: 'playing',
        position: 0,
        playing: true,
        updatedAt: new Date(now).toISOString(),
        sentAt: now,
        lastActionUid: uid,
        version: 1
      };

      activeTogetherSessions.set(data.conversationId, session);
      saveSessionToDb(session);

      // Ensure the calling socket is in the conversation room
      socket.join(`conversation:${data.conversationId}`);

      const clientState = buildClientState(session);
      io.to(`conversation:${data.conversationId}`).emit('together:state', clientState);
      io.to(`conversation:${data.conversationId}`).emit('together:started', clientState);
      // Direct emit fallback to sender socket to eliminate any room delivery race condition
      socket.emit('together:state', clientState);
      socket.emit('together:started', clientState);
    } catch (err) {
      console.error('together:start error:', err);
    }
  });

  // 2. Change media URL in existing session (either user can change)
  socket.on('together:change-media', async (data: {
    conversationId: string;
    mediaUrl: string;
    mediaType?: 'youtube' | 'direct' | 'custom' | 'spotify';
    title?: string;
  }) => {
    try {
      if (!data?.conversationId || !data?.mediaUrl) return;

      const now = Date.now();
      let session = activeTogetherSessions.get(data.conversationId);
      if (!session) {
        session = {
          sessionId: crypto.randomUUID(),
          conversationId: data.conversationId,
          mediaUrl: data.mediaUrl,
          mediaType: data.mediaType || 'youtube',
          title: data.title || 'Together Session',
          hostUserId: uid,
          state: 'paused',
          position: 0,
          playing: false,
          updatedAt: new Date(now).toISOString(),
          sentAt: now,
          lastActionUid: uid,
          version: 1
        };
      } else {
        session.mediaUrl = data.mediaUrl;
        session.mediaType = data.mediaType || session.mediaType;
        session.title = data.title || session.title;
        session.hostUserId = uid;
        session.state = 'paused';
        session.playing = false;
        session.position = 0;
        session.updatedAt = new Date(now).toISOString();
        session.sentAt = now;
        session.lastActionUid = uid;
        session.version = (session.version || 0) + 1;
      }

      activeTogetherSessions.set(data.conversationId, session);
      saveSessionToDb(session);

      // Ensure room membership
      socket.join(`conversation:${data.conversationId}`);

      const clientState = buildClientState(session);
      io.to(`conversation:${data.conversationId}`).emit('together:state', clientState);
      socket.emit('together:state', clientState);
    } catch (err) {
      console.error('together:change-media error:', err);
    }
  });

  // 3. Media playback controls (play, pause, seek)
  socket.on('together:control', (data: {
    conversationId: string;
    action: 'play' | 'pause' | 'seek';
    position?: number;
    currentTime?: number;
  }) => {
    try {
      if (!data?.conversationId) return;

      const session = activeTogetherSessions.get(data.conversationId);
      if (!session) return;

      let newPos: number;
      if (typeof data.position === 'number' && !isNaN(data.position) && data.position >= 0) {
        newPos = data.position;
      } else if (typeof data.currentTime === 'number' && !isNaN(data.currentTime) && data.currentTime >= 0) {
        newPos = data.currentTime;
      } else {
        newPos = getAuthoritativePosition(session);
      }

      const now = Date.now();
      if (data.action === 'play') {
        session.state = 'playing';
        session.playing = true;
        session.position = newPos;
      } else if (data.action === 'pause') {
        session.state = 'paused';
        session.playing = false;
        session.position = newPos;
      } else if (data.action === 'seek') {
        session.position = newPos;
      }

      session.hostUserId = uid;
      session.lastActionUid = uid;
      session.updatedAt = new Date(now).toISOString();
      session.sentAt = now;
      session.version = (session.version || 0) + 1;

      activeTogetherSessions.set(data.conversationId, session);
      saveSessionToDb(session);

      // Ensure room membership
      socket.join(`conversation:${data.conversationId}`);

      const clientState = buildClientState(session);

      // Broadcast authoritative state to all participants in the room
      io.to(`conversation:${data.conversationId}`).emit('together:state', clientState);
      socket.emit('together:state', clientState);
      socket.to(`conversation:${data.conversationId}`).emit('together:action', {
        conversationId: data.conversationId,
        action: data.action,
        currentTime: clientState.position,
        position: clientState.position,
        senderUid: uid,
        sentAt: now,
        version: session.version
      });
    } catch (err) {
      console.error('together:control error:', err);
    }
  });

  // Legacy action alias
  socket.on('together:action', (data: {
    conversationId: string;
    action: 'play' | 'pause' | 'seek';
    currentTime?: number;
    position?: number;
  }) => {
    try {
      if (!data?.conversationId) return;
      const session = activeTogetherSessions.get(data.conversationId);
      if (!session) return;

      let newPos: number;
      if (typeof data.position === 'number' && !isNaN(data.position) && data.position >= 0) {
        newPos = data.position;
      } else if (typeof data.currentTime === 'number' && !isNaN(data.currentTime) && data.currentTime >= 0) {
        newPos = data.currentTime;
      } else {
        newPos = getAuthoritativePosition(session);
      }

      const now = Date.now();
      if (data.action === 'play') {
        session.state = 'playing';
        session.playing = true;
        session.position = newPos;
      } else if (data.action === 'pause') {
        session.state = 'paused';
        session.playing = false;
        session.position = newPos;
      } else if (data.action === 'seek') {
        session.position = newPos;
      }

      session.hostUserId = uid;
      session.lastActionUid = uid;
      session.updatedAt = new Date(now).toISOString();
      session.sentAt = now;
      session.version = (session.version || 0) + 1;

      activeTogetherSessions.set(data.conversationId, session);
      saveSessionToDb(session);

      // Ensure room membership
      socket.join(`conversation:${data.conversationId}`);

      const clientState = buildClientState(session);

      io.to(`conversation:${data.conversationId}`).emit('together:state', clientState);
      socket.emit('together:state', clientState);
      socket.to(`conversation:${data.conversationId}`).emit('together:action', {
        ...data,
        currentTime: clientState.position,
        position: clientState.position,
        senderUid: uid,
        sentAt: now,
        version: session.version
      });
    } catch (err) {
      console.error('together:action error:', err);
    }
  });

  // 4. Request latest state (late join / reconnect / drift sync / restart restore)
  socket.on('together:get-state', async (data: { conversationId: string }) => {
    try {
      if (!data?.conversationId) return;

      // Ensure room membership so this client receives all future sync updates
      socket.join(`conversation:${data.conversationId}`);

      let session = activeTogetherSessions.get(data.conversationId);
      if (!session) {
        try {
          const db = getDb();
          const stored = await db.collection('together_sessions').findOne({
            conversationId: data.conversationId
          });
          if (stored && stored.mediaUrl) {
            session = {
              sessionId: stored.sessionId || crypto.randomUUID(),
              conversationId: stored.conversationId,
              mediaUrl: stored.mediaUrl,
              mediaType: stored.mediaType || 'youtube',
              title: stored.title || 'Together Session',
              hostUserId: stored.hostUserId || '',
              state: stored.state || 'paused',
              position: typeof stored.position === 'number' ? stored.position : 0,
              playing: Boolean(stored.playing),
              updatedAt: stored.updatedAt || new Date().toISOString(),
              sentAt: Date.now(),
              lastActionUid: stored.lastActionUid,
              version: stored.version || 1
            };
            activeTogetherSessions.set(data.conversationId, session);
          }
        } catch (dbErr) {
          console.warn('[together] Could not fetch session from MongoDB:', dbErr);
        }
      }

      if (session) {
        socket.emit('together:state', buildClientState(session));
      }
    } catch (err) {
      console.error('together:get-state error:', err);
    }
  });

  // 5. End / stop session
  socket.on('together:end', (data: { conversationId: string }) => {
    try {
      if (!data?.conversationId) return;
      activeTogetherSessions.delete(data.conversationId);
      deleteSessionFromDb(data.conversationId);
      io.to(`conversation:${data.conversationId}`).emit('together:ended', {
        conversationId: data.conversationId
      });
    } catch (err) {
      console.error('together:end error:', err);
    }
  });
}
