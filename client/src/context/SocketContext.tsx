import React, { createContext, useContext, useEffect, useState, useRef } from 'react';
import { io, Socket } from 'socket.io-client';
import { useAuth } from './AuthContext';

interface SocketContextType {
  socket: Socket | null;
  isConnected: boolean;
}

const SocketContext = createContext<SocketContextType>({ socket: null, isConnected: false });

export function useSocket() {
  return useContext(SocketContext);
}

export function SocketProvider({ children }: { children: React.ReactNode }) {
  const { user } = useAuth();
  const [socket, setSocket] = useState<Socket | null>(null);
  const [isConnected, setIsConnected] = useState(false);
  const socketRef = useRef<Socket | null>(null);

  useEffect(() => {
    if (!user) {
      if (socketRef.current) {
        socketRef.current.disconnect();
        socketRef.current = null;
        setSocket(null);
        setIsConnected(false);
      }
      return;
    }

    let isMounted = true;

    const initSocket = async () => {
      try {
        const token = await user.getIdToken();
        if (!isMounted) return;

        const newSocket = io(import.meta.env.VITE_API_URL || 'http://localhost:3000', {
          auth: { token },
          reconnection: true,
          reconnectionDelay: 1000,
          reconnectionDelayMax: 5000,
          reconnectionAttempts: Infinity
        });

        newSocket.on('connect', () => {
          if (isMounted) setIsConnected(true);
        });

        newSocket.on('disconnect', () => {
          if (isMounted) setIsConnected(false);
        });

        newSocket.on('connect_error', async (err) => {
          if (isMounted) setIsConnected(false);
          // If token expired or rejected, refresh and retry
          if (err.message.includes('Authentication error') || err.message.includes('Token') || err.message.includes('token')) {
            try {
              const freshToken = await user.getIdToken(true);
              newSocket.auth = { token: freshToken };
              newSocket.connect();
            } catch (authErr) {
              console.error('Socket token refresh error:', authErr);
            }
          }
        });

        socketRef.current = newSocket;
        if (isMounted) setSocket(newSocket);
      } catch (error) {
        console.error('Socket initialization error:', error);
      }
    };

    initSocket();

    return () => {
      isMounted = false;
      if (socketRef.current) {
        socketRef.current.disconnect();
        socketRef.current = null;
      }
    };
  }, [user]);

  return (
    <SocketContext.Provider value={{ socket, isConnected }}>
      {children}
    </SocketContext.Provider>
  );
}
