import { getCollection } from 'astro:content';
import navfolioConfig from '../../navfolio.config';
import { isPageModuleEnabled } from '../plugins/config';

export type RecentActivityType = 'post' | 'vibe' | 'project';

export interface RecentActivityItem {
  type: RecentActivityType;
  title: string;
  date: Date;
  href: string;
}

export async function getRecentActivity(limit = 6): Promise<RecentActivityItem[]> {
  const items: RecentActivityItem[] = [];

  const posts = await getCollection('blog', ({ data }) => !data.draft);
  for (const post of posts) {
    items.push({
      type: 'post',
      title: post.data.title,
      date: post.data.date,
      href: `/blog/${post.id}/`,
    });
  }

  if (isPageModuleEnabled(navfolioConfig, 'vibe')) {
    const vibes = await getCollection('vibe', ({ data }) => !data.draft);
    for (const vibe of vibes) {
      items.push({
        type: 'vibe',
        title: vibe.data.title || vibe.data.mood || 'Vibe update',
        date: vibe.data.date,
        // vibe entries have no individual permalink in this theme — link to the feed
        href: '/vibe/',
      });
    }
  }

  if (isPageModuleEnabled(navfolioConfig, 'projects')) {
    const projects = await getCollection(
      'projects',
      ({ id, data }) => id !== 'index' && !data.draft,
    );
    for (const project of projects) {
      items.push({
        type: 'project',
        title: project.data.title,
        date: project.data.date,
        href: `/projects/${project.id}/`,
      });
    }
  }

  items.sort((a, b) => b.date.valueOf() - a.date.valueOf());

  return items.slice(0, limit);
}
