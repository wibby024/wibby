import { useState, useEffect } from 'react';

interface CoopWordleProps {
  gameData: {
    guesses: Array<{
      word: string;
      result: Array<'correct' | 'present' | 'absent'>;
      byUid: string;
    }>;
    maxGuesses: number;
    revealedWord: string | null;
  };
  isMyTurn: boolean;
  onMove: (move: { guess: string }) => void;
  gameStatus: 'active' | 'won' | 'draw' | 'invited';
  winnerId: string | null;
  partnerName: string;
}

const KEYBOARD_ROWS = [
  ['Q', 'W', 'E', 'R', 'T', 'Y', 'U', 'I', 'O', 'P'],
  ['A', 'S', 'D', 'F', 'G', 'H', 'J', 'K', 'L'],
  ['ENTER', 'Z', 'X', 'C', 'V', 'B', 'N', 'M', '⌫']
];

export default function CoopWordle({
  gameData,
  isMyTurn,
  onMove,
  gameStatus,
  winnerId: _winnerId,
  partnerName
}: CoopWordleProps) {
  const [currentGuess, setCurrentGuess] = useState('');
  const guesses = gameData?.guesses || [];
  const maxGuesses = gameData?.maxGuesses || 6;
  const isGameOver = gameStatus === 'won' || gameStatus === 'draw';

  // Letter color mapping for keyboard
  const keyStatuses: Record<string, 'correct' | 'present' | 'absent'> = {};
  guesses.forEach(g => {
    g.word.split('').forEach((letter, i) => {
      const res = g.result[i];
      if (res === 'correct') {
        keyStatuses[letter] = 'correct';
      } else if (res === 'present' && keyStatuses[letter] !== 'correct') {
        keyStatuses[letter] = 'present';
      } else if (res === 'absent' && !keyStatuses[letter]) {
        keyStatuses[letter] = 'absent';
      }
    });
  });

  const handleKeyPress = (key: string) => {
    if (isGameOver || !isMyTurn) return;

    if (key === 'ENTER') {
      if (currentGuess.length === 5) {
        onMove({ guess: currentGuess });
        setCurrentGuess('');
      }
    } else if (key === '⌫' || key === 'BACKSPACE') {
      setCurrentGuess(prev => prev.slice(0, -1));
    } else if (/^[A-Z]$/.test(key)) {
      if (currentGuess.length < 5) {
        setCurrentGuess(prev => prev + key);
      }
    }
  };

  // Keyboard physical listener
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (isGameOver || !isMyTurn) return;
      if (e.key === 'Enter') {
        handleKeyPress('ENTER');
      } else if (e.key === 'Backspace') {
        handleKeyPress('⌫');
      } else {
        const char = e.key.toUpperCase();
        if (/^[A-Z]$/.test(char)) {
          handleKeyPress(char);
        }
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [currentGuess, isMyTurn, isGameOver]);

  const rows = [];
  for (let r = 0; r < maxGuesses; r++) {
    const guessObj = guesses[r];
    const isCurrentRow = r === guesses.length && !isGameOver;

    const cells = [];
    for (let c = 0; c < 5; c++) {
      let letter = '';
      let status: 'correct' | 'present' | 'absent' | 'empty' | 'tbd' = 'empty';

      if (guessObj) {
        letter = guessObj.word[c] || '';
        status = guessObj.result[c] || 'absent';
      } else if (isCurrentRow) {
        letter = currentGuess[c] || '';
        status = letter ? 'tbd' : 'empty';
      }

      cells.push(
        <div
          key={c}
          className={`coop-tile ${status} ${letter ? 'has-letter' : ''}`}
        >
          {letter}
        </div>
      );
    }
    rows.push(
      <div key={r} className="coop-row">
        {cells}
      </div>
    );
  }

  return (
    <div className="coop-wordle-container">
      {/* Game Header */}
      <div className="coop-status-header">
        {gameStatus === 'won' ? (
          <div className="coop-banner won">
            🎉 <strong>Team Victory!</strong> You and {partnerName} solved it together!
          </div>
        ) : gameStatus === 'draw' ? (
          <div className="coop-banner draw">
            Good try! The secret word was: <strong>{gameData.revealedWord}</strong>
          </div>
        ) : (
          <div className="coop-banner turn">
            {isMyTurn ? (
              <span>✨ <strong>Your turn</strong> to guess a 5-letter word!</span>
            ) : (
              <span>⏳ Waiting for <strong>{partnerName}</strong> to make a guess...</span>
            )}
          </div>
        )}
      </div>

      {/* Grid */}
      <div className="coop-grid">
        {rows}
      </div>

      {/* Virtual Touch Keyboard */}
      <div className="coop-keyboard">
        {KEYBOARD_ROWS.map((row, rIdx) => (
          <div key={rIdx} className="coop-keyboard-row">
            {row.map(k => {
              const statusClass = keyStatuses[k] ? `key-${keyStatuses[k]}` : '';
              const isAction = k === 'ENTER' || k === '⌫';
              return (
                <button
                  key={k}
                  type="button"
                  className={`coop-key ${statusClass} ${isAction ? 'key-action' : ''}`}
                  onClick={() => handleKeyPress(k)}
                  disabled={isGameOver || !isMyTurn}
                >
                  {k}
                </button>
              );
            })}
          </div>
        ))}
      </div>
    </div>
  );
}
