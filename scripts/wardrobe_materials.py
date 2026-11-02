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
    normal.inputs["Strength"].default_value=.6
    links.new(texture.outputs["Color"],normal.inputs["Color"])
    links.new(normal.outputs["Normal"],nodes.get("Principled BSDF").inputs["Normal"])
