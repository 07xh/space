// Fail builds when locally referenced article, project, and homepage media is missing.
// External links are intentionally not checked; they belong to their respective hosts.
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { dirname, join, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = resolve(fileURLToPath(new URL("..", import.meta.url)));
const contentDirectories = ["posts", "dynamic", "projects"].map((name) => join(repoRoot, "src", "content", name));
const mediaExtension = /\.(?:svg|png|jpe?g|webp|gif|avif|apng|bmp|ico|mp4|webm)$/i;

function walk(directory) {
  if (!existsSync(directory)) return [];
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const entryPath = join(directory, entry.name);
    return entry.isDirectory()
      ? walk(entryPath)
      : /\.mdx?$/i.test(entry.name) ? [entryPath] : [];
  });
}

function withoutCodeBlocks(markdown) {
  let fence = null;
  return markdown.split(/\r?\n/).map((line) => {
    const marker = line.match(/^\s*(`{3,}|~{3,})/);
    if (marker) {
      if (fence === null) fence = marker[1][0];
      else if (fence === marker[1][0]) fence = null;
      return "";
    }
    return fence === null ? line : "";
  }).join("\n");
}

function referencedMedia(source) {
  const references = new Set();
  const patterns = [
    /!?\[[^\]\n]*\]\(\s*<?([^\s)>]+)>?(?:\s+[^)]*)?\)/g,
    /\b(?:src|href|poster)\s*=\s*["']([^"']+)["']/g,
    /^\s*(?:image|cover|coverImage|thumbnail|poster|video|backgroundImage)\s*:\s*["']?([^"'\s#]+)/gm,
  ];
  for (const pattern of patterns) {
    for (const match of source.matchAll(pattern)) references.add(match[1]);
  }
  return references;
}

function localPath(documentPath, reference) {
  const raw = reference.trim();
  if (/^(?:https?:|data:|blob:|\/\/|#|mailto:|javascript:|\{)/i.test(raw)) return null;
  let normalized;
  try { normalized = decodeURIComponent(raw.split(/[?#]/, 1)[0]); }
  catch { normalized = raw.split(/[?#]/, 1)[0]; }
  if (!mediaExtension.test(normalized)) return null;
  const target = normalized.startsWith("/")
    ? resolve(repoRoot, "public", "." + normalized)
    : resolve(dirname(documentPath), normalized);
  // Only check files inside this checkout.
  const rel = relative(repoRoot, target);
  if (rel === ".." || rel.startsWith(".." + sep)) {
    throw new Error(`Image reference escapes the repository: ${reference}`);
  }
  return target;
}

const documents = [...contentDirectories.flatMap(walk), join(repoRoot, "src", "config", "homeConfig.ts")];
const missing = [];
let checked = 0;
const externalImages = new Set();
for (const documentPath of documents) {
  const content = withoutCodeBlocks(readFileSync(documentPath, "utf8"));
  for (const reference of referencedMedia(content)) {
    if (/^https?:\/\//i.test(reference) && mediaExtension.test(reference.split(/[?#]/, 1)[0])) {
      externalImages.add(reference);
      continue;
    }
    let target;
    try { target = localPath(documentPath, reference); }
    catch (error) {
      missing.push(`${relative(repoRoot, documentPath)}: ${error.message}`);
      continue;
    }
    if (!target) continue;
    checked++;
    if (!existsSync(target)) {
      missing.push(`${relative(repoRoot, documentPath)} -> ${reference}`);
    }
  }
}
if (missing.length) {
  console.error(`Missing ${missing.length} local blog media reference(s):\n${missing.join("\n")}\n`);
  process.exitCode = 1;
} else {
  console.log(`Blog media OK: ${documents.length} content files, ${checked} local media references checked, ${externalImages.size} external image URLs cataloged.`);
}

// Remote checks are opt-in and diagnostic: anti-hotlinking and temporary 403/502 errors
// must not block publication or be misreported as conclusive missing files.
if (process.argv.includes("--remote") && externalImages.size) {
  const urls = [...externalImages].sort();
  let verified = 0;
  let uncertain = 0;
  for (let i = 0; i < urls.length; i += 3) {
    const batch = urls.slice(i, i + 3);
    const observations = await Promise.all(batch.map(async (url) => {
      try {
        let response = await fetch(url, { method: "HEAD", signal: AbortSignal.timeout(8500) });
        if ([403, 405].includes(response.status)) {
          response = await fetch(url, {
            method: "GET",
            headers: { Range: "bytes=0-0" },
            signal: AbortSignal.timeout(8500),
          });
          if (response.body) await response.body.cancel();
        }
        const image = (response.headers.get("content-type") || "").toLowerCase().startsWith("image/");
        return { url, ok: response.ok && image, status: "HTTP " + response.status };
      } catch (error) {
        return { url, ok: false, status: error?.name || "Network error" };
      }
    }));
    for (const observation of observations) {
      if (observation.ok) verified++;
      else uncertain++;
      console.log(`[${observation.ok ? "reachable" : "unverified"}] ${observation.status} ${observation.url}`);
    }
  }
  console.log(`Remote media observation: ${verified} reachable, ${uncertain} unverified. Remote failures do not fail the build.`);
}
