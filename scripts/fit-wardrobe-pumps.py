"""Headless pump study adapted from MRT's CC0 stiletto bootie last.

Only OBJ mesh data is imported. The female coat, covered waist and canonical
rig are retained from the separate jacket study. This is not an accepted asset.
"""
import bpy,bmesh,sys,math,shutil,json,gzip,hashlib
from pathlib import Path
assert bpy.app.background, 'Run this authoring script with Blender --background'
ROOT=Path(__file__).resolve().parents[1];sys.path.insert(0,str(ROOT/'scripts'))
from wardrobe_rig import RAW,export_item,role,duplicate
from wardrobe_surfaces import reduce_garment
assert shutil.disk_usage(ROOT).free>4*1024**3+128*1024**2
source=gzip.decompress((ROOT/'assets/wardrobe-source/meshes/toigo-stiletto-last.obj.gz').read_bytes())
assert hashlib.sha256(source).hexdigest()=='b073d2103e0a1e21509851fa1ca70cfc92fee78da2e114696a12a910cda44529'
source=source.decode();assert '# license CC0' in source[:200]
rig=next(o for o in bpy.context.scene.objects if o.type=='ARMATURE')
vertices=[];uvs=[];faces=[];face_uvs=[]
for line in source.splitlines():
 fields=line.split()
 if not fields:continue
 if fields[0]=='v':
  x,y,z=map(float,fields[1:4]);side=1 if x>0 else-1
  sy=-z*.1; a=-.0165
  fy=.0875+(sy-a)*((.0875+.145)/(a+.14403)if sy<a else(.145-.0875)/(.04648-a))
  fz=(y*.1+.88164)*.78;fx=side*.1143+(x*.1-side*.1693)*1.40
  if fy<-.08:fy=-.08+(fy+.08)*.68
  if fy>.09 and fz<.055:
   blend=max(0,1-fz/.055);fx=side*.1143+(fx-side*.1143)*(1+.8*blend);fy=.130+(fy-.130)*(1+.4*blend)
  vertices.append((fx,fy,fz))
 elif fields[0]=='vt':uvs.append(tuple(map(float,fields[1:3])))
 elif fields[0]=='f':
  values=[f.split('/')for f in fields[1:]];faces.append([int(v[0])-1 for v in values]);face_uvs.append([uvs[int(v[1])-1]for v in values])
mesh=bpy.data.meshes.new('Authored curved stiletto last');mesh.from_pydata(vertices,[],faces);mesh.update()
uv=mesh.uv_layers.new(name='FootwearUV')
for face,coordinates in zip(mesh.polygons,face_uvs):
 face.use_smooth=True
 for loop,co in zip(face.loop_indices,coordinates):uv.data[loop].uv=co
last=bpy.data.objects.new('CC0 authored pump last',mesh);bpy.context.collection.objects.link(last)
# A pump has a low throat and a rising rear quarter, rather than an ankle shaft.
# Low vamp in front, rising counter behind. Split at their shared contour.
front=duplicate(last,'Pump low vamp half')
for obj,is_front in[(front,True),(last,False)]:
 bm=bmesh.new();bm.from_mesh(obj.data)
 bmesh.ops.bisect_plane(bm,geom=list(bm.verts)+list(bm.edges)+list(bm.faces),plane_co=(0,-.011111,0),plane_no=(0,1,0),clear_outer=is_front,clear_inner=not is_front)
 bmesh.ops.bisect_plane(bm,geom=list(bm.verts)+list(bm.edges)+list(bm.faces),plane_co=(0,0,.040 if is_front else .045),plane_no=(0,0 if is_front else-.45,1),clear_outer=True)
 bmesh.ops.delete(bm,geom=[v for v in bm.verts if not v.link_faces],context='VERTS');bmesh.ops.recalc_face_normals(bm,faces=list(bm.faces));bm.to_mesh(obj.data);bm.free()
bpy.ops.object.select_all(action='DESELECT');last.select_set(True);front.select_set(True);bpy.context.view_layer.objects.active=last;bpy.ops.object.join()
bm=bmesh.new();bm.from_mesh(last.data);bmesh.ops.remove_doubles(bm,verts=list(bm.verts),dist=.00001);bm.to_mesh(last.data);bm.free();mesh=last.data
bpy.ops.object.select_all(action='DESELECT');last.select_set(True);bpy.context.view_layer.objects.active=last
triangles=sum(len(f.vertices)-2 for f in mesh.polygons);reduce_garment(last,min(1,7000/triangles))
leather=bpy.data.materials.new('Wardrobe_Female_Authored_Leather');leather.use_nodes=True
shader=leather.node_tree.nodes.get('Principled BSDF');shader.inputs['Base Color'].default_value=(.009,.010,.013,1);shader.inputs['Roughness'].default_value=.48;shader.inputs['Specular IOR Level'].default_value=.28
last.data.materials.append(leather)
# Turn the cut leather edge inward, without adding a second full shell.
bm=bmesh.new();bm.from_mesh(last.data);bm.normal_update()
edges=[e for e in bm.edges if e.is_boundary];normals={tuple(v.co):v.normal.copy()for e in edges for v in e.verts}
result=bmesh.ops.extrude_edge_only(bm,edges=edges)
for v in [g for g in result['geom']if isinstance(g,bmesh.types.BMVert)]:v.co-=normals[tuple(v.co)]*.0015
bm.to_mesh(last.data);bm.free()
last.vertex_groups.clear();groups={name:last.vertex_groups.new(name=name)for name in['foot_l','ball_l','foot_r','ball_r']}
for v in last.data.vertices:
 side='l'if v.co.x>0 else'r';t=max(0,min(.75,(-v.co.y-.04)/.11));groups['foot_'+side].add([v.index],1-t,'REPLACE')
 if t:groups['ball_'+side].add([v.index],t,'REPLACE')
last.parent=rig;last.modifiers.new('Canonical pump skin','ARMATURE').object=rig;role(last,'shoes')
for obj in list(bpy.context.scene.objects):
 if obj!=last and obj.type=='MESH'and obj.get('wardrobeRole')=='shoes':bpy.data.objects.remove(obj,do_unlink=True)
# Refit only the covered foot volume; the visible calf and thigh stay intact.
from mathutils import Vector
body=bpy.data.objects['__female_weight_reference']
old=next(o for o in bpy.context.scene.objects if o.type=='MESH'and o.get('wardrobeRole')=='tights'and not o.hide_render)
tights=duplicate(body,'Refitted pump tights');tights.hide_render=False
bm=bmesh.new();bm.from_mesh(tights.data)
for height,low in[(.015,True),(.785,False)]:
 bmesh.ops.bisect_plane(bm,geom=list(bm.verts)+list(bm.edges)+list(bm.faces),plane_co=(0,0,height),plane_no=(0,0,1),clear_inner=low,clear_outer=not low)
bmesh.ops.delete(bm,geom=[v for v in bm.verts if not v.link_faces],context='VERTS');bm.to_mesh(tights.data);bm.free()
for v in tights.data.vertices:
 p=v.co
 if p.z<.15:
  side=1 if p.x>=0 else-1;factor=max(0,min(1,(.15-p.z)/.10))
  p.x=side*.1143+(p.x-side*.1143)*(1-.25*factor)
  p.y=.025+(p.y-.025)*(1-.10*factor)
  p.z+=.065*max(0,min(1,(p.y+.02)/.15))*factor
  inset=max(0,min(1,(.115-p.z)/.055))
  p.x=side*.1143+(p.x-side*.1143)*(1-.32*inset)
  p.y=.060+(p.y-.060)*(1-.15*inset)
  if p.y<-.08:p.y=-.08+(p.y+.08)*.68
# Fit the concealed forefoot below the actual upper, rather than guessing its height.
from mathutils.bvhtree import BVHTree
last.data.calc_loop_triangles();shoe_tree=BVHTree.FromPolygons([v.co.copy()for v in last.data.vertices],[list(t.vertices)for t in last.data.loop_triangles],all_triangles=True)
for v in tights.data.vertices:
 p=v.co
 if p.z<.105 and p.y<-.035:
  hit,_,_,_=shoe_tree.ray_cast(Vector((p.x,p.y,.30)),Vector((0,0,-1)),.35)
  if hit is not None and p.z>hit.z-.003:p.z=max(.010,hit.z-.003)
tights.data.materials.clear();tights.data.materials.append(old.data.materials[0]);role(tights,'tights');bpy.data.objects.remove(old,do_unlink=True)
# Keep every visible rigged outfit component, including the publisher eyes
# whose original role is the default item.
pieces=[o for o in bpy.context.scene.objects if o.type=='MESH'and o.vertex_groups and o.get('wardrobeRole')!='bake-source'and not o.hide_render]
if last not in pieces:pieces.append(last)
export_item(rig,pieces,'female-brunette-tailored')
bpy.ops.wm.save_as_mainfile(filepath=str(RAW/'female-authored-heels-study.blend'),compress=True)
(ROOT/'docs/characters/wardrobe/clothing-fit/heels-source.json').write_text(json.dumps({'source':'https://static.makehumancommunity.org/assets/assetpacks/shoes01.html','author':'MRT / Margaret Toigo','license':'CC0 (verified OBJ header)','adaptation':'Authored curved toe, arch and stiletto last; shaft reshaped into a low-cut pump and fitted to canonical feet.','stage':'Unaccepted visual study'},indent=2)+'\n')
metadata_path=ROOT/'docs/characters/wardrobe/female-authoring.json'
metadata=json.loads(metadata_path.read_text())
metadata.update(stage='Headless clothing candidate; world acceptance pending',components=[o.name for o in pieces],footwearSource='MRT / Margaret Toigo, MakeHuman CC0 stiletto last; see clothing-fit/heels-source.json',accepted=False)
metadata_path.write_text(json.dumps(metadata,indent=2)+'\n')
print('AUTHORED_PUMP',len(last.data.vertices),len(pieces))
