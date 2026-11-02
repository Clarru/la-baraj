"""Reconstruct and verify rigged wardrobe candidates; never publish a game build."""
import argparse
import os
from pathlib import Path
import shutil
import subprocess

ROOT=Path(__file__).resolve().parents[1]
LOGS=ROOT/"assets/source-models/wardrobe"
STAGES=["foundation","male-base","hats","knit","bottoms","overshirt","shoes","female"]
parser=argparse.ArgumentParser(description=__doc__)
parser.add_argument("--blender",default=shutil.which("blender"))
parser.add_argument("--only",nargs="+",choices=STAGES,default=STAGES)
parser.add_argument("--render",nargs="*",default=[])
args=parser.parse_args()
if not args.blender or not Path(args.blender).is_file():
    parser.error("Pass the discovered Blender executable with --blender")
LOGS.mkdir(parents=True,exist_ok=True)
def blender(script,log,*arguments):
    with (LOGS/log).open("w") as output:
        subprocess.run([args.blender,"--background","--factory-startup","--python",
            str(ROOT/"scripts"/script),*arguments],cwd=ROOT,stdout=output,
            stderr=subprocess.STDOUT,check=True)
    print(f"Completed {script}",flush=True)
blender("bake-wardrobe-fabric.py","fabric-bake.log")
for stage in args.only:
    blender(f"build-wardrobe-{stage}.py",f"{stage}-build.log")
subprocess.run(["node","scripts/optimize-wardrobe.mjs"],cwd=ROOT,check=True)
for item in args.render:
    slot=("full" if item.startswith("female-") else
          "shoes" if item.startswith("shoes-") else
          item.split("-")[0])
    blender("render-wardrobe-item.py",f"{item}-review.log","--",item,slot)
