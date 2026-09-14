import { useCall } from '../../context/CallContext';
import './CallModal.css';

export default function OutgoingCallModal() {
  const { activeCall, cancelCall } = useCall();

  if (!activeCall) return null;

  const partnerName = activeCall.remoteUser.name || 'Partner';
  const initial = partnerName.charAt(0).toUpperCase();

  return (
    <div className="call-overlay" role="dialog" aria-modal="true" aria-labelledby="outgoing-call-title">
      <div className="call-card">
        <div className="call-avatar-wrapper">
          <div className="call-pulse-ring" />
          <div className="call-pulse-ring ring-2" />
          <div className="call-avatar">
            {activeCall.remoteUser.avatar ? (
              <img src={activeCall.remoteUser.avatar} alt={partnerName} />
            ) : (
              <span>{initial}</span>
            )}
          </div>
        </div>

        <h2 id="outgoing-call-title" className="call-name">{partnerName}</h2>
        <div className="call-status-badge connecting">
          {activeCall.callType === 'video' ? (
            <>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <polygon points="23 7 16 12 23 17 23 7" />
                <rect x="1" y="5" width="15" height="14" rx="2" ry="2" />
              </svg>
              <span>Calling with video...</span>
            </>
          ) : (
            <>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z" />
              </svg>
              <span>Calling...</span>
            </>
          )}
        </div>

        <div className="call-actions">
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
            <button
              className="call-btn cancel"
              onClick={cancelCall}
              aria-label="Cancel call"
              title="Cancel"
            >
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <line x1="18" y1="6" x2="6" y2="18" />
                <line x1="6" y1="6" x2="18" y2="18" />
              </svg>
            </button>
            <span className="call-btn-label">Cancel</span>
          </div>
        </div>
      </div>
    </div>
  );
}
