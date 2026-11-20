// Fail builds when a locally referenced blog image is missing.
// External links are intentionally not checked; they belong to their respective hosts.
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { dirname, join, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = resolve(fileURLToPath(new URL("..", import.meta.url)));
const postsDir = join(repoRoot, "src", "content", "posts");
const imageExtension = /\.(?:svg|png|jpe?g|webp|gif|avif|apng|bmp|ico)$/i;

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
    /^\s*(?:image|cover|coverImage|thumbnail|poster)\s*:\s*["']?([^"'\s#]+)/gm,
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
  if (!imageExtension.test(normalized)) return null;
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

const documents = walk(postsDir);
const missing = [];
let checked = 0;
for (const documentPath of documents) {
  const content = withoutCodeBlocks(readFileSync(documentPath, "utf8"));
  for (const reference of referencedMedia(content)) {
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
  console.error(`Missing ${missing.length} local blog image reference(s):\n${missing.join("\n")}\n`);
  process.exitCode = 1;
} else {
  console.log(`Blog media OK: ${documents.length} articles, ${checked} local image references checked.`);
}
