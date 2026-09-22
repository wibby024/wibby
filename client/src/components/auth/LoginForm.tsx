import { useState, type FormEvent } from 'react'
import { signInWithEmailAndPassword } from 'firebase/auth'
import { auth } from '../../lib/firebase'
import './AuthForm.css'

interface LoginFormProps {
  onRegister: () => void
  onForgotPassword: () => void
}

export default function LoginForm({ onRegister, onForgotPassword }: LoginFormProps) {
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [showPw, setShowPw] = useState(false)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault()
    setError('')
    setLoading(true)

    try {
      const trimmed = username.trim()
      let emailToUse = trimmed

      // If user typed an email address directly, bypass resolve-username HTTP request entirely
      const isEmail = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmed)

      if (!isEmail) {
        const cleanUsername = trimmed.replace(/^@+/, '').toLowerCase()
        const response = await fetch(
          (import.meta.env.VITE_API_URL || 'http://localhost:3000') + '/api/users/resolve-username',
          {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ username: cleanUsername }),
          }
        )

        if (!response.ok) {
          const errorData = await response.json().catch(() => ({}))
          throw new Error(errorData.error || 'Invalid username or password')
        }

        const { email } = await response.json()
        emailToUse = email
      }

      await signInWithEmailAndPassword(auth, emailToUse, password)
    } catch (err: any) {
      setError(err.message || 'Failed to sign in')
    }

    setLoading(false)
  }

  return (
    <div>
      <div className="auth-heading">
        <h1>Welcome back</h1>
        <p>Sign in to continue to your private space.</p>
      </div>

      <form className="auth-form" onSubmit={handleSubmit}>
        {/* Username */}
        <label>
          Username
          <div className="auth-input-wrap">
            <span className="auth-input-icon">
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
                <circle cx="12" cy="7" r="4" />
              </svg>
            </span>
            <input
              type="text"
              placeholder="@username"
              value={username}
              onChange={(e) => setUsername(e.target.value.replace(/\s/g, ''))}
              autoComplete="username"
              autoCapitalize="none"
              autoCorrect="off"
              spellCheck={false}
              required
            />
          </div>
        </label>

        {/* Password */}
        <label>
          Password
          <div className="auth-input-wrap">
            <span className="auth-input-icon">
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
                <path d="M7 11V7a5 5 0 0 1 10 0v4" />
              </svg>
            </span>
            <input
              type={showPw ? 'text' : 'password'}
              className="has-trailing-btn"
              placeholder="Enter your password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoComplete="current-password"
              required
            />
            <span className="auth-input-end">
              <button
                type="button"
                className="auth-eye-btn"
                onClick={() => setShowPw(v => !v)}
                aria-label={showPw ? 'Hide password' : 'Show password'}
                tabIndex={-1}
              >
                {showPw ? (
                  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24" />
                    <line x1="1" y1="1" x2="23" y2="23" />
                  </svg>
                ) : (
                  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
                    <circle cx="12" cy="12" r="3" />
                  </svg>
                )}
              </button>
            </span>
          </div>
        </label>

        {error && <div className="auth-error" role="alert">{error}</div>}

        <button className="auth-primary-button" disabled={loading}>
          {loading ? (
            <>
              <span className="auth-btn-spinner" aria-hidden="true" />
              Signing in…
            </>
          ) : (
            'Sign in'
          )}
        </button>
      </form>

      <button className="auth-link-button" onClick={onForgotPassword}>
        Forgot password?
      </button>

      <div className="auth-divider"><span>or</span></div>

      <p className="auth-switch">
        Don't have an account?{' '}
        <button onClick={onRegister}>Create one</button>
      </p>
    </div>
  )
}
