"""Reference outfit, editable rigged prototype. Exported review decides acceptance."""
import bpy
import bmesh
import json
import math
import sys
from pathlib import Path
from mathutils import Vector
from mathutils.bvhtree import BVHTree
ROOT=Path(__file__).resolve().parents[1]
sys.path.insert(0,str(ROOT/"scripts"))
from wardrobe_rig import RAW,approved_rig,import_model,rebind,remove_source_rig,duplicate,export_item,role
from wardrobe_surfaces import Surface,knit_surface,finish_garment,bind_surface,rib_band,reduce_garment
from wardrobe_materials import fabric_normal
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
cloth=mat("Wardrobe_Female_Black_Tailoring",(.005,.007,.009),.9)
texture=cloth.node_tree.nodes.new("ShaderNodeTexImage")
texture.image=bpy.data.images.load(str(ROOT/"assets/wardrobe-source/textures/twill-albedo.png"))
cloth.node_tree.links.new(texture.outputs["Color"],cloth.node_tree.nodes.get("Principled BSDF").inputs["Base Color"])
fabric_normal(cloth,"twill")
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
# Keep exposed face/neck, hands and the narrow midriff only. Covered body is removed.
for region in ["Head","Hands","Midriff"]:
    skin=duplicate(body,"Wardrobe_Female_"+region)
    skin.hide_render=False
    if region=="Head":
        clip_height(skin,1.54,None)
        select_faces(skin,lambda f:abs(centroid(f).x)<.13)
    elif region=="Hands":
        select_faces(skin,lambda f:abs(centroid(f).x)>.685)
    else:
        clip_height(skin,1.055,1.20)
        select_faces(skin,lambda f:abs(centroid(f).x)<.18)
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
clip_height(tights,.015,.825)
for vertex in tights.data.vertices:
    p=vertex.co
    if p.z<.15:
        side=1 if p.x>=0 else -1
        factor=max(0,min(1,(.15-p.z)/.10))
        p.x=side*.1143+(p.x-side*.1143)*(1-.20*factor)
        p.y=.012+(p.y-.012)*(1-.10*factor)
        p.z+=.070*max(0,min(1,p.y/.13))*factor
tights.data.materials.clear()
tights.data.materials.append(tights_mat)
role(tights,"tights")
pieces.append(tights)

# Structured connected blazer shell, open down the front, with full sleeves.
profiles=[(.79,.225,.170,.175),(.807,.228,.173,.178),(.87,.226,.174,.175),
    (1.03,.209,.178,.170),(1.24,.215,.213,.164),(1.37,.228,.207,.155),
    (1.43,.238,.180,.149),(1.48,.243,.160,.145),(1.52,.232,.135,.131),
    (1.555,.092,.083,.080),(1.575,.086,.079,.077)]
blazer=knit_surface(cloth,profiles,[.52,.52,.49,.38,.43,.57,.62,.53,.45,1.15,1.20],
                    name="Wardrobe_Female_Blazer")
finish_garment(blazer,.004)
reduce_garment(blazer,.4)
attach(blazer,"top")
# Coat skirts hang from the pelvis rather than acquiring arbitrary nearest-thigh
# weights. Keep ring weights continuous across the front opening and hem.
pelvis=blazer.vertex_groups.get("pelvis")
if not pelvis:
    pelvis=blazer.vertex_groups.new(name="pelvis")
for vertex in blazer.data.vertices:
    if vertex.co.z<1.12:
        for group in blazer.vertex_groups:
            group.remove([vertex.index])
        pelvis.add([vertex.index],1,"REPLACE")

# Project the folded collar/lapels onto the measured outer chest, instead of
# spanning the opening as the previous cravat-like six-point polygon did.
def blazer_front_y(x,z):
    low,high=profiles[0],profiles[-1]
    for a,b in zip(profiles,profiles[1:]):
        if a[0]<=z<=b[0]:
            low,high=a,b
            break
    t=max(0,min(1,(z-low[0])/(high[0]-low[0])))
    width=low[1]*(1-t)+high[1]*t
    front=low[2]*(1-t)+high[2]*t
    return .045-front*math.sqrt(max(0,1-(x/width)**2))
for side in [-1,1]:
    s=Surface()
    for pattern in [
        [(.085,1.566),(.150,1.500),(.125,1.435),(.078,1.530)],
        [(.112,1.442),(.124,1.420),(.157,1.425),(.186,1.340),(.095,1.160),(.118,1.360)],
    ]:
        indices=[s.point((side*x,blazer_front_y(x,z)-(.012 if z>1.55 else .006),z))
                 for x,z in pattern]
        uvs=[(x/.24,z/.24) for x,z in pattern]
        if side==1:
            indices.reverse()
            uvs.reverse()
        s.face(indices,uvs)
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
    s=Surface()
    rows=[]
    for row in range(3):
        z=.97+row*.016
        ids=[]
        for column in range(7):
            x=side*(.105+column*.013)
            y=.045-.177*math.sqrt(max(0,1-(x/.218)**2))-.004
            ids.append(s.point((x,y,z)))
        rows.append(ids)
    for row in range(2):
        for col in range(6):
            s.face((rows[row][col],rows[row][col+1],rows[row+1][col+1],rows[row+1][col]),
                [(col/6,row/2),((col+1)/6,row/2),((col+1)/6,(row+1)/2),(col/6,(row+1)/2)])
    welt=s.object("Blazer tailored pocket welt",cloth)
    bpy.context.view_layer.objects.active=welt
    shell=welt.modifiers.new("Pocket flap doubled cloth","SOLIDIFY")
    shell.thickness=.0035
    bpy.ops.object.modifier_apply(modifier=shell.name)
    attach(welt,"top")

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
clip_height(shorts,.765,1.075)
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
            depth=.145 if cosine>=0 else .120
            taper=1-.52*max(0,cosine)**3
            ox=center_x+.052*sine*taper
            oy=.012-depth*cosine
            floor=.013+.070*((1-cosine)/2)**2
            if stage==0:
                point=(ox,oy,floor)
            elif stage==1:
                point=(ox,oy,floor+.008)
            else:
                t=.42 if stage==2 else 1
                ix=center_x+.036*sine
                iy=.033-.096*cosine
                opening_height=.055+.095*((1-cosine)/2)
                z=floor+.008+(1.1 if stage==2 else 1)*t*(opening_height-floor)
                point=(ox*(1-t)+ix*t,oy*(1-t)+iy*t,z)
            ring.append(s.point(point))
        rings.append(ring)
    for k in range(3):
        for j in range(count):
            n=(j+1)%count
            s.face((rings[k][j],rings[k][n],rings[k+1][n],rings[k+1][j]),
                   [(j/count,k/3),((j+1)/count,k/3),((j+1)/count,(k+1)/3),(j/count,(k+1)/3)])
    center=s.point((center_x,.02,.035))
    for j in range(count):
        n=(j+1)%count
        s.face((rings[0][n],rings[0][j],center),
               [(n/count,0),(j/count,0),(.5,.5)])
    shoe=s.object("Wardrobe_Female_PointedPump",leather)
    bpy.context.view_layer.objects.active=shoe
    shell=shoe.modifiers.new("Pump leather thickness","SOLIDIFY")
    shell.thickness=.002
    bpy.ops.object.modifier_apply(modifier=shell.name)
    attach(shoe,"shoes")
    heel=box("Wardrobe_Female_SlenderHeel",(center_x,.117,.042),(.014,.018,.084),leather)
    attach(heel,"shoes")
    for component in [shoe,heel]:
        component.vertex_groups.clear()
        foot=component.vertex_groups.new(name="foot_l" if side==1 else "foot_r")
        ball=component.vertex_groups.new(name="ball_l" if side==1 else "ball_r")
        for vertex in component.data.vertices:
            t=max(0,min(.75,(-vertex.co.y-.05)/.11)) if component==shoe else 0
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
artifact=export_item(rig,pieces,"female-brunette-tailored")
bpy.ops.wm.save_as_mainfile(filepath=str(RAW/"female-tailored-source.blend"))
(ROOT/"docs/characters/wardrobe/female-authoring.json").write_text(json.dumps({
    "stage":"Complete-component rigged prototype; fit and visual review required",
    "artifact":str(artifact.relative_to(ROOT)),
    "components":[o.name for o in pieces],"canonicalBones":len(rig.data.bones),
    "hairConstruction":"Measured publisher islands: unchanged inner scalp/crown; fitted back drape and paired authored front locks; no added tubes",
    "hairIslands":hair_islands,
    "accepted":False},indent=2)+"\n")
