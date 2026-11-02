"""Build a clean cloth cage against the approved head's anatomical envelope."""
import bpy,bmesh,math
from mathutils import Vector
from wardrobe_surfaces import Surface

def scalp_crown(head,cloth,hem=1.725,clearance=.010,ease=.005,count=96,levels=18):
    from mathutils.bvhtree import BVHTree
    head.data.calc_loop_triangles()
    tree=BVHTree.FromPolygons([v.co.copy()for v in head.data.vertices],[list(t.vertices)for t in head.data.loop_triangles],all_triangles=True)
    origin=Vector((0,.014,1.70))
    def sample(theta,phi):
        direction=Vector((math.sin(phi)*math.sin(theta),-math.sin(phi)*math.cos(theta),math.cos(phi)))
        hit,normal,_,_=tree.ray_cast(origin,direction,1)
        if hit is None:raise RuntimeError('Scalp fitting ray missed')
        return hit,direction
    surface=Surface();rings=[]
    for k in range(1,levels+1):
        ring=[]
        for j in range(count):
            theta=j*math.tau/count
            lo,hi=0,math.pi*.7
            for _ in range(24):
                phi=(lo+hi)*.5;hit,_=sample(theta,phi)
                if hit.z+.10*hit.y>hem:lo=phi
                else:hi=phi
            hit,direction=sample(theta,hi*k/levels)
            co=hit+direction*clearance
            co.z+=ease*(1-k/levels)
            ring.append(surface.point(co))
        rings.append(ring)
    apex,_=sample(0,0);apex.z+=clearance+ease;top=surface.point(apex)
    for j in range(count):
        n=(j+1)%count
        surface.face((top,rings[0][j],rings[0][n]),[(.5,1),(j/count,.98),((j+1)/count,.98)])
    for k in range(levels-1):
        for j in range(count):
            n=(j+1)%count
            surface.face((rings[k][j],rings[k+1][j],rings[k+1][n],rings[k][n]),[(j/count,1-k/levels),(j/count,1-(k+1)/levels),((j+1)/count,1-(k+1)/levels),((j+1)/count,1-k/levels)])
    crown=surface.object('Anatomical cloth cage',cloth)
    bpy.context.view_layer.objects.active=crown
    smooth=crown.modifiers.new('Relax cloth cage','SMOOTH');smooth.factor=.45;smooth.iterations=3
    bpy.ops.object.modifier_apply(modifier=smooth.name)
    bm=bmesh.new();bm.from_mesh(crown.data);bmesh.ops.recalc_face_normals(bm,faces=list(bm.faces));bm.to_mesh(crown.data);bm.free()
    return crown,rings,top,origin
