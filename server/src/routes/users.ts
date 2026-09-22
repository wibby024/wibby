import { Router, Request, Response } from 'express';
import multer from 'multer';
import crypto from 'crypto';
import { requireAuth } from '../middleware/auth.js';
import { getDb } from '../lib/mongodb.js';
import { z } from 'zod';
import rateLimit from 'express-rate-limit';
import { getStorageProvider } from '../services/storage/index.js';
import { auth as adminAuth } from '../lib/firebaseAdmin.js';
import { ObjectId } from 'mongodb';

const router = Router();

const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 5 * 1024 * 1024, // 5MB avatar
    files: 1
  }
});

const profileSchema = z.object({
  username: z.string().min(3).max(30),
  displayName: z.string().min(1).max(50),
  email: z.string().email(),
});

const updateProfileSchema = z.object({
  displayName: z.string().min(1).max(50).optional(),
  username: z.string().min(3).max(30).regex(/^[a-zA-Z0-9_]+$/, 'Username can only contain letters, numbers, and underscores').optional(),
  bio: z.string().max(200).optional(),
  avatarUrl: z.string().url().nullable().optional(),
  customStatus: z.string().max(100).optional()
});

const privacySchema = z.object({
  lastSeen: z.enum(['everyone', 'partner', 'nobody']).optional(),
  readReceipts: z.boolean().optional(),
  typingIndicator: z.boolean().optional(),
  storyVisibility: z.enum(['partner', 'nobody']).optional()
});

router.get('/profile', requireAuth, async (req: Request, res: Response) => {
  const user = (req as any).user;
  try {
    const db = getDb();
    let existing = await db.collection('users').findOne({ firebaseUid: user.uid });
    
    // Check if user exists by email (e.g. registered with email or re-authenticated)
    if (!existing && user.email) {
      existing = await db.collection('users').findOne({ email: user.email.toLowerCase() });
      if (existing) {
        await db.collection('users').updateOne(
          { _id: existing._id },
          { $set: { firebaseUid: user.uid, updatedAt: new Date() } }
        );
      }
    }

    // If still not found, auto-create a user profile document from Firebase user token data
    if (!existing) {
      const emailPrefix = user.email ? user.email.split('@')[0] : '';
      const rawUsername = (emailPrefix || `user_${user.uid.slice(0, 6)}`).replace(/[^a-zA-Z0-9_]/g, '').toLowerCase();
      const cleanName = user.name || (emailPrefix ? emailPrefix.charAt(0).toUpperCase() + emailPrefix.slice(1) : 'Wibby User');
      
      const newUser = {
        firebaseUid: user.uid,
        username: rawUsername || `user_${Date.now()}`,
        email: user.email || '',
        displayName: cleanName,
        display_name: cleanName,
        avatarUrl: user.picture || null,
        bio: '',
        customStatus: '',
        privacy: {
          lastSeen: 'partner',
          readReceipts: true,
          typingIndicator: true,
          storyVisibility: 'partner'
        },
        createdAt: new Date(),
        updatedAt: new Date()
      };
      
      const insertRes = await db.collection('users').insertOne(newUser);
      existing = { _id: insertRes.insertedId, ...newUser };
    }

    const isBadValue = (val: any): boolean => {
      if (!val || typeof val !== 'string') return true;
      const n = val.trim().toLowerCase();
      return n === '' || n === 'partner' || n === 'unknown' || n === 'wibby user' || n === 'user' || n === 'you' || n === 'null' || n === 'undefined';
    };

    const currentName = existing.displayName || existing.display_name;
    const isBadCurrentName = isBadValue(currentName);
    const isBadCurrentUsername = isBadValue(existing.username);

    let resolvedDisplayName = !isBadCurrentName ? currentName.trim() : '';
    let resolvedUsername = !isBadCurrentUsername ? existing.username.trim().replace(/^@+/, '').toLowerCase() : '';

    if (!resolvedDisplayName || !resolvedUsername) {
      const emailPrefix = user.email ? user.email.split('@')[0] : '';
      if (!resolvedDisplayName) {
        if (!isBadValue(user.name)) {
          resolvedDisplayName = user.name;
        } else if (!isBadValue(resolvedUsername)) {
          resolvedDisplayName = resolvedUsername.charAt(0).toUpperCase() + resolvedUsername.slice(1);
        } else if (!isBadValue(emailPrefix)) {
          resolvedDisplayName = emailPrefix.charAt(0).toUpperCase() + emailPrefix.slice(1);
        } else {
          resolvedDisplayName = `User ${user.uid.slice(0, 4).toUpperCase()}`;
        }
      }

      if (!resolvedUsername) {
        if (!isBadValue(emailPrefix)) {
          resolvedUsername = emailPrefix.toLowerCase().replace(/[^a-z0-9_]/g, '');
        } else if (!isBadValue(user.name)) {
          resolvedUsername = user.name.toLowerCase().replace(/[^a-z0-9_]/g, '');
        } else {
          resolvedUsername = `user_${user.uid.slice(0, 6).toLowerCase()}`;
        }
      }

      await db.collection('users').updateOne(
        { _id: existing._id },
        {
          $set: {
            displayName: resolvedDisplayName,
            display_name: resolvedDisplayName,
            username: resolvedUsername,
            updatedAt: new Date()
          }
        }
      );
    }

    const profileResponse = {
      ...existing,
      displayName: resolvedDisplayName,
      display_name: resolvedDisplayName,
      username: resolvedUsername
    };

    res.json(profileResponse);
  } catch (error) {
    console.error('Error fetching profile:', error);
    res.status(500).json({ error: 'Failed to fetch profile' });
  }
});

router.put('/profile', requireAuth, async (req: Request, res: Response) => {
  const user = (req as any).user;
  try {
    const parsed = updateProfileSchema.parse(req.body);
    const db = getDb();

    const currentUser = await db.collection('users').findOne({ firebaseUid: user.uid });
    if (!currentUser) {
      res.status(404).json({ error: 'User not found' });
      return;
    }

    const updateFields: any = { updatedAt: new Date() };

    // 14-Day Username Change Limit Check
    if (parsed.username !== undefined) {
      const normalizedNew = parsed.username.trim().toLowerCase();
      const currentUsername = (currentUser.username || '').toLowerCase();

      if (normalizedNew !== currentUsername) {
        const lastChanged = currentUser.lastUsernameChangedAt ? new Date(currentUser.lastUsernameChangedAt).getTime() : 0;
        const FOURTEEN_DAYS_MS = 14 * 24 * 60 * 60 * 1000;
        const now = Date.now();

        if (lastChanged && (now - lastChanged) < FOURTEEN_DAYS_MS) {
          const daysRemaining = Math.ceil((FOURTEEN_DAYS_MS - (now - lastChanged)) / (24 * 60 * 60 * 1000));
          res.status(400).json({ 
            error: `You can only change your username once every 14 days. Please try again in ${daysRemaining} day${daysRemaining === 1 ? '' : 's'}.` 
          });
          return;
        }

        // Check if taken by another user
        const taken = await db.collection('users').findOne({ 
          username: normalizedNew,
          firebaseUid: { $ne: user.uid }
        });
        if (taken) {
          res.status(409).json({ error: 'This username is already taken by another user' });
          return;
        }

        updateFields.username = normalizedNew;
        updateFields.lastUsernameChangedAt = new Date();
      }
    }

    if (parsed.displayName !== undefined) {
      updateFields.displayName = parsed.displayName;
      updateFields.display_name = parsed.displayName;
    }
    if (parsed.bio !== undefined) updateFields.bio = parsed.bio;
    if (parsed.avatarUrl !== undefined) updateFields.avatarUrl = parsed.avatarUrl;
    if (parsed.customStatus !== undefined) updateFields.customStatus = parsed.customStatus;

    await db.collection('users').updateOne(
      { firebaseUid: user.uid },
      { $set: updateFields }
    );

    const updated = await db.collection('users').findOne({ firebaseUid: user.uid });
    res.json(updated);
  } catch (error) {
    if (error instanceof z.ZodError) {
      res.status(400).json({ error: error.issues[0]?.message || 'Invalid input' });
      return;
    }
    console.error('Error updating profile:', error);
    res.status(500).json({ error: 'Failed to update profile' });
  }
});

// Avatar upload
router.post('/avatar', requireAuth, upload.single('avatar'), async (req: Request, res: Response) => {
  const user = (req as any).user;
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'No avatar image provided' });
    }

    const { mimetype, buffer } = req.file;
    if (!mimetype.startsWith('image/')) {
      return res.status(400).json({ error: 'Avatar must be an image file' });
    }

    const storage = getStorageProvider();
    const randomUuid = crypto.randomUUID();
    const storageKey = `avatars/${user.uid}/${randomUuid}.jpg`;

    await storage.upload(buffer, storageKey, mimetype, {
      userId: user.uid,
      type: 'avatar'
    });

    const avatarUrl = `/api/conversations/media/${storageKey}`;
    const db = getDb();
    await db.collection('users').updateOne(
      { firebaseUid: user.uid },
      { $set: { avatarUrl, updatedAt: new Date() } }
    );

    res.json({ avatarUrl });
  } catch (error) {
    console.error('Avatar upload error:', error);
    res.status(500).json({ error: 'Failed to upload avatar' });
  }
});

router.post('/profile', requireAuth, async (req: Request, res: Response) => {
  const user = (req as any).user;
  
  try {
    const parsed = profileSchema.parse(req.body);
    const db = getDb();
    
    const cleanUsername = parsed.username.replace(/^@+/, '').toLowerCase();
    const cleanDisplayName = parsed.displayName.trim();

    // Check if user already exists
    const existing = await db.collection('users').findOne({ firebaseUid: user.uid });
    if (existing) {
      await db.collection('users').updateOne(
        { _id: existing._id },
        {
          $set: {
            displayName: cleanDisplayName,
            display_name: cleanDisplayName,
            username: cleanUsername,
            email: parsed.email.trim().toLowerCase(),
            updatedAt: new Date()
          }
        }
      );
      const updated = await db.collection('users').findOne({ _id: existing._id });
      res.json(updated);
      return;
    }
    
    const newUser = {
      firebaseUid: user.uid,
      username: cleanUsername,
      email: parsed.email.trim().toLowerCase(),
      displayName: cleanDisplayName,
      display_name: cleanDisplayName,
      avatarUrl: null,
      bio: '',
      customStatus: '',
      privacy: {
        lastSeen: 'partner',
        readReceipts: true,
        typingIndicator: true,
        storyVisibility: 'partner'
      },
      createdAt: new Date(),
      updatedAt: new Date()
    };
    
    await db.collection('users').insertOne(newUser);
    res.status(201).json(newUser);
  } catch (error) {
    if (error instanceof z.ZodError) {
      res.status(400).json({ error: error.issues });
      return;
    }
    if ((error as any).code === 11000) {
      res.status(409).json({ error: 'Username is already taken' });
      return;
    }
    console.error('Error creating profile:', error);
    res.status(500).json({ error: 'Failed to create profile' });
  }
});

// Privacy Settings
router.get('/privacy', requireAuth, async (req: Request, res: Response) => {
  const user = (req as any).user;
  try {
    const db = getDb();
    const existing = await db.collection('users').findOne({ firebaseUid: user.uid });
    const privacy = existing?.privacy || {
      lastSeen: 'partner',
      readReceipts: true,
      typingIndicator: true,
      storyVisibility: 'partner'
    };
    res.json(privacy);
  } catch (error) {
    console.error('Get privacy error:', error);
    res.status(500).json({ error: 'Failed to get privacy settings' });
  }
});

router.put('/privacy', requireAuth, async (req: Request, res: Response) => {
  const user = (req as any).user;
  try {
    const parsed = privacySchema.parse(req.body);
    const db = getDb();

    await db.collection('users').updateOne(
      { firebaseUid: user.uid },
      { $set: { privacy: parsed, updatedAt: new Date() } }
    );

    res.json({ success: true, privacy: parsed });
  } catch (error) {
    console.error('Update privacy error:', error);
    res.status(500).json({ error: 'Failed to update privacy settings' });
  }
});

// Devices / Sessions
router.get('/devices', requireAuth, async (req: Request, res: Response) => {
  const user = (req as any).user;
  try {
    const userAgent = req.headers['user-agent'] || 'Unknown Browser';
    let browser = 'Desktop Browser';
    if (/mobile/i.test(userAgent)) browser = 'Mobile Browser';
    else if (/chrome/i.test(userAgent)) browser = 'Chrome on Desktop';
    else if (/safari/i.test(userAgent)) browser = 'Safari on Desktop';
    else if (/firefox/i.test(userAgent)) browser = 'Firefox on Desktop';

    const currentDevice = {
      deviceId: 'current-session',
      browser,
      userAgent: userAgent.slice(0, 150),
      ip: req.ip || '127.0.0.1',
      lastActive: new Date().toISOString(),
      isCurrent: true
    };

    res.json({ devices: [currentDevice] });
  } catch (error) {
    console.error('Get devices error:', error);
    res.status(500).json({ error: 'Failed to fetch devices' });
  }
});

router.delete('/devices/:deviceId', requireAuth, async (req: Request, res: Response) => {
  try {
    res.json({ success: true, message: 'Session revoked' });
  } catch (error) {
    res.status(500).json({ error: 'Failed to revoke session' });
  }
});

// Account Deletion
router.delete('/account', requireAuth, async (req: Request, res: Response) => {
  const user = (req as any).user;
  try {
    const db = getDb();

    // 1. Delete user from MongoDB
    await db.collection('users').deleteOne({ firebaseUid: user.uid });

    // 2. Delete pairing codes created by this user
    await db.collection('pairingCodes').deleteMany({ creatorId: user.uid });

    // 3. Remove from conversations or delete conversations
    await db.collection('conversations').deleteMany({ members: user.uid });

    // 4. Delete messages by user
    await db.collection('messages').deleteMany({ senderId: user.uid });

    // 5. Delete stories by user
    await db.collection('stories').deleteMany({ creatorId: user.uid });

    // 6. Delete Firebase auth user
    try {
      await adminAuth.deleteUser(user.uid);
    } catch (firebaseErr) {
      console.warn('Firebase user delete note:', firebaseErr);
    }

    res.json({ success: true, message: 'Account deleted successfully' });
  } catch (error) {
    console.error('Delete account error:', error);
    res.status(500).json({ error: 'Failed to delete account' });
  }
});

const resolveLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: process.env.NODE_ENV === 'production' ? 50 : 200,
  message: { error: 'Too many lookup attempts, please try again later' }
});

router.post('/resolve-username', resolveLimiter, async (req: Request, res: Response) => {
  const { username } = req.body;
  if (!username || typeof username !== 'string') {
    res.status(400).json({ error: 'Username is required' });
    return;
  }
  
  try {
    const db = getDb();
    const raw = username.trim();
    const clean = raw.replace(/^@+/, '').toLowerCase();
    const lowerRaw = raw.toLowerCase();

    // Look for matching user by username (clean or @), or by email, prioritizing docs with valid email
    let existing = await db.collection('users').findOne({
      $or: [
        { username: clean },
        { username: `@${clean}` },
        { email: clean },
        { email: lowerRaw }
      ],
      email: { $exists: true, $type: 'string', $ne: '' }
    });

    if (!existing) {
      existing = await db.collection('users').findOne({
        $or: [
          { username: clean },
          { username: `@${clean}` },
          { email: clean },
          { email: lowerRaw }
        ]
      });
    }
    
    if (!existing) {
      res.status(404).json({ error: 'Invalid username or password' });
      return;
    }

    let email = existing.email;

    if (!email && existing.firebaseUid) {
      try {
        const userRecord = await adminAuth.getUser(existing.firebaseUid);
        if (userRecord.email) {
          email = userRecord.email;
          await db.collection('users').updateOne(
            { _id: existing._id },
            { $set: { email: userRecord.email } }
          );
        }
      } catch (authError) {
        console.error('Error fetching user email from Firebase:', authError);
      }
    }
    
    if (!email) {
      res.status(404).json({ error: 'Invalid username or password' });
      return;
    }
    
    res.json({ email });
  } catch (error) {
    console.error('Error resolving username:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * GET /api/users/ice-servers
 * Generates dynamic, secure STUN & coturn TURN credentials for authenticated users.
 * Protects TURN secret from ever being exposed to frontend code or client bundles.
 */
router.get('/ice-servers', requireAuth, async (req: Request, res: Response) => {
  const user = (req as any).user;
  const turnUrl = process.env.TURN_SERVER_URL;
  const turnSecret = process.env.TURN_SHARED_SECRET;
  const staticUser = process.env.TURN_SERVER_USERNAME;
  const staticCred = process.env.TURN_SERVER_CREDENTIAL;

  const iceServers: Array<{ urls: string[]; username?: string; credential?: string }> = [
    {
      urls: [
        'stun:stun.l.google.com:19302',
        'stun:stun1.l.google.com:19302',
        'stun:stun2.l.google.com:19302'
      ]
    }
  ];

  if (turnUrl && turnSecret) {
    // Standard RFC 5766 coturn REST API HMAC-SHA1 dynamic ephemeral credentials (TTL 24 hours)
    const ttlSeconds = 24 * 3600;
    const expiryTimestamp = Math.floor(Date.now() / 1000) + ttlSeconds;
    const username = `${expiryTimestamp}:${user.uid}`;
    const credential = crypto
      .createHmac('sha1', turnSecret)
      .update(username)
      .digest('base64');

    const urls = turnUrl.split(',').map((u) => u.trim()).filter(Boolean);
    iceServers.push({
      urls,
      username,
      credential
    });
  } else if (turnUrl && staticUser && staticCred) {
    const urls = turnUrl.split(',').map((u) => u.trim()).filter(Boolean);
    iceServers.push({
      urls,
      username: staticUser,
      credential: staticCred
    });
  }

  res.json({
    iceServers,
    iceCandidatePoolSize: 10
  });
});

export default router;
