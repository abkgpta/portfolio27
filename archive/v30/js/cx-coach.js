/* CortX coach app: the pitch-side app and the analyst dashboard as one interactive
   mock-up. Three views (Squad, Player, Season) inside one tablet frame.
   Brain and body signals never show up as raw traces here. Each player gets one
   "mind" diagram (focus, composure, freshness, reaction) against this morning's
   baseline, and GPS only ever shows up as position on a pitch.
   All data is made up and seeded, so it looks the same on every load. */
(() => {
  const root = document.getElementById('cxApp');
  if (!root) return;
  const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;

  /* ---------- data ---------- */
  const rng = seed => () => { seed |= 0; seed = seed + 0x6D2B79F5 | 0; let t = Math.imul(seed ^ seed >>> 15, 1 | seed); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; };
  const gauss = r => { let u = 0, v = 0; while (!u) u = r(); while (!v) v = r(); return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v); };
  const AX = [
    { k: 'f', name: 'Focus', what: 'Attention on the task, from EEG.' },
    { k: 'c', name: 'Composure', what: 'Calm under pressure, from heart rate against EEG arousal.' },
    { k: 'fr', name: 'Freshness', what: 'Mental fatigue, from prefrontal blood oxygen (fNIRS) and EEG.' },
    { k: 'r', name: 'Reaction', what: 'How fast the brain responds to play, from EEG.' }
  ];
  // n, name, position, home spot on a 105 x 68 pitch (attacking right), spread, baseline, now, headers
  const SQUAD = [
    [1, 'Van der Sar', 'GK', [7, 34], [4, 7], [72, 80, 84, 76], [70, 79, 81, 75], []],
    [6, 'Brown', 'RB', [36, 58], [12, 6], [75, 74, 80, 78], [73, 72, 74, 77], []],
    [5, 'Ferdinand', 'CB', [26, 44], [9, 7], [78, 82, 80, 74], [77, 80, 76, 73], [[22, 40]]],
    [15, 'Vidić', 'CB', [26, 24], [9, 7], [80, 78, 82, 72], [78, 77, 78, 70], [[30, 22]]],
    [3, 'Evra', 'LB', [36, 10], [12, 6], [84, 76, 78, 80], [83, 74, 73, 79], []],
    [4, 'Hargreaves', 'DM', [42, 34], [11, 9], [82, 80, 76, 82], [80, 79, 72, 80], []],
    [18, 'Scholes', 'CM', [54, 44], [15, 10], [74, 76, 78, 80], [58, 71, 66, 72], []],
    [16, 'Carrick', 'CM', [54, 24], [15, 10], [76, 78, 80, 76], [72, 67, 74, 73], []],
    [32, 'Tevez', 'ST', [80, 42], [13, 11], [86, 74, 80, 84], [85, 73, 77, 83], []],
    [7, 'Ronaldo', 'RW', [78, 58], [13, 6], [88, 72, 82, 80], [85, 70, 71, 78], []],
    [11, 'Giggs', 'LW', [78, 10], [13, 6], [78, 76, 80, 82], [77, 75, 76, 80], []],
    [10, 'Rooney', 'ST', [86, 28], [9, 9], [76, 74, 78, 84], [74, 72, 74, 73], [[96, 30], [92, 40]]]
  ].map(([n, name, pos, home, spread, b, now, knocks]) => {
    const keys = ['f', 'c', 'fr', 'r'];
    const o = { n, name, pos, home, spread, knocks, base: {}, now: {}, target: {} };
    keys.forEach((k, i) => { o.base[k] = b[i]; o.now[k] = now[i]; o.target[k] = now[i]; });
    return o;
  });
  const byN = Object.fromEntries(SQUAD.map(p => [p.n, p]));
  const pad = n => String(n).padStart(2, '0');

  const ADVICE = {
    f: ['Attention is slipping', 'Physical work is normal for this drill, so the drop is mental.', 'Worth a word at the next break.'],
    c: ['Stress is running high', 'Heart rate is ahead of the work this drill asks for.', 'Simplify the task or give a reset.'],
    fr: ['Mental fatigue is building', 'The brain is tiring faster than the legs.', 'Think about a lighter role in the next block.'],
    r: ['Slower to react', 'Responses lag this morning’s check.', 'Keep out of high-speed decision drills for now.']
  };
  function read(p) {
    let worst = null, drop = 0;
    AX.forEach(a => { const d = (p.base[a.k] - p.now[a.k]) / p.base[a.k]; if (d > drop) { drop = d; worst = a.k; } });
    const state = drop >= .18 ? 'act' : drop >= .10 ? 'watch' : 'ok';
    return { state, worst, drop };
  }
  // one fused state word per player, from the stakeholder map: sharp, loaded, fading, rattled
  const WORD = { f: 'Fading', r: 'Fading', fr: 'Loaded', c: 'Rattled' };
  const word = p => { const { state, worst } = read(p); return state === 'ok' ? 'Sharp' : WORD[worst]; };
  const trend10 = p => { const m = ui.clock / 60 | 0, v = sessionLine(p, m); return Math.round(v[m] - v[Math.max(0, m - 10)]); };
  const DRILLS = [[0, 'Warm-up'], [12, 'Rondo'], [24, 'Small-sided']];

  /* positions: session samples per player, with a focus value for each */
  function samples(p, seed, count, late) {
    const r = rng(p.n * 977 + seed), out = [];
    for (let i = 0; i < count; i++) {
      const x = Math.min(104.5, Math.max(.5, p.home[0] + gauss(r) * p.spread[0]));
      const y = Math.min(67.5, Math.max(.5, p.home[1] + gauss(r) * p.spread[1]));
      // focus dips when a player is pulled back from their spot, more so late on
      let f = (late ? p.now.f : p.base.f) + gauss(r) * 4 - Math.max(0, p.home[0] - x) * .35;
      if (p.n === 18 && x < 46) f -= late ? 14 : 6;   // No. 18 fades when tracking back
      if (p.n === 16 && y > 40) f -= 6;
      out.push([x, y, f]);
    }
    return out;
  }
  const SESSION = Object.fromEntries(SQUAD.map(p => [p.n, samples(p, 1, 420, true)]));
  const SEASON = Object.fromEntries(SQUAD.map(p => [p.n, samples(p, 7, 900, false)]));

  /* readiness through the session, one value a minute */
  function sessionLine(p, upto) {
    const r = rng(p.n * 31 + 5), avg = o => (o.f + o.c + o.fr + o.r) / 4;
    const b = avg(p.base), now = avg(p.now), st = read(p).state;
    const start = st === 'act' ? 32 : st === 'watch' ? 26 : 99, out = [];
    for (let m = 0; m <= upto; m++) {
      let v = b + gauss(r) * 1.4 + (m < 6 ? -4 + m * .66 : 0);
      if (m >= start) v = b + (now - b) * Math.min(1, (m - start) / Math.max(1, upto - start)) + gauss(r) * .8;
      out.push(m === upto ? now : v);
    }
    return out;
  }

  /* season: weekly focus per player */
  const WEEKS = 18;
  const WEEKLY = Object.fromEntries(SQUAD.map(p => {
    const r = rng(p.n * 53 + 11), out = [];
    for (let w = 0; w < WEEKS; w++) {
      let v = p.base.f - 9 + w * .62 + gauss(r) * 2.4;
      if (p.n === 18 && w >= 15) v -= (w - 14) * 5;
      if (p.n === 16 && w >= 16) v -= 4;
      out.push(Math.round(Math.max(45, Math.min(95, v))));
    }
    return [p.n, out];
  }));

  /* ---------- drawing helpers ---------- */
  const COL = { ok: 'var(--cxa-ok)', watch: 'var(--cxa-watch)', act: 'var(--cxa-act)' };
  const pt = (cx, cy, r, i, v) => { const a = -Math.PI / 2 + i * Math.PI / 2, k = r * v / 100; return [cx + Math.cos(a) * k, cy + Math.sin(a) * k]; };
  const poly = (o, cx, cy, r) => AX.map((a, i) => pt(cx, cy, r, i, o[a.k]).map(v => v.toFixed(1)).join(',')).join(' ');

  // the mind diagram: four axes, morning baseline dashed, now filled
  function glyph(p, big, mid) {
    const s = big ? 440 : mid ? 132 : 96, c = s / 2, r = big ? 120 : mid ? 54 : 40, { state, worst } = read(p);
    let g = `<svg class="cxa-glyph${big ? ' big' : mid ? ' mid' : ''}" viewBox="0 0 ${s} ${s}" role="img" aria-label="${p.name}: ${AX.map(a => `${a.name} ${Math.round(p.now[a.k])} against ${p.base[a.k]} this morning`).join(', ')}">`;
    [50, 100].forEach(v => g += `<polygon points="${poly({ f: v, c: v, fr: v, r: v }, c, c, r)}" class="g-ring"/>`);
    AX.forEach((a, i) => { const [x, y] = pt(c, c, r, i, 100); g += `<line x1="${c}" y1="${c}" x2="${x.toFixed(1)}" y2="${y.toFixed(1)}" class="g-ax"/>`; });
    g += `<polygon points="${poly(p.base, c, c, r)}" class="g-base"/>`;
    g += `<polygon points="${poly(p.now, c, c, r)}" class="g-now" style="--sc:${COL[state]}"/>`;
    AX.forEach((a, i) => {
      const [x, y] = pt(c, c, r, i, p.now[a.k]), hit = state !== 'ok' && a.k === worst;
      g += `<circle cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="${big ? (hit ? 6 : 4) : (hit ? 3.6 : 2.2)}" class="g-dot${hit ? ' hit' : ''}" style="--sc:${COL[state]}"/>`;
      if (big) {
        const [lx, ly] = pt(c, c, r + 44, i, 100), anchor = i === 1 ? 'start' : i === 3 ? 'end' : 'middle';
        const ox = i === 1 ? -30 : i === 3 ? 30 : 0, d = Math.round(p.now[a.k] - p.base[a.k]);
        g += `<text x="${(lx + ox).toFixed(1)}" y="${(ly + (i === 0 ? -30 : i === 2 ? 6 : -14)).toFixed(1)}" text-anchor="${anchor}" class="g-lab">${a.name}</text>`;
        g += `<text x="${(lx + ox).toFixed(1)}" y="${(ly + (i === 0 ? 0 : i === 2 ? 36 : 16)).toFixed(1)}" text-anchor="${anchor}" class="g-val${hit ? ' hit' : ''}" style="--sc:${COL[state]}">${Math.round(p.now[a.k])} <tspan class="g-d">${d > 0 ? '+' : ''}${d}</tspan></text>`;
      } else {
        const [lx, ly] = pt(c, c, r + 7, i, 100);
        g += `<text x="${lx.toFixed(1)}" y="${(ly + 3).toFixed(1)}" text-anchor="middle" class="g-tiny">${['F', 'C', 'Fr', 'R'][i]}</text>`;
      }
    });
    return g + '</svg>';
  }

  // pitch outline, 105 x 68 m
  const PITCH = `<rect x=".5" y=".5" width="104" height="67" class="p-line"/><line x1="52.5" y1=".5" x2="52.5" y2="67.5" class="p-line"/><circle cx="52.5" cy="34" r="9.15" class="p-line"/><circle cx="52.5" cy="34" r=".5" class="p-spot"/>
<rect x=".5" y="13.85" width="16" height="40.3" class="p-line"/><rect x=".5" y="24.85" width="5" height="18.3" class="p-line"/><circle cx="11" cy="34" r=".5" class="p-spot"/>
<rect x="88.5" y="13.85" width="16" height="40.3" class="p-line"/><rect x="99.5" y="24.85" width="5" height="18.3" class="p-line"/><circle cx="94" cy="34" r=".5" class="p-spot"/>`;
  const GX = 21, GY = 14, CW = 105 / GX, CH = 68 / GY;
  const lerp = (a, b, t) => a + (b - a) * t;
  function focusColour(v) { // low focus red, middle muted, high focus EEG purple
    const t = Math.max(0, Math.min(1, (v - 52) / 34)), lo = [255, 25, 15], mid = [74, 52, 110], hi = [176, 76, 255];
    const [a, b, k] = t < .5 ? [lo, mid, t * 2] : [mid, hi, (t - .5) * 2];
    return `rgb(${a.map((c, i) => Math.round(lerp(c, b[i], k))).join(',')})`;
  }
  function heat(pts, mode, knocks) {
    const cnt = new Array(GX * GY).fill(0), sum = new Array(GX * GY).fill(0);
    pts.forEach(([x, y, f]) => { const i = Math.min(GY - 1, y / CH | 0) * GX + Math.min(GX - 1, x / CW | 0); cnt[i]++; sum[i] += f; });
    const max = Math.max(...cnt), min = mode === 'focus' ? Math.max(3, max * .04) : 1;
    let s = '';
    cnt.forEach((n, i) => {
      if (n < min) return;
      const x = (i % GX) * CW, y = (i / GX | 0) * CH;
      const fill = mode === 'focus' ? focusColour(sum[i] / n) : '#F46C02';
      const op = mode === 'focus' ? .3 + .6 * Math.pow(n / max, .35) : .08 + .82 * Math.pow(n / max, .7);
      s += `<rect x="${x.toFixed(2)}" y="${y.toFixed(2)}" width="${CW.toFixed(2)}" height="${CH.toFixed(2)}" fill="${fill}" opacity="${op.toFixed(2)}"><title>${mode === 'focus' ? 'Focus ' + Math.round(sum[i] / n) : Math.round(n / pts.length * 100) + '% of time'}</title></rect>`;
    });
    (knocks || []).forEach(([x, y]) => s += `<g class="p-knock"><circle cx="${x}" cy="${y}" r="2.4"/><text x="${x}" y="${y + 1}" text-anchor="middle">H</text></g>`);
    return `<svg class="cxa-pitch" viewBox="0 0 105 68" role="img" aria-label="${mode === 'focus' ? 'Focus by area of the pitch' : 'Where the player spent their time'}">${s}${PITCH}</svg>`;
  }
  const MINI = {};
  const mini = p => MINI[p.n] || (MINI[p.n] = heat(SESSION[p.n], 'time').replace('class="cxa-pitch"', 'class="cxa-pitch mini" aria-hidden="true"'));
  function legend(mode) {
    return mode === 'focus'
      ? `<div class="cxa-leg"><span>Focus low</span><i>${[52, 60, 69, 77, 86].map(v => `<b style="background:${focusColour(v)}"></b>`).join('')}</i><span>high</span></div>`
      : `<div class="cxa-leg"><span>Less time</span><i>${[.15, .35, .55, .75, .95].map(o => `<b style="background:#F46C02;opacity:${o}"></b>`).join('')}</i><span>more</span></div>`;
  }

  /* ---------- state ---------- */
  const ui = { expand: '', sent: new Set(), dismissed: new Set(), confirmed: new Set(), view: 'squad', player: 18, mode: 'focus', seasonPick: 0, seasonMode: 'focus', clock: 38 * 60 + 12 };
  const fmtClock = s => `${pad(s / 60 | 0)}:${pad(s % 60)}`;

  /* ---------- views ---------- */
  const dot = st => `<i class="cxa-dot s-${st}" aria-hidden="true"></i>`;
  const worstP = () => [...SQUAD].sort((a, b) => read(b).drop - read(a).drop)[0];
  const axName = k => AX.find(a => a.k === k).name.toLowerCase();
  const avg = o => (o.f + o.c + o.fr + o.r) / 4;
  const sign = d => d === 0 ? '0' : (d < 0 ? '−' : '+') + Math.abs(d);
  // a box: small label on top, content under it. `exp` makes the whole box open a bigger panel.
  const tile = (label, body, cls = '', side = '', exp = '') => exp
    ? `<button class="cxa-tile cxa-exp ${cls}" data-expand="${exp}" aria-haspopup="dialog"><span class="cxa-th"><h5>${label}</h5><i class="cxa-more" aria-hidden="true">↗</i></span>${body}</button>`
    : `<div class="cxa-tile ${cls}"><div class="cxa-th"><h5>${label}</h5>${side}</div>${body}</div>`;
  const big = (v, of, cls = '') => `<b class="cxa-big num ${cls}">${v}${of ? `<small>${of}</small>` : ''}</b>`;
  const kit = (label, v, of, line, rows) => `<div class="cxa-tile cxa-kit"><img src="img/cx3-hero.jpg" alt="" width="1920" height="1080" loading="lazy" decoding="async"><div class="cxa-kit-t"><div class="cxa-th"><h5>${label}</h5></div>${big(v, of)}<span class="cxa-sub">${line}</span><span class="cxa-sub">${rows.map(([k, x]) => `${k} <b>${x}</b>`).join(' · ')}</span></div></div>`;
  const drills = () => { const m = ui.clock / 60 | 0; return `<div class="cxa-drills">${DRILLS.map(([t, n], i) => { const end = DRILLS[i + 1] ? DRILLS[i + 1][0] : 45, on = m >= t && m < end; return `<span class="${on ? 'on' : m >= end ? 'done' : ''}" style="flex:${end - t}"><i></i>${n} <em class="num">${t}′</em></span>`; }).join('')}</div>`; };
  const flaggedList = () => SQUAD.filter(p => read(p).state !== 'ok' && !ui.dismissed.has(p.n)).sort((a, b) => read(b).drop - read(a).drop);
  const flagRow = p => { const { state, worst, drop } = read(p); return `<span class="cxa-frow">${dot(state)}<b>${p.name}</b><em>${axName(worst)} −${Math.round(drop * 100)}%</em></span>`; };
  const heads = () => SQUAD.filter(p => p.knocks.length).sort((a, b) => b.knocks.length - a.knocks.length);

  function card(p) {
    const { state, worst } = read(p), t = trend10(p);
    const head = state === 'ok' ? 'Matching this morning' : ADVICE[worst][0];
    return `<button class="cxa-card s-${state}" data-open="${p.n}" aria-label="Open ${p.name}, ${word(p)}">
      <span class="c-top"><b class="num">${p.n}</b><span>${p.name}</span><em>${p.pos}</em></span>
      <span class="c-body">${glyph(p)}${mini(p)}</span><span class="c-read"><i>${dot(state)}${word(p)} <span class="c-tick ${t <= -3 ? 'dn' : ''}" title="Change over the last 10 minutes">${Math.abs(t) < 3 ? '▬' : (t < 0 ? '▼' : '▲') + Math.abs(t)}</span></i><span>${head}</span>${p.knocks.length ? `<span class="c-knock">${p.knocks.length} header${p.knocks.length > 1 ? 's' : ''}</span>` : ''}</span>
    </button>`;
  }

  function squadView() {
    const live = SQUAD.map((p, i) => {
      const t = ui.clock / 9 + i * 1.7, x = p.home[0] + Math.sin(t) * p.spread[0] * .35, y = p.home[1] + Math.cos(t * .8) * p.spread[1] * .35;
      return `<g class="p-pl s-${read(p).state}" data-open="${p.n}" tabindex="0" role="button" aria-label="${p.name}"><circle cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="3.4"/><text x="${x.toFixed(1)}" y="${(y + 1.3).toFixed(1)}" text-anchor="middle">${p.n}</text></g>`;
    }).join('');
    const fl = flaggedList(), w = worstP(), wr = read(w), hs = heads(), ht = hs.reduce((s, p) => s + p.knocks.length, 0);
    const sq = Math.round(SQUAD.reduce((s, p) => s + avg(p.now), 0) / SQUAD.length), sqB = Math.round(SQUAD.reduce((s, p) => s + avg(p.base), 0) / SQUAD.length);
    const chips = [...SQUAD].sort((a, b) => read(b).drop - read(a).drop).map(p => `<button class="cxa-chip s-${read(p).state}" data-open="${p.n}" aria-label="Open ${p.name}, ${word(p)}">${glyph(p)}<span><b class="num">${p.n}</b> ${p.name}</span><i>${word(p)}</i></button>`).join('');
    return `<div class="cxa-view cxa-sq">
      <div class="cxa-col">
        ${tile('Need a look', `${big(fl.length, '/' + SQUAD.length, fl.length ? 's-watch' : '')}<span class="cxa-sub">below this morning’s check</span>`)}
        ${tile('Squad readiness', `${big(sq, '/100')}<span class="cxa-sub">${sign(sq - sqB)} on the 08:40 check</span>`)}
        ${tile('Flags', `<span class="cxa-flist">${fl.slice(0, 3).map(flagRow).join('')}${ht ? `<span class="cxa-frow">${dot('head')}<b>${ht} headers</b><em>${hs.length} players</em></span>` : ''}</span><span class="cxa-note">${fl.length > 3 ? `+${fl.length - 3} more · ` : ''}Open all flags</span>`, 'grow', '', 'flags')}
      </div>
      <div class="cxa-stage">
        <div class="cxa-th"><h5>On the pitch now</h5><span class="cxa-keys"><span>${dot('ok')}Sharp</span><span>${dot('watch')}Watch</span><span>${dot('act')}Act</span></span></div>
        <div class="cxa-fit"><svg class="cxa-pitch live" viewBox="0 0 105 68" role="group" aria-label="Live positions, coloured by state">${PITCH}${live}</svg></div>
        ${drills()}
        <div class="cxa-th"><h5>Squad · worst first</h5><button class="cxa-text" data-expand="cards">All player cards ↗</button></div>
        <div class="cxa-chips">${chips}</div>
      </div>
      <div class="cxa-col">
        ${tile('Biggest drop', `<div class="cxa-worst">${glyph(w, false, true)}<div>${big('−' + Math.round(wr.drop * 100) + '%', '', 's-' + wr.state)}<span class="cxa-sub">${axName(wr.worst)}</span></div></div><p class="cxa-name"><span class="num">${w.n}</span> ${w.name} · ${word(w)}</p><button class="cxa-btn" data-open="${w.n}">Open ${w.name}</button>`, 'cxa-hi')}
        ${kit('Headsets', 12, '/12', 'on and streaming', [['Lowest', 'Giggs 38%']])}
      </div>
    </div>`;
  }

  function lineChart(p) {
    const m = ui.clock / 60 | 0, v = sessionLine(p, m), W = 320, H = 300, L = 30, B = 22;
    const x = i => L + i / Math.max(1, m) * (W - L - 8), y = val => 8 + (1 - (val - 40) / 55) * (H - B - 8);
    const avgB = avg(p.base), st = read(p).state;
    const path = v.map((val, i) => `${i ? 'L' : 'M'}${x(i).toFixed(1)},${y(val).toFixed(1)}`).join('');
    let g = `<svg class="cxa-line" viewBox="0 0 ${W} ${H}" role="img" aria-label="Overall readiness through the session, now ${Math.round(v[v.length - 1])} against a baseline of ${Math.round(avgB)}">`;
    [50, 70, 90].forEach(t => g += `<line x1="${L}" x2="${W - 8}" y1="${y(t)}" y2="${y(t)}" class="l-grid"/><text x="${L - 6}" y="${y(t) + 4}" text-anchor="end" class="l-ax">${t}</text>`);
    [0, 15, 30].forEach(t => t <= m && (g += `<text x="${x(t)}" y="${H - 4}" text-anchor="middle" class="l-ax">${t}′</text>`));
    g += `<text x="${x(m)}" y="${H - 4}" text-anchor="end" class="l-ax">${m}′</text>`;
    DRILLS.forEach(([t]) => t <= m && (g += `<line x1="${x(t)}" x2="${x(t)}" y1="8" y2="${H - B}" class="l-drill"/>`));
    g += `<line x1="${L}" x2="${W - 8}" y1="${y(avgB)}" y2="${y(avgB)}" class="l-base"/><text x="${L + 4}" y="${y(avgB) - 6}" class="l-ax">This morning</text>`;
    g += `<path d="${path}L${x(m)},${H - B}L${L},${H - B}Z" class="l-area" style="--sc:${COL[st]}"/><path d="${path}" class="l-path" style="--sc:${COL[st]}"/>`;
    return g + `<circle cx="${x(m)}" cy="${y(v[m])}" r="4" class="l-now" style="--sc:${COL[st]}"/></svg>`;
  }

  function deeper(p) {
    const r = rng(p.n * 71 + 3), d = k => Math.round(p.now[k] - p.base[k]), n = (a, b) => a + Math.floor(r() * (b - a + 1));
    const lapses = Math.max(0, Math.round(-d('f') / 4)) + n(0, 1);
    return {
      f: [['Attention lapses, last 10 min', lapses], ['Longest focused spell', n(4, 9) + ' min'], ['Back on task after a mistake', n(20, 60) + ' s'], ['Focus when tracking back', (p.n === 18 ? '−18' : '−' + n(2, 7)) + ' vs forward']],
      c: [['Stress spikes this session', Math.max(0, Math.round(-d('c') / 3)) + n(0, 1)], ['Heart rate against the work', (d('c') < -6 ? '+9%' : '+' + n(0, 4) + '%')], ['Calm again after a spike', n(30, 90) + ' s'], ['Most tense after', ['turnovers', 'set pieces', 'pressing', 'losing a duel'][n(0, 3)]]],
      fr: [['Mental fatigue onset', d('fr') < -6 ? 'Minute ' + n(26, 33) : 'Not yet'], ['Prefrontal oxygen vs morning', (d('fr') < -6 ? '−' + n(5, 8) : '−' + n(0, 3)) + '%'], ['Brain vs legs', d('fr') < -6 ? 'Brain tiring first' : 'In step'], ['Recovery at water breaks', n(55, 95) + '%']],
      r: [['Response time', (300 + n(0, 30) - d('r') * 3) + ' ms'], ['Change vs morning', '+' + Math.max(0, -d('r') * 3 + n(0, 6)) + ' ms'], ['Slowest after', ['sprints', 'long passes', 'pressing'][n(0, 2)]], ['Scanning before receiving', n(2, 5) + ' looks']]
    };
  }
  function medical(p) {
    const r = rng(p.n * 13 + 1), rows = p.knocks.map(([x], i) => [`Header · ${pad(12 + i * 9 + Math.floor(r() * 6))}:${pad(Math.floor(r() * 60))}`, `${(18 + r() * 22).toFixed(0)} g`, x > 52 ? 'Attacking half' : 'Own half']);
    if (read(p).state !== 'ok') rows.push(['Fatigue flag', word(p), 'Pitch-side']);
    return rows;
  }
  const POS = { GK: 'Goalkeeper', RB: 'Right back', CB: 'Centre back', LB: 'Left back', DM: 'Holding midfield', CM: 'Central midfield', RW: 'Right wing', LW: 'Left wing', ST: 'Striker' };

  function playerView() {
    const p = byN[ui.player], { state, worst, drop } = read(p), i = SQUAD.indexOf(p);
    const prev = SQUAD[(i + SQUAD.length - 1) % SQUAD.length], next = SQUAD[(i + 1) % SQUAD.length];
    const adv = state === 'ok' ? ['Matching this morning', 'Every reading is within 10% of the morning check.', 'Nothing to do.'] : ADVICE[worst];
    const decided = ui.dismissed.has(p.n) ? 'Dismissed' : ui.confirmed.has(p.n) ? 'Confirmed' : '';
    const rd = Math.round(avg(p.now)), med = medical(p);
    const acts = state === 'ok' ? '' : decided ? `<span class="cxa-note">${decided}</span>` : `<div class="cxa-acts"><button class="cxa-btn" data-confirm="${p.n}">Confirm flag</button><button class="cxa-text" data-dismiss="${p.n}">Dismiss</button></div>`;
    return `<div class="cxa-view cxa-pl">
      <div class="cxa-col">
        ${tile('Readiness', `${big(rd, '/100', 's-' + state)}<span class="cxa-sub">${sign(Math.round(avg(p.now) - avg(p.base)))} on the 08:40 check</span><span class="cxa-fit">${lineChart(p)}</span>`, 'grow')}
        ${tile('Read', `${big(word(p), '', 'word s-' + state)}<p class="cxa-adv"><b>${adv[0]}${state !== 'ok' ? ` · ${axName(worst)} −${Math.round(drop * 100)}%` : ''}</b>${adv[1]}</p>${acts}`)}
      </div>
      <div class="cxa-stage cxa-stage-pl">
        <div class="cxa-who"><div><span class="num">${p.n}</span><h3>${p.name}</h3><p>${POS[p.pos]} · Session 2</p></div>
          <div class="cxa-pl-nav"><button data-open="${prev.n}" aria-label="Previous player, ${prev.name}">←</button><span class="num">${i + 1} of ${SQUAD.length}</span><button data-open="${next.n}" aria-label="Next player, ${next.name}">→</button></div></div>
        <div class="cxa-fit">${glyph(p, true)}</div>
        <div class="cxa-key"><span><i class="k-now" style="--sc:${COL[state]}"></i>Now</span><span><i class="k-base"></i>This morning, 08:40</span></div>
      </div>
      <div class="cxa-col">
        ${tile('Where on the pitch', `${heat(SESSION[p.n], ui.mode, p.knocks)}<div class="cxa-foot">${legend(ui.mode)}</div>`, '', `<div class="cxa-seg" role="group" aria-label="Pitch map shows"><button data-mode="focus" aria-pressed="${ui.mode === 'focus'}">Focus</button><button data-mode="time" aria-pressed="${ui.mode === 'time'}">Time</button></div>`)}
        <div class="cxa-tile grow cxa-deep"><div class="cxa-th"><h5>Go deeper</h5></div>${AX.map(a => { const dd = Math.round(p.now[a.k] - p.base[a.k]); return `<button class="cxa-drow" data-expand="deep-${a.k}" aria-haspopup="dialog"><span>${a.name}</span><b class="num">${Math.round(p.now[a.k])}</b><em class="${dd <= -6 ? 'dn' : ''}">${sign(dd)}</em><i aria-hidden="true">↗</i></button>`; }).join('')}
          <button class="cxa-drow" data-expand="med" aria-haspopup="dialog"><span>Medical log</span><b class="num">${med.length}</b><em>${med.length === 1 ? 'entry' : 'entries'}</em><i aria-hidden="true">↗</i></button></div>
      </div>
    </div>`;
  }

  function weekGrid() {
    return `<div class="cxa-hgrid">${SQUAD.map(p => `<div class="cxa-hrow${ui.seasonPick === p.n ? ' on' : ''}"><button data-pick="${p.n}">${p.n} ${p.name}</button><div class="cxa-hcells">${WEEKLY[p.n].map((v, w) => `<i data-tip="${p.n} ${p.name} · W${w + 1} · focus ${v}" style="--o:${(Math.max(0, v - 50) / 42).toFixed(2)}"></i>`).join('')}</div></div>`).join('')}<div class="cxa-hrow ax"><span></span><div class="cxa-hcells">${Array.from({ length: WEEKS }, (_, w) => `<b>${w % 3 === 0 ? 'W' + (w + 1) : ''}</b>`).join('')}</div></div><div class="cxa-tip" hidden></div></div>`;
  }
  const watchList = () => SQUAD.map(p => { const w = WEEKLY[p.n]; return { p, f: w[WEEKS - 1], d: w[WEEKS - 1] - w[WEEKS - 4] }; }).sort((a, b) => a.d - b.d);
  const watchTable = rows => `<table class="cxa-table"><thead><tr><th>Player</th><th>Pos</th><th>Focus</th><th>3 weeks</th></tr></thead><tbody>${rows.map(({ p, f, d }) => `<tr class="${ui.seasonPick === p.n ? 'on' : ''}"><td><button data-pick="${p.n}">${p.n} ${p.name}</button></td><td>${p.pos}</td><td class="num">${f}</td><td class="num ${d < 0 ? 'dn' : 'up'}">${sign(d)}</td></tr>`).join('')}</tbody></table>`;

  function seasonView() {
    const pick = ui.seasonPick ? byN[ui.seasonPick] : null;
    const pts = pick ? SEASON[pick.n] : SQUAD.flatMap(p => SEASON[p.n]);
    const wl = watchList(), top = wl[0];
    const kpi = (label, v, of, line) => tile(label, `${big(v, of)}<span class="cxa-sub">${line}</span>`);
    const spark = SQUAD.map(p => `<span>${WEEKLY[p.n].map(v => `<i style="--o:${(Math.max(0, v - 50) / 42).toFixed(2)}"></i>`).join('')}</span>`).join('');
    return `<div class="cxa-view cxa-se">
      <div class="cxa-col">
        ${kpi('Squad focus, match days', 76, '/100', '+9 since July')}
        ${kpi('Late-game decision drop', '−11', '%', 'was −24% in July')}
        ${kpi('Fatigue flags per session', '1.8', '', 'was 4.1 in July')}
      </div>
      <div class="cxa-stage">
        <div class="cxa-th"><h5>${pick ? `Where ${pick.name}’s focus drops` : 'Where the squad’s focus drops'} · 18 weeks</h5><div class="cxa-seg" role="group" aria-label="Pitch map shows"><button data-smode="focus" aria-pressed="${ui.seasonMode === 'focus'}">Focus</button><button data-smode="time" aria-pressed="${ui.seasonMode === 'time'}">Time</button></div></div>
        <div class="cxa-fit">${heat(pts, ui.seasonMode)}</div>
        <div class="cxa-foot">${legend(ui.seasonMode)}${pick ? '<button class="cxa-text" data-pick="0">Whole squad</button>' : '<span class="cxa-note">Pick a player in the watch list</span>'}</div>
      </div>
      <div class="cxa-col">
        ${tile('Biggest drop, 3 weeks', `${big(sign(top.d), '', 's-watch')}<span class="cxa-sub">${top.p.name}’s focus</span><button class="cxa-btn" data-open="${(pick || top.p).n}">Open ${(pick || top.p).name} live</button>`, 'cxa-hi')}
        ${tile('Watch list', `<span class="cxa-flist">${wl.slice(0, 4).map(({ p, d }) => `<span class="cxa-frow">${dot(d <= -5 ? 'watch' : 'ok')}<b>${p.name}</b><em class="num">${sign(d)}</em></span>`).join('')}</span><span class="cxa-note">All 12 players</span>`, 'grow', '', 'watch')}
        ${tile('Focus by week', `<span class="cxa-spark">${spark}</span><span class="cxa-note">12 players × 18 weeks · 94% wear</span>`, '', '', 'weeks')}
      </div>
    </div>`;
  }

  /* ---------- reports: insights the system found, and reports to send ---------- */
  // physical freshness from the back unit (load and position), 0 to 100
  const LEGS = { 1: 88, 6: 74, 5: 80, 15: 78, 3: 70, 4: 72, 18: 82, 16: 77, 32: 66, 7: 80, 11: 75, 10: 60 };
  const INSIGHTS = [
    { k: 'brain', v: '3', of: ' players', h: 'Brains tiring before legs', b: 'Scholes, Ronaldo and Carrick are physically fresh but mentally fading. Running data alone would clear them to play on.', who: [18, 7, 16] },
    { k: 'track', v: '−18', of: '%', h: 'Scholes loses focus tracking back', b: 'His focus falls 18% when he is pulled behind the ball, and the gap has grown each week since W15. Going forward he is unchanged.', who: [18] },
    { k: 'late', v: '−11', of: '%', h: 'Late-game decisions hold up better', b: 'Decision quality in the last 15 minutes drops 11%, down from 24% in July, since lighter Thursday sessions began.', who: [] },
    { k: 'head', v: '4', of: ' headers', h: 'Heading load this week', b: 'All four were under 40 g. Rooney has two, both in the attacking half. Nothing above the review threshold.', who: [10, 5, 15] }
  ];
  const REPORTS = [
    { k: 'session', t: 'Session 2 report', d: 'Today · 38 min · auto', to: 'Coaching staff' },
    { k: 'week', t: 'Weekly squad report', d: 'W18 · Nov 3 to 9', to: 'Manager, analysts' },
    { k: 'match', t: 'Match-day readiness', d: 'Saturday · draft', to: 'Manager' },
    { k: 'med', t: 'Head impact log', d: 'Season to date', to: 'Medical team' }
  ];
  function quad() {
    const W = 400, H = 300, x = v => 30 + (v - 55) / 40 * (W - 46), y = v => 12 + (1 - (v - 58) / 26) * (H - 44);
    let g = `<svg class="cxa-quad" viewBox="0 0 ${W} ${H}" role="img" aria-label="Each player placed by physical freshness against mental readiness">`;
    g += `<line x1="${x(73)}" x2="${x(73)}" y1="12" y2="${H - 32}" class="q-ax"/><line x1="30" x2="${W - 16}" y1="${y(73)}" y2="${y(73)}" class="q-ax"/>`;
    g += `<text x="${W - 18}" y="26" text-anchor="end" class="q-lab">Fresh</text><text x="34" y="26" class="q-lab">Legs tired</text><text x="${W - 18}" y="${H - 40}" text-anchor="end" class="q-lab hot">Brain tired first</text><text x="34" y="${H - 40}" class="q-lab">Rest</text>`;
    g += `<text x="${(W + 14) / 2}" y="${H - 8}" text-anchor="middle" class="q-ax-l">Legs (back unit) →</text><text x="12" y="${H / 2 - 10}" transform="rotate(-90 12 ${H / 2 - 10})" text-anchor="middle" class="q-ax-l">Mind (headset) →</text>`;
    SQUAD.forEach(p => { const st = read(p).state, cx = x(LEGS[p.n]), cy = y(Math.max(59, Math.min(83, avg(p.now)))); g += `<g class="p-pl s-${st}" data-open="${p.n}" tabindex="0" role="button" aria-label="${p.name}"><circle cx="${cx.toFixed(1)}" cy="${cy.toFixed(1)}" r="9"/><text x="${cx.toFixed(1)}" y="${(cy + 3).toFixed(1)}" text-anchor="middle">${p.n}</text></g>`; });
    return g + '</svg>';
  }
  function reportsView() {
    return `<div class="cxa-view cxa-rp">
      <div class="cxa-col">
        ${INSIGHTS.slice(0, 3).map(n => tile('Insight', `${big(n.v, n.of, n.k === 'brain' || n.k === 'track' ? 's-watch' : '')}<span class="cxa-sub cxa-ins-h">${n.h}</span>`, n.k === 'brain' ? 'grow cxa-hi' : 'grow', '', 'ins-' + n.k)).join('')}
      </div>
      <div class="cxa-stage">
        <div class="cxa-th"><h5>Brain against legs · this session</h5><span class="cxa-keys"><span>${dot('ok')}Sharp</span><span>${dot('watch')}Watch</span><span>${dot('act')}Act</span></span></div>
        <div class="cxa-fit">${quad()}</div>
        <p class="cxa-note">Only CortX sees the bottom-right corner: players whose running looks fine but whose brain is already tiring.</p>
      </div>
      <div class="cxa-col">
        ${tile('Insight', `${big(INSIGHTS[3].v, INSIGHTS[3].of)}<span class="cxa-sub cxa-ins-h">${INSIGHTS[3].h}</span>`, '', '', 'ins-head')}
        <div class="cxa-tile grow cxa-deep"><div class="cxa-th"><h5>Reports</h5></div>${REPORTS.map(r => `<button class="cxa-drow cxa-rrow" data-expand="rep-${r.k}" aria-haspopup="dialog"><span><b>${r.t}</b><em>${r.d}</em></span><i class="cxa-sent">${ui.sent.has(r.k) ? 'Sent' : ''}</i><i aria-hidden="true">↗</i></button>`).join('')}</div>
      </div>
    </div>`;
  }

  /* ---------- expanded panels ---------- */
  function pop() {
    const k = ui.expand; if (!k) return '';
    let h = '', body = '';
    const p = byN[ui.player];
    if (k === 'flags') { h = 'All flags'; body = `<div class="cxa-flags">${flaggedList().map(q => { const { state, worst, drop } = read(q); return `<button class="cxa-flag" data-open="${q.n}">${dot(state)}<b>${q.name} · ${axName(worst)} −${Math.round(drop * 100)}%</b><span>${word(q)}${ui.confirmed.has(q.n) ? ', confirmed' : ''}. ${ADVICE[worst][1]} ${ADVICE[worst][2]}</span></button>`; }).join('')}${heads().map(q => `<button class="cxa-flag" data-open="${q.n}">${dot('head')}<b>${q.name} · ${q.knocks.length} header${q.knocks.length > 1 ? 's' : ''}</b><span>Logged by the headset.</span></button>`).join('')}</div><p class="cxa-note">CortX flags. The coach decides.</p>`; }
    else if (k === 'cards') { h = 'Squad · worst first'; body = `<div class="cxa-cards">${[...SQUAD].sort((a, b) => read(b).drop - read(a).drop).map(card).join('')}</div>`; }
    else if (k.startsWith('deep-')) { const a = AX.find(x => x.k === k.slice(5)), dd = Math.round(p.now[a.k] - p.base[a.k]); h = `${p.name} · ${a.name}`; body = `<div class="cxa-pop-hero">${big(Math.round(p.now[a.k]), '/100')}<span class="cxa-sub">${sign(dd)} on this morning’s ${p.base[a.k]} · ${a.what}</span></div><dl class="cxa-dl cxa-dl-big">${deeper(p)[a.k].map(([x, v]) => `<div><dt>${x}</dt><dd>${v}</dd></div>`).join('')}</dl><div class="cxa-pop-tabs">${AX.map(b => `<button data-expand="deep-${b.k}" aria-pressed="${b.k === a.k}">${b.name}</button>`).join('')}</div>`; }
    else if (k === 'med') { const med = medical(p); h = `${p.name} · Medical log`; body = `${med.length ? `<dl class="cxa-dl cxa-dl-big cxa-med">${med.map(([a, b, c]) => `<div><dt>${a}</dt><dd>${b}<span>${c}</span></dd></div>`).join('')}</dl>` : '<p class="cxa-note">Nothing logged this session.</p>'}<p class="cxa-note">Shared with the medical team. Players see their own data after the session, never live.</p>`; }
    else if (k === 'watch') { h = 'Watch list · focus, last 3 weeks'; body = watchTable(watchList()); }
    else if (k === 'weeks') { h = 'Focus by player and week · Jul 7 to Nov 9'; body = weekGrid(); }
    else if (k.startsWith('ins-')) { const n = INSIGHTS.find(x => x.k === k.slice(4)); h = 'Insight'; body = `<div class="cxa-pop-hero">${big(n.v, n.of)}<h4 class="cxa-pop-h">${n.h}</h4><p>${n.b}</p></div>${n.who.length ? `<div class="cxa-chips cxa-chips-pop">${n.who.map(q => byN[q]).map(q => `<button class="cxa-chip s-${read(q).state}" data-open="${q.n}">${glyph(q)}<span><b class="num">${q.n}</b> ${q.name}</span><i>${word(q)}</i></button>`).join('')}</div>` : ''}`; }
    else if (k.startsWith('rep-')) {
      const r = REPORTS.find(x => x.k === k.slice(4)), fl = flaggedList(); h = r.t;
      const kp = r.k === 'med' ? [['Headers', 4, ''], ['Over 60 g', 0, ''], ['Players', 3, '']] : r.k === 'week' ? [['Squad focus', 76, '/100'], ['Flags a session', '1.8', ''], ['Wear', 94, '%']] : [['Readiness', Math.round(SQUAD.reduce((s, q) => s + avg(q.now), 0) / 12), '/100'], ['Need a look', fl.length, '/12'], ['Headers', heads().reduce((s, q) => s + q.knocks.length, 0), '']];
      body = `<p class="cxa-sub">${r.d} · for ${r.to}</p><div class="cxa-pop-kpis">${kp.map(([a, v, of]) => `<div><h5>${a}</h5>${big(v, of)}</div>`).join('')}</div>
        <h5 class="cxa-pop-sec">Key points</h5><ul class="cxa-pts">${(r.k === 'med' ? ['Four headers logged, all under 40 g.', 'Rooney: two, both in the attacking half.', 'No player above the review threshold this season.'] : r.k === 'week' ? ['Scholes: focus down 11 in three weeks, worst when tracking back.', 'Late-game decision drop now −11%, was −24% in July.', 'Carrick: composure dips in pressing drills, worth watching.'] : fl.slice(0, 3).map(q => `${q.name}: ${word(q).toLowerCase()}, ${axName(read(q).worst)} −${Math.round(read(q).drop * 100)}%. ${ADVICE[read(q).worst][2]}`)).map(t => `<li>${t}</li>`).join('')}</ul>
        <div class="cxa-acts">${ui.sent.has(r.k) ? `<span class="cxa-note">Sent to ${r.to.toLowerCase()}</span>` : `<button class="cxa-btn" data-send="${r.k}">Send to ${r.to.toLowerCase()}</button>`}<span class="cxa-note">PDF and link, same as the dashboard</span></div>`;
    }
    return `<div class="cxa-scrim" data-close-pop="1"></div><div class="cxa-pop" role="dialog" aria-modal="true" aria-label="${h.replace(/<[^>]+>/g, '')}"><div class="cxa-th"><h4>${h}</h4><button class="cxa-x" data-close-pop="1" aria-label="Close">×</button></div><div class="cxa-pop-b">${body}</div></div>`;
  }

  /* ---------- shell ---------- */
  root.innerHTML = `<img class="cxa-bg" src="img/cx-bg-halftone.jpg" alt="" width="1944" height="1098" decoding="async"><div class="cxa-bar">
      <img src="img/cx-logo-void.png" alt="CortX" width="351" height="107" class="cxa-logo">
      <div class="cxa-tabs" role="tablist" aria-label="App views">
        <button role="tab" data-view="squad">Squad</button><button role="tab" data-view="player">Player</button><button role="tab" data-view="season">Season</button><button role="tab" data-view="reports">Reports</button>
      </div>
      <span class="cxa-sess">Session 2 · Small-sided games</span>
      <span class="cxa-live"><i></i><span class="cxa-ctx">Live</span> <b class="cxa-clock num"></b></span>
    </div>
    <div class="cxa-body" role="tabpanel" aria-live="off"></div>`;
  const body = root.querySelector('.cxa-body'), clockEl = root.querySelector('.cxa-clock');
  const VIEWS = { squad: squadView, player: playerView, season: seasonView, reports: reportsView };

  function render(keepScroll) {
    const y = body.scrollTop, popY = root.querySelector('.cxa-pop-b')?.scrollTop || 0;
    const alert = ui.alert && !ui.expand && (ui.view === 'squad' || ui.view === 'player') ? `<div class="cxa-alert" role="alert">${dot('head')}<b>Head impact · Rooney, header at ${fmtClock(ui.alertAt)}</b><span>Logged by the headset. Check at the next stop.</span><button class="cxa-text" data-close="1">Dismiss</button><button data-open="10" class="cxa-btn">Open Rooney</button></div>` : '';
    body.innerHTML = VIEWS[ui.view]() + pop() + alert;
    root.dataset.view = ui.view;
    root.querySelectorAll('[data-view]').forEach(b => b.setAttribute('aria-selected', b.dataset.view === ui.view));
    const past = ui.view === 'season' || ui.view === 'reports';
    root.querySelector('.cxa-ctx').textContent = past ? (ui.view === 'season' ? 'Season 2007–08' : 'Reports') : 'Live';
    root.querySelector('.cxa-sess').textContent = past ? 'CortX position and event data' : 'Session 2 · Small-sided games';
    clockEl.textContent = past ? '' : fmtClock(ui.clock);
    body.scrollTop = keepScroll ? y : 0;
    const pb = root.querySelector('.cxa-pop-b'); if (pb && keepScroll) pb.scrollTop = popY;
  }

  root.addEventListener('click', e => {
    const t = e.target.closest('button,[data-open],[data-close-pop]');
    if (!t || !root.contains(t)) return;
    const d = t.dataset;
    if (d.view) { ui.view = d.view; ui.expand = ''; }
    else if (d.open) { ui.player = +d.open; ui.view = 'player'; ui.expand = ''; if (+d.open === 10) ui.alert = false; }
    else if (d.expand) ui.expand = d.expand;
    else if (d.closePop) ui.expand = '';
    else if (d.mode) ui.mode = d.mode;
    else if (d.smode) ui.seasonMode = d.smode;
    else if (d.close) ui.alert = false;
    else if (d.confirm) ui.confirmed.add(+d.confirm);
    else if (d.dismiss) ui.dismissed.add(+d.dismiss);
    else if (d.send) ui.sent.add(d.send);
    else if (d.pick !== undefined) { ui.seasonPick = +d.pick === ui.seasonPick ? 0 : +d.pick; if (ui.expand === 'watch' || ui.expand === 'weeks') ui.expand = ''; }
    else return;
    render(!d.view && !d.open);
    if (d.expand) root.querySelector('.cxa-x')?.focus({ preventScroll: true });
    else if (d.closePop) root.querySelector('.cxa-body button')?.focus({ preventScroll: true });
    else if (d.view || d.open) root.querySelector(d.view ? `[data-view="${d.view}"]` : '.cxa-pl-nav button:last-child')?.focus({ preventScroll: true });
  });
  root.addEventListener('keydown', e => {
    if (e.key === 'Escape' && ui.expand) { ui.expand = ''; render(true); root.querySelector('.cxa-body button')?.focus({ preventScroll: true }); return; }
    const t = e.target.closest('[data-open][role="button"]');
    if (t && (e.key === 'Enter' || e.key === ' ')) { e.preventDefault(); t.dispatchEvent(new MouseEvent('click', { bubbles: true })); }
    const tab = e.target.closest('[role="tab"]');
    if (tab && (e.key === 'ArrowRight' || e.key === 'ArrowLeft')) {
      const tabs = [...root.querySelectorAll('[role="tab"]')], i = tabs.indexOf(tab);
      tabs[(i + (e.key === 'ArrowRight' ? 1 : tabs.length - 1)) % tabs.length].click();
    }
  });
  // season heat grid tooltip
  root.addEventListener('pointerover', e => {
    const c = e.target.closest('.cxa-hcells i'), tip = root.querySelector('.cxa-tip');
    if (!tip) return;
    if (!c) { tip.hidden = true; return; }
    const g = c.closest('.cxa-hgrid').getBoundingClientRect(), r = c.getBoundingClientRect();
    tip.textContent = c.dataset.tip; tip.hidden = false;
    tip.style.left = Math.min(g.width - 180, r.left - g.left) + 'px'; tip.style.top = (r.top - g.top - 34) + 'px';
  });
  root.addEventListener('pointerleave', () => { const tip = root.querySelector('.cxa-tip'); if (tip) tip.hidden = true; });

  /* ---------- live: values drift, the clock runs, only while on screen ---------- */
  let on = false, last = 0;
  function step(ts) {
    if (!on) return;
    if (ts - last > 1000) {
      last = ts; ui.clock++;
      if (!ui.alertDone && ui.clock >= 38 * 60 + 30) { ui.alertDone = ui.alert = true; ui.alertAt = ui.clock; byN[10].knocks.push([95, 36]); render(true); }
      if (ui.view === 'squad' || ui.view === 'player') clockEl.textContent = fmtClock(ui.clock);
      if (ui.clock % 3 === 0) {
        const r = Math.random;
        SQUAD.forEach(p => AX.forEach(a => { p.now[a.k] += (p.target[a.k] - p.now[a.k]) * .3 + (r() - .5) * 2.4; }));
        byN[18].target.f = Math.max(54, byN[18].target.f - .15);
        if ((ui.view === 'squad' || ui.view === 'player') && !ui.expand) {
          const a = document.activeElement, keyAttr = a && root.contains(a) && ['open', 'mode', 'view', 'pick', 'smode', 'expand'].find(k => a.dataset[k] !== undefined);
          const sel = keyAttr && `[data-${keyAttr}="${a.dataset[keyAttr]}"]`;
          render(true);
          if (sel) root.querySelector(sel)?.focus({ preventScroll: true });
        }
      }
    }
    requestAnimationFrame(step);
  }
  render();
  if (!reduce) new IntersectionObserver(es => { const was = on; on = es[0].isIntersecting; if (on && !was) requestAnimationFrame(step); }).observe(root);
})();
