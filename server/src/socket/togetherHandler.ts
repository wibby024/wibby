import { Server as SocketIOServer, Socket } from 'socket.io';
import { ObjectId } from 'mongodb';
import { getDb } from '../lib/mongodb.js';
import crypto from 'crypto';

export interface TogetherSessionState {
  sessionId: string;
  conversationId: string;
  mediaUrl: string;
  mediaType: 'youtube' | 'direct' | 'custom';
  title?: string;
  hostUserId: string;
  state: 'playing' | 'paused' | 'stopped';
  position: number;
  playing: boolean;
  updatedAt: string;
  version: number;
}

const activeTogetherSessions = new Map<string, TogetherSessionState>();

function getAuthoritativePosition(session: TogetherSessionState): number {
  if (session.state === 'playing' && session.playing) {
    const elapsedSecs = (Date.now() - new Date(session.updatedAt).getTime()) / 1000;
    return Math.max(0, session.position + Math.max(0, elapsedSecs));
  }
  return Math.max(0, session.position);
}

export function registerTogetherHandlers(
  io: SocketIOServer,
  socket: Socket,
  _userSockets: Map<string, Set<string>>
) {
  const uid = socket.data.uid;

  // 1. Start or join existing session
  socket.on('together:start', async (data: { conversationId: string; mediaUrl: string; mediaType?: 'youtube' | 'direct' | 'custom'; title?: string }) => {
    try {
      if (!data?.conversationId || !data?.mediaUrl) return;

      const db = getDb();
      const conversation = await db.collection('conversations').findOne({
        _id: new ObjectId(data.conversationId)
      });
      if (!conversation || !conversation.members.includes(uid)) return;

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
        updatedAt: new Date().toISOString(),
        version: 1
      };

      activeTogetherSessions.set(data.conversationId, session);
      io.to(`conversation:${data.conversationId}`).emit('together:state', session);
      io.to(`conversation:${data.conversationId}`).emit('together:started', session);
    } catch (err) {
      console.error('together:start error:', err);
    }
  });

  // 2. Change media URL in existing session (either user can change)
  socket.on('together:change-media', async (data: { conversationId: string; mediaUrl: string; mediaType?: 'youtube' | 'direct' | 'custom'; title?: string }) => {
    try {
      if (!data?.conversationId || !data?.mediaUrl) return;

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
          updatedAt: new Date().toISOString(),
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
        session.updatedAt = new Date().toISOString();
        session.version += 1;
      }

      activeTogetherSessions.set(data.conversationId, session);
      io.to(`conversation:${data.conversationId}`).emit('together:state', session);
    } catch (err) {
      console.error('together:change-media error:', err);
    }
  });

  // 3. Media playback controls (play, pause, seek)
  socket.on('together:control', (data: { conversationId: string; action: 'play' | 'pause' | 'seek'; position?: number; currentTime?: number }) => {
    try {
      if (!data?.conversationId) return;

      const session = activeTogetherSessions.get(data.conversationId);
      if (!session) return;

      let newPos: number;
      if (typeof data.position === 'number' && data.position > 0) {
        newPos = data.position;
      } else if (typeof data.currentTime === 'number' && data.currentTime > 0) {
        newPos = data.currentTime;
      } else if (data.action === 'seek' && (data.position === 0 || data.currentTime === 0)) {
        newPos = 0;
      } else {
        newPos = getAuthoritativePosition(session);
      }

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

      session.updatedAt = new Date().toISOString();
      session.version += 1;

      // Broadcast authoritative state to all participants in the room
      io.to(`conversation:${data.conversationId}`).emit('together:state', session);
      socket.to(`conversation:${data.conversationId}`).emit('together:action', {
        conversationId: data.conversationId,
        action: data.action,
        currentTime: session.position,
        position: session.position,
        senderUid: uid
      });
    } catch (err) {
      console.error('together:control error:', err);
    }
  });

  // Legacy action alias
  socket.on('together:action', (data: { conversationId: string; action: 'play' | 'pause' | 'seek'; currentTime?: number; position?: number }) => {
    try {
      if (!data?.conversationId) return;
      const session = activeTogetherSessions.get(data.conversationId);
      if (!session) return;

      let newPos: number;
      if (typeof data.position === 'number' && data.position > 0) {
        newPos = data.position;
      } else if (typeof data.currentTime === 'number' && data.currentTime > 0) {
        newPos = data.currentTime;
      } else if (data.action === 'seek' && (data.position === 0 || data.currentTime === 0)) {
        newPos = 0;
      } else {
        newPos = getAuthoritativePosition(session);
      }

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

      session.updatedAt = new Date().toISOString();
      session.version += 1;

      io.to(`conversation:${data.conversationId}`).emit('together:state', session);
      socket.to(`conversation:${data.conversationId}`).emit('together:action', {
        ...data,
        currentTime: session.position,
        position: session.position,
        senderUid: uid
      });
    } catch (err) {
      console.error('together:action error:', err);
    }
  });

  // 4. Request latest state (late join / reconnect / drift sync)
  socket.on('together:get-state', (data: { conversationId: string }) => {
    try {
      if (!data?.conversationId) return;
      const session = activeTogetherSessions.get(data.conversationId);
      if (session) {
        const computedPos = getAuthoritativePosition(session);
        socket.emit('together:state', {
          ...session,
          position: computedPos,
          currentTime: computedPos
        });
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
      io.to(`conversation:${data.conversationId}`).emit('together:ended', {
        conversationId: data.conversationId
      });
    } catch (err) {
      console.error('together:end error:', err);
    }
  });
}
