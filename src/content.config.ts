import { defineCollection } from "astro:content";
import { glob } from "astro/loaders";
import { z } from "astro/zod";

const postsCollection = defineCollection({
	loader: glob({ pattern: "**/*.{md,mdx}", base: "./src/content/posts" }),
	schema: z.object({
		title: z.string(),
		published: z.date(),
		updated: z.date().optional(),
		draft: z.boolean().optional().default(false),
		description: z.string().optional().default(""),
		image: z.string().optional().default(""),
		tags: z.array(z.string()).optional().default([]),
		category: z.string().optional().nullable().default(""),
		lang: z.string().optional().default(""),
		pinned: z.boolean().optional().default(false),
		author: z.string().optional().default(""),
		sourceLink: z.string().optional().default(""),
		licenseName: z.string().optional().default(""),
		licenseUrl: z.string().optional().default(""),
		comment: z.boolean().optional().default(true),
		password: z.string().optional().default(""),
		passwordHint: z.string().optional().default(""),
		// 仅从公开机器知识入口排除，文章页面仍然保留。
		wikiExclude: z.boolean().optional().default(false),

		/* For internal use */
		prevTitle: z.string().default(""),
		prevSlug: z.string().default(""),
		nextTitle: z.string().default(""),
		nextSlug: z.string().default(""),
	}),
});

// Preserve public project and moment Markdown data from the former Firefly site.
const projectsCollection = defineCollection({
  loader: glob({ pattern: "**/*.{md,mdx}", base: "./src/content/projects" }),
  schema: z.object({
    title:z.string(), published:z.date(), draft:z.boolean().optional().default(false),
    order:z.number().optional(),subtitle:z.string().optional().default(""),
    description:z.string().optional().default(""),status:z.string().optional().default(""),
    image:z.string().optional().default(""),tags:z.array(z.string()).optional().default([]),
    repository:z.string().optional().default(""),
    highlights:z.array(z.object({title:z.string(),detail:z.string(),state:z.enum(["implemented","verifying","planned"])})).optional().default([]),
    link:z.array(z.object({label:z.string(),value:z.string(),icon:z.string().optional()})).optional().default([]),
  }).passthrough(),
});
const dynamicCollection = defineCollection({
  loader: glob({ pattern:"**/*.md",base:"./src/content/dynamic" }),
  schema: z.object({published:z.date(),pinned:z.boolean().optional().default(false),location:z.string().optional().default("")}).passthrough(),
});

const specCollection = defineCollection({
	loader: glob({ pattern: "**/*.{md,mdx}", base: "./src/content/spec" }),
	schema: z.object({}),
});

export const collections = {
	posts: postsCollection,
	spec: specCollection,
	projects: projectsCollection,
	dynamic: dynamicCollection,
};
