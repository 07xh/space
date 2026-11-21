# 07xh Space

**Source-first port of a mature Astro blog**, not a custom UI remake.

## Base theme

- Full upstream implementation: https://github.com/MmzMing/my-blog
- Reference source revision is recorded in the GitHub Actions import run.
- The original layout, scroll scenes, navigation, mobile UI and reader components
  are retained intact for a first fidelity test.
- Original project copyright notices are retained in LICENSE.

## Imported content

Public Markdown, project metadata and user-owned media are imported from
https://github.com/07xh/Firefly . The source author's posts are excluded.
The personal identity, contact, comments, analytics and payment details are
disabled or replaced with 07xh configuration. Some upstream art assets still
exist for fidelity testing and must be reviewed/replaced before public launch.

## Additional design references for the next integration phase

- https://github.com/tianshihao2003/dumplingandcakeblog
- https://github.com/fqzlr/fqzlr-bk

The first step ports one entire coherent theme. Do not mix incompatible
upstream visual frameworks by copying partial styles on top of each other.

## Deployment

- **Production domain:** `https://0701000.xyz`; repository `07xh/space`.
- **Target runtime:** Cloudflare Workers + Static Assets, with the existing Pages Functions compiled into one Worker.
- **One deploy owner:** `.github/workflows/deploy-preview.yml` (now named **Deploy Cloudflare Worker**). GitHub Actions builds with pnpm and runs `wrangler deploy`; Cloudflare Builds/Git integration is **not used**.
- The separate Cloudflare Pages project remains a rollback snapshot during DNS migration but receives **no further automatic deployments**.
- The official domain is **not** moved by a code commit. Worker secrets, official-domain binding and GitHub OAuth login must be checked before cutover.
- Setup and rollback: [Workers migration guide](docs/workers-migration.md).

## Local start

Requires Node 22 and pnpm 9.14.4:

    pnpm install --frozen-lockfile
    pnpm check
    pnpm build
    pnpm dev

## Validation gates

GitHub Actions runs the original Astro type check and production build, then runs
the ported site in Chromium at 1440px (desktop), 820px (tablet), and 390px (mobile).
The tests cover native MobileDock expansion, project and moment content, original
Fancybox gallery, legacy /posts/ redirect, primary public media, and layout overflow.

The action uploads actual browser screenshots for inspection. A build passing alone
does not guarantee full visual or device parity; keep the legacy Firefly site live
until the new preview deployment has been reviewed.
