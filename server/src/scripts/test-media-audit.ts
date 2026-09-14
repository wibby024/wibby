import { getDb, connectToDatabase } from '../lib/mongodb.js';
import { auth } from '../lib/firebaseAdmin.js';
import { determineMediaType, validateFileSize, MEDIA_LIMITS } from '../config/media.js';

const BASE_URL = 'http://localhost:3000';
const CONVERSATION_ID = '6aa65c65cbb9d25ad0f8c344';
const USER_A_UID = '34e83xfHHoY6UVEku5UOLptUVCC3';

async function runAudit() {
  console.log('=== WIBBY MEDIA LIFECYCLE DIAGNOSTIC AUDIT ===');
  await connectToDatabase();
  const db = getDb();


  // 1. Generate Token
  const customToken = await auth.createCustomToken(USER_A_UID);
  const apiKey = process.env.FIREBASE_API_KEY || process.env.VITE_FIREBASE_API_KEY;
  const tokenRes = await fetch(`https://identitytoolkit.googleapis.com/v1/accounts:signInWithCustomToken?key=${apiKey}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ token: customToken, returnSecureToken: true })
  });
  const tokenData = await tokenRes.json();
  const idToken = tokenData.idToken;
  console.log('1. Generated ID token for User A: OK');

  // 2. Test determineMediaType for various extensions and MIME types
  console.log('\n2. Testing determineMediaType for supported formats:');
  const testCases = [
    { name: 'photo.jpg', mime: 'image/jpeg', expected: 'image' },
    { name: 'photo.png', mime: 'image/png', expected: 'image' },
    { name: 'photo.webp', mime: 'image/webp', expected: 'image' },
    { name: 'photo.gif', mime: 'image/gif', expected: 'image' },
    { name: 'photo.jpg', mime: 'application/octet-stream', expected: 'image' },
    { name: 'photo.png', mime: '', expected: 'image' },
    { name: 'video.mp4', mime: 'video/mp4', expected: 'video' },
    { name: 'video.webm', mime: 'video/webm', expected: 'video' },
    { name: 'video.mov', mime: 'video/quicktime', expected: 'video' },
    { name: 'doc.pdf', mime: 'application/pdf', expected: 'file' },
    { name: 'doc.txt', mime: 'text/plain', expected: 'file' },
    { name: 'doc.doc', mime: 'application/msword', expected: 'file' },
    { name: 'doc.docx', mime: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', expected: 'file' },
    { name: 'sheet.xls', mime: 'application/vnd.ms-excel', expected: 'file' },
    { name: 'sheet.xlsx', mime: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', expected: 'file' },
    { name: 'slides.ppt', mime: 'application/vnd.ms-powerpoint', expected: 'file' },
    { name: 'slides.pptx', mime: 'application/vnd.openxmlformats-officedocument.presentationml.presentation', expected: 'file' },
    { name: 'archive.zip', mime: 'application/zip', expected: 'file' },
  ];

  for (const tc of testCases) {
    const determined = determineMediaType(tc.mime, tc.name);
    console.log(`  - ${tc.name} (${tc.mime || 'empty'}): determined = ${determined} (expected: ${tc.expected}) -> ${determined === tc.expected ? 'PASS' : 'FAIL'}`);
  }

  // 3. Upload a sample image and test retrieval with and without auth
  console.log('\n3. Testing upload and retrieval endpoints:');
  const fakeImgBuffer = Buffer.from('FAKE_PNG_DATA_' + Date.now());
  const formData = new FormData();
  formData.append('file', new Blob([fakeImgBuffer], { type: 'image/png' }), 'test_photo.png');
  formData.append('caption', 'Diagnostic test');
  formData.append('clientMessageId', 'test-' + Date.now());

  const uploadRes = await fetch(`${BASE_URL}/api/conversations/${CONVERSATION_ID}/media`, {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${idToken}` },
    body: formData
  });

  if (!uploadRes.ok) {
    console.error('Upload failed:', await uploadRes.text());
    process.exit(1);
  }

  const uploadData = await uploadRes.json();
  const mediaUrl = uploadData.message.mediaUrl;
  const mediaKey = uploadData.message.mediaKey;
  console.log('Upload success: mediaUrl =', mediaUrl, ', mediaKey =', mediaKey);

  // Test GET with Header
  const getHeaderRes = await fetch(`${BASE_URL}${mediaUrl}`, {
    headers: { 'Authorization': `Bearer ${idToken}` }
  });
  console.log('GET with Authorization Header: status =', getHeaderRes.status, 'Content-Type =', getHeaderRes.headers.get('content-type'));

  // Test GET with Query Param (?token=...)
  const getQueryRes = await fetch(`${BASE_URL}${mediaUrl}?token=${encodeURIComponent(idToken)}`);
  console.log('GET with ?token=... query param: status =', getQueryRes.status, 'Content-Type =', getQueryRes.headers.get('content-type'));

  // Test GET without Auth (what plain <img src> does)
  const getNoAuthRes = await fetch(`${BASE_URL}${mediaUrl}`);
  console.log('GET without Auth (<img src>): status =', getNoAuthRes.status, '(401 expected currently)');

  process.exit(0);
}

runAudit().catch(err => {
  console.error(err);
  process.exit(1);
});
