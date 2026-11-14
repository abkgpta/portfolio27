// Runs inside Figma (use_figma). Builds one chunk of the layer tree made by build-calls.mjs.
// Globals provided by the chunk: D = { page, root, path, rootProps?, styles, nodes }.
const GEN = { 'system-ui': 'Inter', '-apple-system': 'Inter', 'sans-serif': 'Inter', serif: 'Inter', monospace: 'IBM Plex Mono', 'ui-monospace': 'IBM Plex Mono', BlinkMacSystemFont: 'Inter', Arial: 'Inter', Helvetica: 'Inter' };
const WN = { 100: ['Thin'], 200: ['ExtraLight', 'Extra Light'], 300: ['Light'], 400: ['Regular'], 500: ['Medium'], 600: ['SemiBold', 'Semi Bold'], 700: ['Bold'], 800: ['ExtraBold', 'Extra Bold'], 900: ['Black'] };
const avail = {};
for (const f of await figma.listAvailableFontsAsync()) (avail[f.fontName.family] ||= new Set()).add(f.fontName.style);
const fontCache = {};
function pickFont([fam, w, it]) {
  const k = fam + w + it; if (fontCache[k]) return fontCache[k];
  let family = avail[fam] ? fam : GEN[fam] || 'Inter';
  const styles = avail[family];
  const order = Object.keys(WN).map(Number).sort((a, b) => Math.abs(a - w) - Math.abs(b - w) || b - a);
  let style = null;
  for (const ww of order) {
    for (const n of WN[ww]) {
      const s = it ? (n === 'Regular' ? 'Italic' : n + ' Italic') : n;
      if (styles.has(s)) { style = s; break; }
      if (it && styles.has(n)) { style = n; break; }
    }
    if (style) break;
  }
  return (fontCache[k] = { family, style: style || [...styles][0] });
}
const hex = h => ({ r: parseInt(h.slice(1, 3), 16) / 255, g: parseInt(h.slice(3, 5), 16) / 255, b: parseInt(h.slice(5, 7), 16) / 255, a: h.length > 7 ? parseInt(h.slice(7, 9), 16) / 255 : 1 });
const solid = h => { const c = hex(h); return { type: 'SOLID', color: { r: c.r, g: c.g, b: c.b }, opacity: c.a }; };
const S = D.styles.map(s => ({ ...s, font: pickFont(s.f) }));
await Promise.all([...new Set(S.map(s => JSON.stringify(s.font)))].map(f => figma.loadFontAsync(JSON.parse(f))));

let page = figma.root.children.find(p => p.name === D.page);
if (!page) { page = figma.createPage(); page.name = D.page; }
await figma.setCurrentPageAsync(page);
const images = [];
let made = 0;

function applyText(t, n) {
  const st = S[n.m];
  t.fontName = st.font;
  t.characters = n.s;
  const setStyle = (s, a, b) => {
    const full = a === undefined;
    const set = (k, v) => full ? (t[k] = v) : t['setRange' + k[0].toUpperCase() + k.slice(1)](a, b, v);
    set('fontName', s.font); set('fontSize', s.fs);
    set('lineHeight', { unit: 'PIXELS', value: s.lh }); set('letterSpacing', { unit: 'PIXELS', value: s.ls || 0 });
    set('fills', [solid(s.c)]);
    set('textDecoration', s.d === 'U' ? 'UNDERLINE' : s.d === 'S' ? 'STRIKETHROUGH' : 'NONE');
  };
  setStyle(st);
  if (n.ru) for (const [a, b, k] of n.ru) if (k !== n.m) setStyle(S[k], a, b);
  t.textAlignHorizontal = { L: 'LEFT', C: 'CENTER', R: 'RIGHT', J: 'JUSTIFIED' }[n.ta || 'L'];
}

function create(n, parent) {
  let node;
  if (n.t === 'T') {
    node = figma.createText();
    parent.appendChild(node);
    applyText(node, n);
    if (n.one) {
      node.textAutoResize = 'WIDTH_AND_HEIGHT';
      const dw = n.w - node.width;
      if (parent.layoutMode === 'NONE' || n.abs) n.x += n.ta === 'C' ? dw / 2 : n.ta === 'R' ? dw : 0;
    } else {
      node.resize(Math.max(1, n.w + 2), Math.max(1, n.h));
      node.textAutoResize = 'HEIGHT';
      if (n.ta === 'C') n.x -= 1; else if (n.ta === 'R') n.x -= 2;
    }
  } else if (n.t === 'I') {
    node = figma.createRectangle();
    parent.appendChild(node);
    node.resize(Math.max(1, n.w), Math.max(1, n.h));
    node.fills = [{ type: 'SOLID', color: { r: 0.85, g: 0.85, b: 0.85 } }];
    if (n.r) [node.topLeftRadius, node.topRightRadius, node.bottomRightRadius, node.bottomLeftRadius] = n.r;
    images.push([node.id, n.a, n.fit || 'FILL']);
  } else {
    node = figma.createFrame();
    parent.appendChild(node);
    applyFrame(node, n);
  }
  node.name = n.n || node.name;
  if (n.op !== undefined) node.opacity = n.op;
  if (parent.layoutMode && parent.layoutMode !== 'NONE') {
    if (n.abs) { node.layoutPositioning = 'ABSOLUTE'; node.x = n.x; node.y = n.y; }
    else if (n.fill) { if (parent.layoutMode === 'VERTICAL') node.layoutSizingHorizontal = 'FILL'; else node.layoutSizingVertical = 'FILL'; }
  } else { node.x = n.x; node.y = n.y; }
  made++;
  if (n.c) for (const k of n.c) create(k, node);
  return node;
}

function applyFrame(f, n) {
  f.resize(Math.max(1, n.w), Math.max(1, n.h));
  const fills = [];
  if (n.bg) fills.push(solid(n.bg));
  f.fills = fills;
  if (n.bd) {
    f.strokes = [solid(n.bd.c)];
    f.strokeAlign = 'INSIDE';
    const [t, r, b, l] = n.bd.w;
    if (t === r && r === b && b === l) f.strokeWeight = t;
    else { f.strokeTopWeight = t; f.strokeRightWeight = r; f.strokeBottomWeight = b; f.strokeLeftWeight = l; }
    if (n.bd.dash) f.dashPattern = n.bd.dash === 1 ? [6, 4] : [1, 3];
  }
  if (n.r) [f.topLeftRadius, f.topRightRadius, f.bottomRightRadius, f.bottomLeftRadius] = n.r;
  f.clipsContent = !!n.clip;
  if (n.bgi !== undefined) images.push([f.id, n.bgi, n.bgfit || 'FILL', 1]);
  if (n.al) {
    const a = n.al;
    f.layoutMode = a.d === 'H' ? 'HORIZONTAL' : 'VERTICAL';
    f.primaryAxisSizingMode = 'FIXED'; f.counterAxisSizingMode = 'FIXED';
    f.itemSpacing = a.g;
    [f.paddingTop, f.paddingRight, f.paddingBottom, f.paddingLeft] = a.p;
    f.primaryAxisAlignItems = a.pa === 'SB' ? 'SPACE_BETWEEN' : 'MIN';
    f.counterAxisAlignItems = a.ca;
    f.resize(Math.max(1, n.w), Math.max(1, n.h));
  }
}

let parent;
if (D.rootProps) {
  const others = page.children.filter(c => c.name !== D.root);
  const x = others.reduce((m, c) => Math.max(m, c.x + c.width), -200) + 200;
  const old = page.children.find(c => c.name === D.root); if (old) old.remove();
  const r = figma.createFrame();
  page.appendChild(r);
  applyFrame(r, D.rootProps);
  r.name = D.root; r.x = x; r.y = 0;
  parent = r;
} else {
  parent = page.children.find(c => c.name === D.root);
  for (const i of D.path) parent = parent.children[i];
}
for (const n of D.nodes) create(n, parent);
return { parent: parent.id, made, images };
