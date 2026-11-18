import { marked } from '/vendor/marked.js';
import { api } from '/api.js';

const $ = (selector, root = document) => root.querySelector(selector);
const $$ = (selector, root = document) => [...root.querySelectorAll(selector)];

// Schema defaults (src/content.config.ts) — used so a missing key and its default compare equal
// and opening + saving a post never adds keys the author didn't touch.
const DEFAULTS = {
  showHeroImage: true,
  sticky: false,
  comments: true,
  'sidebar.toc': true,
  'sidebar.relatedPosts': true,
};
const TEXT_FIELDS = ['title', 'description', 'author', 'heroImage', 'ogImage', 'canonicalUrl'];
const DATE_FIELDS = ['date', 'updatedDate'];
const LIST_FIELDS = ['tags', 'categories', 'series'];

const state = {
  posts: [],
  filter: 'all',
  query: '',
  current: null,
  snapshot: '',
  busy: false,
};

const form = $('#meta');
const bodyInput = $('#body');
const preview = $('#preview');
const chips = Object.fromEntries(
  LIST_FIELDS.map((name) => [name, createChips($(`[data-chips="${name}"]`), name)]),
);

// ---------- list ----------

async function loadPosts() {
  state.posts = await api.listPosts();
  for (const name of LIST_FIELDS) {
    const counts = new Map();
    for (const post of state.posts) {
      for (const value of post[name]) counts.set(value, (counts.get(value) ?? 0) + 1);
    }
    chips[name].setOptions([...counts].sort((a, b) => b[1] - a[1]).map(([value]) => value));
  }
  renderList();
}

function renderList() {
  const query = state.query.trim().toLowerCase();
  const list = $('#post-list');
  list.replaceChildren();

  const visible = state.posts.filter((post) => {
    if (state.filter === 'published' && post.draft) return false;
    if (state.filter === 'draft' && !post.draft) return false;
    if (state.filter === 'uncommitted' && !post.uncommitted) return false;
    if (!query) return true;
    return [
      post.title,
      post.slug,
      post.description,
      ...post.tags,
      ...post.categories,
      ...post.series,
    ]
      .join(' ')
      .toLowerCase()
      .includes(query);
  });

  for (const post of visible) {
    const item = document.createElement('li');
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'post-item' + (state.current?.slug === post.slug ? ' active' : '');
    button.addEventListener('click', () => openPost(post.slug));

    const title = document.createElement('span');
    title.className = 'post-title';
    title.textContent = post.title;

    const meta = document.createElement('span');
    meta.className = 'post-meta';
    meta.textContent = `${formatDate(post.date)} · ${post.slug}`;

    const badges = document.createElement('span');
    badges.className = 'post-badges';
    if (post.draft) badges.append(badge('草稿', 'draft'));
    if (post.uncommitted) badges.append(badge('未提交', 'pending'));

    button.append(title, meta, badges);
    item.append(button);
    list.append(item);
  }

  if (visible.length === 0) {
    const empty = document.createElement('li');
    empty.className = 'list-empty';
    empty.textContent = '沒有符合的文章';
    list.append(empty);
  }
}

function badge(label, kind) {
  const element = document.createElement('span');
  element.className = `badge ${kind}`;
  element.textContent = label;
  return element;
}

// ---------- editor ----------

async function openPost(slug) {
  if (state.current?.slug === slug) return;
  if (isDirty() && !confirm('目前的文章還沒存檔，確定要離開嗎？')) return;

  try {
    const post = await api.getPost(slug);
    loadIntoEditor(post);
  } catch (error) {
    toast(error.message, 'error');
  }
}

function loadIntoEditor(post) {
  state.current = post;
  const data = post.frontmatter;

  for (const name of TEXT_FIELDS) form.elements[name].value = data[name] ?? '';
  for (const name of DATE_FIELDS) form.elements[name].value = toLocalInput(data[name]);
  for (const name of LIST_FIELDS) chips[name].set(Array.isArray(data[name]) ? data[name] : []);
  for (const name of Object.keys(DEFAULTS)) {
    form.elements[name].checked = Boolean(originalValue(name));
  }
  bodyInput.value = post.body;

  state.snapshot = serializeEditor();
  $('#empty').hidden = true;
  $('#editor').hidden = false;
  $('#preview-note').textContent = post.ext === 'mdx' ? '預覽（MDX 元件不會在這裡呈現）' : '預覽';
  refreshChrome();
  renderPreview();
  renderList();
}

/** Current value of a frontmatter key in the loaded file, falling back to the schema default. */
function originalValue(name) {
  const value = name
    .split('.')
    .reduce(
      (current, key) => (current && typeof current === 'object' ? current[key] : undefined),
      state.current.frontmatter,
    );
  return value === undefined ? DEFAULTS[name] : value;
}

function readForm() {
  const patch = {};
  for (const name of TEXT_FIELDS) patch[name] = form.elements[name].value.trim();
  for (const name of DATE_FIELDS) {
    patch[name] = fromLocalInput(form.elements[name].value, state.current.frontmatter[name]);
  }
  for (const name of LIST_FIELDS) patch[name] = chips[name].get();
  for (const name of Object.keys(DEFAULTS)) {
    const checked = form.elements[name].checked;
    const original = originalValue(name);
    // `sticky` may be a number (pin order); keep it as-is while the box stays checked.
    const value = name === 'sticky' && checked && typeof original === 'number' ? original : checked;
    if (value !== original) patch[name] = value;
  }
  return patch;
}

function serializeEditor() {
  return JSON.stringify({ frontmatter: readForm(), body: bodyInput.value });
}

function isDirty() {
  return Boolean(state.current) && serializeEditor() !== state.snapshot;
}

function refreshChrome() {
  const post = state.current;
  if (!post) return;
  const draft = post.frontmatter.draft === true;
  const summary = state.posts.find((item) => item.slug === post.slug);

  $('#doc-title').textContent = form.elements.title.value || post.slug;
  $('#doc-path').textContent = post.file;
  const status = $('#status-badge');
  status.textContent = draft ? '草稿' : '已發布';
  status.className = `badge ${draft ? 'draft' : 'live'}`;
  $('#dirty').hidden = !isDirty();

  $('#publish').hidden = !draft;
  $('#unpublish').hidden = draft;
  const pushButton = $('#push-post');
  pushButton.textContent = draft ? '推送草稿' : '推送更新';
  pushButton.disabled = !summary?.uncommitted && !isDirty();

  const description = form.elements.description.value.trim();
  $('#desc-count').textContent = `${description.length} 字`;

  const thumb = $('#hero-thumb');
  const hero = form.elements.heroImage.value.trim();
  thumb.hidden = !hero;
  if (hero) thumb.src = `${api.assetUrl(hero)}?t=${Date.now()}`;
}

let previewTimer;
function renderPreview() {
  clearTimeout(previewTimer);
  previewTimer = setTimeout(() => {
    const hero = form.elements.heroImage.value.trim();
    const heroHtml =
      hero && form.elements.showHeroImage.checked
        ? `<img class="hero" src="${api.assetUrl(hero)}" alt="">`
        : '';
    preview.innerHTML = heroHtml + marked.parse(bodyInput.value, { gfm: true });
    for (const image of $$('img', preview)) {
      const src = image.getAttribute('src');
      if (src) image.src = api.assetUrl(src);
    }
  }, 120);
}

async function save({ quiet = false } = {}) {
  const post = state.current;
  if (!post || state.busy) return false;
  if (!isDirty()) {
    if (!quiet) toast('沒有變更');
    return true;
  }

  try {
    state.busy = true;
    const saved = await api.savePost(post.slug, readForm(), bodyInput.value, post.hash);
    state.current = saved;
    state.snapshot = serializeEditor();
    await loadPosts();
    refreshChrome();
    if (!quiet) toast('已存檔');
    return true;
  } catch (error) {
    toast(error.message, 'error');
    if (error.status === 409 && confirm(`${error.message}\n\n要捨棄目前的修改、重新載入檔案嗎？`)) {
      loadIntoEditor(await api.getPost(post.slug));
    }
    return false;
  } finally {
    state.busy = false;
  }
}

// ---------- publish / unpublish / push ----------

const publishDialog = $('#publish-dialog');

async function startPublish(mode) {
  const post = state.current;
  if (!post || !(await save({ quiet: true }))) return;

  const title = state.current.frontmatter.title || post.slug;
  const draft = state.current.frontmatter.draft === true;
  const config = {
    publish: { heading: '發布文章', message: `發布文章：${title}`, draft: false, check: true },
    unpublish: {
      heading: '下架文章（改回草稿）',
      message: `下架文章：${title}`,
      draft: true,
      check: false,
    },
    push: draft
      ? { heading: '推送草稿（不會公開）', message: `新增文章草稿：${title}`, check: false }
      : { heading: '推送更新', message: `更新文章：${title}`, check: true, touch: true },
  }[mode];

  $('[data-heading]', publishDialog).textContent = config.heading;
  publishDialog.querySelector('[name="message"]').value = config.message;
  const touch = publishDialog.querySelector('[name="touchUpdatedDate"]');
  touch.checked = false;
  $('[data-touch-wrap]', publishDialog).hidden = !config.touch;
  const log = $('[data-log]', publishDialog);
  log.hidden = true;
  log.textContent = '';

  const errors = $('[data-errors]', publishDialog);
  const warnings = $('[data-warnings]', publishDialog);
  errors.replaceChildren();
  warnings.replaceChildren();
  let result = { errors: [], warnings: [] };
  if (config.check) {
    try {
      result = await api.checkPost(post.slug);
    } catch (error) {
      toast(error.message, 'error');
      return;
    }
  }
  for (const message of result.errors) errors.append(listItem(message));
  for (const message of result.warnings) warnings.append(listItem(message));
  $('[data-ok]', publishDialog).hidden =
    !config.check || result.errors.length + result.warnings.length > 0;

  const confirmButton = $('[data-confirm]', publishDialog);
  confirmButton.disabled = result.errors.length > 0;
  confirmButton.textContent = result.errors.length > 0 ? '請先修正錯誤' : '確認並推送';
  confirmButton.onclick = async (event) => {
    event.preventDefault();
    confirmButton.disabled = true;
    confirmButton.textContent = '處理中…';
    log.hidden = false;
    log.textContent = '執行 git commit（pre-commit 格式檢查可能要一點時間）…';
    try {
      const outcome = await api.publish(post.slug, {
        draft: config.draft,
        touchUpdatedDate: touch.checked,
        message: publishDialog.querySelector('[name="message"]').value,
      });
      log.textContent = outcome.log || '(沒有輸出)';
      if (outcome.error) toast(outcome.error, 'error');
      else toast(mode === 'unpublish' ? '已下架並推送' : '已推送，GitHub Actions 會接著部署');
      confirmButton.textContent = outcome.committed ? '完成' : '重試';
      confirmButton.disabled = outcome.committed;
    } catch (error) {
      log.textContent = [error.message, error.detail].filter(Boolean).join('\n\n');
      toast(error.message, 'error');
      confirmButton.textContent = '重試';
      confirmButton.disabled = false;
    }
    loadIntoEditor(await api.getPost(post.slug));
    await Promise.all([loadPosts(), loadGitStatus()]);
    refreshChrome();
  };

  publishDialog.showModal();
}

function listItem(text) {
  const item = document.createElement('li');
  item.textContent = text;
  return item;
}

async function loadGitStatus() {
  const footer = $('#git-status');
  try {
    const status = await api.gitStatus();
    footer.replaceChildren(`分支 ${status.branch}`);
    if (!status.remote) footer.append(' · 沒有追蹤遠端');
    else if (status.ahead > 0) {
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'btn small';
      button.textContent = `推送 ${status.ahead} 個 commit`;
      button.addEventListener('click', async () => {
        button.disabled = true;
        const result = await api.push().catch((error) => ({ ok: false, log: error.message }));
        toast(result.ok ? '已推送' : `推送失敗：${result.log}`, result.ok ? undefined : 'error');
        loadGitStatus();
      });
      footer.append(' · ', button);
    } else footer.append(' · 已與遠端同步');
  } catch (error) {
    footer.textContent = `git 狀態讀取失敗：${error.message}`;
  }
}

// ---------- images ----------

let pendingUpload = 'inline';
const fileInput = $('#file-input');

async function uploadImage(file, kind) {
  const post = state.current;
  if (!post || !file) return;
  try {
    const result = await api.uploadImage(post.slug, kind, file);
    if (kind === 'cover') {
      form.elements.heroImage.value = result.path;
      toast(
        result.size > 300 * 1024
          ? `封面 ${Math.round(result.size / 1024)}KB，建議壓到 300KB 以下`
          : '封面已上傳',
        result.size > 300 * 1024 ? 'error' : undefined,
      );
    } else {
      const alt = file.name.replace(/\.[^.]+$/, '').replace(/^(image|screenshot).*$/i, '');
      insertAtCursor(`![${alt}](${result.path})\n`);
      toast(`已上傳 ${result.file}`);
    }
    onEdit();
    loadPosts();
  } catch (error) {
    toast(error.message, 'error');
  }
}

function insertAtCursor(text) {
  const { selectionStart, selectionEnd, value } = bodyInput;
  const prefix = selectionStart > 0 && value[selectionStart - 1] !== '\n' ? '\n' : '';
  bodyInput.setRangeText(prefix + text, selectionStart, selectionEnd, 'end');
  bodyInput.focus();
}

// ---------- new post ----------

const newDialog = $('#new-dialog');
const newForm = $('form', newDialog);

newForm.addEventListener('submit', async (event) => {
  if (event.submitter?.value !== 'ok') return;
  event.preventDefault();
  const error = $('[data-error]', newForm);
  error.textContent = '';
  try {
    const post = await api.createPost(
      newForm.elements.slug.value.trim(),
      newForm.elements.title.value.trim(),
      newForm.elements.mdx.checked ? 'mdx' : 'md',
    );
    newDialog.close();
    newForm.reset();
    await loadPosts();
    state.current = null;
    loadIntoEditor(post);
    toast('已建立草稿');
  } catch (failure) {
    error.textContent = failure.message;
  }
});

// ---------- chips ----------

function createChips(container, name) {
  let values = [];
  const input = document.createElement('input');
  input.type = 'text';
  input.placeholder = '輸入後按 Enter';
  input.setAttribute('list', `${name}-options`);
  const datalist = document.createElement('datalist');
  datalist.id = `${name}-options`;
  container.append(input, datalist);

  const render = () => {
    $$('.chip', container).forEach((chip) => chip.remove());
    for (const value of values) {
      const chip = document.createElement('span');
      chip.className = 'chip';
      chip.textContent = value;
      const remove = document.createElement('button');
      remove.type = 'button';
      remove.textContent = '×';
      remove.setAttribute('aria-label', `移除 ${value}`);
      remove.addEventListener('click', () => {
        values = values.filter((item) => item !== value);
        render();
        onEdit();
      });
      chip.append(remove);
      container.insertBefore(chip, input);
    }
  };

  const commit = () => {
    const value = input.value.replace(/[,，]/g, '').trim();
    input.value = '';
    if (!value || values.includes(value)) return;
    values = [...values, value];
    render();
    onEdit();
  };

  input.addEventListener('keydown', (event) => {
    if (event.isComposing) return;
    if (event.key === 'Enter' || event.key === ',') {
      event.preventDefault();
      commit();
    } else if (event.key === 'Backspace' && !input.value && values.length > 0) {
      values = values.slice(0, -1);
      render();
      onEdit();
    }
  });
  input.addEventListener('input', (event) => {
    // Picking a suggestion from the datalist arrives as a replacement, not typing.
    if (!event.inputType || event.inputType === 'insertReplacementText') commit();
  });
  input.addEventListener('blur', commit);
  container.addEventListener('click', (event) => {
    if (event.target === container) input.focus();
  });

  return {
    get: () => [...values],
    set: (next) => {
      values = [...next];
      render();
    },
    setOptions: (options) => {
      datalist.replaceChildren(
        ...options.map((option) =>
          Object.assign(document.createElement('option'), { value: option }),
        ),
      );
    },
  };
}

// ---------- helpers ----------

function onEdit() {
  refreshChrome();
  renderPreview();
}

function pad(value) {
  return String(value).padStart(2, '0');
}

function toLocalInput(value) {
  if (!value) return '';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

/** Keeps the original string (with its seconds/ms) unless the user actually changed the minute. */
function fromLocalInput(inputValue, original) {
  if (!inputValue) return '';
  if (original && toLocalInput(original) === inputValue) return original;
  return new Date(inputValue).toISOString();
}

function formatDate(value) {
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? '無日期'
    : `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

let toastTimer;
function toast(message, kind) {
  const element = $('#toast');
  element.textContent = message;
  element.className = `toast show ${kind ?? ''}`;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => (element.className = 'toast'), kind === 'error' ? 6000 : 2500);
}

// ---------- wiring ----------

form.addEventListener('input', onEdit);
form.addEventListener('change', onEdit);
bodyInput.addEventListener('input', onEdit);
bodyInput.addEventListener('scroll', () => {
  const range = bodyInput.scrollHeight - bodyInput.clientHeight;
  const pane = preview.parentElement;
  if (range > 0)
    pane.scrollTop = (bodyInput.scrollTop / range) * (pane.scrollHeight - pane.clientHeight);
});

bodyInput.addEventListener('paste', (event) => {
  const file = [...(event.clipboardData?.files ?? [])].find((item) =>
    item.type.startsWith('image/'),
  );
  if (!file) return;
  event.preventDefault();
  uploadImage(file, 'inline');
});
bodyInput.addEventListener('dragover', (event) => event.preventDefault());
bodyInput.addEventListener('drop', (event) => {
  const files = [...(event.dataTransfer?.files ?? [])].filter((item) =>
    item.type.startsWith('image/'),
  );
  if (files.length === 0) return;
  event.preventDefault();
  files.reduce((chain, file) => chain.then(() => uploadImage(file, 'inline')), Promise.resolve());
});

$('#insert-image').addEventListener('click', () => {
  pendingUpload = 'inline';
  fileInput.click();
});
$('[data-upload-cover]').addEventListener('click', () => {
  pendingUpload = 'cover';
  fileInput.click();
});
fileInput.addEventListener('change', () => {
  uploadImage(fileInput.files?.[0], pendingUpload);
  fileInput.value = '';
});

$('[data-now="updatedDate"]').addEventListener('click', () => {
  form.elements.updatedDate.value = toLocalInput(new Date().toISOString());
  onEdit();
});
$('[data-clear="updatedDate"]').addEventListener('click', () => {
  form.elements.updatedDate.value = '';
  onEdit();
});

$('#toggle-meta').addEventListener('click', (event) => {
  form.hidden = !form.hidden;
  event.currentTarget.setAttribute('aria-expanded', String(!form.hidden));
});
$('#save').addEventListener('click', () => save());
$('#publish').addEventListener('click', () => startPublish('publish'));
$('#unpublish').addEventListener('click', () => startPublish('unpublish'));
$('#push-post').addEventListener('click', () => startPublish('push'));
$('#new-post').addEventListener('click', () => newDialog.showModal());

$('#search').addEventListener('input', (event) => {
  state.query = event.target.value;
  renderList();
});
for (const button of $$('[data-filter]')) {
  button.addEventListener('click', () => {
    state.filter = button.dataset.filter;
    $$('[data-filter]').forEach((other) => other.classList.toggle('active', other === button));
    renderList();
  });
}

document.addEventListener('keydown', (event) => {
  if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 's') {
    event.preventDefault();
    save();
  }
});
window.addEventListener('beforeunload', (event) => {
  if (isDirty()) event.preventDefault();
});

await Promise.all([loadPosts(), loadGitStatus()]);
