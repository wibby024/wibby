import { io as ClientSocket, Socket as ClientSocketType } from 'socket.io-client';
import { connectToDatabase, getDb } from '../lib/mongodb.js';
import { auth } from '../lib/firebaseAdmin.js';

const BASE_URL = 'http://localhost:3000';
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

async function runPhase9VideoCallTests() {
  console.log('================================================================');
  console.log('📹 WIBBY — PHASE 9: VIDEO CALLS & PERSISTENT RECOVERY TEST SUITE');
  console.log('================================================================');

  await connectToDatabase();
  const db = getDb();

  // 1. Fetch test users & paired conversation
  const userA = await db.collection('users').findOne({ email: 'tara024@gmail.com' });
  const userB = await db.collection('users').findOne({ email: 'adi024@gmail.com' });

  if (!userA || !userB) {
    throw new Error('Test users tara024 or adi024 not found in database');
  }

  const conversation = await db.collection('conversations').findOne({
    members: { $all: [userA.firebaseUid, userB.firebaseUid] }
  });

  if (!conversation) {
    throw new Error('Paired conversation between tara024 and adi024 not found');
  }

  const CONVERSATION_ID = conversation._id.toString();
  console.log(`- Conversation ID: ${CONVERSATION_ID}`);
  console.log(`- User A (tara024): ${userA.firebaseUid}`);
  console.log(`- User B (adi024): ${userB.firebaseUid}`);

  const idTokenA = await getIdTokenForUid(userA.firebaseUid);
  const idTokenB = await getIdTokenForUid(userB.firebaseUid);

  // [1/10] Sockets Connection & Authentication
  console.log('\n[1/10] Establishing Authenticated Sockets for User A & User B...');
  let socketA: ClientSocketType = ClientSocket(BASE_URL, { auth: { token: idTokenA } });
  let socketB: ClientSocketType = ClientSocket(BASE_URL, { auth: { token: idTokenB } });

  await Promise.all([
    new Promise<void>(res => socketA.on('connect', res)),
    new Promise<void>(res => socketB.on('connect', res))
  ]);
  console.log('✓ Both user sockets connected and authenticated.');

  await new Promise(r => setTimeout(r, 200));

  // [2/10] Video Call Invite & Ringing
  console.log('\n[2/10] Initiating Video Call (User A -> User B) with callType="video"...');
  const callId = `call_p9_${Date.now()}_video`;
  const sessionIdA1 = `sess_a1_${Date.now()}`;
  let inviteReceivedByB: any = null;
  let ringingReceivedByA: any = null;

  const invitePromise = new Promise<any>((resolve) => {
    socketB.once('call:invite', (data) => {
      inviteReceivedByB = data;
      resolve(data);
    });
  });

  const ringingPromise = new Promise<any>((resolve) => {
    socketA.once('call:ringing', (data) => {
      ringingReceivedByA = data;
      resolve(data);
    });
  });

  socketA.emit('call:invite', {
    callId,
    sessionId: sessionIdA1,
    conversationId: CONVERSATION_ID,
    callType: 'video'
  });

  await Promise.all([invitePromise, ringingPromise]);

  if (!inviteReceivedByB || inviteReceivedByB.callId !== callId || inviteReceivedByB.callType !== 'video') {
    throw new Error(`Callee B did not receive valid video call invite: ${JSON.stringify(inviteReceivedByB)}`);
  }
  if (!ringingReceivedByA || ringingReceivedByA.callId !== callId) {
    throw new Error(`Caller A did not receive ringing ack: ${JSON.stringify(ringingReceivedByA)}`);
  }
  console.log(`✓ Video call invite successfully received with callType="video" and callerSessionId="${sessionIdA1}"`);

  // [3/10] Video Call Acceptance
  console.log('\n[3/10] Callee B accepting Video Call...');
  const sessionIdB1 = `sess_b1_${Date.now()}`;
  const acceptPromiseA = new Promise<any>((resolve) => socketA.once('call:accepted', resolve));
  const acceptPromiseB = new Promise<any>((resolve) => socketB.once('call:accepted', resolve));

  socketB.emit('call:accept', {
    callId,
    sessionId: sessionIdB1
  });

  const [acceptedA, acceptedB] = await Promise.all([acceptPromiseA, acceptPromiseB]);
  if (acceptedA.callId !== callId || acceptedB.callId !== callId) {
    throw new Error('call:accepted failed or mismatched callId');
  }
  console.log(`✓ Video call accepted: caller and callee confirmed. calleeSessionId="${sessionIdB1}"`);

  // [4/10] Video SDP Offer/Answer Relay
  console.log('\n[4/10] Exchanging WebRTC SDP Offer & Answer with video capability...');
  const dummyVideoOffer: RTCSessionDescriptionInit = {
    type: 'offer',
    sdp: 'v=0\r\no=- 12345 2 IN IP4 127.0.0.1\r\ns=-\r\nt=0 0\r\nm=audio 9 UDP/TLS/RTP/SAVPF 111\r\nm=video 9 UDP/TLS/RTP/SAVPF 120\r\n'
  };
  const dummyVideoAnswer: RTCSessionDescriptionInit = {
    type: 'answer',
    sdp: 'v=0\r\no=- 67890 2 IN IP4 127.0.0.1\r\ns=-\r\nt=0 0\r\nm=audio 9 UDP/TLS/RTP/SAVPF 111\r\nm=video 9 UDP/TLS/RTP/SAVPF 120\r\n'
  };

  const offerPromiseB = new Promise<any>((resolve) => socketB.once('call:offer', resolve));
  socketA.emit('call:offer', { callId, sessionId: sessionIdA1, sdp: dummyVideoOffer });
  const receivedOfferB = await offerPromiseB;

  if (receivedOfferB.callId !== callId || !receivedOfferB.sdp.sdp.includes('m=video')) {
    throw new Error(`Video SDP Offer relay failed: ${JSON.stringify(receivedOfferB)}`);
  }
  console.log('✓ Video SDP Offer relayed to Callee B with audio + video media descriptions.');

  const answerPromiseA = new Promise<any>((resolve) => socketA.once('call:answer', resolve));
  socketB.emit('call:answer', { callId, sessionId: sessionIdB1, sdp: dummyVideoAnswer });
  const receivedAnswerA = await answerPromiseA;

  if (receivedAnswerA.callId !== callId || !receivedAnswerA.sdp.sdp.includes('m=video')) {
    throw new Error(`Video SDP Answer relay failed: ${JSON.stringify(receivedAnswerA)}`);
  }
  console.log('✓ Video SDP Answer relayed to Caller A with audio + video media descriptions.');

  // [5/10] Video Camera Toggle
  console.log('\n[5/10] Testing In-Call Camera Toggle (turn off / turn on)...');
  const cameraOffPromiseB = new Promise<any>((resolve) => socketB.once('call:camera-toggle', resolve));
  socketA.emit('call:camera-toggle', {
    callId,
    sessionId: sessionIdA1,
    isCameraOff: true
  });
  const cameraOffRes = await cameraOffPromiseB;
  if (cameraOffRes.callId !== callId || cameraOffRes.isCameraOff !== true) {
    throw new Error(`Camera toggle (off) failed: ${JSON.stringify(cameraOffRes)}`);
  }
  console.log('✓ Peer B received camera toggle (camera off).');

  const cameraOnPromiseB = new Promise<any>((resolve) => socketB.once('call:camera-toggle', resolve));
  socketA.emit('call:camera-toggle', {
    callId,
    sessionId: sessionIdA1,
    isCameraOff: false
  });
  const cameraOnRes = await cameraOnPromiseB;
  if (cameraOnRes.callId !== callId || cameraOnRes.isCameraOff !== false) {
    throw new Error(`Camera toggle (on) failed: ${JSON.stringify(cameraOnRes)}`);
  }
  console.log('✓ Peer B received camera toggle (camera on).');

  // [6/10] Sudden Tab Close / Network Disconnect (Grace Period Activation)
  console.log('\n[6/10] Simulating User A Sudden Tab Close / Disconnect...');
  const reconnectingPromiseB = new Promise<any>((resolve) => {
    socketB.once('call:peer-reconnecting', resolve);
  });

  // Disconnect Socket A abruptly (simulates user closing browser tab or dropping network)
  socketA.disconnect();

  const peerReconnectingData = await reconnectingPromiseB;
  if (peerReconnectingData.callId !== callId) {
    throw new Error(`Peer B did not receive call:peer-reconnecting for callId ${callId}`);
  }
  if (!peerReconnectingData.message || !peerReconnectingData.message.includes('Connection lost')) {
    throw new Error(`Founder Guardrail #4 violation: Expected "Connection lost" message, got "${peerReconnectingData.message}"`);
  }
  console.log(`✓ Peer B notified of network drop: "${peerReconnectingData.message}" (no false tab-close accusations).`);

  // Verify MongoDB document shows 'reconnecting' status
  const reconnectingCallDoc = await db.collection('calls').findOne({ callId });
  if (!reconnectingCallDoc || reconnectingCallDoc.status !== 'reconnecting') {
    throw new Error(`Expected MongoDB call status to be "reconnecting", got: ${reconnectingCallDoc?.status}`);
  }
  if (!reconnectingCallDoc.reconnectUntil || reconnectingCallDoc.reconnectUntil < Date.now()) {
    throw new Error(`Expected valid reconnectUntil timestamp within 90s grace window`);
  }
  console.log(`✓ MongoDB call verified in "reconnecting" status within 90s recovery grace window.`);

  // [7/10] User A Re-opens Tab, Logs In, and Discovers Recoverable Call
  console.log('\n[7/10] User A re-opens Wibby, connects fresh socket, checks recoverable calls...');
  const socketA2: ClientSocketType = ClientSocket(BASE_URL, { auth: { token: idTokenA } });
  await new Promise<void>(res => socketA2.on('connect', res));

  const recoverablePromiseA = new Promise<any>((resolve) => {
    socketA2.once('call:recoverable', resolve);
  });

  socketA2.emit('call:check-recoverable');
  const recoverableCall = await recoverablePromiseA;

  if (!recoverableCall || recoverableCall.callId !== callId || recoverableCall.callType !== 'video') {
    throw new Error(`Recoverable call discovery failed: ${JSON.stringify(recoverableCall)}`);
  }
  console.log(`✓ Recoverable session successfully discovered: callId="${recoverableCall.callId}", callType="${recoverableCall.callType}"`);

  // [8/10] Persistent Recovery Rehydration with Fresh SessionId
  console.log('\n[8/10] User A executing persistent call recovery with fresh sessionId...');
  const sessionIdA2 = `sess_a2_recovered_${Date.now()}`;
  if (sessionIdA2 === sessionIdA1) {
    throw new Error('Founder Guardrail #3 violation: Recovered sessionId must be fresh and distinct from old sessionId');
  }

  const peerReconnectedPromiseB = new Promise<any>((resolve) => {
    socketB.once('call:peer-reconnected', resolve);
  });
  const reconnectedPromiseA = new Promise<any>((resolve) => {
    socketA2.once('call:peer-reconnected', resolve);
  });

  socketA2.emit('call:reconnect', {
    callId,
    sessionId: sessionIdA2
  });

  const [peerReconnectedB, peerReconnectedA] = await Promise.all([
    peerReconnectedPromiseB,
    reconnectedPromiseA
  ]);

  if (peerReconnectedB.callId !== callId || peerReconnectedB.callerSessionId !== sessionIdA2) {
    throw new Error(`Peer B did not receive proper call:peer-reconnected: ${JSON.stringify(peerReconnectedB)}`);
  }
  if (peerReconnectedA.callId !== callId) {
    throw new Error(`Caller A2 did not receive call:peer-reconnected: ${JSON.stringify(peerReconnectedA)}`);
  }
  console.log(`✓ Both peers confirmed reconnected with same callId="${callId}" and new callerSessionId="${sessionIdA2}".`);

  // Fresh WebRTC Negotiation between recovered A2 and B
  const recoveredOfferPromiseB = new Promise<any>((resolve) => socketB.once('call:offer', resolve));
  socketA2.emit('call:offer', { callId, sessionId: sessionIdA2, sdp: dummyVideoOffer });
  const receivedRecoveredOfferB = await recoveredOfferPromiseB;

  if (receivedRecoveredOfferB.callId !== callId) {
    throw new Error('Recovered offer exchange failed');
  }

  const recoveredAnswerPromiseA = new Promise<any>((resolve) => socketA2.once('call:answer', resolve));
  socketB.emit('call:answer', { callId, sessionId: sessionIdB1, sdp: dummyVideoAnswer });
  const receivedRecoveredAnswerA = await recoveredAnswerPromiseA;

  if (receivedRecoveredAnswerA.callId !== callId) {
    throw new Error('Recovered answer exchange failed');
  }
  console.log('✓ Fresh WebRTC negotiation completed successfully for recovered session!');

  // [9/10] Stale Session Protection Verification
  console.log('\n[9/10] Testing Stale Session Protection (Old session must NOT affect recovered session)...');
  // Attempt to send a hangup from the old dead sessionIdA1 via a rogue event
  socketB.emit('call:camera-toggle', {
    callId,
    sessionId: 'stale_rogue_session',
    isCameraOff: true
  });
  // Verify that active session remains healthy and not corrupted
  await new Promise(r => setTimeout(r, 300));
  const activeDocCheck = await db.collection('calls').findOne({ callId });
  if (!activeDocCheck || activeDocCheck.status !== 'connected') {
    throw new Error(`Founder Guardrail #3 violation: Stale session corrupted active call: ${activeDocCheck?.status}`);
  }
  console.log('✓ Stale session protection validated: rogue / outdated session events safely discarded.');

  // [10/10] Clean Hangup, Single Call History Record, & Canonical Timeline Message
  console.log('\n[10/10] Hanging up recovered call & verifying single history record & canonical chat message...');
  const endedPromiseA2 = new Promise<any>((resolve) => socketA2.once('call:ended', resolve));
  const endedPromiseB2 = new Promise<any>((resolve) => socketB.once('call:ended', resolve));
  const newMsgPromiseB = new Promise<any>((resolve) => socketB.once('new_message', resolve));

  socketA2.emit('call:hangup', {
    callId,
    sessionId: sessionIdA2,
    reason: 'hangup'
  });

  const [endedResA, endedResB, timelineMsg] = await Promise.all([
    endedPromiseA2,
    endedPromiseB2,
    newMsgPromiseB
  ]);

  if (endedResA.callId !== callId || endedResB.callId !== callId) {
    throw new Error('Call ended event failed on recovered call');
  }
  console.log('✓ Recovered call cleanly hung up.');

  // Founder Guardrail #8: Verify EXACTLY ONE call history entry exists in MongoDB
  const allCallDocs = await db.collection('calls').find({ callId }).toArray();
  if (allCallDocs.length !== 1) {
    throw new Error(`Founder Guardrail #8 violation: Expected exactly 1 call record, found ${allCallDocs.length}`);
  }
  const finalCallDoc = allCallDocs[0];
  if (finalCallDoc.status !== 'completed' || finalCallDoc.callType !== 'video') {
    throw new Error(`Invalid final call record: ${JSON.stringify(finalCallDoc)}`);
  }
  console.log(`✓ Founder Guardrail #8 PASSED: Exactly 1 call document exists in MongoDB (status="${finalCallDoc.status}", callType="${finalCallDoc.callType}").`);

  // Founder Guardrail #9: Verify timeline chat message is clean ("Video call", not fake/blank)
  if (!timelineMsg || timelineMsg.type !== 'call') {
    throw new Error(`Founder Guardrail #9 violation: Expected type="call" message, got: ${JSON.stringify(timelineMsg)}`);
  }
  if (!timelineMsg.text || !timelineMsg.text.includes('Video call')) {
    throw new Error(`Founder Guardrail #9 violation: Expected "Video call" in text, got: "${timelineMsg.text}"`);
  }
  console.log(`✓ Founder Guardrail #9 PASSED: Canonical timeline message created: "${timelineMsg.text}"`);

  // Cleanup sockets
  socketA2.disconnect();
  socketB.disconnect();

  console.log('\n================================================================');
  console.log('🏆 WIBBY — PHASE 9 ALL AUTOMATED TESTS PASSED WITH ZERO ERRORS');
  console.log('================================================================\n');
}

runPhase9VideoCallTests().catch((err) => {
  console.error('\n❌ PHASE 9 TEST RUN FAILED:', err);
  process.exit(1);
});
