import { getDb } from '../lib/mongodb.js';
import { GridFSBucket } from 'mongodb';

export interface CollectionAuditInfo {
  name: string;
  category: 'permanent' | 'temporary' | 'media';
  count: number;
  sizeBytes: number;
  sizeFormatted: string;
}

export type StorageHealthStatus = 'Normal' | 'Watch' | 'Warning' | 'Critical' | 'Emergency';

export interface StorageAuditResult {
  status: StorageHealthStatus;
  usedMb: number;
  limitMb: number;
  percentUsed: number;
  databaseStats: {
    dataSizeMb: number;
    storageSizeMb: number;
    indexSizeMb: number;
    totalSizeMb: number;
    collectionsCount: number;
    objectsCount: number;
  };
  collections: {
    permanent: CollectionAuditInfo[];
    temporary: CollectionAuditInfo[];
    media: CollectionAuditInfo[];
  };
  summary: string;
  timestamp: string;
}

function formatBytes(bytes: number): string {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(2))} ${sizes[i]}`;
}

export async function getStorageAudit(): Promise<StorageAuditResult> {
  const db = getDb();
  const limitMb = Number(process.env.MONGODB_MAX_STORAGE_MB) || 512; // 512 MB default for Atlas M0

  let dbStats: any = {};
  try {
    dbStats = await db.command({ dbStats: 1 });
  } catch (err) {
    console.warn('Could not run dbStats command:', err);
  }

  const collectionsList = await db.listCollections().toArray();
  const collectionNames = collectionsList.map(c => c.name);

  const permanentCols = ['users', 'conversations', 'messages', 'calls', 'settings', 'devices'];
  const tempCols = ['pairingCodes', 'stories', 'temp_uploads'];
  const mediaCols = ['media_uploads.files', 'media_uploads.chunks', 'fs.files', 'fs.chunks'];

  const auditMap: {
    permanent: CollectionAuditInfo[];
    temporary: CollectionAuditInfo[];
    media: CollectionAuditInfo[];
  } = {
    permanent: [],
    temporary: [],
    media: []
  };

  for (const name of collectionNames) {
    let count = 0;
    let sizeBytes = 0;

    try {
      count = await db.collection(name).countDocuments();
      const collStats = await db.command({ collStats: name });
      sizeBytes = collStats.size || collStats.storageSize || 0;
    } catch {
      // Fallback count only
      try {
        count = await db.collection(name).countDocuments();
      } catch {}
    }

    const info: CollectionAuditInfo = {
      name,
      category: permanentCols.includes(name)
        ? 'permanent'
        : mediaCols.includes(name)
        ? 'media'
        : 'temporary',
      count,
      sizeBytes,
      sizeFormatted: formatBytes(sizeBytes)
    };

    if (info.category === 'permanent') {
      auditMap.permanent.push(info);
    } else if (info.category === 'media') {
      auditMap.media.push(info);
    } else {
      auditMap.temporary.push(info);
    }
  }

  const storageSize = dbStats.storageSize || 0;
  const indexSize = dbStats.indexSize || 0;
  const totalSizeBytes = storageSize + indexSize;
  const usedMb = parseFloat((totalSizeBytes / (1024 * 1024)).toFixed(2));
  const percentUsed = parseFloat(((usedMb / limitMb) * 100).toFixed(1));

  let status: StorageHealthStatus = 'Normal';
  if (percentUsed >= 90) status = 'Emergency';
  else if (percentUsed >= 85) status = 'Critical';
  else if (percentUsed >= 75) status = 'Warning';
  else if (percentUsed >= 60) status = 'Watch';

  return {
    status,
    usedMb,
    limitMb,
    percentUsed,
    databaseStats: {
      dataSizeMb: parseFloat(((dbStats.dataSize || 0) / (1024 * 1024)).toFixed(2)),
      storageSizeMb: parseFloat((storageSize / (1024 * 1024)).toFixed(2)),
      indexSizeMb: parseFloat((indexSize / (1024 * 1024)).toFixed(2)),
      totalSizeMb: usedMb,
      collectionsCount: dbStats.collections || collectionNames.length,
      objectsCount: dbStats.objects || 0
    },
    collections: auditMap,
    summary: `MongoDB Usage: ${usedMb} MB / ${limitMb} MB (${percentUsed}%) — Status: ${status}`,
    timestamp: new Date().toISOString()
  };
}

/**
 * Safe Temporary Data Cleanup
 * Deletes ONLY expired temporary data (never permanent messages, users, or conversations).
 */
export async function runSafeTemporaryCleanup(): Promise<{
  deletedPairingCodes: number;
  deletedExpiredStories: number;
  deletedOrphanedChunks: number;
}> {
  const db = getDb();
  const now = new Date();
  const twoDaysAgo = new Date(now.getTime() - 48 * 60 * 60 * 1000);

  let deletedPairingCodes = 0;
  let deletedExpiredStories = 0;
  let deletedOrphanedChunks = 0;

  // 1. Delete expired pairing codes
  try {
    const res = await db.collection('pairingCodes').deleteMany({
      expiresAt: { $lt: now }
    });
    deletedPairingCodes = res.deletedCount || 0;
  } catch (err) {
    console.warn('Safe cleanup pairingCodes error:', err);
  }

  // 2. Delete expired stories (retained for 48h after 24h expiry before safe deletion)
  try {
    const res = await db.collection('stories').deleteMany({
      expiresAt: { $lt: twoDaysAgo }
    });
    deletedExpiredStories = res.deletedCount || 0;
  } catch (err) {
    console.warn('Safe cleanup stories error:', err);
  }

  // 3. GridFS orphaned chunk check
  try {
    const filesCollection = db.collection('media_uploads.files');
    const chunksCollection = db.collection('media_uploads.chunks');
    const activeFileIds = await filesCollection.find({}, { projection: { _id: 1 } }).toArray();
    const idSet = new Set(activeFileIds.map(f => f._id.toString()));

    // Find chunks whose files_id is not in activeFileIds
    const orphanedChunks = await chunksCollection
      .find({ files_id: { $nin: Array.from(activeFileIds.map(f => f._id)) } })
      .toArray();

    if (orphanedChunks.length > 0) {
      const orphanIds = orphanedChunks.map(c => c._id);
      const res = await chunksCollection.deleteMany({ _id: { $in: orphanIds } });
      deletedOrphanedChunks = res.deletedCount || 0;
    }
  } catch (err) {
    console.warn('Safe cleanup GridFS error:', err);
  }

  return {
    deletedPairingCodes,
    deletedExpiredStories,
    deletedOrphanedChunks
  };
}
