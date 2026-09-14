import React, { useState, useEffect } from 'react';
import { getAuthenticatedMediaBlobUrl, downloadMediaFile } from '../services/mediaService';
import './ImageLightbox.css';

interface ImageLightboxProps {
  conversationId: string;
  imageUrl: string;
  fileName?: string;
  caption?: string;
  onClose: () => void;
}

export default function ImageLightbox({
  conversationId,
  imageUrl,
  fileName,
  caption,
  onClose
}: ImageLightboxProps) {
  const [blobUrl, setBlobUrl] = useState<string>('');
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [hasError, setHasError] = useState<boolean>(false);
  const [retryCount, setRetryCount] = useState<number>(0);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [onClose]);

  useEffect(() => {
    let active = true;
    if (!imageUrl) {
      setIsLoading(false);
      setHasError(true);
      return;
    }

    setIsLoading(true);
    setHasError(false);

    const loadLightboxImage = async () => {
      let attempts = 0;
      const maxAttempts = 3;
      while (attempts < maxAttempts && active) {
        try {
          const url = await getAuthenticatedMediaBlobUrl(conversationId, imageUrl);
          if (active) {
            setBlobUrl(url);
            setIsLoading(false);
            setHasError(false);
            return;
          }
        } catch (err) {
          attempts++;
          if (attempts >= maxAttempts) {
            console.error('Failed to load image in lightbox after retries:', err);
            if (active) {
              setHasError(true);
              setIsLoading(false);
            }
          } else {
            await new Promise(r => setTimeout(r, 500 * attempts));
          }
        }
      }
    };

    loadLightboxImage();

    return () => {
      active = false;
    };
  }, [conversationId, imageUrl, retryCount]);

  const handleDownload = async (e: React.MouseEvent) => {
    e.stopPropagation();
    try {
      await downloadMediaFile(conversationId, imageUrl, fileName || 'image.jpg');
    } catch (err) {
      console.error('Failed to download image:', err);
    }
  };

  return (
    <div 
      className="image-lightbox-overlay" 
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-label="Image viewer"
    >
      <div className="image-lightbox-container" onClick={(e) => e.stopPropagation()}>
        {/* Top bar controls */}
        <div className="image-lightbox-header">
          <span className="image-lightbox-title" title={fileName || 'Image'}>
            {fileName || 'Photo'}
          </span>
          <div className="image-lightbox-actions">
            <button
              className="image-lightbox-btn"
              onClick={handleDownload}
              aria-label="Download image"
              title="Download image"
            >
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                <polyline points="7 10 12 15 17 10" />
                <line x1="12" y1="15" x2="12" y2="3" />
              </svg>
            </button>
            <button
              className="image-lightbox-btn"
              onClick={onClose}
              aria-label="Close viewer"
              title="Close (Esc)"
            >
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <line x1="18" y1="6" x2="6" y2="18" />
                <line x1="6" y1="6" x2="18" y2="18" />
              </svg>
            </button>
          </div>
        </div>

        {/* Full Image Body */}
        <div className="image-lightbox-body">
          {isLoading && (
            <div className="image-lightbox-loading">
              <div className="image-lightbox-spinner" />
              <span className="image-lightbox-loading-text">Loading photo...</span>
            </div>
          )}

          {hasError && (
            <div className="image-lightbox-error" role="alert">
              <span className="image-lightbox-error-icon">⚠️</span>
              <span className="image-lightbox-error-text">Failed to load photo</span>
              <button
                className="image-lightbox-retry-btn"
                onClick={() => setRetryCount(prev => prev + 1)}
                type="button"
              >
                Retry
              </button>
            </div>
          )}

          {blobUrl && !hasError && (
            <img 
              src={blobUrl} 
              alt={fileName || 'Photo'} 
              className={`image-lightbox-img ${isLoading ? 'hidden' : 'visible'}`}
              onLoad={() => setIsLoading(false)}
              onError={() => {
                setHasError(true);
                setIsLoading(false);
              }}
            />
          )}
        </div>

        {/* Caption footer if any */}
        {caption && (
          <div className="image-lightbox-footer">
            <span className="image-lightbox-caption">{caption}</span>
          </div>
        )}
      </div>
    </div>
  );
}
