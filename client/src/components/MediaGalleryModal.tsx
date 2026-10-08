import React, { useState, useEffect, useCallback, useRef } from 'react';
import { createPortal } from 'react-dom';
import { useAuth } from '../context/AuthContext';
import type { Message } from '../types/chat';
import { AuthenticatedImage } from './AuthenticatedMedia';
import { formatFileSize } from '../config/media';
import { downloadMediaFile, getApiUrl } from '../services/mediaService';
import { ZipBuilder } from '../utils/zipBuilder';
import { IconDocument, IconClose } from './common/Icons';
import './MediaGalleryModal.css';

interface MediaGalleryModalProps {
  isOpen: boolean;
  onClose: () => void;
  conversationId: string;
  partnerName?: string;
  partnerUid?: string;
}

type MediaCategory = 'all' | 'photos' | 'videos' | 'documents' | 'voice' | 'other';

export default function MediaGalleryModal({
  isOpen,
  onClose,
  conversationId,
  partnerName = 'Partner',
  partnerUid: _partnerUid
}: MediaGalleryModalProps) {
  const { user } = useAuth();
  const [activeCategory, setActiveCategory] = useState<MediaCategory>('all');
  const [messages, setMessages] = useState<Message[]>([]);
  const [loading, setLoading] = useState(false);
  const [hasMore, setHasMore] = useState(false);
  const [nextCursor, setNextCursor] = useState<string | null>(null);

  // Storage Stats State
  const [storageStats, setStorageStats] = useState<{
    totalBytes: number;
    totalCount: number;
    categories: Record<string, { count: number; sizeBytes: number }>;
  } | null>(null);

  // Multi-Select State
  const [isSelectMode, setIsSelectMode] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

  // Export Progress State
  const [exporting, setExporting] = useState(false);
  const [exportProgress, setExportProgress] = useState<{
    current: number;
    total: number;
    percent: number;
    statusText: string;
  }>({ current: 0, total: 0, percent: 0, statusText: '' });

  // Lightbox / Full Preview
  const [previewMedia, setPreviewMedia] = useState<{ url: string; type: string; title: string } | null>(null);

  // Audio Playback State for Voice Notes
  const [playingAudioId, setPlayingAudioId] = useState<string | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  // Fetch Storage Stats
  const fetchStorageStats = useCallback(async () => {
    if (!conversationId || !user) return;
    try {
      const token = await user.getIdToken();
      const apiUrl = getApiUrl();
      const res = await fetch(`${apiUrl}/api/conversations/${conversationId}/media/storage-stats`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      if (res.ok) {
        const data = await res.json();
        setStorageStats(data);
      }
    } catch (err) {
      console.warn('Failed to fetch storage stats:', err);
    }
  }, [conversationId, user]);

  // Fetch Media List
  const fetchMedia = useCallback(
    async (reset = false, cursor: string | null = null) => {
      if (!conversationId || !user) return;
      setLoading(true);

      try {
        const token = await user.getIdToken();
        const apiUrl = getApiUrl();
        const cursorParam = cursor ? `&before=${cursor}` : '';
        const url = `${apiUrl}/api/conversations/${conversationId}/media/gallery?category=${activeCategory}&limit=40${cursorParam}`;

        const res = await fetch(url, {
          headers: { Authorization: `Bearer ${token}` }
        });

        if (res.ok) {
          const data = await res.json();
          const newItems: Message[] = data.messages || [];

          if (reset) {
            setMessages(newItems);
          } else {
            setMessages(prev => [...prev, ...newItems]);
          }

          setHasMore(data.hasMore || false);
          setNextCursor(data.nextCursor || null);
        }
      } catch (err) {
        console.error('Failed to fetch media gallery:', err);
      } finally {
        setLoading(false);
      }
    },
    [conversationId, user, activeCategory]
  );

  useEffect(() => {
    if (isOpen) {
      setSelectedIds(new Set());
      setIsSelectMode(false);
      fetchStorageStats();
      fetchMedia(true, null);
    } else {
      if (audioRef.current) {
        audioRef.current.pause();
      }
      setPlayingAudioId(null);
    }
  }, [isOpen, activeCategory, fetchMedia, fetchStorageStats]);

  if (!isOpen) return null;

  // Toggle Selection
  const toggleSelect = (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    setSelectedIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  };

  const handleSelectAllVisible = () => {
    const allIds = new Set(messages.map(m => m.id || (m as any)._id));
    setSelectedIds(allIds);
  };

  const handleClearSelection = () => {
    setSelectedIds(new Set());
  };

  // Helper to determine destination subfolder in ZIP export
  const getSubfolderForMessage = (msg: Message): string => {
    if (msg.type === 'image') return 'Photos';
    if (msg.type === 'video') return 'Videos';
    if (msg.type === 'file') return 'Documents';
    if (msg.type === 'audio') return 'Voice';
    return 'Other';
  };

  // Export Selected / All as ZIP
  const handleExportZip = async (selectedOnly = false) => {
    if (!user) return;
    setExporting(true);

    try {
      let targetMessages: Message[] = [];

      if (selectedOnly) {
        targetMessages = messages.filter(m => selectedIds.has(m.id || (m as any)._id));
      } else {
        // Fetch all media items across all pages if needed
        const token = await user.getIdToken();
        const apiUrl = getApiUrl();
        const res = await fetch(`${apiUrl}/api/conversations/${conversationId}/media/gallery?category=all&limit=100`, {
          headers: { Authorization: `Bearer ${token}` }
        });
        if (res.ok) {
          const data = await res.json();
          targetMessages = data.messages || [];
        } else {
          targetMessages = messages;
        }
      }

      if (targetMessages.length === 0) {
        setExporting(false);
        return;
      }

      const zip = new ZipBuilder();
      const total = targetMessages.length;
      const token = await user.getIdToken();
      const apiUrl = getApiUrl();

      for (let i = 0; i < total; i++) {
        const msg = targetMessages[i];
        if (!msg.mediaUrl) continue;
        const mediaUrl = msg.mediaUrl;
        const folder = getSubfolderForMessage(msg);
        const fileName = msg.fileName || `file_${i + 1}`;

        setExportProgress({
          current: i + 1,
          total,
          percent: Math.round(((i + 1) / total) * 100),
          statusText: `Downloading ${i + 1} of ${total}: ${folder}/${fileName}...`
        });

        try {
          const fileUrl = mediaUrl.startsWith('http')
            ? mediaUrl
            : `${apiUrl}${mediaUrl}?download=true`;

          const response = await fetch(fileUrl, {
            headers: { Authorization: `Bearer ${token}` }
          });

          if (response.ok) {
            const arrayBuf = await response.arrayBuffer();
            zip.addFile(folder, fileName, new Uint8Array(arrayBuf), new Date(msg.createdAt));
          }
        } catch (itemErr) {
          console.warn(`Export error for ${fileName}:`, itemErr);
        }
      }

      setExportProgress({
        current: total,
        total,
        percent: 100,
        statusText: 'Building ZIP archive...'
      });

      // Allow UI tick to update progress bar before packaging
      await new Promise(r => setTimeout(r, 200));

      const zipName = selectedOnly ? 'Wibby-Selected-Media.zip' : 'Wibby-Media-Export.zip';
      zip.download(zipName);
    } catch (err) {
      console.error('ZIP export failed:', err);
    } finally {
      setExporting(false);
      setIsSelectMode(false);
      setSelectedIds(new Set());
    }
  };

  // User-Initiated Batch Deletion
  const handleDeleteSelected = async () => {
    if (selectedIds.size === 0 || !user) return;
    const count = selectedIds.size;
    const confirmDelete = window.confirm(
      `Permanently delete ${count} selected item${count > 1 ? 's' : ''} from storage? This cannot be undone.`
    );
    if (!confirmDelete) return;

    try {
      const token = await user.getIdToken();
      const apiUrl = getApiUrl();
      const res = await fetch(`${apiUrl}/api/conversations/${conversationId}/media/batch-delete`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify({ messageIds: Array.from(selectedIds) })
      });

      if (res.ok) {
        setMessages(prev => prev.filter(m => !selectedIds.has(m.id || (m as any)._id)));
        setSelectedIds(new Set());
        setIsSelectMode(false);
        fetchStorageStats();
      }
    } catch (err) {
      console.error('Failed to delete selected media:', err);
    }
  };

  // Play / Pause Voice Audio
  const handlePlayVoice = async (msg: Message, e: React.MouseEvent) => {
    e.stopPropagation();
    if (!msg.mediaUrl || !user) return;
    const mediaUrl = msg.mediaUrl;
    const msgId = msg.id || (msg as any)._id;

    if (playingAudioId === msgId) {
      if (audioRef.current) {
        audioRef.current.pause();
      }
      setPlayingAudioId(null);
      return;
    }

    try {
      const token = await user.getIdToken();
      const apiUrl = getApiUrl();
      const audioUrl = mediaUrl.startsWith('http')
        ? mediaUrl
        : `${apiUrl}${mediaUrl}`;

      const res = await fetch(audioUrl, {
        headers: { Authorization: `Bearer ${token}` }
      });
      if (res.ok) {
        const blob = await res.blob();
        const blobUrl = URL.createObjectURL(blob);
        if (audioRef.current) {
          audioRef.current.pause();
        }
        const audio = new Audio(blobUrl);
        audioRef.current = audio;
        audio.onended = () => setPlayingAudioId(null);
        await audio.play();
        setPlayingAudioId(msgId);
      }
    } catch (err) {
      console.error('Failed to play voice note:', err);
    }
  };

  return createPortal(
    <div className="media-gallery-overlay" onClick={onClose} role="dialog" aria-modal="true" aria-label="Shared Media">
      <div className="media-gallery-card" onClick={e => e.stopPropagation()}>
        {/* Header */}
        <div className="media-gallery-header">
          <div className="media-gallery-title-group">
            <h3 className="media-gallery-title">
              📁 Shared Media & Files
            </h3>
            <span className="media-gallery-stats-badge">
              {storageStats ? `${storageStats.totalCount} files • ${formatFileSize(storageStats.totalBytes)}` : 'Shared with ' + partnerName}
            </span>
          </div>

          <div className="media-gallery-actions">
            <button
              type="button"
              className={`media-action-pill-btn ${isSelectMode ? 'primary' : ''}`}
              onClick={() => {
                setIsSelectMode(!isSelectMode);
                setSelectedIds(new Set());
              }}
            >
              {isSelectMode ? 'Cancel Select' : 'Select'}
            </button>

            <button
              type="button"
              className="media-action-pill-btn primary"
              onClick={() => handleExportZip(false)}
              disabled={messages.length === 0 || exporting}
              title="Download all media files in an organized ZIP archive"
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                <polyline points="7 10 12 15 17 10" />
                <line x1="12" y1="15" x2="12" y2="3" />
              </svg>
              <span>Download All (ZIP)</span>
            </button>

            <button type="button" className="media-close-btn" onClick={onClose} aria-label="Close">
              <IconClose size={18} />
            </button>
          </div>
        </div>

        {/* Category Pills Navigation */}
        <div className="media-categories-bar">
          {(['all', 'photos', 'videos', 'documents', 'voice', 'other'] as MediaCategory[]).map(cat => {
            const count = storageStats?.categories?.[cat]?.count;
            return (
              <button
                key={cat}
                type="button"
                className={`media-category-chip ${activeCategory === cat ? 'active' : ''}`}
                onClick={() => setActiveCategory(cat)}
              >
                {cat.charAt(0).toUpperCase() + cat.slice(1)} {count !== undefined ? `(${count})` : ''}
              </button>
            );
          })}
        </div>

        {/* Multi-Select Toolbar */}
        {isSelectMode && (
          <div className="media-selection-toolbar">
            <div className="media-selection-info">
              <span>{selectedIds.size} selected</span>
              <button type="button" className="media-toolbar-btn" onClick={handleSelectAllVisible}>
                Select all visible
              </button>
              {selectedIds.size > 0 && (
                <button type="button" className="media-toolbar-btn" onClick={handleClearSelection}>
                  Clear
                </button>
              )}
            </div>

            <div style={{ display: 'flex', gap: 10 }}>
              {selectedIds.size > 0 && (
                <>
                  <button
                    type="button"
                    className="media-action-pill-btn"
                    style={{ background: 'rgba(239, 68, 68, 0.2)', borderColor: 'rgba(239, 68, 68, 0.4)', color: '#fca5a5' }}
                    onClick={handleDeleteSelected}
                  >
                    Delete Selected
                  </button>
                  <button
                    type="button"
                    className="media-action-pill-btn primary"
                    onClick={() => handleExportZip(true)}
                  >
                    Download Selected ({selectedIds.size})
                  </button>
                </>
              )}
            </div>
          </div>
        )}

        {/* Body Content */}
        <div className="media-gallery-body">
          {loading && messages.length === 0 ? (
            <div className="media-empty-state">
              <div className="media-export-spinner" />
              <p className="media-empty-text">Loading media gallery...</p>
            </div>
          ) : messages.length === 0 ? (
            <div className="media-empty-state">
              <div className="media-empty-icon">📁</div>
              <p className="media-empty-text">No {activeCategory === 'all' ? 'media' : activeCategory} shared yet</p>
            </div>
          ) : activeCategory === 'photos' || activeCategory === 'videos' || activeCategory === 'all' ? (
            <div className="media-grid">
              {messages.map(msg => {
                const id = msg.id || (msg as any)._id;
                const isSelected = selectedIds.has(id);
                const isVideo = msg.type === 'video';
                const mediaUrl = msg.mediaUrl || '';
                if (!mediaUrl) return null;

                return (
                  <div
                    key={id}
                    className={`media-card ${isSelected ? 'selected' : ''}`}
                    onClick={e => {
                      if (isSelectMode) {
                        toggleSelect(id, e);
                      } else if (msg.type === 'image') {
                        setPreviewMedia({ url: mediaUrl, type: 'image', title: msg.fileName || 'Photo' });
                      } else if (msg.type === 'video') {
                        setPreviewMedia({ url: mediaUrl, type: 'video', title: msg.fileName || 'Video' });
                      } else {
                        downloadMediaFile(conversationId, mediaUrl, msg.fileName || 'file');
                      }
                    }}
                  >
                    {isSelectMode && (
                      <div className={`media-card-checkbox ${isSelected ? 'checked' : ''}`}>
                        {isSelected && <span style={{ color: '#fff', fontSize: 13, fontWeight: 700 }}>✓</span>}
                      </div>
                    )}

                    {!isSelectMode && (
                      <button
                        type="button"
                        className="media-card-quick-download"
                        title="Download"
                        onClick={e => {
                          e.stopPropagation();
                          downloadMediaFile(conversationId, mediaUrl, msg.fileName || 'file');
                        }}
                      >
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                          <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                          <polyline points="7 10 12 15 17 10" />
                          <line x1="12" y1="15" x2="12" y2="3" />
                        </svg>
                      </button>
                    )}

                    {msg.type === 'image' ? (
                      <AuthenticatedImage
                        conversationId={conversationId}
                        mediaUrl={mediaUrl}
                        alt={msg.fileName || 'Image'}
                        className="media-card-img"
                      />
                    ) : isVideo ? (
                      <div className="media-card-video-overlay">
                        <div className="media-video-play-badge">▶</div>
                      </div>
                    ) : (
                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%', background: 'rgba(255,255,255,0.03)' }}>
                        <IconDocument size={32} color="#a78bfa" />
                      </div>
                    )}

                    <div className="media-card-meta-badge">
                      <span>{msg.fileSize ? formatFileSize(msg.fileSize) : ''}</span>
                      <span>{new Date(msg.createdAt).toLocaleDateString([], { month: 'short', day: 'numeric' })}</span>
                    </div>
                  </div>
                );
              })}
            </div>
          ) : (
            /* List View for Documents & Voice */
            <div className="media-list">
              {messages.map(msg => {
                const id = msg.id || (msg as any)._id;
                const isSelected = selectedIds.has(id);
                const isVoice = msg.type === 'audio';

                return (
                  <div
                    key={id}
                    className={`media-list-item ${isSelected ? 'selected' : ''}`}
                    onClick={e => {
                      if (isSelectMode) {
                        toggleSelect(id, e);
                      }
                    }}
                  >
                    <div className="media-list-left">
                      {isSelectMode && (
                        <div
                          className={`media-card-checkbox ${isSelected ? 'checked' : ''}`}
                          style={{ position: 'static' }}
                        >
                          {isSelected && <span style={{ color: '#fff', fontSize: 13, fontWeight: 700 }}>✓</span>}
                        </div>
                      )}

                      <div className="media-file-icon-box">
                        {isVoice ? (
                          <span style={{ fontSize: 20 }}>🎙️</span>
                        ) : (
                          <IconDocument size={22} color="#c4b5fd" />
                        )}
                      </div>

                      <div className="media-file-info">
                        <span className="media-file-name">{msg.fileName || (isVoice ? 'Voice Note' : 'Document')}</span>
                        <div className="media-file-sub">
                          <span>{msg.fileSize ? formatFileSize(msg.fileSize) : ''}</span>
                          <span>•</span>
                          <span>{new Date(msg.createdAt).toLocaleDateString([], { month: 'short', day: 'numeric', year: 'numeric' })}</span>
                          {isVoice && msg.duration && (
                            <>
                              <span>•</span>
                              <span>{Math.round(msg.duration)}s</span>
                            </>
                          )}
                        </div>
                      </div>
                    </div>

                    <div className="media-list-right">
                      {isVoice && (
                        <button
                          type="button"
                          className="media-action-pill-btn"
                          onClick={e => handlePlayVoice(msg, e)}
                        >
                          {playingAudioId === id ? '⏸ Pause' : '▶ Play'}
                        </button>
                      )}

                      <button
                        type="button"
                        className="media-action-pill-btn"
                        onClick={e => {
                          e.stopPropagation();
                          if (msg.mediaUrl) {
                            downloadMediaFile(conversationId, msg.mediaUrl, msg.fileName || 'file');
                          }
                        }}
                      >
                        Download
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          {/* Load More Pagination */}
          {hasMore && !loading && (
            <div style={{ display: 'flex', justifyContent: 'center', marginTop: 18 }}>
              <button
                type="button"
                className="media-action-pill-btn"
                onClick={() => fetchMedia(false, nextCursor)}
              >
                Load More Files
              </button>
            </div>
          )}
        </div>

        {/* Live Export Progress Overlay */}
        {exporting && (
          <div className="media-export-overlay">
            <div className="media-export-spinner" />
            <h4 className="media-export-title">Exporting Wibby Media</h4>
            <div className="media-export-progress-bar-rail">
              <div
                className="media-export-progress-bar-fill"
                style={{ width: `${exportProgress.percent}%` }}
              />
            </div>
            <span className="media-export-status-text">{exportProgress.statusText}</span>
          </div>
        )}

        {/* Full Image Lightbox / Video Preview */}
        {previewMedia && (
          <div
            className="media-gallery-overlay"
            style={{ zIndex: 10001, background: 'rgba(0,0,0,0.92)' }}
            onClick={() => setPreviewMedia(null)}
          >
            <div
              style={{ position: 'relative', maxWidth: '90vw', maxHeight: '90vh', display: 'flex', flexDirection: 'column', alignItems: 'center' }}
              onClick={e => e.stopPropagation()}
            >
              <button
                type="button"
                className="media-close-btn"
                style={{ position: 'absolute', top: -40, right: 0 }}
                onClick={() => setPreviewMedia(null)}
              >
                ✕
              </button>

              {previewMedia.type === 'image' ? (
                <AuthenticatedImage
                  conversationId={conversationId}
                  mediaUrl={previewMedia.url}
                  alt={previewMedia.title}
                  style={{ maxWidth: '90vw', maxHeight: '82vh', objectFit: 'contain', borderRadius: 8 }}
                />
              ) : (
                <video
                  src={previewMedia.url}
                  controls
                  autoPlay
                  style={{ maxWidth: '90vw', maxHeight: '82vh', borderRadius: 8 }}
                />
              )}

              <div style={{ marginTop: 12, display: 'flex', gap: 12 }}>
                <button
                  type="button"
                  className="media-action-pill-btn primary"
                  onClick={() => downloadMediaFile(conversationId, previewMedia.url, previewMedia.title)}
                >
                  Download {previewMedia.title}
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>,
    document.body
  );
}
