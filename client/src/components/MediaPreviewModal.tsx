import React, { useState, useEffect, useRef, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { formatFileSize, validateClientFile, ACCEPT_PATTERNS, type MediaCategory } from '../config/media';
import { uploadMedia, type UploadProgressEvent, type UploadMediaHandle } from '../services/mediaService';
import { generateUUID } from '../utils/uuid';
import './MediaPreviewModal.css';

export interface InitialMediaFile {
  file: File;
  category: MediaCategory;
}

export interface PreviewFileItem {
  id: string;
  file: File;
  category: MediaCategory;
  objectUrl?: string;
  duration?: number;
  status: 'idle' | 'uploading' | 'completed' | 'failed';
  progress: number;
  error?: string;
}

interface MediaPreviewModalProps {
  conversationId: string;
  initialFiles: InitialMediaFile[];
  replyToMessageId?: string | null;
  onSuccess: (message: any) => void;
  onCancel: () => void;
}

function formatDuration(seconds: number): string {
  if (!seconds || isNaN(seconds)) return '0:00';
  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  return `${mins}:${secs < 10 ? '0' : ''}${secs}`;
}

export default function MediaPreviewModal({
  conversationId,
  initialFiles,
  replyToMessageId,
  onSuccess,
  onCancel
}: MediaPreviewModalProps) {
  const [items, setItems] = useState<PreviewFileItem[]>(() => {
    return initialFiles.map(f => {
      const isMedia = f.category === 'image' || f.category === 'video';
      return {
        id: generateUUID(),
        file: f.file,
        category: f.category,
        objectUrl: isMedia ? URL.createObjectURL(f.file) : undefined,
        status: 'idle',
        progress: 0
      };
    });
  });

  const [selectedIndex, setSelectedIndex] = useState<number>(0);
  const [caption, setCaption] = useState('');
  const [isUploading, setIsUploading] = useState(false);
  const [overallProgress, setOverallProgress] = useState<number>(0);
  const [currentUploadIndex, setCurrentUploadIndex] = useState<number>(0);
  const [uploadPhase, setUploadPhase] = useState<'idle' | 'uploading' | 'processing' | 'error'>('idle');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  const uploadHandleRef = useRef<UploadMediaHandle | null>(null);
  const captionInputRef = useRef<HTMLInputElement>(null);
  const addMoreInputRef = useRef<HTMLInputElement>(null);

  // Cleanup object URLs on unmount
  useEffect(() => {
    return () => {
      items.forEach(item => {
        if (item.objectUrl) {
          URL.revokeObjectURL(item.objectUrl);
        }
      });
    };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Focus caption input on mount
  useEffect(() => {
    captionInputRef.current?.focus();
  }, []);

  const showToast = (msg: string) => {
    setToastMessage(msg);
    setTimeout(() => setToastMessage(null), 3000);
  };

  const activeItem = items[selectedIndex] || items[0];

  const handleCancel = useCallback(() => {
    if (isUploading && uploadHandleRef.current) {
      uploadHandleRef.current.abort();
    }
    onCancel();
  }, [isUploading, onCancel]);

  // Keyboard handler for Escape and Arrow keys
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        e.stopPropagation();
        handleCancel();
      } else if (e.key === 'ArrowLeft' && !isUploading) {
        setSelectedIndex(prev => Math.max(0, prev - 1));
      } else if (e.key === 'ArrowRight' && !isUploading) {
        setSelectedIndex(prev => Math.min(items.length - 1, prev + 1));
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [handleCancel, isUploading, items.length]);

  const handleRemoveItem = (idToRemove: string, e?: React.MouseEvent) => {
    if (e) e.stopPropagation();
    if (isUploading) return;

    const itemToRemove = items.find(i => i.id === idToRemove);
    if (itemToRemove?.objectUrl) {
      URL.revokeObjectURL(itemToRemove.objectUrl);
    }

    const remaining = items.filter(i => i.id !== idToRemove);
    if (remaining.length === 0) {
      onCancel();
      return;
    }

    setItems(remaining);
    setSelectedIndex(prev => {
      if (prev >= remaining.length) return remaining.length - 1;
      return prev;
    });
  };

  const handleAddMoreFiles = (e: React.ChangeEvent<HTMLInputElement>) => {
    const rawFiles = e.target.files;
    if (!rawFiles || rawFiles.length === 0) return;
    const filesArray = Array.from(rawFiles);
    e.target.value = '';

    const newItems: PreviewFileItem[] = [];
    const rejected: string[] = [];

    filesArray.forEach(file => {
      const validation = validateClientFile(file);
      if (!validation.valid) {
        rejected.push(`${file.name}: ${validation.error}`);
        return;
      }

      const isMedia = validation.category === 'image' || validation.category === 'video';
      newItems.push({
        id: generateUUID(),
        file,
        category: validation.category,
        objectUrl: isMedia ? URL.createObjectURL(file) : undefined,
        status: 'idle',
        progress: 0
      });
    });

    if (rejected.length > 0) {
      showToast(rejected[0]);
    }

    if (newItems.length > 0) {
      setItems(prev => [...prev, ...newItems]);
      setSelectedIndex(items.length); // switch to first newly added file
    }
  };

  const handleVideoMetadata = (id: string, e: React.SyntheticEvent<HTMLVideoElement>) => {
    const video = e.currentTarget;
    const dur = video.duration;
    if (dur && !isNaN(dur)) {
      setItems(prev => prev.map(item => item.id === id ? { ...item, duration: dur } : item));
    }
  };

  const handleSend = async () => {
    console.log('[WIBBY MEDIA] send clicked', {
      isUploading,
      itemsCount: items.length,
      conversationId,
      files: items.map(i => ({ name: i.file.name, size: i.file.size, type: i.file.type }))
    });

    if (isUploading || items.length === 0) return;
    setIsUploading(true);
    setUploadPhase('uploading');
    setOverallProgress(0);
    setErrorMessage(null);

    const totalCount = items.length;
    let completedCount = 0;

    for (let i = 0; i < items.length; i++) {
      const currentItem = items[i];
      if (currentItem.status === 'completed') {
        completedCount++;
        continue;
      }

      setCurrentUploadIndex(i);
      setItems(prev => prev.map((item, idx) => idx === i ? { ...item, status: 'uploading', progress: 0 } : item));

      const clientMessageId = generateUUID();
      // Attach caption to the first item
      const itemCaption = (i === 0) ? caption.trim() : '';

      console.log('[WIBBY MEDIA] upload starting for item', i + 1, 'of', totalCount, ':', currentItem.file.name);

      const handle = uploadMedia({
        conversationId,
        file: currentItem.file,
        caption: itemCaption,
        clientMessageId,
        replyToMessageId,
        onProgress: (progress: UploadProgressEvent) => {
          setItems(prev => prev.map((item, idx) => 
            idx === i ? { ...item, progress: progress.percent } : item
          ));
          const currentOverall = Math.round(((completedCount + progress.percent / 100) / totalCount) * 100);
          setOverallProgress(Math.min(99, currentOverall));
        }
      });

      uploadHandleRef.current = handle;

      try {
        const sentMessage = await handle.promise;
        console.log('[WIBBY MEDIA] upload response / message created:', sentMessage);
        completedCount++;
        setItems(prev => prev.map((item, idx) => 
          idx === i ? { ...item, status: 'completed', progress: 100 } : item
        ));
        onSuccess(sentMessage);
      } catch (err: any) {
        if (err.message === 'Upload cancelled') {
          console.log('[WIBBY MEDIA] upload cancelled by user');
          onCancel();
          return;
        } else {
          console.error(`[WIBBY MEDIA] Media send error for ${currentItem.file.name}:`, err);
          setItems(prev => prev.map((item, idx) => 
            idx === i ? { ...item, status: 'failed', error: err.message } : item
          ));
          setUploadPhase('error');
          setErrorMessage(err.message || `Failed to upload ${currentItem.file.name}`);
          setIsUploading(false);
          return;
        }
      }
    }

    setOverallProgress(100);
    console.log('[WIBBY MEDIA] preview closed - all uploads completed');
    onCancel(); // All uploaded successfully
  };

  const handleRetry = () => {
    handleSend();
  };

  const totalBytes = items.reduce((acc, item) => acc + item.file.size, 0);

  return createPortal(
    <div className="media-preview-overlay" role="dialog" aria-modal="true" aria-label="Attachments Preview">
      <div className="media-preview-container">
        {/* Hidden File Input for Add More */}
        <input
          type="file"
          ref={addMoreInputRef}
          multiple
          accept={ACCEPT_PATTERNS.all}
          style={{ display: 'none' }}
          onChange={handleAddMoreFiles}
        />

        {/* Modal Header */}
        <div className="media-preview-header">
          <div className="media-preview-title-group">
            <span className="media-preview-type-badge">
              {items.length === 1 ? (
                activeItem.category === 'image' ? '🖼️ Photo' :
                activeItem.category === 'video' ? '🎥 Video' : '📄 Document'
              ) : (
                `📎 ${items.length} Files`
              )}
            </span>
            <span className="media-preview-filename" title={activeItem.file.name}>
              {activeItem.file.name}
            </span>
            <span className="media-preview-filesize">
              ({formatFileSize(activeItem.file.size)}{items.length > 1 ? ` · Total ${formatFileSize(totalBytes)}` : ''})
            </span>
          </div>

          <button 
            className="media-preview-close-btn" 
            onClick={handleCancel}
            aria-label="Cancel and close preview"
            title="Cancel (Esc)"
            disabled={isUploading && overallProgress === 100}
          >
            ✕
          </button>
        </div>

        {/* Hero Active Preview */}
        <div className="media-preview-content">
          {activeItem.category === 'image' && (
            <div className="media-preview-image-wrap">
              <img 
                src={activeItem.objectUrl} 
                alt={activeItem.file.name} 
                className="media-preview-image" 
              />
            </div>
          )}

          {activeItem.category === 'video' && (
            <div className="media-preview-video-wrap">
              <video 
                src={activeItem.objectUrl} 
                controls 
                preload="metadata"
                className="media-preview-video"
                onLoadedMetadata={(e) => handleVideoMetadata(activeItem.id, e)}
              />
              {activeItem.duration && (
                <div className="video-duration-tag">
                  ⏱️ {formatDuration(activeItem.duration)}
                </div>
              )}
            </div>
          )}

          {activeItem.category === 'file' && (
            <div className="media-preview-doc-wrap">
              <div className="media-doc-card">
                <span className="media-doc-big-icon">📄</span>
                <div className="media-doc-details">
                  <div className="media-doc-name" title={activeItem.file.name}>
                    {activeItem.file.name}
                  </div>
                  <div className="media-doc-meta">
                    <span className="doc-type-badge">
                      {activeItem.file.name.split('.').pop()?.toUpperCase() || 'FILE'}
                    </span>
                    <span>· {formatFileSize(activeItem.file.size)}</span>
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Multi-file Carousel / Strip */}
        <div className="media-thumbnails-strip-wrap">
          <div className="media-thumbnails-strip">
            {items.map((item, idx) => {
              const isSelected = idx === selectedIndex;
              return (
                <div 
                  key={item.id}
                  className={`media-thumb-card ${isSelected ? 'selected' : ''} ${item.status}`}
                  onClick={() => !isUploading && setSelectedIndex(idx)}
                  role="button"
                  tabIndex={0}
                  aria-label={`Preview ${item.file.name}`}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' || e.key === ' ') {
                      e.preventDefault();
                      if (!isUploading) setSelectedIndex(idx);
                    }
                  }}
                >
                  {item.category === 'image' && (
                    <img src={item.objectUrl} alt={item.file.name} className="thumb-img" />
                  )}
                  {item.category === 'video' && (
                    <div className="thumb-video-icon">
                      <span>🎥</span>
                    </div>
                  )}
                  {item.category === 'file' && (
                    <div className="thumb-doc-icon">
                      <span className="thumb-doc-ext">
                        {item.file.name.split('.').pop()?.substring(0, 3).toUpperCase() || 'DOC'}
                      </span>
                    </div>
                  )}

                  {/* Remove Item Button */}
                  {!isUploading && (
                    <button
                      className="thumb-remove-btn"
                      onClick={(e) => handleRemoveItem(item.id, e)}
                      aria-label={`Remove ${item.file.name}`}
                      title="Remove file"
                    >
                      ×
                    </button>
                  )}

                  {/* Upload State Indicator on Thumbnail */}
                  {item.status === 'uploading' && (
                    <div className="thumb-status-overlay uploading">
                      <div className="thumb-spinner" />
                    </div>
                  )}
                  {item.status === 'completed' && (
                    <div className="thumb-status-overlay completed">
                      <span>✓</span>
                    </div>
                  )}
                  {item.status === 'failed' && (
                    <div className="thumb-status-overlay failed">
                      <span>!</span>
                    </div>
                  )}
                </div>
              );
            })}

            {/* Add More Button */}
            {!isUploading && (
              <button
                className="media-add-more-btn"
                onClick={() => addMoreInputRef.current?.click()}
                type="button"
                aria-label="Add more files"
                title="Add more files"
              >
                <div className="add-more-icon">+</div>
                <span className="add-more-text">Add more</span>
              </button>
            )}
          </div>
        </div>

        {/* Toast alert if any */}
        {toastMessage && (
          <div className="media-preview-toast">
            <span>⚠️ {toastMessage}</span>
          </div>
        )}

        {/* Error bar if upload failed */}
        {errorMessage && (
          <div className="media-preview-error-bar">
            <span>⚠️ {errorMessage}</span>
          </div>
        )}

        {/* Realtime Upload Progress Bar */}
        {isUploading && (
          <div className="media-preview-progress-wrap">
            <div className="media-preview-progress-bar">
              <div 
                className="media-preview-progress-fill" 
                style={{ width: `${overallProgress}%` }} 
              />
            </div>
            <div className="media-preview-progress-status">
              {uploadPhase === 'uploading' && (
                <span>
                  Uploading {currentUploadIndex + 1} of {items.length}… {overallProgress}%
                </span>
              )}
              {uploadPhase === 'processing' && (
                <span>Processing media…</span>
              )}
            </div>
          </div>
        )}

        {/* Caption input and Actions Footer */}
        <div className="media-preview-footer">
          <div className="media-caption-input-wrap">
            <input
              ref={captionInputRef}
              type="text"
              className="media-caption-input"
              placeholder="Add a caption... (optional)"
              value={caption}
              onChange={(e) => setCaption(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !isUploading) {
                  e.preventDefault();
                  handleSend();
                }
              }}
              disabled={isUploading}
              maxLength={2000}
            />
          </div>

          <div className="media-preview-actions">
            <button 
              type="button"
              className="media-preview-btn media-cancel-btn" 
              onClick={handleCancel}
              disabled={isUploading && overallProgress === 100}
            >
              Cancel
            </button>

            {uploadPhase === 'error' ? (
              <button 
                type="button"
                className="media-preview-btn media-retry-btn" 
                onClick={handleRetry}
              >
                Retry
              </button>
            ) : (
              <button 
                type="button"
                className="media-preview-btn media-send-btn" 
                onClick={handleSend}
                disabled={isUploading || items.length === 0}
              >
                {isUploading ? `Sending (${overallProgress}%)` : items.length > 1 ? `Send (${items.length})` : 'Send'}
              </button>
            )}
          </div>
        </div>
      </div>
    </div>,
    document.body
  );
}
