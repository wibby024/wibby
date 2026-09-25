import { useState, useEffect } from 'react';
import type { Socket } from 'socket.io-client';
import type { GameState, GameType } from '../../types/chat';
import TicTacToe from './TicTacToe';
import DotsAndBoxes from './DotsAndBoxes';
import WordImposter from './WordImposter';
import ConnectFour from './ConnectFour';
import RockPaperScissors from './RockPaperScissors';
import MemoryMatch from './MemoryMatch';
import Gomoku from './Gomoku';
import Checkers from './Checkers';
import Battleship from './Battleship';
import Reversi from './Reversi';
import './MiniGameModal.css';

interface MiniGameModalProps {
  isOpen: boolean;
  onClose: () => void;
  conversationId: string;
  socket: Socket | null;
  currentUserId: string;
  partnerName?: string;
}

export default function MiniGameModal({
  isOpen,
  onClose,
  conversationId,
  socket,
  currentUserId,
  partnerName = 'Partner'
}: MiniGameModalProps) {
  const [gameState, setGameState] = useState<GameState | null>(null);

  // Sync game state from socket
  useEffect(() => {
    if (!socket || !conversationId) return;

    // Request active game state on mount / open
    socket.emit('game:get-state', { conversationId });

    const handleGameState = (state: GameState) => {
      if (state.conversationId === conversationId) {
        setGameState(state);
      }
    };

    const handleGameEnded = (data: { conversationId: string }) => {
      if (data.conversationId === conversationId) {
        setGameState(null);
      }
    };

    socket.on('game:state', handleGameState);
    socket.on('game:ended', handleGameEnded);

    return () => {
      socket.off('game:state', handleGameState);
      socket.off('game:ended', handleGameEnded);
    };
  }, [socket, conversationId]);

  if (!isOpen) return null;

  const handleStartGame = (gameType: GameType) => {
    if (!socket) return;
    socket.emit('game:invite', {
      conversationId,
      gameType
    });
  };

  const handleAcceptInvite = () => {
    if (!socket || !gameState) return;
    socket.emit('game:accept', {
      conversationId,
      gameId: gameState.gameId
    });
  };

  const handleDeclineInvite = () => {
    if (!socket || !gameState) return;
    socket.emit('game:decline', {
      conversationId,
      gameId: gameState.gameId
    });
    setGameState(null);
  };

  const handleResetGame = () => {
    if (!socket || !gameState) return;
    socket.emit('game:reset', {
      conversationId,
      gameId: gameState.gameId
    });
  };

  const handleCloseGame = () => {
    if (socket && gameState) {
      socket.emit('game:close', {
        conversationId,
        gameId: gameState.gameId
      });
    }
    setGameState(null);
    onClose();
  };

  const handleMove = (moveData: any) => {
    if (!socket || !gameState) return;
    socket.emit('game:move', {
      conversationId,
      gameId: gameState.gameId,
      move: moveData
    });
  };

  const isMyTurn = gameState ? gameState.currentTurn === currentUserId : false;
  const isHost = gameState ? gameState.playerOrder[0] === currentUserId : false;
  const partnerUid = gameState?.playerOrder.find(id => id !== currentUserId) || '';
  const myScore = gameState?.scores[currentUserId] || 0;
  const partnerScore = gameState?.scores[partnerUid] || 0;

  const getGameTitle = (type?: GameType) => {
    const t = type || gameState?.gameType;
    switch (t) {
      case 'tictactoe':
        return 'Tic-Tac-Toe';
      case 'dotsandboxes':
        return 'Dots & Boxes';
      case 'wordimposter':
        return 'Word Imposter';
      case 'connectfour':
        return 'Connect Four';
      case 'rockpaperscissors':
        return 'Rock Paper Scissors';
      case 'memorymatch':
        return 'Memory Match';
      case 'gomoku':
        return 'Gomoku (5-in-a-Row)';
      case 'checkers':
        return 'Checkers';
      case 'battleship':
        return 'Battleship';
      case 'reversi':
        return 'Reversi (Othello)';
      default:
        return 'Mini Games';
    }
  };

  // Render Game Content
  const renderGameBody = () => {
    if (!gameState) {
      return (
        <div className="game-picker-container">
          <h3 className="game-picker-title">Choose a Game to Play</h3>
          <div className="game-picker-grid">
            <button
              className="game-option-btn"
              onClick={() => handleStartGame('tictactoe')}
              type="button"
            >
              <div className="game-option-icon">⭕</div>
              <div className="game-option-info">
                <div className="game-option-name">Tic-Tac-Toe</div>
                <div className="game-option-desc">Classic 3x3 strategy duel</div>
              </div>
            </button>

            <button
              className="game-option-btn"
              onClick={() => handleStartGame('dotsandboxes')}
              type="button"
            >
              <div className="game-option-icon">⚄</div>
              <div className="game-option-info">
                <div className="game-option-name">Dots & Boxes</div>
                <div className="game-option-desc">Connect lines and capture squares</div>
              </div>
            </button>

            <button
              className="game-option-btn"
              onClick={() => handleStartGame('wordimposter')}
              type="button"
            >
              <div className="game-option-icon">🕵️</div>
              <div className="game-option-info">
                <div className="game-option-name">Word Imposter</div>
                <div className="game-option-desc">Crack the mystery word before 6 turns</div>
              </div>
            </button>

            <button
              className="game-option-btn"
              onClick={() => handleStartGame('connectfour')}
              type="button"
            >
              <div className="game-option-icon">🔴</div>
              <div className="game-option-info">
                <div className="game-option-name">Connect Four</div>
                <div className="game-option-desc">Drop chips and align 4 in a row</div>
              </div>
            </button>

            <button
              className="game-option-btn"
              onClick={() => handleStartGame('rockpaperscissors')}
              type="button"
            >
              <div className="game-option-icon">✊</div>
              <div className="game-option-info">
                <div className="game-option-name">Rock Paper Scissors</div>
                <div className="game-option-desc">Fast-paced duel, first to 3 wins</div>
              </div>
            </button>

            <button
              className="game-option-btn"
              onClick={() => handleStartGame('memorymatch')}
              type="button"
            >
              <div className="game-option-icon">🎴</div>
              <div className="game-option-info">
                <div className="game-option-name">Memory Match</div>
                <div className="game-option-desc">Flip cards and match emoji pairs</div>
              </div>
            </button>

            <button
              className="game-option-btn"
              onClick={() => handleStartGame('gomoku')}
              type="button"
            >
              <div className="game-option-icon">⚫</div>
              <div className="game-option-info">
                <div className="game-option-name">Gomoku</div>
                <div className="game-option-desc">Align 5 stones on a 9x9 grid</div>
              </div>
            </button>

            <button
              className="game-option-btn"
              onClick={() => handleStartGame('checkers')}
              type="button"
            >
              <div className="game-option-icon">🏁</div>
              <div className="game-option-info">
                <div className="game-option-name">Checkers</div>
                <div className="game-option-desc">Jump opponent pieces & become King</div>
              </div>
            </button>

            <button
              className="game-option-btn"
              onClick={() => handleStartGame('battleship')}
              type="button"
            >
              <div className="game-option-icon">🚢</div>
              <div className="game-option-info">
                <div className="game-option-name">Battleship</div>
                <div className="game-option-desc">Radar coordinates & sink the fleet</div>
              </div>
            </button>

            <button
              className="game-option-btn"
              onClick={() => handleStartGame('reversi')}
              type="button"
            >
              <div className="game-option-icon">☯️</div>
              <div className="game-option-info">
                <div className="game-option-name">Reversi (Othello)</div>
                <div className="game-option-desc">Flank and flip disks to dominate</div>
              </div>
            </button>
          </div>
        </div>
      );
    }

    // Waiting for partner response
    if (gameState.status === 'waiting') {
      const title = getGameTitle(gameState.gameType);
      if (isHost) {
        return (
          <div className="game-invite-card">
            <div className="game-invite-badge">⏳</div>
            <h4 className="game-invite-title">Invitation Sent!</h4>
            <p className="game-invite-desc">
              Waiting for {partnerName} to accept your invitation to play{' '}
              <strong>{title}</strong>...
            </p>
            <div className="game-invite-actions">
              <button className="game-btn secondary" onClick={handleCloseGame} type="button">
                Cancel
              </button>
            </div>
          </div>
        );
      } else {
        return (
          <div className="game-invite-card">
            <div className="game-invite-badge">🎮</div>
            <h4 className="game-invite-title">{partnerName} Challenged You!</h4>
            <p className="game-invite-desc">
              Do you want to play a round of <strong>{title}</strong>?
            </p>
            <div className="game-invite-actions">
              <button className="game-btn secondary" onClick={handleDeclineInvite} type="button">
                Decline
              </button>
              <button className="game-btn primary" onClick={handleAcceptInvite} type="button">
                Accept & Play
              </button>
            </div>
          </div>
        );
      }
    }

    // Finished: Won / Draw
    if (gameState.status === 'won' || gameState.status === 'draw') {
      const didIWin = gameState.winnerId === currentUserId;
      const isDraw = gameState.status === 'draw';

      return (
        <div className="game-result-overlay">
          <div className="game-result-icon">
            {isDraw ? '🤝' : didIWin ? '🏆' : '👏'}
          </div>
          <h3 className="game-result-title">
            {isDraw ? "It's a Draw!" : didIWin ? 'You Won!' : `${partnerName} Won!`}
          </h3>
          <p className="game-result-sub">
            {isDraw
              ? 'Evenly matched game!'
              : didIWin
              ? 'Great moves! Score updated.'
              : 'Nice try! Ready for a rematch?'}
          </p>

          <div className="game-result-actions">
            <button className="game-btn secondary" onClick={handleCloseGame} type="button">
              Close
            </button>
            <button className="game-btn primary" onClick={handleResetGame} type="button">
              Play Again
            </button>
          </div>
        </div>
      );
    }

    // Active Game in Progress
    if (gameState.gameType === 'tictactoe') {
      return (
        <TicTacToe
          board={gameState.stateData.board}
          winningLine={gameState.stateData.winningLine}
          isMyTurn={isMyTurn}
          mySymbol={gameState.players[currentUserId]?.symbol || 'X'}
          onCellClick={index => handleMove({ cellIndex: index })}
          disabled={!isMyTurn}
        />
      );
    }

    if (gameState.gameType === 'dotsandboxes') {
      return (
        <DotsAndBoxes
          lines={gameState.stateData.lines}
          boxes={gameState.stateData.boxes}
          players={gameState.players}
          myUid={currentUserId}
          isMyTurn={isMyTurn}
          onLineClick={lineKey => handleMove({ lineKey })}
          disabled={!isMyTurn}
        />
      );
    }

    if (gameState.gameType === 'wordimposter') {
      return (
        <WordImposter
          category={gameState.stateData.category}
          revealedMask={gameState.stateData.revealedMask}
          guessedLetters={gameState.stateData.guessedLetters}
          wrongGuesses={gameState.stateData.wrongGuesses}
          maxWrong={gameState.stateData.maxWrong}
          isMyTurn={isMyTurn}
          onGuessLetter={letter => handleMove({ letter })}
          onGuessWord={fullGuess => handleMove({ fullGuess })}
          disabled={!isMyTurn}
        />
      );
    }

    if (gameState.gameType === 'connectfour') {
      return (
        <ConnectFour
          board={gameState.stateData.board}
          winningCells={gameState.stateData.winningCells}
          isMyTurn={isMyTurn}
          mySymbol={gameState.players[currentUserId]?.symbol || 'X'}
          players={gameState.players}
          myUid={currentUserId}
          onDropColumn={col => handleMove({ col })}
          disabled={!isMyTurn}
        />
      );
    }

    if (gameState.gameType === 'rockpaperscissors') {
      return (
        <RockPaperScissors
          playerChoices={gameState.stateData.playerChoices || {}}
          roundScores={gameState.stateData.roundScores || {}}
          roundNumber={gameState.stateData.roundNumber || 1}
          targetWins={gameState.stateData.targetWins || 3}
          lastRoundResult={gameState.stateData.lastRoundResult || null}
          myUid={currentUserId}
          partnerUid={partnerUid}
          partnerName={partnerName}
          onChoice={choice => handleMove({ choice })}
          disabled={false}
        />
      );
    }

    if (gameState.gameType === 'memorymatch') {
      return (
        <MemoryMatch
          cards={gameState.stateData.cards || []}
          flippedIndices={gameState.stateData.flippedIndices || []}
          matchedIndices={gameState.stateData.matchedIndices || []}
          lastMismatch={gameState.stateData.lastMismatch || null}
          playerScores={gameState.stateData.playerScores || {}}
          myUid={currentUserId}
          partnerUid={partnerUid}
          partnerName={partnerName}
          isMyTurn={isMyTurn}
          onCardClick={cardIndex => handleMove({ cardIndex })}
          disabled={!isMyTurn}
        />
      );
    }

    if (gameState.gameType === 'gomoku') {
      return (
        <Gomoku
          board={gameState.stateData.board || []}
          winningLine={gameState.stateData.winningLine || null}
          isMyTurn={isMyTurn}
          mySymbol={gameState.players[currentUserId]?.symbol || 'X'}
          onCellClick={cellIndex => handleMove({ cellIndex })}
          disabled={!isMyTurn}
        />
      );
    }

    if (gameState.gameType === 'checkers') {
      return (
        <Checkers
          board={gameState.stateData.board || []}
          isHost={isHost}
          isMyTurn={isMyTurn}
          captured={gameState.stateData.captured}
          myUid={currentUserId}
          partnerUid={partnerUid}
          partnerName={partnerName}
          onMove={(from, to) => handleMove({ from, to })}
          disabled={!isMyTurn}
        />
      );
    }

    if (gameState.gameType === 'battleship') {
      return (
        <Battleship
          ships={gameState.stateData.ships || {}}
          shots={gameState.stateData.shots || {}}
          hitsCount={gameState.stateData.hitsCount || {}}
          totalTargetHits={gameState.stateData.totalTargetHits || 7}
          myUid={currentUserId}
          partnerUid={partnerUid}
          partnerName={partnerName}
          isMyTurn={isMyTurn}
          onFire={targetCell => handleMove({ targetCell })}
          disabled={!isMyTurn}
        />
      );
    }

    if (gameState.gameType === 'reversi') {
      return (
        <Reversi
          board={gameState.stateData.board || []}
          counts={gameState.stateData.counts}
          isHost={isHost}
          isMyTurn={isMyTurn}
          myUid={currentUserId}
          partnerUid={partnerUid}
          partnerName={partnerName}
          onPlaceDisk={cellIndex => handleMove({ cellIndex })}
          disabled={!isMyTurn}
        />
      );
    }

    return null;
  };

  return (
    <div className="game-modal-overlay" role="dialog" aria-modal="true" aria-label="Mini Games">
      <div className="game-modal-card">
        {/* Header */}
        <div className="game-modal-header">
          <div className="game-title-wrap">
            <span className="game-header-icon">🎮</span>
            <h2 className="game-title">{getGameTitle()}</h2>
          </div>
          <div className="game-header-actions">
            <button
              className="game-icon-btn"
              onClick={handleCloseGame}
              aria-label="Close game"
              title="Close"
              type="button"
            >
              ✕
            </button>
          </div>
        </div>

        {/* Scoreboard if game active */}
        {gameState && (
          <div className="game-scoreboard">
            <div className={`player-score-card ${isMyTurn ? 'active-turn' : ''}`}>
              <div className="player-score-avatar" style={{ background: '#7C3AED' }}>
                You
              </div>
              <div className="player-score-meta">
                <span className="player-score-name">You</span>
                <span className="player-score-num">{myScore}</span>
              </div>
            </div>

            <span className="scoreboard-vs">VS</span>

            <div className={`player-score-card ${!isMyTurn && gameState.status === 'in_progress' ? 'active-turn' : ''}`}>
              <div className="player-score-avatar" style={{ background: '#10B981' }}>
                {partnerName.charAt(0).toUpperCase()}
              </div>
              <div className="player-score-meta">
                <span className="player-score-name">{partnerName}</span>
                <span className="player-score-num">{partnerScore}</span>
              </div>
            </div>
          </div>
        )}

        {/* Turn indicator */}
        {gameState && gameState.status === 'in_progress' && (
          <div className={`game-turn-banner ${isMyTurn ? 'is-me' : ''}`}>
            {gameState.gameType === 'rockpaperscissors'
              ? '⚡ Choose your move simultaneously!'
              : isMyTurn
              ? "👉 It's your turn!"
              : `⏳ Waiting for ${partnerName}...`}
          </div>
        )}

        {/* Body */}
        <div className="game-modal-body">{renderGameBody()}</div>
      </div>
    </div>
  );
}
