interface GomokuProps {
  board: (string | null)[];
  winningLine: number[] | null;
  isMyTurn: boolean;
  mySymbol?: string;
  onCellClick: (index: number) => void;
  disabled: boolean;
}

export default function Gomoku({
  board,
  winningLine,
  isMyTurn,
  mySymbol = 'X',
  onCellClick,
  disabled
}: GomokuProps) {
  const GRID_SIZE = 9;

  return (
    <div className="gomoku-container" role="grid" aria-label="Gomoku 9x9 board">
      <div className="gomoku-grid">
        {Array.from({ length: GRID_SIZE * GRID_SIZE }).map((_, index) => {
          const val = board[index];
          const isWinning = winningLine && winningLine.includes(index);
          const canClick = isMyTurn && !val && !disabled;

          return (
            <button
              key={`gomoku-${index}`}
              className={`gomoku-cell ${val ? 'has-stone' : ''} ${isWinning ? 'is-winning' : ''}`}
              onClick={() => canClick && onCellClick(index)}
              disabled={!canClick}
              type="button"
              aria-label={`Intersection ${index + 1}: ${val || 'empty'}`}
            >
              {val && (
                <div
                  className={`gomoku-stone ${val === 'X' ? 'stone-black' : 'stone-white'} ${isWinning ? 'is-winning' : ''}`}
                >
                  {val === mySymbol ? '●' : '○'}
                </div>
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
}
