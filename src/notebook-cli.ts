/**
 * Cell-aware commands for Jupyter notebooks.
 *
 * This module is deliberately independent from React and the CodeCraft file
 * tree. It accepts notebook text and returns either the untouched original or
 * a safely serialized nbformat document, which lets the Terminal and assistant
 * tool share exactly the same mutation behavior.
 */

import {
  clearNotebookCellOutputs,
  createNotebookCell,
  deleteNotebookCell,
  detectNotebookLanguage,
  duplicateNotebookCell,
  insertNotebookCell,
  moveNotebookCell,
  notebookSourceToString,
  parseNotebook,
  serializeNotebook,
  setNotebookCellSource,
  setNotebookCellType,
  setNotebookLanguage,
  type NotebookCell,
  type NotebookCellType,
  type NotebookDocument,
  type NotebookLanguage,
} from './notebook-model.ts';

export type NotebookCellSelector = string;

export type NotebookCommandRequest =
  | { command: 'show'; cell?: NotebookCellSelector }
  | { command: 'validate' }
  | { command: 'set-source'; cell: NotebookCellSelector; source: string }
  | { command: 'add'; cellType: NotebookCellType; source: string; index?: number }
  | { command: 'delete'; cell: NotebookCellSelector }
  | { command: 'move'; cell: NotebookCellSelector; index: number }
  | { command: 'set-type'; cell: NotebookCellSelector; cellType: NotebookCellType }
  | { command: 'duplicate'; cell: NotebookCellSelector; index?: number }
  | { command: 'clear-outputs'; cell?: NotebookCellSelector }
  | { command: 'set-language'; language: NotebookLanguage };

export type NotebookCommandErrorCode =
  | 'invalid-command'
  | 'missing-argument'
  | 'invalid-option'
  | 'invalid-notebook'
  | 'invalid-cell-reference'
  | 'cell-not-found'
  | 'invalid-index'
  | 'invalid-cell-type'
  | 'invalid-language'
  | 'conflict';

export interface NotebookCommandError {
  code: NotebookCommandErrorCode;
  message: string;
}

export interface NotebookCommandResult {
  ok: boolean;
  changed: boolean;
  content: string;
  lines: string[];
  path?: string;
  command?: NotebookCommandRequest['command'];
  cellId?: string;
  error?: NotebookCommandError;
}

export interface NotebookCliInvocation {
  path: string;
  request: NotebookCommandRequest;
}

export type NotebookCliParseResult =
  | { ok: true; invocation: NotebookCliInvocation }
  | { ok: false; error: NotebookCommandError; lines: string[] };

export interface ExecuteNotebookRequestOptions {
  path?: string;
}

export interface FormatNotebookForAssistantOptions {
  path?: string;
  cell?: NotebookCellSelector;
}

export const NOTEBOOK_CLI_USAGE_LINES = [
  'Usage:',
  '  notebook show <path> [<cell-id|#N>]',
  '  notebook validate <path>',
  '  notebook set-source <path> <cell-id|#N> (--source <text> | --source-escaped <text>)',
  '  notebook add <path> <code|markdown|raw> (--source <text> | --source-escaped <text>) [--index N]',
  '  notebook delete <path> <cell-id|#N>',
  '  notebook move <path> <cell-id|#N> --index N',
  '  notebook set-type <path> <cell-id|#N> <code|markdown|raw>',
  '  notebook duplicate <path> <cell-id|#N> [--index N]',
  '  notebook clear-outputs <path> [<cell-id|#N>]',
  '  notebook set-language <path> <python|csharp>',
  '',
  'Cell references use stable cell IDs or explicit 1-based positions such as #2.',
  "Indexes are 1-based. In the one-line Terminal, use --source-escaped 'line 1\\nline 2'; the notebook assistant tool passes exact source directly.",
] as const;

export const NOTEBOOK_CLI_USAGE = NOTEBOOK_CLI_USAGE_LINES.join('\n');

function commandError(code: NotebookCommandErrorCode, message: string): NotebookCommandError {
  return { code, message: `notebook: ${message}` };
}

function parseFailure(error: NotebookCommandError): NotebookCliParseResult {
  return { ok: false, error, lines: [error.message, ...NOTEBOOK_CLI_USAGE_LINES] };
}

function executionFailure(
  content: string,
  error: NotebookCommandError,
  request?: NotebookCommandRequest,
  path?: string,
): NotebookCommandResult {
  return {
    ok: false,
    changed: false,
    content,
    lines: [error.message],
    ...(path ? { path } : {}),
    ...(request ? { command: request.command } : {}),
    error,
  };
}

function normalizeCommandName(value: string) {
  const normalized = value.trim().toLowerCase().replace(/_/g, '-');
  switch (normalized) {
    case 'list':
    case 'get':
    case 'inspect':
      return 'show';
    case 'edit':
    case 'replace':
    case 'replace-cell':
      return 'set-source';
    case 'insert':
      return 'add';
    case 'remove':
      return 'delete';
    case 'type':
      return 'set-type';
    case 'language':
      return 'set-language';
    default:
      return normalized;
  }
}

function parseCellType(value: string | undefined): NotebookCellType | null {
  const normalized = value?.trim().toLowerCase();
  return normalized === 'code' || normalized === 'markdown' || normalized === 'raw'
    ? normalized
    : null;
}

function parseLanguage(value: string | undefined): NotebookLanguage | null {
  const normalized = value?.trim().toLowerCase().replace(/[._\s-]+/g, '');
  if (normalized === 'python' || normalized === 'python3' || normalized === 'py') return 'python';
  if (normalized === 'csharp' || normalized === 'cs' || normalized === 'c#' || normalized === 'netcsharp') return 'csharp';
  return null;
}

function parsePositiveIndex(value: string | undefined): number | null {
  if (!value || !/^\d+$/.test(value)) return null;
  const parsed = Number(value);
  return Number.isSafeInteger(parsed) && parsed >= 1 ? parsed : null;
}

interface ParsedMutationOptions {
  source?: string;
  sourceProvided: boolean;
  sourceEscaped: boolean;
  index?: number;
  positionals: string[];
  error?: NotebookCommandError;
}

function parseMutationOptions(values: string[]): ParsedMutationOptions {
  const parsed: ParsedMutationOptions = {
    sourceProvided: false,
    sourceEscaped: false,
    positionals: [],
  };

  for (let index = 0; index < values.length; index += 1) {
    const value = values[index];
    if (value === '--source' || value === '--source-escaped') {
      if (parsed.sourceProvided) {
        parsed.error = commandError('invalid-option', 'source may be provided only once');
        return parsed;
      }
      if (index + 1 >= values.length) {
        parsed.error = commandError('missing-argument', `${value} requires text (use an empty quoted string for an empty cell)`);
        return parsed;
      }
      parsed.sourceProvided = true;
      parsed.sourceEscaped = value === '--source-escaped';
      parsed.source = parsed.sourceEscaped
        ? decodeEscapedNotebookSource(values[index + 1])
        : values[index + 1];
      index += 1;
      continue;
    }
    if (value === '--index') {
      if (parsed.index !== undefined) {
        parsed.error = commandError('invalid-option', '--index may be provided only once');
        return parsed;
      }
      const resolved = parsePositiveIndex(values[index + 1]);
      if (resolved == null) {
        parsed.error = commandError('invalid-index', '--index requires a positive 1-based integer');
        return parsed;
      }
      parsed.index = resolved;
      index += 1;
      continue;
    }
    if (value.startsWith('--')) {
      parsed.error = commandError('invalid-option', `unknown option '${value}'`);
      return parsed;
    }
    parsed.positionals.push(value);
  }

  return parsed;
}

function decodeEscapedNotebookSource(value: string): string {
  let decoded = '';
  for (let index = 0; index < value.length; index += 1) {
    const character = value[index];
    if (character !== '\\' || index + 1 >= value.length) {
      decoded += character;
      continue;
    }

    const escaped = value[index + 1];
    if (escaped === 'u' && /^[0-9a-fA-F]{4}$/.test(value.slice(index + 2, index + 6))) {
      decoded += String.fromCharCode(Number.parseInt(value.slice(index + 2, index + 6), 16));
      index += 5;
      continue;
    }
    const escapes: Record<string, string> = {
      n: '\n',
      r: '\r',
      t: '\t',
      b: '\b',
      f: '\f',
      v: '\v',
      '0': '\0',
      '\\': '\\',
      '"': '"',
      "'": "'",
    };
    if (Object.prototype.hasOwnProperty.call(escapes, escaped)) {
      decoded += escapes[escaped];
      index += 1;
      continue;
    }
    decoded += `\\${escaped}`;
    index += 1;
  }
  return decoded;
}

function requirePath(args: string[], command: string): string | NotebookCliParseResult {
  const path = args[1];
  return path === undefined
    ? parseFailure(commandError('missing-argument', `${command} requires a notebook path`))
    : path;
}

export function parseNotebookCliArgs(argv: string[]): NotebookCliParseResult {
  const args = argv.slice();
  if (['notebook', 'ipynb'].includes((args[0] || '').toLowerCase())) args.shift();
  const command = normalizeCommandName(args[0] || '');

  if (!command || command === 'help' || command === '--help' || command === '-h') {
    return parseFailure(commandError('invalid-command', command ? 'help' : 'missing command'));
  }

  const pathOrFailure = requirePath(args, command);
  if (typeof pathOrFailure !== 'string') return pathOrFailure;
  const path = pathOrFailure;

  switch (command) {
    case 'show': {
      if (args.length > 3) return parseFailure(commandError('invalid-option', 'show accepts only an optional cell reference'));
      return { ok: true, invocation: { path, request: { command, ...(args[2] !== undefined ? { cell: args[2] } : {}) } } };
    }
    case 'validate': {
      if (args.length > 2) return parseFailure(commandError('invalid-option', 'validate accepts only a notebook path'));
      return { ok: true, invocation: { path, request: { command } } };
    }
    case 'set-source': {
      const cell = args[2];
      if (cell === undefined) return parseFailure(commandError('missing-argument', 'set-source requires a cell ID or #N reference'));
      const options = parseMutationOptions(args.slice(3));
      if (options.error) return parseFailure(options.error);
      if (options.index !== undefined) return parseFailure(commandError('invalid-option', 'set-source does not accept --index'));
      if (options.sourceProvided && options.positionals.length > 0) {
        return parseFailure(commandError('invalid-option', 'set-source received extra text after its source argument'));
      }
      const positionalSource = options.positionals.length > 0 ? options.positionals.join(' ') : undefined;
      const source = options.sourceProvided ? options.source ?? '' : positionalSource;
      if (source === undefined) return parseFailure(commandError('missing-argument', 'set-source requires --source or --source-escaped text'));
      return { ok: true, invocation: { path, request: { command, cell, source } } };
    }
    case 'add': {
      const cellType = parseCellType(args[2]);
      if (!cellType) return parseFailure(commandError('invalid-cell-type', 'add requires code, markdown, or raw'));
      const options = parseMutationOptions(args.slice(3));
      if (options.error) return parseFailure(options.error);
      if (options.sourceProvided && options.positionals.length > 0) {
        return parseFailure(commandError('invalid-option', 'add received extra text after its source argument'));
      }
      const positionalSource = options.positionals.length > 0 ? options.positionals.join(' ') : undefined;
      const source = options.sourceProvided ? options.source ?? '' : positionalSource;
      if (source === undefined) return parseFailure(commandError('missing-argument', 'add requires --source or --source-escaped text'));
      return {
        ok: true,
        invocation: {
          path,
          request: { command, cellType, source, ...(options.index !== undefined ? { index: options.index } : {}) },
        },
      };
    }
    case 'delete': {
      if (args[2] === undefined) return parseFailure(commandError('missing-argument', 'delete requires a cell ID or #N reference'));
      if (args.length > 3) return parseFailure(commandError('invalid-option', 'delete accepts only one cell reference'));
      return { ok: true, invocation: { path, request: { command, cell: args[2] } } };
    }
    case 'move': {
      const cell = args[2];
      if (cell === undefined) return parseFailure(commandError('missing-argument', 'move requires a cell ID or #N reference'));
      const options = parseMutationOptions(args.slice(3));
      if (options.error) return parseFailure(options.error);
      const positionalIndex = options.positionals.length === 1 ? parsePositiveIndex(options.positionals[0]) : null;
      const index = options.index ?? positionalIndex;
      if (
        index == null
        || options.sourceProvided
        || options.positionals.length > 1
        || (options.index !== undefined && options.positionals.length > 0)
      ) {
        return parseFailure(commandError('invalid-index', 'move requires --index N with a positive 1-based destination'));
      }
      return { ok: true, invocation: { path, request: { command, cell, index } } };
    }
    case 'set-type': {
      const cell = args[2];
      if (cell === undefined) return parseFailure(commandError('missing-argument', 'set-type requires a cell ID or #N reference'));
      const cellType = parseCellType(args[3]);
      if (!cellType) return parseFailure(commandError('invalid-cell-type', 'set-type requires code, markdown, or raw'));
      if (args.length > 4) return parseFailure(commandError('invalid-option', 'set-type accepts only a cell reference and cell type'));
      return { ok: true, invocation: { path, request: { command, cell, cellType } } };
    }
    case 'duplicate': {
      const cell = args[2];
      if (cell === undefined) return parseFailure(commandError('missing-argument', 'duplicate requires a cell ID or #N reference'));
      const options = parseMutationOptions(args.slice(3));
      if (options.error) return parseFailure(options.error);
      const positionalIndex = options.positionals.length === 1 ? parsePositiveIndex(options.positionals[0]) : null;
      if (
        options.sourceProvided
        || options.positionals.length > 1
        || (options.positionals.length === 1 && positionalIndex == null)
        || (options.index !== undefined && options.positionals.length > 0)
      ) {
        return parseFailure(commandError('invalid-index', 'duplicate accepts only an optional --index N destination'));
      }
      const index = options.index ?? positionalIndex ?? undefined;
      return {
        ok: true,
        invocation: { path, request: { command, cell, ...(index !== undefined ? { index } : {}) } },
      };
    }
    case 'clear-outputs': {
      if (args.length > 3) return parseFailure(commandError('invalid-option', 'clear-outputs accepts only an optional cell reference'));
      const cell = args[2];
      return { ok: true, invocation: { path, request: { command, ...(cell !== undefined ? { cell } : {}) } } };
    }
    case 'set-language': {
      const language = parseLanguage(args[2]);
      if (!language) return parseFailure(commandError('invalid-language', 'set-language requires python or csharp'));
      if (args.length > 3) return parseFailure(commandError('invalid-option', 'set-language accepts only one language'));
      return { ok: true, invocation: { path, request: { command, language } } };
    }
    default:
      return parseFailure(commandError('invalid-command', `unknown command '${args[0] || ''}'`));
  }
}

interface ResolvedCell {
  cell: NotebookCell;
  index: number;
}

function resolveCell(notebook: NotebookDocument, selector: NotebookCellSelector): ResolvedCell | NotebookCommandError {
  const value = selector.trim();
  if (!value) return commandError('invalid-cell-reference', 'cell reference cannot be empty');

  if (value.startsWith('#')) {
    const position = parsePositiveIndex(value.slice(1));
    if (position == null) {
      return commandError('invalid-cell-reference', `'${selector}' is not a valid 1-based #N cell reference`);
    }
    const cell = notebook.cells[position - 1];
    return cell
      ? { cell, index: position - 1 }
      : commandError('cell-not-found', `cell ${value} does not exist (notebook has ${notebook.cells.length} cell${notebook.cells.length === 1 ? '' : 's'})`);
  }

  const index = notebook.cells.findIndex(cell => cell.id === value);
  if (index >= 0) return { cell: notebook.cells[index], index };
  if (/^\d+$/.test(value)) {
    return commandError('cell-not-found', `cell ID '${value}' was not found; use #${value} only if you meant the 1-based position`);
  }
  return commandError('cell-not-found', `cell '${selector}' was not found; run notebook show to list stable cell IDs`);
}

function validateDestinationIndex(index: number, maximum: number): NotebookCommandError | null {
  if (!Number.isSafeInteger(index) || index < 1 || index > maximum) {
    return commandError('invalid-index', `index must be a 1-based integer from 1 to ${maximum}`);
  }
  return null;
}

function formatCellLines(cell: NotebookCell, index: number): string[] {
  const source = notebookSourceToString(cell.source);
  const codeDetails = cell.cell_type === 'code'
    ? ` | execution=${cell.execution_count ?? 'none'} | outputs=${cell.outputs.length}`
    : '';
  return [
    `Cell #${index + 1} | id=${cell.id} | type=${cell.cell_type}${codeDetails}`,
    '--- source ---',
    ...(source ? source.split(/\r\n|\n|\r/) : ['(empty)']),
    '--- end source ---',
  ];
}

function formatNotebookLines(notebook: NotebookDocument, path?: string, onlyCellIndex?: number): string[] {
  const language = detectNotebookLanguage(notebook) ?? 'unknown';
  const header = [
    `Notebook: ${path || '(notebook)'}`,
    `Format: nbformat ${notebook.nbformat}.${notebook.nbformat_minor}`,
    `Language: ${language}`,
    `Cells: ${notebook.cells.length}`,
  ];
  const selected = onlyCellIndex === undefined
    ? notebook.cells.map((cell, index) => ({ cell, index }))
    : [{ cell: notebook.cells[onlyCellIndex], index: onlyCellIndex }];
  for (const { cell, index } of selected) {
    header.push('', ...formatCellLines(cell, index));
  }
  return header;
}

function isJsonObject(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function isNotebookSource(value: unknown): boolean {
  return typeof value === 'string'
    || (Array.isArray(value) && value.every(part => typeof part === 'string'));
}

function isExecutionCount(value: unknown): boolean {
  return value === null
    || (typeof value === 'number' && Number.isInteger(value) && value >= 0);
}

function assertValidNotebookOutput(value: unknown, cellIndex: number, outputIndex: number): void {
  const location = `cell #${cellIndex + 1} output #${outputIndex + 1}`;
  if (!isJsonObject(value)) throw new Error(`${location} must be a JSON object`);
  if (typeof value.output_type !== 'string' || !value.output_type) {
    throw new Error(`${location} must have a non-empty string output_type`);
  }

  switch (value.output_type) {
    case 'stream':
      if (typeof value.name !== 'string' || !isNotebookSource(value.text)) {
        throw new Error(`${location} has an invalid stream name or text`);
      }
      break;
    case 'display_data':
      if (!isJsonObject(value.data) || !isJsonObject(value.metadata)) {
        throw new Error(`${location} display_data must have object data and metadata`);
      }
      break;
    case 'execute_result':
      if (!isExecutionCount(value.execution_count) || !isJsonObject(value.data) || !isJsonObject(value.metadata)) {
        throw new Error(`${location} execute_result has invalid execution_count, data, or metadata`);
      }
      break;
    case 'error':
      if (typeof value.ename !== 'string' || typeof value.evalue !== 'string' || !isNotebookSource(value.traceback)) {
        throw new Error(`${location} error must have string ename/evalue and string traceback lines`);
      }
      break;
    default:
      // Extension output types are retained byte-for-byte by the normalizer.
      break;
  }
}

function assertStructurallyValidNotebook(raw: Record<string, unknown>): void {
  if (raw.nbformat !== 4) {
    throw new Error(`unsupported nbformat ${String(raw.nbformat)}; only nbformat 4 notebooks can be edited safely`);
  }
  if (typeof raw.nbformat_minor !== 'number' || !Number.isInteger(raw.nbformat_minor) || raw.nbformat_minor < 0) {
    throw new Error('nbformat_minor must be a non-negative integer');
  }
  if (!isJsonObject(raw.metadata)) throw new Error('notebook metadata must be a JSON object');
  if (!Array.isArray(raw.cells)) throw new Error('notebook cells must be an array');

  const cellIds = new Set<string>();
  raw.cells.forEach((value, cellIndex) => {
    const location = `cell #${cellIndex + 1}`;
    if (!isJsonObject(value)) throw new Error(`${location} must be a JSON object`);
    if (value.cell_type !== 'code' && value.cell_type !== 'markdown' && value.cell_type !== 'raw') {
      throw new Error(`${location} has unsupported cell_type '${String(value.cell_type)}'`);
    }
    if (!isJsonObject(value.metadata)) throw new Error(`${location} metadata must be a JSON object`);
    if (!isNotebookSource(value.source)) throw new Error(`${location} source must be a string or an array of strings`);
    if (value.id !== undefined) {
      if (typeof value.id !== 'string' || !/^[A-Za-z0-9_-]{1,64}$/.test(value.id)) {
        throw new Error(`${location} has an invalid cell id`);
      }
      if (cellIds.has(value.id)) throw new Error(`${location} duplicates cell id '${value.id}'`);
      cellIds.add(value.id);
    }
    if (value.cell_type === 'code') {
      if (!isExecutionCount(value.execution_count)) throw new Error(`${location} has an invalid execution_count`);
      if (!Array.isArray(value.outputs)) throw new Error(`${location} outputs must be an array`);
      value.outputs.forEach((output, outputIndex) => assertValidNotebookOutput(output, cellIndex, outputIndex));
    }
    if (value.cell_type === 'markdown' && value.attachments !== undefined && !isJsonObject(value.attachments)) {
      throw new Error(`${location} attachments must be a JSON object`);
    }
  });
}

function parseSupportedNotebook(content: string): NotebookDocument {
  let raw: unknown;
  try {
    raw = JSON.parse(content) as unknown;
  } catch {
    throw new Error('notebook content is not valid JSON');
  }
  if (!isJsonObject(raw)) throw new Error('a Jupyter notebook must be a JSON object');
  if (raw.nbformat !== 4) {
    throw new Error(`unsupported nbformat ${String(raw.nbformat)}; only nbformat 4 notebooks can be edited safely`);
  }
  if (Array.isArray(raw.worksheets) && !Array.isArray(raw.cells)) {
    throw new Error('legacy worksheet-based notebooks are not supported; convert this notebook to nbformat 4 first');
  }
  assertStructurallyValidNotebook(raw);
  return parseNotebook(raw);
}

function successfulResult(
  originalContent: string,
  nextNotebook: NotebookDocument | null,
  request: NotebookCommandRequest,
  lines: string[],
  options: ExecuteNotebookRequestOptions,
  cellId?: string,
): NotebookCommandResult {
  const changed = nextNotebook !== null;
  return {
    ok: true,
    changed,
    content: nextNotebook ? serializeNotebook(nextNotebook) : originalContent,
    lines,
    ...(options.path ? { path: options.path } : {}),
    command: request.command,
    ...(cellId ? { cellId } : {}),
  };
}

function readResult(
  content: string,
  request: NotebookCommandRequest,
  lines: string[],
  options: ExecuteNotebookRequestOptions,
  cellId?: string,
): NotebookCommandResult {
  return successfulResult(content, null, request, lines, options, cellId);
}

export function executeNotebookRequest(
  content: string,
  request: NotebookCommandRequest,
  options: ExecuteNotebookRequestOptions = {},
): NotebookCommandResult {
  let notebook: NotebookDocument;
  try {
    notebook = parseSupportedNotebook(content);
  } catch (error) {
    return executionFailure(
      content,
      commandError('invalid-notebook', `invalid notebook JSON: ${error instanceof Error ? error.message : String(error)}`),
      request,
      options.path,
    );
  }

  if (request.command === 'validate') {
    return readResult(content, request, [
      `Notebook is valid: ${options.path || '(notebook)'}`,
      `nbformat ${notebook.nbformat}.${notebook.nbformat_minor}; ${notebook.cells.length} cell${notebook.cells.length === 1 ? '' : 's'}; language ${detectNotebookLanguage(notebook) ?? 'unknown'}.`,
    ], options);
  }

  if (request.command === 'show') {
    if (request.cell === undefined) {
      return readResult(content, request, formatNotebookLines(notebook, options.path), options);
    }
    const resolved = resolveCell(notebook, request.cell);
    if ('code' in resolved) return executionFailure(content, resolved, request, options.path);
    return readResult(
      content,
      request,
      formatNotebookLines(notebook, options.path, resolved.index),
      options,
      resolved.cell.id,
    );
  }

  let nextNotebook = notebook;
  let lines: string[] = [];
  let cellId: string | undefined;

  if (request.command === 'add') {
    const position = request.index ?? notebook.cells.length + 1;
    const invalidIndex = validateDestinationIndex(position, notebook.cells.length + 1);
    if (invalidIndex) return executionFailure(content, invalidIndex, request, options.path);
    const newCell = createNotebookCell(request.cellType, request.source);
    nextNotebook = insertNotebookCell(notebook, position - 1, newCell);
    cellId = nextNotebook.cells[position - 1]?.id;
    lines = [`Added ${request.cellType} cell #${position} (id=${cellId}) to ${options.path || '(notebook)'}.`];
  } else if (request.command === 'set-language') {
    const languageNotebook = setNotebookLanguage(notebook, request.language);
    nextNotebook = JSON.stringify(languageNotebook.metadata) === JSON.stringify(notebook.metadata)
      ? notebook
      : languageNotebook;
    lines = [nextNotebook === notebook
      ? `Notebook language is already configured for ${request.language}.`
      : `Set notebook language to ${request.language} in ${options.path || '(notebook)'}.`];
  } else if (request.command === 'clear-outputs' && request.cell === undefined) {
    nextNotebook = clearNotebookCellOutputs(notebook);
    lines = [nextNotebook === notebook
      ? `No code-cell outputs needed clearing in ${options.path || '(notebook)'}.`
      : `Cleared all code-cell outputs in ${options.path || '(notebook)'}.`];
  } else {
    const selector = request.cell;
    const resolved = resolveCell(notebook, selector);
    if ('code' in resolved) return executionFailure(content, resolved, request, options.path);
    cellId = resolved.cell.id;

    switch (request.command) {
      case 'set-source':
        nextNotebook = notebookSourceToString(resolved.cell.source) === request.source
          ? notebook
          : setNotebookCellSource(notebook, cellId, request.source);
        lines = [nextNotebook === notebook
          ? `Cell #${resolved.index + 1} (id=${cellId}) already has that source.`
          : `Updated source for cell #${resolved.index + 1} (id=${cellId}) in ${options.path || '(notebook)'}.`];
        break;
      case 'delete':
        nextNotebook = deleteNotebookCell(notebook, cellId);
        lines = [`Deleted cell #${resolved.index + 1} (id=${cellId}) from ${options.path || '(notebook)'}.`];
        break;
      case 'move': {
        const invalidIndex = validateDestinationIndex(request.index, notebook.cells.length);
        if (invalidIndex) return executionFailure(content, invalidIndex, request, options.path);
        nextNotebook = moveNotebookCell(notebook, cellId, request.index - 1);
        lines = [nextNotebook === notebook
          ? `Cell id=${cellId} is already at position #${request.index}.`
          : `Moved cell id=${cellId} to position #${request.index} in ${options.path || '(notebook)'}.`];
        break;
      }
      case 'set-type':
        nextNotebook = resolved.cell.cell_type === request.cellType
          ? notebook
          : setNotebookCellType(notebook, cellId, request.cellType);
        lines = [nextNotebook === notebook
          ? `Cell #${resolved.index + 1} (id=${cellId}) is already ${request.cellType}.`
          : `Changed cell #${resolved.index + 1} (id=${cellId}) to ${request.cellType} in ${options.path || '(notebook)'}.`];
        break;
      case 'duplicate': {
        const position = request.index ?? resolved.index + 2;
        const invalidIndex = validateDestinationIndex(position, notebook.cells.length + 1);
        if (invalidIndex) return executionFailure(content, invalidIndex, request, options.path);
        nextNotebook = duplicateNotebookCell(notebook, cellId, position - 1);
        const duplicateId = nextNotebook.cells[position - 1]?.id;
        lines = [`Duplicated cell id=${cellId} at position #${position} (new id=${duplicateId}) in ${options.path || '(notebook)'}.`];
        cellId = duplicateId;
        break;
      }
      case 'clear-outputs':
        if (resolved.cell.cell_type !== 'code') {
          return executionFailure(
            content,
            commandError('invalid-cell-reference', `cell id=${cellId} is ${resolved.cell.cell_type}; only code cells have outputs`),
            request,
            options.path,
          );
        }
        nextNotebook = resolved.cell.outputs.length === 0 && resolved.cell.execution_count === null
          ? notebook
          : clearNotebookCellOutputs(notebook, cellId);
        lines = [nextNotebook === notebook
          ? `Cell #${resolved.index + 1} (id=${cellId}) has no outputs.`
          : `Cleared outputs for cell #${resolved.index + 1} (id=${cellId}) in ${options.path || '(notebook)'}.`];
        break;
    }
  }

  if (nextNotebook === notebook) {
    return readResult(content, request, lines, options, cellId);
  }
  return successfulResult(content, nextNotebook, request, lines, options, cellId);
}

export function executeNotebookCli(content: string, argv: string[]): NotebookCommandResult {
  const parsed = parseNotebookCliArgs(argv);
  if (parsed.ok === false) {
    return {
      ok: false,
      changed: false,
      content,
      lines: parsed.lines,
      error: parsed.error,
    };
  }
  return executeNotebookRequest(content, parsed.invocation.request, { path: parsed.invocation.path });
}

export function formatNotebookForAssistant(
  content: string,
  options: FormatNotebookForAssistantOptions = {},
): string {
  let notebook: NotebookDocument;
  try {
    notebook = parseSupportedNotebook(content);
  } catch {
    return [
      `<jupyter_notebook${options.path ? ` path=${JSON.stringify(options.path)}` : ''}>`,
      'Notebook could not be parsed or safely validated.',
      'Raw notebook JSON omitted. Use the notebook validate command after repairing the file.',
      '</jupyter_notebook>',
    ].join('\n');
  }

  let onlyCellIndex: number | undefined;
  if (options.cell !== undefined) {
    const resolved = resolveCell(notebook, options.cell);
    if ('code' in resolved) {
      return [
        `<jupyter_notebook${options.path ? ` path=${JSON.stringify(options.path)}` : ''}>`,
        resolved.message,
        '</jupyter_notebook>',
      ].join('\n');
    }
    onlyCellIndex = resolved.index;
  }

  return [
    `<jupyter_notebook${options.path ? ` path=${JSON.stringify(options.path)}` : ''}>`,
    ...formatNotebookLines(notebook, options.path, onlyCellIndex),
    '</jupyter_notebook>',
  ].join('\n');
}
