/* Headless smoke test: stubs the DOM/canvas, loads every game module,
   boots the game, spawns every catalogue item, fires/activates them,
   detonates explosives, severs limbs, and runs several seconds of
   simulation while checking for exceptions and NaN poisoning.

   Run: node test/smoke.js */
'use strict';
const fs = require('fs');
const path = require('path');
const vm = require('vm');

/* ---------------- DOM / canvas stubs ---------------- */
function makeCtx2d() {
  const grad = { addColorStop() {} };
  return new Proxy({}, {
    get(t, k) {
      if (k === 'createLinearGradient' || k === 'createRadialGradient') return () => grad;
      if (k === 'measureText') return () => ({ width: 10 });
      if (k === 'getImageData') return () => ({ data: new Uint8ClampedArray(4) });
      if (k in t) return t[k];
      return () => {};
    },
    set(t, k, v) { t[k] = v; return true; },
  });
}

function makeElement(tag) {
  const el = {
    tagName: (tag || 'div').toUpperCase(),
    children: [],
    style: {},
    dataset: {},
    classList: { add() {}, remove() {}, toggle() {}, contains() { return false; } },
    listeners: {},
    appendChild(c) { el.children.push(c); return c; },
    addEventListener(t, fn) { (el.listeners[t] = el.listeners[t] || []).push(fn); },
    removeEventListener() {},
    setAttribute() {}, getAttribute() { return null; },
    getBoundingClientRect() { return { left: 0, top: 0, width: 1280, height: 720, right: 1280, bottom: 720 }; },
    set innerHTML(v) { el.children = []; }, get innerHTML() { return ''; },
    set textContent(v) { el._txt = v; }, get textContent() { return el._txt || ''; },
    width: 1280, height: 720,
    getContext() { return makeCtx2d(); },
  };
  return el;
}

const elements = new Map();
function getEl(id) {
  if (!elements.has(id)) elements.set(id, makeElement('div'));
  return elements.get(id);
}

const documentStub = {
  readyState: 'complete',
  getElementById: getEl,
  createElement: (tag) => makeElement(tag),
  addEventListener() {},
  body: makeElement('body'),
};

let rafQueue = [];
const windowStub = {
  innerWidth: 1280,
  innerHeight: 720,
  devicePixelRatio: 1,
  addEventListener() {},
  requestAnimationFrame(fn) { rafQueue.push(fn); return rafQueue.length; },
  AudioContext: undefined, // audio silently disabled headless
};

const sandbox = {
  window: windowStub,
  document: documentStub,
  requestAnimationFrame: windowStub.requestAnimationFrame,
  performance: { now: () => Date.now() },
  console,
  Math, JSON, Map, Set, Uint8ClampedArray, Infinity, NaN,
};
sandbox.window.performance = sandbox.performance;
sandbox.globalThis = sandbox;
vm.createContext(sandbox);

/* ---------------- load modules ---------------- */
const files = ['audio.js', 'physics.js', 'effects.js', 'ragdoll.js', 'items.js', 'game.js', 'ui.js', 'main.js'];
for (const f of files) {
  const src = fs.readFileSync(path.join(__dirname, '..', 'js', f), 'utf8');
  vm.runInContext(src, sandbox, { filename: f });
  // in a real browser `window.DD` is also the bare global `DD`
  sandbox.DD = sandbox.window.DD;
}

const DD = sandbox.window.DD;
const G = DD.Game;
if (!G || !G.world) throw new Error('game did not boot');

/* ---------------- helpers ---------------- */
let frameTime = 0;
function runFrames(n) {
  for (let i = 0; i < n; i++) {
    frameTime += 1000 / 60;
    const q = rafQueue; rafQueue = [];
    for (const fn of q) fn(frameTime);
  }
}
function assertSane(label) {
  for (const b of G.world.bodies) for (const p of b.particles) {
    if (!isFinite(p.x) || !isFinite(p.y)) {
      throw new Error(`NaN/Inf position after: ${label} (body=${b.kind})`);
    }
  }
}

/* ---------------- the gauntlet ---------------- */
runFrames(30);
assertSane('boot');
console.log(`boot ok — bodies=${G.world.bodies.length}`);

// spawn one of everything in a line
let x = 200;
const spawned = [];
for (const item of DD.Items.registry) {
  const b = item.make(G.world, x, 900);
  spawned.push({ item, b });
  x += 130;
}
runFrames(90);
assertSane('spawn all');
console.log(`spawned all ${spawned.length} items ok — bodies=${G.world.bodies.length}`);

// activate everything (fire guns, prime grenades, toggle rods, use serum)
for (const { item, b } of spawned) {
  if (b.dead) continue;
  if (b.onActivate) b.onActivate(b);
  if (b.onHold) b.onHold(1 / 60, b);
}
runFrames(300); // long enough for grenade fuses
assertSane('activate all');
console.log('activated everything ok (guns fired, explosives detonated)');

// point-blank shotgun into a ragdoll
const rag = DD.Ragdoll.make(G.world, 1500, 1100, 'subject');
const sg = DD.Items.registry.find((r) => r.id === 'shotgun').make(G.world, 1400, 1100);
for (let i = 0; i < 6; i++) { sg.data.cd = 0; sg.onActivate(sg); runFrames(10); }
assertSane('shotgun');
console.log(`shotgun ok — subject blood=${rag.data.blood.toFixed(1)} alive=${rag.data.alive}`);

// explosion right on top of a fresh subject -> dismemberment path
const rag2 = DD.Ragdoll.make(G.world, 1800, 1100, 'subject');
G.explode(1800, 1060, 1500, 240);
runFrames(120);
assertSane('explosion');
const brokenJoints = rag2.constraints.filter((c) => c.broken).length;
console.log(`explosion ok — broken constraints on subject: ${brokenJoints}`);

// direct sever + burning + electrocution + revive
const rag3 = DD.Ragdoll.make(G.world, 600, 1100, 'subject');
DD.Ragdoll.severAt(rag3.data.bones.haL);
DD.Ragdoll.electrocute(rag3, 1.0);
for (const p of rag3.particles) p.burn = 2;
runFrames(180);
assertSane('status effects');
DD.Ragdoll.kill(rag3, false);
const revived = DD.Ragdoll.revive(rag3);
console.log(`statuses ok — revive=${revived} blood=${rag3.data.blood}`);

// grab + drag a body across the world
G.grab = rag3.particles[0];
G.mouse.x = 2000; G.mouse.y = 600;
runFrames(60);
G.grab = null;
assertSane('drag');
console.log('drag ok');

// UI menu selection / ghost / spawn path
G.select(DD.Items.registry[0]);
if (!G.ghost) throw new Error('ghost not built');
runFrames(5);
G.select(null);
console.log('selection/ghost ok');

// toggles
G.togglePause(); runFrames(10); G.togglePause();
G.toggleSlow(); runFrames(10); G.toggleSlow();
G.toggleGravity(); runFrames(10); G.toggleGravity();
runFrames(30);
assertSane('toggles');
console.log('toggles ok');

// clear all
G.clearAll();
if (G.world.bodies.length !== 0) throw new Error('clearAll left bodies behind');
runFrames(30);
console.log('clearAll ok');

// long soak: pile of subjects + crates + a det pack
for (let i = 0; i < 5; i++) DD.Ragdoll.make(G.world, 1200 + i * 40, 1000 - i * 120, i % 2 ? 'husk' : 'subject');
for (let i = 0; i < 4; i++) DD.Items.registry.find((r) => r.id === 'crate').make(G.world, 1300, 1100 - i * 70);
const dp = DD.Items.registry.find((r) => r.id === 'detpack').make(G.world, 1250, 1150);
dp.onActivate(dp);
runFrames(600);
assertSane('soak');
console.log(`soak ok — bodies=${G.world.bodies.length}, fx=${DD.FX.count}`);

console.log('\nALL SMOKE TESTS PASSED');
