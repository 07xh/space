// Smoke tests for the DIRECTLY imported UI, not a replacement interface.
// Run after building and starting "astro preview" at http://127.0.0.1:4321.
const { chromium } = require(process.env.SPACE_PLAYWRIGHT_PATH || "playwright");
const fs = require("node:fs");
const assert = require("node:assert/strict");
const base = process.env.SPACE_PREVIEW_URL || "http://127.0.0.1:4321";
const widths = [{name:"desktop",w:1440,h:900},{name:"mobile",w:390,h:844}];
const paths = ["/","/projects/","/projects/dorm-os/","/dynamic/","/list/","/about/"];
const output="artifacts/ui-smoke";
fs.mkdirSync(output,{recursive:true});
async function main(){
 const browser=await chromium.launch({headless:true});
 const results=[];
 try{
  for(const device of widths){
   const context=await browser.newContext({viewport:{width:device.w,height:device.h},deviceScaleFactor:1,reducedMotion:"reduce"});
   const page=await context.newPage();
   const errors=[];
   page.on("pageerror",error=>errors.push(error.message));
   for(const path of paths){
    errors.length=0;
    const response=await page.goto(base+path,{waitUntil:"domcontentloaded",timeout:60000});
    assert(response && response.status()===200,device.name+" "+path+" returned "+response?.status());
    await page.waitForTimeout(650);
    const h1=await page.locator("h1").count();
    assert(h1>0,device.name+" "+path+" has no H1");
    if(path==="/dynamic/"){
     const moments=await page.locator(".moment-item").count();
     assert.equal(moments,4,"migrated moments must be visible");
     const gallery=await page.locator(".moment-images a[data-fancybox]").count();
     assert(gallery>0,"real Markdown images must be in the original moment grid");
    }
    if(path==="/projects/"){
     const items=await page.locator('a[href^="/projects/"]').count();
     assert(items>=8,"project list must include real source projects");
    }
    if(device.name==="mobile"&&path==="/"){
     const btn=page.locator("#nav-menu-switch");
     assert(await btn.isVisible(),"original mobile navbar trigger must be visible");
     await btn.click();
     await page.waitForTimeout(250);
    }
    const overflow=await page.evaluate(()=>Math.max(
     document.documentElement.scrollWidth,document.body.scrollWidth)-innerWidth);
    assert(overflow<35,device.name+" "+path+" overflowed horizontally by "+overflow+"px");
    if(["/","/projects/","/dynamic/"].includes(path)){
     await page.screenshot({path:output+"/"+device.name+"-"+path.replaceAll("/","-").replace(/^-+|-+$/g,"").replace(/^$/,"home")+".png",fullPage:false});
    }
    if(errors.length)console.warn("Browser page exceptions "+device.name+" "+path+": "+errors.join(" | "));
    results.push({device:device.name,path,heading:h1,overflow,pageErrors:errors.length});
   }
   await context.close();
  }
  console.log(JSON.stringify(results,null,2));
 }finally{await browser.close();}
}
main().catch(err=>{console.error(err);process.exitCode=1});
