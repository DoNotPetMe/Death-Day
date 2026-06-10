/* Fine-grained: ONE subject alone in the world; per-6-frame dump of the
   quantities the balance gate uses. Run: node test/stand_trace2.js */
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
function makeElement() {
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
  getElementById: (id) => { if (!elements.has(id)) elements.set(id, makeElement()); return elements.get(id); },
  createElement: () => makeElement(),
  addEventListener() {},
  body: makeElement(),
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
const b = DD.Ragdoll.make(G.world, 900, 1200, 'subject');
const D = b.data, bo = D.bones;

let t = 0;
console.log('frame | pelvY ftLdy ftRdy up offBal fallen | pelvVy headY');
for (let fr = 0; fr <= 180; fr++) {
  if (fr % 6 === 0) {
    const sp = Math.hypot(bo.head.x - bo.pelvis.x, bo.head.y - bo.pelvis.y);
    const up = ((bo.pelvis.y - bo.head.y) / Math.max(1, sp)).toFixed(2);
    console.log(
      `${String(fr).padStart(4)} | ${bo.pelvis.y.toFixed(1)} ${(bo.ftL.y - bo.pelvis.y).toFixed(1)} ${(bo.ftR.y - bo.pelvis.y).toFixed(1)} ` +
      `${up} ${(D.offBal || 0).toFixed(2)} ${D.fallen ? 1 : 0} | ${(bo.pelvis.vy * 180).toFixed(0)} ${bo.head.y.toFixed(1)}`
    );
  }
  t += 1000 / 60;
  const q = rafQueue; rafQueue = [];
  for (const fn of q) fn(t);
}
