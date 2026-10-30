"""Compose unchanged render evidence for the material iteration."""
from pathlib import Path
from PIL import Image, ImageDraw, ImageFont

root=Path(__file__).resolve().parent
lab=root.parent
font=ImageFont.load_default(size=21)
for item in ['lantern','crate']:
    sheet=Image.new('RGB',(1920,690),(242,243,244));draw=ImageDraw.Draw(sheet)
    inputs=[(lab/item/'reference/three-quarter.png','QUATERNIUS REFERENCE'),
            (root/'before'/item/'three-quarter.png','PREVIOUS COLOR-ONLY PASS'),
            (lab/item/'final/qa/three-quarter.png','NEW PBR TRIM PASS')]
    for column,(path,label) in enumerate(inputs):
        with Image.open(path) as image:sheet.paste(image.convert('RGB'),(column*640,50))
        draw.text((column*640+16,15),label,fill=(25,30,35),font=font)
    sheet.save(root/f'{item}-surface-comparison.webp',quality=92)
    region=(185,65,480,290) if item=='lantern' else (250,160,400,325)
    detail=Image.new('RGB',(1500,470),(242,243,244));dd=ImageDraw.Draw(detail)
    for column,(path,label) in enumerate(inputs):
        with Image.open(path) as image:
            crop=image.convert('RGB').crop(region)
            scale=min(480/crop.width,410/crop.height)
            crop=crop.resize((round(crop.width*scale),round(crop.height*scale)),Image.Resampling.LANCZOS)
            detail.paste(crop,(column*500+(500-crop.width)//2,52))
        dd.text((column*500+12,15),label,fill=(25,30,35),font=ImageFont.load_default(size=17))
    detail.save(root/f'{item}-metal-detail.webp',quality=94)
    sweep=Image.new('RGB',(1280,1380),(242,243,244));draw=ImageDraw.Draw(sweep)
    for row,angle in enumerate([0,90]):
        for column,who in enumerate(['reference','candidate']):
            path=(lab/item/'reference/three-quarter.png' if who=='reference' else lab/item/'final/qa/three-quarter.png') if angle==0 else root/'light-sweep'/f'{item}-{who}'/'three-quarter.png'
            with Image.open(path) as image:sweep.paste(image.convert('RGB'),(column*640,row*690+50))
            draw.text((column*640+15,row*690+15),f'{who.upper()} · KEY LIGHT {angle}°',fill=(25,30,35),font=font)
    sweep.save(root/f'{item}-light-sweep.webp',quality=90)
ablation=Image.new('RGB',(1920,1380),(242,243,244));draw=ImageDraw.Draw(ablation)
cases=[(lab/'lantern/reference/three-quarter.png','ORIGINAL FULL MATERIAL'),
       (root/'ablation/no-normal/qa/three-quarter.png','ONLY NORMAL MAP REMOVED'),
       (root/'ablation/constant-reflection/qa/three-quarter.png','REFLECTION MAP MADE CONSTANT'),
       (root/'ablation/flat-base-color/qa/three-quarter.png','BASE COLOR MADE CONSTANT'),
       (root/'ablation/old-flat-material/qa/three-quarter.png','PREVIOUS FLAT MATERIAL SETTINGS')]
for index,(path,label) in enumerate(cases):
    x=(index%3)*640;y=(index//3)*690
    with Image.open(path) as image:ablation.paste(image.convert('RGB'),(x,y+50))
    draw.text((x+12,y+15),label,fill=(25,30,35),font=ImageFont.load_default(size=19))
ablation.save(root/'original-layer-ablation.webp',quality=90)
