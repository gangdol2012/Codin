export interface NotebookWorkspaceItem {
  id: string;
  name: string;
  type: 'file' | 'folder';
  parentId: string | null;
}

export interface ResolvedNotebookWorkspaceFile<T extends NotebookWorkspaceItem> {
  item: T & { type: 'file' };
  path: string;
}

export interface NotebookWorkspaceContentItem extends NotebookWorkspaceItem {
  content?: string;
}

export type NotebookWorkspaceContentUpdateResult<T extends NotebookWorkspaceContentItem> =
  | { ok: true; changed: boolean; items: T[] }
  | { ok: false; changed: false; items: T[]; error: string };

export interface NotebookWorkspaceFileResolutionError {
  error: string;
  path: string;
}

export function normalizeNotebookWorkspacePath(path: string): string {
  const resolved: string[] = [];
  for (const rawPart of path.replace(/\\/g, '/').split('/')) {
    const part = rawPart.trim();
    if (!part || part === '.') continue;
    if (part === '..') resolved.pop();
    else resolved.push(part);
  }
  return resolved.join('/');
}

export function getNotebookWorkspaceItemPath<T extends NotebookWorkspaceItem>(
  items: T[],
  id: string | undefined,
): string {
  if (!id) return '';
  const parts: string[] = [];
  const visited = new Set<string>();
  let cursorId: string | null | undefined = id;
  while (cursorId) {
    if (visited.has(cursorId)) return '';
    visited.add(cursorId);
    const item = items.find(candidate => candidate.id === cursorId);
    if (!item) return '';
    parts.unshift(item.name);
    cursorId = item.parentId;
  }
  return parts.join('/');
}

export function resolveNotebookWorkspaceFile<T extends NotebookWorkspaceItem>(
  items: T[],
  cwdId: string | null,
  requestedPath: string,
): ResolvedNotebookWorkspaceFile<T> | NotebookWorkspaceFileResolutionError {
  const rawPath = requestedPath.trim();
  const cwdPath = cwdId ? getNotebookWorkspaceItemPath(items, cwdId) : '';
  const explicitlyRooted = rawPath === '~' || rawPath.startsWith('~/') || rawPath.startsWith('/');
  if (!explicitlyRooted && cwdId) {
    const cwdItem = items.find(candidate => candidate.id === cwdId);
    if (!cwdItem || cwdItem.type !== 'folder' || !cwdPath) {
      return {
        error: 'notebook: current Terminal directory is no longer available',
        path: normalizeNotebookWorkspacePath(rawPath),
      };
    }
  }
  const rootRelativePath = rawPath === '~'
    ? ''
    : rawPath.startsWith('~/')
      ? rawPath.slice(2)
      : rawPath.startsWith('/')
        ? rawPath.slice(1)
        : [cwdPath, rawPath].filter(Boolean).join('/');
  const path = normalizeNotebookWorkspacePath(rootRelativePath);
  const matches = items.filter(candidate => (
    normalizeNotebookWorkspacePath(getNotebookWorkspaceItemPath(items, candidate.id)) === path
  ));
  const item = matches[0];
  const resolvedPath = item
    ? normalizeNotebookWorkspacePath(getNotebookWorkspaceItemPath(items, item.id))
    : path;

  if (!rawPath || !path) return { error: 'notebook: missing notebook path', path: resolvedPath };
  if (!item) return { error: `notebook: ${requestedPath}: No such file`, path: resolvedPath };
  if (matches.length > 1) {
    return { error: `notebook: ${requestedPath}: Ambiguous path (${matches.length} workspace items match)`, path: resolvedPath };
  }
  if (item.type !== 'file') return { error: `notebook: ${requestedPath}: Is a directory`, path: resolvedPath };
  if (!/\.ipynb$/i.test(item.name)) {
    return { error: `notebook: ${requestedPath}: Expected a .ipynb file`, path: resolvedPath };
  }
  return { item: item as T & { type: 'file' }, path: resolvedPath };
}

/**
 * Applies a notebook write to a fresh workspace snapshot. The expected-content
 * check prevents a delayed assistant tool call from overwriting a newer edit.
 */
export function applyNotebookWorkspaceContentUpdate<T extends NotebookWorkspaceContentItem>(
  items: T[],
  fileId: string,
  expectedContent: string,
  nextContent: string,
): NotebookWorkspaceContentUpdateResult<T> {
  const matches = items.filter(item => item.id === fileId);
  if (matches.length !== 1 || matches[0].type !== 'file') {
    return {
      ok: false,
      changed: false,
      items,
      error: matches.length > 1
        ? 'notebook: workspace changed before the edit could be saved (duplicate file ID)'
        : 'notebook: workspace changed before the edit could be saved (target file is unavailable)',
    };
  }

  const target = matches[0];
  if ((target.content || '') !== expectedContent) {
    return {
      ok: false,
      changed: false,
      items,
      error: 'notebook: the file changed before this edit could be saved; inspect it again and retry',
    };
  }
  if ((target.content || '') === nextContent) return { ok: true, changed: false, items };

  return {
    ok: true,
    changed: true,
    items: items.map(item => item.id === fileId ? { ...item, content: nextContent } : item),
  };
}
