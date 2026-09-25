import { Server as SocketIOServer, Socket } from 'socket.io';
import { ObjectId } from 'mongodb';
import { getDb } from '../lib/mongodb.js';
import crypto from 'crypto';
import {
  GameType,
  initGameData,
  checkTicTacToeWin,
  handleConnectFourDrop,
  checkGomokuWin,
  getReversiFlips,
  hasValidReversiMoves
} from './gameLogic.js';

export interface GameState {
  gameId: string;
  conversationId: string;
  gameType: GameType;
  players: { [uid: string]: { name?: string; symbol?: string; color?: string } };
  playerOrder: string[];
  currentTurn: string;
  status: 'waiting' | 'in_progress' | 'won' | 'draw' | 'declined' | 'ended';
  winnerId?: string | null;
  scores: { [uid: string]: number };
  stateData: any;
  updatedAt: string;
}

const activeGames = new Map<string, GameState>();

// Dots and Boxes box completion check for 3x3 grid (9 boxes)
function checkBoxesCompleted(lines: { [key: string]: string }, boxes: any[], claimerUid: string): number {
  let newlyCompleted = 0;
  for (let row = 0; row < 3; row++) {
    for (let col = 0; col < 3; col++) {
      const boxIndex = row * 3 + col;
      if (!boxes[boxIndex].owner) {
        const top    = `h_${row}_${col}`;
        const bottom = `h_${row + 1}_${col}`;
        const left   = `v_${row}_${col}`;
        const right  = `v_${row}_${col + 1}`;
        if (lines[top] && lines[bottom] && lines[left] && lines[right]) {
          boxes[boxIndex].owner = claimerUid;
          newlyCompleted++;
        }
      }
    }
  }
  return newlyCompleted;
}

export function registerGameHandlers(
  io: SocketIOServer,
  socket: Socket,
  _userSockets: Map<string, Set<string>>
) {
  const uid = socket.data.uid;

  // 1. Send Game Invitation
  socket.on('game:invite', async (data: {
    conversationId: string;
    gameType: GameType;
    partnerUid?: string;
    customWord?: string;
    category?: string;
  }) => {
    try {
      if (!data?.conversationId || !data?.gameType) return;

      const db = getDb();
      const conversation = await db.collection('conversations').findOne({
        _id: new ObjectId(data.conversationId)
      });
      if (!conversation || !conversation.members.includes(uid)) return;

      const partnerUid = conversation.members.find((m: string) => m !== uid);
      if (!partnerUid) return;

      // Existing scores across session if already played
      const prevGame = activeGames.get(data.conversationId);
      const scores = prevGame ? { ...prevGame.scores } : { [uid]: 0, [partnerUid]: 0 };
      if (scores[uid] === undefined) scores[uid] = 0;
      if (scores[partnerUid] === undefined) scores[partnerUid] = 0;

      const gameId = crypto.randomUUID();
      const stateData = initGameData(data.gameType, uid, partnerUid);

      if (data.gameType === 'wordimposter' && data.customWord) {
        const cleanWord = data.customWord.trim().toUpperCase().replace(/[^A-Z]/g, '');
        if (cleanWord.length >= 3) {
          stateData.word = cleanWord;
          stateData.category = data.category || 'Custom Mystery';
          stateData.revealedMask = cleanWord.split('').map(() => '_').join(' ');
        }
      }

      // Dynamic symbols based on game type
      const p1Symbol = data.gameType === 'reversi' ? 'B' : 'X';
      const p2Symbol = data.gameType === 'reversi' ? 'W' : 'O';

      const gameState: GameState = {
        gameId,
        conversationId: data.conversationId,
        gameType: data.gameType,
        players: {
          [uid]: { symbol: p1Symbol, color: '#7C3AED', name: 'Host' },
          [partnerUid]: { symbol: p2Symbol, color: '#10B981', name: 'Partner' }
        },
        playerOrder: [uid, partnerUid],
        currentTurn: uid,
        status: 'waiting',
        winnerId: null,
        scores,
        stateData,
        updatedAt: new Date().toISOString()
      };

      activeGames.set(data.conversationId, gameState);

      // Broadcast to room
      io.to(`conversation:${data.conversationId}`).emit('game:state', gameState);
      io.to(`conversation:${data.conversationId}`).emit('game:invited', {
        gameId,
        gameType: data.gameType,
        senderUid: uid
      });
    } catch (err) {
      console.error('game:invite error:', err);
    }
  });

  // 2. Accept Invitation
  socket.on('game:accept', (data: { conversationId: string; gameId: string }) => {
    try {
      if (!data?.conversationId) return;
      const game = activeGames.get(data.conversationId);
      if (!game || game.gameId !== data.gameId) return;

      game.status = 'in_progress';
      game.updatedAt = new Date().toISOString();
      io.to(`conversation:${data.conversationId}`).emit('game:state', game);
    } catch (err) {
      console.error('game:accept error:', err);
    }
  });

  // 3. Decline Invitation
  socket.on('game:decline', (data: { conversationId: string; gameId: string }) => {
    try {
      if (!data?.conversationId) return;
      const game = activeGames.get(data.conversationId);
      if (!game || game.gameId !== data.gameId) return;

      game.status = 'declined';
      game.updatedAt = new Date().toISOString();
      io.to(`conversation:${data.conversationId}`).emit('game:state', game);
      activeGames.delete(data.conversationId);
    } catch (err) {
      console.error('game:decline error:', err);
    }
  });

  // 4. Game Move
  socket.on('game:move', (data: { conversationId: string; gameId: string; move: any }) => {
    try {
      if (!data?.conversationId) return;
      const game = activeGames.get(data.conversationId);
      if (!game || game.gameId !== data.gameId || game.status !== 'in_progress') return;

      const partnerUid = game.playerOrder.find(id => id !== uid) || uid;
      const isHost = game.playerOrder[0] === uid;

      // Special case: Rock Paper Scissors allows simultaneous choice from either player
      if (game.gameType === 'rockpaperscissors') {
        const { choice } = data.move;
        if (!['rock', 'paper', 'scissors'].includes(choice)) return;

        game.stateData.playerChoices[uid] = choice;

        // Check if both players picked
        const p1 = game.playerOrder[0];
        const p2 = game.playerOrder[1];
        const c1 = game.stateData.playerChoices[p1];
        const c2 = game.stateData.playerChoices[p2];

        if (c1 && c2) {
          let roundWinner: string | null = null;
          let summary = '';

          if (c1 === c2) {
            summary = `Both played ${c1}! It's a draw!`;
          } else if (
            (c1 === 'rock' && c2 === 'scissors') ||
            (c1 === 'paper' && c2 === 'rock') ||
            (c1 === 'scissors' && c2 === 'paper')
          ) {
            roundWinner = p1;
            game.stateData.roundScores[p1] = (game.stateData.roundScores[p1] || 0) + 1;
            summary = `${c1} beats ${c2}!`;
          } else {
            roundWinner = p2;
            game.stateData.roundScores[p2] = (game.stateData.roundScores[p2] || 0) + 1;
            summary = `${c2} beats ${c1}!`;
          }

          game.stateData.lastRoundResult = {
            p1Choice: c1,
            p2Choice: c2,
            winnerUid: roundWinner,
            summary
          };

          // Check if either reached targetWins (3)
          const target = game.stateData.targetWins || 3;
          if (game.stateData.roundScores[p1] >= target) {
            game.status = 'won';
            game.winnerId = p1;
            game.scores[p1] = (game.scores[p1] || 0) + 1;
          } else if (game.stateData.roundScores[p2] >= target) {
            game.status = 'won';
            game.winnerId = p2;
            game.scores[p2] = (game.scores[p2] || 0) + 1;
          } else {
            // Reset choices for next round
            game.stateData.playerChoices[p1] = null;
            game.stateData.playerChoices[p2] = null;
            game.stateData.roundNumber = (game.stateData.roundNumber || 1) + 1;
          }
        }

        game.updatedAt = new Date().toISOString();
        io.to(`conversation:${data.conversationId}`).emit('game:state', game);
        return;
      }

      // Turn enforcement for all other games
      if (game.currentTurn !== uid) return;

      // Handle Tic-Tac-Toe
      if (game.gameType === 'tictactoe') {
        const { cellIndex } = data.move;
        if (typeof cellIndex !== 'number' || cellIndex < 0 || cellIndex > 8) return;
        if (game.stateData.board[cellIndex] !== null) return;

        const symbol = game.players[uid]?.symbol || 'X';
        game.stateData.board[cellIndex] = symbol;

        const { winner, line, isDraw } = checkTicTacToeWin(game.stateData.board);
        if (winner) {
          game.status = 'won';
          game.winnerId = uid;
          game.stateData.winningLine = line;
          game.scores[uid] = (game.scores[uid] || 0) + 1;
        } else if (isDraw) {
          game.status = 'draw';
          game.winnerId = null;
        } else {
          game.currentTurn = partnerUid;
        }
      }

      // Handle Dots & Boxes
      else if (game.gameType === 'dotsandboxes') {
        const { lineKey } = data.move;
        if (!lineKey || typeof lineKey !== 'string') return;
        if (game.stateData.lines[lineKey]) return;

        const hMatch = lineKey.match(/^h_(\d+)_(\d+)$/);
        const vMatch = lineKey.match(/^v_(\d+)_(\d+)$/);
        if (!hMatch && !vMatch) return;
        if (hMatch) {
          const row = parseInt(hMatch[1]), col = parseInt(hMatch[2]);
          if (row < 0 || row > 3 || col < 0 || col > 2) return;
        }
        if (vMatch) {
          const row = parseInt(vMatch[1]), col = parseInt(vMatch[2]);
          if (row < 0 || row > 2 || col < 0 || col > 3) return;
        }

        game.stateData.lines[lineKey] = uid;
        const newlyCompleted = checkBoxesCompleted(game.stateData.lines, game.stateData.boxes, uid);

        if (newlyCompleted > 0) {
          game.stateData.boxScores[uid] = (game.stateData.boxScores[uid] || 0) + newlyCompleted;
          const allClaimed = game.stateData.boxes.every((b: any) => b.owner !== null);
          if (allClaimed) {
            const p1Score = game.stateData.boxScores[uid] || 0;
            const p2Score = game.stateData.boxScores[partnerUid] || 0;
            if (p1Score > p2Score) {
              game.status = 'won';
              game.winnerId = uid;
              game.scores[uid] = (game.scores[uid] || 0) + 1;
            } else if (p2Score > p1Score) {
              game.status = 'won';
              game.winnerId = partnerUid;
              game.scores[partnerUid] = (game.scores[partnerUid] || 0) + 1;
            } else {
              game.status = 'draw';
              game.winnerId = null;
            }
          }
        } else {
          game.currentTurn = partnerUid;
        }
      }

      // Handle Word Imposter
      else if (game.gameType === 'wordimposter') {
        const { letter, fullGuess } = data.move;
        const secretWord: string = game.stateData.word;

        if (fullGuess) {
          const cleanGuess = fullGuess.trim().toUpperCase();
          if (cleanGuess === secretWord) {
            game.status = 'won';
            game.winnerId = uid;
            game.scores[uid] = (game.scores[uid] || 0) + 1;
            game.stateData.revealedMask = secretWord.split('').join(' ');
          } else {
            game.stateData.wrongGuesses += 1;
            if (game.stateData.wrongGuesses >= game.stateData.maxWrong) {
              game.status = 'won';
              game.winnerId = partnerUid;
              game.scores[partnerUid] = (game.scores[partnerUid] || 0) + 1;
              game.stateData.revealedMask = secretWord.split('').join(' ');
            }
          }
        } else if (letter) {
          const upperLetter = letter.trim().toUpperCase().charAt(0);
          if (upperLetter && !game.stateData.guessedLetters.includes(upperLetter)) {
            game.stateData.guessedLetters.push(upperLetter);

            if (secretWord.includes(upperLetter)) {
              const mask = secretWord.split('').map((char: string) =>
                game.stateData.guessedLetters.includes(char) ? char : '_'
              ).join(' ');
              game.stateData.revealedMask = mask;

              const allRevealed = secretWord.split('').every((char: string) =>
                game.stateData.guessedLetters.includes(char)
              );

              if (allRevealed) {
                game.status = 'won';
                game.winnerId = uid;
                game.scores[uid] = (game.scores[uid] || 0) + 1;
              }
            } else {
              game.stateData.wrongGuesses += 1;
              if (game.stateData.wrongGuesses >= game.stateData.maxWrong) {
                game.status = 'won';
                game.winnerId = partnerUid;
                game.scores[partnerUid] = (game.scores[partnerUid] || 0) + 1;
                game.stateData.revealedMask = secretWord.split('').join(' ');
              }
            }
          }
        }

        if (game.status === 'in_progress') {
          game.currentTurn = partnerUid;
        }
      }

      // Handle Connect Four
      else if (game.gameType === 'connectfour') {
        const { col } = data.move;
        if (typeof col !== 'number') return;
        const symbol = game.players[uid]?.symbol || 'X';

        const result = handleConnectFourDrop(game.stateData.board, col, symbol);
        if (!result.success) return;

        game.stateData.lastDrop = { row: result.row, col };

        if (result.winningCells) {
          game.status = 'won';
          game.winnerId = uid;
          game.stateData.winningCells = result.winningCells;
          game.scores[uid] = (game.scores[uid] || 0) + 1;
        } else if (result.isDraw) {
          game.status = 'draw';
          game.winnerId = null;
        } else {
          game.currentTurn = partnerUid;
        }
      }

      // Handle Memory Match
      else if (game.gameType === 'memorymatch') {
        const { cardIndex } = data.move;
        if (typeof cardIndex !== 'number' || cardIndex < 0 || cardIndex > 15) return;
        if (game.stateData.matchedIndices.includes(cardIndex)) return;

        // Clear previous mismatch on new turn
        if (game.stateData.lastMismatch) {
          game.stateData.lastMismatch = null;
        }

        const flipped = game.stateData.flippedIndices;
        if (flipped.length === 0) {
          flipped.push(cardIndex);
        } else if (flipped.length === 1) {
          if (flipped[0] === cardIndex) return; // cannot click same card
          flipped.push(cardIndex);

          const card1 = game.stateData.cards[flipped[0]];
          const card2 = game.stateData.cards[cardIndex];

          if (card1 === card2) {
            // Match found!
            game.stateData.matchedIndices.push(flipped[0], cardIndex);
            game.stateData.playerScores[uid] = (game.stateData.playerScores[uid] || 0) + 1;
            game.stateData.flippedIndices = [];

            // Check if all 16 matched
            if (game.stateData.matchedIndices.length >= 16) {
              const myMatches = game.stateData.playerScores[uid] || 0;
              const theirMatches = game.stateData.playerScores[partnerUid] || 0;
              if (myMatches > theirMatches) {
                game.status = 'won';
                game.winnerId = uid;
                game.scores[uid] = (game.scores[uid] || 0) + 1;
              } else if (theirMatches > myMatches) {
                game.status = 'won';
                game.winnerId = partnerUid;
                game.scores[partnerUid] = (game.scores[partnerUid] || 0) + 1;
              } else {
                game.status = 'draw';
                game.winnerId = null;
              }
            }
            // Turn stays with player on match!
          } else {
            // Mismatch: record mismatch, clear flippedIndices, swap turn
            game.stateData.lastMismatch = [flipped[0], cardIndex];
            game.stateData.flippedIndices = [];
            game.currentTurn = partnerUid;
          }
        }
      }

      // Handle Gomoku
      else if (game.gameType === 'gomoku') {
        const { cellIndex } = data.move;
        if (typeof cellIndex !== 'number' || cellIndex < 0 || cellIndex > 80) return;
        if (game.stateData.board[cellIndex] !== null) return;

        const symbol = game.players[uid]?.symbol || 'X';
        game.stateData.board[cellIndex] = symbol;

        const result = checkGomokuWin(game.stateData.board, cellIndex, symbol);
        if (result.isWin) {
          game.status = 'won';
          game.winnerId = uid;
          game.stateData.winningLine = result.winningLine;
          game.scores[uid] = (game.scores[uid] || 0) + 1;
        } else if (result.isDraw) {
          game.status = 'draw';
          game.winnerId = null;
        } else {
          game.currentTurn = partnerUid;
        }
      }

      // Handle Checkers (6x6 compact board)
      else if (game.gameType === 'checkers') {
        const { from, to } = data.move;
        if (typeof from !== 'number' || typeof to !== 'number') return;
        if (from < 0 || from > 35 || to < 0 || to > 35) return;

        const piece = game.stateData.board[from];
        if (!piece) return;

        // Check ownership: host has 'r'/'R', partner has 'b'/'B'
        const isMyPiece = isHost
          ? piece === 'r' || piece === 'R'
          : piece === 'b' || piece === 'B';
        if (!isMyPiece) return;

        // Target must be empty and dark square ((r+c)%2 === 1)
        if (game.stateData.board[to] !== null) return;
        const toR = Math.floor(to / 6);
        const toC = to % 6;
        if ((toR + toC) % 2 === 0) return;

        const fromR = Math.floor(from / 6);
        const fromC = from % 6;
        const dr = toR - fromR;
        const dc = toC - fromC;
        const isKing = piece === 'R' || piece === 'B';

        let isValid = false;
        let isJump = false;
        let capturedIdx = -1;

        // Normal step (abs(dr) === 1 and abs(dc) === 1)
        if (Math.abs(dr) === 1 && Math.abs(dc) === 1) {
          // Direction check for non-king: 'r' moves down (dr > 0), 'b' moves up (dr < 0)
          if (isKing || (piece === 'r' && dr === 1) || (piece === 'b' && dr === -1)) {
            isValid = true;
          }
        }
        // Jump move (abs(dr) === 2 and abs(dc) === 2)
        else if (Math.abs(dr) === 2 && Math.abs(dc) === 2) {
          if (isKing || (piece === 'r' && dr === 2) || (piece === 'b' && dr === -2)) {
            const midR = fromR + dr / 2;
            const midC = fromC + dc / 2;
            capturedIdx = midR * 6 + midC;
            const jumpedPiece = game.stateData.board[capturedIdx];

            const isOpponent = isHost
              ? jumpedPiece === 'b' || jumpedPiece === 'B'
              : jumpedPiece === 'r' || jumpedPiece === 'R';

            if (isOpponent) {
              isValid = true;
              isJump = true;
            }
          }
        }

        if (!isValid) return;

        // Execute move
        game.stateData.board[from] = null;
        let finalPiece = piece;
        // King promotion
        if (piece === 'r' && toR === 5) finalPiece = 'R';
        if (piece === 'b' && toR === 0) finalPiece = 'B';
        game.stateData.board[to] = finalPiece;

        if (isJump && capturedIdx !== -1) {
          game.stateData.board[capturedIdx] = null;
          game.stateData.captured[uid] = (game.stateData.captured[uid] || 0) + 1;
        }

        // Count remaining opponent pieces
        const opponentPieces = game.stateData.board.filter((p: string | null) =>
          isHost ? p === 'b' || p === 'B' : p === 'r' || p === 'R'
        );

        if (opponentPieces.length === 0) {
          game.status = 'won';
          game.winnerId = uid;
          game.scores[uid] = (game.scores[uid] || 0) + 1;
        } else {
          game.currentTurn = partnerUid;
        }
      }

      // Handle Battleship (5x5 fleet)
      else if (game.gameType === 'battleship') {
        const { targetCell } = data.move;
        if (typeof targetCell !== 'number' || targetCell < 0 || targetCell > 24) return;
        if (game.stateData.shots[uid]?.[targetCell]) return; // already fired here

        const enemyShips: number[] = game.stateData.ships[partnerUid] || [];
        const isHit = enemyShips.includes(targetCell);

        if (!game.stateData.shots[uid]) game.stateData.shots[uid] = {};
        game.stateData.shots[uid][targetCell] = isHit ? 'hit' : 'miss';

        if (isHit) {
          game.stateData.hitsCount[uid] = (game.stateData.hitsCount[uid] || 0) + 1;
          if (game.stateData.hitsCount[uid] >= game.stateData.totalTargetHits) {
            game.status = 'won';
            game.winnerId = uid;
            game.scores[uid] = (game.scores[uid] || 0) + 1;
          } else {
            // Keep turn on hit or pass? In Wibby 2-player quick battleships, alternate turns keeps both engaged
            game.currentTurn = partnerUid;
          }
        } else {
          game.currentTurn = partnerUid;
        }
      }

      // Handle Reversi (6x6 Othello)
      else if (game.gameType === 'reversi') {
        const { cellIndex } = data.move;
        if (typeof cellIndex !== 'number' || cellIndex < 0 || cellIndex > 35) return;

        const mySymbol = isHost ? 'B' : 'W';
        const opponentSymbol = isHost ? 'W' : 'B';
        const flips = getReversiFlips(game.stateData.board, cellIndex, mySymbol);
        if (flips.length === 0) return; // not a valid reversible move

        // Place and flip
        game.stateData.board[cellIndex] = mySymbol;
        flips.forEach(idx => {
          game.stateData.board[idx] = mySymbol;
        });

        // Recalculate piece counts
        let bCount = 0;
        let wCount = 0;
        game.stateData.board.forEach((cell: string | null) => {
          if (cell === 'B') bCount++;
          if (cell === 'W') wCount++;
        });
        game.stateData.counts = { B: bCount, W: wCount };

        // Turn switching with pass handling
        const opponentHasMoves = hasValidReversiMoves(game.stateData.board, opponentSymbol);
        const myHasMoves = hasValidReversiMoves(game.stateData.board, mySymbol);

        if (opponentHasMoves) {
          game.currentTurn = partnerUid;
        } else if (myHasMoves) {
          // Partner has to pass, turn stays with current player
          game.currentTurn = uid;
        } else {
          // Neither can move: Game Over!
          const hostScore = bCount;
          const partnerScore = wCount;
          if (hostScore > partnerScore) {
            const hostUid = game.playerOrder[0];
            game.status = 'won';
            game.winnerId = hostUid;
            game.scores[hostUid] = (game.scores[hostUid] || 0) + 1;
          } else if (partnerScore > hostScore) {
            const partUid = game.playerOrder[1];
            game.status = 'won';
            game.winnerId = partUid;
            game.scores[partUid] = (game.scores[partUid] || 0) + 1;
          } else {
            game.status = 'draw';
            game.winnerId = null;
          }
        }
      }

      game.updatedAt = new Date().toISOString();
      io.to(`conversation:${data.conversationId}`).emit('game:state', game);
    } catch (err) {
      console.error('game:move error:', err);
    }
  });

  // 5. Play Again / Reset
  socket.on('game:reset', (data: { conversationId: string; gameId: string }) => {
    try {
      if (!data?.conversationId) return;
      const game = activeGames.get(data.conversationId);
      if (!game) return;

      const p1 = game.playerOrder[0];
      const p2 = game.playerOrder[1];
      // Switch who goes first on rematch
      const nextOrder = [p2, p1];

      game.gameId = crypto.randomUUID();
      game.playerOrder = nextOrder;
      game.currentTurn = nextOrder[0];
      game.status = 'in_progress';
      game.winnerId = null;
      game.stateData = initGameData(game.gameType, nextOrder[0], nextOrder[1]);
      game.updatedAt = new Date().toISOString();

      io.to(`conversation:${data.conversationId}`).emit('game:state', game);
    } catch (err) {
      console.error('game:reset error:', err);
    }
  });

  // 6. Request current game state
  socket.on('game:get-state', (data: { conversationId: string }) => {
    try {
      if (!data?.conversationId) return;
      const game = activeGames.get(data.conversationId);
      if (game) {
        socket.emit('game:state', game);
      }
    } catch (err) {
      console.error('game:get-state error:', err);
    }
  });

  // 7. Close / End game
  socket.on('game:close', (data: { conversationId: string; gameId?: string }) => {
    try {
      if (!data?.conversationId) return;
      activeGames.delete(data.conversationId);
      io.to(`conversation:${data.conversationId}`).emit('game:ended', {
        conversationId: data.conversationId
      });
    } catch (err) {
      console.error('game:close error:', err);
    }
  });
}
