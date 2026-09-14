import { useState, useEffect, useRef } from 'react';
import type { Story } from '../../types/chat';
import { formatLastSeen } from '../../utils/time';
import { musicNoteService } from '../../services/musicNoteService';
import './StoryViewerModal.css';

interface StoryViewerModalProps {
  isOpen: boolean;
  stories: Story[];
  startIndex?: number;
  currentUserId: string;
  partnerName: string;
  onClose: () => void;
  onViewStory: (storyId: string) => void;
  onReactStory: (storyId: string, emoji: string) => void;
  onReplyStory: (story: Story, text: string) => void;
  onDeleteStory: (storyId: string) => void;
}

const EMOJI_REACTIONS = ['❤️', '🔥', '😂', '😮', '😢', '👏'];

export default function StoryViewerModal({
  isOpen,
  stories,
  startIndex = 0,
  currentUserId,
  partnerName,
  onClose,
  onViewStory,
  onReactStory,
  onReplyStory,
  onDeleteStory
}: StoryViewerModalProps) {
  const [currentIndex, setCurrentIndex] = useState(startIndex);
  const [isPaused, setIsPaused] = useState(false);
  const [progress, setProgress] = useState(0);
  const [replyText, setReplyText] = useState('');
  const [reactAnimation, setReactAnimation] = useState<string | null>(null);

  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    if (isOpen) {
      setCurrentIndex(Math.min(startIndex, Math.max(0, stories.length - 1)));
      setProgress(0);
    } else {
      musicNoteService.stop();
    }
  }, [isOpen, startIndex, stories.length]);

  const currentStory = stories[currentIndex];

  // Auto-play music note song if story contains a music note
  useEffect(() => {
    if (!isOpen || !currentStory) {
      musicNoteService.stop();
      return;
    }

    const storyText = currentStory.text || currentStory.caption || '';
    if (storyText.includes('🎵')) {
      musicNoteService.playSong(storyText);
    } else {
      musicNoteService.stop();
    }

    return () => {
      musicNoteService.stop();
    };
  }, [isOpen, currentStory]);

  // Mark viewed when viewing
  useEffect(() => {
    if (currentStory && isOpen) {
      onViewStory(currentStory._id);
    }
  }, [currentStory?._id, isOpen, onViewStory]);

  // Story playback timer
  useEffect(() => {
    if (!isOpen || !currentStory || isPaused) {
      if (timerRef.current) clearInterval(timerRef.current);
      return;
    }

    const duration = (currentStory.duration || 5) * 1000;
    const intervalTime = 50;
    const step = (intervalTime / duration) * 100;

    timerRef.current = setInterval(() => {
      setProgress(prev => {
        if (prev + step >= 100) {
          // Advance to next story or close
          if (currentIndex < stories.length - 1) {
            setCurrentIndex(i => i + 1);
            return 0;
          } else {
            onClose();
            return 100;
          }
        }
        return prev + step;
      });
    }, intervalTime);

    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [isOpen, currentStory, isPaused, currentIndex, stories.length, onClose]);

  if (!isOpen || !currentStory) return null;

  const isOwnStory = currentStory.creatorId === currentUserId;
  const authorName = isOwnStory ? 'You' : partnerName;

  const handlePrev = () => {
    if (currentIndex > 0) {
      setCurrentIndex(currentIndex - 1);
      setProgress(0);
    }
  };

  const handleNext = () => {
    if (currentIndex < stories.length - 1) {
      setCurrentIndex(currentIndex + 1);
      setProgress(0);
    } else {
      onClose();
    }
  };

  const handleSendReply = (e: React.FormEvent) => {
    e.preventDefault();
    if (!replyText.trim()) return;
    onReplyStory(currentStory, replyText.trim());
    setReplyText('');
    setReactAnimation('💬 Sent!');
    setTimeout(() => setReactAnimation(null), 1500);
  };

  const handleReaction = (emoji: string) => {
    onReactStory(currentStory._id, emoji);
    setReactAnimation(emoji);
    setTimeout(() => setReactAnimation(null), 1200);
  };

  return (
    <div
      className="story-viewer-overlay"
      role="dialog"
      aria-modal="true"
      aria-label="Story Viewer"
      onMouseDown={() => setIsPaused(true)}
      onMouseUp={() => setIsPaused(false)}
      onTouchStart={() => setIsPaused(true)}
      onTouchEnd={() => setIsPaused(false)}
    >
      <div className="story-viewer-card" onClick={e => e.stopPropagation()}>
        {/* Top Progress Segment Bars */}
        <div className="story-progress-bar-wrap">
          {stories.map((s, i) => {
            let widthPercent = 0;
            if (i < currentIndex) widthPercent = 100;
            else if (i === currentIndex) widthPercent = progress;
            return (
              <div key={s._id} className="story-progress-segment">
                <div className="story-progress-fill" style={{ width: `${widthPercent}%` }} />
              </div>
            );
          })}
        </div>

        {/* Story Header */}
        <div className="story-viewer-header">
          <div className="story-author-info">
            <div className="story-author-avatar">
              <span>{authorName.charAt(0).toUpperCase()}</span>
            </div>
            <div className="story-author-meta">
              <span className="story-author-name">{authorName}</span>
              <span className="story-timestamp">{formatLastSeen(currentStory.createdAt)}</span>
            </div>
          </div>

          <div className="story-header-actions">
            {isOwnStory && (
              <button
                className="story-delete-btn"
                onClick={() => {
                  onDeleteStory(currentStory._id);
                  if (stories.length <= 1) onClose();
                  else handleNext();
                }}
                title="Delete story"
                aria-label="Delete story"
              >
                🗑️
              </button>
            )}
            <button className="story-viewer-close" onClick={onClose} aria-label="Close">
              ✕
            </button>
          </div>
        </div>

        {/* Story Content Stage */}
        <div className="story-viewer-stage">
          {/* Tap Zones */}
          <div className="story-tap-zone left" onClick={handlePrev} />
          <div className="story-tap-zone right" onClick={handleNext} />

          {currentStory.type === 'text' && (
            <div
              className="story-text-stage"
              style={{ background: currentStory.backgroundColor || '#7C3AED' }}
            >
              {currentStory.text?.includes('🎵') && (
                <div className="story-music-note-badge">
                  <div className="spinning-vinyl-disc">
                    <span className="vinyl-groove" />
                    <span className="vinyl-center">🎵</span>
                  </div>
                  <div className="music-badge-info">
                    <span className="music-badge-title">{currentStory.text.replace('🎵', '').trim()}</span>
                    <span className="music-badge-sub">30s Preview • Playing Audio 🎶</span>
                  </div>
                </div>
              )}
              <p className="story-text-body">{currentStory.text}</p>
            </div>
          )}

          {currentStory.type === 'image' && currentStory.mediaUrl && (
            <div className="story-media-stage">
              <img src={currentStory.mediaUrl} alt="Story" className="story-image-full" />
              {currentStory.caption && (
                <div className="story-caption-bar">
                  <p>{currentStory.caption}</p>
                </div>
              )}
            </div>
          )}

          {currentStory.type === 'video' && currentStory.mediaUrl && (
            <div className="story-media-stage">
              <video
                src={currentStory.mediaUrl}
                className="story-video-full"
                autoPlay
                playsInline
                loop
              />
              {currentStory.caption && (
                <div className="story-caption-bar">
                  <p>{currentStory.caption}</p>
                </div>
              )}
            </div>
          )}

          {/* Reaction Float Animation */}
          {reactAnimation && (
            <div className="story-reaction-float">
              <span>{reactAnimation}</span>
            </div>
          )}
        </div>

        {/* Bottom Reply / Reaction Bar (Only when viewing partner's story) */}
        {!isOwnStory && (
          <div className="story-viewer-footer" onMouseDown={e => e.stopPropagation()}>
            <div className="story-emoji-reactions">
              {EMOJI_REACTIONS.map(emoji => (
                <button
                  key={emoji}
                  className="story-emoji-btn"
                  onClick={() => handleReaction(emoji)}
                >
                  {emoji}
                </button>
              ))}
            </div>

            <form onSubmit={handleSendReply} className="story-reply-form">
              <input
                type="text"
                className="story-reply-input"
                placeholder={`Reply to ${partnerName}...`}
                value={replyText}
                onChange={e => setReplyText(e.target.value)}
                onFocus={() => setIsPaused(true)}
                onBlur={() => setIsPaused(false)}
              />
              <button
                type="submit"
                className="story-reply-send-btn"
                disabled={!replyText.trim()}
              >
                Send
              </button>
            </form>
          </div>
        )}
      </div>
    </div>
  );
}
