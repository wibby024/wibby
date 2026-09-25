// Two-Player Realtime Game Logic & Rules Engine for Wibby

export type GameType =
  | 'tictactoe'
  | 'dotsandboxes'
  | 'wordimposter'
  | 'connectfour'
  | 'rockpaperscissors'
  | 'memorymatch'
  | 'gomoku'
  | 'checkers'
  | 'battleship'
  | 'reversi';

// Word Imposter dictionary
export const WORD_CATEGORIES: { [cat: string]: string[] } = {
  Animals: ['DOLPHIN', 'PENGUIN', 'GIRAFFE', 'CHEETAH', 'KANGAROO', 'OCTOPUS', 'HAMSTER', 'PEACOCK'],
  Food: ['PANCAKE', 'BURRITO', 'AVOCADO', 'CUPCAKE', 'POPCORN', 'NOODLES', 'BROWNIE', 'LASAGNA'],
  Objects: ['COMPASS', 'LANTERN', 'TELESCOPE', 'UMBRELLA', 'NOTEBOOK', 'GUITAR', 'KEYBOARD', 'HEADSET'],
  Places: ['VOLCANO', 'GLACIER', 'ISLAND', 'LIBRARY', 'PYRAMID', 'CASTLE', 'AIRPORT', 'STADIUM']
};

export function getRandomWord(): { word: string; category: string } {
  const categories = Object.keys(WORD_CATEGORIES);
  const category = categories[Math.floor(Math.random() * categories.length)];
  const words = WORD_CATEGORIES[category];
  const word = words[Math.floor(Math.random() * words.length)];
  return { word, category };
}

// -------------------------------------------------------------
// Random Ship Placer for Battleship (5x5 grid)
// -------------------------------------------------------------
function generateBattleshipShips(): number[] {
  const shipLengths = [3, 2, 2]; // 3 ships: length 3, length 2, length 2 (7 cells total)
  const occupied = new Set<number>();

  for (const len of shipLengths) {
    let placed = false;
    let attempts = 0;
    while (!placed && attempts < 100) {
      attempts++;
      const isHorizontal = Math.random() > 0.5;
      const r = Math.floor(Math.random() * (isHorizontal ? 5 : 5 - len + 1));
      const c = Math.floor(Math.random() * (isHorizontal ? 5 - len + 1 : 5));

      const cells: number[] = [];
      let collision = false;
      for (let i = 0; i < len; i++) {
        const cell = isHorizontal ? r * 5 + (c + i) : (r + i) * 5 + c;
        if (occupied.has(cell)) {
          collision = true;
          break;
        }
        cells.push(cell);
      }

      if (!collision) {
        cells.forEach(cell => occupied.add(cell));
        placed = true;
      }
    }
  }

  return Array.from(occupied);
}

// -------------------------------------------------------------
// Memory Match Shuffler (4x4 = 16 cards, 8 pairs)
// -------------------------------------------------------------
const MEMORY_EMOJIS = ['🦊', '🐼', '🐨', '🦁', '🐯', '🐸', '🦄', '🐙'];

function generateMemoryCards(): string[] {
  const deck = [...MEMORY_EMOJIS, ...MEMORY_EMOJIS];
  for (let i = deck.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [deck[i], deck[j]] = [deck[j], deck[i]];
  }
  return deck;
}

// -------------------------------------------------------------
// Reversi initial valid moves & flip calculation (6x6 board)
// -------------------------------------------------------------
const REVERSI_DIRS = [
  [-1, -1], [-1, 0], [-1, 1],
  [0, -1],           [0, 1],
  [1, -1],  [1, 0],  [1, 1]
];

export function getReversiFlips(board: (string | null)[], cellIndex: number, playerSymbol: string): number[] {
  if (board[cellIndex] !== null) return [];
  const opponent = playerSymbol === 'B' ? 'W' : 'B';
  const r = Math.floor(cellIndex / 6);
  const c = cellIndex % 6;
  const flips: number[] = [];

  for (const [dr, dc] of REVERSI_DIRS) {
    const currentFlips: number[] = [];
    let currR = r + dr;
    let currC = c + dc;

    while (currR >= 0 && currR < 6 && currC >= 0 && currC < 6) {
      const idx = currR * 6 + currC;
      if (board[idx] === opponent) {
        currentFlips.push(idx);
        currR += dr;
        currC += dc;
      } else if (board[idx] === playerSymbol) {
        if (currentFlips.length > 0) {
          flips.push(...currentFlips);
        }
        break;
      } else {
        break; // empty space
      }
    }
  }

  return flips;
}

export function hasValidReversiMoves(board: (string | null)[], playerSymbol: string): boolean {
  for (let i = 0; i < 36; i++) {
    if (getReversiFlips(board, i, playerSymbol).length > 0) {
      return true;
    }
  }
  return false;
}

// -------------------------------------------------------------
// Initialize Game State Data for all 10 games
// -------------------------------------------------------------
export function initGameData(gameType: GameType, p1: string, p2: string): any {
  switch (gameType) {
    case 'tictactoe':
      return {
        board: Array(9).fill(null),
        winningLine: null as number[] | null
      };

    case 'dotsandboxes': {
      const boxes: Array<{ row: number; col: number; owner: string | null }> = [];
      for (let r = 0; r < 3; r++) {
        for (let c = 0; c < 3; c++) {
          boxes.push({ row: r, col: c, owner: null });
        }
      }
      return {
        lines: {} as { [key: string]: string },
        boxes,
        boxScores: { [p1]: 0, [p2]: 0 }
      };
    }

    case 'wordimposter': {
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

    case 'connectfour':
      // 6 rows x 7 cols = 42 cells (index = r * 7 + c)
      return {
        board: Array(42).fill(null) as (string | null)[],
        winningCells: null as number[] | null,
        lastDrop: null as { row: number; col: number } | null
      };

    case 'rockpaperscissors':
      return {
        playerChoices: { [p1]: null, [p2]: null } as { [uid: string]: string | null },
        roundScores: { [p1]: 0, [p2]: 0 },
        roundNumber: 1,
        targetWins: 3,
        lastRoundResult: null as {
          p1Choice: string;
          p2Choice: string;
          winnerUid: string | null; // null = draw
          summary: string;
        } | null
      };

    case 'memorymatch':
      return {
        cards: generateMemoryCards(), // 16 items
        flippedIndices: [] as number[],
        matchedIndices: [] as number[],
        playerScores: { [p1]: 0, [p2]: 0 },
        lastMismatch: null as number[] | null
      };

    case 'gomoku':
      // 9x9 compact board = 81 cells
      return {
        board: Array(81).fill(null) as (string | null)[],
        winningLine: null as number[] | null
      };

    case 'checkers': {
      // 6x6 compact board = 36 cells. Pieces on dark squares: (r + c) % 2 === 1
      // p1 pieces: 'r' (regular red) on rows 0, 1 (6 pieces)
      // p2 pieces: 'b' (regular blue) on rows 4, 5 (6 pieces)
      const board = Array(36).fill(null) as (string | null)[];
      for (let r = 0; r < 2; r++) {
        for (let c = 0; c < 6; c++) {
          if ((r + c) % 2 === 1) board[r * 6 + c] = 'r';
        }
      }
      for (let r = 4; r < 6; r++) {
        for (let c = 0; c < 6; c++) {
          if ((r + c) % 2 === 1) board[r * 6 + c] = 'b';
        }
      }
      return {
        board,
        selectedSquare: null as number | null,
        captured: { [p1]: 0, [p2]: 0 }
      };
    }

    case 'battleship':
      return {
        ships: {
          [p1]: generateBattleshipShips(),
          [p2]: generateBattleshipShips()
        },
        shots: {
          [p1]: {} as { [cellIndex: number]: 'hit' | 'miss' },
          [p2]: {} as { [cellIndex: number]: 'hit' | 'miss' }
        },
        hitsCount: { [p1]: 0, [p2]: 0 },
        totalTargetHits: 7 // 3 + 2 + 2 = 7 ship segments
      };

    case 'reversi': {
      // 6x6 board, 4 center disks
      // row 2 col 2: W, row 2 col 3: B, row 3 col 2: B, row 3 col 3: W
      const board = Array(36).fill(null) as (string | null)[];
      board[2 * 6 + 2] = 'W';
      board[2 * 6 + 3] = 'B';
      board[3 * 6 + 2] = 'B';
      board[3 * 6 + 3] = 'W';
      return {
        board,
        counts: { B: 2, W: 2 }
      };
    }

    default:
      return {};
  }
}

// -------------------------------------------------------------
// Tic-Tac-Toe Win Check
// -------------------------------------------------------------
export function checkTicTacToeWin(board: (string | null)[]): {
  winner: string | null;
  line: number[] | null;
  isDraw: boolean;
} {
  const lines = [
    [0, 1, 2], [3, 4, 5], [6, 7, 8],
    [0, 3, 6], [1, 4, 7], [2, 5, 8],
    [0, 4, 8], [2, 4, 6]
  ];

  for (const [a, b, c] of lines) {
    if (board[a] && board[a] === board[b] && board[a] === board[c]) {
      return { winner: board[a], line: [a, b, c], isDraw: false };
    }
  }

  const isFull = board.every(cell => cell !== null);
  return { winner: null, line: null, isDraw: isFull };
}

// -------------------------------------------------------------
// Connect Four Drop & Win Check (6 rows x 7 cols)
// -------------------------------------------------------------
export function handleConnectFourDrop(
  board: (string | null)[],
  col: number,
  symbol: string
): { success: boolean; row: number; winningCells: number[] | null; isDraw: boolean } {
  if (col < 0 || col > 6) return { success: false, row: -1, winningCells: null, isDraw: false };

  // Find lowest available row in column
  let targetRow = -1;
  for (let r = 5; r >= 0; r--) {
    if (board[r * 7 + col] === null) {
      targetRow = r;
      break;
    }
  }

  if (targetRow === -1) return { success: false, row: -1, winningCells: null, isDraw: false };

  board[targetRow * 7 + col] = symbol;

  // Check 4-in-a-row from targetRow, col
  const winningCells = checkConnectFourWin(board, targetRow, col, symbol);
  const isFull = board.every(cell => cell !== null);

  return { success: true, row: targetRow, winningCells, isDraw: !winningCells && isFull };
}

function checkConnectFourWin(
  board: (string | null)[],
  r: number,
  c: number,
  sym: string
): number[] | null {
  const directions = [
    [0, 1],  // Horizontal
    [1, 0],  // Vertical
    [1, 1],  // Diagonal \
    [1, -1]  // Diagonal /
  ];

  for (const [dr, dc] of directions) {
    const line = [r * 7 + c];

    // Check forward
    for (let step = 1; step <= 3; step++) {
      const nr = r + dr * step;
      const nc = c + dc * step;
      if (nr >= 0 && nr < 6 && nc >= 0 && nc < 7 && board[nr * 7 + nc] === sym) {
        line.push(nr * 7 + nc);
      } else {
        break;
      }
    }

    // Check backward
    for (let step = 1; step <= 3; step++) {
      const nr = r - dr * step;
      const nc = c - dc * step;
      if (nr >= 0 && nr < 6 && nc >= 0 && nc < 7 && board[nr * 7 + nc] === sym) {
        line.push(nr * 7 + nc);
      } else {
        break;
      }
    }

    if (line.length >= 4) {
      return line;
    }
  }

  return null;
}

// -------------------------------------------------------------
// Gomoku Win Check (9x9 board = 81 cells)
// -------------------------------------------------------------
export function checkGomokuWin(
  board: (string | null)[],
  cellIndex: number,
  symbol: string
): { isWin: boolean; winningLine: number[] | null; isDraw: boolean } {
  const r = Math.floor(cellIndex / 9);
  const c = cellIndex % 9;
  const directions = [
    [0, 1],  // Horizontal
    [1, 0],  // Vertical
    [1, 1],  // Diagonal \
    [1, -1]  // Diagonal /
  ];

  for (const [dr, dc] of directions) {
    const line = [cellIndex];

    for (let step = 1; step <= 4; step++) {
      const nr = r + dr * step;
      const nc = c + dc * step;
      if (nr >= 0 && nr < 9 && nc >= 0 && nc < 9 && board[nr * 9 + nc] === symbol) {
        line.push(nr * 9 + nc);
      } else {
        break;
      }
    }

    for (let step = 1; step <= 4; step++) {
      const nr = r - dr * step;
      const nc = c - dc * step;
      if (nr >= 0 && nr < 9 && nc >= 0 && nc < 9 && board[nr * 9 + nc] === symbol) {
        line.push(nr * 9 + nc);
      } else {
        break;
      }
    }

    if (line.length >= 5) {
      return { isWin: true, winningLine: line, isDraw: false };
    }
  }

  const isFull = board.every(cell => cell !== null);
  return { isWin: false, winningLine: null, isDraw: isFull };
}
