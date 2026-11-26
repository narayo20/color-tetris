/* DOM/Canvas를 모의하여 game.js 전체를 실행하고 실제 조작 흐름을 검증합니다. */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const Core = require('../tetris-core.js');

const context2d = {
  fillStyle: '', strokeStyle: '', lineWidth: 1, globalAlpha: 1,
  setTransform() {}, fillRect() {}, clearRect() {}, beginPath() {},
  moveTo() {}, lineTo() {}, stroke() {}, save() {}, restore() {}, strokeRect() {}
};

function makeCanvas() {
  return { width: 0, height: 0, style: {}, getContext: () => context2d };
}

function makeElement(id) {
  const listeners = {};
  const classes = new Set();
  return {
    id,
    textContent: '',
    style: {},
    dataset: {},
    listeners,
    classList: {
      add: (name) => classes.add(name),
      remove: (name) => classes.delete(name),
      contains: (name) => classes.has(name)
    },
    addEventListener(type, fn) {
      (listeners[type] ||= []).push(fn);
    },
    setAttribute() {},
    fire(type, event) {
      (listeners[type] || []).forEach((fn) => fn(event));
    }
  };
}

const elements = {};
const ids = ['board', 'next', 'hold', 'score', 'high-score', 'lines', 'level',
  'overlay', 'overlay-kicker', 'overlay-title', 'overlay-desc', 'overlay-btn', 'sound-btn'];
ids.forEach((id) => { elements[id] = id === 'board' || id === 'next' || id === 'hold' ? makeCanvas() : makeElement(id); });
// 캔버스에도 이벤트/클래스 API가 필요하지는 않지만 일관된(el) 형태로 사용합니다.
elements.board = Object.assign(makeCanvas(), makeElement('board'));
elements.next = Object.assign(makeCanvas(), makeElement('next'));
elements.hold = Object.assign(makeCanvas(), makeElement('hold'));

const buttons = ['pause', 'hold', 'left', 'down', 'right', 'rotate', 'hard'].map((action) => {
  const button = makeElement(`btn-${action}`);
  button.dataset.action = action;
  return button;
});

const keyListeners = [];
const frameCallbacks = [];

global.window = {
  devicePixelRatio: 2,
  TetrisCore: Core,
  addEventListener(type, fn) {
    if (type === 'keydown') keyListeners.push(fn);
  },
  requestAnimationFrame(fn) {
    frameCallbacks.push(fn);
    return frameCallbacks.length;
  },
  setInterval: () => 1,
  clearInterval: () => {}
};

global.document = {
  hidden: false,
  getElementById(id) {
    if (!elements[id]) elements[id] = makeElement(id);
    return elements[id];
  },
  querySelectorAll(selector) {
    assert.equal(selector, '[data-action]');
    return buttons;
  },
  addEventListener() {}
};

global.localStorage = { getItem: () => null, setItem: () => {} };

const source = fs.readFileSync(path.join(__dirname, '..', 'game.js'), 'utf8');
vm.runInThisContext(source, { filename: 'game.js' });

assert.equal(elements['overlay-title'].textContent, '테트리스', '시작 화면이 표시되지 않음');
assert.equal(elements.score.textContent, '0');

const press = (key) => keyListeners.forEach((fn) => fn({ key, preventDefault() {} }));
elements['overlay-btn'].fire('click');
assert.ok(elements.overlay.classList.contains('is-hidden'), '게임 시작 후 오버레이가 남아 있음');

['ArrowLeft', 'ArrowRight', 'ArrowUp', 'z', 'ArrowDown', 'c', ' ', 'p', 'p', 'r'].forEach(press);

buttons.find((button) => button.dataset.action === 'left').fire('pointerdown', { preventDefault() {}, pointerId: 1 });
buttons.find((button) => button.dataset.action === 'left').fire('pointerup', {});
buttons.find((button) => button.dataset.action === 'hard').fire('pointerdown', { preventDefault() {}, pointerId: 1 });

// 프레임 루프를 여러 번 돌려 중력 처리와 렌더링 경로를 실행합니다.
let now = 0;
for (let i = 0; i < 300 && frameCallbacks.length > 0; i += 1) {
  const callback = frameCallbacks.shift();
  now += 50;
  callback(now);
}
assert.ok(frameCallbacks.length > 0, '프레임 루프가 중단됨');

console.log('PASS  game.js 초기화/키보드/터치/프레임 루프 실행 (런타임 오류 없음)');
console.log('\n스모크 테스트 통과했습니다.');
