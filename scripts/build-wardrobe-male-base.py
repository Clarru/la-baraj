"""Exact approved face/hands, with clean garment-covered neck and wrist boundaries."""
import bpy
import bmesh
import sys
from pathlib import Path
ROOT=Path(__file__).resolve().parents[1]
sys.path.insert(0,str(ROOT/"scripts"))
from wardrobe_rig import RAW,approved_rig,duplicate,export_item,role
rig,approved=approved_rig()
head=duplicate(approved["SuperHero_Male"],"Wardrobe_Male_CleanNeck")
mesh=bmesh.new()
mesh.from_mesh(head.data)
bmesh.ops.bisect_plane(mesh,geom=list(mesh.verts)+list(mesh.edges)+list(mesh.faces),
    plane_co=(0,0,1.565),plane_no=(0,0,1),clear_inner=True)
bmesh.ops.delete(mesh,geom=[v for v in mesh.verts if not v.link_faces],context="VERTS")
mesh.to_mesh(head.data)
mesh.free()
hands=duplicate(approved["Male_Peasant_Arms"],"Wardrobe_Male_Hands")
mesh=bmesh.new()
mesh.from_mesh(hands.data)
bmesh.ops.delete(mesh,geom=[f for f in mesh.faces if f.material_index==0
    or max(abs(v.co.x) for v in f.verts)<.700],context="FACES")
bmesh.ops.delete(mesh,geom=[v for v in mesh.verts if not v.link_faces],context="VERTS")
mesh.to_mesh(hands.data)
mesh.free()
for obj in [head,hands]:role(obj,"skin")
export_item(rig,[head,hands],"male-custom-top-skin")
