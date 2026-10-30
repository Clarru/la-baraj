"""Measure disconnected visual parts of a licensed reference; emit bounds, never mesh data."""
import json
import sys
from pathlib import Path

import bmesh
import bpy
from mathutils import Vector

model, output = map(Path, sys.argv[sys.argv.index("--") + 1:])
bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.ops.import_scene.gltf(filepath=str(model.resolve()))
parts = []
for obj in [o for o in bpy.context.scene.objects if o.type == "MESH"]:
    bm = bmesh.new()
    bm.from_mesh(obj.data)
    bmesh.ops.remove_doubles(bm, verts=list(bm.verts), dist=.00001)
    pending = set(bm.verts)
    while pending:
        queue = [pending.pop()]
        component = []
        while queue:
            vertex = queue.pop()
            component.append(obj.matrix_world @ vertex.co)
            for edge in vertex.link_edges:
                other = edge.other_vert(vertex)
                if other in pending:
                    pending.remove(other)
                    queue.append(other)
        low = [min(v[i] for v in component) for i in range(3)]
        high = [max(v[i] for v in component) for i in range(3)]
        groups=[]
        for vertex in sorted(component,key=lambda v:v.z):
            if not groups or vertex.z-groups[-1][-1].z>max(.002,(high[2]-low[2])*.02):groups.append([])
            groups[-1].append(vertex)
        sections=[{"z_range":[min(v.z for v in group),max(v.z for v in group)],
                   "width":max(v.x for v in group)-min(v.x for v in group),
                   "depth":max(v.y for v in group)-min(v.y for v in group)} for group in groups]
        parts.append({"vertices": len(component), "min": low, "max": high,
                      "center": [(low[i]+high[i])/2 for i in range(3)],
                      "dimensions": [high[i]-low[i] for i in range(3)],"vertex_height_groups":sections})
    bm.free()
parts.sort(key=lambda p: max(p["dimensions"]), reverse=True)
output.write_text(json.dumps(parts, indent=2)+"\n")
for p in parts:
    print(json.dumps({k: [round(v,4) for v in value] if isinstance(value,list) else value for k,value in p.items() if k!='vertex_height_groups'}))
