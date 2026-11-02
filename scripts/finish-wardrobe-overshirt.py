"""Sewn finishing and a separate UV channel for measured garment occlusion."""
import bpy,math,sys,shutil
from pathlib import Path
from mathutils import Vector
from mathutils.bvhtree import BVHTree
assert bpy.app.background, 'Run this authoring script with Blender --background'
ROOT=Path(__file__).resolve().parents[1];sys.path.insert(0,str(ROOT/'scripts'))
assert shutil.disk_usage(ROOT).free>4*1024**3+128*1024**2
from wardrobe_rig import RAW,role,export_item
from wardrobe_surfaces import Surface,bind_surface
parts=[o for o in bpy.context.scene.objects if o.type=='MESH'and o.get('wardrobeRole')=='top']
body=next(o for o in parts if o.name.startswith('Fitted cotton shirt cage'));rig=body.parent;cloth=body.data.materials[0]
# The fabric normal was baked on a 10 cm patch. Match that density on each
# pattern piece rather than stretching the same weave across an entire collar.
for obj in parts:
    if len(obj.data.materials)!=1 or obj.data.materials[0]!=cloth:continue
    scale=(2.4,2.4)
    if obj.name.startswith('Sewn 15 mm'):scale=(5,.15)
    elif obj.name.startswith('Folded shirt collar'):scale=(5,.45)
    elif obj.name.startswith('Cotton chest pocket')or obj.name.startswith('Cotton pocket flap'):scale=(1.5,1.5)
    elif obj.name.startswith('Turned cotton sleeve cuff'):scale=(3,.4)
    for corner in obj.data.uv_layers[0].data:
        corner.uv.x*=scale[0];corner.uv.y*=scale[1]
def tree(obj):
    obj.data.calc_loop_triangles()
    return BVHTree.FromPolygons([v.co.copy()for v in obj.data.vertices],[list(t.vertices)for t in obj.data.loop_triangles],all_triangles=True)
def attach(obj,reference=body):
    bind_surface(obj,reference,rig);role(obj,'top');parts.append(obj);return obj
# Back structure is retained in the connected garment; no floating overlays.
thread=bpy.data.materials.new('Wardrobe_Overshirt_Navy_Stitch');thread.use_nodes=True
thread.node_tree.nodes.get('Principled BSDF').inputs['Base Color'].default_value=(.035,.050,.075,1)
thread.node_tree.nodes.get('Principled BSDF').inputs['Roughness'].default_value=.95
def stitch_path(name,points,reference):
    reference_tree=tree(reference);distance=[0]
    for a,b in zip(points,points[1:]):distance.append(distance[-1]+(b-a).length)
    def at(d):
        index=next(i for i in range(len(points)-1)if distance[i+1]>=d)
        return points[index].lerp(points[index+1],(d-distance[index])/(distance[index+1]-distance[index]))
    s=Surface();d=.002
    while d+.002<distance[-1]:
        a,b=at(d),at(d+.002);mid=(a+b)*.5;_,normal,_,_=reference_tree.find_nearest(mid)
        tangent=(b-a).normalized();across=normal.cross(tangent).normalized()*.00030
        a+=normal*.0006;b+=normal*.0006
        ids=[s.point(p)for p in[a-across,b-across,b+across,a+across]];s.face(ids,[(0,0),(1,0),(1,1),(0,1)]);d+=.0045
    if s.faces:attach(s.object(name,thread),reference)
leaf=next(o for o in parts if o.name.startswith('Folded shirt collar leaf'))
edge=[leaf.data.vertices[4*48+j].co.lerp(leaf.data.vertices[3*48+j].co,.18)for j in range(48)]
stitch_path('Collar leaf edge stitching',edge,leaf)
for pocket in [o for o in parts if o.name.startswith('Cotton chest pocket')]:
    indices=[k*9 for k in range(9)]+[8*9+j for j in range(1,9)]+[k*9+8 for k in range(7,-1,-1)]
    points=[pocket.data.vertices[i].co.copy()for i in indices]
    centre=sum(points,Vector())/len(points);points=[p.lerp(centre,.045)for p in points]
    stitch_path('Turned pocket edge stitching',points,pocket)
overlap=next(o for o in parts if o.name.startswith('Shirt button overlap'))
for edge in [0,1]:
    stitch_path('Button placket edge stitching',[overlap.data.vertices[k*2+edge].co.copy()for k in range(6)],overlap)
from wardrobe_cloth_bake import cloth_atlas
parts=cloth_atlas(body,parts,cloth,thread,'pattern-overshirt')
export_item(rig,parts,'top-trail-overshirt')
bpy.ops.wm.save_as_mainfile(filepath=str(RAW/'pattern-overshirt-finished-study.blend'),compress=True)
