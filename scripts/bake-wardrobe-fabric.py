"""Bake tangent-space normals from the authored Blender fabric bump material."""
import bpy
import hashlib
import json
from pathlib import Path
ROOT=Path(__file__).resolve().parents[1]
OUT=ROOT/"assets/wardrobe-source/textures"
records=[]
for fabric in ["knit","twill"]:
    bpy.ops.wm.read_factory_settings(use_empty=True)
    bpy.ops.mesh.primitive_plane_add(size=.24)
    obj=bpy.context.object
    source=OUT/f"{fabric}-albedo.png"
    mat=bpy.data.materials.new(f"{fabric} fabric surface")
    mat.use_nodes=True
    nodes,links=mat.node_tree.nodes,mat.node_tree.links
    bsdf=nodes.get("Principled BSDF")
    texture=nodes.new("ShaderNodeTexImage")
    texture.image=bpy.data.images.load(str(source))
    bump=nodes.new("ShaderNodeBump")
    bump.inputs["Distance"].default_value=.00055 if fabric=="knit" else .00015
    bump.inputs["Strength"].default_value=.55
    links.new(texture.outputs["Color"],bump.inputs["Height"])
    links.new(bump.outputs["Normal"],bsdf.inputs["Normal"])
    obj.data.materials.append(mat)
    image=bpy.data.images.new(f"{fabric} tangent normal",width=512,height=512,alpha=False)
    image.colorspace_settings.name="Non-Color"
    target=nodes.new("ShaderNodeTexImage")
    target.image=image
    nodes.active=target
    scene=bpy.context.scene
    scene.render.engine="CYCLES"
    scene.cycles.samples=8
    scene.render.threads_mode,scene.render.threads="FIXED",4
    scene.render.bake.use_clear=True
    scene.render.bake.normal_space="TANGENT"
    scene.render.bake.margin=0
    bpy.ops.object.bake(type="NORMAL")
    image.filepath_raw=str(OUT/f"{fabric}-normal.png")
    image.file_format="PNG"
    image.save()
    records.append({"fabric":fabric,"source":str(source.relative_to(ROOT)),
        "sourceSHA256":hashlib.sha256(source.read_bytes()).hexdigest(),
        "bake":"Blender Cycles tangent-space NORMAL on 0.24 m UV plane",
        "resolution":512,"bumpDistance":bump.inputs["Distance"].default_value,
        "bumpStrength":.55,"output":str(Path(image.filepath_raw).relative_to(ROOT))})
(OUT/"normal-bakes.json").write_text(json.dumps(records,indent=2)+"\n")
