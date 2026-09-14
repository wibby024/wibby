import { MongoClient, Db } from 'mongodb';
import * as dotenv from 'dotenv';

dotenv.config();

const uri = process.env.MONGODB_URI || 'mongodb://localhost:27017';
const dbName = process.env.MONGODB_DB_NAME || 'wibby';

let client: MongoClient | null = null;
let db: Db | null = null;

export async function connectToDatabase(): Promise<{ client: MongoClient; db: Db }> {
  if (db && client) {
    return { client, db };
  }

  try {
    client = new MongoClient(uri);
    await client.connect();
    db = client.db(dbName);
    console.log('Connected to MongoDB');
    
    // Production Indexes Setup
    await Promise.allSettled([
      // Users collection
      db.collection('users').createIndex({ firebaseUid: 1 }, { unique: true }),
      db.collection('users').createIndex({ username: 1 }, { unique: true, sparse: true }),
      db.collection('users').createIndex({ email: 1 }),
      db.collection('users').createIndex({ pairedUserId: 1 }),

      // Pairing Codes collection
      db.collection('pairingCodes').createIndex({ code: 1 }, { unique: true }),
      db.collection('pairingCodes').createIndex({ expiresAt: 1 }),
      db.collection('pairingCodes').createIndex({ creatorUid: 1 }),

      // Conversations collection
      db.collection('conversations').createIndex({ members: 1 }),
      db.collection('conversations').createIndex({ pairingCode: 1 }),
      db.collection('conversations').createIndex({ updatedAt: -1 }),

      // Messages collection
      db.collection('messages').createIndex({ conversationId: 1, createdAt: -1 }),
      db.collection('messages').createIndex({ conversationId: 1, createdAt: 1 }),
      db.collection('messages').createIndex({ senderId: 1 }),
      db.collection('messages').createIndex({ conversationId: 1, isPinned: 1 }),
      db.collection('messages').createIndex({ conversationId: 1, isStarred: 1 }),
      db.collection('messages').createIndex({ clientMessageId: 1 }, { sparse: true }),

      // Calls collection (Phase 8/9 Audio & Video)
      db.collection('calls').createIndex({ callId: 1 }, { unique: true }),
      db.collection('calls').createIndex({ conversationId: 1, startedAt: -1 }),
      db.collection('calls').createIndex({ callerId: 1 }),
      db.collection('calls').createIndex({ receiverId: 1 }),
      db.collection('calls').createIndex({ status: 1 }),

      // Stories collection (Phase 7)
      db.collection('stories').createIndex({ conversationId: 1, createdAt: -1 }),
      db.collection('stories').createIndex({ userId: 1 }),
      db.collection('stories').createIndex({ expiresAt: 1 }),

      // Devices & Settings collection
      db.collection('devices').createIndex({ userId: 1, deviceId: 1 }, { unique: true, sparse: true }),
      db.collection('settings').createIndex({ userId: 1 }, { unique: true, sparse: true })
    ]);
    
    return { client, db };
  } catch (error) {
    console.error('Failed to connect to MongoDB', error);
    throw error;
  }
}

export function getDb(): Db {
  if (!db) {
    throw new Error('Database not initialized. Call connectToDatabase first.');
  }
  return db;
}

export function getClient(): MongoClient {
  if (!client) {
    throw new Error('Database not initialized. Call connectToDatabase first.');
  }
  return client;
}
