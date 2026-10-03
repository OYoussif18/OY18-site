/* ═══════════════════════════════════════════════════════════════
   OY18 — behaviour
   Vanilla, dependency-free, ~9KB. Two 2D canvases, one shared rAF.
   Everything degrades: no canvas → no visual, but content remains.
   ═══════════════════════════════════════════════════════════════ */
(() => {
'use strict';

const $  = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => Array.from(r.querySelectorAll(s));

const REDUCED = matchMedia('(prefers-reduced-motion: reduce)').matches;
const FINE    = matchMedia('(hover: hover) and (pointer: fine)').matches;
const COARSE  = matchMedia('(pointer: coarse)').matches;

const clamp = (v, a, b) => v < a ? a : v > b ? b : v;
const lerp  = (a, b, t) => a + (b - a) * t;
const rand  = (a, b) => a + Math.random() * (b - a);

/* Accent read from CSS so the canvas and the DOM never drift. */
const CSS = getComputedStyle(document.documentElement);
const ACCENT = CSS.getPropertyValue('--accent').trim() || '#ffae2e';
const ACCENT2 = CSS.getPropertyValue('--accent-2').trim() || '#ff7a45';
const hexToRgb = (h) => {
  const s = h.replace('#', '');
  const n = parseInt(s.length === 3 ? s.split('').map(c => c + c).join('') : s, 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
};
const ACC_RGB = hexToRgb(ACCENT);

/* ── Shared rAF driver ───────────────────────────────────────── */
const Ticker = (() => {
  const subs = new Set();
  let running = false, last = 0;
  const frame = (t) => {
    const dt = Math.min((t - last) / 1000, 0.05) || 0.016;
    last = t;
    for (const fn of subs) fn(dt, t);
    if (subs.size) requestAnimationFrame(frame); else running = false;
  };
  return {
    add(fn) { subs.add(fn); if (!running) { running = true; last = performance.now(); requestAnimationFrame(frame); } },
    remove(fn) { subs.delete(fn); }
  };
})();

/* ═══════════ 1 · Pointer (custom cursor) ═══════════════════ */
const Pointer = (() => {
  const el = $('[data-cursor]');
  if (!el || !FINE) return { x: 0, y: 0, active: false, down: false };

  const ring = $('.cursor__ring', el);
  const dot  = $('.cursor__dot', el);
  const label = $('text', el);

  const target = { x: innerWidth / 2, y: innerHeight / 2 };
  const pos    = { ...target };
  const state  = { cur: 'default', prev: 'default', t: 0 };

  addEventListener('pointermove', (e) => {
    target.x = e.clientX; target.y = e.clientY;
    if (state.cur === 'hide') set('default');
    if (!el.dataset.on) { el.dataset.on = '1'; set('default'); }
  }, { passive: true });

  addEventListener('pointerdown', () => { state.down = true;  el.dataset.down = '1'; }, { passive: true });
  addEventListener('pointerup',   () => { state.down = false; delete el.dataset.down; }, { passive: true });
  document.addEventListener('pointerleave', () => set('hide'));
  document.addEventListener('pointerenter', () => { if (el.dataset.on) set('default'); });

  function set(next) {
    if (next === state.cur) return;
    state.prev = state.cur; state.cur = next;
    el.dataset.state = next === 'default' ? '' : next;
    if (el.dataset.state === '') delete el.dataset.state;
    label.textContent = next === 'view' || next === 'link' ? (el._label || '') : '';
  }

  function setLabel(t) { el._label = t || ''; }

  Ticker.add((dt) => {
    // Slight lag on the ring, near-instant on the dot: the classic "two speeds" tell.
    pos.x = lerp(pos.x, target.x, 1 - Math.pow(0.0006, dt));
    pos.y = lerp(pos.y, target.y, 1 - Math.pow(0.0006, dt));
    const dx = target.x, dy = target.y;
    el.style.transform = `translate3d(${pos.x}px, ${pos.y}px, 0)`;
    const r = ring.getBoundingClientRect();
    ring.style.transform = `translate(-50%,-50%) translate(${dx - pos.x}px, ${dy - pos.y}px)`;
    dot.style.transform  = `translate(-50%,-50%)`;
    label.style.transform = `translate(-50%, ${state.cur === 'view' ? 40 : 18}px)`;
    void r;
  });

  return {
    get x() { return target.x; },
    get y() { return target.y; },
    get active() { return !!el.dataset.on; },
    get down() { return state.down; },
    setLabel,
    set,
    hide() { set('hide'); }
  };
})();

/* Cursor affordances, delegated — no per-element listeners. */
if (FINE) {
  document.documentElement.classList.add('has-cursor');
  const LABELLED = 'a, button, [role="button"], summary';
  const VIEW     = '[data-cursor-label]';

  document.addEventListener('pointerover', (e) => {
    const v = e.target.closest?.(VIEW);
    if (v) { Pointer.setLabel(v.dataset.cursorLabel); Pointer.set('view'); return; }
    const l = e.target.closest?.(LABELLED);
    Pointer.set(l ? 'link' : 'default');
  }, { passive: true });
}

/* ═══════════ 2 · Text splitting (hero name, headings) ═════ */
function splitChars(el) {
  /* Capture the real text first — with <br> read as a space — so the element
     keeps a correct accessible name after we shred it into spans. */
  const probe = el.cloneNode(true);
  probe.querySelectorAll('br').forEach(br => br.replaceWith(' '));
  const label = probe.textContent.replace(/\s+/g, ' ').trim();
  el.setAttribute('aria-label', label);

  const frag = document.createDocumentFragment();
  let i = 0;

  const addChar = (ch) => {
    const s = document.createElement('span');
    s.className = 'ch';
    s.setAttribute('aria-hidden', 'true');
    s.textContent = ch === ' ' ? ' ' : ch;
    s.style.setProperty('--i', i++);
    frag.appendChild(s);
  };

  /* Walk child nodes so <br> survives the split. */
  const walk = (node) => {
    node.childNodes.forEach((n) => {
      if (n.nodeType === Node.TEXT_NODE) {
        for (const ch of n.textContent) addChar(ch);
      } else if (n.nodeName === 'BR') {
        const br = document.createElement('br');
        br.setAttribute('aria-hidden', 'true');
        frag.appendChild(br);
        i++;                       // keep the stagger timing continuous
      } else if (n.nodeType === Node.ELEMENT_NODE) {
        walk(n);
      }
    });
  };
  walk(el);

  el.textContent = '';
  el.appendChild(frag);

  if (el.classList.contains('hero__name')) {
    const caret = document.createElement('span');
    caret.className = 'hero__caret';
    caret.setAttribute('aria-hidden', 'true');
    el.appendChild(caret);
  }
  return $$('.ch', el);
}

$$('[data-split]').forEach(el => { splitChars(el); el._chars = $$('.ch', el); });

/* ═══════════ 3 · Reveal on enter ═══════════════════════════ */
const revealIO = new IntersectionObserver((entries) => {
  for (const e of entries) {
    if (!e.isIntersecting) continue;
    const el = e.target;
    if (el._chars) el._chars.forEach(c => c.classList.add('is-in'));
    else el.classList.add('is-in');
    revealIO.unobserve(el);
  }
}, { rootMargin: '0px 0px -12% 0px', threshold: 0.1 });
$$('[data-reveal], [data-split]').forEach(el => revealIO.observe(el));

/* ═══════════ 4 · Interest glyphs ═══════════════════════════ */
/* Hairline marks — one per interest. Drawn, not decorative filler. */
const GLYPHS = {
  shield:  '<path data-s d="M23 5 38 11v11c0 8-6.4 14.2-15 17-8.6-2.8-15-9-15-17V11z"/><path data-s d="M17 23.5 21.5 28 30 19.5"/>',
  mesh:    '<circle data-f cx="16" cy="14" r="2.4"/><circle data-f cx="32" cy="10" r="2.4"/><circle data-f cx="38" cy="27" r="2.4"/><circle data-f cx="20" cy="34" r="2.4"/><path data-s d="M17.6 15.8 30.2 11.4M33.4 12.3 36.7 24.8M36.4 29 22 33.1M18.4 16.1 19.2 31.6M16 13.4 20 31.6M32 12.6 21 32.7"/>',
  browser: '<rect data-s x="6" y="9" width="34" height="24" rx="3"/><path data-s d="M6 16h34"/><circle data-f cx="10.5" cy="12.5" r="1.1"/><circle data-f cx="14.5" cy="12.5" r="1.1"/><path data-s d="M13 22h11M13 27h18"/>',
  chip:    '<rect data-s x="13" y="13" width="20" height="20" rx="3"/><rect data-s x="19" y="19" width="8" height="8" rx="1.4"/><path data-s d="M18 6v7M27 6v7M18 33v7M27 33v7M6 18h7M6 27h7M33 18h7M33 27h7"/>',
  loop:    '<path data-s d="M38 20a13 13 0 1 0-3.4 9.6"/><path data-s d="M38 12.5V21h-8.5"/><circle data-f cx="23" cy="23" r="2.6"/>',
  brace:   '<path data-s d="M19 7c-4 0-5 2.4-5 5.4v3.2c0 2.6-1 4.4-3.4 4.4 2.4 0 3.4 1.8 3.4 4.4v3.2C14 31.6 15 34 19 34"/><path data-s d="M27 7c4 0 5 2.4 5 5.4v3.2c0 2.6 1 4.4 3.4 4.4-2.4 0-3.4 1.8-3.4 4.4v3.2c0 3-1 5.4-5 5.4"/>'
};
$$('[data-glyph]').forEach(el => {
  const g = GLYPHS[el.dataset.glyph];
  if (!g) return;
  el.innerHTML = `<svg viewBox="0 0 46 41" aria-hidden="true" focusable="false">${g}</svg>`;
});

/* ═══════════ 5 · Depth rail ════════════════════════════════ */
const Rail = (() => {
  const fill = $('[data-rail-fill]');
  const depth = $('[data-rail-depth]');
  const links = $$('[data-rail-link]');
  const sections = links
    .map(a => ({ a, el: document.getElementById(a.dataset.railLink) }))
    .filter(s => s.el);
  if (!links.length) return;

  let cur = -1;
  function update() {
    const max = document.documentElement.scrollHeight - innerHeight;
    const p = max > 0 ? clamp(scrollY / max, 0, 1) : 0;
    if (fill)  fill.style.height = (p * 100).toFixed(2) + '%';
    if (depth) depth.textContent = String(Math.round(p * 100)).padStart(2, '0');

    const probe = scrollY + innerHeight * 0.36;
    let next = 0;
    sections.forEach((s, i) => { if (s.el.offsetTop <= probe) next = i; });
    if (next !== cur) {
      cur = next;
      sections.forEach((s, i) => s.a.setAttribute('aria-current', i === next ? 'true' : 'false'));
    }
  }
  addEventListener('scroll', update, { passive: true });
  addEventListener('resize', update, { passive: true });
  update();
  return { update };
})();

/* ═══════════ 6 · Mobile index ═════════════════════════════ */
(() => {
  const panel = $('[data-mnav]');
  const open  = $('[data-mnav-open]');
  if (!panel || !open) return;

  const show = (on) => {
    panel.hidden = false;
    requestAnimationFrame(() => panel.classList.toggle('is-open', on));
    open.setAttribute('aria-expanded', String(on));
    if (!on) setTimeout(() => { if (!panel.classList.contains('is-open')) panel.hidden = true; }, 480);
    document.body.style.overflow = on ? 'hidden' : '';
    if (on) $('a', panel)?.focus({ preventScroll: true });
  };
  open.addEventListener('click', () => show(open.getAttribute('aria-expanded') !== 'true'));
  $$('[data-mnav-link]').forEach(a => a.addEventListener('click', () => show(false)));
  $('[data-mnav-close]')?.addEventListener('click', () => show(false));
  addEventListener('keydown', (e) => { if (e.key === 'Escape' && panel.classList.contains('is-open')) { show(false); open.focus(); } });

  // keep the mobile index in sync with the rail
  const mLinks = $$('[data-mnav-link]');
  new IntersectionObserver((es) => {
    es.forEach((e) => {
      if (!e.isIntersecting) return;
      mLinks.forEach(a => a.setAttribute('aria-current',
        a.dataset.mnavLink === e.target.id ? 'true' : 'false'));
    });
  }, { rootMargin: '-42% 0px -52% 0px' })
  .observe($('#signal') || document.body);
  $$('main > section[id]').forEach(s => s.id && $$('[data-mnav-link]').forEach(() => {}));
})();

/* ═══════════ 7 · Now: filters + signal plot ═══════════════ */
(() => {
  const items = $$('.now__item');
  const btns  = $$('[data-now-filter]');
  if (!items.length) return;

  /* Arrival reveal.
     An item is parked in `.is-enter` (4px low, transparent), unhidden, then
     released on the next frame so the CSS transition performs the movement.
     The stagger is small — 34ms, capped — so a five-item list resolves in
     about 140ms total: enough to read as a system reorganising, not enough
     to feel like a slideshow. */
  const REVEAL_MS = 340, STAGGER_MS = 34;

  function revealIn(el, order) {
    el.hidden = false;
    el.classList.remove('is-out');
    el.classList.add('is-enter');
    // Force a style flush so the browser records the parked position before
    // we release it; without this the transition has no start value to run from.
    void el.offsetHeight;
    requestAnimationFrame(() => {
      setTimeout(() => el.classList.remove('is-enter'), order * STAGGER_MS);
    });
  }

  /* The list composes itself once when it first enters view. Items already
     visible at load are left alone so there is no flash on a deep link. */
  let composed = false;
  const composeIO = new IntersectionObserver((es) => {
    if (!es.some(e => e.isIntersecting) || composed) return;
    composed = true;
    composeIO.disconnect();
    items.forEach((it, i) => {
      if (it.hidden) return;
      revealIn(it, i);
    });
  }, { threshold: 0.2 });
  composeIO.observe(items[0].closest('.now__list') || items[0]);

  btns.forEach(btn => btn.addEventListener('click', () => {
    const want = btn.dataset.nowFilter;
    btns.forEach(b => b.setAttribute('aria-pressed', String(b === btn)));
    // Mark the change as user-driven so the composition pass never re-runs.
    composed = true;

    // Cancel any in-flight reveal so a rapid second click cannot leave an
    // item stranded in `.is-enter` (invisible) after the new filter applies.
    items.forEach(it => {
      if (it._revealT) { clearTimeout(it._revealT); it._revealT = 0; }
      it.classList.remove('is-enter');
    });

    let order = 0;
    items.forEach((it) => {
      const show = want === 'all' || it.dataset.cat === want;
      if (show) {
        if (it.hidden) {
          const mine = order++;
          it._revealT = setTimeout(() => {
            revealIn(it, 0);
            it._revealT = 0;
          }, mine * STAGGER_MS);
        } else {
          // Already on screen: settle it without re-animating.
          it.classList.remove('is-out');
        }
      } else {
        it.classList.remove('is-enter');
        it.classList.add('is-out');
        setTimeout(() => { it.hidden = true; }, REVEAL_MS);
      }
    });
  }));

  /* The plot. Bars represent how much of my attention each thread is taking
     right now — a self-reported qualitative signal, not a measurement. */
  const plot = $('[data-plot]');
  const line = $('[data-plot-line]');
  const area = $('[data-plot-area]');
  const head = $('[data-plot-now]');
  if (!plot || !line) return;

  const W = 320, H = 120;
  // Deliberately irregular: a smooth curve would imply data I don't have.
  const pts = [8, 14, 10, 22, 18, 34, 30, 46, 40, 58, 52, 70, 64, 78, 72, 88, 82, 94, 86, 100];
  const maxCount = items.length;

  function smooth() {
    let d = `M0,${H - pts[0] * (H / 100)}`;
    for (let i = 1; i < pts.length; i++) {
      const x0 = ((i - 1) / (pts.length - 1)) * W, y0 = H - pts[i - 1] * (H / 100);
      const x1 = (i / (pts.length - 1)) * W,        y1 = H - pts[i]     * (H / 100);
      const cx = (x0 + x1) / 2;
      d += ` C${cx},${y0} ${cx},${y1} ${x1},${y1}`;
    }
    return d;
  }
  const d = smooth();
  line.setAttribute('d', d);
  area.setAttribute('d', `${d} L${W},${H} L0,${H} Z`);

  const io = new IntersectionObserver((es) => {
    if (es.some(e => e.isIntersecting)) { plot.classList.add('is-in'); io.disconnect(); }
  }, { threshold: 0.35 });
  io.observe(plot);

  // Place the "now" dot proportionally to how many threads are open.
  const place = () => {
    if (!head) return;
    const ratio = clamp(items.filter(i => !i.hidden).length / maxCount, 0, 1);
    const x = ratio * W, y = H - pts[pts.length - 1] * (H / 100);
    head.style.left = (x / W) * 100 + '%';
    head.style.top  = (y / H) * 100 + '%';
  };
  place();
  setTimeout(place, 400);
})();

/* ═══════════ 8 · Basis loop: steps illuminate on entry ═════ */
(() => {
  const steps = $$('[data-loop-step]');
  if (!steps.length) return;
  const io = new IntersectionObserver((es) => {
    es.forEach(e => { if (e.isIntersecting) { e.target.classList.add('is-in'); io.unobserve(e.target); } });
  }, { threshold: 0.55 });
  steps.forEach(s => io.observe(s));
})();

/* ═══════════ 9 · Hero lattice ═════════════════════════════
   A soft disc of nodes. Edges are rewired on a timer so the graph
   is never static. The pointer is a field: it pulls nearby nodes
   and brightens the edges that tighten around it.
   Capped at 40fps and paused when off-screen or hidden, so it
   never competes with scrolling.                                    */
(() => {
  const cv = $('[data-lattice]');
  if (!cv) return;
  const ctx = cv.getContext('2d', { alpha: true });
  if (!ctx) return;

  let W = 0, H = 0, dpr = 1;
  let nodes = [], visible = false;
  let lastDraw = 0, quality = 1;
  let costEMA = 0, settled = 0;   // smoothed draw cost, frames since rebuild

  /* Node count and link reach are tuned together: if the reach is much
     smaller than the mean node spacing, the graph reads as dust, not
     as a network. LINK is kept close to the typical neighbour distance. */
  const R_MAX = 0.46;                // field radius as a share of the short edge
  const LINK  = 168;                 // link distance in css px
  const PULL  = 210;                 // pointer field radius
  const PULLK = 0.30;
  const FRAME_MS = 1000 / 40;        // the field never runs above 40fps

  function resize() {
    const r = cv.getBoundingClientRect();
    dpr = Math.min(devicePixelRatio || 1, 2);
    W = Math.max(1, r.width); H = Math.max(1, r.height);
    cv.width = Math.round(W * dpr); cv.height = Math.round(H * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    build();
  }

  function build() {
    /* Node count scales with area, capped — the effect must never dominate cost.
       `quality` shrinks the field on slow hardware rather than dropping frames. */
    const base = clamp(Math.round((W * H) / 17000), 46, 118);
    const target = Math.max(28, Math.round(base * quality));
    /* Biased right of centre: the headline owns the left third, so the
       graph reads as a deliberate counterweight rather than noise behind text.
       On phones the headline spans the full width, so the field drops below
       it and concentrates in the empty lower half of the screen. */
    const narrow = W < 760;
    const cx = W * (narrow ? 0.56 : 0.66);
    const cy = H * (narrow ? 0.72 : 0.46);
    const R = Math.min(W, H) * (narrow ? 0.44 : R_MAX) * (0.72 + quality * 0.28);
    const spreadX = narrow ? 1.15 : 1.16;
    const spreadY = H < 620 ? 0.94 : (narrow ? 0.62 : 1.14);
    nodes = [];
    for (let i = 0; i < target; i++) {
      // Golden-angle spiral → even coverage, then jitter so it isn't visibly radial.
      const k = (i + 0.5) / target;
      const ang = i * 2.399963 + rand(-0.14, 0.14);
      const rad = R * Math.sqrt(k) * rand(0.9, 1.06);
      const n = {
        ox: cx + Math.cos(ang) * rad * spreadX,
        oy: cy + Math.sin(ang) * rad * spreadY,
        x: 0, y: 0,
        r: rand(1.0, 2.0),
        ph: rand(0, Math.PI * 2),
        hot: 0
      };
      n.x = n.ox; n.y = n.oy;
      nodes.push(n);
    }
    seedRewires();   // indices must match the current node list
  }

  /* Rewire: swapping a pair of nodes' anchor positions is what makes the
     graph feel alive without any node moving erratically. Re-seeded after
     every build() so the indices can never point past a shrunk node list. */
  let rewires = [];
  function seedRewires() {
    rewires = [];
    const n = nodes.length;
    if (n < 4) return;
    for (let k = 0; k < 7; k++) {
      const from = k % n;
      const to = (k * 5 + 3) % n;
      if (from !== to) rewires.push({ at: k * 0.95 + 0.4, from, to });
    }
  }
  function rewire(i) {
    const r = rewires[i % rewires.length];
    if (!r) return;
    const a = nodes[r.from], b = nodes[r.to];
    if (!a || !b) return;
    [a.ox, b.ox] = [b.ox, a.ox];
    a.x = a.ox; b.x = b.ox;
  }

  /* Pointer field */
  const P = { x: -9999, y: -9999, on: false };
  addEventListener('pointermove', (e) => {
    P.x = e.clientX; P.y = e.clientY; P.on = true;
  }, { passive: true });
  addEventListener('pointerleave', () => { P.on = false; }, { passive: true });

  const io = new IntersectionObserver((es) => { visible = es.some(e => e.isIntersecting); }, { threshold: 0 });
  io.observe(cv);

  function frame(dt, time) {
    if (!visible || document.hidden) return;
    // Cap the field's own refresh rate; the rest of the page keeps 60fps.
    if (time - lastDraw < FRAME_MS) return;

    /* Adaptive quality.
       Measure the DRAW itself, not the gap between draws: the gap is
       dominated by the 40fps cap, so using it as the signal makes the
       governor oscillate. The EMA damps single slow frames, and a
       settle counter stops it from rebuilding every few frames. */
    const t0 = performance.now();
    draw(time / 1000);
    const cost = performance.now() - t0;
    costEMA = costEMA ? costEMA * 0.82 + cost * 0.18 : cost;

    if (++settled > 45) {
      if (costEMA > 11 && quality > 0.45) { quality = Math.max(0.45, quality - 0.18); build(); settled = 0; costEMA = 0; }
      else if (costEMA < 4.5 && quality < 1) { quality = Math.min(1, quality + 0.1); build(); settled = 0; costEMA = 0; }
    }
    lastDraw = time;
  }

  function draw(t) {
    t = t || 0;

    rewires.forEach((r, i) => { if (t % 6.65 > r.at && !r.done) { r.done = true; rewire(i); } });
    if (t % 6.65 < 0.2) rewires.forEach(r => r.done = false);

    ctx.clearRect(0, 0, W, H);

    /* Node motion: a slow orbital drift plus breathing radius, so the
       structure stays composed even when untouched. */
    for (const n of nodes) {
      const drift = REDUCED ? 0 : 1;
      const wob = Math.sin(t * 0.32 + n.ph) * 5.5 * drift;
      const wob2 = Math.cos(t * 0.26 + n.ph * 1.3) * 4.2 * drift;
      let tx = n.ox + wob, ty = n.oy + wob2;

      let hot = 0;
      if (P.on && !COARSE) {
        const dx = tx - P.x, dy = ty - P.y;
        const d2 = dx * dx + dy * dy;
        if (d2 < PULL * PULL) {
          const d = Math.sqrt(d2) || 1;
          const f = (1 - d / PULL) * PULLK;
          tx += (dx / d) * f * PULL * 0.6;
          ty += (dy / d) * f * PULL * 0.6;
          hot = 1 - d / PULL;
        }
      }
      n.hot = lerp(n.hot, hot, 0.12);
      n.x = lerp(n.x, tx, 0.075);
      n.y = lerp(n.y, ty, 0.075);
    }

    /* Links: distance falloff + heat from the pointer field.
       Perf: all-pairs is unavoidable for proximity, but the DRAW is batched.
       One beginPath()/stroke() per link cost ~2000 canvas state changes a
       frame; bucketing by alpha and stroking each bucket as a single path
       cuts that to a handful. Alpha is quantised into 6 buckets — visually
       indistinguishable, and the whole graph lands in ~6 draw calls. */
    ctx.lineCap = 'round';
    const HOT = 5;                                  // quantisation levels
    const buckets = [];
    for (let i = 0; i <= HOT; i++) buckets.push([]);
    const hotBuckets = [];
    for (let i = 0; i <= HOT; i++) hotBuckets.push([]);

    for (let i = 0; i < nodes.length; i++) {
      const a = nodes[i];
      for (let j = i + 1; j < nodes.length; j++) {
        const b = nodes[j];
        const dx = a.x - b.x, dy = a.y - b.y;
        const d2 = dx * dx + dy * dy;
        if (d2 > LINK * LINK) continue;
        const d = Math.sqrt(d2) || 1;
        const fall = 1 - d / LINK;
        const heat = (a.hot + b.hot) * 0.5;

        let al;
        if (heat > 0.02) al = Math.pow(fall, 1.25) * (0.34 + heat * 0.58);
        else              al = Math.pow(fall, 1.25) * 0.34;

        const lvl = Math.min(HOT, Math.max(0, Math.round(al * HOT)));
        const seg = (heat > 0.02 ? hotBuckets : buckets)[lvl];
        seg.push(a.x, a.y, b.x, b.y);
      }
    }

    const paint = (list, baseAlpha, tint) => {
      for (let lvl = 1; lvl <= HOT; lvl++) {
        const seg = list[lvl];
        if (!seg.length) continue;
        const al = (lvl / HOT) * baseAlpha;
        // Cool links: neutral grey. Hot links: lerp toward the accent.
        const r = lerp(158, ACC_RGB[0], tint), g = lerp(158, ACC_RGB[1], tint), b = lerp(170, ACC_RGB[2], tint);
        ctx.strokeStyle = `rgba(${r | 0},${g | 0},${b | 0},${al.toFixed(3)})`;
        ctx.lineWidth = 0.6;
        ctx.beginPath();
        for (let k = 0; k < seg.length; k += 4) {
          ctx.moveTo(seg[k], seg[k + 1]);
          ctx.lineTo(seg[k + 2], seg[k + 3]);
        }
        ctx.stroke();
      }
    };
    // neutral links first, warm links on top so the pointer field reads as hot
    paint(buckets, 1, 0);
    for (let lvl = 1; lvl <= HOT; lvl++) {
      const seg = hotBuckets[lvl];
      if (!seg.length) continue;
      const al = (lvl / HOT) * 0.92;
      ctx.strokeStyle = `rgba(${ACC_RGB[0]},${ACC_RGB[1]},${ACC_RGB[2]},${al.toFixed(3)})`;
      ctx.lineWidth = 1.0;
      ctx.beginPath();
      for (let k = 0; k < seg.length; k += 4) {
        ctx.moveTo(seg[k], seg[k + 1]);
        ctx.lineTo(seg[k + 2], seg[k + 3]);
      }
      ctx.stroke();
    }

    /* Nodes: soft cores, brighter where hot.
       Cool nodes are batched into one path per radius step; hot nodes keep
       their own call because each carries a radial-gradient glow. */
    const coolSteps = [[], [], []];   // three size buckets
    for (const n of nodes) {
      const breathe = REDUCED ? 1 : 0.72 + 0.28 * Math.sin(t * 1.1 + n.ph);
      const rr = n.r * (0.9 + n.hot * 1.5) * (0.85 + breathe * 0.3);

      if (n.hot > 0.01) {
        const gr = rr * 5.5;
        const g = ctx.createRadialGradient(n.x, n.y, 0, n.x, n.y, gr);
        g.addColorStop(0, `rgba(${ACC_RGB[0]},${ACC_RGB[1]},${ACC_RGB[2]},${(0.18 * n.hot).toFixed(3)})`);
        g.addColorStop(1, `rgba(${ACC_RGB[0]},${ACC_RGB[1]},${ACC_RGB[2]},0)`);
        ctx.fillStyle = g;
        ctx.beginPath(); ctx.arc(n.x, n.y, gr, 0, 6.2832); ctx.fill();

        ctx.fillStyle = `rgba(${ACC_RGB[0]},${ACC_RGB[1]},${ACC_RGB[2]},${(0.6 + n.hot * 0.4).toFixed(3)})`;
        ctx.beginPath(); ctx.arc(n.x, n.y, rr, 0, 6.2832); ctx.fill();
        continue;
      }

      // The bucket already encodes the brightness, so only the geometry
      // is stored: (x, y, r) per node.
      const alpha = 0.36 + breathe * 0.26;
      const step = alpha > 0.52 ? 0 : alpha > 0.44 ? 1 : 2;
      coolSteps[step].push(n.x, n.y, rr);
    }
    for (let s = 0; s < 3; s++) {
      const seg = coolSteps[s];
      if (!seg.length) continue;
      // One path per bucket. A single fill cannot vary alpha per sub-path,
      // so each bucket takes its own representative alpha — three fills total.
      const rep = s === 0 ? 0.58 : s === 1 ? 0.5 : 0.4;
      ctx.fillStyle = `rgba(204,206,214,${rep})`;
      ctx.beginPath();
      for (let k = 0; k < seg.length; k += 3) {
        const r = seg[k + 2];
        // Guard: arc() throws on a negative radius. Positions are lerped
        // toward the pointer field, so a defensive clamp is cheap insurance.
        if (!(r > 0)) continue;
        ctx.moveTo(seg[k] + r, seg[k + 1]);
        ctx.arc(seg[k], seg[k + 1], r, 0, 6.2832);
      }
      ctx.fill();
    }
  }

  let rz;
  addEventListener('resize', () => { clearTimeout(rz); rz = setTimeout(resize, 160); }, { passive: true });
  resize();
  Ticker.add(frame);
})();

/* ═══════════ 10 · Closing state ════════════════════════════
   The old footer resolved the lattice as a free-floating field: nodes
   drifted toward three anchors and kept drifting, with nothing for the
   viewer to do. That read as "neurons moving around", and the band it
   occupied was the dead space under the colophon.

   This is the same visual language in its terminal form. On arrival the
   three clusters assemble once and then STOP — the graph has finished, so
   there is nothing left to explore. The only live behaviour is a proximity
   response to the pointer: nodes near the cursor brighten, which reads as
   the system acknowledging you have arrived rather than asking you to play.

   Deliberately unlike the hero: no orbiting, no rewiring, no field to steer,
   and it costs one draw pass per frame instead of an all-pairs search. */
(() => {
  const wrap = $('[data-closing]');
  const cv   = $('[data-closing-canvas]');
  if (!wrap || !cv) return;
  const ctx = cv.getContext('2d', { alpha: true });
  if (!ctx) return;

  let W = 0, H = 0, nodes = [], raf = 0, io, assemble = 0;
  let visible = false, ptr = { x: -9999, y: -9999, on: false };

  const ASSEMBLE_MS = 1100;   // one-time arrival

  function resize() {
    const r = wrap.getBoundingClientRect();
    if (r.width < 1 || r.height < 1) return;
    const dpr = Math.min(devicePixelRatio || 1, 2);
    W = r.width; H = r.height;
    cv.width = Math.round(W * dpr); cv.height = Math.round(H * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

    /* Three clusters aligned to the three port rows, each one already in
       its final place. Node count is small on purpose — this is a mark,
       not a field. */
    const perCluster = clamp(Math.round(W / 90), 5, 11);
    const centres = [0.2, 0.5, 0.8].map(f => W * f);
    nodes = [];
    centres.forEach((cx, ci) => {
      for (let i = 0; i < perCluster; i++) {
        // deterministic, tightly grouped: a settled cluster, not a scatter
        const a = (i / perCluster) * Math.PI * 2 + ci * 0.6;
        const rad = (i === 0) ? 0 : (0.34 + (i % 3) * 0.16) * Math.min(W, H) * 0.5;
        const tx = cx + Math.cos(a) * rad;
        const ty = H / 2 + Math.sin(a) * rad * 0.52;
        nodes.push({
          x: W * 0.5 + (Math.random() - 0.5) * W,   // converges on arrival
          y: H * (0.3 + Math.random() * 0.4),
          tx, ty, hot: 0, isCore: i === 0
        });
      }
    });
    assemble = 0;
  }

  function draw(now) {
    if (assemble < 1) assemble = clamp((now - t0) / ASSEMBLE_MS, 0, 1);
    // easeOutCubic: the clusters arrive quickly then settle without bounce
    const e = 1 - Math.pow(1 - assemble, 3);

    ctx.clearRect(0, 0, W, H);

    for (const n of nodes) {
      n.x = lerp(n.x, n.tx, 0.055 + e * 0.06);
      n.y = lerp(n.y, n.ty, 0.055 + e * 0.06);

      // proximity only: a local lift, no attraction or repulsion
      if (ptr.on) {
        const dx = n.x - ptr.x, dy = n.y - ptr.y;
        const d2 = dx * dx + dy * dy;
        if (d2 < 130 * 130) n.hot = 1 - Math.sqrt(d2) / 130;
      } else {
        n.hot *= 0.9;
      }
      n.hot = clamp(n.hot, 0, 1);
    }

    // A single hairline rule tying the three clusters together: the thread
    // that ran through the whole site, closed.
    ctx.strokeStyle = `rgba(${ACC_RGB[0]},${ACC_RGB[1]},${ACC_RGB[2]},${(0.16 * e).toFixed(3)})`;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(W * 0.2, H / 2); ctx.lineTo(W * 0.8, H / 2);
    ctx.stroke();

    // Edges within each cluster only — the graph is closed, not drifting.
    const reach = 62;
    for (let i = 0; i < nodes.length; i++) {
      const a = nodes[i];
      for (let j = i + 1; j < nodes.length; j++) {
        const b = nodes[j];
        if (Math.abs(a.x - b.x) > W * 0.22) continue;   // not the same cluster
        const dx = a.x - b.x, dy = a.y - b.y;
        const d2 = dx * dx + dy * dy;
        if (d2 > reach * reach) continue;
        const f = 1 - Math.sqrt(d2) / reach;
        const heat = Math.max(a.hot, b.hot);
        ctx.strokeStyle = heat > 0.02
          ? `rgba(${ACC_RGB[0]},${ACC_RGB[1]},${ACC_RGB[2]},${(f * (0.22 + heat * 0.5) * e).toFixed(3)})`
          : `rgba(158,160,170,${(f * f * 0.22 * e).toFixed(3)})`;
        ctx.lineWidth = 0.6 + heat * 0.5;
        ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); ctx.stroke();
      }
    }

    for (const n of nodes) {
      const r = (n.isCore ? 2.1 : 1.2) * (1 + n.hot * 0.5);
      if (n.hot > 0.02) {
        ctx.fillStyle = `rgba(${ACC_RGB[0]},${ACC_RGB[1]},${ACC_RGB[2]},${(0.55 + n.hot * 0.45).toFixed(3)})`;
      } else {
        ctx.fillStyle = n.isCore
          ? `rgba(${ACC_RGB[0]},${ACC_RGB[1]},${ACC_RGB[2]},${(0.6 * e).toFixed(3)})`
          : `rgba(180,182,190,${(0.34 * e).toFixed(3)})`;
      }
      ctx.beginPath(); ctx.arc(n.x, n.y, r, 0, 6.2832); ctx.fill();
    }

    raf = requestAnimationFrame(draw);
  }

  let t0 = 0;
  const start = () => {
    if (raf) cancelAnimationFrame(raf);
    resize();
    if (!nodes.length) return;
    t0 = performance.now();
    raf = requestAnimationFrame(draw);
  };

  /* Pointer, only while the closing state is on screen. */
  const onMove = (e) => { ptr.x = e.clientX; ptr.y = e.clientY; ptr.on = true; };
  addEventListener('pointermove', onMove, { passive: true });
  addEventListener('pointerleave', () => { ptr.on = false; }, { passive: true });

  // Stop entirely once scrolled away — nothing here needs to keep running.
  new IntersectionObserver((es) => {
    visible = es.some(e => e.isIntersecting);
    if (!visible && raf) { cancelAnimationFrame(raf); raf = 0; }
    else if (visible && !raf && wrap.classList.contains('is-in')) { t0 = performance.now(); raf = requestAnimationFrame(draw); }
  }, { threshold: 0 }).observe(wrap);

  addEventListener('resize', () => { if (wrap.classList.contains('is-in')) start(); }, { passive: true });
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) { if (raf) { cancelAnimationFrame(raf); raf = 0; } }
    else if (visible && wrap.classList.contains('is-in') && !raf) { t0 = performance.now(); raf = requestAnimationFrame(draw); }
  });

  if (REDUCED) {
    // Static final state: assemble instantly, draw once, no loop.
    wrap.classList.add('is-in');
    resize();
    if (nodes.length) {
      nodes.forEach(n => { n.x = n.tx; n.y = n.ty; n.hot = 0; });
      assemble = 1; t0 = performance.now() - ASSEMBLE_MS;
      draw(performance.now());
      if (raf) { cancelAnimationFrame(raf); raf = 0; }
    }
  } else {
    io = new IntersectionObserver((es) => {
      if (es.some(e => e.isIntersecting)) { wrap.classList.add('is-in'); start(); io.disconnect(); }
    }, { threshold: 0.15 });
    io.observe(wrap);
  }
})();

/* ═══════════ 11 · Small finishes ══════════════════════════ */
(() => {
  const y = $('[data-year]');
  if (y) y.textContent = new Date().getFullYear();

  // Hero hint only when a pointer is actually in play.
  const hint = $('.hero__hint');
  if (hint && FINE) setTimeout(() => hint.classList.add('is-in'), 900);

  /* Smooth in-page navigation.
     The native `scroll-behavior: smooth` on <html> was doing the scrolling
     before and it lurched: the browser committed several hundred pixels in
     a single frame before easing in, which reads as a jump followed by a
     slide. An explicit rAF tween with a long-tailed ease gives full control
     of the curve, so movement starts near zero velocity and settles gently.

     Native behaviour is kept for browsers without scrollTo options and for
     reduced-motion, where the destination is simply jumped to. */
  const scrollEase = (t) => (t < .5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2); // easeInOutCubic
  let scrollRaf = 0;

  function smoothScrollTo(top) {
    const maxTop = Math.max(0, document.documentElement.scrollHeight - innerHeight);
    const dest = clamp(top, 0, maxTop);
    const from = scrollY;
    const delta = dest - from;

    /* `behavior: 'instant'` is required, not cosmetic. The stylesheet keeps
       `scroll-behavior: smooth` as a no-JS fallback, and a bare scrollTo()
       would inherit it — so every tween frame would kick off its own smooth
       animation and the two curves would fight each other. */
    if (Math.abs(delta) < 2 || REDUCED) {
      scrollTo({ top: dest, behavior: 'instant' });
      return;
    }

    cancelAnimationFrame(scrollRaf);
    // Duration scales with distance but stays inside a deliberate band, so a
    // short hop stays snappy and a full-page jump is still readable.
    const duration = clamp(340 + Math.abs(delta) * 0.16, 380, 900);
    const start = performance.now();

    const step = (now) => {
      const t = clamp((now - start) / duration, 0, 1);
      scrollTo({ top: from + delta * scrollEase(t), behavior: 'instant' });
      if (t < 1) scrollRaf = requestAnimationFrame(step);
    };
    scrollRaf = requestAnimationFrame(step);
  }

  document.addEventListener('click', (e) => {
    const a = e.target.closest?.('a[href^="#"]');
    if (!a) return;
    const id = a.getAttribute('href');
    if (!id || id === '#') return;
    const el = document.getElementById(id.slice(1));
    if (!el) return;
    e.preventDefault();

    // Fixed chrome: the depth rail on desktop. The mobile index is a sheet
    // that closes itself, so it needs no offset.
    const railW = parseInt(CSS.getPropertyValue('--rail-w')) || 0;
    const off = innerWidth >= 1040 ? railW : 0;
    smoothScrollTo(el.getBoundingClientRect().top + scrollY - off + 1);

    history.replaceState(null, '', id);
    // Move focus for keyboard users without a second scroll jump.
    el.setAttribute('tabindex', '-1');
    el.focus({ preventScroll: true });
  });

  // Any manual scroll input cancels the in-flight tween immediately.
  ['wheel', 'touchstart', 'keydown'].forEach(ev =>
    addEventListener(ev, () => cancelAnimationFrame(scrollRaf), { passive: true })
  );

  // If the browser restored a scroll position, re-run the rail immediately.
  if ('scrollRestoration' in history) history.scrollRestoration = 'manual';
  Rail.update();
  addEventListener('load', Rail.update, { once: true });
})();

})();
