interface WibbyLogoProps {
  size?: number;
  showText?: boolean;
  className?: string;
}

export default function WibbyLogo({ size = 32, showText = false, className = '' }: WibbyLogoProps) {
  return (
    <div className={`wibby-brand-logo ${className}`} style={{ display: 'inline-flex', alignItems: 'center', gap: '10px' }}>
      <img
        src="/favicon-32.png?v=wibby4"
        srcSet="/favicon-32.png?v=wibby4 1x, /icon-192.png?v=wibby4 2x"
        width={size}
        height={size}
        alt="Wibby"
        style={{
          width: `${size}px`,
          height: `${size}px`,
          borderRadius: `${Math.round(size * 0.28)}px`,
          flexShrink: 0,
          display: 'block',
          boxShadow: '0 4px 16px rgba(139, 92, 246, 0.35)',
          objectFit: 'cover'
        }}
      />
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
