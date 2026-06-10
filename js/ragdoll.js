/* DEATH DAY — articulated test subjects.
   A subject is a particle skeleton with severable joints, per-part hit
   points, a blood reserve, pain reflexes, burning, electrocution and a
   proper death state. Three variants ship with the facility:
     · Subject  — baseline human analogue
     · Husk     — necrotic; ignores pain, only decapitation truly stops it
     · Automaton— chassis unit; bleeds oil, sparks instead of squirts */
(function () {
  const DD = (window.DD = window.DD || {});
  const FX = () => DD.FX;

  const VARIANTS = {
    subject: {
      label: 'Subject',
      skin: '#d9a06b', shirt: '#46627e', pants: '#3a4250', shoe: '#23262c',
      bloodColor: '#a40f0f', stain: '#6e0a0a',
      bulletMul: 1, pain: true, undead: false, metal: false,
    },
    husk: {
      label: 'Husk',
      skin: '#7e9a60', shirt: '#4d4639', pants: '#36332c', shoe: '#26241f',
      bloodColor: '#4a6b1d', stain: '#33490f',
      bulletMul: 0.35, pain: false, undead: true, metal: false,
    },
    automaton: {
      label: 'Automaton',
      skin: '#98a1ab', shirt: '#6b7480', pants: '#525a64', shoe: '#33373d',
      bloodColor: '#1d1f22', stain: '#141517',
      bulletMul: 0.8, pain: false, undead: false, metal: true,
    },
  };

  /* ---------- colour helpers ---------- */
  function hex2rgb(h) {
    return [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16)];
  }
  function mix(c1, c2, t) {
    const a = hex2rgb(c1), b = hex2rgb(c2);
    return `rgb(${(a[0] + (b[0] - a[0]) * t) | 0},${(a[1] + (b[1] - a[1]) * t) | 0},${(a[2] + (b[2] - a[2]) * t) | 0})`;
  }
  /* apply charring + death pallor to a base colour */
  function shade(base, char, dead) {
    let c = base;
    if (dead > 0) c = mix(c, '#9aa0a8', Math.min(0.45, dead * 0.4));
    if (char > 0) return mix(c, '#161212', Math.min(1, char));
    return c;
  }

  /* ---------- factory ---------- */
  function make(world, x, y, variantName) {
    const V = VARIANTS[variantName] || VARIANTS.subject;
    const B = new DD.Physics.Body('ragdoll', {
      variant: variantName, V,
      blood: 100, alive: true, pain: 0, shock: 0, deadT: 0,
      bleeders: [], faceAngle: 0,
    });

    const fl = { material: V.metal ? 'metal' : 'flesh', friction: 0.42 };
    const P = (dx, dy, r, part, hp) =>
      B.addP(x + dx, y + dy, r, { ...fl, hp, meta: { part }, mass: r * r * (V.metal ? 0.075 : 0.05) });

    // skeleton — pelvis is the origin
    const pelvis = P(0, 0, 9, 'torso', 90);
    const belly  = P(0, -17, 10, 'torso', 90);
    const chest  = P(0, -34, 11, 'torso', 90);
    const neck   = P(0, -47, 5, 'neck', 60);
    const head   = P(0, -61, 10, 'head', 60);
    const shL = P(-12, -38, 6, 'arm', 55), shR = P(12, -38, 6, 'arm', 55);
    const elL = P(-16, -12, 5, 'arm', 50), elR = P(16, -12, 5, 'arm', 50);
    const haL = P(-18, 10, 4.5, 'hand', 45), haR = P(18, 10, 4.5, 'hand', 45);
    const hiL = P(-7, 4, 7, 'leg', 60), hiR = P(7, 4, 7, 'leg', 60);
    const knL = P(-8, 36, 6, 'leg', 55), knR = P(8, 36, 6, 'leg', 55);
    const ftL = P(-9, 66, 5.5, 'foot', 50), ftR = P(9, 66, 5.5, 'foot', 50);

    const L = (p1, p2, o) => B.link(p1, p2, o);
    // spine
    L(pelvis, belly, { stiff: 1 });
    L(belly, chest, { stiff: 1, joint: 'spine', breakStretch: 2.4 });
    L(chest, neck, { stiff: 1 });
    L(neck, head, { stiff: 1, joint: 'neck', breakStretch: 1.85 });
    // posture braces (hidden)
    L(chest, head, { stiff: 0.55, hidden: true, joint: 'neck', breakStretch: 2.0 });
    L(chest, pelvis, { stiff: 0.6, hidden: true, joint: 'spine', breakStretch: 2.6 });
    // shoulder girdle + hips are welded to the torso
    L(chest, shL, { stiff: 1 }); L(chest, shR, { stiff: 1 });
    L(shL, shR, { stiff: 0.9, hidden: true });
    L(belly, shL, { stiff: 0.4, hidden: true }); L(belly, shR, { stiff: 0.4, hidden: true });
    L(pelvis, hiL, { stiff: 1 }); L(pelvis, hiR, { stiff: 1 });
    L(hiL, hiR, { stiff: 0.9, hidden: true });
    L(belly, hiL, { stiff: 0.5, hidden: true }); L(belly, hiR, { stiff: 0.5, hidden: true });
    // limbs — each rod is a severable body segment
    L(shL, elL, { stiff: 1, joint: 'armL', breakStretch: 1.8 });
    L(shR, elR, { stiff: 1, joint: 'armR', breakStretch: 1.8 });
    L(elL, haL, { stiff: 1, joint: 'forearmL', breakStretch: 1.75 });
    L(elR, haR, { stiff: 1, joint: 'forearmR', breakStretch: 1.75 });
    L(hiL, knL, { stiff: 1, joint: 'legL', breakStretch: 1.85 });
    L(hiR, knR, { stiff: 1, joint: 'legR', breakStretch: 1.85 });
    L(knL, ftL, { stiff: 1, joint: 'shinL', breakStretch: 1.8 });
    L(knR, ftR, { stiff: 1, joint: 'shinR', breakStretch: 1.8 });

    B.data.bones = { pelvis, belly, chest, neck, head, shL, shR, elL, elR, haL, haR, hiL, hiR, knL, knR, ftL, ftR };
    B.update = update;
    B.render = render;
    B.onBreak = (c, body) => { if (c.joint) sever(body, c.joint); };
    B.onHit = hit;
    world.addBody(B);
    return B;
  }

  /* ---------- damage ---------- */
  function hit(p, dmg, info = {}) {
    const B = p.body;
    if (!B || B.kind !== 'ragdoll') return;
    const D = B.data, V = D.V;
    if (info.kind === 'bullet') dmg *= V.bulletMul;
    p.hp -= dmg;

    const dirx = info.dirx != null ? info.dirx : (Math.random() - 0.5);
    const diry = info.diry != null ? info.diry : -0.5;
    if (V.metal) {
      FX().sparks(p.x, p.y, Math.min(14, 3 + dmg * 0.25));
      FX().drip(p.x, p.y, V.bloodColor);
    } else {
      FX().blood(p.x, p.y, dirx, diry, Math.min(26, 3 + dmg * 0.4), V.bloodColor);
    }

    if (D.alive) {
      const headHit = p.meta && p.meta.part === 'head';
      D.blood -= dmg * (headHit ? 0.65 : 0.3);
      if (V.pain) D.pain = Math.min(1, D.pain + dmg / 45);
      if (info.bleed !== false && !V.metal) addBleeder(B, p, Math.min(3, dmg * 0.06));
      if (headHit && p.hp <= 0) kill(B, true);
      else if (D.blood <= 0) kill(B, false);
      if (DD.Audio) DD.Audio.play('squish', 0.7);
    }
    // pulverised part → tear the nearest severable joint
    if (p.hp <= -30 && p.meta) {
      const j = nearestJoint(B, p);
      if (j) sever(B, j);
      p.hp = 0;
    }
  }

  function nearestJoint(B, p) {
    for (const c of B.constraints) {
      if (c.broken || !c.joint) continue;
      if (c.p1 === p || c.p2 === p) return c.joint;
    }
    return null;
  }

  function addBleeder(B, p, rate) {
    const D = B.data;
    for (const b of D.bleeders) if (b.p === p) { b.rate = Math.min(5, b.rate + rate); return; }
    if (D.bleeders.length < 14) D.bleeders.push({ p, rate, t: 0 });
  }

  function sever(B, joint) {
    const D = B.data;
    let any = false;
    const stumps = [];
    for (const c of B.constraints) {
      if (c.joint !== joint || c.gored) continue;
      c.broken = true;
      c.gored = true;          // gore each joint group exactly once
      any = true;
      if (!c.hidden) { stumps.push(c.p1, c.p2); }
    }
    if (!any) return;
    B.buildNear();
    for (const p of stumps) {
      p.stump = true;
      if (!D.V.metal) {
        FX().blood(p.x, p.y, (Math.random() - 0.5) * 2, -1, 22, D.V.bloodColor);
        FX().gibs(p.x, p.y, 6, D.V.stain);
        addBleeder(B, p, 2.5);
      } else {
        FX().sparks(p.x, p.y, 18, 360);
      }
    }
    if (D.alive) {
      D.blood -= D.V.undead ? 5 : 22;
      D.pain = 1;
      if (joint === 'neck') kill(B, true);
      else if (D.blood <= 0) kill(B, false);
    }
    if (DD.Audio) DD.Audio.play(D.V.metal ? 'crack' : 'squish');
  }

  function kill(B, violent) {
    const D = B.data;
    if (!D.alive) return;
    D.alive = false;
    D.pain = 0;
    if (violent && !D.V.metal) FX().gibs(D.bones.head.x, D.bones.head.y, 8, D.V.stain);
  }

  function revive(B) {
    const D = B.data;
    // a missing head is beyond the serum
    for (const c of B.constraints) if (c.joint === 'neck' && c.broken && !c.hidden) return false;
    D.alive = true; D.blood = 100; D.deadT = 0; D.pain = 0; D.shock = 0;
    D.bleeders.length = 0;
    for (const p of B.particles) { p.hp = Math.max(p.hp, 40); p.burn = 0; p.char = Math.max(0, p.char - 0.5); }
    FX().flash(D.bones.chest.x, D.bones.chest.y, 60, '#8effc0');
    if (DD.Audio) DD.Audio.play('heal');
    return true;
  }

  function electrocute(B, dur) {
    if (B.kind !== 'ragdoll') return;
    B.data.shock = Math.max(B.data.shock, dur);
  }

  /* ---------- per-frame behaviour ---------- */
  function update(dt, B) {
    const D = B.data, V = D.V;

    // face angle follows the neck→head axis while attached
    const bo = D.bones;
    D.faceAngle = Math.atan2(bo.head.y - bo.neck.y, bo.head.x - bo.neck.x);

    // bleeding out
    for (let i = D.bleeders.length - 1; i >= 0; i--) {
      const bl = D.bleeders[i];
      bl.t += dt;
      bl.rate *= Math.pow(0.93, dt * 60 * 0.2);
      if (Math.random() < dt * (6 + bl.rate * 5)) FX().drip(bl.p.x, bl.p.y, V.bloodColor);
      if (D.alive) D.blood -= bl.rate * dt;
      if (bl.rate < 0.12) D.bleeders.splice(i, 1);
    }
    if (D.alive && D.blood <= 0) kill(B, false);
    if (!D.alive) D.deadT += dt;

    // pain reflexes — flail the limbs
    if (D.alive && D.pain > 0.02) {
      D.pain = Math.max(0, D.pain - dt * 0.55);
      const limbs = [bo.haL, bo.haR, bo.ftL, bo.ftR, bo.elL, bo.elR];
      for (const p of limbs) {
        if (Math.random() < D.pain * dt * 22) {
          p.addVel((Math.random() - 0.5) * 9 * D.pain, (Math.random() - 0.7) * 9 * D.pain);
        }
      }
    }

    // electrocution — convulsions + arcs
    if (D.shock > 0) {
      D.shock -= dt;
      const ps = B.particles;
      for (const p of ps) if (Math.random() < dt * 14) p.addVel((Math.random() - 0.5) * 7, (Math.random() - 0.5) * 7);
      if (Math.random() < dt * 26) {
        const a = ps[(Math.random() * ps.length) | 0], b2 = ps[(Math.random() * ps.length) | 0];
        FX().arc(a.x, a.y, b2.x, b2.y);
      }
      if (Math.random() < dt * 8 && DD.Audio) DD.Audio.play('zap', 0.5);
      if (D.alive && !V.metal) { D.blood -= dt * 6; if (D.blood <= 0) kill(B, false); }
      if (V.metal && D.shock > 1.2) kill(B, false);   // overloads the chassis
    }
  }

  /* ---------- rendering ---------- */
  function capsule(ctx, p1, p2, r, color) {
    ctx.strokeStyle = color;
    ctx.lineWidth = r * 2;
    ctx.lineCap = 'round';
    ctx.beginPath(); ctx.moveTo(p1.x, p1.y); ctx.lineTo(p2.x, p2.y); ctx.stroke();
  }
  function dot(ctx, p, r, color) {
    ctx.fillStyle = color;
    ctx.beginPath(); ctx.arc(p.x, p.y, r, 0, Math.PI * 2); ctx.fill();
  }
  function segColor(D, pa, pb, base) {
    const char = Math.max(pa.char, pb.char);
    return shade(base, char, D.alive ? 0 : Math.min(1, D.deadT / 4));
  }
  function intact(B, joint) {
    for (const c of B.constraints) if (c.joint === joint && !c.hidden) return !c.broken;
    return true;
  }

  function render(ctx, B) {
    const D = B.data, V = D.V, bo = D.bones;
    const dead = D.alive ? 0 : Math.min(1, D.deadT / 4);
    const col = (pa, pb, base) => segColor(D, pa, pb, base);

    // far limbs first
    if (intact(B, 'legR')) capsule(ctx, bo.hiR, bo.knR, 6, col(bo.hiR, bo.knR, V.pants));
    if (intact(B, 'shinR')) { capsule(ctx, bo.knR, bo.ftR, 5, col(bo.knR, bo.ftR, V.pants)); dot(ctx, bo.ftR, 6, col(bo.ftR, bo.ftR, V.shoe)); }
    if (intact(B, 'armR')) capsule(ctx, bo.shR, bo.elR, 5, col(bo.shR, bo.elR, V.shirt));
    if (intact(B, 'forearmR')) { capsule(ctx, bo.elR, bo.haR, 4.5, col(bo.elR, bo.haR, V.skin)); dot(ctx, bo.haR, 4.5, col(bo.haR, bo.haR, V.skin)); }

    // torso
    if (intact(B, 'spine')) {
      capsule(ctx, bo.chest, bo.pelvis, 12, col(bo.chest, bo.pelvis, V.shirt));
      dot(ctx, bo.shL, 6.5, col(bo.shL, bo.shL, V.shirt));
      dot(ctx, bo.shR, 6.5, col(bo.shR, bo.shR, V.shirt));
      dot(ctx, bo.pelvis, 10, col(bo.pelvis, bo.pelvis, V.pants));
    } else {
      capsule(ctx, bo.chest, bo.belly, 11, col(bo.chest, bo.belly, V.shirt));
      dot(ctx, bo.pelvis, 10, col(bo.pelvis, bo.pelvis, V.pants));
      dot(ctx, bo.belly, 9, '#5e0808');
    }

    // near limbs
    if (intact(B, 'legL')) capsule(ctx, bo.hiL, bo.knL, 6, col(bo.hiL, bo.knL, mix(V.pants, '#ffffff', 0.07)));
    if (intact(B, 'shinL')) { capsule(ctx, bo.knL, bo.ftL, 5, col(bo.knL, bo.ftL, mix(V.pants, '#ffffff', 0.07))); dot(ctx, bo.ftL, 6, col(bo.ftL, bo.ftL, V.shoe)); }
    if (intact(B, 'armL')) capsule(ctx, bo.shL, bo.elL, 5, col(bo.shL, bo.elL, mix(V.shirt, '#ffffff', 0.1)));
    if (intact(B, 'forearmL')) { capsule(ctx, bo.elL, bo.haL, 4.5, col(bo.elL, bo.haL, V.skin)); dot(ctx, bo.haL, 4.5, col(bo.haL, bo.haL, V.skin)); }

    // neck + head
    const headOn = intact(B, 'neck');
    if (headOn) capsule(ctx, bo.neck, bo.chest, 5, col(bo.neck, bo.chest, V.skin));
    drawHead(ctx, B, headOn);

    // stumps
    for (const p of B.particles) {
      if (p.stump) dot(ctx, p, Math.max(3, p.r * 0.8), V.metal ? '#26282c' : '#7c0c0c');
    }
  }

  function drawHead(ctx, B, attached) {
    const D = B.data, V = D.V, h = D.bones.head;
    const dead = D.alive ? 0 : Math.min(1, D.deadT / 4);
    const c = shade(V.skin, h.char, dead);
    dot(ctx, h, 10, c);
    // face, oriented by the head axis
    ctx.save();
    ctx.translate(h.x, h.y);
    ctx.rotate(D.faceAngle + Math.PI / 2);
    if (V.metal) {
      // visor
      ctx.fillStyle = D.alive ? '#3fd0c9' : '#23282c';
      ctx.fillRect(-6, -3.5, 12, 3);
    } else if (D.alive) {
      ctx.fillStyle = '#1d1d22';
      ctx.beginPath(); ctx.arc(-3.6, -2.5, 1.4, 0, Math.PI * 2); ctx.arc(3.6, -2.5, 1.4, 0, Math.PI * 2); ctx.fill();
      if (V.undead) { ctx.fillStyle = '#c8e64e'; ctx.beginPath(); ctx.arc(-3.6, -2.5, 0.7, 0, Math.PI * 2); ctx.arc(3.6, -2.5, 0.7, 0, Math.PI * 2); ctx.fill(); }
      if (D.pain > 0.25) { ctx.strokeStyle = '#1d1d22'; ctx.lineWidth = 1.2; ctx.beginPath(); ctx.arc(0, 4.5, 2.6, Math.PI * 0.15, Math.PI * 0.85); ctx.stroke(); }
    } else {
      // X eyes
      ctx.strokeStyle = '#1d1d22'; ctx.lineWidth = 1.3; ctx.lineCap = 'round';
      for (const ex of [-3.6, 3.6]) {
        ctx.beginPath();
        ctx.moveTo(ex - 1.6, -4.1); ctx.lineTo(ex + 1.6, -0.9);
        ctx.moveTo(ex + 1.6, -4.1); ctx.lineTo(ex - 1.6, -0.9);
        ctx.stroke();
      }
    }
    ctx.restore();
  }

  /* sever whichever joint this particle belongs to (cuts, explosions) */
  function severAt(p) {
    const B = p.body;
    if (!B || B.kind !== 'ragdoll') return;
    const j = nearestJoint(B, p);
    if (j) sever(B, j);
  }

  /* fire ticking — called by the global burn loop; quiet, no spray fx */
  function applyBurn(p, dt) {
    const B = p.body;
    if (!B || B.kind !== 'ragdoll') return;
    const D = B.data;
    p.hp -= dt * 9;
    if (D.alive) {
      D.blood -= dt * (D.V.undead ? 1.5 : 4);
      if (D.V.pain) D.pain = Math.min(1, D.pain + dt * 1.2);
      if (D.blood <= 0) kill(B, false);
    }
  }

  DD.Ragdoll = { make, hit, sever, severAt, kill, revive, electrocute, applyBurn, VARIANTS };
})();
