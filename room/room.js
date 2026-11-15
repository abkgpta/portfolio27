// ABK studio room: the homepage as a room. Each object is a real project model and opens that project.
// three.js r170. Units are metres, floor at y = 0, back wall at z = -WALL_Z, left wall at x = -WALL_X.
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { SVGLoader } from 'three/addons/loaders/SVGLoader.js';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';

const SITE = 'https://abkgpta.github.io/portfolio27/';
const A = 'assets/';
const LOGO_D = "M229.998 0C304.84 0 376.633 13.0527 443.227 37.002C446.888 38.319 449.763 41.2349 450.907 44.9541C456.119 61.8884 458.945 79.8675 458.995 98.5C458.945 117.133 456.119 135.112 450.907 152.046C449.763 155.765 446.888 158.681 443.227 159.998C376.633 183.947 304.84 197 229.998 197C154.727 197 82.5397 183.8 15.624 159.588C11.9626 158.263 9.09328 155.339 7.95703 151.615C2.82935 134.807 0.0493003 116.975 0 98.5C0.0493003 80.0254 2.82935 62.1931 7.95703 45.3848C9.09328 41.6606 11.9626 38.7369 15.624 37.4121C82.5397 13.2001 154.727 0 229.998 0ZM267.902 27.8975C249.673 24.1237 207.941 25.964 185.364 29.6846C183.228 30.0366 181.494 31.5544 180.863 33.625C167.471 77.5747 175.453 137.945 184.732 165.46C185.436 167.546 187.269 168.99 189.455 169.249C216.598 172.462 265.99 173.801 296.028 166.367C297.81 165.926 299.266 164.649 299.899 162.927C310.169 135.022 308.843 84.297 304.526 71.4277C304.141 70.28 303.265 69.4097 302.104 69.0635C297.594 67.7174 288.999 67.3918 282.463 67.208C279.106 67.1136 276.554 64.2652 276.595 60.9072C276.734 49.3588 275.035 38.5076 271.496 30.75C270.822 29.2717 269.494 28.2269 267.902 27.8975ZM143.666 33.7334C111.316 28.9145 38.1801 44.4348 23.7979 51.7012C22.5707 52.3212 21.8622 53.5008 21.5908 54.8486C18.0646 72.3625 14.0229 109.837 24.2783 143.775C24.6842 145.119 25.5679 146.273 26.7812 146.978C30.1735 148.948 33.5245 150.411 36.6035 151.458C40.8031 152.886 44.1531 148.718 42.8945 144.465C37.7341 127.026 35.4616 106.986 36.7139 93.0557C36.8392 91.6618 37.4646 90.362 38.6318 89.5898C53.2061 79.9486 109.042 75.93 127.998 75.8047C130.944 75.7852 133.242 78.0784 133.421 81.0186C134.592 100.256 134.633 124.713 129.946 155.694C129.712 157.24 130.059 158.839 131.049 160.049C133.857 163.483 137.157 166.153 140.851 168.159C144.023 169.882 147.692 167.691 148.251 164.124C153.799 128.7 157.562 57.1298 147.325 36.2988C146.622 34.8689 145.242 33.9682 143.666 33.7334ZM195.545 73.1992C224.302 69.6315 254.239 71.168 284.227 75.0801C286.705 75.4033 288.726 77.2324 289.137 79.6973C293.054 103.187 289.222 141.985 286.127 158.837C285.694 161.193 283.83 162.977 281.463 163.348C260.009 166.71 226.062 167.53 206.201 163.332C204.425 162.956 202.97 161.729 202.244 160.064C192.482 137.676 187.515 112.193 190.472 78.4658C190.711 75.7333 192.823 73.537 195.545 73.1992ZM337.605 30.4629C336.084 29.736 334.678 30.7503 334.072 32.3242C324.866 56.2433 318.565 116.371 334.622 160.061C335.464 162.351 337.78 164.02 339.998 163.002C343.639 161.331 345.95 157.262 348.224 152.219C349.085 150.307 348.799 148.099 347.844 146.232C340.214 131.33 338.594 97.1025 341.142 84.1279C341.556 82.0189 343.369 80.6391 345.518 80.6064C360.517 80.3797 403.323 84.7822 421.493 87.7568C423.971 88.1626 425.867 90.1299 426.145 92.625C428.558 114.317 423.135 136.446 421.475 144.911C421.05 147.076 422.466 148.389 424.633 147.972C430.715 146.799 435.068 143.975 437.343 141.972C438.199 141.217 438.674 140.144 438.838 139.015C441.398 121.384 441.986 109.705 441.681 91.79C441.634 89.052 439.734 86.6982 437.054 86.1377C415.441 81.6198 372.494 75.3356 351.579 74.915C369.133 74.915 409.78 73.815 422.1 71.6152C424.016 71.273 425.323 69.7087 425.581 67.7793C426.315 62.29 426.432 55.3893 424.505 51.2744C424.25 50.7312 423.863 50.2642 423.391 49.8945C421.342 48.2918 418.389 46.8537 415.916 45.957C413.423 45.053 411.579 46.8632 411.641 49.5146C411.786 55.7987 412.106 61.0393 411.349 65.2363C411.014 67.0899 409.541 68.448 407.685 68.7666C394.9 70.9605 360.306 71.1756 347.95 70.3613C345.577 70.2049 343.787 68.4235 343.823 66.0459C343.939 58.484 346.478 46.1943 347.578 40.6387C347.931 38.8567 347.261 37.1434 345.828 36.0264C343.005 33.8252 339.867 31.5431 337.605 30.4629ZM42.4521 52.6494C57.1893 46.8558 101.639 37.7127 125.869 39.7109C127.94 39.8818 129.724 41.2193 130.313 43.2119C132.078 49.179 132.428 56.8406 132.288 63.8779C132.224 67.0685 129.585 69.5624 126.396 69.6562C101.693 70.3829 61.2305 75.3897 42.2803 79.8086C39.6851 80.4137 37.2834 79.186 37.2432 76.5215C37.1566 70.7785 38.4246 61.3382 39.4482 56.2539C39.78 54.6066 40.8882 53.2643 42.4521 52.6494ZM198.63 34.9844C213.299 31.863 236.867 30.6392 258.317 33.0352C260.507 33.2797 262.384 34.7416 262.89 36.8857C264.594 44.117 264.658 54.2966 264.339 61.0488C264.182 64.3545 261.222 66.6741 257.921 66.4375C241.941 65.2916 212.016 65.4941 197.163 66.4512C193.749 66.6711 190.65 64.1633 190.754 60.7441C190.989 52.9812 192.706 44.9656 194.456 38.8896C195.025 36.9149 196.62 35.4121 198.63 34.9844Z";
const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
const phone = () => innerWidth <= 760;

const PROJECTS = {
  overgrwth: {
    title: 'overgrwth',
    lede: 'A modular workspace system for creative spaces. Two kinds of part, H-frames and modules, and it grows with you.',
    img: 'og4-hero.jpg', cap: 'The full system with every attachment on.',
    meta: [['Year', '2025'], ['Type', 'Modular design'], ['Team', 'Abhik Gupta, Abhishek Vishwakarma, Dhawal Musale']],
    href: SITE + '#overgrwth', open: 'Open overgrwth',
    model: 'The model in the room is the signed-off 3 in CAD build.',
  },
  cortx: {
    title: 'CortX',
    lede: 'A headset and back unit that read the brain and body in real training, and a pitch-side app that turns it into something a coach can act on today.',
    img: 'cx5-pitch-hero.jpg', cap: 'The headset on the pitch, under the floodlights.',
    meta: [['Type', 'Neuro-performance system'], ['Credit', 'Abhik Gupta, Ansha Gawande']],
    href: SITE + '#cortx', open: 'Open CortX',
    model: 'On the bench: the team dock, a headset on its head form, the back unit and the coach tablet.',
  },
  dash: {
    title: 'DASH',
    lede: 'A one-button wrist music player for runners who leave their phone at home. Its dot matrix screen here shows the time in India right now.',
    img: null, cap: '',
    meta: [['Type', 'Solo concept'], ['Screen', '64 × 32 dots under smoked silicone']],
    href: SITE + '#dash', open: 'DASH on the site', soon: 'Case study coming soon',
    model: '',
  },
};

/* ---------- DOM ---------- */
const stage = document.getElementById('stage');
const panel = document.getElementById('panel');
const statusEl = document.getElementById('status');
const tags = [...document.querySelectorAll('.tag')];
const say = (t) => { statusEl.textContent = t; statusEl.classList.toggle('on', !!t); };

/* ---------- renderer ---------- */
let renderer;
try {
  renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
  if (!renderer.getContext()) throw new Error('no gl');
} catch (e) {
  document.body.classList.add('nogl');
  window.ABKLoader && ABKLoader.hold().done();
  throw e;
}
const hold = window.ABKLoader ? ABKLoader.hold() : { progress() {}, done() {} };
const DPR = () => Math.min(devicePixelRatio || 1, phone() ? 1.6 : 2);
renderer.setPixelRatio(DPR());
renderer.setSize(innerWidth, innerHeight);
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.NeutralToneMapping;
renderer.toneMappingExposure = 1.0;
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
stage.appendChild(renderer.domElement);

const scene = new THREE.Scene();
scene.background = new THREE.Color('#F2ECE8');
const pmrem = new THREE.PMREMGenerator(renderer);
scene.environment = pmrem.fromScene(new RoomEnvironment(renderer), 0.04).texture;
scene.environmentIntensity = 0.55;

const camera = new THREE.PerspectiveCamera(34, innerWidth / innerHeight, 0.01, 60);
const controls = new OrbitControls(camera, renderer.domElement);
controls.enableDamping = !reduce;
controls.dampingFactor = 0.08;
controls.enablePan = false;
controls.rotateSpeed = 0.6;
controls.zoomSpeed = 0.7;

/* ---------- render on demand ---------- */
let dirty = 3;
const wake = (n = 2) => { dirty = Math.max(dirty, n); };
controls.addEventListener('change', () => wake(2));

/* ---------- room shell ---------- */
const WALL_X = 2.35, WALL_Z = 1.95, H = 4.2;
const mat = (c, r = 0.85, m = 0, extra = {}) => new THREE.MeshStandardMaterial({ color: c, roughness: r, metalness: m, ...extra });
const M = {
  floor: mat('#E4D9D1', 0.9),
  wallBack: mat('#F7F2EF', 0.95),
  wallLeft: mat('#FCEDE6', 0.95),
  skirting: mat('#0A0A0A', 0.6),
  oak: mat('#C2B19E', 0.6),
  steel: mat('#151515', 0.45, 0.6),
  plinth: mat('#EFE6E0', 0.9),
  frame: mat('#0A0A0A', 0.5, 0.1),
  pink: mat('#FF006A', 0.38, 0.0),
};
function add(mesh, cast = true, receive = true) { mesh.castShadow = cast; mesh.receiveShadow = receive; scene.add(mesh); return mesh; }
const box = (w, h, d, m) => new THREE.Mesh(new THREE.BoxGeometry(w, h, d), m);

add(Object.assign(new THREE.Mesh(new THREE.PlaneGeometry(14, 14), M.floor), {}), false).rotation.x = -Math.PI / 2;
const back = add(box(2 * WALL_X + 6, H, 0.1, M.wallBack), false); back.position.set(0, H / 2, -WALL_Z - 0.05);
const left = add(box(0.1, H, 2 * WALL_Z + 6, M.wallLeft), false); left.position.set(-WALL_X - 0.05, H / 2, 0);
// skirting: a filled band, not a line
const sk1 = add(box(2 * WALL_X + 6, 0.08, 0.02, M.skirting), false); sk1.position.set(0, 0.04, -WALL_Z + 0.01);
const sk2 = add(box(0.02, 0.08, 2 * WALL_Z + 6, M.skirting), false); sk2.position.set(-WALL_X + 0.01, 0.04, 0);


/* ---------- light ---------- */
scene.add(new THREE.HemisphereLight('#FFF6F0', '#B9A89C', 0.55));
const sun = new THREE.DirectionalLight('#FFF1E6', 3.2);
sun.position.set(3.2, 5.2, 3.6);
sun.target.position.set(-0.6, 0, -1.2);
sun.castShadow = true;
const sm = phone() ? 1024 : 2048;
sun.shadow.mapSize.set(sm, sm);
Object.assign(sun.shadow.camera, { left: -4.5, right: 4.5, top: 4.5, bottom: -4.5, near: 0.5, far: 14 });
sun.shadow.bias = -0.0004; sun.shadow.normalBias = 0.02; sun.shadow.radius = 4;
scene.add(sun, sun.target);
const fill = new THREE.DirectionalLight('#FFE6EE', 0.5); fill.position.set(-2, 3, 4); scene.add(fill);

/* ---------- loaders ---------- */
const manager = new THREE.LoadingManager();
manager.onProgress = (_u, done, total) => hold.progress(Math.min(0.98, done / total));
const gltfLoader = new GLTFLoader(manager);
// The artifact preview can only serve text, so there the models ship as base64 (.glb.txt).
const B64 = document.documentElement.dataset.models === 'b64' || !!document.querySelector('meta[name="room-models"][content="b64"]');
const gltf = {
  load(url, onLoad) {
    if (!B64) return gltfLoader.load(url, onLoad, undefined, (e) => console.warn(url, e));
    manager.itemStart(url);
    fetch(url + '.txt').then((r) => { if (!r.ok) throw new Error(r.status); return r.text(); })
      .then((t) => { const bin = Uint8Array.from(atob(t.trim()), (c) => c.charCodeAt(0)); gltfLoader.parse(bin.buffer, '', (g) => { onLoad(g); manager.itemEnd(url); }, (e) => { manager.itemError(url); manager.itemEnd(url); }); })
      .catch(() => { manager.itemError(url); manager.itemEnd(url); });
  },
};
const texLoader = new THREE.TextureLoader(manager);
const tex = (f) => { const t = texLoader.load(A + f, () => wake()); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4; return t; };

/* ---------- stations ---------- */
const stations = {}; // id -> { group, focus: {target, pos}, tagAt: Vector3 }
const pickables = [];
function station(id, group) { group.userData.station = id; group.traverse((o) => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; o.userData.station = id; pickables.push(o); } }); scene.add(group); stations[id] = { group }; return group; }
const bbox = (o) => new THREE.Box3().setFromObject(o);

/* bench along the back wall: oak top, black steel frame */
const bench = new THREE.Group();
{
  const W = 2.3, D = 0.78, T = 0.04, Hh = 0.74;
  const top = box(W, T, D, M.oak); top.position.y = Hh - T / 2; bench.add(top);
  for (const sx of [-1, 1]) {
    const legA = box(0.04, Hh - T, 0.04, M.steel), legB = legA.clone();
    legA.position.set(sx * (W / 2 - 0.08), (Hh - T) / 2, -D / 2 + 0.06);
    legB.position.set(sx * (W / 2 - 0.08), (Hh - T) / 2, D / 2 - 0.06);
    const rail = box(0.04, 0.04, D - 0.12, M.steel); rail.position.set(sx * (W / 2 - 0.08), 0.12, 0);
    bench.add(legA, legB, rail);
  }
  const stretcher = box(W - 0.16, 0.04, 0.04, M.steel); stretcher.position.set(0, 0.12, -D / 2 + 0.06); bench.add(stretcher);
  bench.traverse((o) => { if (o.isMesh) { o.castShadow = o.receiveShadow = true; } });
  bench.position.set(0.45, 0, -WALL_Z + D / 2 + 0.02);
  scene.add(bench);
}
const BENCH_TOP = 0.74;

/* DASH plinth near the right of the room */
const plinth = new THREE.Group();
{
  const p = new THREE.Mesh(new RoundedBoxGeometry(0.42, 1.02, 0.42, 3, 0.012), M.plinth); p.position.y = 0.51; plinth.add(p);
  const cap = box(0.3, 0.012, 0.3, mat('#DDD2CA', 0.8)); cap.position.y = 1.026; plinth.add(cap);
  plinth.traverse((o) => { if (o.isMesh) { o.castShadow = o.receiveShadow = true; } });
  plinth.position.set(2.0, 0, -0.85);
  scene.add(plinth);
}
const PLINTH_TOP = 1.032;

/* ABK badge on the back wall: the real logo outline, extruded */
let badge;
{
  const svg = new SVGLoader().parse(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 459 197"><path fill-rule="evenodd" d="${LOGO_D}"/></svg>`);
  const shapes = svg.paths.flatMap((p) => SVGLoader.createShapes(p));
  const g = new THREE.ExtrudeGeometry(shapes, { depth: 26, bevelEnabled: true, bevelSize: 1.6, bevelThickness: 1.6, bevelSegments: 2, curveSegments: 10 });
  g.center();
  badge = new THREE.Mesh(g, M.pink);
  const s = 1.05 / 459; badge.scale.set(s, -s, s);
  badge.position.set(0.45, 1.9, -WALL_Z + 0.04);
  badge.castShadow = true;
  scene.add(badge);
}

/* framed prints of real renders */
function print(file, w, h, pos, rotY = 0) {
  const g = new THREE.Group();
  const f = box(w + 0.05, h + 0.05, 0.03, M.frame); g.add(f);
  const mount = new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshStandardMaterial({ map: tex(file), roughness: 0.7 }));
  mount.position.z = 0.0155; g.add(mount);
  g.position.copy(pos); g.rotation.y = rotY;
  g.traverse((o) => { if (o.isMesh) o.castShadow = true; });
  scene.add(g);
  return g;
}
const ogPrint = print('og4-hero.jpg', 0.7, 0.495, new THREE.Vector3(-1.05, 1.9, -WALL_Z + 0.02));
const cxPrint = print('cx5-pitch-hero.jpg', 0.72, 0.405, new THREE.Vector3(1.75, 1.9, -WALL_Z + 0.02));

/* ---------- overgrwth: the signed-off CAD build ---------- */
const ogGroup = new THREE.Group();
gltf.load(A + 'og-system.glb', (g) => {
  const m = g.scene;
  m.traverse((o) => { if (o.isMesh && o.material) { o.material.envMapIntensity = 0.6; } });
  ogGroup.add(m);
  // stand it on the floor against the left wall, square to the room
  const b = bbox(ogGroup), c = b.getCenter(new THREE.Vector3());
  m.position.sub(new THREE.Vector3(c.x, b.min.y, c.z));
  ogGroup.rotation.y = Math.PI / 2;
  const b2 = bbox(ogGroup);
  ogGroup.position.set(-WALL_X + 0.06 + (b2.max.x - b2.min.x) / 2, 0, -1.05);
  station('overgrwth', ogGroup);
  layout();
});

/* ---------- CortX: dock, headset, back unit, tablet ---------- */
const cxGroup = new THREE.Group();
const CX_PARTS = { headset: null, dock: null };
let cxLeft = 3;
const cxDone = () => { if (--cxLeft === 0) { station('cortx', cxGroup); seatHeadset(); layout(); } };
gltf.load(A + 'cx_dock.glb', (g) => {
  const m = g.scene; CX_PARTS.dock = m;
  // the dock is 1.3 m for six heads; it sits on the bench
  const b = bbox(m), c = b.getCenter(new THREE.Vector3());
  m.position.set(-c.x, BENCH_TOP - b.min.y, -c.z);
  m.position.add(new THREE.Vector3(0.45, 0, -WALL_Z + 0.3));
  cxGroup.add(m); cxDone();
});
gltf.load(A + 'cx_back_unit.glb', (g) => {
  const m = g.scene; const b = bbox(m);
  m.rotation.x = -Math.PI / 2; // lying flat on the bench, clip down
  const b2 = bbox(m);
  m.position.set(-0.3, BENCH_TOP - b2.min.y, -WALL_Z + 0.62);
  m.rotation.z = 0.35;
  cxGroup.add(m); cxDone();
});
gltf.load(A + 'cx_tablet.glb', (g) => {
  const m = g.scene; const b = bbox(m);
  m.position.set(0.9, BENCH_TOP - b.min.y + 0.001, -WALL_Z + 0.6);
  m.rotation.y = -0.25;
  cxGroup.add(m); cxDone();
});
function seatHeadset() {
  // the headset follows once the room is up: it is the heaviest file
  gltf.load(A + 'cortx_headset.glb', (g) => {
    const m = g.scene;
    const look = (name) => {
      if (/^electrode|electrodes|Solid/.test(name)) return mat('#B9BCC2', 0.28, 0.9);
      if (/hard_lining|hidden_frame/.test(name)) return mat('#3A2A8C', 0.5, 0.05);
      if (/soft_lining|Sheet/.test(name)) return mat('#2A2830', 0.95);
      if (/webbing|boa|Pipe|gasket/.test(name)) return mat('#141414', 0.55, 0.1);
      if (/^top|Lofted/.test(name)) return mat('#F1F2F4', 0.22, 0.0);
      return mat('#A9AEB8', 0.3, 0.0);
    };
    m.traverse((o) => {
      if (!o.isMesh) return;
      let n = o, name = '';
      while (n && !name) { if (n.name && !/^(Mesh|Object|mesh)/.test(n.name)) name = n.name; n = n.parent; }
      o.material = look(name);
      if (!/^(top|Lofted)/.test(name)) Object.assign(o.material, { polygonOffset: true, polygonOffsetFactor: 2, polygonOffsetUnits: 2 });
      o.castShadow = true; o.receiveShadow = false; o.userData.station = 'cortx'; pickables.push(o);
    });
    // seat on the first head form of the dock
    const head = CX_PARTS.dock.getObjectByName('dock_head_1');
    const hb = bbox(head), hc = hb.getCenter(new THREE.Vector3());
    const b = bbox(m), c = b.getCenter(new THREE.Vector3());
    const headW = hb.max.x - hb.min.x, setW = b.max.x - b.min.x;
    const s = Math.min(1.6, Math.max(0.6, (headW * 1.08) / setW));
    m.scale.setScalar(s);
    const b2 = bbox(m), c2 = b2.getCenter(new THREE.Vector3());
    m.position.add(new THREE.Vector3(hc.x - c2.x, hb.max.y + 0.006 - b2.max.y, hc.z - c2.z));
    cxGroup.add(m);
    layout(); wake();
  });
}

/* ---------- DASH: built from the overview spec ---------- */
// Pod 42 x 28 x 11 mm, 64 x 32 dot screen under smoked silicone, four LEDs, one button (the face).
const dashGroup = new THREE.Group();
const DOTS_W = 64, DOTS_H = 32, CELL = 8;
const dashCanvas = document.createElement('canvas');
dashCanvas.width = DOTS_W * CELL; dashCanvas.height = DOTS_H * CELL;
const dashTex = new THREE.CanvasTexture(dashCanvas); dashTex.colorSpace = THREE.SRGBColorSpace; dashTex.anisotropy = 8;
{
  const k = 1; // real scale, metres
  const pod = new THREE.Mesh(new RoundedBoxGeometry(0.042 * k, 0.011 * k, 0.028 * k, 4, 0.004 * k), mat('#121212', 0.55, 0.05));
  pod.position.y = 0.0055 * k;
  const screen = new THREE.Mesh(new THREE.PlaneGeometry(0.030 * k, 0.015 * k), new THREE.MeshBasicMaterial({ map: dashTex, toneMapped: false }));
  screen.rotation.x = -Math.PI / 2; screen.position.set(-0.002 * k, 0.0111 * k, -0.002 * k);
  const smoke = new THREE.Mesh(new THREE.PlaneGeometry(0.032 * k, 0.017 * k), new THREE.MeshPhysicalMaterial({ color: '#000', transparent: true, opacity: 0.22, roughness: 0.25, clearcoat: 1, depthWrite: false }));
  smoke.rotation.x = -Math.PI / 2; smoke.position.set(-0.002 * k, 0.01115 * k, -0.002 * k);
  const leds = new THREE.Group();
  const ledCols = ['#FF006A', '#3a3a3a', '#3a3a3a', '#3a3a3a'];
  ledCols.forEach((c, i) => {
    const l = new THREE.Mesh(new THREE.CircleGeometry(0.0009 * k, 16), c === '#FF006A' ? new THREE.MeshBasicMaterial({ color: c, toneMapped: false }) : mat(c, 0.5));
    l.rotation.x = -Math.PI / 2; l.position.set((-0.0105 + i * 0.007) * k, 0.01112 * k, 0.0095 * k); leds.add(l);
  });
  // strap: silicone loop around a wrist form
  const strapMat = mat('#1b1b1b', 0.8);
  const strap = new THREE.Mesh(new THREE.TorusGeometry(0.031 * k, 0.0022 * k, 10, 64), strapMat);
  strap.scale.set(1, 1, 7); strap.rotation.y = Math.PI / 2; strap.position.y = -0.031 * k;
  const wrist = new THREE.Mesh(new THREE.CylinderGeometry(0.029 * k, 0.029 * k, 0.11 * k, 40), mat('#E9DFD8', 0.7));
  wrist.rotation.z = Math.PI / 2; wrist.position.y = -0.033 * k;
  const pod3 = new THREE.Group(); pod3.add(pod, screen, smoke, leds); pod3.position.y = -0.0035 * k;
  const unit = new THREE.Group(); unit.add(wrist, strap, pod3);
  unit.position.y = PLINTH_TOP + 0.062 * k; unit.rotation.y = -0.6;
  // small cradle so the wrist form does not roll
  const cradle = new THREE.Mesh(new THREE.BoxGeometry(0.07, 0.006, 0.05), M.steel); cradle.position.y = PLINTH_TOP + 0.003;
  dashGroup.add(unit, cradle);
  dashGroup.position.set(plinth.position.x, 0, plinth.position.z);
  station('dash', dashGroup);
}

/* 5x7 dot font (column bytes, LSB at the top) */
const F = {
  '0': [0x3E, 0x51, 0x49, 0x45, 0x3E], '1': [0x00, 0x42, 0x7F, 0x40, 0x00], '2': [0x42, 0x61, 0x51, 0x49, 0x46], '3': [0x21, 0x41, 0x45, 0x4B, 0x31],
  '4': [0x18, 0x14, 0x12, 0x7F, 0x10], '5': [0x27, 0x45, 0x45, 0x45, 0x39], '6': [0x3C, 0x4A, 0x49, 0x49, 0x30], '7': [0x01, 0x71, 0x09, 0x05, 0x03],
  '8': [0x36, 0x49, 0x49, 0x49, 0x36], '9': [0x06, 0x49, 0x49, 0x29, 0x1E], ':': [0x00, 0x36, 0x36, 0x00, 0x00], '.': [0x00, 0x60, 0x60, 0x00, 0x00],
  '-': [0x08, 0x08, 0x08, 0x08, 0x08], ' ': [0, 0, 0, 0, 0],
  A: [0x7E, 0x11, 0x11, 0x11, 0x7E], B: [0x7F, 0x49, 0x49, 0x49, 0x36], C: [0x3E, 0x41, 0x41, 0x41, 0x22], D: [0x7F, 0x41, 0x41, 0x22, 0x1C],
  E: [0x7F, 0x49, 0x49, 0x49, 0x41], F: [0x7F, 0x09, 0x09, 0x09, 0x01], G: [0x3E, 0x41, 0x49, 0x49, 0x7A], H: [0x7F, 0x08, 0x08, 0x08, 0x7F],
  I: [0x00, 0x41, 0x7F, 0x41, 0x00], J: [0x20, 0x40, 0x41, 0x3F, 0x01], K: [0x7F, 0x08, 0x14, 0x22, 0x41], L: [0x7F, 0x40, 0x40, 0x40, 0x40],
  M: [0x7F, 0x02, 0x0C, 0x02, 0x7F], N: [0x7F, 0x04, 0x08, 0x10, 0x7F], O: [0x3E, 0x41, 0x41, 0x41, 0x3E], P: [0x7F, 0x09, 0x09, 0x09, 0x06],
  Q: [0x3E, 0x41, 0x51, 0x21, 0x5E], R: [0x7F, 0x09, 0x19, 0x29, 0x46], S: [0x46, 0x49, 0x49, 0x49, 0x31], T: [0x01, 0x01, 0x7F, 0x01, 0x01],
  U: [0x3F, 0x40, 0x40, 0x40, 0x3F], V: [0x1F, 0x20, 0x40, 0x20, 0x1F], W: [0x3F, 0x40, 0x38, 0x40, 0x3F], X: [0x63, 0x14, 0x08, 0x14, 0x63],
  Y: [0x07, 0x08, 0x70, 0x08, 0x07], Z: [0x61, 0x51, 0x49, 0x45, 0x43],
};
const grid = new Uint8Array(DOTS_W * DOTS_H);
function glyph(ch, x0, y0, s = 1) {
  const cols = F[ch] || F[' '];
  for (let cx = 0; cx < 5; cx++) for (let cy = 0; cy < 7; cy++) if (cols[cx] >> cy & 1)
    for (let a = 0; a < s; a++) for (let b = 0; b < s; b++) { const x = x0 + cx * s + a, y = y0 + cy * s + b; if (x >= 0 && x < DOTS_W && y >= 0 && y < DOTS_H) grid[y * DOTS_W + x] = 1; }
}
const text = (str, x, y, s = 1) => { for (const ch of str) { glyph(ch, x, y, s); x += 6 * s; } return x; };
const TRACK = 'WE ARE THE MUSIC MAKERS - APHEX TWIN   ';
const t0 = performance.now();
function istTime() {
  const p = new Intl.DateTimeFormat('en-GB', { hour: '2-digit', minute: '2-digit', hour12: false, timeZone: 'Asia/Kolkata' }).formatToParts(new Date());
  return p.find((x) => x.type === 'hour').value + ':' + p.find((x) => x.type === 'minute').value;
}
let lastFrame = -1;
function drawDash(now) {
  const f = reduce ? 0 : Math.floor((now - t0) / 110);
  if (f === lastFrame) return false; lastFrame = f;
  grid.fill(0);
  // scrolling track name, top row
  const w = TRACK.length * 6, off = f % w;
  text(TRACK + TRACK, -off, 1);
  // time in India, big
  const tm = istTime();
  text(tm, Math.round((DOTS_W - (tm.length * 12 - 2)) / 2), 11, 2);
  // track progress bar along the foot
  const prog = ((now - t0) / 1000 / 222) % 1;
  for (let x = 2; x < 2 + Math.round(prog * 60); x++) grid[29 * DOTS_W + x] = 1;
  const c = dashCanvas.getContext('2d');
  c.fillStyle = '#050505'; c.fillRect(0, 0, dashCanvas.width, dashCanvas.height);
  for (let y = 0; y < DOTS_H; y++) for (let x = 0; x < DOTS_W; x++) {
    c.fillStyle = grid[y * DOTS_W + x] ? '#FFF4EC' : '#151313';
    c.beginPath(); c.arc(x * CELL + CELL / 2, y * CELL + CELL / 2, CELL * 0.38, 0, Math.PI * 2); c.fill();
  }
  dashTex.needsUpdate = true;
  return true;
}
drawDash(performance.now());

/* ---------- framing ---------- */
// Every view is fitted, not hand-placed: the camera backs off along a chosen direction until the
// objects fit the free part of the screen (clear of the title, the dock and the project panel),
// then the image is shifted with a view offset so they sit in the middle of that free part.
const tmpCam = new THREE.PerspectiveCamera();
const corners = (b) => { const o = []; for (const x of [b.min.x, b.max.x]) for (const y of [b.min.y, b.max.y]) for (const z of [b.min.z, b.max.z]) o.push(new THREE.Vector3(x, y, z)); return o; };
function region(kind) {
  const w = innerWidth, h = innerHeight, ph = phone();
  const px = (v) => (v / w) * 2, py = (v) => (v / h) * 2;
  const intro = document.querySelector('.intro').getBoundingClientRect();
  if (kind === 'home') {
    const top = ph ? 1 - py(intro.bottom + 64) : 1 - py(150);
    return { x0: ph ? -1.14 : -1 + px(40), x1: ph ? 1.14 : 1 - px(40), y0: -1 + py(96), y1: top };
  }
  if (ph) { const sh = Math.min(h * 0.58, 560); return { x0: -0.9, x1: 0.9, y0: -1 + py(sh + 24), y1: 1 - py(24) }; }
  const pw = Math.min(420, w * 0.34);
  return { x0: -1 + px(48), x1: 1 - px(pw + 48), y0: -1 + py(56), y1: 1 - py(56) };
}
function fit(points, target, dir, fov, reg) {
  const w = innerWidth, h = innerHeight;
  tmpCam.fov = fov; tmpCam.aspect = w / h; tmpCam.near = 0.01; tmpCam.far = 100; tmpCam.clearViewOffset(); tmpCam.updateProjectionMatrix();
  const rw = reg.x1 - reg.x0, rh = reg.y1 - reg.y0;
  let d = 0.08, ext = null;
  for (let i = 0; i < 160; i++, d *= 1.035) {
    tmpCam.position.copy(target).addScaledVector(dir, d); tmpCam.lookAt(target); tmpCam.updateMatrixWorld();
    let x0 = 9, x1 = -9, y0 = 9, y1 = -9, behind = false;
    for (const p of points) { const v = p.clone().project(tmpCam); if (v.z > 1) { behind = true; break; } x0 = Math.min(x0, v.x); x1 = Math.max(x1, v.x); y0 = Math.min(y0, v.y); y1 = Math.max(y1, v.y); }
    ext = { x0, x1, y0, y1 };
    if (!behind && x1 - x0 <= rw && y1 - y0 <= rh) break;
  }
  const cx = (ext.x0 + ext.x1) / 2, cy = (ext.y0 + ext.y1) / 2, rcx = (reg.x0 + reg.x1) / 2, rcy = (reg.y0 + reg.y1) / 2;
  return { pos: target.clone().addScaledVector(dir, d), target: target.clone(), fov, ox: (cx - rcx) * w / 2, oy: (rcy - cy) * h / 2, dist: d };
}
const HOME = { pos: new THREE.Vector3(2.75, 1.85, 3.35), target: new THREE.Vector3(0.05, 0.92, -0.9), fov: 34, ox: 0, oy: 0 };
const fovFor = () => (innerHeight > innerWidth ? 46 : 34);
function homeView() {
  const ids = Object.keys(stations); if (!ids.length) return HOME;
  const pts = [];
  const all = new THREE.Box3();
  for (const id of ids) { const b = bbox(stations[id].group); all.union(b); pts.push(...corners(b)); if (stations[id].tagAt) pts.push(stations[id].tagAt.clone().add(new THREE.Vector3(0, 0.12, 0))); }
  for (const o of (phone() ? [plinth] : [plinth, badge, ogPrint, cxPrint])) { const b = bbox(o); all.union(b); pts.push(...corners(b)); }
  const target = all.getCenter(new THREE.Vector3());
  const dir = phone() ? new THREE.Vector3(0.62, 1.05, 1).normalize() : new THREE.Vector3(0.62, 0.3, 1).normalize();
  Object.assign(HOME, fit(pts, target, dir, fovFor(), region('home')));
  return HOME;
}
function focusFor(id) {
  const st = stations[id]; if (!st) return null;
  let b = bbox(st.group);
  let dir = new THREE.Vector3(0.62, 0.3, 1).normalize();
  if (id === 'dash') { const c = new THREE.Vector3(plinth.position.x, PLINTH_TOP + 0.06, plinth.position.z); b = new THREE.Box3().setFromCenterAndSize(c, new THREE.Vector3(0.075, 0.07, 0.075)); dir.set(0.35, 0.95, 0.75).normalize(); }
  if (id === 'cortx') dir.set(0.12, 0.45, 1).normalize();
  if (id === 'overgrwth') dir.set(1, 0.3, 0.42).normalize();
  const f = fit(corners(b), b.getCenter(new THREE.Vector3()), dir, fovFor(), region('focus'));
  f.minD = f.dist * 0.4; f.maxD = f.dist * 1.6;
  return f;
}
function layout() {
  for (const id in stations) {
    const b = bbox(stations[id].group);
    const at = new THREE.Vector3((b.min.x + b.max.x) / 2, b.max.y + 0.08, (b.min.z + b.max.z) / 2);
    if (id === 'dash') at.y = PLINTH_TOP + 0.16;
    if (id === 'cortx') at.y = Math.max(at.y, 1.12);
    stations[id].tagAt = at;
  }
  if (!current) { homeView(); limitsHome(); if (!tween) jump(HOME); }
  wake();
}

/* ---------- camera moves ---------- */
let tween = null;
const view = { ox: 0, oy: 0 };
const ease = (t) => 1 - Math.pow(1 - t, 4);
function applyView() {
  const w = innerWidth, h = innerHeight;
  if (Math.abs(view.ox) > 0.5 || Math.abs(view.oy) > 0.5) camera.setViewOffset(w, h, view.ox, view.oy, w, h); else camera.clearViewOffset();
  camera.updateProjectionMatrix();
}
function jump(v) { camera.position.copy(v.pos); controls.target.copy(v.target); camera.fov = v.fov; view.ox = v.ox; view.oy = v.oy; applyView(); wake(2); }
function fly(to, ms = 1100) {
  if (reduce) { jump(to); return; }
  const from = { pos: camera.position.clone(), target: controls.target.clone(), fov: camera.fov, ox: view.ox, oy: view.oy };
  tween = { from, to, t0: performance.now(), ms };
  wake(2);
}
function limitsHome() {
  const sph = new THREE.Spherical().setFromVector3(new THREE.Vector3().subVectors(HOME.pos, HOME.target));
  controls.minAzimuthAngle = sph.theta - 0.3; controls.maxAzimuthAngle = sph.theta + 0.2;
  controls.minPolarAngle = Math.max(0.5, sph.phi - 0.18); controls.maxPolarAngle = Math.min(1.42, sph.phi + 0.12);
  controls.enableZoom = false;
}
function limitsFocus(f) {
  const sph = new THREE.Spherical().setFromVector3(new THREE.Vector3().subVectors(f.pos, f.target));
  controls.minAzimuthAngle = sph.theta - 0.9; controls.maxAzimuthAngle = sph.theta + 0.9;
  controls.minPolarAngle = 0.15; controls.maxPolarAngle = 1.45;
  controls.enableZoom = true; controls.minDistance = f.minD; controls.maxDistance = f.maxD;
}

/* ---------- focus a project ---------- */
let current = null;
const $ = (id) => document.getElementById(id);
function openProject(id, push = true) {
  const p = PROJECTS[id]; if (!p) return;
  const f = focusFor(id);
  if (!f) { say('Still bringing ' + p.title + ' into the room.'); setTimeout(() => say(''), 1800); return; }
  current = id;
  $('p-title').textContent = p.title;
  $('p-lede').textContent = p.lede;
  const img = $('p-img');
  if (p.img) { img.src = A + p.img; img.alt = p.cap; img.parentElement.hidden = false; $('p-cap').textContent = p.cap; }
  else img.parentElement.hidden = true;
  $('p-meta').innerHTML = p.meta.map(([k, v]) => `<dt>${k}</dt><dd>${v}</dd>`).join('');
  const open = $('p-open');
  open.href = p.href; open.textContent = p.open;
  $('p-hint').textContent = (p.model ? p.model + ' ' : '') + (p.soon ? p.soon + '. ' : '') + 'Drag to turn it, pinch or scroll to get closer.';
  panel.classList.add('on'); document.body.classList.add('focused');
  document.querySelectorAll('.dock [data-go]').forEach((b) => b.setAttribute('aria-current', b.dataset.go === id));
  limitsFocus(f);
  fly(f);
  if (push && location.hash !== '#' + id) history.pushState(null, '', '#' + id);
  setTimeout(() => panel.focus({ preventScroll: true }), reduce ? 0 : 450);
}
function closeProject(push = true) {
  if (!current) return;
  const was = current; current = null;
  panel.classList.remove('on'); document.body.classList.remove('focused');
  document.querySelectorAll('.dock [data-go]').forEach((b) => b.removeAttribute('aria-current'));
  homeView(); limitsHome();
  fly(HOME);
  if (push && location.hash) history.pushState(null, '', location.pathname + location.search);
  const t = tags.find((x) => x.dataset.id === was); t && t.focus({ preventScroll: true });
}
$('p-back').addEventListener('click', () => closeProject());
addEventListener('keydown', (e) => { if (e.key === 'Escape') closeProject(); });
addEventListener('popstate', () => { const id = location.hash.slice(1); if (PROJECTS[id]) openProject(id, false); else closeProject(false); });
tags.forEach((t) => t.addEventListener('click', () => openProject(t.dataset.id)));
document.querySelectorAll('.dock [data-go]').forEach((b) => b.addEventListener('click', () => openProject(b.dataset.go)));

/* ---------- pointer picking ---------- */
const ray = new THREE.Raycaster(), ndc = new THREE.Vector2();
let hot = null, downAt = null;
function pick(e) {
  const r = renderer.domElement.getBoundingClientRect();
  ndc.set(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1);
  ray.setFromCamera(ndc, camera);
  const hit = ray.intersectObjects(pickables, false)[0];
  return hit ? hit.object.userData.station : null;
}
function setHot(id) {
  if (hot === id) return; hot = id;
  tags.forEach((t) => t.classList.toggle('hot', t.dataset.id === id));
  renderer.domElement.style.cursor = id ? 'pointer' : '';
  wake();
}
renderer.domElement.addEventListener('pointermove', (e) => { if (e.pointerType === 'mouse' && !current) setHot(pick(e)); });
renderer.domElement.addEventListener('pointerdown', (e) => { downAt = [e.clientX, e.clientY]; });
renderer.domElement.addEventListener('pointerup', (e) => {
  if (!downAt) return;
  const moved = Math.hypot(e.clientX - downAt[0], e.clientY - downAt[1]); downAt = null;
  if (moved > 6) return; // that was a drag
  const id = pick(e);
  if (id && id !== current) openProject(id);
});

/* ---------- tags follow their objects ---------- */
const v3 = new THREE.Vector3();
function placeTags() {
  const w = innerWidth, h = innerHeight;
  for (const t of tags) {
    const st = stations[t.dataset.id];
    if (!st || !st.tagAt) { t.style.visibility = 'hidden'; continue; }
    v3.copy(st.tagAt).project(camera);
    const half = t.offsetWidth / 2 + 8;
    const x = Math.min(w - half, Math.max(half, (v3.x * 0.5 + 0.5) * w)), y = (-v3.y * 0.5 + 0.5) * h - 18;
    const off = v3.z > 1 || y < 0 || y > h;
    t.style.visibility = off ? 'hidden' : 'visible';
    t.style.transform = `translate(${x.toFixed(1)}px,${y.toFixed(1)}px) translate(-50%,-100%)`;
  }
}

/* ---------- loop ---------- */
function frame(now) {
  requestAnimationFrame(frame);
  if (tween) {
    const k = Math.min(1, (now - tween.t0) / tween.ms), e = ease(k), f = tween.from, t = tween.to;
    camera.position.lerpVectors(f.pos, t.pos, e);
    controls.target.lerpVectors(f.target, t.target, e);
    camera.fov = THREE.MathUtils.lerp(f.fov, t.fov, e);
    view.ox = THREE.MathUtils.lerp(f.ox, t.ox, e);
    view.oy = THREE.MathUtils.lerp(f.oy, t.oy, e);
    applyView();
    if (k >= 1) tween = null;
    wake(2);
  }
  if (controls.update()) wake(1);
  if (drawDash(now)) wake(1);
  if (dirty > 0) { dirty--; renderer.render(scene, camera); placeTags(); }
}

/* ---------- start ---------- */
limitsHome(); jump(HOME);
manager.onLoad = () => {
  hold.progress(1); hold.done();
  document.body.classList.add('ready');
  layout();
  const id = location.hash.slice(1);
  if (PROJECTS[id]) setTimeout(() => openProject(id, false), 300);
};
manager.onError = () => { say('One model did not load. The rest of the room still works.'); };
addEventListener('resize', () => {
  renderer.setPixelRatio(DPR()); renderer.setSize(innerWidth, innerHeight);
  camera.aspect = innerWidth / innerHeight;
  tween = null;
  if (current) { const f = focusFor(current); if (f) { limitsFocus(f); jump(f); } }
  else { homeView(); limitsHome(); jump(HOME); }
});
requestAnimationFrame(frame);
window.__room = { scene, camera, controls, stations, openProject, closeProject, wake };
