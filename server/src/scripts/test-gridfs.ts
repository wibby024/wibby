import { connectToDatabase, getDb } from '../lib/mongodb.js';
import { GridFSStorageProvider } from '../services/storage/index.js';

async function testGridFS() {
  console.log('=== TESTING GRIDFS STORAGE PROVIDER ===');
  await connectToDatabase();
  const provider = new GridFSStorageProvider('test_gridfs_uploads');

  const testKey = 'test_conv/2026/09/test_image.png';
  const testBuffer = Buffer.from('WIBBY_GRIDFS_TEST_DATA_' + Date.now());
  const mimeType = 'image/png';

  console.log('1. Uploading test buffer...');
  const uploadRes = await provider.upload(testBuffer, testKey, mimeType, { test: true });
  console.log('Upload result:', uploadRes);

  console.log('2. Streaming file back...');
  const streamRes = await provider.getStream(testKey);
  const chunks: Buffer[] = [];
  for await (const chunk of streamRes.stream) {
    chunks.push(Buffer.from(chunk));
  }
  const downloaded = Buffer.concat(chunks);
  console.log('Downloaded size:', downloaded.length, 'matches:', downloaded.equals(testBuffer));
  if (!downloaded.equals(testBuffer)) {
    throw new Error('Downloaded buffer does not match uploaded buffer!');
  }

  console.log('3. Range stream test (bytes 0-5)...');
  const rangeStream = provider.getRangeStream(testKey, 0, 5);
  const rangeChunks: Buffer[] = [];
  for await (const chunk of rangeStream) {
    rangeChunks.push(Buffer.from(chunk));
  }
  const rangeDownloaded = Buffer.concat(rangeChunks);
  console.log('Range downloaded (6 bytes):', rangeDownloaded.toString(), 'expected:', testBuffer.subarray(0, 6).toString());

  console.log('4. Deleting test file...');
  await provider.delete(testKey);

  console.log('5. Verifying deletion...');
  let notFound = false;
  try {
    await provider.getStream(testKey);
  } catch (e: any) {
    if (e.message === 'File not found') notFound = true;
  }
  console.log('File successfully deleted and not found:', notFound);

  console.log('=== GRIDFS STORAGE PROVIDER TEST PASSED! ===');
  process.exit(0);
}

testGridFS().catch((err) => {
  console.error('GridFS test failed:', err);
  process.exit(1);
});
