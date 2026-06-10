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
      // stance: how this being holds itself while alive
      stand: { h: 57, lean: 0, k: 1.0, sway: 1.0 },
    },
    husk: {
      label: 'Husk',
      skin: '#7e9a60', shirt: '#4d4639', pants: '#36332c', shoe: '#26241f',
      bloodColor: '#4a6b1d', stain: '#33490f',
      bulletMul: 0.35, pain: false, undead: true, metal: false,
      stand: { h: 49, lean: 7, k: 0.9, sway: 1.0 },    // hunched, swaying
    },
    automaton: {
      label: 'Automaton',
      skin: '#98a1ab', shirt: '#6b7480', pants: '#525a64', shoe: '#33373d',
      bloodColor: '#1d1f22', stain: '#141517',
      bulletMul: 0.8, pain: false, undead: false, metal: true,
      stand: { h: 58, lean: 0, k: 1.45, sway: 0.25 },  // rigid posture
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
      stun: 0,                                  // knocked down, no balance
      blinkT: 1.5 + Math.random() * 3,          // until next blink
      phase: Math.random() * Math.PI * 2,       // personal sway rhythm
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
    ftL.friction = ftR.friction = 0.8;   // shoes grip the floor

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

    // "muscles": min-distance rods that give the skeleton knee extension
    // and posture while alive & standing. Switched off (disabled) the
    // moment the being is fallen/stunned/shocked/dead → instant ragdoll.
    B.data.muscles = {
      legL: L(hiL, ftL, { type: 'min', len: 60, stiff: 0.95, hidden: true }),
      legR: L(hiR, ftR, { type: 'min', len: 60, stiff: 0.95, hidden: true }),
      torso: L(head, pelvis, { type: 'min', len: 57, stiff: 0.8, hidden: true }),
      // stance: the feet hold a wide base so the legs can't sweep into a
      // split and the tripod is hard to tip
      stance: L(ftL, ftR, { stiff: 0.55, hidden: true, len: 24 }),
      // props: rigid chest→foot diagonals make the standing body a
      // tripod (chest + both feet) that can only tip as a whole — and
      // tipping is the one thing the head/feet nudges are good at fixing
      propL: L(chest, ftL, { stiff: 0.85, hidden: true }),
      propR: L(chest, ftR, { stiff: 0.85, hidden: true }),
    };

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
      // heavy hits knock them off their feet
      if (dmg > 9 && (info.kind === 'blunt' || info.kind === 'blast' || headHit)) {
        D.stun = Math.max(D.stun, Math.min(3.5, 0.8 + dmg * 0.05));
      }
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
      D.stun = Math.max(D.stun, 2.5);
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
    // a body that dies on its feet should crumple, not stand at attention
    const s = Math.random() < 0.5 ? -1 : 1;
    D.bones.head.addVel(s * 1.6, 0.4);
    D.bones.chest.addVel(s * 1.1, 0.2);
    if (violent && !D.V.metal) FX().gibs(D.bones.head.x, D.bones.head.y, 8, D.V.stain);
  }

  function revive(B) {
    const D = B.data;
    // a missing head is beyond the serum
    for (const c of B.constraints) if (c.joint === 'neck' && c.broken && !c.hidden) return false;
    D.alive = true; D.blood = 100; D.deadT = 0; D.pain = 0; D.shock = 0; D.stun = 0;
    D.bleeders.length = 0;
    for (const p of B.particles) { p.hp = Math.max(p.hp, 40); p.burn = 0; p.char = Math.max(0, p.char - 0.5); }
    FX().flash(D.bones.chest.x, D.bones.chest.y, 60, '#8effc0');
    if (DD.Audio) DD.Audio.play('heal');
    return true;
  }

  function electrocute(B, dur) {
    if (B.kind !== 'ragdoll') return;
    B.data.shock = Math.max(B.data.shock, dur);
    B.data.stun = Math.max(B.data.stun, dur + 0.8);
  }

  /* gentle steering force toward a target point, capped so it never
     overpowers real physics — knocks and blasts still win */
  function nudge(p, tx, ty, k, dt) {
    let dx = (tx - p.x) * k * dt, dy = (ty - p.y) * k * dt;
    // capped "muscle" force: firm enough to stand and get back up,
    // never enough to out-muscle a blast or a grab (stun gates it anyway)
    const m = Math.hypot(dx, dy), cap = 60 * dt;
    if (m > cap) { dx *= cap / m; dy *= cap / m; }
    p.addVel(dx, dy);
  }

  function jointOk(B, joint) {
    for (const c of B.constraints) if (c.joint === joint && !c.hidden) return !c.broken;
    return true;
  }

  /* ---------- per-frame behaviour ---------- */
  function update(dt, B) {
    const D = B.data, V = D.V;

    // face angle follows the neck→head axis while attached
    const bo = D.bones;
    D.faceAngle = Math.atan2(bo.head.y - bo.neck.y, bo.head.x - bo.neck.x);

    // blinking
    D.blinkT -= dt;
    if (D.blinkT < -0.14) D.blinkT = 1.5 + Math.random() * 3.5;

    // ---- alive: stand while standing, stay down once truly knocked over ----
    if (D.stun > 0) { D.stun -= dt; D.standX = null; }
    const legL = jointOk(B, 'legL') && jointOk(B, 'shinL');
    const legR = jointOk(B, 'legR') && jointOk(B, 'shinR');
    let standing = false;
    if (D.alive && D.stun <= 0 && D.shock <= 0 && DD.Game && DD.Game.world.gravityOn) {
      const footL = legL && bo.ftL.y - bo.pelvis.y > 26;
      const footR = legR && bo.ftR.y - bo.pelvis.y > 26;
      const sp = Math.hypot(bo.head.x - bo.pelvis.x, bo.head.y - bo.pelvis.y);
      const up = (bo.pelvis.y - bo.head.y) / Math.max(1, sp);   // 1 = vertical
      // hysteresis both ways: a one-frame stumble isn't a fall, and
      // getting back up needs to be properly propped upright
      if (up < 0.42 || !(footL || footR)) D.offBal = (D.offBal || 0) + dt;
      else D.offBal = 0;
      if (D.fallen) {
        // lying down — re-engages only if stood properly upright
        // (the player can prop them back on their feet by dragging)
        if (up > 0.86 && (footL || footR)) { D.fallen = false; D.standX = null; }
      } else if (D.offBal > 0.4) {
        D.fallen = true;
      } else if (up > 0.42 && jointOk(B, 'spine') && D.blood > 20) {
        standing = true;
        const S = D.V.stand;
        const t = (DD.Game ? DD.Game.time : 0) + D.phase;
        const sway = Math.sin(t * 0.7) * 2.2 * S.sway;          // weight shift
        const breath = Math.sin(t * 2.3) * 1.3;                  // breathing bob
        const k = S.k * (footL && footR ? 1 : 0.5);             // one leg = struggling
        // stance anchor: stand *here*; re-anchor only after being shoved
        if (D.standX == null || Math.abs(bo.pelvis.x - D.standX) > 45) D.standX = bo.pelvis.x;
        // the lean (husk hunch) lives in the head/neck only — leaning the
        // chest or feet tips the whole tripod over
        nudge(bo.head, bo.pelvis.x + S.lean + sway, bo.pelvis.y - S.h + breath, 2.1 * k, dt);
        nudge(bo.chest, D.standX, bo.pelvis.y - 34, 1.4 * k, dt);
        // feet plant at the anchor (sway stays in the upper body,
        // otherwise it turns into accidental walking)
        if (footL) nudge(bo.ftL, D.standX - 12, bo.pelvis.y + 66, 1.4 * k, dt);
        if (footR) nudge(bo.ftR, D.standX + 12, bo.pelvis.y + 66, 1.4 * k, dt);
      }
      // idle fidget: tiny hand movements, standing or not
      if (Math.random() < dt * 0.5) {
        (Math.random() < 0.5 ? bo.haL : bo.haR).addVel((Math.random() - 0.5) * 2, -Math.random() * 2);
      }
    }
    // muscles only hold while standing; otherwise full ragdoll
    D.muscles.legL.disabled = !(standing && legL);
    D.muscles.legR.disabled = !(standing && legR);
    D.muscles.torso.disabled = !(standing && jointOk(B, 'neck'));
    D.muscles.stance.disabled = !(standing && legL && legR);
    D.muscles.propL.disabled = !(standing && legL && jointOk(B, 'spine'));
    D.muscles.propR.disabled = !(standing && legR && jointOk(B, 'spine'));

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

  /* ---------- rendering (blocky, People-Playground-style slabs) ---------- */
  function rr(ctx, x, y, w, h, r) {
    ctx.beginPath();
    if (ctx.roundRect) ctx.roundRect(x, y, w, h, r);
    else ctx.rect(x, y, w, h);
  }
  const OUTLINE = 'rgba(8,8,12,0.55)';

  /* oriented slab between two points, slightly extended past each end
     so joints read as solid flesh instead of gaps */
  function blockSeg(ctx, p1, p2, w, fill, ext) {
    const dx = p2.x - p1.x, dy = p2.y - p1.y;
    const len = Math.hypot(dx, dy);
    const e = ext != null ? ext : w * 0.32;
    ctx.save();
    ctx.translate(p1.x, p1.y);
    ctx.rotate(Math.atan2(dy, dx));
    rr(ctx, -e, -w / 2, len + e * 2, w, Math.min(3, w * 0.3));
    ctx.fillStyle = fill;
    ctx.fill();
    ctx.strokeStyle = OUTLINE;
    ctx.lineWidth = 1.5;
    ctx.stroke();
    ctx.restore();
  }

  /* free-standing slab centred on a point */
  function blockAt(ctx, x, y, w, h, ang, fill, r) {
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(ang);
    rr(ctx, -w / 2, -h / 2, w, h, r != null ? r : 2.5);
    ctx.fillStyle = fill;
    ctx.fill();
    ctx.strokeStyle = OUTLINE;
    ctx.lineWidth = 1.5;
    ctx.stroke();
    ctx.restore();
  }

  function dot(ctx, p, r, color) {
    ctx.fillStyle = color;
    ctx.beginPath(); ctx.arc(p.x, p.y, r, 0, Math.PI * 2); ctx.fill();
  }
  function segColor(D, pa, pb, base) {
    const char = Math.max(pa.char, pb.char);
    return shade(base, char, D.alive ? 0 : Math.min(1, D.deadT / 4));
  }
  function ang(p1, p2) { return Math.atan2(p2.y - p1.y, p2.x - p1.x); }

  function render(ctx, B) {
    const D = B.data, V = D.V, bo = D.bones;
    const col = (pa, pb, base) => segColor(D, pa, pb, base);
    // far side is shaded darker, near side lighter — gives the flat
    // slabs a hint of depth
    const farPants = mix(V.pants, '#000000', 0.22), nearPants = mix(V.pants, '#ffffff', 0.07);
    const farShirt = mix(V.shirt, '#000000', 0.22), nearShirt = mix(V.shirt, '#ffffff', 0.09);
    const farSkin = mix(V.skin, '#000000', 0.16), nearSkin = mix(V.skin, '#ffffff', 0.05);

    // ---- far (right) limbs ----
    if (jointOk(B, 'armR')) blockSeg(ctx, bo.shR, bo.elR, 9.5, col(bo.shR, bo.elR, farShirt));
    if (jointOk(B, 'legR')) blockSeg(ctx, bo.hiR, bo.knR, 11, col(bo.hiR, bo.knR, farPants));
    if (jointOk(B, 'shinR')) {
      blockSeg(ctx, bo.knR, bo.ftR, 9.5, col(bo.knR, bo.ftR, farPants));
      blockAt(ctx, bo.ftR.x, bo.ftR.y + 1, 15, 7.5, ang(bo.knR, bo.ftR) + Math.PI / 2, col(bo.ftR, bo.ftR, V.shoe));
    }
    if (jointOk(B, 'forearmR')) {
      blockSeg(ctx, bo.elR, bo.haR, 8, col(bo.elR, bo.haR, farSkin));
      blockAt(ctx, bo.haR.x, bo.haR.y, 8, 8, ang(bo.elR, bo.haR), col(bo.haR, bo.haR, farSkin));
    }

    // ---- torso ----
    if (jointOk(B, 'spine')) {
      blockSeg(ctx, bo.chest, bo.pelvis, 25, col(bo.chest, bo.pelvis, V.shirt), 9);
      blockSeg(ctx, bo.belly, bo.pelvis, 23, col(bo.belly, bo.pelvis, V.pants), 4);
    } else {
      // bisected: ribcage block + hip block, meat in between
      blockSeg(ctx, bo.chest, bo.belly, 24, col(bo.chest, bo.belly, V.shirt), 6);
      blockAt(ctx, bo.pelvis.x, bo.pelvis.y, 22, 16, ang(bo.hiL, bo.hiR), col(bo.pelvis, bo.pelvis, V.pants));
      dot(ctx, bo.belly, 9, V.metal ? '#26282c' : '#5e0808');
    }
    // chassis core light on the automaton
    if (V.metal) {
      const cx = bo.chest.x, cy = bo.chest.y;
      blockAt(ctx, cx, cy, 7, 7, ang(bo.pelvis, bo.chest) + Math.PI / 2, D.alive ? '#ffb13d' : '#3a3326', 1.5);
      if (D.alive) {
        ctx.globalAlpha = 0.35 + 0.2 * Math.sin((DD.Game ? DD.Game.time : 0) * 4 + D.phase);
        dot(ctx, bo.chest, 8, '#ffb13d');
        ctx.globalAlpha = 1;
      }
    }

    // ---- near (left) leg ----
    if (jointOk(B, 'legL')) blockSeg(ctx, bo.hiL, bo.knL, 11, col(bo.hiL, bo.knL, nearPants));
    if (jointOk(B, 'shinL')) {
      blockSeg(ctx, bo.knL, bo.ftL, 9.5, col(bo.knL, bo.ftL, nearPants));
      blockAt(ctx, bo.ftL.x, bo.ftL.y + 1, 15, 7.5, ang(bo.knL, bo.ftL) + Math.PI / 2, col(bo.ftL, bo.ftL, V.shoe));
    }

    // ---- neck + head ----
    const headOn = jointOk(B, 'neck');
    if (headOn) blockSeg(ctx, bo.chest, bo.neck, 9, col(bo.neck, bo.chest, V.skin), 2);
    drawHead(ctx, B);

    // ---- near (left) arm on top — reads as the one holding things ----
    if (jointOk(B, 'armL')) blockSeg(ctx, bo.shL, bo.elL, 9.5, col(bo.shL, bo.elL, nearShirt));
    if (jointOk(B, 'forearmL')) {
      blockSeg(ctx, bo.elL, bo.haL, 8, col(bo.elL, bo.haL, nearSkin));
      blockAt(ctx, bo.haL.x, bo.haL.y, 8, 8, ang(bo.elL, bo.haL), col(bo.haL, bo.haL, nearSkin));
    }

    // ---- stumps ----
    for (const p of B.particles) {
      if (p.stump) dot(ctx, p, Math.max(3.5, p.r * 0.85), V.metal ? '#26282c' : '#7c0c0c');
    }
  }

  function drawHead(ctx, B) {
    const D = B.data, V = D.V, h = D.bones.head;
    const dead = D.alive ? 0 : Math.min(1, D.deadT / 4);
    const skin = shade(V.skin, h.char, dead);
    ctx.save();
    ctx.translate(h.x, h.y);
    ctx.rotate(D.faceAngle + Math.PI / 2);
    // skull slab
    rr(ctx, -9.5, -11, 19, 21.5, 4);
    ctx.fillStyle = skin;
    ctx.fill();
    ctx.strokeStyle = OUTLINE;
    ctx.lineWidth = 1.5;
    ctx.stroke();
    // flat-top hair / scalp plate
    ctx.fillStyle = V.metal ? mix(V.skin, '#000000', 0.3) : mix(V.skin, '#000000', V.undead ? 0.45 : 0.55);
    rr(ctx, -9.5, -11, 19, 4.5, [4, 4, 0, 0]);
    ctx.fill();

    const blink = D.blinkT < 0;
    if (V.metal) {
      ctx.fillStyle = D.alive ? '#3fd0c9' : '#23282c';
      ctx.fillRect(-6.5, -3.5, 13, 3.2);
      if (D.alive && Math.random() < 0.02) { ctx.fillStyle = '#bdfffb'; ctx.fillRect(-6.5, -3.5, 4, 3.2); }
    } else if (D.alive) {
      // blocky eyes (they blink)
      ctx.fillStyle = '#1d1d22';
      if (blink) { ctx.fillRect(-5.4, -2.2, 3.2, 1); ctx.fillRect(2.2, -2.2, 3.2, 1); }
      else { ctx.fillRect(-5.4, -3.6, 3.2, 4); ctx.fillRect(2.2, -3.6, 3.2, 4); }
      if (V.undead && !blink) { ctx.fillStyle = '#c8e64e'; ctx.fillRect(-4.6, -2.6, 1.6, 1.6); ctx.fillRect(3, -2.6, 1.6, 1.6); }
      // pain: knitted brows + grimace
      if (D.pain > 0.25) {
        ctx.strokeStyle = '#1d1d22'; ctx.lineWidth = 1.3; ctx.lineCap = 'round';
        ctx.beginPath();
        ctx.moveTo(-5.6, -5.6); ctx.lineTo(-1.8, -4.2);
        ctx.moveTo(5.6, -5.6); ctx.lineTo(1.8, -4.2);
        ctx.stroke();
        ctx.fillStyle = '#1d1d22';
        ctx.fillRect(-2.4, 4.4, 4.8, 1.6);
      }
    } else {
      // X eyes
      ctx.strokeStyle = '#1d1d22'; ctx.lineWidth = 1.4; ctx.lineCap = 'round';
      for (const ex of [-3.8, 3.8]) {
        ctx.beginPath();
        ctx.moveTo(ex - 1.7, -4.2); ctx.lineTo(ex + 1.7, -0.8);
        ctx.moveTo(ex + 1.7, -4.2); ctx.lineTo(ex - 1.7, -0.8);
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
