import bpy, sys, math
args=sys.argv[sys.argv.index('--')+1:]
bpy.ops.object.select_all(action='SELECT'); bpy.ops.object.delete(use_global=False)
bpy.ops.import_scene.gltf(filepath=args[0])
wood=next(o for o in bpy.context.scene.objects if o.type=='MESH' and 'Trunk' in o.name)
bpy.ops.object.select_all(action='DESELECT'); wood.select_set(True); bpy.context.view_layer.objects.active=wood
remesh=wood.modifiers.new('Smooth joined limbs','REMESH'); remesh.mode='VOXEL'; remesh.voxel_size=0.10; remesh.use_smooth_shade=True
bpy.ops.object.modifier_apply(modifier=remesh.name)
print('Post-remesh validation:', wood.data.validate(verbose=False, clean_customdata=False))
smooth=wood.modifiers.new('Soften junctions','SMOOTH');smooth.factor=.5;smooth.iterations=2;bpy.ops.object.modifier_apply(modifier=smooth.name)
# Remove any stale remesh data before assigning explicit cylindrical UVs.
changed=wood.data.validate(verbose=True, clean_customdata=False)
print('Mesh validation changed data:', changed)
bpy.ops.object.mode_set(mode='EDIT'); bpy.ops.mesh.select_all(action='SELECT'); bpy.ops.mesh.fill_holes(sides=0); bpy.ops.object.mode_set(mode='OBJECT')
print('Validation after filling:', wood.data.validate(verbose=False, clean_customdata=False))
uv_layer=wood.data.uv_layers.active or wood.data.uv_layers.new(name='BarkUV')
for poly in wood.data.polygons:
    coords=[]
    for li in poly.loop_indices:
        v=wood.data.vertices[wood.data.loops[li].vertex_index].co
        coords.append(((math.atan2(v.y,v.x)/(2*math.pi))%1.0, v.z*.18))
    crosses=max(x for x,y in coords)-min(x for x,y in coords)>.5
    for li,(u,v) in zip(poly.loop_indices,coords):
        uv_layer.data[li].uv=(u+1 if crosses and u<.5 else u,v)
wood.data.update()
print('Wood triangles:',sum(len(p.vertices)-2 for p in wood.data.polygons))
bpy.ops.export_scene.gltf(filepath=args[1],export_format='GLB')
