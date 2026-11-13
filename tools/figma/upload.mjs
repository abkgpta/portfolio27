// POST snapshot images to the upload URLs that Figma's upload_assets returned.
//
// 1. Map the `images` lists that the use_figma build scripts returned to asset files:
//      node tools/figma/upload.mjs map phone out/figma/images-phone.json
//    images-<viewport>.json = the returned lists concatenated: [[nodeId, assetIndex, ...], ...]
//    Writes out/figma/upload-<viewport>.json = [[nodeId, file, mime], ...] and prints the node ids to pass
//    to upload_assets (60 per call, ALWAYS with currentPageId = the website page id, or the fills
//    silently do not apply).
// 2. Post the files:
//      node tools/figma/upload.mjs out/figma/upload-phone.json out/figma/urls.txt
//    urls.txt = lines of "<nodeId> <full submitUrl>" copied from the upload_assets result.
import { readFile, writeFile } from 'node:fs/promises';
import { join, dirname } from 'node:path';

if (process.argv[2] === 'map') {
  const [, vp, listFile] = process.argv.slice(2);
  const dir = dirname(listFile);
  const assets = JSON.parse(await readFile(join(dir, 'calls', 'plan.json'), 'utf8')).assets[vp];
  const out = [];
  for (const [node, idx] of JSON.parse(await readFile(listFile, 'utf8'))) {
    const a = assets[idx];
    if (a) out.push([node, a.file, a.type]); else console.warn('no asset', node, idx);
  }
  await writeFile(join(dir, `upload-${vp}.json`), JSON.stringify(out));
  console.log(out.length, 'images. Node ids in batches of 60:');
  for (let i = 0; i < out.length; i += 60) console.log(JSON.stringify(out.slice(i, i + 60).map(o => o[0])));
  process.exit(0);
}

const [mapFile, urlFile] = process.argv.slice(2);
const map = new Map(JSON.parse(await readFile(mapFile, 'utf8')).map(([n, f, t]) => [n, { f, t }]));
const dir = join(dirname(mapFile), 'assets');
const lines = (await readFile(urlFile, 'utf8')).trim().split('\n').map(l => l.trim().split(/\s+/));
let ok = 0;
await Promise.all(lines.map(async ([node, url]) => {
  const m = map.get(node); if (!m) return console.warn('no asset for', node);
  if (!url.startsWith('http')) url = `https://mcp.figma.com/mcp/upload/${url}/submit?scaleMode=FILL`;
  const fd = new FormData();
  fd.append('file', new Blob([await readFile(join(dir, m.f))], { type: m.t }), m.f);
  for (let i = 0; i < 3; i++) {
    const r = await fetch(url, { method: 'POST', body: fd }).catch(e => ({ ok: false, status: e.message }));
    if (r.ok) { ok++; return; }
    if (i === 2) console.warn('failed', node, r.status, r.text ? (await r.text()).slice(0, 200) : '');
  }
}));
console.log('uploaded', ok, 'of', lines.length);
