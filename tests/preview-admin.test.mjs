import test from "node:test";
import assert from "node:assert/strict";
import { webcrypto } from "node:crypto";
import {
  requirePreviewAdmin,
  requireSameOriginWrite,
} from "../src/lib/preview-admin-auth.js";
import { onRequest as api } from "../functions/api/admin/content.js";
import { onRequestGet as editor } from "../functions/admin.js";

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
async function makeAccessToken(changes = {}) {
  const keys = await webcrypto.subtle.generateKey({
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
  return { token: signed + "." + b64url(new Uint8Array(signature)), jwk };
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
  const { token, jwk } = await makeAccessToken();
  const original = globalThis.fetch;
  globalThis.fetch = async (url) => {
    assert.equal(url, "https://example.cloudflareaccess.com/cdn-cgi/access/certs");
    return Response.json({ keys: [jwk] });
  };
  try {
    assert.equal(await requirePreviewAdmin(request("/admin", token), env), null);
    const wrongEmail = await makeAccessToken({ email: "attacker@example.test" });
    assert.equal((await requirePreviewAdmin(request("/admin", wrongEmail.token), env)).status, 403);
    const wrongAudience = await makeAccessToken({ aud: ["another-audience"] });
    assert.equal((await requirePreviewAdmin(request("/admin", wrongAudience.token), env)).status, 403);
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
  } finally {
    globalThis.fetch = original;
  }
});
