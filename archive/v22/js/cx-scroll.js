/* CortX scroll sequence: pre-rendered Blender frames scrubbed by scroll (no library).
   Markup: .cx-sc[data-frames][data-src][data-sub] > .cx-sc-pin > (.cx-sc-logo, canvas, .cx-sc-cap, .cx-sc-bar)
   data-src holds {w} (frame width set) and {n} (4-digit frame number).
   data-sub: frames rendered per original animation frame (4 = the 4x set). Caption ranges stay in
   original frame numbers. Playback eases toward the scroll position and blends the two nearest frames,
   so a fast flick glides instead of jumping. */
(() => {
  const root = document.querySelector('.cx-sc');
  if (!root) return;
  const N = +root.dataset.frames, STEP = +(root.dataset.step || 1), SUB = +(root.dataset.sub || 1);
  const NB = 1 + (N - 1) / SUB;                       // length in original frames
  const W = (innerWidth * Math.min(devicePixelRatio || 1, 2)) > 1400 ? 1920 : 960;
  const SRC = i => root.dataset.src.replace('{w}', W).replace('{n}', String(i).padStart(4, '0'));
  const cv = root.querySelector('canvas'), cx = cv.getContext('2d');
  const logo = root.querySelector('.cx-sc-logo'), bar = root.querySelector('.cx-sc-bar i');
  const capN = root.querySelector('.cx-sc-cap .n'), capH = root.querySelector('.cx-sc-cap h3'), capP = root.querySelector('.cx-sc-cap p');
  const caps = JSON.parse(root.querySelector('script[type="application/json"]').textContent);
  const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const imgs = new Array(N + 1);
  let lastCap = -2, started = false, shown = -1, target = 1, pos = 1, raf = 0, lastT = 0;

  const ok = j => j >= 1 && j <= N && imgs[j] && imgs[j].complete && imgs[j].naturalWidth;
  function below(i) { for (let j = i; j >= 1; j--) if (ok(j)) return j; return 0; }
  function above(i) { for (let j = i; j <= N; j++) if (ok(j)) return j; return 0; }
  function place(im, a) {
    const Wc = cv.width, Hc = cv.height;
    const s = Wc < Hc ? Wc / im.naturalWidth * 1.7 : Math.max(Wc / im.naturalWidth, Hc / im.naturalHeight);
    const w = im.naturalWidth * s, h = im.naturalHeight * s;
    cx.globalAlpha = a; cx.drawImage(im, (Wc - w) / 2, (Hc - h) / 2, w, h);
  }
  // draw position p (fractional frame): the loaded frame at or below it, blended with the next loaded one
  function draw(p, force) {
    let a = below(Math.floor(p)), b = above(Math.ceil(p));
    if (!a && !b) return;
    if (!a) a = b; if (!b) b = a;
    // blend only between close neighbours; while frames are still loading the two nearest can be
    // far apart, and blending those shows a ghosted double image, so snap to the nearer one instead
    if (b - a > Math.max(2, SUB)) { if (p - a <= b - p) b = a; else a = b; }
    const t = b > a ? Math.min(1, Math.max(0, (p - a) / (b - a))) : 0;
    const key = a * 1e4 + b + Math.round(t * 32) / 64;
    if (key === shown && !force) return; shown = key;
    cx.globalAlpha = 1; cx.clearRect(0, 0, cv.width, cv.height);
    place(imgs[a], 1);
    if (b !== a && t > 0.02) place(imgs[b], t);
    cx.globalAlpha = 1;
  }
  function size() { const d = Math.min(devicePixelRatio || 1, 2); cv.width = cv.clientWidth * d; cv.height = cv.clientHeight * d; draw(pos, true); }
  function progress() { const r = root.getBoundingClientRect(); return Math.min(1, Math.max(0, -r.top / (r.height - innerHeight))); }
  function ui(p) {
    const fb = 1 + (p - 1) / SUB;                     // original frame number, for captions and the logo
    bar.style.width = ((p - 1) / (N - 1) * 100).toFixed(2) + '%';
    const lt = Math.min(1, Math.max(0, (fb - (NB - 48)) / 40)), le = 1 - Math.pow(1 - lt, 3);
    logo.style.opacity = le.toFixed(3); logo.style.transform = `translate(-50%,-50%) scale(${(0.92 + 0.08 * le).toFixed(3)})`;
    const f = Math.round(fb), ci = caps.findIndex(c => f >= c[0] && f <= c[1]);
    if (ci !== lastCap) {
      lastCap = ci; const c = caps[ci];
      if (c) { capN.textContent = c[2]; capH.textContent = c[3]; capP.textContent = c[4]; root.classList.add('has-cap'); }
      else root.classList.remove('has-cap');
    }
  }
  function loop(now) {
    const dt = Math.min(64, now - (lastT || now)); lastT = now;
    const k = reduce ? 1 : 1 - Math.exp(-dt / 90);     // ~90 ms time constant: smooth, never laggy
    pos += (target - pos) * k;
    if (Math.abs(target - pos) < 0.01) pos = target;
    draw(pos); ui(pos);
    raf = pos === target ? 0 : requestAnimationFrame(loop);
  }
  function kick() { target = 1 + progress() * (N - 1); if (!raf) { lastT = 0; raf = requestAnimationFrame(loop); } }
  // coarse-to-fine loading so the whole move scrubs early, then the gaps fill in
  const order = [], seen = new Set();
  for (const s of [12 * SUB, 4 * SUB, SUB, 1].map(x => Math.max(x, STEP))) for (let i = 1; i <= N; i += s) if (!seen.has(i)) { seen.add(i); order.push(i); }
  let ix = 0;
  function next() {
    if (ix >= order.length) return; const i = order[ix++], im = new Image(); im.decoding = 'async';
    im.onload = im.onerror = () => { if (i === 1) size(); draw(pos, true); next(); };
    im.src = SRC(i); imgs[i] = im;
  }
  function start() { if (started) return; started = true; for (let k = 0; k < 6; k++) next(); }
  new IntersectionObserver(es => { if (es.some(e => e.isIntersecting)) start(); }, { rootMargin: '150% 0px' }).observe(root);
  addEventListener('scroll', kick, { passive: true });
  addEventListener('resize', size);
  target = pos = 1 + progress() * (N - 1);
  size(); ui(pos);
})();
