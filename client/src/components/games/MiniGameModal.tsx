import { useState, useEffect } from 'react';
import type { Socket } from 'socket.io-client';
import type { GameState, GameType } from '../../types/chat';
import TicTacToe from './TicTacToe';
import DotsAndBoxes from './DotsAndBoxes';
import WordImposter from './WordImposter';
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
                <div className="game-option-desc">Connect lines and capture the most squares</div>
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
                <div className="game-option-desc">Crack the mystery word before 6 wrong turns</div>
              </div>
            </button>
          </div>
        </div>
      );
    }

    // Waiting for partner response
    if (gameState.status === 'waiting') {
      if (isHost) {
        return (
          <div className="game-invite-card">
            <div className="game-invite-badge">⏳</div>
            <h4 className="game-invite-title">Invitation Sent!</h4>
            <p className="game-invite-desc">
              Waiting for {partnerName} to accept your invitation to play{' '}
              <strong>
                {gameState.gameType === 'tictactoe'
                  ? 'Tic-Tac-Toe'
                  : gameState.gameType === 'dotsandboxes'
                  ? 'Dots & Boxes'
                  : 'Word Imposter'}
              </strong>
              ...
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
              Do you want to play a round of{' '}
              <strong>
                {gameState.gameType === 'tictactoe'
                  ? 'Tic-Tac-Toe'
                  : gameState.gameType === 'dotsandboxes'
                  ? 'Dots & Boxes'
                  : 'Word Imposter'}
              </strong>
              ?
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

    return null;
  };

  const getGameTitle = () => {
    if (!gameState) return 'Mini Games';
    if (gameState.gameType === 'tictactoe') return 'Tic-Tac-Toe';
    if (gameState.gameType === 'dotsandboxes') return 'Dots & Boxes';
    if (gameState.gameType === 'wordimposter') return 'Word Imposter';
    return 'Mini Games';
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
            {isMyTurn ? "👉 It's your turn!" : `⏳ Waiting for ${partnerName}...`}
          </div>
        )}

        {/* Body */}
        <div className="game-modal-body">{renderGameBody()}</div>
      </div>
    </div>
  );
}
