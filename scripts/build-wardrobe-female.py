"""Reference outfit, editable rigged prototype. Exported review decides acceptance."""
import bpy
import bmesh
import json
import math
import sys
from pathlib import Path
from mathutils import Vector
ROOT=Path(__file__).resolve().parents[1]
sys.path.insert(0,str(ROOT/"scripts"))
from wardrobe_rig import RAW,approved_rig,import_model,rebind,remove_source_rig,duplicate,export_item,role
from wardrobe_surfaces import Surface,knit_surface,finish_garment,bind_surface,rib_band
rig,approved=approved_rig()
for obj in approved.values():
    obj.hide_render=True
source_rig,meshes=import_model(next((RAW/"base/extracted").rglob("Superhero_Female_FullBody.gltf")))
body=max(meshes,key=lambda o:len(o.data.vertices))
for obj in meshes:
    rebind(obj,source_rig,rig)
remove_source_rig(source_rig)
body.name="__female_weight_reference"
body.hide_render=True
def mat(name,color,roughness=.8,metal=0):
    result=bpy.data.materials.new(name)
    result.use_nodes=True
    bsdf=result.node_tree.nodes.get("Principled BSDF")
    bsdf.inputs["Base Color"].default_value=(*color,1)
    bsdf.inputs["Roughness"].default_value=roughness
    bsdf.inputs["Metallic"].default_value=metal
    return result
cloth=mat("Wardrobe_Female_Black_Tailoring",(.018,.021,.025))
underlayer=mat("Wardrobe_Female_Black_Crop",(.009,.011,.014))
tights_mat=mat("Wardrobe_Female_Sheer_Tights",(.055,.041,.034),.76)
leather=mat("Wardrobe_Female_Black_Leather",(.008,.009,.011),.35)
gold=mat("Wardrobe_Female_Buckle_Brass",(.48,.30,.09),.35,.75)
hair_mat=mat("Wardrobe_Female_Brunette",(.045,.021,.011),.72)
pieces=[]
def select_faces(obj,keep):
    mesh=bmesh.new()
    mesh.from_mesh(obj.data)
    bmesh.ops.delete(mesh,geom=[face for face in mesh.faces if not keep(face)],context="FACES")
    # Remove vertices not used by retained faces: no hidden body payload.
    bmesh.ops.delete(mesh,geom=[v for v in mesh.verts if not v.link_faces],context="VERTS")
    mesh.to_mesh(obj.data)
    mesh.free()
def centroid(face):
    return sum((v.co for v in face.verts),Vector())/len(face.verts)
def attach(obj,role_name):
    bind_surface(obj,body,rig)
    role(obj,role_name)
    pieces.append(obj)
    return obj
# Keep exposed face/neck, hands and the narrow midriff only. Covered body is removed.
skin=duplicate(body,"Wardrobe_Female_ExposedSkin")
skin.hide_render=False
select_faces(skin,lambda f:(lambda p:p.z>1.54 or abs(p.x)>.695
    or (1.075<p.z<1.18 and abs(p.x)<.17))(centroid(f)))
role(skin,"skin")
pieces.append(skin)
for obj in meshes:
    if obj!=body:
        obj.hide_render=False
        pieces.append(obj)
# Sheer tights retain the original leg shape/weights; opaque tint approximates
# a black sheer material without expensive transparent avatar sorting.
tights=duplicate(body,"Wardrobe_Female_Tights")
tights.hide_render=False
select_faces(tights,lambda f:.045<centroid(f).z<.825)
tights.data.materials.clear()
tights.data.materials.append(tights_mat)
role(tights,"tights")
pieces.append(tights)

# Structured connected blazer shell, open down the front, with full sleeves.
profiles=[(.79,.225,.170,.175),(.807,.228,.173,.178),(.87,.226,.174,.175),
    (1.03,.209,.178,.170),(1.24,.215,.213,.164),(1.37,.228,.207,.155),
    (1.43,.238,.180,.149),(1.48,.243,.160,.145),(1.52,.232,.135,.131),
    (1.555,.092,.083,.080),(1.575,.086,.079,.077)]
blazer=knit_surface(cloth,profiles,[.33,.33,.32,.28,.43,.57,.62,.53,.39,.32,.28],
                    name="Wardrobe_Female_Blazer")
finish_garment(blazer,.004)
attach(blazer,"top")

# Lapels have their own crisp fold line, rather than a painted triangle.
for side in [-1,1]:
    s=Surface()
    points=[(.055,-.056,1.566),(.145,-.096,1.486),(.103,-.155,1.389),
            (.122,-.161,1.355),(.065,-.168,1.220),(.073,-.146,1.388)]
    indices=[s.point((side*x,y,z)) for x,y,z in points]
    s.face(indices,[(0,1),(.4,1),(.65,.7),(1,.65),(.4,0),(0,.6)])
    lapel=s.object("Blazer notched lapel",cloth)
    bpy.context.view_layer.objects.active=lapel
    shell=lapel.modifiers.new("Lapel folded thickness","SOLIDIFY")
    shell.thickness=.004
    bpy.ops.object.modifier_apply(modifier=shell.name)
    bevel=lapel.modifiers.new("Soft tailored lapel edge","BEVEL")
    bevel.width=.001
    bevel.segments=2
    bpy.ops.object.modifier_apply(modifier=bevel.name)
    attach(lapel,"top")

# Fitted cropped high neck underlayer, separate from blazer.
crop=rib_band("Wardrobe_Female_CropTop",[(1.175,.113,.106),(1.19,.116,.11),
    (1.29,.151,.161),(1.38,.154,.163),(1.44,.139,.128),
    (1.51,.078,.075),(1.56,.069,.070)],underlayer,center=(0,.015,0))
attach(crop,"top")

# Tailored shorts use the publisher's authored pelvis/crotch topology, retaining
# a real connected crotch and the source's weighted folds.
outfit_rig,outfit_meshes=import_model(next((RAW/"outfits/extracted").rglob("Female_Peasant.gltf")))
shorts=next(o for o in outfit_meshes if "Legs" in o.name)
rebind(shorts,outfit_rig,rig)
for obj in outfit_meshes:
    if obj!=shorts:
        bpy.data.objects.remove(obj,do_unlink=True)
remove_source_rig(outfit_rig)
shorts.name="Wardrobe_Female_TailoredShorts"
shorts.data.materials.clear()
shorts.data.materials.append(cloth)
mesh=bmesh.new()
mesh.from_mesh(shorts.data)
bmesh.ops.bisect_plane(mesh,geom=list(mesh.verts)+list(mesh.edges)+list(mesh.faces),
    plane_co=(0,0,.765),plane_no=(0,0,1),clear_inner=True,clear_outer=False)
mesh.to_mesh(shorts.data)
mesh.free()
shorts.hide_render=False
role(shorts,"bottom")
pieces.append(shorts)

# Slim leather belt and actual hollow gold rectangular buckle.
belt=rib_band("Wardrobe_Female_Belt",[(1.047,.186,.142),(1.068,.181,.140)],leather,
              center=(0,.017,0))
attach(belt,"bottom")
def box(name,loc,size,material):
    for o in bpy.context.selected_objects:o.select_set(False)
    bpy.ops.mesh.primitive_cube_add(size=1,location=loc)
    obj=bpy.context.object
    obj.name=name
    obj.dimensions=size
    bpy.ops.object.transform_apply(location=False,rotation=False,scale=True)
    # Bake object transform before canonical weight interpolation.
    bpy.ops.object.transform_apply(location=True,rotation=True,scale=True)
    obj.data.materials.append(material)
    bevel=obj.modifiers.new("Polished small edge","BEVEL")
    bevel.width=.0015
    bevel.segments=2
    bpy.ops.object.modifier_apply(modifier=bevel.name)
    return obj
for x,z,w,h in [(0,1.046,.038,.004),(0,1.069,.038,.004),
                 (-.017,1.057,.004,.025),(.017,1.057,.004,.025)]:
    attach(box("Gold belt buckle",(x,-.129,z),(w,.006,h),gold),"bottom")
# Subtle paired cuff buttons.
for side in [-1,1]:
    for x in [.663,.68,.697]:
        attach(box("Blazer cuff button",(side*x,.014,1.43),(.008,.004,.008),leather),"top")

# Pointed closed-toe pumps: separate shaped upper, thin sole and slender heel.
for side in [-1,1]:
    center_x=side*.1143
    s=Surface()
    rings=[]
    count=64
    for stage in range(4):
        ring=[]
        for j in range(count):
            a=j*math.tau/count
            cosine,sine=math.cos(a),math.sin(a)
            depth=.194 if cosine>=0 else .129
            taper=1-.62*max(0,cosine)**3
            ox=center_x+.052*sine*taper
            oy=.012-depth*cosine
            floor=.013+.050*((1-cosine)/2)**2
            if stage==0:
                point=(ox,oy,floor)
            elif stage==1:
                point=(ox,oy,floor+.008)
            else:
                t=.42 if stage==2 else 1
                ix=center_x+.031*sine
                iy=.082-.041*cosine
                z=floor+.008+(1.15 if stage==2 else 1)*t*(.128-floor)
                point=(ox*(1-t)+ix*t,oy*(1-t)+iy*t,z)
            ring.append(s.point(point))
        rings.append(ring)
    for k in range(3):
        for j in range(count):
            n=(j+1)%count
            s.face((rings[k][j],rings[k][n],rings[k+1][n],rings[k+1][j]),
                   [(j/count,k/3),((j+1)/count,k/3),((j+1)/count,(k+1)/3),(j/count,(k+1)/3)])
    shoe=s.object("Wardrobe_Female_PointedPump",leather)
    bpy.context.view_layer.objects.active=shoe
    shell=shoe.modifiers.new("Pump leather thickness","SOLIDIFY")
    shell.thickness=.002
    bpy.ops.object.modifier_apply(modifier=shell.name)
    attach(shoe,"shoes")
    heel=box("Wardrobe_Female_SlenderHeel",(center_x,.117,.032),(.016,.020,.064),leather)
    attach(heel,"shoes")

# Publisher hair is a short bob; keep its sculpted crown and extend the lower
# locks in Blender to the chest/back length required by the reference.
hair_rig,hair_meshes=import_model(next(p for p in (RAW/"base/extracted").rglob("Hair_Long.gltf")
    if "Rigged to Head Bone" in str(p)))
for hair in hair_meshes:
    rebind(hair,hair_rig,rig)
    hair.data.materials.clear()
    hair.data.materials.append(hair_mat)
    hair.name="Wardrobe_Female_LongBrunette"
    for vertex in hair.data.vertices:
        if vertex.co.z<1.68:
            t=max(0,min(1,(1.68-vertex.co.z)/.13))
            vertex.co.z-=.27*t**1.1
            vertex.co.x*=1+.19*t
            if vertex.co.y>.04:
                vertex.co.y+=.07*t
            else:
                vertex.co.y-=.065*t
    # Neck and torso share motion for the lower tips; crown stays head-weighted.
    hair.vertex_groups.clear()
    head=hair.vertex_groups.new(name="Head")
    chest=hair.vertex_groups.new(name="spine_03")
    for v in hair.data.vertices:
        t=max(0,min(.65,(1.55-v.co.z)/.28))
        head.add([v.index],1-t,"REPLACE")
        if t:chest.add([v.index],t,"REPLACE")
    role(hair,"hair")
    pieces.append(hair)
remove_source_rig(hair_rig)

for obj in bpy.context.scene.objects:
    if obj.type=="MESH" and not obj.vertex_groups:obj.hide_render=True
artifact=export_item(rig,pieces,"female-brunette-tailored")
bpy.ops.wm.save_as_mainfile(filepath=str(RAW/"female-tailored-source.blend"))
(ROOT/"docs/characters/wardrobe/female-authoring.json").write_text(json.dumps({
    "stage":"Complete-component rigged prototype; fit and visual review required",
    "artifact":str(artifact.relative_to(ROOT)),
    "components":[o.name for o in pieces],"canonicalBones":len(rig.data.bones),
    "accepted":False},indent=2)+"\n")
