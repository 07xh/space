import test from "node:test";
import assert from "node:assert/strict";
import { webcrypto } from "node:crypto";
import { readFileSync } from "node:fs";
import {
  requirePreviewAdmin,
  requireSameOriginWrite,
} from "../src/lib/preview-admin-auth.js";
import { onRequest as api } from "../functions/api/admin/content.js";
import { onRequestGet as deployment } from "../functions/api/admin/deployment.js";
import { onRequestGet as editor } from "../functions/admin.js";
import { onRequest as upload } from "../functions/api/admin/upload.js";

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
    assert.equal((await upload({ request: request("/api/admin/upload", null, "POST"), env })).status, 401);
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
      '---\ntitle: "Bad tags"\npublished: 2026-11-20\ndraft: true\ntags: not-an-array\n---\n\nContent',
      '---\ntitle: "Bad comment"\npublished: 2026-11-20\ndraft: true\ncomment: sometimes\n---\n\nContent',
      '---\ntitle: "Bad updated date"\npublished: 2026-11-20\ndraft: true\nupdated: 2026-02-31\n---\n\nContent',
      '---\ntitle: "Bad category"\npublished: 2026-11-20\ndraft: true\ncategory: [not-a-string]\n---\n\nContent',
      '---\ntitle: "Duplicate title"\ntitle: "Second title"\npublished: 2026-11-20\ndraft: true\n---\n\nContent',
      '---\ntitle: "Missing draft"\npublished: 2026-11-20\n---\n\nContent',
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
    const validTyped = await api({
      request: request("/api/admin/content?kind=posts", token, "POST", {
        kind: "posts", path: "src/content/posts/demo.md",
        content: '---\ntitle: "Typed"\npublished: 2026-11-20\ndraft: true\ncomment: false\npinned: true\nupdated: 2026-11-20\ntags: ["学习", "Python"]\n---\n\nContent',
      }), env,
    });
    assert.equal(validTyped.status, 201, "Valid optional types should still be accepted");
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
    assert.match(response.headers.get("content-security-policy"), /img-src 'self' data: blob: https:/,
      "Uploaded blob preview and existing HTTPS images must load");
    const html = await response.text();
    assert.match(html, /id="publish"/);
    assert.match(html, /id="check-deploy"/);
    assert.match(html, /id="unpublish"/);
    assert.match(html, /save\("unpublish"\)/);
    assert.match(html, /确认撤回公开内容/);
    assert.match(html, /id="file-search"/);
    assert.match(html, /fileSearch\.addEventListener\("input"/);
    assert.match(html, /metadata\[0\]\.length/, "Formatting must avoid YAML metadata");
    assert.match(html, /event\.key\.toLowerCase\(\) === "s"/, "Ctrl+S / Cmd+S should save");

    assert.match(html, /id="toggle-preview"/);
    assert.match(html, /id="preview-pane"/);
    assert.match(html, /URL\.createObjectURL\(image\)/);
    assert.match(html, /localImagePreviews\.get\(matched\[2\]\)/);

    assert.match(html, /data-format="bold"/);
    assert.match(html, /data-format="heading"/);
    assert.match(html, /data-format="list"/);
    assert.match(html, /data-format="link"/);
    assert.match(html, /function renderPreview\(\)/);
    assert.match(html, /function populateFiles\(items, selectedPath = ""\)/);
    assert.doesNotMatch(html, /previewPane\.innerHTML\s*=/,
      "Preview must not inject untrusted Markdown as HTML");

    assert.match(html, /GitHub 已确认删除/);
    assert.match(html, /删除请求未确认成功/);
    assert.match(html, /但文件列表刷新失败/);
    assert.doesNotMatch(html, /finally \{ busy\(false\); \}\s*await refresh\(\)/,
      "Deletion must not unconditionally refresh and erase failed-delete errors");
    assert.match(html, /"check-deploy","editor"/, "Editor must be disabled while saving");
    assert.match(html, /now\.getFullYear\(\)/, "Draft date must use browser-local calendar");
    assert.match(html, /\/api\/admin\/deployment\?commit=/);
    assert.match(html, /lastCommitIsPublic/);
    assert.match(html, /草稿或附件提交，不代表正文已公开/);
    assert.match(html, /此次公开内容已进入部署产物/);
    assert.match(html, /function trackCommit\(commit, isPublic = false\)/);
    assert.equal(html.includes('trackCommit("")'), false);
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


test("preview deploy remains GitHub Actions Wrangler direct upload, with private-route guard", () => {
  const yaml = readFileSync(new URL("../.github/workflows/deploy-preview.yml", import.meta.url), "utf8");
  assert.match(yaml, /push:\s*\n\s*branches:\s*\[main\]/);
  assert.match(yaml, /SPACE_WALINE_SERVER_URL:\s*\$\{\{\s*vars\.SPACE_WALINE_SERVER_URL\s*\}\}/);
  assert.match(yaml, /cloudflare\/wrangler-action@v4/);
  assert.match(yaml, /command: pages deploy dist --project-name=07xh-space-preview --branch=main/);
  assert.match(yaml, /node --test tests\/preview-admin\.test\.mjs/);
  assert.match(yaml, /pages functions build functions/);
  assert.match(yaml, /Verify deployed private Functions remain protected/);
  assert.match(yaml, /\/api\/admin\/content\?kind=posts/);
  assert.match(yaml, /\/api\/admin\/upload/);
});


test("commit receipt is Access-protected, validates SHA and reads no write secrets", async () => {
  const original = globalThis.fetch;
  globalThis.fetch = async () => { throw new Error("Unverified request must never reach GitHub"); };
  try {
    assert.equal((await deployment({ request: request("/api/admin/deployment?commit=" + "a".repeat(40)), env })).status, 401);
    assert.equal((await deployment({ request: request("/api/admin/deployment?commit=" + "a".repeat(40)), env: {} })).status, 503);
  } finally {
    globalThis.fetch = original;
  }
  const { token, jwk } = await makeAccessToken();
  const calls = [];
  let runs = [];
  globalThis.fetch = async (url, init = {}) => {
    calls.push({ url: String(url), headers: init.headers || {} });
    if (String(url).endsWith("/cdn-cgi/access/certs")) return Response.json({ keys: [jwk] });
    assert.equal(String(url), "https://api.github.com/repos/07xh/space/actions/runs?branch=main&per_page=100");
    assert.equal(init.headers.Authorization, undefined, "Actions metadata must not require Contents:write permission");
    return Response.json({ workflow_runs: runs });
  };
  try {
    const bad = await deployment({ request: request("/api/admin/deployment?commit=../../etc/passwd", token), env });
    assert.equal(bad.status, 400);
    assert.equal(calls.filter((call) => call.url.includes("api.github.com")).length, 0);

    const commit = "d".repeat(40);
    const url = "/api/admin/deployment?commit=" + commit;
    const deployRun = { name: "Deploy Cloudflare Pages preview", head_sha: commit,
      head_branch: "main", event: "push", id: 123,
      status: "in_progress", conclusion: null };
    const verification = { name: "Verify deployed preview article and project pages",
      head_sha: commit, head_branch: "main", event: "workflow_run",
      id: 124, status: "in_progress", conclusion: null };
    async function phase() {
      const response = await deployment({ request: request(url, token), env });
      assert.equal(response.status, 200);
      return response.json();
    }
    assert.equal((await phase()).phase, "not_found");
    runs = [deployRun];
    assert.equal((await phase()).phase, "deploying");
    deployRun.status = "completed";
    deployRun.conclusion = "success";
    const uploaded = await phase();
    assert.equal(uploaded.phase, "deployed");
    assert.equal(uploaded.deploy.url, "https://github.com/07xh/space/actions/runs/123");
    runs = [verification, deployRun];
    assert.equal((await phase()).phase, "verifying");
    verification.status = "completed";
    verification.conclusion = "failure";
    assert.equal((await phase()).phase, "verification_failed");
    verification.conclusion = "success";
    assert.equal((await phase()).phase, "verified");
    deployRun.conclusion = "failure";
    assert.equal((await phase()).phase, "deploy_failed");
  } finally {
    globalThis.fetch = original;
  }
});


test("delete only targets allowlisted content; GitHub SHA conflicts do not report success", async () => {
  const { token, jwk } = await makeAccessToken();
  const original = globalThis.fetch;
  const calls = [];
  globalThis.fetch = async (url, options) => {
    if (String(url).endsWith("/cdn-cgi/access/certs")) return Response.json({ keys: [jwk] });
    assert.equal(String(url), "https://api.github.com/repos/07xh/space/contents/src/content/posts/delete-check.md");
    assert.equal(options.method, "DELETE");
    const body = JSON.parse(options.body);
    calls.push(body);
    assert.equal(body.branch, "main");
    if (body.sha === "f".repeat(40)) {
      return Response.json({ message: "Conflict" }, { status: 409 });
    }
    return Response.json({ commit: { sha: "c".repeat(40) } }, { status: 200 });
  };
  try {
    const post = (path, sha) => request("/api/admin/content?kind=posts", token, "DELETE", {
      kind: "posts", path, sha,
    });
    assert.equal((await api({ request: post("src/content/projects/keep.md", "a".repeat(40)), env })).status, 400);
    assert.equal((await api({ request: post("src/content/posts/delete-check.md", ""), env })).status, 409);
    assert.equal(calls.length, 0, "Invalid requests must never write to GitHub");
    const conflict = await api({ request: post("src/content/posts/delete-check.md", "f".repeat(40)), env });
    assert.equal(conflict.status, 409);
    assert.equal((await conflict.json()).ok, undefined);
    const removed = await api({ request: post("src/content/posts/delete-check.md", "a".repeat(40)), env });
    assert.equal(removed.status, 200);
    const data = await removed.json();
    assert.equal(data.ok, true);
    assert.equal(data.commit, "c".repeat(40));
    assert.equal(calls.length, 2);
  } finally {
    globalThis.fetch = original;
  }
});
