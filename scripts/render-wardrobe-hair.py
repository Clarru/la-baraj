"""Actual optimized hair GLBs on the unchanged approved male, not concept art."""
import bpy
import hashlib
import json
import math
import sys
from pathlib import Path
from mathutils import Vector

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "scripts"))
from wardrobe_rig import RAW, import_model, rebind, remove_source_rig

OUT = ROOT / "docs/characters/wardrobe/render"
OUT.mkdir(parents=True, exist_ok=True)
bpy.ops.wm.read_factory_settings(use_empty=True)
records = []
for index, style in enumerate(["parted", "buzzed", "long"]):
    rig, meshes = import_model(ROOT / "apps/web/public/assets/optimized/Lakeside_Man.glb")
    for obj in meshes:
        if obj.name.startswith("Hairstyle_Hair_SimpleParted"):
            obj.hide_render = True
    source = RAW / "optimized" / f"hair-{style}.glb"
    hair_rig, hair_meshes = import_model(source)
    for mesh in hair_meshes:
        rebind(mesh, hair_rig, rig)
    remove_source_rig(hair_rig)
    if rig.animation_data:
        for track in rig.animation_data.nla_tracks:
            track.mute = not track.name.startswith("Idle_Neutral")
    rig.location.x = (index - 1) * 1.25
    rig.rotation_euler.z = .16
    records.append({"hair": style, "actualOptimizedGLB": str(source.relative_to(ROOT)),
                    "sha256": hashlib.sha256(source.read_bytes()).hexdigest()})
    text = bpy.data.curves.new(f"label-{style}", "FONT")
    text.body = style.title() + " / exported GLB"
    text.align_x, text.size = "CENTER", .09
    label = bpy.data.objects.new(text.name, text)
    bpy.context.collection.objects.link(label)
    label.location = ((index - 1) * 1.25, -.35, -.1)
    label.rotation_euler = (math.pi / 2, 0, 0)

for obj in bpy.context.scene.objects:
    if obj.type == "MESH" and not obj.vertex_groups:
        obj.hide_render = True
bpy.ops.mesh.primitive_plane_add(size=100, location=(0, 0, -.015))
floor = bpy.data.materials.new("Wardrobe review ground")
floor.diffuse_color = (.115, .14, .16, 1)
bpy.context.object.data.materials.append(floor)
world = bpy.data.worlds.new("Wardrobe review sky")
world.use_nodes = True
world.node_tree.nodes["Background"].inputs[0].default_value = (.26, .30, .34, 1)
world.node_tree.nodes["Background"].inputs[1].default_value = .5
bpy.context.scene.world = world
def aim(obj, target):
    obj.rotation_euler = (Vector(target) - obj.location).to_track_quat("-Z", "Y").to_euler()
for name, location, energy, size in [
    ("Key", (3, -4, 5), 700, 5), ("Fill", (-3, -2, 3), 400, 4),
    ("Rim", (2, 3, 4), 500, 3),
]:
    data = bpy.data.lights.new(name, "AREA")
    data.energy, data.shape, data.size = energy, "DISK", size
    obj = bpy.data.objects.new(name, data)
    bpy.context.collection.objects.link(obj)
    obj.location = location
    aim(obj, (0, 0, 1))
camera = bpy.data.objects.new("Wardrobe review", bpy.data.cameras.new("Wardrobe review"))
bpy.context.collection.objects.link(camera)
camera.location = (0, -7, 2.6)
camera.data.type, camera.data.ortho_scale = "ORTHO", 4.6
aim(camera, (0, 0, .9))
scene = bpy.context.scene
scene.camera = camera
scene.frame_set(1)
scene.render.engine = "CYCLES"
scene.cycles.samples = 24
scene.cycles.use_denoising = True
scene.render.threads_mode, scene.render.threads = "FIXED", 4
scene.render.resolution_x, scene.render.resolution_y = 1800, 1100
scene.render.resolution_percentage = 100
scene.render.image_settings.file_format = "PNG"
scene.render.filepath = str(OUT / "hair-exported-v1.png")
bpy.ops.wm.save_as_mainfile(filepath=str(RAW / "hair-review.blend"))
bpy.ops.render.render(write_still=True)
(OUT / "hair-exported-v1.json").write_text(json.dumps({
    "proof": "Actual optimized GLBs reimported, canonical bind applied, approved actor/Idle_Neutral retained",
    "assets": records,
}, indent=2) + "\n")
