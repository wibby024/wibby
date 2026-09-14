import { useState, useEffect } from 'react';
import { reverseGeocode, type GeocodedLocation } from '../services/locationService';
import { type LocationData } from '../types/chat';
import MiniMapWidget from './MiniMapWidget';
import './LocationShareModal.css';

interface LocationShareModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSendLocation: (loc: LocationData) => void;
}

export default function LocationShareModal({ isOpen, onClose, onSendLocation }: LocationShareModalProps) {
  const [loading, setLoading] = useState(false);
  const [geocoding, setGeocoding] = useState(false);
  const [coords, setCoords] = useState<{ latitude: number; longitude: number; accuracy: number } | null>(null);
  const [geocoded, setGeocoded] = useState<GeocodedLocation | null>(null);
  const [placeName, setPlaceName] = useState('');
  const [error, setError] = useState('');
  const [shareMode, setShareMode] = useState<'current' | 'live'>('current');
  const [liveDurationMinutes, setLiveDurationMinutes] = useState<number>(60); // 15, 60, 480 mins

  useEffect(() => {
    if (!isOpen) {
      setCoords(null);
      setGeocoded(null);
      setPlaceName('');
      setError('');
      setLoading(false);
      setGeocoding(false);
      return;
    }

    if (!('geolocation' in navigator)) {
      setError('Geolocation is not supported by your browser');
      return;
    }

    setLoading(true);
    setError('');

    navigator.geolocation.getCurrentPosition(
      async (pos) => {
        const lat = pos.coords.latitude;
        const lon = pos.coords.longitude;
        setCoords({
          latitude: lat,
          longitude: lon,
          accuracy: Math.round(pos.coords.accuracy)
        });
        setLoading(false);

        // Run reverse geocoding to resolve exact place name
        setGeocoding(true);
        try {
          const geo = await reverseGeocode(lat, lon);
          setGeocoded(geo);
          setPlaceName(geo.name);
        } catch (err) {
          console.warn('[WIBBY LOCATION] Reverse geocode error:', err);
        } finally {
          setGeocoding(false);
        }
      },
      (err) => {
        setLoading(false);
        if (err.code === 1) {
          setError('Location permission denied. Please allow location access in your browser.');
        } else if (err.code === 2) {
          setError('Location unavailable. Please check your GPS/network.');
        } else {
          setError('Location request timed out. Please try again.');
        }
      },
      { enableHighAccuracy: true, timeout: 12000, maximumAge: 0 }
    );
  }, [isOpen]);

  if (!isOpen) return null;

  const handleSend = () => {
    if (!coords) return;
    const finalName = placeName.trim() || geocoded?.name || 'Shared Location';
    const finalAddress = geocoded?.address || `${coords.latitude.toFixed(5)}, ${coords.longitude.toFixed(5)}`;

    if (shareMode === 'live') {
      const liveUntil = new Date(Date.now() + liveDurationMinutes * 60 * 1000).toISOString();
      onSendLocation({
        latitude: coords.latitude,
        longitude: coords.longitude,
        name: finalName,
        address: finalAddress,
        isLive: true,
        liveUntil,
        stoppedAt: null
      });
    } else {
      onSendLocation({
        latitude: coords.latitude,
        longitude: coords.longitude,
        name: finalName,
        address: finalAddress,
        isLive: false
      });
    }
    onClose();
  };

  return (
    <div className="location-modal-overlay" onClick={onClose} role="dialog" aria-modal="true" aria-label="Share your location">
      <div className="location-modal-card" onClick={e => e.stopPropagation()}>
        <div className="location-modal-header">
          <div className="location-modal-title-wrap">
            <span className="location-modal-icon">📍</span>
            <h3 className="location-modal-title">Share Location</h3>
          </div>
          <button className="location-modal-close" onClick={onClose} aria-label="Close">✕</button>
        </div>

        <div className="location-modal-body">
          {/* Mode Switcher Tabs */}
          <div className="location-mode-tabs" role="tablist">
            <button
              type="button"
              className={`location-mode-tab ${shareMode === 'current' ? 'active' : ''}`}
              onClick={() => setShareMode('current')}
              role="tab"
              aria-selected={shareMode === 'current'}
            >
              📍 Send Current Place
            </button>
            <button
              type="button"
              className={`location-mode-tab ${shareMode === 'live' ? 'active' : ''}`}
              onClick={() => setShareMode('live')}
              role="tab"
              aria-selected={shareMode === 'live'}
            >
              📡 Share Live Location
            </button>
          </div>

          {loading && (
            <div className="location-loading-state">
              <div className="location-spinner" />
              <p>Locating your position with GPS…</p>
            </div>
          )}

          {error && (
            <div className="location-error-state">
              <p>{error}</p>
            </div>
          )}

          {coords && !loading && (
            <div className="location-preview-state">
              {/* Live Mini Map Widget */}
              <MiniMapWidget
                latitude={coords.latitude}
                longitude={coords.longitude}
                name={placeName || geocoded?.name}
                address={geocoded?.address}
                isLive={shareMode === 'live'}
                accuracy={coords.accuracy}
                height={170}
                allowExpand={true}
                className="location-modal-mini-map"
              />

              {/* Live Duration Selector (if Live Mode) */}
              {shareMode === 'live' && (
                <div className="location-live-duration-group">
                  <label className="location-label">Share Live For</label>
                  <div className="duration-pills">
                    {[
                      { label: '15 Minutes', minutes: 15 },
                      { label: '1 Hour', minutes: 60 },
                      { label: '8 Hours', minutes: 480 }
                    ].map(dur => (
                      <button
                        key={dur.minutes}
                        type="button"
                        className={`duration-pill-btn ${liveDurationMinutes === dur.minutes ? 'active' : ''}`}
                        onClick={() => setLiveDurationMinutes(dur.minutes)}
                      >
                        {dur.label}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {/* Place Name Note / Custom Title Input */}
              <div className="location-name-input-group">
                <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                  <label className="location-label">Place name / Note</label>
                  {geocoding && <span className="location-mini-spinner" />}
                </div>
                <input
                  type="text"
                  className="location-input"
                  placeholder={geocoded?.name || "e.g. Home, Starbucks, Office..."}
                  value={placeName}
                  onChange={e => setPlaceName(e.target.value)}
                  maxLength={100}
                />
              </div>
            </div>
          )}
        </div>

        <div className="location-modal-actions">
          <button type="button" className="location-btn-cancel" onClick={onClose}>
            Cancel
          </button>
          <button
            type="button"
            className={`location-btn-send ${shareMode === 'live' ? 'is-live' : ''}`}
            disabled={!coords || loading}
            onClick={handleSend}
          >
            {shareMode === 'live' ? `Share Live (${liveDurationMinutes >= 60 ? `${liveDurationMinutes / 60}h` : `${liveDurationMinutes}m`})` : 'Send Place Location'}
          </button>
        </div>
      </div>
    </div>
  );
}

