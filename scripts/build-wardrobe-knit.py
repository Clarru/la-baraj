"""Reference-led connected knit prototype; review before catalog inclusion."""
import bpy
import bmesh
import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "scripts"))
from wardrobe_rig import (RAW, approved_rig, duplicate, export_item, import_model,
                          rebind, remove_source_rig, role)
from wardrobe_surfaces import knit_surface, finish_garment, bind_surface, rib_band, reduce_garment
from wardrobe_materials import fabric_normal

rig, approved = approved_rig()
source = next((RAW / "base/extracted").rglob("Superhero_Male_FullBody.gltf"))
body_rig, body_meshes = import_model(source)
body = max(body_meshes, key=lambda obj: len(obj.data.vertices))
rebind(body, body_rig, rig)
body.name = "__canonical_weight_reference"
body.hide_render = True
for obj in body_meshes:
    obj.hide_render = True
remove_source_rig(body_rig)
material = bpy.data.materials.new("Wardrobe_Knit_Charcoal")
material.use_nodes = True
shader = material.node_tree.nodes.get("Principled BSDF")
shader.inputs["Base Color"].default_value = (.045, .05, .055, 1)
shader.inputs["Roughness"].default_value = .88
texture = ROOT / "assets/wardrobe-source/textures/knit-albedo.png"
if texture.exists():
    image = bpy.data.images.load(str(texture))
    node = material.node_tree.nodes.new("ShaderNodeTexImage")
    node.image = image
    material.node_tree.links.new(node.outputs["Color"], shader.inputs["Base Color"])
fabric_normal(material,"knit")
garment = knit_surface(material)
finish_garment(garment)
parts = [garment,
    rib_band("Crew neck folded rib",[(1.549,.096,.082),(1.558,.095,.081),
             (1.578,.087,.076),(1.583,.086,.075)],material),
    rib_band("Knit bottom rib",[(.987,.192,.157),(1.00,.196,.159),
             (1.031,.197,.160),(1.048,.197,.160)],material)]
for side in [-1,1]:
    parts.append(rib_band("Knit wrist rib",[(.671,.052,.052),(.681,.052,.052),
        (.704,.049,.049),(.714,.047,.047)],material,axis="x",side=side,
        center=(0,.0654,1.4555)))
for selected in bpy.context.selected_objects:
    selected.select_set(False)
for part in parts:
    part.select_set(True)
bpy.context.view_layer.objects.active=garment
bpy.ops.object.join()
reduce_garment(garment,.36)
bind_surface(garment, body, rig)
role(garment, "top")
garment["wardrobeItem"] = "weekend-knit"
artifact = export_item(rig, [garment], "top-weekend-knit")

# Keep a clothed inspection scene: approved face, hands, lower body and hair.
for name in ["Male_Peasant_Body", "Male_Peasant_Arms"]:
    approved[name].hide_render = True
hands = duplicate(approved["Male_Peasant_Arms"], "__approved_hands_for_review")
hands.hide_render = False
mesh = bmesh.new()
mesh.from_mesh(hands.data)
bmesh.ops.delete(mesh, geom=[f for f in mesh.faces if f.material_index == 0
                 or max(abs(v.co.x) for v in f.verts) < .700], context="FACES")
mesh.to_mesh(hands.data)
mesh.free()
role(hands, "skin")
for obj in bpy.context.scene.objects:
    if obj.type == "MESH" and not obj.vertex_groups:
        obj.hide_render = True
bpy.ops.wm.save_as_mainfile(filepath=str(RAW / "weekend-knit-source.blend"))
print(json.dumps({"prototype": str(artifact.relative_to(ROOT)),
                  "garmentVertices": len(garment.data.vertices),
                  "canonicalBones": len(rig.data.bones),
                  "accepted": False}), flush=True)
