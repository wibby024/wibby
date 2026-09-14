import { io as ClientSocket, Socket as ClientSocketType } from 'socket.io-client';
import { connectToDatabase, getDb } from '../lib/mongodb.js';
import { ObjectId } from 'mongodb';
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

async function runPhase8VoiceCallTests() {
  console.log('================================================================');
  console.log('📞 WIBBY — PHASE 8: REAL-TIME VOICE CALLS TEST SUITE');
  console.log('================================================================');

  await connectToDatabase();
  const db = getDb();

  // 1. Fetch test users & conversation
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

  // [1/15] Test Authenticated Socket Connection
  console.log('\n[1/15] Testing Authenticated Socket Connection & User Room Auto-Join...');
  let socketA: ClientSocketType = ClientSocket(BASE_URL, { auth: { token: idTokenA } });
  let socketB: ClientSocketType = ClientSocket(BASE_URL, { auth: { token: idTokenB } });

  await Promise.all([
    new Promise<void>(res => socketA.on('connect', res)),
    new Promise<void>(res => socketB.on('connect', res))
  ]);
  console.log('✓ Both user sockets connected and authenticated.');

  // [2/15] Test Unauthorized / Invalid Conversation Rejection
  console.log('\n[2/15] Testing Unauthorized / Invalid Conversation Call Rejection...');
  const fakeConvId = new ObjectId().toString();
  const invalidCallPromise = new Promise<any>((resolve) => {
    socketA.once('call:failed', resolve);
  });
  socketA.emit('call:invite', {
    callId: `fake_call_${Date.now()}`,
    conversationId: fakeConvId
  });
  const invalidCallRes = await invalidCallPromise;
  if (!invalidCallRes) {
    throw new Error('Server failed to reject call to non-existent / unauthorized conversation');
  }
  console.log(`✓ Unauthorized conversation call properly rejected: "${invalidCallRes.message}"`);

  // [3/15] Test Call Invite & Ringing Lifecycle
  console.log('\n[3/15] Testing Call Invite & Ringing Lifecycle (tara024 -> adi024)...');
  const callId1 = `call_${Date.now()}_test1`;
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
    callId: callId1,
    conversationId: CONVERSATION_ID
  });

  await Promise.all([invitePromise, ringingPromise]);

  if (!inviteReceivedByB || inviteReceivedByB.callId !== callId1 || inviteReceivedByB.callerId !== userA.firebaseUid) {
    throw new Error(`Callee B did not receive valid call invite: ${JSON.stringify(inviteReceivedByB)}`);
  }
  if (!ringingReceivedByA || ringingReceivedByA.callId !== callId1) {
    throw new Error(`Caller A did not receive ringing ack: ${JSON.stringify(ringingReceivedByA)}`);
  }
  console.log(`✓ Call invite successfully dispatched to callee B and ringing acknowledged by caller A: callId=${callId1}`);

  // [4/15] Test Call Accept Lifecycle
  console.log('\n[4/15] Testing Call Accept Lifecycle...');
  const acceptPromiseA = new Promise<any>((resolve) => socketA.once('call:accepted', resolve));
  const acceptPromiseB = new Promise<any>((resolve) => socketB.once('call:accepted', resolve));

  socketB.emit('call:accept', { callId: callId1 });
  const [acceptedDataA, acceptedDataB] = await Promise.all([acceptPromiseA, acceptPromiseB]);

  if (acceptedDataA.callId !== callId1 || acceptedDataB.callId !== callId1) {
    throw new Error('call:accepted failed or mismatched callId');
  }
  console.log('✓ Call accept broadcast verified for both caller and callee.');

  // [5/15] Test WebRTC Offer & Answer Relay
  console.log('\n[5/15] Testing WebRTC SDP Offer & Answer Signaling Relay...');
  const dummyOffer: RTCSessionDescriptionInit = {
    type: 'offer',
    sdp: 'v=0\r\no=- 12345 2 IN IP4 127.0.0.1\r\ns=-\r\nt=0 0\r\nm=audio 9 UDP/TLS/RTP/SAVPF 111\r\n'
  };
  const dummyAnswer: RTCSessionDescriptionInit = {
    type: 'answer',
    sdp: 'v=0\r\no=- 67890 2 IN IP4 127.0.0.1\r\ns=-\r\nt=0 0\r\nm=audio 9 UDP/TLS/RTP/SAVPF 111\r\n'
  };

  const offerPromiseB = new Promise<any>((resolve) => socketB.once('call:offer', resolve));
  socketA.emit('call:offer', { callId: callId1, sdp: dummyOffer });
  const receivedOfferB = await offerPromiseB;

  if (receivedOfferB.callId !== callId1 || receivedOfferB.sdp.sdp !== dummyOffer.sdp) {
    throw new Error(`SDP Offer relay mismatch: ${JSON.stringify(receivedOfferB)}`);
  }
  console.log('✓ WebRTC SDP Offer relayed accurately from A to B.');

  const answerPromiseA = new Promise<any>((resolve) => socketA.once('call:answer', resolve));
  socketB.emit('call:answer', { callId: callId1, sdp: dummyAnswer });
  const receivedAnswerA = await answerPromiseA;

  if (receivedAnswerA.callId !== callId1 || receivedAnswerA.sdp.sdp !== dummyAnswer.sdp) {
    throw new Error(`SDP Answer relay mismatch: ${JSON.stringify(receivedAnswerA)}`);
  }
  console.log('✓ WebRTC SDP Answer relayed accurately from B to A.');

  // [6/15] Test ICE Candidate Relay
  console.log('\n[6/15] Testing ICE Candidate Relay...');
  const dummyCandidate: RTCIceCandidateInit = {
    candidate: 'candidate:1 1 UDP 2122260223 192.168.1.100 54321 typ host',
    sdpMid: '0',
    sdpMLineIndex: 0
  };

  const icePromiseB = new Promise<any>((resolve) => socketB.once('call:ice-candidate', resolve));
  socketA.emit('call:ice-candidate', { callId: callId1, candidate: dummyCandidate });
  const receivedIceB = await icePromiseB;

  if (receivedIceB.callId !== callId1 || receivedIceB.candidate.candidate !== dummyCandidate.candidate) {
    throw new Error(`ICE Candidate relay mismatch: ${JSON.stringify(receivedIceB)}`);
  }
  console.log('✓ ICE candidate successfully relayed across peers.');

  // [7/15] Test Call Mute Relay
  console.log('\n[7/15] Testing Call Mute Status Relay...');
  const mutePromiseB = new Promise<any>((resolve) => socketB.once('call:mute', resolve));
  socketA.emit('call:mute', { callId: callId1, isMuted: true });
  const receivedMuteB = await mutePromiseB;

  if (receivedMuteB.callId !== callId1 || receivedMuteB.isMuted !== true) {
    throw new Error('Call mute status failed to relay');
  }
  console.log('✓ Mute state indicator relayed to remote peer.');

  // [8/15] Test Call Hangup & Call History Persistence
  console.log('\n[8/15] Testing Call Hangup & MongoDB Call History Persistence...');
  const endedPromiseA = new Promise<any>((resolve) => socketA.once('call:ended', resolve));
  const endedPromiseB = new Promise<any>((resolve) => socketB.once('call:ended', resolve));
  const chatMsgPromiseB = new Promise<any>((resolve) => socketB.once('new_message', resolve));

  socketA.emit('call:hangup', { callId: callId1, reason: 'hangup' });

  const [endedA, endedB, callChatMessage] = await Promise.all([endedPromiseA, endedPromiseB, chatMsgPromiseB]);

  if (endedA.callId !== callId1 || endedB.callId !== callId1) {
    throw new Error('Call ended event not broadcasted correctly to both parties');
  }
  console.log(`✓ Call cleanly hung up: reason=${endedA.reason}, status=${endedA.status}`);

  if (!callChatMessage || callChatMessage.type !== 'call') {
    throw new Error(`Chat call message not emitted to conversation room: ${JSON.stringify(callChatMessage)}`);
  }
  console.log(`✓ Timeline chat message emitted for completed call: "${callChatMessage.text}"`);

  // Verify MongoDB Calls collection document
  const callDoc = await db.collection('calls').findOne({ callId: callId1 });
  if (!callDoc || callDoc.status !== 'completed') {
    throw new Error(`Call history document not found in MongoDB or wrong status: ${JSON.stringify(callDoc)}`);
  }
  console.log(`✓ MongoDB call history confirmed: callId=${callDoc.callId}, status=${callDoc.status}, startedAt=${callDoc.startedAt}`);

  // [9/15] Test Busy State Handling
  console.log('\n[9/15] Testing Busy State Protection when User is in Active Call...');
  const callId2 = `call_${Date.now()}_test2`;
  const ringingPromise2 = new Promise<any>((resolve) => socketA.once('call:ringing', resolve));
  socketA.emit('call:invite', { callId: callId2, conversationId: CONVERSATION_ID });
  await ringingPromise2;

  // Caller A tries to start ANOTHER call while in call
  const busyPromise = new Promise<any>((resolve) => {
    socketA.once('call:failed', resolve);
  });
  socketA.emit('call:invite', { callId: `call_${Date.now()}_duplicate`, conversationId: CONVERSATION_ID });
  const busyRes = await busyPromise;
  if (!busyRes) {
    throw new Error('Expected busy/duplicate call rejection');
  }
  console.log(`✓ Duplicate active call prevented: "${busyRes.message}"`);

  // Clean up call 2
  socketA.emit('call:hangup', { callId: callId2 });
  await new Promise(r => setTimeout(r, 200));

  // [10/15] Test Call Decline / Reject Flow
  console.log('\n[10/15] Testing Call Decline / Reject Flow...');
  const callId3 = `call_${Date.now()}_test3`;
  const invitePromise3 = new Promise<any>((resolve) => socketB.once('call:invite', resolve));
  socketA.emit('call:invite', { callId: callId3, conversationId: CONVERSATION_ID });
  await invitePromise3;

  const declinePromiseA = new Promise<any>((resolve) => socketA.once('call:ended', resolve));
  socketB.emit('call:reject', { callId: callId3, reason: 'declined' });
  const declineRes = await declinePromiseA;

  if (declineRes.status !== 'declined' && declineRes.reason !== 'declined') {
    throw new Error(`Decline response malformed: ${JSON.stringify(declineRes)}`);
  }
  const declinedDoc = await db.collection('calls').findOne({ callId: callId3 });
  if (!declinedDoc || declinedDoc.status !== 'declined') {
    throw new Error(`Declined call not recorded in DB: ${JSON.stringify(declinedDoc)}`);
  }
  console.log('✓ Call decline recorded and broadcasted with status="declined".');

  // [11/15] Test Call Cancel Flow (Caller cancels before callee accepts)
  console.log('\n[11/15] Testing Call Cancel Flow (Caller cancels before answer)...');
  const callId4 = `call_${Date.now()}_test4`;
  const invitePromise4 = new Promise<any>((resolve) => socketB.once('call:invite', resolve));
  socketA.emit('call:invite', { callId: callId4, conversationId: CONVERSATION_ID });
  await invitePromise4;

  const cancelPromiseB = new Promise<any>((resolve) => socketB.once('call:ended', resolve));
  socketA.emit('call:hangup', { callId: callId4, reason: 'cancelled' });
  const cancelRes = await cancelPromiseB;

  if (cancelRes.status !== 'cancelled' && cancelRes.reason !== 'cancelled') {
    throw new Error(`Cancel response malformed: ${JSON.stringify(cancelRes)}`);
  }
  console.log('✓ Outgoing call cancelled cleanly before answer.');

  // [12/15] Test Socket Disconnect during active call
  console.log('\n[12/15] Testing Socket Disconnect Auto-Cleanup during Call...');
  const callId5 = `call_${Date.now()}_test5`;
  const invitePromise5 = new Promise<any>((resolve) => socketB.once('call:invite', resolve));
  socketA.emit('call:invite', { callId: callId5, conversationId: CONVERSATION_ID });
  await invitePromise5;
  socketB.emit('call:accept', { callId: callId5 });
  await new Promise(r => setTimeout(r, 200));

  const disconnectEventPromiseA = new Promise<any>((resolve) => {
    socketA.once('call:peer-reconnecting', resolve);
    socketA.once('call:ended', resolve);
  });
  // Disconnect socket B
  socketB.disconnect();
  const discResult = await disconnectEventPromiseA;
  if (discResult.callId !== callId5) {
    throw new Error('Active call not transitioned upon socket disconnect');
  }
  console.log('✓ Active call transitioned gracefully to reconnecting/ended upon participant disconnect.');

  // Reconnect socket B for remaining tests & clean up call session
  socketB = ClientSocket(BASE_URL, { auth: { token: idTokenB } });
  await new Promise<void>(res => socketB.on('connect', res));
  socketA.emit('call:hangup', { callId: callId5 });
  await new Promise(r => setTimeout(r, 200));

  // [13/15] Test Phase 5/5.5 Realtime Text Regression
  console.log('\n[13/15] Testing Phase 5 / 5.5 Realtime Text & Typing Regression...');
  const testMsgPromise = new Promise<any>((resolve) => socketB.once('new_message', resolve));
  const textRes = await fetch(`${BASE_URL}/api/conversations/${CONVERSATION_ID}/messages`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${idTokenA}`
    },
    body: JSON.stringify({
      text: 'Phase 8 voice call regression test message',
      clientMessageId: crypto.randomUUID()
    })
  });
  if (textRes.status !== 201) {
    throw new Error(`Text message send failed: ${await textRes.text()}`);
  }
  const receivedText = await testMsgPromise;
  if (!receivedText || receivedText.text !== 'Phase 8 voice call regression test message') {
    throw new Error('Realtime text message regression failure');
  }
  console.log('✓ Realtime text messaging functioning with 0 regressions.');

  // [14/15] Test Phase 6 Media Upload Regression
  console.log('\n[14/15] Testing Phase 6 Media Attachment Regression...');
  const mediaForm = new FormData();
  const dummyPng = Buffer.from('89504e470d0a1a0a0000000d49484452000000010000000108060000001f15c4890000000a49444154789c63000100000500010d0a2db40000000049454e44ae426082', 'hex');
  mediaForm.append('file', new Blob([new Uint8Array(dummyPng)], { type: 'image/png' }), 'test_call_phase8.png');
  mediaForm.append('clientMessageId', crypto.randomUUID());

  const mediaUploadRes = await fetch(`${BASE_URL}/api/conversations/${CONVERSATION_ID}/media`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${idTokenA}` },
    body: mediaForm
  });
  if (mediaUploadRes.status !== 201) {
    throw new Error(`Media upload regression failed: ${await mediaUploadRes.text()}`);
  }
  const mediaData = (await mediaUploadRes.json()) as any;
  const mediaMsg = mediaData.message || mediaData;
  if (mediaMsg.type !== 'image' || !mediaMsg.mediaUrl) {
    throw new Error(`Media response malformed: ${JSON.stringify(mediaData)}`);
  }
  console.log('✓ Media attachment upload functioning with 0 regressions.');

  // [15/15] Test Phase 7 Voice Message Regression
  console.log('\n[15/15] Testing Phase 7 Voice Message Delivery Regression...');
  const voiceForm = new FormData();
  const dummyVoice = Buffer.from([0x1a, 0x45, 0xdf, 0xa3, 0x9f, 0x42, 0x86, 0x81, 0x01]);
  voiceForm.append('file', new Blob([new Uint8Array(dummyVoice)], { type: 'audio/webm;codecs=opus' }), 'voice_phase8.webm');
  voiceForm.append('clientMessageId', crypto.randomUUID());
  voiceForm.append('duration', '2.5');

  const voiceUploadRes = await fetch(`${BASE_URL}/api/conversations/${CONVERSATION_ID}/media`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${idTokenA}` },
    body: voiceForm
  });
  if (voiceUploadRes.status !== 201) {
    throw new Error(`Voice message upload failed: ${await voiceUploadRes.text()}`);
  }
  const voiceData = (await voiceUploadRes.json()) as any;
  const voiceMsg = voiceData.message || voiceData;
  if (voiceMsg.type !== 'audio' || !voiceMsg.mediaUrl) {
    throw new Error(`Voice message response malformed: ${JSON.stringify(voiceData)}`);
  }
  console.log('✓ Voice message delivery verified with 0 regressions.');

  // Cleanup sockets
  socketA.disconnect();
  socketB.disconnect();

  console.log('\n================================================================');
  console.log('🎉 ALL 15 PHASE 8 REAL-TIME VOICE CALL TESTS PASSED WITH ZERO ERRORS!');
  console.log('================================================================\n');
  process.exit(0);
}

runPhase8VoiceCallTests().catch(err => {
  console.error('\n❌ PHASE 8 TEST FAILED:', err);
  process.exit(1);
});
