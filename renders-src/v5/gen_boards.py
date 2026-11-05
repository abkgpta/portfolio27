# Board graphics for overgrwth v5 renders: whiteboard marker writing (RGBA), sticky notes,
# softboard prints / polaroids / sketches / cards. Run in any Python with Pillow:
#   python3 gen_boards.py <out_dir> <fonts_dir> <image files...>
import sys, os, math, random, glob
from PIL import Image, ImageDraw, ImageFont, ImageFilter, ImageOps

OUT, FONTS = sys.argv[1], sys.argv[2]; SRC = sys.argv[3:]
os.makedirs(OUT, exist_ok=True)
HAND = [f for f in sorted(glob.glob(os.path.join(FONTS, '*.ttf')))]
SANS = '/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf'; MONO = '/usr/share/fonts/truetype/dejavu/DejaVuSansMono.ttf'
INK = [(22, 22, 24), (22, 22, 24), (25, 70, 165), (190, 45, 40), (30, 115, 60)]
R = random.Random(27)
def font(sz, i=None): return ImageFont.truetype(HAND[(R.randrange(len(HAND)) if i is None else i) % len(HAND)], int(sz))

def jline(d, pts, col, w, rnd=R, j=1.5):
    """hand-drawn polyline: jittered, double pass"""
    for k in range(2):
        q = [(x + rnd.uniform(-j, j), y + rnd.uniform(-j, j)) for x, y in pts]
        d.line(q, fill=col, width=max(1, int(w * (1 if k == 0 else 0.6))), joint='curve')
def seg(d, a, b, col, w, n=8):
    jline(d, [(a[0] + (b[0] - a[0]) * t / n, a[1] + (b[1] - a[1]) * t / n) for t in range(n + 1)], col, w)
def arrow(d, a, b, col, w):
    seg(d, a, b, col, w); ang = math.atan2(b[1] - a[1], b[0] - a[0])
    for s in (-0.5, 0.5):
        seg(d, b, (b[0] - 18 * w / 3 * math.cos(ang + s), b[1] - 18 * w / 3 * math.sin(ang + s)), col, w, 2)
def box(d, x0, y0, x1, y1, col, w):
    for a, b in (((x0, y0), (x1, y0)), ((x1, y0), (x1, y1)), ((x1, y1), (x0, y1)), ((x0, y1), (x0, y0))): seg(d, a, b, col, w, 6)
def hframe(d, x, y, s, col, w):
    """sketch of the H-frame: tall post, short post, crossbar, with dimension ticks"""
    seg(d, (x, y), (x, y - 2 * s), col, w); seg(d, (x + 0.12 * s, y), (x + 0.12 * s, y - 2 * s), col, w)
    seg(d, (x + 1.75 * s, y), (x + 1.75 * s, y - s), col, w); seg(d, (x + 1.87 * s, y), (x + 1.87 * s, y - s), col, w)
    seg(d, (x + 0.12 * s, y - 0.5 * s), (x + 1.75 * s, y - 0.5 * s), col, w); seg(d, (x + 0.12 * s, y - 0.62 * s), (x + 1.75 * s, y - 0.62 * s), col, w)
    seg(d, (x, y + 0.18 * s), (x + 1.87 * s, y + 0.18 * s), col, max(1, w // 2))
def lattice_doodle(d, x, y, s, col, w):
    for i in range(4): seg(d, (x + i * s, y), (x + i * s, y - (2 + i % 2) * s), col, w)
    for j in range(3): seg(d, (x, y - j * s), (x + 3 * s, y - j * s), col, w)
def plant(d, x, y, s, col, w, rnd=R):
    jline(d, [(x + math.sin(t / 3) * s * 0.08, y - t * s / 10) for t in range(11)], col, w)
    for k in range(5):
        yy = y - (k + 2) * s / 7; sd = 1 if k % 2 else -1
        d.ellipse([x + sd * s * 0.05 - (s * 0.28 if sd < 0 else 0), yy - s * 0.07, x + sd * s * 0.05 + (s * 0.28 if sd > 0 else 0), yy + s * 0.07], outline=col, width=w)
def scribble_text(d, x, y, txt, sz, col, i=None, under=False):
    f = font(sz, i); d.text((x, y), txt, font=f, fill=col)
    if under:
        bb = d.textbbox((x, y), txt, font=f); jline(d, [(bb[0] + t * (bb[2] - bb[0]) / 10, bb[3] + 6 + math.sin(t) * 3) for t in range(11)], col, max(2, int(sz / 14)))
    return d.textbbox((x, y), txt, font=f)

NOTES = ['3 in OD tube, 21 in grid', 'power runs THROUGH the frame', 'clamp v2 = 2 stud rows', 'one clamp per post per seam', 'panels 21 x 12 in, zero gap',
         'end cap v2.1 - lid + finger dish', 'grow light: dim at night?', 'Qi pad 59 mm', 'speaker: 57 holes/row', 'planter 529 sq', 'test: 40 kg on shelf',
         'CMF: satin metal + 4 colours', 'kit A: starter (1 frame)', 'kit B: desk wall', 'kit C: plant corner', 'feet: cast alu, bead blast', 'who builds it? -> anyone',
         'grows with you', 'flat-pack < 1.2 m', 'tool-free assembly!', 'cable hidden in post', 'magnet strip?', 'cost < 15k', 'ask: hinge on clock']
POOL = []
def fit_text(d, x, y, w, txt, sz, col, fi, under=False):
    while sz > 12 and d.textlength(txt, font=font(sz, fi)) > w: sz *= 0.92
    return scribble_text(d, x, y, txt, sz, col, fi, under)
def el_list(d, r, rnd, title=None):
    x, y, w, h = r; col = INK[rnd.randrange(len(INK))]; fi = rnd.randrange(len(HAND)); lh = min(h / 6.2, 120)
    if title: fit_text(d, x, y, w, title, lh * 1.15, INK[3], fi, True); y += lh * 1.45
    while y + lh <= r[1] + h:
        t = POOL.pop() if POOL else rnd.choice(NOTES); bb = fit_text(d, x + lh * 0.55, y, w - lh * 0.6, t, lh * 0.8, col, fi)
        d.ellipse([x, y + lh * 0.38, x + lh * 0.22, y + lh * 0.6], fill=col)
        if rnd.random() < 0.18: seg(d, (bb[0], (bb[1] + bb[3]) / 2), (bb[2], (bb[1] + bb[3]) / 2), INK[3], max(3, int(lh / 22)))
        y += lh
def el_frame(d, r, rnd):
    x, y, w, h = r; s = min(w / 2.4, h / 2.6); x0 = x + (w - 1.9 * s) / 2; y0 = y + h - 0.35 * s; lw = max(4, int(s / 45))
    hframe(d, x0, y0, s, INK[2], lw)
    fit_text(d, x0 + 0.6 * s, y0 + 0.2 * s, s, '533.4', s * 0.17, INK[3], 1)
    fit_text(d, x0 - 0.42 * s, y0 - 1.15 * s, 0.4 * s, '609.6', s * 0.15, INK[3], 1)
    fit_text(d, x0 + 1.95 * s, y0 - 0.65 * s, 0.5 * s, '304.8', s * 0.15, INK[3], 1)
def el_lattice(d, r, rnd):
    x, y, w, h = r; s = min(w / 3.6, h / 3.6); lw = max(4, int(s / 30))
    lattice_doodle(d, x + (w - 3 * s) / 2, y + h - 0.4 * s, s, INK[0], lw)
    fit_text(d, x, y, w, rnd.choice(['grid = 21 in', 'lattice: grows sideways', 'zero gap!']), s * 0.3, INK[4], 2, True)
def el_plant(d, r, rnd):
    x, y, w, h = r; s = min(h * 0.85, w * 1.4); plant(d, x + w / 2, y + h - 10, s, INK[4], max(4, int(s / 70)), rnd)
def el_eq(d, r, rnd):
    x, y, w, h = r; lh = min(h / 3, 110)
    bb = fit_text(d, x + 25, y + h * 0.2, w - 50, 'G = 21 in = 533.4 mm', lh, INK[0], 0)
    box(d, bb[0] - 20, bb[1] - 18, bb[2] + 20, bb[3] + 18, INK[2], max(4, int(lh / 18)))
    bb2 = fit_text(d, x + 25, y + h * 0.62, w * 0.6, 'modular!', lh * 1.1, INK[3], 0)
    d.ellipse([bb2[0] - 25, bb2[1] - 18, bb2[2] + 25, bb2[3] + 18], outline=INK[3], width=max(4, int(lh / 16)))
    arrow(d, (bb2[2] + 40, (bb2[1] + bb2[3]) / 2), (x + w - 20, (bb2[1] + bb2[3]) / 2 - 30), INK[0], max(4, int(lh / 20)))
def el_timeline(d, r, rnd):
    x, y, w, h = r; lh = min(h / 3.5, 100); yy = y + h * 0.55; lw = max(4, int(lh / 18))
    arrow(d, (x + 10, yy), (x + w - 10, yy), INK[0], lw)
    for k, t in enumerate(['proto', 'CMF', 'photo', 'launch']):
        xx = x + 40 + k * (w - 100) / 3; seg(d, (xx, yy - 20), (xx, yy + 20), INK[0], lw, 2)
        fit_text(d, xx - 10, yy + 30, (w - 100) / 3 - 10, t, lh * 0.8, INK[2 if k % 2 else 3], 1)
    fit_text(d, x + 10, y, w * 0.8, 'plan  Nov', lh, INK[0], 2, True)
def whiteboard(wpx, hpx, seed, pxmm):
    rnd = random.Random(seed); im = Image.new('RGBA', (wpx, hpx), (0, 0, 0, 0)); d = ImageDraw.Draw(im)
    POOL[:] = NOTES[:]; rnd.shuffle(POOL)
    gh = Image.new('RGBA', (wpx, hpx), (0, 0, 0, 0)); gd = ImageDraw.Draw(gh)        # ghosting: old half-erased marker
    for _ in range(int(wpx * hpx / 1500000) + 3):
        gd.text((rnd.uniform(0, wpx * 0.8), rnd.uniform(0, hpx * 0.9)), rnd.choice(NOTES), font=font(30 * pxmm), fill=(60, 60, 70, 22))
    im.alpha_composite(gh.filter(ImageFilter.GaussianBlur(5)))
    m = 30 * pxmm; cols = max(1, round(wpx / pxmm / 400)); rows = max(1, round(hpx / pxmm / 290))
    cw, rh = (wpx - 2 * m) / cols, (hpx - 2 * m) / rows
    els = [el_frame, el_list, el_lattice, el_eq, el_list, el_timeline, el_plant, el_list]
    rnd.shuffle(els); k = 0; pad = 18 * pxmm
    title_done = False
    for rr in range(rows):
        for cc in range(cols):
            r = (m + cc * cw + pad / 2, m + rr * rh + pad / 2, cw - pad, rh - pad)
            if not title_done and cols > 1:
                fit_text(d, r[0], r[1], r[2], 'overgrwth / v3', min(r[3] / 4, 45 * pxmm), INK[0], 0, True)
                el_list(d, (r[0], r[1] + r[3] * 0.3, r[2], r[3] * 0.7), rnd); title_done = True; continue
            fn = els[k % len(els)]; k += 1
            fn(d, r, rnd, 'TODO') if fn is el_list and rnd.random() < 0.4 else fn(d, r, rnd)
    im = im.filter(ImageFilter.GaussianBlur(0.7))
    im.putalpha(im.getchannel('A').point(lambda v: min(255, int(v * 0.93))))
    return im

def sticky(seed, txt):
    rnd = random.Random(seed); cols = [(252, 228, 120), (255, 170, 190), (170, 225, 170), (150, 205, 245), (255, 190, 120)]
    im = Image.new('RGB', (600, 600), cols[seed % len(cols)]); d = ImageDraw.Draw(im)
    for y in range(600): d.line([(0, y), (600, y)], fill=tuple(max(0, int(c * (1 - 0.06 * y / 600))) for c in cols[seed % len(cols)]))
    f = font(78); words = txt.split(); lines = []; cur = ''
    for w in words:
        if d.textlength(cur + ' ' + w, font=f) > 500: lines.append(cur); cur = w
        else: cur = (cur + ' ' + w).strip()
    lines.append(cur)
    for i, l in enumerate(lines): d.text((50, 70 + i * 100), l, font=f, fill=(25, 25, 30))
    return im

def polaroid(img):
    s = min(img.size); c = img.crop(((img.width - s) // 2, (img.height - s) // 2, (img.width + s) // 2, (img.height + s) // 2)).resize((800, 800))
    p = Image.new('RGB', (880, 1060), (247, 246, 242)); p.paste(c, (40, 40))
    ImageDraw.Draw(p).text((60, 880), R.choice(['v4 hero', 'plant corner', 'desk wall', 'night test', 'CMF r2', 'studio']), font=font(70), fill=(40, 40, 60))
    return p
def print_sheet(img, aspect):
    w, h = img.size
    if w / h > aspect: nw = int(h * aspect); img = img.crop(((w - nw) // 2, 0, (w + nw) // 2, h))
    else: nh = int(w / aspect); img = img.crop((0, (h - nh) // 2, w, (h + nh) // 2))
    img = img.resize((1200, int(1200 / aspect)) if aspect >= 1 else (int(1200 * aspect), 1200))
    b = Image.new('RGB', (img.width + 60, img.height + 60), (248, 247, 243)); b.paste(img, (30, 30)); return b
def sketch_sheet(seed):
    rnd = random.Random(seed); im = Image.new('RGB', (1480, 2100), (246, 242, 232)); d = ImageDraw.Draw(im)
    for y in range(80, 2100, 60):
        for x in range(60, 1480, 60): d.point((x, y), fill=(200, 196, 188))
    g = (70, 70, 78)
    hframe(d, 200, 1100, 330, g, 4); hframe(d, 260, 1900, 160, g, 3)
    lattice_doodle(d, 820, 1000, 160, g, 3); plant(d, 1100, 1900, 500, (60, 110, 70), 3, rnd)
    scribble_text(d, 120, 90, rnd.choice(['frame study 0%d' % (seed % 9 + 1), 'H-frame + clamp', 'growth stages', 'joint options']), 90, (30, 30, 40), None, True)
    for k in range(5): scribble_text(d, 820, 1200 + k * 90, rnd.choice(NOTES), 52, (50, 50, 70))
    return im.filter(ImageFilter.GaussianBlur(0.6))
def cmf_card():
    sw = [('#FFFAFA', 'frame / satin metal'), ('#D95942', 'power + lights'), ('#2F7A4B', 'clamp'), ('#FBCB44', 'shelf / planter'), ('#4569BE', 'pegboard / softboard'), ('#A9ACAE', 'feet')]
    im = Image.new('RGB', (1480, 2100), (250, 249, 246)); d = ImageDraw.Draw(im)
    d.text((100, 90), 'overgrwth  CMF  r2', font=ImageFont.truetype(SANS, 70), fill=(20, 20, 20))
    for i, (h, n) in enumerate(sw):
        y = 260 + i * 290; c = tuple(int(h[k:k + 2], 16) for k in (1, 3, 5))
        d.rectangle([100, y, 520, y + 230], fill=c, outline=(200, 200, 200)); d.text((580, y + 70), n, font=ImageFont.truetype(SANS, 52), fill=(30, 30, 30))
        d.text((580, y + 140), h, font=ImageFont.truetype(MONO, 44), fill=(110, 110, 110))
    return im
def plan_card():
    im = Image.new('RGB', (1480, 2100), (252, 252, 250)); d = ImageDraw.Draw(im); f = ImageFont.truetype(MONO, 40)
    lines = ['OVERGRWTH  build plan', '', 'wk 1  frame + connector proto', 'wk 2  clamp v2, panel trays', 'wk 3  attachments, wiring', 'wk 4  CMF r2 samples',
             'wk 5  photo + film', '', 'parts:', '  OG-FRM-001  H-frame', '  OG-CON-001  connector', '  OG-CON-002  end cap v2.1', '  OG-CON-005  clamp',
             '  OG-MOD-002  panels x3', '  OG-ATT-001..007', '', 'todo:', '  [x] 3 in OD', '  [x] zero-gap panels', '  [ ] load test', '  [ ] pack-out']
    for i, l in enumerate(lines): d.text((110, 110 + i * 86), l, font=ImageFont.truetype(SANS, 66) if i == 0 else f, fill=(25, 25, 25))
    return im

if __name__ == '__main__':
    for k, (cw, rh) in enumerate([(3, 2), (3, 2), (2, 2), (1, 1), (1, 2), (2, 1)]):
        pxmm = 3.0
        wpx, hpx = int((cw * 533.4 - 24) * pxmm), int((rh * 304.8 - 24) * pxmm)
        whiteboard(wpx, hpx, 100 + k, pxmm).save(os.path.join(OUT, 'wb_%dx%d_%d.png' % (cw, rh, k)))
    for i, t in enumerate(['water basil + fern', 'order 3in tube x12', 'CMF ok?', 'clamp v2 OK', 'ship Nov 10!', 'call supplier', 'Qi pad 59', 'photos fri']):
        sticky(i, t).save(os.path.join(OUT, 'sticky_%d.png' % i))
    k = 0
    for f in SRC:
        try: img = Image.open(f).convert('RGB')
        except Exception: continue
        aspect = [1.414, 0.707, 1.5, 1.0][k % 4]
        (polaroid(img) if k % 3 == 2 else print_sheet(img, aspect)).save(os.path.join(OUT, 'pin_%02d.jpg' % k), quality=90); k += 1
    for s in range(4): sketch_sheet(s).save(os.path.join(OUT, 'sketch_%d.png' % s))
    cmf_card().save(os.path.join(OUT, 'card_cmf.png')); plan_card().save(os.path.join(OUT, 'card_plan.png'))
    print('boards ->', OUT, len(os.listdir(OUT)))
