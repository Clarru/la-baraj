/** Render local GLBs with actual wardrobe code; browser about:blank, no listener. */
import fs from 'node:fs/promises';import path from 'node:path';import crypto from 'node:crypto';
import {createRequire}from'node:module';import{execFileSync}from'node:child_process';
const root=path.resolve(import.meta.dirname,'..'),require=createRequire(import.meta.url);
const{chromium}=require(process.env.PLAYWRIGHT_MODULE||'/Users/claumarin/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const scratch=path.join(root,'.impeccable/review/wardrobe-quality');await fs.mkdir(scratch,{recursive:true});
const bundle=path.join(scratch,'asset-viewer-'+process.pid+'.js');
execFileSync(process.execPath,[path.join(root,'node_modules/rolldown/bin/cli.mjs'),path.join(root,'scripts/wardrobe-asset-viewer.mjs'),'--file',bundle,'--format','iife'],{stdio:'pipe'});
const appearance=JSON.parse(process.argv[2]||'{"version":1,"body":"male","hat":"panel-cap","beard":"moustache"}');
const name=process.argv[3]||'cap-v2',focus=process.argv[4]||'hat';
const out=path.resolve(root,process.env.WARDROBE_RENDER_DIR||'docs/characters/wardrobe/quality-rework/render');await fs.mkdir(out,{recursive:true});
const b=await chromium.launch({executablePath:process.env.CHROME_EXECUTABLE||'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',headless:true,args:['--use-angle=metal']});
const c=await b.newContext({viewport:{width:900,height:900},deviceScaleFactor:1});
const report={appearance,focus,scope:'Actual GLB/wardrobe code and Appearance preview light/pose; offscreen single asset, no Game scene or listener',assets:[],errors:[],requests:[]};
try{
 const p=await c.newPage();p.on('pageerror',e=>report.errors.push(e.message));p.on('request',r=>{if(/^https?:/.test(r.url()))report.requests.push(r.url())});
 const base=await fs.readFile(path.join(root,'apps/web/public/assets/optimized/Lakeside_Man.glb'));
 await p.setContent('<style>html,body{margin:0;overflow:hidden}canvas{display:block}</style><canvas></canvas>');
 await p.evaluate(data=>window.wardrobeAssetData={Lakeside_Man:data},base.toString('base64'));
 await p.evaluate(data=>window.wardrobeSupplementData=data,JSON.parse(await fs.readFile(path.join(root,'apps/web/public/assets/animations/character-actions.json'),'utf8')));
 await p.addScriptTag({path:bundle});await p.evaluate(()=>window.wardrobeAssetReady);
 const ids=await p.evaluate(a=>window.wardrobeAssetViewer.required(a),appearance),data={};
 for(const id of ids){const bytes=await fs.readFile(path.join(root,'assets/source-models/wardrobe/optimized',id+'.glb'));data[id]=bytes.toString('base64');report.assets.push({id,sha256:crypto.createHash('sha256').update(bytes).digest('hex')})}
 await p.evaluate(data=>Object.assign(window.wardrobeAssetData,data),data);
 await p.evaluate(a=>window.wardrobeAssetViewer.apply(a),appearance);
 if(process.env.WARDROBE_IGNORE_NORMALS==='1'){report.normalMaps=false;await p.evaluate(()=>window.wardrobeAssetViewer.normalMaps(false))}
 if(process.env.WARDROBE_PLAIN_CLOTH==='1'){report.plainCloth=true;await p.evaluate(()=>window.wardrobeAssetViewer.plainCloth())}
 report.animations=await p.evaluate(()=>window.wardrobeAssetViewer.animations());
 if(process.argv[5]){report.pose={name:process.argv[5],time:Number(process.argv[6]||'.25')};await p.evaluate(pose=>window.wardrobeAssetViewer.pose(pose.name,pose.time),report.pose)}
 for(const view of['perspective','front','side','rear']){await p.evaluate(({view,focus})=>window.wardrobeAssetViewer.view(view,focus),{view,focus});await p.waitForTimeout(150);await p.screenshot({path:path.join(out,name+'-'+view+'.png')})}
 report.stats=await p.evaluate(()=>window.wardrobeAssetViewer.inspect());
 if(report.errors.length||report.requests.length)throw Error(JSON.stringify(report));
}finally{await c.close();await b.close();await fs.unlink(bundle).catch(()=>{});await fs.writeFile(path.join(out,name+'-webgl.json'),JSON.stringify(report,null,2)+'\n')}
console.log(JSON.stringify(report));
