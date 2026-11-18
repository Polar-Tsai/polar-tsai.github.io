// The only place the UI talks to storage. The local admin backs this with the Bun server in
// scripts/admin/server.ts; an online admin can re-implement these functions on the GitHub API.

async function request(method, url, body, headers = {}) {
  const response = await fetch(url, {
    method,
    headers: {
      'x-navfolio-admin': '1',
      ...(body !== undefined && !(body instanceof Blob)
        ? { 'content-type': 'application/json' }
        : {}),
      ...headers,
    },
    body: body === undefined || body instanceof Blob ? body : JSON.stringify(body),
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    const error = new Error(data.error || `HTTP ${response.status}`);
    error.status = response.status;
    error.detail = data.detail;
    throw error;
  }
  return data;
}

const post = (slug) => `/api/posts/${encodeURIComponent(slug)}`;

export const api = {
  listPosts: () => request('GET', '/api/posts'),
  getPost: (slug) => request('GET', post(slug)),
  createPost: (slug, title, ext) => request('POST', '/api/posts', { slug, title, ext }),
  savePost: (slug, frontmatter, body, baseHash) =>
    request('PUT', post(slug), { frontmatter, body, baseHash }),
  checkPost: (slug) => request('POST', `${post(slug)}/check`, {}),
  publish: (slug, options) => request('POST', `${post(slug)}/publish`, options),
  uploadImage: (slug, kind, file) =>
    request(
      'POST',
      `${post(slug)}/images?kind=${kind}&name=${encodeURIComponent(file.name || 'image.png')}`,
      file,
    ),
  gitStatus: () => request('GET', '/api/git'),
  push: () => request('POST', '/api/git/push', {}),
  /** Maps an image path as written in a post (relative to the post file) to a viewable URL. */
  assetUrl: (src) => {
    if (/^(https?:|data:|blob:)/i.test(src)) return src;
    const resolved = new URL(src, `${location.origin}/files/src/content/blog/post.md`);
    return resolved.pathname.startsWith('/files/src/assets/') ? resolved.pathname : src;
  },
};
