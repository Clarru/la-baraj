"""Keep concept and real exported views visibly distinct; never score unmatched cameras."""
import argparse
from pathlib import Path
from PIL import Image, ImageDraw, ImageFont

parser = argparse.ArgumentParser()
parser.add_argument('concept', type=Path)
parser.add_argument('candidate', type=Path)
parser.add_argument('output', type=Path)
args = parser.parse_args()
args.output.mkdir(parents=True, exist_ok=True)
edge, header = 512, 70
sheet = Image.new('RGB', (edge * 4, edge * 2 + header), '#f2f3f4')
draw = ImageDraw.Draw(sheet)
font = ImageFont.load_default(size=24)
draw.text((20, 12), 'IMAGEGEN CONCEPT — design guidance', fill='#202830', font=font)
draw.text((edge * 2 + 20, 12), 'ACTUAL EXPORTED GLB — front / side / rear / 3Q', fill='#202830', font=font)
draw.text((20, 43), 'Cameras differ. No numerical similarity claim.', fill='#555555', font=ImageFont.load_default(size=18))
with Image.open(args.concept) as img:
    img = img.convert('RGB')
    img.thumbnail((edge * 2, edge * 2))
    sheet.paste(img, ((edge * 2 - img.width) // 2, header + (edge * 2 - img.height) // 2))
for i, view in enumerate(['front', 'side', 'rear', 'three-quarter']):
    with Image.open(args.candidate / f'{view}.png') as img:
        img = img.convert('RGB').resize((edge, edge))
        sheet.paste(img, (edge * 2 + (i % 2) * edge, header + (i // 2) * edge))
sheet.save(args.output / 'concept-comparison.webp', quality=92)
