"""Head-fitted knit beanie and soft down-brim bucket; preserve approved cap."""
import bpy,bmesh,math,sys,json,subprocess
from pathlib import Path
from mathutils import Vector
ROOT=Path(__file__).resolve().parents[1];sys.path.insert(0,str(ROOT/'scripts'))
from wardrobe_rig import approved_rig,export_item,role,RAW
from wardrobe_surfaces import Surface
from wardrobe_anatomical import scalp_crown
from wardrobe_materials import tinted_fabric_material
# The accepted cap has its own source and is never rebuilt from the rejected dome.
subprocess.run([bpy.app.binary_path,'--background','--python-exit-code','1','--python',str(ROOT/'scripts/prototype-cap-scalp.py')],check=True)
rig,approved=approved_rig();head=approved['SuperHero_Male']
knit=tinted_fabric_material('Wardrobe_Hat_Beanie_Olive',(.31,.36,.24),'knit',roughness=.96)
cloth=tinted_fabric_material('Wardrobe_Hat_Bucket_Olive',(.60,.65,.40),'twill',roughness=.94,normal_strength=.25)
thread=bpy.data.materials.new('Wardrobe_Hat_Thread');thread.use_nodes=True
thread.node_tree.nodes.get('Principled BSDF').inputs['Base Color'].default_value=(.16,.17,.11,1)
thread.node_tree.nodes.get('Principled BSDF').inputs['Roughness'].default_value=.95

def bind(obj):
    obj.vertex_groups.clear();g=obj.vertex_groups.new(name='Head');g.add(list(range(len(obj.data.vertices))),1,'REPLACE')
    obj.parent=rig;m=obj.modifiers.new('Canonical head attachment','ARMATURE');m.object=rig;role(obj,'hat')
    for p in obj.data.polygons:p.use_smooth=True
    return obj

def solid(obj,thickness):
    bpy.context.view_layer.objects.active=obj
    m=obj.modifiers.new('Turned fabric thickness','SOLIDIFY');m.thickness=thickness;m.offset=-1
    bpy.ops.object.modifier_apply(modifier=m.name)

def opening(obj):
    bm=bmesh.new();bm.from_mesh(obj.data);p=[v.co.copy()for v in bm.verts if v.is_boundary];bm.free()
    return sorted(p,key=lambda p:math.atan2(p.x,-(p.y-.014)))

def loft(name,rings,material):
    s=Surface();ids=[[s.point(p)for p in ring]for ring in rings];n=len(ids[0])
    for k in range(len(ids)-1):
        for j in range(n):
            jj=(j+1)%n
            s.face((ids[k][j],ids[k+1][j],ids[k+1][jj],ids[k][jj]),[(j/n*3,k*.15),(j/n*3,(k+1)*.15),((j+1)/n*3,(k+1)*.15),((j+1)/n*3,k*.15)])
    obj=s.object(name,material)
    bm=bmesh.new();bm.from_mesh(obj.data);bmesh.ops.recalc_face_normals(bm,faces=list(bm.faces));bm.to_mesh(obj.data);bm.free()
    return obj

crown,_,_,_=scalp_crown(head,knit,hem=1.704,clearance=.012,ease=.008,count=144,levels=16)
crown.name='Beanie fitted knit crown'
for v in crown.data.vertices:
    a=math.atan2(v.co.x,-(v.co.y-.014));normal=Vector((math.sin(a),-math.cos(a),0))
    v.co+=normal*(.00065*math.cos(a*36))
base=opening(crown);cuff=[]
for height,thickness in [(0,0),(.003,.002),(.007,.003),(.024,.003),(.029,.001),(.027,-.001),(.004,-.001),(0,0)]:
    row=[]
    for p in base:
        a=math.atan2(p.x,-(p.y-.014));radial=Vector((math.sin(a),-math.cos(a),0))
        q=p+radial*(thickness+.0007*math.cos(a*36));q.z+=height;row.append(q)
    cuff.append(row)
fold=loft('Beanie rounded folded cuff',cuff,knit)
solid(crown,.002)
beanie=[bind(crown),bind(fold)]
export_item(rig,beanie,'hat-knit-beanie')

# Bucket side wall follows the measured opening; the top is a separate panel.
fit,_,_,_=scalp_crown(head,cloth,hem=1.732,clearance=.014,ease=.005,count=96,levels=12)
base=opening(fit);fit.hide_set(True);fit.hide_render=True
center=Vector((0,.014,0));top=[]
for p in base:
    q=center+(p-center)*.85;q.z=1.833+.001*math.sin(math.atan2(p.x,-(p.y-.014))*3);top.append(q)
wall=[]
for t in [0,.04,.20,.55,.90,.97,1]:
    row=[]
    for p,q in zip(base,top):
        co=p.lerp(q,t);a=math.atan2(co.x,-(co.y-.014));co+=Vector((math.sin(a),-math.cos(a),0))*(.0012*math.sin(a*5+t*4)*math.sin(math.pi*t));row.append(co)
    wall.append(row)
side=loft('Bucket soft tapered cloth wall',wall,cloth)
lid=[]
for scale,lift in [(1,0),(.97,.002),(.75,.003),(.40,.003),(.001,.003)]:
    lid.append([Vector((p.x*scale,.014+(p.y-.014)*scale,p.z+lift))for p in top])
top_panel=loft('Bucket separate top cloth panel',lid,cloth)
brim=[]
for t in [0,.10,.25,.5,.75,.93,1]:
    row=[]
    for p in base:
        a=math.atan2(p.x,-(p.y-.014));co=p+Vector((math.sin(a),-math.cos(a),0))*(.034*t)
        co.z-=.027*t**1.15;co.z+=.0013*math.sin(a*3+.4)*t;row.append(co)
    brim.append(row)
flange=loft('Bucket downward sloping flexible brim',brim,cloth)
solid(flange,.0018);solid(side,.0015);solid(top_panel,.0015)
# Stitch rows are placed on the actual brim, rather than guessed inside it.
s=Surface()
for k in [2,3,4,5,6]:
    path=brim[k]+[brim[k][0]]
    for i,(a,b)in enumerate(zip(path,path[1:])):
        if i%2:continue
        tangent=(b-a).normalized();normal=Vector((0,0,1));w=normal.cross(tangent)*.00025
        aa=a+normal*.0008;bb=a.lerp(b,.7)+normal*.0008
        ids=[s.point(p)for p in [aa-w,bb-w,bb+w,aa+w]];s.face(ids,[(0,0),(1,0),(1,1),(0,1)])
stitches=s.object('Bucket brim concentric topstitching',thread)
bucket=[bind(o)for o in [side,top_panel,flange,stitches]]
export_item(rig,bucket,'hat-stitched-bucket')
bpy.ops.wm.save_as_mainfile(filepath=str(RAW/'hats-anatomical-source.blend'))
(ROOT/'docs/characters/wardrobe/hat-authoring.json').write_text(json.dumps({'method':'Head-derived cloth fitting','cap':'User approved anatomical cap; built separately','beanie':'Fitted crown and folded cuff','bucket':'Separate top, shaped wall and downward brim','accepted':False},indent=2)+'\n')
