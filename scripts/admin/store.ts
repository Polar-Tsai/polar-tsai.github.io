import { execFile } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { promisify } from 'node:util';
import { applyFrontmatterPatch, parsePost, serializePost } from './frontmatter';

const run = promisify(execFile);

// All file and git access for the admin lives here. A future online admin would replace this
// module (e.g. with GitHub API calls) while the HTTP routes and UI stay the same.

// `bun build --compile` runs this code from a virtual filesystem (B:\~BUN\...), so the compiled
// admin locates the repo from its own .exe, which lives in the repo root.
export const IS_COMPILED = !/^bun(\.exe)?$/i.test(path.basename(process.execPath));
export const ROOT = IS_COMPILED
  ? path.dirname(process.execPath)
  : path.resolve(import.meta.dirname, '../..');
export const BLOG_DIR = 'src/content/blog';
export const ASSET_DIR = 'src/assets/figure/blog';
const ASSET_ROOT = path.join(ROOT, 'src/assets');
const SLUG_PATTERN = /^[a-z0-9][a-z0-9-]*$/;
const IMAGE_EXTENSIONS = new Set(['.png', '.jpg', '.jpeg', '.webp', '.gif', '.avif', '.svg']);

export class AdminError extends Error {
  constructor(
    message: string,
    readonly status = 400,
    readonly detail?: string,
  ) {
    super(message);
  }
}

export interface PostSummary {
  slug: string;
  ext: 'md' | 'mdx';
  title: string;
  description: string;
  date: string;
  updatedDate: string;
  draft: boolean;
  tags: string[];
  categories: string[];
  series: string[];
  heroImage: string;
  ogImage: string;
  uncommitted: boolean;
}

export interface PostDetail {
  slug: string;
  ext: 'md' | 'mdx';
  file: string;
  frontmatter: Record<string, unknown>;
  body: string;
  hash: string;
}

export function assertSlug(slug: string): void {
  if (!SLUG_PATTERN.test(slug)) {
    throw new AdminError('slug 只能用小寫英文、數字與 -，且不能以 - 開頭');
  }
}

export function postFile(slug: string): { file: string; ext: 'md' | 'mdx' } {
  assertSlug(slug);
  for (const ext of ['md', 'mdx'] as const) {
    const file = `${BLOG_DIR}/${slug}.${ext}`;
    if (existsSync(path.join(ROOT, file))) return { file, ext };
  }
  throw new AdminError(`找不到文章：${slug}`, 404);
}

export async function listPosts(): Promise<PostSummary[]> {
  const dirty = await uncommittedPaths();
  const posts: PostSummary[] = [];

  for (const name of readdirSync(path.join(ROOT, BLOG_DIR))) {
    const match = /^(.+)\.(mdx?)$/.exec(name);
    if (!match) continue;

    const [, slug, ext] = match;
    const file = `${BLOG_DIR}/${name}`;
    let data: Record<string, unknown> = {};
    try {
      data = parsePost(readFileSync(path.join(ROOT, file), 'utf8')).data;
    } catch {
      // A broken file still shows up in the list so it can be opened and fixed.
    }

    posts.push({
      slug,
      ext: ext as 'md' | 'mdx',
      title: text(data.title) || slug,
      description: text(data.description),
      date: text(data.date),
      updatedDate: text(data.updatedDate),
      draft: data.draft === true,
      tags: list(data.tags),
      categories: list(data.categories),
      series: list(data.series),
      heroImage: text(data.heroImage),
      ogImage: text(data.ogImage),
      uncommitted:
        dirty.has(file) ||
        [...dirty].some((dirtyPath) => dirtyPath.startsWith(`${ASSET_DIR}/${slug}/`)),
    });
  }

  return posts.sort((a, b) => b.date.localeCompare(a.date));
}

export function readPost(slug: string): PostDetail {
  const { file, ext } = postFile(slug);
  const source = readFileSync(path.join(ROOT, file), 'utf8');
  const post = parsePost(source);

  return { slug, ext, file, frontmatter: post.data, body: post.body, hash: hashOf(source) };
}

export function savePost(
  slug: string,
  input: { frontmatter?: Record<string, unknown>; body?: string; baseHash?: string },
): PostDetail {
  const { file } = postFile(slug);
  const absolute = path.join(ROOT, file);
  const source = readFileSync(absolute, 'utf8');

  if (input.baseHash && input.baseHash !== hashOf(source)) {
    throw new AdminError('檔案在別處被修改過（例如 VS Code），請重新載入後再存檔', 409);
  }

  const post = parsePost(source);
  if (input.frontmatter) applyFrontmatterPatch(post, input.frontmatter);
  if (typeof input.body === 'string') post.body = input.body.replace(/\r\n/g, '\n');

  const next = serializePost(post);
  if (next !== source) writeFileSync(absolute, next, 'utf8');

  return readPost(slug);
}

export async function createPost(
  slug: string,
  title: string,
  ext: 'md' | 'mdx',
): Promise<PostDetail> {
  assertSlug(slug);
  if (
    ['md', 'mdx'].some((candidate) =>
      existsSync(path.join(ROOT, `${BLOG_DIR}/${slug}.${candidate}`)),
    )
  ) {
    throw new AdminError(`已經有同名文章：${slug}`, 409);
  }

  // Reuse the project scaffold so the template stays the single source of truth.
  // A compiled admin is itself a Bun runtime; BUN_BE_BUN=1 makes it act as the `bun` CLI.
  await exec(process.execPath, ['scripts/new-content.ts', 'post', slug, `--${ext}`], {
    BUN_BE_BUN: '1',
  });

  const post = readPost(slug);
  const heading = new RegExp(`^# ${escapeRegExp(slug)}$`, 'm');
  return savePost(slug, {
    frontmatter: { title: title || slug },
    body: post.body.replace(heading, `# ${title || slug}`),
  });
}

export function saveImage(
  slug: string,
  kind: 'cover' | 'inline',
  originalName: string,
  bytes: Buffer,
): { path: string; file: string; size: number } {
  postFile(slug);
  const ext = path.extname(originalName).toLowerCase().replace('.jpeg', '.jpg');
  if (!IMAGE_EXTENSIONS.has(ext)) throw new AdminError(`不支援的圖片格式：${ext || '(無副檔名)'}`);
  if (bytes.length === 0) throw new AdminError('圖片是空的');

  const directory = path.join(ROOT, ASSET_DIR, slug);
  mkdirSync(directory, { recursive: true });

  let name: string;
  if (kind === 'cover') {
    name = `cover${ext}`;
  } else {
    // Inline images follow WRITING.md: 01-xxx.png, 02-xxx.png in order of appearance.
    const used = readdirSync(directory)
      .map((existing) => Number.parseInt(/^(\d+)/.exec(existing)?.[1] ?? '0', 10))
      .filter((value) => Number.isFinite(value));
    const next = String(Math.max(0, ...used) + 1).padStart(2, '0');
    const stem = path
      .basename(originalName, path.extname(originalName))
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '');
    name =
      stem && !/^(image|screenshot|clipboard)/.test(stem)
        ? `${next}-${stem}${ext}`
        : `${next}${ext}`;
  }

  writeFileSync(path.join(directory, name), bytes);
  return {
    path: `../../assets/figure/blog/${slug}/${name}`,
    file: `${ASSET_DIR}/${slug}/${name}`,
    size: bytes.length,
  };
}

/** Resolves a /files/... request to a file under src/assets, refusing anything outside it. */
export function resolveAsset(relativePath: string): string {
  const absolute = path.resolve(ROOT, relativePath);
  if (
    !absolute.startsWith(ASSET_ROOT + path.sep) ||
    !existsSync(absolute) ||
    !statSync(absolute).isFile()
  ) {
    throw new AdminError('找不到檔案', 404);
  }
  return absolute;
}

/** Resolves a frontmatter/body image path (relative to the post file) to a repo path. */
export function postRelativeToRepo(imagePath: string): string | undefined {
  if (!imagePath || /^https?:\/\//i.test(imagePath)) return undefined;
  return path
    .relative(ROOT, path.resolve(ROOT, BLOG_DIR, imagePath))
    .split(path.sep)
    .join('/');
}

export function fileSize(repoPath: string): number | undefined {
  const absolute = path.join(ROOT, repoPath);
  return existsSync(absolute) ? statSync(absolute).size : undefined;
}

export interface PublishResult {
  committed: boolean;
  pushed: boolean;
  log: string;
  error?: string;
}

export async function commitAndPush(
  slug: string,
  options: { draft?: boolean; touchUpdatedDate?: boolean; message: string },
): Promise<PublishResult> {
  const message = options.message.trim();
  if (!message) throw new AdminError('commit 訊息不能是空的');

  const { file } = postFile(slug);

  // Refuse to sweep unrelated staged work into a post commit; unstaged changes elsewhere are fine.
  const ownPaths = (candidate: string) =>
    candidate === file || candidate.startsWith(`${ASSET_DIR}/${slug}/`);
  const foreignStaged = (await exec('git', ['diff', '--cached', '--name-only']))
    .split('\n')
    .filter((candidate) => candidate && !ownPaths(candidate));
  if (foreignStaged.length > 0) {
    throw new AdminError(
      `git 暫存區還有其他檔案，請先處理再發布：${foreignStaged.slice(0, 5).join('、')}`,
      409,
    );
  }

  const patch: Record<string, unknown> = {};
  if (typeof options.draft === 'boolean') patch.draft = options.draft;
  if (options.touchUpdatedDate) patch.updatedDate = new Date().toISOString();
  if (Object.keys(patch).length > 0) savePost(slug, { frontmatter: patch });

  const paths = [file, `${ASSET_DIR}/${slug}`].filter((candidate) =>
    existsSync(path.join(ROOT, candidate)),
  );
  const changed = await exec('git', ['status', '--porcelain', '--', ...paths]);
  if (!changed.trim()) throw new AdminError('這篇文章沒有需要提交的變更');

  let log = '';
  await exec('git', ['add', '-A', '--', ...paths]);
  try {
    log += await exec('git', ['commit', '-m', message]);
  } catch (error) {
    await exec('git', ['reset', '-q', '--', ...paths]).catch(() => '');
    const detail = error instanceof AdminError ? (error.detail ?? error.message) : String(error);
    return {
      committed: false,
      pushed: false,
      log: detail,
      error: 'commit 失敗（可能是 pre-commit 的格式檢查沒過）',
    };
  }

  const pushed = await push();
  return {
    committed: true,
    pushed: pushed.ok,
    log: `${log}\n${pushed.log}`.trim(),
    error: pushed.ok ? undefined : 'commit 成功，但 push 失敗，可以稍後再按「推送」重試',
  };
}

export async function push(): Promise<{ ok: boolean; log: string }> {
  try {
    return { ok: true, log: await exec('git', ['push', 'origin', 'HEAD']) };
  } catch (error) {
    return {
      ok: false,
      log: error instanceof AdminError ? (error.detail ?? error.message) : String(error),
    };
  }
}

export async function gitStatus(): Promise<{ branch: string; ahead: number; remote: boolean }> {
  const branch = (await exec('git', ['rev-parse', '--abbrev-ref', 'HEAD'])).trim();
  try {
    const ahead = Number.parseInt(
      (await exec('git', ['rev-list', '--count', '@{u}..HEAD'])).trim(),
      10,
    );
    return { branch, ahead: Number.isFinite(ahead) ? ahead : 0, remote: true };
  } catch {
    return { branch, ahead: 0, remote: false };
  }
}

async function uncommittedPaths(): Promise<Set<string>> {
  try {
    const output = await exec('git', ['status', '--porcelain', '-uall', '--', BLOG_DIR, ASSET_DIR]);
    return new Set(
      output
        .split('\n')
        .filter(Boolean)
        .map((line) => line.slice(3).replace(/^"|"$/g, '').split(' -> ').pop() ?? ''),
    );
  } catch {
    return new Set();
  }
}

async function exec(
  command: string,
  args: string[],
  extraEnv: Record<string, string> = {},
): Promise<string> {
  try {
    const { stdout, stderr } = await run(command, args, {
      cwd: ROOT,
      maxBuffer: 16 * 1024 * 1024,
      timeout: 5 * 60 * 1000,
      env: { ...process.env, GIT_TERMINAL_PROMPT: '0', ...extraEnv },
    });
    return `${stdout}${stderr}`;
  } catch (error) {
    const failure = error as { stdout?: string; stderr?: string; message?: string };
    const detail =
      `${failure.stdout ?? ''}${failure.stderr ?? ''}`.trim() || failure.message || String(error);
    throw new AdminError(`指令失敗：${command} ${args[0] ?? ''}`, 500, detail);
  }
}

function hashOf(source: string): string {
  return createHash('sha1').update(source).digest('hex');
}

function text(value: unknown): string {
  if (value instanceof Date) return value.toISOString();
  return typeof value === 'string' ? value : value == null ? '' : String(value);
}

function list(value: unknown): string[] {
  return Array.isArray(value) ? value.map((item) => String(item)) : [];
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
