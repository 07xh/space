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

// Discover public content from the actually deployed sitemap; drafts are excluded.
const minimumArticleIllustrations = new Map([
  ["/posts/engineering-drawing-exercise-3-14-visibility/", 6],
  ["/posts/draftai-geometry-logic/", 7],
]);

function sitemapLocations(xml) {
  return [...xml.matchAll(/<loc>\s*([^<]+?)\s*<\/loc>/g)]
    .map((match) => match[1].replace(/&amp;/g, "&"));
}

async function discoverPublishedRoutes(request) {
  const response = await request.get(origin + "/sitemap-index.xml", { timeout: 30000 });
  assert.equal(response.status(), 200, "Deployed sitemap-index.xml is unavailable");
  const sitemaps = sitemapLocations(await response.text());
  assert(sitemaps.length > 0, "Sitemap index does not reference any sitemaps");

  const discovered = new Set();
  for (const location of sitemaps) {
    const url = new URL(location, origin);
    assert.equal(url.origin, origin, "Sitemap references an unexpected origin");
    const page = await request.get(url.href, { timeout: 30000 });
    assert.equal(page.status(), 200, "Sitemap page unavailable: " + url.pathname);
    for (const entry of sitemapLocations(await page.text())) {
      const target = new URL(entry, origin);
      assert.equal(target.origin, origin, "Published page references an unexpected origin");
      discovered.add(target.pathname);
    }
  }
  const projects = [...discovered].filter((path) =>
    /^\/projects\/[^/]+\/$/.test(path) &&
    !["/projects/firefly/", "/projects/example-project/"].includes(path)).sort();
  const posts = [...discovered].filter((path) => /^\/posts\/.+\/$/.test(path)).sort();
  assert(projects.length >= 8, "Expected at least eight published project pages");
  assert(posts.length >= 15, "Expected at least fifteen published articles");
  return [
    { path: "/projects/", kind: "projects" },
    ...projects.map((path) => ({ path, kind: "project" })),
    { path: "/list/", kind: "articles" },
    ...posts.map((path) => ({
      path, kind: "post", minImages: minimumArticleIllustrations.get(path) || 0,
    })),
  ];
}

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
    const protectedArticle = page.locator("#encrypted-container");
    if (await protectedArticle.count()) {
      const lock = protectedArticle.locator("#password-form");
      await lock.waitFor({ state: "visible", timeout: 12000 });
      assert(await lock.locator('input[type="password"]').count() === 1,
        item.path + " missing protected article password control");
    } else {
      const body = page.locator(".markdown-content").first();
      await body.waitFor({ state: "attached", timeout: 18000 });
      await body.locator("details").evaluateAll((els) => els.forEach((el) => { el.open = true; }));
      const count = await body.locator("img:not(.external-link__favicon)").count();
      if (item.minImages) {
        assert(count >= item.minImages, item.path + " expected " + item.minImages + " article illustrations, got " + count);
      }
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
    const discoveryContext = await browser.newContext();
    let routes;
    try { routes = await discoverPublishedRoutes(discoveryContext.request); }
    finally { await discoveryContext.close(); }
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
