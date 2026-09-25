import { useState, useRef } from 'react';
import type { ChangeEvent } from 'react';
import { MusicNotePickerModal } from './MusicNotePickerModal';
import type { SelectedMusicClip } from '../../services/musicCatalog';
import { IconMusic, IconClose, IconEdit } from '../common/Icons';
import './CreateStoryModal.css';

interface CreateStoryModalProps {
  isOpen: boolean;
  onClose: () => void;
  onPostStory: (formData: FormData | { type: 'text'; text: string; backgroundColor: string; musicNote?: any; textStyle?: any }) => Promise<void>;
  onOpenCamera?: () => void;
}

const BG_COLORS = [
  { name: 'Purple', val: '#7C3AED' },
  { name: 'Midnight', val: '#1E1B4B' },
  { name: 'Sunset', val: '#F43F5E' },
  { name: 'Emerald', val: '#059669' },
  { name: 'Ocean', val: '#0284C7' },
  { name: 'Charcoal', val: '#18181B' }
];

export default function CreateStoryModal({ isOpen, onClose, onPostStory }: CreateStoryModalProps) {
  const [tab, setTab] = useState<'text' | 'media'>('text');
  const [text, setText] = useState('');
  const [bgColor, setBgColor] = useState('#7C3AED');
  const [mediaFile, setMediaFile] = useState<File | null>(null);
  const [mediaPreviewUrl, setMediaPreviewUrl] = useState<string | null>(null);
  const [caption, setCaption] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [musicClip, setMusicClip] = useState<SelectedMusicClip | null>(null);
  const [showMusicPicker, setShowMusicPicker] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  if (!isOpen) return null;

  const handleFileSelect = (e: ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      const file = e.target.files[0];
      setMediaFile(file);
      const url = URL.createObjectURL(file);
      setMediaPreviewUrl(url);
    }
  };

  const handlePost = async () => {
    setSubmitting(true);
    try {
      const musicPayload = musicClip ? {
        id: musicClip.track.id,
        title: musicClip.track.title,
        artist: musicClip.track.artist,
        genre: musicClip.track.genre,
        artworkUrl: musicClip.track.artworkGradient,
        duration: musicClip.track.duration,
        clipStart: musicClip.clipStart,
        clipDuration: musicClip.clipDuration
      } : null;

      if (tab === 'text') {
        const textContent = text.trim() || (musicClip ? `🎵 ${musicClip.track.title} • ${musicClip.track.artist}` : '');
        if (!textContent) return;
        await onPostStory({
          type: 'text',
          text: textContent,
          backgroundColor: bgColor,
          musicNote: musicPayload
        });
      } else {
        if (!mediaFile) return;
        const fd = new FormData();
        fd.append('file', mediaFile);
        if (caption.trim()) {
          fd.append('caption', caption.trim());
        }
        if (musicPayload) {
          fd.append('musicNote', JSON.stringify(musicPayload));
        }
        await onPostStory(fd);
      }
      onClose();
      setText('');
      setMediaFile(null);
      setMediaPreviewUrl(null);
      setCaption('');
      setMusicClip(null);
    } catch (err) {
      console.error('Post story error:', err);
    } finally {
      setSubmitting(false);
    }
  };

  const formatSeconds = (sec: number) => {
    const m = Math.floor(sec / 60);
    const s = Math.floor(sec % 60);
    return `${m}:${s < 10 ? '0' : ''}${s}`;
  };

  return (
    <>
      <div className="create-story-overlay" onClick={onClose} role="dialog" aria-modal="true" aria-label="Create a story">
        <div className="create-story-card" onClick={e => e.stopPropagation()}>
          <div className="create-story-header">
            <div className="create-story-tabs">
              <button
                className={`create-story-tab ${tab === 'text' ? 'active' : ''}`}
                onClick={() => setTab('text')}
              >
                ✍️ Text
              </button>
              <button
                className={`create-story-tab ${tab === 'media' ? 'active' : ''}`}
                onClick={() => setTab('media')}
              >
                🖼️ Photo / Video
              </button>
            </div>
            <button className="create-story-close" onClick={onClose} aria-label="Close">✕</button>
          </div>

          <div className="create-story-body">
            {tab === 'text' ? (
              <div className="story-text-editor" style={{ background: bgColor }}>
                <textarea
                  className="story-text-input"
                  placeholder="Share a thought or music note..."
                  value={text}
                  onChange={e => setText(e.target.value)}
                  maxLength={200}
                  autoFocus
                />
                
                {/* Attached Music Note Display */}
                {musicClip ? (
                  <div className="story-attached-music-card">
                    <div className="attached-music-art" style={{ background: musicClip.track.artworkGradient }}>
                      <span>{musicClip.track.coverEmoji}</span>
                    </div>
                    <div className="attached-music-meta">
                      <span className="attached-title">{musicClip.track.title}</span>
                      <span className="attached-sub">
                        {musicClip.track.artist} • Clip: {formatSeconds(musicClip.clipStart)}–{formatSeconds(musicClip.clipStart + musicClip.clipDuration)}
                      </span>
                    </div>
                    <div className="attached-music-actions">
                      <button
                        type="button"
                        className="attached-action-btn"
                        onClick={() => setShowMusicPicker(true)}
                        title="Change clip or song"
                      >
                        <IconEdit size={14} />
                      </button>
                      <button
                        type="button"
                        className="attached-action-btn remove"
                        onClick={() => setMusicClip(null)}
                        title="Remove music"
                      >
                        <IconClose size={14} />
                      </button>
                    </div>
                  </div>
                ) : (
                  <button
                    type="button"
                    className="story-add-music-btn"
                    onClick={() => setShowMusicPicker(true)}
                  >
                    <IconMusic size={16} />
                    <span>Attach Music Note</span>
                  </button>
                )}

              <div className="story-bg-picker">
                {BG_COLORS.map(c => (
                  <button
                    key={c.val}
                    type="button"
                    className={`story-bg-dot ${bgColor === c.val ? 'active' : ''}`}
                    style={{ background: c.val }}
                    onClick={() => setBgColor(c.val)}
                    title={c.name}
                  />
                ))}
              </div>
            </div>
          ) : (
            <div className="story-media-editor">
              {mediaPreviewUrl ? (
                <div className="story-media-preview-wrap">
                  {mediaFile?.type.startsWith('video/') ? (
                    <video src={mediaPreviewUrl} className="story-media-preview" controls autoPlay loop />
                  ) : (
                    <img src={mediaPreviewUrl} alt="Story preview" className="story-media-preview" />
                  )}
                  <button
                    className="story-remove-media-btn"
                    onClick={() => {
                      setMediaFile(null);
                      setMediaPreviewUrl(null);
                    }}
                    title="Choose different media"
                  >
                    Change
                  </button>
                </div>
              ) : (
                <div
                  className="story-media-dropzone"
                  onClick={() => fileInputRef.current?.click()}
                >
                  <span className="dropzone-icon">📷</span>
                  <span className="dropzone-title">Upload Photo or Video</span>
                  <span className="dropzone-sub">Click to browse your device</span>
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept="image/*,video/*"
                    style={{ display: 'none' }}
                    onChange={handleFileSelect}
                  />
                </div>
              )}

              {/* Attached Music Note Display for Media Tab */}
              {musicClip ? (
                <div className="story-attached-music-card" style={{ margin: '8px 0' }}>
                  <div className="attached-music-art" style={{ background: musicClip.track.artworkGradient }}>
                    <span>{musicClip.track.coverEmoji}</span>
                  </div>
                  <div className="attached-music-meta">
                    <span className="attached-title">{musicClip.track.title}</span>
                    <span className="attached-sub">
                      {musicClip.track.artist} • Clip: {formatSeconds(musicClip.clipStart)}–{formatSeconds(musicClip.clipStart + musicClip.clipDuration)}
                    </span>
                  </div>
                  <div className="attached-music-actions">
                    <button
                      type="button"
                      className="attached-action-btn"
                      onClick={() => setShowMusicPicker(true)}
                      title="Change clip or song"
                    >
                      <IconEdit size={14} />
                    </button>
                    <button
                      type="button"
                      className="attached-action-btn remove"
                      onClick={() => setMusicClip(null)}
                      title="Remove music"
                    >
                      <IconClose size={14} />
                    </button>
                  </div>
                </div>
              ) : (
                <button
                  type="button"
                  className="story-add-music-btn"
                  style={{ margin: '8px 0' }}
                  onClick={() => setShowMusicPicker(true)}
                >
                  <IconMusic size={16} />
                  <span>Attach Music Note</span>
                </button>
              )}

              <input
                type="text"
                className="story-caption-input"
                placeholder="Add a caption... (optional)"
                value={caption}
                onChange={e => setCaption(e.target.value)}
                maxLength={200}
              />
            </div>
          )}
        </div>

        <div className="create-story-footer">
          <button type="button" className="create-story-btn-cancel" onClick={onClose}>
            Cancel
          </button>
          <button
            type="button"
            className="create-story-btn-post"
            disabled={submitting || (tab === 'text' ? (!text.trim() && !musicClip) : !mediaFile)}
            onClick={handlePost}
          >
            {submitting ? 'Sharing…' : 'Share Story (24h)'}
          </button>
        </div>
      </div>
    </div>

    <MusicNotePickerModal
      isOpen={showMusicPicker}
      onClose={() => setShowMusicPicker(false)}
      onSelectClip={(clip) => setMusicClip(clip)}
      initialClip={musicClip}
    />
  </>
);
}
