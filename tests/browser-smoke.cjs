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
  assert((await page.locator("[data-hero-mosaic-complete] img").getAttribute("src")).includes("home-main-poster.webp"),"hero must use the supplied main picture");
  assert((await page.locator(".home-hero__photo-overlay-image").getAttribute("src")).includes("home-overlay-poster.webp"),"hero overlay must use the supplied second picture");
  // Verify both restored Live Photos actually play, not merely reference MP4 paths.
  for (const [slot, path] of [["main", "/brand/home-main-live.mp4"], ["overlay", "/brand/home-overlay-live.mp4"]]) {
   const selector = `video[data-hero-live="${slot}"]`;
   const video = page.locator(selector);
   assert.equal(await video.count(), 1, slot + ": one live video is required");
   assert.equal(await video.getAttribute("src"), path, slot + ": incorrect MP4 asset");
   assert.equal(await video.getAttribute("muted"), "", slot + ": autoplay must be muted");
   assert.equal(await video.getAttribute("playsinline"), "", slot + ": video must play inline");
   try {
    await page.waitForFunction((sel) => {
     const v = document.querySelector(sel);
     return v && !v.paused && v.readyState >= 2 && v.currentTime > 0.1;
    }, selector, {timeout: 15000});
   } catch (err) {
    const state = await video.evaluate(v => ({
     currentSrc: v.currentSrc, readyState: v.readyState, networkState: v.networkState,
     paused: v.paused, currentTime: v.currentTime, duration: v.duration,
     muted: v.muted, autoplay: v.autoplay, errorCode: v.error?.code,
     errorMessage: v.error?.message,
     videoWidth: v.videoWidth, videoHeight: v.videoHeight,
     styleDisplay: getComputedStyle(v).display,
     styleVisibility: getComputedStyle(v).visibility,
     canPlayH264: v.canPlayType('video/mp4; codecs="avc1.64001f"'),
     mediaError: v.error ? String(v.error.message) : null
    }));
    throw new Error(slot + ": playback verification failed: " + JSON.stringify(state) + "; " + err.message);
   }
   const before = await video.evaluate(v => v.currentTime);
   await page.waitForTimeout(500);
   const after = await video.evaluate(v => v.currentTime);
   assert(Math.abs(after - before) > 0.08, slot + ": video frames must advance");
  }
  await page.emulateMedia({reducedMotion: "reduce"});
  for (const slot of ["main", "overlay"]) {
   assert.equal(await page.locator(`video[data-hero-live="${slot}"]`).evaluate(v => getComputedStyle(v).display), "none", slot + ": honor reduced motion and show poster fallback");
  }
  await page.emulateMedia({reducedMotion: "no-preference"});
  await page.screenshot({path:output+"/desktop-hero-autoplay.png",fullPage:false});
  await page.waitForFunction(()=>document.querySelector("#home-blinds")?.dataset.homeBlindsReady==="ready",null,{timeout:20000});
  const scrollToOpening=()=>window.scrollTo(0,document.querySelector("#home-blinds").getBoundingClientRect().top+window.scrollY);
  await page.evaluate(scrollToOpening);
  assert(await page.evaluate(()=>document.querySelector("#home-blinds").getBoundingClientRect().height<=innerHeight+2),"the complete lower animation must share one screen without empty scroll placeholders");
  await page.waitForFunction(()=>[...document.querySelectorAll("img.home-blinds-scene__image")].every(image=>image.complete),null,{timeout:20000});
  await page.waitForFunction(()=>getComputedStyle(document.querySelector("[data-headline-window]")).visibility==="hidden"&&getComputedStyle(document.querySelector("[data-home-blinds-scene]")).visibility==="visible",null,{timeout:12000});
  const promos=await page.locator("img.home-blinds-scene__image").evaluateAll(images=>images.map(image=>image.getAttribute("src")));
  assert.equal(promos.length,9,"homepage must retain the opening illustration plus all eight project posters");
  assert.equal(promos[0],"/brand/xiaohuang-live-poster.webp","the original opening illustration must be retained");
  assert(promos.slice(1).every(src=>src&&src.startsWith("/project-media/promo-")),"all eight following pictures must use project publicity posters");
  const livePhoto=page.locator("[data-scene-video]");
  assert.equal(await livePhoto.count(),1,"the original opening frame must contain its restored live video");
  assert.equal(await livePhoto.getAttribute("src"),"/brand/xiaohuang-live.webm","the opening frame must reuse the original WebM asset");
  await page.waitForFunction(()=>{const video=document.querySelector("[data-scene-video]");return video&&!video.paused&&video.currentTime>0;},null,{timeout:10000});
  const liveTime=await livePhoto.evaluate(video=>video.currentTime);
  await page.waitForTimeout(500);
  assert((await livePhoto.evaluate(video=>video.currentTime))>liveTime,"the live photo must advance video frames, not remain a static poster");
  await page.waitForTimeout(1500);
  assert(await page.locator("[data-scene-card-outline]").evaluateAll(outlines=>outlines.every(outline=>Number(outline.style.getPropertyValue("--outline-left"))>0.99)),"all nine frames must finish drawing their borders");
  assert.equal(await page.locator("a[data-scene-frame][target='_blank']").count(),9,"each image must open at full size");
  assert.equal(await page.locator("a[data-scene-frame][href^='/project-media/promo-']").count(),8,"all eight project posters must remain available");
  const popupPromise=page.waitForEvent("popup");
  await page.locator("a[data-scene-frame]").first().click();
  const posterPage=await popupPromise;
  await posterPage.waitForURL(/\/brand\/xiaohuang-live-poster\.webp(?:\?.*)?$/, {waitUntil:"commit", timeout:15000});
  assert(new URL(posterPage.url()).pathname.endsWith("xiaohuang-live-poster.webp"),"opening image click must open the retained full-size illustration");
  await posterPage.close();
  await page.screenshot({path:output+"/desktop-project-promos.png",fullPage:false});
  const scenePosition=()=>document.querySelector("[data-home-blinds-scene]").style.transform;
  const firstPosition=await page.evaluate(scenePosition);
  const stationaryScroll=await page.evaluate(()=>window.scrollY);
  await page.waitForTimeout(4500);
  assert.notEqual(await page.evaluate(scenePosition),firstPosition,"lower pictures should advance automatically without wheel input");
  assert.equal(await page.evaluate(()=>window.scrollY),stationaryScroll,"lower picture playback must not scroll the page");
  await page.evaluate(()=>window.scrollTo(0,0));
  await page.waitForTimeout(300);
  const pausedPosition=await page.evaluate(scenePosition);
  await page.waitForTimeout(1800);
  assert.equal(await page.evaluate(scenePosition),pausedPosition,"lower picture playback should pause outside the viewport");
  assert(await livePhoto.evaluate(video=>video.paused),"the live video must pause outside the viewport");
  await page.route("**/project-media/promo-momoflow.svg",route=>route.abort());
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
 // Google Chrome includes H.264 decoding; Playwright bundled Chromium does not.
 const browser=await chromium.launch({headless:true,channel:"chrome"});
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
