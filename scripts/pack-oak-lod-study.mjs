import {NodeIO} from '@gltf-transform/core';
import {mergeDocuments,unpartition,prune} from '@gltf-transform/functions';
const io=new NodeIO();const near=await io.read('docs/art-direction/trees/cincis-oak-v3.glb');const mid=await io.read('docs/art-direction/trees/cincis-oak-mid-study.glb');
const nearScene=near.getRoot().listScenes()[0];const nearRoot=nearScene.listChildren()[0];nearRoot.setName('Oak_Near');
const map=mergeDocuments(near,mid);const midScene=map.get(mid.getRoot().listScenes()[0]);const midRoot=midScene.listChildren()[0];midRoot.setName('Oak_Mid');nearScene.addChild(midRoot);midScene.dispose();
const materials=new Map(nearRoot.listChildren().flatMap(n=>n.getMesh()?.listPrimitives()??[]).map(p=>[p.getMaterial().getName(),p.getMaterial()]));
for(const node of midRoot.listChildren())for(const p of node.getMesh()?.listPrimitives()??[]){const shared=materials.get(p.getMaterial().getName());if(!shared)throw new Error('Missing shared material');p.setMaterial(shared)}
await near.transform(prune(),unpartition());
await io.write('docs/art-direction/trees/cincis-oak-packed-lod-study.glb',near);
console.log('materials',near.getRoot().listMaterials().length,'textures',near.getRoot().listTextures().length,'scenes',near.getRoot().listScenes().length);
