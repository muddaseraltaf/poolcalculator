import rss from '@astrojs/rss';
import { getCollection } from 'astro:content';
import { SITE } from '../config/site';

export async function GET(context) {
  const posts = (await getCollection('blog', ({ data }) => !data.draft)).sort(
    (a, b) => b.data.publishDate.valueOf() - a.data.publishDate.valueOf()
  );

  return rss({
    title: `${SITE.name} Blog`,
    description:
      'Practical guides on shocking your pool, clearing green or cloudy water, and chlorine chemistry.',
    site: context.site,
    items: posts.map((post) => ({
      title: post.data.title,
      description: post.data.description,
      pubDate: post.data.publishDate,
      link: `/blog/${post.id}/`,
    })),
    customData: `<language>${SITE.lang}</language>`,
  });
}
