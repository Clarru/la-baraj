/** Remove ONLY an explicitly authorized packet's hash-matching additions. No directories/server changes. */
import fs from "node:fs/promises";
import path from "node:path";
import crypto from "node:crypto";
import assert from "node:assert/strict";
import {execFileSync} from "node:child_process";
const [packetPath,baselinePath,distPath,expectedPID,reportPath]=process.argv.slice(2);
if(!reportPath)throw Error("packet baseline dist expectedPID report are required");
const packet=JSON.parse(await fs.readFile(packetPath,"utf8"));
const baseline=JSON.parse(await fs.readFile(baselinePath,"utf8"));
const dist=await fs.realpath(distPath);
async function fingerprint(file){const bytes=await fs.readFile(file);return{sha:crypto.createHash("sha256").update(bytes).digest("hex"),size:bytes.length};}
async function verifyBaseline(){
  for(const [name,expected] of Object.entries(baseline))
    assert.deepEqual(await fingerprint(path.join(dist,name)),expected,"Protected baseline changed: "+name);
}
await verifyBaseline();
for(const file of packet.payload){
  const target=path.resolve(dist,file.path);
  assert.ok(target.startsWith(dist+path.sep)&&!(file.path in baseline),"Unsafe/protected addition: "+file.path);
  assert.equal((await fs.lstat(target)).isSymbolicLink(),false);
  assert.deepEqual(await fingerprint(target),{sha:file.sha256,size:file.bytes},"Addition changed: "+file.path);
}
for(const file of packet.payload)await fs.unlink(path.join(dist,file.path));
await verifyBaseline();
async function walk(directory){
  const files=[];
  for(const item of await fs.readdir(directory,{withFileTypes:true})){
    const full=path.join(directory,item.name);
    if(item.isDirectory())files.push(...await walk(full));
    else files.push(path.relative(dist,full));
  }
  return files;
}
const remaining=await walk(dist);
assert.deepEqual(remaining.sort(),Object.keys(baseline).sort(),"Unexpected remaining file set");
const pids=execFileSync("lsof",["-t","-iTCP:4173","-sTCP:LISTEN"],{encoding:"utf8"}).trim().split(/\s+/);
assert.deepEqual(pids,[expectedPID],"Canonical listener changed");
const response=await fetch("http://127.0.0.1:4173/");
assert.equal(response.status,200);
const index=crypto.createHash("sha256").update(new Uint8Array(await response.arrayBuffer())).digest("hex");
assert.equal(index,packet.normalIndexSHA256);
const record={head:packet.head,removed:packet.payload.length,protectedFilesVerified:remaining.length,
  removedPaths:packet.payload.map(file=>file.path),normalIndexSHA256:index,listenerPID:Number(expectedPID),
  listenerUntouched:true,baseline:baselinePath,
  monotonic:Number(execFileSync("python3",["-c","import time;print(time.monotonic())"],{encoding:"utf8"}))};
await fs.mkdir(path.dirname(reportPath),{recursive:true});
await fs.writeFile(reportPath,JSON.stringify(record,null,2)+"\n");
console.log(JSON.stringify({...record,removedPaths:undefined}));
