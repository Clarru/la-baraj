// Deterministic, editable experimental oak model. See docs/art-direction/trees.
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { GLTFExporter } from 'three/examples/jsm/exporters/GLTFExporter.js';
import { NodeIO } from '@gltf-transform/core';
import sharp from 'sharp';
import { readFile, writeFile } from 'node:fs/promises';
globalThis.FileReader = class {
  readAsArrayBuffer(blob) { blob.arrayBuffer().then(value => { this.result=value; this.onloadend?.(); }); }
  readAsDataURL(blob) { blob.arrayBuffer().then(value => { this.result=`data:${blob.type};base64,${Buffer.from(value).toString('base64')}`; this.onloadend?.(); }); }
};
const wood=[],cards=[]; const up=new THREE.Vector3(0,1,0);
function limb(a,b,bottom,top){const start=new THREE.Vector3(...a),end=new THREE.Vector3(...b),delta=end.clone().sub(start);const g=new THREE.CylinderGeometry(top,bottom,delta.length(),8);g.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(up,delta.normalize()));g.translate(...start.add(end).multiplyScalar(.5).toArray());wood.push(g);}
limb([0,0,0],[.12,2.45,.04],.43,.29);limb([.12,2.45,.04],[-.05,4.85,.02],.29,.12);limb([-.05,4.85,.02],[.15,6.5,-.05],.12,.035);
// Short tapered roots break the flat cylinder base and ground the silhouette.
for(let i=0;i<6;i++){const a=i*Math.PI/3;limb([Math.cos(a)*.24,.18,Math.sin(a)*.24],[Math.cos(a)*.72,.025,Math.sin(a)*.72],.16,.025)}
const branches=[[[.06,2.3,0],[-1.3,4.1,.1],[-2.45,5,.3]],[[.08,2.7,0],[1.35,4.25,.25],[2.5,5.05,.45]],[[.02,3.1,.05],[-.3,4.55,1.3],[-.55,5.45,2.15]],[[.06,3.35,-.05],[.5,4.8,-1.35],[.85,5.6,-2.1]],[[0,4.2,0],[-1.1,5.7,-.85],[-1.7,6.25,-1.35]],[[0,4.4,0],[1.1,5.7,.8],[1.65,6.5,1.35]]];
for(const [a,b,c] of branches){limb(a,b,.17,.09);limb(b,c,.09,.035)}
let seed=1234567; const rand=()=>{seed=(1664525*seed+1013904223)>>>0;return seed/4294967296};
const lobes=[[-2.1,5,.3],[-1.4,5.8,.1],[-1.6,6.25,-1.1],[2.1,5.25,.4],[1.3,5.85,.35],[1.5,6.4,1.1],[-.45,5.5,1.7],[.6,5.9,-1.7],[0,6.6,-.5],[-.8,7,.6],[.7,7.1,.35],[0,7.5,-.15]];
for(const [x,y,z] of lobes) for(let j=0;j<6;j++){const g=new THREE.PlaneGeometry(2.15,1.85);g.rotateX(-.3-rand()*.9);g.rotateY(rand()*Math.PI*2);g.rotateZ((rand()-.5)*.55);g.translate(x+(rand()-.5)*.7,y+(rand()-.5)*.6,z+(rand()-.5)*.7);cards.push(g)}
const group=new THREE.Group();group.name='Cincis_Oak_Prototype';
const bark=new THREE.MeshStandardMaterial({name:'Oak bark',color:'#746147',roughness:1});const foliage=new THREE.MeshStandardMaterial({name:'Oak foliage cards',color:'#ffffff',roughness:1,side:THREE.DoubleSide});
for(const [name,parts,material] of [['Trunk and branches',wood,bark],['Foliage',cards,foliage]]){const mesh=new THREE.Mesh(mergeGeometries(parts),material);mesh.name=name;group.add(mesh)}
const binary=await new Promise((resolve,reject)=>new GLTFExporter().parse(group,resolve,reject,{binary:true}));
const io=new NodeIO();const doc=await io.readBinary(new Uint8Array(binary));
// Resize the original generated transparent art for GPU use; retain the original as source.
const image=await sharp(await readFile('docs/art-direction/trees/oak-foliage-generated.png')).resize({width:512,height:512,fit:'contain',background:{r:0,g:0,b:0,alpha:0}}).png().toBuffer();
const texture=doc.createTexture('Original oak foliage').setImage(new Uint8Array(image)).setMimeType('image/png');
const material=doc.getRoot().listMaterials().find(m=>m.getName()==='Oak foliage cards');material.setBaseColorTexture(texture).setAlphaMode('MASK').setAlphaCutoff(.38).setDoubleSided(true);
const result=await io.writeBinary(doc);await writeFile('docs/art-direction/trees/cincis-oak-prototype.glb',result);console.log('Saved oak prototype',result.byteLength,'bytes');
