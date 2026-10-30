"""Author original meshes from the recorded visual references; never import reference geometry."""
import json
import math
import sys
from pathlib import Path

import bpy
from mathutils import Vector

ROOT = Path(__file__).resolve().parents[2]
LAB = ROOT / "experiments/asset-skill-lab"
sys.path.insert(0, str(ROOT / ".agents/skills/la-baraj-3d-assets/scripts"))
from prop_parts import atlas_material, beam, bolt, box, chain_link, corbel, extrude_z, mesh_object, pyramid, save_export, square_band


def lantern(material):
    box("Wall post", (0, .034, .795), (.1314, .0318, 1.207), material, bevel=.003)
    pyramid("Post pointed foot", (0, .034, .1915), .1314, .0318, -.0733, material)
    box("Post lower collar", (0, .032, .233), (.138, .043, .038), material)
    box("Projecting beam", (0, -.593, 1.3285), (.1222, 1.244, .1222), material, grain_axis=1, bevel=.005)
    box("End collar", (0, -1.123, 1.3285), (.135, .036, .137), material)
    pyramid("Beam pointed end", (0, -1.215, 1.3285), .1222, .1222, .0363, material, (0, -1, 0))
    beam("Diagonal structural brace", (0, .027, .79), (0, -.475, 1.303), .0381, material)
    box("Hanger strap", (0, -.792, 1.3308), (.153, .1237, .153), material, bevel=.007)
    for side in [-1, 1]:
        bolt("Hanger pin", (side * .080, -.792, 1.3308), (side, 0, 0), material, .019)
    bolt("Hanger top pin", (0, -.792, 1.411), (0, 0, 1), material, .019)
    box("Lower chain anchor plate", (0, .031, .487), (.138, .0395, .1246), material)
    bolt("Anchor rivet", (0, .006, .487), (0, -1, 0), material, .022)
    a, b = Vector((0, -.8075, 1.257)), Vector((0, -.8075, .627))
    for i in range(10):
        point = a.lerp(b, i / 9)
        chain_link(f"Vertical chain {i:02}", point, b - a, i % 2, material)
    a, b = Vector((0, -.7775, 1.298)), Vector((0, -.0368, .4955))
    # Uniform arc spacing keeps the links connected as the curve steepens.
    def curve(t):
        p=a.lerp(b,t);p.z-=.17*math.sin(math.pi*t);return p
    samples=[curve(i/256) for i in range(257)]
    distances=[0]
    for i in range(256):distances.append(distances[-1]+(samples[i+1]-samples[i]).length)
    from bisect import bisect_left
    for i in range(18):
        distance=distances[-1]*i/17
        k=max(1,min(256,bisect_left(distances,distance)))
        fraction=(distance-distances[k-1])/(distances[k]-distances[k-1])
        t=(k-1+fraction)/256
        point=curve(t)
        tangent = b - a + Vector((0, 0, -.17 * math.pi * math.cos(math.pi * t)))
        chain_link(f"Brace chain {i:02}", point, tangent, i % 2, material)
    cy = -.8075
    # Open cage, four corners and one mid-strut per face; no glass or candle.
    for sx in [-1,1]:
        for sy in [-1,1]:
            # The reference corner members have L-shaped sections, not solid square posts.
            local=[(0,0),(.055,0),(.055,.016),(.016,.016),(.016,.062),(0,.062)]
            profile=[(sx*(.1436-x),cy+sy*(.1445-y)) for x,y in local]
            extrude_z("Cage corner angle",profile,[.1004,.142,.142,.104,.142,.142],.4964,material)
    for i,(x,y) in enumerate([(0,-.1269),(.1269,0),(0,.1269),(-.1269,0)]):
        box(f"Cage center strut {i}",(x,cy+y,.31),(.038,.0333,.3714),material,bevel=.002)
        pyramid(f"Cage pointed foot {i}",(x,cy+y,.1243),.038,.0333,-.0425,material)
    for z in [.2232, .329, .496]:
        square_band("Cage square band",(0,cy,z),.295 if z>.3 else .275,.247,.038,material)
    for x in [-1,1]:
        for y in [-1,1]:
            corbel("Cage corner shoulder X",(x*.128,cy+y*.128,.495),0 if x<0 else math.pi,material)
            corbel("Cage corner shoulder Y",(x*.128,cy+y*.128,.495),math.pi/2 if y<0 else -math.pi/2,material)
    box("Cage inner waist", (0, cy, .2686), (.252, .252, .068), material, bevel=.002)
    box("Roof eave", (0, cy, .496), (.35734, .35734, .017), material)
    pyramid("Shallow pyramidal roof", (0, cy, .5045), .348, .348, .1082, material)
    box("Roof chain socket", (0, cy, .619), (.06, .06, .017), material)
    save_export(LAB / "lantern/final", "Lab_Lantern", {"WallMount": (0, .05, .8)})


def crate(material):
    # A closed crate can use thin visible panels; hidden plank side faces add no silhouette.
    for side in [-1, 1]:
        for i in range(5):
            start = -.3824 + i * .15296
            end = start + .1518
            vertices = [(start,side*.3566,.0306),(end,side*.3566,.0306),
                        (end,side*.3566,.7955),(start,side*.3566,.7955)]
            mesh_object(f"Face plank {side} {i}",vertices,[(0,1,2,3) if side<0 else (3,2,1,0)],material,2)
            vertices = [(side*.3566,start,.0306),(side*.3566,end,.0306),
                        (side*.3566,end,.7955),(side*.3566,start,.7955)]
            mesh_object(f"Side plank {side} {i}",vertices,[(0,1,2,3) if side>0 else (3,2,1,0)],material,2)
    for i in range(5):
        y = -.324 + i*.162
        box(f"Lid plank {i}",(-.0047,y,.8053),(.84226,.1608,.0318),material,2,0,bevel=0)
        box(f"Bottom plank {i}",(-.0047,y,.0207),(.84226,.1608,.0318),material,2,0,bevel=0)
    for sx in [-1,1]:
        for sy in [-1,1]:
            profile=[(0,0),(.1114,0),(.1114,.025),(.025,.025),(.025,.1135),(0,.1135)]
            profile=[(sx*(.39-x),sy*(.39-y)) for x,y in profile]
            extrude_z("Wooden corner angle",profile,.023,.803,material,3)
    for z in [.1705,.6555]:
        square_band("Horizontal wooden frame",(0,-.0019,z),.801,.745,.0982,material)
    # Wooden frame rings need timber UVs rather than the default metal strip.
    from prop_parts import uv_map
    for obj in list(bpy.context.scene.objects):
        if obj.name.startswith("Horizontal wooden frame"):
            obj.data.materials.clear();obj.data.materials.append(bpy.data.materials['LaBaraj timber'])
            uv_map(obj,3,grain_axis=-1)
    for x in [-.2425,.2425]:
        box("Top strap",(x,-.0019,.832),(.0982,.8563,.042),material,3,1,bevel=.003)
        box("Bottom strap",(x,-.0019,-.006),(.0982,.8563,.042),material,3,1,bevel=0)
        for sy in [-1,1]:
            box("Front/back strap",(x,sy*.411,.413),(.0982,.034,.8799),material,3,2,bevel=.003)
            for top in [-1,1]:
                zc=.8137 if top>0 else .0124
                # A single L-profile cap replaces two intersecting beveled cubes.
                profile=[(-.058,.039),(.038,.039),(.038,-.055),(.058,-.055),(.058,.055),(-.058,.055)]
                vertices=[(x+dx,sy*(.388+y),zc+top*z) for dx in [-.04765,.04765] for y,z in profile]
                faces=[tuple(range(5,-1,-1)),tuple(range(6,12))]
                for i in range(6):
                    j=(i+1)%6;faces.append((i,j,j+6,i+6))
                obj=mesh_object("Iron corner cap",vertices,faces,material)
                import bmesh
                bm=bmesh.new();bm.from_mesh(obj.data);bmesh.ops.recalc_face_normals(bm,faces=list(bm.faces));bm.to_mesh(obj.data);bm.free()
                bolt("Cap face rivet",(x,sy*.4484,.8079 if top>0 else .0182),(0,sy,0),material,.0194)
                bolt("Cap end rivet",(x,sy*.3857,.8733 if top>0 else -.0472),(0,0,top),material,.0176)
    for sx in [-1,1]:
        for sy in [-1,1]:
            for z in [.1705,.6555]:
                bolt("Side rail nail",(sx*.405,sy*.314,z),(sx,0,0),material,.008,6)
                bolt("Front rail nail",(sx*.2425,sy*.433,z),(0,sy,0),material,.008,6)
    save_export(LAB / "crate/final", "Lab_Crate", {"CarryGrip": (0, 0, .5)})


mode = sys.argv[sys.argv.index("--") + 1]
bpy.ops.wm.read_factory_settings(use_empty=True)
material = atlas_material(LAB / "material-atlas-512.png")
{"lantern": lantern, "crate": crate}[mode](material)
