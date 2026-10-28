import bpy,json
from pathlib import Path
root=Path('/Users/claumarin/Documents/ChatGPT/multiplayer-game')
bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.ops.import_scene.gltf(filepath=str(root/'assets/character-source/human_male.glb'))
for o in bpy.context.scene.objects:
 if o.type=='MESH':
  print('MESH',o.name,'vertices',len(o.data.vertices),'bounds',list(o.dimensions),'materials',[m.name for m in o.data.materials],flush=True)
  print('BBOX',[list(v) for v in o.bound_box],flush=True)
 if o.type=='ARMATURE':print('RIG',o.name,'bones',len(o.data.bones),'headbones',[b.name for b in o.data.bones if 'head' in b.name.lower()],flush=True)
print('ACTIONS',len(bpy.data.actions),[a.name for a in bpy.data.actions][:10],flush=True)
