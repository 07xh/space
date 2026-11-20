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
async function checkHeroAutoplay(browser){
 const context=await browser.newContext({viewport:{width:1440,height:900},reducedMotion:"no-preference"});
 const page=await context.newPage();
 const errors=[];
 page.on("pageerror",error=>errors.push(error.message));
 const isAssembled=()=>{
  const picture=document.querySelector("[data-hero-mosaic-complete]");
  const cards=[...document.querySelectorAll(".home-hero__intro-card")];
  return picture&&getComputedStyle(picture).visibility==="visible"&&
   Number(getComputedStyle(picture).opacity)>0.99&&cards.length===3&&
   cards.every(card=>Number(getComputedStyle(card).opacity)>0.99);
 };
 try{
  await page.goto(base+"/",{waitUntil:"domcontentloaded",timeout:60000});
  await page.waitForFunction(()=>document.querySelector("[data-home-hero]")?.dataset.heroMounted==="true"&&document.querySelector("[data-hero-mosaic-complete] img")?.complete&&document.fonts.status==="loaded",null,{timeout:20000});
  await page.waitForTimeout(3300);
  assert(!(await page.evaluate(isAssembled)),"hero should leave time to see the assembly and picture before the final cards");
  await page.waitForFunction(isAssembled,null,{timeout:20000});
  assert.equal(await page.evaluate(()=>window.scrollY),0,"hero must assemble without scrolling the page");
  await page.evaluate(()=>window.scrollTo(0,window.innerHeight+100));
  await page.waitForTimeout(300);
  await page.evaluate(()=>window.scrollTo(0,0));
  await page.waitForTimeout(700);
  assert(await page.evaluate(isAssembled),"scrolling back must preserve the assembled picture");
  await page.setViewportSize({width:1280,height:800});
  await page.waitForTimeout(700);
  assert(await page.evaluate(isAssembled),"resizing must preserve the assembled picture");
  await page.screenshot({path:output+"/desktop-hero-autoplay.png",fullPage:false});
  await page.waitForFunction(()=>document.querySelector("#home-blinds")?.dataset.homeBlindsReady==="ready",null,{timeout:20000});
  const scrollToOpening=()=>window.scrollTo(0,document.querySelector("#home-blinds").getBoundingClientRect().top+window.scrollY);
  await page.evaluate(scrollToOpening);
  assert(await page.evaluate(()=>document.querySelector("#home-blinds").getBoundingClientRect().height<=innerHeight+2),"the complete lower animation must share one screen without empty scroll placeholders");
  await page.waitForFunction(()=>[...document.querySelectorAll("img.home-blinds-scene__image")].every(image=>image.complete),null,{timeout:20000});
  await page.waitForFunction(()=>getComputedStyle(document.querySelector("[data-headline-window]")).visibility==="hidden"&&getComputedStyle(document.querySelector("[data-home-blinds-scene]")).visibility==="visible",null,{timeout:12000});
  const livePhoto=page.locator("[data-scene-video]");
  try{
   await page.waitForFunction(()=>{const v=document.querySelector("[data-scene-video]");return v&&!v.paused&&v.currentTime>0;},null,{timeout:10000});
  }catch(error){
   const media=await livePhoto.evaluate(video=>({src:video.currentSrc,paused:video.paused,hidden:video.hidden,readyState:video.readyState,networkState:video.networkState,error:video.error?.message,muted:video.muted}));
   throw new Error("Live photo failed to play: "+JSON.stringify(media),{cause:error});
  }
  const liveTime=await livePhoto.evaluate(video=>video.currentTime);
  await page.waitForTimeout(600);
  assert.notEqual(await livePhoto.evaluate(video=>video.currentTime),liveTime,"live photo must play real video frames");
  await page.waitForTimeout(1500);
  const scenePosition=()=>document.querySelector("[data-home-blinds-scene]").style.transform;
  const firstPosition=await page.evaluate(scenePosition);
  const stationaryScroll=await page.evaluate(()=>window.scrollY);
  await page.waitForTimeout(4500);
  assert.notEqual(await page.evaluate(scenePosition),firstPosition,"lower pictures should advance automatically without wheel input");
  assert.equal(await page.evaluate(()=>window.scrollY),stationaryScroll,"lower picture playback must not scroll the page");
  await page.evaluate(()=>window.scrollTo(0,0));
  await page.waitForTimeout(300);
  const pausedPosition=await page.evaluate(scenePosition);
  assert(await livePhoto.evaluate(video=>video.paused),"live photo should pause outside the viewport");
  await page.waitForTimeout(1800);
  assert.equal(await page.evaluate(scenePosition),pausedPosition,"lower picture playback should pause outside the viewport");
  await page.route("**/assets/images/home-blinds/act2/4.webp",route=>route.abort());
  await page.reload({waitUntil:"domcontentloaded"});
  await page.waitForFunction(()=>document.querySelector("#home-blinds")?.dataset.homeBlindsReady==="ready",null,{timeout:20000});
  await page.evaluate(scrollToOpening);
  await page.waitForFunction(()=>getComputedStyle(document.querySelector("[data-home-blinds-scene]")).visibility==="visible",null,{timeout:20000});
  await page.waitForTimeout(1500);
  const positionWithFailedImage=await page.evaluate(scenePosition);
  await page.waitForTimeout(4500);
  assert.notEqual(await page.evaluate(scenePosition),positionWithFailedImage,"a failed later image must not freeze all the other pictures");
  assert.equal(errors.length,0,"Autoplay browser exceptions: "+errors.join(" | "));
 }finally{await context.close();}
}
async function main(){
 const staticAssets=["/brand/07xh-ship.svg","/project-media/dorm-os-home.webp","/project-media/dorm-os-tablet.webp","/project-media/draftai-projection.webp"];
 const browser=await chromium.launch({headless:true});
 const results=[];
 try{
  await checkHeroAutoplay(browser);
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
      assert((await page.locator(".profile-card__avatar-img").first().getAttribute("src")).includes("/brand/xiaohuang-avatar.webp"),"profile must use the supplied avatar");
      const faviconLinks=await page.locator('link[rel="icon"]').evaluateAll(els=>els.map(el=>el.getAttribute("href")));
      assert(faviconLinks.some(x=>x?.includes("/brand/07xh-ship.svg")),"site favicon must use the user's own ship");
      assert(!faviconLinks.some(x=>x?.includes("/favicon/")),"upstream favicon must not be linked");
    }
    const h1=await page.locator("h1").count();
    assert(h1>0,device.name+" "+path+" has no H1");
    if(path==="/dynamic/"){
     assert((await page.locator(".moment-avatar__img").first().getAttribute("src")).includes("/brand/xiaohuang-avatar.webp"),"dynamic cards must use the supplied avatar too");
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
