import * as monaco from 'monaco-editor';

export interface JavaProjectSourceFile {
  path: string;
  content: string;
  language: 'java';
}

export type JavaProjectFilesProvider = () => JavaProjectSourceFile[];

const JAVA_KEYWORDS = [
  'abstract', 'assert', 'boolean', 'break', 'byte', 'case', 'catch', 'char', 'class', 'const',
  'continue', 'default', 'do', 'double', 'else', 'enum', 'extends', 'final', 'finally', 'float',
  'for', 'if', 'implements', 'import', 'instanceof', 'int', 'interface', 'long', 'native', 'new',
  'non-sealed', 'package', 'private', 'protected', 'public', 'record', 'return', 'sealed', 'short',
  'static', 'strictfp', 'super', 'switch', 'synchronized', 'this', 'throw', 'throws', 'transient',
  'try', 'var', 'void', 'volatile', 'while',
];

const COMMON_TYPES = [
  'String', 'System', 'Scanner', 'Math', 'Arrays', 'ArrayList', 'HashMap', 'HashSet', 'List',
  'Map', 'Set', 'Optional', 'Objects', 'Collections', 'Random', 'LocalDate', 'LocalDateTime',
  'BigInteger', 'BigDecimal', 'StringBuilder', 'Exception', 'RuntimeException',
];

const JAVA_HOVERS: Record<string, string> = {
  System: '`java.lang.System` provides standard input, output, error, properties, and time helpers.',
  Scanner: '`java.util.Scanner` tokenizes text from strings, files, or `System.in`.',
  String: '`java.lang.String` is immutable text backed by Unicode code units.',
  ArrayList: '`java.util.ArrayList` is a resizable `List` implementation.',
  HashMap: '`java.util.HashMap` stores key/value pairs with hash-based lookup.',
  HashSet: '`java.util.HashSet` stores unique values with hash-based lookup.',
  Optional: '`java.util.Optional<T>` represents a value that may or may not be present.',
  Math: '`java.lang.Math` contains static numeric helpers such as `max`, `min`, `pow`, and `sqrt`.',
  public: '`public` makes a type or member visible from other packages.',
  private: '`private` restricts a member to the declaring class.',
  protected: '`protected` allows access from subclasses and same-package classes.',
  static: '`static` binds a member to the type rather than an instance.',
  final: '`final` prevents reassignment, overriding, or subclassing depending on where it is used.',
  record: '`record` declares a compact immutable data carrier class.',
};

const SIGNATURES: Record<string, string[]> = {
  println: ['void println()', 'void println(Object value)', 'void println(String value)', 'void println(int value)', 'void println(double value)'],
  print: ['void print(Object value)', 'void print(String value)', 'void print(int value)', 'void print(double value)'],
  printf: ['PrintStream printf(String format, Object... args)'],
  format: ['String format(String format, Object... args)'],
  Scanner: ['Scanner(InputStream source)', 'Scanner(String source)', 'Scanner(File source)'],
  next: ['String next()'],
  nextLine: ['String nextLine()'],
  nextInt: ['int nextInt()'],
  nextDouble: ['double nextDouble()'],
  hasNext: ['boolean hasNext()'],
  parseInt: ['int parseInt(String value)', 'int parseInt(String value, int radix)'],
  parseDouble: ['double parseDouble(String value)'],
  max: ['int max(int a, int b)', 'long max(long a, long b)', 'double max(double a, double b)'],
  min: ['int min(int a, int b)', 'long min(long a, long b)', 'double min(double a, double b)'],
  pow: ['double pow(double a, double b)'],
  sqrt: ['double sqrt(double value)'],
  asList: ['static <T> List<T> asList(T... values)'],
  add: ['boolean add(E value)', 'void add(int index, E value)'],
  put: ['V put(K key, V value)'],
  get: ['V get(Object key)', 'E get(int index)'],
  main: ['public static void main(String[] args)'],
};

function debounce<T extends (...args: any[]) => any>(func: T, delay: number): (...args: Parameters<T>) => void {
  let timer: ReturnType<typeof setTimeout> | null = null;
  return (...args: Parameters<T>) => {
    if (timer) clearTimeout(timer);
    timer = setTimeout(() => func(...args), delay);
  };
}

function registerLanguageIfNeeded() {
  if (!monaco.languages.getLanguages().some(language => language.id === 'java')) {
    monaco.languages.register({
      id: 'java',
      extensions: ['.java'],
      aliases: ['Java', 'java'],
      mimetypes: ['text/x-java-source'],
    });
  }
}

function configureJavaLanguage() {
  monaco.languages.setLanguageConfiguration('java', {
    comments: {
      lineComment: '//',
      blockComment: ['/*', '*/'],
    },
    brackets: [
      ['{', '}'],
      ['[', ']'],
      ['(', ')'],
    ],
    autoClosingPairs: [
      { open: '{', close: '}' },
      { open: '[', close: ']' },
      { open: '(', close: ')' },
      { open: '"', close: '"', notIn: ['string'] },
      { open: "'", close: "'", notIn: ['string', 'comment'] },
    ],
    surroundingPairs: [
      { open: '{', close: '}' },
      { open: '[', close: ']' },
      { open: '(', close: ')' },
      { open: '"', close: '"' },
      { open: "'", close: "'" },
    ],
    folding: {
      markers: {
        start: /^\s*\/\/\s*#?region\b/,
        end: /^\s*\/\/\s*#?endregion\b/,
      },
    },
    indentationRules: {
      increaseIndentPattern: /^.*\{[^}"']*$/,
      decreaseIndentPattern: /^\s*\}/,
    },
  });

  monaco.languages.setMonarchTokensProvider('java', {
    defaultToken: '',
    tokenPostfix: '.java',
    keywords: JAVA_KEYWORDS,
    typeKeywords: [
      'boolean', 'byte', 'char', 'double', 'float', 'int', 'long', 'short', 'void',
    ],
    operators: [
      '=', '>', '<', '!', '~', '?', ':', '==', '<=', '>=', '!=', '&&', '||', '++', '--',
      '+', '-', '*', '/', '&', '|', '^', '%', '<<', '>>', '>>>', '+=', '-=', '*=', '/=',
      '&=', '|=', '^=', '%=', '<<=', '>>=', '>>>=', '->', '::',
    ],
    symbols: /[=><!~?:&|+\-*\/\^%]+/,
    escapes: /\\(?:[btnfr"'\\]|u[0-9A-Fa-f]{4})/,
    tokenizer: {
      root: [
        [/[a-zA-Z_$][\w$]*/, {
          cases: {
            '@typeKeywords': 'keyword',
            '@keywords': 'keyword',
            '@default': 'identifier',
          },
        }],
        { include: '@whitespace' },
        [/[{}()\[\]]/, '@brackets'],
        [/@[a-zA-Z_$][\w$]*/, 'annotation'],
        [/[<>](?!@symbols)/, '@brackets'],
        [/@symbols/, {
          cases: {
            '@operators': 'operator',
            '@default': '',
          },
        }],
        [/\d*\.\d+([eE][\-+]?\d+)?[fFdD]?/, 'number.float'],
        [/0[xX][0-9a-fA-F_]+[lL]?/, 'number.hex'],
        [/\d+[lL]?/, 'number'],
        [/[;,.]/, 'delimiter'],
        [/"([^"\\]|\\.)*$/, 'string.invalid'],
        [/"/, 'string', '@string'],
        [/'[^\\']'/, 'string'],
        [/(')(@escapes)(')/, ['string', 'string.escape', 'string']],
        [/'/, 'string.invalid'],
      ],
      whitespace: [
        [/[ \t\r\n]+/, ''],
        [/\/\*/, 'comment', '@comment'],
        [/\/\/.*$/, 'comment'],
      ],
      comment: [
        [/[^\/*]+/, 'comment'],
        [/\*\//, 'comment', '@pop'],
        [/[\/*]/, 'comment'],
      ],
      string: [
        [/[^\\"]+/, 'string'],
        [/@escapes/, 'string.escape'],
        [/\\./, 'string.escape.invalid'],
        [/"/, 'string', '@pop'],
      ],
    },
  } as any);
}

function stripCommentsAndStrings(source: string) {
  return source
    .replace(/\/\*[\s\S]*?\*\//g, match => ' '.repeat(match.length))
    .replace(/\/\/[^\n\r]*/g, match => ' '.repeat(match.length))
    .replace(/"(?:\\.|[^"\\])*"/g, match => ' '.repeat(match.length))
    .replace(/'(?:\\.|[^'\\])+'/g, match => ' '.repeat(match.length));
}

function currentModelPath(model: monaco.editor.ITextModel) {
  const rawPath = model.uri.path || model.uri.toString();
  const match = rawPath.match(/codecraft-model\/[^/]+\/(.+)$/);
  if (!match) return decodeURIComponent(rawPath.split('/').pop() || '');
  return decodeURIComponent(match[1]);
}

function baseName(path: string) {
  return path.replace(/\\/g, '/').split('/').pop() || path;
}

function makeRange(model: monaco.editor.ITextModel, startOffset: number, endOffset = startOffset + 1) {
  const start = model.getPositionAt(Math.max(0, startOffset));
  const end = model.getPositionAt(Math.max(startOffset, endOffset));
  return new monaco.Range(start.lineNumber, start.column, end.lineNumber, end.column);
}

function findCallNameBeforePosition(model: monaco.editor.ITextModel, position: monaco.Position) {
  const before = model.getValueInRange({
    startLineNumber: Math.max(1, position.lineNumber - 20),
    startColumn: 1,
    endLineNumber: position.lineNumber,
    endColumn: position.column,
  });
  const openIndex = before.lastIndexOf('(');
  if (openIndex < 0) return '';
  const prefix = before.slice(0, openIndex);
  return prefix.match(/([A-Za-z_$][\w$]*)\s*$/)?.[1] || '';
}

function findReceiverBeforeDot(model: monaco.editor.ITextModel, position: monaco.Position) {
  const line = model.getLineContent(position.lineNumber).slice(0, Math.max(0, position.column - 1));
  const dotIndex = line.lastIndexOf('.');
  if (dotIndex < 0) return '';
  return line.slice(0, dotIndex).match(/([A-Za-z_$][\w$]*(?:\.[A-Za-z_$][\w$]*)*)\s*$/)?.[1] || '';
}

function inferVariableTypes(source: string) {
  const clean = stripCommentsAndStrings(source);
  const variableTypes = new Map<string, string>();
  const declarationPattern = /\b(String|Scanner|ArrayList|HashMap|HashSet|List|Map|Set|Random|StringBuilder|Optional|BigInteger|BigDecimal|int|long|double|float|boolean|char|var)(?:\s*<[^;=(){}]+>)?\s+([A-Za-z_$][\w$]*)\b/g;
  for (const match of clean.matchAll(declarationPattern)) {
    variableTypes.set(match[2], match[1]);
  }
  return variableTypes;
}

function completion(label: string, kind: monaco.languages.CompletionItemKind, range: monaco.IRange, detail?: string, insertText = label): monaco.languages.CompletionItem {
  return { label, kind, range, detail, insertText };
}

class JavaLanguageService {
  private initialized = false;
  private editorChangeListener: monaco.IDisposable | null = null;
  private modelChangeListener: monaco.IDisposable | null = null;
  private providerDisposables: monaco.IDisposable[] = [];
  private model: monaco.editor.ITextModel | null = null;
  private projectFilesProvider: JavaProjectFilesProvider | null = null;
  private debouncedDiagnostics = debounce(() => this.updateDiagnostics(), 100);

  initialize() {
    if (this.initialized) return;
    this.initialized = true;
    registerLanguageIfNeeded();
    configureJavaLanguage();
    this.registerProviders();
  }

  setupEditor(editor: monaco.editor.IStandaloneCodeEditor, projectFilesProvider?: JavaProjectFilesProvider) {
    this.initialize();
    this.projectFilesProvider = projectFilesProvider || null;
    this.clearEditor();

    const updateModel = () => {
      this.modelChangeListener?.dispose();
      this.modelChangeListener = null;
      const model = editor.getModel();
      this.model = model?.getLanguageId() === 'java' ? model : null;
      if (this.model) {
        this.updateDiagnostics();
        this.modelChangeListener = this.model.onDidChangeContent(() => this.debouncedDiagnostics());
      }
    };

    updateModel();
    this.editorChangeListener = editor.onDidChangeModel(updateModel);
  }

  clearEditor() {
    if (this.model) {
      monaco.editor.setModelMarkers(this.model, 'codecraft-java', []);
    }
    this.modelChangeListener?.dispose();
    this.modelChangeListener = null;
    this.editorChangeListener?.dispose();
    this.editorChangeListener = null;
    this.model = null;
  }

  dispose() {
    this.clearEditor();
    for (const disposable of this.providerDisposables.splice(0)) {
      disposable.dispose();
    }
  }

  private registerProviders() {
    this.providerDisposables.push(monaco.languages.registerCompletionItemProvider('java', {
      triggerCharacters: ['.', '@'],
      provideCompletionItems: (model, position) => this.provideCompletionItems(model, position),
    }));

    this.providerDisposables.push(monaco.languages.registerSignatureHelpProvider('java', {
      signatureHelpTriggerCharacters: ['(', ','],
      provideSignatureHelp: (model, position) => this.provideSignatureHelp(model, position),
    }));

    this.providerDisposables.push(monaco.languages.registerHoverProvider('java', {
      provideHover: (model, position) => this.provideHover(model, position),
    }));

    this.providerDisposables.push(monaco.languages.registerDocumentSymbolProvider('java', {
      provideDocumentSymbols: (model) => this.provideDocumentSymbols(model),
    }));
  }

  private provideCompletionItems(model: monaco.editor.ITextModel, position: monaco.Position): monaco.languages.CompletionList {
    const word = model.getWordUntilPosition(position);
    const range = new monaco.Range(position.lineNumber, word.startColumn, position.lineNumber, word.endColumn);
    const receiver = findReceiverBeforeDot(model, position);
    const variableTypes = inferVariableTypes(model.getValue());
    const receiverTail = receiver.split('.').pop() || receiver;
    const receiverType = variableTypes.get(receiverTail) || receiver;
    const suggestions: monaco.languages.CompletionItem[] = [];

    const addMember = (label: string, detail?: string, insertText = label) => {
      suggestions.push(completion(label, monaco.languages.CompletionItemKind.Method, range, detail, insertText));
    };

    if (receiver) {
      if (receiver === 'System.out' || receiver === 'System.err' || receiverType === 'PrintStream') {
        addMember('println', 'Print a value and newline.', 'println($0)');
        addMember('print', 'Print a value.', 'print($0)');
        addMember('printf', 'Print formatted text.', 'printf("$1", $2)');
      } else if (receiver === 'System') {
        addMember('currentTimeMillis', 'Current time in milliseconds.', 'currentTimeMillis()');
        addMember('getProperty', 'Read a JVM property.', 'getProperty("$1")');
        addMember('getenv', 'Read an environment variable.', 'getenv("$1")');
        addMember('exit', 'Terminate the JVM process.', 'exit($1)');
        suggestions.push(completion('out', monaco.languages.CompletionItemKind.Field, range, 'Standard output stream.'));
        suggestions.push(completion('err', monaco.languages.CompletionItemKind.Field, range, 'Standard error stream.'));
        suggestions.push(completion('in', monaco.languages.CompletionItemKind.Field, range, 'Standard input stream.'));
      } else if (receiver === 'Math') {
        ['abs', 'ceil', 'floor', 'max', 'min', 'pow', 'random', 'round', 'sqrt'].forEach(method => addMember(method, 'java.lang.Math helper.', `${method}($0)`));
      } else if (receiverType === 'Scanner') {
        ['next', 'nextLine', 'nextInt', 'nextLong', 'nextDouble', 'hasNext', 'hasNextLine', 'close'].forEach(method => addMember(method, 'Scanner input method.', `${method}()`));
      } else if (receiverType === 'String') {
        ['charAt', 'contains', 'endsWith', 'equals', 'indexOf', 'isEmpty', 'length', 'replace', 'split', 'substring', 'toLowerCase', 'toUpperCase', 'trim'].forEach(method => addMember(method, 'String method.', `${method}($0)`));
      } else if (/List|ArrayList|Set|HashSet/.test(receiverType)) {
        ['add', 'clear', 'contains', 'isEmpty', 'iterator', 'remove', 'size', 'stream', 'toArray'].forEach(method => addMember(method, 'Collection method.', `${method}($0)`));
      } else if (/Map|HashMap/.test(receiverType)) {
        ['clear', 'containsKey', 'entrySet', 'get', 'isEmpty', 'keySet', 'put', 'remove', 'size', 'values'].forEach(method => addMember(method, 'Map method.', `${method}($0)`));
      }
      return { suggestions };
    }

    for (const keyword of JAVA_KEYWORDS) {
      suggestions.push(completion(keyword, monaco.languages.CompletionItemKind.Keyword, range));
    }
    for (const typeName of COMMON_TYPES) {
      suggestions.push(completion(typeName, monaco.languages.CompletionItemKind.Class, range));
    }
    suggestions.push({
      label: 'main',
      kind: monaco.languages.CompletionItemKind.Snippet,
      range,
      detail: 'public static void main',
      insertText: 'public static void main(String[] args) {\n\t$0\n}',
      insertTextRules: monaco.languages.CompletionItemInsertTextRule.InsertAsSnippet,
    });
    suggestions.push({
      label: 'class',
      kind: monaco.languages.CompletionItemKind.Snippet,
      range,
      detail: 'Java class',
      insertText: 'public class ${1:Main} {\n\t$0\n}',
      insertTextRules: monaco.languages.CompletionItemInsertTextRule.InsertAsSnippet,
    });
    suggestions.push({
      label: 'sout',
      kind: monaco.languages.CompletionItemKind.Snippet,
      range,
      detail: 'System.out.println',
      insertText: 'System.out.println($0);',
      insertTextRules: monaco.languages.CompletionItemInsertTextRule.InsertAsSnippet,
    });
    suggestions.push({
      label: 'scanner',
      kind: monaco.languages.CompletionItemKind.Snippet,
      range,
      detail: 'Scanner from System.in',
      insertText: 'Scanner ${1:scanner} = new Scanner(System.in);',
      insertTextRules: monaco.languages.CompletionItemInsertTextRule.InsertAsSnippet,
    });

    return { suggestions };
  }

  private provideSignatureHelp(model: monaco.editor.ITextModel, position: monaco.Position): monaco.languages.SignatureHelpResult | undefined {
    const callName = findCallNameBeforePosition(model, position);
    const signatures = SIGNATURES[callName];
    if (!signatures || signatures.length === 0) return undefined;
    return {
      value: {
        signatures: signatures.map(label => ({
          label,
          parameters: (label.match(/\((.*)\)/)?.[1] || '')
            .split(',')
            .map(part => part.trim())
            .filter(Boolean)
            .map(label => ({ label })),
        })),
        activeSignature: 0,
        activeParameter: 0,
      },
      dispose: () => {},
    };
  }

  private provideHover(model: monaco.editor.ITextModel, position: monaco.Position): monaco.languages.Hover | undefined {
    const word = model.getWordAtPosition(position);
    if (!word) return undefined;
    const value = JAVA_HOVERS[word.word];
    if (!value) return undefined;
    return {
      range: new monaco.Range(position.lineNumber, word.startColumn, position.lineNumber, word.endColumn),
      contents: [{ value }],
    };
  }

  private provideDocumentSymbols(model: monaco.editor.ITextModel): monaco.languages.DocumentSymbol[] {
    const source = stripCommentsAndStrings(model.getValue());
    const symbols: monaco.languages.DocumentSymbol[] = [];
    const typePattern = /^\s*(?:public\s+|protected\s+|private\s+)?(?:abstract\s+|final\s+|sealed\s+|non-sealed\s+|strictfp\s+)*?(class|interface|enum|record)\s+([A-Za-z_$][\w$]*)/gm;
    const methodPattern = /^\s*(?:public\s+|protected\s+|private\s+)?(?:static\s+|final\s+|synchronized\s+|native\s+|abstract\s+|strictfp\s+)*?(?:<[^>]+>\s*)?[\w$<>\[\].?,\s]+\s+([A-Za-z_$][\w$]*)\s*\([^;{}]*\)\s*(?:throws\s+[^{]+)?\{/gm;
    const fieldPattern = /^\s*(?:public\s+|protected\s+|private\s+)?(?:static\s+|final\s+|transient\s+|volatile\s+)*?[\w$<>\[\].?,]+\s+([A-Za-z_$][\w$]*)\s*(?:=|;)/gm;

    for (const pattern of [typePattern, methodPattern, fieldPattern]) {
      for (const match of source.matchAll(pattern)) {
        const name = match[2] || match[1];
        if (!name) continue;
        const start = match.index ?? 0;
        const end = start + match[0].length;
        const range = makeRange(model, start, end);
        const kind = pattern === typePattern
          ? (match[1] === 'interface' ? monaco.languages.SymbolKind.Interface : match[1] === 'enum' ? monaco.languages.SymbolKind.Enum : monaco.languages.SymbolKind.Class)
          : pattern === methodPattern
            ? monaco.languages.SymbolKind.Method
            : monaco.languages.SymbolKind.Field;
        symbols.push({
          name,
          detail: pattern === typePattern ? match[1] : '',
          kind,
          tags: [],
          range,
          selectionRange: range,
          children: [],
        });
      }
    }

    return symbols.sort((left, right) => left.range.startLineNumber - right.range.startLineNumber);
  }

  private updateDiagnostics() {
    if (!this.model || this.model.getLanguageId() !== 'java') return;
    const model = this.model;
    const source = model.getValue();
    const clean = stripCommentsAndStrings(source);
    const markers: monaco.editor.IMarkerData[] = [];
    this.addStructuralDiagnostics(model, clean, markers);
    this.addDeclarationDiagnostics(model, clean, markers);
    this.addStatementDiagnostics(model, clean, markers);
    this.addProjectDiagnostics(model, clean, markers);
    monaco.editor.setModelMarkers(model, 'codecraft-java', markers);
  }

  private addStructuralDiagnostics(model: monaco.editor.ITextModel, clean: string, markers: monaco.editor.IMarkerData[]) {
    const stack: { char: string; offset: number }[] = [];
    const pairs: Record<string, string> = { '(': ')', '[': ']', '{': '}' };
    const closers: Record<string, string> = { ')': '(', ']': '[', '}': '{' };
    for (let offset = 0; offset < clean.length; offset++) {
      const char = clean[offset];
      if (pairs[char]) {
        stack.push({ char, offset });
      } else if (closers[char]) {
        const last = stack.pop();
        if (!last || last.char !== closers[char]) {
          markers.push({
            severity: monaco.MarkerSeverity.Error,
            message: `Unmatched '${char}'.`,
            ...makeRange(model, offset),
          });
        }
      }
    }
    for (const item of stack.slice(-20)) {
      markers.push({
        severity: monaco.MarkerSeverity.Error,
        message: `Missing '${pairs[item.char]}' for '${item.char}'.`,
        ...makeRange(model, item.offset),
      });
    }

    for (let lineNumber = 1; lineNumber <= model.getLineCount(); lineNumber++) {
      const line = model.getLineContent(lineNumber);
      const quoteCount = (line.match(/(?<!\\)"/g) || []).length;
      if (quoteCount % 2 === 1) {
        markers.push({
          severity: monaco.MarkerSeverity.Error,
          message: 'String literal is not closed on this line.',
          startLineNumber: lineNumber,
          startColumn: Math.max(1, line.lastIndexOf('"') + 1),
          endLineNumber: lineNumber,
          endColumn: line.length + 1,
        });
      }
    }
  }

  private addDeclarationDiagnostics(model: monaco.editor.ITextModel, clean: string, markers: monaco.editor.IMarkerData[]) {
    const packageMatches = [...clean.matchAll(/^\s*package\s+([A-Za-z_$][\w$]*(?:\.[A-Za-z_$][\w$]*)*)\s*;/gm)];
    if (packageMatches.length > 1) {
      for (const match of packageMatches.slice(1)) {
        markers.push({
          severity: monaco.MarkerSeverity.Error,
          message: 'A Java file can declare only one package.',
          ...makeRange(model, match.index ?? 0, (match.index ?? 0) + match[0].length),
        });
      }
    }

    const firstImport = clean.search(/^\s*import\s+/m);
    const firstType = clean.search(/^\s*(?:public\s+|protected\s+|private\s+)?(?:abstract\s+|final\s+|sealed\s+|non-sealed\s+|strictfp\s+)*?(?:class|interface|enum|record)\s+/m);
    if (packageMatches[0] && firstImport >= 0 && (packageMatches[0].index ?? 0) > firstImport) {
      markers.push({
        severity: monaco.MarkerSeverity.Error,
        message: 'The package declaration must appear before imports.',
        ...makeRange(model, packageMatches[0].index ?? 0, (packageMatches[0].index ?? 0) + packageMatches[0][0].length),
      });
    }
    if (firstType >= 0) {
      for (const match of clean.matchAll(/^\s*import\s+[\w.*]+;/gm)) {
        if ((match.index ?? 0) > firstType) {
          markers.push({
            severity: monaco.MarkerSeverity.Error,
            message: 'Imports must appear before type declarations.',
            ...makeRange(model, match.index ?? 0, (match.index ?? 0) + match[0].length),
          });
        }
      }
    }

    const publicTypes = [...clean.matchAll(/\bpublic\s+(?:abstract\s+|final\s+|sealed\s+|non-sealed\s+|strictfp\s+)*?(class|interface|enum|record)\s+([A-Za-z_$][\w$]*)/g)];
    if (publicTypes.length > 1) {
      for (const match of publicTypes.slice(1)) {
        markers.push({
          severity: monaco.MarkerSeverity.Error,
          message: 'Only one public top-level type is allowed per Java source file.',
          ...makeRange(model, match.index ?? 0, (match.index ?? 0) + match[0].length),
        });
      }
    }

    const fileName = baseName(currentModelPath(model)).replace(/\.java$/i, '');
    const publicTypeName = publicTypes[0]?.[2];
    if (publicTypeName && fileName && publicTypeName !== fileName) {
      markers.push({
        severity: monaco.MarkerSeverity.Error,
        message: `Public type '${publicTypeName}' should be declared in a file named '${publicTypeName}.java'.`,
        ...makeRange(model, publicTypes[0].index ?? 0, (publicTypes[0].index ?? 0) + publicTypes[0][0].length),
      });
    }

    const mainLike = clean.match(/\bvoid\s+main\s*\(\s*String(?:\s*\[\s*\]\s*[A-Za-z_$][\w$]*|\s+[A-Za-z_$][\w$]*\s*\[\s*\])\s*\)/);
    if (mainLike && !/public\s+static\s+void\s+main\s*\(\s*String(?:\s*\[\s*\]\s*[A-Za-z_$][\w$]*|\s+[A-Za-z_$][\w$]*\s*\[\s*\])\s*\)/.test(clean)) {
      markers.push({
        severity: monaco.MarkerSeverity.Warning,
        message: 'CodeCraft runs Java through public static void main(String[] args).',
        ...makeRange(model, mainLike.index ?? 0, (mainLike.index ?? 0) + mainLike[0].length),
      });
    }
  }

  private addStatementDiagnostics(model: monaco.editor.ITextModel, clean: string, markers: monaco.editor.IMarkerData[]) {
    const lines = clean.split(/\r?\n/);
    for (let index = 0; index < lines.length; index++) {
      const rawLine = lines[index];
      const line = rawLine.trim();
      if (!line) continue;
      if (/^(?:package|import)\b/.test(line)) {
        if (!line.endsWith(';')) {
          markers.push({
            severity: monaco.MarkerSeverity.Error,
            message: 'Declaration must end with a semicolon.',
            startLineNumber: index + 1,
            startColumn: rawLine.length + 1,
            endLineNumber: index + 1,
            endColumn: rawLine.length + 1,
          });
        }
        continue;
      }
      if (
        line.endsWith(';') ||
        line.endsWith('{') ||
        line.endsWith('}') ||
        line.endsWith(':') ||
        line.startsWith('@') ||
        /^(?:if|for|while|switch|try|catch|finally|else|do|class|interface|enum|record)\b/.test(line)
      ) {
        continue;
      }
      if (/^(?:return|throw|break|continue)\b/.test(line) || /\b(?:new|=|\+\+|--)\b|(?:\+\+|--)$/.test(line) || /\w+\s*\([^;{}]*\)$/.test(line)) {
        markers.push({
          severity: monaco.MarkerSeverity.Warning,
          message: 'This statement may need a trailing semicolon.',
          startLineNumber: index + 1,
          startColumn: rawLine.length + 1,
          endLineNumber: index + 1,
          endColumn: rawLine.length + 1,
        });
      }
    }
  }

  private addProjectDiagnostics(model: monaco.editor.ITextModel, clean: string, markers: monaco.editor.IMarkerData[]) {
    const files = this.projectFilesProvider?.() || [];
    if (files.length <= 1) return;
    const currentPath = currentModelPath(model);
    const currentTypes = [...clean.matchAll(/\b(?:class|interface|enum|record)\s+([A-Za-z_$][\w$]*)/g)].map(match => match[1]);
    if (currentTypes.length === 0) return;

    const duplicates = new Set<string>();
    for (const file of files) {
      if (file.path === currentPath) continue;
      const fileClean = stripCommentsAndStrings(file.content);
      for (const match of fileClean.matchAll(/\b(?:class|interface|enum|record)\s+([A-Za-z_$][\w$]*)/g)) {
        if (currentTypes.includes(match[1])) {
          duplicates.add(match[1]);
        }
      }
    }
    for (const duplicate of duplicates) {
      const match = clean.match(new RegExp(`\\b(?:class|interface|enum|record)\\s+(${duplicate})\\b`));
      if (!match) continue;
      markers.push({
        severity: monaco.MarkerSeverity.Warning,
        message: `Another selected Java project file also declares '${duplicate}'.`,
        ...makeRange(model, match.index ?? 0, (match.index ?? 0) + match[0].length),
      });
    }
  }
}

export const javaService = new JavaLanguageService();
let javaReadyPromise: Promise<void> | null = null;

export function ensureJavaReady(): Promise<void> {
  if (!javaReadyPromise) {
    javaReadyPromise = Promise.resolve().then(() => javaService.initialize());
  }
  return javaReadyPromise;
}

export const javaReady = { then: (fn: () => void) => ensureJavaReady().then(fn) };
