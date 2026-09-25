import { useState, useEffect, useRef } from 'react';
import type { Story } from '../../types/chat';
import { formatLastSeen } from '../../utils/time';
import { musicNoteService } from '../../services/musicNoteService';
import { musicCatalogService, LEGAL_MUSIC_CATALOG } from '../../services/musicCatalog';
import { IconTrash, IconClose, IconPlay, IconPause } from '../common/Icons';
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
  const [catalogState, setCatalogState] = useState(musicCatalogService.getState());

  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    return musicCatalogService.subscribe(state => {
      setCatalogState(state);
    });
  }, []);

  useEffect(() => {
    if (isOpen) {
      setCurrentIndex(Math.min(startIndex, Math.max(0, stories.length - 1)));
      setProgress(0);
    } else {
      musicNoteService.stop();
      musicCatalogService.stop();
    }
  }, [isOpen, startIndex, stories.length]);

  const currentStory = stories[currentIndex];

  // Auto-play music note song if story contains a music note
  useEffect(() => {
    if (!isOpen || !currentStory) {
      musicNoteService.stop();
      musicCatalogService.stop();
      return;
    }

    if (currentStory.musicNote) {
      musicNoteService.stop();
      const mn = currentStory.musicNote;
      const matchedTrack = LEGAL_MUSIC_CATALOG.find(t => t.id === mn.id) || {
        id: mn.id,
        title: mn.title,
        artist: mn.artist,
        genre: mn.genre || 'Pop',
        duration: mn.duration || 60,
        artworkGradient: mn.artworkUrl || 'linear-gradient(135deg, #7C3AED, #5B21B6)',
        coverEmoji: '🎵',
        bpm: 100,
        key: 'C Major',
        chords: [[130.81, 164.81, 196.00], [174.61, 220.00, 261.63]],
        melody: [261.63, 329.63, 392.00, 523.25]
      };
      musicCatalogService.playClip(matchedTrack, mn.clipStart || 0, mn.clipDuration || 30);
    } else {
      const storyText = currentStory.text || currentStory.caption || '';
      if (storyText.includes('🎵')) {
        musicCatalogService.stop();
        musicNoteService.playSong(storyText);
      } else {
        musicNoteService.stop();
        musicCatalogService.stop();
      }
    }

    return () => {
      musicNoteService.stop();
      musicCatalogService.stop();
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

  const renderMusicBadge = () => {
    const musicNote = currentStory?.musicNote;
    const storyText = currentStory?.text || currentStory?.caption || '';
    if (!musicNote && !storyText.includes('🎵')) return null;

    const title = musicNote ? musicNote.title : storyText.replace('🎵', '').trim();
    const artist = musicNote ? musicNote.artist : 'Royalty-Free Audio';
    const isPlaying = musicNote ? catalogState.isPlaying : musicNoteService.isPlaying();

    const handleTogglePlay = (e: React.MouseEvent) => {
      e.stopPropagation();
      if (musicNote) {
        if (catalogState.isPlaying) {
          musicCatalogService.stop();
        } else {
          const matchedTrack = LEGAL_MUSIC_CATALOG.find(t => t.id === musicNote.id) || {
            id: musicNote.id,
            title: musicNote.title,
            artist: musicNote.artist,
            genre: musicNote.genre || 'Pop',
            duration: musicNote.duration || 60,
            artworkGradient: musicNote.artworkUrl || 'linear-gradient(135deg, #7C3AED, #5B21B6)',
            coverEmoji: '🎵',
            bpm: 100,
            key: 'C Major',
            chords: [[130.81, 164.81, 196.00], [174.61, 220.00, 261.63]],
            melody: [261.63, 329.63, 392.00, 523.25]
          };
          musicCatalogService.playClip(matchedTrack, musicNote.clipStart || 0, musicNote.clipDuration || 30);
        }
      } else {
        if (musicNoteService.isPlaying()) {
          musicNoteService.stop();
        } else {
          musicNoteService.playSong(storyText);
        }
      }
    };

    return (
      <div className="story-music-note-badge" onClick={e => e.stopPropagation()}>
        <div className={`spinning-vinyl-disc ${!isPlaying ? 'is-paused' : ''}`}>
          <span className="vinyl-center">🎵</span>
        </div>
        <div className="music-badge-info">
          <span className="music-badge-title">{title}</span>
          <span className="music-badge-sub">
            {artist} {musicNote?.clipDuration ? `• Clip: ${musicNote.clipDuration}s` : '• Audio Preview'}
          </span>
          {musicNote && (
            <div className="music-badge-progress-wrap">
              <div
                className="music-badge-progress-bar"
                style={{ width: `${catalogState.progress * 100}%` }}
              />
            </div>
          )}
        </div>
        <button
          type="button"
          className="music-badge-play-btn"
          onClick={handleTogglePlay}
          aria-label={isPlaying ? 'Pause music' : 'Play music'}
        >
          {isPlaying ? <IconPause size={14} color="#fff" /> : <IconPlay size={14} color="#fff" />}
        </button>
      </div>
    );
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
                <IconTrash size={18} color="#fff" />
              </button>
            )}
            <button className="story-viewer-close" onClick={onClose} aria-label="Close">
              <IconClose size={18} color="#fff" />
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
              {renderMusicBadge()}
              <p className="story-text-body">{currentStory.text}</p>
            </div>
          )}

          {currentStory.type === 'image' && currentStory.mediaUrl && (
            <div className="story-media-stage">
              {renderMusicBadge()}
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
              {renderMusicBadge()}
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
