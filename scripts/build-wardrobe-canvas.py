"""Rex shoe adaptation; Blender Studio / Sprite Fright, CC-BY-4.0.

Run with --disable-autoexec on the downloaded source .blend. Only mesh/UV data
is reused; the source rig, scripts, animation and character are not exported.
"""
import bpy,bmesh,math,sys,json,shutil
from pathlib import Path
from mathutils import Vector
from mathutils.bvhtree import BVHTree
assert bpy.app.background, 'Run this authoring script with Blender --background'
ROOT=Path(__file__).resolve().parents[1];sys.path.insert(0,str(ROOT/'scripts'))
assert shutil.disk_usage(ROOT).free>4*1024**3+128*1024**2
from wardrobe_rig import approved_rig,export_item,role,RAW,duplicate
from wardrobe_materials import tinted_fabric_material
from wardrobe_surfaces import reduce_garment,Surface
from wardrobe_cloth_bake import cloth_atlas
# Checked-in mesh/UV data excludes all source character code and rig payloads.
import gzip
source_data=json.loads(gzip.decompress((ROOT/'assets/wardrobe-source/meshes/rex-shoes.json.gz').read_bytes()))
assert source_data['license']=='CC-BY-4.0'
anchors={int(side):Vector(p)for side,p in source_data['anchors'].items()}
records={}
for name,record in source_data['objects'].items():
 records[name]={**record,'vertices':[Vector(p)for p in record['vertices']],
  'creases':{tuple(item[:2]):item[2]for item in record['creases']}}
base_points=records['GEO-rex_shoes']['vertices']
source_front=min(p.y for p in base_points);source_back=max(p.y for p in base_points)
widths={side:max(p.x for p in base_points if p.x*side>0)-min(p.x for p in base_points if p.x*side>0)for side in[-1,1]}
rig,approved=approved_rig()
targets={side:(rig.matrix_world@rig.data.bones['foot_l'if side==1 else'foot_r'].head_local).copy()for side in[-1,1]}
cloth=tinted_fabric_material('Wardrobe_Canvas_Charcoal_Fitted',(.080,.090,.100),'cap-cotton',roughness=.93,normal_strength=.2)
def material(name,color,roughness):
    m=bpy.data.materials.new(name);m.use_nodes=True;s=m.node_tree.nodes.get('Principled BSDF');s.inputs['Base Color'].default_value=(*color,1);s.inputs['Roughness'].default_value=roughness;return m
rubber=material('Wardrobe_Canvas_OffWhiteRubber',(.48,.45,.39),.85)
sole=material('Wardrobe_Canvas_DarkOutsole',(.024,.026,.028),.91)
lace=material('Wardrobe_Canvas_CottonLaces',(.44,.42,.37),.92)
def smooth(t):t=max(0,min(1,t));return t*t*(3-2*t)
def fit(p):
    side=1 if p.x>0 else-1;a=anchors[side];target=targets[side]
    front_scale=(target.y+.160)/(a.y-source_front);back_scale=(.138-target.y)/(source_back-a.y)
    mix=smooth((p.y-a.y+.020)/.040);sy=front_scale*(1-mix)+back_scale*mix
    return(target.x+(p.x-a.x)*.115/widths[side],target.y+(p.y-a.y)*sy,p.z*target.z/a.z)
def object_from(name,record,materials):
    mesh=bpy.data.meshes.new(name);mesh.from_pydata([fit(p)for p in record['vertices']],[],record['faces']);mesh.update()
    uv=mesh.uv_layers.new(name='FabricUV')
    for polygon,coordinates,index in zip(mesh.polygons,record['uvs'],record['materials']):
        polygon.use_smooth=True;polygon.material_index=min(index,len(materials)-1)
        for loop,co in zip(polygon.loop_indices,coordinates):uv.data[loop].uv=co
    if record['creases']:
        crease=mesh.attributes.new('crease_edge','FLOAT','EDGE')
        for edge in mesh.edges:crease.data[edge.index].value=record['creases'].get(tuple(sorted(edge.vertices)),0)
    obj=bpy.data.objects.new(name,mesh);bpy.context.collection.objects.link(obj)
    for m in materials:mesh.materials.append(m)
    bpy.ops.object.select_all(action='DESELECT');obj.select_set(True);bpy.context.view_layer.objects.active=obj
    modifier=obj.modifiers.new('Retain authored shoe curvature','SUBSURF');modifier.levels=1;bpy.ops.object.modifier_apply(modifier=modifier.name)
    return obj
def crop_material(obj,index,name,mat):
    result=duplicate(obj,name);bm=bmesh.new();bm.from_mesh(result.data)
    bmesh.ops.delete(bm,geom=[f for f in bm.faces if f.material_index!=index],context='FACES');bmesh.ops.delete(bm,geom=[v for v in bm.verts if not v.link_faces],context='VERTS');bm.to_mesh(result.data);bm.free()
    result.data.materials.clear();result.data.materials.append(mat)
    for face in result.data.polygons:face.material_index=0
    return result
def bind_foot(obj):
    obj.vertex_groups.clear()
    groups={name:obj.vertex_groups.new(name=name)for name in['foot_l','ball_l','foot_r','ball_r']}
    for vertex in obj.data.vertices:
        side='l'if vertex.co.x>0 else'r';t=max(0,min(.75,(-vertex.co.y-.04)/.11))
        groups['foot_'+side].add([vertex.index],1-t,'REPLACE')
        if t:groups['ball_'+side].add([vertex.index],t,'REPLACE')
    obj.parent=rig;modifier=obj.modifiers.new('Canonical foot attachment','ARMATURE');modifier.object=rig;role(obj,'shoes')
whole=object_from('Authored shoe last',records['GEO-rex_shoes'],[cloth,rubber,sole])
whole.data.calc_loop_triangles();shoe_tree=BVHTree.FromPolygons([v.co.copy()for v in whole.data.vertices],[list(t.vertices)for t in whole.data.loop_triangles],all_triangles=True)
high=crop_material(whole,0,'High cotton cloth bake source',cloth);high['wardrobeRole']='bake-source';high.hide_render=True;high.hide_set(True)
bpy.context.view_layer.objects.active=whole;reduce_garment(whole,5000/sum(len(p.vertices)-2 for p in whole.data.polygons))
parts=[crop_material(whole,i,'Canvas '+name,mat)for i,name,mat in[(0,'upper',cloth),(1,'rubber foxing',rubber),(2,'outsole',sole)]]
data=whole.data;bpy.data.objects.remove(whole,do_unlink=True);bpy.data.meshes.remove(data)
def vamp_height(x,y):
 hit,_,_,_=shoe_tree.ray_cast(Vector((x,y,.30)),Vector((0,0,-1)),.35)
 return hit.z if hit is not None else .075
for side in[-1,1]:
 cx=targets[side].x
 for step in range(6):
  y=-.095+step*.022;half=.028
  for direction in[-1,1]:
   ax=cx-direction*half;bx=cx+direction*half;az=vamp_height(ax,y)+.002;bz=vamp_height(bx,y+.014)+.002
   s=Surface();rows=[]
   for k in range(13):
    t=k/12;x=ax+(bx-ax)*t;yy=y+.014*t;z=az+(bz-az)*t+.004*math.sin(math.pi*t)
    z=max(z,vamp_height(x,yy)+.0015)
    rows.append([s.point((x,yy-.0017,z)),s.point((x,yy+.0017,z))])
   for k in range(12):
    ids=(rows[k][0],rows[k+1][0],rows[k+1][1],rows[k][1])
    if direction<0:ids=tuple(reversed(ids))
    s.face(ids,[(0,0),(1,0),(1,1),(0,1)])
   parts.append(s.object('Flat cotton crossed lace',lace))
 # A small tied bow is actual geometry, with restrained cord thickness.
 bow_y=.030;bow_z=max(vamp_height(cx-.02,bow_y),vamp_height(cx+.02,bow_y))+.008
 for direction in[-1,1]:
  points=[(cx,bow_y,bow_z),(cx+direction*.012,bow_y+.012,bow_z+.001),(cx+direction*.024,bow_y+.007,bow_z),(cx+direction*.018,bow_y-.003,bow_z-.001),(cx,bow_y,bow_z)]
  data=bpy.data.curves.new('Tied canvas lace bow','CURVE');data.dimensions='3D';data.bevel_depth=.0012;data.bevel_resolution=1;spline=data.splines.new('POLY');spline.points.add(len(points)-1)
  for point,co in zip(spline.points,points):point.co=(*co,1)
  obj=bpy.data.objects.new('Tied canvas lace bow',data);bpy.context.collection.objects.link(obj);obj.data.materials.append(lace)
  bpy.ops.object.select_all(action='DESELECT');obj.select_set(True);bpy.context.view_layer.objects.active=obj;bpy.ops.object.convert(target='MESH');parts.append(obj)
tab=object_from('Canvas tongue tab',records['GEO-rex_shoes_tab'],[cloth]);reduce_garment(tab,min(1,220/sum(len(p.vertices)-2 for p in tab.data.polygons)));parts.append(tab)
for obj in parts:bind_foot(obj)
body=parts[0]
for obj in [body,tab]:
    for corner in obj.data.uv_layers[0].data:corner.uv*=4
control=bpy.data.materials.new('Unused canvas stitch bake control');control.use_nodes=True
parts=cloth_atlas(body,parts,cloth,control,'authored-canvas',high_uv_scale=4,roughness_range=(.88,.97))
export_item(rig,parts,'shoes-canvas-low')
bpy.ops.wm.save_as_mainfile(filepath=str(RAW/'authored-canvas-study.blend'),compress=True)
provenance=json.loads((ROOT/'assets/wardrobe-source/licenses/rex-provenance.json').read_text())
assert provenance['sourceSHA256']==source_data['sourceSHA256']
(ROOT/'docs/characters/wardrobe/clothing-fit/canvas-source.json').write_text(json.dumps({
    **provenance,
    'source':'https://studio.blender.org/characters/rex/v1/',
    'license':'https://creativecommons.org/licenses/by/4.0/',
    'credit':'Rex, Sprite Fright — Blender Studio',
    'adaptation':'Shoe mesh data only; fitted to canonical feet, recoloured and surface-baked. Source rig/scripts/animation are excluded.',
    'stage':'Unaccepted visual study',
},indent=2)+'\n')
