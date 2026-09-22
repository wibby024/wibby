interface TicTacToeProps {
  board: (string | null)[];
  winningLine: number[] | null;
  isMyTurn: boolean;
  mySymbol?: string;
  onCellClick: (index: number) => void;
  disabled: boolean;
}

export default function TicTacToe({
  board,
  winningLine,
  isMyTurn,
  mySymbol: _mySymbol,
  onCellClick,
  disabled
}: TicTacToeProps) {
  return (
    <div className="ttt-board" role="grid" aria-label="Tic Tac Toe board">
      {board.map((cell, index) => {
        const isWinningCell = winningLine && winningLine.includes(index);
        const canClick = isMyTurn && !cell && !disabled;

        return (
          <button
            key={index}
            className={`ttt-cell ${cell === 'X' ? 'is-x' : cell === 'O' ? 'is-o' : ''} ${isWinningCell ? 'is-winning' : ''}`}
            onClick={() => canClick && onCellClick(index)}
            disabled={!canClick}
            aria-label={`Cell ${index + 1}: ${cell || 'empty'}`}
            type="button"
          >
            {cell}
          </button>
        );
      })}
    </div>
  );
}
