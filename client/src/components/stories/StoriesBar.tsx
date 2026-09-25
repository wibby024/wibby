import { useState, useEffect, useCallback } from 'react';
import { useAuth } from '../../context/AuthContext';
import { useSocket } from '../../context/SocketContext';
import { musicNoteService } from '../../services/musicNoteService';
import { musicCatalogService, LEGAL_MUSIC_CATALOG } from '../../services/musicCatalog';
import { resolvePartnerName } from '../../utils/partnerName';
import type { Story } from '../../types/chat';
import CreateStoryModal from './CreateStoryModal';
import StoryViewerModal from './StoryViewerModal';
import './StoriesBar.css';

interface StoriesBarProps {
  conversationId: string;
  partnerName: string;
  partnerInitial?: string;
  userInitial?: string;
}

export default function StoriesBar({
  conversationId,
  partnerName,
  partnerInitial: customPartnerInitial,
  userInitial: customUserInitial
}: StoriesBarProps) {
  const { user, profile } = useAuth();
  const { socket } = useSocket();

  const [stories, setStories] = useState<Story[]>([]);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [viewerStartIndex, setViewerStartIndex] = useState<number | null>(null);
  const [playingSong, setPlayingSong] = useState<string | null>(null);

  useEffect(() => {
    const unsub1 = musicNoteService.subscribe((song, isPlaying) => {
      if (isPlaying) setPlayingSong(song);
      else if (!musicCatalogService.getState().isPlaying) setPlayingSong(null);
    });
    const unsub2 = musicCatalogService.subscribe(state => {
      if (state.isPlaying && state.currentTrack) setPlayingSong(state.currentTrack.title);
      else if (!musicNoteService.isPlaying()) setPlayingSong(null);
    });
    return () => {
      unsub1();
      unsub2();
    };
  }, []);

  const currentUserId = user?.uid || '';
  const rawUserDisplayName = profile?.displayName || user?.displayName;
  const isBadUserDisplayName = !rawUserDisplayName || rawUserDisplayName === 'Unknown' || rawUserDisplayName === 'unknown';
  const userDisplayName = !isBadUserDisplayName
    ? rawUserDisplayName
    : (profile?.username && profile.username !== 'unknown' ? profile.username : 'You');
  const userInitial = customUserInitial || userDisplayName.charAt(0).toUpperCase();
  const cleanPartnerName = resolvePartnerName({ displayName: partnerName }, partnerName);
  const partnerInitial = customPartnerInitial || cleanPartnerName.charAt(0).toUpperCase();

  const fetchStories = useCallback(async () => {
    if (!user || !conversationId) return;
    try {
      const token = await user.getIdToken();
      const res = await fetch(`${import.meta.env.VITE_API_URL || 'http://localhost:3000'}/api/conversations/${conversationId}/stories`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      if (res.ok) {
        const data = await res.json();
        setStories(data.stories || []);
      }
    } catch (err) {
      console.error('Fetch stories error:', err);
    }
  }, [user, conversationId]);

  useEffect(() => {
    fetchStories();
  }, [fetchStories]);

  // Socket listener for new stories or deleted stories
  useEffect(() => {
    if (!socket || !conversationId) return;

    const handleNewStory = (data: { story: Story }) => {
      if (data.story && data.story.conversationId === conversationId) {
        setStories(prev => {
          if (prev.some(s => s._id === data.story._id)) return prev;
          return [...prev, data.story];
        });
      }
    };

    const handleDeleteStory = (data: { storyId: string }) => {
      setStories(prev => prev.filter(s => s._id !== data.storyId));
    };

    socket.on('story:new', handleNewStory);
    socket.on('story:delete', handleDeleteStory);

    return () => {
      socket.off('story:new', handleNewStory);
      socket.off('story:delete', handleDeleteStory);
    };
  }, [socket, conversationId]);

  const handlePostStory = async (formDataOrObj: FormData | { type: 'text'; text: string; backgroundColor: string; textStyle?: any }) => {
    if (!user || !conversationId) return;
    try {
      const token = await user.getIdToken();
      const isFormData = formDataOrObj instanceof FormData;
      const res = await fetch(`${import.meta.env.VITE_API_URL || 'http://localhost:3000'}/api/conversations/${conversationId}/stories`, {
        method: 'POST',
        headers: isFormData ? { 'Authorization': `Bearer ${token}` } : { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: isFormData ? formDataOrObj : JSON.stringify(formDataOrObj)
      });
      if (res.ok) {
        const data = await res.json();
        if (data.story) {
          setStories(prev => [...prev, data.story]);
        }
      }
    } catch (err) {
      console.error('Post story error:', err);
    }
  };

  const handleViewStory = async (storyId: string) => {
    if (!user || !conversationId) return;
    try {
      const token = await user.getIdToken();
      await fetch(`${import.meta.env.VITE_API_URL || 'http://localhost:3000'}/api/conversations/${conversationId}/stories/${storyId}/view`, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${token}` }
      });
    } catch (err) {
      console.error('View story error:', err);
    }
  };

  const handleReactStory = async (storyId: string, emoji: string) => {
    if (!user || !conversationId) return;
    try {
      const token = await user.getIdToken();
      await fetch(`${import.meta.env.VITE_API_URL || 'http://localhost:3000'}/api/conversations/${conversationId}/stories/${storyId}/react`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({ emoji })
      });
    } catch (err) {
      console.error('React story error:', err);
    }
  };

  const handleDeleteStory = async (storyId: string) => {
    if (!user || !conversationId) return;
    try {
      const token = await user.getIdToken();
      await fetch(`${import.meta.env.VITE_API_URL || 'http://localhost:3000'}/api/conversations/${conversationId}/stories/${storyId}`, {
        method: 'DELETE',
        headers: { 'Authorization': `Bearer ${token}` }
      });
      setStories(prev => prev.filter(s => s._id !== storyId));
    } catch (err) {
      console.error('Delete story error:', err);
    }
  };

  const handleReplyStory = async (story: Story, text: string) => {
    if (!user || !conversationId) return;
    try {
      const token = await user.getIdToken();
      await fetch(`${import.meta.env.VITE_API_URL || 'http://localhost:3000'}/api/conversations/${conversationId}/messages`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({
          text: `Replied to story: ${text}`,
          type: 'text',
          replyToStoryId: story._id
        })
      });
    } catch (err) {
      console.error('Reply story error:', err);
    }
  };

  const userStories = stories.filter(s => s.creatorId === currentUserId);
  const partnerStories = stories.filter(s => s.creatorId !== currentUserId);

  const hasUserStory = userStories.length > 0;
  const hasPartnerStory = partnerStories.length > 0;

  // Most recent story / note for user & partner
  const latestUserStory = userStories[userStories.length - 1];
  const latestPartnerStory = partnerStories[partnerStories.length - 1];

  const userNoteText = latestUserStory?.musicNote
    ? `🎵 ${latestUserStory.musicNote.title} • ${latestUserStory.musicNote.artist}`
    : (latestUserStory 
      ? (latestUserStory.type === 'text' ? latestUserStory.text : (latestUserStory.caption || 'Story')) 
      : null);

  const partnerNoteText = latestPartnerStory?.musicNote
    ? `🎵 ${latestPartnerStory.musicNote.title} • ${latestPartnerStory.musicNote.artist}`
    : (latestPartnerStory 
      ? (latestPartnerStory.type === 'text' ? latestPartnerStory.text : (latestPartnerStory.caption || 'Story')) 
      : null);

  const isUserPlaying = Boolean(
    playingSong &&
    (playingSong === userNoteText || (latestUserStory?.musicNote && playingSong === latestUserStory.musicNote.title))
  );

  const isPartnerPlaying = Boolean(
    playingSong &&
    (playingSong === partnerNoteText || (latestPartnerStory?.musicNote && playingSong === latestPartnerStory.musicNote.title))
  );

  // Check if partner story is unviewed
  const hasUnviewedPartnerStory = partnerStories.some(
    s => !Array.isArray(s.viewers) || !s.viewers.some(v => v.uid === currentUserId)
  );

  const handleToggleNoteMusic = (e: React.MouseEvent, story: Story | undefined, fallbackText: string | null) => {
    e.stopPropagation();
    if (story?.musicNote) {
      if (playingSong && (playingSong === story.musicNote.title || playingSong === fallbackText)) {
        musicCatalogService.stop();
        musicNoteService.stop();
      } else {
        musicNoteService.stop();
        const mn = story.musicNote;
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
      }
    } else if (fallbackText) {
      if (playingSong === fallbackText) {
        musicNoteService.stop();
        musicCatalogService.stop();
      } else {
        musicCatalogService.stop();
        musicNoteService.playSong(fallbackText);
      }
    }
  };

  return (
    <>
      <div className="stories-bar" aria-label="Stories and Notes">
        {/* User Story Circle with Instagram Floating Note */}
        <div 
          className="story-circle-item" 
          onClick={() => hasUserStory ? setViewerStartIndex(0) : setShowCreateModal(true)}
        >
          {userNoteText ? (
            <div 
              className={`instagram-note-bubble ${isUserPlaying ? 'is-playing-music' : ''}`}
              title={userNoteText}
              onClick={(e) => handleToggleNoteMusic(e, latestUserStory, userNoteText)}
            >
              {isUserPlaying ? (
                <span className="note-music-equalizer">
                  <span className="eq-bar bar-1" />
                  <span className="eq-bar bar-2" />
                  <span className="eq-bar bar-3" />
                </span>
              ) : null}
              <span className="note-text-snippet">{userNoteText}</span>
              <div className="thought-tail-dot dot-1" />
              <div className="thought-tail-dot dot-2" />
            </div>
          ) : (
            <div 
              className="instagram-note-bubble note-prompt" 
              title="Share a thought or music note"
              onClick={(e) => {
                e.stopPropagation();
                setShowCreateModal(true);
              }}
            >
              <span className="note-text-snippet">+ Note</span>
              <div className="thought-tail-dot dot-1" />
              <div className="thought-tail-dot dot-2" />
            </div>
          )}

          <div className={`story-avatar-ring ${hasUserStory ? 'has-story viewed' : 'no-story'}`}>
            <div className="story-avatar user-avatar" style={{ background: 'linear-gradient(135deg, #7C3AED, #5B21B6)' }}>
              <span>{userInitial}</span>
            </div>
            {!hasUserStory && (
              <button
                className="story-add-badge"
                onClick={(e) => {
                  e.stopPropagation();
                  setShowCreateModal(true);
                }}
                title="Create story"
                aria-label="Create story"
              >
                +
              </button>
            )}
          </div>
          <span className="story-label">Your story</span>
        </div>

        {/* Partner Story Circle with Instagram Floating Note */}
        {hasPartnerStory && (
          <div 
            className="story-circle-item" 
            onClick={() => {
              const firstPartnerIndex = stories.findIndex(s => s.creatorId !== currentUserId);
              setViewerStartIndex(firstPartnerIndex >= 0 ? firstPartnerIndex : 0);
            }}
          >
            {partnerNoteText && (
              <div 
                className={`instagram-note-bubble partner-note ${isPartnerPlaying ? 'is-playing-music' : ''}`}
                title={partnerNoteText}
                onClick={(e) => handleToggleNoteMusic(e, latestPartnerStory, partnerNoteText)}
              >
                {isPartnerPlaying ? (
                  <span className="note-music-equalizer">
                    <span className="eq-bar bar-1" />
                    <span className="eq-bar bar-2" />
                    <span className="eq-bar bar-3" />
                  </span>
                ) : null}
                <span className="note-text-snippet">{partnerNoteText}</span>
                <div className="thought-tail-dot dot-1" />
                <div className="thought-tail-dot dot-2" />
              </div>
            )}

            <div className={`story-avatar-ring has-story ${hasUnviewedPartnerStory ? 'unviewed' : 'viewed'}`}>
              <div className="story-avatar partner-avatar" style={{ background: 'linear-gradient(135deg, #A78BFA, #7C3AED)' }}>
                <span>{partnerInitial}</span>
              </div>
            </div>
            <span className="story-label">{cleanPartnerName}</span>
          </div>
        )}
      </div>

      {/* Story Creator Modal */}
      {showCreateModal && (
        <CreateStoryModal
          isOpen={showCreateModal}
          onClose={() => setShowCreateModal(false)}
          onPostStory={handlePostStory}
        />
      )}

      {/* Story Viewer Modal */}
      {viewerStartIndex !== null && (
        <StoryViewerModal
          isOpen={viewerStartIndex !== null}
          stories={stories}
          startIndex={viewerStartIndex}
          currentUserId={currentUserId}
          partnerName={cleanPartnerName}
          onClose={() => setViewerStartIndex(null)}
          onViewStory={handleViewStory}
          onReactStory={handleReactStory}
          onDeleteStory={handleDeleteStory}
          onReplyStory={handleReplyStory}
        />
      )}
    </>
  );
}

