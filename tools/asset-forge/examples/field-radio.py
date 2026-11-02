"""Reference-led static radio: layered joinery, wrapped fittings, scale-aware grain and cloth."""
import math
import bpy
import bmesh


def bevel(obj,width=.0015):
    bpy.context.view_layer.objects.active=obj
    mod=obj.modifiers.new('Readable edge bevel','BEVEL');mod.width=width;mod.segments=1
    bpy.ops.object.modifier_apply(modifier=mod.name)


def build(context):
    p,m=context.parts,context.material
    depth=.196
    p.open_front_shell('Radio housing',.52,.30,depth,.02,m)
    for sx in [-1,1]:
        for top in [False,True]:
            name = f"Housing_{'R' if sx > 0 else 'L'}_{'T' if top else 'B'}"
            context.joints[name] = [
                {'name': f'sample_{i}', 'origin': [sx*.2625,y,.28 if top else .02],
                 'direction': [-sx,0,0], 'maxDistance': .00325}
                for i,y in enumerate([-.05,0,.05])]
    # A complete framed aperture, rather than unrelated thin rectangles.
    frame=p.rectangular_band('Front joinery frame',(0,0,0),(.51,.286),(.44,.216),.018,m,3,.014)
    bevel(frame,.002)
    p.uv_map(frame,3,grain_axis=-1)
    frame.rotation_euler[0]=math.pi/2;frame.location=(0,-.093,.15)
    # Solid, matte speaker fabric sits genuinely behind five separated timber slats.
    cloth=context.materials['cloth']
    backing=p.mesh_object('Speaker fabric',
        [(-.216,-.086,.046),(.072,-.086,.046),(.072,-.086,.252),(-.216,-.086,.252)],
        [(0,1,2,3)],cloth)
    uv=backing.data.uv_layers.active
    for loop in backing.data.loops:
        v=backing.data.vertices[loop.vertex_index].co
        uv.data[loop.index].uv=((v.x+.216)/.03,(v.z-.046)/.03)
    for i in range(5):p.box('Speaker slat',(-.072,-.100,.071+i*.039),(.288,.021,.018),m,2,0,bevel=.002)
    panel=p.box('Recessed control board',(.167,-.094,.15),(.113,.018,.216),m,2,2,bevel=.002)
    p.box('Speaker/control divider',(.092,-.094,.15),(.031,.020,.216),m,3,2,bevel=.002)
    for x in [.121,.213]:
        for z in [.052,.248]:
            p.bolt('Control panel fixing',(x,-.105,z),(0,-1,0),m,.0045,6)
    # Layered knobs: mounting collar, bevelled body, inset face and index notch.
    for index,(z,r) in enumerate([(.222,.034),(.15,.024),(.085,.024)]):
        for suffix,y,radius,length in [('collar',-.106,r*1.10,.006),('body',-.117,r,.016),('face',-.128,r*.81,.004)]:
            bpy.ops.mesh.primitive_cylinder_add(vertices=12,radius=radius,depth=length,
                location=(.167,y,z),rotation=(math.pi/2,0,0))
            p.finish(bpy.context.object,f'Knob {index} {suffix}',m,1,bevel=.0012)
        p.box('Knob index',(.167,-.131,z+r*.45),(.0025,.001,.011),m,0,2,bevel=0)
    # Each fitting wraps front/side/top rather than floating as a square sticker.
    for sx in [-1,1]:
        for sy in [-1,1]:
            for top in [False,True]:
                z=.2785 if top else .0215
                sz = 1 if top else -1
                name = f"Corner_{'R' if sx > 0 else 'L'}_{'B' if sy > 0 else 'F'}_{'T' if top else 'B'}"
                outer = (sx*.275, sy*.104, .306 if top else -.006)
                p.corner_wrap(name, outer, (.058,.049,.049), (.015,.006,.006), (sx,sy,sz), m)
                # Three ray contracts cross the actual outside seams of this wrap.
                probes = []
                for label, point, outward in [
                    ('front-side', (outer[0],outer[1],z), (sx,sy,0)),
                    ('front-end', (sx*.2385,outer[1],outer[2]), (0,sy,sz)),
                    ('side-end', (outer[0],sy*.0765,outer[2]), (sx,0,sz)),
                ]:
                    probes.append({'name': label,
                        'origin': [point[a]+outward[a]*.0025 for a in range(3)],
                        'direction': [-v for v in outward], 'maxDistance': .0055})
                context.joints[name] = probes
                p.bolt('Cap fixing',(sx*.2385,sy*.104,z),(0,sy,0),m,.0075)
    for x in [-.16,.16]:
        p.box('Handle foot',(x,0,.304),(.054,.044,.008),m,1,bevel=.001)
        p.bolt('Handle pin',(x,-.025,.323),(0,-1,0),m,.010)
    profile=[(-.18,.308),(-.158,.308),(-.158,.372),(.158,.372),
             (.158,.308),(.18,.308),(.18,.394),(-.18,.394)]
    vertices=[(x,y,z) for y in [-.013,.013] for x,z in profile];count=len(profile)
    faces=[tuple(reversed(range(count))),tuple(range(count,count*2))]
    faces += [(i,(i+1)%count,(i+1)%count+count,i+count) for i in range(count)]
    handle=p.mesh_object('Continuous iron carry handle',vertices,faces,m,0)
    bm=bmesh.new();bm.from_mesh(handle.data);bmesh.ops.recalc_face_normals(bm,faces=list(bm.faces));bm.to_mesh(handle.data);bm.free()
    bevel(handle,.0013);p.uv_map(handle,0)
    return {'CarryGrip':(0,0,.383)}
