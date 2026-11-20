// Image upload adapted from the old Firefly admin; restricted to the new preview repo.
// Only explicitly authorized PNG/JPEG/WebP/GIF are accepted; no SVG or script content.
import { privateJson, requirePreviewAdmin } from "../../../src/lib/preview-admin-auth.js";

const MAX_IMAGE_BYTES = 4 * 1024 * 1024;
const MIME_EXTENSIONS = Object.freeze({
  "image/png": "png",
  "image/jpeg": "jpg",
  "image/webp": "webp",
  "image/gif": "gif",
});

function imageSignature(bytes, mime) {
  if (mime === "image/png") {
    return bytes.length >= 8 &&
      bytes[0] === 0x89 && bytes[1] === 0x50 &&
      bytes[2] === 0x4e && bytes[3] === 0x47 &&
      bytes[4] === 0x0d && bytes[5] === 0x0a &&
      bytes[6] === 0x1a && bytes[7] === 0x0a;
  }
  if (mime === "image/jpeg") {
    return bytes.length >= 3 &&
      bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff;
  }
  if (mime === "image/gif") {
    const header = new TextDecoder().decode(bytes.subarray(0, 6));
    return header === "GIF87a" || header === "GIF89a";
  }
  if (mime === "image/webp") {
    return bytes.length >= 12 &&
      new TextDecoder().decode(bytes.subarray(0, 4)) === "RIFF" &&
      new TextDecoder().decode(bytes.subarray(8, 12)) === "WEBP";
  }
  return false;
}

function encode(bytes) {
  let binary = "";
  for (let index = 0; index < bytes.length; index += 8192) {
    binary += String.fromCharCode(...bytes.subarray(index, index + 8192));
  }
  return btoa(binary);
}

// Register an all-method route to ensure direct-upload Pages deployments
// never fall back to a static 404 for the upload URL.
export async function onRequest({ request, env }) {
  const denied = await requirePreviewAdmin(request, env);
  if (denied) return denied;
  if (request.method !== "POST") {
    return privateJson({ error: "图片接口只接受 POST 请求。" }, 405);
  }
  const token = String(env.SPACE_GITHUB_CONTENTS_TOKEN || "").trim();
  if (!token) return privateJson({ error: "后台尚未配置 GitHub 写入密钥。" }, 503);

  const origin = new URL(request.url).origin;
  if (request.headers.get("Origin") !== origin ||
      request.headers.get("X-Requested-With") !== "Space-Admin" ||
      !request.headers.get("Content-Type")?.toLowerCase().startsWith("multipart/form-data;")) {
    return privateJson({ error: "图片上传只能从已登录的同源后台进行。" }, 403);
  }
  const length = request.headers.get("Content-Length");
  if (length && (!/^\d+$/.test(length) || Number(length) > 5 * 1024 * 1024)) {
    return privateJson({ error: "上传请求不能超过 5 MiB。" }, 413);
  }

  try {
    const form = await request.formData();
    const file = form.get("file");
    if (!(file instanceof File) || file.size <= 0 || file.size > MAX_IMAGE_BYTES) {
      return privateJson({ error: "请选择不超过 4 MiB 的图片。" }, 413);
    }
    const mime = file.type.toLowerCase();
    const ext = MIME_EXTENSIONS[mime];
    if (!ext) return privateJson({ error: "只支持 PNG、JPEG、WebP、GIF 图片。" }, 415);
    const bytes = new Uint8Array(await file.arrayBuffer());
    if (!imageSignature(bytes, mime)) {
      return privateJson({ error: "文件内容与图片格式不符，上传被拒绝。" }, 415);
    }

    const now = new Date().toISOString().slice(0, 10).replaceAll("-", "");
    const name = now + "-" + crypto.randomUUID().replaceAll("-", "").slice(0, 12) + "." + ext;
    const path = "public/uploads/" + name;
    const response = await fetch("https://api.github.com/repos/07xh/space/contents/" + path, {
      method: "PUT",
      headers: {
        Accept: "application/vnd.github+json",
        Authorization: "Bearer " + token,
        "X-GitHub-Api-Version": "2022-11-28",
        "Content-Type": "application/json",
        "User-Agent": "07xh-Space-Publishing",
      },
      body: JSON.stringify({
        branch: "main",
        message: "Upload preview article image: " + name,
        content: encode(bytes),
      }),
      signal: AbortSignal.timeout(20000),
    });
    if (!response.ok) {
      return privateJson({ error: "GitHub 图片保存失败（HTTP " + response.status + "）。" },
        response.status === 409 ? 409 : 502);
    }
    const result = await response.json();
    return privateJson({
      ok: true, imageUrl: "/uploads/" + name, path,
      commit: result.commit?.sha || null,
      note: "图片已提交 GitHub；需等待预览站部署后才能从网站访问。",
    }, 201);
  } catch {
    return privateJson({ error: "图片上传失败，请检查网络、权限及文件大小。" }, 503);
  }
}
