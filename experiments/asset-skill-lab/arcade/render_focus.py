"""Projection studies using the runtime camera's dimensions, not browser screenshots."""
import bpy,sys,math,json
from pathlib import Path
from mathutils import Vector
ROOT=Path(__file__).resolve().parents[3];HERE=Path(__file__).resolve().parent
sys.path.insert(0,str(ROOT/'.agents/skills/la-baraj-3d-assets/scripts'))
import inspect_asset
output=HERE/'focus';sys.argv=[__file__,'--',str(HERE/'cabinet-display-qa.glb'),str(output),'--views','']
inspect_asset.main()
scene=bpy.context.scene;camera=scene.camera;camera.data.type='PERSP';camera.data.sensor_fit='VERTICAL';camera.data.sensor_height=24;camera.data.lens=24/(2*math.tan(math.radians(25)))
target=Vector((0,-.181,1.321));studies=[]
for name,width,height in [('desktop',1440,900),('mobile',390,844)]:
    distance=max(1.12,.60/(2*math.tan(math.radians(25))*(width/height)*.94))
    camera.location=target+Vector((0,-math.cos(math.radians(8))*distance,math.sin(math.radians(8))*distance))
    camera.rotation_euler=(target-camera.location).to_track_quat('-Z','Y').to_euler()
    scene.render.resolution_x=width;scene.render.resolution_y=height;scene.render.filepath=str(output/f'{name}-projection.png')
    bpy.ops.render.render(write_still=True);studies.append({'name':name,'width':width,'height':height,'distance':distance,'verticalFov':50})
(output/'projection.json').write_text(json.dumps({'scope':'Blender projection study. Actual browser/input/rendering still requires shared preview QA.','studies':studies},indent=2))
