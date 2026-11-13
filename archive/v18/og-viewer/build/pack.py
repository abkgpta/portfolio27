import numpy as np, trimesh, glob, os
SPLIT={'grow':{i:'grow_led' for i in range(366,372)},'spot':{i:'spot_lens' for i in range(401,406)},'clock':{379:'clock_face'}}  # grow: LED band solid, spot: lens disc solid
sc=trimesh.Scene()
def add(name,V,N,F):
    used=np.unique(F); remap=-np.ones(len(V),np.int64); remap[used]=np.arange(len(used))
    m=trimesh.Trimesh(V[used],remap[F],vertex_normals=N[used],process=False)
    m.visual=trimesh.visual.ColorVisuals(m)
    sc.add_geometry(m,node_name=name,geom_name=name); print(name,len(m.faces))
for f in sorted(glob.glob('build/*.npz')):
    k=os.path.basename(f)[:-4]; d=np.load(f); V,N,F=d['V'],d['N'],d['F']; FI=d['FI'] if 'FI' in d.files else np.zeros(len(F),np.int32)
    if k=='panels':
        cx=V[F].mean(1)[:,0]
        for nm,(a,b) in {'whiteboard':(-300,300),'pegfinish':(300,900),'softboard':(900,1500)}.items():
            sel=(cx>a)&(cx<b); Fs=F[sel]; Vs=V.copy(); Vs[:,0]-= (a+b)/2 if nm!='whiteboard' else 0
            add(nm,Vs,N,Fs)
        continue
    sp=SPLIT.get(k,{})
    mask=np.isin(FI,list(sp))
    for nm in sorted(set(sp.values())): add(nm,V,N,F[np.isin(FI,[i for i,n in sp.items() if n==nm])])
    add(k,V,N,F[~mask])
sc.export('build/og-parts-raw.glb')
print(os.path.getsize('build/og-parts-raw.glb')/1e6,'MB')
