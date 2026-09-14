import type { ReactNode } from 'react'
import './AuthLayout.css'

interface AuthLayoutProps {
  children: ReactNode
}

export default function AuthLayout({ children }: AuthLayoutProps) {
  return (
    <main className="auth-page">
      <div className="auth-background-orb auth-background-orb-one" />
      <div className="auth-background-orb auth-background-orb-two" />

      <section className="auth-card">
        <div className="auth-brand">
          <div className="auth-brand-mark">W</div>
          <span>Wibby</span>
        </div>

        {children}

        <p className="auth-footer">
          Private communication. Just between two people.
        </p>
      </section>
    </main>
  )
}
