import type { Message } from '../types/chat';
import { formatFileSize, formatAudioDuration } from '../config/media';
import './MessageInfoModal.css';

interface MessageInfoModalProps {
  isOpen: boolean;
  message: Message | null;
  onClose: () => void;
  partnerName?: string;
  currentUserId?: string;
}

export default function MessageInfoModal({ isOpen, message, onClose }: MessageInfoModalProps) {
  if (!isOpen || !message) return null;

  const formatDate = (isoStr?: string | null) => {
    if (!isoStr) return '—';
    try {
      const d = new Date(isoStr);
      return d.toLocaleString(undefined, {
        weekday: 'short',
        month: 'short',
        day: 'numeric',
        year: 'numeric',
        hour: 'numeric',
        minute: '2-digit',
        second: '2-digit'
      });
    } catch {
      return isoStr;
    }
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'seen':
        return <span className="info-badge status-seen">✓✓ Read</span>;
      case 'delivered':
        return <span className="info-badge status-delivered">✓✓ Delivered</span>;
      case 'sent':
        return <span className="info-badge status-sent">✓ Sent</span>;
      case 'sending':
        return <span className="info-badge status-sending">⏳ Sending</span>;
      default:
        return <span className="info-badge status-failed">✕ Failed</span>;
    }
  };

  return (
    <div className="msg-info-overlay" onClick={onClose} role="dialog" aria-modal="true" aria-label="Message information">
      <div className="msg-info-card" onClick={e => e.stopPropagation()}>
        <div className="msg-info-header">
          <div className="msg-info-title-wrap">
            <span className="msg-info-icon">ℹ️</span>
            <h3 className="msg-info-title">Message Details</h3>
          </div>
          <button className="msg-info-close" onClick={onClose} aria-label="Close">✕</button>
        </div>

        <div className="msg-info-body">
          {/* Status Overview */}
          <div className="msg-info-section status-section">
            <span className="info-section-label">Current Status</span>
            <div className="info-status-row">
              {getStatusBadge(message.status)}
              {message.isPinned && <span className="info-badge pin-badge">📌 Pinned</span>}
              {message.starredBy && message.starredBy.length > 0 && <span className="info-badge star-badge">⭐ Starred</span>}
            </div>
          </div>

          {/* Timestamps */}
          <div className="msg-info-section">
            <span className="info-section-label">Timeline</span>
            <div className="info-timeline">
              <div className="timeline-item">
                <span className="timeline-icon sent">✓</span>
                <div className="timeline-details">
                  <span className="timeline-title">Sent</span>
                  <span className="timeline-time">{formatDate(message.createdAt)}</span>
                </div>
              </div>

              {message.status === 'delivered' || message.status === 'seen' ? (
                <div className="timeline-item">
                  <span className="timeline-icon delivered">✓✓</span>
                  <div className="timeline-details">
                    <span className="timeline-title">Delivered</span>
                    <span className="timeline-time">{formatDate(message.updatedAt || message.createdAt)}</span>
                  </div>
                </div>
              ) : null}

              {message.status === 'seen' ? (
                <div className="timeline-item">
                  <span className="timeline-icon seen">✓✓</span>
                  <div className="timeline-details">
                    <span className="timeline-title">Read</span>
                    <span className="timeline-time">{formatDate(message.updatedAt || message.createdAt)}</span>
                  </div>
                </div>
              ) : null}

              {message.editedAt && (
                <div className="timeline-item">
                  <span className="timeline-icon edited">✏️</span>
                  <div className="timeline-details">
                    <span className="timeline-title">Edited</span>
                    <span className="timeline-time">{formatDate(message.editedAt)}</span>
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* Message Metadata */}
          <div className="msg-info-section">
            <span className="info-section-label">Technical Metadata</span>
            <div className="info-meta-grid">
              <div className="info-meta-item">
                <span className="meta-label">Type</span>
                <span className="meta-val">{message.type || 'text'}</span>
              </div>
              {message.fileSize ? (
                <div className="info-meta-item">
                  <span className="meta-label">File Size</span>
                  <span className="meta-val">{formatFileSize(message.fileSize)}</span>
                </div>
              ) : null}
              {message.duration ? (
                <div className="info-meta-item">
                  <span className="meta-label">Duration</span>
                  <span className="meta-val">{formatAudioDuration(message.duration)}</span>
                </div>
              ) : null}
              <div className="info-meta-item full-width">
                <span className="meta-label">Message ID</span>
                <span className="meta-val monospace">{message._id}</span>
              </div>
              {message.clientMessageId && (
                <div className="info-meta-item full-width">
                  <span className="meta-label">Client ID</span>
                  <span className="meta-val monospace">{message.clientMessageId}</span>
                </div>
              )}
            </div>
          </div>
        </div>

        <div className="msg-info-footer">
          <button type="button" className="msg-info-btn-done" onClick={onClose}>
            Done
          </button>
        </div>
      </div>
    </div>
  );
}
