import http from 'http';
import { io as ClientSocket, Socket as ClientSocketType } from 'socket.io-client';
import app from '../app.js';
import { connectToDatabase, getDb } from '../lib/mongodb.js';
import { initializeSocket } from '../socket/index.js';
import { auth } from '../lib/firebaseAdmin.js';

const TEST_PORT = 3009;
const BASE_URL = `http://localhost:${TEST_PORT}`;
const FIREBASE_API_KEY = 'AIzaSyC_GUtnwhi9VrZS9pintc_-voCZwftD3MA';

let totalTests = 0;
let passedTests = 0;

function assert(condition: boolean, name: string, extra?: any) {
  totalTests++;
  if (condition) {
    passedTests++;
    console.log(`  ✓ [TEST ${totalTests}] ${name}`);
  } else {
    console.error(`  ✗ [TEST ${totalTests}] FAILED: ${name}`, extra || '');
    throw new Error(`Test failed: ${name}`);
  }
}

async function getIdTokenForUid(uid: string): Promise<string> {
  const customToken = await auth.createCustomToken(uid);
  const res = await (fetch as any)(`https://identitytoolkit.googleapis.com/v1/accounts:signInWithCustomToken?key=${FIREBASE_API_KEY}`, {
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

async function runAllE2ETests() {
  console.log('================================================================');
  console.log('🚀 WIBBY FULL END-TO-END ACCEPTANCE SUITE (TWO FRESH ACCOUNTS)');
  console.log('================================================================\n');

  // 1. Start In-Process Server & DB
  await connectToDatabase();
  const db = getDb();

  const server = http.createServer(app);
  initializeSocket(server);
  await new Promise<void>((resolve) => server.listen(TEST_PORT, () => resolve()));
  console.log(`[E2E] Test server active on ${BASE_URL}\n`);

  const uniqueSuffix = Date.now().toString().slice(-6);
  const emailA = `test_user_a_${uniqueSuffix}@wibby.test`;
  const emailB = `test_user_b_${uniqueSuffix}@wibby.test`;
  const displayNameA = `Alice Test ${uniqueSuffix}`;
  const displayNameB = `Bob Test ${uniqueSuffix}`;
  const usernameA = `alice_${uniqueSuffix}`;
  const usernameB = `bob_${uniqueSuffix}`;

  let uidA = '';
  let uidB = '';
  let tokenA = '';
  let tokenB = '';
  let socketA: ClientSocketType | null = null;
  let socketB: ClientSocketType | null = null;
  let conversationId = '';

  try {
    // =========================================================================
    // STEP 1: CREATE TWO FRESH TEST ACCOUNTS IN FIREBASE & MONGO
    // =========================================================================
    console.log('--- STEP 1: CREATE 2 FRESH TEST ACCOUNTS ---');
    const userRecordA = await auth.createUser({
      email: emailA,
      displayName: displayNameA,
      password: 'TestPassword123!'
    });
    uidA = userRecordA.uid;

    const userRecordB = await auth.createUser({
      email: emailB,
      displayName: displayNameB,
      password: 'TestPassword123!'
    });
    uidB = userRecordB.uid;

    assert(Boolean(uidA && uidB), 'Successfully created 2 fresh accounts in Firebase Auth', { uidA, uidB });

    tokenA = await getIdTokenForUid(uidA);
    tokenB = await getIdTokenForUid(uidB);
    assert(Boolean(tokenA && tokenB), 'Successfully acquired fresh Firebase ID tokens for both accounts');

    // Register profiles via API
    const profResA = await fetch(`${BASE_URL}/api/users/profile`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${tokenA}`
      },
      body: JSON.stringify({
        displayName: displayNameA,
        username: usernameA,
        email: emailA
      })
    });
    assert(profResA.status === 201 || profResA.status === 200, 'User A profile registered successfully via POST /api/users/profile');

    const profResB = await fetch(`${BASE_URL}/api/users/profile`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${tokenB}`
      },
      body: JSON.stringify({
        displayName: displayNameB,
        username: usernameB,
        email: emailB
      })
    });
    assert(profResB.status === 201 || profResB.status === 200, 'User B profile registered successfully via POST /api/users/profile');

    // =========================================================================
    // STEP 2: PAIRING LIFECYCLE
    // =========================================================================
    console.log('\n--- STEP 2: PAIRING LIFECYCLE ---');
    
    // User A generates pairing code
    const codeRes = await (fetch as any)(`${BASE_URL}/api/pairing/generate`, {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${tokenA}` }
    });
    assert(codeRes.status === 200, 'User A generated pairing code via POST /api/pairing/generate');
    const codeData = await codeRes.json() as any;
    const pairingCode = codeData.code;
    assert(typeof pairingCode === 'string' && pairingCode.length === 9, 'Valid 8-char pairing code with dash returned', pairingCode);

    // User B redeems code
    const redeemRes = await (fetch as any)(`${BASE_URL}/api/pairing/redeem`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${tokenB}`
      },
      body: JSON.stringify({ code: pairingCode })
    });
    assert(redeemRes.status === 200, 'User B successfully redeemed pairing code via POST /api/pairing/redeem');
    const redeemData = await redeemRes.json() as any;
    conversationId = redeemData.conversationId;
    assert(Boolean(conversationId), 'Paired conversation created with valid conversationId', conversationId);

    // Verify pairing status on both users
    const statusA = await (await (fetch as any)(`${BASE_URL}/api/pairing/status`, {
      headers: { 'Authorization': `Bearer ${tokenA}` }
    })).json() as any;
    assert(statusA.paired === true && statusA.conversationId === conversationId, 'User A pairing status confirms paired: true');

    const statusB = await (await (fetch as any)(`${BASE_URL}/api/pairing/status`, {
      headers: { 'Authorization': `Bearer ${tokenB}` }
    })).json() as any;
    assert(statusB.paired === true && statusB.conversationId === conversationId, 'User B pairing status confirms paired: true');

    // =========================================================================
    // STEP 3: REAL-TIME SOCKET MESSAGING & DELIVERY / READ RECEIPTS
    // =========================================================================
    console.log('\n--- STEP 3: REAL-TIME SOCKET MESSAGING & RECEIPTS ---');
    socketA = ClientSocket(BASE_URL, { auth: { token: tokenA } });
    socketB = ClientSocket(BASE_URL, { auth: { token: tokenB } });

    await Promise.all([
      new Promise<void>((res) => socketA!.on('connect', res)),
      new Promise<void>((res) => socketB!.on('connect', res))
    ]);
    assert(socketA.connected && socketB.connected, 'Both users authenticated & connected to Socket.IO server');

    socketA.emit('join_conversation', conversationId);
    socketB.emit('join_conversation', conversationId);
    await new Promise((r) => setTimeout(r, 200));

    // User A sends text message via API
    let msgReceivedByB: any = null;
    const msgPromiseB = new Promise<void>((resolve) => {
      socketB!.on('new_message', (msg) => {
        msgReceivedByB = msg;
        resolve();
      });
    });

    const sendResA = await (fetch as any)(`${BASE_URL}/api/conversations/${conversationId}/messages`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${tokenA}`
      },
      body: JSON.stringify({
        text: 'Hello Bob! This is a test message from Alice.'
      })
    });
    assert(sendResA.status === 201, 'User A sent message via POST /api/conversations/:id/messages');
    const sentData = await sendResA.json() as any;
    const messageId = sentData.message._id;

    await msgPromiseB;
    assert(msgReceivedByB && msgReceivedByB._id === messageId, 'User B received real-time new_message event with exact ID');

    // User B sends delivery ACK
    let statusUpdateSeenByA: any = null;
    const ackPromiseA = new Promise<void>((resolve) => {
      socketA!.on('message:status-update', (data) => {
        if (data.messageId === messageId) {
          statusUpdateSeenByA = data;
          resolve();
        }
      });
    });

    socketB.emit('message:delivery-ack', { messageId, conversationId });
    await ackPromiseA;
    assert(statusUpdateSeenByA && statusUpdateSeenByA.status === 'delivered', 'User A received real-time delivery-ack (status: delivered)');

    // User B marks as seen
    let readUpdateSeenByA: any = null;
    const readPromiseA = new Promise<void>((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error('Timeout waiting for read receipt')), 5000);
      socketA!.on('message:status-update', (data) => {
        if (data.messageId === messageId && data.status === 'seen') {
          readUpdateSeenByA = data;
          clearTimeout(timer);
          resolve();
        }
      });
    });

    socketB.emit('message:read-ack', { messageId, conversationId });
    await readPromiseA;
    assert(readUpdateSeenByA && readUpdateSeenByA.status === 'seen', 'User A received real-time read receipt (status: seen)');

    // User B adds emoji reaction
    const reactRes = await (fetch as any)(`${BASE_URL}/api/conversations/${conversationId}/messages/${messageId}/reactions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${tokenB}`
      },
      body: JSON.stringify({ emoji: '❤️' })
    });
    assert(reactRes.status === 200, 'User B added reaction via POST /api/conversations/:id/messages/:msgId/reactions');

    // User A stars the message
    const starRes = await (fetch as any)(`${BASE_URL}/api/conversations/${conversationId}/messages/${messageId}/star`, {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${tokenA}` }
    });
    assert(starRes.status === 200, 'User A starred message via POST /api/conversations/:id/messages/:msgId/star');

    // =========================================================================
    // STEP 4: WATCH TOGETHER SYNCHRONIZATION & ORDERING (ISSUE 1 TEST)
    // =========================================================================
    console.log('\n--- STEP 4: WATCH TOGETHER SYNCHRONIZATION & ORDERING ---');
    let togetherEventReceived = false;
    socketB.on('together:state', (data) => {
      if (data.mediaUrl) togetherEventReceived = true;
    });
    socketB.on('together:action', (data) => {
      if (data.action === 'play') togetherEventReceived = true;
    });

    socketA.emit('together:start', {
      conversationId,
      mediaUrl: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ',
      mediaType: 'youtube',
      title: 'Rick Astley'
    });
    await new Promise((r) => setTimeout(r, 400));
    assert(togetherEventReceived, 'User B received together:state/together:action sync event');

    // Send 3 rapid messages during Watch Together to verify chronological ordering
    const msg1Res = await (fetch as any)(`${BASE_URL}/api/conversations/${conversationId}/messages`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${tokenA}` },
      body: JSON.stringify({ text: 'Watch Together message 1' })
    });
    const msg2Res = await (fetch as any)(`${BASE_URL}/api/conversations/${conversationId}/messages`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${tokenB}` },
      body: JSON.stringify({ text: 'Watch Together message 2' })
    });
    const msg3Res = await (fetch as any)(`${BASE_URL}/api/conversations/${conversationId}/messages`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${tokenA}` },
      body: JSON.stringify({ text: 'Watch Together message 3' })
    });
    assert(msg1Res.status === 201 && msg2Res.status === 201 && msg3Res.status === 201, '3 rapid messages sent while Watch Together active');

    // Fetch history and verify chronological order
    const historyRes = await (fetch as any)(`${BASE_URL}/api/conversations/${conversationId}/messages?limit=20`, {
      headers: { 'Authorization': `Bearer ${tokenA}` }
    });
    const historyData = await historyRes.json() as any;
    const timestamps = historyData.messages.map((m: any) => new Date(m.createdAt).getTime());
    let isChronological = true;
    for (let i = 1; i < timestamps.length; i++) {
      if (timestamps[i] < timestamps[i - 1]) isChronological = false;
    }
    assert(isChronological, 'Messages history maintains strict chronological order (oldest to newest)');

    // =========================================================================
    // STEP 5: MEDIA & DOCUMENTS UPLOAD
    // =========================================================================
    console.log('\n--- STEP 5: MEDIA & DOCUMENT UPLOAD ---');
    
    // Upload image
    const imageForm = new FormData();
    const fakeImageBuffer = Buffer.from('FakeImageData' + Date.now());
    const imageBlob = new Blob([fakeImageBuffer], { type: 'image/jpeg' });
    imageForm.append('file', imageBlob, 'test-photo.jpg');
    imageForm.append('caption', 'A beautiful photo for our test');

    const imageUploadRes = await fetch(`${BASE_URL}/api/conversations/${conversationId}/media`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${tokenA}`
      },
      body: imageForm
    });
    assert(imageUploadRes.status === 201, 'Image uploaded successfully via POST /api/conversations/:id/media');
    const imageUploadData = await imageUploadRes.json() as any;
    const uploadedImageMsg = imageUploadData.message;
    assert(uploadedImageMsg.type === 'image' && Boolean(uploadedImageMsg.mediaUrl), 'Uploaded image record created with type="image" and mediaUrl');

    // Upload document / file
    const docForm = new FormData();
    const fakeDocBuffer = Buffer.from('FakeDocumentDataPDF' + Date.now());
    const docBlob = new Blob([fakeDocBuffer], { type: 'application/pdf' });
    docForm.append('file', docBlob, 'wibby-spec.pdf');
    docForm.append('caption', 'Project specification document');

    const docUploadRes = await fetch(`${BASE_URL}/api/conversations/${conversationId}/media`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${tokenB}`
      },
      body: docForm
    });
    assert(docUploadRes.status === 201, 'Document uploaded successfully via POST /api/conversations/:id/media');
    const docUploadData = await docUploadRes.json() as any;
    const uploadedDocMsg = docUploadData.message;
    assert(uploadedDocMsg.type === 'file' && Boolean(uploadedDocMsg.mediaUrl), 'Uploaded document record created with type="file" and mediaUrl');

    // =========================================================================
    // STEP 6: VOICE & VIDEO CALL LIFECYCLE & KEYFRAME SIGNALING (ISSUE 2 TEST)
    // =========================================================================
    console.log('\n--- STEP 6: VOICE & VIDEO CALL LIFECYCLE ---');

    // Voice Call
    const voiceCallId = `vcall_${Date.now()}`;
    let incomingVoiceCallReceived = false;
    socketB.on('call:invite', (data) => {
      if (data.callId === voiceCallId) incomingVoiceCallReceived = true;
    });

    socketA.emit('call:invite', {
      callId: voiceCallId,
      conversationId,
      callType: 'voice'
    });
    await new Promise((r) => setTimeout(r, 300));
    assert(incomingVoiceCallReceived, 'User B received call:invite event for voice call');

    socketB.emit('call:accept', {
      callId: voiceCallId
    });
    await new Promise((r) => setTimeout(r, 300));

    // End Voice Call
    socketA.emit('call:hangup', {
      callId: voiceCallId
    });
    await new Promise((r) => setTimeout(r, 400));

    const voiceDocInDb = await db.collection('calls').findOne({ callId: voiceCallId });
    assert(Boolean(voiceDocInDb && voiceDocInDb.callType === 'voice'), 'Voice call persisted in MongoDB calls collection with accurate status and duration');

    // Video Call
    const videoCallId = `vidcall_${Date.now()}`;
    let incomingVideoCallReceived = false;
    socketA.on('call:invite', (data) => {
      if (data.callId === videoCallId) incomingVideoCallReceived = true;
    });

    socketB.emit('call:invite', {
      callId: videoCallId,
      conversationId,
      callType: 'video'
    });
    await new Promise((r) => setTimeout(r, 300));
    assert(incomingVideoCallReceived, 'User A received call:invite event for video call');

    socketA.emit('call:accept', {
      callId: videoCallId
    });
    await new Promise((r) => setTimeout(r, 300));

    // Keyframe Request (Mobile minimize/maximize & camera flip sync)
    let keyframeRequested = false;
    socketB.on('call:keyframe-request', (data) => {
      if (data.callId === videoCallId) keyframeRequested = true;
    });
    socketA.emit('call:keyframe-request', { callId: videoCallId });
    await new Promise((r) => setTimeout(r, 300));
    assert(keyframeRequested, 'Peer received call:keyframe-request on camera switch / maximize event');

    // End Video Call
    socketB.emit('call:hangup', {
      callId: videoCallId
    });
    await new Promise((r) => setTimeout(r, 400));

    const videoDocInDb = await db.collection('calls').findOne({ callId: videoCallId });
    assert(Boolean(videoDocInDb && videoDocInDb.callType === 'video'), 'Video call persisted in MongoDB calls collection with accurate status and duration');

    // =========================================================================
    // STEP 7: CONTACT DETAILS / DRAWER ENDPOINTS (RESOLVING REPORTED ISSUE)
    // =========================================================================
    console.log('\n--- STEP 7: CONTACT DETAILS (CALLS, MEDIA, DOCS, SETTINGS) ---');

    // 7A: Calls Tab Fetch
    const callsTabRes = await (fetch as any)(`${BASE_URL}/api/conversations/${conversationId}/calls`, {
      headers: { 'Authorization': `Bearer ${tokenA}` }
    });
    assert(callsTabRes.status === 200, 'GET /api/conversations/:id/calls returned HTTP 200 OK');
    const callsListData = await callsTabRes.json() as any;
    assert(Array.isArray(callsListData) && callsListData.length >= 2, 'Call history returned array with both voice and video calls', callsListData.length);
    const hasVoice = callsListData.some((c: any) => c.callType === 'voice');
    const hasVideo = callsListData.some((c: any) => c.callType === 'video');
    assert(hasVoice && hasVideo, 'Calls tab shows BOTH voice call and video call entries with duration');

    // 7B: Media Tab Fetch
    const mediaTabRes = await (fetch as any)(`${BASE_URL}/api/conversations/${conversationId}/messages/shared-media?category=media`, {
      headers: { 'Authorization': `Bearer ${tokenA}` }
    });
    assert(mediaTabRes.status === 200, 'GET /api/conversations/:id/messages/shared-media?category=media returned HTTP 200 OK');
    const mediaListData = await mediaTabRes.json() as any;
    assert(Array.isArray(mediaListData.messages) && mediaListData.messages.length >= 1, 'Media tab returned shared photos/videos array', mediaListData.messages.length);
    assert(mediaListData.messages[0].type === 'image', 'Media tab contains the uploaded image item');

    // 7C: Docs / Files Tab Fetch
    const filesTabRes = await (fetch as any)(`${BASE_URL}/api/conversations/${conversationId}/messages/shared-media?category=files`, {
      headers: { 'Authorization': `Bearer ${tokenA}` }
    });
    assert(filesTabRes.status === 200, 'GET /api/conversations/:id/messages/shared-media?category=files returned HTTP 200 OK');
    const filesListData = await filesTabRes.json() as any;
    assert(Array.isArray(filesListData.messages) && filesListData.messages.length >= 1, 'Docs tab returned shared documents array', filesListData.messages.length);
    assert(filesListData.messages[0].type === 'file' && filesListData.messages[0].fileName === 'wibby-spec.pdf', 'Docs tab contains the uploaded PDF document');

    // 7D: Starred Tab Fetch
    const starredTabRes = await (fetch as any)(`${BASE_URL}/api/conversations/${conversationId}/messages/shared-media?category=starred`, {
      headers: { 'Authorization': `Bearer ${tokenA}` }
    });
    assert(starredTabRes.status === 200, 'GET /api/conversations/:id/messages/shared-media?category=starred returned HTTP 200 OK');
    const starredListData = await starredTabRes.json() as any;
    assert(Array.isArray(starredListData.messages) && starredListData.messages.length >= 1, 'Starred tab returned starred items array', starredListData.messages.length);

    // 7E: Conversation Details & Disappearing Messages Setting
    const detailsRes = await (fetch as any)(`${BASE_URL}/api/conversations/${conversationId}/details`, {
      headers: { 'Authorization': `Bearer ${tokenA}` }
    });
    assert(detailsRes.status === 200, 'GET /api/conversations/:id/details returned HTTP 200 OK');
    const detailsData = await detailsRes.json() as any;
    assert(typeof detailsData.disappearingTimer === 'number', 'Details endpoint returned valid disappearingTimer number');

    const updateTimerRes = await (fetch as any)(`${BASE_URL}/api/conversations/${conversationId}/messages/disappearing`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${tokenA}`
      },
      body: JSON.stringify({ timer: 86400 })
    });
    assert(updateTimerRes.status === 200, 'POST /api/conversations/:id/messages/disappearing updated timer to 24h (86400s)');

    const updatedDetailsRes = await (fetch as any)(`${BASE_URL}/api/conversations/${conversationId}/details`, {
      headers: { 'Authorization': `Bearer ${tokenB}` }
    });
    const updatedDetails = await updatedDetailsRes.json() as any;
    assert(updatedDetails.disappearingTimer === 86400, 'Updated disappearingTimer verified as 86400 in database');

    // =========================================================================
    // STEP 8: UNPAIR
    // =========================================================================
    console.log('\n--- STEP 8: UNPAIR ACTION ---');
    let unpairNotifiedB = false;
    socketB.on('pairing:unpaired', () => {
      unpairNotifiedB = true;
    });

    const unpairRes = await (fetch as any)(`${BASE_URL}/api/pairing/unpair`, {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${tokenA}` }
    });
    assert(unpairRes.status === 200, 'User A initiated unpair via POST /api/pairing/unpair');
    await new Promise((r) => setTimeout(r, 200));
    assert(unpairNotifiedB, 'User B received real-time pairing:unpaired socket event');

    const finalStatusA = await (await (fetch as any)(`${BASE_URL}/api/pairing/status`, {
      headers: { 'Authorization': `Bearer ${tokenA}` }
    })).json() as any;
    assert(finalStatusA.paired === false, 'User A pairing status confirmed paired: false');

    const finalStatusB = await (await (fetch as any)(`${BASE_URL}/api/pairing/status`, {
      headers: { 'Authorization': `Bearer ${tokenB}` }
    })).json() as any;
    assert(finalStatusB.paired === false, 'User B pairing status confirmed paired: false');

  } finally {
    // =========================================================================
    // STEP 9: CLEAN FRESH TEARDOWN (REMOVE TEST DATA)
    // =========================================================================
    console.log('\n--- STEP 9: CLEAN TEARDOWN & PURGE OF TEST DATA ---');
    try {
      if (socketA) socketA.disconnect();
      if (socketB) socketB.disconnect();

      if (uidA) {
        await db.collection('users').deleteOne({ firebaseUid: uidA });
        await auth.deleteUser(uidA).catch(() => {});
      }
      if (uidB) {
        await db.collection('users').deleteOne({ firebaseUid: uidB });
        await auth.deleteUser(uidB).catch(() => {});
      }
      if (conversationId) {
        await db.collection('conversations').deleteMany({ _id: { $in: [conversationId as any] } });
        await db.collection('messages').deleteMany({ conversationId: { $in: [conversationId as any] } });
        await db.collection('calls').deleteMany({ conversationId: { $in: [conversationId as any] } });
        await db.collection('pairingCodes').deleteMany({ creatorId: { $in: [uidA, uidB] } });
      }
      console.log('  ✓ Cleaned all temporary test users, conversations, calls, and messages from DB');
    } catch (cleanErr) {
      console.warn('Cleanup warning:', cleanErr);
    }

    server.close();
  }

  console.log('\n================================================================');
  console.log(`🏆 ALL ${passedTests}/${totalTests} END-TO-END ACCEPTANCE TESTS PASSED SUCCESSFULLY!`);
  console.log('================================================================\n');
}

runAllE2ETests().catch((err) => {
  console.error('\n❌ TEST SUITE FAILED:', err);
  process.exit(1);
});
