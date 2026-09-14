import { useState, type FormEvent } from 'react'
import { confirmPasswordReset } from 'firebase/auth'
import { auth } from '../../lib/firebase'
import './AuthForm.css'

interface ResetPasswordFormProps {
  onComplete: () => void
}

export default function ResetPasswordForm({ onComplete }: ResetPasswordFormProps) {
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
      const urlParams = new URLSearchParams(window.location.search)
      const oobCode = urlParams.get('oobCode')
      
      if (!oobCode) {
        throw new Error('Invalid or missing reset code. Please request a new password reset link.')
      }

      await confirmPasswordReset(auth, oobCode, password)
      setSuccess('Your password has been updated successfully!')
      setTimeout(() => {
        onComplete()
      }, 1500)
    } catch (err: any) {
      setError(err.message || 'Failed to update password')
    }

    setLoading(false)
  }

  return (
    <div>
      <div className="auth-heading">
        <h1>Set new password</h1>
        <p>Choose a new password for your Wibby account.</p>
      </div>

      <form className="auth-form" onSubmit={handleSubmit}>
        <label>
          New password
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
          Confirm new password
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
          {loading ? 'Updating password…' : 'Update password'}
        </button>
      </form>
    </div>
  )
}
