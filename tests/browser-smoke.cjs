// Smoke tests for the DIRECTLY imported UI, not a replacement interface.
// Run after building and starting "astro preview" at http://127.0.0.1:4321.
const { chromium } = require(process.env.SPACE_PLAYWRIGHT_PATH || "playwright");
const fs = require("node:fs");
const assert = require("node:assert/strict");
const base = process.env.SPACE_PREVIEW_URL || "http://127.0.0.1:4321";
const widths = [{name:"desktop",w:1440,h:900},{name:"tablet",w:820,h:1180},{name:"mobile",w:390,h:844}];
const paths = ["/","/projects/","/projects/dorm-os/","/dynamic/","/list/","/posts/","/tags/","/archive/","/about/"];
const output="artifacts/ui-smoke";
fs.mkdirSync(output,{recursive:true});
async function main(){
 const staticAssets=["/brand/07xh-ship.svg","/project-media/dorm-os-home.webp","/project-media/dorm-os-tablet.webp","/project-media/draftai-projection.webp"];
 const browser=await chromium.launch({headless:true});
 const results=[];
 try{
  for(const device of widths){
   const context=await browser.newContext({viewport:{width:device.w,height:device.h},deviceScaleFactor:1,reducedMotion:"reduce"});
   const page=await context.newPage();
   if(device.name==="desktop"){
    for(const asset of staticAssets){
     const response=await page.request.get(base+asset,{timeout:20000});
     assert.equal(response.status(),200,"Expected migrated public asset "+asset);
     assert((response.headers()["content-type"]||"").includes("image/"),"Expected image content type: "+asset);
    }
   }
   const errors=[];
   page.on("pageerror",error=>errors.push(error.message));
   for(const path of paths){
    errors.length=0;
    const response=await page.goto(base+path,{waitUntil:"domcontentloaded",timeout:60000});
    assert(response && response.status()===200,device.name+" "+path+" returned "+response?.status());
    await page.waitForTimeout(path==="/"?1850:path==="/dynamic/"?1150:600);
    if(path==="/posts/"){
      assert.equal(new URL(page.url()).pathname,"/list/","legacy article list must redirect to native theme route");
    }
    if(path==="/"){
      const faviconLinks=await page.locator('link[rel="icon"]').evaluateAll(els=>els.map(el=>el.getAttribute("href")));
      assert(faviconLinks.some(x=>x?.includes("/brand/07xh-ship.svg")),"site favicon must use the user's own ship");
      assert(!faviconLinks.some(x=>x?.includes("/favicon/")),"upstream favicon must not be linked");
    }
    const h1=await page.locator("h1").count();
    assert(h1>0,device.name+" "+path+" has no H1");
    if(path==="/dynamic/"){
     const moments=await page.locator(".moment-item").count();
     assert.equal(moments,4,"migrated moments must be visible");
     const gallery=await page.locator(".moment-images a[data-fancybox]").count();
     assert(gallery>0,"real Markdown images must be in the original moment grid");
     if(device.name==="desktop"){
      await page.locator(".moment-images a[data-fancybox]").first().click();
      await page.locator(".fancybox__container").waitFor({state:"visible",timeout:5000});
      await page.keyboard.press("Escape");
     }
    }
    if(path==="/projects/"){
     const items=await page.locator('a[href^="/projects/"]').count();
     assert(items>=8,"project list must include real source projects");
     assert.equal(await page.locator('a[href="/projects/firefly/"]').count(),0,"old theme template is not a personal project");
     assert.equal(await page.locator('a[href="/projects/example-project/"]').count(),0,"example project must not be public");
    }
    if(device.name==="mobile"&&path==="/"){
     // mmzhiku intentionally hides the desktop Navbar below 768px.
     // The original bottom MobileDock is the mobile navigation.
     const btn=page.locator("#mobile-dock-menu-btn");
     assert(await btn.isVisible(),"original MobileDock trigger must be visible");
     await page.screenshot({path:output+"/mobile-dock-closed.png",fullPage:false});
     await btn.click();
     await page.waitForTimeout(380);
     const expanded=await btn.getAttribute("aria-expanded");
     assert.equal(expanded,"true","original MobileDock should expand");
     await page.screenshot({path:output+"/mobile-dock-open.png",fullPage:false});
     await btn.click();
    }
    const overflow=await page.evaluate(()=>Math.max(
     document.documentElement.scrollWidth,document.body.scrollWidth)-innerWidth);
    assert(overflow<35,device.name+" "+path+" overflowed horizontally by "+overflow+"px");
    if(["/","/projects/","/dynamic/"].includes(path)){
     await page.screenshot({path:output+"/"+device.name+"-"+path.replaceAll("/","-").replace(/^-+|-+$/g,"").replace(/^$/,"home")+".png",fullPage:false});
    }
    assert.equal(errors.length,0,"Browser exceptions "+device.name+" "+path+": "+errors.join(" | "));
    results.push({device:device.name,path,heading:h1,overflow,pageErrors:errors.length});
   }
   await context.close();
  }
  console.log(JSON.stringify(results,null,2));
 }finally{await browser.close();}
}
main().catch(err=>{console.error(err);process.exitCode=1});
