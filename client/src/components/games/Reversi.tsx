interface ReversiProps {
  board: (string | null)[];
  counts?: { B: number; W: number };
  isHost: boolean;
  isMyTurn: boolean;
  myUid: string;
  partnerUid: string;
  partnerName: string;
  onPlaceDisk: (cellIndex: number) => void;
  disabled: boolean;
}

export default function Reversi({
  board,
  counts,
  isHost,
  isMyTurn,
  partnerName,
  onPlaceDisk,
  disabled
}: ReversiProps) {
  const mySymbol = isHost ? 'B' : 'W';
  const myDisks = counts ? (isHost ? counts.B : counts.W) : 2;
  const partnerDisks = counts ? (isHost ? counts.W : counts.B) : 2;

  return (
    <div className="reversi-container" aria-label="Reversi 6x6 board">
      {/* Disk Score Counters */}
      <div className="reversi-meta">
        <div className="reversi-pill pill-my">
          <span className={`reversi-mini-disk ${mySymbol === 'B' ? 'disk-black' : 'disk-white'}`} />
          <span>You:</span> <strong>{myDisks}</strong>
        </div>
        <div className="reversi-pill pill-partner">
          <span className={`reversi-mini-disk ${mySymbol === 'B' ? 'disk-white' : 'disk-black'}`} />
          <span>{partnerName}:</span> <strong>{partnerDisks}</strong>
        </div>
      </div>

      {/* 6x6 Board */}
      <div className="reversi-grid">
        {Array.from({ length: 36 }).map((_, index) => {
          const disk = board[index];
          const canClick = isMyTurn && !disk && !disabled;

          return (
            <button
              key={`rev-${index}`}
              className={`reversi-cell ${disk ? 'has-disk' : ''}`}
              onClick={() => canClick && onPlaceDisk(index)}
              disabled={!canClick}
              type="button"
              aria-label={`Square ${index + 1}: ${disk ? (disk === 'B' ? 'Dark' : 'Light') : 'Empty'}`}
            >
              {disk && (
                <div
                  className={`reversi-disk ${disk === 'B' ? 'disk-black' : 'disk-white'}`}
                />
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
}
