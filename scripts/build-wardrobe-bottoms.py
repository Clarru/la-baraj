"""Preserve authored trousers; tailor full-length cargo and knee-short variants."""
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
from wardrobe_surfaces import bind_surface
from wardrobe_materials import fabric_normal
rig,approved=approved_rig()
source_rig,source_meshes=import_model(next((RAW/"base/extracted").rglob("Superhero_Male_FullBody.gltf")))
body=max(source_meshes,key=lambda o:len(o.data.vertices))
rebind(body,source_rig,rig)
for obj in source_meshes:obj.hide_render=True
remove_source_rig(source_rig)
def clip(obj,height,lower):
    mesh=bmesh.new()
    mesh.from_mesh(obj.data)
    bmesh.ops.bisect_plane(mesh,geom=list(mesh.verts)+list(mesh.edges)+list(mesh.faces),
        plane_co=(0,0,height),plane_no=(0,0,1),clear_inner=lower,clear_outer=not lower)
    bmesh.ops.delete(mesh,geom=[v for v in mesh.verts if not v.link_faces],context="VERTS")
    mesh.to_mesh(obj.data)
    mesh.free()
def clear_binding(obj):
    obj.vertex_groups.clear()
    for modifier in list(obj.modifiers):
        if modifier.type=="ARMATURE":obj.modifiers.remove(modifier)
    bind_surface(obj,body,rig)
def mat(name,color):
    result=bpy.data.materials.new(name)
    result.use_nodes=True
    shader=result.node_tree.nodes.get("Principled BSDF")
    shader.inputs["Base Color"].default_value=(*color,1)
    shader.inputs["Roughness"].default_value=.86
    node=result.node_tree.nodes.new("ShaderNodeTexImage")
    node.image=bpy.data.images.load(str(ROOT/"assets/wardrobe-source/textures/twill-albedo.png"),check_existing=True)
    result.node_tree.links.new(node.outputs["Color"],shader.inputs["Base Color"])
    fabric_normal(result,"twill")
    return result
cargo_mat=mat("Wardrobe_Cargo_Twill",(.10,.13,.08))
shorts_mat=mat("Wardrobe_Shorts_Twill",(.40,.32,.21))
def pocket(side,z,flap=False):
    for selected in bpy.context.selected_objects:selected.select_set(False)
    bpy.ops.mesh.primitive_cube_add(size=1,location=(side*(.207 if not flap else .218),.02,z))
    obj=bpy.context.object
    obj.name="Cargo pocket flap" if flap else "Cargo gusset pocket"
    obj.dimensions=(.026 if not flap else .014,.105,.036 if flap else .135)
    bpy.ops.object.transform_apply(location=True,rotation=True,scale=True)
    bevel=obj.modifiers.new("Tailored pocket rolled edges","BEVEL")
    bevel.width=.008
    bevel.segments=3
    bpy.ops.object.modifier_apply(modifier=bevel.name)
    obj.data.materials.append(cargo_mat)
    clear_binding(obj)
    role(obj,"bottom")
    return obj
items=[]
classic=duplicate(approved["Male_Peasant_Legs"],"Wardrobe_Bottom_Classic")
role(classic,"bottom")
items.append(("bottom-classic-tucked",[classic]))
full=duplicate(classic,"Wardrobe_Bottom_ClassicFull")
# Extend only the lower calf. Preserve the source hips, fly, crotch and knee folds.
for vertex in full.data.vertices:
    if vertex.co.z<.64:
        t=max(0,min(1,(.64-vertex.co.z)/(.64-.403)))
        vertex.co.z-=.292*t
        side=1 if vertex.co.x>=0 else -1
        center=side*.1143
        vertex.co.x=center+(vertex.co.x-center)*(1-.25*t)
        vertex.co.y=.085+(vertex.co.y-.085)*(1-.25*t)
clear_binding(full)
items.append(("bottom-classic-full",[full]))
ankle=duplicate(full,"Wardrobe_Bottom_ClassicAnkleBoot")
clip(ankle,.230,True)
items.append(("bottom-classic-ankle",[ankle]))
cargo=duplicate(full,"Wardrobe_Bottom_TrailCargo")
cargo.data.materials.clear()
cargo.data.materials.append(cargo_mat)
for uv in cargo.data.uv_layers.active.data:
    uv.uv*=16
for vertex in cargo.data.vertices:
    # A slightly gathered ankle remains clear of low footwear.
    if vertex.co.z<.22:
        side=1 if vertex.co.x>=0 else -1
        center=side*.1143
        t=max(0,min(1,(.22-vertex.co.z)/.11))
        vertex.co.x=center+(vertex.co.x-center)*(1-.12*t)
clear_binding(cargo)
pockets=[pocket(side,z,flap) for side in [-1,1] for z,flap in [(.755,False),(.818,True)]]
items.append(("bottom-trail-cargo-full",[cargo,*pockets]))
tucked=duplicate(cargo,"Wardrobe_Bottom_TrailCargoTucked")
clip(tucked,.432,True)
items.append(("bottom-trail-cargo-tucked",[tucked,*pockets]))
ankle_cargo=duplicate(cargo,"Wardrobe_Bottom_TrailCargoAnkleBoot")
clip(ankle_cargo,.230,True)
items.append(("bottom-trail-cargo-ankle",[ankle_cargo,*pockets]))
shorts=duplicate(classic,"Wardrobe_Bottom_WeekendShorts")
clip(shorts,.582,True)
shorts.data.materials.clear()
shorts.data.materials.append(shorts_mat)
for uv in shorts.data.uv_layers.active.data:
    uv.uv*=16
# Retain actual clothing thickness at the cut, independent of bare leg skin.
bpy.context.view_layer.objects.active=shorts
for modifier in list(shorts.modifiers):
    if modifier.type=="ARMATURE":shorts.modifiers.remove(modifier)
shell=shorts.modifiers.new("Shorts turned hem thickness","SOLIDIFY")
shell.thickness=.003
bpy.ops.object.modifier_apply(modifier=shell.name)
clear_binding(shorts)
skin=duplicate(body,"Wardrobe_Bottom_ExposedLegs")
skin.hide_render=False
clip(skin,.59,False)
clip(skin,.09,True)
role(skin,"skin")
items.append(("bottom-weekend-shorts",[shorts,skin]))
for name,minimum in [("tucked",.445),("ankle",.240)]:
    leg_skin=duplicate(skin,"Wardrobe_Bottom_ExposedLegs_"+name)
    clip(leg_skin,minimum,True)
    role(leg_skin,"skin")
    items.append(("bottom-weekend-shorts-"+name,[shorts,leg_skin]))
records=[]
for name,meshes in items:
    for obj in meshes:
        if obj.get("wardrobeRole")!="skin":role(obj,"bottom")
    artifact=export_item(rig,meshes,name)
    records.append({"id":name,"artifact":str(artifact.relative_to(ROOT)),"accepted":False})
(ROOT/"docs/characters/wardrobe/bottom-authoring.json").write_text(json.dumps(records,indent=2)+"\n")
bpy.ops.wm.save_as_mainfile(filepath=str(RAW/"bottoms-source.blend"))
