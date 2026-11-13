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
    [1, 'Ward', 'GK', [7, 34], [4, 7], [72, 80, 84, 76], [70, 79, 81, 75], []],
    [2, 'Ito', 'RB', [36, 58], [12, 6], [75, 74, 80, 78], [73, 72, 74, 77], []],
    [4, 'Hale', 'CB', [26, 44], [9, 7], [78, 82, 80, 74], [77, 80, 76, 73], [[22, 40]]],
    [5, 'Mensah', 'CB', [26, 24], [9, 7], [80, 78, 82, 72], [78, 77, 78, 70], [[30, 22]]],
    [3, 'Duarte', 'LB', [36, 10], [12, 6], [84, 76, 78, 80], [83, 74, 73, 79], []],
    [6, 'Kovač', 'DM', [42, 34], [11, 9], [82, 80, 76, 82], [80, 79, 72, 80], []],
    [8, 'Okafor', 'CM', [54, 44], [15, 10], [74, 76, 78, 80], [58, 71, 66, 72], []],
    [14, 'Novak', 'CM', [54, 24], [15, 10], [76, 78, 80, 76], [72, 67, 74, 73], []],
    [10, 'Silva', 'AM', [67, 34], [13, 11], [86, 74, 80, 84], [85, 73, 77, 83], []],
    [7, 'Brandt', 'RW', [78, 58], [13, 6], [88, 72, 82, 80], [85, 70, 71, 78], []],
    [11, 'Achebe', 'LW', [78, 10], [13, 6], [78, 76, 80, 82], [77, 75, 76, 80], []],
    [9, 'Lund', 'ST', [89, 34], [9, 9], [76, 74, 78, 84], [74, 72, 74, 73], [[96, 30], [92, 40]]]
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
      if (p.n === 8 && x < 46) f -= late ? 14 : 6;   // No. 8 fades when tracking back
      if (p.n === 14 && y > 40) f -= 6;
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
      if (p.n === 8 && w >= 15) v -= (w - 14) * 5;
      if (p.n === 14 && w >= 16) v -= 4;
      out.push(Math.round(Math.max(45, Math.min(95, v))));
    }
    return [p.n, out];
  }));

  /* ---------- drawing helpers ---------- */
  const COL = { ok: 'var(--cxa-ok)', watch: 'var(--cxa-watch)', act: 'var(--cxa-act)' };
  const pt = (cx, cy, r, i, v) => { const a = -Math.PI / 2 + i * Math.PI / 2, k = r * v / 100; return [cx + Math.cos(a) * k, cy + Math.sin(a) * k]; };
  const poly = (o, cx, cy, r) => AX.map((a, i) => pt(cx, cy, r, i, o[a.k]).map(v => v.toFixed(1)).join(',')).join(' ');

  // the mind diagram: four axes, morning baseline dashed, now filled
  function glyph(p, big) {
    const s = big ? 360 : 96, c = s / 2, r = big ? 100 : 40, { state, worst } = read(p);
    let g = `<svg class="cxa-glyph${big ? ' big' : ''}" viewBox="0 0 ${s} ${s}" role="img" aria-label="${p.name}: ${AX.map(a => `${a.name} ${Math.round(p.now[a.k])} against ${p.base[a.k]} this morning`).join(', ')}">`;
    [50, 100].forEach(v => g += `<polygon points="${poly({ f: v, c: v, fr: v, r: v }, c, c, r)}" class="g-ring"/>`);
    AX.forEach((a, i) => { const [x, y] = pt(c, c, r, i, 100); g += `<line x1="${c}" y1="${c}" x2="${x.toFixed(1)}" y2="${y.toFixed(1)}" class="g-ax"/>`; });
    g += `<polygon points="${poly(p.base, c, c, r)}" class="g-base"/>`;
    g += `<polygon points="${poly(p.now, c, c, r)}" class="g-now" style="--sc:${COL[state]}"/>`;
    AX.forEach((a, i) => {
      const [x, y] = pt(c, c, r, i, p.now[a.k]), hit = state !== 'ok' && a.k === worst;
      g += `<circle cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="${big ? (hit ? 6 : 4) : (hit ? 3.6 : 2.2)}" class="g-dot${hit ? ' hit' : ''}" style="--sc:${COL[state]}"/>`;
      if (big) {
        const [lx, ly] = pt(c, c, r + 34, i, 100), anchor = i === 1 ? 'start' : i === 3 ? 'end' : 'middle';
        const ox = i === 1 ? -22 : i === 3 ? 22 : 0, d = Math.round(p.now[a.k] - p.base[a.k]);
        g += `<text x="${(lx + ox).toFixed(1)}" y="${(ly + (i === 0 ? -6 : i === 2 ? 4 : -4)).toFixed(1)}" text-anchor="${anchor}" class="g-lab">${a.name}</text>`;
        g += `<text x="${(lx + ox).toFixed(1)}" y="${(ly + (i === 0 ? 12 : i === 2 ? 22 : 14)).toFixed(1)}" text-anchor="${anchor}" class="g-val${hit ? ' hit' : ''}" style="--sc:${COL[state]}">${Math.round(p.now[a.k])} <tspan class="g-d">${d > 0 ? '+' : ''}${d}</tspan></text>`;
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
      ? `<div class="cxa-leg"><span>Focus low</span><i style="background:linear-gradient(90deg,${focusColour(52)},${focusColour(86)})"></i><span>high</span></div>`
      : `<div class="cxa-leg"><span>Less time</span><i style="background:linear-gradient(90deg,rgba(244,108,2,.1),#F46C02)"></i><span>more</span></div>`;
  }

  /* ---------- state ---------- */
  const ui = { dismissed: new Set(), confirmed: new Set(), view: 'squad', player: 8, mode: 'focus', seasonPick: 0, seasonMode: 'focus', clock: 38 * 60 + 12 };
  const fmtClock = s => `${pad(s / 60 | 0)}:${pad(s % 60)}`;

  /* ---------- views ---------- */
  function squadView() {
    const cards = [...SQUAD].sort((a, b) => read(b).drop - read(a).drop).map(p => {
      const { state, worst } = read(p), t = trend10(p);
      const head = state === 'ok' ? 'Matching this morning' : ADVICE[worst][0];
      return `<button class="cxa-card s-${state}" data-open="${p.n}" aria-label="Open ${p.name}, ${word(p)}">
        <span class="c-top"><b>${pad(p.n)}</b><span>${p.name}</span><em>${p.pos}</em></span>
        <span class="c-body">${glyph(p)}${mini(p)}</span><span class="c-read"><i>${word(p)} <span class="c-tick ${t <= -3 ? 'dn' : t >= 3 ? 'up' : ''}" title="Change over the last 10 minutes">${Math.abs(t) < 3 ? '▬' : (t < 0 ? '▼' : '▲') + Math.abs(t)}</span></i><span>${head}</span>${p.knocks.length ? `<span class="c-knock">${p.knocks.length} header${p.knocks.length > 1 ? 's' : ''}</span>` : ''}</span>
      </button>`;
    }).join('');
    const live = SQUAD.map((p, i) => {
      const t = ui.clock / 9 + i * 1.7, x = p.home[0] + Math.sin(t) * p.spread[0] * .35, y = p.home[1] + Math.cos(t * .8) * p.spread[1] * .35;
      return `<g class="p-pl s-${read(p).state}" data-open="${p.n}" tabindex="0" role="button" aria-label="${p.name}"><circle cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="3.4"/><text x="${x.toFixed(1)}" y="${(y + 1.3).toFixed(1)}" text-anchor="middle">${p.n}</text></g>`;
    }).join('');
    const flags = SQUAD.filter(p => read(p).state !== 'ok' && !ui.dismissed.has(p.n)).sort((a, b) => read(b).drop - read(a).drop).map(p => {
      const { state, worst, drop } = read(p);
      return `<button class="cxa-flag s-${state}" data-open="${p.n}"><i>${word(p)}${ui.confirmed.has(p.n) ? ' · confirmed' : ''}</i><b>No. ${p.n} · ${AX.find(a => a.k === worst).name} down ${Math.round(drop * 100)}%</b><span>${ADVICE[worst][1]}</span></button>`;
    }).join('');
    return `<div class="cxa-squad">
      <div class="cxa-cards">${cards}</div>
      <aside class="cxa-rail">
        <h4>On the pitch now</h4>
        <svg class="cxa-pitch live" viewBox="0 0 105 68" role="group" aria-label="Live positions, coloured by state">${PITCH}${live}</svg>
        <h4>Flags</h4>
        <div class="cxa-flags">${flags || '<p class="cxa-note">Nothing to flag right now.</p>'}
          ${SQUAD.filter(p => p.knocks.length).map(p => `<button class="cxa-flag s-head" data-open="${p.n}"><i>Head</i><b>No. ${p.n} · ${p.knocks.length} header${p.knocks.length > 1 ? 's' : ''}</b><span>Logged by the headset.</span></button>`).join('')}
        </div>
        <p class="cxa-note">CortX flags. The coach decides.</p>
      </aside>
    </div>`;
  }

  function lineChart(p) {
    const m = ui.clock / 60 | 0, v = sessionLine(p, m), W = 560, H = 300, L = 30, B = 22;
    const x = i => L + i / Math.max(1, m) * (W - L - 8), y = val => 8 + (1 - (val - 40) / 55) * (H - B - 8);
    const avgB = (p.base.f + p.base.c + p.base.fr + p.base.r) / 4;
    const path = v.map((val, i) => `${i ? 'L' : 'M'}${x(i).toFixed(1)},${y(val).toFixed(1)}`).join('');
    const st = read(p).state;
    let g = `<svg class="cxa-line" viewBox="0 0 ${W} ${H}" role="img" aria-label="Overall readiness through the session, now ${Math.round(v[v.length - 1])} against a baseline of ${Math.round(avgB)}">`;
    [50, 70, 90].forEach(t => g += `<line x1="${L}" x2="${W - 8}" y1="${y(t)}" y2="${y(t)}" class="l-grid"/><text x="${L - 6}" y="${y(t) + 4}" text-anchor="end" class="l-ax">${t}</text>`);
    [0, 15, 30].forEach(t => t <= m && (g += `<text x="${x(t)}" y="${H - 4}" text-anchor="middle" class="l-ax">${t}′</text>`));
    g += `<text x="${x(m)}" y="${H - 4}" text-anchor="end" class="l-ax">${m}′</text>`;
    DRILLS.forEach(([t, name]) => t <= m && (g += `<line x1="${x(t)}" x2="${x(t)}" y1="8" y2="${H - B}" class="l-drill"/><text x="${x(t) + 4}" y="18" class="l-ax">${name}</text>`));
    g += `<line x1="${L}" x2="${W - 8}" y1="${y(avgB)}" y2="${y(avgB)}" class="l-base"/><text x="${W - 8}" y="${y(avgB) - 6}" text-anchor="end" class="l-ax">This morning</text>`;
    g += `<path d="${path}L${x(m)},${H - B}L${L},${H - B}Z" class="l-area" style="--sc:${COL[st]}"/><path d="${path}" class="l-path" style="--sc:${COL[st]}"/>`;
    g += `<circle cx="${x(m)}" cy="${y(v[m])}" r="4" class="l-now" style="--sc:${COL[st]}"/>`;
    return g + '</svg>';
  }

  function playerView() {
    const p = byN[ui.player], { state, worst, drop } = read(p), i = SQUAD.indexOf(p);
    const prev = SQUAD[(i + SQUAD.length - 1) % SQUAD.length], next = SQUAD[(i + 1) % SQUAD.length];
    const adv = state === 'ok' ? ['Matching this morning', 'Every reading is within 10% of the morning check.', 'Nothing to do.'] : ADVICE[worst];
    return `<div class="cxa-player">
      <div class="cxa-pl-id">
        <div class="cxa-pl-nav"><button data-open="${prev.n}" aria-label="Previous player, ${prev.name}">←</button><span>${i + 1} of ${SQUAD.length}</span><button data-open="${next.n}" aria-label="Next player, ${next.name}">→</button></div>
        <p class="cxa-eyebrow">${p.pos} · Session 2</p>
        <h4 class="cxa-num">${pad(p.n)} <span>${p.name}</span></h4>
        ${glyph(p, true)}
        <div class="cxa-key"><span><i class="k-now" style="--sc:${COL[state]}"></i>Now</span><span><i class="k-base"></i>This morning</span></div>
      </div>
      <div class="cxa-pl-main">
        <div class="cxa-insight s-${state}"><i>${word(p)}${state !== 'ok' ? ` · ${AX.find(a => a.k === worst).name} down ${Math.round(drop * 100)}%` : ''}</i><b>${adv[0]}</b><p>${adv[1]}</p><p class="next">${adv[2]}</p>${state === 'ok' ? '' : ui.dismissed.has(p.n) ? '<p class="cxa-note">Dismissed. CortX will learn from it.</p>' : ui.confirmed.has(p.n) ? '<p class="cxa-note">Confirmed. Saved to the session notes.</p>' : `<div class="cxa-acts"><button class="cxa-btn" data-confirm="${p.n}">Confirm</button><button class="cxa-chip" data-dismiss="${p.n}">Dismiss</button></div>`}</div>
        <div class="cxa-panel"><div class="cxa-ph"><h5>Readiness this session</h5><span class="cxa-note">All four, as one line</span></div>${lineChart(p)}</div>
        <div class="cxa-panel"><div class="cxa-ph"><h5>Where on the pitch</h5>
          <div class="cxa-seg" role="group" aria-label="Pitch map shows"><button data-mode="focus" aria-pressed="${ui.mode === 'focus'}">Focus</button><button data-mode="time" aria-pressed="${ui.mode === 'time'}">Time</button></div></div>
          ${heat(SESSION[p.n], ui.mode, p.knocks)}
          <div class="cxa-foot">${legend(ui.mode)}${p.knocks.length ? '<span class="cxa-note"><b class="kn">H</b> header</span>' : ''}</div>
        </div>
      </div>
    </div>`;
  }

  function seasonView() {
    const pick = ui.seasonPick ? byN[ui.seasonPick] : null;
    const pts = pick ? SEASON[pick.n] : SQUAD.flatMap(p => SEASON[p.n]);
    const watch = SQUAD.map(p => { const w = WEEKLY[p.n]; return { p, f: w[WEEKS - 1], d: w[WEEKS - 1] - w[WEEKS - 4] }; }).sort((a, b) => a.d - b.d).slice(0, 7);
    const cw = 100 / WEEKS;
    const rows = SQUAD.map(p => `<div class="cxa-hrow${ui.seasonPick === p.n ? ' on' : ''}"><button data-pick="${p.n}">${pad(p.n)} ${p.name}</button><div class="cxa-hcells">${WEEKLY[p.n].map((v, w) => `<i data-tip="${pad(p.n)} ${p.name} · W${w + 1} · focus ${v}" style="--o:${(Math.max(0, v - 50) / 42).toFixed(2)}"></i>`).join('')}</div></div>`).join('');
    return `<div class="cxa-season">
      <div class="cxa-kpis">
        <div><i>Squad focus, match days</i><b>76</b><span>+9 since July</span></div>
        <div><i>Late-game decision drop</i><b>−11%</b><span>was −24% in July</span></div>
        <div><i>Fatigue flags per session</i><b>1.8</b><span>was 4.1</span></div>
        <div><i>Wear compliance</i><b>94%</b><span>112 of 119 sessions</span></div>
      </div>
      <div class="cxa-srow">
        <div class="cxa-panel"><div class="cxa-ph"><h5>Watch list</h5><span class="cxa-note">Focus, last 3 weeks</span></div>
          <table class="cxa-table"><thead><tr><th>Player</th><th>Pos</th><th>Focus</th><th>Trend</th></tr></thead><tbody>
          ${watch.map(({ p, f, d }) => `<tr class="${ui.seasonPick === p.n ? 'on' : ''}"><td><button data-pick="${p.n}">${pad(p.n)} ${p.name}</button></td><td>${p.pos}</td><td>${f}</td><td class="${d < 0 ? 'dn' : 'up'}">${d < 0 ? '▼' : '▲'} ${Math.abs(d)}</td></tr>`).join('')}
          </tbody></table>
          ${pick ? `<button class="cxa-btn" data-open="${pick.n}">Open ${pick.name} live</button>` : '<p class="cxa-note">Pick a player to see where their focus drops.</p>'}
        </div>
        <div class="cxa-panel"><div class="cxa-ph"><h5>${pick ? `Where ${pick.name}’s focus drops` : 'Where the squad’s focus drops'}</h5>
          <div class="cxa-seg" role="group" aria-label="Pitch map shows"><button data-smode="focus" aria-pressed="${ui.seasonMode === 'focus'}">Focus</button><button data-smode="time" aria-pressed="${ui.seasonMode === 'time'}">Time</button></div></div>
          ${heat(pts, ui.seasonMode)}
          <div class="cxa-foot">${legend(ui.seasonMode)}${pick ? '<button class="cxa-chip" data-pick="0">Whole squad</button>' : ''}</div>
        </div>
      </div>
      <div class="cxa-panel"><div class="cxa-ph"><h5>Focus by player and week</h5><span class="cxa-note">Jul 7 to Nov 9 · tap a name</span></div>
        <div class="cxa-hgrid">${rows}<div class="cxa-hrow ax"><span></span><div class="cxa-hcells">${Array.from({ length: WEEKS }, (_, w) => `<b>${w % 3 === 0 ? 'W' + (w + 1) : ''}</b>`).join('')}</div></div><div class="cxa-tip" hidden></div></div>
      </div>
    </div>`;
  }

  /* ---------- shell ---------- */
  root.innerHTML = `<div class="cxa-bar">
      <img src="img/cx-logo-void.png" alt="CortX" width="351" height="107" class="cxa-logo">
      <div class="cxa-tabs" role="tablist" aria-label="App views">
        <button role="tab" data-view="squad">Squad</button><button role="tab" data-view="player">Player</button><button role="tab" data-view="season">Season</button>
      </div>
      <span class="cxa-live"><i></i><span class="cxa-ctx">Live</span> <b class="cxa-clock"></b></span>
      <span class="cxa-sess">Session 2 · Small-sided games</span>
    </div>
    <div class="cxa-body" role="tabpanel" aria-live="off"></div>`;
  const body = root.querySelector('.cxa-body'), clockEl = root.querySelector('.cxa-clock');

  function render(keepScroll) {
    const y = body.scrollTop;
    const alert = ui.alert && ui.view !== 'season' ? `<div class="cxa-alert" role="alert"><i>Head impact</i><b>No. 9 Lund · header at ${fmtClock(ui.alertAt)}</b><span>Above the impact threshold. Check at the next stop.</span><button data-open="9" class="cxa-btn">Open Lund</button><button class="cxa-chip" data-close="1">Dismiss</button></div>` : '';
    body.innerHTML = alert + (ui.view === 'squad' ? squadView() : ui.view === 'player' ? playerView() : seasonView());
    root.dataset.view = ui.view;
    root.querySelectorAll('[data-view]').forEach(b => b.setAttribute('aria-selected', b.dataset.view === ui.view));
    root.querySelector('.cxa-ctx').textContent = ui.view === 'season' ? 'Season 2026/27' : 'Live';
    root.querySelector('.cxa-sess').textContent = ui.view === 'season' ? 'First team · 18 weeks · Catapult and event data joined' : 'Session 2 · Small-sided games';
    clockEl.textContent = ui.view === 'season' ? '' : fmtClock(ui.clock);
    if (keepScroll) body.scrollTop = y;
  }

  root.addEventListener('click', e => {
    const t = e.target.closest('button,[data-open]');
    if (!t || !root.contains(t)) return;
    const d = t.dataset;
    if (d.view) ui.view = d.view;
    else if (d.open) { ui.player = +d.open; ui.view = 'player'; if (+d.open === 9) ui.alert = false; }
    else if (d.mode) ui.mode = d.mode;
    else if (d.smode) ui.seasonMode = d.smode;
    else if (d.close) ui.alert = false;
    else if (d.confirm) ui.confirmed.add(+d.confirm);
    else if (d.dismiss) ui.dismissed.add(+d.dismiss);
    else if (d.pick !== undefined) ui.seasonPick = +d.pick === ui.seasonPick ? 0 : +d.pick;
    else return;
    render(!d.view && !d.open);
    if (d.view || d.open) root.querySelector(d.view ? `[data-view="${d.view}"]` : '.cxa-pl-nav button:last-child')?.focus({ preventScroll: true });
  });
  root.addEventListener('keydown', e => {
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
      if (!ui.alertDone && ui.clock >= 38 * 60 + 30) { ui.alertDone = ui.alert = true; ui.alertAt = ui.clock; byN[9].knocks.push([95, 36]); render(true); }
      if (ui.view !== 'season') clockEl.textContent = fmtClock(ui.clock);
      if (ui.clock % 3 === 0) {
        const r = Math.random;
        SQUAD.forEach(p => AX.forEach(a => { p.now[a.k] += (p.target[a.k] - p.now[a.k]) * .3 + (r() - .5) * 2.4; }));
        byN[8].target.f = Math.max(54, byN[8].target.f - .15);
        if (ui.view !== 'season') {
          const a = document.activeElement, keyAttr = a && root.contains(a) && ['open', 'mode', 'view', 'pick', 'smode'].find(k => a.dataset[k] !== undefined);
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
