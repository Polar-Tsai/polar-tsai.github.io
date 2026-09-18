import { getCollection } from 'astro:content';
import rss from '@astrojs/rss';
import { getSiteConfig } from '../data/site';
import { sortByDateDesc } from '../utils/content-dates';
import { getSocialImageSrc } from '../utils/social-image';

export async function GET(context) {
  const { site } = await getSiteConfig();
  const posts = sortByDateDesc(await getCollection('blog', ({ data }) => !data.draft));

  const items = await Promise.all(
    posts.map(async (post) => {
      const imageSource = post.data.ogImage || post.data.heroImage;
      const thumbnailUrl = imageSource
        ? new URL(await getSocialImageSrc(imageSource), context.site).toString()
        : undefined;

      return {
        title: post.data.title,
        description: post.data.description,
        pubDate: post.data.date,
        categories: [
          ...new Set([
            ...(post.data.categories ?? []),
            ...(post.data.tags ?? []),
            ...(post.data.series ?? []),
          ]),
        ],
        link: `/blog/${post.id}/`,
        // Feed readers (Inoreader, Feedly, NetNewsWire, ...) pull the item
        // thumbnail from media:thumbnail, not from og:image - without it the
        // card shows no image at all.
        customData: thumbnailUrl ? `<media:thumbnail url="${thumbnailUrl}"/>` : undefined,
      };
    }),
  );

  return rss({
    title: site.title,
    description: site.description,
    site: context.site,
    xmlns: { media: 'http://search.yahoo.com/mrss/' },
    items,
  });
}
