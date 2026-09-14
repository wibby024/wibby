import React, { useState, useEffect, useRef } from 'react';
import { getAuthenticatedMediaBlobUrl, downloadMediaFile } from '../services/mediaService';
import './AuthenticatedMedia.css';

interface AuthenticatedImageProps extends React.ImgHTMLAttributes<HTMLImageElement> {
  conversationId: string;
  mediaUrl: string;
  fallbackAlt?: string;
  onLoaded?: () => void;
}

export function AuthenticatedImage({
  conversationId,
  mediaUrl,
  fallbackAlt = 'Photo',
  className = '',
  alt,
  onLoaded,
  ...restProps
}: AuthenticatedImageProps) {
  const [blobUrl, setBlobUrl] = useState<string>('');
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [hasError, setHasError] = useState<boolean>(false);
  const [retryCount, setRetryCount] = useState<number>(0);
  const isMountedRef = useRef<boolean>(true);

  useEffect(() => {
    isMountedRef.current = true;
    let active = true;

    if (!mediaUrl) {
      setIsLoading(false);
      setHasError(true);
      return;
    }

    setIsLoading(true);
    setHasError(false);

    const loadMediaWithRetry = async () => {
      let attempts = 0;
      const maxAttempts = 3;

      while (attempts < maxAttempts && active && isMountedRef.current) {
        try {
          const url = await getAuthenticatedMediaBlobUrl(conversationId, mediaUrl);
          if (active && isMountedRef.current) {
            setBlobUrl(url);
            setIsLoading(false);
            setHasError(false);
            return;
          }
        } catch (err) {
          attempts++;
          if (attempts >= maxAttempts) {
            console.error('Failed to load authenticated image after retries:', err);
            if (active && isMountedRef.current) {
              setHasError(true);
              setIsLoading(false);
            }
          } else {
            // Wait 500ms before next retry to allow auth to settle
            await new Promise(r => setTimeout(r, 500 * attempts));
          }
        }
      }
    };

    loadMediaWithRetry();

    return () => {
      active = false;
      isMountedRef.current = false;
    };
  }, [conversationId, mediaUrl, retryCount]);

  if (hasError) {
    return (
      <div className={`auth-media-error ${className}`} role="alert">
        <span className="auth-media-error-icon">⚠️</span>
        <span className="auth-media-error-text">Failed to load image</span>
        <button
          className="auth-media-retry-btn"
          onClick={(e) => {
            e.stopPropagation();
            setRetryCount(prev => prev + 1);
          }}
          type="button"
        >
          Retry
        </button>
      </div>
    );
  }

  return (
    <div className={`auth-image-container ${className} ${isLoading ? 'loading' : ''}`}>
      {isLoading && (
        <div className="auth-media-skeleton" aria-hidden="true">
          <div className="auth-media-spinner" />
        </div>
      )}
      {blobUrl && (
        <img
          {...restProps}
          src={blobUrl}
          alt={alt || fallbackAlt}
          className={`auth-image-content ${isLoading ? 'hidden' : 'visible'}`}
          onLoad={() => {
            setIsLoading(false);
            onLoaded?.();
          }}
          onError={() => {
            setHasError(true);
            setIsLoading(false);
          }}
        />
      )}
    </div>
  );
}

interface AuthenticatedVideoProps extends React.VideoHTMLAttributes<HTMLVideoElement> {
  conversationId: string;
  mediaUrl: string;
  fileName?: string;
}

export function AuthenticatedVideo({
  conversationId,
  mediaUrl,
  fileName,
  className = '',
  ...restProps
}: AuthenticatedVideoProps) {
  const [blobUrl, setBlobUrl] = useState<string>('');
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [hasError, setHasError] = useState<boolean>(false);
  const [errorMessage, setErrorMessage] = useState<string>('');
  const [retryCount, setRetryCount] = useState<number>(0);
  const isMountedRef = useRef<boolean>(true);
  const videoRef = useRef<HTMLVideoElement | null>(null);

  useEffect(() => {
    isMountedRef.current = true;
    let active = true;

    if (!mediaUrl) {
      setIsLoading(false);
      setHasError(true);
      setErrorMessage('Video URL missing');
      return;
    }

    console.log('[WIBBY VIDEO] LOAD START', { conversationId, mediaUrl, retryCount });
    setIsLoading(true);
    setHasError(false);
    setErrorMessage('');

    const loadVideoBlob = async () => {
      let attempts = 0;
      const maxAttempts = 3;

      while (attempts < maxAttempts && active && isMountedRef.current) {
        try {
          console.log('[WIBBY VIDEO] FETCH START attempt', attempts + 1);
          const url = await getAuthenticatedMediaBlobUrl(conversationId, mediaUrl);
          if (active && isMountedRef.current) {
            console.log('[WIBBY VIDEO] BLOB URL CREATED:', url);
            setBlobUrl(url);
            setIsLoading(false);
            setHasError(false);
            return;
          }
        } catch (err: any) {
          attempts++;
          console.error('[WIBBY VIDEO] FETCH ERROR:', err);
          if (attempts >= maxAttempts) {
            console.error('[WIBBY VIDEO] LOAD FAILED after max retries:', err);
            if (active && isMountedRef.current) {
              setHasError(true);
              setErrorMessage(err.message || 'Failed to load video stream');
              setIsLoading(false);
            }
          } else {
            await new Promise(r => setTimeout(r, 500 * attempts));
          }
        }
      }
    };

    loadVideoBlob();

    return () => {
      active = false;
      isMountedRef.current = false;
    };
  }, [conversationId, mediaUrl, retryCount]);

  const handleDownload = async (e: React.MouseEvent) => {
    e.stopPropagation();
    try {
      await downloadMediaFile(conversationId, mediaUrl, fileName || 'video.mp4');
    } catch (err) {
      console.error('[WIBBY VIDEO] Download error:', err);
    }
  };

  const handleRetry = (e: React.MouseEvent) => {
    e.stopPropagation();
    console.log('[WIBBY VIDEO] RETRY clicked');
    setRetryCount(prev => prev + 1);
  };

  if (hasError) {
    return (
      <div className={`auth-media-error ${className}`} role="alert">
        <span className="auth-media-error-icon">⚠️</span>
        <span className="auth-media-error-text">{errorMessage || "Video couldn't be played"}</span>
        <div className="auth-video-error-actions">
          <button
            className="auth-media-retry-btn"
            onClick={handleRetry}
            type="button"
          >
            Retry
          </button>
          <button
            className="auth-media-download-btn"
            onClick={handleDownload}
            type="button"
          >
            Download Video
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className={`auth-video-container ${className} ${isLoading ? 'loading' : ''}`}>
      {isLoading && (
        <div className="auth-media-skeleton" aria-hidden="true">
          <div className="auth-media-spinner" />
        </div>
      )}
      {blobUrl && (
        <video
          {...restProps}
          ref={videoRef}
          src={blobUrl}
          controls
          preload="metadata"
          playsInline
          className={`auth-video-content ${isLoading ? 'hidden' : 'visible'}`}
          onLoadStart={() => console.log('[WIBBY VIDEO] VIDEO ELEMENT MOUNTED / LOAD START')}
          onLoadedMetadata={() => {
            console.log('[WIBBY VIDEO] LOADED METADATA', {
              duration: videoRef.current?.duration,
              videoWidth: videoRef.current?.videoWidth,
              videoHeight: videoRef.current?.videoHeight
            });
            setIsLoading(false);
          }}
          onLoadedData={() => {
            console.log('[WIBBY VIDEO] LOADED DATA');
            setIsLoading(false);
          }}
          onCanPlay={() => {
            console.log('[WIBBY VIDEO] CAN PLAY');
            setIsLoading(false);
          }}
          onPlay={() => console.log('[WIBBY VIDEO] PLAY')}
          onError={(e) => {
            const mediaError = e.currentTarget.error;
            console.error('[WIBBY VIDEO] MEDIA ERROR:', {
              code: mediaError?.code,
              message: mediaError?.message,
              networkState: e.currentTarget.networkState,
              readyState: e.currentTarget.readyState,
              currentSrc: e.currentTarget.currentSrc
            });
            let msg = 'Video playback failed';
            if (mediaError?.code === 4) { // MEDIA_ERR_SRC_NOT_SUPPORTED
              msg = 'This video format/codec is not supported by this browser';
            } else if (mediaError?.code === 3) { // MEDIA_ERR_DECODE
              msg = 'Video decoding error occurred in this browser';
            } else if (mediaError?.code === 2) { // MEDIA_ERR_NETWORK
              msg = 'Network error while playing video';
            }
            setErrorMessage(msg);
            setHasError(true);
            setIsLoading(false);
          }}
        />
      )}
    </div>
  );
}
