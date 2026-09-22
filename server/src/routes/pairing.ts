import { Router, Request, Response } from 'express';
import { requireAuth } from '../middleware/auth.js';
import { getDb, getClient } from '../lib/mongodb.js';
import { auth as adminAuth } from '../lib/firebaseAdmin.js';
import { isUserOnline } from '../socket/index.js';
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
        themeFamily: 'classic',
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
    
    let partner = partnerUid ? await db.collection('users').findOne({ firebaseUid: partnerUid }) : null;

    const isBadValue = (val: any): boolean => {
      if (!val || typeof val !== 'string') return true;
      const n = val.trim().toLowerCase();
      return n === '' || n === 'partner' || n === 'unknown' || n === 'wibby user' || n === 'user' || n === 'you' || n === 'null' || n === 'undefined';
    };

    const capitalize = (str: string) => {
      if (!str) return '';
      const t = str.trim();
      return t.charAt(0).toUpperCase() + t.slice(1);
    };

    const candidateName = partner?.displayName || partner?.display_name;
    const isBadCandidateName = isBadValue(candidateName);
    const candidateUsername = partner?.username;
    const isBadCandidateUsername = isBadValue(candidateUsername);

    let resolvedPartnerName = !isBadCandidateName ? candidateName.trim() : '';
    let partnerUsername = !isBadCandidateUsername ? candidateUsername.trim().replace(/^@+/, '').toLowerCase() : '';
    let partnerEmail = partner?.email || '';

    // If partner is not found in MongoDB OR has a generic placeholder name/username, consult Firebase Admin Auth
    if (partnerUid && (!partner || isBadCandidateName || isBadCandidateUsername || !partnerEmail)) {
      try {
        const userRecord = await adminAuth.getUser(partnerUid);
        if (userRecord) {
          const firebaseEmail = userRecord.email?.trim() || '';
          const emailPrefix = firebaseEmail ? firebaseEmail.split('@')[0] : '';
          const firebaseName = userRecord.displayName?.trim() || '';
          if (firebaseEmail && !partnerEmail) {
            partnerEmail = firebaseEmail;
          }

          if (isBadValue(resolvedPartnerName)) {
            if (!isBadValue(firebaseName)) {
              resolvedPartnerName = firebaseName;
            } else if (!isBadValue(partnerUsername)) {
              resolvedPartnerName = capitalize(partnerUsername);
            } else if (!isBadValue(emailPrefix)) {
              resolvedPartnerName = capitalize(emailPrefix);
            }
          }

          if (isBadValue(partnerUsername)) {
            if (!isBadValue(emailPrefix)) {
              partnerUsername = emailPrefix.toLowerCase().replace(/[^a-z0-9_]/g, '');
            } else if (!isBadValue(firebaseName)) {
              partnerUsername = firebaseName.toLowerCase().replace(/[^a-z0-9_]/g, '');
            }
          }
        }
      } catch (err) {
        console.error('[WIBBY PAIRING] Failed to resolve partner from Firebase Admin:', err);
      }
    }

    // Secondary fallback from partnerEmail if still generic
    const fallbackEmailPrefix = partnerEmail ? partnerEmail.split('@')[0] : '';
    if (isBadValue(resolvedPartnerName)) {
      if (!isBadValue(partnerUsername)) {
        resolvedPartnerName = capitalize(partnerUsername);
      } else if (!isBadValue(fallbackEmailPrefix)) {
        resolvedPartnerName = capitalize(fallbackEmailPrefix);
      } else {
        resolvedPartnerName = `User ${partnerUid ? partnerUid.slice(0, 4).toUpperCase() : 'WIBBY'}`;
      }
    }

    if (isBadValue(partnerUsername)) {
      if (!isBadValue(fallbackEmailPrefix)) {
        partnerUsername = fallbackEmailPrefix.toLowerCase().replace(/[^a-z0-9_]/g, '');
      } else {
        partnerUsername = `user_${(partnerUid || 'wibby').slice(0, 6).toLowerCase()}`;
      }
    }

    // Auto-heal MongoDB document so it permanently stores the clean personal name
    if (partnerUid && (isBadCandidateName || isBadCandidateUsername || !partner)) {
      try {
        const partnerDocToSave = {
          firebaseUid: partnerUid,
          username: partnerUsername,
          email: partnerEmail,
          displayName: resolvedPartnerName,
          display_name: resolvedPartnerName,
          avatarUrl: partner?.avatarUrl || null,
          bio: partner?.bio || '',
          customStatus: partner?.customStatus || '',
          privacy: partner?.privacy || {
            lastSeen: 'partner',
            readReceipts: true,
            typingIndicator: true,
            storyVisibility: 'partner'
          },
          updatedAt: new Date()
        };

        await db.collection('users').updateOne(
          { firebaseUid: partnerUid },
          { $set: partnerDocToSave, $setOnInsert: { createdAt: new Date() } },
          { upsert: true }
        );

        partner = await db.collection('users').findOne({ firebaseUid: partnerUid });
      } catch (e) {
        console.error('[WIBBY PAIRING] Failed to auto-heal partner in MongoDB:', e);
      }
    }

    const finalDisplayName = !isBadValue(resolvedPartnerName)
      ? resolvedPartnerName
      : (!isBadValue(partner?.displayName)
          ? String(partner?.displayName)
          : (!isBadValue(partnerUsername) ? capitalize(partnerUsername) : `User ${partnerUid ? partnerUid.slice(0, 4).toUpperCase() : ''}`));

    const finalUsername = !isBadValue(partnerUsername)
      ? partnerUsername
      : (!isBadValue(partner?.username) ? String(partner?.username) : `user_${(partnerUid || '').slice(0, 6)}`);

    const isOnline = isUserOnline(partnerUid) || !!partner?.online;

    const formattedPartner = {
      ...(partner || {}),
      firebaseUid: partnerUid,
      online: isOnline,
      email: partnerEmail,
      username: finalUsername,
      displayName: finalDisplayName,
      display_name: finalDisplayName,
      avatarUrl: partner?.avatarUrl || null,
      bio: partner?.bio || '',
      customStatus: partner?.customStatus || '',
      lastSeen: partner?.lastSeen || null
    };

    res.json({
      paired: true,
      conversationId: conversation._id.toString(),
      partner: formattedPartner,
      themeFamily: conversation.themeFamily || 'classic'
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
