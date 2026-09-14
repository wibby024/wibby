import { Server as SocketIOServer } from 'socket.io';
import { Server as HttpServer } from 'http';
import { getAuth } from 'firebase-admin/auth';
import { getDb } from '../lib/mongodb.js';
import { ObjectId } from 'mongodb';
import { registerCallHandlers } from './callHandler.js';
import { registerTogetherHandlers } from './togetherHandler.js';

// Singleton io instance for use elsewhere if needed
let ioInstance: SocketIOServer | null = null;
const userSockets = new Map<string, Set<string>>();

export function initializeSocket(httpServer: HttpServer) {
  const isProd = process.env.NODE_ENV === 'production';
  const rawClientUrls = process.env.CLIENT_URL || (isProd ? 'https://wibby024.web.app,https://wibby024.firebaseapp.com,https://wibby.web.app' : 'http://localhost:5173');
  const allowedOrigins = rawClientUrls
    .split(',')
    .map((s) => s.trim().replace(/\/$/, ''))
    .filter(Boolean);

  if (!isProd) {
    allowedOrigins.push(
      'http://localhost:5173',
      'http://127.0.0.1:5173',
      'http://localhost:5174',
      'http://127.0.0.1:5174',
      'http://localhost:3000',
      'http://127.0.0.1:3000'
    );
  }

  const io = new SocketIOServer(httpServer, {
    cors: {
      origin: (origin, callback) => {
        if (!origin) return callback(null, true);
        const normalizedOrigin = origin.replace(/\/$/, '');
        if (allowedOrigins.includes(normalizedOrigin)) {
          return callback(null, true);
        }
        if (!isProd && (origin.startsWith('http://localhost:') || origin.startsWith('http://127.0.0.1:'))) {
          return callback(null, true);
        }
        return callback(new Error(`CORS policy violation for origin: ${origin}`));
      },
      methods: ['GET', 'POST'],
      credentials: true
    }
  });
  
  ioInstance = io;

  // Middleware: Authenticate via Firebase ID token
  io.use(async (socket, next) => {
    try {
      const token = socket.handshake.auth.token;
      if (!token) {
        return next(new Error('Authentication error: Token missing'));
      }
      
      const decodedToken = await getAuth().verifyIdToken(token);
      // Attach the user's uid to the socket data
      socket.data.uid = decodedToken.uid;
      next();
    } catch (err) {
      next(new Error('Authentication error: Invalid token'));
    }
  });

  io.on('connection', (socket) => {
    const uid = socket.data.uid;
    console.log(`Socket connected: ${socket.id} for user ${uid}`);
    socket.join(`user:${uid}`);

    // Track presence & detect multi-browser login
    if (!userSockets.has(uid)) {
      userSockets.set(uid, new Set());
    }
    const connections = userSockets.get(uid)!;
    const wasOffline = connections.size === 0;

    // If already has active connections from another browser/tab, notify them of conflict
    if (connections.size > 0) {
      for (const existingSockId of connections) {
        if (existingSockId !== socket.id) {
          io.to(existingSockId).emit('session:conflict', {
            message: 'You logged in from another browser or window.',
            timestamp: new Date().toISOString()
          });
        }
      }
    }

    connections.add(socket.id);

    // Allow this window to claim exclusive session
    socket.on('session:claim', () => {
      const userConns = userSockets.get(uid);
      if (userConns) {
        for (const sockId of userConns) {
          if (sockId !== socket.id) {
            io.to(sockId).emit('session:force_logout', {
              reason: 'Session claimed in another active window.'
            });
          }
        }
      }
    });

    // Register Phase 8 Voice Call Signaling Handlers
    registerCallHandlers(io, socket, userSockets);

    // Register Together Mode Handlers
    registerTogetherHandlers(io, socket, userSockets);

    // Auto-join all conversation rooms for this user upon connection to prevent race conditions
    (async () => {
      try {
        const db = getDb();
        const userConversations = await db.collection('conversations').find({ members: uid }).toArray();
        for (const conv of userConversations) {
          const roomName = `conversation:${conv._id.toString()}`;
          socket.join(roomName);
          console.log(`[WIBBY SOCKET] Auto-joined socket ${socket.id} (user ${uid}) to room ${roomName}`);
        }
      } catch (e) {
        console.error('[WIBBY SOCKET] Auto-join error:', e);
      }
    })();

    if (wasOffline) {
      // User just came online (run async in background so listeners attach synchronously)
      (async () => {
        try {
          const db = getDb();
          await db.collection('users').updateOne(
            { firebaseUid: uid },
            { $set: { online: true } }
          );

          // Notify active conversation rooms and user rooms
          const conversations = await db.collection('conversations').find({ members: uid }).toArray();
          for (const conv of conversations) {
            io.to(`conversation:${conv._id.toString()}`).emit('presence:update', {
              uid,
              online: true
            });
            for (const memberId of conv.members) {
              if (memberId !== uid) {
                io.to(`user:${memberId}`).emit('presence:update', {
                  uid,
                  online: true
                });
              }
            }
          }
        } catch (err) {
          console.error('Error setting user online:', err);
        }
      })();
    }

    socket.on('join_conversation', async (conversationId: string) => {
      try {
        const db = getDb();
        const conversation = await db.collection('conversations').findOne({
          _id: new ObjectId(conversationId)
        });

        if (!conversation) {
          return socket.emit('error', { message: 'Conversation not found' });
        }

        // Verify the authenticated user is a member of this conversation
        if (!conversation.members.includes(socket.data.uid)) {
          return socket.emit('error', { message: 'Not authorized for this conversation' });
        }

        const roomName = `conversation:${conversationId}`;
        socket.join(roomName);
        console.log(`[WIBBY SOCKET] Socket ${socket.id} (user ${socket.data.uid}) joined room ${roomName}`);
        socket.emit('joined_conversation', { conversationId });
      } catch (err) {
        console.error('Error joining conversation:', err);
        socket.emit('error', { message: 'Internal server error joining conversation' });
      }
    });

    // Handle delivery acknowledgements
    socket.on('message:delivery-ack', async (data: { messageId: string, conversationId: string }) => {
      try {
        const db = getDb();
        const msgId = new ObjectId(data.messageId);
        
        // Ensure user is in conversation
        const conversation = await db.collection('conversations').findOne({ _id: new ObjectId(data.conversationId) });
        if (!conversation || !conversation.members.includes(uid)) return;

        // Fetch message
        const message = await db.collection('messages').findOne({ _id: msgId, conversationId: new ObjectId(data.conversationId) });
        if (!message || message.senderId === uid) return; // Cannot ack own message

        if (message.status === 'sent') {
          await db.collection('messages').updateOne({ _id: msgId }, { $set: { status: 'delivered', deliveredAt: new Date() } });
          io.to(`conversation:${data.conversationId}`).emit('message:status-update', {
            messageId: data.messageId,
            status: 'delivered'
          });
        }
      } catch (err) {
        console.error('Error processing delivery-ack:', err);
      }
    });

    // Handle read acknowledgements
    socket.on('message:read-ack', async (data: { messageId: string, conversationId: string }) => {
      try {
        const db = getDb();
        const msgId = new ObjectId(data.messageId);
        
        // Ensure user is in conversation
        const conversation = await db.collection('conversations').findOne({ _id: new ObjectId(data.conversationId) });
        if (!conversation || !conversation.members.includes(uid)) return;

        // Fetch message
        const message = await db.collection('messages').findOne({ _id: msgId, conversationId: new ObjectId(data.conversationId) });
        if (!message || message.senderId === uid) return; // Cannot ack own message

        if (message.status !== 'seen') {
          await db.collection('messages').updateOne({ _id: msgId }, { $set: { status: 'seen', seenAt: new Date() } });
          io.to(`conversation:${data.conversationId}`).emit('message:status-update', {
            messageId: data.messageId,
            status: 'seen'
          });
        }
      } catch (err) {
        console.error('Error processing read-ack:', err);
      }
    });

    // Track active typing conversations for this socket
    const activeTypingConversations = new Set<string>();

    // Handle typing start
    socket.on('typing:start', async (data: { conversationId: string }) => {
      try {
        if (!data?.conversationId) return;
        
        const db = getDb();
        const conversation = await db.collection('conversations').findOne({
          _id: new ObjectId(data.conversationId)
        });
        if (!conversation || !conversation.members.includes(uid)) return;

        activeTypingConversations.add(data.conversationId);
        socket.to(`conversation:${data.conversationId}`).emit('typing:start', {
          conversationId: data.conversationId,
          userId: uid
        });
      } catch (err) {
        console.error('Error handling typing:start:', err);
      }
    });

    // Handle typing stop
    socket.on('typing:stop', async (data: { conversationId: string }) => {
      try {
        if (!data?.conversationId) return;
        activeTypingConversations.delete(data.conversationId);
        socket.to(`conversation:${data.conversationId}`).emit('typing:stop', {
          conversationId: data.conversationId,
          userId: uid
        });
      } catch (err) {
        console.error('Error handling typing:stop:', err);
      }
    });

    // Handle real-time Live Location coordinate stream
    socket.on('location:live_update', async (data: {
      conversationId: string;
      messageId: string;
      latitude: number;
      longitude: number;
      accuracy?: number;
      speed?: number;
      heading?: number;
    }) => {
      try {
        if (!data?.conversationId || !data?.messageId || typeof data.latitude !== 'number' || typeof data.longitude !== 'number') return;
        
        // Broadcast immediately to conversation room
        io.to(`conversation:${data.conversationId}`).emit('location:live_update', {
          conversationId: data.conversationId,
          messageId: data.messageId,
          latitude: data.latitude,
          longitude: data.longitude,
          accuracy: data.accuracy,
          speed: data.speed,
          heading: data.heading,
          updatedAt: new Date().toISOString()
        });

        // Persist newest coordinates to MongoDB asynchronously
        const db = getDb();
        db.collection('messages').updateOne(
          { _id: new ObjectId(data.messageId) },
          {
            $set: {
              'location.latitude': data.latitude,
              'location.longitude': data.longitude,
              'location.accuracy': data.accuracy,
              'location.speed': data.speed,
              'location.heading': data.heading
            }
          }
        ).catch(e => console.error('Error updating live location in db:', e));
      } catch (err) {
        console.error('Error handling location:live_update:', err);
      }
    });

    // Handle Live Location stop
    socket.on('location:live_stop', async (data: { conversationId: string; messageId: string }) => {
      try {
        if (!data?.conversationId || !data?.messageId) return;
        const stoppedAt = new Date().toISOString();

        io.to(`conversation:${data.conversationId}`).emit('location:live_stop', {
          conversationId: data.conversationId,
          messageId: data.messageId,
          stoppedAt
        });

        const db = getDb();
        db.collection('messages').updateOne(
          { _id: new ObjectId(data.messageId) },
          { $set: { 'location.stoppedAt': stoppedAt } }
        ).catch(e => console.error('Error stopping live location in db:', e));
      } catch (err) {
        console.error('Error handling location:live_stop:', err);
      }
    });

    socket.on('disconnect', async () => {
      console.log(`Socket disconnected: ${socket.id}`);
      
      // Clean up typing state
      for (const convId of activeTypingConversations) {
        socket.to(`conversation:${convId}`).emit('typing:stop', {
          conversationId: convId,
          userId: uid
        });
      }
      activeTypingConversations.clear();
      
      const connections = userSockets.get(uid);
      if (connections) {
        connections.delete(socket.id);
        
        if (connections.size === 0) {
          userSockets.delete(uid);
          
          // User just went offline
          const lastSeen = new Date();
          try {
            const db = getDb();
            await db.collection('users').updateOne(
              { firebaseUid: uid },
              { $set: { online: false, lastSeen } }
            );

            // Notify active conversation rooms and user rooms
            const conversations = await db.collection('conversations').find({ members: uid }).toArray();
            for (const conv of conversations) {
              io.to(`conversation:${conv._id.toString()}`).emit('presence:update', {
                uid,
                online: false,
                lastSeen: lastSeen.toISOString()
              });
              for (const memberId of conv.members) {
                if (memberId !== uid) {
                  io.to(`user:${memberId}`).emit('presence:update', {
                    uid,
                    online: false,
                    lastSeen: lastSeen.toISOString()
                  });
                }
              }
            }
          } catch (err) {
            console.error('Error setting user offline:', err);
          }
        }
      }
    });
  });

  return io;
}

export function getIo(): SocketIOServer {
  if (!ioInstance) {
    throw new Error('Socket.IO not initialized');
  }
  return ioInstance;
}
