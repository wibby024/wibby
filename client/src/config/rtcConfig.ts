/**
 * Centralized WebRTC & Audio Configuration for Wibby.
 * STUN configuration for development with TURN-ready extensible structure.
 */

export const RTC_CONFIG: RTCConfiguration = {
  iceServers: [
    {
      urls: [
        'stun:stun.l.google.com:19302',
        'stun:stun1.l.google.com:19302',
        'stun:stun2.l.google.com:19302'
      ]
    }
  ],
  iceCandidatePoolSize: 10
};

/**
 * Updates active ICE servers with dynamically loaded TURN/STUN configuration.
 */
export function updateIceServers(servers: RTCIceServer[]): void {
  if (Array.isArray(servers) && servers.length > 0) {
    RTC_CONFIG.iceServers = servers;
  }
}

/**
 * Fetches dynamic STUN/TURN credentials from authenticated backend endpoint.
 */
export async function fetchServerIceConfig(token: string): Promise<RTCConfiguration> {
  try {
    const apiUrl = import.meta.env.VITE_API_URL || 'http://localhost:3000';
    const res = await fetch(`${apiUrl}/api/users/ice-servers`, {
      headers: {
        Authorization: `Bearer ${token}`
      }
    });
    if (res.ok) {
      const data = await res.json();
      if (data.iceServers && Array.isArray(data.iceServers)) {
        updateIceServers(data.iceServers);
      }
    }
  } catch (err) {
    console.warn('[WIBBY RTC] Using standard STUN servers:', err);
  }
  return RTC_CONFIG;
}

export const AUDIO_MEDIA_CONSTRAINTS: MediaStreamConstraints = {
  audio: {
    echoCancellation: true,
    noiseSuppression: true,
    autoGainControl: true,
    channelCount: 1, // Optimal mono configuration for human voice; prevents phase cancellation and robotic audio
    sampleRate: { ideal: 48000 }
  },
  video: false
};

export const VIDEO_MEDIA_CONSTRAINTS: MediaTrackConstraints = {
  width: { ideal: 1280, max: 1920 },
  height: { ideal: 720, max: 1080 },
  frameRate: { ideal: 30, max: 30 },
  facingMode: { ideal: 'user' }
};

/**
 * High-definition Camera Constraints.
 * Requests ideal 1080p target with 30 FPS ceiling, allowing the browser
 * to natively access physical camera capability without overconstraint errors.
 */
export const CAMERA_1080P_CONSTRAINTS: MediaTrackConstraints = {
  facingMode: { ideal: 'user' },
  width: { ideal: 1920, max: 1920 },
  height: { ideal: 1080, max: 1080 },
  frameRate: { ideal: 30, max: 30 }
};

export const CAMERA_720P_CONSTRAINTS: MediaTrackConstraints = {
  facingMode: { ideal: 'user' },
  width: { ideal: 1280, max: 1920 },
  height: { ideal: 720, max: 1080 },
  frameRate: { ideal: 30, max: 30 }
};

export const DEVICE_CAMERA_CONSTRAINTS: MediaTrackConstraints = CAMERA_720P_CONSTRAINTS;

export const PRODUCTION_CAMERA_CONSTRAINTS: MediaTrackConstraints[] = [
  // 1. Primary device camera constraint: 1080p FHD target @ 30 FPS
  {
    facingMode: { ideal: 'user' },
    width: { ideal: 1920, max: 1920 },
    height: { ideal: 1080, max: 1080 },
    frameRate: { ideal: 30, max: 30 }
  },
  // 2. High-performance 720p HD target (ideal 1280x720, up to 1080p) @ 30 FPS
  {
    facingMode: { ideal: 'user' },
    width: { ideal: 1280, max: 1920 },
    height: { ideal: 720, max: 1080 },
    frameRate: { ideal: 30, max: 30 }
  },
  // 3. Portrait 1080p target @ 30 FPS (Smartphone held vertically)
  {
    facingMode: { ideal: 'user' },
    width: { ideal: 1080, max: 1080 },
    height: { ideal: 1920, max: 1920 },
    frameRate: { ideal: 30, max: 30 }
  },
  // 4. Portrait 720p HD @ 30 FPS (Smartphone held vertically)
  {
    facingMode: { ideal: 'user' },
    width: { ideal: 720, max: 1080 },
    height: { ideal: 1280, max: 1920 },
    frameRate: { ideal: 30, max: 30 }
  },
  // 5. Universal desktop / USB webcam target without facingMode constraint (never drops resolution)
  {
    width: { ideal: 1280, max: 1920 },
    height: { ideal: 720, max: 1080 },
    frameRate: { ideal: 30, max: 30 }
  },
  // 6. Safe baseline HD: ideal 1280x720 (minimum target for normal calls)
  {
    width: { ideal: 1280 },
    height: { ideal: 720 },
    frameRate: { ideal: 30 }
  }
];

export const STEPPED_VIDEO_CONSTRAINTS: MediaTrackConstraints[] = [
  // 1. Full 1080p Full HD Target
  CAMERA_1080P_CONSTRAINTS,
  // 2. 720p HD Standard
  CAMERA_720P_CONSTRAINTS,
  // 3. 720p Universal
  {
    width: { ideal: 1280 },
    height: { ideal: 720 },
    frameRate: { ideal: 30 }
  }
];

export const FALLBACK_VIDEO_CONSTRAINTS: MediaTrackConstraints = STEPPED_VIDEO_CONSTRAINTS[2];

/**
 * Reconnection grace period for persistent call recovery (Level 1 & Level 2)
 */
export const CALL_RECONNECT_GRACE_PERIOD_MS = 90000; // 90 seconds

/**
 * Enables Opus In-Band Forward Error Correction (FEC) and optimizes for clear mono speech.
 * Eliminates packet loss dropouts and choppy/stuck voice over wireless networks.
 * Uses 64 kbps voice target with DTX and in-band FEC without stereo splitting.
 */
export function formatSdpWithOpusFec(sdp: string): string {
  const match = sdp.match(/a=rtpmap:(\d+)\s+opus\/48000/i);
  if (!match) return sdp;
  const pt = match[1];

  const fmtpRegex = new RegExp(`a=fmtp:${pt}\\s+([^\r\n]+)`, 'i');
  if (fmtpRegex.test(sdp)) {
    return sdp.replace(fmtpRegex, (_match, params) => {
      let updated = params;
      if (!updated.includes('useinbandfec=')) {
        updated += ';useinbandfec=1';
      }
      if (!updated.includes('maxaveragebitrate=')) {
        updated += ';maxaveragebitrate=64000';
      }
      if (!updated.includes('usedtx=')) {
        updated += ';usedtx=1';
      }
      return `a=fmtp:${pt} ${updated}`;
    });
  }

  return sdp.replace(
    new RegExp(`(a=rtpmap:${pt}\\s+opus\/48000[^\r\n]*)`, 'i'),
    `$1\r\na=fmtp:${pt} useinbandfec=1;maxaveragebitrate=64000;usedtx=1`
  );
}

export type VideoCodecPreference = 'auto' | 'vp8' | 'h264';

/**
 * Controlled SDP Video Bandwidth & Pacing Formatter (Guardrail #2 & #3).
 * When enabled, signals high start-bitrate (3.0 Mbps) and high ceiling (6.0 Mbps)
 * under m=video to prevent Chrome Google Congestion Control (GCC) from starving
 * motion frames at default 300 kbps during sudden head/hand movements.
 * Can be cleanly toggled off for before/after comparison.
 */
export function formatSdpForVideo(
  sdp: string,
  enableSdpBandwidthPacing = true,
  codecPref: VideoCodecPreference = 'auto'
): string {
  let result = sdp;

  // 1. Codec reordering in m=video line if specific codec preferred
  if (codecPref !== 'auto') {
    const targetCodec = codecPref === 'h264' ? 'H264' : 'VP8';
    const rtpmapRegex = new RegExp(`a=rtpmap:(\\d+)\\s+${targetCodec}\\/90000`, 'gi');
    const matchedPts: string[] = [];
    let ptMatch: RegExpExecArray | null;
    while ((ptMatch = rtpmapRegex.exec(result)) !== null) {
      matchedPts.push(ptMatch[1]);
    }
    if (matchedPts.length > 0) {
      result = result.replace(/(m=video\s+\d+\s+[\w/]+\s+)([\d\s]+)/, (_line, prefix, pts) => {
        const ptList = pts.trim().split(/\s+/).filter((p: string) => !matchedPts.includes(p));
        return `${prefix}${matchedPts.join(' ')} ${ptList.join(' ')}`;
      });
    }
  }

  // 2. Controlled Bandwidth Signaling under m=video
  if (enableSdpBandwidthPacing && result.includes('m=video')) {
    // Inject b=AS:6000 and b=TIAS:6000000 beneath m=video if not present
    const mVideoRegex = /(m=video[^\r\n]+(?:\r?\n[c=][^\r\n]+)?)/;
    if (!result.includes('b=AS:6000') && !result.includes('b=TIAS:6000000')) {
      result = result.replace(mVideoRegex, `$1\r\nb=AS:6000\r\nb=TIAS:6000000`);
    }

    // Locate video payload types (H264, VP8, VP9) and add start/min/max bitrates in a=fmtp
    // Primes Google Congestion Control at 2.2 Mbps start and 800 kbps floor for pristine high-quality rendering
    const videoPts: string[] = [];
    const videoPtRegex = /a=rtpmap:(\d+)\s+(?:VP8|H264|VP9)\/90000/gi;
    let ptMatch: RegExpExecArray | null;
    while ((ptMatch = videoPtRegex.exec(result)) !== null) {
      videoPts.push(ptMatch[1]);
    }

    for (const pt of videoPts) {
      const fmtpRegex = new RegExp(`a=fmtp:${pt}\\s+([^\r\n]+)`, 'i');
      if (fmtpRegex.test(result)) {
        result = result.replace(fmtpRegex, (_m, params) => {
          let updated = params;
          if (!updated.includes('x-google-min-bitrate=')) {
            updated += ';x-google-min-bitrate=800';
          }
          if (!updated.includes('x-google-start-bitrate=')) {
            updated += ';x-google-start-bitrate=2200';
          }
          if (!updated.includes('x-google-max-bitrate=')) {
            updated += ';x-google-max-bitrate=6000';
          }
          return `a=fmtp:${pt} ${updated}`;
        });
      } else {
        // Add fmtp line directly after rtpmap
        const rtpmapLine = new RegExp(`(a=rtpmap:${pt}\\s+[^\\r\\n]+)`, 'i');
        result = result.replace(
          rtpmapLine,
          `$1\r\na=fmtp:${pt} x-google-min-bitrate=800;x-google-start-bitrate=3000;x-google-max-bitrate=6000`
        );
      }
    }
  }

  return result;
}

/**
 * Combined SDP formatter for voice (Opus FEC) and video (Bandwidth & Codec).
 */
export function formatNegotiatedSdp(
  sdp: string,
  callType: 'voice' | 'video',
  enableSdpBandwidthPacing = true,
  codecPref: VideoCodecPreference = 'auto'
): string {
  let formatted = formatSdpWithOpusFec(sdp);
  if (callType === 'video') {
    formatted = formatSdpForVideo(formatted, enableSdpBandwidthPacing, codecPref);
  }
  return formatted;
}
