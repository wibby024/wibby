interface BattleshipProps {
  ships: { [uid: string]: number[] };
  shots: { [uid: string]: { [cellIndex: number]: 'hit' | 'miss' } };
  hitsCount: { [uid: string]: number };
  totalTargetHits: number;
  myUid: string;
  partnerUid: string;
  partnerName: string;
  isMyTurn: boolean;
  onFire: (targetCell: number) => void;
  disabled: boolean;
}

export default function Battleship({
  ships,
  shots,
  hitsCount,
  totalTargetHits = 7,
  myUid,
  partnerUid,
  partnerName,
  isMyTurn,
  onFire,
  disabled
}: BattleshipProps) {
  const myShots = shots[myUid] || {};
  const partnerShots = shots[partnerUid] || {};
  const myFleetCells = ships[myUid] || [];
  const myHits = hitsCount[myUid] || 0;
  const partnerHits = hitsCount[partnerUid] || 0;

  return (
    <div className="battleship-container" aria-label="Battleship game">
      {/* Fleet Damage Status */}
      <div className="bs-status-bar">
        <div className="bs-stat-pill">
          <span>Enemy Hits:</span>
          <strong>{myHits} / {totalTargetHits}</strong>
        </div>
        <div className="bs-stat-pill">
          <span>{partnerName}&apos;s Hits:</span>
          <strong>{partnerHits} / {totalTargetHits}</strong>
        </div>
      </div>

      {/* Target Radar (Where you shoot) */}
      <div className="bs-section">
        <div className="bs-section-title">🎯 Strike Radar ({partnerName}&apos;s Waters)</div>
        <div className="bs-grid bs-target-grid">
          {Array.from({ length: 25 }).map((_, index) => {
            const shot = myShots[index];
            const canShoot = isMyTurn && !shot && !disabled;

            return (
              <button
                key={`target-${index}`}
                className={`bs-cell bs-radar-cell ${shot === 'hit' ? 'cell-hit' : shot === 'miss' ? 'cell-miss' : ''}`}
                onClick={() => canShoot && onFire(index)}
                disabled={!canShoot}
                type="button"
                aria-label={`Sector ${index + 1}: ${shot || 'Uncharted'}`}
              >
                {shot === 'hit' ? '💥' : shot === 'miss' ? '🌊' : '•'}
              </button>
            );
          })}
        </div>
      </div>

      {/* Your Fleet Preview (Mini) */}
      <div className="bs-section bs-defend-section">
        <div className="bs-section-title">🛡️ Your Fleet Status</div>
        <div className="bs-grid bs-mini-grid">
          {Array.from({ length: 25 }).map((_, index) => {
            const hasShip = myFleetCells.includes(index);
            const struck = partnerShots[index];

            return (
              <div
                key={`my-ship-${index}`}
                className={`bs-mini-cell ${hasShip ? 'has-ship' : ''} ${struck === 'hit' ? 'ship-damaged' : struck === 'miss' ? 'splash' : ''}`}
                title={hasShip ? (struck === 'hit' ? 'Ship Damaged!' : 'Your Ship') : 'Water'}
              >
                {hasShip ? (struck === 'hit' ? '🔥' : '⚓') : struck === 'miss' ? '·' : ''}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
