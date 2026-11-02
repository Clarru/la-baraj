"""Body-measured female tailoring; details follow the finished outer surface."""
import math
import os
import bpy
from mathutils import Vector
from mathutils.bvhtree import BVHTree
from wardrobe_surfaces import Surface,knit_surface,finish_garment,reduce_garment,bind_surface

def tailored_blazer(body,cloth,rig):
    # Depths include cloth ease over the measured publisher body, around y=.020.
    profiles=[(.79,.215,.145,.150),(.807,.218,.146,.152),(.87,.216,.146,.153),
        (1.03,.207,.150,.140),(1.24,.194,.153,.079),(1.37,.218,.155,.113),
        (1.43,.231,.116,.115),(1.48,.235,.095,.108),(1.52,.225,.069,.096),
        (1.555,.086,.075,.078),(1.575,.079,.069,.073)]
    blazer=knit_surface(cloth,profiles,[.48,.48,.46,.28,.28,.38,.45,.45,.50,.85,.85],
        name='Wardrobe_Female_Blazer',center_y=.020,shoulder_back=.035)
    if os.environ.get('LA_BARAJ_CLOTH_STUDY')=='1':
        from wardrobe_cloth_drape import cotton_drape
        neckline=[blazer.data.vertices[10*48+j].co.copy()for j in range(48)]
        proxy=[(.74,.215,.145,.150,.020),*[(*p,.020)for p in profiles]]
        cotton_drape(blazer,neckline,torso_profiles=proxy,bending=1,max_displacement=.12)
    else:
        bpy.context.view_layer.objects.active=blazer
        modifier=blazer.modifiers.new('Tailored authoring surface','SUBSURF');modifier.levels=1;bpy.ops.object.modifier_apply(modifier=modifier.name)
    from wardrobe_cloth_bake import prepare_cloth_surface
    prepare_cloth_surface(blazer);bind_surface(blazer,body,rig)
    pelvis=blazer.vertex_groups.get('pelvis')or blazer.vertex_groups.new(name='pelvis')
    for vertex in blazer.data.vertices:
        if vertex.co.z<1.12:
            for group in blazer.vertex_groups:group.remove([vertex.index])
            pelvis.add([vertex.index],1,'REPLACE')
    blazer.data.calc_loop_triangles()
    tree=BVHTree.FromPolygons([v.co.copy()for v in blazer.data.vertices],
        [list(t.vertices)for t in blazer.data.loop_triangles],all_triangles=True)
    def front(x,z):
        point,_,_,_=tree.ray_cast(Vector((x,-1,z)),Vector((0,1,0)),2)
        if point is not None and point.y<.035:return point.y
        low,high=profiles[0],profiles[-1]
        for a,b in zip(profiles,profiles[1:]):
            if a[0]<=z<=b[0]:low,high=a,b;break
        t=max(0,min(1,(z-low[0])/(high[0]-low[0])))
        width=low[1]*(1-t)+high[1]*t;depth=low[2]*(1-t)+high[2]*t
        return .020-depth*math.sqrt(max(0,1-(x/width)**2))
    details=[]
    for side in [-1,1]:
        # Collar and lapel stay separate at the notch, with a small sewn roll.
        for label,pattern in [
            ('collar',[(1.565,.066,.088),(1.535,.067,.113),(1.505,.075,.133),(1.470,.090,.124)]),
            ('notched lapel',[(1.459,.089,.132),(1.432,.089,.161),(1.39,.083,.145),
                (1.32,.070,.122),(1.24,.055,.091),(1.165,.050,.053)]),
            ('welt pocket',[(.987,.104,.184),(.972,.104,.184)]),
        ]:
            s=Surface();rows=[]
            # Longitudinal subdivisions keep lapels on the skinned jacket.
            samples=[]
            for a,b in zip(pattern,pattern[1:]):
                for step in range(4):samples.append(tuple(x+(y-x)*step/4 for x,y in zip(a,b)))
            samples.append(pattern[-1])
            for z,inner,outer in samples:
                row=[]
                for j in range(9):
                    t=j/8;x=side*(inner+(outer-inner)*t)
                    roll=.003*math.sin(math.pi*t) if label!='welt pocket'else 0
                    row.append(s.point((x,front(x,z)-.005-roll,z)))
                rows.append(row)
            for k in range(len(rows)-1):
                for j in range(8):
                    ids=(rows[k][j],rows[k+1][j],rows[k+1][j+1],rows[k][j+1])
                    if side<0:ids=tuple(reversed(ids))
                    s.face(ids,[(s.vertices[i][0]/.24,s.vertices[i][2]/.24)for i in ids])
            obj=s.object('Blazer sewn '+label,cloth)
            bpy.context.view_layer.objects.active=obj
            shell=obj.modifiers.new('Turned tailored edge','SOLIDIFY');shell.thickness=.0015;shell.offset=-1
            bpy.ops.object.modifier_apply(modifier=shell.name)
            bind_surface(obj,blazer,rig);details.append(obj)
    return blazer,details,front

def fit_underlayer(obj,body):
    """Follow actual torso sections, keeping the lower edge tucked below the belt."""
    body.data.calc_loop_triangles()
    tree=BVHTree.FromPolygons([v.co.copy()for v in body.data.vertices],
        [list(t.vertices)for t in body.data.loop_triangles],all_triangles=True)
    for vertex in obj.data.vertices:
        p=vertex.co;origin=Vector((0,.050 if p.z>1.50 else .015,p.z))
        direction=p-origin;direction.z=0
        if direction.length<.0001:continue
        direction.normalize();hit,_,_,_=tree.ray_cast(origin,direction,.4)
        if hit is not None:vertex.co=hit+direction*(.004 if vertex.normal.dot(direction)>0 else .002)
    obj.data.update()
