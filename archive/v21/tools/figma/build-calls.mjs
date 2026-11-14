// Turn out/figma/<viewport>.json into use_figma scripts, each under Figma's 50k-character limit.
//   node tools/figma/build-calls.mjs v9   -> out/figma/calls/<viewport>-NN.js + out/figma/calls/plan.json
// Each script = runtime.js + one chunk of layers. Run them in order with use_figma; collect the returned
// `images` lists, then upload out/figma/assets/<file> to each node id with upload_assets.
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { join } from 'node:path';

const root = new URL('../..', import.meta.url).pathname;
const dir = join(root, 'out', 'figma');
const label = process.argv[2] || 'snapshot';
const date = new Date().toISOString().slice(0, 10);
const runtime = await readFile(new URL('runtime.js', import.meta.url), 'utf8');
const LIMIT = 49000 - runtime.length - 400;
// Both viewports go on one page; the root frame names ("Desktop · vN", "Phone · vN") keep them apart.
const PAGE = process.env.FIGMA_PAGE || 'website';
const PAGES = { desktop: PAGE, phone: PAGE };
const ROOT = { desktop: 'Desktop', phone: 'Phone' };
await mkdir(join(dir, 'calls'), { recursive: true });

const toHex = c => '#' + c.slice(0, 3).map(v => Math.round(v * 255).toString(16).padStart(2, '0')).join('') +
  (c[3] < 1 ? Math.round(c[3] * 255).toString(16).padStart(2, '0') : '');
const plan = { label, date, calls: [], assets: {} };

for (const vp of Object.keys(PAGES)) {
  let tree;
  try { tree = JSON.parse(await readFile(join(dir, `${vp}.json`), 'utf8')); } catch { continue; }
  const rc = tree.rasterCount;
  const styles = [], skey = new Map();
  const sid = s => { const o = { f: s.f, fs: s.fs, lh: s.lh, ls: s.ls || undefined, c: toHex(s.c), d: s.d || undefined };
    const k = JSON.stringify(o); if (!skey.has(k)) { skey.set(k, styles.length); styles.push(o); } return skey.get(k); };
  const conv = n => {
    const o = { t: n.t === 'F' ? undefined : n.t, n: n.n && n.n.slice(0, 40), x: n.x, y: n.y, w: n.w, h: n.h };
    if (n.abs) o.abs = 1; if (n.fill) o.fill = 1; if (n.op !== undefined) o.op = n.op; if (n.r) o.r = n.r;
    if (n.t === 'T') {
      const map = n.st.map(sid);
      Object.assign(o, { s: n.s, m: map[n.m], ta: n.ta === 'L' ? undefined : n.ta, one: n.one });
      if (n.ru) o.ru = n.ru.map(([a, b, k]) => [a, b, map[k]]);
      if (o.n === n.s.slice(0, 40)) o.n = undefined;
    } else if (n.t === 'I') {
      o.a = n.img !== undefined ? n.img : rc + n.src; if (n.fit !== 'FILL') o.fit = n.fit;
    } else {
      if (n.bg) o.bg = toHex(n.bg);
      if (n.bd) o.bd = { c: toHex(n.bd.c), w: n.bd.w, dash: n.bd.dash || undefined };
      if (n.clip) o.clip = 1;
      if (n.rbg !== undefined) o.bgi = n.rbg; else if (n.bgimg !== undefined) { o.bgi = rc + n.bgimg; if (n.bgfit !== 'FILL') o.bgfit = n.bgfit; }
      if (n.al) o.al = n.al;
      if (n.c) o.c = n.c.map(conv);
    }
    return o;
  };
  const rootC = conv(tree.root);
  const rootName = `${ROOT[vp]} · ${label} · ${date}`;
  plan.assets[vp] = tree.assets;

  // Greedy chunking: whole subtrees when they fit, otherwise the frame shell now and its children later.
  const chunks = [];
  let cur = null;
  const size = o => JSON.stringify(o).length;
  const open = path => { cur = { path, nodes: [] , len: 0 }; chunks.push(cur); };
  const counters = new Map();
  const place2 = (node, path) => {
    const key = path.join('/');
    const s = size(node);
    const fits = cur && cur.path.join('/') === key && cur.len + s <= LIMIT;
    if (s <= LIMIT) {
      if (!fits) open(path);
      cur.nodes.push(node); cur.len += s + 1; counters.set(key, (counters.get(key) || 0) + 1); return;
    }
    const { c, ...shell } = node;
    const ss = size(shell);
    if (!(cur && cur.path.join('/') === key && cur.len + ss <= LIMIT)) open(path);
    cur.nodes.push(shell); cur.len += ss + 1;
    const idx = counters.get(key) || 0; counters.set(key, idx + 1);
    for (const k of c || []) place2(k, [...path, idx]);
    cur = null;
  };
  const { c: topKids, ...rootProps } = rootC;
  open([]); cur.rootProps = rootProps; cur.len += size(rootProps);
  for (const k of topKids) place2(k, []);

  // Each chunk carries only the styles it uses.
  chunks.forEach((ch, i) => {
    const used = new Map();
    const remap = o => { if (o.m !== undefined) { for (const v of [o.m, ...(o.ru || []).map(r => r[2])]) if (!used.has(v)) used.set(v, used.size); }
      o.c?.forEach(remap); };
    const nodes = JSON.parse(JSON.stringify(ch.nodes)); nodes.forEach(remap);
    const apply = o => { if (o.m !== undefined) { o.m = used.get(o.m); if (o.ru) o.ru = o.ru.map(([a, b, k]) => [a, b, used.get(k)]); } o.c?.forEach(apply); };
    nodes.forEach(apply);
    const st = [...used.keys()].map(k => styles[k]);
    const D = { page: PAGES[vp], root: rootName, path: ch.path, rootProps: ch.rootProps, styles: st, nodes };
    const code = `const D=${JSON.stringify(D)};\n${runtime}`;
    const file = `${vp}-${String(i + 1).padStart(2, '0')}.js`;
    writeFile(join(dir, 'calls', file), code);
    plan.calls.push({ file, vp, chars: code.length, nodes: JSON.stringify(nodes).match(/"x":/g)?.length || 0 });
  });
}
await writeFile(join(dir, 'calls', 'plan.json'), JSON.stringify(plan, null, 1));
console.log(plan.calls.map(c => `${c.file} ${c.chars} chars ${c.nodes} nodes`).join('\n'));
