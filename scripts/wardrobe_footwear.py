"""Anatomical footwear lasts derived from the actor's own foot envelope."""
import math
import bpy
from mathutils import Vector
from wardrobe_surfaces import Surface

def foot_point(point,side,rise=0):
    p=point.copy()
    if rise and p.z<.15:
        factor=max(0,min(1,(.15-p.z)/.10))
        p.x=side*.1143+(p.x-side*.1143)*(1-.20*factor)
        p.y=.012+(p.y-.012)*(1-.10*factor)
        p.z+=rise*max(0,min(1,p.y/.13))*factor
    return p

def hull(points):
    points=sorted(set(points))
    def cross(a,b,c):return(b[0]-a[0])*(c[1]-a[1])-(b[1]-a[1])*(c[0]-a[0])
    lower=[];upper=[]
    for p in points:
        while len(lower)>1 and cross(lower[-2],lower[-1],p)<=0:lower.pop()
        lower.append(p)
    for p in reversed(points):
        while len(upper)>1 and cross(upper[-2],upper[-1],p)<=0:upper.pop()
        upper.append(p)
    return lower[:-1]+upper[:-1]

def foot_last(body,side,rise=0,count=64):
    positions=[foot_point(v.co,side,rise)for v in body.data.vertices]
    outline=hull([(p.x,p.y)for p,v in zip(positions,body.data.vertices)if v.co.z<.08 and v.co.x*side>0])
    center=Vector((side*.1143,.012,0));result=[]
    # Polar intersections preserve toe/heel asymmetry instead of a pointed ellipse.
    for j in range(count):
        angle=j*math.tau/count;d=Vector((math.sin(angle),-math.cos(angle)))
        candidates=[]
        for a,b in zip(outline,outline[1:]+outline[:1]):
            a=Vector(a)-Vector(center[:2]);e=Vector(b)-Vector((a.x+center.x,a.y+center.y))
            den=d.x*e.y-d.y*e.x
            if abs(den)<1e-8:continue
            t=(a.x*e.y-a.y*e.x)/den;u=(a.x*d.y-a.y*d.x)/den
            if t>0 and 0<=u<=1:candidates.append(t)
        if not candidates:raise RuntimeError('Foot hull ray missed')
        radius=min(candidates)+.004;result.append(center+Vector((d.x*radius,d.y*radius,0)))
    # One periodic smoothing pass removes polygon corners without losing fit.
    for _ in range(3):
        result=[result[j]*.5+(result[(j-1)%count]+result[(j+1)%count])*.25 for j in range(count)]
    return result

def pumps(body,side,leather,sole_mat,box):
    outline=foot_last(body,side,.040);count=len(outline);cx=side*.1143
    def floor(y):
        t=max(0,min(1,(y+.035)/.16));return .008+.038*(t*t*(3-2*t))
    upper=Surface();rows=[]
    for k in range(9):
        t=k/8;row=[]
        for j,p in enumerate(outline):
            a=j*math.tau/count;c,s=math.cos(a),math.sin(a)
            opening=Vector((cx+.043*s,.033-(.061 if c>=0 else .106)*c,.075+.060*((1-c)/2)))
            q=p.lerp(opening,t);base=floor(p.y)
            q.z=base+(opening.z-base)*math.sin(t*math.pi/2)
            row.append(upper.point(q))
        rows.append(row)
    for k in range(8):
        for j in range(count):
            n=(j+1)%count;upper.face((rows[k][j],rows[k][n],rows[k+1][n],rows[k+1][j]),[(j/count,k/8),((j+1)/count,k/8),((j+1)/count,(k+1)/8),(j/count,(k+1)/8)])
    shoe=upper.object('Wardrobe_Female_AlmondPump',leather)
    bpy.context.view_layer.objects.active=shoe
    shell=shoe.modifiers.new('Turned leather opening','SOLIDIFY');shell.thickness=.0015;shell.offset=-1
    bpy.ops.object.modifier_apply(modifier=shell.name)
    sole=Surface();rings=[]
    for offset in [-.006,0]:rings.append([sole.point((p.x,p.y,floor(p.y)+offset))for p in outline])
    for j in range(count):
        n=(j+1)%count;sole.face((rings[0][j],rings[0][n],rings[1][n],rings[1][j]),[(j/count,0),((j+1)/count,0),((j+1)/count,1),(j/count,1)])
    sole.face(tuple(reversed(rings[0])),[(p.x,p.y)for p in outline])
    outsole=sole.object('Pump continuous thin outsole',sole_mat)
    heel=box('Wardrobe_Female_TaperedHeel',(cx,.109,.022),(.030,.033,.044),leather)
    for v in heel.data.vertices:
        t=max(0,min(1,v.co.z/.044));scale=.72+.28*t
        v.co.x=cx+(v.co.x-cx)*scale;v.co.y=.109+(v.co.y-.109)*scale
    return[shoe,outsole,heel]
