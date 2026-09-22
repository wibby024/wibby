import { Server as SocketIOServer, Socket } from 'socket.io';
import { ObjectId } from 'mongodb';
import { getDb } from '../lib/mongodb.js';
import { serializeMessage } from '../utils/serializer.js';
import { CALL_RECONNECT_GRACE_PERIOD_MS } from '../config/callConfig.js';

export interface ActiveCallSession {
  callId: string;
  conversationId: string;
  callerId: string;
  calleeId: string;
  callType: 'voice' | 'video';
  callerSessionId: string;
  calleeSessionId: string;
  callerSocketId?: string;
  calleeSocketId?: string;
  startedAt: Date;
  connectedAt: Date | null;
  status: 'ringing' | 'connected' | 'reconnecting';
  reconnectUntil: Date | null;
  recoveryTimeout?: NodeJS.Timeout | null;
}

// In-memory call sessions
const activeCalls = new Map<string, ActiveCallSession>();
const userActiveCall = new Map<string, string>(); // maps userId -> callId

export function getActiveCallByUserId(userId: string): ActiveCallSession | null {
  const callId = userActiveCall.get(userId);
  if (!callId) return null;
  return activeCalls.get(callId) || null;
}

export function registerCallHandlers(
  io: SocketIOServer,
  socket: Socket,
  userSockets: Map<string, Set<string>>
) {
  const uid = socket.data.uid;
  if (!uid) return;

  /**
   * Helper to persist call termination & create a timeline message in chat
   */
  const endCallSession = async (
    session: ActiveCallSession,
    status: 'completed' | 'declined' | 'cancelled' | 'missed' | 'failed' | 'busy',
    endReason: string
  ) => {
    if (session.recoveryTimeout) {
      clearTimeout(session.recoveryTimeout);
      session.recoveryTimeout = null;
    }

    activeCalls.delete(session.callId);
    userActiveCall.delete(session.callerId);
    userActiveCall.delete(session.calleeId);

    const endedAt = new Date();
    const duration = session.connectedAt
      ? Math.max(0, Math.round((endedAt.getTime() - session.connectedAt.getTime()) / 1000))
      : 0;

    try {
      const db = getDb();
      const convId = new ObjectId(session.conversationId);

      // 1. Upsert call in calls collection (avoid duplicate history entries)
      await db.collection('calls').updateOne(
        { callId: session.callId },
        {
          $set: {
            callId: session.callId,
            conversationId: convId,
            callerId: session.callerId,
            calleeId: session.calleeId,
            callType: session.callType,
            status,
            startedAt: session.startedAt,
            connectedAt: session.connectedAt,
            endedAt,
            duration,
            endReason,
            reconnectUntil: null
          }
        },
        { upsert: true }
      );

      // 2. Insert lightweight call log in messages collection
      const isVideo = session.callType === 'video';
      let callText = isVideo ? 'Video call' : 'Voice call';
      if (status === 'missed') callText = isVideo ? 'Missed video call' : 'Missed voice call';
      else if (status === 'declined') callText = isVideo ? 'Declined video call' : 'Declined voice call';
      else if (status === 'cancelled') callText = isVideo ? 'Cancelled video call' : 'Cancelled voice call';

      const callMessageDoc = {
        conversationId: convId,
        senderId: session.callerId,
        type: 'call',
        text: callText,
        duration: duration,
        status: 'sent',
        createdAt: endedAt
      };

      const insertRes = await db.collection('messages').insertOne(callMessageDoc);
      const savedMessage = await db.collection('messages').findOne({ _id: insertRes.insertedId });

      if (savedMessage) {
        const serialized = serializeMessage(savedMessage);
        io.to(`conversation:${session.conversationId}`).emit('new_message', serialized);
      }
    } catch (err) {
      console.error('[WIBBY CALL] Error persisting call history:', err);
    }

    // Notify both participants
    io.to(`user:${session.callerId}`).emit('call:ended', {
      callId: session.callId,
      reason: endReason,
      status,
      duration
    });
    io.to(`user:${session.calleeId}`).emit('call:ended', {
      callId: session.callId,
      reason: endReason,
      status,
      duration
    });
  };

  /**
   * Stale session verification helper
   */
  const isSessionValid = (session: ActiveCallSession, incomingSessionId?: string): boolean => {
    if (!incomingSessionId) return true;
    const expected = session.callerId === uid ? session.callerSessionId : session.calleeSessionId;
    if (expected && incomingSessionId !== expected) {
      console.warn(`[WIBBY CALL] Rejecting signaling from stale session: ${incomingSessionId} (current: ${expected})`);
      socket.emit('call:session-superseded', { callId: session.callId, currentSessionId: expected });
      return false;
    }
    return true;
  };

  // 1. Call Invite (A calls B)
  socket.on(
    'call:invite',
    async (data: {
      callId: string;
      conversationId: string;
      callType?: 'voice' | 'video';
      sessionId?: string;
    }) => {
      try {
        if (!data?.callId || !data?.conversationId) {
          return socket.emit('call:failed', { message: 'callId and conversationId are required' });
        }

        const callType: 'voice' | 'video' = data.callType === 'video' ? 'video' : 'voice';
        console.log(`[WIBBY CALL] Call invite initiated: callId=${data.callId}, caller=${uid}, type=${callType}`);

        // Check if caller is already in an active call
        const callerActiveCallId = userActiveCall.get(uid);
        if (callerActiveCallId) {
          const oldSession = activeCalls.get(callerActiveCallId);
          if (oldSession && oldSession.status === 'reconnecting') {
            console.log(`[WIBBY CALL] Caller ${uid} starting new call; terminating previous reconnecting call ${callerActiveCallId}`);
            await endCallSession(oldSession, 'completed', 'superseded');
          } else if (oldSession) {
            return socket.emit('call:failed', {
              callId: data.callId,
              message: 'You are already in an active call'
            });
          } else {
            userActiveCall.delete(uid);
          }
        }

        const db = getDb();
        let convObjectId: ObjectId;
        try {
          convObjectId = new ObjectId(data.conversationId);
        } catch {
          return socket.emit('call:failed', { callId: data.callId, message: 'Invalid conversation ID' });
        }

        const conversation = await db.collection('conversations').findOne({ _id: convObjectId });
        if (!conversation || !conversation.members.includes(uid)) {
          return socket.emit('call:failed', { callId: data.callId, message: 'Not authorized for this conversation' });
        }

        const calleeId = conversation.members.find((m: string) => m !== uid);
        if (!calleeId) {
          return socket.emit('call:failed', { callId: data.callId, message: 'Recipient not found in conversation' });
        }

        // Check if callee is already in another call
        const calleeActiveCallId = userActiveCall.get(calleeId);
        if (calleeActiveCallId) {
          const calleeSession = activeCalls.get(calleeActiveCallId);
          if (calleeSession && calleeSession.status === 'reconnecting') {
            console.log(`[WIBBY CALL] Callee ${calleeId} was in reconnecting call ${calleeActiveCallId}; terminating old call`);
            await endCallSession(calleeSession, 'completed', 'superseded');
          } else if (calleeSession) {
            console.log(`[WIBBY CALL] Callee ${calleeId} is busy`);
            return socket.emit('call:busy', {
              callId: data.callId,
              recipientId: calleeId,
              message: 'User is currently on another call'
            });
          } else {
            userActiveCall.delete(calleeId);
          }
        }

        // Check if callee has active socket connections
        const calleeSockets = userSockets.get(calleeId);
        const isCalleeOnline = calleeSockets && calleeSockets.size > 0;

        if (!isCalleeOnline) {
          console.log(`[WIBBY CALL] Callee ${calleeId} is offline`);
          // Record missed call immediately
          await endCallSession(
            {
              callId: data.callId,
              conversationId: data.conversationId,
              callerId: uid,
              calleeId,
              callType,
              callerSessionId: data.sessionId || `session_${Date.now()}`,
              calleeSessionId: '',
              startedAt: new Date(),
              connectedAt: null,
              status: 'ringing',
              reconnectUntil: null
            },
            'missed',
            'offline'
          );
          return socket.emit('call:failed', {
            callId: data.callId,
            reason: 'offline',
            message: 'User is currently offline'
          });
        }

        // Fetch caller profile info
        const callerUser = await db.collection('users').findOne({ firebaseUid: uid });
        const callerName = callerUser?.displayName || callerUser?.display_name || callerUser?.name || callerUser?.username || 'Partner';
        const callerAvatar = callerUser?.avatarUrl || callerUser?.avatar || null;

        const session: ActiveCallSession = {
          callId: data.callId,
          conversationId: data.conversationId,
          callerId: uid,
          calleeId,
          callType,
          callerSessionId: data.sessionId || `session_${Date.now()}`,
          calleeSessionId: '',
          callerSocketId: socket.id,
          calleeSocketId: undefined,
          startedAt: new Date(),
          connectedAt: null,
          status: 'ringing',
          reconnectUntil: null
        };

        activeCalls.set(data.callId, session);
        userActiveCall.set(uid, data.callId);
        userActiveCall.set(calleeId, data.callId);

        // Pre-persist to calls collection
        await db.collection('calls').updateOne(
          { callId: data.callId },
          {
            $set: {
              callId: data.callId,
              conversationId: convObjectId,
              callerId: uid,
              calleeId,
              callType,
              callerSessionId: session.callerSessionId,
              status: 'ringing',
              startedAt: session.startedAt,
              connectedAt: null,
              endedAt: null
            }
          },
          { upsert: true }
        );

        // Notify caller that call is ringing
        socket.emit('call:ringing', {
          callId: data.callId,
          recipientId: calleeId,
          callType
        });

        // Dispatch invite to callee
        io.to(`user:${calleeId}`).emit('call:invite', {
          callId: data.callId,
          conversationId: data.conversationId,
          callerId: uid,
          callerName,
          callerUsername: callerUser?.username || '',
          callerAvatar,
          callType
        });

        console.log(`[WIBBY CALL] Call invite sent to user:${calleeId} for call ${data.callId} (${callType})`);
      } catch (err) {
        console.error('[WIBBY CALL] Error in call:invite:', err);
        socket.emit('call:failed', { callId: data?.callId, message: 'Internal server error processing call invite' });
      }
    }
  );

  // 2. Call Accept (B accepts)
  socket.on('call:accept', async (data: { callId: string; sessionId?: string }) => {
    try {
      if (!data?.callId) return;
      const session = activeCalls.get(data.callId);
      if (!session) {
        return socket.emit('call:failed', { callId: data.callId, message: 'Call not found or already ended' });
      }

      if (session.calleeId !== uid) {
        return socket.emit('call:failed', { callId: data.callId, message: 'Not authorized to accept this call' });
      }

      session.status = 'connected';
      session.connectedAt = new Date();
      session.calleeSessionId = data.sessionId || `session_${Date.now()}`;
      session.calleeSocketId = socket.id;

      console.log(`[WIBBY CALL] Call accepted: callId=${data.callId} by callee=${uid} (${session.callType})`);

      // Update call in MongoDB
      const db = getDb();
      await db.collection('calls').updateOne(
        { callId: session.callId },
        {
          $set: {
            status: 'connected',
            connectedAt: session.connectedAt,
            calleeSessionId: session.calleeSessionId
          }
        }
      );

      // Notify caller and callee that call is accepted and negotiation should begin
      io.to(`user:${session.callerId}`).emit('call:accepted', {
        callId: session.callId,
        calleeId: uid,
        callType: session.callType,
        callerSessionId: session.callerSessionId,
        calleeSessionId: session.calleeSessionId
      });
      io.to(`user:${session.calleeId}`).emit('call:accepted', {
        callId: session.callId,
        callerId: session.callerId,
        callType: session.callType,
        callerSessionId: session.callerSessionId,
        calleeSessionId: session.calleeSessionId
      });
    } catch (err) {
      console.error('[WIBBY CALL] Error in call:accept:', err);
    }
  });

  // 3. Call Reject (B declines)
  socket.on('call:reject', async (data: { callId: string; reason?: string }) => {
    try {
      if (!data?.callId) return;
      const session = activeCalls.get(data.callId);
      if (!session) return;

      if (session.calleeId !== uid && session.callerId !== uid) return;

      console.log(`[WIBBY CALL] Call rejected: callId=${data.callId} by user=${uid}`);
      await endCallSession(session, 'declined', data.reason || 'declined');
    } catch (err) {
      console.error('[WIBBY CALL] Error in call:reject:', err);
    }
  });

  // 4. WebRTC Offer
  socket.on('call:offer', (data: { callId: string; sdp: RTCSessionDescriptionInit; sessionId?: string }) => {
    try {
      if (!data?.callId || !data?.sdp) return;
      const session = activeCalls.get(data.callId);
      if (!session) return;

      if (!isSessionValid(session, data.sessionId)) return;

      const targetId = session.callerId === uid ? session.calleeId : session.callerId;
      console.log(`[WIBBY CALL] Relaying SDP Offer for callId=${data.callId} to user:${targetId}`);

      io.to(`user:${targetId}`).emit('call:offer', {
        callId: data.callId,
        sdp: data.sdp,
        senderId: uid,
        sessionId: data.sessionId
      });
    } catch (err) {
      console.error('[WIBBY CALL] Error in call:offer:', err);
    }
  });

  // 5. WebRTC Answer
  socket.on('call:answer', (data: { callId: string; sdp: RTCSessionDescriptionInit; sessionId?: string }) => {
    try {
      if (!data?.callId || !data?.sdp) return;
      const session = activeCalls.get(data.callId);
      if (!session) return;

      if (!isSessionValid(session, data.sessionId)) return;

      const targetId = session.callerId === uid ? session.calleeId : session.callerId;
      console.log(`[WIBBY CALL] Relaying SDP Answer for callId=${data.callId} to user:${targetId}`);

      io.to(`user:${targetId}`).emit('call:answer', {
        callId: data.callId,
        sdp: data.sdp,
        senderId: uid,
        sessionId: data.sessionId
      });
    } catch (err) {
      console.error('[WIBBY CALL] Error in call:answer:', err);
    }
  });

  // 6. ICE Candidate Exchange
  socket.on('call:ice-candidate', (data: { callId: string; candidate: RTCIceCandidateInit; sessionId?: string }) => {
    try {
      if (!data?.callId || !data?.candidate) return;
      const session = activeCalls.get(data.callId);
      if (!session) return;

      if (!isSessionValid(session, data.sessionId)) return;

      const targetId = session.callerId === uid ? session.calleeId : session.callerId;
      io.to(`user:${targetId}`).emit('call:ice-candidate', {
        callId: data.callId,
        candidate: data.candidate,
        senderId: uid,
        sessionId: data.sessionId
      });
    } catch (err) {
      console.error('[WIBBY CALL] Error in call:ice-candidate:', err);
    }
  });

  // 7. Mute status relay
  socket.on('call:mute', (data: { callId: string; isMuted: boolean; sessionId?: string }) => {
    try {
      if (!data?.callId) return;
      const session = activeCalls.get(data.callId);
      if (!session) return;

      if (!isSessionValid(session, data.sessionId)) return;

      const targetId = session.callerId === uid ? session.calleeId : session.callerId;
      io.to(`user:${targetId}`).emit('call:mute', {
        callId: data.callId,
        isMuted: Boolean(data.isMuted),
        userId: uid
      });
    } catch (err) {
      console.error('[WIBBY CALL] Error in call:mute:', err);
    }
  });

  // 8. Camera Toggle relay (Phase 9 Video)
  socket.on('call:camera-toggle', (data: { callId: string; isCameraOff: boolean; sessionId?: string }) => {
    try {
      if (!data?.callId) return;
      const session = activeCalls.get(data.callId);
      if (!session) return;

      if (!isSessionValid(session, data.sessionId)) return;

      const targetId = session.callerId === uid ? session.calleeId : session.callerId;
      console.log(`[WIBBY CALL] Camera toggle for callId=${data.callId}, user=${uid}, isCameraOff=${data.isCameraOff}`);

      io.to(`user:${targetId}`).emit('call:camera-toggle', {
        callId: data.callId,
        userId: uid,
        isCameraOff: Boolean(data.isCameraOff)
      });
    } catch (err) {
      console.error('[WIBBY CALL] Error in call:camera-toggle:', err);
    }
  });

  // 8b. Screen Share Toggle relay
  socket.on('call:screenshare-toggle', (data: { callId: string; isSharing: boolean; sessionId?: string }) => {
    try {
      if (!data?.callId) return;
      const session = activeCalls.get(data.callId);
      if (!session) return;

      if (!isSessionValid(session, data.sessionId)) return;

      const targetId = session.callerId === uid ? session.calleeId : session.callerId;
      console.log(`[WIBBY CALL] Screen share toggle for callId=${data.callId}, user=${uid}, isSharing=${data.isSharing}`);

      socket.to(`user:${targetId}`).emit('call:screenshare-toggle', {
        callId: data.callId,
        userId: uid,
        isSharing: Boolean(data.isSharing)
      });
    } catch (err) {
      console.error('[WIBBY CALL] Error in call:screenshare-toggle:', err);
    }
  });

  // 9. Check Recoverable Calls (Session Rehydration query)
  socket.on('call:check-recoverable', async () => {
    try {
      let recoverableSession = getActiveCallByUserId(uid);

      // If not in-memory (e.g. server restarted), query MongoDB
      if (!recoverableSession) {
        const db = getDb();
        const now = new Date();
        const dbCall = await db.collection('calls').findOne({
          $or: [{ callerId: uid }, { calleeId: uid }],
          status: 'reconnecting',
          reconnectUntil: { $gt: now }
        });

        if (dbCall) {
          recoverableSession = {
            callId: dbCall.callId,
            conversationId: dbCall.conversationId.toString(),
            callerId: dbCall.callerId,
            calleeId: dbCall.calleeId,
            callType: dbCall.callType || 'voice',
            callerSessionId: dbCall.callerSessionId || '',
            calleeSessionId: dbCall.calleeSessionId || '',
            startedAt: dbCall.startedAt,
            connectedAt: dbCall.connectedAt,
            status: 'reconnecting',
            reconnectUntil: dbCall.reconnectUntil
          };
          activeCalls.set(dbCall.callId, recoverableSession);
          userActiveCall.set(dbCall.callerId, dbCall.callId);
          userActiveCall.set(dbCall.calleeId, dbCall.callId);
        }
      }

      if (recoverableSession && recoverableSession.status === 'reconnecting') {
        const now = new Date();
        if (recoverableSession.reconnectUntil && recoverableSession.reconnectUntil > now) {
          const partnerId = recoverableSession.callerId === uid ? recoverableSession.calleeId : recoverableSession.callerId;
          const db = getDb();
          const partnerUser = await db.collection('users').findOne({ firebaseUid: partnerId });
          const partnerName = partnerUser?.displayName || partnerUser?.display_name || partnerUser?.name || partnerUser?.username || 'Partner';
          const partnerAvatar = partnerUser?.avatarUrl || partnerUser?.avatar || null;

          console.log(`[WIBBY CALL] Found recoverable call for user ${uid}: ${recoverableSession.callId}`);
          socket.emit('call:recoverable', {
            callId: recoverableSession.callId,
            conversationId: recoverableSession.conversationId,
            callType: recoverableSession.callType,
            callerId: recoverableSession.callerId,
            calleeId: recoverableSession.calleeId,
            startedAt: recoverableSession.startedAt,
            connectedAt: recoverableSession.connectedAt,
            partner: {
              id: partnerId,
              name: partnerName,
              avatar: partnerAvatar
            },
            reconnectUntil: recoverableSession.reconnectUntil
          });
        }
      }
    } catch (err) {
      console.error('[WIBBY CALL] Error in call:check-recoverable:', err);
    }
  });

  // 9b. Verify Active Call Liveness (Req 04: client reconnect check)
  socket.on('call:verify-active', async (data: { callId: string }) => {
    try {
      if (!data?.callId) return;
      const session = activeCalls.get(data.callId);
      if (!session || (session.status as string) === 'ended') {
        console.log(`[WIBBY CALL] call:verify-active: call ${data.callId} is no longer active. Notifying user ${uid}`);
        socket.emit('call:ended', { callId: data.callId, reason: 'Call already ended or expired' });
      }
    } catch (err) {
      console.error('[WIBBY CALL] Error in call:verify-active:', err);
    }
  });

  // 10. Reconnect Call (Participant returns and rehydrates logical call)
  socket.on(
    'call:reconnect',
    async (data: {
      callId: string;
      conversationId: string;
      sessionId: string;
    }) => {
      try {
        if (!data?.callId || !data?.sessionId) {
          return socket.emit('call:failed', { message: 'callId and sessionId are required' });
        }

        console.log(`[WIBBY CALL] Reconnect attempt for callId=${data.callId} by user=${uid}, newSessionId=${data.sessionId}`);

        let session = activeCalls.get(data.callId);

        // Fallback check from DB
        if (!session) {
          const db = getDb();
          const now = new Date();
          const dbCall = await db.collection('calls').findOne({
            callId: data.callId,
            $or: [{ callerId: uid }, { calleeId: uid }],
            reconnectUntil: { $gt: now }
          });

          if (dbCall) {
            session = {
              callId: dbCall.callId,
              conversationId: dbCall.conversationId.toString(),
              callerId: dbCall.callerId,
              calleeId: dbCall.calleeId,
              callType: dbCall.callType || 'voice',
              callerSessionId: dbCall.callerSessionId || '',
              calleeSessionId: dbCall.calleeSessionId || '',
              startedAt: dbCall.startedAt,
              connectedAt: dbCall.connectedAt,
              status: 'reconnecting',
              reconnectUntil: dbCall.reconnectUntil
            };
            activeCalls.set(dbCall.callId, session);
            userActiveCall.set(dbCall.callerId, dbCall.callId);
            userActiveCall.set(dbCall.calleeId, dbCall.callId);
          }
        }

        if (!session) {
          return socket.emit('call:failed', {
            callId: data.callId,
            message: 'Call session not found or recovery window has expired'
          });
        }

        if (session.callerId !== uid && session.calleeId !== uid) {
          return socket.emit('call:failed', {
            callId: data.callId,
            message: 'Not authorized for this call'
          });
        }

        // Cancel recovery timeout
        if (session.recoveryTimeout) {
          clearTimeout(session.recoveryTimeout);
          session.recoveryTimeout = null;
        }

        // Update transport session ID and socket ID for the returning user
        if (session.callerId === uid) {
          session.callerSessionId = data.sessionId;
          session.callerSocketId = socket.id;
        } else {
          session.calleeSessionId = data.sessionId;
          session.calleeSocketId = socket.id;
        }

        session.status = 'connected';
        session.reconnectUntil = null;

        // Update DB
        const db = getDb();
        await db.collection('calls').updateOne(
          { callId: session.callId },
          {
            $set: {
              status: 'connected',
              reconnectUntil: null,
              callerSessionId: session.callerSessionId,
              calleeSessionId: session.calleeSessionId
            }
          }
        );

        console.log(`[WIBBY CALL] Call ${session.callId} successfully reconnected by user ${uid}. Preserving callId.`);

        const partnerId = session.callerId === uid ? session.calleeId : session.callerId;

        // Broadcast to both peers that the session is restored and fresh WebRTC transport should be negotiated
        io.to(`user:${session.callerId}`).emit('call:peer-reconnected', {
          callId: session.callId,
          callType: session.callType,
          reconnectedUserId: uid,
          callerId: session.callerId,
          calleeId: session.calleeId,
          callerSessionId: session.callerSessionId,
          calleeSessionId: session.calleeSessionId,
          startedAt: session.startedAt,
          connectedAt: session.connectedAt
        });

        io.to(`user:${session.calleeId}`).emit('call:peer-reconnected', {
          callId: session.callId,
          callType: session.callType,
          reconnectedUserId: uid,
          callerId: session.callerId,
          calleeId: session.calleeId,
          callerSessionId: session.callerSessionId,
          calleeSessionId: session.calleeSessionId,
          startedAt: session.startedAt,
          connectedAt: session.connectedAt
        });

      } catch (err) {
        console.error('[WIBBY CALL] Error in call:reconnect:', err);
        socket.emit('call:failed', { callId: data?.callId, message: 'Internal server error during call reconnect' });
      }
    }
  );

  // 11. Call Hangup / Cancel
  socket.on('call:hangup', async (data: { callId: string; reason?: string; sessionId?: string }) => {
    try {
      if (!data?.callId) return;
      const session = activeCalls.get(data.callId);
      if (!session) return;

      if (!isSessionValid(session, data.sessionId)) return;

      if (session.callerId !== uid && session.calleeId !== uid) return;

      console.log(`[WIBBY CALL] Hangup request: callId=${data.callId} by user=${uid}`);
      const status = session.connectedAt ? 'completed' : (session.callerId === uid ? 'cancelled' : 'missed');
      await endCallSession(session, status, data.reason || 'hangup');
    } catch (err) {
      console.error('[WIBBY CALL] Error in call:hangup:', err);
    }
  });

  // 11b. Dismiss Recoverable Call (User chooses not to resume)
  socket.on('call:dismiss-recoverable', async (data: { callId: string }) => {
    try {
      if (!data?.callId) return;
      const session = activeCalls.get(data.callId);
      if (session) {
        if (session.callerId === uid || session.calleeId === uid) {
          console.log(`[WIBBY CALL] User ${uid} dismissed recoverable call ${data.callId}`);
          await endCallSession(session, 'completed', 'dismissed');
        }
      } else {
        const db = getDb();
        const callDoc = await db.collection('calls').findOneAndUpdate(
          { callId: data.callId, $or: [{ callerId: uid }, { calleeId: uid }] },
          { $set: { status: 'completed', endedAt: new Date(), endReason: 'dismissed' } },
          { returnDocument: 'after' }
        );
        userActiveCall.delete(uid);
        if (callDoc) {
          const partnerId = (callDoc as any).callerId === uid ? (callDoc as any).calleeId : (callDoc as any).callerId;
          if (partnerId) {
            userActiveCall.delete(partnerId);
          }
        }
      }
    } catch (err) {
      console.error('[WIBBY CALL] Error in call:dismiss-recoverable:', err);
    }
  });

  // 12. Socket Disconnect — Persistent Recovery Window Handling
  socket.on('disconnect', async () => {
    const activeCallId = userActiveCall.get(uid);
    if (!activeCallId) return;

    const session = activeCalls.get(activeCallId);
    if (!session) return;

    // Only proceed if this disconnecting socket was the active participant in the call,
    // or if the user has no other sockets at all.
    const isCallSocket = (session.callerId === uid && session.callerSocketId === socket.id) ||
                         (session.calleeId === uid && session.calleeSocketId === socket.id);
    
    // Check if user has other active sockets (excluding this disconnecting socket)
    const sockets = userSockets.get(uid);
    const hasOtherSockets = sockets && Array.from(sockets).some(id => id !== socket.id);

    // If it wasn't the call socket AND user still has other sockets, ignore
    if (!isCallSocket && hasOtherSockets) {
      console.log(`[WIBBY CALL] User ${uid} non-call socket ${socket.id} disconnected; call ${activeCallId} intact`);
      return;
    }

    if (session.status === 'connected') {
      console.log(`[WIBBY CALL] User ${uid} disconnected from active call ${activeCallId}. Entering ${CALL_RECONNECT_GRACE_PERIOD_MS / 1000}s recovery window.`);
      session.status = 'reconnecting';
      const reconnectUntil = new Date(Date.now() + CALL_RECONNECT_GRACE_PERIOD_MS);
      session.reconnectUntil = reconnectUntil;

      // Update call in DB
      try {
        const db = getDb();
        await db.collection('calls').updateOne(
          { callId: session.callId },
          {
            $set: {
              status: 'reconnecting',
              reconnectUntil
            }
          }
        );
      } catch (dbErr) {
        console.warn('[WIBBY CALL] Error updating reconnecting status in DB:', dbErr);
      }

      // Notify the partner who remains connected
      const targetId = session.callerId === uid ? session.calleeId : session.callerId;
      io.to(`user:${targetId}`).emit('call:peer-reconnecting', {
        callId: session.callId,
        disconnectedUserId: uid,
        status: 'reconnecting',
        message: 'Connection lost'
      });

      // Clear any existing recovery timer
      if (session.recoveryTimeout) {
        clearTimeout(session.recoveryTimeout);
      }

      // Start grace period timeout
      session.recoveryTimeout = setTimeout(async () => {
        if (session.status === 'reconnecting') {
          console.log(`[WIBBY CALL] Recovery grace window expired for call ${session.callId}. Finalizing call.`);
          await endCallSession(session, 'completed', 'reconnect_timeout');
        }
      }, CALL_RECONNECT_GRACE_PERIOD_MS);

    } else if (session.status === 'ringing') {
      console.log(`[WIBBY CALL] User ${uid} disconnected during ringing state. Ending call ${activeCallId}.`);
      const status = session.callerId === uid ? 'cancelled' : 'missed';
      await endCallSession(session, status, 'disconnected');
    }
  });
}
