import { Component, type ErrorInfo, type ReactNode } from 'react';

interface Props {
  children: ReactNode;
  fallback?: ReactNode;
  onReset?: () => void;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

export class ErrorBoundary extends Component<Props, State> {
  public state: State = {
    hasError: false,
    error: null
  };

  public static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  public componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error('[WIBBY ERROR BOUNDARY] Uncaught error caught by boundary:', error, errorInfo);
  }

  private handleReload = () => {
    if (this.props.onReset) {
      this.props.onReset();
      this.setState({ hasError: false, error: null });
    } else {
      window.location.reload();
    }
  };

  public render() {
    if (this.state.hasError) {
      if (this.props.fallback) {
        return this.props.fallback;
      }

      return (
        <div style={{
          minHeight: '100vh',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          background: '#0B0E14',
          color: '#E2E8F0',
          fontFamily: 'Inter, system-ui, -apple-system, sans-serif',
          padding: '24px',
          textAlign: 'center'
        }}>
          <div style={{
            width: '48px',
            height: '48px',
            borderRadius: '12px',
            background: 'rgba(239, 68, 68, 0.12)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            marginBottom: '16px',
            border: '1px solid rgba(239, 68, 68, 0.3)'
          }}>
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#EF4444" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="12" cy="12" r="10" />
              <line x1="12" y1="8" x2="12" y2="12" />
              <line x1="12" y1="16" x2="12.01" y2="16" />
            </svg>
          </div>
          <h2 style={{ fontSize: '20px', fontWeight: 600, marginBottom: '8px', color: '#FFFFFF' }}>
            Something went wrong
          </h2>
          <p style={{ fontSize: '14px', color: '#94A3B8', maxWidth: '420px', marginBottom: '24px', lineHeight: 1.5 }}>
            {this.state.error?.message || 'An unexpected application error occurred.'}
          </p>
          <button
            type="button"
            onClick={this.handleReload}
            style={{
              padding: '10px 20px',
              borderRadius: '8px',
              background: '#3B82F6',
              color: '#FFFFFF',
              border: 'none',
              fontWeight: 500,
              fontSize: '14px',
              cursor: 'pointer',
              transition: 'background 0.2s ease'
            }}
          >
            Reload Wibby
          </button>
        </div>
      );
    }

    return this.props.children;
  }
}

export default ErrorBoundary;
