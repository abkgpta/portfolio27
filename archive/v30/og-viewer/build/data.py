import json
c=json.load(open('/mnt/project-files/overgrwth/cmf/cmf.json')); S=c['slots']
P=[('frame','OG-FRM-001','H-frame','frame','The one structural unit: a 24 in post and a 12 in post joined by a crossbar. Flip it and it stacks on itself.'),
('connector','OG-CON-001','Frame connector','pom_frame_connector','Plus-shaped plug hidden inside two stacked posts. Five pogo pins carry power up the stack.'),
('endcap','OG-CON-002','End cap','pom_end_cap','Closes any post top that has no attachment.'),
('foot','OG-CON-003','Floor foot','alu_floor_foot','Cross foot that plugs into the bottom of a post.'),
('powerfoot','OG-CON-004','Power-in foot','alu_power_in_foot','Floor foot with a barrel jack. Power enters the system here and climbs the posts.'),
('clamp','OG-CON-005','Universal clamp','pom_universal_clamp','One clamp for every module. Collars a post at any height and carries shelves, trays and panels.'),
('shelf','OG-MOD-001','Shelf','oak','Square shelf on four clamps. Grows with the 21 in grid.'),
('whiteboard','OG-MOD-002','Whiteboard panel','whiteboard','Panel you write on. Hangs between two posts on clamps.'),
('pegboard','OG-MOD-002','Pegboard panel','pegboard','Panel you hang tools on.'),
('softboard','OG-MOD-002','Softboard panel','softboard','Felt panel you pin to.'),
('planter','OG-MOD-003','Planter tray','pp','Tray with a false floor and drain spout. Holds soil and water.'),
('grow','OG-ATT-001','Grow light','att_grow_light','300 mm ring light on a post top. Lights the plants below it.'),
('spot','OG-ATT-002','Spotlight','att_spotlight','Task light on a ball joint.'),
('hub','OG-ATT-003','Power hub','att_power_hub','Turns a post top into three USB-C outlets and a Qi pad.'),
('pen','OG-ATT-004','Pen stand','att_pen_stand','Cup for pens. Unpowered.'),
('clock','OG-ATT-005','Clock puck','att_clock_puck','Clock disc on a tilting hinge.'),
('speaker','OG-ATT-006','Speaker puck','att_speaker_puck','Bluetooth speaker, 2 in driver facing up.'),
('clip','OG-ATT-007','Vine clip','clip','Ring that trains vines up a post.')]
out={'parts':{},'slots':{}}
for k,id_,name,slot,desc in P:
    s=S[slot]; out['parts'][k]={'id':id_,'name':name,'slot':slot,'desc':desc}
for k,s in S.items():
    out['slots'][k]={x:s.get(x) for x in ('name','material','finish','hex','roughness','metallic','spec','finish_spec','texture')}
json.dump(out,open('/home/user/portfolio27/og-viewer/og-data.json','w'),indent=0)
