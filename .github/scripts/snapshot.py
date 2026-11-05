#!/usr/bin/env python3
"""Archive snapshots of the portfolio site.

  snapshot.py add <commit> "<title>" [--pr N]   copy the site at <commit> into archive/vN/
  snapshot.py index                              rebuild archive/index.html from versions.json

A snapshot is the site exactly as it was at that commit (index.html, img/,
avatar/ ...), plus a small "archived version" bar and a noindex tag. Text that
was later removed from the live site (see REDACT) is removed from snapshots too.
"""
import html, io, json, re, subprocess, sys, tarfile
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
ARCHIVE = ROOT / "archive"
MANIFEST = ARCHIVE / "versions.json"
SKIP = ("archive/", ".github/", "README.md", "CLAUDE.md", ".nojekyll", ".gitignore")
REPO_URL = "https://github.com/abkgpta/portfolio27"

# Removed from the live site in PR #1; never republish it through old snapshots.
REDACT = [
    (" student at UID Gandhinagar.", " student."),
    ("<b>Unitedworld Institute of Design</b>, Gandhinagar<br>B.Des (Hons.) Product Design, 2023 to 2027",
     "<b>B.Des (Hons.) Product Design</b><br>2023 to 2027"),
    ("Abhik Gupta, Dhawal Musale, Abhishek Vishwakarma", "Abhik Gupta"),
    ("Muesli &amp; Brothers: Abhik Gupta, Ansha Gawande, Dhawal Musale", "Muesli &amp; Brothers: Abhik Gupta, Ansha Gawande"),
]
FORBIDDEN = re.compile(r"karnavati|unitedworld|\bUID\b", re.I)


def git(*args, binary=False):
    out = subprocess.run(["git", *args], cwd=ROOT, check=True, capture_output=True).stdout
    return out if binary else out.decode().strip()


def load():
    return json.loads(MANIFEST.read_text()) if MANIFEST.exists() else []


def banner(v, entry, newest):
    note = "This is the latest archived version." if v == newest else f"Newer: v{newest}."
    return (
        '<div id="archive-bar" style="position:sticky;top:0;z-index:2147483647;display:flex;flex-wrap:wrap;'
        'gap:.4em 1.2em;align-items:center;padding:8px 16px;background:#0A0A0A;color:#F7F2EF;'
        "font:500 12px/1.4 'IBM Plex Mono',ui-monospace,monospace;letter-spacing:.02em\">"
        f'<span>Archived version v{v} &middot; {html.escape(entry["date"])} &middot; {html.escape(entry["title"])}</span>'
        f'<span style="opacity:.6">{note}</span>'
        '<span style="margin-left:auto;display:flex;gap:1.2em">'
        '<a href="../" style="color:#FF006A">All versions</a>'
        '<a href="../../" style="color:#FF006A">Live site</a></span></div>'
    )


def add(commit, title, pr=None):
    versions = load()
    sha = git("rev-parse", commit)
    if any(e["commit"] == sha for e in versions):
        print(f"{sha[:7]} is already archived")
        return
    if versions:
        site = ["--", ".", *[f":(exclude){x.rstrip('/')}" for x in SKIP]]
        if subprocess.run(["git", "diff", "--quiet", versions[-1]["commit"], sha, *site], cwd=ROOT).returncode == 0:
            print(f"site files unchanged since v{versions[-1]['v']}; nothing to archive")
            return
    v = max((e["v"] for e in versions), default=0) + 1
    date = git("log", "-1", "--format=%cd", "--date=short", sha)
    entry = {"v": v, "commit": sha, "date": date, "title": title, "pr": pr}
    dest = ARCHIVE / f"v{v}"
    dest.mkdir(parents=True)
    tar = tarfile.open(fileobj=io.BytesIO(git("archive", "--format=tar", sha, binary=True)))
    for m in tar.getmembers():
        if not m.isfile() or m.name.startswith(SKIP) or ".." in Path(m.name).parts:
            continue
        out = dest / m.name
        out.parent.mkdir(parents=True, exist_ok=True)
        data = tar.extractfile(m).read()
        if m.name.endswith(".html"):
            text = data.decode()
            for old, new in REDACT:
                text = text.replace(old, new)
            if FORBIDDEN.search(text):
                sys.exit(f"{m.name} at {sha[:7]} still names a removed institution; extend REDACT")
            text = text.replace("<head>", '<head>\n<meta name="robots" content="noindex">', 1)
            if m.name == "index.html":
                text = re.sub(r"(<body[^>]*>)", lambda b: b.group(1) + "\n" + banner(v, entry, v), text, count=1)
            data = text.encode()
        out.write_bytes(data)
    versions.append(entry)
    MANIFEST.write_text(json.dumps(versions, indent=2) + "\n")
    # Only the newest snapshot says "latest"; point the previous one forward.
    if v > 1:
        prev = ARCHIVE / f"v{v-1}" / "index.html"
        if prev.exists():
            prev.write_text(prev.read_text().replace("This is the latest archived version.", f"Newer: v{v}."))
    print(f"archived {sha[:7]} as v{v}")
    index()


def index():
    versions = sorted(load(), key=lambda e: -e["v"])
    rows = []
    for e in versions:
        pr = f' &middot; <a href="{REPO_URL}/pull/{e["pr"]}">PR #{e["pr"]}</a>' if e.get("pr") else ""
        rows.append(
            f'<li><a class="v" href="v{e["v"]}/">v{e["v"]}</a>'
            f'<div><a class="t" href="v{e["v"]}/">{html.escape(e["title"])}</a>'
            f'<small>{e["date"]} &middot; <a href="{REPO_URL}/commit/{e["commit"]}">{e["commit"][:7]}</a>{pr}</small></div></li>'
        )
    page = f"""<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex">
<title>portfolio.27 archive</title>
<link rel="icon" type="image/svg+xml" href="../img/favicon.svg">
<link href="https://fonts.googleapis.com/css2?family=IBM+Plex+Mono:wght@400;500&family=Michroma&display=swap" rel="stylesheet">
<style>
:root{{--pink:#FF006A;--cream:#F7F2EF;--ink:#0A0A0A;--muted:#5b5652;--line:rgba(10,10,10,.14)}}
*{{box-sizing:border-box;margin:0;padding:0}}
body{{background:var(--cream);color:var(--ink);font:400 15px/1.65 'IBM Plex Mono',ui-monospace,monospace;padding:clamp(32px,8vw,96px) 16px}}
main{{max-width:760px;margin:0 auto}}
h1{{font:400 clamp(24px,5vw,40px)/1.15 'Michroma',system-ui,sans-serif;margin-bottom:12px}}
p{{color:var(--muted);margin-bottom:40px}}
a{{color:inherit}}
ul{{list-style:none;border-top:1px solid var(--line)}}
li{{display:flex;gap:20px;align-items:baseline;padding:18px 0;border-bottom:1px solid var(--line)}}
.v{{font-family:'Michroma',system-ui,sans-serif;color:var(--pink);text-decoration:none;min-width:3.2em}}
.t{{display:block;text-decoration:none;font-weight:500}}
.t:hover{{color:var(--pink)}}
small{{color:var(--muted);font-size:12px}}
</style>
</head>
<body>
<main>
<h1>portfolio.27 archive</h1>
<p>Every released version of <a href="../">the site</a>, kept as it looked on the day. Newest first.</p>
<ul>
{chr(10).join(rows)}
</ul>
</main>
</body>
</html>
"""
    (ARCHIVE / "index.html").write_text(page)


if __name__ == "__main__":
    a = sys.argv[1:]
    if a[:1] == ["add"] and len(a) >= 3:
        pr = int(a[a.index("--pr") + 1]) if "--pr" in a else None
        add(a[1], a[2], pr)
    elif a[:1] == ["index"]:
        index()
    else:
        sys.exit(__doc__)
