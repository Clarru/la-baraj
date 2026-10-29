"""Small compatible roof kit, built once in Blender and reused by seeded cabins."""
import bpy, math
from pathlib import Path
from mathutils import Vector
root=Path(__file__).resolve().parents[1]
bpy.ops.wm.read_factory_settings(use_empty=True)
def mat(name,color,metal=0):
 m=bpy.data.materials.new(name);m.diffuse_color=(*color,1);m.use_nodes=True
 p=m.node_tree.nodes.get('Principled BSDF');p.inputs['Base Color'].default_value=(*color,1);p.inputs['Roughness'].default_value=.72;p.inputs['Metallic'].default_value=metal
 return m
roofmat=mat('Weathered graphite roof',(.15,.19,.20),.25);trim=mat('Dark timber fascia',(.16,.12,.09));ridge=mat('Roof seam edges',(.20,.24,.25),.3)
def mesh(name,verts,faces,material):
 data=bpy.data.meshes.new(name);data.from_pydata(verts,[],faces);data.materials.append(material)
 o=bpy.data.objects.new(name,data);bpy.context.collection.objects.link(o)
 solid=o.modifiers.new('Roof thickness','SOLIDIFY');solid.thickness=.10
 bevel=o.modifiers.new('Soft light-catching edges','BEVEL');bevel.width=.025;bevel.segments=2
 return o
def beam(a,b,width,material):
 delta=Vector(b)-Vector(a);bpy.ops.mesh.primitive_cube_add(size=1,location=(Vector(a)+Vector(b))/2);o=bpy.context.object;o.name='Standing seam';o.dimensions=(width,width,delta.length);o.rotation_euler=delta.to_track_quat('Z','Y').to_euler();bpy.ops.object.transform_apply(location=False,rotation=False,scale=True);o.data.materials.append(material)
for index,(name,height,ridge_x) in enumerate([('Gable',1.35,0),('Low',.90,0),('Offset',1.15,-.55)]):
 before=set(bpy.context.scene.objects)
 for side in [-1,1]:
  x=2.55*side
  mesh('Roof surface',[(x,-3.05,0),(x,3.05,0),(ridge_x,3.05,height),(ridge_x,-3.05,height)],[(0,1,2,3)],roofmat)
  for i in range(13):
   y=-3.05+i*6.1/12
   beam((x,y,.035),(ridge_x,y,height+.035),.035,ridge)
  beam((x,-3.08,-.03),(x,3.08,-.03),.14,trim)
 for y in [-3.05,3.05]:
  beam((-2.55,y,0),(ridge_x,y,height),.13,trim);beam((ridge_x,y,height),(2.55,y,0),.13,trim)
 beam((ridge_x,-3.10,height+.055),(ridge_x,3.10,height+.055),.12,ridge)
 objects=list(set(bpy.context.scene.objects)-before)
 for o in bpy.context.scene.objects:o.select_set(False)
 for o in objects:o.select_set(True)
 bpy.context.view_layer.objects.active=objects[0]
 # Blender +Z up becomes browser +Y; keep artist units and common eave dimensions.
 path=root/f'apps/web/public/assets/optimized/Lake_Roof_{name}.glb'
 bpy.ops.export_scene.gltf(filepath=str(path),export_format='GLB',use_selection=True,export_animations=False,export_apply=True)
 group=bpy.data.objects.new('Roof_'+name,None);bpy.context.collection.objects.link(group)
 for o in objects:o.parent=group
 group.location.x=index*7
(root/'assets/blender').mkdir(exist_ok=True)
bpy.ops.wm.save_as_mainfile(filepath=str(root/'assets/blender/Cabin_Roof_Kit.blend'))
print('Exported three compatible roofs')
