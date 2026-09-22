import { useState, type FormEvent } from 'react';

interface WordImposterProps {
  category: string;
  revealedMask: string;
  guessedLetters: string[];
  wrongGuesses: number;
  maxWrong: number;
  isMyTurn: boolean;
  onGuessLetter: (letter: string) => void;
  onGuessWord: (word: string) => void;
  disabled: boolean;
}

const ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'.split('');

export default function WordImposter({
  category,
  revealedMask,
  guessedLetters,
  wrongGuesses,
  maxWrong,
  isMyTurn,
  onGuessLetter,
  onGuessWord,
  disabled
}: WordImposterProps) {
  const [solveInput, setSolveInput] = useState('');

  const handleSolveSubmit = (e: FormEvent) => {
    e.preventDefault();
    if (!solveInput.trim() || !isMyTurn || disabled) return;
    onGuessWord(solveInput.trim().toUpperCase());
    setSolveInput('');
  };

  return (
    <div className="wi-container">
      <div className="wi-category-badge">
        <span>Category: {category}</span>
      </div>

      <div className="wi-wrong-counter" aria-label={`Wrong guesses: ${wrongGuesses} of ${maxWrong}`}>
        {Array.from({ length: maxWrong }).map((_, i) => (
          <div
            key={i}
            className={`wi-danger-dot ${i < wrongGuesses ? 'active' : ''}`}
            title={`Wrong step ${i + 1}`}
          />
        ))}
        <span style={{ fontSize: '11px', color: 'var(--wibby-text-muted)', marginLeft: '4px' }}>
          {wrongGuesses}/{maxWrong} wrong
        </span>
      </div>

      <div className="wi-word-display" aria-label={`Current mystery word: ${revealedMask}`}>
        {revealedMask}
      </div>

      {/* Virtual Keyboard */}
      <div className="wi-keyboard">
        {ALPHABET.map(char => {
          const isGuessed = guessedLetters.includes(char);
          return (
            <button
              key={char}
              className="wi-key-btn"
              onClick={() => isMyTurn && !isGuessed && !disabled && onGuessLetter(char)}
              disabled={!isMyTurn || isGuessed || disabled}
              type="button"
            >
              {char}
            </button>
          );
        })}
      </div>

      {/* Solve Word Input */}
      <form className="wi-solve-row" onSubmit={handleSolveSubmit}>
        <input
          type="text"
          className="wi-solve-input"
          placeholder="Solve whole word..."
          value={solveInput}
          onChange={e => setSolveInput(e.target.value)}
          disabled={!isMyTurn || disabled}
          maxLength={15}
        />
        <button
          className="game-btn primary"
          type="submit"
          disabled={!solveInput.trim() || !isMyTurn || disabled}
          style={{ flex: 'none', padding: '0 14px', minHeight: '38px', fontSize: '12px' }}
        >
          Solve
        </button>
      </form>
    </div>
  );
}
