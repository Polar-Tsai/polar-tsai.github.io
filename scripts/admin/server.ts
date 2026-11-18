import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { existsSync, readFileSync } from 'node:fs';
import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import path from 'node:path';
import { checkPost } from './checks';
import {
  AdminError,
  BLOG_DIR,
  commitAndPush,
  createPost,
  gitStatus,
  IS_COMPILED,
  listPosts,
  push,
  readPost,
  resolveAsset,
  ROOT,
  saveImage,
  savePost,
} from './store';

const PORT = Number(process.env.ADMIN_PORT ?? 4322);
const HOST = '127.0.0.1';
// UI files are read from the repo (not bundled), so UI tweaks don't need a rebuilt .exe.
const UI_DIR = path.join(ROOT, 'scripts/admin/ui');
const MAX_UPLOAD_BYTES = 20 * 1024 * 1024;

const MIME: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.gif': 'image/gif',
  '.avif': 'image/avif',
  '.svg': 'image/svg+xml',
};

const STATIC_FILES: Record<string, string> = {
  '/': path.join(UI_DIR, 'index.html'),
  '/app.js': path.join(UI_DIR, 'app.js'),
  '/api.js': path.join(UI_DIR, 'api.js'),
  '/style.css': path.join(UI_DIR, 'style.css'),
  '/vendor/marked.js': path.join(ROOT, 'node_modules/marked/lib/marked.esm.js'),
};

const server = createServer((request, response) => {
  handle(request, response).catch((error: unknown) => {
    const status = error instanceof AdminError ? error.status : 500;
    const message = error instanceof Error ? error.message : String(error);
    const detail = error instanceof AdminError ? error.detail : undefined;
    if (status === 500) console.error(error);
    sendJson(response, status, { error: message, detail });
  });
});

async function handle(request: IncomingMessage, response: ServerResponse): Promise<void> {
  // Only answer requests addressed to this machine (blocks DNS-rebinding), and require a custom
  // header on writes so other sites open in the browser can't trigger them cross-origin.
  const host = request.headers.host ?? '';
  if (host !== `${HOST}:${PORT}` && host !== `localhost:${PORT}`) {
    throw new AdminError('Forbidden host', 403);
  }
  const method = request.method ?? 'GET';
  if (method !== 'GET' && request.headers['x-navfolio-admin'] !== '1') {
    throw new AdminError('Missing admin header', 403);
  }

  const url = new URL(request.url ?? '/', `http://${host}`);
  const route = url.pathname;

  if (method === 'GET' && STATIC_FILES[route]) return sendFile(response, STATIC_FILES[route]);
  if (method === 'GET' && route.startsWith('/files/')) {
    return sendFile(response, resolveAsset(decodeURIComponent(route.slice('/files/'.length))));
  }

  if (route === '/api/posts' && method === 'GET') return sendJson(response, 200, await listPosts());
  if (route === '/api/posts' && method === 'POST') {
    const input = await readJson<{ slug: string; title: string; ext?: 'md' | 'mdx' }>(request);
    return sendJson(response, 201, await createPost(input.slug, input.title, input.ext ?? 'md'));
  }
  if (route === '/api/git' && method === 'GET') return sendJson(response, 200, await gitStatus());
  if (route === '/api/git/push' && method === 'POST') return sendJson(response, 200, await push());

  const postRoute = /^\/api\/posts\/([^/]+)(?:\/(check|publish|images))?$/.exec(route);
  if (postRoute) {
    const slug = decodeURIComponent(postRoute[1]);
    const action = postRoute[2];

    if (!action && method === 'GET') return sendJson(response, 200, readPost(slug));
    if (!action && method === 'PUT') {
      return sendJson(response, 200, savePost(slug, await readJson(request)));
    }
    if (action === 'check' && method === 'POST') {
      return sendJson(response, 200, checkPost(readPost(slug), await listPosts()));
    }
    if (action === 'publish' && method === 'POST') {
      const input = await readJson<{
        draft?: boolean;
        touchUpdatedDate?: boolean;
        message: string;
      }>(request);
      const post = readPost(slug);
      const willBePublic =
        input.draft === false || (input.draft === undefined && post.frontmatter.draft !== true);
      if (willBePublic) {
        const result = checkPost(post, await listPosts());
        if (result.errors.length > 0) {
          throw new AdminError(`發布前檢查沒過：${result.errors.join('；')}`);
        }
      }
      return sendJson(response, 200, await commitAndPush(slug, input));
    }
    if (action === 'images' && method === 'POST') {
      const kind = url.searchParams.get('kind') === 'cover' ? 'cover' : 'inline';
      const name = url.searchParams.get('name') ?? 'image.png';
      return sendJson(response, 201, saveImage(slug, kind, name, await readBody(request)));
    }
  }

  throw new AdminError('Not found', 404);
}

function sendJson(response: ServerResponse, status: number, body: unknown): void {
  response.writeHead(status, { 'content-type': 'application/json; charset=utf-8' });
  response.end(JSON.stringify(body));
}

function sendFile(response: ServerResponse, file: string): void {
  let content: Buffer;
  try {
    content = readFileSync(file);
  } catch {
    throw new AdminError('Not found', 404);
  }
  response.writeHead(200, {
    'content-type': MIME[path.extname(file).toLowerCase()] ?? 'application/octet-stream',
    'cache-control': 'no-store',
  });
  response.end(content);
}

async function readBody(request: IncomingMessage): Promise<Buffer> {
  const chunks: Buffer[] = [];
  let size = 0;
  for await (const chunk of request) {
    size += (chunk as Buffer).length;
    if (size > MAX_UPLOAD_BYTES) throw new AdminError('檔案太大（上限 20MB）', 413);
    chunks.push(chunk as Buffer);
  }
  return Buffer.concat(chunks);
}

async function readJson<T = Record<string, unknown>>(request: IncomingMessage): Promise<T> {
  const raw = (await readBody(request)).toString('utf8');
  try {
    return JSON.parse(raw || '{}') as T;
  } catch {
    throw new AdminError('JSON 格式錯誤');
  }
}

const ADMIN_URL = `http://localhost:${PORT}`;

function openBrowser(): void {
  if (process.env.ADMIN_NO_OPEN) return;
  const [command, args] =
    process.platform === 'win32'
      ? ['cmd', ['/c', 'start', '', ADMIN_URL]]
      : [process.platform === 'darwin' ? 'open' : 'xdg-open', [ADMIN_URL]];
  spawn(command, args, { stdio: 'ignore', detached: true }).unref();
}

/** Keeps a double-clicked console window open long enough to read an error. */
async function exitWithError(lines: string[]): Promise<never> {
  for (const line of lines) console.error(line);
  if (IS_COMPILED && process.stdin.isTTY) {
    console.error('\n按 Enter 關閉視窗。');
    await once(process.stdin, 'data');
  }
  process.exit(1);
}

if (!existsSync(path.join(ROOT, BLOG_DIR))) {
  await exitWithError([
    `找不到 ${BLOG_DIR}：${ROOT}`,
    '執行檔要放在部落格 repo 的根目錄（和 package.json 同一層）。',
  ]);
}

server.on('error', async (error: NodeJS.ErrnoException) => {
  if (error.code !== 'EADDRINUSE') throw error;

  // Double-clicking again while the admin is already running should just bring it up.
  const alreadyRunning = await fetch(`${ADMIN_URL}/api/git`)
    .then((response) => response.ok)
    .catch(() => false);
  if (alreadyRunning) {
    console.log(`後台已經在執行中，直接打開 ${ADMIN_URL}`);
    openBrowser();
    process.exit(0);
  }

  await exitWithError([
    `port ${PORT} 被其他程式占用了。`,
    '要換 port 可以設定環境變數 ADMIN_PORT，例如：ADMIN_PORT=4323 bun run admin',
  ]);
});

server.listen(PORT, HOST, () => {
  console.log(`文章後台已啟動：${ADMIN_URL}`);
  console.log(IS_COMPILED ? '關閉這個視窗就會結束後台。' : '按 Ctrl+C 結束。');
  openBrowser();
});
