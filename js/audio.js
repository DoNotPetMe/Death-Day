/* DEATH DAY — procedural sound effects.
   Everything is synthesized with WebAudio; there are no audio assets.
   The AudioContext is created lazily on the first user gesture. */
(function () {
  const DD = (window.DD = window.DD || {});

  let ctx = null;
  let master = null;
  let muted = false;
  let noiseBuf = null;

  function ensure() {
    if (ctx) return true;
    try {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return false;
      ctx = new AC();
      master = ctx.createGain();
      master.gain.value = 0.5;
      master.connect(ctx.destination);
      // one second of white noise, reused by most effects
      noiseBuf = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate);
      const d = noiseBuf.getChannelData(0);
      for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    } catch (e) { return false; }
    return true;
  }

  function noise(dur, { vol = 0.5, type = 'lowpass', freq = 1000, q = 0.5, decay = true, fend = null } = {}) {
    const src = ctx.createBufferSource();
    src.buffer = noiseBuf;
    src.loop = true;
    const f = ctx.createBiquadFilter();
    f.type = type; f.frequency.value = freq; f.Q.value = q;
    if (fend != null) f.frequency.exponentialRampToValueAtTime(Math.max(40, fend), ctx.currentTime + dur);
    const g = ctx.createGain();
    g.gain.value = vol;
    if (decay) g.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + dur);
    src.connect(f).connect(g).connect(master);
    src.start();
    src.stop(ctx.currentTime + dur);
  }

  function tone(dur, { vol = 0.3, type = 'sine', f0 = 440, f1 = null } = {}) {
    const o = ctx.createOscillator();
    o.type = type; o.frequency.value = f0;
    if (f1 != null) o.frequency.exponentialRampToValueAtTime(Math.max(20, f1), ctx.currentTime + dur);
    const g = ctx.createGain();
    g.gain.value = vol;
    g.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + dur);
    o.connect(g).connect(master);
    o.start();
    o.stop(ctx.currentTime + dur);
  }

  const lib = {
    shot()      { noise(0.13, { vol: 0.7, freq: 2400, fend: 300 }); tone(0.08, { vol: 0.25, type: 'square', f0: 160, f1: 60 }); },
    shotBig()   { noise(0.25, { vol: 0.9, freq: 1800, fend: 150 }); tone(0.18, { vol: 0.4, type: 'square', f0: 120, f1: 40 }); },
    boom()      { noise(0.9,  { vol: 1.0, freq: 900,  fend: 60 });  tone(0.7,  { vol: 0.7, type: 'sine',   f0: 110, f1: 28 }); },
    squish()    { noise(0.12, { vol: 0.45, freq: 500, fend: 120, q: 2 }); },
    crack()     { noise(0.06, { vol: 0.5, type: 'highpass', freq: 1200 }); },
    thud()      { tone(0.10, { vol: 0.35, type: 'sine', f0: 90, f1: 45 }); noise(0.06, { vol: 0.2, freq: 300 }); },
    zap()       { tone(0.09, { vol: 0.25, type: 'sawtooth', f0: 900 + Math.random() * 800, f1: 200 }); noise(0.07, { vol: 0.2, type: 'highpass', freq: 2500 }); },
    fire()      { noise(0.30, { vol: 0.12, freq: 700, q: 1 }); },
    beep()      { tone(0.09, { vol: 0.22, type: 'square', f0: 1300 }); },
    heal()      { tone(0.30, { vol: 0.22, type: 'sine', f0: 500, f1: 1100 }); },
    click()     { noise(0.03, { vol: 0.25, type: 'highpass', freq: 2000 }); },
    rico()      { tone(0.20, { vol: 0.15, type: 'sine', f0: 2200, f1: 600 }); },
    pop()       { noise(0.08, { vol: 0.4, freq: 900, fend: 200 }); },
    hiss()      { noise(0.50, { vol: 0.2, type: 'highpass', freq: 3500 }); },
  };

  DD.Audio = {
    play(name, gain) {
      if (muted || !ensure() || !lib[name]) return;
      if (ctx.state === 'suspended') ctx.resume();
      if (gain != null) { const old = master.gain.value; master.gain.value = old * gain; lib[name](); master.gain.value = old; }
      else lib[name]();
    },
    toggleMute() { muted = !muted; return muted; },
    get muted() { return muted; },
    unlock() { ensure(); if (ctx && ctx.state === 'suspended') ctx.resume(); },
  };
})();
