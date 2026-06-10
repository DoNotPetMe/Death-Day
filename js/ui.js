/* DEATH DAY — DOM chrome: requisition menu, top bar, hints.
   Item thumbnails are rendered with each item's real in-game renderer,
   so the menu always matches what spawns. */
(function () {
  const DD = (window.DD = window.DD || {});

  let curCat = 'beings';
  const buttons = new Map();   // item.id -> element

  function makeIcon(item) {
    const cv = document.createElement('canvas');
    cv.width = 128; cv.height = 96;
    try {
      const scratch = new DD.Physics.World(4000, 4000);
      const b = item.make(scratch, 2000, 2000);
      let x0 = 1e9, y0 = 1e9, x1 = -1e9, y1 = -1e9;
      for (const p of b.particles) {
        x0 = Math.min(x0, p.x - p.r - 8); y0 = Math.min(y0, p.y - p.r - 8);
        x1 = Math.max(x1, p.x + p.r + 8); y1 = Math.max(y1, p.y + p.r + 8);
      }
      // melee/guns render past their particles; pad generously
      x0 -= 14; x1 += 14; y0 -= 14; y1 += 14;
      const ctx = cv.getContext('2d');
      const sc = Math.min(cv.width / (x1 - x0), cv.height / (y1 - y0));
      ctx.translate(cv.width / 2, cv.height / 2);
      ctx.scale(sc, sc);
      ctx.translate(-(x0 + x1) / 2, -(y0 + y1) / 2);
      if (b.render) b.render(ctx, b);
    } catch (e) { /* icon failure is cosmetic */ }
    return cv;
  }

  function buildMenu() {
    const catsEl = document.getElementById('cats');
    const itemsEl = document.getElementById('items');

    for (const c of DD.Items.CATS) {
      const el = document.createElement('div');
      el.className = 'cat' + (c.id === curCat ? ' sel' : '');
      el.textContent = c.label;
      el.dataset.cat = c.id;
      el.addEventListener('click', () => {
        curCat = c.id;
        for (const o of catsEl.children) o.classList.toggle('sel', o.dataset.cat === c.id);
        fillItems(itemsEl);
      });
      catsEl.appendChild(el);
    }
    fillItems(itemsEl);
  }

  function fillItems(itemsEl) {
    itemsEl.innerHTML = '';
    buttons.clear();
    for (const item of DD.Items.registry) {
      if (item.cat !== curCat) continue;
      const el = document.createElement('div');
      el.className = 'item';
      el.appendChild(makeIcon(item));
      const nm = document.createElement('div');
      nm.className = 'nm';
      nm.textContent = item.name;
      el.appendChild(nm);
      el.addEventListener('click', () => {
        const sel = DD.Game.selected === item ? null : item;
        DD.Game.select(sel);
        DD.Audio && DD.Audio.play('click');
      });
      buttons.set(item.id, el);
      itemsEl.appendChild(el);
    }
    syncSelection(DD.Game.selected);
  }

  function syncSelection(item) {
    for (const [id, el] of buttons) el.classList.toggle('sel', !!item && id === item.id);
    setHint(item);
  }

  function setHint(item) {
    const el = document.getElementById('hint');
    if (!el) return;
    if (item) {
      el.innerHTML = `placing <b>${item.name}</b> — click to spawn · <b>Esc</b>/right-click to stop`;
    } else {
      el.innerHTML = `<b>drag</b> things with the mouse · <b>right-click / F</b> activates (fires, primes, revives) · <b>X</b> delete · <b>P</b> pin · <b>H</b> all controls`;
    }
  }

  function bindTopbar() {
    const on = (id, fn) => { const el = document.getElementById(id); if (el) el.addEventListener('click', fn); };
    on('btn-pause', () => DD.Game.togglePause());
    on('btn-slow', () => DD.Game.toggleSlow());
    on('btn-grav', () => DD.Game.toggleGravity());
    on('btn-blood', () => DD.FX.clearStains());
    on('btn-clear', () => DD.Game.clearAll());
    on('btn-sound', () => DD.Game.toggleSound());
    on('btn-help', () => DD.Game.toggleHelp());
    on('btn-closehelp', () => { DD.Game.hideHelp(); DD.Audio && DD.Audio.unlock(); });
  }

  DD.UI = {
    init() {
      buildMenu();
      bindTopbar();
      setHint(null);
      DD.Game.onSelectChange = syncSelection;
    },
  };
})();
