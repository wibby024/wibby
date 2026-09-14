import { useState, type FormEvent } from 'react'
import { signInWithEmailAndPassword } from 'firebase/auth'
import { auth } from '../../lib/firebase'
import './AuthForm.css'

interface LoginFormProps {
  onRegister: () => void
  onForgotPassword: () => void
}

export default function LoginForm({
  onRegister,
  onForgotPassword,
}: LoginFormProps) {
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault()

    setError('')
    setLoading(true)

    try {
      const response = await fetch((import.meta.env.VITE_API_URL || 'http://localhost:3000') + '/api/users/resolve-username', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ username: username.trim().toLowerCase() })
      })

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}))
        throw new Error(errorData.error || 'Invalid username or password')
      }

      const { email } = await response.json()
      await signInWithEmailAndPassword(auth, email, password)
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
        <label>
          Username
          <input
            type="text"
            placeholder="@username"
            value={username}
            onChange={(event) => setUsername(event.target.value.replace(/\s/g, ''))}
            autoComplete="username"
            required
          />
        </label>

        <label>
          Password
          <input
            type="password"
            placeholder="Enter your password"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            autoComplete="current-password"
            required
          />
        </label>

        {error && <div className="auth-error">{error}</div>}

        <button className="auth-primary-button" disabled={loading}>
          {loading ? 'Signing in…' : 'Sign in'}
        </button>
      </form>

      <button className="auth-link-button" onClick={onForgotPassword}>
        Forgot password?
      </button>

      <div className="auth-divider">
        <span>or</span>
      </div>

      <p className="auth-switch">
        Don't have an account?{' '}
        <button onClick={onRegister}>Create one</button>
      </p>
    </div>
  )
}
