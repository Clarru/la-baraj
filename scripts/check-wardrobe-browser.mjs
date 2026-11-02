/** Acceptance only on the release owner's additive canonical fixture. No listener/build. */
import {createRequire} from "node:module";
import fs from "node:fs/promises";
import path from "node:path";
import crypto from "node:crypto";
import assert from "node:assert/strict";
const require=createRequire(import.meta.url),pw=require(process.env.PLAYWRIGHT_MODULE||"playwright");
const root=path.resolve(import.meta.dirname,".."),packet=JSON.parse(await fs.readFile(process.argv[2],"utf8"));
const engine=process.argv[3]||"chromium";
const out=path.join(root,".impeccable/review/wardrobe/captures",engine);
await fs.mkdir(out,{recursive:true});
const origin="http://127.0.0.1:4173/",url=new URL(packet.entry,origin).href;
const entry=await fetch(url),bytes=new Uint8Array(await entry.arrayBuffer());
assert.equal(crypto.createHash("sha256").update(bytes).digest("hex"),
  packet.payload.find(file=>file.path===packet.entry).sha256,"Frozen fixture is not published; refusing SPA fallback");
const browser=await pw[engine].launch(engine==="chromium"?{
  executablePath:process.env.CHROME_EXECUTABLE||"/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
  headless:true,args:["--use-angle=metal"],
}:{headless:true});
const report={engine,head:packet.head,url,views:[],errors:[],sockets:[],external:[],checks:[]};
async function stable(page){
  await page.waitForFunction(()=>window.__wardrobeQA?.inspect().status==="online");
  await page.evaluate(()=>document.fonts.ready);
}
async function preview(page){
  await page.locator(".appearance-preview canvas").waitFor({state:"visible"});
  await page.waitForFunction(()=>!document.querySelector(".appearance-preview-status"));
  await page.waitForTimeout(300);
}
async function open(page){
  await page.getByRole("button",{name:"Open appearance",exact:true}).click();
  await page.getByRole("dialog",{name:"Appearance",exact:true}).waitFor();
  await preview(page);
}
async function screenshot(page,name){
  const target=path.join(out,name+".png");
  await page.screenshot({path:target,fullPage:true});
  report.views.push({name,path:target,viewport:page.viewportSize()});
}
try{
  for(const [name,viewport,mobile] of [
    ["desktop",{width:1440,height:1000},false],
    ["phone-portrait",{width:393,height:852},true],
    ["phone-landscape",{width:852,height:393},true],
  ]){
    const context=await browser.newContext({viewport,deviceScaleFactor:mobile?3:1,isMobile:mobile,hasTouch:mobile});
    const page=await context.newPage();
    page.setDefaultTimeout(20000);
    page.on("pageerror",error=>report.errors.push({name,error:error.message}));
    page.on("websocket",socket=>report.sockets.push(socket.url()));
    page.on("request",request=>{
      const requested=request.url();
      if(/^https?:/.test(requested)&&!requested.startsWith(origin))report.external.push(requested);
    });
    const assets=[];
    page.on("request",request=>{if(request.url().includes("/assets/avatars/wardrobe/"))assets.push(request.url());});
    await page.goto(url);
    await stable(page);
    if(mobile)await page.evaluate(()=>document.querySelector(".wardrobe-qa").classList.add("mobile-shell"));
    await open(page);
    assert.equal(assets.length,0,"Default look must not load catalogue pieces");
    await screenshot(page,name);
    const overflow=await page.evaluate(()=>{
      const d=document.querySelector(".appearance-dialog"),r=d.getBoundingClientRect();
      return{left:r.left,right:r.right,top:r.top,bottom:r.bottom,width:innerWidth,height:innerHeight,
        horizontal:document.documentElement.scrollWidth>innerWidth};
    });
    assert.ok(overflow.left>=0&&overflow.right<=overflow.width+1&&!overflow.horizontal,JSON.stringify(overflow));
    assert.ok(overflow.top>=0&&overflow.bottom<=overflow.height+1,JSON.stringify(overflow));
    await page.getByRole("button",{name:"Female",exact:true}).click();
    await preview(page);
    await screenshot(page,name+"-female");
    await page.getByRole("button",{name:"Cancel",exact:true}).click();
    assert.equal((await page.evaluate(()=>window.__wardrobeQA.inspect())).local.body,"male");
    await open(page);
    await page.getByRole("button",{name:"Female",exact:true}).click();
    await preview(page);
    await page.getByRole("button",{name:"Apply look",exact:true}).click();
    await page.waitForFunction(()=>{
      const state=window.__wardrobeQA.inspect();
      return state.local.body==="female"&&state.seenByObserver?.body==="female"&&!document.querySelector(".appearance-dialog");
    });
    await page.waitForTimeout(700);
    await screenshot(page,name+"-paired-female");
    await open(page);
    await page.getByRole("button",{name:"Male",exact:true}).click();
    await page.getByRole("button",{name:"Layered",exact:true}).click();
    await page.getByRole("button",{name:"Moustache",exact:true}).click();
    await page.getByRole("button",{name:"Hair color: Silver",exact:true}).click();
    for(const [category,choice,color] of [
      ["Hats","Bucket hat",null],["Tops","Weekend knit","Top color: Rust"],
      ["Bottoms","Cargo trousers","Trouser color: Sage"],["Shoes","Canvas lace-ups",null],
    ]){
      await page.getByRole("button",{name:category,exact:true}).click();
      await page.getByRole("button",{name:choice,exact:true}).click();
      if(color)await page.getByRole("button",{name:color,exact:true}).click();
    }
    await preview(page);
    await page.getByRole("button",{name:"Full look",exact:true}).click();
    await page.waitForTimeout(250);
    await screenshot(page,name+"-configured");
    await page.getByRole("button",{name:"Apply look",exact:true}).click();
    await page.waitForFunction(()=>{
      const state=window.__wardrobeQA.inspect();
      return state.local.body==="male"&&state.local.shoes==="canvas-low"&&
        JSON.stringify(state.local)===JSON.stringify(state.seenByObserver)&&!document.querySelector(".appearance-dialog");
    });
    await open(page);
    assert.equal(await page.getByRole("button",{name:"Layered",exact:true}).getAttribute("aria-pressed"),"true");
    await page.getByRole("button",{name:"Reset look",exact:true}).click();
    await preview(page);
    await page.getByRole("button",{name:"Apply look",exact:true}).click();
    await page.waitForFunction(()=>window.__wardrobeQA.inspect().local.hat==="none");
    report.checks.push({name,defaultAdditionalDownloads:0,cancel:true,apply:true,twoClientAgreement:true,
      restoreSelection:true,reset:true,overflow,requestedAssets:[...new Set(assets)]});
    console.log("Passed "+engine+" "+name);
    await context.close();
  }
  assert.deepEqual(report.errors,[]);
  assert.deepEqual(report.sockets,[]);
  assert.deepEqual(report.external,[]);
}catch(error){
  report.failure=String(error);
  console.error(error);
  process.exitCode=1;
}finally{
  await fs.writeFile(path.join(out,"report.json"),JSON.stringify(report,null,2)+"\n");
  await browser.close();
}
