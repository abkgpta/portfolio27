# portfolio27

Abhik Gupta's industrial design portfolio (portfolio.27), served at https://abkgpta.github.io/portfolio27/

**Under construction.** DASH, more projects and the live voice agent are still being built.

Plain HTML, no build step. Edit `index.html`, push to `main`, and GitHub Pages serves it.

- Voice agent: paste the Blue Machines embed into `#voice-agent-mount`, then set `AGENT_READY = true`.
- Playlists: each project's Spotify playlist link lives in `PLAYLISTS` near the bottom of `index.html`.

## Versions per studio (modular portfolio)

One page, many versions. The content stays in `index.html`; `js/engine.js` decides what each viewer sees.

- **Projects** are `<section data-project="id" data-type="concept|industry|misc">`. Add `data-draft` to keep a project in the bank but hidden until a profile asks for it (Evoluir, Goodknocks, nnode and Miscellaneous are drafts for now).
- **Slides** inside a project carry `data-slide="id"`, `data-base` (base weight), `data-skills="cmf,rendering,…"` and optionally `data-required` (never cut).
- **Profiles** live in `profiles/<id>.json`: `name`, `greeting`, `multipliers` (skill → number), `projects` (project → number, 0 hides it), `threshold` (slides scoring below it are cut) and `voiceAgent`. `profiles/default.json` is the open version; `profiles/_example-studio.json` shows every field.
- **Scoring** is one function, `score()` in `js/engine.js`: base × project multiplier × mean of the slide's skill multipliers. Projects are ordered by their total score, and the nav and gallery follow.
- **Open a version:** `/#<id>` or `/?profile=<id>`. An unknown `#name` falls back to the open version with "Prepared for Name".

### Preview, overview, full case study

Every project comes in three lengths. Full has every card, overview has the cards that explain the project (visual heavy, some process), and preview is a four-card hook.

- `data-tiers="preview overview full"` on a slide lists the versions it belongs to. A slide without it is in overview and full.
- `data-card="hero|hook|sketch|logo"` marks the four preview cards: hero visual, written hook, stylised sketch, logo lockup.
- Inside a card, `data-len="short"` shows only in the preview and `data-len="long"` only in overview and full. A card without a short part shows everything in every version.
- A profile picks the version with `version` (default for every project, `overview` if unset) and `versions` (per project, e.g. `{"cortx": "preview"}`). `?version=preview` forces one version for the whole page.
- The version filters first, then the weights cut inside it. Preview cards are never cut by weight.
- Only previews and overviews are built for now, so the open version shows overviews.

### Square cards

`?format=square` shows only the preview cards, each as a 1080 × 1080 tile, for socials and the intro gallery.

```
node tools/export-pdf.mjs default --squares            # out/default-squares/<project>-<n>-<card>.png
node tools/export-pdf.mjs default --version=preview    # out/default-preview.pdf, the A4 preview
```

## Printable PDF (A4 landscape)

`css/print.css` turns any version into A4 landscape pages: 10 mm margins, one project per run of pages, and the gallery as a contact sheet. The 3D viewer becomes its still image, the voice agent becomes a printed pointer to the site, and Spotify embeds and animations are dropped.

```
node tools/export-pdf.mjs default vitra   # writes out/default.pdf, out/vitra.pdf
```

The export needs Node and Playwright (`npm i playwright`, then `npx playwright install chromium`). `out/` is git-ignored.
