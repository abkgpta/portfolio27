#!/usr/bin/env python3
"""portfolio.27 weightage: turns the GUNJ studio research into per-studio weights.

    python3 tools/weightage/build.py                      # all 200 studios -> private weights file
    python3 tools/weightage/build.py --publish wave1      # also write profiles/<slug>.json for wave 1
    python3 tools/weightage/build.py --publish GUNJ-002 braun
    python3 tools/weightage/build.py --overrides tuner.json --apply-base

How a studio's numbers are made (defaults agreed in the "Portfolio weightage: 7 questions" doc):
  1. Skill demand. Each of the 12 slide tags (skills.py) is counted in the studio's research
     text (roles, tools, design language, recent work, portfolio asks). The count is compared
     with the average over all studios, ratio = (hits + 0.5) / (mean + 0.5), then centred on
     the studio's own average ratio (geometric mean), so a studio with thin research isn't
     pushed down across the board. multiplier = sqrt(ratio / centre), clamped to 0.5x..2x,
     rounded to 0.05. Twice the studio's usual emphasis gives ~1.4x, four times gives 2x.
  2. Lead project. The research's lead project gets 1.25x and is never cut by the budget.
     A lead with no case study yet (DASH today) hands the lead to whichever finished project
     the studio's skill multipliers favour.
  3. Studio type. Consultancies and brand studios get industryBoost 1.2 on industry projects
     (Evoluir, goodknocks, nnode). Those stay hidden (0) until their slides exist.
  4. Budget. Non-lead projects keep at most 12 site slides / 6 PDF pages: the best scores,
     plus cover, hero and hook, which always stay.
  5. Overrides from the tuner win over all of the above and survive a re-run.

Everything for 200 studios stays private in the project files (studio names are not
published). Only --publish writes into profiles/, which GitHub Pages serves publicly.
"""
import argparse, csv, datetime, json, math, os, re, sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
REPO = HERE.parent.parent
sys.path.insert(0, str(HERE))
from skills import SKILLS  # noqa: E402

GUNJ = Path('/mnt/project-files/applications/batch1-GUNJ')
OUT = Path('/mnt/project-files/applications/weightage')
FIELDS = ['roles_advertised', 'skills_tools', 'design_language', 'what_they_do', 'recent_projects',
          'portfolio_angle', 'pitch_proof', 'personalisation_hooks', 'usp_v3', 'usp',
          'portfolio_requirements', 'vision', 'pitch_lead_with', 'internship_programme']
CONCEPT = ['overgrwth', 'cortx', 'dash']
INDUSTRY = ['evoluir', 'goodknocks', 'nnode']
READY = ['overgrwth', 'cortx']          # projects with a real case study on the site today
INDUSTRY_READY = []                       # add an id here once its slides exist
LEAD_BOOST = 1.25
INDUSTRY_BOOST = 1.2
BUDGET = {'site': 12, 'pdf': 6}
THRESHOLD = 0.5
CONSULTANCY_TYPES = {'consultancy', 'design/innovation firm', 'brand', 'ux/design consultancy',
                     'in-house consultancy', 'brand/studio'}


def slugify(name):
    s = re.sub(r'[^a-z0-9]+', '-', name.lower().replace('&', 'and')).strip('-')
    return s or 'studio'


def research_text(r):
    out = []
    for f in FIELDS:
        v = r.get(f)
        if isinstance(v, list):
            out += [str(x) for x in v]
        elif v:
            out.append(str(v))
    return ' ' + ' '.join(out).lower() + ' '


def kw_pattern(w):
    # short tokens (ui, cad, nx, ux) must stand alone; longer ones may be word starts (render -> rendering)
    tail = r'(?![a-z])' if len(w.strip()) <= 3 else ''
    return re.compile(r'(?<![a-z])' + re.escape(w.strip()) + tail)


PATTERNS = {k: [(w, kw_pattern(w)) for w in kws] for k, kws in SKILLS.items()}


def demand(text):
    hits, evidence = {}, {}
    for k, pats in PATTERNS.items():
        n, ev = 0, {}
        for w, p in pats:
            c = len(p.findall(text))
            if c:
                n += c
                ev[w.strip()] = c
        hits[k] = n
        evidence[k] = sorted(ev, key=lambda w: -ev[w])[:4]
    return hits, evidence


def rnd(x, step=0.05):
    return round(round(x / step) * step, 2)


def manifest():
    """Every slide in the site and the PDF, with what the engine scores it on."""
    try:
        from bs4 import BeautifulSoup
    except ImportError:
        sys.exit('needs beautifulsoup4 (pip install beautifulsoup4)')
    out = {}
    for layout, f in (('site', 'index.html'), ('pdf', 'pdf/index.html')):
        soup = BeautifulSoup((REPO / f).read_text(), 'html.parser')
        rows = []
        for sec in soup.select('section[data-project]'):
            for sl in sec.select('[data-slide]'):
                h = sl.find(['h1', 'h2', 'h3', 'h4'])
                title = ' '.join((h.get_text(' ') if h else '').split())[:70]
                rows.append({
                    'project': sec['data-project'], 'type': sec.get('data-type', 'concept'),
                    'draft': sec.has_attr('data-draft'),
                    'slide': sl['data-slide'], 'title': title,
                    'base': float(sl.get('data-base', '1')),
                    'skills': [t.strip() for t in (sl.get('data-skills') or '').split(',') if t.strip()],
                    'tiers': (sl.get('data-tiers') or 'overview full').split(),
                    'card': sl.get('data-card'), 'required': sl.has_attr('data-required'),
                })
        out[layout] = rows
    return out


def affinity(pid, mult, slides):
    rows = [s for s in slides if s['project'] == pid and 'overview' in s['tiers']]
    vals = [mult.get(t, 1) for s in rows for t in s['skills']]
    return sum(vals) / len(vals) if vals else 1


def build(overrides):
    research = json.loads((GUNJ / 'research-v3.json').read_text())
    targets = {r['ID']: r for r in csv.DictReader(open(GUNJ / 'targets.csv'))}
    man = manifest()
    texts = {r['id']: research_text(r) for r in research}
    all_hits = {i: demand(t) for i, t in texts.items()}
    mean = {k: sum(h[0][k] for h in all_hits.values()) / len(all_hits) for k in SKILLS}
    studios = []
    for r in research:
        sid = r['id']
        t = targets.get(sid, {})
        hits, ev = all_hits[sid]
        ratio = {k: (hits[k] + 0.5) / (mean[k] + 0.5) for k in SKILLS}
        # centre on the studio's own average, so thin research doesn't push every slide down
        g = math.exp(sum(math.log(v) for v in ratio.values()) / len(ratio))
        mult = {k: rnd(min(2.0, max(0.5, math.sqrt(ratio[k] / g)))) for k in SKILLS}
        stype = (t.get('Type') or '').strip()
        lead_research = (t.get('Lead project') or '').strip().lower() or None
        lead = lead_research if lead_research in READY else max(READY, key=lambda p: affinity(p, mult, man['site']))
        projects = {p: 1.0 for p in CONCEPT}
        projects[lead] = LEAD_BOOST
        boost = INDUSTRY_BOOST if stype.lower() in CONSULTANCY_TYPES else 1.0
        for p in INDUSTRY:
            projects[p] = boost if p in INDUSTRY_READY else 0
        projects['misc'] = 0
        st = {
            'id': sid, 'studio': r.get('studio') or t.get('Studio'), 'slug': slugify(r.get('studio') or t.get('Studio') or sid),
            'country': t.get('Country'), 'city': t.get('City'), 'type': stype, 'priority': t.get('Priority'),
            'wave1': bool(r.get('wave1')), 'confidence': r.get('v3_confidence') or r.get('confidence'),
            'leadResearch': lead_research, 'lead': lead, 'industryBoost': boost,
            'hits': hits, 'evidence': ev, 'multipliers': mult, 'projects': projects,
            'budget': dict(BUDGET), 'threshold': THRESHOLD, 'overridden': [],
        }
        o = overrides.get(sid) or {}
        for key in ('multipliers', 'projects'):
            for k, v in (o.get(key) or {}).items():
                st[key][k] = v
                st['overridden'].append(f'{key}.{k}')
        for key in ('lead', 'budget', 'threshold'):
            if key in o:
                st[key] = o[key]
                st['overridden'].append(key)
        if 'lead' in o:
            st['projects'] = {p: (LEAD_BOOST if p == st['lead'] and v == 1.0 else v) for p, v in st['projects'].items()}
        studios.append(st)
    return {'generated': datetime.date.today().isoformat(), 'mean': {k: round(v, 2) for k, v in mean.items()},
            'defaults': {'leadBoost': LEAD_BOOST, 'industryBoost': INDUSTRY_BOOST, 'budget': BUDGET,
                         'threshold': THRESHOLD, 'range': [0.5, 2.0], 'ready': READY},
            'base': overrides.get('_base', {}), 'studios': studios}, man


def wave1_files():
    """Existing hand-made wave 1 profiles, keyed by GUNJ id."""
    out = {}
    for f in (REPO / 'profiles').glob('*.json'):
        try:
            d = json.loads(f.read_text())
        except ValueError:
            continue
        if d.get('gunj'):
            out[d['gunj']] = f
    return out


def publish(data, picks):
    existing = wave1_files()
    by_id = {s['id']: s for s in data['studios']}
    by_slug = {s['slug']: s for s in data['studios']}
    chosen = []
    for p in picks:
        if p == 'wave1':
            chosen += [by_id[i] for i in existing if i in by_id]
        elif p.upper() in by_id:
            chosen.append(by_id[p.upper()])
        elif p in by_slug:
            chosen.append(by_slug[p])
        else:
            f = REPO / 'profiles' / (p + '.json')
            gid = json.loads(f.read_text()).get('gunj') if f.exists() else None
            if gid in by_id:
                chosen.append(by_id[gid])
            else:
                print('skip: no studio called', p)
    for s in chosen:
        f = existing.get(s['id']) or REPO / 'profiles' / (s['slug'] + '.json')
        prof = json.loads(f.read_text()) if f.exists() else {
            'name': s['studio'], 'gunj': s['id'], 'greeting': 'Prepared for ' + s['studio'],
            'voiceAgent': True, 'version': 'overview', 'versions': {}}
        prof.update({'threshold': s['threshold'], 'lead': s['lead'], 'budget': s['budget'],
                     'multipliers': {k: v for k, v in s['multipliers'].items() if v != 1.0},
                     'projects': s['projects'],
                     'weights': {'source': 'tools/weightage/build.py', 'generated': data['generated'],
                                 'overridden': s['overridden']}})
        prof.pop('order', None)
        f.write_text(json.dumps(prof, indent=2, ensure_ascii=False) + '\n')
        print('wrote', f.relative_to(REPO))


def apply_base(base):
    for f in ('index.html', 'pdf/index.html'):
        p = REPO / f
        s = p.read_text()
        for slide, val in base.items():
            s = re.sub(r'(<[^>]*data-slide="%s"[^>]*?data-base=")[^"]*(")' % re.escape(slide),
                       lambda m: m.group(1) + str(val) + m.group(2), s)
        p.write_text(s)
    print('base weights applied:', len(base))


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument('--overrides', help='tuner export (JSON): {GUNJ-id: {multipliers, projects, lead, budget}, _base: {slide: n}}')
    ap.add_argument('--publish', nargs='*', default=[], help='wave1, GUNJ ids or slugs to write into profiles/')
    ap.add_argument('--apply-base', action='store_true', help='write the tuner base weights into the site and PDF markup')
    ap.add_argument('--out', default=str(OUT))
    a = ap.parse_args()
    overrides = json.loads(Path(a.overrides).read_text()) if a.overrides else {}
    data, man = build(overrides)
    out = Path(a.out)
    out.mkdir(parents=True, exist_ok=True)
    (out / 'weights-v1.json').write_text(json.dumps(data, indent=1, ensure_ascii=False))
    (out / 'slides-v1.json').write_text(json.dumps(man, indent=1, ensure_ascii=False))
    with open(out / 'weights-v1.csv', 'w', newline='') as fh:
        w = csv.writer(fh)
        w.writerow(['ID', 'Studio', 'Country', 'Type', 'Lead (research)', 'Lead used'] + list(SKILLS))
        for s in data['studios']:
            w.writerow([s['id'], s['studio'], s['country'], s['type'], s['leadResearch'], s['lead']] + [s['multipliers'][k] for k in SKILLS])
    print('wrote', out / 'weights-v1.json', len(data['studios']), 'studios')
    if a.apply_base and data['base']:
        apply_base(data['base'])
    if a.publish:
        publish(data, a.publish)


if __name__ == '__main__':
    main()
