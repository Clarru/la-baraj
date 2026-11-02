"""Distinct trail overshirt: connected shell, folded collar, placket, pockets."""
import bpy
import bmesh
import math
import sys
from pathlib import Path
ROOT=Path(__file__).resolve().parents[1]
sys.path.insert(0,str(ROOT/"scripts"))
from wardrobe_rig import RAW,approved_rig,import_model,rebind,remove_source_rig,export_item,role
from wardrobe_surfaces import Surface,knit_surface,finish_garment,bind_surface,reduce_garment
from wardrobe_materials import fabric_normal
rig,approved=approved_rig()
source_rig,meshes=import_model(next((RAW/"base/extracted").rglob("Superhero_Male_FullBody.gltf")))
body=max(meshes,key=lambda o:len(o.data.vertices))
rebind(body,source_rig,rig)
for obj in meshes:obj.hide_render=True
remove_source_rig(source_rig)
def mat(name,color,texture=False):
    m=bpy.data.materials.new(name)
    m.use_nodes=True
    bsdf=m.node_tree.nodes.get("Principled BSDF")
    bsdf.inputs["Base Color"].default_value=(*color,1)
    bsdf.inputs["Roughness"].default_value=.86
    if texture:
        node=m.node_tree.nodes.new("ShaderNodeTexImage")
        node.image=bpy.data.images.load(str(ROOT/"assets/wardrobe-source/textures/twill-albedo.png"),check_existing=True)
        m.node_tree.links.new(node.outputs["Color"],bsdf.inputs["Base Color"])
        fabric_normal(m,"twill")
    return m
cloth=mat("Wardrobe_Overshirt_Navy",(.025,.055,.09),True)
underlayer=mat("Wardrobe_Overshirt_Tee",(.14,.15,.12))
button=mat("Wardrobe_Overshirt_Brass",(.22,.14,.06))
pieces=[]
def attach(obj):
    bind_surface(obj,body,rig)
    role(obj,"top")
    pieces.append(obj)
    return obj
profiles=[(.985,.193,.159,.149),(1.00,.197,.160,.150),(1.035,.197,.163,.151),
    (1.10,.190,.157,.146),(1.24,.210,.175,.151),(1.37,.226,.185,.150),
    (1.43,.233,.181,.150),(1.48,.239,.164,.145),(1.52,.232,.136,.129),
    (1.555,.085,.076,.072),(1.575,.080,.074,.070)]
shirt=knit_surface(cloth,profiles,[0,0,0,0,0,.055,.09,.15,.22,.25,.25],
                   name="Wardrobe_Top_TrailOvershirt")
finish_garment(shirt)
reduce_garment(shirt,.4)
attach(shirt)
# A retained fabric underlayer closes the small top opening, without altering skin.
tee=knit_surface(underlayer,name="Wardrobe_Overshirt_Underlayer")
for vertex in tee.data.vertices:
    vertex.co.x*=.965
    vertex.co.y=.045+(vertex.co.y-.045)*.94
mesh=bmesh.new()
mesh.from_mesh(tee.data)
def covered(face):
    p=sum((v.co for v in face.verts),__import__("mathutils").Vector())/len(face.verts)
    return abs(p.x)<.11 and p.y<0 and p.z>1.15
bmesh.ops.delete(mesh,geom=[face for face in mesh.faces if not covered(face)],context="FACES")
bmesh.ops.delete(mesh,geom=[v for v in mesh.verts if not v.link_faces],context="VERTS")
mesh.to_mesh(tee.data)
mesh.free()
finish_garment(tee)
attach(tee)
# Folded collar, with visible underside and crisp points.
for side in [-1,1]:
    s=Surface()
    coordinates=[(.052,-.025,1.574),(.095,-.055,1.553),(.150,-.120,1.497),
                 (.092,-.163,1.444),(.040,-.115,1.529)]
    ids=[s.point((side*x,y,z)) for x,y,z in coordinates]
    s.face(ids,[(0,1),(.3,1),(1,.1),(.7,0),(0,.5)])
    collar=s.object("Overshirt pointed collar",cloth)
    bpy.context.view_layer.objects.active=collar
    shell=collar.modifiers.new("Collar doubled fabric","SOLIDIFY")
    shell.thickness=.003
    bpy.ops.object.modifier_apply(modifier=shell.name)
    attach(collar)
    def front_y(x,z):
        low,high=profiles[0],profiles[-1]
        for a,b in zip(profiles,profiles[1:]):
            if a[0]<=z<=b[0]:
                low,high=a,b
                break
        t=max(0,min(1,(z-low[0])/(high[0]-low[0])))
        width=low[1]*(1-t)+high[1]*t
        depth=low[2]*(1-t)+high[2]*t
        return .045-depth*math.sqrt(max(0,1-(x/width)**2))
    for name,z,half_width,height,extra in [
        ("Overshirt chest pocket",1.325,.047,.09,.0),
        ("Overshirt pocket flap",1.377,.049,.027,-.004)]:
        s=Surface()
        rows=[]
        for row in range(4):
            dz=(row/3-.5)*height
            ids=[]
            for column in range(7):
                x=side*.115+(column/6-.5)*2*half_width
                y=front_y(x,z+dz)-.003+extra-.003*math.sin(column/6*math.pi)
                ids.append(s.point((x,y,z+dz)))
            rows.append(ids)
        for row in range(3):
            for col in range(6):
                s.face((rows[row][col],rows[row][col+1],rows[row+1][col+1],rows[row+1][col]),
                    [(col/6,row/3),((col+1)/6,row/3),((col+1)/6,(row+1)/3),(col/6,(row+1)/3)])
        pocket=s.object(name,cloth)
        bpy.context.view_layer.objects.active=pocket
        shell=pocket.modifiers.new("Pocket fabric gusset","SOLIDIFY")
        shell.thickness=.003
        bpy.ops.object.modifier_apply(modifier=shell.name)
        attach(pocket)
# Actual small four-hole-style buttons, fully rigid in each weighted local region.
for z in [1.06,1.15,1.24,1.33,1.42]:
    for selected in bpy.context.selected_objects:selected.select_set(False)
    bpy.ops.mesh.primitive_uv_sphere_add(segments=12,ring_count=6,radius=1,location=(.014,front_y(.014,z)-.003,z))
    obj=bpy.context.object
    obj.name="Overshirt placket button"
    obj.scale=(.006,.0025,.006)
    bpy.ops.object.transform_apply(location=True,rotation=True,scale=True)
    obj.data.materials.append(button)
    attach(obj)
artifact=export_item(rig,pieces,"top-trail-overshirt")
bpy.ops.wm.save_as_mainfile(filepath=str(RAW/"overshirt-source.blend"))
print("Exported unaccepted overshirt prototype",artifact)
