/* 테트리스 핵심 로직 - 브라우저와 Node에서 모두 사용할 수 있습니다. */
(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) {
    module.exports = api;
  } else {
    root.TetrisCore = api;
  }
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  const COLS = 10;
  const ROWS = 20;

  // 가이드라인 테트로미노 색상: 모든 블록이 서로 다른 색을 가집니다.
  const COLORS = {
    I: '#22d3ee', // cyan
    O: '#facc15', // yellow
    T: '#a78bfa', // purple
    S: '#4ade80', // green
    Z: '#f87171', // red
    J: '#60a5fa', // blue
    L: '#fb923c'  // orange
  };

  const SHAPES = {
    I: [[0, 0, 0, 0], [1, 1, 1, 1], [0, 0, 0, 0], [0, 0, 0, 0]],
    O: [[1, 1], [1, 1]],
    T: [[0, 1, 0], [1, 1, 1], [0, 0, 0]],
    S: [[0, 1, 1], [1, 1, 0], [0, 0, 0]],
    Z: [[1, 1, 0], [0, 1, 1], [0, 0, 0]],
    J: [[1, 0, 0], [1, 1, 1], [0, 0, 0]],
    L: [[0, 0, 1], [1, 1, 1], [0, 0, 0]]
  };

  const TYPES = Object.keys(SHAPES);
  const LINE_SCORES = [0, 100, 300, 500, 800];
  const KICKS = [0, -1, 1, -2, 2];

  function createBoard() {
    return Array.from({ length: ROWS }, () => Array(COLS).fill(null));
  }

  function cloneBoard(board) {
    return board.map((row) => row.slice());
  }

  function createPiece(type) {
    const matrix = SHAPES[type].map((row) => row.slice());
    return {
      type,
      matrix,
      x: Math.floor((COLS - matrix[0].length) / 2),
      y: -1
    };
  }

  /**
   * 보드와 조각이 겹치거나 경계를 벗어나는지 검사합니다.
   * y < 0인 칸은 아직 보드 위쪽에 있는 것으로 보고 충돌로 처리하지 않습니다.
   */
  function collides(board, piece, dx, dy, matrix, x, y) {
    const shape = matrix || piece.matrix;
    const ox = x === undefined ? piece.x : x;
    const oy = y === undefined ? piece.y : y;
    const offsetX = dx || 0;
    const offsetY = dy || 0;

    for (let r = 0; r < shape.length; r += 1) {
      for (let c = 0; c < shape[r].length; c += 1) {
        if (!shape[r][c]) continue;
        const bx = ox + c + offsetX;
        const by = oy + r + offsetY;
        if (bx < 0 || bx >= COLS || by >= ROWS) return true;
        if (by >= 0 && board[by][bx]) return true;
      }
    }
    return false;
  }

  function rotateMatrix(matrix, direction) {
    const size = matrix.length;
    const result = Array.from({ length: size }, () => Array(size).fill(0));
    for (let r = 0; r < size; r += 1) {
      for (let c = 0; c < size; c += 1) {
        if (direction < 0) result[size - 1 - c][r] = matrix[r][c];
        else result[c][size - 1 - r] = matrix[r][c];
      }
    }
    return result;
  }

  /** 시계(+) / 반시계(-) 방향으로 회전하고, 벽 근처에서는 간단한 킥을 시도합니다. */
  function rotate(board, piece, direction) {
    const rotated = rotateMatrix(piece.matrix, direction);
    for (const kick of KICKS) {
      if (!collides(board, piece, kick, 0, rotated)) {
        return { type: piece.type, matrix: rotated, x: piece.x + kick, y: piece.y };
      }
    }
    return null;
  }

  function merge(board, piece) {
    const next = cloneBoard(board);
    for (let r = 0; r < piece.matrix.length; r += 1) {
      for (let c = 0; c < piece.matrix[r].length; c += 1) {
        if (!piece.matrix[r][c]) continue;
        const by = piece.y + r;
        const bx = piece.x + c;
        if (by >= 0 && by < ROWS && bx >= 0 && bx < COLS) {
          next[by][bx] = piece.type;
        }
      }
    }
    return next;
  }

  /** 꽉 찬 줄을 제거하고 위쪽에 빈 줄을 채웁니다. */
  function clearLines(board) {
    const kept = board.filter((row) => row.some((cell) => !cell));
    const cleared = ROWS - kept.length;
    while (kept.length < ROWS) kept.unshift(Array(COLS).fill(null));
    return { board: kept, cleared };
  }

  /** 현재 조각이 떨어질 수 있는 가장 아래쪽 y 좌표를 반환합니다. */
  function getGhostY(board, piece) {
    let y = piece.y;
    while (!collides(board, piece, 0, y - piece.y + 1)) y += 1;
    return y;
  }

  /** 7-bag 랜덤: 한 번의 봉투에 7종 블록이 모두 들어갑니다. */
  function shuffleBag(rng) {
    const random = typeof rng === 'function' ? rng : Math.random;
    const bag = TYPES.slice();
    for (let i = bag.length - 1; i > 0; i -= 1) {
      const j = Math.floor(random() * (i + 1));
      [bag[i], bag[j]] = [bag[j], bag[i]];
    }
    return bag;
  }

  return {
    COLS,
    ROWS,
    COLORS,
    SHAPES,
    TYPES,
    LINE_SCORES,
    createBoard,
    cloneBoard,
    createPiece,
    collides,
    rotateMatrix,
    rotate,
    merge,
    clearLines,
    getGhostY,
    shuffleBag
  };
});
