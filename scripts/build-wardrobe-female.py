"""Reference outfit, editable rigged prototype. Exported review decides acceptance."""
import bpy
import os
os.environ["LA_BARAJ_CLOTH_STUDY"]="1"
import bmesh
import json
import math
import sys
import shutil
from pathlib import Path
from mathutils import Vector
from mathutils.bvhtree import BVHTree
assert bpy.app.background, 'Run this authoring script with Blender --background'
ROOT=Path(__file__).resolve().parents[1]
sys.path.insert(0,str(ROOT/"scripts"))
assert shutil.disk_usage(ROOT).free>=4*1024**3+128*1024**2
from wardrobe_tailoring import tailored_blazer,fit_underlayer
from wardrobe_footwear import pumps
from wardrobe_rig import RAW,approved_rig,import_model,rebind,remove_source_rig,duplicate,export_item,role
from wardrobe_surfaces import Surface,knit_surface,finish_garment,bind_surface,rib_band,reduce_garment
from wardrobe_materials import tinted_fabric_material
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
cloth=tinted_fabric_material("Wardrobe_Female_Black_Tailoring_Fitted",(.075,.080,.090),
    "cap-cotton",roughness=.9,normal_strength=.18)
underlayer=mat("Wardrobe_Female_Black_Crop",(.009,.011,.014))
tights_mat=mat("Wardrobe_Female_Sheer_Tights",(.028,.020,.017),.76)
leather=mat("Wardrobe_Female_Black_Leather",(.006,.007,.009),.44)
leather.node_tree.nodes.get("Principled BSDF").inputs["Specular IOR Level"].default_value=.27
gold=mat("Wardrobe_Female_Buckle_Brass",(.48,.30,.09),.35,.75)
hair_mat=mat("Wardrobe_Female_Brunette",(.045,.021,.011),.72)
brows_mat=mat("Wardrobe_Female_Brunette_Brows",(.045,.021,.011),.8)
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
def clip_height(obj, low=None, high=None):
    mesh=bmesh.new()
    mesh.from_mesh(obj.data)
    for height,inner in [(low,True),(high,False)]:
        if height is not None:
            bmesh.ops.bisect_plane(mesh,geom=list(mesh.verts)+list(mesh.edges)+list(mesh.faces),
                plane_co=(0,0,height),plane_no=(0,0,1),
                clear_inner=inner,clear_outer=not inner)
    bmesh.ops.delete(mesh,geom=[v for v in mesh.verts if not v.link_faces],context="VERTS")
    mesh.to_mesh(obj.data)
    mesh.free()
def attach(obj,role_name):
    bind_surface(obj,body,rig)
    role(obj,role_name)
    pieces.append(obj)
    return obj
# The underlayer is tucked in: retain only exposed face/neck and hands.
# Covered abdominal skin must not emerge through the waist in adverse poses.
for region in ["Head","Hands"]:
    skin=duplicate(body,"Wardrobe_Female_"+region)
    skin.hide_render=False
    if region=="Head":
        clip_height(skin,1.54,None)
        select_faces(skin,lambda f:abs(centroid(f).x)<.13)
    elif region=="Hands":
        select_faces(skin,lambda f:abs(centroid(f).x)>.685)
    role(skin,"skin")
    pieces.append(skin)
for obj in meshes:
    if obj!=body:
        if "Eyebrow" in obj.name:
            obj.data.materials.clear()
            obj.data.materials.append(brows_mat)
            role(obj,"facialHair")
        obj.hide_render=False
        pieces.append(obj)
# Sheer tights retain the original leg shape/weights; opaque tint approximates
# a black sheer material without expensive transparent avatar sorting.
tights=duplicate(body,"Wardrobe_Female_Tights")
tights.hide_render=False
clip_height(tights,.015,.785)
for vertex in tights.data.vertices:
    p=vertex.co
    if p.z<.15:
        side=1 if p.x>=0 else -1
        factor=max(0,min(1,(.15-p.z)/.10))
        p.x=side*.1143+(p.x-side*.1143)*(1-.20*factor)
        p.y=.012+(p.y-.012)*(1-.10*factor)
        p.z+=.040*max(0,min(1,p.y/.13))*factor
        # Covered foot volume stays inside the shoe last. Retain the visible
        # ankle above 11 cm; publisher toes are wider than a dressed pump.
        inset=max(0,min(1,(.11-p.z)/.05))
        p.x=side*.1143+(p.x-side*.1143)*(1-.28*inset)
        p.y=.055+(p.y-.055)*(1-.20*inset)
tights.data.materials.clear()
tights.data.materials.append(tights_mat)
role(tights,"tights")
pieces.append(tights)

# Measured jacket shell with surface-fitted rolled collar and notched lapels.
jacket_cloth=cloth.copy();jacket_cloth.name='Wardrobe_Female_Black_Tailoring_Jacket_Fitted'
blazer,tailoring,blazer_front_y=tailored_blazer(body,jacket_cloth,rig)
for obj in [blazer,*tailoring]:
    role(obj,"top")
    pieces.append(obj)

# High-neck underlayer extends below the waistband; shorts/belt overlap it.
crop=rib_band("Wardrobe_Female_TuckedTop",[(1.015,.153,.119),
    (1.055,.152,.120),(1.10,.137,.113),(1.175,.113,.106),(1.19,.116,.11),
    (1.29,.151,.161),(1.38,.154,.163),(1.44,.139,.128),
    (1.51,.078,.075),(1.56,.069,.070)],underlayer,center=(0,.015,0))
fit_underlayer(crop,body)
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
clip_height(shorts,.765,1.075)
# Fit the authored shorts topology outside the actual athletic female body,
# then transfer that body's local skin field. The previous peasant-pant weights
# and narrower thigh envelope could let the tights poke through the short hem.
body.data.calc_loop_triangles()
fit_tree=BVHTree.FromPolygons([v.co.copy() for v in body.data.vertices],
    [tuple(t.vertices) for t in body.data.loop_triangles],all_triangles=True)
for vertex in shorts.data.vertices:
    point,normal,_,_=fit_tree.find_nearest(vertex.co)
    if point is not None and (vertex.co-point).dot(normal)<.010:
        vertex.co=point+normal*.010
shorts.vertex_groups.clear()
for modifier in list(shorts.modifiers):
    if modifier.type=="ARMATURE":shorts.modifiers.remove(modifier)
bind_surface(shorts,body,rig)
shorts.hide_render=False
role(shorts,"bottom")
pieces.append(shorts)

# Slim leather belt and actual hollow gold rectangular buckle.
belt=rib_band("Wardrobe_Female_Belt",[(1.047,.186,.142),(1.068,.181,.140)],leather,
              center=(0,.017,0))
# The jacket permanently covers the rear and sides. Omit that hidden belt
# volume so different pelvis/chest skin weights cannot push it through the coat.
select_faces(belt,lambda face:centroid(face).y<-.040)
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
        button=box("Blazer cuff button",(side*x,blazer_front_y(side*x,1.43)-.0015,1.43),(.006,.002,.006),leather)
        bind_surface(button,blazer,rig)
        role(button,"top")
        pieces.append(button)

# Closed almond-toe pumps use the actor's own last, a continuous sole and
# stable 4 cm tapered heel. Foot/ball weights keep the counter off the calf.
sole_mat=mat("Wardrobe_Female_Pump_Outsole",(.009,.010,.011),.82)
for side in [-1,1]:
    for component in pumps(body,side,leather,sole_mat,box):
        attach(component,"shoes")
        # The upper follows the ankle's own skin field at the opening. Rigid
        # foot-only weighting there splits it from the calf during idle/walk.
        if "AlmondPump" in component.name:
            continue
        component.vertex_groups.clear()
        foot=component.vertex_groups.new(name="foot_l" if side==1 else "foot_r")
        ball=component.vertex_groups.new(name="ball_l" if side==1 else "ball_r")
        for vertex in component.data.vertices:
            t=max(0,min(.75,(-vertex.co.y-.05)/.11)) if "Heel" not in component.name else 0
            foot.add([vertex.index],1-t,"REPLACE")
            if t:ball.add([vertex.index],t,"REPLACE")

# Publisher hair is a short bob; keep its sculpted crown and extend the lower
# locks in Blender to the chest/back length required by the reference.
hair_rig,hair_meshes=import_model(next(p for p in (RAW/"base/extracted").rglob("Hair_Long.gltf")
    if "Rigged to Head Bone" in str(p)))
coat_tree=BVHTree.FromPolygons([v.co.copy() for v in blazer.data.vertices],
    [tuple(face.vertices) for face in blazer.data.polygons],all_triangles=False)
for hair in hair_meshes:
    rebind(hair,hair_rig,rig)
    hair_mat=hair.data.materials[0].copy()
    hair_mat.name="Wardrobe_Female_Brunette"
    hair.data.materials.clear()
    hair.data.materials.append(hair_mat)
    hair.name="Wardrobe_Female_LongBrunette"
    # Inspect the authored islands, including coincident UV-seam vertices.
    # The inner scalp must stay unchanged; growing it onto the outer drape caused
    # the previous shoulder flange and overlapping layers in adverse poses.
    parent=list(range(len(hair.data.vertices)))
    def find(index):
        while parent[index]!=index:
            parent[index]=parent[parent[index]]
            index=parent[index]
        return index
    def union(a,b):
        parent[find(a)]=find(b)
    coincident={}
    for vertex in hair.data.vertices:
        key=tuple(round(value,5) for value in vertex.co)
        union(vertex.index,coincident.setdefault(key,vertex.index))
    for face in hair.data.polygons:
        for index in face.vertices:
            union(face.vertices[0],index)
    islands={}
    for vertex in hair.data.vertices:
        islands.setdefault(find(vertex.index),[]).append(vertex.index)
    island_roles={}
    hair_islands=[]
    def smooth(value):
        value=max(0,min(1,value))
        return value*value*(3-2*value)
    for indices in islands.values():
        points=[hair.data.vertices[index].co.copy() for index in indices]
        minimum=[min(point[axis] for point in points) for axis in range(3)]
        maximum=[max(point[axis] for point in points) for axis in range(3)]
        kind=("back-drape" if maximum[1]>.13 else
              "front-lock" if maximum[1]<0 and 1.61<minimum[2]<1.635 else "retained-crown")
        side=1 if sum(point.x for point in points)>=0 else -1
        hair_islands.append({"role":kind,"vertices":len(indices),"min":minimum,"max":maximum})
        for index in indices:
            island_roles[index]=kind
        if kind=="retained-crown":
            continue
        for index in indices:
            vertex=hair.data.vertices[index]
            old=vertex.co.copy()
            if kind=="back-drape":
                t=max(0,min(1,(1.70-old.z)/(1.70-minimum[2])))
                vertex.co.z=old.z-.32*t**1.1
                if vertex.co.z<1.565:
                    # Drape behind the actual coat without widening the head
                    # into a shoulder cape or moving the inner scalp layer.
                    origin=Vector((old.x,-1,vertex.co.z))
                    back_hit=None
                    for _ in range(16):
                        hit,_,_,_=coat_tree.ray_cast(origin,Vector((0,1,0)),3)
                        if hit is None:break
                        back_hit=hit
                        origin=hit+Vector((0,.0001,0))
                    if back_hit is not None:
                        # A hard max collapses inner/outer strand surfaces onto
                        # the same plane. Preserve ordered depth instead.
                        vertex.co.y=back_hit.y+.012+(old.y-minimum[1])*.15
            elif old.z<1.735:
                t=max(0,min(1,(1.735-old.z)/(1.735-minimum[2])))
                near=sorted(points,key=lambda point:abs(point.z-old.z))[:8]
                center=sum(near,Vector())/len(near)
                roots=sorted(points,key=lambda point:abs(point.z-1.735))[:8]
                start=sum(roots,Vector())/len(roots)
                # Retain the artist's tapered cross section and integrated root.
                # Only its longitudinal path grows into the front chest drape.
                p0=Vector((start.x,start.y,1.735))
                p1=Vector((side*.105,-.105,1.59))
                p2=Vector((side*.153,blazer_front_y(.153,1.36)-.020,1.36))
                end=1.25 if side==1 else 1.27
                p3=Vector((side*.135,blazer_front_y(.135,end)-.020,end))
                target=(1-t)**3*p0+3*(1-t)**2*t*p1+3*(1-t)*t*t*p2+t**3*p3
                if target.z<1.52:
                    target.y=min(target.y,blazer_front_y(abs(target.x),target.z)-.014)
                width=1+smooth(t)
                vertex.co=(target.x+(old.x-center.x)*width,
                           target.y+(old.y-center.y)*1.1,target.z)
    if (sum(item["role"]=="back-drape" for item in hair_islands)!=1 or
        sum(item["role"]=="front-lock" for item in hair_islands)!=2):
        raise RuntimeError("Publisher hair component contract changed; inspect before fitting")
    # The original bob has long sparse faces once grown. Add only the longitudinal
    # support needed by the unchanged head/torso skin, preserving the rest shape.
    mesh=bmesh.new()
    mesh.from_mesh(hair.data)
    mesh.verts.ensure_lookup_table()
    tags=mesh.verts.layers.int.new("HairFitRole")
    role_ids={"retained-crown":0,"back-drape":1,"front-lock":2}
    for vertex in mesh.verts:vertex[tags]=role_ids[island_roles[vertex.index]]
    for _ in range(3):
        edges=[edge for edge in mesh.edges if edge.verts[0][tags]>0
            and edge.verts[0][tags]==edge.verts[1][tags]
            and abs(edge.verts[0].co.z-edge.verts[1].co.z)>.055]
        if not edges:break
        bmesh.ops.subdivide_edges(mesh,edges=edges,cuts=1,use_grid_fill=True,smooth=0)
    mesh.verts.index_update()
    role_names={value:key for key,value in role_ids.items()}
    island_roles={vertex.index:role_names[vertex[tags]] for vertex in mesh.verts}
    mesh.to_mesh(hair.data)
    mesh.free()
    bpy.context.view_layer.objects.active=hair
    if hair.data.has_custom_normals:
        bpy.ops.mesh.customdata_custom_splitnormals_clear()
    for polygon in hair.data.polygons:
        polygon.use_smooth=True
    hair.data.update()
    # Low drapes follow the same skin field as the actual coat, rather than
    # rotating through it when the head and chest diverge in idle/prone poses.
    sample=duplicate(hair,"__hair_coat_weight_sample")
    sample.vertex_groups.clear()
    for modifier in list(sample.modifiers):
        if modifier.type=="ARMATURE":sample.modifiers.remove(modifier)
    bind_surface(sample,blazer,rig)
    sample_names={group.index:group.name for group in sample.vertex_groups}
    hair.vertex_groups.clear()
    groups={bone.name:hair.vertex_groups.new(name=bone.name) for bone in rig.data.bones}
    for v in hair.data.vertices:
        blend=.8*smooth((1.68-v.co.z)/.43) if island_roles[v.index]!="retained-crown" else 0
        weights={"Head":1-blend}
        for group in sample.data.vertices[v.index].groups:
            name=sample_names[group.group]
            weights[name]=weights.get(name,0)+group.weight*blend
        values=sorted(weights.items(),key=lambda item:item[1],reverse=True)[:4]
        total=sum(weight for _,weight in values)
        for name,weight in values:
            if weight:groups[name].add([v.index],weight/total,"REPLACE")
    sample_data=sample.data
    bpy.data.objects.remove(sample,do_unlink=True)
    bpy.data.meshes.remove(sample_data)
    role(hair,"hair")
    pieces.append(hair)
remove_source_rig(hair_rig)

for obj in bpy.context.scene.objects:
    if obj.type=="MESH" and not obj.vertex_groups:obj.hide_render=True
# Bake the jacket independently; shared shorts/leather materials stay intact.
from wardrobe_cloth_bake import cloth_atlas
jacket_parts=[o for o in pieces if o==blazer or o.name.startswith('Blazer cuff button')or(len(o.data.materials)==1 and o.data.materials[0]==jacket_cloth)]
other_pieces=[o for o in pieces if o not in jacket_parts]
for o in jacket_parts:
    if len(o.data.materials)==1 and o.data.materials[0]==jacket_cloth:
        for corner in o.data.uv_layers[0].data:corner.uv*=2.4
thread_control=bpy.data.materials.new('Unused jacket thread bake control');thread_control.use_nodes=True
jacket_parts=cloth_atlas(blazer,jacket_parts,jacket_cloth,thread_control,'female-jacket',high_uv_scale=2.4,roughness_range=(.86,.96))
pieces=[*other_pieces,*jacket_parts]
for o in pieces:o.hide_render=False
artifact=export_item(rig,pieces,"female-brunette-tailored")
bpy.ops.wm.save_as_mainfile(filepath=str(RAW/"female-draped-jacket-study.blend"),compress=True)
(ROOT/"docs/characters/wardrobe/female-authoring.json").write_text(json.dumps({
    "stage":"Complete-component rigged prototype; fit and visual review required",
    "artifact":str(artifact.relative_to(ROOT)),
    "components":[o.name for o in pieces],"canonicalBones":len(rig.data.bones),
    "hairConstruction":"Measured publisher islands: unchanged inner scalp/crown; fitted back drape and paired authored front locks; no added tubes",
    "hairIslands":hair_islands,
    "accepted":False},indent=2)+"\n")

# Reuse the authored toe/arch and fit the concealed foot inside the pumps.
import runpy
runpy.run_path(str(ROOT/"scripts/fit-wardrobe-pumps.py"),run_name="__main__")
