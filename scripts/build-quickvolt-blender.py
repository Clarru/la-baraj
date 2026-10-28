"""Headless: Blender --background --python scripts/build-quickvolt-blender.py.

Imports the runtime geometry export and packs the selected style reference.
Never opens or modifies another Blender session or any existing house source.
"""
from pathlib import Path
import math
import bpy
from mathutils import Vector

ROOT = Path(__file__).resolve().parents[1]
SOURCE = ROOT / "apps/web/public/assets/vehicles/QuickVolt9_Stylized.glb"
REFERENCE = ROOT / "docs/art-direction/quickvolt9/game-reference-stylized.png"
DESTINATION = ROOT / "assets/blender/QuickVolt9_Stylized.blend"
PREVIEW = ROOT / "docs/art-direction/quickvolt9/model-blender-preview.png"

bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.ops.import_scene.gltf(filepath=str(SOURCE))
rig_objects = list(bpy.context.scene.objects)
for obj in rig_objects:
    if obj.type == "MESH":
        # Keep authored hard edges while smoothing the cylindrical surfaces.
        for poly in obj.data.polygons:
            poly.use_smooth = True

references = bpy.data.collections.new("Reference_Images")
bpy.context.scene.collection.children.link(references)
image = bpy.data.images.load(str(REFERENCE), check_existing=True)
image.pack()
ref = bpy.data.objects.new("Selected_Stylized_Reference", None)
ref.empty_display_type = "IMAGE"
ref.data = image
ref.empty_display_size = 1.65
ref.color[3] = .6
ref.empty_image_depth = "BACK"
ref.location = (-.8, 0, .72)
ref.rotation_euler = (math.pi / 2, 0, math.pi / 2)
references.objects.link(ref)
references.hide_render = True

studio = bpy.data.collections.new("Preview_Studio")
bpy.context.scene.collection.children.link(studio)
def move_to_studio(obj):
    for collection in list(obj.users_collection):
        collection.objects.unlink(obj)
    studio.objects.link(obj)

bpy.ops.mesh.primitive_plane_add(size=200, location=(0,0,-.002))
floor = bpy.context.object
floor.name = "Preview_Ground"
mat = bpy.data.materials.new("Preview_Ground_Matte")
mat.diffuse_color = (.31,.34,.38,1)
mat.use_nodes = True
mat.node_tree.nodes["Principled BSDF"].inputs["Base Color"].default_value = (.31,.34,.38,1)
mat.node_tree.nodes["Principled BSDF"].inputs["Roughness"].default_value = .85
floor.data.materials.append(mat)
move_to_studio(floor)

bpy.ops.object.camera_add(location=(1.65,-2.0,1.35))
camera = bpy.context.object
camera.name = "Preview_Camera"
camera.rotation_euler = (Vector((0,0,.56))-camera.location).to_track_quat("-Z","Y").to_euler()
camera.data.type = "ORTHO"
camera.data.ortho_scale = 1.65
bpy.context.scene.camera = camera
move_to_studio(camera)
for name, position, energy, size in [
    ("Key",(2,-3,4),550,3),
    ("Fill",(-3,-1,2),350,3),
    ("Rim",(0,2,3),650,2),
]:
    bpy.ops.object.light_add(type="AREA", location=position)
    light = bpy.context.object
    light.name = "Preview_"+name
    light.data.energy = energy
    light.data.shape = "DISK"
    light.data.size = size
    light.rotation_euler = (Vector((0,0,.5))-light.location).to_track_quat("-Z","Y").to_euler()
    move_to_studio(light)

scene = bpy.context.scene
scene.world = bpy.data.worlds.new("Preview_World")
scene.world.use_nodes = True
scene.world.node_tree.nodes["Background"].inputs[0].default_value = (.18,.21,.25,1)
scene.world.node_tree.nodes["Background"].inputs[1].default_value = .5
scene.render.engine = "CYCLES"
scene.cycles.samples = 32
scene.render.resolution_x = 1200
scene.render.resolution_y = 1000
scene.render.resolution_percentage = 100
scene.render.image_settings.file_format = "PNG"
scene.render.filepath = str(PREVIEW)
scene.view_settings.view_transform = "AgX"

# Leave the asset selected for easy editing when the file is opened.
bpy.ops.object.select_all(action="DESELECT")
for obj in rig_objects:
    obj.select_set(True)
mesh = next((obj for obj in rig_objects if obj.type == "MESH"), None)
if mesh:
    bpy.context.view_layer.objects.active = mesh
DESTINATION.parent.mkdir(parents=True,exist_ok=True)
bpy.ops.wm.save_as_mainfile(filepath=str(DESTINATION))
bpy.ops.render.render(write_still=True)
print(f"QUICKVOLT_SAVED={DESTINATION}")
print(f"QUICKVOLT_PREVIEW={PREVIEW}")
