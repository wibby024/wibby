import { useState, type FormEvent } from 'react'
import { createUserWithEmailAndPassword, sendEmailVerification } from 'firebase/auth'
import { auth } from '../../lib/firebase'
import './AuthForm.css'

interface RegisterFormProps {
  onLogin: () => void
}

export default function RegisterForm({ onLogin }: RegisterFormProps) {
  const [displayName, setDisplayName] = useState('')
  const [username, setUsername] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')

  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')
  const [loading, setLoading] = useState(false)

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault()

    setError('')
    setSuccess('')

    if (password.length < 8) {
      setError('Password must contain at least 8 characters.')
      return
    }

    if (password !== confirmPassword) {
      setError('Passwords do not match.')
      return
    }

    setLoading(true)

    try {
      const userCredential = await createUserWithEmailAndPassword(auth, email.trim(), password)
      const idToken = await userCredential.user.getIdToken()
      
      const response = await fetch(import.meta.env.VITE_API_URL + '/api/users/profile', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${idToken}`
        },
        body: JSON.stringify({
          username: username.trim().toLowerCase(),
          email: email.trim(),
          displayName: displayName.trim()
        })
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Failed to create profile');
      }

      await sendEmailVerification(userCredential.user)
      setSuccess('Account created. Check your email to verify your Wibby account.')
    } catch (err: any) {
      setError(err.message || 'Failed to sign up')
    }

    setLoading(false)
  }

  return (
    <div>
      <div className="auth-heading">
        <h1>Create your Wibby</h1>
        <p>Your private space starts here.</p>
      </div>

      <form className="auth-form" onSubmit={handleSubmit}>
        <label>
          Display name
          <input
            type="text"
            placeholder="Your name"
            value={displayName}
            onChange={(event) => setDisplayName(event.target.value)}
            autoComplete="name"
            maxLength={60}
            required
          />
        </label>

        <label>
          Username
          <input
            type="text"
            placeholder="@username"
            value={username}
            onChange={(event) =>
              setUsername(event.target.value.replace(/\s/g, ''))
            }
            autoComplete="username"
            maxLength={30}
            required
          />
        </label>

        <label>
          Email
          <input
            type="email"
            placeholder="you@example.com"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            autoComplete="email"
            required
          />
        </label>

        <label>
          Password
          <input
            type="password"
            placeholder="At least 8 characters"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            autoComplete="new-password"
            required
          />
        </label>

        <label>
          Confirm password
          <input
            type="password"
            placeholder="Repeat your password"
            value={confirmPassword}
            onChange={(event) => setConfirmPassword(event.target.value)}
            autoComplete="new-password"
            required
          />
        </label>

        {error && <div className="auth-error">{error}</div>}

        {success && <div className="auth-success">{success}</div>}

        <button className="auth-primary-button" disabled={loading}>
          {loading ? 'Creating account…' : 'Create account'}
        </button>
      </form>

      <p className="auth-switch">
        Already have an account?{' '}
        <button onClick={onLogin}>Sign in</button>
      </p>
    </div>
  )
}
