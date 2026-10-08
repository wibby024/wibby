import React, { useState, useEffect, useRef, useCallback } from 'react';
import './TypeRace.css';

export interface TypeRaceProps {
  gameData: {
    raceId: string;
    challengeText: string;
    textLength: number;
    raceStatus: 'waiting' | 'ready' | 'countdown' | 'running' | 'finished';
    countdownStart: number | null;
    raceStart: number | null;
    ready: Record<string, boolean>;
    progress: Record<string, {
      progress: number;
      wpm: number;
      accuracy: number;
      errors: number;
      typedChars: number;
      finished: boolean;
      finishTime: number | null;
    }>;
  };
  myUid: string;
  partnerUid: string;
  partnerName: string;
  onMove: (move: any) => void;
  onReset: () => void;
  onClose: () => void;
  gameStatus: string;
  winnerId: string | null;
}

export default function TypeRace({
  gameData,
  myUid,
  partnerUid,
  partnerName,
  onMove,
  onReset,
  onClose,
  gameStatus,
  winnerId
}: TypeRaceProps) {
  const challengeText = gameData?.challengeText || "The future belongs to people who build the things they wish existed.";
  const textLength = challengeText.length;

  const [inputVal, setInputVal] = useState('');
  const [totalKeystrokes, setTotalKeystrokes] = useState(0);
  const [errorsCount, setErrorsCount] = useState(0);
  const [countdownRemaining, setCountdownRemaining] = useState<number | null>(null);
  const [elapsedSec, setElapsedSec] = useState(0);

  const inputRef = useRef<HTMLInputElement>(null);
  const lastProgressSentRef = useRef<number>(0);
  const isFinishedRef = useRef<boolean>(false);
  const challengeCardRef = useRef<HTMLDivElement>(null);

  const isMeReady = !!gameData?.ready?.[myUid];
  const isPartnerReady = !!gameData?.ready?.[partnerUid];
  const myProgress = gameData?.progress?.[myUid];
  const partnerProgress = gameData?.progress?.[partnerUid];

  const raceStart = gameData?.raceStart;
  const isRaceOver = gameStatus === 'won' || gameStatus === 'draw' || gameData?.raceStatus === 'finished' || myProgress?.finished;
  const didIWin = winnerId === myUid;

  // Reset local state when a fresh raceId arrives (e.g. rematch)
  useEffect(() => {
    setInputVal('');
    setTotalKeystrokes(0);
    setErrorsCount(0);
    setCountdownRemaining(null);
    setElapsedSec(0);
    isFinishedRef.current = false;
    lastProgressSentRef.current = 0;
  }, [gameData?.raceId]);

  // Handle synchronized countdown and race clock
  useEffect(() => {
    if (!raceStart) {
      setCountdownRemaining(null);
      return;
    }

    const interval = setInterval(() => {
      const now = Date.now();
      const diff = raceStart - now;

      if (diff > 0) {
        setCountdownRemaining(Math.ceil(diff / 1000));
      } else {
        setCountdownRemaining(0); // 0 = "GO!"
        const elapsed = Math.max(0, Math.floor((now - raceStart) / 1000));
        setElapsedSec(elapsed);

        // Auto-focus input on race start
        if (!isRaceOver && inputRef.current && document.activeElement !== inputRef.current) {
          inputRef.current.focus();
        }
      }
    }, 100);

    return () => clearInterval(interval);
  }, [raceStart, isRaceOver]);

  // Calculate live stats
  const correctPrefixLength = (() => {
    let count = 0;
    for (let i = 0; i < inputVal.length; i++) {
      if (inputVal[i] === challengeText[i]) {
        count++;
      } else {
        break;
      }
    }
    return count;
  })();

  const currentWpm = (() => {
    const timeMinutes = Math.max(1, elapsedSec) / 60;
    return Math.round((correctPrefixLength / 5) / timeMinutes);
  })();

  const currentAccuracy = (() => {
    if (totalKeystrokes === 0) return 100;
    return Math.max(0, Math.round(((totalKeystrokes - errorsCount) / totalKeystrokes) * 100));
  })();

  const currentProgressRatio = textLength > 0 ? Math.min(1, correctPrefixLength / textLength) : 0;

  // Throttled progress update to server
  const sendProgressUpdate = useCallback(
    (progress: number, wpm: number, accuracy: number, errors: number, typedChars: number) => {
      const now = Date.now();
      if (now - lastProgressSentRef.current > 250 || progress >= 1) {
        lastProgressSentRef.current = now;
        onMove({
          action: 'progress',
          progress,
          wpm,
          accuracy,
          errors,
          typedChars
        });
      }
    },
    [onMove]
  );

  // Handle Input Change
  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (countdownRemaining !== 0 || isRaceOver || isFinishedRef.current) return;

    const val = e.target.value;
    // Don't allow typing longer than the text
    if (val.length > textLength) return;

    // Detect if newly added character is an error
    if (val.length > inputVal.length) {
      setTotalKeystrokes(prev => prev + 1);
      const newCharIdx = val.length - 1;
      if (val[newCharIdx] !== challengeText[newCharIdx]) {
        setErrorsCount(prev => prev + 1);
      }
    }

    setInputVal(val);

    // Compute progress & stats with this new value
    let newCorrect = 0;
    for (let i = 0; i < val.length; i++) {
      if (val[i] === challengeText[i]) newCorrect++;
      else break;
    }

    const ratio = textLength > 0 ? Math.min(1, newCorrect / textLength) : 0;
    const timeMin = Math.max(1, elapsedSec) / 60;
    const wpm = Math.round((newCorrect / 5) / timeMin);
    const strokes = totalKeystrokes + (val.length > inputVal.length ? 1 : 0);
    const acc = strokes > 0 ? Math.max(0, Math.round(((strokes - errorsCount) / strokes) * 100)) : 100;

    // Check completion condition: full length and 100% exact match
    if (val.length === textLength && val === challengeText && !isFinishedRef.current) {
      isFinishedRef.current = true;
      onMove({
        action: 'finish',
        progress: 1,
        wpm,
        accuracy: acc,
        errors: errorsCount,
        typedChars: textLength
      });
      return;
    }

    sendProgressUpdate(ratio, wpm, acc, errorsCount, val.length);
  };

  const handleReadyClick = () => {
    onMove({ action: 'ready' });
  };

  // Format seconds to mm:ss
  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins < 10 ? '0' : ''}${mins}:${secs < 10 ? '0' : ''}${secs}`;
  };

  // -------------------------------------------------------------
  // Render: Results Screen (When game is finished)
  // -------------------------------------------------------------
  if (isRaceOver) {
    const myFinalWpm = myProgress?.wpm || currentWpm;
    const myFinalAcc = myProgress?.accuracy || currentAccuracy;
    const myFinalErrors = myProgress?.errors ?? errorsCount;

    const partnerFinalWpm = partnerProgress?.wpm || 0;
    const partnerFinalAcc = partnerProgress?.accuracy || 100;
    const partnerFinalErrors = partnerProgress?.errors || 0;

    return (
      <div className="typerace-results-card">
        <div className="typerace-results-banner">
          <div className="typerace-results-icon">{didIWin ? '🏆' : '👏'}</div>
          <h3 className={`typerace-results-title ${didIWin ? 'won' : 'lost'}`}>
            {didIWin ? 'You Won the Race!' : `${partnerName} Won!`}
          </h3>
          <p className="typerace-lobby-desc">
            {didIWin
              ? 'Incredible typing speed and accuracy!'
              : 'Great duel! Ready to challenge them again?'}
          </p>
        </div>

        <div className="typerace-results-grid">
          {/* My Results */}
          <div className={`typerace-result-box ${didIWin ? 'winner' : ''}`}>
            <div className="typerace-result-player-title" style={{ color: '#a78bfa' }}>
              <span>You</span>
              {didIWin && <span>🏆 Winner</span>}
            </div>
            <div className="typerace-result-stats-row">
              <span>Speed:</span>
              <strong>{myFinalWpm} WPM</strong>
            </div>
            <div className="typerace-result-stats-row">
              <span>Accuracy:</span>
              <strong>{myFinalAcc}%</strong>
            </div>
            <div className="typerace-result-stats-row">
              <span>Errors:</span>
              <strong>{myFinalErrors}</strong>
            </div>
            <div className="typerace-result-stats-row">
              <span>Time:</span>
              <strong>{formatTime(elapsedSec)}</strong>
            </div>
          </div>

          {/* Partner Results */}
          <div className={`typerace-result-box ${!didIWin && winnerId ? 'winner' : ''}`}>
            <div className="typerace-result-player-title" style={{ color: '#34d399' }}>
              <span>{partnerName}</span>
              {!didIWin && winnerId && <span>🏆 Winner</span>}
            </div>
            <div className="typerace-result-stats-row">
              <span>Speed:</span>
              <strong>{partnerFinalWpm} WPM</strong>
            </div>
            <div className="typerace-result-stats-row">
              <span>Accuracy:</span>
              <strong>{partnerFinalAcc}%</strong>
            </div>
            <div className="typerace-result-stats-row">
              <span>Errors:</span>
              <strong>{partnerFinalErrors}</strong>
            </div>
            <div className="typerace-result-stats-row">
              <span>Status:</span>
              <strong>{partnerProgress?.finished ? 'Finished' : `${Math.round((partnerProgress?.progress || 0) * 100)}%`}</strong>
            </div>
          </div>
        </div>

        <div className="typerace-result-actions">
          <button className="typerace-btn secondary" onClick={onClose} type="button">
            Exit
          </button>
          <button className="typerace-btn primary" onClick={onReset} type="button">
            Rematch 🏁
          </button>
        </div>
      </div>
    );
  }

  // -------------------------------------------------------------
  // Render: Waiting for Ready Screen
  // -------------------------------------------------------------
  if (!raceStart) {
    return (
      <div className="typerace-lobby">
        <div className="typerace-lobby-icon">🏁</div>
        <h3 className="typerace-lobby-title">Wibby Type Race</h3>
        <p className="typerace-lobby-desc">
          Head-to-head 2-player speed race. Type the challenge text as fast and accurately as you can!
        </p>

        <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', justifyContent: 'center' }}>
          <div className={`typerace-status-pill ${isMeReady ? 'ready' : ''}`}>
            <span>You:</span>
            <span>{isMeReady ? 'Ready 🟢' : 'Not Ready ⚪'}</span>
          </div>
          <div className={`typerace-status-pill ${isPartnerReady ? 'ready' : ''}`}>
            <span>{partnerName}:</span>
            <span>{isPartnerReady ? 'Ready 🟢' : 'Waiting... ⏳'}</span>
          </div>
        </div>

        <button
          className="typerace-ready-btn"
          onClick={handleReadyClick}
          disabled={isMeReady}
          type="button"
        >
          {isMeReady ? 'Ready! Waiting for Partner...' : 'I Am Ready to Race! 🏁'}
        </button>
      </div>
    );
  }

  // -------------------------------------------------------------
  // Render: Active Race Screen (Countdown & Running)
  // -------------------------------------------------------------
  const myBarPercent = Math.min(100, Math.round(currentProgressRatio * 100));
  const partnerBarPercent = Math.min(100, Math.round((partnerProgress?.progress || 0) * 100));

  return (
    <div className="typerace-container">
      {/* Synchronized 3-2-1-GO! Countdown Overlay */}
      {countdownRemaining !== null && countdownRemaining > 0 && (
        <div className="typerace-countdown-overlay">
          <div className="typerace-countdown-number">{countdownRemaining}</div>
          <div className="typerace-countdown-label">Get Ready to Type...</div>
        </div>
      )}

      {/* Live Dual Race Tracks */}
      <div className="typerace-tracks">
        {/* Your Track */}
        <div className="typerace-track-row">
          <div className="typerace-track-meta">
            <span className="typerace-track-name me">🏎️ You</span>
            <div className="typerace-track-stats">
              <span className="typerace-stat-badge highlight">{currentWpm} WPM</span>
              <span className="typerace-stat-badge">{currentAccuracy}% Acc</span>
            </div>
          </div>
          <div className="typerace-progress-rail">
            <div
              className="typerace-progress-fill me"
              style={{ width: `${Math.max(2, myBarPercent)}%` }}
            >
              <span className="typerace-racer-avatar">🏎️</span>
            </div>
          </div>
        </div>

        {/* Partner Track */}
        <div className="typerace-track-row">
          <div className="typerace-track-meta">
            <span className="typerace-track-name partner">🚗 {partnerName}</span>
            <div className="typerace-track-stats">
              <span className="typerace-stat-badge">{partnerProgress?.wpm || 0} WPM</span>
              <span className="typerace-stat-badge">{partnerProgress?.accuracy || 100}% Acc</span>
            </div>
          </div>
          <div className="typerace-progress-rail">
            <div
              className="typerace-progress-fill partner"
              style={{ width: `${Math.max(2, partnerBarPercent)}%` }}
            >
              <span className="typerace-racer-avatar">🚗</span>
            </div>
          </div>
        </div>
      </div>

      {/* Challenge Text Display & Hidden Input */}
      <div
        className="typerace-challenge-card"
        ref={challengeCardRef}
        onClick={() => inputRef.current?.focus()}
      >
        <div className="typerace-text-display">
          {challengeText.split('').map((char, index) => {
            let statusClass = 'untyped';
            if (index < inputVal.length) {
              statusClass = inputVal[index] === char ? 'correct' : 'incorrect';
            } else if (index === inputVal.length) {
              statusClass = 'current';
            }

            return (
              <span key={index} className={`typerace-char ${statusClass}`}>
                {char}
              </span>
            );
          })}
        </div>

        {/* Hidden Input capturing typing events with 0ms local lag */}
        <input
          ref={inputRef}
          type="text"
          className="typerace-hidden-input"
          value={inputVal}
          onChange={handleInputChange}
          autoFocus
          autoCapitalize="off"
          autoComplete="off"
          autoCorrect="off"
          spellCheck={false}
          disabled={countdownRemaining !== null && countdownRemaining > 0}
          aria-label="Typing challenge input"
        />
      </div>

      {/* Live HUD Bottom Bar */}
      <div className="typerace-hud">
        <div className="typerace-hud-item">
          <span className="typerace-hud-val">{currentWpm}</span>
          <span className="typerace-hud-label">WPM</span>
        </div>
        <div className="typerace-hud-item">
          <span className="typerace-hud-val">{currentAccuracy}%</span>
          <span className="typerace-hud-label">Accuracy</span>
        </div>
        <div className="typerace-hud-item">
          <span className="typerace-hud-val">{errorsCount}</span>
          <span className="typerace-hud-label">Errors</span>
        </div>
        <div className="typerace-hud-item">
          <span className="typerace-hud-val">{formatTime(elapsedSec)}</span>
          <span className="typerace-hud-label">Time</span>
        </div>
      </div>
    </div>
  );
}
