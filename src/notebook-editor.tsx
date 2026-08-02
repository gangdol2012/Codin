import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import Editor from '@monaco-editor/react';
import * as monaco from 'monaco-editor';
import ReactMarkdown from 'react-markdown';
import {
  ArrowDown,
  ArrowUp,
  Braces,
  Check,
  ChevronDown,
  ChevronRight,
  CircleStop,
  Clipboard,
  Code2,
  Copy,
  FileJson,
  HelpCircle,
  MoreHorizontal,
  Play,
  Plus,
  RefreshCw,
  RotateCcw,
  Save,
  Scissors,
  Settings2,
  Trash2,
  X,
} from 'lucide-react';
import {
  clearNotebookCellOutputs,
  createCSharpNotebook,
  createErrorOutput,
  createNotebookCell,
  createPythonNotebook,
  deleteNotebookCell,
  detectNotebookLanguage,
  duplicateNotebookCell,
  insertNotebookCell,
  isNotebookCodeCell,
  moveNotebookCell,
  notebookSourceToString,
  parseNotebook,
  serializeNotebook,
  setNotebookCellExecutionCount,
  setNotebookCellOutputs,
  setNotebookCellSource,
  setNotebookCellType,
  setNotebookLanguage,
  tryParseNotebook,
  type NotebookCell,
  type NotebookCellType,
  type NotebookCodeCell,
  type NotebookDocument,
  type NotebookLanguage,
  type NotebookMimeBundle,
  type NotebookOutput,
} from './notebook-model';
import {
  getNotebookMagicCatalog,
  getNotebookMagicHelpText,
  planNotebookCell,
  type NotebookCaptureConfiguration,
  type NotebookCommandPlan,
  type NotebookExecutePlan,
  type NotebookExecutionPlan,
} from './notebook-magics';

export type NotebookRuntimeOutput = NotebookOutput;

export interface NotebookRuntimeExecutionRequest {
  notebookId: string;
  fileId: string;
  filePath: string;
  cellId: string;
  virtualPath: string;
  language: NotebookLanguage;
  code: string;
  source: string;
  executionCount: number;
  signal?: AbortSignal;
}

export interface NotebookRuntimeExecutionResult {
  outputs: NotebookRuntimeOutput[];
  durationMs: number;
  status?: string;
  sessionRestarted?: boolean;
}

export interface NotebookEditorController {
  runSelected: () => Promise<void>;
  runAll: () => Promise<void>;
  interrupt: () => void;
  restart: () => Promise<void>;
}

export interface NotebookEditorProps {
  fileId: string;
  filePath: string;
  content: string;
  fontSize: number;
  theme?: string;
  onChange: (content: string) => void;
  onMountEditor?: (editor: monaco.editor.IStandaloneCodeEditor) => void;
  onExecute: (request: NotebookRuntimeExecutionRequest) => Promise<NotebookRuntimeExecutionResult>;
  onRestart: (notebookId: string) => Promise<void> | void;
  onInterrupt: (notebookId: string) => void;
  onRegisterController?: (controller: NotebookEditorController | null) => void;
  onReadWorkspaceFile?: (notebookPath: string, requestedPath: string) => string | null;
  onWriteWorkspaceFile?: (
    notebookPath: string,
    requestedPath: string,
    content: string,
    append: boolean
  ) => string;
  onListWorkspaceFiles?: (notebookPath: string, requestedPath?: string) => string[];
}

type CellRunMode = 'stay' | 'advance' | 'insert';

interface NotebookHistoryEntry {
  count: number;
  source: string;
  language: NotebookLanguage;
}

interface NotebookClipboard {
  cell: NotebookCell;
  cut: boolean;
}

const EMPTY_METADATA: Record<string, unknown> = {};

function classNames(...values: Array<string | false | null | undefined>) {
  return values.filter(Boolean).join(' ');
}

function maxExecutionCount(notebook: NotebookDocument | null) {
  return notebook?.cells.reduce((highest, cell) => (
    cell.cell_type === 'code' && typeof cell.execution_count === 'number'
      ? Math.max(highest, cell.execution_count)
      : highest
  ), 0) ?? 0;
}

function notebookDefaultLanguage(notebook: NotebookDocument): NotebookLanguage {
  return detectNotebookLanguage(notebook) ?? 'python';
}

function normalizeLanguageName(value: unknown): NotebookLanguage | null {
  const normalized = String(value ?? '').trim().toLowerCase().replace(/[._\s-]+/g, '');
  if (['python', 'python3', 'ipython', 'py'].includes(normalized)) return 'python';
  if (['c#', 'cs', 'csharp', 'netcsharp', 'dotnetcsharp'].includes(normalized)) return 'csharp';
  return null;
}

function cellLanguage(cell: NotebookCell, fallback: NotebookLanguage): NotebookLanguage {
  const metadata = cell.metadata ?? EMPTY_METADATA;
  const vscode = metadata.vscode;
  const polyglot = metadata.polyglot_notebook;
  const dotnet = metadata.dotnet_interactive;
  const candidates = [
    metadata.language,
    metadata.languageId,
    metadata.kernelName,
    typeof vscode === 'object' && vscode ? (vscode as Record<string, unknown>).languageId : null,
    typeof polyglot === 'object' && polyglot ? (polyglot as Record<string, unknown>).kernelName : null,
    typeof dotnet === 'object' && dotnet ? (dotnet as Record<string, unknown>).language : null,
  ];
  for (const candidate of candidates) {
    const resolved = normalizeLanguageName(candidate);
    if (resolved) return resolved;
  }

  const source = notebookSourceToString(cell.source).trimStart();
  if (/^(?:%%csharp\b|#!(?:csharp|cs)\b)/i.test(source)) return 'csharp';
  if (/^(?:%%python\b|#!python\b)/i.test(source)) return 'python';
  return fallback;
}

function withCellLanguage(
  notebook: NotebookDocument,
  cellId: string,
  language: NotebookLanguage
): NotebookDocument {
  return {
    ...notebook,
    cells: notebook.cells.map(cell => cell.id === cellId ? {
      ...cell,
      metadata: {
        ...(cell.metadata ?? {}),
        vscode: {
          ...(typeof cell.metadata?.vscode === 'object' && cell.metadata.vscode
            ? cell.metadata.vscode as Record<string, unknown>
            : {}),
          languageId: language === 'csharp' ? 'csharp' : 'python',
        },
      },
    } : cell),
  };
}

function sourceExtension(language: NotebookLanguage) {
  return language === 'csharp' ? 'csx' : 'py';
}

function normalizePath(value: string) {
  const resolved: string[] = [];
  for (const raw of value.replace(/\\/g, '/').split('/')) {
    const part = raw.trim();
    if (!part || part === '.') continue;
    if (part === '..') resolved.pop();
    else resolved.push(part);
  }
  return resolved.join('/');
}

function notebookDirectory(path: string) {
  const normalized = normalizePath(path);
  const slash = normalized.lastIndexOf('/');
  return slash >= 0 ? normalized.slice(0, slash) : '';
}

function notebookStem(path: string) {
  const filename = normalizePath(path).split('/').pop() || 'notebook.ipynb';
  return filename.replace(/\.ipynb$/i, '') || 'notebook';
}

function getCellVirtualProjectPath(
  notebookPath: string,
  cellId: string,
  language: NotebookLanguage
) {
  const directory = notebookDirectory(notebookPath);
  return normalizePath([
    directory,
    '.codecraft-notebook',
    notebookStem(notebookPath),
    `${cellId}.${sourceExtension(language)}`,
  ].filter(Boolean).join('/'));
}

function getCellMonacoPath(projectPath: string) {
  const encoded = normalizePath(projectPath)
    .split('/')
    .map(part => encodeURIComponent(part))
    .join('/');
  return `file:///codecraft-project/${encoded}`;
}

function outputText(value: unknown) {
  if (Array.isArray(value)) return value.map(part => String(part)).join('');
  return String(value ?? '');
}

function plainOutput(text: string, executionCount: number | null = null): NotebookOutput {
  return {
    output_type: 'execute_result',
    data: { 'text/plain': text },
    metadata: {},
    execution_count: executionCount,
  };
}

function streamOutput(text: string, name: 'stdout' | 'stderr' = 'stdout'): NotebookOutput {
  return { output_type: 'stream', name, text };
}

function errorOutput(name: string, message: string): NotebookOutput {
  return createErrorOutput(name, message, [`${name}: ${message}`]);
}

function errorMessage(error: unknown) {
  return error instanceof Error ? error.message : String(error);
}

function cloneCell(cell: NotebookCell): NotebookCell {
  return JSON.parse(JSON.stringify(cell)) as NotebookCell;
}

function attachmentUrl(cell: NotebookCell, url: string) {
  if (!url.startsWith('attachment:')) return url;
  const name = url.slice('attachment:'.length);
  const attachments = cell.attachments;
  if (!attachments || typeof attachments !== 'object' || Array.isArray(attachments)) return url;
  const bundle = (attachments as Record<string, unknown>)[name];
  if (!bundle || typeof bundle !== 'object' || Array.isArray(bundle)) return url;
  const mime = Object.keys(bundle as Record<string, unknown>).find(key => key.startsWith('image/'));
  if (!mime) return url;
  const value = (bundle as Record<string, unknown>)[mime];
  const encoded = outputText(value).replace(/\s+/g, '');
  return `data:${mime};base64,${encoded}`;
}

function sanitizeInlineSvg(value: string) {
  return value
    .replace(/<script\b[\s\S]*?<\/script\s*>/gi, '')
    .replace(/<foreignObject\b[\s\S]*?<\/foreignObject\s*>/gi, '')
    .replace(/\son[a-z]+\s*=\s*(?:"[^"]*"|'[^']*'|[^\s>]+)/gi, '')
    .replace(/(?:javascript|data:text\/html)\s*:/gi, '');
}

function safeHtmlDocument(value: string) {
  return `<!doctype html><html><head><meta charset="utf-8"><style>
body{margin:0;padding:10px;color:#d4d4d8;background:transparent;font:13px/1.5 system-ui,sans-serif}
pre,code{font-family:"JetBrains Mono",monospace}a{color:#818cf8}img{max-width:100%}
</style></head><body>${sanitizeInlineSvg(value)}</body></html>`;
}

function stringifyMimeValue(value: unknown) {
  if (typeof value === 'string') return value;
  try { return JSON.stringify(value, null, 2); } catch { return String(value); }
}

function preferredMime(data: NotebookMimeBundle) {
  const priority = [
    'application/vnd.vegalite.v5+json',
    'application/vnd.vega.v5+json',
    'text/html',
    'image/svg+xml',
    'image/png',
    'image/jpeg',
    'image/gif',
    'text/markdown',
    'text/latex',
    'application/json',
    'application/javascript',
    'text/plain',
  ];
  return priority.find(type => Object.prototype.hasOwnProperty.call(data, type))
    ?? Object.keys(data)[0]
    ?? 'text/plain';
}

function JavascriptOutput({ code }: { code: string }) {
  const [running, setRunning] = useState(false);
  if (!running) {
    return (
      <div className="space-y-2 rounded border border-amber-500/20 bg-amber-500/5 p-3">
        <div className="text-xs text-amber-300">Saved JavaScript output is never executed automatically.</div>
        <pre className="max-h-52 overflow-auto whitespace-pre-wrap text-xs text-zinc-400">{code}</pre>
        <button
          type="button"
          onClick={() => setRunning(true)}
          className="rounded bg-amber-500/15 px-2 py-1 text-xs text-amber-200 hover:bg-amber-500/25"
        >
          Run in isolated sandbox
        </button>
      </div>
    );
  }
  return (
    <iframe
      title="Sandboxed JavaScript cell output"
      sandbox="allow-scripts"
      srcDoc={`<!doctype html><script>${code.replace(/<\/script/gi, '<\\/script')}</script>`}
      className="h-40 w-full rounded border border-white/10 bg-white"
    />
  );
}

function MimeRenderer({ data }: { data: NotebookMimeBundle }) {
  const mime = preferredMime(data);
  const raw = data[mime];
  const text = stringifyMimeValue(raw);

  if (mime === 'text/html') {
    return (
      <iframe
        title="Notebook HTML output"
        sandbox=""
        srcDoc={safeHtmlDocument(text)}
        className="min-h-28 w-full rounded border border-white/10 bg-transparent"
      />
    );
  }
  if (mime === 'image/svg+xml') {
    const encoded = btoa(unescape(encodeURIComponent(sanitizeInlineSvg(text))));
    return <img alt="Notebook SVG output" src={`data:image/svg+xml;base64,${encoded}`} className="max-w-full" />;
  }
  if (mime === 'image/png' || mime === 'image/jpeg' || mime === 'image/gif') {
    return <img alt="Notebook rich output" src={`data:${mime};base64,${text.replace(/\s+/g, '')}`} className="max-w-full" />;
  }
  if (mime === 'text/markdown') {
    return <div className="prose prose-invert prose-sm max-w-none"><ReactMarkdown>{text}</ReactMarkdown></div>;
  }
  if (mime === 'application/javascript') return <JavascriptOutput code={text} />;
  if (mime === 'application/json' || mime.includes('+json')) {
    return <pre className="overflow-auto whitespace-pre-wrap text-xs text-zinc-300">{text}</pre>;
  }
  if (mime === 'text/latex') {
    return <pre className="overflow-auto whitespace-pre-wrap font-serif text-sm text-zinc-200">{text}</pre>;
  }
  return <pre className="overflow-auto whitespace-pre-wrap text-xs leading-5 text-zinc-300">{text}</pre>;
}

function NotebookOutputView({ output }: { output: NotebookOutput }) {
  if (output.output_type === 'stream') {
    return (
      <pre className={classNames(
        'overflow-auto whitespace-pre-wrap text-xs leading-5',
        output.name === 'stderr' ? 'text-rose-300' : 'text-zinc-300'
      )}>
        {outputText(output.text)}
      </pre>
    );
  }
  if (output.output_type === 'error') {
    const error = output as unknown as { ename?: unknown; evalue?: unknown; traceback?: unknown };
    const traceback = Array.isArray(error.traceback) ? error.traceback.map(value => String(value)) : [];
    return (
      <div className="rounded border border-rose-500/20 bg-rose-500/5 p-2 text-xs text-rose-200">
        <div className="mb-1 font-semibold">{String(error.ename ?? 'Error')}: {String(error.evalue ?? '')}</div>
        <pre className="max-h-72 overflow-auto whitespace-pre-wrap leading-5 text-rose-300/80">
          {traceback.join('\n')}
        </pre>
      </div>
    );
  }
  if (output.output_type === 'display_data' || output.output_type === 'execute_result') {
    const data = (output as unknown as { data?: NotebookMimeBundle }).data ?? {};
    return <MimeRenderer data={data} />;
  }
  return (
    <pre className="overflow-auto whitespace-pre-wrap text-xs text-zinc-400">
      {stringifyMimeValue(output)}
    </pre>
  );
}

function CellOutputs({ outputs }: { outputs: NotebookOutput[] }) {
  if (!outputs.length) return null;
  return (
    <div className="space-y-2 border-t border-white/5 bg-black/15 px-4 py-3">
      {outputs.map((output, index) => <NotebookOutputView key={index} output={output} />)}
    </div>
  );
}

function ModalShell({
  title,
  children,
  onClose,
}: {
  title: string;
  children: React.ReactNode;
  onClose: () => void;
}) {
  return (
    <div className="absolute inset-0 z-50 flex items-center justify-center bg-black/70 p-6 backdrop-blur-sm">
      <div className="flex max-h-[85%] w-full max-w-3xl flex-col overflow-hidden rounded-2xl border border-white/10 bg-zinc-900 shadow-2xl">
        <div className="flex h-11 shrink-0 items-center justify-between border-b border-white/10 px-4">
          <div className="text-sm font-semibold text-white">{title}</div>
          <button type="button" onClick={onClose} className="rounded p-1 text-zinc-500 hover:bg-white/10 hover:text-white">
            <X size={16} />
          </button>
        </div>
        <div className="min-h-0 flex-1 overflow-auto p-4 custom-scrollbar">{children}</div>
      </div>
    </div>
  );
}

function MagicHelp({ language, onClose }: { language: NotebookLanguage; onClose: () => void }) {
  const [query, setQuery] = useState('');
  const entries = useMemo(() => getNotebookMagicCatalog(language).filter(entry => {
    const needle = query.trim().toLowerCase();
    return !needle || entry.forms.some(form => form.toLowerCase().includes(needle))
      || entry.description.toLowerCase().includes(needle)
      || entry.category.includes(needle);
  }), [language, query]);

  return (
    <ModalShell title="Notebook magic commands" onClose={onClose}>
      <div className="space-y-4">
        <div className="rounded-xl border border-indigo-500/20 bg-indigo-500/5 p-3 text-xs leading-5 text-indigo-100/80">
          Magics are translated to CodeCraft's local Python and C# script runtimes. Host-shell/process magics are recognized and return an explicit unsupported result instead of being passed to a language runtime.
        </div>
        <input
          value={query}
          onChange={event => setQuery(event.target.value)}
          placeholder="Filter magics…"
          className="w-full rounded-xl border border-white/10 bg-black/30 px-3 py-2 text-sm text-white outline-none focus:border-indigo-500"
        />
        <div className="space-y-2">
          {entries.map(entry => (
            <div key={entry.id} className="rounded-xl border border-white/10 bg-white/[0.03] p-3">
              <div className="flex flex-wrap items-center gap-2">
                {entry.forms.map(form => (
                  <code key={form} className="rounded bg-black/40 px-1.5 py-0.5 text-xs text-indigo-300">{form}</code>
                ))}
                <span className={classNames(
                  'ml-auto rounded px-1.5 py-0.5 text-[10px] uppercase tracking-wide',
                  entry.support === 'supported' && 'bg-emerald-500/10 text-emerald-300',
                  entry.support === 'compatibility' && 'bg-amber-500/10 text-amber-300',
                  entry.support === 'unsupported' && 'bg-rose-500/10 text-rose-300'
                )}>{entry.support}</span>
              </div>
              <div className="mt-2 text-xs leading-5 text-zinc-400">{entry.description}</div>
            </div>
          ))}
        </div>
        <details className="rounded-xl border border-white/10 bg-black/20 p-3">
          <summary className="cursor-pointer text-xs font-medium text-zinc-300">Plain-text quick reference</summary>
          <pre className="mt-3 whitespace-pre-wrap text-[11px] leading-5 text-zinc-500">{getNotebookMagicHelpText(language)}</pre>
        </details>
      </div>
    </ModalShell>
  );
}

function MetadataEditor({
  title,
  metadata,
  onApply,
  onClose,
}: {
  title: string;
  metadata: Record<string, unknown>;
  onApply: (metadata: Record<string, unknown>) => void;
  onClose: () => void;
}) {
  const [value, setValue] = useState(() => JSON.stringify(metadata, null, 2));
  const [error, setError] = useState('');
  const apply = () => {
    try {
      const parsed = JSON.parse(value);
      if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
        throw new Error('Metadata must be a JSON object.');
      }
      onApply(parsed as Record<string, unknown>);
      onClose();
    } catch (caught) {
      setError(errorMessage(caught));
    }
  };

  return (
    <ModalShell title={title} onClose={onClose}>
      <div className="space-y-3">
        <div className="h-[420px] overflow-hidden rounded-xl border border-white/10">
          <Editor
            height="100%"
            language="json"
            value={value}
            onChange={next => setValue(next ?? '')}
            theme="vs-dark"
            options={{
              automaticLayout: true,
              minimap: { enabled: false },
              fontSize: 13,
              scrollBeyondLastLine: false,
              wordWrap: 'on',
            }}
          />
        </div>
        {error ? <div className="text-xs text-rose-300">{error}</div> : null}
        <div className="flex justify-end gap-2">
          <button type="button" onClick={onClose} className="rounded-lg px-3 py-1.5 text-xs text-zinc-400 hover:bg-white/5">Cancel</button>
          <button type="button" onClick={apply} className="flex items-center gap-1.5 rounded-lg bg-indigo-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-indigo-500">
            <Check size={13} /> Apply metadata
          </button>
        </div>
      </div>
    </ModalShell>
  );
}

function InvalidNotebookView({
  content,
  error,
  fontSize,
  theme,
  onRepair,
  onCreate,
}: {
  content: string;
  error: string;
  fontSize: number;
  theme: string;
  onRepair: (value: string) => void;
  onCreate: (language: NotebookLanguage) => void;
}) {
  const [draft, setDraft] = useState(content);
  useEffect(() => setDraft(content), [content]);

  return (
    <div className="flex h-full min-h-0 flex-col bg-[rgb(28,28,28)]">
      <div className="border-b border-rose-500/20 bg-rose-500/5 px-4 py-3">
        <div className="flex items-center gap-2 text-sm font-medium text-rose-200"><FileJson size={16} /> This notebook needs repair</div>
        <div className="mt-1 text-xs text-rose-300/70">{error}</div>
      </div>
      <div className="flex items-center gap-2 border-b border-white/10 px-3 py-2">
        <button type="button" onClick={() => onRepair(draft)} className="flex items-center gap-1.5 rounded-lg bg-indigo-600 px-3 py-1.5 text-xs text-white hover:bg-indigo-500">
          <Save size={13} /> Parse repaired JSON
        </button>
        <span className="text-xs text-zinc-600">or replace it with</span>
        <button type="button" onClick={() => onCreate('python')} className="rounded-lg bg-white/5 px-3 py-1.5 text-xs text-zinc-300 hover:bg-white/10">New Python notebook</button>
        <button type="button" onClick={() => onCreate('csharp')} className="rounded-lg bg-white/5 px-3 py-1.5 text-xs text-zinc-300 hover:bg-white/10">New C# notebook</button>
      </div>
      <div className="min-h-0 flex-1">
        <Editor
          height="100%"
          language="json"
          value={draft}
          onChange={next => setDraft(next ?? '')}
          theme={theme}
          options={{
            automaticLayout: true,
            fontSize,
            minimap: { enabled: false },
            scrollBeyondLastLine: false,
            wordWrap: 'on',
            formatOnPaste: true,
          }}
        />
      </div>
    </div>
  );
}

interface NotebookCellViewProps {
  cell: NotebookCell;
  index: number;
  selected: boolean;
  running: boolean;
  language: NotebookLanguage;
  notebookPath: string;
  fontSize: number;
  theme: string;
  collapsedSource: boolean;
  collapsedOutput: boolean;
  markdownPreview: boolean;
  onSelect: () => void;
  onSourceChange: (source: string) => void;
  onRun: (mode: CellRunMode) => void;
  onMount: (cellId: string, editor: monaco.editor.IStandaloneCodeEditor) => void;
  onTypeChange: (type: NotebookCellType) => void;
  onLanguageChange: (language: NotebookLanguage) => void;
  onMove: (offset: -1 | 1) => void;
  onDuplicate: () => void;
  onDelete: () => void;
  onCopy: () => void;
  onCut: () => void;
  onAddBelow: () => void;
  onSplit: () => void;
  onMergeAbove: () => void;
  onToggleSource: () => void;
  onToggleOutput: () => void;
  onToggleMarkdownPreview: () => void;
  onEditMetadata: () => void;
}

function NotebookCellView({
  cell,
  index,
  selected,
  running,
  language,
  notebookPath,
  fontSize,
  theme,
  collapsedSource,
  collapsedOutput,
  markdownPreview,
  onSelect,
  onSourceChange,
  onRun,
  onMount,
  onTypeChange,
  onLanguageChange,
  onMove,
  onDuplicate,
  onDelete,
  onCopy,
  onCut,
  onAddBelow,
  onSplit,
  onMergeAbove,
  onToggleSource,
  onToggleOutput,
  onToggleMarkdownPreview,
  onEditMetadata,
}: NotebookCellViewProps) {
  const source = notebookSourceToString(cell.source);
  const isCode = cell.cell_type === 'code';
  const outputs = isCode ? cell.outputs ?? [] : [];
  const virtualProjectPath = getCellVirtualProjectPath(notebookPath, cell.id, language);
  const modelPath = getCellMonacoPath(virtualProjectPath);
  const editorLanguage = cell.cell_type === 'markdown'
    ? 'markdown'
    : cell.cell_type === 'raw'
      ? 'plaintext'
      : language === 'csharp' ? 'csharp' : 'python';
  const lineCount = Math.max(1, source.split(/\r?\n/).length);
  const editorHeight = Math.min(520, Math.max(86, lineCount * Math.max(19, fontSize + 7) + 28));

  return (
    <section
      data-notebook-cell-id={cell.id}
      onMouseDown={onSelect}
      className={classNames(
        'group/cell relative rounded-xl border bg-[rgb(31,31,31)] shadow-sm transition-colors',
        selected ? 'border-indigo-500/60 ring-1 ring-indigo-500/20' : 'border-white/10 hover:border-white/20'
      )}
    >
      <div className="flex min-h-9 items-center gap-1 border-b border-white/5 px-2 text-[11px] text-zinc-500">
        <button
          type="button"
          title="Run cell (Ctrl/Cmd+Enter)"
          onClick={event => { event.stopPropagation(); onRun('stay'); }}
          disabled={running || !isCode}
          className="rounded p-1 text-zinc-400 hover:bg-white/10 hover:text-white disabled:opacity-30"
        >
          {running ? <CircleStop size={14} className="animate-pulse text-amber-300" /> : <Play size={14} />}
        </button>
        <span className={classNames('w-11 text-right font-mono', running && 'text-amber-300')}>
          {isCode ? `[${running ? '*' : cell.execution_count ?? ' '}]` : `${index + 1}`}
        </span>
        <select
          value={cell.cell_type}
          onChange={event => onTypeChange(event.target.value as NotebookCellType)}
          onMouseDown={event => event.stopPropagation()}
          className="rounded border border-transparent bg-transparent px-1 py-0.5 text-[11px] text-zinc-400 outline-none hover:border-white/10 hover:bg-white/5"
        >
          <option value="code">Code</option>
          <option value="markdown">Markdown</option>
          <option value="raw">Raw</option>
        </select>
        {isCode ? (
          <select
            value={language}
            onChange={event => onLanguageChange(event.target.value as NotebookLanguage)}
            onMouseDown={event => event.stopPropagation()}
            className="rounded border border-transparent bg-transparent px-1 py-0.5 text-[11px] text-zinc-500 outline-none hover:border-white/10 hover:bg-white/5"
          >
            <option value="python">Python</option>
            <option value="csharp">C# Script</option>
          </select>
        ) : null}
        <div className="flex-1" />
        {cell.cell_type === 'markdown' ? (
          <button type="button" onClick={event => { event.stopPropagation(); onToggleMarkdownPreview(); }} className="rounded px-1.5 py-1 hover:bg-white/10 hover:text-white">
            {markdownPreview ? 'Edit' : 'Preview'}
          </button>
        ) : null}
        <button type="button" title={collapsedSource ? 'Expand source' : 'Collapse source'} onClick={event => { event.stopPropagation(); onToggleSource(); }} className="rounded p-1 hover:bg-white/10 hover:text-white">
          {collapsedSource ? <ChevronRight size={13} /> : <ChevronDown size={13} />}
        </button>
        <button type="button" title="Move up" onClick={event => { event.stopPropagation(); onMove(-1); }} className="rounded p-1 opacity-0 hover:bg-white/10 hover:text-white group-hover/cell:opacity-100"><ArrowUp size={13} /></button>
        <button type="button" title="Move down" onClick={event => { event.stopPropagation(); onMove(1); }} className="rounded p-1 opacity-0 hover:bg-white/10 hover:text-white group-hover/cell:opacity-100"><ArrowDown size={13} /></button>
        <button type="button" title="Duplicate cell" onClick={event => { event.stopPropagation(); onDuplicate(); }} className="rounded p-1 opacity-0 hover:bg-white/10 hover:text-white group-hover/cell:opacity-100"><Copy size={13} /></button>
        <button type="button" title="Delete cell" onClick={event => { event.stopPropagation(); onDelete(); }} className="rounded p-1 opacity-0 hover:bg-rose-500/10 hover:text-rose-300 group-hover/cell:opacity-100"><Trash2 size={13} /></button>
        <details className="relative" onClick={event => event.stopPropagation()}>
          <summary className="list-none rounded p-1 opacity-0 hover:bg-white/10 hover:text-white group-hover/cell:opacity-100"><MoreHorizontal size={14} /></summary>
          <div className="absolute right-0 top-7 z-20 w-44 rounded-lg border border-white/10 bg-zinc-900 p-1 text-xs shadow-xl">
            <button type="button" onClick={onCopy} className="flex w-full items-center gap-2 rounded px-2 py-1.5 text-left hover:bg-white/5"><Copy size={12} /> Copy cell</button>
            <button type="button" onClick={onCut} className="flex w-full items-center gap-2 rounded px-2 py-1.5 text-left hover:bg-white/5"><Scissors size={12} /> Cut cell</button>
            <button type="button" onClick={onSplit} className="w-full rounded px-2 py-1.5 text-left hover:bg-white/5">Split at cursor</button>
            <button type="button" onClick={onMergeAbove} className="w-full rounded px-2 py-1.5 text-left hover:bg-white/5">Merge with cell above</button>
            <button type="button" onClick={onEditMetadata} className="flex w-full items-center gap-2 rounded px-2 py-1.5 text-left hover:bg-white/5"><Braces size={12} /> Edit metadata</button>
          </div>
        </details>
      </div>

      {!collapsedSource ? (
        cell.cell_type === 'markdown' && markdownPreview ? (
          <div className="prose prose-invert prose-sm max-w-none px-6 py-4 text-zinc-300" onDoubleClick={onToggleMarkdownPreview}>
            {source.trim() ? (
              <ReactMarkdown urlTransform={url => attachmentUrl(cell, url)}>{source}</ReactMarkdown>
            ) : <span className="text-sm italic text-zinc-600">Empty Markdown cell — double-click to edit.</span>}
          </div>
        ) : (
          <div style={{ height: editorHeight }} className="overflow-hidden">
            <Editor
              key={`${cell.id}:${editorLanguage}`}
              path={modelPath}
              defaultPath={modelPath}
              height="100%"
              language={editorLanguage}
              defaultLanguage={editorLanguage}
              value={source}
              theme={theme}
              onMount={editor => onMount(cell.id, editor)}
              onChange={next => onSourceChange(next ?? '')}
              options={{
                automaticLayout: true,
                fontSize,
                fontFamily: '"JetBrains Mono", "Fira Code", monospace',
                minimap: { enabled: false },
                lineNumbers: 'on',
                lineNumbersMinChars: 3,
                folding: true,
                glyphMargin: false,
                scrollBeyondLastLine: false,
                scrollbar: { alwaysConsumeMouseWheel: false },
                overviewRulerLanes: 0,
                renderLineHighlight: 'line',
                wordWrap: cell.cell_type === 'code' ? 'off' : 'on',
                padding: { top: 8, bottom: 8 },
                fixedOverflowWidgets: true,
                suggest: { preview: true },
                'semanticHighlighting.enabled': true,
              } as monaco.editor.IStandaloneEditorConstructionOptions}
            />
          </div>
        )
      ) : (
        <button type="button" onClick={onToggleSource} className="block w-full px-4 py-2 text-left text-xs italic text-zinc-600 hover:text-zinc-400">
          {source.split(/\r?\n/)[0] || 'Empty source'}{source.includes('\n') ? ' …' : ''}
        </button>
      )}

      {isCode && outputs.length > 0 ? (
        <div>
          <button type="button" onClick={event => { event.stopPropagation(); onToggleOutput(); }} className="flex w-full items-center gap-1 border-t border-white/5 px-3 py-1 text-[10px] text-zinc-600 hover:text-zinc-400">
            {collapsedOutput ? <ChevronRight size={11} /> : <ChevronDown size={11} />}
            {outputs.length} output{outputs.length === 1 ? '' : 's'}
          </button>
          {!collapsedOutput ? <CellOutputs outputs={outputs} /> : null}
        </div>
      ) : null}

      {selected ? (
        <button
          type="button"
          title="Insert code cell below"
          onClick={event => { event.stopPropagation(); onAddBelow(); }}
          className="absolute -bottom-3 left-1/2 z-10 flex h-6 -translate-x-1/2 items-center gap-1 rounded-full border border-indigo-500/30 bg-zinc-900 px-2 text-[10px] text-indigo-300 opacity-0 shadow group-hover/cell:opacity-100 hover:bg-indigo-500/10"
        >
          <Plus size={11} /> Code
        </button>
      ) : null}
    </section>
  );
}

function applyCapture(
  outputs: NotebookOutput[],
  capture: NotebookCaptureConfiguration | null
) {
  if (!capture) return { visible: outputs, captured: outputs };
  const captured: NotebookOutput[] = [];
  const visible: NotebookOutput[] = [];
  for (const output of outputs) {
    const shouldCapture = output.output_type === 'stream'
      ? output.name === 'stderr' ? capture.captureStderr : capture.captureStdout
      : output.output_type === 'display_data' || output.output_type === 'execute_result'
        ? capture.captureDisplay
        : false;
    (shouldCapture ? captured : visible).push(output);
  }
  return { visible, captured };
}

function capturedValue(outputs: NotebookOutput[]) {
  const stdout = outputs
    .filter(output => output.output_type === 'stream' && output.name !== 'stderr')
    .map(output => outputText((output as { text: unknown }).text))
    .join('');
  const stderr = outputs
    .filter(output => output.output_type === 'stream' && output.name === 'stderr')
    .map(output => outputText((output as { text: unknown }).text))
    .join('');
  const display = outputs
    .filter(output => output.output_type === 'display_data' || output.output_type === 'execute_result')
    .map(output => (output as { data: NotebookMimeBundle }).data);
  return { stdout, stderr, display };
}

export function NotebookEditor({
  fileId,
  filePath,
  content,
  fontSize,
  theme = 'vs-dark',
  onChange,
  onMountEditor,
  onExecute,
  onRestart,
  onInterrupt,
  onRegisterController,
  onReadWorkspaceFile,
  onWriteWorkspaceFile,
  onListWorkspaceFiles,
}: NotebookEditorProps) {
  const initialParse = useMemo(() => {
    if (!content.trim()) return { notebook: null, error: new Error('The notebook document is empty.') };
    return tryParseNotebook(content, { defaultLanguage: 'python' });
  // Initial state only; external changes are handled below.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const [notebook, setNotebook] = useState<NotebookDocument | null>(initialParse.notebook);
  const [parseError, setParseError] = useState(initialParse.error?.message ?? '');
  const [selectedCellId, setSelectedCellId] = useState<string | null>(initialParse.notebook?.cells[0]?.id ?? null);
  const [runningCellId, setRunningCellId] = useState<string | null>(null);
  const [status, setStatus] = useState('Local script context ready');
  const [showMagicHelp, setShowMagicHelp] = useState(false);
  const [metadataTarget, setMetadataTarget] = useState<'notebook' | string | null>(null);
  const [collapsedSources, setCollapsedSources] = useState<Set<string>>(new Set());
  const [collapsedOutputs, setCollapsedOutputs] = useState<Set<string>>(new Set());
  const [markdownPreviews, setMarkdownPreviews] = useState<Set<string>>(() => new Set(
    initialParse.notebook?.cells.filter(cell => cell.cell_type === 'markdown').map(cell => cell.id) ?? []
  ));
  const [commandMode, setCommandMode] = useState(true);
  const rootRef = useRef<HTMLDivElement>(null);
  const notebookRef = useRef<NotebookDocument | null>(initialParse.notebook);
  const lastEmittedContentRef = useRef(content);
  const nextExecutionCountRef = useRef(maxExecutionCount(initialParse.notebook) + 1);
  const editorByCellRef = useRef<Map<string, monaco.editor.IStandaloneCodeEditor>>(new Map());
  const abortControllerRef = useRef<AbortController | null>(null);
  const queueTailRef = useRef<Promise<void>>(Promise.resolve());
  const runGenerationRef = useRef(0);
  const historyRef = useRef<NotebookHistoryEntry[]>([]);
  const clipboardRef = useRef<NotebookClipboard | null>(null);
  const lastDeleteKeyRef = useRef(0);

  const emitNotebook = useCallback((next: NotebookDocument) => {
    notebookRef.current = next;
    setNotebook(next);
    const serialized = serializeNotebook(next);
    lastEmittedContentRef.current = serialized;
    onChange(serialized);
  }, [onChange]);

  const updateNotebook = useCallback((update: (current: NotebookDocument) => NotebookDocument) => {
    const current = notebookRef.current;
    if (!current) return null;
    const next = update(current);
    if (next !== current) emitNotebook(next);
    return next;
  }, [emitNotebook]);

  useEffect(() => {
    if (content === lastEmittedContentRef.current) return;
    lastEmittedContentRef.current = content;
    if (!content.trim()) {
      notebookRef.current = null;
      setNotebook(null);
      setParseError('The notebook document is empty.');
      return;
    }
    const parsed = tryParseNotebook(content, { defaultLanguage: 'python' });
    if (!parsed.notebook) {
      notebookRef.current = null;
      setNotebook(null);
      setParseError(parsed.error?.message ?? 'Invalid notebook JSON.');
      return;
    }
    notebookRef.current = parsed.notebook;
    setNotebook(parsed.notebook);
    setParseError('');
    nextExecutionCountRef.current = Math.max(
      nextExecutionCountRef.current,
      maxExecutionCount(parsed.notebook) + 1
    );
    setSelectedCellId(current => (
      current && parsed.notebook?.cells.some(cell => cell.id === current)
        ? current
        : parsed.notebook?.cells[0]?.id ?? null
    ));
  }, [content]);

  useEffect(() => {
    if (!notebook) return;
    if (selectedCellId && notebook.cells.some(cell => cell.id === selectedCellId)) return;
    setSelectedCellId(notebook.cells[0]?.id ?? null);
  }, [notebook, selectedCellId]);

  const replaceWithNotebook = useCallback((next: NotebookDocument) => {
    setParseError('');
    nextExecutionCountRef.current = maxExecutionCount(next) + 1;
    setSelectedCellId(next.cells[0]?.id ?? null);
    emitNotebook(next);
  }, [emitNotebook]);

  const repairNotebook = useCallback((value: string) => {
    try {
      replaceWithNotebook(parseNotebook(value, { defaultLanguage: 'python' }));
    } catch (error) {
      setParseError(errorMessage(error));
    }
  }, [replaceWithNotebook]);

  const createNotebookDocument = useCallback((language: NotebookLanguage) => {
    replaceWithNotebook(language === 'csharp' ? createCSharpNotebook() : createPythonNotebook());
  }, [replaceWithNotebook]);

  const defaultLanguage = notebook ? notebookDefaultLanguage(notebook) : 'python';

  const runRuntime = useCallback(async (
    cell: NotebookCodeCell,
    language: NotebookLanguage,
    code: string,
    originalSource: string,
    executionCount: number,
    signal: AbortSignal
  ) => {
    const virtualPath = getCellVirtualProjectPath(filePath, cell.id, language);
    return onExecute({
      notebookId: fileId,
      fileId,
      filePath,
      cellId: cell.id,
      virtualPath,
      language,
      code,
      source: originalSource,
      executionCount,
      signal,
    });
  }, [fileId, filePath, onExecute]);

  const executeCodePlan = useCallback(async (
    cell: NotebookCodeCell,
    plan: NotebookExecutePlan,
    executionCount: number,
    signal: AbortSignal
  ): Promise<NotebookOutput[]> => {
    const timing = plan.timing;
    let outputs: NotebookOutput[] = [];
    if (timing?.mode === 'timeit') {
      const number = Math.max(1, Math.min(100, timing.number ?? 1));
      const repeat = Math.max(1, Math.min(10, timing.repeat ?? 3));
      const samples: number[] = [];
      let lastResult: NotebookRuntimeExecutionResult | null = null;
      for (let repetition = 0; repetition < repeat; repetition += 1) {
        let elapsed = 0;
        for (let iteration = 0; iteration < number; iteration += 1) {
          if (signal.aborted) throw new DOMException('Notebook execution was interrupted.', 'AbortError');
          lastResult = await runRuntime(
            cell,
            plan.language,
            plan.code,
            plan.originalSource,
            executionCount,
            signal
          );
          elapsed += lastResult.durationMs;
          const error = lastResult.outputs.find(output => output.output_type === 'error');
          if (error) return lastResult.outputs;
        }
        samples.push(elapsed / number);
      }
      const best = Math.min(...samples);
      const average = samples.reduce((sum, value) => sum + value, 0) / samples.length;
      if (timing.returnResult && lastResult) outputs.push(...lastResult.outputs);
      if (!timing.quiet) {
        outputs.push(streamOutput(
          `${average.toFixed(3)} ms ± ${(Math.max(...samples) - Math.min(...samples)).toFixed(3)} ms per loop (best ${best.toFixed(3)} ms; ${number} loop${number === 1 ? '' : 's'}, ${repeat} repeat${repeat === 1 ? '' : 's'})\n`
        ));
      }
    } else {
      const result = await runRuntime(
        cell,
        plan.language,
        plan.code,
        plan.originalSource,
        executionCount,
        signal
      );
      outputs = [...result.outputs];
      if (timing?.mode === 'time') {
        outputs.push(streamOutput(`Wall time: ${result.durationMs.toFixed(3)} ms\n`));
      }
      if (result.sessionRestarted) {
        setStatus('The local runtime restarted after this cell; subsequent state begins fresh.');
      }
    }

    const captured = applyCapture(outputs, plan.capture);
    if (plan.capture?.variable && /^[A-Za-z_]\w*$/.test(plan.capture.variable)) {
      const value = capturedValue(captured.captured);
      const assignment = `${plan.capture.variable} = ${JSON.stringify(value)}`;
      try {
        await runRuntime(
          cell,
          'python',
          assignment,
          plan.originalSource,
          executionCount,
          signal
        );
      } catch { }
    }
    return captured.visible;
  }, [runRuntime]);

  const executeCommandPlan = useCallback(async (
    cell: NotebookCodeCell,
    plan: NotebookCommandPlan,
    executionCount: number,
    signal: AbortSignal
  ): Promise<NotebookOutput[]> => {
    const args = plan.argumentTokens;
    const details = plan.details ?? {};
    let outputs: NotebookOutput[] = [];
    const run = async (code: string, language = plan.language) => {
      const result = await runRuntime(
        cell,
        language,
        code,
        plan.originalSource,
        executionCount,
        signal
      );
      outputs.push(...result.outputs);
    };

    switch (plan.command) {
      case 'lsmagic':
      case 'magic':
      case 'quickref':
        outputs.push({
          output_type: 'display_data',
          data: { 'text/markdown': `\`\`\`text\n${getNotebookMagicHelpText(plan.language)}\n\`\`\`` },
          metadata: {},
        });
        break;
      case 'pwd':
        await run(plan.language === 'python'
          ? 'import os\nos.getcwd()'
          : 'System.Environment.CurrentDirectory');
        break;
      case 'cd': {
        const path = String(details.path ?? args.join(' '));
        if (!path) outputs.push(errorOutput('UsageError', '%cd requires a directory path.'));
        else await run(plan.language === 'python'
          ? `import os\nos.chdir(${JSON.stringify(path)})\nos.getcwd()`
          : `System.Environment.CurrentDirectory = ${JSON.stringify(path)}; System.Environment.CurrentDirectory`);
        break;
      }
      case 'ls': {
        const requested = String(details.path ?? args.join(' ') ?? '');
        if (onListWorkspaceFiles) {
          const paths = onListWorkspaceFiles(filePath, requested);
          outputs.push(plainOutput(paths.length ? paths.join('\n') : '(no workspace files)', executionCount));
        } else {
          await run(plan.language === 'python'
            ? `import os\n"\\n".join(sorted(os.listdir(${JSON.stringify(requested || '.')})))`
            : `string.Join("\\n", System.IO.Directory.GetFileSystemEntries(${JSON.stringify(requested || '.')}))`);
        }
        break;
      }
      case 'env': {
        const action = String(details.action ?? 'list');
        const name = String(details.name ?? '');
        const value = String(details.value ?? '');
        if (plan.language === 'python') {
          if (action === 'set') await run(`import os\nos.environ[${JSON.stringify(name)}] = ${JSON.stringify(value)}\nos.environ[${JSON.stringify(name)}]`);
          else if (action === 'get') await run(`import os\nos.environ.get(${JSON.stringify(name)}, "")`);
          else await run('import os\n"\\n".join(f"{key}={value}" for key, value in sorted(os.environ.items()))');
        } else if (action === 'set') {
          await run(`System.Environment.SetEnvironmentVariable(${JSON.stringify(name)}, ${JSON.stringify(value)}); System.Environment.GetEnvironmentVariable(${JSON.stringify(name)})`);
        } else if (action === 'get') {
          await run(`System.Environment.GetEnvironmentVariable(${JSON.stringify(name)})`);
        } else {
          await run('string.Join("\\n", System.Environment.GetEnvironmentVariables().Keys.Cast<object>().Select(key => $"{key}={System.Environment.GetEnvironmentVariable(key.ToString())}"))');
        }
        break;
      }
      case 'who':
      case 'whos':
        if (plan.language === 'python') {
          await run(plan.command === 'who'
            ? '" ".join(sorted(name for name in globals() if not name.startswith("_") and name not in {"In", "Out", "display", "clear_output"}))'
            : '"\\n".join(f"{name:<24} {type(value).__name__:<18} {repr(value)[:80]}" for name, value in sorted(globals().items()) if not name.startswith("_") and name not in {"In", "Out", "display", "clear_output"})');
        } else {
          outputs.push(errorOutput('UnsupportedDirective', '#!who/#!whos cannot inspect Roslyn submission fields in the browser runtime yet. The directive was recognized and was not executed as C# code.'));
        }
        break;
      case 'history': {
        const history = historyRef.current.map(entry => `${entry.count}: ${entry.source}`).join('\n\n');
        outputs.push(plainOutput(history || '(no cells have run in this editor session)', executionCount));
        break;
      }
      case 'reset':
        await onRestart(fileId);
        nextExecutionCountRef.current = 1;
        historyRef.current = [];
        outputs.push(streamOutput('Notebook-local script state was restarted.\n'));
        break;
      case 'run': {
        const requestedPath = String(details.path ?? args[0] ?? '');
        const loaded = onReadWorkspaceFile?.(filePath, requestedPath) ?? null;
        if (loaded === null) {
          outputs.push(errorOutput('FileNotFoundError', `Workspace file not found: ${requestedPath}`));
          break;
        }
        const loadedLanguage = /\.(?:cs|csx)$/i.test(requestedPath) ? 'csharp' : /\.py$/i.test(requestedPath) ? 'python' : plan.language;
        if (loadedLanguage === 'python') {
          const argv = Array.isArray(details.argv) ? details.argv.map(value => String(value)) : [];
          await run(
            `import sys\n__codecraft_previous_argv = sys.argv\nsys.argv = ${JSON.stringify([requestedPath, ...argv])}\ntry:\n    exec(compile(${JSON.stringify(loaded)}, ${JSON.stringify(requestedPath)}, "exec"), globals(), globals())\nfinally:\n    sys.argv = __codecraft_previous_argv`,
            'python'
          );
        } else {
          await run(loaded, 'csharp');
        }
        break;
      }
      case 'load': {
        const requestedPath = String(details.path ?? args[0] ?? '');
        const loaded = onReadWorkspaceFile?.(filePath, requestedPath) ?? null;
        if (loaded === null) outputs.push(errorOutput('FileNotFoundError', `Workspace file not found: ${requestedPath}`));
        else {
          updateNotebook(current => setNotebookCellSource(current, cell.id, loaded));
          outputs.push(streamOutput(`Loaded ${requestedPath} into the current cell.\n`));
        }
        break;
      }
      case 'pinfo': {
        const target = String(details.target ?? args.join(' '));
        if (!target) outputs.push(errorOutput('UsageError', 'Object introspection requires a target.'));
        else if (plan.language === 'python') await run(`help(${target})`);
        else outputs.push(plainOutput(`Use Monaco hover, signature help, and Go to Definition to inspect C# symbol “${target}”.`, executionCount));
        break;
      }
      case 'matplotlib':
        outputs.push(streamOutput('Matplotlib inline display capture is active.\n'));
        break;
      case 'pip': {
        if (plan.language !== 'python') {
          outputs.push(errorOutput('UnsupportedMagic', '%pip is available only in Python cells.'));
          break;
        }
        const operation = String(details.operation ?? args[0] ?? 'list').toLowerCase();
        const packageArguments = Array.isArray(details.packageArguments)
          ? details.packageArguments.map(value => String(value)).filter(value => !value.startsWith('-'))
          : args.slice(1).filter(value => !value.startsWith('-'));
        if (operation === 'install' && packageArguments.length > 0) {
          await run(`import micropip\nawait micropip.install(${JSON.stringify(packageArguments)})\n${JSON.stringify(packageArguments.join(', '))}`);
          outputs.push(streamOutput(`Installed into this local Pyodide session: ${packageArguments.join(', ')}\n`));
        } else if (operation === 'list' || !operation) {
          await run('import importlib.metadata\n"\\n".join(sorted(f"{item.metadata[\'Name\']} {item.version}" for item in importlib.metadata.distributions() if item.metadata[\'Name\']))');
        } else {
          outputs.push(errorOutput('UnsupportedMagic', `%pip ${operation} is unavailable in the browser-local package provider. Use %pip install or the project package settings.`));
        }
        break;
      }
      default:
        outputs.push(errorOutput('UnsupportedMagic', `The ${plan.command} command is recognized but has no local adapter.`));
    }

    if (plan.remainingCode.trim() && !['load', 'run', 'reset'].includes(plan.command)) {
      const result = await runRuntime(
        cell,
        plan.language,
        plan.remainingCode,
        plan.originalSource,
        executionCount,
        signal
      );
      outputs.push(...result.outputs);
    }
    return outputs;
  }, [fileId, filePath, onListWorkspaceFiles, onReadWorkspaceFile, onRestart, runRuntime, updateNotebook]);

  const executePlannedCell = useCallback(async (
    cell: NotebookCodeCell,
    plan: NotebookExecutionPlan,
    executionCount: number,
    signal: AbortSignal
  ): Promise<NotebookOutput[]> => {
    switch (plan.kind) {
      case 'execute':
        return executeCodePlan(cell, plan, executionCount, signal);
      case 'render':
        return [{
          output_type: 'display_data',
          data: { [plan.mimeType]: plan.content },
          metadata: {
            codecraft: {
              local: true,
              sandboxed: plan.executeInFrontend,
              automaticallyExecuted: false,
            },
          },
        }];
      case 'write-file': {
        if (!onWriteWorkspaceFile) {
          return [errorOutput('WorkspaceUnavailable', 'This editor does not expose a writable project workspace.')];
        }
        try {
          const path = onWriteWorkspaceFile(filePath, plan.path, plan.content, plan.append);
          return [streamOutput(`${plan.append ? 'Appended to' : 'Wrote'} ${path}\n`)];
        } catch (error) {
          return [errorOutput('WorkspaceError', errorMessage(error))];
        }
      }
      case 'command':
        return executeCommandPlan(cell, plan, executionCount, signal);
      case 'unsupported':
        return [errorOutput(
          plan.category === 'shell-process' ? 'UnsupportedHostProcess' : 'UnsupportedMagic',
          plan.reason
        )];
    }
  }, [executeCodePlan, executeCommandPlan, filePath, onWriteWorkspaceFile]);

  const executeCellNow = useCallback(async (cellId: string) => {
    const current = notebookRef.current;
    const candidate = current?.cells.find(cell => cell.id === cellId);
    if (!current || !candidate || !isNotebookCodeCell(candidate)) return;

    const source = notebookSourceToString(candidate.source);
    const language = cellLanguage(candidate, notebookDefaultLanguage(current));
    const plan = planNotebookCell(source, language);
    const executionCount = nextExecutionCountRef.current;
    nextExecutionCountRef.current += 1;
    const controller = new AbortController();
    abortControllerRef.current = controller;
    setRunningCellId(cellId);
    setStatus(`Running ${language === 'csharp' ? 'C# Script' : 'Python'} locally…`);
    updateNotebook(value => setNotebookCellOutputs(value, cellId, [], executionCount));
    historyRef.current.push({ count: executionCount, source, language: plan.language });

    try {
      const outputs = await executePlannedCell(candidate, plan, executionCount, controller.signal);
      updateNotebook(value => setNotebookCellOutputs(value, cellId, outputs, executionCount));
      setStatus(plan.kind === 'unsupported'
        ? 'The directive was recognized but is unavailable in the local runtime.'
        : `${plan.summary} · execution ${executionCount}`);
    } catch (error) {
      const name = error instanceof DOMException && error.name === 'AbortError' ? 'Interrupted' : 'NotebookError';
      updateNotebook(value => setNotebookCellOutputs(
        value,
        cellId,
        [errorOutput(name, errorMessage(error))],
        executionCount
      ));
      setStatus(name === 'Interrupted' ? 'Execution interrupted; local contexts were restarted.' : 'Cell execution failed.');
    } finally {
      if (abortControllerRef.current === controller) abortControllerRef.current = null;
      setRunningCellId(currentId => currentId === cellId ? null : currentId);
    }
  }, [executePlannedCell, updateNotebook]);

  const addCellAt = useCallback((index: number, type: NotebookCellType = 'code', source = '') => {
    const current = notebookRef.current;
    if (!current) return null;
    const cell = createNotebookCell(type, source);
    const next = insertNotebookCell(current, index, cell);
    emitNotebook(next);
    setSelectedCellId(cell.id);
    if (type === 'markdown') {
      setMarkdownPreviews(values => new Set(values).add(cell.id));
    }
    window.setTimeout(() => {
      const editor = editorByCellRef.current.get(cell.id);
      editor?.focus();
    }, 0);
    return cell.id;
  }, [emitNotebook]);

  const focusCell = useCallback((cellId: string) => {
    setSelectedCellId(cellId);
    window.setTimeout(() => {
      const section = rootRef.current?.querySelector(`[data-notebook-cell-id="${CSS.escape(cellId)}"]`);
      section?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
      editorByCellRef.current.get(cellId)?.focus();
    }, 0);
  }, []);

  const afterCellRun = useCallback((cellId: string, mode: CellRunMode) => {
    const current = notebookRef.current;
    if (!current) return;
    const index = current.cells.findIndex(cell => cell.id === cellId);
    if (index < 0 || mode === 'stay') return;
    if (mode === 'insert') {
      addCellAt(index + 1, 'code');
      return;
    }
    const next = current.cells[index + 1];
    if (next) focusCell(next.id);
    else addCellAt(current.cells.length, 'code');
  }, [addCellAt, focusCell]);

  const enqueueCells = useCallback((cellIds: string[], finalMode: CellRunMode = 'stay') => {
    const generation = runGenerationRef.current;
    const work = queueTailRef.current.then(async () => {
      for (const cellId of cellIds) {
        if (generation !== runGenerationRef.current) break;
        await executeCellNow(cellId);
      }
      if (generation === runGenerationRef.current && cellIds.length > 0) {
        afterCellRun(cellIds[cellIds.length - 1], finalMode);
      }
    });
    queueTailRef.current = work.catch(() => {});
    return work;
  }, [afterCellRun, executeCellNow]);

  const runCell = useCallback((cellId: string, mode: CellRunMode = 'stay') => (
    enqueueCells([cellId], mode)
  ), [enqueueCells]);

  const runSelected = useCallback(async () => {
    const current = notebookRef.current;
    if (!current) return;
    const selected = current.cells.find(cell => cell.id === selectedCellId && cell.cell_type === 'code')
      ?? current.cells.find(cell => cell.cell_type === 'code');
    if (selected) await runCell(selected.id, 'stay');
  }, [runCell, selectedCellId]);

  const runAll = useCallback(async () => {
    const ids = notebookRef.current?.cells.filter(cell => cell.cell_type === 'code').map(cell => cell.id) ?? [];
    await enqueueCells(ids, 'stay');
  }, [enqueueCells]);

  const interrupt = useCallback(() => {
    runGenerationRef.current += 1;
    abortControllerRef.current?.abort();
    abortControllerRef.current = null;
    onInterrupt(fileId);
    setRunningCellId(null);
    setStatus('Execution interrupted; local script contexts were restarted.');
  }, [fileId, onInterrupt]);

  const restart = useCallback(async () => {
    runGenerationRef.current += 1;
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
      onInterrupt(fileId);
      abortControllerRef.current = null;
    }
    await queueTailRef.current.catch(() => {});
    await onRestart(fileId);
    nextExecutionCountRef.current = 1;
    historyRef.current = [];
    setRunningCellId(null);
    setStatus('Local Python and C# script contexts restarted.');
  }, [fileId, onInterrupt, onRestart]);

  const restartAndRunAll = useCallback(async () => {
    await restart();
    await runAll();
  }, [restart, runAll]);

  useEffect(() => {
    onRegisterController?.({ runSelected, runAll, interrupt, restart });
    return () => onRegisterController?.(null);
  }, [interrupt, onRegisterController, restart, runAll, runSelected]);

  useEffect(() => () => {
    runGenerationRef.current += 1;
    abortControllerRef.current?.abort();
    for (const editor of editorByCellRef.current.values()) {
      try { editor.dispose(); } catch { }
    }
    editorByCellRef.current.clear();
  }, []);

  const mountCellEditor = useCallback((
    cellId: string,
    editor: monaco.editor.IStandaloneCodeEditor
  ) => {
    editorByCellRef.current.set(cellId, editor);
    onMountEditor?.(editor);
    editor.onDidFocusEditorText(() => {
      setSelectedCellId(cellId);
      setCommandMode(false);
    });
    editor.onDidDispose(() => {
      if (editorByCellRef.current.get(cellId) === editor) editorByCellRef.current.delete(cellId);
    });
    editor.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyCode.Enter, () => { void runCell(cellId, 'stay'); });
    editor.addCommand(monaco.KeyMod.Shift | monaco.KeyCode.Enter, () => { void runCell(cellId, 'advance'); });
    editor.addCommand(monaco.KeyMod.Alt | monaco.KeyCode.Enter, () => { void runCell(cellId, 'insert'); });
    editor.addCommand(monaco.KeyCode.Escape, () => {
      setCommandMode(true);
      rootRef.current?.focus();
    });
  }, [onMountEditor, runCell]);

  const selectedIndex = notebook?.cells.findIndex(cell => cell.id === selectedCellId) ?? -1;

  const deleteCell = useCallback((cellId: string) => {
    const current = notebookRef.current;
    if (!current) return;
    const index = current.cells.findIndex(cell => cell.id === cellId);
    if (index < 0) return;
    const next = deleteNotebookCell(current, cellId);
    emitNotebook(next);
    setSelectedCellId(next.cells[Math.min(index, next.cells.length - 1)]?.id ?? null);
  }, [emitNotebook]);

  const duplicateCell = useCallback((cellId: string) => {
    const current = notebookRef.current;
    if (!current) return;
    const next = duplicateNotebookCell(current, cellId);
    const index = current.cells.findIndex(cell => cell.id === cellId);
    const duplicated = next.cells[index + 1];
    emitNotebook(next);
    if (duplicated) focusCell(duplicated.id);
  }, [emitNotebook, focusCell]);

  const copyCell = useCallback((cellId: string, cut = false) => {
    const cell = notebookRef.current?.cells.find(candidate => candidate.id === cellId);
    if (!cell) return;
    clipboardRef.current = { cell: cloneCell(cell), cut };
    setStatus(`${cut ? 'Cut' : 'Copied'} ${cell.cell_type} cell.`);
  }, []);

  const pasteCell = useCallback((below = true) => {
    const clipboard = clipboardRef.current;
    const current = notebookRef.current;
    if (!clipboard || !current) return;
    const selected = current.cells.findIndex(cell => cell.id === selectedCellId);
    const insertion = selected < 0 ? current.cells.length : selected + (below ? 1 : 0);
    const copy = createNotebookCell(
      clipboard.cell.cell_type,
      clipboard.cell.source,
      {
        metadata: clipboard.cell.metadata,
        outputs: clipboard.cell.cell_type === 'code' ? clipboard.cell.outputs : undefined,
        executionCount: clipboard.cell.cell_type === 'code' ? clipboard.cell.execution_count : undefined,
      }
    );
    let next = insertNotebookCell(current, insertion, copy);
    if (clipboard.cut) {
      const originalId = clipboard.cell.id;
      next = deleteNotebookCell(next, originalId);
      clipboardRef.current = null;
    }
    emitNotebook(next);
    focusCell(copy.id);
  }, [emitNotebook, focusCell, selectedCellId]);

  const splitCell = useCallback((cellId: string) => {
    const current = notebookRef.current;
    const cell = current?.cells.find(candidate => candidate.id === cellId);
    if (!current || !cell) return;
    const editor = editorByCellRef.current.get(cellId);
    const model = editor?.getModel();
    const position = editor?.getPosition();
    const source = notebookSourceToString(cell.source);
    const offset = model && position ? model.getOffsetAt(position) : source.length;
    const index = current.cells.findIndex(candidate => candidate.id === cellId);
    let next = setNotebookCellSource(current, cellId, source.slice(0, offset));
    if (cell.cell_type === 'code') next = setNotebookCellOutputs(next, cellId, [], null);
    const newCell = createNotebookCell(cell.cell_type, source.slice(offset).replace(/^\r?\n/, ''), {
      metadata: cell.metadata,
    });
    next = insertNotebookCell(next, index + 1, newCell);
    emitNotebook(next);
    focusCell(newCell.id);
  }, [emitNotebook, focusCell]);

  const mergeCellAbove = useCallback((cellId: string) => {
    const current = notebookRef.current;
    if (!current) return;
    const index = current.cells.findIndex(cell => cell.id === cellId);
    if (index <= 0) return;
    const previous = current.cells[index - 1];
    const cell = current.cells[index];
    const combined = [notebookSourceToString(previous.source), notebookSourceToString(cell.source)]
      .filter(Boolean)
      .join('\n');
    let next = setNotebookCellSource(current, previous.id, combined);
    if (previous.cell_type === 'code') next = setNotebookCellOutputs(next, previous.id, [], null);
    next = deleteNotebookCell(next, cell.id);
    emitNotebook(next);
    focusCell(previous.id);
  }, [emitNotebook, focusCell]);

  const handleCommandKey = useCallback((event: React.KeyboardEvent<HTMLDivElement>) => {
    if (!commandMode || event.metaKey || event.ctrlKey || event.altKey) return;
    const target = event.target as HTMLElement;
    if (target.closest('input,textarea,select,button,.monaco-editor')) return;
    const current = notebookRef.current;
    if (!current) return;
    const index = current.cells.findIndex(cell => cell.id === selectedCellId);
    const selected = current.cells[index];
    const key = event.key.toLowerCase();

    if (event.key === 'Enter' && selected) {
      event.preventDefault();
      editorByCellRef.current.get(selected.id)?.focus();
      setCommandMode(false);
      return;
    }
    if ((event.key === 'ArrowUp' || key === 'k') && index > 0) {
      event.preventDefault();
      focusCell(current.cells[index - 1].id);
      rootRef.current?.focus();
      return;
    }
    if ((event.key === 'ArrowDown' || key === 'j') && index >= 0 && index < current.cells.length - 1) {
      event.preventDefault();
      focusCell(current.cells[index + 1].id);
      rootRef.current?.focus();
      return;
    }
    if (key === 'a') {
      event.preventDefault();
      addCellAt(Math.max(0, index), 'code');
      return;
    }
    if (key === 'b') {
      event.preventDefault();
      addCellAt(index < 0 ? current.cells.length : index + 1, 'code');
      return;
    }
    if (key === 'm' && selected) {
      event.preventDefault();
      updateNotebook(value => setNotebookCellType(value, selected.id, 'markdown'));
      setMarkdownPreviews(values => new Set(values).add(selected.id));
      return;
    }
    if (key === 'y' && selected) {
      event.preventDefault();
      updateNotebook(value => setNotebookCellType(value, selected.id, 'code'));
      return;
    }
    if (key === 'r' && selected) {
      event.preventDefault();
      updateNotebook(value => setNotebookCellType(value, selected.id, 'raw'));
      return;
    }
    if (key === 'c' && selected) {
      event.preventDefault();
      copyCell(selected.id);
      return;
    }
    if (key === 'x' && selected) {
      event.preventDefault();
      copyCell(selected.id, true);
      return;
    }
    if (key === 'v') {
      event.preventDefault();
      pasteCell(!event.shiftKey);
      return;
    }
    if (key === 'd' && selected) {
      const now = performance.now();
      if (now - lastDeleteKeyRef.current < 700) {
        event.preventDefault();
        deleteCell(selected.id);
        lastDeleteKeyRef.current = 0;
      } else {
        lastDeleteKeyRef.current = now;
        setStatus('Press D again to delete the selected cell.');
      }
    }
  }, [addCellAt, commandMode, copyCell, deleteCell, focusCell, pasteCell, selectedCellId, updateNotebook]);

  if (!notebook) {
    return (
      <InvalidNotebookView
        content={content}
        error={parseError || 'Invalid notebook JSON.'}
        fontSize={fontSize}
        theme={theme}
        onRepair={repairNotebook}
        onCreate={createNotebookDocument}
      />
    );
  }

  const selectedCell = notebook.cells.find(cell => cell.id === selectedCellId) ?? null;
  const metadataValue = metadataTarget === 'notebook'
    ? notebook.metadata
    : metadataTarget
      ? notebook.cells.find(cell => cell.id === metadataTarget)?.metadata ?? {}
      : {};

  return (
    <div
      ref={rootRef}
      tabIndex={0}
      onKeyDown={handleCommandKey}
      onFocus={event => {
        if (event.target === rootRef.current) setCommandMode(true);
      }}
      className="relative flex h-full min-h-0 flex-col overflow-hidden bg-[rgb(28,28,28)] text-zinc-300 outline-none"
    >
      <div className="flex h-11 shrink-0 items-center gap-1 overflow-x-auto border-b border-white/10 bg-[rgb(30,30,30)] px-2 custom-scrollbar">
        <button
          type="button"
          onClick={() => void runSelected()}
          disabled={!!runningCellId}
          className="flex shrink-0 items-center gap-1.5 rounded-lg bg-indigo-600 px-2.5 py-1.5 text-xs font-medium text-white hover:bg-indigo-500 disabled:opacity-40"
          title="Run selected cell (Ctrl/Cmd+Enter)"
        >
          <Play size={13} /> Run
        </button>
        <button type="button" onClick={() => void runAll()} disabled={!!runningCellId} className="shrink-0 rounded-lg px-2 py-1.5 text-xs text-zinc-400 hover:bg-white/5 hover:text-white disabled:opacity-40">Run all</button>
        <button
          type="button"
          disabled={selectedIndex <= 0 || !!runningCellId}
          onClick={() => void enqueueCells(notebook.cells.slice(0, selectedIndex).filter(cell => cell.cell_type === 'code').map(cell => cell.id))}
          className="shrink-0 rounded-lg px-2 py-1.5 text-xs text-zinc-500 hover:bg-white/5 hover:text-white disabled:opacity-30"
        >Run above</button>
        <button
          type="button"
          disabled={selectedIndex < 0 || selectedIndex >= notebook.cells.length - 1 || !!runningCellId}
          onClick={() => void enqueueCells(notebook.cells.slice(selectedIndex + 1).filter(cell => cell.cell_type === 'code').map(cell => cell.id))}
          className="shrink-0 rounded-lg px-2 py-1.5 text-xs text-zinc-500 hover:bg-white/5 hover:text-white disabled:opacity-30"
        >Run below</button>
        <div className="mx-1 h-5 w-px shrink-0 bg-white/10" />
        <button type="button" onClick={interrupt} disabled={!runningCellId} title="Interrupt execution" className="rounded p-1.5 text-zinc-500 hover:bg-rose-500/10 hover:text-rose-300 disabled:opacity-30"><CircleStop size={14} /></button>
        <button type="button" onClick={() => void restart()} title="Restart local script contexts" className="rounded p-1.5 text-zinc-500 hover:bg-white/5 hover:text-white"><RefreshCw size={14} /></button>
        <button type="button" onClick={() => void restartAndRunAll()} disabled={!!runningCellId} className="flex shrink-0 items-center gap-1 rounded-lg px-2 py-1.5 text-xs text-zinc-500 hover:bg-white/5 hover:text-white disabled:opacity-30" title="Restart contexts, then run all cells"><RotateCcw size={13} /> Run all</button>
        <div className="mx-1 h-5 w-px shrink-0 bg-white/10" />
        <button
          type="button"
          onClick={() => addCellAt(selectedIndex < 0 ? notebook.cells.length : selectedIndex + 1, 'code')}
          className="flex shrink-0 items-center gap-1 rounded-lg px-2 py-1.5 text-xs text-zinc-400 hover:bg-white/5 hover:text-white"
        ><Plus size={13} /> Code</button>
        <button
          type="button"
          onClick={() => addCellAt(selectedIndex < 0 ? notebook.cells.length : selectedIndex + 1, 'markdown')}
          className="flex shrink-0 items-center gap-1 rounded-lg px-2 py-1.5 text-xs text-zinc-500 hover:bg-white/5 hover:text-white"
        ><Plus size={13} /> Markdown</button>
        <button type="button" onClick={() => pasteCell(true)} disabled={!clipboardRef.current} title="Paste cell below" className="rounded p-1.5 text-zinc-500 hover:bg-white/5 hover:text-white disabled:opacity-30"><Clipboard size={14} /></button>
        <button type="button" onClick={() => updateNotebook(clearNotebookCellOutputs)} className="shrink-0 rounded-lg px-2 py-1.5 text-xs text-zinc-500 hover:bg-white/5 hover:text-white">Clear outputs</button>
        <div className="flex-1" />
        <select
          value={defaultLanguage}
          onChange={event => updateNotebook(current => setNotebookLanguage(current, event.target.value as NotebookLanguage))}
          className="shrink-0 rounded-lg border border-white/10 bg-black/20 px-2 py-1.5 text-xs text-zinc-300 outline-none focus:border-indigo-500"
          title="Default notebook language"
        >
          <option value="python">Python 3 · local script</option>
          <option value="csharp">C# · Roslyn script context</option>
        </select>
        <button type="button" title="Notebook metadata" onClick={() => setMetadataTarget('notebook')} className="rounded p-1.5 text-zinc-500 hover:bg-white/5 hover:text-white"><Settings2 size={14} /></button>
        <button type="button" title="Magic command reference" onClick={() => setShowMagicHelp(true)} className="rounded p-1.5 text-zinc-500 hover:bg-white/5 hover:text-white"><HelpCircle size={14} /></button>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto custom-scrollbar">
        <div className="mx-auto w-full max-w-6xl space-y-4 px-5 py-5 pb-24">
          <div className="flex items-center gap-2 px-1 text-[11px] text-zinc-600">
            <Code2 size={12} />
            <span>{filePath}</span>
            <span>·</span>
            <span>{notebook.cells.length} cell{notebook.cells.length === 1 ? '' : 's'}</span>
            <span>· local execution, no kernel connection</span>
          </div>
          {notebook.cells.map((cell, index) => {
            const language = cellLanguage(cell, defaultLanguage);
            return (
              <NotebookCellView
                key={cell.id}
                cell={cell}
                index={index}
                selected={cell.id === selectedCellId}
                running={cell.id === runningCellId}
                language={language}
                notebookPath={filePath}
                fontSize={fontSize}
                theme={theme}
                collapsedSource={collapsedSources.has(cell.id)}
                collapsedOutput={collapsedOutputs.has(cell.id)}
                markdownPreview={markdownPreviews.has(cell.id)}
                onSelect={() => setSelectedCellId(cell.id)}
                onSourceChange={source => updateNotebook(current => setNotebookCellSource(current, cell.id, source))}
                onRun={mode => { void runCell(cell.id, mode); }}
                onMount={mountCellEditor}
                onTypeChange={type => {
                  updateNotebook(current => setNotebookCellType(current, cell.id, type));
                  setMarkdownPreviews(values => {
                    const next = new Set(values);
                    if (type === 'markdown') next.add(cell.id); else next.delete(cell.id);
                    return next;
                  });
                }}
                onLanguageChange={nextLanguage => updateNotebook(current => withCellLanguage(current, cell.id, nextLanguage))}
                onMove={offset => updateNotebook(current => moveNotebookCell(current, cell.id, index + offset))}
                onDuplicate={() => duplicateCell(cell.id)}
                onDelete={() => deleteCell(cell.id)}
                onCopy={() => copyCell(cell.id)}
                onCut={() => copyCell(cell.id, true)}
                onAddBelow={() => addCellAt(index + 1, 'code')}
                onSplit={() => splitCell(cell.id)}
                onMergeAbove={() => mergeCellAbove(cell.id)}
                onToggleSource={() => setCollapsedSources(values => {
                  const next = new Set(values);
                  if (next.has(cell.id)) next.delete(cell.id); else next.add(cell.id);
                  return next;
                })}
                onToggleOutput={() => setCollapsedOutputs(values => {
                  const next = new Set(values);
                  if (next.has(cell.id)) next.delete(cell.id); else next.add(cell.id);
                  return next;
                })}
                onToggleMarkdownPreview={() => setMarkdownPreviews(values => {
                  const next = new Set(values);
                  if (next.has(cell.id)) next.delete(cell.id); else next.add(cell.id);
                  return next;
                })}
                onEditMetadata={() => setMetadataTarget(cell.id)}
              />
            );
          })}
          {notebook.cells.length === 0 ? (
            <button
              type="button"
              onClick={() => addCellAt(0, 'code')}
              className="flex w-full items-center justify-center gap-2 rounded-xl border border-dashed border-white/10 py-16 text-sm text-zinc-600 hover:border-indigo-500/30 hover:bg-indigo-500/5 hover:text-indigo-300"
            ><Plus size={16} /> Add the first code cell</button>
          ) : null}
        </div>
      </div>

      <div className="flex h-7 shrink-0 items-center gap-2 border-t border-white/10 bg-[rgb(26,26,26)] px-3 text-[10px] text-zinc-600">
        <span className={classNames('h-1.5 w-1.5 rounded-full', runningCellId ? 'animate-pulse bg-amber-400' : 'bg-emerald-500')} />
        <span className="truncate">{status}</span>
        <span className="ml-auto shrink-0">{commandMode ? 'Command mode' : 'Edit mode'} · Shift+Enter run/advance · Esc command mode · A/B insert · D,D delete</span>
      </div>

      {showMagicHelp ? <MagicHelp language={defaultLanguage} onClose={() => setShowMagicHelp(false)} /> : null}
      {metadataTarget ? (
        <MetadataEditor
          title={metadataTarget === 'notebook' ? 'Notebook metadata' : 'Cell metadata'}
          metadata={metadataValue}
          onClose={() => setMetadataTarget(null)}
          onApply={metadata => {
            if (metadataTarget === 'notebook') {
              updateNotebook(current => ({ ...current, metadata }));
            } else {
              updateNotebook(current => ({
                ...current,
                cells: current.cells.map(cell => cell.id === metadataTarget ? { ...cell, metadata } : cell),
              }));
            }
          }}
        />
      ) : null}
    </div>
  );
}

export default NotebookEditor;
