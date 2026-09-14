import { useState, type FormEvent } from 'react'
import { sendPasswordResetEmail } from 'firebase/auth'
import { auth } from '../../lib/firebase'
import './AuthForm.css'

interface ForgotPasswordFormProps {
  onLogin: () => void
}

export default function ForgotPasswordForm({ onLogin }: ForgotPasswordFormProps) {
  const [username, setUsername] = useState('')
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')
  const [loading, setLoading] = useState(false)

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault()

    setError('')
    setSuccess('')
    setLoading(true)

    try {
      // 1. Resolve username to email
      const response = await fetch((import.meta.env.VITE_API_URL || 'http://localhost:3000') + '/api/users/resolve-username', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ username: username.trim().toLowerCase() })
      })

      if (!response.ok) {
        // Return a generic error even if the user doesn't exist, to match security practices,
        // but since we want them to know we sent the email, maybe we still say it?
        // Wait, the prompt says: "Do not expose the email unnecessarily in the UI."
        // We will just say "Password reset link sent! Check your inbox" even if it failed,
        // or we can just say "If a matching account was found, a password reset email was sent."
        // But for better UX let's see. Let's just throw if it's an error.
        const errorData = await response.json().catch(() => ({}))
        throw new Error(errorData.error || 'Failed to send reset link')
      }

      const { email } = await response.json()

      // 2. Send password reset email via Firebase
      await sendPasswordResetEmail(auth, email, {
        url: `${window.location.origin}/`,
      })
      setSuccess('Password reset link sent! Check your inbox to set a new password.')
    } catch (err: any) {
      if (err.message === 'Invalid username or password') {
        // To prevent username enumeration, we could pretend it succeeded.
        // But let's just use the error returned by the server.
        setError('If the username exists, a reset link has been sent.')
      } else {
        setError(err.message || 'Failed to send reset link')
      }
    }

    setLoading(false)
  }

  return (
    <div>
      <div className="auth-heading">
        <h1>Reset password</h1>
        <p>Enter your username to receive a password reset link.</p>
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

        {error && <div className="auth-error">{error}</div>}
        {success && <div className="auth-success">{success}</div>}

        <button className="auth-primary-button" disabled={loading}>
          {loading ? 'Sending link…' : 'Send reset link'}
        </button>
      </form>

      <p className="auth-switch" style={{ marginTop: '20px' }}>
        Remembered your password?{' '}
        <button onClick={onLogin}>Sign in</button>
      </p>
    </div>
  )
}
