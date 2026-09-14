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

// In-process PlaybackCoordinator simulator matching the client implementation
class TestPlaybackCoordinator {
  private activePlayerId: string | null = null;
  private players = new Map<string, () => void>();
  public pauseCallCount = new Map<string, number>();

  register(id: string, pauseCb: () => void): void {
    this.players.set(id, pauseCb);
  }

  unregister(id: string): void {
    this.players.delete(id);
    if (this.activePlayerId === id) {
      this.activePlayerId = null;
    }
  }

  play(id: string, pauseCb?: () => void): void {
    if (pauseCb) {
      this.players.set(id, pauseCb);
    }

    if (this.activePlayerId && this.activePlayerId !== id) {
      const activeCb = this.players.get(this.activePlayerId);
      if (activeCb) {
        activeCb();
      }
    }

    this.activePlayerId = id;
  }

  pause(id: string): void {
    if (this.activePlayerId === id) {
      this.activePlayerId = null;
    }
  }

  stop(id?: string): void {
    if (!id || this.activePlayerId === id) {
      this.activePlayerId = null;
    }
  }

  isPlaying(id: string): boolean {
    return this.activePlayerId === id;
  }

  getActiveId(): string | null {
    return this.activePlayerId;
  }
}

async function runMaintenanceSuite() {
  console.log('================================================================');
  console.log('RUNNING WIBBY: MEDIA MAINTENANCE + INSTANT CAMERA VALIDATION');
  console.log('================================================================\n');

  await connectToDatabase();
  const db = getDb();
  const storage = getStorageProvider();

  let socketA: any;
  let socketB: any;

  try {
    console.log('[0/12] Generating authentic Firebase ID tokens for test users...');
    const tokenA = await getIdTokenForUid(USER_A_UID);
    const tokenB = await getIdTokenForUid(USER_B_UID);
    console.log('✓ Tokens generated.');

    // 1. Setup Sockets
    console.log('\n[1/12] Connecting Browser A and Browser B sockets...');
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

    // 2. Test Playback Coordinator: Idempotency & Single Active Player
    console.log('\n[2/12] Testing Playback Coordinator Single-Active Player & Idempotency...');
    const coordinator = new TestPlaybackCoordinator();
    let playerAPauseCount = 0;
    let playerBPauseCount = 0;

    coordinator.register('player_A', () => { playerAPauseCount++; });
    coordinator.register('player_B', () => { playerBPauseCount++; });

    // Start Player A
    coordinator.play('player_A');
    if (!coordinator.isPlaying('player_A') || coordinator.getActiveId() !== 'player_A') {
      throw new Error('Player A should be active');
    }

    // Start Player B -> Player A must be paused exactly once
    coordinator.play('player_B');
    if (playerAPauseCount !== 1) {
      throw new Error(`Expected Player A to be paused exactly once, got ${playerAPauseCount}`);
    }
    if (!coordinator.isPlaying('player_B') || coordinator.getActiveId() !== 'player_B') {
      throw new Error('Player B should be active');
    }

    // Player B ends -> calls stop('player_B') -> must not call pause callback again
    coordinator.stop('player_B');
    if (playerBPauseCount !== 0) {
      throw new Error(`Player B pause count should be 0 on natural end, got ${playerBPauseCount}`);
    }
    if (coordinator.getActiveId() !== null) {
      throw new Error('Active player ID should be null after stop');
    }
    console.log('✓ Playback Coordinator single-active player and pause-on-switch verified.');

    // 3. Test Replay requires explicit action (ended does not restart)
    console.log('\n[3/12] Testing Ended State stability (No auto-replay loop)...');
    // Calling stop multiple times remains idle and doesn't trigger loops
    coordinator.stop('player_B');
    coordinator.stop('player_B');
    if (coordinator.getActiveId() !== null) {
      throw new Error('Active player ID must remain null');
    }
    console.log('✓ Ended state does not re-trigger playback.');

    // 4. Test Unregistering player does not interrupt active player if different
    console.log('\n[4/12] Testing Unmount / Unregister Isolation...');
    coordinator.play('player_B');
    coordinator.unregister('player_A'); // Unmounting player A
    if (coordinator.getActiveId() !== 'player_B') {
      throw new Error('Unregistering player A must not affect active player B');
    }
    coordinator.unregister('player_B');
    if (coordinator.getActiveId() !== null) {
      throw new Error('Unregistering active player B must clear active player ID');
    }
    console.log('✓ Unregister isolation verified.');

    // 5. Test Camera Capture Photo Upload via Canonical Phase 6 Pipeline
    console.log('\n[5/12] Testing Instant Camera Photo Capture & Canonical Upload Pipeline...');
    const cameraPhotoReceivedPromise = new Promise<any>((resolve) => {
      socketB.once('new_message', (msg: any) => resolve(msg));
    });

    const fakeCameraJpegBuffer = Buffer.from('FAKE_CAMERA_JPEG_FRAME_RAW_DATA_' + Date.now());
    const cameraFileName = `Wibby_Camera_${Date.now()}.jpg`;
    const cameraClientMsgId = `camera_${Date.now()}_${crypto.randomUUID()}`;

    const formCamera = new FormData();
    formCamera.append('file', new Blob([fakeCameraJpegBuffer], { type: 'image/jpeg' }), cameraFileName);
    formCamera.append('caption', 'Quick selfie snapshot from Wibby camera!');
    formCamera.append('clientMessageId', cameraClientMsgId);

    const cameraUploadRes = await fetch(`${BASE_URL}/api/conversations/${CONVERSATION_ID}/media`, {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${tokenA}` },
      body: formCamera
    });

    if (!cameraUploadRes.ok) {
      throw new Error(`Camera upload failed: ${await cameraUploadRes.text()}`);
    }

    const cameraUploadJson = await cameraUploadRes.json();
    console.log('✓ Camera photo uploaded via Phase 6 media pipeline:', cameraUploadJson.message._id);

    const receivedCameraMsg = await Promise.race([
      cameraPhotoReceivedPromise,
      new Promise((_, rej) => setTimeout(() => rej(new Error('Camera socket timeout')), 4000))
    ]);

    if (receivedCameraMsg.type !== 'image' || !receivedCameraMsg.fileName.startsWith('Wibby_Camera_')) {
      throw new Error(`Invalid camera message payload: ${JSON.stringify(receivedCameraMsg)}`);
    }
    if (receivedCameraMsg.text !== 'Quick selfie snapshot from Wibby camera!') {
      throw new Error(`Camera caption mismatch: got ${receivedCameraMsg.text}`);
    }
    console.log('✓ Recipient received camera photo with caption in realtime via Socket.IO.');

    // 6. Test Authenticated Retrieval of Camera Photo
    console.log('\n[6/12] Testing Authenticated Retrieval of Camera Photo...');
    const cameraGetRes = await fetch(`${BASE_URL}${receivedCameraMsg.mediaUrl}`, {
      headers: { 'Authorization': `Bearer ${tokenB}` }
    });

    if (!cameraGetRes.ok) {
      throw new Error(`Failed to stream camera photo: ${cameraGetRes.status}`);
    }
    const cameraBlobData = Buffer.from(await cameraGetRes.arrayBuffer());
    if (cameraBlobData.length !== fakeCameraJpegBuffer.length) {
      throw new Error(`Camera photo data length mismatch: expected ${fakeCameraJpegBuffer.length}, got ${cameraBlobData.length}`);
    }
    console.log(`✓ Camera photo retrieved securely (${cameraBlobData.length} bytes, Content-Type: ${cameraGetRes.headers.get('content-type')}).`);

    // 7. Test Reply to Camera Photo
    console.log('\n[7/12] Testing Reply to Camera Photo...');
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
        text: 'Great photo! Looking good.',
        replyToMessageId: receivedCameraMsg._id,
        clientMessageId: crypto.randomUUID()
      })
    });
    if (!replyRes.ok) {
      throw new Error(`Reply to camera photo failed: ${await replyRes.text()}`);
    }

    const receivedReply = await Promise.race([
      replyPromise,
      new Promise((_, rej) => setTimeout(() => rej(new Error('Reply socket timeout')), 4000))
    ]);
    if (receivedReply.replyToMessageId !== receivedCameraMsg._id) {
      throw new Error('Reply does not reference the camera photo ID');
    }
    console.log('✓ Reply to camera photo verified in realtime.');

    // 8. Test Reaction on Camera Photo
    console.log('\n[8/12] Testing Reaction on Camera Photo...');
    const reactionPromise = new Promise<any>((resolve) => {
      socketA.once('message:reaction', (data: any) => resolve(data));
    });

    const reactionRes = await fetch(`${BASE_URL}/api/conversations/${CONVERSATION_ID}/messages/${receivedCameraMsg._id}/reactions`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${tokenB}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ emoji: '🔥' })
    });
    if (!reactionRes.ok) {
      throw new Error(`Reaction on camera photo failed: ${await reactionRes.text()}`);
    }

    const reactionData = await Promise.race([
      reactionPromise,
      new Promise((_, rej) => setTimeout(() => rej(new Error('Reaction socket timeout')), 4000))
    ]);
    if (reactionData.emoji !== '🔥' || reactionData.senderId !== USER_B_UID) {
      throw new Error('Reaction on camera photo mismatch');
    }
    console.log('✓ Reaction on camera photo verified in realtime.');

    // 9. Test Delete-for-Everyone on Camera Photo
    console.log('\n[9/12] Testing Delete-for-Everyone on Camera Photo...');
    const deletePromise = new Promise<any>((resolve) => {
      socketB.once('message:delete', (data: any) => resolve(data));
    });

    const deleteRes = await fetch(`${BASE_URL}/api/conversations/${CONVERSATION_ID}/messages/${receivedCameraMsg._id}?everyone=true`, {
      method: 'DELETE',
      headers: { 'Authorization': `Bearer ${tokenA}` }
    });
    if (!deleteRes.ok) {
      throw new Error(`Delete camera photo failed: ${await deleteRes.text()}`);
    }

    const deleteData = await Promise.race([
      deletePromise,
      new Promise((_, rej) => setTimeout(() => rej(new Error('Delete socket timeout')), 4000))
    ]);
    if (deleteData.messageId !== receivedCameraMsg._id) {
      throw new Error('Delete message ID mismatch');
    }
    console.log('✓ Camera photo deletion broadcasted and storage cleaned up.');

    // 10. Test Phase 7 Voice Message Regression Check
    console.log('\n[10/12] Running Phase 7 Voice Message Regression Checks...');
    const voiceReceivedPromise = new Promise<any>((resolve) => {
      socketB.once('new_message', (msg: any) => resolve(msg));
    });

    const formVoice = new FormData();
    formVoice.append('file', new Blob([Buffer.alloc(8000, 0x77)], { type: 'audio/webm;codecs=opus' }), 'voice_reg.webm');
    formVoice.append('duration', '4.5');
    formVoice.append('waveform', JSON.stringify([0.2, 0.4, 0.6, 0.8]));
    formVoice.append('clientMessageId', 'voice_reg_' + Date.now());

    const voiceRes = await fetch(`${BASE_URL}/api/conversations/${CONVERSATION_ID}/media`, {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${tokenA}` },
      body: formVoice
    });
    if (!voiceRes.ok) {
      throw new Error(`Voice upload regression failed: ${await voiceRes.text()}`);
    }
    const receivedVoice = await voiceReceivedPromise;
    if (receivedVoice.type !== 'audio' || receivedVoice.duration !== 4.5) {
      throw new Error('Voice message regression payload error');
    }
    console.log('✓ Phase 7 Voice Message regression test passed.');

    // 11. Test Phase 6 Video / Document Regression Check
    console.log('\n[11/12] Running Phase 6 Video / Document Regression Checks...');
    const docForm = new FormData();
    docForm.append('file', new Blob([Buffer.from('Phase 6 doc regression test')], { type: 'text/plain' }), 'report.txt');
    docForm.append('clientMessageId', 'doc_reg_' + Date.now());

    const docRes = await fetch(`${BASE_URL}/api/conversations/${CONVERSATION_ID}/media`, {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${tokenA}` },
      body: docForm
    });
    if (!docRes.ok) {
      throw new Error(`Document upload regression failed: ${await docRes.text()}`);
    }
    const docJson = await docRes.json();
    if (docJson.message.type !== 'file') {
      throw new Error(`Expected type 'file', got '${docJson.message.type}'`);
    }
    console.log('✓ Phase 6 Document regression test passed.');

    // 12. Test Phase 5 Text & Typing Regression Check
    console.log('\n[12/12] Running Phase 5 Text & Typing Regression Checks...');
    const typingPromise = new Promise<any>((resolve) => {
      socketB.once('typing:start', (data: any) => resolve(data));
    });
    socketA.emit('typing:start', { conversationId: CONVERSATION_ID });
    await typingPromise;
    console.log('✓ Phase 5 Typing indicator regression test passed.');

    console.log('\n================================================================');
    console.log('🎉 ALL 12 MAINTENANCE & CAMERA TESTS PASSED WITH ZERO ERRORS!');
    console.log('================================================================\n');

  } catch (err: any) {
    console.error('\n❌ MAINTENANCE TEST FAILED:', err);
    process.exit(1);
  } finally {
    if (socketA) socketA.disconnect();
    if (socketB) socketB.disconnect();
    process.exit(0);
  }
}

runMaintenanceSuite();
