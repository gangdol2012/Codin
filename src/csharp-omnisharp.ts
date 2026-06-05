import * as monaco from 'monaco-editor';

const iframeId = `omnisharp-${Math.random().toString(36).slice(2)}`;

type OmniSharpCall = (method: string, ...args: unknown[]) => Promise<any>;
export type CSharpOmniSharpSource = 'local';

const CSHARP_OMNISHARP_URLS: Record<CSharpOmniSharpSource, string> = {
  local: '/omnisharp/index.html',
};

function normalizeCSharpOmniSharpSource(source: unknown): CSharpOmniSharpSource {
  return 'local';
}

export function getCSharpOmniSharpUrl(source: CSharpOmniSharpSource) {
  return CSHARP_OMNISHARP_URLS[normalizeCSharpOmniSharpSource(source)];
}

export interface CSharpProjectFileSnapshot {
  path: string;
  content: string;
  language: 'csharp';
}

type CSharpProjectFilesProvider = () => CSharpProjectFileSnapshot[];

interface CSharpDiagnosticProjectRequest {
  CurrentPath: string;
  Files: Array<{
    Path: string;
    Content: string;
  }>;
}

interface CSharpCompletionCacheEntry {
  suggestions: monaco.languages.CompletionItem[];
  lspItems: any[];
  incomplete?: boolean;
  completionSnapshot?: CSharpCompletionRequestSnapshot;
  lateContext?: CSharpLateCompletionContext | null;
}

interface CSharpCompletionRequestSnapshot {
  code: string;
  modelVersionId: number;
  offset: number;
  structuralVersion: number;
}

interface CSharpModelTextSnapshot {
  code: string;
  modelVersionId: number;
  alternativeVersionId: number;
  length: number;
  hash: string;
  uri: string;
}

interface CSharpLateCompletionContext {
  insertedLength: number;
  filterRange: monaco.Range;
}

interface CSharpSerializedProjectRequest {
  request: CSharpDiagnosticProjectRequest;
  serialized: string;
  fileKey: string;
  currentPath: string;
}

interface CSharpPredictiveCompletionSource {
  modelUri: string;
  projectFileKey: string;
  environmentVersion: number;
  suggestions: monaco.languages.CompletionItem[];
  lspItems: any[];
}

interface CSharpPredictiveCompletionCacheEntry {
  response: unknown;
  completionListKey: string;
  codeHash: string;
  offset: number;
  itemCount: number;
  createdAt: number;
}

interface CSharpPredictiveCompletionPlan {
  key: string;
  completionListKey: string;
  code: string;
  codeHash: string;
  offset: number;
  request: any;
  projectRequest: CSharpSerializedProjectRequest;
  candidate: string;
  prefix: string;
}

export type CSharpCompletionPreloadStatus =
  | 'idle'
  | 'scheduled'
  | 'running'
  | 'cached'
  | 'served'
  | 'empty'
  | 'stale'
  | 'invalidated'
  | 'failed';

export interface CSharpCompletionPreloadPlanSnapshot {
  key: string;
  completionListKey: string;
  candidate: string;
  prefix: string;
  assumedText: string;
  codeHash: string;
  offset: number;
  line: number;
  column: number;
  completionTrigger: unknown;
  projectCurrentPath: string;
  projectFileKey: string;
  projectFileCount: number;
}

export interface CSharpCompletionPreloadRequestSnapshot extends CSharpCompletionPreloadPlanSnapshot {
  status: CSharpCompletionPreloadStatus;
  statusText: string;
  serial: number;
  callId: string;
  scheduledAt?: string;
  startedAt?: string;
  finishedAt?: string;
  invalidatedAt?: string;
  durationMs?: number;
  itemCount?: number;
  cached?: boolean;
  cacheKey?: string;
  cacheAgeMs?: number;
  reason?: string;
  error?: unknown;
}

export interface CSharpCompletionPreloadSourceSnapshot {
  modelUri: string;
  modelPath: string;
  projectFileKey: string;
  environmentVersion: number;
  suggestionCount: number;
  candidateSample: string[];
}

export interface CSharpCompletionPreloadCacheEntrySnapshot {
  key: string;
  completionListKey: string;
  codeHash: string;
  offset: number;
  itemCount: number;
  ageMs: number;
}

export interface CSharpCompletionPreloadDebugSnapshot {
  state: CSharpCompletionPreloadStatus;
  summary: string;
  serial: number;
  delayMs: number;
  cacheLimit: number;
  timerPending: boolean;
  activePlan: CSharpCompletionPreloadPlanSnapshot | null;
  source: CSharpCompletionPreloadSourceSnapshot | null;
  cacheEntries: CSharpCompletionPreloadCacheEntrySnapshot[];
  lastRequest: CSharpCompletionPreloadRequestSnapshot | null;
}

export type CSharpIdeDebugLevel = 'info' | 'success' | 'warning' | 'error';

export interface CSharpIdeDebugEvent {
  id: number;
  timestamp: string;
  feature: string;
  featureKey?: string;
  featureLabel?: string;
  category?: string;
  phase: string;
  level: CSharpIdeDebugLevel;
  message: string;
  callId?: string;
  durationMs?: number;
  model?: CSharpIdeDebugModelSummary;
  request?: unknown;
  response?: unknown;
  error?: unknown;
  environment?: unknown;
}

export interface CSharpIdeDebugFeatureSnapshot {
  key: string;
  label: string;
  category: string;
  description: string;
  eventCount: number;
  providerCallCount: number;
  runtimeCallCount: number;
  successCount: number;
  warningCount: number;
  errorCount: number;
  inFlightCount: number;
  firstEventAt: string | null;
  lastEventAt: string | null;
  averageDurationMs: number | null;
  maxDurationMs: number | null;
  lastDurationMs: number | null;
  levels: Record<CSharpIdeDebugLevel, number>;
  phases: Record<string, number>;
  lastModel?: CSharpIdeDebugModelSummary;
  lastRequest?: unknown;
  lastResponse?: unknown;
  lastError?: unknown;
  lastEnvironment?: unknown;
  events: CSharpIdeDebugEvent[];
}

export interface CSharpIdeDebugModelSummary {
  uri: string;
  path: string;
  language: string;
  versionId: number;
  alternativeVersionId: number;
  lineCount: number;
  length: number;
  hash: string;
  disposed: boolean;
}

export interface CSharpIdeDebugProjectFileSummary {
  path: string;
  language: string;
  length: number;
  lines: number;
  hash: string;
  hasMonacoModel: boolean;
  modelUri?: string;
  modelVersionId?: number;
}

export interface CSharpIdeDebugSnapshot {
  enabled: boolean;
  generatedAt: string;
  runtime: {
    initialized: boolean;
    iframeUrl: string | null;
    hasOmniSharpBridge: boolean;
    providersRegistered: boolean;
    initializationPending: boolean;
  };
  activeModel: CSharpIdeDebugModelSummary | null;
  project: {
    providerFileCount: number;
    csharpFileCount: number;
    providerError?: string;
    files: CSharpIdeDebugProjectFileSummary[];
    lastDiagnosticRequest: unknown;
  };
  cache: {
    completionCacheSize: number;
    predictiveCompletionCacheSize: number;
    predictiveCompletionActivePlan: boolean;
    completionEnvironmentVersion: number;
    completionWorkerStateKey: string | null;
    diagnosticCacheKey: string | null;
    diagnosticCacheMarkerCount: number;
    activeModelSemanticCacheHit: boolean;
  };
  completionPreload: CSharpCompletionPreloadDebugSnapshot;
  features: CSharpIdeDebugFeatureSnapshot[];
  events: CSharpIdeDebugEvent[];
}

export interface CSharpIdeDebugOptions {
  enabled: boolean;
  onDidChange?: (snapshot: CSharpIdeDebugSnapshot) => void;
}

const CSHARP_COMPLETION_CACHE_LIMIT = 32;
const CSHARP_PREDICTIVE_COMPLETION_CACHE_LIMIT = 4;
const CSHARP_PREDICTIVE_COMPLETION_DELAY_MS = 35;
const CSHARP_RUNTIME_RESPONSE_CACHE_LIMIT = 64;
const CSHARP_DEBUG_EVENT_LIMIT = 500;
const CSHARP_DEBUG_FEATURE_EVENT_LIMIT = 120;
const CSHARP_STALE_COMPLETION_RESPONSE = Symbol('stale-csharp-completion-response');

interface CSharpIdeDebugFeatureDescriptor {
  key: string;
  label: string;
  category: string;
  description: string;
  order: number;
}

const CSHARP_DEBUG_FEATURE_DESCRIPTORS: CSharpIdeDebugFeatureDescriptor[] = [
  {
    key: 'diagnostics',
    label: 'Diagnostics',
    category: 'Analysis',
    description: 'Marker production, project snapshot submission, diagnostic caching, and OmniSharp diagnostic responses.',
    order: 10,
  },
  {
    key: 'completion',
    label: 'Completion',
    category: 'Authoring',
    description: 'Completion trigger context, cache state, LSP item conversion, completion resolve, and OmniSharp completion payloads.',
    order: 20,
  },
  {
    key: 'completionPreload',
    label: 'Completion Preload',
    category: 'Authoring',
    description: 'Speculative candidate selection, preload request state, cache hits, invalidations, and replay timing.',
    order: 21,
  },
  {
    key: 'signatureHelp',
    label: 'Signature Help',
    category: 'Authoring',
    description: 'Call-site position, active signature/parameter selection, OmniSharp response shape, and local fallback results.',
    order: 30,
  },
  {
    key: 'hover',
    label: 'Hover',
    category: 'Navigation',
    description: 'Quick info requests, markdown response shape, local semantic-index fallback, and symbol lookup state.',
    order: 40,
  },
  {
    key: 'definition',
    label: 'Definition',
    category: 'Navigation',
    description: 'Go-to-definition requests, returned location counts, local declaration lookup, and model/path context.',
    order: 50,
  },
  {
    key: 'references',
    label: 'References',
    category: 'Navigation',
    description: 'Find-references requests, include-declaration mode, OmniSharp/local merged locations, and cross-model matching context.',
    order: 60,
  },
  {
    key: 'rename',
    label: 'Rename',
    category: 'Refactor',
    description: 'Rename validation, resolve-location results, workspace edit counts, reject reasons, and merged OmniSharp/local edits.',
    order: 70,
  },
  {
    key: 'codeActions',
    label: 'Code Actions',
    category: 'Refactor',
    description: 'Quick fix/refactor requests, marker context, action counts, edit counts, and preferred action detection.',
    order: 80,
  },
  {
    key: 'semanticTokens',
    label: 'Semantic Tokens',
    category: 'Analysis',
    description: 'Semantic token provider calls, OmniSharp token payload sizes, encoded token counts, cancellation, and local fallback.',
    order: 90,
  },
  {
    key: 'documentSymbols',
    label: 'Symbols',
    category: 'Outline',
    description: 'Document symbol requests, OmniSharp symbol tree conversion, local outline fallback, and symbol counts.',
    order: 100,
  },
  {
    key: 'documentHighlights',
    label: 'Highlights',
    category: 'Navigation',
    description: 'Document highlight calls, read/write highlight counts, and semantic occurrence lookup state.',
    order: 110,
  },
  {
    key: 'inlayHints',
    label: 'Inlay Hints',
    category: 'Editor UI',
    description: 'Inlay hint range requests, OmniSharp hint payloads, local hint fallback, and hint count summaries.',
    order: 120,
  },
  {
    key: 'foldingRanges',
    label: 'Folding',
    category: 'Editor UI',
    description: 'Folding range requests, region/comment range conversion, and local folding fallback.',
    order: 130,
  },
  {
    key: 'formatting',
    label: 'Formatting',
    category: 'Editor UI',
    description: 'Document/range/on-type formatting calls, formatting options, changed text summaries, and fallback formatter output.',
    order: 140,
  },
  {
    key: 'selectionRanges',
    label: 'Selection Ranges',
    category: 'Editor UI',
    description: 'Selection range provider calls, requested positions, and local syntax-range expansion results.',
    order: 150,
  },
  {
    key: 'namespaces',
    label: 'Namespaces',
    category: 'Runtime',
    description: 'Namespace include requests, restored namespace state, matched assemblies, and include failures.',
    order: 160,
  },
  {
    key: 'runtime',
    label: 'Runtime Bridge',
    category: 'Runtime',
    description: 'OmniSharp iframe lifecycle, postMessage requests, response timing, false payloads, and timeouts.',
    order: 170,
  },
  {
    key: 'lifecycle',
    label: 'Lifecycle',
    category: 'Runtime',
    description: 'Editor binding, active model changes, cache clears, model content changes, and debug mode transitions.',
    order: 180,
  },
];

const CSHARP_DEBUG_FEATURE_ALIASES = new Map<string, string>([
  ['diagnostics', 'diagnostics'],
  ['getdiagnosticsasync', 'diagnostics'],
  ['completion', 'completion'],
  ['completion.resolve', 'completion'],
  ['completion.predictive', 'completionPreload'],
  ['completion.preload', 'completionPreload'],
  ['getcompletionasync', 'completion'],
  ['getcompletionresolveasync', 'completion'],
  ['getspeculativecompletionasync', 'completionPreload'],
  ['getspeculativecompletionresolveasync', 'completionPreload'],
  ['signaturehelp', 'signatureHelp'],
  ['getsignaturehelpasync', 'signatureHelp'],
  ['hover', 'hover'],
  ['getquickinfoasync', 'hover'],
  ['definition', 'definition'],
  ['getdefinitionasync', 'definition'],
  ['references', 'references'],
  ['getreferencesasync', 'references'],
  ['rename.resolve', 'rename'],
  ['rename.edits', 'rename'],
  ['getrenameinfoasync', 'rename'],
  ['getrenameeditsasync', 'rename'],
  ['codeactions', 'codeActions'],
  ['getcodeactionsasync', 'codeActions'],
  ['semantictokens', 'semanticTokens'],
  ['getsemantictokensasync', 'semanticTokens'],
  ['documentsymbols', 'documentSymbols'],
  ['getdocumentsymbolsasync', 'documentSymbols'],
  ['documenthighlights', 'documentHighlights'],
  ['inlayhints', 'inlayHints'],
  ['getinlayhintsasync', 'inlayHints'],
  ['foldingranges', 'foldingRanges'],
  ['getfoldingrangesasync', 'foldingRanges'],
  ['formatdocument', 'formatting'],
  ['formatrange', 'formatting'],
  ['formatontype', 'formatting'],
  ['getformattingasync', 'formatting'],
  ['getrangeformattingasync', 'formatting'],
  ['selectionranges', 'selectionRanges'],
  ['includenamespaceasync', 'namespaces'],
  ['lifecycle', 'lifecycle'],
  ['cache', 'lifecycle'],
  ['model', 'lifecycle'],
  ['debug', 'lifecycle'],
]);

const csharpDebugDescriptorByKey = new Map(
  CSHARP_DEBUG_FEATURE_DESCRIPTORS.map(descriptor => [descriptor.key, descriptor])
);

interface OmniSharpPositionDto {
  line: number;
  character: number;
}

interface OmniSharpRangeDto {
  start: OmniSharpPositionDto;
  end: OmniSharpPositionDto;
}

interface OmniSharpLocationDto {
  range: OmniSharpRangeDto;
  path?: string;
  name?: string;
  kind?: string;
  detail?: string;
}

interface OmniSharpTextEditDto {
  range: OmniSharpRangeDto;
  text: string;
  path?: string;
}

interface OmniSharpRenameInfoDto {
  canRename?: boolean;
  range?: OmniSharpRangeDto;
  text?: string;
  rejectReason?: string;
}

interface OmniSharpRenameEditsDto {
  edits?: OmniSharpTextEditDto[];
  rejectReason?: string | null;
}

interface OmniSharpCodeActionDto {
  title: string;
  kind?: string;
  edits?: OmniSharpTextEditDto[];
  isPreferred?: boolean;
}

interface OmniSharpDocumentSymbolDto {
  name: string;
  detail?: string;
  kind?: string;
  range: OmniSharpRangeDto;
  selectionRange: OmniSharpRangeDto;
  children?: OmniSharpDocumentSymbolDto[];
}

interface OmniSharpSemanticTokenDto {
  startLine: number;
  startColumn: number;
  length: number;
  type: CSharpSemanticTokenType;
  modifiers?: CSharpSemanticTokenModifier[];
}

interface OmniSharpInlayHintDto {
  kind?: string;
  label: string;
  position: OmniSharpPositionDto;
  paddingLeft?: boolean;
  paddingRight?: boolean;
}

interface OmniSharpFoldingRangeDto {
  start: number;
  end: number;
  kind?: string;
}

interface OmniSharpHoverDto {
  markdown?: string;
  contents?: string | { value?: string } | Array<string | { value?: string }>;
  range?: OmniSharpRangeDto;
}

type CSharpSemanticTokenType = typeof CSHARP_SEMANTIC_TOKEN_TYPES[number];
type CSharpSemanticTokenModifier = typeof CSHARP_SEMANTIC_TOKEN_MODIFIERS[number];

const CSHARP_SEMANTIC_TOKEN_TYPES = [
  'csharpNamespace',
  'csharpClass',
  'csharpRecord',
  'csharpStruct',
  'csharpInterface',
  'csharpEnum',
  'csharpDelegate',
  'csharpTypeParameter',
  'csharpMethod',
  'csharpExtensionMethod',
  'csharpConstructor',
  'csharpProperty',
  'csharpField',
  'csharpEvent',
  'csharpEnumMember',
  'csharpParameter',
  'csharpLocal',
  'csharpConstant',
  'csharpLabel',
  'csharpKeyword',
  'csharpControlKeyword',
  'csharpPreprocessor',
] as const;

const CSHARP_SEMANTIC_TOKEN_MODIFIERS = [
  'declaration',
  'static',
  'readonly',
  'abstract',
  'async',
  'virtual',
  'override',
  'extension',
  'defaultLibrary',
  'obsolete',
  'unsafe',
] as const;

const CSHARP_SEMANTIC_LEGEND: monaco.languages.SemanticTokensLegend = {
  tokenTypes: [...CSHARP_SEMANTIC_TOKEN_TYPES],
  tokenModifiers: [...CSHARP_SEMANTIC_TOKEN_MODIFIERS],
};

const csharpTokenTypeIndex = new Map<string, number>(
  CSHARP_SEMANTIC_TOKEN_TYPES.map((type, index) => [type, index])
);

const csharpTokenModifierMask = new Map<string, number>(
  CSHARP_SEMANTIC_TOKEN_MODIFIERS.map((modifier, index) => [modifier, 1 << index])
);

function debounce<T extends (...args: any[]) => any>(func: T, delay: number): (...args: Parameters<T>) => Promise<ReturnType<T>> {
  let timer: ReturnType<typeof setTimeout>;
  return function (this: any, ...args: Parameters<T>) {
    clearTimeout(timer);
    return new Promise((resolve, reject) => {
      timer = setTimeout(() => {
        try { resolve(func.apply(this, args)); }
        catch (e) { reject(e); }
      }, delay);
    });
  };
}

function isRecord(value: string, obj: unknown): obj is Record<string, unknown> {
  return typeof obj === 'object' && obj !== null && value in obj;
}

function normalizeProjectPath(path: string): string {
  const resolved: string[] = [];
  for (const rawPart of path.replace(/\\/g, '/').split('/')) {
    const part = rawPart.trim();
    if (!part || part === '.') continue;
    if (part === '..') {
      resolved.pop();
      continue;
    }
    resolved.push(part);
  }
  return resolved.join('/');
}

const CODECRAFT_MONACO_PROJECT_ROOT = '/codecraft-project';

function projectModelUriForPath(path: string) {
  return monaco.Uri.file(`${CODECRAFT_MONACO_PROJECT_ROOT}/${normalizeProjectPath(path)}`);
}

function hashString(value: string): string {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(36);
}

function stableCacheKey(value: unknown): string {
  if (value == null || typeof value === 'number' || typeof value === 'boolean') return String(value);
  if (typeof value === 'string') return value.length > 160 ? `${value.length}:${hashString(value)}` : value;
  if (Array.isArray(value)) return `[${value.map(stableCacheKey).join(',')}]`;
  if (typeof value === 'object') {
    const record = value as Record<string, unknown>;
    return `{${Object.keys(record).sort().map(key => `${key}:${stableCacheKey(record[key])}`).join(',')}}`;
  }
  return typeof value;
}

function countLines(value: string) {
  if (!value) return 0;
  return value.split(/\r\n|\r|\n/).length;
}

function summarizePrimitive(value: unknown): unknown {
  if (value == null || typeof value === 'number' || typeof value === 'boolean') return value;
  if (typeof value === 'string') {
    return value.length <= 80 && !/[\r\n]/.test(value)
      ? value
      : { type: 'string', length: value.length, lines: countLines(value), hash: hashString(value) };
  }
  if (Array.isArray(value)) return { type: 'array', length: value.length };
  if (typeof value === 'object') return { type: 'object', keys: Object.keys(value as Record<string, unknown>).slice(0, 12) };
  return typeof value;
}

function summarizeMarkers(markers: monaco.editor.IMarkerData[]) {
  return markers.reduce<Record<string, number>>((summary, marker) => {
    const key = marker.severity === monaco.MarkerSeverity.Error
      ? 'error'
      : marker.severity === monaco.MarkerSeverity.Warning
        ? 'warning'
        : marker.severity === monaco.MarkerSeverity.Info
          ? 'info'
          : 'hint';
    summary[key] = (summary[key] ?? 0) + 1;
    return summary;
  }, {});
}

function getCSharpDebugFeatureDescriptor(feature: string, explicitKey?: string): CSharpIdeDebugFeatureDescriptor {
  const aliasKey = explicitKey
    ?? CSHARP_DEBUG_FEATURE_ALIASES.get(feature.toLowerCase())
    ?? 'runtime';
  return csharpDebugDescriptorByKey.get(aliasKey)
    ?? csharpDebugDescriptorByKey.get('runtime')!;
}

function createEmptyCSharpDebugLevelCounts(): Record<CSharpIdeDebugLevel, number> {
  return {
    info: 0,
    success: 0,
    warning: 0,
    error: 0,
  };
}

function currentModelPath(model: monaco.editor.ITextModel) {
  const uriPath = decodeURIComponent(model.uri.path || '');
  const projectMarker = '/codecraft-project/';
  const projectIndex = uriPath.indexOf(projectMarker);
  if (projectIndex >= 0) return normalizeProjectPath(uriPath.slice(projectIndex + projectMarker.length));

  const modelMarker = '/codecraft-model/';
  const modelIndex = uriPath.indexOf(modelMarker);
  if (modelIndex >= 0) {
    const withoutPrefix = uriPath.slice(modelIndex + modelMarker.length);
    const slash = withoutPrefix.indexOf('/');
    return normalizeProjectPath(slash >= 0 ? withoutPrefix.slice(slash + 1) : withoutPrefix);
  }

  return normalizeProjectPath(uriPath.replace(/^\//, '') || model.uri.toString());
}

// CodeCraft C# OmniSharp-only completion start
const CSHARP_CONTEXTUAL_COMPLETION_FIX_VERSION = '2026-06-01-bracket-trigger-guard';

const CSHARP_CONTEXTUAL_COMPLETION_TRIGGER_CHARACTERS = [',', ' ', '#', ':', '=', '?', '@'];

const CSHARP_LSP_COMPLETION_KIND_TO_MONACO = new Map<number, monaco.languages.CompletionItemKind>([
  [1, monaco.languages.CompletionItemKind.Text],
  [2, monaco.languages.CompletionItemKind.Method],
  [3, monaco.languages.CompletionItemKind.Function],
  [4, monaco.languages.CompletionItemKind.Constructor],
  [5, monaco.languages.CompletionItemKind.Field],
  [6, monaco.languages.CompletionItemKind.Variable],
  [7, monaco.languages.CompletionItemKind.Class],
  [8, monaco.languages.CompletionItemKind.Interface],
  [9, monaco.languages.CompletionItemKind.Module],
  [10, monaco.languages.CompletionItemKind.Property],
  [11, monaco.languages.CompletionItemKind.Unit],
  [12, monaco.languages.CompletionItemKind.Value],
  [13, monaco.languages.CompletionItemKind.Enum],
  [14, monaco.languages.CompletionItemKind.Keyword],
  [15, monaco.languages.CompletionItemKind.Snippet],
  [16, monaco.languages.CompletionItemKind.Color],
  [17, monaco.languages.CompletionItemKind.File],
  [18, monaco.languages.CompletionItemKind.Reference],
  [19, monaco.languages.CompletionItemKind.Folder],
  [20, monaco.languages.CompletionItemKind.EnumMember],
  [21, monaco.languages.CompletionItemKind.Constant],
  [22, monaco.languages.CompletionItemKind.Struct],
  [23, monaco.languages.CompletionItemKind.Event],
  [24, monaco.languages.CompletionItemKind.Operator],
  [25, monaco.languages.CompletionItemKind.TypeParameter],
]);

const CSHARP_COMPLETION_KIND_NAME_TO_MONACO = new Map<string, monaco.languages.CompletionItemKind>([
  ['text', monaco.languages.CompletionItemKind.Text],
  ['method', monaco.languages.CompletionItemKind.Method],
  ['function', monaco.languages.CompletionItemKind.Function],
  ['constructor', monaco.languages.CompletionItemKind.Constructor],
  ['field', monaco.languages.CompletionItemKind.Field],
  ['variable', monaco.languages.CompletionItemKind.Variable],
  ['class', monaco.languages.CompletionItemKind.Class],
  ['interface', monaco.languages.CompletionItemKind.Interface],
  ['module', monaco.languages.CompletionItemKind.Module],
  ['namespace', monaco.languages.CompletionItemKind.Module],
  ['property', monaco.languages.CompletionItemKind.Property],
  ['unit', monaco.languages.CompletionItemKind.Unit],
  ['value', monaco.languages.CompletionItemKind.Value],
  ['enum', monaco.languages.CompletionItemKind.Enum],
  ['keyword', monaco.languages.CompletionItemKind.Keyword],
  ['snippet', monaco.languages.CompletionItemKind.Snippet],
  ['color', monaco.languages.CompletionItemKind.Color],
  ['file', monaco.languages.CompletionItemKind.File],
  ['reference', monaco.languages.CompletionItemKind.Reference],
  ['folder', monaco.languages.CompletionItemKind.Folder],
  ['enummember', monaco.languages.CompletionItemKind.EnumMember],
  ['constant', monaco.languages.CompletionItemKind.Constant],
  ['struct', monaco.languages.CompletionItemKind.Struct],
  ['event', monaco.languages.CompletionItemKind.Event],
  ['operator', monaco.languages.CompletionItemKind.Operator],
  ['typeparameter', monaco.languages.CompletionItemKind.TypeParameter],
]);

const csharpCompletionInflightByService = new WeakMap<object, Map<string, Promise<CSharpCompletionCacheEntry | null>>>();

function csharpCompletionInflightFor(service: object) {
  let inflight = csharpCompletionInflightByService.get(service);
  if (!inflight) {
    inflight = new Map<string, Promise<CSharpCompletionCacheEntry | null>>();
    csharpCompletionInflightByService.set(service, inflight);
  }
  return inflight;
}

function csharpCompletionFastHash(value: string): string {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(36);
}

function csharpCompletionOptionalString(value: unknown): string | undefined {
  if (value == null) return undefined;
  if (typeof value === 'string') return value;
  if (typeof value === 'number' || typeof value === 'boolean') return String(value);
  if (typeof value === 'object') {
    const record = value as Record<string, unknown>;
    return csharpCompletionOptionalString(record.label ?? record.Label ?? record.name ?? record.Name ?? record.value ?? record.Value);
  }
  return undefined;
}

function csharpCompletionLabel(item: any): string {
  return csharpCompletionOptionalString(
    item?.label ?? item?.Label ?? item?.insertText ?? item?.InsertText ?? item?.textEdit?.newText ?? item?.TextEdit?.NewText
  ) ?? '';
}

function csharpCompletionItemsFromResponse(response: any): any[] {
  const items = Array.isArray(response)
    ? response
    : response?.items ?? response?.Items ?? response?.completions ?? response?.Completions ?? response?.suggestions ?? response?.Suggestions ?? [];
  return Array.isArray(items) ? items : [];
}

function csharpCompletionResponseIsIncomplete(response: any): boolean {
  return !!(response?.isIncomplete ?? response?.IsIncomplete ?? response?.incomplete ?? response?.Incomplete);
}

function csharpResolvedCompletionItem(response: any, original: any): any {
  return response?.item ?? response?.Item ?? response?.completionItem ?? response?.CompletionItem ?? response ?? original;
}

function csharpCompletionNormalizeKind(kind: unknown): monaco.languages.CompletionItemKind {
  const numericKind = typeof kind === 'number' ? kind : Number.NaN;
  if (Number.isFinite(numericKind)) {
    if (numericKind === 0) return monaco.languages.CompletionItemKind.Text;
    const mapped = CSHARP_LSP_COMPLETION_KIND_TO_MONACO.get(numericKind);
    if (mapped !== undefined) return mapped;
  }

  const normalizedName = csharpCompletionOptionalString(kind)?.replace(/[\s_-]/g, '').toLowerCase();
  if (normalizedName) {
    const mapped = CSHARP_COMPLETION_KIND_NAME_TO_MONACO.get(normalizedName);
    if (mapped !== undefined) return mapped;
  }

  return monaco.languages.CompletionItemKind.Property;
}

function csharpCompletionTextEdit(item: any): any {
  return item?.textEdit ?? item?.TextEdit;
}

function csharpCompletionInsertText(item: any, label: string): string {
  const textEdit = csharpCompletionTextEdit(item);
  return csharpCompletionOptionalString(textEdit?.newText ?? textEdit?.NewText ?? item?.insertText ?? item?.InsertText ?? item?.text ?? item?.Text) ?? label;
}

function csharpCompletionInsertTextRules(item: any): monaco.languages.CompletionItemInsertTextRule | undefined {
  const rawFormat = item?.insertTextFormat ?? item?.InsertTextFormat;
  const normalized = typeof rawFormat === 'string' ? rawFormat.toLowerCase() : rawFormat;
  return normalized === 2 || normalized === 'snippet'
    ? monaco.languages.CompletionItemInsertTextRule.InsertAsSnippet
    : undefined;
}

function csharpCompletionDocumentation(value: unknown): string | monaco.IMarkdownString | undefined {
  if (value == null) return undefined;
  if (typeof value === 'string') return value ? { value } : undefined;
  if (Array.isArray(value)) {
    const joined = value
      .map(entry => typeof entry === 'string' ? entry : csharpCompletionOptionalString((entry as any)?.value ?? (entry as any)?.Value))
      .filter((entry): entry is string => !!entry)
      .join('\n\n');
    return joined ? { value: joined } : undefined;
  }
  if (typeof value === 'object') {
    const record = value as Record<string, unknown>;
    const text = csharpCompletionOptionalString(record.value ?? record.Value ?? record.markdown ?? record.Markdown ?? record.contents ?? record.Contents);
    return text ? { value: text } : undefined;
  }
  return undefined;
}

function csharpCompletionStringArray(value: unknown): string[] | undefined {
  if (!Array.isArray(value)) return undefined;
  const strings = value
    .map(entry => csharpCompletionOptionalString(entry))
    .filter((entry): entry is string => !!entry);
  return strings.length > 0 ? strings : undefined;
}

function csharpCompletionTags(value: unknown): monaco.languages.CompletionItemTag[] | undefined {
  if (!Array.isArray(value)) return undefined;
  const tags = value
    .map(entry => typeof entry === 'number' ? entry : Number(entry))
    .filter((entry): entry is monaco.languages.CompletionItemTag => Number.isFinite(entry));
  return tags.length > 0 ? tags : undefined;
}

function csharpCompletionAdditionalTextEdits(
  value: unknown,
  toEditorRange: (edit: any) => monaco.IRange | undefined
): monaco.editor.ISingleEditOperation[] | undefined {
  if (!Array.isArray(value)) return undefined;
  const edits: monaco.editor.ISingleEditOperation[] = [];
  for (const edit of value) {
    const range = toEditorRange(edit);
    const text = csharpCompletionOptionalString((edit as any)?.newText ?? (edit as any)?.NewText ?? (edit as any)?.text ?? (edit as any)?.Text);
    if (!range || typeof text !== 'string') continue;
    edits.push({ range, text });
  }
  return edits.length > 0 ? edits : undefined;
}

function csharpCompletionIsPlainRange(range: any): range is monaco.IRange {
  if (!range) return false;
  return Number.isFinite(range.startLineNumber)
    && Number.isFinite(range.startColumn)
    && Number.isFinite(range.endLineNumber)
    && Number.isFinite(range.endColumn)
    && range.startLineNumber >= 1
    && range.startColumn >= 1
    && range.endLineNumber >= range.startLineNumber
    && (range.endLineNumber !== range.startLineNumber || range.endColumn >= range.startColumn);
}

function csharpCompletionIsValidRange(range: any): range is monaco.IRange | monaco.languages.CompletionItemRanges {
  if (csharpCompletionIsPlainRange(range)) return true;
  const insertRange = range?.insert ?? range?.Insert;
  const replaceRange = range?.replace ?? range?.Replace;
  return csharpCompletionIsPlainRange(insertRange) && csharpCompletionIsPlainRange(replaceRange);
}

function csharpCompletionItemInsertRange(range: monaco.IRange | monaco.languages.CompletionItemRanges | undefined): monaco.IRange | undefined {
  if (csharpCompletionIsPlainRange(range)) return range;
  const insertRange = (range as any)?.insert ?? (range as any)?.Insert;
  return csharpCompletionIsPlainRange(insertRange) ? insertRange : undefined;
}

function csharpCompletionRangeFromTextEdit(
  textEdit: any,
  defaultRange: monaco.IRange | monaco.languages.CompletionItemRanges,
  toEditorRange: (edit: any) => monaco.IRange | undefined
): monaco.IRange | monaco.languages.CompletionItemRanges {
  const insertRange = toEditorRange(textEdit?.insert ?? textEdit?.Insert);
  const replaceRange = toEditorRange(textEdit?.replace ?? textEdit?.Replace);
  if (insertRange && replaceRange) return { insert: insertRange, replace: replaceRange };

  const simpleRange = toEditorRange(textEdit);
  return simpleRange ?? defaultRange;
}

function csharpCompletionMapRangeToCurrent(
  range: monaco.IRange | monaco.languages.CompletionItemRanges,
  mapRange: (range: monaco.IRange) => monaco.IRange | undefined
): monaco.IRange | monaco.languages.CompletionItemRanges | undefined {
  if (csharpCompletionIsPlainRange(range)) return mapRange(range);
  const insert = mapRange((range as monaco.languages.CompletionItemRanges).insert);
  const replace = mapRange((range as monaco.languages.CompletionItemRanges).replace);
  return insert && replace ? { insert, replace } : undefined;
}

function csharpCompletionItemIsUsable(item: monaco.languages.CompletionItem | null): item is monaco.languages.CompletionItem {
  if (!item) return false;
  const label = csharpCompletionOptionalString(item.label);
  return !!label && typeof item.insertText === 'string' && csharpCompletionIsValidRange(item.range);
}

function csharpCompletionCharacterBefore(model: monaco.editor.ITextModel, position: monaco.Position): string | undefined {
  if (model.isDisposed()) return undefined;
  if (position.column > 1) {
    return model.getLineContent(position.lineNumber).charAt(position.column - 2) || undefined;
  }
  return undefined;
}

function csharpOmniSharpCompletionTriggerKind(context: monaco.languages.CompletionContext): 1 | 2 | 3 {
  if (context.triggerCharacter === '.') return 1;
  return context.triggerKind === monaco.languages.CompletionTriggerKind.TriggerCharacter
    ? 2
    : context.triggerKind === monaco.languages.CompletionTriggerKind.TriggerForIncompleteCompletions
      ? 3
      : 1;
}

function csharpCompletionTriggerCharacter(
  model: monaco.editor.ITextModel,
  position: monaco.Position,
  context: monaco.languages.CompletionContext,
  completionTrigger: 1 | 2 | 3
): string | undefined {
  if (completionTrigger !== 2) return undefined;

  const explicit = typeof context.triggerCharacter === 'string' && context.triggerCharacter.length > 0
    ? context.triggerCharacter
    : undefined;
  const triggerCharacter = explicit ?? csharpCompletionCharacterBefore(model, position);
  if (!triggerCharacter || triggerCharacter === '\n' || triggerCharacter === '\r') return undefined;
  return triggerCharacter.length === 1 ? triggerCharacter : undefined;
}

function csharpOmniSharpCompletionRequest(
  model: monaco.editor.ITextModel,
  position: monaco.Position,
  context: monaco.languages.CompletionContext
): any {
  const requestedTrigger = csharpOmniSharpCompletionTriggerKind(context);
  const triggerCharacter = csharpCompletionTriggerCharacter(model, position, context, requestedTrigger);
  const completionTrigger = requestedTrigger === 2 && !triggerCharacter ? 1 : requestedTrigger;
  const request: any = {
    Line: Math.max(0, position.lineNumber - 1),
    Column: Math.max(0, position.column - 1),
    CompletionTrigger: completionTrigger,
  };
  if (completionTrigger === 2 && triggerCharacter) request.TriggerCharacter = triggerCharacter;
  return request;
}

function csharpContextualCompletionCacheKey(
  model: monaco.editor.ITextModel,
  snapshot: CSharpCompletionRequestSnapshot,
  position: monaco.Position,
  context: monaco.languages.CompletionContext,
  request: any,
  projectRequest: CSharpSerializedProjectRequest,
  completionEnvironmentVersion: number
): string {
  const triggerCharacter = typeof context.triggerCharacter === 'string' ? context.triggerCharacter : '';
  const previousCharacter = csharpCompletionCharacterBefore(model, position) ?? '';
  return [
    'omnisharp-only-v4',
    model.uri.toString(),
    snapshot.modelVersionId,
    snapshot.offset,
    csharpCompletionFastHash(snapshot.code),
    request.CompletionTrigger,
    request.TriggerCharacter ?? '',
    projectRequest.fileKey,
    context.triggerKind,
    triggerCharacter,
    previousCharacter,
    completionEnvironmentVersion,
  ].join('|');
}

function csharpPredictiveCompletionCacheKey(
  modelUri: string,
  codeHash: string,
  offset: number,
  request: any,
  projectRequest: CSharpSerializedProjectRequest,
  completionEnvironmentVersion: number,
  previousCharacter: string
): string {
  return [
    'omnisharp-predictive-v1',
    modelUri,
    offset,
    codeHash,
    request.CompletionTrigger,
    request.TriggerCharacter ?? '',
    projectRequest.fileKey,
    previousCharacter,
    completionEnvironmentVersion,
  ].join('|');
}

function csharpCompletionMergeResolvedItem(
  original: monaco.languages.CompletionItem,
  converted: monaco.languages.CompletionItem | null
): monaco.languages.CompletionItem {
  if (!converted) return original;
  return {
    ...original,
    ...converted,
    label: original.label,
    kind: converted.kind ?? original.kind,
    range: original.range,
    sortText: original.sortText ?? converted.sortText,
    filterText: converted.filterText ?? original.filterText,
    preselect: original.preselect ?? converted.preselect,
    insertText: converted.insertText || original.insertText,
    insertTextRules: converted.insertTextRules ?? original.insertTextRules,
    commitCharacters: converted.commitCharacters ?? original.commitCharacters,
    documentation: converted.documentation ?? original.documentation,
    additionalTextEdits: converted.additionalTextEdits ?? original.additionalTextEdits,
    tags: converted.tags ?? original.tags,
  };
}
// CodeCraft C# OmniSharp-only completion end

class CSharpLanguageService {
  private omnisharp: OmniSharpCall | null = null;
  private lastCompletions = new Map<monaco.languages.CompletionItem, any>();
  private lastCompletionContexts = new Map<monaco.languages.CompletionItem, {
    snapshot: CSharpCompletionRequestSnapshot;
    lateContext: CSharpLateCompletionContext;
  }>();
  private completionResolveResponseCache = new WeakMap<object, Promise<unknown>>();
  private completionResolveSpeculativeKeys = new WeakMap<object, string>();
  private editor: monaco.editor.IStandaloneCodeEditor | null = null;
  private model: monaco.editor.ITextModel | null = null;
  private projectFilesProvider: CSharpProjectFilesProvider = () => [];
  private initialized = false;
  private iframeUrl: string | null = null;
  private providersRegistered = false;
  private initializationPromise: Promise<void> | null = null;
  private completionRequestSerial = 0;
  private completionStructuralVersion = 0;
  private diagnosticRequestSerial = 0;
  private completionEnvironmentVersion = 0;
  private completionWorkerStateKey: string | null = null;
  private completionCache = new Map<string, CSharpCompletionCacheEntry>();
  private predictiveCompletionCache = new Map<string, CSharpPredictiveCompletionCacheEntry>();
  private predictiveCompletionSource: CSharpPredictiveCompletionSource | null = null;
  private predictiveCompletionTimer: ReturnType<typeof setTimeout> | null = null;
  private predictiveCompletionSerial = 0;
  private predictiveCompletionPlan: CSharpPredictiveCompletionPlan | null = null;
  private predictiveCompletionLastRequest: CSharpCompletionPreloadRequestSnapshot | null = null;
  private runtimeResponseCache = new Map<string, Promise<unknown> | unknown>();
  private diagnosticCacheKey: string | null = null;
  private diagnosticCacheMarkers: monaco.editor.IMarkerData[] = [];
  private providerDisposables: monaco.IDisposable[] = [];
  private semanticCache = new WeakMap<monaco.editor.ITextModel, { versionId: number; index: CSharpSemanticIndex }>();
  private modelTextCache = new WeakMap<monaco.editor.ITextModel, CSharpModelTextSnapshot>();
  private projectRequestCache: CSharpSerializedProjectRequest | null = null;
  private projectFileHashCache = new Map<string, { content: string; hash: string; length: number }>();
  private completionDispatchTail: Promise<void> = Promise.resolve();
  private debugEnabled = false;
  private debugEvents: CSharpIdeDebugEvent[] = [];
  private debugEventSerial = 0;
  private debugListener: ((snapshot: CSharpIdeDebugSnapshot) => void) | null = null;
  private debugNotifyTimer: ReturnType<typeof setTimeout> | null = null;
  private lastDiagnosticProjectRequest: CSharpDiagnosticProjectRequest | null = null;

  private debouncedDiagnostics = debounce(this.getDiagnostics.bind(this), 100);
  private debouncedCompletions = this.rawProvideCompletionItems.bind(this);
  private debouncedResolve = this.rawResolveCompletionItem.bind(this);

  configureDebug(options: CSharpIdeDebugOptions) {
    const wasEnabled = this.debugEnabled;
    this.debugEnabled = !!options.enabled;
    this.debugListener = options.onDidChange ?? null;

    if (this.debugEnabled) {
      this.installDebugApi();
      this.recordDebugEvent({
        feature: 'debug',
        phase: wasEnabled ? 'listener-updated' : 'enabled',
        level: 'info',
        message: wasEnabled ? 'C# completion preload debug listener updated.' : 'C# completion preload debugger enabled.',
      });
    } else {
      this.removeDebugApi();
      if (wasEnabled) {
        this.recordDebugEvent({
          feature: 'debug',
          phase: 'disabled',
          level: 'info',
          message: 'C# completion preload debugger disabled.',
        }, true);
      }
      this.notifyDebugChanged();
    }
  }

  getDebugSnapshot(): CSharpIdeDebugSnapshot {
    const project = this.readProjectDebugSnapshot();
    return {
      enabled: this.debugEnabled,
      generatedAt: new Date().toISOString(),
      runtime: {
        initialized: this.initialized,
        iframeUrl: this.iframeUrl,
        hasOmniSharpBridge: !!this.omnisharp,
        providersRegistered: this.providersRegistered,
        initializationPending: !!this.initializationPromise,
      },
      activeModel: this.model ? this.summarizeModel(this.model) : null,
      project: {
        providerFileCount: project.providerFileCount,
        csharpFileCount: project.files.length,
        providerError: project.providerError,
        files: project.files,
        lastDiagnosticRequest: this.summarizeProjectRequest(this.lastDiagnosticProjectRequest),
      },
      cache: {
        completionCacheSize: this.completionCache.size,
        predictiveCompletionCacheSize: this.predictiveCompletionCache.size,
        predictiveCompletionActivePlan: !!this.predictiveCompletionPlan,
        completionEnvironmentVersion: this.completionEnvironmentVersion,
        completionWorkerStateKey: this.completionWorkerStateKey,
        diagnosticCacheKey: this.diagnosticCacheKey,
        diagnosticCacheMarkerCount: this.diagnosticCacheMarkers.length,
        activeModelSemanticCacheHit: !!(this.model && this.semanticCache.has(this.model)),
      },
      completionPreload: this.getPredictiveCompletionDebugSnapshot(),
      features: this.getDebugFeatureSnapshots(),
      events: [...this.debugEvents],
    };
  }

  clearDebugEvents() {
    this.debugEvents = [];
    this.recordDebugEvent({
      feature: 'debug',
      phase: 'cleared',
      level: 'info',
      message: 'C# completion preload debug event history cleared.',
    });
  }

  private now() {
    return typeof performance !== 'undefined' ? performance.now() : Date.now();
  }

  private recordDebugEvent(
    event: Omit<CSharpIdeDebugEvent, 'id' | 'timestamp' | 'level' | 'message'> & {
      level?: CSharpIdeDebugLevel;
      message?: string;
    },
    force = false
  ) {
    if (!this.debugEnabled && !force) return;
    const descriptor = getCSharpDebugFeatureDescriptor(event.feature, event.featureKey);
    const fullEvent: CSharpIdeDebugEvent = {
      ...event,
      id: ++this.debugEventSerial,
      timestamp: new Date().toISOString(),
      level: event.level ?? 'info',
      message: event.message ?? `${event.feature}:${event.phase}`,
      featureKey: descriptor.key,
      featureLabel: descriptor.label,
      category: descriptor.category,
    };
    this.debugEvents = [...this.debugEvents, fullEvent].slice(-CSHARP_DEBUG_EVENT_LIMIT);

    if (this.debugEnabled && typeof console !== 'undefined') {
      const log = fullEvent.level === 'error'
        ? console.error
        : fullEvent.level === 'warning'
          ? console.warn
          : console.debug;
      log.call(console, '[CodeCraft C# IDE]', fullEvent);
    }

    this.notifyDebugChanged();
  }

  private getDebugFeatureSnapshots(): CSharpIdeDebugFeatureSnapshot[] {
    const snapshots = new Map<string, CSharpIdeDebugFeatureSnapshot>();

    const ensureSnapshot = (descriptor: CSharpIdeDebugFeatureDescriptor) => {
      let snapshot = snapshots.get(descriptor.key);
      if (!snapshot) {
        snapshot = {
          key: descriptor.key,
          label: descriptor.label,
          category: descriptor.category,
          description: descriptor.description,
          eventCount: 0,
          providerCallCount: 0,
          runtimeCallCount: 0,
          successCount: 0,
          warningCount: 0,
          errorCount: 0,
          inFlightCount: 0,
          firstEventAt: null,
          lastEventAt: null,
          averageDurationMs: null,
          maxDurationMs: null,
          lastDurationMs: null,
          levels: createEmptyCSharpDebugLevelCounts(),
          phases: {},
          events: [],
        };
        snapshots.set(descriptor.key, snapshot);
      }
      return snapshot;
    };

    for (const descriptor of CSHARP_DEBUG_FEATURE_DESCRIPTORS) {
      ensureSnapshot(descriptor);
    }

    const durationSums = new Map<string, { total: number; count: number; max: number }>();
    const inFlight = new Map<string, Set<string>>();

    for (const event of this.debugEvents) {
      const descriptor = getCSharpDebugFeatureDescriptor(event.feature, event.featureKey);
      const snapshot = ensureSnapshot(descriptor);
      snapshot.eventCount += 1;
      snapshot.levels[event.level] += 1;
      snapshot.phases[event.phase] = (snapshot.phases[event.phase] ?? 0) + 1;
      snapshot.successCount = snapshot.levels.success;
      snapshot.warningCount = snapshot.levels.warning;
      snapshot.errorCount = snapshot.levels.error;
      snapshot.firstEventAt ??= event.timestamp;
      snapshot.lastEventAt = event.timestamp;
      snapshot.events = [...snapshot.events, event].slice(-CSHARP_DEBUG_FEATURE_EVENT_LIMIT);

      if (event.phase === 'provider-start') snapshot.providerCallCount += 1;
      if (event.phase === 'runtime-request') snapshot.runtimeCallCount += 1;

      if (event.callId) {
        const set = inFlight.get(descriptor.key) ?? new Set<string>();
        if (event.phase === 'provider-start' || event.phase === 'runtime-request') {
          set.add(event.callId);
        }
        if (
          event.phase === 'provider-end' ||
          event.phase === 'provider-error' ||
          event.phase === 'provider-throw' ||
          event.phase === 'runtime-response' ||
          event.phase === 'runtime-timeout'
        ) {
          set.delete(event.callId);
        }
        inFlight.set(descriptor.key, set);
      }

      if (typeof event.durationMs === 'number') {
        const current = durationSums.get(descriptor.key) ?? { total: 0, count: 0, max: 0 };
        current.total += event.durationMs;
        current.count += 1;
        current.max = Math.max(current.max, event.durationMs);
        durationSums.set(descriptor.key, current);
        snapshot.lastDurationMs = event.durationMs;
        snapshot.maxDurationMs = current.max;
        snapshot.averageDurationMs = Math.round((current.total / current.count) * 10) / 10;
      }

      if (event.model) snapshot.lastModel = event.model;
      if (event.request !== undefined) snapshot.lastRequest = event.request;
      if (event.response !== undefined) snapshot.lastResponse = event.response;
      if (event.error !== undefined) snapshot.lastError = event.error;
      if (event.environment !== undefined) snapshot.lastEnvironment = event.environment;
    }

    for (const [key, calls] of inFlight) {
      const snapshot = snapshots.get(key);
      if (snapshot) snapshot.inFlightCount = calls.size;
    }

    return [...snapshots.values()]
      .filter(snapshot => snapshot.eventCount > 0 || CSHARP_DEBUG_FEATURE_DESCRIPTORS.some(descriptor => descriptor.key === snapshot.key))
      .sort((left, right) => {
        const leftOrder = csharpDebugDescriptorByKey.get(left.key)?.order ?? 999;
        const rightOrder = csharpDebugDescriptorByKey.get(right.key)?.order ?? 999;
        return leftOrder - rightOrder || left.label.localeCompare(right.label);
      });
  }

  private notifyDebugChanged() {
    if (!this.debugListener) return;
    if (this.debugNotifyTimer) return;
    this.debugNotifyTimer = setTimeout(() => {
      this.debugNotifyTimer = null;
      this.debugListener?.(this.getDebugSnapshot());
    }, 0);
  }

  private installDebugApi() {
    const global = globalThis as any;
    global.__codecraftCSharpIdeDebug = {
      getSnapshot: () => this.getDebugSnapshot(),
      clear: () => this.clearDebugEvents(),
      service: this,
    };
  }

  private removeDebugApi() {
    const global = globalThis as any;
    if (global.__codecraftCSharpIdeDebug?.service === this) {
      delete global.__codecraftCSharpIdeDebug;
    }
  }

  private summarizeModel(model: monaco.editor.ITextModel): CSharpIdeDebugModelSummary {
    const snapshot = model.isDisposed() ? null : this.getModelTextSnapshot(model);
    const value = snapshot?.code ?? '';
    return {
      uri: model.uri.toString(),
      path: currentModelPath(model),
      language: model.getLanguageId(),
      versionId: model.getVersionId(),
      alternativeVersionId: model.getAlternativeVersionId(),
      lineCount: model.isDisposed() ? 0 : model.getLineCount(),
      length: snapshot?.length ?? value.length,
      hash: snapshot?.hash ?? hashString(value),
      disposed: model.isDisposed(),
    };
  }

  private readProjectDebugSnapshot(): {
    providerFileCount: number;
    providerError?: string;
    files: CSharpIdeDebugProjectFileSummary[];
  } {
    try {
      const providerFiles = this.projectFilesProvider();
      return {
        providerFileCount: providerFiles.length,
        files: providerFiles
          .filter(file => file.language === 'csharp')
          .map(file => {
            const path = normalizeProjectPath(file.path);
            const content = file.content ?? '';
            const matchingModel = monaco.editor.getModels()
              .find(model => model.getLanguageId() === 'csharp' && currentModelPath(model) === path);
            return {
              path,
              language: file.language,
              length: content.length,
              lines: countLines(content),
              hash: hashString(content),
              hasMonacoModel: !!matchingModel,
              modelUri: matchingModel?.uri.toString(),
              modelVersionId: matchingModel?.getVersionId(),
            };
          }),
      };
    } catch (error) {
      return {
        providerFileCount: 0,
        providerError: this.summarizeError(error),
        files: [],
      };
    }
  }

  private summarizeProjectRequest(request: CSharpDiagnosticProjectRequest | null): unknown {
    if (!request) return null;
    return {
      CurrentPath: request.CurrentPath,
      Files: request.Files.map(file => ({
        Path: file.Path,
        length: file.Content.length,
        lines: countLines(file.Content),
        hash: hashString(file.Content),
      })),
    };
  }

  private createDebugEnvironmentSnapshot(model?: monaco.editor.ITextModel | null) {
    const project = this.readProjectDebugSnapshot();
    return {
      runtime: {
        initialized: this.initialized,
        iframeUrl: this.iframeUrl,
        hasOmniSharpBridge: !!this.omnisharp,
        providersRegistered: this.providersRegistered,
        initializationPending: !!this.initializationPromise,
      },
      activeModel: this.model ? this.summarizeModel(this.model) : null,
      requestModel: model ? this.summarizeModel(model) : null,
      project: {
        providerFileCount: project.providerFileCount,
        csharpFileCount: project.files.length,
        providerError: project.providerError,
        files: project.files,
      },
      cache: {
        completionRequestSerial: this.completionRequestSerial,
        diagnosticRequestSerial: this.diagnosticRequestSerial,
        completionCacheSize: this.completionCache.size,
        predictiveCompletionCacheSize: this.predictiveCompletionCache.size,
        predictiveCompletionActivePlan: !!this.predictiveCompletionPlan,
        completionEnvironmentVersion: this.completionEnvironmentVersion,
        completionWorkerStateKey: this.completionWorkerStateKey,
        diagnosticCacheKey: this.diagnosticCacheKey,
        diagnosticCacheMarkerCount: this.diagnosticCacheMarkers.length,
        activeModelSemanticCacheHit: !!(this.model && this.semanticCache.has(this.model)),
      },
    };
  }

  private summarizePredictiveCompletionPlan(
    plan: CSharpPredictiveCompletionPlan
  ): CSharpCompletionPreloadPlanSnapshot {
    return {
      key: plan.key,
      completionListKey: plan.completionListKey,
      candidate: plan.candidate,
      prefix: plan.prefix,
      assumedText: `${plan.candidate}.`,
      codeHash: plan.codeHash,
      offset: plan.offset,
      line: typeof plan.request?.Line === 'number' ? plan.request.Line + 1 : 0,
      column: typeof plan.request?.Column === 'number' ? plan.request.Column + 1 : 0,
      completionTrigger: plan.request?.CompletionTrigger,
      projectCurrentPath: plan.projectRequest.currentPath,
      projectFileKey: plan.projectRequest.fileKey,
      projectFileCount: plan.projectRequest.request.Files.length,
    };
  }

  private summarizePredictiveCompletionSource(): CSharpCompletionPreloadSourceSnapshot | null {
    const source = this.predictiveCompletionSource;
    if (!source) return null;
    const sourceModel = monaco.editor.getModels().find(model => model.uri.toString() === source.modelUri);
    const candidateSample = source.suggestions
      .map(item => this.predictiveCompletionCandidateText(item))
      .filter((candidate): candidate is string => !!candidate)
      .slice(0, 8);
    return {
      modelUri: source.modelUri,
      modelPath: sourceModel ? currentModelPath(sourceModel) : source.modelUri,
      projectFileKey: source.projectFileKey,
      environmentVersion: source.environmentVersion,
      suggestionCount: source.suggestions.length,
      candidateSample,
    };
  }

  private predictiveCompletionStatusText(
    status: CSharpCompletionPreloadStatus,
    plan: CSharpCompletionPreloadPlanSnapshot,
    details?: {
      itemCount?: number;
      durationMs?: number;
      cacheAgeMs?: number;
      reason?: string;
    }
  ) {
    if (status === 'scheduled') {
      return `Scheduled preload for '${plan.assumedText}' from prefix '${plan.prefix}'.`;
    }
    if (status === 'running') {
      return `Loading member completions for '${plan.assumedText}'.`;
    }
    if (status === 'cached') {
      return `Preload ready for '${plan.assumedText}' with ${details?.itemCount ?? 0} items.`;
    }
    if (status === 'served') {
      return `Served ${details?.itemCount ?? 0} preloaded items for '${plan.assumedText}'${typeof details?.cacheAgeMs === 'number' ? ` after ${details.cacheAgeMs}ms in cache` : ''}.`;
    }
    if (status === 'empty') {
      return `Preload for '${plan.assumedText}' returned no completion items.`;
    }
    if (status === 'stale') {
      return details?.reason ?? `Preload for '${plan.assumedText}' finished after a newer preload replaced it.`;
    }
    if (status === 'invalidated') {
      return details?.reason ?? `Preload for '${plan.assumedText}' was invalidated before it could be used.`;
    }
    if (status === 'failed') {
      return details?.reason ?? `Preload for '${plan.assumedText}' failed.`;
    }
    return 'No completion preload request has been recorded yet.';
  }

  private setPredictiveCompletionLastRequest(
    plan: CSharpPredictiveCompletionPlan,
    serial: number,
    status: CSharpCompletionPreloadStatus,
    details: Partial<CSharpCompletionPreloadRequestSnapshot> = {}
  ) {
    const planSnapshot = this.summarizePredictiveCompletionPlan(plan);
    const previous = this.predictiveCompletionLastRequest;
    const startedAt = details.startedAt ?? (
      previous?.key === plan.key && previous.serial === serial ? previous.startedAt : undefined
    );
    const scheduledAt = details.scheduledAt ?? (
      previous?.key === plan.key && previous.serial === serial ? previous.scheduledAt : undefined
    );
    const next: CSharpCompletionPreloadRequestSnapshot = {
      ...planSnapshot,
      status,
      statusText: details.statusText ?? this.predictiveCompletionStatusText(status, planSnapshot, details),
      serial,
      callId: details.callId ?? `completion.predictive-${serial}`,
      scheduledAt,
      startedAt,
      finishedAt: details.finishedAt,
      invalidatedAt: details.invalidatedAt,
      durationMs: details.durationMs,
      itemCount: details.itemCount,
      cached: details.cached,
      cacheKey: details.cacheKey,
      cacheAgeMs: details.cacheAgeMs,
      reason: details.reason,
      error: details.error,
    };
    this.predictiveCompletionLastRequest = next;
    this.notifyDebugChanged();
  }

  private invalidatePredictiveCompletionLastRequest(reason: string) {
    const lastRequest = this.predictiveCompletionLastRequest;
    if (!lastRequest || !['scheduled', 'running', 'cached'].includes(lastRequest.status)) return;
    const invalidatedAt = new Date().toISOString();
    this.predictiveCompletionLastRequest = {
      ...lastRequest,
      status: 'invalidated',
      statusText: reason,
      invalidatedAt,
      reason,
    };
    this.notifyDebugChanged();
  }

  private markPredictiveCompletionServed(
    key: string,
    itemCount: number,
    cacheAgeMs: number,
    cacheKey: string
  ) {
    const lastRequest = this.predictiveCompletionLastRequest;
    if (!lastRequest || lastRequest.key !== key) return;
    this.predictiveCompletionLastRequest = {
      ...lastRequest,
      status: 'served',
      statusText: this.predictiveCompletionStatusText('served', lastRequest, { itemCount, cacheAgeMs }),
      finishedAt: new Date().toISOString(),
      itemCount,
      cacheAgeMs,
      cacheKey,
      cached: true,
    };
    this.notifyDebugChanged();
  }

  private getPredictiveCompletionDebugSnapshot(): CSharpCompletionPreloadDebugSnapshot {
    const activePlan = this.predictiveCompletionPlan
      ? this.summarizePredictiveCompletionPlan(this.predictiveCompletionPlan)
      : null;
    const cacheEntries = [...this.predictiveCompletionCache.entries()].map(([key, entry]) => ({
      key,
      completionListKey: entry.completionListKey,
      codeHash: entry.codeHash,
      offset: entry.offset,
      itemCount: entry.itemCount,
      ageMs: Date.now() - entry.createdAt,
    }));
    const lastRequest = this.predictiveCompletionLastRequest;
    const state: CSharpCompletionPreloadStatus = lastRequest?.status
      ?? (this.predictiveCompletionTimer ? 'scheduled' : activePlan ? 'running' : cacheEntries.length ? 'cached' : 'idle');
    const summary = lastRequest?.statusText
      ?? (cacheEntries.length
        ? `No active preload. ${cacheEntries.length} cached preload result${cacheEntries.length === 1 ? '' : 's'} available.`
        : 'No completion preload request has been recorded yet.');
    return {
      state,
      summary,
      serial: this.predictiveCompletionSerial,
      delayMs: CSHARP_PREDICTIVE_COMPLETION_DELAY_MS,
      cacheLimit: CSHARP_PREDICTIVE_COMPLETION_CACHE_LIMIT,
      timerPending: !!this.predictiveCompletionTimer,
      activePlan,
      source: this.summarizePredictiveCompletionSource(),
      cacheEntries,
      lastRequest,
    };
  }

  private summarizeError(error: unknown) {
    if (error instanceof Error) {
      return `${error.name}: ${error.message}`;
    }
    return String(error);
  }

  private summarizeValue(value: unknown, depth = 0): unknown {
    if (value == null || typeof value === 'number' || typeof value === 'boolean') return value;
    if (typeof value === 'string') {
      if (value.length <= 160 && !/[\r\n]/.test(value)) return value;
      return {
        type: 'string',
        length: value.length,
        lines: countLines(value),
        hash: hashString(value),
        preview: value.slice(0, 160),
      };
    }
    if (Array.isArray(value)) {
      return {
        type: 'array',
        length: value.length,
        sample: depth >= 2 ? undefined : value.slice(0, 5).map(item => this.summarizeValue(item, depth + 1)),
      };
    }
    if (typeof value === 'object') {
      if (value instanceof monaco.Range) {
        return {
          startLineNumber: value.startLineNumber,
          startColumn: value.startColumn,
          endLineNumber: value.endLineNumber,
          endColumn: value.endColumn,
        };
      }
      const record = value as Record<string, unknown>;
      const result: Record<string, unknown> = {};
      for (const [key, item] of Object.entries(record).slice(0, 24)) {
        result[key] = depth >= 2 ? summarizePrimitive(item) : this.summarizeValue(item, depth + 1);
      }
      return result;
    }
    return typeof value;
  }

  private summarizeProviderResult(value: unknown): unknown {
    const result = value as any;
    if (!result) return result;
    if (Array.isArray(result)) {
      return {
        type: 'array',
        length: result.length,
        sample: result.slice(0, 8).map(item => this.summarizeValue(item, 1)),
      };
    }
    if (result.suggestions) {
      return {
        suggestions: result.suggestions.length,
        incomplete: !!result.incomplete,
        labels: result.suggestions.slice(0, 12).map((item: monaco.languages.CompletionItem) => (
          typeof item.label === 'string' ? item.label : item.label?.label
        )),
        kinds: result.suggestions.slice(0, 12).map((item: monaco.languages.CompletionItem) => item.kind),
      };
    }
    if (result.actions) {
      return {
        actions: result.actions.length,
        titles: result.actions.slice(0, 12).map((action: monaco.languages.CodeAction) => action.title),
        kinds: result.actions.slice(0, 12).map((action: monaco.languages.CodeAction) => action.kind),
      };
    }
    if (result.hints) {
      return {
        hints: result.hints.length,
        labels: result.hints.slice(0, 12).map((hint: monaco.languages.InlayHint) => hint.label),
      };
    }
    if (result.edits) {
      return {
        edits: result.edits.length,
        rejectReason: result.rejectReason,
        resources: result.edits.slice(0, 12).map((edit: monaco.languages.IWorkspaceTextEdit) => edit.resource?.toString()),
      };
    }
    if (result.value?.signatures) {
      return {
        signatures: result.value.signatures.length,
        activeSignature: result.value.activeSignature,
        activeParameter: result.value.activeParameter,
        labels: result.value.signatures.slice(0, 8).map((signature: monaco.languages.SignatureInformation) => signature.label),
      };
    }
    if (result.contents) {
      return {
        contents: result.contents.length,
        markdownPreview: result.contents
          .map((content: monaco.IMarkdownString | { value?: string }) => content?.value)
          .filter(Boolean)
          .join('\n')
          .slice(0, 500),
      };
    }
    if (result.data instanceof Uint32Array) return { semanticTokenIntegers: result.data.length };
    return this.summarizeValue(result);
  }

  private summarizeOmniSharpResponse(response: unknown): unknown {
    const result = response as any;
    if (!result) return result;
    if (Array.isArray(result)) return { type: 'array', length: result.length, sample: result.slice(0, 3).map(item => this.summarizeValue(item, 1)) };
    if (typeof result === 'object') {
      return {
        keys: Object.keys(result).slice(0, 16),
        items: Array.isArray(result.items) ? result.items.length : undefined,
        itemLabels: Array.isArray(result.items)
          ? result.items.slice(0, 12).map((item: any) => item?.label ?? item?.insertText ?? item?.textEdit?.newText ?? item?.textEdit?.NewText)
          : undefined,
        signatures: Array.isArray(result.signatures) ? result.signatures.length : undefined,
        signatureLabels: Array.isArray(result.signatures)
          ? result.signatures.slice(0, 8).map((signature: any) => signature?.label)
          : undefined,
        edits: Array.isArray(result.edits) ? result.edits.length : undefined,
        editRanges: Array.isArray(result.edits)
          ? result.edits.slice(0, 8).map((edit: any) => this.summarizeValue(edit?.range ?? edit?.Range, 1))
          : undefined,
        markdownLength: typeof result.markdown === 'string' ? result.markdown.length : undefined,
        markdownPreview: typeof result.markdown === 'string' ? result.markdown.slice(0, 500) : undefined,
        rejectReason: result.rejectReason,
        value: this.summarizeValue(result, 1),
      };
    }
    return this.summarizeValue(result);
  }

  private debugProviderCall<T>(
    feature: string,
    model: monaco.editor.ITextModel | null | undefined,
    request: unknown,
    callback: () => T
  ): T {
    if (!this.debugEnabled) return callback();
    const started = this.now();
    const callId = `${feature}:${this.debugEventSerial + 1}:${Math.random().toString(36).slice(2, 8)}`;
    this.recordDebugEvent({
      feature,
      phase: 'provider-start',
      level: 'info',
      message: `${feature} provider started.`,
      callId,
      model: model ? this.summarizeModel(model) : undefined,
      request: this.summarizeValue(request),
      environment: this.createDebugEnvironmentSnapshot(model),
    });

    try {
      const result = callback();
      if (result && typeof (result as any).then === 'function') {
        (result as Promise<unknown>).then(
          response => this.recordDebugEvent({
            feature,
            phase: 'provider-end',
            level: 'success',
            message: `${feature} provider resolved.`,
            callId,
            durationMs: Math.round((this.now() - started) * 10) / 10,
            response: this.summarizeProviderResult(response),
            environment: this.createDebugEnvironmentSnapshot(model),
          }),
          error => this.recordDebugEvent({
            feature,
            phase: 'provider-error',
            level: 'error',
            message: `${feature} provider rejected.`,
            callId,
            durationMs: Math.round((this.now() - started) * 10) / 10,
            error: this.summarizeError(error),
            environment: this.createDebugEnvironmentSnapshot(model),
          })
        );
      } else {
        this.recordDebugEvent({
          feature,
          phase: 'provider-end',
          level: 'success',
          message: `${feature} provider returned synchronously.`,
          callId,
          durationMs: Math.round((this.now() - started) * 10) / 10,
          response: this.summarizeProviderResult(result),
          environment: this.createDebugEnvironmentSnapshot(model),
        });
      }
      return result;
    } catch (error) {
      this.recordDebugEvent({
        feature,
        phase: 'provider-throw',
        level: 'error',
        message: `${feature} provider threw.`,
        callId,
        durationMs: Math.round((this.now() - started) * 10) / 10,
        error: this.summarizeError(error),
        environment: this.createDebugEnvironmentSnapshot(model),
      });
      throw error;
    }
  }

  async initialize(iframeUrl = CSHARP_OMNISHARP_URLS.local) {
    this.ensureProvidersRegistered();
    const nextIframeUrl = iframeUrl.trim() || CSHARP_OMNISHARP_URLS.local;
    if (this.initialized && this.iframeUrl === nextIframeUrl && this.omnisharp) return;
    if (this.initializationPromise && this.iframeUrl === nextIframeUrl) {
      return this.initializationPromise;
    }

    const initPromise = this.initializeRuntime(nextIframeUrl);
    this.initializationPromise = initPromise;
    try {
      await initPromise;
    } finally {
      if (this.initializationPromise === initPromise) {
        this.initializationPromise = null;
      }
    }
  }

  private async initializeRuntime(nextIframeUrl: string) {
    if (this.initialized && this.iframeUrl !== nextIframeUrl) {
      this.disposeOmniSharpRuntime();
    }

    this.initialized = true;
    this.iframeUrl = nextIframeUrl;
    this.clearCompletionState();

    try {
      let iframe = document.getElementById(iframeId) as HTMLIFrameElement | null;
      if (iframe && iframe.src !== new URL(nextIframeUrl, window.location.href).href) {
        iframe.remove();
        iframe = null;
      }

      if (!iframe) {
        const initPromise = new Promise<void>(res => {
          const listener = (event: MessageEvent) => {
            if (event.data?.omnisharpInitialized) {
              res();
              window.removeEventListener('message', listener);
            }
          };
          window.addEventListener('message', listener);
        });

        iframe = document.createElement('iframe');
        iframe.id = iframeId;
        iframe.width = '0';
        iframe.height = '0';
        iframe.style.display = 'none';
        iframe.setAttribute('credentialless', '');
        iframe.src = nextIframeUrl;
        iframe.title = 'OmniSharp';
        document.body.appendChild(iframe);

        await new Promise<void>((res, rej) => {
          iframe!.onload = () => res();
          iframe!.onerror = () => rej(new Error('OmniSharp iframe failed to load'));
        });

        await initPromise;
      }

      const iframeRef = iframe;
      this.omnisharp = (method: string, ...args: unknown[]) => {
        if (!iframeRef.contentWindow) return Promise.resolve(false);
        const started = this.now();
        const callId = `${method}:${this.debugEventSerial + 1}:${Math.random().toString(36).slice(2, 8)}`;
        this.recordDebugEvent({
          feature: method,
          phase: 'runtime-request',
          level: 'info',
          message: `${method} request posted to OmniSharp.`,
          callId,
          request: {
            iframeUrl: this.iframeUrl,
            args: args.map(arg => this.summarizeValue(arg)),
          },
          environment: this.createDebugEnvironmentSnapshot(this.model),
        });

        return new Promise(res => {
          const id = Math.random().toString(36).slice(2) + Math.random().toString(36).slice(2);
          let handled = false;
          const handleMessage = (event: MessageEvent) => {
            if (event.data?.omnisharp?.id === id && !handled) {
              handled = true;
              window.removeEventListener('message', handleMessage);
              const payload = event.data.omnisharp.payload;
              this.recordDebugEvent({
                feature: method,
                phase: 'runtime-response',
                level: payload === false ? 'warning' : 'success',
                message: payload === false
                  ? `${method} returned a false payload.`
                  : `${method} returned from OmniSharp.`,
                callId,
                durationMs: Math.round((this.now() - started) * 10) / 10,
                response: this.summarizeOmniSharpResponse(payload),
                environment: this.createDebugEnvironmentSnapshot(this.model),
              });
              res(payload);
            }
          };
          setTimeout(() => {
            if (!handled) {
              handled = true;
              window.removeEventListener('message', handleMessage);
              this.recordDebugEvent({
                feature: method,
                phase: 'runtime-timeout',
                level: 'error',
                message: `${method} timed out waiting for OmniSharp.`,
                callId,
                durationMs: Math.round((this.now() - started) * 10) / 10,
                environment: this.createDebugEnvironmentSnapshot(this.model),
              });
              res(false);
            }
          }, 10000);
          window.addEventListener('message', handleMessage);
          iframeRef.contentWindow!.postMessage({ omnisharp: { method, args, id } }, '*');
        });
      };

      this.ensureProvidersRegistered();
    } catch (error) {
      this.disposeOmniSharpRuntime();
      throw error;
    }
  }

  ensureProvidersRegistered() {
    if (this.providersRegistered) return;
    this.registerProviders();
    this.providersRegistered = true;
  }

  private disposeOmniSharpRuntime() {
    this.recordDebugEvent({
      feature: 'lifecycle',
      phase: 'dispose-runtime',
      level: 'warning',
      message: 'OmniSharp runtime disposed.',
      request: { iframeUrl: this.iframeUrl },
    });
    document.getElementById(iframeId)?.remove();
    this.omnisharp = null;
    this.initialized = false;
    this.iframeUrl = null;
    this.clearCompletionState();
  }

  private clearCompletionState(options?: {
    structural?: boolean;
    preserveEnvironment?: boolean;
    preserveResultCaches?: boolean;
  }) {
    this.completionRequestSerial += 1;
    if (options?.structural !== false) {
      this.completionStructuralVersion += 1;
    }
    if (!options?.preserveEnvironment) {
      this.completionEnvironmentVersion += 1;
    }
    this.completionWorkerStateKey = null;
    this.lastCompletions.clear();
    this.lastCompletionContexts.clear();
    if (!options?.preserveResultCaches) {
      this.completionCache.clear();
      this.clearPredictiveCompletionState(true);
      this.runtimeResponseCache.clear();
    }
    this.diagnosticCacheKey = null;
    this.recordDebugEvent({
      feature: 'cache',
      phase: 'clear',
      level: 'info',
      message: 'C# completion and diagnostic caches cleared.',
      request: {
        completionEnvironmentVersion: this.completionEnvironmentVersion,
        completionRequestSerial: this.completionRequestSerial,
        completionStructuralVersion: this.completionStructuralVersion,
      },
    });
  }

  private clearPredictiveCompletionState(clearCache: boolean) {
    this.predictiveCompletionSerial += 1;
    if (this.predictiveCompletionTimer) {
      clearTimeout(this.predictiveCompletionTimer);
      this.predictiveCompletionTimer = null;
    }
    this.invalidatePredictiveCompletionLastRequest(clearCache
      ? 'Preload invalidated because completion result caches were cleared.'
      : 'Preload invalidated because the current editor state no longer matches a preload plan.');
    this.predictiveCompletionPlan = null;
    this.predictiveCompletionSource = null;
    if (clearCache) {
      this.predictiveCompletionCache.clear();
    }
  }

  private cacheCompletionResult(key: string, entry: CSharpCompletionCacheEntry) {
    if (!entry.suggestions.length) return;
    this.completionCache.set(key, entry);
    while (this.completionCache.size > CSHARP_COMPLETION_CACHE_LIMIT) {
      const oldestKey = this.completionCache.keys().next().value;
      if (!oldestKey) break;
      this.completionCache.delete(oldestKey);
    }
  }

  private cachePredictiveCompletionResult(key: string, entry: CSharpPredictiveCompletionCacheEntry) {
    if (!entry.itemCount) return;
    this.predictiveCompletionCache.set(key, entry);
    while (this.predictiveCompletionCache.size > CSHARP_PREDICTIVE_COMPLETION_CACHE_LIMIT) {
      const oldestKey = this.predictiveCompletionCache.keys().next().value;
      if (!oldestKey) break;
      this.predictiveCompletionCache.delete(oldestKey);
    }
  }

  private toCompletionList(entry: CSharpCompletionCacheEntry): monaco.languages.CompletionList {
    this.lastCompletions.clear();
    this.lastCompletionContexts.clear();
    const suggestions = entry.suggestions.map(item => ({
      ...item,
      additionalTextEdits: item.additionalTextEdits?.map(edit => ({ ...edit })),
    }));
    suggestions.forEach((item, index) => {
      const lspItem = entry.lspItems[index];
      if (lspItem) this.lastCompletions.set(item, lspItem);
      if (entry.completionSnapshot && entry.lateContext) {
        this.lastCompletionContexts.set(item, {
          snapshot: entry.completionSnapshot,
          lateContext: entry.lateContext,
        });
      }
    });
    return { suggestions, incomplete: entry.incomplete };
  }

  private emptyCompletionList(): monaco.languages.CompletionList {
    this.lastCompletions.clear();
    this.lastCompletionContexts.clear();
    return { suggestions: [] };
  }

  private getModelTextSnapshot(model: monaco.editor.ITextModel): CSharpModelTextSnapshot {
    const modelVersionId = model.getVersionId();
    const alternativeVersionId = model.getAlternativeVersionId();
    const cached = this.modelTextCache.get(model);
    if (
      cached &&
      cached.modelVersionId === modelVersionId &&
      cached.alternativeVersionId === alternativeVersionId
    ) {
      return cached;
    }

    const code = model.getValue();
    const snapshot: CSharpModelTextSnapshot = {
      code,
      modelVersionId,
      alternativeVersionId,
      length: code.length,
      hash: hashString(code),
      uri: model.uri.toString(),
    };
    this.modelTextCache.set(model, snapshot);
    return snapshot;
  }

  private clearModelRuntimeState(model: monaco.editor.ITextModel) {
    this.modelTextCache.delete(model);
    this.semanticCache.delete(model);
    this.projectRequestCache = null;
    this.runtimeResponseCache.clear();
  }

  private cacheRuntimeResponse(key: string, value: Promise<unknown> | unknown) {
    this.runtimeResponseCache.set(key, value);
    while (this.runtimeResponseCache.size > CSHARP_RUNTIME_RESPONSE_CACHE_LIMIT) {
      const oldestKey = this.runtimeResponseCache.keys().next().value;
      if (!oldestKey) break;
      this.runtimeResponseCache.delete(oldestKey);
    }
  }

  private async cachedOmniSharpModelCall(
    method: string,
    model: monaco.editor.ITextModel,
    snapshot: CSharpModelTextSnapshot,
    cacheParts: unknown[],
    ...args: unknown[]
  ): Promise<unknown> {
    if (!this.omnisharp) return false;
    const environmentVersion = this.completionEnvironmentVersion;
    const key = [
      environmentVersion,
      method,
      snapshot.uri,
      snapshot.modelVersionId,
      snapshot.length,
      snapshot.hash,
      ...cacheParts.map(part => stableCacheKey(part)),
    ].join(':');

    const cached = this.runtimeResponseCache.get(key);
    if (cached) return cached;

    const promise = this.omnisharp(method, snapshot.code, ...args).then(response => {
      if (response === false || this.completionEnvironmentVersion !== environmentVersion) {
        this.runtimeResponseCache.delete(key);
      } else {
        this.cacheRuntimeResponse(key, response);
      }
      return response;
    }, error => {
      this.runtimeResponseCache.delete(key);
      throw error;
    });
    this.cacheRuntimeResponse(key, promise);
    return promise;
  }

  private completionCacheKey(
    model: monaco.editor.ITextModel,
    position: monaco.Position,
    context: monaco.languages.CompletionContext
  ) {
    const triggerCharacter = context.triggerCharacter ?? '';
    return [
      this.completionEnvironmentVersion,
      model.uri.toString(),
      model.getVersionId(),
      position.lineNumber,
      position.column,
      context.triggerKind,
      triggerCharacter,
    ].join(':');
  }

  private createCompletionSnapshot(
    model: monaco.editor.ITextModel,
    position: monaco.Position
  ): CSharpCompletionRequestSnapshot {
    const snapshot = this.getModelTextSnapshot(model);
    return {
      code: snapshot.code,
      modelVersionId: snapshot.modelVersionId,
      offset: model.getOffsetAt(position),
      structuralVersion: this.completionStructuralVersion,
    };
  }

  private getCompletionFilterRangeAtPosition(
    model: monaco.editor.ITextModel,
    position: monaco.Position
  ): monaco.Range {
    const line = model.getLineContent(position.lineNumber);
    const endIndex = Math.max(0, Math.min(line.length, position.column - 1));
    let startIndex = endIndex;

    while (startIndex > 0) {
      const previous = retreatCodePoint(line, startIndex);
      if (previous < 0 || !isIdentifierPart(line, previous)) break;
      startIndex = previous;
    }

    if (startIndex > 0 && line[startIndex - 1] === '@') {
      startIndex -= 1;
    }

    return new monaco.Range(position.lineNumber, startIndex + 1, position.lineNumber, endIndex + 1);
  }

  private getLateCompletionContext(
    model: monaco.editor.ITextModel,
    snapshot: CSharpCompletionRequestSnapshot
  ): CSharpLateCompletionContext | null {
    if (
      model.isDisposed() ||
      model.getLanguageId() !== 'csharp' ||
      snapshot.structuralVersion !== this.completionStructuralVersion
    ) {
      return null;
    }

    const currentCode = this.getModelTextSnapshot(model).code;
    if (currentCode.length <= snapshot.code.length) return null;

    const insertedLength = currentCode.length - snapshot.code.length;
    const before = snapshot.code.slice(0, snapshot.offset);
    const after = snapshot.code.slice(snapshot.offset);
    if (
      !currentCode.startsWith(before) ||
      !currentCode.endsWith(after)
    ) {
      return null;
    }

    const currentPosition = model.getPositionAt(snapshot.offset + insertedLength);
    if (!this.isEditorAtPosition(model, currentPosition)) return null;

    const filterRange = this.getCompletionFilterRangeAtPosition(model, currentPosition);
    const filterStartOffset = model.getOffsetAt({
      lineNumber: filterRange.startLineNumber,
      column: filterRange.startColumn,
    });
    const filterText = model.getValueInRange(filterRange);
    if (
      filterStartOffset > snapshot.offset ||
      !isValidCSharpCompletionFilterPrefix(filterText)
    ) {
      return null;
    }

    return { insertedLength, filterRange };
  }

  private isEditorAtPosition(model: monaco.editor.ITextModel, position: monaco.Position) {
    if (!this.editor || this.editor.getModel() !== model) return false;
    const editorPosition = this.editor.getPosition();
    if (!editorPosition || !positionsEqual(editorPosition, position)) return false;

    const selections = this.editor.getSelections();
    if (!selections || selections.length !== 1) return false;
    const selection = selections[0];
    return (
      selection.startLineNumber === position.lineNumber &&
      selection.startColumn === position.column &&
      selection.endLineNumber === position.lineNumber &&
      selection.endColumn === position.column
    );
  }

  private shouldDispatchCompletionRequest(
    model: monaco.editor.ITextModel,
    snapshot: CSharpCompletionRequestSnapshot,
    requestSerial: number
  ) {
    if (!this.omnisharp || model.isDisposed() || requestSerial !== this.completionRequestSerial) return false;
    if (model.getVersionId() === snapshot.modelVersionId) return true;
    return !!this.getLateCompletionContext(model, snapshot);
  }

  private enqueueCompletionRuntimeCall(
    model: monaco.editor.ITextModel,
    snapshot: CSharpCompletionRequestSnapshot,
    request: unknown,
    projectRequest: CSharpSerializedProjectRequest,
    requestSerial: number,
    callId: string
  ): Promise<unknown | typeof CSHARP_STALE_COMPLETION_RESPONSE> {
    const run = this.completionDispatchTail.then(async () => {
      if (!this.shouldDispatchCompletionRequest(model, snapshot, requestSerial)) {
        this.recordDebugEvent({
          feature: 'completion',
          phase: 'skip-stale-before-runtime',
          level: 'warning',
          callId,
          message: 'C# completion request skipped before OmniSharp because a newer editor state superseded it.',
          request: {
            requestSerial,
            currentCompletionRequestSerial: this.completionRequestSerial,
            snapshotModelVersionId: snapshot.modelVersionId,
            modelVersionId: model.isDisposed() ? null : model.getVersionId(),
          },
        });
        return CSHARP_STALE_COMPLETION_RESPONSE;
      }

      return this.omnisharp!('GetCompletionAsync', snapshot.code, request, projectRequest.serialized);
    });

    this.completionDispatchTail = run.then(() => undefined, () => undefined);
    return run;
  }

  private async ensureLocalOmniSharpRuntime() {
    if (!this.omnisharp || this.iframeUrl !== CSHARP_OMNISHARP_URLS.local) {
      await this.initialize(CSHARP_OMNISHARP_URLS.local);
    }
    return !!this.omnisharp && this.iframeUrl === CSHARP_OMNISHARP_URLS.local;
  }

  private async ensureOmniSharpRuntime() {
    if (!this.omnisharp || !this.iframeUrl) {
      await this.initialize(getCSharpOmniSharpUrl(_csharpReadySource));
    }
    return !!this.omnisharp;
  }

  private registerProviders() {
    this.providerDisposables.push(
      monaco.languages.registerCompletionItemProvider('csharp', {
        triggerCharacters: CSHARP_CONTEXTUAL_COMPLETION_TRIGGER_CHARACTERS,
        resolveCompletionItem: item => this.debugProviderCall('completion.resolve', null, { label: item.label }, () => this.debouncedResolve(item)),
        provideCompletionItems: (model, position, context) => this.debugProviderCall('completion', model, {
          position,
          triggerKind: context.triggerKind,
          triggerCharacter: context.triggerCharacter,
        }, () => this.debouncedCompletions(model, position, context)),
      }),
      monaco.languages.registerSignatureHelpProvider('csharp', {
        signatureHelpTriggerCharacters: ['(', ','],
        signatureHelpRetriggerCharacters: [')'],
        provideSignatureHelp: (model, position) => this.debugProviderCall('signatureHelp', model, { position }, () => this.provideSignatureHelp(model, position)),
      }),
      monaco.languages.registerHoverProvider('csharp', {
        provideHover: (model, position, cancellationToken) => this.debugProviderCall('hover', model, {
          position,
          cancellationRequested: cancellationToken.isCancellationRequested,
        }, () => this.provideHover(model, position, cancellationToken)),
      }),
      monaco.languages.registerDocumentSemanticTokensProvider('csharp', {
        getLegend: () => CSHARP_SEMANTIC_LEGEND,
        provideDocumentSemanticTokens: (model, _lastResultId, cancellationToken) => {
          if (cancellationToken.isCancellationRequested || model.isDisposed()) return null;
          return this.debugProviderCall('semanticTokens', model, {
            cancellationRequested: cancellationToken.isCancellationRequested,
          }, () => this.provideDocumentSemanticTokens(model, cancellationToken));
        },
        releaseDocumentSemanticTokens() {},
      }),
      monaco.languages.registerDefinitionProvider('csharp', {
        provideDefinition: (model, position) => this.debugProviderCall('definition', model, { position }, () => this.provideDefinition(model, position)),
      }),
      monaco.languages.registerReferenceProvider('csharp', {
        provideReferences: (model, position, context) => this.debugProviderCall('references', model, {
          position,
          includeDeclaration: context.includeDeclaration,
        }, () => this.provideReferences(model, position, context)),
      }),
      monaco.languages.registerDocumentHighlightProvider('csharp', {
        provideDocumentHighlights: (model, position) => this.debugProviderCall('documentHighlights', model, { position }, () => this.provideDocumentHighlights(model, position)),
      }),
      monaco.languages.registerDocumentSymbolProvider('csharp', {
        provideDocumentSymbols: model => this.debugProviderCall('documentSymbols', model, {}, () => this.provideDocumentSymbols(model)),
      }),
      monaco.languages.registerRenameProvider('csharp', {
        resolveRenameLocation: (model, position) => this.debugProviderCall('rename.resolve', model, { position }, () => this.resolveRenameLocation(model, position)),
        provideRenameEdits: (model, position, newName) => this.debugProviderCall('rename.edits', model, {
          position,
          newName,
        }, () => this.provideRenameEdits(model, position, newName)),
      }),
      monaco.languages.registerCodeActionProvider('csharp', {
        provideCodeActions: (model, range, context) => this.debugProviderCall('codeActions', model, {
          range,
          markerCount: context.markers.length,
          only: context.only,
        }, () => this.provideCodeActions(model, range, context)),
      }, {
        providedCodeActionKinds: [
          'quickfix',
          'refactor',
          'source',
        ],
      }),
      monaco.languages.registerFoldingRangeProvider('csharp', {
        provideFoldingRanges: model => this.debugProviderCall('foldingRanges', model, {}, () => this.provideFoldingRanges(model)),
      }),
      monaco.languages.registerDocumentFormattingEditProvider('csharp', {
        provideDocumentFormattingEdits: (model, options) => this.debugProviderCall('formatDocument', model, options, () => this.provideDocumentFormattingEdits(model, options)),
      }),
      monaco.languages.registerDocumentRangeFormattingEditProvider('csharp', {
        provideDocumentRangeFormattingEdits: (model, range, options) => this.debugProviderCall('formatRange', model, {
          range,
          options,
        }, () => this.provideDocumentRangeFormattingEdits(model, range, options)),
      }),
      monaco.languages.registerOnTypeFormattingEditProvider('csharp', {
        autoFormatTriggerCharacters: [';', '}', '\n'],
        provideOnTypeFormattingEdits: (model, position, ch, options) => this.debugProviderCall('formatOnType', model, {
          position,
          ch,
          options,
        }, () => this.provideOnTypeFormattingEdits(model, position, ch, options)),
      }),
      monaco.languages.registerInlayHintsProvider('csharp', {
        provideInlayHints: (model, range) => this.debugProviderCall('inlayHints', model, { range }, () => this.provideInlayHints(model, range)),
      }),
      monaco.languages.registerSelectionRangeProvider('csharp', {
        provideSelectionRanges: (model, positions) => this.debugProviderCall('selectionRanges', model, { positions }, () => this.provideSelectionRanges(model, positions)),
      })
    );
  }

  private editorChangeListener: monaco.IDisposable | null = null;
  private modelChangeListener: monaco.IDisposable | null = null;

  setupEditor(editor: monaco.editor.IStandaloneCodeEditor, projectFilesProvider?: CSharpProjectFilesProvider) {
    this.ensureProvidersRegistered();
    editor.updateOptions({
      quickSuggestions: {
        other: false,
        comments: false,
        strings: false,
      },
      wordBasedSuggestions: 'off',
      suggest: {
        showWords: false,
      },
    });
    if (projectFilesProvider) {
      this.projectFilesProvider = projectFilesProvider;
    }
    this.recordDebugEvent({
      feature: 'lifecycle',
      phase: 'setup-editor',
      level: 'info',
      message: 'C# language service bound to editor.',
      model: editor.getModel() ? this.summarizeModel(editor.getModel()!) : undefined,
      request: {
        hasProjectFilesProvider: !!projectFilesProvider,
      },
    });
    this.setupDiagnostics(editor);
  }

  clearEditor() {
    this.recordDebugEvent({
      feature: 'lifecycle',
      phase: 'clear-editor',
      level: 'warning',
      message: 'C# language service editor binding cleared.',
      model: this.model ? this.summarizeModel(this.model) : undefined,
    });
    this.diagnosticRequestSerial += 1;
    this.modelChangeListener?.dispose();
    this.modelChangeListener = null;
    this.editorChangeListener?.dispose();
    this.editorChangeListener = null;
    this.editor = null;
    this.model = null;
    this.clearCompletionState();
  }

  setupDiagnostics(editor: monaco.editor.IStandaloneCodeEditor) {
    this.clearEditor();
    this.editor = editor;

    const updateModel = () => {
      this.modelChangeListener?.dispose();
      this.modelChangeListener = null;
      this.model = editor.getModel();

      if (this.model && this.model.getLanguageId() === 'csharp') {
        const model = this.model;
        this.recordDebugEvent({
          feature: 'diagnostics',
          phase: 'model-attached',
          level: 'info',
          message: 'C# diagnostics attached to model.',
          model: this.summarizeModel(model),
        });
        this.requestDiagnostics(model);
        this.modelChangeListener = model.onDidChangeContent(event => {
          if (!model.isDisposed() && model.getLanguageId() === 'csharp') {
            const shouldTriggerMemberCompletion = this.shouldTriggerMemberCompletionAfterChange(model, event);
            this.clearModelRuntimeState(model);
            this.clearCompletionState({
              structural: false,
              preserveEnvironment: true,
              preserveResultCaches: true,
            });
            this.recordDebugEvent({
              feature: 'model',
              phase: 'content-changed',
              level: 'info',
              message: 'C# model content changed.',
              model: this.summarizeModel(model),
            });
            this.requestDiagnostics(model);
            this.refreshPredictiveCompletion(model);
            if (shouldTriggerMemberCompletion) {
              window.setTimeout(() => this.triggerMemberCompletion(model), 25);
            }
          }
        });
      } else {
        this.recordDebugEvent({
          feature: 'diagnostics',
          phase: 'model-detached',
          level: 'warning',
          message: 'C# diagnostics detached because the active model is not C#.',
          model: this.model ? this.summarizeModel(this.model) : undefined,
        });
        this.model = null;
      }
    };

    updateModel();
    this.editorChangeListener = editor.onDidChangeModel(() => updateModel());
  }

  async includeNamespace(namespaceName: string): Promise<{
    namespaceName?: string;
    success?: boolean;
    addedAssemblies?: string[];
    matchedAssemblies?: string[];
    message?: string;
  }> {
    await ensureCSharpReady();
    if (!this.omnisharp) {
      return { success: false, message: 'C# authoring runtime is not ready.' };
    }

    const trimmedNamespace = namespaceName.trim();
    if (!trimmedNamespace) {
      return { success: false, message: 'Namespace is required.' };
    }

    const response = await this.omnisharp('IncludeNamespaceAsync', trimmedNamespace) as {
      namespaceName?: string;
      success?: boolean;
      addedAssemblies?: string[];
      matchedAssemblies?: string[];
      message?: string;
    } | false;
    this.clearCompletionState();

    if (this.model && this.model.getLanguageId() === 'csharp') {
      await this.refreshDiagnosticsNow(this.model);
    }

    return response || { success: false, message: `No response while including '${trimmedNamespace}'.` };
  }

  private requestDiagnostics(model: monaco.editor.ITextModel) {
    const requestSerial = ++this.diagnosticRequestSerial;
    this.recordDebugEvent({
      feature: 'diagnostics',
      phase: 'schedule',
      level: 'info',
      message: 'C# diagnostics scheduled.',
      model: this.summarizeModel(model),
      request: { requestSerial },
      environment: this.createDebugEnvironmentSnapshot(model),
    });
    void this.debouncedDiagnostics(model, requestSerial);
  }

  private refreshDiagnosticsNow(model: monaco.editor.ITextModel) {
    const requestSerial = ++this.diagnosticRequestSerial;
    return this.getDiagnostics(model, requestSerial);
  }

  private async getDiagnostics(model: monaco.editor.ITextModel, requestSerial: number) {
    const started = this.now();
    if (model.isDisposed() || model.getLanguageId() !== 'csharp') return;

    const initialModelVersion = model.getVersionId();
    this.recordDebugEvent({
      feature: 'diagnostics',
      phase: 'start',
      level: 'info',
      message: 'C# diagnostics started.',
      model: this.summarizeModel(model),
      request: { requestSerial, initialModelVersion },
      environment: this.createDebugEnvironmentSnapshot(model),
    });
    const runtimeReady = await this.ensureLocalOmniSharpRuntime();
    if (
      !runtimeReady ||
      !this.omnisharp ||
      requestSerial !== this.diagnosticRequestSerial ||
      model.isDisposed() ||
      model.getVersionId() !== initialModelVersion
    ) {
      this.recordDebugEvent({
        feature: 'diagnostics',
        phase: 'skip',
        level: 'warning',
        message: 'C# diagnostics skipped after readiness/version checks.',
        durationMs: Math.round((this.now() - started) * 10) / 10,
        request: {
          runtimeReady,
          hasOmniSharpBridge: !!this.omnisharp,
          requestSerial,
          currentDiagnosticRequestSerial: this.diagnosticRequestSerial,
          modelDisposed: model.isDisposed(),
          modelVersionId: model.isDisposed() ? null : model.getVersionId(),
          initialModelVersion,
        },
        environment: this.createDebugEnvironmentSnapshot(model),
      });
      return;
    }

    const modelSnapshot = this.getModelTextSnapshot(model);
    const projectRequest = this.createSerializedDiagnosticProjectRequest(model);
    this.lastDiagnosticProjectRequest = projectRequest.request;
    const cacheKey = this.createDiagnosticCacheKey(modelSnapshot, projectRequest);
    if (this.diagnosticCacheKey === cacheKey) {
      monaco.editor.setModelMarkers(model, 'csharp-omnisharp', this.diagnosticCacheMarkers);
      this.recordDebugEvent({
        feature: 'diagnostics',
        phase: 'cache-hit',
        level: 'success',
        message: 'C# diagnostics reused cached markers.',
        model: this.summarizeModel(model),
        durationMs: Math.round((this.now() - started) * 10) / 10,
        request: {
          cacheKey,
          markerCount: this.diagnosticCacheMarkers.length,
          project: this.summarizeProjectRequest(projectRequest.request),
        },
        environment: this.createDebugEnvironmentSnapshot(model),
      });
      return;
    }

    try {
      this.recordDebugEvent({
        feature: 'diagnostics',
        phase: 'runtime-call',
        level: 'info',
        message: 'C# diagnostics calling OmniSharp.',
        model: this.summarizeModel(model),
        request: {
          cacheKey,
          codeLength: modelSnapshot.length,
          codeHash: modelSnapshot.hash,
          project: this.summarizeProjectRequest(projectRequest.request),
        },
        environment: this.createDebugEnvironmentSnapshot(model),
      });
      const diagnostics = await this.omnisharp('GetDiagnosticsAsync', modelSnapshot.code, projectRequest.serialized);
      if (
        requestSerial !== this.diagnosticRequestSerial ||
        model.isDisposed() ||
        model.getVersionId() !== initialModelVersion
      ) {
        this.recordDebugEvent({
          feature: 'diagnostics',
          phase: 'discard-stale-response',
          level: 'warning',
          message: 'C# diagnostics response discarded because the model/request changed.',
          durationMs: Math.round((this.now() - started) * 10) / 10,
          response: this.summarizeOmniSharpResponse(diagnostics),
          environment: this.createDebugEnvironmentSnapshot(model),
        });
        return;
      }

      const markers = this.convertDiagnostics(model, diagnostics);
      this.diagnosticCacheKey = cacheKey;
      this.diagnosticCacheMarkers = markers;
      monaco.editor.setModelMarkers(model, 'csharp-omnisharp', markers);
      this.recordDebugEvent({
        feature: 'diagnostics',
        phase: 'end',
        level: 'success',
        message: 'C# diagnostics applied markers.',
        durationMs: Math.round((this.now() - started) * 10) / 10,
        response: {
          diagnosticPayload: this.summarizeOmniSharpResponse(diagnostics),
          markerCount: markers.length,
          severities: summarizeMarkers(markers),
        },
        environment: this.createDebugEnvironmentSnapshot(model),
      });
    } catch (error) {
      this.recordDebugEvent({
        feature: 'diagnostics',
        phase: 'error',
        level: 'error',
        message: 'C# diagnostics failed.',
        durationMs: Math.round((this.now() - started) * 10) / 10,
        error: this.summarizeError(error),
        environment: this.createDebugEnvironmentSnapshot(model),
      });
      if (
        requestSerial === this.diagnosticRequestSerial &&
        !model.isDisposed() &&
        model.getVersionId() === initialModelVersion
      ) {
        monaco.editor.setModelMarkers(model, 'csharp-omnisharp', []);
      }
    }
  }

  private shouldTriggerMemberCompletionAfterChange(
    model: monaco.editor.ITextModel,
    event: monaco.editor.IModelContentChangedEvent
  ) {
    if (!this.editor || this.editor.getModel() !== model) return false;
    if (event.changes.length !== 1) return false;

    const change = event.changes[0];
    if (change.rangeLength !== 0) return false;

    const position = new monaco.Position(change.range.startLineNumber, change.range.startColumn + 1);
    if (change.text === '.') {
      return csharpCompletionCharacterBefore(model, position) === '.';
    }

    if (change.text.length !== 1 || !isIdentifierPart(change.text, 0)) return false;
    const filterRange = this.getCompletionFilterRangeAtPosition(model, position);
    return filterRange.startColumn > 1
      && model.getLineContent(position.lineNumber).charAt(filterRange.startColumn - 2) === '.';
  }

  private triggerMemberCompletion(model: monaco.editor.ITextModel) {
    if (!this.editor || this.editor.getModel() !== model || model.isDisposed() || model.getLanguageId() !== 'csharp') return;
    const position = this.editor.getPosition();
    if (!position) return;
    const filterRange = this.getCompletionFilterRangeAtPosition(model, position);
    const hasMemberAccessPrefix = filterRange.startColumn > 1
      && model.getLineContent(position.lineNumber).charAt(filterRange.startColumn - 2) === '.';
    if (csharpCompletionCharacterBefore(model, position) !== '.' && !hasMemberAccessPrefix) return;
    if (!this.isEditorAtPosition(model, position)) return;
    this.editor.trigger('csharp-omnisharp', 'editor.action.triggerSuggest', {});
  }

  private rememberPredictiveCompletionSource(
    model: monaco.editor.ITextModel,
    projectRequest: CSharpSerializedProjectRequest,
    entry: CSharpCompletionCacheEntry
  ) {
    if (!entry.suggestions.length || entry.suggestions.length !== entry.lspItems.length) {
      this.predictiveCompletionSource = null;
      return;
    }
    this.predictiveCompletionSource = {
      modelUri: model.uri.toString(),
      projectFileKey: projectRequest.fileKey,
      environmentVersion: this.completionEnvironmentVersion,
      suggestions: entry.suggestions,
      lspItems: entry.lspItems,
    };
  }

  private refreshPredictiveCompletion(model: monaco.editor.ITextModel) {
    const plan = this.createPredictiveCompletionPlan(model);
    if (!plan) {
      this.predictiveCompletionSerial += 1;
      if (this.predictiveCompletionTimer) {
        clearTimeout(this.predictiveCompletionTimer);
        this.predictiveCompletionTimer = null;
      }
      this.invalidatePredictiveCompletionLastRequest('Preload invalidated because the current prefix no longer maps to a speculative candidate.');
      this.predictiveCompletionPlan = null;
      return;
    }

    if (this.predictiveCompletionPlan?.key === plan.key || this.predictiveCompletionCache.has(plan.key)) {
      return;
    }

    this.predictiveCompletionSerial += 1;
    if (this.predictiveCompletionTimer) {
      clearTimeout(this.predictiveCompletionTimer);
    }
    const serial = this.predictiveCompletionSerial;
    this.predictiveCompletionPlan = plan;
    this.setPredictiveCompletionLastRequest(plan, serial, 'scheduled', {
      scheduledAt: new Date().toISOString(),
    });
    this.predictiveCompletionTimer = setTimeout(() => {
      this.predictiveCompletionTimer = null;
      void this.runPredictiveCompletion(plan, serial);
    }, CSHARP_PREDICTIVE_COMPLETION_DELAY_MS);
  }

  private createPredictiveCompletionPlan(model: monaco.editor.ITextModel): CSharpPredictiveCompletionPlan | null {
    const source = this.predictiveCompletionSource;
    if (
      !source ||
      !this.editor ||
      this.editor.getModel() !== model ||
      model.isDisposed() ||
      model.getLanguageId() !== 'csharp' ||
      source.modelUri !== model.uri.toString() ||
      source.environmentVersion !== this.completionEnvironmentVersion
    ) {
      return null;
    }

    const position = this.editor.getPosition();
    if (!position || !this.isEditorAtPosition(model, position)) return null;

    const projectRequest = this.createSerializedDiagnosticProjectRequest(model);
    if (projectRequest.fileKey !== source.projectFileKey) return null;

    const filterRange = this.getCompletionFilterRangeAtPosition(model, position);
    const prefix = model.getValueInRange(filterRange);
    if (!isValidCSharpCompletionFilterPrefix(prefix)) return null;

    const candidate = this.selectPredictiveCompletionCandidate(source, prefix);
    if (!candidate) return null;

    const startOffset = model.getOffsetAt({
      lineNumber: filterRange.startLineNumber,
      column: filterRange.startColumn,
    });
    const endOffset = model.getOffsetAt({
      lineNumber: filterRange.endLineNumber,
      column: filterRange.endColumn,
    });
    const currentOffset = model.getOffsetAt(position);
    if (endOffset !== currentOffset || startOffset > endOffset) return null;

    const snapshot = this.getModelTextSnapshot(model);
    const replacement = `${candidate}.`;
    const code = snapshot.code.slice(0, startOffset) + replacement + snapshot.code.slice(endOffset);
    const offset = startOffset + replacement.length;
    const futurePosition = positionAtTextOffset(code, offset);
    if (!futurePosition) return null;

    const request = {
      Line: Math.max(0, futurePosition.lineNumber - 1),
      Column: Math.max(0, futurePosition.column - 1),
      CompletionTrigger: 1,
    };
    const codeHash = csharpCompletionFastHash(code);
    const key = csharpPredictiveCompletionCacheKey(
      model.uri.toString(),
      codeHash,
      offset,
      request,
      projectRequest,
      this.completionEnvironmentVersion,
      '.',
    );

    return {
      key,
      completionListKey: `${key}:${Math.random().toString(36).slice(2)}`,
      code,
      codeHash,
      offset,
      request,
      projectRequest,
      candidate,
      prefix,
    };
  }

  private selectPredictiveCompletionCandidate(
    source: CSharpPredictiveCompletionSource,
    prefix: string
  ): string | null {
    const normalizedPrefix = prefix.startsWith('@') ? prefix.slice(1) : prefix;
    const lowerPrefix = normalizedPrefix.toLocaleLowerCase();
    if (!lowerPrefix) return null;

    let fallback: string | null = null;
    for (const suggestion of source.suggestions) {
      if (!this.isPredictiveCompletionCandidateKind(suggestion.kind)) continue;
      const candidate = this.predictiveCompletionCandidateText(suggestion);
      if (!candidate) continue;
      const normalizedCandidate = candidate.startsWith('@') ? candidate.slice(1) : candidate;
      if (!normalizedCandidate.toLocaleLowerCase().startsWith(lowerPrefix)) continue;
      if (suggestion.preselect) return candidate;
      if (!fallback) fallback = candidate;
    }
    return fallback;
  }

  private predictiveCompletionCandidateText(item: monaco.languages.CompletionItem): string | null {
    const label = csharpCompletionOptionalString(item.label);
    const insertText = typeof item.insertText === 'string' && !/[.$]/.test(item.insertText)
      ? item.insertText
      : '';
    const candidate = insertText && isValidCSharpCompletionFilterPrefix(insertText)
      ? insertText
      : label && isValidCSharpCompletionFilterPrefix(label)
        ? label
        : '';
    return candidate && candidate.length <= 128 ? candidate : null;
  }

  private isPredictiveCompletionCandidateKind(kind: monaco.languages.CompletionItemKind | undefined): boolean {
    return kind === monaco.languages.CompletionItemKind.Class
      || kind === monaco.languages.CompletionItemKind.Struct
      || kind === monaco.languages.CompletionItemKind.Interface
      || kind === monaco.languages.CompletionItemKind.Enum
      || kind === monaco.languages.CompletionItemKind.Module
      || kind === monaco.languages.CompletionItemKind.Property
      || kind === monaco.languages.CompletionItemKind.Field
      || kind === monaco.languages.CompletionItemKind.Variable
      || kind === monaco.languages.CompletionItemKind.Value;
  }

  private async runPredictiveCompletion(plan: CSharpPredictiveCompletionPlan, serial: number) {
    if (serial !== this.predictiveCompletionSerial || this.predictiveCompletionCache.has(plan.key)) return;
    if (!this.omnisharp || !this.editor || !this.model || this.model.isDisposed()) return;

    await this.completionDispatchTail;
    if (
      serial !== this.predictiveCompletionSerial ||
      this.predictiveCompletionPlan?.key !== plan.key ||
      this.predictiveCompletionCache.has(plan.key)
    ) {
      this.setPredictiveCompletionLastRequest(plan, serial, 'stale', {
        finishedAt: new Date().toISOString(),
        reason: 'Preload did not start because a newer preload plan or cached result replaced it.',
      });
      return;
    }

    const startedAt = this.now();
    const callId = `completion.predictive-${serial}`;
    this.setPredictiveCompletionLastRequest(plan, serial, 'running', {
      callId,
      startedAt: new Date().toISOString(),
    });
    this.recordDebugEvent({
      feature: 'completion.predictive',
      phase: 'provider-start',
      callId,
      level: 'info',
      message: 'C# predictive completion preload started.',
      request: {
        candidate: plan.candidate,
        prefix: plan.prefix,
        offset: plan.offset,
        key: plan.key,
        project: this.summarizeProjectRequest(plan.projectRequest.request),
      },
    });

    try {
      const response = await this.omnisharp(
        'GetSpeculativeCompletionAsync',
        plan.code,
        plan.request,
        plan.projectRequest.serialized,
        plan.completionListKey,
      );
      const itemCount = csharpCompletionItemsFromResponse(response).length;
      const shouldCache = (
        serial === this.predictiveCompletionSerial &&
        this.predictiveCompletionPlan?.key === plan.key &&
        itemCount > 0
      );
      if (
        shouldCache
      ) {
        this.cachePredictiveCompletionResult(plan.key, {
          response,
          completionListKey: plan.completionListKey,
          codeHash: plan.codeHash,
          offset: plan.offset,
          itemCount,
          createdAt: Date.now(),
        });
      }
      this.setPredictiveCompletionLastRequest(plan, serial, shouldCache ? 'cached' : itemCount > 0 ? 'stale' : 'empty', {
        callId,
        finishedAt: new Date().toISOString(),
        durationMs: Math.round((this.now() - startedAt) * 10) / 10,
        itemCount,
        cached: shouldCache,
        reason: !shouldCache && itemCount > 0
          ? 'Preload returned items, but a newer preload plan replaced it before caching.'
          : undefined,
      });
      this.recordDebugEvent({
        feature: 'completion.predictive',
        phase: 'provider-end',
        callId,
        level: itemCount > 0 ? 'success' : 'warning',
        message: itemCount > 0 ? 'C# predictive completion preload cached.' : 'C# predictive completion returned no items.',
        durationMs: Math.round((this.now() - startedAt) * 10) / 10,
        response: {
          itemCount,
          cached: itemCount > 0,
        },
      });
    } catch (error) {
      this.recordDebugEvent({
        feature: 'completion.predictive',
        phase: 'provider-error',
        callId,
        level: 'warning',
        message: 'C# predictive completion preload failed.',
        durationMs: Math.round((this.now() - startedAt) * 10) / 10,
        error: summarizePrimitive(error),
      });
      this.setPredictiveCompletionLastRequest(plan, serial, 'failed', {
        callId,
        finishedAt: new Date().toISOString(),
        durationMs: Math.round((this.now() - startedAt) * 10) / 10,
        error: summarizePrimitive(error),
      });
    }
  }

  private completionEntryFromResponse(
    model: monaco.editor.ITextModel,
    response: unknown,
    defaultRange: monaco.IRange,
    snapshot: CSharpCompletionRequestSnapshot,
    lateContext: CSharpLateCompletionContext | null,
    speculativeCompletionListKey?: string
  ): CSharpCompletionCacheEntry {
    const suggestions: monaco.languages.CompletionItem[] = [];
    const lspItems: any[] = [];

    for (const rawItem of csharpCompletionItemsFromResponse(response)) {
      const suggestion = this.convertCompletion(model, rawItem, defaultRange, snapshot, lateContext);
      if (!csharpCompletionItemIsUsable(suggestion)) continue;
      if (speculativeCompletionListKey && rawItem && typeof rawItem === 'object') {
        this.completionResolveSpeculativeKeys.set(rawItem, speculativeCompletionListKey);
      }
      suggestions.push(suggestion);
      lspItems.push(rawItem);
    }

    return {
      suggestions,
      lspItems,
      incomplete: csharpCompletionResponseIsIncomplete(response),
      completionSnapshot: lateContext ? snapshot : undefined,
      lateContext,
    };
  }

  private predictiveCompletionKeyForCurrentRequest(
    model: monaco.editor.ITextModel,
    snapshot: CSharpCompletionRequestSnapshot,
    position: monaco.Position,
    request: any,
    projectRequest: CSharpSerializedProjectRequest
  ): string {
    return csharpPredictiveCompletionCacheKey(
      model.uri.toString(),
      csharpCompletionFastHash(snapshot.code),
      snapshot.offset,
      request,
      projectRequest,
      this.completionEnvironmentVersion,
      csharpCompletionCharacterBefore(model, position) ?? '',
    );
  }

  private toMarkerSeverity(severity: unknown): monaco.MarkerSeverity {
    if (typeof severity === 'number') {
      if (severity === monaco.MarkerSeverity.Error || severity >= 8) return monaco.MarkerSeverity.Error;
      if (severity === monaco.MarkerSeverity.Warning || severity >= 4) return monaco.MarkerSeverity.Warning;
      if (severity === monaco.MarkerSeverity.Info || severity >= 2) return monaco.MarkerSeverity.Info;
      return monaco.MarkerSeverity.Hint;
    }
    const normalized = String(severity || '').toLowerCase();
    if (normalized.includes('error')) return monaco.MarkerSeverity.Error;
    if (normalized.includes('warn')) return monaco.MarkerSeverity.Warning;
    if (normalized.includes('info')) return monaco.MarkerSeverity.Info;
    return monaco.MarkerSeverity.Hint;
  }
  private async rawProvideCompletionItems(
    model: monaco.editor.ITextModel,
    position: monaco.Position,
    context: monaco.languages.CompletionContext
  ): Promise<monaco.languages.CompletionList> {
    const snapshot = this.createCompletionSnapshot(model, position);
    snapshot.structuralVersion = this.completionStructuralVersion;

    const request = csharpOmniSharpCompletionRequest(model, position, context);
    const projectRequest = this.createSerializedDiagnosticProjectRequest(model);
    const cacheKey = csharpContextualCompletionCacheKey(
      model,
      snapshot,
      position,
      context,
      request,
      projectRequest,
      this.completionEnvironmentVersion,
    );

    const cached = this.completionCache.get(cacheKey);
    if (cached) {
      this.rememberPredictiveCompletionSource(model, projectRequest, cached);
      this.refreshPredictiveCompletion(model);
      return this.toCompletionList(cached);
    }

    const predictiveKey = this.predictiveCompletionKeyForCurrentRequest(model, snapshot, position, request, projectRequest);
    const predictive = this.predictiveCompletionCache.get(predictiveKey);
    if (predictive) {
      const entry = this.completionEntryFromResponse(
        model,
        predictive.response,
        this.getCompletionFilterRangeAtPosition(model, position),
        snapshot,
        null,
        predictive.completionListKey,
      );
      if (entry.suggestions.length) {
        const ageMs = Date.now() - predictive.createdAt;
        this.cacheCompletionResult(cacheKey, entry);
        this.completionWorkerStateKey = cacheKey;
        this.rememberPredictiveCompletionSource(model, projectRequest, entry);
        this.refreshPredictiveCompletion(model);
        this.markPredictiveCompletionServed(predictiveKey, entry.suggestions.length, ageMs, cacheKey);
        this.recordDebugEvent({
          feature: 'completion.predictive',
          phase: 'cache-hit',
          level: 'success',
          message: 'C# completion served from predictive preload.',
          model: this.summarizeModel(model),
          request: {
            key: predictiveKey,
            cacheKey,
            itemCount: entry.suggestions.length,
            ageMs,
          },
        });
        return this.toCompletionList(entry);
      }
      this.predictiveCompletionCache.delete(predictiveKey);
    }

    const runtimeReady = await this.ensureLocalOmniSharpRuntime();
    if (!runtimeReady || !this.omnisharp || model.isDisposed()) {
      return this.emptyCompletionList();
    }

    const requestSerial = ++this.completionRequestSerial;
    const callId = 'completion-' + requestSerial;
    const startedAt = this.now();
    this.recordDebugEvent({
      feature: 'completion',
      phase: 'provider-start',
      callId,
      model: this.summarizeModel(model),
      request: {
        ...request,
        offset: snapshot.offset,
        cacheKey,
        contextualCompletionFixVersion: CSHARP_CONTEXTUAL_COMPLETION_FIX_VERSION,
        project: this.summarizeProjectRequest(projectRequest.request),
      },
    });

    const inflight = csharpCompletionInflightFor(this);
    let entryPromise = inflight.get(cacheKey);

    if (!entryPromise) {
      entryPromise = (async (): Promise<CSharpCompletionCacheEntry | null> => {
        const response = await this.enqueueCompletionRuntimeCall(model, snapshot, request, projectRequest, requestSerial, callId);
        if (response === CSHARP_STALE_COMPLETION_RESPONSE) {
          return null;
        }

        const isCurrentRequest = (
          requestSerial === this.completionRequestSerial &&
          !model.isDisposed() &&
          model.getVersionId() === snapshot.modelVersionId
        );
        const lateContext = isCurrentRequest ? null : this.getLateCompletionContext(model, snapshot);
        if (!isCurrentRequest && !lateContext) {
          return null;
        }

        const defaultRange = lateContext?.filterRange ?? this.getCompletionFilterRangeAtPosition(model, position);
        return this.completionEntryFromResponse(model, response, defaultRange, snapshot, lateContext);
      })().finally(() => {
        inflight.delete(cacheKey);
      });

      inflight.set(cacheKey, entryPromise);
    }

    try {
      const entry = await entryPromise;
      if (!entry || model.isDisposed()) return this.emptyCompletionList();

      this.cacheCompletionResult(cacheKey, entry);
      this.completionWorkerStateKey = cacheKey;
      this.rememberPredictiveCompletionSource(model, projectRequest, entry);
      this.refreshPredictiveCompletion(model);
      this.recordDebugEvent({
        feature: 'completion',
        phase: 'provider-end',
        level: 'success',
        callId,
        durationMs: Math.round((this.now() - startedAt) * 10) / 10,
        response: {
          itemCount: entry.suggestions.length,
          incomplete: !!entry.incomplete,
          cacheHit: false,
          completionTrigger: request.CompletionTrigger,
          triggerCharacter: request.TriggerCharacter,
        },
      });
      return this.toCompletionList(entry);
    } catch (error) {
      this.recordDebugEvent({
        feature: 'completion',
        phase: 'provider-error',
        level: 'error',
        callId,
        durationMs: Math.round((this.now() - startedAt) * 10) / 10,
        message: 'C# completion provider failed.',
        error: summarizePrimitive(error),
      });
      return this.emptyCompletionList();
    }
  }
  private async rawResolveCompletionItem(
    item: monaco.languages.CompletionItem
  ): Promise<monaco.languages.CompletionItem> {
    const lspItem = this.lastCompletions.get(item);
    const completionContext = this.lastCompletionContexts.get(item);
    if (!lspItem || !this.omnisharp) return item;

    const callId = 'completion.resolve-' + Math.random().toString(36).slice(2);
    const startedAt = this.now();
    this.recordDebugEvent({
      feature: 'completion.resolve',
      phase: 'provider-start',
      callId,
      request: {
        label: csharpCompletionOptionalString(item.label),
        hasCachedLspItem: true,
        contextualCompletionFixVersion: CSHARP_CONTEXTUAL_COMPLETION_FIX_VERSION,
      },
    });

    try {
      const response = await this.getCompletionResolveResponse(lspItem);
      if (!response) {
        this.recordDebugEvent({
          feature: 'completion.resolve',
          phase: 'provider-end',
          level: 'warning',
          callId,
          durationMs: Math.round((this.now() - startedAt) * 10) / 10,
          message: 'C# completion resolve returned no response.',
        });
        return item;
      }

      const resolved = csharpResolvedCompletionItem(response, lspItem);
      const defaultRange = csharpCompletionItemInsertRange(item.range) ?? this.toEditorRange((item.range as any)?.insert ?? item.range);
      const converted = defaultRange && this.model && !this.model.isDisposed()
        ? this.convertCompletion(
          this.model,
          resolved,
          defaultRange,
          completionContext?.snapshot,
          completionContext?.lateContext
        )
        : null;
      const result = csharpCompletionMergeResolvedItem(item, converted);

      this.recordDebugEvent({
        feature: 'completion.resolve',
        phase: 'provider-end',
        level: 'success',
        callId,
        durationMs: Math.round((this.now() - startedAt) * 10) / 10,
        response: {
          label: csharpCompletionOptionalString(result.label),
          hasDocumentation: !!result.documentation,
          additionalTextEditCount: result.additionalTextEdits?.length ?? 0,
        },
      });

      return result;
    } catch (error) {
      this.recordDebugEvent({
        feature: 'completion.resolve',
        phase: 'provider-error',
        level: 'error',
        callId,
        durationMs: Math.round((this.now() - startedAt) * 10) / 10,
        message: 'C# completion resolve failed.',
        error: summarizePrimitive(error),
      });
      return item;
    }
  }

  private getCompletionResolveResponse(lspItem: any): Promise<unknown> {
    if (!this.omnisharp) return Promise.resolve(false);
    const speculativeCompletionListKey = lspItem && typeof lspItem === 'object'
      ? this.completionResolveSpeculativeKeys.get(lspItem)
      : undefined;
    if (!lspItem || typeof lspItem !== 'object') {
      return this.omnisharp('GetCompletionResolveAsync', { Item: lspItem });
    }

    const cached = this.completionResolveResponseCache.get(lspItem);
    if (cached) return cached;

    const request = (
      speculativeCompletionListKey
        ? this.omnisharp('GetSpeculativeCompletionResolveAsync', { Item: lspItem }, speculativeCompletionListKey)
        : this.omnisharp('GetCompletionResolveAsync', { Item: lspItem })
    ).then(response => {
      if (!response) this.completionResolveResponseCache.delete(lspItem);
      return response;
    }, error => {
      this.completionResolveResponseCache.delete(lspItem);
      throw error;
    });
    this.completionResolveResponseCache.set(lspItem, request);
    return request;
  }

  private async provideSignatureHelp(
    model: monaco.editor.ITextModel,
    position: monaco.Position
  ): Promise<monaco.languages.SignatureHelpResult | undefined> {
    if (!this.omnisharp) return this.provideLocalSignatureHelp(model, position);
    const req = { Line: position.lineNumber - 1, Column: position.column - 1 };
    const snapshot = this.getModelTextSnapshot(model);
    try {
      const res = await this.cachedOmniSharpModelCall('GetSignatureHelpAsync', model, snapshot, [req], req);
      if (!res) return this.provideLocalSignatureHelp(model, position);
      const result = res as any;
      return {
        value: {
          signatures: (result.signatures ?? []).map((sig: any) => ({
            label: sig.label,
            documentation: sig.structuredDocumentation?.summaryText ?? '',
            parameters: (sig.parameters ?? []).map((p: any) => ({
              label: p.label,
              documentation: p.documentation ? { value: `**${p.name}**: ${p.documentation}` } : '',
            })),
          })),
          activeSignature: result.activeSignature ?? 0,
          activeParameter: result.activeParameter ?? 0,
        },
        dispose: () => { },
      };
    } catch {
      return this.provideLocalSignatureHelp(model, position);
    }
  }

  private async provideHover(
    model: monaco.editor.ITextModel,
    position: monaco.Position,
    cancellationToken?: monaco.CancellationToken
  ): Promise<monaco.languages.Hover | undefined> {
    const initialModelVersion = model.getVersionId();
    const runtimeReady = await this.ensureOmniSharpRuntime();
    if (
      runtimeReady &&
      this.omnisharp &&
      !cancellationToken?.isCancellationRequested &&
      !model.isDisposed() &&
      model.getVersionId() === initialModelVersion
    ) {
      try {
        const snapshot = this.getModelTextSnapshot(model);
        const projectRequest = this.createSerializedDiagnosticProjectRequest(model);
        const positionRequest = this.positionRequest(position);
        const response = await this.cachedOmniSharpModelCall(
          'GetQuickInfoAsync',
          model,
          snapshot,
          [positionRequest, projectRequest.fileKey, projectRequest.currentPath],
          positionRequest,
          projectRequest.serialized
        );
        if (cancellationToken?.isCancellationRequested || model.isDisposed() || model.getVersionId() !== initialModelVersion) {
          return undefined;
        }
        const hover = this.convertOmniSharpHover(response);
        if (hover) return hover;
      } catch {
        // Continue with the in-browser C# language index.
      }
    }

    if (cancellationToken?.isCancellationRequested || model.isDisposed() || model.getVersionId() !== initialModelVersion) {
      return undefined;
    }
    const symbol = this.getSemanticIndex(model).symbolAt(position);
    if (!symbol) return undefined;
    const declaration = this.findProjectDeclaration(model, symbol);
    return {
      range: symbol.token.range,
      contents: [{ value: buildSymbolMarkdown(declaration?.declaration ?? symbol.declaration ?? symbol) }],
    };
  }

  private async provideDocumentSemanticTokens(
    model: monaco.editor.ITextModel,
    cancellationToken: monaco.CancellationToken
  ): Promise<monaco.languages.SemanticTokens | null> {
    if (this.omnisharp) {
      try {
        const snapshot = this.getModelTextSnapshot(model);
        const response = await this.cachedOmniSharpModelCall('GetSemanticTokensAsync', model, snapshot, []);
        if (!cancellationToken.isCancellationRequested && Array.isArray(response)) {
          return { data: this.encodeOmniSharpSemanticTokens(response as OmniSharpSemanticTokenDto[]) };
        }
      } catch {
        // Fall through to the browser-side semantic index.
      }
    }

    if (cancellationToken.isCancellationRequested || model.isDisposed()) return null;
    return { data: this.getSemanticIndex(model).encodedTokens };
  }

  private async provideDefinition(
    model: monaco.editor.ITextModel,
    position: monaco.Position
  ): Promise<monaco.languages.Location[] | undefined> {
    if (this.omnisharp) {
      try {
        const snapshot = this.getModelTextSnapshot(model);
        const projectRequest = this.createSerializedDiagnosticProjectRequest(model);
        const positionRequest = this.positionRequest(position);
        const response = await this.cachedOmniSharpModelCall(
          'GetDefinitionAsync',
          model,
          snapshot,
          [positionRequest, projectRequest.fileKey, projectRequest.currentPath],
          positionRequest,
          projectRequest.serialized
        );
        const locations = this.convertLocations(model, response);
        if (locations.length) return locations;
      } catch {
        // Fall through to the browser-side semantic index.
      }
    }

    const symbol = this.getSemanticIndex(model).symbolAt(position);
    if (!symbol) return undefined;
    const declaration = this.findProjectDeclaration(model, symbol);
    return declaration
      ? [{ uri: declaration.model.uri, range: declaration.declaration.token.range }]
      : [{ uri: model.uri, range: symbol.token.range }];
  }

  private async provideReferences(
    model: monaco.editor.ITextModel,
    position: monaco.Position,
    context: monaco.languages.ReferenceContext
  ): Promise<monaco.languages.Location[] | undefined> {
    let omnisharpLocations: monaco.languages.Location[] = [];
    if (this.omnisharp) {
      try {
        const snapshot = this.getModelTextSnapshot(model);
        const positionRequest = this.positionRequest(position);
        const includeDeclaration = String(context.includeDeclaration);
        const response = await this.cachedOmniSharpModelCall(
          'GetReferencesAsync',
          model,
          snapshot,
          [positionRequest, includeDeclaration],
          positionRequest,
          includeDeclaration
        );
        omnisharpLocations = this.convertLocations(model, response);
      } catch {
        // Fall through to the browser-side semantic index.
      }
    }

    const index = this.getSemanticIndex(model);
    const symbol = index.symbolAt(position);
    if (!symbol) return omnisharpLocations.length ? omnisharpLocations : undefined;
    const refs = this.projectReferencesFor(model, symbol, context.includeDeclaration);
    const fallbackRefs = refs.length ? refs : index.referencesFor(symbol, context.includeDeclaration).map(ref => ({ uri: model.uri, range: ref.token.range }));
    return mergeLocations([...omnisharpLocations, ...fallbackRefs]);
  }

  private provideDocumentHighlights(
    model: monaco.editor.ITextModel,
    position: monaco.Position
  ): monaco.languages.DocumentHighlight[] | undefined {
    const index = this.getSemanticIndex(model);
    const symbol = index.symbolAt(position);
    if (!symbol) return undefined;
    return index.referencesFor(symbol, true).map(ref => ({
      range: ref.token.range,
      kind: ref.isWrite ? monaco.languages.DocumentHighlightKind.Write : monaco.languages.DocumentHighlightKind.Read,
    }));
  }

  private async provideDocumentSymbols(model: monaco.editor.ITextModel): Promise<monaco.languages.DocumentSymbol[]> {
    if (this.omnisharp) {
      try {
        const snapshot = this.getModelTextSnapshot(model);
        const response = await this.cachedOmniSharpModelCall('GetDocumentSymbolsAsync', model, snapshot, []);
        const symbols = this.convertDocumentSymbols(response);
        if (symbols.length) return symbols;
      } catch {
        // Fall through to the browser-side semantic index.
      }
    }

    return this.getSemanticIndex(model).documentSymbols;
  }

  private async resolveRenameLocation(
    model: monaco.editor.ITextModel,
    position: monaco.Position
  ): Promise<monaco.languages.RenameLocation> {
    if (this.omnisharp) {
      try {
        const snapshot = this.getModelTextSnapshot(model);
        const positionRequest = this.positionRequest(position);
        const response = await this.cachedOmniSharpModelCall(
          'GetRenameInfoAsync',
          model,
          snapshot,
          [positionRequest],
          positionRequest
        ) as OmniSharpRenameInfoDto | false;
        const range = this.toEditorRange(response && response.range);
        if (response && response.canRename && range) {
          return { range, text: response.text ?? model.getValueInRange(range) };
        }
        if (response && response.canRename === false) {
          return {
            range: new monaco.Range(position.lineNumber, position.column, position.lineNumber, position.column),
            text: '',
          };
        }
      } catch {
        // Fall through to the browser-side semantic index.
      }
    }

    const symbol = this.getSemanticIndex(model).symbolAt(position);
    if (!symbol || !isRenameableSymbol(symbol)) {
      return {
        range: new monaco.Range(position.lineNumber, position.column, position.lineNumber, position.column),
        text: '',
      };
    }
    return { range: symbol.token.range, text: symbol.name };
  }

  private async provideRenameEdits(
    model: monaco.editor.ITextModel,
    position: monaco.Position,
    newName: string
  ): Promise<monaco.languages.WorkspaceEdit & monaco.languages.Rejection> {
    if (!/^@?[_\p{L}][_\p{L}\p{N}]*$/u.test(newName)) {
      return { edits: [], rejectReason: 'Enter a valid C# identifier.' };
    }

    let omnisharpEdits: monaco.languages.IWorkspaceTextEdit[] = [];
    let omnisharpRejectReason: string | undefined;
    if (this.omnisharp) {
      try {
        const snapshot = this.getModelTextSnapshot(model);
        const positionRequest = this.positionRequest(position);
        const response = await this.cachedOmniSharpModelCall(
          'GetRenameEditsAsync',
          model,
          snapshot,
          [positionRequest, newName],
          positionRequest,
          newName
        ) as OmniSharpRenameEditsDto | false;
        if (response && Array.isArray(response.edits)) {
          omnisharpEdits = response.edits.flatMap(edit => this.convertWorkspaceEdit(model, edit));
          omnisharpRejectReason = response.rejectReason ?? undefined;
        }
      } catch {
        // Fall through to the browser-side semantic index.
      }
    }

    const index = this.getSemanticIndex(model);
    const symbol = index.symbolAt(position);
    if (!symbol || !isRenameableSymbol(symbol)) {
      if (omnisharpEdits.length) {
        return { edits: omnisharpEdits, rejectReason: omnisharpRejectReason };
      }
      return { edits: [], rejectReason: 'This C# token cannot be renamed.' };
    }

    const projectRefs = this.projectReferencesFor(model, symbol, true);
    const edits = (projectRefs.length ? projectRefs : index.referencesFor(symbol, true).map(ref => ({ uri: model.uri, range: ref.token.range }))).map(ref => ({
      resource: ref.uri,
      textEdit: { range: ref.range, text: newName },
      versionId: monaco.editor.getModel(ref.uri)?.getVersionId(),
    }));
    return { edits: mergeWorkspaceTextEdits([...omnisharpEdits, ...edits]), rejectReason: omnisharpRejectReason };
  }

  private async provideCodeActions(
    model: monaco.editor.ITextModel,
    range: monaco.Range,
    context: monaco.languages.CodeActionContext
  ): Promise<monaco.languages.CodeActionList> {
    const index = this.getSemanticIndex(model);
    const actions: monaco.languages.CodeAction[] = [];
    const lineText = model.getLineContent(range.startLineNumber);

    if (this.omnisharp) {
      try {
        const snapshot = this.getModelTextSnapshot(model);
        const rangeRequest = this.rangeRequest(range);
        const projectRequest = this.createSerializedDiagnosticProjectRequest(model);
        const response = await this.cachedOmniSharpModelCall(
          'GetCodeActionsAsync',
          model,
          snapshot,
          [rangeRequest, projectRequest.serialized],
          rangeRequest,
          projectRequest.serialized
        );
        actions.push(...this.convertCodeActions(model, response, context.markers));
      } catch {
        // Local actions below still cover the common cases.
      }
    }

    const missingUsing = suggestMissingUsing(context.markers, index);
    if (missingUsing) {
      actions.push({
        title: `Add using ${missingUsing}`,
        kind: 'quickfix',
        diagnostics: context.markers,
        edit: { edits: [{ resource: model.uri, textEdit: { range: new monaco.Range(1, 1, 1, 1), text: `using ${missingUsing};\n` }, versionId: model.getVersionId() }] },
        isPreferred: true,
      });
    }

    if (/^\s*using\b/.test(lineText) || index.usingRanges.length > 1) {
      const snapshot = this.getModelTextSnapshot(model);
      const organized = organizeUsings(snapshot.code);
      if (organized !== snapshot.code) {
        actions.push({
          title: 'Organize C# usings',
          kind: 'source',
          edit: { edits: [{ resource: model.uri, textEdit: { range: model.getFullModelRange(), text: organized }, versionId: model.getVersionId() }] },
        });
      }
    }

    const symbol = index.symbolAt(range.getStartPosition());
    if (symbol?.kind === 'field') {
      const propertyName = toPascalCase(symbol.name.replace(/^_+/, ''));
      if (propertyName && propertyName !== symbol.name) {
        actions.push({
          title: `Encapsulate field as property '${propertyName}'`,
          kind: 'refactor',
          edit: {
            edits: [{
              resource: model.uri,
              textEdit: {
                range: new monaco.Range(symbol.token.range.endLineNumber, symbol.token.range.endColumn, symbol.token.range.endLineNumber, symbol.token.range.endColumn),
                text: `\npublic ${symbol.typeName || 'var'} ${propertyName} { get => ${symbol.name}; set => ${symbol.name} = value; }`,
              },
              versionId: model.getVersionId(),
            }],
          },
        });
      }
    }

    if (!actions.length && isOnlyCodeActionKind(context.only, 'quickfix')) {
      return { actions: [], dispose() {} };
    }
    return { actions: dedupeCodeActions(actions), dispose() {} };
  }

  private async provideFoldingRanges(model: monaco.editor.ITextModel): Promise<monaco.languages.FoldingRange[]> {
    if (this.omnisharp) {
      try {
        const snapshot = this.getModelTextSnapshot(model);
        const response = await this.cachedOmniSharpModelCall('GetFoldingRangesAsync', model, snapshot, []);
        const ranges = this.convertFoldingRanges(response);
        if (ranges.length) return ranges;
      } catch {
        // Fall through to the browser-side semantic index.
      }
    }

    return this.getSemanticIndex(model).foldingRanges;
  }

  private async provideDocumentFormattingEdits(
    model: monaco.editor.ITextModel,
    options: monaco.languages.FormattingOptions
  ): Promise<monaco.languages.TextEdit[]> {
    const snapshot = this.getModelTextSnapshot(model);
    if (this.omnisharp) {
      try {
        const formatted = await this.cachedOmniSharpModelCall('GetFormattingAsync', model, snapshot, []);
        if (typeof formatted === 'string' && formatted !== snapshot.code) {
          return [{ range: model.getFullModelRange(), text: formatted }];
        }
        if (typeof formatted === 'string') return [];
      } catch {
        // Fall through to lightweight formatter.
      }
    }

    const formatted = formatCSharp(snapshot.code, options);
    return formatted === snapshot.code
      ? []
      : [{ range: model.getFullModelRange(), text: formatted }];
  }

  private async provideDocumentRangeFormattingEdits(
    model: monaco.editor.ITextModel,
    range: monaco.Range,
    options: monaco.languages.FormattingOptions
  ): Promise<monaco.languages.TextEdit[]> {
    const snapshot = this.getModelTextSnapshot(model);
    if (this.omnisharp) {
      try {
        const rangeRequest = this.rangeRequest(range);
        const formatted = await this.cachedOmniSharpModelCall(
          'GetRangeFormattingAsync',
          model,
          snapshot,
          [rangeRequest],
          rangeRequest
        );
        if (typeof formatted === 'string' && formatted !== snapshot.code) {
          return [{ range: model.getFullModelRange(), text: formatted }];
        }
        if (typeof formatted === 'string') return [];
      } catch {
        // Fall through to lightweight formatter.
      }
    }

    const text = model.getValueInRange(range);
    const formatted = formatCSharp(text, options, model.getLineFirstNonWhitespaceColumn(range.startLineNumber) - 1);
    return formatted === text ? [] : [{ range, text: formatted }];
  }

  private provideOnTypeFormattingEdits(
    model: monaco.editor.ITextModel,
    position: monaco.Position,
    _ch: string,
    options: monaco.languages.FormattingOptions
  ): monaco.languages.TextEdit[] {
    const line = model.getLineContent(position.lineNumber);
    const trimmed = line.trimStart();
    if (!trimmed) return [];
    const indent = inferLineIndent(model, position.lineNumber, options);
    const desired = `${indent}${trimmed}`;
    return desired === line
      ? []
      : [{ range: new monaco.Range(position.lineNumber, 1, position.lineNumber, line.length + 1), text: desired }];
  }

  private async provideInlayHints(
    model: monaco.editor.ITextModel,
    range: monaco.Range
  ): Promise<monaco.languages.InlayHintList> {
    if (this.omnisharp) {
      try {
        const snapshot = this.getModelTextSnapshot(model);
        const rangeRequest = this.rangeRequest(range);
        const response = await this.cachedOmniSharpModelCall(
          'GetInlayHintsAsync',
          model,
          snapshot,
          [rangeRequest],
          rangeRequest
        );
        const hints = this.convertInlayHints(response);
        if (hints.length) return { hints, dispose() {} };
      } catch {
        // Fall through to the browser-side semantic index.
      }
    }

    const index = this.getSemanticIndex(model);
    const hints = index.inlayHints.filter(hint => range.containsPosition(hint.position));
    return { hints, dispose() {} };
  }

  private provideSelectionRanges(
    model: monaco.editor.ITextModel,
    positions: monaco.Position[]
  ): monaco.languages.SelectionRange[][] {
    const index = this.getSemanticIndex(model);
    return positions.map(position => index.selectionRangesAt(position));
  }

  private provideLocalSignatureHelp(
    model: monaco.editor.ITextModel,
    position: monaco.Position
  ): monaco.languages.SignatureHelpResult | undefined {
    const index = this.getSemanticIndex(model);
    const call = index.callAt(position);
    if (!call) return undefined;
    return {
      value: {
        activeParameter: call.activeParameter,
        activeSignature: 0,
        signatures: [{
          label: call.label,
          parameters: call.parameters.map(parameter => ({ label: parameter })),
        }],
      },
      dispose() {},
    };
  }

  private getCSharpProjectFileSnapshots(): CSharpProjectFileSnapshot[] {
    return this.projectFilesProvider()
      .filter(file => file.language === 'csharp')
      .map(file => ({
        path: normalizeProjectPath(file.path),
        content: file.content ?? '',
        language: 'csharp' as const,
      }))
      .filter(file => !!file.path);
  }

  private modelForProjectFile(file: CSharpProjectFileSnapshot): monaco.editor.ITextModel | undefined {
    const path = normalizeProjectPath(file.path);
    if (!path) return undefined;

    const existing = monaco.editor.getModels()
      .find(candidate => candidate.getLanguageId() === 'csharp' && currentModelPath(candidate) === path);
    if (existing) return existing;

    const uri = projectModelUriForPath(path);
    return monaco.editor.getModel(uri)
      ?? monaco.editor.createModel(file.content ?? '', 'csharp', uri);
  }

  private getProjectSemanticEntries(model: monaco.editor.ITextModel): { model: monaco.editor.ITextModel; index: CSharpSemanticIndex }[] {
    const projectFiles = this.getCSharpProjectFileSnapshots();
    const projectPaths = new Set(projectFiles.map(file => file.path));
    const candidates = monaco.editor.getModels()
      .filter(candidate => candidate.getLanguageId() === 'csharp')
      .filter(candidate => projectPaths.size === 0 || projectPaths.has(currentModelPath(candidate)));

    for (const file of projectFiles) {
      const fileModel = this.modelForProjectFile(file);
      if (fileModel && !candidates.includes(fileModel)) {
        candidates.push(fileModel);
      }
    }

    if (!candidates.includes(model)) {
      candidates.push(model);
    }

    const seen = new Set<string>();
    return candidates.flatMap(candidate => {
      const key = candidate.uri.toString();
      if (seen.has(key)) return [];
      seen.add(key);
      return [{ model: candidate, index: this.getSemanticIndex(candidate) }];
    });
  }

  private isProjectVisibleDeclaration(declaration: CSharpDeclaration, isActiveModel: boolean) {
    return isActiveModel || !['local', 'parameter', 'label'].includes(declaration.kind);
  }

  private findProjectDeclaration(
    model: monaco.editor.ITextModel,
    symbol: CSharpSemanticOccurrence
  ): { model: monaco.editor.ITextModel; index: CSharpSemanticIndex; declaration: CSharpDeclaration } | undefined {
    const entries = this.getProjectSemanticEntries(model);
    const activeEntry = entries.find(entry => entry.model === model);
    const localDeclaration = symbol.declaration ?? activeEntry?.index.declarations.find(declaration => declaration.token.index === symbol.token.index);
    if (localDeclaration && this.isProjectVisibleDeclaration(localDeclaration, true)) {
      return { model, index: activeEntry?.index ?? this.getSemanticIndex(model), declaration: localDeclaration };
    }

    const visibleDeclarations = entries.flatMap(entry => (
      entry.index.declarations
        .filter(declaration => declaration.name === symbol.name)
        .filter(declaration => this.isProjectVisibleDeclaration(declaration, entry.model === model))
        .map(declaration => ({ ...entry, declaration }))
    ));

    return visibleDeclarations.find(entry => entry.declaration.kind === symbol.kind)
      ?? visibleDeclarations.find(entry => areReferenceKindsCompatible(symbol.kind, entry.declaration.kind))
      ?? visibleDeclarations[0];
  }

  private projectReferencesFor(
    model: monaco.editor.ITextModel,
    symbol: CSharpSemanticOccurrence,
    includeDeclaration: boolean
  ): monaco.languages.Location[] {
    const declaration = this.findProjectDeclaration(model, symbol);
    const target = declaration?.declaration ?? symbol;
    const locations: monaco.languages.Location[] = [];
    const seen = new Set<string>();
    const entries = ['local', 'parameter', 'label'].includes(target.kind)
      ? this.getProjectSemanticEntries(model).filter(entry => entry.model === model)
      : this.getProjectSemanticEntries(model);

    for (const entry of entries) {
      for (const reference of entry.index.referencesFor(target, includeDeclaration)) {
        if (entry.index.tokens[reference.token.index] !== reference.token) continue;
        const range = reference.token.range;
        const key = `${entry.model.uri.toString()}:${range.startLineNumber}:${range.startColumn}:${range.endLineNumber}:${range.endColumn}`;
        if (seen.has(key)) continue;
        seen.add(key);
        locations.push({ uri: entry.model.uri, range });
      }
    }

    return locations;
  }

  private getSemanticIndex(model: monaco.editor.ITextModel): CSharpSemanticIndex {
    const versionId = model.getAlternativeVersionId();
    const cached = this.semanticCache.get(model);
    if (cached?.versionId === versionId) return cached.index;
    const index = buildCSharpSemanticIndex(model);
    this.semanticCache.set(model, { versionId, index });
    return index;
  }

  private toEditorRange(edit: any): monaco.IRange | undefined {
    const range = edit?.range ?? edit;
    if (
      typeof range?.startLineNumber === 'number' &&
      typeof range?.startColumn === 'number' &&
      typeof range?.endLineNumber === 'number' &&
      typeof range?.endColumn === 'number'
    ) {
      return range;
    }

    const start = range?.start ?? (typeof range?.startLine === 'number' ? { line: range.startLine, character: range.startColumn } : undefined);
    const end = range?.end ?? (typeof range?.endLine === 'number' ? { line: range.endLine, character: range.endColumn } : undefined);
    const startLine = start?.line ?? start?.Line;
    const startCharacter = start?.character ?? start?.Character;
    const endLine = end?.line ?? end?.Line;
    const endCharacter = end?.character ?? end?.Character;

    if (
      typeof startLine !== 'number' ||
      typeof startCharacter !== 'number' ||
      typeof endLine !== 'number' ||
      typeof endCharacter !== 'number'
    ) {
      return undefined;
    }

    return {
      startLineNumber: startLine + 1,
      startColumn: startCharacter + 1,
      endLineNumber: endLine + 1,
      endColumn: endCharacter + 1,
    };
  }
  private convertCompletion(
    model: monaco.editor.ITextModel,
    item: any,
    defaultRange: monaco.IRange | monaco.languages.CompletionItemRanges,
    snapshot?: CSharpCompletionRequestSnapshot,
    lateContext?: CSharpLateCompletionContext | null
  ): monaco.languages.CompletionItem | null {
    const label = csharpCompletionLabel(item);
    if (!label) return null;

    const textEdit = csharpCompletionTextEdit(item);
    const insertText = csharpCompletionInsertText(item, label);
    const initialRange = csharpCompletionRangeFromTextEdit(
      textEdit,
      defaultRange,
      edit => this.toEditorRange(edit)
    );
    const range = snapshot && lateContext
      ? csharpCompletionMapRangeToCurrent(initialRange, editRange => this.mapMainCompletionRangeToCurrent(model, editRange, snapshot, lateContext))
      : initialRange;

    if (!csharpCompletionIsValidRange(range)) return null;

    const completion: monaco.languages.CompletionItem = {
      label,
      kind: csharpCompletionNormalizeKind(item?.kind ?? item?.Kind),
      detail: csharpCompletionOptionalString(item?.detail ?? item?.Detail),
      documentation: csharpCompletionDocumentation(item?.documentation ?? item?.Documentation),
      commitCharacters: csharpCompletionStringArray(item?.commitCharacters ?? item?.CommitCharacters),
      preselect: !!(item?.preselect ?? item?.Preselect),
      filterText: csharpCompletionOptionalString(item?.filterText ?? item?.FilterText),
      insertText,
      insertTextRules: csharpCompletionInsertTextRules(item),
      range,
      tags: csharpCompletionTags(item?.tags ?? item?.Tags),
      sortText: csharpCompletionOptionalString(item?.sortText ?? item?.SortText) ?? label,
      additionalTextEdits: csharpCompletionAdditionalTextEdits(
        item?.additionalTextEdits ?? item?.AdditionalTextEdits,
        edit => this.toEditorRange(edit)
      ),
    };

    const labelDetails = item?.labelDetails ?? item?.LabelDetails;
    if (labelDetails && typeof labelDetails === 'object') (completion as any).labelDetails = labelDetails;

    const data = item?.data ?? item?.Data;
    if (data !== undefined) (completion as any).data = data;

    const command = item?.command ?? item?.Command;
    if (command && typeof command === 'object') (completion as any).command = command;

    return completion;
  }

  private mapMainCompletionRangeToCurrent(
    model: monaco.editor.ITextModel,
    range: monaco.IRange,
    snapshot: CSharpCompletionRequestSnapshot,
    lateContext: CSharpLateCompletionContext
  ): monaco.Range | null {
    const mapped = this.mapSnapshotRangeToCurrent(model, range, snapshot, lateContext, 'main');
    if (!mapped) return null;

    const currentOffset = snapshot.offset + lateContext.insertedLength;
    const startOffset = model.getOffsetAt({ lineNumber: mapped.startLineNumber, column: mapped.startColumn });
    const endOffset = model.getOffsetAt({ lineNumber: mapped.endLineNumber, column: mapped.endColumn });
    return startOffset <= currentOffset && currentOffset <= endOffset ? mapped : null;
  }

  private mapSnapshotRangeToCurrent(
    model: monaco.editor.ITextModel,
    range: monaco.IRange,
    snapshot: CSharpCompletionRequestSnapshot,
    lateContext: CSharpLateCompletionContext,
    mode: 'main' | 'edit'
  ): monaco.Range | null {
    const startOffset = offsetAtTextPosition(snapshot.code, range.startLineNumber, range.startColumn);
    const endOffset = offsetAtTextPosition(snapshot.code, range.endLineNumber, range.endColumn);
    if (startOffset == null || endOffset == null || startOffset > endOffset) return null;

    const insertedLength = lateContext.insertedLength;
    const insertionOffset = snapshot.offset;
    const mapStart = (offset: number) => offset < insertionOffset ? offset : offset + insertedLength;
    const mapEnd = (offset: number) => {
      if (offset < insertionOffset) return offset;
      if (mode === 'main' && offset === insertionOffset) return offset + insertedLength;
      return offset + insertedLength;
    };

    const mappedStart = mode === 'main' && startOffset <= insertionOffset ? startOffset : mapStart(startOffset);
    const mappedEnd = mapEnd(endOffset);
    if (mappedStart > mappedEnd || mappedEnd > model.getValueLength()) return null;

    const start = model.getPositionAt(mappedStart);
    const end = model.getPositionAt(mappedEnd);
    return new monaco.Range(start.lineNumber, start.column, end.lineNumber, end.column);
  }

  private positionRequest(position: monaco.IPosition) {
    return { Line: position.lineNumber - 1, Column: position.column - 1 };
  }

  private rangeRequest(range: monaco.IRange) {
    return {
      Start: { Line: range.startLineNumber - 1, Character: range.startColumn - 1 },
      End: { Line: range.endLineNumber - 1, Character: range.endColumn - 1 },
    };
  }

  private uriForLocation(model: monaco.editor.ITextModel, location: OmniSharpLocationDto): monaco.Uri {
    return this.uriForProjectPath(model, location.path);
  }

  private uriForProjectPath(model: monaco.editor.ITextModel, rawPath?: string): monaco.Uri {
    const path = normalizeProjectPath(rawPath ?? '');
    if (!path || path === currentModelPath(model)) return model.uri;

    const existing = monaco.editor.getModels()
      .find(candidate => candidate.getLanguageId() === 'csharp' && currentModelPath(candidate) === path);
    if (existing) return existing.uri;

    const projectFile = this.getCSharpProjectFileSnapshots().find(file => file.path === path);
    if (projectFile) {
      const projectModel = this.modelForProjectFile(projectFile);
      if (projectModel) return projectModel.uri;
    }

    return projectModelUriForPath(path);
  }

  private convertLocations(model: monaco.editor.ITextModel, response: unknown): monaco.languages.Location[] {
    if (!Array.isArray(response)) return [];
    return response.flatMap((location: OmniSharpLocationDto) => {
      const range = this.toEditorRange(location.range);
      return range ? [{ uri: this.uriForLocation(model, location), range }] : [];
    });
  }

  private convertWorkspaceEdit(model: monaco.editor.ITextModel, edit: OmniSharpTextEditDto): monaco.languages.IWorkspaceTextEdit[] {
    const range = this.toEditorRange(edit.range);
    if (!range) return [];

    const resource = this.uriForProjectPath(model, edit.path);
    return [{
      resource,
      textEdit: { range, text: edit.text },
      versionId: monaco.editor.getModel(resource)?.getVersionId() ?? model.getVersionId(),
    }];
  }

  private convertCodeActions(
    model: monaco.editor.ITextModel,
    response: unknown,
    markers: monaco.editor.IMarkerData[]
  ): monaco.languages.CodeAction[] {
    if (!Array.isArray(response)) return [];
    return response.flatMap((action: OmniSharpCodeActionDto) => {
      if (!action?.title) return [];
      const edits = (action.edits ?? []).flatMap(edit => this.convertWorkspaceEdit(model, edit));
      return [{
        title: action.title,
        kind: action.kind ?? 'quickfix',
        diagnostics: markers,
        edit: edits.length ? { edits } : undefined,
        isPreferred: !!action.isPreferred,
      }];
    });
  }

  private convertDocumentSymbols(response: unknown): monaco.languages.DocumentSymbol[] {
    if (!Array.isArray(response)) return [];
    return response.flatMap(symbol => this.convertDocumentSymbol(symbol as OmniSharpDocumentSymbolDto));
  }

  private convertDocumentSymbol(symbol: OmniSharpDocumentSymbolDto): monaco.languages.DocumentSymbol[] {
    const range = this.toEditorRange(symbol.range);
    const selectionRange = this.toEditorRange(symbol.selectionRange);
    if (!range || !selectionRange || !symbol.name) return [];
    return [{
      name: symbol.name,
      detail: symbol.detail ?? '',
      kind: documentSymbolKindFromOmniSharp(symbol.kind),
      range,
      selectionRange,
      tags: [],
      children: (symbol.children ?? []).flatMap(child => this.convertDocumentSymbol(child)),
    }];
  }

  private convertOmniSharpHover(response: unknown): monaco.languages.Hover | undefined {
    if (!response || typeof response !== 'object') return undefined;
    const hover = response as OmniSharpHoverDto;
    const markdown = this.extractHoverMarkdown(hover);
    if (!markdown) return undefined;

    const range = this.toEditorRange(hover.range);
    return {
      ...(range ? { range } : {}),
      contents: [{ value: markdown }],
    };
  }

  private extractHoverMarkdown(hover: OmniSharpHoverDto): string {
    if (typeof hover.markdown === 'string' && hover.markdown.trim()) {
      return hover.markdown.trim();
    }

    const contents = hover.contents;
    if (typeof contents === 'string') return contents.trim();
    if (Array.isArray(contents)) {
      return contents
        .map(content => typeof content === 'string' ? content : content?.value)
        .filter((value): value is string => typeof value === 'string' && !!value.trim())
        .map(value => value.trim())
        .join('\n\n');
    }
    if (contents && typeof contents.value === 'string') {
      return contents.value.trim();
    }
    return '';
  }

  private convertInlayHints(response: unknown): monaco.languages.InlayHint[] {
    if (!Array.isArray(response)) return [];
    return response.flatMap((hint: OmniSharpInlayHintDto) => {
      const line = hint.position?.line;
      const character = hint.position?.character;
      if (typeof line !== 'number' || typeof character !== 'number' || !hint.label) return [];
      return [{
        kind: hint.kind === 'parameter' ? monaco.languages.InlayHintKind.Parameter : monaco.languages.InlayHintKind.Type,
        label: hint.label,
        position: { lineNumber: line + 1, column: character + 1 },
        paddingLeft: !!hint.paddingLeft,
        paddingRight: !!hint.paddingRight,
      }];
    });
  }

  private convertFoldingRanges(response: unknown): monaco.languages.FoldingRange[] {
    if (!Array.isArray(response)) return [];
    return response.flatMap((range: OmniSharpFoldingRangeDto) => {
      if (typeof range?.start !== 'number' || typeof range?.end !== 'number' || range.end <= range.start) return [];
      return [{
        start: range.start,
        end: range.end,
        kind: range.kind === 'region'
          ? monaco.languages.FoldingRangeKind.Region
          : range.kind === 'comment'
            ? monaco.languages.FoldingRangeKind.Comment
            : undefined,
      }];
    });
  }

  private createDiagnosticProjectRequest(model: monaco.editor.ITextModel): CSharpDiagnosticProjectRequest {
    return this.createSerializedDiagnosticProjectRequest(model).request;
  }

  private createSerializedDiagnosticProjectRequest(model: monaco.editor.ITextModel): CSharpSerializedProjectRequest {
    const currentPath = currentModelPath(model);
    const seen = new Set<string>([currentPath]);
    const files: CSharpDiagnosticProjectRequest['Files'] = [];
    const fileKeyParts: string[] = [];

    for (const file of this.projectFilesProvider()) {
      if (file.language !== 'csharp') continue;
      const path = normalizeProjectPath(file.path);
      if (!path || seen.has(path)) continue;
      seen.add(path);
      const content = file.content ?? '';
      const cachedHash = this.projectFileHashCache.get(path);
      const hash = cachedHash && cachedHash.content === content
        ? cachedHash.hash
        : hashString(content);
      this.projectFileHashCache.set(path, { content, hash, length: content.length });
      fileKeyParts.push(`${path}:${content.length}:${hash}`);
      files.push({ Path: path, Content: content });
    }

    for (const path of this.projectFileHashCache.keys()) {
      if (!seen.has(path)) this.projectFileHashCache.delete(path);
    }

    const fileKey = fileKeyParts.join('|');
    const cached = this.projectRequestCache;
    if (cached && cached.currentPath === currentPath && cached.fileKey === fileKey) {
      return cached;
    }

    const request = { CurrentPath: currentPath, Files: files };
    const serialized = JSON.stringify(request);
    const snapshot = { request, serialized, fileKey, currentPath };
    this.projectRequestCache = snapshot;
    return snapshot;
  }

  private createDiagnosticCacheKey(
    snapshot: CSharpModelTextSnapshot,
    projectRequest: CSharpSerializedProjectRequest
  ) {
    return [
      snapshot.uri,
      snapshot.modelVersionId,
      snapshot.length,
      snapshot.hash,
      projectRequest.currentPath,
      projectRequest.fileKey,
      this.completionEnvironmentVersion,
    ].join(':');
  }

  private convertDiagnostics(model: monaco.editor.ITextModel, response: unknown): monaco.editor.IMarkerData[] {
    if (!Array.isArray(response)) return [];

    return response.flatMap((diagnostic: any) => {
      const range = this.toMarkerRange(model, diagnostic);
      const message = typeof diagnostic?.message === 'string' ? diagnostic.message : '';
      if (!range || !message) return [];
      return [{
        severity: this.toMarkerSeverity(diagnostic.severity),
        message,
        code: typeof diagnostic.id === 'string' && diagnostic.id ? diagnostic.id : undefined,
        source: 'local-omnisharp',
        ...range,
      }];
    });
  }

  private toMarkerRange(model: monaco.editor.ITextModel, diagnostic: any): monaco.IRange | undefined {
    const start = diagnostic?.start ?? diagnostic?.Start;
    const end = diagnostic?.end ?? diagnostic?.End;
    const startLine = start?.line ?? start?.Line;
    const startCharacter = start?.character ?? start?.Character;
    const endLine = end?.line ?? end?.Line;
    const endCharacter = end?.character ?? end?.Character;

    if (
      typeof startLine !== 'number' ||
      typeof startCharacter !== 'number' ||
      typeof endLine !== 'number' ||
      typeof endCharacter !== 'number'
    ) {
      return undefined;
    }

    const range = model.validateRange(new monaco.Range(
      startLine + 1,
      startCharacter + 1,
      endLine + 1,
      endCharacter + 1
    ));

    if (range.startLineNumber !== range.endLineNumber || range.startColumn !== range.endColumn) {
      return range;
    }

    const maxColumn = model.getLineMaxColumn(range.endLineNumber);
    return new monaco.Range(
      range.startLineNumber,
      range.startColumn,
      range.endLineNumber,
      Math.min(maxColumn, range.endColumn + 1)
    );
  }

  private encodeOmniSharpSemanticTokens(tokens: OmniSharpSemanticTokenDto[]) {
    const data: number[] = [];
    let previousLine = 0;
    let previousColumn = 0;
    const sorted = [...tokens].sort((a, b) => a.startLine - b.startLine || a.startColumn - b.startColumn || a.length - b.length);

    for (const token of sorted) {
      const tokenTypeIndex = csharpTokenTypeIndex.get(token.type);
      if (typeof tokenTypeIndex !== 'number' || token.length <= 0) continue;
      const modifierSet = (token.modifiers ?? []).reduce((mask, modifier) => mask | (csharpTokenModifierMask.get(modifier) || 0), 0);
      const deltaLine = token.startLine - previousLine;
      const deltaColumn = deltaLine === 0 ? token.startColumn - previousColumn : token.startColumn;
      if (deltaLine < 0 || deltaColumn < 0) continue;
      data.push(deltaLine, deltaColumn, token.length, tokenTypeIndex, modifierSet);
      previousLine = token.startLine;
      previousColumn = token.startColumn;
    }

    return new Uint32Array(data);
  }
}

type CSharpTokenKind = 'identifier' | 'keyword' | 'operator' | 'punct' | 'string' | 'number' | 'comment' | 'preprocessor';
type CSharpSymbolKind = 'namespace' | 'class' | 'record' | 'struct' | 'interface' | 'enum' | 'delegate' | 'typeParameter' | 'method' | 'extensionMethod' | 'constructor' | 'property' | 'field' | 'event' | 'enumMember' | 'parameter' | 'local' | 'constant' | 'label' | 'keyword';

interface CSharpToken {
  kind: CSharpTokenKind;
  value: string;
  offset: number;
  endOffset: number;
  line: number;
  column: number;
  index: number;
  range: monaco.Range;
}

interface CSharpDeclaration {
  name: string;
  kind: CSharpSymbolKind;
  token: CSharpToken;
  detail: string;
  typeName?: string;
  modifiers: CSharpSemanticTokenModifier[];
  declaration?: CSharpDeclaration;
  parent?: CSharpDeclaration;
  parameters?: string[];
  bodyRange?: monaco.Range;
  isWrite?: boolean;
}

interface CSharpSemanticOccurrence extends CSharpDeclaration {
  declaration?: CSharpDeclaration;
  isWrite?: boolean;
}

interface CSharpSemanticMark {
  token: CSharpToken;
  type: CSharpSemanticTokenType;
  modifiers: CSharpSemanticTokenModifier[];
  declaration?: CSharpDeclaration;
  isWrite?: boolean;
}

class CSharpSemanticIndex {
  constructor(
    readonly model: monaco.editor.ITextModel,
    readonly tokens: CSharpToken[],
    readonly declarations: CSharpDeclaration[],
    readonly marks: CSharpSemanticMark[],
    readonly encodedTokens: Uint32Array,
    readonly documentSymbols: monaco.languages.DocumentSymbol[],
    readonly foldingRanges: monaco.languages.FoldingRange[],
    readonly inlayHints: monaco.languages.InlayHint[],
    readonly usingRanges: monaco.Range[],
  ) {}

  symbolAt(position: monaco.IPosition): CSharpSemanticOccurrence | undefined {
    const token = findTokenAtPosition(this.tokens, position);
    if (!token || token.kind !== 'identifier') return undefined;
    const mark = this.marks.find(item => item.token.index === token.index);
    const declaration = mark?.declaration ?? this.declarations.find(item => item.token.index === token.index);
    return {
      name: token.value.replace(/^@/, ''),
      kind: declaration?.kind ?? semanticTypeToSymbolKind(mark?.type) ?? 'local',
      token,
      detail: declaration?.detail ?? `${semanticTypeToReadableName(mark?.type)} ${token.value}`,
      typeName: declaration?.typeName,
      modifiers: mark?.modifiers ?? [],
      declaration,
      isWrite: mark?.isWrite,
    };
  }

  referencesFor(symbol: CSharpSemanticOccurrence, includeDeclaration: boolean): CSharpSemanticOccurrence[] {
    const canonical = symbol.declaration ?? this.declarations.find(decl => decl.name === symbol.name && decl.kind === symbol.kind);
    const name = canonical?.name ?? symbol.name;
    const kind = canonical?.kind ?? symbol.kind;
    const references: CSharpSemanticOccurrence[] = [];

    for (const mark of this.marks) {
      const markName = mark.token.value.replace(/^@/, '');
      const declaration = mark.declaration;
      const sameDeclaration = canonical && declaration && declaration === canonical;
      const sameNameAndCompatibleKind = markName === name && areReferenceKindsCompatible(kind, semanticTypeToSymbolKind(mark.type));
      if (!sameDeclaration && !sameNameAndCompatibleKind) continue;
      if (!includeDeclaration && declaration?.token.index === mark.token.index) continue;
      references.push({
        name: markName,
        kind: declaration?.kind ?? semanticTypeToSymbolKind(mark.type) ?? kind,
        token: mark.token,
        detail: declaration?.detail ?? `${semanticTypeToReadableName(mark.type)} ${markName}`,
        typeName: declaration?.typeName,
        modifiers: mark.modifiers,
        declaration,
        isWrite: mark.isWrite,
      });
    }

    return references.length ? references : [symbol];
  }

  globalCompletions(): CSharpDeclaration[] {
    const seen = new Set<string>();
    return this.declarations.filter(decl => {
      const key = `${decl.kind}:${decl.name}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  }

  memberCompletions(): CSharpDeclaration[] {
    return this.globalCompletions().filter(decl => ['method', 'extensionMethod', 'property', 'field', 'event', 'enumMember'].includes(decl.kind));
  }

  callAt(position: monaco.Position): { label: string; parameters: string[]; activeParameter: number } | undefined {
    const offset = this.model.getOffsetAt(position);
    let depth = 0;
    let commaCount = 0;
    let openParen: CSharpToken | undefined;
    for (let i = this.tokens.length - 1; i >= 0; i -= 1) {
      const token = this.tokens[i];
      if (token.offset >= offset) continue;
      if (token.value === ')') depth += 1;
      if (token.value === '(') {
        if (depth === 0) { openParen = token; break; }
        depth -= 1;
      }
      if (depth === 0 && token.value === ',') commaCount += 1;
    }
    if (!openParen) return undefined;
    const callee = previousSignificantToken(this.tokens, openParen.index);
    if (!callee || callee.kind !== 'identifier') return undefined;
    const method = this.declarations.find(decl => decl.name === callee.value.replace(/^@/, '') && ['method', 'extensionMethod', 'constructor'].includes(decl.kind));
    if (!method?.parameters?.length) return undefined;
    const label = `${method.name}(${method.parameters.join(', ')})`;
    return { label, parameters: method.parameters, activeParameter: Math.min(commaCount, Math.max(0, method.parameters.length - 1)) };
  }

  selectionRangesAt(position: monaco.Position): monaco.languages.SelectionRange[] {
    const token = findTokenAtPosition(this.tokens, position);
    const lineRange = new monaco.Range(position.lineNumber, 1, position.lineNumber, this.model.getLineMaxColumn(position.lineNumber));
    const fullRange = this.model.getFullModelRange();
    const block = nearestBlockRange(this.tokens, position) ?? fullRange;
    const ranges = token ? [token.range, lineRange, block, fullRange] : [lineRange, block, fullRange];
    const seen = new Set<string>();
    return ranges
      .filter(range => {
        const key = `${range.startLineNumber}:${range.startColumn}:${range.endLineNumber}:${range.endColumn}`;
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
      })
      .map(range => ({ range }));
  }
}

const CSHARP_KEYWORDS = new Set([
  'abstract', 'add', 'alias', 'and', 'args', 'as', 'ascending', 'async', 'await', 'base', 'bool', 'break', 'by', 'byte', 'case',
  'catch', 'char', 'checked', 'class', 'const', 'continue', 'decimal', 'default', 'delegate', 'descending', 'do', 'double',
  'dynamic', 'else', 'enum', 'equals', 'event', 'explicit', 'extern', 'false', 'file', 'finally', 'fixed', 'float', 'for',
  'foreach', 'from', 'get', 'global', 'goto', 'group', 'if', 'implicit', 'in', 'init', 'int', 'interface', 'internal', 'into',
  'is', 'join', 'let', 'lock', 'long', 'managed', 'nameof', 'namespace', 'new', 'nint', 'not', 'notnull', 'nuint', 'null',
  'object', 'on', 'operator', 'or', 'orderby', 'out', 'override', 'params', 'partial', 'private', 'protected', 'public',
  'readonly', 'record', 'ref', 'remove', 'required', 'return', 'sbyte', 'scoped', 'sealed', 'select', 'set', 'short', 'sizeof',
  'stackalloc', 'static', 'string', 'struct', 'switch', 'this', 'throw', 'true', 'try', 'typeof', 'uint', 'ulong', 'unchecked',
  'unmanaged', 'unsafe', 'ushort', 'using', 'value', 'var', 'virtual', 'void', 'volatile', 'when', 'where', 'while', 'with', 'yield',
]);

const CSHARP_CONTROL_KEYWORDS = new Set([
  'break', 'case', 'catch', 'continue', 'default', 'do', 'else', 'finally', 'for', 'foreach', 'goto', 'if', 'lock', 'return',
  'switch', 'throw', 'try', 'while', 'yield', 'when',
]);

const CSHARP_TYPE_KEYWORDS = new Set([
  'bool', 'byte', 'char', 'decimal', 'double', 'dynamic', 'float', 'int', 'long', 'nint', 'nuint', 'object', 'sbyte', 'short',
  'string', 'uint', 'ulong', 'ushort', 'void', 'var',
]);

const CSHARP_MODIFIER_KEYWORDS = new Set([
  'abstract', 'async', 'const', 'extern', 'file', 'internal', 'new', 'override', 'partial', 'private', 'protected', 'public',
  'readonly', 'required', 'sealed', 'static', 'unsafe', 'virtual', 'volatile',
]);

const DEFAULT_TYPE_TO_NAMESPACE = new Map<string, string>([
  ['Console', 'System'], ['DateTime', 'System'], ['Exception', 'System'], ['Guid', 'System'], ['Math', 'System'], ['Object', 'System'],
  ['Random', 'System'], ['String', 'System'], ['Action', 'System'], ['Func', 'System'], ['Task', 'System.Threading.Tasks'],
  ['ValueTask', 'System.Threading.Tasks'], ['IEnumerable', 'System.Collections.Generic'], ['IList', 'System.Collections.Generic'],
  ['List', 'System.Collections.Generic'], ['Dictionary', 'System.Collections.Generic'], ['Enumerable', 'System.Linq'],
  ['Regex', 'System.Text.RegularExpressions'], ['StringBuilder', 'System.Text'],
]);

function buildCSharpSemanticIndex(model: monaco.editor.ITextModel): CSharpSemanticIndex {
  const source = model.getValue();
  const tokens = tokenizeCSharp(source, model);
  const declarations: CSharpDeclaration[] = [];
  const marks = new Map<number, CSharpSemanticMark>();
  const declarationByName = new Map<string, CSharpDeclaration[]>();
  const usingRanges: monaco.Range[] = [];

  const addMark = (token: CSharpToken | undefined, type: CSharpSemanticTokenType, modifiers: CSharpSemanticTokenModifier[] = [], declaration?: CSharpDeclaration, isWrite?: boolean) => {
    if (!token || token.kind !== 'identifier') return;
    const existing = marks.get(token.index);
    const priority = semanticTypePriority(type);
    const existingPriority = existing ? semanticTypePriority(existing.type) : -1;
    if (!existing || priority >= existingPriority) {
      marks.set(token.index, { token, type, modifiers: uniqueModifiers(modifiers), declaration, isWrite });
    }
  };

  const addDeclaration = (token: CSharpToken, kind: CSharpSymbolKind, detail: string, modifiers: CSharpSemanticTokenModifier[] = [], typeName?: string, parent?: CSharpDeclaration): CSharpDeclaration => {
    const decl: CSharpDeclaration = {
      name: token.value.replace(/^@/, ''),
      kind,
      token,
      detail,
      typeName,
      modifiers: uniqueModifiers(['declaration', ...modifiers]),
      parent,
    };
    decl.declaration = decl;
    declarations.push(decl);
    const list = declarationByName.get(decl.name) ?? [];
    list.push(decl);
    declarationByName.set(decl.name, list);
    addMark(token, symbolKindToSemanticType(kind), decl.modifiers, decl, true);
    return decl;
  };

  const blockStack: CSharpDeclaration[] = [];
  const pendingBlockDeclarations = new Map<number, CSharpDeclaration>();

  for (let i = 0; i < tokens.length; i += 1) {
    const token = tokens[i];

    if (token.value === '{') {
      const pending = pendingBlockDeclarations.get(token.index);
      if (pending) blockStack.push(pending);
      continue;
    }
    if (token.value === '}') {
      blockStack.pop();
      continue;
    }

    if (token.kind === 'preprocessor') {
      continue;
    }

    if (token.kind === 'keyword') {
      if (token.value === 'using') {
        usingRanges.push(lineRange(model, token.range.startLineNumber));
      }
      if (CSHARP_CONTROL_KEYWORDS.has(token.value)) {
        addMarkKeyword(token, 'csharpControlKeyword', marks);
      } else if (CSHARP_TYPE_KEYWORDS.has(token.value) || CSHARP_MODIFIER_KEYWORDS.has(token.value)) {
        addMarkKeyword(token, 'csharpKeyword', marks);
      }
    }

    if (token.value === 'namespace') {
      const nameTokens = collectQualifiedName(tokens, i + 1);
      if (nameTokens.length) {
        for (const nameToken of nameTokens) addDeclaration(nameToken, 'namespace', `namespace ${qualifiedNameText(nameTokens)}`);
      }
      continue;
    }

    if (['class', 'interface', 'struct', 'enum', 'delegate'].includes(token.value) || isRecordDeclaration(tokens, i)) {
      const kind: CSharpSymbolKind = token.value === 'record' ? 'record' : token.value as CSharpSymbolKind;
      const nameToken = nextIdentifier(tokens, i + 1);
      if (!nameToken) continue;
      const modifiers = collectModifiers(tokens, i);
      const decl = addDeclaration(nameToken, kind, `${kind} ${nameToken.value}`, modifiers, undefined, blockStack.at(-1));
      const openBrace = findNextToken(tokens, nameToken.index + 1, '{', 80);
      if (openBrace) pendingBlockDeclarations.set(openBrace.index, decl);
      markTypeParameters(tokens, nameToken.index, addDeclaration, addMark, decl);
      if (kind === 'delegate') {
        const delegateMethod = nameToken;
        addMark(delegateMethod, 'csharpDelegate', ['declaration', ...modifiers], decl, true);
      }
      continue;
    }

    if (isEnumMember(tokens, i, blockStack.at(-1))) {
      const decl = addDeclaration(token, 'enumMember', `enum member ${token.value}`, collectModifiers(tokens, i), undefined, blockStack.at(-1));
      addMark(token, 'csharpEnumMember', decl.modifiers, decl, true);
      continue;
    }

    if (isMethodLikeDeclaration(tokens, i)) {
      const openParen = tokens[i + 1];
      const closeParenIndex = openParen ? findMatchingToken(tokens, openParen.index, '(', ')') : -1;
      const currentType = nearestType(blockStack);
      const kind: CSharpSymbolKind = currentType && token.value === currentType.name ? 'constructor' : isExtensionMethod(tokens, openParen.index, closeParenIndex) ? 'extensionMethod' : 'method';
      const modifiers = collectModifiers(tokens, i);
      const returnType = collectTypeNameBefore(tokens, i);
      const decl = addDeclaration(token, kind, `${kind === 'constructor' ? '' : `${returnType || 'void'} `}${token.value}${parameterLabel(tokens, openParen.index, closeParenIndex)}`, modifiers, returnType, currentType);
      decl.parameters = collectParameterDeclarations(tokens, openParen.index, closeParenIndex, addDeclaration, addMark, decl).map(param => param.detail);
      const openBrace = closeParenIndex >= 0 ? findNextToken(tokens, closeParenIndex + 1, '{', 40) : undefined;
      if (openBrace) pendingBlockDeclarations.set(openBrace.index, decl);
      continue;
    }

    if (isPropertyDeclaration(tokens, i)) {
      const modifiers = collectModifiers(tokens, i);
      const typeName = collectTypeNameBefore(tokens, i);
      addDeclaration(token, 'property', `${typeName || 'var'} ${token.value}`, modifiers, typeName, nearestType(blockStack));
      continue;
    }

    if (isEventDeclaration(tokens, i)) {
      const modifiers = collectModifiers(tokens, i);
      const typeName = collectTypeNameBefore(tokens, i);
      addDeclaration(token, 'event', `event ${typeName || ''} ${token.value}`.trim(), modifiers, typeName, nearestType(blockStack));
      continue;
    }

    if (isFieldOrLocalDeclaration(tokens, i)) {
      const modifiers = collectModifiers(tokens, i);
      const typeName = collectTypeNameBefore(tokens, i);
      const inType = !!nearestType(blockStack) && !nearestMethod(blockStack);
      const isConst = hasModifierBefore(tokens, i, 'const');
      const kind: CSharpSymbolKind = isConst ? 'constant' : inType ? 'field' : 'local';
      addDeclaration(token, kind, `${typeName || 'var'} ${token.value}`, modifiers, typeName, inType ? nearestType(blockStack) : nearestMethod(blockStack));
      continue;
    }
  }

  for (const token of tokens) {
    if (token.kind !== 'identifier' || marks.has(token.index)) continue;
    const cleanName = token.value.replace(/^@/, '');
    const declarationsForName = declarationByName.get(cleanName) ?? [];
    const declaration = chooseBestDeclarationForToken(token, declarationsForName, tokens);
    const semanticType = declaration ? symbolKindToSemanticType(declaration.kind) : inferUsageType(token, tokens);
    const modifiers = declaration ? declaration.modifiers.filter(m => m !== 'declaration') : inferUsageModifiers(cleanName);
    const isWrite = isWriteAccess(tokens, token.index);
    addMark(token, semanticType, modifiers, declaration, isWrite);
  }

  const markArray = [...marks.values()].sort((a, b) => a.token.line - b.token.line || a.token.column - b.token.column || a.token.endOffset - b.token.endOffset);
  return new CSharpSemanticIndex(
    model,
    tokens,
    declarations,
    markArray,
    encodeCSharpSemanticTokens(markArray),
    buildDocumentSymbols(model, declarations),
    buildFoldingRanges(model, source, tokens),
    buildInlayHints(model, tokens, declarations),
    usingRanges,
  );
}

function tokenizeCSharp(source: string, model: monaco.editor.ITextModel): CSharpToken[] {
  const tokens: CSharpToken[] = [];
  let offset = 0;

  const push = (kind: CSharpTokenKind, value: string, start: number, end: number) => {
    const startPosition = model.getPositionAt(start);
    const endPosition = model.getPositionAt(end);
    tokens.push({
      kind,
      value,
      offset: start,
      endOffset: end,
      line: startPosition.lineNumber - 1,
      column: startPosition.column - 1,
      index: tokens.length,
      range: new monaco.Range(startPosition.lineNumber, startPosition.column, endPosition.lineNumber, endPosition.column),
    });
  };

  while (offset < source.length) {
    const start = offset;
    const ch = source[offset];
    const next = source[offset + 1];

    if (/\s/.test(ch)) { offset += 1; continue; }

    if (ch === '/' && next === '/') {
      offset += 2;
      while (offset < source.length && source[offset] !== '\n' && source[offset] !== '\r') offset += 1;
      push('comment', source.slice(start, offset), start, offset);
      continue;
    }

    if (ch === '/' && next === '*') {
      offset += 2;
      while (offset < source.length && !(source[offset] === '*' && source[offset + 1] === '/')) offset += 1;
      offset = Math.min(source.length, offset + 2);
      push('comment', source.slice(start, offset), start, offset);
      continue;
    }

    if (ch === '#') {
      offset += 1;
      while (offset < source.length && source[offset] !== '\n' && source[offset] !== '\r') offset += 1;
      push('preprocessor', source.slice(start, offset), start, offset);
      continue;
    }

    const interpolatedPrefixLength = readInterpolatedStringPrefix(source, offset);
    if (interpolatedPrefixLength || ch === '"' || ch === '\'' || (ch === '@' && next === '"')) {
      offset = scanCSharpString(source, offset);
      push('string', source.slice(start, offset), start, offset);
      continue;
    }

    if (ch === '@' && isIdentifierStart(source, offset + 1)) {
      offset += 2;
      while (offset < source.length && isIdentifierPart(source, offset)) offset = advanceCodePoint(source, offset);
      push('identifier', source.slice(start, offset), start, offset);
      continue;
    }

    if (isIdentifierStart(source, offset)) {
      offset = advanceCodePoint(source, offset);
      while (offset < source.length && isIdentifierPart(source, offset)) offset = advanceCodePoint(source, offset);
      const value = source.slice(start, offset);
      push(CSHARP_KEYWORDS.has(value) ? 'keyword' : 'identifier', value, start, offset);
      continue;
    }

    if (/\d/.test(ch)) {
      offset += 1;
      while (offset < source.length && /[\w.]/.test(source[offset])) offset += 1;
      push('number', source.slice(start, offset), start, offset);
      continue;
    }

    const op = readOperator(source, offset);
    offset += op.length;
    push(PUNCTUATION.has(op) ? 'punct' : 'operator', op, start, offset);
  }

  return tokens;
}

const PUNCTUATION = new Set(['{', '}', '(', ')', '[', ']', ';', ',', '.', ':']);
const OPERATORS = ['??=', '=>', '==', '!=', '<=', '>=', '++', '--', '&&', '||', '??', '::', '?.', '?[', '<<', '>>', '+=', '-=', '*=', '/=', '%=', '&=', '|=', '^=', '=>', '..'];

function readOperator(source: string, offset: number) {
  for (const op of OPERATORS) {
    if (source.startsWith(op, offset)) return op;
  }
  return source[offset];
}

function readInterpolatedStringPrefix(source: string, offset: number) {
  const slice = source.slice(offset, offset + 3).toLowerCase();
  if (slice.startsWith('$@"') || slice.startsWith('@$"')) return 3;
  const short = source.slice(offset, offset + 2).toLowerCase();
  if (short === '$"') return 2;
  return 0;
}

function scanCSharpString(source: string, offset: number) {
  const prefixLength = readInterpolatedStringPrefix(source, offset);
  const verbatim = source[offset] === '@' || source[offset + 1] === '@' || source[offset + 2] === '@';
  if (prefixLength) offset += prefixLength;
  else if (source[offset] === '@' && source[offset + 1] === '"') offset += 1;
  const quote = source[offset];
  offset += 1;
  if (quote === '\'') {
    while (offset < source.length) {
      if (source[offset] === '\\') offset += 2;
      else if (source[offset] === '\'') return offset + 1;
      else offset += 1;
    }
    return offset;
  }
  while (offset < source.length) {
    if (!verbatim && source[offset] === '\\') { offset += 2; continue; }
    if (verbatim && source[offset] === '"' && source[offset + 1] === '"') { offset += 2; continue; }
    if (source[offset] === '"') return offset + 1;
    offset += 1;
  }
  return offset;
}

function isIdentifierStart(source: string, offset: number) {
  const char = String.fromCodePoint(source.codePointAt(offset) || 0);
  return char === '_' || /\p{ID_Start}/u.test(char);
}

function isIdentifierPart(source: string, offset: number) {
  const char = String.fromCodePoint(source.codePointAt(offset) || 0);
  return char === '_' || /\p{ID_Continue}/u.test(char);
}

function retreatCodePoint(source: string, offset: number) {
  if (offset <= 0) return -1;
  const previous = offset - 1;
  const code = source.charCodeAt(previous);
  return code >= 0xDC00 && code <= 0xDFFF && previous > 0 ? previous - 1 : previous;
}

function advanceCodePoint(source: string, offset: number) {
  const codePoint = source.codePointAt(offset);
  return offset + (codePoint && codePoint > 0xFFFF ? 2 : 1);
}

function isValidCSharpCompletionFilterPrefix(prefix: string) {
  if (!prefix) return false;
  let offset = 0;

  if (prefix[offset] === '@') {
    offset += 1;
    if (offset === prefix.length) return true;
  }

  if (!isIdentifierStart(prefix, offset)) return false;
  offset = advanceCodePoint(prefix, offset);
  while (offset < prefix.length) {
    if (!isIdentifierPart(prefix, offset)) return false;
    offset = advanceCodePoint(prefix, offset);
  }
  return true;
}

function positionsEqual(a: monaco.IPosition, b: monaco.IPosition) {
  return a.lineNumber === b.lineNumber && a.column === b.column;
}

function offsetAtTextPosition(text: string, lineNumber: number, column: number) {
  if (lineNumber < 1 || column < 1) return null;

  let offset = 0;
  for (let line = 1; line < lineNumber; line += 1) {
    const nextLine = text.indexOf('\n', offset);
    if (nextLine < 0) return null;
    offset = nextLine + 1;
  }

  const nextLine = text.indexOf('\n', offset);
  let lineEnd = nextLine < 0 ? text.length : nextLine;
  if (lineEnd > offset && text[lineEnd - 1] === '\r') {
    lineEnd -= 1;
  }

  const target = offset + column - 1;
  return target <= lineEnd ? target : null;
}

function positionAtTextOffset(text: string, targetOffset: number): monaco.Position | null {
  if (targetOffset < 0 || targetOffset > text.length) return null;

  let lineNumber = 1;
  let lineStart = 0;
  for (let offset = 0; offset < targetOffset; offset += 1) {
    if (text.charCodeAt(offset) === 10) {
      lineNumber += 1;
      lineStart = offset + 1;
    }
  }

  return new monaco.Position(lineNumber, targetOffset - lineStart + 1);
}

function addMarkKeyword(token: CSharpToken, type: CSharpSemanticTokenType, marks: Map<number, CSharpSemanticMark>) {
  marks.set(token.index, { token, type, modifiers: [] });
}

function nextIdentifier(tokens: CSharpToken[], startIndex: number) {
  for (let i = startIndex; i < tokens.length; i += 1) {
    if (tokens[i].kind === 'identifier') return tokens[i];
    if (!['keyword', 'identifier'].includes(tokens[i].kind) && !['.', '<', '>'].includes(tokens[i].value)) return undefined;
  }
  return undefined;
}

function collectQualifiedName(tokens: CSharpToken[], startIndex: number) {
  const result: CSharpToken[] = [];
  for (let i = startIndex; i < tokens.length; i += 1) {
    if (tokens[i].kind === 'identifier') { result.push(tokens[i]); continue; }
    if (tokens[i].value === '.') continue;
    break;
  }
  return result;
}

function qualifiedNameText(tokens: CSharpToken[]) {
  return tokens.map(token => token.value).join('.');
}

function isRecordDeclaration(tokens: CSharpToken[], index: number) {
  return tokens[index].value === 'record' && !!nextIdentifier(tokens, index + 1);
}

function findNextToken(tokens: CSharpToken[], startIndex: number, value: string, limit = 120) {
  for (let i = startIndex; i < Math.min(tokens.length, startIndex + limit); i += 1) {
    if (tokens[i].value === value) return tokens[i];
    if (tokens[i].value === ';') return undefined;
  }
  return undefined;
}

function previousSignificantToken(tokens: CSharpToken[], index: number) {
  for (let i = index - 1; i >= 0; i -= 1) {
    if (!['comment', 'string', 'preprocessor'].includes(tokens[i].kind)) return tokens[i];
  }
  return undefined;
}

function nextSignificantToken(tokens: CSharpToken[], index: number) {
  for (let i = index + 1; i < tokens.length; i += 1) {
    if (!['comment', 'string', 'preprocessor'].includes(tokens[i].kind)) return tokens[i];
  }
  return undefined;
}

function findMatchingToken(tokens: CSharpToken[], openIndex: number, open: string, close: string) {
  let depth = 0;
  for (let i = openIndex; i < tokens.length; i += 1) {
    if (tokens[i].value === open) depth += 1;
    if (tokens[i].value === close) {
      depth -= 1;
      if (depth === 0) return i;
    }
  }
  return -1;
}

function isMethodLikeDeclaration(tokens: CSharpToken[], index: number) {
  const token = tokens[index];
  if (token.kind !== 'identifier') return false;
  const next = tokens[index + 1];
  if (!next || next.value !== '(') return false;
  const prev = previousSignificantToken(tokens, index);
  if (!prev || ['if', 'for', 'foreach', 'while', 'switch', 'catch', 'using', 'lock', 'nameof', 'typeof', 'sizeof'].includes(prev.value)) return false;
  if (prev.value === '.') return false;
  const closeParenIndex = findMatchingToken(tokens, next.index, '(', ')');
  if (closeParenIndex < 0) return false;
  const after = nextSignificantToken(tokens, closeParenIndex);
  return !!after && ['{', ';', '=>', 'where', ':'].includes(after.value);
}

function isExtensionMethod(tokens: CSharpToken[], openParenIndex: number, closeParenIndex: number) {
  if (openParenIndex < 0 || closeParenIndex < 0) return false;
  for (let i = openParenIndex + 1; i < closeParenIndex; i += 1) {
    if (tokens[i].value === 'this') return true;
    if (tokens[i].value === ',') return false;
  }
  return false;
}

function parameterLabel(tokens: CSharpToken[], openParenIndex: number, closeParenIndex: number) {
  if (openParenIndex < 0 || closeParenIndex < 0) return '()';
  return tokens.slice(openParenIndex, closeParenIndex + 1).map(token => token.value).join(' ').replace(/\s+([,()<>])/g, '$1').replace(/([(<,])\s+/g, '$1');
}

function collectParameterDeclarations(
  tokens: CSharpToken[],
  openParenIndex: number,
  closeParenIndex: number,
  addDeclaration: (token: CSharpToken, kind: CSharpSymbolKind, detail: string, modifiers?: CSharpSemanticTokenModifier[], typeName?: string, parent?: CSharpDeclaration) => CSharpDeclaration,
  addMark: (token: CSharpToken | undefined, type: CSharpSemanticTokenType, modifiers?: CSharpSemanticTokenModifier[], declaration?: CSharpDeclaration, isWrite?: boolean) => void,
  parent: CSharpDeclaration,
) {
  const parameters: CSharpDeclaration[] = [];
  if (openParenIndex < 0 || closeParenIndex < 0) return parameters;
  let start = openParenIndex + 1;
  for (let i = openParenIndex + 1; i <= closeParenIndex; i += 1) {
    if (i === closeParenIndex || tokens[i].value === ',') {
      const segment = tokens.slice(start, i).filter(token => token.kind !== 'comment');
      const nameToken = [...segment].reverse().find(token => token.kind === 'identifier');
      if (nameToken) {
        const typeName = segment.slice(0, segment.findIndex(token => token.index === nameToken.index)).map(token => token.value).join(' ').trim();
        const decl = addDeclaration(nameToken, 'parameter', `${typeName} ${nameToken.value}`.trim(), ['declaration'], typeName, parent);
        addMark(nameToken, 'csharpParameter', ['declaration'], decl, true);
        parameters.push(decl);
      }
      start = i + 1;
    }
  }
  return parameters;
}

function markTypeParameters(
  tokens: CSharpToken[],
  nameIndex: number,
  addDeclaration: (token: CSharpToken, kind: CSharpSymbolKind, detail: string, modifiers?: CSharpSemanticTokenModifier[], typeName?: string, parent?: CSharpDeclaration) => CSharpDeclaration,
  addMark: (token: CSharpToken | undefined, type: CSharpSemanticTokenType, modifiers?: CSharpSemanticTokenModifier[], declaration?: CSharpDeclaration, isWrite?: boolean) => void,
  parent: CSharpDeclaration,
) {
  if (tokens[nameIndex + 1]?.value !== '<') return;
  const close = findMatchingGeneric(tokens, nameIndex + 1);
  if (close < 0) return;
  for (let i = nameIndex + 2; i < close; i += 1) {
    if (tokens[i].kind === 'identifier') {
      const decl = addDeclaration(tokens[i], 'typeParameter', `type parameter ${tokens[i].value}`, ['declaration'], undefined, parent);
      addMark(tokens[i], 'csharpTypeParameter', ['declaration'], decl, true);
    }
  }
}

function findMatchingGeneric(tokens: CSharpToken[], openIndex: number) {
  let depth = 0;
  for (let i = openIndex; i < tokens.length; i += 1) {
    if (tokens[i].value === '<') depth += 1;
    if (tokens[i].value === '>') {
      depth -= 1;
      if (depth === 0) return i;
    }
    if (tokens[i].value === '{' || tokens[i].value === ';') return -1;
  }
  return -1;
}

function isPropertyDeclaration(tokens: CSharpToken[], index: number) {
  const token = tokens[index];
  if (token.kind !== 'identifier') return false;
  const next = nextSignificantToken(tokens, index);
  if (!next || next.value !== '{') return false;
  const prev = previousSignificantToken(tokens, index);
  if (!prev || prev.value === '.') return false;
  const close = findMatchingToken(tokens, next.index, '{', '}');
  if (close < 0) return false;
  return tokens.slice(next.index + 1, close).some(t => t.value === 'get' || t.value === 'set' || t.value === 'init');
}

function isEventDeclaration(tokens: CSharpToken[], index: number) {
  const token = tokens[index];
  if (token.kind !== 'identifier') return false;
  for (let i = Math.max(0, index - 5); i < index; i += 1) {
    if (tokens[i].value === 'event') return true;
  }
  return false;
}

function isFieldOrLocalDeclaration(tokens: CSharpToken[], index: number) {
  const token = tokens[index];
  if (token.kind !== 'identifier') return false;
  const next = nextSignificantToken(tokens, index);
  if (!next || !['=', ';', ',', ')'].includes(next.value)) return false;
  const prev = previousSignificantToken(tokens, index);
  if (!prev) return false;
  if (['.', 'return', 'throw', 'case'].includes(prev.value)) return false;
  if (prev.kind === 'identifier' || prev.kind === 'keyword' || prev.value === ']' || prev.value === '>') {
    const beforePrev = previousSignificantToken(tokens, prev.index);
    if (beforePrev?.value === '.') return false;
    if (beforePrev?.value === 'new') return false;
    return true;
  }
  return false;
}

function isEnumMember(tokens: CSharpToken[], index: number, parent?: CSharpDeclaration) {
  if (!parent || parent.kind !== 'enum' || tokens[index].kind !== 'identifier') return false;
  const prev = previousSignificantToken(tokens, index);
  const next = nextSignificantToken(tokens, index);
  return (!prev || ['{', ','].includes(prev.value)) && !!next && ['=', ',', '}'].includes(next.value);
}

function collectModifiers(tokens: CSharpToken[], index: number): CSharpSemanticTokenModifier[] {
  const modifiers: CSharpSemanticTokenModifier[] = [];
  for (let i = index - 1; i >= Math.max(0, index - 12); i -= 1) {
    const value = tokens[i].value;
    if (value === ';' || value === '{' || value === '}') break;
    if (value === 'static') modifiers.push('static');
    if (value === 'readonly' || value === 'const') modifiers.push('readonly');
    if (value === 'abstract') modifiers.push('abstract');
    if (value === 'async') modifiers.push('async');
    if (value === 'virtual') modifiers.push('virtual');
    if (value === 'override') modifiers.push('override');
    if (value === 'unsafe') modifiers.push('unsafe');
  }
  return uniqueModifiers(modifiers);
}

function hasModifierBefore(tokens: CSharpToken[], index: number, modifier: string) {
  for (let i = index - 1; i >= Math.max(0, index - 12); i -= 1) {
    if (tokens[i].value === ';' || tokens[i].value === '{' || tokens[i].value === '}') break;
    if (tokens[i].value === modifier) return true;
  }
  return false;
}

function collectTypeNameBefore(tokens: CSharpToken[], index: number) {
  const parts: string[] = [];
  for (let i = index - 1; i >= Math.max(0, index - 24); i -= 1) {
    const token = tokens[i];
    if ([';', '{', '}', '(', ')', ','].includes(token.value)) break;
    if (CSHARP_MODIFIER_KEYWORDS.has(token.value) || token.value === 'event') continue;
    parts.unshift(token.value);
  }
  return parts.join(' ').trim();
}

function nearestType(stack: CSharpDeclaration[]) {
  return [...stack].reverse().find(decl => ['class', 'record', 'struct', 'interface', 'enum'].includes(decl.kind));
}

function nearestMethod(stack: CSharpDeclaration[]) {
  return [...stack].reverse().find(decl => ['method', 'extensionMethod', 'constructor'].includes(decl.kind));
}

function chooseBestDeclarationForToken(token: CSharpToken, declarations: CSharpDeclaration[], tokens: CSharpToken[]) {
  if (!declarations.length) return undefined;
  const next = nextSignificantToken(tokens, token.index);
  if (next?.value === '(') {
    return declarations.find(decl => ['method', 'extensionMethod', 'constructor'].includes(decl.kind)) ?? declarations[0];
  }
  const prev = previousSignificantToken(tokens, token.index);
  if (prev?.value === '.') {
    return declarations.find(decl => ['property', 'field', 'method', 'extensionMethod', 'event', 'enumMember'].includes(decl.kind)) ?? declarations[0];
  }
  if (/^[A-Z]/.test(token.value)) {
    return declarations.find(decl => ['class', 'record', 'struct', 'interface', 'enum', 'delegate', 'typeParameter'].includes(decl.kind)) ?? declarations[0];
  }
  return declarations.find(decl => ['local', 'parameter', 'field', 'property'].includes(decl.kind)) ?? declarations[0];
}

function inferUsageType(token: CSharpToken, tokens: CSharpToken[]): CSharpSemanticTokenType {
  const cleanName = token.value.replace(/^@/, '');
  const next = nextSignificantToken(tokens, token.index);
  const prev = previousSignificantToken(tokens, token.index);
  if (DEFAULT_TYPE_TO_NAMESPACE.has(cleanName)) return 'csharpClass';
  if (next?.value === '(') return prev?.value === 'new' ? 'csharpConstructor' : 'csharpMethod';
  if (prev?.value === '.') return /^[A-Z]/.test(cleanName) ? 'csharpProperty' : 'csharpField';
  if (/^[A-Z]/.test(cleanName)) return cleanName.startsWith('I') && cleanName.length > 1 && /[A-Z]/.test(cleanName[1]) ? 'csharpInterface' : 'csharpClass';
  return 'csharpLocal';
}

function inferUsageModifiers(cleanName: string): CSharpSemanticTokenModifier[] {
  return DEFAULT_TYPE_TO_NAMESPACE.has(cleanName) ? ['defaultLibrary'] : [];
}

function isWriteAccess(tokens: CSharpToken[], index: number) {
  const next = nextSignificantToken(tokens, index);
  return !!next && ['=', '+=', '-=', '*=', '/=', '%=', '++', '--'].includes(next.value);
}

function symbolKindToSemanticType(kind: CSharpSymbolKind): CSharpSemanticTokenType {
  switch (kind) {
    case 'namespace': return 'csharpNamespace';
    case 'class': return 'csharpClass';
    case 'record': return 'csharpRecord';
    case 'struct': return 'csharpStruct';
    case 'interface': return 'csharpInterface';
    case 'enum': return 'csharpEnum';
    case 'delegate': return 'csharpDelegate';
    case 'typeParameter': return 'csharpTypeParameter';
    case 'method': return 'csharpMethod';
    case 'extensionMethod': return 'csharpExtensionMethod';
    case 'constructor': return 'csharpConstructor';
    case 'property': return 'csharpProperty';
    case 'field': return 'csharpField';
    case 'event': return 'csharpEvent';
    case 'enumMember': return 'csharpEnumMember';
    case 'parameter': return 'csharpParameter';
    case 'constant': return 'csharpConstant';
    case 'label': return 'csharpLabel';
    default: return 'csharpLocal';
  }
}

function semanticTypeToSymbolKind(type?: CSharpSemanticTokenType): CSharpSymbolKind | undefined {
  if (!type) return undefined;
  switch (type) {
    case 'csharpNamespace': return 'namespace';
    case 'csharpClass': return 'class';
    case 'csharpRecord': return 'record';
    case 'csharpStruct': return 'struct';
    case 'csharpInterface': return 'interface';
    case 'csharpEnum': return 'enum';
    case 'csharpDelegate': return 'delegate';
    case 'csharpTypeParameter': return 'typeParameter';
    case 'csharpMethod': return 'method';
    case 'csharpExtensionMethod': return 'extensionMethod';
    case 'csharpConstructor': return 'constructor';
    case 'csharpProperty': return 'property';
    case 'csharpField': return 'field';
    case 'csharpEvent': return 'event';
    case 'csharpEnumMember': return 'enumMember';
    case 'csharpParameter': return 'parameter';
    case 'csharpConstant': return 'constant';
    case 'csharpLabel': return 'label';
    default: return 'local';
  }
}

function semanticTypeToReadableName(type?: CSharpSemanticTokenType) {
  return (type ?? 'symbol').replace(/^csharp/, '').replace(/[A-Z]/g, part => ` ${part.toLowerCase()}`).trim();
}

function semanticTypePriority(type: CSharpSemanticTokenType) {
  const order: CSharpSemanticTokenType[] = [
    'csharpKeyword', 'csharpLocal', 'csharpParameter', 'csharpField', 'csharpProperty', 'csharpMethod', 'csharpExtensionMethod',
    'csharpConstructor', 'csharpClass', 'csharpStruct', 'csharpRecord', 'csharpInterface', 'csharpEnum', 'csharpDelegate',
    'csharpTypeParameter', 'csharpNamespace', 'csharpEnumMember', 'csharpConstant', 'csharpEvent', 'csharpControlKeyword', 'csharpPreprocessor',
  ];
  return order.indexOf(type);
}

function uniqueModifiers(modifiers: CSharpSemanticTokenModifier[]): CSharpSemanticTokenModifier[] {
  return [...new Set(modifiers)];
}

function encodeCSharpSemanticTokens(marks: CSharpSemanticMark[]) {
  const data: number[] = [];
  let previousLine = 0;
  let previousColumn = 0;
  for (const mark of marks) {
    const tokenTypeIndex = csharpTokenTypeIndex.get(mark.type);
    if (typeof tokenTypeIndex !== 'number') continue;
    const modifierSet = mark.modifiers.reduce((mask, modifier) => mask | (csharpTokenModifierMask.get(modifier) || 0), 0);
    const deltaLine = mark.token.line - previousLine;
    const deltaColumn = deltaLine === 0 ? mark.token.column - previousColumn : mark.token.column;
    if (deltaLine < 0 || deltaColumn < 0) continue;
    data.push(deltaLine, deltaColumn, mark.token.endOffset - mark.token.offset, tokenTypeIndex, modifierSet);
    previousLine = mark.token.line;
    previousColumn = mark.token.column;
  }
  return new Uint32Array(data);
}

function buildDocumentSymbols(model: monaco.editor.ITextModel, declarations: CSharpDeclaration[]): monaco.languages.DocumentSymbol[] {
  const byDeclaration = new Map<CSharpDeclaration, monaco.languages.DocumentSymbol>();
  const roots: monaco.languages.DocumentSymbol[] = [];

  for (const decl of declarations) {
    if (['parameter', 'local', 'constant', 'typeParameter', 'label'].includes(decl.kind)) continue;
    const symbol: monaco.languages.DocumentSymbol = {
      name: decl.name,
      detail: decl.detail,
      kind: documentSymbolKindForSymbolKind(decl.kind),
      range: expandSymbolRange(model, decl.token.range),
      selectionRange: decl.token.range,
      tags: [],
      children: [],
    };
    byDeclaration.set(decl, symbol);
    const parentSymbol = decl.parent ? byDeclaration.get(decl.parent) : undefined;
    if (parentSymbol) parentSymbol.children!.push(symbol);
    else roots.push(symbol);
  }
  return roots;
}

function expandSymbolRange(model: monaco.editor.ITextModel, range: monaco.Range) {
  return new monaco.Range(range.startLineNumber, 1, range.endLineNumber, model.getLineMaxColumn(range.endLineNumber));
}

function documentSymbolKindForSymbolKind(kind: CSharpSymbolKind) {
  switch (kind) {
    case 'namespace': return monaco.languages.SymbolKind.Module;
    case 'class':
    case 'record': return monaco.languages.SymbolKind.Class;
    case 'struct': return monaco.languages.SymbolKind.Struct;
    case 'interface': return monaco.languages.SymbolKind.Interface;
    case 'enum': return monaco.languages.SymbolKind.Enum;
    case 'delegate': return monaco.languages.SymbolKind.Function;
    case 'method':
    case 'extensionMethod':
    case 'constructor': return monaco.languages.SymbolKind.Method;
    case 'property': return monaco.languages.SymbolKind.Property;
    case 'field': return monaco.languages.SymbolKind.Field;
    case 'event': return monaco.languages.SymbolKind.Event;
    case 'enumMember': return monaco.languages.SymbolKind.EnumMember;
    default: return monaco.languages.SymbolKind.Variable;
  }
}

function documentSymbolKindFromOmniSharp(kind?: string) {
  switch ((kind ?? '').toLowerCase()) {
    case 'namespace': return monaco.languages.SymbolKind.Module;
    case 'class': return monaco.languages.SymbolKind.Class;
    case 'record': return monaco.languages.SymbolKind.Class;
    case 'struct': return monaco.languages.SymbolKind.Struct;
    case 'interface': return monaco.languages.SymbolKind.Interface;
    case 'enum': return monaco.languages.SymbolKind.Enum;
    case 'delegate': return monaco.languages.SymbolKind.Function;
    case 'method': return monaco.languages.SymbolKind.Method;
    case 'constructor': return monaco.languages.SymbolKind.Constructor;
    case 'property': return monaco.languages.SymbolKind.Property;
    case 'field': return monaco.languages.SymbolKind.Field;
    case 'event': return monaco.languages.SymbolKind.Event;
    case 'enummember': return monaco.languages.SymbolKind.EnumMember;
    default: return monaco.languages.SymbolKind.Variable;
  }
}

function mergeLocations(locations: monaco.languages.Location[]) {
  const seen = new Set<string>();
  return locations.filter(location => {
    const range = location.range;
    const key = `${location.uri.toString()}:${range.startLineNumber}:${range.startColumn}:${range.endLineNumber}:${range.endColumn}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function mergeWorkspaceTextEdits(edits: monaco.languages.IWorkspaceTextEdit[]) {
  const seen = new Set<string>();
  return edits.filter(edit => {
    const range = edit.textEdit.range;
    const key = `${edit.resource.toString()}:${range.startLineNumber}:${range.startColumn}:${range.endLineNumber}:${range.endColumn}:${edit.textEdit.text}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function dedupeCodeActions(actions: monaco.languages.CodeAction[]) {
  const seen = new Set<string>();
  return actions.filter(action => {
    const key = `${action.kind}:${action.title}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function areReferenceKindsCompatible(target: CSharpSymbolKind, actual?: CSharpSymbolKind) {
  if (!actual) return true;
  if (target === actual) return true;
  const memberKinds = new Set(['method', 'extensionMethod', 'property', 'field', 'event', 'enumMember']);
  const typeKinds = new Set(['class', 'record', 'struct', 'interface', 'enum', 'delegate', 'typeParameter']);
  return (memberKinds.has(target) && memberKinds.has(actual)) || (typeKinds.has(target) && typeKinds.has(actual));
}

function isRenameableSymbol(symbol: CSharpSemanticOccurrence) {
  return !['keyword', 'namespace'].includes(symbol.kind) && /^@?[_\p{L}]/u.test(symbol.name);
}

function findTokenAtPosition(tokens: CSharpToken[], position: monaco.IPosition) {
  return tokens.find(token => token.range.containsPosition(position));
}

function lineRange(model: monaco.editor.ITextModel, lineNumber: number) {
  return new monaco.Range(lineNumber, 1, lineNumber, model.getLineMaxColumn(lineNumber));
}

function buildFoldingRanges(model: monaco.editor.ITextModel, source: string, tokens: CSharpToken[]): monaco.languages.FoldingRange[] {
  const ranges: monaco.languages.FoldingRange[] = [];
  const stack: CSharpToken[] = [];
  for (const token of tokens) {
    if (token.value === '{') stack.push(token);
    else if (token.value === '}') {
      const open = stack.pop();
      if (open && token.range.endLineNumber > open.range.startLineNumber) {
        ranges.push({ start: open.range.startLineNumber, end: token.range.endLineNumber });
      }
    }
  }

  const lines = source.split(/\r\n|\r|\n/);
  const regionStack: number[] = [];
  for (let i = 0; i < lines.length; i += 1) {
    if (/^\s*#region\b/.test(lines[i])) regionStack.push(i + 1);
    if (/^\s*#endregion\b/.test(lines[i])) {
      const start = regionStack.pop();
      if (start && i + 1 > start) ranges.push({ start, end: i + 1, kind: monaco.languages.FoldingRangeKind.Region });
    }
  }

  for (let line = 1; line <= model.getLineCount(); line += 1) {
    const text = model.getLineContent(line);
    if (/^\s*\/\//.test(text)) {
      const start = line;
      while (line + 1 <= model.getLineCount() && /^\s*\/\//.test(model.getLineContent(line + 1))) line += 1;
      if (line > start) ranges.push({ start, end: line, kind: monaco.languages.FoldingRangeKind.Comment });
    }
  }

  return ranges.sort((a, b) => a.start - b.start || a.end - b.end);
}

function buildInlayHints(model: monaco.editor.ITextModel, tokens: CSharpToken[], declarations: CSharpDeclaration[]): monaco.languages.InlayHint[] {
  const hints: monaco.languages.InlayHint[] = [];
  const methodsByName = new Map<string, CSharpDeclaration[]>();
  for (const decl of declarations) {
    if (['method', 'extensionMethod', 'constructor'].includes(decl.kind)) {
      const list = methodsByName.get(decl.name) ?? [];
      list.push(decl);
      methodsByName.set(decl.name, list);
    }
    if (decl.kind === 'local' && decl.typeName === 'var') {
      const inferred = inferVarType(tokens, decl.token.index);
      if (inferred) {
        hints.push({
          kind: monaco.languages.InlayHintKind.Type,
          label: `: ${inferred}`,
          position: { lineNumber: decl.token.range.endLineNumber, column: decl.token.range.endColumn },
          paddingLeft: true,
        });
      }
    }
  }

  for (const token of tokens) {
    if (token.kind !== 'identifier' || tokens[token.index + 1]?.value !== '(') continue;
    const method = methodsByName.get(token.value.replace(/^@/, ''))?.[0];
    if (!method?.parameters?.length) continue;
    const open = tokens[token.index + 1];
    const closeIndex = findMatchingToken(tokens, open.index, '(', ')');
    if (closeIndex < 0) continue;
    const argumentStartTokens = collectArgumentStartTokens(tokens, open.index, closeIndex);
    for (let i = 0; i < Math.min(argumentStartTokens.length, method.parameters.length); i += 1) {
      const paramName = method.parameters[i].split(/\s+/).pop()?.replace(/^@/, '') ?? '';
      const arg = argumentStartTokens[i];
      if (!paramName || arg.value.includes(':')) continue;
      hints.push({
        kind: monaco.languages.InlayHintKind.Parameter,
        label: `${paramName}:`,
        position: { lineNumber: arg.range.startLineNumber, column: arg.range.startColumn },
        paddingRight: true,
      });
    }
  }

  return hints;
}

function inferVarType(tokens: CSharpToken[], index: number) {
  const equals = findNextToken(tokens, index + 1, '=', 8);
  if (!equals) return undefined;
  const value = nextSignificantToken(tokens, equals.index);
  if (!value) return undefined;
  if (value.kind === 'string') return 'string';
  if (value.kind === 'number') return value.value.includes('.') ? 'double' : 'int';
  if (value.value === 'true' || value.value === 'false') return 'bool';
  if (value.value === 'new') {
    const type = nextSignificantToken(tokens, value.index);
    return type?.value;
  }
  return undefined;
}

function collectArgumentStartTokens(tokens: CSharpToken[], openIndex: number, closeIndex: number) {
  const starts: CSharpToken[] = [];
  let depth = 0;
  let currentStart: CSharpToken | undefined;
  for (let i = openIndex + 1; i < closeIndex; i += 1) {
    const token = tokens[i];
    if (!currentStart && token.value !== ',') currentStart = token;
    if (['(', '[', '{'].includes(token.value)) depth += 1;
    if ([')', ']', '}'].includes(token.value)) depth -= 1;
    if (depth === 0 && token.value === ',') {
      if (currentStart) starts.push(currentStart);
      currentStart = undefined;
    }
  }
  if (currentStart) starts.push(currentStart);
  return starts;
}

function nearestBlockRange(tokens: CSharpToken[], position: monaco.IPosition) {
  const containing = tokens.filter(token => token.value === '{' && token.range.getStartPosition().isBeforeOrEqual(position as monaco.Position));
  const open = containing.at(-1);
  if (!open) return undefined;
  const closeIndex = findMatchingToken(tokens, open.index, '{', '}');
  if (closeIndex < 0) return undefined;
  return new monaco.Range(open.range.startLineNumber, open.range.startColumn, tokens[closeIndex].range.endLineNumber, tokens[closeIndex].range.endColumn);
}


function isOnlyCodeActionKind(requested: string | undefined, provided: string): boolean {
  if (!requested) return false;
  return requested === provided || requested.startsWith(`${provided}.`);
}

function buildSymbolMarkdown(symbol: CSharpDeclaration | CSharpSemanticOccurrence) {
  const modifiers = symbol.modifiers.filter(modifier => modifier !== 'declaration').join(' ');
  const prefix = modifiers ? `${modifiers} ` : '';
  return `\`\`\`csharp\n${prefix}${symbol.detail}\n\`\`\``;
}

function suggestMissingUsing(markers: monaco.editor.IMarkerData[], index: CSharpSemanticIndex) {
  for (const marker of markers) {
    const match = /(?:type or namespace name|name) '([^']+)'/.exec(marker.message);
    const name = match?.[1];
    if (name && DEFAULT_TYPE_TO_NAMESPACE.has(name)) {
      const ns = DEFAULT_TYPE_TO_NAMESPACE.get(name)!;
      if (!index.declarations.some(decl => decl.kind === 'namespace' && decl.name === ns)) return ns;
    }
  }
  return undefined;
}

function organizeUsings(source: string) {
  const lines = source.split(/\r\n|\r|\n/);
  const newline = source.includes('\r\n') ? '\r\n' : '\n';
  const usingLines: string[] = [];
  const otherLines: string[] = [];
  let inLeadingUsingBlock = true;
  for (const line of lines) {
    if (inLeadingUsingBlock && /^\s*using\s+[^;]+;\s*$/.test(line)) {
      usingLines.push(line.trim());
    } else {
      if (line.trim()) inLeadingUsingBlock = false;
      otherLines.push(line);
    }
  }
  if (usingLines.length <= 1) return source;
  const organized = [...new Set(usingLines)].sort((a, b) => a.localeCompare(b));
  return [...organized, '', ...otherLines.filter((line, index) => index > 0 || line.trim() !== '')].join(newline);
}

function formatCSharp(source: string, options: monaco.languages.FormattingOptions, baseIndentColumns = 0) {
  const unit = options.insertSpaces ? ' '.repeat(options.tabSize) : '\t';
  const base = ' '.repeat(Math.max(0, baseIndentColumns));
  const lines = source.split(/\r\n|\r|\n/);
  const newline = source.includes('\r\n') ? '\r\n' : '\n';
  let indent = 0;
  let inBlockComment = false;
  const formatted = lines.map(original => {
    const trimmed = original.trim();
    if (!trimmed) return '';
    if (trimmed.startsWith('*/')) inBlockComment = false;
    const currentIndent = Math.max(0, indent - (trimmed.startsWith('}') ? 1 : 0));
    const line = `${base}${unit.repeat(currentIndent)}${trimmed}`;
    if (!inBlockComment) {
      const openCount = countCharOutsideStrings(trimmed, '{');
      const closeCount = countCharOutsideStrings(trimmed, '}');
      indent = Math.max(0, currentIndent + openCount - closeCount + (trimmed.startsWith('{') ? 0 : 0));
    }
    if (trimmed.includes('/*') && !trimmed.includes('*/')) inBlockComment = true;
    return line;
  });
  return formatted.join(newline);
}

function countCharOutsideStrings(text: string, char: string) {
  let count = 0;
  let quote: string | null = null;
  for (let i = 0; i < text.length; i += 1) {
    if (quote) {
      if (text[i] === '\\') i += 1;
      else if (text[i] === quote) quote = null;
      continue;
    }
    if (text[i] === '"' || text[i] === '\'') { quote = text[i]; continue; }
    if (text[i] === char) count += 1;
  }
  return count;
}

function inferLineIndent(model: monaco.editor.ITextModel, lineNumber: number, options: monaco.languages.FormattingOptions) {
  const unit = options.insertSpaces ? ' '.repeat(options.tabSize) : '\t';
  let indent = 0;
  for (let line = 1; line < lineNumber; line += 1) {
    const text = model.getLineContent(line).trim();
    if (!text) continue;
    if (text.startsWith('}')) indent = Math.max(0, indent - 1);
    indent += countCharOutsideStrings(text, '{');
    indent -= countCharOutsideStrings(text, '}');
    indent = Math.max(0, indent);
  }
  const current = model.getLineContent(lineNumber).trim();
  if (current.startsWith('}')) indent = Math.max(0, indent - 1);
  return unit.repeat(indent);
}

function toPascalCase(value: string) {
  return value ? `${value[0].toUpperCase()}${value.slice(1)}` : value;
}

export const csharpService = new CSharpLanguageService();
let _csharpReady: Promise<void> | null = null;
let _csharpReadySource: CSharpOmniSharpSource = 'local';
export function ensureCSharpReady(source: CSharpOmniSharpSource = 'local'): Promise<void> {
  const normalizedSource = normalizeCSharpOmniSharpSource(source);
  if (!_csharpReady || _csharpReadySource !== normalizedSource) {
    _csharpReadySource = normalizedSource;
    _csharpReady = csharpService.initialize(getCSharpOmniSharpUrl(normalizedSource)).catch(error => {
      if (_csharpReadySource === normalizedSource) _csharpReady = null;
      throw error;
    });
  }
  return _csharpReady;
}
export const csharpReady = { then: (fn: () => void) => ensureCSharpReady().then(fn) };
