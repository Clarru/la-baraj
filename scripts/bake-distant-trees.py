import bpy,math,json
from pathlib import Path
from mathutils import Vector
root=Path(__file__).resolve().parents[1];out=root/'apps/web/public/assets/impostors';out.mkdir(exist_ok=True)
manifest={}
for name in ['CommonTree_1','CommonTree_3','Pine_2','Pine_4']:
 bpy.ops.wm.read_factory_settings(use_empty=True)
 bpy.ops.import_scene.gltf(filepath=str(root/'assets/source-models/nature'/(name+'.gltf')))
 models=[o for o in bpy.context.scene.objects if o.type=='MESH']
 corners=[o.matrix_world@Vector(c) for o in models for c in o.bound_box];low=Vector(tuple(min(v[i] for v in corners) for i in range(3)));high=Vector(tuple(max(v[i] for v in corners) for i in range(3)));h=high.z-low.z;w=max(high.x-low.x,high.y-low.y)
 world=bpy.data.worlds.new('Overcast ambient');world.use_nodes=True;world.node_tree.nodes['Background'].inputs[0].default_value=(.72,.8,1,1);world.node_tree.nodes['Background'].inputs[1].default_value=.75;bpy.context.scene.world=world
 light_data=bpy.data.lights.new('Soft sun','SUN');light_data.energy=2;light_data.angle=.15;light=bpy.data.objects.new('Soft sun',light_data);bpy.context.collection.objects.link(light);light.rotation_euler=(math.radians(32),math.radians(-25),math.radians(-35))
 cam_data=bpy.data.cameras.new('Tree elevation');cam_data.type='ORTHO';cam_data.ortho_scale=h*1.08;cam=bpy.data.objects.new('Tree elevation',cam_data);bpy.context.collection.objects.link(cam);center=(low+high)*.5;cam.location=(center.x,-25,center.z);cam.rotation_euler=(center-cam.location).to_track_quat('-Z','Y').to_euler();bpy.context.scene.camera=cam
 scene=bpy.context.scene;scene.render.engine='BLENDER_EEVEE';scene.render.resolution_x=256;scene.render.resolution_y=384;scene.render.resolution_percentage=100;scene.render.film_transparent=True;scene.render.image_settings.file_format='PNG';scene.render.image_settings.color_mode='RGBA';scene.render.filepath=str(out/(name+'.png'));scene.view_settings.view_transform='AgX';bpy.ops.render.render(write_still=True)
 manifest[name]={'height':h*1.08,'width':h*1.08*256/384,'source':f'Quaternius Stylized Nature MegaKit: {name}.gltf','license':'CC0-1.0','method':'Blender orthographic RGBA bake; native alpha, not generated art'}
 print('BAKED',name,manifest[name],flush=True)
(out/'manifest.json').write_text(json.dumps(manifest,indent=2))
