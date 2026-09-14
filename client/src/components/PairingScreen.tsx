import { useState, useEffect, useCallback } from 'react';
import { useAuth } from '../context/AuthContext';
import './PairingScreen.css';

interface PairingScreenProps {
  onPaired: () => void;
}

export default function PairingScreen({ onPaired }: PairingScreenProps) {
  const { user } = useAuth();
  const [loading, setLoading] = useState(true);
  const [activeCode, setActiveCode] = useState<any>(null);
  const [inputCode, setInputCode] = useState('');
  const [error, setError] = useState('');
  const [actionLoading, setActionLoading] = useState(false);
  const [now, setNow] = useState(Date.now());

  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, []);

  const fetchApi = useCallback(async (endpoint: string, options: RequestInit = {}) => {
    if (!user) throw new Error('Not authenticated');
    const token = await user.getIdToken();
    const url = `${import.meta.env.VITE_API_URL || 'http://localhost:3000'}/api/pairing${endpoint}`;
    const headers = {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${token}`,
      ...options.headers,
    };
    const response = await fetch(url, { ...options, headers });
    let data;
    try {
      data = await response.json();
    } catch {
      data = { error: response.status === 429 ? 'Too many requests, please try again later' : 'Invalid response from server' };
    }
    if (!response.ok) throw new Error(data.error || 'API Error');
    return data;
  }, [user]);

  const checkStatus = useCallback(async () => {
    try {
      const data = await fetchApi('/status');
      if (data.paired) {
        onPaired();
      } else {
        if (data.activeCode && new Date(data.activeCode.expiresAt).getTime() < Date.now()) {
           setActiveCode(null);
        } else {
           setActiveCode(data.activeCode);
        }
      }
    } catch (err: any) {
      console.error(err);
      // Don't log out or fail completely on a temporary 429
    } finally {
      setLoading(false);
    }
  }, [fetchApi, onPaired]);

  useEffect(() => {
    checkStatus();
  }, [checkStatus]);

  useEffect(() => {
    let interval: any;
    if (activeCode?.code) {
      interval = setInterval(checkStatus, 5000);
    }
    return () => {
      if (interval) clearInterval(interval);
    };
  }, [activeCode?.code, checkStatus]);

  const generateCode = async () => {
    try {
      setActionLoading(true);
      setError('');
      const data = await fetchApi('/generate', { method: 'POST' });
      setActiveCode(data);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setActionLoading(false);
    }
  };

  const handleInputCodeChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    let val = e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, '');
    if (val.length > 4) {
      val = val.slice(0, 4) + '-' + val.slice(4, 8);
    }
    setInputCode(val);
  };

  const redeemCode = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!inputCode.trim() || inputCode.length !== 9) {
      setError('Please enter a valid 8-character pairing code');
      return;
    }
    
    try {
      setActionLoading(true);
      setError('');
      await fetchApi('/redeem', {
        method: 'POST',
        body: JSON.stringify({ code: inputCode })
      });
      await checkStatus();
    } catch (err: any) {
      setError(err.message);
      setActionLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="pairing-screen">
        <div className="pairing-loading">Loading connection status...</div>
      </div>
    );
  }

  const renderActiveCode = () => {
    const expiresAt = new Date(activeCode.expiresAt).getTime();
    const remainingMs = Math.max(0, expiresAt - now);
    
    if (remainingMs === 0) {
      // It's expired visually
      return (
        <div className="pairing-active">
          <h2>Code Expired</h2>
          <p>Your pairing code is no longer valid.</p>
          <button 
            className="pairing-btn primary"
            onClick={generateCode}
            disabled={actionLoading}
          >
            Generate New Code
          </button>
          <button 
            className="pairing-btn secondary"
            onClick={() => setActiveCode(null)}
            disabled={actionLoading}
            style={{ marginTop: '1rem' }}
          >
            Cancel
          </button>
        </div>
      );
    }

    const minutes = Math.floor(remainingMs / 60000);
    const seconds = Math.floor((remainingMs % 60000) / 1000);
    const timeString = `${minutes}:${seconds.toString().padStart(2, '0')}`;

    return (
      <div className="pairing-active">
        <h2>Your pairing code</h2>
        <div className="pairing-code-display">{activeCode.code}</div>
        <p className="pairing-timer">
          Expires in {timeString}
        </p>
        <div className="pairing-waiting">
          <div className="spinner"></div>
          <p>Waiting for the other person...</p>
        </div>
        <button 
          className="pairing-btn secondary"
          onClick={() => setActiveCode(null)}
          disabled={actionLoading}
        >
          Cancel
        </button>
      </div>
    );
  };

  return (
    <div className="pairing-screen">
      <div className="pairing-container">
        {error && <div className="pairing-error">{error}</div>}

        {activeCode ? (
          renderActiveCode()
        ) : (
          <div className="pairing-options">
            <h2>Connect someone</h2>
            <p>Wibby works between two connected people.</p>
            
            <button 
              className="pairing-btn primary"
              onClick={generateCode}
              disabled={actionLoading}
            >
              {actionLoading ? 'Generating...' : 'Generate pairing code'}
            </button>
            
            <div className="pairing-divider">
              <span>OR</span>
            </div>
            
            <form onSubmit={redeemCode} className="pairing-form">
              <label>Enter pairing code</label>
              <input
                type="text"
                placeholder="AB7K-92QX"
                value={inputCode}
                onChange={handleInputCodeChange}
                disabled={actionLoading}
                maxLength={9}
              />
              <button 
                type="submit" 
                className="pairing-btn primary"
                disabled={actionLoading || inputCode.length !== 9}
              >
                {actionLoading ? 'Connecting...' : 'Connect'}
              </button>
            </form>
          </div>
        )}
      </div>
    </div>
  );
}
