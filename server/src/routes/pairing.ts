import { Router, Request, Response } from 'express';
import { requireAuth } from '../middleware/auth.js';
import { getDb, getClient } from '../lib/mongodb.js';
import crypto from 'crypto';
import rateLimit from 'express-rate-limit';

const generateLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  message: { error: 'Too many codes generated from this IP, please try again after 15 minutes' }
});

const redeemLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 20,
  message: { error: 'Too many redemption attempts from this IP, please try again after 15 minutes' }
});

const statusLimiter = rateLimit({
  windowMs: 1 * 60 * 1000,
  max: 30, // 30 requests per minute is enough for 1 request every 5 seconds (12 req/min)
  message: { error: 'Too many status checks, please wait a moment' }
});

const router = Router();

const generateCode = () => {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
  let finalResult = '';
  for (let i = 0; i < 8; i++) {
    if (i === 4) finalResult += '-';
    finalResult += chars.charAt(crypto.randomInt(0, chars.length));
  }
  return finalResult;
};

router.post('/generate', requireAuth, generateLimiter, async (req: Request, res: Response) => {
  const user = (req as any).user;
  const db = getDb();
  
  try {
    const existingConversation = await db.collection('conversations').findOne({
      members: user.uid
    });

    if (existingConversation) {
      res.status(400).json({ error: 'You are already paired with someone' });
      return;
    }

    await db.collection('pairingCodes').deleteMany({
      creatorId: user.uid,
      usedAt: null
    });

    const code = generateCode();
    const expiresAt = new Date();
    expiresAt.setMinutes(expiresAt.getMinutes() + 15);

    const newCode = {
      creatorId: user.uid,
      code,
      expiresAt,
      usedAt: null,
      createdAt: new Date()
    };

    await db.collection('pairingCodes').insertOne(newCode);

    res.json(newCode);
  } catch (error) {
    console.error('Error generating pairing code:', error);
    res.status(500).json({ error: 'Failed to generate pairing code' });
  }
});

router.post('/redeem', requireAuth, redeemLimiter, async (req: Request, res: Response) => {
  const user = (req as any).user;
  const { code } = req.body;
  
  if (!code || typeof code !== 'string') {
    res.status(400).json({ error: 'Invalid pairing code format' });
    return;
  }
  
  const cleanCode = code.trim().toUpperCase();
  if (!/^[A-Z0-9]{4}-[A-Z0-9]{4}$/.test(cleanCode)) {
    res.status(400).json({ error: 'Invalid pairing code format' });
    return;
  }

  const client = getClient();
  const db = getDb();
  const session = client.startSession();
  
  try {
    let conversationId: string | null = null;
    
    await session.withTransaction(async () => {
      // 1. Verify code exists, not used, not expired
      const pairingCode = await db.collection('pairingCodes').findOne(
        { code: cleanCode, usedAt: null },
        { session }
      );
      
      if (!pairingCode) {
        throw new Error('INVALID_CODE');
      }
      
      if (new Date() > pairingCode.expiresAt) {
        throw new Error('CODE_EXPIRED');
      }
      
      if (pairingCode.creatorId === user.uid) {
        throw new Error('SELF_PAIR');
      }
      
      // 2. Verify current user not paired
      const currentUserPaired = await db.collection('conversations').findOne(
        { members: user.uid },
        { session }
      );
      
      if (currentUserPaired) {
        throw new Error('CURRENT_USER_PAIRED');
      }
      
      // 3. Verify creator not paired
      const creatorPaired = await db.collection('conversations').findOne(
        { members: pairingCode.creatorId },
        { session }
      );
      
      if (creatorPaired) {
        throw new Error('CREATOR_PAIRED');
      }
      
      // 4. Create conversation
      const newConversation = {
        members: [pairingCode.creatorId, user.uid],
        createdAt: new Date(),
        updatedAt: new Date()
      };
      
      const insertResult = await db.collection('conversations').insertOne(newConversation, { session });
      conversationId = insertResult.insertedId.toString();
      
      // 5. Mark code as used
      await db.collection('pairingCodes').updateOne(
        { _id: pairingCode._id },
        { $set: { usedAt: new Date() } },
        { session }
      );
    });
    
    res.json({
      success: true,
      conversationId
    });
  } catch (error: any) {
    if (error.message === 'INVALID_CODE') {
      res.status(404).json({ error: 'Invalid or already used pairing code' });
      return;
    }
    if (error.message === 'CODE_EXPIRED') {
      res.status(400).json({ error: 'This pairing code has expired' });
      return;
    }
    if (error.message === 'SELF_PAIR') {
      res.status(400).json({ error: 'You cannot pair with yourself' });
      return;
    }
    if (error.message === 'CURRENT_USER_PAIRED') {
      res.status(400).json({ error: 'You are already paired' });
      return;
    }
    if (error.message === 'CREATOR_PAIRED') {
      res.status(400).json({ error: 'The creator of this code is already paired' });
      return;
    }
    
    console.error('Error redeeming pairing code:', error);
    res.status(500).json({ error: 'Failed to redeem pairing code' });
  } finally {
    await session.endSession();
  }
});

router.get('/status', requireAuth, statusLimiter, async (req: Request, res: Response) => {
  const user = (req as any).user;
  const db = getDb();

  try {
    const conversation = await db.collection('conversations').findOne({
      members: user.uid
    });

    if (!conversation) {
      const activeCode = await db.collection('pairingCodes').findOne({
        creatorId: user.uid,
        usedAt: null,
        expiresAt: { $gt: new Date() }
      });
        
      res.json({
        paired: false,
        activeCode: activeCode || null
      });
      return;
    }

    const partnerUid = conversation.members.find((uid: string) => uid !== user.uid);
    
    const partner = await db.collection('users').findOne({ firebaseUid: partnerUid }, {
      projection: { displayName: 1, display_name: 1, username: 1, avatarUrl: 1, online: 1, lastSeen: 1, firebaseUid: 1, _id: 0 }
    });

    const formattedPartner = partner ? {
      ...partner,
      display_name: partner.display_name || partner.displayName || partner.username,
      displayName: partner.displayName || partner.display_name || partner.username
    } : null;

    res.json({
      paired: true,
      conversationId: conversation._id.toString(),
      partner: formattedPartner
    });
  } catch (error) {
    console.error('Error checking pairing status:', error);
    res.status(500).json({ error: 'Failed to check pairing status' });
  }
});

router.post('/unpair', requireAuth, async (req: Request, res: Response) => {
  const user = (req as any).user;
  const db = getDb();

  try {
    const conversation = await db.collection('conversations').findOne({
      members: user.uid
    });

    if (!conversation) {
      return res.status(400).json({ error: 'You are not currently paired' });
    }

    const conversationId = conversation._id.toString();
    const members = conversation.members;

    // Delete conversation
    await db.collection('conversations').deleteOne({ _id: conversation._id });

    // Broadcast unpair event
    try {
      const { getIo } = await import('../socket/index.js');
      const io = getIo();
      if (io) {
        io.to(`conversation:${conversationId}`).emit('pairing:unpaired', { conversationId });
        for (const memberUid of members) {
          io.to(`user:${memberUid}`).emit('pairing:unpaired', { conversationId });
        }
      }
    } catch (socketErr) {
      console.warn('Socket unpair notification note:', socketErr);
    }

    res.json({ success: true, message: 'Successfully unpaired' });
  } catch (error) {
    console.error('Error unpairing:', error);
    res.status(500).json({ error: 'Failed to unpair' });
  }
});

export default router;
