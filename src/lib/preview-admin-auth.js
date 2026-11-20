import { requireGitHubSession, usesGitHubLogin } from "./github-admin-auth.js";
// Shared authentication for the *separate* space preview.
// Fail closed: no configured identity, audience or matching signed JWT => no admin access.
export function privateJson(payload, status = 200) {
	return new Response(JSON.stringify(payload), {
		status,
		headers: {
			"content-type": "application/json; charset=utf-8",
			"cache-control": "private, no-store",
			"x-content-type-options": "nosniff",
			"x-frame-options": "DENY",
		},
	});
}

function decodePart(segment) {
	const normalized = segment.replace(/-/g, "+").replace(/_/g, "/");
	const padded = normalized.padEnd(Math.ceil(normalized.length / 4) * 4, "=");
	const bytes = Uint8Array.from(atob(padded), (char) => char.charCodeAt(0));
	return bytes;
}

function parseJsonPart(segment) {
	return JSON.parse(new TextDecoder().decode(decodePart(segment)));
}

function configuration(env) {
	const team = String(env?.SPACE_ACCESS_TEAM_DOMAIN || "")
		.trim()
		.toLowerCase();
	const aud = String(env?.SPACE_ACCESS_AUD || "").trim();
	const email = String(env?.SPACE_ADMIN_EMAIL || "")
		.trim()
		.toLowerCase();
	if (
		!/^[a-z0-9][a-z0-9-]*\.cloudflareaccess\.com$/.test(team) ||
		!/^[A-Za-z0-9_-]{8,200}$/.test(aud) ||
		!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)
	)
		return null;
	return { team, aud, email };
}

export async function requirePreviewAdmin(request, env) {
	if (usesGitHubLogin(env)) return requireGitHubSession(request, env);
	const settings = configuration(env);
	if (!settings)
		return privateJson({ error: "预览后台未配置身份验证，已禁用访问。" }, 503);
	const token = request.headers.get("Cf-Access-Jwt-Assertion");
	if (!token || token.length > 10000) {
		return privateJson(
			{ error: "请先通过 Cloudflare Access 管理员身份验证。" },
			401,
		);
	}
	try {
		const segments = token.split(".");
		if (segments.length !== 3 || !segments.every(Boolean))
			throw new Error("Invalid JWT");
		const header = parseJsonPart(segments[0]);
		const claims = parseJsonPart(segments[1]);
		if (
			header?.alg !== "RS256" ||
			typeof header.kid !== "string" ||
			header.kid.length > 180 ||
			(header.typ && header.typ !== "JWT")
		)
			throw new Error("Invalid header");
		const now = Math.floor(Date.now() / 1000);
		const audiences = Array.isArray(claims.aud) ? claims.aud : [claims.aud];
		if (
			claims.iss !== "https://" + settings.team ||
			!audiences.includes(settings.aud) ||
			String(claims.email || "").toLowerCase() !== settings.email ||
			!Number.isFinite(claims.exp) ||
			claims.exp < now - 30 ||
			(claims.nbf !== undefined &&
				(!Number.isFinite(claims.nbf) || claims.nbf > now + 30))
		) {
			throw new Error("Invalid identity or token claims");
		}
		const response = await fetch(
			"https://" + settings.team + "/cdn-cgi/access/certs",
			{
				headers: { accept: "application/json" },
				signal: AbortSignal.timeout(8000),
			},
		);
		if (!response.ok) throw new Error("Access public keys unavailable");
		const data = await response.json();
		const jwk = Array.isArray(data.keys)
			? data.keys.find((key) => key.kid === header.kid && key.kty === "RSA")
			: null;
		if (!jwk) throw new Error("Access signing key is unknown");
		const key = await crypto.subtle.importKey(
			"jwk",
			jwk,
			{ name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" },
			false,
			["verify"],
		);
		const signed = new TextEncoder().encode(segments[0] + "." + segments[1]);
		const signature = decodePart(segments[2]);
		if (
			!(await crypto.subtle.verify("RSASSA-PKCS1-v1_5", key, signature, signed))
		) {
			throw new Error("Invalid signature");
		}
		return null;
	} catch {
		return privateJson(
			{ error: "管理员登录凭据无效或验证服务暂不可用。" },
			403,
		);
	}
}

export function requireSameOriginWrite(request) {
	const origin = request.headers.get("Origin");
	const expected = new URL(request.url).origin;
	if (
		origin !== expected ||
		request.headers.get("X-Requested-With") !== "Space-Admin" ||
		!request.headers
			.get("Content-Type")
			?.toLowerCase()
			.startsWith("application/json")
	) {
		return privateJson(
			{ error: "仅允许同源管理界面发起 JSON 写入请求。" },
			403,
		);
	}
	const size = Number(request.headers.get("Content-Length") || 0);
	if (!Number.isFinite(size) || size > 600_000) {
		return privateJson({ error: "提交内容过大。" }, 413);
	}
	return null;
}
