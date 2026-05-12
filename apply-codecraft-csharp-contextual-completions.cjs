#!/usr/bin/env node
/*
 * CodeCraft C# contextual completion forward-fix patcher.
 *
 * Scope: src/csharp-omnisharp.ts completion-only changes.
 * - Keeps Roslyn/OmniSharp as the authoritative context engine.
 * - Preserves Monaco completion icons through exact LSP -> Monaco kind mapping.
 * - Restores correct convertCompletion(model, item, range, snapshot, lateContext) calls.
 * - Restores the original ensureLocalOmniSharpRuntime() warm-up path.
 * - Adds in-flight request coalescing and keeps the existing completion cache intact.
 */

const fs = require('node:fs');
const path = require('node:path');

const cliArgs = process.argv.slice(2);
const targetArg = cliArgs.find(arg => !arg.startsWith('--'));
const targetPath = path.resolve(process.cwd(), targetArg || 'src/csharp-omnisharp.ts');
const BACKUP_SUFFIX = new Date().toISOString().replace(/[:.]/g, '-');
const DRY_RUN = cliArgs.includes('--dry-run');

const OLD_HELPER_START = '// CodeCraft C# completion hardening start';
const OLD_HELPER_END = '// CodeCraft C# completion hardening end';
const HELPER_START = '// CodeCraft C# contextual completion fix start';
const HELPER_END = '// CodeCraft C# contextual completion fix end';

const helperBlock = String.raw`
${HELPER_START}
const CSHARP_CONTEXTUAL_COMPLETION_FIX_VERSION = '2026-05-12-contextual-v2';

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

function csharpProtocolCompletionTriggerKind(context: monaco.languages.CompletionContext): 1 | 2 | 3 {
  return context.triggerKind === monaco.languages.CompletionTriggerKind.TriggerCharacter
    ? 2
    : context.triggerKind === monaco.languages.CompletionTriggerKind.TriggerForIncompleteCompletions
      ? 3
      : 1;
}

function csharpProtocolCompletionTriggerCharacter(
  context: monaco.languages.CompletionContext,
  triggerKind: 1 | 2 | 3
): string | undefined {
  if (triggerKind !== 2) return undefined;
  return typeof context.triggerCharacter === 'string' && context.triggerCharacter.length > 0
    ? context.triggerCharacter
    : CSHARP_COMPLETION_TRIGGER_FALLBACK;
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

function csharpCompletionIsValidRange(range: any): range is monaco.IRange {
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

function csharpCompletionItemIsUsable(item: monaco.languages.CompletionItem | null): item is monaco.languages.CompletionItem {
  if (!item) return false;
  const label = csharpCompletionOptionalString(item.label);
  return !!label && typeof item.insertText === 'string' && csharpCompletionIsValidRange(item.range);
}
${HELPER_END}
`;

const rawProvideCompletionItemsBody = String.raw`{
    const snapshot = this.createCompletionSnapshot(model, position);
    const cacheKey = this.completionCacheKey(model, position, context);
    const cached = this.completionCache.get(cacheKey);
    if (cached && this.completionWorkerStateKey === cacheKey) return this.toCompletionList(cached);

    const runtimeReady = await this.ensureLocalOmniSharpRuntime();
    if (!runtimeReady || !this.omnisharp || model.isDisposed()) {
      return this.emptyCompletionList();
    }

    const triggerKind = csharpProtocolCompletionTriggerKind(context);
    const triggerCharacter = csharpProtocolCompletionTriggerCharacter(context, triggerKind);
    const request: any = {
      Line: Math.max(0, position.lineNumber - 1),
      Column: Math.max(0, position.column - 1),
      CompletionTrigger: triggerKind,
    };
    if (triggerCharacter) request.TriggerCharacter = triggerCharacter;

    const inflight = csharpCompletionInflightFor(this);
    let entryPromise = inflight.get(cacheKey);

    if (!entryPromise) {
      const requestSerial = ++this.completionRequestSerial;
      snapshot.structuralVersion = this.completionStructuralVersion;

      entryPromise = (async (): Promise<CSharpCompletionCacheEntry | null> => {
        const response = await this.omnisharp!('GetCompletionAsync', snapshot.code, request);
        if (!response) return null;

        const isCurrentRequest = (
          requestSerial === this.completionRequestSerial &&
          !model.isDisposed() &&
          model.getVersionId() === snapshot.modelVersionId
        );
        const lateContext = isCurrentRequest ? null : this.getLateCompletionContext(model, snapshot);
        if (!isCurrentRequest && !lateContext) {
          return null;
        }

        const rawItems = csharpCompletionItemsFromResponse(response);
        const fallbackRange = lateContext?.fallbackRange ?? this.getCompletionFilterRangeAtPosition(model, position);
        const suggestions: monaco.languages.CompletionItem[] = [];
        const lspItems: any[] = [];

        for (const rawItem of rawItems) {
          const suggestion = this.convertCompletion(model, rawItem, fallbackRange, snapshot, lateContext);
          if (!csharpCompletionItemIsUsable(suggestion)) continue;
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
      return this.toCompletionList(entry);
    } catch {
      return this.emptyCompletionList();
    }
  }`;

const rawResolveCompletionItemBody = String.raw`{
    const lspItem = this.lastCompletions.get(item);
    const completionContext = this.lastCompletionContexts.get(item);
    if (!lspItem || !this.omnisharp) return item;
    try {
      const response = await this.omnisharp('GetCompletionResolveAsync', { Item: lspItem });
      if (!response) return item;
      const resolved = csharpResolvedCompletionItem(response, lspItem);
      if (!resolved) return item;
      const fallbackRange = this.toEditorRange((item.range as monaco.languages.CompletionItemRanges | undefined)?.insert ?? item.range);
      return fallbackRange && this.model && !this.model.isDisposed()
        ? this.convertCompletion(
          this.model,
          resolved,
          fallbackRange,
          completionContext?.snapshot,
          completionContext?.lateContext
        ) ?? item
        : item;
    } catch {
      return item;
    }
  }`;

const convertCompletionBody = String.raw`{
    const label = csharpCompletionLabel(item);
    if (!label) return null;

    const textEdit = csharpCompletionTextEdit(item);
    const insertText = csharpCompletionInsertText(item, label);
    const itemRange = this.toEditorRange(textEdit);
    const range = itemRange && snapshot && lateContext
      ? this.mapMainCompletionRangeToCurrent(model, itemRange, snapshot, lateContext)
      : itemRange ?? fallbackRange;

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
    throw new Error(`Target does not look like the current CodeCraft OmniSharp service. Missing: ${missing.join(', ')}`);
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

function findMethodBody(source, methodName) {
  const methodRegex = new RegExp(`\\n\\s*private\\s+(?:async\\s+)?${methodName}\\s*\\(`, 'g');
  const matches = [...source.matchAll(methodRegex)];
  if (matches.length !== 1) {
    throw new Error(`Expected exactly one private method named ${methodName}, found ${matches.length}.`);
  }
  const matchIndex = matches[0].index;
  const nameIndex = source.indexOf(methodName, matchIndex);
  const openParen = source.indexOf('(', nameIndex);
  const closeParen = findMatchingDelimiter(source, openParen, '(', ')');
  const bodyStart = source.indexOf('{', closeParen);
  if (bodyStart < 0) throw new Error(`Could not find ${methodName} body.`);
  const bodyEnd = findMatchingDelimiter(source, bodyStart, '{', '}');
  return { start: bodyStart, end: bodyEnd + 1 };
}

function replaceMethodBody(source, methodName, newBody) {
  const body = findMethodBody(source, methodName);
  return source.slice(0, body.start) + newBody + source.slice(body.end);
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
  const nextTriggers = `triggerCharacters: ['.', '(', ',', '<', '[', ' ', '#', ':']`;

  if (/triggerCharacters\s*:\s*\[[^\]]*\]/.test(providerObject)) {
    const patchedObject = providerObject.replace(/triggerCharacters\s*:\s*\[[^\]]*\]/, nextTriggers);
    return source.slice(0, objectStart) + patchedObject + source.slice(objectEnd + 1);
  }

  const patchedObject = providerObject.replace('{', `{\n        ${nextTriggers},`);
  return source.slice(0, objectStart) + patchedObject + source.slice(objectEnd + 1);
}

function patchSource(source) {
  assertTargetLooksRight(source);
  let patched = stripBlock(source, OLD_HELPER_START, OLD_HELPER_END);
  patched = stripBlock(patched, HELPER_START, HELPER_END);
  patched = insertHelperBlock(patched);
  patched = patchCompletionTriggerCharacters(patched);
  patched = replaceMethodBody(patched, 'rawProvideCompletionItems', rawProvideCompletionItemsBody);
  patched = replaceMethodBody(patched, 'rawResolveCompletionItem', rawResolveCompletionItemBody);
  patched = replaceMethodBody(patched, 'convertCompletion', convertCompletionBody);
  return patched;
}

function countOccurrences(source, needle) {
  return source.split(needle).length - 1;
}

function validatePatchedSource(source) {
  const checks = [
    ['old hardening removed', !source.includes(OLD_HELPER_START) && !source.includes('CSHARP_COMPLETION_HARDENING_VERSION')],
    ['new helper present once', countOccurrences(source, HELPER_START) === 1 && countOccurrences(source, HELPER_END) === 1],
    ['runtime warm-up retained', source.includes('await this.ensureLocalOmniSharpRuntime()')],
    ['correct convertCompletion provider call', source.includes('this.convertCompletion(model, rawItem, fallbackRange, snapshot, lateContext)')],
    ['correct convertCompletion resolve call', source.includes('this.convertCompletion(\n          this.model,\n          resolved,\n          fallbackRange,')],
    ['in-flight coalescing present', source.includes('csharpCompletionInflightFor(this)')],
    ['icons mapping present', source.includes('CSHARP_LSP_COMPLETION_KIND_TO_MONACO')],
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
    noLocalFallbackSuggestions: true,
    monacoIconKindMapping: 'LSP CompletionItemKind -> Monaco CompletionItemKind',
    runtimeWarmupPath: 'ensureLocalOmniSharpRuntime()',
    requestCoalescing: true,
    existingCompletionCacheKept: true,
  },
};

if (patched === original) {
  console.log('No changes were necessary.');
} else if (DRY_RUN) {
  console.log('Dry run passed. No files written.');
} else {
  const backupPath = `${targetPath}.contextual-completions-bak.${BACKUP_SUFFIX}`;
  fs.writeFileSync(backupPath, original, 'utf8');
  fs.writeFileSync(targetPath, patched, 'utf8');
  console.log(`Patched ${path.relative(process.cwd(), targetPath)}`);
  console.log(`Backup: ${path.relative(process.cwd(), backupPath)}`);
}

const reportPath = `${targetPath}.contextual-completions-report.json`;
if (!DRY_RUN) fs.writeFileSync(reportPath, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
if (!DRY_RUN) console.log(`Report: ${path.relative(process.cwd(), reportPath)}`);
console.log('Next: run npm run build and test C# completion at namespaces, members, type positions, attributes, and preprocessor lines.');
