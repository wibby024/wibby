import { useState, useEffect, useRef, useCallback } from 'react';
import './CameraCaptureModal.css';

export type CameraState = 
  | 'REQUESTING_PERMISSION'
  | 'CAMERA_READY'
  | 'CAPTURING'
  | 'PREVIEW'
  | 'ERROR'
  | 'CANCELLED';

interface CameraCaptureModalProps {
  isOpen: boolean;
  onCapture: (file: File) => void;
  onSelectPhotoFallback: () => void;
  onClose: () => void;
}

export default function CameraCaptureModal({
  isOpen,
  onCapture,
  onSelectPhotoFallback,
  onClose
}: CameraCaptureModalProps) {
  const [state, setState] = useState<CameraState>('REQUESTING_PERMISSION');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [capturedBlob, setCapturedBlob] = useState<Blob | null>(null);
  const [capturedPreviewUrl, setCapturedPreviewUrl] = useState<string | null>(null);
  const [facingMode, setFacingMode] = useState<'user' | 'environment'>('user');
  const [isCapturing, setIsCapturing] = useState<boolean>(false);

  const videoRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const isMountedRef = useRef<boolean>(true);

  // Stop and release all camera hardware tracks immediately
  const stopCameraStream = useCallback(() => {
    if (streamRef.current) {
      try {
        streamRef.current.getTracks().forEach(track => {
          track.stop();
          track.enabled = false;
        });
      } catch (err) {
        console.warn('Error stopping camera track:', err);
      }
      streamRef.current = null;
    }
  }, []);

  // Cleanup on unmount or close
  useEffect(() => {
    isMountedRef.current = true;
    return () => {
      isMountedRef.current = false;
      stopCameraStream();
      if (capturedPreviewUrl) {
        URL.revokeObjectURL(capturedPreviewUrl);
      }
    };
  }, [stopCameraStream, capturedPreviewUrl]);

  /**
   * Request camera stream and attach to video element
   */
  const startCamera = useCallback(async (preferredFacingMode: 'user' | 'environment' = 'user') => {
    stopCameraStream();
    setState('REQUESTING_PERMISSION');
    setErrorMessage(null);

    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
      setErrorMessage("Camera isn't available on this device.");
      setState('ERROR');
      return;
    }

    try {

      const stream = await navigator.mediaDevices.getUserMedia({
        video: {
          facingMode: preferredFacingMode,
          width: { ideal: 1920 },
          height: { ideal: 1080 }
        },
        audio: false // Strict video-only: do NOT request microphone
      });

      if (!isMountedRef.current) {
        stream.getTracks().forEach(t => t.stop());
        return;
      }

      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        videoRef.current.play().catch(err => {
          console.warn('[WIBBY CAMERA] Video play warning:', err);
        });
      }

      setState('CAMERA_READY');
    } catch (err: any) {
      console.error('[WIBBY CAMERA] Camera access error:', err);
      stopCameraStream();
      if (!isMountedRef.current) return;

      let msg = "Camera isn't available on this device.";
      if (err.name === 'NotAllowedError' || err.name === 'PermissionDeniedError') {
        msg = 'Camera permission was denied. Please allow camera access in your browser settings.';
      } else if (err.name === 'NotFoundError' || err.name === 'DevicesNotFoundError') {
        msg = "Camera isn't available on this device.";
      } else if (err.name === 'NotReadableError' || err.name === 'TrackStartError') {
        msg = 'Camera is already in use by another application.';
      } else if (err.message) {
        msg = err.message;
      }

      setErrorMessage(msg);
      setState('ERROR');
    }
  }, [stopCameraStream]);

  // Start camera when modal opens
  useEffect(() => {
    if (isOpen) {
      startCamera(facingMode);
    } else {
      stopCameraStream();
      if (capturedPreviewUrl) {
        URL.revokeObjectURL(capturedPreviewUrl);
        setCapturedPreviewUrl(null);
      }
      setCapturedBlob(null);
      setState('REQUESTING_PERMISSION');
    }
  }, [isOpen, facingMode, startCamera, stopCameraStream]);

  /**
   * Switch between front and back / external cameras
   */
  const toggleCameraFacingMode = () => {
    const nextMode = facingMode === 'user' ? 'environment' : 'user';
    setFacingMode(nextMode);
    startCamera(nextMode);
  };

  /**
   * Capture photo from the live video stream using an offscreen canvas
   */
  const capturePhoto = () => {
    if (!videoRef.current || state !== 'CAMERA_READY' || isCapturing) return;

    setIsCapturing(true);
    setState('CAPTURING');

    try {
      const video = videoRef.current;
      const width = video.videoWidth || 1280;
      const height = video.videoHeight || 720;

      const canvas = document.createElement('canvas');
      canvas.width = width;
      canvas.height = height;

      const ctx = canvas.getContext('2d');
      if (!ctx) {
        throw new Error('Canvas context could not be created');
      }

      // If front-facing camera, mirror the canvas so photo matches user preview
      if (facingMode === 'user') {
        ctx.translate(width, 0);
        ctx.scale(-1, 1);
      }

      ctx.drawImage(video, 0, 0, width, height);

      canvas.toBlob(
        (blob) => {
          setIsCapturing(false);
          if (!blob || blob.size === 0) {
            setErrorMessage('Photo capture failed. Please try again.');
            setState('ERROR');
            return;
          }

          stopCameraStream(); // Release camera hardware during review
          setCapturedBlob(blob);
          const previewUrl = URL.createObjectURL(blob);
          setCapturedPreviewUrl(previewUrl);
          setState('PREVIEW');
        },
        'image/jpeg',
        0.92
      );
    } catch (err: any) {
      console.error('[WIBBY CAMERA] Capture error:', err);
      setIsCapturing(false);
      setErrorMessage(err.message || 'Failed to capture photo');
      setState('ERROR');
    }
  };

  /**
   * Discard captured photo and retake
   */
  const handleRetake = () => {
    if (capturedPreviewUrl) {
      URL.revokeObjectURL(capturedPreviewUrl);
      setCapturedPreviewUrl(null);
    }
    setCapturedBlob(null);
    startCamera(facingMode);
  };

  /**
   * Confirm photo and send to Phase 6 media pipeline
   */
  const handleConfirmPhoto = () => {
    if (!capturedBlob) return;

    const fileName = `Wibby_Camera_${Date.now()}.jpg`;
    const photoFile = new File([capturedBlob], fileName, { type: 'image/jpeg' });

    stopCameraStream();
    if (capturedPreviewUrl) {
      URL.revokeObjectURL(capturedPreviewUrl);
      setCapturedPreviewUrl(null);
    }

    onCapture(photoFile);
  };

  /**
   * Close modal & clean up
   */
  const handleClose = () => {
    stopCameraStream();
    if (capturedPreviewUrl) {
      URL.revokeObjectURL(capturedPreviewUrl);
      setCapturedPreviewUrl(null);
    }
    setCapturedBlob(null);
    setState('CANCELLED');
    onClose();
  };

  if (!isOpen) return null;

  return (
    <div className="camera-modal-overlay" role="dialog" aria-modal="true" aria-label="Camera Photo Capture">
      <div className="camera-modal-card">
        
        {/* Header */}
        <div className="camera-modal-header">
          <div className="camera-modal-title">
            <span className="camera-icon-badge">📷</span>
            <span>{state === 'PREVIEW' ? 'Photo Preview' : 'Camera'}</span>
          </div>
          <button 
            className="camera-btn-close"
            onClick={handleClose}
            aria-label="Close camera"
            title="Close (Esc)"
          >
            ✕
          </button>
        </div>

        {/* Camera Viewport / Body */}
        <div className="camera-modal-body">
          
          {/* Error Alert */}
          {errorMessage && (
            <div className="camera-error-view" role="alert">
              <span className="camera-error-icon">⚠️</span>
              <p className="camera-error-text">{errorMessage}</p>
              <div className="camera-error-actions">
                <button 
                  className="camera-btn-retry" 
                  onClick={() => startCamera(facingMode)}
                >
                  Try Again
                </button>
                <button 
                  className="camera-btn-fallback" 
                  onClick={() => {
                    handleClose();
                    onSelectPhotoFallback();
                  }}
                >
                  Choose Photo
                </button>
              </div>
            </div>
          )}

          {/* Requesting Permission Loader */}
          {state === 'REQUESTING_PERMISSION' && !errorMessage && (
            <div className="camera-loading-view">
              <div className="camera-spinner" />
              <span>Starting camera...</span>
            </div>
          )}

          {/* Live Video Viewport */}
          {(state === 'CAMERA_READY' || state === 'CAPTURING' || state === 'REQUESTING_PERMISSION') && !errorMessage && (
            <div className="camera-viewport-container">
              <video 
                ref={videoRef}
                autoPlay 
                playsInline 
                muted 
                className={`camera-video-stream ${facingMode === 'user' ? 'mirrored' : ''}`}
                aria-label="Live camera preview"
              />

              {/* Camera Switch Control always visible for instant rear/front camera toggle */}
              <button 
                className="camera-switch-btn"
                onClick={toggleCameraFacingMode}
                title={facingMode === 'user' ? 'Switch to Rear Camera' : 'Switch to Front Camera'}
                aria-label="Switch between front and back cameras"
              >
                <span>{facingMode === 'user' ? '📷 Rear' : '🤳 Front'}</span>
              </button>
            </div>
          )}

          {/* Captured Photo Preview */}
          {state === 'PREVIEW' && capturedPreviewUrl && (
            <div className="camera-preview-container">
              <img 
                src={capturedPreviewUrl} 
                alt="Captured snapshot preview" 
                className="camera-preview-image"
              />
            </div>
          )}
        </div>

        {/* Footer / Controls */}
        <div className="camera-modal-footer">
          {state === 'CAMERA_READY' && (
            <div className="camera-capture-controls">
              <button 
                className="camera-btn-cancel-flat"
                onClick={handleClose}
              >
                Cancel
              </button>

              <button 
                className="camera-shutter-btn"
                onClick={capturePhoto}
                disabled={isCapturing}
                title="Take photo"
                aria-label="Capture photo"
              >
                <div className="shutter-inner-circle" />
              </button>

              <button 
                className="camera-btn-choose-photo"
                onClick={() => {
                  handleClose();
                  onSelectPhotoFallback();
                }}
                title="Select photo from device"
              >
                🖼️ Photos
              </button>
            </div>
          )}

          {state === 'PREVIEW' && (
            <div className="camera-preview-actions">
              <button 
                className="camera-btn-retake"
                onClick={handleRetake}
              >
                Retake
              </button>

              <button 
                className="camera-btn-use-photo"
                onClick={handleConfirmPhoto}
              >
                <span>Use Photo</span>
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <polyline points="20 6 9 17 4 12" />
                </svg>
              </button>
            </div>
          )}
        </div>

      </div>
    </div>
  );
}
