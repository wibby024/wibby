import { useState, useEffect } from 'react'
import { useAuth } from '../context/AuthContext'
import AuthLayout from '../components/auth/AuthLayout'
import LoginForm from '../components/auth/LoginForm'
import RegisterForm from '../components/auth/RegisterForm'
import ForgotPasswordForm from '../components/auth/ForgotPasswordForm'
import ResetPasswordForm from '../components/auth/ResetPasswordForm'

type AuthMode = 'login' | 'register' | 'forgot_password' | 'reset_password'

export default function AuthPage() {
  const { isPasswordRecovery, clearPasswordRecovery } = useAuth()
  const [mode, setMode] = useState<AuthMode>('login')

  useEffect(() => {
    if (isPasswordRecovery) {
      setMode('reset_password')
    }
  }, [isPasswordRecovery])

  const handleResetComplete = () => {
    clearPasswordRecovery()
    setMode('login')
  }

  return (
    <AuthLayout>
      {mode === 'reset_password' && (
        <ResetPasswordForm onComplete={handleResetComplete} />
      )}
      {mode === 'forgot_password' && (
        <ForgotPasswordForm onLogin={() => setMode('login')} />
      )}
      {mode === 'login' && (
        <LoginForm
          onRegister={() => setMode('register')}
          onForgotPassword={() => setMode('forgot_password')}
        />
      )}
      {mode === 'register' && (
        <RegisterForm onLogin={() => setMode('login')} />
      )}
    </AuthLayout>
  )
}
