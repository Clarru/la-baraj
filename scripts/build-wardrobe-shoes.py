"""Authored boot-last adaptations: hiking ankle boots and low canvas lace-ups."""
import bpy
import bmesh
import json
import math
import sys
from pathlib import Path
ROOT=Path(__file__).resolve().parents[1]
sys.path.insert(0,str(ROOT/"scripts"))
from wardrobe_rig import RAW,approved_rig,duplicate,export_item,role
from wardrobe_surfaces import rib_band
rig,approved=approved_rig()
def mat(name,color,roughness):
    result=bpy.data.materials.new(name)
    result.use_nodes=True
    shader=result.node_tree.nodes.get("Principled BSDF")
    shader.inputs["Base Color"].default_value=(*color,1)
    shader.inputs["Roughness"].default_value=roughness
    return result
leather=approved["Male_Peasant_Feet"].data.materials[0].copy()
leather.name="Wardrobe_Hiking_Leather"
leather.node_tree.nodes.get("Principled BSDF").inputs["Roughness"].default_value=.84
trim=mat("Wardrobe_Shoe_DarkRubber",(.02,.023,.024),.9)
canvas=mat("Wardrobe_Canvas_Charcoal",(.025,.028,.03),.91)
rubber=mat("Wardrobe_Canvas_Sole",(.44,.40,.32),.83)
laces=mat("Wardrobe_Shoe_Laces",(.115,.095,.071),.9)
def crop(obj,height):
    mesh=bmesh.new()
    mesh.from_mesh(obj.data)
    bmesh.ops.bisect_plane(mesh,geom=list(mesh.verts)+list(mesh.edges)+list(mesh.faces),
        plane_co=(0,0,height),plane_no=(0,0,1),clear_outer=True)
    bmesh.ops.delete(mesh,geom=[v for v in mesh.verts if not v.link_faces],context="VERTS")
    mesh.to_mesh(obj.data)
    mesh.free()
def rigid_foot(obj,side,blend_toe=True):
    obj.vertex_groups.clear()
    foot=obj.vertex_groups.new(name="foot_l" if side==1 else "foot_r")
    ball=obj.vertex_groups.new(name="ball_l" if side==1 else "ball_r")
    for v in obj.data.vertices:
        t=max(0,min(.8,(-v.co.y-.05)/.10)) if blend_toe else 0
        foot.add([v.index],1-t,"REPLACE")
        if t:ball.add([v.index],t,"REPLACE")
    obj.parent=rig
    modifier=obj.modifiers.new("Foot attachment","ARMATURE")
    modifier.object=rig
    role(obj,"shoes")
def line(name,points,radius,material,side):
    for selected in bpy.context.selected_objects:selected.select_set(False)
    data=bpy.data.curves.new(name,"CURVE")
    data.dimensions="3D"
    data.bevel_depth,data.bevel_resolution=radius,1
    spline=data.splines.new("POLY")
    spline.points.add(len(points)-1)
    for point,xyz in zip(spline.points,points):point.co=(*xyz,1)
    obj=bpy.data.objects.new(name,data)
    bpy.context.collection.objects.link(obj)
    obj.data.materials.append(material)
    obj.select_set(True)
    bpy.context.view_layer.objects.active=obj
    bpy.ops.object.convert(target="MESH")
    rigid_foot(obj,side)
    return obj
default=duplicate(approved["Male_Peasant_Feet"],"Wardrobe_Shoes_LakeBoots")
role(default,"shoes")
items=[("shoes-lake-boots",[default])]
for style,height,material in [("hiking",.242,leather),("canvas",.119,canvas)]:
    shoe=duplicate(default,"Wardrobe_Shoes_"+style.title())
    crop(shoe,height)
    shoe.data.materials.clear()
    shoe.data.materials.append(material)
    shoe.data.materials.append(trim if style=="hiking" else rubber)
    if style=="canvas":
        for vertex in shoe.data.vertices:
            if vertex.co.z<.045:
                vertex.co.z=-.004+(vertex.co.z+.004)*.63
            else:
                vertex.co.z-=.018
    # Derive a bound opening rim from the actual source last. The former guessed
    # ellipse had foot-only weights and floated away from the calf-weighted upper.
    mesh=bmesh.new()
    mesh.from_mesh(shoe.data)
    opening=height-(.018 if style=="canvas" else 0)
    boundary=[edge for edge in mesh.edges if edge.is_boundary and
        all(abs(vertex.co.z-opening)<.00001 for vertex in edge.verts)]
    if boundary:
        result=bmesh.ops.extrude_edge_only(mesh,edges=boundary)
        for vertex in [item for item in result["geom"] if isinstance(item,bmesh.types.BMVert)]:
            center=.1143 if vertex.co.x>=0 else -.1143
            vertex.co.x=center+(vertex.co.x-center)*.94
            vertex.co.y=.066+(vertex.co.y-.066)*.94
            vertex.co.z-=.003
    mesh.to_mesh(shoe.data)
    mesh.free()
    mesh=bmesh.new()
    mesh.from_mesh(shoe.data)
    bmesh.ops.bisect_plane(mesh,geom=list(mesh.verts)+list(mesh.edges)+list(mesh.faces),
        plane_co=(0,0,.027),plane_no=(0,0,1))
    mesh.to_mesh(shoe.data)
    mesh.free()
    for face in shoe.data.polygons:
        face.material_index=1 if sum(shoe.data.vertices[i].co.z for i in face.vertices)/len(face.vertices)<.027 else 0
    pieces=[shoe]
    for side in [-1,1]:
        cx=side*.1143
        # Crossed laces follow the rising instep, without floating above the shoe.
        for step in range(5 if style=="hiking" else 4):
            y=-.058+step*.021
            z=(.079+step*.020) if style=="hiking" else (.064+step*.010)
            width=.025 if style=="hiking" else .022
            points=[(cx-width,y,z),(cx,y+.009,z+.004),(cx+width,y+.018,z+.006)]
            pieces.append(line(style+" crossed lace",points,.0017,laces,side))
            points=[(cx+width,y,z),(cx,y+.009,z+.004),(cx-width,y+.018,z+.006)]
            pieces.append(line(style+" crossed lace",points,.0017,laces,side))
    items.append(("shoes-"+("trail-hikers" if style=="hiking" else "canvas-low"),pieces))
records=[]
for identifier,objects in items:
    for obj in objects:role(obj,"shoes")
    target=export_item(rig,objects,identifier)
    records.append({"id":identifier,"artifact":str(target.relative_to(ROOT)),"accepted":False})
(ROOT/"docs/characters/wardrobe/shoe-authoring.json").write_text(json.dumps(records,indent=2)+"\n")
bpy.ops.wm.save_as_mainfile(filepath=str(RAW/"shoes-source.blend"))
