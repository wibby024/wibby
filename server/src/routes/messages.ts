import { Router, Request, Response } from 'express';
import { requireAuth } from '../middleware/auth.js';
import { getDb } from '../lib/mongodb.js';
import { ObjectId } from 'mongodb';
import { z } from 'zod';
import { getIo } from '../socket/index.js';
import rateLimit from 'express-rate-limit';
import { getStorageProvider } from '../services/storage/index.js';
import { serializeMessage } from '../utils/serializer.js';
import { fetchLinkPreview } from '../services/linkPreviewService.js';

const router = Router({ mergeParams: true });

// Message rate limiter (e.g. max 60 messages per minute)
const messageLimiter = rateLimit({
  windowMs: 1 * 60 * 1000,
  max: 60,
  message: { error: 'Too many messages, please slow down' }
});

const editSchema = z.object({
  text: z.string().trim().min(1, 'Message cannot be empty').max(2000, 'Message is too long')
});

const pollOptionSchema = z.object({
  id: z.string(),
  text: z.string().min(1).max(200),
  votes: z.array(z.string()).default([])
});

const locationSchema = z.object({
  latitude: z.number(),
  longitude: z.number(),
  name: z.string().max(200).optional(),
  address: z.string().max(300).optional(),
  isLive: z.boolean().optional(),
  liveUntil: z.string().optional(),
  stoppedAt: z.string().nullable().optional(),
  accuracy: z.number().optional(),
  speed: z.number().nullable().optional(),
  heading: z.number().nullable().optional()
});

const contactSchema = z.object({
  name: z.string().min(1).max(100),
  phone: z.string().max(50).optional(),
  email: z.string().email().optional()
});

const stickerSchema = z.object({
  packId: z.string().optional(),
  stickerId: z.string().optional(),
  url: z.string().url().optional(),
  emoji: z.string().optional()
});

const messageSchema = z.object({
  text: z.string().max(2000, 'Message is too long').default(''),
  type: z.enum(['text', 'image', 'video', 'file', 'audio', 'poll', 'location', 'contact', 'sticker']).default('text'),
  mediaUrl: z.string().optional(),
  mediaKey: z.string().optional(),
  mimeType: z.string().optional(),
  fileName: z.string().optional(),
  fileSize: z.number().optional(),
  thumbnailUrl: z.string().nullable().optional(),
  clientMessageId: z.string().uuid().optional(),
  replyToMessageId: z.string().optional(),
  forwardedFromMessageId: z.string().optional(),
  poll: z.object({
    question: z.string().min(1).max(300),
    options: z.array(pollOptionSchema).min(2).max(10),
    allowMultiple: z.boolean().default(false)
  }).optional(),
  location: locationSchema.optional(),
  contact: contactSchema.optional(),
  sticker: stickerSchema.optional()
}).refine(data => {
  if (data.type === 'text') {
    return data.text.trim().length > 0;
  }
  return true;
}, {
  message: 'Text message cannot be empty',
  path: ['text']
});

const reactionSchema = z.object({
  emoji: z.string().min(1).max(10)
});

// Middleware to verify conversation membership
async function verifyMembership(req: Request, res: Response, next: any) {
  try {
    const conversationId = req.params.conversationId as string;
    const user = (req as any).user;
    const db = getDb();

    if (!ObjectId.isValid(conversationId)) {
      return res.status(400).json({ error: 'Invalid conversation ID' });
    }

    const conversation = await db.collection('conversations').findOne({
      _id: new ObjectId(conversationId)
    });

    if (!conversation) {
      return res.status(404).json({ error: 'Conversation not found' });
    }

    if (!conversation.members.includes(user.uid)) {
      return res.status(403).json({ error: 'Not authorized for this conversation' });
    }

    (req as any).conversation = conversation;
    next();
  } catch (error) {
    console.error('Membership verification error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
}

router.use(requireAuth);
router.use(verifyMembership);

// Link preview resolver endpoint
router.get('/link-preview', async (req: Request, res: Response) => {
  try {
    const url = req.query.url as string;
    if (!url) {
      return res.status(400).json({ error: 'URL is required' });
    }
    const preview = await fetchLinkPreview(url);
    if (!preview) {
      return res.status(404).json({ error: 'No preview available' });
    }
    res.json(preview);
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch link preview' });
  }
});

// Search messages
router.get('/search', async (req: Request, res: Response) => {
  try {
    const conversationId = req.params.conversationId as string;
    const queryStr = typeof req.query.q === 'string' ? req.query.q.trim() : '';
    const typeFilter = req.query.type as string; // 'text' | 'media' | 'file' | 'link'
    const sender = req.query.sender as string;
    const user = (req as any).user;
    const db = getDb();

    const query: any = {
      conversationId: new ObjectId(conversationId),
      deletedFor: { $ne: user.uid },
      deletedAt: null
    };

    if (sender) {
      query.senderId = sender;
    }

    const normalizedFilter = typeFilter?.toLowerCase();
    if (normalizedFilter === 'media') {
      query.type = { $in: ['image', 'video'] };
    } else if (normalizedFilter === 'file' || normalizedFilter === 'files') {
      query.type = { $in: ['file', 'audio', 'document'] };
    } else if (normalizedFilter === 'link' || normalizedFilter === 'links') {
      query.text = { $regex: 'https?://', $options: 'i' };
    } else if (normalizedFilter === 'call' || normalizedFilter === 'calls') {
      query.type = 'call';
    }

    if (queryStr) {
      const escapedQuery = queryStr.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      const textRegex = { $regex: escapedQuery, $options: 'i' };

      if (normalizedFilter === 'link' || normalizedFilter === 'links') {
        // Must contain both the query string and a URL pattern
        query.$and = [
          { text: { $regex: 'https?://', $options: 'i' } },
          { text: textRegex }
        ];
      } else {
        query.$or = [
          { text: textRegex },
          { caption: textRegex },
          { fileName: textRegex }
        ];
      }
    }

    const messages = await db.collection('messages')
      .find(query)
      .sort({ createdAt: -1 })
      .limit(100)
      .toArray();

    res.json({ messages: messages.map(serializeMessage) });
  } catch (error) {
    console.error('Search error:', error);
    res.status(500).json({ error: 'Failed to search messages' });
  }
});

// Shared media aggregate endpoint
router.get('/shared-media', async (req: Request, res: Response) => {
  try {
    const conversationId = req.params.conversationId as string;
    const category = req.query.category as string || 'media'; // 'media' | 'files' | 'links' | 'starred'
    const user = (req as any).user;
    const db = getDb();

    const query: any = {
      conversationId: new ObjectId(conversationId),
      deletedFor: { $ne: user.uid },
      deletedAt: null
    };

    if (category === 'media') {
      query.type = { $in: ['image', 'video'] };
    } else if (category === 'files') {
      query.type = 'file';
    } else if (category === 'links') {
      query.text = { $regex: 'https?://', $options: 'i' };
    } else if (category === 'starred') {
      query.starredBy = user.uid;
    }

    const messages = await db.collection('messages')
      .find(query)
      .sort({ createdAt: -1 })
      .limit(200)
      .toArray();

    res.json({ messages: messages.map(serializeMessage) });
  } catch (error) {
    console.error('Shared media error:', error);
    res.status(500).json({ error: 'Failed to fetch shared media' });
  }
});

// Fetch message history
router.get('/', async (req: Request, res: Response) => {
  try {
    const conversationId = req.params.conversationId as string;
    const user = (req as any).user;
    const conversation = (req as any).conversation;
    const db = getDb();
    
    const limit = Math.min(Number(req.query.limit) || 50, 100);
    const before = req.query.before as string;
    const now = new Date();

    const query: any = {
      conversationId: new ObjectId(conversationId),
      deletedFor: { $ne: user.uid },
      $or: [
        { expiresAt: null },
        { expiresAt: { $gt: now } }
      ]
    };

    const userClearedAt = conversation?.clearedAt?.[user.uid];
    if (userClearedAt) {
      query.createdAt = { $gt: new Date(userClearedAt) };
    }

    if (before && ObjectId.isValid(before)) {
      query._id = { $lt: new ObjectId(before) };
    }

    const messages = await db.collection('messages')
      .find(query)
      .sort({ createdAt: -1 })
      .limit(limit)
      .toArray();

    messages.reverse();

    res.json({ messages: messages.map(serializeMessage) });
  } catch (error) {
    console.error('Get messages error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Clear chat for current user
router.post('/clear', async (req: Request, res: Response) => {
  try {
    const conversationId = req.params.conversationId as string;
    const user = (req as any).user;
    const db = getDb();
    const now = new Date();

    await db.collection('conversations').updateOne(
      { _id: new ObjectId(conversationId) },
      { $set: { [`clearedAt.${user.uid}`]: now } }
    );

    res.json({ success: true, clearedAt: now.toISOString() });
  } catch (error) {
    console.error('Clear chat error:', error);
    res.status(500).json({ error: 'Failed to clear chat' });
  }
});

// Fetch single message by ID
router.get('/:messageId', async (req: Request, res: Response) => {
  try {
    const conversationId = req.params.conversationId as string;
    const messageId = req.params.messageId as string;
    const user = (req as any).user;
    const db = getDb();

    if (!ObjectId.isValid(messageId)) {
      return res.status(400).json({ error: 'Invalid message ID' });
    }

    const message = await db.collection('messages').findOne({
      _id: new ObjectId(messageId),
      conversationId: new ObjectId(conversationId),
      deletedFor: { $ne: user.uid }
    });

    if (!message) {
      return res.status(404).json({ error: 'Message not found' });
    }

    res.json({ message: serializeMessage(message) });
  } catch (error) {
    console.error('Get single message error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Send a message
router.post('/', messageLimiter, async (req: Request, res: Response) => {
  try {
    const conversationId = req.params.conversationId as string;
    const user = (req as any).user;
    const conversation = (req as any).conversation;
    const db = getDb();

    const validatedData = messageSchema.safeParse(req.body);
    if (!validatedData.success) {
      return res.status(400).json({ 
        error: 'Validation failed', 
        details: validatedData.error.issues 
      });
    }

    // Idempotency check
    if (validatedData.data.clientMessageId) {
      const existingMsg = await db.collection('messages').findOne({
        clientMessageId: validatedData.data.clientMessageId,
        senderId: user.uid
      });
      if (existingMsg) {
        return res.status(200).json({ message: serializeMessage(existingMsg) });
      }
    }

    const now = new Date();

    // Disappearing message TTL check
    let expiresAt: Date | null = null;
    if (conversation.disappearingTimer && conversation.disappearingTimer > 0) {
      expiresAt = new Date(now.getTime() + conversation.disappearingTimer * 1000);
    }

    // Optional Smart Link check on text messages
    let linkPreview: any = null;
    if (validatedData.data.type === 'text' && validatedData.data.text) {
      const urlMatch = validatedData.data.text.match(/https?:\/\/[^\s]+/i);
      if (urlMatch) {
        try {
          linkPreview = await fetchLinkPreview(urlMatch[0]);
        } catch {
          linkPreview = null;
        }
      }
    }

    const messageDoc: any = {
      clientMessageId: validatedData.data.clientMessageId || null,
      replyToMessageId: validatedData.data.replyToMessageId ? new ObjectId(validatedData.data.replyToMessageId) : null,
      forwardedFromMessageId: validatedData.data.forwardedFromMessageId ? new ObjectId(validatedData.data.forwardedFromMessageId) : null,
      reactions: [],
      deletedFor: [],
      starredBy: [],
      isPinned: false,
      pinnedAt: null,
      pinnedBy: null,
      conversationId: new ObjectId(conversationId),
      senderId: user.uid,
      type: validatedData.data.type || 'text',
      text: validatedData.data.text || '',
      mediaUrl: validatedData.data.mediaUrl || null,
      mediaKey: validatedData.data.mediaKey || null,
      mimeType: validatedData.data.mimeType || null,
      fileName: validatedData.data.fileName || null,
      fileSize: validatedData.data.fileSize || null,
      thumbnailUrl: validatedData.data.thumbnailUrl || null,
      poll: validatedData.data.poll || null,
      location: validatedData.data.location || null,
      contact: validatedData.data.contact || null,
      sticker: validatedData.data.sticker || null,
      linkPreview,
      createdAt: now,
      updatedAt: now,
      expiresAt,
      editedAt: null,
      deletedAt: null,
      status: 'sent',
      deliveredAt: null,
      seenAt: null
    };

    const result = await db.collection('messages').insertOne(messageDoc);
    
    const serializedMessage = serializeMessage({
      ...messageDoc,
      _id: result.insertedId,
      replyToMessageId: validatedData.data.replyToMessageId || null,
      forwardedFromMessageId: validatedData.data.forwardedFromMessageId || null
    });

    // Update conversation metadata
    await db.collection('conversations').updateOne(
      { _id: new ObjectId(conversationId) },
      { 
        $set: { 
          lastMessageAt: now,
          lastMessageId: result.insertedId,
          updatedAt: now
        } 
      }
    );

    // Broadcast to room
    const io = getIo();
    if (io) {
      const targetRooms: string[] = [`conversation:${conversationId}`];
      if (conversation && Array.isArray(conversation.members)) {
        for (const memberUid of conversation.members) {
          targetRooms.push(`user:${memberUid}`);
        }
      }
      io.to(targetRooms).emit('new_message', serializedMessage);

      io.to(`conversation:${conversationId}`).emit('typing:stop', {
        conversationId,
        userId: user.uid
      });
    }

    res.status(201).json({ message: serializedMessage });
  } catch (error) {
    console.error('Send message error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Vote in poll
router.post('/:messageId/poll/vote', async (req: Request, res: Response) => {
  try {
    const conversationId = req.params.conversationId as string;
    const messageId = req.params.messageId as string;
    const { optionId } = req.body;
    const user = (req as any).user;
    const db = getDb();

    if (!ObjectId.isValid(messageId) || !optionId) {
      return res.status(400).json({ error: 'Invalid messageId or optionId' });
    }

    const msg = await db.collection('messages').findOne({
      _id: new ObjectId(messageId),
      conversationId: new ObjectId(conversationId)
    });

    if (!msg || msg.type !== 'poll' || !msg.poll) {
      return res.status(404).json({ error: 'Poll not found' });
    }

    const poll = msg.poll;
    const allowMultiple = Boolean(poll.allowMultiple);

    // Update options votes
    poll.options = poll.options.map((opt: any) => {
      const alreadyVoted = Array.isArray(opt.votes) && opt.votes.includes(user.uid);
      if (opt.id === optionId) {
        if (alreadyVoted) {
          // Toggle off
          return { ...opt, votes: opt.votes.filter((uid: string) => uid !== user.uid) };
        } else {
          // Add vote
          return { ...opt, votes: [...(opt.votes || []), user.uid] };
        }
      } else if (!allowMultiple) {
        // Remove vote from other options if single-choice
        return { ...opt, votes: Array.isArray(opt.votes) ? opt.votes.filter((uid: string) => uid !== user.uid) : [] };
      }
      return opt;
    });

    await db.collection('messages').updateOne(
      { _id: msg._id },
      { $set: { poll, updatedAt: new Date() } }
    );

    const io = getIo();
    if (io) {
      io.to(`conversation:${conversationId}`).emit('poll:vote', {
        messageId,
        conversationId,
        poll
      });
    }

    res.json({ success: true, poll });
  } catch (error) {
    console.error('Poll vote error:', error);
    res.status(500).json({ error: 'Failed to submit vote' });
  }
});

// Star / Unstar message
router.post('/:messageId/star', async (req: Request, res: Response) => {
  try {
    const conversationId = req.params.conversationId as string;
    const messageId = req.params.messageId as string;
    const user = (req as any).user;
    const db = getDb();

    if (!ObjectId.isValid(messageId)) {
      return res.status(400).json({ error: 'Invalid message ID' });
    }

    const msg = await db.collection('messages').findOne({
      _id: new ObjectId(messageId),
      conversationId: new ObjectId(conversationId)
    });

    if (!msg) {
      return res.status(404).json({ error: 'Message not found' });
    }

    const isStarred = Array.isArray(msg.starredBy) && msg.starredBy.includes(user.uid);

    if (isStarred) {
      await db.collection('messages').updateOne(
        { _id: msg._id },
        { $pull: { starredBy: user.uid } as any }
      );
    } else {
      await db.collection('messages').updateOne(
        { _id: msg._id },
        { $addToSet: { starredBy: user.uid } as any }
      );
    }

    res.json({ success: true, isStarred: !isStarred });
  } catch (error) {
    console.error('Star message error:', error);
    res.status(500).json({ error: 'Failed to toggle star' });
  }
});

// Pin / Unpin message
router.post('/:messageId/pin', async (req: Request, res: Response) => {
  try {
    const conversationId = req.params.conversationId as string;
    const messageId = req.params.messageId as string;
    const user = (req as any).user;
    const db = getDb();

    if (!ObjectId.isValid(messageId)) {
      return res.status(400).json({ error: 'Invalid message ID' });
    }

    const msg = await db.collection('messages').findOne({
      _id: new ObjectId(messageId),
      conversationId: new ObjectId(conversationId)
    });

    if (!msg) {
      return res.status(404).json({ error: 'Message not found' });
    }

    const isCurrentlyPinned = Boolean(msg.isPinned);
    const now = new Date();

    if (isCurrentlyPinned) {
      await db.collection('messages').updateOne(
        { _id: msg._id },
        { $set: { isPinned: false, pinnedAt: null, pinnedBy: null } }
      );
    } else {
      await db.collection('messages').updateOne(
        { _id: msg._id },
        { $set: { isPinned: true, pinnedAt: now, pinnedBy: user.uid } }
      );
    }

    const io = getIo();
    if (io) {
      io.to(`conversation:${conversationId}`).emit(isCurrentlyPinned ? 'message:unpin' : 'message:pin', {
        messageId,
        conversationId,
        isPinned: !isCurrentlyPinned,
        pinnedAt: !isCurrentlyPinned ? now.toISOString() : null,
        pinnedBy: !isCurrentlyPinned ? user.uid : null
      });
    }

    res.json({ success: true, isPinned: !isCurrentlyPinned });
  } catch (error) {
    console.error('Pin message error:', error);
    res.status(500).json({ error: 'Failed to toggle pin' });
  }
});

// Disappearing messages settings
router.post('/disappearing', async (req: Request, res: Response) => {
  try {
    const conversationId = req.params.conversationId as string;
    const { timer } = req.body; // seconds: 0, 86400, 604800, 7776000
    const user = (req as any).user;
    const db = getDb();

    const allowed = [0, 86400, 604800, 7776000];
    if (!allowed.includes(Number(timer))) {
      return res.status(400).json({ error: 'Invalid timer duration' });
    }

    await db.collection('conversations').updateOne(
      { _id: new ObjectId(conversationId) },
      { $set: { disappearingTimer: Number(timer), updatedAt: new Date() } }
    );

    const io = getIo();
    if (io) {
      io.to(`conversation:${conversationId}`).emit('conversation:disappearing', {
        conversationId,
        timer: Number(timer),
        updatedBy: user.uid
      });
    }

    res.json({ success: true, timer: Number(timer) });
  } catch (error) {
    console.error('Disappearing messages error:', error);
    res.status(500).json({ error: 'Failed to set disappearing messages' });
  }
});

// Shared Theme Family setting (Requirement 10 & 17)
router.post('/theme', async (req: Request, res: Response) => {
  try {
    const conversationId = req.params.conversationId as string;
    const { themeFamily } = req.body;
    const user = (req as any).user;
    const db = getDb();

    if (!themeFamily || typeof themeFamily !== 'string') {
      return res.status(400).json({ error: 'Invalid theme family' });
    }

    await db.collection('conversations').updateOne(
      { _id: new ObjectId(conversationId) },
      { $set: { themeFamily, updatedAt: new Date() } }
    );

    const io = getIo();
    if (io) {
      io.to(`conversation:${conversationId}`).emit('conversation:theme-family-update', {
        conversationId,
        themeFamily,
        updatedBy: user?.uid || ''
      });
    }

    res.json({ success: true, themeFamily });
  } catch (error) {
    console.error('Theme family update error:', error);
    res.status(500).json({ error: 'Failed to update theme family' });
  }
});

// Call History endpoint (Req 13)
router.get('/calls', async (req: Request, res: Response) => {
  try {
    const conversationId = req.params.conversationId as string;
    const limit = Math.min(50, Math.max(1, Number(req.query.limit) || 20));
    const db = getDb();
    const convId = new ObjectId(conversationId);

    const calls = await db.collection('calls')
      .find({
        $or: [
          { conversationId: convId },
          { conversationId: conversationId }
        ]
      })
      .sort({ startedAt: -1 })
      .limit(limit)
      .toArray();

    const serializedCalls = calls.map(c => ({
      id: c._id.toString(),
      callId: c.callId,
      conversationId: c.conversationId.toString(),
      callerId: c.callerId,
      calleeId: c.calleeId,
      callType: c.callType || 'voice',
      status: c.status,
      startedAt: c.startedAt,
      connectedAt: c.connectedAt,
      endedAt: c.endedAt,
      duration: c.duration || 0,
      endReason: c.endReason
    }));

    res.json(serializedCalls);
  } catch (error) {
    console.error('Call history fetch error:', error);
    res.status(500).json({ error: 'Failed to fetch call history' });
  }
});

router.post('/:messageId/reactions', requireAuth, verifyMembership, async (req: Request, res: Response) => {
  try {
    const conversationId = req.params.conversationId as string;
    const messageId = req.params.messageId as string;
    const user = (req as any).user;
    const validatedData = reactionSchema.parse(req.body);
    
    const db = getDb();
    const msgObjId = new ObjectId(messageId);
    
    // Remove existing reaction by this user
    await db.collection('messages').updateOne(
      { _id: msgObjId, conversationId: new ObjectId(conversationId) },
      { $pull: { reactions: { senderId: user.uid } } } as any
    );
    
    // Add new reaction if emoji provided
    if (validatedData.emoji) {
      await db.collection('messages').updateOne(
        { _id: msgObjId },
        { $push: { reactions: { senderId: user.uid, emoji: validatedData.emoji } } } as any
      );
    }

    const io = getIo();
    if (io) {
      io.to(`conversation:${conversationId}`).emit('message:reaction', {
        messageId,
        conversationId,
        senderId: user.uid,
        emoji: validatedData.emoji
      });
    }

    res.json({ success: true });
  } catch (error) {
    console.error('Reaction error:', error);
    if (error instanceof z.ZodError) {
      return res.status(400).json({ error: (error as any).errors[0].message });
    }
    res.status(500).json({ error: 'Failed to add reaction' });
  }
});

router.patch('/:messageId', requireAuth, verifyMembership, async (req: Request, res: Response) => {
  try {
    const conversationId = req.params.conversationId as string;
    const messageId = req.params.messageId as string;
    const user = (req as any).user;
    const validatedData = editSchema.parse(req.body);

    const db = getDb();
    const msgObjId = new ObjectId(messageId);

    const existingMsg = await db.collection('messages').findOne({
      _id: msgObjId,
      conversationId: new ObjectId(conversationId)
    });

    if (!existingMsg) return res.status(404).json({ error: 'Not found' });
    if (existingMsg.senderId !== user.uid) return res.status(403).json({ error: 'Unauthorized' });

    // Req 37: Enforce 2-minute edit window (120,000 ms)
    const msgAgeMs = Date.now() - new Date(existingMsg.createdAt).getTime();
    if (msgAgeMs > 120000) {
      return res.status(400).json({ error: 'Messages can only be edited within 2 minutes of sending' });
    }

    const now = new Date();
    await db.collection('messages').updateOne(
      { _id: msgObjId },
      { $set: { text: validatedData.text, editedAt: now, updatedAt: now } }
    );

    const updatedMessage = serializeMessage({
      ...existingMsg,
      text: validatedData.text,
      editedAt: now,
      updatedAt: now
    });

    const io = getIo();
    if (io) {
      io.to(`conversation:${conversationId}`).emit('message:update', updatedMessage);
    }

    res.json({ message: updatedMessage });
  } catch (error) {
    console.error('Edit error:', error);
    if (error instanceof z.ZodError) {
      return res.status(400).json({ error: (error as any).errors[0].message });
    }
    res.status(500).json({ error: 'Failed to edit message' });
  }
});

router.delete('/:messageId', requireAuth, verifyMembership, async (req: Request, res: Response) => {
  try {
    const conversationId = req.params.conversationId as string;
    const messageId = req.params.messageId as string;
    const everyone = req.query.everyone === 'true';
    const user = (req as any).user;

    const db = getDb();
    const msgObjId = new ObjectId(messageId);

    const existingMsg = await db.collection('messages').findOne({
      _id: msgObjId,
      conversationId: new ObjectId(conversationId)
    });

    if (!existingMsg) return res.status(404).json({ error: 'Not found' });

    const io = getIo();
    const now = new Date();

    if (everyone) {
      if (existingMsg.senderId !== user.uid) {
        return res.status(403).json({ error: 'Only the sender can delete for everyone' });
      }

      await db.collection('messages').updateOne(
        { _id: msgObjId },
        { $set: { deletedAt: now, text: 'This message was deleted' } }
      );

      if (existingMsg.mediaKey) {
        getStorageProvider().delete(existingMsg.mediaKey).catch(err => {
          console.warn('Failed to delete media from storage on delete-for-everyone:', err);
        });
      }

      if (io) {
        io.to(`conversation:${conversationId}`).emit('message:delete', {
          messageId,
          conversationId,
          everyone: true,
          deletedAt: now
        });
      }

    } else {
      await db.collection('messages').updateOne(
        { _id: msgObjId },
        { $addToSet: { deletedFor: user.uid } as any }
      );

      // Req 09: Notify user's connected clients to remove the message immediately from local view
      if (io) {
        io.to(`user:${user.uid}`).emit('message:delete', {
          messageId,
          conversationId,
          everyone: false,
          deletedAt: now
        });
      }
    }

    res.json({ success: true, everyone });
  } catch (error) {
    console.error('Delete error:', error);
    res.status(500).json({ error: 'Failed to delete message' });
  }
});

// Stop Live Location
router.post('/:messageId/stop-live', requireAuth, async (req: Request, res: Response) => {
  try {
    const user = (req as any).user;
    const conversationId = req.params.conversationId as string;
    const messageId = req.params.messageId as string;
    const db = getDb();
    const msgObjId = new ObjectId(messageId);

    const existingMsg = await db.collection('messages').findOne({
      _id: msgObjId,
      conversationId: new ObjectId(conversationId)
    });

    if (!existingMsg) return res.status(404).json({ error: 'Message not found' });
    if (existingMsg.senderId !== user.uid) {
      return res.status(403).json({ error: 'Only the sender can stop live location' });
    }

    const stoppedAt = new Date().toISOString();
    await db.collection('messages').updateOne(
      { _id: msgObjId },
      { $set: { 'location.stoppedAt': stoppedAt } }
    );

    const io = getIo();
    if (io) {
      io.to(`conversation:${conversationId}`).emit('location:live_stop', {
        conversationId,
        messageId,
        stoppedAt
      });
    }

    res.json({ success: true, stoppedAt });
  } catch (err) {
    console.error('Stop live location error:', err);
    res.status(500).json({ error: 'Failed to stop live location' });
  }
});

export default router;
