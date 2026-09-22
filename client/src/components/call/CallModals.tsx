import { useCall } from '../../context/CallContext';
import IncomingCallModal from './IncomingCallModal';
import OutgoingCallModal from './OutgoingCallModal';
import ActiveCallPanel from './ActiveCallPanel';
import FloatingCallCapsule from './FloatingCallCapsule';
import ErrorBoundary from '../ErrorBoundary';
import './CallModal.css';

export default function CallModals() {
  const {
    callState,
    errorMessage,
    clearError,
    isMinimized,
    recoverableCall,
    resumeRecoverableCall,
    dismissRecoverableCall
  } = useCall();

  return (
    <ErrorBoundary fallback={<div className="call-error-toast">Call interface error. Call in progress.</div>}>
      {/* Persistent Call Recovery Banner (Level 1 & Level 2 Rehydration) */}
      {recoverableCall && callState === 'IDLE' && (
        <div className="call-recovery-banner" role="alert">
          <div className="call-recovery-info">
            <span className="call-recovery-pulse-dot" />
            <div className="call-recovery-text">
              <span className="call-recovery-title">
                Ongoing {recoverableCall.callType} call with <strong>{recoverableCall.partnerName}</strong>
              </span>
              <span className="call-recovery-subtitle">
                Connection lost • Call is waiting in recovery grace window
              </span>
            </div>
          </div>
          <div className="call-recovery-actions">
            <button
              type="button"
              className="call-recovery-btn resume"
              onClick={resumeRecoverableCall}
            >
              Resume Call
            </button>
            <button
              type="button"
              className="call-recovery-btn dismiss"
              onClick={dismissRecoverableCall}
            >
              Dismiss
            </button>
          </div>
        </div>
      )}

      {callState === 'INCOMING_RINGING' && <IncomingCallModal />}
      {callState === 'OUTGOING_CALLING' && <OutgoingCallModal />}
      {(callState === 'CONNECTING' || callState === 'CONNECTED' || callState === 'RECONNECTING') && (
        <>
          <div
            className={`call-active-panel-container ${isMinimized ? 'is-minimized-dormant' : ''}`}
            aria-hidden={isMinimized}
          >
            <ActiveCallPanel />
          </div>
          {isMinimized && <FloatingCallCapsule />}
        </>
      )}

      {errorMessage && (
        <div className="call-error-toast" role="alert" aria-live="assertive">
          <div className="call-error-toast-content">
            <svg className="call-error-icon" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <circle cx="12" cy="12" r="10" />
              <line x1="12" y1="8" x2="12" y2="12" />
              <line x1="12" y1="16" x2="12.01" y2="16" />
            </svg>
            <span className="call-error-message">{errorMessage}</span>
          </div>
          <button
            type="button"
            className="call-error-dismiss-btn"
            onClick={clearError}
            aria-label="Dismiss error notification"
            title="Dismiss"
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <line x1="18" y1="6" x2="6" y2="18" />
              <line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        </div>
      )}
    </ErrorBoundary>
  );
}
