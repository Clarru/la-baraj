"""Headless fine knit with offline drape, turned ribs and baked surface detail."""
import bpy,sys,shutil
from pathlib import Path
assert bpy.app.background, 'Run this authoring script with Blender --background'
ROOT=Path(__file__).resolve().parents[1];sys.path.insert(0,str(ROOT/'scripts'))
assert shutil.disk_usage(ROOT).free>4*1024**3+128*1024**2
from wardrobe_rig import approved_rig,duplicate,export_item,RAW,role
from wardrobe_fitted_cloth import fitted_profiles,fit_crew_opening,knit_edge_bands
from wardrobe_surfaces import knit_surface,bind_surface
from wardrobe_materials import tinted_fabric_material
from wardrobe_cloth_drape import cotton_drape
from wardrobe_cloth_bake import prepare_cloth_surface,cloth_atlas
rig,approved=approved_rig()
cloth=tinted_fabric_material('Wardrobe_Knit_Charcoal_Fitted',(.23,.26,.29),'knit',roughness=.92,normal_strength=.18)
garment=knit_surface(cloth,profiles=fitted_profiles(),name='Draped fine knit body',center_y=.020,shoulder_back=.045)
fit_crew_opening(garment,approved['SuperHero_Male'])
neckline=[garment.data.vertices[10*48+j].co.copy()for j in range(48)]
for corner in garment.data.uv_layers[0].data:corner.uv*=3
cotton_drape(garment,neckline)
bands=knit_edge_bands(garment,cloth)
prepare_cloth_surface(garment)
references=[duplicate(approved[n],'Knit skin reference '+n)for n in['Male_Peasant_Body','Male_Peasant_Arms','SuperHero_Male']]
bpy.ops.object.select_all(action='DESELECT')
for obj in references:obj.select_set(True)
bpy.context.view_layer.objects.active=references[0];bpy.ops.object.join();reference=references[0]
bind_surface(garment,reference,rig);role(garment,'top');parts=[garment]
for band in bands:bind_surface(band,garment,rig);role(band,'top');parts.append(band)
thread=bpy.data.materials.new('Unused knit thread bake control');thread.use_nodes=True
parts=cloth_atlas(garment,parts,cloth,thread,'weekend-knit',high_uv_scale=1,roughness_range=(.88,.97))
export_item(rig,parts,'top-weekend-knit')
bpy.ops.wm.save_as_mainfile(filepath=str(RAW/'draped-knit-study.blend'),compress=True)
