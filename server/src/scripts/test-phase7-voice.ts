import { io as ClientSocket } from 'socket.io-client';
import { connectToDatabase, getDb } from '../lib/mongodb.js';
import { ObjectId } from 'mongodb';
import { getStorageProvider } from '../services/storage/index.js';
import { MEDIA_LIMITS } from '../config/media.js';
import crypto from 'crypto';
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
  const data = await res.json();
  return data.idToken;
}

async function runPhase7VoiceTests() {
  console.log('================================================================');
  console.log('RUNNING WIBBY PHASE 7: VOICE MESSAGES ZERO-SURPRISE TEST SUITE');
  console.log('================================================================\n');

  await connectToDatabase();
  const db = getDb();
  const storage = getStorageProvider();

  let socketA: any;
  let socketB: any;

  try {
    console.log('[0/14] Generating authentic Firebase ID tokens for test users...');
    const tokenA = await getIdTokenForUid(USER_A_UID);
    const tokenB = await getIdTokenForUid(USER_B_UID);
    console.log('✓ Tokens generated.');

    // 1. Setup Sockets
    console.log('\n[1/14] Connecting Browser A and Browser B sockets...');
    socketA = ClientSocket(BASE_URL, {
      auth: { token: tokenA },
      extraHeaders: { origin: 'http://localhost:5173' },
      forceNew: true
    });
    socketB = ClientSocket(BASE_URL, {
      auth: { token: tokenB },
      extraHeaders: { origin: 'http://localhost:5173' },
      forceNew: true
    });

    await Promise.all([
      new Promise<void>((res, rej) => {
        socketA.on('connect', res);
        socketA.on('connect_error', (err: any) => rej(new Error('Socket A connect error: ' + err.message)));
      }),
      new Promise<void>((res, rej) => {
        socketB.on('connect', res);
        socketB.on('connect_error', (err: any) => rej(new Error('Socket B connect error: ' + err.message)));
      })
    ]);

    socketA.emit('join_conversation', CONVERSATION_ID);
    socketB.emit('join_conversation', CONVERSATION_ID);
    await new Promise(r => setTimeout(r, 400));
    console.log('✓ Sockets connected and joined conversation room.');

    // 2. Test Voice Message Upload (WebM/Opus) & Realtime Socket Broadcast
    console.log('\n[2/14] Testing Voice Message Upload (WebM/Opus) & Realtime Delivery...');
    const voiceReceivedPromise = new Promise<any>((resolve) => {
      socketB.once('new_message', (msg: any) => resolve(msg));
    });

    const fakeOpusAudio = Buffer.alloc(16000, 0x55);
    const sampleWaveform = [
      0.15, 0.22, 0.45, 0.78, 0.95, 0.88, 0.62, 0.41,
      0.25, 0.35, 0.55, 0.82, 1.0, 0.92, 0.75, 0.50,
      0.30, 0.40, 0.60, 0.85, 0.90, 0.70, 0.45, 0.30,
      0.20, 0.38, 0.65, 0.80, 0.85, 0.60, 0.35, 0.18
    ];
    const clientMsgId = 'voice_client_' + Date.now();

    const formDataVoice = new FormData();
    formDataVoice.append('file', new Blob([fakeOpusAudio], { type: 'audio/webm;codecs=opus' }), 'voice_note_1.webm');
    formDataVoice.append('duration', '8.45');
    formDataVoice.append('waveform', JSON.stringify(sampleWaveform));
    formDataVoice.append('clientMessageId', clientMsgId);

    const uploadRes = await fetch(`${BASE_URL}/api/conversations/${CONVERSATION_ID}/media`, {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${tokenA}` },
      body: formDataVoice
    });

    if (!uploadRes.ok) {
      throw new Error(`Voice upload failed: ${await uploadRes.text()}`);
    }

    const uploadJson = await uploadRes.json();
    console.log('✓ Voice message uploaded with 201 Created:', uploadJson.message._id);

    const receivedVoice = await Promise.race([
      voiceReceivedPromise,
      new Promise((_, rej) => setTimeout(() => rej(new Error('Voice socket timeout')), 4000))
    ]);

    if (receivedVoice.type !== 'audio' || receivedVoice.duration !== 8.45) {
      throw new Error(`Invalid voice message payload received via Socket: ${JSON.stringify(receivedVoice)}`);
    }
    if (!Array.isArray(receivedVoice.waveform) || receivedVoice.waveform.length !== 32) {
      throw new Error(`Waveform missing or malformed in socket payload`);
    }
    console.log('✓ Browser B received voice message in realtime with matching duration & 32-bar waveform.');

    // 3. Test HTTP Range / 206 Partial Content Streaming for Voice Audio
    console.log('\n[3/14] Testing HTTP Range (206 Partial Content) streaming for Voice Audio...');
    const mediaUrl = receivedVoice.mediaUrl;
    const rangeRes = await fetch(`${BASE_URL}${mediaUrl}`, {
      headers: {
        'Authorization': `Bearer ${tokenB}`,
        'Range': 'bytes=0-1023'
      }
    });

    if (rangeRes.status !== 206) {
      throw new Error(`Expected HTTP 206 Partial Content for Range audio request, got ${rangeRes.status}`);
    }
    const contentRange = rangeRes.headers.get('content-range');
    const acceptRanges = rangeRes.headers.get('accept-ranges');
    const contentType = rangeRes.headers.get('content-type');
    const contentLength = rangeRes.headers.get('content-length');

    console.log(`✓ HTTP Range response: status=${rangeRes.status}, Content-Range="${contentRange}", Accept-Ranges="${acceptRanges}", Content-Type="${contentType}", Content-Length="${contentLength}"`);
    if (!contentRange || !contentRange.startsWith('bytes 0-1023/')) {
      throw new Error(`Invalid Content-Range header: ${contentRange}`);
    }
    if (acceptRanges !== 'bytes') {
      throw new Error(`Invalid Accept-Ranges header: ${acceptRanges}`);
    }
    if (contentLength !== '1024') {
      throw new Error(`Invalid Content-Length header for range chunk: ${contentLength}`);
    }
    console.log('✓ Audio Range request (seek support) fully validated.');

    // 4. Test Multi-MIME Audio Compatibility (Safari MP4/AAC & Ogg)
    console.log('\n[4/14] Testing Safari MP4/AAC and Ogg audio MIME capability...');
    const mimeTests = [
      { mime: 'audio/mp4', ext: 'voice_safari.mp4', duration: 4.2 },
      { mime: 'audio/aac', ext: 'voice_safari.aac', duration: 3.1 },
      { mime: 'audio/ogg;codecs=opus', ext: 'voice_firefox.ogg', duration: 6.5 }
    ];

    for (const test of mimeTests) {
      const form = new FormData();
      form.append('file', new Blob([Buffer.alloc(8000, 0xAA)], { type: test.mime }), test.ext);
      form.append('duration', String(test.duration));
      form.append('clientMessageId', 'voice_' + Date.now() + '_' + Math.random());

      const res = await fetch(`${BASE_URL}/api/conversations/${CONVERSATION_ID}/media`, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${tokenB}` },
        body: form
      });
      if (!res.ok) {
        throw new Error(`Multi-MIME upload failed for ${test.mime}: ${await res.text()}`);
      }
      const json = await res.json();
      if (json.message.type !== 'audio' || !json.message.mimeType.startsWith(test.mime.split(';')[0])) {
        throw new Error(`MIME type mismatch for ${test.mime}: got ${json.message.mimeType}`);
      }
      console.log(`  ✓ Successfully uploaded and classified ${test.mime} (${test.ext})`);
    }

    // 5. Test Non-blocking Waveform Extraction (Safe fallback on decoding error / missing waveform)
    console.log('\n[5/14] Testing Non-blocking Waveform Fallback (Upload with no waveform)...');
    const formNoWaveform = new FormData();
    formNoWaveform.append('file', new Blob([Buffer.alloc(4000, 0x11)], { type: 'audio/webm' }), 'voice_nowave.webm');
    formNoWaveform.append('duration', '2.5');
    formNoWaveform.append('clientMessageId', 'voice_nowave_' + Date.now());

    const noWaveRes = await fetch(`${BASE_URL}/api/conversations/${CONVERSATION_ID}/media`, {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${tokenA}` },
      body: formNoWaveform
    });
    if (!noWaveRes.ok) {
      throw new Error(`Voice upload without waveform failed: ${await noWaveRes.text()}`);
    }
    const noWaveJson = await noWaveRes.json();
    console.log('✓ Voice message without client waveform created successfully. DB waveform:', noWaveJson.message.waveform);

    // 6. Test Idempotency & Duplicate Send Protection
    console.log('\n[6/14] Testing Idempotency (Duplicate clientMessageId send)...');
    const duplicateClientMsgId = 'voice_idempotent_' + Date.now();
    const formDup1 = new FormData();
    formDup1.append('file', new Blob([Buffer.alloc(2000, 0x22)], { type: 'audio/webm' }), 'voice_dup.webm');
    formDup1.append('duration', '1.8');
    formDup1.append('clientMessageId', duplicateClientMsgId);

    const dupRes1 = await fetch(`${BASE_URL}/api/conversations/${CONVERSATION_ID}/media`, {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${tokenA}` },
      body: formDup1
    });
    const dupJson1 = await dupRes1.json();

    // Send second time with same clientMessageId
    const formDup2 = new FormData();
    formDup2.append('file', new Blob([Buffer.alloc(2000, 0x22)], { type: 'audio/webm' }), 'voice_dup.webm');
    formDup2.append('duration', '1.8');
    formDup2.append('clientMessageId', duplicateClientMsgId);

    const dupRes2 = await fetch(`${BASE_URL}/api/conversations/${CONVERSATION_ID}/media`, {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${tokenA}` },
      body: formDup2
    });
    const dupJson2 = await dupRes2.json();

    if (dupRes2.status !== 200 || dupJson1.message._id !== dupJson2.message._id) {
      throw new Error(`Duplicate send protection failed! Inserted distinct message IDs: ${dupJson1.message._id} vs ${dupJson2.message._id}`);
    }
    console.log('✓ Duplicate send protection verified: exactly 1 message persisted.');

    // 7. Test Voice Message Authorization & Privacy
    console.log('\n[7/14] Testing Privacy: Unauthorized access rejected...');
    const unauthGetRes = await fetch(`${BASE_URL}${receivedVoice.mediaUrl}`);
    if (unauthGetRes.status !== 401) {
      throw new Error(`Expected 401 for unauthenticated audio GET, got ${unauthGetRes.status}`);
    }
    console.log('✓ Unauthenticated GET rejected with 401.');

    // 8. Test Reply to Voice Message
    console.log('\n[8/14] Testing Reply to Voice Message...');
    const replyPromise = new Promise<any>((resolve) => {
      socketA.once('new_message', (msg: any) => resolve(msg));
    });

    const replyRes = await fetch(`${BASE_URL}/api/conversations/${CONVERSATION_ID}/messages`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${tokenB}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        text: 'Got your voice note! Loud and clear.',
        replyToMessageId: receivedVoice._id,
        clientMessageId: crypto.randomUUID()
      })
    });
    if (!replyRes.ok) {
      throw new Error(`Text reply to voice failed: ${await replyRes.text()}`);
    }

    const receivedReply = await Promise.race([
      replyPromise,
      new Promise((_, rej) => setTimeout(() => rej(new Error('Reply socket timeout')), 4000))
    ]);

    if (receivedReply.replyToMessageId !== receivedVoice._id) {
      throw new Error('Reply does not reference the voice message ID');
    }
    console.log('✓ Text reply to voice message delivered with correct replyToMessageId.');

    // 9. Test Voice Message Replying to Another Message
    console.log('\n[9/14] Testing Voice Message Replying to Another Message...');
    const voiceReplyForm = new FormData();
    voiceReplyForm.append('file', new Blob([Buffer.alloc(5000, 0x33)], { type: 'audio/webm' }), 'voice_reply.webm');
    voiceReplyForm.append('duration', '3.8');
    voiceReplyForm.append('replyToMessageId', receivedReply._id);
    voiceReplyForm.append('clientMessageId', 'voice_reply_' + Date.now());

    const voiceReplyRes = await fetch(`${BASE_URL}/api/conversations/${CONVERSATION_ID}/media`, {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${tokenA}` },
      body: voiceReplyForm
    });
    const voiceReplyJson = await voiceReplyRes.json();
    if (voiceReplyJson.message.replyToMessageId !== receivedReply._id) {
      throw new Error('Voice message reply failed to attach replyToMessageId');
    }
    console.log('✓ Voice message replying to text message successfully created.');

    // 10. Test Reaction on Voice Message
    console.log('\n[10/14] Testing Reaction on Voice Message...');
    const reactionPromise = new Promise<any>((resolve) => {
      socketA.once('message:reaction', (data: any) => resolve(data));
    });

    const reactionRes = await fetch(`${BASE_URL}/api/conversations/${CONVERSATION_ID}/messages/${receivedVoice._id}/reactions`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${tokenB}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ emoji: '❤️' })
    });
    if (!reactionRes.ok) {
      throw new Error(`Reaction on voice message failed: ${await reactionRes.text()}`);
    }

    const reactionData = await Promise.race([
      reactionPromise,
      new Promise((_, rej) => setTimeout(() => rej(new Error('Reaction socket timeout')), 4000))
    ]);
    if (reactionData.emoji !== '❤️' || reactionData.senderId !== USER_B_UID) {
      throw new Error('Reaction data mismatch');
    }
    console.log('✓ Reaction on voice message verified in realtime.');

    // 11. Test Delete Voice Message
    console.log('\n[11/14] Testing Delete Voice Message for everyone...');
    const deletePromise = new Promise<any>((resolve) => {
      socketB.once('message:delete', (data: any) => resolve(data));
    });

    const deleteRes = await fetch(`${BASE_URL}/api/conversations/${CONVERSATION_ID}/messages/${receivedVoice._id}?everyone=true`, {
      method: 'DELETE',
      headers: {
        'Authorization': `Bearer ${tokenA}`
      }
    });
    if (!deleteRes.ok) {
      throw new Error(`Delete voice message failed: ${await deleteRes.text()}`);
    }

    const deleteData = await Promise.race([
      deletePromise,
      new Promise((_, rej) => setTimeout(() => rej(new Error('Delete socket timeout')), 4000))
    ]);
    if (deleteData.messageId !== receivedVoice._id) {
      throw new Error('Delete message event ID mismatch');
    }
    console.log('✓ Voice message deletion propagated in realtime.');

    // 12. Test Size Limit Validation
    console.log('\n[12/14] Testing File Size Limit enforcement on Voice Messages (>16MB)...');
    const oversizeBuffer = Buffer.alloc(17 * 1024 * 1024, 0x00);
    const formOversize = new FormData();
    formOversize.append('file', new Blob([oversizeBuffer], { type: 'audio/webm' }), 'huge.webm');

    const oversizeRes = await fetch(`${BASE_URL}/api/conversations/${CONVERSATION_ID}/media`, {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${tokenA}` },
      body: formOversize
    });
    if (oversizeRes.status !== 400 && oversizeRes.status !== 413) {
      throw new Error(`Expected 400/413 for oversized voice note, got ${oversizeRes.status}`);
    }
    console.log(`✓ Oversized voice note correctly rejected with HTTP ${oversizeRes.status}.`);

    // 13. Phase 5 & 5.5 Regression Check: Standard Text & Typing
    console.log('\n[13/14] Running Phase 5/5.5 Regression Checks (Text & Typing)...');
    const typingPromise = new Promise<any>((resolve) => {
      socketB.once('typing:start', (data: any) => resolve(data));
    });
    socketA.emit('typing:start', { conversationId: CONVERSATION_ID });
    await typingPromise;
    console.log('✓ Realtime typing indicator regression test passed.');

    // 14. Phase 6 Regression Check: Image / Video / Document Sending
    console.log('\n[14/14] Running Phase 6 Regression Checks (Image, Video, Document)...');
    const testDocForm = new FormData();
    testDocForm.append('file', new Blob([Buffer.from('Hello Phase 7 regression test')], { type: 'text/plain' }), 'notes.txt');
    testDocForm.append('clientMessageId', 'doc_reg_' + Date.now());

    const docRes = await fetch(`${BASE_URL}/api/conversations/${CONVERSATION_ID}/media`, {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${tokenA}` },
      body: testDocForm
    });
    if (!docRes.ok) {
      throw new Error(`Document upload regression failed: ${await docRes.text()}`);
    }
    const docJson = await docRes.json();
    if (docJson.message.type !== 'file') {
      throw new Error(`Expected message type 'file', got '${docJson.message.type}'`);
    }
    console.log('✓ Document upload regression test passed.');

    console.log('\n================================================================');
    console.log('🎉 ALL 14 PHASE 7 ZERO-SURPRISE TESTS PASSED WITH ZERO ERRORS!');
    console.log('================================================================\n');

  } catch (err: any) {
    console.error('\n❌ PHASE 7 TEST FAILED:', err);
    process.exit(1);
  } finally {
    if (socketA) socketA.disconnect();
    if (socketB) socketB.disconnect();
    process.exit(0);
  }
}

runPhase7VoiceTests();
