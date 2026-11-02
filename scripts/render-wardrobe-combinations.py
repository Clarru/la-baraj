"""Actual exported 243 men's combinations; 27-actor front/rear contact sheets."""
import bpy
import argparse
import hashlib
import itertools
import json
import math
import sys
from pathlib import Path
from mathutils import Matrix,Vector
ROOT=Path(__file__).resolve().parents[1]
sys.path.insert(0,str(ROOT/"scripts"))
from wardrobe_rig import RAW,approved_rig,import_model,remove_source_rig,reset_rig
rig,original=approved_rig()
parser=argparse.ArgumentParser()
parser.add_argument("--source",type=Path,default=RAW/"optimized")
parser.add_argument("--out",type=Path,default=RAW/"combination-review-v2")
args=parser.parse_args(sys.argv[sys.argv.index("--")+1:] if "--" in sys.argv else [])
OUT=args.out
OUT.mkdir(parents=True,exist_ok=True)
prototypes={}
source_hashes={}
for identifier in ["hair-buzzed","hair-long","hat-panel-cap","hat-knit-beanie","hat-stitched-bucket",
    "male-custom-top-skin","top-trail-overshirt","top-weekend-knit",
    "bottom-classic-full","bottom-classic-ankle",
    "bottom-trail-cargo-full","bottom-trail-cargo-ankle","bottom-trail-cargo-tucked",
    "bottom-weekend-shorts","bottom-weekend-shorts-ankle","bottom-weekend-shorts-tucked",
    "shoes-trail-hikers","shoes-canvas-low"]:
    source=args.source/f"{identifier}.glb"
    source_hashes[identifier]=hashlib.sha256(source.read_bytes()).hexdigest()
    source_rig,meshes=import_model(source)
    for obj in meshes:
        obj.parent=None
        obj.matrix_world=Matrix.Identity(4)
        obj.hide_render=True
    remove_source_rig(source_rig)
    prototypes[identifier]=meshes
for obj in original.values():obj.hide_render=True
for obj in bpy.context.scene.objects:
    if obj.type=="MESH" and not obj.vertex_groups:obj.hide_render=True
def copied_mesh(source,target):
    obj=source.copy()
    bpy.context.collection.objects.link(obj)
    obj.parent=target
    obj.matrix_parent_inverse=Matrix.Identity(4)
    obj.matrix_basis=Matrix.Identity(4)
    obj.hide_render=False
    for modifier in obj.modifiers:
        if modifier.type=="ARMATURE":modifier.object=target
    return obj
def actor(combo,index,rear):
    hair,hat,top,bottom,shoes=combo
    body=rig.copy()
    body.data=rig.data.copy()
    bpy.context.collection.objects.link(body)
    reset_rig(body)
    for track in body.animation_data.nla_tracks:
        track.mute=not track.name.startswith("Idle_Neutral")
    pivot=bpy.data.objects.new("Wardrobe combination "+str(index),None)
    bpy.context.collection.objects.link(pivot)
    pivot.location=((index%9-4)*1.13,(index//9)*6,0)
    pivot.rotation_euler.z=math.pi if rear else 0
    body.parent=pivot
    objects=[body,pivot]
    hidden=set()
    ids=["hat-"+hat]
    if hair!="parted":
        hidden.add("Hairstyle_Hair_SimpleParted")
        ids.append("hair-"+hair)
    if top!="lake-workshirt":
        hidden.update(["Male_Peasant_Arms","Male_Peasant_Body","SuperHero_Male"])
        ids.extend(["male-custom-top-skin","top-"+top])
    fit="tucked" if shoes=="lake-boots" else "ankle" if shoes=="trail-hikers" else "full"
    if bottom=="classic":
        if fit!="tucked":
            hidden.add("Male_Peasant_Legs")
            ids.append("bottom-classic-"+fit)
    elif bottom=="trail-cargo":
        hidden.add("Male_Peasant_Legs")
        ids.append("bottom-trail-cargo-"+fit)
    else:
        hidden.add("Male_Peasant_Legs")
        ids.append("bottom-weekend-shorts"+("-"+fit if fit!="full" else ""))
    if shoes!="lake-boots":
        hidden.add("Male_Peasant_Feet")
        ids.append("shoes-"+shoes)
    for name,obj in original.items():
        if name not in hidden:objects.append(copied_mesh(obj,body))
    for identifier in ids:
        for source in prototypes[identifier]:objects.append(copied_mesh(source,body))
    font=bpy.data.curves.new("Combination label","FONT")
    font.body=f"{index%27:02d} · {bottom} / {shoes}"
    font.size,font.align_x=.045,"CENTER"
    font.materials.append(ink)
    label=bpy.data.objects.new(font.name,font)
    bpy.context.collection.objects.link(label)
    label.location=(pivot.location.x,pivot.location.y-.42,.025)
    label.rotation_euler=(math.pi/2,0,0)
    objects.append(label)
    return objects,ids
bpy.ops.mesh.primitive_plane_add(size=100,location=(0,0,-.02))
floor=bpy.data.materials.new("Review floor")
floor.diffuse_color=(.115,.14,.16,1)
bpy.context.object.data.materials.append(floor)
ink=bpy.data.materials.new("Readable combination labels")
ink.diffuse_color=(.025,.04,.03,1)
world=bpy.data.worlds.new("Review sky")
world.use_nodes=True
world.node_tree.nodes["Background"].inputs[0].default_value=(.26,.30,.34,1)
world.node_tree.nodes["Background"].inputs[1].default_value=.8
bpy.context.scene.world=world
sun=bpy.data.lights.new("Uniform gallery light","SUN")
sun.energy=2.2
sun.angle=.25
obj=bpy.data.objects.new(sun.name,sun)
bpy.context.collection.objects.link(obj)
obj.rotation_euler=(math.radians(25),math.radians(-30),math.radians(-25))
fill=bpy.data.lights.new("Front fit inspection fill","SUN")
fill.energy=1
fill.angle=.4
obj=bpy.data.objects.new(fill.name,fill)
bpy.context.collection.objects.link(obj)
obj.rotation_euler=(math.radians(70),0,0)
camera=bpy.data.objects.new("Combination camera",bpy.data.cameras.new("Combination camera"))
bpy.context.collection.objects.link(camera)
camera.location=(0,-20,11)
camera.rotation_euler=(Vector((0,6,.8))-camera.location).to_track_quat("-Z","Y").to_euler()
camera.data.type,camera.data.ortho_scale="ORTHO",10.7
scene=bpy.context.scene
scene.camera=camera
scene.render.engine="CYCLES"
scene.cycles.samples=16
scene.cycles.use_denoising=True
scene.render.threads_mode,scene.render.threads="FIXED",4
scene.render.resolution_x,scene.render.resolution_y=3600,2400
scene.render.resolution_percentage=100
scene.render.image_settings.file_format="PNG"
combos=list(itertools.product(["parted","buzzed","long"],["panel-cap","knit-beanie","stitched-bucket"],
    ["lake-workshirt","trail-overshirt","weekend-knit"],["classic","trail-cargo","weekend-shorts"],
    ["lake-boots","trail-hikers","canvas-low"]))
manifest={"stage":"Exported geometry review; inspect every sheet before accepting",
          "combinations":len(combos),"source":str(args.source),"sourceSHA256":source_hashes,
          "approvedMaleSHA256":hashlib.sha256((ROOT/"apps/web/public/assets/optimized/Lakeside_Man.glb").read_bytes()).hexdigest(),
          "pose":"Idle_Neutral frame 1","sheets":[]}
for batch in range(9):
    selected=combos[batch*27:(batch+1)*27]
    for rear in [False,True]:
        objects=[]
        assets=[]
        for index,combo in enumerate(selected):
            added,ids=actor(combo,index,rear)
            objects.extend(added)
            assets.append({"index":batch*27+index,"choices":combo,"assets":ids})
        scene.frame_set(1)
        name=f"combinations-{batch:02d}-"+("rear" if rear else "front")+".png"
        scene.render.filepath=str(OUT/name)
        bpy.ops.render.render(write_still=True)
        manifest["sheets"].append({"image":str((OUT/name).relative_to(ROOT)),
            "sha256":hashlib.sha256((OUT/name).read_bytes()).hexdigest(),"actors":assets})
        (OUT/"manifest.json").write_text(json.dumps(manifest,indent=2)+"\n")
        for obj in objects:
            data=obj.data if obj.type in ["ARMATURE","FONT"] else None
            bpy.data.objects.remove(obj,do_unlink=True)
            if data and not data.users:
                if isinstance(data,bpy.types.Armature):bpy.data.armatures.remove(data)
                else:bpy.data.curves.remove(data)
        print(f"Completed {name}",flush=True)
