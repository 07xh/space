import { defineConfig } from 'astro/config';
import svelte from '@astrojs/svelte';
import cloudflare from '@astrojs/cloudflare';
import mdx from '@astrojs/mdx';
export default defineConfig({
  site: 'https://0701000.xyz',
  integrations: [svelte(), mdx()],
  adapter: cloudflare(),
  output: 'static',
  trailingSlash: 'always',
});
