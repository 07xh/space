import test from "node:test";
import assert from "node:assert/strict";
import { webcrypto } from "node:crypto";
import {
  requirePreviewAdmin,
  requireSameOriginWrite,
} from "../src/lib/preview-admin-auth.js";
import { onRequest as api } from "../functions/api/admin/content.js";
import { onRequestGet as editor } from "../functions/admin.js";
import { onRequestPost as upload } from "../functions/api/admin/upload.js";

const origin = "https://07xh-space-preview.pages.dev";
const env = {
  SPACE_ACCESS_TEAM_DOMAIN: "example.cloudflareaccess.com",
  SPACE_ACCESS_AUD: "test-audience-123",
  SPACE_ADMIN_EMAIL: "owner@example.test",
  SPACE_GITHUB_CONTENTS_TOKEN: "fake-test-only-token",
};
const bytes = new TextEncoder();
function b64url(data) {
  return Buffer.from(data).toString("base64url");
}
async function makeAccessToken(changes = {}, suppliedKeys = null) {
  const keys = suppliedKeys || await webcrypto.subtle.generateKey({
    name: "RSASSA-PKCS1-v1_5",
    modulusLength: 2048,
    publicExponent: new Uint8Array([1, 0, 1]),
    hash: "SHA-256",
  }, true, ["sign", "verify"]);
  const jwk = await webcrypto.subtle.exportKey("jwk", keys.publicKey);
  jwk.kid = "test-signing-key";
  const head = b64url(bytes.encode(JSON.stringify({ typ: "JWT", alg: "RS256", kid: jwk.kid })));
  const claims = {
    iss: "https://" + env.SPACE_ACCESS_TEAM_DOMAIN,
    aud: [env.SPACE_ACCESS_AUD],
    email: env.SPACE_ADMIN_EMAIL,
    exp: Math.floor(Date.now() / 1000) + 120,
    ...changes,
  };
  const body = b64url(bytes.encode(JSON.stringify(claims)));
  const signed = head + "." + body;
  const signature = await webcrypto.subtle.sign("RSASSA-PKCS1-v1_5", keys.privateKey, bytes.encode(signed));
  return { token: signed + "." + b64url(new Uint8Array(signature)), jwk, keys };
}
function request(path, jwt, method = "GET", payload, headers = {}) {
  const h = { ...(jwt ? { "Cf-Access-Jwt-Assertion": jwt } : {}), ...headers };
  if (payload) {
    h["Content-Type"] = "application/json";
    h["X-Requested-With"] = "Space-Admin";
    h.Origin = origin;
  }
  return new Request(origin + path, { method, headers: h, ...(payload ? { body: JSON.stringify(payload) } : {}) });
}

test("admin is fail-closed when identity configuration is missing", async () => {
  const response = await requirePreviewAdmin(request("/admin"), {});
  assert.equal(response.status, 503);
});

test("signed Access identity, audience, email and signature are enforced", async () => {
  const { token, jwk, keys } = await makeAccessToken();
  const original = globalThis.fetch;
  globalThis.fetch = async (url) => {
    assert.equal(url, "https://example.cloudflareaccess.com/cdn-cgi/access/certs");
    return Response.json({ keys: [jwk] });
  };
  try {
    assert.equal(await requirePreviewAdmin(request("/admin", token), env), null);
    const wrongEmail = await makeAccessToken({ email: "attacker@example.test" }, keys);
    assert.equal((await requirePreviewAdmin(request("/admin", wrongEmail.token), env)).status, 403);
    const wrongAudience = await makeAccessToken({ aud: ["another-audience"] }, keys);
    assert.equal((await requirePreviewAdmin(request("/admin", wrongAudience.token), env)).status, 403);
    const expired = await makeAccessToken({ exp: Math.floor(Date.now() / 1000) - 100 }, keys);
    assert.equal((await requirePreviewAdmin(request("/admin", expired.token), env)).status, 403);
    const notYetValid = await makeAccessToken({ nbf: Math.floor(Date.now() / 1000) + 600 }, keys);
    assert.equal((await requirePreviewAdmin(request("/admin", notYetValid.token), env)).status, 403);
    assert.equal((await requirePreviewAdmin(request("/admin", token.slice(0, -5) + "12345"), env)).status, 403);
  } finally {
    globalThis.fetch = original;
  }
});

test("only same-origin JSON writes can reach the publishing API", () => {
  const req = request("/api/admin/content?kind=posts", null, "POST", { test: true });
  assert.equal(requireSameOriginWrite(req), null);
  const external = request("/api/admin/content?kind=posts", null, "POST", null, {
    Origin: "https://evil.example",
    "Content-Type": "application/json",
    "X-Requested-With": "Space-Admin",
  });
  assert.equal(requireSameOriginWrite(external).status, 403);
});

test("missing Access JWT cannot read or write publishing data", async () => {
  const original = globalThis.fetch;
  globalThis.fetch = () => { throw new Error("GitHub must not be called"); };
  try {
    assert.equal((await api({ request: request("/api/admin/content?kind=posts"), env })).status, 401);
    assert.equal((await editor({ request: request("/admin"), env })).status, 401);
  } finally {
    globalThis.fetch = original;
  }
});

test("verified admin can list, create and read only allowlisted content paths", async () => {
  const { token, jwk } = await makeAccessToken();
  const calls = [];
  const original = globalThis.fetch;
  globalThis.fetch = async (url, init) => {
    calls.push({ url: String(url), method: init?.method || "GET" });
    if (String(url).endsWith("/cdn-cgi/access/certs")) return Response.json({ keys: [jwk] });
    if (String(url).includes("/git/trees/")) {
      return Response.json({ truncated: false, tree: [
        { type: "blob", path: "src/content/posts/demo.md", sha: "a".repeat(40), size: 120 },
        { type: "blob", path: "src/content/dynamic/update.md", sha: "b".repeat(40), size: 100 },
        { type: "blob", path: "src/content/projects/secret.md", sha: "c".repeat(40), size: 100 },
      ] });
    }
    if (String(url).includes("/contents/src/content/posts/demo.md")) {
      if (init?.method === "PUT") {
        return Response.json({ content: { sha: "d".repeat(40) }, commit: { sha: "f".repeat(40) } }, { status: 201 });
      }
      return Response.json({ encoding: "base64", sha: "a".repeat(40),
        content: Buffer.from('---\ntitle: "Demo"\npublished: 2026-11-20\n---\n\ncontent').toString("base64") });
    }
    throw new Error("Unexpected GitHub request: " + url);
  };
  try {
    const listResponse = await api({ request: request("/api/admin/content?kind=posts", token), env });
    assert.equal(listResponse.status, 200);
    const list = await listResponse.json();
    assert.deepEqual(list.items.map((item) => item.path), ["src/content/posts/demo.md"]);
    const invalid = await api({ request: request("/api/admin/content?kind=posts&path=src/content/projects/secret.md", token), env });
    assert.equal(invalid.status, 400);
    const read = await api({ request: request("/api/admin/content?kind=posts&path=src/content/posts/demo.md", token), env });
    assert.equal(read.status, 200);
    assert((await read.json()).content.includes('title: "Demo"'));
    const markdown = '---\ntitle: "Demo"\npublished: 2026-11-20\ndraft: true\n---\n\nContent';
    const created = await api({
      request: request("/api/admin/content?kind=posts", token, "POST", {
        kind: "posts", path: "src/content/posts/demo.md", content: markdown,
      }), env,
    });
    assert.equal(created.status, 201);
    assert(calls.every((call) => call.url.includes("cloudflareaccess.com") ||
      call.url.includes("/repos/07xh/space/")));
    assert(calls.some((call) => call.method === "PUT"));
    const invalidPosts = [
      '---\ntitle: "Impossible date"\npublished: 2026-02-31\ndraft: true\n---\n\nContent',
      '---\ntitle: ""\npublished: 2026-11-20\ndraft: true\n---\n\nContent',
      '---\ntitle: "Bad metadata"\npublished: 2026-11-20\ndraft: perhaps\n---\n\nContent',
    ];
    const previousWrites = calls.filter((call) => call.method === "PUT").length;
    for (const content of invalidPosts) {
      const denied = await api({
        request: request("/api/admin/content?kind=posts", token, "POST", {
          kind: "posts", path: "src/content/posts/demo.md", content,
        }), env,
      });
      assert.equal(denied.status, 400, "Malformed article frontmatter must be rejected");
    }
    const invalidMoment = await api({
      request: request("/api/admin/content?kind=dynamic", token, "POST", {
        kind: "dynamic", path: "src/content/dynamic/update.md",
        content: '---\npublished: 2026-11-20\ndraft: true\npinned: someday\n---\n\nContent',
      }), env,
    });
    assert.equal(invalidMoment.status, 400);
    assert.equal(calls.filter((call) => call.method === "PUT").length, previousWrites,
      "Invalid frontmatter must never be submitted to GitHub");
  } finally {
    globalThis.fetch = original;
  }
});


test("preview image upload blocks spoofed formats and writes valid PNG only to new repo", async () => {
  const { token, jwk } = await makeAccessToken();
  const original = globalThis.fetch;
  const calls = [];
  globalThis.fetch = async (url, options) => {
    calls.push({ url: String(url), options });
    if (String(url).endsWith("/cdn-cgi/access/certs")) return Response.json({ keys: [jwk] });
    assert.equal(String(url).startsWith("https://api.github.com/repos/07xh/space/contents/public/uploads/"), true);
    assert.equal(options.method, "PUT");
    const json = JSON.parse(options.body);
    assert.equal(json.branch, "main");
    assert(json.content.startsWith("iVBORw0KGgo="), "PNG binary must be base64-encoded");
    return Response.json({ content: { sha: "a".repeat(40) }, commit: { sha: "b".repeat(40) } }, { status: 201 });
  };
  async function send(file, actualOrigin = origin) {
    const body = new FormData();
    body.set("file", file);
    return upload({
      request: new Request(origin + "/api/admin/upload", {
        method: "POST", body,
        headers: {
          Origin: actualOrigin,
          "X-Requested-With": "Space-Admin",
          "Cf-Access-Jwt-Assertion": token,
        },
      }), env,
    });
  }
  try {
    const badType = await send(new File(["<svg/>"], "x.svg", { type: "image/svg+xml" }));
    assert.equal(badType.status, 415);
    const badSignature = await send(new File(["bad image"], "fake.png", { type: "image/png" }));
    assert.equal(badSignature.status, 415);
    const wrongOrigin = await send(new File(["x"], "x.png", { type: "image/png" }), "https://other.example");
    assert.equal(wrongOrigin.status, 403);
    assert.equal(calls.filter((call) => call.url.includes("api.github.com")).length, 0);

    const png = new File([Uint8Array.from([137,80,78,71,13,10,26,10])], "real.png", { type: "image/png" });
    const result = await send(png);
    assert.equal(result.status, 201);
    const payload = await result.json();
    assert.match(payload.imageUrl, /^\/uploads\/\d{8}-[a-f0-9]{12}\.png$/);
    assert.equal(calls.filter((call) => call.url.includes("api.github.com")).length, 1);
  } finally {
    globalThis.fetch = original;
  }
});


test("private editor includes explicit draft/publish controls and compilable UI script", async () => {
  const { token, jwk } = await makeAccessToken();
  const original = globalThis.fetch;
  globalThis.fetch = async (url) => {
    assert.equal(String(url), "https://example.cloudflareaccess.com/cdn-cgi/access/certs");
    return Response.json({ keys: [jwk] });
  };
  try {
    const response = await editor({ request: request("/admin", token), env });
    assert.equal(response.status, 200);
    const html = await response.text();
    assert.match(html, /id="publish"/);
    assert.match(html, /draft: true/);
    assert.match(html, /发布到预览站/);
    const scripts = [...html.matchAll(/<script[^>]*>([\s\S]*?)<\/script>/g)];
    assert.equal(scripts.length, 1);
    // The function is embedded inside an HTML string: Node's module syntax check
    // alone would not detect an invalid literal or malformed regular expression.
    assert.doesNotThrow(() => new Function(scripts[0][1]));
  } finally {
    globalThis.fetch = original;
  }
});
