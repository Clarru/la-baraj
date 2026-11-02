"""Inspect actual rest geometry/bones for reference-led garment construction."""
import bpy
import json
from pathlib import Path
from mathutils import Vector

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / "docs/characters/wardrobe"
bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.ops.import_scene.gltf(filepath=str(ROOT / "apps/web/public/assets/optimized/Lakeside_Man.glb"))
rig = next(o for o in bpy.context.scene.objects if o.type == "ARMATURE")
if rig.animation_data:
    rig.animation_data.action = None
    for track in rig.animation_data.nla_tracks:
        track.mute = True
for bone in rig.pose.bones:
    bone.location = (0, 0, 0)
    bone.rotation_quaternion = (1, 0, 0, 0)
    bone.scale = (1, 1, 1)
bpy.context.view_layer.update()
data = {"rig": rig.name, "boneCount": len(rig.data.bones),
        "bones": {b.name: {"head": list(rig.matrix_world @ b.head_local),
                           "tail": list(rig.matrix_world @ b.tail_local)}
                  for b in rig.data.bones}, "meshes": []}
for obj in bpy.context.scene.objects:
    if obj.type != "MESH":
        continue
    corners = [obj.matrix_world @ Vector(x) for x in obj.bound_box]
    data["meshes"].append({"name": obj.name,
        "min": [min(x[i] for x in corners) for i in range(3)],
        "max": [max(x[i] for x in corners) for i in range(3)],
        "materials": [m.name for m in obj.data.materials]})
(OUT / "approved-rig-measurements.json").write_text(json.dumps(data, indent=2) + "\n")
print(json.dumps({"bones": {k: v for k, v in data["bones"].items()
                            if k in {"Head", "pelvis", "hand_l", "foot_l", "ball_l", "upperarm_l", "lowerarm_l"}},
                  "meshes": data["meshes"]}), flush=True)
