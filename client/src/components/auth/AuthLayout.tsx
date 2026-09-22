import type { ReactNode } from 'react'
import WibbyLogo from '../WibbyLogo'
import './AuthLayout.css'

interface AuthLayoutProps {
  children: ReactNode
}

export default function AuthLayout({ children }: AuthLayoutProps) {
  return (
    <main className="auth-page">
      {/* Dynamic ambient background glow */}
      <div className="auth-bg-layer" aria-hidden="true">
        <div className="auth-orb auth-orb-1" />
        <div className="auth-orb auth-orb-2" />
        <div className="auth-orb auth-orb-3" />
        <div className="auth-bg-grid" />
      </div>

      <div className="auth-split">
        {/* ── Left: Modern Brand Showcase Panel ── */}
        <aside className="auth-brand-panel">
          <div className="auth-brand-panel-inner">
            {/* Brand Logo Row */}
            <div className="auth-logo-row">
              <div className="auth-logo-mark">
                <WibbyLogo size={36} />
              </div>
              <span className="auth-logo-name">Wibby</span>
              <span className="auth-brand-pill">Private Space</span>
            </div>

            {/* Main Catchy Headline */}
            <h1 className="auth-brand-headline">
              Your private<br />
              <span className="gradient-word">space to connect.</span>
            </h1>

            <p className="auth-brand-sub">
              A secure, real-time messaging experience crafted exclusively for just the two of you.
            </p>

            {/* Feature Highlights with Glowing Dots */}
            <ul className="auth-feature-list">
              <li className="auth-feature-item">
                <span className="auth-feature-dot" />
                <span>End-to-end encrypted messaging</span>
              </li>
              <li className="auth-feature-item">
                <span className="auth-feature-dot" />
                <span>Crystal-clear 1080p HD video &amp; audio calls</span>
              </li>
              <li className="auth-feature-item">
                <span className="auth-feature-dot" />
                <span>Watch Together — synchronized video streams</span>
              </li>
              <li className="auth-feature-item">
                <span className="auth-feature-dot" />
                <span>Interactive mini-games, reactions &amp; live media</span>
              </li>
            </ul>

            <div className="auth-brand-watermark">
              <span>Wibby · Two-way communication</span>
            </div>
          </div>
        </aside>

        {/* ── Right: Form Card Panel ── */}
        <section className="auth-form-panel">
          <div className="auth-card">
            {/* Mobile-only brand header (visible only on small/medium screens) */}
            <div className="auth-mobile-brand">
              <div className="auth-mobile-logo-wrap">
                <WibbyLogo size={36} />
                <span className="auth-mobile-brand-name">Wibby</span>
              </div>
              <span className="auth-mobile-pill">Two-Person Space</span>
            </div>

            {children}

            <p className="auth-footer">
              <svg
                width="13"
                height="13"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
                aria-hidden="true"
                style={{ flexShrink: 0, opacity: 0.6 }}
              >
                <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
                <path d="M7 11V7a5 5 0 0 1 10 0v4" />
              </svg>
              <span>Private communication. Just between two people.</span>
            </p>
          </div>
        </section>
      </div>
    </main>
  )
}
