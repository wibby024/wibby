import React, { useState, useEffect, useMemo, useRef } from 'react';
import { createPortal } from 'react-dom';
import './MiniMapWidget.css';

export interface MiniMapWidgetProps {
  latitude: number;
  longitude: number;
  name?: string;
  address?: string;
  isLive?: boolean;
  liveUntil?: string;
  stoppedAt?: string | null;
  accuracy?: number;
  speed?: number | null;
  heading?: number | null;
  isSender?: boolean;
  onStopLive?: () => void;
  interactive?: boolean;
  height?: number | string;
  defaultZoom?: number;
  allowExpand?: boolean;
  className?: string;
}

export default function MiniMapWidget({
  latitude,
  longitude,
  name,
  address,
  isLive = false,
  liveUntil,
  stoppedAt,
  accuracy,
  speed,
  heading,
  isSender = false,
  onStopLive,
  interactive = true,
  height = 200,
  defaultZoom = 16,
  allowExpand = true,
  className = ''
}: MiniMapWidgetProps) {
  const [zoom, setZoom] = useState(defaultZoom);
  const [isExpanded, setIsExpanded] = useState(false);
  const [copied, setCopied] = useState(false);
  const [remainingTime, setRemainingTime] = useState<string>('');
  const [isMapLoaded, setIsMapLoaded] = useState(false);
  const iframeRef = useRef<HTMLIFrameElement>(null);

  // Determine live status
  const isActiveLive = Boolean(
    isLive && 
    (!liveUntil || new Date(liveUntil) > new Date()) && 
    !stoppedAt
  );
  const isEndedLive = Boolean(
    isLive && 
    ((liveUntil && new Date(liveUntil) <= new Date()) || stoppedAt)
  );

  // Live countdown timer
  useEffect(() => {
    if (!isActiveLive || !liveUntil) {
      setRemainingTime('');
      return;
    }

    const updateRemaining = () => {
      const diff = new Date(liveUntil).getTime() - Date.now();
      if (diff <= 0) {
        setRemainingTime('Ended');
        return;
      }
      const mins = Math.floor(diff / 60000);
      const secs = Math.floor((diff % 60000) / 1000);
      if (mins >= 60) {
        const hrs = Math.floor(mins / 60);
        const remMins = mins % 60;
        setRemainingTime(`${hrs}h ${remMins}m left`);
      } else if (mins > 0) {
        setRemainingTime(`${mins}m ${secs}s left`);
      } else {
        setRemainingTime(`${secs}s left`);
      }
    };

    updateRemaining();
    const interval = setInterval(updateRemaining, 1000);
    return () => clearInterval(interval);
  }, [isActiveLive, liveUntil]);

  // Compute bounding box based on zoom level
  const bbox = useMemo(() => {
    // Delta span calculated from zoom level (13 = wide city, 16 = neighborhood, 18 = building)
    const factor = Math.pow(2, 17 - zoom);
    const deltaLat = 0.0035 * factor;
    const deltaLon = 0.006 * factor;
    const minLon = (longitude - deltaLon).toFixed(5);
    const minLat = (latitude - deltaLat).toFixed(5);
    const maxLon = (longitude + deltaLon).toFixed(5);
    const maxLat = (latitude + deltaLat).toFixed(5);
    return { minLon, minLat, maxLon, maxLat };
  }, [latitude, longitude, zoom]);

  const mapEmbedUrl = useMemo(() => {
    return `https://www.openstreetmap.org/export/embed.html?bbox=${bbox.minLon}%2C${bbox.minLat}%2C${bbox.maxLon}%2C${bbox.maxLat}&layer=mapnik&marker=${latitude}%2C${longitude}`;
  }, [bbox, latitude, longitude]);

  const googleMapsUrl = `https://www.google.com/maps/search/?api=1&query=${latitude},${longitude}`;
  const appleMapsUrl = `https://maps.apple.com/?q=${latitude},${longitude}`;
  const directionsUrl = `https://www.google.com/maps/dir/?api=1&destination=${latitude},${longitude}`;

  const handleZoomIn = (e: React.MouseEvent) => {
    e.stopPropagation();
    e.preventDefault();
    setZoom(prev => Math.min(prev + 1, 19));
  };

  const handleZoomOut = (e: React.MouseEvent) => {
    e.stopPropagation();
    e.preventDefault();
    setZoom(prev => Math.max(prev - 1, 12));
  };

  const handleCopyCoords = (e: React.MouseEvent) => {
    e.stopPropagation();
    e.preventDefault();
    navigator.clipboard.writeText(`${latitude.toFixed(6)}, ${longitude.toFixed(6)}`);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const displayName = name || (isActiveLive ? 'Live Location' : 'Shared Location');
  const displayAddress = address || `${latitude.toFixed(5)}, ${longitude.toFixed(5)}`;

  return (
    <>
      <div 
        className={`mini-map-widget ${isActiveLive ? 'is-live-widget' : ''} ${className}`}
        style={{ height: typeof height === 'number' ? `${height}px` : height }}
      >
        {/* Map Frame Container */}
        <div className="mini-map-frame-wrapper">
          <iframe
            ref={iframeRef}
            src={mapEmbedUrl}
            className="mini-map-iframe"
            title={`Map view for ${displayName}`}
            loading="lazy"
            onLoad={() => setIsMapLoaded(true)}
          />

          {!isMapLoaded && (
            <div className="mini-map-loader">
              <div className="mini-map-spinner" />
              <span>Loading map…</span>
            </div>
          )}

          {/* Pulse Radar Marker Overlay for Live Tracking */}
          {isActiveLive && (
            <div className="mini-map-live-radar-overlay">
              <div className="live-radar-beacon">
                <div className="radar-wave wave-1" />
                <div className="radar-wave wave-2" />
                <div className="radar-dot" />
              </div>
            </div>
          )}
        </div>

        {/* Top Floating HUD Chip */}
        <div className="mini-map-top-hud">
          <div className="mini-map-badge">
            {isActiveLive ? (
              <span className="live-pill">
                <span className="live-pulsing-dot" />
                <span>LIVE {remainingTime ? `• ${remainingTime}` : ''}</span>
              </span>
            ) : isEndedLive ? (
              <span className="ended-pill">Ended</span>
            ) : (
              <span className="place-pill">📍 Place</span>
            )}
          </div>

          {allowExpand && (
            <button
              type="button"
              className="mini-map-hud-btn expand-btn"
              onClick={(e) => {
                e.stopPropagation();
                e.preventDefault();
                setIsExpanded(true);
              }}
              title="Expand Fullscreen Map"
              aria-label="Expand Map"
            >
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <polyline points="15 3 21 3 21 9" />
                <polyline points="9 21 3 21 3 15" />
                <line x1="21" y1="3" x2="14" y2="10" />
                <line x1="3" y1="21" x2="10" y2="14" />
              </svg>
            </button>
          )}
        </div>

        {/* Bottom Floating Control Bar */}
        {interactive && (
          <div className="mini-map-control-bar">
            <div className="zoom-controls">
              <button 
                type="button" 
                className="zoom-btn" 
                onClick={handleZoomIn} 
                title="Zoom in"
                disabled={zoom >= 19}
              >
                +
              </button>
              <button 
                type="button" 
                className="zoom-btn" 
                onClick={handleZoomOut} 
                title="Zoom out"
                disabled={zoom <= 12}
              >
                −
              </button>
            </div>

            <div className="action-links">
              <a 
                href={directionsUrl} 
                target="_blank" 
                rel="noopener noreferrer" 
                className="directions-chip"
                onClick={(e) => e.stopPropagation()}
                title="Get Directions in Google Maps"
              >
                <span>Navigate</span>
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                  <polygon points="3 11 22 2 13 21 11 13 3 11" />
                </svg>
              </a>
            </div>
          </div>
        )}

        {/* Bottom Info Banner */}
        <div className="mini-map-bottom-info">
          <div className="mini-map-text-meta">
            <h4 className="mini-map-place-title">{displayName}</h4>
            <p className="mini-map-place-address">{displayAddress}</p>
          </div>

          <div className="mini-map-quick-actions">
            {isActiveLive && isSender && onStopLive && (
              <button
                type="button"
                className="mini-map-stop-live-btn"
                onClick={(e) => {
                  e.stopPropagation();
                  e.preventDefault();
                  onStopLive();
                }}
                title="Stop sharing your live location"
              >
                Stop Live
              </button>
            )}
            <a
              href={googleMapsUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="mini-map-open-link"
              onClick={(e) => e.stopPropagation()}
              title="Open full view in Google Maps"
            >
              Maps ↗
            </a>
          </div>
        </div>
      </div>

      {/* Fullscreen Expanded Map Modal */}
      {isExpanded && createPortal(
        <div 
          className="fullscreen-map-overlay" 
          onClick={() => setIsExpanded(false)}
          role="dialog"
          aria-modal="true"
          aria-label="Expanded Map View"
        >
          <div className="fullscreen-map-card" onClick={(e) => e.stopPropagation()}>
            <div className="fullscreen-map-header">
              <div className="fullscreen-map-title-wrap">
                <div className={`fullscreen-map-icon ${isActiveLive ? 'is-live' : ''}`}>
                  {isActiveLive ? '📡' : '📍'}
                </div>
                <div>
                  <h3 className="fullscreen-map-title">{displayName}</h3>
                  <p className="fullscreen-map-subtitle">{displayAddress}</p>
                </div>
              </div>

              <div className="fullscreen-map-header-actions">
                {isActiveLive && (
                  <span className="live-pill large">
                    <span className="live-pulsing-dot" />
                    LIVE {remainingTime ? `• ${remainingTime}` : ''}
                  </span>
                )}
                <button
                  type="button"
                  className="fullscreen-close-btn"
                  onClick={() => setIsExpanded(false)}
                  aria-label="Close Map"
                >
                  ✕
                </button>
              </div>
            </div>

            <div className="fullscreen-map-viewport">
              <iframe
                src={`https://www.openstreetmap.org/export/embed.html?bbox=${(longitude - 0.012).toFixed(5)}%2C${(latitude - 0.007).toFixed(5)}%2C${(longitude + 0.012).toFixed(5)}%2C${(latitude + 0.007).toFixed(5)}&layer=mapnik&marker=${latitude}%2C${longitude}`}
                className="fullscreen-iframe"
                title="Detailed Map"
              />
              {isActiveLive && (
                <div className="fullscreen-radar-overlay">
                  <div className="radar-wave wave-1" />
                  <div className="radar-wave wave-2" />
                  <div className="radar-dot" />
                </div>
              )}
            </div>

            <div className="fullscreen-map-footer">
              <div className="fullscreen-telemetry-row">
                <span className="telemetry-pill">
                  📍 {latitude.toFixed(6)}, {longitude.toFixed(6)}
                </span>
                {typeof accuracy === 'number' && (
                  <span className="telemetry-pill">🎯 ~{accuracy.toFixed(0)}m accuracy</span>
                )}
                {typeof speed === 'number' && speed > 0 && (
                  <span className="telemetry-pill">⚡ {(speed * 3.6).toFixed(1)} km/h</span>
                )}
                {typeof heading === 'number' && heading >= 0 && (
                  <span className="telemetry-pill">🧭 {heading.toFixed(0)}°</span>
                )}
              </div>

              <div className="fullscreen-action-row">
                <button
                  type="button"
                  className="fullscreen-btn secondary"
                  onClick={handleCopyCoords}
                >
                  {copied ? '✓ Copied' : 'Copy Coordinates'}
                </button>

                <a
                  href={appleMapsUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="fullscreen-btn secondary"
                >
                  Apple Maps
                </a>

                <a
                  href={googleMapsUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="fullscreen-btn primary"
                >
                  <span>Open in Google Maps</span>
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" />
                    <polyline points="15 3 21 3 21 9" />
                    <line x1="10" y1="14" x2="21" y2="3" />
                  </svg>
                </a>

                {isActiveLive && isSender && onStopLive && (
                  <button
                    type="button"
                    className="fullscreen-btn danger"
                    onClick={() => {
                      onStopLive();
                      setIsExpanded(false);
                    }}
                  >
                    Stop Live Sharing
                  </button>
                )}
              </div>
            </div>
          </div>
        </div>,
        document.body
      )}
    </>
  );
}
