import {NodeIO} from '@gltf-transform/core';
import {ALL_EXTENSIONS} from '@gltf-transform/extensions';
import {dedup,prune,textureCompress,getBounds} from '@gltf-transform/functions';
import sharp from 'sharp';
import fs from 'node:fs/promises';
const io=new NodeIO().registerExtensions(ALL_EXTENSIONS),records=[];
for(const name of ['Timber','AFrame','Sage']){
 const id='Lake_Interior_'+name,doc=await io.read('assets/interior-source/'+id+'.glb');
 for(const material of doc.getRoot().listMaterials()){
  const n=material.getName();let color;
  if(n.startsWith('Honey timber ')){const i=Number(n.slice(-1));color=[.40+i*.022,.22+i*.014,.105+i*.008];}
  if(n==='Warm structural timber')color=[.34,.18,.075];
  if(color)material.setBaseColorFactor([...color,1]);
 }
 await doc.transform(dedup(),prune(),textureCompress({encoder:sharp,targetFormat:'webp',resize:[512,512]}));
 const out='apps/web/public/assets/optimized/'+id+'.glb';await io.write(out,doc);
 records.push({id,bytes:(await fs.stat(out)).size,bounds:getBounds(doc.getRoot().getDefaultScene()),source:'Original Blender mesh following docs/art-direction/interiors/interior-reference-grid.png; reference generated with built-in image_gen'});
}
await fs.writeFile('apps/web/public/assets/interior-library.json',JSON.stringify({models:records},null,2));console.log(records);
