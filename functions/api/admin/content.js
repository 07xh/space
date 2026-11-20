// Private GitHub-backed publishing API for 07xh/space only.
// Unauthenticated or unconfigured requests never reach GitHub.
import {
  privateJson,
  requirePreviewAdmin,
  requireSameOriginWrite,
} from "../../../src/lib/preview-admin-auth.js";

const REPO = "07xh/space";
const BRANCH = "main";
const API = "https://api.github.com/repos/" + REPO + "/";

function collection(kind) {
  if (kind === "posts") {
    return {
      root: "src/content/posts/",
      pattern: /^src\/content\/posts\/(?:[\p{L}\p{N}_-]+\/){0,3}[\p{L}\p{N}_-]+\.(?:md|mdx)$/u,
    };
  }
  if (kind === "dynamic") {
    return {
      root: "src/content/dynamic/",
      pattern: /^src\/content\/dynamic\/[A-Za-z0-9_-]+\.md$/,
    };
  }
  return null;
}

function validateMarkdown(kind, text) {
  if (typeof text !== "string" || text.length < 24 ||
      new TextEncoder().encode(text).length > 500_000 ||
      text.includes("\u0000")) return false;
  const match = text.match(/^---\r?\n([\s\S]*?)\r?\n---(?:\r?\n|$)/);
  if (!match) return false;
  const front = match[1];
  if (!/^published:\s*(?:["'])?\d{4}-\d{2}-\d{2}/m.test(front)) return false;
  if (kind === "posts" && !/^title:\s*\S.+$/m.test(front)) return false;
  return true;
}

function encodeUtf8(value) {
  const bytes = new TextEncoder().encode(value);
  let buffer = "";
  for (let i = 0; i < bytes.length; i += 8192) {
    buffer += String.fromCharCode(...bytes.subarray(i, i + 8192));
  }
  return btoa(buffer);
}

function decodeUtf8(value) {
  const binary = atob(value.replace(/\s/g, ""));
  return new TextDecoder().decode(Uint8Array.from(binary, (char) => char.charCodeAt(0)));
}

function encodePath(path) {
  return path.split("/").map(encodeURIComponent).join("/");
}

function gitHeaders(token) {
  return {
    Accept: "application/vnd.github+json",
    Authorization: "Bearer " + token,
    "X-GitHub-Api-Version": "2022-11-28",
    "User-Agent": "07xh-Space-Publishing",
    "Content-Type": "application/json",
  };
}

async function github(token, endpoint, options = {}) {
  const response = await fetch(API + endpoint, {
    ...options,
    headers: gitHeaders(token),
    signal: AbortSignal.timeout(15000),
  });
  return response;
}

async function readRequest(request) {
  const raw = await request.text();
  if (new TextEncoder().encode(raw).length > 600_000) return null;
  try {
    const payload = JSON.parse(raw);
    return payload && typeof payload === "object" && !Array.isArray(payload) ? payload : null;
  } catch {
    return null;
  }
}

async function list(token, info) {
  const response = await github(token, "git/trees/" + BRANCH + "?recursive=1");
  if (!response.ok) return privateJson({ error: "读取文章目录失败（GitHub HTTP " + response.status + "）。" }, 502);
  const data = await response.json();
  if (data.truncated || !Array.isArray(data.tree)) {
    return privateJson({ error: "仓库文件列表不完整，已停止管理操作。" }, 503);
  }
  const items = data.tree
    .filter((entry) => entry.type === "blob" && info.pattern.test(entry.path))
    .map((entry) => ({ path: entry.path, sha: entry.sha, size: entry.size }))
    .sort((a, b) => a.path.localeCompare(b.path, "zh-CN"));
  return privateJson({ items });
}

async function readFile(token, path) {
  const response = await github(token, "contents/" + encodePath(path) + "?ref=" + BRANCH);
  if (response.status === 404) return privateJson({ error: "文件不存在。" }, 404);
  if (!response.ok) return privateJson({ error: "读取文件失败（GitHub HTTP " + response.status + "）。" }, 502);
  const data = await response.json();
  if (data.encoding !== "base64" || typeof data.sha !== "string" || typeof data.content !== "string") {
    return privateJson({ error: "GitHub 文件格式不符合预期。" }, 502);
  }
  return privateJson({ path, sha: data.sha, content: decodeUtf8(data.content) });
}

async function writeFile(token, input, path, method) {
  const isDelete = method === "DELETE";
  const sha = typeof input.sha === "string" && /^[a-f0-9]{40}$/i.test(input.sha) ? input.sha : "";
  if (method !== "POST" && !sha) {
    return privateJson({ error: "缺少文件版本 SHA，请刷新后再修改。" }, 409);
  }
  if (!isDelete && !validateMarkdown(input.kind, input.content)) {
    return privateJson({ error: "正文或 frontmatter 不完整，无法保存。" }, 400);
  }
  const payload = isDelete ? {
    message: "Delete " + path,
    sha,
    branch: BRANCH,
  } : {
    message: (method === "POST" ? "Create " : "Update ") + path,
    content: encodeUtf8(input.content),
    branch: BRANCH,
    ...(sha ? { sha } : {}),
  };
  const response = await github(token, "contents/" + encodePath(path), {
    method: isDelete ? "DELETE" : "PUT",
    body: JSON.stringify(payload),
  });
  if ([409, 422].includes(response.status)) {
    return privateJson({ error: "文件已存在或已被修改；请刷新列表和文件版本后重试。" }, 409);
  }
  if (!response.ok) return privateJson({ error: "GitHub 保存失败（HTTP " + response.status + "）。" }, 502);
  const data = await response.json();
  return privateJson({
    ok: true, path, sha: data.content?.sha || null,
    commit: data.commit?.sha || null,
    commitUrl: data.commit?.html_url || null,
    preview: "保存已提交 GitHub；预览站更新以部署完成为准。",
  }, method === "POST" ? 201 : 200);
}

export async function onRequest(context) {
  const { request, env } = context;
  const denied = await requirePreviewAdmin(request, env);
  if (denied) return denied;
  const token = String(env.SPACE_GITHUB_CONTENTS_TOKEN || "").trim();
  if (!token) return privateJson({ error: "预览站 GitHub 写入密钥未配置，后台保持关闭。" }, 503);
  const url = new URL(request.url);
  const kind = url.searchParams.get("kind");
  const info = collection(kind);
  if (!info) return privateJson({ error: "仅支持文章和动态。" }, 400);
  try {
    if (request.method === "GET") {
      const path = url.searchParams.get("path");
      if (!path) return await list(token, info);
      if (!info.pattern.test(path)) return privateJson({ error: "文件路径不在允许范围内。" }, 400);
      return await readFile(token, path);
    }
    if (!["POST", "PUT", "DELETE"].includes(request.method)) {
      return privateJson({ error: "不支持的请求方法。" }, 405);
    }
    const invalidOrigin = requireSameOriginWrite(request);
    if (invalidOrigin) return invalidOrigin;
    const input = await readRequest(request);
    if (!input || input.kind !== kind || typeof input.path !== "string" ||
        !info.pattern.test(input.path)) {
      return privateJson({ error: "提交字段或路径不合法。" }, 400);
    }
    return await writeFile(token, input, input.path, request.method);
  } catch {
    return privateJson({ error: "后台连接失败，请检查 Pages 绑定与 GitHub 服务状态。" }, 503);
  }
}
