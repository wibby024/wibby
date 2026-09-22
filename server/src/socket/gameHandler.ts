import { Server as SocketIOServer, Socket } from 'socket.io';
import { ObjectId } from 'mongodb';
import { getDb } from '../lib/mongodb.js';
import crypto from 'crypto';

export type GameType = 'tictactoe' | 'dotsandboxes' | 'wordimposter';

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

// Word Imposter dictionary with categories
export const WORD_CATEGORIES: { [cat: string]: string[] } = {
  Animals: ['DOLPHIN', 'PENGUIN', 'GIRAFFE', 'CHEETAH', 'KANGAROO', 'OCTOPUS', 'HAMSTER', 'PEACOCK'],
  Food: ['PANCAKE', 'BURRITO', 'AVOCADO', 'CUPCAKE', 'POPCORN', 'NOODLES', 'BROWNIE', 'LASAGNA'],
  Objects: ['COMPASS', 'LANTERN', 'TELESCOPE', 'UMBRELLA', 'NOTEBOOK', 'GUITAR', 'KEYBOARD', 'HEADSET'],
  Places: ['VOLCANO', 'GLACIER', 'ISLAND', 'LIBRARY', 'PYRAMID', 'CASTLE', 'AIRPORT', 'STADIUM']
};

function getRandomWord(): { word: string; category: string } {
  const categories = Object.keys(WORD_CATEGORIES);
  const category = categories[Math.floor(Math.random() * categories.length)];
  const words = WORD_CATEGORIES[category];
  const word = words[Math.floor(Math.random() * words.length)];
  return { word, category };
}

function initGameData(gameType: GameType, p1: string, p2: string) {
  if (gameType === 'tictactoe') {
    return {
      board: Array(9).fill(null),
      winningLine: null as number[] | null
    };
  } else if (gameType === 'dotsandboxes') {
    // 4x4 dots = 3x3 boxes (9 boxes total)
    // horizontal lines: h_row_col  row in [0..3], col in [0..2]  => 12 lines
    // vertical lines:   v_row_col  row in [0..2], col in [0..3]  => 12 lines
    const boxes: Array<{ row: number; col: number; owner: string | null }> = [];
    for (let r = 0; r < 3; r++) {
      for (let c = 0; c < 3; c++) {
        boxes.push({ row: r, col: c, owner: null });
      }
    }
    return {
      lines: {} as { [key: string]: string }, // key -> claimedBy uid
      boxes,
      boxScores: { [p1]: 0, [p2]: 0 }
    };
  } else if (gameType === 'wordimposter') {
    const { word, category } = getRandomWord();
    return {
      category,
      word,
      guessedLetters: [] as string[],
      wrongGuesses: 0,
      maxWrong: 6,
      revealedMask: word.split('').map(() => '_').join(' ')
    };
  }
  return {};
}

// Tic Tac Toe check win
function checkTicTacToeWin(board: (string | null)[]): { winner: string | null; line: number[] | null; isDraw: boolean } {
  const lines = [
    [0, 1, 2], [3, 4, 5], [6, 7, 8], // rows
    [0, 3, 6], [1, 4, 7], [2, 5, 8], // cols
    [0, 4, 8], [2, 4, 6]             // diags
  ];

  for (const [a, b, c] of lines) {
    if (board[a] && board[a] === board[b] && board[a] === board[c]) {
      return { winner: board[a], line: [a, b, c], isDraw: false };
    }
  }

  const isFull = board.every(cell => cell !== null);
  return { winner: null, line: null, isDraw: isFull };
}

// Dots and Boxes box completion check for 3x3 grid (9 boxes)
function checkBoxesCompleted(lines: { [key: string]: string }, boxes: any[], claimerUid: string): number {
  let newlyCompleted = 0;
  // 3 rows × 3 cols = 9 boxes
  // Box at (row, col) is bounded by:
  //   top:    h_{row}_{col}
  //   bottom: h_{row+1}_{col}
  //   left:   v_{row}_{col}
  //   right:  v_{row}_{col+1}
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

      const gameState: GameState = {
        gameId,
        conversationId: data.conversationId,
        gameType: data.gameType,
        players: {
          [uid]: { symbol: 'X', color: '#7C3AED', name: 'Host' },
          [partnerUid]: { symbol: 'O', color: '#10B981', name: 'Partner' }
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

      // Ensure it's the sender's turn
      if (game.currentTurn !== uid) return;

      const partnerUid = game.playerOrder.find(id => id !== uid) || uid;

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
        const { lineKey } = data.move; // e.g. "h_0_1" or "v_1_2"
        if (!lineKey || typeof lineKey !== 'string') return;
        if (game.stateData.lines[lineKey]) return; // already claimed

        // Validate key format against 3x3 grid boundaries
        // Horizontal: h_row_col, row in [0..3], col in [0..2]
        // Vertical:   v_row_col, row in [0..2], col in [0..3]
        const hMatch = lineKey.match(/^h_(\d+)_(\d+)$/);
        const vMatch = lineKey.match(/^v_(\d+)_(\d+)$/);
        if (!hMatch && !vMatch) return; // reject unknown format
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
          // Check if all 9 boxes claimed
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
          // Note: If newlyCompleted > 0 and not all claimed, currentTurn remains uid (bonus turn!)
        } else {
          // Switch turn
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
              game.winnerId = partnerUid; // Host imposter wins
              game.scores[partnerUid] = (game.scores[partnerUid] || 0) + 1;
              game.stateData.revealedMask = secretWord.split('').join(' ');
            }
          }
        } else if (letter) {
          const upperLetter = letter.trim().toUpperCase().charAt(0);
          if (upperLetter && !game.stateData.guessedLetters.includes(upperLetter)) {
            game.stateData.guessedLetters.push(upperLetter);

            if (secretWord.includes(upperLetter)) {
              // Update revealed mask
              const mask = secretWord.split('').map((char: string) =>
                game.stateData.guessedLetters.includes(char) ? char : '_'
              ).join(' ');
              game.stateData.revealedMask = mask;

              // Check if all letters revealed
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

        // Toggle turn in word imposter if game still in progress
        if (game.status === 'in_progress') {
          game.currentTurn = partnerUid;
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
      const nextOrder = [game.playerOrder[1], game.playerOrder[0]];

      game.gameId = crypto.randomUUID();
      game.playerOrder = nextOrder;
      game.currentTurn = nextOrder[0];
      game.status = 'in_progress';
      game.winnerId = null;
      game.stateData = initGameData(game.gameType, p1, p2);
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
