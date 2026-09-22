import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useSocket } from '../context/SocketContext';
import { useAuth } from '../context/AuthContext';
import { formatMessageTime } from '../utils/time';
import { formatFileSize, formatAudioDuration } from '../config/media';
import { downloadMediaFile } from '../services/mediaService';
import { generateUUID } from '../utils/uuid';
import MessageComposer from './MessageComposer';
import MessageContextMenu from './MessageContextMenu';
import MessageActionBar from './MessageActionBar';
import EmojiPicker from './EmojiPicker';
import ImageLightbox from './ImageLightbox';
import VoiceMessagePlayer from './VoiceMessagePlayer';
import MessageInfoModal from './MessageInfoModal';
import LinkPlayerModal from './LinkPlayerModal';
import MiniMapWidget from './MiniMapWidget';
import { AuthenticatedImage, AuthenticatedVideo } from './AuthenticatedMedia';
import { resolvePartnerName } from '../utils/partnerName';
import type { Message, PollData } from '../types/chat';
import './MessageArea.css';

export type { Message };

export function normalizeMessage(raw: any): Message {
  if (!raw) {
    return {
      _id: `temp_${Date.now()}`,
      conversationId: '',
      senderId: '',
      createdAt: new Date().toISOString(),
      status: 'failed'
    };
  }

  const _id = raw._id ? (typeof raw._id === 'object' ? raw._id.toString() : String(raw._id)) : (raw.id || `temp_${Date.now()}`);
  const conversationId = raw.conversationId ? (typeof raw.conversationId === 'object' ? raw.conversationId.toString() : String(raw.conversationId)) : '';
  const replyToMessageId = raw.replyToMessageId ? (typeof raw.replyToMessageId === 'object' ? raw.replyToMessageId.toString() : String(raw.replyToMessageId)) : null;
  const forwardedFromMessageId = raw.forwardedFromMessageId ? (typeof raw.forwardedFromMessageId === 'object' ? raw.forwardedFromMessageId.toString() : String(raw.forwardedFromMessageId)) : null;

  // Canonical type resolution
  let type: any = raw.type;
  if (type === 'call') {
    type = 'call';
  } else if (type === 'poll' || raw.poll) {
    type = 'poll';
  } else if (type === 'location' || raw.location) {
    type = 'location';
  } else if (type === 'contact' || raw.contact) {
    type = 'contact';
  } else if (type === 'sticker' || raw.sticker) {
    type = 'sticker';
  } else if (!type || (type as string) === 'voice') {
    if (raw.mediaUrl?.includes('voice_') || raw.mimeType?.startsWith('audio/') || (type as string) === 'voice') {
      type = 'audio';
    } else if (raw.mimeType?.startsWith('image/') || /\.(jpg|jpeg|png|webp|gif)$/i.test(raw.fileName || '')) {
      type = 'image';
    } else if (raw.mimeType?.startsWith('video/') || /\.(mp4|webm|mov|qt)$/i.test(raw.fileName || '')) {
      type = 'video';
    } else if (raw.mediaUrl) {
      type = 'file';
    } else {
      type = 'text';
    }
  }

  return {
    _id,
    id: _id,
    clientMessageId: raw.clientMessageId || undefined,
    conversationId,
    senderId: raw.senderId || '',
    type,
    text: typeof raw.text === 'string' ? raw.text : '',
    mediaUrl: raw.mediaUrl || undefined,
    mediaKey: raw.mediaKey || undefined,
    mimeType: raw.mimeType || undefined,
    fileName: raw.fileName || undefined,
    fileSize: typeof raw.fileSize === 'number' ? raw.fileSize : (raw.fileSize ? Number(raw.fileSize) : undefined),
    duration: raw.duration !== undefined && raw.duration !== null && !isNaN(raw.duration) ? Number(raw.duration) : undefined,
    waveform: Array.isArray(raw.waveform) ? raw.waveform : undefined,
    thumbnailUrl: raw.thumbnailUrl || null,
    reactions: Array.isArray(raw.reactions) ? raw.reactions : [],
    createdAt: raw.createdAt || new Date().toISOString(),
    updatedAt: raw.updatedAt || undefined,
    editedAt: raw.editedAt || null,
    deletedAt: raw.deletedAt || null,
    deletedFor: Array.isArray(raw.deletedFor) ? raw.deletedFor : [],
    deletedForEveryone: !!raw.deletedAt,
    status: raw.status || 'sent',
    replyToMessageId,
    forwardedFromMessageId,
    starredBy: Array.isArray(raw.starredBy) ? raw.starredBy : [],
    isPinned: Boolean(raw.isPinned),
    pinnedAt: raw.pinnedAt || null,
    pinnedBy: raw.pinnedBy || null,
    expiresAt: raw.expiresAt || null,
    poll: raw.poll || null,
    location: raw.location || null,
    contact: raw.contact || null,
    sticker: raw.sticker || null,
    linkPreview: raw.linkPreview || null
  };
}

function getMediaReplySnippet(msg?: Message | null): string {
  if (!msg) return 'Original message';
  if (msg.deletedAt) return '🚫 This message was deleted';
  if (msg.type === 'image') return msg.text ? `🖼️ ${msg.text}` : '🖼️ Photo';
  if (msg.type === 'video') return msg.text ? `🎥 ${msg.text}` : '🎥 Video';
  if (msg.type === 'file') return `📄 ${msg.fileName || 'Document'}`;
  if (msg.type === 'audio' || (msg as any).type === 'voice') return `🎙️ Voice message (${formatAudioDuration(msg.duration || 0)})`;
  if (msg.type === 'poll' || msg.poll) return `📊 Poll: ${msg.poll?.question || msg.text || 'Poll'}`;
  if (msg.type === 'location' || msg.location) return `📍 Location: ${msg.location?.name || 'Shared Location'}`;
  if (msg.type === 'contact' || msg.contact) return `👤 Contact: ${msg.contact?.name || 'Contact'}`;
  if (msg.type === 'sticker' || msg.sticker) return `✨ Sticker`;
  return msg.text || '';
}

function MessageBubbleBody({
  msg,
  isOwn,
  currentUserId,
  onImageClick,
  onDownloadFile,
  onVotePoll,
  onOpenLink,
  onStopLiveLocation
}: {
  msg: Message;
  isOwn?: boolean;
  currentUserId?: string;
  onImageClick: (msg: Message) => void;
  onDownloadFile: (msg: Message) => void;
  onVotePoll?: (msgId: string, optionIndex: number) => void;
  onOpenLink?: (url: string, title?: string) => void;
  onStopLiveLocation?: (msgId: string) => void;
}) {
  const isCall = msg.type === 'call';
  const isAudio = msg.type === 'audio' || (msg as any).type === 'voice' || (Boolean(msg.mediaUrl) && (msg.mimeType?.startsWith('audio/') || msg.mediaUrl?.includes('voice_')));
  const isImage = msg.type === 'image' || (Boolean(msg.mediaUrl) && (msg.mimeType?.startsWith('image/') || /\.(jpg|jpeg|png|webp|gif)$/i.test(msg.fileName || '')));
  const isVideo = msg.type === 'video' || (Boolean(msg.mediaUrl) && (msg.mimeType?.startsWith('video/') || /\.(mp4|webm|mov|qt)$/i.test(msg.fileName || '')));
  const isFile = msg.type === 'file' || Boolean(msg.mediaUrl && !isAudio && !isImage && !isVideo && !isCall);

  if (isCall) {
    const isMissed = msg.text?.toLowerCase().includes('missed') || msg.text?.toLowerCase().includes('declined') || msg.text?.toLowerCase().includes('cancelled');
    return (
      <div className={`message-call-block ${isMissed ? 'missed' : 'completed'}`}>
        <div className="message-call-icon">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z" />
          </svg>
        </div>
        <div className="message-call-info">
          <span className="message-call-title">{msg.text || 'Voice call'}</span>
          {msg.duration !== undefined && msg.duration !== null && msg.duration > 0 ? (
            <span className="message-call-duration">{formatAudioDuration(msg.duration)}</span>
          ) : null}
        </div>
      </div>
    );
  }

  // Poll block
  if (msg.poll || msg.type === 'poll') {
    const poll = msg.poll;
    if (poll) {
      const totalVotes = (poll.options || []).reduce((sum, opt) => sum + (opt.votes ? opt.votes.length : 0), 0);
      return (
        <div className="message-poll-block">
          <div className="poll-question">{poll.question}</div>
          <div className="poll-options">
            {poll.options.map((opt, idx) => {
              const count = opt.votes ? opt.votes.length : 0;
              const pct = totalVotes > 0 ? Math.round((count / totalVotes) * 100) : 0;
              const hasVoted = currentUserId && opt.votes ? opt.votes.includes(currentUserId) : false;
              return (
                <button
                  key={opt.id || idx}
                  className={`poll-option-btn ${hasVoted ? 'voted' : ''}`}
                  onClick={(e) => {
                    e.stopPropagation();
                    if (onVotePoll) onVotePoll(msg._id, idx);
                  }}
                >
                  <div className="poll-option-fill" style={{ width: `${pct}%` }} />
                  <div className="poll-option-row">
                    <span className="poll-option-text">{hasVoted ? '✓ ' : ''}{opt.text}</span>
                    <span className="poll-option-pct">{count} ({pct}%)</span>
                  </div>
                </button>
              );
            })}
          </div>
          <div className="poll-footer">
            <span>{totalVotes} {totalVotes === 1 ? 'vote' : 'votes'}</span>
            {poll.allowMultiple && <span>Multiple choices</span>}
          </div>
        </div>
      );
    }
  }

  // Location block (Live & Static Mini Map Widget)
  if (msg.location || msg.type === 'location') {
    const loc = msg.location;
    if (loc) {
      return (
        <div className="message-location-bubble-container">
          <MiniMapWidget
            latitude={loc.latitude}
            longitude={loc.longitude}
            name={loc.name}
            address={loc.address}
            isLive={loc.isLive}
            liveUntil={loc.liveUntil}
            stoppedAt={loc.stoppedAt}
            accuracy={loc.accuracy}
            speed={loc.speed}
            heading={loc.heading}
            isSender={isOwn}
            onStopLive={onStopLiveLocation ? () => onStopLiveLocation(msg._id) : undefined}
            height={185}
            allowExpand={true}
          />
          {msg.text && <div className="bubble-caption-text">{msg.text}</div>}
        </div>
      );
    }
  }

  // Contact block
  if (msg.contact || msg.type === 'contact') {
    const c = msg.contact;
    if (c) {
      const initials = (c.name || 'C').slice(0, 2).toUpperCase();
      return (
        <div className="message-contact-block">
          <div className="contact-card">
            <div className="contact-avatar">{initials}</div>
            <div className="contact-info">
              <span className="contact-name">{c.name}</span>
              {c.phone && <span className="contact-phone">{c.phone}</span>}
              {c.email && <span className="contact-email">{c.email}</span>}
            </div>
          </div>
          <div className="contact-actions">
            {c.phone && (
              <a href={`tel:${c.phone}`} className="contact-action-btn" onClick={(e) => e.stopPropagation()}>
                Call
              </a>
            )}
            <button
              className="contact-action-btn"
              onClick={(e) => {
                e.stopPropagation();
                navigator.clipboard.writeText(`${c.name}\n${c.phone || ''}\n${c.email || ''}`.trim());
              }}
            >
              Copy
            </button>
          </div>
        </div>
      );
    }
  }

  // Sticker block
  if (msg.sticker || msg.type === 'sticker') {
    const s = msg.sticker;
    if (s && s.url) {
      return (
        <div className="message-sticker-block">
          <img src={s.url} alt="Sticker" className="sticker-img" loading="lazy" />
        </div>
      );
    }
  }

  if (isAudio) {
    return (
      <div className="message-media-block message-audio-block">
        <VoiceMessagePlayer message={msg as any} isOwn={isOwn} />
        {msg.text && (
          <div className="bubble-caption-text">
            {msg.text}
            {msg.editedAt && <span className="edited-indicator">(edited)</span>}
          </div>
        )}
      </div>
    );
  }

  if (isImage && msg.mediaUrl) {
    return (
      <div className="message-media-block">
        <div 
          className="bubble-image-wrap" 
          onClick={(e) => {
            e.stopPropagation();
            onImageClick(msg);
          }}
          role="button"
          tabIndex={0}
          aria-label="View photo"
        >
          <AuthenticatedImage 
            conversationId={msg.conversationId}
            mediaUrl={msg.mediaUrl} 
            alt={msg.fileName || 'Photo'} 
            className="bubble-image" 
          />
        </div>
        {msg.text && (
          <div className="bubble-caption-text">
            {msg.text}
            {msg.editedAt && <span className="edited-indicator">(edited)</span>}
          </div>
        )}
      </div>
    );
  }

  if (isVideo && msg.mediaUrl) {
    return (
      <div className="message-media-block">
        <div className="bubble-video-wrap">
          <AuthenticatedVideo 
            conversationId={msg.conversationId}
            mediaUrl={msg.mediaUrl} 
            fileName={msg.fileName}
            className="bubble-video" 
          />
        </div>
        {msg.text && (
          <div className="bubble-caption-text">
            {msg.text}
            {msg.editedAt && <span className="edited-indicator">(edited)</span>}
          </div>
        )}
      </div>
    );
  }

  if (isFile && msg.mediaUrl) {
    return (
      <div className="message-media-block">
        <div 
          className="bubble-file-card" 
          onClick={(e) => {
            e.stopPropagation();
            onDownloadFile(msg);
          }}
          role="button"
          tabIndex={0}
          aria-label={`Download document ${msg.fileName || ''}`}
        >
          <div className="bubble-file-icon">📄</div>
          <div className="bubble-file-info">
            <span className="bubble-file-name" title={msg.fileName}>
              {msg.fileName || 'Document'}
            </span>
            <span className="bubble-file-meta">
              {msg.fileName?.split('.').pop()?.toUpperCase() || 'FILE'} · {formatFileSize(msg.fileSize || 0)}
            </span>
          </div>
          <button 
            className="bubble-file-download-btn"
            onClick={(e) => {
              e.stopPropagation();
              onDownloadFile(msg);
            }}
            aria-label="Download document"
            title="Download document"
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
              <polyline points="7 10 12 15 17 10" />
              <line x1="12" y1="15" x2="12" y2="3" />
            </svg>
          </button>
        </div>
        {msg.text && (
          <div className="bubble-caption-text">
            {msg.text}
            {msg.editedAt && <span className="edited-indicator">(edited)</span>}
          </div>
        )}
      </div>
    );
  }

  // Link preview rich card
  if (msg.linkPreview) {
    const lp = msg.linkPreview;
    return (
      <div className="message-content">
        <div>{msg.text}</div>
        {msg.editedAt && <span className="edited-indicator">(edited)</span>}
        <div
          className="message-link-card"
          onClick={(e) => {
            e.stopPropagation();
            if (onOpenLink) {
              onOpenLink(lp.url, lp.title);
            } else {
              window.open(lp.url, '_blank');
            }
          }}
          role="button"
          tabIndex={0}
          style={{ cursor: 'pointer' }}
        >
          {lp.image && <img src={lp.image} alt={lp.title} className="link-preview-image" />}
          <div className="link-preview-body">
            {lp.siteName && <span className="link-preview-site">{lp.siteName}</span>}
            <span className="link-preview-title">{lp.title}</span>
            {lp.description && <span className="link-preview-desc">{lp.description}</span>}
          </div>
        </div>
      </div>
    );
  }

  // Default text message
  if (msg.text && msg.text.trim().length > 0) {
    const urlRegex = /(https?:\/\/[^\s]+)/g;
    const parts = msg.text.split(urlRegex);

    return (
      <div className="message-content">
        {parts.map((part, idx) => {
          if (part.match(urlRegex)) {
            return (
              <a
                key={idx}
                href={part}
                onClick={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  if (onOpenLink) {
                    onOpenLink(part, 'Shared Media');
                  } else {
                    window.open(part, '_blank');
                  }
                }}
                className="bubble-inline-link"
                style={{
                  textDecoration: 'underline',
                  color: 'inherit',
                  fontWeight: 600,
                  wordBreak: 'break-all',
                  cursor: 'pointer'
                }}
                title="Play in pop-up player"
              >
                {part}
              </a>
            );
          }
          return part;
        })}
        {msg.editedAt && <span className="edited-indicator">(edited)</span>}
      </div>
    );
  }

  // Diagnostic-safe fallback for empty messages instead of rendering an invisible blank bubble
  console.warn('BLANK MESSAGE RENDERED', {
    id: msg._id,
    type: msg.type,
    senderId: msg.senderId,
    text: msg.text,
    mediaKey: msg.mediaKey,
    mediaUrl: msg.mediaUrl,
    mimeType: msg.mimeType,
    createdAt: msg.createdAt
  });

  return (
    <div className="message-content message-fallback-unavailable">
      <span style={{ fontStyle: 'italic', opacity: 0.65, fontSize: '0.85rem' }}>Message unavailable</span>
    </div>
  );
}

function IncomingMessage({ 
  msg, 
  onVisible, 
  replyToMessage,
  renderReactions,
  onNavigateToReply,
  partnerName,
  currentUserId,
  onImageClick,
  onDownloadFile,
  onVotePoll,
  onOpenLink
}: { 
  msg: Message, 
  onVisible: (id: string) => void, 
  replyToMessage?: Message,
  renderReactions: (reactions?: { senderId: string; emoji: string }[]) => React.ReactNode,
  onNavigateToReply?: (targetId: string) => void,
  partnerName?: string,
  currentUserId?: string,
  onImageClick: (msg: Message) => void,
  onDownloadFile: (msg: Message) => void,
  onVotePoll?: (msgId: string, optionIndex: number) => void,
  onOpenLink?: (url: string, title?: string) => void
}) {
  const ref = useRef<HTMLDivElement>(null);
  
  useEffect(() => {
    if (msg.status === 'seen') return;
    
    const observer = new IntersectionObserver(([entry]) => {
      if (entry.isIntersecting) {
        onVisible(msg._id);
        observer.disconnect();
      }
    }, { threshold: 0.5 });
    
    if (ref.current) observer.observe(ref.current);
    return () => observer.disconnect();
  }, [msg._id, msg.status, onVisible]);

  const isStarred = currentUserId && msg.starredBy ? msg.starredBy.includes(currentUserId) : false;

  return (
    <>
      <div className={`message-bubble ${msg.deletedAt ? 'deleted' : ''}`} ref={ref}>
        {msg.deletedAt ? (
          <div className="message-row">
            <div className="message-content deleted-text">
              🚫 {msg.deletedForEveryone ? 'This message was deleted' : 'You deleted this message'}
            </div>
            <div className="message-meta">
              <span className="message-time">{formatMessageTime(msg.createdAt)}</span>
            </div>
          </div>
        ) : (
          <>
            {msg.forwardedFromMessageId && (
              <div className="message-forwarded-indicator">
                <span className="forward-icon">↗</span> Forwarded
              </div>
            )}
            {replyToMessage && (
              <div 
                className="message-reply-preview"
                role="button"
                tabIndex={0}
                aria-label={`In reply to: ${getMediaReplySnippet(replyToMessage)}`}
                title="Jump to original message"
                onClick={(e) => {
                  e.stopPropagation();
                  if (msg.replyToMessageId && onNavigateToReply) {
                    onNavigateToReply(msg.replyToMessageId);
                  }
                }}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault();
                    e.stopPropagation();
                    if (msg.replyToMessageId && onNavigateToReply) {
                      onNavigateToReply(msg.replyToMessageId);
                    }
                  }
                }}
              >
                <span className="reply-sender">
                  {replyToMessage ? (replyToMessage.senderId === msg.senderId ? (partnerName || 'Them') : 'You') : 'Original message'}
                </span>
                <span className="reply-text">
                  {getMediaReplySnippet(replyToMessage)}
                </span>
              </div>
            )}
            <div className="message-row">
              <MessageBubbleBody
                msg={msg}
                isOwn={false}
                currentUserId={currentUserId}
                onImageClick={onImageClick}
                onDownloadFile={onDownloadFile}
                onVotePoll={onVotePoll}
                onOpenLink={onOpenLink}
              />
              <div className="message-meta">
                {msg.isPinned && <span className="badge-pin" title="Pinned message">📌</span>}
                {isStarred && <span className="badge-star" title="Starred message">⭐</span>}
                <span className="message-time">{formatMessageTime(msg.createdAt)}</span>
              </div>
            </div>
          </>
        )}
      </div>
      {!msg.deletedAt && renderReactions(msg.reactions)}
    </>
  );
}


interface MessageAreaProps {
  conversationId: string;
  partner?: {
    display_name?: string;
    displayName?: string;
    username?: string;
    email?: string;
  };
  onOpenGame?: () => void;
}

export default function MessageArea({ conversationId, partner, onOpenGame }: MessageAreaProps) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [loading, setLoading] = useState(true);
  const [contextMenu, setContextMenu] = useState<{ msgId: string, x: number, y: number } | null>(null);
  const [isSelectMode, setIsSelectMode] = useState(false);
  const [selectedMessages, setSelectedMessages] = useState<Set<string>>(new Set());
  const [replyingTo, setReplyingTo] = useState<{ id: string; text: string; sender: string } | null>(null);
  const [editingMessage, setEditingMessage] = useState<{ id: string; text: string } | null>(null);
  const [toastMessage, setToastMessage] = useState<string | null>(null);
  const [hoveredMessageId, setHoveredMessageId] = useState<string | null>(null);
  const [emojiPicker, setEmojiPicker] = useState<{ msgId: string, anchorRect: DOMRect, isOwn: boolean } | null>(null);
  const [highlightedMessageId, setHighlightedMessageId] = useState<string | null>(null);
  const [selectedLightboxMsg, setSelectedLightboxMsg] = useState<Message | null>(null);
  const [selectedInfoMsg, setSelectedInfoMsg] = useState<Message | null>(null);
  const [linkPlayer, setLinkPlayer] = useState<{ url: string; title?: string } | null>(null);
  const [droppedFilesForComposer, setDroppedFilesForComposer] = useState<File[] | null>(null);
  const [isDraggingOverChat, setIsDraggingOverChat] = useState(false);
  const [isPartnerTyping, setIsPartnerTyping] = useState(false);
  const typingTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  
  const { socket } = useSocket();
  const { user } = useAuth();
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const longPressTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const highlightTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const messageRefs = useRef<Map<string, HTMLDivElement>>(new Map());
  const chatDragCounterRef = useRef<number>(0);

  const partnerName = resolvePartnerName(partner);

  // Prevent browser default behavior of opening dropped files
  useEffect(() => {
    const handleWindowDragOver = (e: DragEvent) => {
      e.preventDefault();
    };
    const handleWindowDrop = (e: DragEvent) => {
      e.preventDefault();
    };

    window.addEventListener('dragover', handleWindowDragOver);
    window.addEventListener('drop', handleWindowDrop);

    return () => {
      window.removeEventListener('dragover', handleWindowDragOver);
      window.removeEventListener('drop', handleWindowDrop);
    };
  }, []);

  const handleChatDragEnter = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    chatDragCounterRef.current += 1;
    if (e.dataTransfer.types && Array.from(e.dataTransfer.types).includes('Files')) {
      setIsDraggingOverChat(true);
    }
  };

  const handleChatDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    chatDragCounterRef.current -= 1;
    if (chatDragCounterRef.current <= 0) {
      chatDragCounterRef.current = 0;
      setIsDraggingOverChat(false);
    }
  };

  const handleChatDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    e.dataTransfer.dropEffect = 'copy';
  };

  const handleChatDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    chatDragCounterRef.current = 0;
    setIsDraggingOverChat(false);

    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      const files = Array.from(e.dataTransfer.files);
      setDroppedFilesForComposer(files);
    }
  };

  const scrollToBottom = useCallback(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, []);

  const showToast = (msg: string) => {
    setToastMessage(msg);
    setTimeout(() => setToastMessage(null), 2500);
  };

  const handleNavigateToReply = useCallback(async (targetId: string) => {
    const targetElement = messageRefs.current.get(targetId) || (document.querySelector(`[data-message-id="${targetId}"]`) as HTMLDivElement | null);

    if (targetElement) {
      targetElement.scrollIntoView({ behavior: 'smooth', block: 'center' });
      
      setHighlightedMessageId(targetId);
      if (highlightTimerRef.current) {
        clearTimeout(highlightTimerRef.current);
      }
      highlightTimerRef.current = setTimeout(() => {
        setHighlightedMessageId(null);
        highlightTimerRef.current = null;
      }, 1800);
      return;
    }

    if (!user || !conversationId) return;

    try {
      const token = await user.getIdToken();
      const url = `${import.meta.env.VITE_API_URL || 'http://localhost:3000'}/api/conversations/${conversationId}/messages/${targetId}`;
      const response = await fetch(url, {
        headers: { 'Authorization': `Bearer ${token}` }
      });

      if (!response.ok) {
        showToast('Original message not found');
        return;
      }

      const data = await response.json();
      if (data.message) {
        setMessages(prev => {
          if (prev.some(m => m._id === data.message._id)) return prev;
          const updated = [...prev, data.message];
          updated.sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());
          return updated;
        });

        setTimeout(() => {
          const el = messageRefs.current.get(targetId) || (document.querySelector(`[data-message-id="${targetId}"]`) as HTMLDivElement | null);
          if (el) {
            el.scrollIntoView({ behavior: 'smooth', block: 'center' });
            setHighlightedMessageId(targetId);
            if (highlightTimerRef.current) {
              clearTimeout(highlightTimerRef.current);
            }
            highlightTimerRef.current = setTimeout(() => {
              setHighlightedMessageId(null);
              highlightTimerRef.current = null;
            }, 1800);
          }
        }, 100);
      }
    } catch (err) {
      console.error('Failed to retrieve replied message:', err);
      showToast('Could not load original message');
    }
  }, [user, conversationId]);

  useEffect(() => {
    return () => {
      if (highlightTimerRef.current) {
        clearTimeout(highlightTimerRef.current);
      }
    };
  }, []);

  const fetchMessages = useCallback(async () => {
    if (!user || !conversationId) return;
    try {
      const token = await user.getIdToken();
      const url = `${import.meta.env.VITE_API_URL || 'http://localhost:3000'}/api/conversations/${conversationId}/messages?limit=50`;
      const response = await fetch(url, {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      const data = await response.json();
      if (response.ok) {
        const loaded = (data.messages || []).map(normalizeMessage);
        setMessages(loaded);
        setTimeout(scrollToBottom, 100);

        // Bulk delivery-ack: for any partner messages that are still 'sent' (not yet delivered),
        // emit acks so the sender sees double ticks. We do this once after the initial load.
        if (socket && socket.connected) {
          const undelivered = loaded.filter(
            (m: Message) => m.senderId !== user?.uid && (m.status === 'sent' || !m.status)
          );
          undelivered.forEach((m: Message) => {
            socket.emit('message:delivery-ack', {
              messageId: m._id,
              conversationId
            });
          });
        }
      }
    } catch (err) {
      console.error('Failed to fetch messages:', err);
    } finally {
      setLoading(false);
    }
  }, [user, conversationId, scrollToBottom]);

  useEffect(() => {
    fetchMessages();
  }, [fetchMessages]);

  useEffect(() => {
    if (!socket || !conversationId) return;

    const joinRoom = () => {
      socket.emit('join_conversation', conversationId);
    };

    if (socket.connected) {
      joinRoom();
    }

    socket.on('connect', joinRoom);

    const handleNewMessage = (rawMessage: any) => {
      const message = normalizeMessage(rawMessage);

      // Filter by conversationId if present
      if (message.conversationId && message.conversationId !== conversationId) {
        return;
      }

      setMessages(prev => {
        // Prevent duplicates
        if (prev.some(m => m._id === message._id)) {
          return prev;
        }
        
        // Reconcile optimistic message
        if (message.clientMessageId) {
          const index = prev.findIndex(m => 
            (m.clientMessageId && m.clientMessageId === message.clientMessageId) || 
            (m._id && m._id === message.clientMessageId)
          );
          if (index !== -1) {
            const next = [...prev];
            next[index] = message;
            return next;
          }
        }
        
        // If incoming, acknowledge delivery
        if (message.senderId !== user?.uid) {
          socket.emit('message:delivery-ack', {
            messageId: message._id,
            conversationId
          });
        }
        
        return [...prev, message];
      });
      setIsPartnerTyping(false);
      if (typingTimeoutRef.current) {
        clearTimeout(typingTimeoutRef.current);
        typingTimeoutRef.current = null;
      }
      setTimeout(scrollToBottom, 100);
    };

    const handleTypingStart = (data: { conversationId: string, userId: string }) => {
      if (data.conversationId !== conversationId) return;
      if (data.userId === user?.uid) return;

      setIsPartnerTyping(true);
      setTimeout(scrollToBottom, 50);

      if (typingTimeoutRef.current) {
        clearTimeout(typingTimeoutRef.current);
      }
      typingTimeoutRef.current = setTimeout(() => {
        setIsPartnerTyping(false);
        typingTimeoutRef.current = null;
      }, 3500);
    };

    const handleTypingStop = (data: { conversationId: string, userId: string }) => {
      if (data.conversationId !== conversationId) return;
      if (data.userId === user?.uid) return;

      setIsPartnerTyping(false);
      if (typingTimeoutRef.current) {
        clearTimeout(typingTimeoutRef.current);
        typingTimeoutRef.current = null;
      }
    };

    const handleStatusUpdate = (data: { messageId: string, status: string }) => {
      setMessages(prev => prev.map(m => 
        m._id === data.messageId ? { ...m, status: data.status as any } : m
      ));
    };

    const handleReaction = (data: { messageId: string, senderId: string, emoji: string }) => {
      setMessages(prev => prev.map(m => {
        if (m._id === data.messageId) {
          const otherReactions = (m.reactions || []).filter(r => r.senderId !== data.senderId);
          return {
            ...m,
            reactions: data.emoji ? [...otherReactions, { senderId: data.senderId, emoji: data.emoji }] : otherReactions
          };
        }
        return m;
      }));
    };

    const handleUpdate = (updatedMessage: any) => {
      const normalized = normalizeMessage(updatedMessage);
      setMessages(prev => prev.map(m => 
        m._id === normalized._id ? normalized : m
      ));
    };

    const handleDeleteEvent = (data: { messageId: string, conversationId: string, everyone?: boolean, deletedAt?: string }) => {
      if (data.conversationId !== conversationId) return;
      if (data.everyone === false) {
        // Delete for me: remove message completely from local view (Req 09)
        setMessages(prev => prev.filter(msg => msg._id !== data.messageId));
      } else {
        // Delete for everyone: update with deleted placeholder
        setMessages(prev => prev.map(msg => 
          msg._id === data.messageId ? { ...msg, deletedAt: data.deletedAt || new Date().toISOString(), text: 'This message was deleted' } : msg
        ));
      }
    };

    const handlePollUpdate = (data: { messageId: string; poll: PollData }) => {
      setMessages(prev => prev.map(m => m._id === data.messageId ? { ...m, poll: data.poll } : m));
    };

    const handlePinUpdate = (data: { messageId: string; isPinned: boolean; pinnedAt?: string; pinnedBy?: string }) => {
      setMessages(prev => prev.map(m => m._id === data.messageId ? { ...m, isPinned: data.isPinned, pinnedAt: data.pinnedAt, pinnedBy: data.pinnedBy } : m));
    };

    const handleStarUpdate = (data: { messageId: string; starredBy: string[] }) => {
      setMessages(prev => prev.map(m => m._id === data.messageId ? { ...m, starredBy: data.starredBy } : m));
    };

    const handleLiveLocationUpdate = (data: {
      messageId: string;
      latitude: number;
      longitude: number;
      accuracy?: number;
      speed?: number;
      heading?: number;
    }) => {
      setMessages(prev => prev.map(m => {
        if (m._id === data.messageId || m.clientMessageId === data.messageId) {
          return {
            ...m,
            location: {
              ...m.location!,
              latitude: data.latitude,
              longitude: data.longitude,
              accuracy: data.accuracy ?? m.location?.accuracy,
              speed: data.speed ?? m.location?.speed,
              heading: data.heading ?? m.location?.heading
            }
          };
        }
        return m;
      }));
    };

    const handleLiveLocationStop = (data: { messageId: string; stoppedAt: string }) => {
      setMessages(prev => prev.map(m => {
        if (m._id === data.messageId || m.clientMessageId === data.messageId) {
          return {
            ...m,
            location: {
              ...m.location!,
              stoppedAt: data.stoppedAt
            }
          };
        }
        return m;
      }));
    };

    socket.on('new_message', handleNewMessage);
    socket.on('typing:start', handleTypingStart);
    socket.on('typing:stop', handleTypingStop);
    socket.on('message:status-update', handleStatusUpdate);
    socket.on('message:reaction', handleReaction);
    socket.on('message:update', handleUpdate);
    socket.on('message:delete', handleDeleteEvent);
    socket.on('poll:update', handlePollUpdate);
    socket.on('message:pin', handlePinUpdate);
    socket.on('message:unpin', handlePinUpdate);
    socket.on('message:star', handleStarUpdate);
    socket.on('location:live_update', handleLiveLocationUpdate);
    socket.on('location:live_stop', handleLiveLocationStop);

    return () => {
      socket.off('connect', joinRoom);
      socket.off('new_message', handleNewMessage);
      socket.off('typing:start', handleTypingStart);
      socket.off('typing:stop', handleTypingStop);
      socket.off('message:status-update', handleStatusUpdate);
      socket.off('message:reaction', handleReaction);
      socket.off('message:update', handleUpdate);
      socket.off('message:delete', handleDeleteEvent);
      socket.off('poll:update', handlePollUpdate);
      socket.off('message:pin', handlePinUpdate);
      socket.off('message:unpin', handlePinUpdate);
      socket.off('message:star', handleStarUpdate);
      socket.off('location:live_update', handleLiveLocationUpdate);
      socket.off('location:live_stop', handleLiveLocationStop);
      if (typingTimeoutRef.current) {
        clearTimeout(typingTimeoutRef.current);
      }
    };
  }, [socket, conversationId, user?.uid, scrollToBottom]);

  const handleMessageVisible = useCallback((msgId: string) => {
    if (socket && conversationId) {
      socket.emit('message:read-ack', {
        messageId: msgId,
        conversationId
      });
    }
  }, [socket, conversationId]);

  // Active Live Location GPS Watcher for sender
  useEffect(() => {
    if (!socket || !user || !conversationId) return;

    const activeLiveMsgs = messages.filter(
      m => m.senderId === user.uid && 
           m.location?.isLive && 
           (!m.location.liveUntil || new Date(m.location.liveUntil) > new Date()) && 
           !m.location.stoppedAt
    );

    if (activeLiveMsgs.length === 0) return;
    if (!('geolocation' in navigator)) return;

    const watchId = navigator.geolocation.watchPosition(
      (pos) => {
        const { latitude, longitude, accuracy, speed, heading } = pos.coords;
        activeLiveMsgs.forEach(msg => {
          socket.emit('location:live_update', {
            conversationId,
            messageId: msg._id,
            latitude,
            longitude,
            accuracy: Math.round(accuracy),
            speed,
            heading
          });
        });
      },
      (err) => {
        console.warn('[WIBBY LIVE LOCATION] GPS watch error:', err);
      },
      { enableHighAccuracy: true, maximumAge: 5000, timeout: 15000 }
    );

    return () => {
      navigator.geolocation.clearWatch(watchId);
    };
  }, [messages, socket, user, conversationId]);

  const handleStopLiveLocation = async (messageId: string) => {
    try {
      if (socket) {
        socket.emit('location:live_stop', { conversationId, messageId });
      }
      const token = await user?.getIdToken();
      const apiUrl = import.meta.env.VITE_API_URL || 'http://localhost:3000';
      await fetch(`${apiUrl}/api/conversations/${conversationId}/messages/${messageId}/stop-live`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`
        }
      });
      // Local optimistic update
      setMessages(prev => prev.map(m => 
        m._id === messageId ? { ...m, location: { ...m.location!, stoppedAt: new Date().toISOString() } } : m
      ));
    } catch (err) {
      console.error('Failed to stop live location:', err);
    }
  };

  const handleTyping = useCallback((isTyping: boolean) => {
    if (socket && conversationId) {
      socket.emit(isTyping ? 'typing:start' : 'typing:stop', { conversationId });
    }
  }, [socket, conversationId]);

  const handleSend = async (text: string, forwardedFromMessageId?: string, mediaProps?: Partial<Message>) => {
    if (!user || !conversationId) return;

    const tempId = generateUUID();
    const tempMsg: Message = {
      _id: tempId,
      clientMessageId: tempId,
      conversationId,
      senderId: user.uid,
      text,
      type: mediaProps?.type || 'text',
      mediaUrl: mediaProps?.mediaUrl,
      mediaKey: mediaProps?.mediaKey,
      mimeType: mediaProps?.mimeType,
      fileName: mediaProps?.fileName,
      fileSize: mediaProps?.fileSize,
      thumbnailUrl: mediaProps?.thumbnailUrl,
      createdAt: new Date().toISOString(),
      status: 'sending',
      replyToMessageId: replyingTo ? replyingTo.id : undefined,
      forwardedFromMessageId
    };

    setMessages(prev => [...prev, tempMsg]);
    setTimeout(scrollToBottom, 100);

    try {
      const token = await user.getIdToken();
      const url = `${import.meta.env.VITE_API_URL || 'http://localhost:3000'}/api/conversations/${conversationId}/messages`;
      
      const payload: any = { 
        text, 
        clientMessageId: tempId,
        type: mediaProps?.type || 'text',
        mediaUrl: mediaProps?.mediaUrl,
        mediaKey: mediaProps?.mediaKey,
        mimeType: mediaProps?.mimeType,
        fileName: mediaProps?.fileName,
        fileSize: mediaProps?.fileSize,
        thumbnailUrl: mediaProps?.thumbnailUrl
      };
      if (replyingTo) {
        payload.replyToMessageId = replyingTo.id;
      }
      if (forwardedFromMessageId) {
        payload.forwardedFromMessageId = forwardedFromMessageId;
      }

      const response = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify(payload)
      });

      if (!response.ok) throw new Error('Failed to send');

      const data = await response.json();
      const normalizedSent = normalizeMessage(data.message);
      setMessages(prev => prev.map(m => m.clientMessageId === tempId || m._id === tempId ? normalizedSent : m));
    } catch (err) {
      console.error('Send error:', err);
      setMessages(prev => prev.map(m => m.clientMessageId === tempId || m._id === tempId ? { ...m, status: 'failed' } : m));
      throw err;
    }
  };

  const handleSendSpecial = async (specialData: { type: string; poll?: any; location?: any; contact?: any; sticker?: any }) => {
    if (!user || !conversationId) return;

    const tempId = generateUUID();
    const tempMsg: Message = {
      _id: tempId,
      clientMessageId: tempId,
      conversationId,
      senderId: user.uid,
      type: specialData.type as any,
      poll: specialData.poll,
      location: specialData.location,
      contact: specialData.contact,
      sticker: specialData.sticker,
      createdAt: new Date().toISOString(),
      status: 'sending'
    };

    setMessages(prev => [...prev, tempMsg]);
    setTimeout(scrollToBottom, 100);

    try {
      const token = await user.getIdToken();
      const url = `${import.meta.env.VITE_API_URL || 'http://localhost:3000'}/api/conversations/${conversationId}/messages`;
      const res = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({
          ...specialData,
          clientMessageId: tempId
        })
      });

      if (!res.ok) throw new Error('Failed to send special message');
      const data = await res.json();
      const normalized = normalizeMessage(data.message);
      setMessages(prev => prev.map(m => m.clientMessageId === tempId || m._id === tempId ? normalized : m));
    } catch (err) {
      console.error('Special send error:', err);
      setMessages(prev => prev.map(m => m.clientMessageId === tempId || m._id === tempId ? { ...m, status: 'failed' } : m));
    }
  };

  const handleVotePoll = async (msgId: string, optionIndex: number) => {
    if (!user || !conversationId) return;
    try {
      const token = await user.getIdToken();
      const url = `${import.meta.env.VITE_API_URL || 'http://localhost:3000'}/api/conversations/${conversationId}/messages/${msgId}/poll/vote`;
      const res = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({ optionIndex })
      });
      if (res.ok) {
        const data = await res.json();
        if (data.poll) {
          setMessages(prev => prev.map(m => m._id === msgId ? { ...m, poll: data.poll } : m));
        }
      }
    } catch (err) {
      console.error('Poll vote error:', err);
    }
  };

  const handleToggleStar = async (msgId: string) => {
    if (!user || !conversationId) return;
    try {
      const token = await user.getIdToken();
      const url = `${import.meta.env.VITE_API_URL || 'http://localhost:3000'}/api/conversations/${conversationId}/messages/${msgId}/star`;
      const res = await fetch(url, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${token}` }
      });
      if (res.ok) {
        const data = await res.json();
        setMessages(prev => prev.map(m => m._id === msgId ? { ...m, starredBy: data.starredBy } : m));
        showToast(data.starred ? 'Starred ⭐' : 'Unstarred');
      }
    } catch (err) {
      console.error('Star error:', err);
    }
  };

  const handleTogglePin = async (msgId: string) => {
    if (!user || !conversationId) return;
    try {
      const token = await user.getIdToken();
      const url = `${import.meta.env.VITE_API_URL || 'http://localhost:3000'}/api/conversations/${conversationId}/messages/${msgId}/pin`;
      const res = await fetch(url, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${token}` }
      });
      if (res.ok) {
        const data = await res.json();
        setMessages(prev => prev.map(m => m._id === msgId ? { ...m, isPinned: data.isPinned, pinnedAt: data.pinnedAt, pinnedBy: data.pinnedBy } : m));
        showToast(data.isPinned ? 'Pinned 📌' : 'Unpinned');
      }
    } catch (err) {
      console.error('Pin error:', err);
    }
  };

  const handleMediaSent = useCallback((rawMediaMsg: any) => {
    const newMediaMsg = normalizeMessage(rawMediaMsg);
    setMessages(prev => {
      if (prev.some(m => m._id === newMediaMsg._id)) return prev;
      if (newMediaMsg.clientMessageId) {
        const index = prev.findIndex(m => 
          (m.clientMessageId && m.clientMessageId === newMediaMsg.clientMessageId) || 
          (m._id && m._id === newMediaMsg.clientMessageId)
        );
        if (index !== -1) {
          const next = [...prev];
          next[index] = newMediaMsg;
          return next;
        }
      }
      return [...prev, newMediaMsg];
    });
    setTimeout(scrollToBottom, 100);
  }, [scrollToBottom]);

  const handleRetry = async (msg: Message) => {
    setMessages(prev => prev.filter(m => m._id !== msg._id));
    handleSend(msg.text || '', msg.forwardedFromMessageId || undefined, {
      type: msg.type,
      mediaUrl: msg.mediaUrl,
      mediaKey: msg.mediaKey,
      mimeType: msg.mimeType,
      fileName: msg.fileName,
      fileSize: msg.fileSize,
      thumbnailUrl: msg.thumbnailUrl
    }).catch(() => {});
  };

  const handleDownloadFile = async (msg: Message) => {
    if (!msg.mediaUrl) return;
    try {
      await downloadMediaFile(conversationId, msg.mediaUrl, msg.fileName || 'download');
    } catch (err) {
      console.error('Download error:', err);
      showToast('Failed to download file');
    }
  };

  const handleEditSubmit = async (msgId: string, newText: string) => {
    if (!user || !conversationId) return;

    setMessages(prev => prev.map(m => 
      m._id === msgId ? { ...m, text: newText } : m
    ));

    try {
      const token = await user.getIdToken();
      await fetch(`${import.meta.env.VITE_API_URL || 'http://localhost:3000'}/api/conversations/${conversationId}/messages/${msgId}`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({ text: newText })
      });
    } catch (err) {
      console.error('Edit error:', err);
    }
  };

  const renderStatusTicks = (status: string) => {
    const neutralColor = 'rgba(240, 243, 255, 0.95)';
    const blueColor = '#38BDF8';
    const errorColor = 'var(--wibby-danger, #EF4444)';

    switch (status) {
      case 'sending':
        return (
          <span className="tick sending" title="Sending...">
            <svg width="13" height="13" viewBox="0 0 12 12" fill="none">
              <circle cx="6" cy="6" r="5" stroke={neutralColor} strokeWidth="1.4"/>
              <path d="M6 3.5V6L7.5 7.5" stroke={neutralColor} strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
          </span>
        );
      case 'sent':
        return (
          <span className="tick sent" title="Sent">
            <svg width="15" height="11" viewBox="0 0 18 12" fill="none">
              <path d="M4 7L7 10L13 4" stroke={neutralColor} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
          </span>
        );
      case 'delivered':
        return (
          <span className="tick delivered" title="Delivered">
            <svg width="16" height="11" viewBox="0 0 19 12" fill="none">
              <path d="M3 7L6 10L12 4" stroke={neutralColor} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/>
              <path d="M8 7L11 10L17 4" stroke={neutralColor} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
          </span>
        );
      case 'seen':
        return (
          <span className="tick seen" title="Seen">
            <svg width="16" height="11" viewBox="0 0 19 12" fill="none">
              <path d="M3 7L6 10L12 4" stroke={blueColor} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/>
              <path d="M8 7L11 10L17 4" stroke={blueColor} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
          </span>
        );
      case 'failed':
        return (
          <span className="tick failed" title="Failed to send">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke={errorColor} strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="12" cy="12" r="10" />
              <line x1="12" y1="8" x2="12" y2="12" />
              <line x1="12" y1="16" x2="12.01" y2="16" />
            </svg>
          </span>
        );
      default:
        return null;
    }
  };

  const handleContextMenu = useCallback((e: React.MouseEvent, msgId: string) => {
    e.preventDefault();
    setContextMenu({ msgId, x: e.clientX, y: e.clientY });
  }, []);

  const closeContextMenu = useCallback(() => {
    setContextMenu(null);
  }, []);

  const handleReactionSubmit = async (msgId: string, emoji: string) => {
    if (!user || !conversationId) return;
    closeContextMenu();

    // Compute the final emoji to send FIRST, from the current snapshot — before the optimistic update mutates state
    const currentMsg = messages.find(msg => msg._id === msgId);
    const existingUserReaction = (currentMsg?.reactions || []).find(r => r.senderId === user.uid);
    const isToggleOff = existingUserReaction?.emoji === emoji;
    const finalEmojiToSubmit = isToggleOff ? null : emoji;

    // Optimistic UI update
    setMessages(prev => prev.map(m => {
      if (m._id === msgId) {
        const otherReactions = (m.reactions || []).filter(r => r.senderId !== user.uid);
        return {
          ...m,
          reactions: finalEmojiToSubmit ? [...otherReactions, { senderId: user.uid, emoji: finalEmojiToSubmit }] : otherReactions
        };
      }
      return m;
    }));

    try {
      const token = await user.getIdToken();
      await fetch(`${import.meta.env.VITE_API_URL || 'http://localhost:3000'}/api/conversations/${conversationId}/messages/${msgId}/reactions`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({ emoji: finalEmojiToSubmit })
      });
    } catch (err) {
      console.error('Reaction error:', err);
    }
  };

  const handleDelete = async (msgId: string, everyone = false) => {
    if (!user || !conversationId) return;
    closeContextMenu();

    if (!everyone) {
      // Delete for me: immediately hide from local view
      setMessages(prev => prev.filter(m => m._id !== msgId));
    }

    try {
      const token = await user.getIdToken();
      await fetch(`${import.meta.env.VITE_API_URL || 'http://localhost:3000'}/api/conversations/${conversationId}/messages/${msgId}?everyone=${everyone}`, {
        method: 'DELETE',
        headers: { 'Authorization': `Bearer ${token}` }
      });
    } catch (err) {
      console.error('Delete error:', err);
    }
  };

  const handleCopy = (msgId: string) => {
    const msg = messages.find(m => m._id === msgId);
    if (msg) {
      const textToCopy = msg.text || msg.fileName || '';
      navigator.clipboard.writeText(textToCopy);
      showToast('Copied ✓');
      closeContextMenu();
    }
  };

  const handleForward = (msgId: string) => {
    const msg = messages.find(m => m._id === msgId);
    if (msg) {
      if (window.confirm('Forward this message to the current conversation?')) {
        handleSend(msg.text || '', msg._id, {
          type: msg.type,
          mediaUrl: msg.mediaUrl,
          mediaKey: msg.mediaKey,
          mimeType: msg.mimeType,
          fileName: msg.fileName,
          fileSize: msg.fileSize,
          thumbnailUrl: msg.thumbnailUrl
        }).catch(() => {});
      }
      closeContextMenu();
    }
  };

  const activeMessage = contextMenu ? messages.find(m => m._id === contextMenu.msgId) : null;

  const handleReplyClick = useCallback((msgId: string) => {
    const msg = messages.find(m => m._id === msgId);
    if (msg) {
      setReplyingTo({ 
        id: msgId, 
        text: getMediaReplySnippet(msg), 
        sender: msg.senderId === user?.uid ? 'You' : (partnerName || 'Them') 
      });
      setEditingMessage(null);
      closeContextMenu();
    }
  }, [messages, user?.uid, partnerName, closeContextMenu]);

  const handleEditClick = useCallback((msgId: string) => {
    const msg = messages.find(m => m._id === msgId);
    if (msg && (!msg.type || msg.type === 'text')) {
      const msgAge = Date.now() - new Date(msg.createdAt).getTime();
      if (msgAge > 120000) {
        showToast('Messages can only be edited within 2 minutes');
        closeContextMenu();
        return;
      }
      setEditingMessage({ id: msgId, text: msg.text || '' });
      setReplyingTo(null);
      closeContextMenu();
    }
  }, [messages, closeContextMenu, showToast]);

  const cancelReplyOrEdit = useCallback(() => {
    setReplyingTo(null);
    setEditingMessage(null);
  }, []);

  const handleBulkDelete = async () => {
    if (!window.confirm(`Delete ${selectedMessages.size} messages?`)) return;
    for (const msgId of selectedMessages) {
      await handleDelete(msgId, false);
    }
    setIsSelectMode(false);
    setSelectedMessages(new Set());
  };

  const handleBulkCopy = () => {
    const text = messages
      .filter(m => selectedMessages.has(m._id))
      .sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime())
      .map(m => m.text || m.fileName || '')
      .join('\n');
    navigator.clipboard.writeText(text);
    showToast('Copied ✓');
    setIsSelectMode(false);
    setSelectedMessages(new Set());
  };

  const handleBulkForward = async () => {
    if (!window.confirm(`Forward ${selectedMessages.size} messages to this conversation?`)) return;
    const msgsToForward = messages
      .filter(m => selectedMessages.has(m._id))
      .sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());
    
    for (const msg of msgsToForward) {
      handleSend(msg.text || '', msg._id, {
        type: msg.type,
        mediaUrl: msg.mediaUrl,
        mediaKey: msg.mediaKey,
        mimeType: msg.mimeType,
        fileName: msg.fileName,
        fileSize: msg.fileSize,
        thumbnailUrl: msg.thumbnailUrl
      }).catch(() => {});
    }
    setIsSelectMode(false);
    setSelectedMessages(new Set());
  };

  const toggleSelection = (msgId: string) => {
    setSelectedMessages(prev => {
      const next = new Set(prev);
      if (next.has(msgId)) next.delete(msgId);
      else next.add(msgId);
      return next;
    });
  };

  const renderReactions = (reactions?: { senderId: string; emoji: string }[]) => {
    if (!reactions || reactions.length === 0) return null;
    
    const counts = reactions.reduce((acc, r) => {
      acc[r.emoji] = (acc[r.emoji] || 0) + 1;
      return acc;
    }, {} as Record<string, number>);
    
    return (
      <div className="message-reactions">
        {Object.entries(counts).map(([emoji, count]) => (
          <span key={emoji} className="reaction-badge">
            {emoji} {count > 1 && <span className="reaction-count">{count}</span>}
          </span>
        ))}
      </div>
    );
  };

  if (loading) {
    return (
      <div className="message-area loading">
        <div className="empty-state-pulse" />
      </div>
    );
  }

  const renderDateSeparator = (dateStr: string) => {
    const date = new Date(dateStr);
    const today = new Date();
    const yesterday = new Date(today);
    yesterday.setDate(yesterday.getDate() - 1);
    
    let label = date.toLocaleDateString(undefined, { day: 'numeric', month: 'long', year: 'numeric' });
    if (date.toDateString() === today.toDateString()) label = 'Today';
    else if (date.toDateString() === yesterday.toDateString()) label = 'Yesterday';
    
    return (
      <div className="date-separator">
        <span>{label}</span>
      </div>
    );
  };

  const pinnedMsg = messages.slice().reverse().find(m => m.isPinned);

  const visibleMessages = messages.filter(msg => !user?.uid || !msg.deletedFor?.includes(user.uid));

  return (
    <div 
      className="chat-area-container"
      onDragEnter={handleChatDragEnter}
      onDragLeave={handleChatDragLeave}
      onDragOver={handleChatDragOver}
      onDrop={handleChatDrop}
    >
      {/* Pinned Messages Top Banner */}
      {pinnedMsg && (
        <div className="pinned-messages-banner" onClick={() => handleNavigateToReply(pinnedMsg._id)}>
          <div className="pinned-banner-content">
            <span className="pinned-banner-icon">📌</span>
            <div className="pinned-banner-text">
              <span className="pinned-banner-title">Pinned Message</span>
              <span className="pinned-banner-snippet">{pinnedMsg.text || pinnedMsg.fileName || pinnedMsg.poll?.question || 'Pinned content'}</span>
            </div>
          </div>
          <button
            className="pinned-banner-unpin-btn"
            onClick={(e) => {
              e.stopPropagation();
              handleTogglePin(pinnedMsg._id);
            }}
            title="Unpin message"
          >
            ✕
          </button>
        </div>
      )}

      {/* Full Chat Drag & Drop Overlay */}
      {isDraggingOverChat && (
        <div className="chat-drag-drop-overlay" aria-hidden="true">
          <div className="chat-drag-drop-card">
            <div className="chat-drop-glow-ring" />
            <div className="chat-drop-icon">
              <svg width="44" height="44" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                <polyline points="17 8 12 3 7 8" />
                <line x1="12" y1="3" x2="12" y2="15" />
              </svg>
            </div>
            <div className="chat-drop-title">Drop files to attach</div>
            <div className="chat-drop-subtitle">Photos (≤10MB) · Videos (≤50MB) · Documents (≤25MB)</div>
          </div>
        </div>
      )}

      {visibleMessages.length === 0 ? (
        <div className="message-area empty">
          <div className="empty-state">
            <div className="empty-state-decor">
              <div className="decor-ring ring-1" />
              <div className="decor-ring ring-2" />
              <div className="decor-ring ring-3" />
            </div>
            <div className="empty-state-icon">
              <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
              </svg>
              <div className="empty-state-pulse" />
            </div>
            <h3 className="empty-state-title">Start your conversation</h3>
            <p className="empty-state-text">
              Send a message, share a photo, or just say hi.<br />
              This is your private space.
            </p>
            <div className="empty-state-hint">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <polyline points="15 10 20 15 15 20" />
                <path d="M4 4v7a4 4 0 0 0 4 4h12" />
              </svg>
              <span>Type a message below to begin</span>
            </div>
          </div>
        </div>
      ) : (
        <div className="message-area has-messages" onScroll={() => {
          if (contextMenu) closeContextMenu();
          if (emojiPicker) setEmojiPicker(null);
          setHoveredMessageId(null);
        }}>
          <div className="message-list">
            {visibleMessages.map((msg, index) => {
              const isOwn = msg.senderId === user?.uid;
              const prevMsg = visibleMessages[index - 1];
              const nextMsg = visibleMessages[index + 1];

              const GROUPING_TIME_LIMIT = 5 * 60 * 1000;
              const isSameSenderAsPrev = prevMsg && prevMsg.senderId === msg.senderId;
              const isSameSenderAsNext = nextMsg && nextMsg.senderId === msg.senderId;
              
              const isCloseToPrev = prevMsg && (new Date(msg.createdAt).getTime() - new Date(prevMsg.createdAt).getTime() < GROUPING_TIME_LIMIT);
              const isCloseToNext = nextMsg && (new Date(nextMsg.createdAt).getTime() - new Date(msg.createdAt).getTime() < GROUPING_TIME_LIMIT);

              const isFirstInGroup = !isSameSenderAsPrev || !isCloseToPrev;
              const isLastInGroup = !isSameSenderAsNext || !isCloseToNext;

              let position: 'single' | 'first' | 'middle' | 'last' = 'single';
              if (isFirstInGroup && !isLastInGroup) position = 'first';
              else if (!isFirstInGroup && !isLastInGroup) position = 'middle';
              else if (!isFirstInGroup && isLastInGroup) position = 'last';

              const showDateSeparator = !prevMsg || (new Date(msg.createdAt).toDateString() !== new Date(prevMsg.createdAt).toDateString());
              const isSelected = selectedMessages.has(msg._id);

              const handleTouchStart = (msgId: string) => {
                if (isSelectMode) return;
                longPressTimer.current = setTimeout(() => {
                  setHoveredMessageId(msgId);
                  if (window.navigator.vibrate) window.navigator.vibrate(50);
                }, 500);
              };

              const handleTouchEnd = () => {
                if (longPressTimer.current) clearTimeout(longPressTimer.current);
              };

              const handleTouchMove = () => {
                if (longPressTimer.current) clearTimeout(longPressTimer.current);
              };

              const messageWrapperProps = {
                'data-message-id': msg._id,
                id: `message-${msg._id}`,
                ref: (el: HTMLDivElement | null) => {
                  if (el) messageRefs.current.set(msg._id, el);
                  else messageRefs.current.delete(msg._id);
                },
                className: `message-wrapper ${msg.senderId === user?.uid ? 'own' : 'partner'} group-${position} ${isSelectMode ? 'selectable' : ''} ${isSelected ? 'selected' : ''} ${highlightedMessageId === msg._id ? 'message--reply-target' : ''}`,
                onContextMenu: isSelectMode ? undefined : (e: React.MouseEvent) => handleContextMenu(e, msg._id),
                onClick: isSelectMode ? () => toggleSelection(msg._id) : undefined,
                onMouseEnter: () => !isSelectMode && setHoveredMessageId(msg._id),
                onMouseLeave: () => setHoveredMessageId(null),
                onTouchStart: () => handleTouchStart(msg._id),
                onTouchEnd: handleTouchEnd,
                onTouchMove: handleTouchMove,
                onTouchCancel: handleTouchEnd,
              };

              const renderActionBar = () => {
                if (isSelectMode || hoveredMessageId !== msg._id) return null;
                return (
                  <MessageActionBar
                    isOwn={isOwn}
                    onReact={(emoji) => handleReactionSubmit(msg._id, emoji)}
                    onContextMenu={(e: React.MouseEvent | React.TouchEvent) => handleContextMenu(e as any, msg._id)}
                    onEmojiPicker={(e: React.MouseEvent) => {
                      const button = e.currentTarget as HTMLElement;
                      const bubble = button.closest('.message-wrapper')?.querySelector('.message-bubble') || button;
                      const rect = bubble.getBoundingClientRect();
                      setEmojiPicker({ msgId: msg._id, anchorRect: rect, isOwn });
                      setHoveredMessageId(null);
                    }}
                  />
                );
              };

              const isStarred = Boolean(user?.uid && msg.starredBy?.includes(user.uid));

              const content = isOwn ? (
                <div key={msg._id} {...messageWrapperProps}>
                  <div className={`message-bubble ${msg.deletedAt ? 'deleted' : ''}`}>
                    {msg.deletedAt ? (
                      <div className="message-row">
                        <div className="message-content deleted-text">
                          <span className="deleted-icon">🚫</span> This message was deleted
                        </div>
                        <div className="message-meta">
                          <span className="message-time">{formatMessageTime(msg.createdAt)}</span>
                        </div>
                      </div>
                    ) : (
                      <>
                        {msg.forwardedFromMessageId && (
                          <div className="message-forwarded-indicator">
                            <span className="forward-icon">↗</span> Forwarded
                          </div>
                        )}
                        {msg.replyToMessageId && (
                          <div 
                            className="message-reply-preview"
                            role="button"
                            tabIndex={0}
                            aria-label="Jump to replied message"
                            title="Jump to original message"
                            onClick={(e) => {
                              e.stopPropagation();
                              if (msg.replyToMessageId) {
                                handleNavigateToReply(msg.replyToMessageId);
                              }
                            }}
                            onKeyDown={(e) => {
                              if (e.key === 'Enter' || e.key === ' ') {
                                e.preventDefault();
                                e.stopPropagation();
                                if (msg.replyToMessageId) {
                                  handleNavigateToReply(msg.replyToMessageId);
                                }
                              }
                            }}
                          >
                            <span className="reply-sender">
                              {(() => {
                                const target = messages.find(m => m._id === msg.replyToMessageId);
                                if (!target) return 'Original message';
                                return target.senderId === user?.uid ? 'You' : (partnerName || 'Them');
                              })()}
                            </span>
                            <span className="reply-text">
                              {(() => {
                                const target = messages.find(m => m._id === msg.replyToMessageId);
                                return getMediaReplySnippet(target);
                              })()}
                            </span>
                          </div>
                        )}
                        <div className="message-row">
                          <MessageBubbleBody
                            msg={msg}
                            isOwn={msg.senderId === user?.uid}
                            currentUserId={user?.uid}
                            onImageClick={(m) => setSelectedLightboxMsg(m)}
                            onDownloadFile={handleDownloadFile}
                            onVotePoll={handleVotePoll}
                            onOpenLink={(url, title) => setLinkPlayer({ url, title })}
                            onStopLiveLocation={handleStopLiveLocation}
                          />
                          <div className="message-meta">
                            {msg.isPinned && <span className="badge-pin" title="Pinned message">📌</span>}
                            {isStarred && <span className="badge-star" title="Starred message">⭐</span>}
                            <span className="message-time">{formatMessageTime(msg.createdAt)}</span>
                            <span className="message-status">
                              {msg.status === 'failed' ? (
                                <button className="retry-btn" onClick={() => handleRetry(msg)}>Retry</button>
                              ) : (
                                renderStatusTicks(msg.status)
                              )}
                            </span>
                          </div>
                        </div>
                      </>
                    )}
                  </div>
                  {!msg.deletedAt && renderReactions(msg.reactions)}
                  {renderActionBar()}
                </div>
              ) : (
                <div key={msg._id} {...messageWrapperProps}>
                  {renderActionBar()}
                  <IncomingMessage 
                    msg={msg} 
                    onVisible={handleMessageVisible} 
                    replyToMessage={messages.find(m => m._id === msg.replyToMessageId)}
                    renderReactions={renderReactions}
                    onNavigateToReply={handleNavigateToReply}
                    partnerName={partnerName}
                    currentUserId={user?.uid}
                    onImageClick={(m) => setSelectedLightboxMsg(m)}
                    onDownloadFile={handleDownloadFile}
                    onVotePoll={handleVotePoll}
                    onOpenLink={(url, title) => setLinkPlayer({ url, title })}
                  />
                </div>
              );

              return (
                <React.Fragment key={msg._id}>
                  {showDateSeparator && renderDateSeparator(msg.createdAt)}
                  {content}
                </React.Fragment>
              );
            })}
            
            {/* Live Bouncing 3-Dots Typing Indicator Bubble on Chat Screen */}
            {isPartnerTyping && (
              <div className="typing-bubble-row" aria-label={`${partnerName} is typing`}>
                <div className="typing-bubble">
                  <span className="typing-dot dot-1" />
                  <span className="typing-dot dot-2" />
                  <span className="typing-dot dot-3" />
                </div>
              </div>
            )}
            <div ref={messagesEndRef} style={{ height: 1 }} />
          </div>
        </div>
      )}
      
      {toastMessage && (
        <div className="toast-notification">
          {toastMessage}
        </div>
      )}
      
      {isSelectMode ? (
        <div className="selection-bar">
          <button className="selection-btn cancel" onClick={() => { setIsSelectMode(false); setSelectedMessages(new Set()); }}>Cancel</button>
          <span className="selection-count">{selectedMessages.size} selected</span>
          <div className="selection-actions">
            <button className="selection-btn" onClick={handleBulkCopy} disabled={selectedMessages.size === 0}>Copy</button>
            <button className="selection-btn" onClick={handleBulkForward} disabled={selectedMessages.size === 0}>Forward</button>
            <button className="selection-btn danger" onClick={handleBulkDelete} disabled={selectedMessages.size === 0}>Delete</button>
          </div>
        </div>
      ) : (
        <MessageComposer 
          conversationId={conversationId}
          onSend={handleSend}
          onSendSpecial={handleSendSpecial}
          onMediaSent={handleMediaSent}
          replyingTo={replyingTo}
          editingMessage={editingMessage}
          onCancelReplyOrEdit={cancelReplyOrEdit}
          onEdit={handleEditSubmit}
          onTyping={handleTyping}
          droppedFiles={droppedFilesForComposer}
          onClearDroppedFiles={() => setDroppedFilesForComposer(null)}
          onOpenGame={onOpenGame}
        />
      )}
      
      {contextMenu && activeMessage && (
        <MessageContextMenu
          x={contextMenu.x}
          y={contextMenu.y}
          isOwn={activeMessage.senderId === user?.uid}
          isStarred={Boolean(user?.uid && activeMessage.starredBy?.includes(user.uid))}
          isPinned={Boolean(activeMessage.isPinned)}
          onClose={closeContextMenu}
          onReply={() => handleReplyClick(activeMessage._id)}
          onEdit={(
            activeMessage.senderId === user?.uid &&
            (!activeMessage.type || activeMessage.type === 'text') &&
            (Date.now() - new Date(activeMessage.createdAt).getTime() <= 120000)
          ) ? () => handleEditClick(activeMessage._id) : undefined}
          onCopy={() => handleCopy(activeMessage._id)}
          onForward={() => handleForward(activeMessage._id)}
          onStar={() => handleToggleStar(activeMessage._id)}
          onPin={() => handleTogglePin(activeMessage._id)}
          onInfo={() => {
            setSelectedInfoMsg(activeMessage);
            closeContextMenu();
          }}
          onDelete={() => handleDelete(activeMessage._id, false)}
          onSelect={() => {
            setIsSelectMode(true);
            setSelectedMessages(new Set([activeMessage._id]));
            closeContextMenu();
          }}
          onDeleteForEveryone={activeMessage.senderId === user?.uid ? () => handleDelete(activeMessage._id, true) : undefined}
        />
      )}

      {emojiPicker && (
        <div style={{ position: 'fixed', top: 0, left: 0, zIndex: 10000 }}>
          <EmojiPicker
            anchorRect={emojiPicker.anchorRect}
            isOwn={emojiPicker.isOwn}
            onSelect={(emoji) => {
              handleReactionSubmit(emojiPicker.msgId, emoji);
              setEmojiPicker(null);
            }}
            onClose={() => setEmojiPicker(null)}
          />
        </div>
      )}

      {/* Image Lightbox Viewer */}
      {selectedLightboxMsg && (
        <ImageLightbox
          conversationId={conversationId}
          imageUrl={selectedLightboxMsg.mediaUrl || ''}
          fileName={selectedLightboxMsg.fileName}
          caption={selectedLightboxMsg.text}
          onClose={() => setSelectedLightboxMsg(null)}
        />
      )}

      {/* Message Info Modal */}
      {selectedInfoMsg && (
        <MessageInfoModal
          message={selectedInfoMsg}
          currentUserId={user?.uid || ''}
          partnerName={partnerName}
          isOpen={Boolean(selectedInfoMsg)}
          onClose={() => setSelectedInfoMsg(null)}
        />
      )}

      {/* Link Media Player Popup Modal */}
      {linkPlayer && (
        <LinkPlayerModal
          isOpen={Boolean(linkPlayer)}
          url={linkPlayer.url}
          title={linkPlayer.title}
          onClose={() => setLinkPlayer(null)}
        />
      )}
    </div>
  );
}

