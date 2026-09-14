import {
  createContext,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from 'react'
import { onAuthStateChanged, signOut as firebaseSignOut, type User } from 'firebase/auth'
import { auth } from '../lib/firebase'

export interface UserProfile {
  username: string;
  displayName: string;
  avatarUrl: string | null;
  bio: string;
}

interface AuthContextValue {
  user: User | null
  profile: UserProfile | null
  loading: boolean
  isPasswordRecovery: boolean
  clearPasswordRecovery: () => void
  signOut: () => Promise<void>
  refreshProfile: () => Promise<void>
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined)

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null)
  const [profile, setProfile] = useState<UserProfile | null>(null)
  const [loading, setLoading] = useState(true)
  const [isPasswordRecovery, setIsPasswordRecovery] = useState(false)

  const fetchProfile = async (firebaseUser: User) => {
    try {
      const token = await firebaseUser.getIdToken()
      const response = await fetch((import.meta.env.VITE_API_URL || 'http://localhost:3000') + '/api/users/profile', {
        headers: {
          'Authorization': `Bearer ${token}`
        }
      })
      if (response.ok) {
        const data = await response.json()
        setProfile(data)
      } else {
        setProfile(null)
      }
    } catch (err) {
      console.error('Failed to fetch profile', err)
      setProfile(null)
    }
  }

  const refreshProfile = async () => {
    if (user) {
      await fetchProfile(user)
    }
  }

  useEffect(() => {
    const params = new URLSearchParams(window.location.search)
    if (params.get('mode') === 'resetPassword') {
      setIsPasswordRecovery(true)
    }

    const unsubscribe = onAuthStateChanged(auth, async (firebaseUser) => {
      setUser(firebaseUser)
      if (firebaseUser) {
        await fetchProfile(firebaseUser)
      } else {
        setProfile(null)
      }
      setLoading(false)
    })

    return () => unsubscribe()
  }, [])

  const signOut = async () => {
    await firebaseSignOut(auth)
  }

  const clearPasswordRecovery = () => {
    setIsPasswordRecovery(false)
    const url = new URL(window.location.href)
    url.searchParams.delete('mode')
    url.searchParams.delete('oobCode')
    url.searchParams.delete('apiKey')
    history.replaceState(null, '', url.pathname + url.search)
  }

  return (
    <AuthContext.Provider
      value={{
        user,
        profile,
        loading,
        isPasswordRecovery,
        clearPasswordRecovery,
        signOut,
        refreshProfile
      }}
    >
      {children}
    </AuthContext.Provider>
  )
}


export function useAuth() {
  const context = useContext(AuthContext)

  if (!context) {
    throw new Error('useAuth must be used inside AuthProvider')
  }

  return context
}
