# portfolio27

Abhik Gupta's industrial design portfolio (portfolio.27), served at https://abkgpta.github.io/portfolio27/

**Under construction.** DASH, more projects and the live voice agent are still being built.

Plain HTML, no build step. Edit `index.html`, push to `main`, and GitHub Pages serves it.

- Voice agent: paste the Blue Machines embed into `#voice-agent-mount`, then set `AGENT_READY = true`.
- Playlists: each project's Spotify playlist link lives in `PLAYLISTS` near the bottom of `index.html`.

## Archive

Every released version is kept at https://abkgpta.github.io/portfolio27/archive/ (one folder per version, `archive/vN/`, tagged `vN` in git). After each push to `main` that changes the site, the `Archive site version` workflow copies the site into the next `archive/vN/` and tags it. Run `python3 .github/scripts/snapshot.py add <commit> "<title>"` to archive one by hand. Snapshots get a noindex tag, a small "archived version" bar, and the same redactions as the live site (see `REDACT` in the script).
