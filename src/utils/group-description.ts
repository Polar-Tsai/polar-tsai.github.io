export type GroupKind = 'categories' | 'tags' | 'series';

const groupKindLabels: Record<GroupKind, string> = {
  categories: '分類',
  tags: '標籤',
  series: '系列',
};

const maxListedTitles = 3;

/**
 * Meta description for a category/tag/series page. Uses the hand-written entry from
 * site.toml `[config.descriptions.<kind>]` when present; otherwise builds one from the
 * group's post titles so every group page gets a unique description.
 */
export function getGroupDescription(
  kind: GroupKind,
  name: string,
  posts: { data: { title: string } }[],
  overrides: Record<string, string>,
) {
  const manual = overrides[name]?.trim();
  if (manual) return manual;

  const titles = posts.slice(0, maxListedTitles).map((post) => post.data.title);
  const more = posts.length > maxListedTitles ? ' 等' : '';

  return `「${name}」${groupKindLabels[kind]}收錄 ${posts.length} 篇文章：${titles.join('、')}${more}`;
}
