/* portfolio.27 engine
   One page, many versions. Each project is a <section data-project>, each slide inside it
   has data-slide, data-base (base weight), data-skills (comma tags) and optional data-required.
   A profile (profiles/<id>.json) multiplies those weights for one studio.
   Every project comes in three versions: preview (4 cards: hero, hook, sketch, logo),
   overview, and full case study. data-tiers on a slide lists the versions it is in
   (missing = "overview full"); data-card marks the four preview cards.
   Open a version with  /#<id>  or  /?profile=<id>  (add &print=1 for the A4 layout,
   &version=preview|overview|full to force one version, &format=square for social squares). */
(function () {
  const params = new URLSearchParams(location.search);
  const RESERVED = ['top', 'gallery', 'about', 'contact'];
  const VERSIONS = ['preview', 'overview', 'full'];
  const CARDS = ['hero', 'hook', 'sketch', 'logo'];

  /* Which version of a project this viewer gets: URL, then the profile's per-project
     pick, then its default. Full case studies aren't built yet, so default is overview. */
  function versionFor(pid, profile) {
    const q = params.get('version');
    if (VERSIONS.includes(q)) return q;
    const v = profile.versions && profile.versions[pid];
    if (VERSIONS.includes(v)) return v;
    return VERSIONS.includes(profile.version) ? profile.version : 'overview';
  }
  function inVersion(slide, v) {
    return (slide.dataset.tiers || 'overview full').split(/[\s,]+/).includes(v);
  }

  function pickId() {
    if (params.get('profile')) return params.get('profile').toLowerCase();
    const h = decodeURIComponent(location.hash.slice(1)).toLowerCase();
    const isSection = h && document.querySelector('[data-project="' + h + '"], #' + CSS.escape(h));
    if (!h || RESERVED.includes(h) || isSection) return 'default';
    return h;
  }

  async function load(id) {
    try {
      const r = await fetch('profiles/' + id + '.json', { cache: 'no-store' });
      if (r.ok) return Object.assign({ id }, await r.json());
    } catch (e) { /* offline or file:// */ }
    return null;
  }

  /* The weightage thread owns this formula; keep the signature. */
  function score(slide, profile) {
    const base = parseFloat(slide.dataset.base || '1');
    const proj = slide.closest('[data-project]');
    const pid = proj ? proj.dataset.project : '';
    const pm = (profile.projects && profile.projects[pid] != null) ? profile.projects[pid] : 1;
    const tags = (slide.dataset.skills || '').split(',').map(s => s.trim()).filter(Boolean);
    const m = profile.multipliers || {};
    const mean = tags.length ? tags.reduce((a, t) => a + (m[t] != null ? m[t] : 1), 0) / tags.length : 1;
    return base * pm * mean;
  }

  function apply(profile) {
    const threshold = profile.threshold != null ? profile.threshold : 0.5;
    const projects = [...document.querySelectorAll('section[data-project]')];
    const totals = {};
    const square = params.get('format') === 'square';
    const versions = {};
    projects.forEach(sec => {
      let total = 0, shown = 0;
      const v = versionFor(sec.dataset.project, profile);
      sec.dataset.version = v; versions[sec.dataset.project] = v;
      sec.querySelectorAll('[data-slide]').forEach(sl => {
        const s = score(sl, profile);
        // the version is a hard filter; weights then cut inside it (required slides and
        // the four preview cards always stay)
        const fits = inVersion(sl, v) && (!square || sl.hasAttribute('data-card'));
        const keep = fits && (v === 'preview' || sl.hasAttribute('data-required') || s >= threshold);
        sl.dataset.score = s.toFixed(2);
        sl.classList.toggle('is-cut', !keep);
        if (keep) { total += s; shown++; }
      });
      const pw = profile.projects ? profile.projects[sec.dataset.project] : undefined;
      // data-draft = in the bank but no case study yet: hidden unless a profile asks for it
      const off = shown === 0 || pw === 0 || (sec.hasAttribute('data-draft') && !(pw > 0));
      sec.classList.toggle('is-cut', off);
      totals[sec.dataset.project] = off ? -1 : total;
    });
    const order = projects.slice().sort((a, b) => totals[b.dataset.project] - totals[a.dataset.project]);
    const anchor = document.getElementById('about');
    if (anchor) order.forEach(sec => anchor.parentNode.insertBefore(sec, anchor));
    order.forEach((sec, i) => { const n = sec.querySelector('[data-num]'); if (n) n.textContent = String(i + 1).padStart(2, '0'); });

    const nav = document.querySelector('header nav');
    if (nav) order.slice().reverse().forEach(sec => {
      const a = nav.querySelector('a[href="#' + sec.dataset.project + '"]');
      if (a) { a.hidden = sec.classList.contains('is-cut'); nav.insertBefore(a, nav.firstChild); }
    });
    // gallery: hide tiles of cut projects; the top project's wide tile leads
    const lead = order[0] && order[0].dataset.project;
    document.querySelectorAll('#gallery [data-for]').forEach(t => {
      const sec = document.querySelector('section[data-project="' + t.dataset.for + '"]');
      t.hidden = !sec || sec.classList.contains('is-cut');
      t.style.order = (t.dataset.for === lead && t.classList.contains('wide')) ? -1 : 0;
    });

    if (profile.voiceAgent === false) document.querySelectorAll('.stage').forEach(s => s.hidden = true);
    const prep = document.getElementById('prepared');
    if (prep && profile.greeting) { prep.textContent = profile.greeting; prep.classList.add('on'); }
    document.documentElement.dataset.profile = profile.id;
    if (square) document.documentElement.classList.add('fmt-square');
    window.PORTFOLIO = { profile, totals, versions, score, CARDS };
  }

  async function run() {
    const id = pickId();
    let profile = id === 'default' ? null : await load(id);
    if (!profile) {
      profile = (await load('default')) || { id: 'default' };
      if (id !== 'default') {
        // Unknown studio: open version plus the old "Prepared for" greeting.
        const name = id.replace(/[-_]+/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
        profile = Object.assign({}, profile, { id, name, greeting: 'Prepared for ' + name });
      }
    }
    window.STUDIO = profile.id === 'default' ? undefined : (profile.name || profile.id);
    apply(profile);
    if (params.get('print') === '1') document.documentElement.classList.add('print');
    document.dispatchEvent(new CustomEvent('portfolio:ready', { detail: window.PORTFOLIO }));
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', run); else run();
})();
