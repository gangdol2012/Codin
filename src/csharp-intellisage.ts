import * as monaco from 'monaco-editor';

const iframeId = `intellisage-${Math.random().toString(36).slice(2)}`;

type IntellisageCall = (method: string, ...args: unknown[]) => Promise<any>;
export type CSharpIntelliSageSource = 'local' | 'server';

const CSHARP_INTELLISAGE_URLS: Record<CSharpIntelliSageSource, string> = {
  local: '/intellisage/',
  server: 'https://intellisage.vercel.app/',
};

function normalizeCSharpIntelliSageSource(source: unknown): CSharpIntelliSageSource {
  return source === 'server' ? 'server' : 'local';
}

export function getCSharpIntelliSageUrl(source: CSharpIntelliSageSource) {
  return CSHARP_INTELLISAGE_URLS[normalizeCSharpIntelliSageSource(source)];
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
}

const CSHARP_COMPLETION_CACHE_LIMIT = 8;
const CSHARP_COMPLETION_TRIGGER_FALLBACK = '.';

interface RoslynPositionDto {
  line: number;
  character: number;
}

interface RoslynRangeDto {
  start: RoslynPositionDto;
  end: RoslynPositionDto;
}

interface RoslynLocationDto {
  path?: string;
  Path?: string;
  range: RoslynRangeDto;
  name?: string;
  kind?: string;
  detail?: string;
}

interface RoslynTextEditDto {
  path?: string;
  Path?: string;
  range: RoslynRangeDto;
  text: string;
  Text?: string;
}

interface RoslynRenameInfoDto {
  canRename?: boolean;
  range?: RoslynRangeDto;
  text?: string;
  rejectReason?: string;
}

interface RoslynRenameEditsDto {
  edits?: RoslynTextEditDto[];
  rejectReason?: string | null;
}

interface RoslynCodeActionDto {
  title: string;
  kind?: string;
  edits?: RoslynTextEditDto[];
  isPreferred?: boolean;
}

interface RoslynDocumentSymbolDto {
  name: string;
  detail?: string;
  kind?: string;
  range: RoslynRangeDto;
  selectionRange: RoslynRangeDto;
  children?: RoslynDocumentSymbolDto[];
}

interface RoslynSemanticTokenDto {
  startLine: number;
  startColumn: number;
  length: number;
  type: CSharpSemanticTokenType;
  modifiers?: CSharpSemanticTokenModifier[];
}

interface RoslynInlayHintDto {
  kind?: string;
  label: string;
  position: RoslynPositionDto;
  paddingLeft?: boolean;
  paddingRight?: boolean;
}

interface RoslynFoldingRangeDto {
  start: number;
  end: number;
  kind?: string;
}

interface CSharpCallInfo {
  name: string;
  activeParameter: number;
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

function hashString(value: string): string {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(36);
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

class CSharpLanguageService {
  private intellisage: IntellisageCall | null = null;
  private lastCompletions = new Map<monaco.languages.CompletionItem, any>();
  private model: monaco.editor.ITextModel | null = null;
  private projectFilesProvider: CSharpProjectFilesProvider = () => [];
  private initialized = false;
  private iframeUrl: string | null = null;
  private providersRegistered = false;
  private initializationPromise: Promise<void> | null = null;
  private completionRequestSerial = 0;
  private diagnosticRequestSerial = 0;
  private completionEnvironmentVersion = 0;
  private completionWorkerStateKey: string | null = null;
  private completionCache = new Map<string, CSharpCompletionCacheEntry>();
  private diagnosticCacheKey: string | null = null;
  private diagnosticCacheMarkers: monaco.editor.IMarkerData[] = [];
  private diagnosticCacheMarkersByUri = new Map<string, monaco.editor.IMarkerData[]>();
  private diagnosticCacheProjectWide = false;
  private providerDisposables: monaco.IDisposable[] = [];
  private semanticCache = new WeakMap<monaco.editor.ITextModel, { versionId: number; index: CSharpSemanticIndex }>();

  private debouncedDiagnostics = debounce(this.getDiagnostics.bind(this), 100);
  private debouncedCompletions = this.rawProvideCompletionItems.bind(this);
  private debouncedResolve = this.rawResolveCompletionItem.bind(this);

  async initialize(iframeUrl = CSHARP_INTELLISAGE_URLS.local) {
    const nextIframeUrl = iframeUrl.trim() || CSHARP_INTELLISAGE_URLS.local;
    if (this.initialized && this.iframeUrl === nextIframeUrl && this.intellisage) return;
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
      this.disposeIntelliSageRuntime();
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
            if (event.data?.intellisageInitialized) {
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
        iframe.title = 'IntelliSage';
        document.body.appendChild(iframe);

        await new Promise<void>((res, rej) => {
          iframe!.onload = () => res();
          iframe!.onerror = () => rej(new Error('IntelliSage iframe failed to load'));
        });

        await initPromise;
      }

      const iframeRef = iframe;
      this.intellisage = (method: string, ...args: unknown[]) => {
        if (!iframeRef.contentWindow) return Promise.resolve(false);
        return new Promise(res => {
          const id = Math.random().toString(36).slice(2) + Math.random().toString(36).slice(2);
          let handled = false;
          const handleMessage = (event: MessageEvent) => {
            if (event.data?.intellisage?.id === id && !handled) {
              handled = true;
              window.removeEventListener('message', handleMessage);
              res(event.data.intellisage.payload);
            }
          };
          setTimeout(() => {
            if (!handled) {
              handled = true;
              window.removeEventListener('message', handleMessage);
              res(false);
            }
          }, 10000);
          window.addEventListener('message', handleMessage);
          iframeRef.contentWindow!.postMessage({ intellisage: { method, args, id } }, '*');
        });
      };

      if (!this.providersRegistered) {
        this.registerProviders();
        this.providersRegistered = true;
      }
    } catch (error) {
      this.disposeIntelliSageRuntime();
      throw error;
    }
  }

  private disposeIntelliSageRuntime() {
    document.getElementById(iframeId)?.remove();
    this.intellisage = null;
    this.initialized = false;
    this.iframeUrl = null;
    this.clearCompletionState();
  }

  private clearCompletionState() {
    this.completionRequestSerial += 1;
    this.completionEnvironmentVersion += 1;
    this.completionWorkerStateKey = null;
    this.lastCompletions.clear();
    this.completionCache.clear();
    this.diagnosticCacheKey = null;
    this.diagnosticCacheMarkers = [];
    this.diagnosticCacheMarkersByUri.clear();
    this.diagnosticCacheProjectWide = false;
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

  private toCompletionList(entry: CSharpCompletionCacheEntry): monaco.languages.CompletionList {
    this.lastCompletions.clear();
    const suggestions = entry.suggestions.map(item => ({
      ...item,
      additionalTextEdits: item.additionalTextEdits?.map(edit => ({ ...edit })),
    }));
    suggestions.forEach((item, index) => {
      const lspItem = entry.lspItems[index];
      if (lspItem) this.lastCompletions.set(item, lspItem);
    });
    return { suggestions, incomplete: entry.incomplete };
  }

  private emptyCompletionList(): monaco.languages.CompletionList {
    this.lastCompletions.clear();
    return { suggestions: [] };
  }

  private completionCacheKey(
    model: monaco.editor.ITextModel,
    position: monaco.Position,
    context: monaco.languages.CompletionContext,
    projectRequest: CSharpDiagnosticProjectRequest
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
      this.createProjectSnapshotKey(projectRequest),
    ].join(':');
  }

  private async ensureLocalIntelliSageRuntime() {
    if (!this.intellisage || this.iframeUrl !== CSHARP_INTELLISAGE_URLS.local) {
      await this.initialize(CSHARP_INTELLISAGE_URLS.local);
    }
    return !!this.intellisage && this.iframeUrl === CSHARP_INTELLISAGE_URLS.local;
  }

  private registerProviders() {
    this.providerDisposables.push(
      monaco.languages.registerCompletionItemProvider('csharp', {
        triggerCharacters: ['.', '(', ',', '<', '[', ' ', '#'],
        resolveCompletionItem: item => this.debouncedResolve(item),
        provideCompletionItems: (model, position, context) => this.debouncedCompletions(model, position, context),
      }),
      monaco.languages.registerSignatureHelpProvider('csharp', {
        signatureHelpTriggerCharacters: ['(', ','],
        signatureHelpRetriggerCharacters: [')'],
        provideSignatureHelp: (model, position) => this.provideSignatureHelp(model, position),
      }),
      monaco.languages.registerHoverProvider('csharp', {
        provideHover: (model, position) => this.provideHover(model, position),
      }),
      monaco.languages.registerDocumentSemanticTokensProvider('csharp', {
        getLegend: () => CSHARP_SEMANTIC_LEGEND,
        provideDocumentSemanticTokens: (model, _lastResultId, cancellationToken) => {
          if (cancellationToken.isCancellationRequested || model.isDisposed()) return null;
          return this.provideDocumentSemanticTokens(model, cancellationToken);
        },
        releaseDocumentSemanticTokens() {},
      }),
      monaco.languages.registerDefinitionProvider('csharp', {
        provideDefinition: (model, position) => this.provideDefinition(model, position),
      }),
      monaco.languages.registerReferenceProvider('csharp', {
        provideReferences: (model, position, context) => this.provideReferences(model, position, context),
      }),
      monaco.languages.registerDocumentHighlightProvider('csharp', {
        provideDocumentHighlights: (model, position) => this.provideDocumentHighlights(model, position),
      }),
      monaco.languages.registerDocumentSymbolProvider('csharp', {
        provideDocumentSymbols: model => this.provideDocumentSymbols(model),
      }),
      monaco.languages.registerRenameProvider('csharp', {
        resolveRenameLocation: (model, position) => this.resolveRenameLocation(model, position),
        provideRenameEdits: (model, position, newName) => this.provideRenameEdits(model, position, newName),
      }),
      monaco.languages.registerCodeActionProvider('csharp', {
        provideCodeActions: (model, range, context) => this.provideCodeActions(model, range, context),
      }, {
        providedCodeActionKinds: [
          'quickfix',
          'refactor',
          'source',
        ],
      }),
      monaco.languages.registerFoldingRangeProvider('csharp', {
        provideFoldingRanges: model => this.provideFoldingRanges(model),
      }),
      monaco.languages.registerDocumentFormattingEditProvider('csharp', {
        provideDocumentFormattingEdits: (model, options) => this.provideDocumentFormattingEdits(model, options),
      }),
      monaco.languages.registerDocumentRangeFormattingEditProvider('csharp', {
        provideDocumentRangeFormattingEdits: (model, range, options) => this.provideDocumentRangeFormattingEdits(model, range, options),
      }),
      monaco.languages.registerOnTypeFormattingEditProvider('csharp', {
        autoFormatTriggerCharacters: [';', '}', '\n'],
        provideOnTypeFormattingEdits: (model, position, ch, options) => this.provideOnTypeFormattingEdits(model, position, ch, options),
      }),
      monaco.languages.registerInlayHintsProvider('csharp', {
        provideInlayHints: (model, range) => this.provideInlayHints(model, range),
      }),
      monaco.languages.registerSelectionRangeProvider('csharp', {
        provideSelectionRanges: (model, positions) => this.provideSelectionRanges(model, positions),
      })
    );
  }

  private editorChangeListener: monaco.IDisposable | null = null;
  private modelChangeListener: monaco.IDisposable | null = null;

  setupEditor(editor: monaco.editor.IStandaloneCodeEditor, projectFilesProvider?: CSharpProjectFilesProvider) {
    if (projectFilesProvider) {
      this.projectFilesProvider = projectFilesProvider;
    }
    this.setupDiagnostics(editor);
  }

  clearEditor() {
    this.diagnosticRequestSerial += 1;
    this.modelChangeListener?.dispose();
    this.modelChangeListener = null;
    this.editorChangeListener?.dispose();
    this.editorChangeListener = null;
    this.model = null;
    this.clearCompletionState();
  }

  refreshProject() {
    this.semanticCache = new WeakMap<monaco.editor.ITextModel, { versionId: number; index: CSharpSemanticIndex }>();
    this.clearCompletionState();
    if (this.model && !this.model.isDisposed() && this.model.getLanguageId() === 'csharp') {
      this.requestDiagnostics(this.model);
    }
  }

  setupDiagnostics(editor: monaco.editor.IStandaloneCodeEditor) {
    this.clearEditor();

    const updateModel = () => {
      this.modelChangeListener?.dispose();
      this.modelChangeListener = null;
      this.model = editor.getModel();

      if (this.model && this.model.getLanguageId() === 'csharp') {
        const model = this.model;
        this.requestDiagnostics(model);
        this.modelChangeListener = model.onDidChangeContent(() => {
          if (!model.isDisposed() && model.getLanguageId() === 'csharp') {
            this.semanticCache.delete(model);
            this.clearCompletionState();
            this.requestDiagnostics(model);
          }
        });
      } else {
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
    if (!this.intellisage) {
      return { success: false, message: 'C# authoring runtime is not ready.' };
    }

    const trimmedNamespace = namespaceName.trim();
    if (!trimmedNamespace) {
      return { success: false, message: 'Namespace is required.' };
    }

    const response = await this.intellisage('IncludeNamespaceAsync', trimmedNamespace) as {
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
    void this.debouncedDiagnostics(model, requestSerial);
  }

  private refreshDiagnosticsNow(model: monaco.editor.ITextModel) {
    const requestSerial = ++this.diagnosticRequestSerial;
    return this.getDiagnostics(model, requestSerial);
  }

  private async getDiagnostics(model: monaco.editor.ITextModel, requestSerial: number) {
    if (model.isDisposed() || model.getLanguageId() !== 'csharp') return;

    const initialModelVersion = model.getVersionId();
    const runtimeReady = await this.ensureLocalIntelliSageRuntime();
    if (
      !runtimeReady ||
      !this.intellisage ||
      requestSerial !== this.diagnosticRequestSerial ||
      model.isDisposed() ||
      model.getVersionId() !== initialModelVersion
    ) {
      return;
    }

    const safeCode = model.getValue();
    const projectRequest = this.createDiagnosticProjectRequest(model);
    const cacheKey = this.createDiagnosticCacheKey(model, safeCode, projectRequest);
    if (this.diagnosticCacheKey === cacheKey) {
      this.applyDiagnosticMarkerMap(model, this.diagnosticCacheMarkersByUri, this.diagnosticCacheProjectWide);
      return;
    }

    try {
      const diagnostics = await this.intellisage('GetDiagnosticsAsync', safeCode, projectRequest);
      if (
        requestSerial !== this.diagnosticRequestSerial ||
        model.isDisposed() ||
        model.getVersionId() !== initialModelVersion
      ) {
        return;
      }

      const { markersByUri, currentMarkers, projectWide } = this.convertDiagnosticResponse(model, diagnostics);
      this.diagnosticCacheKey = cacheKey;
      this.diagnosticCacheMarkers = currentMarkers;
      this.diagnosticCacheMarkersByUri = markersByUri;
      this.diagnosticCacheProjectWide = projectWide;
      this.applyDiagnosticMarkerMap(model, markersByUri, projectWide);
    } catch {
      if (
        requestSerial === this.diagnosticRequestSerial &&
        !model.isDisposed() &&
        model.getVersionId() === initialModelVersion
      ) {
        this.applyDiagnosticMarkerMap(model, new Map([[model.uri.toString(), []]]), this.diagnosticCacheProjectWide);
      }
    }
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
    const initialModelVersion = model.getVersionId();
    const projectRequest = this.createDiagnosticProjectRequest(model);
    const word = model.getWordUntilPosition(position);
    const fallbackRange = new monaco.Range(position.lineNumber, word.startColumn, position.lineNumber, word.endColumn);
    const localSuggestions = this.provideLocalCompletionItems(model, position, fallbackRange);
    const runtimeReady = await this.ensureLocalIntelliSageRuntime();
    if (!runtimeReady || !this.intellisage || model.isDisposed() || model.getVersionId() !== initialModelVersion) {
      return localSuggestions.length
        ? this.toCompletionList({ suggestions: localSuggestions, lspItems: [] })
        : this.emptyCompletionList();
    }

    const requestSerial = ++this.completionRequestSerial;
    const modelVersion = model.getVersionId();
    const cacheKey = this.completionCacheKey(model, position, context, projectRequest);
    const cached = this.completionCache.get(cacheKey);
    if (cached && this.completionWorkerStateKey === cacheKey) return this.toCompletionList(cached);

    const request: any = {
      Line: position.lineNumber - 1,
      Column: position.column - 1,
      CompletionTrigger: (context.triggerKind as number) + 1,
      TriggerCharacter: context.triggerCharacter ?? CSHARP_COMPLETION_TRIGGER_FALLBACK,
    };

    try {
      const response = await this.intellisage('GetCompletionAsync', model.getValue(), request, projectRequest);
      if (requestSerial !== this.completionRequestSerial || model.isDisposed() || model.getVersionId() !== modelVersion) {
        return this.emptyCompletionList();
      }
      if (!response && !localSuggestions.length) return this.emptyCompletionList();

      const items = response ? (response as any).items ?? [] : [];
      const validItems = items.filter((item: any) => (item?.label ?? item?.insertText ?? item?.textEdit?.newText ?? item?.textEdit?.NewText) != null);
      const roslynSuggestions = validItems.map((item: any) => this.convertCompletion(item, fallbackRange));
      const { suggestions, lspItems } = mergeCompletionSuggestions(roslynSuggestions, validItems, localSuggestions);
      const entry = { suggestions, lspItems, incomplete: response ? !!(response as any).isIncomplete : false };
      this.cacheCompletionResult(cacheKey, entry);
      this.completionWorkerStateKey = cacheKey;
      return this.toCompletionList(entry);
    } catch {
      return localSuggestions.length
        ? this.toCompletionList({ suggestions: localSuggestions, lspItems: [] })
        : this.emptyCompletionList();
    }
  }

  private async rawResolveCompletionItem(
    item: monaco.languages.CompletionItem
  ): Promise<monaco.languages.CompletionItem> {
    const lspItem = this.lastCompletions.get(item);
    if (!lspItem || !this.intellisage) return item;
    try {
      const response = await this.intellisage('GetCompletionResolveAsync', { Item: lspItem });
      if (!response) return item;
      const resolved = (response as any).item;
      if (!resolved) return item;
      const fallbackRange = this.toEditorRange((item.range as monaco.languages.CompletionItemRanges | undefined)?.insert ?? item.range);
      return fallbackRange ? this.convertCompletion(resolved, fallbackRange) : item;
    } catch {
      return item;
    }
  }

  private async provideSignatureHelp(
    model: monaco.editor.ITextModel,
    position: monaco.Position
  ): Promise<monaco.languages.SignatureHelpResult | undefined> {
    if (!this.intellisage) return this.provideLocalSignatureHelp(model, position);
    const req = { Line: position.lineNumber - 1, Column: position.column - 1 };
    const projectRequest = this.createDiagnosticProjectRequest(model);
    try {
      const res = await this.intellisage('GetSignatureHelpAsync', model.getValue(), req, projectRequest);
      if (!res) return this.provideLocalSignatureHelp(model, position);
      const result = res as any;
      const signatures = (result.signatures ?? []).map((sig: any) => ({
        label: sig.label,
        documentation: sig.structuredDocumentation?.summaryText ?? '',
        parameters: (sig.parameters ?? []).map((p: any) => ({
          label: p.label,
          documentation: p.documentation ? { value: `**${p.name}**: ${p.documentation}` } : '',
        })),
      }));
      if (!signatures.length) return this.provideLocalSignatureHelp(model, position);
      return {
        value: {
          signatures,
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
    position: monaco.Position
  ): Promise<monaco.languages.Hover | undefined> {
    const req = { Line: position.lineNumber - 1, Column: position.column - 1 };
    const projectRequest = this.createDiagnosticProjectRequest(model);
    if (this.intellisage) {
      try {
        const response = await this.intellisage('GetQuickInfoAsync', model.getValue(), req, projectRequest);
        if (response && (response as any).markdown) {
          return { contents: [{ value: (response as any).markdown }] };
        }
      } catch {
        try {
          const response = await this.intellisage('GetQuickInfoAsync', req);
          if (response && (response as any).markdown) {
            return { contents: [{ value: (response as any).markdown }] };
          }
        } catch {
          // Continue with the in-browser C# language index.
        }
      }
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
    const projectRequest = this.createDiagnosticProjectRequest(model);
    if (this.intellisage) {
      try {
        const response = await this.intellisage('GetSemanticTokensAsync', model.getValue(), projectRequest);
        if (!cancellationToken.isCancellationRequested && Array.isArray(response)) {
          return { data: this.encodeRoslynSemanticTokens(response as RoslynSemanticTokenDto[]) };
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
    const projectRequest = this.createDiagnosticProjectRequest(model);
    if (this.intellisage) {
      try {
        const response = await this.intellisage('GetDefinitionAsync', model.getValue(), this.positionRequest(position), projectRequest);
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
    let roslynLocations: monaco.languages.Location[] = [];
    const projectRequest = this.createDiagnosticProjectRequest(model);
    if (this.intellisage) {
      try {
        const response = await this.intellisage('GetReferencesAsync', model.getValue(), this.positionRequest(position), String(context.includeDeclaration), projectRequest);
        roslynLocations = this.convertLocations(model, response);
      } catch {
        // Fall through to the browser-side semantic index.
      }
    }

    const index = this.getSemanticIndex(model);
    const symbol = index.symbolAt(position);
    if (!symbol) return roslynLocations.length ? roslynLocations : undefined;
    const refs = this.projectReferencesFor(model, symbol, context.includeDeclaration);
    const fallbackRefs = refs.length ? refs : index.referencesFor(symbol, context.includeDeclaration).map(ref => ({ uri: model.uri, range: ref.token.range }));
    return mergeLocations([...roslynLocations, ...fallbackRefs]);
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
    const projectRequest = this.createDiagnosticProjectRequest(model);
    if (this.intellisage) {
      try {
        const response = await this.intellisage('GetDocumentSymbolsAsync', model.getValue(), projectRequest);
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
    const projectRequest = this.createDiagnosticProjectRequest(model);
    if (this.intellisage) {
      try {
        const response = await this.intellisage('GetRenameInfoAsync', model.getValue(), this.positionRequest(position), projectRequest) as RoslynRenameInfoDto | false;
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

    let roslynEdits: monaco.languages.IWorkspaceTextEdit[] = [];
    let roslynRejectReason: string | undefined;
    const projectRequest = this.createDiagnosticProjectRequest(model);
    if (this.intellisage) {
      try {
        const response = await this.intellisage('GetRenameEditsAsync', model.getValue(), this.positionRequest(position), newName, projectRequest) as RoslynRenameEditsDto | false;
        if (response && Array.isArray(response.edits)) {
          roslynEdits = response.edits.flatMap(edit => this.convertWorkspaceEdit(model, edit));
          roslynRejectReason = response.rejectReason ?? undefined;
        }
      } catch {
        // Fall through to the browser-side semantic index.
      }
    }

    const index = this.getSemanticIndex(model);
    const symbol = index.symbolAt(position);
    if (!symbol || !isRenameableSymbol(symbol)) {
      if (roslynEdits.length) {
        return { edits: roslynEdits, rejectReason: roslynRejectReason };
      }
      return { edits: [], rejectReason: 'This C# token cannot be renamed.' };
    }

    const projectRefs = this.projectReferencesFor(model, symbol, true);
    const edits = (projectRefs.length ? projectRefs : index.referencesFor(symbol, true).map(ref => ({ uri: model.uri, range: ref.token.range }))).map(ref => ({
      resource: ref.uri,
      textEdit: { range: ref.range, text: newName },
      versionId: monaco.editor.getModel(ref.uri)?.getVersionId(),
    }));
    return { edits: mergeWorkspaceTextEdits([...roslynEdits, ...edits]), rejectReason: roslynRejectReason };
  }

  private async provideCodeActions(
    model: monaco.editor.ITextModel,
    range: monaco.Range,
    context: monaco.languages.CodeActionContext
  ): Promise<monaco.languages.CodeActionList> {
    const index = this.getSemanticIndex(model);
    const actions: monaco.languages.CodeAction[] = [];
    const lineText = model.getLineContent(range.startLineNumber);
    const projectRequest = this.createDiagnosticProjectRequest(model);

    if (this.intellisage) {
      try {
        const response = await this.intellisage('GetCodeActionsAsync', model.getValue(), this.rangeRequest(range), projectRequest);
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
      const organized = organizeUsings(model.getValue());
      if (organized !== model.getValue()) {
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
    const projectRequest = this.createDiagnosticProjectRequest(model);
    if (this.intellisage) {
      try {
        const response = await this.intellisage('GetFoldingRangesAsync', model.getValue(), projectRequest);
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
    const projectRequest = this.createDiagnosticProjectRequest(model);
    if (this.intellisage) {
      try {
        const formatted = await this.intellisage('GetFormattingAsync', model.getValue(), projectRequest);
        if (typeof formatted === 'string' && formatted !== model.getValue()) {
          return [{ range: model.getFullModelRange(), text: formatted }];
        }
        if (typeof formatted === 'string') return [];
      } catch {
        // Fall through to lightweight formatter.
      }
    }

    const formatted = formatCSharp(model.getValue(), options);
    return formatted === model.getValue()
      ? []
      : [{ range: model.getFullModelRange(), text: formatted }];
  }

  private async provideDocumentRangeFormattingEdits(
    model: monaco.editor.ITextModel,
    range: monaco.Range,
    options: monaco.languages.FormattingOptions
  ): Promise<monaco.languages.TextEdit[]> {
    const projectRequest = this.createDiagnosticProjectRequest(model);
    if (this.intellisage) {
      try {
        const formatted = await this.intellisage('GetRangeFormattingAsync', model.getValue(), this.rangeRequest(range), projectRequest);
        if (typeof formatted === 'string' && formatted !== model.getValue()) {
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
    const localHints = this.provideLocalProjectInlayHints(model, range);
    const projectRequest = this.createDiagnosticProjectRequest(model);
    if (this.intellisage) {
      try {
        const response = await this.intellisage('GetInlayHintsAsync', model.getValue(), this.rangeRequest(range), projectRequest);
        const hints = dedupeInlayHints([...this.convertInlayHints(response), ...localHints]);
        if (hints.length) return { hints, dispose() {} };
      } catch {
        // Fall through to the browser-side semantic index.
      }
    }

    return { hints: localHints, dispose() {} };
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
    const call = this.projectCallAt(model, position);
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

  private provideLocalCompletionItems(
    model: monaco.editor.ITextModel,
    position: monaco.Position,
    range: monaco.IRange
  ): monaco.languages.CompletionItem[] {
    const index = this.getSemanticIndex(model);
    const wordStartOffset = model.getOffsetAt({ lineNumber: position.lineNumber, column: range.startColumn });
    const previous = previousSignificantTokenBeforeOffset(index.tokens, wordStartOffset);
    const isMemberAccess = previous ? ['.', '?.', '::'].includes(previous.value) : false;
    const suggestions: monaco.languages.CompletionItem[] = [];
    const seen = new Set<string>();

    const addSuggestion = (item: monaco.languages.CompletionItem) => {
      const key = `${String(item.label)}:${item.kind}`;
      if (seen.has(key)) return;
      seen.add(key);
      suggestions.push(item);
    };

    if (!isMemberAccess) {
      for (const keyword of CSHARP_KEYWORDS) {
        addSuggestion({
          label: keyword,
          kind: monaco.languages.CompletionItemKind.Keyword,
          insertText: keyword,
          range,
        });
      }
      for (const typeName of DEFAULT_TYPE_TO_NAMESPACE.keys()) {
        addSuggestion({
          label: typeName,
          kind: monaco.languages.CompletionItemKind.Class,
          detail: DEFAULT_TYPE_TO_NAMESPACE.get(typeName),
          insertText: typeName,
          range,
        });
      }
    }

    const memberKinds = new Set<CSharpSymbolKind>(['method', 'extensionMethod', 'property', 'field', 'event', 'enumMember']);
    const globalProjectKinds = new Set<CSharpSymbolKind>([
      'namespace', 'class', 'record', 'struct', 'interface', 'enum', 'delegate', 'typeParameter',
      'method', 'extensionMethod', 'constructor',
    ]);

    for (const entry of this.getProjectSemanticEntries(model)) {
      for (const declaration of entry.index.globalCompletions()) {
        if (!this.isProjectVisibleDeclaration(declaration, entry.model === model)) continue;
        if (isMemberAccess) {
          if (!memberKinds.has(declaration.kind)) continue;
        } else if (!globalProjectKinds.has(declaration.kind)) {
          continue;
        }

        const path = currentModelPath(entry.model);
        addSuggestion({
          label: declaration.name,
          kind: completionKindForSymbolKind(declaration.kind),
          detail: entry.model === model ? declaration.detail : `${declaration.detail} - ${path}`,
          documentation: { value: buildSymbolMarkdown(declaration) },
          insertText: declaration.name,
          range,
        });
      }
    }

    return suggestions;
  }

  private projectCallAt(
    model: monaco.editor.ITextModel,
    position: monaco.Position
  ): { label: string; parameters: string[]; activeParameter: number } | undefined {
    const index = this.getSemanticIndex(model);
    const call = findCSharpCallAt(index.tokens, model.getOffsetAt(position));
    if (!call) return undefined;

    const methods = this.getProjectSemanticEntries(model)
      .flatMap(entry => entry.index.declarations
        .filter(declaration => declaration.name === call.name)
        .filter(declaration => ['method', 'extensionMethod', 'constructor'].includes(declaration.kind))
        .filter(declaration => this.isProjectVisibleDeclaration(declaration, entry.model === model))
        .map(declaration => ({ ...entry, declaration })));
    const preferred = methods.find(entry => entry.model === model)
      ?? methods.find(entry => entry.declaration.parameters?.length)
      ?? methods[0];
    const method = preferred?.declaration;
    if (!method?.parameters?.length) return undefined;

    return {
      label: `${method.name}(${method.parameters.join(', ')})`,
      parameters: method.parameters,
      activeParameter: Math.min(call.activeParameter, Math.max(0, method.parameters.length - 1)),
    };
  }

  private provideLocalProjectInlayHints(
    model: monaco.editor.ITextModel,
    range: monaco.Range
  ): monaco.languages.InlayHint[] {
    const index = this.getSemanticIndex(model);
    const hints = index.inlayHints.filter(hint => range.containsPosition(hint.position));
    const methodsByName = new Map<string, CSharpDeclaration[]>();

    for (const entry of this.getProjectSemanticEntries(model)) {
      for (const declaration of entry.index.declarations) {
        if (!['method', 'extensionMethod', 'constructor'].includes(declaration.kind)) continue;
        if (!declaration.parameters?.length) continue;
        if (!this.isProjectVisibleDeclaration(declaration, entry.model === model)) continue;
        const list = methodsByName.get(declaration.name) ?? [];
        list.push(declaration);
        methodsByName.set(declaration.name, list);
      }
    }

    for (const token of index.tokens) {
      if (token.kind !== 'identifier' || index.tokens[token.index + 1]?.value !== '(') continue;
      const method = methodsByName.get(token.value.replace(/^@/, ''))?.[0];
      if (!method?.parameters?.length) continue;
      const open = index.tokens[token.index + 1];
      const closeIndex = findMatchingToken(index.tokens, open.index, '(', ')');
      if (closeIndex < 0) continue;
      const argumentStartTokens = collectArgumentStartTokens(index.tokens, open.index, closeIndex);
      for (let i = 0; i < Math.min(argumentStartTokens.length, method.parameters.length); i += 1) {
        const paramName = method.parameters[i].split(/\s+/).pop()?.replace(/^@/, '') ?? '';
        const argument = argumentStartTokens[i];
        if (!paramName || argument.value.includes(':') || !range.containsPosition(argument.range.getStartPosition())) continue;
        hints.push({
          kind: monaco.languages.InlayHintKind.Parameter,
          label: `${paramName}:`,
          position: { lineNumber: argument.range.startLineNumber, column: argument.range.startColumn },
          paddingRight: true,
        });
      }
    }

    return dedupeInlayHints(hints);
  }

  private getProjectSemanticEntries(model: monaco.editor.ITextModel): { model: monaco.editor.ITextModel; index: CSharpSemanticIndex }[] {
    const projectPaths = new Set(
      this.projectFilesProvider()
        .map(file => normalizeProjectPath(file.path))
        .filter(Boolean)
    );
    const candidates = monaco.editor.getModels()
      .filter(candidate => candidate.getLanguageId() === 'csharp')
      .filter(candidate => projectPaths.size === 0 || projectPaths.has(currentModelPath(candidate)));
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
    if (isActiveModel) return true;
    if (['local', 'parameter', 'label'].includes(declaration.kind)) return false;
    if (this.isLocalScopedDeclaration(declaration)) return false;
    return true;
  }

  private isLocalScopedDeclaration(declaration: CSharpDeclaration | CSharpSemanticOccurrence) {
    if (['local', 'parameter', 'label'].includes(declaration.kind)) return true;
    return declaration.kind === 'constant'
      && !!declaration.parent
      && ['method', 'extensionMethod', 'constructor'].includes(declaration.parent.kind);
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
    const entries = this.isLocalScopedDeclaration(target)
      ? this.getProjectSemanticEntries(model).filter(entry => entry.model === model)
      : this.getProjectSemanticEntries(model);

    for (const entry of entries) {
      for (const reference of entry.index.referencesFor(target, includeDeclaration)) {
        if (entry.index.tokens[reference.token.index] !== reference.token) continue;
        if (!this.isProjectReferenceCompatible(target, reference)) continue;
        const range = reference.token.range;
        const key = `${entry.model.uri.toString()}:${range.startLineNumber}:${range.startColumn}:${range.endLineNumber}:${range.endColumn}`;
        if (seen.has(key)) continue;
        seen.add(key);
        locations.push({ uri: entry.model.uri, range });
      }
    }

    return locations;
  }

  private isProjectReferenceCompatible(
    target: CSharpDeclaration | CSharpSemanticOccurrence,
    reference: CSharpSemanticOccurrence
  ) {
    const memberKinds = new Set<CSharpSymbolKind>(['method', 'extensionMethod', 'constructor', 'property', 'field', 'event', 'enumMember']);
    if (!memberKinds.has(target.kind)) return true;

    const targetDeclaration = target.declaration ?? (target as CSharpDeclaration);
    const targetParentName = targetDeclaration.parent?.name;
    const referenceParentName = reference.declaration?.parent?.name;
    if (!targetParentName || !referenceParentName) return true;
    return targetParentName === referenceParentName;
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

  private convertCompletion(item: any, fallbackRange: monaco.IRange): monaco.languages.CompletionItem {
    const insertText = item.textEdit?.newText ?? item.textEdit?.NewText ?? item.insertText ?? item.label;
    const range = this.toEditorRange(item.textEdit) ?? fallbackRange;
    return {
      label: item.label ?? item.insertText ?? item.textEdit?.newText ?? item.textEdit?.NewText ?? '',
      kind: Math.max(0, (item.kind ?? 1) - 1),
      detail: item.detail,
      documentation: item.documentation ? { value: typeof item.documentation === 'string' ? item.documentation : item.documentation.value ?? '' } : undefined,
      commitCharacters: item.commitCharacters,
      preselect: item.preselect,
      filterText: item.filterText,
      insertText,
      insertTextRules: item.insertTextFormat === 2
        ? monaco.languages.CompletionItemInsertTextRule.InsertAsSnippet
        : undefined,
      range,
      tags: item.tags,
      sortText: item.sortText,
      additionalTextEdits: item.additionalTextEdits?.flatMap((edit: any) => {
        const editRange = this.toEditorRange(edit);
        const text = edit?.newText ?? edit?.NewText;
        return editRange && typeof text === 'string'
          ? [{ range: editRange, text }]
          : [];
      }),
    };
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

  private convertLocations(model: monaco.editor.ITextModel, response: unknown): monaco.languages.Location[] {
    if (!Array.isArray(response)) return [];
    return response.flatMap((location: RoslynLocationDto) => {
      const range = this.toEditorRange(location.range);
      return range ? [{ uri: this.uriForProjectPath(model, location.path ?? location.Path), range }] : [];
    });
  }

  private convertWorkspaceEdit(model: monaco.editor.ITextModel, edit: RoslynTextEditDto): monaco.languages.IWorkspaceTextEdit[] {
    const range = this.toEditorRange(edit.range);
    const resource = this.uriForProjectPath(model, edit.path ?? edit.Path);
    const targetModel = monaco.editor.getModel(resource);
    const text = edit.text ?? edit.Text ?? '';
    return range
      ? [{ resource, textEdit: { range, text }, versionId: targetModel?.getVersionId() }]
      : [];
  }

  private convertCodeActions(
    model: monaco.editor.ITextModel,
    response: unknown,
    markers: monaco.editor.IMarkerData[]
  ): monaco.languages.CodeAction[] {
    if (!Array.isArray(response)) return [];
    return response.flatMap((action: RoslynCodeActionDto) => {
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
    return response.flatMap(symbol => this.convertDocumentSymbol(symbol as RoslynDocumentSymbolDto));
  }

  private convertDocumentSymbol(symbol: RoslynDocumentSymbolDto): monaco.languages.DocumentSymbol[] {
    const range = this.toEditorRange(symbol.range);
    const selectionRange = this.toEditorRange(symbol.selectionRange);
    if (!range || !selectionRange || !symbol.name) return [];
    return [{
      name: symbol.name,
      detail: symbol.detail ?? '',
      kind: documentSymbolKindFromRoslyn(symbol.kind),
      range,
      selectionRange,
      tags: [],
      children: (symbol.children ?? []).flatMap(child => this.convertDocumentSymbol(child)),
    }];
  }

  private convertInlayHints(response: unknown): monaco.languages.InlayHint[] {
    if (!Array.isArray(response)) return [];
    return response.flatMap((hint: RoslynInlayHintDto) => {
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
    return response.flatMap((range: RoslynFoldingRangeDto) => {
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
    const currentPath = currentModelPath(model);
    const seen = new Set<string>([currentPath]);
    const files: CSharpDiagnosticProjectRequest['Files'] = [];

    for (const file of this.projectFilesProvider()) {
      if (file.language !== 'csharp') continue;
      const path = normalizeProjectPath(file.path);
      if (!path || seen.has(path)) continue;
      seen.add(path);
      files.push({ Path: path, Content: file.content ?? '' });
    }

    return { CurrentPath: currentPath, Files: files };
  }

  private createProjectSnapshotKey(request: CSharpDiagnosticProjectRequest) {
    return request.Files
      .map(file => `${file.Path}:${file.Content.length}:${hashString(file.Content)}`)
      .join('|');
  }

  private createDiagnosticCacheKey(
    model: monaco.editor.ITextModel,
    code: string,
    request: CSharpDiagnosticProjectRequest
  ) {
    const fileKey = this.createProjectSnapshotKey(request);
    return [
      model.uri.toString(),
      model.getVersionId(),
      code.length,
      request.CurrentPath,
      fileKey,
      this.completionEnvironmentVersion,
    ].join(':');
  }

  private uriForProjectPath(model: monaco.editor.ITextModel, path: string | undefined) {
    const normalizedPath = normalizeProjectPath(path ?? '');
    if (!normalizedPath || normalizedPath === currentModelPath(model)) return model.uri;
    return monaco.Uri.file(`/codecraft-project/${normalizedPath}`);
  }

  private modelForProjectPath(model: monaco.editor.ITextModel, path: string | undefined) {
    const uri = this.uriForProjectPath(model, path);
    if (uri.toString() === model.uri.toString()) return model;
    return monaco.editor.getModel(uri) ?? undefined;
  }

  private convertDiagnosticResponse(
    model: monaco.editor.ITextModel,
    response: unknown
  ): {
    markersByUri: Map<string, monaco.editor.IMarkerData[]>;
    currentMarkers: monaco.editor.IMarkerData[];
    projectWide: boolean;
  } {
    const markersByUri = new Map<string, monaco.editor.IMarkerData[]>();
    if (!Array.isArray(response)) {
      markersByUri.set(model.uri.toString(), []);
      return { markersByUri, currentMarkers: [], projectWide: false };
    }

    const projectWide = response.some((diagnostic: any) => {
      const path = diagnostic?.path ?? diagnostic?.Path;
      return typeof path === 'string' && path.trim().length > 0;
    });

    for (const diagnostic of response as any[]) {
      const targetModel = this.modelForProjectPath(model, diagnostic?.path ?? diagnostic?.Path);
      if (!targetModel) continue;
      const range = this.toMarkerRange(targetModel, diagnostic);
      const message = typeof diagnostic?.message === 'string' ? diagnostic.message : '';
      if (!range || !message) continue;
      const marker: monaco.editor.IMarkerData = {
        severity: this.toMarkerSeverity(diagnostic.severity),
        message,
        code: typeof diagnostic.id === 'string' && diagnostic.id ? diagnostic.id : undefined,
        source: 'local-roslyn',
        ...range,
      };
      const uriKey = targetModel.uri.toString();
      const markers = markersByUri.get(uriKey) ?? [];
      markers.push(marker);
      markersByUri.set(uriKey, markers);
    }

    const currentMarkers = markersByUri.get(model.uri.toString()) ?? [];
    if (!markersByUri.has(model.uri.toString())) markersByUri.set(model.uri.toString(), currentMarkers);
    return { markersByUri, currentMarkers, projectWide };
  }

  private applyDiagnosticMarkerMap(
    model: monaco.editor.ITextModel,
    markersByUri: Map<string, monaco.editor.IMarkerData[]>,
    projectWide: boolean
  ) {
    const targetModels = projectWide
      ? this.getProjectSemanticEntries(model).map(entry => entry.model)
      : [model];
    for (const targetModel of targetModels) {
      if (targetModel.isDisposed()) continue;
      monaco.editor.setModelMarkers(
        targetModel,
        'csharp-intellisage',
        markersByUri.get(targetModel.uri.toString()) ?? []
      );
    }
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

  private encodeRoslynSemanticTokens(tokens: RoslynSemanticTokenDto[]) {
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

function advanceCodePoint(source: string, offset: number) {
  const codePoint = source.codePointAt(offset);
  return offset + (codePoint && codePoint > 0xFFFF ? 2 : 1);
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

function previousSignificantTokenBeforeOffset(tokens: CSharpToken[], offset: number) {
  for (let i = tokens.length - 1; i >= 0; i -= 1) {
    const token = tokens[i];
    if (token.endOffset > offset) continue;
    if (!['comment', 'string', 'preprocessor'].includes(token.kind)) return token;
  }
  return undefined;
}

function findCSharpCallAt(tokens: CSharpToken[], offset: number): CSharpCallInfo | undefined {
  let depth = 0;
  let commaCount = 0;
  let openParen: CSharpToken | undefined;
  for (let i = tokens.length - 1; i >= 0; i -= 1) {
    const token = tokens[i];
    if (token.offset >= offset) continue;
    if (token.value === ')') depth += 1;
    if (token.value === '(') {
      if (depth === 0) { openParen = token; break; }
      depth -= 1;
    }
    if (depth === 0 && token.value === ',') commaCount += 1;
  }
  if (!openParen) return undefined;
  const callee = previousSignificantToken(tokens, openParen.index);
  if (!callee || callee.kind !== 'identifier') return undefined;
  return { name: callee.value.replace(/^@/, ''), activeParameter: commaCount };
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

function documentSymbolKindFromRoslyn(kind?: string) {
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

function completionKindForSymbolKind(kind: CSharpSymbolKind) {
  switch (kind) {
    case 'namespace': return monaco.languages.CompletionItemKind.Module;
    case 'class':
    case 'record': return monaco.languages.CompletionItemKind.Class;
    case 'struct': return monaco.languages.CompletionItemKind.Struct;
    case 'interface': return monaco.languages.CompletionItemKind.Interface;
    case 'enum': return monaco.languages.CompletionItemKind.Enum;
    case 'delegate': return monaco.languages.CompletionItemKind.Function;
    case 'method':
    case 'extensionMethod':
    case 'constructor': return monaco.languages.CompletionItemKind.Method;
    case 'property': return monaco.languages.CompletionItemKind.Property;
    case 'field': return monaco.languages.CompletionItemKind.Field;
    case 'event': return monaco.languages.CompletionItemKind.Event;
    case 'enumMember': return monaco.languages.CompletionItemKind.EnumMember;
    case 'parameter':
    case 'local': return monaco.languages.CompletionItemKind.Variable;
    case 'constant': return monaco.languages.CompletionItemKind.Constant;
    case 'typeParameter': return monaco.languages.CompletionItemKind.TypeParameter;
    default: return monaco.languages.CompletionItemKind.Text;
  }
}

function mergeCompletionSuggestions(
  roslynSuggestions: monaco.languages.CompletionItem[],
  roslynItems: any[],
  localSuggestions: monaco.languages.CompletionItem[]
): { suggestions: monaco.languages.CompletionItem[]; lspItems: any[] } {
  const suggestions: monaco.languages.CompletionItem[] = [];
  const lspItems: any[] = [];
  const seen = new Set<string>();

  const add = (item: monaco.languages.CompletionItem, lspItem: any = null) => {
    const range = item.range as monaco.IRange | monaco.languages.CompletionItemRanges | undefined;
    const insertRange = range && 'insert' in range ? range.insert : range;
    const key = [
      typeof item.label === 'string' ? item.label : JSON.stringify(item.label),
      item.kind,
      insertRange?.startLineNumber,
      insertRange?.startColumn,
      insertRange?.endLineNumber,
      insertRange?.endColumn,
    ].join(':');
    if (seen.has(key)) return;
    seen.add(key);
    suggestions.push(item);
    lspItems.push(lspItem);
  };

  roslynSuggestions.forEach((item, index) => add(item, roslynItems[index]));
  localSuggestions.forEach(item => add(item));
  return { suggestions, lspItems };
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

function dedupeInlayHints(hints: monaco.languages.InlayHint[]) {
  const seen = new Set<string>();
  return hints.filter(hint => {
    const label = typeof hint.label === 'string' ? hint.label : JSON.stringify(hint.label);
    const key = `${hint.position.lineNumber}:${hint.position.column}:${hint.kind}:${label}`;
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
let _csharpReadySource: CSharpIntelliSageSource = 'local';
export function ensureCSharpReady(source: CSharpIntelliSageSource = 'local'): Promise<void> {
  const normalizedSource = normalizeCSharpIntelliSageSource(source);
  if (!_csharpReady || _csharpReadySource !== normalizedSource) {
    _csharpReadySource = normalizedSource;
    _csharpReady = csharpService.initialize(getCSharpIntelliSageUrl(normalizedSource)).catch(error => {
      if (_csharpReadySource === normalizedSource) _csharpReady = null;
      throw error;
    });
  }
  return _csharpReady;
}
export const csharpReady = { then: (fn: () => void) => ensureCSharpReady().then(fn) };
