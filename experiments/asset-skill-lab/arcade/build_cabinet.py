"""Original cabinet; metres, Z up, front -Y. Reuses the accepted prop PBR trim.
Blender --background --python build_cabinet.py. Runtime nodes remain separate.
"""
import bpy,math,sys,json
from pathlib import Path
from mathutils import Vector,Matrix
ROOT=Path(__file__).resolve().parents[3]
sys.path.insert(0,str(ROOT/'.agents/skills/la-baraj-3d-assets/scripts'))
from prop_parts import box,beam,extrude_z,atlas_material,uv_map
OUT=Path(__file__).resolve().parent
bpy.ops.wm.read_factory_settings(use_empty=True)
trim=ROOT/'experiments/asset-skill-lab/material-study/own-trim'
iron=atlas_material(trim/'trim-base-color.png',trim/'trim-normal.png',trim/'trim-metallic-roughness.png')
def flat(name,color,rough=.65,metal=0):
    m=bpy.data.materials.new(name);m.use_nodes=True
    p=m.node_tree.nodes.get('Principled BSDF');p.inputs['Base Color'].default_value=(*color,1)
    p.inputs['Roughness'].default_value=rough;p.inputs['Metallic'].default_value=metal
    return m
green=iron.copy();green.name='Forest enamel'
p=green.node_tree.nodes.get('Principled BSDF');tex=next(n for n in green.node_tree.nodes if n.type=='TEX_IMAGE' and n.image.colorspace_settings.name=='sRGB')
mix=green.node_tree.nodes.new('ShaderNodeMixRGB');mix.blend_type='MULTIPLY';mix.inputs[0].default_value=1;mix.inputs[2].default_value=(.3,.65,.43,1)
green.node_tree.links.new(tex.outputs['Color'],mix.inputs[1]);green.node_tree.links.new(mix.outputs[0],p.inputs['Base Color'])
for l in list(p.inputs['Metallic'].links):green.node_tree.links.remove(l)
p.inputs['Metallic'].default_value=0
paint=OUT/'paint-512.png'
if paint.exists():
    tex.image=bpy.data.images.load(str(paint));tex.image.pack()
    coords=green.node_tree.nodes.new('ShaderNodeTexCoord');scale=green.node_tree.nodes.new('ShaderNodeVectorMath');scale.operation='MULTIPLY';scale.inputs[1].default_value=(4,1,1)
    green.node_tree.links.new(coords.outputs['UV'],scale.inputs[0]);green.node_tree.links.new(scale.outputs[0],tex.inputs['Vector']);green.node_tree.links.new(tex.outputs['Color'],p.inputs['Base Color'])
    normal=next(n for n in green.node_tree.nodes if n.type=='NORMAL_MAP');normal.inputs['Strength'].default_value=.15
cream=flat('Ivory buttons',(.76,.66,.45));red=flat('Terracotta buttons',(.48,.12,.055));black=flat('Screen bezel',(.009,.017,.014),.48)
ink=flat('Marquee forest ink',(.012,.045,.026));ochre=flat('Pine ochre',(.43,.26,.08))
marquee=flat('Warm illuminated marquee',(.8,.71,.5));mp=marquee.node_tree.nodes.get('Principled BSDF');mp.inputs['Emission Color'].default_value=(.8,.71,.5,1);mp.inputs['Emission Strength'].default_value=.35
# Cabinet silhouette profile is extruded sideways from an explicit closed outline.
profile=[(.33,.06),(-.27,.06),(-.27,.63),(-.345,.71),(-.345,.91),(-.30,.97),(-.215,1.02),(-.105,1.56),(-.29,1.64),(-.29,1.79),(.33,1.79)]
profile=[(y,z+.10 if z>=1.56 else z) for y,z in profile]
def side(name,x,thickness,mat,strip=0):
    obj=extrude_z(name,profile,x-thickness/2,x+thickness/2,mat,strip)
    # Canonical profile (depth,height), thickness Z -> world (X,depth,height).
    obj.data.transform(Matrix(((0,0,1,0),(1,0,0,0),(0,1,0,0),(0,0,0,1))))
    uv_map(obj,strip,2,highlight=strip==0);return obj
for x in [-.357,.357]:
    side('Painted side panel',x,.028,green)
    for i,a in enumerate(profile):
        b=profile[(i+1)%len(profile)]
        beam('Timber silhouette rail',(x,a[0],a[1]),(x,b[0],b[1]),.046,iron,3,.004)
box('Iron plinth',(0,.0,.065),(.75,.70,.13),iron,0,bevel=.008)
box('Closed roof',(0,.015,1.892),(.67,.61,.032),green,0,bevel=.004)
box('Back panel',(0,.315,1.00),(.67,.032,1.77),green,0,bevel=.005)
box('Lower front',(0,-.253,.39),(.668,.035,.54),green,0,bevel=.004)
box('Service iron surround',(.0,-.278,.40),(.35,.025,.34),iron,0,bevel=.018)
box('Service door',(.0,-.294,.40),(.317,.014,.307),green,0,bevel=.012)
box('Key plate',(.113,-.306,.40),(.027,.008,.055),iron,1)
box('Key slot',(.113,-.312,.40),(.005,.003,.021),black,0,bevel=.002)
box('Control deck',(0,-.18,.935),(.67,.34,.045),green,0,bevel=.006)
beam('Deck front timber',(-.35,-.345,.91),(.35,-.345,.91),.045,iron,3,.005)
box('Deck apron',(0,-.334,.84),(.66,.037,.095),green)
beam('Apron timber',(-.35,-.35,.779),(.35,-.35,.779),.042,iron,3,.004)
# Screen: 0.52 x 0.65m, 8 degrees reclined. Plane UV deliberately survives glTF.
angle=math.radians(8);center=Vector((0,-.181,1.321))
def on_screen(x,z,offset=0):return center+Vector((x,math.sin(angle)*z-math.cos(angle)*offset,math.cos(angle)*z+math.sin(angle)*offset))
for name,pos,size in [('Display backing',(0,0),(.60,.028,.733))]:
    obj=box(name,center,size,black,0,bevel=.006);obj.rotation_euler.x=-angle
for x in [-.282,.282]:
    beam('Display iron vertical',on_screen(x,-.35,.021),on_screen(x,.35,.021),.035,iron,0,.003)
for z in [-.35,.35]:beam('Display iron horizontal',on_screen(-.28,z,.021),on_screen(.28,z,.021),.035,iron,0,.003)
mesh=bpy.data.meshes.new('Screen UV');verts=[on_screen(x,z,.022) for x,z in [(-.26,-.325),(.26,-.325),(.26,.325),(-.26,.325)]]
mesh.from_pydata(verts,[],[(0,1,2,3)]);mesh.update();screen=bpy.data.objects.new('Screen',mesh);bpy.context.collection.objects.link(screen)
uv=mesh.uv_layers.new(name='UVMap')
for loop,value in zip(uv.data,[(0,0),(1,0),(1,1),(0,1)]):loop.uv=value
display=flat('Live display',(.76,.68,.51))
preview=OUT/'screen-preview.png'
if preview.exists():
    t=display.node_tree.nodes.new('ShaderNodeTexImage');t.image=bpy.data.images.load(str(preview));t.image.pack();display.node_tree.links.new(t.outputs['Color'],display.node_tree.nodes.get('Principled BSDF').inputs['Base Color'])
screen.data.materials.append(display)
# Marquee and actual mesh lettering (not a flattened generated picture).
box('Marquee lightbox',(0,-.291,1.804),(.65,.030,.139),marquee,0,bevel=.004)
for z in [1.718,1.89]:beam('Marquee timber',(-.35,-.305,z),(.35,-.305,z),.039,iron,3,.004)
font_path=OUT/'BreeSerif.ttf'
if not font_path.exists():
    from fontTools.ttLib import TTFont
    f=TTFont(ROOT/'apps/web/public/fonts/bree-serif-latin-400-normal.woff2');f.flavor=None;f.save(font_path)
font=bpy.data.fonts.load(str(font_path))
def text(name,body,position,size,mat):
    curve=bpy.data.curves.new(name,'FONT');curve.body=body;curve.font=font;curve.size=size;curve.align_x='CENTER';curve.align_y='CENTER';curve.resolution_u=3;curve.extrude=.0005
    obj=bpy.data.objects.new(name,curve);bpy.context.collection.objects.link(obj);obj.location=position;obj.rotation_euler=(math.pi/2,0,0);obj.data.materials.append(mat)
    bpy.context.view_layer.objects.active=obj;obj.select_set(True);bpy.ops.object.convert(target='MESH');obj.select_set(False)
text('Marquee 2048','2048',(0,-.310,1.804),.18,ink)
text('Deck instruction','JOIN THE NUMBERS',(0,-.365,.842),.027,cream)
def cylinder(name,position,radius,depth,mat,strip=0,vertices=12,rotation=None):
    bpy.ops.mesh.primitive_cylinder_add(vertices=vertices,radius=radius,depth=depth,location=position);o=bpy.context.object;o.name=name
    if rotation:o.rotation_euler=rotation
    o.data.materials.append(mat);uv_map(o,strip,2,compact=strip<2);return o
for x in [-.32,.32]:
    for z in [.16,.74,1.74]:cylinder('Front bolt',(x,-.321 if z>1 else -.281,z),.009,.007,iron,1,8,(math.pi/2,0,0))
for x in [-.14,.14]:
    for z in [.27,.53]:cylinder('Service screw',(x,-.307,z),.006,.005,iron,1,8,(math.pi/2,0,0))
for x in [-.28,.28]:
    cylinder('Footrest bracket',(x,-.30,.155),.025,.045,iron,1,12,(0,math.pi/2,0))
cylinder('Footrest',(0,-.322,.155),.014,.56,iron,1,12,(0,math.pi/2,0))
for x in [-.30,.30]:
    for y in [-.27,.27]:cylinder('Rubber foot',(x,y,.014),.027,.028,black,0,12)
for z in [.30,.33,.36]:box('Vent slot',(.376,.18,z),(.005,.16,.012),black,0,bevel=.004)
# Pine branch is a tiny original geometry motif, no extra bitmap or decals.
for sign in [-1,1]:
    x=sign*.374
    beam('Pine stem',(x,.19,1.07),(x,-.03,1.45),.006,ochre)
    for i in range(7):
        t=i/7;y=.19-.22*t;z=1.07+.38*t
        beam('Pine needle',(x,y,z),(x,y-.055,z+.065),.004,ochre)
        beam('Pine needle',(x,y,z),(x,y+.04,z+.09),.004,ochre)
cylinder('Joystick base',(-.27,-.30,.967),.045,.008,iron,0,16)
cylinder('Joystick shaft',(-.27,-.30,1.009),.009,.075,iron,1,12)
bpy.ops.mesh.primitive_uv_sphere_add(segments=12,ring_count=8,radius=.032,location=(-.27,-.30,1.059));joystick=bpy.context.object;joystick.name='Joystick';joystick.data.materials.append(green);uv_map(joystick)
shaft=bpy.data.objects.get('Joystick shaft')
bpy.ops.object.select_all(action='DESELECT');shaft.select_set(True);joystick.select_set(True);bpy.context.view_layer.objects.active=joystick;bpy.ops.object.join();joystick.name='Joystick'
bpy.context.scene.cursor.location=(-.27,-.30,.967);bpy.ops.object.origin_set(type='ORIGIN_CURSOR')
# Quantization can recenter mesh nodes. A semantic parent preserves the real mechanism pivot.
joystick.name='JoystickHandle'
pivot=bpy.data.objects.new('Joystick',None);bpy.context.collection.objects.link(pivot);pivot.location=(-.27,-.30,.967)
bpy.context.view_layer.update();world=joystick.matrix_world.copy();joystick.parent=pivot;joystick.matrix_world=world
for name,x,mat in [('ButtonNew',.14,cream),('ButtonScores',.25,red)]:
    cylinder(name+' bezel',(x,-.30,.964),.029,.010,iron,1,16)
    cylinder(name,(x,-.30,.975),.024,.014,mat,0,16)
# Join static parts only; the four functional nodes must retain their names.
dynamic={'Screen','JoystickHandle','ButtonNew','ButtonScores'}
bpy.ops.object.select_all(action='DESELECT')
statics=[o for o in bpy.context.scene.objects if o.type=='MESH' and o.name not in dynamic]
for o in statics:o.select_set(True)
bpy.context.view_layer.objects.active=statics[0];bpy.ops.object.join();bpy.context.object.name='Cabinet'
bpy.ops.wm.save_as_mainfile(filepath=str(OUT/'Arcade2048.blend'))
bpy.ops.object.select_all(action='SELECT')
bpy.ops.export_scene.gltf(filepath=str(OUT/'Arcade2048-raw.glb'),export_format='GLB',export_apply=True,export_yup=True)
(OUT/'contract.json').write_text(json.dumps({'height':1.92,'width':.76,'depth':.72,'trianglesMax':10000,'bytesMax':400000,'screenUvOrigin':'top-left','runtimeNodes':['ButtonNew','ButtonScores','Joystick','Screen'],'joystickPivotGltf':[-.27,.967,.30],'materialProfile':'accepted timber/iron trim + green enamel'},indent=2))
