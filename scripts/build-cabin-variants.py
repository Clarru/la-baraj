"""Build the three additional columns in cabin-variants-grid.png using the established cabin library."""
from pathlib import Path
import json
base=Path('/Users/claumarin/Documents/ChatGPT/multiplayer-game')
# Reuse established mesh/material construction, never execute its export/render driver.
exec((base/'scripts/build-reference-cabins.py').read_text().split('# Bake modifiers')[0])
red=material('Terracotta standing seam',(.34,.095,.055),.60,.25)
copper=material('Copper standing seam',(.38,.12,.065),.56,.32)
forestmetal=material('Forest standing seam',(.065,.14,.11),.58,.3)
blue=[material('Blue siding '+str(i),(.12+i*.012,.19+i*.012,.23+i*.012),wood=True) for i in range(4)]
cream=[material('Cream siding '+str(i),(.57+i*.018,.55+i*.017,.47+i*.015),wood=True) for i in range(3)]
def recolor(objects,prefixes,palette):
 for o in objects:
  if o.type=='MESH' and any(o.name.startswith(p) for p in prefixes):
   o.data.materials.clear();o.data.materials.append(palette[sum(map(ord,o.name))%len(palette)])
def deck_side(x0,x1,y0,y1):
 for j in range(math.ceil((y1-y0)/.25)):
  y=y0+.125+j*.25;box('Wraparound deck board',((x0+x1)/2,y,.57),(x1-x0,.235,.13),woods[j%4],.012)
 box('Side deck fascia',(x1,(y0+y1)/2,.48),(.15,y1-y0,.26),struct)
def side_canopy(x0,x1,y0,y1,z0,z1,roofmat):
 panel('Side veranda roof',[(x0,y0,z0),(x1,y0,z1),(x1,y1,z1),(x0,y1,z0)],roofmat,.10)
 for i in range(math.ceil((y1-y0)/.42)+1):
  y=y0+i*(y1-y0)/math.ceil((y1-y0)/.42)
  beam('Side roof seam',(x0,y,z0+.04),(x1,y,z1+.04),.035,roofmat)
 beam('Side eave fascia',(x1,y0,z1),(x1,y1,z1),.15,trim)
 for y in [y0+.15,(y0+y1)/2,y1-.15]:
  box('Side veranda post',(x1-.2,y,(.64+z1)/2),(.18,.18,z1-.64),struct)
 box('Side veranda header',(x1-.2,(y0+y1)/2,z1-.07),(.20,y1-y0,.20),struct)
def blue_gable():
 global roof
 old=roof;roof=red;before=set(bpy.context.scene.objects);build_gable();roof=old
 created=set(bpy.context.scene.objects)-before
 recolor(created,['Wall backing','Horizontal siding','Horizontal side siding'],blue)
 for o in list(created):
  if o.name.startswith(('Porch side handrail','Porch side baluster')) and o.location.x>0:bpy.data.objects.remove(o,do_unlink=True)
 deck_side(2.8,4.8,-4.9,2.7);side_canopy(2.8,5.0,-5.1,2.9,3.50,3.02,red)
 for y in [-2.5,-.5,1.5]:
  box('Wrap handrail',(4.6,y,1.48),(.1,1.7,.1),struct)
  for j in range(7):box('Wrap baluster',(4.6,y-.75+j*.24,1.05),(.06,.06,.8),struct,.008)
 cylinder('Outdoor side table',(3.7,.7,1.1),.35,.09,struct,16)
 cylinder('Side table leg',(3.7,.7,.86),.065,.5,trim)
 planter(4.3,2.0)
def copper_aframe():
 global greenroof,roof_gable
 old=greenroof;greenroof=copper;original=roof_gable
 def cover(w,y0,y1,eave,ridge,mat):original(w,-5.05 if abs(w-6.6)<.01 else y0,y1,eave,ridge,mat)
 roof_gable=cover;build_aframe();roof_gable=original;greenroof=old
 for x in [-1.9,1.9]:
  box('Covered A frame porch post',(x,-4.74,1.85),(.19,.19,2.43),struct)
  beam('Covered A frame knee brace',(x,-4.74,2.5),(x+(.45 if x<0 else -.45),-4.74,2.98),.12,struct)
 box('Covered A frame header',(0,-4.74,2.98),(4.02,.22,.22),struct)
 for i in range(5):cylinder('Sheltered log stack',(-2.6,-3.25,.78+i*.13),.08,.55,woods[i%4],8,(math.pi/2,0,0))
def cream_pergola():
 global roof
 old=roof;roof=forestmetal;before=set(bpy.context.scene.objects);build_sage();roof=old
 created=set(bpy.context.scene.objects)-before
 recolor(created,['Wall backing','Vertical front boards','Vertical side boards','Timber gable infill'],cream)
 for o in list(created):
  if o.name.startswith(('Offset porch roof','Porch roof seam','Porch fascia')):bpy.data.objects.remove(o,do_unlink=True)
 deck_side(3.2,5.45,-4.7,1.7)
 for x in [.22,3.15,5.25]:
  for y in [-4.48,1.5] if x>3.2 else [-4.48]:box('Pergola post',(x,y,1.85),(.18,.18,2.44),struct)
 for x in [3.15,5.25]:beam('Pergola side bearer',(x,-4.7,3.13),(x,1.75,3.13),.19,struct)
 beam('Pergola front bearer',(.12,-4.48,3.13),(5.45,-4.48,3.13),.20,struct)
 for i in range(10):
  y=-4.6+i*.67;beam('Side pergola rafter',(2.9,y,3.28),(5.6,y,3.28),.12,struct)
 for x in [.2,.75,1.3,1.85,2.4,2.95]:beam('Front pergola rafter',(x,-4.7,3.28),(x,-2.75,3.28),.11,struct)
 for i in range(34):
  y=-4.5+(i%12)*.52;x=5.3+math.sin(i*1.7)*.2;z=3.4-(i//12)*.42
  bpy.ops.mesh.primitive_ico_sphere_add(subdivisions=1,radius=.18,location=(x,y,z));o=bpy.context.object;o.name='Pergola vine';o.scale=(1.2,1.3,.48);o.data.materials.append(leaf)
 planter(5.0,1.1)

built=[]
for name,fn in [('GableBlue',blue_gable),('AFrameCopper',copper_aframe),('SagePergola',cream_pergola)]:
 before=set(bpy.context.scene.objects);fn();objects=list(set(bpy.context.scene.objects)-before)
 for o in bpy.context.scene.objects:o.select_set(False)
 for o in objects:
  if o.type!='MESH':continue
  bpy.context.view_layer.objects.active=o;o.select_set(True)
  for mod in list(o.modifiers):
   try:bpy.ops.object.modifier_apply(modifier=mod.name)
   except RuntimeError:pass
  o.select_set(False)
 meshes=[o for o in objects if o.type=='MESH']
 for o in meshes:o.select_set(True)
 bpy.context.view_layer.objects.active=meshes[0];bpy.ops.object.join();joined=bpy.context.object;joined.name='Cabin_'+name
 bpy.ops.object.transform_apply(location=True,rotation=True,scale=True)
 out=base/f'assets/house-source/Lake_Cabin_{name}.glb'
 bpy.ops.export_scene.gltf(filepath=str(out),export_format='GLB',use_selection=True,export_animations=False)
 joined.location.x=len(built)*13;built.append(joined)
# Append the accepted originals from a copy; keep a single six-design source library openable.
backup=base/'assets/blender/Accepted_Cabin_Library_Backup.blend';copyfile(base/'assets/blender/Reference_Cabin_Library.blend',backup)
with bpy.data.libraries.load(str(backup),link=False) as (source,target):target.objects=[n for n in source.objects if n in ['Cabin_Gable','Cabin_AFrame','Cabin_Sage']]
for i,o in enumerate(target.objects):
 if o:bpy.context.collection.objects.link(o);o.location.x=i*13;o.location.y+=14
bpy.ops.wm.save_as_mainfile(filepath=str(base/'assets/blender/Reference_Cabin_Library.blend'))
# Studio proof of only the new variants, preserving all source models above.
for o in target.objects:
 if o:o.hide_render=True
for name,loc,power,size in [('Key',(8,-14,18),2300,10),('Fill',(-8,-4,10),1200,8)]:
 data=bpy.data.lights.new(name,'AREA');data.energy=power;data.size=size;o=bpy.data.objects.new(name,data);bpy.context.collection.objects.link(o);o.location=loc;o.rotation_euler=(Vector((12,0,2))-o.location).to_track_quat('-Z','Y').to_euler()
world=bpy.data.worlds.new('Neutral daylight');world.use_nodes=True;world.node_tree.nodes['Background'].inputs[0].default_value=(.6,.65,.7,1);world.node_tree.nodes['Background'].inputs[1].default_value=.65;bpy.context.scene.world=world
bpy.ops.mesh.primitive_plane_add(size=200,location=(0,0,-.05));bpy.context.object.data.materials.append(material('Studio ground',(.38,.39,.37),.95))
camdata=bpy.data.cameras.new('New cabin variants');cam=bpy.data.objects.new('New cabin variants',camdata);bpy.context.collection.objects.link(cam);cam.location=(28,-39,22);cam.rotation_euler=(Vector((13,0,2.5))-cam.location).to_track_quat('-Z','Y').to_euler();camdata.type='ORTHO';camdata.ortho_scale=43
scene=bpy.context.scene;scene.camera=cam;scene.render.engine='CYCLES';scene.cycles.samples=20;scene.render.resolution_x=1800;scene.render.resolution_y=900;scene.render.resolution_percentage=100;scene.render.filepath=str(base/'docs/art-direction/cabin-variants-blender.png');bpy.ops.render.render(write_still=True)
print('Six-cabin library saved; three new variants exported',flush=True)
