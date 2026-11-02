/** Read-only comparison with the ONE shared preview. Never publishes files. */
import fs from "node:fs/promises";
import path from "node:path";
import crypto from "node:crypto";
import {execFileSync} from "node:child_process";
const root=path.resolve(import.meta.dirname,"..");
const build=path.join(root,".impeccable/review/wardrobe/build");
const output=path.join(root,".impeccable/review/wardrobe/preflight.json");
const origin="http://127.0.0.1:4173/";
const hash=bytes=>crypto.createHash("sha256").update(bytes).digest("hex");
async function served(relative){
  const response=await fetch(new URL(relative,origin));
  return{status:response.status,sha256:hash(new Uint8Array(await response.arrayBuffer()))};
}
const baseline=await served("");
if(baseline.status!==200)throw Error("Canonical preview is not ready");
const entry="__wardrobe-qa.html";
const html=await fs.readFile(path.join(build,entry),"utf8");
const required=new Set([entry,...[...html.matchAll(/(?:src|href)="([^"]+)"/g)]
  .map(match=>match[1].replace(/^\//,"")).filter(name=>name.startsWith("assets/"))]);
// Multi-entry actual-Game checks include shared generated chunks and the new
// hashed SharedWorker. Public/baseline JS is not an additive payload.
try{await fs.access(path.join(build,"__wardrobe-game-qa.html"));required.add("__wardrobe-game-qa.html");}catch{}
async function generated(directory){
  for(const item of await fs.readdir(directory,{withFileTypes:true})){
    const full=path.join(directory,item.name);
    if(item.isDirectory()){await generated(full);continue;}
    if(!/\.(?:js|css)$/.test(item.name))continue;
    const relative=path.relative(build,full);
    try{await fs.access(path.join(root,"apps/web/public",relative));}
    catch{required.add(relative);}
  }
}
await generated(path.join(build,"assets"));
for(const name of await fs.readdir(path.join(build,"assets/avatars/wardrobe")))
  required.add("assets/avatars/wardrobe/"+name);
const shared=new Set(["assets/optimized/Lakeside_Man.glb","assets/animations/character-actions.json"]);
async function publicDependencies(directory){
  for(const item of await fs.readdir(directory,{withFileTypes:true})){
    if(item.name.startsWith("."))continue;
    const full=path.join(directory,item.name);
    const relative=path.relative(path.join(root,"apps/web/public"),full);
    if(relative.startsWith("assets/avatars/wardrobe"))continue;
    if(item.isDirectory())await publicDependencies(full);
    else shared.add(relative);
  }
}
if(required.has("__wardrobe-game-qa.html"))
  await publicDependencies(path.join(root,"apps/web/public"));
for(const name of required)if(name.endsWith(".css")){
  const css=await fs.readFile(path.join(build,name),"utf8");
  for(const match of css.matchAll(/url\(["']?(\/assets\/[^)"']+)["']?\)/g))shared.add(match[1].slice(1));
}
const payload=[],dependencies=[];
for(const name of required){
  const bytes=await fs.readFile(path.join(build,name)),sha256=hash(bytes),live=await served(name);
  const missing=live.status===404 || live.sha256===baseline.sha256;
  const disposition=missing?"new":live.status===200&&live.sha256===sha256?"identical":"conflict";
  if(disposition!=="identical")payload.push({path:name,bytes:bytes.length,sha256,disposition});
}
for(const name of shared){
  const source=await fs.readFile(path.join(build,name)),live=await served(name);
  dependencies.push({path:name,sourceSHA256:hash(source),servedSHA256:live.sha256,status:live.status,
    identical:hash(source)===live.sha256,publication:"Reuse baseline; never replace a shared dependency"});
}
const after=await served("");
if(after.sha256!==baseline.sha256)throw Error("Normal index changed during preflight; retry when stable");
const record={
  head:execFileSync("git",["rev-parse","HEAD"],{cwd:root,encoding:"utf8"}).trim(),
  artifact:build,entry,preview:origin,normalIndexSHA256:baseline.sha256,
  runtimeManifestSHA256:hash(await fs.readFile(path.join(build,"assets/avatars/wardrobe/manifest.json"))),
  payload,dependencies,conflicts:payload.filter(file=>file.disposition==="conflict"),
  guards:["localhost-only fixture","actual RoomCore with in-browser channel","no PartySocket.connect or backend listener",
    "no Worker deployment/live world writes","additive entry; normal index/editor/default avatar never replaced"],
};
await fs.mkdir(path.dirname(output),{recursive:true});
await fs.writeFile(output,JSON.stringify(record,null,2)+"\n");
console.log(JSON.stringify({report:output,files:payload.length,bytes:payload.reduce((sum,file)=>sum+file.bytes,0),
  conflicts:record.conflicts.length,sharedDifferences:dependencies.filter(file=>!file.identical).map(file=>file.path),
  normalIndexSHA256:baseline.sha256}));
if(record.conflicts.length || dependencies.some(file=>file.path.endsWith("Lakeside_Man.glb")&&!file.identical))process.exitCode=1;
