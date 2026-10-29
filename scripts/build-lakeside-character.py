"""Adapt a licensed universal humanoid in Blender, keeping the rig and authored clips."""
import bpy,bmesh,math
from pathlib import Path
from mathutils import Vector
root=Path(__file__).resolve().parents[1]
bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.ops.import_scene.gltf(filepath=str(root/'assets/character-source/human_male.glb'))
rig=next(o for o in bpy.context.scene.objects if o.type=='ARMATURE')
body=next(o for o in bpy.context.scene.objects if o.type=='MESH' and o.name.startswith('SuperHero'))
for o in list(bpy.context.scene.objects):
 if o.type=='MESH' and not o.vertex_groups:bpy.data.objects.remove(o,do_unlink=True)
if rig.animation_data:
 rig.animation_data.action=None
 for track in rig.animation_data.nla_tracks:track.mute=True
for bone in rig.pose.bones:
 bone.location=(0,0,0);bone.rotation_quaternion=(1,0,0,0);bone.scale=(1,1,1)
bpy.context.view_layer.update()

def material(name,color,roughness=.82):
 m=bpy.data.materials.new(name);m.diffuse_color=(*color,1);m.use_nodes=True;p=m.node_tree.nodes.get('Principled BSDF');p.inputs['Base Color'].default_value=(*color,1);p.inputs['Roughness'].default_value=roughness;return m
shirt_mat=material('Lake_overshirt_slate_blue',(.08,.18,.24));pants_mat=material('Lake_trousers_charcoal',(.075,.09,.095));hair_mat=material('Lake_hair_dark_brown',(.035,.022,.016));shoe_mat=material('Lake_shoes_charcoal',(.045,.05,.055),.6)

def rebind_mesh(obj, source_rig):
 # Convert the source bind shape to the destination skeleton before changing rigs.
 # Shared bone names do not imply identical bind positions or finger orientations.
 transforms={g.index: rig.data.bones[g.name].matrix_local @ source_rig.data.bones[g.name].matrix_local.inverted()
             for g in obj.vertex_groups if g.name in rig.data.bones and g.name in source_rig.data.bones}
 for vertex in obj.data.vertices:
  weights=[(g.weight,transforms[g.group]) for g in vertex.groups if g.group in transforms]
  total=sum(w for w,_ in weights)
  if total:
   source=vertex.co.copy();vertex.co=sum((w*(matrix @ source) for w,matrix in weights),Vector())/total
 world=obj.matrix_world.copy();obj.parent=rig;obj.matrix_world=world
 for modifier in obj.modifiers:
  if modifier.type=='ARMATURE':modifier.object=rig
 obj.data.update()

# Use an authored outfit rather than approximating clothing by slicing a body mesh.
# This is a rigged modular outfit on the same universal skeleton.
before=set(bpy.context.scene.objects)
bpy.ops.import_scene.gltf(filepath=str(root/'assets/character-source/outfit/Male_Peasant.gltf'))
new=set(bpy.context.scene.objects)-before
outfit_rig=next(o for o in new if o.type=='ARMATURE')
for obj in list(new):
 if obj.type=='MESH':
  if not obj.vertex_groups:
   bpy.data.objects.remove(obj,do_unlink=True);continue
  rebind_mesh(obj,outfit_rig)
  # Keep the artist's cloth textures/normal maps; tint the cloth toward lake workwear.
  for i,old in enumerate(obj.data.materials):
   if old and 'Peasant' in old.name:
    mat=old.copy();mat.name='Lake_workwear_'+obj.name;obj.data.materials[i]=mat
    if mat.use_nodes:
     bsdf=next((n for n in mat.node_tree.nodes if n.type=='BSDF_PRINCIPLED'),None)
     if bsdf:
      bsdf.inputs['Roughness'].default_value=.85
      links=list(bsdf.inputs['Base Color'].links)
      if links:
       source=links[0].from_socket;mat.node_tree.links.remove(links[0])
       mix=mat.node_tree.nodes.new('ShaderNodeMixRGB');mix.blend_type='MULTIPLY';mix.inputs[0].default_value=.55
       mix.inputs[2].default_value=(.22,.40,.48,1) if 'Body' in obj.name or 'Arms' in obj.name else (.25,.28,.30,1)
       mat.node_tree.links.new(source,mix.inputs[1]);mat.node_tree.links.new(mix.outputs[0],bsdf.inputs['Base Color'])
  for f in obj.data.polygons:f.use_smooth=True
bpy.data.objects.remove(outfit_rig,do_unlink=True)
# Retain only the base head and neck. The authored outfit supplies torso, arms, hands and legs.
bm=bmesh.new();bm.from_mesh(body.data)
head_ids={g.index for g in body.vertex_groups if g.name=='Head' or 'neck' in g.name.lower()}
deform=bm.verts.layers.deform.active
def head_weight(v):return sum(v[deform].get(i,0) for i in head_ids) if deform else 0
bmesh.ops.delete(bm,geom=[f for f in bm.faces if sum(head_weight(v) for v in f.verts)/len(f.verts)<.45],context='FACES')
bm.to_mesh(body.data);bm.free()
for name in ['Hair_SimpleParted','Hair_Beard']:
 before=set(bpy.context.scene.objects);bpy.ops.import_scene.gltf(filepath=str(root/'assets/character-source/hair'/(name+'.gltf')))
 new=set(bpy.context.scene.objects)-before
 hair_rig=next(o for o in new if o.type=='ARMATURE')
 for obj in list(new):
  if obj.type=='MESH':
   obj.name='Hairstyle_'+name;obj.data.materials.clear();obj.data.materials.append(hair_mat)
   rebind_mesh(obj,hair_rig)
   for f in obj.data.polygons:f.use_smooth=True
 for obj in list(new):
  if obj.type=='ARMATURE':bpy.data.objects.remove(obj,do_unlink=True)
for obj in bpy.context.scene.objects:
 if obj.type=='MESH' and 'Eyebrow' in obj.name:obj.data.materials.clear();obj.data.materials.append(hair_mat)
keep={'Idle_Loop':'Idle_Neutral','Walk_Loop':'Walk','Jog_Fwd_Loop':'Jog','Sprint_Loop':'Run','Punch_Jab':'Punch_Left','Punch_Cross':'Punch_Right','Hit_Chest':'HitRecieve','Jump_Start':'Jump_Start','Jump_Loop':'Jump_Loop','Jump_Land':'Jump_Land','Idle_Talking_Loop':'Wave'}
for action in list(bpy.data.actions):
 if action.name not in keep:bpy.data.actions.remove(action,do_unlink=True)
 else:action.name=keep[action.name]
# Normalize imported animation track names to the retained actions.
if rig.animation_data:
 for track in list(rig.animation_data.nla_tracks):
  if not track.strips or track.strips[0].action is None:rig.animation_data.nla_tracks.remove(track)
  else:track.name=track.strips[0].action.name
character=[o for o in bpy.context.scene.objects if o.type in {'MESH','ARMATURE'}]
for obj in bpy.context.scene.objects:obj.select_set(False)
for obj in character:obj.select_set(True)
bpy.context.view_layer.objects.active=rig
out=root/'assets/character-source/Lakeside_Man.glb'
bpy.ops.export_scene.gltf(filepath=str(out),export_format='GLB',use_selection=True,export_animations=True)
print('EXPORTED',out,out.stat().st_size,flush=True)
# Save an editable studio scene with the authored idle pose.
idle=bpy.data.actions.get('Idle_Neutral')
if rig.animation_data and idle:
 for t in rig.animation_data.nla_tracks:t.mute=True
 rig.animation_data.action=idle
bpy.context.scene.frame_set(1)
bpy.ops.mesh.primitive_plane_add(size=200,location=(0,0,-.012));floor=bpy.context.object;floor.name='Studio floor - not exported';floor.data.materials.append(material('Studio',(.12,.145,.16),.95))
world=bpy.data.worlds.new('Studio world');world.use_nodes=True;world.node_tree.nodes['Background'].inputs[0].default_value=(.26,.3,.34,1);world.node_tree.nodes['Background'].inputs[1].default_value=.5;bpy.context.scene.world=world
for name,location,power,size in [('Key',(3,-4,5),500,4),('Fill',(-3,-2,3),260,3),('Rim',(2,3,4),400,2)]:
 data=bpy.data.lights.new(name,'AREA');data.energy=power;data.shape='DISK';data.size=size;obj=bpy.data.objects.new(name,data);bpy.context.collection.objects.link(obj);obj.location=location;obj.rotation_euler=(Vector((0,0,1))-obj.location).to_track_quat('-Z','Y').to_euler()
cam_data=bpy.data.cameras.new('Character review');cam=bpy.data.objects.new('Character review',cam_data);bpy.context.collection.objects.link(cam);cam.location=(2.5,-4.3,2.1);cam.rotation_euler=(Vector((0,0,.98))-cam.location).to_track_quat('-Z','Y').to_euler();cam_data.lens=65;bpy.context.scene.camera=cam
scene=bpy.context.scene;scene.render.engine='CYCLES';scene.cycles.samples=24;scene.render.resolution_x=600;scene.render.resolution_y=800;scene.render.resolution_percentage=100;scene.render.image_settings.file_format='PNG';scene.render.filepath=str(root/'docs/feasibility/character-v2.png')
bpy.ops.wm.save_as_mainfile(filepath=str(root/'assets/blender/Lakeside_Character.blend'))
bpy.ops.render.render(write_still=True)
