import { Router, Request, Response } from 'express';
import multer from 'multer';
import crypto from 'crypto';
import { ObjectId } from 'mongodb';
import { requireAuth } from '../middleware/auth.js';
import { getDb } from '../lib/mongodb.js';
import { getIo } from '../socket/index.js';
import { getStorageProvider } from '../services/storage/index.js';
import { MEDIA_LIMITS, determineMediaType, validateFileSize, sanitizeFileName } from '../config/media.js';

const router = Router({ mergeParams: true });

const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: MEDIA_LIMITS.MAX_VIDEO_SIZE,
    files: 1
  }
});

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

// GET active stories
router.get('/', async (req: Request, res: Response) => {
  try {
    const conversationId = req.params.conversationId as string;
    const db = getDb();
    const now = new Date();

    const stories = await db.collection('stories')
      .find({
        conversationId: new ObjectId(conversationId),
        expiresAt: { $gt: now }
      })
      .sort({ createdAt: 1 })
      .toArray();

    const serializedStories = stories.map(s => ({
      _id: s._id.toString(),
      conversationId: s.conversationId.toString(),
      creatorId: s.creatorId,
      type: s.type,
      mediaUrl: s.mediaUrl || null,
      mediaKey: s.mediaKey || null,
      text: s.text || '',
      caption: s.caption || '',
      backgroundColor: s.backgroundColor || null,
      textStyle: s.textStyle || null,
      duration: s.duration || 5,
      musicNote: s.musicNote || null,
      viewers: Array.isArray(s.viewers) ? s.viewers : [],
      reactions: Array.isArray(s.reactions) ? s.reactions : [],
      createdAt: s.createdAt instanceof Date ? s.createdAt.toISOString() : s.createdAt,
      expiresAt: s.expiresAt instanceof Date ? s.expiresAt.toISOString() : s.expiresAt
    }));

    res.json({ stories: serializedStories });
  } catch (error) {
    console.error('Get stories error:', error);
    res.status(500).json({ error: 'Failed to fetch stories' });
  }
});

// POST create a story
router.post('/', upload.single('file'), async (req: Request, res: Response) => {
  const conversationId = req.params.conversationId as string;
  const user = (req as any).user;
  const db = getDb();
  const storage = getStorageProvider();
  let uploadedKey: string | null = null;

  try {
    const now = new Date();
    const expiresAt = new Date(now.getTime() + 24 * 60 * 60 * 1000); // 24 hours

    let storyType: 'image' | 'video' | 'text' = 'text';
    let mediaUrl: string | null = null;
    let mediaKey: string | null = null;
    let storageKey: string | null = null;
    let caption = typeof req.body.caption === 'string' ? req.body.caption.trim().slice(0, 500) : '';
    let text = typeof req.body.text === 'string' ? req.body.text.trim().slice(0, 1000) : '';
    let backgroundColor = typeof req.body.backgroundColor === 'string' ? req.body.backgroundColor : '#7C3AED';
    let duration = Number(req.body.duration) || 5;

    let musicNote = null;
    if (req.body.musicNote) {
      try {
        musicNote = typeof req.body.musicNote === 'string' ? JSON.parse(req.body.musicNote) : req.body.musicNote;
      } catch {
        musicNote = null;
      }
    }

    if (req.file) {
      const { originalname, mimetype, size, buffer } = req.file;
      const detectedType = determineMediaType(mimetype, originalname);
      if (detectedType !== 'image' && detectedType !== 'video') {
        return res.status(400).json({ error: 'Stories only support images and videos' });
      }

      storyType = detectedType;
      const sanitizedName = sanitizeFileName(originalname) || `story_${Date.now()}`;
      const year = now.getUTCFullYear();
      const month = String(now.getUTCMonth() + 1).padStart(2, '0');
      const randomUuid = crypto.randomUUID();
      storageKey = `${conversationId}/${year}/${month}/story-${randomUuid}-${sanitizedName}`;

      await storage.upload(buffer, storageKey, mimetype, {
        conversationId,
        senderId: user.uid,
        story: 'true'
      });
      uploadedKey = storageKey;
      mediaKey = storageKey;
      mediaUrl = `/api/conversations/${conversationId}/media/${storageKey}`;
    } else {
      storyType = 'text';
      if (!text && !musicNote) {
        return res.status(400).json({ error: 'Content or music note is required for stories' });
      }
    }

    const storyDoc = {
      conversationId: new ObjectId(conversationId),
      creatorId: user.uid,
      type: storyType,
      mediaUrl,
      mediaKey,
      text,
      caption,
      backgroundColor,
      duration,
      musicNote,
      viewers: [{ uid: user.uid, viewedAt: now }],
      reactions: [],
      createdAt: now,
      expiresAt
    };

    const result = await db.collection('stories').insertOne(storyDoc);
    const serializedStory = {
      ...storyDoc,
      _id: result.insertedId.toString(),
      conversationId,
      createdAt: now.toISOString(),
      expiresAt: expiresAt.toISOString()
    };

    const io = getIo();
    if (io) {
      io.to(`conversation:${conversationId}`).emit('story:new', serializedStory);
    }

    res.status(201).json({ story: serializedStory });
  } catch (error: any) {
    console.error('Create story error:', error);
    if (uploadedKey) {
      storage.delete(uploadedKey).catch(() => {});
    }
    res.status(500).json({ error: error.message || 'Failed to create story' });
  }
});

// Mark story as viewed
router.post('/:storyId/view', async (req: Request, res: Response) => {
  try {
    const conversationId = req.params.conversationId as string;
    const storyId = req.params.storyId as string;
    const user = (req as any).user;
    const db = getDb();

    if (!ObjectId.isValid(storyId)) {
      return res.status(400).json({ error: 'Invalid story ID' });
    }

    const now = new Date();
    await db.collection('stories').updateOne(
      {
        _id: new ObjectId(storyId),
        conversationId: new ObjectId(conversationId),
        'viewers.uid': { $ne: user.uid }
      },
      {
        $push: { viewers: { uid: user.uid, viewedAt: now } }
      } as any
    );

    const io = getIo();
    if (io) {
      io.to(`conversation:${conversationId}`).emit('story:viewed', {
        storyId,
        conversationId,
        uid: user.uid,
        viewedAt: now.toISOString()
      });
    }

    res.json({ success: true });
  } catch (error) {
    console.error('Story view error:', error);
    res.status(500).json({ error: 'Failed to mark story as viewed' });
  }
});

// React to story
router.post('/:storyId/react', async (req: Request, res: Response) => {
  try {
    const conversationId = req.params.conversationId as string;
    const storyId = req.params.storyId as string;
    const { emoji } = req.body;
    const user = (req as any).user;
    const db = getDb();

    if (!ObjectId.isValid(storyId) || !emoji) {
      return res.status(400).json({ error: 'Invalid story ID or emoji' });
    }

    const now = new Date();
    const storyObjId = new ObjectId(storyId);

    // Remove prior reaction by this user
    await db.collection('stories').updateOne(
      { _id: storyObjId, conversationId: new ObjectId(conversationId) },
      { $pull: { reactions: { uid: user.uid } } } as any
    );

    await db.collection('stories').updateOne(
      { _id: storyObjId, conversationId: new ObjectId(conversationId) },
      { $push: { reactions: { uid: user.uid, emoji, createdAt: now } } } as any
    );

    const io = getIo();
    if (io) {
      io.to(`conversation:${conversationId}`).emit('story:react', {
        storyId,
        conversationId,
        uid: user.uid,
        emoji,
        createdAt: now.toISOString()
      });
    }

    res.json({ success: true });
  } catch (error) {
    console.error('Story react error:', error);
    res.status(500).json({ error: 'Failed to react to story' });
  }
});

// Delete story
router.delete('/:storyId', async (req: Request, res: Response) => {
  try {
    const conversationId = req.params.conversationId as string;
    const storyId = req.params.storyId as string;
    const user = (req as any).user;
    const db = getDb();

    if (!ObjectId.isValid(storyId)) {
      return res.status(400).json({ error: 'Invalid story ID' });
    }

    const story = await db.collection('stories').findOne({
      _id: new ObjectId(storyId),
      conversationId: new ObjectId(conversationId)
    });

    if (!story) {
      return res.status(404).json({ error: 'Story not found' });
    }

    if (story.creatorId !== user.uid) {
      return res.status(403).json({ error: 'Only the creator can delete this story' });
    }

    await db.collection('stories').deleteOne({ _id: story._id });

    if (story.mediaKey) {
      getStorageProvider().delete(story.mediaKey).catch(() => {});
    }

    const io = getIo();
    if (io) {
      io.to(`conversation:${conversationId}`).emit('story:delete', {
        storyId,
        conversationId
      });
    }

    res.json({ success: true });
  } catch (error) {
    console.error('Delete story error:', error);
    res.status(500).json({ error: 'Failed to delete story' });
  }
});

export default router;
