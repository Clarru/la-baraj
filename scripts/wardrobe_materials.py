"""Shared generated fabric maps; colour remains a per-item glTF factor."""
from pathlib import Path
import bpy
ROOT=Path(__file__).resolve().parents[1]
def fabric_normal(material,fabric):
    path=ROOT/"assets/wardrobe-source/textures"/f"{fabric}-normal.png"
    if not path.exists():
        raise RuntimeError(f"Bake fabric tangent normals before authoring: {path}")
    nodes,links=material.node_tree.nodes,material.node_tree.links
    texture=nodes.new("ShaderNodeTexImage")
    texture.image=bpy.data.images.load(str(path),check_existing=True)
    texture.image.colorspace_settings.name="Non-Color"
    normal=nodes.new("ShaderNodeNormalMap")
    normal.inputs["Strength"].default_value=.4 if fabric=="hair" else .6
    links.new(texture.outputs["Color"],normal.inputs["Color"])
    links.new(normal.outputs["Normal"],nodes.get("Principled BSDF").inputs["Normal"])

def tinted_fabric_material(name,color,fabric,roughness=.88,normal_strength=.6):
    """Supported glTF texture×factor graph, shared by GUI and repeatable export."""
    material=bpy.data.materials.get(name) or bpy.data.materials.new(name)
    material.use_nodes=True
    nodes,links=material.node_tree.nodes,material.node_tree.links
    nodes.clear()
    shader=nodes.new('ShaderNodeBsdfPrincipled')
    output=nodes.new('ShaderNodeOutputMaterial')
    links.new(shader.outputs['BSDF'],output.inputs['Surface'])
    shader.inputs['Roughness'].default_value=roughness
    shader.inputs['Specular IOR Level'].default_value=.22
    texture=nodes.new('ShaderNodeTexImage')
    texture.image=bpy.data.images.load(str(ROOT/'assets/wardrobe-source/textures'/f'{fabric}-albedo.png'),check_existing=True)
    multiply=nodes.new('ShaderNodeMix');multiply.data_type='RGBA';multiply.blend_type='MULTIPLY'
    multiply.inputs[0].default_value=1
    a=next(s for s in multiply.inputs if s.name=='A' and s.type=='RGBA')
    b=next(s for s in multiply.inputs if s.name=='B' and s.type=='RGBA')
    b.default_value=(*color,1)
    links.new(texture.outputs['Color'],a)
    links.new(next(s for s in multiply.outputs if s.type=='RGBA'),shader.inputs['Base Color'])
    fabric_normal(material,fabric)
    for node in nodes:
        if node.type=='NORMAL_MAP':node.inputs['Strength'].default_value=normal_strength
    return material
