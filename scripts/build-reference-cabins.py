"""Reconstruct the three columns of docs/art-direction/cabin-reference-grid.png.
Front is Blender -Y, converted to browser +Z; settlement rotates the models to face the lake.
"""
import bpy,math,random,sys
from shutil import copyfile
from pathlib import Path
from mathutils import Vector
from array import array
root=Path('/Users/claumarin/Documents/ChatGPT/multiplayer-game')
bpy.ops.wm.read_factory_settings(use_empty=True)
random.seed(407)
# Restrained grain is original procedural image data, not an imagegen substitute for the reference.
im=bpy.data.images.new('Subtle timber grain',width=256,height=256)
pix=array('f')
for y in range(256):
 for x in range(256):
  v=.91+.035*math.sin(y*.65+math.sin(x*.025)*2)+random.uniform(-.025,.025)
  pix.extend((v,v*.985,v*.955,1))
im.pixels.foreach_set(pix);im.pack()
def material(name,color,rough=.7,metal=0,wood=False,glow=0):
 m=bpy.data.materials.new(name);m.diffuse_color=(*color,1);m.use_nodes=True
 p=m.node_tree.nodes.get('Principled BSDF');p.inputs['Base Color'].default_value=(*color,1);p.inputs['Roughness'].default_value=rough;p.inputs['Metallic'].default_value=metal
 if glow:p.inputs['Emission Color'].default_value=(*color,1);p.inputs['Emission Strength'].default_value=glow
 if wood:
  n=m.node_tree.nodes.new('ShaderNodeTexImage');n.image=im
  mix=m.node_tree.nodes.new('ShaderNodeMixRGB');mix.blend_type='MULTIPLY';mix.inputs[0].default_value=1;mix.inputs[2].default_value=(*color,1)
  m.node_tree.links.new(n.outputs['Color'],mix.inputs[1]);m.node_tree.links.new(mix.outputs[0],p.inputs['Base Color'])
  # Apply the chosen wood tone in image pixels through glTF's supported material factor.
  # The export script restores the multiply as baseColorFactor afterward.
  m['base_tint']=list(color)
 return m
woods=[material('Honey timber '+str(i),(.40+i*.022,.22+i*.014,.105+i*.008),wood=True) for i in range(4)]
sages=[material('Sage boards '+str(i),(.29+i*.018,.34+i*.018,.25+i*.014),wood=True) for i in range(3)]
trim=material('Deep brown window frames',(.095,.075,.052),.65)
struct=material('Warm structural timber',(.34,.18,.075),.7,wood=True)
roof=material('Graphite standing seam',(.09,.13,.15),.55,.35)
greenroof=material('Deep evergreen standing seam',(.065,.135,.13),.58,.3)
seam=material('Metal seam highlights',(.15,.20,.22),.5,.4)
stone=[material('Foundation stone '+str(i),(.27+i*.025,.285+i*.022,.27+i*.022),.95) for i in range(3)]
glass=material('Blue gray glass',(.12,.22,.25),.2,.25)
glass.node_tree.nodes.get('Principled BSDF').inputs['Alpha'].default_value=.24
glass.surface_render_method='DITHERED'
loftglass=material('Loft blue gray glazing',(.075,.18,.22),.20,.20)
loftglass.node_tree.nodes.get('Principled BSDF').inputs['Alpha'].default_value=.86
loftglass.surface_render_method='DITHERED'
windowglow=material('Warm interior light',(.46,.26,.105),.8,glow=.42)
curtain=material('Linen curtains',(.65,.57,.40),.95)
black=material('Lantern iron',(.065,.075,.072),.55,.3)
lamp=material('Lantern light',(.95,.5,.16),.5,glow=2)
leaf=material('Plant leaves',(.17,.23,.1),.95)
ceramic=material('Clay planters',(.23,.24,.20),.8)
brick=material('Chimney masonry',(.31,.28,.22),.92)

def box(name,location,size,mat,bevel=.025):
 bpy.ops.mesh.primitive_cube_add(size=1,location=location);o=bpy.context.object;o.name=name;o.dimensions=size;bpy.ops.object.transform_apply(location=False,rotation=False,scale=True);o.data.materials.append(mat)
 if bevel:
  b=o.modifiers.new('Edge highlights','BEVEL');b.width=bevel;b.segments=2
  n=o.modifiers.new('Weighted corner normals','WEIGHTED_NORMAL')
 return o

def beam(name,a,b,width,mat):
 d=Vector(b)-Vector(a);o=box(name,(Vector(a)+Vector(b))/2,(width,width,d.length),mat,.015);o.rotation_euler=d.to_track_quat('Z','Y').to_euler();return o

def panel(name,verts,mat,thickness=.09):
 data=bpy.data.meshes.new(name);data.from_pydata(verts,[],[tuple(range(len(verts)))]);data.materials.append(mat);o=bpy.data.objects.new(name,data);bpy.context.collection.objects.link(o)
 mod=o.modifiers.new('Thickness','SOLIDIFY');mod.thickness=thickness
 bevel=o.modifiers.new('Edge highlights','BEVEL');bevel.width=.015;bevel.segments=2
 return o

def cylinder(name,loc,radius,depth,mat,vertices=10,rotation=None):
 bpy.ops.mesh.primitive_cylinder_add(vertices=vertices,radius=radius,depth=depth,location=loc);o=bpy.context.object;o.name=name;o.data.materials.append(mat)
 if rotation:o.rotation_euler=rotation
 return o

def foundation(w,d):
 box('Continuous stone plinth',(0,0,.27),(w+.12,d+.12,.54),stone[1],.07)
 for y in [-d/2-.04,d/2+.04]:
  for i in range(math.ceil(w/.7)):
   x=-w/2+.32+i*.69;box('Individual foundation stones',(x,y,.28),(.64,.15,.4),stone[i%3],.06)
 for x in [-w/2-.04,w/2+.04]:
  for i in range(math.ceil(d/.7)):box('Side foundation stones',(x,-d/2+.3+i*.69,.28),(.15,.63,.4),stone[i%3],.06)

def plank_floor(w,y0,y1,z=.57):
 n=math.ceil((y1-y0)/.25)
 for i in range(n):box('Deck board',(0,y0+(i+.5)*(y1-y0)/n,z),(w,(y1-y0)/n-.014,.13),woods[i%4],.015)
 box('Deck front fascia',(0,y0-.035,z-.09),(w+.08,.15,.26),struct,.02)
 for i in range(3):box('Entry step',(0,y0-.28-i*.32,.39-i*.13),(1.9,.48,.17),woods[(i+1)%4],.02)

def rect_window(x,y,z,w,h,side=False):
 # Frame and reveal depth are geometry; warm panels suggest interior depth without a full room.
 def b(name,dx,dy,dz,sx,sy,sz,mat,bev=.018):
  if side:return box(name,(x-dy*(1 if x>0 else -1),y+dx,z+dz),(sy,sx,sz),mat,bev)
  return box(name,(x+dx,y+dy*(1 if y<0 else -1),z+dz),(sx,sy,sz),mat,bev)
 b('Window reveal',0,0,0,w+.2,.18,h+.2,trim)
 b('Warm room behind glazing',0,-.105,0,w-.1,.035,h-.1,windowglow,.005)
 # Leave a warm center bordered with dark reflective glass strips and linen side curtains.
 b('Glazing',0,-.18,0,w-.1,.012,h-.1,glass,.003)
 b('Linen curtain',w*.34,-.14,0,w*.15,.04,h-.12,curtain,.008)
 for dx in [-w/2,w/2]:b('Window jamb',dx,-.16,0,.085,.12,h+.12,trim)
 for dz in [-h/2,h/2]:b('Window frame',0,-.16,dz,w+.12,.12,.085,trim)
 b('Window mullion',0,-.18,0,.055,.1,h,trim,.008)
 b('Projecting sill',0,-.23,-h/2-.06,w+.25,.34,.09,struct)
 # Visible lamp and furniture silhouettes echo the reference's warm interior.
 b('Interior furniture',-w*.15,-.15,-h*.3,w*.35,.025,h*.18,struct,.008)
 b('Interior lamp stem',-w*.18,-.15,h*.25,.025,.025,h*.4,trim,.003)
 b('Interior warm lampshade',-w*.18,-.16,h*.17,.20,.035,.15,lamp,.01)

def door(x,y,z=.65,w=1.0):
 box('Door casing',(x,y,z+1.1),(w+.18,.19,2.32),trim)
 box('Door timber leaf',(x,y-.11,z+1.07),(w,.08,2.14),woods[1])
 box('Door glazed upper pane',(x,y-.16,z+1.55),(w-.23,.025,.82),windowglow,.008)
 for dx in [-.20,.20]:box('Door glass muntin',(x+dx,y-.18,z+1.55),(.045,.04,.82),trim,.006)
 box('Door glass crossbar',(x,y-.18,z+1.55),(w-.23,.04,.045),trim,.006)
 box('Door handle',(x+w*.32,y-.21,z+1.0),(.04,.05,.2),black,.01)

def lantern(x,y,z):
 box('Lantern bracket',(x,y,z+.13),(.15,.14,.4),black)
 box('Lantern glowing glass',(x,y-.18,z),(.16,.16,.29),lamp,.012)
 for dx in [-.1,.1]:box('Lantern iron frame',(x+dx,y-.18,z),(.025,.22,.34),black,.004)
 box('Lantern cap',(x,y-.18,z+.19),(.28,.28,.08),black)

def bench(x,y):
 for dx in [-.65,.65]:box('Bench legs',(x+dx,y,.83),(.09,.48,.5),struct)
 for j in range(3):box('Bench seat slat',(x,y-.18+j*.16,1.08),(1.6,.14,.08),woods[j])
 for j in range(3):box('Bench back slat',(x,y+.24,1.28+j*.16),(1.6,.07,.12),woods[j])

def planter(x,y,z=.69):
 cylinder('Terracotta planter',(x,y,z+.18),.2,.36,ceramic,12)
 for i in range(6):
  a=i*math.pi/3
  beam('Plant stem',(x,y,z+.34),(x+math.cos(a)*.16,y+math.sin(a)*.16,z+.72),.025,leaf)
  bpy.ops.mesh.primitive_ico_sphere_add(subdivisions=1,radius=.16,location=(x+math.cos(a)*.15,y+math.sin(a)*.15,z+.65));o=bpy.context.object;o.name='Planter foliage';o.scale=(.6,.6,1.4);o.data.materials.append(leaf)

def chimney(x,y,bottom,top):
 for i in range(math.ceil((top-bottom)/.18)):
  z=bottom+.09+i*.18
  box('Chimney masonry course',(x,y,z),(.53,.49,.165),stone[i%3],.015)
  box('Chimney mortar joint',(x+(-.14 if i%2 else .14),y-.251,z),(.018,.008,.16),brick,.002)
 box('Chimney cap',(x,y,top+.06),(.73,.67,.12),black)
 box('Chimney flue',(x,y,top+.15),(.24,.24,.25),black)

def roof_gable(w,y0,y1,eave,ridge,mat):
 for side in [-1,1]:
  x=w/2*side
  verts=[(x,y0,eave),(x,y1,eave),(0,y1,ridge),(0,y0,ridge)]
  panel('Standing seam roof',verts if side==1 else list(reversed(verts)),mat)
  for j in range(math.ceil((y1-y0)/.42)+1):
   y=y0+j*(y1-y0)/math.ceil((y1-y0)/.42)
   beam('Raised roof seam',(x,y,eave+.04),(0,y,ridge+.04),.035,mat)
  beam('Eave fascia',(x,y0,eave-.02),(x,y1,eave-.02),.15,trim)
 for y in [y0-.015,y1+.015]:
  beam('Sloped roof fascia',(-w/2,y,eave),(0,y,ridge),.19,trim)
  beam('Sloped roof fascia',(0,y,ridge),(w/2,y,eave),.19,trim)
 beam('Ridge cap',(0,y0-.05,ridge+.06),(0,y1+.05,ridge+.06),.13,mat)

def board_walls(w,d,base,top,mats,vertical=False):
 # Solid backing avoids light leaks; boards provide the reference's readable cladding.
 box('Wall backing',(0,0,(base+top)/2),(w-.08,d-.08,top-base),mats[0],.01)
 if vertical:
  for front in [-1,1]:
   for i in range(math.ceil(w/.24)):
    x=-w/2+(i+.5)*w/math.ceil(w/.24);box('Vertical front boards',(x,front*d/2,(base+top)/2),(w/math.ceil(w/.24)-.014,.07,top-base),mats[i%len(mats)],.008)
  for side in [-1,1]:
   for i in range(math.ceil(d/.24)):
    y=-d/2+(i+.5)*d/math.ceil(d/.24);box('Vertical side boards',(side*w/2,y,(base+top)/2),(.07,d/math.ceil(d/.24)-.014,top-base),mats[i%len(mats)],.008)
 else:
  n=math.ceil((top-base)/.24)
  for i in range(n):
   z=base+(i+.5)*(top-base)/n
   for side in [-1,1]:box('Horizontal siding',(0,side*d/2,z),(w,.07,(top-base)/n-.014),mats[i%len(mats)],.008)
   for side in [-1,1]:box('Horizontal side siding',(side*w/2,0,z),(.07,d,(top-base)/n-.014),mats[i%len(mats)],.008)
 for x in [-w/2,w/2]:
  for y in [-d/2,d/2]:box('Corner board',(x,y,(base+top)/2),(.14,.14,top-base+.05),struct,.015)

def triangle_gable(w,y,eave,ridge,mat):
 panel('Timber gable infill',[(-w/2,y,eave),(w/2,y,eave),(0,y,ridge)],mat,.10)
 # Sloped battens add the reference's structural, readable gable shape.
 for x in [-w*.3,0,w*.3]:
  h=ridge-abs(x)/(w/2)*(ridge-eave)
  beam('Gable vertical trim',(x,y-.06,eave),(x,y-.06,h),.065,struct)

def porch_posts(w,y,base,top,rails=True):
 for x in [-w/2+.16,w/2-.16]:
  box('Heavy porch post',(x,y,(base+top)/2),(.20,.20,top-base),struct,.025)
  if rails:
   box('Porch side handrail',(x,y+.8,base+.86),(.12,1.7,.10),struct)
   for j in range(8):box('Porch side baluster',(x,y+j*.22,base+.44),(.065,.065,.8),struct,.009)
 box('Porch header beam',(0,y,top-.08),(w,.22,.25),struct)
 for x in [-w/2+.16,w/2-.16]:beam('Porch knee brace',(x,y,top-.7),(x+(.6 if x<0 else -.6),y,top-.13),.13,struct)

def build_gable():
 w,d=5.6,6.1;foundation(w,d);board_walls(w,d,.6,3.35,woods)
 for y in [-d/2,d/2]:triangle_gable(w,y,3.35,4.95,woods[2])
 plank_floor(5.95,-4.9,-2.95);roof_gable(6.35,-5.12,3.45,3.45,5.25,roof)
 porch_posts(5.75,-4.78,.65,3.46)
 beam('Front gable tie',(-2.9,-4.91,3.43),(2.9,-4.91,3.43),.19,struct)
 beam('Front gable king post',(0,-4.91,3.43),(0,-4.91,5.1),.18,struct)
 for side in [-1,1]:beam('Front gable truss',(side*1.9,-4.91,3.5),(side*.12,-4.91,4.9),.12,struct)
 rect_window(-1.05,-3.12,2.05,2.25,1.65);door(1.63,-3.12);lantern(.72,-3.14,2.35)
 for side in [-1,1]:
  for y in [-.9,1.55]:rect_window(side*2.86,y,2.05,1.15,1.45,True)
 rect_window(0,3.12,2.05,1.8,1.55)
 bench(-1.2,-3.65);planter(2.45,-4.35);chimney(1.8,1.6,4.25,5.55)
 for j in range(3):
  for i in range(4-j):cylinder('Stacked firewood',(1.55+i*.24,-4.3,.17+j*.22),.11,.65,woods[(i+j)%4],8,(math.pi/2,0,0))

def build_aframe():
 w,d=6.0,6.3;foundation(w,d);plank_floor(6.5,-4.8,-2.95)
 # Thick triangular front and rear structures, matched to the reference roof proportions.
 for y in [-d/2,d/2]:
  panel('A frame timber facade',[(-2.92,y,.62),(2.92,y,.62),(0,y,6.0)],woods[2],.13)
  for side in [-1,1]:beam('A frame facade timber',(side*2.9,y-.10,.65),(0,y-.1,5.98),.16,struct)
 roof_gable(6.6,-3.6,3.6,.48,6.55,greenroof)
 # Recessed triangular loft glazing with thick timber frame.
 panel('Loft window reveal',[(-1.3,-3.23,3.36),(1.3,-3.23,3.36),(0,-3.23,5.83)],trim,.035)
 panel('Loft interior glow',[(-1.2,-3.25,3.45),(1.2,-3.25,3.45),(0,-3.25,5.7)],windowglow,.012)
 panel('Triangular loft glass',[(-1.2,-3.28,3.45),(1.2,-3.28,3.45),(0,-3.28,5.7)],loftglass,.012)
 for a,b in [((-1.24,-3.3,3.42),(1.24,-3.3,3.42)),((-1.24,-3.3,3.42),(0,-3.3,5.76)),((1.24,-3.3,3.42),(0,-3.3,5.76)),((0,-3.32,3.45),(0,-3.32,5.7))]:beam('Loft window frame',a,b,.095,trim)
 door(-.65,-3.27,.65,1.05);door(.65,-3.27,.65,1.05)
 for x in [-1.63,1.63]:lantern(x,-3.27,2.25)
 bench(-1.8,-3.85);bench(1.8,-3.85);planter(-2.6,-4.2);planter(2.6,-4.2)
 # The reference's single side dormer is a complete framed box with a sloped cap.
 panel('Dormer front timber',[(2.72,-.5,2.6),(2.72,1.4,2.6),(2.72,1.4,4.08),(2.72,-.5,4.08)],woods[1],.12)
 for y in [-.5,1.4]:panel('Dormer side timber',[(1.05,y,2.6),(2.72,y,2.6),(2.72,y,4.08),(1.05,y,4.38)],woods[1],.12)
 rect_window(2.78,.45,3.45,1.15,1.05,True)
 panel('Dormer roof',[(1.0,-.63,4.45),(2.88,-.63,4.12),(2.88,1.55,4.12),(1.0,1.55,4.45)],greenroof,.12)
 cylinder('A frame stove flue',(-.4,1.4,6.1),.09,1.3,black,12)
 cylinder('Stove rain cap',(-.4,1.4,6.8),.17,.08,black,12)
 rect_window(0,3.22,1.9,1.6,1.9)

def build_sage():
 w,d=6.6,5.8;foundation(w,d);board_walls(w,d,.6,3.15,sages,True)
 for y in [-d/2,d/2]:triangle_gable(w,y,3.15,4.55,sages[1])
 roof_gable(7.1,-3.3,3.25,3.25,4.8,roof)
 rect_window(-1.45,-2.97,1.95,2.5,1.75);door(1.7,-2.97);lantern(.95,-3.05,2.3)
 for y in [-1.0,1.4]:rect_window(3.36,y,1.95,1.1,1.45,True)
 rect_window(-3.36,.2,1.95,1.55,1.6,True);rect_window(0,2.97,1.95,1.5,1.6)
 # Offset veranda: side-specific structure and roof from column C of the reference.
 for j in range(7):box('Offset porch board',(1.65,-3.13-j*.24,.57),(2.8,.225,.14),woods[j%4],.012)
 for x in [.27,3.03]:box('Offset porch post',(x,-4.48,1.87),(.17,.17,2.48),struct)
 box('Offset porch header',(1.65,-4.48,3.08),(3.05,.2,.22),struct)
 panel('Offset porch roof',[(.12,-4.7,3.22),(3.2,-4.7,3.22),(3.2,-2.75,3.62),(.12,-2.75,3.62)],roof,.12)
 for x in [.12,3.2]:beam('Porch fascia',(x,-4.7,3.22),(x,-2.75,3.62),.14,struct)
 for x in [.2,.8,1.4,2.0,2.6,3.12]:beam('Porch roof seam',(x,-4.7,3.26),(x,-2.75,3.66),.035,roof)
 for j in range(3):box('Porch entry step',(1.65,-4.86-j*.28,.4-j*.13),(1.9,.43,.17),woods[j],.018)
 bench(2.1,-3.65);planter(.5,-4.2);chimney(.3,1.4,4.2,5.1)

# Bake modifiers and merge by material once: practical asset assembly, no runtime generator.
def finish(name,objects):
 for o in bpy.context.scene.objects:o.select_set(False)
 meshes=[o for o in objects if o.type=='MESH']
 for o in meshes:
  bpy.context.view_layer.objects.active=o;o.select_set(True)
  for mod in list(o.modifiers):
   try:bpy.ops.object.modifier_apply(modifier=mod.name)
   except RuntimeError:pass
  o.select_set(False)
 for o in meshes:o.select_set(True)
 bpy.context.view_layer.objects.active=meshes[0];bpy.ops.object.join();joined=bpy.context.object;joined.name='Cabin_'+name
 # Keep shared vertex normals; soft bevels already supply the highlight geometry.
 out=root/f'assets/house-source/Lake_Cabin_{name}.glb';out.parent.mkdir(exist_ok=True)
 bpy.ops.export_scene.gltf(filepath=str(out),export_format='GLB',use_selection=True,export_animations=False,export_materials='EXPORT')
 joined.location.x={'Gable':0,'AFrame':10,'Sage':21}[name]
 return joined
built=[]
only='AFrame' if '--only-aframe' in sys.argv else None
for name,fn in [('Gable',build_gable),('AFrame',build_aframe),('Sage',build_sage)]:
 if only and name!=only:continue
 before=set(bpy.context.scene.objects);fn();built.append(finish(name,set(bpy.context.scene.objects)-before))
if only:
 backup=root/'assets/blender/Cabin_Library_Source_Backup.blend'
 copyfile(root/'assets/blender/Reference_Cabin_Library.blend',backup)
 with bpy.data.libraries.load(str(backup),link=False) as (source,target):
  target.objects=[name for name in source.objects if name in ['Cabin_Gable','Cabin_Sage']]
 for obj in target.objects:
  if obj:bpy.context.collection.objects.link(obj)
# Save just the current cabin library; other production Blender invocations exit themselves.
bpy.ops.wm.save_as_mainfile(filepath=str(root/'assets/blender/Reference_Cabin_Library.blend'))
# One source render for direct visual comparison, not a substitute for the browser check.
for name,loc,power,size in [('Key',(8,-14,18),2200,10),('Fill',(-8,-4,10),1100,8)]:
 data=bpy.data.lights.new(name,'AREA');data.energy=power;data.size=size;o=bpy.data.objects.new(name,data);bpy.context.collection.objects.link(o);o.location=loc;o.rotation_euler=(Vector((6,0,2))-o.location).to_track_quat('-Z','Y').to_euler()
world=bpy.data.worlds.new('Neutral daylight');world.use_nodes=True;world.node_tree.nodes['Background'].inputs[0].default_value=(.6,.65,.7,1);world.node_tree.nodes['Background'].inputs[1].default_value=.65;bpy.context.scene.world=world
bpy.ops.mesh.primitive_plane_add(size=200,location=(0,0,-.05));bpy.context.object.data.materials.append(material('Studio ground',(.38,.39,.37),.95))
camdata=bpy.data.cameras.new('Cabin family review');cam=bpy.data.objects.new('Cabin family review',camdata);bpy.context.collection.objects.link(cam);cam.location=(24,-38,19);cam.rotation_euler=(Vector((10,0,2.5))-cam.location).to_track_quat('-Z','Y').to_euler();camdata.type='ORTHO';camdata.ortho_scale=35
scene=bpy.context.scene;scene.camera=cam;scene.render.engine='CYCLES';scene.cycles.samples=24;scene.render.resolution_x=1600;scene.render.resolution_y=900;scene.render.resolution_percentage=100;scene.render.filepath=str(root/'docs/art-direction/cabins-blender-final.png');bpy.ops.render.render(write_still=True)
print('Reference cabin family exported',flush=True)
