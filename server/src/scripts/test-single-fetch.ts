import { auth } from '../lib/firebaseAdmin.js';
const USER_A_UID = '34e83xfHHoY6UVEku5UOLptUVCC3';
const FIREBASE_API_KEY = 'AIzaSyC_GUtnwhi9VrZS9pintc_-voCZwftD3MA';

async function getIdTokenForUid(uid: string): Promise<string> {
  const customToken = await auth.createCustomToken(uid);
  const res = await fetch(`https://identitytoolkit.googleapis.com/v1/accounts:signInWithCustomToken?key=${FIREBASE_API_KEY}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ token: customToken, returnSecureToken: true })
  });
  const data = await res.json();
  return data.idToken;
}

async function test() {
  const token = await getIdTokenForUid(USER_A_UID);
  
  // Test 1: Full path
  const url1 = 'http://localhost:3000/api/conversations/6aa65c65cbb9d25ad0f8c344/media/6aa65c65cbb9d25ad0f8c344/2026/09/4f651024-4c5e-4a99-b34e-4b47e7c499b8-ChatGPT_Image_Sep_13__2026__05_59_46_PM.png';
  console.log('Testing URL 1 (unencoded):', url1);
  const r1 = await fetch(url1, {
    headers: { Authorization: `Bearer ${token}` }
  });
  console.log('R1 Status:', r1.status);
  console.log('R1 Content-Type:', r1.headers.get('content-type'));
  console.log('R1 Content-Length:', r1.headers.get('content-length'));
  const buf1 = await r1.arrayBuffer();
  console.log('R1 Bytes:', buf1.byteLength);

  // Test 2: Encoded slashes path (legacy)
  const url2 = 'http://localhost:3000/api/conversations/6aa65c65cbb9d25ad0f8c344/media/6aa65c65cbb9d25ad0f8c344%2F2026%2F09%2F4f651024-4c5e-4a99-b34e-4b47e7c499b8-ChatGPT_Image_Sep_13__2026__05_59_46_PM.png';
  console.log('\nTesting URL 2 (with %2F):', url2);
  const r2 = await fetch(url2, {
    headers: { Authorization: `Bearer ${token}` }
  });
  console.log('R2 Status:', r2.status);
  console.log('R2 Content-Type:', r2.headers.get('content-type'));
  console.log('R2 Content-Length:', r2.headers.get('content-length'));
  const buf2 = await r2.arrayBuffer();
  console.log('R2 Bytes:', buf2.byteLength);

  process.exit(0);
}

test().catch(err => {
  console.error(err);
  process.exit(1);
});
