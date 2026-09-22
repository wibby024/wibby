import {
  createContext,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from 'react'
import { onAuthStateChanged, signOut as firebaseSignOut, type User } from 'firebase/auth'
import { auth } from '../lib/firebase'
import { isGenericPlaceholder, capitalize } from '../utils/partnerName'

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
  const [profile, setProfile] = useState<UserProfile | null>(() => {
    try {
      const saved = localStorage.getItem('wibby_user_profile')
      if (saved) {
        const parsed = JSON.parse(saved);
        if (parsed) {
          const rawName = parsed.displayName || parsed.display_name;
          const isBadName = isGenericPlaceholder(rawName);
          const cleanUser = parsed.username && !isGenericPlaceholder(parsed.username) ? capitalize(parsed.username.replace(/^@+/, '')) : '';
          return {
            ...parsed,
            displayName: isBadName
              ? (cleanUser || 'User')
              : rawName
          };
        }
      }
      return null
    } catch {
      return null
    }
  })
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
        const rawFetchedName = data.displayName || data.display_name;
        const cleanEmail = firebaseUser.email ? capitalize(firebaseUser.email.split('@')[0]) : '';
        const cleanFirebaseName = firebaseUser.displayName && !isGenericPlaceholder(firebaseUser.displayName) ? firebaseUser.displayName : '';
        const cleanUsername = data.username && !isGenericPlaceholder(data.username) ? capitalize(data.username.replace(/^@+/, '')) : '';

        const resolvedDisplayName = !isGenericPlaceholder(rawFetchedName)
          ? rawFetchedName
          : (cleanFirebaseName || cleanUsername || cleanEmail || 'User');

        const resolvedUsername = data.username && !isGenericPlaceholder(data.username)
          ? data.username.replace(/^@+/, '')
          : (firebaseUser.displayName?.toLowerCase().replace(/\s+/g, '_') || (firebaseUser.email ? firebaseUser.email.split('@')[0] : 'user'));

        const normalizedProfile: UserProfile = {
          ...data,
          displayName: resolvedDisplayName,
          username: resolvedUsername,
          avatarUrl: data.avatarUrl || firebaseUser.photoURL || null,
          bio: data.bio || ''
        }
        setProfile(normalizedProfile)
        try {
          localStorage.setItem('wibby_user_profile', JSON.stringify(normalizedProfile))
        } catch {}
      }
    } catch (err) {
      console.error('Failed to fetch profile', err)
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

    const unsubscribe = onAuthStateChanged(auth, (firebaseUser) => {
      setUser(firebaseUser)
      setLoading(false)
      if (firebaseUser) {
        fetchProfile(firebaseUser)
      } else {
        setProfile(null)
        try {
          localStorage.removeItem('wibby_user_profile')
        } catch {}
      }
    })

    return () => unsubscribe()
  }, [])

  const signOut = async () => {
    try {
      localStorage.removeItem('wibby_user_profile')
      if (user?.uid) {
        localStorage.removeItem(`wibby-paired-${user.uid}`)
        localStorage.removeItem(`wibby-partner-${user.uid}`)
        localStorage.removeItem(`wibby-conv-${user.uid}`)
      }
    } catch {}
    setProfile(null)
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
