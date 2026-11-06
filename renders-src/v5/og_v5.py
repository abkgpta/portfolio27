# overgrwth v5 render studio (Blender 5.2, Cycles): soft studio, transparent RGBA cutouts, ortho views.
# Units in code are mm; scene is metres (meshes are converted to metres on import).
# Run: blender -b -P og_v5.py -- --shots 01,O-frame-iso --res 1600 --samples 128 --out out --device METAL
# Every shot writes three 16-bit RGBA PNGs: <name>.png (with soft contact shadow), _noshadow.png, _shadow.png.
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
ap.add_argument('--assets', default=os.path.join(HERE, 'assets')); ap.add_argument('--boards', default=os.path.join(HERE, 'boards'))
ap.add_argument('--hdri', default='studio_small_09'); ap.add_argument('--bevel', type=float, default=0.7)
ap.add_argument('--tag', default=''); ap.add_argument('--group', default='')
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
    sc.cycles.filter_width = 1.2; sc.cycles.blur_glossy = 0.5; sc.cycles.sample_clamp_indirect = 8
    sc.view_settings.view_transform = 'AgX'; sc.view_settings.look = 'AgX - Medium High Contrast'
    sc.render.film_transparent = True; sc.cycles.film_transparent_glass = False
    sc.render.image_settings.color_mode = 'RGBA'; sc.render.image_settings.color_depth = '16'
    sc.view_layers[0].cycles.use_pass_shadow_catcher = True; sc.view_layers[0].use_pass_object_index = True
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
    if A.bevel > 0:                      # rounded-edge catch-lights: shader bevel, radius in mm (meshes are in metres)
        bv = n.new('ShaderNodeBevel'); bv.name = 'bevel'; bv.samples = 8; bv.inputs['Radius'].default_value = A.bevel * MM
        l.new(bv.outputs['Normal'], b.inputs['Normal'])
    return m
def obj_coords(m):
    n, l = nodes(m); t = n.new('ShaderNodeTexCoord'); return t.outputs['Object']
def bump(m, height_socket, strength, dist=0.0002):
    n, l = nodes(m); b = n['Principled BSDF']; bp = n.new('ShaderNodeBump')
    bp.inputs['Strength'].default_value = strength; bp.inputs['Distance'].default_value = dist
    prev = b.inputs['Normal'].links[0].from_socket if b.inputs['Normal'].links else None   # chain: bevel -> bumps -> BSDF
    if prev is not None: l.new(prev, bp.inputs['Normal'])
    l.new(height_socket, bp.inputs['Height']); l.new(bp.outputs['Normal'], b.inputs['Normal']); return bp
def noise(m, scale, detail=4, rough=0.6, vec=None, w4=False):
    n, l = nodes(m); t = n.new('ShaderNodeTexNoise'); t.inputs['Scale'].default_value = scale
    t.inputs['Detail'].default_value = detail; t.inputs['Roughness'].default_value = rough
    l.new(vec or obj_coords(m), t.inputs['Vector']); return t
def rough_var(m, base, amp, scale):
    n, l = nodes(m); b = n['Principled BSDF']; t = noise(m, scale, 3)
    mr = n.new('ShaderNodeMapRange'); mr.inputs['To Min'].default_value = base - amp; mr.inputs['To Max'].default_value = base + amp
    l.new(t.outputs['Fac'], mr.inputs['Value']); l.new(mr.outputs['Result'], b.inputs['Roughness'])

def grain(m, scale=26000, strength=0.18):    # bead-blast sparkle grain seen in the style refs
    t = noise(m, scale, 2, 0.5); bump(m, t.outputs['Fac'], strength, 0.00005)
def mk_powder(name, hexc, rough):            # powder coat / satin metal: soft orange peel, fine grain, roughness breakup
    m = principled(name, lin(hexc), rough, 0.0, coat=0.1)
    t = noise(m, 900, 3, 0.55); bump(m, t.outputs['Fac'], 0.05, 0.0003); grain(m)
    rough_var(m, rough, 0.05, 60); return m
def mk_stipple(name, hexc, rough):           # moulded PC/ABS, fine leather stipple
    m = principled(name, lin(hexc), rough)
    n, l = nodes(m); v = n.new('ShaderNodeTexVoronoi'); v.inputs['Scale'].default_value = 5000
    v.inputs['Scale'].default_value = 3800
    l.new(obj_coords(m), v.inputs['Vector']); bump(m, v.outputs['Distance'], 0.16, 0.0001); grain(m, 30000, 0.1)
    rough_var(m, rough, 0.06, 80); return m
def mk_pom(name, hexc, rough):               # satin polymer, faint mould texture
    m = principled(name, lin(hexc), rough, sss=0.03)
    t = noise(m, 2500, 2); bump(m, t.outputs['Fac'], 0.04, 0.0002); grain(m, 30000, 0.06); rough_var(m, rough, 0.04, 90); return m
def mk_cast(name, hexc, rough, metal):       # bead-blasted cast aluminium
    m = principled(name, lin(hexc), rough, metal)
    grain(m, 22000, 0.28); rough_var(m, rough, 0.08, 120); return m
def mk_oak(name, hexc):                      # green-lacquered oak, open grain through the lacquer
    base = lin(hexc); m = principled(name, base, 0.42, coat=0.35)
    n, l = nodes(m); b = n['Principled BSDF']; oc = obj_coords(m)
    mp = n.new('ShaderNodeMapping'); mp.inputs['Scale'].default_value = (1, 12, 1); l.new(oc, mp.inputs['Vector'])
    w = n.new('ShaderNodeTexWave'); w.inputs['Scale'].default_value = 30; w.inputs['Distortion'].default_value = 9
    w.inputs['Detail'].default_value = 6; w.inputs['Detail Scale'].default_value = 2; l.new(mp.outputs['Vector'], w.inputs['Vector'])
    pores = noise(m, 900, 2, 0.6, vec=mp.outputs['Vector'])
    mx = n.new('ShaderNodeMix'); mx.data_type = 'RGBA'; mx.inputs['A'].default_value = base
    mx.inputs['B'].default_value = mix(base, [0.02, 0.03, 0.02], 0.45)
    l.new(w.outputs['Fac'], mx.inputs['Factor']); l.new(mx.outputs['Result'], b.inputs['Base Color'])
    add = n.new('ShaderNodeMath'); add.operation = 'ADD'; l.new(w.outputs['Fac'], add.inputs[0]); l.new(pores.outputs['Fac'], add.inputs[1])
    bump(m, add.outputs['Value'], 0.08); return m
def mk_flecked(name, hexc, rough):           # recycled PP with dark flecks
    base = lin(hexc); m = principled(name, base, rough)
    n, l = nodes(m); b = n['Principled BSDF']; v = n.new('ShaderNodeTexVoronoi'); v.inputs['Scale'].default_value = 900
    v.inputs['Scale'].default_value = 300; l.new(obj_coords(m), v.inputs['Vector']); r = n.new('ShaderNodeValToRGB')
    r.color_ramp.elements[0].position = 0.05; r.color_ramp.elements[0].color = (0.03, 0.02, 0.02, 1)
    r.color_ramp.elements[1].position = 0.07; r.color_ramp.elements[1].color = base
    l.new(v.outputs['Distance'], r.inputs['Fac']); l.new(r.outputs['Color'], b.inputs['Base Color'])
    t = noise(m, 2500, 2); bump(m, t.outputs['Fac'], 0.08, 0.0002); return m
def mk_felt(name, hexc):
    m = principled(name, lin(hexc), 0.95, sheen=0.8)
    t = noise(m, 2200, 12, 0.75); bump(m, t.outputs['Fac'], 0.5, 0.0006)
    f = noise(m, 9000, 4, 0.7); bump(m, f.outputs['Fac'], 0.3, 0.0002); return m
def mk_gloss(name, hexc):
    m = principled(name, lin(hexc), 0.08, coat=0.6); t = noise(m, 400, 2); bump(m, t.outputs['Fac'], 0.01, 0.0002); return m
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
MESH = {}; MESHM = {}
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
    bm.to_mesh(me); bm.free(); me.transform(Matrix.Scale(MM, 4))    # mm -> metres: real-size coords for textures and bevels
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
    ml = tuple(mats or [mat, 'led'])
    if key == 'finishes': ml = ('clamp', 'whiteboard', 'pegboard', 'softboard')
    mk_ = (key, ml)
    if mk_ not in MESHM:                 # one mesh datablock per (part, materials): Cycles instances it, no per-object copies
        me = mesh(key).copy(); me.materials.clear()
        for k_ in ml: me.materials.append(MAT[k_])
        MESHM[mk_] = me
    o = bpy.data.objects.new(name or key, MESHM[mk_])
    o.location = Vector(loc) * MM; o.rotation_euler = Euler([math.radians(a) for a in rot])
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
PH = A.assets
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
def _one_variant(objs, aid):
    """Poly Haven plant files lay out several variants (and LODs) 0.5-1 m apart: keep one variant, LOD0, at the origin"""
    top = [o for o in objs if o.parent is None or o.parent not in objs]
    if len(top) < 2: return objs
    import re
    lod = [o for o in top if re.search(r'_LOD\d+$', o.name)]
    if lod: top = [o for o in top if not re.search(r'_LOD\d+$', o.name) or o.name.endswith('_LOD0')]
    best = min(top, key=lambda o: (o.location.x ** 2 + o.location.y ** 2, -o.dimensions.z))
    keep_top = [o for o in top if (o.location.xy - best.location.xy).length < 0.02]
    keep = set(keep_top)
    for o in objs:
        p = o.parent
        while p is not None and p not in keep: p = p.parent
        if p is not None: keep.add(o)
    off = best.location.xy.copy()
    for o in keep_top: o.location.x -= off.x; o.location.y -= off.y
    for o in objs:
        if o not in keep: bpy.data.objects.remove(o, do_unlink=True)
    return [o for o in objs if o in keep]
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
        objs = _one_variant(objs, aid)
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
# ---------------------------------------------------------------- framing helpers
from bpy_extras.object_utils import world_to_camera_view
CAM = None; CAMINFO = {}
def _cam():
    global CAM
    if CAM is None:
        CAM = bpy.data.objects.new('cam', bpy.data.cameras.new('cam')); sc.collection.objects.link(CAM); sc.camera = CAM
        CAM.data.sensor_width = 36; CAM.data.clip_start = 0.005; CAM.data.clip_end = 300
    return CAM
def camera(target, az, el, dist, lens, dof=None, shift=(0, 0)):
    """fixed camera (v4 style): target in mm, distance in metres"""
    c = _cam(); CAMINFO.update(az=az, el=el, dist=dist, fixed=True)
    t = Vector(target) * MM; a, e = math.radians(az), math.radians(el)
    c.location = t + Vector((math.sin(a) * math.cos(e), -math.cos(a) * math.cos(e), math.sin(e))) * dist
    c.rotation_euler = (t - c.location).to_track_quat('-Z', 'Y').to_euler()
    d = c.data; d.type = 'PERSP'; d.lens = lens; d.shift_x, d.shift_y = shift
    d.dof.use_dof = dof is not None
    if dof: d.dof.focus_distance = (t - c.location).length; d.dof.aperture_fstop = dof

def scene_objs():
    out = []
    for o in coll(CUR[0]).all_objects:
        if o.type not in ('MESH', 'CURVE') or o.is_shadow_catcher or not o.visible_camera: continue
        if o.name.startswith(('leafx',)): continue
        out.append(o)
    return out
def bounds(objs=None):
    bpy.context.view_layer.update()
    pts = [o.matrix_world @ Vector(c) for o in (objs or scene_objs()) for c in o.bound_box]
    mn = Vector([min(p[i] for p in pts) for i in range(3)]); mx = Vector([max(p[i] for p in pts) for i in range(3)])
    return mn, mx, pts

def aim(az, el, lens=50, ortho=False, margin=1.10, dof=None, objs=None, focus=None, roll=0.0):
    """auto-frame everything (or objs) from a direction; ortho or perspective; centres with lens shift"""
    c = _cam(); d = c.data; mn, mx, pts = bounds(objs); ctr = (mn + mx) / 2; r = max((mx - mn).length / 2, 0.02)
    a, e = math.radians(az), math.radians(min(el, 89.95))
    dirv = Vector((math.sin(a) * math.cos(e), -math.cos(a) * math.cos(e), math.sin(e)))
    d.shift_x = d.shift_y = 0; d.type = 'ORTHO' if ortho else 'PERSP'; d.lens = lens
    dist = r * 4 + 0.5 if ortho else r / math.tan(math.atan(18 / lens)) * 1.1
    def place():
        c.location = ctr + dirv * dist
        q = (ctr - c.location).to_track_quat('-Z', 'Y')
        if roll: q = q @ Matrix.Rotation(math.radians(roll), 4, 'Z').to_quaternion()
        c.rotation_euler = q.to_euler()
    if ortho: d.ortho_scale = 2 * r
    place()
    W, Hh = sc.render.resolution_x, sc.render.resolution_y; land = W >= Hh
    for _ in range(7):
        bpy.context.view_layer.update()
        co = [world_to_camera_view(sc, c, p) for p in pts]
        u0, u1 = min(p.x for p in co), max(p.x for p in co); v0, v1 = min(p.y for p in co), max(p.y for p in co)
        span = max(u1 - u0, v1 - v0) * margin
        cu, cv = (u0 + u1) / 2 - 0.5, (v0 + v1) / 2 - 0.5
        if land: d.shift_x += cu; d.shift_y += cv * Hh / W
        else: d.shift_x += cu * W / Hh; d.shift_y += cv
        if ortho: d.ortho_scale *= span
        else:
            dist *= 1 + (span - 1) * 0.9; place()
    CAMINFO.update(az=az, el=el, dist=(c.location - ctr).length, fixed=False)
    d.dof.use_dof = bool(dof) and not ortho
    if d.dof.use_dof:
        f = Vector(focus) * MM if focus is not None else ctr
        d.dof.focus_distance = (f - c.location).length; d.dof.aperture_fstop = dof

# ---------------------------------------------------------------- soft studio (transparent)
def rect_light(name, loc, target, sx, sy, power, color=(1, 0.985, 0.97), spread=160):
    l = bpy.data.lights.new(name, 'AREA'); l.shape = 'RECTANGLE'; l.size = sx; l.size_y = sy; l.energy = power; l.color = color
    l.spread = math.radians(spread)
    o = bpy.data.objects.new(name, l); o.location = loc; coll(CUR[0]).objects.link(o)
    o.rotation_euler = (Vector(target) - Vector(loc)).to_track_quat('-Z', 'Y').to_euler(); return o
def hdri_reflections(strength=0.45):
    if not hdri_world(A.hdri, strength, 0): world_plain(0.25)
def studio_soft(dark=False):
    """big soft boxes placed around the camera direction: key 50 deg left, broad fill right, two rim strips
    behind for the bright edge lines, overhead box for the long top gradient; HDRI only for reflections"""
    mn, mx, _ = bounds(); c = (mn + mx) / 2; r = max((mx - mn).length / 2, 0.06)
    D = max(r * 2.4, 0.45); k = D * D; az = CAMINFO.get('az', -30)
    def pol(daz, de, dist):
        a = math.radians(az + daz); e = math.radians(de)
        return c + Vector((math.sin(a) * math.cos(e), -math.cos(a) * math.cos(e), math.sin(e))) * dist
    rect_light('key', pol(-55, 32, D), c, 0.7 * D, 1.2 * D, 34 * k)
    rect_light('fill', pol(65, 8, D * 1.2), c, 1.6 * D, 1.6 * D, 3.5 * k * 1.44, (0.97, 0.98, 1.0))
    rect_light('rimL', pol(-145, 18, D), c, 0.16 * D, 1.5 * D, 30 * k)
    rect_light('rimR', pol(140, 22, D), c, 0.16 * D, 1.5 * D, 26 * k)
    rect_light('top', c + Vector((0, 0, D * 1.1)), c, 1.3 * D, 1.3 * D, 22 * k * 1.21)
    if dark:
        for o in coll(CUR[0]).objects:
            if o.type == 'LIGHT' and o.name in ('fill', 'top'): o.data.energy *= 0.15
    hdri_reflections(0.12 if not dark else 0.04)
def catcher(z_m):
    bpy.ops.mesh.primitive_plane_add(size=80, location=(0, 0, z_m)); o = bpy.context.object; o.name = 'catcher'
    o.is_shadow_catcher = True; o.pass_index = 1; relink(o); return o

# ---------------------------------------------------------------- compositor: cutout, shadow-free, shadow-only
def compositor(outdir, base):
    ng = bpy.data.node_groups.new('comp', 'CompositorNodeTree'); sc.compositing_node_group = ng
    N, L = ng.nodes, ng.links
    rl = N.new('CompositorNodeRLayers')
    bw = N.new('CompositorNodeRGBToBW'); L.new(rl.outputs['Shadow Catcher'], bw.inputs[0])
    inv = N.new('CompositorNodeInvert'); L.new(bw.outputs[0], inv.inputs['Color'])
    sa = N.new('CompositorNodeSetAlpha'); sa.inputs['Image'].default_value = (0, 0, 0, 1); L.new(inv.outputs[0], sa.inputs['Alpha'])
    ao = N.new('CompositorNodeAlphaOver'); L.new(sa.outputs[0], ao.inputs['Background']); L.new(rl.outputs['Image'], ao.inputs['Foreground'])
    fo = N.new('CompositorNodeOutputFile'); fo.directory = outdir + os.sep; fo.file_name = base + '_'
    fo.format.media_type = 'IMAGE'; fo.format.file_format = 'PNG'; fo.format.color_mode = 'RGBA'; fo.format.color_depth = '16'
    fo.format.compression = 40
    for nm in ('cutout', 'noshadow', 'shadow'): fo.file_output_items.new('RGBA', nm)
    L.new(ao.outputs[0], fo.inputs['cutout']); L.new(rl.outputs['Image'], fo.inputs['noshadow']); L.new(sa.outputs[0], fo.inputs['shadow'])
    go = N.new('NodeGroupOutput')
    try: ng.interface.new_socket('Image', in_out='OUTPUT', socket_type='NodeSocketColor'); L.new(ao.outputs[0], go.inputs[0])
    except Exception as e: print('WARN group output', e)

# ---------------------------------------------------------------- board dressing (panels in use)
BOARDS = A.boards
def _img(path):
    try: return bpy.data.images.load(path, check_existing=True)
    except Exception as e: WARN.append('image %s: %s' % (path, e)); return None
def image_mat(name, path, rough=0.85, alpha=False, ink=False, sheen=0.0):
    im = _img(path)
    m = principled(name, (0.9, 0.9, 0.9, 1), rough, sheen=sheen)
    if im is None: return m
    n, l = nodes(m); b = n['Principled BSDF']; t = n.new('ShaderNodeTexImage'); t.image = im; t.interpolation = 'Cubic'
    uv = n.new('ShaderNodeTexCoord'); l.new(uv.outputs['UV'], t.inputs['Vector'])
    l.new(t.outputs['Color'], b.inputs['Base Color'])
    if alpha: l.new(t.outputs['Alpha'], b.inputs['Alpha'])
    try: m.surface_render_method = 'DITHERED'
    except Exception: pass
    return m
def sheet(name, w, h, loc, rot, mat, thick=0.25):
    """paper/decal plane w x h mm in the local XZ plane (normal -Y), with UVs 0..1"""
    bm = bmesh.new(); uvl = bm.loops.layers.uv.new()
    vs = [bm.verts.new(Vector(p) * MM) for p in ((-w / 2, 0, -h / 2), (w / 2, 0, -h / 2), (w / 2, 0, h / 2), (-w / 2, 0, h / 2))]
    f = bm.faces.new(vs)
    for lp, uv in zip(f.loops, ((0, 0), (1, 0), (1, 1), (0, 1))): lp[uvl].uv = uv
    if f.normal.y > 0: f.normal_flip()
    me = bpy.data.meshes.new(name); bm.to_mesh(me); bm.free(); me.materials.append(mat)
    o = bpy.data.objects.new(name, me); o.location = Vector(loc) * MM; o.rotation_euler = Euler([math.radians(a) for a in rot])
    if thick:
        s = o.modifiers.new('s', 'SOLIDIFY'); s.thickness = thick * MM; s.offset = 1
    coll(CUR[0]).objects.link(o); return o
def files(pat): return sorted(glob.glob(os.path.join(BOARDS, pat)))
PINCOL = ['#D95942', '#FBCB44', '#4569BE', '#F2F0EA', '#1E1E1E', '#2F7A4B']
def pushpin(x, y, z, col):
    head = principled('pinhead', lin(col), 0.25, coat=0.5)
    bpy.ops.mesh.primitive_uv_sphere_add(radius=4.2 * MM, location=(x * MM, (y - 7) * MM, z * MM), segments=24, ring_count=12)
    o = bpy.context.object; o.scale = (1, 0.8, 1); o.data.materials.append(head); relink(o)
    for p in o.data.polygons: p.use_smooth = True
    bpy.ops.mesh.primitive_cylinder_add(radius=0.6 * MM, depth=7 * MM, location=(x * MM, (y - 3) * MM, z * MM), rotation=(math.pi / 2, 0, 0), vertices=12)
    s = bpy.context.object; s.data.materials.append(MAT['steel'] if 'steel' in MAT else head); relink(s)
def magnet(x, y, z, col):
    bpy.ops.mesh.primitive_cylinder_add(radius=11 * MM, depth=7 * MM, location=(x * MM, (y - 3.5) * MM, z * MM), rotation=(math.pi / 2, 0, 0), vertices=48)
    o = bpy.context.object; o.data.materials.append(principled('magnet', lin(col), 0.3, coat=0.4))
    b = o.modifiers.new('b', 'BEVEL'); b.width = 1.5 * MM; b.segments = 3
    for p in o.data.polygons: p.use_smooth = True
    relink(o)

def dress_whiteboard(x0, x1, z0, z1, yf, seed):
    rnd = random.Random(seed); w, h = x1 - x0, z1 - z0
    cw, rh = round(w / G), round(h / HS)
    fs = files('wb_%dx%d_*.png' % (cw, rh)) or files('wb_*.png')
    if fs:
        f = fs[seed % len(fs)]
        ink = image_mat('ink_%d' % seed, f, 0.35, alpha=True)
        sheet('wb_ink', w - 24, h - 24, ((x0 + x1) / 2, yf - 0.15, (z0 + z1) / 2), (0, 0, 0), ink, thick=0)
    notes = files('sticky_*.png')
    for k in range(rnd.randint(3, 6) if notes else 0):
        f = notes[rnd.randrange(len(notes))]
        x = rnd.uniform(x0 + 70, x1 - 70); z = rnd.uniform(z0 + 70, z1 - 70)
        sheet('sticky', 76, 76, (x, yf - 0.6, z), (rnd.uniform(-5, -1), rnd.uniform(-6, 6), 0), image_mat('sticky%d' % k, f, 0.8), 0.12)
    prints = files('pin_*.jpg')
    if prints and w > 700:
        f = prints[(seed * 7) % len(prints)]; x = x1 - 170 - rnd.uniform(0, 120); z = z1 - 190
        sheet('wb_print', 210, 297, (x, yf - 0.8, z - 148), (0, rnd.uniform(-3, 3), 0), image_mat('wbp%d' % seed, f, 0.8), 0.15)
        magnet(x - 60, yf - 1, z - 20, PINCOL[seed % 6]); magnet(x + 60, yf - 1, z - 20, PINCOL[(seed + 2) % 6])

def dress_softboard(x0, x1, z0, z1, yf, seed):
    rnd = random.Random(seed); prints = files('pin_*.jpg') + files('sketch_*.png') + files('card_*.png')
    if not prints: WARN.append('no softboard images in ' + BOARDS); return
    sizes = [(148, 105), (105, 148), (210, 148), (148, 210), (88, 107), (127, 89), (210, 297), (100, 100)]
    w, h = x1 - x0, z1 - z0; n = max(3, int(w * h / 46000))
    cols = max(1, round(w / 190)); rows = max(1, math.ceil(n / cols))
    order = list(range(len(prints))); rnd.shuffle(order); k = 0
    for i in range(rows):
        for j in range(cols):
            if k >= n: break
            sw, sh = sizes[rnd.randrange(len(sizes))]
            cx = x0 + (j + 0.5) * w / cols + rnd.uniform(-35, 35); cz = z0 + (i + 0.5) * h / rows + rnd.uniform(-30, 30)
            cx = min(max(cx, x0 + sw / 2 + 12), x1 - sw / 2 - 12); cz = min(max(cz, z0 + sh / 2 + 12), z1 - sh / 2 - 12)
            f = prints[order[k % len(order)]]; k += 1
            lift = rnd.uniform(-4, -1.0)                    # pinned at the top, the bottom edge lifts off the felt
            sheet('pinned', sw, sh, (cx, yf - 1.2 - k * 0.05, cz), (lift, rnd.uniform(-5, 5), 0), image_mat('pin%d_%d' % (seed, k), f, 0.82, sheen=0.2), 0.18)
            pushpin(cx + rnd.uniform(-8, 8), yf - 1.5, cz + sh / 2 - 12, PINCOL[rnd.randrange(6)])
            if sw > 140 and rnd.random() < 0.5: pushpin(cx - sw / 2 + 12, yf - 1.5, cz + sh / 2 - 12, PINCOL[rnd.randrange(6)])

TOOLS = [('adjustable_wrench', 250), ('combination_wrench', 210), ('pliers', 190), ('tongue_groove_pliers', 250), ('flathead_screwdriver', 230),
         ('screwdriver', 210), ('cross_pein_hammer', 300), ('trowel_01', 290), ('measuring_tape_01', 80), ('magnifying_glass_01', 210),
         ('ratchet_wrench', 240), ('garden_gloves_01', 240), ('clipboard', 300)]
def hook(x, z, yf):
    pts = [(x, yf + 6, z), (x, yf - 8, z), (x, yf - 30, z - 3), (x, yf - 36, z + 9)]
    cu = bpy.data.curves.new('hook', 'CURVE'); cu.dimensions = '3D'; cu.bevel_depth = 2.2 * MM; cu.bevel_resolution = 3
    sp = cu.splines.new('BEZIER'); sp.bezier_points.add(len(pts) - 1)
    for p, q in zip(sp.bezier_points, pts):
        p.co = Vector(q) * MM; p.handle_left_type = p.handle_right_type = 'AUTO'
    o = bpy.data.objects.new('hook', cu); o.data.materials.append(MAT['steel']); coll(CUR[0]).objects.link(o); return o
def hang_tool(aid, length, x, ztop, yf, tilt=0.0):
    root, _ = ph_model(aid, (0, 0, 0), 0, None, res='1k')
    if root is None: return None
    root.location = (0, 0, 0); root.rotation_euler = (0, 0, 0); root.scale = (1, 1, 1); bpy.context.view_layer.update()
    objs = [o for o in root.children_recursive if o.type == 'MESH']
    if not objs: return None
    mn, mx, _ = bounds(objs); dims = mx - mn; ax = sorted(range(3), key=lambda i: dims[i])   # thin, mid, long
    rows = [None] * 3; rows[1] = [1.0 if i == ax[0] else 0.0 for i in range(3)]
    rows[2] = [1.0 if i == ax[2] else 0.0 for i in range(3)]; rows[0] = [1.0 if i == ax[1] else 0.0 for i in range(3)]
    M = Matrix(rows)
    if M.determinant() < 0: M[0] = [-v for v in M[0]]
    k = length * MM / dims[ax[2]]
    root.matrix_world = Matrix.Rotation(math.radians(tilt), 4, 'Y') @ Matrix.Diagonal((k, k, k, 1)) @ M.to_4x4() @ Matrix.Translation(-(mn + mx) / 2)
    bpy.context.view_layer.update(); mn, mx, _ = bounds(objs)
    root.matrix_world = Matrix.Translation(Vector((x * MM - (mn.x + mx.x) / 2, (yf - 2) * MM - mx.y, ztop * MM - mx.z))) @ root.matrix_world
    return root
def peg_bin(x, z, yf, w=160, d=70, h=80, mat='pp'):
    m = MAT[mat]
    box('bin_back', (w, 3, h), (x, yf - 1.5, z + h / 2), m, 1); box('bin_front', (w, 3, h * 0.75), (x, yf - d, z + h * 0.375), m, 1)
    box('bin_l', (3, d, h * 0.85), (x - w / 2, yf - d / 2, z + h * 0.42), m, 1); box('bin_r', (3, d, h * 0.85), (x + w / 2, yf - d / 2, z + h * 0.42), m, 1)
    box('bin_bot', (w, d, 3), (x, yf - d / 2, z), m, 1)
    rnd = random.Random(int(x + z))
    cols = ['#2F7A4B', '#D95942', '#1E1E1E', '#FBCB44', '#4569BE', '#E9E4DA']
    for i in range(int(w / 22)):          # pencils / markers standing in the bin
        px = x - w / 2 + 14 + i * 20 + rnd.uniform(-3, 3); ln = rnd.uniform(140, 175)
        bpy.ops.mesh.primitive_cylinder_add(radius=(5 if i % 3 else 7) * MM, depth=ln * MM, vertices=6 if i % 3 else 24,
                                            location=(px * MM, (yf - d / 2 + rnd.uniform(-10, 10)) * MM, (z + ln / 2 + 2) * MM),
                                            rotation=(math.radians(rnd.uniform(-8, 8)), math.radians(rnd.uniform(-8, 8)), 0))
        o = bpy.context.object; o.data.materials.append(principled('pen%d' % i, lin(cols[(i + int(x)) % 6]), 0.4, coat=0.3)); relink(o)
        b = o.modifiers.new('b', 'BEVEL'); b.width = 0.8 * MM; b.segments = 2
def steel_ruler(x, ztop, yf, ln=500):
    o = box('ruler', (30, 1.2, ln), (x, yf - 3, ztop - ln / 2), MAT['brushed'], 0.4)
    o.rotation_euler[1] = math.radians(1.5); return o
def dress_pegboard(x0, x1, z0, z1, yf, seed):
    rnd = random.Random(seed); P = 25.4; cx0 = (x0 + x1) / 2
    def snapx(x): return cx0 + round((x - cx0) / P) * P
    def snapz(z): return z0 + 12.7 + round((z - z0 - 12.7) / P) * P
    w, h = x1 - x0, z1 - z0
    tools = TOOLS[:]; rnd.shuffle(tools)
    nrow = max(1, int(h // 330)); ncol = max(1, int(w // 150)); t = 0
    for i in range(nrow):
        zt = snapz(z1 - 40 - i * (h - 60) / nrow)
        for j in range(ncol):
            x = snapx(x0 + (j + 0.5) * w / ncol + rnd.uniform(-15, 15))
            r = rnd.random()
            if r < 0.12 and zt - 120 > z0: peg_bin(x, zt - 100, yf, min(170, w / ncol - 20)); continue
            if r < 0.2: steel_ruler(x, zt - 10, yf, min(500, (zt - z0) - 30)); hook(x, zt, yf); continue
            aid, ln = tools[t % len(tools)]; t += 1
            ln = min(ln, (zt - z0) - 40)
            if ln < 80: continue
            hook(x, zt, yf); hang_tool(aid, ln, x, zt - 4, yf, rnd.uniform(-3, 3))

def panel_wall(x0, y, z0, cols, rows, blocks, dress=True):
    """seamless wall: one panel per bay x row (panels are exactly G x HS, so seams close up);
    blocks = [(finish, c0, r0, cw, rh)], cells not in a block are pegboard"""
    grid = {}
    for (fin, c0, r0, cw, rh) in blocks:
        for c in range(c0, c0 + cw):
            for r in range(r0, r0 + rh): grid[(c, r)] = fin
    for c in range(cols):
        for r in range(rows): panel_between(x0 + c * G, x0 + (c + 1) * G, y, z0 + r * HS, grid.get((c, r), 'pegboard'))
    yf = y - 63.9
    if dress:
        for k, (fin, c0, r0, cw, rh) in enumerate(blocks):
            X0, X1 = x0 + c0 * G, x0 + (c0 + cw) * G; Z0, Z1 = z0 + r0 * HS, z0 + (r0 + rh) * HS
            {'whiteboard': dress_whiteboard, 'softboard': dress_softboard, 'pegboard': dress_pegboard}[fin](X0, X1, Z0, Z1, yf, 11 * k + int(x0) % 97 + 1)
    return yf

# ---------------------------------------------------------------- real plants (Poly Haven scans) in planters
PLANTS = [('fern_02', 330), ('calathea_orbifolia_01', 300), ('anthurium_botany_01', 340), ('periwinkle_plant', 200), ('nettle_plant', 300)]
def real_plants(cx, cy, z, n=3, seed=1):
    rnd = random.Random(seed); ok = 0
    for i in range(n):
        aid, hgt = PLANTS[(seed + i) % len(PLANTS)]
        a = 2.4 * i + rnd.uniform(0, 1); rr = 0 if i == 0 else 140
        r, _ = ph_model(aid, (cx + rr * math.cos(a), cy + rr * math.sin(a), z), rnd.uniform(0, 360), hgt * rnd.uniform(0.85, 1.15), res='1k')
        ok += r is not None
    if not ok: tuft(cx, cy, z, 30, 220)

# ---------------------------------------------------------------- extra materials
_build_materials_v4 = build_materials
def build_materials(night=False):
    _build_materials_v4(night)
    MAT['steel'] = mk_cast('steel', '#C9CBCE', 0.22, 1.0)
    MAT['brushed'] = mk_cast('brushed', '#D3D5D8', 0.28, 1.0)

# ---------------------------------------------------------------- shot registry
import zlib
SHOTS = {}
def shot(sid, name, aspect='a4l', group='shots', exposure=0.0, dark=False, view=None):
    def deco(fn): SHOTS[sid] = dict(name=name, fn=fn, aspect=aspect, group=group, exposure=exposure, dark=dark, view=view); return fn
    return deco
def top_attach(tops, keys):
    for t, k in zip(tops, keys):
        if k == 'cap': put('cap', t, mat='cap')
        elif k: att(k, t, face=random.choice((0, 0, 20, -20)))

# ---------------------------------------------------------------- the lattice: seamless used panel wall + open growing section
WALL_Z0 = 180.0
WALL_BLOCKS = [('pegboard', 0, 0, 3, 3), ('whiteboard', 0, 3, 3, 2), ('softboard', 3, 0, 2, 5)]
def wall_section(dress=True, attach=True):
    tops = []
    for i, x in enumerate((0, 2 * G, 4 * G)):
        tA, tB = column(x, 0, 4, power_foot=(i == 0)); tops += [tA, tB]
        column(x, G, 4)
    yf = panel_wall(0, 0, WALL_Z0, 5, 5, WALL_BLOCKS, dress)
    if attach: top_attach(tops, ['spot', 'grow', 'clock', 'cap', 'spot', 'speaker'])
    return yf
def open_section():
    tops = []
    for (x, y, n) in [(-2 * G, 0, 3), (-2 * G, G, 2), (-4 * G, 0, 2), (-4 * G, G, 3), (-4 * G, 2 * G, 2), (-2 * G, 2 * G, 2)]:
        tA, tB = column(x, y, n); tops += [tA, tB]
    top_attach(tops, ['grow', 'cap', 'hub', 'pen', 'spot', 'clock', 'grow', 'cap', 'cap', 'speaker', 'cap', 'grow'])
    shelf_on(-1.5 * G, 0.5 * G, 300); planter_on(-1.5 * G, 0.5 * G, H + 150); real_plants(-1.5 * G, 0.5 * G, H + 250, 3, 1)
    shelf_on(-0.5 * G, 0.5 * G, 720)
    planter_on(-3.5 * G, 0.5 * G, 240); real_plants(-3.5 * G, 0.5 * G, 340, 3, 2)
    shelf_on(-3.5 * G, 1.5 * G, 650); planter_on(-2.5 * G, 1.5 * G, 520); real_plants(-2.5 * G, 1.5 * G, 620, 2, 3)
    book_row(-3.5 * G - 200, 1.5 * G - 60, 669, 9); mug(-0.5 * G + 120, 0.5 * G - 80, 739)
    climb((-2 * G, 0), 30, 1000, 2.6, trail=5); climb((-4 * G, G), 30, 1300, 3.0, trail=6)
def hero_build():
    wall_section(); open_section()

@shot('01', 'hero-lattice')
def s01(night): hero_build(); return lambda: aim(-18, 8, 35, margin=1.05)
@shot('16', 'closing-hero')
def s16(night): hero_build(); return lambda: aim(34, 7, 40, margin=1.06)
@shot('18', 'panel-wall', exposure=-0.2)
def s18(night): wall_section(); return lambda: aim(-12, 4, 50, margin=1.06)
@shot('19', 'macro-panel-seam')
def s19(night):
    yf = wall_section(attach=False)          # wall end: one clamp per post per seam, panels flush edge to edge
    camera((0, -45, WALL_Z0 + 2.5 * HS), -58, 7, 1.25, 70, dof=4)
@shot('20', 'macro-pegboard-in-use')
def s20(night):
    yf = wall_section(attach=False); camera((1.5 * G, yf, WALL_Z0 + 1.6 * HS), -18, 7, 1.55, 50, dof=5.6)
@shot('21', 'macro-softboard-pinned', aspect='a4p')
def s21(night):
    yf = wall_section(attach=False); camera((4 * G, yf, WALL_Z0 + 2.6 * HS), 16, 4, 1.65, 50, dof=5.6)
@shot('22', 'macro-whiteboard-writing')
def s22(night):
    yf = wall_section(attach=False); camera((1.5 * G, yf, WALL_Z0 + 4 * HS), -32, 3, 1.35, 50, dof=5.6)

# ---------------------------------------------------------------- round 6 shots, studio versions
@shot('02', 'exploded-system')
def s02(night):
    z0 = 300
    put('pfoot', (0, 0, 0), mat='alu_pf'); put('foot', (G, 0, 0), mat='alu'); put('frame', (0, 0, z0))
    put('connector', (0, 0, z0 + H + 150), mat='pom'); put('cap', (G, 0, z0 + HS + 150), mat='cap')
    att('spot', (0, 0, z0 + H + 150 + 230))
    put('clamp', (G + 330, 0, z0 + 200), (0, 0, -30), mat='clamp'); put('clamp', (G + 330, 0, z0 + 420), (0, 0, -30), mat='clamp')
    put('shelf', (G + 900, 250, z0 + 780), (8, -6, 20), mat='oak')
    put('pegpanel', (G + 900, -200, z0 + 120), (0, 0, 160), mats=['pegboard', 'pegboard'])
    put('vclip', (G + 330, 0, z0 + 640), (0, 0, 40), mat='clip')
    return lambda: aim(-22, 9, 50)
@shot('03', 'growth')
def s03(night):
    off = 0
    def st(fn):
        nonlocal off; fn(off); off += 3 * G
    st(lambda x: column(x, 0, 1))
    st(lambda x: (column(x, 0, 1), column(x, G, 1), shelf_on(x + G / 2, G / 2, 250)))
    st(lambda x: (column(x, 0, 2), column(x, G, 2), shelf_on(x + G / 2, G / 2, 250), att('grow', (x + G, G, H + HS))))
    st(lambda x: (column(x, 0, 2), column(x, G, 2), column(x + 2 * G, 0, 2), shelf_on(x + G / 2, G / 2, 250), planter_on(x + G / 2, G / 2, H + 120),
                  att('grow', (x + G, G, H + HS)), panel_wall(x + 2 * G, 0, 120, 1, 2, [('pegboard', 0, 0, 1, 2)])))
    st(lambda x: (column(x, 0, 3), column(x, G, 2), column(x + 2 * G, 0, 2), column(x + 2 * G, G, 1), shelf_on(x + G / 2, G / 2, 250),
                  planter_on(x + G / 2, G / 2, H + 120), real_plants(x + G / 2, G / 2, H + 220, 2, 4), att('grow', (x + G, G, H + HS)), att('spot', (x, 0, H + HS + H)),
                  panel_wall(x + 2 * G, 0, 120, 1, 2, [('softboard', 0, 0, 1, 2)]), climb((x, G, 0), 30, 900, 2.4)))
    return lambda: aim(0, 8, 70, margin=1.04)
@shot('04', 'macro-plus-socket')
def s04(night):
    put('frame', (0, 0, -H + 60)); put('connector', (0, 0, 60), mat='pom'); camera((0, 0, 70), -30, 34, 0.42, 100, dof=4)
@shot('05', 'macro-clamp')
def s05(night):
    column(0, 0, 2); panel_wall(0, 0, 300, 1, 2, [('softboard', 0, 0, 1, 2)]); camera((0, -60, 300 + HS), -38, 14, 0.8, 100, dof=5.6)
@shot('06', 'macro-grow-light-planter')
def s06(night):
    column(0, 0, 1, feet=False); column(0, G, 1, feet=False); planter_on(G / 2, G / 2, 180); real_plants(G / 2, G / 2, 280, 3, 5)
    att('grow', (0, G, H)); put('cap', (G, 0, HS), mat='cap'); camera((150, 350, 520), -24, 18, 2.3, 70, dof=5.6)
@shot('07', 'macro-power-in-foot')
def s07(night):
    put('frame', (0, 0, 0)); put('pfoot', (0, 0, 0), mat='alu_pf')
    cable = [(-30, -400, -FOOT + 4), (-30, -250, -FOOT + 4), (-20, -150, -FOOT + 6), (-10, -120, -10)]
    cu = bpy.data.curves.new('cable', 'CURVE'); cu.dimensions = '3D'; cu.bevel_depth = 3 * MM; sp = cu.splines.new('NURBS'); sp.points.add(len(cable) - 1)
    for p, q in zip(sp.points, cable): p.co = (q[0] * MM, q[1] * MM, q[2] * MM, 1)
    co = bpy.data.objects.new('cable', cu); co.data.materials.append(principled('cable', lin('#1C1C1C'), 0.5)); coll(CUR[0]).objects.link(co)
    camera((0, -40, 30), -34, 20, 0.95, 85, dof=4)
@shot('11', 'material-chips')
def s11(night):
    chips = ['frame', 'alu', 'pom', 'oak', 'pp', 'whiteboard', 'pegboard', 'softboard', 'cap', 'att_spot', 'att_grow', 'att_speaker']
    for i, k in enumerate(chips):
        x = (i % 6) * 82 - 205; y = (i // 6) * 82
        bpy.ops.mesh.primitive_cube_add(size=1, location=(x * MM, y * MM, 6 * MM)); o = bpy.context.object; o.scale = (0.06, 0.06, 0.012)
        bpy.ops.object.transform_apply(scale=True); b = o.modifiers.new('b', 'BEVEL'); b.width = 0.004; b.segments = 6
        for p in o.data.polygons: p.use_smooth = True
        o.rotation_euler[2] = math.radians(random.uniform(-2, 2)); o.data.materials.append(MAT[k]); relink(o)
    return lambda: aim(-20, 38, 85, dof=5.6, margin=1.12)
@shot('12', 'attachments')
def s12(night):
    for i, k in enumerate(['grow', 'spot', 'hub', 'pen', 'clock', 'speaker']):
        x = i * 250 - 625
        bpy.ops.mesh.primitive_cylinder_add(radius=38.1 * MM, depth=0.302, location=(x * MM, 0, 0.129), vertices=128); s = bpy.context.object
        for p in s.data.polygons: p.use_smooth = True
        s.data.materials.append(MAT['frame']); relink(s); att(k, (x, 0, 280), face=0)
    return lambda: aim(0, 8, 70)
@shot('13', 'power-path')
def s13(night):
    tops = []
    for i, (x, y, n) in enumerate([(0, 0, 2), (0, G, 2), (2 * G, 0, 1)]): tA, tB = column(x, y, n, power_foot=(i == 0)); tops += [tA, tB]
    for o in list(coll(CUR[0]).objects):
        if o.data and o.data.name.split('.')[0] in ('frame', 'connector'):
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
    return lambda: aim(-36, 20, 50)
@shot('15', 'combinations')
def s15(night):
    layouts = [[(0, 0, 1)], [(0, 0, 2), (0, G, 1)], [(0, 0, 1), (2 * G, 0, 1)], [(0, 0, 3), (0, G, 2), (2 * G, 0, 1)], [(0, 0, 2), (2 * G, 0, 2), (0, G, 2), (2 * G, G, 2)],
               [(0, 0, 1), (0, G, 1), (0, 2 * G, 1)]]
    for i, lay in enumerate(layouts):
        ox = (i % 3) * 2400; oy = (i // 3) * 2400; tops = []
        for (x, y, n) in lay: tA, tB = column(ox + x, oy + y, n); tops += [tA, tB]
        top_attach(tops, random.sample(['spot', 'grow', 'clock', 'hub', 'pen', 'speaker', 'cap', 'cap'], k=min(8, len(tops))) + ['cap'] * 8)
        if any(x == 0 and y == G for (x, y, n) in lay): shelf_on(ox + G / 2, oy + G / 2, 260)
    return lambda: aim(-30, 30, 45, margin=1.04)
@shot('17', 'builder-presets')
def s17(night):
    column(0, 0, 1, power_foot=True); att('spot', (0, 0, H)); put('cap', (G, 0, HS), mat='cap')
    column(2000, 0, 2); column(2000, G, 2); shelf_on(2000 + G / 2, G / 2, 720); att('clock', (2000, 0, H + HS)); att('hub', (2000 + G, G, H + HS))
    column(4000, 0, 2); column(4000, G, 1); planter_on(4000 + G / 2, G / 2, 240); att('grow', (4000, G, H)); real_plants(4000 + G / 2, G / 2, 340, 2, 6)
    return lambda: aim(-12, 10, 40, margin=1.05)

# ---------------------------------------------------------------- every part: packshots (P-) and orthographic views (O-)
PARTS = [('frame', 'h-frame'), ('connector', 'frame-connector'), ('cap', 'end-cap'), ('foot', 'floor-foot'), ('pfoot', 'power-in-foot'),
         ('clamp', 'universal-clamp'), ('shelf', 'shelf'), ('wb', 'panel-whiteboard'), ('peg', 'panel-pegboard'), ('soft', 'panel-softboard'),
         ('planter', 'planter'), ('grow', 'grow-light'), ('spot', 'spotlight'), ('hub', 'power-hub'), ('pen', 'pen-stand'),
         ('clock', 'clock-puck'), ('speaker', 'speaker-puck'), ('vclip', 'vine-clip')]
def build_part(k):
    if k in ('grow', 'spot', 'hub', 'pen', 'clock', 'speaker'): return att(k, (0, 0, 0))
    if k == 'wb': return put('panel', (0, 0, 0), (0, 0, 180), mats=['whiteboard', 'whiteboard'])
    if k == 'soft': return put('panel', (0, 0, 0), (0, 0, 180), mats=['softboard', 'softboard'])
    if k == 'peg': return put('pegpanel', (0, 0, 0), (0, 0, 180), mats=['pegboard', 'pegboard'])
    if k == 'planter': put('pextras', (0, 0, 0), mat='pp'); return put('planter', (0, 0, 0), mat='pp')
    mat = {'frame': 'frame', 'connector': 'pom', 'cap': 'cap', 'foot': 'alu', 'pfoot': 'alu_pf', 'clamp': 'clamp', 'shelf': 'oak', 'vclip': 'clip'}[k]
    return put(k, (0, 0, 0), mat=mat)
ASM = [('hframe', 'single-h-frame'), ('tower', 'tower-2x2'), ('wall', 'panel-wall'), ('lattice', 'full-lattice')]
def build_asm(k):
    if k == 'hframe': column(0, 0, 1, power_foot=True); att('spot', (0, 0, H)); put('cap', (G, 0, HS), mat='cap')
    elif k == 'tower':
        tops = []
        for (x, y) in ((0, 0), (0, G)): tA, tB = column(x, y, 2); tops += [tA, tB]
        top_attach(tops, ['grow', 'clock', 'spot', 'cap']); shelf_on(G / 2, G / 2, 300); planter_on(G / 2, G / 2, H + 150); real_plants(G / 2, G / 2, H + 250, 3, 7)
        panel_wall(0, 0, 120, 1, 1, [('pegboard', 0, 0, 1, 1)])
    elif k == 'wall': wall_section()
    elif k == 'lattice': hero_build()
VIEWS = [('front', 0, 0), ('side', 90, 0), ('top', 0, 90), ('iso', 45, 35.264), ('back', 180, 0)]
def _reg_part(k, nm):
    @shot('P-' + nm, 'packshot-' + nm, aspect='auto', group='packshots', view=(-35, 18))
    def p(night, k=k): build_part(k); return lambda: aim(-35, 18, 85, margin=1.14)
    for v, az, el in VIEWS[:4]:
        @shot('O-%s-%s' % (nm, v), 'ortho-%s-%s' % (nm, v), aspect='auto', group='ortho', view=(az, el))
        def o(night, k=k, az=az, el=el): build_part(k); return lambda: aim(az, el, ortho=True, margin=1.12)
for k, nm in PARTS: _reg_part(k, nm)
for k, nm in ASM:
    for v, az, el in VIEWS[:4] + ([VIEWS[4]] if k in ('wall', 'lattice') else []):
        def _o(night, k=k, az=az, el=el): build_asm(k); return lambda: aim(az, el, ortho=True, margin=1.06)
        shot('O-asm-%s-%s' % (nm, v), 'ortho-asm-%s-%s' % (nm, v), aspect='auto', group='ortho', view=(az, el))(_o)

# ---------------------------------------------------------------- run
def auto_aspect(view):
    mn, mx, _ = bounds(); d = mx - mn; az, el = view
    if el > 80: w, h = d.x, d.y
    elif el < 1 and abs(az) % 180 == 90: w, h = d.y, d.z
    elif el < 1: w, h = d.x, d.z
    else:
        a = math.radians(az); w = abs(d.x * math.cos(a)) + abs(d.y * math.sin(a))
        h = d.z * math.cos(math.radians(el)) + (abs(d.x * math.sin(a)) + abs(d.y * math.cos(a))) * math.sin(math.radians(el))
    r = w / max(h, 1e-6)
    return 'a4l' if r > 1.2 else ('a4p' if r < 0.83 else 'sq')
def set_res(aspect):
    rr = sc.render; R = A.res
    if aspect == 'a4l': rr.resolution_x, rr.resolution_y = R, round(R / 1.41421)
    elif aspect == 'a4p': rr.resolution_x, rr.resolution_y = round(R / 1.41421), R
    else: rr.resolution_x = rr.resolution_y = round(R * 0.85)
    rr.resolution_percentage = 100
def render(sid):
    global sc, CAM
    sc = reset(); CAM = None; MESH.clear(); MESHM.clear(); SHOTCOL.clear(); LEAF.clear(); random.seed(zlib.crc32(sid.encode()))
    POSTS.clear(); CLAMPS.clear(); WARN.clear(); USED.clear()
    build_materials(False)
    S = SHOTS[sid]; CUR[0] = 's'; spec = S['fn'](False)
    for (px, py), top in list(POSTS.items()):
        if (round(px), round(py)) not in USED: put('cap', (px, py, top), mat='cap')
    set_res(auto_aspect(S['view']) if S['aspect'] == 'auto' else S['aspect'])
    if callable(spec): spec()
    mn, mx, _ = bounds(); catcher(mn.z)
    studio_soft(S['dark'])
    sc.view_settings.exposure = S['exposure'] + EXPO
    out = os.path.join(A.out, S['group']); os.makedirs(out, exist_ok=True)
    base = 'OG7-%s_%s%s' % (sid, S['name'], A.tag)
    if base.startswith('OG7-P-') or base.startswith('OG7-O-'): base = 'OG7-' + S['name'] + A.tag
    compositor(out, base)
    for w in WARN: print('WARN', sid, w, flush=True)
    if A.save: bpy.ops.wm.save_as_mainfile(filepath=os.path.join(out, base + '.blend'))
    if A.dry: print('dry', sid, len(scene_objs()), 'objects', sc.render.resolution_x, sc.render.resolution_y, flush=True); return
    bpy.ops.render.render(write_still=False); print('rendered', sid, base, flush=True)
EXPO = -1.7
if A.list:
    for k, v in SHOTS.items(): print(k, v['name'], v['group'], v['aspect'])
    sys.exit(0)
if A.shots == 'all': want = list(SHOTS)
elif A.shots.startswith('group:'): want = [k for k, v in SHOTS.items() if v['group'] == A.shots[6:]]
else: want = [s_ for s_ in A.shots.split(',') if s_]
for sid in want:
    if sid not in SHOTS: print('WARN unknown shot', sid, flush=True); continue
    try: render(sid)
    except Exception as e:
        import traceback; traceback.print_exc(); print('FAILED', sid, e, flush=True)
