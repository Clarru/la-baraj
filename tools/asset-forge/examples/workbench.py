"""Example custom family. Geometry follows asset.json dimensions; no live-world installation."""
def build(context):
    p, m = context.parts, context.material
    w,h,d = context.spec['dimensions']
    if min(w,d)<.35 or h<.4:
        raise ValueError('Workbench dimensions must be at least0.35m wide/deep and0.4m high')
    top=h-.01
    count = context.parameters.get('planks', 5)
    if not isinstance(count,int) or not 3 <= count <= 10:
        raise ValueError('planks must be an integer from3 to10')
    leg=min(.1,w*.1,d*.2)
    for i in range(count):
        p.box(f'Top plank {i}',(0,-d/2+(i+.5)*d/count,top-.04),(w,d/count-.003,.08),m,2,0,bevel=.003)
    for x in [-w/2+leg,w/2-leg]:
        for y in [-d/2+leg,d/2-leg]:
            # A shallow tenon enters the tabletop; separate bevels must not open a gap.
            p.box('Leg',(x,y,(top-.08+.006)/2),(leg,leg,top-.08+.006),m,2,2)
            p.bolt('Iron fixing',(x,y,top+.004),(0,0,1),m,.013)
            sx=1 if x>0 else -1
            name=f"Leg_{'R' if x>0 else 'L'}_{'B' if y>0 else 'F'}"
            context.joints[name]=[
                {'name':f'contact_{i}', 'origin':[x+sx*(leg/2+.0025),y+offset,top-.081],
                 'direction':[-sx,0,0], 'maxDistance':.00325}
                for i,offset in enumerate([-leg*.2,0,leg*.2])]
    for y in [-d/2+leg,d/2-leg]:
        p.box('Long stretcher',(0,y,.22),(w-2*leg,.065,.10),m,2,0)
    return {'WorkSurface':(0,0,top)}
