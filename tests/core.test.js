const assert = require('node:assert/strict');
const Core = require('../tetris-core.js');

let passed = 0;
function test(name, fn) {
  fn();
  passed += 1;
  console.log(`PASS  ${name}`);
}

test('7종 블록과 각각 다른 색상이 정의되어 있다', () => {
  assert.equal(Core.TYPES.length, 7);
  assert.equal(new Set(Object.values(Core.COLORS)).size, 7);
  for (const type of Core.TYPES) assert.ok(Core.COLORS[type], `${type} 색상 없음`);
});

test('7-bag은 7종 블록을 모두 포함한다', () => {
  const bag = Core.shuffleBag();
  assert.equal(bag.length, 7);
  assert.deepEqual([...bag].sort(), [...Core.TYPES].sort());
});

test('블록은 보드 안쪽에서 시작한다', () => {
  for (const type of Core.TYPES) {
    const piece = Core.createPiece(type);
    assert.equal(Core.collides(Core.createBoard(), piece), false, `${type} 생성 위치 충돌`);
    assert.ok(piece.x >= 0 && piece.x < Core.COLS);
  }
});

test('좌우/하단 경계를 벗어나면 충돌이다', () => {
  const board = Core.createBoard();
  const piece = Core.createPiece('I');
  assert.equal(Core.collides(board, { ...piece, x: -1 }), true);
  assert.equal(Core.collides(board, { ...piece, x: Core.COLS - 3 }), true);
  assert.equal(Core.collides(board, { ...piece, y: Core.ROWS - 1 }), true);
  assert.equal(Core.collides(board, { ...piece, y: Core.ROWS - 3 }), false);
});

test('4회 회전하면 원래 모양으로 돌아온다', () => {
  for (const type of Core.TYPES) {
    let piece = Core.createPiece(type);
    const original = JSON.stringify(piece.matrix);
    for (let i = 0; i < 4; i += 1) {
      const rotated = Core.rotate(Core.createBoard(), piece, 1);
      assert.ok(rotated, `${type} 회전 실패`);
      piece = rotated;
    }
    assert.equal(JSON.stringify(piece.matrix), original, `${type} 회전 후 원형이 아님`);
  }
});

test('시계/반시계 회전이 서로 반대 방향이다', () => {
  const piece = Core.createPiece('T');
  const cw = Core.rotate(Core.createBoard(), piece, 1);
  const ccw = Core.rotate(Core.createBoard(), piece, -1);
  assert.notDeepEqual(cw.matrix, ccw.matrix);
  assert.deepEqual(Core.rotate(Core.createBoard(), ccw, 1).matrix, piece.matrix);
});

test('merge는 원래 보드를 변경하지 않고 블록을 고정한다', () => {
  const board = Core.createBoard();
  const before = JSON.stringify(board);
  const piece = Core.createPiece('O');
  const merged = Core.merge(board, piece);
  assert.equal(JSON.stringify(board), before);
  assert.equal(merged[0][piece.x], 'O');
  assert.equal(merged[0][piece.x + 1], 'O');
});

test('꽉 찬 줄을 제거하고 빈 줄을 위에 채운다', () => {
  const board = Core.createBoard();
  board[19] = Array(Core.COLS).fill('I');
  board[18][0] = 'T';
  const result = Core.clearLines(board);
  assert.equal(result.cleared, 1);
  assert.equal(result.board.length, Core.ROWS);
  assert.ok(result.board[0].every((cell) => cell === null));
  assert.equal(result.board[19][0], 'T');
});

test('여러 줄을 동시에 제거할 수 있다', () => {
  const board = Core.createBoard();
  board[18] = Array(Core.COLS).fill('Z');
  board[19] = Array(Core.COLS).fill('S');
  assert.equal(Core.clearLines(board).cleared, 2);
});

test('고스트 블록은 바닥 바로 위에 위치한다', () => {
  const board = Core.createBoard();
  const piece = Core.createPiece('T');
  const ghostY = Core.getGhostY(board, piece);
  assert.equal(ghostY, Core.ROWS - 2);
  assert.equal(Core.collides(board, { ...piece, y: ghostY }), false);
  assert.equal(Core.collides(board, { ...piece, y: ghostY + 1 }), true);
});

test('줄 수에 따른 점수표가 정의되어 있다', () => {
  assert.deepEqual(Core.LINE_SCORES, [0, 100, 300, 500, 800]);
});

console.log(`\n${passed}개 테스트 모두 통과했습니다.`);
