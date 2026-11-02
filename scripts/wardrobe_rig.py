"""Shared rigged-authoring primitives; geometry remains reference-specific."""
from pathlib import Path
import bpy
from mathutils import Matrix, Vector

ROOT = Path(__file__).resolve().parents[1]
RAW = ROOT / "assets/source-models/wardrobe"
BUILD = RAW / "build"
BUILD.mkdir(parents=True, exist_ok=True)


def import_model(path):
    before = set(bpy.context.scene.objects)
    bpy.ops.import_scene.gltf(filepath=str(path))
    objects = set(bpy.context.scene.objects) - before
    rig = next((o for o in objects if o.type == "ARMATURE"), None)
    if rig:
        reset_rig(rig)
    return rig, [o for o in objects if o.type == "MESH" and o.vertex_groups]


def reset_rig(rig):
    if rig.animation_data:
        rig.animation_data.action = None
        for track in rig.animation_data.nla_tracks:
            track.mute = True
    for bone in rig.pose.bones:
        bone.matrix_basis = Matrix.Identity(4)
    bpy.context.view_layer.update()


def approved_rig():
    bpy.ops.wm.read_factory_settings(use_empty=True)
    rig, meshes = import_model(ROOT / "apps/web/public/assets/optimized/Lakeside_Man.glb")
    if len(rig.data.bones) != 65:
        raise RuntimeError("Approved canonical skeleton has changed")
    return rig, {o.name: o for o in meshes}


def rebind(obj, source_rig, target_rig):
    """Bake source bind into canonical bind; never equate rigs by name alone."""
    source_space = source_rig.matrix_world.inverted() @ obj.matrix_world
    transforms = {
        group.index: target_rig.data.bones[group.name].matrix_local
        @ source_rig.data.bones[group.name].matrix_local.inverted() @ source_space
        for group in obj.vertex_groups
        if group.name in target_rig.data.bones and group.name in source_rig.data.bones
    }
    for vertex in obj.data.vertices:
        weights = [(g.weight, transforms[g.group]) for g in vertex.groups
                   if g.group in transforms and g.weight > 0]
        total = sum(weight for weight, _ in weights)
        if total < .999:
            raise RuntimeError(f"Incomplete canonical binding: {obj.name}:{vertex.index}={total}")
        point = vertex.co.copy()
        vertex.co = sum((weight * (matrix @ point) for weight, matrix in weights), Vector()) / total
    obj.parent = target_rig
    obj.matrix_parent_inverse = Matrix.Identity(4)
    obj.matrix_basis = Matrix.Identity(4)
    for modifier in obj.modifiers:
        if modifier.type == "ARMATURE":
            modifier.object = target_rig
    obj.data.update()
    bpy.context.view_layer.update()


def duplicate(obj, name):
    result = obj.copy()
    result.data = obj.data.copy()
    result.name = name
    bpy.context.collection.objects.link(result)
    return result


def role(obj, value):
    obj["wardrobeRole"] = value


def export_item(rig, meshes, name):
    reset_rig(rig)
    for obj in bpy.context.scene.objects:
        obj.select_set(False)
    rig.select_set(True)
    for obj in meshes:
        obj.select_set(True)
    bpy.context.view_layer.objects.active = rig
    path = BUILD / f"{name}.glb"
    bpy.ops.export_scene.gltf(
        filepath=str(path), export_format="GLB", use_selection=True,
        export_animations=False, export_skins=True, export_extras=True,
    )
    return path


def remove_source_rig(rig):
    bpy.data.objects.remove(rig, do_unlink=True)
