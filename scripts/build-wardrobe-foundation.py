"""Retain the approved adult face/rig and prepare authored hair on that rig."""
import bpy
import bmesh
import hashlib
import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "scripts"))
from wardrobe_rig import (RAW, approved_rig, duplicate, export_item,
                          import_model, rebind, remove_source_rig, role)

rig, original = approved_rig()
artifacts = []
parted = duplicate(original["Hairstyle_Hair_SimpleParted"], "Wardrobe_Hair_Parted")
role(parted, "hair")
artifacts.append(export_item(rig, [parted], "hair-parted"))
beard = duplicate(original["Hairstyle_Hair_Beard"], "Wardrobe_Beard_Full")
role(beard, "facialHair")
artifacts.append(export_item(rig, [beard], "beard-full"))
short = duplicate(beard, "Wardrobe_Beard_Short")
for vertex in short.data.vertices:
    if vertex.co.z < 1.63:
        t = min(1, (1.63-vertex.co.z)/.08)
        vertex.co.z += .032*t
        vertex.co.y += .012*t
role(short,"facialHair")
artifacts.append(export_item(rig,[short],"beard-short"))
moustache=duplicate(beard,"Wardrobe_Moustache")
mesh=bmesh.new()
mesh.from_mesh(moustache.data)
for height,lower in [(1.643,True),(1.673,False)]:
    bmesh.ops.bisect_plane(mesh,geom=list(mesh.verts)+list(mesh.edges)+list(mesh.faces),
        plane_co=(0,0,height),plane_no=(0,0,1),clear_inner=lower,clear_outer=not lower)
bmesh.ops.delete(mesh,geom=[f for f in mesh.faces
    if abs(sum(v.co.x for v in f.verts)/len(f.verts))>.045],context="FACES")
bmesh.ops.delete(mesh,geom=[v for v in mesh.verts if not v.link_faces],context="VERTS")
mesh.to_mesh(moustache.data)
mesh.free()
role(moustache,"facialHair")
artifacts.append(export_item(rig,[moustache],"beard-moustache"))

for filename, identifier in [("Hair_Buzzed.gltf", "buzzed"), ("Hair_Long.gltf", "long")]:
    source = next(p for p in (RAW / "base/extracted").rglob(filename)
                  if "Rigged to Head Bone" in str(p))
    source_rig, meshes = import_model(source)
    if not source_rig or not meshes:
        raise RuntimeError(f"Expected authored rigged hair: {source}")
    for index, mesh in enumerate(meshes):
        rebind(mesh, source_rig, rig)
        mesh.name = f"Wardrobe_Hair_{identifier}_{index}"
        role(mesh, "hair")
    remove_source_rig(source_rig)
    artifacts.append(export_item(rig, meshes, f"hair-{identifier}"))

record = {"stage": "rigged foundation — not final wardrobe acceptance",
          "canonicalBones": len(rig.data.bones),
          "approvedMaleModified": False,
          "assets": [{"path": str(p.relative_to(ROOT)), "bytes": p.stat().st_size,
                      "sha256": hashlib.sha256(p.read_bytes()).hexdigest()} for p in artifacts]}
(ROOT / "docs/characters/wardrobe/foundation.json").write_text(json.dumps(record, indent=2) + "\n")
print(json.dumps(record), flush=True)
