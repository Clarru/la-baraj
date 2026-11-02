/** Isolated additive QA entry; does not start a listener or write shared dist. */
import {build} from "vite";
import {access,writeFile,unlink} from "node:fs/promises";
import {resolve} from "node:path";
const root=resolve(import.meta.dirname,".."),temporary=resolve(root,"apps/web/__wardrobe-qa.html");
try{await access(temporary);throw Error("QA entry already exists");}catch(error){if(error.code!=="ENOENT")throw error;}
try{
  await writeFile(temporary,'<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover"><title>La Baraj wardrobe acceptance</title></head><body><div id="root"></div><script type="module" src="../../tests/browser/wardrobe-world.tsx"></script></body></html>');
  await build({
    configFile:resolve(root,"vite.config.ts"),
    define:{"import.meta.env.VITE_ROOM_SERVER_URL":JSON.stringify("")},
    build:{outDir:resolve(root,".impeccable/review/wardrobe/build"),emptyOutDir:true,
      rolldownOptions:{input:temporary}},
  });
}finally{await unlink(temporary);}
