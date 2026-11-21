// 登录只使用公开身份；发布权限仍由独立、限仓库的 Contents Secret 提供。
// 双域名过渡：域名迁移期间保留原预览入口，Cookie 和会话只在同源有效。
export const ADMIN_ORIGIN = "https://0701000.xyz";
export const PREVIEW_ORIGIN = "https://07xh-space-preview.pages.dev";
const ADMIN_ORIGINS = new Set([ADMIN_ORIGIN, PREVIEW_ORIGIN]);
function allowedOrigin(request) {
	const origin = new URL(request.url).origin;
	return ADMIN_ORIGINS.has(origin) ? origin : null;
}
const ADMIN_ID = 313783339;
const ADMIN_LOGIN = "07xh";
const FLOW_COOKIE = "__Host-space-oauth";
const SESSION_COOKIE = "__Host-space-session";
const TRUSTED_COOKIE = "__Host-space-trusted";
const TRUSTED_SECONDS = 30 * 24 * 60 * 60;
const encoder = new TextEncoder();

export function usesGitHubLogin(env) {
	return [
		env?.SPACE_GITHUB_CLIENT_ID,
		env?.SPACE_GITHUB_CLIENT_SECRET,
		env?.SPACE_SESSION_SECRET,
	].some((value) => value !== undefined);
}

function configured(env) {
	return (
		typeof env?.SPACE_GITHUB_CLIENT_ID === "string" &&
		env.SPACE_GITHUB_CLIENT_ID.trim().length > 0 &&
		typeof env?.SPACE_GITHUB_CLIENT_SECRET === "string" &&
		env.SPACE_GITHUB_CLIENT_SECRET.trim().length > 0 &&
		typeof env?.SPACE_SESSION_SECRET === "string" &&
		env.SPACE_SESSION_SECRET.length >= 32
	);
}

function response(body, status, headers = {}) {
	return new Response(body, {
		status,
		headers: {
			"content-type": "application/json; charset=utf-8",
			"cache-control": "private, no-store",
			"x-content-type-options": "nosniff",
			"x-frame-options": "DENY",
			"referrer-policy": "no-referrer",
			...headers,
		},
	});
}

function error(message, status) {
	return response(JSON.stringify({ error: message }), status);
}

function loginChoicePage() {
	const nonce = crypto.randomUUID().replaceAll("-", "");
	const html = String.raw`<!doctype html>
<html lang="zh-CN"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>小慌 · 后台登录</title>
<style nonce="${nonce}">:root{color-scheme:light}*{box-sizing:border-box}body{min-height:100vh;margin:0;background:#f5f8f6;display:grid;place-items:center;color:#25372c;font:15px/1.7 system-ui,-apple-system,"PingFang SC",sans-serif}main{width:min(440px,calc(100% - 32px));padding:32px;border:1px solid #dce9e0;border-radius:18px;background:#fff}h1{font-size:23px;margin:0 0 10px}p{color:#60756b}label{display:flex;gap:10px;align-items:flex-start;margin:20px 0}input{width:18px;height:18px;flex-shrink:0;margin-top:4px;accent-color:#147b4a}button{width:100%;padding:12px;border:0;border-radius:10px;background:#147b4a;color:#fff;font:inherit;font-weight:650;cursor:pointer}small{display:block;margin-top:14px;color:#60756b}</style>
</head><body><main><h1>小慌 · 内容管理</h1><p>继续使用已经设置好的 GitHub 账号验证身份，不需要新建账号或重配 OAuth。</p>
<form method="GET" action="/api/auth/login"><input type="hidden" name="begin" value="1">
<label><input type="checkbox" name="remember" value="1"><span>信任此设备，30 天内免重复 GitHub 登录</span></label>
<button type="submit">使用 GitHub 登录</button></form>
<small>仅在自己的设备上勾选。首次授权仍需访问 GitHub；后台发布继续由服务器连接 GitHub。</small>
</main></body></html>`;
	return new Response(html, { status: 200, headers: {
		"content-type": "text/html; charset=utf-8", "cache-control": "private, no-store",
		"x-content-type-options": "nosniff", "x-frame-options": "DENY",
		"referrer-policy": "no-referrer",
		"content-security-policy": "default-src 'none'; style-src 'nonce-" + nonce + "'; form-action 'self'; base-uri 'none'; frame-ancestors 'none'",
	} });
}

function adminIdentity(payload) {
	return payload?.id === ADMIN_ID && payload?.login === ADMIN_LOGIN;
}

function base64url(bytes) {
	return btoa(String.fromCharCode(...new Uint8Array(bytes)))
		.replaceAll("+", "-")
		.replaceAll("/", "_")
		.replace(/=+$/, "");
}

function unbase64url(text) {
	if (!/^[A-Za-z0-9_-]+$/.test(text)) throw new Error("Invalid encoding");
	return Uint8Array.from(
		atob(text.replaceAll("-", "+").replaceAll("_", "/")),
		(char) => char.charCodeAt(0),
	);
}

function cookie(name, value, seconds) {
	return `${name}=${value}; Path=/; Max-Age=${seconds}; Secure; HttpOnly; SameSite=Lax`;
}

function readCookie(request, name) {
	const matches = (request.headers.get("Cookie") || "")
		.split(";")
		.map((part) => part.trim())
		.filter((part) => part.startsWith(name + "="));
	return matches.length === 1 ? matches[0].slice(name.length + 1) : "";
}

async function key(env) {
	return crypto.subtle.importKey(
		"raw",
		encoder.encode(env.SPACE_SESSION_SECRET),
		{ name: "HMAC", hash: "SHA-256" },
		false,
		["sign", "verify"],
	);
}

async function sign(payload, env) {
	const body = base64url(encoder.encode(JSON.stringify(payload)));
	return (
		body +
		"." +
		base64url(
			await crypto.subtle.sign("HMAC", await key(env), encoder.encode(body)),
		)
	);
}

async function verify(value, type, env, origin) {
	if (!value || value.length > 4096) return null;
	try {
		const parts = value.split(".");
		if (
			parts.length !== 2 ||
			!(await crypto.subtle.verify(
				"HMAC",
				await key(env),
				unbase64url(parts[1]),
				encoder.encode(parts[0]),
			))
		)
			return null;
		const payload = JSON.parse(new TextDecoder().decode(unbase64url(parts[0])));
		const now = Math.floor(Date.now() / 1000);
		const lifetime = type === "flow" ? 600 : type === "session" ? 28800 : type === "trusted" ? TRUSTED_SECONDS : 0;
		if (
			payload.type !== type ||
			payload.origin !== origin ||
			!Number.isInteger(payload.exp) ||
			!Number.isInteger(payload.iat) ||
			payload.exp <= now ||
			payload.iat > now ||
			payload.exp - payload.iat !== lifetime
		)
			return null;
		return payload;
	} catch {
		return null;
	}
}

function claims(type, seconds, origin) {
	const now = Math.floor(Date.now() / 1000);
	return { type, origin, iat: now, exp: now + seconds };
}

export async function requireGitHubSession(request, env) {
	if (!configured(env))
		return error("GitHub 后台登录未配置，已禁用访问。", 503);
	const origin = allowedOrigin(request);
	if (!origin) return error("请使用后台的正式入口。", 403);
	const session = await verify(
		readCookie(request, SESSION_COOKIE),
		"session",
		env,
		origin,
	);
	if (adminIdentity(session)) return null;
	// Trusted devices are independently signed, expire after 30 days and cannot self-extend.
	const trusted = await verify(readCookie(request, TRUSTED_COOKIE), "trusted", env, origin);
	return adminIdentity(trusted) ? null : error("请先通过 GitHub 登录管理员账号。", 401);
}

export async function refreshTrustedSessionCookie(request, env) {
	const origin = allowedOrigin(request);
	if (!configured(env) || !origin) return null;
	const trusted = await verify(readCookie(request, TRUSTED_COOKIE), "trusted", env, origin);
	if (!adminIdentity(trusted)) return null;
	const existing = await verify(readCookie(request, SESSION_COOKIE), "session", env, origin);
	const now = Math.floor(Date.now() / 1000);
	if (adminIdentity(existing) && existing.exp - now > 3600) return null;
	const session = await sign({ ...claims("session", 28800, origin), id: ADMIN_ID, login: ADMIN_LOGIN }, env);
	return cookie(SESSION_COOKIE, session, 28800);
}

export async function githubLogin({ request, env }) {
	if (!configured(env))
		return error("GitHub 后台登录未配置，已禁用访问。", 503);
	const urlRequest = new URL(request.url);
	const origin = allowedOrigin(request);
	if (!origin) return error("请使用后台的正式入口。", 403);
	if (!urlRequest.searchParams.has("begin")) return loginChoicePage();
	if (urlRequest.searchParams.get("begin") !== "1" ||
		[...urlRequest.searchParams.keys()].some((name) => !["begin", "remember"].includes(name)) ||
		(urlRequest.searchParams.has("remember") && urlRequest.searchParams.get("remember") !== "1"))
		return error("登录选项无效，请重新发起登录。", 400);
	const remember = urlRequest.searchParams.get("remember") === "1";
	const state = base64url(crypto.getRandomValues(new Uint8Array(32)));
	const verifier = base64url(crypto.getRandomValues(new Uint8Array(32)));
	const flow = await sign({ ...claims("flow", 600, origin), state, verifier, remember }, env);
	const url = new URL("https://github.com/login/oauth/authorize");
	url.search = new URLSearchParams({
		client_id: env.SPACE_GITHUB_CLIENT_ID,
		redirect_uri: origin + "/api/auth/callback",
		scope: "",
		state,
		code_challenge: base64url(
			await crypto.subtle.digest("SHA-256", encoder.encode(verifier)),
		),
		code_challenge_method: "S256",
		login: ADMIN_LOGIN,
		allow_signup: "false",
	}).toString();
	return response(null, 302, {
		location: url.href,
		"set-cookie": cookie(FLOW_COOKIE, flow, 600),
	});
}

export async function githubCallback({ request, env }) {
	if (!configured(env))
		return error("GitHub 后台登录未配置，已禁用访问。", 503);
	const url = new URL(request.url);
	const origin = allowedOrigin(request);
	if (!origin) return error("请使用后台的正式入口。", 403);
	const flow = await verify(readCookie(request, FLOW_COOKIE), "flow", env, origin);
	let result;
	if (
		!flow?.state ||
		!flow.verifier ||
		url.searchParams.getAll("state").length !== 1 ||
		url.searchParams.get("state") !== flow.state ||
		url.searchParams.getAll("code").length !== 1 ||
		!url.searchParams.get("code") ||
		url.searchParams.get("code").length > 512 ||
		url.searchParams.has("error")
	) {
		result = error("GitHub 登录已取消或验证已失效，请重新登录。", 400);
	} else {
		let failureCode = "github_exchange_unavailable";
		let providerStatus;
		try {
			const exchange = await fetch(
				"https://github.com/login/oauth/access_token",
				{
					method: "POST",
					// Workers 不支持 error 模式；manual 配合下方 ok 检查拒绝所有重定向。
					redirect: "manual",
					headers: {
						Accept: "application/json",
						"Content-Type": "application/x-www-form-urlencoded",
					},
					body: new URLSearchParams({
						client_id: env.SPACE_GITHUB_CLIENT_ID,
						client_secret: env.SPACE_GITHUB_CLIENT_SECRET,
						code: url.searchParams.get("code"),
						redirect_uri: origin + "/api/auth/callback",
						code_verifier: flow.verifier,
					}).toString(),
					signal: AbortSignal.timeout(8000),
				},
			);
			providerStatus = exchange.status;
			if (!exchange.ok) throw new Error("Exchange unavailable");
			failureCode = "github_exchange_refused";
			const token = await exchange.json();
			if (
				[
					"incorrect_client_credentials",
					"redirect_uri_mismatch",
					"bad_verification_code",
				].includes(token.error)
			) {
				failureCode = `github_${token.error}`;
			}
			if (
				typeof token.access_token !== "string" ||
				!token.access_token ||
				token.token_type?.toLowerCase() !== "bearer"
			)
				throw new Error("Exchange refused");
			failureCode = "github_identity_unavailable";
			providerStatus = undefined;
			const identity = await fetch("https://api.github.com/user", {
				headers: {
					Authorization: "Bearer " + token.access_token,
					Accept: "application/vnd.github+json",
					"User-Agent": "space-admin-login",
				},
				redirect: "manual",
				signal: AbortSignal.timeout(8000),
			});
			providerStatus = identity.status;
			if (!identity.ok) throw new Error("Identity unavailable");
			const user = await identity.json();
			if (user.id !== ADMIN_ID || user.login !== ADMIN_LOGIN) {
				result = error("该 GitHub 账号没有后台管理权限。", 403);
			} else {
				// 不在 Cookie、前端或日志中保存 GitHub OAuth Token。
				const session = await sign(
					{ ...claims("session", 28800, origin), id: user.id, login: user.login },
					env,
				);
				result = response(null, 302, {
					location: "/admin",
					"set-cookie": cookie(SESSION_COOKIE, session, 28800),
				});
				if (flow.remember === true) {
					const trusted = await sign(
						{ ...claims("trusted", TRUSTED_SECONDS, origin), id: user.id, login: user.login },
						env,
					);
					result.headers.append("set-cookie", cookie(TRUSTED_COOKIE, trusted, TRUSTED_SECONDS));
				} else {
					// An ordinary login must also revoke any earlier trust on this browser.
					result.headers.append("set-cookie", cookie(TRUSTED_COOKIE, "", 0));
				}
			}
		} catch {
			// 只返回有限的故障类别和 HTTP 状态，绝不回显上游正文或凭据。
			result = response(
				JSON.stringify({
					error: "GitHub 登录验证暂不可用，请重新登录。",
					code: failureCode,
					providerStatus,
				}),
				502,
			);
		}
	}
	result.headers.append("set-cookie", cookie(FLOW_COOKIE, "", 0));
	return result;
}

export function githubLogout({ request }) {
	if (request.method !== "POST") return response(null, 405, { Allow: "POST" });
	const origin = allowedOrigin(request);
	if (
		!origin ||
		request.headers.get("Origin") !== origin ||
		request.headers.get("X-Requested-With") !== "Space-Admin"
	)
		return error("仅允许同源管理界面退出登录。", 403);
	const result = response(JSON.stringify({ ok: true }), 200, {
		"set-cookie": cookie(SESSION_COOKIE, "", 0),
	});
	result.headers.append("set-cookie", cookie(TRUSTED_COOKIE, "", 0));
	result.headers.append("set-cookie", cookie(FLOW_COOKIE, "", 0));
	return result;
}
