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
    .format-bar{display:flex;flex-wrap:wrap;gap:7px;margin:10px 0}
    .format-bar button{font-size:13px;padding:6px 10px}
    .preview-pane{border:1px solid var(--edge);background:#fff;border-radius:11px;padding:18px;min-height:360px;max-height:62vh;overflow:auto;overflow-wrap:anywhere;line-height:1.85}
    .preview-pane :first-child{margin-top:0}
    .preview-pane h1,.preview-pane h2,.preview-pane h3{line-height:1.4;margin:18px 0 9px}
    .preview-pane p,.preview-pane ul,.preview-pane ol,.preview-pane blockquote{margin:8px 0 14px}
    .preview-pane pre{white-space:pre-wrap;overflow-wrap:anywhere;background:#f3f7f5;padding:14px;border-radius:8px;font:13px/1.6 ui-monospace,Consolas,monospace}
    .preview-pane code{background:#f3f7f5;padding:1px 4px;border-radius:4px}
    .preview-pane pre code{padding:0}
    .preview-pane img{max-width:100%;height:auto;border-radius:8px;display:block;margin:8px 0}
    .preview-pane blockquote{border-left:3px solid var(--accent);padding-left:12px;color:var(--muted)}
    .preview-pane a{overflow-wrap:anywhere}
    [hidden]{display:none!important}
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
    <input id="file-search" type="search" placeholder="搜索文章或动态文件名" aria-label="搜索内容文件">
    <p id="file-count" class="hint" aria-live="polite">读取文件列表中…</p>
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
    <div class="format-bar" aria-label="Markdown 快捷格式"><button type="button" data-format="bold">加粗</button><button type="button" data-format="heading">二级标题</button><button type="button" data-format="list">列表</button><button type="button" data-format="code">代码</button><button type="button" data-format="link">链接</button><button id="toggle-preview" type="button" aria-pressed="false">预览正文</button></div>
    <textarea id="editor" spellcheck="false" aria-label="Markdown 文本编辑器" placeholder="先从左侧打开文件"></textarea>
    <div id="preview-pane" class="preview-pane" role="region" aria-label="正文排版预览" hidden></div>
    <p class="hint">预览只展示常用 Markdown 格式，不执行 HTML；正式样式以 Astro 部署后为准。</p>
    <label for="image-file">文章图片（PNG、JPEG、WebP、GIF，不超过 4 MiB）</label>
    <input id="image-file" type="file" accept="image/png,image/jpeg,image/webp,image/gif" aria-label="选择图片">
    <div class="toolbar">
      <button id="upload" type="button">上传图片并插入 Markdown</button>
      <button id="save" type="button">保存修改</button>
      <button class="primary" id="publish" type="button">发布到预览站</button>
      <button id="unpublish" type="button" hidden>撤回公开，改为草稿</button>
      <button class="danger" id="delete" type="button">删除当前文件</button>
    </div>
    <p id="status" role="status" aria-live="polite">已加载编辑器。后台 API 通过 Cloudflare Access 身份验证。</p>
    <div class="toolbar">
      <button id="check-deploy" type="button">检查上次提交的部署进度</button>
      <a id="deploy-link" target="_blank" rel="noopener noreferrer" hidden>查看对应 GitHub Actions</a>
    </div>
    <p id="deploy-status" class="hint" aria-live="polite">本次会话尚无待检查的 GitHub 提交。</p>
  </section>
</main>
<script nonce="__NONCE__">
(() => {
  "use strict";
  const get = (id) => document.getElementById(id);
  const kind = get("kind");
  const files = get("files");
  const fileSearch = get("file-search");
  let listedItems = [];
  const filename = get("filename");
  const editor = get("editor");
  const previewPane = get("preview-pane");
  const previewButton = get("toggle-preview");
  let previewOpen = false;
  const status = get("status");
  const publishState = get("publish-state");
  const deploymentStatus = get("deploy-status");
  const deploymentLink = get("deploy-link");
  let sha = "";
  let isNew = false;
  let isBusy = false;
  let cleanContent = "";
  let activeKind = kind.value;
  let lastCommit = "";
  let lastCommitIsPublic = false;
  const localImagePreviews = new Map();
  window.addEventListener("pagehide", () => {
    for (const blobUrl of localImagePreviews.values()) URL.revokeObjectURL(blobUrl);
    localImagePreviews.clear();
  });
  function hasUnsavedChanges() {
    return Boolean(filename.value) && editor.value !== cleanContent;
  }
  function confirmDiscard() {
    return !hasUnsavedChanges() || confirm("当前内容尚未保存。确定放弃修改？");
  }
  window.addEventListener("beforeunload", (event) => {
    if (!hasUnsavedChanges()) return;
    event.preventDefault();
    event.returnValue = "";
  });
  function draftStatus(text) {
    const metadata = text.match(/^---\r?\n([\s\S]*?)\r?\n---/);
    if (!metadata) return "无有效 Frontmatter";
    return /^draft:\s*true\s*$/m.test(metadata[1]) ? "草稿（不公开）" : "已公开（保存会更新预览站）";
  }
  function showState() {
    const state = filename.value ? draftStatus(editor.value) : "未选择内容";
    publishState.textContent = "当前状态：" + state;
    get("unpublish").hidden = !filename.value || isNew || !state.startsWith("已公开");
    if (previewOpen) renderPreview();
  }
  function insertFormat(type) {
    if (isBusy || !filename.value) return info("请先新建或打开文章。", true);
    if (previewOpen) togglePreview();
    let start = editor.selectionStart, end = editor.selectionEnd;
    // Toolbar actions must never overwrite YAML metadata. When the caret is
    // inside frontmatter, insert at the start of the Markdown body instead.
    const metadata = editor.value.match(/^---\r?\n[\s\S]*?\r?\n---(?:\r?\n|$)/);
    if (metadata && start < metadata[0].length) {
      start = end = metadata[0].length;
      editor.setSelectionRange(start, end);
    }
    const selected = editor.value.slice(start, end);
    let replacement;
    if (type === "bold") replacement = "**" + (selected || "加粗文字") + "**";
    else if (type === "heading") replacement = "## " + (selected || "二级标题");
    else if (type === "list") replacement = selected
      ? selected.split(/\r?\n/).map((line) => "- " + line).join("\n")
      : "- 列表项目";
    else if (type === "code") replacement = String.fromCharCode(96) +
      (selected || "代码") + String.fromCharCode(96);
    else if (type === "link") {
      const address = prompt("输入站内路径或 HTTPS 链接");
      if (!address) return;
      if (!/^https:\/\/[^\s]+$/i.test(address) && !/^\/(?!\/)[^\s]*$/.test(address)) {
        return info("仅支持 HTTPS 链接或站内路径。", true);
      }
      replacement = "[" + (selected || "链接文字") + "](" + address + ")";
    } else return;
    editor.setRangeText(replacement, start, end, "end");
    editor.focus();
    showState();
  }
  function appendInline(node, text) {
    const pattern = /!\[([^\]]*)\]\((https?:\/\/[^\s)]+|\/uploads\/[^\s)]+)\)|\[([^\]]+)\]\((https:\/\/[^\s)]+|\/(?!\/)[^\s)]+)\)|\*\*([^*]+)\*\*|\x60([^\x60]+)\x60/g;
    let cursor = 0, matched;
    while ((matched = pattern.exec(text))) {
      if (matched.index > cursor) node.append(document.createTextNode(text.slice(cursor, matched.index)));
      if (matched[2]) {
        const img = document.createElement("img");
        img.src = localImagePreviews.get(matched[2]) || matched[2];
        img.alt = matched[1] || "文章图片"; img.loading = "lazy";
        img.referrerPolicy = "no-referrer";
        node.append(img);
      } else if (matched[4]) {
        const a = document.createElement("a");
        a.href = matched[4]; a.textContent = matched[3]; a.target = "_blank";
        a.rel = "noopener noreferrer"; node.append(a);
      } else if (matched[5]) {
        const b = document.createElement("strong"); b.textContent = matched[5]; node.append(b);
      } else {
        const code = document.createElement("code"); code.textContent = matched[6]; node.append(code);
      }
      cursor = pattern.lastIndex;
    }
    node.append(document.createTextNode(text.slice(cursor)));
  }
  function renderPreview() {
    previewPane.replaceChildren();
    const source = editor.value.replace(/^---\r?\n[\s\S]*?\r?\n---(?:\r?\n)?/, "");
    const lines = source.split(/\r?\n/);
    let list = null;
    const tick = String.fromCharCode(96);
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i], trimmed = line.trim();
      if (!trimmed) { list = null; continue; }
      if (trimmed.startsWith(tick.repeat(3)) || trimmed.startsWith("~~~")) {
        const marker = trimmed.slice(0, 3), codeLines = [];
        while (++i < lines.length && !lines[i].trim().startsWith(marker)) codeLines.push(lines[i]);
        const pre = document.createElement("pre"), code = document.createElement("code");
        code.textContent = codeLines.join("\n"); pre.append(code); previewPane.append(pre);
        list = null; continue;
      }
      const heading = line.match(/^\s{0,3}(#{1,6})\s+(.+)$/);
      if (heading) {
        const title = document.createElement("h" + heading[1].length);
        appendInline(title, heading[2]); previewPane.append(title); list = null; continue;
      }
      const bullet = line.match(/^\s*(?:[-*+]\s+|\d+\.\s+)(.*)$/);
      if (bullet) {
        const type = /^\s*\d+\./.test(line) ? "ol" : "ul";
        if (!list || list.tagName.toLowerCase() !== type) {
          list = document.createElement(type); previewPane.append(list);
        }
        const item = document.createElement("li"); appendInline(item, bullet[1]); list.append(item);
        continue;
      }
      list = null;
      const quote = line.match(/^\s*>\s?(.*)$/);
      const p = document.createElement(quote ? "blockquote" : "p");
      appendInline(p, quote ? quote[1] : line); previewPane.append(p);
    }
    if (!previewPane.childNodes.length) {
      const p = document.createElement("p"); p.textContent = "正文为空。";
      previewPane.append(p);
    }
  }
  function togglePreview() {
    if (isBusy) return;
    previewOpen = !previewOpen;
    editor.hidden = previewOpen;
    previewPane.hidden = !previewOpen;
    previewButton.textContent = previewOpen ? "返回编辑" : "预览正文";
    previewButton.setAttribute("aria-pressed", String(previewOpen));
    if (previewOpen) renderPreview(); else editor.focus();
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
  function trackCommit(commit, isPublic = false) {
    if (!/^[a-f0-9]{40}$/i.test(String(commit || ""))) return;
    lastCommit = String(commit).toLowerCase();
    lastCommitIsPublic = isPublic;
    deploymentStatus.textContent = "提交 " + lastCommit.slice(0, 8) +
      " 已写入 GitHub（" + (isPublic ? "公开内容" : "草稿或附件") +
      "）；点击按钮核对 Actions 及预览站部署。";
    deploymentLink.hidden = true;
    deploymentLink.removeAttribute("href");
  }
  async function checkDeploy() {
    if (isBusy) return;
    if (!lastCommit) {
      deploymentStatus.textContent = "请先保存文章、动态或上传图片，获取提交编号后再检查。";
      return;
    }
    busy(true);
    deploymentStatus.textContent = "正在查询提交 " + lastCommit.slice(0, 8) + " 的 GitHub Actions 状态…";
    try {
      const response = await fetch("/api/admin/deployment?commit=" + encodeURIComponent(lastCommit), {
        credentials: "same-origin",
        headers: { "X-Requested-With": "Space-Admin" },
      });
      const result = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(result.error || "HTTP " + response.status);
      const messages = {
        not_found: "尚未找到这次提交的部署记录（也可能已超出最近 100 条运行记录）。",
        queued: "GitHub Actions 已触发，目前排队中。",
        deploying: "GitHub Actions 正在构建或上传。",
        deploy_failed: "构建或 Wrangler 部署未成功，请查看对应运行记录。",
        deployed: "GitHub Actions 已完成 Wrangler 上传；线上页面复测还未确认。",
        verifying: "Wrangler 上传成功，页面回归测试仍在运行。",
        verified: lastCommitIsPublic
          ? "Wrangler 上传及页面回归测试均成功；此次公开内容已进入部署产物。"
          : "Wrangler 上传及页面回归测试均成功；此次是草稿或附件提交，不代表正文已公开。",
        verification_failed: "Wrangler 上传成功，但部署后的页面回归测试未通过。",
      };
      deploymentStatus.textContent = "提交 " + lastCommit.slice(0, 8) + "：" +
        (messages[result.phase] || "状态无法识别，请打开 Actions 检查。");
      const run = result.verify || result.deploy;
      if (run && /^https:\/\/github\.com\/07xh\/space\/actions\/runs\/\d+$/.test(run.url)) {
        deploymentLink.href = run.url;
        deploymentLink.hidden = false;
      } else {
        deploymentLink.hidden = true;
        deploymentLink.removeAttribute("href");
      }
    } catch (error) {
      deploymentStatus.textContent = "部署结果查询失败：" + error.message;
    } finally {
      busy(false);
    }
  }
  function info(message, isError = false) {
    status.textContent = message;
    status.dataset.error = String(isError);
  }
  function busy(next) {
    isBusy = next;
    for (const id of ["kind","files","file-search","refresh","new","load","save","publish","unpublish","delete","upload","image-file","check-deploy","editor","toggle-preview"]) get(id).disabled = next;
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
  function populateFiles(items, selectedPath = "") {
    listedItems = items;
    const prefix = "src/content/" + kind.value + "/";
    const term = fileSearch.value.trim().toLocaleLowerCase();
    const keepPath = selectedPath || files.value;
    files.replaceChildren();
    for (const item of items) {
      const label = item.path.startsWith(prefix) ? item.path.slice(prefix.length) : item.path;
      if (term && !label.toLocaleLowerCase().includes(term)) continue;
      files.add(new Option(label, item.path));
    }
    if (keepPath) files.value = keepPath;
    else files.selectedIndex = -1;
    get("file-count").textContent = "显示 " + files.options.length + " / " + items.length + " 个文件";
  }
  async function refresh() {
    if (isBusy) return;
    busy(true);
    try {
      const data = await request("GET");
      populateFiles(data.items, filename.value);
      info("目录已更新，共 " + data.items.length + " 个文件。");
    } catch (error) { info(error.message, true); }
    finally { busy(false); }
  }
  async function load() {
    if (isBusy || !files.value || !confirmDiscard()) return;
    busy(true);
    try {
      const result = await request("GET", files.value);
      filename.value = result.path;
      editor.value = result.content;
      cleanContent = result.content;
      sha = result.sha;
      isNew = false;
      showState();
      info("已打开 " + result.path + "；当前版本已记录，保存会检查并发修改。");
    } catch (error) { info(error.message, true); }
    finally { busy(false); }
  }
  function create() {
    if (isBusy || !confirmDiscard()) return;
    const name = prompt("输入文件名（仅字母、数字、连字符、下划线，不含扩展名）");
    if (!name) return;
    const slug = name.trim();
    if (!/^[A-Za-z0-9][A-Za-z0-9_-]{0,70}$/.test(slug)) {
      info("文件名格式不正确。", true);
      return;
    }
    const now = new Date();
    // Use the author's browser-local calendar date, not UTC (which can be
    // yesterday during early morning hours in Asia/Tokyo).
    const today = [now.getFullYear(), String(now.getMonth() + 1).padStart(2, "0"),
      String(now.getDate()).padStart(2, "0")].join("-");
    filename.value = "src/content/" + kind.value + "/" + slug + ".md";
    editor.value = kind.value === "posts"
      ? "---\ntitle: \"新文章\"\npublished: " + today +
        "\ndescription: \"\"\ndraft: true\ncategory: \"\"\ntags: []\n---\n\n在这里编写正文。\n"
      : "---\npublished: " + today + "\ndraft: true\npinned: false\n---\n\n在这里编写动态。\n";
    sha = "";
    cleanContent = "";
    isNew = true;
    showState();
    info("已创建本地草稿，尚未写入 GitHub；保存后才会触发预览站部署。");
  }
  async function save(mode = "keep") {
    if (isBusy || !filename.value) return info("请先打开文件或新建草稿。", true);
    const publish = mode === "publish";
    const unpublish = mode === "unpublish";
    if (unpublish && (isNew || !draftStatus(editor.value).startsWith("已公开"))) {
      return info("当前文件尚未公开，无需撤回。", true);
    }
    let content;
    try {
      content = publish ? setDraft(editor.value, false)
        : unpublish ? setDraft(editor.value, true) : editor.value;
    } catch (error) { return info(error.message, true); }
    const publicNow = draftStatus(content).startsWith("已公开");
    if (publish) {
      if (!confirm("确认将此内容公开发布到独立预览站？保存后会提交 GitHub 并触发部署。")) return;
    } else if (unpublish) {
      if (!confirm("确认撤回公开内容？GitHub 提交并部署完成后，访客将无法继续从新站查看它。")) return;
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
      cleanContent = content;
      isNew = false;
      sha = result.sha || "";
      trackCommit(result.commit, publicNow);
      showState();
      info("已提交 GitHub：" + (result.commit || "成功") +
        "。" + (unpublish ? "撤回公开已提交，" : "当前是" + (publicNow ? "公开内容" : "草稿") + "，") +
        "预览站仍需等待自动部署完成。");
      const current = filename.value;
      try {
        const data = await request("GET");
        populateFiles(data.items, current);
      } catch (error) {
        info("GitHub 提交已经成功（" + (result.commit || "已提交") +
          "），但文件列表刷新失败：" + error.message +
          "。请勿重复提交；可单独点击刷新，或检查部署进度。", true);
      }
    } catch (error) { info("保存请求未确认成功：" + error.message +
      "。请先刷新并检查 GitHub 文件状态，避免重复提交。", true); }
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
      // Before Pages deploys /uploads/, the editor can display the selected
      // local image without waiting for GitHub Actions or changing the URL.
      if (/^\/uploads\/[A-Za-z0-9_-]+\.(png|jpe?g|webp|gif)$/.test(result.imageUrl)) {
        const previous = localImagePreviews.get(result.imageUrl);
        if (previous) URL.revokeObjectURL(previous);
        if (localImagePreviews.size >= 16) {
          const oldest = localImagePreviews.keys().next().value;
          URL.revokeObjectURL(localImagePreviews.get(oldest));
          localImagePreviews.delete(oldest);
        }
        localImagePreviews.set(result.imageUrl, URL.createObjectURL(image));
      }
      editor.setRangeText(markdown, editor.selectionStart, editor.selectionEnd, "end");
      if (!previewOpen) editor.focus();
      imageInput.value = "";
      showState();
      trackCommit(result.commit, false);
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
      cleanContent = "";
      sha = "";
      trackCommit(result.commit, false);
      showState();
      info("GitHub 已确认删除：" + (result.commit || "成功") + "；可检查该次部署。");
      try {
        const data = await request("GET");
        populateFiles(data.items);
      } catch (error) {
        info("GitHub 已确认删除（" + (result.commit || "已提交") +
          "），但文件列表刷新失败：" + error.message + "。请勿重复删除，可单独刷新。", true);
      }
    } catch (error) {
      info("删除请求未确认成功：" + error.message +
        "。请先检查 GitHub 文件状态，避免重复操作。", true);
    } finally { busy(false); }
  }
  editor.addEventListener("input", showState);
  previewButton.addEventListener("click", togglePreview);
  for (const control of document.querySelectorAll("[data-format]")) {
    control.addEventListener("click", () => insertFormat(control.dataset.format));
  }
  get("refresh").addEventListener("click", refresh);
  fileSearch.addEventListener("input", () => populateFiles(listedItems));
  get("check-deploy").addEventListener("click", checkDeploy);
  get("new").addEventListener("click", create);
  get("load").addEventListener("click", load);
  get("upload").addEventListener("click", upload);
  get("save").addEventListener("click", () => save("keep"));
  get("publish").addEventListener("click", () => save("publish"));
  get("unpublish").addEventListener("click", () => save("unpublish"));
  editor.addEventListener("keydown", (event) => {
    if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "s") {
      event.preventDefault();
      if (!isBusy && filename.value) save("keep");
    }
  });
  get("delete").addEventListener("click", remove);
  kind.addEventListener("change", () => {
    if (!confirmDiscard()) {
      kind.value = activeKind;
      return;
    }
    activeKind = kind.value;
    fileSearch.value = "";
    listedItems = [];
    sha = ""; isNew = false; filename.value = ""; editor.value = ""; cleanContent = "";
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
