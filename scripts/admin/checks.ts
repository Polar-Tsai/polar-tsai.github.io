import { fileSize, postRelativeToRepo, type PostDetail, type PostSummary } from './store';

export interface CheckResult {
  errors: string[];
  warnings: string[];
}

const COVER_MAX_BYTES = 300 * 1024;
const MEDIA_TAGS = ['書籍', '電影'];

/** The pre-publish checklist from WRITING.md, as code. Errors block publishing; warnings don't. */
export function checkPost(post: PostDetail, allPosts: PostSummary[]): CheckResult {
  const errors: string[] = [];
  const warnings: string[] = [];
  const data = post.frontmatter;
  const text = (key: string) => (typeof data[key] === 'string' ? (data[key] as string).trim() : '');
  const list = (key: string) =>
    Array.isArray(data[key]) ? (data[key] as unknown[]).map(String) : [];

  if (!text('title')) errors.push('title 沒有填');
  if (!text('description')) errors.push('description 沒有填（會用在搜尋結果與分享卡片）');
  if (Number.isNaN(Date.parse(String(data.date ?? '')))) errors.push('date 不是有效的日期');
  if (/Start writing here\./.test(post.body))
    errors.push('正文還留著模板的「Start writing here.」');

  for (const key of ['heroImage', 'ogImage']) {
    const repoPath = postRelativeToRepo(text(key));
    if (!repoPath) continue;
    const size = fileSize(repoPath);
    if (size === undefined) errors.push(`${key} 指到的圖片不存在：${text(key)}`);
    else if (size > COVER_MAX_BYTES) {
      warnings.push(`${key} 檔案 ${Math.round(size / 1024)}KB，超過 300KB，社群卡片可能抓不到圖`);
    }
  }

  for (const [, src] of post.body.matchAll(/!\[[^\]]*\]\(([^)\s]+)[^)]*\)/g)) {
    const repoPath = postRelativeToRepo(src);
    if (repoPath && fileSize(repoPath) === undefined) errors.push(`內文圖片不存在：${src}`);
  }

  const cover = text('ogImage') || text('heroImage');
  if (!cover) warnings.push('沒有 ogImage / heroImage，分享卡片會用全站預設圖');
  else {
    const sharedWith = allPosts.find(
      (other) => other.slug !== post.slug && (other.ogImage || other.heroImage) === cover,
    );
    if (sharedWith) warnings.push(`分享圖跟「${sharedWith.title}」共用同一張`);
  }

  if (!/^##\s/m.test(post.body)) warnings.push('正文沒有 H2（##）分段，會影響 TOC 與 AI 摘要');

  const tags = list('tags');
  const categories = list('categories');
  if (tags.length === 0) warnings.push('tags 沒有填');
  if (categories.length === 0) warnings.push('categories 沒有填');

  const hasMediaTag = tags.some((tag) => MEDIA_TAGS.includes(tag));
  if (hasMediaTag && !tags.includes('心得'))
    warnings.push('有媒材標籤（書籍／電影）時，也要加上「心得」');
  if (tags.includes('心得') && !hasMediaTag)
    warnings.push('「心得」標籤要搭配媒材標籤（書籍／電影）');

  const others = allPosts.filter((other) => other.slug !== post.slug);
  for (const [key, label] of [
    ['tags', 'tag'],
    ['categories', '分類'],
    ['series', '系列'],
  ] as const) {
    const known = new Set(others.flatMap((other) => other[key]));
    const fresh = list(key).filter((value) => !known.has(value));
    if (fresh.length > 0 && known.size > 0) {
      warnings.push(`新的${label}：${fresh.join('、')}（確認不是既有${label}的同義詞）`);
    }
  }

  if (text('canonicalUrl')) warnings.push('有填 canonicalUrl：只有轉載／同步發布的文章才需要');

  return { errors, warnings };
}
