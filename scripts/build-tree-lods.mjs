import {NodeIO} from '@gltf-transform/core';
import {ALL_EXTENSIONS} from '@gltf-transform/extensions';
import {simplify,textureCompress,dedup,prune} from '@gltf-transform/functions';
import {MeshoptSimplifier} from 'meshoptimizer';
import sharp from 'sharp';
const io=new NodeIO().registerExtensions(ALL_EXTENSIONS);
await MeshoptSimplifier.ready;
for(const id of ['CommonTree_1','CommonTree_3','Pine_2','Pine_4']){
 const doc=await io.read(`apps/web/public/assets/optimized/${id}.glb`);
 await doc.transform(simplify({simplifier:MeshoptSimplifier,ratio:0.18,error:0.03}),dedup(),prune(),textureCompress({encoder:sharp,targetFormat:'webp',resize:[256,256]}));
 await io.write(`apps/web/public/assets/optimized/${id}_LOD.glb`,doc);
 console.log('LOD',id,doc.getRoot().listMeshes().reduce((s,m)=>s+m.listPrimitives().reduce((t,p)=>t+(p.getIndices()?.getCount()||0)/3,0),0));
}
