/* CortX scroll sequence: pre-rendered Blender frames scrubbed by scroll (no library).
   Markup: .cx-sc[data-frames][data-src][data-sub] > .cx-sc-pin > (.cx-sc-logo, canvas, .cx-sc-cap, .cx-sc-bar)
   data-src holds {w} (frame width set) and {n} (4-digit frame number).
   data-sub: frames rendered per original animation frame (4 = the 4x set). Caption ranges stay in
   original frame numbers. Playback eases toward the scroll position and blends the two nearest frames,
   so a fast flick glides instead of jumping.
   Optional second frame set (the athlete on the pitch): data-src-b, data-from-b (index of its first frame),
   data-step-b (indices per frame). Indices after data-join (the last frame of the first set) and before
   data-from-b don't exist; the two sets crossfade across that gap. These frames are opaque, so on a tall
   screen their top and bottom edges fade into the section colour. */
(() => {
  const root = document.querySelector('.cx-sc');
  if (!root) return;
  const N = +root.dataset.frames, STEP = +(root.dataset.step || 1), SUB = +(root.dataset.sub || 1);
  const NB = 1 + (N - 1) / SUB;                       // length in original frames
  const W = (innerWidth * Math.min(devicePixelRatio || 1, 2)) > 1400 ? 1920 : 960;
  const JOIN = +(root.dataset.join || N), FB = +(root.dataset.fromB || 0), SB = +(root.dataset.stepB || 1);
  const isB = i => FB && i >= FB;
  const exists = i => i >= 1 && i <= N && (i <= JOIN || (isB(i) && (i - FB) % SB === 0));
  const SRC = i => isB(i)
    ? root.dataset.srcB.replace('{w}', W).replace('{n}', String((i - FB) / SB + 1).padStart(4, '0'))
    : root.dataset.src.replace('{w}', W).replace('{n}', String(i).padStart(4, '0'));
  const cv = root.querySelector('canvas'), cx = cv.getContext('2d');
  const logo = root.querySelector('.cx-sc-logo'), bar = root.querySelector('.cx-sc-bar i');
  const capN = root.querySelector('.cx-sc-cap .n'), capH = root.querySelector('.cx-sc-cap h3'), capP = root.querySelector('.cx-sc-cap p');
  const caps = JSON.parse(root.querySelector('script[type="application/json"]').textContent);
  const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const imgs = new Array(N + 1);
  let lastCap = -2, started = false, shown = -1, target = 1, pos = 1, raf = 0, lastT = 0;

  const ok = j => exists(j) && imgs[j] && imgs[j].complete && imgs[j].naturalWidth;
  const VOID = getComputedStyle(root).getPropertyValue('--void').trim() || '#0D031E';
  function below(i) { for (let j = i; j >= 1; j--) if (ok(j)) return j; return 0; }
  function above(i) { for (let j = i; j <= N; j++) if (ok(j)) return j; return 0; }
  function place(im, a, opaque) {
    const Wc = cv.width, Hc = cv.height;
    const s = Wc < Hc ? Wc / im.naturalWidth * 1.7 : Math.max(Wc / im.naturalWidth, Hc / im.naturalHeight);
    const w = im.naturalWidth * s, h = im.naturalHeight * s, y = (Hc - h) / 2;
    cx.globalAlpha = a; cx.drawImage(im, (Wc - w) / 2, y, w, h);
    if (opaque && h < Hc - 1) {      // letterboxed pitch frame: soften its top and bottom edges into the section
      const e = h * 0.14;
      for (const [y0, y1] of [[y, y + e], [y + h, y + h - e]]) {
        const g = cx.createLinearGradient(0, y0, 0, y1); g.addColorStop(0, VOID); g.addColorStop(1, 'rgba(13,3,30,0)');
        cx.fillStyle = g; cx.fillRect(0, Math.min(y0, y1) - 1, Wc, e + 2);
      }
    }
  }
  // draw position p (fractional frame): the loaded frame at or below it, blended with the next loaded one
  function draw(p, force) {
    let a = below(Math.floor(p)), b = above(Math.ceil(p));
    if (!a && !b) return;
    if (!a) a = b; if (!b) b = a;
    // blend only between close neighbours; while frames are still loading the two nearest can be
    // far apart, and blending those shows a ghosted double image, so snap to the nearer one instead
    const gap = a === JOIN && b === FB ? FB - JOIN : Math.max(2, SUB, SB);
    if (b - a > gap) { if (p - a <= b - p) b = a; else a = b; }
    let t = b > a ? Math.min(1, Math.max(0, (p - a) / (b - a))) : 0;
    // the athlete frames are whole render steps apart: a long blend shows two poses at once, so hold each
    // frame and only crossfade through the middle fifth of the step
    if (isB(a) && isB(b)) t = Math.min(1, Math.max(0, (t - 0.4) / 0.2));
    const key = a * 1e4 + b + Math.round(t * 32) / 64;
    if (key === shown && !force) return; shown = key;
    cx.globalAlpha = 1; cx.clearRect(0, 0, cv.width, cv.height);
    place(imgs[a], 1, isB(a));
    if (b !== a && t > 0.02) place(imgs[b], t, isB(b));
    cx.globalAlpha = 1;
  }
  function size() { const d = Math.min(devicePixelRatio || 1, 2); cv.width = cv.clientWidth * d; cv.height = cv.clientHeight * d; draw(pos, true); }
  function progress() { const r = root.getBoundingClientRect(); return Math.min(1, Math.max(0, -r.top / (r.height - innerHeight))); }
  function ui(p) {
    const fb = 1 + (p - 1) / SUB;                     // original frame number, for captions and the logo
    bar.style.width = ((p - 1) / (N - 1) * 100).toFixed(2) + '%';
    const lt = Math.min(1, Math.max(0, (fb - (NB - 48)) / 40)), le = 1 - Math.pow(1 - lt, 3);
    if (logo) logo.style.opacity = le.toFixed(3), logo.style.transform = `translate(-50%,-50%) scale(${(0.92 + 0.08 * le).toFixed(3)})`;
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
  const order = [], seen = new Set(), add = i => { if (exists(i) && !seen.has(i)) { seen.add(i); order.push(i); } };
  let coarse = 0;
  for (const s of [12 * SUB, 4 * SUB, SUB, 1].map(x => Math.max(x, STEP))) {
    for (let i = 1; i <= N; i += s) add(i);
    if (FB) for (let i = FB; i <= N; i += Math.max(s, SB)) add(i);
    if (!coarse) coarse = order.length;
  }
  let ix = 0;
  // the ABK loader covers the sequence until the coarse pass (every 12th frame) is in
  let got = 0, abk = null;
  function next() {
    if (ix >= order.length) return; const i = order[ix++], im = new Image(); im.decoding = 'async';
    im.onload = im.onerror = () => {
      if (i === 1) size(); draw(pos, true);
      if (abk && ++got <= coarse) { abk.progress(got / coarse); if (got === coarse) { abk.done(); abk = null; } }
      next();
    };
    im.src = SRC(i); imgs[i] = im;
  }
  function start() { if (started) return; started = true; if (window.ABKLoader) abk = ABKLoader.attach(root.querySelector('.cx-sc-pin') || root); for (let k = 0; k < 6; k++) next(); }
  new IntersectionObserver(es => { if (es.some(e => e.isIntersecting)) start(); }, { rootMargin: '150% 0px' }).observe(root);
  addEventListener('scroll', kick, { passive: true });
  addEventListener('resize', size);
  target = pos = 1 + progress() * (N - 1);
  size(); ui(pos);
})();
