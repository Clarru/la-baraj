"""Headless fitted cotton shirt with a sewn collar and baked cloth detail."""
import bpy,bmesh,math,sys,shutil,os
from pathlib import Path
from mathutils import Vector
from mathutils.bvhtree import BVHTree
assert bpy.app.background, 'Run this authoring script with Blender --background'
ROOT=Path(__file__).resolve().parents[1];sys.path.insert(0,str(ROOT/'scripts'))
assert shutil.disk_usage(ROOT).free>=4*1024**3+64*1024**2
from wardrobe_rig import approved_rig,duplicate,export_item,role,RAW,import_model,rebind,remove_source_rig
from wardrobe_surfaces import Surface,knit_surface,finish_garment,reduce_garment,bind_surface
from wardrobe_fitted_cloth import fitted_profiles,fit_upper_neck_skin,blend_neck_skin_weights
from wardrobe_materials import tinted_fabric_material
os.environ['LA_BARAJ_CLOTH_STUDY']='1'
rig,approved=approved_rig();cloth=tinted_fabric_material('Wardrobe_Overshirt_Navy_Fitted',(.089354,.134031,.210619),'cap-cotton',roughness=.90,normal_strength=.3)
def material(name,color):
 m=bpy.data.materials.new(name);m.use_nodes=True;m.node_tree.nodes.get('Principled BSDF').inputs['Base Color'].default_value=(*color,1);m.node_tree.nodes.get('Principled BSDF').inputs['Roughness'].default_value=.9;return m
tee_mat=material('Wardrobe_Overshirt_Tee',(.05,.055,.05));horn=material('Wardrobe_Overshirt_Horn',(.028,.023,.018))
refs=[duplicate(approved[n],'Shirt weight reference '+n)for n in ['Male_Peasant_Body','Male_Peasant_Arms']]
bpy.ops.object.select_all(action='DESELECT')
for o in refs:o.select_set(True)
bpy.context.view_layer.objects.active=refs[0];bpy.ops.object.join();reference=refs[0]
neck_rig,neck_meshes=import_model(next((RAW/'base/extracted').rglob('Superhero_Male_FullBody.gltf')))
neck_reference=max(neck_meshes,key=lambda obj:len(obj.data.vertices));rebind(neck_reference,neck_rig,rig)
for obj in neck_meshes:obj.hide_render=True;obj.hide_set(True)
remove_source_rig(neck_rig)
neck_reference.data.calc_loop_triangles();neck_tree=BVHTree.FromPolygons([v.co.copy()for v in neck_reference.data.vertices],[list(t.vertices)for t in neck_reference.data.loop_triangles],all_triangles=True)
def neck_surface(angle,z):
 direction=Vector((math.sin(angle),-math.cos(angle),0))
 hit,_,_,_=neck_tree.ray_cast(Vector((0,.055,z)),direction,.4)
 if hit is None:raise RuntimeError('Anatomical shirt neckline missed skin')
 return hit+direction*.004
profiles=fitted_profiles();gaps=[0,0,0,0,0,0,0,.08,.15,.30,.45]
shirt=knit_surface(cloth,profiles,gaps,name='Fitted cotton shirt cage',center_y=.020,shoulder_back=.045)
# A shirt opening is lower and deeper at the front than a crew neckline.
# The sewn stand and folded leaf are separate, measured pattern pieces.
for level,drop in [(6,.010),(7,.025),(8,.045)]:
 for j in range(48):
  gap=gaps[level];angle=gap+j*(math.tau-2*gap)/47
  shirt.data.vertices[level*48+j].co.z-=drop*max(0,math.cos(angle))**8
stand=[];sewn=[]
for j in range(48):
 a=.45+j*(math.tau-.90)/47;c=math.cos(a)
 top_z=1.565-.035*max(0,c)**2
 top=neck_surface(a,top_z)
 bottom=neck_surface(a,top_z-.015);shoulder=shirt.data.vertices[8*48+j].co.copy()
 shirt.data.vertices[9*48+j].co=shoulder.lerp(bottom,.60)
 shirt.data.vertices[10*48+j].co=bottom
 stand.append(top);sewn.append(bottom)
fit_upper_neck_skin(shirt,neck_reference)
tee_opening=[(shirt.data.vertices[k*48].co.copy(),shirt.data.vertices[k*48+47].co.copy())for k in range(4,11)]
if os.environ.get('LA_BARAJ_CLOTH_STUDY')=='1':
 from wardrobe_cloth_drape import cotton_drape
 cotton_drape(shirt,sewn,pin_front=True)
else:
 bpy.context.view_layer.objects.active=shirt;subdivision=shirt.modifiers.new('Smooth cloth authoring surface','SUBSURF');subdivision.levels=1;bpy.ops.object.modifier_apply(modifier=subdivision.name)
fit_upper_neck_skin(shirt,neck_reference)
# Preserve the dense authoring surface. Reduce the thin mesh before adding
# edge thickness; reducing a doubled shell can collapse opposite surfaces.
high=duplicate(shirt,'High cotton cloth bake source');bpy.ops.object.select_all(action='DESELECT');high.select_set(True)
bpy.context.view_layer.objects.active=high;shell=high.modifiers.new('High cloth thickness','SOLIDIFY');shell.thickness=.002;shell.offset=-1;bpy.ops.object.modifier_apply(modifier=shell.name);high.hide_render=True;high.hide_set(True)
shirt.select_set(True);bpy.context.view_layer.objects.active=shirt
triangles=sum(len(face.vertices)-2 for face in shirt.data.polygons)
reduce_garment(shirt,min(1,6000/max(1,triangles)))
bm=bmesh.new();bm.from_mesh(shirt.data);bm.normal_update()
boundary=[edge for edge in bm.edges if edge.is_boundary];source_vertices=list({v for edge in boundary for v in edge.verts})
from mathutils.kdtree import KDTree
kd=KDTree(len(source_vertices))
for i,v in enumerate(source_vertices):kd.insert(v.co,i)
kd.balance();normals=[v.normal.copy()for v in source_vertices]
result=bmesh.ops.extrude_edge_only(bm,edges=boundary)
for v in[item for item in result['geom']if isinstance(item,bmesh.types.BMVert)]:
 _,index,_=kd.find(v.co);v.co-=normals[index]*.002
bm.to_mesh(shirt.data);bm.free()
bind_surface(shirt,neck_reference,rig);role(shirt,'top');parts=[shirt]
shirt.data.calc_loop_triangles();tree=BVHTree.FromPolygons([v.co.copy()for v in shirt.data.vertices],[list(t.vertices)for t in shirt.data.loop_triangles],all_triangles=True)
def front(x,z):
 hit,_,_,_=tree.ray_cast(Vector((x,-1,z)),Vector((0,1,0)),2)
 if hit is not None:return hit.y
 hit,_,_,_=tree.find_nearest(Vector((math.copysign(max(abs(x),.018),x),-.08,z)))
 return hit.y

def attach(obj):
 bind_surface(obj,shirt,rig);role(obj,'top');parts.append(obj);return obj
# Sewn stand: 15 mm at the neck, with its front below the throat.
s=Surface();rows=[]
for t in [0,.15,.85,1]:rows.append([s.point(bottom.lerp(top,t))for bottom,top in zip(sewn,stand)])
for k in range(3):
 for j in range(47):s.face((rows[k][j],rows[k][j+1],rows[k+1][j+1],rows[k+1][j]),[(j/47,k/3),((j+1)/47,k/3),((j+1)/47,(k+1)/3),(j/47,(k+1)/3)])
attach(s.object('Sewn 15 mm shirt collar stand',cloth))
# The folded leaf rests against the finished shirt, including two pointed tips.
s=Surface();rows=[]
for t in [0,.18,.45,.75,1]:
 row=[]
 for j,p in enumerate(stand):
  a=.45+j*(math.tau-.90)/47;c=math.cos(a);radial=Vector((math.sin(a),-c,0))
  width=.032 if c>=0 else .012+.020*(1+c)
  outer=None
  for fraction in [1,.85,.65,.45]:
   candidate=p+radial*width*fraction
   hit,normal,_,_=tree.ray_cast(Vector((candidate.x,candidate.y,p.z+.03)),Vector((0,0,-1)),.25)
   if hit is not None:
    outer=hit+normal*.003;break
  if outer is None:raise RuntimeError('Folded collar leaf missed shirt below its pattern width')
  # A collar front is a pointed panel with a straight outer edge; draping
  # every edge sample independently turns it into a rounded shawl collar.
  front_angle=a if a<math.pi else math.tau-a
  if front_angle<1.25:
   side=1 if math.sin(a)>0 else-1;join_angle=1.25;join_c=math.cos(join_angle)
   join_inner=neck_surface(join_angle if side>0 else math.tau-join_angle,1.565-.035*join_c**2)
   join_candidate=join_inner+Vector((side*math.sin(join_angle),-join_c,0))*.032
   join_hit,join_normal,_,_=tree.ray_cast(Vector((join_candidate.x,join_candidate.y,join_inner.z+.03)),Vector((0,0,-1)),.25)
   if join_hit is None:raise RuntimeError('Collar front panel missed its shoulder join')
   join_outer=join_hit+join_normal*.003
   tip_x=side*.075;tip_z=1.480;tip=Vector((tip_x,front(tip_x,tip_z)-.006,tip_z))
   outer=tip.lerp(join_outer,max(0,min(1,(front_angle-.45)/(.80))))
  co=p.lerp(outer,t)+radial*(.001*math.sin(math.pi*t))
  nearest,normal,_,distance=tree.find_nearest(co)
  if t>0 and distance<.035 and(co-nearest).dot(normal)<.003:co=nearest+normal*.003
  row.append(s.point(co))
 rows.append(row)
for k in range(4):
 for j in range(47):s.face((rows[k][j],rows[k+1][j],rows[k+1][j+1],rows[k][j+1]),[(j/47,k/4),(j/47,(k+1)/4),((j+1)/47,(k+1)/4),((j+1)/47,k/4)])
collar=s.object('Folded shirt collar leaf and points',cloth);bpy.context.view_layer.objects.active=collar
shell=collar.modifiers.new('Folded cloth edge thickness','SOLIDIFY');shell.thickness=.0015;shell.offset=-1;bpy.ops.object.modifier_apply(modifier=shell.name);attach(collar)
# Small flush patches use rounded lower corners, projected onto the actual shirt.
for side in [-1,1]:
 for label,points,relief in [('chest pocket',[(-.040,.045),(.040,.045),(.040,-.040),(.035,-.045),(-.035,-.045),(-.040,-.040)],.003),('pocket flap',[(-.042,.015),(.042,.015),(.040,-.012),(-.040,-.012)],.0045)]:
  center=Vector((side*.110,0,1.325 if label=='chest pocket' else 1.371));s=Surface();rows=[]
  for k in range(9):
   v=k/8;z=center.z+max(p[1]for p in points)*(1-v)+min(p[1]for p in points)*v;half=.040 if label=='chest pocket' else .042
   if label=='chest pocket' and v>.94:half-=.005*(v-.94)/.06
   rows.append([s.point((center.x+half*(j/8*2-1),front(center.x+half*(j/8*2-1),z)-relief-(.003*math.sin(math.pi*j/8)*math.sin(math.pi*v)if label=='chest pocket'else 0),z))for j in range(9)])
  for k in range(8):
   for j in range(8):
    ids=(rows[k][j],rows[k+1][j],rows[k+1][j+1],rows[k][j+1]);s.face(ids,[(s.vertices[i][0]/.15,s.vertices[i][2]/.15)for i in ids])
  patch=s.object('Cotton '+label,cloth);bpy.context.view_layer.objects.active=patch;m=patch.modifiers.new('Patch turned edge','SOLIDIFY');m.thickness=.001;m.offset=-1;bpy.ops.object.modifier_apply(modifier=m.name);attach(patch)
# The narrow overlap closes the front below the open top button.
s=Surface();rows=[]
for z in [1.005,1.08,1.17,1.26,1.34,1.42]:
 rows.append([s.point((x,front(x,z)-.005,z))for x in [-.007,.013]])
for k in range(len(rows)-1):s.face((rows[k][0],rows[k][1],rows[k+1][1],rows[k+1][0]),[(0,0),(1,0),(1,1),(0,1)])
attach(s.object('Shirt button overlap',cloth))
for z in [1.05,1.14,1.23,1.32,1.41]:
 bpy.ops.object.select_all(action='DESELECT');bpy.ops.mesh.primitive_uv_sphere_add(segments=10,ring_count=5,radius=1,location=(.003,front(.013,z)-.003,z));o=bpy.context.object;o.name='Small horn shirt button';o.scale=(.004,.0015,.004);bpy.ops.object.transform_apply(location=True,rotation=True,scale=True);o.data.materials.append(horn);attach(o)
# Smooth front underlayer with a continuous low crew opening.
def tree(o):
 o.data.calc_loop_triangles();return BVHTree.FromPolygons([v.co.copy()for v in o.data.vertices],[list(t.vertices)for t in o.data.loop_triangles],all_triangles=True)
skin_tree=tree(neck_reference);outer=tree(shirt)
s=Surface();rows=[]
for k in range(17):
 t=k/16;row=[]
 for j in range(49):
  u=j/48*2-1;z0=1.532+.016*u*u
  x=(.080*(1-t)+.006*t)*u;z=z0*(1-t)+1.455*t
  # A smooth cloth panel behind the outer shirt, independent of the hidden
  # source body's muscular torso and the open shirt's nearest-edge rays.
  y=-.025*(1-t)-.085*t+.005*u*u
  row.append(s.point((x,y,z)))
 rows.append(row)
for k in range(16):
 for j in range(48):s.face((rows[k][j],rows[k+1][j],rows[k+1][j+1],rows[k][j+1]),[(j/48,k/16),(j/48,(k+1)/16),((j+1)/48,(k+1)/16),((j+1)/48,k/16)])
tee=s.object('Smooth crew neck underlayer',tee_mat)
bind_surface(tee,shirt,rig);role(tee,'top');parts.append(tee)
# Turned sleeve cuffs sit on the existing sleeve last and share its skin field.
for side in [-1,1]:
 s=Surface();rows=[]
 for x,radius in [(.670,.0515),(.674,.052),(.705,.050),(.710,.0485)]:
  cy=.0654+.006*math.sin((x-.21)*math.pi/.5)
  rows.append([s.point((side*x,cy+math.cos(j*math.tau/48)*radius,1.4555+math.sin(j*math.tau/48)*radius))for j in range(48)])
 for k in range(3):
  for j in range(48):
   n=(j+1)%48;ids=(rows[k][j],rows[k+1][j],rows[k+1][n],rows[k][n])
   if side>0:ids=tuple(reversed(ids))
   s.face(ids,[(j/48,k/3),(j/48,(k+1)/3),((j+1)/48,(k+1)/3),((j+1)/48,k/3)])
 attach(s.object('Turned cotton sleeve cuff',cloth))
export_item(rig,parts,'top-trail-overshirt');bpy.ops.wm.save_as_mainfile(filepath=str(RAW/'pattern-overshirt-study.blend'),compress=True)

# Bake the dense cloth and sewing into the runtime material.
import runpy
os.environ["LA_BARAJ_CLOTH_ATLAS"]="1"
runpy.run_path(str(ROOT/"scripts/finish-wardrobe-overshirt.py"),run_name="__main__")
