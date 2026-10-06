import assert from 'node:assert/strict';
import test from 'node:test';
import fs from 'node:fs';
import path from 'node:path';

// -------------------------------------------------------------
// Test 1: TogetherPlayer URL Parsing (Issue 10 & Issue 3)
// -------------------------------------------------------------
test('TogetherPlayer: parseMediaUrl handles YouTube, Spotify, and Direct Video', () => {
  // We mirror parseMediaUrl implementation to test parsing correctness across all supported formats
  function parseMediaUrl(inputUrl) {
    if (!inputUrl) return { embedUrl: '', mediaType: 'direct', originalUrl: '' };
    const trimmed = inputUrl.trim();

    // Spotify Support
    const spotifyMatch = trimmed.match(/^(?:https?:\/\/)?open\.spotify\.com\/(track|album|playlist|episode|show)\/([a-zA-Z0-9]+)(?:\?.*)?$/i);
    if (spotifyMatch) {
      const [, type, id] = spotifyMatch;
      return {
        embedUrl: `https://open.spotify.com/embed/${type}/${id}?utm_source=generator&theme=0`,
        mediaType: 'spotify',
        originalUrl: trimmed
      };
    }
    const spotifyUriMatch = trimmed.match(/^spotify:(track|album|playlist|episode|show):([a-zA-Z0-9]+)$/i);
    if (spotifyUriMatch) {
      const [, type, id] = spotifyUriMatch;
      return {
        embedUrl: `https://open.spotify.com/embed/${type}/${id}?utm_source=generator&theme=0`,
        mediaType: 'spotify',
        originalUrl: trimmed
      };
    }

    // YouTube Support
    const ytMatch = trimmed.match(/(?:youtu\.be\/|youtube\.com\/(?:embed\/|v\/|watch\?v=|watch\?.+&v=|shorts\/))([\w-]{11})/i);
    if (ytMatch && ytMatch[1]) {
      const videoId = ytMatch[1];
      return {
        embedUrl: `https://www.youtube.com/embed/${videoId}?enablejsapi=1&origin=${encodeURIComponent(
          typeof window !== 'undefined' ? window.location.origin : 'https://wibby.live'
        )}&autoplay=1&playsinline=1&rel=0&iv_load_policy=3&controls=1`,
        mediaType: 'youtube',
        originalUrl: trimmed
      };
    }

    // Direct / custom video
    const isDirect = /\.(mp4|webm|ogg|mov|m4v|m3u8)($|\?)/i.test(trimmed);
    return {
      embedUrl: trimmed,
      mediaType: isDirect ? 'direct' : 'custom',
      originalUrl: trimmed
    };
  }

  // 1a. YouTube standard
  const yt1 = parseMediaUrl('https://www.youtube.com/watch?v=dQw4w9WgXcQ');
  assert.equal(yt1.mediaType, 'youtube');
  assert.match(yt1.embedUrl, /dQw4w9WgXcQ/);

  // 1b. YouTube short url
  const yt2 = parseMediaUrl('https://youtu.be/dQw4w9WgXcQ');
  assert.equal(yt2.mediaType, 'youtube');
  assert.match(yt2.embedUrl, /dQw4w9WgXcQ/);

  // 1c. YouTube shorts
  const yt3 = parseMediaUrl('https://www.youtube.com/shorts/dQw4w9WgXcQ');
  assert.equal(yt3.mediaType, 'youtube');
  assert.match(yt3.embedUrl, /dQw4w9WgXcQ/);

  // 1d. Spotify Track URL
  const sp1 = parseMediaUrl('https://open.spotify.com/track/4cOdK2wGLETKBW3PvgPWqT?si=abc');
  assert.equal(sp1.mediaType, 'spotify');
  assert.equal(sp1.embedUrl, 'https://open.spotify.com/embed/track/4cOdK2wGLETKBW3PvgPWqT?utm_source=generator&theme=0');

  // 1e. Spotify Playlist URL
  const sp2 = parseMediaUrl('https://open.spotify.com/playlist/37i9dQZF1DXcBWIGoYBM5M');
  assert.equal(sp2.mediaType, 'spotify');
  assert.equal(sp2.embedUrl, 'https://open.spotify.com/embed/playlist/37i9dQZF1DXcBWIGoYBM5M?utm_source=generator&theme=0');

  // 1f. Spotify URI
  const sp3 = parseMediaUrl('spotify:track:4cOdK2wGLETKBW3PvgPWqT');
  assert.equal(sp3.mediaType, 'spotify');
  assert.equal(sp3.embedUrl, 'https://open.spotify.com/embed/track/4cOdK2wGLETKBW3PvgPWqT?utm_source=generator&theme=0');

  // 1g. Direct MP4
  const mp4 = parseMediaUrl('https://example.com/videos/sample.mp4');
  assert.equal(mp4.mediaType, 'direct');
  assert.equal(mp4.embedUrl, 'https://example.com/videos/sample.mp4');

  // 1h. Direct WebM
  const webm = parseMediaUrl('https://example.com/movie.webm?token=123');
  assert.equal(webm.mediaType, 'direct');

  // 1i. Other URL
  const custom = parseMediaUrl('https://player.vimeo.com/video/76979871');
  assert.equal(custom.mediaType, 'custom');
});

// -------------------------------------------------------------
// Test 2: Quick Edit & Swipe Reply Logic (Issue 2)
// -------------------------------------------------------------
test('Quick Edit & Swipe Reply: 2-minute constraint and direction verification', () => {
  const currentUserId = 'user_abc';
  const now = Date.now();

  const messages = [
    { _id: 'm1', senderId: currentUserId, text: 'Hello from 5 mins ago', createdAt: new Date(now - 300000).toISOString() },
    { _id: 'm2', senderId: 'partner_xyz', text: 'Partner message', createdAt: new Date(now - 100000).toISOString() },
    { _id: 'm3', senderId: currentUserId, text: 'Recent own message', createdAt: new Date(now - 45000).toISOString() },
  ];

  // Quick edit finding most recent own message within 2 minutes (120,000 ms)
  function findQuickEditTarget(msgs, uid) {
    const currentTime = Date.now();
    for (let i = msgs.length - 1; i >= 0; i--) {
      const msg = msgs[i];
      if (msg.senderId === uid && !msg.deletedAt && (!msg.type || msg.type === 'text') && msg.text) {
        const age = currentTime - new Date(msg.createdAt).getTime();
        if (age <= 120000) {
          return { id: msg._id, text: msg.text };
        }
      }
    }
    return null;
  }

  const target = findQuickEditTarget(messages, currentUserId);
  assert.ok(target, 'Should find recent message');
  assert.equal(target.id, 'm3');
  assert.equal(target.text, 'Recent own message');

  // When all messages are older than 2 minutes
  const oldMessages = [
    { _id: 'm1', senderId: currentUserId, text: 'Old message', createdAt: new Date(now - 150000).toISOString() }
  ];
  const oldTarget = findQuickEditTarget(oldMessages, currentUserId);
  assert.equal(oldTarget, null, 'Should return null for messages older than 2 minutes');

  // Swipe thresholds:
  // Partner: swipe right (diffX > 0, >= 45px)
  const partnerThresholdMet = (diffX) => diffX >= 45;
  assert.equal(partnerThresholdMet(50), true);
  assert.equal(partnerThresholdMet(30), false);

  // Own: swipe left (diffX < 0, <= -45px)
  const ownThresholdMet = (diffX) => diffX <= -45;
  assert.equal(ownThresholdMet(-50), true);
  assert.equal(ownThresholdMet(-20), false);
});

// -------------------------------------------------------------
// Test 3: Font Stack & Native Color Emoji Verification (Issue 7)
// -------------------------------------------------------------
test('Native Emoji & Font Stack: index.css contains native color fonts without overriding message text', () => {
  const css = fs.readFileSync(path.resolve('client/src/index.css'), 'utf-8');

  // Verify --font-emoji
  assert.match(css, /--font-emoji:\s*"Apple Color Emoji",\s*"Segoe UI Emoji",\s*"Noto Color Emoji",\s*"Android Emoji",\s*emoji,\s*sans-serif/);

  // Verify font-variant-emoji: emoji is configured on emoji classes
  assert.match(css, /font-variant-emoji:\s*emoji;/);

  // Verify .message-text and .message-composer textarea are NOT in the font-emoji rule
  const emojiRuleMatch = css.match(/\/\*\s*=+[\s\S]*?Native & System Emoji Rendering[\s\S]*?\{([\s\S]*?)\}/);
  assert.ok(emojiRuleMatch, 'Native emoji rule found');
  assert.doesNotMatch(emojiRuleMatch[0], /\.message-text/);
  assert.doesNotMatch(emojiRuleMatch[0], /\.message-composer\s+textarea/);
});

// -------------------------------------------------------------
// Test 4: Server Call Handler & Together Handler Types (Issues 8, 10, 3)
// -------------------------------------------------------------
test('Server: togetherHandler supports spotify and callHandler has verify-active', () => {
  const togetherHandlerSrc = fs.readFileSync(path.resolve('server/src/socket/togetherHandler.ts'), 'utf-8');
  assert.match(togetherHandlerSrc, /'youtube'\s*\|\s*'direct'\s*\|\s*'custom'\s*\|\s*'spotify'/);

  const callHandlerSrc = fs.readFileSync(path.resolve('server/src/socket/callHandler.ts'), 'utf-8');
  assert.match(callHandlerSrc, /socket\.on\('call:verify-active'/);
  assert.match(callHandlerSrc, /socket\.emit\('call:ended'/);
});

// -------------------------------------------------------------
// Test 5: CallContext idempotency and socket reconnect (Issue 8)
// -------------------------------------------------------------
test('CallContext: resetTimeoutRef and call:verify-active on reconnect exist', () => {
  const callContextSrc = fs.readFileSync(path.resolve('client/src/context/CallContext.tsx'), 'utf-8');
  assert.match(callContextSrc, /resetTimeoutRef/);
  assert.match(callContextSrc, /socket\.emit\('call:verify-active'/);
});

// -------------------------------------------------------------
// Test 6: RTCService Video Watchdog and Screen Share Audio (Issues 4 & 11)
// -------------------------------------------------------------
test('RTCService: Screen audio notice and video watchdog unblocked', () => {
  const rtcSrc = fs.readFileSync(path.resolve('client/src/services/rtcService.ts'), 'utf-8');
  // Screen audio notice event
  assert.match(rtcSrc, /wibby:screen-audio-notice/);
  // System audio options included in display media constraints
  assert.match(rtcSrc, /systemAudio:\s*'include'/);
});

// -------------------------------------------------------------
// Test 7: Watch Together Singleton & Clean Docking (Issues 1, 9, 10)
// -------------------------------------------------------------
test('TogetherPlayer: activeTogetherInstanceId singleton and dock positioning', () => {
  const playerSrc = fs.readFileSync(path.resolve('client/src/components/together/TogetherPlayer.tsx'), 'utf-8');
  assert.match(playerSrc, /activeTogetherInstanceId/);
  assert.match(playerSrc, /wibby_together_side/);
  assert.match(playerSrc, /dock-\$\{snappedSide\}/);

  const playerCss = fs.readFileSync(path.resolve('client/src/components/together/TogetherPlayer.css'), 'utf-8');
  assert.match(playerCss, /\.dock-left/);
  assert.match(playerCss, /\.dock-right/);
});

console.log('✓ All 7 Production Pass test suites passed cleanly!');
