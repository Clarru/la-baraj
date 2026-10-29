// Deterministic, editable experimental oak model. See docs/art-direction/trees.
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { GLTFExporter } from 'three/examples/jsm/exporters/GLTFExporter.js';
import { writeFile } from 'node:fs/promises';
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
// A tapered, slightly leaning trunk with branches that split at different heights.
limb([[0,0,0],[.06,1,.03],[-.05,2,.02],[-.23,3.1,.1],[-.18,4.25,.05],[.05,5.7,0],[.27,7.0,.1]],[.48,.38,.30,.24,.17,.09,.015],10,20);
const branches=[
 [[[ -.13,2.8,.06],[-.55,3.5,.04],[-1.2,4.25,.10],[-1.95,4.9,.3]],[.19,.14,.08,.012]],
 [[[-.2,3.5,.04],[.35,4.0,.15],[1,4.7,.38],[1.8,5.2,.55]],[.18,.13,.07,.012]],
 [[[-.12,4.05,.04],[-.25,4.75,.55],[-.45,5.35,1.25],[-.6,5.85,1.8]],[.15,.11,.06,.01]],
 [[[-.05,4.6,0],[.35,5,-.6],[.65,5.65,-1.3],[.9,6,-1.65]],[.14,.10,.06,.01]],
 [[[-.05,4.8,.04],[-.6,5.4,-.2],[-1.3,6,-.6],[-1.7,6.4,-.9]],[.13,.09,.05,.01]],
 [[[.08,5.5,.08],[.5,6.1,.38],[1.1,6.6,.8],[1.6,6.85,1.1]],[.10,.07,.04,.01]]];
for(const [p,r] of branches)limb(p,r,7,10);
let seed=731934; const rand=()=>{seed=(1664525*seed+1013904223)>>>0;return seed/4294967296};
const lobes=[[-1.65,5.1,.1,1.18,.95,.95],[1.45,5.55,.4,1.2,1,.9],[-.45,5.9,1.3,1.05,1,.8],[.65,6,-1.2,1.1,1,.85],[-1.25,6.35,-.7,1.0,.9,.8],[1.15,6.8,.75,1,.85,.8],[-.15,7.15,.1,1.2,1,.95]];
const vertices=[], colours=[], indices=[];
const palette=['#5d8c32','#75a83c','#8ab948','#4d792b','#a0c653'].map(x=>new THREE.Color(x));
// Each leaf has a simple lobed outline and bent midrib; no texture alpha or cards.
const outline=[[-.08,0],[-.35,.18],[-.39,.32],[-.46,.44],[-.34,.55],[-.41,.68],[-.25,.78],[-.24,.88],[0,1],[.24,.88],[.25,.78],[.41,.68],[.34,.55],[.46,.44],[.39,.32],[.35,.18],[.08,0]];
for(const [cx,cy,cz,rx,ry,rz] of lobes)for(let i=0;i<95;i++){
 const u=rand()*2-1, phi=rand()*Math.PI*2, rr=Math.sqrt(1-u*u), depth=Math.cbrt(rand());
 const center=new THREE.Vector3(cx+rx*rr*Math.cos(phi)*depth,cy+ry*u*depth,cz+rz*rr*Math.sin(phi)*depth);
 const q=new THREE.Quaternion().setFromEuler(new THREE.Euler((rand()-.5)*Math.PI,rand()*Math.PI*2,rand()*Math.PI*2));
 const size=.38+rand()*.25, color=palette[Math.floor(rand()*palette.length)].clone().multiplyScalar(.88+rand()*.24);
 const base=vertices.length/3;
 const add=(x,y,z)=>{const v=new THREE.Vector3(x*size,y*size,z*size).applyQuaternion(q).add(center);vertices.push(v.x,v.y,v.z);colours.push(color.r,color.g,color.b)};
 add(0,.49,.08);for(const [x,y] of outline)add(x,y,0);
 for(let j=0;j<outline.length;j++)indices.push(base,base+1+j,base+1+(j+1)%outline.length);
}
const g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.Float32BufferAttribute(vertices,3));g.setAttribute('color',new THREE.Float32BufferAttribute(colours,3));g.setIndex(indices);g.computeVertexNormals();
const group=new THREE.Group();group.name='Cincis_Oak_Leaf_Geometry_Experiment';
group.add(new THREE.Mesh(mergeGeometries(wood),new THREE.MeshStandardMaterial({name:'Painted bark',color:'#956746',vertexColors:true,roughness:1})));
group.add(new THREE.Mesh(g,new THREE.MeshStandardMaterial({name:'Oak leaf geometry',vertexColors:true,side:THREE.DoubleSide,roughness:1})));
const binary=await new Promise((resolve,reject)=>new GLTFExporter().parse(group,resolve,reject,{binary:true}));
await writeFile('docs/art-direction/trees/cincis-oak-leaf-geometry-experiment.glb',new Uint8Array(binary));
console.log('Saved geometry experiment',binary.byteLength,'bytes',indices.length/3,'leaf triangles');
