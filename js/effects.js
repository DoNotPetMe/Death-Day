/* DEATH DAY — particle effects & persistent gore.
   Blood, sparks, smoke, flame, tracers, shell casings, electric arcs,
   explosion flashes, and a half-resolution stain canvas that the world
   slowly gets painted onto. */
(function () {
  const DD = (window.DD = window.DD || {});

  const MAX_FX = 1400;
  const fx = [];          // generic moving particles
  const tracers = [];     // fading lines
  const arcs = [];        // electric polylines
  const flashes = [];     // expanding glow circles

  let stainCanvas = null, stainCtx = null;
  const STAIN_SCALE = 0.5;
  let shake = 0;

  function initStains(w, h) {
    stainCanvas = document.createElement('canvas');
    stainCanvas.width = Math.ceil(w * STAIN_SCALE);
    stainCanvas.height = Math.ceil(h * STAIN_SCALE);
    stainCtx = stainCanvas.getContext('2d');
  }

  function addStain(x, y, r, color, alpha) {
    if (!stainCtx) return;
    stainCtx.globalAlpha = alpha;
    stainCtx.fillStyle = color;
    stainCtx.beginPath();
    stainCtx.arc(x * STAIN_SCALE, y * STAIN_SCALE, Math.max(0.8, r * STAIN_SCALE), 0, Math.PI * 2);
    stainCtx.fill();
    stainCtx.globalAlpha = 1;
  }

  function clearStains() {
    if (stainCtx) stainCtx.clearRect(0, 0, stainCanvas.width, stainCanvas.height);
  }

  function spawn(o) {
    if (fx.length >= MAX_FX) fx.splice(0, 40);
    fx.push(o);
  }

  /* ---------------- public emitters ---------------- */

  function blood(x, y, dirx, diry, amount, color) {
    color = color || '#a40f0f';
    for (let i = 0; i < amount; i++) {
      const a = Math.atan2(diry, dirx) + (Math.random() - 0.5) * 1.6;
      const sp = (60 + Math.random() * 340) * Math.hypot(dirx, diry);
      spawn({
        kind: 'blood', x, y,
        vx: Math.cos(a) * sp, vy: Math.sin(a) * sp - 40,
        life: 0.8 + Math.random() * 1.6, t: 0,
        size: 1.2 + Math.random() * 2.6, color, grav: 1,
      });
    }
  }

  function drip(x, y, color) {
    spawn({ kind: 'blood', x, y, vx: (Math.random() - 0.5) * 30, vy: 20, life: 2, t: 0, size: 1.5 + Math.random() * 1.5, color: color || '#a40f0f', grav: 1 });
  }

  function sparks(x, y, n, sp) {
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2;
      const s = (sp || 250) * (0.3 + Math.random());
      spawn({ kind: 'spark', x, y, vx: Math.cos(a) * s, vy: Math.sin(a) * s, life: 0.25 + Math.random() * 0.35, t: 0, size: 1.5, color: '#ffd75e', grav: 0.6 });
    }
  }

  function smoke(x, y, n, dark) {
    for (let i = 0; i < n; i++) {
      spawn({
        kind: 'smoke', x: x + (Math.random() - 0.5) * 14, y: y + (Math.random() - 0.5) * 14,
        vx: (Math.random() - 0.5) * 60, vy: -40 - Math.random() * 70,
        life: 1.2 + Math.random() * 1.6, t: 0,
        size: 6 + Math.random() * 14, color: dark ? '#1c1c20' : '#54565e', grav: -0.12,
      });
    }
  }

  function flame(x, y, n) {
    for (let i = 0; i < (n || 1); i++) {
      spawn({
        kind: 'flame', x: x + (Math.random() - 0.5) * 8, y: y + (Math.random() - 0.5) * 8,
        vx: (Math.random() - 0.5) * 40, vy: -60 - Math.random() * 90,
        life: 0.3 + Math.random() * 0.45, t: 0, size: 4 + Math.random() * 6, grav: -0.3,
      });
    }
  }

  function gibs(x, y, n, color) {
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2;
      const s = 120 + Math.random() * 420;
      spawn({ kind: 'gib', x, y, vx: Math.cos(a) * s, vy: Math.sin(a) * s - 120, life: 1.4 + Math.random() * 1.4, t: 0, size: 2.5 + Math.random() * 3.5, color: color || '#7c0c0c', grav: 1 });
    }
  }

  function casing(x, y, dir) {
    spawn({ kind: 'casing', x, y, vx: -dir * (60 + Math.random() * 110), vy: -160 - Math.random() * 90, life: 1.6, t: 0, size: 2.4, color: '#d8a93c', grav: 1, spin: Math.random() * 9 });
  }

  function tracer(x0, y0, x1, y1) {
    tracers.push({ x0, y0, x1, y1, life: 0.09, t: 0 });
  }

  function arc(x0, y0, x1, y1) {
    const pts = [{ x: x0, y: y0 }];
    const n = 5;
    for (let i = 1; i < n; i++) {
      const t = i / n;
      pts.push({ x: x0 + (x1 - x0) * t + (Math.random() - 0.5) * 16, y: y0 + (y1 - y0) * t + (Math.random() - 0.5) * 16 });
    }
    pts.push({ x: x1, y: y1 });
    arcs.push({ pts, life: 0.12, t: 0 });
  }

  function flash(x, y, r, color) {
    flashes.push({ x, y, r, life: 0.22, t: 0, color: color || '#ffd9a0' });
  }

  function addShake(m) { shake = Math.min(34, shake + m); }

  /* big composite explosion visual; gameplay forces live in game.js */
  function explosionFx(x, y, r) {
    flash(x, y, r * 1.1);
    sparks(x, y, 26, 600);
    smoke(x, y, 14, true);
    for (let i = 0; i < 10; i++) flame(x + (Math.random() - 0.5) * r * 0.7, y + (Math.random() - 0.5) * r * 0.7, 2);
    addStain(x, y, r * 0.55, '#17181b', 0.55);
    addShake(Math.min(26, r * 0.12));
  }

  /* ---------------- simulation ---------------- */

  function update(dt, world) {
    shake = Math.max(0, shake - dt * 42);
    for (let i = fx.length - 1; i >= 0; i--) {
      const p = fx[i];
      p.t += dt;
      if (p.t >= p.life) { fx.splice(i, 1); continue; }
      p.vy += 1700 * (p.grav || 0) * dt;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      if (p.spin != null) p.spin += dt * 12;

      if (p.kind === 'blood' || p.kind === 'gib') {
        // splat onto floors/walls -> permanent stain
        if (world) {
          let hit = false;
          if (p.y > world.h - 2 || p.x < 2 || p.x > world.w - 2) hit = true;
          else for (const s of world.statics) {
            if (p.x > s.x && p.x < s.x + s.w && p.y > s.y && p.y < s.y + s.h) { hit = true; break; }
          }
          if (hit) {
            addStain(p.x, p.y - 1, p.size * (1.4 + Math.random()), p.color, 0.5 + Math.random() * 0.3);
            fx.splice(i, 1);
            continue;
          }
        }
      } else if (p.kind === 'casing' && world) {
        for (const s of world.statics) {
          if (p.x > s.x && p.x < s.x + s.w && p.y > s.y && p.y < s.y + s.h) {
            p.y = s.y - 1; p.vy *= -0.35; p.vx *= 0.6;
            break;
          }
        }
      }
    }
    for (let i = tracers.length - 1; i >= 0; i--) { tracers[i].t += dt; if (tracers[i].t >= tracers[i].life) tracers.splice(i, 1); }
    for (let i = arcs.length - 1; i >= 0; i--) { arcs[i].t += dt; if (arcs[i].t >= arcs[i].life) arcs.splice(i, 1); }
    for (let i = flashes.length - 1; i >= 0; i--) { flashes[i].t += dt; if (flashes[i].t >= flashes[i].life) flashes.splice(i, 1); }
  }

  /* ---------------- rendering (world space) ---------------- */

  function renderStains(ctx) {
    if (stainCanvas) ctx.drawImage(stainCanvas, 0, 0, stainCanvas.width / STAIN_SCALE, stainCanvas.height / STAIN_SCALE);
  }

  function render(ctx) {
    // tracers
    for (const t of tracers) {
      const a = 1 - t.t / t.life;
      ctx.strokeStyle = `rgba(255,224,150,${0.85 * a})`;
      ctx.lineWidth = 1.6;
      ctx.beginPath(); ctx.moveTo(t.x0, t.y0); ctx.lineTo(t.x1, t.y1); ctx.stroke();
    }
    // arcs
    for (const a of arcs) {
      const al = 1 - a.t / a.life;
      ctx.strokeStyle = `rgba(140,220,255,${al})`;
      ctx.lineWidth = 1.8;
      ctx.beginPath();
      ctx.moveTo(a.pts[0].x, a.pts[0].y);
      for (let i = 1; i < a.pts.length; i++) ctx.lineTo(a.pts[i].x, a.pts[i].y);
      ctx.stroke();
    }
    // moving particles
    for (const p of fx) {
      const a = 1 - p.t / p.life;
      if (p.kind === 'smoke') {
        ctx.globalAlpha = 0.30 * a;
        ctx.fillStyle = p.color;
        ctx.beginPath(); ctx.arc(p.x, p.y, p.size * (1 + p.t * 1.6), 0, Math.PI * 2); ctx.fill();
      } else if (p.kind === 'flame') {
        ctx.globalAlpha = 0.85 * a;
        ctx.fillStyle = p.t / p.life < 0.4 ? '#ffd75e' : '#ff7a26';
        ctx.beginPath(); ctx.arc(p.x, p.y, p.size * a, 0, Math.PI * 2); ctx.fill();
      } else if (p.kind === 'casing') {
        ctx.globalAlpha = a;
        ctx.save(); ctx.translate(p.x, p.y); ctx.rotate(p.spin || 0);
        ctx.fillStyle = p.color; ctx.fillRect(-2.4, -1.1, 4.8, 2.2);
        ctx.restore();
      } else {
        ctx.globalAlpha = Math.min(1, a * 1.6);
        ctx.fillStyle = p.color;
        ctx.beginPath(); ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2); ctx.fill();
      }
    }
    ctx.globalAlpha = 1;
    // flashes
    for (const f of flashes) {
      const a = 1 - f.t / f.life;
      const r = f.r * (0.45 + 0.55 * (f.t / f.life));
      const g = ctx.createRadialGradient(f.x, f.y, 0, f.x, f.y, r);
      g.addColorStop(0, `rgba(255,240,200,${0.9 * a})`);
      g.addColorStop(0.4, `rgba(255,160,60,${0.5 * a})`);
      g.addColorStop(1, 'rgba(255,120,40,0)');
      ctx.fillStyle = g;
      ctx.beginPath(); ctx.arc(f.x, f.y, r, 0, Math.PI * 2); ctx.fill();
    }
  }

  DD.FX = {
    initStains, addStain, clearStains,
    blood, drip, sparks, smoke, flame, gibs, casing, tracer, arc, flash,
    explosionFx, addShake,
    update, render, renderStains,
    get shake() { return shake; },
    get count() { return fx.length; },
  };
})();
