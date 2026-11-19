#!/usr/bin/env bash
set -euo pipefail

test -f /tmp/space-upstream/astro.config.mjs
test -f /tmp/space-upstream/src/components/layout/HomeBlinds.astro
test -d /tmp/space-content/src/content/posts
test -d /tmp/space-content/src/content/projects

# Keep our temporary import action and clean away ALL previous hand-written Space
# pages, styles, and prototype components. The source of truth is upstream.
rsync -a --delete \
  --exclude='.git/' --exclude='.github/' --exclude='.env*' \
  --exclude='node_modules/' --exclude='dist/' \
  /tmp/space-upstream/ ./

# Never inherit the upstream author's CI/deploy workflows or our obsolete npm CI.
# Workflow files are managed separately by the GitHub connector.

# Preserve the user's actual public content. Do NOT copy source author's posts.
rm -rf src/content/posts src/content/spec
mkdir -p src/content/posts src/content/spec src/content/projects public/brand public/project-media
rsync -a /tmp/space-content/src/content/posts/ src/content/posts/
if test -d /tmp/space-content/src/content/spec; then
  rsync -a /tmp/space-content/src/content/spec/ src/content/spec/
fi
rsync -a /tmp/space-content/src/content/projects/ src/content/projects/
rsync -a /tmp/space-content/public/brand/ public/brand/
rsync -a /tmp/space-content/public/project-media/ public/project-media/

# Site identity and external integrations are the ONLY required edits to the
# original UI. Keep animation controllers, styling, Astro layouts and navigation.
python3 - <<'PY'
from pathlib import Path
import re

def edit(path, fn):
    file = Path(path)
    old = file.read_text(encoding='utf-8')
    new = fn(old)
    if new == old:
        print('WARNING: no change in', path)
    file.write_text(new, encoding='utf-8')

def site(s):
    s = s.replace('MmzMing的博客', '07xh 的个人空间')
    s = s.replace('subtitle: "MmzMing"', 'subtitle: "Space"')
    s = s.replace('site_url: "https://tblog.mmzhiku.xyz"', 'site_url: "https://space.0701000.xyz"')
    s = s.replace('owner: "/assets/images/aut-master.webp"', 'owner: "/brand/07xh-ship.svg"')
    s = s.replace('value: "assets/images/logo.png"', 'value: "/brand/07xh-ship.svg"')
    s = s.replace('"MmzMing",', '"07xh",')
    s = s.replace('siteStartDate: "2026-05-07"', 'siteStartDate: "2026-11-19"')
    s = s.replace('sponsor: true,', 'sponsor: false,')
    s = s.replace('guestbook: true,', 'guestbook: false,')
    s = s.replace('gallery: true,', 'gallery: false,')
    s = s.replace('friends: true,', 'friends: false,')
    s = s.replace('generateOgImages: true,', 'generateOgImages: false,')
    s = re.sub(r'(?m)^(\s*websiteId:\s*)"[^"]*"', r'\1""', s)
    s = re.sub(r'(?m)^(\s*shareId:\s*)"[^"]*"', r'\1""', s)
    s = re.sub(r'(?m)^(\s*scriptUrl:\s*)"https://stats\.mmzhiku\.xyz/script\.js"', r'\1""', s)
    s = re.sub(r'(description:\s*\n\s*)"记录 Java 后端与 AI 工程[^"]*"', r'\1"记录 Python、工程制图和个人开源软件开发实践。"', s, count=1)
    return s
edit('src/config/siteConfig.ts', site)

def home(s):
    s = s.replace('name: "MmzMing"', 'name: "07xh"')
    s = s.replace('displayName: "MmzMing"', 'displayName: "07xh"')
    s = s.replace('occupation: "[全干工程师 / 技术博主]"', 'occupation: "[学生 / 软件开发与技术学习]"')
    s = s.replace('bio: ["且视他人之疑目如盏盏鬼火，大胆地去走你的夜路"]',
                  'bio: ["做些有用的小工具，记录正在学习和尝试的东西。"]')
    s = re.sub(r'contact:\s*{\s*platform:\s*"B站",\s*handle:\s*"Mmz明崽",\s*}',
               'contact: { platform: "GitHub", handle: "07xh" }', s)
    s = re.sub(r'(dialogue:\s*{\s*enabled:\s*)true', r'\g<1>false', s, count=1)
    s = re.sub(r'(commentBubble:\s*{\s*enabled:\s*)true', r'\g<1>false', s, count=1)
    s = s.replace('站点专研方向Java后端、前端、Agent和Python',
                  'Python、工程制图、移动设备与个人软件实践')
    s = s.replace('热衷于制作一些没人用的小组件和收集好看的AI绘画',
                  '持续整理公开项目、学习笔记与开发过程')
    s = s.replace('且视他人之疑目如盏盏鬼火，大胆地去走你的夜路',
                  '做些有用的小工具，记录正在学习和尝试的东西。')
    s = s.replace('title: "祝愿各位"', 'title: "欢迎来到"')
    s = re.sub(r'\n\tlinks:\s*\[[\s\S]*?\n\t\],\n};', """
\tlinks: [
\t\t{
\t\t\tname: "GitHub",
\t\t\ticon: "fa7-brands:github",
\t\t\turl: "https://github.com/07xh",
\t\t\tcolor: "#1F6FEB",
\t\t},
\t\t{
\t\t\tname: "RSS",
\t\t\ticon: "fa7-solid:rss",
\t\t\turl: "/rss/",
\t\t\tcolor: "#F26522",
\t\t},
\t],
};""",s,count=1)
    return s
edit('src/config/homeConfig.ts', home)

def nav(s):
    s,n=re.subn(r'const personalSites: PersonalSite\[\] = \[[\s\S]*?\n\];',
        'const personalSites: PersonalSite[] = [{ name: "GitHub", url: "https://github.com/07xh", icon: "https://github.com/favicon.ico" }];',
        s,count=1)
    if n!=1: raise ValueError('Could not locate original personal site list')
    return s
edit('src/config/navBarConfig.ts', nav)

def footer(s):
    s,n=re.subn(r'socialLinks:\s*\[[\s\S]*?\n\t\],',
        'socialLinks: [{ label: "GitHub", href: "https://github.com/07xh", icon: "fa7-brands:github" }],',
        s,count=1)
    if n!=1: raise ValueError('Missing original footer social links')
    s=re.sub(r'(?m)^(\s*icp:\s*)"[^"]*"',r'\1""',s)
    s=re.sub(r'(?m)^(\s*police:\s*)"[^"]*"',r'\1""',s)
    return s
edit('src/config/footerConfig.ts',footer)

def comments(s):
    s=s.replace('type: "waline"', 'type: "none"')
    s=s.replace('serverURL: "https://waline.mmzhiku.xyz/"','serverURL: ""')
    s=s.replace('repo: "MmzMing/my-blog"','repo: "07xh/space"')
    s=s.replace('repoId: "R_kgDOSXWjBQ"','repoId: ""')
    s=s.replace('categoryId: "DIC_kwDOSXWjBc4C8jP5"','categoryId: ""')
    return s
edit('src/config/commentConfig.ts', comments)

# Prevent another author's announcement history from appearing as our own.
p=Path('src/config/announcementConfig.ts')
if p.exists():
    text=p.read_text(encoding='utf-8')
    text=re.sub(r'enabled:\s*true','enabled: false',text)
    p.write_text(text,encoding='utf-8')

# Prevent publishing the author's payment QR / donor examples.
p=Path('src/config/sponsorConfig.ts')
if p.exists():
    t=p.read_text(encoding='utf-8')
    t=re.sub(r'enabled:\s*true','enabled: false',t)
    t=re.sub(r'qrCode:\s*"[^"]*"','qrCode: ""',t)
    t=re.sub(r'sponsors:\s*\[[\s\S]*?\n\t\],','sponsors: [],',t,count=1)
    p.write_text(t,encoding='utf-8')

p=Path('src/pages/index.astro')
s=p.read_text(encoding='utf-8').replace('Java 后端与 AI 工程实践','软件项目与技术笔记')
p.write_text(s,encoding='utf-8')

# Default home art is kept ONLY to verify how the imported animations and
# layers look; it may be replaced before publicly deploying the new domain.
print('Personal data and live upstream analytics/comment endpoints disabled.')
PY

cat > README.md <<'EOF'
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

## Important

- The 0701000.xyz production domain still points to the existing Firefly site.
- The previous custom 07xh/space front-end source was removed during the port.
- The old repo history remains accessible, so rollback is possible.
- No Cloudflare deployment or production write API is enabled in this branch.

## Local start

Requires Node 22 and pnpm 9.14.4:

    pnpm install --frozen-lockfile
    pnpm check
    pnpm build
    pnpm dev
EOF

cat > UPSTREAM_PORT.md <<'EOF'
# Source provenance

The 07xh Space application is initially a full-tree port of
MmzMing/my-blog (MIT), not a visual imitation. Original LICENSE is retained.
User content is imported separately from 07xh/Firefly.

Upstream UI includes HomeHero, HomeDataLayer, HomeBlinds,
HomeMobile, Navbar, FloatingDock, ArticleTocPanel, and their original
styles, controllers and lifecycle utilities.

Other source references for compatible components:
- tianshihao2003/dumplingandcakeblog (MIT)
- fqzlr/fqzlr-bk (MIT)

Review the source author's photograph, illustration, audio and character
assets before publishing: permissions for third-party artwork can differ
from the repository's software license.
EOF

mkdir -p .github/workflows

printf 'Upstream revision: '
git -C /tmp/space-upstream rev-parse HEAD
printf 'Imported project markdown files: '
find src/content/projects -name '*.md' | wc -l
printf 'Imported posts: '
find src/content/posts -name '*.md' | wc -l
printf 'Styles: '
find src/styles -type f | wc -l
printf 'Astro/Svelte source files: '
find src -type f \( -name '*.astro' -o -name '*.svelte' \) | wc -l
