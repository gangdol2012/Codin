import type { NotebookCommandRequest } from './notebook-cli.ts';

export type ParsedNotebookAssistantRequest =
  | { ok: true; path: string; request: NotebookCommandRequest; displayedCommand: string }
  | { ok: false; error: string };

/** Converts a provider tool payload into the same structured request used by the Terminal CLI. */
export function parseNotebookAssistantRequest(args: Record<string, unknown>): ParsedNotebookAssistantRequest {
  const rawAction = typeof args.action === 'string' ? args.action.trim().toLowerCase().replace(/_/g, '-') : '';
  const actionAliases: Record<string, NotebookCommandRequest['command']> = {
    list: 'show',
    get: 'show',
    inspect: 'show',
    edit: 'set-source',
    replace: 'set-source',
    insert: 'add',
    remove: 'delete',
    type: 'set-type',
    language: 'set-language',
  };
  const action = actionAliases[rawAction] || rawAction;
  const supportedActions = new Set<NotebookCommandRequest['command']>([
    'show',
    'validate',
    'set-source',
    'add',
    'delete',
    'move',
    'set-type',
    'duplicate',
    'clear-outputs',
    'set-language',
  ]);
  if (!supportedActions.has(action as NotebookCommandRequest['command'])) {
    return { ok: false, error: `notebook: unsupported action '${rawAction || '(missing)'}'` };
  }

  const path = typeof args.path === 'string' ? args.path.trim() : '';
  if (!path) return { ok: false, error: 'notebook: a .ipynb path is required' };

  const wasProvided = (key: string) => (
    Object.prototype.hasOwnProperty.call(args, key) && args[key] !== undefined
  );
  const allowedArguments: Record<NotebookCommandRequest['command'], readonly string[]> = {
    show: ['cell'],
    validate: [],
    'set-source': ['cell', 'source'],
    add: ['cellType', 'source', 'index'],
    delete: ['cell'],
    move: ['cell', 'index'],
    'set-type': ['cell', 'cellType'],
    duplicate: ['cell', 'index'],
    'clear-outputs': ['cell'],
    'set-language': ['language'],
  };
  for (const key of ['cell', 'source', 'cellType', 'index', 'language']) {
    if (wasProvided(key) && !allowedArguments[action as NotebookCommandRequest['command']].includes(key)) {
      return { ok: false, error: `notebook: ${action} does not accept ${key}` };
    }
  }

  const cellWasProvided = wasProvided('cell');
  const normalizeCell = (): string | null => {
    if (typeof args.cell === 'string' && args.cell.trim()) return args.cell.trim();
    if (typeof args.cell === 'number' && Number.isSafeInteger(args.cell) && args.cell >= 1) return `#${args.cell}`;
    return null;
  };
  const normalizedCell = normalizeCell();
  if (cellWasProvided && normalizedCell === null) {
    return { ok: false, error: 'notebook: cell must be a non-empty stable cell ID or positive 1-based number' };
  }
  const requireCell = () => normalizedCell;
  const optionalIndex = !wasProvided('index')
    ? undefined
    : typeof args.index === 'number'
      ? args.index
      : typeof args.index === 'string' && /^\d+$/.test(args.index.trim())
        ? Number(args.index.trim())
        : Number.NaN;
  if (optionalIndex !== undefined && (!Number.isSafeInteger(optionalIndex) || optionalIndex < 1)) {
    return { ok: false, error: 'notebook: index must be a positive 1-based integer' };
  }

  const quote = (value: string) => JSON.stringify(value);
  const prefix = `notebook ${action} ${quote(path)}`;
  let request: NotebookCommandRequest;
  let displayedCommand = prefix;

  switch (action) {
    case 'show': {
      request = { command: 'show', ...(normalizedCell ? { cell: normalizedCell } : {}) };
      if (normalizedCell) displayedCommand += ` ${quote(normalizedCell)}`;
      break;
    }
    case 'validate':
      request = { command: 'validate' };
      break;
    case 'set-source': {
      const cell = requireCell();
      if (!cell) return { ok: false, error: 'notebook: set-source requires a cell ID or #N reference' };
      if (typeof args.source !== 'string') return { ok: false, error: 'notebook: set-source requires source text' };
      request = { command: 'set-source', cell, source: args.source };
      displayedCommand += ` ${quote(cell)} --source <assistant-tool-source>`;
      break;
    }
    case 'add': {
      const cellType = args.cellType === 'code' || args.cellType === 'markdown' || args.cellType === 'raw'
        ? args.cellType
        : null;
      if (!cellType) return { ok: false, error: 'notebook: add requires cellType code, markdown, or raw' };
      if (typeof args.source !== 'string') return { ok: false, error: 'notebook: add requires source text' };
      request = { command: 'add', cellType, source: args.source, ...(optionalIndex !== undefined ? { index: optionalIndex } : {}) };
      displayedCommand += ` ${cellType} --source <assistant-tool-source>${optionalIndex !== undefined ? ` --index ${optionalIndex}` : ''}`;
      break;
    }
    case 'delete': {
      const cell = requireCell();
      if (!cell) return { ok: false, error: 'notebook: delete requires a cell ID or #N reference' };
      request = { command: 'delete', cell };
      displayedCommand += ` ${quote(cell)}`;
      break;
    }
    case 'move': {
      const cell = requireCell();
      if (!cell) return { ok: false, error: 'notebook: move requires a cell ID or #N reference' };
      if (optionalIndex === undefined) return { ok: false, error: 'notebook: move requires a 1-based index' };
      request = { command: 'move', cell, index: optionalIndex };
      displayedCommand += ` ${quote(cell)} --index ${optionalIndex}`;
      break;
    }
    case 'set-type': {
      const cell = requireCell();
      if (!cell) return { ok: false, error: 'notebook: set-type requires a cell ID or #N reference' };
      const cellType = args.cellType === 'code' || args.cellType === 'markdown' || args.cellType === 'raw'
        ? args.cellType
        : null;
      if (!cellType) return { ok: false, error: 'notebook: set-type requires cellType code, markdown, or raw' };
      request = { command: 'set-type', cell, cellType };
      displayedCommand += ` ${quote(cell)} ${cellType}`;
      break;
    }
    case 'duplicate': {
      const cell = requireCell();
      if (!cell) return { ok: false, error: 'notebook: duplicate requires a cell ID or #N reference' };
      request = { command: 'duplicate', cell, ...(optionalIndex !== undefined ? { index: optionalIndex } : {}) };
      displayedCommand += ` ${quote(cell)}${optionalIndex !== undefined ? ` --index ${optionalIndex}` : ''}`;
      break;
    }
    case 'clear-outputs': {
      request = { command: 'clear-outputs', ...(normalizedCell ? { cell: normalizedCell } : {}) };
      if (normalizedCell) displayedCommand += ` ${quote(normalizedCell)}`;
      break;
    }
    case 'set-language': {
      const normalizedLanguage = typeof args.language === 'string'
        ? args.language.trim().toLowerCase().replace(/[._\s-]+/g, '')
        : '';
      const language = ['python', 'python3', 'py'].includes(normalizedLanguage)
        ? 'python'
        : ['csharp', 'cs', 'c#', 'netcsharp'].includes(normalizedLanguage)
          ? 'csharp'
          : null;
      if (!language) return { ok: false, error: 'notebook: set-language requires python or csharp' };
      request = { command: 'set-language', language };
      displayedCommand += ` ${language}`;
      break;
    }
    default:
      return { ok: false, error: `notebook: unsupported action '${action}'` };
  }

  return { ok: true, path, request, displayedCommand };
}
