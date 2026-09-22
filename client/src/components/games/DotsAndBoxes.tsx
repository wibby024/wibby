
interface DotsAndBoxesProps {
  lines: { [key: string]: string };
  boxes: Array<{ row: number; col: number; owner: string | null }>;
  players: { [uid: string]: { name?: string; color?: string; symbol?: string } };
  myUid: string;
  isMyTurn: boolean;
  onLineClick: (lineKey: string) => void;
  disabled: boolean;
}

// 3×3 box grid = 4×4 dots
// Horizontal lines: h_row_col  row ∈ [0..3], col ∈ [0..2]  → 12 lines
// Vertical lines:   v_row_col  row ∈ [0..2], col ∈ [0..3]  → 12 lines
const BOX_COLS = 3; // number of boxes per row
const BOX_ROWS = 3; // number of boxes per column

export default function DotsAndBoxes({
  lines,
  boxes,
  players,
  myUid,
  isMyTurn,
  onLineClick,
  disabled
}: DotsAndBoxesProps) {
  const getLineColor = (ownerUid?: string) => {
    if (!ownerUid) return undefined;
    return players[ownerUid]?.color || (ownerUid === myUid ? '#7C3AED' : '#10B981');
  };

  // Horizontal row: dots interleaved with horizontal lines
  const renderHorizontalRow = (rowIndex: number) => {
    const cells = [];
    for (let col = 0; col < BOX_COLS; col++) {
      const key = `h_${rowIndex}_${col}`;
      cells.push(<div className="dnb-dot" key={`dot-h-${rowIndex}-${col}`} />);
      cells.push(
        <div
          key={key}
          className={`dnb-line-h ${lines[key] ? 'claimed' : ''}`}
          style={lines[key] ? ({ '--line-color': getLineColor(lines[key]) } as any) : undefined}
          onClick={() => isMyTurn && !lines[key] && !disabled && onLineClick(key)}
        />
      );
    }
    // Trailing dot
    cells.push(<div className="dnb-dot" key={`dot-h-${rowIndex}-end`} />);

    return (
      <div className="dnb-row" key={`h-row-${rowIndex}`}>
        {cells}
      </div>
    );
  };

  // Vertical row: vertical lines interleaved with boxes
  const renderVerticalRow = (rowIndex: number) => {
    const cells = [];
    for (let col = 0; col < BOX_COLS; col++) {
      const vKey = `v_${rowIndex}_${col}`;
      const box = boxes.find(b => b.row === rowIndex && b.col === col);

      cells.push(
        <div
          key={vKey}
          className={`dnb-line-v ${lines[vKey] ? 'claimed' : ''}`}
          style={lines[vKey] ? ({ '--line-color': getLineColor(lines[vKey]) } as any) : undefined}
          onClick={() => isMyTurn && !lines[vKey] && !disabled && onLineClick(vKey)}
        />
      );

      cells.push(
        <div
          key={`box-${rowIndex}-${col}`}
          className={`dnb-box ${box?.owner ? 'claimed' : ''}`}
          style={
            box?.owner
              ? ({
                  '--box-bg': `${getLineColor(box.owner)}26`,
                  '--box-color': getLineColor(box.owner)
                } as any)
              : undefined
          }
        >
          {box?.owner ? (box.owner === myUid ? '★' : '◆') : ''}
        </div>
      );
    }
    // Trailing vertical line
    const vKeyEnd = `v_${rowIndex}_${BOX_COLS}`;
    cells.push(
      <div
        key={vKeyEnd}
        className={`dnb-line-v ${lines[vKeyEnd] ? 'claimed' : ''}`}
        style={lines[vKeyEnd] ? ({ '--line-color': getLineColor(lines[vKeyEnd]) } as any) : undefined}
        onClick={() => isMyTurn && !lines[vKeyEnd] && !disabled && onLineClick(vKeyEnd)}
      />
    );

    return (
      <div className="dnb-row" key={`v-row-${rowIndex}`}>
        {cells}
      </div>
    );
  };

  // Build all rows: alternating horizontal rows and vertical rows
  const rows = [];
  for (let r = 0; r <= BOX_ROWS; r++) {
    rows.push(renderHorizontalRow(r));
    if (r < BOX_ROWS) {
      rows.push(renderVerticalRow(r));
    }
  }

  return (
    <div className="dnb-board" role="grid" aria-label="Dots and Boxes board">
      {rows}
    </div>
  );
}
