// Abhik floating head avatar: three.js loader, idle life, lip sync from text, audio level or visemes.
// Usage: const bust = await AbhikHead.mount(canvas, { src: 'abhik_head.glb' });
//        bust.speak('Hello') · bust.setLevel(0..1) · bust.setSpeaking(true|false) · bust.setViseme('viseme_O', 1)
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';

// facial expressions as blends of the rig's shapes, plus a resting head pose (radians: x nod, y turn, z tilt)
export const EXPRESSIONS = {
  neutral:   { shapes: {}, pose: [0, 0, 0] },
  happy:     { shapes: { mouthSmileLeft: 0.7, mouthSmileRight: 0.7, eyeBlinkLeft: 0.22, eyeBlinkRight: 0.22, browUpLeft: 0.25, browUpRight: 0.25 }, pose: [-0.03, 0, 0.03], gesture: 'nod' },
  curious:   { shapes: { browUpLeft: 0.9, browDownRight: 0.25, mouthSmileLeft: 0.25 }, pose: [0.02, 0.06, 0.09] },
  thinking:  { shapes: { browDownLeft: 0.55, browDownRight: 0.55, mouthPress: 0.7, mouthStretchRight: 0.3, eyeBlinkLeft: 0.15, eyeBlinkRight: 0.15 }, pose: [-0.07, -0.12, -0.04] },
  surprised: { shapes: { browUpLeft: 1, browUpRight: 1, jawOpen: 0.12, mouthFunnel: 0.35 }, pose: [0.05, 0, 0] },
  serious:   { shapes: { browDownLeft: 0.8, browDownRight: 0.8, mouthPress: 0.5 }, pose: [0.04, 0, 0] },
  sad:       { shapes: { browUpLeft: 0.6, browUpRight: 0.6, browDownLeft: 0.3, browDownRight: 0.3, mouthRollLower: 0.35, mouthStretchLeft: 0.25, mouthStretchRight: 0.25, eyeBlinkLeft: 0.3, eyeBlinkRight: 0.3 }, pose: [0.08, 0, -0.03] },
  wink:      { shapes: { eyeBlinkLeft: 1, mouthSmileLeft: 0.7, mouthSmileRight: 0.4, browDownLeft: 0.3 }, pose: [0, 0.04, 0.07] },
};
const GESTURES = { nod: { axis: 0, amp: 0.07, freq: 2.2, dur: 900 }, shake: { axis: 1, amp: 0.08, freq: 2.6, dur: 1000 }, tilt: { axis: 2, amp: 0.06, freq: 0.8, dur: 1200 } };

// guess an expression from a sentence when the script has no [tag]
export function guessExpression(s) {
  const t = s.toLowerCase();
  if (/\b(sorry|unfortunately|miss|sad|lost)\b/.test(t)) return 'sad';
  if (/\b(wow|really|whoa|no way)\b/.test(t) || /!\?|\?!/.test(s)) return 'surprised';
  if (/\b(hmm|maybe|think|wonder|perhaps)\b/.test(t)) return 'thinking';
  if (/\?$/.test(s.trim())) return 'curious';
  if (/!$/.test(s.trim()) || /\b(hi|hello|hey|love|glad|great|thanks|welcome)\b/.test(t)) return 'happy';
  return 'neutral';
}
// "[happy] Hi there. [curious] Want a tour?" -> [{expr:'happy',text:'Hi there.'},...]; untagged sentences get guessed when auto is on
export function parseScript(text, auto = true) {
  const out = []; let cur = null;
  for (const part of text.split(/(\[[a-z]+\])/i)) {
    const tag = part.match(/^\[([a-z]+)\]$/i);
    if (tag) { cur = tag[1].toLowerCase(); continue; }
    for (const sent of part.match(/[^.!?]+[.!?]*/g) || []) {
      if (!sent.trim()) continue;
      out.push({ expr: cur && EXPRESSIONS[cur] ? cur : (auto ? guessExpression(sent) : 'neutral'), text: sent.trim(), tagged: !!cur });
    }
  }
  return out;
}

const VISEMES = ['viseme_sil','viseme_PP','viseme_FF','viseme_TH','viseme_DD','viseme_kk','viseme_CH','viseme_SS','viseme_nn','viseme_RR','viseme_aa','viseme_E','viseme_I','viseme_O','viseme_U'];

// rough English letters -> viseme, good enough to drive a mouth from text
function textToVisemes(word) {
  const w = word.toLowerCase().replace(/[^a-z]/g, '');
  const out = [];
  for (let i = 0; i < w.length; i++) {
    const c = w[i], n = w[i + 1] || '';
    if (c === 't' && n === 'h') { out.push('viseme_TH'); i++; continue; }
    if ((c === 's' || c === 'c') && n === 'h') { out.push('viseme_CH'); i++; continue; }
    if (c === 'o' && (n === 'o' || n === 'u')) { out.push('viseme_U'); i++; continue; }
    if (c === 'e' && n === 'e') { out.push('viseme_I'); i++; continue; }
    if ('a'.includes(c)) out.push('viseme_aa');
    else if ('e'.includes(c)) out.push(i === w.length - 1 ? null : 'viseme_E');
    else if ('iy'.includes(c)) out.push('viseme_I');
    else if ('o'.includes(c)) out.push('viseme_O');
    else if ('uw'.includes(c)) out.push('viseme_U');
    else if ('pbm'.includes(c)) out.push('viseme_PP');
    else if ('fv'.includes(c)) out.push('viseme_FF');
    else if ('tdl'.includes(c)) out.push('viseme_DD');
    else if ('n'.includes(c)) out.push('viseme_nn');
    else if ('kgcq'.includes(c)) out.push('viseme_kk');
    else if ('jx'.includes(c)) out.push('viseme_CH');
    else if ('sz'.includes(c)) out.push('viseme_SS');
    else if ('r'.includes(c)) out.push('viseme_RR');
  }
  return out.filter(Boolean);
}

export async function mount(canvas, opts = {}) {
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true });
  renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = opts.exposure ?? 1.15;
  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(24, 1, 0.05, 20);
  scene.add(new THREE.HemisphereLight(0xfff4ee, 0x2a2430, 1.1));
  const key = new THREE.DirectionalLight(0xffffff, 2.2); key.position.set(0.8, 1.0, 1.6); scene.add(key);
  const rim = new THREE.DirectionalLight(opts.rimColor ?? 0xfb0068, opts.rimIntensity ?? 0.5); rim.position.set(-1.2, 0.6, -1.0); scene.add(rim);
  const fill = new THREE.DirectionalLight(0xcfe0ff, 0.6); fill.position.set(-1.2, 0.2, 1.0); scene.add(fill);

  const loader = new GLTFLoader();
  const gltf = opts.buffer ? await loader.parseAsync(opts.buffer, '') : await loader.loadAsync(opts.src);
  const root = gltf.scene; scene.add(root);
  const meshes = []; let headBone = null, neckBone = null, glasses = null; const eyes = [];
  root.traverse(o => {
    if (o.isMesh && o.morphTargetDictionary) meshes.push(o);
    if (o.isBone && o.name === 'Head') headBone = o;
    if (o.isBone && o.name === 'Neck') neckBone = o;
    if (o.isBone && (o.name === 'EyeL' || o.name === 'EyeR')) eyes.push(o);
    if (o.name === 'Glasses') glasses = o;
    if (o.isMesh) {
      o.frustumCulled = false;
      const m = o.material;
      // hair cards and the neck fade are cut-outs: hashed alpha keeps them sorted without transparency passes
      if (m && m.name === 'HairCards') { m.transparent = false; m.depthWrite = true; m.alphaTest = 0.3; m.side = THREE.DoubleSide; m.needsUpdate = true; }
      if (m && m.name === 'Skin') { m.transparent = true; m.depthWrite = true; m.needsUpdate = true; }  // soft neck fade
      if (m && m.name.startsWith('Eye')) { m.roughness = 0.08; m.envMapIntensity = 1.2; }
    }
  });
  if (glasses) glasses.visible = opts.glasses ?? false;
  const eyeRest = eyes.map(b => b.quaternion.clone());
  let saccade = { x: 0, y: 0 }, nextSaccade = performance.now() + 900;
  const names = Object.keys(meshes[0].morphTargetDictionary);
  const headRest = headBone.quaternion.clone(), neckRest = neckBone.quaternion.clone();

  // frame the floating head; model units are metres with the origin near the bridge of the nose
  const target = new THREE.Vector3(0, opts.targetY ?? 0.025, -0.03);
  camera.position.set(0, target.y + 0.01, opts.distance ?? 0.85);
  const controls = new OrbitControls(camera, canvas);
  controls.target.copy(target); controls.enablePan = false; controls.enableDamping = true;
  controls.minDistance = 0.45; controls.maxDistance = 1.6;
  controls.minPolarAngle = Math.PI * 0.32; controls.maxPolarAngle = Math.PI * 0.62;
  controls.minAzimuthAngle = -1.2; controls.maxAzimuthAngle = 1.2;
  controls.enabled = opts.orbit ?? true;

  // weights: target values eased toward every frame
  const goal = Object.fromEntries(names.map(n => [n, 0])), cur = { ...goal };
  const set = (n, v) => { const i = meshes[0].morphTargetDictionary[n]; if (i === undefined) return; for (const m of meshes) m.morphTargetInfluences[m.morphTargetDictionary[n]] = v; };

  const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const expr = Object.fromEntries(names.map(n => [n, 0])), exprCur = { ...expr };
  let pose = [0, 0, 0], poseCur = [0, 0, 0], gesture = null, exprName = 'neutral', exprAmt = 1;
  let speaking = false, level = 0, levelSmoothed = 0, queue = [], manual = null;
  let nextBlink = performance.now() + 1500, blinkT = -1, look = { x: 0, y: 0 };
  const api = {
    names, visemes: VISEMES,
    setSpeaking(on) { speaking = !!on; if (!on) { queue = []; level = 0; } },
    setLevel(v) { level = Math.max(0, Math.min(1, v)); speaking = level > 0.02 || speaking; },
    setViseme(name, w = 1) { manual = name ? { name, w } : null; },
    setShape(name, w) { goal[name] = w; },
    setExpression(name, amount = 1) {
      const e = EXPRESSIONS[name] || EXPRESSIONS.neutral; exprName = name; exprAmt = amount;
      for (const n of names) expr[n] = (e.shapes[n] || 0) * amount * (n.startsWith('eye') ? 1 : (opts.expressionGain ?? 1));
      pose = e.pose.map(v => v * amount);
      if (e.gesture) api.gesture(e.gesture);
    },
    get expression() { return exprName; },
    gesture(name) { const g = GESTURES[name]; if (g && !reduced) gesture = { ...g, t0: performance.now() }; },
    showGlasses(on) { if (glasses) glasses.visible = !!on; },
    lookAt(x, y) { look = { x, y }; },
    // schedule visemes for a word starting now; dur in ms
    word(text, dur) {
      const vs = textToVisemes(text); if (!vs.length) return;
      const t0 = performance.now(), step = dur / vs.length;
      queue = vs.map((v, i) => ({ v, t: t0 + i * step, d: step }));
    },
    // speak a script with [expression] tags, one sentence at a time; onSegment(i, seg) fires as each starts
    async speakScript(text, { rate = 1, pitch = 1, voice, auto = true, onSegment } = {}) {
      const segs = parseScript(text, auto); api._stop = false;
      for (let i = 0; i < segs.length && !api._stop; i++) {
        api.setExpression(segs[i].expr, exprAmt);
        onSegment && onSegment(i, segs[i]);
        await api.speak(segs[i].text, { rate, pitch, voice, keep: true });
      }
      api.setExpression('neutral', exprAmt); onSegment && onSegment(-1, null);
      return segs;
    },
    stop() { api._stop = true; try { speechSynthesis.cancel(); } catch (e) {} api.setSpeaking(false); },
    speak(text, { rate = 1, pitch = 1, voice, keep = false } = {}) {
      return new Promise(res => {
        if (!('speechSynthesis' in window)) return res(false);
        if (!keep) speechSynthesis.cancel();
        const u = new SpeechSynthesisUtterance(text); u.rate = rate; u.pitch = pitch; if (voice) u.voice = voice;
        const words = [...text.matchAll(/\S+/g)];
        let gotBoundary = false, fallback = null;
        u.onstart = () => {
          api.setSpeaking(true);
          // if the browser never sends word boundaries, walk the words on a timer
          let i = 0; const ms = w => 80 * w.length / rate + 60;
          const tick = () => { if (gotBoundary || i >= words.length) return; const w = words[i++][0]; api.word(w, ms(w)); fallback = setTimeout(tick, ms(w) + 40); };
          fallback = setTimeout(tick, 120);
        };
        u.onboundary = e => {
          if (e.name && e.name !== 'word') return; gotBoundary = true; clearTimeout(fallback);
          const w = text.slice(e.charIndex).match(/\S+/); if (w) api.word(w[0], 75 * w[0].length / rate + 50);
        };
        u.onend = u.onerror = () => { clearTimeout(fallback); api.setSpeaking(false); res(true); };
        speechSynthesis.speak(u);
      });
    },
    // drive the mouth from any <audio>/<video> element or MediaStream (e.g. the voice agent's remote audio)
    attachAudio(source) {
      const ctx = api._ctx || (api._ctx = new (window.AudioContext || window.webkitAudioContext)());
      const node = source instanceof MediaStream ? ctx.createMediaStreamSource(source) : ctx.createMediaElementSource(source);
      const an = ctx.createAnalyser(); an.fftSize = 1024; node.connect(an);
      if (!(source instanceof MediaStream)) an.connect(ctx.destination);
      const buf = new Float32Array(an.fftSize), spec = new Uint8Array(an.frequencyBinCount);
      api._analyser = () => {
        an.getFloatTimeDomainData(buf); let s = 0; for (const x of buf) s += x * x;
        const rms = Math.sqrt(s / buf.length); an.getByteFrequencyData(spec);
        let lo = 0, hi = 0; for (let i = 2; i < 40; i++) lo += spec[i]; for (let i = 60; i < 200; i++) hi += spec[i];
        return { level: Math.min(1, rms * 6), bright: hi / (lo + hi + 1) };
      };
      return ctx;
    },
    detachAudio() { api._analyser = null; },
    renderer, scene, camera, root, controls,
  };

  function resize() {
    const w = canvas.clientWidth, h = canvas.clientHeight;
    if (canvas.width !== Math.round(w * renderer.getPixelRatio()) || canvas.height !== Math.round(h * renderer.getPixelRatio())) {
      renderer.setSize(w, h, false); camera.aspect = w / h; camera.updateProjectionMatrix();
    }
  }
  let last = performance.now(), audioViseme = 'viseme_aa', avT = 0;
  renderer.setAnimationLoop(now => {
    const dt = Math.min(0.05, (now - last) / 1000); last = now; resize();
    for (const n of names) goal[n] = (n.startsWith('viseme_') || n === 'jawOpen') ? 0 : goal[n];
    // speech from text schedule
    while (queue.length && queue[0].t + queue[0].d < now) queue.shift();
    if (queue.length && queue[0].t <= now) goal[queue[0].v] = 0.9;
    // speech from audio level
    if (api._analyser) { const a = api._analyser(); level = a.level; if (now - avT > 110) { avT = now; audioViseme = a.bright > 0.35 ? (Math.random() < 0.5 ? 'viseme_SS' : 'viseme_E') : ['viseme_aa','viseme_O','viseme_E','viseme_aa','viseme_U'][Math.floor(Math.random() * 5)]; } }
    levelSmoothed += (level - levelSmoothed) * Math.min(1, dt * 18);
    if (levelSmoothed > 0.03) { goal[audioViseme] = Math.min(1, levelSmoothed * 1.4); goal.jawOpen = levelSmoothed * 0.25; }
    else if (speaking && !queue.length && !api._analyser && level > 0) { goal.viseme_aa = 0.3; }
    if (manual) goal[manual.name] = manual.w;
    // blinks
    if (!reduced && now > nextBlink) { blinkT = now; nextBlink = now + 2200 + Math.random() * 3800; }
    const bp = blinkT < 0 ? 1 : (now - blinkT) / 150; const blink = bp < 1 ? Math.sin(bp * Math.PI) : 0;
    for (const n of names) {
      const k = n.startsWith('viseme_') || n === 'jawOpen' ? 22 : 10;
      cur[n] += (goal[n] - cur[n]) * Math.min(1, dt * k);
      exprCur[n] += (expr[n] - exprCur[n]) * Math.min(1, dt * 6);
      // while a viseme is active, ease smiles off a little so the mouth shapes still read
      const mouthBusy = n.startsWith('mouth') && speaking ? 0.6 : 1;
      set(n, Math.min(n.startsWith('eye') ? 1 : 1.4, cur[n] + exprCur[n] * mouthBusy + (n === 'eyesClosed' ? blink : 0)));
    }
    // idle head motion: slow drift, a little more while talking
    const t = now / 1000, amp = reduced ? 0 : (speaking ? 1.6 : 1);
    for (let i = 0; i < 3; i++) poseCur[i] += (pose[i] - poseCur[i]) * Math.min(1, dt * 4);
    const gst = [0, 0, 0];
    if (gesture) { const p = (now - gesture.t0) / gesture.dur; if (p >= 1) gesture = null; else gst[gesture.axis] = Math.sin(p * Math.PI * 2 * gesture.freq) * gesture.amp * (1 - p); }
    const e = new THREE.Euler(
      (Math.sin(t * 0.7) * 0.025 + Math.sin(t * 1.9) * 0.01 * (speaking ? 1 : 0)) * amp - look.y * 0.25 + poseCur[0] + gst[0],
      (Math.sin(t * 0.43) * 0.05) * amp + look.x * 0.4 + poseCur[1] + gst[1],
      Math.sin(t * 0.31) * 0.015 * amp + poseCur[2] + gst[2]);
    headBone.quaternion.copy(headRest).multiply(new THREE.Quaternion().setFromEuler(e));
    neckBone.quaternion.copy(neckRest).multiply(new THREE.Quaternion().setFromEuler(new THREE.Euler(e.x * 0.3, e.y * 0.3, 0)));
    // eyes: follow lookAt, with small idle saccades
    if (!reduced && now > nextSaccade) { saccade = { x: (Math.random() - 0.5) * 0.12, y: (Math.random() - 0.5) * 0.06 }; nextSaccade = now + 700 + Math.random() * 2600; }
    const eq = new THREE.Quaternion().setFromEuler(new THREE.Euler(-(look.y * 0.35 + saccade.y), 0, -(look.x * 0.45 + saccade.x)));  // eye bones point forward (local y), so yaw is about local z
    eyes.forEach((b, i) => b.quaternion.copy(eyeRest[i]).multiply(eq));
    root.position.y = reduced ? 0 : Math.sin(t * 1.2) * 0.002;
    controls.update(); renderer.render(scene, camera);
  });
  return api;
}
window.AbhikHead = window.AbhikBust = { mount, textToVisemes, parseScript, guessExpression, EXPRESSIONS };
