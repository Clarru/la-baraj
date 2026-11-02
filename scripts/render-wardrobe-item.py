"""Reimport exported item on approved animated rig; front/side/rear and action proof."""
import bpy
import bmesh
import hashlib
import json
import math
import sys
from pathlib import Path
from mathutils import Vector

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "scripts"))
from wardrobe_rig import RAW, import_model, rebind, remove_source_rig, duplicate

args = sys.argv[sys.argv.index("--") + 1:]
item, slot = args[:2]
OUT = ROOT / "docs/characters/wardrobe/render"
OUT.mkdir(parents=True, exist_ok=True)
bpy.ops.wm.read_factory_settings(use_empty=True)
records = []
views = [("Front", 0, "Idle_Neutral", 1),
         ("Side", math.pi / 2, "Idle_Neutral", 1),
         ("Rear", math.pi, "Idle_Neutral", 1),
         ("Walk", .25, "Walk", 10),
         ("Run", -.25, "Run", 8),
         ("Jump", .5, "Jump_Loop", 10)]
if slot == "facial":
    views = views[:3]
source = RAW / "optimized" / f"{item}.glb"
for index, (label, angle, clip, frame) in enumerate(views):
    rig, meshes = import_model(ROOT / "apps/web/public/assets/optimized/Lakeside_Man.glb")
    names = {o.name.split(".")[0]: o for o in meshes}
    hidden = {"top": ["Male_Peasant_Body", "Male_Peasant_Arms"],
              "bottom": ["Male_Peasant_Legs"], "shoes": ["Male_Peasant_Feet"],
              "hat": [], "hair": ["Hairstyle_Hair_SimpleParted"],
              "facial": ["Hairstyle_Hair_Beard"],
              "full": list(names)}[slot]
    for name in hidden:
        names[name].hide_render = True
    if slot == "top":
        names["SuperHero_Male"].hide_render = True
        skin_rig, skin_meshes = import_model(RAW / "optimized/male-custom-top-skin.glb")
        for mesh in skin_meshes:
            rebind(mesh, skin_rig, rig)
        remove_source_rig(skin_rig)
    item_rig, item_meshes = import_model(source)
    for obj in item_meshes:
        rebind(obj, item_rig, rig)
    remove_source_rig(item_rig)
    if slot == "shoes" and item != "shoes-lake-boots":
        names["Male_Peasant_Legs"].hide_render = True
        pants_rig, pants = import_model(RAW / ("optimized/bottom-classic-ankle.glb"
            if item == "shoes-trail-hikers" else "optimized/bottom-classic-full.glb"))
        for obj in pants:
            rebind(obj, pants_rig, rig)
        remove_source_rig(pants_rig)
    if rig.animation_data:
        for track in rig.animation_data.nla_tracks:
            track.mute = not track.name.startswith(clip)
            if not track.mute:
                # Sample each column independently at a distinct time.
                strip = track.strips[0]
                strip.frame_start = 1 - frame
    pivot = bpy.data.objects.new(f"Review view {index}", None)
    bpy.context.collection.objects.link(pivot)
    rig.parent = pivot
    pivot.location.x = (index - (len(views)-1)/2) * (.55 if slot == "facial" else 1.12)
    pivot.rotation_euler.z = angle
    text = bpy.data.curves.new(f"label-{index}", "FONT")
    text.body, text.align_x, text.size = label, "CENTER", .08
    obj = bpy.data.objects.new(text.name, text)
    bpy.context.collection.objects.link(obj)
    obj.location = (pivot.location.x, -.35, -.12)
    obj.rotation_euler = (math.pi / 2, 0, 0)
    records.append({"view": label, "clip": clip, "frameOffset": frame})
for obj in bpy.context.scene.objects:
    if obj.type == "MESH" and not obj.vertex_groups:
        obj.hide_render = True
bpy.ops.mesh.primitive_plane_add(size=100, location=(0, 0, -.02))
floor = bpy.data.materials.new("Review floor")
floor.diffuse_color = (.115, .14, .16, 1)
bpy.context.object.data.materials.append(floor)
world = bpy.data.worlds.new("Review sky")
world.use_nodes = True
world.node_tree.nodes["Background"].inputs[0].default_value = (.26, .30, .34, 1)
world.node_tree.nodes["Background"].inputs[1].default_value = .5
bpy.context.scene.world = world
def aim(obj, target):
    obj.rotation_euler = (Vector(target) - obj.location).to_track_quat("-Z", "Y").to_euler()
for name, location, energy, size in [
    ("Key", (3, -4, 6), 1000, 6), ("Fill", (-4, -3, 4), 650, 5),
    ("Rim", (2, 3, 4), 700, 4)]:
    data = bpy.data.lights.new(name, "AREA")
    data.energy, data.shape, data.size = energy, "DISK", size
    obj = bpy.data.objects.new(name, data)
    bpy.context.collection.objects.link(obj)
    obj.location = location
    aim(obj, (0, 0, 1))
camera = bpy.data.objects.new("Export review", bpy.data.cameras.new("Export review"))
bpy.context.collection.objects.link(camera)
camera.location = (0, -10, 3)
camera.data.type, camera.data.ortho_scale = "ORTHO", 7.2
aim(camera, (0, 0, .9))
if slot == "facial":
    camera.location = (0, -8, 2.25)
    camera.data.ortho_scale = 1.9
    aim(camera, (0, 0, 1.62))
scene = bpy.context.scene
scene.camera = camera
scene.frame_set(1)
scene.render.engine = "CYCLES"
scene.cycles.samples = 20
scene.cycles.use_denoising = True
scene.render.threads_mode, scene.render.threads = "FIXED", 4
scene.render.resolution_x, scene.render.resolution_y = 2400, 900
if slot == "facial":
    scene.render.resolution_x, scene.render.resolution_y = 1800, 650
scene.render.resolution_percentage = 100
scene.render.image_settings.file_format = "PNG"
scene.render.filepath = str(OUT / f"{item}-exported-v1.png")
bpy.ops.render.render(write_still=True)
(OUT / f"{item}-exported-v1.json").write_text(json.dumps({
    "asset": str(source.relative_to(ROOT)),
    "sha256": hashlib.sha256(source.read_bytes()).hexdigest(),
    "proof": "Exported GLB on unchanged approved animated skeleton; not a concept image",
    "poses": records}, indent=2) + "\n")
