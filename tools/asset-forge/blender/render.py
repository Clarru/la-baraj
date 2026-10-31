"""Blender CLI: inspect_asset.py -- model.glb output-directory [--framing reference.json].

Import the exported GLB afresh, report evaluated geometry and render fixed views.
The JSON also serves as an immutable camera/lighting contract for comparisons.
"""
import argparse
import json
import math
import sys
from pathlib import Path

import bpy
from mathutils import Vector


def arguments():
    parser = argparse.ArgumentParser()
    parser.add_argument("model", type=Path)
    parser.add_argument("output", type=Path)
    parser.add_argument("--framing", type=Path)
    parser.add_argument("--resolution", type=int, default=640)
    parser.add_argument("--masks", action="store_true")
    parser.add_argument("--views", default="front,side,rear,three-quarter")
    parser.add_argument("--key-angle", type=float, default=0)
    parser.add_argument("--diagnostics", action="store_true")
    parser.add_argument("--overlap-file", type=Path)
    return parser.parse_args(sys.argv[sys.argv.index("--") + 1:])


def aim(obj, point):
    obj.rotation_euler = (Vector(point) - obj.location).to_track_quat("-Z", "Y").to_euler()


def main():
    args = arguments()
    args.output.mkdir(parents=True, exist_ok=True)
    bpy.ops.wm.read_factory_settings(use_empty=True)
    bpy.ops.import_scene.gltf(filepath=str(args.model.resolve()))
    objects = [obj for obj in bpy.context.scene.objects if obj.type == "MESH"]
    corners = [obj.matrix_world @ Vector(corner) for obj in objects for corner in obj.bound_box]
    low = Vector([min(point[i] for point in corners) for i in range(3)])
    high = Vector([max(point[i] for point in corners) for i in range(3)])
    # Canonical alignment is render-only for references; their source files are never modified.
    shift = Vector(((low.x + high.x) / 2, (low.y + high.y) / 2, low.z))
    for obj in list(bpy.context.scene.objects):
        if obj.parent is None:
            obj.location -= shift
    bpy.context.view_layer.update()
    corners = [obj.matrix_world @ Vector(corner) for obj in objects for corner in obj.bound_box]
    low = Vector([min(point[i] for point in corners) for i in range(3)])
    high = Vector([max(point[i] for point in corners) for i in range(3)])
    center = (low + high) / 2
    dimensions = high - low
    depsgraph = bpy.context.evaluated_depsgraph_get()
    triangles = 0
    for obj in objects:
        mesh = obj.evaluated_get(depsgraph).to_mesh()
        mesh.calc_loop_triangles()
        triangles += len(mesh.loop_triangles)
        obj.evaluated_get(depsgraph).to_mesh_clear()
    materials = list({mat.name for obj in objects for mat in obj.data.materials if mat})
    images = [{"name": image.name, "width": image.size[0], "height": image.size[1],
               "channels": image.channels} for image in bpy.data.images if image.size[0]]
    framing = {"center": list(center), "span": max(dimensions) * 1.52, "floor": low.z,
               "resolution": args.resolution}
    if args.framing:
        framing = json.loads(args.framing.read_text())["framing"]
    target = Vector(framing["center"])
    span = framing["span"]
    scene = bpy.context.scene
    scene.render.engine = "CYCLES"
    scene.render.threads_mode = "FIXED"
    scene.render.threads = 4
    scene.cycles.seed = 0
    scene.cycles.samples = 24
    scene.cycles.use_denoising = True
    scene.render.resolution_x = scene.render.resolution_y = framing["resolution"]
    scene.render.resolution_percentage = 100
    scene.render.image_settings.file_format = "PNG"
    scene.world = bpy.data.worlds.new("QA neutral world")
    scene.world.use_nodes = True
    scene.world.node_tree.nodes["Background"].inputs[0].default_value = (.38, .38, .38, 1)
    scene.world.node_tree.nodes["Background"].inputs[1].default_value = .6
    scene.view_settings.view_transform = "AgX"
    bpy.ops.mesh.primitive_plane_add(size=200, location=(0, 0, framing["floor"] - .002))
    floor = bpy.context.object
    floor.name = "QA_FLOOR"
    material = bpy.data.materials.new("QA neutral floor")
    material.diffuse_color = (.22, .23, .24, 1)
    floor.data.materials.append(material)
    for name, offset, energy, size in [("Key", (-3, -4, 6), 650, 4),
                                       ("Fill", (4, -1, 3), 250, 3)]:
        data = bpy.data.lights.new(name, "AREA")
        data.energy = energy * span * span / 4
        data.shape = "DISK"
        data.size = size * span / 2
        obj = bpy.data.objects.new(name, data)
        scene.collection.objects.link(obj)
        obj.location = target + Vector(offset) * span / 2
        if name=='Key' and args.key_angle:
            delta=obj.location-target;angle=math.radians(args.key_angle)
            obj.location=target+Vector((delta.x*math.cos(angle)-delta.y*math.sin(angle),delta.x*math.sin(angle)+delta.y*math.cos(angle),delta.z))
        aim(obj, target)
    camera_data = bpy.data.cameras.new("QA camera")
    camera_data.type = "ORTHO"
    camera_data.ortho_scale = span
    camera = bpy.data.objects.new("QA camera", camera_data)
    scene.collection.objects.link(camera)
    scene.camera = camera
    views = {"front": (0, -5, .8), "side": (5, 0, .8),
             "rear": (0, 5, .8), "three-quarter": (4, -5, 3)}
    views={name:offset for name,offset in views.items() if name in args.views.split(',')}
    for name, offset in views.items():
        camera.location = target + Vector(offset) * span
        aim(camera, target)
        scene.render.filepath = str((args.output / f"{name}.png").resolve())
        bpy.ops.render.render(write_still=True)
    if args.diagnostics:
        # Same imported export, camera and lighting. No generated paintovers.
        original_materials = {obj: list(obj.data.materials) for obj in objects}
        clay = bpy.data.materials.new('QA geometry clay')
        clay.use_nodes = True
        clay_shader = clay.node_tree.nodes.get('Principled BSDF')
        clay_shader.inputs['Base Color'].default_value = (.34, .34, .34, 1)
        clay_shader.inputs['Roughness'].default_value = 1
        unlit = {}
        for obj, materials_before in original_materials.items():
            for original in materials_before:
                if original is None or original in unlit:
                    continue
                mat = original.copy()
                mat.name = 'QA unlit ' + original.name
                nodes = mat.node_tree.nodes
                shader = next(n for n in nodes if n.type == 'BSDF_PRINCIPLED')
                output = next(n for n in nodes if n.type == 'OUTPUT_MATERIAL')
                emission = nodes.new('ShaderNodeEmission')
                color = shader.inputs['Base Color']
                emission.inputs['Color'].default_value = color.default_value
                if color.is_linked:
                    mat.node_tree.links.new(color.links[0].from_socket, emission.inputs['Color'])
                mat.node_tree.links.new(emission.outputs[0], output.inputs['Surface'])
                unlit[original] = mat
        camera.location = target + Vector((4, -5, 3)) * span
        aim(camera, target)
        for label in ['clay', 'unlit']:
            for obj, materials_before in original_materials.items():
                for i, mat in enumerate(materials_before):
                    obj.data.materials[i] = clay if label == 'clay' else unlit[mat]
            scene.render.filepath = str((args.output / f'diagnostic-{label}.png').resolve())
            bpy.ops.render.render(write_still=True)
        for obj, materials_before in original_materials.items():
            for i, mat in enumerate(materials_before):
                obj.data.materials[i] = mat
        if args.overlap_file:
            findings = json.loads(args.overlap_file.read_text()).get('overlapDiagnostics', {}).get('findings', [])
            if findings:
                marker_material = bpy.data.materials.new('QA overlap marker only')
                marker_material.use_nodes = True
                nodes = marker_material.node_tree.nodes
                emission = nodes.new('ShaderNodeEmission')
                emission.inputs['Color'].default_value = (1, .035, .005, 1)
                emission.inputs['Strength'].default_value = 2
                marker_material.node_tree.links.new(emission.outputs[0], nodes.get('Material Output').inputs['Surface'])
                markers = []
                for finding in findings:
                    x, y, z = finding['point']
                    # glTF scene metres -> Blender world, then the same render-only alignment.
                    position = Vector((x, -z, y)) - shift
                    bpy.ops.mesh.primitive_uv_sphere_add(segments=8, ring_count=4,
                        radius=span*.006, location=position)
                    marker = bpy.context.object
                    marker.data.materials.append(marker_material)
                    markers.append(marker)
                for label, offset in [('diagnostic-overlaps', (4, -5, 3)),
                                      ('diagnostic-overlaps-rear', (-4, 5, 3))]:
                    camera.location = target + Vector(offset) * span
                    aim(camera, target)
                    scene.render.filepath = str((args.output / f'{label}.png').resolve())
                    bpy.ops.render.render(write_still=True)
                for marker in markers:
                    bpy.data.objects.remove(marker, do_unlink=True)
    if args.masks:
        floor.hide_render = True
        scene.render.film_transparent = True
        scene.render.image_settings.color_mode = "RGBA"
        scene.cycles.samples = 8
        for name, offset in views.items():
            camera.location = target + Vector(offset) * span
            aim(camera,target)
            scene.render.filepath = str((args.output / f"{name}-mask.png").resolve())
            bpy.ops.render.render(write_still=True)
    report = {"model": args.model.name, "glb_bytes": args.model.stat().st_size,
              "mesh_objects": len(objects), "triangles": triangles, "materials": materials,
              "mesh_material_slots": sum(len(obj.data.materials) for obj in objects),
              "images": images, "blender_bounds": {"min": list(low), "max": list(high)},
              "blender_dimensions": list(dimensions), "framing": framing,
              "lighting":{"key_azimuth_degrees":args.key_angle},
              "diagnostics": ['clay', 'unlit'] if args.diagnostics else [],
              "renderer": "Blender Cycles 24 samples AgX; imported exported GLB"}
    (args.output / "metrics.json").write_text(json.dumps(report, indent=2) + "\n")
    print("ASSET_REPORT " + json.dumps(report), flush=True)


if __name__ == "__main__":
    main()
