interface RockPaperScissorsProps {
  playerChoices: { [uid: string]: string | null };
  roundScores: { [uid: string]: number };
  roundNumber: number;
  targetWins: number;
  lastRoundResult: {
    p1Choice: string;
    p2Choice: string;
    winnerUid: string | null;
    summary: string;
  } | null;
  myUid: string;
  partnerUid: string;
  partnerName: string;
  onChoice: (choice: 'rock' | 'paper' | 'scissors') => void;
  disabled: boolean;
}

export default function RockPaperScissors({
  playerChoices,
  roundScores,
  roundNumber,
  targetWins,
  lastRoundResult,
  myUid,
  partnerUid,
  partnerName,
  onChoice,
  disabled
}: RockPaperScissorsProps) {
  const myChoice = playerChoices[myUid];
  const partnerChoice = playerChoices[partnerUid];
  const myWins = roundScores[myUid] || 0;
  const partnerWins = roundScores[partnerUid] || 0;

  const getEmoji = (choice: string) => {
    switch (choice) {
      case 'rock':
        return '🪨';
      case 'paper':
        return '📄';
      case 'scissors':
        return '✂️';
      default:
        return '❓';
    }
  };

  return (
    <div className="rps-container" aria-label="Rock Paper Scissors game">
      {/* Round & Target Progress */}
      <div className="rps-meta">
        <span className="rps-round-badge">Round {roundNumber}</span>
        <span className="rps-target-badge">First to {targetWins} wins</span>
      </div>

      {/* Duel Status Cards */}
      <div className="rps-status-grid">
        <div className={`rps-player-status ${myChoice ? 'is-ready' : ''}`}>
          <div className="rps-choice-icon">
            {myChoice ? getEmoji(myChoice) : '⏳'}
          </div>
          <div className="rps-status-label">
            {myChoice ? `Locked: ${myChoice.toUpperCase()}` : 'Pick your move!'}
          </div>
          <div className="rps-win-dots">
            {Array.from({ length: targetWins }).map((_, i) => (
              <span key={`my-dot-${i}`} className={`rps-dot ${i < myWins ? 'filled' : ''}`} />
            ))}
          </div>
        </div>

        <div className="rps-versus-badge">VS</div>

        <div className={`rps-player-status ${partnerChoice ? 'is-ready' : ''}`}>
          <div className="rps-choice-icon">
            {partnerChoice ? '🔒' : '💭'}
          </div>
          <div className="rps-status-label">
            {partnerChoice ? `${partnerName} is Ready!` : `Waiting for ${partnerName}...`}
          </div>
          <div className="rps-win-dots">
            {Array.from({ length: targetWins }).map((_, i) => (
              <span key={`partner-dot-${i}`} className={`rps-dot ${i < partnerWins ? 'filled' : ''}`} />
            ))}
          </div>
        </div>
      </div>

      {/* Last Round Result Banner */}
      {lastRoundResult && (
        <div className={`rps-last-result ${lastRoundResult.winnerUid === myUid ? 'win' : lastRoundResult.winnerUid ? 'lose' : 'draw'}`}>
          <div className="rps-last-summary">
            {getEmoji(lastRoundResult.p1Choice)} vs {getEmoji(lastRoundResult.p2Choice)}
          </div>
          <div className="rps-last-text">{lastRoundResult.summary}</div>
        </div>
      )}

      {/* Choice Buttons */}
      <div className="rps-actions">
        <button
          className={`rps-btn ${myChoice === 'rock' ? 'selected' : ''}`}
          onClick={() => !disabled && onChoice('rock')}
          disabled={disabled || !!myChoice}
          type="button"
          aria-label="Choose Rock"
        >
          <span className="rps-btn-emoji">🪨</span>
          <span className="rps-btn-label">Rock</span>
        </button>

        <button
          className={`rps-btn ${myChoice === 'paper' ? 'selected' : ''}`}
          onClick={() => !disabled && onChoice('paper')}
          disabled={disabled || !!myChoice}
          type="button"
          aria-label="Choose Paper"
        >
          <span className="rps-btn-emoji">📄</span>
          <span className="rps-btn-label">Paper</span>
        </button>

        <button
          className={`rps-btn ${myChoice === 'scissors' ? 'selected' : ''}`}
          onClick={() => !disabled && onChoice('scissors')}
          disabled={disabled || !!myChoice}
          type="button"
          aria-label="Choose Scissors"
        >
          <span className="rps-btn-emoji">✂️</span>
          <span className="rps-btn-label">Scissors</span>
        </button>
      </div>
    </div>
  );
}
