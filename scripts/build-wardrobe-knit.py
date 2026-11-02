"""Headless fine knit with offline drape, turned ribs and baked surface detail."""
import bpy,sys,shutil
from pathlib import Path
assert bpy.app.background, 'Run this authoring script with Blender --background'
ROOT=Path(__file__).resolve().parents[1];sys.path.insert(0,str(ROOT/'scripts'))
assert shutil.disk_usage(ROOT).free>4*1024**3+128*1024**2
from wardrobe_rig import approved_rig,duplicate,export_item,RAW,role
from wardrobe_fitted_cloth import fitted_profiles,fit_crew_opening,knit_edge_bands,fit_turned_bands,stabilize_waist
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
# Ribs retain their direct woven material; a projected high-to-low normal can
# cross the thin folded strip and bake black patches into light colours.
rib_cloth=cloth.copy();rib_cloth.name='Wardrobe_Knit_Charcoal_Fitted_Rib'
# The export joins role meshes. Name the rib UV explicitly so the body atlas
# cannot replace it as the active render UV on that joined mesh.
rib_uv=rib_cloth.node_tree.nodes.new('ShaderNodeUVMap');rib_uv.uv_map='FabricUV'
for node in rib_cloth.node_tree.nodes:
    if node.type=='TEX_IMAGE':rib_cloth.node_tree.links.new(rib_uv.outputs['UV'],node.inputs['Vector'])
    if node.type=='NORMAL_MAP':node.uv_map='FabricUV'
bands=knit_edge_bands(garment,rib_cloth)
prepare_cloth_surface(garment)
fit_turned_bands(bands,garment)
references=[duplicate(approved[n],'Knit skin reference '+n)for n in['Male_Peasant_Body','Male_Peasant_Arms','SuperHero_Male']]
bpy.ops.object.select_all(action='DESELECT')
for obj in references:obj.select_set(True)
bpy.context.view_layer.objects.active=references[0];bpy.ops.object.join();reference=references[0]
bind_surface(garment,reference,rig)
stabilize_waist(garment)
role(garment,'top');parts=[garment]
for band in bands:bind_surface(band,garment,rig);role(band,'top');parts.append(band)
thread=bpy.data.materials.new('Unused knit thread bake control');thread.use_nodes=True
parts=cloth_atlas(garment,parts,cloth,thread,'weekend-knit',high_uv_scale=1,roughness_range=(.88,.97),bake_margin=12)
export_item(rig,parts,'top-weekend-knit')
bpy.ops.wm.save_as_mainfile(filepath=str(RAW/'draped-knit-study.blend'),compress=True)
