# overgrwth v4 render studio (Blender 5.2, Cycles). Units in code are mm; scene is metres.
# Run: blender -b -P og_v4.py -- --shots 01,02 --res 1400 --samples 128 --out out --device GPU
import bpy, bmesh, sys, os, math, json, glob, gzip, shutil, argparse, random, subprocess
from mathutils import Vector, Matrix, Euler
HERE = os.path.dirname(os.path.abspath(__file__))
ap = argparse.ArgumentParser()
ap.add_argument('--shots', default='all'); ap.add_argument('--res', type=int, default=1200)
ap.add_argument('--samples', type=int, default=96); ap.add_argument('--out', default=os.path.join(HERE, 'out'))
ap.add_argument('--device', default='CPU'); ap.add_argument('--stl', default=os.path.join(HERE, 'stl'))
ap.add_argument('--cmf', default=os.path.join(HERE, 'cmf.json')); ap.add_argument('--clay', action='store_true')
ap.add_argument('--square', action='store_true'); ap.add_argument('--night', default='auto')
ap.add_argument('--save', default=''); ap.add_argument('--list', action='store_true'); ap.add_argument('--dry', action='store_true')
ap.add_argument('--finish', default='metal')   # metal = CMF satin metal; powder = white satin powder coat
A = ap.parse_args(sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else [])
random.seed(7)
CMF = json.load(open(A.cmf))['slots']
# final CMF (round 2): per-part slots override the legacy shared ones
for _k, _v in {'pom': 'pom_frame_connector', 'cap': 'pom_end_cap', 'clamp': 'pom_universal_clamp', 'alu': 'alu_floor_foot',
               'alu_pf': 'alu_power_in_foot', 'att_grow': 'att_grow_light', 'att_spot': 'att_spotlight', 'att_hub': 'att_power_hub',
               'att_pen': 'att_pen_stand', 'att_clock': 'att_clock_puck', 'att_speaker': 'att_speaker_puck'}.items():
    if _v in CMF: CMF[_k] = CMF[_v]
CMF.setdefault('alu_pf', CMF['alu'])
if A.finish == 'powder':
    for _k in ('frame', 'pom', 'cap', 'alu'): CMF[_k] = dict(CMF[_k], hex='#F2F1EC', metallic=0.0, roughness=0.42)

# ---------------------------------------------------------------- basics
def lin(h):
    h = h.lstrip('#'); c = [int(h[i:i + 2], 16) / 255 for i in (0, 2, 4)]
    return [x / 12.92 if x <= 0.04045 else ((x + 0.055) / 1.055) ** 2.4 for x in c] + [1]
def mix(a, b, t): return [a[i] * (1 - t) + b[i] * t for i in range(3)] + [1]
MM = 0.001
H, G, HS = 609.6, 533.4, 304.8          # tall post, post pitch, short post
CB = 152.4                               # crossbar height on the short post
FOOT = 22.0                              # foot plate below post bottom

def reset():
    bpy.ops.wm.read_factory_settings(use_empty=True)
    sc = bpy.context.scene
    sc.render.engine = 'CYCLES'
    if A.device != 'CPU':
        pr = bpy.context.preferences.addons['cycles'].preferences
        pr.compute_device_type = A.device if A.device in ('METAL', 'CUDA', 'OPTIX', 'HIP') else 'METAL'
        pr.get_devices()
        for d in pr.devices: d.use = True
        sc.cycles.device = 'GPU'
    sc.cycles.samples = A.samples; sc.cycles.use_denoising = True
    sc.cycles.max_bounces = 12; sc.cycles.glossy_bounces = 6; sc.cycles.transmission_bounces = 8
    sc.cycles.use_adaptive_sampling = True; sc.cycles.adaptive_threshold = 0.008
    sc.view_settings.view_transform = 'AgX'; sc.view_settings.look = 'AgX - Medium High Contrast'
    sc.render.film_transparent = False
    return sc
sc = reset()

# ---------------------------------------------------------------- materials
MAT = {}
def nodes(m): return m.node_tree.nodes, m.node_tree.links
def principled(name, col, rough=0.5, metal=0.0, coat=0.0, sheen=0.0, sss=0.0, ior=1.5):
    m = bpy.data.materials.new(name); m.use_nodes = True
    n, l = nodes(m); b = n['Principled BSDF']
    b.inputs['Base Color'].default_value = col; b.inputs['Roughness'].default_value = rough
    b.inputs['Metallic'].default_value = metal; b.inputs['IOR'].default_value = ior
    if coat: b.inputs['Coat Weight'].default_value = coat; b.inputs['Coat Roughness'].default_value = 0.08
    if sheen: b.inputs['Sheen Weight'].default_value = sheen; b.inputs['Sheen Roughness'].default_value = 0.4
    if sss: b.inputs['Subsurface Weight'].default_value = sss; b.inputs['Subsurface Radius'].default_value = (2, 1, 0.6)
    return m
def obj_coords(m):
    n, l = nodes(m); t = n.new('ShaderNodeTexCoord'); return t.outputs['Object']
def bump(m, height_socket, strength, dist=0.0002):
    n, l = nodes(m); b = n['Principled BSDF']; bp = n.new('ShaderNodeBump')
    bp.inputs['Strength'].default_value = strength; bp.inputs['Distance'].default_value = dist
    l.new(height_socket, bp.inputs['Height']); l.new(bp.outputs['Normal'], b.inputs['Normal']); return bp
def noise(m, scale, detail=4, rough=0.6, vec=None, w4=False):
    n, l = nodes(m); t = n.new('ShaderNodeTexNoise'); t.inputs['Scale'].default_value = scale
    t.inputs['Detail'].default_value = detail; t.inputs['Roughness'].default_value = rough
    l.new(vec or obj_coords(m), t.inputs['Vector']); return t
def rough_var(m, base, amp, scale):
    n, l = nodes(m); b = n['Principled BSDF']; t = noise(m, scale, 3)
    mr = n.new('ShaderNodeMapRange'); mr.inputs['To Min'].default_value = base - amp; mr.inputs['To Max'].default_value = base + amp
    l.new(t.outputs['Fac'], mr.inputs['Value']); l.new(mr.outputs['Result'], b.inputs['Roughness'])

def mk_powder(name, hexc, rough):            # powder coat: orange peel + soft roughness breakup
    m = principled(name, lin(hexc), rough, 0.0, coat=0.15)
    t = noise(m, 9000, 2, 0.5); bump(m, t.outputs['Fac'], 0.12)
    rough_var(m, rough, 0.05, 300); return m
def mk_stipple(name, hexc, rough):           # moulded PC/ABS, fine leather stipple
    m = principled(name, lin(hexc), rough)
    n, l = nodes(m); v = n.new('ShaderNodeTexVoronoi'); v.inputs['Scale'].default_value = 5000
    l.new(obj_coords(m), v.inputs['Vector']); bump(m, v.outputs['Distance'], 0.18)
    rough_var(m, rough, 0.06, 500); return m
def mk_pom(name, hexc, rough):               # satin polymer, faint mould texture
    m = principled(name, lin(hexc), rough, sss=0.03)
    t = noise(m, 14000, 2); bump(m, t.outputs['Fac'], 0.06); rough_var(m, rough, 0.04, 800); return m
def mk_cast(name, hexc, rough, metal):       # bead-blasted cast aluminium
    m = principled(name, lin(hexc), rough, metal)
    t = noise(m, 20000, 6, 0.8); bump(m, t.outputs['Fac'], 0.25); rough_var(m, rough, 0.08, 900); return m
def mk_oak(name, hexc):                      # green-lacquered oak, open grain through the lacquer
    base = lin(hexc); m = principled(name, base, 0.42, coat=0.35)
    n, l = nodes(m); b = n['Principled BSDF']; oc = obj_coords(m)
    mp = n.new('ShaderNodeMapping'); mp.inputs['Scale'].default_value = (1, 14, 1); l.new(oc, mp.inputs['Vector'])
    w = n.new('ShaderNodeTexWave'); w.inputs['Scale'].default_value = 6; w.inputs['Distortion'].default_value = 9
    w.inputs['Detail'].default_value = 6; w.inputs['Detail Scale'].default_value = 2; l.new(mp.outputs['Vector'], w.inputs['Vector'])
    pores = noise(m, 1800, 2, 0.6, vec=mp.outputs['Vector'])
    mx = n.new('ShaderNodeMix'); mx.data_type = 'RGBA'; mx.inputs['A'].default_value = base
    mx.inputs['B'].default_value = mix(base, [0.02, 0.03, 0.02], 0.45)
    l.new(w.outputs['Fac'], mx.inputs['Factor']); l.new(mx.outputs['Result'], b.inputs['Base Color'])
    add = n.new('ShaderNodeMath'); add.operation = 'ADD'; l.new(w.outputs['Fac'], add.inputs[0]); l.new(pores.outputs['Fac'], add.inputs[1])
    bump(m, add.outputs['Value'], 0.08); return m
def mk_flecked(name, hexc, rough):           # recycled PP with dark flecks
    base = lin(hexc); m = principled(name, base, rough)
    n, l = nodes(m); b = n['Principled BSDF']; v = n.new('ShaderNodeTexVoronoi'); v.inputs['Scale'].default_value = 900
    l.new(obj_coords(m), v.inputs['Vector']); r = n.new('ShaderNodeValToRGB')
    r.color_ramp.elements[0].position = 0.05; r.color_ramp.elements[0].color = (0.03, 0.02, 0.02, 1)
    r.color_ramp.elements[1].position = 0.07; r.color_ramp.elements[1].color = base
    l.new(v.outputs['Distance'], r.inputs['Fac']); l.new(r.outputs['Color'], b.inputs['Base Color'])
    t = noise(m, 6000, 2); bump(m, t.outputs['Fac'], 0.1); return m
def mk_felt(name, hexc):
    m = principled(name, lin(hexc), 0.95, sheen=0.8)
    t = noise(m, 6000, 12, 0.75); bump(m, t.outputs['Fac'], 0.6); return m
def mk_gloss(name, hexc):
    m = principled(name, lin(hexc), 0.08, coat=0.6); t = noise(m, 3000, 2); bump(m, t.outputs['Fac'], 0.02); return m
def mk_emit(name, hexc, strength):
    m = principled(name, lin(hexc), 0.3)
    b = m.node_tree.nodes['Principled BSDF']; b.inputs['Emission Color'].default_value = lin(hexc)
    b.inputs['Emission Strength'].default_value = strength; return m
def mk_clay(name):
    return principled(name, lin('#E9E6E1'), 0.55)

def build_materials(night=False):
    MAT.clear(); S = CMF
    if A.clay:
        c = mk_clay('clay')
        for k in S: MAT[k] = c
    else:
        MAT['frame'] = mk_powder('frame', S['frame']['hex'], S['frame']['roughness'])
        MAT['alu'] = mk_cast('alu', S['alu']['hex'], S['alu']['roughness'], S['alu']['metallic'])
        MAT['alu_pf'] = mk_cast('alu_pf', S['alu_pf']['hex'], S['alu_pf']['roughness'], S['alu_pf'].get('metallic', 0))
        MAT['pom'] = mk_pom('pom', S['pom']['hex'], S['pom']['roughness'])
        MAT['clamp'] = mk_pom('clamp', S['clamp']['hex'], S['clamp']['roughness'])
        MAT['clip'] = mk_pom('clip', S['clip']['hex'], S['clip']['roughness'])
        MAT['cap'] = mk_stipple('cap', S['cap']['hex'], S['cap']['roughness'])
        MAT['oak'] = mk_oak('oak', S['oak']['hex'])
        MAT['pp'] = mk_flecked('pp', S['pp']['hex'], S['pp']['roughness'])
        MAT['whiteboard'] = mk_gloss('whiteboard', S['whiteboard']['hex'])
        MAT['pegboard'] = mk_powder('pegboard', S['pegboard']['hex'], S['pegboard']['roughness'])
        MAT['softboard'] = mk_felt('softboard', S['softboard']['hex'])
        for k in ('att_grow', 'att_spot', 'att_hub', 'att_pen', 'att_clock', 'att_speaker'):
            MAT[k] = mk_stipple(k, S[k]['hex'], S[k]['roughness'])
        MAT['hi'] = mk_stipple('hi', S['hi']['hex'], 0.45); MAT['muted'] = mk_pom('muted', S['muted']['hex'], 0.6)
        for k, m in MAT.items():       # 'satin metal' finishes: metallic from the CMF slot
            mt = S.get(k, {}).get('metallic', 0)
            if mt and 'Principled BSDF' in m.node_tree.nodes: m.node_tree.nodes['Principled BSDF'].inputs['Metallic'].default_value = mt
    MAT['led'] = mk_emit('led', '#FFE2B8', 60 if night else 6)          # grow light / spot emitters
    MAT['led_grow'] = mk_emit('led_grow', '#FF9FD6', 40 if night else 4)
    MAT['screen'] = mk_emit('screen', '#F4F0E8', 2.5)
    MAT['power'] = mk_emit('power', S['power']['hex'], 8)
    MAT['ghost'] = principled('ghost', lin('#FFFFFF'), 0.2); gb = MAT['ghost'].node_tree.nodes['Principled BSDF']
    gb.inputs['Transmission Weight'].default_value = 1.0; gb.inputs['Alpha'].default_value = 0.35
    MAT['leaf'] = principled('leaf', lin(S['plant']['hex']), 0.45, sss=0.15)
    lb = MAT['leaf'].node_tree.nodes['Principled BSDF']; t = noise(MAT['leaf'], 40, 3)
    mx = MAT['leaf'].node_tree.nodes.new('ShaderNodeMix'); mx.data_type = 'RGBA'
    mx.inputs['A'].default_value = lin('#3D7A2E'); mx.inputs['B'].default_value = lin('#7FB04A')
    MAT['leaf'].node_tree.links.new(t.outputs['Fac'], mx.inputs['Factor']); MAT['leaf'].node_tree.links.new(mx.outputs['Result'], lb.inputs['Base Color'])
    MAT['stem'] = principled('stem', lin('#5E7A35'), 0.6)
    MAT['soil'] = mk_cast('soil', '#3A2A1F', 0.95, 0)

# ---------------------------------------------------------------- meshes
MESH = {}
STLMAP = {'frame': 'OG-FRM-001', 'connector': 'OG-CON-001', 'cap': 'OG-CON-002', 'foot': 'OG-CON-003',
          'pfoot': 'OG-CON-004', 'clamp': 'OG-CON-005', 'shelf': 'OG-MOD-001', 'panel': 'OG-MOD-002_panel-blank',
          'pegpanel': 'OG-MOD-002_panel-pegboard', 'finishes': 'OG-MOD-002_panel-finishes', 'planter': 'OG-MOD-003_planter-tray',
          'pextras': 'OG-MOD-003_planter-extras', 'grow': 'OG-ATT-001', 'spot': 'OG-ATT-002',
          'hub': 'OG-ATT-003', 'pen': 'OG-ATT-004', 'clock': 'OG-ATT-005', 'speaker': 'OG-ATT-006', 'vclip': 'OG-ATT-007'}
def stl_path(key):
    pre = STLMAP[key]; fs = sorted(glob.glob(os.path.join(A.stl, pre + '*.stl*')))
    if not fs: raise SystemExit('missing STL for ' + key)
    f = fs[-1]                                  # highest version wins
    if f.endswith('.gz'):
        out = os.path.join(A.stl, '_unz', os.path.basename(f)[:-3]); os.makedirs(os.path.dirname(out), exist_ok=True)
        if not os.path.exists(out):
            with gzip.open(f) as a, open(out, 'wb') as b: shutil.copyfileobj(a, b)
        f = out
    return f
def islands(bm):
    seen = set(); out = []
    for f in bm.faces:
        if f in seen: continue
        isl = []; st = [f]; seen.add(f)
        while st:
            g = st.pop(); isl.append(g)
            for e in g.edges:
                for h in e.link_faces:
                    if h not in seen: seen.add(h); st.append(h)
        out.append(isl)
    return out
def mesh(key):
    if key in MESH: return MESH[key]
    bpy.ops.wm.stl_import(filepath=stl_path(key)); o = bpy.context.selected_objects[0]
    me = o.data; me.name = key
    bm = bmesh.new(); bm.from_mesh(me)
    bmesh.ops.remove_doubles(bm, verts=bm.verts, dist=0.0005)          # weld the STL so normals can smooth
    bm.faces.ensure_lookup_table()
    # material index tagging: 0 = body, 1 = emitter / secondary
    if key in ('grow',):
        for f in bm.faces:
            c = f.calc_center_median(); r = math.hypot(c.x, c.y)
            if f.normal.z < -0.85 and c.z < -5 and 70 < r < 140: f.material_index = 1
    if key == 'spot':
        for f in bm.faces:
            c = f.calc_center_median()
            if f.normal.y < -0.9 and c.z > 150 and math.hypot(c.x, c.z - 195) < 26: f.material_index = 1
    if key == 'clock':
        for f in bm.faces:
            c = f.calc_center_median()
            if f.normal.y < -0.9 and c.z > 30: f.material_index = 1
    if key == 'finishes':
        for isl in islands(bm):
            vs = [v.co for g in isl for v in g.verts]; xs = [v.x for v in vs]; zs = [v.z for v in vs]
            dx = max(xs) - min(xs); cx = sum(xs) / len(xs)
            if dx < 300 and max(zs) - min(zs) < 300 and dx < 200: idx = 0         # small bits = trays/brackets
            else: idx = 1 + min(2, max(0, int((cx + 300) // 600)))
            for g in isl: g.material_index = idx
    bm.to_mesh(me); bm.free()
    for p in me.polygons: p.use_smooth = True
    bpy.context.view_layer.objects.active = o
    try: bpy.ops.object.shade_smooth_by_angle(angle=math.radians(32), keep_sharp_edges=True)
    except Exception: pass
    # bake the smooth-by-angle modifier if it was added as one
    for md in list(o.modifiers):
        try: bpy.ops.object.modifier_apply(modifier=md.name)
        except Exception: pass
    bpy.data.objects.remove(o); MESH[key] = me; return me

# ---------------------------------------------------------------- placing parts
SHOTCOL = {}
def coll(name):
    if name not in SHOTCOL:
        c = bpy.data.collections.new(name); sc.collection.children.link(c); SHOTCOL[name] = c
    return SHOTCOL[name]
CUR = ['main']
def put(key, loc=(0, 0, 0), rot=(0, 0, 0), mat='frame', mats=None, name=None):
    if key == 'cap': USED.add((round(loc[0]), round(loc[1])))
    me = mesh(key); o = bpy.data.objects.new(name or key, me)
    o.location = Vector(loc) * MM; o.rotation_euler = Euler([math.radians(a) for a in rot]); o.scale = (MM,) * 3
    ml = mats or [mat, 'led']
    if key == 'finishes': ml = ['clamp', 'whiteboard', 'pegboard', 'softboard']
    while len(me.materials) < len(ml): me.materials.append(None)
    for sl, mk in zip(o.material_slots, ml): sl.link = 'OBJECT'; sl.material = MAT[mk]
    coll(CUR[0]).objects.link(o); return o
ATT = {'grow': 'att_grow', 'spot': 'att_spot', 'hub': 'att_hub', 'pen': 'att_pen', 'clock': 'att_clock', 'speaker': 'att_speaker'}
def att(key, top, face=0):
    USED.add((round(top[0]), round(top[1])))
    m2 = {'grow': 'led_grow', 'spot': 'led', 'clock': 'screen'}.get(key, 'led')
    return put(key, top, (0, 0, face), mats=[ATT[key], m2])

# H-frame stack: even levels upright, odd levels flipped upside down so tall sits on short.
def column(x, y, n, rotz=0, feet=True, power_foot=False, cap=True, conn=False):
    """n frames stacked at (x,y); frame plane along local +x rotated by rotz. Returns the two post-top points."""
    R = Matrix.Rotation(math.radians(rotz), 4, 'Z'); base = Vector((x, y, 0))
    P = lambda px, z: base + R @ Vector((px, 0, z))
    tops = {0: 0.0, 1: 0.0}           # running top height of post A (x=0) and post B (x=G)
    for i in range(n):
        if i % 2 == 0:
            z0 = max(tops[0], tops[1] - 0) if i == 0 else tops[0]
            put('frame', P(0, tops[0]), (0, 0, rotz)); tops = {0: tops[0] + H, 1: tops[1] + HS}
        else:
            # flipped: short post now on post A (top-flush), tall on post B
            zb = tops[1]; put('frame', P(G, zb + H), (0, 180, rotz)); tops = {0: zb + H, 1: zb + H}
        if conn and i > 0:
            pass
    # connectors at every internal joint (where a new frame starts on a post top)
    if conn:
        zA, zB = 0.0, 0.0; za = [] ; zb_ = []
        for i in range(n):
            if i % 2 == 0: hA, hB = H, HS
            else: hA, hB = HS, H
            if i > 0: za.append(zA); zb_.append(zB)
            zA += hA; zB += hB
        for z in za: put('connector', P(0, z), (0, 0, rotz), mat='pom')
        for z in zb_: put('connector', P(G, z), (0, 0, rotz), mat='pom')
    if feet:
        put('pfoot' if power_foot else 'foot', P(0, 0), (0, 0, rotz), mat='alu_pf' if power_foot else 'alu'); put('foot', P(G, 0), (0, 0, rotz), mat='alu')
    tA, tB = P(0, tops[0]), P(G, tops[1])
    POSTS[(round(tA.x), round(tA.y))] = tA.z; POSTS[(round(tB.x), round(tB.y))] = tB.z
    return tA, tB

POSTS = {}; CLAMPS = {}; WARN = []; USED = set()
def clamp(post, z, rotz=0):
    k = (round(post[0]), round(post[1]), round(z / 5))
    for (a, b, c), r in CLAMPS.items():
        if a == k[0] and b == k[1] and abs(c * 5 - z) < 36:
            if abs(c * 5 - z) > 1: WARN.append('clamp overlap at %s z=%.0f' % (k[:2], z))
            return None
    top = POSTS.get(k[:2])
    if top is None: WARN.append('clamp on missing post %s' % (k[:2],))
    elif z + 35 > top - 5: WARN.append('clamp above post top %s z=%.0f top=%.0f' % (k[:2], z, top))
    CLAMPS[k] = rotz; return put('clamp', (post[0], post[1], z), (0, 0, rotz), mat='clamp')
def _four(cx, cy, z):
    for dx, dy in ((-1, -1), (1, -1), (1, 1), (-1, 1)): clamp((cx + dx * G / 2, cy + dy * G / 2), z - 30, 0 if dy < 0 else 180)
def shelf_on(cx, cy, z, mat='oak'):
    _four(cx, cy, z); return put('shelf', (cx, cy, z), mat=mat)
def planter_on(cx, cy, z):
    _four(cx, cy, z); o = put('planter', (cx, cy, z), mat='pp'); put('pextras', (cx, cy, z), mat='pp')
    soil(cx, cy, z + 95, 500); return o
def panel_between(xa, xb, y, z, fin='pegboard', rotz=0):
    """landscape panel hung on the -Y face of the post line y, board face toward -Y; z = panel bottom"""
    cx = (xa + xb) / 2
    for px in (xa, xb): clamp((px, y), z - 15, 180); clamp((px, y), z + HS - 15, 180)
    key = 'pegpanel' if fin == 'pegboard' else 'panel'
    return put(key, (cx, y - 51.9, z), (0, 0, 180), mats=[fin, fin])

# ---------------------------------------------------------------- props: plants, soil, books, printer
def soil(cx, cy, z, size):
    bpy.ops.mesh.primitive_grid_add(x_subdivisions=80, y_subdivisions=80, size=size * MM * 0.97, location=(cx * MM, cy * MM, z * MM))
    o = bpy.context.object; d = o.modifiers.new('d', 'DISPLACE'); tx = bpy.data.textures.new('soil', 'CLOUDS'); tx.noise_scale = 0.015
    d.texture = tx; d.strength = 0.006; d.mid_level = 0.5
    for p_ in o.data.polygons: p_.use_smooth = True
    o.data.materials.append(MAT['soil']); relink(o); return o
def relink(o):
    for c in o.users_collection: c.objects.unlink(o)
    coll(CUR[0]).objects.link(o)
LEAF = {}
def leaf_mesh(kind='pothos'):
    if kind in LEAF: return LEAF[kind]
    bm = bmesh.new(); prof = []
    N = 16
    for i in range(N + 1):            # heart-ish outline
        t = i / N; a = math.pi * t
        w = math.sin(a) ** 0.8 * (1.15 - 0.4 * t) * (0.62 if kind == 'pothos' else 0.25)
        prof.append((w, t))
    vs_l = [bm.verts.new((-w, t, 0.06 * math.sin(math.pi * t) + 0.08 * w * w)) for w, t in prof]
    vs_r = [bm.verts.new((w, t, 0.06 * math.sin(math.pi * t) + 0.08 * w * w)) for w, t in prof]
    mid = [bm.verts.new((0, t, 0.06 * math.sin(math.pi * t) - 0.012)) for w, t in prof]
    for i in range(N):
        bm.faces.new((vs_l[i], vs_l[i + 1], mid[i + 1], mid[i])); bm.faces.new((mid[i], mid[i + 1], vs_r[i + 1], vs_r[i]))
    me = bpy.data.meshes.new('leaf_' + kind); bm.to_mesh(me); bm.free()
    for p in me.polygons: p.use_smooth = True
    me.materials.append(MAT['leaf']); LEAF[kind] = me; return me
def vine(pts, leaf_every=40.0, leaf_size=70.0, kind='pothos', r=3.0, centre=None):
    """pts in mm; stem tube + leaves along it"""
    cu = bpy.data.curves.new('stem', 'CURVE'); cu.dimensions = '3D'; cu.bevel_depth = r * MM; cu.bevel_resolution = 4
    sp = cu.splines.new('NURBS'); sp.points.add(len(pts) - 1); sp.use_endpoint_u = True; sp.order_u = 4
    for p, q in zip(sp.points, pts): p.co = (q[0] * MM, q[1] * MM, q[2] * MM, 1)
    o = bpy.data.objects.new('stem', cu); o.data.materials.append(MAT['stem']); coll(CUR[0]).objects.link(o)
    # leaves
    L = 0; prev = Vector(pts[0]); acc = 0
    for q in pts[1:]:
        q = Vector(q); seg = (q - prev).length; d = (q - prev).normalized() if seg > 0 else Vector((0, 0, 1))
        acc += seg
        while acc >= leaf_every:
            acc -= leaf_every; p = q - d * acc
            lf = bpy.data.objects.new('leaf', leaf_mesh(kind)); s = leaf_size * random.uniform(0.7, 1.25) * MM
            lf.scale = (s, s, s); lf.location = p * MM
            if centre is not None:
                yaw = math.atan2(p.y - centre[1], p.x - centre[0]) + random.uniform(-0.5, 0.5)
            else:
                yaw = math.atan2(d.y, d.x) + random.choice((-1, 1)) * random.uniform(1.1, 1.9)
            lf.rotation_euler = Euler((random.uniform(-0.6, 0.2), random.uniform(-0.4, 0.4), yaw - math.pi / 2))
            coll(CUR[0]).objects.link(lf)
        prev = q
    return o
def climb(post, z0, z1, turns=2.2, r=48, phase=0.0, trail=0):
    pts = []; n = 40
    for i in range(n + 1):
        t = i / n; a = phase + t * turns * 2 * math.pi
        pts.append((post[0] + r * math.cos(a), post[1] + r * math.sin(a), z0 + (z1 - z0) * t))
    if trail:   # drape off the top and down
        a = phase + turns * 2 * math.pi
        for k in range(1, 8):
            pts.append((post[0] + (r + 25 * k) * math.cos(a + 0.2 * k), post[1] + (r + 25 * k) * math.sin(a + 0.2 * k), z1 + 20 - k * k * trail))
    vine(pts, centre=post)
    for z in range(int(z0 + 120), int(z1 - 40), 170):
        if not any(a == round(post[0]) and b == round(post[1]) and abs(c * 5 - z) < 50 for (a, b, c) in CLAMPS):
            put('vclip', (post[0], post[1], z), (0, 0, random.uniform(0, 360)), mat='clip')
def tuft(cx, cy, z, n=26, h=180, kind='pothos', spread=120):
    for k in range(n):
        a = k * 2.399; rr = spread * math.sqrt(k / n)
        base = (cx + rr * math.cos(a) * 0.3, cy + rr * math.sin(a) * 0.3, z)
        tip = (cx + rr * math.cos(a), cy + rr * math.sin(a), z + h * random.uniform(0.5, 1.0))
        mid = ((base[0] + tip[0]) / 2, (base[1] + tip[1]) / 2, tip[2] + 30)
        vine([base, mid, tip], leaf_every=60, leaf_size=60 if kind == 'pothos' else 45, kind=kind, r=2)
def box(name, size, loc, mat, bevel=2.0, rotz=0):
    bpy.ops.mesh.primitive_cube_add(size=1, location=Vector(loc) * MM); o = bpy.context.object
    o.scale = Vector(size) * MM; o.rotation_euler[2] = math.radians(rotz); o.name = name
    bpy.ops.object.transform_apply(scale=True)
    if bevel: b = o.modifiers.new('b', 'BEVEL'); b.width = bevel * MM; b.segments = 3
    for p in o.data.polygons: p.use_smooth = True
    o.data.materials.append(MAT[mat] if isinstance(mat, str) else mat); relink(o); return o
def book_row(x, y, z, n=9, rotz=0, depth=170):
    cols = ['#2E3A4A', '#C9B79C', '#8C3B2E', '#E8E2D6', '#3F5E4A', '#1F1F1F', '#B8A06A', '#6E7F8C', '#D9CDB8']
    xo = 0
    for i in range(n):
        w = random.uniform(22, 48); h = random.uniform(210, 300)
        m = principled('book%d' % i, lin(cols[i % len(cols)]), 0.75)
        R = Matrix.Rotation(math.radians(rotz), 4, 'Z')
        p = Vector((x, y, z)) + R @ Vector((xo + w / 2, 0, h / 2)); box('book', (w, depth, h), p, m, 1.0, rotz); xo += w + 1
def printer(x, y, z, rotz=0):
    """generic, unbranded bed-slinger style 3D printer"""
    R = Matrix.Rotation(math.radians(rotz), 4, 'Z'); P = lambda a, b, c: Vector((x, y, z)) + R @ Vector((a, b, c))
    dark = principled('printer_dark', lin('#2A2B2D'), 0.5); alum = mk_cast('printer_alu', '#B9BBBD', 0.35, 0.9)
    box('pr_base', (420, 380, 60), P(0, 0, 30), dark, 4, rotz); box('pr_bed', (260, 260, 8), P(0, 20, 78), alum, 1, rotz)
    box('pr_upL', (30, 30, 420), P(-190, -40, 270), alum, 2, rotz); box('pr_upR', (30, 30, 420), P(190, -40, 270), alum, 2, rotz)
    box('pr_top', (410, 30, 30), P(0, -40, 480), alum, 2, rotz); box('pr_x', (400, 22, 22), P(0, -40, 300), alum, 1, rotz)
    box('pr_head', (60, 55, 70), P(30, -15, 300), dark, 4, rotz); box('pr_screen', (90, 10, 55), P(150, 175, 45), MAT['screen'], 2, rotz)
    box('pr_print', (60, 60, 90), P(0, 20, 127), MAT['pp'], 8, rotz)
def mug(x, y, z, col='#E9E4DA'):
    bpy.ops.mesh.primitive_cylinder_add(radius=0.042, depth=0.095, location=(x * MM, y * MM, (z + 47.5) * MM), vertices=64)
    o = bpy.context.object; o.modifiers.new('b', 'BEVEL').width = 0.002; o.data.materials.append(mk_gloss('mug', col)); relink(o)
    for p in o.data.polygons: p.use_smooth = True
def laptop(x, y, z, rotz=0):
    R = Matrix.Rotation(math.radians(rotz), 4, 'Z'); P = lambda a, b, c: Vector((x, y, z)) + R @ Vector((a, b, c))
    alu = mk_cast('lap', '#C7C9CC', 0.3, 0.9); box('lap_base', (304, 212, 12), P(0, 0, 6), alu, 4, rotz)
    o = box('lap_lid', (304, 6, 205), P(0, 105, 105), alu, 4, rotz); o.rotation_euler[0] = math.radians(-12)
def sketches(x, y, z, rotz=0, n=3):
    paper = principled('paper', lin('#F3EFE6'), 0.85)
    for i in range(n): box('sheet', (297, 210, 0.6), (x + i * 30, y + i * 18, z + 0.6 * i), paper, 0, rotz + random.uniform(-14, 14))

# ---------------------------------------------------------------- environments
def floor_grid(dark=False):
    """warm off-white floor with a dark grey 1 ft grid; floor at z = -FOOT"""
    bpy.ops.mesh.primitive_plane_add(size=80, location=(0, 0, -FOOT * MM)); fl = bpy.context.object; fl.name = 'floor'
    m = bpy.data.materials.new('floor'); m.use_nodes = True; n, l = nodes(m); b = n['Principled BSDF']
    b.inputs['Roughness'].default_value = 0.7
    oc = n.new('ShaderNodeTexCoord'); sep = n.new('ShaderNodeSeparateXYZ'); l.new(oc.outputs['Object'], sep.inputs[0])
    def line(axis):
        md = n.new('ShaderNodeMath'); md.operation = 'PINGPONG'; md.inputs[1].default_value = 0.1524   # 1 ft period
        l.new(sep.outputs[axis], md.inputs[0])
        st = n.new('ShaderNodeMath'); st.operation = 'LESS_THAN'; st.inputs[1].default_value = 0.0012
        l.new(md.outputs[0], st.inputs[0]); return st
    mx_ = n.new('ShaderNodeMath'); mx_.operation = 'MAXIMUM'; l.new(line('X').outputs[0], mx_.inputs[0]); l.new(line('Y').outputs[0], mx_.inputs[1])
    mc = n.new('ShaderNodeMix'); mc.data_type = 'RGBA'
    mc.inputs['A'].default_value = lin('#2B2C2E') if dark else lin('#F3EEE6'); mc.inputs['B'].default_value = lin('#55575A') if dark else lin('#6E7073')
    l.new(mx_.outputs[0], mc.inputs['Factor']); l.new(mc.outputs['Result'], b.inputs['Base Color'])
    fl.data.materials.append(m); sc.collection.objects.link(fl) if fl.name not in sc.collection.objects else None
    relink(fl); return fl
def world_studio(key_hex='#F3EEE6', strength=0.35, gradient=True, dark=False):
    """camera sees an airy screen-space gradient keyed to the subject colour; lighting sees neutral white"""
    w = bpy.data.worlds.new('w'); sc.world = w; w.use_nodes = True; n, l = nodes(w); bg = n['Background']
    out = n['World Output']; lp = n.new('ShaderNodeLightPath'); tc = n.new('ShaderNodeTexCoord')
    sep = n.new('ShaderNodeSeparateXYZ'); l.new(tc.outputs['Window'], sep.inputs[0])
    k = lin(key_hex); top = mix(k, [1, 1, 1], 0.82); bot = mix(k, [1, 1, 1], 0.45)
    if dark: top, bot = lin('#1C1D20'), lin('#0C0C0E')
    ramp = n.new('ShaderNodeValToRGB'); ramp.color_ramp.elements[0].color = bot; ramp.color_ramp.elements[1].color = top
    ramp.color_ramp.elements[0].position = 0.05; ramp.color_ramp.elements[1].position = 0.95
    gx = n.new('ShaderNodeMath'); gx.operation = 'MULTIPLY_ADD'; gx.inputs[1].default_value = 0.35; gx.inputs[2].default_value = 0
    l.new(sep.outputs['X'], gx.inputs[0]); ad = n.new('ShaderNodeMath'); ad.operation = 'ADD'
    l.new(sep.outputs['Y'], ad.inputs[0]); l.new(gx.outputs[0], ad.inputs[1]); l.new(ad.outputs[0], ramp.inputs['Fac'])
    cam_bg = n.new('ShaderNodeBackground'); l.new(ramp.outputs['Color'], cam_bg.inputs['Color']); cam_bg.inputs['Strength'].default_value = 1.0
    light_bg = n.new('ShaderNodeBackground'); light_bg.inputs['Color'].default_value = (1, 0.98, 0.96, 1); light_bg.inputs['Strength'].default_value = strength
    ms = n.new('ShaderNodeMixShader'); l.new(lp.outputs['Is Camera Ray'], ms.inputs[0])
    l.new(light_bg.outputs[0], ms.inputs[1]); l.new(cam_bg.outputs[0], ms.inputs[2]); l.new(ms.outputs[0], out.inputs['Surface'])
    if not gradient:
        l.new(light_bg.outputs[0], out.inputs['Surface'])
def sweep(key_hex, target, az, dist, grid=False, dark=False):
    """real curved cyclorama behind the subject, tinted to the subject colour; optional 1 ft grid on the floor part"""
    W = max(9000, dist * 1000 * 2.2); R = 1400; back = max(1500, dist * 1000 * 0.55); Hh = max(5000, dist * 1000 * 1.2)
    prof = [(-W, 0)]
    for i in range(17):
        a = math.pi / 2 * i / 16; prof.append((back - R + R * math.sin(a), R - R * math.cos(a)))
    prof.append((back, Hh))
    bm = bmesh.new(); L = [bm.verts.new((-W, y, z)) for y, z in prof]; Rr = [bm.verts.new((W, y, z)) for y, z in prof]
    for i in range(len(prof) - 1): bm.faces.new((L[i], Rr[i], Rr[i + 1], L[i + 1]))
    me = bpy.data.meshes.new('sweep'); bm.to_mesh(me); bm.free()
    for p_ in me.polygons: p_.use_smooth = True
    o = bpy.data.objects.new('sweep', me); o.scale = (MM,) * 3
    o.location = (target[0] * MM, target[1] * MM, -FOOT * MM); o.rotation_euler[2] = math.radians(az)
    m = bpy.data.materials.new('sweep'); m.use_nodes = True; n, l = nodes(m); b = n['Principled BSDF']; b.inputs['Roughness'].default_value = 0.85
    k = lin(key_hex)
    if sum(k[:3]) / 3 > 0.75: k = lin('#8F8A84')          # white parts need a toned sweep to read
    base = lin('#2B2C2E') if dark else (lin('#D9D2C7') if grid else mix(k, [1, 1, 1], 0.5))
    if grid:
        gc = lin('#55575A') if dark else lin('#8E9093')
        oc = n.new('ShaderNodeTexCoord'); sep = n.new('ShaderNodeSeparateXYZ'); l.new(oc.outputs['Object'], sep.inputs[0])
        def line(axis):
            md = n.new('ShaderNodeMath'); md.operation = 'PINGPONG'; md.inputs[1].default_value = 152.4
            l.new(sep.outputs[axis], md.inputs[0]); st = n.new('ShaderNodeMath'); st.operation = 'LESS_THAN'
            st.inputs[1].default_value = 3.0 if dist < 3 else 6.0; l.new(md.outputs[0], st.inputs[0]); return st
        mx_ = n.new('ShaderNodeMath'); mx_.operation = 'MAXIMUM'; l.new(line('X').outputs[0], mx_.inputs[0]); l.new(line('Y').outputs[0], mx_.inputs[1])
        fl_ = n.new('ShaderNodeMath'); fl_.operation = 'LESS_THAN'; fl_.inputs[1].default_value = 1.0; l.new(sep.outputs['Z'], fl_.inputs[0])
        both = n.new('ShaderNodeMath'); both.operation = 'MULTIPLY'; l.new(mx_.outputs[0], both.inputs[0]); l.new(fl_.outputs[0], both.inputs[1])
        mc = n.new('ShaderNodeMix'); mc.data_type = 'RGBA'; mc.inputs['A'].default_value = base; mc.inputs['B'].default_value = gc
        l.new(both.outputs[0], mc.inputs['Factor']); l.new(mc.outputs['Result'], b.inputs['Base Color'])
    else:
        b.inputs['Base Color'].default_value = base
    me.materials.append(m); coll(CUR[0]).objects.link(o); return o
def world_plain(strength=0.25, dark=False):
    w = bpy.data.worlds.new('w'); sc.world = w; w.use_nodes = True; bg = w.node_tree.nodes['Background']
    bg.inputs['Color'].default_value = (0.02, 0.022, 0.03, 1) if dark else (1, 0.985, 0.97, 1); bg.inputs['Strength'].default_value = strength
def softbox(target, scale):
    t = Vector(target)
    area('top', t + Vector((0.3, 0.6, 3.2)) * scale, 900 * scale ** 2, 3.0 * scale, target=t)
def shadow_catcher():
    bpy.ops.mesh.primitive_plane_add(size=60, location=(0, 0, -FOOT * MM)); o = bpy.context.object; o.is_shadow_catcher = True; relink(o); return o
def area(name, loc, power, size, color=(1, 0.97, 0.93), target=(0, 0, 0.4), spread=180):
    l = bpy.data.lights.new(name, 'AREA'); l.shape = 'DISK'; l.size = size; l.energy = power; l.color = color
    l.spread = math.radians(spread)
    o = bpy.data.objects.new(name, l); o.location = loc; coll(CUR[0]).objects.link(o)
    d = Vector(target) - Vector(loc); o.rotation_euler = d.to_track_quat('-Z', 'Y').to_euler(); return o
def studio_lights(scale=1.0, target=(0, 0, 0.4)):
    t = Vector(target)
    area('key', t + Vector((-2.2, -2.6, 3.0)) * scale, 600 * scale ** 2, 2.2 * scale, target=t)
    area('fill', t + Vector((3.0, -2.0, 1.0)) * scale, 160 * scale ** 2, 3.0 * scale, (0.95, 0.97, 1.0), target=t)
    area('rim', t + Vector((1.2, 3.0, 2.6)) * scale, 450 * scale ** 2, 1.5 * scale, target=t)
def sun_room(hour='golden', strength=1.0):
    w = bpy.data.worlds.new('sky'); sc.world = w; w.use_nodes = True; n, l = nodes(w); bg = n['Background']
    sky = n.new('ShaderNodeTexSky')
    try: sky.sky_type = 'NISHITA'
    except Exception: pass
    elev = {'golden': 7, 'morning': 22, 'day': 45, 'night': -8}[hour]
    try:
        sky.sun_elevation = math.radians(elev); sky.sun_rotation = math.radians(215 if hour == 'golden' else 120)
        sky.altitude = 200; sky.air_density = 1.4; sky.dust_density = 2.0 if hour == 'golden' else 1.0
    except Exception: pass
    l.new(sky.outputs['Color'], bg.inputs['Color']); bg.inputs['Strength'].default_value = (0.004 if hour == 'night' else 0.18) * strength
# ---------------------------------------------------------------- real-world assets (Poly Haven, CC0), cached in ./assets
PH = os.path.join(HERE, 'assets')
def _get(url, dst):
    if os.path.exists(dst) and os.path.getsize(dst) > 0: return True
    os.makedirs(os.path.dirname(dst), exist_ok=True)
    r = subprocess.run(['curl', '-sSfL', '-A', 'og-render/1.0', '-o', dst + '.part', url])
    if r.returncode == 0: os.replace(dst + '.part', dst); return True
    WARN.append('download failed ' + url); return False
def _api(aid, kind):
    f = os.path.join(PH, kind, aid, 'files.json')
    if not _get('https://api.polyhaven.com/files/' + aid, f): return None
    return json.load(open(f))
def _fix_images(folder):
    for img in bpy.data.images:
        if not img.filepath or os.path.exists(bpy.path.abspath(img.filepath)): continue
        for c in glob.glob(os.path.join(folder, '**', os.path.basename(img.filepath)), recursive=True):
            img.filepath = c; break
def ph_model(aid, loc, rotz=0, height=None, scale=1.0, res='2k'):
    """append a Poly Haven model; loc in mm with z = floor level; returns (root, top_z_mm) or (None, 0)"""
    try:
        d = _api(aid, 'models'); bl = d['blend'][res]['blend'] if res in d['blend'] else d['blend']['1k']['blend']
        mdir = os.path.join(PH, 'models', aid); path = os.path.join(mdir, os.path.basename(bl['url']))
        ok = _get(bl['url'], path)
        for rel, inf in bl.get('include', {}).items(): _get(inf['url'], os.path.join(mdir, rel))
        if not ok: return None, 0
        with bpy.data.libraries.load(path, link=False) as (src, dst): dst.objects = list(src.objects)
        objs = [o for o in dst.objects if o is not None]; _fix_images(mdir)
        root = bpy.data.objects.new(aid, None); coll(CUR[0]).objects.link(root)
        for o in objs:
            coll(CUR[0]).objects.link(o)
            if o.parent is None or o.parent not in objs: o.parent = root
        bpy.context.view_layer.update()
        zs = [(o.matrix_world @ Vector(c)).z for o in objs if o.type == 'MESH' for c in o.bound_box]
        h = (max(zs) - min(zs)) if zs else 1.0
        k = (height * MM / h) if height else scale
        root.scale = (k, k, k); root.rotation_euler[2] = math.radians(rotz); root.location = Vector(loc) * MM
        bpy.context.view_layer.update()
        top = max((o.matrix_world @ Vector(c)).z for o in objs if o.type == 'MESH' for c in o.bound_box) / MM
        return root, top
    except Exception as e:
        WARN.append('model %s failed: %s' % (aid, e)); return None, 0
TEXKEYS = {'diff': 'Diffuse', 'rough': 'Rough', 'nor_gl': 'nor_gl', 'ao': 'AO'}
def ph_tex(aid, scale_m=1.5, tint=None, rough_mul=1.0, rough_add=0.0, normal=1.0):
    """box-projected PBR material from a Poly Haven texture set; None if unavailable"""
    folder = os.path.join(PH, 'tex', aid); maps = {}
    for k, api_k in TEXKEYS.items():
        f = (glob.glob(os.path.join(folder, '*_%s_2k.jpg' % k)) or glob.glob(os.path.join(folder, '*_%s_*.jpg' % k)) or [None])[0]
        if f is None:
            d = _api(aid, 'tex')
            try:
                u = d[api_k]['2k']['jpg']['url']; f = os.path.join(folder, os.path.basename(u))
                if not _get(u, f): f = None
            except Exception: f = None
        if f: maps[k] = f
    if 'diff' not in maps: WARN.append('texture %s missing' % aid); return None
    m = bpy.data.materials.new('tex_' + aid); m.use_nodes = True; n, l = nodes(m); b = n['Principled BSDF']
    tc = n.new('ShaderNodeTexCoord'); mp = n.new('ShaderNodeMapping'); mp.inputs['Scale'].default_value = (1 / scale_m,) * 3
    l.new(tc.outputs['Object'], mp.inputs['Vector'])
    def img(k, cs):
        t = n.new('ShaderNodeTexImage'); t.image = bpy.data.images.load(maps[k], check_existing=True)
        t.image.colorspace_settings.name = cs; t.projection = 'BOX'; t.projection_blend = 0.25
        l.new(mp.outputs['Vector'], t.inputs['Vector']); return t
    dif = img('diff', 'sRGB'); col = dif.outputs['Color']
    if 'ao' in maps:
        ao = img('ao', 'Non-Color'); mu = n.new('ShaderNodeMix'); mu.data_type = 'RGBA'; mu.blend_type = 'MULTIPLY'
        mu.inputs['Factor'].default_value = 0.6; l.new(col, mu.inputs['A']); l.new(ao.outputs['Color'], mu.inputs['B']); col = mu.outputs['Result']
    if tint:
        tn = n.new('ShaderNodeMix'); tn.data_type = 'RGBA'; tn.blend_type = 'MULTIPLY'; tn.inputs['Factor'].default_value = 1.0
        l.new(col, tn.inputs['A']); tn.inputs['B'].default_value = lin(tint); col = tn.outputs['Result']
    l.new(col, b.inputs['Base Color'])
    if 'rough' in maps:
        r = img('rough', 'Non-Color'); ma = n.new('ShaderNodeMath'); ma.operation = 'MULTIPLY_ADD'; ma.use_clamp = True
        ma.inputs[1].default_value = rough_mul; ma.inputs[2].default_value = rough_add
        l.new(r.outputs['Color'], ma.inputs[0]); l.new(ma.outputs[0], b.inputs['Roughness'])
    if 'nor_gl' in maps:
        nm = n.new('ShaderNodeNormalMap'); nm.inputs['Strength'].default_value = normal
        l.new(img('nor_gl', 'Non-Color').outputs['Color'], nm.inputs['Color']); l.new(nm.outputs['Normal'], b.inputs['Normal'])
    return m
def hdri_world(aid, strength, rot=0):
    f = (glob.glob(os.path.join(PH, 'hdri', aid + '*.exr')) or glob.glob(os.path.join(PH, 'hdri', aid + '*.hdr')) or [None])[0]
    if f is None:
        try:
            u = _api(aid, 'hdri')['hdri']['4k']['exr']['url']; f = os.path.join(PH, 'hdri', os.path.basename(u))
            if not _get(u, f): return False
        except Exception: return False
    w = bpy.data.worlds.new('hdri'); sc.world = w; w.use_nodes = True; n, l = nodes(w); bg = n['Background']
    tc = n.new('ShaderNodeTexCoord'); mp = n.new('ShaderNodeMapping'); mp.inputs['Rotation'].default_value[2] = math.radians(rot)
    ev = n.new('ShaderNodeTexEnvironment'); ev.image = bpy.data.images.load(f, check_existing=True)
    l.new(tc.outputs['Generated'], mp.inputs['Vector']); l.new(mp.outputs['Vector'], ev.inputs['Vector'])
    l.new(ev.outputs['Color'], bg.inputs['Color']); bg.inputs['Strength'].default_value = strength; return True
def window_glass():
    """thin architectural glass: reflective to the camera, invisible to shadow rays (no caustic noise)"""
    m = bpy.data.materials.new('winglass'); m.use_nodes = True; n, l = nodes(m); n.remove(n['Principled BSDF']); out = n['Material Output']
    tr = n.new('ShaderNodeBsdfTransparent'); gl = n.new('ShaderNodeBsdfGlossy'); gl.inputs['Roughness'].default_value = 0.01
    lw = n.new('ShaderNodeLayerWeight'); lw.inputs['Blend'].default_value = 0.12
    m1 = n.new('ShaderNodeMixShader'); l.new(lw.outputs['Fresnel'], m1.inputs[0]); l.new(tr.outputs[0], m1.inputs[1]); l.new(gl.outputs[0], m1.inputs[2])
    lp = n.new('ShaderNodeLightPath'); tr2 = n.new('ShaderNodeBsdfTransparent'); m2 = n.new('ShaderNodeMixShader')
    l.new(lp.outputs['Is Shadow Ray'], m2.inputs[0]); l.new(m1.outputs[0], m2.inputs[1]); l.new(tr2.outputs[0], m2.inputs[2])
    l.new(m2.outputs[0], out.inputs['Surface']); return m
def framed_print(x, y, rotz, w, h, paper_hex, block_hex, lean=7):
    R = Matrix.Rotation(math.radians(rotz), 4, 'Z'); P = lambda a, b, c: Vector((x, y, 0)) + R @ Vector((a, b, c))
    fr = principled('printframe', lin('#1B1B1C'), 0.45); pa = principled('paper', lin(paper_hex), 0.9); bl = principled('ink', lin(block_hex), 0.8)
    parts = [box('pf', (w, 30, h), P(0, 0, h / 2 - FOOT), fr, 2, rotz), box('pp', (w - 60, 4, h - 60), P(0, -16, h / 2 - FOOT), pa, 0, rotz),
             box('pb', (w * 0.45, 3, h * 0.35), P(-w * 0.08, -19, h * 0.55 - FOOT), bl, 0, rotz)]
    piv = Vector((x, y, -FOOT)) * MM
    for o in parts:
        o.matrix_world = Matrix.Translation(piv) @ Matrix.Rotation(math.radians(-lean), 4, R @ Vector((1, 0, 0))) @ Matrix.Translation(-piv) @ o.matrix_world
ROOMS = {   # floor texture, floor tint, wall tint, world hdri per hour
    'studio': ('concrete_floor_worn_001', '#E6E1DA', '#F4F0EA'),
    'rest': ('laminate_floor_02', '#FFFFFF', '#F2ECE3'),
    'shop': ('concrete_floor_worn_001', '#C9C4BC', '#ECE9E4')}
HDRI = {'golden': ('potsdamer_platz', 0.7, 150), 'morning': ('potsdamer_platz', 0.8, 60), 'day': ('potsdamer_platz', 0.9, 90), 'night': ('rooftop_night', 0.08, 0)}
def room(kind, hour, target=(0, 0, 0)):
    """studio interior: textured floor + plaster walls, full-height steel window on the right, beams, props by the walls"""
    xs = [k[0] for k in POSTS] or [target[0]]; ys = [k[1] for k in POSTS] or [target[1]]
    cx = (min(xs) + max(xs) + G) / 2; cy = (min(ys) + max(ys)) / 2
    cam = CAM.location / MM if CAM else Vector((cx, cy - 4000, 1500))
    W = max(4200, abs(cam.x - cx) + 900); Hh = 3400; T = 200
    back = max(ys) + (450 if kind == 'shop' else 2100); front = min(cam.y - 900, cy - 4000)
    lx, rx = cx - W, cx + W; D = back - front; my = (back + front) / 2
    fl_id, fl_tint, wall_tint = ROOMS[kind]
    floor = ph_tex(fl_id, 1.6 if kind != 'rest' else 2.4, fl_tint, 0.9, 0.0) or mk_cast('concrete', '#BDB7AE', 0.8, 0)
    walls = ph_tex('painted_plaster_wall', 2.0, wall_tint, 1.0, 0.1, 0.6) or principled('wall', lin('#EEEAE3'), 0.9)
    ceil_m = principled('ceil', lin('#F1EEE9'), 0.92); steel = mk_cast('steel', '#1C1D1F', 0.38, 0.85)
    skirt = principled('skirt', lin('#ECE8E1'), 0.35)
    box('floor', (2 * W + 2 * T, D, 40), (cx, my, -FOOT - 20), floor, 0)
    box('ceiling', (2 * W + 2 * T, D, 60), (cx, my, Hh - FOOT + 30), ceil_m, 0)
    box('back', (2 * W, T, Hh), (cx, back + T / 2, Hh / 2 - FOOT), walls, 0)
    box('left', (T, D, Hh), (lx - T / 2, my, Hh / 2 - FOOT), walls, 0)
    fw = box('front', (2 * W, T, Hh), (cx, front - T / 2, Hh / 2 - FOOT), walls, 0); fw.visible_camera = False
    for nm, size, loc in [('sk_back', (2 * W, 14, 110), (cx, back - 7, 55 - FOOT)), ('sk_left', (14, D, 110), (lx + 7, my, 55 - FOOT))]:
        box(nm, size, loc, skirt, 1)
    # right wall: full-height steel studio window with sill, head and 200 mm reveals
    y0, y1 = front + 600, back - 500; z0, z1 = 380, Hh - 320
    box('r_sill', (T, D, z0), (rx + T / 2, my, z0 / 2 - FOOT), walls, 0)
    box('r_head', (T, D, Hh - z1), (rx + T / 2, my, (z1 + Hh) / 2 - FOOT), walls, 0)
    box('r_a', (T, y0 - front, z1 - z0), (rx + T / 2, (front + y0) / 2, (z0 + z1) / 2 - FOOT), walls, 0)
    box('r_b', (T, back - y1, z1 - z0), (rx + T / 2, (back + y1) / 2, (z0 + z1) / 2 - FOOT), walls, 0)
    box('sill_board', (T + 60, y1 - y0 + 40, 30), (rx + T / 2 - 30, (y0 + y1) / 2, z0 + 15 - FOOT), principled('sillb', lin('#E9E5DE'), 0.3), 2)
    bays = max(3, round((y1 - y0) / 1100)); fz = [z0 + 30, z0 + (z1 - z0) * 0.32, z1]
    for k in range(bays + 1):
        yy = y0 + (y1 - y0) * k / bays; box('mullion', (100, 50, z1 - z0), (rx + T / 2, yy, (z0 + z1) / 2 - FOOT), steel, 3)
    for zz in fz: box('transom', (100, y1 - y0 + 50, 45), (rx + T / 2, (y0 + y1) / 2, zz - FOOT), steel, 3)
    g = box('glass', (6, y1 - y0, z1 - z0), (rx + T / 2, (y0 + y1) / 2, (z0 + z1) / 2 - FOOT), window_glass(), 0)
    # exposed ceiling beams
    for k in range(int(D // 1800) + 1):
        box('beam', (2 * W, 220, 300), (cx, front + 900 + k * 1800, Hh - FOOT - 150), ceil_m, 4)
    # sky / outside
    hid, hs, hrot = HDRI[hour]
    if not hdri_world(hid, hs, hrot): sun_room(hour)
    # sun through the window (travels toward -x), window light portal, soft bounce
    if hour != 'night':
        s = bpy.data.lights.new('sun', 'SUN'); s.energy = {'golden': 5.0, 'morning': 3.2, 'day': 4.5}[hour]; s.angle = math.radians(0.8)
        s.color = {'golden': (1.0, 0.74, 0.5), 'morning': (0.95, 0.97, 1.0), 'day': (1, 0.97, 0.93)}[hour]
        so = bpy.data.objects.new('sun', s); coll(CUR[0]).objects.link(so)
        so.rotation_euler = Euler((math.radians({'golden': 76, 'morning': 62, 'day': 48}[hour]), 0, math.radians(68)))
        pl = bpy.data.lights.new('portal', 'AREA'); pl.shape = 'RECTANGLE'; pl.size = (z1 - z0) * MM; pl.size_y = (y1 - y0) * MM
        try: pl.cycles.is_portal = True
        except Exception:
            try: pl.is_portal = True
            except Exception: pass
        po = bpy.data.objects.new('portal', pl); po.location = ((rx - 30) * MM, (y0 + y1) / 2 * MM, (z0 + z1) / 2 * MM - FOOT * MM)
        po.rotation_euler = Euler((0, math.radians(90), 0)); coll(CUR[0]).objects.link(po)
        area('window_fill', ((rx - 400) * MM, (y0 + y1) / 2 * MM, 1.7), 350, 2.5, (0.93, 0.95, 1.0), target=(cx * MM, cy * MM, 0.8))
    else:
        for k, (px, py) in enumerate([(cx - W * 0.5, cy - 600), (cx + W * 0.3, cy + 400)]):
            pt = bpy.data.lights.new('pend%d' % k, 'POINT'); pt.energy = 90; pt.color = (1.0, 0.78, 0.55); pt.shadow_soft_size = 0.12
            po = bpy.data.objects.new('pend', pt); po.location = (px * MM, py * MM, (Hh - 700) * MM); coll(CUR[0]).objects.link(po)
    # props along the walls only (never inside the build area)
    bx0, bx1, by0, by1 = min(xs) - 600, max(xs) + G + 600, min(ys) - 600, max(ys) + 600
    def free(x, y): return not (bx0 < x < bx1 and by0 < y < by1)
    def prop(aid, x, y, rotz=0, height=None, **k):
        if free(x, y): return ph_model(aid, (x, y, -FOOT), rotz, height, **k)
        return None, 0
    if kind == 'studio':
        prop('steel_frame_shelves_01', lx + 260, cy - 900, 90, 1900); prop('steel_frame_shelves_01', lx + 260, cy + 100, 90, 1900)
        prop('potted_plant_02', lx + 650, back - 650, 20, 1250); prop('potted_plant_04', rx - 450, back - 450, 0, 480)
        prop('pachira_aquatica_01', rx - 700, y0 + 500, 0, 1500)
        if free(cx - 900, back - 120): framed_print(cx - 900, back - 120, 0, 700, 950, '#EEE8DD', '#C4532E')
        if free(cx - 300, back - 140): framed_print(cx - 300, back - 140, 4, 500, 700, '#F3EFE7', '#2F3B4A')
    elif kind == 'rest':
        prop('potted_plant_02', rx - 600, y0 + 700, 0, 1100); prop('potted_plant_01', lx + 500, back - 500, 0, 900)
        prop('wooden_display_shelves_01', cx + 900, back - 230, 0, 1100)
        if free(lx + 900, back - 700):
            box('rug', (2200, 1500, 8), (lx + 1600, cy - 800, -FOOT + 4), mk_felt('rug', '#9C8468'), 3)
    elif kind == 'shop':
        if hour == 'night':
            wl = bpy.data.lights.new('worklamp', 'SPOT'); wl.energy = 160; wl.spot_size = math.radians(70); wl.color = (1.0, 0.8, 0.58)
            wo = bpy.data.objects.new('worklamp', wl); wo.location = ((cx + 300) * MM, (cy - 900) * MM, 1.7); coll(CUR[0]).objects.link(wo)
        for k in range(3):
            tl = bpy.data.lights.new('tube%d' % k, 'AREA'); tl.shape = 'RECTANGLE'; tl.size = 1.5; tl.size_y = 0.12; tl.energy = 220 if hour != 'night' else 0
            tl.color = (0.96, 0.98, 1.0); to = bpy.data.objects.new('tube', tl); coll(CUR[0]).objects.link(to)
            to.location = ((cx - W * 0.5 + k * W * 0.5) * MM, (cy - 800) * MM, (Hh - 500) * MM)
        prop('steel_frame_shelves_02', lx + 260, cy - 400, 90, 1900); prop('tool_cart', rx - 1000, back - 700, -20)
        prop('metal_stool_01', cx - 300, cy - 1500, 30); prop('potted_plant_04', rx - 500, y0 + 400, 0, 450)
    # haze, very subtle
    bpy.ops.mesh.primitive_cube_add(size=1, location=(cx * MM, my * MM, (Hh / 2 - FOOT) * MM)); hz = bpy.context.object
    hz.scale = (2 * W * MM * 0.98, D * MM * 0.98, Hh * 0.98 * MM)
    hm = bpy.data.materials.new('haze'); hm.use_nodes = True; n, l = nodes(hm); n.remove(n['Principled BSDF'])
    vs = n.new('ShaderNodeVolumePrincipled'); vs.inputs['Density'].default_value = 0.004 if hour != 'night' else 0.006
    l.new(vs.outputs[0], n['Material Output'].inputs['Volume']); hz.data.materials.append(hm); relink(hz)
    try: sc.view_settings.look = 'AgX - Base Contrast'
    except Exception: pass

# ---------------------------------------------------------------- camera
CAM = None; CAMINFO = {}
def camera(target, az, el, dist, lens, dof=None, shift=(0, 0)):
    global CAM
    CAMINFO.update(az=az, dist=dist)
    if CAM is None:
        CAM = bpy.data.objects.new('cam', bpy.data.cameras.new('cam')); sc.collection.objects.link(CAM); sc.camera = CAM
    t = Vector(target) * MM; a, e = math.radians(az), math.radians(el)
    CAM.location = t + Vector((math.sin(a) * math.cos(e), -math.cos(a) * math.cos(e), math.sin(e))) * dist
    CAM.rotation_euler = (t - CAM.location).to_track_quat('-Z', 'Y').to_euler()
    c = CAM.data; c.lens = lens; c.clip_start = 0.005; c.clip_end = 200; c.shift_x, c.shift_y = shift
    c.sensor_width = 36
    c.dof.use_dof = dof is not None
    if dof: c.dof.focus_distance = (t - CAM.location).length; c.dof.aperture_fstop = dof

# ---------------------------------------------------------------- the system builders
def lattice(variant='hero'):
    """maximalist lattice: 3 rows x 3 columns of stacked frames, every module and attachment"""
    LV = [[3, 2, 4], [2, 3, 2], [1, 2, 3]]
    tops = []
    for r, row in enumerate(LV):
        for c, n in enumerate(row):
            x = c * G * 1.0 + (c * 2 * G - c * G); y = r * G
            tA, tB = column(c * 2 * G - c * G if False else c * G * 2, r * G, n, feet=True, power_foot=(r == 0 and c == 0))
            tops += [tA, tB]
    return tops, LV

# ---------------------------------------------------------------- shots
SHOTS = {}
def shot(sid, name, bg, key='frame', versions=('day',), exposure=0.0):
    def deco(fn): SHOTS[sid] = dict(name=name, bg=bg, key=key, fn=fn, versions=versions, exposure=exposure); return fn
    return deco

def top_attach(tops, keys):
    for t, k in zip(tops, keys):
        if k == 'cap': put('cap', t, mat='cap')
        elif k: att(k, t, face=random.choice((0, 0, 20, -20)))

@shot('01', 'hero', 'room:studio:golden', versions=('day', 'night'))
def s01(night):
    tops = []
    cols = [(0, 0, 3), (2 * G, 0, 2), (4 * G, 0, 4), (0, G, 2), (2 * G, G, 3), (4 * G, G, 4), (0, 2 * G, 1), (2 * G, 2 * G, 2), (4 * G, 2 * G, 3)]
    for i, (x, y, n) in enumerate(cols):
        tA, tB = column(x, y, n, power_foot=(i == 0)); tops += [tA, tB]
    keys = ['spot', 'cap', 'grow', 'clock', 'speaker', 'cap', 'hub', 'pen', 'grow', 'spot', 'cap', 'clock', 'pen', 'cap', 'grow', 'speaker', 'spot', 'cap']
    top_attach(tops, keys)
    shelf_on(G / 2, G / 2, 280); shelf_on(2 * G + G / 2, G / 2, H + 200); shelf_on(4 * G + G / 2, G / 2, 2 * H - 100)
    planter_on(G / 2, 1.5 * G, 230); planter_on(4 * G + G / 2, 1.5 * G, 260)
    panel_between(2 * G, 3 * G, 0, 120, 'pegboard'); panel_between(2 * G, 3 * G, 0, 120 + HS, 'whiteboard')
    panel_between(4 * G, 5 * G, 0, 140, 'softboard')
    tuft(G / 2, 1.5 * G, 330, 44, 320, spread=200); tuft(4.5 * G, 1.5 * G, 360, 40, 300, 'fern', 190)
    climb((G, G), 30, 900, 2.6); climb((4 * G, 2 * G), 30, 1300, 3.0, trail=6); climb((2 * G, 2 * G), 30, 700, 2.0)
    camera((1300, 500, 700), -30, 11, 4.4, 35, dof=5.6)
    return (1350, 650, 650)

@shot('02', 'exploded-system', 'grad', key='frame')
def s02(night):
    z0 = 300
    put('pfoot', (0, 0, 0), mat='alu_pf'); put('foot', (G, 0, 0), mat='alu'); put('frame', (0, 0, z0))
    put('connector', (0, 0, z0 + H + 150), mat='pom'); put('cap', (G, 0, z0 + HS + 150), mat='cap')
    att('spot', (0, 0, z0 + H + 150 + 230))
    put('clamp', (G + 330, 0, z0 + 200), (0, 0, -30), mat='clamp'); put('clamp', (G + 330, 0, z0 + 420), (0, 0, -30), mat='clamp')
    put('shelf', (G + 900, 250, z0 + 780), (8, -6, 20), mat='oak')
    put('pegpanel', (G + 900, -200, z0 + 120), (0, 0, 160), mats=['pegboard', 'pegboard'])
    put('vclip', (G + 330, 0, z0 + 640), (0, 0, 40), mat='clip')
    camera((G + 300, 0, 760), -22, 9, 5.2, 50)
    return (G + 300, 0, 760)

@shot('03', 'growth', 'grid', versions=('day',))
def s03(night):
    # five stages side by side, same camera height
    off = 0
    def st(fn): nonlocal off; fn(off); off += 3 * G
    st(lambda x: column(x, 0, 1))
    st(lambda x: (column(x, 0, 1), column(x, G, 1), shelf_on(x + G / 2, G / 2, 250)))
    st(lambda x: (column(x, 0, 2), column(x, G, 2), shelf_on(x + G / 2, G / 2, 250), att('grow', (x + G, G, H + HS))))
    st(lambda x: (column(x, 0, 2), column(x, G, 2), column(x + 2 * G, 0, 2), shelf_on(x + G / 2, G / 2, 250), planter_on(x + G / 2, G / 2, H + 120),
                  att('grow', (x + G, G, H + HS)), panel_between(x + 2 * G, x + 3 * G, 0, 120, 'pegboard')))
    st(lambda x: (column(x, 0, 3), column(x, G, 2), column(x + 2 * G, 0, 2), column(x + 2 * G, G, 1), shelf_on(x + G / 2, G / 2, 250),
                  planter_on(x + G / 2, G / 2, H + 120), att('grow', (x + G, G, H + HS)), att('spot', (x, 0, H + HS + H)),
                  panel_between(x + 2 * G, x + 3 * G, 0, 120, 'pegboard'), climb((x, G, 0), 30, 900, 2.4)))
    camera((off / 2 - 0.5 * G, 300, 550), -6, 9, 12.6, 55)
    return (off / 2, 300, 600)

def macro(key, mats, loc_cam, lens=100, f=2.8, rot=(0, 0, 0)):
    o = put(key, (0, 0, 0), rot, mats=mats); bpy.context.view_layer.update()
    bb = [o.matrix_world @ Vector(c) for c in o.bound_box]; mn = Vector([min(v[i] for v in bb) for i in range(3)]); mx = Vector([max(v[i] for v in bb) for i in range(3)])
    c = (mn + mx) / 2 / MM; rad = (mx - mn).length / 2
    d = rad / math.tan(math.atan(12 / lens)) * 1.25
    camera(tuple(c), loc_cam[0], loc_cam[1], d, lens, dof=f); return tuple(c)

@shot('04', 'macro-plus-socket', 'grad', key='pom')
def s04(night):
    put('frame', (0, 0, -H + 60)); put('connector', (0, 0, 60), mat='pom')
    camera((0, 0, 70), -30, 34, 0.42, 100, dof=4); return (0, 0, 70)
@shot('05', 'macro-clamp', 'grad', key='clamp')
def s05(night):
    column(0, 0, 2); panel_between(0, G, 0, 300, 'softboard')
    camera((0, -60, 300), -38, 14, 0.8, 100, dof=5.6); return (0, -60, 300)
@shot('06', 'macro-grow-light-planter', 'grad', key='att_grow', versions=('day', 'night'))
def s06(night):
    column(0, 0, 1, feet=False); column(0, G, 1, feet=False); planter_on(G / 2, G / 2, 180); tuft(G / 2, G / 2, 280, 30, 160)
    att('grow', (0, G, H)); put('cap', (G, 0, HS), mat='cap')
    if night:                                   # the grow light's own wash on the planter
        gl = bpy.data.lights.new('growwash', 'SPOT'); gl.energy = 18; gl.spot_size = math.radians(80); gl.spot_blend = 0.8; gl.color = (1.0, 0.82, 0.9)
        go = bpy.data.objects.new('growwash', gl); go.location = (G / 2 * MM, G * 0.75 * MM, (H + 120) * MM); coll(CUR[0]).objects.link(go)
    camera((150, 350, 520), -24, 18, 2.3, 70, dof=5.6); return (150, 350, 520)
@shot('07', 'macro-power-in-foot', 'grid', key='alu')
def s07(night):
    put('frame', (0, 0, 0)); put('pfoot', (0, 0, 0), mat='alu_pf')
    cable = [(-30, -400, -FOOT + 4), (-30, -250, -FOOT + 4), (-20, -150, -FOOT + 6), (-10, -120, -10)]
    cu = bpy.data.curves.new('cable', 'CURVE'); cu.dimensions = '3D'; cu.bevel_depth = 3 * MM; sp = cu.splines.new('NURBS'); sp.points.add(len(cable) - 1)
    for p, q in zip(sp.points, cable): p.co = (q[0] * MM, q[1] * MM, q[2] * MM, 1)
    co = bpy.data.objects.new('cable', cu); co.data.materials.append(principled('cable', lin('#1C1C1C'), 0.5)); coll(CUR[0]).objects.link(co)
    camera((0, -40, 30), -34, 20, 0.95, 85, dof=4); return (0, -40, 30)

@shot('11', 'material-macro', 'grad', key='oak')
def s11(night):
    chips = ['frame', 'alu', 'pom', 'oak', 'pp', 'whiteboard', 'pegboard', 'softboard', 'cap', 'att_spot', 'att_grow', 'att_speaker']
    for i, k in enumerate(chips):
        x = (i % 6) * 70 - 175; y = (i // 6) * 70
        bpy.ops.mesh.primitive_cube_add(size=1, location=(x * MM, y * MM, (6.5 - FOOT) * MM)); o = bpy.context.object; o.scale = (0.06, 0.06, 0.012)
        bpy.ops.object.transform_apply(scale=True); b = o.modifiers.new('b', 'BEVEL'); b.width = 0.004; b.segments = 6
        for p in o.data.polygons: p.use_smooth = True
        o.rotation_euler[2] = math.radians(random.uniform(-6, 6)); o.data.materials.append(MAT[k]); relink(o)
    camera((0, 35, -16), -20, 38, 0.75, 85, dof=5.6); return (0, 35, -16)

@shot('12', 'attachments', 'grad', key='att_spot')
def s12(night):
    keys = ['grow', 'spot', 'hub', 'pen', 'clock', 'speaker']
    for i, k in enumerate(keys):
        x = i * 250 - 625
        bpy.ops.mesh.primitive_cylinder_add(radius=38.1 * MM, depth=0.302, location=(x * MM, 0, 0.129), vertices=128); s = bpy.context.object
        for p in s.data.polygons: p.use_smooth = True
        s.data.materials.append(MAT['frame']); relink(s); att(k, (x, 0, 280), face=0)
    camera((0, 0, 280), 0, 8, 3.3, 70); return (0, 0, 280)

@shot('13', 'power-path', 'grad', key='hi')
def s13(night):
    tops = []
    for i, (x, y, n) in enumerate([(0, 0, 2), (0, G, 2), (2 * G, 0, 1)]): tA, tB = column(x, y, n, power_foot=(i == 0)); tops += [tA, tB]
    for o in list(coll(CUR[0]).objects):
        if o.data and o.data.name in ('frame', 'connector'):
            for sl in o.material_slots: sl.material = MAT['ghost']
    for t, k in zip(tops, ['spot', 'grow', 'clock', 'cap', 'hub', 'cap']):
        if k == 'cap': put('cap', t, mat='muted')
        else: att(k, t)
    def wire(pts):
        cu = bpy.data.curves.new('wire', 'CURVE'); cu.dimensions = '3D'; cu.bevel_depth = 6 * MM; sp = cu.splines.new('POLY'); sp.points.add(len(pts) - 1)
        for p, q in zip(sp.points, pts): p.co = (q[0] * MM, q[1] * MM, q[2] * MM, 1)
        o = bpy.data.objects.new('wire', cu); o.data.materials.append(MAT['power']); coll(CUR[0]).objects.link(o)
    wire([(0, -480, -FOOT + 6), (0, -45, -FOOT + 6), (0, 0, 10), (0, 0, H + HS - 25)]); wire([(0, 0, CB), (G, 0, CB), (G, 0, H + HS - 25)])
    wire([(0, 0, 40), (0, G, 40), (0, G, H + HS - 25)])
    camera((450, 400, 650), -36, 20, 4.6, 50); return (450, 400, 650)

@shot('14', 'concept-spotlight', 'grid-dark', key='att_spot', versions=('night',))
def s14(night):
    column(0, 0, 1); att('spot', (0, 0, H)); put('cap', (G, 0, HS), mat='cap')
    l = bpy.data.lights.new('beam', 'SPOT'); l.energy = 120; l.spot_size = math.radians(38); l.spot_blend = 0.6; l.color = (1, 0.86, 0.7)
    o = bpy.data.objects.new('beam', l); o.location = (0, -0.06, (H + 195) * MM); o.rotation_euler = (math.radians(55), 0, 0); coll(CUR[0]).objects.link(o)
    area('rim_night', (0.9, 1.2, 1.4), 25, 1.2, (0.6, 0.7, 1.0), target=(0.26, 0, 0.4))
    area('fill_night', (-1.5, -1.8, 0.9), 6, 2.0, (0.8, 0.85, 1.0), target=(0.26, 0, 0.4))
    area('top_night', (0.3, -0.4, 2.2), 14, 2.5, (0.85, 0.9, 1.0), target=(0.26, 0, 0.4))     # gives the silver frame something to reflect
    camera((260, 0, 420), -30, 6, 2.6, 50, dof=4); return (260, 0, 420)

@shot('15', 'combinations', 'grid', key='frame', exposure=-1.8)
def s15(night):
    layouts = [[(0, 0, 1)], [(0, 0, 2), (0, G, 1)], [(0, 0, 1), (2 * G, 0, 1)], [(0, 0, 3), (0, G, 2), (2 * G, 0, 1)], [(0, 0, 2), (2 * G, 0, 2), (0, G, 2), (2 * G, G, 2)],
               [(0, 0, 1), (0, G, 1), (0, 2 * G, 1)]]
    for i, lay in enumerate(layouts):
        ox = (i % 3) * 2400; oy = (i // 3) * 2400; tops = []
        for (x, y, n) in lay: tA, tB = column(ox + x, oy + y, n); tops += [tA, tB]
        top_attach(tops, random.sample(['spot', 'grow', 'clock', 'hub', 'pen', 'speaker', 'cap', 'cap'], k=min(8, len(tops))) + ['cap'] * 8)
        if any(x == 0 and y == G for (x, y, n) in lay): shelf_on(ox + G / 2, oy + G / 2, 260)
    camera((2600, 1500, 400), -30, 32, 11.5, 45); return (2600, 1500, 400)

@shot('16', 'closing-hero', 'room:studio:golden')
def s16(night):
    r = s01(night); camera((1350, 650, 900), 38, 6, 5.6, 35, dof=8); return r

@shot('08', 'lifestyle-studio', 'room:studio:golden', versions=('day', 'night'))
def s08(night):
    tops = []
    for i, (x, y, n) in enumerate([(0, 0, 2), (2 * G, 0, 3), (0, G, 2), (2 * G, G, 2)]): tA, tB = column(x, y, n, power_foot=(i == 0)); tops += [tA, tB]
    top_attach(tops, ['spot', 'cap', 'clock', 'spot', 'hub', 'cap', 'pen', 'cap'])
    shelf_on(G / 2, G / 2, 720); shelf_on(2.5 * G, G / 2, 720)
    DX, DY = 3 * G + 1500, -350         # desk beside the build, clear of the posts
    d, top = ph_model('metal_office_desk', (DX, DY, -FOOT), 0)
    if d is None:
        top = 735; box('desk', (1600, 800, 30), (DX, DY, 720), mk_oak('desk', '#C9A27A'), 4)
    z = top - 0.5; laptop(DX - 350, DY - 60, z, -8); mug(DX + 80, DY - 200, z); sketches(DX - 50, DY - 120, z + 1)
    printer(DX + 480, DY + 40, z, -15)
    ph_model('metal_stool_01', (DX - 150, DY - 620, -FOOT), 20, 640)
    panel_between(2 * G, 3 * G, 0, 760 + 40, 'pegboard')
    climb((G, G), 30, HS + 0, 1.2); tuft(G / 2, G / 2, 740, 18, 140)
    camera((1900, -150, 850), -24, 9, 5.0, 32, dof=4.5); return (1900, -150, 850)

@shot('09', 'lifestyle-plant-corner', 'room:rest:morning', versions=('day', 'night'))
def s09(night):
    tops = []
    for (x, y, n) in [(0, 0, 4), (0, G, 4), (2 * G, 0, 2)]: tA, tB = column(x, y, n); tops += [tA, tB]
    top_attach(tops, ['grow', 'grow', 'clock', 'cap', 'speaker', 'cap'])
    planter_on(G / 2, G / 2, 260); planter_on(G / 2, G / 2, H + 300); shelf_on(G / 2, G / 2, 2 * H + 200)
    tuft(G / 2, G / 2, 360, 30); tuft(G / 2, G / 2, H + 400, 24, 140, 'fern')
    climb((0, G, 0), 30, 1000, 2.8, trail=8); climb((2 * G, 0, 0), 30, 900, 2.2)
    book_row(G / 2 - 230, G / 2 - 80, 2 * H + 219, 10)
    ph_model('modern_arm_chair_01', (-1300, -350, -FOOT), 215)
    st, top = ph_model('side_table_01', (-420, -1150, -FOOT), 10, 520)
    if st is None: top = 480 - FOOT; box('side_table', (420, 420, 480), (-500, -900, 240 - FOOT), mk_oak('st', '#8A6A4A'), 6)
    mug(-360, -1130, top); book_row(-540, -1180, top, 4, 90, 200)
    camera((200, 0, 700), -40, 9, 4.0, 30, dof=4); return (200, 0, 700)

@shot('10', 'lifestyle-workshop', 'room:shop:day', versions=('day', 'night'))
def s10(night):
    tops = []
    for (x, y, n) in [(0, 0, 3), (2 * G, 0, 3), (4 * G, 0, 2)]: tA, tB = column(x, y, n, rotz=0); tops += [tA, tB]
    top_attach(tops, ['spot', 'cap', 'hub', 'cap', 'spot', 'cap'])
    for z in (120, 120 + HS, 120 + 2 * HS): panel_between(0, G, 0, z, 'pegboard'); panel_between(2 * G, 3 * G, 0, z, 'pegboard' if z < 600 else 'whiteboard')
    column(4 * G, G, 2); shelf_on(4.5 * G, G / 2, 700)
    box('bench', (2400, 750, 40), (1300, -900, 900), mk_oak('bench', '#B48E62'), 3)
    for dx in (-1150, 1150):
        for dy in (-330, 330): box('bleg', (60, 60, 920), (1300 + dx, -900 + dy, 460 - FOOT), principled('bl', lin('#2A2B2D'), 0.5, 0.6), 3)
    printer(400, -850, 920, 0); printer(1900, -850, 920, -8)
    for i in range(6): box('offcut', (random.uniform(60, 240), random.uniform(40, 120), random.uniform(8, 25)), (900 + i * 110, -1100, 930), mk_oak('off%d' % i, '#C9A27A'), 2, random.uniform(-30, 30))
    camera((1300, -200, 1100), -20, 6, 4.6, 32, dof=5.6); return (1300, -200, 1100)

@shot('17', 'builder-presets', 'room:studio:golden', versions=('day', 'night'))
def s17(night):
    # three viewer presets side by side: starter, studio desk, plant corner
    column(0, 0, 1, power_foot=True); att('spot', (0, 0, H)); put('cap', (G, 0, HS), mat='cap')
    column(2000, 0, 2); column(2000, G, 2); shelf_on(2000 + G / 2, G / 2, 720); att('clock', (2000, 0, H + HS)); att('hub', (2000 + G, G, H + HS))
    column(4000, 0, 2); column(4000, G, 1); planter_on(4000 + G / 2, G / 2, 240); att('grow', (4000, G, H)); tuft(4000 + G / 2, G / 2, 340, 24)
    camera((2300, 300, 520), -12, 10, 6.6, 40, dof=8); return (2300, 300, 600)

# ---------------------------------------------------------------- run
def setup_bg(bg, key, night, target):
    parts = bg.split(':')
    if parts[0] == 'room': room(parts[1], 'night' if night else parts[2], target)
    else:
        dark = parts[0] == 'grid-dark' or night
        az, dist = CAMINFO['az'], CAMINFO['dist']; sc_ = max(1.0, dist / 3.0)
        sweep(CMF.get(key, CMF['frame'])['hex'], target, az, dist, grid=parts[0].startswith('grid'), dark=dark)
        world_plain(0.02 if dark else 0.22, dark)
        if not dark: softbox(Vector(target) * MM, sc_); studio_lights(sc_, Vector(target) * MM)
        elif night and parts[0] != 'grid-dark':        # night product shot: the product's own lights plus a faint cool rim
            t = Vector(target) * MM
            a_ = math.radians(CAMINFO['az'] - 70)                     # camera-side, inside the sweep (the old rim sat behind it)
            area('key_night', t + Vector((math.sin(a_) * 1.4, -math.cos(a_) * 1.4, 1.3)) * sc_, 25 * sc_ ** 2, 1.0 * sc_, (0.75, 0.82, 1.0), target=t)
def render(sid, version):
    global sc, CAM
    sc = reset(); CAM = None; MESH.clear(); SHOTCOL.clear(); LEAF.clear(); random.seed(int(sid) * 13)
    POSTS.clear(); CLAMPS.clear(); WARN.clear(); USED.clear()
    night = version == 'night'; build_materials(night)
    S = SHOTS[sid]; CUR[0] = 's' + sid; t = S['fn'](night)
    for (px, py), top in list(POSTS.items()):
        if (round(px), round(py)) not in USED: put('cap', (px, py, top), mat='cap')
    setup_bg(S['bg'], S['key'], night, t)
    ev = S['exposure']
    if not S['bg'].startswith(('room', 'grid-dark')) and ev == 0 and not night: ev = -1.8      # sweep + softbox clipped at 0 EV in pass 2
    sc.view_settings.exposure = ev
    r = sc.render; r.resolution_x = A.res; r.resolution_y = A.res if A.square else round(A.res / 1.41421)
    os.makedirs(A.out, exist_ok=True)
    tag = ('_clay' if A.clay else '') + ('_night' if night else '')
    r.filepath = os.path.join(A.out, f'OG-RND-{sid}_{S["name"]}{tag}.png')
    for w in WARN: print('WARN', sid, w, flush=True)
    if A.save: bpy.ops.wm.save_as_mainfile(filepath=os.path.join(A.out, f'{sid}{tag}.blend'))
    if A.dry: print('dry', sid, version, len(coll(CUR[0]).objects), 'objects', flush=True); return
    bpy.ops.render.render(write_still=True); print('rendered', sid, version, flush=True)
if A.list:
    for k, v in sorted(SHOTS.items()): print(k, v['name'], v['bg'], v['versions'])
    sys.exit(0)
want = sorted(SHOTS) if A.shots == 'all' else A.shots.split(',')
for sid in want:
    vs = SHOTS[sid]['versions']
    if A.night == 'only': vs = [v for v in vs if v == 'night']
    elif A.night == 'skip': vs = [v for v in vs if v != 'night'] or vs[:1]
    for v in vs: render(sid, v)
