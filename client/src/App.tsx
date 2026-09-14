import { useState, useEffect, useCallback } from 'react'
import { useAuth } from './context/AuthContext'
import { useSocket, SocketProvider } from './context/SocketContext'
import { CallProvider, useCall } from './context/CallContext'
import CallModals from './components/call/CallModals'
import AuthPage from './pages/AuthPage'
import Sidebar from './components/Sidebar'
import ChatHeader from './components/ChatHeader'
import MessageArea from './components/MessageArea'
import PairingScreen from './components/PairingScreen'
import StoriesBar from './components/stories/StoriesBar'
import TogetherPlayer from './components/together/TogetherPlayer'
import ChatInfoDrawer from './components/ChatInfoDrawer'
import ChatSearchModal from './components/ChatSearchModal'
import SettingsModal from './components/SettingsModal'
import { notificationService } from './services/notificationService'
import type { ChatThemePreset } from './types/chat'
import './App.css'

function LoadingScreen() {
  return (
    <main className="app-loading">
      <div className="app-loading-mark">W</div>
      <p>Loading Wibby…</p>
    </main>
  )
}

function WibbyAppWrapper() {
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const [isPaired, setIsPaired] = useState<boolean | null>(null)
  const [partner, setPartner] = useState<any>(null)
  const [conversationId, setConversationId] = useState<string | null>(null)
  
  // Modals and Drawer state
  const [showSearchModal, setShowSearchModal] = useState(false)
  const [showInfoDrawer, setShowInfoDrawer] = useState(false)
  const [showSettingsModal, setShowSettingsModal] = useState(false)
  const [showTogether, setShowTogether] = useState(false)
  const [showSessionConflict, setShowSessionConflict] = useState(false)
  const [chatThemePreset, setChatThemePreset] = useState<ChatThemePreset>(() => {
    const saved = localStorage.getItem('wibby-chat-theme') as ChatThemePreset;
    return saved || 'classic-purple';
  })

  const { user, signOut } = useAuth()
  const { socket } = useSocket()
  const { startCall } = useCall()

  const [theme, setTheme] = useState<'light' | 'dark'>(() => {
    const saved = localStorage.getItem('wibby-theme');
    if (saved === 'light' || saved === 'dark') return saved;
    return 'dark'; // Default to dark as requested
  });

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme);
    localStorage.setItem('wibby-theme', theme);
  }, [theme]);

  useEffect(() => {
    document.documentElement.setAttribute('data-chat-theme', chatThemePreset);
    localStorage.setItem('wibby-chat-theme', chatThemePreset);
  }, [chatThemePreset]);

  // Initialize notification service
  useEffect(() => {
    if (user) {
      notificationService.init();
      notificationService.requestPermission();
    }
  }, [user]);

  const toggleTheme = () => {
    setTheme(prev => prev === 'dark' ? 'light' : 'dark');
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
      if (data.paired && data.partner) {
        setPartner(data.partner);
        setConversationId(data.conversationId);
      } else {
        setConversationId(null);
      }
    } catch (err) {
      console.error(err);
      setIsPaired(false);
      setConversationId(null);
    }
  }, [user]);

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
        if (prev && prev.firebaseUid === data.uid) {
          return { ...prev, online: data.online, lastSeen: data.lastSeen };
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

    socket.on('presence:update', handlePresence);
    socket.on('together:started', handleTogetherStarted);
    socket.on('unpair', handleUnpair);
    socket.on('session:conflict', handleSessionConflict);
    socket.on('session:force_logout', handleForceLogout);

    return () => {
      socket.off('presence:update', handlePresence);
      socket.off('together:started', handleTogetherStarted);
      socket.off('unpair', handleUnpair);
      socket.off('session:conflict', handleSessionConflict);
      socket.off('session:force_logout', handleForceLogout);
    };
  }, [socket, conversationId, signOut]);

  const partnerName = partner?.display_name || partner?.username || 'Partner';

  const handleUnpairAction = () => {
    setIsPaired(false);
    setPartner(null);
    setConversationId(null);
    setShowInfoDrawer(false);
    setShowTogether(false);
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

  const [chatClearCount, setChatClearCount] = useState(0);

  const handleClearChat = async () => {
    if (!conversationId || !user) return;
    try {
      const token = await user.getIdToken();
      const apiUrl = import.meta.env.VITE_API_URL || 'http://localhost:3000';
      const res = await fetch(`${apiUrl}/api/conversations/${conversationId}/messages/clear`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`
        }
      });
      if (!res.ok) {
        await fetch(`${apiUrl}/api/conversations/${conversationId}/clear`, {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${token}`
          }
        });
      }
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
              onClearChat={handleClearChat}
            />
            <StoriesBar 
              conversationId={conversationId} 
              partnerName={partnerName} 
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
            />
          </>
        ) : (
          <PairingScreen onPaired={() => checkStatus()} />
        )}
      </main>

      {/* Slide-out Chat Info Drawer */}
      {isPaired && conversationId && showInfoDrawer && (
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
          onJumpToMessage={(msgId) => {
            setShowInfoDrawer(false);
            const el = document.querySelector(`[data-message-id="${msgId}"]`) as HTMLDivElement | null;
            if (el) el.scrollIntoView({ behavior: 'smooth', block: 'center' });
          }}
          onUnpair={handleUnpairAction}
          currentThemePreset={chatThemePreset}
          onSelectThemePreset={(preset) => setChatThemePreset(preset)}
        />
      )}

      {/* Chat Search Modal */}
      {isPaired && conversationId && showSearchModal && (
        <ChatSearchModal
          isOpen={showSearchModal}
          conversationId={conversationId}
          onClose={() => setShowSearchModal(false)}
          onSelectMessage={(msgId) => {
            setShowSearchModal(false);
            const el = document.querySelector(`[data-message-id="${msgId}"]`) as HTMLDivElement | null;
            if (el) el.scrollIntoView({ behavior: 'smooth', block: 'center' });
          }}
        />
      )}

      {/* Global Settings & Profile Modal */}
      {showSettingsModal && (
        <SettingsModal
          isOpen={showSettingsModal}
          onClose={() => setShowSettingsModal(false)}
          theme={theme}
          onToggleTheme={toggleTheme}
        />
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


