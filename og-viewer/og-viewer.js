// overgrwth build viewer. Mount with mountOgViewer(el). Geometry: og-parts.glb (from the signed-off 3 in STEP files),
// colours and specs: og-data.json (from cmf.json). Layout maths in mm, Z up, same as the CAD.
import * as THREE from 'three';
import {GLTFLoader} from 'three/addons/loaders/GLTFLoader.js';
import {OrbitControls} from 'three/addons/controls/OrbitControls.js';
import {RoomEnvironment} from 'three/addons/environments/RoomEnvironment.js';
import {MeshoptDecoder} from 'three/addons/libs/meshopt_decoder.module.js';
import {EffectComposer} from 'three/addons/postprocessing/EffectComposer.js';
import {RenderPass} from 'three/addons/postprocessing/RenderPass.js';
import {UnrealBloomPass} from 'three/addons/postprocessing/UnrealBloomPass.js';
import {OutputPass} from 'three/addons/postprocessing/OutputPass.js';

const BASE=new URL('./',import.meta.url).href;
const G=533.4, P=914.4, TALL=609.6, SHORT=304.8, R=38.1, CL=35, GLB_BYTES=1735432;

/* ---------------- layouts ---------------- */
// blocks: frame stacks. i = grid column of the tall post, rows {j: number of stacked frames}.
// bays: module on 4 clamps between posts (i,j)(i+1,j)(i,j+1)(i+1,j+1). faces: panel between two posts.
// tops: attachment per post top, every other free top gets an end cap. vines: post + height.
const LAYOUTS={
  compact:{label:'Compact',blocks:[{i:0,rows:{0:2,1:2}}],
    bays:[{i:0,j:0,z:230,k:'planter'},{i:0,j:0,z:560,k:'shelf',props:['books','controller','cds']}],
    faces:[{a:[0,0],b:[1,0],s:-1,z:360,k:'whiteboard'}],
    tops:{'0,0':'spot','1,0':'clock','0,1':'grow','1,1':'hub'},
    vines:[{p:[1,1],z0:260,z1:640}]},
  moderate:{label:'Moderate',blocks:[{i:0,rows:{0:3,1:3,2:2}}],
    bays:[{i:0,j:0,z:230,k:'shelf',props:['boombox']},{i:0,j:0,z:560,k:'shelf',props:['books','pot']},{i:0,j:1,z:230,k:'planter'},{i:0,j:1,z:830,k:'shelf',props:['controller','cds','mug']}],
    faces:[{a:[0,0],b:[1,0],s:-1,z:360,k:'whiteboard'},{a:[0,0],b:[1,0],s:-1,z:870,k:'pegboard'},{a:[0,1],b:[0,2],s:-1,z:300,k:'softboard'}],
    tops:{'0,0':'spot','1,0':'clock','0,1':'grow','1,1':'speaker','0,2':'hub','1,2':'pen'},
    vines:[{p:[1,1],z0:260,z1:900},{p:[1,2],z0:260,z1:780}]},
  expanded:{label:'Expanded',blocks:[{i:0,rows:{0:3,1:3,2:2,3:1}},{i:2,rows:{0:1,1:2,2:3,3:3}}],
    bays:[{i:0,j:0,z:230,k:'shelf',props:['boombox']},{i:0,j:0,z:560,k:'shelf',props:['books','pot']},{i:0,j:1,z:230,k:'planter'},{i:0,j:1,z:830,k:'shelf',props:['cds','books']},
      {i:1,j:0,z:420,k:'shelf',props:['controller','cds','mug']},{i:1,j:1,z:560,k:'planter'},{i:1,j:2,z:230,k:'planter'},
      {i:2,j:1,z:230,k:'shelf',props:['books','controller']},{i:2,j:1,z:600,k:'planter'},{i:2,j:2,z:560,k:'shelf',props:['pot','cds']},{i:2,j:2,z:1150,k:'shelf'}],
    faces:[{a:[0,0],b:[1,0],s:-1,z:360,k:'whiteboard'},{a:[0,0],b:[1,0],s:-1,z:870,k:'pegboard'},{a:[0,1],b:[0,2],s:-1,z:300,k:'softboard'},{a:[3,2],b:[3,3],s:1,z:300,k:'pegboard'},{a:[2,3],b:[3,3],s:1,z:700,k:'softboard'}],
    tops:{'0,0':'spot','0,1':'grow','1,1':'clock','0,2':'hub','1,2':'pen','2,1':'speaker','2,2':'grow','2,3':'spot','3,2':'grow','3,3':'hub'},
    vines:[{p:[1,1],z0:260,z1:1150},{p:[1,2],z0:260,z1:880},{p:[2,1],z0:630,z1:880},{p:[3,1],z0:630,z1:880},{p:[2,2],z0:260,z1:1450},{p:[1,3],z0:60,z1:280}]},
};
const KINDS=[ // toggle key, label, part key
  ['shelf','Shelves'],['planter','Planters'],['whiteboard','Whiteboard'],['pegboard','Pegboard'],['softboard','Softboard'],
  ['grow','Grow light'],['spot','Spotlight'],['clock','Clock'],['speaker','Speaker'],['hub','Power hub'],['pen','Pen stand'],['clips','Vines']];
const PRESETS={bare:{label:'Bare',on:[]},home:{label:'Home desk',on:['shelf','whiteboard','clock','pen','hub','spot']},
  studio:{label:'Studio',on:KINDS.map(k=>k[0])},plant:{label:'Plant corner',on:['shelf','planter','grow','clips','spot']}};
const POWERED=new Set(['grow','spot','hub','clock','speaker']);

/* ---------------- layout solver ---------------- */
function solve(L){
  const posts=new Map(), frames=[], key=(i,j)=>i+','+j;
  const post=(i,j)=>{let p=posts.get(key(i,j));if(!p)posts.set(key(i,j),p={i,j,x:i*G,y:j*G,top:0,tees:[],joints:[],busy:[],stack:null,frameAt:[]});return p;};
  for(const b of L.blocks)for(const [js,n] of Object.entries(b.rows)){
    const j=+js, A=post(b.i,j), B=post(b.i+1,j), stack={i:b.i,j,n,A,B,powered:false};
    A.stack=B.stack=stack;
    let za=0,zb=0;
    for(let k=0;k<n;k++){
      const even=k%2===0, base=Math.floor(k/2)*P;
      frames.push({k,stack,flip:!even,x:even?A.x:B.x,y:A.y,z:even?base:base+P});
      const la=even?TALL:SHORT, lb=even?SHORT:TALL;
      A.frameAt.push([za,za+la,k]); B.frameAt.push([zb,zb+lb,k]);
      const tee=even?base+152.4:base+P-152.4; A.tees.push(tee); B.tees.push(tee);
      za+=la; zb+=lb; if(k<n-1){A.joints.push([za,k]); B.joints.push([zb,k]);}
    }
    A.top=za; B.top=zb;
  }
  const free=(p,z)=>z>=70&&z+CL<=p.top-8&&!p.tees.some(t=>Math.abs(t-z-CL/2)<CL/2+60)&&!p.busy.some(([a,b])=>z<b+8&&z+CL>a-8);
  const fit=(ps,want,dz=[0])=>{for(let d=0;d<=260;d+=5)for(const s of d?[1,-1]:[1]){const z=want+s*d;if(dz.every(o=>ps.every(p=>free(p,z+o))))return z;}return null;};
  const take=(ps,z,dz=[0])=>dz.forEach(o=>ps.forEach(p=>p.busy.push([z+o,z+o+CL])));
  const mods=[];
  for(const m of L.bays){
    const ps=[[m.i,m.j],[m.i+1,m.j],[m.i,m.j+1],[m.i+1,m.j+1]].map(([i,j])=>posts.get(key(i,j)));
    if(ps.some(p=>!p))continue;
    const z=fit(ps,m.z);if(z==null){console.warn('og: no room for',m);continue;}
    take(ps,z); mods.push({...m,type:'bay',z,ps,cx:(m.i+.5)*G,cy:(m.j+.5)*G});
  }
  for(const m of L.faces){
    const ps=[m.a,m.b].map(([i,j])=>posts.get(key(i,j)));
    if(ps.some(p=>!p))continue;
    const z=fit(ps,m.z,[0,305]);if(z==null){console.warn('og: no room for',m);continue;}
    take(ps,z,[0,305]); mods.push({...m,type:'face',z,ps,alongX:ps[0].y===ps[1].y});
  }
  const tops=[...posts.values()].map(p=>({p,k:L.tops[key(p.i,p.j)]||null}));
  for(const t of tops)if(t.k&&POWERED.has(t.k))t.p.stack.powered=true;
  const xs=[...posts.values()].map(p=>p.x), ys=[...posts.values()].map(p=>p.y), zt=Math.max(...[...posts.values()].map(p=>p.top));
  const box={x0:Math.min(...xs)-R,x1:Math.max(...xs)+R,y0:Math.min(...ys)-R,y1:Math.max(...ys)+R,z1:zt};
  return {posts,frames,mods,tops,box,vines:L.vines.map(v=>({...v,p:posts.get(key(...v.p))})).filter(v=>v.p)};
}
const frameIndexAt=(p,z)=>{for(const [a,b,k] of p.frameAt)if(z>=a-1&&z<=b+1)return k;return p.frameAt.length-1;};

/* ---------------- UI ---------------- */
const CSS=`
.ogv{position:relative;display:grid;grid-template-columns:minmax(0,1fr) 320px;background:var(--ogb,#4569BE);color:var(--ogp,#FFFAFA);font-family:'Instrument Sans',system-ui,sans-serif;margin:clamp(40px,6vw,88px) var(--gutter,16px) 0}
.ogv-stage{position:relative;min-height:520px;aspect-ratio:16/11;background:var(--ogp,#FFFAFA);overflow:hidden;transition:background .6s}
.ogv-stage.night{background:#0E1530}
.ogv-stage canvas.ogv-gl{position:absolute;inset:0;width:100%;height:100%;touch-action:none;cursor:grab;display:block}
.ogv-stage canvas.ogv-gl:active{cursor:grabbing}
.ogv-cube{position:absolute;top:12px;right:12px;width:104px;height:104px;cursor:pointer;touch-action:none}
.ogv-home{position:absolute;top:118px;right:42px;width:44px;height:28px;border:0;border-radius:999px;background:var(--ogb,#4569BE);color:var(--ogp,#FFFAFA);font:600 12px/1 inherit;cursor:pointer}
.ogv-eye{top:152px}
.ogv-fallback{position:absolute;inset:0;width:100%;height:100%;object-fit:contain;display:none}
.ogv.failed .ogv-fallback{display:block}.ogv.failed canvas{display:none}
.ogv-load{position:absolute;left:50%;top:50%;transform:translate(-50%,-50%);width:min(320px,70%);color:var(--ogb,#4569BE);font:600 13px/1.2 inherit;text-align:center}
.ogv-load b{display:block;font-size:40px;font-weight:700;letter-spacing:-.02em;margin-bottom:10px}
.ogv-load i{display:block;height:6px;background:rgba(69,105,190,.18);border-radius:3px;overflow:hidden;margin-top:10px}
.ogv-load i span{display:block;height:100%;width:0;background:var(--ogb,#4569BE);transition:width .2s}
.ogv.ready .ogv-load{display:none}
.ogv-card{position:absolute;left:12px;bottom:12px;max-width:min(340px,calc(100% - 24px));background:var(--ogp,#FFFAFA);color:#1F2F5C;padding:14px 16px 16px;box-shadow:0 8px 24px rgba(31,47,92,.18);display:none;font-size:13px;line-height:1.45}
.ogv-card.on{display:block}
.ogv-card h4{margin:0 0 2px;font-size:17px;line-height:1.2;display:flex;align-items:center;gap:8px}
.ogv-card h4 i{width:14px;height:14px;border-radius:50%;background:var(--sw);box-shadow:0 0 0 1px rgba(0,0,0,.18);flex:none}
.ogv-card small{display:block;opacity:.6;margin-bottom:8px;font-family:'IBM Plex Mono',ui-monospace,monospace;font-size:11px}
.ogv-card dl{display:grid;grid-template-columns:auto 1fr;gap:2px 10px;margin:8px 0 0}.ogv-card dt{opacity:.6}.ogv-card dd{margin:0}
.ogv-card button{position:absolute;top:6px;right:6px;border:0;background:none;font-size:20px;line-height:1;color:inherit;cursor:pointer;padding:4px 8px}
.ogv-hint{position:absolute;left:50%;bottom:12px;transform:translateX(-50%);font-size:12px;color:var(--ogb,#4569BE);opacity:.8;pointer-events:none;white-space:nowrap}
.ogv-stage.night .ogv-hint{color:#FFFAFA}.ogv-card.on~.ogv-hint{display:none}
.ogv-dims{position:absolute;inset:0;pointer-events:none}
.ogv-dims span{position:absolute;transform:translate(-50%,-50%);background:#1F2F5C;color:#FFFAFA;font:600 11px/1 'IBM Plex Mono',ui-monospace,monospace;padding:4px 6px;white-space:nowrap}
.ogv-panel{padding:clamp(20px,2.4vw,32px);display:flex;flex-direction:column;gap:18px;overflow:auto;max-height:100%}
.ogv-panel h3{margin:0;font-size:clamp(48px,5vw,72px);line-height:.9}.ogv .og-out{-webkit-text-stroke-color:var(--ogp,#FFFAFA)}
.ogv-sec{display:flex;flex-direction:column;gap:8px}
.ogv-sec>span{font:600 11px/1 'IBM Plex Mono',ui-monospace,monospace;text-transform:uppercase;letter-spacing:.08em;opacity:.75}
.ogv-row{display:flex;flex-wrap:wrap;gap:6px}
.ogv button.ogv-b{font:600 14px/1 'Instrument Sans',system-ui,sans-serif;padding:10px 14px;border:0;border-radius:999px;background:rgba(255,250,250,.16);color:var(--ogp,#FFFAFA);cursor:pointer;min-height:40px}
.ogv button.ogv-b[aria-pressed=true]{background:var(--ogy,#FBCB44);color:#1F2F5C}
.ogv-seg{display:grid;grid-template-columns:repeat(3,1fr);background:rgba(255,250,250,.16);border-radius:999px;padding:3px}
.ogv-seg button.ogv-b{background:none;min-height:36px;padding:8px 6px}
.ogv-mods button.ogv-b{display:inline-flex;align-items:center;gap:8px;padding:8px 12px;font-weight:500}
.ogv-mods button.ogv-b i{width:12px;height:12px;border-radius:50%;background:var(--sw);box-shadow:0 0 0 1px rgba(0,0,0,.2)}
.ogv-mods button.ogv-b[aria-pressed=true]{background:var(--ogp,#FFFAFA);color:#1F2F5C}
.ogv-mods button.ogv-b[aria-pressed=false] i{background:transparent;box-shadow:0 0 0 1px var(--ogp,#FFFAFA)}
.ogv-sheet-t{display:none}
@media (max-width:900px){
  .ogv{grid-template-columns:minmax(0,1fr);overflow:hidden}
  .ogv-stage{aspect-ratio:auto;height:min(78vh,640px);min-height:440px}
  .ogv-panel{position:absolute;left:0;right:0;bottom:0;max-height:calc(100% - 64px);background:var(--ogb,#4569BE);transform:translateY(calc(100% - 112px));transition:transform .35s cubic-bezier(.2,.8,.2,1);z-index:2;padding:0 16px 20px;gap:14px;overflow:hidden}
  .ogv.open .ogv-panel{transform:none;overflow:auto}
  .ogv-sheet-t{display:flex;align-items:center;justify-content:center;flex-direction:column;gap:6px;border:0;background:none;color:inherit;font:600 13px/1 inherit;padding:10px 0 6px;cursor:pointer;width:100%}
  .ogv-sheet-t::before{content:'';width:40px;height:4px;border-radius:2px;background:rgba(255,250,250,.5)}
  .ogv-panel h3{display:none}
  .ogv-card{bottom:124px}.ogv-hint{bottom:124px}
  .ogv-cube{width:84px;height:84px}.ogv-home{top:98px;right:32px}.ogv-eye{top:130px}
}`;

function el(tag,attrs={},html=''){const e=document.createElement(tag);for(const [k,v] of Object.entries(attrs))e.setAttribute(k,v);if(html)e.innerHTML=html;return e;}

export async function mountOgViewer(root,{fallback='img/og3-growth.jpg',fallbackAlt='overgrwth setups'}={}){
  if(!document.getElementById('ogv-css')){const s=el('style',{id:'ogv-css'});s.textContent=CSS;document.head.appendChild(s);}
  root.classList.remove('og-build'); root.classList.add('ogv'); root.innerHTML='';
  const stage=el('div',{class:'ogv-stage'}), panel=el('div',{class:'ogv-panel'});
  root.append(stage,panel);
  const canvas=el('canvas',{class:'ogv-gl','aria-label':'Interactive 3D model of an overgrwth setup. Drag to turn, tap a part for its details.'});
  const cubeC=el('canvas',{class:'ogv-cube','aria-label':'View cube: tap a face, edge or corner to look from that side'});
  const home=el('button',{class:'ogv-home',type:'button','aria-label':'Overview'},'⌂'), eye=el('button',{class:'ogv-home ogv-eye',type:'button','aria-label':'Eye-level view'},'Eye');
  const img=el('img',{class:'ogv-fallback',src:fallback,alt:fallbackAlt,loading:'lazy'});
  const load=el('div',{class:'ogv-load',role:'progressbar','aria-valuemin':'0','aria-valuemax':'100'},'<b>0%</b>Loading the 3D model<i><span></span></i>');
  const card=el('div',{class:'ogv-card','aria-live':'polite'});
  const hint=el('div',{class:'ogv-hint'},'Drag to turn · tap a part');
  const dims=el('div',{class:'ogv-dims'});
  stage.append(canvas,dims,cubeC,home,eye,img,load,card,hint);

  // panel
  const sheetT=el('button',{class:'ogv-sheet-t',type:'button','aria-expanded':'false'},'Options');
  sheetT.onclick=()=>{const o=root.classList.toggle('open');sheetT.setAttribute('aria-expanded',o);};
  panel.append(sheetT, el('h3',{class:'og-out'},'build'));
  const sec=(label,cls='ogv-row')=>{const s=el('div',{class:'ogv-sec'}),r=el('div',{class:cls,role:'group','aria-label':label});s.append(el('span',{},label),r);panel.append(s);return r;};
  const state={size:'moderate',preset:'studio',on:new Set(PRESETS.studio.on),night:false,explode:false,power:false,dims:false};
  const sizeR=sec('Size','ogv-seg'), presetR=sec('Setup'), modR=sec('Modules','ogv-row ogv-mods'), viewR=sec('View');
  const btn=(parent,label,fn,extra={})=>{const b=el('button',{class:'ogv-b',type:'button',...extra},label);b.onclick=fn;parent.append(b);return b;};
  const sizeB=Object.entries(LAYOUTS).map(([k,v])=>btn(sizeR,v.label,()=>{state.size=k;rebuild();sync();},{'data-k':k}));
  const presetB=Object.entries(PRESETS).map(([k,v])=>btn(presetR,v.label,()=>{state.preset=k;state.on=new Set(v.on);sync();},{'data-k':k}));
  let DATA=null; const swatch=k=>{const pk={clips:'clip'}[k]||k;const s=DATA&&DATA.parts[pk]&&DATA.slots[DATA.parts[pk].slot];return s?s.hex:'#ccc';};
  const modB=KINDS.map(([k,l])=>{const b=btn(modR,'<i></i>'+l,()=>{state.on.has(k)?state.on.delete(k):state.on.add(k);state.preset=null;sync();},{'data-k':k});return b;});
  const viewB={night:btn(viewR,'Night',()=>{state.night=!state.night;sync();}),explode:btn(viewR,'Exploded',()=>{state.explode=!state.explode;sync();}),
    power:btn(viewR,'Power',()=>{state.power=!state.power;sync();}),dims:btn(viewR,'Dimensions',()=>{state.dims=!state.dims;sync();})};
  let apply=()=>{};
  function sync(){
    sizeB.forEach(b=>b.setAttribute('aria-pressed',b.dataset.k===state.size));
    presetB.forEach(b=>b.setAttribute('aria-pressed',b.dataset.k===state.preset));
    modB.forEach(b=>{b.setAttribute('aria-pressed',state.on.has(b.dataset.k));b.style.setProperty('--sw',swatch(b.dataset.k));});
    for(const [k,b] of Object.entries(viewB))b.setAttribute('aria-pressed',!!state[k]);
    stage.classList.toggle('night',state.night);
    apply();
  }
  let rebuild=()=>{};
  sync();

  /* ---------- three ---------- */
  let renderer;
  try{renderer=new THREE.WebGLRenderer({canvas,antialias:true,powerPreference:'high-performance'});}
  catch(e){root.classList.add('failed');return;}
  renderer.setPixelRatio(Math.min(devicePixelRatio,2));
  renderer.outputColorSpace=THREE.SRGBColorSpace;
  renderer.toneMapping=THREE.NoToneMapping;
  renderer.shadowMap.enabled=true; renderer.shadowMap.type=THREE.PCFSoftShadowMap;
  const scene=new THREE.Scene();
  const pmrem=new THREE.PMREMGenerator(renderer);
  scene.environment=pmrem.fromScene(new RoomEnvironment(renderer),0.04).texture;
  const DAY_BG=new THREE.Color('#FBF4EC'), NIGHT_BG=new THREE.Color('#0E1530');
  scene.background=DAY_BG.clone();
  const cam=new THREE.PerspectiveCamera(28,1,.05,60);
  const ctl=new OrbitControls(cam,canvas);
  ctl.enableDamping=true; ctl.enablePan=false; ctl.minPolarAngle=0.0001; ctl.maxPolarAngle=Math.PI/2-0.03; ctl.zoomSpeed=.6;
  const sun=new THREE.DirectionalLight('#FFDDB5',1.15); sun.castShadow=true; sun.shadow.mapSize.set(2048,2048); sun.shadow.bias=-0.0004; sun.shadow.normalBias=0.02; sun.shadow.radius=6;
  scene.add(sun,sun.target);
  const fill=new THREE.HemisphereLight('#FFF0DE','#D8CBBE',.3); scene.add(fill);
  const ground=new THREE.Mesh(new THREE.PlaneGeometry(40,40),new THREE.ShadowMaterial({opacity:.16})); ground.rotation.x=-Math.PI/2; ground.position.y=-0.022; ground.receiveShadow=true; scene.add(ground);
  const world=new THREE.Group(); world.rotation.x=-Math.PI/2; world.scale.setScalar(0.001); scene.add(world); // CAD mm Z-up -> metres Y-up
  const composer=new EffectComposer(renderer); composer.addPass(new RenderPass(scene,cam));
  const bloom=new UnrealBloomPass(new THREE.Vector2(256,256),.7,.45,1.0); composer.addPass(bloom); composer.addPass(new OutputPass());

  // load
  const setPct=p=>{p=Math.max(0,Math.min(100,Math.round(p)));load.querySelector('b').textContent=p+'%';load.querySelector('i span').style.width=p+'%';load.setAttribute('aria-valuenow',p);};
  let gltf;
  try{
    const [d,g]=await Promise.all([fetch(BASE+'og-data.json').then(r=>r.json()),
      new GLTFLoader().setMeshoptDecoder(MeshoptDecoder).loadAsync(BASE+'og-parts.glb',e=>setPct(100*e.loaded/(e.total||GLB_BYTES)))]);
    DATA=d; gltf=g; setPct(100);
  }catch(e){console.warn('overgrwth viewer unavailable',e);root.classList.add('failed');return;}
  sync();

  /* ---------- materials ---------- */
  const mats={};
  const physical=(hex,rough,metal,extra={})=>{const m=new THREE.MeshPhysicalMaterial({color:new THREE.Color(hex),roughness:rough,metalness:metal,envMapIntensity:.5,...extra});m.userData.env=m.envMapIntensity;return m;};
  for(const [k,p] of Object.entries(DATA.parts)){
    const s=DATA.slots[p.slot]; const m=physical(s.hex,s.roughness??.5,s.metallic??0);
    m.userData.env=m.envMapIntensity;
    if(k==='whiteboard'){m.clearcoat=.5;m.clearcoatRoughness=.1;m.envMapIntensity=.35;m.color.multiplyScalar(.9);m.userData.env=.35;}
    if(k==='softboard'){m.sheen=1;m.sheenColor=new THREE.Color('#9fb3e6');m.sheenRoughness=.8;}
    if(k==='frame'||k==='foot'||k==='powerfoot'||k==='connector'||k==='endcap'){m.clearcoat=.4;m.clearcoatRoughness=.35;}
    mats[k]=m;
  }
  mats.pegfinish=mats.pegboard; mats.planterx=mats.planter;
  const plantHex=DATA.slots.plant?.hex||'#4F8A3C';
  mats.leaf=physical(plantHex,.65,0,{side:THREE.DoubleSide}); mats.leaf2=physical(new THREE.Color(plantHex).offsetHSL(.02,.05,-.08),.7,0,{side:THREE.DoubleSide});
  mats.vine=physical('#5d7a3a',.8,0); mats.soil=physical('#3b2a20',1,0);
  mats.book=['#E9E2D6','#2A2A2A','#C9C2B6','#F2EEE8'].map(c=>physical(c,.8,0)); mats.mug=physical('#F4F1EC',.25,0,{clearcoat:.6}); mats.pot=physical('#C8BBA8',.85,0);
  const LIGHT_HEX={grow_led:'#FFD9E8',spot_lens:'#FFF3D6',clock_face:'#FFFAFA'};
  for(const [k,h] of Object.entries(LIGHT_HEX))mats[k]=physical('#ffffff',.3,0,{emissive:new THREE.Color(h),emissiveIntensity:0});
  const muted=physical('#D9D6D2',.6,0), ghost=physical('#C9CBD4',.5,0,{transparent:true,opacity:.22,depthWrite:false}), hi=physical(DATA.slots.hi?.hex||'#4569BE',.45,0);
  const powerMat=new THREE.MeshBasicMaterial({color:'#FBCB44',toneMapped:false});
  { // moving dashes along the power line
    const c=document.createElement('canvas');c.width=64;c.height=4;const x=c.getContext('2d');x.fillStyle='#FBCB44';x.fillRect(0,0,64,4);x.fillStyle='#fff6c8';x.fillRect(0,0,22,4);
    const t=new THREE.CanvasTexture(c);t.wrapS=t.wrapT=THREE.RepeatWrapping;t.colorSpace=THREE.SRGBColorSpace;powerMat.map=t;
  }

  /* ---------- part templates ---------- */
  const TPL={};
  gltf.scene.updateMatrixWorld(true);
  gltf.scene.traverse(o=>{if(o.name&&!TPL[o.name]){let m=null;o.traverse(c=>{if(!m&&c.isMesh)m=c;});if(m)TPL[o.name]=m;}});
  const SUB={grow:['grow_led'],spot:['spot_lens'],clock:['clock_face']};
  function part(key,partKey=key){ // returns Group holding the part (+ light faces) in native mm coords
    const g=new THREE.Group(); g.userData.part=partKey;
    for(const n of [key,...(SUB[key]||[])]){
      const t=TPL[n]; if(!t){console.warn('og: missing mesh',n);continue;}
      const m=new THREE.Mesh(t.geometry,mats[n]||mats[key]); m.matrix.copy(t.matrixWorld); m.matrixAutoUpdate=false;
      m.castShadow=true; m.receiveShadow=true; m.userData.base=m.material; m.userData.part=partKey; m.userData.sub=n; g.add(m);
    }
    return g;
  }
  const M4=new THREE.Matrix4(), RZ=new THREE.Matrix4(), RY=new THREE.Matrix4();
  const place=(o,x,y,z,rz=0,flip=false)=>{o.matrixAutoUpdate=false;RZ.makeRotationZ(THREE.MathUtils.degToRad(rz));RY.makeRotationY(flip?Math.PI:0);o.userData.M=new THREE.Matrix4().makeTranslation(x,y,z).multiply(RZ).multiply(RY);o.matrix.copy(o.userData.M);return o;};

  /* ---------- procedural props ---------- */
  const leafGeo=new THREE.SphereGeometry(1,10,6); leafGeo.scale(1,.18,.55);
  function leaves(points,scale=24){
    const im=new THREE.InstancedMesh(leafGeo,mats.leaf,points.length), d=new THREE.Object3D();
    points.forEach((p,i)=>{d.position.set(p[0],p[1],p[2]);d.rotation.set(p[3]||Math.random()*6,Math.random()*6,Math.random()*6);d.scale.setScalar((p[4]||1)*scale);d.updateMatrix();im.setMatrixAt(i,d.matrix);});
    im.castShadow=true; im.userData.part='plant'; return im;
  }
  let seed=1; const rnd=()=>((seed=(seed*16807)%2147483647)/2147483647);
  function vine(x,y,z0,z1){
    const g=new THREE.Group(), pts=[], turns=Math.max(1,(z1-z0)/320), r=R+9, ph=rnd()*6;
    for(let i=0;i<=80;i++){const t=i/80,a=ph+t*turns*Math.PI*2;pts.push(new THREE.Vector3(x+r*Math.cos(a),y+r*Math.sin(a),z0+(z1-z0)*t));}
    const tube=new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts),160,3.2,6),mats.vine); tube.castShadow=true; g.add(tube);
    const lp=[]; for(let i=2;i<80;i+=2){const t=i/80,a=ph+t*turns*Math.PI*2,rr=r+14+rnd()*10;lp.push([x+rr*Math.cos(a),y+rr*Math.sin(a),z0+(z1-z0)*t+rnd()*10,null,.7+rnd()*.6]);}
    lp.push([x,y,z1+18,null,1.1],[x+16,y+8,z1+8,null,.9]);
    g.add(leaves(lp,22)); g.userData.part='plant'; return g;
  }
  function plantBed(cx,cy,z){ // soil + foliage inside a planter tray
    const g=new THREE.Group(), soil=new THREE.Mesh(new THREE.BoxGeometry(490,490,10),mats.soil); soil.position.set(cx,cy,z+30+92); soil.receiveShadow=true; g.add(soil);
    const lp=[]; for(let c=0;c<7;c++){const bx=cx-170+rnd()*340,by=cy-170+rnd()*340,h=60+rnd()*120;for(let i=0;i<14;i++){const a=rnd()*6.28,r=rnd()*55;lp.push([bx+r*Math.cos(a),by+r*Math.sin(a),z+130+rnd()*h,null,.8+rnd()*.7]);}}
    g.add(leaves(lp,26)); g.userData.part='plant'; return g;
  }
  const PROP_W={books:150,mug:95,pot:150,controller:165,cds:150,boombox:430};
  const pm={dark:physical('#2A2A2A',.55,0),white:physical('#F2EFEA',.45,0),case:physical('#DCE3EA',.15,0,{transparent:true,opacity:.55}),disc:physical('#CFD4DA',.18,.9,{iridescence:1,iridescenceIOR:1.6}),grille:physical('#3A3A3A',.9,0),accent:physical('#D95942',.5,0),steel:physical('#BFC3C6',.3,.9)};
  const mesh=(geo,mat,x,y,z,rx=0,ry=0,rz=0)=>{const m=new THREE.Mesh(geo,mat);m.position.set(x,y,z);m.rotation.set(rx,ry,rz);m.castShadow=m.receiveShadow=true;return m;};
  const PROPS={
    books:(g,x,y,t)=>{let bx=x-70;[[30,230,170],[24,205,160],[36,245,180],[22,190,150]].forEach(([w,h,d],i)=>{g.add(mesh(new THREE.BoxGeometry(w,d,h),mats.book[i%4],bx+w/2,y+40,t+h/2));bx+=w+2;});
      g.add(mesh(new THREE.BoxGeometry(150,200,26),mats.book[1],x,y-80,t+13,0,0,.12));},
    mug:(g,x,y,t)=>{g.add(mesh(new THREE.CylinderGeometry(42,40,95,40),mats.mug,x,y-40,t+47.5,Math.PI/2));g.add(mesh(new THREE.TorusGeometry(24,7,10,24,Math.PI),mats.mug,x+42,y-40,t+47.5,0,Math.PI/2));},
    pot:(g,x,y,t)=>{g.add(mesh(new THREE.CylinderGeometry(70,55,120,40),mats.pot,x,y+20,t+60,Math.PI/2));const lp=[];for(let i=0;i<26;i++){const a=rnd()*6.28,r=rnd()*70;lp.push([x+r*Math.cos(a),y+20+r*Math.sin(a),t+130+rnd()*120,null,.9+rnd()*.6]);}g.add(leaves(lp,28));},
    controller:(g,x,y,t)=>{const c=new THREE.Group();c.add(mesh(new THREE.BoxGeometry(105,52,26),pm.dark,0,0,13));
      for(const sx of[-1,1]){c.add(mesh(new THREE.CapsuleGeometry(20,50,6,14),pm.dark,sx*48,-22,15,0,0,sx*.45));c.add(mesh(new THREE.CylinderGeometry(9,9,10,16),pm.grille,sx*24,8,30,Math.PI/2));}
      [[34,12],[44,2],[34,-8],[24,2]].forEach(([bx,by])=>c.add(mesh(new THREE.CylinderGeometry(4.5,4.5,6,12),pm.accent,bx,by,28,Math.PI/2)));
      c.position.set(x,y-50,t);c.rotation.z=.25;g.add(c);
      const c2=c.clone();c2.position.set(x+10,y+70,t);c2.rotation.z=-.4;c2.traverse(o=>{if(o.material===pm.dark)o.material=pm.white;});g.add(c2);},
    cds:(g,x,y,t)=>{for(let i=0;i<6;i++){g.add(mesh(new THREE.BoxGeometry(142,125,10),pm.case,x+(rnd()-.5)*8,y+(rnd()-.5)*8,t+5+i*10.5,0,0,(rnd()-.5)*.15));g.add(mesh(new THREE.CylinderGeometry(58,58,1.2,48),pm.disc,x,y,t+6+i*10.5,Math.PI/2));}
      g.add(mesh(new THREE.CylinderGeometry(60,60,1.2,48),pm.disc,x+20,y-95,t+1,Math.PI/2));},
    boombox:(g,x,y,t)=>{const b=new THREE.Group();b.add(mesh(new THREE.BoxGeometry(420,120,200),pm.dark,0,0,100));
      for(const sx of[-1,1]){b.add(mesh(new THREE.CylinderGeometry(62,62,8,40),pm.grille,sx*130,-62,95,0,0,0));b.add(mesh(new THREE.TorusGeometry(64,4,8,40),pm.steel,sx*130,-64,95,Math.PI/2));}
      b.add(mesh(new THREE.BoxGeometry(120,6,70),pm.white,0,-62,110));b.add(mesh(new THREE.BoxGeometry(110,4,12),pm.accent,0,-63,168));
      b.add(mesh(new THREE.TorusGeometry(120,9,10,32,Math.PI),pm.steel,0,0,200,Math.PI/2,0,0));
      for(let i=0;i<5;i++)b.add(mesh(new THREE.BoxGeometry(18,10,10),pm.steel,-60+i*30,-20,204));
      b.position.set(x,y-20,t);g.add(b);},
  };
  function shelfProps(list,cx,cy,z){
    const g=new THREE.Group(), top=z+30+19, total=list.reduce((a,k)=>a+PROP_W[k],0)+(list.length-1)*20;let x=cx-total/2;
    for(const k of list){PROPS[k](g,x+PROP_W[k]/2,cy,top);x+=PROP_W[k]+20;}
    g.userData.part='prop'; return g;
  }

  /* ---------- light sources: halos and beams (night only) ---------- */
  const fxMats=[];
  const gradTex=(stops,w=256,h=1,radial=false)=>{const c=document.createElement('canvas');c.width=w;c.height=radial?w:h;const x=c.getContext('2d');
    const g=radial?x.createRadialGradient(w/2,w/2,0,w/2,w/2,w/2):x.createLinearGradient(0,0,0,h);stops.forEach(([o,col])=>g.addColorStop(o,col));x.fillStyle=g;x.fillRect(0,0,w,radial?w:h);
    const t=new THREE.CanvasTexture(c);t.colorSpace=THREE.SRGBColorSpace;return t;};
  const haloTex=gradTex([[0,'rgba(255,255,255,1)'],[.25,'rgba(255,255,255,.55)'],[1,'rgba(255,255,255,0)']],128,1,true);
  const beamAlpha=gradTex([[0,'#fff'],[.45,'#2a2a2a'],[1,'#000']],2,256);
  const fxMat=(color,max,opts={})=>{const m=new (opts.sprite?THREE.SpriteMaterial:THREE.MeshBasicMaterial)({color,transparent:true,opacity:0,depthWrite:false,blending:THREE.AdditiveBlending,toneMapped:false,...(opts.sprite?{map:haloTex}:{alphaMap:beamAlpha,side:THREE.DoubleSide})});m.userData.max=max;fxMats.push(m);return m;};
  const M_HALO_SPOT=fxMat('#FFF1D6',1,{sprite:true}), M_HALO_GROW=fxMat('#FFD3E6',.8,{sprite:true}), M_BEAM_SPOT=fxMat('#FFE9C4',.22), M_BEAM_GROW=fxMat('#FFC9E0',.16);
  function lightFx(kind){ // in the attachment's native mm frame
    const g=new THREE.Group();g.userData.fx=true;
    const fx=o=>{o.userData.fx=true;o.raycast=()=>{};o.renderOrder=5;g.add(o);return o;};
    if(kind==='spot'){
      const h=fx(new THREE.Sprite(M_HALO_SPOT));h.position.set(0,-62,194);h.scale.set(170,170,1);
      const dir=new THREE.Vector3(0,-1,-.55).normalize(),L=720,cone=new THREE.CylinderGeometry(24,260,L,40,1,true);
      const b=fx(new THREE.Mesh(cone,M_BEAM_SPOT));b.quaternion.setFromUnitVectors(new THREE.Vector3(0,1,0),dir.clone().negate());b.position.set(0,-58,194).addScaledVector(dir,L/2);
    }
    if(kind==='grow'){
      const h=fx(new THREE.Sprite(M_HALO_GROW));h.position.set(0,0,112);h.scale.set(420,420,1);
      const L=520,b=fx(new THREE.Mesh(new THREE.CylinderGeometry(150,430,L,48,1,true),M_BEAM_GROW));b.rotation.x=Math.PI/2;b.position.set(0,0,118-L/2);
    }
    return g;
  }
  function growPlant(){ // small plant sitting in the grow light's centre bowl
    const g=new THREE.Group(),soil=new THREE.Mesh(new THREE.CylinderGeometry(66,60,10,32),mats.soil);soil.rotation.x=Math.PI/2;soil.position.z=96;g.add(soil);
    const lp=[];for(let i=0;i<34;i++){const a=rnd()*6.28,r=rnd()*58;lp.push([r*Math.cos(a),r*Math.sin(a),112+rnd()*150,null,.8+rnd()*.7]);}
    g.add(leaves(lp,26));
    for(let k=0;k<5;k++){const a=k*1.25+rnd(),pts=[];for(let i=0;i<8;i++){const t=i/7;pts.push(new THREE.Vector3((60+t*120)*Math.cos(a),(60+t*120)*Math.sin(a),120-t*t*260));}
      const tr=new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts),24,2.4,5),mats.vine);g.add(tr);
      const tl=[];for(let i=1;i<8;i++){const p=pts[i];tl.push([p.x+rnd()*14-7,p.y+rnd()*14-7,p.z,null,.6+rnd()*.4]);}g.add(leaves(tl,20));}
    g.userData.part='plant';return g;
  }
  /* ---------- floor grid on the 21 in system grid ---------- */
  const GRID_N=16, gridTex=(()=>{const c=document.createElement('canvas');c.width=c.height=2048;const x=c.getContext('2d'),st=2048/GRID_N;
    x.strokeStyle='rgba(69,105,190,.55)';x.lineWidth=3;for(let i=0;i<=GRID_N;i++){x.beginPath();x.moveTo(i*st,0);x.lineTo(i*st,2048);x.moveTo(0,i*st);x.lineTo(2048,i*st);x.stroke();}
    x.fillStyle='rgba(69,105,190,.7)';for(let i=0;i<=GRID_N;i++)for(let j=0;j<=GRID_N;j++){x.fillRect(i*st-5,j*st-5,10,10);}
    x.globalCompositeOperation='destination-in';const g=x.createRadialGradient(1024,1024,250,1024,1024,1024);g.addColorStop(0,'#000');g.addColorStop(1,'rgba(0,0,0,0)');x.fillStyle=g;x.fillRect(0,0,2048,2048);
    const t=new THREE.CanvasTexture(c);t.colorSpace=THREE.SRGBColorSpace;t.anisotropy=8;return t;})();
  const gridMat=new THREE.MeshBasicMaterial({map:gridTex,transparent:true,depthWrite:false,toneMapped:false,opacity:.6});
  const grid=new THREE.Mesh(new THREE.PlaneGeometry(GRID_N*G,GRID_N*G),gridMat);grid.position.z=-21.5;grid.renderOrder=-1;grid.raycast=()=>{};world.add(grid);
  /* ---------- managed power cables ---------- */
  const cableMat=physical('#232323',.55,0), tieMat=physical('#141414',.4,0), stripMat=physical('#2B2B2B',.5,0), switchMat=physical('#D95942',.4,0,{emissive:new THREE.Color('#D95942'),emissiveIntensity:.3});
  function cables(stacks,box){
    const g=new THREE.Group(), Z=-18.5, back=box.y1+150, sx=box.x0-260, n=stacks.length;
    const smooth=(pts)=>{const out=[];pts.forEach((p,i)=>{if(i===0||i===pts.length-1){out.push(p);return;}const a=pts[i-1],b=pts[i+1],r=30;
      const da=p.clone().sub(a).normalize(),db=b.clone().sub(p).normalize();out.push(p.clone().addScaledVector(da,-r),p.clone().addScaledVector(da,-r*.3).addScaledVector(db,r*.3),p.clone().addScaledVector(db,r));});return out;};
    stacks.forEach((s,ci)=>{const A=s.A,V=(x,y,z=Z)=>new THREE.Vector3(x,y,z),mx=A.x+G/2+ci*9,by=back+ci*9;
      const pts=smooth([V(A.x,A.y+180,-11),V(A.x,A.y+225),V(mx,A.y+225),V(mx,by),V(sx+150,by)]);
      const c=new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts,false,'centripetal'),Math.round(pts.length*14),3.5,8),cableMat);c.castShadow=true;g.add(c);
      const plug=new THREE.Mesh(new THREE.CylinderGeometry(5.5,5.5,26,16),cableMat);plug.position.set(A.x,A.y+190,-11);g.add(plug);});
    const xs=stacks.map((s,ci)=>s.A.x+G/2+ci*9), xmax=Math.max(...xs);
    for(let x=sx+190;x<xmax-20;x+=200){const k=xs.filter(v=>v>x).length;if(!k)continue;const t=new THREE.Mesh(new THREE.TorusGeometry(1,.16,6,20),tieMat);
      t.rotation.y=Math.PI/2;t.scale.set(7.5,(k-1)*4.5+7.5,7.5);t.position.set(x,back+(k-1)*4.5,Z);g.add(t);}
    const strip=new THREE.Mesh(new THREE.BoxGeometry(300,70,42),stripMat);strip.position.set(sx,back+(n-1)*4.5,-1);strip.castShadow=true;g.add(strip);
    const sw=new THREE.Mesh(new THREE.BoxGeometry(26,18,6),switchMat);sw.position.set(sx-110,back+(n-1)*4.5,22);g.add(sw);
    const wall=new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3([new THREE.Vector3(sx-150,back+(n-1)*4.5,Z),new THREE.Vector3(sx-200,back+(n-1)*4.5,Z),new THREE.Vector3(sx-200,back+400,Z)]),20,4,8),cableMat);g.add(wall);
    g.userData.part='prop';return g;
  }
  /* ---------- scene assembly ---------- */
  let firstFit=true, items=[], sol=null, lights=[], powerLines=null;
  const center=new THREE.Vector3();
  function add(obj,info){obj.userData.info=info;world.add(obj);items.push({obj,...info,vis:0,want:1});return obj;}
  rebuild=()=>{
    for(const it of items)world.remove(it.obj); items=[]; lights.forEach(l=>{scene.remove(l);scene.remove(l.target);}); lights=[];
    if(powerLines){world.remove(powerLines);powerLines=null;}
    seed=7; sol=solve(LAYOUTS[state.size]); const {posts,frames,mods,tops,box,vines}=sol;
    center.set((box.x0+box.x1)/2,(box.y0+box.y1)/2,0);
    const radial=(x,y)=>[(x-center.x)*.35,(y-center.y)*.35];
    const EX=230;
    for(const f of frames){const o=place(part('frame'),f.x,f.y,f.z,0,f.flip);const [dx,dy]=radial(f.x+(f.flip?-G/2:G/2),f.y);add(o,{kind:'frame',ex:[dx,dy,f.k*EX]});}
    for(const p of posts.values()){
      const pw=p.stack.powered&&p===p.stack.A;
      const [dx,dy]=radial(p.x,p.y);
      add(place(part(pw?'powerfoot':'foot'),p.x,p.y,0,pw?90:0),{kind:'foot',ex:[dx,dy,-160]});
      for(const [z,k] of p.joints)add(place(part('connector'),p.x,p.y,z),{kind:'connector',onlyEx:true,ex:[dx,dy,k*EX+EX/2]});
    }
    for(const t of tops){
      const p=t.p,[dx,dy]=radial(p.x,p.y),K=p.frameAt.length-1, rz=t.k==='spot'?(p.x<=center.x?35:-35):t.k==='clock'?180+(p.x<=center.x?35:-35):0;
      add(place(part('endcap'),p.x,p.y,p.top),{kind:'endcap',cap:t.k,ex:[dx,dy,K*EX+150]});
      if(t.k){const o=place(part(t.k),p.x,p.y,p.top,rz);add(o,{kind:t.k,ex:[dx,dy,K*EX+260]});
        if(t.k==='spot'||t.k==='grow')o.add(lightFx(t.k));
        if(t.k==='grow')o.add(growPlant());
        if(t.k==='grow'){const L=new THREE.SpotLight('#FFD9E8',0,2.2,1.1,.6,1.2);L.userData={owner:o,dir:[0,0,-1],z:120};lights.push(L);}
        if(t.k==='spot'){const L=new THREE.SpotLight('#FFF0D0',0,3.5,.45,.5,1.4);L.userData={owner:o,dir:[0,-1,-.55],z:194,y:-56};lights.push(L);}}
    }
    for(const m of mods){
      const k=frameIndexAt(m.ps[0],m.z);
      if(m.type==='bay'){
        const [dx,dy]=radial(m.cx,m.cy);
        const g=new THREE.Group(); place(g,0,0,0);
        g.add(place(part(m.k==='planter'?'planter':'shelf'),m.cx,m.cy,m.z+30));
        if(m.k==='planter'){g.add(place(part('planterx','planter'),m.cx,m.cy,m.z+30)); g.add(plantBed(m.cx,m.cy,m.z));}
        add(g,{kind:m.k,ex:[dx,dy,k*EX+140],props:m.props});
        if(m.props)add(shelfProps(m.props,m.cx,m.cy,m.z),{kind:m.k,prop:true,ex:[dx,dy,k*EX+140]});
        for(const p of m.ps){const [px,py]=radial(p.x,p.y);add(place(part('clamp'),p.x,p.y,m.z,m.cy>p.y?0:180),{kind:m.k,ex:[px,py-(m.cy>p.y?-1:1)*0,k*EX+40]});}
      }else{
        const [a,b]=m.ps, mx=(a.x+b.x)/2, my=(a.y+b.y)/2, s=m.s, rz=m.alongX?(s>0?0:180):(s>0?-90:90);
        const off=m.alongX?[0,s*52]:[s*52,0], push=m.alongX?[0,s*200]:[s*200,0], [dx,dy]=radial(mx,my);
        add(place(part(m.k),mx+off[0],my+off[1],m.z+15,rz),{kind:m.k,ex:[dx+push[0],dy+push[1],k*EX+60]});
        for(const p of m.ps)for(const dz of [0,305]){const [px,py]=radial(p.x,p.y);add(place(part('clamp'),p.x,p.y,m.z+dz,rz),{kind:m.k,ex:[px+push[0]*.4,py+push[1]*.4,k*EX+40]});}
      }
    }
    for(const v of vines){
      const p=v.p,[dx,dy]=radial(p.x,p.y);
      add(vine(p.x,p.y,v.z0,v.z1),{kind:'clips',vineOf:true,ex:[dx,dy,0]});
      for(let z=v.z0+90;z<v.z1-40;z+=190){const k=frameIndexAt(p,z);add(place(part('clip'),p.x,p.y,z,-90),{kind:'clips',ex:[dx,dy,k*EX]});}
    }
    // power path: through each powered stack (foot, both posts, every crossbar)
    powerLines=new THREE.Group();
    const seen=new Set();
    for(const p of posts.values()){const s=p.stack;if(!s.powered||seen.has(s))continue;seen.add(s);
      const seg=(pts)=>{const c=new THREE.CurvePath();for(let i=1;i<pts.length;i++)c.add(new THREE.LineCurve3(new THREE.Vector3(...pts[i-1]),new THREE.Vector3(...pts[i])));
        const len=c.getLength(),m=new THREE.Mesh(new THREE.TubeGeometry(c,Math.max(8,Math.round(len/40)),7,8),powerMat);m.material.map.repeat.set(len/120,1);powerLines.add(m);};
      seg([[s.A.x+150,s.A.y,-10],[s.A.x,s.A.y,-10],[s.A.x,s.A.y,s.A.top]]); seg([[s.B.x,s.B.y,0],[s.B.x,s.B.y,s.B.top]]);
      for(const t of s.A.tees)seg([[s.A.x,s.A.y,t],[s.B.x,s.B.y,t]]);
    }
    world.add(powerLines);
    {const ps=[...new Set([...posts.values()].map(p=>p.stack))].filter(s=>s.powered).sort((a,b)=>a.A.x-b.A.x||a.A.y-b.A.y);if(ps.length){const c=cables(ps,box);place(c,0,0,0);add(c,{kind:'cable',cable:true});}}
    {const gx=Math.round(center.x/G)*G,gy=Math.round(center.y/G)*G;grid.position.x=gx;grid.position.y=gy;}
    lights.forEach(l=>{scene.add(l,l.target);});
    fitView(firstFit); firstFit=false; dimsBuild(); apply(true);
  };

  /* ---------- state -> scene ---------- */
  let exT=0, exWant=0, nightT=0, picked=null, awake=30; const wake=(n=30)=>{awake=Math.max(awake,n);};
  apply=(instant)=>{
    if(!sol)return;
    for(const it of items){
      let v=1;
      if(it.kind==='endcap')v=it.cap&&state.on.has(it.cap)?0:1;
      else if(!['frame','foot','connector','cable'].includes(it.kind))v=state.on.has(it.kind)?1:0;
      if(it.onlyEx)v=state.explode?1:0;
      if((it.vineOf||it.prop)&&(state.explode||state.power))v=0;
      if(it.cable&&state.explode)v=0;
      it.want=v; if(instant===true)it.vis=v;
    }
    exWant=state.explode?1:0; wake();
    const pw=state.power;
    for(const it of items)it.obj.traverse(m=>{if((!m.isMesh&&!m.isInstancedMesh)||m.userData.fx||(m.parent&&m.parent.userData.fx))return;const base=m.userData.base||m.material;m.userData.base=base;
      let mat=base;
      if(pw){const k=m.userData.part;mat=(k==='frame'||k==='connector')?ghost:(POWERED.has(k)||m.userData.sub==='powerfoot')?hi:(m.isInstancedMesh||k==='plant'||k==='prop')?base:muted;}
      m.material=mat;});
    if(powerLines)powerLines.visible=pw;
    dims.style.display=state.dims?'':'none'; if(dimLines)dimLines.visible=state.dims;
    if(picked&&!items.some(i=>i.obj===picked.obj&&i.want))hideCard();
  };

  /* ---------- camera ---------- */
  let camAnim=null;
  function fitView(reset){
    const {box}=sol, w=box.x1-box.x0, d=box.y1-box.y0, h=box.z1, rad=Math.hypot(w,d,h)/2/1000;
    const tgt=new THREE.Vector3(center.x/1000,h/2000,-center.y/1000);
    const dist=rad/Math.sin(THREE.MathUtils.degToRad(cam.fov/2))*(cam.aspect<1?1.45:1.18);
    ctl.minDistance=dist*.35; ctl.maxDistance=dist*1.8;
    const dir=reset?(reset==='eye'?new THREE.Vector3(.55,.12,1):new THREE.Vector3(-.8,.95,1)).normalize():cam.position.clone().sub(ctl.target).normalize();
    animateCam(tgt.clone().add(dir.multiplyScalar(dist)),tgt,reset?0:500);
    sun.position.set(tgt.x+2.2,4.5,tgt.z+1.6); sun.target.position.copy(tgt);
    const sc=sun.shadow.camera,s=rad*1.6;sc.left=-s;sc.right=s;sc.top=s;sc.bottom=-s;sc.near=.5;sc.far=14;sc.updateProjectionMatrix();
  }
  function animateCam(pos,tgt,ms=600){
    if(!ms){cam.position.copy(pos);ctl.target.copy(tgt);ctl.update();return;}
    camAnim={p0:cam.position.clone(),t0:ctl.target.clone(),p1:pos,t1:tgt,s:performance.now(),ms};
  }
  function lookFrom(dir){
    const d=cam.position.distanceTo(ctl.target);dir=dir.clone().normalize();
    if(Math.abs(dir.y)>.999)dir.set(0,.9999,.014).normalize();
    if(dir.y<0)dir.y=0.03;
    animateCam(ctl.target.clone().add(dir.multiplyScalar(d)),ctl.target.clone());
  }
  home.onclick=()=>fitView(true); eye.onclick=()=>fitView('eye');

  /* ---------- view cube ---------- */
  const cubeR=new THREE.WebGLRenderer({canvas:cubeC,antialias:true,alpha:true}); cubeR.setPixelRatio(Math.min(devicePixelRatio,2));
  const cubeS=new THREE.Scene(), cubeCam=new THREE.OrthographicCamera(-1.5,1.5,1.5,-1.5,.1,10); cubeCam.position.set(0,0,4);
  const faceTex=(t)=>{const c=document.createElement('canvas');c.width=c.height=128;/*face label*/const x=c.getContext('2d');x.fillStyle='#FFFAFA';x.fillRect(0,0,128,128);x.strokeStyle='#4569BE';x.lineWidth=6;x.strokeRect(3,3,122,122);
    x.fillStyle='#1F2F5C';x.font='700 21px Instrument Sans, system-ui, sans-serif';x.textAlign='center';x.textBaseline='middle';x.fillText(t,64,66);const tx=new THREE.CanvasTexture(c);tx.colorSpace=THREE.SRGBColorSpace;return tx;};
  const LABEL={'1,0,0':'RIGHT','-1,0,0':'LEFT','0,1,0':'TOP','0,-1,0':'BOTTOM','0,0,1':'FRONT','0,0,-1':'BACK'};
  const cube=new THREE.Group(), pieces=[], CH=.8, CS=.26, seg=d=>d<0?[-CH,-CH+CS]:d>0?[CH-CS,CH]:[-CH+CS,CH-CS];
  const EDGE='#C7D2EE', CORNER='#A9B9E6', HOVER='#FBCB44';
  for(const dx of[-1,0,1])for(const dy of[-1,0,1])for(const dz of[-1,0,1]){if(!dx&&!dy&&!dz)continue;
    const [x0,x1]=seg(dx),[y0,y1]=seg(dy),[z0,z1]=seg(dz),key=[dx,dy,dz].join(','),nz=[dx,dy,dz].filter(Boolean).length;
    const mat=nz===1?new THREE.MeshBasicMaterial({map:faceTex(LABEL[key])}):new THREE.MeshBasicMaterial({color:nz===2?EDGE:CORNER});
    const m=new THREE.Mesh(new THREE.BoxGeometry(x1-x0,y1-y0,z1-z0),mat);m.position.set((x0+x1)/2,(y0+y1)/2,(z0+z1)/2);m.userData={d:[dx,dy,dz],base:mat.color.clone()};
    cube.add(m);pieces.push(m);}
  cube.add(new THREE.LineSegments(new THREE.EdgesGeometry(new THREE.BoxGeometry(CH*2,CH*2,CH*2)),new THREE.LineBasicMaterial({color:'#4569BE'})));
  cubeS.add(cube);
  const cubeRay=new THREE.Raycaster(); let hov=null;
  const cubeHit=e=>{const r=cubeC.getBoundingClientRect();cubeRay.setFromCamera(new THREE.Vector2((e.clientX-r.left)/r.width*2-1,-(e.clientY-r.top)/r.height*2+1),cubeCam);return cubeRay.intersectObjects(pieces)[0]?.object||null;};
  const setHov=m=>{if(hov===m)return;if(hov)hov.material.color.copy(hov.userData.base);hov=m;if(m)m.material.color.set(HOVER);cubeC.title=m?(m.userData.d.filter(Boolean).length===3?'Isometric view':m.userData.d.filter(Boolean).length===2?'Edge view':LABEL[m.userData.d.join(',')].toLowerCase()+' view'):'';wake(2);};
  cubeC.addEventListener('pointermove',e=>setHov(cubeHit(e)));cubeC.addEventListener('pointerleave',()=>setHov(null));
  cubeC.addEventListener('click',e=>{const m=cubeHit(e);if(m)lookFrom(new THREE.Vector3(...m.userData.d));});

  /* ---------- picking + card ---------- */
  const ray=new THREE.Raycaster(); let down=null;
  canvas.addEventListener('pointerdown',e=>{down=[e.clientX,e.clientY];});
  canvas.addEventListener('pointerup',e=>{if(!down||Math.hypot(e.clientX-down[0],e.clientY-down[1])>6)return;down=null;
    const r=canvas.getBoundingClientRect();ray.setFromCamera(new THREE.Vector2((e.clientX-r.left)/r.width*2-1,-(e.clientY-r.top)/r.height*2+1),cam);
    const hits=ray.intersectObjects(items.filter(i=>i.obj.visible).map(i=>i.obj),true).filter(h=>h.object.visible&&h.object.userData.part&&DATA.parts[h.object.userData.part]);
    if(!hits.length){hideCard();return;}
    const o=hits[0].object;let it=items.find(i=>{let f=false;i.obj.traverse(c=>{if(c===o)f=true;});return f;});
    showCard(o.userData.part,it);});
  function showCard(k,it){
    const p=DATA.parts[k],s=DATA.slots[p.slot];
    card.innerHTML=`<button type="button" aria-label="Close">×</button><h4 style="--sw:${s.hex}"><i></i>${p.name}</h4><small>${p.id}</small>${p.desc}<dl>
      <dt>Material</dt><dd>${s.material||'-'}</dd><dt>Finish</dt><dd>${s.finish||'-'}</dd>${s.spec?`<dt>Spec</dt><dd>${s.spec}</dd>`:''}<dt>Colour</dt><dd>${s.hex}</dd></dl>`;
    card.querySelector('button').onclick=hideCard; card.classList.add('on'); wake();
    if(picked)picked.obj.traverse(m=>{if(m.isMesh&&m.userData.hl){m.material=m.userData.hl;delete m.userData.hl;}});
    picked=it||null;
    if(picked)picked.obj.traverse(m=>{if(m.isMesh&&m.userData.part===k){m.userData.hl=m.material;const h=m.material.clone();h.emissive=new THREE.Color('#FBCB44');h.emissiveIntensity=.35;m.material=h;}});
  }
  function hideCard(){wake();card.classList.remove('on');if(picked)picked.obj.traverse(m=>{if(m.isMesh&&m.userData.hl){m.material=m.userData.hl;delete m.userData.hl;}});picked=null;}

  /* ---------- dimensions ---------- */
  let dimLines=null, dimLabels=[];
  function dimsBuild(){
    if(dimLines)world.remove(dimLines); dims.innerHTML=''; dimLabels=[];
    const {box,posts}=sol, g=new THREE.Group(), lm=new THREE.LineBasicMaterial({color:'#1F2F5C'}), gm=new THREE.LineBasicMaterial({color:'#4569BE',transparent:true,opacity:.45});
    const line=(pts,m=lm)=>{g.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints(pts.map(p=>new THREE.Vector3(...p))),m));};
    const xs=[...new Set([...posts.values()].map(p=>p.x))].sort((a,b)=>a-b), ys=[...new Set([...posts.values()].map(p=>p.y))].sort((a,b)=>a-b);
    for(let x=xs[0]-G;x<=xs.at(-1)+G+1;x+=G)line([[x,ys[0]-G,-21],[x,ys.at(-1)+G,-21]],gm);
    for(let y=ys[0]-G;y<=ys.at(-1)+G+1;y+=G)line([[xs[0]-G,y,-21],[xs.at(-1)+G,y,-21]],gm);
    const o=120, fy=box.y0-o, rx=box.x1+o;
    line([[box.x0,fy,-21],[box.x1,fy,-21]]); line([[box.x0,fy+30,-21],[box.x0,fy-30,-21]]); line([[box.x1,fy+30,-21],[box.x1,fy-30,-21]]);
    line([[rx,box.y0,-21],[rx,box.y1,-21]]); line([[rx-30,box.y0,-21],[rx+30,box.y0,-21]]); line([[rx-30,box.y1,-21],[rx+30,box.y1,-21]]);
    line([[box.x0-o,box.y0,-21],[box.x0-o,box.y0,box.z1]]); line([[box.x0-o-30,box.y0,box.z1],[box.x0-o+30,box.y0,box.z1]]);
    const lab=(t,p)=>{const s=el('span',{},t);dims.append(s);dimLabels.push([s,new THREE.Vector3(...p)]);};
    const f=v=>`${(v/25.4).toFixed(0)} in · ${Math.round(v)} mm`;
    lab('W '+f(box.x1-box.x0),[(box.x0+box.x1)/2,fy,-21]); lab('D '+f(box.y1-box.y0),[rx,(box.y0+box.y1)/2,-21]); lab('H '+f(box.z1+22),[box.x0-o,box.y0,box.z1/2]);
    lab('grid 21 in',[xs[0]-G/2,ys[0]-G/2,-21]);
    dimLines=g; world.add(g); g.visible=state.dims;
  }
  const tmpV=new THREE.Vector3();
  function dimsUpdate(){if(!state.dims)return;const w=canvas.clientWidth,h=canvas.clientHeight;
    for(const [s,p] of dimLabels){tmpV.copy(p).applyMatrix4(world.matrixWorld).project(cam);s.style.left=((tmpV.x+1)/2*w)+'px';s.style.top=((1-tmpV.y)/2*h)+'px';s.style.display=tmpV.z<1?'':'none';}}

  /* ---------- loop ---------- */
  const fit=()=>{wake();const w=canvas.clientWidth,h=canvas.clientHeight;if(!w||!h)return;renderer.setSize(w,h,false);composer.setSize(w,h);cam.aspect=w/h;cam.updateProjectionMatrix();cubeR.setSize(cubeC.clientWidth,cubeC.clientHeight,false);};
  new ResizeObserver(fit).observe(stage); fit();
  rebuild(); root.classList.add('ready');
  let vis=true; new IntersectionObserver(e=>{vis=e[0].isIntersecting;wake();}).observe(stage);
  ctl.addEventListener('change',()=>wake(2));
  const reduce=matchMedia('(prefers-reduced-motion: reduce)').matches;
  let last=performance.now();
  const tmpM=new THREE.Matrix4(), q=new THREE.Quaternion();
  renderer.setAnimationLoop(now=>{
    const dt=Math.min(.25,(now-last)/1000); last=now; if(!vis)return;
    const busy=camAnim||state.power||Math.abs(exWant-exT)>.001||Math.abs((state.night?1:0)-nightT)>.001||items.some(i=>i.vis!==i.want);
    if(!busy&&awake<=0){ctl.update();return;} awake--;
    if(camAnim){const t=Math.min(1,(now-camAnim.s)/camAnim.ms),e=t<.5?4*t*t*t:1-Math.pow(-2*t+2,3)/2;
      cam.position.lerpVectors(camAnim.p0,camAnim.p1,e);ctl.target.lerpVectors(camAnim.t0,camAnim.t1,e);if(t>=1)camAnim=null;}
    ctl.update();
    const k=reduce?1:Math.min(1,dt*7);
    exT+=(exWant-exT)*k; nightT+=((state.night?1:0)-nightT)*Math.min(1,dt*3);
    if(Math.abs(exWant-exT)<.001)exT=exWant; if(Math.abs((state.night?1:0)-nightT)<.001)nightT=state.night?1:0;
    for(const it of items){
      it.vis+=(it.want-it.vis)*k; if(Math.abs(it.want-it.vis)<.002)it.vis=it.want;
      const s=it.vis<.001?0:.0001+.9999*(1-Math.pow(1-it.vis,3));
      it.obj.visible=s>0;
      const M=it.obj.userData.M; if(!M)continue;
      const e=it.ex||[0,0,0], c=it.onlyEx?1:exT;
      tmpM.copy(M); tmpM.elements[12]+=e[0]*c; tmpM.elements[13]+=e[1]*c; tmpM.elements[14]+=e[2]*c;
      if(s<1){const sc=new THREE.Matrix4().makeScale(s,s,s);tmpM.multiply(sc);}
      it.obj.matrix.copy(tmpM);
    }
    // day / night
    scene.background.copy(DAY_BG).lerp(NIGHT_BG,nightT);
    sun.intensity=1.15*(1-nightT)+.04*nightT; fill.intensity=.3*(1-nightT)+.05*nightT; gridMat.opacity=.6-.4*nightT; for(const m of fxMats)m.opacity=m.userData.max*nightT; ground.material.opacity=.16*(1-nightT)+.25*nightT;
    for(const m of Object.values(mats))if(m&&m.isMaterial&&m.envMapIntensity!==undefined&&!m.userData.light)m.envMapIntensity=(m.userData.env??.5)*(1-.85*nightT);
    for(const [n,i] of [['grow_led',2.2],['spot_lens',5],['clock_face',.9]])mats[n].emissiveIntensity=i*nightT;
    for(const L of lights){const o=L.userData.owner,on=o.visible;L.intensity=on?nightT*(L.userData.dir[1]?10:3.5):0;
      o.updateMatrixWorld();const p=new THREE.Vector3(0,L.userData.y||0,L.userData.z).applyMatrix4(o.matrixWorld);L.position.copy(p);
      const d=new THREE.Vector3(...L.userData.dir).transformDirection(o.matrixWorld);L.target.position.copy(p).add(d);L.target.updateMatrixWorld();}
    bloom.strength=.45*nightT; bloom.enabled=nightT>.01;
    if(powerMat.map&&state.power)powerMat.map.offset.x-=dt*.8;
    if(bloom.enabled)composer.render(); else renderer.render(scene,cam);
    // cube follows the camera
    q.copy(cam.quaternion).invert(); cube.quaternion.copy(q); cubeR.render(cubeS,cubeCam);
    dimsUpdate();
  });
  window.__ogv={state,sync,rebuild,items:()=>items.length,renderer,sol:()=>sol};
  return {state,sync,rebuild};
}
