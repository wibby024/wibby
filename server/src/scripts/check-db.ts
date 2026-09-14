import { connectToDatabase, getDb } from '../lib/mongodb.js';

async function run() {
  await connectToDatabase();
  const db = getDb();
  const msgs = await db.collection('messages').find().sort({ createdAt: -1 }).limit(10).toArray();
  console.log('Recent 10 messages:');
  for (const m of msgs) {
    console.log({
      _id: m._id.toString(),
      type: m.type,
      senderId: m.senderId,
      mediaKey: m.mediaKey,
      mediaUrl: m.mediaUrl,
      duration: m.duration,
      waveform: m.waveform ? m.waveform.length : null,
      createdAt: m.createdAt
    });
  }
  process.exit(0);
}

run().catch(console.error);
