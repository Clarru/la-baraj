"""Bake dense cloth and sewn details into one neutral game material atlas."""
import bpy,bmesh,math
from mathutils.kdtree import KDTree
from pathlib import Path
from wardrobe_rig import duplicate,RAW

def prepare_cloth_surface(garment,budget=6000):
    """Keep a dense source, reduce the thin runtime surface, then turn its edges."""
    from wardrobe_surfaces import reduce_garment
    high=duplicate(garment,'High cotton cloth bake source')
    high['wardrobeRole']='bake-source'
    bpy.ops.object.select_all(action='DESELECT');high.select_set(True);bpy.context.view_layer.objects.active=high
    shell=high.modifiers.new('High cloth thickness','SOLIDIFY');shell.thickness=.002;shell.offset=-1;bpy.ops.object.modifier_apply(modifier=shell.name)
    high.hide_render=True;high.hide_set(True)
    garment.select_set(True);bpy.context.view_layer.objects.active=garment
    triangles=sum(len(face.vertices)-2 for face in garment.data.polygons)
    reduce_garment(garment,min(1,budget/max(1,triangles)))
    bm=bmesh.new();bm.from_mesh(garment.data);bm.normal_update()
    boundary=[edge for edge in bm.edges if edge.is_boundary];vertices=list({v for edge in boundary for v in edge.verts})
    kd=KDTree(len(vertices));normals=[v.normal.copy()for v in vertices]
    for i,v in enumerate(vertices):kd.insert(v.co,i)
    kd.balance();result=bmesh.ops.extrude_edge_only(bm,edges=boundary)
    for vertex in[item for item in result['geom']if isinstance(item,bmesh.types.BMVert)]:
        _,index,_=kd.find(vertex.co);vertex.co-=normals[index]*.002
    bm.to_mesh(garment.data);bm.free()
    return high

def cloth_atlas(body,parts,cloth,thread,identifier,high_uv_scale=2.4,roughness_range=(.84,.94),bake_margin=4):
    high=bpy.data.objects.get('High cotton cloth bake source')
    if high is None:raise RuntimeError('Missing dense cloth bake source')
    out=RAW/'bakes'/identifier;out.mkdir(parents=True,exist_ok=True)
    high_material=cloth.copy();high_material.name=identifier+' neutral high cloth'
    multiply=next(n for n in high_material.node_tree.nodes if n.type=='MIX'and n.data_type=='RGBA')
    factor=next(s for s in multiply.inputs if s.name=='B'and s.type=='RGBA');factor.default_value=(1,1,1,1)
    high.data.materials.clear();high.data.materials.append(high_material)
    for corner in high.data.uv_layers[0].data:corner.uv*=high_uv_scale
    sources=[high]
    for obj in list(parts):
        if obj==body:continue
        if len(obj.data.materials)==1 and obj.data.materials[0]==cloth:
            copy=duplicate(obj,'High detail '+obj.name);copy.data.materials[0]=high_material;sources.append(copy)
    high_thread=thread.copy();high_thread.name=identifier+' neutral high thread'
    high_thread.node_tree.nodes.get('Principled BSDF').inputs['Base Color'].default_value=(.38,.38,.38,1)
    stitches=[o for o in parts if len(o.data.materials)==1 and o.data.materials[0]==thread]
    for obj in stitches:
        copy=duplicate(obj,'High stitch '+obj.name);copy.data.materials[0]=high_thread;sources.append(copy)
    parts=[o for o in parts if o not in stitches]
    for obj in stitches:bpy.data.objects.remove(obj,do_unlink=True)
    cloth_parts=[o for o in parts if len(o.data.materials)==1 and o.data.materials[0]==cloth]
    remaining=[o for o in parts if o not in cloth_parts]
    bpy.ops.object.select_all(action='DESELECT')
    for obj in cloth_parts:obj.select_set(True)
    bpy.context.view_layer.objects.active=body;bpy.ops.object.join();parts=[body,*remaining]
    uv=body.data.uv_layers.new(name='GarmentSurface');body.data.uv_layers.active=uv
    bpy.ops.object.mode_set(mode='EDIT');bpy.ops.mesh.select_all(action='SELECT');bpy.ops.uv.smart_project(angle_limit=math.radians(66),island_margin=max(.006,bake_margin/1024));bpy.ops.object.mode_set(mode='OBJECT')
    body.data.uv_layers['GarmentSurface'].active_render=True
    for obj in bpy.context.scene.objects:
        if obj.type=='MESH':obj.hide_render=obj not in parts and obj not in sources
    for obj in sources:obj.hide_set(False)
    scene=bpy.context.scene;scene.render.engine='CYCLES';scene.cycles.samples=8;scene.render.threads_mode='FIXED';scene.render.threads=4
    scene.render.bake.margin=bake_margin;scene.render.bake.normal_space='TANGENT'
    nodes,links=cloth.node_tree.nodes,cloth.node_tree.links
    shader=next(n for n in nodes if n.type=='BSDF_PRINCIPLED');output=next(n for n in nodes if n.type=='OUTPUT_MATERIAL')
    original_mix=next(n for n in nodes if n.type=='MIX'and n.data_type=='RGBA')
    source_color=next(s for s in original_mix.inputs if s.name=='A'and s.type=='RGBA').links[0].from_node
    source_uv=nodes.new('ShaderNodeUVMap');source_uv.uv_map=body.data.uv_layers[0].name
    links.new(source_uv.outputs['UV'],source_color.inputs['Vector'])
    original_factor=tuple(next(s for s in original_mix.inputs if s.name=='B'and s.type=='RGBA').default_value)
    def image_node(name,data=False):
        image=bpy.data.images.new(identifier+' '+name,width=1024,height=1024,alpha=False)
        image.colorspace_settings.name='Non-Color'if data else'sRGB'
        node=nodes.new('ShaderNodeTexImage');node.image=image;nodes.active=node
        return image,node
    def select_sources():
        bpy.ops.object.select_all(action='DESELECT')
        for obj in sources:obj.select_set(True)
        body.select_set(True);bpy.context.view_layer.objects.active=body
    def save(image,name):
        image.filepath_raw=str(out/(name+'.png'));image.file_format='PNG';image.save()
    normal_image,normal_texture=image_node('normal',True);normal_image.generated_color=(.5,.5,1,1);normal_image.update();select_sources()
    bpy.ops.object.bake(type='NORMAL',use_clear=False,use_selected_to_active=True,cage_extrusion=.012,max_ray_distance=.03,uv_layer='GarmentSurface')
    save(normal_image,'normal')
    color_image,color_texture=image_node('neutral albedo')
    # Preserve a neutral textile background in the gutter at reduced mip levels.
    # The source and target share sRGB image encoding; do not use black padding.
    import numpy as np
    source_image=source_color.image
    source_pixels=np.empty(len(source_image.pixels),dtype=np.float32)
    source_image.pixels.foreach_get(source_pixels)
    neutral=source_pixels.reshape(-1,source_image.channels)[:,:3].mean(axis=0)
    color_image.generated_color=(*map(float,neutral),1);color_image.update();select_sources()
    bpy.ops.object.bake(type='DIFFUSE',pass_filter={'COLOR'},use_clear=False,use_selected_to_active=True,cage_extrusion=.012,max_ray_distance=.03,uv_layer='GarmentSurface')
    save(color_image,'albedo')
    # AO is evaluated on the low garment and the sewn thread sources, avoiding
    # a coincident dense body casting a false shadow over the entire target.
    for obj in sources:obj.hide_render=not obj.name.startswith('High stitch ');obj.select_set(False)
    body.select_set(True);bpy.context.view_layer.objects.active=body
    ao=nodes.new('ShaderNodeAmbientOcclusion');ao.inputs['Distance'].default_value=.025;ao.samples=16
    fabric=source_color
    luminance=nodes.new('ShaderNodeRGBToBW');links.new(fabric.outputs['Color'],luminance.inputs[0])
    roughness=nodes.new('ShaderNodeMapRange');roughness.inputs['From Min'].default_value=0;roughness.inputs['From Max'].default_value=1;roughness.inputs['To Min'].default_value=roughness_range[0];roughness.inputs['To Max'].default_value=roughness_range[1];links.new(luminance.outputs[0],roughness.inputs['Value'])
    channels=nodes.new('ShaderNodeCombineColor');links.new(ao.outputs['AO'],channels.inputs['Red']);links.new(roughness.outputs['Result'],channels.inputs['Green']);channels.inputs['Blue'].default_value=0
    emission=nodes.new('ShaderNodeEmission');links.new(channels.outputs[0],emission.inputs['Color']);links.new(emission.outputs[0],output.inputs['Surface'])
    orm_image,orm_texture=image_node('occlusion roughness metalness',True)
    orm_image.generated_color=(1,sum(roughness_range)/2,0,1);orm_image.update();scene.cycles.samples=16
    bpy.ops.object.bake(type='EMIT',use_clear=False,use_selected_to_active=False,uv_layer='GarmentSurface');save(orm_image,'orm')
    # Replace the source weave graph with the baked, neutral atlas. All three
    # channels use the same unique UV set; player dyes remain material factors.
    nodes.clear();shader=nodes.new('ShaderNodeBsdfPrincipled');output=nodes.new('ShaderNodeOutputMaterial');links.new(shader.outputs['BSDF'],output.inputs['Surface']);shader.inputs['Specular IOR Level'].default_value=.22
    uv_node=nodes.new('ShaderNodeUVMap');uv_node.uv_map='GarmentSurface'
    textures=[]
    for image in[color_image,normal_image,orm_image]:
        node=nodes.new('ShaderNodeTexImage');node.image=image;links.new(uv_node.outputs['UV'],node.inputs['Vector']);textures.append(node)
    mix=nodes.new('ShaderNodeMix');mix.data_type='RGBA';mix.blend_type='MULTIPLY';mix.inputs[0].default_value=1
    a=next(s for s in mix.inputs if s.name=='A'and s.type=='RGBA');b=next(s for s in mix.inputs if s.name=='B'and s.type=='RGBA');b.default_value=original_factor;links.new(textures[0].outputs['Color'],a);links.new(next(s for s in mix.outputs if s.type=='RGBA'),shader.inputs['Base Color'])
    normal=nodes.new('ShaderNodeNormalMap');normal.uv_map='GarmentSurface';links.new(textures[1].outputs['Color'],normal.inputs['Color']);links.new(normal.outputs['Normal'],shader.inputs['Normal'])
    separate=nodes.new('ShaderNodeSeparateColor');links.new(textures[2].outputs['Color'],separate.inputs['Color']);links.new(separate.outputs['Green'],shader.inputs['Roughness']);links.new(separate.outputs['Blue'],shader.inputs['Metallic'])
    group=bpy.data.node_groups.new('glTF Material Output','ShaderNodeTree');group.interface.new_socket(name='Occlusion',in_out='INPUT',socket_type='NodeSocketFloat')
    settings=nodes.new('ShaderNodeGroup');settings.node_tree=group;links.new(separate.outputs['Red'],settings.inputs['Occlusion'])
    for obj in sources:obj['wardrobeRole']='bake-source';obj.hide_render=True;obj.hide_set(True);obj.select_set(False)
    body.data.uv_layers.active_index=0
    return parts
