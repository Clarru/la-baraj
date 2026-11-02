"""Anatomical cap study: derive the crown from the approved scalp, not a dome."""
import bpy,bmesh,sys,math,json
from pathlib import Path
from mathutils import Vector
ROOT=Path(__file__).resolve().parents[1];sys.path.insert(0,str(ROOT/'scripts'))
from wardrobe_rig import approved_rig,duplicate,export_item,role,RAW
from wardrobe_surfaces import Surface
rig,approved=approved_rig()
head=approved['SuperHero_Male']
from wardrobe_materials import tinted_fabric_material
cloth=tinted_fabric_material('Wardrobe_Hat_Cap_Navy',(.089354,.134031,.210619),'cap-cotton',roughness=.93)
from wardrobe_anatomical import scalp_crown
crown,rings,top,origin=scalp_crown(head,cloth)
count=len(rings[0])
# Use the actual crown opening as the visor's sewn root.
bm=bmesh.new();bm.from_mesh(crown.data)
boundary=[v.co.copy()for v in bm.verts if v.is_boundary]
bm.free()
boundary.sort(key=lambda p:math.atan2(p.x,-(p.y-.014)))
def angle(p):return math.atan2(p.x,-(p.y-.014))
def root(a):
    for p,q in zip(boundary,boundary[1:]):
        if angle(p)<=a<=angle(q):
            t=(a-angle(p))/(angle(q)-angle(p));return p.lerp(q,t)
    raise RuntimeError('Missing head-derived visor root')
s=Surface();rows=[];amax=1.16;segments=48;depths=10
for k in range(depths+1):
    t=k/depths;row=[]
    for j in range(segments+1):
        a=-amax+2*amax*j/segments;r=root(a)
        extension=.047*max(0,math.cos(a/amax*math.pi/2))**.65
        row.append(s.point((r.x+.004*math.sin(a)*t,r.y-extension*t,
            r.z-.007*t-.012*(math.sin(a)/math.sin(amax))**2*t)))
    rows.append(row)
for k in range(depths):
    for j in range(segments):
        s.face((rows[k][j],rows[k+1][j],rows[k+1][j+1],rows[k][j+1]),
            [(j/segments,k/depths),(j/segments,(k+1)/depths),((j+1)/segments,(k+1)/depths),((j+1)/segments,k/depths)])
visor=s.object('Separate moulded curved visor',cloth)
# Seam paths follow the fitted cage, with a restrained cloth finish.
thread=bpy.data.materials.new('Wardrobe_Hat_Thread');thread.use_nodes=True
p=thread.node_tree.nodes.get('Principled BSDF');p.inputs['Base Color'].default_value=(.065,.075,.09,1);p.inputs['Roughness'].default_value=.95
sewing=Surface()
def sew(path,up=False):
    travelled=0
    for a,b in zip(path,path[1:]):
        delta=b-a;length=delta.length
        if length<1e-7:continue
        tangent=delta/length
        normal=Vector((0,0,1)) if up else (a-origin).normalized()
        across=normal.cross(tangent).normalized()
        k=math.ceil(travelled/.003)
        while k*.003<travelled+length:
            start=k*.003-travelled;end=min(start+.0017,length)
            if end-start>.0004:
                for sign in [-1,1]:
                    offset=normal*.00065+across*(sign*.0009)
                    ps=[a+tangent*start+offset-across*.0002,a+tangent*end+offset-across*.0002,
                        a+tangent*end+offset+across*.0002,a+tangent*start+offset+across*.0002]
                    ids=[sewing.point(p)for p in ps];sewing.face(ids,[(0,0),(1,0),(1,1),(0,1)])
            k+=1
        travelled+=length
for j in range(0,count,count//6):
    sew([crown.data.vertices[top].co.copy()]+[crown.data.vertices[ring[j]].co.copy()for ring in rings])
for k in [6,8,10]:sew([Vector(s.vertices[i])for i in rows[k]],True)
stitches=sewing.object('Six panel double stitching',thread)
# Round the actual lower opening rather than adding a guessed circular band.
curve=bpy.data.curves.new('Anatomical turned hem','CURVE');curve.dimensions='3D';curve.bevel_depth=.0012;curve.bevel_resolution=1
spline=curve.splines.new('POLY');spline.points.add(len(boundary));
for dst,co in zip(spline.points,boundary+[boundary[0]]):dst.co=(*co,1)
binding=bpy.data.objects.new('Crown turned hem',curve);bpy.context.collection.objects.link(binding);binding.data.materials.append(cloth)
bpy.ops.object.select_all(action='DESELECT');binding.select_set(True);bpy.context.view_layer.objects.active=binding;bpy.ops.object.convert(target='MESH')
parts=[crown,visor,stitches,binding]
for obj in parts:
    bpy.context.view_layer.objects.active=obj
    if obj in [crown,visor]:
        solid=obj.modifiers.new('Turned fabric edge','SOLIDIFY');solid.thickness=.0018;solid.offset=-1
        bpy.ops.object.modifier_apply(modifier=solid.name)
    obj.vertex_groups.clear();g=obj.vertex_groups.new(name='Head');g.add(list(range(len(obj.data.vertices))),1,'REPLACE')
    obj.parent=rig;m=obj.modifiers.new('Head attachment','ARMATURE');m.object=rig;role(obj,'hat')
    for p in obj.data.polygons:p.use_smooth=True
# Keep this study distinct from the rejected master.
export_item(rig,parts,'hat-panel-cap')
for obj in bpy.context.scene.objects:
    obj.hide_set(obj not in parts+[head,approved.get('Eyes'),approved.get('Eyebrows')])
bpy.ops.wm.save_as_mainfile(filepath=str(RAW/'cap-anatomical-study.blend'))
report={'method':'Approved scalp-derived crown; head-derived visor root','crownVertices':len(crown.data.vertices),'visorVertices':len(visor.data.vertices),'accepted':False}
(ROOT/'docs/characters/wardrobe/quality-rework/anatomical-study.json').write_text(json.dumps(report,indent=2)+'\n')
print(report)
