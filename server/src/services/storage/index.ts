import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { Readable } from 'stream';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export interface UploadResult {
  url: string;
  key: string;
  size: number;
  mimeType: string;
}

export interface StorageStreamResult {
  stream: NodeJS.ReadableStream;
  mimeType?: string;
  size?: number;
}

export interface StorageProvider {
  upload(
    fileBuffer: Buffer,
    key: string,
    mimeType: string,
    metadata?: Record<string, any>
  ): Promise<UploadResult>;

  delete(key: string): Promise<void>;

  getStream(key: string): Promise<StorageStreamResult>;

  getUrl(key: string, conversationId: string): string;
}

/**
 * LocalStorageProvider (Development Only)
 * Stores files under the local server uploads directory.
 * NOT for production storage.
 */
export class LocalStorageProvider implements StorageProvider {
  private baseDir: string;

  constructor() {
    // Base uploads directory: server/uploads
    this.baseDir = path.resolve(__dirname, '../../../uploads');
    if (!fs.existsSync(this.baseDir)) {
      fs.mkdirSync(this.baseDir, { recursive: true });
    }
  }

  private getSafeFilePath(key: string): string {
    // Prevent directory traversal attacks
    const normalizedKey = path.normalize(key).replace(/^(\.\.[\/\\])+/, '');
    const fullPath = path.join(this.baseDir, normalizedKey);
    if (!fullPath.startsWith(this.baseDir)) {
      throw new Error('Access denied: Invalid storage key');
    }
    return fullPath;
  }

  async upload(
    fileBuffer: Buffer,
    key: string,
    mimeType: string,
    _metadata?: Record<string, any>
  ): Promise<UploadResult> {
    const fullPath = this.getSafeFilePath(key);
    const dir = path.dirname(fullPath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }

    await fs.promises.writeFile(fullPath, fileBuffer);
    const stats = await fs.promises.stat(fullPath);

    return {
      url: `/api/conversations/media/${key}`,
      key,
      size: stats.size,
      mimeType
    };
  }

  async delete(key: string): Promise<void> {
    try {
      const fullPath = this.getSafeFilePath(key);
      if (fs.existsSync(fullPath)) {
        await fs.promises.unlink(fullPath);
      }
    } catch (err) {
      console.warn(`[LocalStorageProvider] Could not delete file with key ${key}:`, err);
    }
  }

  async getStream(key: string): Promise<StorageStreamResult> {
    const fullPath = this.getSafeFilePath(key);
    if (!fs.existsSync(fullPath)) {
      throw new Error('File not found');
    }

    const stats = await fs.promises.stat(fullPath);
    const stream = fs.createReadStream(fullPath);

    return {
      stream,
      size: stats.size
    };
  }

  getRangeStream(key: string, start: number, end: number): NodeJS.ReadableStream {
    const fullPath = this.getSafeFilePath(key);
    if (!fs.existsSync(fullPath)) {
      throw new Error('File not found');
    }
    return fs.createReadStream(fullPath, { start, end });
  }

  getUrl(key: string, conversationId: string): string {
    return `/api/conversations/${conversationId}/media/${key}`;
  }
}

/**
 * OracleObjectStorageProvider (Future Production Provider)
 * Architecture skeleton for Oracle Cloud Infrastructure (OCI) Object Storage.
 * Uses ₹0 tier always-free OCI Object Storage.
 */
export class OracleObjectStorageProvider implements StorageProvider {
  private bucketName: string;
  private namespace: string;
  private region: string;

  constructor() {
    this.bucketName = process.env.OCI_BUCKET_NAME || 'wibby-media';
    this.namespace = process.env.OCI_NAMESPACE || '';
    this.region = process.env.OCI_REGION || 'ap-hyderabad-1';
  }

  async upload(
    _fileBuffer: Buffer,
    key: string,
    mimeType: string,
    _metadata?: Record<string, any>
  ): Promise<UploadResult> {
    // In production, instantiate OCI ObjectStorageClient and upload PutObjectRequest
    // Returns key and proxy URL
    return {
      url: `/api/conversations/media/${key}`,
      key,
      size: _fileBuffer.length,
      mimeType
    };
  }

  async delete(_key: string): Promise<void> {
    // DeleteObjectRequest to OCI Object Storage
  }

  async getStream(_key: string): Promise<StorageStreamResult> {
    // GetObjectRequest stream from OCI Object Storage
    const stream = new Readable();
    stream.push(null);
    return { stream };
  }

  getUrl(key: string, conversationId: string): string {
    return `/api/conversations/${conversationId}/media/${key}`;
  }
}

import { MongoClient, GridFSBucket, ObjectId } from 'mongodb';
import { getDb } from '../../lib/mongodb.js';

/**
 * GridFSStorageProvider (Production ₹0 Persistent Storage)
 * Stores binary assets persistently in MongoDB Atlas Free cluster (M0) using GridFS.
 * Zero external infrastructure required; persists across Render Free container restarts.
 */
export class GridFSStorageProvider implements StorageProvider {
  private bucketName: string;

  constructor(bucketName = 'media_uploads') {
    this.bucketName = bucketName;
  }

  private getBucket(): GridFSBucket {
    const db = getDb();
    return new GridFSBucket(db, { bucketName: this.bucketName });
  }

  async upload(
    fileBuffer: Buffer,
    key: string,
    mimeType: string,
    metadata?: Record<string, any>
  ): Promise<UploadResult> {
    const bucket = this.getBucket();

    // Remove existing file with the exact key if present to guarantee idempotency
    try {
      const existing = await bucket.find({ filename: key }).toArray();
      for (const doc of existing) {
        await bucket.delete(doc._id);
      }
    } catch {
      // Ignore cleanup error if not found
    }

    return new Promise<UploadResult>((resolve, reject) => {
      const uploadStream = bucket.openUploadStream(key, {
        metadata: {
          mimeType,
          ...metadata,
          uploadedAt: new Date()
        }
      });

      uploadStream.on('error', (err) => reject(err));
      uploadStream.on('finish', () => {
        resolve({
          url: `/api/conversations/media/${key}`,
          key,
          size: fileBuffer.length,
          mimeType
        });
      });

      uploadStream.end(fileBuffer);
    });
  }

  async delete(key: string): Promise<void> {
    try {
      const bucket = this.getBucket();
      const files = await bucket.find({ filename: key }).toArray();
      for (const file of files) {
        await bucket.delete(file._id);
      }
    } catch (err) {
      console.warn(`[GridFSStorageProvider] Could not delete file with key ${key}:`, err);
    }
  }

  async getStream(key: string): Promise<StorageStreamResult> {
    const bucket = this.getBucket();
    const files = await bucket.find({ filename: key }).toArray();
    if (!files || files.length === 0) {
      throw new Error('File not found');
    }

    const file = files[0];
    const stream = bucket.openDownloadStreamByName(key);

    return {
      stream,
      size: file.length,
      mimeType: file.metadata?.mimeType as string | undefined
    };
  }

  getRangeStream(key: string, start: number, end: number): NodeJS.ReadableStream {
    const bucket = this.getBucket();
    return bucket.openDownloadStreamByName(key, {
      start,
      end: end + 1
    });
  }

  getUrl(key: string, conversationId: string): string {
    return `/api/conversations/${conversationId}/media/${key}`;
  }
}

// Singleton storage provider instance
let storageProviderInstance: StorageProvider | null = null;

export function getStorageProvider(): StorageProvider {
  if (!storageProviderInstance) {
    const isProd = process.env.NODE_ENV === 'production';
    const providerType = process.env.STORAGE_PROVIDER || (isProd ? 'gridfs' : 'local');
    if (providerType === 'gridfs' || providerType === 'mongodb') {
      storageProviderInstance = new GridFSStorageProvider();
    } else if (providerType === 'oracle' && process.env.OCI_TENANCY_ID) {
      storageProviderInstance = new OracleObjectStorageProvider();
    } else {
      storageProviderInstance = new LocalStorageProvider();
    }
  }
  return storageProviderInstance;
}

