# 07xh Space

A new Astro 7 + Svelte 5 personal blog. Work in progress; this repository is independent from `07xh/Firefly`.

## Current direction

This is a **blog-first experience**, not a single-project fullscreen carousel. The homepage leads with a light personal introduction, then links to recent articles, projects, moments and site sections. Project lists and details have their own routes.

## Reused MIT-licensed code

The first wave imports and adapts existing source from the user's three selected blogs:

- `MmzMing/my-blog`: `src/utils/home-index-scene-controller.ts` for phase-driven intro interaction.
- `tianshihao2003/dumplingandcakeblog`: `HomeTicker.astro`, ticker CSS, article math scrollbar utility.
- `fqzlr/fqzlr-bk`: `home-compass.css` and the navigation structure adapted in `HomeCompass.astro`.

Attribution and copyright notices: [THIRD_PARTY_NOTICES.md](./THIRD_PARTY_NOTICES.md).

Only publicly available site components are reused. The original authors' images, identity information, private site configuration and content are not copied.

## Data and status

The site uses real public project descriptions and selected published posts/moments from `07xh/Firefly`; full data and image migration is not complete. The admin backend is intentionally not active.

## Development

Use Node.js 22 or newer.

```sh
npm install
npm run source-check
npm run check
npm run build
npm run dev
```

No production-domain switch or Cloudflare deployment is configured yet. Do not delete Firefly or point `0701000.xyz` to this repository before full regression tests and data migration.
