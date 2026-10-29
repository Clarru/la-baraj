// Render the experimental model without a web server. Install Playwright separately,
// or set PLAYWRIGHT_MODULE to an absolute path to an available playwright package.
import { build } from 'esbuild';
import sharp from 'sharp';
import { readFile, writeFile, mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

const modelPath = process.argv[2] ?? 'docs/art-direction/trees/cincis-oak-v3.glb';
const outputPath = process.argv[3] ?? 'docs/art-direction/trees/oak-v3-multiview-atlas.png';
const modulePath = process.env.PLAYWRIGHT_MODULE;
const { chromium } = await import(modulePath ? pathToFileURL(resolve(modulePath)).href : 'playwright');
const directory = await mkdtemp(join(tmpdir(), 'la-baraj-oak-'));
let browser;
try {
  const source = `
    import * as THREE from 'three';
    import {GLTFLoader} from 'three/examples/jsm/loaders/GLTFLoader.js';
    const renderer=new THREE.WebGLRenderer({antialias:true,alpha:true,preserveDrawingBuffer:true});
    renderer.setSize(256,384);renderer.setPixelRatio(1);renderer.setClearColor(0,0);renderer.outputColorSpace=THREE.SRGBColorSpace;document.body.appendChild(renderer.domElement);
    const scene=new THREE.Scene();scene.add(new THREE.HemisphereLight('#eaf1dc','#636052',2));const sun=new THREE.DirectionalLight('#fff4dc',2.5);sun.position.set(5,10,8);scene.add(sun);
    new GLTFLoader().parse(Uint8Array.from(atob(window.model),c=>c.charCodeAt(0)).buffer,'',g=>{
      const box=new THREE.Box3().setFromObject(g.scene),size=box.getSize(new THREE.Vector3()),center=box.getCenter(new THREE.Vector3());
      const height=Math.max(size.y*1.08,Math.max(size.x,size.z)*1.08*384/256),width=height*256/384;
      const camera=new THREE.OrthographicCamera(-width/2,width/2,height/2,-height/2,.1,100);
      const target=new THREE.Vector3(center.x,box.min.y+height/2,center.z);scene.add(g.scene);const pngs=[];for(let i=0;i<3;i++){const a=i*Math.PI/3;camera.position.set(target.x-Math.sin(a)*25,target.y,center.z+Math.cos(a)*25);camera.lookAt(target);renderer.render(scene,camera);pngs.push(renderer.domElement.toDataURL('image/png'));}window.result={width,height,modelHeight:size.y,modelWidth:size.x,pngs};document.body.dataset.ready='yes';
    },e=>{window.failure=String(e);document.body.dataset.ready='error'});`;
  const bundle = await build({stdin:{contents:source,resolveDir:process.cwd()},bundle:true,format:'iife',write:false});
  const model = (await readFile(modelPath)).toString('base64');
  const pagePath = join(directory,'bake.html');
  await writeFile(pagePath,`<body><script>window.model=${JSON.stringify(model)}</script><script>${bundle.outputFiles[0].text}</script>`);
  browser = await chromium.launch({headless:true,...(process.env.CHROME_PATH ? {executablePath:process.env.CHROME_PATH} : {}),args:['--enable-webgl','--use-gl=angle','--use-angle=swiftshader']});
  const page = await browser.newPage();
  await page.goto(pathToFileURL(pagePath).href);
  await page.waitForSelector('body[data-ready]',{timeout:30000});
  const outcome = await page.evaluate(() => ({state:document.body.dataset.ready, result:window.result, failure:window.failure}));
  if (outcome.state !== 'yes') throw new Error(outcome.failure ?? 'Model render failed');
  const {pngs,...dimensions} = outcome.result;
  const tiles=pngs.map((png,i)=>({input:Buffer.from(png.split(',')[1],'base64'),left:256*i,top:0}));
  const atlas=await sharp({create:{width:768,height:384,channels:4,background:{r:0,g:0,b:0,alpha:0}}}).composite(tiles).png().toBuffer();
  await writeFile(outputPath,atlas);
  console.log(JSON.stringify(dimensions,null,2));
} finally {
  await browser?.close();
  await rm(directory,{recursive:true,force:true});
}
