import { useState } from 'react';

interface CheckersProps {
  board: (string | null)[];
  isHost: boolean;
  isMyTurn: boolean;
  captured?: { [uid: string]: number };
  myUid: string;
  partnerUid: string;
  partnerName: string;
  onMove: (from: number, to: number) => void;
  disabled: boolean;
}

export default function Checkers({
  board,
  isHost,
  isMyTurn,
  captured,
  myUid,
  partnerUid,
  partnerName,
  onMove,
  disabled
}: CheckersProps) {
  const [selectedCell, setSelectedCell] = useState<number | null>(null);

  const myCaptured = captured ? captured[myUid] || 0 : 0;
  const partnerCaptured = captured ? captured[partnerUid] || 0 : 0;

  const isMyPiece = (piece: string | null) => {
    if (!piece) return false;
    return isHost ? piece === 'r' || piece === 'R' : piece === 'b' || piece === 'B';
  };

  const handleCellClick = (index: number) => {
    if (!isMyTurn || disabled) return;

    const piece = board[index];

    // If clicking one of your own pieces, select it
    if (isMyPiece(piece)) {
      setSelectedCell(index === selectedCell ? null : index);
      return;
    }

    // If a piece is already selected, try to move to this cell
    if (selectedCell !== null) {
      if (piece === null) {
        onMove(selectedCell, index);
        setSelectedCell(null);
      }
    }
  };

  return (
    <div className="checkers-container" aria-label="Checkers 6x6 board">
      {/* Captured counters */}
      <div className="checkers-meta">
        <div className="checkers-cap-pill">
          Captured: <strong>{myCaptured}</strong>
        </div>
        <div className="checkers-cap-pill">
          {partnerName} Captured: <strong>{partnerCaptured}</strong>
        </div>
      </div>

      {/* 6x6 Board */}
      <div className="checkers-grid">
        {Array.from({ length: 36 }).map((_, index) => {
          const r = Math.floor(index / 6);
          const c = index % 6;
          const isDark = (r + c) % 2 === 1;
          const piece = board[index];
          const isSelected = selectedCell === index;
          const isMine = isMyPiece(piece);
          const isKing = piece === 'R' || piece === 'B';
          const isHostPiece = piece === 'r' || piece === 'R';

          return (
            <div
              key={`checker-sq-${index}`}
              className={`checkers-square ${isDark ? 'sq-dark' : 'sq-light'} ${isSelected ? 'is-selected' : ''}`}
              onClick={() => handleCellClick(index)}
            >
              {piece && (
                <div
                  className={`checkers-piece ${isHostPiece ? 'piece-host' : 'piece-partner'} ${isKing ? 'is-king' : ''} ${isMine && isMyTurn ? 'can-move' : ''}`}
                >
                  {isKing ? '👑' : ''}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
