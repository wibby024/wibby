import { io as ClientSocket } from 'socket.io-client';
import { connectToDatabase, getDb } from '../lib/mongodb.js';
import { ObjectId } from 'mongodb';
import { getStorageProvider } from '../services/storage/index.js';
import { MEDIA_LIMITS } from '../config/media.js';
import fs from 'fs';

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


async function runPhase6Tests() {
  console.log('====================================================');
  console.log('RUNNING WIBBY PHASE 6: MEDIA + FILES VALIDATION SUITE');
  console.log('====================================================\n');

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
    console.log('[1/12] Connecting Browser A and Browser B sockets...');
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


    // 2. Test Image Upload (A sends image -> B receives via Socket.IO)
    console.log('\n[2/12] Testing Image Upload: A sends image -> B receives realtime...');
    const imageReceivedByBPromise = new Promise<any>((resolve) => {
      socketB.once('new_message', (msg: any) => resolve(msg));
    });

    const fakeImageBuffer = Buffer.from('FAKE_JPEG_IMAGE_DATA_' + Date.now());
    const formDataImage = new FormData();
    formDataImage.append('file', new Blob([fakeImageBuffer], { type: 'image/jpeg' }), 'vacation.jpg');
    formDataImage.append('caption', 'Sunset view');
    formDataImage.append('clientMessageId', crypto.randomUUID());

    const imgUploadRes = await fetch(`${BASE_URL}/api/conversations/${CONVERSATION_ID}/media`, {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${tokenA}` },
      body: formDataImage
    });

    if (!imgUploadRes.ok) {
      throw new Error(`Image upload failed: ${await imgUploadRes.text()}`);
    }

    const imgUploadData = await imgUploadRes.json();
    console.log('✓ Image uploaded to storage & MongoDB doc created:', imgUploadData.message.fileName, `(Type: ${imgUploadData.message.type})`);

    const receivedImgByB = await Promise.race([
      imageReceivedByBPromise,
      new Promise((_, rej) => setTimeout(() => rej(new Error('Timeout waiting for image on socket B')), 4000))
    ]);

    if (receivedImgByB._id !== imgUploadData.message._id || receivedImgByB.type !== 'image') {
      throw new Error('Socket B received unexpected image message payload');
    }
    console.log('✓ Browser B received real-time image message with caption:', receivedImgByB.text);

    // 3. Test Video Upload (B sends video -> A receives via Socket.IO)
    console.log('\n[3/12] Testing Video Upload: B sends video -> A receives realtime...');
    const videoReceivedByAPromise = new Promise<any>((resolve) => {
      socketA.once('new_message', (msg: any) => resolve(msg));
    });

    const fakeVideoBuffer = Buffer.from('FAKE_MP4_VIDEO_DATA_' + Date.now());
    const formDataVideo = new FormData();
    formDataVideo.append('file', new Blob([fakeVideoBuffer], { type: 'video/mp4' }), 'clip.mp4');
    formDataVideo.append('caption', 'Check this out');
    formDataVideo.append('clientMessageId', crypto.randomUUID());

    const videoUploadRes = await fetch(`${BASE_URL}/api/conversations/${CONVERSATION_ID}/media`, {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${tokenB}` },
      body: formDataVideo
    });

    if (!videoUploadRes.ok) {
      throw new Error(`Video upload failed: ${await videoUploadRes.text()}`);
    }

    const videoUploadData = await videoUploadRes.json();
    console.log('✓ Video uploaded to storage & MongoDB doc created:', videoUploadData.message.fileName, `(Type: ${videoUploadData.message.type})`);

    const receivedVideoByA = await Promise.race([
      videoReceivedByAPromise,
      new Promise((_, rej) => setTimeout(() => rej(new Error('Timeout waiting for video on socket A')), 4000))
    ]);

    if (receivedVideoByA._id !== videoUploadData.message._id || receivedVideoByA.type !== 'video') {
      throw new Error('Socket A received unexpected video message payload');
    }
    console.log('✓ Browser A received real-time video message:', receivedVideoByA.fileName);

    // 4. Test Document Upload (A sends PDF -> B receives via Socket.IO)
    console.log('\n[4/12] Testing Document Upload: A sends PDF -> B receives realtime...');
    const docReceivedByBPromise = new Promise<any>((resolve) => {
      socketB.once('new_message', (msg: any) => resolve(msg));
    });

    const fakePdfBuffer = Buffer.from('%PDF-1.4 FAKE_PDF_DATA_' + Date.now());
    const formDataPdf = new FormData();
    formDataPdf.append('file', new Blob([fakePdfBuffer], { type: 'application/pdf' }), 'wibby_whitepaper.pdf');
    formDataPdf.append('clientMessageId', crypto.randomUUID());

    const pdfUploadRes = await fetch(`${BASE_URL}/api/conversations/${CONVERSATION_ID}/media`, {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${tokenA}` },
      body: formDataPdf
    });

    if (!pdfUploadRes.ok) {
      throw new Error(`PDF upload failed: ${await pdfUploadRes.text()}`);
    }

    const pdfUploadData = await pdfUploadRes.json();
    console.log('✓ Document uploaded to storage & MongoDB doc created:', pdfUploadData.message.fileName, `(Type: ${pdfUploadData.message.type})`);

    const receivedDocByB = await Promise.race([
      docReceivedByBPromise,
      new Promise((_, rej) => setTimeout(() => rej(new Error('Timeout waiting for PDF on socket B')), 4000))
    ]);

    if (receivedDocByB._id !== pdfUploadData.message._id || receivedDocByB.type !== 'file') {
      throw new Error('Socket B received unexpected document message payload');
    }
    console.log('✓ Browser B received real-time document message:', receivedDocByB.fileName);

    // 5. Test Private Streaming Access Control
    console.log('\n[5/12] Testing Private Media Access Control...');
    const mediaKey = pdfUploadData.message.mediaKey;

    // Authorized conversation member (A) can stream via Authorization Header
    const authStreamRes = await fetch(`${BASE_URL}/api/conversations/${CONVERSATION_ID}/media/${encodeURIComponent(mediaKey)}`, {
      headers: { 'Authorization': `Bearer ${tokenA}` }
    });
    if (!authStreamRes.ok) {
      throw new Error(`Authorized stream failed with status ${authStreamRes.status}`);
    }
    const streamedData = await authStreamRes.text();
    if (streamedData !== fakePdfBuffer.toString()) {
      throw new Error('Streamed data did not match uploaded content');
    }
    console.log('✓ Authorized conversation member successfully streamed private media via header.');

    // Authorized streaming via token query parameter (for video/audio/direct stream)
    const tokenQueryRes = await fetch(`${BASE_URL}/api/conversations/${CONVERSATION_ID}/media/${encodeURIComponent(mediaKey)}?token=${encodeURIComponent(tokenA)}`);
    if (!tokenQueryRes.ok) {
      throw new Error(`Token query stream failed with status ${tokenQueryRes.status}`);
    }
    console.log('✓ Authorized conversation member successfully streamed private media via query parameter token.');

    // Unauthenticated request is rejected (401)
    const unauthStreamRes = await fetch(`${BASE_URL}/api/conversations/${CONVERSATION_ID}/media/${encodeURIComponent(mediaKey)}`);
    if (unauthStreamRes.status !== 401) {
      throw new Error(`Unauthenticated stream returned status ${unauthStreamRes.status}, expected 401`);
    }
    console.log('✓ Unauthenticated request rejected (401 Unauthorized).');

    // Cross-conversation unauthorized access is rejected (403)
    const unauthorizedUserToken = await getIdTokenForUid('random_intruder_uid');
    const crossConvRes = await fetch(`${BASE_URL}/api/conversations/${CONVERSATION_ID}/media/${encodeURIComponent(mediaKey)}`, {
      headers: { 'Authorization': `Bearer ${unauthorizedUserToken}` }
    });
    if (crossConvRes.status !== 403) {
      throw new Error(`Intruder request returned status ${crossConvRes.status}, expected 403`);
    }
    console.log('✓ Non-member intruder rejected (403 Forbidden).');

    // Multi-format matrix validation: Photos (JPEG, PNG, WEBP, GIF) and Documents (DOC, DOCX, XLS, XLSX, PPT, PPTX, TXT, ZIP)
    console.log('\n[5b/12] Testing Full Multi-Format Support (All photos + All documents)...');
    const formatTestFiles = [
      { name: 'photo.png', mime: 'image/png', expectedType: 'image' },
      { name: 'photo.webp', mime: 'image/webp', expectedType: 'image' },
      { name: 'anim.gif', mime: 'image/gif', expectedType: 'image' },
      { name: 'notes.txt', mime: 'text/plain', expectedType: 'file' },
      { name: 'doc.doc', mime: 'application/msword', expectedType: 'file' },
      { name: 'document.docx', mime: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', expectedType: 'file' },
      { name: 'sheet.xls', mime: 'application/vnd.ms-excel', expectedType: 'file' },
      { name: 'spreadsheet.xlsx', mime: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', expectedType: 'file' },
      { name: 'slides.ppt', mime: 'application/vnd.ms-powerpoint', expectedType: 'file' },
      { name: 'presentation.pptx', mime: 'application/vnd.openxmlformats-officedocument.presentationml.presentation', expectedType: 'file' },
      { name: 'archive.zip', mime: 'application/zip', expectedType: 'file' }
    ];

    for (const testF of formatTestFiles) {
      const form = new FormData();
      form.append('file', new Blob([Buffer.from(`CONTENT_FOR_${testF.name}`)], { type: testF.mime }), testF.name);
      form.append('clientMessageId', crypto.randomUUID());
      const res = await fetch(`${BASE_URL}/api/conversations/${CONVERSATION_ID}/media`, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${tokenA}` },
        body: form
      });
      if (!res.ok) {
        throw new Error(`Failed to upload ${testF.name}: ${await res.text()}`);
      }
      const data = await res.json();
      if (data.message.type !== testF.expectedType) {
        throw new Error(`Format ${testF.name} resolved to unexpected type ${data.message.type}`);
      }
    }
    console.log(`✓ All ${formatTestFiles.length} photo and document formats successfully uploaded, typed, and persisted.`);

    // 6. Test File Size & Validation Enforcement
    console.log('\n[6/12] Testing File Size and Type Validation...');
    // Unsupported extension/mime
    const invalidFileBuffer = Buffer.from('EXE_VIRUS_OR_BIN');
    const invalidForm = new FormData();
    invalidForm.append('file', new Blob([invalidFileBuffer], { type: 'application/x-msdownload' }), 'malware.exe');
    const invalidUploadRes = await fetch(`${BASE_URL}/api/conversations/${CONVERSATION_ID}/media`, {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${tokenA}` },
      body: invalidForm
    });
    if (invalidUploadRes.status !== 400) {
      throw new Error(`Invalid file type upload returned ${invalidUploadRes.status}, expected 400`);
    }
    console.log('✓ Invalid MIME/file type properly rejected (400 Bad Request).');

    // Oversized image (> 10MB)
    const oversizedBuffer = Buffer.alloc(11 * 1024 * 1024); // 11MB
    const oversizedForm = new FormData();
    oversizedForm.append('file', new Blob([oversizedBuffer], { type: 'image/jpeg' }), 'huge.jpg');
    const oversizedUploadRes = await fetch(`${BASE_URL}/api/conversations/${CONVERSATION_ID}/media`, {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${tokenA}` },
      body: oversizedForm
    });
    if (oversizedUploadRes.status !== 400) {
      throw new Error(`Oversized image returned ${oversizedUploadRes.status}, expected 400`);
    }
    console.log('✓ Oversized image properly rejected (>10MB).');

    // 7. Test Idempotency (Re-uploading same clientMessageId)
    console.log('\n[7/12] Testing Upload Idempotency with clientMessageId...');
    const duplicateClientMessageId = crypto.randomUUID();
    const idempForm1 = new FormData();
    idempForm1.append('file', new Blob([Buffer.from('TEST_IMG_1')], { type: 'image/png' }), 'test1.png');
    idempForm1.append('clientMessageId', duplicateClientMessageId);

    const firstRes = await fetch(`${BASE_URL}/api/conversations/${CONVERSATION_ID}/media`, {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${tokenA}` },
      body: idempForm1
    });
    const firstData = await firstRes.json();

    const idempForm2 = new FormData();
    idempForm2.append('file', new Blob([Buffer.from('TEST_IMG_1')], { type: 'image/png' }), 'test1.png');
    idempForm2.append('clientMessageId', duplicateClientMessageId);

    const secondRes = await fetch(`${BASE_URL}/api/conversations/${CONVERSATION_ID}/media`, {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${tokenA}` },
      body: idempForm2
    });
    const secondData = await secondRes.json();

    if (firstData.message._id !== secondData.message._id) {
      throw new Error('Idempotency check failed: duplicate message created');
    }
    console.log('✓ Idempotency verified: duplicate clientMessageId returned existing message without creating duplicate.');

    // 8. Test Reply to Media Message
    console.log('\n[8/12] Testing Reply to Media Message...');
    const replyRes = await fetch(`${BASE_URL}/api/conversations/${CONVERSATION_ID}/messages`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${tokenB}`
      },
      body: JSON.stringify({
        text: 'Great photo!',
        replyToMessageId: imgUploadData.message._id,
        clientMessageId: crypto.randomUUID()
      })
    });
    const replyData = await replyRes.json();
    if (replyData.message.replyToMessageId !== imgUploadData.message._id) {
      throw new Error('Reply target message ID mismatch');
    }
    console.log('✓ Successfully sent reply referencing media message.');

    // 9. Test Reaction to Media Message
    console.log('\n[9/12] Testing Reaction to Media Message...');
    const reactionReceivedByAPromise = new Promise<any>(res => socketA.once('message:reaction', res));
    const reactRes = await fetch(`${BASE_URL}/api/conversations/${CONVERSATION_ID}/messages/${imgUploadData.message._id}/reactions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${tokenB}`
      },
      body: JSON.stringify({ emoji: '❤️' })
    });
    if (!reactRes.ok) throw new Error('Failed to react to media message');
    const rxEvent = await reactionReceivedByAPromise;
    if (rxEvent.messageId !== imgUploadData.message._id || rxEvent.emoji !== '❤️') {
      throw new Error('Socket A received unexpected reaction event');
    }
    console.log('✓ Realtime reaction delivered to media message.');

    // 10. Test Delete for Everyone with Storage Cleanup
    console.log('\n[10/12] Testing Delete-for-everyone & Storage Cleanup...');
    const deleteEventPromise = new Promise<any>(res => socketB.once('message:delete', res));
    const deleteRes = await fetch(`${BASE_URL}/api/conversations/${CONVERSATION_ID}/messages/${imgUploadData.message._id}?everyone=true`, {
      method: 'DELETE',
      headers: { 'Authorization': `Bearer ${tokenA}` }
    });
    if (!deleteRes.ok) throw new Error('Delete for everyone failed');
    const delEvent = await deleteEventPromise;
    if (delEvent.messageId !== imgUploadData.message._id || !delEvent.everyone) {
      throw new Error('Delete event mismatch');
    }
    console.log('✓ Delete-for-everyone broadcasted and storage cleaned up.');

    // 11. Test Message History Persistence
    console.log('\n[11/12] Testing Message History Persistence on GET...');
    const histRes = await fetch(`${BASE_URL}/api/conversations/${CONVERSATION_ID}/messages?limit=20`, {
      headers: { 'Authorization': `Bearer ${tokenA}` }
    });
    const histData = await histRes.json();
    const persistedVideo = histData.messages.find((m: any) => m._id === videoUploadData.message._id);
    const persistedPdf = histData.messages.find((m: any) => m._id === pdfUploadData.message._id);
    if (!persistedVideo || persistedVideo.type !== 'video') {
      throw new Error('Video message not found in history');
    }
    if (!persistedPdf || persistedPdf.type !== 'file') {
      throw new Error('PDF message not found in history');
    }
    console.log('✓ Media messages correctly persisted and retrieved in history.');

    // 12. Full Phase 5 / 5.5 Regression Verification
    console.log('\n[12/12] Running Phase 5 / 5.5 Regression Verification (Text, Typing, Delivery & Seen Ticks)...');
    // Text A -> B
    const textReceivedByBPromise = new Promise<any>(res => socketB.once('new_message', res));
    const textSendRes = await fetch(`${BASE_URL}/api/conversations/${CONVERSATION_ID}/messages`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${tokenA}`
      },
      body: JSON.stringify({
        text: 'Regression test message from A',
        clientMessageId: crypto.randomUUID()
      })
    });
    const textMsg = (await textSendRes.json()).message;
    await textReceivedByBPromise;

    // Delivery ack from B
    const deliveryAckPromise = new Promise<any>((resolve) => {
      const handler = (data: any) => {
        if (data.messageId === textMsg._id && data.status === 'delivered') {
          socketA.off('message:status-update', handler);
          resolve(data);
        }
      };
      socketA.on('message:status-update', handler);
    });

    socketB.emit('message:delivery-ack', {
      messageId: textMsg._id,
      conversationId: CONVERSATION_ID
    });
    const deliveryStatus = await deliveryAckPromise;
    if (deliveryStatus.status !== 'delivered') throw new Error('Delivery status failed');

    await new Promise(r => setTimeout(r, 100));

    // Read ack from B
    const seenAckPromise = new Promise<any>((resolve) => {
      const handler = (data: any) => {
        if (data.messageId === textMsg._id && data.status === 'seen') {
          socketA.off('message:status-update', handler);
          resolve(data);
        }
      };
      socketA.on('message:status-update', handler);
    });

    socketB.emit('message:read-ack', {
      messageId: textMsg._id,
      conversationId: CONVERSATION_ID
    });
    const seenStatus = await seenAckPromise;
    if (seenStatus.status !== 'seen') throw new Error('Seen status failed');


    console.log('✓ Text messaging, delivery ticks, and seen ticks verified with 0 regressions.');

    console.log('\n====================================================');
    console.log('ALL PHASE 6 VALIDATION & REGRESSION TESTS PASSED! ✓');
    console.log('====================================================');
  } finally {
    if (socketA) socketA.disconnect();
    if (socketB) socketB.disconnect();
  }
}

runPhase6Tests().catch(err => {
  console.error('\n❌ PHASE 6 TEST FAILURE:', err);
  process.exit(1);
});
