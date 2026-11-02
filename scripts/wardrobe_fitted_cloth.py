"""Torso landmarks measured from the approved workshirt, in canonical metres."""
# Profiles are (height, half-width, front depth, back depth), around y=.020.
# The chest's front/back envelope is .105/-.140m, matching the approved shirt.
# Shoulder sides sit behind the sternum, aligned to the source upper-arm joints.
def fitted_profiles():
    return [
        (.990,.190,.135,.102),(1.005,.194,.135,.102),
        (1.035,.195,.134,.100),(1.10,.185,.131,.095),
        (1.24,.205,.141,.094),(1.37,.219,.127,.118),
        (1.43,.227,.111,.123),(1.48,.233,.070,.123),
        (1.52,.228,.055,.117),(1.555,.105,.100,.105),
        (1.582,.096,.100,.100),
    ]

def fit_upper_neck_skin(garment,skin):
    """Keep the upper shirt outside the complete neck at each height."""
    from mathutils import Vector
    from mathutils.bvhtree import BVHTree
    skin.data.calc_loop_triangles()
    tree=BVHTree.FromPolygons([v.co.copy()for v in skin.data.vertices],
        [list(t.vertices)for t in skin.data.loop_triangles],all_triangles=True)
    for vertex in garment.data.vertices:
        p=vertex.co
        if p.z<1.48 or abs(p.x)>.14:continue
        origin=Vector((0,.055,p.z));radial=p-origin;radial.z=0
        if radial.length<.001:continue
        radial.normalize();hit,_,_,_=tree.ray_cast(origin,radial,.4)
        if hit is not None and abs(hit.x)<.14 and(p-origin).length<(hit-origin).length+.005:
            vertex.co=hit+radial*.005
    garment.data.update()

def blend_neck_skin_weights(garment,skin,rig):
    """Use the same neck skin field at the collar, blending into the shirt field."""
    from wardrobe_rig import duplicate
    from wardrobe_surfaces import bind_surface
    import bpy
    sample=duplicate(garment,'Temporary anatomical neck weight sample');sample.vertex_groups.clear()
    for modifier in list(sample.modifiers):
        if modifier.type=='ARMATURE':sample.modifiers.remove(modifier)
    bind_surface(sample,skin,rig)
    names={g.index:g.name for g in sample.vertex_groups}
    def smooth(t):t=max(0,min(1,t));return t*t*(3-2*t)
    for vertex,source in zip(garment.data.vertices,sample.data.vertices):
        alpha=smooth((vertex.co.z-1.43)/.06)*(1-smooth((abs(vertex.co.x)-.16)/.08))
        if not alpha:continue
        weights={garment.vertex_groups[g.group].name:g.weight*(1-alpha)for g in vertex.groups}
        for g in source.groups:weights[names[g.group]]=weights.get(names[g.group],0)+alpha*g.weight
        values=sorted(weights.items(),key=lambda pair:pair[1],reverse=True)[:4];total=sum(w for _,w in values)
        for group in garment.vertex_groups:group.remove([vertex.index])
        for name,weight in values:
            if weight:garment.vertex_groups[name].add([vertex.index],weight/total,'REPLACE')
    data=sample.data;bpy.data.objects.remove(sample,do_unlink=True);bpy.data.meshes.remove(data)

def fit_crew_opening(garment,head):
    """Fit the crew opening to the actual neck; keep the front below the throat."""
    import math
    from mathutils import Vector
    from mathutils.bvhtree import BVHTree
    head.data.calc_loop_triangles()
    tree=BVHTree.FromPolygons([v.co.copy()for v in head.data.vertices],[list(t.vertices)for t in head.data.loop_triangles],all_triangles=True)
    count=48;vertices=garment.data.vertices
    for j in range(count):
        a=j*math.tau/count;z=1.578-.030*max(0,math.cos(a))**2
        direction=Vector((math.sin(a),-math.cos(a),0))
        point,_,_,_=tree.ray_cast(Vector((0,.055,z)),direction,.3)
        if point is None:raise RuntimeError('Neck fitting ray missed')
        target=point+direction*.004;target.z=z
        shoulder=vertices[8*count+j].co.copy()
        intermediate=shoulder.lerp(target,.60)
        origin=Vector((0,.055,intermediate.z));radial=intermediate-origin;radial.z=0;radial.normalize()
        skin,_,_,_=tree.ray_cast(origin,radial,.3)
        if skin is not None and(intermediate-origin).length<(skin-origin).length+.004:
            intermediate=skin+radial*.004
        vertices[9*count+j].co=intermediate
        vertices[10*count+j].co=target
    garment.data.update()

def knit_edge_bands(garment,material):
    """Small turned ribs follow the garment openings rather than guessed rings."""
    import bpy,bmesh,math
    from mathutils import Vector
    from wardrobe_surfaces import Surface
    bm=bmesh.new();bm.from_mesh(garment.data)
    links={v:{e.other_vert(v)for e in v.link_edges if e.is_boundary}for v in bm.verts if v.is_boundary};seen=set();rings=[]
    for start in links:
        if start in seen:continue
        ring=[];previous=None;current=start
        while True:
            ring.append(current.co.copy());seen.add(current)
            nxt=next((v for v in links[current]if v!=previous and v not in seen),None)
            if nxt is None:break
            previous,current=current,nxt
        if len(ring)>8:rings.append(ring)
    result=[]
    for ring in rings:
        center=sum(ring,Vector())/len(ring);kind='cuff'if abs(center.x)>.6 else 'hem'if center.z<1.1 else'neck'
        path=ring+[ring[0]];distance=[0]
        for a,b in zip(path,path[1:]):distance.append(distance[-1]+(b-a).length)
        points=[]
        for j in range(96):
            d=distance[-1]*j/96;k=next(i for i in range(len(ring))if distance[i+1]>=d);points.append(path[k].lerp(path[k+1],(d-distance[k])/(distance[k+1]-distance[k])))
        s=Surface();rows=[]
        for t,relief in [(0,.0005),(.1,.0015),(.9,.0015),(1,.0005)]:
            row=[]
            for j,p in enumerate(points):
                if kind=='cuff':
                    normal=Vector((0,p.y-.0654,p.z-1.4555)).normalized();q=p+Vector((-math.copysign(.040,center.x),0,0))+normal*.003
                elif kind=='hem':normal=Vector((p.x,p.y-.02,0)).normalized();q=p+Vector((0,0,.035))+normal*.003
                else:normal=Vector((p.x,p.y-.055,0)).normalized();q=p+Vector((0,0,-.009))+normal*.001
                co=p.lerp(q,t)+normal*(relief+.00025*math.cos(j*math.tau/96*32)*math.sin(math.pi*t));row.append(s.point(co))
            rows.append(row)
        for k in range(3):
            for j in range(96):
                n=(j+1)%96;s.face((rows[k][j],rows[k+1][j],rows[k+1][n],rows[k][n]),[(j/96*6,k*.1),(j/96*6,(k+1)*.1),((j+1)/96*6,(k+1)*.1),((j+1)/96*6,k*.1)])
        o=s.object('Knit turned '+kind,material)
        # Boundary tracing has no prescribed winding. Orient each open band
        # outward explicitly, so AO and lighting do not shade its inner side.
        patch=bmesh.new();patch.from_mesh(o.data);patch.normal_update()
        for face in patch.faces:
            p=face.calc_center_median()
            normal=Vector((0,p.y-.0654,p.z-1.4555)) if kind=='cuff' else Vector((p.x,p.y-(.055 if kind=='neck' else .020),0))
            if face.normal.dot(normal)<0:face.normal_flip()
        patch.to_mesh(o.data);patch.free();result.append(o)
    bm.free();return result
