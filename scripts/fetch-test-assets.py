#!/usr/bin/env python3
"""Fetch a small provenance-tracked subset of CC0 Quaternius models for the test."""
import concurrent.futures,hashlib,json,subprocess,urllib.parse
from pathlib import Path
ROOT=Path(__file__).resolve().parents[1]
OUT=ROOT/'assets/source-models'
OUT.mkdir(parents=True,exist_ok=True)
REPO='agentkaerf/FreeModels'
def fetch_url(url):
 p=subprocess.run(['curl','--fail','--silent','--show-error','--location','--max-time','40',url],capture_output=True)
 if p.returncode:raise RuntimeError(p.stderr.decode())
 return p.stdout
commit=json.loads(fetch_url('https://api.github.com/repos/'+REPO+'/commits/main'))['sha']
def fetch(path):return fetch_url('https://raw.githubusercontent.com/'+REPO+'/'+commit+'/'+urllib.parse.quote(path,safe='/'))
packs={
 'nature':('Stylized Nature MegaKit[Standard]/glTF/','Stylized Nature MegaKit[Standard]/License_Standard.txt','https://quaternius.com/packs/stylizednaturemegakit.html'),
 'village':('Medieval Village MegaKit[Standard]/glTF/','Medieval Village MegaKit[Standard]/License_Standard.txt','https://quaternius.com/packs/medievalvillagemegakit.html'),
 'props':('Fantasy Props MegaKit[Standard]/Exports/glTF/','Fantasy Props MegaKit[Standard]/License_Standard.txt','https://quaternius.com/packs/fantasypropsmegakit.html'),
 'character':('Ultimate Modular Men- Feb 2022/Individual Characters/glTF/','Ultimate Modular Men- Feb 2022/License.txt','https://quaternius.com')}
choices={
 'nature':['CommonTree_1','CommonTree_3','Pine_2','Pine_4','Bush_Common','Fern_1','Grass_Common_Short','Flower_3_Group','Rock_Medium_1','Rock_Medium_2','Pebble_Round_1','DeadTree_1'],
 'village':['Roof_RoundTiles_4x6','Floor_WoodDark','Prop_WoodenFence_Single','Door_4_Flat','Window_Wide_Flat1'],
 'props':['Bench','Table_Large','Lantern_Wall','Barrel','Crate_Wooden'],
 'character':['Casual_Hoodie']}
licenses={}
for key,(_,license_path,origin) in packs.items():
 data=fetch(license_path)
 if b'CC0' not in data and b'public domain' not in data.lower():raise RuntimeError('License requires review: '+key)
 dest=ROOT/'third_party'/('quaternius-'+key+'-LICENSE.txt');dest.write_bytes(data)
 licenses[key]={'origin':origin,'license':'CC0-1.0','license_file':str(dest.relative_to(ROOT)),'mirror':REPO,'commit':commit}
 print('License',key,data.decode()[:140],flush=True)
manifest=[]
def model(task):
 key,name=task;prefix=packs[key][0];folder=OUT/key;folder.mkdir(exist_ok=True)
 source=prefix+name+'.gltf';data=fetch(source);doc=json.loads(data)
 files=[(name+'.gltf',data)]
 for field in ['buffers','images']:
  for item in doc.get(field,[]):
   uri=item.get('uri','')
   if uri and not uri.startswith('data:'):
    if '..' in Path(uri).parts:raise RuntimeError('External URI needs review '+uri)
    files.append((uri,fetch(prefix+uri)))
 for filename,content in files:
  target=folder/filename;target.parent.mkdir(parents=True,exist_ok=True);target.write_bytes(content)
 return {'id':name,'pack':key,'url':'/assets/models/'+key+'/'+name+'.gltf','source_path':source,'bytes':sum(len(c) for _,c in files),'sha256':hashlib.sha256(data).hexdigest(),'animations':[a.get('name','') for a in doc.get('animations',[])],'files':[f for f,_ in files]}
with concurrent.futures.ThreadPoolExecutor(max_workers=8) as pool:
 for item in pool.map(model,[(key,name) for key,names in choices.items() for name in names]):
  manifest.append(item);print('Downloaded',item['id'],item['bytes'],len(item['animations']),'animations',flush=True)
(ROOT/'apps/web/public/assets/source-manifest.json').write_text(json.dumps({'author':'Quaternius','packs':licenses,'models':manifest},indent=2)+'\n')
print('Unique downloaded bytes',sum(p.stat().st_size for p in OUT.rglob('*') if p.is_file()),flush=True)
