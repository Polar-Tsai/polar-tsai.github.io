import { isScalar, isSeq, parseDocument, Scalar, type Document } from 'yaml';

const FRONTMATTER_PATTERN = /^---\n([\s\S]*?)\n?---(?:\n|$)/;

export interface ParsedPost {
  doc: Document;
  data: Record<string, unknown>;
  rawFrontmatter: string;
  frontmatterChanged: boolean;
  body: string;
  eol: '\n' | '\r\n';
}

export function parsePost(source: string): ParsedPost {
  const eol = source.includes('\r\n') ? '\r\n' : '\n';
  const normalized = source.replace(/\r\n/g, '\n');
  const match = FRONTMATTER_PATTERN.exec(normalized);

  if (!match) throw new Error('找不到 frontmatter 區塊（檔案開頭需要 --- ... ---）');

  const doc = parseDocument(match[1]);
  if (doc.errors.length > 0) throw new Error(`frontmatter YAML 錯誤：${doc.errors[0].message}`);

  return {
    doc,
    data: toData(doc),
    rawFrontmatter: match[1],
    frontmatterChanged: false,
    body: normalized.slice(match[0].length),
    eol,
  };
}

export function serializePost(post: ParsedPost): string {
  // Untouched frontmatter is written back verbatim so a body-only edit never reformats YAML.
  const frontmatter = post.frontmatterChanged
    ? keepOriginalLines(
        post.rawFrontmatter,
        post.doc.toString({ lineWidth: 0, flowCollectionPadding: false }).replace(/\n$/, ''),
      )
    : post.rawFrontmatter;
  const content = `---\n${frontmatter}\n---\n${post.body}`;

  return post.eol === '\r\n' ? content.replace(/\n/g, '\r\n') : content;
}

/**
 * Applies `{ 'sidebar.toc': true, tags: [...] }` style patches, touching only fields whose value
 * actually changed and keeping each node's existing quote / flow style.
 */
export function applyFrontmatterPatch(post: ParsedPost, patch: Record<string, unknown>): boolean {
  let changed = false;

  for (const [key, value] of Object.entries(patch)) {
    const path = key.split('.');
    if (isSameValue(getPath(post.data, path), value)) continue;

    setNode(post.doc, path, value);
    changed = true;
  }

  if (changed) {
    post.data = toData(post.doc);
    post.frontmatterChanged = true;
  }

  return changed;
}

function setNode(doc: Document, path: string[], value: unknown): void {
  const existing = doc.getIn(path, true);

  if (Array.isArray(value)) {
    const seq = doc.createNode(value);
    seq.flow = isSeq(existing) ? existing.flow : true;
    if (isSeq(existing)) seq.comment = existing.comment;
    // Follow the list's existing quote style; empty lists default to the posts' usual ["..."].
    const quoteStyle =
      (isSeq(existing) ? existing.items.find(isScalar)?.type : undefined) ?? Scalar.QUOTE_DOUBLE;
    for (const item of seq.items) {
      if (isScalar(item) && typeof item.value === 'string') item.type = quoteStyle;
    }
    doc.setIn(path, seq);
    return;
  }

  if (isScalar(existing)) {
    existing.value = value;
    return;
  }

  doc.setIn(path, value);
}

// The YAML printer collapses comment alignment and whitespace-only lines; restore the author's
// original line wherever the re-printed one is semantically identical.
function keepOriginalLines(original: string, printed: string): string {
  const normalize = (line: string) => line.replace(/\s+#/, ' #').trimEnd();
  const originalLines = original.split('\n');
  let cursor = 0;

  return printed
    .split('\n')
    .map((line) => {
      const target = normalize(line);
      for (let offset = 0; offset < 6 && cursor + offset < originalLines.length; offset++) {
        const candidate = originalLines[cursor + offset];
        if (normalize(candidate) === target) {
          cursor += offset + 1;
          return candidate;
        }
      }
      return line;
    })
    .join('\n');
}

function toData(doc: Document): Record<string, unknown> {
  const data: unknown = doc.toJS();
  return data && typeof data === 'object' ? (data as Record<string, unknown>) : {};
}

function getPath(data: Record<string, unknown>, path: string[]): unknown {
  let current: unknown = data;
  for (const key of path) {
    if (!current || typeof current !== 'object') return undefined;
    current = (current as Record<string, unknown>)[key];
  }
  return current;
}

function isSameValue(a: unknown, b: unknown): boolean {
  const isBlank = (value: unknown) => value === undefined || value === null || value === '';
  if (isBlank(a) && isBlank(b)) return true;
  return JSON.stringify(a) === JSON.stringify(b);
}
