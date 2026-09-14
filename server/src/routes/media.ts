import { Router, Request, Response } from 'express';
import multer from 'multer';
import crypto from 'crypto';
import { ObjectId } from 'mongodb';
import { requireAuth } from '../middleware/auth.js';
import { getDb } from '../lib/mongodb.js';
import { getIo } from '../socket/index.js';
import { 
  MEDIA_LIMITS, 
  determineMediaType, 
  validateFileSize, 
  sanitizeFileName 
} from '../config/media.js';
import { getStorageProvider } from '../services/storage/index.js';
import { serializeMessage } from '../utils/serializer.js';

const router = Router({ mergeParams: true });

// Multer memory storage with file size limit
const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: MEDIA_LIMITS.MAX_TOTAL_FILE_SIZE,
    files: 1
  }
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

/**
 * POST /api/conversations/:conversationId/media
 * Uploads an image, video, or document file, stores it, creates a MongoDB message, and broadcasts it.
 */
router.post('/', upload.single('file'), async (req: Request, res: Response) => {
  const conversationId = req.params.conversationId as string;
  const user = (req as any).user;
  const db = getDb();
  const storage = getStorageProvider();
  let uploadedKey: string | null = null;

  try {
    if (!req.file) {
      return res.status(400).json({ error: 'No file provided' });
    }

    const { originalname, mimetype, size, buffer } = req.file;
    const clientMessageId = req.body.clientMessageId as string | undefined;
    const caption = typeof req.body.caption === 'string' ? req.body.caption.trim().slice(0, 2000) : '';
    const replyToMessageId = req.body.replyToMessageId as string | undefined;
    const forwardedFromMessageId = req.body.forwardedFromMessageId as string | undefined;

    const duration = req.body.duration !== undefined ? parseFloat(req.body.duration) : undefined;
    let waveform: number[] | undefined = undefined;
    if (req.body.waveform) {
      try {
        const parsed = typeof req.body.waveform === 'string' ? JSON.parse(req.body.waveform) : req.body.waveform;
        if (Array.isArray(parsed)) {
          waveform = parsed.map(n => typeof n === 'number' && !isNaN(n) ? Number(Math.max(0, Math.min(1, n)).toFixed(3)) : 0);
        }
      } catch {
        waveform = undefined;
      }
    }

    // Idempotency check: If message already exists for this clientMessageId, return it
    if (clientMessageId) {
      const existingMsg = await db.collection('messages').findOne({
        clientMessageId,
        senderId: user.uid
      });
      if (existingMsg) {
        const serializedExisting = serializeMessage(existingMsg);
        return res.status(200).json({ message: serializedExisting });
      }
    }

    // 1. Determine media type (image | video | file)
    const mediaType = determineMediaType(mimetype, originalname);
    if (!mediaType) {
      return res.status(400).json({ 
        error: 'Unsupported file type. Please upload a supported image, video, or document.' 
      });
    }

    // 2. Validate file size according to media type
    const sizeValidation = validateFileSize(mediaType, size);
    if (!sizeValidation.valid) {
      return res.status(400).json({ error: sizeValidation.error });
    }

    // 3. Sanitize file name and generate partition key
    const sanitizedName = sanitizeFileName(originalname) || `file_${Date.now()}`;
    const now = new Date();
    const year = now.getUTCFullYear();
    const month = String(now.getUTCMonth() + 1).padStart(2, '0');
    const randomUuid = crypto.randomUUID();
    const storageKey = `${conversationId}/${year}/${month}/${randomUuid}-${sanitizedName}`;

    // 4. Upload binary to StorageProvider
    await storage.upload(buffer, storageKey, mimetype, {
      conversationId,
      senderId: user.uid,
      originalName: sanitizedName
    });
    uploadedKey = storageKey;

    // 5. Create MongoDB message document
    const messageDoc = {
      clientMessageId: clientMessageId || null,
      conversationId: new ObjectId(conversationId),
      senderId: user.uid,
      type: mediaType,
      text: caption,
      mediaUrl: `/api/conversations/${conversationId}/media/${storageKey}`,
      mediaKey: storageKey,
      mimeType: mimetype,
      fileName: sanitizedName,
      fileSize: size,
      duration: duration !== undefined && !isNaN(duration) ? duration : null,
      waveform: waveform || null,
      thumbnailUrl: null,
      reactions: [],
      deletedFor: [],
      createdAt: now,
      updatedAt: now,
      editedAt: null,
      deletedAt: null,
      status: 'sent',
      deliveredAt: null,
      seenAt: null,
      replyToMessageId: replyToMessageId && ObjectId.isValid(replyToMessageId) ? new ObjectId(replyToMessageId) : null,
      forwardedFromMessageId: forwardedFromMessageId && ObjectId.isValid(forwardedFromMessageId) ? new ObjectId(forwardedFromMessageId) : null
    };

    let result;
    try {
      result = await db.collection('messages').insertOne(messageDoc);
    } catch (dbErr) {
      // Clean up uploaded file if DB insertion fails to prevent orphaned storage objects
      if (uploadedKey) {
        await storage.delete(uploadedKey).catch(cleanupErr => {
          console.error('Failed to cleanup orphaned storage file:', cleanupErr);
        });
      }
      throw dbErr;
    }

    const serializedMessage = serializeMessage({
      ...messageDoc,
      _id: result.insertedId,
      replyToMessageId: replyToMessageId || null,
      forwardedFromMessageId: forwardedFromMessageId || null
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

    // Broadcast message via Socket.IO to conversation room AND user rooms (atomic multi-room delivery without duplicate packets)
    const io = getIo();
    console.log(`[WIBBY REALTIME FORENSICS] Broadcasting media message: id=${serializedMessage._id}, type=${serializedMessage.type}, conversationId=${conversationId}, sender=${user.uid}`);
    
    const targetRooms: string[] = [`conversation:${conversationId}`];
    const conversation = (req as any).conversation;
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

    res.status(201).json({ message: serializedMessage });
  } catch (error: any) {
    console.error('Media upload error:', error);
    if (uploadedKey) {
      storage.delete(uploadedKey).catch(() => {});
    }
    res.status(500).json({ error: error.message || 'Failed to upload media' });
  }
});

/**
 * GET /api/conversations/:conversationId/media/*mediaKey
 * Authenticated and authorized media streaming endpoint.
 * Private: Only conversation members can access the media stream.
 */
router.get('/*mediaKey', async (req: Request, res: Response) => {
  try {
    const conversationId = req.params.conversationId as string;
    const rawParam = req.params.mediaKey || (req.params as any)[0] || '';
    let rawKey = Array.isArray(rawParam) ? rawParam.join('/') : (rawParam as string);
    rawKey = rawKey.replace(/^\/+/, '');
    let mediaKey = rawKey;
    try {
      mediaKey = decodeURIComponent(rawKey);
    } catch {
      // keep rawKey
    }
    const storage = getStorageProvider();

    // Security check: mediaKey must belong to this conversation
    if (!mediaKey.startsWith(`${conversationId}/`)) {
      return res.status(403).json({ error: 'Access denied: Media does not belong to this conversation' });
    }


    const db = getDb();
    // Retrieve metadata from messages collection for content type and original filename
    const message = await db.collection('messages').findOne({
      conversationId: new ObjectId(conversationId),
      mediaKey: mediaKey
    });

    const isDownload = req.query.download === 'true';
    const storageResult = await storage.getStream(mediaKey);

    const mimeType = message?.mimeType || storageResult.mimeType || 'application/octet-stream';
    const fileName = message?.fileName || 'download';
    const totalSize = storageResult.size || 0;
    const rangeHeader = req.headers.range;

    res.setHeader('Accept-Ranges', 'bytes');
    res.setHeader('Content-Type', mimeType);
    res.setHeader('Cache-Control', 'private, max-age=86400');

    const safeName = fileName.replace(/["\r\n]/g, '');
    res.setHeader(
      'Content-Disposition',
      `${isDownload ? 'attachment' : 'inline'}; filename="${safeName}"; filename*=UTF-8''${encodeURIComponent(fileName)}`
    );

    if (rangeHeader && totalSize > 0 && !isDownload) {
      const parts = rangeHeader.replace(/bytes=/, '').split('-');
      const start = parseInt(parts[0], 10);
      const end = parts[1] ? parseInt(parts[1], 10) : totalSize - 1;

      if (start >= totalSize || end >= totalSize || start > end) {
        res.status(416).setHeader('Content-Range', `bytes */${totalSize}`);
        return res.end();
      }

      const chunkSize = end - start + 1;
      res.status(206);
      res.setHeader('Content-Range', `bytes ${start}-${end}/${totalSize}`);
      res.setHeader('Content-Length', chunkSize);

      if ((storage as any).getRangeStream) {
        const rangeStream = (storage as any).getRangeStream(mediaKey, start, end);
        return rangeStream.pipe(res);
      }
    }

    if (totalSize) {
      res.setHeader('Content-Length', totalSize);
    }
    storageResult.stream.pipe(res);
  } catch (error: any) {
    console.error('Stream media error:', error);
    if (error.message === 'File not found') {
      return res.status(404).json({ error: 'Media file not found' });
    }
    res.status(500).json({ error: 'Internal server error fetching media' });
  }
});

export default router;
