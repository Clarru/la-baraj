/** Copy only selected-runtime wardrobe exports; candidate packing never grants visual acceptance. */
import fs from "node:fs/promises";
import path from "node:path";
import crypto from "node:crypto";
const root=path.resolve(import.meta.dirname,"..");
const candidate=process.argv.includes("--candidate");
const manifest=JSON.parse(await fs.readFile(path.join(root,"docs/characters/wardrobe/candidates.json"),"utf8"));
const omit=new Set(["hair-parted","beard-full","shoes-lake-boots","bottom-classic-tucked"]);
let acceptance;
if(!candidate) acceptance=JSON.parse(await fs.readFile(path.join(root,"docs/characters/wardrobe/acceptance.json"),"utf8"));
const output=path.join(root,"apps/web/public/assets/avatars/wardrobe");
await fs.mkdir(output,{recursive:true});
const assets=[];
for(const asset of manifest.assets) {
  if(omit.has(asset.id)) continue;
  if(!candidate && !acceptance.assets?.some(entry=>entry.sha256===asset.sha256 && entry.accepted===true))
    throw Error("Current asset has no visual acceptance: "+asset.id);
  const source=path.join(root,asset.candidate);
  const bytes=await fs.readFile(source);
  if(crypto.createHash("sha256").update(bytes).digest("hex")!==asset.sha256)
    throw Error("Candidate changed since validation: "+asset.id);
  await fs.copyFile(source,path.join(output,asset.id+".glb"));
  const {candidate:ignored,...record}=asset;
  assets.push(record);
}
await fs.writeFile(path.join(output,"manifest.json"),JSON.stringify({
  stage:candidate?"Preview candidates — visual/game acceptance pending":"Accepted wardrobe exports",
  originalMaleUnchanged:true,source:"Quaternius CC0 Standard base characters and modular outfits; reference-led Blender reconstruction; retained provenance in docs/characters/wardrobe and assets/wardrobe-source",
  assets,
},null,2)+"\n");
await fs.writeFile(path.join(root,"apps/web/src/wardrobe-asset-versions.json"),
  JSON.stringify(Object.fromEntries(assets.map(asset=>[asset.id,asset.sha256])),null,2)+"\n");
console.log(JSON.stringify({stage:candidate?"candidate":"accepted",assets:assets.length,bytes:assets.reduce((sum,a)=>sum+a.bytes,0)}));
