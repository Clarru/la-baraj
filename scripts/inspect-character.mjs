import fs from 'node:fs';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import * as THREE from 'three';
const bytes=fs.readFileSync('apps/web/public/assets/optimized/Lakeside_Man.glb');
const size=bytes.readUInt32LE(12), doc=JSON.parse(bytes.subarray(20,20+size));
doc.materials=[];doc.textures=[];doc.images=[];doc.extensionsRequired=[];
for(const mesh of doc.meshes)for(const p of mesh.primitives)delete p.material;
const json=Buffer.from(JSON.stringify(doc));const pad=Buffer.alloc((4-json.length%4)%4,32);const data=Buffer.concat([json,pad]);const binary=bytes.subarray(20+size);const out=Buffer.alloc(20);out.writeUInt32LE(0x46546c67,0);out.writeUInt32LE(2,4);out.writeUInt32LE(20+data.length+binary.length,8);out.writeUInt32LE(data.length,12);out.writeUInt32LE(0x4e4f534a,16);const glb=Buffer.concat([out,data,binary]);
const loaded=await new GLTFLoader().parseAsync(glb.buffer.slice(glb.byteOffset,glb.byteOffset+glb.byteLength),'');
const mixer=new THREE.AnimationMixer(loaded.scene);
for(const name of ['Idle_Neutral','Walk','Run']){
 mixer.stopAllAction();const clip=loaded.animations.find(c=>c.name===name);mixer.clipAction(clip).play();
 for(const t of [0,.3,.7,1]){mixer.setTime(t);loaded.scene.updateMatrixWorld(true);loaded.scene.traverse(o=>{if(o.isSkinnedMesh){o.skeleton.update();o.computeBoundingBox();}});const box=new THREE.Box3().setFromObject(loaded.scene);console.log(name,t,box.min.toArray(),box.max.toArray());}
}
