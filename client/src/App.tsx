import { useState, useEffect, useCallback, lazy, Suspense } from 'react'
import { useAuth } from './context/AuthContext'
import { useSocket, SocketProvider } from './context/SocketContext'
import { CallProvider, useCall } from './context/CallContext'
import CallModals from './components/call/CallModals'
import AuthPage from './pages/AuthPage'
import Sidebar from './components/Sidebar'
import ChatHeader from './components/ChatHeader'
import MessageArea from './components/MessageArea'
import PairingScreen from './components/PairingScreen'
import { notificationService } from './services/notificationService'
import { ringtoneService } from './services/ringtoneService'
import { resolvePartnerName, resolvePartnerUsername } from './utils/partnerName'
import type { ChatThemePreset } from './types/chat'
import TogetherPlayer from './components/together/TogetherPlayer'
import './App.css'

// Lazy-load non-critical heavy overlays and the 10 games engine to keep initial bundle lean
const ChatInfoDrawer = lazy(() => import('./components/ChatInfoDrawer'));
const ChatSearchModal = lazy(() => import('./components/ChatSearchModal'));
const SettingsModal = lazy(() => import('./components/SettingsModal'));
const MiniGameModal = lazy(() => import('./components/games/MiniGameModal'));
const MediaGalleryModal = lazy(() => import('./components/MediaGalleryModal'));

function LoadingScreen() {
  return (
    <main className="app-loading">
      <div className="app-loading-mark">W</div>
      <p>Loading Wibby…</p>
    </main>
  )
}

function WibbyAppWrapper() {
  const { user, signOut } = useAuth();
  const { socket } = useSocket();
  const { startCall, callState, activeCall } = useCall();
  const isCallActive = Boolean(activeCall || callState === 'CONNECTING' || callState === 'CONNECTED' || callState === 'RECONNECTING');

  const [sidebarOpen, setSidebarOpen] = useState(false)
  const [isPaired, setIsPaired] = useState<boolean | null>(() => {
    try {
      const cached = user?.uid ? localStorage.getItem(`wibby-paired-${user.uid}`) : null;
      return cached !== null ? JSON.parse(cached) : null;
    } catch {
      return null;
    }
  });
  const [partner, setPartner] = useState<any>(() => {
    try {
      const cached = user?.uid ? localStorage.getItem(`wibby-partner-${user.uid}`) : null;
      if (cached) {
        const parsed = JSON.parse(cached);
        if (parsed) {
          const resolvedName = resolvePartnerName(parsed, '');
          const resolvedUser = resolvePartnerUsername(parsed, '');
          return {
            ...parsed,
            display_name: resolvedName,
            displayName: resolvedName,
            username: resolvedUser
          };
        }
      }
      return null;
    } catch {
      return null;
    }
  });
  const [conversationId, setConversationId] = useState<string | null>(() => {
    try {
      return user?.uid ? localStorage.getItem(`wibby-conv-${user.uid}`) : null;
    } catch {
      return null;
    }
  });

  // Modals and Drawer state
  const [showInfoDrawer, setShowInfoDrawer] = useState(false);
  const [showSearchModal, setShowSearchModal] = useState(false);
  const [showSettingsModal, setShowSettingsModal] = useState(false);
  const [showTogether, setShowTogether] = useState(false);
  const [showGameModal, setShowGameModal] = useState(false);
  const [showMediaGallery, setShowMediaGallery] = useState(false);
  const [showSessionConflict, setShowSessionConflict] = useState(false);
  const [jumpTarget, setJumpTarget] = useState<{ id: string; timestamp: number } | null>(null);

  const handleJumpToMessage = useCallback((msgId: string) => {
    setShowInfoDrawer(false);
    setShowSearchModal(false);
    setJumpTarget({ id: msgId, timestamp: Date.now() });
  }, []);
  const [chatThemePreset, setChatThemePreset] = useState<ChatThemePreset>(() => {
    const saved = localStorage.getItem('wibby-chat-theme') as ChatThemePreset;
    return saved || 'classic';
  });

  const [theme, setTheme] = useState<'light' | 'dark'>(() => {
    const saved = localStorage.getItem('wibby-theme');
    if (saved === 'light' || saved === 'dark') return saved;
    return 'dark'; // Default to dark as requested
  });

  // When a new user logs into Wibby, ensure they have the default Wibby theme ('dark' + 'classic')
  useEffect(() => {
    if (!user?.uid) return;
    const lastUser = localStorage.getItem('wibby-current-user');
    if (lastUser !== user.uid) {
      localStorage.setItem('wibby-current-user', user.uid);
      const userSavedTheme = localStorage.getItem(`wibby-theme-${user.uid}`) as 'light' | 'dark' | null;
      const userSavedChatTheme = localStorage.getItem(`wibby-chat-theme-${user.uid}`) as ChatThemePreset | null;

      const initialTheme = userSavedTheme || 'dark';
      const initialChatTheme = userSavedChatTheme || 'classic';

      setTheme(initialTheme);
      setChatThemePreset(initialChatTheme);
      localStorage.setItem('wibby-theme', initialTheme);
      localStorage.setItem('wibby-chat-theme', initialChatTheme);
      document.documentElement.setAttribute('data-theme', initialTheme);
      document.documentElement.setAttribute('data-chat-theme', initialChatTheme);
      document.documentElement.setAttribute('data-theme-family', initialChatTheme);
    }
  }, [user?.uid]);

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme);
    localStorage.setItem('wibby-theme', theme);
  }, [theme]);

  useEffect(() => {
    document.documentElement.setAttribute('data-chat-theme', chatThemePreset);
    document.documentElement.setAttribute('data-theme-family', chatThemePreset);
    localStorage.setItem('wibby-chat-theme', chatThemePreset);
  }, [chatThemePreset]);

  // Optimistic instant hydration for fast perceived login (Issue 5)
  useEffect(() => {
    if (!user?.uid) return;
    try {
      const cachedPaired = localStorage.getItem(`wibby-paired-${user.uid}`);
      if (cachedPaired !== null) {
        setIsPaired(JSON.parse(cachedPaired));
      }
      const cachedPartner = localStorage.getItem(`wibby-partner-${user.uid}`);
      if (cachedPartner) {
        const parsed = JSON.parse(cachedPartner);
        if (parsed) {
          const resolvedName = resolvePartnerName(parsed, '');
          const resolvedUser = resolvePartnerUsername(parsed, '');
          setPartner({
            ...parsed,
            display_name: resolvedName,
            displayName: resolvedName,
            username: resolvedUser
          });
        }
      }
      const cachedConv = localStorage.getItem(`wibby-conv-${user.uid}`);
      if (cachedConv) {
        setConversationId(cachedConv);
      }
    } catch {}
  }, [user?.uid]);

  // Initialize notification and ringtone service with account sync
  useEffect(() => {
    if (user) {
      notificationService.init();
      ringtoneService.setUserId(user.uid);

      // Non-blocking parallel preferences sync
      (async () => {
        try {
          const token = await user.getIdToken();
          const apiUrl = import.meta.env.VITE_API_URL || 'http://localhost:3000';

          await Promise.allSettled([
            ringtoneService.syncWithAccount(token, user.uid),
            fetch(`${apiUrl}/api/users/preferences`, {
              headers: { Authorization: `Bearer ${token}` }
            }).then(async (prefRes) => {
              if (prefRes.ok) {
                const prefData = await prefRes.json();
                const prefs = prefData?.preferences;
                if (prefs) {
                  if (prefs.themeMode && (prefs.themeMode === 'light' || prefs.themeMode === 'dark')) {
                    setTheme(prefs.themeMode);
                  }
                  if (prefs.themeFamily) {
                    setChatThemePreset(prefs.themeFamily as ChatThemePreset);
                  }
                }
              }
            })
          ]);
        } catch (syncErr) {
          console.warn('[WIBBY PREFERENCES] Sync error:', syncErr);
        }
      })();
    }
  }, [user]);

  // Listen for real-time mini-game invitations
  useEffect(() => {
    if (!socket) return;
    const handleGameInvited = () => {
      setShowGameModal(true);
    };
    socket.on('game:invited', handleGameInvited);
    return () => {
      socket.off('game:invited', handleGameInvited);
    };
  }, [socket]);

  const toggleTheme = () => {
    setTheme(prev => {
      const next = prev === 'dark' ? 'light' : 'dark';
      localStorage.setItem('wibby-theme', next);
      if (user?.uid) {
        localStorage.setItem(`wibby-theme-${user.uid}`, next);
        (async () => {
          try {
            const token = await user.getIdToken();
            const apiUrl = import.meta.env.VITE_API_URL || 'http://localhost:3000';
            fetch(`${apiUrl}/api/users/preferences`, {
              method: 'PATCH',
              headers: {
                'Content-Type': 'application/json',
                Authorization: `Bearer ${token}`
              },
              body: JSON.stringify({ themeMode: next })
            }).catch(() => {});
          } catch {}
        })();
      }
      return next;
    });
  };

  const checkStatus = useCallback(async () => {
    try {
      if (!user) return;
      const token = await user.getIdToken();
      const url = `${import.meta.env.VITE_API_URL || 'http://localhost:3000'}/api/pairing/status`;
      const response = await fetch(url, {
        headers: {
          'Authorization': `Bearer ${token}`
        }
      });
      const data = await response.json();
      setIsPaired(!!data.paired);
      if (user?.uid) {
        localStorage.setItem(`wibby-paired-${user.uid}`, JSON.stringify(!!data.paired));
      }
      if (data.paired && data.conversationId) {
        const rawPartner = data.partner;
        const resolvedName = resolvePartnerName(rawPartner, '');
        const resolvedUser = resolvePartnerUsername(rawPartner, '');

        const p = rawPartner ? {
          ...rawPartner,
          display_name: resolvedName,
          displayName: resolvedName,
          username: resolvedUser
        } : null;

        if (p) {
          setPartner((prev: any) => {
            const effectiveOnline = (typeof rawPartner?.online === 'boolean')
              ? rawPartner.online
              : (prev?.online ?? false);
            const merged = {
              ...p,
              online: effectiveOnline,
              lastSeen: rawPartner?.lastSeen || prev?.lastSeen
            };
            if (user?.uid) {
              try {
                localStorage.setItem(`wibby-partner-${user.uid}`, JSON.stringify(merged));
              } catch { }
            }
            return merged;
          });
        }

        setConversationId(data.conversationId);
        const userSavedTheme = user?.uid ? (localStorage.getItem(`wibby-chat-theme-${user.uid}`) as ChatThemePreset) : null;
        const localTheme = localStorage.getItem('wibby-chat-theme') as ChatThemePreset;
        const effectiveTheme = userSavedTheme || localTheme || data.themeFamily || 'classic';
        setChatThemePreset(effectiveTheme);
        localStorage.setItem('wibby-chat-theme', effectiveTheme);
        if (user?.uid) {
          localStorage.setItem(`wibby-chat-theme-${user.uid}`, effectiveTheme);
          localStorage.setItem(`wibby-conv-${user.uid}`, data.conversationId);
        }
      } else {
        setConversationId(null);
        if (user?.uid) {
          localStorage.removeItem(`wibby-partner-${user.uid}`);
          localStorage.removeItem(`wibby-conv-${user.uid}`);
        }
        // Ensure unpaired new user starts with default 'classic' theme
        const userSavedChatTheme = user?.uid ? (localStorage.getItem(`wibby-chat-theme-${user.uid}`) as ChatThemePreset) : null;
        const currentTheme = userSavedChatTheme || 'classic';
        setChatThemePreset(currentTheme);
        localStorage.setItem('wibby-chat-theme', currentTheme);
      }
    } catch (err) {
      console.error(err);
      if (isPaired === null) {
        setIsPaired(false);
      }
      setConversationId(null);
    }
  }, [user, isPaired]);

  useEffect(() => {
    if (user) {
      checkStatus();
    } else {
      setIsPaired(false);
    }
  }, [user, checkStatus]);

  useEffect(() => {
    if (!socket) return;

    const handlePresence = (data: { uid: string, online: boolean, lastSeen?: string }) => {
      setPartner((prev: any) => {
        if (!prev) return prev;
        const isMatch = prev.firebaseUid === data.uid || prev.uid === data.uid || prev._id === data.uid;
        if (isMatch) {
          const updated = {
            ...prev,
            online: !!data.online,
            lastSeen: data.lastSeen || prev.lastSeen
          };
          if (user?.uid) {
            try {
              localStorage.setItem(`wibby-partner-${user.uid}`, JSON.stringify(updated));
            } catch { }
          }
          return updated;
        }
        return prev;
      });
    };

    const handleTogetherStarted = (data: any) => {
      if (data.conversationId === conversationId) {
        setShowTogether(true);
      }
    };

    const handleTogetherState = (data: any) => {
      if (data?.conversationId === conversationId && data?.mediaUrl) {
        setShowTogether(true);
      }
    };

    const handleTogetherEnded = (data: any) => {
      if (data?.conversationId === conversationId) {
        setShowTogether(false);
      }
    };

    const handleUnpair = () => {
      setIsPaired(false);
      setPartner(null);
      setConversationId(null);
      setShowInfoDrawer(false);
      setShowTogether(false);
      setChatThemePreset('classic');
      localStorage.setItem('wibby-chat-theme', 'classic');
      if (user?.uid) {
        localStorage.setItem(`wibby-chat-theme-${user.uid}`, 'classic');
        localStorage.setItem(`wibby-paired-${user.uid}`, 'false');
        localStorage.removeItem(`wibby-partner-${user.uid}`);
        localStorage.removeItem(`wibby-conv-${user.uid}`);
      }
    };

    const handleSessionConflict = () => {
      setShowSessionConflict(true);
    };

    const handleForceLogout = async () => {
      try {
        await signOut();
      } catch (err) {
        console.error('Force logout error:', err);
      }
    };

    const handleNewMessage = (msg: any) => {
      if (user && msg.senderId !== user.uid) {
        const preview = msg.text || (msg.type === 'image' ? 'Sent a photo' : msg.type === 'video' ? 'Sent a video' : msg.type === 'audio' ? 'Sent a voice message' : msg.fileName || 'Sent an attachment');
        const sender = resolvePartnerName(partner);
        notificationService.onNewMessage(sender, preview);
      }
    };

    const handlePartnerProfileUpdated = (updatedProfile: any) => {
      if (updatedProfile && (!updatedProfile.uid || updatedProfile.uid !== user?.uid)) {
        setPartner((prev: any) => {
          const merged = {
            ...(prev || {}),
            ...updatedProfile,
            displayName: resolvePartnerName(updatedProfile, prev?.displayName || ''),
            display_name: resolvePartnerName(updatedProfile, prev?.display_name || ''),
            username: resolvePartnerUsername(updatedProfile, prev?.username || '')
          };
          if (user?.uid) {
            try {
              localStorage.setItem(`wibby-partner-${user.uid}`, JSON.stringify(merged));
            } catch { }
          }
          return merged;
        });
      }
    };

    socket.on('presence:update', handlePresence);
    socket.on('together:started', handleTogetherStarted);
    socket.on('together:state', handleTogetherState);
    socket.on('together:ended', handleTogetherEnded);
    socket.on('user:profile_updated', handlePartnerProfileUpdated);
    socket.on('unpair', handleUnpair);
    socket.on('session:conflict', handleSessionConflict);
    socket.on('session:force_logout', handleForceLogout);
    socket.on('new_message', handleNewMessage);

    return () => {
      socket.off('presence:update', handlePresence);
      socket.off('together:started', handleTogetherStarted);
      socket.off('together:state', handleTogetherState);
      socket.off('together:ended', handleTogetherEnded);
      socket.off('user:profile_updated', handlePartnerProfileUpdated);
      socket.off('unpair', handleUnpair);
      socket.off('session:conflict', handleSessionConflict);
      socket.off('session:force_logout', handleForceLogout);
      socket.off('new_message', handleNewMessage);
    };
  }, [socket, conversationId, signOut, user, partner, isCallActive]);

  // Window focus & visibility reset for unread notifications & presence sync
  useEffect(() => {
    const handleFocus = () => {
      notificationService.resetUnread();
      if (socket?.connected) {
        socket.emit('presence:request');
      }
    };
    const handleVisibility = () => {
      if (document.visibilityState === 'visible') {
        notificationService.resetUnread();
        if (socket?.connected) {
          socket.emit('presence:request');
        }
      }
    };

    window.addEventListener('focus', handleFocus);
    document.addEventListener('visibilitychange', handleVisibility);
    return () => {
      window.removeEventListener('focus', handleFocus);
      document.removeEventListener('visibilitychange', handleVisibility);
    };
  }, [socket]);

  // Synchronize presence on socket connect and periodically every 20 seconds
  useEffect(() => {
    if (!socket) return;
    const requestPresence = () => {
      if (socket.connected) {
        socket.emit('presence:request');
      }
    };

    if (socket.connected) {
      requestPresence();
    }
    socket.on('connect', requestPresence);

    const interval = setInterval(requestPresence, 20000);

    return () => {
      socket.off('connect', requestPresence);
      clearInterval(interval);
    };
  }, [socket, isPaired]);

  const partnerName = resolvePartnerName(partner);

  const handleUnpairAction = () => {
    setIsPaired(false);
    setPartner(null);
    setConversationId(null);
    setShowInfoDrawer(false);
    setShowTogether(false);
    setChatThemePreset('classic');
    localStorage.setItem('wibby-chat-theme', 'classic');
    if (user?.uid) {
      localStorage.setItem(`wibby-chat-theme-${user.uid}`, 'classic');
    }
  };

  const handleContinueHere = () => {
    if (socket) {
      socket.emit('session:claim');
    }
    setShowSessionConflict(false);
  };

  const handleLogoutFromConflict = async () => {
    setShowSessionConflict(false);
    try {
      await signOut();
    } catch (err) {
      console.error('Logout error:', err);
    }
  };

  const handleSelectThemePreset = useCallback((preset: ChatThemePreset) => {
    setChatThemePreset(preset);
    localStorage.setItem('wibby-chat-theme', preset);
    if (user?.uid) {
      localStorage.setItem(`wibby-chat-theme-${user.uid}`, preset);
      (async () => {
        try {
          const token = await user.getIdToken();
          const apiUrl = import.meta.env.VITE_API_URL || 'http://localhost:3000';
          fetch(`${apiUrl}/api/users/preferences`, {
            method: 'PATCH',
            headers: {
              'Content-Type': 'application/json',
              Authorization: `Bearer ${token}`
            },
            body: JSON.stringify({ themeFamily: preset })
          }).catch(() => {});
        } catch {}
      })();
    }
  }, [user]);

  const [chatClearCount, setChatClearCount] = useState(0);

  const handleClearChat = async (mode: 'everything' | 'messages_only' = 'messages_only') => {
    if (!conversationId || !user) return;
    try {
      const token = await user.getIdToken();
      const apiUrl = import.meta.env.VITE_API_URL || 'http://localhost:3000';
      await fetch(`${apiUrl}/api/conversations/${conversationId}/messages/clear`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({
          clearMode: mode,
          clearMediaAndStarred: mode === 'everything'
        })
      });
      setChatClearCount(prev => prev + 1);
    } catch (err) {
      console.error('Clear chat error:', err);
    }
  };

  const handleOpenTogether = useCallback(() => {
    setShowTogether(prev => !prev);
  }, []);

  if (isPaired === null) {
    return <LoadingScreen />
  }

  return (
    <div className="app-layout">
      <Sidebar
        isOpen={sidebarOpen}
        onClose={() => setSidebarOpen(false)}
        isPaired={isPaired}
        partner={partner}
        theme={theme}
        onToggleTheme={toggleTheme}
        onOpenSettings={() => {
          setSidebarOpen(false);
          setShowSettingsModal(true);
        }}
        onOpenSearch={() => {
          setSidebarOpen(false);
          if (isPaired && conversationId) setShowSearchModal(true);
        }}
        onOpenMedia={() => {
          setSidebarOpen(false);
          if (isPaired && conversationId) setShowMediaGallery(true);
        }}
      />

      <main className={`chat-panel chat-theme-${chatThemePreset}`}>
        {isPaired && conversationId ? (
          <>
            <ChatHeader
              onMenuClick={() => setSidebarOpen(true)}
              partner={partner}
              conversationId={conversationId}
              onOpenSearch={() => setShowSearchModal(true)}
              onOpenInfoDrawer={() => setShowInfoDrawer(true)}
              onOpenMedia={() => setShowMediaGallery(true)}
              onOpenTogether={handleOpenTogether}
              isTogetherOpen={showTogether}
              onOpenGame={() => setShowGameModal(true)}
              onClearChat={handleClearChat}
            />
            {showTogether && (
              <TogetherPlayer
                conversationId={conversationId}
                partnerName={partnerName}
                onClose={() => setShowTogether(false)}
              />
            )}
            <MessageArea
              key={`${conversationId}_${chatClearCount}`}
              conversationId={conversationId}
              partner={partner}
              onOpenGame={() => setShowGameModal(true)}
              jumpTarget={jumpTarget}
            />
          </>
        ) : (
          <PairingScreen onPaired={() => checkStatus()} onMenuClick={() => setSidebarOpen(true)} />
        )}
      </main>

      {/* Slide-out Chat Info Drawer */}
      {isPaired && conversationId && showInfoDrawer && (
        <Suspense fallback={null}>
          <ChatInfoDrawer
            isOpen={showInfoDrawer}
            onClose={() => setShowInfoDrawer(false)}
            partner={partner}
            conversationId={conversationId}
            onStartVoiceCall={() => {
              setShowInfoDrawer(false);
              startCall(conversationId, partner, 'voice');
            }}
            onStartVideoCall={() => {
              setShowInfoDrawer(false);
              startCall(conversationId, partner, 'video');
            }}
            onStartTogether={() => {
              setShowInfoDrawer(false);
              handleOpenTogether();
            }}
            onOpenSearch={() => {
              setShowInfoDrawer(false);
              setShowSearchModal(true);
            }}
            onJumpToMessage={handleJumpToMessage}
            onUnpair={handleUnpairAction}
            currentThemePreset={chatThemePreset}
            onSelectThemePreset={handleSelectThemePreset}
            onOpenMediaGallery={() => {
              setShowInfoDrawer(false);
              setShowMediaGallery(true);
            }}
          />
        </Suspense>
      )}

      {/* Chat Search Modal */}
      {isPaired && conversationId && showSearchModal && (
        <Suspense fallback={null}>
          <ChatSearchModal
            isOpen={showSearchModal}
            conversationId={conversationId}
            onClose={() => setShowSearchModal(false)}
            onSelectMessage={handleJumpToMessage}
          />
        </Suspense>
      )}

      {/* Global Settings & Profile Modal */}
      {showSettingsModal && (
        <Suspense fallback={null}>
          <SettingsModal
            isOpen={showSettingsModal}
            onClose={() => setShowSettingsModal(false)}
            theme={theme}
            onToggleTheme={toggleTheme}
            currentThemePreset={chatThemePreset}
            onSelectThemePreset={handleSelectThemePreset}
            conversationId={conversationId || undefined}
            onOpenMediaGallery={() => {
              setShowSettingsModal(false);
              setShowMediaGallery(true);
            }}
          />
        </Suspense>
      )}

      {/* Single Active Browser Session Conflict Dialog */}
      {showSessionConflict && (
        <div className="session-conflict-overlay" role="dialog" aria-modal="true">
          <div className="session-conflict-card">
            <div className="session-conflict-icon">📱💻</div>
            <h3 className="session-conflict-title">Active in Another Browser</h3>
            <p className="session-conflict-desc">
              Wibby was opened or signed in from another browser or window. Only one active browser session is permitted at a time.
            </p>
            <div className="session-conflict-actions">
              <button
                type="button"
                className="session-conflict-btn-logout"
                onClick={handleLogoutFromConflict}
              >
                Log Out
              </button>
              <button
                type="button"
                className="session-conflict-btn-continue"
                onClick={handleContinueHere}
              >
                Continue Here
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Mini Games Modal (Req 21) */}
      {isPaired && conversationId && showGameModal && (
        <Suspense fallback={null}>
          <MiniGameModal
            isOpen={showGameModal}
            onClose={() => setShowGameModal(false)}
            conversationId={conversationId}
            socket={socket}
            currentUserId={user?.uid || ''}
            partnerName={partnerName}
          />
        </Suspense>
      )}

      {/* Shared Media & Storage Modal (Req 3-9) */}
      {isPaired && conversationId && showMediaGallery && (
        <Suspense fallback={null}>
          <MediaGalleryModal
            isOpen={showMediaGallery}
            onClose={() => setShowMediaGallery(false)}
            conversationId={conversationId}
            partnerName={partnerName}
            partnerUid={partner?.firebaseUid}
          />
        </Suspense>
      )}

      <CallModals partner={partner} />
    </div>
  )
}

export default function App() {
  const { user, loading, isPasswordRecovery } = useAuth()

  if (loading) {
    return <LoadingScreen />
  }

  if (!user || isPasswordRecovery) {
    return <AuthPage />
  }

  return (
    <SocketProvider>
      <CallProvider>
        <WibbyAppWrapper />
      </CallProvider>
    </SocketProvider>
  )
}


