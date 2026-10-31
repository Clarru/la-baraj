"""Trusted local recipe runner. Never used for player uploads or live-world generation."""
import importlib.util
import json
import sys
sys.dont_write_bytecode = True
from pathlib import Path
from types import SimpleNamespace
import random
import bpy
from mathutils import Vector
sys.path.insert(0, str(Path(__file__).resolve().parent))
sys.dont_write_bytecode = True
import parts
import golden

job = json.loads(Path(sys.argv[sys.argv.index('--') + 1]).read_text())
spec, output, style = job['spec'], Path(job['output']), Path(job['style'])
bpy.ops.wm.read_factory_settings(use_empty=True)
random.seed(spec['seed'])
material = parts.atlas_material(style/'trim-base-color.png', style/'trim-normal.png', style/'trim-metallic-roughness.png')
joints = {}
if spec['recipe']=='custom':material['forge_texel_density']=json.loads((style/'profile.json').read_text())['woodTexelDensityCustom']
cloth=bpy.data.materials.new('LaBaraj speaker cloth');cloth.use_nodes=True
shader=cloth.node_tree.nodes.get('Principled BSDF');shader.inputs['Metallic'].default_value=0;shader.inputs['Roughness'].default_value=1
texture=cloth.node_tree.nodes.new('ShaderNodeTexImage');texture.image=bpy.data.images.load(str(style/'speaker-cloth.png'));texture.image.pack();cloth.node_tree.links.new(texture.outputs['Color'],shader.inputs['Base Color'])
if spec['recipe'] == 'custom':
    module_spec = importlib.util.spec_from_file_location('asset_recipe', Path(job['project'])/'recipe.py')
    recipe = importlib.util.module_from_spec(module_spec)
    module_spec.loader.exec_module(recipe)
    sockets = recipe.build(SimpleNamespace(parts=parts, material=material, parameters=spec['parameters'], spec=spec, random=random.Random(spec['seed']), materials={'iron':material,'cloth':cloth}, joints=joints)) or {}
else:
    sockets = getattr(golden, spec['recipe'])(material)
meshes = [o for o in bpy.context.scene.objects if o.type == 'MESH']
if not meshes:
    raise ValueError('Recipe produced no meshes')
if spec['recipe']=='custom' and len(meshes)>1 and not spec.get('requiredJoints'):
    raise ValueError('Multi-part custom assemblies must declare requiredJoints and export joint probes')
bpy.context.view_layer.update()
points = [o.matrix_world @ Vector(c) for o in meshes for c in o.bound_box]
low = Vector([min(p[i] for p in points) for i in range(3)])
high = Vector([max(p[i] for p in points) for i in range(3)])
shift = Vector(((low.x+high.x)/2, (low.y+high.y)/2, low.z))
for obj in list(bpy.context.scene.objects):
    if obj.parent is None:
        obj.location -= shift
sockets = {name: list(Vector(value)-shift) for name,value in sockets.items()}
bpy.context.view_layer.update()
parts.save_export(output, 'source', sockets)

# Export-space probes let the checker detect open slits in the actual optimized GLB.
probes=golden.crate_surface_probes() if spec['recipe']=='crate' else []
for probe in probes + [probe for checks in joints.values() for probe in checks]:
    point=Vector(probe['origin'])-shift
    direction=probe['direction']
    probe['origin']=[point.x,point.z,-point.y]
    probe['direction']=[direction[0],direction[2],-direction[1]]
socket_file=output/'source-sockets.json'
metadata=json.loads(socket_file.read_text());metadata['surfaceProbes']=probes
metadata['joints']=joints
socket_file.write_text(json.dumps(metadata,indent=2)+'\n')
