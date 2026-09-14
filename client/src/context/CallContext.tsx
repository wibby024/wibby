import React, { createContext, useContext, useState, useEffect, useRef, useCallback } from 'react';
import { useSocket } from './SocketContext';
import {
  rtcService,
  type VoiceExperienceMode,
  type CallAudioQuality,
  type AudioPipelineMode,
  type VideoQualityMode,
  type RealtimeCallTelemetry
} from '../services/rtcService';
import { type VideoCodecPreference, fetchServerIceConfig } from '../config/rtcConfig';
import { ringtoneService } from '../services/ringtoneService';
import { auth } from '../lib/firebase';

export type CallState =
  | 'IDLE'
  | 'OUTGOING_CALLING'
  | 'INCOMING_RINGING'
  | 'CONNECTING'
  | 'CONNECTED'
  | 'RECONNECTING'
  | 'ENDING'
  | 'ENDED'
  | 'FAILED'
  | 'BUSY';

export interface ActiveCall {
  callId: string;
  sessionId: string;
  conversationId: string;
  callType: 'voice' | 'video';
  isCaller: boolean;
  remoteUser: {
    id: string;
    name: string;
    avatar?: string | null;
  };
  duration: number;
  isMuted: boolean;
  isCameraOff?: boolean;
  isRemoteCameraOff?: boolean;
  isCameraUnavailable?: boolean;
  error?: string | null;
}

export interface RecoverableCallInfo {
  callId: string;
  conversationId: string;
  callType: 'voice' | 'video';
  partnerName: string;
  partnerAvatar?: string | null;
  reconnectUntil: number;
}

interface CallContextType {
  callState: CallState;
  activeCall: ActiveCall | null;
  callType: 'voice' | 'video';
  sessionId: string | null;
  startCall: (conversationId: string, partner: any, type?: 'voice' | 'video') => Promise<void>;
  acceptCall: () => Promise<void>;
  rejectCall: (reason?: string) => void;
  cancelCall: () => void;
  hangup: () => void;
  toggleMute: () => void;
  toggleCamera: () => void;
  switchCamera: (deviceId: string) => Promise<boolean>;
  captureSnapshot: () => Promise<Blob | null>;
  isCameraOff: boolean;
  isRemoteCameraOff: boolean;
  isCameraUnavailable: boolean;
  availableCameras: MediaDeviceInfo[];
  activeCameraDeviceId: string | null;
  reconnectStatusMessage: string | null;
  errorMessage: string | null;
  clearError: () => void;
  voiceExperience: VoiceExperienceMode;
  setVoiceExperience: (mode: VoiceExperienceMode) => void;
  callQuality: CallAudioQuality;
  isMinimized: boolean;
  minimizeCall: () => void;
  expandCall: () => void;
  isRemoteSpeaking: boolean;
  availableOutputDevices: MediaDeviceInfo[];
  selectedOutputDeviceId: string | null;
  setAudioOutputDevice: (deviceId: string) => Promise<void>;
  recoverableCall: RecoverableCallInfo | null;
  resumeRecoverableCall: () => Promise<void>;
  dismissRecoverableCall: () => void;
  audioPipelineMode: AudioPipelineMode;
  setAudioPipelineMode: (mode: AudioPipelineMode) => void;
  videoQualityMode: VideoQualityMode;
  setVideoQualityMode: (mode: VideoQualityMode) => Promise<void>;
  realtimeTelemetry: RealtimeCallTelemetry | null;
  showDiagnosticsPanel: boolean;
  setShowDiagnosticsPanel: (show: boolean) => void;
  videoCodecPreference: VideoCodecPreference;
  setVideoCodecPreference: (pref: VideoCodecPreference) => Promise<void>;
  enableSdpBandwidthPacing: boolean;
  setEnableSdpBandwidthPacing: (enabled: boolean) => void;
  videoBitrateTargetMbps: number;
  setVideoBitrateTargetMbps: (mbps: number) => Promise<void>;
  // Phase 10: Screen Sharing
  isScreenSharing: boolean;
  startScreenSharing: () => Promise<void>;
  stopScreenSharing: () => Promise<void>;
}

const CallContext = createContext<CallContextType | null>(null);

export function useCall() {
  const context = useContext(CallContext);
  if (!context) {
    throw new Error('useCall must be used within a CallProvider');
  }
  return context;
}

export function CallProvider({ children }: { children: React.ReactNode }) {
  const { socket, isConnected } = useSocket();

  const [callState, setCallState] = useState<CallState>('IDLE');
  const [activeCall, setActiveCall] = useState<ActiveCall | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [reconnectStatusMessage, setReconnectStatusMessage] = useState<string | null>(null);

  // Video State (Phase 9)
  const [isCameraOff, setIsCameraOff] = useState<boolean>(false);
  const [isRemoteCameraOff, setIsRemoteCameraOff] = useState<boolean>(false);
  const [isCameraUnavailable, setIsCameraUnavailable] = useState<boolean>(false);
  const [availableCameras, setAvailableCameras] = useState<MediaDeviceInfo[]>([]);
  const [activeCameraDeviceId, setActiveCameraDeviceId] = useState<string | null>(null);

  // Recovery State
  const [recoverableCall, setRecoverableCall] = useState<RecoverableCallInfo | null>(null);

  // Floating Call State
  const [isMinimized, setIsMinimized] = useState<boolean>(false);

  // Speaking indicator (from rtcService RMS analysis)
  const [isRemoteSpeaking, setIsRemoteSpeaking] = useState<boolean>(false);

  // Audio output device routing
  const [availableOutputDevices, setAvailableOutputDevices] = useState<MediaDeviceInfo[]>([]);
  const [selectedOutputDeviceId, setSelectedOutputDeviceId] = useState<string | null>(null);

  // Wibby Voice Engine: Voice Experience (Natural vs Focused vs Spatial Presence)
  const [voiceExperience, setVoiceExperienceState] = useState<VoiceExperienceMode>(() => {
    try {
      const saved = localStorage.getItem('wibby_voice_experience') as VoiceExperienceMode;
      return (saved === 'natural' || saved === 'focused' || saved === 'spatial') ? saved : 'natural';
    } catch {
      return 'natural';
    }
  });

  // Wibby Voice Engine: Real-time Audio Quality (derived from RTP packet loss & jitter)
  const [callQuality, setCallQuality] = useState<CallAudioQuality>('excellent');

  // Wibby Video & Audio Quality Modes (Phase 9 Final)
  const [audioPipelineMode, setAudioPipelineModeState] = useState<AudioPipelineMode>('native');
  const [videoQualityMode, setVideoQualityModeState] = useState<VideoQualityMode>('auto');
  const [realtimeTelemetry, setRealtimeTelemetry] = useState<RealtimeCallTelemetry | null>(null);
  const [showDiagnosticsPanel, setShowDiagnosticsPanel] = useState<boolean>(false);
  const [videoCodecPreference, setVideoCodecPreferenceState] = useState<VideoCodecPreference>(() =>
    (rtcService.getVideoCodecPreference() || 'auto') as VideoCodecPreference
  );

  // Phase 10: Screen Sharing
  const [isScreenSharing, setIsScreenSharing] = useState<boolean>(false);
  const [enableSdpBandwidthPacing, setEnableSdpBandwidthPacingState] = useState<boolean>(true);
  const [videoBitrateTargetMbps, setVideoBitrateTargetMbpsState] = useState<number>(6.0);

  const showDiagnosticsPanelRef = useRef(false);
  showDiagnosticsPanelRef.current = showDiagnosticsPanel;

  useEffect(() => {
    rtcService.setOnTelemetryCallback((telemetry) => {
      // Guardrail #5: Strictly isolate React re-rendering.
      // Only push telemetry into React state when developer diagnostics panel is actively open!
      if (showDiagnosticsPanelRef.current) {
        setRealtimeTelemetry(telemetry);
      }
    });
    return () => {
      rtcService.setOnTelemetryCallback(null);
    };
  }, []);

  const setShowDiagnosticsPanelCallback = useCallback((show: boolean) => {
    setShowDiagnosticsPanel(show);
    if (show) {
      const latest = rtcService.getLatestTelemetry();
      if (latest) setRealtimeTelemetry(latest);
    }
  }, []);

  const setAudioPipelineMode = useCallback((mode: AudioPipelineMode) => {
    setAudioPipelineModeState(mode);
    rtcService.setAudioPipelineMode(mode);
  }, []);

  const setVideoQualityMode = useCallback(async (mode: VideoQualityMode) => {
    setVideoQualityModeState(mode);
    await rtcService.setVideoQualityMode(mode);
  }, []);

  const setVideoCodecPreference = useCallback(async (pref: VideoCodecPreference) => {
    setVideoCodecPreferenceState(pref);
    await rtcService.setVideoCodecPreference(pref);
  }, []);

  const setEnableSdpBandwidthPacing = useCallback((enabled: boolean) => {
    setEnableSdpBandwidthPacingState(enabled);
    rtcService.setEnableSdpBandwidthPacing(enabled);
  }, []);

  const setVideoBitrateTargetMbps = useCallback(async (mbps: number) => {
    setVideoBitrateTargetMbpsState(mbps);
    await rtcService.setVideoBitrateTargetMbps(mbps);
  }, []);

  const activeCallRef = useRef<ActiveCall | null>(null);
  activeCallRef.current = activeCall;

  const callStateRef = useRef<CallState>('IDLE');
  callStateRef.current = callState;

  const sessionIdRef = useRef<string | null>(null);

  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const errorTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const isStartingCallRef = useRef(false);
  const inviteCountRef = useRef<Record<string, number>>({});

  // Incoming call ringtone controller
  useEffect(() => {
    if (callState === 'INCOMING_RINGING') {
      const callId = activeCallRef.current?.callId || 'call_incoming';
      ringtoneService.start(callId);
    } else {
      ringtoneService.stop(activeCallRef.current?.callId);
    }
  }, [callState]);

  const clearTimer = useCallback(() => {
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
  }, []);

  const clearError = useCallback(() => {
    if (errorTimeoutRef.current) {
      clearTimeout(errorTimeoutRef.current);
      errorTimeoutRef.current = null;
    }
    setErrorMessage(null);
  }, []);

  const minimizeCall = useCallback(() => {
    setIsMinimized(true);
  }, []);

  const expandCall = useCallback(() => {
    setIsMinimized(false);
  }, []);

  const setAudioOutputDevice = useCallback(async (deviceId: string) => {
    setSelectedOutputDeviceId(deviceId);
    await rtcService.setAudioOutputDevice(deviceId);
  }, []);

  const setVoiceExperience = useCallback((mode: VoiceExperienceMode) => {
    setVoiceExperienceState(mode);
    try {
      localStorage.setItem('wibby_voice_experience', mode);
    } catch {}
    rtcService.setVoiceExperience(mode);
  }, []);

  const handleQualityChange = useCallback((quality: CallAudioQuality) => {
    setCallQuality(quality);
  }, []);

  const handleSpeakingChange = useCallback((speaking: boolean) => {
    setIsRemoteSpeaking(speaking);
  }, []);

  const showTransientError = useCallback((msg: string, durationMs = 4000, rawError?: any) => {
    if (rawError) {
      console.error('[WIBBY WEBRTC ERROR] Call operation failed:', {
        userMessage: msg,
        errorName: rawError?.name,
        errorMessage: rawError?.message,
        errorConstraint: rawError?.constraint,
        stack: rawError?.stack,
        raw: rawError
      });
    }

    if (errorTimeoutRef.current) {
      clearTimeout(errorTimeoutRef.current);
      errorTimeoutRef.current = null;
    }

    setErrorMessage(msg);

    errorTimeoutRef.current = setTimeout(() => {
      setErrorMessage(null);
      errorTimeoutRef.current = null;
    }, durationMs);
  }, []);

  const formatMicrophoneError = useCallback((err: any): string => {
    const errorName = err?.name;
    if (errorName === 'NotAllowedError' || errorName === 'PermissionDeniedError') {
      return 'Microphone or camera permission denied. Please allow access in browser settings.';
    }
    if (errorName === 'NotFoundError' || errorName === 'DevicesNotFoundError') {
      return 'No microphone or camera found. Please connect an input device.';
    }
    if (errorName === 'NotReadableError' || errorName === 'TrackStartError') {
      return 'Microphone or camera is already in use by another application.';
    }
    if (errorName === 'OverconstrainedError') {
      return 'Device does not support the requested media configuration.';
    }
    if (errorName === 'SecurityError') {
      return 'Media access is restricted by browser security policies.';
    }
    if (errorName === 'AbortError') {
      return 'Media access was aborted or interrupted.';
    }
    if (errorName === 'NotSupportedError') {
      return 'Media access is not supported by your browser.';
    }
    if (errorName === 'InvalidAccessError') {
      return 'Track is already configured for this call.';
    }
    if (errorName === 'InvalidStateError') {
      return 'Call connection was in an invalid state. Please try again.';
    }
    return 'Could not access microphone or camera';
  }, []);

  const resetCallState = useCallback((delayMs: number = 0) => {
    clearTimer();
    ringtoneService.stop();
    // Phase 10: stop screen sharing cleanly before full cleanup
    if (rtcService.isScreenSharingActive()) {
      rtcService.stopScreenSharing().catch(() => {});
      setIsScreenSharing(false);
    }
    rtcService.cleanup();
    setCallQuality('excellent');
    setIsMinimized(false);
    setIsRemoteSpeaking(false);
    setIsCameraOff(false);
    setIsRemoteCameraOff(false);
    setIsCameraUnavailable(false);
    setReconnectStatusMessage(null);
    sessionIdRef.current = null;
    sessionStorage.removeItem('wibby_active_call_id');

    if (delayMs > 0) {
      setTimeout(() => {
        setActiveCall(null);
        setCallState('IDLE');
      }, delayMs);
    } else {
      setActiveCall(null);
      setCallState('IDLE');
    }
  }, [clearTimer]);

  // Audio output device & camera enumeration when connected
  useEffect(() => {
    if (callState === 'CONNECTED') {
      rtcService.getAudioOutputDevices().then(devices => {
        setAvailableOutputDevices(devices);
      }).catch(() => {});

      if (activeCall?.callType === 'video') {
        rtcService.getAvailableCameras().then(cameras => {
          setAvailableCameras(cameras);
        }).catch(() => {});
      }
    }
  }, [callState, activeCall?.callType]);

  // WebRTC ICE Candidate & State Handlers
  const handleIceCandidate = useCallback((candidate: RTCIceCandidateInit) => {
    const currentCall = activeCallRef.current;
    if (socket && currentCall) {
      socket.emit('call:ice-candidate', {
        callId: currentCall.callId,
        sessionId: sessionIdRef.current,
        candidate
      });
    }
  }, [socket]);

  const handleConnectionStateChange = useCallback((state: RTCPeerConnectionState) => {
    console.log('[WIBBY CALL] WebRTC peerConnection state:', state);
    if (state === 'connected') {
      setCallState('CONNECTED');
      setReconnectStatusMessage(null);
    } else if (state === 'disconnected') {
      console.warn('[WIBBY CALL] WebRTC peerConnection temporarily disconnected');
      setCallState('RECONNECTING');
      setReconnectStatusMessage('Connection lost / Reconnecting...');
    } else if (state === 'failed') {
      setCallState('FAILED');
      showTransientError('Call connection failed. Please try again.', 4000);
      resetCallState(2500);
    } else if (state === 'closed') {
      setCallState('ENDED');
      resetCallState(1500);
    }
  }, [resetCallState, showTransientError]);

  const handleIceConnectionStateChange = useCallback((state: RTCIceConnectionState) => {
    console.log('[WIBBY CALL] WebRTC ICE connection state:', state);
    if (state === 'connected' || state === 'completed') {
      setCallState('CONNECTED');
      setReconnectStatusMessage(null);
    } else if (state === 'disconnected') {
      setCallState('RECONNECTING');
      setReconnectStatusMessage('Connection lost / Reconnecting...');
    } else if (state === 'failed') {
      setCallState('FAILED');
      showTransientError('Network connection lost during call.', 4000);
      resetCallState(2500);
    }
  }, [resetCallState, showTransientError]);

  const handleRemoteAudioActive = useCallback(() => {
    console.log('[WIBBY CALL] Remote audio confirmed active and playing');
    setCallState(prev => (prev === 'CONNECTING' || prev === 'RECONNECTING') ? 'CONNECTED' : prev);
    setReconnectStatusMessage(null);
  }, []);

  const handleIceRestartNeeded = useCallback((offer: RTCSessionDescriptionInit) => {
    const currentCall = activeCallRef.current;
    if (socket && currentCall) {
      console.log('[WIBBY CALL] Transmitting ICE restart offer to peer:', currentCall.callId);
      socket.emit('call:offer', {
        callId: currentCall.callId,
        sessionId: sessionIdRef.current,
        sdp: offer
      });
    }
  }, [socket]);

  // Active call duration timer loop
  useEffect(() => {
    if (callState === 'CONNECTED') {
      clearTimer();
      timerRef.current = setInterval(() => {
        setActiveCall(prev => {
          if (!prev) return null;
          return { ...prev, duration: prev.duration + 1 };
        });
      }, 1000);
    } else {
      clearTimer();
    }
    return () => clearTimer();
  }, [callState, clearTimer]);

  // Check for recoverable calls & sync dynamic ICE servers on socket connect / reconnect
  useEffect(() => {
    if (!socket || !isConnected) return;

    if (auth.currentUser) {
      auth.currentUser.getIdToken().then(token => {
        fetchServerIceConfig(token).catch(() => {});
      }).catch(() => {});
    }

    socket.emit('call:check-recoverable');

    const handleRecoverable = (data: {
      callId: string;
      conversationId: string;
      callType: 'voice' | 'video';
      partner: { id: string; name: string; avatar?: string | null };
      reconnectUntil: number;
    }) => {
      console.log('[WIBBY CALL] Received call:recoverable:', data);
      const storedCallId = sessionStorage.getItem('wibby_active_call_id');

      // If user had this exact call in current tab before refresh/drop, auto-resume
      if (storedCallId === data.callId && callStateRef.current === 'IDLE') {
        console.log('[WIBBY CALL] Auto-resuming recent call from tab refresh:', data.callId);
        resumeCallWithInfo({
          callId: data.callId,
          conversationId: data.conversationId,
          callType: data.callType,
          partnerName: data.partner?.name || 'Partner',
          partnerAvatar: data.partner?.avatar,
          reconnectUntil: data.reconnectUntil
        });
      } else {
        setRecoverableCall({
          callId: data.callId,
          conversationId: data.conversationId,
          callType: data.callType,
          partnerName: data.partner?.name || 'Partner',
          partnerAvatar: data.partner?.avatar,
          reconnectUntil: data.reconnectUntil
        });
      }
    };

    socket.on('call:recoverable', handleRecoverable);
    return () => {
      socket.off('call:recoverable', handleRecoverable);
    };
  }, [socket, isConnected]);

  // Socket Signaling Event Listeners
  useEffect(() => {
    if (!socket) return;

    // 1. Incoming Call Invite
    const handleCallInvite = (data: {
      callId: string;
      sessionId?: string;
      conversationId: string;
      callerId: string;
      callerName: string;
      callerAvatar?: string | null;
      callType?: 'voice' | 'video';
    }) => {
      inviteCountRef.current[data.callId] = (inviteCountRef.current[data.callId] || 0) + 1;
      console.log(`[WIBBY CALL][INVITE] callId=${data.callId} inviteCount=${inviteCountRef.current[data.callId]}`, data);

      if (activeCallRef.current || callStateRef.current !== 'IDLE') {
        socket.emit('call:busy', { callId: data.callId, sessionId: data.sessionId });
        return;
      }

      const type = data.callType || 'voice';
      setActiveCall({
        callId: data.callId,
        sessionId: data.sessionId || '',
        conversationId: data.conversationId,
        callType: type,
        isCaller: false,
        remoteUser: {
          id: data.callerId,
          name: data.callerName || 'Partner',
          avatar: data.callerAvatar
        },
        duration: 0,
        isMuted: false,
        isCameraOff: false,
        isRemoteCameraOff: false,
        isCameraUnavailable: false
      });
      setCallState('INCOMING_RINGING');
    };

    // 2. Call Ringing Acknowledgement (Caller receives)
    const handleCallRinging = (data: { callId: string }) => {
      if (activeCallRef.current?.callId === data.callId) {
        console.log('[WIBBY CALL] Call is ringing on recipient device');
      }
    };

    // 3. Call Accepted
    const handleCallAccepted = async (data: { callId: string; calleeSessionId?: string }) => {
      console.log('[WIBBY CALL] Received call:accepted:', data);
      const currentCall = activeCallRef.current;
      if (!currentCall || currentCall.callId !== data.callId) return;

      clearError();
      setCallState('CONNECTING');

      // If we are the caller, we initiate the WebRTC offer
      if (currentCall.isCaller) {
        try {
          console.log('[WIBBY CALL] Caller creating WebRTC Offer...');
          const offer = await rtcService.createOffer();
          socket.emit('call:offer', {
            callId: currentCall.callId,
            sessionId: sessionIdRef.current,
            sdp: offer
          });
        } catch (err: any) {
          console.error('[WIBBY CALL] Error creating offer:', err);
          showTransientError('Failed to establish media connection.', 4000, err);
          resetCallState(2000);
        }
      }
    };

    // 4. WebRTC Offer received (Callee receives or reconnected peer receives)
    const handleCallOffer = async (data: { callId: string; sdp: RTCSessionDescriptionInit; sessionId?: string }) => {
      console.log('[WIBBY CALL] Received call:offer:', data.callId);
      const currentCall = activeCallRef.current;
      if (!currentCall || currentCall.callId !== data.callId) return;

      try {
        setCallState('CONNECTING');
        await rtcService.setRemoteDescription(data.sdp);
        const answer = await rtcService.createAnswer();
        socket.emit('call:answer', {
          callId: currentCall.callId,
          sessionId: sessionIdRef.current,
          sdp: answer
        });
      } catch (err: any) {
        console.error('[WIBBY CALL] Error handling offer:', err);
        showTransientError('Failed to connect call media.', 4000, err);
        resetCallState(2000);
      }
    };

    // 5. WebRTC Answer received (Caller receives)
    const handleCallAnswer = async (data: { callId: string; sdp: RTCSessionDescriptionInit; sessionId?: string }) => {
      console.log('[WIBBY CALL] Received call:answer:', data.callId);
      const currentCall = activeCallRef.current;
      if (!currentCall || currentCall.callId !== data.callId) return;

      try {
        await rtcService.setRemoteDescription(data.sdp);
      } catch (err: any) {
        console.error('[WIBBY CALL] Error setting remote description (answer):', err);
        showTransientError('Failed to finalize media connection.', 4000, err);
        resetCallState(2000);
      }
    };

    // 6. ICE Candidate received
    const handleRemoteIceCandidate = async (data: { callId: string; candidate: RTCIceCandidateInit; sessionId?: string }) => {
      const currentCall = activeCallRef.current;
      if (!currentCall || currentCall.callId !== data.callId) return;

      if (data.candidate) {
        await rtcService.addIceCandidate(data.candidate);
      }
    };

    // 7. Call Ended / Cancelled / Declined
    const handleCallEnded = (data: { callId: string; reason?: string; status?: string }) => {
      console.log('[WIBBY CALL] Received call:ended:', data);
      const currentCall = activeCallRef.current;
      if (currentCall && currentCall.callId !== data.callId) return;

      setCallState('ENDED');
      if (data.reason === 'declined') {
        showTransientError('Call was declined', 4000);
      } else if (data.reason === 'cancelled') {
        showTransientError('Call was cancelled', 4000);
      } else if (data.reason === 'busy') {
        showTransientError('User is busy on another call', 4000);
      } else if (data.reason === 'disconnected') {
        showTransientError('Call ended: Partner disconnected', 4000);
      }

      resetCallState(1800);
    };

    // 8. User Busy
    const handleCallBusy = (data: { callId: string; message?: string }) => {
      console.log('[WIBBY CALL] Received call:busy');
      if (activeCallRef.current && activeCallRef.current.callId !== data.callId) return;
      setCallState('BUSY');
      showTransientError(data.message || 'User is currently on another call', 4000);
      resetCallState(3000);
    };

    // 9. Call Failed
    const handleCallFailed = (data: { callId?: string; message?: string }) => {
      console.log('[WIBBY CALL] Received call:failed:', data);
      if (data.callId && activeCallRef.current && activeCallRef.current.callId !== data.callId) return;
      setCallState('FAILED');
      showTransientError(data.message || 'Unable to place call', 4000);
      resetCallState(2500);
    };

    // 10. Remote Camera Toggle (Phase 9)
    const handleCameraToggle = (data: { callId: string; isCameraOff: boolean }) => {
      console.log('[WIBBY CALL] Received call:camera-toggle:', data);
      if (activeCallRef.current?.callId !== data.callId) return;
      setIsRemoteCameraOff(data.isCameraOff);
      setActiveCall(prev => prev ? { ...prev, isRemoteCameraOff: data.isCameraOff } : null);
    };

    // 11. Peer Reconnecting (e.g. Network Drop or Tab Closed, Phase 9)
    const handlePeerReconnecting = (data: { callId: string; message?: string }) => {
      console.log('[WIBBY CALL] Received call:peer-reconnecting:', data);
      if (activeCallRef.current?.callId !== data.callId) return;
      setCallState('RECONNECTING');
      setReconnectStatusMessage(data.message || 'Connection lost / Reconnecting...');
    };

    // 12. Peer Reconnected (Phase 9)
    const handlePeerReconnected = async (data: {
      callId: string;
      callType: 'voice' | 'video';
      callerSessionId: string;
      calleeSessionId: string;
    }) => {
      console.log('[WIBBY CALL] Received call:peer-reconnected:', data);
      const currentCall = activeCallRef.current;
      if (!currentCall || currentCall.callId !== data.callId) return;

      setReconnectStatusMessage(null);
      setCallState('CONNECTING');

      // Re-trigger offer from caller side
      if (currentCall.isCaller) {
        try {
          console.log('[WIBBY CALL] Reconnected caller creating WebRTC offer...');
          const offer = await rtcService.createOffer();
          socket.emit('call:offer', {
            callId: currentCall.callId,
            sessionId: sessionIdRef.current,
            sdp: offer
          });
        } catch (err) {
          console.error('[WIBBY CALL] Failed to create offer after peer reconnected:', err);
        }
      }
    };

    // 13. Session Superseded (Old tab transport protection, Phase 9)
    const handleSessionSuperseded = (data: { callId: string }) => {
      console.warn('[WIBBY CALL] Session superseded by recovered instance; closing transport gracefully:', data.callId);
      clearTimer();
      rtcService.cleanup();
      setActiveCall(null);
      setCallState('IDLE');
      sessionStorage.removeItem('wibby_active_call_id');
    };

    socket.on('call:invite', handleCallInvite);
    socket.on('call:ringing', handleCallRinging);
    socket.on('call:accepted', handleCallAccepted);
    socket.on('call:offer', handleCallOffer);
    socket.on('call:answer', handleCallAnswer);
    socket.on('call:ice-candidate', handleRemoteIceCandidate);
    socket.on('call:ended', handleCallEnded);
    socket.on('call:busy', handleCallBusy);
    socket.on('call:failed', handleCallFailed);
    socket.on('call:camera-toggle', handleCameraToggle);
    socket.on('call:peer-reconnecting', handlePeerReconnecting);
    socket.on('call:peer-reconnected', handlePeerReconnected);
    socket.on('call:session-superseded', handleSessionSuperseded);

    return () => {
      socket.off('call:invite', handleCallInvite);
      socket.off('call:ringing', handleCallRinging);
      socket.off('call:accepted', handleCallAccepted);
      socket.off('call:offer', handleCallOffer);
      socket.off('call:answer', handleCallAnswer);
      socket.off('call:ice-candidate', handleRemoteIceCandidate);
      socket.off('call:ended', handleCallEnded);
      socket.off('call:busy', handleCallBusy);
      socket.off('call:failed', handleCallFailed);
      socket.off('call:camera-toggle', handleCameraToggle);
      socket.off('call:peer-reconnecting', handlePeerReconnecting);
      socket.off('call:peer-reconnected', handlePeerReconnected);
      socket.off('call:session-superseded', handleSessionSuperseded);
    };
  }, [socket, resetCallState, clearError, showTransientError, clearTimer]);

  // Clean up on component unmount
  useEffect(() => {
    return () => {
      clearTimer();
      clearError();
      ringtoneService.destroy();
      rtcService.cleanup();
    };
  }, [clearTimer, clearError]);

  // Phase 10: Register screen-sharing-ended callback so OS Stop Sharing syncs React state
  useEffect(() => {
    rtcService.setOnScreenSharingEndedCallback(() => {
      setIsScreenSharing(false);
      // If a pending stop offer was generated (display audio was removed), emit it now
      const pendingOffer = (rtcService as any)._pendingStopOffer;
      if (pendingOffer && socket && activeCallRef.current) {
        socket.emit('call:offer', {
          callId: activeCallRef.current.callId,
          sessionId: sessionIdRef.current,
          sdp: pendingOffer
        });
        delete (rtcService as any)._pendingStopOffer;
      }
    });
    return () => {
      rtcService.setOnScreenSharingEndedCallback(null);
    };
  }, [socket]);

  /**
   * Action: Start Voice or Video Call (Caller)
   */
  const startCall = async (conversationId: string, partner: any, type: 'voice' | 'video' = 'voice') => {
    if (!socket || !isConnected) {
      showTransientError('Cannot make a call while disconnected from server', 4000);
      return;
    }
    if (callState !== 'IDLE' || isStartingCallRef.current) {
      console.warn('[WIBBY CALL] Cannot start call: already in progress');
      return;
    }

    isStartingCallRef.current = true;
    const callId = `call_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
    const freshSessionId = `sess_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
    sessionIdRef.current = freshSessionId;
    sessionStorage.setItem('wibby_active_call_id', callId);

    try {
      clearError();
      rtcService.unlockRemoteAudio();

      // 1. Acquire local media (audio + video, or audio-only fallback)
      const { stream, cameraUnavailable } = await rtcService.acquireLocalMedia(type);

      // 2. Initialize PeerConnection
      rtcService.initPeerConnection(
        callId,
        stream,
        handleIceCandidate,
        handleConnectionStateChange,
        handleIceConnectionStateChange,
        handleRemoteAudioActive,
        handleIceRestartNeeded,
        handleQualityChange,
        voiceExperience,
        handleSpeakingChange,
        type,
        freshSessionId
      );

      // 3. Set Outgoing Calling State
      const partnerName = partner?.displayName || partner?.display_name || partner?.name || partner?.username || 'Partner';
      const partnerAvatar = partner?.avatarUrl || partner?.avatar || null;
      const newCall: ActiveCall = {
        callId,
        sessionId: freshSessionId,
        conversationId,
        callType: type,
        isCaller: true,
        remoteUser: {
          id: partner?.firebaseUid || '',
          name: partnerName,
          avatar: partnerAvatar
        },
        duration: 0,
        isMuted: false,
        isCameraOff: cameraUnavailable,
        isRemoteCameraOff: false,
        isCameraUnavailable: cameraUnavailable
      };

      setActiveCall(newCall);
      setIsCameraOff(cameraUnavailable);
      setIsCameraUnavailable(cameraUnavailable);
      setIsRemoteCameraOff(false);
      setCallState('OUTGOING_CALLING');

      // 4. Emit call invite to server
      socket.emit('call:invite', {
        callId,
        sessionId: freshSessionId,
        conversationId,
        callType: type
      });
      console.log(`[WIBBY CALL] Outgoing ${type} call initiated: ${callId}`);
    } catch (err: any) {
      console.error('[WIBBY CALL] Error starting call:', err);
      const msg = formatMicrophoneError(err);
      showTransientError(msg, 4000, err);
      resetCallState(0);
    } finally {
      isStartingCallRef.current = false;
    }
  };

  /**
   * Action: Accept Incoming Call (Callee)
   */
  const acceptCall = async () => {
    const currentCall = activeCallRef.current;
    if (!socket || !currentCall || callState !== 'INCOMING_RINGING') return;

    try {
      clearError();
      console.log('[WIBBY CALL] Accepting call:', currentCall.callId);

      rtcService.unlockRemoteAudio();

      const freshSessionId = `sess_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
      sessionIdRef.current = freshSessionId;
      sessionStorage.setItem('wibby_active_call_id', currentCall.callId);

      // 1. Acquire local media upon acceptance
      const { stream, cameraUnavailable } = await rtcService.acquireLocalMedia(currentCall.callType);

      // 2. Initialize PeerConnection
      rtcService.initPeerConnection(
        currentCall.callId,
        stream,
        handleIceCandidate,
        handleConnectionStateChange,
        handleIceConnectionStateChange,
        handleRemoteAudioActive,
        handleIceRestartNeeded,
        handleQualityChange,
        voiceExperience,
        handleSpeakingChange,
        currentCall.callType,
        freshSessionId
      );

      setIsCameraOff(cameraUnavailable);
      setIsCameraUnavailable(cameraUnavailable);
      setActiveCall(prev => prev ? {
        ...prev,
        sessionId: freshSessionId,
        isCameraOff: cameraUnavailable,
        isCameraUnavailable: cameraUnavailable
      } : null);

      setCallState('CONNECTING');

      // 3. Emit accept event to server
      socket.emit('call:accept', {
        callId: currentCall.callId,
        sessionId: freshSessionId
      });
    } catch (err: any) {
      console.error('[WIBBY CALL] Error accepting call:', err);
      const msg = formatMicrophoneError(err);
      showTransientError(msg, 4000, err);
      rejectCall('mic_permission_denied');
    }
  };

  /**
   * Action: Reject / Decline Incoming Call
   */
  const rejectCall = (reason: string = 'declined') => {
    clearError();
    const currentCall = activeCallRef.current;
    if (socket && currentCall) {
      socket.emit('call:reject', {
        callId: currentCall.callId,
        sessionId: sessionIdRef.current,
        reason
      });
    }
    setCallState('ENDED');
    resetCallState(800);
  };

  /**
   * Action: Cancel Outgoing Call (before callee accepts)
   */
  const cancelCall = () => {
    clearError();
    const currentCall = activeCallRef.current;
    if (socket && currentCall) {
      socket.emit('call:hangup', {
        callId: currentCall.callId,
        sessionId: sessionIdRef.current,
        reason: 'cancelled'
      });
    }
    setCallState('ENDED');
    resetCallState(800);
  };

  /**
   * Action: Hang Up Active / Connecting Call
   */
  const hangup = () => {
    clearError();
    const currentCall = activeCallRef.current;
    if (socket && currentCall) {
      socket.emit('call:hangup', {
        callId: currentCall.callId,
        sessionId: sessionIdRef.current,
        reason: 'hangup'
      });
    }
    setCallState('ENDED');
    resetCallState(800);
  };

  /**
   * Action: Toggle Local Microphone Mute
   */
  const toggleMute = () => {
    setActiveCall(prev => {
      if (!prev) return null;
      const nextMuted = !prev.isMuted;
      rtcService.setMuted(nextMuted);

      if (socket) {
        socket.emit('call:mute', {
          callId: prev.callId,
          sessionId: sessionIdRef.current,
          isMuted: nextMuted
        });
      }

      return { ...prev, isMuted: nextMuted };
    });
  };

  /**
   * Action: Toggle Local Camera (Phase 9)
   */
  const toggleCamera = () => {
    if (isCameraUnavailable) {
      showTransientError('Camera is unavailable on this device.', 3000);
      return;
    }
    const nextOff = !isCameraOff;
    rtcService.setCameraEnabled(!nextOff);
    setIsCameraOff(nextOff);
    setActiveCall(prev => prev ? { ...prev, isCameraOff: nextOff } : null);

    if (socket && activeCallRef.current) {
      socket.emit('call:camera-toggle', {
        callId: activeCallRef.current.callId,
        sessionId: sessionIdRef.current,
        isCameraOff: nextOff
      });
    }
  };

  /**
   * Action: Switch Camera Device (Phase 9)
   */
  const switchCamera = async (deviceId: string): Promise<boolean> => {
    const success = await rtcService.switchCamera(deviceId);
    if (success) {
      setActiveCameraDeviceId(deviceId);
    }
    return success;
  };

  /**
   * Action: Capture Photo Snapshot (Phase 9)
   */
  const captureSnapshot = async (): Promise<Blob | null> => {
    return rtcService.captureSnapshot();
  };

  /**
   * Phase 10: Start Screen Sharing.
   * Calls rtcService.startScreenSharing with a renegotiation callback that emits
   * call:offer through the existing signaling path when display audio is present.
   */
  const startScreenSharing = async () => {
    if (!socket || !activeCallRef.current) return;

    const handleNegotiationOffer = (offer: RTCSessionDescriptionInit) => {
      if (!socket || !activeCallRef.current) return;
      console.log('[WIBBY CALL] Screen share: emitting renegotiation offer for display audio');
      socket.emit('call:offer', {
        callId: activeCallRef.current.callId,
        sessionId: sessionIdRef.current,
        sdp: offer
      });
    };

    const result = await rtcService.startScreenSharing(handleNegotiationOffer);
    if (result === 'started') {
      setIsScreenSharing(true);
    }
    // 'cancelled' and 'error' are intentionally silent — call continues normally
  };

  /**
   * Phase 10: Stop Screen Sharing.
   * Restores camera, removes display audio sender (if any), and triggers
   * renegotiation via the pending offer mechanism.
   */
  const stopScreenSharing = async () => {
    await rtcService.stopScreenSharing();
    setIsScreenSharing(false);
    // Emit re-offer if display audio sender was removed (stored as _pendingStopOffer)
    const pendingOffer = (rtcService as any)._pendingStopOffer;
    if (pendingOffer && socket && activeCallRef.current) {
      console.log('[WIBBY CALL] Screen share stopped: emitting renegotiation offer to remove display audio');
      socket.emit('call:offer', {
        callId: activeCallRef.current.callId,
        sessionId: sessionIdRef.current,
        sdp: pendingOffer
      });
      delete (rtcService as any)._pendingStopOffer;
    }
  };

  /**
   * Helper: Rehydrate an existing ongoing call (Persistent Recovery)
   */
  const resumeCallWithInfo = async (info: RecoverableCallInfo) => {
    if (!socket || !isConnected) return;

    try {
      clearError();
      rtcService.unlockRemoteAudio();

      const freshSessionId = `sess_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
      sessionIdRef.current = freshSessionId;
      sessionStorage.setItem('wibby_active_call_id', info.callId);

      const { stream, cameraUnavailable } = await rtcService.acquireLocalMedia(info.callType);

      rtcService.initPeerConnection(
        info.callId,
        stream,
        handleIceCandidate,
        handleConnectionStateChange,
        handleIceConnectionStateChange,
        handleRemoteAudioActive,
        handleIceRestartNeeded,
        handleQualityChange,
        voiceExperience,
        handleSpeakingChange,
        info.callType,
        freshSessionId
      );

      const recoveredCall: ActiveCall = {
        callId: info.callId,
        sessionId: freshSessionId,
        conversationId: info.conversationId,
        callType: info.callType,
        isCaller: true, // Will initiate fresh offer when peer-reconnected fires
        remoteUser: {
          id: '',
          name: info.partnerName,
          avatar: info.partnerAvatar || null
        },
        duration: 0,
        isMuted: false,
        isCameraOff: cameraUnavailable,
        isRemoteCameraOff: false,
        isCameraUnavailable: cameraUnavailable
      };

      setActiveCall(recoveredCall);
      setIsCameraOff(cameraUnavailable);
      setIsCameraUnavailable(cameraUnavailable);
      setRecoverableCall(null);
      setCallState('CONNECTING');
      setReconnectStatusMessage('Reconnecting...');

      socket.emit('call:reconnect', {
        callId: info.callId,
        sessionId: freshSessionId
      });
      console.log(`[WIBBY CALL] Reconnecting to call ${info.callId} with new session ${freshSessionId}`);
    } catch (err: any) {
      console.error('[WIBBY CALL] Error resuming call:', err);
      const msg = formatMicrophoneError(err);
      showTransientError(msg, 4000, err);
      resetCallState(0);
    }
  };

  const resumeRecoverableCall = async () => {
    if (recoverableCall) {
      await resumeCallWithInfo(recoverableCall);
    }
  };

  const dismissRecoverableCall = () => {
    if (recoverableCall?.callId && socket) {
      socket.emit('call:dismiss-recoverable', { callId: recoverableCall.callId });
    }
    setRecoverableCall(null);
  };

  return (
    <CallContext.Provider
      value={{
        callState,
        activeCall,
        callType: activeCall?.callType || 'voice',
        sessionId: sessionIdRef.current,
        startCall,
        acceptCall,
        rejectCall,
        cancelCall,
        hangup,
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
        errorMessage,
        clearError,
        voiceExperience,
        setVoiceExperience,
        callQuality,
        isMinimized,
        minimizeCall,
        expandCall,
        isRemoteSpeaking,
        availableOutputDevices,
        selectedOutputDeviceId,
        setAudioOutputDevice,
        recoverableCall,
        resumeRecoverableCall,
        dismissRecoverableCall,
        audioPipelineMode,
        setAudioPipelineMode,
        videoQualityMode,
        setVideoQualityMode,
        realtimeTelemetry,
        showDiagnosticsPanel,
        setShowDiagnosticsPanel: setShowDiagnosticsPanelCallback,
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
      }}
    >
      {children}
    </CallContext.Provider>
  );
}
