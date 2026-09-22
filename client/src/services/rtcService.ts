import {
  RTC_CONFIG,
  AUDIO_MEDIA_CONSTRAINTS,
  PRODUCTION_CAMERA_CONSTRAINTS,
  formatNegotiatedSdp,
  type VideoCodecPreference
} from '../config/rtcConfig';

export type VoiceExperienceMode = 'natural' | 'focused' | 'spatial';
export type AudioPipelineMode = 'native' | 'processed';
export type VideoQualityMode = 'auto' | '1080p' | '720p' | 'data-saver';
export type CallAudioQuality = 'excellent' | 'degraded' | 'poor';

export interface CallQualityMetrics {
  packetLossRate: number;
  jitterMs: number;
  rttMs: number;
  audioLevel: number;
  packetsReceived: number;
  packetsLost: number;
}

export interface RealtimeCallTelemetry {
  // 1. Capture & Local Camera Monitor (Test 1)
  cameraCapability?: string;
  actualCaptureResolution?: string;
  captureWidth: number;
  captureHeight: number;
  captureFps: number;
  localPresentedFps: number;
  localAvgFrameIntervalMs: number;
  localFrameIntervalVarianceMs: number;
  localMaxFrameGapMs: number;

  // 2. WebRTC Outbound Sender (Test 2)
  sendWidth: number;
  sendHeight: number;
  sendFps: number;
  encodedFps: number;
  sentFps: number;
  sendBitrateMbps: number;
  staticBitrateMbps?: number;
  motionBitrateMbps?: number;
  bitrateCeilingMbps?: number;
  framesSent?: number;
  framesEncoded?: number;
  qualityLimitationReason: string;
  qualityLimitationDurations?: string;
  encoderImplementation?: string;

  // 3. WebRTC Inbound Receiver (Test 4)
  receiveWidth: number;
  receiveHeight: number;
  receiveFps: number;
  decodedFps: number;
  droppedFps: number;
  receiveBitrateMbps: number;
  framesReceived?: number;
  framesDecoded?: number;
  framesDropped?: number;
  decoderImplementation?: string;
  videoPacketsLost: number;
  videoPacketLossRate: number;
  videoJitterMs: number;

  // Audio Receiver
  audioCodec: string;
  audioSampleRate: number;
  audioBitrateKbps: number;
  audioPacketsLost: number;
  audioPacketLossRate: number;
  audioJitterMs: number;
  audioJitterBufferDelayMs: number;
  audioConcealedSamples: number;
  audioLevel: number;

  // 4. Network & Transport (Test 3)
  rttMs: number;
  availableOutgoingBitrateKbps: number;
  availableIncomingBitrateKbps?: number;
  iceCandidateType: string;
  candidatePairRoute?: string;
  turnStatus: string;
  qualityScore: 'excellent' | 'degraded' | 'poor';

  // 5. Remote Display Pacing & Freeze Telemetry (Test 5 - rVFC)
  presentedFps: number;
  avgFrameIntervalMs: number;
  frameIntervalVarianceMs: number;
  maxFrameGapMs: number;
  freezeCount: number;
  maxFreezeDurationMs: number;
  activeVideoCodec: string;
}

export class RTCService {
  private peerConnection: RTCPeerConnection | null = null;
  private localStream: MediaStream | null = null;
  private remoteStream: MediaStream | null = null;
  private remoteAudioElement: HTMLAudioElement | null = null;
  private remoteDisplayAudioElement: HTMLAudioElement | null = null;
  private remoteDisplayAudioTrack: MediaStreamTrack | null = null;
  private remoteAudioTrack: MediaStreamTrack | null = null;
  private pendingIceCandidates: RTCIceCandidateInit[] = [];
  private remoteDescriptionSet = false;

  // Video Engine State (Phase 9)
  private callType: 'voice' | 'video' = 'voice';
  private sessionId: string | null = null;
  private localVideoElement: HTMLVideoElement | null = null;
  private remoteVideoElement: HTMLVideoElement | null = null;
  private localVideoElements = new Set<HTMLVideoElement>();
  private remoteVideoElements = new Set<HTMLVideoElement>();
  private remoteVideoStream: MediaStream | null = null;
  private isCameraOff = false;
  private isCameraUnavailable = false;

  // Phase 10: Screen Sharing State
  private screenStream: MediaStream | null = null;
  private screenVideoElements = new Set<HTMLVideoElement>();
  private preSharingVideoTrack: MediaStreamTrack | null = null;
  private displayAudioSender: RTCRtpSender | null = null;
  private isScreenSharing = false;
  private onScreenSharingEndedCallback: (() => void) | null = null;
  private cameraHardwareCapability = 'Detecting...';
  private currentCaptureWidth = 0;
  private currentCaptureHeight = 0;
  private currentCaptureFps = 0;
  private videoQualityMode: VideoQualityMode = 'auto';
  private videoBitrateTargetMbps = 3.2; // 3.2 Mbps optimal smooth motion budget
  private peakMotionBitrateMbps = 0;
  private minStaticBitrateMbps = 0;

  // Remote Display Pacing & Freeze Telemetry (Guardrail #4)
  private rvfcHandle: number | null = null;
  private rvfcTargetElement: HTMLVideoElement | null = null;
  private frameTimestamps: number[] = [];
  private frameIntervals: number[] = [];
  private lastPresentationTime = 0;
  private totalPresentedFrames = 0;
  private displayPresentedFps = 0;
  private displayAvgFrameIntervalMs = 0;
  private displayFrameIntervalVarianceMs = 0;
  private displayMaxFrameGapMs = 0;
  private displayFreezeCount = 0;
  private displayMaxFreezeDurationMs = 0;

  // Local Camera Display Pacing Telemetry (Test 1 - Direct Hardware Pacing)
  private localRvfcHandle: number | null = null;
  private localRvfcTargetElement: HTMLVideoElement | null = null;
  private localFrameTimestamps: number[] = [];
  private localFrameIntervals: number[] = [];
  private localLastPresentationTime = 0;
  private localDisplayPresentedFps = 0;
  private localDisplayAvgFrameIntervalMs = 0;
  private localDisplayFrameIntervalVarianceMs = 0;
  private localDisplayMaxFrameGapMs = 0;

  private activeNegotiatedVideoCodec = 'VP8';
  private enableSdpBandwidthPacing = true;
  private videoCodecPreference: VideoCodecPreference = 'auto';
  private latestTelemetry: RealtimeCallTelemetry | null = null;

  // Audio Architecture (Guardrail #1 & #3: Single Output Path & Native Reference)
  private audioPipelineMode: AudioPipelineMode = 'native'; // Default is NATIVE

  private currentCallId: string | null = null;
  private pcId: string | null = null;
  private addTrackInvocationCount = 0;
  private sessionGeneration = 0;

  // Voice Engine Web Audio Nodes (Natural / Focused / Spatial)
  private audioCtx: AudioContext | null = null;
  private mediaStreamSource: MediaStreamAudioSourceNode | null = null;
  private naturalGain: GainNode | null = null;
  private highpassFilter: BiquadFilterNode | null = null;
  private presenceFilter: BiquadFilterNode | null = null;
  private lowpassFilter: BiquadFilterNode | null = null;
  private dynamicsCompressor: DynamicsCompressorNode | null = null;
  private voiceGainNode: GainNode | null = null;
  private focusedGain: GainNode | null = null;
  private spatialGain: GainNode | null = null;
  private spatialPanner: PannerNode | null = null;
  private analyserNode: AnalyserNode | null = null;
  private speakingInterval: ReturnType<typeof setInterval> | null = null;
  private isRemoteSpeaking = false;
  private lastSpeechTime = 0;
  private voiceExperience: VoiceExperienceMode = 'natural';
  private voiceEngineActive = false;

  // Real-time quality telemetry
  private statsInterval: ReturnType<typeof setInterval> | null = null;
  private prevPacketsReceived = 0;
  private prevPacketsLost = 0;
  private prevAudioBytesReceived = 0;
  private prevVideoBytesSent = 0;
  private prevVideoBytesReceived = 0;
  private prevVideoPacketsReceived = 0;
  private prevVideoPacketsLost = 0;
  private prevFramesSent = 0;
  private prevFramesEncoded = 0;
  private prevFramesReceived = 0;
  private prevFramesDecoded = 0;
  private prevFramesDropped = 0;
  private prevTimestamp = 0;
  private currentAudioQuality: CallAudioQuality = 'excellent';
  private lastAudioLevelFromStats = 0; // Updated by stats loop, used for native-mode speaking detection
  private onQualityChangeCallback: ((quality: CallAudioQuality, metrics: CallQualityMetrics) => void) | null = null;
  private onTelemetryCallback: ((telemetry: RealtimeCallTelemetry) => void) | null = null;
  private onSpeakingChangeCallback: ((speaking: boolean) => void) | null = null;

  private iceDisconnectTimeout: ReturnType<typeof setTimeout> | null = null;
  private isRestartingIce = false;

  private onIceCandidateCallback: ((candidate: RTCIceCandidateInit) => void) | null = null;
  private onConnectionStateChangeCallback: ((state: RTCPeerConnectionState) => void) | null = null;
  private onIceConnectionStateChangeCallback: ((state: RTCIceConnectionState) => void) | null = null;
  private onRemoteAudioActiveCallback: (() => void) | null = null;
  private onRemoteVideoActiveCallback: (() => void) | null = null;
  private onRemoteVideoTrackCallback: ((stream: MediaStream) => void) | null = null;
  private onIceRestartNeededCallback: ((offer: RTCSessionDescriptionInit) => void) | null = null;

  /**
   * Acquire local microphone audio stream with device echo cancellation & noise suppression
   */
  async acquireLocalMicrophone(): Promise<MediaStream> {
    if (!navigator.mediaDevices?.getUserMedia) {
      const unsupportedErr = new Error('Microphone access is not supported by your browser');
      unsupportedErr.name = 'NotSupportedError';
      throw unsupportedErr;
    }

    try {
      console.log('[WIBBY WEBRTC] Requesting microphone access with constraints:', AUDIO_MEDIA_CONSTRAINTS);
      const stream = await navigator.mediaDevices.getUserMedia(AUDIO_MEDIA_CONSTRAINTS);
      this.localStream = stream;

      const track = stream.getAudioTracks()[0];
      const settings = track?.getSettings ? track.getSettings() : null;

      console.log('[WIBBY WEBRTC] Local microphone stream acquired successfully:', {
        streamId: stream.id,
        streamActive: stream.active,
        trackId: track?.id,
        trackLabel: track?.label,
        trackReadyState: track?.readyState,
        trackEnabled: track?.enabled,
        trackMuted: track?.muted,
        settings: {
          sampleRate: settings?.sampleRate,
          channelCount: settings?.channelCount,
          echoCancellation: settings?.echoCancellation,
          noiseSuppression: settings?.noiseSuppression,
          autoGainControl: settings?.autoGainControl
        }
      });

      return stream;
    } catch (err: any) {
      console.error('[WIBBY WEBRTC] Failed to acquire microphone with primary constraints:', {
        name: err?.name,
        message: err?.message,
        constraint: err?.constraint,
        stack: err?.stack
      });

      // If constraints were too strict for the hardware/browser, attempt standard fallback
      if (err.name === 'OverconstrainedError') {
        try {
          console.log('[WIBBY WEBRTC] Attempting fallback to basic audio constraints: { audio: true }');
          const fallbackStream = await navigator.mediaDevices.getUserMedia({ audio: true });
          this.localStream = fallbackStream;
          console.log('[WIBBY WEBRTC] Local microphone acquired via basic constraints:', {
            streamId: fallbackStream.id,
            streamActive: fallbackStream.active
          });
          return fallbackStream;
        } catch (fallbackErr: any) {
          console.error('[WIBBY WEBRTC] Fallback microphone acquisition also failed:', {
            name: fallbackErr?.name,
            message: fallbackErr?.message,
            stack: fallbackErr?.stack
          });
          throw fallbackErr;
        }
      }

      throw err;
    }
  }

  /**
   * Acquire local media stream for voice or video calls.
   * If callType is 'video', attempts 1080p target and steps down to 720p/540p/480p on OverconstrainedError.
   * If camera access is denied or hardware unavailable, automatically falls back to voice-only.
   */
  async acquireLocalMedia(
    callType: 'voice' | 'video',
    preferredVideoDeviceId?: string
  ): Promise<{ stream: MediaStream; cameraUnavailable: boolean }> {
    this.callType = callType;
    if (callType === 'voice') {
      const stream = await this.acquireLocalMicrophone();
      this.isCameraUnavailable = false;
      this.isCameraOff = false;
      this.currentCaptureWidth = 0;
      this.currentCaptureHeight = 0;
      this.currentCaptureFps = 0;
      return { stream, cameraUnavailable: false };
    }

    if (!navigator.mediaDevices?.getUserMedia) {
      const unsupportedErr = new Error('Media access is not supported by your browser');
      unsupportedErr.name = 'NotSupportedError';
      throw unsupportedErr;
    }

    // Device camera constraints matching CameraCaptureModal.tsx:
    // Requests ideal 1080p target with facingMode (or preferred deviceId), allowing the browser
    // to negotiate the native camera resolution without OverconstrainedError failures.
    const currentFacing = this.currentFacingMode || 'user';
    const constraintsList: MediaTrackConstraints[] = preferredVideoDeviceId
      ? [
          { deviceId: { exact: preferredVideoDeviceId }, width: { ideal: 1920 }, height: { ideal: 1080 } },
          { deviceId: { exact: preferredVideoDeviceId }, width: { ideal: 1280 }, height: { ideal: 720 } },
          { deviceId: { ideal: preferredVideoDeviceId } }
        ]
      : PRODUCTION_CAMERA_CONSTRAINTS.map(c => ({
          ...c,
          facingMode: c.facingMode ? currentFacing : undefined
        }));

    let acquiredStream: MediaStream | null = null;
    let cameraUnavailable = false;

    for (let i = 0; i < constraintsList.length; i++) {
      const videoConstraint = constraintsList[i];
      try {
        console.log(`[WIBBY WEBRTC] Attempting camera acquisition step [${i + 1}/${constraintsList.length}]:`, videoConstraint);
        const stream = await navigator.mediaDevices.getUserMedia({
          audio: AUDIO_MEDIA_CONSTRAINTS.audio,
          video: Object.keys(videoConstraint).length > 0 ? videoConstraint : true
        });
        acquiredStream = stream;
        break;
      } catch (err: any) {
        console.warn(`[WIBBY WEBRTC] Camera acquisition step [${i + 1}] failed:`, err?.name, err?.message);
        if (err?.name === 'NotAllowedError' || err?.name === 'PermissionDeniedError') {
          // If permission was denied by user, do not keep looping through constraints
          break;
        }
      }
    }

    if (!acquiredStream) {
      console.warn('[WIBBY WEBRTC] Camera unavailable/denied. Falling back to audio-only gracefully.');
      try {
        acquiredStream = await this.acquireLocalMicrophone();
        cameraUnavailable = true;
        this.isCameraUnavailable = true;
        this.isCameraOff = true;
      } catch (audioErr) {
        throw audioErr;
      }
    } else {
      this.isCameraUnavailable = false;
      this.isCameraOff = false;
    }

    this.localStream = acquiredStream;

    // Inspect actual camera capture settings & capabilities
    const vTrack = acquiredStream.getVideoTracks()[0];
    if (vTrack) {
      const settings = vTrack.getSettings ? vTrack.getSettings() : {};
      const caps = vTrack.getCapabilities ? vTrack.getCapabilities() : {};
      this.currentCaptureWidth = settings.width || 0;
      this.currentCaptureHeight = settings.height || 0;
      this.currentCaptureFps = Math.round(settings.frameRate || 0);
      const maxWidth = (caps as any).width?.max || settings.width || 1920;
      const maxHeight = (caps as any).height?.max || settings.height || 1080;
      this.cameraHardwareCapability = maxWidth >= 3840 ? '3840×2160 (4K UHD)' : maxWidth >= 1920 ? '1920×1080 (1080p FHD)' : `${maxWidth}×${maxHeight}`;

      if (settings.facingMode) {
        this.currentFacingMode = settings.facingMode as 'user' | 'environment';
        if (this.onFacingModeChangeCallback) {
          this.onFacingModeChangeCallback(this.currentFacingMode);
        }
      }

      if ('contentHint' in vTrack) {
        vTrack.contentHint = 'motion';
        console.log('[WIBBY WEBRTC] Applied contentHint = "motion" to camera video track for buttery-smooth 30fps motion');
      }

      console.log('[WIBBY WEBRTC] Actual camera capture settings & capabilities:', {
        label: vTrack.label,
        hardwareCapability: this.cameraHardwareCapability,
        actualWidth: this.currentCaptureWidth,
        actualHeight: this.currentCaptureHeight,
        actualFps: this.currentCaptureFps,
        capabilities: {
          maxWidth: (caps as any).width?.max,
          maxHeight: (caps as any).height?.max,
          maxFps: (caps as any).frameRate?.max
        }
      });
    }

    // Attach to all registered local video preview elements
    this.localVideoElements.forEach(el => {
      if (el.srcObject !== acquiredStream) el.srcObject = acquiredStream;
      el.play().catch(() => {});
      this.startLocalDisplayPacingMonitor(el);
    });

    console.log('[WIBBY WEBRTC] Local stream acquired successfully:', {
      streamId: acquiredStream.id,
      audioTracks: acquiredStream.getAudioTracks().length,
      videoTracks: acquiredStream.getVideoTracks().length,
      cameraUnavailable
    });

    return { stream: acquiredStream, cameraUnavailable };
  }

  /**
   * Start requestVideoFrameCallback monitor on local camera preview (Test 1).
   * Verifies whether raw local camera motion is smooth and delivering ~30 FPS at 33.3ms intervals.
   */
  private startLocalDisplayPacingMonitor(el: HTMLVideoElement): void {
    this.stopLocalDisplayPacingMonitor();
    if (!el || typeof (el as any).requestVideoFrameCallback !== 'function') return;

    this.localRvfcTargetElement = el;
    this.localFrameTimestamps = [];
    this.localFrameIntervals = [];
    this.localLastPresentationTime = 0;

    const onLocalFrame = (now: DOMHighResTimeStamp) => {
      if (this.localRvfcTargetElement !== el) return;

      if (this.localLastPresentationTime > 0) {
        const interval = now - this.localLastPresentationTime;
        this.localFrameIntervals.push(interval);
        if (this.localFrameIntervals.length > 30) {
          this.localFrameIntervals.shift();
        }

        if (interval > this.localDisplayMaxFrameGapMs) {
          this.localDisplayMaxFrameGapMs = Number(interval.toFixed(1));
        }

        const sum = this.localFrameIntervals.reduce((a, b) => a + b, 0);
        const avg = sum / this.localFrameIntervals.length;
        this.localDisplayAvgFrameIntervalMs = Number(avg.toFixed(1));

        const sumSquareDiffs = this.localFrameIntervals.reduce((acc, val) => acc + Math.pow(val - avg, 2), 0);
        this.localDisplayFrameIntervalVarianceMs = Number((sumSquareDiffs / this.localFrameIntervals.length).toFixed(2));
      }

      this.localLastPresentationTime = now;
      this.localFrameTimestamps.push(now);
      const oneSecondAgo = now - 1000;
      while (this.localFrameTimestamps.length > 0 && this.localFrameTimestamps[0] < oneSecondAgo) {
        this.localFrameTimestamps.shift();
      }
      this.localDisplayPresentedFps = this.localFrameTimestamps.length;

      this.localRvfcHandle = (el as any).requestVideoFrameCallback(onLocalFrame);
    };

    this.localRvfcHandle = (el as any).requestVideoFrameCallback(onLocalFrame);
  }

  private stopLocalDisplayPacingMonitor(): void {
    if (this.localRvfcHandle !== null && this.localRvfcTargetElement && typeof (this.localRvfcTargetElement as any).cancelVideoFrameCallback === 'function') {
      try {
        (this.localRvfcTargetElement as any).cancelVideoFrameCallback(this.localRvfcHandle);
      } catch {}
    }
    this.localRvfcHandle = null;
    this.localRvfcTargetElement = null;
  }

  /**
   * Bind local video preview HTML element (supports multiple elements e.g. full view + mini PiP)
   */
  bindLocalVideoElement(el: HTMLVideoElement | null): void {
    if (!el) return;
    this.localVideoElements.add(el);
    this.localVideoElement = el;
    el.autoplay = true;
    (el as any).playsInline = true;
    el.muted = true; // Local preview must always be muted to prevent acoustic feedback
    if (this.isScreenSharing && this.screenStream) {
      if (el.srcObject !== this.screenStream) {
        el.srcObject = this.screenStream;
      }
      el.play().catch(() => {});
    } else if (this.localStream && this.localStream.getVideoTracks().length > 0) {
      if (el.srcObject !== this.localStream) {
        el.srcObject = this.localStream;
      }
      el.play().catch(() => {});
      this.startLocalDisplayPacingMonitor(el);
    }
  }

  /**
   * Unbind local video preview element
   */
  unbindLocalVideoElement(el: HTMLVideoElement | null): void {
    if (!el) return;
    if (this.localRvfcTargetElement === el) {
      this.stopLocalDisplayPacingMonitor();
    }
    this.localVideoElements.delete(el);
    if (this.localVideoElement === el) {
      this.localVideoElement = this.localVideoElements.values().next().value || null;
      if (this.localVideoElement) {
        this.startLocalDisplayPacingMonitor(this.localVideoElement);
      }
    }
  }

  /**
   * Bind dedicated screen share preview HTML element (used by hero presentation frame)
   */
  bindScreenVideoElement(el: HTMLVideoElement | null): void {
    if (!el) return;
    this.screenVideoElements.add(el);
    el.autoplay = true;
    (el as any).playsInline = true;
    el.muted = true;
    if (this.screenStream) {
      if (el.srcObject !== this.screenStream) {
        el.srcObject = this.screenStream;
      }
      el.play().catch(() => {});
    }
  }

  /**
   * Unbind dedicated screen share preview HTML element
   */
  unbindScreenVideoElement(el: HTMLVideoElement | null): void {
    if (!el) return;
    this.screenVideoElements.delete(el);
    if (el.srcObject) {
      try {
        el.srcObject = null;
      } catch {}
    }
  }

  /**
   * Get active local screen share stream if sharing.
   */
  getScreenStream(): MediaStream | null {
    return this.screenStream;
  }

  /**
   * Start requestVideoFrameCallback display pacing monitor on remote video element (Guardrail #4).
   * Measures real frame presentation timing, actual presented FPS, interval variance, and freezes.
   */
  private startDisplayPacingMonitor(el: HTMLVideoElement): void {
    this.stopDisplayPacingMonitor();
    if (!el || typeof (el as any).requestVideoFrameCallback !== 'function') {
      console.log('[WIBBY WEBRTC PACING] requestVideoFrameCallback not supported by browser; display pacing fallback enabled');
      return;
    }

    this.rvfcTargetElement = el;
    this.frameTimestamps = [];
    this.frameIntervals = [];
    this.lastPresentationTime = 0;
    this.totalPresentedFrames = 0;

    const onFrame = (now: DOMHighResTimeStamp, _metadata: any) => {
      if (this.rvfcTargetElement !== el) return;

      this.totalPresentedFrames++;
      if (this.lastPresentationTime > 0) {
        const interval = now - this.lastPresentationTime;
        this.frameIntervals.push(interval);
        if (this.frameIntervals.length > 30) {
          this.frameIntervals.shift();
        }

        // Freeze detection: frame gap > 250ms indicates a visible freeze
        if (interval > 250) {
          this.displayFreezeCount++;
          if (interval > this.displayMaxFreezeDurationMs) {
            this.displayMaxFreezeDurationMs = Number(interval.toFixed(1));
          }
        }
        if (interval > this.displayMaxFrameGapMs) {
          this.displayMaxFrameGapMs = Number(interval.toFixed(1));
        }

        // Calculate rolling average interval and variance over last 30 frames
        const sum = this.frameIntervals.reduce((a, b) => a + b, 0);
        const avg = sum / this.frameIntervals.length;
        this.displayAvgFrameIntervalMs = Number(avg.toFixed(1));

        const sumSquareDiffs = this.frameIntervals.reduce((acc, val) => acc + Math.pow(val - avg, 2), 0);
        this.displayFrameIntervalVarianceMs = Number((sumSquareDiffs / this.frameIntervals.length).toFixed(2));
      }

      this.lastPresentationTime = now;
      this.frameTimestamps.push(now);
      // Keep only timestamps within the last 1000ms to calculate instant presented FPS
      const oneSecondAgo = now - 1000;
      while (this.frameTimestamps.length > 0 && this.frameTimestamps[0] < oneSecondAgo) {
        this.frameTimestamps.shift();
      }
      this.displayPresentedFps = this.frameTimestamps.length;

      // Schedule next callback
      this.rvfcHandle = (el as any).requestVideoFrameCallback(onFrame);
    };

    this.rvfcHandle = (el as any).requestVideoFrameCallback(onFrame);
  }

  private stopDisplayPacingMonitor(): void {
    if (this.rvfcHandle !== null && this.rvfcTargetElement && typeof (this.rvfcTargetElement as any).cancelVideoFrameCallback === 'function') {
      try {
        (this.rvfcTargetElement as any).cancelVideoFrameCallback(this.rvfcHandle);
      } catch {}
    }
    this.rvfcHandle = null;
    this.rvfcTargetElement = null;
  }

  /**
   * Bind remote video HTML element (supports multiple elements e.g. full view + floating mini video)
   */
  bindRemoteVideoElement(el: HTMLVideoElement | null): void {
    if (!el) return;
    this.remoteVideoElements.add(el);
    this.remoteVideoElement = el;
    el.autoplay = true;
    (el as any).playsInline = true;
    // HARD RULE: Always muted to guarantee single audio output path!
    el.muted = true;
    if (this.remoteVideoStream) {
      if (el.srcObject !== this.remoteVideoStream) {
        el.srcObject = this.remoteVideoStream;
      }
      el.play().catch(() => {});
      this.startDisplayPacingMonitor(el);
    }
  }

  unbindRemoteVideoElement(el: HTMLVideoElement | null): void {
    if (!el) return;
    if (this.rvfcTargetElement === el) {
      this.stopDisplayPacingMonitor();
    }
    this.remoteVideoElements.delete(el);
    if (this.remoteVideoElement === el) {
      this.remoteVideoElement = this.remoteVideoElements.values().next().value || null;
      if (this.remoteVideoElement) {
        this.startDisplayPacingMonitor(this.remoteVideoElement);
      }
    }
  }

  /**
   * Imperatively trigger playback on all bound video elements.
   * Required to fix black/frozen video in Safari when removing 'display: none' (hidden class).
   */
  triggerVideoPlayback(): void {
    console.log('[WIBBY WEBRTC] Triggering imperative video playback to clear black frames');
    this.localVideoElements.forEach(el => {
      try {
        if (el.paused) el.play().catch(() => {});
      } catch (e) {}
    });
    this.remoteVideoElements.forEach(el => {
      try {
        if (el.paused) el.play().catch(err => console.warn('[WIBBY WEBRTC] Force play error:', err));
      } catch (e) {}
    });
  }

  /**
   * Toggle local camera track (mute/unmute video without renegotiation)
   */
  setCameraEnabled(enabled: boolean): boolean {
    if (!this.localStream) return false;
    const videoTracks = this.localStream.getVideoTracks();
    if (videoTracks.length === 0) return false;

    videoTracks.forEach(track => {
      track.enabled = enabled;
      console.log(`[WIBBY WEBRTC] Local video track ${track.label} enabled=${track.enabled}`);
    });
    this.isCameraOff = !enabled;
    return enabled;
  }

  getIsCameraOff(): boolean {
    return this.isCameraOff;
  }

  getIsCameraUnavailable(): boolean {
    return this.isCameraUnavailable;
  }

  getSessionId(): string | null {
    return this.sessionId;
  }

  /**
   * Enumerate available video input cameras
   */
  async getAvailableCameras(): Promise<MediaDeviceInfo[]> {
    if (!navigator.mediaDevices?.enumerateDevices) return [];
    try {
      const devices = await navigator.mediaDevices.enumerateDevices();
      return devices.filter(d => d.kind === 'videoinput');
    } catch (e) {
      console.warn('[WIBBY WEBRTC] Failed to enumerate video cameras:', e);
      return [];
    }
  }

  private currentFacingMode: 'user' | 'environment' = 'user';
  private onFacingModeChangeCallback: ((facingMode: 'user' | 'environment') => void) | null = null;

  /** Register listener for camera facingMode changes (user <-> environment) */
  setOnFacingModeChangeCallback(cb: ((facingMode: 'user' | 'environment') => void) | null): void {
    this.onFacingModeChangeCallback = cb;
  }

  /**
   * Switch active camera device in-place via RTCRtpSender.replaceTrack()
   * Supports:
   * - Mobile front/rear toggle (facingMode: 'user' <-> 'environment')
   * - Unlocks camera hardware lock on Android/iOS by stopping previous track first
   * - Desktop multi-camera selection (external webcams, capture cards)
   * - Graceful fallbacks preventing OverconstrainedError
   */
  async switchCamera(deviceId?: string): Promise<boolean> {
    if (!this.localStream) return false;

    const previousFacing = this.currentFacingMode;
    const nextFacing: 'user' | 'environment' = this.currentFacingMode === 'user' ? 'environment' : 'user';
    console.log(`[WIBBY WEBRTC] Switching camera. deviceId: ${deviceId || 'none (mobile toggle)'}, target facing: ${nextFacing}`);

    // CRITICAL: Stop previous video tracks FIRST so mobile OS (Android/iOS) releases exclusive camera sensor lock
    const oldVideoTracks = this.localStream.getVideoTracks();
    oldVideoTracks.forEach(t => {
      try {
        t.stop();
        this.localStream?.removeTrack(t);
      } catch {}
    });

    let newStream: MediaStream | null = null;
    let targetFacing: 'user' | 'environment' = nextFacing;

    try {
      // 1. If explicit deviceId requested (desktop / external camera)
      if (deviceId && deviceId !== 'toggle-facing') {
        try {
          newStream = await navigator.mediaDevices.getUserMedia({
            video: { deviceId: { exact: deviceId }, width: { ideal: 1920 }, height: { ideal: 1080 }, frameRate: { ideal: 30 } }
          });
        } catch {
          try {
            newStream = await navigator.mediaDevices.getUserMedia({
              video: { deviceId: { ideal: deviceId }, width: { ideal: 1920 }, height: { ideal: 1080 } }
            });
          } catch {
            newStream = await navigator.mediaDevices.getUserMedia({
              video: { deviceId: { ideal: deviceId } }
            });
          }
        }
      }

      // 2. If mobile toggle or no specific deviceId
      if (!newStream) {
        // Attempt exact facingMode with high definition resolutions first (canonical W3C standard for mobile)
        const attempts: MediaTrackConstraints[] = [
          // Attempt 1: Exact facingMode with landscape 1080p target
          { facingMode: { exact: nextFacing }, width: { ideal: 1920, min: 1280 }, height: { ideal: 1080, min: 720 }, frameRate: { ideal: 30, min: 24 } },
          // Attempt 2: Exact facingMode with portrait 1080p target (Mobile smartphone held vertically)
          { facingMode: { exact: nextFacing }, width: { ideal: 1080, min: 720 }, height: { ideal: 1920, min: 1280 }, frameRate: { ideal: 30, min: 24 } },
          // Attempt 3: Exact facingMode with 720p HD target
          { facingMode: { exact: nextFacing }, width: { ideal: 1280 }, height: { ideal: 720 }, frameRate: { ideal: 30 } },
          // Attempt 4: Exact facingMode standard (unconstrained resolution)
          { facingMode: { exact: nextFacing } }
        ];

        for (const constraint of attempts) {
          try {
            newStream = await navigator.mediaDevices.getUserMedia({ video: constraint });
            if (newStream) break;
          } catch {
            // Try next constraint
          }
        }

        // Attempt 5: If exact facingMode failed (e.g. laptop webcam without facingMode or specific device label)
        if (!newStream) {
          try {
            if (navigator.mediaDevices?.enumerateDevices) {
              const allDevices = await navigator.mediaDevices.enumerateDevices();
              const videoDevs = allDevices.filter(d => d.kind === 'videoinput');
              if (videoDevs.length > 1) {
                const matchKeywords = nextFacing === 'environment'
                  ? ['back', 'rear', 'environment', 'camera2 0', 'camera 0', 'outer', 'main']
                  : ['front', 'user', 'facing front', 'camera2 1', 'camera 1', 'inner', 'selfie'];

                const matched = videoDevs.find(d => {
                  const label = (d.label || '').toLowerCase();
                  return matchKeywords.some(kw => label.includes(kw));
                });

                if (matched && matched.deviceId) {
                  try {
                    newStream = await navigator.mediaDevices.getUserMedia({
                      video: { deviceId: { exact: matched.deviceId }, width: { ideal: 1920 }, height: { ideal: 1080 } }
                    });
                  } catch {
                    newStream = await navigator.mediaDevices.getUserMedia({
                      video: { deviceId: { exact: matched.deviceId } }
                    });
                  }
                }
              }
            }
          } catch (enumErr) {
            console.warn('[WIBBY WEBRTC] Camera enumeration fallback error:', enumErr);
          }
        }

        // Attempt 6 & 7: Fallback to ideal facingMode
        if (!newStream) {
          try {
            newStream = await navigator.mediaDevices.getUserMedia({
              video: { facingMode: { ideal: nextFacing }, width: { ideal: 1920 }, height: { ideal: 1080 } }
            });
          } catch {
            newStream = await navigator.mediaDevices.getUserMedia({
              video: { facingMode: { ideal: nextFacing } }
            });
          }
        }
      }

      const newVideoTrack = newStream?.getVideoTracks()[0];
      if (!newVideoTrack) {
        throw new Error('No video track available in newly acquired camera stream');
      }

      // Inspect actual track settings to determine true hardware facingMode
      const trackSettings = newVideoTrack.getSettings ? newVideoTrack.getSettings() : {};
      const detectedFacing = trackSettings.facingMode as 'user' | 'environment' | undefined;
      if (detectedFacing) {
        targetFacing = detectedFacing;
      }
      this.currentFacingMode = targetFacing;
      this.currentCaptureWidth = trackSettings.width || 0;
      this.currentCaptureHeight = trackSettings.height || 0;
      this.currentCaptureFps = Math.round(trackSettings.frameRate || 0);

      if ('contentHint' in newVideoTrack) {
        newVideoTrack.contentHint = 'motion';
      }

      console.log(`[WIBBY WEBRTC] Camera switch succeeded. Active facingMode: ${this.currentFacingMode}, capture: ${this.currentCaptureWidth}x${this.currentCaptureHeight}`);

      // Add new track to local stream
      this.localStream.addTrack(newVideoTrack);

      // Replace track on RTCPeerConnection sender
      if (this.peerConnection) {
        const transceivers = this.peerConnection.getTransceivers();
        const videoTransceiver = transceivers.find(
          t => t.sender?.track?.kind === 'video' || t.receiver?.track?.kind === 'video' || (t as any).kind === 'video'
        );
        const videoSender = videoTransceiver?.sender || this.peerConnection.getSenders().find(s => s.track?.kind === 'video' || (s as any).kind === 'video');
        if (videoSender) {
          await videoSender.replaceTrack(newVideoTrack);
          console.log('[WIBBY WEBRTC] RTCRtpSender.replaceTrack succeeded with new camera track');
        }
        // Re-apply 1080p sender parameters to preserve crisp resolution
        await this.applyVideoSenderParameters();
      }

      // Re-bind to all local video preview elements — force reload by clearing srcObject first
      this.localVideoElements.forEach(el => {
        try {
          el.muted = true;
          el.autoplay = true;
          (el as any).playsInline = true;
          el.srcObject = null;
          el.srcObject = this.localStream;
          el.play().catch(() => {});
        } catch {}
      });

      // Notify callback
      if (this.onFacingModeChangeCallback) {
        this.onFacingModeChangeCallback(this.currentFacingMode);
      }

      return true;
    } catch (err) {
      console.error('[WIBBY WEBRTC] Failed to switch camera device, attempting recovery:', err);
      // Recovery: re-acquire previous camera stream so user is never left without video
      try {
        const recoveryStream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: { ideal: previousFacing }, width: { ideal: 1920 }, height: { ideal: 1080 } }
        });
        const recoveryTrack = recoveryStream.getVideoTracks()[0];
        if (recoveryTrack && this.localStream) {
          this.localStream.addTrack(recoveryTrack);
          this.currentFacingMode = previousFacing;
          if (this.peerConnection) {
            const sender = this.peerConnection.getSenders().find(s => s.track?.kind === 'video');
            if (sender) await sender.replaceTrack(recoveryTrack);
          }
          this.localVideoElements.forEach(el => {
            el.srcObject = null;
            el.srcObject = this.localStream;
            el.play().catch(() => {});
          });
          if (this.onFacingModeChangeCallback) {
            this.onFacingModeChangeCallback(this.currentFacingMode);
          }
        }
      } catch (recoveryErr) {
        console.error('[WIBBY WEBRTC] Camera recovery failed:', recoveryErr);
      }
      return false;
    }
  }

  /** Returns the current facing mode of the active camera */
  getFacingMode(): 'user' | 'environment' {
    return this.currentFacingMode;
  }

  /** Returns the active remote display audio track from screen share if any */
  getRemoteDisplayAudioTrack(): MediaStreamTrack | null {
    return this.remoteDisplayAudioTrack;
  }

  /**
   * Toggle front/rear camera using facingMode constraint.
   * Works on any device — on mobile it physically switches cameras,
   * on desktop it gracefully falls back to whatever camera is available.
   */
  async flipCamera(): Promise<boolean> {
    return this.switchCamera(undefined); // undefined triggers facingMode toggle path
  }

  /**
   * Capture instant photo/snapshot from active call video
   */
  async captureSnapshot(): Promise<Blob | null> {
    const videoEl = this.remoteVideoElement || this.localVideoElement;
    if (!videoEl || videoEl.videoWidth === 0 || videoEl.videoHeight === 0) {
      return null;
    }

    try {
      const canvas = document.createElement('canvas');
      canvas.width = videoEl.videoWidth;
      canvas.height = videoEl.videoHeight;
      const ctx = canvas.getContext('2d');
      if (!ctx) return null;

      ctx.drawImage(videoEl, 0, 0, canvas.width, canvas.height);
      return new Promise<Blob | null>(resolve => {
        canvas.toBlob(blob => resolve(blob), 'image/jpeg', 0.92);
      });
    } catch (err) {
      console.error('[WIBBY WEBRTC] Snapshot capture failed:', err);
      return null;
    }
  }

  /**
   * Pre-warm and unlock dedicated remote audio element and Web Audio AudioContext during user gesture
   */
  unlockRemoteAudio(): void {
    try {
      if (!this.remoteAudioElement) {
        const audio = document.createElement('audio');
        audio.autoplay = true;
        (audio as any).playsInline = true;
        audio.style.display = 'none';
        document.body.appendChild(audio);
        this.remoteAudioElement = audio;

        audio.addEventListener('playing', () => {
          console.log('[WIBBY WEBRTC AUDIO] Remote audio element playing successfully');
          if (this.onRemoteAudioActiveCallback) {
            this.onRemoteAudioActiveCallback();
          }
        });
        audio.addEventListener('waiting', () => {
          console.warn('[WIBBY WEBRTC AUDIO] Remote audio element waiting for data (buffering)...');
        });
        audio.addEventListener('stalled', () => {
          console.warn('[WIBBY WEBRTC AUDIO] Remote audio element playback stalled');
        });
        audio.addEventListener('error', (e) => {
          console.error('[WIBBY WEBRTC AUDIO] Remote audio element error:', e);
        });
      }

      if (!this.remoteDisplayAudioElement) {
        const displayAudio = document.createElement('audio');
        displayAudio.autoplay = true;
        (displayAudio as any).playsInline = true;
        displayAudio.style.display = 'none';
        document.body.appendChild(displayAudio);
        this.remoteDisplayAudioElement = displayAudio;
      }

      // Warm up audio element during user interaction
      if (this.remoteAudioElement.paused && !this.remoteAudioElement.srcObject) {
        this.remoteAudioElement.play().catch(() => {});
      }

      // Pre-warm Web Audio AudioContext during user gesture
      try {
        if (!this.audioCtx || this.audioCtx.state === 'closed') {
          const AudioCtxClass = window.AudioContext || (window as any).webkitAudioContext;
          if (AudioCtxClass) {
            this.audioCtx = new AudioCtxClass();
          }
        }
        if (this.audioCtx && this.audioCtx.state === 'suspended') {
          this.audioCtx.resume().catch(() => {});
        }
      } catch (ctxErr) {
        console.warn('[WIBBY VOICE ENGINE] Pre-warming AudioContext error:', ctxErr);
      }
    } catch (err) {
      console.warn('[WIBBY WEBRTC] Error warming up remote audio resources:', err);
    }
  }

  /**
   * Initialize RTCPeerConnection instance with centralized RTC_CONFIG
   */
  initPeerConnection(
    callId: string,
    localStream: MediaStream | null,
    onIceCandidate: (candidate: RTCIceCandidateInit) => void,
    onConnectionStateChange: (state: RTCPeerConnectionState) => void,
    onIceConnectionStateChange: (state: RTCIceConnectionState) => void,
    onRemoteAudioActive?: () => void,
    onIceRestartNeeded?: (offer: RTCSessionDescriptionInit) => void,
    onQualityChange?: (quality: CallAudioQuality, metrics: CallQualityMetrics) => void,
    initialVoiceExperience?: VoiceExperienceMode,
    onSpeakingChange?: (speaking: boolean) => void,
    callType: 'voice' | 'video' = 'voice',
    sessionId?: string,
    onRemoteVideoActive?: () => void,
    onRemoteVideoTrack?: (stream: MediaStream) => void
  ): RTCPeerConnection {
    this.cleanupPeerConnection();

    this.currentCallId = callId;
    this.callType = callType;
    this.sessionId = sessionId || null;
    this.sessionGeneration++;
    const currentGen = this.sessionGeneration;
    this.pcId = `pc_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
    this.addTrackInvocationCount = 0;
    this.isRestartingIce = false;

    this.onIceCandidateCallback = onIceCandidate;
    this.onConnectionStateChangeCallback = onConnectionStateChange;
    this.onIceConnectionStateChangeCallback = onIceConnectionStateChange;
    this.onRemoteAudioActiveCallback = onRemoteAudioActive || null;
    this.onRemoteVideoActiveCallback = onRemoteVideoActive || null;
    this.onRemoteVideoTrackCallback = onRemoteVideoTrack || null;
    this.onIceRestartNeededCallback = onIceRestartNeeded || null;
    this.onQualityChangeCallback = onQualityChange || null;
    this.onSpeakingChangeCallback = onSpeakingChange || null;
    this.currentAudioQuality = 'excellent';
    if (initialVoiceExperience) {
      this.voiceExperience = initialVoiceExperience;
    }
    this.pendingIceCandidates = [];
    this.remoteDescriptionSet = false;

    console.log(`[WIBBY WEBRTC] Creating RTCPeerConnection [id=${this.pcId}, callId=${callId}, callType=${callType}, gen=${currentGen}]`);
    const pc = new RTCPeerConnection(RTC_CONFIG);
    this.peerConnection = pc;

    // ICE Candidate Generation
    pc.onicecandidate = (event) => {
      if (this.sessionGeneration !== currentGen) return;
      if (event.candidate && this.onIceCandidateCallback) {
        this.onIceCandidateCallback(event.candidate.toJSON());
      }
    };

    // Connection State Changes
    pc.onconnectionstatechange = () => {
      if (this.sessionGeneration !== currentGen) return;
      console.log(`[WIBBY WEBRTC][${this.pcId}] Connection state changed:`, pc.connectionState);

      if (pc.connectionState === 'connected') {
        this.startStatsMonitoring();
        this.logPipelineDiagnostics('connectionstate:connected');
      } else if (pc.connectionState === 'failed' || pc.connectionState === 'closed') {
        this.stopStatsMonitoring();
      }

      if (this.onConnectionStateChangeCallback) {
        this.onConnectionStateChangeCallback(pc.connectionState);
      }
    };

    // ICE Connection State Changes with RFC graceful recovery
    pc.oniceconnectionstatechange = () => {
      if (this.sessionGeneration !== currentGen) return;
      console.log(`[WIBBY WEBRTC][${this.pcId}] ICE connection state changed:`, pc.iceConnectionState);

      if (pc.iceConnectionState === 'connected' || pc.iceConnectionState === 'completed') {
        if (this.iceDisconnectTimeout) {
          clearTimeout(this.iceDisconnectTimeout);
          this.iceDisconnectTimeout = null;
          console.log(`[WIBBY WEBRTC][${this.pcId}] ICE connection recovered before timeout`);
        }
      } else if (pc.iceConnectionState === 'disconnected') {
        console.warn(`[WIBBY WEBRTC][${this.pcId}] ICE temporarily disconnected; starting 10s recovery window`);
        if (!this.iceDisconnectTimeout) {
          this.iceDisconnectTimeout = setTimeout(() => {
            if (this.sessionGeneration !== currentGen) return;
            if (pc.iceConnectionState === 'disconnected') {
              console.error(`[WIBBY WEBRTC][${this.pcId}] ICE recovery window expired without reconnecting`);
              this.attemptIceRestart();
            }
          }, 10000);
        }
      } else if (pc.iceConnectionState === 'failed') {
        if (this.iceDisconnectTimeout) {
          clearTimeout(this.iceDisconnectTimeout);
          this.iceDisconnectTimeout = null;
        }
        this.attemptIceRestart();
      }

      if (this.onIceConnectionStateChangeCallback) {
        this.onIceConnectionStateChangeCallback(pc.iceConnectionState);
      }
    };

    // Handle incoming remote audio and video tracks
    pc.ontrack = (event) => {
      if (this.sessionGeneration !== currentGen) return;
      console.log(`[WIBBY WEBRTC][${this.pcId}] ontrack event received:`, {
        kind: event.track.kind,
        id: event.track.id,
        readyState: event.track.readyState,
        enabled: event.track.enabled,
        muted: event.track.muted,
        streamCount: event.streams.length
      });

      if (event.track.kind === 'audio') {
        // If an active primary remote audio track is already playing in remoteAudioElement,
        // this incoming track is a secondary audio stream (display audio from screen share!)
        if (this.remoteAudioTrack && this.remoteAudioTrack.id !== event.track.id && this.remoteAudioTrack.readyState === 'live') {
          console.log('[WIBBY WEBRTC] Secondary display audio track from screen share received:', event.track.id);
          this.remoteDisplayAudioTrack = event.track;
          const displayAudioStream = new MediaStream([event.track]);
          this.attachRemoteDisplayAudio(displayAudioStream);
          event.track.onended = () => {
            console.log('[WIBBY WEBRTC] Display audio track ended');
            this.remoteDisplayAudioTrack = null;
            if (this.remoteDisplayAudioElement) {
              this.remoteDisplayAudioElement.srcObject = null;
            }
          };
        } else {
          this.remoteAudioTrack = event.track;
          const audioOnlyStream = new MediaStream([event.track]);
          this.remoteStream = audioOnlyStream;
          this.attachRemoteAudio(audioOnlyStream);
        }
      } else if (event.track.kind === 'video') {
        // HARD RULE: Always create a video-ONLY stream for the video elements.
        // This guarantees the video element NEVER has an audio track that could
        // bypass the single-output-path rule, even if muted is somehow cleared.
        const videoOnlyStream = new MediaStream([event.track]);
        this.remoteVideoStream = videoOnlyStream;

        // When the first RTP packet arrives and track un-mutes, ensure play() is triggered (Req 25, 26)
        event.track.onunmute = () => {
          console.log('[WIBBY WEBRTC] Remote video track unmuted — triggering playback on all remote video elements');
          this.remoteVideoElements.forEach(el => {
            el.muted = true;
            el.autoplay = true;
            (el as any).playsInline = true;
            if (el.srcObject !== videoOnlyStream) {
              el.srcObject = videoOnlyStream;
            }
            el.play().catch(err => console.warn('[WIBBY WEBRTC] Remote video play on unmute error:', err));
          });
        };

        this.remoteVideoElements.forEach(el => {
          // Imperatively enforce muting before setting srcObject
          el.muted = true;
          el.autoplay = true;
          (el as any).playsInline = true;
          if (el.srcObject !== videoOnlyStream) el.srcObject = videoOnlyStream;
          el.play().catch(err => console.warn('[WIBBY WEBRTC] Remote video play on attach error:', err));
          this.startDisplayPacingMonitor(el);
        });
        if (this.onRemoteVideoActiveCallback) {
          this.onRemoteVideoActiveCallback();
        }
        if (this.onRemoteVideoTrackCallback) {
          this.onRemoteVideoTrackCallback(videoOnlyStream);
        }
      }
    };

    // Add local tracks if stream was provided or already acquired
    const streamToAttach = localStream || this.localStream;
    if (streamToAttach) {
      this.localStream = streamToAttach;
      this.attachLocalTracksToPC(pc, streamToAttach, callId);
    }

    return pc;
  }

  /**
   * Attempt non-competing ICE restart
   */
  private async attemptIceRestart() {
    if (this.isRestartingIce || !this.peerConnection) return;
    this.isRestartingIce = true;
    console.log(`[WIBBY WEBRTC][${this.pcId}] Initiating ICE restart negotiation...`);

    try {
      const offer = await this.createOffer({ iceRestart: true });
      if (this.onIceRestartNeededCallback) {
        this.onIceRestartNeededCallback(offer);
      }
    } catch (err) {
      console.error(`[WIBBY WEBRTC][${this.pcId}] ICE restart offer generation failed:`, err);
    } finally {
      this.isRestartingIce = false;
    }
  }

  /**
   * Attach local tracks (audio + video) to RTCPeerConnection with duplicate prevention and forensic diagnostics.
   * Guardrail #5: Single Video Track Rule — exactly ONE authoritative camera track per call.
   */
  private attachLocalTracksToPC(pc: RTCPeerConnection, stream: MediaStream, callId?: string) {
    const tracksToAttach = [...stream.getAudioTracks(), ...stream.getVideoTracks()];

    console.log(`[WIBBY][WEBRTC] Preparing to attach local tracks: count=${tracksToAttach.length}, streamId=${stream.id}, streamActive=${stream.active}`);

    tracksToAttach.forEach(track => {
      this.addTrackInvocationCount++;
      const invocation = this.addTrackInvocationCount;

      console.log('[WIBBY][WEBRTC] addTrack attempt:', {
        invocation,
        callId: callId || this.currentCallId,
        pcId: this.pcId,
        pcConnectionState: pc.connectionState,
        pcSignalingState: pc.signalingState,
        trackId: track.id,
        trackLabel: track.label,
        trackKind: track.kind,
        trackReadyState: track.readyState,
        trackEnabled: track.enabled,
        trackMuted: track.muted,
        streamId: stream.id,
        streamActive: stream.active
      });

      // 1. Verify track state before addTrack
      if (track.readyState !== 'live') {
        const stateErr = new Error(`Cannot attach ${track.kind} track: track readyState is '${track.readyState}', expected 'live'`);
        stateErr.name = 'InvalidStateError';
        console.error(`[WIBBY][WEBRTC][addTrack] Track is not live:`, {
          invocation,
          trackId: track.id,
          readyState: track.readyState
        });
        throw stateErr;
      }

      // 2. Check for duplicate track attachment via pc.getSenders() (Guardrail #5: Single Video Sender)
      const existingSenders = pc.getSenders();
      const existingSenderForKind = existingSenders.find(sender => sender.track && sender.track.kind === track.kind);
      if (existingSenderForKind) {
        if (existingSenderForKind.track?.id === track.id) {
          console.warn('[WIBBY][WEBRTC] addTrack skipped: track already attached to RTCPeerConnection senders:', {
            invocation,
            trackId: track.id,
            pcId: this.pcId
          });
          return;
        }
        // If a sender of this kind already exists with a different track, replace it in-place
        console.log(`[WIBBY][WEBRTC] Reusing existing ${track.kind} sender via replaceTrack with track ${track.id}`);
        existingSenderForKind.replaceTrack(track).catch(err => {
          console.warn(`[WIBBY][WEBRTC] replaceTrack failed for ${track.kind}:`, err);
        });
        return;
      }

      // 3. Perform addTrack with forensic error capture
      try {
        pc.addTrack(track, stream);
        console.log('[WIBBY][WEBRTC] addTrack success:', {
          invocation,
          callId: callId || this.currentCallId,
          pcId: this.pcId,
          trackId: track.id,
          trackKind: track.kind,
          streamId: stream.id
        });
      } catch (error: any) {
        console.error('[WIBBY][WEBRTC][addTrack]', {
          name: error?.name,
          message: error?.message,
          stack: error?.stack,
          invocation,
          callId: callId || this.currentCallId,
          pcId: this.pcId,
          trackReadyState: track?.readyState,
          trackKind: track?.kind,
          trackEnabled: track?.enabled,
          streamId: stream?.id,
          streamActive: stream?.active,
          pcConnectionState: pc?.connectionState,
          pcSignalingState: pc?.signalingState,
        });
        throw error;
      }
    });
  }

  /**
   * Add local media stream to active RTCPeerConnection (idempotent)
   */
  addLocalStream(stream: MediaStream, callId?: string) {
    this.localStream = stream;
    if (this.peerConnection) {
      this.attachLocalTracksToPC(this.peerConnection, stream, callId || this.currentCallId || undefined);
    }
  }

  /**
   * Apply video codec preference to transceivers where supported (Guardrail #3).
   * Allows real-world A/B comparison between H.264 (hardware-accelerated on macOS) and VP8.
   */
  private applyTransceiverCodecPreferences(): void {
    if (!this.peerConnection || this.callType !== 'video') return;
    try {
      const transceivers = this.peerConnection.getTransceivers();
      const videoTransceiver = transceivers.find(
        t => t.receiver?.track?.kind === 'video' || t.sender?.track?.kind === 'video'
      );
      if (!videoTransceiver || typeof videoTransceiver.setCodecPreferences !== 'function') return;

      const capabilities = (RTCRtpReceiver as any).getCapabilities?.('video');
      if (!capabilities?.codecs) return;

      const codecs = [...capabilities.codecs];
      if (this.videoCodecPreference === 'h264' || this.videoCodecPreference === 'auto') {
        codecs.sort((a, b) => {
          const getScore = (c: any) => {
            const mime = (c.mimeType || '').toLowerCase();
            const fmtp = (c.sdpFmtpLine || '').toLowerCase();
            if (mime.includes('h264')) {
              // Dedicated hardware encoder on iOS, Android, macOS & Windows (near-zero CPU, buttery 30fps)
              if (fmtp.includes('profile-level-id=42e0') || fmtp.includes('profile-level-id=640c')) return 100;
              return 90;
            }
            if (mime.includes('vp8')) return 75; // Fast, lightweight software fallback
            if (mime.includes('vp9')) return 50; // Heavy software encoder, avoided on mobile devices
            if (mime.includes('av1')) return 30;
            return 10;
          };
          return getScore(b) - getScore(a);
        });
        videoTransceiver.setCodecPreferences(codecs);
        console.log('[WIBBY WEBRTC] Prioritized hardware-accelerated H.264/VP8 video codecs for buttery-smooth 30fps playback');
      } else if (this.videoCodecPreference === 'vp8') {
        codecs.sort((a, b) => {
          const aVP8 = a.mimeType?.toLowerCase().includes('vp8') ? 1 : 0;
          const bVP8 = b.mimeType?.toLowerCase().includes('vp8') ? 1 : 0;
          return bVP8 - aVP8;
        });
        videoTransceiver.setCodecPreferences(codecs);
        console.log('[WIBBY WEBRTC] Prioritized VP8 video codec on transceiver');
      }
    } catch (err) {
      console.warn('[WIBBY WEBRTC] Failed to set codec preferences on transceiver:', err);
    }
  }

  /**
   * Create SDP Offer with Opus FEC optimization & adaptive video capability
   */
  async createOffer(options?: RTCOfferOptions): Promise<RTCSessionDescriptionInit> {
    if (!this.peerConnection) {
      throw new Error('RTCPeerConnection not initialized');
    }

    this.applyTransceiverCodecPreferences();

    console.log('[WIBBY WEBRTC] Creating SDP Offer with options:', options, 'callType:', this.callType);
    const offer = await this.peerConnection.createOffer({
      offerToReceiveAudio: true,
      offerToReceiveVideo: this.callType === 'video',
      ...options
    });

    // Negotiated SDP with Opus FEC and controlled video bandwidth pacing (Guardrail #2)
    const formattedSdp = formatNegotiatedSdp(
      offer.sdp || '',
      this.callType,
      this.enableSdpBandwidthPacing,
      this.videoCodecPreference
    );
    const finalOffer: RTCSessionDescriptionInit = {
      type: offer.type,
      sdp: formattedSdp
    };

    await this.peerConnection.setLocalDescription(finalOffer);
    console.log('[WIBBY WEBRTC] Set local description with negotiated Offer');
    if (this.callType === 'video') {
      await this.applyVideoSenderParameters();
    }
    return finalOffer;
  }

  /**
   * Create SDP Answer with Opus FEC optimization & adaptive video capability
   */
  async createAnswer(): Promise<RTCSessionDescriptionInit> {
    if (!this.peerConnection) {
      throw new Error('RTCPeerConnection not initialized');
    }

    this.applyTransceiverCodecPreferences();

    console.log('[WIBBY WEBRTC] Creating SDP Answer... callType:', this.callType);
    const answer = await this.peerConnection.createAnswer({
      offerToReceiveAudio: true,
      offerToReceiveVideo: this.callType === 'video'
    });

    // Negotiated SDP with Opus FEC and controlled video bandwidth pacing (Guardrail #2)
    const formattedSdp = formatNegotiatedSdp(
      answer.sdp || '',
      this.callType,
      this.enableSdpBandwidthPacing,
      this.videoCodecPreference
    );
    const finalAnswer: RTCSessionDescriptionInit = {
      type: answer.type,
      sdp: formattedSdp
    };

    await this.peerConnection.setLocalDescription(finalAnswer);
    console.log('[WIBBY WEBRTC] Set local description with negotiated Answer');
    if (this.callType === 'video') {
      await this.applyVideoSenderParameters();
    }
    return finalAnswer;
  }

  /**
   * Set Remote Description & flush queued ICE candidates
   */
  async setRemoteDescription(sdp: RTCSessionDescriptionInit): Promise<void> {
    if (!this.peerConnection) {
      throw new Error('RTCPeerConnection not initialized');
    }

    console.log('[WIBBY WEBRTC] Setting remote description type:', sdp.type);
    await this.peerConnection.setRemoteDescription(new RTCSessionDescription(sdp));
    this.remoteDescriptionSet = true;

    // Re-apply video sender parameters after remote description is set (prevents browser reset)
    if (this.callType === 'video') {
      await this.applyVideoSenderParameters();
    }

    // Flush any ICE candidates that arrived before remote description
    if (this.pendingIceCandidates.length > 0) {
      console.log(`[WIBBY WEBRTC] Flushing ${this.pendingIceCandidates.length} queued ICE candidates`);
      for (const candidate of this.pendingIceCandidates) {
        try {
          await this.peerConnection.addIceCandidate(new RTCIceCandidate(candidate));
        } catch (err) {
          console.warn('[WIBBY WEBRTC] Error adding queued ICE candidate:', err);
        }
      }
      this.pendingIceCandidates = [];
    }
  }

  /**
   * Add ICE candidate received from signaling
   */
  async addIceCandidate(candidate: RTCIceCandidateInit): Promise<void> {
    if (!this.peerConnection || !this.remoteDescriptionSet) {
      console.log('[WIBBY WEBRTC] Remote description not set yet. Queuing ICE candidate.');
      this.pendingIceCandidates.push(candidate);
      return;
    }

    try {
      await this.peerConnection.addIceCandidate(new RTCIceCandidate(candidate));
    } catch (err) {
      console.warn('[WIBBY WEBRTC] Error adding ICE candidate:', err);
    }
  }

  /**
   * Set voice experience mode (natural, focused, or spatial presence)
   * Toggles smoothly with a 20ms crossfade without reconnecting, recreating RTCPeerConnection, or reacquiring mic
   */
  setVoiceExperience(mode: VoiceExperienceMode): void {
    this.voiceExperience = mode;
    console.log('[WIBBY VOICE ENGINE] Switching voice experience mode to:', mode);

    if (this.audioCtx && this.naturalGain && this.focusedGain && this.spatialGain) {
      try {
        const now = this.audioCtx.currentTime;
        if (mode === 'natural') {
          this.naturalGain.gain.setTargetAtTime(1.0, now, 0.02);
          this.focusedGain.gain.setTargetAtTime(0.0, now, 0.02);
          this.spatialGain.gain.setTargetAtTime(0.0, now, 0.02);
        } else if (mode === 'focused') {
          this.naturalGain.gain.setTargetAtTime(0.0, now, 0.02);
          this.focusedGain.gain.setTargetAtTime(1.0, now, 0.02);
          this.spatialGain.gain.setTargetAtTime(0.0, now, 0.02);
        } else if (mode === 'spatial') {
          this.naturalGain.gain.setTargetAtTime(0.0, now, 0.02);
          this.focusedGain.gain.setTargetAtTime(0.0, now, 0.02);
          this.spatialGain.gain.setTargetAtTime(1.0, now, 0.02);
        }
      } catch (e) {
        console.warn('[WIBBY VOICE ENGINE] Error crossfading voice experience:', e);
      }
    }
  }

  getVoiceExperience(): VoiceExperienceMode {
    return this.voiceExperience;
  }

  isVoiceEngineActive(): boolean {
    return this.voiceEngineActive;
  }

  /**
   * Set audio pipeline mode (native vs processed)
   * Guardrail #1 & #3: Single output path and Native reference
   */
  setAudioPipelineMode(mode: AudioPipelineMode): void {
    this.audioPipelineMode = mode;
    console.log('[WIBBY AUDIO] Switching audio pipeline mode to:', mode);

    if (mode === 'native') {
      // 1. Unmute the HTMLAudioElement — direct playback is the output.
      if (this.remoteAudioElement) {
        this.remoteAudioElement.muted = false;
        this.remoteAudioElement.volume = 1.0;
      }
      // 2. Tear down the full processing chain (and its AudioContext).
      //    Then restart the minimal analyser-only path for speaking detection.
      this.teardownVoiceEngine();
      if (this.remoteStream) {
        this.startNativeSpeakingDetection(this.remoteStream);
      }
    } else {
      // PROCESSED mode: Mute HTMLAudioElement; all audio comes from Web Audio chain.
      if (this.remoteAudioElement) {
        this.remoteAudioElement.muted = true;
      }
      // If a remote stream is available, build the Voice Engine now.
      if (this.remoteStream) {
        this.setupVoiceEngine(this.remoteStream);
      } else if (this.audioCtx) {
        // Voice Engine already running — reconnect outputs to destination
        // according to current voiceExperience.
        try {
          if (this.voiceExperience === 'natural' && this.naturalGain) {
            this.naturalGain.connect(this.audioCtx.destination);
          } else if (this.voiceExperience === 'focused' && this.focusedGain) {
            this.focusedGain.connect(this.audioCtx.destination);
          } else if (this.voiceExperience === 'spatial') {
            if (this.spatialPanner) {
              this.spatialPanner.connect(this.audioCtx.destination);
            } else if (this.spatialGain) {
              this.spatialGain.connect(this.audioCtx.destination);
            }
          }
        } catch (err) {
          console.warn('[WIBBY AUDIO] Error reconnecting Web Audio output:', err);
        }
      }
    }
  }

  getAudioPipelineMode(): AudioPipelineMode {
    return this.audioPipelineMode;
  }

  /**
   * Set video quality mode (auto, 1080p, 720p, data-saver)
   */
  async setVideoQualityMode(mode: VideoQualityMode): Promise<void> {
    this.videoQualityMode = mode;
    console.log('[WIBBY VIDEO] Switching video quality mode to:', mode);
    await this.applyVideoSenderParameters(mode);
  }

  getVideoQualityMode(): VideoQualityMode {
    return this.videoQualityMode;
  }

  getCurrentCaptureSettings(): { width: number; height: number; fps: number } {
    return {
      width: this.currentCaptureWidth,
      height: this.currentCaptureHeight,
      fps: this.currentCaptureFps
    };
  }

  setOnTelemetryCallback(cb: ((telemetry: RealtimeCallTelemetry) => void) | null): void {
    this.onTelemetryCallback = cb;
  }

  /**
   * Register a callback that fires when screen sharing ends (e.g. via OS Stop Sharing button).
   * Used by CallContext to keep isScreenSharing React state in sync.
   */
  setOnScreenSharingEndedCallback(cb: (() => void) | null): void {
    this.onScreenSharingEndedCallback = cb;
  }

  /** Returns true when screen sharing is currently active. */
  isScreenSharingActive(): boolean {
    return this.isScreenSharing;
  }

  /**
   * Phase 10: Start Screen Sharing.
   *
   * 1. Calls getDisplayMedia({ video: true, audio: true }) — browser decides audio availability.
   * 2. Replaces the existing video sender track with the screen video track (no renegotiation).
   * 3. If the browser returned a display audio track, adds it as a second audio sender alongside
   *    the existing microphone sender and triggers renegotiation via `onNegotiationNeeded`.
   * 4. The microphone sender is NEVER replaced or modified.
   *
   * Returns:
   *   'started'   — screen sharing is active
   *   'cancelled' — user dismissed the browser picker
   *   'error'     — unexpected failure (browser unsupported, permission error, etc.)
   */
  async startScreenSharing(
    onNegotiationNeeded: (offer: RTCSessionDescriptionInit) => void
  ): Promise<'started' | 'cancelled' | 'error'> {
    if (!this.peerConnection || this.callType !== 'video' || this.isScreenSharing) {
      console.warn('[WIBBY SCREEN] startScreenSharing guard failed: pc missing, not a video call, or already sharing');
      return 'error';
    }

    let screenStream: MediaStream;
    try {
      console.log('[WIBBY SCREEN] Requesting display media with high quality video and audio...');
      screenStream = await (navigator.mediaDevices as any).getDisplayMedia({
        video: {
          cursor: 'always',
          displaySurface: 'monitor',
          width: { ideal: 1920, max: 3840 },
          height: { ideal: 1080, max: 2160 },
          frameRate: { ideal: 30, max: 60 }
        },
        audio: {
          echoCancellation: false,
          noiseSuppression: false,
          autoGainControl: false,
          channelCount: 2
        }
      } as any);
    } catch (err: any) {
      const name = err?.name;
      if (name === 'NotAllowedError' || name === 'AbortError' || name === 'InvalidStateError') {
        console.log('[WIBBY SCREEN] User cancelled screen picker or permission denied:', name);
        return 'cancelled';
      }
      try {
        console.log('[WIBBY SCREEN] Retrying getDisplayMedia with fallback constraints...');
        screenStream = await (navigator.mediaDevices as any).getDisplayMedia({
          video: { cursor: 'always' },
          audio: true
        } as any);
      } catch (fallbackErr) {
        console.error('[WIBBY SCREEN] getDisplayMedia fallback failed:', fallbackErr);
        return 'error';
      }
    }

    const screenVideoTrack = screenStream.getVideoTracks()[0];
    if (!screenVideoTrack) {
      console.warn('[WIBBY SCREEN] No video track in display media stream');
      screenStream.getTracks().forEach(t => { try { t.stop(); } catch {} });
      return 'error';
    }

    // Prioritize fine detail, sharp text, and full resolution for screenshare
    if ('contentHint' in screenVideoTrack) {
      (screenVideoTrack as any).contentHint = 'detail';
    }

    const displayAudioTrack = screenStream.getAudioTracks()[0] ?? null;
    console.log('[WIBBY SCREEN] Display media acquired:', {
      videoTrack: screenVideoTrack.label,
      audioTrack: displayAudioTrack?.label ?? 'none (browser did not provide display audio)'
    });

    this.screenStream = screenStream;

    // ── VIDEO: replaceTrack() — no renegotiation ──────────────────────────────
    const videoSender = this.peerConnection.getSenders().find(s => s.track?.kind === 'video');
    if (!videoSender) {
      console.warn('[WIBBY SCREEN] No video sender found on RTCPeerConnection');
      screenStream.getTracks().forEach(t => { try { t.stop(); } catch {} });
      this.screenStream = null;
      return 'error';
    }

    // Park the current camera track so we can restore it later
    this.preSharingVideoTrack = this.localStream?.getVideoTracks()[0] ?? null;

    try {
      await videoSender.replaceTrack(screenVideoTrack);
      console.log('[WIBBY SCREEN] Video sender replaceTrack succeeded with screen track');

      // Maximize bitrate for crisp, uncompressed 1080p screen share (Guardrail: maintain-resolution)
      try {
        const params = videoSender.getParameters();
        if (params && params.encodings && params.encodings[0]) {
          params.encodings[0].maxBitrate = 5_000_000; // 5 Mbps for razor-sharp text
          params.encodings[0].scaleResolutionDownBy = 1.0;
          if ('degradationPreference' in params) {
            (params as any).degradationPreference = 'maintain-resolution';
          }
          await videoSender.setParameters(params);
        }
      } catch (tuneErr) {
        console.warn('[WIBBY SCREEN] Could not tune screen video sender params:', tuneErr);
      }
    } catch (err) {
      console.error('[WIBBY SCREEN] replaceTrack failed for screen video:', err);
      screenStream.getTracks().forEach(t => { try { t.stop(); } catch {} });
      this.screenStream = null;
      this.preSharingVideoTrack = null;
      return 'error';
    }

    // Update local preview elements and dedicated screen video elements to show the screen
    const screenPreviewStream = new MediaStream([screenVideoTrack]);
    this.localVideoElements.forEach(el => {
      el.srcObject = screenPreviewStream;
      el.play().catch(() => {});
    });
    this.screenVideoElements.forEach(el => {
      el.srcObject = screenStream;
      el.play().catch(() => {});
    });

    // ── DISPLAY AUDIO: addTrack() + renegotiation (only if browser provided audio) ──
    if (displayAudioTrack && displayAudioTrack.readyState === 'live') {
      try {
        this.displayAudioSender = this.peerConnection.addTrack(displayAudioTrack, screenStream);
        console.log('[WIBBY SCREEN] Display audio track added to RTCPeerConnection — triggering renegotiation');

        // Immediately create and emit renegotiation offer via existing SDP pipeline.
        // We do NOT rely on onnegotiationneeded event — we drive it ourselves for
        // deterministic, glare-safe behaviour.
        const offer = await this.createOffer();
        onNegotiationNeeded(offer);
        console.log('[WIBBY SCREEN] Renegotiation offer emitted for display audio sender');
      } catch (audioErr) {
        console.warn('[WIBBY SCREEN] Failed to add display audio sender (non-fatal — screen video continues):', audioErr);
        this.displayAudioSender = null;
        // Screen video is already running; we continue without display audio
      }
    } else {
      console.log('[WIBBY SCREEN] No display audio track returned by browser — screen video only, mic continues');
    }

    // ── Track ended listener (OS Stop Sharing / tab close) ───────────────────
    screenVideoTrack.onended = () => {
      console.log('[WIBBY SCREEN] Screen video track ended (OS or browser stop) — stopping screen share');
      this.stopScreenSharing().then(() => {
        if (this.onScreenSharingEndedCallback) {
          this.onScreenSharingEndedCallback();
        }
      });
    };

    this.isScreenSharing = true;
    console.log('[WIBBY SCREEN] Screen sharing started successfully');
    return 'started';
  }

  /**
   * Phase 10: Stop Screen Sharing.
   *
   * 1. Stops all display media tracks.
   * 2. Restores the parked camera track on the video sender (replaceTrack).
   * 3. Removes the display audio sender if one was added, and triggers renegotiation
   *    via the onScreenSharingEndedCallback → CallContext emits call:offer.
   * 4. The microphone sender is NEVER touched.
   *
   * Idempotent — safe to call multiple times.
   */
  async stopScreenSharing(): Promise<void> {
    if (!this.isScreenSharing) return;
    this.isScreenSharing = false;

    console.log('[WIBBY SCREEN] Stopping screen sharing...');

    // ── Stop all screen tracks ────────────────────────────────────────────────
    if (this.screenStream) {
      this.screenStream.getTracks().forEach(t => {
        try { t.stop(); } catch {}
      });
      this.screenStream = null;
    }

    // Clear dedicated screen preview elements
    this.screenVideoElements.forEach(el => {
      try {
        el.srcObject = null;
      } catch {}
    });

    // ── VIDEO: restore camera track ───────────────────────────────────────────
    const videoSender = this.peerConnection?.getSenders().find(s =>
      // The sender may now hold the screen track or a null track — find by video kind
      s.track === null || s.track?.kind === 'video'
    );
    if (videoSender) {
      const cameraTrack =
        (this.preSharingVideoTrack?.readyState === 'live' ? this.preSharingVideoTrack : null) ??
        (this.localStream?.getVideoTracks()[0] ?? null);

      try {
        if (cameraTrack && cameraTrack.readyState === 'live') {
          await videoSender.replaceTrack(cameraTrack);
          console.log('[WIBBY SCREEN] Camera track restored on video sender');
        } else {
          // Camera was off or track ended — blank the sender
          await videoSender.replaceTrack(null);
          console.log('[WIBBY SCREEN] Camera was unavailable — video sender blanked');
        }
      } catch (err) {
        console.warn('[WIBBY SCREEN] replaceTrack back to camera failed:', err);
      }
    }
    this.preSharingVideoTrack = null;

    // Restore local preview elements to camera stream
    if (this.localStream) {
      this.localVideoElements.forEach(el => {
        el.srcObject = this.localStream;
        el.play().catch(() => {});
      });
    }

    // ── DISPLAY AUDIO: removeTrack + renegotiation ────────────────────────────
    if (this.displayAudioSender && this.peerConnection) {
      try {
        this.peerConnection.removeTrack(this.displayAudioSender);
        console.log('[WIBBY SCREEN] Display audio sender removed — triggering renegotiation');

        // Create re-offer to remove the audio transceiver from SDP.
        // onScreenSharingEndedCallback will be called by the caller (or by screenVideoTrack.onended),
        // which also handles emitting the offer. We emit it here directly.
        const offer = await this.createOffer();
        if (this.onScreenSharingEndedCallback) {
          // Temporarily store offer so CallContext can emit it
          (this as any)._pendingStopOffer = offer;
        }
      } catch (err) {
        console.warn('[WIBBY SCREEN] removeTrack for display audio failed:', err);
      }
      this.displayAudioSender = null;
    }

    // Restore standard video sender parameters (maintain-framerate) for camera
    try {
      await this.applyVideoSenderParameters();
    } catch {}

    console.log('[WIBBY SCREEN] Screen sharing stopped');
  }

  /**
   * Apply video encoding parameters on RTCRtpSender.
   * Uses 'maintain-framerate' degradation preference (Guardrail #1) so Chrome
   * guarantees smooth 30 FPS motion during head and hand movements rather than
   * dropping framerate to 12-15 FPS.
   * When screen sharing, switches to 'maintain-resolution' with 5 Mbps budget
   * so presentation text and fine details remain pin-sharp without downsampling.
   */
  async applyVideoSenderParameters(mode?: VideoQualityMode): Promise<void> {
    if (!this.peerConnection) return;
    const currentMode = mode || this.videoQualityMode;
    const videoSender = this.peerConnection.getSenders().find(s => s.track?.kind === 'video');
    if (!videoSender) return;

    try {
      const params = videoSender.getParameters();
      if (!params.encodings || params.encodings.length === 0) {
        params.encodings = [{}];
      }

      if (this.isScreenSharing) {
        // SCREEN SHARE: Absolute highest clarity & sharp resolution for slides/documents/code
        params.degradationPreference = 'maintain-resolution';
        params.encodings[0].maxBitrate = 5_000_000; // 5 Mbps for pristine 1080p
        params.encodings[0].maxFramerate = 30;
        params.encodings[0].scaleResolutionDownBy = 1.0;
        if ('minBitrate' in params.encodings[0]) {
          (params.encodings[0] as any).minBitrate = 1_500_000;
        }
      } else {
        // High clarity & smooth motion optimization:
        // 'balanced' degradation ensures both fluid 30 FPS motion and sharp resolution without stutter or severe downclocking.
        params.degradationPreference = 'balanced';

        // Hard 1080p transmission requirement:
        // If camera capture is 4K (>=3840 wide), downsample by 2.0 to transmit pristine 1080p.
        // If camera capture is 1080p (or standard), scaleResolutionDownBy is 1.0 to transmit 1080p.
        const is4KCapture = this.currentCaptureWidth >= 3840;
        const baseScale = is4KCapture ? 2.0 : 1.0;
        const targetBps = Math.min(Math.max(Math.round(this.videoBitrateTargetMbps * 1_000_000), 2_000_000), 3_500_000);

        if (currentMode === 'data-saver') {
          params.degradationPreference = 'balanced';
          params.encodings[0].maxBitrate = 900_000;
          params.encodings[0].maxFramerate = 24;
          params.encodings[0].scaleResolutionDownBy = baseScale * 1.5;
        } else if (currentMode === '720p') {
          params.degradationPreference = 'balanced';
          params.encodings[0].maxBitrate = 2_000_000;
          params.encodings[0].maxFramerate = 30;
          params.encodings[0].scaleResolutionDownBy = baseScale;
        } else {
          // Standard / 1080p / auto: Fluid 30 FPS HD transmission with crisp clarity and no buffer queues
          params.degradationPreference = 'balanced';
          params.encodings[0].maxBitrate = targetBps;
          params.encodings[0].maxFramerate = 30;
          params.encodings[0].scaleResolutionDownBy = baseScale;
          if ('minBitrate' in params.encodings[0]) {
            (params.encodings[0] as any).minBitrate = Math.round(targetBps * 0.35);
          }
        }
      }

      await videoSender.setParameters(params);
      console.log(`[WIBBY WEBRTC] Applied video sender parameters [isScreenSharing=${this.isScreenSharing}, mode=${currentMode}, degradation=${params.degradationPreference}]:`, {
        maxBitrate: params.encodings[0].maxBitrate,
        maxFramerate: params.encodings[0].maxFramerate,
        scaleResolutionDownBy: params.encodings[0].scaleResolutionDownBy,
        degradationPreference: params.degradationPreference
      });
    } catch (err) {
      console.warn('[WIBBY WEBRTC] Could not set video sender parameters:', err);
    }
  }

  setEnableSdpBandwidthPacing(enabled: boolean): void {
    this.enableSdpBandwidthPacing = enabled;
    console.log('[WIBBY VIDEO] SDP Bandwidth Pacing set to:', enabled);
  }

  getEnableSdpBandwidthPacing(): boolean {
    return this.enableSdpBandwidthPacing;
  }

  setVideoBitrateTargetMbps(mbps: number): Promise<void> {
    this.videoBitrateTargetMbps = mbps;
    return this.applyVideoSenderParameters();
  }

  getVideoBitrateTargetMbps(): number {
    return this.videoBitrateTargetMbps;
  }

  async setVideoCodecPreference(pref: VideoCodecPreference): Promise<void> {
    this.videoCodecPreference = pref;
    console.log('[WIBBY VIDEO] Codec preference set to:', pref);
    this.applyTransceiverCodecPreferences();
  }

  getVideoCodecPreference(): VideoCodecPreference {
    return this.videoCodecPreference;
  }

  getActiveNegotiatedVideoCodec(): string {
    return this.activeNegotiatedVideoCodec;
  }

  getLatestTelemetry(): RealtimeCallTelemetry | null {
    return this.latestTelemetry;
  }

  /**
   * Returns true if WebRTC peer connection is actively connected
   */
  isConnected(): boolean {
    return this.peerConnection?.connectionState === 'connected';
  }

  /**
   * Setup receive-side Web Audio Voice Engine pipeline:
   *
   *              [remote MediaStream]
   *                       │
   *            [MediaStreamAudioSource]
   *            ┌──────────┴──────────────┬────────────────────────┐
   *            │                         │                        │
   *      [naturalGain]          [Highpass 80Hz]            [AnalyserNode 64]
   *            │                         │                        │
   *            │                [Presence 3kHz +2dB]      (RMS Speaking Detection)
   *            │                         │
   *            │                [Lowpass 15kHz]
   *            │                         │
   *            │                [DynamicsCompressor]
   *            │                         │
   *            │                 [voiceGainNode]
   *            │                  ┌──────┴──────┐
   *            │                  │             │
   *            │            [focusedGain]  [spatialGain]
   *            │                  │             │
   *            │                  │       [HRTF Panner]
   *            │                  │             │
   *            └──────────┬───────┴─────────────┘
   *                       ↓
   *             [AudioContext.destination] (ONLY in 'processed' mode)
   * ONLY CALLED IN PROCESSED MODE.
   * In native mode, audio plays directly via HTMLAudioElement.
   */
  private setupVoiceEngine(stream: MediaStream): void {
    try {
      this.teardownVoiceEngine();

      const AudioCtxClass = window.AudioContext || (window as any).webkitAudioContext;
      if (!AudioCtxClass) {
        console.warn('[WIBBY VOICE ENGINE] Web Audio API not supported; falling back to direct HTMLAudioElement');
        if (this.remoteAudioElement) this.remoteAudioElement.muted = false;
        return;
      }

      const ctx = new AudioCtxClass();
      this.audioCtx = ctx;

      // Resume context if browser started it in suspended state
      if (ctx.state === 'suspended') {
        ctx.resume().catch(() => {});
      }

      // 1. Source Node
      this.mediaStreamSource = ctx.createMediaStreamSource(stream);

      // 2. Natural Route (Pure WebRTC baseline bypass)
      this.naturalGain = ctx.createGain();
      this.naturalGain.gain.setValueAtTime(this.voiceExperience === 'natural' ? 1.0 : 0.0, ctx.currentTime);
      this.mediaStreamSource.connect(this.naturalGain);
      if (this.audioPipelineMode === 'processed') {
        this.naturalGain.connect(ctx.destination);
      }

      // 3. Highpass Filter (80Hz Butterworth, Q=0.707) - cuts low-end rumble, HVAC, mic handling
      this.highpassFilter = ctx.createBiquadFilter();
      this.highpassFilter.type = 'highpass';
      this.highpassFilter.frequency.setValueAtTime(80, ctx.currentTime);
      this.highpassFilter.Q.setValueAtTime(0.707, ctx.currentTime);

      // 4. Presence Peaking Filter (3000Hz, +2dB, Q=1.0) - vocal intelligibility & articulation
      this.presenceFilter = ctx.createBiquadFilter();
      this.presenceFilter.type = 'peaking';
      this.presenceFilter.frequency.setValueAtTime(3000, ctx.currentTime);
      this.presenceFilter.gain.setValueAtTime(2.0, ctx.currentTime);
      this.presenceFilter.Q.setValueAtTime(1.0, ctx.currentTime);

      // 5. Lowpass Filter (15000Hz, Q=0.707) - gentle wideband rolloff preserving vocal presence & air
      this.lowpassFilter = ctx.createBiquadFilter();
      this.lowpassFilter.type = 'lowpass';
      this.lowpassFilter.frequency.setValueAtTime(15000, ctx.currentTime);
      this.lowpassFilter.Q.setValueAtTime(0.707, ctx.currentTime);

      // 6. Dynamics Compressor - transparent vocal leveling without pumping
      this.dynamicsCompressor = ctx.createDynamicsCompressor();
      this.dynamicsCompressor.threshold.setValueAtTime(-18, ctx.currentTime);
      this.dynamicsCompressor.knee.setValueAtTime(20, ctx.currentTime);
      this.dynamicsCompressor.ratio.setValueAtTime(2.0, ctx.currentTime);
      this.dynamicsCompressor.attack.setValueAtTime(0.005, ctx.currentTime);
      this.dynamicsCompressor.release.setValueAtTime(0.200, ctx.currentTime);

      // 7. Master Processed Voice Gain (unity)
      this.voiceGainNode = ctx.createGain();
      this.voiceGainNode.gain.setValueAtTime(1.0, ctx.currentTime);

      // 8. Focused Route (Centered gentle EQ + compression) -> Destination (only in processed mode)
      this.focusedGain = ctx.createGain();
      this.focusedGain.gain.setValueAtTime(this.voiceExperience === 'focused' ? 1.0 : 0.0, ctx.currentTime);
      if (this.audioPipelineMode === 'processed') {
        this.focusedGain.connect(ctx.destination);
      }

      // 9. Spatial Route: HRTF PannerNode (front: x=0, y=0.1, z=-1.0) -> Destination (only in processed mode)
      // Mono Safety: Because positionX is 0 (median plane), left and right channels receive
      // identical signals in both phase and amplitude, guaranteeing 0dB loss and 0 comb filtering on mono summing.
      this.spatialGain = ctx.createGain();
      this.spatialGain.gain.setValueAtTime(this.voiceExperience === 'spatial' ? 1.0 : 0.0, ctx.currentTime);

      try {
        this.spatialPanner = ctx.createPanner();
        this.spatialPanner.panningModel = 'HRTF';
        this.spatialPanner.distanceModel = 'inverse';
        this.spatialPanner.refDistance = 1.0;
        this.spatialPanner.maxDistance = 10000;
        this.spatialPanner.rolloffFactor = 1.0;
        this.spatialPanner.coneInnerAngle = 360;

        if (this.spatialPanner.positionX) {
          this.spatialPanner.positionX.setValueAtTime(0.0, ctx.currentTime);
          this.spatialPanner.positionY.setValueAtTime(0.1, ctx.currentTime);
          this.spatialPanner.positionZ.setValueAtTime(-1.0, ctx.currentTime);
          this.spatialPanner.orientationX.setValueAtTime(0.0, ctx.currentTime);
          this.spatialPanner.orientationY.setValueAtTime(0.0, ctx.currentTime);
          this.spatialPanner.orientationZ.setValueAtTime(1.0, ctx.currentTime);
        } else {
          (this.spatialPanner as any).setPosition(0.0, 0.1, -1.0);
          (this.spatialPanner as any).setOrientation(0.0, 0.0, 1.0);
        }

        this.spatialGain.connect(this.spatialPanner);
        if (this.audioPipelineMode === 'processed') {
          this.spatialPanner.connect(ctx.destination);
        }
      } catch (pannerErr) {
        console.warn('[WIBBY VOICE ENGINE] HRTF PannerNode fallback to direct stereo:', pannerErr);
        if (this.audioPipelineMode === 'processed') {
          this.spatialGain.connect(ctx.destination);
        }
      }

      // Connect processing chain
      this.mediaStreamSource.connect(this.highpassFilter);
      this.highpassFilter.connect(this.presenceFilter);
      this.presenceFilter.connect(this.lowpassFilter);
      this.lowpassFilter.connect(this.dynamicsCompressor);
      this.dynamicsCompressor.connect(this.voiceGainNode);
      this.voiceGainNode.connect(this.focusedGain);
      this.voiceGainNode.connect(this.spatialGain);

      // 10. Remote Audio Speaking Detection (RMS from mediaStreamSource) - ALWAYS active
      this.analyserNode = ctx.createAnalyser();
      this.analyserNode.fftSize = 64;
      this.mediaStreamSource.connect(this.analyserNode);
      this.startSpeakingDetection();

      this.voiceEngineActive = true;

      // Output Routing (Single Path Hard Rule):
      if (this.audioPipelineMode === 'native') {
        if (this.remoteAudioElement) {
          this.remoteAudioElement.muted = false;
          this.remoteAudioElement.volume = 1.0;
        }
      } else {
        if (this.remoteAudioElement) {
          this.remoteAudioElement.muted = true;
        }
      }

      console.log('[WIBBY VOICE ENGINE] Pipeline successfully engaged:', {
        audioPipelineMode: this.audioPipelineMode,
        voiceExperience: this.voiceExperience,
        sampleRate: ctx.sampleRate,
        state: ctx.state
      });

      // Handle user gesture unlock if AudioContext started suspended
      const unlockContext = () => {
        if (this.audioCtx && this.audioCtx.state === 'suspended') {
          this.audioCtx.resume().catch(() => {});
        }
      };
      window.addEventListener('pointerdown', unlockContext, { once: true, passive: true });
      window.addEventListener('keydown', unlockContext, { once: true, passive: true });

    } catch (err) {
      console.error('[WIBBY VOICE ENGINE] Initialization failed, falling back to native audio element:', err);
      this.teardownVoiceEngine();
      if (this.remoteAudioElement) {
        this.remoteAudioElement.muted = false;
        this.remoteAudioElement.volume = 1.0;
      }
    }
  }

  /**
   * Monitor remote speech activity via AnalyserNode RMS with debouncing to prevent React render loops
   */
  private startSpeakingDetection(): void {
    this.stopSpeakingDetection();
    if (!this.analyserNode) return;

    const bufferLength = this.analyserNode.fftSize;
    const dataArray = new Uint8Array(bufferLength);
    this.isRemoteSpeaking = false;
    this.lastSpeechTime = 0;

    this.speakingInterval = setInterval(() => {
      if (!this.analyserNode) return;

      this.analyserNode.getByteTimeDomainData(dataArray);

      // Compute RMS deviation from center 128
      let sumSquares = 0;
      for (let i = 0; i < bufferLength; i++) {
        const normalized = (dataArray[i] - 128) / 128;
        sumSquares += normalized * normalized;
      }
      const rms = Math.sqrt(sumSquares / bufferLength);

      const now = Date.now();
      // RMS threshold ~0.035 indicates active human vocal energy
      if (rms > 0.035) {
        this.lastSpeechTime = now;
        if (!this.isRemoteSpeaking) {
          this.isRemoteSpeaking = true;
          if (this.onSpeakingChangeCallback) {
            this.onSpeakingChangeCallback(true);
          }
        }
      } else {
        // Continuous silence for at least 350ms before switching state to false
        if (this.isRemoteSpeaking && now - this.lastSpeechTime > 350) {
          this.isRemoteSpeaking = false;
          if (this.onSpeakingChangeCallback) {
            this.onSpeakingChangeCallback(false);
          }
        }
      }
    }, 100);
  }

  private stopSpeakingDetection(): void {
    if (this.speakingInterval) {
      clearInterval(this.speakingInterval);
      this.speakingInterval = null;
    }
    if (this.isRemoteSpeaking) {
      this.isRemoteSpeaking = false;
      if (this.onSpeakingChangeCallback) {
        this.onSpeakingChangeCallback(false);
      }
    }
  }

  private teardownVoiceEngine(): void {
    this.voiceEngineActive = false;
    this.stopSpeakingDetection();

    try {
      this.mediaStreamSource?.disconnect();
      this.naturalGain?.disconnect();
      this.highpassFilter?.disconnect();
      this.presenceFilter?.disconnect();
      this.lowpassFilter?.disconnect();
      this.dynamicsCompressor?.disconnect();
      this.voiceGainNode?.disconnect();
      this.focusedGain?.disconnect();
      this.spatialGain?.disconnect();
      this.spatialPanner?.disconnect();
      this.analyserNode?.disconnect();
    } catch (e) {
      // Ignore disconnect errors during teardown
    }

    this.mediaStreamSource = null;
    this.naturalGain = null;
    this.highpassFilter = null;
    this.presenceFilter = null;
    this.lowpassFilter = null;
    this.dynamicsCompressor = null;
    this.voiceGainNode = null;
    this.focusedGain = null;
    this.spatialGain = null;
    this.spatialPanner = null;
    this.analyserNode = null;

    if (this.audioCtx && this.audioCtx.state !== 'closed') {
      try {
        this.audioCtx.close();
      } catch (e) {}
    }
    this.audioCtx = null;
  }

  /**
   * Enumerate audio output devices where supported by browser
   */
  async getAudioOutputDevices(): Promise<MediaDeviceInfo[]> {
    if (!navigator.mediaDevices?.enumerateDevices) return [];
    try {
      const devices = await navigator.mediaDevices.enumerateDevices();
      return devices.filter(d => d.kind === 'audiooutput');
    } catch (e) {
      console.warn('[WIBBY AUDIO] Failed to enumerate audio output devices:', e);
      return [];
    }
  }

  /**
   * Route audio to specific output device via setSinkId where supported
   */
  async setAudioOutputDevice(deviceId: string): Promise<boolean> {
    let success = false;
    try {
      if (this.remoteAudioElement && typeof (this.remoteAudioElement as any).setSinkId === 'function') {
        await (this.remoteAudioElement as any).setSinkId(deviceId);
        console.log('[WIBBY AUDIO] Remote audio element setSinkId succeeded:', deviceId);
        success = true;
      }
      if (this.audioCtx && typeof (this.audioCtx as any).setSinkId === 'function') {
        await (this.audioCtx as any).setSinkId(deviceId);
        console.log('[WIBBY AUDIO] AudioContext setSinkId succeeded:', deviceId);
        success = true;
      }
    } catch (e) {
      console.warn('[WIBBY AUDIO] setSinkId error:', e);
    }
    return success;
  }

  /**
   * NATIVE MODE (default):
   *   remoteAudioElement (unmuted) → speaker
   *   + minimal AnalyserNode-only AudioContext for speaking detection
   *   NO full processing chain — eliminates any potential dual-decode interference.
   *
   * PROCESSED MODE:
   *   remoteAudioElement (muted) → [silent]
   *   setupVoiceEngine → Web Audio chain → ctx.destination → speaker
   */
  private attachRemoteAudio(stream: MediaStream) {
    try {
      this.unlockRemoteAudio();
      if (!this.remoteAudioElement) return;

      console.log('[WIBBY WEBRTC] attachRemoteAudio:', {
        streamId: stream.id,
        active: stream.active,
        audioPipelineMode: this.audioPipelineMode,
        audioTracks: stream.getAudioTracks().map(t => ({
          id: t.id, label: t.label,
          readyState: t.readyState, enabled: t.enabled, muted: t.muted
        }))
      });

      if (this.remoteAudioElement.srcObject !== stream) {
        this.remoteAudioElement.srcObject = stream;
      }

      if (this.audioPipelineMode === 'native') {
        // ── NATIVE PATH ───────────────────────────────────────────────
        // Single output: HTMLAudioElement plays stream directly.
        // No Web Audio processing chain is created.
        // This is the cleanest possible path — browser's own AEC works
        // best when audio is rendered by the native audio element.
        this.teardownVoiceEngine();
        this.remoteAudioElement.muted = false;
        this.remoteAudioElement.volume = 1.0;
        // Start minimal analyser-only context for speaking detection.
        this.startNativeSpeakingDetection(stream);

      } else {
        // ── PROCESSED PATH ────────────────────────────────────────────
        // Audio element is muted — all audio comes from Web Audio graph.
        this.remoteAudioElement.muted = true;
        this.setupVoiceEngine(stream);
      }

      // Start playback on the audio element (needed in both modes).
      // In processed mode the element is muted, so this just keeps the
      // browser from garbage-collecting the MediaStream.
      if (this.remoteAudioElement.paused) {
        this.remoteAudioElement.play().catch(e => {
          console.warn('[WIBBY WEBRTC] Autoplay prevented; waiting for user gesture:', e);
          const resume = () => {
            this.remoteAudioElement?.play().catch(() => {});
            if (this.audioCtx?.state === 'suspended') this.audioCtx.resume().catch(() => {});
            window.removeEventListener('pointerdown', resume);
            window.removeEventListener('keydown', resume);
          };
          window.addEventListener('pointerdown', resume, { once: true, passive: true });
          window.addEventListener('keydown', resume, { once: true, passive: true });
        });
      }
    } catch (err) {
      console.error('[WIBBY WEBRTC] Error attaching remote audio:', err);
    }
  }

  /**
   * Dedicated display audio playback (for computer audio / YouTube sound shared via screen share)
   */
  private attachRemoteDisplayAudio(stream: MediaStream) {
    try {
      this.unlockRemoteAudio();
      if (!this.remoteDisplayAudioElement) {
        const displayAudio = document.createElement('audio');
        displayAudio.autoplay = true;
        (displayAudio as any).playsInline = true;
        (displayAudio as any).webkitPlaysInline = true;
        document.body.appendChild(displayAudio);
        this.remoteDisplayAudioElement = displayAudio;
      }
      console.log('[WIBBY WEBRTC] Attaching remote display audio for screen share playback');
      this.remoteDisplayAudioElement.srcObject = stream;
      this.remoteDisplayAudioElement.volume = 1.0;
      this.remoteDisplayAudioElement.muted = false;
      this.remoteDisplayAudioElement.play().catch(e => {
        console.warn('[WIBBY WEBRTC] Display audio playback error:', e);
      });
    } catch (err) {
      console.error('[WIBBY WEBRTC] Error attaching remote display audio:', err);
    }
  }

  /**
   * Minimal AudioContext with ONLY an AnalyserNode for speaking detection in native mode.
   * No output is connected to ctx.destination — the AudioContext is purely for RMS analysis.
   * Uses an audio-only MediaStream to avoid any interaction with the video element stream.
   */
  private startNativeSpeakingDetection(stream: MediaStream): void {
    this.stopSpeakingDetection();
    // Tear down any prior Voice Engine state (nodes, AudioContext) without
    // affecting the remoteAudioElement playback.
    try {
      this.mediaStreamSource?.disconnect();
      this.analyserNode?.disconnect();
    } catch {}
    this.mediaStreamSource = null;
    this.analyserNode = null;
    if (this.audioCtx && this.audioCtx.state !== 'closed') {
      try { this.audioCtx.close(); } catch {}
    }
    this.audioCtx = null;

    try {
      const AudioCtxClass = window.AudioContext || (window as any).webkitAudioContext;
      if (!AudioCtxClass) {
        // No Web Audio: fall back to stats-based detection (polled every 2s)
        this.startStatsSpeakingDetection();
        return;
      }

      // 48 kHz context matches Opus/WebRTC native sample rate — no resampling.
      const ctx = new AudioCtxClass({ latencyHint: 'playback', sampleRate: 48000 });
      this.audioCtx = ctx;

      // Resume immediately if started suspended (requires prior user gesture).
      if (ctx.state === 'suspended') {
        ctx.resume().then(() => {
          this.finishNativeAnalyser(ctx, stream);
        }).catch(() => {
          // No user gesture yet — fall back to stats-based detection.
          this.startStatsSpeakingDetection();
        });
      } else {
        this.finishNativeAnalyser(ctx, stream);
      }
    } catch (err) {
      console.warn('[WIBBY WEBRTC NATIVE] Analyser init failed; using stats detection:', err);
      this.startStatsSpeakingDetection();
    }
  }

  /** Attach the AnalyserNode once AudioContext is running. */
  private finishNativeAnalyser(ctx: AudioContext, stream: MediaStream): void {
    try {
      this.mediaStreamSource = ctx.createMediaStreamSource(stream);
      this.analyserNode = ctx.createAnalyser();
      this.analyserNode.fftSize = 64;
      // Source → Analyser only. No connection to ctx.destination.
      this.mediaStreamSource.connect(this.analyserNode);
      this.startSpeakingDetection();
      console.log('[WIBBY WEBRTC NATIVE] AnalyserNode ready for speaking detection. ctx.sampleRate:', ctx.sampleRate);
    } catch (err) {
      console.warn('[WIBBY WEBRTC NATIVE] Could not connect analyser:', err);
      this.startStatsSpeakingDetection();
    }
  }

  /**
   * Fallback speaking detection using the audioLevel stat from getStats().
   * Activated when AudioContext is unavailable or suspended with no user gesture.
   * Fires at the same 500 ms cadence as the RMS analyser.
   */
  private startStatsSpeakingDetection(): void {
    this.stopSpeakingDetection();
    this.speakingInterval = setInterval(() => {
      const level = this.lastAudioLevelFromStats;
      const nowSpeaking = level > 0.01;
      if (nowSpeaking !== this.isRemoteSpeaking) {
        this.isRemoteSpeaking = nowSpeaking;
        if (this.onSpeakingChangeCallback) this.onSpeakingChangeCallback(nowSpeaking);
      }
    }, 500);
  }

  /**
   * Periodically sample getStats for real-time audio quality telemetry
   */
  /**
   * Periodically sample getStats for real-time video & audio quality telemetry
   * Independently measures camera capture, WebRTC sender, and remote receiver.
   */
  private startStatsMonitoring() {
    this.stopStatsMonitoring();
    this.prevPacketsReceived = 0;
    this.prevPacketsLost = 0;
    this.prevAudioBytesReceived = 0;
    this.prevVideoBytesSent = 0;
    this.prevVideoBytesReceived = 0;
    this.prevVideoPacketsReceived = 0;
    this.prevVideoPacketsLost = 0;
    this.prevTimestamp = Date.now();

    this.statsInterval = setInterval(async () => {
      if (!this.peerConnection || this.peerConnection.connectionState !== 'connected') {
        return;
      }
      try {
        const stats = await this.peerConnection.getStats();
        const now = Date.now();
        const elapsedSecs = Math.max(0.5, (now - this.prevTimestamp) / 1000);

        // Video Sender
        let sendWidth = 0;
        let sendHeight = 0;
        let sendFps = 0;
        let sendBitrateMbps = 0;
        let framesSent = 0;
        let framesEncoded = 0;
        let qualityLimitationReason = 'none';
        let encoderImplementation = '';

        // Video Receiver
        let receiveWidth = 0;
        let receiveHeight = 0;
        let receiveFps = 0;
        let receiveBitrateMbps = 0;
        let framesReceived = 0;
        let framesDecoded = 0;
        let framesDropped = 0;
        let decoderImplementation = '';
        let videoPacketsLost = 0;
        let videoPacketLossRate = 0;

        // Audio Receiver
        let inPkts = 0;
        let inLost = 0;
        let jitter = 0;
        let inAudioLevel = 0;
        let concealed = 0;
        let audioBitrateKbps = 0;
        let audioSampleRate = 48000;
        let audioCodec = 'opus';
        let audioJitterBufferDelayMs = 0;

        // Network
        let rtt = 0;
        let availableOutgoingBitrateKbps = 0;
        let availableIncomingBitrateKbps = 0;
        let iceCandidateType = 'unknown';

        // Codec lookup map
        const codecMap = new Map<string, string>();
        stats.forEach(report => {
          if (report.type === 'codec') {
            codecMap.set(report.id, report.mimeType?.replace('audio/', '')?.replace('video/', '') || report.mimeType);
          }
        });

        let qualityLimitationDurationsStr = '';
        let candidatePairRoute = 'Direct P2P (UDP)';
        let turnStatus = 'TURN NOT DEPLOYED (Direct P2P active)';
        let videoJitterMs = 0;

        stats.forEach(report => {
          if (report.type === 'outbound-rtp' && report.kind === 'video') {
            sendWidth = report.frameWidth || sendWidth;
            sendHeight = report.frameHeight || sendHeight;
            sendFps = Math.round(report.framesPerSecond || 0);
            framesSent = report.framesSent || 0;
            framesEncoded = report.framesEncoded || 0;
            qualityLimitationReason = report.qualityLimitationReason || 'none';
            encoderImplementation = report.encoderImplementation || '';
            if (report.qualityLimitationDurations) {
              const qd = report.qualityLimitationDurations;
              qualityLimitationDurationsStr = `none: ${(qd.none || 0).toFixed(0)}s • cpu: ${(qd.cpu || 0).toFixed(0)}s • bw: ${(qd.bandwidth || 0).toFixed(0)}s`;
            }
            if (report.bytesSent !== undefined) {
              const deltaBytes = Math.max(0, report.bytesSent - this.prevVideoBytesSent);
              sendBitrateMbps = Number(((deltaBytes * 8) / (elapsedSecs * 1000000)).toFixed(2));
              this.prevVideoBytesSent = report.bytesSent;

              // Track static vs motion bitrate
              if (sendBitrateMbps > 0) {
                if (sendBitrateMbps > 2.5) {
                  this.peakMotionBitrateMbps = Math.max(this.peakMotionBitrateMbps, sendBitrateMbps);
                } else if (sendBitrateMbps < 2.0) {
                  this.minStaticBitrateMbps = this.minStaticBitrateMbps === 0 ? sendBitrateMbps : Math.min(this.minStaticBitrateMbps, sendBitrateMbps);
                }
              }
            }
          } else if (report.type === 'inbound-rtp' && report.kind === 'video') {
            receiveWidth = report.frameWidth || receiveWidth;
            receiveHeight = report.frameHeight || receiveHeight;
            receiveFps = Math.round(report.framesPerSecond || 0);
            framesReceived = report.packetsReceived || report.framesReceived || 0;
            framesDecoded = report.framesDecoded || 0;
            framesDropped = report.framesDropped || 0;
            decoderImplementation = report.decoderImplementation || '';
            videoPacketsLost = report.packetsLost || 0;
            videoJitterMs = report.jitter ? Number((report.jitter * 1000).toFixed(1)) : 0;
            if (report.bytesReceived !== undefined) {
              const deltaBytes = Math.max(0, report.bytesReceived - this.prevVideoBytesReceived);
              receiveBitrateMbps = Number(((deltaBytes * 8) / (elapsedSecs * 1000000)).toFixed(2));
              this.prevVideoBytesReceived = report.bytesReceived;
            }
            const inVidPkts = report.packetsReceived || 0;
            const deltaVidReceived = Math.max(0, inVidPkts - this.prevVideoPacketsReceived);
            const deltaVidLost = Math.max(0, videoPacketsLost - this.prevVideoPacketsLost);
            const totalVidDelta = deltaVidReceived + deltaVidLost;
            videoPacketLossRate = totalVidDelta > 0 ? Number((deltaVidLost / totalVidDelta).toFixed(3)) : 0;
            this.prevVideoPacketsReceived = inVidPkts;
            this.prevVideoPacketsLost = videoPacketsLost;
          } else if (report.type === 'inbound-rtp' && report.kind === 'audio') {
            inPkts = report.packetsReceived || 0;
            inLost = report.packetsLost || 0;
            jitter = report.jitter ? Number(report.jitter.toFixed(4)) : 0;
            inAudioLevel = report.audioLevel !== undefined ? Number(report.audioLevel.toFixed(2)) : 0;
            concealed = report.concealedSamples || 0;
            if (report.jitterBufferDelay && report.jitterBufferEmittedCount) {
              audioJitterBufferDelayMs = Number(((report.jitterBufferDelay / report.jitterBufferEmittedCount) * 1000).toFixed(1));
            }
            if (report.codecId && codecMap.has(report.codecId)) {
              audioCodec = codecMap.get(report.codecId) || 'opus';
            }
            if (report.bytesReceived !== undefined) {
              const deltaAudioBytes = Math.max(0, report.bytesReceived - this.prevAudioBytesReceived);
              audioBitrateKbps = Number(((deltaAudioBytes * 8) / (elapsedSecs * 1000)).toFixed(1));
              this.prevAudioBytesReceived = report.bytesReceived;
            }
          } else if (report.type === 'candidate-pair' && report.state === 'succeeded') {
            rtt = report.currentRoundTripTime ? Number((report.currentRoundTripTime * 1000).toFixed(1)) : 0;
            if (report.availableOutgoingBitrate) {
              availableOutgoingBitrateKbps = Math.round(report.availableOutgoingBitrate / 1000);
            }
            if (report.availableIncomingBitrate) {
              availableIncomingBitrateKbps = Math.round(report.availableIncomingBitrate / 1000);
            }
            if (report.remoteCandidateId) {
              const candidateReport = stats.get(report.remoteCandidateId);
              if (candidateReport && candidateReport.candidateType) {
                iceCandidateType = candidateReport.candidateType;
              }
            }
            if (report.remoteCandidateId && report.localCandidateId) {
              const localReport = stats.get(report.localCandidateId);
              const remoteReport = stats.get(report.remoteCandidateId);
              const localType = localReport?.candidateType || 'host';
              const remoteType = remoteReport?.candidateType || 'host';
              candidatePairRoute = `${localType} ➔ ${remoteType} (${report.protocol || 'UDP'})`;
              if (localType === 'relay' || remoteType === 'relay') {
                turnStatus = 'TURN RELAY ACTIVE';
              } else {
                turnStatus = 'TURN NOT DEPLOYED (Direct P2P STUN host/srflx active)';
              }
            }
          }
        });

        // Compute delta rates for encoded, sent, decoded, and dropped frames
        const deltaFramesSent = Math.max(0, framesSent - this.prevFramesSent);
        const deltaFramesEncoded = Math.max(0, framesEncoded - this.prevFramesEncoded);
        const sentFps = elapsedSecs > 0 ? Math.round(deltaFramesSent / elapsedSecs) : (sendFps || 0);
        const encodedFps = elapsedSecs > 0 ? Math.round(deltaFramesEncoded / elapsedSecs) : sentFps;
        this.prevFramesSent = framesSent;
        this.prevFramesEncoded = framesEncoded;

        const deltaFramesReceived = Math.max(0, framesReceived - this.prevFramesReceived);
        const deltaFramesDecoded = Math.max(0, framesDecoded - this.prevFramesDecoded);
        const deltaFramesDropped = Math.max(0, framesDropped - this.prevFramesDropped);
        const actualReceiveFps = elapsedSecs > 0 && deltaFramesReceived > 0 ? Math.round(deltaFramesReceived / elapsedSecs) : (receiveFps || 0);
        const decodedFps = elapsedSecs > 0 ? Math.round(deltaFramesDecoded / elapsedSecs) : actualReceiveFps;
        const droppedFps = elapsedSecs > 0 ? Math.round(deltaFramesDropped / elapsedSecs) : 0;
        this.prevFramesReceived = framesReceived;
        this.prevFramesDecoded = framesDecoded;
        this.prevFramesDropped = framesDropped;

        // Compute delta audio packet loss rate
        const deltaReceived = Math.max(0, inPkts - this.prevPacketsReceived);
        const deltaLost = Math.max(0, inLost - this.prevPacketsLost);
        const totalDelta = deltaReceived + deltaLost;
        const packetLossRate = totalDelta > 0 ? Number((deltaLost / totalDelta).toFixed(3)) : 0;

        this.prevPacketsReceived = inPkts;
        this.prevPacketsLost = inLost;
        this.prevTimestamp = now;

        const jitterMs = jitter * 1000;
        let quality: CallAudioQuality = 'excellent';
        if (packetLossRate > 0.12 || jitterMs > 120 || rtt > 400) {
          quality = 'poor';
        } else if (packetLossRate > 0.05 || jitterMs > 60 || rtt > 250) {
          quality = 'degraded';
        }
        if (this.peerConnection.iceConnectionState === 'disconnected') {
          quality = 'poor';
        }

        // Check current camera track for capture res/fps
        const vTrack = this.localStream?.getVideoTracks()[0];
        if (vTrack && vTrack.getSettings) {
          const s = vTrack.getSettings();
          if (s.width) this.currentCaptureWidth = s.width;
          if (s.height) this.currentCaptureHeight = s.height;
          if (s.frameRate) this.currentCaptureFps = Math.round(s.frameRate);
        }

        // Build full RealtimeCallTelemetry (5 Forensic Stages)
        const telemetry: RealtimeCallTelemetry = {
          // 1. Capture & Local Camera Monitor (Test 1)
          cameraCapability: this.cameraHardwareCapability,
          actualCaptureResolution: `${this.currentCaptureWidth}×${this.currentCaptureHeight}@${this.currentCaptureFps}fps`,
          captureWidth: this.currentCaptureWidth,
          captureHeight: this.currentCaptureHeight,
          captureFps: this.currentCaptureFps,
          localPresentedFps: this.localDisplayPresentedFps || this.currentCaptureFps,
          localAvgFrameIntervalMs: this.localDisplayAvgFrameIntervalMs || (this.currentCaptureFps > 0 ? Number((1000 / this.currentCaptureFps).toFixed(1)) : 33.3),
          localFrameIntervalVarianceMs: this.localDisplayFrameIntervalVarianceMs,
          localMaxFrameGapMs: this.localDisplayMaxFrameGapMs,

          // 2. WebRTC Outbound Sender (Test 2)
          sendWidth,
          sendHeight,
          sendFps,
          encodedFps,
          sentFps,
          sendBitrateMbps,
          staticBitrateMbps: this.minStaticBitrateMbps,
          motionBitrateMbps: this.peakMotionBitrateMbps || sendBitrateMbps,
          bitrateCeilingMbps: this.videoBitrateTargetMbps,
          framesSent,
          framesEncoded,
          qualityLimitationReason,
          qualityLimitationDurations: qualityLimitationDurationsStr,
          encoderImplementation,

          // 3. WebRTC Inbound Receiver (Test 4)
          receiveWidth,
          receiveHeight,
          receiveFps: actualReceiveFps || receiveFps,
          decodedFps,
          droppedFps,
          receiveBitrateMbps,
          framesReceived,
          framesDecoded,
          framesDropped,
          decoderImplementation,
          videoPacketsLost,
          videoPacketLossRate,
          videoJitterMs,

          // Audio Receiver
          audioCodec,
          audioSampleRate,
          audioBitrateKbps,
          audioPacketsLost: inLost,
          audioPacketLossRate: packetLossRate,
          audioJitterMs: jitterMs,
          audioJitterBufferDelayMs,
          audioConcealedSamples: concealed,
          audioLevel: inAudioLevel,

          // 4. Network & Transport (Test 3)
          rttMs: rtt,
          availableOutgoingBitrateKbps,
          availableIncomingBitrateKbps,
          iceCandidateType,
          candidatePairRoute,
          turnStatus,
          qualityScore: quality,

          // 5. Remote Display Pacing & Freeze Telemetry (Test 5 - rVFC)
          presentedFps: this.displayPresentedFps || receiveFps,
          avgFrameIntervalMs: this.displayAvgFrameIntervalMs || (receiveFps > 0 ? Number((1000 / receiveFps).toFixed(1)) : 33.3),
          frameIntervalVarianceMs: this.displayFrameIntervalVarianceMs,
          maxFrameGapMs: this.displayMaxFrameGapMs,
          freezeCount: this.displayFreezeCount,
          maxFreezeDurationMs: this.displayMaxFreezeDurationMs,
          activeVideoCodec: this.activeNegotiatedVideoCodec || 'VP8'
        };

        this.latestTelemetry = telemetry;

        if (this.onTelemetryCallback) {
          this.onTelemetryCallback(telemetry);
        }

        const metrics: CallQualityMetrics = {
          packetLossRate,
          jitterMs,
          rttMs: rtt,
          audioLevel: inAudioLevel,
          packetsReceived: inPkts,
          packetsLost: inLost
        };

        if (this.onQualityChangeCallback && (quality !== this.currentAudioQuality || inPkts % 10 === 0)) {
          this.currentAudioQuality = quality;
          this.onQualityChangeCallback(quality, metrics);
        }

        // Hard 1080p requirement: Do NOT silently downgrade resolution to 720p/540p.
        // The sender maintains 1080p @ 30 FPS. Network status badge adapts to show
        // 'Connection unstable' when packet loss or RTT rises, without degrading resolution.

        // Update lastAudioLevelFromStats for native-mode speaking detection fallback
        this.lastAudioLevelFromStats = inAudioLevel;

        // Log 1s stats sample for developer forensic analysis
        console.log(
          `[WIBBY RTP STATS][1s] Capture: ${this.currentCaptureWidth}x${this.currentCaptureHeight}@${this.currentCaptureFps}fps | Send: ${sendWidth}x${sendHeight}@${sendFps}fps (${sendBitrateMbps}Mbps, enc: ${encoderImplementation || 'default'}, limit: ${qualityLimitationReason}) | Recv: ${receiveWidth}x${receiveHeight}@${receiveFps}fps (${receiveBitrateMbps}Mbps, dec: ${decoderImplementation || 'default'}, drop: ${framesDropped}) | Motion: ${this.peakMotionBitrateMbps}Mbps | RTT: ${rtt}ms`
        );
      } catch (e) {
        // Silently ignore stats reading errors
      }
    }, 1000); // 1-second sampling as mandated in Section 6
  }

  private stopStatsMonitoring() {
    if (this.statsInterval) {
      clearInterval(this.statsInterval);
      this.statsInterval = null;
    }
  }

  /**
   * Check if remote audio stream is actively present and attached
   */
  hasRemoteAudio(): boolean {
    if (!this.remoteStream || !this.remoteAudioElement) return false;
    const tracks = this.remoteStream.getAudioTracks();
    return tracks.length > 0 && tracks[0].readyState === 'live' && !this.remoteAudioElement.paused;
  }

  /**
   * Log comprehensive pipeline diagnostics
   */
  logPipelineDiagnostics(trigger: string): void {
    const pc = this.peerConnection;
    const localTrack = this.localStream?.getAudioTracks()[0];
    const remoteTrack = this.remoteStream?.getAudioTracks()[0];
    const audioEl = this.remoteAudioElement;

    const sender = pc?.getSenders().find(s => s.track?.kind === 'audio');
    const receiver = pc?.getReceivers().find(r => r.track?.kind === 'audio');

    console.log(`[WIBBY WEBRTC PIPELINE DIAGNOSTICS] (${trigger})`, {
      callId: this.currentCallId,
      pcId: this.pcId,
      pcConnectionState: pc?.connectionState,
      pcIceConnectionState: pc?.iceConnectionState,
      pcIceGatheringState: pc?.iceGatheringState,
      pcSignalingState: pc?.signalingState,
      localMic: {
        streamId: this.localStream?.id,
        streamActive: this.localStream?.active,
        trackId: localTrack?.id,
        trackReadyState: localTrack?.readyState,
        trackEnabled: localTrack?.enabled,
        trackMuted: localTrack?.muted
      },
      sender: {
        trackReadyState: sender?.track?.readyState,
        trackEnabled: sender?.track?.enabled
      },
      receiver: {
        trackReadyState: receiver?.track?.readyState,
        trackEnabled: receiver?.track?.enabled,
        trackMuted: receiver?.track?.muted
      },
      remoteStream: {
        streamId: this.remoteStream?.id,
        streamActive: this.remoteStream?.active,
        trackId: remoteTrack?.id,
        trackReadyState: remoteTrack?.readyState,
        trackEnabled: remoteTrack?.enabled,
        trackMuted: remoteTrack?.muted
      },
      remoteAudioElement: {
        exists: !!audioEl,
        paused: audioEl?.paused,
        muted: audioEl?.muted,
        volume: audioEl?.volume,
        readyState: audioEl?.readyState,
        networkState: audioEl?.networkState,
        currentTime: audioEl?.currentTime,
        hasSrcObject: !!audioEl?.srcObject
      }
    });
  }

  /**
   * Toggle local microphone mute
   */
  setMuted(muted: boolean): boolean {
    if (!this.localStream) return false;
    this.localStream.getAudioTracks().forEach(track => {
      track.enabled = !muted;
      console.log(`[WIBBY WEBRTC] Local track ${track.label} enabled=${track.enabled}`);
    });
    return muted;
  }

  /**
   * Clean up PeerConnection without stopping local mic if needed
   */
  private cleanupPeerConnection() {
    this.stopStatsMonitoring();

    if (this.iceDisconnectTimeout) {
      clearTimeout(this.iceDisconnectTimeout);
      this.iceDisconnectTimeout = null;
    }

    if (this.peerConnection) {
      this.peerConnection.onicecandidate = null;
      this.peerConnection.onconnectionstatechange = null;
      this.peerConnection.oniceconnectionstatechange = null;
      this.peerConnection.ontrack = null;
      this.peerConnection.close();
      this.peerConnection = null;
    }
    this.remoteDescriptionSet = false;
    this.pendingIceCandidates = [];
  }

  /**
   * Full cleanup of all microphone tracks, audio elements, and WebRTC resources
   */
  cleanup(): void {
    console.log('[WIBBY WEBRTC] Performing full WebRTC & microphone cleanup...');

    // Phase 10: Ensure screen sharing is stopped first (stops tracks, clears state)
    if (this.isScreenSharing) {
      // Synchronous best-effort teardown — peer connection will be closed below
      this.isScreenSharing = false;
      if (this.screenStream) {
        this.screenStream.getTracks().forEach(t => { try { t.stop(); } catch {} });
        this.screenStream = null;
      }
      this.screenVideoElements.forEach(el => {
        try { el.srcObject = null; } catch {}
      });
      this.screenVideoElements.clear();
      this.preSharingVideoTrack = null;
      this.displayAudioSender = null;
    } else {
      this.screenVideoElements.forEach(el => {
        try { el.srcObject = null; } catch {}
      });
      this.screenVideoElements.clear();
    }

    // 1. Stop all local tracks (mic + camera)
    if (this.localStream) {
      this.localStream.getTracks().forEach(track => {
        try {
          track.stop();
          console.log('[WIBBY WEBRTC] Local track stopped:', track.kind, track.label);
        } catch (e) {
          console.warn('[WIBBY WEBRTC] Error stopping track:', e);
        }
      });
      this.localStream = null;
    }

    // 2. Stop remote audio and video streams
    if (this.remoteStream) {
      this.remoteStream.getTracks().forEach(track => {
        try {
          track.stop();
        } catch {}
      });
      this.remoteStream = null;
    }

    if (this.remoteVideoStream) {
      this.remoteVideoStream.getTracks().forEach(track => {
        try {
          track.stop();
        } catch {}
      });
      this.remoteVideoStream = null;
    }

    // 3. Reset video elements and display pacing monitor
    this.stopDisplayPacingMonitor();
    this.frameTimestamps = [];
    this.frameIntervals = [];
    this.lastPresentationTime = 0;
    this.totalPresentedFrames = 0;
    this.displayPresentedFps = 0;
    this.displayAvgFrameIntervalMs = 0;
    this.displayFrameIntervalVarianceMs = 0;
    this.displayMaxFrameGapMs = 0;
    this.displayFreezeCount = 0;
    this.displayMaxFreezeDurationMs = 0;
    this.latestTelemetry = null;

    this.localVideoElements.forEach(el => {
      try { el.srcObject = null; } catch {}
    });
    this.localVideoElements.clear();
    this.localVideoElement = null;

    this.remoteVideoElements.forEach(el => {
      try { el.srcObject = null; } catch {}
    });
    this.remoteVideoElements.clear();
    this.remoteVideoElement = null;

    // 4. Remove remote audio elements
    if (this.remoteAudioElement) {
      try {
        this.remoteAudioElement.pause();
        this.remoteAudioElement.srcObject = null;
        if (this.remoteAudioElement.parentNode) {
          this.remoteAudioElement.parentNode.removeChild(this.remoteAudioElement);
        }
      } catch (e) {
        console.warn('[WIBBY WEBRTC] Error removing remote audio element:', e);
      }
      this.remoteAudioElement = null;
    }

    if (this.remoteDisplayAudioElement) {
      try {
        this.remoteDisplayAudioElement.pause();
        this.remoteDisplayAudioElement.srcObject = null;
        if (this.remoteDisplayAudioElement.parentNode) {
          this.remoteDisplayAudioElement.parentNode.removeChild(this.remoteDisplayAudioElement);
        }
      } catch (e) {
        console.warn('[WIBBY WEBRTC] Error removing remote display audio element:', e);
      }
      this.remoteDisplayAudioElement = null;
    }
    this.remoteDisplayAudioTrack = null;
    this.remoteAudioTrack = null;

    // 5. Close PeerConnection
    this.cleanupPeerConnection();

    // 6. Teardown Voice Engine & Web Audio resources
    this.teardownVoiceEngine();

    this.sessionGeneration++;
    this.currentCallId = null;
    this.pcId = null;
    this.sessionId = null;
    this.callType = 'voice';
    this.isCameraOff = false;
    this.isCameraUnavailable = false;

    this.onIceCandidateCallback = null;
    this.onConnectionStateChangeCallback = null;
    this.onIceConnectionStateChangeCallback = null;
    this.onRemoteAudioActiveCallback = null;
    this.onRemoteVideoActiveCallback = null;
    this.onRemoteVideoTrackCallback = null;
    this.onIceRestartNeededCallback = null;
    this.onQualityChangeCallback = null;
    this.currentAudioQuality = 'excellent';
    this.onScreenSharingEndedCallback = null;
  }
}

export const rtcService = new RTCService();
