// Snapshot the website as an editable layer tree for Figma.
//   node tools/figma/extract.mjs                 -> out/figma/desktop.json, out/figma/phone.json, out/figma/assets/
//   node tools/figma/extract.mjs --url=https://abkgpta.github.io/portfolio27/   (default: serves this repo)
// Every visible element becomes a frame, a text layer or an image layer at its real size. Containers
// whose children line up (flex rows and columns, stacked blocks) become auto layout frames, but only
// when the browser positions can be reproduced exactly; anything else stays absolutely placed.
// Canvases, iframes, videos and SVGs are captured as images. Then run tools/figma/build-calls.mjs.
import { createServer } from 'node:http';
import { readFile, mkdir, writeFile, rm } from 'node:fs/promises';
import { extname, join, normalize } from 'node:path';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const { chromium } = require('playwright');

const root = new URL('../..', import.meta.url).pathname;
const outDir = join(root, 'out', 'figma');
const args = process.argv.slice(2);
const flag = n => { const a = args.find(x => x.startsWith('--' + n)); return a ? (a.split('=')[1] ?? true) : undefined; };

const types = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.css': 'text/css',
  '.json': 'application/json', '.jpg': 'image/jpeg', '.png': 'image/png', '.svg': 'image/svg+xml', '.glb': 'model/gltf-binary', '.webp': 'image/webp' };
let base = flag('url');
let server;
if (!base) {
  server = createServer(async (req, res) => {
    const p = normalize(decodeURIComponent(new URL(req.url, 'http://x').pathname)).replace(/^(\.\.[/\\])+/, '');
    try { const f = join(root, p.endsWith('/') ? p + 'index.html' : p);
      res.writeHead(200, { 'content-type': types[extname(f)] || 'application/octet-stream' }); res.end(await readFile(f));
    } catch { res.writeHead(404); res.end(); }
  }).listen(0);
  base = `http://localhost:${server.address().port}/`;
}

const VIEWPORTS = { desktop: { width: 1440, height: 900 }, phone: { width: 390, height: 844, hasTouch: true } };
await rm(outDir, { recursive: true, force: true });
await mkdir(join(outDir, 'assets'), { recursive: true });
const browser = await chromium.launch({ args: ['--disable-dev-shm-usage'] }); 

for (const [name, vp] of Object.entries(VIEWPORTS)) {
  const ctx = await browser.newContext({ viewport: { width: vp.width, height: vp.height }, isMobile: !!vp.isMobile,
    hasTouch: !!vp.hasTouch, deviceScaleFactor: +(flag('scale') || 2), colorScheme: 'light' });
  // Spotify embeds and the WebGL viewers are skipped: headless rendering of them is too slow. The site's
  // own fallbacks (still images) show instead, and iframes become placeholder images.
  await ctx.route(/open\.spotify\.com|scdn\.co|spotifycdn|npm\/three@/, r => r.abort());
  const page = await ctx.newPage(); page.on('crash', () => console.warn('page crashed'));
  await page.goto(base, { waitUntil: 'domcontentloaded' });
  await page.evaluate(() => document.querySelectorAll('img[loading="lazy"]').forEach(i => i.loading = 'eager'));
  // Scroll through once so lazy content (viewers, reveals) mounts, then settle every transition.
  const H = await page.evaluate(() => document.documentElement.scrollHeight);
  for (let y = 0; y < H; y += vp.height) { await page.evaluate(v => scrollTo(0, v), y); await page.waitForTimeout(120); }
  await page.waitForLoadState('networkidle').catch(() => {});
  await page.waitForTimeout(4000);
  // Freeze render loops (3D viewers, traces) so the page is still while it is measured.
  await page.evaluate(() => { window.requestAnimationFrame = () => 0; });
  await page.waitForTimeout(300);
  await page.addStyleTag({ content: '*,*::before,*::after{transition:none!important;animation:none!important}' });
  await page.evaluate(() => { document.querySelectorAll('.og-in').forEach(e => e.classList.add('seen')); document.documentElement.style.scrollBehavior = 'auto'; scrollTo({ top: 0, behavior: 'instant' }); dispatchEvent(new Event('scroll')); });
  await page.waitForTimeout(400);

  // Elements that can't be rebuilt as layers get a marker and are screenshotted below.
  // Text-only ::before/::after (list numbers, labels) become real spans so they come through as text layers.
  await page.evaluate(() => {
    const fmt = (n, style) => style === 'decimal-leading-zero' ? String(n).padStart(2, '0') : style === 'upper-roman' || style === 'lower-roman' ? String(n) : String(n);
    const copy = ['fontFamily', 'fontSize', 'fontWeight', 'fontStyle', 'lineHeight', 'letterSpacing', 'color', 'textTransform', 'minWidth', 'marginRight', 'marginLeft', 'display'];
    for (const el of document.body.querySelectorAll('*')) {
      for (const p of ['::before', '::after']) {
        const ps = getComputedStyle(el, p);
        const c = ps.content;
        if (!c || c === 'none' || c === 'normal' || ps.display === 'none' || ps.position === 'absolute' || ps.position === 'fixed') continue;
        const bg = ps.backgroundColor;
        if ((bg && bg !== 'rgba(0, 0, 0, 0)' && bg !== 'transparent') || ps.backgroundImage !== 'none') continue;
        let text = '';
        for (const m of c.matchAll(/"([^"]*)"|counter\(\s*[\w-]+\s*(?:,\s*([\w-]+))?\)/g)) {
          if (m[1] !== undefined) text += m[1];
          else { const sib = [...el.parentElement.children].filter(s => s.tagName === el.tagName); text += fmt(sib.indexOf(el) + 1, m[2]); }
        }
        if (!/\S/.test(text)) continue;
        const s = document.createElement('span');
        s.textContent = text;
        for (const k of copy) s.style[k] = ps[k];
        if (s.style.display === 'inline' || !s.style.display) s.style.display = 'inline-block';
        s.dataset.figPseudo = p;
        el.dataset.figPs = (el.dataset.figPs || '') + p;
        p === '::before' ? el.prepend(s) : el.append(s);
      }
    }
    const st = document.createElement('style');
    st.textContent = '[data-fig-ps*="::before"]::before{content:none!important}[data-fig-ps*="::after"]::after{content:none!important}';
    document.head.append(st);
  });
  const tree = await page.evaluate(walk);
  // For the shots: keep the sticky header out of the way, and shoot gradient backgrounds without their content.
  await page.addStyleTag({ content: 'header{visibility:hidden!important}[data-fig-bg] *{visibility:hidden!important}' });
  const assets = [];
  for (let id = 0; id < tree.rasterCount; id++) {
    const el = page.locator(`[data-fig-raster="${id}"]`).first();
    const file = `${name}-r${id}.png`;
    try {
      const r = await el.evaluate(e => { e.scrollIntoView({ block: 'center', behavior: 'instant' }); const b = e.getBoundingClientRect(); const x = Math.max(0, b.left), y = Math.max(0, b.top); return { x, y, width: Math.min(innerWidth, b.right) - x, height: Math.min(innerHeight, b.bottom) - y }; });
      await page.waitForTimeout(150);
      await page.screenshot({ path: join(outDir, 'assets', file), clip: r, animations: 'disabled' });
      assets[+id] = { file, type: 'image/png' };
    } catch (e) { console.warn('raster failed', id, e.message); }
  }
  // Fetch every <img>/background source once.
  const srcs = tree.srcs;
  for (const [i, src] of srcs.entries()) {
    const idx = tree.rasterCount + i;
    try {
      const r = await page.request.get(src);
      if (!r.ok()) throw new Error(r.status());
      let ct = (r.headers()['content-type'] || '').split(';')[0];
      const ext = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp', 'image/gif': 'gif' }[ct];
      if (!ext) throw new Error('unsupported ' + ct);
      const file = `${name}-i${i}.${ext}`;
      await writeFile(join(outDir, 'assets', file), await r.body());
      assets[idx] = { file, type: ct, src };
    } catch (e) { console.warn('image failed', src, e.message); }
  }
  delete tree.srcs;
  tree.assets = assets;
  tree.viewport = name;
  tree.source = base;
  await writeFile(join(outDir, `${name}.json`), JSON.stringify(tree));
  console.log(name, 'nodes', tree.count, 'assets', assets.filter(Boolean).length, 'auto layout frames', tree.alCount,
    'dropped pseudo elements', tree.pseudo.length);
  await ctx.close();
}
await browser.close();
server?.close();

// ---------------------------------------------------------------- runs in the page
function walk() {
  const R = v => Math.round(v * 2) / 2;
  const cv = document.createElement('canvas'); cv.width = cv.height = 1;
  const cx = cv.getContext('2d', { willReadFrequently: true });
  const colorCache = new Map();
  const col = c => {
    if (!c || c === 'transparent' || c === 'rgba(0, 0, 0, 0)') return null;
    if (colorCache.has(c)) return colorCache.get(c);
    cx.clearRect(0, 0, 1, 1); cx.fillStyle = '#000'; cx.fillStyle = c; cx.fillRect(0, 0, 1, 1);
    const d = cx.getImageData(0, 0, 1, 1).data;
    const v = d[3] === 0 ? null : [+(d[0] / 255).toFixed(3), +(d[1] / 255).toFixed(3), +(d[2] / 255).toFixed(3), +(d[3] / 255).toFixed(2)];
    colorCache.set(c, v); return v;
  };
  const srcs = [], srcIdx = new Map();
  const addSrc = s => { if (!srcIdx.has(s)) { srcIdx.set(s, srcs.length); srcs.push(s); } return srcIdx.get(s); };
  let rasterCount = 0, count = 0, alCount = 0;
  const imgNodes = [];
  const pseudo = [];
  const sy = scrollY, sx = scrollX;
  const box = r => ({ x: r.left + sx, y: r.top + sy, w: r.width, h: r.height });

  const visible = (el, cs) => cs.display !== 'none' && cs.visibility !== 'hidden' && +cs.opacity > 0.01;
  const RASTER = new Set(['CANVAS', 'IFRAME', 'VIDEO', 'svg', 'OBJECT', 'EMBED', 'PICTURE_X']);
  const INLINE_TAGS = new Set(['SPAN', 'A', 'EM', 'STRONG', 'B', 'I', 'SMALL', 'SUP', 'SUB', 'CODE', 'MARK', 'ABBR', 'TIME', 'U', 'S', 'KBD', 'Q', 'CITE', 'LABEL']);
  const hasVisuals = cs => !!col(cs.backgroundColor) || parseFloat(cs.borderTopWidth) + parseFloat(cs.borderRightWidth) +
    parseFloat(cs.borderBottomWidth) + parseFloat(cs.borderLeftWidth) > 0 && cs.borderStyle !== 'none' ||
    (cs.backgroundImage && cs.backgroundImage !== 'none');
  // An element is "text only" if everything under it is text or plain inline elements without their own boxes.
  const inlineOnly = el => {
    for (const n of el.childNodes) {
      if (n.nodeType === 3) continue;
      if (n.nodeType !== 1) continue;
      if (n.tagName === 'BR') continue;
      const cs = getComputedStyle(n);
      if (cs.display === 'none') continue;
      if (!INLINE_TAGS.has(n.tagName) || cs.display !== 'inline' || hasVisuals(cs) || !inlineOnly(n)) return false;
    }
    return true;
  };
  const hasText = el => /\S/.test(el.textContent);

  const fontOf = cs => {
    const fam = cs.fontFamily.split(',')[0].trim().replace(/^["']|["']$/g, '');
    return [fam, +cs.fontWeight || 400, cs.fontStyle === 'italic' ? 1 : 0];
  };
  const styleOf = cs => {
    const fs = parseFloat(cs.fontSize);
    const lh = cs.lineHeight === 'normal' ? R(fs * 1.25) : R(parseFloat(cs.lineHeight));
    const ls = cs.letterSpacing === 'normal' ? 0 : +parseFloat(cs.letterSpacing).toFixed(2);
    const deco = cs.textDecorationLine.includes('underline') ? 'U' : cs.textDecorationLine.includes('line-through') ? 'S' : '';
    return { f: fontOf(cs), fs, lh, ls, c: col(cs.color) || [0, 0, 0, 1], d: deco };
  };
  const tx = (s, t) => t === 'uppercase' ? s.toUpperCase() : t === 'lowercase' ? s.toLowerCase() :
    t === 'capitalize' ? s.replace(/\b\p{L}/gu, m => m.toUpperCase()) : s;

  // Build a text layer from a range of nodes, keeping per-run styles.
  function textLeaf(nodes, styleEl, rect, name) {
    const chars = [];  // [char, styleKey]
    const styles = [], keys = new Map();
    const keyOf = cs => { const s = styleOf(cs); const k = JSON.stringify(s); if (!keys.has(k)) { keys.set(k, styles.length); styles.push(s); } return keys.get(k); };
    const visit = n => {
      if (n.nodeType === 3) {
        const cs = getComputedStyle(n.parentElement);
        const pre = /pre/.test(cs.whiteSpace);
        let s = tx(n.data, cs.textTransform);
        if (!pre) s = s.replace(/\s+/g, ' ');
        const k = keyOf(cs);
        for (const ch of s) chars.push([ch, k]);
      } else if (n.nodeType === 1) {
        if (n.tagName === 'BR') { chars.push(['\n', chars.length ? chars[chars.length - 1][1] : keyOf(getComputedStyle(styleEl))]); return; }
        if (getComputedStyle(n).display === 'none') return;
        n.childNodes.forEach(visit);
      }
    };
    nodes.forEach(visit);
    // collapse whitespace across runs, trim
    const out = [];
    for (const c of chars) {
      if (c[0] === ' ' && (!out.length || out[out.length - 1][0] === ' ' || out[out.length - 1][0] === '\n')) continue;
      if (c[0] === '\n' && out.length && out[out.length - 1][0] === ' ') out.pop();
      out.push(c);
    }
    while (out.length && /\s/.test(out[out.length - 1][0])) out.pop();
    if (!out.length) return null;
    const text = out.map(c => c[0]).join('');
    const runs = [];
    for (let i = 0; i < out.length; i++) {
      const k = out[i][1];
      if (runs.length && runs[runs.length - 1][2] === k) runs[runs.length - 1][1] = i + 1; else runs.push([i, i + 1, k]);
    }
    const cs = getComputedStyle(styleEl);
    const main = keyOf(cs);
    const st = styles[main];
    const lines = Math.round(rect.h / (st.lh || 1));
    const node = { t: 'T', n: name || text.slice(0, 40), ...rect, s: text, st: styles, ru: runs.length > 1 || runs[0][2] !== main ? runs : undefined,
      m: main, ta: { left: 'L', start: 'L', center: 'C', right: 'R', end: 'R', justify: 'J' }[cs.textAlign] || 'L', one: lines <= 1 ? 1 : undefined };
    count++;
    return node;
  }

  function rangeRect(nodes) {
    const r = document.createRange();
    r.setStartBefore(nodes[0]); r.setEndAfter(nodes[nodes.length - 1]);
    const rects = [...r.getClientRects()].filter(q => q.width > 0 && q.height > 0);
    if (!rects.length) return null;
    const x1 = Math.min(...rects.map(q => q.left)), y1 = Math.min(...rects.map(q => q.top));
    const x2 = Math.max(...rects.map(q => q.right)), y2 = Math.max(...rects.map(q => q.bottom));
    return { x: x1 + sx, y: y1 + sy, w: x2 - x1, h: y2 - y1 };
  }

  const nameOf = el => el.id || (el.getAttribute('aria-label') || '').slice(0, 30) || (typeof el.className === 'string' && el.className.split(/\s+/)[0]) || el.tagName.toLowerCase();

  function raster(el, b) {
    const id = rasterCount++;
    el.setAttribute('data-fig-raster', id);
    count++;
    return { t: 'I', n: nameOf(el), ...b, img: id, fit: 'FILL' };
  }

  function frameProps(el, cs, b) {
    const f = { t: 'F', n: nameOf(el), ...b };
    const bg = col(cs.backgroundColor); if (bg) f.bg = bg;
    const bw = [cs.borderTopWidth, cs.borderRightWidth, cs.borderBottomWidth, cs.borderLeftWidth].map(parseFloat);
    const bs = [cs.borderTopStyle, cs.borderRightStyle, cs.borderBottomStyle, cs.borderLeftStyle];
    const bws = bw.map((w, i) => bs[i] === 'none' || bs[i] === 'hidden' ? 0 : w);
    if (bws.some(w => w > 0)) {
      const side = bws.findIndex(w => w > 0);
      const bc = col([cs.borderTopColor, cs.borderRightColor, cs.borderBottomColor, cs.borderLeftColor][side]);
      if (bc) f.bd = { c: bc, w: bws, dash: bs[side] === 'dashed' ? 1 : bs[side] === 'dotted' ? 2 : 0 };
    }
    const rr = [cs.borderTopLeftRadius, cs.borderTopRightRadius, cs.borderBottomRightRadius, cs.borderBottomLeftRadius]
      .map(v => Math.min(parseFloat(v) || 0, Math.min(b.w, b.h) / 2));
    if (rr.some(v => v > 0)) f.r = rr.map(R);
    if (cs.overflow !== 'visible' && cs.overflow !== 'visible visible') f.clip = 1;
    if (+cs.opacity < 1) f.op = +(+cs.opacity).toFixed(2);
    // background image: url() -> image fill, gradients -> raster of the bare background
    if (cs.backgroundImage && cs.backgroundImage !== 'none') {
      const m = cs.backgroundImage.match(/url\(["']?([^"')]+)["']?\)/);
      if (m) { f.bgimg = addSrc(new URL(m[1], location.href).href); f.bgfit = cs.backgroundSize === 'contain' ? 'FIT' : 'FILL'; }
      else if (/gradient/.test(cs.backgroundImage)) f.grad = cs.backgroundImage.slice(0, 200);
    }
    return f;
  }

  // Try to express the children as auto layout, and keep it only if it reproduces the browser positions.
  function tryAutoLayout(f, cs, kids) {
    const flow = kids.filter(k => !k.abs);
    if (flow.length < 2 && !/flex|grid/.test(cs.display)) return;
    if (!flow.length) return;
    let dirs = [];
    if (/flex/.test(cs.display)) {
      if (cs.flexWrap !== 'nowrap' && flow.length > 1) {
        // wrapped flex still works when it ended up on one line/column
      }
      if (cs.flexDirection === 'row') dirs = ['H']; else if (cs.flexDirection === 'column') dirs = ['V']; else return;
    } else if (/grid/.test(cs.display)) dirs = ['V', 'H'];
    else dirs = ['V'];
    const bw = [cs.borderTopWidth, cs.borderRightWidth, cs.borderBottomWidth, cs.borderLeftWidth].map(parseFloat);
    const pd = [cs.paddingTop, cs.paddingRight, cs.paddingBottom, cs.paddingLeft].map(parseFloat).map((p, i) => p + bw[i]);
    for (const d of dirs) {
      const P = d === 'H' ? ['x', 'w'] : ['y', 'h'], C = d === 'H' ? ['y', 'h'] : ['x', 'w'];
      const size = f[P[1]], csize = f[C[1]];
      let ok = true, gaps = [];
      for (let i = 1; i < flow.length; i++) {
        const g = flow[i][P[0]] - (flow[i - 1][P[0]] + flow[i - 1][P[1]]);
        if (g < -0.5) { ok = false; break; }
        gaps.push(g);
      }
      if (!ok) continue;
      const gap = gaps.length ? gaps[0] : 0;
      if (gaps.some(g => Math.abs(g - gap) > 1)) continue;
      const startOff = flow[0][P[0]];
      const endOff = size - (flow[flow.length - 1][P[0]] + flow[flow.length - 1][P[1]]);
      if (startOff < -0.5 || endOff < -0.5) continue;
      // counter axis
      const offs = flow.map(k => k[C[0]]), ends = flow.map(k => csize - k[C[0]] - k[C[1]]);
      const same = a => a.every(v => Math.abs(v - a[0]) <= 1);
      let ca, cpad;
      if (same(offs) && offs[0] >= -0.5) { ca = 'MIN'; cpad = [offs[0], Math.max(0, Math.min(...ends))]; }
      else if (same(ends) && ends[0] >= -0.5) { ca = 'MAX'; cpad = [Math.max(0, Math.min(...offs)), ends[0]]; }
      else if (same(flow.map((k, i) => offs[i] - ends[i]))) { const o = (offs[0] - ends[0]) / 2; ca = 'CENTER'; cpad = o >= 0 ? [o * 2, 0] : [0, -o * 2]; }
      else continue;
      const pStart = d === 'H' ? pd[3] : pd[0];
      f.al = { d, g: R(gap), pa: 'MIN', ca, p: d === 'H' ? [R(cpad[0]), R(Math.max(0, endOff)), R(cpad[1]), R(startOff)] : [R(startOff), R(cpad[1]), R(Math.max(0, endOff)), R(cpad[0])] };
      if (cs.justifyContent === 'space-between' && flow.length > 1 && Math.abs(startOff - pStart) <= 1) {
        f.al.pa = 'SB'; f.al.g = 0;
      }
      // children that stretch across the counter axis
      flow.forEach(k => { if (ca === 'MIN' && Math.abs(k[C[0]] + k[C[1]] - (csize - cpad[1])) <= 1 && (cpad[1] > 0 || Math.abs(k[C[1]] - csize) <= 1)) k.fill = 1; });
      alCount++;
      return;
    }
  }

  function build(el, parentBox) {
    const cs = getComputedStyle(el);
    if (!visible(el, cs) || cs.display === 'contents' && false) return null;
    const r = el.getBoundingClientRect();
    if (r.width < 0.5 || r.height < 0.5) {
      if (cs.display === 'contents') return null;
      // zero-size wrappers can still hold positioned children; skip for simplicity
      return null;
    }
    const b = box(r);
    const rel = { x: R(b.x - parentBox.x), y: R(b.y - parentBox.y), w: R(b.w), h: R(b.h) };
    for (const p of ['::before', '::after']) {
      const ps = getComputedStyle(el, p);
      if (ps.content && ps.content !== 'none' && ps.display !== 'none' && (col(ps.backgroundColor) || /\S/.test(ps.content.replace(/["']/g, '')) || ps.borderTopStyle !== 'none'))
        pseudo.push(nameOf(el) + p);
    }
    if (RASTER.has(el.tagName)) return withPos(raster(el, rel), cs);
    if (el.tagName === 'IMG') {
      const src = el.currentSrc || el.src;
      if (!src || !el.complete || !el.naturalWidth) return null;
      if (/\.svg(\?|$)/i.test(src) || src.startsWith('data:image/svg')) return withPos(raster(el, rel), cs);
      count++;
      const node = { t: 'I', n: (el.alt || nameOf(el)).slice(0, 40), ...rel, src: addSrc(src), fit: cs.objectFit === 'contain' ? 'FIT' : 'FILL' };
      const rr = parseFloat(cs.borderTopLeftRadius); if (rr) node.r = [rr, rr, rr, rr].map(R);
      if (+cs.opacity < 1) node.op = +(+cs.opacity).toFixed(2);
      return withPos(node, cs);
    }
    // text-only element with no box of its own -> text layer
    if (inlineOnly(el) && hasText(el) && !hasVisuals(cs) && el.children.length === [...el.children].filter(c => c.tagName === 'BR' || INLINE_TAGS.has(c.tagName)).length) {
      const rr = rangeRect([...el.childNodes]);
      if (!rr) return null;
      const t = textLeaf([...el.childNodes], el, { x: R(rr.x - parentBox.x), y: R(rr.y - parentBox.y), w: R(rr.w), h: R(rr.h) }, null);
      return t && withPos(t, cs);
    }
    // container
    const f = frameProps(el, cs, rel);
    count++;
    const kids = [];
    if (inlineOnly(el) && hasText(el)) {
      const rr = rangeRect([...el.childNodes]);
      const t = rr && textLeaf([...el.childNodes], el, { x: R(rr.x - b.x), y: R(rr.y - b.y), w: R(rr.w), h: R(rr.h) }, null);
      if (t) kids.push(t);
    } else {
      // group runs of loose text / inline nodes between block children
      let run = [];
      const flush = () => {
        if (run.some(n => n.nodeType === 3 ? /\S/.test(n.data) : hasText(n))) {
          const rr = rangeRect(run);
          const t = rr && textLeaf(run, el, { x: R(rr.x - b.x), y: R(rr.y - b.y), w: R(rr.w), h: R(rr.h) }, null);
          if (t) kids.push(t);
        }
        run = [];
      };
      for (const n of el.childNodes) {
        if (n.nodeType === 3) { run.push(n); continue; }
        if (n.nodeType !== 1) continue;
        const ccs = getComputedStyle(n);
        if (ccs.display === 'none' || n.tagName === 'SCRIPT' || n.tagName === 'STYLE' || n.tagName === 'TEMPLATE') continue;
        if (n.tagName === 'BR' || (INLINE_TAGS.has(n.tagName) && ccs.display === 'inline' && !hasVisuals(ccs) && inlineOnly(n))) { run.push(n); continue; }
        flush();
        const k = build(n, b);
        if (k) kids.push(k);
      }
      flush();
    }
    // flatten pure wrappers: no visuals, one child that covers it exactly
    if (kids.length === 1 && !f.bg && !f.bd && !f.bgimg && !f.grad && !f.clip && !f.op && !f.r && !kids[0].abs) {
      const k = kids[0];
      if (Math.abs(k.x) <= 0.5 && Math.abs(k.y) <= 0.5 && Math.abs(k.w - f.w) <= 0.5 && Math.abs(k.h - f.h) <= 0.5) {
        count--; k.x = f.x; k.y = f.y; if (cs.position === 'absolute' || cs.position === 'fixed') k.abs = 1;
        if (k.t === 'F' && k.n === k.n.toLowerCase() && f.n && !/^(div|span)$/.test(f.n)) k.n = f.n;
        return k;
      }
    }
    if (!kids.length && !f.bg && !f.bd && !f.bgimg && !f.grad) { count--; return null; }
    if (f.grad) { f.rbg = rasterCount++; el.setAttribute('data-fig-raster', f.rbg); el.setAttribute('data-fig-bg', ''); }
    if (kids.length) {
      f.c = kids;
      tryAutoLayout(f, cs, kids);
    }
    return withPos(f, cs);
  }
  function withPos(node, cs) {
    if (cs.position === 'absolute' || cs.position === 'fixed') node.abs = 1;
    return node;
  }

  const body = document.body;
  const bcs = getComputedStyle(body);
  const rootBox = { x: 0, y: 0, w: document.documentElement.clientWidth, h: document.documentElement.scrollHeight };
  const rootNode = { t: 'F', n: 'page', x: 0, y: 0, w: R(rootBox.w), h: R(rootBox.h),
    bg: col(bcs.backgroundColor) || col(getComputedStyle(document.documentElement).backgroundColor) || [1, 1, 1, 1], clip: 1, c: [] };
  for (const n of body.children) {
    if (/SCRIPT|STYLE|TEMPLATE|NOSCRIPT/.test(n.tagName)) continue;
    const k = build(n, rootBox);
    if (k) rootNode.c.push(k);
  }
  tryAutoLayout(rootNode, bcs, rootNode.c);
  return { root: rootNode, srcs, rasterCount, count, alCount, pseudo, title: document.title };
}
