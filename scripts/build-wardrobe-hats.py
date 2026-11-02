"""Three distinct fitted hats: panel cap, rib-cuff beanie and stitched bucket."""
import bpy
import json
import math
import sys
from pathlib import Path
ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "scripts"))
from wardrobe_rig import RAW, approved_rig, export_item, role
from wardrobe_surfaces import Surface

rig, approved = approved_rig()

def material(name, color, texture=None):
    result = bpy.data.materials.new(name)
    result.use_nodes = True
    shader = result.node_tree.nodes.get("Principled BSDF")
    shader.inputs["Base Color"].default_value = (*color, 1)
    shader.inputs["Roughness"].default_value = .84
    if texture:
        node = result.node_tree.nodes.new("ShaderNodeTexImage")
        node.image = bpy.data.images.load(str(ROOT / "assets/wardrobe-source/textures" / texture),
                                          check_existing=True)
        result.node_tree.links.new(node.outputs["Color"], shader.inputs["Base Color"])
    return result

fabric = material("Wardrobe_Hat_Twill", (.06, .08, .12), "twill-albedo.png")
knit = material("Wardrobe_Hat_Knit", (.12, .15, .14), "knit-albedo.png")
stitch = material("Wardrobe_Hat_Stitch", (.035, .045, .055))
trim = material("Wardrobe_Hat_Trim", (.025, .032, .045))

def ring_surface(name, profiles, mat, segments=64, center_y=.022):
    s = Surface()
    rings = []
    for z, rx, ry in profiles:
        rings.append([s.point((rx * math.sin(i * math.tau / segments),
                               center_y - ry * math.cos(i * math.tau / segments), z))
                      for i in range(segments)])
    for k in range(len(rings) - 1):
        for i in range(segments):
            n = (i + 1) % segments
            u, un = i / segments * 3, (i + 1) / segments * 3
            v, vn = profiles[k][0] * 8, profiles[k + 1][0] * 8
            s.face((rings[k][i], rings[k][n], rings[k + 1][n], rings[k + 1][i]),
                   [(u,v),(un,v),(un,vn),(u,vn)])
    return s.object(name, mat)

def curve(name, points, radius, mat):
    data = bpy.data.curves.new(name, "CURVE")
    data.dimensions = "3D"
    data.bevel_depth, data.bevel_resolution, data.resolution_u = radius, 1, 1
    line = data.splines.new("POLY")
    line.points.add(len(points) - 1)
    for point, xyz in zip(line.points, points):
        point.co = (*xyz, 1)
    obj = bpy.data.objects.new(name, data)
    bpy.context.collection.objects.link(obj)
    obj.data.materials.append(mat)
    for selected in bpy.context.selected_objects:
        selected.select_set(False)
    bpy.context.view_layer.objects.active = obj
    obj.select_set(True)
    bpy.ops.object.convert(target="MESH")
    obj.select_set(False)
    return obj

def bind(obj):
    obj.parent = rig
    group = obj.vertex_groups.new(name="Head")
    group.add(list(range(len(obj.data.vertices))), 1, "REPLACE")
    modifier = obj.modifiers.new("Head attachment", "ARMATURE")
    modifier.object = rig
    role(obj, "hat")
    for polygon in obj.data.polygons:
        polygon.use_smooth = True

def consolidate(parts, name):
    for obj in bpy.context.scene.objects:
        obj.select_set(False)
    for obj in parts:
        obj.select_set(True)
    bpy.context.view_layer.objects.active = parts[0]
    bpy.ops.object.join()
    obj = parts[0]
    obj.name = name
    bind(obj)
    return obj

items = []
# Six-panel cap: crowned profile, curved visor, panel welts, top button.
cap_profile = [(1.755,.112,.124),(1.768,.114,.126),(1.802,.110,.121),
               (1.837,.099,.107),(1.858,.076,.083),(1.873,.038,.042),
               (1.878,.002,.002)]
parts = [ring_surface("Cap crown", cap_profile, fabric)]
parts.append(ring_surface("Cap sweatband", [(1.754,.116,.126),(1.769,.118,.128)], trim))
s = Surface()
grid = []
for t in range(7):
    v = t / 6
    row = []
    for j in range(25):
        u = j / 24 * 2 - 1
        x = .111 * u * (1 + .10 * v)
        y = -.079 - .115 * (1 - u*u)**.45 * v
        z = 1.766 - .014 * v + .013 * u*u
        row.append(s.point((x,y,z)))
    grid.append(row)
for k in range(6):
    for j in range(24):
        s.face((grid[k][j],grid[k][j+1],grid[k+1][j+1],grid[k+1][j]),
               [(j/24,k/6),((j+1)/24,k/6),((j+1)/24,(k+1)/6),(j/24,(k+1)/6)])
visor = s.object("Curved cap visor", fabric)
bpy.context.view_layer.objects.active = visor
shell = visor.modifiers.new("Bound visor edge", "SOLIDIFY")
shell.thickness = .005
bpy.ops.object.modifier_apply(modifier=shell.name)
parts.append(visor)
for i in range(6):
    angle = i * math.tau / 6
    points = [(rx*math.sin(angle)*1.008, .022-ry*math.cos(angle)*1.008,z+.0006)
              for z,rx,ry in cap_profile]
    parts.append(curve("Cap panel welt",points,.0005,stitch))
parts.append(ring_surface("Cap crown button",[(1.876,.008,.008),(1.882,.007,.007),(1.884,.001,.001)],trim,24))
items.append(("hat-panel-cap",consolidate(parts,"Wardrobe_Hat_PanelCap")))

# Beanie is a rounded knit crown with a doubled folded cuff.
parts = [ring_surface("Beanie crown",[(1.76,.117,.130),(1.81,.116,.131),
    (1.86,.110,.124),(1.91,.092,.102),(1.943,.055,.063),(1.953,.002,.002)],knit)]
parts.append(ring_surface("Beanie folded cuff",[(1.750,.119,.131),(1.758,.123,.135),
    (1.79,.122,.135),(1.806,.118,.131)],knit))
for z in [1.755,1.801]:
    points = [(.121*math.sin(i*math.tau/96),.022-.134*math.cos(i*math.tau/96),z)
              for i in range(97)]
    parts.append(curve("Cuff knitted edge",points,.001,trim))
items.append(("hat-knit-beanie",consolidate(parts,"Wardrobe_Hat_KnitBeanie")))

# Bucket has a sloped stitched brim and shallow flat-topped, tapered crown.
parts = [ring_surface("Bucket crown",[(1.77,.122,.132),(1.785,.121,.131),
    (1.87,.109,.118),(1.902,.105,.114),(1.911,.09,.098),
    (1.913,.002,.002)],fabric)]
brim = ring_surface("Bucket sloping brim",[(1.77,.122,.132),(1.768,.136,.146),
    (1.751,.167,.178),(1.750,.17,.181)],fabric)
bpy.context.view_layer.objects.active = brim
shell = brim.modifiers.new("Folded brim thickness","SOLIDIFY")
shell.thickness = .003
bpy.ops.object.modifier_apply(modifier=shell.name)
parts.append(brim)
parts.append(ring_surface("Bucket hatband",[(1.774,.123,.133),(1.796,.120,.130)],trim))
for radius in [.142,.154,.166]:
    z = 1.768 - (radius-.136)/(.167-.136)*.017
    points = [(radius*math.sin(i*math.tau/96),.022-(radius+.011)*math.cos(i*math.tau/96),z+.0012)
              for i in range(97)]
    parts.append(curve("Brim concentric stitching",points,.0006,stitch))
items.append(("hat-stitched-bucket",consolidate(parts,"Wardrobe_Hat_StitchedBucket")))
records=[]
for identifier,obj in items:
    obj["wardrobeItem"]=identifier
    artifact=export_item(rig,[obj],identifier)
    records.append({"id":identifier,"raw":str(artifact.relative_to(ROOT)),
                    "vertices":len(obj.data.vertices),"accepted":False})
(ROOT/"docs/characters/wardrobe/hat-authoring.json").write_text(json.dumps(records,indent=2)+"\n")
bpy.ops.wm.save_as_mainfile(filepath=str(RAW/"hats-source.blend"))
