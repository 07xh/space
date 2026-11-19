import { defineCollection } from 'astro:content';
import { z } from 'astro/zod';
import { glob } from 'astro/loaders';
const projects=defineCollection({loader:glob({base:'./src/content/projects',pattern:'**/*.{md,mdx}'}),schema:z.object({
 title:z.string(),published:z.coerce.date(),order:z.number().optional(),draft:z.boolean().optional().default(false),
 subtitle:z.string().optional().default(''),description:z.string().optional().default(''),
 status:z.string().optional().default(''),image:z.string().optional().default(''),
 repository:z.string().optional().default(''),tags:z.array(z.string()).optional().default([]),
 highlights:z.array(z.object({title:z.string(),detail:z.string(),state:z.enum(['implemented','verifying','planned'])})).optional().default([]),
 link:z.array(z.object({label:z.string(),value:z.string(),icon:z.string().optional()})).optional().default([])
}).passthrough()});
const posts=defineCollection({loader:glob({base:'./src/content/posts',pattern:'**/*.{md,mdx}'}),schema:z.object({
 title:z.string(),published:z.coerce.date(),updated:z.coerce.date().optional(),description:z.string().optional().default(''),
 image:z.string().optional().default(''),draft:z.boolean().optional().default(false),
 pinned:z.boolean().optional().default(false),password:z.string().optional().default(''),
 category:z.string().nullish().default(''),tags:z.array(z.string()).optional().default([]),
 series:z.string().optional().default('')
}).passthrough()});
const dynamic=defineCollection({loader:glob({base:'./src/content/dynamic',pattern:'**/*.md'}),schema:z.object({
 published:z.coerce.date(),pinned:z.boolean().optional().default(false),location:z.string().optional().default('')
}).passthrough()});
export const collections={projects,posts,dynamic};
