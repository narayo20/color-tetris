/* 화면 렌더링, 입력 처리, 게임 흐름 */
(() => {
  'use strict';

  const Core = window.TetrisCore;
  const { COLS, ROWS, COLORS, LINE_SCORES } = Core;
  const CELL = 30;
  const HIGH_SCORE_KEY = 'tetris-high-score-v1';

  function prepareCanvas(canvas, width, height) {
    const ratio = Math.min(window.devicePixelRatio || 1, 2);
    canvas.width = Math.round(width * ratio);
    canvas.height = Math.round(height * ratio);
    canvas.style.width = width + 'px';
    canvas.style.height = height + 'px';
    const context = canvas.getContext('2d');
    context.setTransform(ratio, 0, 0, ratio, 0, 0);
    return context;
  }

  const ctx = prepareCanvas(document.getElementById('board'), COLS * CELL, ROWS * CELL);
  const nextCtx = prepareCanvas(document.getElementById('next'), 4 * CELL, 4 * CELL);
  const holdCtx = prepareCanvas(document.getElementById('hold'), 4 * CELL, 4 * CELL);

  const els = {
    score: document.getElementById('score'),
    high: document.getElementById('high-score'),
    lines: document.getElementById('lines'),
    level: document.getElementById('level'),
    overlay: document.getElementById('overlay'),
    overlayKicker: document.getElementById('overlay-kicker'),
    overlayTitle: document.getElementById('overlay-title'),
    overlayDesc: document.getElementById('overlay-desc'),
    overlayButton: document.getElementById('overlay-btn'),
    soundButton: document.getElementById('sound-btn')
  };

  let board = Core.createBoard();
  let current = null;
  let queue = [];
  let holdType = null;
  let canHold = true;
  let score = 0;
  let lines = 0;
  let level = 1;
  let highScore = 0;
  let state = 'ready'; // ready | playing | paused | over
  let lastTime = 0;
  let dropTime = 0;
  let flashRows = [];
  let flashStart = 0;
  let muted = false;
  let audioContext = null;

  try {
    highScore = Number(localStorage.getItem(HIGH_SCORE_KEY)) || 0;
  } catch (_) {
    // 저장소가 막힌 환경에서는 최고 점수를 유지하지 않습니다.
  }

  function beep(frequency, duration, waveform, volume) {
    if (muted) return;
    try {
      const AudioCtx = window.AudioContext || window.webkitAudioContext;
      if (!AudioCtx) return;
      audioContext = audioContext || new AudioCtx();
      if (audioContext.state === 'suspended') audioContext.resume();
      const oscillator = audioContext.createOscillator();
      const gain = audioContext.createGain();
      oscillator.type = waveform;
      oscillator.frequency.value = frequency;
      gain.gain.setValueAtTime(volume, audioContext.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.0001, audioContext.currentTime + duration);
      oscillator.connect(gain).connect(audioContext.destination);
      oscillator.start();
      oscillator.stop(audioContext.currentTime + duration);
    } catch (_) {
      // 오디오를 사용할 수 없어도 게임은 정상 동작해야 합니다.
    }
  }

  function updateUI() {
    els.score.textContent = score.toLocaleString('ko-KR');
    els.high.textContent = highScore.toLocaleString('ko-KR');
    els.lines.textContent = String(lines);
    els.level.textContent = String(level);
  }

  function addScore(points) {
    score += points;
    if (score > highScore) {
      highScore = score;
      try {
        localStorage.setItem(HIGH_SCORE_KEY, String(highScore));
      } catch (_) {
        // 저장 실패는 무시합니다.
      }
    }
    updateUI();
  }

  function showOverlay(kicker, title, description, buttonLabel) {
    els.overlayKicker.textContent = kicker;
    els.overlayTitle.textContent = title;
    els.overlayDesc.textContent = description;
    els.overlayButton.textContent = buttonLabel;
    els.overlay.classList.remove('is-hidden');
  }

  function hideOverlay() {
    els.overlay.classList.add('is-hidden');
  }

  function refillQueue() {
    while (queue.length < 8) queue.push(...Core.shuffleBag());
  }

  function spawnNext() {
    refillQueue();
    const type = queue.shift();
    current = Core.createPiece(type);
    canHold = true;
    drawPreview(nextCtx, queue[0]);
    if (Core.collides(board, current)) gameOver();
  }

  function gameOver() {
    state = 'over';
    beep(220, 0.35, 'sawtooth', 0.03);
    showOverlay('GAME OVER', '게임 오버', `최종 점수 ${score.toLocaleString('ko-KR')} · ${lines}줄 삭제`, '다시 시작');
  }

  function startGame() {
    board = Core.createBoard();
    queue = [];
    holdType = null;
    canHold = true;
    score = 0;
    lines = 0;
    level = 1;
    flashRows = [];
    dropTime = 0;
    lastTime = 0;
    state = 'playing';
    hideOverlay();
    drawPreview(holdCtx, null);
    spawnNext();
    updateUI();
  }

  function togglePause() {
    if (state === 'playing') {
      state = 'paused';
      showOverlay('PAUSED', '일시정지', '잠시 쉬어가고 있습니다.', '계속하기');
    } else if (state === 'paused') {
      state = 'playing';
      lastTime = 0;
      hideOverlay();
    }
  }

  function stepDown(fromInput) {
    if (!Core.collides(board, current, 0, 1)) {
      current = { type: current.type, matrix: current.matrix, x: current.x, y: current.y + 1 };
      if (fromInput) {
        addScore(1);
        beep(120, 0.02, 'sine', 0.01);
      }
      dropTime = 0;
    } else {
      lockPiece();
    }
  }

  function lockPiece() {
    board = Core.merge(board, current);
    const result = Core.clearLines(board);
    board = result.board;

    if (result.cleared > 0) {
      lines += result.cleared;
      addScore(LINE_SCORES[result.cleared] * level);
      level = Math.floor(lines / 10) + 1;
      flashRows = Array.from({ length: result.cleared }, (_, index) => ROWS - result.cleared + index);
      flashStart = performance.now();
      beep(620 + result.cleared * 110, 0.16, 'square', 0.035);
    } else {
      beep(150, 0.05, 'triangle', 0.02);
    }

    updateUI();
    spawnNext();
  }

  function holdPiece() {
    if (!canHold) return;
    const type = current.type;
    if (holdType) {
      current = Core.createPiece(holdType);
      holdType = type;
      if (Core.collides(board, current)) {
        gameOver();
        return;
      }
    } else {
      holdType = type;
      spawnNext();
      if (state !== 'playing') return;
    }
    canHold = false;
    beep(420, 0.06, 'sine', 0.025);
    drawPreview(holdCtx, holdType);
  }

  function performAction(action) {
    if (action === 'pause') {
      togglePause();
      return;
    }
    if (state !== 'playing' || !current) return;

    switch (action) {
      case 'left':
        if (!Core.collides(board, current, -1, 0)) {
          current.x -= 1;
          beep(180, 0.02, 'triangle', 0.015);
        }
        break;
      case 'right':
        if (!Core.collides(board, current, 1, 0)) {
          current.x += 1;
          beep(180, 0.02, 'triangle', 0.015);
        }
        break;
      case 'down':
        stepDown(true);
        break;
      case 'rotate':
      case 'rotate-ccw': {
        const direction = action === 'rotate' ? 1 : -1;
        const rotated = Core.rotate(board, current, direction);
        if (rotated) {
          current = rotated;
          beep(320, 0.04, 'square', 0.02);
        }
        break;
      }
      case 'hard': {
        let dropped = 0;
        while (!Core.collides(board, current, 0, dropped + 1)) dropped += 1;
        if (dropped > 0) {
          current.y += dropped;
          addScore(dropped * 2);
        }
        beep(260, 0.06, 'sawtooth', 0.025);
        lockPiece();
        break;
      }
      case 'hold':
        holdPiece();
        break;
      default:
        break;
    }
  }

  const KEY_ACTIONS = {
    arrowleft: 'left',
    arrowright: 'right',
    arrowdown: 'down',
    arrowup: 'rotate',
    x: 'rotate',
    z: 'rotate-ccw',
    ' ': 'hard',
    c: 'hold',
    shift: 'hold'
  };

  window.addEventListener('keydown', (event) => {
    const key = event.key.toLowerCase();
    if (key in KEY_ACTIONS || ['p', 'escape', 'r', 'enter'].includes(key)) event.preventDefault();

    if (state === 'ready' || state === 'over') {
      if (key === 'enter' || key === ' ' || key === 'r') startGame();
      return;
    }
    if (key === 'p' || key === 'escape') {
      togglePause();
      return;
    }
    if (state !== 'playing') return;
    if (key === 'r') {
      startGame();
      return;
    }
    if (key in KEY_ACTIONS) performAction(KEY_ACTIONS[key]);
  });

  document.querySelectorAll('[data-action]').forEach((button) => {
    let repeatTimer = null;
    const action = button.dataset.action;
    button.addEventListener('pointerdown', (event) => {
      event.preventDefault();
      performAction(action);
      if (['left', 'right', 'down'].includes(action)) {
        repeatTimer = window.setInterval(() => performAction(action), 110);
      }
      if (button.setPointerCapture) button.setPointerCapture(event.pointerId);
    });
    const stopRepeat = () => {
      if (repeatTimer !== null) window.clearInterval(repeatTimer);
      repeatTimer = null;
    };
    button.addEventListener('pointerup', stopRepeat);
    button.addEventListener('pointercancel', stopRepeat);
    button.addEventListener('pointerleave', stopRepeat);
  });

  els.overlayButton.addEventListener('click', () => {
    if (state === 'paused') togglePause();
    else startGame();
  });

  els.soundButton.addEventListener('click', () => {
    muted = !muted;
    els.soundButton.textContent = muted ? '🔇' : '🔊';
    els.soundButton.setAttribute('aria-label', muted ? '소리 켜기' : '소리 끄기');
  });

  document.addEventListener('visibilitychange', () => {
    if (document.hidden && state === 'playing') togglePause();
  });

  function drawCellAt(context, px, py, type, alpha) {
    context.save();
    if (alpha !== undefined) context.globalAlpha = alpha;
    context.fillStyle = COLORS[type];
    context.fillRect(px + 1, py + 1, CELL - 2, CELL - 2);
    context.fillStyle = 'rgba(255, 255, 255, 0.30)';
    context.fillRect(px + 1, py + 1, CELL - 2, 3);
    context.fillRect(px + 1, py + 1, 3, CELL - 2);
    context.fillStyle = 'rgba(0, 0, 0, 0.22)';
    context.fillRect(px + 1, py + CELL - 4, CELL - 2, 3);
    context.fillRect(px + CELL - 4, py + 1, 3, CELL - 2);
    context.restore();
  }

  function drawCell(context, x, y, type, alpha) {
    if (y < -1) return;
    drawCellAt(context, x * CELL, y * CELL, type, alpha);
  }

  function drawPreview(context, type) {
    const size = 4 * CELL;
    context.clearRect(0, 0, size, size);
    if (!type) return;
    const matrix = Core.SHAPES[type];
    let minRow = matrix.length;
    let maxRow = -1;
    let minCol = matrix[0].length;
    let maxCol = -1;
    for (let r = 0; r < matrix.length; r += 1) {
      for (let c = 0; c < matrix[r].length; c += 1) {
        if (!matrix[r][c]) continue;
        minRow = Math.min(minRow, r);
        maxRow = Math.max(maxRow, r);
        minCol = Math.min(minCol, c);
        maxCol = Math.max(maxCol, c);
      }
    }
    const originX = (size - (maxCol - minCol + 1) * CELL) / 2;
    const originY = (size - (maxRow - minRow + 1) * CELL) / 2;
    for (let r = minRow; r <= maxRow; r += 1) {
      for (let c = minCol; c <= maxCol; c += 1) {
        if (matrix[r][c]) {
          drawCellAt(context, originX + (c - minCol) * CELL, originY + (r - minRow) * CELL, type);
        }
      }
    }
  }

  function drawPiece(context, piece, alpha) {
    for (let r = 0; r < piece.matrix.length; r += 1) {
      for (let c = 0; c < piece.matrix[r].length; c += 1) {
        if (piece.matrix[r][c]) drawCell(context, piece.x + c, piece.y + r, piece.type, alpha);
      }
    }
  }

  function renderBoard() {
    ctx.fillStyle = '#080b18';
    ctx.fillRect(0, 0, COLS * CELL, ROWS * CELL);

    ctx.strokeStyle = 'rgba(148, 163, 184, 0.07)';
    ctx.lineWidth = 1;
    for (let x = 1; x < COLS; x += 1) {
      ctx.beginPath();
      ctx.moveTo(x * CELL + 0.5, 0);
      ctx.lineTo(x * CELL + 0.5, ROWS * CELL);
      ctx.stroke();
    }
    for (let y = 1; y < ROWS; y += 1) {
      ctx.beginPath();
      ctx.moveTo(0, y * CELL + 0.5);
      ctx.lineTo(COLS * CELL, y * CELL + 0.5);
      ctx.stroke();
    }

    for (let r = 0; r < ROWS; r += 1) {
      for (let c = 0; c < COLS; c += 1) {
        if (board[r][c]) drawCell(ctx, c, r, board[r][c]);
      }
    }

    if (current && state !== 'over') {
      const ghostY = Core.getGhostY(board, current);
      if (ghostY !== current.y) {
        ctx.save();
        ctx.globalAlpha = 0.5;
        ctx.strokeStyle = COLORS[current.type];
        ctx.lineWidth = 2;
        for (let r = 0; r < current.matrix.length; r += 1) {
          for (let c = 0; c < current.matrix[r].length; c += 1) {
            if (!current.matrix[r][c]) continue;
            const y = ghostY + r;
            if (y < 0) continue;
            ctx.strokeRect((current.x + c) * CELL + 1.5, y * CELL + 1.5, CELL - 3, CELL - 3);
          }
        }
        ctx.restore();
        drawPiece(ctx, { type: current.type, matrix: current.matrix, x: current.x, y: ghostY }, 0.16);
      }
      drawPiece(ctx, current);
    }

    if (flashRows.length > 0) {
      const elapsed = performance.now() - flashStart;
      if (elapsed < 180) {
        ctx.fillStyle = `rgba(255, 255, 255, ${0.5 * (1 - elapsed / 180)})`;
        flashRows.forEach((row) => ctx.fillRect(0, row * CELL, COLS * CELL, CELL));
      } else {
        flashRows = [];
      }
    }
  }

  function frame(timestamp) {
    if (!lastTime) lastTime = timestamp;
    const delta = Math.min(timestamp - lastTime, 100);
    lastTime = timestamp;

    if (state === 'playing') {
      const interval = Math.max(70, 800 * Math.pow(0.82, level - 1));
      dropTime += delta;
      while (dropTime >= interval && state === 'playing') {
        dropTime -= interval;
        stepDown(false);
      }
    }

    renderBoard();
    window.requestAnimationFrame(frame);
  }

  showOverlay('READY?', '테트리스', '7가지 색상의 블록으로 라인을 완성해 보세요.', '게임 시작');
  drawPreview(holdCtx, null);
  updateUI();
  window.requestAnimationFrame(frame);
})();
