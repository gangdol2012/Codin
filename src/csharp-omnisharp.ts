import * as monaco from 'monaco-editor';

const iframeId = `omnisharp-${Math.random().toString(36).slice(2)}`;

type OmniSharpCall = (method: string, ...args: unknown[]) => Promise<any>;
export type CSharpOmniSharpSource = 'local';

interface CSharpOmniSharpBridgeErrorPayload {
  __codecraftOmniSharpError: true;
  method?: string;
  name?: string;
  message?: string;
  stack?: string;
}

class CSharpOmniSharpBridgeError extends Error {
  readonly payload: CSharpOmniSharpBridgeErrorPayload | false;
  readonly method: string;

  constructor(method: string, payload: CSharpOmniSharpBridgeErrorPayload | false) {
    const message = payload === false
      ? `${method} returned a false payload.`
      : `${method} failed in OmniSharp: ${payload.message || payload.name || 'Unknown bridge error.'}`;
    super(message);
    this.name = 'CSharpOmniSharpBridgeError';
    this.method = method;
    this.payload = payload;
  }
}

class CSharpObsoleteSemanticResponseError extends Error {
  readonly reason: string;

  constructor(reason: string) {
    // Monaco recognizes this exact Error shape as cancellation and suppresses the
    // expected provider rejection. Keep the richer reason for our debug snapshots.
    super('Canceled');
    this.name = 'Canceled';
    this.reason = reason;
  }
}

function rethrowObsoleteCSharpSemanticResponse(error: unknown): void {
  if (error instanceof CSharpObsoleteSemanticResponseError) throw error;
}

const CSHARP_OMNISHARP_URLS: Record<CSharpOmniSharpSource, string> = {
  local: new URL('omnisharp/index.html', document.baseURI).href,
};

function normalizeCSharpOmniSharpSource(source: unknown): CSharpOmniSharpSource {
  return 'local';
}

function isCSharpOmniSharpBridgeErrorPayload(value: unknown): value is CSharpOmniSharpBridgeErrorPayload {
  return !!value
    && typeof value === 'object'
    && (value as { __codecraftOmniSharpError?: unknown }).__codecraftOmniSharpError === true;
}

function csharpOmniSharpMetadataVersion(value: unknown): number | null {
  return Number.isSafeInteger(value) && (value as number) >= 0 ? value as number : null;
}

function csharpOmniSharpResponseMetadataVersion(value: unknown): number | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  return csharpOmniSharpMetadataVersion((value as { metadataVersion?: unknown }).metadataVersion);
}

function csharpOmniSharpMetadataNotificationVersion(value: unknown): number | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const outer = value as Record<string, unknown>;
  if (
    Object.keys(outer).length !== 1 ||
    !Object.prototype.hasOwnProperty.call(outer, 'omnisharpMetadataChanged')
  ) {
    return null;
  }

  const notification = outer.omnisharpMetadataChanged;
  if (!notification || typeof notification !== 'object' || Array.isArray(notification)) return null;
  const fields = notification as Record<string, unknown>;
  if (
    Object.keys(fields).length !== 1 ||
    !Object.prototype.hasOwnProperty.call(fields, 'version')
  ) {
    return null;
  }
  return csharpOmniSharpMetadataVersion(fields.version);
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
type CSharpProjectFilesRevisionProvider = () => unknown;

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
  renderedFilterRange?: monaco.IRange;
  presentationFilterRange?: monaco.IRange;
  preselectedCompletionIndices?: ReadonlySet<number>;
  sessionReusable?: boolean;
  completionList?: { key: string; speculative: boolean };
}

interface CSharpCompletionRequestSnapshot {
  code: string;
  hash: string;
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
  revision: string;
}

interface CSharpCompletionTextSyncRequest {
  FullSync: boolean;
  ExpectedVersion: number;
  ExpectedOldTextLength: number;
  ExpectedNewTextLength: number;
  ProjectRevision: string;
  Changes: Array<{
    Start: number;
    Length: number;
    NewText: string;
  }>;
}

interface CSharpCompletionTextState {
  runtimeSession: number;
  projectRevision: string;
  version: number;
  length: number;
  code: string;
}

interface CSharpCompletionTextSyncAck {
  success?: unknown;
  requiresFullSync?: unknown;
  version?: unknown;
  textLength?: unknown;
  projectRevision?: unknown;
  message?: unknown;
}

interface CSharpPredictiveCompletionSource {
  modelUri: string;
  projectRevision: string;
  projectFileKey: string;
  environmentVersion: number;
  suggestions: monaco.languages.CompletionItem[];
  lspItems: any[];
}

interface CSharpPredictiveCompletionCacheEntry {
  response: unknown;
  completionListKey: string;
  code: string;
  codeHash: string;
  offset: number;
  candidate: string;
  prefix: string;
  assumedText: string;
  projectCurrentPath: string;
  projectRevision: string;
  projectFileKey: string;
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
  projectRevision: string;
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
  projectRevision: string;
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
  candidate: string;
  prefix: string;
  assumedText: string;
  projectCurrentPath: string;
  projectRevision: string;
  projectFileKey: string;
  itemCount: number;
  ageMs: number;
}

export type CSharpCompletionPreloadLookupOutcome =
  | 'normal-cache-hit'
  | 'session-cache-hit'
  | 'predictive-hit'
  | 'predictive-miss'
  | 'predictive-empty'
  | 'runtime-fallback'
  | 'runtime-unavailable';

export interface CSharpCompletionPreloadLookupSnapshot {
  outcome: CSharpCompletionPreloadLookupOutcome;
  outcomeText: string;
  checkedAt: string;
  key: string;
  cacheKey: string;
  codeHash: string;
  offset: number;
  line: number;
  column: number;
  filterPrefix: string;
  previousCharacter: string;
  completionTrigger: unknown;
  triggerCharacter?: string;
  contextTriggerKind: number;
  contextTriggerCharacter?: string;
  projectCurrentPath: string;
  projectRevision: string;
  projectFileKey: string;
  predictiveCacheSize: number;
  activePlanKey: string | null;
  activePlanMatches: boolean;
  lastRequestKey: string | null;
  lastRequestMatches: boolean;
  cachedEntry: CSharpCompletionPreloadCacheEntrySnapshot | null;
  relatedCacheEntries: CSharpCompletionPreloadCacheEntrySnapshot[];
  mismatchHints: string[];
  matchedItemCount?: number;
  cacheAgeMs?: number;
  reason?: string;
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
  lastLookup: CSharpCompletionPreloadLookupSnapshot | null;
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
    completionSessionCacheSize: number;
    predictiveCompletionCacheSize: number;
    predictiveCompletionActivePlan: boolean;
    omnisharpMetadataVersion: number | null;
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

// Keep every browser-side list-bearing cache within the keyed Roslyn LRU capacity.
// A larger JS cache would only retain entries whose resolve/refilter state was already
// evicted in WASM, guaranteeing a slow full-completion retry when revisited.
const CSHARP_COMPLETION_CACHE_LIMIT = 6;
const CSHARP_COMPLETION_SESSION_CACHE_LIMIT = 6;
const CSHARP_PREDICTIVE_COMPLETION_CACHE_LIMIT = 4;
const CSHARP_PREDICTIVE_COMPLETION_DELAY_MS = 35;
const CSHARP_CONTEXT_COMPLETION_PREWARM_DELAY_MS = 35;
const CSHARP_RUNTIME_RESPONSE_CACHE_LIMIT = 64;
const CSHARP_OMNISHARP_INITIALIZATION_STALL_TIMEOUT_MS = 300_000;
const CSHARP_DEBUG_EVENT_LIMIT = 500;
const CSHARP_DEBUG_FEATURE_EVENT_LIMIT = 120;
const CSHARP_STALE_COMPLETION_RESPONSE = Symbol('stale-csharp-completion-response');
type CSharpCompletionPrewarmOutcome = 'completed' | 'superseded' | 'failed';

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
  if (value === null) return 'null';
  if (typeof value === 'undefined') return 'undefined';
  if (typeof value === 'number') return `number:${Object.is(value, -0) ? '-0' : String(value)}`;
  if (typeof value === 'boolean') return `boolean:${value}`;
  if (typeof value === 'string') return `string:${JSON.stringify(value)}`;
  if (Array.isArray(value)) return `array:[${value.map(stableCacheKey).join(',')}]`;
  if (typeof value === 'object') {
    const record = value as Record<string, unknown>;
    return `object:{${Object.keys(record).sort().map(key => `${JSON.stringify(key)}:${stableCacheKey(record[key])}`).join(',')}}`;
  }
  return `${typeof value}:${String(value)}`;
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

const CSHARP_CONTEXTUAL_COMPLETION_TRIGGER_CHARACTERS = ['.', ',', ' ', '#', ':', '=', '?', '@'];

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

interface CSharpCompletionInflightEntry {
  requestSerial: number;
  promise: Promise<CSharpCompletionCacheEntry | null>;
}

const csharpCompletionInflightByService = new WeakMap<object, Map<string, CSharpCompletionInflightEntry>>();
const csharpDecodedCompactCompletionItems = new WeakMap<object, any[]>();

function csharpCompletionInflightFor(service: object) {
  let inflight = csharpCompletionInflightByService.get(service);
  if (!inflight) {
    inflight = new Map<string, CSharpCompletionInflightEntry>();
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

function csharpCompletionFastHashWithoutSpan(value: string, start: number, end: number): string {
  const safeStart = Math.max(0, Math.min(value.length, start));
  const safeEnd = Math.max(safeStart, Math.min(value.length, end));
  let hash = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    if (index >= safeStart && index < safeEnd) continue;
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

function csharpCompactCompletionRange(value: unknown): any | undefined {
  if (!Array.isArray(value) || value.length !== 4 || !value.every(Number.isFinite)) return undefined;
  return {
    startLine: value[0],
    startColumn: value[1],
    endLine: value[2],
    endColumn: value[3],
  };
}

function csharpCompactCompletionItems(response: any): any[] | null {
  if (!response || typeof response !== 'object' || response.v !== 1 || !Array.isArray(response.i)) return null;

  const cached = csharpDecodedCompactCompletionItems.get(response);
  if (cached) return cached;

  const defaultRange = csharpCompactCompletionRange(response.r);
  const commitCharacterSets = Array.isArray(response.c) ? response.c : [];
  const items = response.i.map((compact: unknown, index: number) => {
    if (!Array.isArray(compact)) return compact;

    const label = csharpCompletionOptionalString(compact[0]) ?? '';
    const newText = csharpCompletionOptionalString(compact[1]) ?? label;
    const editRange = csharpCompactCompletionRange(compact[2]) ?? defaultRange;
    const additionalTextEdits = Array.isArray(compact[4])
      ? compact[4].map((edit: unknown) => {
          if (!Array.isArray(edit) || edit.length < 5) return null;
          const range = csharpCompactCompletionRange(edit.slice(1, 5));
          const text = csharpCompletionOptionalString(edit[0]);
          return range && text !== undefined ? { ...range, newText: text } : null;
        }).filter((edit: unknown) => edit !== null)
      : undefined;
    const commitSetIndex = Number(compact[11]);
    const commitCharacterSet = Number.isInteger(commitSetIndex)
      ? commitCharacterSets[commitSetIndex]
      : undefined;

    return {
      label,
      ...(editRange ? { textEdit: { ...editRange, newText } } : { insertText: newText }),
      ...(compact[3] ? { insertTextFormat: compact[3] } : {}),
      ...(additionalTextEdits?.length ? { additionalTextEdits } : {}),
      ...(compact[5] != null ? { sortText: compact[5] } : {}),
      ...(compact[6] != null ? { filterText: compact[6] } : {}),
      ...(compact[7] != null ? { kind: compact[7] } : {}),
      ...(compact[8] != null ? { detail: compact[8] } : {}),
      data: compact[9] ?? index,
      preselect: compact[10] === 1,
      ...(typeof commitCharacterSet === 'string'
        ? { commitCharacters: Array.from(commitCharacterSet) }
        : {}),
    };
  });

  csharpDecodedCompactCompletionItems.set(response, items);
  return items;
}

function csharpCompletionItemsFromResponse(response: any): any[] {
  const compactItems = csharpCompactCompletionItems(response);
  if (compactItems) return compactItems;
  const items = Array.isArray(response)
    ? response
    : response?.items ?? response?.Items ?? response?.completions ?? response?.Completions ?? response?.suggestions ?? response?.Suggestions ?? [];
  return Array.isArray(items) ? items : [];
}

function csharpCompletionResponseIsIncomplete(response: any): boolean {
  return !!(response?.x ?? response?.isIncomplete ?? response?.IsIncomplete ?? response?.incomplete ?? response?.Incomplete);
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

function csharpCompletionRangesEqual(left: monaco.IRange | undefined, right: monaco.IRange | undefined): boolean {
  return !!left && !!right
    && left.startLineNumber === right.startLineNumber
    && left.startColumn === right.startColumn
    && left.endLineNumber === right.endLineNumber
    && left.endColumn === right.endColumn;
}

function csharpCompletionRangeMatchesFilter(
  range: monaco.IRange | monaco.languages.CompletionItemRanges | undefined,
  filterRange: monaco.IRange
): boolean {
  if (csharpCompletionIsPlainRange(range)) return csharpCompletionRangesEqual(range, filterRange);
  if (!range) return false;
  return csharpCompletionRangesEqual(range.insert, filterRange)
    && csharpCompletionRangesEqual(range.replace, filterRange);
}

function csharpCompletionRebasedRange(
  range: monaco.IRange | monaco.languages.CompletionItemRanges,
  filterRange: monaco.IRange
): monaco.IRange | monaco.languages.CompletionItemRanges {
  return csharpCompletionIsPlainRange(range)
    ? filterRange
    : { insert: filterRange, replace: filterRange };
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

function csharpCompletionRangeContainsSnapshotOffset(
  range: monaco.IRange | monaco.languages.CompletionItemRanges,
  snapshot: CSharpCompletionRequestSnapshot,
): boolean {
  const containsOffset = (candidate: monaco.IRange) => {
    const start = offsetAtTextPosition(
      snapshot.code,
      candidate.startLineNumber,
      candidate.startColumn,
    );
    const end = offsetAtTextPosition(
      snapshot.code,
      candidate.endLineNumber,
      candidate.endColumn,
    );
    return start !== null && end !== null && start <= snapshot.offset && snapshot.offset <= end;
  };
  if (csharpCompletionIsPlainRange(range)) return containsOffset(range);
  return containsOffset(range.insert) && containsOffset(range.replace);
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
    snapshot.hash,
    request.CompletionTrigger,
    request.TriggerCharacter ?? '',
    projectRequest.revision,
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
    projectRequest.revision,
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
  private completionResolveListKeys = new WeakMap<object, { key: string; speculative: boolean }>();
  private activeCompletionList: { key: string; speculative: boolean } | null = null;
  private pendingCompletionListPublicationKeys = new Set<string>();
  private pendingSpeculativeCompletionListPublicationKeys = new Set<string>();
  private speculativeCancellationPromise: Promise<void> | null = null;
  private editor: monaco.editor.IStandaloneCodeEditor | null = null;
  private model: monaco.editor.ITextModel | null = null;
  private projectFilesProvider: CSharpProjectFilesProvider = () => [];
  private projectFilesRevisionProvider: CSharpProjectFilesRevisionProvider | null = null;
  private initialized = false;
  private iframeUrl: string | null = null;
  private providersRegistered = false;
  private initializationPromise: Promise<void> | null = null;
  private runtimeMessageListener: ((event: MessageEvent) => void) | null = null;
  private runtimeRequestSerial = 0;
  private runtimeSessionSerial = 0;
  private runtimePending = new Map<string, {
    method: string;
    callId: string;
    started: number;
    timeout: ReturnType<typeof setTimeout>;
    resolve: (value: unknown) => void;
  }>();
  private completionRequestSerial = 0;
  private completionStructuralVersion = 0;
  private diagnosticRequestSerial = 0;
  private completionEnvironmentVersion = 0;
  private omnisharpMetadataVersion: number | null = null;
  private metadataInvalidationSerial = 0;
  private completionWorkerStateKey: string | null = null;
  private completionProjectStateKey: string | null = null;
  private speculativeProjectStateKey: string | null = null;
  private diagnosticProjectStateKey: string | null = null;
  private completionTextState: CSharpCompletionTextState | null = null;
  private speculativeTextState: CSharpCompletionTextState | null = null;
  private diagnosticTextState: CSharpCompletionTextState | null = null;
  private completionCache = new Map<string, CSharpCompletionCacheEntry>();
  private completionSessionCache = new Map<string, CSharpCompletionCacheEntry>();
  private predictiveCompletionCache = new Map<string, CSharpPredictiveCompletionCacheEntry>();
  private predictiveCompletionSource: CSharpPredictiveCompletionSource | null = null;
  private predictiveCompletionRefreshTimer: ReturnType<typeof setTimeout> | null = null;
  private predictiveCompletionTimer: ReturnType<typeof setTimeout> | null = null;
  private predictiveCompletionSerial = 0;
  private predictiveCompletionPlan: CSharpPredictiveCompletionPlan | null = null;
  private predictiveCompletionRun: {
    key: string;
    code: string;
    serial: number;
    promise: Promise<void>;
  } | null = null;
  private predictiveCompletionLastRequest: CSharpCompletionPreloadRequestSnapshot | null = null;
  private predictiveCompletionLastLookup: CSharpCompletionPreloadLookupSnapshot | null = null;
  private runtimeResponseCache = new Map<string, Promise<unknown> | unknown>();
  private runtimeResponseMetadataVersions = new WeakMap<object, number>();
  private diagnosticCacheKey: string | null = null;
  private diagnosticCacheMarkers: monaco.editor.IMarkerData[] = [];
  private providerDisposables: monaco.IDisposable[] = [];
  private semanticCache = new WeakMap<monaco.editor.ITextModel, { versionId: number; index: CSharpSemanticIndex }>();
  private modelTextCache = new WeakMap<monaco.editor.ITextModel, CSharpModelTextSnapshot>();
  private projectRequestCache: CSharpSerializedProjectRequest | null = null;
  private projectRequestSource: CSharpProjectFileSnapshot[] | null = null;
  private projectRequestSourceRevision: unknown;
  private projectRequestRevisionSerial = 0;
  private projectFileHashCache = new Map<string, { content: string; hash: string; length: number }>();
  private completionDispatchTail: Promise<void> = Promise.resolve();
  private speculativeDispatchTail: Promise<void> = Promise.resolve();
  private diagnosticDispatchTail: Promise<void> = Promise.resolve();
  private completionProjectPrewarmSerial = 0;
  private debugEnabled = false;
  private debugEvents: CSharpIdeDebugEvent[] = [];
  private debugEventSerial = 0;
  private debugListener: ((snapshot: CSharpIdeDebugSnapshot) => void) | null = null;
  private debugNotifyTimer: ReturnType<typeof setTimeout> | null = null;
  private lastDiagnosticProjectRequest: CSharpDiagnosticProjectRequest | null = null;

  // Diagnostics can monopolize the single WASM thread once Roslyn starts a compilation.
  // A longer authoring-idle window keeps it behind completion bursts while preserving the
  // same diagnostics feature as soon as typing has actually paused.
  private debouncedDiagnostics = debounce(this.getDiagnostics.bind(this), 1500);
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
        completionSessionCacheSize: this.completionSessionCache.size,
        predictiveCompletionCacheSize: this.predictiveCompletionCache.size,
        predictiveCompletionActivePlan: !!this.predictiveCompletionPlan,
        omnisharpMetadataVersion: this.omnisharpMetadataVersion,
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
        completionSessionCacheSize: this.completionSessionCache.size,
        predictiveCompletionCacheSize: this.predictiveCompletionCache.size,
        predictiveCompletionActivePlan: !!this.predictiveCompletionPlan,
        omnisharpMetadataVersion: this.omnisharpMetadataVersion,
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
      projectRevision: plan.projectRequest.revision,
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
      projectRevision: source.projectRevision,
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

  private invalidatePredictiveCompletionLastRequest(reason: string, options?: { includeCached?: boolean }) {
    const lastRequest = this.predictiveCompletionLastRequest;
    const invalidatableStatuses = options?.includeCached
      ? ['scheduled', 'running', 'cached']
      : ['scheduled', 'running'];
    if (!lastRequest || !invalidatableStatuses.includes(lastRequest.status)) return;
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

  private summarizePredictiveCompletionCacheEntry(
    key: string,
    entry: CSharpPredictiveCompletionCacheEntry
  ): CSharpCompletionPreloadCacheEntrySnapshot {
    return {
      key,
      completionListKey: entry.completionListKey,
      codeHash: entry.codeHash,
      offset: entry.offset,
      candidate: entry.candidate,
      prefix: entry.prefix,
      assumedText: entry.assumedText,
      projectCurrentPath: entry.projectCurrentPath,
      projectRevision: entry.projectRevision,
      projectFileKey: entry.projectFileKey,
      itemCount: entry.itemCount,
      ageMs: Date.now() - entry.createdAt,
    };
  }

  private noteEquivalentPredictiveCompletionPlan(
    plan: CSharpPredictiveCompletionPlan,
    source: 'active-plan' | 'cached-preload',
    cacheEntry?: CSharpPredictiveCompletionCacheEntry
  ) {
    const planSnapshot = this.summarizePredictiveCompletionPlan(plan);
    const previous = this.predictiveCompletionLastRequest;
    const shouldReplacePreviousWithCached = cacheEntry
      && previous?.key === plan.key
      && ['invalidated', 'stale', 'failed', 'empty'].includes(previous.status);
    if (previous?.key === plan.key && !shouldReplacePreviousWithCached) {
      const itemCount = previous.itemCount ?? cacheEntry?.itemCount;
      const statusText = cacheEntry && previous.status !== 'served'
        ? `Preload ready for '${planSnapshot.assumedText}' with ${itemCount ?? 0} items. Current prefix '${planSnapshot.prefix}' maps to the same preload key.`
        : this.predictiveCompletionStatusText(previous.status, planSnapshot, {
          itemCount,
          cacheAgeMs: previous.cacheAgeMs,
          reason: previous.reason,
        });
      this.predictiveCompletionLastRequest = {
        ...previous,
        ...planSnapshot,
        statusText,
        itemCount,
        cached: previous.cached ?? !!cacheEntry,
      };
      this.notifyDebugChanged();
    } else if (cacheEntry) {
      this.predictiveCompletionLastRequest = {
        ...planSnapshot,
        status: 'cached',
        statusText: `Preload ready for '${planSnapshot.assumedText}' with ${cacheEntry.itemCount} items. Current prefix '${planSnapshot.prefix}' maps to an existing cached preload.`,
        serial: this.predictiveCompletionSerial,
        callId: `completion.predictive-${this.predictiveCompletionSerial}`,
        finishedAt: new Date(cacheEntry.createdAt).toISOString(),
        itemCount: cacheEntry.itemCount,
        cached: true,
      };
      this.notifyDebugChanged();
    }
    this.recordDebugEvent({
      feature: 'completion.predictive',
      phase: 'plan-equivalent',
      level: 'info',
      message: source === 'cached-preload'
        ? 'C# predictive preload plan already has a cached result for the current prefix.'
        : 'C# predictive preload plan is unchanged for the current prefix.',
      request: {
        source,
        candidate: plan.candidate,
        prefix: plan.prefix,
        key: plan.key,
        itemCount: cacheEntry?.itemCount,
      },
    });
  }

  private predictiveCompletionLookupOutcomeText(
    outcome: CSharpCompletionPreloadLookupOutcome,
    details: {
      previousCharacter: string;
      matchedItemCount?: number;
      cacheAgeMs?: number;
      reason?: string;
    }
  ) {
    const atText = details.previousCharacter
      ? ` after '${details.previousCharacter}'`
      : '';
    if (outcome === 'normal-cache-hit') {
      return 'Normal completion cache served this request before predictive preload replay was needed.';
    }
    if (outcome === 'session-cache-hit') {
      return `A semantic completion session was safely rebased to the current filter prefix and served ${details.matchedItemCount ?? 0} items.`;
    }
    if (outcome === 'predictive-hit') {
      return `Predictive preload replay hit${atText} and served ${details.matchedItemCount ?? 0} items${typeof details.cacheAgeMs === 'number' ? ` from a ${details.cacheAgeMs}ms old cache entry` : ''}.`;
    }
    if (outcome === 'predictive-empty') {
      return details.reason ?? 'Predictive preload key matched, but converting the cached response produced no usable completion items.';
    }
    if (outcome === 'runtime-fallback') {
      return details.reason ?? 'Predictive preload replay missed, so CodeCraft is calling OmniSharp normally.';
    }
    if (outcome === 'runtime-unavailable') {
      return details.reason ?? 'Predictive preload replay missed and the OmniSharp runtime was not available.';
    }
    return details.reason ?? 'No predictive preload cache entry matched this completion request.';
  }

  private buildPredictiveCompletionLookupSnapshot(
    model: monaco.editor.ITextModel,
    snapshot: CSharpCompletionRequestSnapshot,
    position: monaco.Position,
    context: monaco.languages.CompletionContext,
    request: any,
    projectRequest: CSharpSerializedProjectRequest,
    key: string,
    cacheKey: string,
    outcome: CSharpCompletionPreloadLookupOutcome,
    details: {
      matchedItemCount?: number;
      cacheAgeMs?: number;
      reason?: string;
      cachedEntry?: CSharpPredictiveCompletionCacheEntry | null;
    } = {}
  ): CSharpCompletionPreloadLookupSnapshot {
    const codeHash = snapshot.hash;
    const filterRange = this.getCompletionFilterRangeAtPosition(model, position);
    const filterPrefix = model.getValueInRange(filterRange);
    const previousCharacter = csharpCompletionCharacterBefore(model, position) ?? '';
    const cachedEntry = details.cachedEntry ?? this.predictiveCompletionCache.get(key) ?? null;
    const cachedEntrySnapshot = cachedEntry
      ? this.summarizePredictiveCompletionCacheEntry(key, cachedEntry)
      : null;
    const relatedCacheEntries = [...this.predictiveCompletionCache.entries()]
      .filter(([entryKey, entry]) => (
        entryKey === key ||
        entry.codeHash === codeHash ||
        entry.offset === snapshot.offset ||
        entry.projectRevision === projectRequest.revision ||
        entry.projectFileKey === projectRequest.fileKey
      ))
      .slice(0, 6)
      .map(([entryKey, entry]) => this.summarizePredictiveCompletionCacheEntry(entryKey, entry));
    const mismatchHints: string[] = [];
    if (!cachedEntry) {
      if (this.predictiveCompletionCache.size === 0) {
        mismatchHints.push('No predictive preload entries are cached.');
      } else if (relatedCacheEntries.length === 0) {
        mismatchHints.push('Cached preload entries exist, but none share this request code hash, offset, or project key.');
      } else {
        if (relatedCacheEntries.some(entry => entry.codeHash === codeHash && entry.offset !== snapshot.offset)) {
          mismatchHints.push('A cached preload has the same code hash but a different cursor offset.');
        }
        if (relatedCacheEntries.some(entry => entry.offset === snapshot.offset && entry.codeHash !== codeHash)) {
          mismatchHints.push('A cached preload has the same cursor offset but different code text.');
        }
        if (relatedCacheEntries.some(entry => entry.projectFileKey !== projectRequest.fileKey)) {
          mismatchHints.push('A cached preload has a different project file key.');
        }
        if (relatedCacheEntries.some(entry => entry.projectRevision !== projectRequest.revision)) {
          mismatchHints.push('A cached preload belongs to a different exact project revision.');
        }
        if (!mismatchHints.length) {
          mismatchHints.push('Related cached preloads exist, but the full replay key did not match.');
        }
      }
    }
    const activePlanKey = this.predictiveCompletionPlan?.key ?? null;
    const lastRequestKey = this.predictiveCompletionLastRequest?.key ?? null;
    return {
      outcome,
      outcomeText: this.predictiveCompletionLookupOutcomeText(outcome, {
        previousCharacter,
        matchedItemCount: details.matchedItemCount,
        cacheAgeMs: details.cacheAgeMs,
        reason: details.reason,
      }),
      checkedAt: new Date().toISOString(),
      key,
      cacheKey,
      codeHash,
      offset: snapshot.offset,
      line: position.lineNumber,
      column: position.column,
      filterPrefix,
      previousCharacter,
      completionTrigger: request.CompletionTrigger,
      triggerCharacter: request.TriggerCharacter,
      contextTriggerKind: context.triggerKind,
      contextTriggerCharacter: typeof context.triggerCharacter === 'string' ? context.triggerCharacter : undefined,
      projectCurrentPath: projectRequest.currentPath,
      projectRevision: projectRequest.revision,
      projectFileKey: projectRequest.fileKey,
      predictiveCacheSize: this.predictiveCompletionCache.size,
      activePlanKey,
      activePlanMatches: activePlanKey === key,
      lastRequestKey,
      lastRequestMatches: lastRequestKey === key,
      cachedEntry: cachedEntrySnapshot,
      relatedCacheEntries,
      mismatchHints,
      matchedItemCount: details.matchedItemCount,
      cacheAgeMs: details.cacheAgeMs,
      reason: details.reason,
    };
  }

  private setPredictiveCompletionLastLookup(
    lookup: CSharpCompletionPreloadLookupSnapshot,
    level: CSharpIdeDebugLevel = lookup.outcome === 'predictive-hit' || lookup.outcome === 'normal-cache-hit' || lookup.outcome === 'session-cache-hit'
      ? 'success'
      : lookup.outcome === 'runtime-fallback' || lookup.outcome === 'predictive-miss'
        ? 'warning'
        : 'info'
  ) {
    this.predictiveCompletionLastLookup = lookup;
    this.recordDebugEvent({
      feature: 'completion.predictive',
      phase: `lookup-${lookup.outcome}`,
      level,
      message: lookup.outcomeText,
      request: lookup,
    });
    this.notifyDebugChanged();
  }

  private getPredictiveCompletionDebugSnapshot(): CSharpCompletionPreloadDebugSnapshot {
    const activePlan = this.predictiveCompletionPlan
      ? this.summarizePredictiveCompletionPlan(this.predictiveCompletionPlan)
      : null;
    const cacheEntries = [...this.predictiveCompletionCache.entries()]
      .map(([key, entry]) => this.summarizePredictiveCompletionCacheEntry(key, entry));
    const lastRequest = this.predictiveCompletionLastRequest;
    const state: CSharpCompletionPreloadStatus = lastRequest?.status
      ?? (this.predictiveCompletionTimer ? 'scheduled' : activePlan ? 'running' : cacheEntries.length ? 'cached' : 'idle');
    const summary = lastRequest?.statusText
      ?? this.predictiveCompletionLastLookup?.outcomeText
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
      lastLookup: this.predictiveCompletionLastLookup,
    };
  }

  private summarizeError(error: unknown) {
    if (error instanceof CSharpObsoleteSemanticResponseError) {
      return `Canceled: ${error.reason}`;
    }
    if (error instanceof CSharpOmniSharpBridgeError && error.payload !== false) {
      const payload = error.payload;
      const bridgeName = payload.name ? ` (${payload.name})` : '';
      return `${error.name}: ${payload.method ?? error.method}${bridgeName}: ${payload.message ?? error.message}`;
    }
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
    if (isCSharpOmniSharpBridgeErrorPayload(result)) {
      return {
        type: 'bridge-error',
        method: result.method,
        name: result.name,
        message: result.message,
        stackPreview: typeof result.stack === 'string' ? result.stack.slice(0, 1000) : undefined,
      };
    }
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
      const targetOrigin = new URL(nextIframeUrl, window.location.href).origin;
      let iframe = document.getElementById(iframeId) as HTMLIFrameElement | null;
      if (iframe && iframe.src !== new URL(nextIframeUrl, window.location.href).href) {
        iframe.remove();
        iframe = null;
      }

      if (!iframe) {
        let initializationListener: ((event: MessageEvent) => void) | null = null;
        let initializationTimeout: ReturnType<typeof setTimeout> | null = null;
        let lastInitializationPhase = 'document-load';
        const initPromise = new Promise<void>((resolve, reject) => {
          const armStallTimeout = () => {
            if (initializationTimeout) clearTimeout(initializationTimeout);
            initializationTimeout = setTimeout(() => {
              if (initializationListener) {
                window.removeEventListener('message', initializationListener);
              }
              reject(new Error(
                `OmniSharp runtime made no initialization progress for ${CSHARP_OMNISHARP_INITIALIZATION_STALL_TIMEOUT_MS / 1000}s after '${lastInitializationPhase}'.`
              ));
            }, CSHARP_OMNISHARP_INITIALIZATION_STALL_TIMEOUT_MS);
          };
          const listener = (event: MessageEvent) => {
            if (event.origin !== targetOrigin || event.source !== iframe?.contentWindow) return;
            if (event.data?.omnisharpInitialized === true) {
              if (initializationTimeout) clearTimeout(initializationTimeout);
              resolve();
              window.removeEventListener('message', listener);
              return;
            }

            const failure = event.data?.omnisharpInitializationFailed;
            if (
              failure &&
              typeof failure === 'object' &&
              !Array.isArray(failure) &&
              Object.keys(failure).length === 2 &&
              typeof failure.phase === 'string' &&
              failure.phase.length >= 1 &&
              failure.phase.length <= 64 &&
              typeof failure.message === 'string' &&
              failure.message.length >= 1 &&
              failure.message.length <= 1000
            ) {
              if (initializationTimeout) clearTimeout(initializationTimeout);
              window.removeEventListener('message', listener);
              reject(new Error(
                `OmniSharp initialization failed during '${failure.phase}': ${failure.message}`
              ));
              return;
            }

            const progress = event.data?.omnisharpInitializationProgress;
            if (
              !progress ||
              typeof progress !== 'object' ||
              Array.isArray(progress) ||
              Object.keys(progress).length !== 1 ||
              typeof progress.phase !== 'string' ||
              progress.phase.length < 1 ||
              progress.phase.length > 64
            ) return;
            lastInitializationPhase = progress.phase;
            armStallTimeout();
            this.recordDebugEvent({
              feature: 'lifecycle',
              phase: 'runtime-initialization-progress',
              level: 'info',
              message: `OmniSharp initialization reached '${progress.phase}'.`,
            });
          };
          initializationListener = listener;
          window.addEventListener('message', listener);
          armStallTimeout();
        });

        iframe = document.createElement('iframe');
        iframe.id = iframeId;
        iframe.width = '0';
        iframe.height = '0';
        iframe.style.display = 'none';
        iframe.setAttribute('credentialless', '');
        iframe.src = nextIframeUrl;
        iframe.title = 'OmniSharp';

        try {
          const iframeLoadPromise = new Promise<void>((resolve, reject) => {
            iframe!.onload = () => {
              iframe!.onload = null;
              iframe!.onerror = null;
              resolve();
            };
            iframe!.onerror = () => {
              iframe!.onload = null;
              iframe!.onerror = null;
              reject(new Error('OmniSharp iframe failed to load'));
            };
          });
          document.body.appendChild(iframe);
          await iframeLoadPromise;
        } catch (error) {
          if (initializationTimeout) {
            clearTimeout(initializationTimeout);
          }
          if (initializationListener) {
            window.removeEventListener('message', initializationListener);
          }
          throw error;
        }

        await initPromise;
      }

      const iframeRef = iframe;
      const iframeWindow = iframeRef.contentWindow;
      if (!iframeWindow) {
        throw new Error('OmniSharp iframe has no content window.');
      }
      this.omnisharpMetadataVersion = null;
      this.metadataInvalidationSerial += 1;
      this.runtimeResponseMetadataVersions = new WeakMap<object, number>();
      const runtimeSession = ++this.runtimeSessionSerial;
      if (this.runtimeMessageListener) {
        window.removeEventListener('message', this.runtimeMessageListener);
      }
      this.runtimeMessageListener = (event: MessageEvent) => {
        if (
          runtimeSession !== this.runtimeSessionSerial ||
          event.source !== iframeWindow ||
          event.origin !== targetOrigin
        ) return;

        const notificationVersion = csharpOmniSharpMetadataNotificationVersion(event.data);
        if (notificationVersion !== null) {
          this.observeOmniSharpMetadataVersion(notificationVersion, 'notification');
          return;
        }

        const bridgeResponse = event.data?.omnisharp;
        if (!bridgeResponse || typeof bridgeResponse !== 'object' || Array.isArray(bridgeResponse)) return;
        const id = bridgeResponse.id;
        if (typeof id !== 'string' || !id.startsWith(`${runtimeSession}:`)) return;
        const payload = bridgeResponse.payload;
        const responseMetadataVersion = csharpOmniSharpMetadataVersion(bridgeResponse.metadataVersion)
          ?? csharpOmniSharpResponseMetadataVersion(payload);
        // A trusted same-session call can complete after the caller's latency timeout.
        // Its metadata promotion still happened inside the worker, so observe that version
        // even when there is no longer a pending promise to resolve.
        if (responseMetadataVersion !== null) {
          this.observeOmniSharpMetadataVersion(responseMetadataVersion, 'response');
          this.rememberRuntimeResponseMetadataVersion(payload, responseMetadataVersion);
        }
        const pending = this.runtimePending.get(id);
        if (!pending || bridgeResponse.method !== pending.method) return;

        this.runtimePending.delete(id);
        clearTimeout(pending.timeout);
        const bridgeError = isCSharpOmniSharpBridgeErrorPayload(payload);
        const failed = payload === false || bridgeError;
        this.recordDebugEvent({
          feature: pending.method,
          phase: 'runtime-response',
          level: failed ? 'error' : 'success',
          message: bridgeError
            ? `${pending.method} failed in OmniSharp: ${payload.message || payload.name || 'Unknown bridge error.'}`
            : payload === false
              ? `${pending.method} returned a false payload.`
              : `${pending.method} returned from OmniSharp.`,
          callId: pending.callId,
          durationMs: Math.round((this.now() - pending.started) * 10) / 10,
          response: this.summarizeOmniSharpResponse(payload),
          environment: this.createDebugEnvironmentSnapshot(this.model),
        });
        pending.resolve(payload);
      };
      window.addEventListener('message', this.runtimeMessageListener);

      this.omnisharp = (method: string, ...args: unknown[]) => {
        if (runtimeSession !== this.runtimeSessionSerial || !iframeRef.contentWindow) {
          return Promise.resolve(false);
        }
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

        return new Promise(resolve => {
          const id = `${runtimeSession}:${++this.runtimeRequestSerial}`;
          const timeout = setTimeout(() => {
            const pending = this.runtimePending.get(id);
            if (!pending) return;
            this.runtimePending.delete(id);
            this.recordDebugEvent({
              feature: method,
              phase: 'runtime-timeout',
              level: 'error',
              message: `${method} timed out waiting for OmniSharp.`,
              callId,
              durationMs: Math.round((this.now() - started) * 10) / 10,
              environment: this.createDebugEnvironmentSnapshot(this.model),
            });
            resolve(false);
          }, 10000);
          this.runtimePending.set(id, { method, callId, started, timeout, resolve });
          iframeWindow.postMessage({ omnisharp: { method, args, id } }, targetOrigin);
        });
      };

      this.ensureProvidersRegistered();
      // Readiness is not allowed to describe an obsolete editor snapshot. A user can
      // type while the WASM runtime is loading, so repeat a superseded prewarm against
      // the newest stable model. The bounded loop avoids holding readiness forever under
      // continuous typing; normal completion still performs exact synchronized fallback.
      for (let attempt = 0; attempt < 4; attempt += 1) {
        const activeModel = this.model;
        if (!activeModel || activeModel.isDisposed() || activeModel.getLanguageId() !== 'csharp') break;
        const outcome = await this.scheduleCompletionProjectPrewarm(activeModel, true);
        if (outcome !== 'superseded') break;
      }
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
    this.runtimeSessionSerial += 1;
    if (this.runtimeMessageListener) {
      window.removeEventListener('message', this.runtimeMessageListener);
      this.runtimeMessageListener = null;
    }
    for (const pending of this.runtimePending.values()) {
      clearTimeout(pending.timeout);
      pending.resolve(false);
    }
    this.runtimePending.clear();
    this.completionProjectStateKey = null;
    this.speculativeProjectStateKey = null;
    this.diagnosticProjectStateKey = null;
    this.completionTextState = null;
    this.speculativeTextState = null;
    this.diagnosticTextState = null;
    this.omnisharpMetadataVersion = null;
    this.speculativeCancellationPromise = null;
    this.metadataInvalidationSerial += 1;
    this.runtimeResponseMetadataVersions = new WeakMap<object, number>();
    document.getElementById(iframeId)?.remove();
    this.omnisharp = null;
    this.initialized = false;
    this.iframeUrl = null;
    this.clearCompletionState();
  }

  private rememberRuntimeResponseMetadataVersion(response: unknown, version: number) {
    if (response && typeof response === 'object') {
      this.runtimeResponseMetadataVersions.set(response, version);
    }
  }

  private runtimeResponseMetadataVersion(response: unknown): number | null {
    if (!response || typeof response !== 'object') return null;
    return this.runtimeResponseMetadataVersions.get(response)
      ?? csharpOmniSharpResponseMetadataVersion(response);
  }

  private observeOmniSharpResponseMetadataVersion(response: unknown): number | null {
    const version = this.runtimeResponseMetadataVersion(response);
    if (version === null) return null;
    this.observeOmniSharpMetadataVersion(version, 'response');
    this.rememberRuntimeResponseMetadataVersion(response, version);
    return version;
  }

  private observeOmniSharpMetadataVersion(
    version: number,
    source: 'notification' | 'response'
  ): boolean {
    const previousVersion = this.omnisharpMetadataVersion;
    if (previousVersion === null) {
      // A fresh runtime has no versioned semantic result to invalidate. Establishing
      // its first observed generation must not cancel and duplicate the very request
      // that reported that baseline (diagnostics is commonly first).
      this.omnisharpMetadataVersion = version;
      this.recordDebugEvent({
        feature: 'cache',
        phase: 'metadata-version-baseline',
        level: 'info',
        message: `OmniSharp metadata baseline established at version ${version}.`,
        request: { source, version },
      });
      return false;
    }
    if (version <= previousVersion) return false;

    this.omnisharpMetadataVersion = version;
    this.metadataInvalidationSerial += 1;
    this.completionEnvironmentVersion += 1;
    this.completionWorkerStateKey = null;

    // Metadata changes invalidate semantic results, not synchronized source/project state.
    // In particular, do not advance completionRequestSerial here: a response that reports
    // the new version was computed against that version and must remain usable.
    this.completionCache.clear();
    this.completionSessionCache.clear();
    csharpCompletionInflightFor(this).clear();
    this.clearPredictiveCompletionState(true);
    this.runtimeResponseCache.clear();
    this.lastCompletions.clear();
    this.lastCompletionContexts.clear();
    this.completionResolveResponseCache = new WeakMap<object, Promise<unknown>>();
    this.completionResolveListKeys = new WeakMap<object, { key: string; speculative: boolean }>();
    this.diagnosticCacheKey = null;

    this.recordDebugEvent({
      feature: 'cache',
      phase: 'metadata-version-changed',
      level: 'info',
      message: `OmniSharp metadata advanced to version ${version}; semantic result caches were invalidated.`,
      request: {
        source,
        previousVersion,
        version,
        metadataInvalidationSerial: this.metadataInvalidationSerial,
        completionEnvironmentVersion: this.completionEnvironmentVersion,
      },
    });

    const diagnosticModel = this.model;
    if (
      diagnosticModel &&
      !diagnosticModel.isDisposed() &&
      diagnosticModel.getLanguageId() === 'csharp'
    ) {
      this.requestDiagnostics(diagnosticModel);
    } else {
      this.diagnosticRequestSerial += 1;
    }
    return true;
  }

  private clearCompletionState(options?: {
    structural?: boolean;
    preserveEnvironment?: boolean;
    preserveReusableCaches?: boolean;
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
    // Exact model/runtime entries include Monaco's monotonic version and can never hit
    // again after an edit. Drop them immediately; only explicitly rebasable session and
    // predictive completion state is worth retaining between adjacent keystrokes.
    this.completionCache.clear();
    this.runtimeResponseCache.clear();
    if (!options?.preserveReusableCaches) {
      this.completionSessionCache.clear();
      this.clearPredictiveCompletionState(true);
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
    if (this.predictiveCompletionRefreshTimer) {
      clearTimeout(this.predictiveCompletionRefreshTimer);
      this.predictiveCompletionRefreshTimer = null;
    }
    if (this.predictiveCompletionTimer) {
      clearTimeout(this.predictiveCompletionTimer);
      this.predictiveCompletionTimer = null;
    }
    this.invalidatePredictiveCompletionLastRequest(clearCache
      ? 'Preload invalidated because completion result caches were cleared.'
      : 'Preload invalidated because the current editor state no longer matches a preload plan.', { includeCached: clearCache });
    this.predictiveCompletionPlan = null;
    this.predictiveCompletionRun = null;
    this.predictiveCompletionSource = null;
    if (clearCache) {
      this.predictiveCompletionCache.clear();
    }
  }

  private cancelPendingSpeculativeRuntime() {
    if (
      !this.omnisharp ||
      this.speculativeCancellationPromise ||
      this.pendingSpeculativeCompletionListPublicationKeys.size === 0
    ) return;

    const cancellation = this.omnisharp('CancelSpeculativeCompletionAsync').then(
      () => undefined,
      error => {
        this.recordDebugEvent({
          feature: 'completion.predictive',
          phase: 'cancel-error',
          level: 'warning',
          message: 'Could not signal cancellation for obsolete speculative completion work.',
          error: this.summarizeError(error),
        });
      },
    );
    this.speculativeCancellationPromise = cancellation;
    void cancellation.finally(() => {
      if (this.speculativeCancellationPromise === cancellation) {
        this.speculativeCancellationPromise = null;
      }
    });
  }

  private cacheCompletionResult(key: string, entry: CSharpCompletionCacheEntry) {
    if (!entry.suggestions.length) return;
    this.completionCache.delete(key);
    this.completionCache.set(key, entry);
    while (this.completionCache.size > CSHARP_COMPLETION_CACHE_LIMIT) {
      const oldestKey = this.completionCache.keys().next().value;
      if (!oldestKey) break;
      this.completionCache.delete(oldestKey);
    }
  }

  private cacheCompletionSessionResult(key: string, entry: CSharpCompletionCacheEntry) {
    if (!entry.suggestions.length || entry.incomplete || !entry.sessionReusable || !entry.completionSnapshot) return;
    this.completionSessionCache.delete(key);
    this.completionSessionCache.set(key, entry);
    while (this.completionSessionCache.size > CSHARP_COMPLETION_SESSION_CACHE_LIMIT) {
      const oldestKey = this.completionSessionCache.keys().next().value;
      if (!oldestKey) break;
      this.completionSessionCache.delete(oldestKey);
    }
  }

  private cachePredictiveCompletionResult(key: string, entry: CSharpPredictiveCompletionCacheEntry) {
    if (!entry.itemCount) return;
    this.predictiveCompletionCache.delete(key);
    this.predictiveCompletionCache.set(key, entry);
    while (this.predictiveCompletionCache.size > CSHARP_PREDICTIVE_COMPLETION_CACHE_LIMIT) {
      const oldestKey = this.predictiveCompletionCache.keys().next().value;
      if (!oldestKey) break;
      this.predictiveCompletionCache.delete(oldestKey);
    }
  }

  private retainedCompletionListKeys(workspace: 'completion' | 'speculative'): string[] {
    const speculative = workspace === 'speculative';
    const keys = new Set<string>();
    const addEntry = (entry: CSharpCompletionCacheEntry) => {
      if (entry.completionList?.speculative === speculative) {
        keys.add(entry.completionList.key);
      }
    };

    for (const entry of this.completionCache.values()) addEntry(entry);
    for (const entry of this.completionSessionCache.values()) addEntry(entry);
    if (speculative) {
      for (const entry of this.predictiveCompletionCache.values()) {
        keys.add(entry.completionListKey);
      }
    }
    if (this.activeCompletionList?.speculative === speculative) {
      keys.add(this.activeCompletionList.key);
    }
    const pendingPublicationKeys = speculative
      ? this.pendingSpeculativeCompletionListPublicationKeys
      : this.pendingCompletionListPublicationKeys;
    for (const key of pendingPublicationKeys) keys.add(key);
    return Array.from(keys);
  }

  private toCompletionList(entry: CSharpCompletionCacheEntry): monaco.languages.CompletionList {
    this.lastCompletions.clear();
    this.lastCompletionContexts.clear();
    this.activeCompletionList = entry.completionList ?? null;
    const presentationFilterRange = entry.presentationFilterRange;
    const canonicalFilterRange = entry.renderedFilterRange;
    const preselectedCompletionIndices = entry.preselectedCompletionIndices;
    const suggestions = entry.suggestions.map((item, index) => {
      const lspItem = entry.lspItems[index];
      const rawData = lspItem?.data ?? lspItem?.Data;
      const completionIndex = Number.isInteger(rawData) ? rawData : index;
      let range = item.range;
      if (presentationFilterRange && canonicalFilterRange) {
        if (csharpCompletionRangeMatchesFilter(item.range, canonicalFilterRange)) {
          range = csharpCompletionRebasedRange(item.range, presentationFilterRange);
        } else if (
          this.model &&
          !this.model.isDisposed() &&
          entry.completionSnapshot &&
          entry.lateContext
        ) {
          range = csharpCompletionMapRangeToCurrent(
            item.range,
            candidate => this.mapMainCompletionRangeToCurrent(
              this.model!,
              candidate,
              entry.completionSnapshot!,
              entry.lateContext!,
            ) ?? undefined,
          ) ?? item.range;
        }
      }
      return {
        ...item,
        range,
        ...(preselectedCompletionIndices
          ? { preselect: preselectedCompletionIndices.has(completionIndex) }
          : {}),
        additionalTextEdits: item.additionalTextEdits?.map(edit => ({ ...edit })),
      };
    });
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
    this.activeCompletionList = null;
    return { suggestions: [] };
  }

  private cancelledCompletionList(): monaco.languages.CompletionList {
    // A cancelled, obsolete provider must not erase resolve state belonging to the
    // completion popup that replaced it.
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
    const assertCurrentModelSnapshot = () => {
      if (model.isDisposed() || model.getVersionId() !== snapshot.modelVersionId) {
        throw new CSharpObsoleteSemanticResponseError(
          `${method} source snapshot was superseded before its result could be used.`
        );
      }
    };
    const invoke = (metadataRetryCount: number): Promise<unknown> => {
      assertCurrentModelSnapshot();
      const environmentVersion = this.completionEnvironmentVersion;
      const metadataInvalidationSerial = this.metadataInvalidationSerial;
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
      if (cached) {
        return Promise.resolve(cached).then(value => {
          assertCurrentModelSnapshot();
          return value;
        });
      }

      const promise = this.omnisharp!(method, snapshot.code, ...args).then(response => {
        let checkedResponse: unknown;
        try {
          checkedResponse = this.requireOmniSharpResponse(method, response);
        } catch (error) {
          this.runtimeResponseCache.delete(key);
          throw error;
        }

        const responseMetadataVersion = this.observeOmniSharpResponseMetadataVersion(checkedResponse);
        const responsePredatesCurrentMetadata = (
          responseMetadataVersion !== null &&
          this.omnisharpMetadataVersion !== null &&
          responseMetadataVersion < this.omnisharpMetadataVersion
        );
        const unversionedResponseCrossedMetadataChange = (
          responseMetadataVersion === null &&
          metadataInvalidationSerial !== this.metadataInvalidationSerial
        );
        const metadataInvalidationDelta = (
          this.metadataInvalidationSerial - metadataInvalidationSerial
        );
        const environmentVersionDelta = (
          this.completionEnvironmentVersion - environmentVersion
        );
        const nonMetadataEnvironmentChange = environmentVersionDelta > metadataInvalidationDelta;
        const responseIsStale = responsePredatesCurrentMetadata || unversionedResponseCrossedMetadataChange;

        this.runtimeResponseCache.delete(key);
        assertCurrentModelSnapshot();
        if (nonMetadataEnvironmentChange) {
          // Re-running only the raw bridge call would reuse the old project snapshot and
          // arguments. Let Monaco supersede this request instead of relabeling stale work
          // with the new semantic-environment cache identity.
          throw new CSharpObsoleteSemanticResponseError(
            `${method} completed after its semantic environment was superseded.`
          );
        }
        if (responseIsStale) {
          if (metadataRetryCount < 2) {
            this.recordDebugEvent({
              feature: method,
              phase: 'metadata-retry',
              level: 'info',
              message: `Retrying ${method} after a concurrent semantic-environment update.`,
              request: {
                metadataRetryCount,
                responseMetadataVersion,
                currentMetadataVersion: this.omnisharpMetadataVersion,
                environmentVersion,
                currentEnvironmentVersion: this.completionEnvironmentVersion,
              },
            });
            return invoke(metadataRetryCount + 1);
          }
          throw new Error(`${method} repeatedly returned a response from an obsolete semantic environment.`);
        }

        // A response can itself announce the newer metadata generation. In that case it
        // is already exact, but it belongs under the post-invalidation cache identity.
        const finalKey = [
          this.completionEnvironmentVersion,
          method,
          snapshot.uri,
          snapshot.modelVersionId,
          snapshot.length,
          snapshot.hash,
          ...cacheParts.map(part => stableCacheKey(part)),
        ].join(':');
        this.cacheRuntimeResponse(finalKey, checkedResponse);
        return checkedResponse;
      }, error => {
        this.runtimeResponseCache.delete(key);
        throw error;
      });
      this.cacheRuntimeResponse(key, promise);
      return promise;
    };

    return invoke(0);
  }

  private requireOmniSharpResponse(method: string, response: unknown): unknown {
    if (response === false || isCSharpOmniSharpBridgeErrorPayload(response)) {
      throw new CSharpOmniSharpBridgeError(method, response);
    }
    return response;
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

  private completionSessionCacheKey(
    model: monaco.editor.ITextModel,
    snapshot: CSharpCompletionRequestSnapshot,
    position: monaco.Position,
    projectRequest: CSharpSerializedProjectRequest,
    request: any
  ): string {
    const filterRange = this.getCompletionFilterRangeAtPosition(model, position);
    const filterStart = model.getOffsetAt({
      lineNumber: filterRange.startLineNumber,
      column: filterRange.startColumn,
    });
    const filterEnd = model.getOffsetAt({
      lineNumber: filterRange.endLineNumber,
      column: filterRange.endColumn,
    });
    return [
      'omnisharp-session-v1',
      model.uri.toString(),
      filterStart,
      snapshot.code.length - (filterEnd - filterStart),
      csharpCompletionFastHashWithoutSpan(snapshot.code, filterStart, filterEnd),
      projectRequest.currentPath,
      projectRequest.revision,
      request.CompletionTrigger,
      request.TriggerCharacter ?? '',
      this.completionEnvironmentVersion,
    ].join('|');
  }

  private async completionEntryFromSession(
    model: monaco.editor.ITextModel,
    entry: CSharpCompletionCacheEntry,
    cancellationToken?: monaco.CancellationToken
  ): Promise<CSharpCompletionCacheEntry | null> {
    if (cancellationToken?.isCancellationRequested || model.isDisposed()) return null;
    const originalSnapshot = entry.completionSnapshot;
    const renderedFilterRange = entry.renderedFilterRange;
    if (!originalSnapshot || !renderedFilterRange || !entry.sessionReusable || entry.incomplete) return null;

    const lateContext = this.getLateCompletionContext(model, originalSnapshot);
    if (!lateContext) return null;

    const completionList = entry.completionList;
    if (!completionList || !this.omnisharp) return null;
    const filterText = model.getValueInRange(lateContext.filterRange);
    const method = completionList.speculative
      ? 'GetSpeculativeCompletionRefilterAsync'
      : 'GetCompletionRefilterAsync';
    const expectedModelVersionId = model.getVersionId();
    const expectedRequestSerial = this.completionRequestSerial;
    const metadataInvalidationSerial = this.metadataInvalidationSerial;
    const rawRefilterResponse = await this.omnisharp(method, filterText, completionList.key);
    if (
      cancellationToken?.isCancellationRequested ||
      model.isDisposed() ||
      model.getVersionId() !== expectedModelVersionId ||
      this.completionRequestSerial !== expectedRequestSerial
    ) return null;

    const refilterResponse = this.requireOmniSharpResponse(
      method,
      rawRefilterResponse,
    ) as { success?: unknown; preselectedIndices?: unknown };
    this.observeOmniSharpResponseMetadataVersion(refilterResponse);
    if (metadataInvalidationSerial !== this.metadataInvalidationSerial) return null;

    // Re-check the cursor and exact late-typing shape after the worker await. Monaco may
    // cancel a provider without preventing its promise from resolving, and a cursor move
    // does not necessarily change the model version or request serial.
    const currentLateContext = this.getLateCompletionContext(model, originalSnapshot);
    if (
      !currentLateContext ||
      currentLateContext.insertedLength !== lateContext.insertedLength ||
      !csharpCompletionRangesEqual(currentLateContext.filterRange, lateContext.filterRange) ||
      model.getValueInRange(currentLateContext.filterRange) !== filterText
    ) return null;
    if (refilterResponse?.success !== true || !Array.isArray(refilterResponse.preselectedIndices)) {
      return null;
    }
    const preselectedIndices = new Set(
      refilterResponse.preselectedIndices.filter((value): value is number => Number.isInteger(value)),
    );

    return {
      ...entry,
      completionSnapshot: originalSnapshot,
      lateContext: currentLateContext,
      // Keep the canonical object graph immutable. The one unavoidable clone handed to
      // Monaco performs range rebasing and preselection in toCompletionList.
      renderedFilterRange,
      presentationFilterRange: currentLateContext.filterRange,
      preselectedCompletionIndices: preselectedIndices,
      sessionReusable: true,
      completionList,
    };
  }

  private createCompletionSnapshot(
    model: monaco.editor.ITextModel,
    position: monaco.Position
  ): CSharpCompletionRequestSnapshot {
    const snapshot = this.getModelTextSnapshot(model);
    return {
      code: snapshot.code,
      hash: snapshot.hash,
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
    if (!selections?.length) return false;
    // Monaco asks once for the primary caret and applies the accepted completion to
    // compatible secondary carets itself. Secondary empty selections therefore do not
    // make the primary request stale; rejecting them silently disabled exact OmniSharp
    // completion whenever multi-cursor editing was active.
    return selections.every(selection =>
      selection.startLineNumber === selection.endLineNumber &&
      selection.startColumn === selection.endColumn
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
    callId: string,
    completionListKey: string
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

      // Retain only a request that actually reached the worker. Pre-dispatch misses can
      // queue freely while typing without inflating the reconciliation payload; once
      // dispatched, the key remains live through response conversion/cache publication.
      this.pendingCompletionListPublicationKeys.add(completionListKey);
      return this.requestSynchronizedCompletion(
        'completion',
        model,
        snapshot.code,
        request,
        projectRequest,
        completionListKey,
      );
    });

    this.completionDispatchTail = run.then(() => undefined, () => undefined);
    return run;
  }

  private completionTextStateFor(
    workspace: 'completion' | 'speculative'
  ): CSharpCompletionTextState | null {
    return workspace === 'completion' ? this.completionTextState : this.speculativeTextState;
  }

  private setCompletionTextState(
    workspace: 'completion' | 'speculative',
    state: CSharpCompletionTextState | null
  ) {
    if (workspace === 'completion') {
      this.completionTextState = state;
    } else {
      this.speculativeTextState = state;
    }
  }

  private createCompletionTextSyncRequest(
    workspace: 'completion' | 'speculative',
    targetCode: string,
    projectRequest: CSharpSerializedProjectRequest,
    forceFullSync: boolean
  ): CSharpCompletionTextSyncRequest {
    const state = this.completionTextStateFor(workspace);
    if (
      forceFullSync ||
      !state ||
      state.runtimeSession !== this.runtimeSessionSerial ||
      state.projectRevision !== projectRequest.revision ||
      state.length !== state.code.length
    ) {
      return {
        FullSync: true,
        ExpectedVersion: state?.version ?? -1,
        ExpectedOldTextLength: state?.length ?? 0,
        ExpectedNewTextLength: targetCode.length,
        ProjectRevision: projectRequest.revision,
        Changes: [],
      };
    }

    let prefixLength = 0;
    const maximumPrefixLength = Math.min(state.code.length, targetCode.length);
    while (
      prefixLength < maximumPrefixLength &&
      state.code.charCodeAt(prefixLength) === targetCode.charCodeAt(prefixLength)
    ) {
      prefixLength += 1;
    }

    let previousSuffixStart = state.code.length;
    let targetSuffixStart = targetCode.length;
    while (
      previousSuffixStart > prefixLength &&
      targetSuffixStart > prefixLength &&
      state.code.charCodeAt(previousSuffixStart - 1) === targetCode.charCodeAt(targetSuffixStart - 1)
    ) {
      previousSuffixStart -= 1;
      targetSuffixStart -= 1;
    }

    const changes = state.code === targetCode
      ? []
      : [{
          Start: prefixLength,
          Length: previousSuffixStart - prefixLength,
          NewText: targetCode.slice(prefixLength, targetSuffixStart),
        }];
    return {
      FullSync: false,
      ExpectedVersion: state.version,
      ExpectedOldTextLength: state.length,
      ExpectedNewTextLength: targetCode.length,
      ProjectRevision: projectRequest.revision,
      Changes: changes,
    };
  }

  private commitCompletionTextSync(
    workspace: 'completion' | 'speculative',
    targetCode: string,
    projectRequest: CSharpSerializedProjectRequest,
    acknowledgement: CSharpCompletionTextSyncAck
  ) {
    const version = acknowledgement.version;
    const textLength = acknowledgement.textLength;
    if (
      acknowledgement.success !== true ||
      !Number.isSafeInteger(version) ||
      (version as number) < 0 ||
      !Number.isSafeInteger(textLength) ||
      textLength !== targetCode.length ||
      acknowledgement.projectRevision !== projectRequest.revision
    ) {
      this.setCompletionTextState(workspace, null);
      throw new Error(`OmniSharp returned an invalid ${workspace} text synchronization acknowledgement.`);
    }

    this.setCompletionTextState(workspace, {
      runtimeSession: this.runtimeSessionSerial,
      projectRevision: projectRequest.revision,
      version: version as number,
      length: textLength as number,
      code: targetCode,
    });
    this.markProjectSnapshotApplied(workspace, projectRequest);
  }

  private async requestSynchronizedCompletion(
    workspace: 'completion' | 'speculative',
    model: monaco.editor.ITextModel,
    targetCode: string,
    request: unknown,
    projectRequest: CSharpSerializedProjectRequest,
    completionListKey: string
  ): Promise<unknown> {
    if (!this.omnisharp) {
      throw new Error('OmniSharp is unavailable while synchronizing completion text.');
    }

    const method = workspace === 'completion'
      ? 'GetCompletionAsync'
      : 'GetSpeculativeCompletionAsync';
    let forceFullSync = false;
    let usedFullSyncRecovery = false;
    let usedMetadataRetry = false;
    const assertCurrentProjectSnapshot = () => {
      const currentProjectRequest = this.createSerializedDiagnosticProjectRequest(model);
      if (currentProjectRequest.revision !== projectRequest.revision) {
        throw new CSharpObsoleteSemanticResponseError(
          `OmniSharp ${workspace} completion project snapshot was superseded.`
        );
      }
    };
    for (let attempt = 0; attempt < 3; attempt += 1) {
      assertCurrentProjectSnapshot();
      const sync = this.createCompletionTextSyncRequest(
        workspace,
        targetCode,
        projectRequest,
        forceFullSync,
      );
      const metadataInvalidationSerialBeforeRequest = this.metadataInvalidationSerial;
      const replacementBytes = sync.Changes.reduce(
        (total, change) => total + change.NewText.length,
        0,
      );
      this.recordDebugEvent({
        feature: 'completion.sync',
        phase: sync.FullSync ? 'full' : 'incremental',
        level: 'info',
        message: sync.FullSync
          ? `Synchronizing the full ${workspace} document.`
          : `Synchronizing an incremental ${workspace} document change.`,
        request: {
          workspace,
          attempt,
          expectedVersion: sync.ExpectedVersion,
          oldLength: sync.ExpectedOldTextLength,
          newLength: sync.ExpectedNewTextLength,
          changeCount: sync.Changes.length,
          replacementBytes,
          projectRevision: sync.ProjectRevision,
        },
      });

      let response: unknown;
      try {
        response = this.requireOmniSharpResponse(
          method,
          await this.omnisharp(
            method,
            sync.FullSync ? targetCode : '',
            sync,
            request,
            sync.FullSync ? projectRequest.serialized : '',
            completionListKey,
            this.retainedCompletionListKeys(workspace),
          ),
        );
      } catch (error) {
        // A timeout or malformed bridge response leaves the remote mutation unknown.
        this.setCompletionTextState(workspace, null);
        throw error;
      }

      assertCurrentProjectSnapshot();

      const responseMetadataVersion = this.observeOmniSharpResponseMetadataVersion(response);
      const envelope = response as any;
      const acknowledgement = (envelope?.s ?? envelope?.sync) as CSharpCompletionTextSyncAck | undefined;
      const completion = envelope?.p ?? envelope?.completion;
      if (workspace === 'speculative' && (envelope?.c === true || envelope?.cancelled === true)) {
        // A cancellation after source synchronization still leaves the worker's text
        // state exact. Retain that acknowledgement, but never treat absence of a list as
        // corruption requiring a later full-source fallback.
        if (acknowledgement?.success === true) {
          this.commitCompletionTextSync(workspace, targetCode, projectRequest, acknowledgement);
        }
        throw new CSharpObsoleteSemanticResponseError(
          'Speculative completion was superseded by interactive authoring work.'
        );
      }
      if (acknowledgement?.success === true) {
        this.commitCompletionTextSync(workspace, targetCode, projectRequest, acknowledgement);
        if (completion == null) {
          throw new Error(`OmniSharp synchronized ${workspace} text without returning a completion payload.`);
        }

        const responsePredatesCurrentMetadata = (
          responseMetadataVersion !== null &&
          this.omnisharpMetadataVersion !== null &&
          responseMetadataVersion < this.omnisharpMetadataVersion
        );
        const unversionedResponseCrossedMetadataChange = (
          responseMetadataVersion === null &&
          metadataInvalidationSerialBeforeRequest !== this.metadataInvalidationSerial
        );
        if (responsePredatesCurrentMetadata || unversionedResponseCrossedMetadataChange) {
          if (!usedMetadataRetry) {
            usedMetadataRetry = true;
            forceFullSync = false;
            this.recordDebugEvent({
              feature: 'completion.sync',
              phase: 'metadata-retry',
              level: 'info',
              message: `Retrying ${workspace} completion after a concurrent metadata update.`,
              request: {
                attempt,
                responseMetadataVersion,
                currentMetadataVersion: this.omnisharpMetadataVersion,
                metadataInvalidationSerialBeforeRequest,
                currentMetadataInvalidationSerial: this.metadataInvalidationSerial,
              },
            });
            continue;
          }
          throw new Error(`OmniSharp returned ${workspace} completion from an obsolete metadata version.`);
        }

        if (responseMetadataVersion !== null) {
          this.rememberRuntimeResponseMetadataVersion(completion, responseMetadataVersion);
        }
        return completion;
      }

      const canRecover = (
        !sync.FullSync &&
        acknowledgement?.requiresFullSync === true &&
        !usedFullSyncRecovery
      );
      if (canRecover) {
        usedFullSyncRecovery = true;
        forceFullSync = true;
        continue;
      }

      this.setCompletionTextState(workspace, null);
      const message = typeof acknowledgement?.message === 'string'
        ? acknowledgement.message
        : `OmniSharp rejected the ${workspace} text synchronization.`;
      throw new Error(message);
    }

    this.setCompletionTextState(workspace, null);
    throw new Error(`OmniSharp could not synchronize the ${workspace} completion document.`);
  }

  private enqueueProjectModelCall(
    workspace: 'completion' | 'diagnostic',
    method: string,
    model: monaco.editor.ITextModel,
    snapshot: CSharpModelTextSnapshot,
    cacheParts: (projectRequest: CSharpSerializedProjectRequest) => unknown[],
    ...args: unknown[]
  ): Promise<unknown> {
    const execute = async () => {
      const projectRequest = await this.ensureWorkspaceProjectState(workspace, model, snapshot);
      const assertCurrentProjectSnapshot = () => {
        const currentProjectRequest = this.createSerializedDiagnosticProjectRequest(model);
        if (currentProjectRequest.revision !== projectRequest.revision) {
          throw new CSharpObsoleteSemanticResponseError(
            `${method} project snapshot was superseded before its result could be used.`
          );
        }
      };
      assertCurrentProjectSnapshot();
      const response = await this.cachedOmniSharpModelCall(
        method,
        model,
        snapshot,
        cacheParts(projectRequest),
        ...args,
      );
      assertCurrentProjectSnapshot();
      return response;
    };
    return this.enqueueWorkspaceTransaction(workspace, execute);
  }

  private enqueueWorkspaceTransaction<T>(
    workspace: 'completion' | 'speculative' | 'diagnostic',
    execute: () => Promise<T>
  ): Promise<T> {
    const previous = workspace === 'completion'
      ? this.completionDispatchTail
      : workspace === 'speculative'
        ? this.speculativeDispatchTail
        : this.diagnosticDispatchTail;
    const run = previous.then(execute, execute);
    const settled = run.then(() => undefined, () => undefined);
    if (workspace === 'completion') {
      this.completionDispatchTail = settled;
    } else if (workspace === 'speculative') {
      this.speculativeDispatchTail = settled;
    } else {
      this.diagnosticDispatchTail = settled;
    }
    return run;
  }

  private scheduleCompletionProjectPrewarm(
    model: monaco.editor.ITextModel,
    prefetchActiveCompletionContext = false,
  ): Promise<CSharpCompletionPrewarmOutcome> {
    if (!this.omnisharp || model.isDisposed() || model.getLanguageId() !== 'csharp') {
      return Promise.resolve('failed');
    }
    const serial = ++this.completionProjectPrewarmSerial;
    const startedAt = this.now();
    const synchronize = this.completionDispatchTail.then(async () => {
      if (
        serial !== this.completionProjectPrewarmSerial ||
        !this.omnisharp ||
        model.isDisposed() ||
        this.model !== model ||
        model.getLanguageId() !== 'csharp'
      ) {
        throw new CSharpObsoleteSemanticResponseError(
          'Completion project prewarm was superseded before synchronization.'
        );
      }

      const snapshot = this.getModelTextSnapshot(model);
      const prewarmPosition = prefetchActiveCompletionContext && this.editor?.getModel() === model
        ? this.editor.getPosition()
        : null;
      const assertCurrentPrewarmSnapshot = () => {
        if (
          serial !== this.completionProjectPrewarmSerial ||
          !this.omnisharp ||
          model.isDisposed() ||
          this.model !== model ||
          model.getLanguageId() !== 'csharp' ||
          model.getVersionId() !== snapshot.modelVersionId
        ) {
          throw new CSharpObsoleteSemanticResponseError(
            'Completion project prewarm was superseded by a newer active source snapshot.'
          );
        }
        const currentSnapshot = this.getModelTextSnapshot(model);
        if (
          currentSnapshot.length !== snapshot.length ||
          currentSnapshot.hash !== snapshot.hash ||
          currentSnapshot.code !== snapshot.code
        ) {
          throw new CSharpObsoleteSemanticResponseError(
            'Completion project prewarm source changed before publication.'
          );
        }
      };

      const projectRequest = await this.ensureWorkspaceProjectState('completion', model, snapshot);
      assertCurrentPrewarmSnapshot();
      const currentProjectRequest = this.createSerializedDiagnosticProjectRequest(model);
      if (currentProjectRequest.revision !== projectRequest.revision) {
        throw new CSharpObsoleteSemanticResponseError(
          'Completion project prewarm was superseded by a newer exact project snapshot.'
        );
      }

      return { snapshot, prewarmPosition, assertCurrentPrewarmSnapshot, projectRequest };
    });
    // Only the exact project/source synchronization occupies the normal completion lane.
    // The potentially expensive root-list prefetch below runs in the cancellable
    // speculative workspace, so an accepted real completion can overtake it.
    this.completionDispatchTail = synchronize.then(() => undefined, () => undefined);

    const run = synchronize.then(async ({
      snapshot,
      prewarmPosition,
      assertCurrentPrewarmSnapshot,
      projectRequest,
    }) => {

      let prefetchedItemCount = 0;
      if (
        prewarmPosition &&
        this.isEditorAtPosition(model, prewarmPosition)
      ) {
        // An actual completion at the exact idle cursor warms Roslyn and retains its full
        // resolve/refilter state. The first typed identifier can then use the semantic
        // session cache instead of marshalling the multi-megabyte root list interactively.
        const context: monaco.languages.CompletionContext = {
          triggerKind: monaco.languages.CompletionTriggerKind.Invoke,
        };
        const completionSnapshot = this.createCompletionSnapshot(model, prewarmPosition);
        completionSnapshot.structuralVersion = this.completionStructuralVersion;
        const request = csharpOmniSharpCompletionRequest(model, prewarmPosition, context);
        const completionListKey = `speculative:${this.runtimeSessionSerial}:prewarm-${serial}`;
        const response = await this.enqueueWorkspaceTransaction('speculative', async () => {
          assertCurrentPrewarmSnapshot();
          if (!this.isEditorAtPosition(model, prewarmPosition)) {
            throw new CSharpObsoleteSemanticResponseError(
              'Completion project prewarm cursor moved before dispatch.'
            );
          }
          this.pendingSpeculativeCompletionListPublicationKeys.add(completionListKey);
          try {
            return await this.requestSynchronizedCompletion(
              'speculative',
              model,
              snapshot.code,
              request,
              projectRequest,
              completionListKey,
            );
          } finally {
            this.pendingSpeculativeCompletionListPublicationKeys.delete(completionListKey);
          }
        });
        assertCurrentPrewarmSnapshot();
        if (!this.isEditorAtPosition(model, prewarmPosition)) {
          throw new CSharpObsoleteSemanticResponseError(
            'Completion project prewarm cursor moved before publication.'
          );
        }
        const defaultRange = this.getCompletionFilterRangeAtPosition(model, prewarmPosition);
        const entry = this.completionEntryFromResponse(
          model,
          response,
          defaultRange,
          completionSnapshot,
          null,
          { key: completionListKey, speculative: true },
        );
        if (entry.suggestions.length) {
          const cacheKey = csharpContextualCompletionCacheKey(
            model,
            completionSnapshot,
            prewarmPosition,
            context,
            request,
            projectRequest,
            this.completionEnvironmentVersion,
          );
          const sessionKey = this.completionSessionCacheKey(
            model,
            completionSnapshot,
            prewarmPosition,
            projectRequest,
            request,
          );
          this.cacheCompletionResult(cacheKey, entry);
          this.cacheCompletionSessionResult(sessionKey, entry);
          this.completionWorkerStateKey = cacheKey;
          this.rememberPredictiveCompletionSource(model, projectRequest, entry);
          prefetchedItemCount = entry.suggestions.length;
        }
      }

      this.recordDebugEvent({
        feature: 'completion.sync',
        phase: 'project-prewarm',
        level: 'success',
        message: 'C# completion workspace synchronized before the first interactive request.',
        durationMs: Math.round((this.now() - startedAt) * 10) / 10,
        request: {
          projectRevision: projectRequest.revision,
          projectFileCount: projectRequest.request.Files.length,
          codeLength: snapshot.length,
          prefetchedItemCount,
        },
      });
      return 'completed' as const;
    });
    const settled = run.catch(error => {
      const superseded = (
        serial !== this.completionProjectPrewarmSerial ||
        error instanceof CSharpObsoleteSemanticResponseError
      );
      this.recordDebugEvent({
        feature: 'completion.sync',
        phase: 'project-prewarm-failed',
        level: superseded ? 'warning' : 'error',
        message: superseded
          ? 'C# completion prewarm was superseded by newer editor work.'
          : 'C# completion workspace pre-synchronization did not complete.',
        durationMs: Math.round((this.now() - startedAt) * 10) / 10,
        error: this.summarizeError(error),
      });
      return superseded ? 'superseded' as const : 'failed' as const;
    });
    return settled;
  }

  private async ensureLocalOmniSharpRuntime() {
    if (this.initializationPromise && this.iframeUrl === CSHARP_OMNISHARP_URLS.local) {
      await this.initializationPromise;
    } else if (!this.omnisharp || this.iframeUrl !== CSHARP_OMNISHARP_URLS.local) {
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
        provideCompletionItems: async (model, position, context, cancellationToken) => {
          const result = await this.debugProviderCall('completion', model, {
            position,
            triggerKind: context.triggerKind,
            triggerCharacter: context.triggerCharacter,
            cancellationRequested: cancellationToken.isCancellationRequested,
          }, () => this.debouncedCompletions(model, position, context, cancellationToken));
          this.scheduleNativeTriggerPresentationRecovery(
            model,
            position,
            context,
            cancellationToken,
            result,
          );
          return result;
        },
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
  private editorCursorChangeListener: monaco.IDisposable | null = null;
  private modelChangeListener: monaco.IDisposable | null = null;
  private automaticCompletionTriggerTimer: ReturnType<typeof setTimeout> | null = null;
  private nativeTriggerPresentationTimer: ReturnType<typeof setTimeout> | null = null;
  private cursorCompletionPrewarmTimer: ReturnType<typeof setTimeout> | null = null;

  setupEditor(
    editor: monaco.editor.IStandaloneCodeEditor,
    projectFilesProvider?: CSharpProjectFilesProvider,
    projectFilesRevisionProvider?: CSharpProjectFilesRevisionProvider
  ) {
    this.ensureProvidersRegistered();
    editor.updateOptions({
      quickSuggestions: {
        other: true,
        comments: false,
        strings: false,
      },
      quickSuggestionsDelay: 0,
      wordBasedSuggestions: 'off',
      suggest: {
        showWords: false,
      },
    });
    const projectProviderChanged = (
      (!!projectFilesProvider && projectFilesProvider !== this.projectFilesProvider) ||
      (!!projectFilesRevisionProvider && projectFilesRevisionProvider !== this.projectFilesRevisionProvider)
    );
    if (projectFilesProvider) {
      this.projectFilesProvider = projectFilesProvider;
    }
    this.projectFilesRevisionProvider = projectFilesRevisionProvider ?? null;
    if (this.editor === editor) {
      if (projectProviderChanged) {
        this.projectRequestCache = null;
        this.projectRequestSource = null;
        this.projectRequestSourceRevision = undefined;
        this.clearCompletionState();
        if (this.model && this.model.getLanguageId() === 'csharp') {
          this.requestDiagnostics(this.model);
          if (this.omnisharp) this.scheduleCompletionProjectPrewarm(this.model);
        }
      }
      return;
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
    this.completionProjectPrewarmSerial += 1;
    this.modelChangeListener?.dispose();
    this.modelChangeListener = null;
    if (this.automaticCompletionTriggerTimer) {
      clearTimeout(this.automaticCompletionTriggerTimer);
      this.automaticCompletionTriggerTimer = null;
    }
    if (this.nativeTriggerPresentationTimer) {
      clearTimeout(this.nativeTriggerPresentationTimer);
      this.nativeTriggerPresentationTimer = null;
    }
    this.editorChangeListener?.dispose();
    this.editorChangeListener = null;
    this.editorCursorChangeListener?.dispose();
    this.editorCursorChangeListener = null;
    if (this.cursorCompletionPrewarmTimer) {
      clearTimeout(this.cursorCompletionPrewarmTimer);
      this.cursorCompletionPrewarmTimer = null;
    }
    this.editor = null;
    this.model = null;
    this.clearCompletionState();
  }

  setupDiagnostics(editor: monaco.editor.IStandaloneCodeEditor) {
    this.clearEditor();
    this.editor = editor;

    const updateModel = () => {
      this.completionProjectPrewarmSerial += 1;
      this.modelChangeListener?.dispose();
      this.modelChangeListener = null;
      const previousModel = this.model;
      this.model = editor.getModel();
      if (previousModel && previousModel !== this.model) {
        this.projectRequestCache = null;
        this.projectRequestSource = null;
        this.projectRequestSourceRevision = undefined;
        this.clearCompletionState();
      }

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
        if (this.omnisharp) this.scheduleCompletionProjectPrewarm(model);
        this.modelChangeListener = model.onDidChangeContent(event => {
          if (!model.isDisposed() && model.getLanguageId() === 'csharp') {
            const isBulkEdit = event.isFlush || event.changes.some(change =>
              change.rangeLength > 1 || change.text.length > 1);
            if (isBulkEdit || !this.predictiveCompletionPlan) {
              this.cancelPendingSpeculativeRuntime();
            }
            if (isBulkEdit) {
              // A wholesale replacement cannot be a continuation of an identifier-level
              // prediction. Invalidate it before launching the new exact-context prewarm,
              // so deferred cursor reconciliation cannot cancel that newer work.
              this.clearPredictiveCompletionState(false);
            }
            this.completionProjectPrewarmSerial += 1;
            this.clearModelRuntimeState(model);
            this.clearCompletionState({
              structural: false,
              preserveEnvironment: true,
              preserveReusableCaches: true,
            });
            this.recordDebugEvent({
              feature: 'model',
              phase: 'content-changed',
              level: 'info',
              message: 'C# model content changed.',
              model: this.summarizeModel(model),
            });
            this.requestDiagnostics(model);
            // Monaco updates the model before it advances the editor selection. Reconcile
            // on the next task so createPredictiveCompletionPlan sees the post-keystroke
            // cursor; doing this synchronously silently misses every character while a
            // suggest widget remains open.
            this.schedulePredictiveCompletionRefresh(model);
            if (this.omnisharp && isBulkEdit) {
              // Project/file loads and paste-style edits establish a new stable context.
              // Start an exact speculative list immediately; the next keystroke cancels it
              // losslessly if the user does not actually pause at that cursor.
              void this.scheduleCompletionProjectPrewarm(model, true);
            }
            this.scheduleAutomaticCompletionAfterInput(editor, model, event);
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
    this.editorCursorChangeListener = editor.onDidChangeCursorPosition(() => {
      const model = this.model;
      if (
        model &&
        editor.getModel() === model &&
        !model.isDisposed() &&
        model.getLanguageId() === 'csharp'
      ) {
        this.scheduleCursorCompletionPrewarm(editor, model);
      }
    });
  }

  private scheduleCursorCompletionPrewarm(
    editor: monaco.editor.IStandaloneCodeEditor,
    model: monaco.editor.ITextModel,
  ) {
    if (this.cursorCompletionPrewarmTimer) {
      clearTimeout(this.cursorCompletionPrewarmTimer);
      this.cursorCompletionPrewarmTimer = null;
    }
    if (!this.omnisharp || !editor.hasTextFocus() || this.predictiveCompletionPlan) return;

    const position = editor.getPosition();
    if (!position || !this.isEditorAtPosition(model, position)) return;
    const filterRange = this.getCompletionFilterRangeAtPosition(model, position);
    if (model.getValueInRange(filterRange)) return;
    const offset = model.getOffsetAt(position);
    if (offset <= 0) return;
    const previousPosition = model.getPositionAt(offset - 1);
    const previousCharacter = model.getValueInRange({
      startLineNumber: previousPosition.lineNumber,
      startColumn: previousPosition.column,
      endLineNumber: position.lineNumber,
      endColumn: position.column,
    });
    if (!/^\s$/.test(previousCharacter)) return;

    const expectedVersion = model.getVersionId();
    const tryPrewarm = (tokenizationAttempt: number) => {
      this.cursorCompletionPrewarmTimer = setTimeout(() => {
        this.cursorCompletionPrewarmTimer = null;
        const currentPosition = editor.getPosition();
        if (
          this.editor !== editor ||
          this.model !== model ||
          editor.getModel() !== model ||
          model.isDisposed() ||
          model.getVersionId() !== expectedVersion ||
          !editor.hasTextFocus() ||
          !currentPosition ||
          currentPosition.lineNumber !== position.lineNumber ||
          currentPosition.column !== position.column ||
          this.predictiveCompletionPlan ||
          (typeof document !== 'undefined' &&
            document.querySelector('.suggest-widget.visible'))
        ) {
          return;
        }

        const lexicalState = this.automaticCompletionLexicalState(model, currentPosition);
        if (lexicalState === 'pending') {
          if (tokenizationAttempt < 24) tryPrewarm(tokenizationAttempt + 1);
          return;
        }
        if (lexicalState === 'suppress') return;
        void this.scheduleCompletionProjectPrewarm(model, true);
      }, tokenizationAttempt === 0
        ? CSHARP_CONTEXT_COMPLETION_PREWARM_DELAY_MS
        : 16);
    };
    tryPrewarm(0);
  }

  private scheduleAutomaticCompletionAfterInput(
    editor: monaco.editor.IStandaloneCodeEditor,
    model: monaco.editor.ITextModel,
    event: monaco.editor.IModelContentChangedEvent
  ) {
    if (this.automaticCompletionTriggerTimer) {
      clearTimeout(this.automaticCompletionTriggerTimer);
      this.automaticCompletionTriggerTimer = null;
    }
    if (
      event.isFlush ||
      event.isUndoing ||
      event.isRedoing ||
      event.changes.length !== 1 ||
      !editor.hasTextFocus()
    ) {
      return;
    }

    const insertedText = event.changes[0].text;
    // Context characters are registered on the Monaco provider itself and therefore
    // already trigger exactly once. Scheduling the identifier fallback for `.`/`@`
    // as well can race the native request while it is still resolving and duplicate
    // expensive Roslyn work before the suggest widget has had a chance to open.
    const triggersCompletion = insertedText.length > 0 &&
      insertedText.length === String.fromCodePoint(insertedText.codePointAt(0) || 0).length &&
      isIdentifierPart(insertedText, 0);
    if (!triggersCompletion) return;

    const expectedVersion = model.getVersionId();
    const tryTrigger = (tokenizationAttempt: number) => {
      this.automaticCompletionTriggerTimer = setTimeout(() => {
        this.automaticCompletionTriggerTimer = null;
        if (
          this.editor !== editor ||
          this.model !== model ||
          model.isDisposed() ||
          model.getLanguageId() !== 'csharp' ||
          model.getVersionId() !== expectedVersion ||
          !editor.hasTextFocus()
        ) {
          return;
        }

        const selection = editor.getSelection();
        if (!selection || !selection.isEmpty()) return;
        const position = editor.getPosition();
        if (!position) return;
        const lexicalState = this.automaticCompletionLexicalState(model, position);
        if (lexicalState === 'pending') {
          // A wholesale edit can temporarily invalidate Monaco's incremental token store.
          // Wait for its cheap/background tokenizer rather than guessing inside a raw
          // string or comment, but keep the deterministic trigger within one interaction.
          if (tokenizationAttempt < 24) tryTrigger(tokenizationAttempt + 1);
          return;
        }
        if (lexicalState === 'suppress') return;
        // Monaco already refilters an open semantic list as the identifier grows. Reissuing
        // a manual invoke on every character resets selection state and creates redundant
        // provider traffic, so the deterministic trigger is only for opening a new session.
        if (
          typeof document !== 'undefined' &&
          document.querySelector('.suggest-widget.visible')
        ) return;
        editor.trigger(
          'codecraft.csharp.quick-suggestions',
          'editor.action.triggerSuggest',
          {},
        );
      }, tokenizationAttempt === 0 ? 0 : 16);
    };
    tryTrigger(0);
  }

  private scheduleNativeTriggerPresentationRecovery(
    model: monaco.editor.ITextModel,
    position: monaco.Position,
    context: monaco.languages.CompletionContext,
    cancellationToken: monaco.CancellationToken,
    result: monaco.languages.CompletionList,
  ) {
    if (
      context.triggerKind !== monaco.languages.CompletionTriggerKind.TriggerCharacter ||
      !context.triggerCharacter ||
      cancellationToken.isCancellationRequested ||
      !result.suggestions.length ||
      model.isDisposed()
    ) {
      return;
    }

    if (this.nativeTriggerPresentationTimer) {
      clearTimeout(this.nativeTriggerPresentationTimer);
    }
    const expectedVersion = model.getVersionId();
    // Cross the native commit-character transaction and its render turn. Triggering in
    // the immediately following task can still inherit Monaco's transient suppression
    // flag and discard the already-cached member list a second time.
    this.nativeTriggerPresentationTimer = setTimeout(() => {
      this.nativeTriggerPresentationTimer = null;
      const editor = this.editor;
      const currentPosition = editor?.getPosition();
      if (
        !editor ||
        this.model !== model ||
        editor.getModel() !== model ||
        model.isDisposed() ||
        model.getVersionId() !== expectedVersion ||
        !editor.hasTextFocus() ||
        !currentPosition ||
        currentPosition.lineNumber !== position.lineNumber ||
        currentPosition.column !== position.column ||
        (typeof document !== 'undefined' &&
          document.querySelector('.suggest-widget.visible'))
      ) {
        return;
      }

      // A trigger character can commit the selected item from the previous list and leave
      // Monaco's widget suppressed even though its native provider just returned members.
      // Recover only after that semantic request has completed and populated the reusable
      // session, so this presentation invoke can never duplicate expensive Roslyn work.
      editor.trigger(
        'codecraft.csharp.native-trigger-presentation',
        'editor.action.triggerSuggest',
        {},
      );
    }, 32);
  }

  private automaticCompletionLexicalState(
    model: monaco.editor.ITextModel,
    position: monaco.Position,
  ): 'allow' | 'suppress' | 'pending' {
    try {
      // Respect the same lexical policy as quickSuggestions.comments/strings=false.
      // Only use the incremental/cheap tokenizer path: this manual trigger supplements
      // Monaco's own quick-suggest machinery and must never synchronously tokenize a huge
      // file or guess from stale tokens inside comments, strings, or raw strings.
      const tokenization = (model as any).tokenization;
      if (!tokenization) return 'pending';
      if (!tokenization.hasAccurateTokensForLine?.(position.lineNumber)) {
        tokenization.tokenizeIfCheap?.(position.lineNumber);
      }
      if (!tokenization.hasAccurateTokensForLine?.(position.lineNumber)) return 'pending';
      const lineTokens = tokenization.getLineTokens?.(position.lineNumber);
      if (!lineTokens) return 'pending';
      const offset = Math.max(0, position.column - 2);
      const tokenIndex = lineTokens.findTokenIndexAtOffset(offset);
      const standardTokenType = lineTokens.getStandardTokenType(tokenIndex);
      // Monaco StandardTokenType: Other=0, Comment=1, String=2, RegEx=4.
      return standardTokenType === 1 || standardTokenType === 2 || standardTokenType === 4
        ? 'suppress'
        : 'allow';
    } catch {
      // If Monaco changes this internal facade, skip only the redundant manual trigger;
      // its normal completion provider and configured quick suggestions remain intact.
      return 'pending';
    }
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
    const runtimeWasReady = !!this.omnisharp;
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
      runtimeReady &&
      !runtimeWasReady &&
      this.omnisharp &&
      requestSerial === this.diagnosticRequestSerial &&
      !model.isDisposed() &&
      model.getVersionId() === initialModelVersion
    ) {
      // Runtime initialization and project pre-sync already perform the expensive startup
      // work. Establish a fresh authoring-idle interval before the first diagnostic compile
      // so typing immediately after readiness cannot queue behind it.
      this.requestDiagnostics(model);
      return;
    }
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

    // Diagnostics are important, but they are never allowed to overtake completion on
    // the single WASM worker. Wait until the latest completion transaction is drained,
    // then revalidate everything before posting. If another completion is appended while
    // waiting, follow the new tail as well; continuous typing naturally supersedes this
    // diagnostic through diagnosticRequestSerial.
    for (;;) {
      const completionTail = this.completionDispatchTail;
      await completionTail;
      if (
        requestSerial !== this.diagnosticRequestSerial ||
        model.isDisposed() ||
        model.getVersionId() !== initialModelVersion
      ) {
        return;
      }
      if (completionTail === this.completionDispatchTail) break;
    }

    const modelSnapshot = this.getModelTextSnapshot(model);
    const projectRequest = this.createSerializedDiagnosticProjectRequest(model);
    const assertCurrentDiagnosticProject = () => {
      const currentProjectRequest = this.createSerializedDiagnosticProjectRequest(model);
      if (currentProjectRequest.revision !== projectRequest.revision) {
        throw new CSharpObsoleteSemanticResponseError(
          'C# diagnostics project snapshot was superseded.'
        );
      }
    };
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
      const diagnostics = await this.enqueueWorkspaceTransaction('diagnostic', async () => {
        assertCurrentDiagnosticProject();
        const response = this.requireOmniSharpResponse(
          'GetDiagnosticsAsync',
          await this.omnisharp!(
            'GetDiagnosticsAsync',
            modelSnapshot.code,
            this.projectSnapshotPayload('diagnostic', projectRequest),
          ),
        );
        assertCurrentDiagnosticProject();
        this.observeOmniSharpResponseMetadataVersion(response);
        this.markProjectSnapshotApplied('diagnostic', projectRequest);
        // GetDiagnosticsAsync predates the versioned text acknowledgement protocol.
        // The project snapshot is known, but force the next semantic transaction to
        // obtain an exact primary-text version before it trusts the diagnostic workspace.
        this.diagnosticTextState = null;
        return response;
      });
      assertCurrentDiagnosticProject();
      if (
        diagnostics &&
        typeof diagnostics === 'object' &&
        !Array.isArray(diagnostics) &&
        (diagnostics as { cancelled?: unknown }).cancelled === true
      ) {
        this.recordDebugEvent({
          feature: 'diagnostics',
          phase: 'preempted',
          level: 'info',
          message: 'Background diagnostics yielded to accepted interactive authoring work.',
          durationMs: Math.round((this.now() - started) * 10) / 10,
          environment: this.createDebugEnvironmentSnapshot(model),
        });
        return;
      }
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
      if (error instanceof CSharpObsoleteSemanticResponseError) {
        this.recordDebugEvent({
          feature: 'diagnostics',
          phase: 'discard-stale-project',
          level: 'warning',
          message: error.reason,
          durationMs: Math.round((this.now() - started) * 10) / 10,
          environment: this.createDebugEnvironmentSnapshot(model),
        });
        if (
          requestSerial === this.diagnosticRequestSerial &&
          !model.isDisposed() &&
          model.getVersionId() === initialModelVersion
        ) {
          this.requestDiagnostics(model);
        }
        return;
      }
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
      projectRevision: projectRequest.revision,
      projectFileKey: projectRequest.fileKey,
      environmentVersion: this.completionEnvironmentVersion,
      suggestions: entry.suggestions,
      lspItems: entry.lspItems,
    };
  }

  private schedulePredictiveCompletionRefresh(model: monaco.editor.ITextModel) {
    if (this.predictiveCompletionRefreshTimer) {
      clearTimeout(this.predictiveCompletionRefreshTimer);
    }
    const expectedVersion = model.getVersionId();
    this.predictiveCompletionRefreshTimer = setTimeout(() => {
      this.predictiveCompletionRefreshTimer = null;
      if (
        this.model !== model ||
        this.editor?.getModel() !== model ||
        model.isDisposed() ||
        model.getLanguageId() !== 'csharp' ||
        model.getVersionId() !== expectedVersion
      ) {
        return;
      }

      const plan = this.createPredictiveCompletionPlan(model);
      const activePlan = this.predictiveCompletionPlan;
      const retainsActivePrediction = !!(
        plan &&
        activePlan?.key === plan.key &&
        activePlan.code === plan.code
      );
      if (activePlan && !retainsActivePrediction) {
        this.cancelPendingSpeculativeRuntime();
      }
      this.refreshPredictiveCompletion(model, plan);

      // Cursor movement is delivered before this deferred reconciliation has removed
      // an obsolete predictive plan. In that ordering the cursor listener deliberately
      // declines to start a second speculative request, so give the exact idle-context
      // prewarm another chance after predictive state reflects the post-edit caret.
      const editor = this.editor;
      if (editor?.getModel() === model) {
        this.scheduleCursorCompletionPrewarm(editor, model);
      }
    }, 0);
  }

  private refreshPredictiveCompletion(
    model: monaco.editor.ITextModel,
    plan: CSharpPredictiveCompletionPlan | null = this.createPredictiveCompletionPlan(model),
  ) {
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

    if (
      this.predictiveCompletionPlan?.key === plan.key &&
      this.predictiveCompletionPlan.code === plan.code
    ) {
      this.noteEquivalentPredictiveCompletionPlan(plan, 'active-plan');
      return;
    }
    const cachedPlan = this.predictiveCompletionCache.get(plan.key);
    if (cachedPlan?.code === plan.code) {
      this.noteEquivalentPredictiveCompletionPlan(plan, 'cached-preload', cachedPlan);
      return;
    }
    if (cachedPlan) this.predictiveCompletionCache.delete(plan.key);

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
      void this.startPredictiveCompletion(plan, serial);
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
    if (projectRequest.revision !== source.projectRevision) return null;
    const snapshot = this.getModelTextSnapshot(model);
    const currentOffset = model.getOffsetAt(position);
    const existingMemberAccessPlan = this.createPredictiveCompletionPlanForExistingMemberAccess(
      model,
      source,
      projectRequest,
      position,
      snapshot,
      currentOffset
    );
    if (existingMemberAccessPlan) return existingMemberAccessPlan;

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
    if (endOffset !== currentOffset || startOffset > endOffset) return null;

    if (snapshot.code.charAt(endOffset) === '.') return null;

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
      completionListKey: `speculative:${this.runtimeSessionSerial}:${Math.random().toString(36).slice(2)}`,
      code,
      codeHash,
      offset,
      request,
      projectRequest,
      candidate,
      prefix,
    };
  }

  private createPredictiveCompletionPlanForExistingMemberAccess(
    model: monaco.editor.ITextModel,
    source: CSharpPredictiveCompletionSource,
    projectRequest: CSharpSerializedProjectRequest,
    position: monaco.Position,
    snapshot: CSharpModelTextSnapshot,
    currentOffset: number
  ): CSharpPredictiveCompletionPlan | null {
    if (currentOffset <= 0 || snapshot.code.charAt(currentOffset - 1) !== '.') return null;

    const line = model.getLineContent(position.lineNumber);
    const dotIndex = Math.max(0, Math.min(line.length - 1, position.column - 2));
    if (line.charAt(dotIndex) !== '.') return null;

    let startIndex = dotIndex;
    while (startIndex > 0) {
      const previous = retreatCodePoint(line, startIndex);
      if (previous < 0 || !isIdentifierPart(line, previous)) break;
      startIndex = previous;
    }

    if (startIndex > 0 && line[startIndex - 1] === '@') {
      startIndex -= 1;
    }

    const prefix = line.slice(startIndex, dotIndex);
    if (!isValidCSharpCompletionFilterPrefix(prefix)) return null;

    const candidate = this.selectPredictiveCompletionCandidate(source, prefix);
    if (!candidate) return null;
    const normalizedPrefix = prefix.startsWith('@') ? prefix.slice(1) : prefix;
    const normalizedCandidate = candidate.startsWith('@') ? candidate.slice(1) : candidate;
    if (normalizedCandidate !== normalizedPrefix) return null;

    const request = {
      Line: Math.max(0, position.lineNumber - 1),
      Column: Math.max(0, position.column - 1),
      CompletionTrigger: 1,
    };
    const codeHash = snapshot.hash;
    const key = csharpPredictiveCompletionCacheKey(
      model.uri.toString(),
      codeHash,
      currentOffset,
      request,
      projectRequest,
      this.completionEnvironmentVersion,
      '.',
    );

    return {
      key,
      completionListKey: `speculative:${this.runtimeSessionSerial}:${Math.random().toString(36).slice(2)}`,
      code: snapshot.code,
      codeHash,
      offset: currentOffset,
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
    if (!normalizedPrefix) return null;

    let exactMatch: string | null = null;
    for (const suggestion of source.suggestions) {
      if (!this.isPredictiveCompletionCandidateKind(suggestion.kind)) continue;
      const candidate = this.predictiveCompletionCandidateText(suggestion);
      if (!candidate) continue;
      const normalizedCandidate = candidate.startsWith('@') ? candidate.slice(1) : candidate;
      if (normalizedCandidate !== normalizedPrefix) continue;
      if (suggestion.preselect) return candidate;
      if (!exactMatch) exactMatch = candidate;
    }
    // Never speculate `CannotUnloadAppDomainException.` merely because the user typed C.
    // On a single-threaded WASM worker an ambiguous guess can monopolize Roslyn before
    // the next real keystroke is received. Exact completed identifiers retain all of the
    // useful `Console.`/local-variable prediction without that latency inversion.
    return exactMatch;
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

  private startPredictiveCompletion(
    plan: CSharpPredictiveCompletionPlan,
    serial: number,
  ): Promise<void> {
    const existing = this.predictiveCompletionRun;
    if (
      existing &&
      existing.key === plan.key &&
      existing.code === plan.code &&
      existing.serial === serial
    ) {
      return existing.promise;
    }

    const promise = this.runPredictiveCompletion(plan, serial).finally(() => {
      if (this.predictiveCompletionRun?.promise === promise) {
        this.predictiveCompletionRun = null;
      }
    });
    this.predictiveCompletionRun = {
      key: plan.key,
      code: plan.code,
      serial,
      promise,
    };
    return promise;
  }

  private async finishMatchingPredictiveCompletion(
    predictiveKey: string,
    code: string,
  ): Promise<boolean> {
    const plan = this.predictiveCompletionPlan;
    if (!plan || plan.key !== predictiveKey || plan.code !== code) return false;

    const serial = this.predictiveCompletionSerial;
    if (this.predictiveCompletionTimer) {
      clearTimeout(this.predictiveCompletionTimer);
      this.predictiveCompletionTimer = null;
    }
    try {
      await this.startPredictiveCompletion(plan, serial);
    } catch (error) {
      // Prediction is strictly an accelerator. Any bookkeeping/runtime failure here must
      // preserve the normal exact completion path below.
      this.recordDebugEvent({
        feature: 'completion.predictive',
        phase: 'handoff-error',
        level: 'warning',
        message: 'Could not hand the matching speculative completion to the interactive request.',
        error: summarizePrimitive(error),
      });
      return false;
    }
    return this.predictiveCompletionCache.get(predictiveKey)?.code === code;
  }

  private async runPredictiveCompletion(plan: CSharpPredictiveCompletionPlan, serial: number) {
    const existingCachedPlan = this.predictiveCompletionCache.get(plan.key);
    if (
      serial !== this.predictiveCompletionSerial ||
      existingCachedPlan?.code === plan.code
    ) return;
    if (existingCachedPlan) this.predictiveCompletionCache.delete(plan.key);
    if (!this.omnisharp || !this.editor || !this.model || this.model.isDisposed()) return;
    const model = this.model;

    await this.completionDispatchTail;
    const currentPlan = this.model && !this.model.isDisposed()
      ? this.createPredictiveCompletionPlan(this.model)
      : null;
    if (
      serial !== this.predictiveCompletionSerial ||
      this.predictiveCompletionPlan?.key !== plan.key ||
      this.predictiveCompletionPlan.code !== plan.code ||
      this.predictiveCompletionCache.get(plan.key)?.code === plan.code ||
      currentPlan?.key !== plan.key ||
      currentPlan.code !== plan.code
    ) {
      if (this.predictiveCompletionPlan?.key === plan.key) {
        this.predictiveCompletionPlan = null;
      }
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
      const response = await this.enqueueWorkspaceTransaction('speculative', async () => {
        if (
          serial !== this.predictiveCompletionSerial ||
          this.predictiveCompletionPlan?.key !== plan.key
        ) {
          return null;
        }
        this.pendingSpeculativeCompletionListPublicationKeys.add(plan.completionListKey);
        return this.requestSynchronizedCompletion(
          'speculative',
          model,
          plan.code,
          plan.request,
          plan.projectRequest,
          plan.completionListKey,
        );
      });
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
          code: plan.code,
          codeHash: plan.codeHash,
          offset: plan.offset,
          candidate: plan.candidate,
          prefix: plan.prefix,
          assumedText: `${plan.candidate}.`,
          projectCurrentPath: plan.projectRequest.currentPath,
          projectRevision: plan.projectRequest.revision,
          projectFileKey: plan.projectRequest.fileKey,
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
      const completionPreloadStatus: CSharpCompletionPreloadStatus = shouldCache
        ? 'cached'
        : itemCount > 0
          ? 'stale'
          : 'empty';
      this.recordDebugEvent({
        feature: 'completion.predictive',
        phase: 'provider-end',
        callId,
        level: shouldCache ? 'success' : 'warning',
        message: completionPreloadStatus === 'cached'
          ? 'C# predictive completion preload cached.'
          : completionPreloadStatus === 'stale'
            ? 'C# predictive completion preload became stale before caching.'
            : 'C# predictive completion returned no items.',
        durationMs: Math.round((this.now() - startedAt) * 10) / 10,
        response: {
          itemCount,
          cached: shouldCache,
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
    } finally {
      this.pendingSpeculativeCompletionListPublicationKeys.delete(plan.completionListKey);
    }
  }

  private completionEntryFromResponse(
    model: monaco.editor.ITextModel,
    response: unknown,
    defaultRange: monaco.IRange,
    snapshot: CSharpCompletionRequestSnapshot,
    lateContext: CSharpLateCompletionContext | null,
    completionList?: { key: string; speculative: boolean }
  ): CSharpCompletionCacheEntry {
    const suggestions: monaco.languages.CompletionItem[] = [];
    const lspItems: any[] = [];

    for (const rawItem of csharpCompletionItemsFromResponse(response)) {
      const suggestion = this.convertCompletion(model, rawItem, defaultRange, snapshot, lateContext);
      if (!csharpCompletionItemIsUsable(suggestion)) continue;
      if (completionList && rawItem && typeof rawItem === 'object') {
        this.completionResolveListKeys.set(rawItem, completionList);
      }
      suggestions.push(suggestion);
      lspItems.push(rawItem);
    }

    return {
      suggestions,
      lspItems,
      incomplete: csharpCompletionResponseIsIncomplete(response),
      completionSnapshot: snapshot,
      lateContext,
      renderedFilterRange: defaultRange,
      presentationFilterRange: undefined,
      preselectedCompletionIndices: undefined,
      sessionReusable: suggestions.every(suggestion =>
        csharpCompletionRangeContainsSnapshotOffset(suggestion.range, snapshot)),
      completionList,
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
      snapshot.hash,
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
    context: monaco.languages.CompletionContext,
    cancellationToken?: monaco.CancellationToken
  ): Promise<monaco.languages.CompletionList> {
    if (cancellationToken?.isCancellationRequested || model.isDisposed()) {
      return this.cancelledCompletionList();
    }
    const snapshot = this.createCompletionSnapshot(model, position);
    snapshot.structuralVersion = this.completionStructuralVersion;

    const request = csharpOmniSharpCompletionRequest(model, position, context);
    const projectRequest = this.createSerializedDiagnosticProjectRequest(model);
    const requestEnvironmentVersion = this.completionEnvironmentVersion;
    const cacheKey = csharpContextualCompletionCacheKey(
      model,
      snapshot,
      position,
      context,
      request,
      projectRequest,
      requestEnvironmentVersion,
    );
    const predictiveKey = this.predictiveCompletionKeyForCurrentRequest(model, snapshot, position, request, projectRequest);
    const sessionKey = this.completionSessionCacheKey(model, snapshot, position, projectRequest, request);

    const cached = this.completionCache.get(cacheKey);
    if (cached) {
      this.cacheCompletionResult(cacheKey, cached);
      this.setPredictiveCompletionLastLookup(this.buildPredictiveCompletionLookupSnapshot(
        model,
        snapshot,
        position,
        context,
        request,
        projectRequest,
        predictiveKey,
        cacheKey,
        'normal-cache-hit',
        {
          matchedItemCount: cached.suggestions.length,
          reason: 'Normal completion result cache matched this exact request before predictive preload replay was needed.',
        },
      ));
      this.cacheCompletionSessionResult(sessionKey, cached);
      this.rememberPredictiveCompletionSource(model, projectRequest, cached);
      this.refreshPredictiveCompletion(model);
      return this.toCompletionList(cached);
    }

    const cachedSession = this.completionSessionCache.get(sessionKey);
    if (cachedSession) {
      const sessionEntry = await this.completionEntryFromSession(model, cachedSession, cancellationToken);
      if (
        cancellationToken?.isCancellationRequested ||
        model.isDisposed() ||
        model.getVersionId() !== snapshot.modelVersionId ||
        !this.isEditorAtPosition(model, position)
      ) {
        // Keep the reusable entry for the request that superseded this one. Cancellation
        // or another keystroke does not prove that the underlying Roslyn list is invalid.
        return this.cancelledCompletionList();
      }
      if (sessionEntry) {
        this.completionSessionCache.delete(sessionKey);
        this.completionSessionCache.set(sessionKey, sessionEntry);
        this.cacheCompletionResult(cacheKey, sessionEntry);
        this.setPredictiveCompletionLastLookup(this.buildPredictiveCompletionLookupSnapshot(
          model,
          snapshot,
          position,
          context,
          request,
          projectRequest,
          predictiveKey,
          cacheKey,
          'session-cache-hit',
          {
            matchedItemCount: sessionEntry.suggestions.length,
            reason: 'A complete Roslyn list from the same semantic editing session was rebased to the extended identifier prefix.',
          },
        ));
        this.rememberPredictiveCompletionSource(model, projectRequest, sessionEntry);
        this.refreshPredictiveCompletion(model);
        return this.toCompletionList(sessionEntry);
      }
      this.completionSessionCache.delete(sessionKey);
    }
    if (cancellationToken?.isCancellationRequested || model.isDisposed()) {
      return this.cancelledCompletionList();
    }

    // If the user reached the exact future source while its speculative Roslyn request is
    // still running, finish and consume that request instead of cancelling it and paying
    // the same cold member-completion/JIT cost again on the normal lane.
    await this.finishMatchingPredictiveCompletion(predictiveKey, snapshot.code);
    if (
      cancellationToken?.isCancellationRequested ||
      model.isDisposed() ||
      model.getVersionId() !== snapshot.modelVersionId ||
      !this.isEditorAtPosition(model, position)
    ) {
      return this.cancelledCompletionList();
    }

    const keyedPredictive = this.predictiveCompletionCache.get(predictiveKey);
    const predictive = keyedPredictive?.code === snapshot.code ? keyedPredictive : undefined;
    if (keyedPredictive && !predictive) {
      // The fast hash is only an index accelerator. Exact source equality is mandatory
      // before replay so a 32-bit collision can never cross semantic contexts.
      this.predictiveCompletionCache.delete(predictiveKey);
    }
    let preloadFallbackReason = 'No predictive preload cache entry matched this completion request.';
    if (predictive) {
      this.cachePredictiveCompletionResult(predictiveKey, predictive);
      const entry = this.completionEntryFromResponse(
        model,
        predictive.response,
        this.getCompletionFilterRangeAtPosition(model, position),
        snapshot,
        null,
        { key: predictive.completionListKey, speculative: true },
      );
      if (entry.suggestions.length) {
        const ageMs = Date.now() - predictive.createdAt;
        this.cacheCompletionResult(cacheKey, entry);
        this.cacheCompletionSessionResult(sessionKey, entry);
        this.completionWorkerStateKey = cacheKey;
        this.rememberPredictiveCompletionSource(model, projectRequest, entry);
        this.refreshPredictiveCompletion(model);
        this.markPredictiveCompletionServed(predictiveKey, entry.suggestions.length, ageMs, cacheKey);
        this.setPredictiveCompletionLastLookup(this.buildPredictiveCompletionLookupSnapshot(
          model,
          snapshot,
          position,
          context,
          request,
          projectRequest,
          predictiveKey,
          cacheKey,
          'predictive-hit',
          {
            matchedItemCount: entry.suggestions.length,
            cacheAgeMs: ageMs,
            cachedEntry: predictive,
          },
        ));
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
      preloadFallbackReason = 'Predictive preload key matched, but converting the cached response produced no usable completion items.';
      this.setPredictiveCompletionLastLookup(this.buildPredictiveCompletionLookupSnapshot(
        model,
        snapshot,
        position,
        context,
        request,
        projectRequest,
        predictiveKey,
        cacheKey,
        'predictive-empty',
        {
          cachedEntry: predictive,
          reason: preloadFallbackReason,
        },
      ), 'warning');
      this.predictiveCompletionCache.delete(predictiveKey);
    } else {
      this.setPredictiveCompletionLastLookup(this.buildPredictiveCompletionLookupSnapshot(
        model,
        snapshot,
        position,
        context,
        request,
        projectRequest,
        predictiveKey,
        cacheKey,
        'predictive-miss',
        {
          reason: preloadFallbackReason,
        },
      ), 'warning');
    }

    const runtimeReady = await this.ensureLocalOmniSharpRuntime();
    if (cancellationToken?.isCancellationRequested || model.isDisposed()) {
      return this.cancelledCompletionList();
    }
    if (!runtimeReady || !this.omnisharp) {
      this.setPredictiveCompletionLastLookup(this.buildPredictiveCompletionLookupSnapshot(
        model,
        snapshot,
        position,
        context,
        request,
        projectRequest,
        predictiveKey,
        cacheKey,
        'runtime-unavailable',
        {
          reason: `${preloadFallbackReason} OmniSharp runtime was unavailable, so no normal fallback could run.`,
        },
      ), 'error');
      return this.emptyCompletionList();
    }
    this.setPredictiveCompletionLastLookup(this.buildPredictiveCompletionLookupSnapshot(
      model,
      snapshot,
      position,
      context,
      request,
      projectRequest,
      predictiveKey,
      cacheKey,
      'runtime-fallback',
      {
        reason: `${preloadFallbackReason} Calling OmniSharp normally for this request.`,
      },
    ), 'warning');

    const inflight = csharpCompletionInflightFor(this);
    const existingInflight = inflight.get(cacheKey);
    // A request for the same editor state can be joined only while it is still the newest
    // request. If the user typed elsewhere and then returned to this state, the older
    // producer has already been superseded and a fresh request must own a new serial.
    const reusableInflight = existingInflight?.requestSerial === this.completionRequestSerial
      ? existingInflight
      : undefined;
    if (existingInflight && !reusableInflight) {
      inflight.delete(cacheKey);
    }
    let entryPromise = reusableInflight?.promise;
    // Exact duplicate providers share both the runtime call and its serial. Advancing the
    // global serial here would make the shared producer stale and empty for every caller.
    const requestSerial = reusableInflight
      ? reusableInflight.requestSerial
      : ++this.completionRequestSerial;
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

    let ownedCompletionListKey: string | null = null;
    if (!entryPromise) {
      const completionListKey = `normal:${this.runtimeSessionSerial}:${requestSerial}`;
      ownedCompletionListKey = completionListKey;
      let producedPromise: Promise<CSharpCompletionCacheEntry | null>;
      producedPromise = (async (): Promise<CSharpCompletionCacheEntry | null> => {
        const response = await this.enqueueCompletionRuntimeCall(
          model,
          snapshot,
          request,
          projectRequest,
          requestSerial,
          callId,
          completionListKey,
        );
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
        return this.completionEntryFromResponse(
          model,
          response,
          defaultRange,
          snapshot,
          lateContext,
          { key: completionListKey, speculative: false },
        );
      })().finally(() => {
        if (inflight.get(cacheKey)?.promise === producedPromise) {
          inflight.delete(cacheKey);
        }
      });

      entryPromise = producedPromise;
      inflight.set(cacheKey, { requestSerial, promise: producedPromise });
    }

    try {
      const entry = await entryPromise;
      if (cancellationToken?.isCancellationRequested) {
        this.recordDebugEvent({
          feature: 'completion',
          phase: 'provider-cancelled',
          level: 'info',
          callId,
          durationMs: Math.round((this.now() - startedAt) * 10) / 10,
          message: 'C# completion provider discarded a result after Monaco cancelled the request.',
        });
        return this.cancelledCompletionList();
      }
      if (!entry || model.isDisposed()) {
        this.recordDebugEvent({
          feature: 'completion',
          phase: 'provider-end',
          level: 'warning',
          callId,
          durationMs: Math.round((this.now() - startedAt) * 10) / 10,
          message: 'C# completion provider returned no usable result because the request became stale.',
          response: {
            itemCount: 0,
            stale: true,
            modelDisposed: model.isDisposed(),
            completionTrigger: request.CompletionTrigger,
            triggerCharacter: request.TriggerCharacter,
          },
        });
        return this.emptyCompletionList();
      }

      const resultCacheKey = requestEnvironmentVersion === this.completionEnvironmentVersion
        ? cacheKey
        : csharpContextualCompletionCacheKey(
            model,
            snapshot,
            position,
            context,
            request,
            projectRequest,
            this.completionEnvironmentVersion,
          );
      const resultSessionKey = requestEnvironmentVersion === this.completionEnvironmentVersion
        ? sessionKey
        : this.completionSessionCacheKey(model, snapshot, position, projectRequest, request);
      this.cacheCompletionResult(resultCacheKey, entry);
      this.cacheCompletionSessionResult(resultSessionKey, entry);
      this.completionWorkerStateKey = resultCacheKey;
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
    } finally {
      if (ownedCompletionListKey) {
        this.pendingCompletionListPublicationKeys.delete(ownedCompletionListKey);
      }
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
      const metadataInvalidationSerial = this.metadataInvalidationSerial;
      const response = await this.getCompletionResolveResponse(lspItem);
      this.observeOmniSharpResponseMetadataVersion(response);
      if (metadataInvalidationSerial !== this.metadataInvalidationSerial) {
        return item;
      }
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
    const completionList = lspItem && typeof lspItem === 'object'
      ? this.completionResolveListKeys.get(lspItem)
      : undefined;
    if (!lspItem || typeof lspItem !== 'object') {
      return this.omnisharp('GetCompletionResolveAsync', { Item: lspItem });
    }

    const cached = this.completionResolveResponseCache.get(lspItem);
    if (cached) return cached;

    const request = (
      completionList?.speculative
        ? this.omnisharp('GetSpeculativeCompletionResolveAsync', { Item: lspItem }, completionList.key)
        : this.omnisharp('GetCompletionResolveAsync', { Item: lspItem }, completionList?.key ?? '')
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
      const res = await this.enqueueProjectModelCall(
        'completion',
        'GetSignatureHelpAsync',
        model,
        snapshot,
        projectRequest => [req, projectRequest.revision, projectRequest.currentPath],
        req,
      );
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
    } catch (error) {
      rethrowObsoleteCSharpSemanticResponse(error);
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
        const positionRequest = this.positionRequest(position);
        const response = await this.enqueueProjectModelCall(
          'diagnostic',
          'GetQuickInfoAsync',
          model,
          snapshot,
          projectRequest => [positionRequest, projectRequest.revision, projectRequest.currentPath],
          positionRequest
        );
        if (cancellationToken?.isCancellationRequested || model.isDisposed() || model.getVersionId() !== initialModelVersion) {
          return undefined;
        }
        const hover = this.convertOmniSharpHover(response);
        if (hover) return hover;
      } catch (error) {
        rethrowObsoleteCSharpSemanticResponse(error);
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
        const response = await this.enqueueProjectModelCall(
          'diagnostic',
          'GetSemanticTokensAsync',
          model,
          snapshot,
          projectRequest => [projectRequest.revision, projectRequest.currentPath],
        );
        if (!cancellationToken.isCancellationRequested && Array.isArray(response)) {
          return { data: this.encodeOmniSharpSemanticTokens(response as OmniSharpSemanticTokenDto[]) };
        }
      } catch (error) {
        if (error instanceof CSharpObsoleteSemanticResponseError) {
          // Model edits routinely supersede Monaco's automatic semantic-token request.
          // This is cancellation, not a provider failure; returning null keeps the old
          // token result until Monaco asks again and avoids a noisy rejected Promise.
          return null;
        }
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
        const positionRequest = this.positionRequest(position);
        const response = await this.enqueueProjectModelCall(
          'diagnostic',
          'GetDefinitionAsync',
          model,
          snapshot,
          projectRequest => [positionRequest, projectRequest.revision, projectRequest.currentPath],
          positionRequest
        );
        const locations = this.convertLocations(model, response);
        if (locations.length) return locations;
      } catch (error) {
        rethrowObsoleteCSharpSemanticResponse(error);
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
        const response = await this.enqueueProjectModelCall(
          'diagnostic',
          'GetReferencesAsync',
          model,
          snapshot,
          projectRequest => [positionRequest, includeDeclaration, projectRequest.revision, projectRequest.currentPath],
          positionRequest,
          includeDeclaration
        );
        omnisharpLocations = this.convertLocations(model, response);
      } catch (error) {
        rethrowObsoleteCSharpSemanticResponse(error);
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
        const response = await this.enqueueProjectModelCall(
          'diagnostic',
          'GetDocumentSymbolsAsync',
          model,
          snapshot,
          projectRequest => [projectRequest.revision, projectRequest.currentPath],
        );
        const symbols = this.convertDocumentSymbols(response);
        if (symbols.length) return symbols;
      } catch (error) {
        rethrowObsoleteCSharpSemanticResponse(error);
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
        const response = await this.enqueueProjectModelCall(
          'diagnostic',
          'GetRenameInfoAsync',
          model,
          snapshot,
          projectRequest => [positionRequest, projectRequest.revision, projectRequest.currentPath],
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
      } catch (error) {
        rethrowObsoleteCSharpSemanticResponse(error);
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
        const response = await this.enqueueProjectModelCall(
          'diagnostic',
          'GetRenameEditsAsync',
          model,
          snapshot,
          projectRequest => [positionRequest, newName, projectRequest.revision, projectRequest.currentPath],
          positionRequest,
          newName
        ) as OmniSharpRenameEditsDto | false;
        if (response && Array.isArray(response.edits)) {
          omnisharpEdits = response.edits.flatMap(edit => this.convertWorkspaceEdit(model, edit));
          omnisharpRejectReason = response.rejectReason ?? undefined;
        }
      } catch (error) {
        rethrowObsoleteCSharpSemanticResponse(error);
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
    let omnisharpError: unknown = null;

    if (this.omnisharp) {
      try {
        const snapshot = this.getModelTextSnapshot(model);
        const rangeRequest = this.rangeRequest(range);
        const response = await this.enqueueProjectModelCall(
          'diagnostic',
          'GetCodeActionsAsync',
          model,
          snapshot,
          projectRequest => [rangeRequest, projectRequest.revision, projectRequest.currentPath],
          rangeRequest
        );
        actions.push(...this.convertCodeActions(model, response, context.markers));
      } catch (error) {
        rethrowObsoleteCSharpSemanticResponse(error);
        omnisharpError = error;
        this.recordDebugEvent({
          feature: 'codeActions',
          phase: 'runtime-error',
          level: 'error',
          message: 'C# OmniSharp code actions failed.',
          model: this.summarizeModel(model),
          error: this.summarizeError(error),
          environment: this.createDebugEnvironmentSnapshot(model),
        });
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

    if (!actions.length && omnisharpError) {
      throw omnisharpError;
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
        const response = await this.enqueueProjectModelCall(
          'diagnostic',
          'GetFoldingRangesAsync',
          model,
          snapshot,
          projectRequest => [projectRequest.revision, projectRequest.currentPath],
        );
        const ranges = this.convertFoldingRanges(response);
        if (ranges.length) return ranges;
      } catch (error) {
        rethrowObsoleteCSharpSemanticResponse(error);
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
        const formatted = await this.enqueueProjectModelCall(
          'diagnostic',
          'GetFormattingAsync',
          model,
          snapshot,
          projectRequest => [projectRequest.revision, projectRequest.currentPath],
        );
        if (typeof formatted === 'string' && formatted !== snapshot.code) {
          return [{ range: model.getFullModelRange(), text: formatted }];
        }
        if (typeof formatted === 'string') return [];
      } catch (error) {
        rethrowObsoleteCSharpSemanticResponse(error);
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
        const formatted = await this.enqueueProjectModelCall(
          'diagnostic',
          'GetRangeFormattingAsync',
          model,
          snapshot,
          projectRequest => [rangeRequest, projectRequest.revision, projectRequest.currentPath],
          rangeRequest
        );
        if (typeof formatted === 'string' && formatted !== snapshot.code) {
          return [{ range: model.getFullModelRange(), text: formatted }];
        }
        if (typeof formatted === 'string') return [];
      } catch (error) {
        rethrowObsoleteCSharpSemanticResponse(error);
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
        const response = await this.enqueueProjectModelCall(
          'diagnostic',
          'GetInlayHintsAsync',
          model,
          snapshot,
          projectRequest => [rangeRequest, projectRequest.revision, projectRequest.currentPath],
          rangeRequest
        );
        const hints = this.convertInlayHints(response);
        if (hints.length) return { hints, dispose() {} };
      } catch (error) {
        rethrowObsoleteCSharpSemanticResponse(error);
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

  private projectSnapshotStateKey(projectRequest: CSharpSerializedProjectRequest): string {
    // The opaque revision changes only after an exact file-content comparison. Do not
    // rely solely on the fast 32-bit hashes here: even a theoretical collision must
    // still force a full, atomic project snapshot synchronization.
    return `${projectRequest.revision}\u0000${projectRequest.currentPath}`;
  }

  private projectSnapshotPayload(
    workspace: 'completion' | 'speculative' | 'diagnostic',
    projectRequest: CSharpSerializedProjectRequest
  ): string {
    const stateKey = this.projectSnapshotStateKey(projectRequest);
    const appliedStateKey = workspace === 'completion'
      ? this.completionProjectStateKey
      : workspace === 'speculative'
        ? this.speculativeProjectStateKey
        : this.diagnosticProjectStateKey;
    return appliedStateKey === stateKey ? '' : projectRequest.serialized;
  }

  private markProjectSnapshotApplied(
    workspace: 'completion' | 'speculative' | 'diagnostic',
    projectRequest: CSharpSerializedProjectRequest
  ) {
    const stateKey = this.projectSnapshotStateKey(projectRequest);
    if (workspace === 'completion') {
      this.completionProjectStateKey = stateKey;
    } else if (workspace === 'speculative') {
      this.speculativeProjectStateKey = stateKey;
    } else {
      this.diagnosticProjectStateKey = stateKey;
    }
  }

  private async ensureWorkspaceProjectState(
    workspace: 'completion' | 'diagnostic',
    model: monaco.editor.ITextModel,
    snapshot: CSharpModelTextSnapshot
  ): Promise<CSharpSerializedProjectRequest> {
    if (!this.omnisharp) {
      throw new Error('OmniSharp is unavailable while synchronizing project state.');
    }

    const projectRequest = this.createSerializedDiagnosticProjectRequest(model);
    const payload = this.projectSnapshotPayload(workspace, projectRequest);
    const textState = workspace === 'completion'
      ? this.completionTextState
      : this.diagnosticTextState;
    const textNeedsSync = (
      !textState ||
      textState.runtimeSession !== this.runtimeSessionSerial ||
      textState.projectRevision !== projectRequest.revision ||
      textState.code !== snapshot.code
    );
    if (!payload && !textNeedsSync) return projectRequest;

    const method = workspace === 'completion'
      ? 'SyncCompletionProjectAsync'
      : 'SyncDiagnosticProjectAsync';
    const response = this.requireOmniSharpResponse(
      method,
      await this.omnisharp(method, snapshot.code, payload, projectRequest.revision),
    ) as {
      projectStateKey?: unknown;
      primaryDocumentVersion?: unknown;
      primaryDocumentTextLength?: unknown;
      metadataVersion?: unknown;
    };
    this.observeOmniSharpResponseMetadataVersion(response);
    if (response?.projectStateKey !== projectRequest.revision) {
      throw new Error(`${method} did not acknowledge the requested project state.`);
    }

    if (workspace === 'completion') {
      this.commitCompletionTextSync('completion', snapshot.code, projectRequest, {
        success: true,
        requiresFullSync: false,
        version: response.primaryDocumentVersion,
        textLength: response.primaryDocumentTextLength,
        projectRevision: projectRequest.revision,
      });
    } else {
      const version = response.primaryDocumentVersion;
      const textLength = response.primaryDocumentTextLength;
      if (
        !Number.isSafeInteger(version) ||
        (version as number) < 0 ||
        !Number.isSafeInteger(textLength) ||
        textLength !== snapshot.length
      ) {
        this.diagnosticTextState = null;
        throw new Error(`${method} returned an invalid primary-text acknowledgement.`);
      }
      this.diagnosticTextState = {
        runtimeSession: this.runtimeSessionSerial,
        projectRevision: projectRequest.revision,
        version: version as number,
        length: textLength as number,
        code: snapshot.code,
      };
      this.markProjectSnapshotApplied(workspace, projectRequest);
    }
    return projectRequest;
  }

  private createSerializedDiagnosticProjectRequest(model: monaco.editor.ITextModel): CSharpSerializedProjectRequest {
    const currentPath = currentModelPath(model);
    const providerFiles = this.projectFilesProvider();
    const providerRevision = this.projectFilesRevisionProvider?.();
    const cached = this.projectRequestCache;
    if (
      cached &&
      this.projectFilesRevisionProvider &&
      this.projectRequestSource === providerFiles &&
      Object.is(this.projectRequestSourceRevision, providerRevision) &&
      cached.currentPath === currentPath
    ) {
      return cached;
    }

    const seen = new Set<string>([currentPath]);
    const files: CSharpDiagnosticProjectRequest['Files'] = [];
    let fileKeyHash = 2166136261;
    const mixFileKey = (value: string) => {
      for (let index = 0; index < value.length; index += 1) {
        fileKeyHash ^= value.charCodeAt(index);
        fileKeyHash = Math.imul(fileKeyHash, 16777619);
      }
      fileKeyHash ^= 0;
      fileKeyHash = Math.imul(fileKeyHash, 16777619);
    };

    for (const file of providerFiles) {
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
      mixFileKey(path);
      mixFileKey(String(content.length));
      mixFileKey(hash);
      files.push({ Path: path, Content: content });
    }

    for (const path of this.projectFileHashCache.keys()) {
      if (!seen.has(path)) this.projectFileHashCache.delete(path);
    }

    // This compact value is telemetry/precheck only. The opaque revision below is reused
    // solely after an exact ordered Path/Content comparison, so a hash collision can never
    // become a semantic cache collision.
    const fileKey = `${files.length}:${(fileKeyHash >>> 0).toString(36)}`;
    const cachedFiles = cached?.request.Files ?? [];
    const filesExactlyEqual = cachedFiles.length === files.length && files.every((file, index) => (
      cachedFiles[index]?.Path === file.Path && cachedFiles[index]?.Content === file.Content
    ));
    if (
      cached &&
      cached.currentPath === currentPath &&
      cached.fileKey === fileKey &&
      filesExactlyEqual
    ) {
      this.projectRequestSource = providerFiles;
      this.projectRequestSourceRevision = providerRevision;
      return cached;
    }

    const request = { CurrentPath: currentPath, Files: files };
    const serialized = JSON.stringify(request);
    const snapshot = {
      request,
      serialized,
      fileKey,
      currentPath,
      revision: `p${++this.projectRequestRevisionSerial}`,
    };
    this.projectRequestCache = snapshot;
    this.projectRequestSource = providerFiles;
    this.projectRequestSourceRevision = providerRevision;
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
      projectRequest.revision,
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
