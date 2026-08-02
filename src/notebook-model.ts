/**
 * Browser-safe helpers for Jupyter nbformat 4 documents.
 *
 * The normalizer deliberately fixes only the structural fields CodeCraft needs to
 * edit a notebook. Unknown notebook, cell, metadata, MIME, and output properties
 * are cloned and retained so opening and saving a notebook does not erase data
 * written by another Jupyter client.
 */

export type NotebookLanguage = 'python' | 'csharp';
export type NotebookCellType = 'code' | 'markdown' | 'raw';
export type NotebookSource = string | string[];
export type NotebookMetadata = Record<string, unknown>;
export type NotebookMimeBundle = Record<string, unknown>;

export interface NotebookCellBase {
  id: string;
  cell_type: NotebookCellType;
  metadata: NotebookMetadata;
  source: NotebookSource;
  [key: string]: unknown;
}

export interface NotebookCodeCell extends NotebookCellBase {
  cell_type: 'code';
  execution_count: number | null;
  outputs: NotebookOutput[];
}

export interface NotebookMarkdownCell extends NotebookCellBase {
  cell_type: 'markdown';
  attachments?: Record<string, NotebookMimeBundle>;
}

export interface NotebookRawCell extends NotebookCellBase {
  cell_type: 'raw';
}

export type NotebookCell = NotebookCodeCell | NotebookMarkdownCell | NotebookRawCell;

export interface NotebookStreamOutput {
  output_type: 'stream';
  name: 'stdout' | 'stderr' | string;
  text: NotebookSource;
  [key: string]: unknown;
}

export interface NotebookDisplayDataOutput {
  output_type: 'display_data';
  data: NotebookMimeBundle;
  metadata: NotebookMetadata;
  transient?: NotebookMetadata;
  [key: string]: unknown;
}

export interface NotebookExecuteResultOutput {
  output_type: 'execute_result';
  execution_count: number | null;
  data: NotebookMimeBundle;
  metadata: NotebookMetadata;
  [key: string]: unknown;
}

export interface NotebookErrorOutput {
  output_type: 'error';
  ename: string;
  evalue: string;
  traceback: NotebookSource;
  [key: string]: unknown;
}

/** Retains output kinds added by extensions or future nbformat revisions. */
export interface NotebookUnknownOutput {
  output_type: string;
  [key: string]: unknown;
}

export type NotebookOutput =
  | NotebookStreamOutput
  | NotebookDisplayDataOutput
  | NotebookExecuteResultOutput
  | NotebookErrorOutput
  | NotebookUnknownOutput;

export interface NotebookDocument {
  cells: NotebookCell[];
  metadata: NotebookMetadata;
  nbformat: 4;
  nbformat_minor: number;
  [key: string]: unknown;
}

export interface NormalizeNotebookOptions {
  /** Used only when the document has no recognizable kernelspec/language_info. */
  defaultLanguage?: NotebookLanguage;
  /** nbformat 4.5 made cell ids standard. CodeCraft enables them by default. */
  ensureCellIds?: boolean;
}

export interface SerializeNotebookOptions extends NormalizeNotebookOptions {
  /** Jupyter commonly writes one-space JSON indentation. */
  indent?: number | string;
  trailingNewline?: boolean;
}

export interface NotebookParseResult {
  notebook: NotebookDocument | null;
  error: Error | null;
}

export interface CreateNotebookOptions {
  cells?: NotebookCell[];
  metadata?: NotebookMetadata;
  includeInitialCodeCell?: boolean;
  nbformatMinor?: number;
}

export interface CreateNotebookCellOptions {
  id?: string;
  metadata?: NotebookMetadata;
  outputs?: NotebookOutput[];
  executionCount?: number | null;
  extra?: Record<string, unknown>;
}

export interface SetNotebookCellSourceOptions {
  /** Keep array-backed Jupyter sources array-backed when Monaco supplies a string. */
  preserveRepresentation?: boolean;
}

const CELL_ID_PATTERN = /^[A-Za-z0-9_-]{1,64}$/;
let generatedCellIdCounter = 0;

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === 'object' && !Array.isArray(value);
}

function cloneUnknown<T>(value: T): T {
  if (Array.isArray(value)) {
    return value.map(item => cloneUnknown(item)) as T;
  }
  if (isRecord(value)) {
    return Object.fromEntries(
      Object.entries(value).map(([key, item]) => [key, cloneUnknown(item)])
    ) as T;
  }
  return value;
}

function cloneRecord(value: unknown): Record<string, unknown> {
  return isRecord(value) ? cloneUnknown(value) : {};
}

function toNonNegativeInteger(value: unknown, fallback: number): number {
  return typeof value === 'number' && Number.isInteger(value) && value >= 0
    ? value
    : fallback;
}

function toExecutionCount(value: unknown): number | null {
  return typeof value === 'number' && Number.isInteger(value) && value >= 0
    ? value
    : null;
}

function hashCellIdSeed(value: string): string {
  let hash = 0x811c9dc5;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193);
  }
  return (hash >>> 0).toString(36).padStart(7, '0');
}

function isUsableCellId(value: unknown, usedIds?: Set<string>): value is string {
  return typeof value === 'string'
    && CELL_ID_PATTERN.test(value)
    && !usedIds?.has(value);
}

/**
 * Creates a spec-compatible id. Supplying a seed makes the result deterministic;
 * omitted/duplicate ids normalized from a file therefore remain stable on reload.
 */
export function createNotebookCellId(seed?: string, usedIds: Iterable<string> = []): string {
  const occupied = usedIds instanceof Set ? usedIds : new Set(usedIds);
  const resolvedSeed = seed ?? `new-cell:${Date.now()}:${++generatedCellIdCounter}`;
  const base = `cell-${hashCellIdSeed(resolvedSeed)}`;
  if (!occupied.has(base)) return base;

  for (let suffix = 2; ; suffix += 1) {
    const candidate = `${base}-${suffix}`;
    if (!occupied.has(candidate)) return candidate;
  }
}

export function normalizeNotebookSource(value: unknown): NotebookSource {
  if (typeof value === 'string') return value;
  if (Array.isArray(value)) {
    return value.map(part => (
      typeof part === 'string' ? part : part == null ? '' : String(part)
    ));
  }
  return value == null ? '' : String(value);
}

export function notebookSourceToString(source: NotebookSource | unknown): string {
  const normalized = normalizeNotebookSource(source);
  return Array.isArray(normalized) ? normalized.join('') : normalized;
}

function splitNotebookSourceLines(value: string): string[] {
  if (!value) return [];
  return value.match(/.*?(?:\r\n|\n|\r|$)/g)?.filter(Boolean) ?? [value];
}

function notebookSourcesEqual(left: NotebookSource, right: NotebookSource): boolean {
  if (typeof left === 'string' || typeof right === 'string') return left === right;
  return left.length === right.length && left.every((part, index) => part === right[index]);
}

function normalizeMimeBundle(value: unknown): NotebookMimeBundle {
  return cloneRecord(value);
}

function normalizeOutput(value: unknown): NotebookOutput {
  const raw = cloneRecord(value);
  const outputType = typeof raw.output_type === 'string' && raw.output_type
    ? raw.output_type
    : 'unknown';

  switch (outputType) {
    case 'stream':
      return {
        ...raw,
        output_type: 'stream',
        name: typeof raw.name === 'string' && raw.name ? raw.name : 'stdout',
        text: normalizeNotebookSource(raw.text),
      };
    case 'display_data':
      return {
        ...raw,
        output_type: 'display_data',
        data: normalizeMimeBundle(raw.data),
        metadata: cloneRecord(raw.metadata),
      };
    case 'execute_result':
      return {
        ...raw,
        output_type: 'execute_result',
        execution_count: toExecutionCount(raw.execution_count),
        data: normalizeMimeBundle(raw.data),
        metadata: cloneRecord(raw.metadata),
      };
    case 'error':
      return {
        ...raw,
        output_type: 'error',
        ename: typeof raw.ename === 'string' ? raw.ename : 'Error',
        evalue: typeof raw.evalue === 'string' ? raw.evalue : '',
        traceback: normalizeNotebookSource(raw.traceback),
      };
    default:
      return { ...raw, output_type: outputType };
  }
}

function normalizeCellType(value: unknown): NotebookCellType {
  return value === 'code' || value === 'markdown' || value === 'raw' ? value : 'raw';
}

function normalizeCell(
  value: unknown,
  index: number,
  usedIds: Set<string>,
  ensureCellIds: boolean
): NotebookCell {
  const raw = cloneRecord(value);
  const cellType = normalizeCellType(raw.cell_type);
  const source = normalizeNotebookSource(raw.source);
  const requestedId = raw.id;
  const id = isUsableCellId(requestedId, usedIds)
    ? requestedId
    : createNotebookCellId(
      `normalized:${index}:${cellType}:${notebookSourceToString(source)}:${JSON.stringify(raw.metadata ?? {})}`,
      usedIds
    );
  if (ensureCellIds || isUsableCellId(requestedId)) usedIds.add(id);

  const common = {
    ...raw,
    id,
    cell_type: cellType,
    metadata: cloneRecord(raw.metadata),
    source,
  };

  if (cellType === 'code') {
    return {
      ...common,
      cell_type: 'code',
      execution_count: toExecutionCount(raw.execution_count),
      outputs: Array.isArray(raw.outputs) ? raw.outputs.map(normalizeOutput) : [],
    };
  }
  if (cellType === 'markdown') {
    return { ...common, cell_type: 'markdown' };
  }
  return { ...common, cell_type: 'raw' };
}

function notebookMetadataLanguage(metadata: Record<string, unknown>): NotebookLanguage | null {
  const languageInfo = isRecord(metadata.language_info) ? metadata.language_info : {};
  const kernelSpec = isRecord(metadata.kernelspec) ? metadata.kernelspec : {};
  const polyglot = isRecord(metadata.polyglot_notebook) ? metadata.polyglot_notebook : {};
  const candidates = [
    languageInfo.name,
    languageInfo.pygments_lexer,
    kernelSpec.language,
    kernelSpec.name,
    kernelSpec.display_name,
    polyglot.defaultKernelName,
  ];

  for (const candidate of candidates) {
    if (typeof candidate !== 'string') continue;
    const normalized = candidate.trim().toLowerCase().replace(/[\s_.-]+/g, '');
    if (
      normalized === 'python'
      || normalized === 'python3'
      || normalized === 'ipython'
      || normalized === 'ipython3'
      || normalized === 'py'
    ) {
      return 'python';
    }
    if (
      normalized === 'c#'
      || normalized === 'cs'
      || normalized === 'csharp'
      || normalized === 'netcsharp'
      || normalized === 'dotnetcsharp'
    ) {
      return 'csharp';
    }
  }
  return null;
}

export function detectNotebookLanguage(value: unknown): NotebookLanguage | null {
  if (!isRecord(value)) return null;
  const metadata = cloneRecord(value.metadata);
  const fromMetadata = notebookMetadataLanguage(metadata);
  if (fromMetadata) return fromMetadata;

  const cells = Array.isArray(value.cells) ? value.cells : [];
  for (const cell of cells) {
    if (!isRecord(cell) || cell.cell_type !== 'code') continue;
    const source = notebookSourceToString(cell.source).trimStart().toLowerCase();
    if (/^(?:%%csharp\b|#!(?:csharp|cs)\b)/.test(source)) return 'csharp';
    if (/^(?:%%python\b|#!python\b)/.test(source)) return 'python';
  }
  return null;
}

export function normalizeNotebook(
  value: unknown,
  options: NormalizeNotebookOptions = {}
): NotebookDocument {
  const raw = cloneRecord(value);
  const ensureCellIds = options.ensureCellIds !== false;
  const usedIds = new Set<string>();
  const cells = (Array.isArray(raw.cells) ? raw.cells : []).map((cell, index) => (
    normalizeCell(cell, index, usedIds, ensureCellIds)
  ));
  const notebook: NotebookDocument = {
    ...raw,
    cells,
    metadata: cloneRecord(raw.metadata),
    nbformat: 4,
    nbformat_minor: Math.max(ensureCellIds ? 5 : 0, toNonNegativeInteger(raw.nbformat_minor, 5)),
  };

  if (!detectNotebookLanguage(notebook) && options.defaultLanguage) {
    return setNotebookLanguage(notebook, options.defaultLanguage);
  }
  return notebook;
}

export function parseNotebook(
  input: string | unknown,
  options: NormalizeNotebookOptions = {}
): NotebookDocument {
  const parsed = typeof input === 'string' ? JSON.parse(input) : input;
  if (!isRecord(parsed)) {
    throw new TypeError('A Jupyter notebook must be a JSON object.');
  }
  return normalizeNotebook(parsed, options);
}

export function tryParseNotebook(
  input: string | unknown,
  options: NormalizeNotebookOptions = {}
): NotebookParseResult {
  try {
    return { notebook: parseNotebook(input, options), error: null };
  } catch (error) {
    return {
      notebook: null,
      error: error instanceof Error ? error : new Error(String(error)),
    };
  }
}

export function serializeNotebook(
  notebook: NotebookDocument,
  options: SerializeNotebookOptions = {}
): string {
  const normalized = normalizeNotebook(notebook, options);
  const serialized = JSON.stringify(normalized, null, options.indent ?? 1);
  return options.trailingNewline === false ? serialized : `${serialized}\n`;
}

function languageMetadata(language: NotebookLanguage, existing: NotebookMetadata): NotebookMetadata {
  const metadata = cloneRecord(existing);
  const existingKernelSpec = cloneRecord(metadata.kernelspec);
  const existingLanguageInfo = cloneRecord(metadata.language_info);

  if (language === 'python') {
    metadata.kernelspec = {
      ...existingKernelSpec,
      display_name: 'Python 3',
      language: 'python',
      name: 'python3',
    };
    metadata.language_info = {
      ...existingLanguageInfo,
      name: 'python',
      pygments_lexer: 'ipython3',
      codemirror_mode: { name: 'ipython', version: 3 },
    };
    if (isRecord(metadata.polyglot_notebook)) {
      metadata.polyglot_notebook = {
        ...cloneRecord(metadata.polyglot_notebook),
        defaultKernelName: 'python',
      };
    }
    return metadata;
  }

  metadata.kernelspec = {
    ...existingKernelSpec,
    display_name: '.NET (C#)',
    language: 'C#',
    name: '.net-csharp',
  };
  metadata.language_info = {
    ...existingLanguageInfo,
    name: 'C#',
    pygments_lexer: 'csharp',
    codemirror_mode: 'text/x-csharp',
  };
  metadata.polyglot_notebook = {
    ...cloneRecord(metadata.polyglot_notebook),
    defaultKernelName: 'csharp',
  };
  return metadata;
}

export function setNotebookLanguage(
  notebook: NotebookDocument,
  language: NotebookLanguage
): NotebookDocument {
  return {
    ...notebook,
    metadata: languageMetadata(language, notebook.metadata),
  };
}

export function createNotebookCell(
  cellType: NotebookCellType = 'code',
  source: NotebookSource = '',
  options: CreateNotebookCellOptions = {}
): NotebookCell {
  const id = isUsableCellId(options.id)
    ? options.id
    : createNotebookCellId(options.id ? `requested:${options.id}` : undefined);
  const common = {
    ...cloneRecord(options.extra),
    id,
    cell_type: cellType,
    metadata: cloneRecord(options.metadata),
    source: normalizeNotebookSource(source),
  };

  if (cellType === 'code') {
    return {
      ...common,
      cell_type: 'code',
      execution_count: toExecutionCount(options.executionCount),
      outputs: (options.outputs ?? []).map(normalizeOutput),
    };
  }
  if (cellType === 'markdown') return { ...common, cell_type: 'markdown' };
  return { ...common, cell_type: 'raw' };
}

export function createNotebook(
  language: NotebookLanguage,
  options: CreateNotebookOptions = {}
): NotebookDocument {
  const includeInitialCodeCell = options.includeInitialCodeCell !== false;
  const cells = options.cells
    ? options.cells.map(cell => cloneUnknown(cell))
    : includeInitialCodeCell
      ? [createNotebookCell('code')]
      : [];
  return normalizeNotebook(setNotebookLanguage({
    cells,
    metadata: cloneRecord(options.metadata),
    nbformat: 4,
    nbformat_minor: Math.max(5, toNonNegativeInteger(options.nbformatMinor, 5)),
  }, language));
}

export function createPythonNotebook(options: CreateNotebookOptions = {}): NotebookDocument {
  return createNotebook('python', options);
}

export function createCSharpNotebook(options: CreateNotebookOptions = {}): NotebookDocument {
  return createNotebook('csharp', options);
}

export function isNotebookCodeCell(cell: NotebookCell): cell is NotebookCodeCell {
  return cell.cell_type === 'code';
}

function notebookCellIndex(notebook: NotebookDocument, cellId: string): number {
  return notebook.cells.findIndex(cell => cell.id === cellId);
}

function withNotebookCell(
  notebook: NotebookDocument,
  cellId: string,
  update: (cell: NotebookCell) => NotebookCell
): NotebookDocument {
  const index = notebookCellIndex(notebook, cellId);
  if (index < 0) return notebook;
  const cells = notebook.cells.slice();
  cells[index] = update(notebook.cells[index]);
  return { ...notebook, cells };
}

export function insertNotebookCell(
  notebook: NotebookDocument,
  index: number,
  cell: NotebookCell = createNotebookCell('code')
): NotebookDocument {
  const usedIds = new Set(notebook.cells.map(candidate => candidate.id));
  const normalized = normalizeCell(cell, index, usedIds, true);
  const inserted = usedIds.has(normalized.id) && notebook.cells.some(candidate => candidate.id === normalized.id)
    ? { ...normalized, id: createNotebookCellId(undefined, usedIds) }
    : normalized;
  const targetIndex = Math.max(0, Math.min(notebook.cells.length, Math.trunc(index)));
  const cells = notebook.cells.slice();
  cells.splice(targetIndex, 0, inserted);
  return { ...notebook, cells };
}

export function deleteNotebookCell(notebook: NotebookDocument, cellId: string): NotebookDocument {
  const index = notebookCellIndex(notebook, cellId);
  if (index < 0) return notebook;
  return {
    ...notebook,
    cells: notebook.cells.filter(cell => cell.id !== cellId),
  };
}

export function duplicateNotebookCell(
  notebook: NotebookDocument,
  cellId: string,
  targetIndex?: number
): NotebookDocument {
  const index = notebookCellIndex(notebook, cellId);
  if (index < 0) return notebook;
  const usedIds = new Set(notebook.cells.map(cell => cell.id));
  const duplicate = {
    ...cloneUnknown(notebook.cells[index]),
    id: createNotebookCellId(undefined, usedIds),
  } as NotebookCell;
  return insertNotebookCell(notebook, targetIndex ?? index + 1, duplicate);
}

export function moveNotebookCell(
  notebook: NotebookDocument,
  cellId: string,
  targetIndex: number
): NotebookDocument {
  const sourceIndex = notebookCellIndex(notebook, cellId);
  if (sourceIndex < 0) return notebook;
  const cells = notebook.cells.slice();
  const [cell] = cells.splice(sourceIndex, 1);
  const resolvedTarget = Math.max(0, Math.min(cells.length, Math.trunc(targetIndex)));
  cells.splice(resolvedTarget, 0, cell);
  if (cells.every((candidate, index) => candidate === notebook.cells[index])) return notebook;
  return { ...notebook, cells };
}

export function setNotebookCellType(
  notebook: NotebookDocument,
  cellId: string,
  cellType: NotebookCellType
): NotebookDocument {
  return withNotebookCell(notebook, cellId, cell => {
    if (cell.cell_type === cellType) return cell;
    const next = cloneUnknown(cell) as Record<string, unknown>;
    next.cell_type = cellType;
    if (cellType === 'code') {
      delete next.attachments;
      next.execution_count = null;
      next.outputs = [];
      return next as unknown as NotebookCodeCell;
    }
    delete next.execution_count;
    delete next.outputs;
    return next as unknown as NotebookMarkdownCell | NotebookRawCell;
  });
}

export function setNotebookCellSource(
  notebook: NotebookDocument,
  cellId: string,
  source: NotebookSource,
  options: SetNotebookCellSourceOptions = {}
): NotebookDocument {
  return withNotebookCell(notebook, cellId, cell => {
    const normalized = normalizeNotebookSource(source);
    const nextSource = options.preserveRepresentation !== false
      && Array.isArray(cell.source)
      && typeof normalized === 'string'
        ? splitNotebookSourceLines(normalized)
        : normalized;
    if (notebookSourcesEqual(cell.source, nextSource)) return cell;
    return { ...cell, source: nextSource };
  });
}

export function setNotebookCellOutputs(
  notebook: NotebookDocument,
  cellId: string,
  outputs: NotebookOutput[],
  executionCount?: number | null
): NotebookDocument {
  return withNotebookCell(notebook, cellId, cell => (
    cell.cell_type !== 'code'
      ? cell
      : {
        ...cell,
        outputs: outputs.map(normalizeOutput),
        execution_count: executionCount === undefined
          ? cell.execution_count
          : toExecutionCount(executionCount),
      }
  ));
}

export function appendNotebookCellOutput(
  notebook: NotebookDocument,
  cellId: string,
  output: NotebookOutput
): NotebookDocument {
  return withNotebookCell(notebook, cellId, cell => (
    cell.cell_type !== 'code'
      ? cell
      : { ...cell, outputs: [...cell.outputs, normalizeOutput(output)] }
  ));
}

export function clearNotebookCellOutputs(
  notebook: NotebookDocument,
  cellId?: string
): NotebookDocument {
  if (cellId !== undefined) {
    return withNotebookCell(notebook, cellId, cell => (
      cell.cell_type !== 'code' || (cell.outputs.length === 0 && cell.execution_count === null)
        ? cell
        : { ...cell, outputs: [], execution_count: null }
    ));
  }

  let changed = false;
  const cells = notebook.cells.map(cell => {
    if (cell.cell_type !== 'code' || (cell.outputs.length === 0 && cell.execution_count === null)) return cell;
    changed = true;
    return { ...cell, outputs: [], execution_count: null };
  });
  return changed ? { ...notebook, cells } : notebook;
}

export function setNotebookCellExecutionCount(
  notebook: NotebookDocument,
  cellId: string,
  executionCount: number | null
): NotebookDocument {
  return withNotebookCell(notebook, cellId, cell => (
    cell.cell_type !== 'code'
      ? cell
      : { ...cell, execution_count: toExecutionCount(executionCount) }
  ));
}

export function createStreamOutput(
  text: NotebookSource,
  name: 'stdout' | 'stderr' | string = 'stdout',
  extra: Record<string, unknown> = {}
): NotebookStreamOutput {
  return {
    ...cloneRecord(extra),
    output_type: 'stream',
    name,
    text: normalizeNotebookSource(text),
  };
}

export function createDisplayDataOutput(
  data: NotebookMimeBundle,
  metadata: NotebookMetadata = {},
  extra: Record<string, unknown> = {}
): NotebookDisplayDataOutput {
  return {
    ...cloneRecord(extra),
    output_type: 'display_data',
    data: normalizeMimeBundle(data),
    metadata: cloneRecord(metadata),
  };
}

export function createExecuteResultOutput(
  data: NotebookMimeBundle,
  executionCount: number | null = null,
  metadata: NotebookMetadata = {},
  extra: Record<string, unknown> = {}
): NotebookExecuteResultOutput {
  return {
    ...cloneRecord(extra),
    output_type: 'execute_result',
    execution_count: toExecutionCount(executionCount),
    data: normalizeMimeBundle(data),
    metadata: cloneRecord(metadata),
  };
}

export function createErrorOutput(
  ename: string,
  evalue: string,
  traceback: NotebookSource = [],
  extra: Record<string, unknown> = {}
): NotebookErrorOutput {
  return {
    ...cloneRecord(extra),
    output_type: 'error',
    ename,
    evalue,
    traceback: normalizeNotebookSource(traceback),
  };
}
