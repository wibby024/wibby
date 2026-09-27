interface WibbyLogoProps {
  size?: number;
  showText?: boolean;
  className?: string;
}

export default function WibbyLogo({ size = 32, showText = false, className = '' }: WibbyLogoProps) {
  return (
    <div className={`wibby-brand-logo ${className}`} style={{ display: 'inline-flex', alignItems: 'center', gap: '10px' }}>
      <svg
        width={size}
        height={size}
        viewBox="0 0 40 40"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
        style={{ flexShrink: 0 }}
      >
        <defs>
          <linearGradient id="wibbyGrad" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor="#A78BFA" />
            <stop offset="50%" stopColor="#7C3AED" />
            <stop offset="100%" stopColor="#5B21B6" />
          </linearGradient>
          <linearGradient id="wibbyGlow" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor="#EC4899" />
            <stop offset="100%" stopColor="#8B5CF6" />
          </linearGradient>
          <filter id="glowFilter" x="-20%" y="-20%" width="140%" height="140%">
            <feGaussianBlur stdDeviation="2" result="blur" />
            <feComposite in="SourceGraphic" in2="blur" operator="over" />
          </filter>
        </defs>

        {/* Background rounded squircle */}
        <rect width="40" height="40" rx="12" fill="url(#wibbyGrad)" />
        
        {/* Glowing subtle ring */}
        <rect x="1" y="1" width="38" height="38" rx="11" stroke="rgba(255,255,255,0.25)" strokeWidth="1.5" />

        {/* Dynamic Dual Connecting Nodes (Wibby connection) */}
        <circle cx="12" cy="14" r="3.5" fill="#FFFFFF" opacity="0.95" />
        <circle cx="28" cy="14" r="3.5" fill="#F472B6" />

        {/* Flowing 'W' Curve Connection */}
        <path
          d="M10 16.5C10 22 14 27.5 16.5 27.5C19 27.5 20 23.5 20 23.5C20 23.5 21 27.5 23.5 27.5C26 27.5 30 22 30 16.5"
          stroke="#FFFFFF"
          strokeWidth="3.2"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
      {showText && (
        <span
          style={{
            fontSize: `${size * 0.65}px`,
            fontWeight: 800,
            letterSpacing: '-0.03em',
            background: 'linear-gradient(135deg, var(--wibby-text) 0%, var(--wibby-primary) 100%)',
            WebkitBackgroundClip: 'text',
            WebkitTextFillColor: 'transparent',
            fontFamily: 'var(--font-sans)'
          }}
        >
          Wibby
        </span>
      )}
    </div>
  );
}
