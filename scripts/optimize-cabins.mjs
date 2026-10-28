import {NodeIO} from '@gltf-transform/core';
import {ALL_EXTENSIONS} from '@gltf-transform/extensions';
import {dedup,prune,textureCompress,getBounds} from '@gltf-transform/functions';
import sharp from 'sharp';
import fs from 'node:fs/promises';
const io=new NodeIO().registerExtensions(ALL_EXTENSIONS), records=[];
const only=process.argv[2];
for(const name of ['Gable','AFrame','Sage','GableBlue','AFrameCopper','SagePergola']){
 const id='Lake_Cabin_'+name;
 if(only && (only==='variants'?['Gable','AFrame','Sage'].includes(name):only!==name)){const existing=JSON.parse(await fs.readFile('apps/web/public/assets/cabin-library.json','utf8'));records.push(existing.models.find(m=>m.id===id));continue;}
 const doc=await io.read('assets/house-source/'+id+'.glb');
 for(const material of doc.getRoot().listMaterials()){
   const n=material.getName();let color;
   if(n.startsWith('Honey timber ')){const i=Number(n.slice(-1));color=[.40+i*.022,.22+i*.014,.105+i*.008];}
   if(n.startsWith('Sage boards ')){const i=Number(n.slice(-1));color=[.29+i*.018,.34+i*.018,.25+i*.014];}
   if(n.startsWith('Blue siding ')){const i=Number(n.slice(-1));color=[.12+i*.012,.19+i*.012,.23+i*.012];}
   if(n.startsWith('Cream siding ')){const i=Number(n.slice(-1));color=[.57+i*.018,.55+i*.017,.47+i*.015];}
   if(n==='Warm structural timber')color=[.34,.18,.075];
   if(color)material.setBaseColorFactor([...color,1]);
   if(n==='Loft blue gray glazing')material.setAlphaMode('BLEND').setBaseColorFactor([.075,.18,.22,.86]).setDoubleSided(true);
   if(n==='Blue gray glass')material.setAlphaMode('BLEND').setBaseColorFactor([.12,.22,.25,.24]).setDoubleSided(true);
 }
 await doc.transform(dedup(),prune(),textureCompress({encoder:sharp,targetFormat:'webp',resize:[512,512]}));
 const out='apps/web/public/assets/optimized/'+id+'.glb';await io.write(out,doc);
 const record={id,bytes:(await fs.stat(out)).size,bounds:getBounds(doc.getRoot().getDefaultScene()),source:'Original Blender mesh reconstructed from docs/art-direction/'+(['Gable','AFrame','Sage'].includes(name)?'cabin-reference-grid.png':'cabin-variants-grid.png')+'; only the reference was generated with built-in image_gen',geometry:'Fixed architectural archetype; no random roof deformation'};
 records.push(record);
}
await fs.writeFile('apps/web/public/assets/cabin-library.json',JSON.stringify({reference:'docs/art-direction/cabin-reference-grid.png',variantReference:'docs/art-direction/cabin-variants-grid.png',models:records},null,2));
console.log(records);
