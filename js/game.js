/* DEATH DAY — the facility itself.
   World construction, camera, tools & input, explosions, fire spread,
   blade contact, electrocution contact, the fixed-step simulation loop
   and all world-space rendering. */
(function () {
  const DD = (window.DD = window.DD || {});
  const FX = () => DD.FX;

  const WORLD_W = 2600, WORLD_H = 1400;
  const GROUND_Y = 1280;
  const STEP = 1 / 60;

  const G = {
    world: null,
    canvas: null, ctx: null,
    cam: { x: WORLD_W / 2, y: GROUND_Y - 260, zoom: 1 },
    mouse: { x: 0, y: 0, sx: 0, sy: 0, down: false, rdown: false },
    grab: null,            // grabbed particle
    hover: null,           // hovered body
    holdActive: false,     // activate held (RMB or F)
    selected: null,        // selected catalogue item
    ghost: null,           // preview body for placement
    paused: false,
    slow: false,
    time: 0,
    acc: 0,
    last: 0,
    fps: 60, fpsAcc: 0, fpsN: 0,
    keys: {},
    onSelectChange: null,
    statusEl: null,
  };
  DD.Game = G;

  /* ================= world setup ================= */
  function buildWorld() {
    const w = new DD.Physics.World(WORLD_W, WORLD_H);
    // floor + side walls
    w.addStatic(0, GROUND_Y, WORLD_W, WORLD_H - GROUND_Y + 40, 'floor');
    w.addStatic(-40, 0, 40 + 18, WORLD_H, 'wall');
    w.addStatic(WORLD_W - 18, 0, 58, WORLD_H, 'wall');
    // raised test platforms
    w.addStatic(260, 1010, 420, 26, 'plat');
    w.addStatic(1840, 880, 460, 26, 'plat');
    w.addStatic(1180, 1160, 280, 120, 'block');
    w.onContact = onContact;
    w.onStaticHit = onStaticHit;
    return w;
  }

  /* ================= contact gameplay ================= */
  function relSpeed(p, q, sdt) {
    return Math.hypot(p.vx - q.vx, p.vy - q.vy) / sdt;
  }

  function onContact(p, q) {
    const w = G.world;
    const sdt = w.curSdt || STEP / 3;

    // ---- blades cut ----
    let blade = null, victim = null;
    if (p.sharp && !q.sharp) { blade = p; victim = q; }
    else if (q.sharp && !p.sharp) { blade = q; victim = p; }
    if (blade && victim && victim.body !== blade.body) {
      const rel = relSpeed(p, q, sdt);
      if (rel > 300 && (!victim.cutT || G.time - victim.cutT > 0.12)) {
        victim.cutT = G.time;
        const power = blade.cutPower || 1;
        if (victim.material === 'flesh') {
          const dmg = (rel - 220) * 0.05 * power;
          DD.Ragdoll.hit(victim, dmg, { kind: 'cut', dirx: (q.vx - p.vx) / sdt / rel, diry: (q.vy - p.vy) / sdt / rel });
          if (rel > 620 && Math.random() < 0.5 * power) DD.Ragdoll.severAt(victim);
        } else if (victim.material === 'wood') {
          DD.Items.damageParticle(victim, rel * 0.03 * power, {});
        }
      }
    }

    // ---- shock rod ----
    const sh = p.shocker ? p : q.shocker ? q : null;
    if (sh) {
      const o = sh === p ? q : p;
      if (o.body !== sh.body && o.body.kind === 'ragdoll' && (!sh.zapT || G.time - sh.zapT > 0.25)) {
        sh.zapT = G.time;
        DD.Ragdoll.electrocute(o.body, 1.4);
        FX().arc(sh.x, sh.y, o.x, o.y);
        if (DD.Audio) DD.Audio.play('zap');
      }
    }

    // ---- igniter ----
    const ig = p.igniter ? p : q.igniter ? q : null;
    if (ig) {
      const o = ig === p ? q : p;
      if (o.body !== ig.body) DD.Items.ignite(o, 4 + Math.random() * 3);
    }

    // ---- fire spreads on touch ----
    if (p.burn > 0 && q.burn <= 0 && (q.material === 'flesh' || q.material === 'wood') && Math.random() < 0.2) q.burn = 3 + Math.random() * 3;
    if (q.burn > 0 && p.burn <= 0 && (p.material === 'flesh' || p.material === 'wood') && Math.random() < 0.2) p.burn = 3 + Math.random() * 3;

    // ---- blunt impacts hurt flesh ----
    const fl = p.material === 'flesh' ? p : q.material === 'flesh' ? q : null;
    if (fl && (!fl.impT || G.time - fl.impT > 0.2)) {
      const rel = relSpeed(p, q, sdt);
      if (rel > 560) {
        const other = fl === p ? q : p;
        if (other.mass > 1.5) {
          fl.impT = G.time;
          DD.Ragdoll.hit(fl, (rel - 520) * 0.03 * Math.min(3, other.mass / 6), { kind: 'blunt', bleed: rel > 900 });
          if (DD.Audio) DD.Audio.play('thud', 0.6);
        }
      }
    }
  }

  function onStaticHit(p, vnStep) {
    const sdt = G.world.curSdt || STEP / 3;
    const sp = vnStep / sdt;
    if (sp < 620) return;
    if (p.impT && G.time - p.impT < 0.25) return;
    p.impT = G.time;
    if (p.material === 'flesh') {
      DD.Ragdoll.hit(p, (sp - 560) * 0.035, { kind: 'blunt', bleed: sp > 950, diry: -1, dirx: 0 });
      if (DD.Audio) DD.Audio.play('thud');
    } else if (sp > 900) {
      if (DD.Audio) DD.Audio.play('thud', 0.5);
    }
  }

  /* ================= explosions ================= */
  function explode(x, y, power, radius, opts = {}) {
    const w = G.world;
    FX().explosionFx(x, y, radius);
    if (DD.Audio) DD.Audio.play('boom');
    w.queryCircle(x, y, radius, (p, d) => {
      const f = Math.max(0, 1 - d / radius);
      let ux = p.x - x, uy = p.y - y;
      const dl = Math.hypot(ux, uy) || 1;
      ux /= dl; uy /= dl;
      const imp = (power * 2.4 * f) / Math.sqrt(Math.max(1, p.mass));
      p.addVel(ux * imp / 170, (uy * imp - power * 0.25 * f) / 170);
      // damage
      if (p.material === 'flesh') {
        DD.Ragdoll.hit(p, power * 0.045 * f, { kind: 'blast', dirx: ux, diry: uy });
        if (f > 0.62 && Math.random() < 0.75) DD.Ragdoll.severAt(p);
        if (opts.fire || (f > 0.5 && Math.random() < 0.25)) DD.Items.ignite(p, 3 + Math.random() * 3);
      } else if (p.material === 'wood') {
        DD.Items.damageParticle(p, power * 0.06 * f, {});
        if (opts.fire && f > 0.3) DD.Items.ignite(p, 5);
      } else if (p.body && p.body.onHit && p.body.kind === 'explosive') {
        // chain reactions
        p.body.onHit(p, power * 0.05 * f, {});
      }
    });
    // scorch nearby stains
    FX().addStain(x, y, radius * 0.35, '#101113', 0.5);
  }
  G.explode = explode;

  /* ================= burning ================= */
  function updateBurning(dt) {
    for (const b of G.world.bodies) {
      for (const p of b.particles) {
        if (p.burn <= 0) continue;
        p.burn -= dt;
        p.char = Math.min(1, p.char + dt * 0.09);
        if (Math.random() < dt * 22) FX().flame(p.x, p.y - p.r * 0.5, 1);
        if (Math.random() < dt * 3) FX().smoke(p.x, p.y - p.r, 1, true);
        if (Math.random() < dt * 1.2 && DD.Audio) DD.Audio.play('fire', 0.4);
        if (p.material === 'flesh' && b.kind === 'ragdoll') {
          DD.Ragdoll.applyBurn(p, dt);
        } else if (p.material === 'wood') {
          p.hp -= dt * 16;
          if (p.hp <= 0) { DD.Items.shatterAt(p); p.burn = 0; }
        }
      }
    }
  }

  /* ================= selection & spawning ================= */
  function select(item) {
    G.selected = item;
    G.ghost = null;
    if (item) {
      // build a preview body in a throwaway world
      const scratch = new DD.Physics.World(WORLD_W, WORLD_H);
      const b = item.make(scratch, 0, 0);
      const c = b.center();
      G.ghost = { body: b, offs: b.particles.map((p) => ({ p, ox: p.x - c.x, oy: p.y - c.y })) };
    }
    if (G.onSelectChange) G.onSelectChange(item);
  }
  G.select = select;

  function spawnSelected(x, y) {
    const item = G.selected;
    if (!item) return;
    x = Math.max(40, Math.min(WORLD_W - 60, x));
    y = Math.max(40, Math.min(GROUND_Y - 80, y));
    const b = item.make(G.world, x, y);
    b.spawnName = item.name;
    if (DD.Audio) DD.Audio.play('pop', 0.5);
  }

  function deleteBody(b) {
    if (!b) return;
    const c = b.center();
    FX().smoke(c.x, c.y, 6);
    G.world.removeBody(b);
    if (G.grab && G.grab.body === b) G.grab = null;
    if (G.hover === b) G.hover = null;
    if (DD.Audio) DD.Audio.play('pop', 0.4);
  }

  /* ================= input ================= */
  function screenToWorld(sx, sy) {
    const r = G.canvas.getBoundingClientRect();
    const z = G.cam.zoom;
    return {
      x: (sx - r.left - r.width / 2) / z + G.cam.x,
      y: (sy - r.top - r.height / 2) / z + G.cam.y,
    };
  }

  function activate(b, press) {
    if (!b) return;
    if (press && b.onActivate) b.onActivate(b);
    if (DD.Audio) DD.Audio.unlock();
  }

  function hoveredBody() {
    const p = G.world.pick(G.mouse.x, G.mouse.y, 34 / G.cam.zoom);
    return p ? p.body : null;
  }

  function bindInput() {
    const cv = G.canvas;

    cv.addEventListener('mousedown', (e) => {
      DD.Audio && DD.Audio.unlock();
      const m = screenToWorld(e.clientX, e.clientY);
      G.mouse.x = m.x; G.mouse.y = m.y;
      if (e.button === 0) {
        G.mouse.down = true;
        if (G.selected) { spawnSelected(m.x, m.y); return; }
        const p = G.world.pick(m.x, m.y, 36 / G.cam.zoom);
        if (p) G.grab = p;
      } else if (e.button === 2 || e.button === 1) {
        if (G.selected) { select(null); return; }
        const b = G.grab ? G.grab.body : hoveredBody();
        if (b) {
          G.holdActive = true;
          G.activeBody = b;
          activate(b, true);
        } else {
          G.mouse.rdown = true;   // pan
          G.panSX = e.clientX; G.panSY = e.clientY;
          G.panCX = G.cam.x; G.panCY = G.cam.y;
        }
      }
    });

    window.addEventListener('mousemove', (e) => {
      G.mouse.sx = e.clientX; G.mouse.sy = e.clientY;
      const m = screenToWorld(e.clientX, e.clientY);
      G.mouse.x = m.x; G.mouse.y = m.y;
      if (G.mouse.rdown) {
        G.cam.x = G.panCX - (e.clientX - G.panSX) / G.cam.zoom;
        G.cam.y = G.panCY - (e.clientY - G.panSY) / G.cam.zoom;
      }
    });

    window.addEventListener('mouseup', (e) => {
      if (e.button === 0) { G.mouse.down = false; G.grab = null; }
      else { G.mouse.rdown = false; G.holdActive = false; G.activeBody = null; }
    });

    cv.addEventListener('contextmenu', (e) => e.preventDefault());

    cv.addEventListener('wheel', (e) => {
      e.preventDefault();
      const before = screenToWorld(e.clientX, e.clientY);
      const f = e.deltaY > 0 ? 0.9 : 1.111;
      G.cam.zoom = Math.max(0.35, Math.min(3, G.cam.zoom * f));
      const after = screenToWorld(e.clientX, e.clientY);
      G.cam.x += before.x - after.x;
      G.cam.y += before.y - after.y;
    }, { passive: false });

    window.addEventListener('keydown', (e) => {
      if (e.repeat) { G.keys[e.key.toLowerCase()] = true; return; }
      const k = e.key.toLowerCase();
      G.keys[k] = true;
      DD.Audio && DD.Audio.unlock();
      if (k === ' ') { togglePause(); e.preventDefault(); }
      else if (k === 't') toggleSlow();
      else if (k === 'g') toggleGravity();
      else if (k === 'c') FX().clearStains();
      else if (k === 'm') toggleSound();
      else if (k === 'h') toggleHelp();
      else if (k === 'escape') { select(null); hideHelp(); }
      else if (k === 'x' || k === 'delete') deleteBody(G.grab ? G.grab.body : hoveredBody());
      else if (k === 'p') {
        const p = G.world.pick(G.mouse.x, G.mouse.y, 36 / G.cam.zoom);
        if (p) { p.pinned ? p.unpin() : p.pin(); DD.Audio && DD.Audio.play('click'); }
      }
      else if (k === 'f') {
        const b = G.grab ? G.grab.body : hoveredBody();
        if (b) { G.holdActive = true; G.activeBody = b; activate(b, true); }
      }
      else if (k === '+' || k === '=') G.cam.zoom = Math.min(3, G.cam.zoom * 1.15);
      else if (k === '-') G.cam.zoom = Math.max(0.35, G.cam.zoom / 1.15);
    });

    window.addEventListener('keyup', (e) => {
      const k = e.key.toLowerCase();
      G.keys[k] = false;
      if (k === 'f') { G.holdActive = false; G.activeBody = null; }
    });

    window.addEventListener('resize', resize);
  }

  /* ---- toggles (also used by the top bar buttons) ---- */
  function setBtn(id, on) { const el = document.getElementById(id); if (el) el.classList.toggle('on', !!on); }
  function togglePause() { G.paused = !G.paused; setBtn('btn-pause', G.paused); }
  function toggleSlow() { G.slow = !G.slow; setBtn('btn-slow', G.slow); }
  function toggleGravity() { G.world.gravityOn = !G.world.gravityOn; setBtn('btn-grav', G.world.gravityOn); }
  function toggleSound() { const m = DD.Audio.toggleMute(); setBtn('btn-sound', !m); }
  function toggleHelp() { const h = document.getElementById('help'); if (h) h.classList.toggle('hidden'); }
  function hideHelp() { const h = document.getElementById('help'); if (h) h.classList.add('hidden'); }
  function clearAll() {
    for (const b of [...G.world.bodies]) G.world.removeBody(b);
    G.grab = null; G.hover = null;
  }
  G.togglePause = togglePause; G.toggleSlow = toggleSlow; G.toggleGravity = toggleGravity;
  G.toggleSound = toggleSound; G.toggleHelp = toggleHelp; G.hideHelp = hideHelp; G.clearAll = clearAll;
  G.deleteBody = deleteBody;

  /* ================= per-tick simulation ================= */
  function tick(dt) {
    G.time += dt;

    // camera pan keys
    const pan = 640 * dt / G.cam.zoom;
    if (G.keys['a'] || G.keys['arrowleft']) G.cam.x -= pan;
    if (G.keys['d'] || G.keys['arrowright']) G.cam.x += pan;
    if (G.keys['w'] || G.keys['arrowup']) G.cam.y -= pan;
    if (G.keys['s'] || G.keys['arrowdown']) G.cam.y += pan;
    clampCam();

    // drag spring
    if (G.grab) {
      const p = G.grab;
      const k = Math.min(1, (1 - Math.exp(-11 * dt)) * Math.min(1, 30 / p.mass + 0.35));
      p.x += (G.mouse.x - p.x) * k;
      p.y += (G.mouse.y - p.y) * k;
      // bleed velocity so it doesn't slingshot
      p.px += (p.x - p.px) * 0.35;
      p.py += (p.y - p.py) * 0.35;
    }

    // held activation (automatic weapons)
    if (G.holdActive && G.activeBody && !G.activeBody.dead && G.activeBody.onHold) {
      G.activeBody.onHold(dt, G.activeBody);
    }

    // body behaviours
    for (const b of [...G.world.bodies]) {
      if (b.update) b.update(dt, b);
    }
    updateBurning(dt);

    G.world.step(dt);

    // gameplay reactions to physics-driven joint breaks
    for (const br of G.world.brokenThisStep) {
      if (br.body.onBreak) br.body.onBreak(br.constraint, br.body);
    }

    FX().update(dt, G.world);
  }

  function clampCam() {
    const r = G.canvas.getBoundingClientRect();
    const hw = r.width / 2 / G.cam.zoom, hh = r.height / 2 / G.cam.zoom;
    G.cam.x = Math.max(Math.min(hw, WORLD_W / 2), Math.min(WORLD_W - Math.min(hw, WORLD_W / 2), G.cam.x));
    G.cam.y = Math.max(Math.min(hh, WORLD_H / 2), Math.min(WORLD_H - Math.min(hh, WORLD_H / 2), G.cam.y));
  }

  /* ================= rendering ================= */
  function resize() {
    const dpr = window.devicePixelRatio || 1;
    G.canvas.width = window.innerWidth * dpr;
    G.canvas.height = window.innerHeight * dpr;
    G.dpr = dpr;
  }

  function render() {
    const ctx = G.ctx, cv = G.canvas;
    const dpr = G.dpr || 1;
    const W = cv.width / dpr, H = cv.height / dpr;
    const z = G.cam.zoom;

    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    // deep background
    ctx.fillStyle = '#101216';
    ctx.fillRect(0, 0, W, H);

    const shk = FX().shake;
    const ox = shk ? (Math.random() - 0.5) * shk : 0;
    const oy = shk ? (Math.random() - 0.5) * shk : 0;

    ctx.save();
    ctx.translate(W / 2 + ox, H / 2 + oy);
    ctx.scale(z, z);
    ctx.translate(-G.cam.x, -G.cam.y);

    drawBackdrop(ctx);
    drawStatics(ctx);
    FX().renderStains(ctx);

    // bodies
    for (const b of G.world.bodies) {
      if (b.render) b.render(ctx, b);
      else genericRender(ctx, b);
    }

    // pins
    for (const b of G.world.bodies) for (const p of b.particles) {
      if (!p.pinned) continue;
      ctx.strokeStyle = '#ffb13d';
      ctx.lineWidth = 1.6;
      ctx.beginPath(); ctx.arc(p.x, p.y, p.r + 3, 0, Math.PI * 2); ctx.stroke();
      ctx.fillStyle = '#ffb13d';
      ctx.beginPath(); ctx.arc(p.x, p.y, 2, 0, Math.PI * 2); ctx.fill();
    }

    FX().render(ctx);

    // grab line
    if (G.grab) {
      ctx.strokeStyle = 'rgba(255,177,61,0.7)';
      ctx.lineWidth = 1.2 / z;
      ctx.setLineDash([6 / z, 5 / z]);
      ctx.beginPath(); ctx.moveTo(G.mouse.x, G.mouse.y); ctx.lineTo(G.grab.x, G.grab.y); ctx.stroke();
      ctx.setLineDash([]);
    }

    // placement ghost
    if (G.selected && G.ghost && !overUI()) {
      ctx.globalAlpha = 0.45;
      for (const o of G.ghost.offs) { o.p.x = G.mouse.x + o.ox; o.p.y = G.mouse.y + o.oy; }
      const gb = G.ghost.body;
      if (gb.render) gb.render(ctx, gb); else genericRender(ctx, gb);
      ctx.globalAlpha = 1;
    }

    // hover outline
    if (!G.selected && G.hover && !G.grab) {
      ctx.strokeStyle = 'rgba(255,255,255,0.22)';
      ctx.lineWidth = 1.4 / z;
      const c = bbox(G.hover);
      ctx.strokeRect(c.x - 6, c.y - 6, c.w + 12, c.h + 12);
    }

    ctx.restore();

    // subtle vignette
    const vg = ctx.createRadialGradient(W / 2, H / 2, Math.min(W, H) * 0.45, W / 2, H / 2, Math.max(W, H) * 0.75);
    vg.addColorStop(0, 'rgba(0,0,0,0)');
    vg.addColorStop(1, 'rgba(0,0,0,0.42)');
    ctx.fillStyle = vg;
    ctx.fillRect(0, 0, W, H);
  }

  function overUI() {
    return (G.mouse.sx < 208 && G.mouse.sy > 44) || G.mouse.sy < 44; // sidebar / top bar
  }

  function bbox(b) {
    let x0 = 1e9, y0 = 1e9, x1 = -1e9, y1 = -1e9;
    for (const p of b.particles) {
      x0 = Math.min(x0, p.x - p.r); y0 = Math.min(y0, p.y - p.r);
      x1 = Math.max(x1, p.x + p.r); y1 = Math.max(y1, p.y + p.r);
    }
    return { x: x0, y: y0, w: x1 - x0, h: y1 - y0 };
  }

  function genericRender(ctx, b) {
    for (const c of b.constraints) {
      if (c.broken || c.hidden) continue;
      ctx.strokeStyle = '#888';
      ctx.lineWidth = 4;
      ctx.beginPath(); ctx.moveTo(c.p1.x, c.p1.y); ctx.lineTo(c.p2.x, c.p2.y); ctx.stroke();
    }
    for (const p of b.particles) {
      ctx.fillStyle = '#999';
      ctx.beginPath(); ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2); ctx.fill();
    }
  }

  function drawBackdrop(ctx) {
    // wall panels
    ctx.fillStyle = '#171a20';
    ctx.fillRect(0, 0, WORLD_W, WORLD_H);
    // grid
    ctx.strokeStyle = 'rgba(255,255,255,0.028)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    for (let x = 0; x <= WORLD_W; x += 80) { ctx.moveTo(x, 0); ctx.lineTo(x, WORLD_H); }
    for (let y = 0; y <= WORLD_H; y += 80) { ctx.moveTo(0, y); ctx.lineTo(WORLD_W, y); }
    ctx.stroke();
    // big panel seams
    ctx.strokeStyle = 'rgba(255,255,255,0.05)';
    ctx.lineWidth = 3;
    ctx.beginPath();
    for (let x = 0; x <= WORLD_W; x += 400) { ctx.moveTo(x, 0); ctx.lineTo(x, WORLD_H); }
    ctx.stroke();
    // faint facility signage
    ctx.fillStyle = 'rgba(255,177,61,0.05)';
    ctx.font = '900 220px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('D-DAY', WORLD_W / 2, 420);
    ctx.font = '700 34px sans-serif';
    ctx.fillStyle = 'rgba(255,255,255,0.045)';
    ctx.fillText('TESTING CHAMBER 04 — ALL SUBJECTS EXPENDABLE', WORLD_W / 2, 480);
    // hazard stripe above the floor
    drawHazard(ctx, 0, GROUND_Y - 10, WORLD_W, 10);
  }

  function drawHazard(ctx, x, y, w, h) {
    ctx.save();
    ctx.beginPath(); ctx.rect(x, y, w, h); ctx.clip();
    ctx.fillStyle = '#2c2616';
    ctx.fillRect(x, y, w, h);
    ctx.fillStyle = 'rgba(255,177,61,0.5)';
    for (let i = -h; i < w; i += 26) {
      ctx.beginPath();
      ctx.moveTo(x + i, y + h); ctx.lineTo(x + i + h, y); ctx.lineTo(x + i + h + 12, y); ctx.lineTo(x + i + 12, y + h);
      ctx.closePath(); ctx.fill();
    }
    ctx.restore();
  }

  function drawStatics(ctx) {
    for (const s of G.world.statics) {
      if (s.deco === 'wall') continue; // hidden in the backdrop
      // concrete slab
      const g = ctx.createLinearGradient(s.x, s.y, s.x, s.y + s.h);
      g.addColorStop(0, '#2c303a');
      g.addColorStop(1, '#1f2229');
      ctx.fillStyle = g;
      ctx.fillRect(s.x, s.y, s.w, s.h);
      ctx.fillStyle = 'rgba(255,255,255,0.07)';
      ctx.fillRect(s.x, s.y, s.w, 3);
      ctx.strokeStyle = 'rgba(0,0,0,0.4)';
      ctx.lineWidth = 1.5;
      ctx.strokeRect(s.x + 0.5, s.y + 0.5, s.w - 1, s.h - 1);
      if (s.deco === 'plat') drawHazard(ctx, s.x, s.y + 3, 14, s.h - 6), drawHazard(ctx, s.x + s.w - 14, s.y + 3, 14, s.h - 6);
    }
  }

  /* ================= main loop ================= */
  function frame(t) {
    requestAnimationFrame(frame);
    const dtReal = Math.min(0.05, (t - G.last) / 1000 || STEP);
    G.last = t;

    G.fpsAcc += dtReal; G.fpsN++;
    if (G.fpsAcc > 0.5) { G.fps = Math.round(G.fpsN / G.fpsAcc); G.fpsAcc = 0; G.fpsN = 0; }

    G.acc += dtReal;
    let guard = 0;
    while (G.acc >= STEP && guard < 4) {
      G.acc -= STEP;
      guard++;
      if (!G.paused) tick(G.slow ? STEP * 0.25 : STEP);
    }

    G.hover = G.selected ? null : hoveredBody();
    render();
    updateStatus();
  }

  function updateStatus() {
    if (!G.statusEl) return;
    const n = G.world.bodies.length;
    let parts = 0;
    for (const b of G.world.bodies) parts += b.particles.length;
    const flags = [
      G.paused ? 'PAUSED' : null,
      G.slow ? 'SLOW-MO' : null,
      !G.world.gravityOn ? 'ZERO-G' : null,
    ].filter(Boolean).join(' · ');
    G.statusEl.textContent =
      `${flags ? flags + '  |  ' : ''}objects ${n} · points ${parts} · fx ${FX().count} · ${G.fps} fps`;
  }

  /* ================= boot ================= */
  G.init = function init() {
    G.canvas = document.getElementById('game');
    G.ctx = G.canvas.getContext('2d');
    G.statusEl = document.getElementById('status');
    resize();
    G.world = buildWorld();
    FX().initStains(WORLD_W, WORLD_H);
    bindInput();

    // a welcoming committee — on clear ground, away from the centre block
    DD.Ragdoll.make(G.world, 880, GROUND_Y - 80, 'subject');
    const it = DD.Items.registry.find((r) => r.id === 'crate');
    it.make(G.world, 1040, GROUND_Y - 40);

    requestAnimationFrame(frame);
  };
})();
