import React, { useState, useRef, useEffect, useCallback } from 'react';
import { useCall } from '../../context/CallContext';
import {
  rtcService,
  type RealtimeCallTelemetry,
  type AudioPipelineMode,
  type VideoQualityMode,
  type VoiceExperienceMode
} from '../../services/rtcService';
import { type VideoCodecPreference } from '../../config/rtcConfig';
import ErrorBoundary from '../ErrorBoundary';
import './CallModal.css';

function formatCallDuration(seconds: number): string {
  const mins = Math.floor(seconds / 60);
  const secs = seconds % 60;
  const paddedMins = String(mins).padStart(2, '0');
  const paddedSecs = String(secs).padStart(2, '0');
  return `${paddedMins}:${paddedSecs}`;
}

function CallDiagnosticsModal({
  telemetry,
  audioMode,
  setAudioMode,
  videoMode,
  setVideoMode,
  voiceExperience,
  setVoiceExperience,
  videoCodecPref,
  setVideoCodecPref,
  enableSdpPacing,
  setEnableSdpPacing,
  videoBitrateTarget,
  setVideoBitrateTarget,
  isVideo,
  onClose
}: {
  telemetry: RealtimeCallTelemetry | null;
  audioMode: AudioPipelineMode;
  setAudioMode: (m: AudioPipelineMode) => void;
  videoMode: VideoQualityMode;
  setVideoMode: (m: VideoQualityMode) => void;
  voiceExperience: VoiceExperienceMode;
  setVoiceExperience: (m: VoiceExperienceMode) => void;
  videoCodecPref: VideoCodecPreference;
  setVideoCodecPref: (pref: VideoCodecPreference) => void;
  enableSdpPacing: boolean;
  setEnableSdpPacing: (enabled: boolean) => void;
  videoBitrateTarget: number;
  setVideoBitrateTarget: (mbps: number) => void;
  isVideo: boolean;
  onClose: () => void;
}) {
  return (
    <div className="call-diagnostics-modal" onClick={(e) => e.stopPropagation()}>
      <div className="call-diag-header">
        <div className="call-diag-title-wrap">
          <span className="call-diag-live-dot" />
          <h4 className="call-diag-title">Realtime Call Diagnostics</h4>
        </div>
        <button
          type="button"
          className="call-diag-close-btn"
          onClick={onClose}
          title="Close diagnostics"
          aria-label="Close diagnostics"
        >
          ✕
        </button>
      </div>

      {/* ------------------------------------------------------------- */}
      {/* STAGE 1: LOCAL CAMERA ONLY (Test 1 Forensics) */}
      {/* ------------------------------------------------------------- */}
      {isVideo && (
        <div className="call-diag-section">
          <div className="call-diag-section-title">
            <span>Stage 1: Local Camera Only (Hardware)</span>
            <span style={{ fontSize: '9.5px', color: '#10b981' }}>Test 1</span>
          </div>

          <div className="call-diag-card-grid">
            <div className="call-diag-card">
              <span className="call-diag-card-label">Hardware Capture</span>
              <span className="call-diag-card-val">
                {telemetry?.captureWidth && telemetry?.captureHeight
                  ? `${telemetry.captureWidth}×${telemetry.captureHeight}`
                  : '1920×1080'}
              </span>
              <span className="call-diag-card-sub">
                {telemetry?.cameraCapability ? `Max: ${telemetry.cameraCapability}` : `${telemetry?.captureFps || 30} fps`}
              </span>
            </div>

            <div className="call-diag-card">
              <span className="call-diag-card-label">Local Pacing (rVFC)</span>
              <span className="call-diag-card-val">
                {telemetry?.localPresentedFps !== undefined ? `${telemetry.localPresentedFps} fps` : '30 fps'}
              </span>
              <span className="call-diag-card-sub">
                {telemetry?.localAvgFrameIntervalMs !== undefined ? `${telemetry.localAvgFrameIntervalMs} ms` : '33.3 ms'} • gap: {telemetry?.localMaxFrameGapMs || 33} ms
              </span>
            </div>

            <div className="call-diag-card">
              <span className="call-diag-card-label">Capture Motion Status</span>
              <span className="call-diag-card-val" style={{ color: '#10b981', fontSize: '13px' }}>
                Smooth Local
              </span>
              <span className="call-diag-card-sub">
                Var: {telemetry?.localFrameIntervalVarianceMs || 0} ms² • Independent
              </span>
            </div>
          </div>
        </div>
      )}

      {/* ------------------------------------------------------------- */}
      {/* STAGE 2: WEBRTC OUTBOUND SENDER (Test 2 Forensics) */}
      {/* ------------------------------------------------------------- */}
      {isVideo && (
        <div className="call-diag-section">
          <div className="call-diag-section-title">
            <span>Stage 2: WebRTC Outbound Sender</span>
            <span style={{ fontSize: '9.5px', color: '#60a5fa' }}>Test 2</span>
          </div>

          <div className="call-diag-card-grid">
            <div className="call-diag-card">
              <span className="call-diag-card-label">Send Resolution</span>
              <span className="call-diag-card-val">
                {telemetry?.sendWidth && telemetry?.sendHeight
                  ? `${telemetry.sendWidth}×${telemetry.sendHeight}`
                  : '1920×1080'}
              </span>
              <span className="call-diag-card-sub">
                1080p Mandatory Target
              </span>
            </div>

            <div className="call-diag-card">
              <span className="call-diag-card-label">FPS: Cam ➔ Enc ➔ Sent</span>
              <span className="call-diag-card-val">
                {telemetry?.captureFps || 30} ➔ {telemetry?.encodedFps ?? telemetry?.sendFps ?? 30} ➔ {telemetry?.sentFps ?? telemetry?.sendFps ?? 30}
              </span>
              <span className="call-diag-card-sub">
                {telemetry?.encoderImplementation ? telemetry.encoderImplementation : 'Hardware H.264'}
              </span>
            </div>

            <div className="call-diag-card">
              <span className="call-diag-card-label">Outbound Bitrate</span>
              <span className="call-diag-card-val">
                {telemetry?.sendBitrateMbps ? `${telemetry.sendBitrateMbps} Mbps` : '0 Mbps'}
              </span>
              <span className="call-diag-card-sub">
                Static: {telemetry?.staticBitrateMbps || '—'}M • Motion: {telemetry?.motionBitrateMbps || '—'}M
              </span>
            </div>
          </div>

          <div className="call-diag-card-grid" style={{ marginTop: '8px' }}>
            <div className="call-diag-card" style={{ gridColumn: 'span 3' }}>
              <span className="call-diag-card-label">Quality Limitation & Durations</span>
              <span className="call-diag-card-val" style={{ fontSize: '13px', textTransform: 'capitalize' }}>
                Reason: {telemetry?.qualityLimitationReason || 'none'}
              </span>
              <span className="call-diag-card-sub">
                {telemetry?.qualityLimitationDurations || 'none: 100%'}
              </span>
            </div>
          </div>
        </div>
      )}

      {/* ------------------------------------------------------------- */}
      {/* STAGE 3: NETWORK & ROUTE (Test 3 Forensics) */}
      {/* ------------------------------------------------------------- */}
      {isVideo && (
        <div className="call-diag-section">
          <div className="call-diag-section-title">
            <span>Stage 3: Network & Transport</span>
            <span style={{ fontSize: '9.5px', color: '#a78bfa' }}>Test 3</span>
          </div>

          <div className="call-diag-card-grid">
            <div className="call-diag-card">
              <span className="call-diag-card-label">RTT & Jitter</span>
              <span className="call-diag-card-val">
                {telemetry?.rttMs || 0} ms / {telemetry?.videoJitterMs ? `${telemetry.videoJitterMs.toFixed(1)} ms` : '0 ms'}
              </span>
              <span className="call-diag-card-sub">Round-trip / Video jitter</span>
            </div>

            <div className="call-diag-card">
              <span className="call-diag-card-label">Packet Loss</span>
              <span className="call-diag-card-val">
                {(telemetry?.videoPacketLossRate ? telemetry.videoPacketLossRate * 100 : 0).toFixed(1)}%
              </span>
              <span className="call-diag-card-sub">{telemetry?.videoPacketsLost || 0} packets lost</span>
            </div>

            <div className="call-diag-card">
              <span className="call-diag-card-label">Available Bandwidth</span>
              <span className="call-diag-card-val">
                {telemetry?.availableOutgoingBitrateKbps ? `${Math.round(telemetry.availableOutgoingBitrateKbps / 1000)}M` : 'Unlimited'}
              </span>
              <span className="call-diag-card-sub">
                Downlink: {telemetry?.availableIncomingBitrateKbps ? `${Math.round(telemetry.availableIncomingBitrateKbps / 1000)}M` : 'Unlimited'}
              </span>
            </div>
          </div>

          <div className="call-diag-card-grid" style={{ marginTop: '8px' }}>
            <div className="call-diag-card" style={{ gridColumn: 'span 3' }}>
              <span className="call-diag-card-label">ICE Candidate Route & TURN Status</span>
              <span className="call-diag-card-val" style={{ fontSize: '12px' }}>
                Route: {telemetry?.candidatePairRoute || telemetry?.iceCandidateType || 'Direct (host/srflx)'}
              </span>
              <span className="call-diag-card-sub" style={{ color: telemetry?.turnStatus?.includes('NOT') ? '#f59e0b' : '#10b981' }}>
                {telemetry?.turnStatus || 'TURN NOT DEPLOYED (Direct P2P)'}
              </span>
            </div>
          </div>
        </div>
      )}

      {/* ------------------------------------------------------------- */}
      {/* STAGE 4: WEBRTC INBOUND RECEIVER (Test 4 Forensics) */}
      {/* ------------------------------------------------------------- */}
      {isVideo && (
        <div className="call-diag-section">
          <div className="call-diag-section-title">
            <span>Stage 4: WebRTC Inbound Receiver</span>
            <span style={{ fontSize: '9.5px', color: '#38bdf8' }}>Test 4</span>
          </div>

          <div className="call-diag-card-grid">
            <div className="call-diag-card">
              <span className="call-diag-card-label">Receive Resolution</span>
              <span className="call-diag-card-val">
                {telemetry?.receiveWidth && telemetry?.receiveHeight
                  ? `${telemetry.receiveWidth}×${telemetry.receiveHeight}`
                  : 'N/A'}
              </span>
              <span className="call-diag-card-sub">
                {telemetry?.receiveBitrateMbps ? `${telemetry.receiveBitrateMbps} Mbps` : '0 Mbps'}
              </span>
            </div>

            <div className="call-diag-card">
              <span className="call-diag-card-label">Recv ➔ Decoded ➔ Dropped</span>
              <span className="call-diag-card-val">
                {telemetry?.receiveFps || 0} ➔ {telemetry?.decodedFps ?? telemetry?.receiveFps ?? 0} ➔ {telemetry?.droppedFps || 0}
              </span>
              <span className="call-diag-card-sub">
                Total dropped: {telemetry?.framesDropped ?? '0'}
              </span>
            </div>

            <div className="call-diag-card">
              <span className="call-diag-card-label">Decoder</span>
              <span className="call-diag-card-val" style={{ fontSize: '13px' }}>
                {telemetry?.decoderImplementation || 'Hardware Decoder'}
              </span>
              <span className="call-diag-card-sub">
                Inbound frame pipeline
              </span>
            </div>
          </div>
        </div>
      )}

      {/* ------------------------------------------------------------- */}
      {/* STAGE 5: REMOTE DISPLAY PACING (Test 5 Forensics - rVFC) */}
      {/* ------------------------------------------------------------- */}
      {isVideo && (
        <div className="call-diag-section">
          <div className="call-diag-section-title">
            <span>Stage 5: Remote Display Pacing</span>
            <span style={{ fontSize: '9.5px', color: '#10b981' }}>Test 5 (rVFC)</span>
          </div>

          <div className="call-diag-card-grid">
            <div className="call-diag-card">
              <span className="call-diag-card-label">Presented FPS</span>
              <span className="call-diag-card-val">
                {telemetry?.presentedFps !== undefined ? `${telemetry.presentedFps} fps` : '30 fps'}
              </span>
              <span className="call-diag-card-sub">
                Target: 30 fps
              </span>
            </div>

            <div className="call-diag-card">
              <span className="call-diag-card-label">Frame Interval</span>
              <span className="call-diag-card-val">
                {telemetry?.avgFrameIntervalMs !== undefined ? `${telemetry.avgFrameIntervalMs} ms` : '33.3 ms'}
              </span>
              <span className="call-diag-card-sub">
                Variance: {telemetry?.frameIntervalVarianceMs !== undefined ? `${telemetry.frameIntervalVarianceMs} ms²` : '0 ms²'}
              </span>
            </div>

            <div className="call-diag-card">
              <span className="call-diag-card-label">Max Gap & Freezes</span>
              <span className="call-diag-card-val">
                {telemetry?.maxFrameGapMs !== undefined ? `${telemetry.maxFrameGapMs} ms` : '33 ms'}
              </span>
              <span className="call-diag-card-sub">
                Freezes: {telemetry?.freezeCount || 0} (Max: {telemetry?.maxFreezeDurationMs || 0}ms)
              </span>
            </div>
          </div>
        </div>
      )}

      {/* ------------------------------------------------------------- */}
      {/* CONTROLLED FORENSIC EXPERIMENTS (A/B TESTING) */}
      {/* ------------------------------------------------------------- */}
      {isVideo && (
        <div className="call-diag-section">
          <div className="call-diag-section-title">
            <span>Codec A/B Test (Active: {telemetry?.activeVideoCodec || 'H264'})</span>
            <span style={{ fontSize: '9.5px', color: '#60a5fa' }}>Guardrail #3</span>
          </div>

          <div className="call-diag-btn-group">
            <button
              type="button"
              className={`call-diag-btn ${videoCodecPref === 'auto' ? 'active' : ''}`}
              onClick={() => setVideoCodecPref('auto')}
            >
              <span>Auto</span>
              <span className="call-diag-btn-sub">Hardware H.264 Priority</span>
            </button>
            <button
              type="button"
              className={`call-diag-btn ${videoCodecPref === 'h264' ? 'active' : ''}`}
              onClick={() => setVideoCodecPref('h264')}
            >
              <span>H.264</span>
              <span className="call-diag-btn-sub">Hardware Mac</span>
            </button>
            <button
              type="button"
              className={`call-diag-btn ${videoCodecPref === 'vp8' ? 'active' : ''}`}
              onClick={() => setVideoCodecPref('vp8')}
            >
              <span>VP8</span>
              <span className="call-diag-btn-sub">Software Libvpx</span>
            </button>
          </div>
        </div>
      )}

      {isVideo && (
        <div className="call-diag-section">
          <div className="call-diag-section-title">
            <span>Bitrate Target Experiment (Target: {videoBitrateTarget} Mbps)</span>
            <span style={{ fontSize: '9.5px', color: '#10b981' }}>GCC Motion Pacing</span>
          </div>

          <div className="call-diag-btn-group">
            <button
              type="button"
              className={`call-diag-btn ${videoBitrateTarget === 4.5 ? 'active' : ''}`}
              onClick={() => setVideoBitrateTarget(4.5)}
            >
              <span>4.5 Mbps</span>
              <span className="call-diag-btn-sub">Baseline Motion</span>
            </button>
            <button
              type="button"
              className={`call-diag-btn ${videoBitrateTarget === 6.0 ? 'active' : ''}`}
              onClick={() => setVideoBitrateTarget(6.0)}
            >
              <span>6.0 Mbps</span>
              <span className="call-diag-btn-sub">Target Smooth 30fps</span>
            </button>
            <button
              type="button"
              className={`call-diag-btn ${videoBitrateTarget === 8.0 ? 'active' : ''}`}
              onClick={() => setVideoBitrateTarget(8.0)}
            >
              <span>8.0 Mbps</span>
              <span className="call-diag-btn-sub">High Budget</span>
            </button>
          </div>
        </div>
      )}

      {isVideo && (
        <div className="call-diag-section">
          <div className="call-diag-section-title">
            <span>SDP Bandwidth Pacing Experiment</span>
            <span style={{ fontSize: '9.5px', color: '#f59e0b' }}>Guardrail #2</span>
          </div>

          <div className="call-diag-btn-group">
            <button
              type="button"
              className={`call-diag-btn ${enableSdpPacing ? 'active' : ''}`}
              onClick={() => setEnableSdpPacing(true)}
            >
              <span>Enabled</span>
              <span className="call-diag-btn-sub">4.5M ceiling / 3.0M start</span>
            </button>
            <button
              type="button"
              className={`call-diag-btn ${!enableSdpPacing ? 'active' : ''}`}
              onClick={() => setEnableSdpPacing(false)}
            >
              <span>Disabled</span>
              <span className="call-diag-btn-sub">Default WebRTC</span>
            </button>
          </div>
        </div>
      )}

      {/* Audio Architecture (Single Output Path & Native Reference) */}
      <div className="call-diag-section">
        <div className="call-diag-section-title">
          <span>Audio Playback Pipeline</span>
          {audioMode === 'native' && <span className="call-diag-badge-ref">Native Reference Default</span>}
        </div>

        <div className="call-diag-btn-group">
          <button
            type="button"
            className={`call-diag-btn ${audioMode === 'native' ? 'active' : ''}`}
            onClick={() => setAudioMode('native')}
          >
            <span>Native WebRTC</span>
            <span className="call-diag-btn-sub">Direct & Unprocessed</span>
          </button>

          <button
            type="button"
            className={`call-diag-btn ${audioMode === 'processed' ? 'active' : ''}`}
            onClick={() => setAudioMode('processed')}
          >
            <span>Voice Engine</span>
            <span className="call-diag-btn-sub">15kHz Wideband EQ</span>
          </button>
        </div>

        <p className="call-diag-info-text">
          {audioMode === 'native'
            ? 'Playing directly via native <audio> element. Web Audio speakers path is disconnected (Zero double audio).'
            : 'Playing through Web Audio 15kHz wideband presence filter and dynamic transparent leveling.'}
        </p>

        {audioMode === 'processed' && (
          <div className="call-diag-btn-group" style={{ marginTop: '8px' }}>
            <button
              type="button"
              className={`call-diag-btn ${voiceExperience === 'natural' ? 'active' : ''}`}
              onClick={() => setVoiceExperience('natural')}
            >
              <span>Natural</span>
            </button>
            <button
              type="button"
              className={`call-diag-btn ${voiceExperience === 'focused' ? 'active' : ''}`}
              onClick={() => setVoiceExperience('focused')}
            >
              <span>Focused</span>
            </button>
            <button
              type="button"
              className={`call-diag-btn ${voiceExperience === 'spatial' ? 'active' : ''}`}
              onClick={() => setVoiceExperience('spatial')}
            >
              <span>Spatial (HRTF)</span>
            </button>
          </div>
        )}
      </div>

      {/* Video Target Selector */}
      {isVideo && (
        <div className="call-diag-section">
          <div className="call-diag-section-title">
            <span>Video Target Quality (maintain-framerate)</span>
          </div>

          <div className="call-diag-btn-group">
            <button
              type="button"
              className={`call-diag-btn ${videoMode === 'auto' ? 'active' : ''}`}
              onClick={() => setVideoMode('auto')}
            >
              <span>Auto</span>
              <span className="call-diag-btn-sub">Adaptive</span>
            </button>
            <button
              type="button"
              className={`call-diag-btn ${videoMode === '1080p' ? 'active' : ''}`}
              onClick={() => setVideoMode('1080p')}
            >
              <span>1080p</span>
              <span className="call-diag-btn-sub">4.5 Mbps</span>
            </button>
            <button
              type="button"
              className={`call-diag-btn ${videoMode === '720p' ? 'active' : ''}`}
              onClick={() => setVideoMode('720p')}
            >
              <span>720p</span>
              <span className="call-diag-btn-sub">2.8 Mbps</span>
            </button>
            <button
              type="button"
              className={`call-diag-btn ${videoMode === 'data-saver' ? 'active' : ''}`}
              onClick={() => setVideoMode('data-saver')}
            >
              <span>Saver</span>
              <span className="call-diag-btn-sub">600 kbps</span>
            </button>
          </div>
        </div>
      )}

      {/* Network & Audio Quality Metrics */}
      <div className="call-diag-section">
        <div className="call-diag-section-title">
          <span>Audio & Transport Telemetry</span>
        </div>

        <table className="call-diag-table">
          <tbody>
            <tr>
              <td>Audio Codec</td>
              <td>{telemetry?.audioCodec || 'Opus'} @ {telemetry?.audioSampleRate ? `${telemetry.audioSampleRate / 1000} kHz` : '48 kHz'}</td>
            </tr>
            <tr>
              <td>Audio Bitrate</td>
              <td>{telemetry?.audioBitrateKbps ? `${telemetry.audioBitrateKbps} kbps` : 'N/A'}</td>
            </tr>
            <tr>
              <td>Audio Packet Loss</td>
              <td>{telemetry ? `${(telemetry.audioPacketLossRate * 100).toFixed(1)}% (${telemetry.audioPacketsLost} lost)` : '0%'}</td>
            </tr>
            <tr>
              <td>Audio Jitter</td>
              <td>{telemetry?.audioJitterMs ? `${telemetry.audioJitterMs.toFixed(1)} ms` : '0 ms'}</td>
            </tr>
            <tr>
              <td>Round-Trip Time (RTT)</td>
              <td>{telemetry?.rttMs ? `${telemetry.rttMs} ms` : 'N/A'}</td>
            </tr>
            <tr>
              <td>Quality Limitation</td>
              <td>{telemetry?.qualityLimitationReason || 'none'}</td>
            </tr>
            <tr>
              <td>ICE Candidate Type</td>
              <td>{telemetry?.iceCandidateType || 'Direct (host/srflx)'}</td>
            </tr>
            {telemetry?.availableOutgoingBitrateKbps ? (
              <tr>
                <td>Available Uplink</td>
                <td>{telemetry.availableOutgoingBitrateKbps} kbps</td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>
    </div>
  );
}

/**
 * Isolated Memoized Video Stage (Guardrail #5).
 * Strictly isolates remote and local <video> DOM elements from call duration timer,
 * user activity auto-hiding state, and telemetry updates so that video playback
 * remains 100% smooth without React reconciliation churn.
/**
 * PHASE 9 FINAL UI LOCK: Dual-View Video Call Presentation System.
 * Supports:
 * - VIEW 1: Stacked two-panel desktop presentation (Tara on top, Adi on bottom).
 * - VIEW 2: Large primary remote video + floating movable local PiP.
 * - Both views share persistent video elements (zero unmounting, zero renegotiation).
 * - Background fill uses same live MediaStream, cover, subdued, NO blur, NO duplicate person effect.
 */
const MemoizedVideoStage = React.memo(function MemoizedVideoStage({
  viewMode,
  aspectMode = 'fit',
  remoteVideoRef,
  remoteBgVideoRef,
  localVideoRef,
  localBgVideoRef,
  isRemoteCameraOff,
  isCameraOff,
  isCameraUnavailable,
  isConnected,
  isReconnecting,
  reconnectStatusMessage,
  isRemoteSpeaking,
  partnerName,
  initial,
  avatar,
  availableCameras,
  activeCameraDeviceId,
  onSwitchCamera
}: {
  viewMode: 'stacked' | 'pip';
  aspectMode?: '4:3' | '1:1' | 'fit' | 'fill' | 'full';
  remoteVideoRef: React.RefObject<HTMLVideoElement | null>;
  remoteBgVideoRef: React.RefObject<HTMLVideoElement | null>;
  localVideoRef: React.RefObject<HTMLVideoElement | null>;
  localBgVideoRef: React.RefObject<HTMLVideoElement | null>;
  isRemoteCameraOff: boolean;
  isCameraOff: boolean;
  isCameraUnavailable: boolean;
  isConnected: boolean;
  isReconnecting: boolean;
  reconnectStatusMessage: string | null;
  isRemoteSpeaking: boolean;
  partnerName: string;
  initial: string;
  avatar?: string;
  availableCameras: MediaDeviceInfo[];
  activeCameraDeviceId: string | null;
  onSwitchCamera: (deviceId: string) => void;
}) {
  const localPanelRef = useRef<HTMLDivElement | null>(null);
  const posRef = useRef<{ x: number; y: number } | null>(null);
  const isDraggingRef = useRef(false);
  const dragStartRef = useRef<{ pointerX: number; pointerY: number; pipX: number; pipY: number } | null>(null);
  const [localAspect, setLocalAspect] = useState<number>(16 / 9);

  // Dynamic aspect ratio calculation from local camera stream
  useEffect(() => {
    const videoEl = localVideoRef.current;
    if (!videoEl) return;
    const updateAspect = () => {
      if (videoEl.videoWidth > 0 && videoEl.videoHeight > 0) {
        setLocalAspect(videoEl.videoWidth / videoEl.videoHeight);
      }
    };
    videoEl.addEventListener('loadedmetadata', updateAspect);
    videoEl.addEventListener('resize', updateAspect);
    updateAspect();
    return () => {
      videoEl.removeEventListener('loadedmetadata', updateAspect);
      videoEl.removeEventListener('resize', updateAspect);
    };
  }, [localVideoRef]);

  // Handle positioning when entering PiP mode vs Stacked mode
  useEffect(() => {
    if (!localPanelRef.current) return;
    if (viewMode === 'pip') {
      const rect = localPanelRef.current.getBoundingClientRect();
      const pipW = rect.width || 320;
      const pipH = rect.height || 180;
      const safeX = Math.max(12, window.innerWidth - pipW - 28);
      const safeY = Math.max(12, window.innerHeight - pipH - 28);
      posRef.current = { x: safeX, y: safeY };
      localPanelRef.current.style.transform = `translate3d(${safeX}px, ${safeY}px, 0)`;
    } else {
      // In Stacked mode, clear inline transform so it naturally docks as the bottom tile
      localPanelRef.current.style.transform = '';
    }
  }, [viewMode]);

  // Window resize handler: clamps PiP within safe boundaries
  useEffect(() => {
    const handleResize = () => {
      if (viewMode !== 'pip' || !localPanelRef.current || !posRef.current) return;
      const rect = localPanelRef.current.getBoundingClientRect();
      const pipW = rect.width || 320;
      const pipH = rect.height || 180;
      const minX = 12;
      const minY = 12;
      const maxX = Math.max(minX, window.innerWidth - pipW - 12);
      const maxY = Math.max(minY, window.innerHeight - pipH - 12);
      const clampedX = Math.max(minX, Math.min(posRef.current.x, maxX));
      const clampedY = Math.max(minY, Math.min(posRef.current.y, maxY));
      posRef.current = { x: clampedX, y: clampedY };
      localPanelRef.current.style.transform = `translate3d(${clampedX}px, ${clampedY}px, 0)`;
    };
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, [viewMode]);

  // Drag handlers for PiP mode (zero React re-renders during dragging)
  const handlePointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    if (viewMode !== 'pip') return;
    if ((e.target as HTMLElement).closest('button')) return;
    if (!localPanelRef.current) return;

    e.preventDefault();
    e.stopPropagation();

    try {
      e.currentTarget.setPointerCapture(e.pointerId);
    } catch {}

    const rect = localPanelRef.current.getBoundingClientRect();
    const currentPos = posRef.current || {
      x: Math.max(12, window.innerWidth - (rect.width || 320) - 28),
      y: Math.max(12, window.innerHeight - (rect.height || 180) - 28)
    };

    dragStartRef.current = {
      pointerX: e.clientX,
      pointerY: e.clientY,
      pipX: currentPos.x,
      pipY: currentPos.y
    };
    isDraggingRef.current = true;
    localPanelRef.current.classList.add('is-dragging');
  };

  const handlePointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (viewMode !== 'pip' || !isDraggingRef.current || !dragStartRef.current || !localPanelRef.current) return;

    const deltaX = e.clientX - dragStartRef.current.pointerX;
    const deltaY = e.clientY - dragStartRef.current.pointerY;
    const targetX = dragStartRef.current.pipX + deltaX;
    const targetY = dragStartRef.current.pipY + deltaY;

    const rect = localPanelRef.current.getBoundingClientRect();
    const pipW = rect.width || 320;
    const pipH = rect.height || 180;

    const minX = 12;
    const minY = 12;
    const maxX = Math.max(minX, window.innerWidth - pipW - 12);
    const maxY = Math.max(minY, window.innerHeight - pipH - 12);

    const clampedX = Math.max(minX, Math.min(targetX, maxX));
    const clampedY = Math.max(minY, Math.min(targetY, maxY));

    posRef.current = { x: clampedX, y: clampedY };
    localPanelRef.current.style.transform = `translate3d(${clampedX}px, ${clampedY}px, 0)`;
  };

  const handlePointerUp = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!isDraggingRef.current) return;
    isDraggingRef.current = false;
    dragStartRef.current = null;
    if (localPanelRef.current) {
      localPanelRef.current.classList.remove('is-dragging');
    }
    try {
      e.currentTarget.releasePointerCapture(e.pointerId);
    } catch {}
  };

  const aspectClass = aspectMode.replace(':', '-');

  return (
    <div className={`call-video-stage view-mode-${viewMode} aspect-${aspectClass}`}>
      <div className="call-stage-presentation-frame">
        {/* REMOTE PARTICIPANT (Tara) */}
        <div className="call-video-panel remote-panel" aria-label={`Live video of ${partnerName}`}>
          {/* Layer 1: Ambient live video background (Same live stream, cover, subdued, NO blur) */}
          <video
            ref={remoteBgVideoRef}
            className={`call-video-bg-live ${isRemoteCameraOff || !isConnected ? 'hidden' : ''}`}
            autoPlay
            playsInline
            muted
            aria-hidden="true"
          />

          {/* Vignette mask to blend boundaries and prevent duplicate person effect */}
          <div className={`call-video-vignette-overlay ${isRemoteCameraOff || !isConnected ? 'hidden' : ''}`} />

          {/* Layer 2: Main Remote Video (100% sharp, uncropped, native aspect ratio) */}
          <video
            ref={remoteVideoRef}
            className={`call-video-fg-live remote-main ${isRemoteCameraOff || !isConnected ? 'hidden' : ''}`}
            autoPlay
            playsInline
            muted
          />

          {/* Remote Camera Off / Connecting Placeholder */}
          {(isRemoteCameraOff || !isConnected) && (
            <div className="call-video-placeholder">
              <div className="call-avatar-wrapper">
                {isConnected && isRemoteSpeaking && <div className="call-pulse-ring speaking" />}
                <div className={`call-avatar ${isRemoteSpeaking ? 'avatar-speaking' : ''}`}>
                  {avatar ? (
                    <img src={avatar} alt={partnerName} />
                  ) : (
                    <span>{initial}</span>
                  )}
                </div>
              </div>
              <h3 className="call-video-placeholder-name">{partnerName}</h3>
              <span className="call-video-placeholder-status">
                {isReconnecting
                  ? (reconnectStatusMessage || 'Connection lost / Trying to reconnect…')
                  : isConnected
                  ? 'Camera is turned off'
                  : 'Connecting video…'}
              </span>
            </div>
          )}

          {/* Remote Identity Badge */}
          <div className="call-panel-identity-label top-user">
            <span className={`call-identity-dot ${isConnected ? 'online' : 'reconnecting'}`} />
            <span className="call-identity-name">{partnerName}</span>
            {isRemoteSpeaking && isConnected && (
              <span className="call-speaking-wave-tag" title="Speaking">
                <span className="call-wave-bar b1" />
                <span className="call-wave-bar b2" />
                <span className="call-wave-bar b3" />
              </span>
            )}
          </div>
        </div>

        {/* LOCAL PARTICIPANT (Adi / You) */}
        <div
          ref={localPanelRef}
          className={`call-video-panel local-panel ${viewMode === 'pip' ? 'is-pip-window' : 'is-stacked-tile'}`}
          style={viewMode === 'pip' ? { aspectRatio: `${localAspect}` } : undefined}
          onPointerDown={viewMode === 'pip' ? handlePointerDown : undefined}
          onPointerMove={viewMode === 'pip' ? handlePointerMove : undefined}
          onPointerUp={viewMode === 'pip' ? handlePointerUp : undefined}
          onPointerCancel={viewMode === 'pip' ? handlePointerUp : undefined}
          aria-label="Your live video preview"
          role={viewMode === 'pip' ? 'region' : undefined}
        >
          {/* In Stacked Mode: Ambient live video background (Same live stream, cover, subdued, mirrored, NO blur) */}
          <video
            ref={localBgVideoRef}
            className={`call-video-bg-live local ${isCameraOff || isCameraUnavailable || viewMode === 'pip' ? 'hidden' : ''}`}
            autoPlay
            playsInline
            muted
            aria-hidden="true"
          />

          {/* Vignette mask for stacked mode */}
          <div className={`call-video-vignette-overlay ${isCameraOff || isCameraUnavailable || viewMode === 'pip' ? 'hidden' : ''}`} />

          {/* Main Local Video (100% sharp, mirrored, complete native frame) */}
          <video
            ref={localVideoRef}
            className={`call-video-fg-live local-main ${isCameraOff || isCameraUnavailable ? 'hidden' : ''}`}
            autoPlay
            playsInline
            muted
          />

          {/* Camera Off / Unavailable Placeholder */}
          {(isCameraOff || isCameraUnavailable) && (
            <div className={`call-video-placeholder ${viewMode === 'pip' ? 'in-pip' : ''}`}>
              <div className="call-avatar-wrapper">
                <div className="call-avatar">
                  <span>Y</span>
                </div>
              </div>
              <h3 className="call-video-placeholder-name">You</h3>
              <span className="call-video-placeholder-status">
                {isCameraUnavailable ? '🔴 Camera unavailable' : 'Camera is turned off'}
              </span>
            </div>
          )}

          {/* Local Identity Badge, Camera Switch, Drag Handle */}
          <div className={`call-panel-identity-label ${viewMode === 'pip' ? 'pip-header' : 'bottom-user'}`}>
            <div className="call-pip-badge">
              <span className="call-identity-dot online" />
              <span className="call-identity-name">You</span>
            </div>
            <div className="call-panel-actions">
              {availableCameras.length > 1 && !isCameraOff && !isCameraUnavailable && (
                <button
                  type="button"
                  className="call-panel-switch-cam-btn"
                  onClick={(e) => {
                    e.stopPropagation();
                    const currentIndex = availableCameras.findIndex(c => c.deviceId === activeCameraDeviceId);
                    const nextIndex = (currentIndex + 1) % availableCameras.length;
                    onSwitchCamera(availableCameras[nextIndex].deviceId);
                  }}
                  title="Switch camera"
                  aria-label="Switch camera"
                >
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                    <polyline points="23 4 23 10 17 10" />
                    <polyline points="1 20 1 14 7 14" />
                    <path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15" />
                  </svg>
                </button>
              )}
              {viewMode === 'pip' && (
                <div className="call-pip-drag-handle" title="Drag to move">
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor">
                    <circle cx="8" cy="6" r="2" />
                    <circle cx="16" cy="6" r="2" />
                    <circle cx="8" cy="12" r="2" />
                    <circle cx="16" cy="12" r="2" />
                    <circle cx="8" cy="18" r="2" />
                    <circle cx="16" cy="18" r="2" />
                  </svg>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
});

export default function ActiveCallPanel() {
  const {
    activeCall,
    callState,
    toggleMute,
    toggleCamera,
    switchCamera,
    captureSnapshot,
    isCameraOff,
    isRemoteCameraOff,
    isCameraUnavailable,
    availableCameras,
    activeCameraDeviceId,
    reconnectStatusMessage,
    hangup,
    voiceExperience,
    setVoiceExperience,
    callQuality,
    minimizeCall,
    isRemoteSpeaking,
    availableOutputDevices,
    selectedOutputDeviceId,
    setAudioOutputDevice,
    audioPipelineMode,
    setAudioPipelineMode,
    videoQualityMode,
    setVideoQualityMode,
    realtimeTelemetry,
    showDiagnosticsPanel,
    setShowDiagnosticsPanel,
    videoCodecPreference,
    setVideoCodecPreference,
    enableSdpBandwidthPacing,
    setEnableSdpBandwidthPacing,
    videoBitrateTargetMbps,
    setVideoBitrateTargetMbps,
    // Phase 10: Screen Sharing
    isScreenSharing,
    startScreenSharing,
    stopScreenSharing
  } = useCall();

  const containerRef = useRef<HTMLDivElement | null>(null);
  const localVideoRef = useRef<HTMLVideoElement | null>(null);
  const localBgVideoRef = useRef<HTMLVideoElement | null>(null);
  const remoteVideoRef = useRef<HTMLVideoElement | null>(null);
  const remoteBgVideoRef = useRef<HTMLVideoElement | null>(null);

  const [isFullscreen, setIsFullscreen] = useState(false);
  const [viewMode, setViewMode] = useState<'stacked' | 'pip'>('stacked');
  const [aspectMode, setAspectMode] = useState<'4:3' | '1:1' | 'fit' | 'fill' | 'full'>('fit');
  const [showControls, setShowControls] = useState(true);
  const [snapshotToast, setSnapshotToast] = useState(false);
  const controlsTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const isConnected = callState === 'CONNECTED';
  const isReconnecting = callState === 'RECONNECTING';
  const isScreenShareSupported = typeof navigator !== 'undefined' && !!navigator.mediaDevices && typeof (navigator.mediaDevices as any).getDisplayMedia === 'function';

  // In-call connection restored UX (Phase 9 Final)
  const prevCallStateRef = useRef<string>(callState);
  const [showRestoredToast, setShowRestoredToast] = useState(false);

  useEffect(() => {
    if (prevCallStateRef.current === 'RECONNECTING' && callState === 'CONNECTED') {
      setShowRestoredToast(true);
      const timer = setTimeout(() => setShowRestoredToast(false), 3000);
      return () => clearTimeout(timer);
    }
    prevCallStateRef.current = callState;
  }, [callState]);

  // Bind video elements when in video call
  useEffect(() => {
    if (activeCall?.callType === 'video') {
      if (localBgVideoRef.current) {
        rtcService.bindLocalVideoElement(localBgVideoRef.current);
      }
      if (localVideoRef.current) {
        rtcService.bindLocalVideoElement(localVideoRef.current);
      }
      if (remoteBgVideoRef.current) {
        rtcService.bindRemoteVideoElement(remoteBgVideoRef.current);
      }
      if (remoteVideoRef.current) {
        rtcService.bindRemoteVideoElement(remoteVideoRef.current);
      }
    }
    const localEl = localVideoRef.current;
    const localBgEl = localBgVideoRef.current;
    const remoteEl = remoteVideoRef.current;
    const remoteBgEl = remoteBgVideoRef.current;
    return () => {
      if (localEl) rtcService.unbindLocalVideoElement(localEl);
      if (localBgEl) rtcService.unbindLocalVideoElement(localBgEl);
      if (remoteEl) rtcService.unbindRemoteVideoElement(remoteEl);
      if (remoteBgEl) rtcService.unbindRemoteVideoElement(remoteBgEl);
    };
  }, [activeCall?.callType, callState]);

  // Fullscreen change listener
  useEffect(() => {
    const handleFsChange = () => {
      setIsFullscreen(!!document.fullscreenElement);
    };
    document.addEventListener('fullscreenchange', handleFsChange);
    return () => document.removeEventListener('fullscreenchange', handleFsChange);
  }, []);

  // Controls auto-hiding during active video calls (3.5s inactivity)
  const handleUserActivity = useCallback(() => {
    setShowControls(true);
    if (controlsTimeoutRef.current) {
      clearTimeout(controlsTimeoutRef.current);
    }
    if (activeCall?.callType === 'video' && isConnected) {
      controlsTimeoutRef.current = setTimeout(() => {
        setShowControls(false);
      }, 3500);
    }
  }, [activeCall?.callType, isConnected]);

  useEffect(() => {
    if (activeCall?.callType === 'video' && isConnected) {
      handleUserActivity();
    } else {
      setShowControls(true);
      if (controlsTimeoutRef.current) clearTimeout(controlsTimeoutRef.current);
    }
    return () => {
      if (controlsTimeoutRef.current) clearTimeout(controlsTimeoutRef.current);
    };
  }, [activeCall?.callType, isConnected, handleUserActivity]);

  const toggleFullscreen = async () => {
    try {
      if (!document.fullscreenElement) {
        if (containerRef.current?.requestFullscreen) {
          await containerRef.current.requestFullscreen();
          setIsFullscreen(true);
        }
      } else {
        if (document.exitFullscreen) {
          await document.exitFullscreen();
          setIsFullscreen(false);
        }
      }
    } catch (e) {
      console.warn('Fullscreen toggle failed:', e);
    }
  };

  const handleTakeSnapshot = async () => {
    const blob = await captureSnapshot();
    if (blob) {
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `wibby-call-snapshot-${Date.now()}.jpg`;
      a.click();
      URL.revokeObjectURL(url);
      setSnapshotToast(true);
      setTimeout(() => setSnapshotToast(false), 2500);
    }
  };

  if (!activeCall) return null;

  const partnerName = activeCall.remoteUser.name || 'Partner';
  const initial = partnerName.charAt(0).toUpperCase();
  const isVideo = activeCall.callType === 'video';

  // -------------------------------------------------------------
  // VIDEO CALL LAYOUT (Phase 9)
  // -------------------------------------------------------------
  if (isVideo) {
    return (
      <div
        ref={containerRef}
        className={`call-overlay call-video-overlay ${isFullscreen ? 'is-fullscreen' : ''}`}
        role="dialog"
        aria-modal="true"
        aria-labelledby="active-video-call-title"
        onMouseMove={handleUserActivity}
        onTouchStart={handleUserActivity}
        onPointerDown={handleUserActivity}
      >
        <MemoizedVideoStage
          viewMode={viewMode}
          aspectMode={aspectMode}
          remoteVideoRef={remoteVideoRef}
          remoteBgVideoRef={remoteBgVideoRef}
          localVideoRef={localVideoRef}
          localBgVideoRef={localBgVideoRef}
          isRemoteCameraOff={isRemoteCameraOff}
          isCameraOff={isCameraOff}
          isCameraUnavailable={isCameraUnavailable}
          isConnected={isConnected}
          isReconnecting={isReconnecting}
          reconnectStatusMessage={reconnectStatusMessage}
          isRemoteSpeaking={isRemoteSpeaking}
          partnerName={partnerName}
          initial={initial}
          avatar={activeCall.remoteUser.avatar || undefined}
          availableCameras={availableCameras}
          activeCameraDeviceId={activeCameraDeviceId}
          onSwitchCamera={switchCamera}
        />

          {/* Top Bar Header (Auto-Hiding) */}
          <div className={`call-video-top-bar ${showControls ? 'visible' : 'hidden'}`}>
            <div className="call-video-header-info">
              <span className="call-video-partner-name">{partnerName}</span>
              <span className="call-status-divider">•</span>
              <span className="call-duration">{formatCallDuration(activeCall.duration)}</span>
              <span className="call-status-divider">•</span>
              {/* Human-Readable In-Call Status Pill (Phase 9 Final) */}
              <span className={`call-header-status-pill ${isReconnecting ? 'reconnecting' : showRestoredToast ? 'restored' : callQuality === 'poor' ? 'unstable' : 'connected'}`}>
                {isReconnecting ? (
                  <>
                    <span className="call-status-dot yellow">●</span>
                    <span>Reconnecting…</span>
                  </>
                ) : showRestoredToast ? (
                  <>
                    <span className="call-status-dot green">●</span>
                    <span>Connection restored</span>
                  </>
                ) : callQuality === 'poor' ? (
                  <>
                    <span className="call-status-dot yellow">●</span>
                    <span>Connection unstable</span>
                  </>
                ) : isConnected ? (
                  <>
                    <span className="call-status-dot green">●</span>
                    <span>Connected</span>
                  </>
                ) : (
                  <>
                    <span className="call-status-dot yellow">●</span>
                    <span>Connecting…</span>
                  </>
                )}
              </span>
              {isRemoteSpeaking && isConnected && (
                <>
                  <span className="call-status-divider">•</span>
                  <span className="call-speaking-tag active">Speaking</span>
                </>
              )}
            </div>

            <div className="call-video-top-actions">
              {/* Presentation Aspect Ratio Switcher (Bug #2) */}
              <div className="call-aspect-switcher" role="group" aria-label="Video presentation size">
                {(['4:3', '1:1', 'fit', 'fill', 'full'] as const).map(mode => (
                  <button
                    key={mode}
                    type="button"
                    className={`call-aspect-btn ${aspectMode === mode ? 'active' : ''}`}
                    onClick={() => setAspectMode(mode)}
                    title={`Switch presentation to ${mode}`}
                  >
                    {mode === 'fit' ? 'Fit' : mode === 'fill' ? 'Fill' : mode === 'full' ? 'Full' : mode}
                  </button>
                ))}
              </div>

              {/* Developer Diagnostics Button (Keeps technical stats developer-only) */}
              {isConnected && (
                <button
                  type="button"
                  className={`call-quality-badge-btn ${showDiagnosticsPanel ? 'active' : ''}`}
                  onClick={(e) => {
                    e.stopPropagation();
                    setShowDiagnosticsPanel(!showDiagnosticsPanel);
                  }}
                  title="Developer Diagnostics & Quality Telemetry"
                  aria-label="Developer Diagnostics & Quality Telemetry"
                >
                  <span className={`call-quality-dot ${callQuality}`} />
                  <span>
                    {realtimeTelemetry?.sendWidth && realtimeTelemetry?.sendHeight
                      ? `${realtimeTelemetry.sendHeight}p`
                      : callQuality === 'excellent' ? '1080p' : 'HD'}
                  </span>
                </button>
              )}

              {/* Snapshot Button */}
              {isConnected && (
                <button
                  type="button"
                  className="call-icon-btn"
                  onClick={handleTakeSnapshot}
                  title="Take snapshot photo"
                  aria-label="Take snapshot"
                >
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z" />
                    <circle cx="12" cy="13" r="4" />
                  </svg>
                </button>
              )}

              {/* View Layout Toggle Button */}
              <button
                type="button"
                className={`call-icon-btn ${viewMode === 'pip' ? 'active' : ''}`}
                onClick={() => setViewMode(prev => prev === 'stacked' ? 'pip' : 'stacked')}
                title={viewMode === 'stacked' ? 'Switch to Main + PiP view' : 'Switch to Stacked view'}
                aria-label={viewMode === 'stacked' ? 'Switch to Main + PiP view' : 'Switch to Stacked view'}
              >
                {viewMode === 'stacked' ? (
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <rect x="3" y="3" width="18" height="8" rx="2" />
                    <rect x="3" y="13" width="18" height="8" rx="2" />
                  </svg>
                ) : (
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <rect x="2" y="3" width="20" height="18" rx="2" />
                    <rect x="13" y="12" width="7" height="7" rx="1.5" fill="currentColor" fillOpacity="0.3" />
                  </svg>
                )}
              </button>

              {/* Fullscreen Button */}
              <button
                type="button"
                className="call-icon-btn"
                onClick={toggleFullscreen}
                title={isFullscreen ? 'Exit fullscreen' : 'Fullscreen'}
                aria-label={isFullscreen ? 'Exit fullscreen' : 'Fullscreen'}
              >
                {isFullscreen ? (
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <polyline points="4 14 10 14 10 20" />
                    <polyline points="20 10 14 10 14 4" />
                    <line x1="14" y1="10" x2="21" y2="3" />
                    <line x1="3" y1="21" x2="10" y2="14" />
                  </svg>
                ) : (
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <polyline points="15 3 21 3 21 9" />
                    <polyline points="9 21 3 21 3 15" />
                    <line x1="21" y1="3" x2="14" y2="10" />
                    <line x1="3" y1="21" x2="10" y2="14" />
                  </svg>
                )}
              </button>

              {/* Minimize Button */}
              <button
                type="button"
                className="call-icon-btn"
                onClick={minimizeCall}
                title="Minimize call to chat"
                aria-label="Minimize call to floating capsule"
              >
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <line x1="5" y1="12" x2="19" y2="12" />
                </svg>
              </button>
            </div>
          </div>

          {/* Realtime Call Diagnostics & Quality Modal (Developer-Only) */}
          {showDiagnosticsPanel && (
            <ErrorBoundary fallback={null}>
              <CallDiagnosticsModal
                telemetry={realtimeTelemetry}
                audioMode={audioPipelineMode}
                setAudioMode={setAudioPipelineMode}
                videoMode={videoQualityMode}
                setVideoMode={setVideoQualityMode}
                voiceExperience={voiceExperience}
                setVoiceExperience={setVoiceExperience}
                videoCodecPref={videoCodecPreference}
                setVideoCodecPref={setVideoCodecPreference}
                enableSdpPacing={enableSdpBandwidthPacing}
                setEnableSdpPacing={setEnableSdpBandwidthPacing}
                videoBitrateTarget={videoBitrateTargetMbps}
                setVideoBitrateTarget={setVideoBitrateTargetMbps}
                isVideo={true}
                onClose={() => setShowDiagnosticsPanel(false)}
              />
            </ErrorBoundary>
          )}

          {/* Dedicated In-Call Connection Status Overlay Card (Phase 9 Final) */}
          {isReconnecting && (
            <div className="call-status-card warning" role="alert">
              <div className="call-status-card-header">
                <span className="call-status-card-spinner" />
                <span className="call-status-card-title">Reconnecting…</span>
                <span className="call-status-dots-anim">
                  <span>•</span><span>•</span><span>•</span>
                </span>
              </div>
              <p className="call-status-card-subtitle">
                {reconnectStatusMessage || 'Connection lost / Trying to reconnect…'}
              </p>
            </div>
          )}

          {/* Connection Restored Temporary Toast Notification */}
          {showRestoredToast && (
            <div className="call-status-toast success" role="status">
              <span className="call-status-toast-dot green">●</span>
              <span>Connection restored</span>
            </div>
          )}

          {/* Connection Unstable Notification Banner */}
          {isConnected && callQuality === 'poor' && (
            <div className="call-status-unstable-pill" role="status">
              <span className="call-status-toast-dot yellow">●</span>
              <span>Connection unstable — Adjusting video…</span>
            </div>
          )}

          {/* Microphone Unavailable Alert */}
          {activeCall?.error && activeCall.error.toLowerCase().includes('mic') && (
            <div className="call-status-toast error" role="alert">
              <span>🔴 Microphone unavailable</span>
            </div>
          )}

          {/* Snapshot saved toast notification */}
          {snapshotToast && (
            <div className="call-snapshot-toast" role="status">
              📸 Snapshot saved to downloads
            </div>
          )}

          {/* Bottom Floating Control Bar (Auto-Hiding) */}
          <div className={`call-video-controls-bar ${showControls ? 'visible' : 'hidden'}`}>
            {/* View Layout Toggle Button (Phase 9 Final UI Lock) */}
            <div className="call-control-item">
              <button
                type="button"
                className={`call-btn view-ctrl ${viewMode === 'pip' ? 'active' : ''}`}
                onClick={() => setViewMode(prev => prev === 'stacked' ? 'pip' : 'stacked')}
                title={viewMode === 'stacked' ? 'Switch to Main + PiP view' : 'Switch to Stacked view'}
                aria-label={viewMode === 'stacked' ? 'Switch to Main + PiP view' : 'Switch to Stacked view'}
              >
                {viewMode === 'stacked' ? (
                  <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <rect x="3" y="3" width="18" height="8" rx="2" />
                    <rect x="3" y="13" width="18" height="8" rx="2" />
                  </svg>
                ) : (
                  <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <rect x="2" y="3" width="20" height="18" rx="2" />
                    <rect x="13" y="12" width="7" height="7" rx="1.5" fill="currentColor" fillOpacity="0.3" />
                  </svg>
                )}
              </button>
              <span className="call-btn-label">{viewMode === 'stacked' ? 'Stacked' : 'Main + PiP'}</span>
            </div>

            {/* Camera Toggle Button */}
            <div className="call-control-item">
              <button
                type="button"
                className={`call-btn video-ctrl ${isCameraOff || isCameraUnavailable ? 'muted' : 'active'}`}
                onClick={toggleCamera}
                disabled={isCameraUnavailable}
                title={isCameraOff ? 'Turn on camera' : 'Turn off camera'}
                aria-label={isCameraOff ? 'Turn on camera' : 'Turn off camera'}
              >
                {isCameraOff || isCameraUnavailable ? (
                  <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <line x1="1" y1="1" x2="23" y2="23" />
                    <path d="M21 21H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h3m3-3h6l2 3h4a2 2 0 0 1 2 2v9.34m-7.72-2.06a4 4 0 1 1-5.56-5.56" />
                  </svg>
                ) : (
                  <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <polygon points="23 7 16 12 23 17 23 7" />
                    <rect x="1" y="5" width="15" height="14" rx="2" ry="2" />
                  </svg>
                )}
              </button>
              <span className="call-btn-label">{isCameraOff ? 'Camera off' : 'Camera on'}</span>
            </div>

            {/* Screen Share Button (Phase 10 - Supported browsers only) */}
            {isScreenShareSupported && (
              <div className="call-control-item">
                <button
                  type="button"
                  id="screen-share-btn"
                  className={`call-btn screen-share ${isScreenSharing ? 'active' : ''}`}
                  onClick={() => isScreenSharing ? stopScreenSharing() : startScreenSharing()}
                  title={isScreenSharing ? 'Stop screen sharing' : 'Share screen'}
                  aria-label={isScreenSharing ? 'Stop screen sharing' : 'Share screen'}
                >
                  {isScreenSharing ? (
                    /* Stop-share icon: monitor with X */
                    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <rect x="2" y="3" width="20" height="14" rx="2" />
                      <line x1="8" y1="21" x2="16" y2="21" />
                      <line x1="12" y1="17" x2="12" y2="21" />
                      <line x1="9" y1="8" x2="15" y2="14" />
                      <line x1="15" y1="8" x2="9" y2="14" />
                    </svg>
                  ) : (
                    /* Share icon: monitor with upward arrow */
                    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <rect x="2" y="3" width="20" height="14" rx="2" />
                      <line x1="8" y1="21" x2="16" y2="21" />
                      <line x1="12" y1="17" x2="12" y2="21" />
                      <polyline points="8 9 12 5 16 9" />
                      <line x1="12" y1="5" x2="12" y2="13" />
                    </svg>
                  )}
                </button>
                <span className="call-btn-label">{isScreenSharing ? 'Stop screen' : 'Screen'}</span>
              </div>
            )}

            {/* Microphone Mute Button */}
            <div className="call-control-item">
              <button
                type="button"
                className={`call-btn mute ${activeCall.isMuted ? 'active' : ''}`}
                onClick={toggleMute}
                title={activeCall.isMuted ? 'Unmute microphone' : 'Mute microphone'}
                aria-label={activeCall.isMuted ? 'Unmute microphone' : 'Mute microphone'}
              >
                {activeCall.isMuted ? (
                  <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <line x1="1" y1="1" x2="23" y2="23" />
                    <path d="M9 9v3a3 3 0 0 0 5.12 2.12M15 9.34V4a3 3 0 0 0-5.94-.6" />
                    <path d="M17 16.95A7 7 0 0 1 5 12v-2m14 0v2a7 7 0 0 1-.11 1.23" />
                    <line x1="12" y1="19" x2="12" y2="23" />
                    <line x1="8" y1="23" x2="16" y2="23" />
                  </svg>
                ) : (
                  <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z" />
                    <path d="M19 10v2a7 7 0 0 1-14 0v-2" />
                    <line x1="12" y1="19" x2="12" y2="23" />
                    <line x1="8" y1="23" x2="16" y2="23" />
                  </svg>
                )}
              </button>
              <span className="call-btn-label">{activeCall.isMuted ? 'Unmute' : 'Mute'}</span>
            </div>

            {/* End Call Button */}
            <div className="call-control-item">
              <button
                type="button"
                className="call-btn hangup"
                onClick={hangup}
                title="End video call"
                aria-label="End video call"
              >
                <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M10.68 13.31a16 16 0 0 0 3.41 2.6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7 2 2 0 0 1 1.72 2v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.42 19.42 0 0 1-3.33-2.67m-2.67-3.34a19.79 19.79 0 0 1-3.07-8.63A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91" />
                  <line x1="23" y1="1" x2="1" y2="23" />
                </svg>
              </button>
              <span className="call-btn-label">End</span>
            </div>
          </div>
        </div>
      );
    }

  // -------------------------------------------------------------
  // VOICE CALL LAYOUT (Preserved Phase 8 Voice Experience)
  // -------------------------------------------------------------
  return (
    <div className="call-overlay" role="dialog" aria-modal="true" aria-labelledby="active-call-title">
      <div className="call-card">
        {/* Top Bar: Diagnostics & Minimize to Floating Capsule */}
        <div className="call-card-top-bar" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', width: '100%' }}>
          {isConnected ? (
            <button
              type="button"
              className={`call-quality-badge-btn ${showDiagnosticsPanel ? 'active' : ''}`}
              onClick={() => setShowDiagnosticsPanel(!showDiagnosticsPanel)}
              title="Quality Diagnostics"
            >
              <span className={`call-quality-dot ${callQuality}`} />
              <span>Diagnostics</span>
            </button>
          ) : <div />}

          <button
            type="button"
            className="call-minimize-btn"
            onClick={minimizeCall}
            aria-label="Minimize call to floating capsule"
            title="Minimize call to chat"
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="4 14 10 14 10 20" />
              <polyline points="20 10 14 10 14 4" />
              <line x1="14" y1="10" x2="21" y2="3" />
              <line x1="3" y1="21" x2="10" y2="14" />
            </svg>
          </button>
        </div>

        {/* Realtime Call Diagnostics & Quality Modal */}
        {showDiagnosticsPanel && (
          <ErrorBoundary fallback={null}>
            <CallDiagnosticsModal
              telemetry={realtimeTelemetry}
              audioMode={audioPipelineMode}
              setAudioMode={setAudioPipelineMode}
              videoMode={videoQualityMode}
              setVideoMode={setVideoQualityMode}
              voiceExperience={voiceExperience}
              setVoiceExperience={setVoiceExperience}
              videoCodecPref={videoCodecPreference}
              setVideoCodecPref={setVideoCodecPreference}
              enableSdpPacing={enableSdpBandwidthPacing}
              setEnableSdpPacing={setEnableSdpBandwidthPacing}
              videoBitrateTarget={videoBitrateTargetMbps}
              setVideoBitrateTarget={setVideoBitrateTargetMbps}
              isVideo={false}
              onClose={() => setShowDiagnosticsPanel(false)}
            />
          </ErrorBoundary>
        )}

        {/* Reconnecting Status Notification Bar */}
        {isReconnecting && (
          <div className="call-card-reconnecting-bar" role="alert">
            <span className="call-reconnecting-spinner" />
            <span>{reconnectStatusMessage || 'Connection lost / Reconnecting...'}</span>
          </div>
        )}

        {/* Avatar with dynamic speaking indicator */}
        <div className="call-avatar-wrapper">
          {isConnected && isRemoteSpeaking && <div className="call-pulse-ring speaking" />}
          <div className={`call-avatar ${isRemoteSpeaking ? 'avatar-speaking' : ''}`}>
            {activeCall.remoteUser.avatar ? (
              <img src={activeCall.remoteUser.avatar} alt={partnerName} />
            ) : (
              <span>{initial}</span>
            )}
          </div>
        </div>

        <h2 id="active-call-title" className="call-name">{partnerName}</h2>

        <div className={`call-status-badge ${isConnected ? 'connected' : isReconnecting ? 'reconnecting' : 'connecting'}`}>
          {isReconnecting ? (
            <span>Reconnecting...</span>
          ) : isConnected ? (
            <>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5" />
                <path d="M19.07 4.93a10 10 0 0 1 0 14.14M15.54 8.46a5 5 0 0 1 0 7.07" />
              </svg>
              <span className="call-duration">{formatCallDuration(activeCall.duration)}</span>
              <span className="call-status-divider">•</span>
              <span className={`call-speaking-tag ${isRemoteSpeaking ? 'active' : ''}`}>
                {isRemoteSpeaking ? 'Speaking' : 'Listening'}
              </span>
              <span className="call-status-divider">•</span>
              <span className={`call-quality-dot ${callQuality}`} title={`Audio Quality: ${callQuality}`}>
                {callQuality === 'excellent' && 'HD'}
                {callQuality === 'degraded' && 'Degraded'}
                {callQuality === 'poor' && 'Poor'}
              </span>
            </>
          ) : (
            <span>Connecting...</span>
          )}
        </div>

        {/* Wibby Voice Engine 1.0 Experience Selector (Natural vs Focused vs Spatial) */}
        {isConnected && (
          <div className="call-voice-exp-selector" role="group" aria-label="Voice Experience">
            <button
              type="button"
              className={`call-voice-exp-btn ${voiceExperience === 'natural' ? 'active' : ''}`}
              onClick={() => setVoiceExperience('natural')}
              title="Natural: Pure native WebRTC audio baseline"
              aria-pressed={voiceExperience === 'natural'}
            >
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z"/>
                <path d="M19 10v2a7 7 0 0 1-14 0v-2"/>
              </svg>
              <span>Natural</span>
            </button>

            <button
              type="button"
              className={`call-voice-exp-btn ${voiceExperience === 'focused' ? 'active' : ''}`}
              onClick={() => setVoiceExperience('focused')}
              title="Focused: Vocal clarity filter & gentle dynamics leveling"
              aria-pressed={voiceExperience === 'focused'}
            >
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                <line x1="4" y1="21" x2="4" y2="14" />
                <line x1="4" y1="10" x2="4" y2="3" />
                <line x1="12" y1="21" x2="12" y2="12" />
                <line x1="12" y1="8" x2="12" y2="3" />
                <line x1="20" y1="21" x2="20" y2="16" />
                <line x1="20" y1="12" x2="20" y2="3" />
                <line x1="1" y1="14" x2="7" y2="14" />
                <line x1="9" y1="8" x2="15" y2="8" />
                <line x1="17" y1="16" x2="23" y2="16" />
              </svg>
              <span>Focused</span>
            </button>

            <button
              type="button"
              className={`call-voice-exp-btn ${voiceExperience === 'spatial' ? 'active' : ''}`}
              onClick={() => setVoiceExperience('spatial')}
              title="Spatial: Natural front conversational presence (mono-safe HRTF)"
              aria-pressed={voiceExperience === 'spatial'}
            >
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="12" cy="12" r="10" />
                <circle cx="12" cy="12" r="3" />
                <path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1 4-10z"/>
              </svg>
              <span>Spatial</span>
            </button>
          </div>
        )}

        {/* Audio Output Device Selector */}
        {isConnected && availableOutputDevices.length > 1 && (
          <div className="call-device-selector-wrap">
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M3 18v-6a9 9 0 0 1 18 0v6" />
              <path d="M21 19a2 2 0 0 1-2 2h-1a2 2 0 0 1-2-2v-3a2 2 0 0 1 2-2h3zM3 19a2 2 0 0 0 2 2h1a2 2 0 0 0 2-2v-3a2 2 0 0 0-2-2H3z" />
            </svg>
            <select
              className="call-device-select"
              value={selectedOutputDeviceId || ''}
              onChange={(e) => setAudioOutputDevice(e.target.value)}
              title="Select audio output device"
            >
              <option value="">Default Speaker / Headphones</option>
              {availableOutputDevices.map((d) => (
                <option key={d.deviceId} value={d.deviceId}>
                  {d.label || `Device ${d.deviceId.slice(0, 5)}`}
                </option>
              ))}
            </select>
          </div>
        )}

        {/* Action Controls */}
        <div className="call-actions">
          {/* Mute Button */}
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
            <button
              className={`call-btn mute ${activeCall.isMuted ? 'active' : ''}`}
              onClick={toggleMute}
              aria-label={activeCall.isMuted ? 'Unmute microphone' : 'Mute microphone'}
              title={activeCall.isMuted ? 'Unmute' : 'Mute'}
            >
              {activeCall.isMuted ? (
                <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <line x1="1" y1="1" x2="23" y2="23" />
                  <path d="M9 9v3a3 3 0 0 0 5.12 2.12M15 9.34V4a3 3 0 0 0-5.94-.6" />
                  <path d="M17 16.95A7 7 0 0 1 5 12v-2m14 0v2a7 7 0 0 1-.11 1.23" />
                  <line x1="12" y1="19" x2="12" y2="23" />
                  <line x1="8" y1="23" x2="16" y2="23" />
                </svg>
              ) : (
                <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z" />
                  <path d="M19 10v2a7 7 0 0 1-14 0v-2" />
                  <line x1="12" y1="19" x2="12" y2="23" />
                  <line x1="8" y1="23" x2="16" y2="23" />
                </svg>
              )}
            </button>
            <span className="call-btn-label">{activeCall.isMuted ? 'Unmute' : 'Mute'}</span>
          </div>

          {/* End Call Button */}
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
            <button
              className="call-btn hangup"
              onClick={hangup}
              aria-label="End call"
              title="End call"
            >
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <path d="M10.68 13.31a16 16 0 0 0 3.41 2.6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7 2 2 0 0 1 1.72 2v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.42 19.42 0 0 1-3.33-2.67m-2.67-3.34a19.79 19.79 0 0 1-3.07-8.63A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91" />
                <line x1="23" y1="1" x2="1" y2="23" />
              </svg>
            </button>
            <span className="call-btn-label">End</span>
          </div>
        </div>
      </div>
    </div>
  );
}
