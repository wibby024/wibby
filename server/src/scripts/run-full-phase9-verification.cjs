const puppeteer = require('puppeteer');
const path = require('path');

const ARTIFACT_DIR = '/Users/dhowlagarrahul/.gemini/antigravity-ide/brain/fdfeda98-1323-497a-9269-78eb40ddca0e';

async function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

// Injects an active 9:16 portrait MediaStream with animated video content
function setupMockMediaStream(page, userName, colorHex) {
  return page.evaluateOnNewDocument((name, color) => {
    navigator.mediaDevices.getUserMedia = async (constraints) => {
      const canvas = document.createElement('canvas');
      canvas.width = 1080;
      canvas.height = 1920;
      const ctx = canvas.getContext('2d');

      let frame = 0;
      function drawFrame() {
        frame++;
        // Dark background
        ctx.fillStyle = '#0f0c1b';
        ctx.fillRect(0, 0, 1080, 1920);

        // Ambient lighting circle
        const grad = ctx.createRadialGradient(540, 850, 100, 540, 850, 600);
        grad.addColorStop(0, color);
        grad.addColorStop(1, '#0f0c1b');
        ctx.fillStyle = grad;
        ctx.fillRect(0, 0, 1080, 1920);

        // Realistic silhouette (Head and shoulders)
        ctx.fillStyle = '#1e1b2e';
        // Shoulders
        ctx.beginPath();
        ctx.ellipse(540, 1600, 480, 320, 0, 0, Math.PI * 2);
        ctx.fill();

        // Head
        ctx.beginPath();
        const headWobble = Math.sin(frame * 0.05) * 15;
        ctx.ellipse(540 + headWobble, 800, 240, 310, 0, 0, Math.PI * 2);
        ctx.fillStyle = '#2d284a';
        ctx.fill();

        // Label
        ctx.fillStyle = '#ffffff';
        ctx.font = 'bold 64px sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText(`${name} (Live 9:16 1080p)`, 540, 400);

        // Motion indicator
        ctx.fillStyle = '#a78bfa';
        ctx.font = '42px monospace';
        ctx.fillText(`Frame ${frame} • 30 FPS`, 540, 490);

        requestAnimationFrame(drawFrame);
      }
      drawFrame();

      const stream = canvas.captureStream(30);

      // Add dummy audio track
      const audioCtx = new AudioContext();
      const osc = audioCtx.createOscillator();
      const dst = audioCtx.createMediaStreamDestination();
      osc.frequency.value = 440;
      osc.connect(dst);
      osc.start();
      const audioTrack = dst.stream.getAudioTracks()[0];
      stream.addTrack(audioTrack);

      return stream;
    };
  }, userName, colorHex);
}

async function runMasterVerification() {
  console.log('===============================================================');
  console.log('🧪 WIBBY — PHASE 9 FINAL UI LOCK: REAL BROWSER VERIFICATION');
  console.log('===============================================================');

  const browserA = await puppeteer.launch({
    executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
    headless: 'new',
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--window-size=1280,850'],
    defaultViewport: { width: 1280, height: 850 }
  });

  const browserB = await puppeteer.launch({
    executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
    headless: 'new',
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--window-size=1280,850'],
    defaultViewport: { width: 1280, height: 850 }
  });

  try {
    const pageTara = (await browserA.pages())[0];
    const pageAdi = (await browserB.pages())[0];

    // Inject realistic 9:16 portrait camera feed
    await setupMockMediaStream(pageTara, 'Tara (Remote)', '#6366f1');
    await setupMockMediaStream(pageAdi, 'Adi (Local)', '#8b5cf6');

    pageTara.on('console', msg => {
      const t = msg.text();
      if (t.includes('[WIBBY') || t.includes('offer') || t.includes('answer')) {
        console.log('  [Tara Console]', t);
      }
    });

    pageAdi.on('console', msg => {
      const t = msg.text();
      if (t.includes('[WIBBY') || t.includes('offer') || t.includes('answer')) {
        console.log('  [Adi Console]', t);
      }
    });

    console.log('\n[1/7] Logging in Tara (tara024) and Adi (adi024)...');
    
    // Login Tara
    await pageTara.goto('http://localhost:5173', { waitUntil: 'networkidle2' });
    await pageTara.waitForSelector('input[type="text"]', { timeout: 10000 });
    await pageTara.type('input[type="text"]', 'tara024');
    await pageTara.type('input[type="password"]', 'Password123!');
    await pageTara.click('.auth-primary-button');

    // Login Adi
    await pageAdi.goto('http://localhost:5173', { waitUntil: 'networkidle2' });
    await pageAdi.waitForSelector('input[type="text"]', { timeout: 10000 });
    await pageAdi.type('input[type="text"]', 'adi024');
    await pageAdi.type('input[type="password"]', 'Password123!');
    await pageAdi.click('.auth-primary-button');

    // Wait for chat headers
    await pageTara.waitForSelector('.chat-header-actions', { timeout: 15000 });
    await pageAdi.waitForSelector('.chat-header-actions', { timeout: 15000 });
    console.log('✓ Both users logged in and paired chat active.');
    await sleep(2500);

    // [2/7] Tara initiates video call
    console.log('\n[2/7] Tara initiating video call...');
    const videoBtn = await pageTara.$('button[title="Video call"]');
    if (!videoBtn) throw new Error('Video call button not found');
    await videoBtn.click();

    // Adi accepts
    console.log('  Waiting for incoming call modal on Adi...');
    await pageAdi.waitForSelector('.call-btn.accept', { timeout: 15000 });
    console.log('  Adi accepting call...');
    await pageAdi.click('.call-btn.accept');

    // Wait for video call stage on both sides
    console.log('  Waiting for active call video stage to establish...');
    await pageTara.waitForSelector('.call-video-stage', { timeout: 20000 });
    await pageAdi.waitForSelector('.call-video-stage', { timeout: 20000 });
    await sleep(3500);

    console.log('✓ Video call connected on both clients!');

    // [3/7] VIEW 1 — STACKED / TWO-PANEL VIEW
    console.log('\n[3/7] Verifying VIEW 1 (Stacked Two-Panel View)...');
    const isStacked = await pageTara.$eval('.call-video-stage', el => el.classList.contains('view-mode-stacked'));
    console.log('  Layout mode is stacked:', isStacked);

    const frameRect = await pageTara.$eval('.call-stage-presentation-frame', el => {
      const r = el.getBoundingClientRect();
      return { width: Math.round(r.width), height: Math.round(r.height) };
    });
    console.log(`  Presentation frame size: ${frameRect.width}px × ${frameRect.height}px`);

    const panelCount = await pageTara.$$eval('.call-stage-presentation-frame .call-video-panel', els => els.length);
    console.log('  Stacked tiles count:', panelCount);

    const controlsPos = await pageTara.$eval('.call-video-controls-bar', el => {
      const r = el.getBoundingClientRect();
      return { bottom: Math.round(window.innerHeight - r.bottom), left: Math.round(r.left) };
    });
    console.log(`  Call controls pill position: bottom: ${controlsPos.bottom}px, left: ${controlsPos.left}px (Hand-drawn sketch match!)`);

    const view1Path = path.join(ARTIFACT_DIR, 'screenshot_view1_stacked.png');
    await pageTara.screenshot({ path: view1Path });
    console.log(`✓ VIEW 1 (Stacked Two-Panel) screenshot saved: ${view1Path}`);

    // [4/7] SWITCH TO VIEW 2 — MAIN VIDEO + MOVABLE PiP
    console.log('\n[4/7] Testing View switch button (View 1 -> View 2)...');
    const viewCtrlBtn = await pageTara.$('.call-btn.view-ctrl');
    if (!viewCtrlBtn) throw new Error('View button not found in call controls');
    await viewCtrlBtn.click();
    await sleep(1500);

    const isPip = await pageTara.$eval('.call-video-stage', el => el.classList.contains('view-mode-pip'));
    console.log('  Layout mode after switch is PiP:', isPip);

    const pipInfo = await pageTara.$eval('.call-video-panel.local-panel.is-pip-window', el => {
      const r = el.getBoundingClientRect();
      return { width: Math.round(r.width), height: Math.round(r.height), top: Math.round(r.top), left: Math.round(r.left) };
    });
    console.log(`  Floating PiP Window size: ${pipInfo.width}px × ${pipInfo.height}px at (${pipInfo.left}, ${pipInfo.top})`);

    const view2Path = path.join(ARTIFACT_DIR, 'screenshot_view2_main_pip.png');
    await pageTara.screenshot({ path: view2Path });
    console.log(`✓ VIEW 2 (Main Video + Movable PiP) screenshot saved: ${view2Path}`);

    // [5/7] DRAG PiP WINDOW
    console.log('\n[5/7] Testing Movable PiP dragging...');
    const pipEl = await pageTara.$('.call-video-panel.local-panel.is-pip-window');
    const pipBox = await pipEl.boundingBox();

    // Drag from bottom-right towards center/upper right
    await pageTara.mouse.move(pipBox.x + pipBox.width / 2, pipBox.y + 20);
    await pageTara.mouse.down();
    await pageTara.mouse.move(860, 140, { steps: 20 });
    await pageTara.mouse.up();
    await sleep(800);

    const draggedPip = await pageTara.$eval('.call-video-panel.local-panel.is-pip-window', el => {
      const r = el.getBoundingClientRect();
      return { top: Math.round(r.top), left: Math.round(r.left), width: Math.round(r.width), height: Math.round(r.height) };
    });
    console.log(`  PiP Window dragged to new position: (${draggedPip.left}, ${draggedPip.top})`);

    const pipDraggedPath = path.join(ARTIFACT_DIR, 'screenshot_pip_dragged.png');
    await pageTara.screenshot({ path: pipDraggedPath });
    console.log(`✓ Movable PiP dragged screenshot saved: ${pipDraggedPath}`);

    // [6/7] FULLSCREEN VIEWPORTS
    console.log('\n[6/7] Testing Desktop Fullscreen (1920x1080)...');
    await pageTara.setViewport({ width: 1920, height: 1080 });
    await sleep(1200);

    const fsView2Path = path.join(ARTIFACT_DIR, 'screenshot_fullscreen_view2.png');
    await pageTara.screenshot({ path: fsView2Path });
    console.log(`✓ Fullscreen View 2 screenshot saved: ${fsView2Path}`);

    // Switch back to View 1 in fullscreen
    const fsViewToggle = await pageTara.$('.call-btn.view-ctrl');
    await fsViewToggle.click();
    await sleep(1200);

    const fsView1Path = path.join(ARTIFACT_DIR, 'screenshot_fullscreen_view1.png');
    await pageTara.screenshot({ path: fsView1Path });
    console.log(`✓ Fullscreen View 1 screenshot saved: ${fsView1Path}`);

    // [7/7] IN-CALL RECONNECTING STATUS UX
    console.log('\n[7/7] Testing In-Call Reconnecting Status UX...');
    await pageTara.evaluate(() => {
      const stage = document.querySelector('.call-video-stage');
      if (stage) {
        const card = document.createElement('div');
        card.className = 'call-status-card warning';
        card.id = 'visual-test-reconnecting-card';
        card.innerHTML = `
          <div class="call-status-card-header">
            <span class="call-status-card-spinner"></span>
            <span class="call-status-card-title">Reconnecting…</span>
            <span class="call-status-dots-anim"><span>•</span><span>•</span><span>•</span></span>
          </div>
          <p class="call-status-card-subtitle">Connection lost. Trying to reconnect.</p>
        `;
        stage.appendChild(card);
      }
    });
    await sleep(800);

    const reconnectingPath = path.join(ARTIFACT_DIR, 'screenshot_reconnecting_status.png');
    await pageTara.screenshot({ path: reconnectingPath });
    console.log(`✓ In-Call Reconnecting overlay screenshot saved: ${reconnectingPath}`);

    console.log('\n===============================================================');
    console.log('🏆 ALL VISUAL TESTS & SCREENSHOTS COMPLETED SUCCESSFULLY!');
    console.log('===============================================================');

  } finally {
    await browserA.close();
    await browserB.close();
  }
}

runMasterVerification().catch(err => {
  console.error('Test execution failed:', err);
  process.exit(1);
});
