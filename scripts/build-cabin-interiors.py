"""Build playable cutaway room prefabs following interior-reference-grid.png."""
from pathlib import Path
import json
base=Path(__file__).resolve().parents[1]
exec((base/'scripts/build-reference-cabins.py').read_text().split('# Bake modifiers')[0])
green=material('Forest upholstery',(.14,.21,.11),.96)
rust=material('Rust upholstery',(.36,.14,.065),.96)
linen=material('Linen upholstery',(.58,.53,.40),.96)
cream=material('Warm ivory plaster',(.62,.58,.46),.95)
sage=material('Sage kitchen paint',(.22,.28,.19),.82)
rugmat=material('Woven cream rug',(.51,.45,.32),1)
ceramics=material('Cream stoneware',(.65,.62,.51),.5)
waterglass=material('Lake window blue gray',(.20,.36,.39),.25,.2)
bookmats=[material('Book cover '+str(i),c,.9) for i,c in enumerate([(.20,.27,.25),(.36,.17,.1),(.52,.42,.24),(.20,.26,.35)])]

def floorboards(w,d):
 box('Floor backing',(0,0,-.14),(w,d,.16),struct,.015)
 for i in range(math.ceil(d/.24)):
  y=-d/2+(i+.5)*d/math.ceil(d/.24)
  box('Interior oak floor',(0,y,-.025),(w,d/math.ceil(d/.24)-.012,.05),woods[i%4],.009)

def wall_room(w,d,family):
 top=2.8 if family!=1 else 2.2
 if family==2:box('Rear ivory wall',(0,d/2,top/2),(w,.16,top),cream)
 else:
  for i in range(12):box('Rear horizontal timber',(0,d/2,(i+.5)*top/12),(w,.14,top/12-.012),woods[i%4],.008)
 # Left wall is retained; the front and right walls are cut away for the camera.
 if family==2:box('Left ivory wall',(-w/2,0,1.38),(.14,d,2.76),cream)
 else:
  for i in range(12):box('Left timber wall',(-w/2,0,(i+.5)*top/12),(.14,d,top/12-.012),woods[(i+1)%4],.008)
 for x in [-w/2,w/2]:
  box('Back corner timber',(x,d/2,top/2),(.18,.2,top),struct)
 box('Rear ceiling tie',(0,d/2-.04,2.78),(w,.2,.2),struct)
 box('Left wall top timber',(-w/2,0,2.8),(.18,d,.18),struct)
 # A-frame gable and one retained sloping rafter establish the taller room family.
 ridge=4.7 if family==1 else 3.75
 panel('Rear gable',[(-w/2,d/2,top),(w/2,d/2,top),(0,d/2,ridge)],woods[2] if family!=2 else cream,.12)
 for side in [-1,1]:beam('Rear roof timber',(side*w/2,d/2-.12,top),(0,d/2-.12,ridge),.18,struct)
 if family==1:
  for y in [-d/2+.2,0,d/2-.1]:beam('A frame slope',(-w/2,y,.18),(0,y,4.7),.15,struct)
  panel('Triangular lake view',[(-1.25,d/2-.1,2.9),(1.25,d/2-.1,2.9),(0,d/2-.1,4.4)],waterglass,.025)
  for a,b in [((-1.3,d/2-.14,2.86),(1.3,d/2-.14,2.86)),((-1.3,d/2-.14,2.86),(0,d/2-.14,4.48)),((1.3,d/2-.14,2.86),(0,d/2-.14,4.48)),((0,d/2-.16,2.9),(0,d/2-.16,4.4))]:beam('Loft window frame',a,b,.075,trim)
 else:beam('Rear king post',(0,d/2-.13,2.8),(0,d/2-.13,ridge),.12,struct)
 # A broad left-window bay references the generated lake-facing room.
 box('Window dark reveal',(-w/2+.08,.1,1.55),(.18,2.0,1.55),trim)
 box('Window lake glazing',(-w/2+.185,.1,1.55),(.025,1.83,1.38),waterglass,.008)
 box('Window sill',(-w/2+.24,.1,.75),(.45,2.15,.1),struct)
 for y in [-.83,.1,1.03]:box('Window vertical frame',(-w/2+.23,y,1.55),(.08,.065,1.45),trim,.008)
 for z in [.84,2.27]:box('Window horizontal frame',(-w/2+.23,.1,z),(.08,2.0,.065),trim,.008)
 # The exit frame remains visible on the cutaway front-right edge.
 x=[1.55,.65,1.7][family]
 for xx in [x-.58,x+.58]:box('Exit door post',(xx,-d/2,1.15),(.12,.16,2.3),struct)
 box('Exit header',(x,-d/2,2.31),(1.3,.18,.14),struct)
 leafdoor=box('Open exit door',(x+.57,-d/2-.4,1.08),(.1,.9,2.15),woods[1]);leafdoor.rotation_euler.z=-.2

def bed(x,y,blanket):
 box('Bed timber base',(x,y,.21),(1.55,2.05,.40),struct,.05)
 box('Bed mattress',(x,y,.49),(1.50,1.98,.22),linen,.075)
 box('Bed headboard',(x,y+.98,.64),(1.68,.12,1.12),woods[2],.03)
 box('Bed blanket',(x,y-.30,.64),(1.52,1.40,.13),blanket,.06)
 for xx in [x-.38,x+.38]:box('Bed pillow',(xx,y+.62,.69),(.67,.48,.19),linen,.08)
 box('Blanket folded edge',(x,y+.36,.72),(1.52,.2,.11),linen,.035)

def sofa(x,y,mat):
 # Kept as furniture geometry; seating integration belongs to the seating task.
 box('Sofa feet',(x,y,.17),(.76,1.82,.25),trim,.025)
 box('Sofa base',(x,y,.35),(.92,1.95,.38),mat,.09)
 box('Sofa back',(x-.38,y,.77),(.23,2.0,.9),mat,.09)
 for yy in [y-.9,y+.9]:box('Sofa arm',(x+.02,yy,.65),(.82,.20,.62),mat,.075)
 for yy in [y-.44,y+.44]:box('Sofa seat cushion',(x+.06,yy,.60),(.73,.78,.22),mat,.08)
 for yy in [y-.5,y+.5]:
  o=box('Sofa loose cushion',(x-.13,yy,.95),(.2,.48,.47),linen,.07);o.rotation_euler.y=-.18

def coffee_table(x,y,round=False):
 if round:cylinder('Round coffee tabletop',(x,y,.48),.46,.10,woods[2],24)
 else:box('Coffee tabletop',(x,y,.49),(.75,1.05,.11),woods[2],.035)
 for dx in [-.25,.25]:
  for dy in [-.33,.33]:box('Coffee table leg',(x+dx,y+dy,.24),(.08,.08,.44),struct)
 cylinder('Cup',(x+.12,y+.1,.59),.065,.13,ceramics,12)
 cylinder('Cup saucer',(x+.12,y+.1,.535),.10,.025,ceramics,16)
 planter(x-.1,y-.15,.55)

def kitchen(x,y):
 box('Sage base cupboards',(x,y,.47),(1.55,.65,.94),sage,.03)
 box('Timber countertop',(x,y,.98),(1.66,.76,.10),woods[2],.02)
 for dx in [-.39,.39]:
  box('Cupboard door',(x+dx,y-.34,.48),(.70,.065,.75),sage,.018)
  box('Cupboard handle',(x+dx,y-.39,.67),(.18,.04,.035),black,.008)
 box('Sink black recess',(x+.3,y-.01,1.045),(.52,.40,.025),black,.03)
 beam('Faucet stem',(x+.3,y+.2,1.04),(x+.3,y+.2,1.28),.035,black)
 beam('Faucet spout',(x+.3,y+.2,1.28),(x+.3,y+.04,1.28),.035,black)
 box('Open kitchen shelf',(x,y+.19,1.72),(1.7,.34,.10),struct)
 for i in range(5):cylinder('Shelf stoneware',(x-.62+i*.29,y+.13,1.85),.08,.19,ceramics,12)
 box('Wall cupboard',(x+.39,y+.26,2.17),(.8,.35,.75),sage)
 for z in [2.0,2.25]:box('Kitchen cupboard line',(x+.39,y+.06,z),(.73,.045,.035),struct,.007)
 planter(x-.55,y-.05,1.02)

def display_shelf(x,y,z):
 box('Display shelf',(x,y,z),(1.85,.33,.10),struct)
 for xx in [-.65,.65]:beam('Display shelf bracket',(x+xx,y+.12,z-.30),(x+xx,y-.1,z-.02),.055,black)
 # Empty framed display slots deliberately invite future belongings.
 for i in range(3):
  xx=x-.55+i*.55
  box('Display frame',(xx,y-.01,z+.28),(.42,.07,.45),trim,.014)
  box('Display inset',(xx,y-.055,z+.28),(.34,.018,.36),cream,.004)

def desk(x,y):
 box('Reading desk top',(x,y,.78),(.70,1.1,.09),woods[2])
 for dx in [-.25,.25]:
  for dy in [-.44,.44]:box('Reading desk leg',(x+dx,y+dy,.38),(.07,.07,.72),struct)
 box('Notebook',(x,y,.86),(.33,.27,.06),bookmats[0],.01)
 box('Desk chair seat',(x-.53,y,.45),(.42,.46,.10),struct)
 box('Desk chair back',(x-.75,y,.73),(.08,.46,.6),struct)
 for dx in [-.16,.16]:
  for dy in [-.16,.16]:box('Desk chair leg',(x-.53+dx,y+dy,.21),(.045,.045,.42),struct,.008)
 planter(x,y+.36,.84)

def build(family):
 w=[5.3,5.6,5.9][family];d=[5.5,5.5,5.3][family]
 floorboards(w,d);wall_room(w,d,family)
 sofa(-w/2+.66,-.65,[green,linen,rust][family])
 box('Woven living rug',(-.55,-.45,.018),(2.15,2.1,.035),rugmat,.035)
 coffee_table(-.50,-.40,family==1)
 if family==0:
  bed(-1.35,1.55,green);kitchen(1.43,2.22);display_shelf(-.3,2.48,2.18)
 elif family==1:
  bed(0,1.42,rust);desk(2.10,-.35);display_shelf(0,2.48,2.32)
 else:
  bed(.0,1.60,green);kitchen(2.0,2.05)
  box('Rear bed divider',(1.0,1.6,1.38),(.10,2.1,2.76),struct)
  cylinder('Dining table top',(-1.8,1.75,.78),.44,.10,woods[2],24)
  cylinder('Dining table leg',(-1.8,1.75,.38),.07,.75,struct,10)
  display_shelf(1.95,.1,1.62)
  for xx in [1.08,2.82]:box('Display cabinet upright',(xx,.13,.83),(.10,.36,1.66),struct)
  for zz in [.15,.80]:box('Lower display shelf',(1.95,.1,zz),(1.85,.33,.09),struct)
 for x,y in [(-w/2+.32,-1.65),(w/2-.3,.9)]:planter(x,y,0)
 lantern(-w/2+.25,1.6,1.7)

rootdir=base/'assets/interior-source';rootdir.mkdir(exist_ok=True)
models=[]
for family,name in enumerate(['Timber','AFrame','Sage']):
 before=set(bpy.context.scene.objects);build(family);objects=list(set(bpy.context.scene.objects)-before)
 for o in bpy.context.scene.objects:o.select_set(False)
 for o in objects:
  if o.type!='MESH':continue
  bpy.context.view_layer.objects.active=o;o.select_set(True)
  for mod in list(o.modifiers):
   try:bpy.ops.object.modifier_apply(modifier=mod.name)
   except RuntimeError:pass
  o.select_set(False)
 meshes=[o for o in objects if o.type=='MESH']
 for o in meshes:o.select_set(True)
 bpy.context.view_layer.objects.active=meshes[0];bpy.ops.object.join();o=bpy.context.object;o.name='Interior_'+name
 bpy.ops.object.transform_apply(location=True,rotation=True,scale=True)
 bpy.ops.export_scene.gltf(filepath=str(rootdir/f'Lake_Interior_{name}.glb'),export_format='GLB',use_selection=True,export_animations=False)
 o.location.x=family*9;models.append(o)
bpy.ops.wm.save_as_mainfile(filepath=str(base/'assets/blender/Cabin_Interiors.blend'))
# Actual geometry review render.
for name,loc,power,size in [('Key',(9,-12,15),2600,10),('Fill',(-6,-2,11),1600,9)]:
 data=bpy.data.lights.new(name,'AREA');data.energy=power;data.size=size;o=bpy.data.objects.new(name,data);bpy.context.collection.objects.link(o);o.location=loc;o.rotation_euler=(Vector((8,0,1))-o.location).to_track_quat('-Z','Y').to_euler()
world=bpy.data.worlds.new('Soft interior review');world.use_nodes=True;world.node_tree.nodes['Background'].inputs[0].default_value=(.55,.58,.56,1);world.node_tree.nodes['Background'].inputs[1].default_value=.7;bpy.context.scene.world=world
camdata=bpy.data.cameras.new('Interior family');cam=bpy.data.objects.new('Interior family',camdata);bpy.context.collection.objects.link(cam);cam.location=(22,-26,23);cam.rotation_euler=(Vector((9,0,1))-cam.location).to_track_quat('-Z','Y').to_euler();camdata.type='ORTHO';camdata.ortho_scale=30
scene=bpy.context.scene;scene.camera=cam;scene.render.engine='CYCLES';scene.cycles.samples=20;scene.render.resolution_x=1800;scene.render.resolution_y=900;scene.render.resolution_percentage=100;scene.render.filepath=str(base/'docs/art-direction/interiors/interiors-blender.png');bpy.ops.render.render(write_still=True)
print('Three furnished interior prefabs exported',flush=True)
