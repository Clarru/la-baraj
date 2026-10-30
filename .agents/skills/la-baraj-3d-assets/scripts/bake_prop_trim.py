"""Bake a matched four-strip albedo/normal/metallic-roughness set in Blender.

Blender CLI: -- input-generated-atlas.png output-directory
Own rounded canonical slabs provide tangent-space normals; no source maps are copied.
"""
import json
import sys
from pathlib import Path

import bpy

source, destination = map(Path, sys.argv[sys.argv.index("--") + 1:])
destination.mkdir(parents=True, exist_ok=True)
bpy.ops.wm.read_factory_settings(use_empty=True)
scene=bpy.context.scene
scene.render.engine='CYCLES'
scene.cycles.samples=16
scene.render.bake.use_selected_to_active=True
scene.render.bake.cage_extrusion=.035
scene.render.bake.max_ray_distance=.08
scene.render.bake.margin=2
scene.render.bake.normal_space='TANGENT'
scene.render.bake.normal_r='POS_X'
scene.render.bake.normal_g='POS_Y'
scene.render.bake.normal_b='POS_Z'
atlas=bpy.data.images.load(str(source.resolve()))
atlas.pack()
sources=[]
surface_data=[]

def scalar(nodes,links,operation,a,b=None):
    node=nodes.new('ShaderNodeMath');node.operation=operation
    for index,value in enumerate([a,b]):
        if value is None:continue
        if isinstance(value,(int,float)):node.inputs[index].default_value=value
        else:links.new(value,node.inputs[index])
    return node.outputs[0]

for strip in range(4):
    # Canonical planes have fixed UV density; the high-poly rounding is baked away.
    bpy.ops.mesh.primitive_cube_add(size=1, location=(strip*.25+.125,.5,-.03))
    obj=bpy.context.object;obj.name=f'High_rounding_{strip}'
    obj.dimensions=(.25,1,.06)
    bpy.ops.object.transform_apply(location=False,rotation=False,scale=True)
    bevel=obj.modifiers.new('Bake-only rounded perimeter','BEVEL')
    bevel.width=.014 if strip<2 else .005;bevel.segments=4
    bpy.ops.object.modifier_apply(modifier=bevel.name)
    for face in obj.data.polygons:face.use_smooth=True
    weighted=obj.modifiers.new('Preserve broad face normals','WEIGHTED_NORMAL')
    weighted.keep_sharp=True;weighted.weight=100
    bpy.ops.object.modifier_apply(modifier=weighted.name)
    uv=obj.data.uv_layers.active or obj.data.uv_layers.new(name='UVMap')
    uv.active_render=True
    for loop in obj.data.loops:
        position=obj.matrix_world @ obj.data.vertices[loop.vertex_index].co
        uv.data[loop.index].uv=(position.x,position.y)
    material=bpy.data.materials.new(f'Bake material {strip}');material.use_nodes=True
    obj.data.materials.append(material)
    nodes=material.node_tree.nodes;links=material.node_tree.links
    shader=nodes.get('Principled BSDF');output=nodes.get('Material Output')
    coordinates=nodes.new('ShaderNodeTexCoord')
    separate=nodes.new('ShaderNodeSeparateXYZ');links.new(coordinates.outputs['UV'],separate.inputs[0])
    u=scalar(nodes,links,'FRACT',scalar(nodes,links,'MULTIPLY',separate.outputs['X'],4))
    x_distance=scalar(nodes,links,'DIVIDE',scalar(nodes,links,'MINIMUM',u,scalar(nodes,links,'SUBTRACT',1,u)),4)
    y_distance=scalar(nodes,links,'MINIMUM',separate.outputs['Y'],scalar(nodes,links,'SUBTRACT',1,separate.outputs['Y']))
    distance=scalar(nodes,links,'MINIMUM',x_distance,y_distance)
    edge=nodes.new('ShaderNodeMapRange');edge.clamp=True;edge.interpolation_type='SMOOTHERSTEP'
    links.new(distance,edge.inputs['Value']);edge.inputs['From Min'].default_value=.001
    edge.inputs['From Max'].default_value=.016 if strip<2 else .007
    edge.inputs['To Min'].default_value=1;edge.inputs['To Max'].default_value=0
    noise=nodes.new('ShaderNodeTexNoise');noise.inputs['Scale'].default_value=95;noise.inputs['Detail'].default_value=2
    links.new(coordinates.outputs['UV'],noise.inputs['Vector'])
    wear=scalar(nodes,links,'MULTIPLY',edge.outputs['Result'],scalar(nodes,links,'ADD',.4,scalar(nodes,links,'MULTIPLY',noise.outputs['Fac'],.6)))
    texture=nodes.new('ShaderNodeTexImage');texture.image=atlas
    tint=nodes.new('ShaderNodeMixRGB');tint.blend_type='MULTIPLY';tint.inputs[0].default_value=1
    links.new(texture.outputs['Color'],tint.inputs[1])
    tint.inputs[2].default_value=([1.60,1.45,1.40,1] if strip==0 else ([1.03,.96,.86,1] if strip==1 else [1,1,1,1]))
    color=nodes.new('ShaderNodeMixRGB');color.blend_type='MIX'
    links.new(wear,color.inputs[0]);links.new(tint.outputs[0],color.inputs[1])
    color.inputs[2].default_value=(.39,.40,.43,1) if strip<2 else (.42,.235,.10,1)
    links.new(color.outputs[0],shader.inputs['Base Color'])
    center_roughness=.60 if strip==0 else (.46 if strip==1 else .82)
    roughness=scalar(nodes,links,'ADD',center_roughness,scalar(nodes,links,'MULTIPLY',wear,-.30 if strip==0 else (-.20 if strip==1 else -.12)))
    metallic=scalar(nodes,links,'ADD',.94 if strip<2 else 0,scalar(nodes,links,'MULTIPLY',wear,.06 if strip<2 else 0))
    links.new(roughness,shader.inputs['Roughness']);links.new(metallic,shader.inputs['Metallic'])
    dent=nodes.new('ShaderNodeTexNoise');dent.inputs['Scale'].default_value=14;dent.inputs['Detail'].default_value=1
    links.new(coordinates.outputs['UV'],dent.inputs['Vector'])
    bump=nodes.new('ShaderNodeBump');bump.inputs['Strength'].default_value=.35
    bump.inputs['Distance'].default_value=.006 if strip<2 else .004
    links.new(dent.outputs['Fac'] if strip<2 else texture.outputs['Color'],bump.inputs['Height'])
    links.new(bump.outputs['Normal'],shader.inputs['Normal'])
    surface_data.append((material,color.outputs[0],roughness,metallic))
    sources.append(obj)

mesh=bpy.data.meshes.new('Low bake plane')
mesh.from_pydata([(0,0,0),(1,0,0),(1,1,0),(0,1,0)],[],[(0,1,2,3)])
low=bpy.data.objects.new('Low bake plane',mesh);scene.collection.objects.link(low)
uv=mesh.uv_layers.new(name='UVMap')
for loop in mesh.loops:uv.data[loop.index].uv=mesh.vertices[loop.vertex_index].co.xy
target_material=bpy.data.materials.new('Bake target');target_material.use_nodes=True
low.data.materials.append(target_material)
target_node=target_material.node_tree.nodes.new('ShaderNodeTexImage')
target_material.node_tree.nodes.active=target_node
for obj in scene.objects:obj.select_set(False)
for obj in sources+[low]:obj.select_set(True)
bpy.context.view_layer.objects.active=low

for role in ['normal','base-color','metallic-roughness']:
    image=bpy.data.images.new(f'LaBaraj trim {role}',width=512,height=512,alpha=False)
    if role!='base-color':image.colorspace_settings.name='Non-Color'
    image.generated_color=(.5,.5,1,1) if role=='normal' else (1,1,1,1)
    target_node.image=image
    for material,color,roughness,metallic in surface_data:
        nodes=material.node_tree.nodes;links=material.node_tree.links;output=nodes.get('Material Output')
        for link in list(output.inputs['Surface'].links):links.remove(link)
        if role=='normal':links.new(nodes.get('Principled BSDF').outputs[0],output.inputs['Surface'])
        else:
            emission=nodes.new('ShaderNodeEmission');emission.inputs['Strength'].default_value=1
            if role=='base-color':links.new(color,emission.inputs['Color'])
            else:
                combine=nodes.new('ShaderNodeCombineColor');combine.mode='RGB'
                combine.inputs['Red'].default_value=1
                links.new(roughness,combine.inputs['Green']);links.new(metallic,combine.inputs['Blue'])
                links.new(combine.outputs[0],emission.inputs['Color'])
            links.new(emission.outputs[0],output.inputs['Surface'])
    bpy.ops.object.bake(type='NORMAL' if role=='normal' else 'EMIT')
    image.filepath_raw=str((destination/f'trim-{role}.png').resolve());image.file_format='PNG';image.save()
    print('BAKED',role,flush=True)
(destination/'recipe.json').write_text(json.dumps({
    'source':source.name,'method':'Own rounded canonical slabs selected-to-active Cycles bake; edge-aware emission color and metallic/roughness. No reference texture maps copied.',
    'size':[512,512],'metal_roughness_center':.60,'metal_roughness_worn_edge':.30,'metallic_center':.94,'metallic_worn_edge':1,
    'normal_space':'tangent +X +Y +Z','high_poly_bevel_m':.014,'UV_layout':'four equal vertical strips: iron-body, iron-edge, timber-light, timber-dark',
    'body_linear_RGB_calibration':[1.60,1.45,1.40],'light_trim_linear_RGB_calibration':[1.03,.96,.86],
    'calibration_reason':'Source unlit top metal-trim mean sRGB [131.8,124.8,134.1] versus earlier own body [105.3,105.0,115.0]. Tune the surface, not camera exposure.',
    'red_channel':'neutral occlusion value 1, not baked AO'
},indent=2)+'\n')
bpy.ops.wm.save_as_mainfile(filepath=str((destination/'trim-bake-source.blend').resolve()))
