"""Render retained publisher outfits before choosing reusable wardrobe geometry."""
import bpy
import bmesh
import json
from pathlib import Path
from mathutils import Vector

ROOT = Path(__file__).resolve().parents[1]
RAW = ROOT / "assets/source-models/wardrobe"
OUT = ROOT / "docs/characters/wardrobe/source-review"
OUT.mkdir(parents=True, exist_ok=True)
bpy.ops.wm.read_factory_settings(use_empty=True)


def load(path):
    before = set(bpy.context.scene.objects)
    bpy.ops.import_scene.gltf(filepath=str(path))
    return set(bpy.context.scene.objects) - before


def aim(obj, point):
    obj.rotation_euler = (Vector(point) - obj.location).to_track_quat("-Z", "Y").to_euler()


stats = []
for index, (sex, outfit) in enumerate([
    ("Male", "Peasant"), ("Male", "Ranger"),
    ("Female", "Peasant"), ("Female", "Ranger"),
]):
    base = next((RAW / "base/extracted").rglob(f"Superhero_{sex}_FullBody.gltf"))
    objects = load(base)
    body = max((o for o in objects if o.type == "MESH"), key=lambda o: len(o.data.vertices))
    head_ids = {group.index for group in body.vertex_groups
                if group.name == "Head" or "neck" in group.name.lower()}
    mesh = bmesh.new()
    mesh.from_mesh(body.data)
    deform = mesh.verts.layers.deform.active
    def head_weight(vertex):
        return sum(vertex[deform].get(i, 0) for i in head_ids)
    bmesh.ops.delete(mesh, geom=[face for face in mesh.faces
        if sum(head_weight(v) for v in face.verts) / len(face.verts) < .45], context="FACES")
    mesh.to_mesh(body.data)
    mesh.free()
    source = next((RAW / "outfits/extracted").rglob(f"{sex}_{outfit}.gltf"))
    objects |= load(source)
    roots = [o for o in objects if o.parent not in objects]
    for obj in roots:
        obj.location.x += (index - 1.5) * 1.8
    for obj in objects:
        if obj.type == "ARMATURE" and obj.animation_data:
            obj.animation_data.action = None
            for track in obj.animation_data.nla_tracks:
                track.mute = True
    meshes = [o for o in objects if o.type == "MESH"]
    stats.append({"name": f"{sex}_{outfit}", "source": str(source.relative_to(ROOT)),
                  "meshes": [{"name": o.name, "vertices": len(o.data.vertices),
                              "triangles": sum(len(p.vertices) - 2 for p in o.data.polygons),
                              "materials": [m.name for m in o.data.materials]} for o in meshes]})
    curve = bpy.data.curves.new(f"label-{index}", "FONT")
    curve.body = f"{sex} / {outfit} source"
    curve.align_x = "CENTER"
    curve.size = .11
    label = bpy.data.objects.new(curve.name, curve)
    bpy.context.collection.objects.link(label)
    label.location = ((index - 1.5) * 1.8, -.3, -.12)
    label.rotation_euler = (1.5707963, 0, 0)

for obj in bpy.context.scene.objects:
    if obj.type == "MESH":
        for polygon in obj.data.polygons:
            polygon.use_smooth = True
bpy.ops.mesh.primitive_plane_add(size=200, location=(0, 0, -.015))
floor = bpy.data.materials.new("Review floor")
floor.diffuse_color = (.16, .18, .19, 1)
bpy.context.object.data.materials.append(floor)
world = bpy.data.worlds.new("Review world")
world.use_nodes = True
world.node_tree.nodes["Background"].inputs[0].default_value = (.3, .33, .36, 1)
world.node_tree.nodes["Background"].inputs[1].default_value = .6
bpy.context.scene.world = world
for name, location, power, size in [
    ("Key", (1, -5, 7), 1400, 7), ("Fill", (-4, -2, 4), 650, 6),
    ("Rim", (3, 3, 5), 1000, 5),
]:
    light = bpy.data.lights.new(name, "AREA")
    light.energy, light.shape, light.size = power, "DISK", size
    obj = bpy.data.objects.new(name, light)
    bpy.context.collection.objects.link(obj)
    obj.location = location
    aim(obj, (0, 0, 1))
camera = bpy.data.objects.new("Review camera", bpy.data.cameras.new("Review camera"))
bpy.context.collection.objects.link(camera)
camera.location = (0, -10, 3.1)
camera.data.type = "ORTHO"
camera.data.ortho_scale = 7.6
aim(camera, (0, 0, .9))
scene = bpy.context.scene
scene.camera = camera
scene.render.engine = "CYCLES"
scene.cycles.samples = 20
scene.cycles.use_denoising = True
scene.render.threads_mode = "FIXED"
scene.render.threads = 4
scene.render.resolution_x, scene.render.resolution_y = 1900, 900
scene.render.resolution_percentage = 100
scene.render.image_settings.file_format = "PNG"
scene.render.filepath = str(OUT / "publisher-outfits.png")
(OUT / "inventory.json").write_text(json.dumps(stats, indent=2) + "\n")
bpy.ops.wm.save_as_mainfile(filepath=str(RAW / "publisher-review.blend"))
bpy.ops.render.render(write_still=True)
