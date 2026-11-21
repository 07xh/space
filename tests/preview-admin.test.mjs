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
const githubEnv = {
  SPACE_GITHUB_CLIENT_ID: "test-client-id",
  SPACE_GITHUB_CLIENT_SECRET: "test-client-secret",
  SPACE_SESSION_SECRET: "test-session-secret-at-least-32-characters-long",
  SPACE_GITHUB_CONTENTS_TOKEN: "test-repository-token",
};

test("GitHub configuration selects session authentication and never falls back to Access", async () => {
  assert.equal((await requirePreviewAdmin(request("/api/admin/content"), githubEnv)).status, 401);
  assert.equal((await requirePreviewAdmin(request("/admin"), { ...env, SPACE_GITHUB_CLIENT_ID: "partial" })).status, 503);
  assert.equal((await requirePreviewAdmin(request("/admin"), { ...env, SPACE_GITHUB_CLIENT_ID: "" })).status, 503);
});

async function oauthFlow(identity = { id: 313783339, login: "07xh" }, remember = false, host = origin) {
  const authRequest = (path, headers = {}) => new Request(host + path, { headers });
  const { onRequestGet: login } = await import("../functions/api/auth/login.js");
  const { onRequestGet: callback } = await import("../functions/api/auth/callback.js");
  const start = await login({ request: authRequest("/api/auth/login?begin=1" + (remember ? "&remember=1" : "")), env: githubEnv });
  assert.equal(start.status, 302);
  const target = new URL(start.headers.get("location"));
  assert.equal(target.origin + target.pathname, "https://github.com/login/oauth/authorize");
  assert.equal(target.searchParams.get("scope"), "");
  assert.equal(target.searchParams.get("redirect_uri"), host + "/api/auth/callback");
  assert.equal(target.searchParams.get("code_challenge_method"), "S256");
  const flowCookie = start.headers.get("set-cookie").split(";")[0];
  const original = globalThis.fetch;
  let exchanges = 0;
  globalThis.fetch = async (url, init) => {
    assert.equal(init.redirect, "manual", "OAuth subrequests must use a Workers-supported no-follow mode");
    if (String(url) === "https://github.com/login/oauth/access_token") {
      exchanges++;
      const body = new URLSearchParams(init.body);
      const digest = await webcrypto.subtle.digest("SHA-256", bytes.encode(body.get("code_verifier")));
      assert.equal(b64url(digest), target.searchParams.get("code_challenge"));
      assert.equal(body.get("redirect_uri"), host + "/api/auth/callback");
      return Response.json({ access_token: "oauth-token-must-stay-server-side", scope: "", token_type: "bearer" });
    }
    assert.equal(String(url), "https://api.github.com/user");
    assert.equal(init.headers.Authorization, "Bearer oauth-token-must-stay-server-side");
    return Response.json(identity);
  };
  try {
    const path = "/api/auth/callback?code=valid-code&state=" + target.searchParams.get("state");
    const context = { request: authRequest(path, { Cookie: flowCookie }), env: githubEnv };
    const badState = await callback({ ...context, request: authRequest(path + "wrong", { Cookie: flowCookie }) });
    assert.equal(badState.status, 400);
    assert.equal(exchanges, 0);
    const missingCookie = await callback({ ...context, request: authRequest(path) });
    assert.equal(missingCookie.status, 400);
    assert.equal(exchanges, 0);
    const result = await callback(context);
    return { result, callback, context };
  } finally { globalThis.fetch = original; }
}

test("GitHub OAuth binds state and PKCE then issues a protected admin session", async () => {
  const { result } = await oauthFlow();
  assert.equal(result.status, 302);
  assert.equal(result.headers.get("location"), "/admin");
  const cookies = result.headers.getSetCookie();
  const session = cookies.find((value) => value.startsWith("__Host-space-session="));
  assert.match(session, /Secure; HttpOnly; SameSite=Lax/);
  assert.match(session, /Path=\//);
  assert.doesNotMatch(session, /Domain=|oauth-token/);
  assert.equal(cookies.some((value) => value.startsWith("__Host-space-trusted=") && !value.includes("Max-Age=0")), false,
    "An ordinary login must never silently remember the device");
  const cookie = session.split(";")[0];
  const authenticated = request("/admin", null, "GET", null, { Cookie: cookie });
  assert.equal(await requirePreviewAdmin(authenticated, githubEnv), null);
  assert.equal((await editor({ request: authenticated, env: githubEnv })).status, 200);
  assert.equal((await requirePreviewAdmin(request("/api/admin/content", null, "GET", null, { Cookie: cookie + "tampered" }), githubEnv)).status, 401);
  assert.equal((await requirePreviewAdmin(new Request("https://alias.pages.dev/admin", { headers: { Cookie: cookie } }), githubEnv)).status, 403);
  const now = Date.now;
  try {
    Date.now = () => now() + 28801 * 1000;
    assert.equal((await requirePreviewAdmin(authenticated, githubEnv)).status, 401);
    Date.now = () => now() - 1000 * 60;
    assert.equal((await requirePreviewAdmin(authenticated, githubEnv)).status, 401);
  } finally { Date.now = now; }
  assert.equal((await requirePreviewAdmin(request("/admin", null, "GET", null, { Cookie: cookie + "; " + cookie }), githubEnv)).status, 401);
  assert.equal((await requirePreviewAdmin(authenticated, { ...githubEnv, SPACE_SESSION_SECRET: "different-secret-at-least-32-characters" })).status, 401);
});

test("Production-domain OAuth and trusted-device cookies remain isolated from preview domain", async () => {
  const production = "https://0701000.xyz";
  const { result } = await oauthFlow(undefined, true, production);
  assert.equal(result.status, 302);
  const cookies = result.headers.getSetCookie();
  const session = cookies.find((value) => value.startsWith("__Host-space-session=")).split(";")[0];
  const trusted = cookies.find((value) => value.startsWith("__Host-space-trusted=")).split(";")[0];
  const productionRequest = new Request(production + "/admin", { headers: { Cookie: session + "; " + trusted } });
  assert.equal(await requirePreviewAdmin(productionRequest, githubEnv), null);
  assert.equal((await editor({ request: productionRequest, env: githubEnv })).status, 200);
  assert.equal((await requirePreviewAdmin(new Request(origin + "/admin", { headers: { Cookie: session + "; " + trusted } }), githubEnv)).status, 401);
  assert.equal((await requirePreviewAdmin(new Request("https://www.0701000.xyz/admin", { headers: { Cookie: session } }), githubEnv)).status, 403);
  assert.equal((await requirePreviewAdmin(new Request("https://0701000.xyz.evil.example/admin", { headers: { Cookie: session } }), githubEnv)).status, 403);
  const { onRequest: logout } = await import("../functions/api/auth/logout.js");
  const loggedOut = await logout({ request: new Request(production + "/api/auth/logout", {
    method: "POST", headers: { Origin: production, "X-Requested-With": "Space-Admin" },
  }), env: githubEnv });
  assert.equal(loggedOut.status, 200);
  assert(loggedOut.headers.getSetCookie().some((value) => value.startsWith("__Host-space-trusted=;")));
  const crossOrigin = await logout({ request: new Request(production + "/api/auth/logout", {
    method: "POST", headers: { Origin: origin, "X-Requested-With": "Space-Admin" },
  }), env: githubEnv });
  assert.equal(crossOrigin.status, 403);
});

test("GitHub callback fails closed without leaking upstream tokens or secrets", async () => {
  const { onRequestGet: login } = await import("../functions/api/auth/login.js");
  const { onRequestGet: callback } = await import("../functions/api/auth/callback.js");
  const original = globalThis.fetch;
  try {
    for (const mode of ["network", "exchange-status", "exchange-redirect", "malformed-token", "identity-status", "identity-redirect"]) {
      const start = await login({ request: request("/api/auth/login?begin=1"), env: githubEnv });
      const target = new URL(start.headers.get("location"));
      const cookie = start.headers.get("set-cookie").split(";")[0];
      globalThis.fetch = async (url) => {
        if (mode === "network") throw new Error("private-upstream-detail");
        if (mode === "exchange-status") return new Response("private-upstream-detail", { status: 500 });
        if (mode === "exchange-redirect") return new Response(null, { status: 302, headers: { Location: "https://evil.example/steal" } });
        if (mode === "malformed-token") return Response.json({ error: "bad_verification_code" });
        return String(url).endsWith("access_token")
          ? Response.json({ access_token: "private-oauth-token", token_type: "bearer" })
          : new Response("private-upstream-detail", { status: mode === "identity-redirect" ? 302 : 401 });
      };
      const context = { request: request("/api/auth/callback?code=valid&state=" + target.searchParams.get("state"), null, "GET", null, { Cookie: cookie }), env: githubEnv };
      const result = await callback(context);
      assert.equal(result.status, 502);
      const failure = await result.json();
      assert.doesNotMatch(JSON.stringify(failure), /private-|test-client-secret/);
      assert.equal(failure.code, {
        network: "github_exchange_unavailable",
        "exchange-status": "github_exchange_unavailable",
        "exchange-redirect": "github_exchange_unavailable",
        "malformed-token": "github_bad_verification_code",
        "identity-status": "github_identity_unavailable",
        "identity-redirect": "github_identity_unavailable",
      }[mode]);
      assert.ok(result.headers.getSetCookie().every((value) => value.includes("Max-Age=0")));
      const now = Date.now;
      try {
        Date.now = () => now() + 601000;
        assert.equal((await callback(context)).status, 400);
      } finally { Date.now = now; }
    }
  } finally { globalThis.fetch = original; }
});

test("GitHub login offers explicit trusted-device choice without changing OAuth credentials", async () => {
  const { onRequestGet: login } = await import("../functions/api/auth/login.js");
  const chooser = await login({ request: request("/api/auth/login"), env: githubEnv });
  assert.equal(chooser.status, 200);
  // Chromium checks the 302 target of a form navigation against form-action.
  // Permit only the GitHub OAuth origin, not arbitrary external form targets.
  assert.match(chooser.headers.get("content-security-policy"), /form-action 'self' https:\/\/github\\.com;/);
  assert.doesNotMatch(chooser.headers.get("content-security-policy"), /form-action [^;]*\\*/);
  const page = await chooser.text();
  assert.match(page, /信任此设备/);
  assert.match(page, /name="remember"/);
  assert.match(page, /使用 GitHub 登录/);
  assert.equal((await login({ request: request("/api/auth/login?begin=0"), env: githubEnv })).status, 400);
  assert.equal((await login({ request: request("/api/auth/login?begin=1&remember=untrusted"), env: githubEnv })).status, 400);
});

test("Trusted device restores session without GitHub for at most 30 days", async () => {
  const { result } = await oauthFlow(undefined, true);
  const cookies = result.headers.getSetCookie();
  const session = cookies.find((value) => value.startsWith("__Host-space-session=")).split(";")[0];
  const trustedHeader = cookies.find((value) => value.startsWith("__Host-space-trusted="));
  assert.match(trustedHeader, /Max-Age=2592000; Secure; HttpOnly; SameSite=Lax/);
  const trusted = trustedHeader.split(";")[0];
  assert.equal(await requirePreviewAdmin(request("/admin", null, "GET", null, { Cookie: trusted }), githubEnv), null);

  const now = Date.now;
  const originalFetch = globalThis.fetch;
  globalThis.fetch = () => { throw new Error("Trusted device restoration must not call GitHub"); };
  try {
    Date.now = () => now() + 28801 * 1000;
    const requestWithTrust = request("/admin", null, "GET", null, { Cookie: session + "; " + trusted });
    assert.equal(await requirePreviewAdmin(requestWithTrust, githubEnv), null);
    const reopened = await editor({ request: requestWithTrust, env: githubEnv });
    assert.equal(reopened.status, 200);
    const renewed = reopened.headers.getSetCookie().find((value) => value.startsWith("__Host-space-session="));
    assert.match(renewed, /Max-Age=28800; Secure; HttpOnly; SameSite=Lax/);
    const wrong = request("/api/admin/content?kind=posts", null, "GET", null, { Cookie: trusted + "tampered" });
    assert.equal((await requirePreviewAdmin(wrong, githubEnv)).status, 401);
    Date.now = () => now() + 2592001 * 1000;
    assert.equal((await requirePreviewAdmin(requestWithTrust, githubEnv)).status, 401);
  } finally {
    Date.now = now;
    globalThis.fetch = originalFetch;
  }
});

test("Logging out clears both regular and trusted sessions", async () => {
  const { onRequest: logout } = await import("../functions/api/auth/logout.js");
  const result = await logout({ request: request("/api/auth/logout", null, "POST", null,
    { Origin: origin, "X-Requested-With": "Space-Admin" }), env: githubEnv });
  assert.equal(result.status, 200);
  const cookies = result.headers.getSetCookie();
  assert(cookies.some((value) => value.startsWith("__Host-space-session=;") && value.includes("Max-Age=0")));
  assert(cookies.some((value) => value.startsWith("__Host-space-trusted=;") && value.includes("Max-Age=0")));
});

test("GitHub session is enforced by actual private APIs before repository requests", async () => {
  const { result } = await oauthFlow();
  const cookie = result.headers.getSetCookie().find((value) => value.startsWith("__Host-space-session=")).split(";")[0];
  const original = globalThis.fetch;
  globalThis.fetch = async () => new Response("repository-unavailable", { status: 503 });
  try {
    const authenticated = request("/api/admin/content?kind=posts", null, "GET", null, { Cookie: cookie });
    assert.equal((await api({ request: authenticated, env: githubEnv })).status, 502);
    assert.equal((await api({ request: request("/api/admin/content?kind=posts"), env: githubEnv })).status, 401);
    assert.equal((await upload({ request: request("/api/admin/upload", null, "POST"), env: githubEnv })).status, 401);
    assert.equal((await deployment({ request: request("/api/admin/deployment?commit=" + "d".repeat(40)), env: githubEnv })).status, 401);
  } finally { globalThis.fetch = original; }
});

test("GitHub callback rejects a renamed account or an account reusing the admin name", async () => {
  for (const identity of [{ id: 313783339, login: "other" }, { id: 1, login: "07xh" }]) {
    const { result } = await oauthFlow(identity);
    assert.equal(result.status, 403);
    assert.ok(!result.headers.getSetCookie().some((cookie) => cookie.startsWith("__Host-space-session=") && !cookie.includes("Max-Age=0")));
  }
});

test("GitHub login is fail closed on missing secrets or unexpected hosts; admin redirects anonymous users", async () => {
  const { onRequestGet: login } = await import("../functions/api/auth/login.js");
  assert.equal((await login({ request: request("/api/auth/login"), env: {} })).status, 503);
  assert.equal((await login({ request: new Request("https://alias.pages.dev/api/auth/login"), env: githubEnv })).status, 403);
  const result = await editor({ request: request("/admin"), env: githubEnv });
  assert.equal(result.status, 302);
  assert.equal(result.headers.get("location"), "/api/auth/login");
});

test("GitHub logout requires a same-origin POST and clears the host session", async () => {
  const { onRequest: logout } = await import("../functions/api/auth/logout.js");
  assert.equal((await logout({ request: request("/api/auth/logout"), env: githubEnv })).status, 405);
  assert.equal((await logout({ request: request("/api/auth/logout", null, "POST", null, { Origin: "https://evil.example", "X-Requested-With": "Space-Admin" }), env: githubEnv })).status, 403);
  const result = await logout({ request: request("/api/auth/logout", null, "POST", {}), env: githubEnv });
  assert.equal(result.status, 200);
  assert.match(result.headers.get("set-cookie"), /__Host-space-session=;.*Max-Age=0/);
});
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
