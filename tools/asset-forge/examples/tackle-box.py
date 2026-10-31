"""Closed wooden tackle box, deterministic Asset Forge custom recipe.
Source parts remain separate in source.blend; Forge consolidates only export copies.
"""
import math
import bpy
import bmesh


def build(context):
    p, m = context.parts, context.material
    # Reuse the approved timber projection, with grain along each board's length.
    # Recess the internal backer bottom 1mm above the corner feet to avoid duplicate underside faces.
    face_grain = {0: 1, 1: 0, 2: 0}
    for y in [-.062, .062]:
        p.box('Opaque continuous body backing', (0, y, .0975),
              (.448, .124, .193), m, 2, face_grain, bevel=0)
    # Real narrow recesses have an opaque backing; no light can pass through seams.
    for i in range(3):
        z = .032 + i * .064
        for sy in [-1, 1]:
            p.box(f'Body {"front" if sy < 0 else "rear"} horizontal board {i+1}',
                  (0, sy*.124, z), (.396, .012, .061), m, 2, 0, bevel=.0012)
        for sx in [-1, 1]:
            p.box(f'Body {"left" if sx < 0 else "right"} end board {i+1}',
                  (sx*.224, 0, z), (.012, .196, .061), m, 2, 1, bevel=.0012)
    # Substantial timber corner stiles overlap the backer and each adjacent face.
    for sx in [-1, 1]:
        for sy in [-1, 1]:
            key = f'Corner_{"R" if sx > 0 else "L"}_{"B" if sy > 0 else "F"}'
            # One closed L-section replaces overlapping coplanar corner boards.
            profile = [(sx*x, sy*y) for x,y in
                       [(.198,.118),(.218,.118),(.218,.098),
                        (.230,.098),(.230,.130),(.198,.130)]]
            stile=p.extrude_z(key+' continuous L-section stile', profile, 0, .193, m, 3)
            mod=stile.modifiers.new('Bevel whole corner stave','BEVEL')
            mod.width=.0015;mod.segments=1
            bpy.context.view_layer.objects.active=stile
            bpy.ops.object.modifier_apply(modifier=mod.name)
            p.uv_map(stile,3,grain_axis=2)
            context.joints[key] = [
                {'name': f'corner_depth_{i}',
                 'origin': [sx*.232, sy*.132, z],
                 'direction': [-sx, -sy, 0], 'maxDistance': .0045}
                for i, z in enumerate([.038, .0965, .155])]
            # Sparse pegs/iron screw heads, kept readable without ornamental armor.
            for z in [.035, .157]:
                p.bolt(key+' face screw', (sx*.214, sy*.1305, z),
                       (0, sy, 0), m, .0037, 6)
    # An inset rabbet closes the deliberate narrow lid/body seam.
    for y in [-.060, .060]:
        p.box('Closed lid rabbet', (0, y, .195), (.432, .120, .014),
              m, 3, face_grain, bevel=0)
    for i in range(3):
        y = -.086 + i*.086
        p.box(f'Lid board {i+1}', (0, y, .2225), (.412, .086, .047),
              m, 2, 0, bevel=.0018)
    for sx in [-1, 1]:
        p.box('Lid end cap', (sx*.218, 0, .223), (.024, .260, .048),
              m, 3, 1, bevel=.0015)
    # Continuous backing at the lid seam: three actual surface-depth samples.
    context.joints['Lid_Rabbet'] = [
        {'name': f'closed_front_{i}', 'origin': [x, -.1325, .195],
         'direction': [0, 1, 0], 'maxDistance': .014}
        for i, x in enumerate([-.18, 0, .18])]
    # Exactly two front latches, with distinct leaf, catch and toggle lever.
    for sx in [-1, 1]:
        x = sx*.145
        name = 'Latch_'+('R' if sx > 0 else 'L')
        p.box(name+' lower mounting leaf', (x, -.132, .176),
              (.037, .007, .049), m, 0, bevel=.0012)
        p.box(name+' upper catch leaf', (x, -.132, .224),
              (.037, .007, .036), m, 0, bevel=.0012)
        p.box(name+' closed bridging tongue', (x, -.134, .200),
              (.015, .007, .047), m, 1, bevel=.0012)
        p.box(name+' toggle lever', (x, -.136, .177),
              (.021, .008, .030), m, 0, bevel=.0014)
        for dx in [-.011, .011]:
            p.bolt(name+' catch fixing', (x+dx, -.136, .233),
                   (0, -1, 0), m, .0028, 6)
        context.joints[name] = [
            {'name': f'leaf_contact_{i}', 'origin': [x+dx, -.133, z],
             'direction': [0, 1, 0], 'maxDistance': .0045}
            for i, (dx, z) in enumerate([(-.012, .160), (.012, .184), (0, .237)])]
    # Two rear hinge assemblies; the narrow pin is genuine 3D geometry.
    for sx in [-1, 1]:
        x = sx*.145
        name='Hinge_'+('R' if sx > 0 else 'L')
        p.box(name+' lower leaf', (x, .130, .177), (.047, .007, .039),
              m, 0, bevel=.001)
        p.box(name+' upper leaf', (x, .130, .222), (.047, .007, .037),
              m, 0, bevel=.001)
        bpy.ops.mesh.primitive_cylinder_add(vertices=8, radius=.0055,
            depth=.049, location=(x, .130, .199), rotation=(0, math.pi/2, 0))
        p.finish(bpy.context.object, name+' hinge barrel', m, 1)
        for dx in [-.014, .014]:
            for z in [.169, .229]:
                p.bolt(name+' fixing', (x+dx, .132, z), (0, 1, 0), m, .0027, 6)
        context.joints[name] = [
            {'name': f'leaf_contact_{i}', 'origin': [x+dx, .131, z],
             'direction': [0, -1, 0], 'maxDistance': .0045}
            for i, (dx,z) in enumerate([(-.014,.169),(.014,.229),(0,.184)])]
    # One closed iron handle profile; no disconnected bars at its upper corners.
    profile=[(-.100,.248),(-.083,.248),(-.071,.292),(.071,.292),
             (.083,.248),(.100,.248),(.086,.308),(-.086,.308)]
    verts=[(x,y,z) for y in [-.009,.009] for x,z in profile]
    n=len(profile)
    faces=[tuple(reversed(range(n))),tuple(range(n,n*2))]
    faces += [(i,(i+1)%n,(i+1)%n+n,i+n) for i in range(n)]
    obj=p.mesh_object('One continuous raised iron carry handle', verts, faces, m, 0)
    bm=bmesh.new();bm.from_mesh(obj.data)
    bmesh.ops.recalc_face_normals(bm,faces=list(bm.faces));bm.to_mesh(obj.data);bm.free()
    bevel=obj.modifiers.new('Restrained handle edge bevel','BEVEL')
    bevel.width=.0012;bevel.segments=1
    bpy.context.view_layer.objects.active=obj;bpy.ops.object.modifier_apply(modifier=bevel.name)
    p.uv_map(obj,0)
    p.box('Warm timber carrying grip', (0, 0, .301), (.136, .032, .030),
          m, 3, 0, bevel=.004)
    for sx in [-1,1]:
        x=sx*.092
        name='Handle_'+('R' if sx>0 else 'L')
        p.box(name+' iron mounting foot', (x,0,.249), (.046,.038,.008),
              m,1,bevel=.001)
        for y in [-.011,.011]:
            p.bolt(name+' foot screw',(sx*.108,y,.253),(0,0,1),m,.0028,6)
        context.joints[name]=[
            {'name':f'foot_attachment_{i}', 'origin':[x+dx,y,.250],
             'direction':[0,0,-1], 'maxDistance':.006}
            for i,(dx,y) in enumerate([(-.016,-.011),(.016,.011),(0,0)])]
    return {'CarryGrip':(0,0,.301), 'Placement':(0,-.002,0)}
