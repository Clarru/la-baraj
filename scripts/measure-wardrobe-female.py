"""Measure canonical-rebound female body before fitting the reference outfit."""
import bpy
import json
import sys
from pathlib import Path
ROOT=Path(__file__).resolve().parents[1]
sys.path.insert(0,str(ROOT/"scripts"))
from wardrobe_rig import RAW,approved_rig,import_model,rebind,remove_source_rig
rig,approved=approved_rig()
female_rig,meshes=import_model(next((RAW/"base/extracted").rglob("Superhero_Female_FullBody.gltf")))
body=max(meshes,key=lambda o:len(o.data.vertices))
rebind(body,female_rig,rig)
remove_source_rig(female_rig)
sections=[]
for z in [.05,.12,.25,.40,.55,.70,.78,.85,.95,1.0,1.1,1.2,1.3,1.4,1.45,1.48,1.52,1.55,1.6,1.7,1.8]:
    vs=[v.co for v in body.data.vertices if abs(v.co.z-z)<.018 and abs(v.co.x)<.28]
    if vs:
        sections.append({"z":z,"count":len(vs),"min":[min(v[i] for v in vs) for i in range(3)],
                         "max":[max(v[i] for v in vs) for i in range(3)]})
result={"body":body.name,"vertices":len(body.data.vertices),"materials":[m.name for m in body.data.materials],
        "sections":sections}
(ROOT/"docs/characters/wardrobe/female-measurements.json").write_text(json.dumps(result,indent=2)+"\n")
bpy.ops.wm.save_as_mainfile(filepath=str(RAW/"female-canonical-source.blend"))
print(json.dumps(result))
