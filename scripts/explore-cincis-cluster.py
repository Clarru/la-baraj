import bpy, math, random, os
from pathlib import Path
ROOT = Path(__file__).resolve().parent.parent
ART = ROOT / "docs/art-direction/trees"
OUT = Path(os.environ.get("LA_BARAJ_SAPLING_OUTPUT", ART))
SOURCE = Path(os.environ.get("LA_BARAJ_SAPLING_SOURCE", ROOT / "assets/blender"))
OUT.mkdir(parents=True, exist_ok=True)
SOURCE.mkdir(parents=True, exist_ok=True)
bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.ops.preferences.addon_enable(module='add_curve_sapling')
bpy.ops.curve.tree_add(bevel=True,showLeaves=True,seed=7,levels=3,shape='2',scale=6.0,scaleV=0,ratio=.065,baseSize=.30,baseSplits=0,segSplits=(.2,.12,0,0),branches=(0,18,7,0),curveRes=(5,3,2,1),curve=(5,-30,-20,0),curveV=(15,35,30,0),downAngle=(0,68,42,0),downAngleV=(0,20,15,0),length=(1,.85,.58,.4),lengthV=(0,.15,.2,0),bevelRes=0,resU=2,leaves=40,leafScale=.85,leafScaleX=1.0,leafDist="3",leafDownAngle=70,leafDownAngleV=25,leafRotateV=35,leafShape='rect',leafScaleV=.25)
for o in bpy.context.scene.objects:
    if o.type=='CURVE':
        bpy.context.view_layer.objects.active=o;o.select_set(True);bpy.ops.object.convert(target='MESH');o.select_set(False)
objects=[o for o in bpy.context.scene.objects if o.type=='MESH']
for o in objects:
    print('TREE MESH',o.name,len(o.data.vertices),len(o.data.polygons),flush=True)
    mat=bpy.data.materials.new(o.name);mat.diffuse_color=(.31,.24,.14,1) if 'tree' in o.name.lower() else (.22,.37,.10,1);mat.use_nodes=True;bsdf=mat.node_tree.nodes.get('Principled BSDF');bsdf.inputs['Base Color'].default_value=mat.diffuse_color;bsdf.inputs['Roughness'].default_value=1;o.data.materials.append(mat)
    if o.name.lower().startswith('leav'):
        print('UV layers', len(o.data.uv_layers),flush=True)
        nodes=mat.node_tree.nodes; image=nodes.new('ShaderNodeTexImage'); image.image=bpy.data.images.load(str(ART / 'oak-leaf-cluster.png')); image.image.pack()
        mat.node_tree.links.new(image.outputs['Color'],bsdf.inputs['Base Color']);mat.node_tree.links.new(image.outputs['Alpha'],bsdf.inputs['Alpha'])
        mat.blend_method='CLIP';mat.alpha_threshold=.38;mat.use_backface_culling=False
bpy.ops.object.select_all(action='DESELECT')
for o in objects:o.select_set(True)
bpy.context.view_layer.objects.active=objects[0]
bpy.ops.export_scene.gltf(filepath=str(OUT / 'cincis-oak-cluster-v2.glb'),export_format='GLB',use_selection=True)
bpy.ops.wm.save_as_mainfile(filepath=str(SOURCE / 'cincis-oak-cluster-v2.blend'))
