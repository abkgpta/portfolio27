// CortX "How it senses": a 3D brain inside the headset, explaining EEG, fNIRS and IMU.
// Mount with mountCxBrain(el). Units are mm, Y up, +Z is the front of the head (same frame as the headset CAD).
// The brain is generated here (no download). The headset ghost is a slimmed copy of cortx_headset.glb.
// Electrode positions are the electrode centres from that CAD. fNIRS and IMU placement are design intent.
import * as THREE from 'three';
import {GLTFLoader} from 'three/addons/loaders/GLTFLoader.js';
import {MeshoptDecoder} from 'three/addons/libs/meshopt_decoder.module.js';
import {mergeVertices} from 'three/addons/utils/BufferGeometryUtils.js';

const BASE = new URL('./', import.meta.url).href;
const C = new THREE.Vector3(0, 90, -6);       // brain centre in headset space
const NECK = new THREE.Vector3(0, 0, -18);     // head turns about here
const COL = {eeg: '#9101B1', fnirs: '#0098F6', imu: '#AEC959', fat: '#F46C02'};
const GLOW = {eeg: new THREE.Color('#C25CFF'), fnirs: new THREE.Color('#3DB4FF'), imu: new THREE.Color('#CFE68A'), hbr: new THREE.Color('#7E5BFF')};

/* ---------- sensors (headset space, mm) ---------- */
// [name, x, y, z, region]  x > 0 is the wearer's left
const ELECTRODES = [
  ['Fp1', 27.5, 77.8, 80.1, 'Prefrontal, left'], ['Fp2', -27.5, 77.8, 80.1, 'Prefrontal, right'],
  ['F7', 56.7, 65.4, 24.4, 'Frontal, left side'], ['F8', -56.7, 65.4, 24.4, 'Frontal, right side'],
  ['F3', 32.5, 115.9, 59.3, 'Frontal, left'], ['F4', -32.5, 115.9, 59.3, 'Frontal, right'], ['Fz', 0, 127.7, 58.5, 'Frontal, midline'],
  ['C3', 49.6, 125.7, 6.3, 'Motor strip, left'], ['C4', -49.6, 125.7, 6.3, 'Motor strip, right'], ['Cz', 0, 147.2, 2.4, 'Motor strip, top'],
  ['T7', 66.6, 87.5, -20.9, 'Temporal, left'], ['T8', -66.6, 87.5, -20.9, 'Temporal, right'],
  ['P7', 64.5, 47.2, -44.9, 'Temporal-parietal, left'], ['P8', -64.5, 47.2, -44.9, 'Temporal-parietal, right'],
  ['P3', 39.7, 122.2, -59.5, 'Parietal, left'], ['P4', -39.7, 122.2, -59.5, 'Parietal, right'], ['Pz', 0, 138.9, -55.0, 'Parietal, midline'],
  ['PO7', 50.8, 83.5, -75.2, 'Parietal-occipital, left'], ['PO8', -50.8, 83.5, -75.2, 'Parietal-occipital, right'],
  ['O1', 29.9, 44.5, -88.5, 'Occipital, left'], ['O2', -29.9, 44.5, -88.5, 'Occipital, right'],
];
const OPT_S = [[17, 99, 80], [-17, 99, 80]];
const OPT_D = [[0, 112, 75], [44, 97, 70], [-44, 97, 70]];
const PAIRS = [[0, 0], [0, 1], [1, 0], [1, 2]];
const IMU = [0, 110, -97];

/* ---------- copy ---------- */
const MODES = {
  eeg: {c: COL.eeg, ink: '#fff', where: '21 dry electrodes · crown to neck',
    steps: [
      ['Neurons fire together', 'When thousands of neurons in the cortex fire in step, they make a tiny electrical field.'],
      ['The field reaches the scalp', 'It passes through skull and skin and arrives a few millionths of a volt strong.'],
      ['Dry electrodes read it', 'The back unit amplifies it and splits it into rhythms: theta, alpha and beta.']],
    take: 'For the coach: how alert or drowsy each player is.'},
  fnirs: {c: COL.fnirs, ink: '#fff', where: 'Forehead pad · over the prefrontal cortex',
    steps: [
      ['Light goes in', 'A source on the forehead shines harmless near-infrared light through skin and skull.'],
      ['Blood soaks some up', 'Oxygen-rich and oxygen-poor blood absorb it differently. A working brain area pulls in oxygen-rich blood.'],
      ['A detector reads what’s left', 'About 3 cm away, a detector catches the light that comes back. The change shows how hard the prefrontal cortex is working.']],
    take: 'For the coach: how much mental load a drill puts on a player.'},
  imu: {c: COL.imu, ink: '#0D031E', where: 'Rear of the shell · above the Boa dial',
    steps: [
      ['Tracks every turn', 'An accelerometer and gyroscope measure how the head moves and turns, hundreds of times a second.'],
      ['Cleans the brain signals', 'Movement shows up as noise in EEG and fNIRS. The IMU tells the back unit which wobbles to remove.'],
      ['Counts scans and knocks', 'On its own it counts how often a player looks around before the ball arrives, and flags hard knocks to the head.']],
    take: 'For the coach: brain data that stays honest in real play, plus scanning.'},
  all: {c: '#F4F2F8', ink: '#0D031E', where: 'Headset + back unit · every second',
    steps: [
      ['One timeline', 'All three line up to the same moment, with heart rate and position from the back unit.'],
      ['Fused on the back unit', 'It filters noise, removes movement and compares each player with their own baseline.'],
      ['Three numbers for the coach', 'Focus, load and fatigue per player, live on the pitch-side tablet.']],
    take: 'CortX assists the coach’s judgement. It never overrides it.'},
};

/* ---------- noise (3D simplex) ---------- */
function simplex(seed) {
  const g = [1,1,0,-1,1,0,1,-1,0,-1,-1,0,1,0,1,-1,0,1,1,0,-1,-1,0,-1,0,1,1,0,-1,1,0,1,-1,0,-1,-1];
  const p = new Uint8Array(256); for (let i = 0; i < 256; i++) p[i] = i;
  let s = seed >>> 0; const rnd = () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296);
  for (let i = 255; i > 0; i--) { const j = Math.floor(rnd() * (i + 1)); [p[i], p[j]] = [p[j], p[i]]; }
  const perm = new Uint8Array(512), pm = new Uint8Array(512);
  for (let i = 0; i < 512; i++) { perm[i] = p[i & 255]; pm[i] = perm[i] % 12; }
  const F = 1 / 3, G = 1 / 6;
  return (x, y, z) => {
    const s0 = (x + y + z) * F, i = Math.floor(x + s0), j = Math.floor(y + s0), k = Math.floor(z + s0);
    const t = (i + j + k) * G, x0 = x - i + t, y0 = y - j + t, z0 = z - k + t;
    let i1, j1, k1, i2, j2, k2;
    if (x0 >= y0) { if (y0 >= z0) { i1=1;j1=0;k1=0;i2=1;j2=1;k2=0; } else if (x0 >= z0) { i1=1;j1=0;k1=0;i2=1;j2=0;k2=1; } else { i1=0;j1=0;k1=1;i2=1;j2=0;k2=1; } }
    else { if (y0 < z0) { i1=0;j1=0;k1=1;i2=0;j2=1;k2=1; } else if (x0 < z0) { i1=0;j1=1;k1=0;i2=0;j2=1;k2=1; } else { i1=0;j1=1;k1=0;i2=1;j2=1;k2=0; } }
    const x1 = x0 - i1 + G, y1 = y0 - j1 + G, z1 = z0 - k1 + G, x2 = x0 - i2 + 2 * G, y2 = y0 - j2 + 2 * G, z2 = z0 - k2 + 2 * G, x3 = x0 - 1 + 3 * G, y3 = y0 - 1 + 3 * G, z3 = z0 - 1 + 3 * G;
    const ii = i & 255, jj = j & 255, kk = k & 255;
    const c = (tx, ty, tz, gi) => { let q = 0.6 - tx * tx - ty * ty - tz * tz; if (q < 0) return 0; q *= q; gi *= 3; return q * q * (g[gi] * tx + g[gi + 1] * ty + g[gi + 2] * tz); };
    return 32 * (c(x0, y0, z0, pm[ii + perm[jj + perm[kk]]]) + c(x1, y1, z1, pm[ii + i1 + perm[jj + j1 + perm[kk + k1]]]) +
      c(x2, y2, z2, pm[ii + i2 + perm[jj + j2 + perm[kk + k2]]]) + c(x3, y3, z3, pm[ii + 1 + perm[jj + 1 + perm[kk + 1]]]));
  };
}
const sstep = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };

/* ---------- brain geometry ---------- */
const N3 = simplex(27);
function gyri(x, y, z, f) {
  const q = f;
  const wx = N3(x * q * .8 + 11, y * q * .8, z * q * .8), wy = N3(x * q * .8, y * q * .8 + 37, z * q * .8), wz = N3(x * q * .8, y * q * .8, z * q * .8 + 71);
  return N3((x + wx * 7) * q, (y + wy * 7) * q, (z + wz * 7) * q);
}
function displaceAlongNormals(g, fn) {
  g.computeVertexNormals();
  const P = g.attributes.position, Nn = g.attributes.normal, n = P.count, cav = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    const r = fn(P.getX(i), P.getY(i), P.getZ(i), i); cav[i] = r[1];
    P.setXYZ(i, P.getX(i) + Nn.getX(i) * r[0], P.getY(i) + Nn.getY(i) * r[0], P.getZ(i) + Nn.getZ(i) * r[0]);
  }
  g.computeVertexNormals();
  return cav;
}
function colorise(g, cav, light, dark) {
  const n = g.attributes.position.count, a = new Float32Array(n * 3), c = new THREE.Color();
  for (let i = 0; i < n; i++) { c.copy(light).lerp(dark, Math.pow(cav[i], .8)); a.set([c.r, c.g, c.b], i * 3); }
  g.setAttribute('color', new THREE.BufferAttribute(a, 3));
}
function ico(detail) { let g = new THREE.IcosahedronGeometry(1, detail); g.deleteAttribute('normal'); g.deleteAttribute('uv'); return mergeVertices(g); }

function hemisphere(side) {
  const g = ico(54), P = g.attributes.position, n = P.count, unit = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) {
    const x = P.getX(i), y = P.getY(i), z = P.getZ(i); unit.set([x, y, z], i * 3);
    let lx = x * side; const med = lx < 0; if (med) lx *= .3;
    let X = lx * 36 * (1 - .2 * z * z), Y = y * (y > 0 ? 44 : 30), Z = z * 70;
    Y -= 7 * Math.max(0, z) * Math.max(0, z) * (y > 0 ? 1 : 0);                    // frontal lobe slopes down
    if (y < 0 && z > .3) Y *= 1 - .55 * (z - .3);                                   // flat orbital floor
    const tm = Math.exp(-Math.pow((z - .08) / .34, 2)) * sstep(.05, -.55, y) * sstep(-.1, .5, x * side);
    X += 6 * tm; Y -= 13 * tm; Z += 4 * tm;                                          // temporal lobe
    P.setXYZ(i, side * (13 + X), Y, Z);
  }
  const cav = displaceAlongNormals(g, (px, py, pz, i) => {
    const x = unit[i * 3], y = unit[i * 3 + 1], z = unit[i * 3 + 2], lat = x * side;
    const a = Math.abs(gyri(px, py, pz, .058));
    const sul = 1 - sstep(.0, .2, a), bulge = sstep(.2, .6, a);
    const syl = Math.exp(-Math.pow((y - (-.22 + (.38 - z) * .62)) / .05, 2)) * sstep(-.38, -.2, z) * sstep(.48, .3, z) * sstep(.2, .5, lat);
    const cen = Math.exp(-Math.pow((z - (-.06 + (1 - y) * .2)) / .035, 2)) * sstep(.0, .15, y) * sstep(-.25, .0, lat);
    const medial = lat < -.15 ? .35 : 1;
    const d = (2.4 * sul - .5 * bulge) * medial + 5 * syl + 3.2 * cen;
    return [-d, Math.min(1, Math.max(0, (2.4 * sul * medial + 4 * syl + 3 * cen) / 2.6))];
  });
  colorise(g, cav, new THREE.Color('#E3D9EE'), new THREE.Color('#4A3868'));
  return g;
}
function cerebellum() {
  const g = ico(30), P = g.attributes.position;
  for (let i = 0; i < P.count; i++) { const x = P.getX(i), y = P.getY(i), z = P.getZ(i); P.setXYZ(i, x * 42 * (1 - .15 * Math.abs(y)), -29 + y * 16, -44 + z * 24 - Math.abs(x) * 3); }
  const cav = displaceAlongNormals(g, (x, y, z) => {
    const f = Math.abs(Math.sin((y + z * .35) * .95 + N3(x * .05, y * .05, z * .05) * 2.2));
    const s = 1 - sstep(0, .35, f), v = Math.exp(-x * x / 30) * .8;
    return [-(1.3 * s + v * 2), Math.min(1, s * .9 + v * .5)];
  });
  colorise(g, cav, new THREE.Color('#D5C8E3'), new THREE.Color('#3F2F5C'));
  return g;
}
function brainstem() {
  const g = new THREE.CylinderGeometry(9, 6, 40, 32, 8);
  g.rotateX(-.32); g.translate(0, -44, -22);
  const n = g.attributes.position.count, cav = new Float32Array(n).fill(.45); g.computeVertexNormals();
  colorise(g, cav, new THREE.Color('#D9CDE6'), new THREE.Color('#3F2F5C'));
  return g;
}

/* ---------- materials ---------- */
const HMAX = 14;
function brainMaterial(U) {
  const m = new THREE.MeshStandardMaterial({vertexColors: true, roughness: .62, metalness: 0});
  m.onBeforeCompile = sh => {
    Object.assign(sh.uniforms, U);
    sh.vertexShader = 'varying vec3 vP;\n' + sh.vertexShader.replace('#include <begin_vertex>', '#include <begin_vertex>\nvP = position;');
    sh.fragmentShader = `varying vec3 vP;\nuniform vec4 uH[${HMAX}];\nuniform vec3 uHC[${HMAX}];\nuniform float uRim;\n` +
      sh.fragmentShader.replace('#include <emissivemap_fragment>', `#include <emissivemap_fragment>
      vec3 act = vec3(0.);
      for (int i = 0; i < ${HMAX}; i++) {
        float s = uH[i].w; if (s <= 0.) continue;
        float d = distance(vP, uH[i].xyz); float r = 7. + 7. * s;
        act += uHC[i] * s * (exp(-d * d / (r * r)) * 1.6 + exp(-pow((d - r * 1.6) / 1.6, 2.)) * .35);
      }
      float fr = pow(1. - abs(dot(normal, normalize(vViewPosition))), 3.);
      totalEmissiveRadiance += act + vec3(.36, .22, .62) * fr * uRim;`);
  };
  return m;
}
function ghostMaterial(color, alpha) {
  return new THREE.ShaderMaterial({
    uniforms: {uC: {value: new THREE.Color(color)}, uA: {value: alpha}, uVis: {value: 1}},
    vertexShader: 'varying vec3 vN; varying vec3 vV; void main(){ vN = normalize(normalMatrix * normal); vec4 mv = modelViewMatrix * vec4(position, 1.); vV = -mv.xyz; gl_Position = projectionMatrix * mv; }',
    fragmentShader: 'uniform vec3 uC; uniform float uA; uniform float uVis; varying vec3 vN; varying vec3 vV; void main(){ float f = pow(1. - abs(dot(normalize(vN), normalize(vV))), 2.2); gl_FragColor = vec4(uC, uVis * uA * (.12 + .88 * f)); }',
    transparent: true, depthWrite: false, side: THREE.DoubleSide,
  });
}
function pointsMaterial() {
  return new THREE.ShaderMaterial({
    uniforms: {uScale: {value: 600}},
    vertexShader: 'attribute float aS; attribute float aA; attribute vec3 aC; varying vec3 vC; varying float vA; uniform float uScale; void main(){ vC = aC; vA = aA; vec4 mv = modelViewMatrix * vec4(position, 1.); gl_PointSize = aS * uScale / -mv.z; gl_Position = projectionMatrix * mv; }',
    fragmentShader: 'varying vec3 vC; varying float vA; void main(){ float d = length(gl_PointCoord - .5) * 2.; float a = exp(-d * d * 4.) * (1. - smoothstep(.8, 1., d)); gl_FragColor = vec4(vC, a * vA); }',
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
  });
}
function pointCloud(n) {
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(n * 3), 3));
  g.setAttribute('aC', new THREE.BufferAttribute(new Float32Array(n * 3), 3));
  g.setAttribute('aA', new THREE.BufferAttribute(new Float32Array(n), 1));
  g.setAttribute('aS', new THREE.BufferAttribute(new Float32Array(n), 1));
  const p = new THREE.Points(g, pointsMaterial()); p.frustumCulled = false; return p;
}

/* ---------- mount ---------- */
export function mountCxBrain(root, opts = {}) {
  const stage = root.querySelector('.cb-stage'), canvas = root.querySelector('.cb-gl');
  const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
  let renderer;
  try { renderer = new THREE.WebGLRenderer({canvas, antialias: true, alpha: true, powerPreference: 'high-performance'}); }
  catch (e) { root.classList.add('cb-nogl'); throw e; }
  renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
  renderer.toneMapping = THREE.ACESFilmicToneMapping; renderer.toneMappingExposure = 1.05;

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(28, 1, 10, 3000);
  scene.add(new THREE.HemisphereLight('#EDE6FF', '#1A0B33', 1.1));
  const key = new THREE.DirectionalLight('#FFFFFF', 2.1); key.position.set(-260, 420, 380); scene.add(key);
  const rim = new THREE.DirectionalLight('#8C6BFF', 2.4); rim.position.set(300, 120, -420); scene.add(rim);
  const fill = new THREE.DirectionalLight('#FFD9E8', .5); fill.position.set(380, -120, 200); scene.add(fill);

  // rig (user turn, pivot = brain centre) > neck (IMU motion) > world (headset space)
  const rig = new THREE.Group(), neck = new THREE.Group(), world = new THREE.Group();
  scene.add(rig); rig.add(neck); neck.add(world);
  neck.position.copy(NECK).sub(C); world.position.copy(NECK).multiplyScalar(-1);

  // brain
  const U = {uH: {value: Array.from({length: HMAX}, () => new THREE.Vector4())}, uHC: {value: Array.from({length: HMAX}, () => new THREE.Color(0, 0, 0))}, uRim: {value: 1}};
  const bmat = brainMaterial(U);
  const brain = new THREE.Group(); brain.position.copy(C); world.add(brain);
  const hemis = [hemisphere(1), hemisphere(-1)];
  for (const g of [...hemis, cerebellum(), brainstem()]) brain.add(new THREE.Mesh(g, bmat));
  // surface samples for hotspots (outer cortex only)
  const surf = [];
  for (const g of hemis) {
    const P = g.attributes.position, Nn = g.attributes.normal;
    for (let i = 0; i < P.count; i += 3) {
      const x = P.getX(i), y = P.getY(i), z = P.getZ(i), nx = Nn.getX(i), ny = Nn.getY(i), nz = Nn.getZ(i);
      if (Math.abs(x) < 9 || y < -14) continue;
      if (nx * Math.sign(x) < -.2) continue;
      surf.push(new THREE.Vector3(x, y, z), new THREE.Vector3(nx, ny, nz));
    }
  }
  const nearestSurf = v => { let b = 0, bd = 1e9; for (let i = 0; i < surf.length; i += 2) { const d = surf[i].distanceToSquared(v); if (d < bd) { bd = d; b = i; } } return b; };

  // sensors
  const sensors = new THREE.Group(); world.add(sensors);
  const metal = new THREE.MeshStandardMaterial({color: '#D8D5E0', metalness: .35, roughness: .35, emissive: new THREE.Color('#5E566E')});
  const dark = new THREE.MeshStandardMaterial({color: '#5A5070', metalness: .2, roughness: .45, emissive: new THREE.Color('#2A2238')});
  const eHit = [], ePos = ELECTRODES.map(e => new THREE.Vector3(e[1], e[2], e[3]));
  const discGeo = new THREE.CylinderGeometry(4.6, 4.6, 2.6, 24), hitGeo = new THREE.SphereGeometry(8, 8, 6);
  const up = new THREE.Vector3(0, 1, 0);
  ePos.forEach((p, i) => {
    const m = new THREE.Mesh(discGeo, metal); m.position.copy(p);
    m.quaternion.setFromUnitVectors(up, p.clone().sub(C).normalize()); sensors.add(m);
    const h = new THREE.Mesh(hitGeo, new THREE.MeshBasicMaterial({visible: false})); h.position.copy(p); h.userData.i = i; sensors.add(h); eHit.push(h);
  });
  const sPos = OPT_S.map(a => new THREE.Vector3(...a)), dPos = OPT_D.map(a => new THREE.Vector3(...a));
  const optGeo = new THREE.CylinderGeometry(4, 4, 4, 20);
  const optMeshes = [];
  [...sPos, ...dPos].forEach((p, i) => { const m = new THREE.Mesh(optGeo, i < sPos.length ? metal : dark); m.position.copy(p); m.quaternion.setFromUnitVectors(up, p.clone().sub(C).normalize()); sensors.add(m); optMeshes.push(m); });
  const imuPos = new THREE.Vector3(...IMU);
  const chip = new THREE.Mesh(new THREE.BoxGeometry(12, 3, 12), new THREE.MeshStandardMaterial({color: '#1E1830', roughness: .4, metalness: .3, emissive: new THREE.Color(COL.imu), emissiveIntensity: 0}));
  chip.position.copy(imuPos); chip.quaternion.setFromUnitVectors(up, imuPos.clone().sub(C).normalize()); sensors.add(chip);
  const axes = new THREE.Group(); axes.position.copy(imuPos); sensors.add(axes);
  [['#AEC959', [1, 0, 0]], ['#D6EBA0', [0, 1, 0]], ['#7E9A30', [0, 0, -1]]].forEach(([c, d]) => {
    const a = new THREE.ArrowHelper(new THREE.Vector3(...d), new THREE.Vector3(), 34, c, 8, 5); a.line.material.transparent = a.cone.material.transparent = true; axes.add(a);
  });
  axes.visible = false;

  // headset ghost
  const ghost = new THREE.Group(); world.add(ghost);
  const gShell = ghostMaterial('#E9E6F2', .34), gLiner = ghostMaterial('#7B62D8', .26);
  new GLTFLoader().setMeshoptDecoder(MeshoptDecoder).load(BASE + 'cx-headset-ghost.glb', gl => {
    gl.scene.scale.setScalar(1000);
    gl.scene.traverse(o => { if (!o.isMesh) return; const nm = (o.material && o.material.name) || '';
      if (nm === 'electrodes') { o.visible = false; return; }
      o.material = nm === 'liner' ? gLiner : gShell; o.renderOrder = 2; });
    ghost.add(gl.scene);
  }, undefined, e => console.warn('CortX headset ghost unavailable', e));

  // glows (sensor halos) and particles
  const halos = pointCloud(ePos.length + sPos.length + dPos.length + 2); sensors.add(halos);
  const hp = halos.geometry.attributes.position;
  [...ePos, ...sPos, ...dPos, imuPos, imuPos].forEach((p, i) => hp.setXYZ(i, p.x, p.y, p.z));
  const eGlow = new Float32Array(ePos.length), dGlow = new Float32Array(dPos.length);
  const NP = 700, parts = pointCloud(NP); world.add(parts);
  const pool = Array.from({length: NP}, () => ({on: false, a: new THREE.Vector3(), b: new THREE.Vector3(), c: new THREE.Vector3(), t: 0, d: 1, col: GLOW.eeg, s: 3, fade: 0, hit: -1, kind: 0}));
  let pNext = 0;
  function emit(a, b, c, dur, col, s, hit = -1, kind = 0, fade = 0) {
    for (let k = 0; k < NP; k++) { const p = pool[(pNext + k) % NP]; if (p.on) continue; pNext = (pNext + k + 1) % NP;
      p.on = true; p.a.copy(a); p.b.copy(b); p.c.copy(c); p.t = 0; p.d = dur; p.col = col; p.s = s; p.hit = hit; p.kind = kind; p.fade = fade; return; }
  }

  // HTML labels
  const labWrap = root.querySelector('.cb-labels');
  const mkLab = (txt, cls = '') => { const d = document.createElement('div'); d.className = 'cb-lab ' + cls; d.textContent = txt; labWrap.appendChild(d); return d; };
  const LOBES = [['Frontal', [44, 26, 42]], ['Motor strip', [44, 46, 2]], ['Parietal', [38, 26, -50]], ['Occipital', [26, 2, -66]], ['Temporal', [56, -22, 6]]]
    .map(([t, p]) => ({el: mkLab(t, 'lobe'), p: new THREE.Vector3(...p).add(C), side: Math.sign(p[0])}));
  const OPTLAB = [{el: mkLab('Light source', 'opt'), p: sPos[0]}, {el: mkLab('Detector', 'opt'), p: dPos[2]}];
  const IMULAB = {el: mkLab('IMU', 'imu'), p: imuPos};
  const tip = mkLab('', 'tip');
  const hud = root.querySelector('.cb-hud');

  /* ---------- state ---------- */
  let warming = false, mode = 'eeg', step = 0, T = 0, visible = false, auto = !reduce, stepT = 0;
  const STEP_DUR = 5.2;
  const hot = Array.from({length: HMAX}, () => ({on: false, i: 0, p: new THREE.Vector3(), life: 0, dur: 1, col: GLOW.eeg, amp: 1, links: []}));
  let spawnAcc = 0, emitAcc = 0, hoverE = -1;
  // IMU motion
  const mot = {yaw: 0, pitch: 0, roll: 0, ty: 0, tp: 0, next: 0, knock: 0, scans: 0, knocks: 0, lastYaw: 0, wy: 0, wp: 0, wr: 0, kNext: 6};
  // signals
  const SIG = 240, sig = {a: new Float32Array(SIG), b: new Float32Array(SIG), c: new Float32Array(SIG), head: 0};
  let fnirsLevel = .5, bands = [.4, .6, .5], outs = [.72, .58, .34];

  function setMode(m, restart = true) {
    mode = m; if (restart) { step = 0; stepT = 0; }
    sig.a.fill(0); sig.b.fill(0); sig.c.fill(0);
    for (const h of hot) h.on = false; for (const p of pool) p.on = false;
    root.style.setProperty('--m', MODES[m].c); root.style.setProperty('--mi', MODES[m].ink);
    warming = true; for (let i = 0; i < 150; i++) update(1 / 30); warming = false;
    mot.scans = 0; mot.knocks = 0; mot.kNext = T + 3;
    opts.onMode && opts.onMode(m, step);
  }
  function setStep(s) { step = s; stepT = 0; opts.onStep && opts.onStep(step); }

  function spawnHot(i, col, amp, dur, linkElectrodes) {
    const h = hot.find(x => !x.on); if (!h) return null;
    h.on = true; h.i = i; h.p.copy(surf[i]); h.life = 0; h.dur = dur; h.col = col; h.amp = amp; h.links = [];
    if (linkElectrodes) {
      const w = h.p.clone().add(C);
      h.links = ePos.map((e, k) => [e.distanceToSquared(w), k]).sort((a, b) => a[0] - b[0]).slice(0, 3).map(x => x[1]);
    }
    return h;
  }

  /* ---------- per-mode simulation ---------- */
  const tmpA = new THREE.Vector3(), tmpB = new THREE.Vector3(), tmpC = new THREE.Vector3();
  const pfc = PAIRS.map(([s, d]) => {
    const mid = sPos[s].clone().add(dPos[d]).multiplyScalar(.5), inward = C.clone().sub(mid).normalize();
    const deep = mid.clone().addScaledVector(inward, 20).sub(C);
    return {s, d, ctrl: mid.clone().addScaledVector(inward, 40), surfI: nearestSurf(deep)};
  });

  function simEEG(dt, level, linkOn, readOn, rate = 2.6) {
    spawnAcc += dt * rate * level;
    while (spawnAcc > 1) { spawnAcc--; spawnHot(Math.floor(Math.random() * surf.length / 2) * 2, GLOW.eeg, .6 + Math.random() * .5, 1.2 + Math.random() * 1.2, linkOn); }
    emitAcc += dt;
    const doEmit = emitAcc > .09; if (doEmit) emitAcc = 0;
    for (const h of hot) {
      if (!h.on || h.col !== GLOW.eeg) continue;
      if (doEmit && linkOn && h.life < h.dur * .8) {
        const w = tmpA.copy(h.p).add(C), n = surf[h.i + 1];
        for (const k of h.links) {
          const e = ePos[k]; tmpC.copy(w).add(e).multiplyScalar(.5).addScaledVector(n, 6);
          emit(w, tmpC, e, .8 + Math.random() * .3, GLOW.eeg, 3.4, readOn ? k : -1, 0);
        }
      }
    }
  }
  function simFNIRS(dt, absorbOn, detectOn, rate = 1) {
    emitAcc += dt * rate;
    if (emitAcc > .07) { emitAcc = 0;
      const pr = pfc[Math.floor(Math.random() * pfc.length)];
      const absorbed = absorbOn && Math.random() < .45;
      emit(sPos[pr.s], pr.ctrl, dPos[pr.d], 1.5, GLOW.fnirs, 4, detectOn ? pr.d : -1, 1, absorbed ? .5 : 0);
    }
    fnirsLevel = .55 + .3 * Math.sin(T * .45) + .1 * Math.sin(T * 1.3);
    for (const pr of pfc) {
      let h = hot.find(x => x.on && x.i === pr.surfI && x.col === GLOW.fnirs);
      if (!h) { h = spawnHot(pr.surfI, GLOW.fnirs, 1, 1e9, false); }
      if (h) { h.life = 1; h.amp = absorbOn ? .25 + .75 * fnirsLevel : .18; }
    }
  }
  function simIMU(dt, amp, knocks) {
    if (T > mot.next) { mot.ty = (Math.random() * 2 - 1) * .7 * amp; mot.tp = (Math.random() * .3 - .1) * amp; mot.next = T + 1.2 + Math.random() * 1.4; }
    if (knocks && T > mot.kNext) { mot.knock = 1; mot.kNext = T + 6 + Math.random() * 4; mot.knocks++; }
    const k = 1 - Math.exp(-dt * 4.5);
    const py = mot.yaw, pp = mot.pitch, pr = mot.roll;
    mot.yaw += (mot.ty - mot.yaw) * k; mot.pitch += (mot.tp - mot.pitch) * k;
    mot.knock = Math.max(0, mot.knock - dt * 2.2);
    const kn = mot.knock * mot.knock;
    mot.roll = Math.sin(T * 1.7) * .04 * amp + kn * Math.sin(T * 60) * .06;
    const pitchK = mot.pitch - kn * .22 + kn * Math.sin(T * 47) * .05;
    neck.rotation.set(pitchK, mot.yaw, mot.roll);
    mot.wy = (mot.yaw - py) / dt; mot.wp = (pitchK - pp) / dt; mot.wr = (mot.roll - pr) / dt;
    if (Math.abs(mot.yaw - mot.lastYaw) > .45) { mot.scans++; mot.lastYaw = mot.yaw; }
    return Math.min(1, (Math.abs(mot.wy) + Math.abs(mot.wp) * 1.5) / 3);
  }

  function push(a, b, c) { sig.a.copyWithin(0, 1); sig.b.copyWithin(0, 1); sig.c.copyWithin(0, 1); sig.a[SIG - 1] = a; sig.b[SIG - 1] = b; sig.c[SIG - 1] = c; }
  let sigAcc = 0;
  function eegSample(t) { return Math.sin(t * 6.1) * bands[0] * .5 + Math.sin(t * 10.3 + 1) * bands[1] * .6 + Math.sin(t * 19.7 + 2) * bands[2] * .3 + (Math.random() - .5) * .25; }

  function update(dt) {
    T += dt;
    if (auto && visible && !warming) { stepT += dt; if (stepT > STEP_DUR) setStep((step + 1) % 3); }
    bands = [.45 + .25 * Math.sin(T * .31), .6 + .3 * Math.sin(T * .23 + 1), .45 + .3 * Math.sin(T * .41 + 2)];
    let motion = 0;
    if (mode === 'eeg') { simEEG(dt, 1, step >= 1, step >= 2); neck.rotation.set(0, 0, 0); }
    else if (mode === 'fnirs') { simFNIRS(dt, step >= 1, step >= 2); neck.rotation.set(0, 0, 0); }
    else if (mode === 'imu') { motion = simIMU(dt, 1, step >= 2); }
    else { simEEG(dt, .7, true, true, 1.8); simFNIRS(dt, true, true, .45); motion = simIMU(dt, .45, false); }
    axes.visible = mode === 'imu' || mode === 'all';
    chip.material.emissiveIntensity = (mode === 'imu' ? .9 : mode === 'all' ? .5 : 0) * (.6 + .4 * Math.sin(T * 6));

    // hotspots
    let hi = 0;
    for (const h of hot) {
      if (!h.on) continue; h.life += dt; if (h.life > h.dur) { h.on = false; continue; }
      const env = h.dur > 1e8 ? 1 : Math.sin(Math.PI * h.life / h.dur);
      if (hi < HMAX) { U.uH.value[hi].set(h.p.x, h.p.y, h.p.z, env * h.amp); U.uHC.value[hi].copy(h.col); hi++; }
    }
    for (; hi < HMAX; hi++) U.uH.value[hi].w = 0;

    // particles
    const PA = parts.geometry.attributes;
    for (let k = 0; k < NP; k++) {
      const p = pool[k];
      if (p.on) {
        p.t += dt / p.d;
        if (p.fade && p.t > p.fade) { p.on = false; }
        else if (p.t >= 1) { p.on = false; if (p.hit >= 0) { if (p.kind === 0) eGlow[p.hit] = Math.min(1.4, eGlow[p.hit] + .22); else dGlow[p.hit] = Math.min(1.4, dGlow[p.hit] + .3); } }
      }
      if (!p.on) { PA.aA.array[k] = 0; continue; }
      const t = p.t, u = 1 - t;
      PA.position.array[k * 3] = u * u * p.a.x + 2 * u * t * p.b.x + t * t * p.c.x;
      PA.position.array[k * 3 + 1] = u * u * p.a.y + 2 * u * t * p.b.y + t * t * p.c.y;
      PA.position.array[k * 3 + 2] = u * u * p.a.z + 2 * u * t * p.b.z + t * t * p.c.z;
      let col = p.col;
      if (p.kind === 1 && t > .5) col = GLOW.fnirs;
      PA.aC.array.set([col.r, col.g, col.b], k * 3);
      const end = p.fade ? Math.min(1, (p.fade - t) * 8) : Math.min(1, (1 - t) * 6);
      PA.aA.array[k] = Math.min(1, t * 8) * end * (p.kind === 1 && t > .5 ? .55 : .95);
      PA.aS.array[k] = p.s;
    }
    PA.position.needsUpdate = PA.aC.needsUpdate = PA.aA.needsUpdate = PA.aS.needsUpdate = true;

    // halos
    const HA = halos.geometry.attributes;
    const eBase = mode === 'eeg' ? (step >= 2 ? .25 : .08) : mode === 'all' ? .14 : 0;
    for (let i = 0; i < ePos.length; i++) {
      eGlow[i] *= Math.exp(-dt * 2.6);
      let a = eBase + eGlow[i], c = GLOW.eeg;
      if (mode === 'imu' && step === 1) { a = motion * (.4 + .6 * Math.random()); c = GLOW.imu; }
      if (i === hoverE) a = Math.max(a, .9);
      HA.aA.array[i] = Math.min(1.2, a); HA.aS.array[i] = 18 + 12 * Math.min(1, eGlow[i]); HA.aC.array.set([c.r, c.g, c.b], i * 3);
    }
    const o = ePos.length, fOn = mode === 'fnirs' || mode === 'all';
    for (let i = 0; i < sPos.length; i++) { HA.aA.array[o + i] = fOn ? .7 + .3 * Math.sin(T * 9 + i) : 0; HA.aS.array[o + i] = 18; HA.aC.array.set([GLOW.fnirs.r, GLOW.fnirs.g, GLOW.fnirs.b], (o + i) * 3); }
    for (let i = 0; i < dPos.length; i++) { dGlow[i] *= Math.exp(-dt * 3); HA.aA.array[o + sPos.length + i] = fOn ? .1 + dGlow[i] * .7 : 0; HA.aS.array[o + sPos.length + i] = 16; HA.aC.array.set([GLOW.fnirs.r, GLOW.fnirs.g, GLOW.fnirs.b], (o + sPos.length + i) * 3); }
    const ii = o + sPos.length + dPos.length, iOn = mode === 'imu' ? 1 : mode === 'all' ? .5 : 0;
    for (let i = 0; i < 2; i++) { HA.aA.array[ii + i] = iOn * (.5 + .5 * Math.sin(T * 6)) + mot.knock * 1.5 * iOn; HA.aS.array[ii + i] = i ? 60 * mot.knock + 20 : 26; HA.aC.array.set([GLOW.imu.r, GLOW.imu.g, GLOW.imu.b], (ii + i) * 3); }
    HA.aA.needsUpdate = HA.aS.needsUpdate = HA.aC.needsUpdate = true;

    // signals (60 samples / s)
    sigAcc += dt;
    while (sigAcc > 1 / 60) { sigAcc -= 1 / 60; sig.head += 1 / 60; const t = sig.head;
      if (mode === 'eeg') { const act = hot.reduce((s, h) => s + (h.on ? Math.sin(Math.PI * h.life / h.dur) * h.amp : 0), 0); push(eegSample(t) * (.5 + .35 * act), 0, 0); }
      else if (mode === 'fnirs') push(fnirsLevel, 1 - fnirsLevel * .6, 0);
      else if (mode === 'imu') { if (step === 1) { const clean = eegSample(t) * .55; push(clean + (Math.random() - .5) * motion * 6 + mot.wy * .5, clean, 0); } else push(mot.wy * .35, mot.wp * .5, mot.wr * 1.5); }
      else { outs = [.62 + .18 * Math.sin(t * .3) + .05 * bands[1], .4 + .3 * fnirsLevel, .3 + .1 * Math.sin(t * .17) + .08 * Math.abs(mot.wy)]; push(outs[0], outs[1], outs[2]); }
    }
    if (hud) {
      const txt = mode === 'imu' && step === 2 ? `Scans ${mot.scans} · Knocks ${mot.knocks}` : mode === 'imu' ? `Turn ${Math.round(mot.yaw * 57.3)}°` : '';
      if (hud.textContent !== txt) hud.textContent = txt;
    }
  }

  /* ---------- trace ---------- */
  const tc = root.querySelector('.cb-trace'), tk = root.querySelector('.cb-scope-k'), tx = tc.getContext('2d');
  let lastKey = '';
  function legend(items) { const k = items.map(i => i[0] + i[1]).join(); if (k === lastKey) return; lastKey = k; tk.innerHTML = items.map(([c, t]) => `<span><i style="background:${c}"></i>${t}</span>`).join(''); }
  function line(arr, color, scale, mid, H, W, lw = 1.6, alpha = 1) {
    tx.beginPath(); tx.lineWidth = lw; tx.strokeStyle = color; tx.globalAlpha = alpha;
    for (let i = 0; i < SIG; i++) { const x = i / (SIG - 1) * W, y = mid - arr[i] * scale; i ? tx.lineTo(x, y) : tx.moveTo(x, y); }
    tx.stroke(); tx.globalAlpha = 1;
  }
  function drawTrace() {
    const r = tc.getBoundingClientRect(), dpr = Math.min(devicePixelRatio, 2);
    if (tc.width !== Math.round(r.width * dpr) || tc.height !== Math.round(r.height * dpr)) { tc.width = Math.round(r.width * dpr); tc.height = Math.round(r.height * dpr); }
    const W = tc.width, H = tc.height; tx.clearRect(0, 0, W, H);
    tx.strokeStyle = 'rgba(244,242,248,.1)'; tx.lineWidth = 1; tx.beginPath(); tx.moveTo(0, H / 2); tx.lineTo(W, H / 2); tx.stroke();
    if (mode === 'eeg') {
      line(sig.a, COL.eeg === '#9101B1' ? '#B45CF0' : COL.eeg, H * .32, H * .5, H, W, 1.6 * dpr);
      legend([['#B45CF0', 'EEG, one electrode'], ['transparent', `θ ${Math.round(bands[0] * 100)}  α ${Math.round(bands[1] * 100)}  β ${Math.round(bands[2] * 100)}`]]);
    } else if (mode === 'fnirs') {
      line(sig.a, '#3DB4FF', H * .7, H * .95, H, W, 2 * dpr); line(sig.b, '#8E7BFF', H * .7, H * .95, H, W, 1.4 * dpr, .8);
      legend([['#3DB4FF', 'Oxygen-rich blood'], ['#8E7BFF', 'Oxygen-poor blood']]);
    } else if (mode === 'imu') {
      if (step === 1) { line(sig.a, '#CFE68A', H * .22, H * .5, H, W, 1.2 * dpr, .55); line(sig.b, '#B45CF0', H * .22, H * .5, H, W, 1.8 * dpr); legend([['#CFE68A', 'EEG with movement'], ['#B45CF0', 'Cleaned']]); }
      else { line(sig.a, '#AEC959', H * .3, H * .5, H, W, 1.8 * dpr); line(sig.b, '#D6EBA0', H * .3, H * .5, H, W, 1.2 * dpr, .8); line(sig.c, '#7E9A30', H * .3, H * .5, H, W, 1.2 * dpr, .8); legend([['#AEC959', 'Turn'], ['#D6EBA0', 'Nod'], ['#7E9A30', 'Tilt']]); }
    } else {
      const names = ['Focus', 'Load', 'Fatigue'], cols = ['#B45CF0', '#3DB4FF', COL.fat], rowH = H / 3;
      tx.font = `500 ${11 * dpr}px "Manrope", sans-serif`; tx.textBaseline = 'middle';
      for (let i = 0; i < 3; i++) {
        const y = rowH * i + rowH / 2, v = Math.max(0, Math.min(1, outs[i])), x0 = 76 * dpr, bw = W - x0 - 44 * dpr;
        tx.fillStyle = 'rgba(244,242,248,.62)'; tx.fillText(names[i], 0, y);
        tx.fillStyle = 'rgba(244,242,248,.12)'; tx.fillRect(x0, y - 3 * dpr, bw, 6 * dpr);
        tx.fillStyle = cols[i]; tx.fillRect(x0, y - 3 * dpr, bw * v, 6 * dpr);
        tx.fillStyle = '#F4F2F8'; tx.textAlign = 'right'; tx.fillText(Math.round(v * 100), W, y); tx.textAlign = 'left';
      }
      legend([['transparent', 'One player, live']]);
    }
  }

  /* ---------- interaction ---------- */
  let yaw = -.65, pitch = .18, vy = 0, vp = 0, drag = null, idle = 0, touched = false;
  const hint = root.querySelector('.cb-hint');
  canvas.addEventListener('pointerdown', e => { drag = {x: e.clientX, y: e.clientY, t: e.pointerType}; idle = 0; if (!touched) { touched = true; hint && hint.classList.add('gone'); } canvas.setPointerCapture(e.pointerId); });
  canvas.addEventListener('pointermove', e => {
    if (drag) { const dx = e.clientX - drag.x, dy = e.clientY - drag.y; drag.x = e.clientX; drag.y = e.clientY;
      vy = dx * .008; yaw += vy; if (drag.t === 'mouse') { vp = dy * .006; pitch = Math.max(-.6, Math.min(.9, pitch + vp)); } return; }
    pick(e);
  });
  const end = () => { drag = null; }; canvas.addEventListener('pointerup', e => { end(); pick(e); }); canvas.addEventListener('pointercancel', end);
  canvas.addEventListener('pointerleave', () => { if (!drag) { hoverE = -1; tip.classList.remove('on'); } });
  const ray = new THREE.Raycaster(), ndc = new THREE.Vector2();
  function pick(e) {
    if (!(mode === 'eeg' || mode === 'all')) { hoverE = -1; tip.classList.remove('on'); return; }
    const r = canvas.getBoundingClientRect(); ndc.set((e.clientX - r.left) / r.width * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1);
    ray.setFromCamera(ndc, camera); const hit = ray.intersectObjects(eHit, false)[0];
    hoverE = hit ? hit.object.userData.i : -1;
    if (hoverE >= 0) { const E = ELECTRODES[hoverE]; tip.innerHTML = `<b>${E[0]}</b> ${E[4]}`; tip.classList.add('on'); } else tip.classList.remove('on');
  }

  /* ---------- frame ---------- */
  const v = new THREE.Vector3(), camDir = new THREE.Vector3();
  function place(el, p, show) {
    if (!show) { el.style.opacity = 0; return; }
    v.copy(p); world.localToWorld(v); const depth = v.clone().sub(camera.position).dot(camDir);
    v.project(camera);
    const w = stage.clientWidth, h = stage.clientHeight;
    el.style.transform = `translate(${(v.x * .5 + .5) * w}px,${(-v.y * .5 + .5) * h}px)`;
    el.style.opacity = depth < camera.position.length() + 4 ? 1 : 0;
  }
  function resize() {
    const w = stage.clientWidth, h = stage.clientHeight; if (!w || !h) return;
    renderer.setSize(w, h, false); camera.aspect = w / h;
    const fit = w / h < 1.05 ? 470 / Math.max(.75, w / h) : 430;
    camera.position.set(0, 0, fit); camera.updateProjectionMatrix();
    const s = renderer.getDrawingBufferSize(new THREE.Vector2()).y / (2 * Math.tan(THREE.MathUtils.degToRad(camera.fov / 2)));
    halos.material.uniforms.uScale.value = parts.material.uniforms.uScale.value = s;
  }
  new ResizeObserver(resize).observe(stage); resize();

  let last = performance.now();
  function frame(now) {
    const dt = Math.min(.05, (now - last) / 1000); last = now;
    update(reduce ? dt * .6 : dt);
    if (!drag) { idle += dt; vy *= Math.exp(-dt * 4); vp *= Math.exp(-dt * 4); yaw += vy; if (!reduce && idle > 2.5 && mode !== 'imu') yaw += dt * .12; }
    rig.rotation.set(pitch, yaw, 0, 'XYZ');
    camera.lookAt(0, 0, 0); camDir.set(0, 0, -1).applyQuaternion(camera.quaternion);
    for (const L of LOBES) place(L.el, L.p, mode === 'eeg' && step === 0);
    for (const L of OPTLAB) place(L.el, L.p, mode === 'fnirs');
    place(IMULAB.el, IMULAB.p, mode === 'imu');
    if (hoverE >= 0) place(tip, ePos[hoverE], true); else tip.style.opacity = 0;
    renderer.render(scene, camera);
    drawTrace();
  }
  const run = on => { visible = on; if (on) { last = performance.now(); renderer.setAnimationLoop(frame); } else renderer.setAnimationLoop(null); };
  new IntersectionObserver(es => run(es[0].isIntersecting && !document.hidden), {rootMargin: '100px'}).observe(stage);
  document.addEventListener('visibilitychange', () => { if (document.hidden) run(false); else { const r = stage.getBoundingClientRect(); run(r.bottom > 0 && r.top < innerHeight); } });

  setMode('eeg');
  return {
    setMode: m => { setMode(m); }, setStep: s => { setStep(s); }, setAuto: a => { auto = a && !reduce; },
    setHeadset: on => { gShell.uniforms.uVis.value = gLiner.uniforms.uVis.value = on ? 1 : 0; ghost.visible = on; },
    get step() { return step; }, MODES,
  };
}
export {MODES};
