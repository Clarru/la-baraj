/** Offscreen exported-asset renderer. No server, game world, network or player UI. */
import * as THREE from 'three';
import {GLTFLoader} from 'three/examples/jsm/loaders/GLTFLoader.js';
import {AvatarWardrobe} from '../apps/web/src/avatar-wardrobe.ts';
import {wardrobeAssetIds} from '../apps/web/src/wardrobe-catalog.ts';
import {cloneCharacter} from '../apps/web/src/character-resources.ts';

const loader=new GLTFLoader(),cache=new Map();
async function source(id){
  if(cache.has(id))return cache.get(id);
  const encoded=window.wardrobeAssetData[id];
  if(!encoded)throw Error('No supplied exported GLB: '+id);
  const bytes=Uint8Array.from(atob(encoded),c=>c.charCodeAt(0));
  const gltf=await loader.parseAsync(bytes.buffer,'');cache.set(id,gltf);return gltf;
}
window.wardrobeAssetReady=(async()=>{
  const base=await source('Lakeside_Man'),actor=cloneCharacter(base.scene);
  const scene=new THREE.Scene();scene.background=new THREE.Color('#e6dfcd');scene.add(actor);
  scene.add(new THREE.AmbientLight(0xffffff,1.2));
  for(const[position,intensity]of[[[3,5,4],2.2],[[-3,2,-3],1.1]]){
    const light=new THREE.DirectionalLight(0xffffff,intensity);light.position.set(...position);scene.add(light);
  }
  const canvas=document.querySelector('canvas');
  const renderer=new THREE.WebGLRenderer({canvas,antialias:true,powerPreference:'low-power'});
  renderer.setSize(900,900);renderer.setPixelRatio(1.5);
  renderer.outputColorSpace=THREE.SRGBColorSpace;renderer.toneMapping=THREE.ACESFilmicToneMapping;
  const camera=new THREE.PerspectiveCamera(32,1,.01,50);
  const wardrobe=new AvatarWardrobe(actor,async id=>(await source(id)).scene);
  const mixer=new THREE.AnimationMixer(actor),idle=base.animations.find(c=>c.name==='Idle_Neutral');
  if(idle){mixer.clipAction(idle).play();mixer.setTime(.5)}
  function view(kind='perspective',focus='hat'){
    const[height,distance]=({hat:[1.69,1.4],top:[1.27,2.2],shoes:[.19,1.25],full:[.9,4.2]})[focus];
    const positions={perspective:[distance*.75,height+distance*.04,distance*.66],
      front:[0,height+.035,distance],side:[distance,height+.035,0],rear:[0,height+.035,-distance]};
    camera.position.set(...positions[kind]);camera.lookAt(0,height,0);camera.updateProjectionMatrix();
    actor.updateMatrixWorld(true);renderer.render(scene,camera);
  }
  window.wardrobeAssetViewer={
    plainCloth:()=>{actor.traverse(node=>{if(!node.isMesh)return;for(const material of Array.isArray(node.material)?node.material:[node.material])if(/Overshirt_Navy|Knit_Charcoal/.test(material.name)){for(const slot of['map','normalMap','aoMap','roughnessMap','metalnessMap'])material[slot]=null;material.color.setRGB(.04,.075,.13);material.roughness=.85;material.metalness=0;material.needsUpdate=true}})},
    normalMaps:enabled=>{actor.traverse(node=>{if(!node.isMesh)return;for(const material of Array.isArray(node.material)?node.material:[node.material])if(/Overshirt_Navy|Knit_Charcoal/.test(material.name)){if(material.userData.studyNormalMap===undefined)material.userData.studyNormalMap=material.normalMap;material.normalMap=enabled?material.userData.studyNormalMap:null;material.needsUpdate=true}})},
    animations:()=>base.animations.map(c=>c.name),
    pose:(name,time)=>{mixer.stopAllAction();if(name==='Rest'){actor.traverse(node=>{if(node.isSkinnedMesh)node.skeleton.pose()});actor.updateMatrixWorld(true);return}const clip=base.animations.find(c=>c.name===name);if(!clip)throw Error('Unknown pose '+name);mixer.clipAction(clip).play();mixer.setTime(time);actor.updateMatrixWorld(true)},
    required:wardrobeAssetIds,
    apply:async appearance=>{await wardrobe.update(appearance);view();await renderer.compileAsync(scene,camera);view()},
    view,
    inspect:()=>({calls:renderer.info.render.calls,triangles:renderer.info.render.triangles,
      renderer:renderer.getContext().getParameter(renderer.getContext().RENDERER)}),
  };
  view();return true;
})();
