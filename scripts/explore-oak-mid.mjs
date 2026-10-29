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
const wood=[],cards=[];
// One smoothly tapered tube per limb avoids the visible seams of joined cones.
function limb(points, radii, radial=9, steps=16) {
  const curve = new THREE.CatmullRomCurve3(points.map(p=>new THREE.Vector3(...p)),false,'centripetal');
  const position=[], normal=[], colors=[], uv=[], index=[];
  for(let i=0;i<=steps;i++){
    const t=i/steps, point=curve.getPoint(t), tangent=curve.getTangent(t).normalize();
    const helper=Math.abs(tangent.y)>.95?new THREE.Vector3(1,0,0):new THREE.Vector3(0,1,0);
    const u=new THREE.Vector3().crossVectors(tangent,helper).normalize(), v=new THREE.Vector3().crossVectors(tangent,u).normalize();
    const q=t*(radii.length-1), k=Math.min(Math.floor(q),radii.length-2), r=THREE.MathUtils.lerp(radii[k],radii[k+1],q-k);
    for(let j=0;j<=radial;j++){
      const a=j/radial*Math.PI*2, wobble=1+.10*Math.sin(a*3+1)+.035*Math.sin(a*5+t*9);
      const n=u.clone().multiplyScalar(Math.cos(a)).addScaledVector(v,Math.sin(a)).normalize();
      const p=point.clone().addScaledVector(n,r*wobble);position.push(...p.toArray());normal.push(...n.toArray());uv.push(j/radial,t*curve.getLength()*.65);
      const shade=.80+.15*Math.sin(a*5+Math.sin(t*5))+.06*Math.sin(a*9+t*8);
      const col=new THREE.Color('#ffffff').multiplyScalar(shade);colors.push(col.r,col.g,col.b);
      if(i<steps&&j<radial){const n0=i*(radial+1)+j,n1=n0+radial+1;index.push(n0,n0+1,n1,n1,n0+1,n1+1)}
    }
  }
  const g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.Float32BufferAttribute(position,3));g.setAttribute('normal',new THREE.Float32BufferAttribute(normal,3));g.setAttribute('color',new THREE.Float32BufferAttribute(colors,3));g.setAttribute('uv',new THREE.Float32BufferAttribute(uv,2));g.setIndex(index);wood.push(g);
}
limb([[0,0,0],[.05,1.1,.03],[.12,2.35,.04],[-.08,3.55,.03],[.12,4.8,-.06],[.1,6.35,-.1]],[.55,.42,.32,.23,.14,.025],10,20);
for(let i=0;i<7;i++){const a=i*Math.PI*2/7;limb([[Math.cos(a)*.21,.35,Math.sin(a)*.21],[Math.cos(a)*.46,.12,Math.sin(a)*.46],[Math.cos(a)*.85,.025,Math.sin(a)*.85]],[.17,.11,.015],7,4)}
const branches=[
 [[[0,2.1,0],[-.48,3.1,.02],[-1.4,4.15,.15],[-2.35,5.05,.3]],[.25,.2,.11,.025]],
 [[[.05,2.4,0],[.62,3.35,.10],[1.5,4.2,.25],[2.45,5.1,.48]],[.24,.19,.10,.022]],
 [[[.04,2.8,.05],[-.08,3.85,.5],[-.38,4.65,1.35],[-.55,5.6,2.05]],[.21,.16,.09,.02]],
 [[[.03,3,-.04],[.32,4.0,-.55],[.55,4.9,-1.4],[.85,5.8,-2]],[.21,.15,.08,.02]],
 [[[-.02,3.9,0],[-.5,4.9,-.35],[-1.2,5.75,-.9],[-1.7,6.45,-1.3]],[.16,.12,.07,.018]],
 [[[0,4.1,0],[.55,5,.35],[1.15,5.8,.85],[1.65,6.6,1.3]],[.16,.12,.07,.018]],
];
for(const [points,radii] of branches)limb(points,radii,6,7);
let seed=1234567; const rand=()=>{seed=(1664525*seed+1013904223)>>>0;return seed/4294967296};
const lobes=[[-2.1,5,.3],[-1.4,5.8,.1],[-1.6,6.25,-1.1],[2.1,5.25,.4],[1.3,5.85,.35],[1.5,6.4,1.1],[-.45,5.5,1.7],[.6,5.9,-1.7],[0,6.6,-.5],[-.8,7,.6],[.7,7.1,.35],[0,7.5,-.15]];
// Slightly bent cards replace rigid planes. Mixed inclinations preserve the canopy from low and high cameras.
for(const [x,y,z] of lobes) for(let j=0;j<7;j++){
  const g=new THREE.PlaneGeometry(2.15,1.85,1,1);
  const pos=g.getAttribute('position');for(let i=0;i<pos.count;i++){const px=pos.getX(i)/1.075,py=pos.getY(i)/.925;pos.setZ(i,.20*(1-px*px)*(1-py*py));}g.computeVertexNormals();
  g.rotateX(-(.35+rand()*.9));g.rotateZ(rand()*Math.PI*2);g.rotateY(rand()*Math.PI*2);
  g.translate(x+(rand()-.5)*.8,y+(rand()-.5)*.65,z+(rand()-.5)*.8);cards.push(g);
}
const group=new THREE.Group();group.name='Cincis_Oak_Prototype';
const bark=new THREE.MeshStandardMaterial({name:'Oak bark',vertexColors:true,roughness:1});const foliage=new THREE.MeshStandardMaterial({name:'Oak foliage cards',color:'#ffffff',roughness:1,side:THREE.DoubleSide});
for(const [name,parts,material] of [['Trunk and branches',wood,bark],['Foliage',cards,foliage]]){const mesh=new THREE.Mesh(mergeGeometries(parts),material);mesh.name=name;group.add(mesh)}
const binary=await new Promise((resolve,reject)=>new GLTFExporter().parse(group,resolve,reject,{binary:true}));
const io=new NodeIO();const doc=await io.readBinary(new Uint8Array(binary));
// Resize the original generated transparent art for GPU use; retain the original as source.
const image=await sharp(await readFile('docs/art-direction/trees/oak-foliage-generated.png')).resize({width:512,height:512,fit:'contain',background:{r:0,g:0,b:0,alpha:0}}).modulate({brightness:1.35}).png({palette:true,colours:256,dither:.5}).toBuffer();
const texture=doc.createTexture('Original oak foliage').setImage(new Uint8Array(image)).setMimeType('image/png');
const barkImage=await sharp(await readFile('docs/art-direction/trees/oak-bark-generated.png')).resize(256,256).jpeg({quality:82}).toBuffer();
const barkTexture=doc.createTexture('Original oak bark').setImage(new Uint8Array(barkImage)).setMimeType('image/jpeg');
doc.getRoot().listMaterials().find(m=>m.getName()==='Oak bark').setBaseColorTexture(barkTexture);
const material=doc.getRoot().listMaterials().find(m=>m.getName()==='Oak foliage cards');material.setBaseColorTexture(texture).setAlphaMode('MASK').setAlphaCutoff(.38).setDoubleSided(true);
const result=await io.writeBinary(doc);await writeFile('docs/art-direction/trees/cincis-oak-mid-study.glb',result);console.log('Saved oak prototype',result.byteLength,'bytes');
