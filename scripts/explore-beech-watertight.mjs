// Deterministic, editable experimental beech model. See docs/art-direction/trees.
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
const wood=[],cards=[];
// One smoothly tapered tube per limb avoids the visible seams of joined cones.
function limb(points,radii,radial=9,steps=16){
 const curve=new THREE.CatmullRomCurve3(points.map(p=>new THREE.Vector3(...p)),false,'centripetal');const position=[],colors=[],uv=[],index=[];
 for(let i=0;i<=steps;i++){
 const t=i/steps,p=curve.getPoint(t),tan=curve.getTangent(t).normalize(),help=Math.abs(tan.y)>.95?new THREE.Vector3(1,0,0):new THREE.Vector3(0,1,0),u=new THREE.Vector3().crossVectors(tan,help).normalize(),v=new THREE.Vector3().crossVectors(tan,u).normalize();
 const q=t*(radii.length-1),k=Math.min(Math.floor(q),radii.length-2),r=THREE.MathUtils.lerp(radii[k],radii[k+1],q-k);
 for(let j=0;j<radial;j++){
 const angle=j/radial*Math.PI*2,n=u.clone().multiplyScalar(Math.cos(angle)).addScaledVector(v,Math.sin(angle)),w=1+.04*Math.sin(angle*3+1);const pt=p.clone().addScaledVector(n,r*w);
 position.push(...pt.toArray());colors.push(.9,.9,.9);uv.push(j/radial,t*curve.getLength()*.65);
 if(i<steps){let a=i*radial+j,b=i*radial+(j+1)%radial,c=(i+1)*radial+j,d=(i+1)*radial+(j+1)%radial;index.push(a,b,c,c,b,d)}
 }
 }
 const start=position.length/3;position.push(...curve.getPoint(0).toArray());colors.push(.9,.9,.9);uv.push(.5,0);
 const end=position.length/3;position.push(...curve.getPoint(1).toArray());colors.push(.9,.9,.9);uv.push(.5,1);
 for(let j=0;j<radial;j++){let n=(j+1)%radial;index.push(start,n,j);index.push(end,steps*radial+j,steps*radial+n)}
 const g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.Float32BufferAttribute(position,3));g.setAttribute('color',new THREE.Float32BufferAttribute(colors,3));g.setAttribute('uv',new THREE.Float32BufferAttribute(uv,2));g.setIndex(index);g.computeVertexNormals();wood.push(g);
}
limb([[0,0,0],[.06,1,.03],[-.05,2,.02],[-.23,3.1,.1],[-.18,4.25,.05],[.05,5.7,0],[.27,7.0,.1]],[.48,.38,.30,.24,.17,.09,.015],10,20);
const branches=[
 [[[ -.13,2.8,.06],[-.55,3.5,.04],[-1.2,4.25,.10],[-1.95,4.9,.3]],[.19,.14,.08,.012]],
 [[[-.2,3.5,.04],[.35,4.0,.15],[1,4.7,.38],[1.8,5.2,.55]],[.18,.13,.07,.012]],
 [[[-.12,4.05,.04],[-.25,4.75,.55],[-.45,5.35,1.25],[-.6,5.85,1.8]],[.15,.11,.06,.01]],
 [[[-.05,4.6,0],[.35,5,-.6],[.65,5.65,-1.3],[.9,6,-1.65]],[.14,.10,.06,.01]],
 [[[-.05,4.8,.04],[-.6,5.4,-.2],[-1.3,6,-.6],[-1.7,6.4,-.9]],[.13,.09,.05,.01]],
 [[[.08,5.5,.08],[.5,6.1,.38],[1.1,6.6,.8],[1.6,6.85,1.1]],[.10,.07,.04,.01]]];
for(const [p,r] of branches)limb(p,r,7,10);
let seed=1234567; const rand=()=>{seed=(1664525*seed+1013904223)>>>0;return seed/4294967296};
const lobes=[[-2.0,5.2,.3],[-1.4,5.9,.1],[-1.6,6.25,-1.1],[2.0,5.4,.4],[1.3,6,.35],[1.5,6.4,1.1],[-.45,5.7,1.7],[.6,5.9,-1.7],[0,6.5,-.5],[-.8,7,.6],[.7,7.0,.35],[0,7.3,-.15]];
// Slightly bent cards replace rigid planes. Mixed inclinations preserve the canopy from low and high cameras.
for(const [x,y,z] of lobes) for(let j=0;j<30;j++){
  const g=new THREE.PlaneGeometry(1.5,1.3,2,2);
  const pos=g.getAttribute('position');for(let i=0;i<pos.count;i++){const px=pos.getX(i)/.75,py=pos.getY(i)/.65;pos.setZ(i,.20*(1-px*px)*(1-py*py));}g.computeVertexNormals();
  g.rotateX(-(.35+rand()*.9));g.rotateZ(rand()*Math.PI*2);g.rotateY(rand()*Math.PI*2);
  g.translate(x+(rand()-.5)*1.3,y+(rand()-.5)*1.1,z+(rand()-.5)*1.3);cards.push(g);
}
const group=new THREE.Group();group.name='Cincis_Beech_Prototype';
const bark=new THREE.MeshStandardMaterial({name:'Beech bark',color:'#ffffff',vertexColors:true,roughness:1});const foliage=new THREE.MeshStandardMaterial({name:'Beech foliage cards',color:'#ffffff',roughness:1,side:THREE.DoubleSide});
for(const [name,parts,material] of [['Trunk and branches',wood,bark],['Foliage',cards,foliage]]){const mesh=new THREE.Mesh(mergeGeometries(parts),material);mesh.name=name;group.add(mesh)}
const binary=await new Promise((resolve,reject)=>new GLTFExporter().parse(group,resolve,reject,{binary:true}));
const io=new NodeIO();const doc=await io.readBinary(new Uint8Array(binary));
// Resize the original generated transparent art for GPU use; retain the original as source.
const image=await sharp(await readFile('docs/art-direction/trees/beech-leaf-spray-generated.png')).resize({width:512,height:512,fit:'contain',background:{r:0,g:0,b:0,alpha:0}}).png({palette:true,colours:256,dither:.5}).toBuffer();
const texture=doc.createTexture('Original beech foliage').setImage(new Uint8Array(image)).setMimeType('image/png');
const barkImage=await sharp(await readFile('docs/art-direction/trees/beech-bark-generated.png')).resize(256,256).jpeg({quality:80}).toBuffer();
const barkTexture=doc.createTexture('Beech bark').setImage(new Uint8Array(barkImage)).setMimeType('image/jpeg');
doc.getRoot().listMaterials().find(m=>m.getName()==='Beech bark').setBaseColorTexture(barkTexture);
const material=doc.getRoot().listMaterials().find(m=>m.getName()==='Beech foliage cards');material.setBaseColorTexture(texture).setAlphaMode('MASK').setAlphaCutoff(.38).setDoubleSided(true);
const result=await io.writeBinary(doc);await writeFile(process.argv[2] ?? 'docs/art-direction/trees/beech-watertight-intermediate.glb',result);console.log('Saved beech prototype',result.byteLength,'bytes');
