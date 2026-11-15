# Shrink a GLB with KHR_mesh_quantization: int16 positions, int8 normals, uint16 indices where they fit.
# Dequantisation goes on a new child node per mesh so parent transforms and names are untouched.
import json, struct, sys, numpy as np
src, dst = sys.argv[1], sys.argv[2]
b = open(src, 'rb').read()
jl = struct.unpack('<I', b[12:16])[0]; j = json.loads(b[20:20+jl])
bin0 = b[20+jl+8:]
CT = {5120: np.int8, 5121: np.uint8, 5122: np.int16, 5123: np.uint16, 5125: np.uint32, 5126: np.float32}
NC = {'SCALAR': 1, 'VEC2': 2, 'VEC3': 3, 'VEC4': 4, 'MAT4': 16}
def read(ai):
    a = j['accessors'][ai]; bv = j['bufferViews'][a['bufferView']]
    n = NC[a['type']]; dt = np.dtype(CT[a['componentType']])
    off = bv.get('byteOffset', 0) + a.get('byteOffset', 0); stride = bv.get('byteStride', 0) or n * dt.itemsize
    raw = np.frombuffer(bin0, dtype=np.uint8, count=stride * (a['count'] - 1) + n * dt.itemsize, offset=off)
    out = np.lib.stride_tricks.as_strided(raw, shape=(a['count'], n * dt.itemsize), strides=(stride, 1)).copy()
    return out.view(dt).reshape(a['count'], n)
out = bytearray(); views = []; accs = []
def put(arr, target=None, stride=None):
    while len(out) % 4: out.append(0)
    off = len(out); data = arr.tobytes(); out.extend(data)
    v = {'buffer': 0, 'byteOffset': off, 'byteLength': len(data)}
    if target: v['target'] = target
    if stride: v['byteStride'] = stride
    views.append(v); return len(views) - 1
def acc(view, ct, count, typ, normalized=False, mn=None, mx=None):
    a = {'bufferView': view, 'componentType': ct, 'count': count, 'type': typ}
    if normalized: a['normalized'] = True
    if mn is not None: a['min'] = mn; a['max'] = mx
    accs.append(a); return len(accs) - 1
# keep image buffer views (textures) as they are
img_map = {}
for im in j.get('images', []):
    if 'bufferView' in im:
        bv = j['bufferViews'][im['bufferView']]; o = bv.get('byteOffset', 0)
        nv = put(np.frombuffer(bin0[o:o+bv['byteLength']], dtype=np.uint8)); im['bufferView'] = nv
mesh_xf = {}
for mi, m in enumerate(j['meshes']):
    allp = np.concatenate([read(p['attributes']['POSITION']).astype(np.float64) for p in m['primitives']])
    lo, hi = allp.min(0), allp.max(0); c = (lo + hi) / 2; s = max((hi - lo).max() / 2, 1e-9)
    mesh_xf[mi] = (c, s)
    for p in m['primitives']:
        na = {}
        for k, ai in p['attributes'].items():
            a = read(ai)
            if k == 'POSITION':
                q = np.round((a - c) / s * 32767).clip(-32767, 32767).astype(np.int16)
                q4 = np.zeros((len(q), 4), np.int16); q4[:, :3] = q
                v = put(q4, 34962, 8); na[k] = acc(v, 5122, len(q), 'VEC3', True, (q.min(0) / 32767).tolist(), (q.max(0) / 32767).tolist())
            elif k == 'NORMAL':
                n = a / np.maximum(np.linalg.norm(a, axis=1, keepdims=True), 1e-9)
                q = np.round(n * 127).clip(-127, 127).astype(np.int8); q4 = np.zeros((len(q), 4), np.int8); q4[:, :3] = q
                v = put(q4, 34962, 4); na[k] = acc(v, 5120, len(q), 'VEC3', True)
            elif k.startswith('TEXCOORD'):
                v = put(a.astype(np.float32), 34962); na[k] = acc(v, 5126, len(a), 'VEC2')
            else:
                v = put(a, 34962); src_a = j['accessors'][ai]; na[k] = acc(v, src_a['componentType'], len(a), src_a['type'], src_a.get('normalized', False))
        p['attributes'] = na
        if 'indices' in p:
            ix = read(p['indices']).ravel()
            if ix.max() < 65535: ix = ix.astype(np.uint16); ct = 5123
            else: ix = ix.astype(np.uint32); ct = 5125
            v = put(ix, 34963); p['indices'] = acc(v, ct, len(ix), 'SCALAR')
        p.pop('targets', None)
# move each mesh onto a dequantising child node
for ni in range(len(j['nodes'])):
    n = j['nodes'][ni]
    if 'mesh' not in n: continue
    c, s = mesh_xf[n['mesh']]
    child = {'name': n.get('name', ''), 'mesh': n.pop('mesh'), 'translation': c.tolist(), 'scale': [s, s, s]}
    if 'skin' in n: child['skin'] = n.pop('skin')
    j['nodes'].append(child); n.setdefault('children', []).append(len(j['nodes']) - 1)
j['bufferViews'] = views; j['accessors'] = accs
j['buffers'] = [{'byteLength': len(out)}]
for k in ('extensionsUsed', 'extensionsRequired'):
    j[k] = sorted(set(j.get(k, []) + ['KHR_mesh_quantization']))
js = json.dumps(j, separators=(',', ':')).encode(); js += b' ' * (-len(js) % 4)
while len(out) % 4: out.append(0)
total = 12 + 8 + len(js) + 8 + len(out)
with open(dst, 'wb') as f:
    f.write(struct.pack('<III', 0x46546C67, 2, total)); f.write(struct.pack('<II', len(js), 0x4E4F534A)); f.write(js)
    f.write(struct.pack('<II', len(out), 0x004E4942)); f.write(out)
print(src, len(b), '->', total)
