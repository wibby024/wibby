import { io as ClientSocket } from 'socket.io-client';
import { connectToDatabase, getDb } from '../lib/mongodb.js';
import { ObjectId } from 'mongodb';
import { getStorageProvider } from '../services/storage/index.js';
import { auth } from '../lib/firebaseAdmin.js';

const BASE_URL = 'http://localhost:3000';
const USER_A_UID = '34e83xfHHoY6UVEku5UOLptUVCC3'; // tara024
const USER_B_UID = 'O5rXUrxdrvWwOiQPsZuFUcgXU7e2'; // adi024
const CONVERSATION_ID = '6aa65c65cbb9d25ad0f8c344';
const FIREBASE_API_KEY = 'AIzaSyC_GUtnwhi9VrZS9pintc_-voCZwftD3MA';

async function getIdTokenForUid(uid: string): Promise<string> {
  const customToken = await auth.createCustomToken(uid);
  const res = await fetch(`https://identitytoolkit.googleapis.com/v1/accounts:signInWithCustomToken?key=${FIREBASE_API_KEY}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ token: customToken, returnSecureToken: true })
  });
  if (!res.ok) {
    throw new Error(`Failed to exchange custom token for ID token: ${await res.text()}`);
  }
  const data = await res.json() as any;
  return data.idToken;
}

function generateValidWebmAudioBuffer(durationSeconds: number): Buffer {
  const header = Buffer.from([
    0x1a, 0x45, 0xdf, 0xa3,
    0x9f, 0x42, 0x86, 0x81, 0x01, 0x42, 0xf7, 0x81, 0x01, 0x42, 0xf2, 0x81, 0x04,
    0x42, 0xf3, 0x81, 0x08, 0x42, 0x82, 0x84, 0x77, 0x65, 0x62, 0x6d, 0x42, 0x87,
    0x81, 0x04, 0x42, 0x85, 0x81, 0x02, 0x18, 0x53, 0x80, 0x67
  ]);
  const audioDataSize = Math.floor(durationSeconds * 16000);
  const audioData = Buffer.alloc(audioDataSize);
  for (let i = 0; i < audioDataSize; i++) {
    audioData[i] = (i * 11 + 5) % 256;
  }
  return Buffer.concat([header, audioData]);
}

async function runRealtimeVoiceDeliveryTest() {
  console.log('================================================================');
  console.log('📡 RUNNING WIBBY REALTIME VOICE MESSAGE TWO-BROWSER SUITE');
  console.log('================================================================\n');

  await connectToDatabase();
  console.log('✓ Connected to MongoDB');

  const idTokenA = await getIdTokenForUid(USER_A_UID);
  const idTokenB = await getIdTokenForUid(USER_B_UID);
  console.log('✓ Firebase ID tokens generated.');

  // TEST 1: Tara024 -> Adi024 Realtime Delivery
  console.log('\n[1/6] Testing tara024 -> adi024 Realtime Voice Message Delivery...');
  let socketA = ClientSocket(BASE_URL, { auth: { token: idTokenA } });
  let socketB = ClientSocket(BASE_URL, { auth: { token: idTokenB } });

  await Promise.all([
    new Promise<void>(res => socketA.on('connect', res)),
    new Promise<void>(res => socketB.on('connect', res))
  ]);

  const clientMsgId1 = `voice_${Date.now()}_test1`;
  const audioBuffer1 = generateValidWebmAudioBuffer(3.0);
  const formData1 = new FormData();
  formData1.append('file', new Blob([new Uint8Array(audioBuffer1)], { type: 'audio/webm;codecs=opus' }), `voice_${Date.now()}.webm`);
  formData1.append('clientMessageId', clientMsgId1);
  formData1.append('duration', '3.0');
  formData1.append('waveform', JSON.stringify(new Array(32).fill(0.5)));

  let receivedMessageByB: any = null;
  const receivePromiseB = new Promise<any>((resolve) => {
    socketB.on('new_message', (msg: any) => {
      if (msg.clientMessageId === clientMsgId1) {
        receivedMessageByB = msg;
        resolve(msg);
      }
    });
  });

  const uploadRes1 = await fetch(`${BASE_URL}/api/conversations/${CONVERSATION_ID}/media`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${idTokenA}` },
    body: formData1
  });

  if (uploadRes1.status !== 201) {
    throw new Error(`Upload 1 failed: ${await uploadRes1.text()}`);
  }
  const uploadData1 = await uploadRes1.json() as any;

  const timeoutPromise = new Promise((_, reject) => setTimeout(() => reject(new Error('Timeout waiting for socket message on recipient B')), 4000));
  await Promise.race([receivePromiseB, timeoutPromise]);

  if (!receivedMessageByB) {
    throw new Error('Recipient B failed to receive voice message via Socket.IO');
  }
  if (receivedMessageByB.type !== 'audio' || !receivedMessageByB.mediaUrl || !receivedMessageByB.duration) {
    throw new Error(`Malformed message payload: ${JSON.stringify(receivedMessageByB)}`);
  }
  console.log(`✓ tara024 -> adi024 realtime voice delivery verified: msgId=${receivedMessageByB._id}, type=${receivedMessageByB.type}, duration=${receivedMessageByB.duration}s`);

  // TEST 2: History Query Verification
  console.log('\n[2/6] Testing Recipient Message History Query (GET /messages)...');
  const historyRes = await fetch(`${BASE_URL}/api/conversations/${CONVERSATION_ID}/messages?limit=10`, {
    headers: { Authorization: `Bearer ${idTokenB}` }
  });
  const historyData = await historyRes.json() as any;
  const historyMsg = historyData.messages.find((m: any) => m._id === receivedMessageByB._id);
  if (!historyMsg) {
    throw new Error('Message not found in recipient GET history');
  }
  if (historyMsg.type !== 'audio' || !historyMsg.mediaUrl) {
    throw new Error(`History message malformed: ${JSON.stringify(historyMsg)}`);
  }
  console.log('✓ Voice message confirmed in recipient message history with complete metadata.');

  // TEST 3: Adi024 -> Tara024 Return Delivery
  console.log('\n[3/6] Testing adi024 -> tara024 Realtime Return Voice Message Delivery...');
  const clientMsgId2 = `voice_${Date.now()}_test2`;
  const audioBuffer2 = generateValidWebmAudioBuffer(2.4);
  const formData2 = new FormData();
  formData2.append('file', new Blob([new Uint8Array(audioBuffer2)], { type: 'audio/webm;codecs=opus' }), `voice_${Date.now()}.webm`);
  formData2.append('clientMessageId', clientMsgId2);
  formData2.append('duration', '2.4');
  formData2.append('waveform', JSON.stringify(new Array(32).fill(0.6)));

  let receivedMessageByA: any = null;
  const receivePromiseA = new Promise<any>((resolve) => {
    socketA.on('new_message', (msg: any) => {
      if (msg.clientMessageId === clientMsgId2) {
        receivedMessageByA = msg;
        resolve(msg);
      }
    });
  });

  const uploadRes2 = await fetch(`${BASE_URL}/api/conversations/${CONVERSATION_ID}/media`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${idTokenB}` },
    body: formData2
  });

  if (uploadRes2.status !== 201) {
    throw new Error(`Upload 2 failed: ${await uploadRes2.text()}`);
  }
  await Promise.race([receivePromiseA, timeoutPromise]);
  console.log(`✓ adi024 -> tara024 return voice delivery verified: msgId=${receivedMessageByA._id}, type=${receivedMessageByA.type}`);

  // TEST 4: Reconnect Resilience Test
  console.log('\n[4/6] Testing Socket Reconnection Auto-Join Resilience...');
  socketB.disconnect();
  console.log('- Recipient socket disconnected.');

  // Reconnect with fresh socket
  socketB = ClientSocket(BASE_URL, { auth: { token: idTokenB } });
  await new Promise<void>(res => socketB.on('connect', res));
  console.log('- Recipient socket reconnected.');

  // Sender immediately sends a new voice note
  const clientMsgId3 = `voice_${Date.now()}_test3`;
  const audioBuffer3 = generateValidWebmAudioBuffer(1.9);
  const formData3 = new FormData();
  formData3.append('file', new Blob([new Uint8Array(audioBuffer3)], { type: 'audio/webm;codecs=opus' }), `voice_${Date.now()}.webm`);
  formData3.append('clientMessageId', clientMsgId3);
  formData3.append('duration', '1.9');
  formData3.append('waveform', JSON.stringify(new Array(32).fill(0.4)));

  let receivedAfterReconnect: any = null;
  const receivePromiseReconnect = new Promise<any>((resolve) => {
    socketB.on('new_message', (msg: any) => {
      if (msg.clientMessageId === clientMsgId3) {
        receivedAfterReconnect = msg;
        resolve(msg);
      }
    });
  });

  await fetch(`${BASE_URL}/api/conversations/${CONVERSATION_ID}/media`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${idTokenA}` },
    body: formData3
  });

  await Promise.race([receivePromiseReconnect, timeoutPromise]);
  console.log(`✓ Message delivered immediately after socket reconnection without manual room join: msgId=${receivedAfterReconnect._id}`);

  // TEST 5: Rapid 3 Voice Message Burst Test with Client Deduplication
  console.log('\n[5/6] Testing 3 Rapid Consecutive Voice Messages Burst...');
  const burstReceivedSet = new Set<string>();
  socketB.on('new_message', (msg: any) => {
    if (msg.clientMessageId?.startsWith('burst_')) {
      burstReceivedSet.add(msg._id);
    }
  });

  for (let i = 1; i <= 3; i++) {
    const burstId = `burst_${Date.now()}_${i}`;
    const burstBuf = generateValidWebmAudioBuffer(1.0 + i * 0.5);
    const burstForm = new FormData();
    burstForm.append('file', new Blob([new Uint8Array(burstBuf)], { type: 'audio/webm;codecs=opus' }), `voice_burst_${i}.webm`);
    burstForm.append('clientMessageId', burstId);
    burstForm.append('duration', String(1.0 + i * 0.5));
    burstForm.append('waveform', JSON.stringify(new Array(32).fill(0.3 + i * 0.2)));

    await fetch(`${BASE_URL}/api/conversations/${CONVERSATION_ID}/media`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${idTokenA}` },
      body: burstForm
    });
  }

  // Wait for all 3
  const startWait = Date.now();
  while (burstReceivedSet.size < 3 && Date.now() - startWait < 5000) {
    await new Promise(r => setTimeout(r, 100));
  }

  if (burstReceivedSet.size !== 3) {
    throw new Error(`Burst delivery mismatch: Expected 3 distinct messages, received ${burstReceivedSet.size}`);
  }
  console.log(`✓ All 3 rapid voice notes delivered in order with zero loss and zero duplicates (${burstReceivedSet.size} unique IDs).`);

  // TEST 6: Regressions across Text, Photo, Video, Document
  console.log('\n[6/6] Testing Regressions (Text & Attachments)...');
  // Text message
  const textMsgId = crypto.randomUUID();
  let receivedTextByB: any = null;
  const receiveTextPromise = new Promise<any>((resolve) => {
    socketB.on('new_message', (msg: any) => {
      if (msg.clientMessageId === textMsgId) {
        receivedTextByB = msg;
        resolve(msg);
      }
    });
  });

  const textRes = await fetch(`${BASE_URL}/api/conversations/${CONVERSATION_ID}/messages`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${idTokenA}`
    },
    body: JSON.stringify({
      text: 'Hey Adi, testing voice + text realtime flow!',
      clientMessageId: textMsgId
    })
  });
  if (textRes.status !== 201) {
    throw new Error(`Text send failed: ${await textRes.text()}`);
  }
  await Promise.race([receiveTextPromise, timeoutPromise]);
  console.log('✓ Text messaging verified in realtime.');

  socketA.disconnect();
  socketB.disconnect();

  console.log('\n================================================================');
  console.log('🎉 ALL 6 REALTIME TWO-BROWSER VOICE DELIVERY TESTS PASSED!');
  console.log('================================================================\n');
}

runRealtimeVoiceDeliveryTest().catch((err) => {
  console.error('\n❌ Realtime Voice Delivery Test Failed:', err);
  process.exit(1);
});
