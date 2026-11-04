// Export any portfolio version to a printable A4 landscape PDF.
//   node tools/export-pdf.mjs                 -> out/default.pdf
//   node tools/export-pdf.mjs vitra adidas    -> out/vitra.pdf, out/adidas.pdf
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

const ids = process.argv.slice(2).length ? process.argv.slice(2) : ['default'];
await mkdir(join(root, 'out'), { recursive: true });
const browser = await chromium.launch();
for (const id of ids) {
  const page = await browser.newPage({ viewport: { width: 1600, height: 1131 } });
  await page.goto(`http://localhost:${port}/?profile=${encodeURIComponent(id)}&print=1`, { waitUntil: 'load' });
  await page.waitForFunction(() => window.PORTFOLIO, null, { timeout: 15000 });
  await page.evaluate(() => document.querySelectorAll('img[loading="lazy"]').forEach(i => i.loading = 'eager'));
  await page.waitForLoadState('networkidle').catch(() => {});
  await page.emulateMedia({ media: 'print' });
  const out = join(root, 'out', `${id}.pdf`);
  await page.pdf({ path: out, format: 'A4', landscape: true, printBackground: true, preferCSSPageSize: true });
  console.log('wrote', out);
  await page.close();
}
await browser.close(); server.close();
