import * as monaco from 'monaco-editor';

export const CODECRAFT_MONACO_THEME = 'codecraft-dark';

const JAVASCRIPT_SEMANTIC_TOKEN_TYPES = [
  'javascriptClass',
  'javascriptEnum',
  'javascriptInterface',
  'javascriptNamespace',
  'javascriptTypeParameter',
  'javascriptType',
  'javascriptParameter',
  'javascriptVariable',
  'javascriptEnumMember',
  'javascriptProperty',
  'javascriptFunction',
  'javascriptMember',
] as const;

const JAVASCRIPT_SEMANTIC_TOKEN_MODIFIERS = [
  'declaration',
  'static',
  'async',
  'readonly',
  'defaultLibrary',
  'local',
] as const;

const PYTHON_SEMANTIC_TOKEN_TYPES = [
  'pythonClass',
  'pythonFunction',
  'pythonMethod',
  'pythonParameter',
  'pythonVariable',
  'pythonProperty',
  'pythonConstant',
  'pythonModule',
  'pythonDecorator',
  'pythonBuiltinFunction',
  'pythonBuiltinType',
  'pythonMagic',
  'pythonSelf',
  'pythonTypeParameter',
  'pythonKeywordArgument',
] as const;

const PYTHON_SEMANTIC_TOKEN_MODIFIERS = [
  'declaration',
  'readonly',
  'static',
  'async',
  'defaultLibrary',
] as const;

type PythonSemanticTokenType = typeof PYTHON_SEMANTIC_TOKEN_TYPES[number];
type PythonSemanticTokenModifier = typeof PYTHON_SEMANTIC_TOKEN_MODIFIERS[number];

const tokenTypeIndex = new Map<string, number>(
  PYTHON_SEMANTIC_TOKEN_TYPES.map((type, index) => [type, index])
);

const tokenModifierMask = new Map<string, number>(
  PYTHON_SEMANTIC_TOKEN_MODIFIERS.map((modifier, index) => [modifier, 1 << index])
);

const JAVASCRIPT_SEMANTIC_LEGEND: monaco.languages.SemanticTokensLegend = {
  tokenTypes: [...JAVASCRIPT_SEMANTIC_TOKEN_TYPES],
  tokenModifiers: [...JAVASCRIPT_SEMANTIC_TOKEN_MODIFIERS],
};

const javascriptTokenTypeIndex = new Map<string, number>(
  JAVASCRIPT_SEMANTIC_TOKEN_TYPES.map((type, index) => [type, index])
);

const javascriptTokenModifierMask = new Map<string, number>(
  JAVASCRIPT_SEMANTIC_TOKEN_MODIFIERS.map((modifier, index) => [modifier, 1 << index])
);

const PYTHON_SEMANTIC_LEGEND: monaco.languages.SemanticTokensLegend = {
  tokenTypes: [...PYTHON_SEMANTIC_TOKEN_TYPES],
  tokenModifiers: [...PYTHON_SEMANTIC_TOKEN_MODIFIERS],
};

const JAVASCRIPT_KEYWORDS = new Set([
  'await', 'break', 'case', 'catch', 'class', 'const', 'continue', 'debugger',
  'default', 'delete', 'do', 'else', 'export', 'extends', 'false', 'finally',
  'for', 'from', 'function', 'get', 'if', 'import', 'in', 'instanceof', 'let',
  'new', 'null', 'of', 'return', 'set', 'static', 'super', 'switch', 'this',
  'throw', 'true', 'try', 'typeof', 'undefined', 'var', 'void', 'while', 'with',
  'yield', 'async',
]);

const PYTHON_KEYWORDS = new Set([
  'False', 'None', 'True', 'and', 'as', 'assert', 'async', 'await', 'break',
  'case', 'class', 'continue', 'def', 'del', 'elif', 'else', 'except',
  'finally', 'for', 'from', 'global', 'if', 'import', 'in', 'is', 'lambda',
  'match', 'nonlocal', 'not', 'or', 'pass', 'raise', 'return', 'try', 'type',
  'while', 'with', 'yield',
]);

const PYTHON_BUILTIN_FUNCTIONS = new Set([
  'abs', 'aiter', 'all', 'anext', 'any', 'ascii', 'bin', 'breakpoint',
  'callable', 'chr', 'compile', 'delattr', 'dir', 'divmod', 'eval', 'exec',
  'format', 'getattr', 'globals', 'hasattr', 'hash', 'hex', 'id', 'input',
  'isinstance', 'issubclass', 'iter', 'len', 'locals', 'max', 'min', 'next',
  'oct', 'open', 'ord', 'pow', 'print', 'repr', 'round', 'setattr', 'sorted',
  'sum', 'vars', '__import__',
]);

const PYTHON_BUILTIN_TYPES = new Set([
  'BaseException', 'Exception', 'ArithmeticError', 'AssertionError', 'AttributeError',
  'BlockingIOError', 'BrokenPipeError', 'BufferError', 'BytesWarning', 'ChildProcessError',
  'ConnectionAbortedError', 'ConnectionError', 'ConnectionRefusedError', 'ConnectionResetError',
  'DeprecationWarning', 'EOFError', 'EncodingWarning', 'EnvironmentError', 'FileExistsError',
  'FileNotFoundError', 'FloatingPointError', 'FutureWarning', 'GeneratorExit', 'IOError',
  'ImportError', 'ImportWarning', 'IndentationError', 'IndexError', 'InterruptedError',
  'IsADirectoryError', 'KeyError', 'KeyboardInterrupt', 'LookupError', 'MemoryError',
  'ModuleNotFoundError', 'NameError', 'NotADirectoryError', 'NotImplementedError',
  'OSError', 'OverflowError', 'PendingDeprecationWarning', 'PermissionError',
  'ProcessLookupError', 'RecursionError', 'ReferenceError', 'ResourceWarning',
  'RuntimeError', 'RuntimeWarning', 'StopAsyncIteration', 'StopIteration', 'SyntaxError',
  'SyntaxWarning', 'SystemError', 'SystemExit', 'TabError', 'TimeoutError',
  'TypeError', 'UnboundLocalError', 'UnicodeDecodeError', 'UnicodeEncodeError',
  'UnicodeError', 'UnicodeTranslateError', 'UnicodeWarning', 'UserWarning', 'ValueError',
  'Warning', 'ZeroDivisionError',
  'bool', 'bytearray', 'bytes', 'classmethod', 'complex', 'dict', 'enumerate',
  'filter', 'float', 'frozenset', 'int', 'list', 'map', 'memoryview', 'object',
  'property', 'range', 'reversed', 'set', 'slice', 'staticmethod', 'str', 'super',
  'tuple', 'type', 'zip',
]);

const PYTHON_BUILTIN_CONSTANTS = new Set([
  'Ellipsis', 'NotImplemented', '__debug__',
]);

const PYTHON_TYPING_NAMES = new Set([
  'Annotated', 'Any', 'Callable', 'ClassVar', 'Concatenate', 'Final', 'ForwardRef',
  'Generic', 'Iterable', 'Iterator', 'Literal', 'Mapping', 'Never', 'NoReturn',
  'NotRequired', 'Optional', 'ParamSpec', 'Protocol', 'Required', 'Self',
  'Sequence', 'TypeAlias', 'TypeGuard', 'TypeVar', 'TypeVarTuple', 'TypedDict',
  'Union', 'Unpack', 'cast', 'final', 'get_args', 'get_origin', 'overload',
  'runtime_checkable',
]);

const PYTHON_SELF_NAMES = new Set(['self', 'cls']);

const ASSIGNMENT_OPERATORS = new Set([
  '=', '+=', '-=', '*=', '/=', '//=', '%=', '@=', '&=', '|=', '^=', '>>=', '<<=',
  '**=', ':=',
]);

const OPENING_BRACKETS = new Set(['(', '[', '{']);
const CLOSING_BRACKETS = new Set([')', ']', '}']);

type PythonTokenKind = 'identifier' | 'keyword' | 'punct' | 'operator';

interface PythonToken {
  kind: PythonTokenKind;
  value: string;
  offset: number;
  endOffset: number;
  line: number;
  column: number;
  index: number;
}

interface SemanticMark {
  token: PythonToken;
  type: PythonSemanticTokenType;
  modifiers: PythonSemanticTokenModifier[];
  priority: number;
}

interface PythonSymbolTables {
  classes: Set<string>;
  functions: Set<string>;
  methods: Set<string>;
  parameters: Set<string>;
  variables: Set<string>;
  modules: Set<string>;
  importedTypes: Set<string>;
  typeParameters: Set<string>;
}

interface BlockContext {
  indent: number;
  kind: 'class' | 'function';
}

interface JavaScriptIdentifierToken {
  value: string;
  offset: number;
  length: number;
}

interface JavaScriptSemanticMark {
  offset: number;
  length: number;
  type: typeof JAVASCRIPT_SEMANTIC_TOKEN_TYPES[number];
  modifiers: typeof JAVASCRIPT_SEMANTIC_TOKEN_MODIFIERS[number][];
}

const semanticColoringThemeRules: monaco.editor.ITokenThemeRule[] = [
  { token: 'keyword.js', foreground: '569CD6' },
  { token: 'keyword.other.js', foreground: '569CD6' },
  { token: 'identifier.js', foreground: '9CDCFE' },
  { token: 'type.identifier.js', foreground: '4EC9B0' },
  { token: 'delimiter.js', foreground: 'DCDCDC' },
  { token: 'delimiter.bracket.js', foreground: 'DCDCDC' },
  { token: 'string.js', foreground: 'CE9178' },
  { token: 'string.escape.js', foreground: 'D7BA7D' },
  { token: 'string.escape.invalid.js', foreground: 'F44747' },
  { token: 'string.invalid.js', foreground: 'F44747' },
  { token: 'number.js', foreground: 'B5CEA8' },
  { token: 'number.float.js', foreground: 'B5CEA8' },
  { token: 'number.hex.js', foreground: 'B5CEA8' },
  { token: 'number.octal.js', foreground: 'B5CEA8' },
  { token: 'number.binary.js', foreground: 'B5CEA8' },
  { token: 'regexp.js', foreground: 'D16969' },
  { token: 'regexp.escape.js', foreground: 'D7BA7D' },
  { token: 'regexp.escape.control.js', foreground: 'D7BA7D' },
  { token: 'regexp.invalid.js', foreground: 'F44747' },
  { token: 'comment.js', foreground: '6A9955' },
  { token: 'comment.doc.js', foreground: '6A9955' },
  { token: 'javascriptClass', foreground: '4EC9B0' },
  { token: 'javascriptEnum', foreground: '4EC9B0' },
  { token: 'javascriptInterface', foreground: '4EC9B0' },
  { token: 'javascriptNamespace', foreground: '4EC9B0' },
  { token: 'javascriptTypeParameter', foreground: '4EC9B0', fontStyle: 'italic' },
  { token: 'javascriptType', foreground: '4EC9B0' },
  { token: 'javascriptParameter', foreground: '9CDCFE' },
  { token: 'javascriptVariable', foreground: '9CDCFE' },
  { token: 'javascriptVariable.defaultLibrary', foreground: '4FC1FF' },
  { token: 'javascriptEnumMember', foreground: '4FC1FF' },
  { token: 'javascriptProperty', foreground: '9CDCFE' },
  { token: 'javascriptProperty.readonly', foreground: '4FC1FF' },
  { token: 'javascriptFunction', foreground: 'DCDCAA' },
  { token: 'javascriptFunction.defaultLibrary', foreground: 'DCDCAA' },
  { token: 'javascriptMember', foreground: 'DCDCAA' },
  { token: 'javascriptMember.defaultLibrary', foreground: 'DCDCAA' },
  { token: 'keyword.python', foreground: 'C586C0' },
  { token: 'tag.python', foreground: 'DCDCAA' },
  { token: 'string.python', foreground: 'CE9178' },
  { token: 'string.escape.python', foreground: 'D7BA7D' },
  { token: 'number.python', foreground: 'B5CEA8' },
  { token: 'comment.python', foreground: '6A9955', fontStyle: 'italic' },
  { token: 'pythonClass', foreground: '4EC9B0' },
  { token: 'pythonClass.declaration', foreground: '4EC9B0', fontStyle: 'bold' },
  { token: 'pythonBuiltinType', foreground: '4EC9B0' },
  { token: 'pythonBuiltinType.defaultLibrary', foreground: '4EC9B0' },
  { token: 'pythonTypeParameter', foreground: '4EC9B0', fontStyle: 'italic' },
  { token: 'pythonFunction', foreground: 'DCDCAA' },
  { token: 'pythonFunction.declaration', foreground: 'DCDCAA', fontStyle: 'bold' },
  { token: 'pythonFunction.async', foreground: 'DCDCAA', fontStyle: 'italic' },
  { token: 'pythonMethod', foreground: 'DCDCAA' },
  { token: 'pythonMethod.declaration', foreground: 'DCDCAA', fontStyle: 'bold' },
  { token: 'pythonBuiltinFunction', foreground: 'DCDCAA' },
  { token: 'pythonBuiltinFunction.defaultLibrary', foreground: 'DCDCAA' },
  { token: 'pythonDecorator', foreground: 'DCDCAA', fontStyle: 'italic' },
  { token: 'pythonParameter', foreground: '9CDCFE' },
  { token: 'pythonParameter.declaration', foreground: '9CDCFE', fontStyle: 'italic' },
  { token: 'pythonSelf', foreground: '569CD6', fontStyle: 'italic' },
  { token: 'pythonVariable', foreground: '9CDCFE' },
  { token: 'pythonProperty', foreground: '9CDCFE' },
  { token: 'pythonKeywordArgument', foreground: '9CDCFE', fontStyle: 'italic' },
  { token: 'pythonConstant', foreground: '4FC1FF' },
  { token: 'pythonConstant.readonly', foreground: '4FC1FF' },
  { token: 'pythonModule', foreground: 'C8C8C8' },
  { token: 'pythonMagic', foreground: 'B5CEA8' },
];

let pythonColoringRegistered = false;
let javascriptColoringRegistered = false;

export function ensurePythonColoringReady() {
  if (pythonColoringRegistered) return;
  pythonColoringRegistered = true;

  monaco.editor.defineTheme(CODECRAFT_MONACO_THEME, {
    base: 'vs-dark',
    inherit: true,
    rules: semanticColoringThemeRules,
    colors: {},
  });

  monaco.languages.registerDocumentSemanticTokensProvider('python', {
    getLegend: () => PYTHON_SEMANTIC_LEGEND,
    provideDocumentSemanticTokens(model, _lastResultId, cancellationToken) {
      if (cancellationToken.isCancellationRequested) return null;
      return { data: buildPythonSemanticTokens(model.getValue()) };
    },
    releaseDocumentSemanticTokens() {},
  });
}

export function ensureJavaScriptColoringReady() {
  if (javascriptColoringRegistered) return;
  javascriptColoringRegistered = true;

  monaco.languages.registerDocumentSemanticTokensProvider('javascript', {
    getLegend: () => JAVASCRIPT_SEMANTIC_LEGEND,
    async provideDocumentSemanticTokens(model, _lastResultId, cancellationToken) {
      if (cancellationToken.isCancellationRequested) return null;

      try {
        const workerFactory = await monaco.languages.typescript.getJavaScriptWorker();
        if (cancellationToken.isCancellationRequested || model.isDisposed()) return null;

        const worker = await workerFactory(model.uri) as JavaScriptSemanticWorker;
        if (cancellationToken.isCancellationRequested || model.isDisposed()) return null;

        return {
          data: await buildJavaScriptSemanticTokensFromQuickInfo(model, worker, cancellationToken),
        };
      } catch {
        return { data: new Uint32Array() };
      }
    },
    releaseDocumentSemanticTokens() {},
  });
}

interface JavaScriptSemanticWorker {
  getQuickInfoAtPosition?: (fileName: string, position: number) => Promise<{
    kind?: string;
    kindModifiers?: string;
  } | undefined>;
}

async function buildJavaScriptSemanticTokensFromQuickInfo(
  model: monaco.editor.ITextModel,
  worker: JavaScriptSemanticWorker,
  cancellationToken: monaco.CancellationToken
): Promise<Uint32Array> {
  if (typeof worker.getQuickInfoAtPosition !== 'function') return new Uint32Array();

  const source = model.getValue();
  const fileName = model.uri.toString();
  const identifiers = collectJavaScriptIdentifierTokens(source);
  const marks: JavaScriptSemanticMark[] = [];
  const batchSize = 48;

  for (let index = 0; index < identifiers.length; index += batchSize) {
    if (cancellationToken.isCancellationRequested || model.isDisposed()) return new Uint32Array();

    const batch = identifiers.slice(index, index + batchSize);
    const infos = await Promise.all(batch.map(async token => {
      try {
        return await worker.getQuickInfoAtPosition?.(fileName, token.offset);
      } catch {
        return undefined;
      }
    }));

    for (let batchIndex = 0; batchIndex < batch.length; batchIndex += 1) {
      const mark = classifyJavaScriptQuickInfo(batch[batchIndex], infos[batchIndex], source);
      if (mark) marks.push(mark);
    }
  }

  return encodeJavaScriptSemanticMarks(model, marks);
}

function collectJavaScriptIdentifierTokens(source: string): JavaScriptIdentifierToken[] {
  return scanJavaScriptIdentifierRange(source, 0, source.length, false).tokens;
}

function scanJavaScriptIdentifierRange(
  source: string,
  start: number,
  end: number,
  stopAtClosingBrace: boolean
): { tokens: JavaScriptIdentifierToken[]; offset: number } {
  const tokens: JavaScriptIdentifierToken[] = [];
  let offset = start;

  while (offset < end) {
    const char = source[offset];
    const next = source[offset + 1];

    if (stopAtClosingBrace && char === '}') break;

    if (char === '/' && next === '/') {
      offset = skipJavaScriptLineComment(source, offset + 2, end);
      continue;
    }
    if (char === '/' && next === '*') {
      offset = skipJavaScriptBlockComment(source, offset + 2, end);
      continue;
    }
    if (char === '"' || char === "'") {
      offset = skipJavaScriptQuotedString(source, offset + 1, end, char);
      continue;
    }
    if (char === '`') {
      const template = scanJavaScriptTemplate(source, offset + 1, end);
      tokens.push(...template.tokens);
      offset = template.offset;
      continue;
    }
    if (char === '{') {
      const nested = scanJavaScriptIdentifierRange(source, offset + 1, end, true);
      tokens.push(...nested.tokens);
      offset = source[nested.offset] === '}' ? nested.offset + 1 : nested.offset;
      continue;
    }

    if (isJavaScriptIdentifierStart(source, offset)) {
      const tokenStart = offset;
      offset = advanceCodePoint(source, offset);
      while (offset < end && isJavaScriptIdentifierPart(source, offset)) {
        offset = advanceCodePoint(source, offset);
      }

      const value = source.slice(tokenStart, offset);
      if (!JAVASCRIPT_KEYWORDS.has(value)) {
        tokens.push({ value, offset: tokenStart, length: offset - tokenStart });
      }
      continue;
    }

    offset = advanceCodePoint(source, offset);
  }

  return { tokens, offset };
}

function scanJavaScriptTemplate(
  source: string,
  start: number,
  end: number
): { tokens: JavaScriptIdentifierToken[]; offset: number } {
  const tokens: JavaScriptIdentifierToken[] = [];
  let offset = start;

  while (offset < end) {
    const char = source[offset];
    if (char === '\\') {
      offset = Math.min(end, offset + 2);
      continue;
    }
    if (char === '`') {
      return { tokens, offset: offset + 1 };
    }
    if (char === '$' && source[offset + 1] === '{') {
      const expression = scanJavaScriptIdentifierRange(source, offset + 2, end, true);
      tokens.push(...expression.tokens);
      offset = source[expression.offset] === '}' ? expression.offset + 1 : expression.offset;
      continue;
    }
    offset = advanceCodePoint(source, offset);
  }

  return { tokens, offset };
}

function skipJavaScriptLineComment(source: string, offset: number, end: number) {
  while (offset < end && source[offset] !== '\n' && source[offset] !== '\r') offset += 1;
  return offset;
}

function skipJavaScriptBlockComment(source: string, offset: number, end: number) {
  while (offset < end) {
    if (source[offset] === '*' && source[offset + 1] === '/') return offset + 2;
    offset += 1;
  }
  return offset;
}

function skipJavaScriptQuotedString(source: string, offset: number, end: number, quote: string) {
  while (offset < end) {
    const char = source[offset];
    if (char === '\\') {
      offset = Math.min(end, offset + 2);
      continue;
    }
    if (char === quote) return offset + 1;
    offset = advanceCodePoint(source, offset);
  }
  return offset;
}

function isJavaScriptIdentifierStart(source: string, offset: number) {
  const char = String.fromCodePoint(source.codePointAt(offset) || 0);
  return char === '$' || char === '_' || /\p{ID_Start}/u.test(char);
}

function isJavaScriptIdentifierPart(source: string, offset: number) {
  const char = String.fromCodePoint(source.codePointAt(offset) || 0);
  return char === '$'
    || char === '_'
    || char === '\u200C'
    || char === '\u200D'
    || /\p{ID_Continue}/u.test(char);
}

function advanceCodePoint(source: string, offset: number) {
  const codePoint = source.codePointAt(offset);
  return offset + (codePoint && codePoint > 0xFFFF ? 2 : 1);
}

function classifyJavaScriptQuickInfo(
  token: JavaScriptIdentifierToken,
  info: { kind?: string; kindModifiers?: string } | undefined,
  source: string
): JavaScriptSemanticMark | null {
  if (!info?.kind) return null;

  const modifiers = getJavaScriptQuickInfoModifiers(info.kindModifiers || '', token, source);

  switch (info.kind) {
    case 'class':
      return { ...token, type: 'javascriptClass', modifiers };
    case 'enum':
      return { ...token, type: 'javascriptEnum', modifiers };
    case 'interface':
      return { ...token, type: 'javascriptInterface', modifiers };
    case 'module':
      return { ...token, type: 'javascriptNamespace', modifiers };
    case 'type parameter':
      return { ...token, type: 'javascriptTypeParameter', modifiers };
    case 'type':
      return { ...token, type: 'javascriptType', modifiers };
    case 'parameter':
      return { ...token, type: 'javascriptParameter', modifiers };
    case 'property':
    case 'getter':
    case 'setter':
      return { ...token, type: 'javascriptProperty', modifiers };
    case 'method':
      return { ...token, type: 'javascriptMember', modifiers };
    case 'function':
    case 'local function':
      return { ...token, type: 'javascriptFunction', modifiers };
    case 'const':
      return { ...token, type: 'javascriptVariable', modifiers: addJavaScriptModifier(modifiers, 'readonly') };
    case 'let':
    case 'var':
    case 'local var':
    case 'alias':
      return { ...token, type: 'javascriptVariable', modifiers };
    default:
      return null;
  }
}

function getJavaScriptQuickInfoModifiers(
  kindModifiers: string,
  token: JavaScriptIdentifierToken,
  source: string
): JavaScriptSemanticMark['modifiers'] {
  let modifiers: JavaScriptSemanticMark['modifiers'] = [];
  const modifierSet = new Set(kindModifiers.split(/,|\s+/).filter(Boolean));

  if (modifierSet.has('static')) modifiers = addJavaScriptModifier(modifiers, 'static');
  if (modifierSet.has('async')) modifiers = addJavaScriptModifier(modifiers, 'async');
  if (modifierSet.has('readonly')) modifiers = addJavaScriptModifier(modifiers, 'readonly');
  if (modifierSet.has('declare')) modifiers = addJavaScriptModifier(modifiers, 'declaration');
  if (isLikelyJavaScriptDeclaration(token, source)) modifiers = addJavaScriptModifier(modifiers, 'declaration');

  return modifiers;
}

function addJavaScriptModifier(
  modifiers: JavaScriptSemanticMark['modifiers'],
  modifier: typeof JAVASCRIPT_SEMANTIC_TOKEN_MODIFIERS[number]
) {
  return modifiers.includes(modifier) ? modifiers : [...modifiers, modifier];
}

function isLikelyJavaScriptDeclaration(token: JavaScriptIdentifierToken, source: string) {
  const before = source.slice(Math.max(0, token.offset - 32), token.offset);
  return /\b(class|function|const|let|var)\s+$/.test(before)
    || /\b(async\s+function|static)\s+$/.test(before)
    || /[,(]\s*$/.test(before) && /\)\s*=>/.test(source.slice(token.offset + token.length, token.offset + token.length + 32));
}

function encodeJavaScriptSemanticTokens(model: monaco.editor.ITextModel, spans: ArrayLike<number>): Uint32Array {
  const absoluteTokens: Array<{
    line: number;
    column: number;
    length: number;
    tokenTypeIndex: number;
    tokenModifierSet: number;
  }> = [];

  for (let index = 0; index + 2 < spans.length; index += 3) {
    const start = spans[index];
    const length = spans[index + 1];
    const encodedClassification = spans[index + 2];
    const tokenTypeIndex = (encodedClassification >> 8) - 1;
    const tokenModifierSet = encodedClassification & 0xFF;

    if (!Number.isFinite(start) || !Number.isFinite(length) || length <= 0) continue;
    if (tokenTypeIndex < 0 || tokenTypeIndex >= JAVASCRIPT_SEMANTIC_TOKEN_TYPES.length) continue;

    const startPosition = model.getPositionAt(start);
    const endPosition = model.getPositionAt(start + length);
    if (startPosition.lineNumber !== endPosition.lineNumber) continue;

    absoluteTokens.push({
      line: startPosition.lineNumber - 1,
      column: startPosition.column - 1,
      length,
      tokenTypeIndex,
      tokenModifierSet,
    });
  }

  absoluteTokens.sort((a, b) => a.line - b.line || a.column - b.column || a.length - b.length);

  const data: number[] = [];
  let previousLine = 0;
  let previousColumn = 0;

  for (const token of absoluteTokens) {
    const deltaLine = token.line - previousLine;
    const deltaColumn = deltaLine === 0 ? token.column - previousColumn : token.column;
    if (deltaLine < 0 || deltaColumn < 0) continue;

    data.push(deltaLine, deltaColumn, token.length, token.tokenTypeIndex, token.tokenModifierSet);
    previousLine = token.line;
    previousColumn = token.column;
  }

  return new Uint32Array(data);
}

function encodeJavaScriptSemanticMarks(
  model: monaco.editor.ITextModel,
  marks: JavaScriptSemanticMark[]
): Uint32Array {
  const spans: number[] = [];

  for (const mark of marks) {
    const tokenTypeIndex = javascriptTokenTypeIndex.get(mark.type);
    if (typeof tokenTypeIndex !== 'number') continue;

    const modifierSet = mark.modifiers.reduce(
      (mask, modifier) => mask | (javascriptTokenModifierMask.get(modifier) || 0),
      0
    );
    spans.push(mark.offset, mark.length, ((tokenTypeIndex + 1) << 8) + modifierSet);
  }

  return encodeJavaScriptSemanticTokens(model, spans);
}

function buildPythonSemanticTokens(source: string): Uint32Array {
  const tokens = tokenizePython(source);
  if (tokens.length === 0) return new Uint32Array();

  const marks = new Map<number, SemanticMark>();
  const symbols: PythonSymbolTables = {
    classes: new Set(),
    functions: new Set(),
    methods: new Set(),
    parameters: new Set(),
    variables: new Set(),
    modules: new Set(),
    importedTypes: new Set(),
    typeParameters: new Set(),
  };

  const lines = groupTokensByLine(tokens);

  collectStructuralMarks(tokens, lines, marks, symbols);
  collectAssignmentMarks(tokens, lines, marks, symbols);
  collectAnnotationMarks(tokens, marks, symbols);
  collectUsageMarks(tokens, marks, symbols);

  return encodeSemanticTokens([...marks.values()]);
}

function tokenizePython(source: string): PythonToken[] {
  const tokens: PythonToken[] = [];
  let offset = 0;
  let line = 0;
  let column = 0;

  const pushToken = (kind: PythonTokenKind, value: string, startOffset: number, startLine: number, startColumn: number) => {
    tokens.push({
      kind,
      value,
      offset: startOffset,
      endOffset: offset,
      line: startLine,
      column: startColumn,
      index: tokens.length,
    });
  };

  const advance = () => {
    if (source[offset] === '\r' && source[offset + 1] === '\n') {
      offset += 2;
      line += 1;
      column = 0;
      return;
    }
    if (source[offset] === '\n' || source[offset] === '\r') {
      offset += 1;
      line += 1;
      column = 0;
      return;
    }
    offset += 1;
    column += 1;
  };

  const advanceTo = (targetOffset: number) => {
    while (offset < targetOffset) advance();
  };

  while (offset < source.length) {
    const ch = source[offset];

    if (ch === ' ' || ch === '\t' || ch === '\v' || ch === '\f' || ch === '\n' || ch === '\r') {
      advance();
      continue;
    }

    if (ch === '#') {
      while (offset < source.length && source[offset] !== '\n' && source[offset] !== '\r') advance();
      continue;
    }

    const stringStart = getStringStart(source, offset);
    if (stringStart) {
      advanceTo(scanStringEnd(source, offset, stringStart));
      continue;
    }

    if (isIdentifierStart(ch)) {
      const startOffset = offset;
      const startLine = line;
      const startColumn = column;
      advance();
      while (offset < source.length && isIdentifierPart(source[offset])) advance();
      const value = source.slice(startOffset, offset);
      pushToken(PYTHON_KEYWORDS.has(value) ? 'keyword' : 'identifier', value, startOffset, startLine, startColumn);
      continue;
    }

    if (/\d/.test(ch)) {
      advanceNumber(source, () => offset, advance);
      continue;
    }

    const startOffset = offset;
    const startLine = line;
    const startColumn = column;
    const op = readOperator(source, offset);
    if (op) {
      advanceTo(offset + op.length);
      pushToken('operator', op, startOffset, startLine, startColumn);
      continue;
    }

    advance();
    pushToken('punct', ch, startOffset, startLine, startColumn);
  }

  return tokens;
}

function collectStructuralMarks(
  tokens: PythonToken[],
  lines: Map<number, PythonToken[]>,
  marks: Map<number, SemanticMark>,
  symbols: PythonSymbolTables
) {
  const blockStack: BlockContext[] = [];

  for (const lineNumber of [...lines.keys()].sort((left, right) => left - right)) {
    const lineTokens = lines.get(lineNumber)!;
    if (lineTokens.length === 0) continue;

    const indent = lineTokens[0].column;
    while (blockStack.length > 0 && indent <= blockStack[blockStack.length - 1].indent) {
      blockStack.pop();
    }

    const classKeyword = lineTokens.find(token => token.value === 'class');
    const defKeyword = lineTokens.find(token => token.value === 'def');
    const asyncDef = defKeyword ? previousToken(tokens, defKeyword.index)?.value === 'async' : false;

    if (classKeyword) {
      const name = nextIdentifier(tokens, classKeyword.index);
      if (name) {
        symbols.classes.add(name.value);
        markToken(marks, name, 'pythonClass', ['declaration'], 100);
        markClassBases(tokens, name.index, marks, symbols);
      }
      blockStack.push({ indent, kind: 'class' });
      continue;
    }

    if (defKeyword) {
      const name = nextIdentifier(tokens, defKeyword.index);
      if (name) {
        const isMethod = blockStack.some(context => context.kind === 'class');
        const type: PythonSemanticTokenType = isMethod ? 'pythonMethod' : 'pythonFunction';
        const modifiers: PythonSemanticTokenModifier[] = asyncDef ? ['declaration', 'async'] : ['declaration'];

        if (isMethod) symbols.methods.add(name.value);
        else symbols.functions.add(name.value);

        markToken(marks, name, type, modifiers, 100);
        markFunctionParameters(tokens, name.index, marks, symbols);
        markFunctionReturnAnnotation(tokens, name.index, marks, symbols);
      }
      blockStack.push({ indent, kind: 'function' });
    }
  }
}

function collectAssignmentMarks(
  tokens: PythonToken[],
  lines: Map<number, PythonToken[]>,
  marks: Map<number, SemanticMark>,
  symbols: PythonSymbolTables
) {
  for (const lineTokens of lines.values()) {
    collectImportMarks(tokens, lineTokens, marks, symbols);
    collectForTargetMarks(lineTokens, marks, symbols);
    collectWithAndExceptMarks(lineTokens, marks, symbols);
    collectKeywordArgumentMarks(lineTokens, marks);

    for (let index = 0; index < lineTokens.length; index += 1) {
      const token = lineTokens[index];
      if (!ASSIGNMENT_OPERATORS.has(token.value)) continue;

      if (token.value === ':=') {
        const target = previousIdentifierInLine(lineTokens, index);
        if (target) markAssignmentTarget(target, lineTokens, marks, symbols);
        continue;
      }

      const segmentStart = findAssignmentSegmentStart(lineTokens, index);
      for (let targetIndex = segmentStart; targetIndex < index; targetIndex += 1) {
        const target = lineTokens[targetIndex];
        if (target.kind !== 'identifier') continue;
        if (target.value === '_') continue;

        const previous = lineTokens[targetIndex - 1];
        const next = lineTokens[targetIndex + 1];
        if (next?.value === '(') continue;
        if (previous?.value === '.') {
          markToken(marks, target, 'pythonProperty', ['declaration'], 90);
          continue;
        }
        if (previous?.value === 'as') continue;
        if (target.value.length === 1 && target.value === target.value.toUpperCase()) {
          symbols.typeParameters.add(target.value);
          markToken(marks, target, 'pythonTypeParameter', ['declaration'], 95);
          continue;
        }
        markAssignmentTarget(target, lineTokens, marks, symbols);
      }
    }
  }
}

function collectAnnotationMarks(
  tokens: PythonToken[],
  marks: Map<number, SemanticMark>,
  symbols: PythonSymbolTables
) {
  for (let index = 0; index < tokens.length; index += 1) {
    const token = tokens[index];
    if (token.value === ':' && isTypeAnnotationColon(tokens, index)) {
      markTypeExpression(tokens, index + 1, findAnnotationEnd(tokens, index + 1), marks, symbols);
    }
    if (token.value === '->') {
      markTypeExpression(tokens, index + 1, findReturnAnnotationEnd(tokens, index + 1), marks, symbols);
    }
  }
}

function collectUsageMarks(
  tokens: PythonToken[],
  marks: Map<number, SemanticMark>,
  symbols: PythonSymbolTables
) {
  for (const token of tokens) {
    if (token.kind !== 'identifier' || marks.has(token.offset)) continue;

    const previous = previousToken(tokens, token.index);
    const next = nextToken(tokens, token.index);

    if (previous?.value === '@') {
      markToken(marks, token, 'pythonDecorator', [], 85);
      continue;
    }

    if (previous?.value === '.') {
      if (isMagicName(token.value)) markToken(marks, token, 'pythonMagic', [], 85);
      else markToken(marks, token, next?.value === '(' ? 'pythonMethod' : 'pythonProperty', [], 70);
      continue;
    }

    if (isMagicName(token.value)) {
      markToken(marks, token, 'pythonMagic', [], 70);
      continue;
    }

    if (PYTHON_SELF_NAMES.has(token.value)) {
      markToken(marks, token, 'pythonSelf', [], 80);
      continue;
    }

    if (symbols.parameters.has(token.value)) {
      markToken(marks, token, 'pythonParameter', [], 65);
      continue;
    }

    if (symbols.typeParameters.has(token.value)) {
      markToken(marks, token, 'pythonTypeParameter', [], 75);
      continue;
    }

    if (PYTHON_BUILTIN_CONSTANTS.has(token.value)) {
      markToken(marks, token, 'pythonConstant', ['readonly', 'defaultLibrary'], 80);
      continue;
    }

    if (symbols.modules.has(token.value)) {
      markToken(marks, token, 'pythonModule', [], 70);
      continue;
    }

    if (symbols.classes.has(token.value) || symbols.importedTypes.has(token.value)) {
      markToken(marks, token, 'pythonClass', [], 70);
      continue;
    }

    if (PYTHON_BUILTIN_TYPES.has(token.value) || PYTHON_TYPING_NAMES.has(token.value)) {
      markToken(marks, token, 'pythonBuiltinType', ['defaultLibrary'], 75);
      continue;
    }

    if (PYTHON_BUILTIN_FUNCTIONS.has(token.value)) {
      markToken(marks, token, 'pythonBuiltinFunction', ['defaultLibrary'], 75);
      continue;
    }

    if (next?.value === '(') {
      markToken(marks, token, startsLikeType(token.value) ? 'pythonClass' : 'pythonFunction', [], 70);
      continue;
    }

    if (startsLikeConstant(token.value)) {
      markToken(marks, token, 'pythonConstant', ['readonly'], 60);
      continue;
    }

    if (startsLikeType(token.value)) {
      markToken(marks, token, 'pythonClass', [], 55);
      continue;
    }

    markToken(marks, token, 'pythonVariable', [], 40);
  }
}

function collectImportMarks(
  tokens: PythonToken[],
  lineTokens: PythonToken[],
  marks: Map<number, SemanticMark>,
  symbols: PythonSymbolTables
) {
  if (lineTokens[0]?.value === 'import') {
    for (let index = 1; index < lineTokens.length; index += 1) {
      const token = lineTokens[index];
      if (token.kind !== 'identifier') continue;

      if (lineTokens[index - 1]?.value === 'as') {
        symbols.modules.add(token.value);
        markToken(marks, token, 'pythonModule', ['declaration'], 90);
        continue;
      }

      symbols.modules.add(token.value);
      markToken(marks, token, 'pythonModule', [], 75);
    }
    return;
  }

  if (lineTokens[0]?.value !== 'from') return;

  let importIndex = lineTokens.findIndex(token => token.value === 'import');
  if (importIndex < 0) importIndex = lineTokens.length;

  for (let index = 1; index < importIndex; index += 1) {
    const token = lineTokens[index];
    if (token.kind !== 'identifier') continue;
    symbols.modules.add(token.value);
    markToken(marks, token, 'pythonModule', [], 75);
  }

  for (let index = importIndex + 1; index < lineTokens.length; index += 1) {
    const token = lineTokens[index];
    if (token.kind !== 'identifier') continue;

    if (lineTokens[index - 1]?.value === 'as') {
      const aliased = previousIdentifierInLine(lineTokens, index - 1);
      const semanticType = guessImportedBindingType(aliased?.value || token.value);
      rememberImportedBinding(symbols, token.value, semanticType);
      markToken(marks, token, semanticType, ['declaration'], 90);
      continue;
    }

    if (lineTokens[index + 1]?.value === 'as') {
      const semanticType = guessImportedBindingType(token.value);
      rememberImportedBinding(symbols, token.value, semanticType);
      markToken(marks, token, semanticType, [], 75);
      continue;
    }

    const semanticType = guessImportedBindingType(token.value);
    rememberImportedBinding(symbols, token.value, semanticType);
    markToken(marks, token, semanticType, ['declaration'], 85);
  }

  const fromModule = lineTokens.slice(1, importIndex).filter(token => token.kind === 'identifier').map(token => token.value).join('.');
  if (fromModule === 'typing' || fromModule === 'typing_extensions') {
    for (let index = importIndex + 1; index < lineTokens.length; index += 1) {
      const token = lineTokens[index];
      if (token.kind === 'identifier' && PYTHON_TYPING_NAMES.has(token.value)) {
        markToken(marks, token, 'pythonBuiltinType', ['defaultLibrary'], 95);
      }
    }
  }
}

function collectForTargetMarks(
  lineTokens: PythonToken[],
  marks: Map<number, SemanticMark>,
  symbols: PythonSymbolTables
) {
  const forIndex = lineTokens.findIndex(token => token.value === 'for');
  if (forIndex < 0) return;
  const inIndex = lineTokens.findIndex((token, index) => index > forIndex && token.value === 'in');
  if (inIndex < 0) return;

  for (let index = forIndex + 1; index < inIndex; index += 1) {
    const token = lineTokens[index];
    if (token.kind === 'identifier' && token.value !== '_') {
      markAssignmentTarget(token, lineTokens, marks, symbols);
    }
  }
}

function collectWithAndExceptMarks(
  lineTokens: PythonToken[],
  marks: Map<number, SemanticMark>,
  symbols: PythonSymbolTables
) {
  for (let index = 0; index < lineTokens.length; index += 1) {
    const token = lineTokens[index];
    if (token.value === 'except') {
      for (let cursor = index + 1; cursor < lineTokens.length; cursor += 1) {
        const current = lineTokens[cursor];
        if (current.value === 'as') {
          const alias = nextIdentifierInLine(lineTokens, cursor);
          if (alias) markAssignmentTarget(alias, lineTokens, marks, symbols);
          break;
        }
        if (current.kind === 'identifier') {
          markToken(marks, current, PYTHON_BUILTIN_TYPES.has(current.value) ? 'pythonBuiltinType' : 'pythonClass', PYTHON_BUILTIN_TYPES.has(current.value) ? ['defaultLibrary'] : [], 80);
        }
      }
    }

    if (token.value === 'as' && lineTokens[index - 1]?.value !== 'import') {
      const alias = nextIdentifierInLine(lineTokens, index);
      if (alias) markAssignmentTarget(alias, lineTokens, marks, symbols);
    }
  }
}

function collectKeywordArgumentMarks(lineTokens: PythonToken[], marks: Map<number, SemanticMark>) {
  for (let index = 0; index < lineTokens.length - 1; index += 1) {
    const token = lineTokens[index];
    if (token.kind !== 'identifier') continue;
    if (lineTokens[index + 1]?.value !== '=') continue;
    const previous = lineTokens[index - 1];
    if (previous?.value === '.' || previous?.value === 'def' || previous?.value === 'class') continue;

    const call = findEnclosingCallToken(lineTokens, index);
    if (call) {
      markToken(marks, token, 'pythonKeywordArgument', [], 82);
    }
  }
}

function markAssignmentTarget(
  token: PythonToken,
  lineTokens: PythonToken[],
  marks: Map<number, SemanticMark>,
  symbols: PythonSymbolTables
) {
  if (PYTHON_SELF_NAMES.has(token.value)) {
    markToken(marks, token, 'pythonSelf', ['declaration'], 90);
    return;
  }
  if (startsLikeConstant(token.value)) {
    symbols.variables.add(token.value);
    markToken(marks, token, 'pythonConstant', ['declaration', 'readonly'], 85);
    return;
  }
  if (isTypeParameterAssignment(token, lineTokens)) {
    symbols.typeParameters.add(token.value);
    markToken(marks, token, 'pythonTypeParameter', ['declaration'], 95);
    return;
  }
  symbols.variables.add(token.value);
  markToken(marks, token, 'pythonVariable', ['declaration'], 70);
}

function markFunctionParameters(
  tokens: PythonToken[],
  functionNameIndex: number,
  marks: Map<number, SemanticMark>,
  symbols: PythonSymbolTables
) {
  const open = nextToken(tokens, functionNameIndex);
  if (!open || open.value !== '(') return;
  const closeIndex = findMatchingBracket(tokens, open.index);
  if (closeIndex < 0) return;

  let depth = 0;
  let expectingName = true;
  let inAnnotation = false;
  let inDefault = false;

  for (let index = open.index + 1; index < closeIndex; index += 1) {
    const token = tokens[index];

    if (OPENING_BRACKETS.has(token.value)) depth += 1;
    else if (CLOSING_BRACKETS.has(token.value)) depth = Math.max(0, depth - 1);

    if (depth === 0 && token.value === ',') {
      expectingName = true;
      inAnnotation = false;
      inDefault = false;
      continue;
    }

    if (depth === 0 && token.value === ':') {
      inAnnotation = true;
      expectingName = false;
      continue;
    }

    if (depth === 0 && token.value === '=') {
      inDefault = true;
      expectingName = false;
      continue;
    }

    if (token.kind !== 'identifier') continue;

    if (depth === 0 && expectingName && !inAnnotation && !inDefault) {
      symbols.parameters.add(token.value);
      markToken(marks, token, PYTHON_SELF_NAMES.has(token.value) ? 'pythonSelf' : 'pythonParameter', ['declaration'], 95);
      expectingName = false;
      continue;
    }

    if (inAnnotation) {
      markTypeToken(token, marks, symbols);
    }
  }
}

function markFunctionReturnAnnotation(
  tokens: PythonToken[],
  functionNameIndex: number,
  marks: Map<number, SemanticMark>,
  symbols: PythonSymbolTables
) {
  const open = nextToken(tokens, functionNameIndex);
  if (!open || open.value !== '(') return;
  const closeIndex = findMatchingBracket(tokens, open.index);
  if (closeIndex < 0) return;
  const arrow = nextToken(tokens, closeIndex);
  if (arrow?.value === '->') {
    markTypeExpression(tokens, arrow.index + 1, findReturnAnnotationEnd(tokens, arrow.index + 1), marks, symbols);
  }
}

function markClassBases(
  tokens: PythonToken[],
  classNameIndex: number,
  marks: Map<number, SemanticMark>,
  symbols: PythonSymbolTables
) {
  const open = nextToken(tokens, classNameIndex);
  if (!open || open.value !== '(') return;
  const closeIndex = findMatchingBracket(tokens, open.index);
  if (closeIndex < 0) return;
  markTypeExpression(tokens, open.index + 1, closeIndex, marks, symbols);
}

function markTypeExpression(
  tokens: PythonToken[],
  startIndex: number,
  endIndex: number,
  marks: Map<number, SemanticMark>,
  symbols: PythonSymbolTables
) {
  for (let index = startIndex; index < endIndex; index += 1) {
    const token = tokens[index];
    if (token.kind !== 'identifier') continue;
    if (token.value === 'None' || token.value === 'True' || token.value === 'False') continue;
    if (previousToken(tokens, token.index)?.value === '.') {
      markToken(marks, token, startsLikeType(token.value) ? 'pythonClass' : 'pythonProperty', [], 72);
      continue;
    }
    markTypeToken(token, marks, symbols);
  }
}

function markTypeToken(token: PythonToken, marks: Map<number, SemanticMark>, symbols: PythonSymbolTables) {
  if (symbols.typeParameters.has(token.value)) {
    markToken(marks, token, 'pythonTypeParameter', [], 85);
    return;
  }
  if (PYTHON_BUILTIN_TYPES.has(token.value) || PYTHON_TYPING_NAMES.has(token.value)) {
    markToken(marks, token, 'pythonBuiltinType', ['defaultLibrary'], 85);
    return;
  }
  if (symbols.modules.has(token.value)) {
    markToken(marks, token, 'pythonModule', [], 80);
    return;
  }
  markToken(marks, token, startsLikeType(token.value) ? 'pythonClass' : 'pythonVariable', [], startsLikeType(token.value) ? 80 : 55);
}

function markToken(
  marks: Map<number, SemanticMark>,
  token: PythonToken,
  type: PythonSemanticTokenType,
  modifiers: PythonSemanticTokenModifier[],
  priority: number
) {
  const existing = marks.get(token.offset);
  if (existing && existing.priority > priority) return;
  marks.set(token.offset, { token, type, modifiers, priority });
}

function encodeSemanticTokens(marks: SemanticMark[]): Uint32Array {
  const sorted = marks
    .filter(mark => mark.token.endOffset > mark.token.offset)
    .sort((left, right) => left.token.line - right.token.line || left.token.column - right.token.column || left.token.offset - right.token.offset);

  const data: number[] = [];
  let previousLine = 0;
  let previousStart = 0;

  for (const mark of sorted) {
    const type = tokenTypeIndex.get(mark.type);
    if (type === undefined) continue;

    let modifierBits = 0;
    for (const modifier of mark.modifiers) {
      modifierBits |= tokenModifierMask.get(modifier) ?? 0;
    }

    const lineDelta = mark.token.line - previousLine;
    const startDelta = lineDelta === 0 ? mark.token.column - previousStart : mark.token.column;
    data.push(lineDelta, startDelta, mark.token.endOffset - mark.token.offset, type, modifierBits);

    previousLine = mark.token.line;
    previousStart = mark.token.column;
  }

  return new Uint32Array(data);
}

function groupTokensByLine(tokens: PythonToken[]): Map<number, PythonToken[]> {
  const lines = new Map<number, PythonToken[]>();
  for (const token of tokens) {
    const lineTokens = lines.get(token.line);
    if (lineTokens) lineTokens.push(token);
    else lines.set(token.line, [token]);
  }
  return lines;
}

function nextToken(tokens: PythonToken[], index: number): PythonToken | undefined {
  return tokens[index + 1];
}

function previousToken(tokens: PythonToken[], index: number): PythonToken | undefined {
  return tokens[index - 1];
}

function nextIdentifier(tokens: PythonToken[], index: number): PythonToken | undefined {
  for (let cursor = index + 1; cursor < tokens.length; cursor += 1) {
    if (tokens[cursor].kind === 'identifier') return tokens[cursor];
    if (tokens[cursor].line !== tokens[index].line && tokens[index].value !== 'def' && tokens[index].value !== 'class') return undefined;
  }
  return undefined;
}

function nextIdentifierInLine(lineTokens: PythonToken[], index: number): PythonToken | undefined {
  for (let cursor = index + 1; cursor < lineTokens.length; cursor += 1) {
    if (lineTokens[cursor].kind === 'identifier') return lineTokens[cursor];
  }
  return undefined;
}

function previousIdentifierInLine(lineTokens: PythonToken[], index: number): PythonToken | undefined {
  for (let cursor = index - 1; cursor >= 0; cursor -= 1) {
    if (lineTokens[cursor].kind === 'identifier') return lineTokens[cursor];
  }
  return undefined;
}

function findMatchingBracket(tokens: PythonToken[], openIndex: number): number {
  const open = tokens[openIndex]?.value;
  const close = open === '(' ? ')' : open === '[' ? ']' : open === '{' ? '}' : '';
  if (!close) return -1;

  let depth = 0;
  for (let index = openIndex; index < tokens.length; index += 1) {
    if (tokens[index].value === open) depth += 1;
    if (tokens[index].value === close) {
      depth -= 1;
      if (depth === 0) return index;
    }
  }
  return -1;
}

function findAnnotationEnd(tokens: PythonToken[], startIndex: number): number {
  let depth = 0;
  for (let index = startIndex; index < tokens.length; index += 1) {
    const token = tokens[index];
    if (OPENING_BRACKETS.has(token.value)) depth += 1;
    else if (CLOSING_BRACKETS.has(token.value)) depth = Math.max(0, depth - 1);
    if (depth === 0 && (token.value === '=' || token.value === ',' || token.value === ';')) return index;
    if (depth === 0 && token.line !== tokens[startIndex]?.line) return index;
  }
  return tokens.length;
}

function findReturnAnnotationEnd(tokens: PythonToken[], startIndex: number): number {
  let depth = 0;
  for (let index = startIndex; index < tokens.length; index += 1) {
    const token = tokens[index];
    if (OPENING_BRACKETS.has(token.value)) depth += 1;
    else if (CLOSING_BRACKETS.has(token.value)) depth = Math.max(0, depth - 1);
    if (depth === 0 && token.value === ':') return index;
  }
  return tokens.length;
}

function isTypeAnnotationColon(tokens: PythonToken[], colonIndex: number): boolean {
  const previous = previousToken(tokens, colonIndex);
  if (!previous || previous.line !== tokens[colonIndex].line) return false;
  if (previous.value === ')' || previous.value === ']' || previous.value === '}') return false;
  if (previous.kind === 'keyword') return false;

  const line = tokens[colonIndex].line;
  let bracketDepth = 0;
  for (let index = colonIndex - 1; index >= 0 && tokens[index].line === line; index -= 1) {
    if (CLOSING_BRACKETS.has(tokens[index].value)) bracketDepth += 1;
    else if (OPENING_BRACKETS.has(tokens[index].value)) {
      if (bracketDepth === 0) return false;
      bracketDepth -= 1;
    }

    if (
      tokens[index].value === 'def'
      || tokens[index].value === 'class'
      || tokens[index].value === 'if'
      || tokens[index].value === 'elif'
      || tokens[index].value === 'else'
      || tokens[index].value === 'while'
      || tokens[index].value === 'for'
      || tokens[index].value === 'with'
      || tokens[index].value === 'try'
      || tokens[index].value === 'except'
      || tokens[index].value === 'finally'
      || tokens[index].value === 'match'
      || tokens[index].value === 'case'
      || tokens[index].value === 'lambda'
    ) {
      return false;
    }
  }
  if (bracketDepth > 0) return false;

  return previous.kind === 'identifier';
}

function findAssignmentSegmentStart(lineTokens: PythonToken[], assignmentIndex: number): number {
  let depth = 0;
  for (let index = assignmentIndex - 1; index >= 0; index -= 1) {
    const token = lineTokens[index];
    if (CLOSING_BRACKETS.has(token.value)) depth += 1;
    else if (OPENING_BRACKETS.has(token.value)) depth = Math.max(0, depth - 1);
    if (depth === 0 && (token.value === ';' || token.value === ',')) return index + 1;
  }
  return 0;
}

function findEnclosingCallToken(lineTokens: PythonToken[], tokenIndex: number): PythonToken | undefined {
  let depth = 0;
  for (let index = tokenIndex - 1; index >= 0; index -= 1) {
    const token = lineTokens[index];
    if (token.value === ')') depth += 1;
    else if (token.value === '(') {
      if (depth === 0) {
        const beforeOpen = lineTokens[index - 1];
        return beforeOpen?.kind === 'identifier' ? beforeOpen : undefined;
      }
      depth -= 1;
    }
  }
  return undefined;
}

function guessImportedBindingType(name: string): PythonSemanticTokenType {
  if (PYTHON_TYPING_NAMES.has(name) || PYTHON_BUILTIN_TYPES.has(name)) return 'pythonBuiltinType';
  if (startsLikeType(name)) return 'pythonClass';
  if (startsLikeConstant(name)) return 'pythonConstant';
  return 'pythonVariable';
}

function rememberImportedBinding(symbols: PythonSymbolTables, name: string, type: PythonSemanticTokenType) {
  if (type === 'pythonClass' || type === 'pythonBuiltinType') symbols.importedTypes.add(name);
  else if (type === 'pythonModule') symbols.modules.add(name);
  else symbols.variables.add(name);
}

function isTypeParameterAssignment(token: PythonToken, lineTokens: PythonToken[]): boolean {
  const tokenPosition = lineTokens.findIndex(candidate => candidate.offset === token.offset);
  if (tokenPosition < 0) return false;
  const equals = lineTokens.findIndex((candidate, index) => index > tokenPosition && candidate.value === '=');
  if (equals < 0) return false;
  const callee = nextIdentifierInLine(lineTokens, equals);
  return callee?.value === 'TypeVar' || callee?.value === 'ParamSpec' || callee?.value === 'TypeVarTuple';
}

function startsLikeType(name: string): boolean {
  return /^[A-Z]/.test(name);
}

function startsLikeConstant(name: string): boolean {
  return /^_*[A-Z][A-Z0-9_]*$/.test(name) && /[A-Z]/.test(name);
}

function isMagicName(name: string): boolean {
  return /^__[A-Za-z0-9_]+__$/.test(name);
}

function isIdentifierStart(ch: string): boolean {
  return ch === '_' || /\p{L}/u.test(ch);
}

function isIdentifierPart(ch: string): boolean {
  return ch === '_' || /\p{L}|\p{N}/u.test(ch);
}

function readOperator(source: string, offset: number): string | null {
  const three = source.slice(offset, offset + 3);
  if (three === '>>=' || three === '<<=' || three === '**=' || three === '//=') return three;

  const two = source.slice(offset, offset + 2);
  if ([
    '->', ':=', '==', '!=', '<=', '>=', '+=', '-=', '*=', '/=', '%=', '@=',
    '&=', '|=', '^=', '**', '//', '<<', '>>',
  ].includes(two)) return two;

  if ('+-*/%@&|^~<>=:'.includes(source[offset])) return source[offset];
  return null;
}

function advanceNumber(source: string, getOffset: () => number, advance: () => void) {
  while (getOffset() < source.length && /[A-Za-z0-9_.]/.test(source[getOffset()])) {
    advance();
  }
}

interface StringStart {
  prefixLength: number;
  quote: '"' | "'";
  triple: boolean;
  isFormatted: boolean;
}

function getStringStart(source: string, offset: number): StringStart | null {
  const direct = source[offset];
  if (direct === '"' || direct === "'") {
    return {
      prefixLength: 0,
      quote: direct,
      triple: source.slice(offset, offset + 3) === direct.repeat(3),
      isFormatted: false,
    };
  }

  let prefix = '';
  let cursor = offset;
  while (cursor < source.length && cursor - offset < 4 && /[rRuUbBfFtT]/.test(source[cursor])) {
    prefix += source[cursor];
    cursor += 1;
    if (source[cursor] === '"' || source[cursor] === "'") {
      const quote = source[cursor] as '"' | "'";
      return {
        prefixLength: prefix.length,
        quote,
        triple: source.slice(cursor, cursor + 3) === quote.repeat(3),
        isFormatted: prefix.toLowerCase().includes('f'),
      };
    }
  }

  return null;
}

function scanStringEnd(source: string, offset: number, start: StringStart): number {
  const quoteOffset = offset + start.prefixLength;
  const close = start.triple ? start.quote.repeat(3) : start.quote;
  let cursor = quoteOffset + close.length;

  while (cursor < source.length) {
    if (start.isFormatted && source[cursor] === '{' && source[cursor + 1] !== '{') {
      cursor = scanFormattedExpressionEnd(source, cursor + 1);
      continue;
    }

    if (source.startsWith(close, cursor)) return cursor + close.length;
    if (!start.triple && (source[cursor] === '\n' || source[cursor] === '\r')) return cursor;
    if (source[cursor] === '\\') {
      cursor += 2;
      continue;
    }
    cursor += 1;
  }

  return source.length;
}

function scanFormattedExpressionEnd(source: string, offset: number): number {
  let depth = 1;
  let cursor = offset;

  while (cursor < source.length && depth > 0) {
    const nestedString = getStringStart(source, cursor);
    if (nestedString) {
      cursor = scanStringEnd(source, cursor, nestedString);
      continue;
    }

    if (source[cursor] === '{') depth += 1;
    else if (source[cursor] === '}') depth -= 1;
    cursor += 1;
  }

  return cursor;
}
