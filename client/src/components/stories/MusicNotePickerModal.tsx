import React, { useState, useEffect } from 'react';
import type {
  MusicTrack,
  SelectedMusicClip,
  MusicPlayerState
} from '../../services/musicCatalog';
import {
  LEGAL_MUSIC_CATALOG,
  musicCatalogService
} from '../../services/musicCatalog';
import { IconSearch, IconPlay, IconPause, IconClose, IconMusic } from '../common/Icons';
import './MusicNotePickerModal.css';

interface MusicNotePickerModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSelectClip: (clip: SelectedMusicClip) => void;
  initialClip?: SelectedMusicClip | null;
}

export const MusicNotePickerModal: React.FC<MusicNotePickerModalProps> = ({
  isOpen,
  onClose,
  onSelectClip,
  initialClip
}) => {
  const [searchQuery, setSearchQuery] = useState('');
  const [tracks, setTracks] = useState<MusicTrack[]>(LEGAL_MUSIC_CATALOG);
  const [selectedTrack, setSelectedTrack] = useState<MusicTrack | null>(initialClip?.track || null);
  const [clipStart, setClipStart] = useState<number>(initialClip?.clipStart || 0);
  const [clipDuration, setClipDuration] = useState<number>(initialClip?.clipDuration || 30);
  const [playerState, setPlayerState] = useState<MusicPlayerState>(musicCatalogService.getState());

  useEffect(() => {
    return musicCatalogService.subscribe(state => {
      setPlayerState(state);
    });
  }, []);

  useEffect(() => {
    if (!isOpen) {
      musicCatalogService.stop();
    }
  }, [isOpen]);

  useEffect(() => {
    const q = searchQuery.trim().toLowerCase();
    if (!q) {
      setTracks(LEGAL_MUSIC_CATALOG);
    } else {
      setTracks(
        LEGAL_MUSIC_CATALOG.filter(
          t =>
            t.title.toLowerCase().includes(q) ||
            t.artist.toLowerCase().includes(q) ||
            t.genre.toLowerCase().includes(q)
        )
      );
    }
  }, [searchQuery]);

  if (!isOpen) return null;

  const handleTogglePreview = (track: MusicTrack, startSec: number = 0, durSec: number = 30) => {
    if (playerState.isPlaying && playerState.currentTrack?.id === track.id) {
      musicCatalogService.stop();
    } else {
      musicCatalogService.playClip(track, startSec, durSec);
    }
  };

  const handleSelectTrack = (track: MusicTrack) => {
    setSelectedTrack(track);
    setClipStart(0);
    // Auto preview first 30 seconds
    musicCatalogService.playClip(track, 0, clipDuration);
  };

  const handleClipStartChange = (newStart: number) => {
    setClipStart(newStart);
    if (selectedTrack) {
      musicCatalogService.playClip(selectedTrack, newStart, clipDuration);
    }
  };

  const handleDurationToggle = (dur: number) => {
    setClipDuration(dur);
    if (selectedTrack) {
      musicCatalogService.playClip(selectedTrack, clipStart, dur);
    }
  };

  const handleAttach = () => {
    if (!selectedTrack) return;
    musicCatalogService.stop();
    onSelectClip({
      track: selectedTrack,
      clipStart,
      clipDuration
    });
    onClose();
  };

  const formatSeconds = (sec: number) => {
    const m = Math.floor(sec / 60);
    const s = Math.floor(sec % 60);
    return `${m}:${s < 10 ? '0' : ''}${s}`;
  };

  return (
    <div className="music-picker-overlay" onClick={onClose} role="dialog" aria-modal="true">
      <div className="music-picker-modal" onClick={e => e.stopPropagation()}>
        {/* Header */}
        <div className="music-picker-header">
          <div className="music-picker-title-group">
            <span className="music-picker-icon-badge">
              <IconMusic size={18} color="var(--wibby-primary)" />
            </span>
            <h3>{selectedTrack ? 'Trim Music Clip' : 'Browse Music Notes'}</h3>
          </div>
          <button className="music-picker-close-btn" onClick={onClose} aria-label="Close">
            <IconClose size={18} />
          </button>
        </div>

        {/* Content View: Browse List or Clip Trimmer */}
        {!selectedTrack ? (
          <div className="music-picker-browse-view">
            {/* Search Bar */}
            <div className="music-picker-search">
              <IconSearch size={16} className="search-icon" />
              <input
                type="text"
                placeholder="Search songs, artists, or genres..."
                value={searchQuery}
                onChange={e => setSearchQuery(e.target.value)}
                autoFocus
              />
              {searchQuery && (
                <button
                  type="button"
                  className="search-clear-btn"
                  onClick={() => setSearchQuery('')}
                >
                  <IconClose size={14} />
                </button>
              )}
            </div>

            {/* Track Catalog List */}
            <div className="music-picker-track-list">
              {tracks.length === 0 ? (
                <div className="music-picker-empty">
                  <p>No songs found for "{searchQuery}"</p>
                </div>
              ) : (
                tracks.map(track => {
                  const isCurrentPlaying =
                    playerState.isPlaying && playerState.currentTrack?.id === track.id;
                  return (
                    <div
                      key={track.id}
                      className={`music-track-item ${isCurrentPlaying ? 'is-playing' : ''}`}
                    >
                      <button
                        type="button"
                        className="track-art-btn"
                        style={{ background: track.artworkGradient }}
                        onClick={() => handleTogglePreview(track, 0, 30)}
                        title={isCurrentPlaying ? 'Pause preview' : 'Play preview'}
                        aria-label={isCurrentPlaying ? 'Pause preview' : 'Play preview'}
                      >
                        <span className="track-art-emoji">{track.coverEmoji}</span>
                        <span className="track-play-hover">
                          {isCurrentPlaying ? (
                            <IconPause size={18} color="#fff" />
                          ) : (
                            <IconPlay size={18} color="#fff" />
                          )}
                        </span>
                      </button>

                      <div className="track-info" onClick={() => handleSelectTrack(track)}>
                        <span className="track-title">{track.title}</span>
                        <div className="track-meta">
                          <span className="track-artist">{track.artist}</span>
                          <span className="track-dot">•</span>
                          <span className="track-genre">{track.genre}</span>
                        </div>
                      </div>

                      <div className="track-action">
                        <button
                          type="button"
                          className="track-select-btn"
                          onClick={() => handleSelectTrack(track)}
                        >
                          Select
                        </button>
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </div>
        ) : (
          /* Clip Trimmer View */
          <div className="music-picker-trimmer-view">
            {/* Selected Song Preview Banner */}
            <div className="selected-track-card">
              <div
                className="selected-track-art"
                style={{ background: selectedTrack.artworkGradient }}
              >
                <span>{selectedTrack.coverEmoji}</span>
              </div>
              <div className="selected-track-details">
                <span className="selected-title">{selectedTrack.title}</span>
                <span className="selected-artist">{selectedTrack.artist}</span>
                <span className="selected-genre">{selectedTrack.genre}</span>
              </div>
              <button
                type="button"
                className="change-track-btn"
                onClick={() => {
                  musicCatalogService.stop();
                  setSelectedTrack(null);
                }}
              >
                Change Song
              </button>
            </div>

            {/* Trimmer Controls */}
            <div className="trimmer-section">
              <div className="trimmer-labels">
                <span>Selected Clip Segment:</span>
                <span className="clip-time-badge">
                  {formatSeconds(clipStart)} – {formatSeconds(clipStart + clipDuration)} (
                  {clipDuration}s)
                </span>
              </div>

              {/* Slider for start point */}
              <div className="trimmer-slider-wrap">
                <input
                  type="range"
                  min={0}
                  max={Math.max(0, selectedTrack.duration - clipDuration)}
                  step={1}
                  value={clipStart}
                  onChange={e => handleClipStartChange(Number(e.target.value))}
                  className="trimmer-slider"
                />
                <div className="trimmer-ticks">
                  <span>0:00</span>
                  <span>{formatSeconds(Math.floor(selectedTrack.duration / 2))}</span>
                  <span>{formatSeconds(selectedTrack.duration)}</span>
                </div>
              </div>

              {/* Clip Duration Toggle */}
              <div className="clip-duration-picker">
                <span className="duration-label">Clip Length:</span>
                <div className="duration-pill-group">
                  <button
                    type="button"
                    className={`duration-pill ${clipDuration === 15 ? 'active' : ''}`}
                    onClick={() => handleDurationToggle(15)}
                  >
                    15 Seconds
                  </button>
                  <button
                    type="button"
                    className={`duration-pill ${clipDuration === 30 ? 'active' : ''}`}
                    onClick={() => handleDurationToggle(30)}
                  >
                    30 Seconds
                  </button>
                </div>
              </div>

              {/* Interactive Player Scrubber */}
              <div className="trimmer-playback-bar">
                <button
                  type="button"
                  className="trimmer-play-btn"
                  onClick={() => handleTogglePreview(selectedTrack, clipStart, clipDuration)}
                  aria-label={playerState.isPlaying ? 'Pause' : 'Play'}
                >
                  {playerState.isPlaying ? (
                    <IconPause size={18} color="#fff" />
                  ) : (
                    <IconPlay size={18} color="#fff" />
                  )}
                </button>
                <div className="trimmer-progress-track">
                  <div
                    className="trimmer-progress-fill"
                    style={{ width: `${playerState.progress * 100}%` }}
                  />
                </div>
                <span className="trimmer-status">
                  {playerState.isPlaying ? 'Previewing…' : 'Tap to preview'}
                </span>
              </div>
            </div>

            {/* Modal Actions */}
            <div className="music-picker-footer">
              <button
                type="button"
                className="picker-btn-cancel"
                onClick={() => {
                  musicCatalogService.stop();
                  setSelectedTrack(null);
                }}
              >
                Back
              </button>
              <button type="button" className="picker-btn-attach" onClick={handleAttach}>
                Attach to Note 🎵
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
