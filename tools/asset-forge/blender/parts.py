"""Small reusable Blender construction helpers; all coordinates are metres/Z-up."""
import math
import random

import bpy
from mathutils import Vector


def atlas_material(path, normal_path=None, metallic_roughness_path=None):
    material = bpy.data.materials.new("LaBaraj iron")
    material.use_nodes = True
    shader = material.node_tree.nodes.get("Principled BSDF")
    shader.inputs["Roughness"].default_value = 1 if metallic_roughness_path else .78
    shader.inputs["Metallic"].default_value = 1 if metallic_roughness_path else .05
    image = bpy.data.images.load(str(path))
    image.pack()
    texture = material.node_tree.nodes.new("ShaderNodeTexImage")
    texture.image = image
    material.node_tree.links.new(texture.outputs["Color"], shader.inputs["Base Color"])
    if normal_path:
        image=bpy.data.images.load(str(normal_path));image.colorspace_settings.name='Non-Color';image.pack()
        texture=material.node_tree.nodes.new('ShaderNodeTexImage');texture.image=image
        normal=material.node_tree.nodes.new('ShaderNodeNormalMap');normal.space='TANGENT'
        material.node_tree.links.new(texture.outputs['Color'],normal.inputs['Color'])
        material.node_tree.links.new(normal.outputs['Normal'],shader.inputs['Normal'])
    if metallic_roughness_path:
        image=bpy.data.images.load(str(metallic_roughness_path));image.colorspace_settings.name='Non-Color';image.pack()
        texture=material.node_tree.nodes.new('ShaderNodeTexImage');texture.image=image
        separate=material.node_tree.nodes.new('ShaderNodeSeparateColor');separate.mode='RGB'
        material.node_tree.links.new(texture.outputs['Color'],separate.inputs['Color'])
        material.node_tree.links.new(separate.outputs['Green'],shader.inputs['Roughness'])
        material.node_tree.links.new(separate.outputs['Blue'],shader.inputs['Metallic'])
    return material


def uv_map(obj, strip=0, grain_axis=2, highlight=False, compact=False):
    """Box projection per part, with grain aligned to an explicit local axis."""
    mesh = obj.data
    layer = mesh.uv_layers.active or mesh.uv_layers.new(name="UVMap")
    low = [min(v.co[i] for v in mesh.vertices) for i in range(3)]
    high = [max(v.co[i] for v in mesh.vertices) for i in range(3)]
    spans = [max(high[i] - low[i], 1e-8) for i in range(3)]
    rng = random.Random(obj.name)
    phase_u, phase_v = rng.uniform(0,.085), rng.uniform(0,.28)
    density=obj.data.materials[0].get('forge_texel_density',None) if obj.data.materials else None
    for face in mesh.polygons:
        face_low=[min(mesh.vertices[i].co[j] for i in face.vertices) for j in range(3)]
        face_high=[max(mesh.vertices[i].co[j] for i in face.vertices) for j in range(3)]
        face_spans=[max(face_high[j]-face_low[j],1e-8) for j in range(3)]
        normal_axis = max(range(3), key=lambda i: abs(face.normal[i]))
        axes = [i for i in range(3) if i != normal_axis]
        requested_axis = grain_axis.get(normal_axis, 2) if isinstance(grain_axis, dict) else grain_axis
        v_axis = max(axes, key=lambda i: face_spans[i]) if requested_axis == -1 else (requested_axis if requested_axis in axes else axes[1])
        u_axis = next(i for i in axes if i != v_axis)
        bevel_face=highlight and max(abs(v) for v in face.normal) < .999
        selected = 1 if bevel_face else strip
        for loop_index in face.loop_indices:
            vertex = mesh.vertices[mesh.loops[loop_index].vertex_index].co
            u = (vertex[u_axis] - low[u_axis]) / spans[u_axis]
            v = (vertex[v_axis] - low[v_axis]) / spans[v_axis]
            if strip >= 2:
                if density:
                    # Use one physical projection across coplanar subdivisions.
                    # Only restart an axis when the entire part cannot fit its trim.
                    u_span=spans[u_axis] if spans[u_axis]*density/512<=.225 else face_spans[u_axis]
                    v_span=spans[v_axis] if spans[v_axis]*density/512<=.96 else face_spans[v_axis]
                    u_origin=low[u_axis] if u_span==spans[u_axis] else face_low[u_axis]
                    v_origin=low[v_axis] if v_span==spans[v_axis] else face_low[v_axis]
                    us=u_span*density/512;vs=v_span*density/512
                    if us>.225 or vs>.96:
                        raise ValueError(f'{obj.name}: face too large for consistent trim density; split the board or choose its grain axis')
                    fu=(vertex[u_axis]-u_origin)/u_span
                    fv=(vertex[v_axis]-v_origin)/v_span
                    plane=f'{obj.name}:{normal_axis}:{face.normal[normal_axis]>0}:{v_axis}'
                    pu=random.Random(f'{plane}:u:{u_origin:.6f}:{u_span:.6f}').uniform(0,max(0,.225-us))
                    pv=random.Random(f'{plane}:v:{v_origin:.6f}:{v_span:.6f}').uniform(0,max(0,.96-vs))
                    layer.data[loop_index].uv=(selected*.25+.012+pu+us*fu,.015+pv+vs*fv)
                else:
                    layer.data[loop_index].uv = (selected*.25+.012+phase_u+.13*u,.015+phase_v+.69*v)
            else:
                # Broad faces span their trim's baked edge profile. Real bevel faces
                # and small fittings sample the flat lighter center instead.
                if bevel_face or compact:
                    layer.data[loop_index].uv=(.25+.075+.10*u,.25+.50*v)
                else:
                    layer.data[loop_index].uv=(selected*.25+.002+.246*u,.002+.996*v)


def finish(obj, name, material, strip=0, grain_axis=2, bevel=0):
    obj.name = name
    if strip >= 2:
        timber = bpy.data.materials.get("LaBaraj timber")
        if timber is None:
            timber = material.copy()
            timber.name = "LaBaraj timber"
        material = timber
    obj.data.materials.append(material)
    if bevel:
        modifier = obj.modifiers.new("One-segment edge bevel", "BEVEL")
        modifier.width = bevel
        modifier.segments = 1
        bpy.context.view_layer.objects.active = obj
        bpy.ops.object.modifier_apply(modifier=modifier.name)
    obj.data.update()
    uv_map(obj, strip, grain_axis, highlight=strip == 0)
    return obj


def box(name, position, size, material, strip=0, grain_axis=2, bevel=.003):
    bpy.ops.mesh.primitive_cube_add(size=1, location=position)
    obj = bpy.context.object
    obj.dimensions = size
    bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
    return finish(obj, name, material, strip, grain_axis, bevel)


def beam(name, start, end, thickness, material, strip=0, bevel=.002):
    delta = Vector(end) - Vector(start)
    obj = box(name, (Vector(start) + Vector(end)) / 2,
              (thickness, thickness, delta.length), material, strip, 2, bevel)
    obj.rotation_euler = delta.to_track_quat("Z", "Y").to_euler()
    return obj


def mesh_object(name, vertices, faces, material, strip=0, grain_axis=2):
    mesh = bpy.data.meshes.new(name)
    mesh.from_pydata(vertices, [], faces)
    mesh.update()
    obj = bpy.data.objects.new(name, mesh)
    bpy.context.collection.objects.link(obj)
    return finish(obj, name, material, strip, grain_axis)


def extrude_z(name, profile, bottom, top, material, strip=0):
    """Closed concave profile, optionally with uneven lower ends."""
    import bmesh
    count=len(profile)
    lows=[bottom]*count if isinstance(bottom,(int,float)) else bottom
    vertices=[(x,y,z) for (x,y),z in zip(profile,lows)]+[(x,y,top) for x,y in profile]
    faces=[tuple(reversed(range(count))),tuple(range(count,count*2))]
    for i in range(count):
        j=(i+1)%count;faces.append((i,j,j+count,i+count))
    obj=mesh_object(name,vertices,faces,material,strip)
    bm=bmesh.new();bm.from_mesh(obj.data)
    bmesh.ops.recalc_face_normals(bm,faces=list(bm.faces));bm.to_mesh(obj.data);bm.free()
    return obj


def square_band(name, center, outer, inner, height, material):
    vertices = []
    for z in [-height / 2, height / 2]:
        for size in [outer, inner]:
            vertices.extend([(-size/2,-size/2,z),(size/2,-size/2,z),
                             (size/2,size/2,z),(-size/2,size/2,z)])
    faces = []
    for i in range(4):
        j = (i+1)%4
        faces.extend([(i,j,j+4,i+4),(i+8,i+12,j+12,j+8),
                      (i,i+8,j+8,j),(i+4,j+4,j+12,i+12)])
    obj = mesh_object(name,vertices,faces,material)
    obj.location = center
    return obj


def rectangular_band(name, center, outer, inner, thickness, material, strip=0, inner_thickness=None):
    """Closed rectangular loop; inner thickness allows a lightly beveled inner rim."""
    vertices=[]
    for sign in [-1,1]:
        for (width,height),depth in [(outer,thickness),(inner,inner_thickness or thickness)]:
            vertices.extend([(-width/2,-height/2,sign*depth/2),(width/2,-height/2,sign*depth/2),
                             (width/2,height/2,sign*depth/2),(-width/2,height/2,sign*depth/2)])
    faces=[]
    for i in range(4):
        j=(i+1)%4
        faces.extend([(i,j,j+4,i+4),(i+8,i+12,j+12,j+8),
                      (i,i+8,j+8,j),(i+4,j+4,j+12,i+12)])
    obj=mesh_object(name,vertices,faces,material,strip,grain_axis=-1);obj.location=center
    import bmesh
    bm=bmesh.new();bm.from_mesh(obj.data)
    bmesh.ops.recalc_face_normals(bm,faces=list(bm.faces));bm.to_mesh(obj.data);bm.free()
    return obj


def corbel(name, center, direction, material):
    profile = [(0,0),(.085,0),(.085,-.025),(.060,-.035),
               (.043,-.067),(.030,-.105),(0,-.105)]
    vertices = [(x,y,z) for y in [-.010,.010] for x,z in profile]
    count = len(profile)
    faces = [tuple(reversed(range(count))),tuple(range(count,count*2))]
    for i in range(count):
        j=(i+1)%count
        faces.append((i,j,j+count,i+count))
    obj=mesh_object(name,vertices,faces,material)
    obj.location=center
    obj.rotation_euler[2]=direction
    return obj


def pyramid(name, center, width, depth, height, material, direction="Z"):
    vertices = [(-width / 2, -depth / 2, 0), (width / 2, -depth / 2, 0),
                (width / 2, depth / 2, 0), (-width / 2, depth / 2, 0), (0, 0, height)]
    obj = mesh_object(name, vertices, [(3, 2, 1, 0), (0, 1, 4), (1, 2, 4),
                                         (2, 3, 4), (3, 0, 4)], material)
    obj.location = center
    obj.rotation_euler = Vector(direction).to_track_quat("Z", "Y").to_euler() if not isinstance(direction, str) else (0, 0, 0)
    return obj


def chain_link(name, center, tangent, alternate, material):
    width, length, band, thickness = .056, .110, .013, .013
    vertices = []
    for y in [-thickness / 2, thickness / 2]:
        for w, h in [(width, length), (width - band * 2, length - band * 2)]:
            cut=w*.24
            vertices.extend([(-w/2,y,-h/2+cut),(0,y,-h/2),(w/2,y,-h/2+cut),
                             (w/2,y,h/2-cut),(0,y,h/2),(-w/2,y,h/2-cut)])
    faces = []
    for i in range(6):
        j = (i + 1) % 6
        faces.extend([(i,j,j+6,i+6),(i+12,i+18,j+18,j+12),
                      (i,i+12,j+12,j),(i+6,j+6,j+18,i+18)])
    obj = mesh_object(name, vertices, faces, material)
    obj.location = center
    rotation = Vector(tangent).to_track_quat("Z", "Y")
    from mathutils import Quaternion
    rotation = rotation @ Quaternion((0, 0, 1), math.pi / 2 if alternate else 0)
    obj.rotation_mode = "QUATERNION"
    obj.rotation_quaternion = rotation
    return obj


def bolt(name, center, normal, material, radius=.016, segments=8):
    if segments>=8:
        vertices=[(radius*math.cos(i*math.tau/segments),radius*math.sin(i*math.tau/segments),-.004) for i in range(segments)]
        vertices.extend((radius*.70*math.cos(i*math.tau/segments),radius*.70*math.sin(i*math.tau/segments),.003) for i in range(segments))
        vertices.append((0,0,.006))
        faces=[tuple(reversed(range(segments)))]
        for i in range(segments):
            j=(i+1)%segments
            faces.extend([(i,j,j+segments,i+segments),(i+segments,j+segments,segments*2)])
        obj=mesh_object(name,vertices,faces,material,1)
        obj.location=center
    else:
        bpy.ops.mesh.primitive_cylinder_add(vertices=segments, radius=radius, depth=.008, location=center)
        obj = bpy.context.object
        finish(obj,name,material,strip=1)
    obj.rotation_euler = Vector(normal).to_track_quat("Z", "Y").to_euler()
    uv_map(obj,1,compact=True)
    return obj


def save_export(output, name, sockets):
    """Join only authored geometry; preserve source parts in the saved .blend."""
    output.mkdir(parents=True, exist_ok=True)
    source_objects = [o for o in bpy.context.scene.objects if o.type == "MESH"]
    for obj in source_objects:
        obj.select_set(False)
    for socket_name, position in sockets.items():
        socket = bpy.data.objects.new(socket_name, None)
        bpy.context.collection.objects.link(socket)
        socket.location = position
    bpy.ops.wm.save_as_mainfile(filepath=str((output / f"{name}.blend").resolve()))
    import json
    (output / f"{name}-sockets.json").write_text(json.dumps({
        "space":"glTF scene coordinates in metres, +Y up; untested interaction proposals",
        "sockets":{key:[value[0],value[2],-value[1]] for key,value in sockets.items()}
    },indent=2)+"\n")
    # Mesh copies allow export consolidation without destroying editable part names.
    copies = []
    for original in source_objects:
        clone = original.copy()
        clone.data = original.data.copy()
        bpy.context.collection.objects.link(clone)
        clone.select_set(True)
        copies.append(clone)
    bpy.context.view_layer.objects.active = copies[0]
    bpy.ops.object.join()
    joined = bpy.context.object
    joined.name = name
    bpy.ops.object.transform_apply(location=False, rotation=True, scale=True)
    bpy.ops.export_scene.gltf(filepath=str((output / f"{name}-raw.glb").resolve()),
                              export_format="GLB", use_selection=True, export_yup=True,
                              export_animations=False, export_cameras=False, export_lights=False)


def planked_panel(name, center, width, height, material, direction=0, count=6,
                  groove_depth=.008, seam_width=.002, edge_strip=2):
    """Continuous recessed timber joints, with an opaque backer: no sky-lit slits.

    Author front along -Y, then turn about Z. Thin strips provide real joint depth
    without full hidden plank boxes. Source parts remain editable; export joins them.
    """
    for i in range(count):
        left=-width/2+i*width/count
        right=left+width/count
        profile=[(left,groove_depth),(left+seam_width/2,0),
                 (right-seam_width/2,0),(right,groove_depth)]
        vertices=[(x,y,z) for z in [0,height] for x,y in profile]
        obj=mesh_object(f'{name} plank {i}',vertices,
                        [(j,j+1,j+5,j+4) for j in range(3)],material,edge_strip if i in [0,count-1] else 2)
        obj.rotation_euler[2]=direction
        obj.location=center
    obj=mesh_object(name+' opaque backing',
                    [(-width/2,groove_depth+.002,0),(width/2,groove_depth+.002,0),
                     (width/2,groove_depth+.002,height),(-width/2,groove_depth+.002,height)],
                    [(0,1,2,3)],material,2)
    obj.rotation_euler[2]=direction
    obj.location=center


def open_front_shell(name, width, height, depth, thickness, material):
    """One continuous hollow enclosure, with shared joins and an open front.

    A small conforming grid keeps back-panel UVs at the physical grain density.
    Coplanar joins stay flat; bevel only real corners of the complete enclosure.
    """
    import bmesh
    t=thickness
    if min(width,height,depth)<=2*t:
        raise ValueError('Shell thickness exceeds its dimensions')
    count=max(1,math.ceil((width-2*t)/.18))
    xs=[-width/2]+[-width/2+t+i*(width-2*t)/count for i in range(count+1)]+[width/2]
    grid=[xs,[-depth/2,depth/2-t,depth/2],[0,t,height-t,height]]
    nx=len(xs)-1
    filled={(x,y,z) for x in range(nx) for y in range(2) for z in range(3)
            if x in [0,nx-1] or y==1 or z in [0,2]}
    vertices,faces,lookup=[],[],{}
    def vertex(key):
        if key not in lookup:
            lookup[key]=len(vertices)
            vertices.append(tuple(grid[a][key[a]] for a in range(3)))
        return lookup[key]
    for cell in sorted(filled):
        for axis in range(3):
            others=[a for a in range(3) if a!=axis]
            for side in [-1,1]:
                neighbor=list(cell);neighbor[axis]+=side
                if tuple(neighbor) in filled:continue
                face=[]
                for u,v in [(0,0),(1,0),(1,1),(0,1)]:
                    key=list(cell);key[axis]+=side==1
                    key[others[0]]+=u;key[others[1]]+=v
                    face.append(vertex(tuple(key)))
                faces.append(face)
    grain={0:2,1:2,2:0}
    obj=mesh_object(name,vertices,faces,material,2,grain)
    bm=bmesh.new();bm.from_mesh(obj.data)
    bmesh.ops.recalc_face_normals(bm,faces=list(bm.faces))
    if not all(edge.is_manifold for edge in bm.edges):
        raise ValueError('Housing is not a closed manifold')
    bm.to_mesh(obj.data);bm.free()
    modifier=obj.modifiers.new('Bevel complete housing corners','BEVEL')
    modifier.width=.002;modifier.segments=1;modifier.limit_method='ANGLE'
    bpy.context.view_layer.objects.active=obj
    bpy.ops.object.modifier_apply(modifier=modifier.name)
    uv_map(obj,2,grain)
    return obj


def corner_wrap(name, corner, span, thickness, signs, material, bevel=.0007):
    """One closed trihedral fitting, rather than three separately beveled plates.

    Surface the union on a tiny orthogonal grid. Internal faces are omitted and
    boundary vertices are shared before beveling, so corners remain continuous.
    All dimensions are metres; signs point from the enclosure toward the corner.
    """
    import bmesh
    if any(t <= 0 or t >= s for t, s in zip(thickness, span)):
        raise ValueError('Corner wrap needs 0 < thickness < span on every axis')
    grid = [[0, t, s] for t, s in zip(thickness, span)]
    filled = {(x, y, z) for x in range(2) for y in range(2) for z in range(2)
              if x == 0 or y == 0 or z == 0}
    vertices, faces, lookup = [], [], {}
    def vertex(key):
        if key not in lookup:
            lookup[key] = len(vertices)
            vertices.append(tuple(corner[a] - signs[a] * grid[a][key[a]] for a in range(3)))
        return lookup[key]
    for cell in sorted(filled):
        for axis in range(3):
            others = [a for a in range(3) if a != axis]
            for side in [-1, 1]:
                neighbor = list(cell); neighbor[axis] += side
                if tuple(neighbor) in filled:
                    continue
                face = []
                for u, v in [(0, 0), (1, 0), (1, 1), (0, 1)]:
                    key = list(cell)
                    key[axis] += side == 1
                    key[others[0]] += u; key[others[1]] += v
                    face.append(vertex(tuple(key)))
                faces.append(face)
    obj = mesh_object(name, vertices, faces, material, 1)
    bm = bmesh.new(); bm.from_mesh(obj.data)
    bmesh.ops.recalc_face_normals(bm, faces=list(bm.faces))
    bmesh.ops.dissolve_limit(bm, angle_limit=.001, verts=list(bm.verts), edges=list(bm.edges))
    bmesh.ops.recalc_face_normals(bm, faces=list(bm.faces))
    if not all(edge.is_manifold for edge in bm.edges):
        raise ValueError('Corner wrap is not a closed manifold')
    bm.to_mesh(obj.data); bm.free()
    if bevel:
        modifier = obj.modifiers.new('Continuous outside edge bevel', 'BEVEL')
        modifier.width = bevel; modifier.segments = 1
        bpy.context.view_layer.objects.active = obj
        bpy.ops.object.modifier_apply(modifier=modifier.name)
    uv_map(obj, 1, compact=True)
    return obj
