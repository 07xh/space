// Browser-level regression test for article illustrations migrated from Firefly.
// Run against a built Astro preview after the static reference audit passes.
const { chromium } = require(process.env.SPACE_PLAYWRIGHT_PATH || "playwright");
const assert = require("node:assert/strict");

const origin = process.env.SPACE_PREVIEW_URL || "http://127.0.0.1:4321";
const articles = [
  ["combination-dimensioning-guide", 2],
  ["complex-combination-silhouette-vs-occlusion", 7],
  ["draftai-geometry-logic", 7],
  ["engineering-composite-three-views-guide", 3],
  ["engineering-drawing-exercise-3-14-visibility", 6],
  ["engineering-drawing-visible-hidden-lines", 2],
  ["engineering-three-view-corresponding-points", 4],
];

async function run() {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
  let total = 0;
  try {
    for (const [slug, expected] of articles) {
      const url = new URL("/posts/" + slug + "/", origin).toString();
      const response = await page.goto(url, { waitUntil: "domcontentloaded", timeout: 60000 });
      assert.equal(response?.status(), 200, slug + ": article did not return HTTP 200");

      const article = page.locator(".markdown-content").first();
      await article.waitFor({ state: "attached", timeout: 15000 });
      // Some diagrams may be inside expandable step-by-step explanations.
      await article.locator("details").evaluateAll((items) => items.forEach((item) => { item.open = true; }));
      const pictures = article.locator("img");
      const count = await pictures.count();
      assert(count >= expected, slug + ": expected " + expected + " illustrations, got " + count);
      for (let i = 0; i < count; i++) {
        const img = pictures.nth(i);
        const src = await img.getAttribute("src");
        assert(src, slug + ": image missing src");
        const target = new URL(src, url);
        assert.equal(target.origin, new URL(origin).origin, slug + ": unexpected external body image " + src);

        const resource = await page.request.get(target.toString(), { timeout: 20000 });
        assert.equal(resource.status(), 200, slug + ": image request failed " + target.pathname);
        assert((resource.headers()["content-type"] || "").startsWith("image/"),
          slug + ": image has wrong content-type " + target.pathname);

        await img.scrollIntoViewIfNeeded({ timeout: 15000 });
        await img.evaluate((element) => element.decode());
        assert(await img.evaluate((element) => element.naturalWidth > 0 && element.naturalHeight > 0),
          slug + ": browser could not decode " + target.pathname);
      }
      total += count;
      console.log(slug + ": " + count + " images render successfully");
    }
    console.log("Article image browser check passed: " + articles.length + " articles, " + total + " images.");
  } finally {
    await browser.close();
  }
}

run().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
