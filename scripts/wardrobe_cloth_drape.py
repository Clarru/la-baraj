"""Offline cotton drape on the canonical metre-scale rest pose; no runtime cloth."""
import bpy,bmesh,math,json
from mathutils import Vector
from wardrobe_surfaces import Surface

def cotton_drape(garment,neckline,torso_profiles=None,bending=.5,max_displacement=.08,pin_front=False):
    def smooth(t):t=max(0,min(1,t));return t*t*(3-2*t)
    # Sew coincident edges before simulation; UV seams remain per face corner.
    bm=bmesh.new();bm.from_mesh(garment.data)
    bmesh.ops.remove_doubles(bm,verts=list(bm.verts),dist=.00001)
    loose=[v for v in bm.verts if not v.link_faces]
    print('Removing unused cage vertices before cloth',len(loose))
    bmesh.ops.delete(bm,geom=loose,context='VERTS')
    # Resolve long torso/sleeve strips before the cloth solve. Uniform support
    # prevents a small number of large triangles from forming angular folds.
    for threshold,cuts in[(.045,3),(.025,1)]:
        edges=[]
        for edge in bm.edges:
            a,b=(v.co for v in edge.verts);delta=b-a;centre=(a+b)*.5
            longitudinal=(abs(centre.x)<.24 and abs(delta.z)>.6*delta.length)or(abs(centre.x)>=.24 and abs(delta.x)>.7*delta.length)
            if longitudinal and delta.length>threshold:edges.append(edge)
        if edges:bmesh.ops.subdivide_edges(bm,edges=edges,cuts=cuts,use_grid_fill=True,smooth=0)
    bm.to_mesh(garment.data);bm.free()
    pin_name='Offline cloth pins';pin=garment.vertex_groups.new(name=pin_name)
    for vertex in garment.data.vertices:
        p=vertex.co
        shoulder=smooth((p.z-1.42)/.07)*(1-smooth((abs(p.x)-.24)/.08))
        cuff=smooth((abs(p.x)-.65)/.04)
        neck=1 if min((p-q).length for q in neckline)<.012 else 0
        front=1 if pin_front and p.y<0 and abs(p.x)<.10 and p.z>1.38 else 0
        weight=max(shoulder,cuff,neck,front)
        if weight:pin.add([vertex.index],weight,'REPLACE')
    bpy.ops.object.select_all(action='DESELECT');garment.select_set(True);bpy.context.view_layer.objects.active=garment
    subdivision=garment.modifiers.new('Cotton simulation support','SUBSURF');subdivision.levels=1
    bpy.ops.object.modifier_apply(modifier=subdivision.name)
    pin=garment.vertex_groups[pin_name]
    # Assign exact anchors on the final simulation topology, not interpolated
    # near-one values on the lower-resolution cage.
    pin.remove([v.index for v in garment.data.vertices])
    for vertex in garment.data.vertices:
        p=vertex.co
        shoulder=.7*smooth((p.z-1.42)/.10)*(1-smooth((abs(p.x)-.24)/.08))
        cuff=smooth((abs(p.x)-.65)/.04)
        neck=1 if min((p-q).length for q in neckline)<.012 else 0
        front=1 if pin_front and p.y<0 and abs(p.x)<.10 and p.z>1.38 else 0
        weight=max(shoulder,cuff,neck,front)
        if weight:pin.add([vertex.index],weight,'REPLACE')
    before=[v.co.copy()for v in garment.data.vertices]
    # Use a closed body proxy. The approved shirt includes open, doubled cloth
    # surfaces and its hem, which are unsuitable as a skin collision volume.
    from wardrobe_fitted_cloth import fitted_profiles
    s=Surface();rings=[];count=48
    profiles=torso_profiles or[(.94,.190,.135,.102,.020),*[(*p,.020)for p in fitted_profiles()[:7]],
        (1.48,.220,.080,.117,.020),(1.52,.175,.055,.115,.020),
        (1.55,.095,.070,.065,.045),(1.60,.088,.055,.055,.055)]
    for z,width,front,back,cy in profiles:
        row=[]
        for j in range(count):
            angle=j*math.tau/count;c=math.cos(angle);sine=math.sin(angle)
            shoulder=min(1,max(0,(z-1.30)/.07))*max(0,min(1,(1.55-z)/.03))
            row.append(s.point((sine*(width-.006),cy-c*((front if c>=0 else back)-.006)+.045*shoulder*sine**4,z)))
        rings.append(row)
    for k in range(len(rings)-1):
        for j in range(count):
            n=(j+1)%count;s.face((rings[k][j],rings[k][n],rings[k+1][n],rings[k+1][j]),[(0,0),(1,0),(1,1),(0,1)])
    s.face(tuple(reversed(rings[0])),[(0,0)]*count);s.face(tuple(rings[-1]),[(0,0)]*count)
    torso=s.object('Offline closed torso proxy',garment.data.materials[0])
    bm=bmesh.new();bm.from_mesh(torso.data);bmesh.ops.recalc_face_normals(bm,faces=list(bm.faces));bm.to_mesh(torso.data);bm.free()
    colliders=[torso]
    for side in [-1,1]:
        s=Surface();rings=[];count=24
        for x,radius in[(.22,.061),(.30,.068),(.40,.058),(.45,.053),(.50,.049),(.60,.043),(.70,.036)]:
            rings.append([s.point((side*x,.0654+math.cos(j*math.tau/count)*radius,1.4555+math.sin(j*math.tau/count)*radius))for j in range(count)])
        for k in range(len(rings)-1):
            for j in range(count):
                n=(j+1)%count;s.face((rings[k][j],rings[k][n],rings[k+1][n],rings[k+1][j]),[(0,0),(1,0),(1,1),(0,1)])
        s.face(tuple(reversed(rings[0])),[(0,0)]*count);s.face(tuple(rings[-1]),[(0,0)]*count)
        proxy=s.object('Offline arm collision proxy',garment.data.materials[0])
        bm=bmesh.new();bm.from_mesh(proxy.data);bmesh.ops.recalc_face_normals(bm,faces=list(bm.faces));bm.to_mesh(proxy.data);bm.free()
        colliders.append(proxy)
    for obj in colliders:
        obj.modifiers.new('Offline garment collider','COLLISION');obj.collision.thickness_outer=.002;obj.collision.thickness_inner=.001;obj.collision.cloth_friction=5
    bpy.context.view_layer.objects.active=garment
    cloth=garment.modifiers.new('Offline cotton drape','CLOTH')
    cloth.settings.quality=8;cloth.settings.mass=.25*3944/len(before);cloth.settings.air_damping=3
    cloth.settings.tension_stiffness=40;cloth.settings.compression_stiffness=40;cloth.settings.shear_stiffness=25;cloth.settings.bending_stiffness=bending
    cloth.settings.vertex_group_mass=pin_name;cloth.settings.pin_stiffness=1
    pin=garment.vertex_groups[pin_name]
    anchors=sum(any(g.group==pin.index and g.weight==1 for g in v.groups)for v in garment.data.vertices)
    print('CLOTH_ANCHORS',cloth.settings.vertex_group_mass,anchors)
    assert cloth.settings.vertex_group_mass==pin_name and anchors>50
    cloth.collision_settings.distance_min=.002;cloth.collision_settings.collision_quality=4;cloth.collision_settings.use_self_collision=False
    cloth.point_cache.frame_start=1;cloth.point_cache.frame_end=32
    scene=bpy.context.scene;scene.frame_set(1)
    for frame in range(1,33):
        scene.frame_set(frame);depsgraph=bpy.context.evaluated_depsgraph_get();evaluated=garment.evaluated_get(depsgraph);evaluated.to_mesh();evaluated.to_mesh_clear()
    bpy.context.view_layer.objects.active=garment;bpy.ops.object.modifier_apply(modifier=cloth.name)
    # The interfaced upper yoke keeps its tailored structure. Retain full drape
    # at the hem and elbows without turning the collarbone area into crumples.
    for vertex,rest in zip(garment.data.vertices,before):
        structured=.8*smooth((rest.z-1.34)/.10)*(1-smooth((abs(rest.x)-.24)/.10))
        vertex.co=rest.lerp(vertex.co,1-structured)
    maximum=max((v.co-p).length for v,p in zip(garment.data.vertices,before))
    if maximum>max_displacement:
        worst=sorted([(v.co-p).length,v.index,list(p),list(v.co),[(g.group,g.weight)for g in v.groups]]for v,p in zip(garment.data.vertices,before))[-5:]
        print('CLOTH_DISPLACEMENT_DIAGNOSTIC',json.dumps(worst))
        raise RuntimeError('Unstable cloth study: displacement '+str(maximum))
    garment.vertex_groups.remove(garment.vertex_groups[pin_name]);scene.frame_set(1)
    for obj in colliders:bpy.data.objects.remove(obj,do_unlink=True)
    # Only a thin rest mesh is returned. The caller adds thickness and transfers
    # the existing canonical animation skin after the offline simulation.
    print('OFFLINE_CLOTH',json.dumps({'frames':32,'maxDisplacement':maximum,'vertices':len(garment.data.vertices)}))
