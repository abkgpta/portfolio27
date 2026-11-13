import sys, numpy as np, trimesh, build123d as b
from OCP.BRepMesh import BRepMesh_IncrementalMesh
from OCP.BRep import BRep_Tool
from OCP.TopLoc import TopLoc_Location
from OCP.BRepLib import BRepLib_ToolTriangulatedShape
from OCP.TopAbs import TopAbs_REVERSED
C='/mnt/project-files/overgrwth/cad/'
P={ # key: (step, linear tol mm, crop x-range or None)
 'frame':('01_frame/H-frame/OG-FRM-001_H-frame_v2.0.step',0.5,None),
 'connector':('02_connectors/OG-CON-001_frame-connector_v2.0.step',0.4,None),
 'endcap':('02_connectors/OG-CON-002_end-cap_v2.1.step',0.4,None),
 'foot':('02_connectors/OG-CON-003_floor-foot_v2.0.step',0.5,None),
 'powerfoot':('02_connectors/OG-CON-004_power-in-foot_v2.0.step',0.5,None),
 'clamp':('02_connectors/OG-CON-005_universal-clamp_v2.0.step',0.4,None),
 'shelf':('03_modules/shelves/OG-MOD-001_shelf_v2.0.step',.25,None),
 'panels':('03_modules/panels/OG-MOD-002_panel-finishes_v2.0.step',1.0,None),
 'pegboard':('03_modules/panels/OG-MOD-002_panel-pegboard_v2.0.step',1.0,None),
 'planter':('03_modules/planter/OG-MOD-003_planter-tray_v2.0.step',0.4,None),
 'planterx':('03_modules/planter/OG-MOD-003_planter-extras_v2.0.step',0.6,None),
 'grow':('04_attachments/powered/OG-ATT-001_grow-light_v2.0.step',0.4,None),
 'spot':('04_attachments/powered/OG-ATT-002_spotlight_v2.0.step',0.3,None),
 'hub':('04_attachments/powered/OG-ATT-003_power-hub_v2.0.step',0.35,None),
 'pen':('04_attachments/unpowered/OG-ATT-004_pen-stand_v2.0.step',0.35,None),
 'clock':('04_attachments/powered/OG-ATT-005_clock-puck_v2.0.step',0.35,None),
 'speaker':('04_attachments/powered/OG-ATT-006_speaker-puck_v2.0.step',0.6,None),
 'clip':('04_attachments/unpowered/OG-ATT-007_vine-clip_v2.0.step',0.35,None),
}
ANG={'pegboard':1.2,'speaker':1.2,'panels':1.2,'clamp':.7,'frame':.45,'connector':.7,'endcap':.6,'foot':.5,'powerfoot':.5,'grow':.5,'spot':.5,'hub':.6,'clock':.6,'pen':.6,'planterx':.8,'clip':.7,'planter':.6}
SPLIT={'grow':{i:'grow_led' for i in range(366,372)},'spot':{i:'spot_lens' for i in range(401,406)},'clock':{379:'clock_face'}}  # grow: LED band solid, spot: lens disc solid
def tess(shape,tol,ang=0.35,split=None):
    BRepMesh_IncrementalMesh(shape.wrapped,tol,False,ang,True)
    V=[];N=[];F=[];o=0;FI=[]
    for fi,f in enumerate(shape.faces()):
        loc=TopLoc_Location(); tri=BRep_Tool.Triangulation_s(f.wrapped,loc)
        if tri is None: continue
        if not tri.HasNormals(): BRepLib_ToolTriangulatedShape.ComputeNormals_s(f.wrapped,tri)
        tr=loc.Transformation(); rev=f.wrapped.Orientation()==TopAbs_REVERSED
        n=tri.NbNodes()
        for i in range(1,n+1):
            p=tri.Node(i).Transformed(tr); V.append((p.X(),p.Y(),p.Z()))
            d=tri.Normal(i); 
            from OCP.gp import gp_Dir
            nn=gp_Dir(d.X(),d.Y(),d.Z()).Transformed(tr); s=-1 if rev else 1; N.append((s*nn.X(),s*nn.Y(),s*nn.Z()))
        for i in range(1,tri.NbTriangles()+1):
            a,b_,c=tri.Triangle(i).Get()
            F.append((o+a-1,o+c-1,o+b_-1) if rev else (o+a-1,o+b_-1,o+c-1)); FI.append(fi)
        o+=n
    return np.array(V,np.float32),np.array(N,np.float32),np.array(F,np.int32),np.array(FI,np.int32)
if __name__=='__main__':
    keys=sys.argv[1:] or list(P)
    for k in keys:
        f,tol,_=P[k]; s=b.import_step(C+f)
        V,N,F,FI=tess(s,tol,ANG.get(k,0.35))
        np.savez_compressed(f'build/{k}.npz',V=V,N=N,F=F,FI=FI)
        print(k,len(F),V.min(0).round(1),V.max(0).round(1),flush=True)
