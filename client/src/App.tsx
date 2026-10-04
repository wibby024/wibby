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
import './App.css'

// Lazy-load non-critical heavy overlays and the 10 games engine to keep initial bundle lean
const TogetherPlayer = lazy(() => import('./components/together/TogetherPlayer'));
const ChatInfoDrawer = lazy(() => import('./components/ChatInfoDrawer'));
const ChatSearchModal = lazy(() => import('./components/ChatSearchModal'));
const SettingsModal = lazy(() => import('./components/SettingsModal'));
const MiniGameModal = lazy(() => import('./components/games/MiniGameModal'));

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
  const { startCall } = useCall();

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

  // Initialize notification and ringtone service
  useEffect(() => {
    if (user) {
      notificationService.init();
      ringtoneService.setUserId(user.uid);
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
    socket.on('user:profile_updated', handlePartnerProfileUpdated);
    socket.on('unpair', handleUnpair);
    socket.on('session:conflict', handleSessionConflict);
    socket.on('session:force_logout', handleForceLogout);
    socket.on('new_message', handleNewMessage);

    return () => {
      socket.off('presence:update', handlePresence);
      socket.off('together:started', handleTogetherStarted);
      socket.off('user:profile_updated', handlePartnerProfileUpdated);
      socket.off('unpair', handleUnpair);
      socket.off('session:conflict', handleSessionConflict);
      socket.off('session:force_logout', handleForceLogout);
      socket.off('new_message', handleNewMessage);
    };
  }, [socket, conversationId, signOut, user, partner]);

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
    }
  }, [user?.uid]);

  const [chatClearCount, setChatClearCount] = useState(0);

  const handleClearChat = async (clearMediaAndStarred: boolean = false) => {
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
        body: JSON.stringify({ clearMediaAndStarred })
      });
      setChatClearCount(prev => prev + 1);
    } catch (err) {
      console.error('Clear chat error:', err);
    }
  };

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
              onOpenTogether={() => setShowTogether(prev => !prev)}
              onOpenGame={() => setShowGameModal(true)}
              onClearChat={handleClearChat}
            />
            {showTogether && (
              <Suspense fallback={null}>
                <TogetherPlayer
                  conversationId={conversationId}
                  partnerName={partnerName}
                  onClose={() => setShowTogether(false)}
                />
              </Suspense>
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
              setShowTogether(true);
            }}
            onOpenSearch={() => {
              setShowInfoDrawer(false);
              setShowSearchModal(true);
            }}
            onJumpToMessage={handleJumpToMessage}
            onUnpair={handleUnpairAction}
            currentThemePreset={chatThemePreset}
            onSelectThemePreset={handleSelectThemePreset}
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

      <CallModals />
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


