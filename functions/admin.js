// Minimal private publishing workspace. Reuses the old Firefly admin's light/green
// visual direction but keeps new Space preview completely separate from that site.
import { privateJson, requirePreviewAdmin } from "../src/lib/preview-admin-auth.js";

const HTML = String.raw`<!doctype html>
<html lang="zh-CN">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <meta name="robots" content="noindex,nofollow">
  <title>小慌 · 预览站内容管理</title>
  <style nonce="__NONCE__">
    :root{color-scheme:light;--bg:#f5f8f6;--panel:#fff;--text:#25372c;--muted:#60756b;--edge:#dce9e0;--accent:#147b4a}
    *{box-sizing:border-box}body{margin:0;background:var(--bg);color:var(--text);font:15px/1.6 system-ui,-apple-system,"PingFang SC","Microsoft YaHei",sans-serif}
    a{color:var(--accent)}header{background:#fff;border-bottom:1px solid var(--edge);padding:18px clamp(18px,4vw,48px)}
    h1{font-size:21px;margin:0;font-weight:750}header p{color:var(--muted);margin:4px 0 0}
    main{max-width:1280px;margin:24px auto;padding:0 18px;display:grid;grid-template-columns:minmax(240px,320px) minmax(0,1fr);gap:20px}
    section{border-radius:18px;padding:22px;background:var(--panel);border:1px solid var(--edge);box-shadow:0 10px 35px #20492b08;min-width:0}
    h2{font-size:16px;margin:0 0 15px}label{display:block;font-weight:600;margin:14px 0 6px}
    input,textarea,select,button{font:inherit}
    select,input,textarea{width:100%;border:1px solid #cadccf;border-radius:11px;background:#fff;color:var(--text);padding:10px 12px}
    textarea{height:min(62vh,720px);min-height:360px;resize:vertical;font:13px/1.65 ui-monospace,Consolas,monospace;tab-size:2}
    button{border:1px solid #c7dace;color:var(--text);background:white;border-radius:10px;padding:9px 14px;cursor:pointer}
    button.primary{background:var(--accent);color:#fff;border-color:var(--accent)}
    button.danger{border-color:#eac1c0;color:#9d302c}
    button:disabled{opacity:.5;cursor:progress}
    .toolbar{display:flex;flex-wrap:wrap;gap:9px;margin:16px 0}
    .hint{font-size:13px;color:var(--muted)}.hint strong{color:#775217}
    #status{padding:12px 14px;border:1px solid var(--edge);background:#f7fbf8;border-radius:11px;min-height:48px;overflow-wrap:anywhere}
    #status[data-error="true"]{background:#fff4f3;border-color:#eac1c0;color:#a5312c}
    :focus-visible{outline:3px solid #55b28b;outline-offset:2px}
    @media(max-width:780px){main{grid-template-columns:minmax(0,1fr)}section{padding:16px}textarea{min-height:48vh}}
  </style>
</head>
<body>
<header>
  <h1>小慌 · 内容管理</h1>
  <p>独立预览站 · 只写入 07xh/space · 正式旧站与 0701000.xyz 不受影响</p>
</header>
<main>
  <section aria-label="内容列表">
    <h2>内容列表</h2>
    <label for="kind">内容类型</label>
    <select id="kind"><option value="posts">文章</option><option value="dynamic">动态</option></select>
    <label for="files">GitHub 文件</label>
    <select id="files" size="12" aria-label="选择文章或动态文件"></select>
    <div class="toolbar">
      <button id="refresh" type="button">刷新</button>
      <button id="new" type="button">新建草稿</button>
      <button id="load" type="button">打开</button>
    </div>
    <p class="hint"><strong>发布方式：</strong>保存至新仓库的 main 分支后，由 GitHub Actions 构建部署预览站。完成提交不等于部署已生效。</p>
    <p class="hint"><a href="/" target="_blank" rel="noopener">打开预览站</a> · <a href="https://github.com/07xh/space/actions" target="_blank" rel="noopener">查看部署状态</a></p>
  </section>
  <section aria-label="内容编辑">
    <h2>Markdown 编辑</h2>
    <p id="publish-state" class="hint" aria-live="polite">当前状态：未打开内容</p>
    <label for="filename">当前文件路径</label>
    <input id="filename" readonly placeholder="先选择文件或新建">
    <label for="editor">Frontmatter 与 Markdown</label>
    <textarea id="editor" spellcheck="false" aria-label="Markdown 文本编辑器" placeholder="先从左侧打开文件"></textarea>
    <label for="image-file">文章图片（PNG、JPEG、WebP、GIF，不超过 4 MiB）</label>
    <input id="image-file" type="file" accept="image/png,image/jpeg,image/webp,image/gif" aria-label="选择图片">
    <div class="toolbar">
      <button id="upload" type="button">上传图片并插入 Markdown</button>
      <button id="save" type="button">保存修改</button>
      <button class="primary" id="publish" type="button">发布到预览站</button>
      <button class="danger" id="delete" type="button">删除当前文件</button>
    </div>
    <p id="status" role="status" aria-live="polite">已加载编辑器。后台 API 通过 Cloudflare Access 身份验证。</p>
  </section>
</main>
<script nonce="__NONCE__">
(() => {
  "use strict";
  const get = (id) => document.getElementById(id);
  const kind = get("kind");
  const files = get("files");
  const filename = get("filename");
  const editor = get("editor");
  const status = get("status");
  const publishState = get("publish-state");
  let sha = "";
  let isNew = false;
  let isBusy = false;
  function draftStatus(text) {
    const metadata = text.match(/^---\r?\n([\s\S]*?)\r?\n---/);
    if (!metadata) return "无有效 Frontmatter";
    return /^draft:\s*true\s*$/m.test(metadata[1]) ? "草稿（不公开）" : "已公开（保存会更新预览站）";
  }
  function showState() {
    publishState.textContent = "当前状态：" + (filename.value ? draftStatus(editor.value) : "未选择内容");
  }
  function setDraft(text, isDraft) {
    const match = text.match(/^---\r?\n([\s\S]*?)\r?\n---/);
    if (!match) throw new Error("缺少合法 Frontmatter，无法发布。");
    const draftLine = "draft: " + String(isDraft);
    const front = /^draft:\s*(?:true|false)\s*$/m.test(match[1])
      ? match[1].replace(/^draft:\s*(?:true|false)\s*$/m, draftLine)
      : match[1] + "\n" + draftLine;
    return text.replace(match[0], "---\n" + front + "\n---");
  }
  function info(message, isError = false) {
    status.textContent = message;
    status.dataset.error = String(isError);
  }
  function busy(next) {
    isBusy = next;
    for (const id of ["kind","files","refresh","new","load","save","publish","delete","upload","image-file"]) get(id).disabled = next;
  }
  async function request(method, path, body) {
    const options = { method, credentials: "same-origin", headers: { "X-Requested-With": "Space-Admin" } };
    if (body) {
      options.headers["Content-Type"] = "application/json";
      options.body = JSON.stringify(body);
    }
    const response = await fetch("/api/admin/content?kind=" + encodeURIComponent(kind.value) +
      (path ? "&path=" + encodeURIComponent(path) : ""), options);
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(data.error || "HTTP " + response.status);
    return data;
  }
  async function refresh() {
    if (isBusy) return;
    busy(true);
    try {
      const data = await request("GET");
      files.replaceChildren();
      for (const item of data.items) {
        const option = new Option(item.path.slice(("src/content/" + kind.value + "/").length), item.path);
        files.add(option);
      }
      info("目录已更新，共 " + data.items.length + " 个文件。");
    } catch (error) { info(error.message, true); }
    finally { busy(false); }
  }
  async function load() {
    if (isBusy || !files.value) return;
    busy(true);
    try {
      const result = await request("GET", files.value);
      filename.value = result.path;
      editor.value = result.content;
      sha = result.sha;
      isNew = false;
      showState();
      info("已打开 " + result.path + "；当前版本已记录，保存会检查并发修改。");
    } catch (error) { info(error.message, true); }
    finally { busy(false); }
  }
  function create() {
    if (isBusy) return;
    const name = prompt("输入文件名（仅字母、数字、连字符、下划线，不含扩展名）");
    if (!name) return;
    const slug = name.trim();
    if (!/^[A-Za-z0-9][A-Za-z0-9_-]{0,70}$/.test(slug)) {
      info("文件名格式不正确。", true);
      return;
    }
    const today = new Date().toISOString().slice(0, 10);
    filename.value = "src/content/" + kind.value + "/" + slug + ".md";
    editor.value = kind.value === "posts"
      ? "---\ntitle: \"新文章\"\npublished: " + today +
        "\ndescription: \"\"\ndraft: true\ncategory: \"\"\ntags: []\n---\n\n在这里编写正文。\n"
      : "---\npublished: " + today + "\ndraft: true\npinned: false\n---\n\n在这里编写动态。\n";
    sha = "";
    isNew = true;
    showState();
    info("已创建本地草稿，尚未写入 GitHub；保存后才会触发预览站部署。");
  }
  async function save(publish = false) {
    if (isBusy || !filename.value) return info("请先打开文件或新建草稿。", true);
    let content;
    try { content = publish ? setDraft(editor.value, false) : editor.value; }
    catch (error) { return info(error.message, true); }
    const publicNow = draftStatus(content).startsWith("已公开");
    if (publish) {
      if (!confirm("确认将此内容公开发布到独立预览站？保存后会提交 GitHub 并触发部署。")) return;
    } else if (publicNow) {
      if (!confirm("此内容已公开。保存修改会更新预览站上的公开内容，确定继续？")) return;
    }
    const method = isNew ? "POST" : "PUT";
    busy(true);
    try {
      const body = { kind: kind.value, path: filename.value, content };
      if (!isNew) body.sha = sha;
      const result = await request(method, "", body);
      editor.value = content;
      isNew = false;
      sha = result.sha || "";
      showState();
      info("已提交 GitHub：" + (result.commit || "成功") +
        "。当前是" + (publicNow ? "公开内容" : "草稿") +
        "；预览站仍需等待自动部署完成。");
      const current = filename.value;
      await request("GET").then((data) => {
        files.replaceChildren();
        for (const item of data.items) files.add(new Option(item.path, item.path));
        files.value = current;
      });
    } catch (error) { info(error.message, true); }
    finally { busy(false); }
  }
  async function upload() {
    if (isBusy || !filename.value) return info("请先新建或打开内容，再上传图片。", true);
    const imageInput = get("image-file");
    const image = imageInput.files?.[0];
    if (!image) return info("请先选择一张图片。", true);
    if (image.size > 4 * 1024 * 1024) return info("图片不能超过 4 MiB。", true);
    busy(true);
    try {
      const data = new FormData();
      data.append("file", image);
      const response = await fetch("/api/admin/upload", {
        method: "POST", credentials: "same-origin",
        headers: { "X-Requested-With": "Space-Admin" }, body: data,
      });
      const result = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(result.error || "图片上传失败（HTTP " + response.status + "）");
      const markdown = "![图片](" + result.imageUrl + ")";
      editor.setRangeText(markdown, editor.selectionStart, editor.selectionEnd, "end");
      editor.focus();
      imageInput.value = "";
      info("图片已保存到 07xh/space：" + result.imageUrl +
        "。Markdown 已插入；预览站部署完成后图片才可访问。请保存正文。");
    } catch (error) { info(error.message, true); }
    finally { busy(false); }
  }
  async function remove() {
    if (isBusy || isNew || !filename.value || !sha) return;
    if (!confirm("确定永久删除 " + filename.value + "？此操作会提交到新博客仓库。")) return;
    busy(true);
    try {
      const result = await request("DELETE", "", { kind: kind.value, path: filename.value, sha });
      filename.value = "";
      editor.value = "";
      sha = "";
      showState();
      info("已提交删除：" + (result.commit || "成功") + "。");
    } catch (error) { info(error.message, true); }
    finally { busy(false); }
    await refresh();
  }
  editor.addEventListener("input", showState);
  get("refresh").addEventListener("click", refresh);
  get("new").addEventListener("click", create);
  get("load").addEventListener("click", load);
  get("upload").addEventListener("click", upload);
  get("save").addEventListener("click", () => save(false));
  get("publish").addEventListener("click", () => save(true));
  get("delete").addEventListener("click", remove);
  kind.addEventListener("change", () => {
    sha = ""; isNew = false; filename.value = ""; editor.value = "";
    showState();
    refresh();
  });
  refresh();
})();
</script>
</body></html>`;

export async function onRequestGet({ request, env }) {
  const denied = await requirePreviewAdmin(request, env);
  if (denied) return denied;
  if (!String(env.SPACE_GITHUB_CONTENTS_TOKEN || "").trim()) {
    return privateJson({ error: "预览站后台密钥尚未配置，页面保持禁用。" }, 503);
  }
  const nonce = crypto.randomUUID().replace(/-/g, "");
  const html = HTML.replaceAll("__NONCE__", nonce);
  return new Response(html, {
    status: 200,
    headers: {
      "content-type": "text/html; charset=utf-8",
      "cache-control": "private, no-store",
      "x-content-type-options": "nosniff",
      "x-frame-options": "DENY",
      "content-security-policy": "default-src 'none'; style-src 'nonce-" + nonce +
        "'; script-src 'nonce-" + nonce +
        "'; connect-src 'self'; img-src 'self' data:; base-uri 'none'; form-action 'none'; frame-ancestors 'none'",
    },
  });
}
