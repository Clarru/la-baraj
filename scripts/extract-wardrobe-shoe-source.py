"""Rex shoe adaptation; Blender Studio / Sprite Fright, CC-BY-4.0.

Run with --disable-autoexec on the downloaded source .blend. Only mesh/UV data
is reused; the source rig, scripts, animation and character are not exported.
"""
import bpy,bmesh,math,sys,json,shutil
from pathlib import Path
from mathutils import Vector
from mathutils.bvhtree import BVHTree
assert bpy.app.background, 'Run this authoring script with Blender --background'
ROOT=Path(__file__).resolve().parents[1];sys.path.insert(0,str(ROOT/'scripts'))
assert shutil.disk_usage(ROOT).free>4*1024**3+128*1024**2
from wardrobe_rig import approved_rig,export_item,role,RAW,duplicate
from wardrobe_materials import tinted_fabric_material
from wardrobe_surfaces import reduce_garment,Surface
from wardrobe_cloth_bake import cloth_atlas
source=RAW/'authored-sources/blender-studio/rex.blend'
if not source.is_file():raise RuntimeError('Missing licensed Rex source; see clothing-fit/canvas-source.json')
# Embedded source scripts are never enabled. The process remains headless.
bpy.ops.wm.open_mainfile(filepath=str(source),load_ui=False,use_scripts=False)
source_rig=bpy.data.objects['RIG-rex']
anchors={side:(source_rig.matrix_world@source_rig.data.bones['DEF-Foot.L'if side==1 else'DEF-Foot.R'].head_local).copy()for side in[-1,1]}
records={}
for name in['GEO-rex_shoes','GEO-rex_shoes_tab']:
    obj=bpy.data.objects[name];mesh=obj.data;uv=mesh.uv_layers['UVMap']
    crease=mesh.attributes.get('crease_edge')
    records[name]={
        'vertices':[(obj.matrix_world@v.co).copy()for v in mesh.vertices],
        'faces':[list(p.vertices)for p in mesh.polygons],
        'uvs':[[tuple(uv.data[i].uv)for i in p.loop_indices]for p in mesh.polygons],
        'materials':[p.material_index for p in mesh.polygons],
        'creases':{tuple(sorted(e.vertices)):crease.data[e.index].value for e in mesh.edges}if crease else{},
    }

import gzip,hashlib
output=ROOT/'assets/wardrobe-source/meshes/rex-shoes.json.gz';output.parent.mkdir(parents=True,exist_ok=True)
data={'credit':'Rex, Sprite Fright — Blender Studio','license':'CC-BY-4.0','sourceSHA256':hashlib.sha256(source.read_bytes()).hexdigest(),'anchors':{str(side):list(p)for side,p in anchors.items()},'objects':{}}
for name,record in records.items():
 data['objects'][name]={**record,'vertices':[list(p)for p in record['vertices']],'creases':[[*edge,w]for edge,w in record['creases'].items()]}
output.write_bytes(gzip.compress(json.dumps(data,separators=(',',':')).encode(),mtime=0))
print('EXTRACTED_MESH_DATA',output,output.stat().st_size)
