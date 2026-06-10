/* DEATH DAY — the requisition catalogue.
   Every spawnable item: beings, firearms, melee, explosives, energy tools,
   chemicals and props. Items are particle bodies with custom render /
   update / activate behaviour. */
(function () {
  const DD = (window.DD = window.DD || {});
  const FX = () => DD.FX;
  const A = (n, g) => DD.Audio && DD.Audio.play(n, g);

  /* =============== generic damage for non-ragdoll particles =============== */
  function damageParticle(p, dmg, info = {}) {
    const B = p.body;
    if (!B) return;
    if (B.onHit) { B.onHit(p, dmg, info); return; }
    if (p.material === 'wood') {
      p.hp -= dmg;
      FX().sparks(p.x, p.y, 2, 120);
      if (p.hp <= 0) shatterAt(p);
    } else {
      FX().sparks(p.x, p.y, Math.min(10, 2 + dmg * 0.15));
      if (Math.random() < 0.25) A('rico', 0.4);
    }
  }

  function shatterAt(p) {
    const B = p.body;
    let any = false;
    for (const c of B.constraints) {
      if (!c.broken && (c.p1 === p || c.p2 === p)) { c.broken = true; any = true; }
    }
    if (any) {
      B.buildNear();
      FX().smoke(p.x, p.y, 3);
      for (let i = 0; i < 6; i++) FX().drip(p.x + (Math.random() - 0.5) * 10, p.y, '#6e5230');
      A('crack');
    }
  }

  function ignite(p, dur) {
    if (p.material === 'flesh' || p.material === 'wood') p.burn = Math.max(p.burn, dur);
  }

  /* =============== firearms =============== */
  function makeGun(world, x, y, spec) {
    const B = new DD.Physics.Body('gun', { spec, cd: 0 });
    const grip = B.addP(x, y, 6, { material: 'metal', mass: spec.mass, friction: 0.5 });
    const muzzle = B.addP(x + spec.len, y, 4, { material: 'metal', mass: spec.mass * 0.6, friction: 0.5 });
    B.link(grip, muzzle, { stiff: 1 });
    B.data.grip = grip; B.data.muzzle = muzzle;

    B.update = (dt, b) => { b.data.cd = Math.max(0, b.data.cd - dt); };
    B.onActivate = (b) => { if (!spec.auto) fire(b); };
    B.onHold = (dt, b) => { if (spec.auto) fire(b); };
    B.render = (ctx, b) => drawGun(ctx, b);
    world.addBody(B);
    return B;
  }

  function fire(B) {
    const d = B.data, spec = d.spec;
    if (d.cd > 0) return;
    d.cd = spec.rof;
    const gx = d.grip.x, gy = d.grip.y;
    let dx = d.muzzle.x - gx, dy = d.muzzle.y - gy;
    const dl = Math.hypot(dx, dy) || 1;
    dx /= dl; dy /= dl;
    const mx = d.muzzle.x + dx * 6, my = d.muzzle.y + dy * 6;

    FX().flash(mx, my, 26 + spec.dmg * 0.3);
    FX().smoke(mx, my, 1);
    FX().casing(d.grip.x, d.grip.y - 4, dx >= 0 ? 1 : -1);
    A(spec.dmg >= 40 ? 'shotBig' : 'shot');

    const pellets = spec.pellets || 1;
    for (let i = 0; i < pellets; i++) {
      const sp = (Math.random() - 0.5) * 2 * spec.spread;
      const ca = Math.cos(sp), sa = Math.sin(sp);
      const bx = dx * ca - dy * sa, by = dx * sa + dy * ca;
      fireRay(B, mx, my, bx, by, spec);
    }
    // recoil
    d.grip.addVel(-dx * spec.kick, -dy * spec.kick);
    d.muzzle.addVel(-dx * spec.kick * 1.4, -dy * spec.kick * 1.4);
    FX().addShake(spec.dmg * 0.05);
  }

  function fireRay(B, mx, my, bx, by, spec) {
    const world = DD.Game.world;
    const range = 2200;
    const hits = world.raycast(mx, my, mx + bx * range, my + by * range, B);
    let pen = spec.pen || 1;
    let endX = mx + bx * range, endY = my + by * range;
    for (const h of hits) {
      if (h.static) {
        endX = h.x; endY = h.y;
        FX().sparks(h.x, h.y, 5, 180);
        FX().addStain(h.x, h.y, 2.5, '#101114', 0.8);
        break;
      }
      const p = h.particle;
      if (p.body === B) continue;
      const dmg = spec.dmg * (0.8 + Math.random() * 0.4);
      const imp = spec.dmg * 28 / Math.max(1, p.mass);
      p.addVel(bx * imp * (1 / 60), by * imp * (1 / 60));
      if (p.body.kind === 'ragdoll') DD.Ragdoll.hit(p, dmg, { kind: 'bullet', dirx: bx, diry: by });
      else damageParticle(p, dmg, { kind: 'bullet' });
      pen--;
      if (pen <= 0) { endX = h.x; endY = h.y; break; }
    }
    FX().tracer(mx, my, endX, endY);
  }

  function drawGun(ctx, B) {
    const d = B.data, spec = d.spec;
    const a = Math.atan2(d.muzzle.y - d.grip.y, d.muzzle.x - d.grip.x);
    ctx.save();
    ctx.translate(d.grip.x, d.grip.y);
    ctx.rotate(a);
    const L = spec.len;
    ctx.fillStyle = '#2b2e35';
    ctx.strokeStyle = '#43474f';
    ctx.lineWidth = 1;
    // receiver
    ctx.fillRect(-6, -5, L * 0.62, 9);
    ctx.strokeRect(-6, -5, L * 0.62, 9);
    // barrel
    ctx.fillStyle = '#383c44';
    ctx.fillRect(L * 0.5, -3, L * 0.55, 4.6);
    // grip
    ctx.fillStyle = '#23262c';
    ctx.save(); ctx.translate(-1, 3); ctx.rotate(0.45); ctx.fillRect(-3, 0, 6, 13); ctx.restore();
    // magazine / drum
    if (spec.mag) { ctx.fillStyle = '#1e2126'; ctx.fillRect(L * 0.18, 3, 6, spec.mag); }
    // stock
    if (spec.stock) { ctx.fillStyle = '#2f323a'; ctx.fillRect(-6 - spec.stock, -4, spec.stock, 7); }
    // accent stripe
    ctx.fillStyle = '#ffb13d';
    ctx.fillRect(-4, -4.4, Math.min(8, L * 0.2), 1.6);
    ctx.restore();
  }

  /* =============== melee =============== */
  function makeBlade(world, x, y, spec) {
    const B = new DD.Physics.Body('melee', { spec });
    const handle = B.addP(x, y, 4.5, { material: 'metal', mass: spec.mass, friction: 0.45 });
    const pts = [handle];
    const n = spec.segs || 1;
    for (let i = 1; i <= n; i++) {
      const p = B.addP(x + (spec.len * i) / n, y, 3, { material: 'metal', mass: spec.mass * 0.5, friction: 0.3, sharp: true });
      p.cutPower = spec.cutPower;
      B.link(pts[pts.length - 1], p, { stiff: 1 });
      pts.push(p);
    }
    if (pts.length > 2) B.link(pts[0], pts[pts.length - 1], { stiff: 1, hidden: true });
    B.data.pts = pts;
    B.render = (ctx, b) => drawBlade(ctx, b);
    world.addBody(B);
    return B;
  }

  function drawBlade(ctx, B) {
    const { spec, pts } = B.data;
    const h = pts[0], t = pts[pts.length - 1];
    const a = Math.atan2(t.y - h.y, t.x - h.x);
    ctx.save();
    ctx.translate(h.x, h.y);
    ctx.rotate(a);
    const L = spec.len;
    // handle
    ctx.fillStyle = '#3a3026';
    ctx.fillRect(-7, -2.4, L * spec.handleFrac + 7, 4.8);
    // guard
    if (spec.guard) { ctx.fillStyle = '#6f6452'; ctx.fillRect(L * spec.handleFrac - 1, -6, 3, 12); }
    if (spec.axe) {
      // haft + axe head
      ctx.fillStyle = '#4a3d2c';
      ctx.fillRect(-7, -2.4, L - 4, 4.8);
      ctx.fillStyle = '#aeb6c2';
      ctx.beginPath();
      ctx.moveTo(L - 14, -4); ctx.quadraticCurveTo(L + 4, -16, L + 6, -1);
      ctx.quadraticCurveTo(L + 4, 12, L - 14, 5);
      ctx.closePath(); ctx.fill();
      ctx.strokeStyle = '#7e8794'; ctx.stroke();
    } else {
      // blade
      ctx.fillStyle = '#c4ccd8';
      ctx.beginPath();
      ctx.moveTo(L * spec.handleFrac + 2, -2.6);
      ctx.lineTo(L + 4, -1.2);
      ctx.lineTo(L + 8, 0);
      ctx.lineTo(L + 4, 1.4);
      ctx.lineTo(L * spec.handleFrac + 2, 2.8);
      ctx.closePath(); ctx.fill();
      ctx.strokeStyle = '#8d96a5'; ctx.lineWidth = 0.8; ctx.stroke();
    }
    ctx.restore();
  }

  /* =============== explosives =============== */
  function makeGrenade(world, x, y) {
    const B = new DD.Physics.Body('explosive', { fuse: -1, beep: 0 });
    const p = B.addP(x, y, 7.5, { material: 'metal', mass: 5, friction: 0.4, bounce: 0.35 });
    B.onActivate = (b) => { if (b.data.fuse < 0) { b.data.fuse = 3; A('beep'); } };
    B.update = (dt, b) => {
      const d = b.data;
      if (d.fuse < 0) return;
      d.fuse -= dt;
      d.beep -= dt;
      if (d.beep <= 0) { d.beep = Math.max(0.12, d.fuse * 0.3); A('beep', 0.6); }
      if (d.fuse <= 0) { DD.Game.explode(p.x, p.y, 900, 175); DD.Game.world.removeBody(b); }
    };
    B.render = (ctx, b) => {
      ctx.fillStyle = b.data.fuse >= 0 && Math.sin(b.data.fuse * 30) > 0 ? '#d94343' : '#3c4a3a';
      ctx.beginPath(); ctx.arc(p.x, p.y, 7.5, 0, Math.PI * 2); ctx.fill();
      ctx.strokeStyle = '#262e25'; ctx.lineWidth = 1.2;
      ctx.beginPath(); ctx.arc(p.x, p.y, 7.5, 0, Math.PI * 2); ctx.stroke();
      ctx.fillStyle = '#9aa3ad'; ctx.fillRect(p.x - 2, p.y - 11, 4, 5);
    };
    world.addBody(B);
    return B;
  }

  function makeDetpack(world, x, y) {
    const B = new DD.Physics.Body('explosive', { fuse: -1 });
    const p1 = B.addP(x - 9, y, 6, { material: 'metal', mass: 7, friction: 0.6 });
    const p2 = B.addP(x + 9, y, 6, { material: 'metal', mass: 7, friction: 0.6 });
    B.link(p1, p2, { stiff: 1 });
    B.onActivate = (b) => { if (b.data.fuse < 0) { b.data.fuse = 0.5; A('beep'); } };
    B.update = (dt, b) => {
      if (b.data.fuse < 0) return;
      b.data.fuse -= dt;
      if (b.data.fuse <= 0) {
        const c = b.center();
        DD.Game.explode(c.x, c.y, 1500, 240);
        DD.Game.world.removeBody(b);
      }
    };
    B.render = (ctx, b) => {
      const a = Math.atan2(p2.y - p1.y, p2.x - p1.x);
      ctx.save(); ctx.translate((p1.x + p2.x) / 2, (p1.y + p2.y) / 2); ctx.rotate(a);
      ctx.fillStyle = '#7a5b22'; ctx.fillRect(-15, -6, 30, 12);
      ctx.fillStyle = '#2a2d33'; ctx.fillRect(-13, -4, 26, 4);
      ctx.fillStyle = b.data.fuse >= 0 ? '#ff4040' : '#5b2f2f';
      ctx.beginPath(); ctx.arc(9, 3, 2.2, 0, Math.PI * 2); ctx.fill();
      ctx.restore();
    };
    world.addBody(B);
    return B;
  }

  function makeMine(world, x, y) {
    const B = new DD.Physics.Body('explosive', { arm: 1.4 });
    const p1 = B.addP(x - 10, y, 5, { material: 'metal', mass: 9, friction: 0.8 });
    const p2 = B.addP(x + 10, y, 5, { material: 'metal', mass: 9, friction: 0.8 });
    B.link(p1, p2, { stiff: 1 });
    B.update = (dt, b) => {
      const d = b.data;
      if (d.arm > 0) { d.arm -= dt; return; }
      const cx = (p1.x + p2.x) / 2, cy = (p1.y + p2.y) / 2;
      let trip = false;
      DD.Game.world.queryCircle(cx, cy - 8, 24, (q) => {
        if (q.body === b) return;
        if (Math.hypot(q.vx, q.vy) > 0.4) trip = true;
      });
      if (trip) { DD.Game.explode(cx, cy, 850, 160); DD.Game.world.removeBody(b); }
    };
    B.render = (ctx, b) => {
      const a = Math.atan2(p2.y - p1.y, p2.x - p1.x);
      ctx.save(); ctx.translate((p1.x + p2.x) / 2, (p1.y + p2.y) / 2); ctx.rotate(a);
      ctx.fillStyle = '#36413b';
      ctx.beginPath(); ctx.moveTo(-14, 5); ctx.lineTo(-10, -4); ctx.lineTo(10, -4); ctx.lineTo(14, 5); ctx.closePath(); ctx.fill();
      ctx.fillStyle = b.data.arm > 0 ? '#777' : (Math.sin(performance.now() * 0.006) > 0 ? '#ff4040' : '#5b2f2f');
      ctx.beginPath(); ctx.arc(0, -4, 2, 0, Math.PI * 2); ctx.fill();
      ctx.restore();
    };
    world.addBody(B);
    return B;
  }

  function makeBarrel(world, x, y) {
    const B = new DD.Physics.Body('explosive', { hp: 45 });
    const p1 = B.addP(x, y - 14, 13, { material: 'metal', mass: 16, friction: 0.5 });
    const p2 = B.addP(x, y + 14, 13, { material: 'metal', mass: 16, friction: 0.5 });
    B.link(p1, p2, { stiff: 1 });
    B.onHit = (p, dmg) => {
      B.data.hp -= dmg;
      FX().sparks(p.x, p.y, 4, 160);
      if (B.data.hp <= 0 && !B.dead) {
        const c = B.center();
        DD.Game.world.removeBody(B);
        DD.Game.explode(c.x, c.y, 1100, 215, { fire: true });
      }
    };
    B.render = (ctx) => {
      const a = Math.atan2(p2.y - p1.y, p2.x - p1.x) - Math.PI / 2;
      ctx.save(); ctx.translate((p1.x + p2.x) / 2, (p1.y + p2.y) / 2); ctx.rotate(a);
      ctx.fillStyle = '#8c3b2e';
      ctx.fillRect(-13, -27, 26, 54);
      ctx.fillStyle = '#7a3327';
      ctx.fillRect(-13, -9, 26, 5); ctx.fillRect(-13, 6, 26, 5);
      ctx.strokeStyle = '#56251c'; ctx.lineWidth = 1.4; ctx.strokeRect(-13, -27, 26, 54);
      ctx.fillStyle = '#ffb13d';
      ctx.font = 'bold 11px sans-serif'; ctx.textAlign = 'center';
      ctx.fillText('☠', 0, 1);
      ctx.restore();
    };
    world.addBody(B);
    return B;
  }

  /* =============== energy =============== */
  function makeShockRod(world, x, y) {
    const B = new DD.Physics.Body('energy', { on: true, zcd: 0 });
    const h = B.addP(x, y, 5, { material: 'metal', mass: 5, friction: 0.5 });
    const t = B.addP(x + 44, y, 4, { material: 'metal', mass: 3, friction: 0.3 });
    t.shocker = true;
    B.link(h, t, { stiff: 1 });
    B.onActivate = (b) => { b.data.on = !b.data.on; A('click'); };
    B.update = (dt, b) => {
      b.data.zcd = Math.max(0, b.data.zcd - dt);
      t.shocker = b.data.on;
      if (b.data.on && Math.random() < dt * 7) FX().arc(t.x - 4, t.y - 4, t.x + 4, t.y + 4);
    };
    B.render = (ctx, b) => {
      const a = Math.atan2(t.y - h.y, t.x - h.x);
      ctx.save(); ctx.translate(h.x, h.y); ctx.rotate(a);
      ctx.fillStyle = '#23262c'; ctx.fillRect(-7, -3.4, 26, 6.8);
      ctx.fillStyle = '#3a3e46'; ctx.fillRect(19, -2.2, 22, 4.4);
      ctx.fillStyle = b.data.on ? '#7fdcff' : '#3a4a52';
      ctx.fillRect(41, -3, 7, 6);
      if (b.data.on) { ctx.globalAlpha = 0.4 + 0.3 * Math.sin(performance.now() * 0.02); ctx.fillRect(39, -5, 11, 10); ctx.globalAlpha = 1; }
      ctx.restore();
    };
    world.addBody(B);
    return B;
  }

  function makeIgniter(world, x, y) {
    const B = new DD.Physics.Body('energy', { on: true });
    const h = B.addP(x, y, 5, { material: 'metal', mass: 4, friction: 0.5 });
    const t = B.addP(x + 34, y, 4, { material: 'metal', mass: 2.5, friction: 0.3 });
    t.igniter = true;
    B.link(h, t, { stiff: 1 });
    B.onActivate = (b) => { b.data.on = !b.data.on; t.igniter = b.data.on; A('click'); };
    B.update = (dt, b) => {
      if (b.data.on) { FX().flame(t.x, t.y, 1); if (Math.random() < dt * 2) A('fire', 0.5); }
    };
    B.render = (ctx, b) => {
      const a = Math.atan2(t.y - h.y, t.x - h.x);
      ctx.save(); ctx.translate(h.x, h.y); ctx.rotate(a);
      ctx.fillStyle = '#54402c'; ctx.fillRect(-7, -3, 34, 6);
      ctx.fillStyle = '#2a2d33'; ctx.fillRect(25, -4, 8, 8);
      ctx.restore();
    };
    world.addBody(B);
    return B;
  }

  /* =============== chemicals =============== */
  function makeSerum(world, x, y) {
    const B = new DD.Physics.Body('chem', {});
    const p = B.addP(x, y, 6, { material: 'solid', mass: 2.5, friction: 0.4, bounce: 0.3 });
    B.onActivate = (b) => {
      let best = null, bd = 90;
      for (const ob of DD.Game.world.bodies) {
        if (ob.kind !== 'ragdoll') continue;
        const c = ob.center();
        const d = Math.hypot(c.x - p.x, c.y - p.y);
        if (d < bd) { bd = d; best = ob; }
      }
      if (best && DD.Ragdoll.revive(best)) {
        FX().sparks(p.x, p.y, 10, 200);
        DD.Game.world.removeBody(b);
      } else A('click');
    };
    B.render = (ctx) => {
      ctx.save(); ctx.translate(p.x, p.y);
      ctx.fillStyle = '#46e08c'; ctx.fillRect(-3.5, -5, 7, 10);
      ctx.fillStyle = '#cfd6e0'; ctx.fillRect(-2, -9, 4, 4);
      ctx.strokeStyle = '#2a8a55'; ctx.lineWidth = 1; ctx.strokeRect(-3.5, -5, 7, 10);
      ctx.restore();
    };
    world.addBody(B);
    return B;
  }

  function makeAcid(world, x, y) {
    const B = new DD.Physics.Body('chem', { lastV: 0 });
    const p = B.addP(x, y, 7, { material: 'solid', mass: 3, friction: 0.4, bounce: 0.1 });
    B.update = (dt, b) => {
      const v = Math.hypot(p.vx, p.vy);
      // a sudden large velocity loss = hard impact -> shatter
      if (b.data.lastV - v > 3.5 && b.data.lastV > 5) {
        DD.Game.world.removeBody(b);
        A('pop'); A('hiss');
        FX().addStain(p.x, p.y, 26, '#3f7a18', 0.6);
        for (let i = 0; i < 22; i++) FX().drip(p.x + (Math.random() - 0.5) * 30, p.y - Math.random() * 14, '#5fae1e');
        DD.Game.world.queryCircle(p.x, p.y, 64, (q) => {
          if (q.material === 'flesh') {
            DD.Ragdoll.hit(q, 26, { kind: 'acid', bleed: true });
            q.char = Math.min(1, q.char + 0.45);
          } else if (q.material === 'wood') damageParticle(q, 30, {});
        });
      }
      b.data.lastV = v;
    };
    B.render = (ctx) => {
      ctx.save(); ctx.translate(p.x, p.y);
      ctx.fillStyle = '#5fae1e';
      ctx.beginPath(); ctx.arc(0, 1, 6, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = '#3d3f33'; ctx.fillRect(-2.4, -9, 4.8, 5);
      ctx.strokeStyle = '#396911'; ctx.lineWidth = 1;
      ctx.beginPath(); ctx.arc(0, 1, 6, 0, Math.PI * 2); ctx.stroke();
      ctx.restore();
    };
    world.addBody(B);
    return B;
  }

  /* =============== props =============== */
  function makeCrate(world, x, y, size, mat) {
    const s = size / 2;
    const wood = mat !== 'metal';
    const B = new DD.Physics.Body('crate', { size, wood });
    const o = { material: wood ? 'wood' : 'metal', friction: 0.5, hp: wood ? 70 : Infinity, mass: (wood ? 0.05 : 0.12) * 81 };
    const c1 = B.addP(x - s, y - s, 9, o), c2 = B.addP(x + s, y - s, 9, o);
    const c3 = B.addP(x + s, y + s, 9, o), c4 = B.addP(x - s, y + s, 9, o);
    const bs = wood ? 1.35 : 0;
    const e1 = B.link(c1, c2, { stiff: 1, breakStretch: bs }), e2 = B.link(c2, c3, { stiff: 1, breakStretch: bs });
    const e3 = B.link(c3, c4, { stiff: 1, breakStretch: bs }), e4 = B.link(c4, c1, { stiff: 1, breakStretch: bs });
    B.link(c1, c3, { stiff: 1, hidden: true, breakStretch: bs });
    B.link(c2, c4, { stiff: 1, hidden: true, breakStretch: bs });
    B.data.corners = [c1, c2, c3, c4];
    B.data.edges = [e1, e2, e3, e4];
    B.render = (ctx, b) => drawCrate(ctx, b);
    world.addBody(B);
    return B;
  }

  function drawCrate(ctx, B) {
    const { corners, edges, wood } = B.data;
    const whole = edges.every((e) => !e.broken);
    if (whole) {
      ctx.beginPath();
      ctx.moveTo(corners[0].x, corners[0].y);
      for (let i = 1; i < 4; i++) ctx.lineTo(corners[i].x, corners[i].y);
      ctx.closePath();
      if (wood) {
        ctx.fillStyle = mixChar('#8a6a3c', corners);
        ctx.fill();
        ctx.strokeStyle = '#5d4626'; ctx.lineWidth = 5; ctx.stroke();
        ctx.strokeStyle = '#6e5230'; ctx.lineWidth = 2.4;
        ctx.beginPath(); ctx.moveTo(corners[0].x, corners[0].y); ctx.lineTo(corners[2].x, corners[2].y);
        ctx.moveTo(corners[1].x, corners[1].y); ctx.lineTo(corners[3].x, corners[3].y); ctx.stroke();
      } else {
        ctx.fillStyle = '#5a6068';
        ctx.fill();
        ctx.strokeStyle = '#3c4148'; ctx.lineWidth = 5; ctx.stroke();
        ctx.fillStyle = '#454b53';
        const cx = (corners[0].x + corners[2].x) / 2, cy = (corners[0].y + corners[2].y) / 2;
        ctx.beginPath(); ctx.arc(cx, cy, 6, 0, Math.PI * 2); ctx.fill();
      }
    } else {
      // broken: draw the surviving edges as planks
      for (const e of B.constraints) {
        if (e.broken || e.hidden) continue;
        ctx.strokeStyle = wood ? '#7c5e34' : '#4a4f57';
        ctx.lineWidth = 9; ctx.lineCap = 'round';
        ctx.beginPath(); ctx.moveTo(e.p1.x, e.p1.y); ctx.lineTo(e.p2.x, e.p2.y); ctx.stroke();
      }
      for (const c of corners) {
        ctx.fillStyle = wood ? '#6e5230' : '#3c4148';
        ctx.beginPath(); ctx.arc(c.x, c.y, 6, 0, Math.PI * 2); ctx.fill();
      }
    }
  }

  function mixChar(base, ps) {
    let ch = 0;
    for (const p of ps) ch = Math.max(ch, p.char);
    if (ch <= 0) return base;
    const v = Math.max(0, 1 - ch);
    const r = parseInt(base.slice(1, 3), 16) * v, g = parseInt(base.slice(3, 5), 16) * v, b = parseInt(base.slice(5, 7), 16) * v;
    return `rgb(${r | 0},${g | 0},${b | 0})`;
  }

  function makeBall(world, x, y) {
    const B = new DD.Physics.Body('prop', {});
    const p = B.addP(x, y, 16, { material: 'solid', mass: 8, friction: 0.05, bounce: 0.8 });
    B.render = (ctx) => {
      ctx.fillStyle = '#c8403a';
      ctx.beginPath(); ctx.arc(p.x, p.y, 16, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = '#e8e2d8';
      ctx.beginPath(); ctx.arc(p.x, p.y, 16, -0.6, 0.6); ctx.arc(p.x, p.y, 7, 0.6, -0.6, true); ctx.closePath(); ctx.fill();
      ctx.strokeStyle = '#7e2723'; ctx.lineWidth = 1.5;
      ctx.beginPath(); ctx.arc(p.x, p.y, 16, 0, Math.PI * 2); ctx.stroke();
    };
    world.addBody(B);
    return B;
  }

  function makeWheel(world, x, y) {
    const B = new DD.Physics.Body('prop', {});
    const p = B.addP(x, y, 21, { material: 'solid', mass: 14, friction: 0.55, bounce: 0.35 });
    B.render = (ctx) => {
      ctx.fillStyle = '#23252a';
      ctx.beginPath(); ctx.arc(p.x, p.y, 21, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = '#878e98';
      ctx.beginPath(); ctx.arc(p.x, p.y, 10, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = '#5b626c';
      ctx.beginPath(); ctx.arc(p.x, p.y, 4, 0, Math.PI * 2); ctx.fill();
    };
    world.addBody(B);
    return B;
  }

  function makePlank(world, x, y) {
    const B = new DD.Physics.Body('prop', {});
    const o = { material: 'wood', friction: 0.5, hp: 55, mass: 4 };
    const p1 = B.addP(x - 45, y, 5, o), p2 = B.addP(x + 45, y, 5, o);
    B.link(p1, p2, { stiff: 1 });
    B.render = (ctx) => {
      ctx.strokeStyle = mixChar('#8a6a3c', [p1, p2]);
      ctx.lineWidth = 10; ctx.lineCap = 'round';
      ctx.beginPath(); ctx.moveTo(p1.x, p1.y); ctx.lineTo(p2.x, p2.y); ctx.stroke();
      ctx.strokeStyle = '#5d4626'; ctx.lineWidth = 1.4;
      ctx.beginPath(); ctx.moveTo(p1.x, p1.y); ctx.lineTo(p2.x, p2.y); ctx.stroke();
    };
    world.addBody(B);
    return B;
  }

  /* =============== registry =============== */
  const registry = [
    { id: 'subject',  cat: 'beings', name: 'Subject',      make: (w, x, y) => DD.Ragdoll.make(w, x, y, 'subject') },
    { id: 'husk',     cat: 'beings', name: 'Husk',         make: (w, x, y) => DD.Ragdoll.make(w, x, y, 'husk') },
    { id: 'automaton',cat: 'beings', name: 'Automaton',    make: (w, x, y) => DD.Ragdoll.make(w, x, y, 'automaton') },

    { id: 'pistol',  cat: 'firearms', name: 'PD-9 Pistol',   make: (w, x, y) => makeGun(w, x, y, { len: 26, dmg: 16, rof: 0.16, spread: 0.025, kick: 2.0, mass: 4, mag: 7 }) },
    { id: 'smg',     cat: 'firearms', name: 'Wasp SMG',      make: (w, x, y) => makeGun(w, x, y, { len: 34, dmg: 11, rof: 0.07, spread: 0.06, kick: 1.4, mass: 5, auto: true, mag: 10, stock: 6 }) },
    { id: 'shotgun', cat: 'firearms', name: 'Mule Shotgun',  make: (w, x, y) => makeGun(w, x, y, { len: 46, dmg: 9, rof: 0.85, spread: 0.13, kick: 7, mass: 6, pellets: 7, stock: 9 }) },
    { id: 'rifle',   cat: 'firearms', name: 'Longhorn Rifle',make: (w, x, y) => makeGun(w, x, y, { len: 58, dmg: 55, rof: 1.1, spread: 0.004, kick: 9, mass: 7, pen: 3, mag: 8, stock: 10 }) },

    { id: 'knife',  cat: 'melee', name: 'Shiv',         make: (w, x, y) => makeBlade(w, x, y, { len: 26, segs: 1, cutPower: 1.0, mass: 3, handleFrac: 0.42, guard: true }) },
    { id: 'axe',    cat: 'melee', name: 'Splitter Axe', make: (w, x, y) => makeBlade(w, x, y, { len: 52, segs: 2, cutPower: 1.7, mass: 8, handleFrac: 0.7, axe: true }) },
    { id: 'katana', cat: 'melee', name: 'Moonfang',     make: (w, x, y) => makeBlade(w, x, y, { len: 74, segs: 3, cutPower: 1.4, mass: 5, handleFrac: 0.25, guard: true }) },

    { id: 'grenade', cat: 'explosives', name: 'Pineapple',    make: makeGrenade },
    { id: 'detpack', cat: 'explosives', name: 'Thumper Pack', make: makeDetpack },
    { id: 'mine',    cat: 'explosives', name: 'Toecutter',    make: makeMine },
    { id: 'barrel',  cat: 'explosives', name: 'Powder Drum',  make: makeBarrel },

    { id: 'shockrod', cat: 'energy', name: 'Cattleprod', make: makeShockRod },
    { id: 'igniter',  cat: 'energy', name: 'Firebrand',  make: makeIgniter },

    { id: 'serum', cat: 'chem', name: 'Nano Serum', make: makeSerum },
    { id: 'acid',  cat: 'chem', name: 'Acid Flask', make: makeAcid },

    { id: 'crate', cat: 'props', name: 'Crate',       make: (w, x, y) => makeCrate(w, x, y, 64, 'wood') },
    { id: 'block', cat: 'props', name: 'Steel Block', make: (w, x, y) => makeCrate(w, x, y, 56, 'metal') },
    { id: 'plank', cat: 'props', name: 'Plank',       make: makePlank },
    { id: 'ball',  cat: 'props', name: 'Bouncer',     make: makeBall },
    { id: 'wheel', cat: 'props', name: 'Wheel',       make: makeWheel },
  ];

  const CATS = [
    { id: 'beings', label: 'BEINGS' },
    { id: 'firearms', label: 'FIREARMS' },
    { id: 'melee', label: 'MELEE' },
    { id: 'explosives', label: 'EXPLOSIVES' },
    { id: 'energy', label: 'ENERGY' },
    { id: 'chem', label: 'CHEMICAL' },
    { id: 'props', label: 'PROPS' },
  ];

  DD.Items = { registry, CATS, damageParticle, ignite, shatterAt };
})();
