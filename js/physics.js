/* DEATH DAY — custom Verlet physics engine.
   Every object is built from round particles linked by distance constraints:
   ragdolls are jointed particle skeletons, crates are braced corner frames.
   Dismemberment falls out of the model for free — break a constraint and
   the limb is gone. No external libraries.

   Units: pixels, seconds. The world simulates with fixed substeps. */
(function () {
  const DD = (window.DD = window.DD || {});

  let NEXT_ID = 1;

  /* ------------------------------------------------------------------ */
  class Particle {
    constructor(x, y, r, opts = {}) {
      this.id = NEXT_ID++;
      this.x = x; this.y = y;
      this.px = x; this.py = y;          // previous position (verlet velocity)
      this.r = r;
      this.mass = opts.mass != null ? opts.mass : r * r * 0.05;
      this.invMass = this.mass > 0 ? 1 / this.mass : 0;
      this.pinned = false;
      this.pinX = 0; this.pinY = 0;
      this.friction = opts.friction != null ? opts.friction : 0.25;
      this.bounce = opts.bounce != null ? opts.bounce : 0.1;
      this.material = opts.material || 'solid';   // flesh | wood | metal | solid
      this.body = null;
      this.near = null;                  // particle ids within 2 constraint hops (no collide)
      // gameplay state
      this.hp = opts.hp != null ? opts.hp : Infinity;
      this.burn = 0;                     // seconds of fire remaining
      this.char = 0;                     // 0..1 scorched
      this.sharp = !!opts.sharp;
      this.meta = opts.meta || null;     // body-part info etc.
    }
    get vx() { return this.x - this.px; }
    get vy() { return this.y - this.py; }
    setVel(vx, vy) { this.px = this.x - vx; this.py = this.y - vy; }
    addVel(vx, vy) { this.px -= vx; this.py -= vy; }
    moveTo(x, y) { const vx = this.vx, vy = this.vy; this.x = x; this.y = y; this.px = x - vx; this.py = y - vy; }
    pin() { this.pinned = true; this.pinX = this.x; this.pinY = this.y; }
    unpin() { this.pinned = false; }
  }

  /* ------------------------------------------------------------------ */
  class Constraint {
    /* type: 'rod' exact length | 'min' only pushes apart | 'max' only pulls in */
    constructor(p1, p2, opts = {}) {
      this.p1 = p1; this.p2 = p2;
      this.len = opts.len != null ? opts.len : Math.hypot(p2.x - p1.x, p2.y - p1.y);
      this.stiff = opts.stiff != null ? opts.stiff : 1;
      this.type = opts.type || 'rod';
      this.breakStretch = opts.breakStretch || 0;   // 0 = unbreakable
      this.broken = false;
      this.joint = opts.joint || null;              // severable joint name
      this.hidden = !!opts.hidden;                  // brace, not drawn
    }
    solve() {
      const p1 = this.p1, p2 = this.p2;
      let dx = p2.x - p1.x, dy = p2.y - p1.y;
      let d = Math.hypot(dx, dy);
      if (d < 1e-6) { dx = 0.01; dy = 0; d = 0.01; }
      if (this.type === 'min' && d >= this.len) return;
      if (this.type === 'max' && d <= this.len) return;
      const diff = (d - this.len) / d;
      const w = p1.invMass + p2.invMass;
      if (w === 0) return;
      const k = this.stiff * diff / w;
      if (!p1.pinned) { p1.x += dx * k * p1.invMass; p1.y += dy * k * p1.invMass; }
      if (!p2.pinned) { p2.x -= dx * k * p2.invMass; p2.y -= dy * k * p2.invMass; }
    }
    stretched() {
      const d = Math.hypot(this.p2.x - this.p1.x, this.p2.y - this.p1.y);
      return this.len > 0 ? d / this.len : 1;
    }
  }

  /* ------------------------------------------------------------------ */
  class Body {
    constructor(kind, data = {}) {
      this.id = NEXT_ID++;
      this.kind = kind;          // 'ragdoll' | 'gun' | 'crate' | ...
      this.data = data;
      this.particles = [];
      this.constraints = [];
      this.dead = false;         // flagged for removal
      this.render = null;        // fn(ctx, body)
      this.update = null;        // fn(dt, body)
      this.onActivate = null;    // fn(body) — single press
      this.onHold = null;        // fn(dt, body) — while activate held
      this.onBreak = null;       // fn(constraint, body)
      this.onHit = null;         // fn(particle, dmg, info)
    }
    addP(x, y, r, opts) { const p = new Particle(x, y, r, opts); p.body = this; this.particles.push(p); return p; }
    link(p1, p2, opts) { const c = new Constraint(p1, p2, opts); this.constraints.push(c); return c; }
    center() {
      let x = 0, y = 0, n = 0;
      for (const p of this.particles) { x += p.x; y += p.y; n++; }
      return n ? { x: x / n, y: y / n } : { x: 0, y: 0 };
    }
    translate(dx, dy) {
      for (const p of this.particles) { p.x += dx; p.y += dy; p.px += dx; p.py += dy; if (p.pinned) { p.pinX += dx; p.pinY += dy; } }
    }
    addVel(vx, vy) { for (const p of this.particles) p.addVel(vx, vy); }
    /* rebuild the 2-hop neighbour sets used to skip self-collision at joints */
    buildNear() {
      const adj = new Map();
      for (const p of this.particles) adj.set(p.id, new Set());
      for (const c of this.constraints) {
        if (c.broken) continue;
        adj.get(c.p1.id).add(c.p2.id);
        adj.get(c.p2.id).add(c.p1.id);
      }
      for (const p of this.particles) {
        const near = new Set();
        for (const a of adj.get(p.id)) {
          near.add(a);
          for (const b of adj.get(a)) near.add(b);
        }
        near.delete(p.id);
        p.near = near;
      }
    }
  }

  /* ------------------------------------------------------------------ */
  class SpatialHash {
    constructor(cell) { this.cell = cell; this.map = new Map(); }
    key(cx, cy) { return cx * 73856093 ^ cy * 19349663; }
    clear() { this.map.clear(); }
    insert(p) {
      const c = this.cell;
      const x0 = Math.floor((p.x - p.r) / c), x1 = Math.floor((p.x + p.r) / c);
      const y0 = Math.floor((p.y - p.r) / c), y1 = Math.floor((p.y + p.r) / c);
      for (let cx = x0; cx <= x1; cx++) for (let cy = y0; cy <= y1; cy++) {
        const k = this.key(cx, cy);
        let arr = this.map.get(k);
        if (!arr) { arr = []; this.map.set(k, arr); }
        arr.push(p);
      }
    }
    /* visit candidate particles near a circle */
    query(x, y, r, fn) {
      const c = this.cell;
      const x0 = Math.floor((x - r) / c), x1 = Math.floor((x + r) / c);
      const y0 = Math.floor((y - r) / c), y1 = Math.floor((y + r) / c);
      const seen = new Set();
      for (let cx = x0; cx <= x1; cx++) for (let cy = y0; cy <= y1; cy++) {
        const arr = this.map.get(this.key(cx, cy));
        if (!arr) continue;
        for (const p of arr) {
          if (seen.has(p.id)) continue;
          seen.add(p.id);
          fn(p);
        }
      }
    }
  }

  /* ------------------------------------------------------------------ */
  class World {
    constructor(w, h) {
      this.w = w; this.h = h;
      this.gravity = 1700;            // px/s^2
      this.gravityOn = true;
      this.bodies = [];
      this.statics = [];              // {x,y,w,h} axis-aligned solids
      this.hash = new SpatialHash(52);
      this.substeps = 3;
      this.iterations = 6;
      this.brokenThisStep = [];       // [{constraint, body}] for gameplay reactions
      this.maxSpeed = 4200;           // px/s velocity clamp
    }

    addBody(b) { this.bodies.push(b); b.buildNear(); return b; }
    removeBody(b) {
      b.dead = true;
      const i = this.bodies.indexOf(b);
      if (i >= 0) this.bodies.splice(i, 1);
    }
    addStatic(x, y, w, h, deco) { this.statics.push({ x, y, w, h, deco: deco || 'slab' }); }

    allParticles() {
      const out = [];
      for (const b of this.bodies) for (const p of b.particles) out.push(p);
      return out;
    }

    step(dt) {
      this.brokenThisStep.length = 0;
      const sdt = dt / this.substeps;
      this.curSdt = sdt;
      for (let s = 0; s < this.substeps; s++) {
        this.integrate(sdt);
        for (let it = 0; it < this.iterations; it++) {
          this.solveConstraints();
          if (it % 2 === 0) this.collide();
          this.collideStatics();
        }
        this.checkBreaks();
      }
    }

    integrate(dt) {
      const g = this.gravityOn ? this.gravity : 0;
      const damp = 0.999;
      const maxD = this.maxSpeed * dt;
      for (const b of this.bodies) for (const p of b.particles) {
        if (p.pinned) { p.x = p.pinX; p.y = p.pinY; p.px = p.x; p.py = p.y; continue; }
        let vx = (p.x - p.px) * damp;
        let vy = (p.y - p.py) * damp;
        const sp = Math.hypot(vx, vy);
        if (sp > maxD) { vx *= maxD / sp; vy *= maxD / sp; }
        p.px = p.x; p.py = p.y;
        p.x += vx;
        p.y += vy + g * dt * dt;
      }
    }

    solveConstraints() {
      for (const b of this.bodies) for (const c of b.constraints) {
        if (!c.broken && !c.disabled) c.solve();
      }
    }

    checkBreaks() {
      for (const b of this.bodies) {
        let any = false;
        for (const c of b.constraints) {
          if (c.broken || !c.breakStretch) continue;
          if (c.stretched() > c.breakStretch) {
            c.broken = true; any = true;
            this.brokenThisStep.push({ constraint: c, body: b });
          }
        }
        if (any) b.buildNear();
      }
    }

    collide() {
      const hash = this.hash;
      hash.clear();
      for (const b of this.bodies) for (const p of b.particles) hash.insert(p);
      for (const b of this.bodies) for (const p of b.particles) {
        hash.query(p.x, p.y, p.r + 26, (q) => {
          if (q.id <= p.id) return;                            // each pair once
          if (q.body === p.body && p.near && p.near.has(q.id)) return;
          const dx = q.x - p.x, dy = q.y - p.y;
          const rs = p.r + q.r;
          const d2 = dx * dx + dy * dy;
          if (d2 >= rs * rs || d2 < 1e-9) return;
          const d = Math.sqrt(d2);
          const nx = dx / d, ny = dy / d;
          const overlap = rs - d;
          const w = p.invMass + q.invMass;
          if (w === 0) return;
          const sep = overlap / w;
          if (!p.pinned) { p.x -= nx * sep * p.invMass; p.y -= ny * sep * p.invMass; }
          if (!q.pinned) { q.x += nx * sep * q.invMass; q.y += ny * sep * q.invMass; }
          // tangential friction: bleed off relative sliding velocity
          const rvx = q.vx - p.vx, rvy = q.vy - p.vy;
          const tx = -ny, ty = nx;
          const vt = rvx * tx + rvy * ty;
          const mu = (p.friction + q.friction) * 0.5 * 0.5;
          const ft = vt * mu / w;
          if (!p.pinned) { p.px -= tx * ft * p.invMass; p.py -= ty * ft * p.invMass; }
          if (!q.pinned) { q.px += tx * ft * q.invMass; q.py += ty * ft * q.invMass; }
          if (this.onContact) this.onContact(p, q, d);
        });
      }
    }

    collideStatics() {
      for (const b of this.bodies) for (const p of b.particles) {
        if (p.pinned) continue;
        // world bounds
        if (p.x < p.r) p.x = p.r;
        if (p.x > this.w - p.r) p.x = this.w - p.r;
        if (p.y < p.r) p.y = p.r;
        if (p.y > this.h - p.r) p.y = this.h - p.r;
        for (const s of this.statics) {
          // closest point on rect to particle centre
          const cx = Math.max(s.x, Math.min(p.x, s.x + s.w));
          const cy = Math.max(s.y, Math.min(p.y, s.y + s.h));
          let dx = p.x - cx, dy = p.y - cy;
          const d2 = dx * dx + dy * dy;
          if (d2 >= p.r * p.r) continue;
          if (d2 > 1e-9) {
            const d = Math.sqrt(d2);
            const push = (p.r - d) / d;
            p.x += dx * push; p.y += dy * push;
            // friction + bounce along the contact normal
            const nx = dx / d, ny = dy / d;
            const vn = p.vx * nx + p.vy * ny;
            const tx = -ny, ty = nx;
            const vt = p.vx * tx + p.vy * ty;
            const nvn = vn < 0 ? -vn * p.bounce : vn;
            const nvt = vt * (1 - p.friction);
            p.setVel(nx * nvn + tx * nvt, ny * nvn + ty * nvt);
            if (vn < 0 && this.onStaticHit) this.onStaticHit(p, -vn);
          } else {
            // centre inside the rect: push out along the smallest axis
            const l = p.x - s.x + p.r, r = s.x + s.w - p.x + p.r;
            const t = p.y - s.y + p.r, bo = s.y + s.h - p.y + p.r;
            const m = Math.min(l, r, t, bo);
            if (m === t) p.y = s.y - p.r;
            else if (m === bo) p.y = s.y + s.h + p.r;
            else if (m === l) p.x = s.x - p.r;
            else p.x = s.x + s.w + p.r;
            p.px = p.x; p.py = p.y;
          }
        }
      }
    }

    /* segment raycast vs particles + statics. Returns sorted hits. */
    raycast(x0, y0, x1, y1, skipBody) {
      const hits = [];
      const dx = x1 - x0, dy = y1 - y0;
      const len = Math.hypot(dx, dy);
      if (len < 1e-6) return hits;
      const ux = dx / len, uy = dy / len;
      for (const b of this.bodies) {
        if (b === skipBody) continue;
        for (const p of b.particles) {
          // circle vs segment
          const fx = p.x - x0, fy = p.y - y0;
          const t = Math.max(0, Math.min(len, fx * ux + fy * uy));
          const cx = x0 + ux * t, cy = y0 + uy * t;
          const dd = Math.hypot(p.x - cx, p.y - cy);
          if (dd <= p.r) hits.push({ t, particle: p, x: cx, y: cy });
        }
      }
      // statics: coarse stepping (good enough for wall sparks)
      for (const s of this.statics) {
        const steps = Math.ceil(len / 6);
        for (let i = 0; i <= steps; i++) {
          const t = (len * i) / steps;
          const x = x0 + ux * t, y = y0 + uy * t;
          if (x >= s.x && x <= s.x + s.w && y >= s.y && y <= s.y + s.h) {
            hits.push({ t, particle: null, static: s, x, y });
            break;
          }
        }
      }
      hits.sort((a, b) => a.t - b.t);
      return hits;
    }

    /* nearest particle to a point (for grabbing / tools) */
    pick(x, y, maxR) {
      let best = null, bd = maxR;
      for (const b of this.bodies) for (const p of b.particles) {
        const d = Math.hypot(p.x - x, p.y - y) - p.r;
        if (d < bd) { bd = d; best = p; }
      }
      return best;
    }

    queryCircle(x, y, r, fn) {
      for (const b of this.bodies) for (const p of b.particles) {
        const d = Math.hypot(p.x - x, p.y - y);
        if (d <= r + p.r) fn(p, d);
      }
    }
  }

  DD.Physics = { Particle, Constraint, Body, World };
})();
