import { useState, useRef } from 'react';
import type { ChangeEvent } from 'react';
import './CreateStoryModal.css';

interface CreateStoryModalProps {
  isOpen: boolean;
  onClose: () => void;
  onPostStory: (formData: FormData | { type: 'text'; text: string; backgroundColor: string; textStyle?: any }) => Promise<void>;
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
      if (tab === 'text') {
        if (!text.trim()) return;
        await onPostStory({
          type: 'text',
          text: text.trim(),
          backgroundColor: bgColor
        });
      } else {
        if (!mediaFile) return;
        const fd = new FormData();
        fd.append('file', mediaFile);
        if (caption.trim()) {
          fd.append('caption', caption.trim());
        }
        await onPostStory(fd);
      }
      onClose();
      setText('');
      setMediaFile(null);
      setMediaPreviewUrl(null);
      setCaption('');
    } catch (err) {
      console.error('Post story error:', err);
    } finally {
      setSubmitting(false);
    }
  };

  return (
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
                placeholder="Share a thought or music note (e.g. 🎵 Song • Artist)..."
                value={text}
                onChange={e => setText(e.target.value)}
                maxLength={200}
                autoFocus
              />
              
              {/* Instagram Music Note Quick Picks */}
              <div className="music-notes-quick-picks">
                <span className="quick-pick-label">🎵 Quick Music Notes:</span>
                <div className="quick-pick-chips">
                  <button type="button" className="music-chip" onClick={() => setText('🎵 Blinding Lights • The Weeknd')}>
                    🎵 Blinding Lights
                  </button>
                  <button type="button" className="music-chip" onClick={() => setText('🎵 Die With A Smile • Bruno Mars & Lady Gaga')}>
                    🎵 Die With A Smile
                  </button>
                  <button type="button" className="music-chip" onClick={() => setText('🎵 Golden Hour • JVKE')}>
                    🎵 Golden Hour
                  </button>
                  <button type="button" className="music-chip" onClick={() => setText('🎵 Espresso • Sabrina Carpenter')}>
                    🎵 Espresso
                  </button>
                  <button type="button" className="music-chip" onClick={() => setText('🎵 Birds of a Feather • Billie Eilish')}>
                    🎵 Birds of a Feather
                  </button>
                </div>
              </div>

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
            disabled={submitting || (tab === 'text' ? !text.trim() : !mediaFile)}
            onClick={handlePost}
          >
            {submitting ? 'Sharing…' : 'Share Story (24h)'}
          </button>
        </div>
      </div>
    </div>
  );
}
