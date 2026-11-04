// Export any portfolio version, as a printable A4 landscape PDF or as square cards.
//   node tools/export-pdf.mjs                           -> out/default.pdf
//   node tools/export-pdf.mjs vitra adidas              -> out/vitra.pdf, out/adidas.pdf
//   node tools/export-pdf.mjs default --version=preview -> out/default-preview.pdf (4 cards per project)
//   node tools/export-pdf.mjs default --squares         -> out/default-squares/<project>-<n>-<card>.png, 1080 x 1080
// Serves the repo locally, opens /?profile=<id>&print=1, and prints with Chromium.
import { createServer } from 'node:http';
import { readFile, mkdir } from 'node:fs/promises';
import { extname, join, normalize } from 'node:path';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const { chromium } = require('playwright');

const root = new URL('..', import.meta.url).pathname;
const types = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.css': 'text/css',
  '.json': 'application/json', '.jpg': 'image/jpeg', '.png': 'image/png', '.svg': 'image/svg+xml', '.glb': 'model/gltf-binary' };
const server = createServer(async (req, res) => {
  const p = normalize(decodeURIComponent(new URL(req.url, 'http://x').pathname)).replace(/^(\.\.[/\\])+/, '');
  try { const f = join(root, p.endsWith('/') ? p + 'index.html' : p);
    res.writeHead(200, { 'content-type': types[extname(f)] || 'application/octet-stream' }); res.end(await readFile(f));
  } catch { res.writeHead(404); res.end(); }
}).listen(0);
const port = server.address().port;

const args = process.argv.slice(2);
const flag = name => { const a = args.find(x => x === '--' + name || x.startsWith('--' + name + '=')); return a ? (a.split('=')[1] || true) : undefined; };
const squares = !!flag('squares');
const version = squares ? 'preview' : flag('version');
const ids = args.filter(a => !a.startsWith('--'));
if (!ids.length) ids.push('default');
await mkdir(join(root, 'out'), { recursive: true });
const browser = await chromium.launch();

async function open(id, query, viewport) {
  const page = await browser.newPage({ viewport });
  await page.goto(`http://localhost:${port}/?profile=${encodeURIComponent(id)}${query}`, { waitUntil: 'load' });
  await page.waitForFunction(() => window.PORTFOLIO, null, { timeout: 15000 });
  await page.evaluate(() => document.querySelectorAll('img[loading="lazy"]').forEach(i => i.loading = 'eager'));
  await page.waitForLoadState('networkidle').catch(() => {});
  return page;
}

for (const id of ids) {
  const v = version ? `&version=${version}` : '';
  if (squares) {
    const page = await open(id, `${v}&format=square`, { width: 1200, height: 1200 });
    const dir = join(root, 'out', `${id}-squares`);
    await mkdir(dir, { recursive: true });
    const cards = await page.$$('section[data-project]:not(.is-cut) [data-card]:not(.is-cut)');
    for (const el of cards) {
      const [pid, card, n] = await el.evaluate(e => [e.closest('[data-project]').dataset.project, e.dataset.card,
        window.PORTFOLIO.CARDS.indexOf(e.dataset.card) + 1]);
      const out = join(dir, `${pid}-${n}-${card}.png`);
      await el.screenshot({ path: out });
      console.log('wrote', out);
    }
    await page.close();
  } else {
    const page = await open(id, `&print=1${v}`, { width: 1600, height: 1131 });
    await page.emulateMedia({ media: 'print' });
    const out = join(root, 'out', `${id}${version ? '-' + version : ''}.pdf`);
    await page.pdf({ path: out, format: 'A4', landscape: true, printBackground: true, preferCSSPageSize: true });
    console.log('wrote', out);
    await page.close();
  }
}
await browser.close(); server.close();
