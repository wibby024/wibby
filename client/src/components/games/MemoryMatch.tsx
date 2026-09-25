interface MemoryMatchProps {
  cards: string[];
  flippedIndices: number[];
  matchedIndices: number[];
  lastMismatch: number[] | null;
  playerScores: { [uid: string]: number };
  myUid: string;
  partnerUid: string;
  partnerName: string;
  isMyTurn: boolean;
  onCardClick: (index: number) => void;
  disabled: boolean;
}

export default function MemoryMatch({
  cards,
  flippedIndices,
  matchedIndices,
  lastMismatch,
  playerScores,
  myUid,
  partnerUid,
  partnerName,
  isMyTurn,
  onCardClick,
  disabled
}: MemoryMatchProps) {
  const myPairs = playerScores[myUid] || 0;
  const partnerPairs = playerScores[partnerUid] || 0;

  return (
    <div className="mm-container" aria-label="Memory Match game board">
      {/* Pair Score Counters */}
      <div className="mm-scores-bar">
        <div className="mm-score-pill">
          <span className="mm-score-label">Your Pairs:</span>
          <span className="mm-score-num">{myPairs}</span>
        </div>
        <div className="mm-score-pill">
          <span className="mm-score-label">{partnerName}&apos;s Pairs:</span>
          <span className="mm-score-num">{partnerPairs}</span>
        </div>
      </div>

      {/* 4x4 Grid */}
      <div className="mm-grid">
        {cards.map((emoji, index) => {
          const isMatched = matchedIndices.includes(index);
          const isFlipped = flippedIndices.includes(index);
          const isMismatch = lastMismatch && lastMismatch.includes(index);
          const isFaceUp = isMatched || isFlipped || isMismatch;
          const canClick = isMyTurn && !isMatched && !isFlipped && !disabled;

          return (
            <button
              key={`card-${index}`}
              className={`mm-card ${isFaceUp ? 'flipped' : ''} ${isMatched ? 'matched' : ''} ${isMismatch ? 'mismatch' : ''}`}
              onClick={() => canClick && onCardClick(index)}
              disabled={!canClick}
              type="button"
              aria-label={`Card ${index + 1}: ${isFaceUp ? emoji : 'Hidden'}`}
            >
              <div className="mm-card-inner">
                <div className="mm-card-front">❓</div>
                <div className="mm-card-back">{emoji}</div>
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
}
