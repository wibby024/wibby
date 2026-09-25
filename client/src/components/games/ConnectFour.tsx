interface ConnectFourProps {
  board: (string | null)[];
  winningCells: number[] | null;
  isMyTurn: boolean;
  onDropColumn: (col: number) => void;
  disabled: boolean;
  mySymbol?: string;
  players?: { [uid: string]: { name?: string; color?: string; symbol?: string } };
  myUid?: string;
}

export default function ConnectFour({
  board,
  winningCells,
  isMyTurn,
  onDropColumn,
  disabled
}: ConnectFourProps) {
  const COLS = 7;
  const ROWS = 6;

  // Determine if a column has space available (top cell in that column is null)
  const isColAvailable = (c: number) => board[0 * COLS + c] === null;

  return (
    <div className="c4-container" role="grid" aria-label="Connect Four board">
      {/* Drop column action triggers */}
      <div className="c4-drop-row">
        {Array.from({ length: COLS }).map((_, c) => {
          const canDrop = isMyTurn && !disabled && isColAvailable(c);
          return (
            <button
              key={`drop-btn-${c}`}
              className="c4-drop-btn"
              onClick={() => canDrop && onDropColumn(c)}
              disabled={!canDrop}
              title={`Drop in column ${c + 1}`}
              aria-label={`Drop piece in column ${c + 1}`}
              type="button"
            >
              ▼
            </button>
          );
        })}
      </div>

      {/* 6x7 Grid */}
      <div className="c4-grid">
        {Array.from({ length: ROWS }).map((_, r) => (
          <div key={`c4-row-${r}`} className="c4-row">
            {Array.from({ length: COLS }).map((_, c) => {
              const cellIdx = r * COLS + c;
              const val = board[cellIdx];
              const isWinning = winningCells && winningCells.includes(cellIdx);
              const isP1 = val === 'X';
              const isP2 = val === 'O';

              return (
                <div
                  key={`c4-cell-${cellIdx}`}
                  className={`c4-slot ${isWinning ? 'is-winning' : ''}`}
                  onClick={() => {
                    if (isMyTurn && !disabled && isColAvailable(c)) {
                      onDropColumn(c);
                    }
                  }}
                >
                  <div
                    className={`c4-chip ${isP1 ? 'chip-p1' : isP2 ? 'chip-p2' : ''} ${isWinning ? 'is-winning' : ''}`}
                  />
                </div>
              );
            })}
          </div>
        ))}
      </div>
    </div>
  );
}
