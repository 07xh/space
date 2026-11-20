// Verify the ACTUALLY DEPLOYED Cloudflare Pages preview, not only the local Astro output.
// Screenshots are build artifacts for manual visual review; assertions cover objective failures.
"use strict";
const assert = require("node:assert/strict");
const fs = require("node:fs");
const { chromium } = require(process.env.SPACE_PLAYWRIGHT_PATH || "playwright");

const base = process.env.SPACE_PREVIEW_URL || "https://07xh-space-preview.pages.dev";
const origin = new URL(base).origin;
if (origin !== "https://07xh-space-preview.pages.dev") {
  throw new Error("Preview audit is restricted to the independent Cloudflare preview domain");
}
const output = "artifacts/deployed-content";
fs.mkdirSync(output, { recursive: true });

const routes = [
  { path: "/projects/", kind: "projects" },
  { path: "/projects/dorm-os/", kind: "project" },
  { path: "/projects/studyflow/", kind: "project" },
  { path: "/projects/kingo-assistant/", kind: "project" },
  { path: "/projects/momoflow/", kind: "project" },
  { path: "/list/", kind: "articles" },
  { path: "/posts/engineering-drawing-exercise-3-14-visibility/", kind: "post", minImages: 6 },
  { path: "/posts/draftai-geometry-logic/", kind: "post", minImages: 7 },
  { path: "/posts/python-functions-from-zero/", kind: "post" },
];

async function inspect(page, item, device) {
  const errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  const response = await page.goto(origin + item.path, {
    waitUntil: "domcontentloaded",
    timeout: 60000,
  });
  assert.equal(response?.status(), 200, device + " " + item.path + " must return HTTP 200");

  const title = page.locator("h1").first();
  await title.waitFor({ state: "visible", timeout: 18000 });
  const titleText = (await title.innerText()).trim();
  assert(titleText.length >= 2, device + " " + item.path + " has empty heading");

  if (item.kind === "projects") {
    const count = await page.locator('a[href^="/projects/"]').count();
    assert(count >= 8, "Project directory must expose eight real projects");
  }
  if (item.kind === "project") {
    assert(await page.locator('[aria-label="主要功能"]').count() > 0,
      item.path + " is missing its feature/status cards");
    assert(await page.locator('[aria-label="项目外部链接"]').count() > 0,
      item.path + " is missing repository or download links");
  }
  if (item.kind === "post") {
    const body = page.locator(".markdown-content").first();
    await body.waitFor({ state: "attached", timeout: 18000 });
    await body.locator("details").evaluateAll((els) => els.forEach((el) => { el.open = true; }));
    const count = await body.locator("img:not(.external-link__favicon)").count();
    if (item.minImages) {
      assert(count >= item.minImages, item.path + " expected " + item.minImages + " article illustrations, got " + count);
    }
  }

  // Internal images are mandatory. Third-party images are recorded, but transient remote
  // host errors cannot make a local publication appear to have missing assets.
  const images = page.locator('img[src]:not(.external-link__favicon)');
  let decoded = 0;
  let external = 0;
  for (let i = 0, count = await images.count(); i < count; i++) {
    const image = images.nth(i);
    const src = await image.getAttribute("src");
    if (!src || src.startsWith("data:")) continue;
    const resolved = new URL(src, origin);
    if (resolved.origin !== origin) { external++; continue; }
    if (!(await image.isVisible())) continue;
    await image.scrollIntoViewIfNeeded({ timeout: 12000 });
    await image.evaluate(async (el) => { await el.decode(); });
    assert(await image.evaluate((el) => el.naturalWidth > 0 && el.naturalHeight > 0),
      device + " " + item.path + " cannot decode " + resolved.pathname);
    decoded++;
  }

  const overflow = await page.evaluate(() =>
    Math.max(document.documentElement.scrollWidth, document.body.scrollWidth) - window.innerWidth);
  assert(overflow < 35, device + " " + item.path + " horizontal overflow " + overflow + "px");
  assert.equal(errors.length, 0, device + " " + item.path + " runtime errors: " + errors.join(" | "));
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.waitForTimeout(180);
  const slug = item.path.replaceAll("/", "-").replace(/^-+|-+$/g, "");
  await page.screenshot({ path: output + "/" + device + "-" + slug + ".png", fullPage: false });
  console.log(JSON.stringify({ device, path: item.path, title: titleText,
    internalImagesDecoded: decoded, externalImagesUnverified: external, overflowPx: overflow, pageErrors: 0 }));
}

async function main() {
  const browser = await chromium.launch({ headless: true });
  try {
    for (const device of [
      { name: "desktop", width: 1440, height: 900 },
      { name: "mobile", width: 390, height: 844 },
    ]) {
      const context = await browser.newContext({
        viewport: { width: device.width, height: device.height },
        reducedMotion: "reduce",
        deviceScaleFactor: 1,
      });
      try {
        for (const item of routes) {
          const page = await context.newPage();
          try { await inspect(page, item, device.name); }
          finally { await page.close(); }
        }
      } finally {
        await context.close();
      }
    }
    console.log("Verified " + (routes.length * 2) + " real preview page/viewport combinations.");
  } finally {
    await browser.close();
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
