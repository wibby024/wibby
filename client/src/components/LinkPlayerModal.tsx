import { useState } from 'react';
import './LinkPlayerModal.css';

interface LinkPlayerModalProps {
  isOpen: boolean;
  url: string | null;
  title?: string;
  onClose: () => void;
}

function getYouTubeEmbedUrl(url: string): string | null {
  try {
    const parsed = new URL(url);
    if (parsed.hostname.includes('youtube.com')) {
      if (parsed.pathname.includes('/shorts/')) {
        const parts = parsed.pathname.split('/shorts/');
        const id = parts[1]?.split('?')[0];
        if (id) return `https://www.youtube-nocookie.com/embed/${id}?autoplay=1&enablejsapi=1`;
      }
      const v = parsed.searchParams.get('v');
      if (v) return `https://www.youtube-nocookie.com/embed/${v}?autoplay=1&enablejsapi=1`;
      const match = parsed.pathname.match(/\/embed\/([a-zA-Z0-9_-]+)/);
      if (match) return `https://www.youtube-nocookie.com/embed/${match[1]}?autoplay=1&enablejsapi=1`;
    }
    if (parsed.hostname === 'youtu.be') {
      const v = parsed.pathname.slice(1).split('?')[0];
      if (v) return `https://www.youtube-nocookie.com/embed/${v}?autoplay=1&enablejsapi=1`;
    }
  } catch {}
  return null;
}

function getInstagramEmbedUrl(url: string): string | null {
  try {
    const parsed = new URL(url);
    if (parsed.hostname.includes('instagram.com')) {
      const match = parsed.pathname.match(/\/(reel|reels|p)\/([a-zA-Z0-9_-]+)/);
      if (match && match[2]) {
        return `https://www.instagram.com/reel/${match[2]}/embed`;
      }
    }
  } catch {}
  return null;
}

function getSpotifyEmbedUrl(url: string): string | null {
  try {
    const parsed = new URL(url);
    if (parsed.hostname.includes('spotify.com')) {
      const match = parsed.pathname.match(/\/(track|album|playlist|episode)\/([a-zA-Z0-9]+)/);
      if (match) {
        return `https://open.spotify.com/embed/${match[1]}/${match[2]}?utm_source=generator&theme=0`;
      }
    }
  } catch {}
  return null;
}

function getSoundCloudEmbedUrl(url: string): string | null {
  try {
    const parsed = new URL(url);
    if (parsed.hostname.includes('soundcloud.com')) {
      return `https://w.soundcloud.com/player/?url=${encodeURIComponent(url)}&color=%237c3aed&auto_play=true&hide_related=true&show_comments=false&show_user=true&show_reposts=false&show_teaser=false`;
    }
  } catch {}
  return null;
}

function isDirectVideo(url: string): boolean {
  return /\.(mp4|webm|ogg|mov|m4v)(\?.*)?$/i.test(url);
}

function isDirectAudio(url: string): boolean {
  return /\.(mp3|wav|ogg|m4a|aac|flac)(\?.*)?$/i.test(url);
}

export default function LinkPlayerModal({
  isOpen,
  url,
  title,
  onClose
}: LinkPlayerModalProps) {
  const [isMinimized, setIsMinimized] = useState(false);

  if (!isOpen || !url) return null;

  const ytEmbed = getYouTubeEmbedUrl(url);
  const igEmbed = getInstagramEmbedUrl(url);
  const spotifyEmbed = getSpotifyEmbedUrl(url);
  const soundcloudEmbed = getSoundCloudEmbedUrl(url);
  const isVideo = isDirectVideo(url);
  const isAudio = isDirectAudio(url);

  const mediaTypeLabel = ytEmbed
    ? 'YouTube Video'
    : igEmbed
    ? 'Instagram Reel'
    : spotifyEmbed
    ? 'Spotify Track'
    : soundcloudEmbed
    ? 'SoundCloud Audio'
    : isVideo
    ? 'Direct Video'
    : isAudio
    ? 'Audio Player'
    : 'Web Media';

  const badgeIcon = ytEmbed
    ? '▶️'
    : igEmbed
    ? '📸'
    : (spotifyEmbed || soundcloudEmbed || isAudio)
    ? '🎵'
    : isVideo
    ? '🎬'
    : '🌐';

  const handleClose = () => {
    setIsMinimized(false);
    onClose();
  };

  const cardContent = (
    <div
      className={`link-modal-card ${igEmbed ? 'tall-card' : ''} ${isMinimized ? 'is-minimized' : ''}`}
      onClick={e => e.stopPropagation()}
    >
      {/* Header */}
      <div className="link-modal-header" onClick={() => isMinimized && setIsMinimized(false)}>
        <div className="link-modal-title">
          <span className="link-badge-icon">{badgeIcon}</span>
          <span className="link-title-text">{title || mediaTypeLabel}</span>
        </div>
        <div className="link-modal-actions">
          {!isMinimized && (
            <a
              href={url}
              target="_blank"
              rel="noopener noreferrer"
              className="link-open-ext-btn"
              title="Open in new tab"
            >
              <span>Open in App</span> ↗
            </a>
          )}
          
          {/* Minimize / Maximize Toggle */}
          <button
            type="button"
            className="link-ctrl-btn minimize"
            onClick={(e) => {
              e.stopPropagation();
              setIsMinimized(prev => !prev);
            }}
            title={isMinimized ? "Expand to full modal" : "Minimize to chat in background"}
            aria-label={isMinimized ? "Expand player" : "Minimize player"}
          >
            {isMinimized ? '⤢' : '🗕'}
          </button>

          <button
            type="button"
            className="link-close-btn"
            onClick={handleClose}
            aria-label="Close modal"
            title="Close"
          >
            ✕
          </button>
        </div>
      </div>

      {/* Player Viewport */}
      <div className="link-modal-body">
        {ytEmbed ? (
          <div className="link-video-responsive">
            <iframe
              src={ytEmbed}
              title={title || 'YouTube Player'}
              allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
              allowFullScreen
              className="link-iframe-player"
            />
          </div>
        ) : igEmbed ? (
          <div className="link-instagram-responsive">
            <iframe
              src={igEmbed}
              title={title || 'Instagram Reel'}
              allowTransparency
              allow="encrypted-media"
              className="link-instagram-iframe"
            />
          </div>
        ) : spotifyEmbed ? (
          <div className="link-spotify-responsive">
            <iframe
              src={spotifyEmbed}
              title={title || 'Spotify Player'}
              allow="autoplay; clipboard-write; encrypted-media; fullscreen; picture-in-picture"
              loading="lazy"
              className="link-spotify-iframe"
            />
          </div>
        ) : soundcloudEmbed ? (
          <div className="link-soundcloud-responsive">
            <iframe
              src={soundcloudEmbed}
              title={title || 'SoundCloud Player'}
              allow="autoplay"
              className="link-soundcloud-iframe"
            />
          </div>
        ) : isVideo ? (
          <div className="link-video-responsive">
            <video
              src={url}
              controls
              autoPlay
              playsInline
              className="link-direct-video"
            />
          </div>
        ) : isAudio ? (
          <div className="link-audio-card">
            <div className="link-audio-visualizer">
              <span className="audio-disc-icon">🎵</span>
              <div className="audio-info">
                <h4>{title || 'Audio Track'}</h4>
                <p className="link-audio-url">{url.split('/').pop()?.split('?')[0] || url}</p>
              </div>
            </div>
            <audio src={url} controls autoPlay className="link-direct-audio" />
          </div>
        ) : (
          <div className="link-web-preview">
            <div className="link-web-icon">🌐</div>
            <h4>{title || 'Shared Web Link'}</h4>
            <p className="link-web-url">{url}</p>
            <a
              href={url}
              target="_blank"
              rel="noopener noreferrer"
              className="link-btn-launch"
            >
              Launch Link in New Window ↗
            </a>
          </div>
        )}
      </div>
    </div>
  );

  if (isMinimized) {
    return (
      <div className="link-minimized-floating-container" role="region" aria-label="Floating media player">
        {cardContent}
      </div>
    );
  }

  return (
    <div className="link-modal-overlay" role="dialog" aria-modal="true" onClick={onClose}>
      {cardContent}
    </div>
  );
}

