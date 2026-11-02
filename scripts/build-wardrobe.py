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
        subprocess.run([args.blender,"--background","--disable-autoexec","--factory-startup","--python-exit-code","1","--python",
            str(ROOT/"scripts"/script),*arguments],cwd=ROOT,stdout=output,
            stderr=subprocess.STDOUT,check=True)
    print(f"Completed {script}",flush=True)
blender("bake-wardrobe-fabric.py","fabric-bake.log")
touched=set()
build_dir=LOGS/"build"
for stage in args.only:
    before={p.name:p.stat().st_mtime_ns for p in build_dir.glob("*.glb")}
    blender(f"build-wardrobe-{stage}.py",f"{stage}-build.log")
    touched.update(p.stem for p in build_dir.glob("*.glb")
        if before.get(p.name)!=p.stat().st_mtime_ns)
if not touched:
    raise RuntimeError("Selected authoring stages produced no exports")
# Ignored source caches may contain unrelated experiments. Optimize only what
# these stages actually wrote; partial reconstruction must not repack them.
subprocess.run(["node","scripts/optimize-wardrobe.mjs","--only",*sorted(touched)],cwd=ROOT,check=True)
for item in args.render:
    slot=("full" if item.startswith("female-") else
          "shoes" if item.startswith("shoes-") else
          item.split("-")[0])
    blender("render-wardrobe-item.py",f"{item}-review.log","--",item,slot)
