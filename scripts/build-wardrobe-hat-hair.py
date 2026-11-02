"""Trim hidden crown hair for fitted hats; preserve the selected style below rim."""
import bpy,bmesh,sys
from pathlib import Path
ROOT=Path(__file__).resolve().parents[1];sys.path.insert(0,str(ROOT/'scripts'))
from wardrobe_rig import RAW,approved_rig,duplicate,import_model,rebind,remove_source_rig,export_item,role
rig,approved=approved_rig()
from mathutils.bvhtree import BVHTree
head=approved['SuperHero_Male'];head.data.calc_loop_triangles()
scalp=BVHTree.FromPolygons([v.co.copy()for v in head.data.vertices],[list(t.vertices)for t in head.data.loop_triangles],all_triangles=True)
for style in ['parted','buzzed','long']:
    if style=='parted':parts=[duplicate(approved['Hairstyle_Hair_SimpleParted'],'Hat-compatible side part')]
    else:
        source,parts=import_model(RAW/'optimized'/f'hair-{style}.glb')
        for o in parts:rebind(o,source,rig)
        remove_source_rig(source)
    for o in parts:
        # Hair under a close-fitting cap is compressed above the temple, while
        # preserving sideburns and the hanging length of the selected style.
        for v in o.data.vertices:
            t=max(0,min(1,(v.co.z-1.70)/.045))
            point,normal,_,_=scalp.find_nearest(v.co)
            if point is not None:v.co=v.co.lerp(point+normal*.003,t)
        bm=bmesh.new();bm.from_mesh(o.data)
        bmesh.ops.bisect_plane(bm,geom=list(bm.verts)+list(bm.edges)+list(bm.faces),
            plane_co=(0,0,1.755),plane_no=(0,0,1),clear_outer=True)
        bmesh.ops.delete(bm,geom=[v for v in bm.verts if not v.link_faces],context='VERTS')
        bm.to_mesh(o.data);bm.free();role(o,'hair')
    export_item(rig,parts,f'hair-{style}-hat')
bpy.ops.wm.save_as_mainfile(filepath=str(RAW/'hat-hair-source.blend'))
