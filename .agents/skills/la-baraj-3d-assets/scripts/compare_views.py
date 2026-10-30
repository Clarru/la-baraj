"""Create unchanged-render comparison sheets and alpha silhouette measurements."""
import argparse
import json
from pathlib import Path

from PIL import Image, ImageChops, ImageDraw, ImageFont

parser=argparse.ArgumentParser()
parser.add_argument("reference",type=Path)
parser.add_argument("candidate",type=Path)
parser.add_argument("output",type=Path)
args=parser.parse_args()
args.output.mkdir(parents=True,exist_ok=True)
views=["three-quarter","front","side","rear"]
font=ImageFont.load_default(size=22)
sheet=Image.new("RGB",(1280,4*690),(242,243,244))
draw=ImageDraw.Draw(sheet)
scores={}
for row,view in enumerate(views):
    for col,(directory,label) in enumerate([(args.reference,"QUATERNIUS REFERENCE"),(args.candidate,"AUTHORED EXPORTED GLB")]):
        with Image.open(directory/f"{view}.png") as img:sheet.paste(img.convert("RGB"),(col*640,row*690+50))
        draw.text((col*640+18,row*690+14),f"{label} · {view}",fill=(30,35,40),font=font)
    mask_paths=[p/f"{view}-mask.png" for p in [args.reference,args.candidate]]
    if all(p.exists() for p in mask_paths):
        masks=[Image.open(p).getchannel("A").point(lambda v:255 if v>=128 else 0) for p in mask_paths]
        intersection=ImageChops.darker(*masks).histogram()[255]
        union=ImageChops.lighter(*masks).histogram()[255]
        scores[view]=intersection/union if union else 1
sheet.save(args.output/"turnaround-comparison.webp",quality=90)
sheet.crop((0,0,1280,690)).save(args.output/"comparison.webp",quality=92)
preview=Image.new("RGB",(640,215),(242,243,244));d=ImageDraw.Draw(preview)
for col,(directory,label) in enumerate([(args.reference,"REFERENCE"),(args.candidate,"RECONSTRUCTION")]):
    with Image.open(directory/"three-quarter.png") as img:
        img=img.convert("RGB");img.thumbnail((180,180));preview.paste(img,(col*320+70,30))
    d.text((col*320+70,5),label,fill=(30,35,40),font=ImageFont.load_default(size=16))
preview.save(args.output/"small-scale-comparison.webp",quality=92)
(args.output/"silhouettes.json").write_text(json.dumps({"alpha_iou":scores,"meaning":"Fixed-camera silhouette overlap only; not a material, style or full 3D similarity score"},indent=2)+"\n")
print(json.dumps(scores))
