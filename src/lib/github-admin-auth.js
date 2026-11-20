// 登录只使用公开身份；发布权限仍由独立、限仓库的 Contents Secret 提供。
export const ADMIN_ORIGIN = "https://07xh-space-preview.pages.dev";
const ADMIN_ID = 313783339;
const ADMIN_LOGIN = "07xh";
const FLOW_COOKIE = "__Host-space-oauth";
const SESSION_COOKIE = "__Host-space-session";
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

async function verify(value, type, env) {
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
		const lifetime = type === "flow" ? 600 : 28800;
		if (
			payload.type !== type ||
			payload.origin !== ADMIN_ORIGIN ||
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

function claims(type, seconds) {
	const now = Math.floor(Date.now() / 1000);
	return { type, origin: ADMIN_ORIGIN, iat: now, exp: now + seconds };
}

export async function requireGitHubSession(request, env) {
	if (!configured(env))
		return error("GitHub 后台登录未配置，已禁用访问。", 503);
	if (new URL(request.url).origin !== ADMIN_ORIGIN)
		return error("请使用后台的正式入口。", 403);
	const session = await verify(
		readCookie(request, SESSION_COOKIE),
		"session",
		env,
	);
	return session?.id === ADMIN_ID && session?.login === ADMIN_LOGIN
		? null
		: error("请先通过 GitHub 登录管理员账号。", 401);
}

export async function githubLogin({ request, env }) {
	if (!configured(env))
		return error("GitHub 后台登录未配置，已禁用访问。", 503);
	if (new URL(request.url).origin !== ADMIN_ORIGIN)
		return error("请使用后台的正式入口。", 403);
	const state = base64url(crypto.getRandomValues(new Uint8Array(32)));
	const verifier = base64url(crypto.getRandomValues(new Uint8Array(32)));
	const flow = await sign({ ...claims("flow", 600), state, verifier }, env);
	const url = new URL("https://github.com/login/oauth/authorize");
	url.search = new URLSearchParams({
		client_id: env.SPACE_GITHUB_CLIENT_ID,
		redirect_uri: ADMIN_ORIGIN + "/api/auth/callback",
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
	if (url.origin !== ADMIN_ORIGIN) return error("请使用后台的正式入口。", 403);
	const flow = await verify(readCookie(request, FLOW_COOKIE), "flow", env);
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
		try {
			const exchange = await fetch(
				"https://github.com/login/oauth/access_token",
				{
					method: "POST",
					redirect: "error",
					headers: {
						Accept: "application/json",
						"Content-Type": "application/x-www-form-urlencoded",
					},
					body: new URLSearchParams({
						client_id: env.SPACE_GITHUB_CLIENT_ID,
						client_secret: env.SPACE_GITHUB_CLIENT_SECRET,
						code: url.searchParams.get("code"),
						redirect_uri: ADMIN_ORIGIN + "/api/auth/callback",
						code_verifier: flow.verifier,
					}).toString(),
					signal: AbortSignal.timeout(8000),
				},
			);
			if (!exchange.ok) throw new Error("Exchange unavailable");
			const token = await exchange.json();
			if (
				typeof token.access_token !== "string" ||
				!token.access_token ||
				token.token_type?.toLowerCase() !== "bearer"
			)
				throw new Error("Exchange refused");
			const identity = await fetch("https://api.github.com/user", {
				headers: {
					Authorization: "Bearer " + token.access_token,
					Accept: "application/vnd.github+json",
					"User-Agent": "space-admin-login",
				},
				redirect: "error",
				signal: AbortSignal.timeout(8000),
			});
			if (!identity.ok) throw new Error("Identity unavailable");
			const user = await identity.json();
			if (user.id !== ADMIN_ID || user.login !== ADMIN_LOGIN) {
				result = error("该 GitHub 账号没有后台管理权限。", 403);
			} else {
				// 不在 Cookie、前端或日志中保存 GitHub OAuth Token。
				const session = await sign(
					{ ...claims("session", 28800), id: user.id, login: user.login },
					env,
				);
				result = response(null, 302, {
					location: "/admin",
					"set-cookie": cookie(SESSION_COOKIE, session, 28800),
				});
			}
		} catch {
			result = error("GitHub 登录验证暂不可用，请重新登录。", 502);
		}
	}
	result.headers.append("set-cookie", cookie(FLOW_COOKIE, "", 0));
	return result;
}

export function githubLogout({ request }) {
	if (request.method !== "POST") return response(null, 405, { Allow: "POST" });
	if (
		new URL(request.url).origin !== ADMIN_ORIGIN ||
		request.headers.get("Origin") !== ADMIN_ORIGIN ||
		request.headers.get("X-Requested-With") !== "Space-Admin"
	)
		return error("仅允许同源管理界面退出登录。", 403);
	return response(JSON.stringify({ ok: true }), 200, {
		"set-cookie": cookie(SESSION_COOKIE, "", 0),
	});
}
