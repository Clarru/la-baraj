import bpy, sys
args=sys.argv[sys.argv.index('--')+1:]
bpy.ops.object.select_all(action='SELECT'); bpy.ops.object.delete(use_global=False)
bpy.ops.import_scene.gltf(filepath=args[0])
wood=next(o for o in bpy.context.scene.objects if o.type=='MESH' and 'Trunk' in o.name)
bpy.ops.object.select_all(action='DESELECT'); wood.select_set(True); bpy.context.view_layer.objects.active=wood
bpy.ops.object.mode_set(mode='EDIT'); bpy.ops.mesh.select_all(action='SELECT'); bpy.ops.mesh.fill_holes(sides=0); bpy.ops.object.mode_set(mode='OBJECT')
remesh=wood.modifiers.new('Smooth joined limbs','REMESH'); remesh.mode='VOXEL'; remesh.voxel_size=0.07; remesh.use_smooth_shade=True
bpy.ops.object.modifier_apply(modifier=remesh.name)
smooth=wood.modifiers.new('Soften junctions','SMOOTH');smooth.factor=1.2;smooth.iterations=3;bpy.ops.object.modifier_apply(modifier=smooth.name)
dec=wood.modifiers.new('Reduce mesh','DECIMATE');dec.ratio=min(1,900/max(1,len(wood.data.polygons)));bpy.ops.object.modifier_apply(modifier=dec.name)
bpy.ops.object.mode_set(mode='EDIT');bpy.ops.mesh.select_all(action='SELECT');bpy.ops.uv.smart_project(island_margin=0.02);bpy.ops.object.mode_set(mode='OBJECT')
print('Wood triangles:',sum(len(p.vertices)-2 for p in wood.data.polygons))
bpy.ops.export_scene.gltf(filepath=args[1],export_format='GLB')
