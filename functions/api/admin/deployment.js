// Read-only publication receipt for the new Space preview, not the legacy site.
// GitHub's public workflow metadata avoids granting the Contents token Actions access.
import { privateJson, requirePreviewAdmin } from "../../../src/lib/preview-admin-auth.js";

const ACTIONS_URL = "https://api.github.com/repos/07xh/space/actions/runs?branch=main&per_page=100";
const DEPLOY_WORKFLOW = "Deploy Cloudflare Pages preview";
const VERIFY_WORKFLOW = "Verify deployed preview article and project pages";

function matchingRun(runs, sha, name, event) {
  const run = runs.find((entry) => entry.head_sha === sha &&
    entry.head_branch === "main" && entry.name === name &&
    entry.event === event && Number.isSafeInteger(entry.id) && entry.id > 0);
  if (!run) return null;
  return {
    status: run.status,
    conclusion: run.conclusion || null,
    url: "https://github.com/07xh/space/actions/runs/" + run.id,
  };
}

function phase(deploy, verify) {
  if (!deploy) return "not_found";
  if (deploy.status === "completed" && deploy.conclusion !== "success") return "deploy_failed";
  if (deploy.status === "completed" && deploy.conclusion === "success") {
    if (!verify) return "deployed";
    if (verify.status !== "completed") return "verifying";
    return verify.conclusion === "success" ? "verified" : "verification_failed";
  }
  return deploy.status === "in_progress" ? "deploying" : "queued";
}

export async function onRequestGet({ request, env }) {
  const denied = await requirePreviewAdmin(request, env);
  if (denied) return denied;
  const sha = new URL(request.url).searchParams.get("commit") || "";
  if (!/^[0-9a-f]{40}$/i.test(sha)) {
    return privateJson({ error: "需要完整的 40 位 GitHub 提交 SHA。" }, 400);
  }
  try {
    const response = await fetch(ACTIONS_URL, {
      headers: {
        Accept: "application/vnd.github+json",
        "X-GitHub-Api-Version": "2022-11-28",
        "User-Agent": "07xh-Space-Publishing",
      },
      signal: AbortSignal.timeout(12000),
    });
    if (!response.ok) {
      return privateJson({ error: "GitHub Actions 状态暂不可读取（HTTP " + response.status + "）。" }, 502);
    }
    const data = await response.json();
    if (!Array.isArray(data.workflow_runs)) {
      return privateJson({ error: "GitHub Actions 返回了无效数据。" }, 502);
    }
    const commit = sha.toLowerCase();
    const deploy = matchingRun(data.workflow_runs, commit, DEPLOY_WORKFLOW, "push");
    const verify = matchingRun(data.workflow_runs, commit, VERIFY_WORKFLOW, "workflow_run");
    return privateJson({
      commit,
      phase: phase(deploy, verify),
      deploy,
      verify,
      note: "状态来自 GitHub Actions；部署成功表示 Wrangler 上传成功，页面复测通过才表示检查通过。",
    });
  } catch {
    return privateJson({ error: "暂时无法连接 GitHub Actions，请通过仓库 Actions 页面确认。" }, 503);
  }
}
