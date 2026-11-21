# Workers + GitHub Actions single-deployment migration

## Scope
- Repository: `07xh/space`; official domain: `https://0701000.xyz`.
- Keep the existing Astro static build and `functions/` source (OAuth, admin, upload and deployment receipt).
- The **only automatic deployment** is `.github/workflows/deploy-preview.yml` on `main`, renamed `Deploy Cloudflare Worker`.
- Cloudflare **Workers Builds must remain disconnected** from GitHub. The Pages project is an inactive rollback snapshot, not a second deployment destination.
- No domain/DNS/Pages project deletion is performed by this commit.

## Build and deployment
1. GitHub Actions runs `pnpm install --frozen-lockfile`, Astro checks, admin tests and `pnpm build`.
2. `wrangler pages functions build functions --outdir .worker-dist` **compiles** old Pages Functions into a Worker. This is a local build step, **not a Pages deployment**.
3. `wrangler deploy --config wrangler.jsonc` publishes the Worker named `07xh-space-worker`. Static assets are read from `dist/`; the compiled backend is `.worker-dist/index.js` (outside public assets).
4. Worker-first routing is limited to `/admin`, `/api/auth/*`, `/api/admin/*`; static assets bypass Worker code. The existing `public/_headers` continues to apply to static assets.
5. A public homepage and private API smoke check must pass before the GitHub Actions deployment is considered successful. Admin deployment status checks this single workflow only.
6. `build.yml` runs on PRs/manual requests, not on each production push (avoids a redundant production build). Old Pages and preview-branch deployment workflows are removed.

## One-time Cloudflare settings (required, **not** supplied in this repository)
- Existing GitHub Actions secrets: `CLOUDFLARE_ACCOUNT_ID` and `CLOUDFLARE_API_TOKEN`. Token needs **Workers Scripts: Edit** for the same account; a Pages-only token may fail. Do not paste tokens into chats, issues or the repository.
- In Cloudflare Workers & Pages, open Worker `07xh-space-worker` and migrate existing runtime bindings to **Worker** secrets, not public variables:
  - `SPACE_GITHUB_CLIENT_ID`
  - `SPACE_GITHUB_CLIENT_SECRET`
  - `SPACE_SESSION_SECRET` (keep the same value if existing signed sessions should survive)
  - `SPACE_GITHUB_CONTENTS_TOKEN` (fine-grained token for `07xh/space` only)
- Any optional `SPACE_ACCESS_*` settings apply only if using the old Access mode. Current primary login is GitHub OAuth.
- Do **not** turn on Cloudflare Git repository builds or connect the Worker to GitHub; GitHub Actions owns deployment.

## Cutover gates
1. Test the GitHub Actions deployed `workers.dev` endpoint for homepage/static pages and private APIs rejecting anonymous requests. `workers.dev` is intentionally **not** an OAuth-approved origin; an anonymous smoke test cannot claim real GitHub login works.
2. Verify Worker secrets and ensure `https://0701000.xyz/api/auth/callback` remains registered in the **existing** GitHub OAuth App. Do not register a new OAuth App.
3. In Cloudflare, remove the **Pages custom-domain binding** for `0701000.xyz`, then add `0701000.xyz` as a **Workers Custom Domain** for `07xh-space-worker`. Ensure the zone is in the same Cloudflare account. Avoid manually creating conflicting DNS records; allow Cloudflare to manage the Worker custom-domain DNS and certificate.
4. Validate TLS, homepage, articles, media, `/admin` access restrictions, login from the official domain, logout, draft save and GitHub Actions deployment status. Both the existing GitHub session cookie and OAuth redirect are origin-bound.
5. Keep the Pages project for rollback until verified. To roll back: remove the Worker custom domain, rebind the same domain to Pages, and restore the prior Pages deploy workflow in GitHub (do not enable two pipelines simultaneously).

## Caveats
- Switching from Pages to Workers does **not** automatically improve China-mainland connectivity; Cloudflare IP optimization is a separate, independently tested DNS/routing decision.
- Workers static assets do not share all behavior of Pages; confirm large media playback, 404 routes, and static headers.
- If Cloudflare rejects the deployment or Worker secrets are missing, the existing Pages domain remains untouched. Do not label the migration as live until the official hostname is verified.

Official reference: https://developers.cloudflare.com/workers/static-assets/migration-guides/migrate-from-pages/
