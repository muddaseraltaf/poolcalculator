import { defineCollection, z } from 'astro:content';
import { glob } from 'astro/loaders';

// Blog posts live as Markdown in src/content/blog/*.md.
// Adding a post = drop in a file + push. Schema is enforced at build time,
// so a malformed post fails the build instead of shipping broken.
const blog = defineCollection({
  loader: glob({ pattern: '**/*.md', base: './src/content/blog' }),
  schema: z.object({
    title: z.string(),
    description: z.string(),
    publishDate: z.coerce.date(),
    updatedDate: z.coerce.date().optional(),
    // Slug of a calculator page to cross-link, e.g. 'green-pool' or '' for home.
    relatedTool: z.string().optional(),
    relatedToolLabel: z.string().optional(),
    tags: z.array(z.string()).default([]),
    draft: z.boolean().default(false),
  }),
});

export const collections = { blog };
