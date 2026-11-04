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

## Printable PDF (A4 landscape)

`css/print.css` turns any version into A4 landscape pages: 10 mm margins, one project per run of pages, and the gallery as a contact sheet. The 3D viewer becomes its still image, the voice agent becomes a printed pointer to the site, and Spotify embeds and animations are dropped.

```
node tools/export-pdf.mjs default vitra   # writes out/default.pdf, out/vitra.pdf
```

The export needs Node and Playwright (`npm i playwright`, then `npx playwright install chromium`). `out/` is git-ignored.
