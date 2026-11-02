"""Curate immutable style-only boards from actual CC0 reference renders, never candidate meshes."""
import argparse,hashlib,json
from pathlib import Path
from PIL import Image,ImageDraw,ImageFont,ImageOps
p=argparse.ArgumentParser();p.add_argument('--crate',type=Path,required=True);p.add_argument('--lantern',type=Path,required=True);p.add_argument('--output',type=Path);p.add_argument('--version',type=int,default=1);a=p.parse_args()
out=a.output or Path(__file__).parent/'references/v1'
if out.exists() and any(out.iterdir()):raise FileExistsError('Reference kits are immutable: select a new --output/--version, never overwrite v1')
out.mkdir(parents=True,exist_ok=True)
try:font=ImageFont.truetype('/System/Library/Fonts/Helvetica.ttc',22)
except OSError:font=ImageFont.load_default()
bg='#e6e6e6'
def board(title,tiles,name):
 image=Image.new('RGB',(1024,640),bg);draw=ImageDraw.Draw(image);draw.text((20,14),title,font=font,fill='#222222')
 w=1024//len(tiles)
 for i,(file,label,crop)in enumerate(tiles):
  source=Image.open(file).convert('RGB')
  if crop:source=source.crop(tuple(int(v*s) for v,s in zip(crop,[source.width,source.height]*2)))
  fitted=ImageOps.contain(source,(w-24,540));image.paste(fitted,(i*w+(w-fitted.width)//2,68+(540-fitted.height)//2));draw.text((i*w+14,606),label,font=font,fill='#222222')
 image.save(out/name)
board('LA BARAJ STYLE v1 — FINISH / SHAPE LANGUAGE ONLY',[(a.crate/'three-quarter.png','Timber and iron family',None),(a.lantern/'three-quarter.png','Chunky metal / fine surface finish',None)],'01-family.png')
board('MATERIAL DETAIL — retain grain, edge wear and moving highlights',[(a.crate/'three-quarter.png','Wood grain and exposed end grain',(.18,.22,.83,.85)),(a.lantern/'three-quarter.png','Iron bevels and restrained wear',(.21,.08,.82,.51))],'02-materials.png')
board('CONSTRUCTION CONTRAST — closed joints, inset boards, frame contact',[(a.crate/'side.png','Dark plank joints / no bright slits',(.18,.20,.82,.84)),(a.crate/'three-quarter.png','Depth at corners and under rails',(.18,.25,.82,.87))],'03-contact.png')
rows=[]
for file,role in [('01-family.png','overall style only; never copy the shown object silhouettes'),('02-materials.png','wood/iron finish and edge treatment only'),('03-contact.png','recessed joint contrast and contact shading only')]:rows.append({'file':file,'role':role,'sha256':hashlib.sha256((out/file).read_bytes()).hexdigest()})
manifest={'id':'la-baraj-rustic-props-v1','version':1,'purpose':'Fixed style-only anchors for all new object briefs. Change only as an explicit new kit version.','images':rows,'sources':['Quaternius Fantasy Props MegaKit retained CC0 crate and lantern GLBs; actual normalized Blender renders. No authored reconstruction is used as a style anchor.'],'license':'../../../../experiments/asset-skill-lab/references/LICENSE.txt'}
(out/'manifest.json').write_text(json.dumps(manifest,indent=2)+'\n')
