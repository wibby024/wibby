import { connectToDatabase, getDb } from '../lib/mongodb.js';
import { ObjectId } from 'mongodb';

async function inspect() {
  await connectToDatabase();
  const db = getDb();
  const messages = await db.collection('messages')
    .find({ conversationId: new ObjectId('6aa65c65cbb9d25ad0f8c344') })
    .sort({ createdAt: -1 })
    .limit(10)
    .toArray();
  console.log('--- RECENT 10 MESSAGES IN DB ---');
  for (const m of messages.reverse()) {
    console.log(JSON.stringify({
      _id: m._id.toString(),
      clientMessageId: m.clientMessageId,
      senderId: m.senderId,
      type: m.type,
      text: m.text,
      mediaUrl: m.mediaUrl,
      mediaKey: m.mediaKey,
      mimeType: m.mimeType,
      fileName: m.fileName,
      duration: m.duration,
      waveformLen: m.waveform?.length,
      createdAt: m.createdAt
    }, null, 2));
  }
}

inspect().then(() => process.exit(0)).catch(e => { console.error(e); process.exit(1); });
