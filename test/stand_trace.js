/* Diagnostic: replicate the portrait scene headlessly and trace each
   being's pelvis position + state every second. Run: node test/stand_trace.js */
'use strict';
const fs = require('fs');
const path = require('path');
const vm = require('vm');

function makeCtx2d() {
  const grad = { addColorStop() {} };
  return new Proxy({}, {
    get(t, k) {
      if (k === 'createLinearGradient' || k === 'createRadialGradient') return () => grad;
      if (k === 'measureText') return () => ({ width: 10 });
      if (k in t) return t[k];
      return () => {};
    },
    set(t, k, v) { t[k] = v; return true; },
  });
}
function makeElement(tag) {
  const el = {
    children: [], style: {}, dataset: {},
    classList: { add() {}, remove() {}, toggle() {}, contains() { return false; } },
    appendChild(c) { el.children.push(c); return c; },
    addEventListener() {}, removeEventListener() {}, setAttribute() {},
    getBoundingClientRect() { return { left: 0, top: 0, width: 1600, height: 900 }; },
    set innerHTML(v) { el.children = []; }, get innerHTML() { return ''; },
    set textContent(v) {}, get textContent() { return ''; },
    width: 1600, height: 900,
    getContext() { return makeCtx2d(); },
  };
  return el;
}
const elements = new Map();
const documentStub = {
  readyState: 'complete',
  getElementById: (id) => { if (!elements.has(id)) elements.set(id, makeElement('div')); return elements.get(id); },
  createElement: (t) => makeElement(t),
  addEventListener() {},
  body: makeElement('body'),
};
let rafQueue = [];
const windowStub = {
  innerWidth: 1600, innerHeight: 900, devicePixelRatio: 1,
  addEventListener() {},
  requestAnimationFrame(fn) { rafQueue.push(fn); return 1; },
};
const sandbox = {
  window: windowStub, document: documentStub,
  requestAnimationFrame: windowStub.requestAnimationFrame,
  performance: { now: () => Date.now() }, console,
  Math, Map, Set,
};
sandbox.window.performance = sandbox.performance;
vm.createContext(sandbox);
for (const f of ['audio.js', 'physics.js', 'effects.js', 'ragdoll.js', 'items.js', 'game.js', 'ui.js', 'main.js']) {
  vm.runInContext(fs.readFileSync(path.join(__dirname, '..', 'js', f), 'utf8'), sandbox, { filename: f });
  sandbox.DD = sandbox.window.DD;
}
const DD = sandbox.DD, G = DD.Game;
G.clearAll();
const GY = 1280;

const subjects = {
  amp: DD.Ragdoll.make(G.world, 780, GY - 80, 'subject'),
  sub: DD.Ragdoll.make(G.world, 920, GY - 80, 'subject'),
  husk: DD.Ragdoll.make(G.world, 1030, GY - 80, 'husk'),
  bot: DD.Ragdoll.make(G.world, 1140, GY - 80, 'automaton'),
};
DD.Ragdoll.sever(subjects.amp, 'forearmL');

let t = 0;
function frames(n) {
  for (let i = 0; i < n; i++) {
    t += 1000 / 60;
    const q = rafQueue; rafQueue = [];
    for (const fn of q) fn(t);
  }
}
console.log('sec | name: pelvisX (Δhome) up fallen stun blood');
for (let sec = 0; sec <= 10; sec++) {
  const line = [];
  for (const [nm, b] of Object.entries(subjects)) {
    const D = b.data, bo = D.bones;
    const sp = Math.hypot(bo.head.x - bo.pelvis.x, bo.head.y - bo.pelvis.y);
    const up = ((bo.pelvis.y - bo.head.y) / Math.max(1, sp)).toFixed(2);
    line.push(`${nm}: x=${bo.pelvis.x.toFixed(0)} up=${up} fall=${D.fallen ? 1 : 0} stun=${D.stun.toFixed(1)} bl=${D.blood.toFixed(0)}`);
  }
  console.log(`t=${sec}s  ${line.join(' | ')}`);
  frames(60);
}
