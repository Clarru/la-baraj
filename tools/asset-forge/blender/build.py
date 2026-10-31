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
if spec['recipe'] == 'custom':
    module_spec = importlib.util.spec_from_file_location('asset_recipe', Path(job['project'])/'recipe.py')
    recipe = importlib.util.module_from_spec(module_spec)
    module_spec.loader.exec_module(recipe)
    sockets = recipe.build(SimpleNamespace(parts=parts, material=material, parameters=spec['parameters'], spec=spec, random=random.Random(spec['seed']))) or {}
else:
    sockets = getattr(golden, spec['recipe'])(material)
meshes = [o for o in bpy.context.scene.objects if o.type == 'MESH']
if not meshes:
    raise ValueError('Recipe produced no meshes')
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
