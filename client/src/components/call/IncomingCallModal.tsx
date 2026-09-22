import { useCall } from '../../context/CallContext';
import { ringtoneService } from '../../services/ringtoneService';
import { resolvePartnerName } from '../../utils/partnerName';
import './CallModal.css';

export default function IncomingCallModal() {
  const { activeCall, acceptCall, rejectCall } = useCall();

  if (!activeCall) return null;

  const partnerName = resolvePartnerName(activeCall.remoteUser);
  const initial = partnerName.charAt(0).toUpperCase();

  return (
    <div
      className="call-overlay"
      role="dialog"
      aria-modal="true"
      aria-labelledby="incoming-call-title"
      onClick={() => {
        // Unlock ringtone on user interaction if autoplay was previously blocked
        if (activeCall?.callId) {
          ringtoneService.start(activeCall.callId);
        }
      }}
    >
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

        <h2 id="incoming-call-title" className="call-name">{partnerName}</h2>
        <div className="call-status-badge">
          {activeCall.callType === 'video' ? (
            <>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <polygon points="23 7 16 12 23 17 23 7" />
                <rect x="1" y="5" width="15" height="14" rx="2" ry="2" />
              </svg>
              <span>Incoming video call...</span>
            </>
          ) : (
            <>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z" />
              </svg>
              <span>Incoming voice call...</span>
            </>
          )}
        </div>

        <div className="call-actions">
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
            <button
              className="call-btn decline"
              onClick={() => rejectCall('declined')}
              aria-label="Decline call"
              title="Decline"
            >
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <line x1="18" y1="6" x2="6" y2="18" />
                <line x1="6" y1="6" x2="18" y2="18" />
              </svg>
            </button>
            <span className="call-btn-label">Decline</span>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
            <button
              className="call-btn accept"
              onClick={acceptCall}
              aria-label="Accept call"
              title="Accept"
            >
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z" />
              </svg>
            </button>
            <span className="call-btn-label">Accept</span>
          </div>
        </div>
      </div>
    </div>
  );
}
