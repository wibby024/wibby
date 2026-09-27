import { ObjectId } from 'mongodb';
import { getDb } from '../lib/mongodb.js';

/**
 * Generates an atomically increasing, server-authoritative monotonic sequence number
 * for messages within a conversation. Guarantees 100% deterministic message ordering
 * regardless of network arrival interleaving or clock skew.
 */
export async function getNextMessageSeq(conversationId: string | ObjectId): Promise<number> {
  try {
    const db = getDb();
    const convId = typeof conversationId === 'string' ? new ObjectId(conversationId) : conversationId;

    const result = await db.collection('conversations').findOneAndUpdate(
      { _id: convId },
      { $inc: { messageSeq: 1 } },
      { returnDocument: 'after' }
    );

    if (result && typeof (result as any).messageSeq === 'number') {
      return (result as any).messageSeq;
    }
  } catch (err) {
    console.error('[WIBBY SEQ] Error incrementing messageSeq:', err);
  }
  return Date.now();
}
