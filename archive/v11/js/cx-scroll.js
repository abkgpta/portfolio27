/* CortX scroll sequence: pre-rendered Blender frames scrubbed by scroll (no library).
   Markup: .cx-sc[data-frames][data-src] > .cx-sc-pin > (.cx-sc-logo, canvas, .cx-sc-cap, .cx-sc-bar)
   data-src holds {w} (frame width set) and {n} (4-digit frame number). */
(() => {
  const root = document.querySelector('.cx-sc');
  if (!root) return;
  const N = +root.dataset.frames, STEP = +(root.dataset.step || 1);   // STEP 2 = only odd frames shipped so far
  const W = (innerWidth * Math.min(devicePixelRatio || 1, 2)) > 1400 ? 1920 : 960;
  const SRC = i => root.dataset.src.replace('{w}', W).replace('{n}', String(i).padStart(4, '0'));
  const cv = root.querySelector('canvas'), cx = cv.getContext('2d');
  const logo = root.querySelector('.cx-sc-logo'), bar = root.querySelector('.cx-sc-bar i');
  const capN = root.querySelector('.cx-sc-cap .n'), capH = root.querySelector('.cx-sc-cap h3'), capP = root.querySelector('.cx-sc-cap p');
  const caps = JSON.parse(root.querySelector('script[type="application/json"]').textContent);
  const imgs = new Array(N + 1);
  let curImg = null, lastCap = -2, started = false;

  function nearest(i) {
    for (let k = 0; k < N; k++) for (const j of [i - k, i + k])
      if (j >= 1 && j <= N && imgs[j] && imgs[j].complete && imgs[j].naturalWidth) return imgs[j];
    return null;
  }
  function draw(i, force) {
    const im = nearest(i); if (!im || (im === curImg && !force)) return; curImg = im;
    const Wc = cv.width, Hc = cv.height;
    const portrait = Wc < Hc;
    const s = portrait ? Wc / im.naturalWidth * 1.7 : Math.max(Wc / im.naturalWidth, Hc / im.naturalHeight);
    const w = im.naturalWidth * s, h = im.naturalHeight * s;
    cx.clearRect(0, 0, Wc, Hc); cx.drawImage(im, (Wc - w) / 2, (Hc - h) / 2, w, h);
  }
  function size() { const d = Math.min(devicePixelRatio || 1, 2); cv.width = cv.clientWidth * d; cv.height = cv.clientHeight * d; draw(frame(), true); }
  function progress() { const r = root.getBoundingClientRect(); return Math.min(1, Math.max(0, -r.top / (r.height - innerHeight))); }
  function frame() { return 1 + Math.round(progress() * (N - 1)); }
  function tick() {
    const p = progress(), f = 1 + Math.round(p * (N - 1)); draw(f);
    bar.style.width = (p * 100).toFixed(2) + '%';
    const lt = Math.min(1, Math.max(0, (f - (N - 48)) / 40)), le = 1 - Math.pow(1 - lt, 3);
    logo.style.opacity = le.toFixed(3); logo.style.transform = `translate(-50%,-50%) scale(${(0.92 + 0.08 * le).toFixed(3)})`;
    const ci = caps.findIndex(c => f >= c[0] && f <= c[1]);
    if (ci !== lastCap) {
      lastCap = ci; const c = caps[ci];
      if (c) { capN.textContent = c[2]; capH.textContent = c[3]; capP.textContent = c[4]; root.classList.add('has-cap'); }
      else root.classList.remove('has-cap');
    }
  }
  // load every 12th frame first so the whole move scrubs early, then fill the gaps
  const order = []; const seen = new Set();
  for (const s of [12, 4, 1].map(x => Math.max(x, STEP))) for (let i = 1; i <= N; i += s) if (!seen.has(i)) { seen.add(i); order.push(i); }
  let ix = 0;
  function next() {
    if (ix >= order.length) return; const i = order[ix++], im = new Image(); im.decoding = 'async';
    im.onload = im.onerror = () => { if (i === 1) size(); tick(); next(); };
    im.src = SRC(i); imgs[i] = im;
  }
  function start() { if (started) return; started = true; for (let k = 0; k < 4; k++) next(); }
  new IntersectionObserver(es => { if (es.some(e => e.isIntersecting)) start(); }, { rootMargin: '150% 0px' }).observe(root);
  let q = false;
  addEventListener('scroll', () => { if (!q) { q = true; requestAnimationFrame(() => { q = false; tick(); }); } }, { passive: true });
  addEventListener('resize', size);
  size(); tick();
})();
