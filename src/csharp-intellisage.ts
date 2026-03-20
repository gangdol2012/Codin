import * as monaco from 'monaco-editor';

const iframeId = `intellisage-${Math.random().toString(36).slice(2)}`;

type IntellisageCall = (method: string, ...args: unknown[]) => Promise<any>;

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

class CSharpLanguageService {
  private intellisage: IntellisageCall | null = null;
  private lastCompletions = new Map<monaco.languages.CompletionItem, any>();
  private model: monaco.editor.ITextModel | null = null;
  private initialized = false;

  private debouncedDiagnostics = debounce(this.getDiagnostics.bind(this), 100);
  private debouncedCompletions = this.rawProvideCompletionItems.bind(this);
  private debouncedResolve = this.rawResolveCompletionItem.bind(this);

  async initialize(iframeUrl = '/intellisage/') {
    if (this.initialized) return;
    this.initialized = true;

    let iframe = document.getElementById(iframeId) as HTMLIFrameElement | null;
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
      iframe.src = iframeUrl;
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

    monaco.languages.registerCompletionItemProvider('csharp', {
      triggerCharacters: ['.'],
      resolveCompletionItem: (_item) => this.debouncedResolve(_item),
      provideCompletionItems: (model, position, context) => this.debouncedCompletions(model, position, context),
    });

    monaco.languages.registerSignatureHelpProvider('csharp', {
      signatureHelpTriggerCharacters: ['('],
      provideSignatureHelp: (model, position) => this.provideSignatureHelp(model, position),
    });

    monaco.languages.registerHoverProvider('csharp', {
      provideHover: (_model, position) => this.provideHover(position),
    });
  }

  private editorChangeListener: monaco.IDisposable | null = null;
  private modelChangeListener: monaco.IDisposable | null = null;

  setupEditor(editor: monaco.editor.IStandaloneCodeEditor) {
    this.setupDiagnostics(editor);
  }

  clearEditor() {
    this.modelChangeListener?.dispose();
    this.modelChangeListener = null;
    this.editorChangeListener?.dispose();
    this.editorChangeListener = null;
    this.model = null;
  }

  setupDiagnostics(editor: monaco.editor.IStandaloneCodeEditor) {
    this.clearEditor();

    const updateModel = () => {
      this.modelChangeListener?.dispose();
      this.modelChangeListener = null;
      this.model = editor.getModel();

      if (this.model && this.model.getLanguageId() === 'csharp') {
        this.debouncedDiagnostics(this.model.getValue());
        this.modelChangeListener = this.model.onDidChangeContent(() => {
          if (this.model && this.model.getLanguageId() === 'csharp') {
            this.debouncedDiagnostics(this.model.getValue());
          }
        });
      } else {
        this.model = null;
      }
    };

    updateModel();
    this.editorChangeListener = editor.onDidChangeModel(() => updateModel());
  }

  private static readonly LIBRARY_DIAG_PATTERNS = [
    /top-level statements/i,
    /does not contain a static 'Main' method/i,
    /entry point/i,
  ];

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

    if (this.model && this.model.getLanguageId() === 'csharp') {
      await this.getDiagnostics(this.model.getValue());
    }

    return response || { success: false, message: `No response while including '${trimmedNamespace}'.` };
  }

  private async getDiagnostics(code: string) {
    if (!this.intellisage || !this.model) return;
    const safeCode = (code != null && typeof code === 'string') ? code : '';
    const diagnostics = await this.intellisage('GetDiagnosticsAsync', safeCode);
    if (!diagnostics || !this.model) return;
    const markers = (diagnostics as any[])
      .filter((d: any) => !CSharpLanguageService.LIBRARY_DIAG_PATTERNS.some(p => p.test(d.message)))
      .map((d: any) => ({
        ...d,
        startLineNumber: d.start.line + 1,
        startColumn: d.start.character + 1,
        endLineNumber: d.end.line + 1,
        endColumn: d.end.character + 1,
      }));
    monaco.editor.setModelMarkers(this.model, 'csharp-intellisage', markers);
  }

  private async rawProvideCompletionItems(
    model: monaco.editor.ITextModel,
    position: monaco.Position,
    context: monaco.languages.CompletionContext
  ): Promise<monaco.languages.CompletionList> {
    if (!this.intellisage) return { suggestions: [] };
    const request: any = {
      Line: position.lineNumber - 1,
      Column: position.column - 1,
      CompletionTrigger: (context.triggerKind as number) + 1,
      TriggerCharacter: context.triggerCharacter,
    };
    try {
      const response = await this.intellisage('GetCompletionAsync', model.getValue(), request);
      if (!response) return { suggestions: [] };
      const items = (response as any).items ?? [];
      const validItems = items.filter((item: any) => (item?.label ?? item?.insertText ?? item?.textEdit?.newText ?? item?.textEdit?.NewText) != null);
      const word = model.getWordUntilPosition(position);
      const fallbackRange = new monaco.Range(position.lineNumber, word.startColumn, position.lineNumber, word.endColumn);
      const mapped = validItems.map((item: any) => this.convertCompletion(item, fallbackRange));
      this.lastCompletions.clear();
      for (let i = 0; i < mapped.length; i++) {
        this.lastCompletions.set(mapped[i], validItems[i]);
      }
      return { suggestions: mapped };
    } catch {
      return { suggestions: [] };
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
    if (!this.intellisage) return undefined;
    const req = { Line: position.lineNumber - 1, Column: position.column - 1 };
    try {
      const res = await this.intellisage('GetSignatureHelpAsync', model.getValue(), req);
      if (!res) return undefined;
      const result = res as any;
      return {
        value: {
          signatures: result.signatures.map((sig: any) => ({
            label: sig.label,
            documentation: sig.structuredDocumentation?.summaryText ?? '',
            parameters: sig.parameters.map((p: any) => ({
              label: p.label,
              documentation: p.documentation ? { value: `**${p.name}**: ${p.documentation}` } : '',
            })),
          })),
          activeSignature: result.activeSignature,
          activeParameter: result.activeParameter,
        },
        dispose: () => { },
      };
    } catch {
      return undefined;
    }
  }

  private async provideHover(
    position: monaco.Position
  ): Promise<monaco.languages.Hover | undefined> {
    if (!this.intellisage) return undefined;
    const req = { Line: position.lineNumber - 1, Column: position.column - 1 };
    try {
      const response = await this.intellisage('GetQuickInfoAsync', req);
      if (!response || !(response as any).markdown) return undefined;
      return { contents: [{ value: (response as any).markdown }] };
    } catch {
      return undefined;
    }
  }

  private toEditorRange(edit: any): monaco.IRange | undefined {
    const range = edit?.range ?? edit;
    const start = range?.start ?? (typeof range?.startLine === 'number' ? { line: range.startLine, character: range.startColumn } : undefined);
    const end = range?.end ?? (typeof range?.endLine === 'number' ? { line: range.endLine, character: range.endColumn } : undefined);

    if (
      typeof start?.line !== 'number' ||
      typeof start?.character !== 'number' ||
      typeof end?.line !== 'number' ||
      typeof end?.character !== 'number'
    ) {
      return undefined;
    }

    return {
      startLineNumber: start.line + 1,
      startColumn: start.character + 1,
      endLineNumber: end.line + 1,
      endColumn: end.character + 1,
    };
  }

  private convertCompletion(item: any, fallbackRange: monaco.IRange): monaco.languages.CompletionItem {
    const insertText = item.textEdit?.newText ?? item.textEdit?.NewText ?? item.insertText ?? item.label;
    const range = this.toEditorRange(item.textEdit) ?? fallbackRange;
    return {
      label: item.label ?? item.insertText ?? item.textEdit?.newText ?? item.textEdit?.NewText ?? '',
      kind: (item.kind ?? 1) - 1,
      detail: item.detail,
      documentation: item.documentation ? { value: item.documentation } : undefined,
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
}

export const csharpService = new CSharpLanguageService();
let _csharpReady: Promise<void> | null = null;
export function ensureCSharpReady(): Promise<void> {
  if (!_csharpReady) _csharpReady = csharpService.initialize();
  return _csharpReady;
}
export const csharpReady = { then: (fn: () => void) => ensureCSharpReady().then(fn) };
