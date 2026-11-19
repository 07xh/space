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

## Additional direct module ports
- `src/components/layout/HomeTicker.astro` + `src/styles/components/home-ticker.css`: adapted from `tianshihao2003/dumplingandcakeblog` (MIT), retaining its native custom-element layout and resize handling.
- `src/components/layout/HomeCompass.astro` + `src/styles/components/home-compass.css`: adapted from `fqzlr/fqzlr-bk` (MIT), retaining its CSS hover/nav layout; links only to enabled routes.

- `/projects/`: adaptation of the original `MmzMing/my-blog` collections accordion and card markup, now populated by 07xh-owned project Markdown. No new card implementation.

- `/dynamic/`: directly uses fqzlr-bk's MomentCard.astro and moments.css; the original hardcoded author and data are replaced by 07xh's Astro dynamic collection.
- `/projects/[slug]/`: data-binding adaptation using original MmzMing MainGridLayout, PageTitle, Markdown, and tools card classes.
