#!/usr/bin/env node
/*
 * CodeCraft C# any-context completion forward-fix patcher.
 *
 * Scope: src/csharp-omnisharp.ts completion-only changes.
 * - Keeps Roslyn/OmniSharp authoritative for grammar-correct completion lists.
 * - Uses Invoke completion as the primary path so spaces, attributes, type positions,
 *   object initializers, using directives, preprocessor lines, and member positions all
 *   ask Roslyn for the full contextual list instead of a trigger-limited subset.
 * - Falls back to trigger-character completion only when the full-context request returns
 *   no items, preserving responsiveness in normal cases.
 * - Preserves Monaco icons through exact LSP -> Monaco kind mapping.
 * - Preserves insert/replace ranges and resolve behavior.
 * - Keeps cache + in-flight coalescing for near-immediate repeated responses.
 */

const fs = require('node:fs');
const path = require('node:path');

const cliArgs = process.argv.slice(2);
const targetArg = cliArgs.find(arg => !arg.startsWith('--'));
const targetPath = path.resolve(process.cwd(), targetArg || 'src/csharp-omnisharp.ts');
const BACKUP_SUFFIX = new Date().toISOString().replace(/[:.]/g, '-');
const DRY_RUN = cliArgs.includes('--dry-run');

const HARDENING_START = '// CodeCraft C# completion hardening start';
const HARDENING_END = '// CodeCraft C# completion hardening end';
const CONTEXTUAL_V2_START = '// CodeCraft C# contextual completion fix start';
const CONTEXTUAL_V2_END = '// CodeCraft C# contextual completion fix end';
const HELPER_START = '// CodeCraft C# any-context completion fix start';
const HELPER_END = '// CodeCraft C# any-context completion fix end';

const helperBlock = String.raw`
${HELPER_START}
const CSHARP_CONTEXTUAL_COMPLETION_FIX_VERSION = '2026-05-12-any-context-v3';

const CSHARP_CONTEXTUAL_COMPLETION_TRIGGER_CHARACTERS = ['.', '(', ',', '<', '[', ' ', '#', ':', '=', '{', '}', '?', '@'];

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

function csharpResolvedCompletionItem(response: any, fallback: any): any {
  return response?.item ?? response?.Item ?? response?.completionItem ?? response?.CompletionItem ?? response ?? fallback;
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
  fallbackRange: monaco.IRange | monaco.languages.CompletionItemRanges,
  toEditorRange: (edit: any) => monaco.IRange | undefined
): monaco.IRange | monaco.languages.CompletionItemRanges {
  const insertRange = toEditorRange(textEdit?.insert ?? textEdit?.Insert);
  const replaceRange = toEditorRange(textEdit?.replace ?? textEdit?.Replace);
  if (insertRange && replaceRange) return { insert: insertRange, replace: replaceRange };

  const simpleRange = toEditorRange(textEdit);
  return simpleRange ?? fallbackRange;
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

function csharpContextualCompletionRequest(
  position: monaco.Position,
  completionTrigger: 1 | 2 | 3,
  triggerCharacter?: string
): any {
  const request: any = {
    Line: Math.max(0, position.lineNumber - 1),
    Column: Math.max(0, position.column - 1),
    CompletionTrigger: completionTrigger,
  };
  if (completionTrigger === 2 && triggerCharacter) request.TriggerCharacter = triggerCharacter;
  return request;
}

function csharpPrimaryCompletionRequest(position: monaco.Position): any {
  // Invoke asks Roslyn for the full grammar-valid list at the exact location.
  // This is more complete than trigger-character requests for spaces, attributes,
  // type positions, object initializers, using aliases, and other non-dot contexts.
  return csharpContextualCompletionRequest(position, 1);
}

function csharpTriggerRetryCompletionRequest(
  model: monaco.editor.ITextModel,
  position: monaco.Position,
  context: monaco.languages.CompletionContext
): any | null {
  const explicit = typeof context.triggerCharacter === 'string' && context.triggerCharacter.length > 0
    ? context.triggerCharacter
    : undefined;
  const previous = csharpCompletionCharacterBefore(model, position);
  const triggerCharacter = explicit ?? previous;
  if (!triggerCharacter || triggerCharacter === '\n' || triggerCharacter === '\r') return null;
  if (triggerCharacter.length !== 1) return null;
  return csharpContextualCompletionRequest(position, 2, triggerCharacter);
}

function csharpContextualCompletionCacheKey(
  model: monaco.editor.ITextModel,
  snapshot: CSharpCompletionRequestSnapshot,
  position: monaco.Position,
  context: monaco.languages.CompletionContext,
  request: any,
  completionEnvironmentVersion: number,
  completionWorkerStateKey: string | null
): string {
  const triggerCharacter = typeof context.triggerCharacter === 'string' ? context.triggerCharacter : '';
  const previousCharacter = csharpCompletionCharacterBefore(model, position) ?? '';
  return [
    'any-context-v3',
    model.uri.toString(),
    snapshot.modelVersionId,
    snapshot.offset,
    csharpCompletionFastHash(snapshot.code),
    request.CompletionTrigger,
    request.TriggerCharacter ?? '',
    context.triggerKind,
    triggerCharacter,
    previousCharacter,
    completionEnvironmentVersion,
    completionWorkerStateKey ?? '',
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
${HELPER_END}
`;

const rawProvideCompletionItemsMethod = String.raw`  private async rawProvideCompletionItems(
    model: monaco.editor.ITextModel,
    position: monaco.Position,
    context: monaco.languages.CompletionContext
  ): Promise<monaco.languages.CompletionList> {
    const snapshot = this.createCompletionSnapshot(model, position);
    snapshot.structuralVersion = this.completionStructuralVersion;

    const primaryRequest = csharpPrimaryCompletionRequest(position);
    const retryRequest = csharpTriggerRetryCompletionRequest(model, position, context);
    const cacheKey = csharpContextualCompletionCacheKey(
      model,
      snapshot,
      position,
      context,
      primaryRequest,
      this.completionEnvironmentVersion,
      this.completionWorkerStateKey
    );

    const cached = this.completionCache.get(cacheKey);
    if (cached && this.completionWorkerStateKey === cacheKey) return this.toCompletionList(cached);

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
        ...primaryRequest,
        offset: snapshot.offset,
        cacheKey,
        fallbackTriggerCharacter: retryRequest?.TriggerCharacter,
        contextualCompletionFixVersion: CSHARP_CONTEXTUAL_COMPLETION_FIX_VERSION,
      },
    });

    const inflight = csharpCompletionInflightFor(this);
    let entryPromise = inflight.get(cacheKey);

    if (!entryPromise) {
      entryPromise = (async (): Promise<CSharpCompletionCacheEntry | null> => {
        const requestCompletion = async (request: any) => {
          const response = await this.omnisharp!('GetCompletionAsync', snapshot.code, request);
          return {
            response,
            rawItems: csharpCompletionItemsFromResponse(response),
          };
        };

        let completionResult = await requestCompletion(primaryRequest);
        if (
          completionResult.rawItems.length === 0 &&
          !csharpCompletionResponseIsIncomplete(completionResult.response) &&
          retryRequest
        ) {
          const retryResult = await requestCompletion(retryRequest);
          if (retryResult.rawItems.length > 0 || csharpCompletionResponseIsIncomplete(retryResult.response)) {
            completionResult = retryResult;
          }
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

        const fallbackRange = lateContext?.fallbackRange ?? this.getCompletionFilterRangeAtPosition(model, position);
        const suggestions: monaco.languages.CompletionItem[] = [];
        const lspItems: any[] = [];

        for (const rawItem of completionResult.rawItems) {
          const suggestion = this.convertCompletion(model, rawItem, fallbackRange, snapshot, lateContext);
          if (!csharpCompletionItemIsUsable(suggestion)) continue;
          suggestions.push(suggestion);
          lspItems.push(rawItem);
        }

        return {
          suggestions,
          lspItems,
          incomplete: csharpCompletionResponseIsIncomplete(completionResult.response),
          completionSnapshot: lateContext ? snapshot : undefined,
          lateContext,
        };
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
          triggerRetryPrepared: !!retryRequest,
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
  }`;

const rawResolveCompletionItemMethod = String.raw`  private async rawResolveCompletionItem(
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
      const response = await this.omnisharp('GetCompletionResolveAsync', { Item: lspItem });
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
      const fallbackRange = csharpCompletionItemInsertRange(item.range) ?? this.toEditorRange((item.range as any)?.insert ?? item.range);
      const converted = fallbackRange && this.model && !this.model.isDisposed()
        ? this.convertCompletion(
          this.model,
          resolved,
          fallbackRange,
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
  }`;

const convertCompletionMethod = String.raw`  private convertCompletion(
    model: monaco.editor.ITextModel,
    item: any,
    fallbackRange: monaco.IRange | monaco.languages.CompletionItemRanges,
    snapshot?: CSharpCompletionRequestSnapshot,
    lateContext?: CSharpLateCompletionContext | null
  ): monaco.languages.CompletionItem | null {
    const label = csharpCompletionLabel(item);
    if (!label) return null;

    const textEdit = csharpCompletionTextEdit(item);
    const insertText = csharpCompletionInsertText(item, label);
    const initialRange = csharpCompletionRangeFromTextEdit(
      textEdit,
      fallbackRange,
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
  }`;

function assertTargetLooksRight(source) {
  const required = [
    'class CSharpLanguageService',
    'private omnisharp',
    'rawProvideCompletionItems',
    'rawResolveCompletionItem',
    'convertCompletion',
    'ensureLocalOmniSharpRuntime',
    'cacheCompletionResult',
    'toCompletionList',
    'mapMainCompletionRangeToCurrent',
  ];
  const missing = required.filter(fragment => !source.includes(fragment));
  if (missing.length) {
    throw new Error(`Target does not look like the current patched CodeCraft OmniSharp service. Missing: ${missing.join(', ')}`);
  }
}

function stripBlock(source, startMarker, endMarker) {
  let output = source;
  while (true) {
    const start = output.indexOf(startMarker);
    if (start < 0) return output;
    const end = output.indexOf(endMarker, start);
    if (end < 0) throw new Error(`Found ${startMarker} without ${endMarker}.`);
    output = output.slice(0, start).replace(/\s*$/, '\n') + output.slice(end + endMarker.length).replace(/^\s*/, '\n');
  }
}

function insertHelperBlock(source) {
  const classIndex = source.indexOf('class CSharpLanguageService');
  if (classIndex < 0) throw new Error('Could not find CSharpLanguageService class.');
  return source.slice(0, classIndex).replace(/\s*$/, '\n\n') + helperBlock.trim() + '\n\n' + source.slice(classIndex);
}

function findMatchingDelimiter(source, openIndex, openChar, closeChar) {
  let depth = 0;
  let quote = null;
  let templateDepth = 0;
  let escaped = false;
  let lineComment = false;
  let blockComment = false;

  for (let index = openIndex; index < source.length; index += 1) {
    const char = source[index];
    const next = source[index + 1];

    if (lineComment) {
      if (char === '\n') lineComment = false;
      continue;
    }
    if (blockComment) {
      if (char === '*' && next === '/') {
        blockComment = false;
        index += 1;
      }
      continue;
    }
    if (quote) {
      if (escaped) {
        escaped = false;
        continue;
      }
      if (char === '\\') {
        escaped = true;
        continue;
      }
      if (quote === '`') {
        if (char === '$' && next === '{') {
          templateDepth += 1;
          index += 1;
          continue;
        }
        if (char === '}' && templateDepth > 0) {
          templateDepth -= 1;
          continue;
        }
      }
      if (char === quote && templateDepth === 0) quote = null;
      continue;
    }

    if (char === '/' && next === '/') {
      lineComment = true;
      index += 1;
      continue;
    }
    if (char === '/' && next === '*') {
      blockComment = true;
      index += 1;
      continue;
    }
    if (char === '"' || char === "'" || char === '`') {
      quote = char;
      escaped = false;
      templateDepth = 0;
      continue;
    }

    if (char === openChar) depth += 1;
    if (char === closeChar) {
      depth -= 1;
      if (depth === 0) return index;
    }
  }

  throw new Error(`Could not find matching ${closeChar} for ${openChar} at offset ${openIndex}.`);
}

function findMethodRange(source, methodName) {
  const methodRegex = new RegExp(`\\n\\s*private\\s+(?:async\\s+)?${methodName}\\s*\\(`, 'g');
  const matches = [...source.matchAll(methodRegex)];
  if (matches.length !== 1) {
    throw new Error(`Expected exactly one private method named ${methodName}, found ${matches.length}.`);
  }
  const start = matches[0].index + 1;
  const nameIndex = source.indexOf(methodName, start);
  const openParen = source.indexOf('(', nameIndex);
  const closeParen = findMatchingDelimiter(source, openParen, '(', ')');
  const bodyStart = source.indexOf('{', closeParen);
  if (bodyStart < 0) throw new Error(`Could not find ${methodName} body.`);
  const bodyEnd = findMatchingDelimiter(source, bodyStart, '{', '}');
  return { start, end: bodyEnd + 1 };
}

function replaceMethod(source, methodName, newMethod) {
  const range = findMethodRange(source, methodName);
  return source.slice(0, range.start) + newMethod + source.slice(range.end);
}

function patchCompletionTriggerCharacters(source) {
  const providerIndex = source.indexOf("registerCompletionItemProvider('csharp'") >= 0
    ? source.indexOf("registerCompletionItemProvider('csharp'")
    : source.indexOf('registerCompletionItemProvider("csharp"');
  if (providerIndex < 0) return source;
  const objectStart = source.indexOf('{', providerIndex);
  if (objectStart < 0) return source;
  const objectEnd = findMatchingDelimiter(source, objectStart, '{', '}');
  const providerObject = source.slice(objectStart, objectEnd + 1);
  const nextTriggers = `triggerCharacters: CSHARP_CONTEXTUAL_COMPLETION_TRIGGER_CHARACTERS`;

  if (/triggerCharacters\s*:\s*(?:\[[^\]]*\]|[A-Z0-9_]+(?:\.[A-Z0-9_]+)?)/i.test(providerObject)) {
    const patchedObject = providerObject.replace(/triggerCharacters\s*:\s*(?:\[[^\]]*\]|[A-Z0-9_]+(?:\.[A-Z0-9_]+)?)/i, nextTriggers);
    return source.slice(0, objectStart) + patchedObject + source.slice(objectEnd + 1);
  }

  const patchedObject = providerObject.replace('{', `{\n        ${nextTriggers},`);
  return source.slice(0, objectStart) + patchedObject + source.slice(objectEnd + 1);
}

function patchSource(source) {
  assertTargetLooksRight(source);
  let patched = stripBlock(source, HARDENING_START, HARDENING_END);
  patched = stripBlock(patched, CONTEXTUAL_V2_START, CONTEXTUAL_V2_END);
  patched = stripBlock(patched, HELPER_START, HELPER_END);
  patched = insertHelperBlock(patched);
  patched = patchCompletionTriggerCharacters(patched);
  patched = replaceMethod(patched, 'rawProvideCompletionItems', rawProvideCompletionItemsMethod);
  patched = replaceMethod(patched, 'rawResolveCompletionItem', rawResolveCompletionItemMethod);
  patched = replaceMethod(patched, 'convertCompletion', convertCompletionMethod);
  return patched;
}

function countOccurrences(source, needle) {
  return source.split(needle).length - 1;
}

function validatePatchedSource(source) {
  const checks = [
    ['old hardening removed', !source.includes(HARDENING_START) && !source.includes('CSHARP_COMPLETION_HARDENING_VERSION')],
    ['old contextual helper removed', !source.includes(CONTEXTUAL_V2_START) && !source.includes('2026-05-12-contextual-v2')],
    ['new helper present once', countOccurrences(source, HELPER_START) === 1 && countOccurrences(source, HELPER_END) === 1],
    ['invoke primary request present', source.includes('csharpPrimaryCompletionRequest(position)')],
    ['trigger retry present', source.includes('csharpTriggerRetryCompletionRequest(model, position, context)')],
    ['runtime warm-up retained', source.includes('await this.ensureLocalOmniSharpRuntime()')],
    ['correct convertCompletion provider call', source.includes('this.convertCompletion(model, rawItem, fallbackRange, snapshot, lateContext)')],
    ['insert replace range support present', source.includes('csharpCompletionRangeFromTextEdit') && source.includes('{ insert: insertRange, replace: replaceRange }')],
    ['icons mapping present', source.includes('CSHARP_LSP_COMPLETION_KIND_TO_MONACO')],
    ['completion triggers constant installed', source.includes('triggerCharacters: CSHARP_CONTEXTUAL_COMPLETION_TRIGGER_CHARACTERS')],
  ];
  const failed = checks.filter(([, ok]) => !ok).map(([label]) => label);
  if (failed.length) throw new Error(`Patched source failed validation: ${failed.join(', ')}`);
}

if (!fs.existsSync(targetPath)) {
  throw new Error(`Target file not found: ${targetPath}`);
}

const original = fs.readFileSync(targetPath, 'utf8');
const patched = patchSource(original);
validatePatchedSource(patched);

const report = {
  target: path.relative(process.cwd(), targetPath),
  dryRun: DRY_RUN,
  changed: patched !== original,
  timestamp: new Date().toISOString(),
  touchedScopes: [
    'completion helper block',
    'completion trigger characters',
    'rawProvideCompletionItems',
    'rawResolveCompletionItem',
    'convertCompletion',
  ],
  guarantees: {
    roslynAuthoritative: true,
    localFallbackSuggestions: false,
    primaryRequestMode: 'CompletionTrigger.Invoke for full grammar-context list',
    retryMode: 'TriggerCharacter only when Invoke returns no items',
    monacoIconKindMapping: 'LSP CompletionItemKind -> Monaco CompletionItemKind',
    insertReplaceRangesPreserved: true,
    runtimeWarmupPath: 'ensureLocalOmniSharpRuntime()',
    requestCoalescing: true,
    completionCacheKept: true,
    nonCompletionCodeTouched: false,
  },
};

if (patched === original) {
  console.log('No changes were necessary.');
} else if (DRY_RUN) {
  console.log('Dry run passed. No files written.');
} else {
  const backupPath = `${targetPath}.any-context-completions-bak.${BACKUP_SUFFIX}`;
  fs.writeFileSync(backupPath, original, 'utf8');
  fs.writeFileSync(targetPath, patched, 'utf8');
  console.log(`Patched ${path.relative(process.cwd(), targetPath)}`);
  console.log(`Backup: ${path.relative(process.cwd(), backupPath)}`);
}

const reportPath = `${targetPath}.any-context-completions-report.json`;
if (!DRY_RUN) fs.writeFileSync(reportPath, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
if (!DRY_RUN) console.log(`Report: ${path.relative(process.cwd(), reportPath)}`);
console.log('Next: run npm run build, then test completion after dot, new-space, using-space, attributes, object initializers, type positions, preprocessor lines, named arguments, and generic type arguments.');
