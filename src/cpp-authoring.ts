import * as monaco from 'monaco-editor';

export interface CxxProjectFileSnapshot {
  path: string;
  content: string;
  language: 'c' | 'cpp';
}

type CxxProjectFilesProvider = () => CxxProjectFileSnapshot[];

function debounce<T extends (...args: any[]) => any>(func: T, delay: number): (...args: Parameters<T>) => void {
  let timer: ReturnType<typeof setTimeout> | undefined;
  return (...args: Parameters<T>) => {
    if (timer) clearTimeout(timer);
    timer = setTimeout(() => func(...args), delay);
  };
}

const C_KEYWORDS = [
  'auto', 'break', 'case', 'char', 'const', 'continue', 'default', 'do', 'double', 'else',
  'enum', 'extern', 'float', 'for', 'goto', 'if', 'inline', 'int', 'long', 'register',
  'restrict', 'return', 'short', 'signed', 'sizeof', 'static', 'struct', 'switch',
  'typedef', 'union', 'unsigned', 'void', 'volatile', 'while', '_Atomic', '_Bool',
  '_Complex', '_Generic', '_Imaginary', '_Noreturn', '_Static_assert', '_Thread_local',
];

const CPP_KEYWORDS = [
  ...C_KEYWORDS,
  'alignas', 'alignof', 'and', 'and_eq', 'asm', 'bitand', 'bitor', 'bool', 'catch',
  'char8_t', 'char16_t', 'char32_t', 'class', 'compl', 'concept', 'consteval',
  'constexpr', 'constinit', 'const_cast', 'co_await', 'co_return', 'co_yield', 'decltype',
  'delete', 'dynamic_cast', 'explicit', 'export', 'false', 'friend', 'mutable',
  'namespace', 'new', 'noexcept', 'not', 'not_eq', 'nullptr', 'operator', 'or', 'or_eq',
  'private', 'protected', 'public', 'reinterpret_cast', 'requires', 'static_assert',
  'static_cast', 'template', 'this', 'thread_local', 'throw', 'true', 'try', 'typeid',
  'typename', 'using', 'virtual', 'wchar_t', 'xor', 'xor_eq',
];

const PREPROCESSOR_DIRECTIVES = [
  '#include', '#define', '#undef', '#if', '#ifdef', '#ifndef', '#elif', '#else', '#endif',
  '#pragma', '#error', '#line',
];

const C_STANDARD_ITEMS = [
  { label: 'printf', signature: 'int printf(const char *format, ...)', detail: '<stdio.h>', doc: 'Writes formatted output to stdout.' },
  { label: 'fprintf', signature: 'int fprintf(FILE *stream, const char *format, ...)', detail: '<stdio.h>', doc: 'Writes formatted output to a stream.' },
  { label: 'scanf', signature: 'int scanf(const char *format, ...)', detail: '<stdio.h>', doc: 'Reads formatted input from stdin.' },
  { label: 'fgets', signature: 'char *fgets(char *str, int count, FILE *stream)', detail: '<stdio.h>', doc: 'Reads a line from a stream.' },
  { label: 'getchar', signature: 'int getchar(void)', detail: '<stdio.h>', doc: 'Reads one character from stdin.' },
  { label: 'puts', signature: 'int puts(const char *str)', detail: '<stdio.h>', doc: 'Writes a string followed by a newline.' },
  { label: 'malloc', signature: 'void *malloc(size_t size)', detail: '<stdlib.h>', doc: 'Allocates dynamic memory.' },
  { label: 'calloc', signature: 'void *calloc(size_t count, size_t size)', detail: '<stdlib.h>', doc: 'Allocates zero-initialized dynamic memory.' },
  { label: 'realloc', signature: 'void *realloc(void *ptr, size_t new_size)', detail: '<stdlib.h>', doc: 'Resizes a dynamic allocation.' },
  { label: 'free', signature: 'void free(void *ptr)', detail: '<stdlib.h>', doc: 'Releases dynamic memory.' },
  { label: 'memcpy', signature: 'void *memcpy(void *dest, const void *src, size_t count)', detail: '<string.h>', doc: 'Copies bytes between non-overlapping memory regions.' },
  { label: 'memset', signature: 'void *memset(void *dest, int ch, size_t count)', detail: '<string.h>', doc: 'Fills memory with a byte value.' },
  { label: 'strlen', signature: 'size_t strlen(const char *str)', detail: '<string.h>', doc: 'Returns the length of a null-terminated string.' },
  { label: 'strcmp', signature: 'int strcmp(const char *lhs, const char *rhs)', detail: '<string.h>', doc: 'Lexicographically compares two strings.' },
  { label: 'qsort', signature: 'void qsort(void *ptr, size_t count, size_t size, int (*comp)(const void *, const void *))', detail: '<stdlib.h>', doc: 'Sorts an array using a comparator.' },
  { label: 'abs', signature: 'int abs(int n)', detail: '<stdlib.h>', doc: 'Returns the absolute value of an integer.' },
  { label: 'sqrt', signature: 'double sqrt(double arg)', detail: '<math.h>', doc: 'Returns the square root.' },
  { label: 'pow', signature: 'double pow(double base, double exp)', detail: '<math.h>', doc: 'Raises a value to a power.' },
];

const CPP_STANDARD_ITEMS = [
  { label: 'std::cout', signature: 'std::ostream std::cout', detail: '<iostream>', doc: 'Standard output stream.' },
  { label: 'std::cin', signature: 'std::istream std::cin', detail: '<iostream>', doc: 'Standard input stream.' },
  { label: 'std::cerr', signature: 'std::ostream std::cerr', detail: '<iostream>', doc: 'Standard error stream.' },
  { label: 'std::string', signature: 'class std::string', detail: '<string>', doc: 'Dynamically sized string type.' },
  { label: 'std::vector', signature: 'template<class T> class std::vector', detail: '<vector>', doc: 'Contiguous dynamic array container.' },
  { label: 'std::array', signature: 'template<class T, size_t N> struct std::array', detail: '<array>', doc: 'Fixed-size array container.' },
  { label: 'std::map', signature: 'template<class Key, class T> class std::map', detail: '<map>', doc: 'Ordered associative container.' },
  { label: 'std::unordered_map', signature: 'template<class Key, class T> class std::unordered_map', detail: '<unordered_map>', doc: 'Hash-table associative container.' },
  { label: 'std::set', signature: 'template<class Key> class std::set', detail: '<set>', doc: 'Ordered unique-key container.' },
  { label: 'std::unique_ptr', signature: 'template<class T> class std::unique_ptr', detail: '<memory>', doc: 'Exclusive ownership smart pointer.' },
  { label: 'std::shared_ptr', signature: 'template<class T> class std::shared_ptr', detail: '<memory>', doc: 'Shared ownership smart pointer.' },
  { label: 'std::make_unique', signature: 'template<class T, class... Args> unique_ptr<T> make_unique(Args&&... args)', detail: '<memory>', doc: 'Creates an object owned by a unique_ptr.' },
  { label: 'std::make_shared', signature: 'template<class T, class... Args> shared_ptr<T> make_shared(Args&&... args)', detail: '<memory>', doc: 'Creates an object owned by a shared_ptr.' },
  { label: 'std::sort', signature: 'template<class RandomIt> void sort(RandomIt first, RandomIt last)', detail: '<algorithm>', doc: 'Sorts a range.' },
  { label: 'std::find', signature: 'template<class InputIt, class T> InputIt find(InputIt first, InputIt last, const T& value)', detail: '<algorithm>', doc: 'Finds a value in a range.' },
  { label: 'std::getline', signature: 'std::istream& getline(std::istream& input, std::string& str)', detail: '<string>', doc: 'Reads a line into a string.' },
];

const C_SNIPPETS = [
  {
    label: 'main',
    insertText: 'int main(void) {\n\t$0\n\treturn 0;\n}',
    detail: 'C main function',
  },
  {
    label: 'for',
    insertText: 'for (${1:int i = 0}; ${2:i < n}; ${3:i++}) {\n\t$0\n}',
    detail: 'for loop',
  },
  {
    label: 'if',
    insertText: 'if (${1:condition}) {\n\t$0\n}',
    detail: 'if statement',
  },
  {
    label: 'struct',
    insertText: 'typedef struct ${1:Name} {\n\t$0\n} ${1:Name};',
    detail: 'typedef struct',
  },
  {
    label: '#include',
    insertText: '#include <${1:stdio.h}>',
    detail: 'include header',
  },
];

const CPP_SNIPPETS = [
  {
    label: 'main',
    insertText: 'int main() {\n\t$0\n\treturn 0;\n}',
    detail: 'C++ main function',
  },
  {
    label: 'class',
    insertText: 'class ${1:Name} {\npublic:\n\t${1:Name}() = default;\n\t$0\n};',
    detail: 'class declaration',
  },
  {
    label: 'namespace',
    insertText: 'namespace ${1:name} {\n\t$0\n}',
    detail: 'namespace block',
  },
  {
    label: 'template',
    insertText: 'template <typename ${1:T}>\n${2:void} ${3:function}(${1:T} ${4:value}) {\n\t$0\n}',
    detail: 'function template',
  },
  {
    label: 'range-for',
    insertText: 'for (const auto& ${1:item} : ${2:items}) {\n\t$0\n}',
    detail: 'range-based for loop',
  },
];

const HOVER_DOCS = new Map<string, string>();
for (const item of [...C_STANDARD_ITEMS, ...CPP_STANDARD_ITEMS]) {
  HOVER_DOCS.set(item.label.replace(/^std::/, ''), `\`${item.signature}\`\n\n${item.doc} ${item.detail ? `Declared in \`${item.detail}\`.` : ''}`);
}
for (const keyword of CPP_KEYWORDS) {
  HOVER_DOCS.set(keyword, `\`${keyword}\` keyword`);
}

const SIGNATURES = new Map<string, { label: string; documentation: string; parameters?: string[] }>();
for (const item of [...C_STANDARD_ITEMS, ...CPP_STANDARD_ITEMS]) {
  const plain = item.label.replace(/^std::/, '');
  SIGNATURES.set(plain, {
    label: item.signature,
    documentation: item.doc,
  });
}

function registerLanguageIfNeeded(id: 'c' | 'cpp') {
  if (!monaco.languages.getLanguages().some(language => language.id === id)) {
    monaco.languages.register({
      id,
      extensions: id === 'c' ? ['.c', '.h'] : ['.cpp', '.cc', '.cxx', '.hpp', '.hh', '.hxx', '.ipp', '.tpp'],
      aliases: id === 'c' ? ['C', 'c'] : ['C++', 'Cpp', 'cpp'],
      mimetypes: id === 'c' ? ['text/x-csrc'] : ['text/x-c++src'],
    });
  }
}

function configureLanguage(id: 'c' | 'cpp') {
  monaco.languages.setLanguageConfiguration(id, {
    comments: {
      lineComment: '//',
      blockComment: ['/*', '*/'],
    },
    brackets: [
      ['{', '}'],
      ['[', ']'],
      ['(', ')'],
      ['<', '>'],
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
        start: /^\s*#\s*pragma\s+region\b/,
        end: /^\s*#\s*pragma\s+endregion\b/,
      },
    },
    indentationRules: {
      increaseIndentPattern: /^((?!\/\/).)*(\{[^}"']*|\([^)"']*)$/,
      decreaseIndentPattern: /^\s*(\}|case\b|default\b)/,
    },
  });

  monaco.languages.setMonarchTokensProvider(id, {
    defaultToken: '',
    tokenPostfix: `.${id}`,
    keywords: id === 'cpp' ? CPP_KEYWORDS : C_KEYWORDS,
    typeKeywords: [
      'bool', 'char', 'char8_t', 'char16_t', 'char32_t', 'double', 'float', 'int', 'long',
      'short', 'signed', 'unsigned', 'void', 'wchar_t', 'size_t', 'ptrdiff_t',
    ],
    operators: [
      '=', '>', '<', '!', '~', '?', ':', '==', '<=', '>=', '!=', '&&', '||', '++', '--',
      '+', '-', '*', '/', '&', '|', '^', '%', '<<', '>>', '>>>', '+=', '-=', '*=', '/=',
      '&=', '|=', '^=', '%=', '<<=', '>>=',
    ],
    symbols: /[=><!~?:&|+\-*/^%]+/,
    tokenizer: {
      root: [
        [/^\s*#\s*[a-zA-Z_]\w*/, 'keyword.directive'],
        [/[a-zA-Z_]\w*/, {
          cases: {
            '@typeKeywords': 'type.identifier',
            '@keywords': 'keyword',
            '@default': 'identifier',
          },
        }],
        [/[{}()[\]]/, '@brackets'],
        [/[<>](?!@symbols)/, '@brackets'],
        [/@symbols/, {
          cases: {
            '@operators': 'operator',
            '@default': '',
          },
        }],
        [/\d*\.\d+([eE][\-+]?\d+)?[fFlL]?/, 'number.float'],
        [/0[xX][0-9a-fA-F]+[uUlL]*/, 'number.hex'],
        [/\d+[uUlL]*/, 'number'],
        [/[;,.]/, 'delimiter'],
        [/"([^"\\]|\\.)*$/, 'string.invalid'],
        [/"/, 'string', '@string'],
        [/'([^'\\]|\\.)'/, 'string'],
        [/'/, 'string.invalid'],
        [/\/\*/, 'comment', '@comment'],
        [/\/\/.*$/, 'comment'],
      ],
      comment: [
        [/[^/*]+/, 'comment'],
        [/\*\//, 'comment', '@pop'],
        [/[/*]/, 'comment'],
      ],
      string: [
        [/[^\\"]+/, 'string'],
        [/\\./, 'string.escape.invalid'],
        [/"/, 'string', '@pop'],
      ],
    },
  });
}

function makeRange(model: monaco.editor.ITextModel, startOffset: number, endOffset = startOffset + 1) {
  const start = model.getPositionAt(Math.max(0, startOffset));
  const end = model.getPositionAt(Math.max(startOffset + 1, endOffset));
  return new monaco.Range(start.lineNumber, start.column, end.lineNumber, end.column);
}

function isWordChar(ch: string) {
  return /[A-Za-z0-9_]/.test(ch);
}

function findCallNameBeforePosition(model: monaco.editor.ITextModel, position: monaco.Position) {
  const offset = model.getOffsetAt(position);
  const text = model.getValue().slice(0, offset);
  let index = text.length - 1;
  let depth = 0;
  for (; index >= 0; index--) {
    const ch = text[index];
    if (ch === ')') depth++;
    if (ch === '(') {
      if (depth === 0) break;
      depth--;
    }
  }
  if (index < 0) return '';
  let end = index;
  let start = end - 1;
  while (start >= 0 && /\s/.test(text[start])) start--;
  end = start + 1;
  while (start >= 0 && (isWordChar(text[start]) || text[start] === ':' || text[start] === '~')) start--;
  return text.slice(start + 1, end).replace(/^std::/, '');
}

function normalizeProjectPath(path: string) {
  const resolved: string[] = [];
  for (const raw of path.replace(/\\/g, '/').split('/')) {
    const part = raw.trim();
    if (!part || part === '.') continue;
    if (part === '..') {
      resolved.pop();
    } else {
      resolved.push(part);
    }
  }
  return resolved.join('/');
}

function dirname(path: string) {
  const normalized = normalizeProjectPath(path);
  const index = normalized.lastIndexOf('/');
  return index >= 0 ? normalized.slice(0, index) : '';
}

function resolveIncludePath(fromPath: string, includePath: string) {
  const base = dirname(fromPath);
  return normalizeProjectPath(base ? `${base}/${includePath}` : includePath);
}

function currentModelPath(model: monaco.editor.ITextModel) {
  const uriPath = decodeURIComponent(model.uri.path || '');
  const marker = '/codecraft-model/';
  const index = uriPath.indexOf(marker);
  if (index < 0) return model.uri.path.replace(/^\//, '');
  const withoutPrefix = uriPath.slice(index + marker.length);
  const slash = withoutPrefix.indexOf('/');
  return slash >= 0 ? withoutPrefix.slice(slash + 1) : withoutPrefix;
}

class CxxLanguageService {
  private initialized = false;
  private editorChangeListener: monaco.IDisposable | null = null;
  private modelChangeListener: monaco.IDisposable | null = null;
  private providerDisposables: monaco.IDisposable[] = [];
  private model: monaco.editor.ITextModel | null = null;
  private projectFilesProvider: CxxProjectFilesProvider = () => [];
  private readonly debouncedDiagnostics = debounce(() => this.refreshDiagnostics(), 180);

  initialize() {
    if (this.initialized) return;
    this.initialized = true;

    registerLanguageIfNeeded('c');
    registerLanguageIfNeeded('cpp');
    configureLanguage('c');
    configureLanguage('cpp');
    this.registerProviders('c');
    this.registerProviders('cpp');
  }

  setupEditor(editor: monaco.editor.IStandaloneCodeEditor, projectFilesProvider?: CxxProjectFilesProvider) {
    this.initialize();
    if (projectFilesProvider) {
      this.projectFilesProvider = projectFilesProvider;
    }
    this.setupDiagnostics(editor);
  }

  clearEditor() {
    this.modelChangeListener?.dispose();
    this.modelChangeListener = null;
    this.editorChangeListener?.dispose();
    this.editorChangeListener = null;
    if (this.model && (this.model.getLanguageId() === 'c' || this.model.getLanguageId() === 'cpp')) {
      monaco.editor.setModelMarkers(this.model, 'codecraft-cpp', []);
    }
    this.model = null;
  }

  dispose() {
    this.clearEditor();
    this.providerDisposables.forEach(disposable => disposable.dispose());
    this.providerDisposables = [];
    this.initialized = false;
  }

  private setupDiagnostics(editor: monaco.editor.IStandaloneCodeEditor) {
    this.clearEditor();

    const updateModel = () => {
      this.modelChangeListener?.dispose();
      this.modelChangeListener = null;
      this.model = editor.getModel();

      const languageId = this.model?.getLanguageId();
      if (this.model && (languageId === 'c' || languageId === 'cpp')) {
        this.refreshDiagnostics();
        this.modelChangeListener = this.model.onDidChangeContent(() => this.debouncedDiagnostics());
      } else {
        this.model = null;
      }
    };

    updateModel();
    this.editorChangeListener = editor.onDidChangeModel(() => updateModel());
  }

  private registerProviders(id: 'c' | 'cpp') {
    const standardItems = id === 'cpp' ? [...C_STANDARD_ITEMS, ...CPP_STANDARD_ITEMS] : C_STANDARD_ITEMS;
    const snippets = id === 'cpp' ? [...C_SNIPPETS, ...CPP_SNIPPETS] : C_SNIPPETS;
    const keywords = id === 'cpp' ? CPP_KEYWORDS : C_KEYWORDS;

    this.providerDisposables.push(monaco.languages.registerCompletionItemProvider(id, {
      triggerCharacters: ['.', '>', ':', '#', '<', '"'],
      provideCompletionItems: (model, position) => {
        const word = model.getWordUntilPosition(position);
        const range = new monaco.Range(position.lineNumber, word.startColumn, position.lineNumber, word.endColumn);
        const linePrefix = model.getLineContent(position.lineNumber).slice(0, position.column - 1);
        const includeMatch = linePrefix.match(/^\s*#\s*include\s+["<]([^">]*)$/);

        if (includeMatch) {
          const typed = includeMatch[1] || '';
          const localHeaders = this.projectFilesProvider()
            .filter(file => /\.(?:h|hh|hpp|hxx|ipp|tpp)$/i.test(file.path))
            .map(file => file.path)
            .filter(path => path.includes(typed) || path.split('/').pop()?.startsWith(typed))
            .map(path => ({
              label: path,
              kind: monaco.languages.CompletionItemKind.File,
              detail: 'workspace header',
              insertText: path,
              range,
            }));
          return { suggestions: localHeaders };
        }

        const directiveSuggestions = PREPROCESSOR_DIRECTIVES.map(label => ({
          label,
          kind: monaco.languages.CompletionItemKind.Keyword,
          insertText: label,
          range,
        }));
        const keywordSuggestions = keywords.map(label => ({
          label,
          kind: monaco.languages.CompletionItemKind.Keyword,
          insertText: label,
          range,
        }));
        const standardSuggestions = standardItems.map(item => ({
          label: item.label,
          kind: monaco.languages.CompletionItemKind.Function,
          detail: item.signature,
          documentation: { value: `${item.doc}\n\nDeclared in \`${item.detail}\`.` },
          insertText: item.label,
          range,
        }));
        const snippetSuggestions = snippets.map(item => ({
          label: item.label,
          kind: monaco.languages.CompletionItemKind.Snippet,
          detail: item.detail,
          insertText: item.insertText,
          insertTextRules: monaco.languages.CompletionItemInsertTextRule.InsertAsSnippet,
          range,
        }));

        return {
          suggestions: [
            ...snippetSuggestions,
            ...standardSuggestions,
            ...directiveSuggestions,
            ...keywordSuggestions,
          ],
        };
      },
    }));

    this.providerDisposables.push(monaco.languages.registerSignatureHelpProvider(id, {
      signatureHelpTriggerCharacters: ['(', ','],
      provideSignatureHelp: (model, position) => {
        const callName = findCallNameBeforePosition(model, position);
        const sig = SIGNATURES.get(callName);
        if (!sig) return undefined;
        const line = model.getLineContent(position.lineNumber).slice(0, position.column - 1);
        const activeParameter = Math.max(0, (line.match(/,/g) || []).length);
        return {
          value: {
            activeSignature: 0,
            activeParameter,
            signatures: [{
              label: sig.label,
              documentation: sig.documentation,
              parameters: (sig.parameters || []).map(label => ({ label })),
            }],
          },
          dispose: () => {},
        };
      },
    }));

    this.providerDisposables.push(monaco.languages.registerHoverProvider(id, {
      provideHover: (model, position) => {
        const word = model.getWordAtPosition(position);
        if (!word) return undefined;
        const contents = HOVER_DOCS.get(word.word);
        if (!contents) return undefined;
        return {
          range: new monaco.Range(position.lineNumber, word.startColumn, position.lineNumber, word.endColumn),
          contents: [{ value: contents }],
        };
      },
    }));

    this.providerDisposables.push(monaco.languages.registerDocumentSymbolProvider(id, {
      provideDocumentSymbols: (model) => this.provideDocumentSymbols(model),
    }));
  }

  private provideDocumentSymbols(model: monaco.editor.ITextModel): monaco.languages.DocumentSymbol[] {
    const symbols: monaco.languages.DocumentSymbol[] = [];
    const text = model.getValue();
    const patterns: { regex: RegExp; kind: monaco.languages.SymbolKind }[] = [
      { regex: /^\s*(?:template\s*<[^>]+>\s*)?(?:[\w:*&<>,\s~]+?)\s+([A-Za-z_]\w*)\s*\([^;{}]*\)\s*(?:const\s*)?(?:noexcept\s*)?\{/gm, kind: monaco.languages.SymbolKind.Function },
      { regex: /^\s*(?:class|struct)\s+([A-Za-z_]\w*)/gm, kind: monaco.languages.SymbolKind.Class },
      { regex: /^\s*enum(?:\s+class)?\s+([A-Za-z_]\w*)/gm, kind: monaco.languages.SymbolKind.Enum },
      { regex: /^\s*#\s*define\s+([A-Za-z_]\w*)/gm, kind: monaco.languages.SymbolKind.Constant },
    ];

    for (const { regex, kind } of patterns) {
      for (const match of text.matchAll(regex)) {
        const name = match[1];
        if (!name) continue;
        const startOffset = match.index || 0;
        const start = model.getPositionAt(startOffset);
        const end = model.getPositionAt(startOffset + match[0].length);
        const range = new monaco.Range(start.lineNumber, start.column, end.lineNumber, end.column);
        symbols.push({
          name,
          detail: '',
          kind,
          tags: [],
          range,
          selectionRange: range,
          children: [],
        });
      }
    }

    return symbols.sort((left, right) => {
      if (left.range.startLineNumber !== right.range.startLineNumber) {
        return left.range.startLineNumber - right.range.startLineNumber;
      }
      return left.name.localeCompare(right.name);
    });
  }

  private refreshDiagnostics() {
    const model = this.model;
    if (!model) return;
    const languageId = model.getLanguageId();
    if (languageId !== 'c' && languageId !== 'cpp') return;

    const markers: monaco.editor.IMarkerData[] = [];
    const text = model.getValue();
    const projectPaths = new Set(this.projectFilesProvider().map(file => normalizeProjectPath(file.path)));
    const modelPath = normalizeProjectPath(currentModelPath(model));

    this.collectLexicalDiagnostics(model, text, markers);
    this.collectIncludeDiagnostics(model, text, modelPath, projectPaths, markers);

    monaco.editor.setModelMarkers(model, 'codecraft-cpp', markers);
  }

  private collectIncludeDiagnostics(
    model: monaco.editor.ITextModel,
    text: string,
    modelPath: string,
    projectPaths: Set<string>,
    markers: monaco.editor.IMarkerData[]
  ) {
    const includePattern = /^\s*#\s*include\s+"([^"]+)"/gm;
    for (const match of text.matchAll(includePattern)) {
      const includePath = match[1] || '';
      if (!includePath) continue;
      const resolved = resolveIncludePath(modelPath, includePath);
      const rootResolved = normalizeProjectPath(includePath);
      if (projectPaths.has(resolved) || projectPaths.has(rootResolved)) continue;

      const startOffset = (match.index || 0) + match[0].indexOf(includePath);
      const range = makeRange(model, startOffset, startOffset + includePath.length);
      markers.push({
        severity: monaco.MarkerSeverity.Warning,
        message: `Workspace header "${includePath}" was not found.`,
        startLineNumber: range.startLineNumber,
        startColumn: range.startColumn,
        endLineNumber: range.endLineNumber,
        endColumn: range.endColumn,
        source: 'CodeCraft C/C++',
      });
    }
  }

  private collectLexicalDiagnostics(
    model: monaco.editor.ITextModel,
    text: string,
    markers: monaco.editor.IMarkerData[]
  ) {
    const stack: { ch: string; offset: number }[] = [];
    let state: 'code' | 'line-comment' | 'block-comment' | 'string' | 'char' = 'code';
    let stateStart = 0;
    let escaped = false;
    const pairs: Record<string, string> = { ')': '(', ']': '[', '}': '{' };
    const openers = new Set(['(', '[', '{']);

    for (let i = 0; i < text.length; i++) {
      const ch = text[i];
      const next = text[i + 1];

      if (state === 'line-comment') {
        if (ch === '\n') state = 'code';
        continue;
      }

      if (state === 'block-comment') {
        if (ch === '*' && next === '/') {
          state = 'code';
          i++;
        }
        continue;
      }

      if (state === 'string' || state === 'char') {
        if (escaped) {
          escaped = false;
          continue;
        }
        if (ch === '\\') {
          escaped = true;
          continue;
        }
        if ((state === 'string' && ch === '"') || (state === 'char' && ch === "'")) {
          state = 'code';
          continue;
        }
        if (ch === '\n') {
          const range = makeRange(model, stateStart, i);
          markers.push({
            severity: monaco.MarkerSeverity.Error,
            message: `Unterminated ${state} literal.`,
            startLineNumber: range.startLineNumber,
            startColumn: range.startColumn,
            endLineNumber: range.endLineNumber,
            endColumn: range.endColumn,
            source: 'CodeCraft C/C++',
          });
          state = 'code';
        }
        continue;
      }

      if (ch === '/' && next === '/') {
        state = 'line-comment';
        i++;
        continue;
      }
      if (ch === '/' && next === '*') {
        state = 'block-comment';
        stateStart = i;
        i++;
        continue;
      }
      if (ch === '"') {
        state = 'string';
        stateStart = i;
        escaped = false;
        continue;
      }
      if (ch === "'") {
        state = 'char';
        stateStart = i;
        escaped = false;
        continue;
      }

      if (openers.has(ch)) {
        stack.push({ ch, offset: i });
        continue;
      }

      if (pairs[ch]) {
        const expected = pairs[ch];
        const last = stack[stack.length - 1];
        if (last?.ch === expected) {
          stack.pop();
          continue;
        }
        const range = makeRange(model, i);
        markers.push({
          severity: monaco.MarkerSeverity.Error,
          message: `Unexpected closing '${ch}'.`,
          startLineNumber: range.startLineNumber,
          startColumn: range.startColumn,
          endLineNumber: range.endLineNumber,
          endColumn: range.endColumn,
          source: 'CodeCraft C/C++',
        });
      }
    }

    if (state === 'block-comment') {
      const range = makeRange(model, stateStart, text.length);
      markers.push({
        severity: monaco.MarkerSeverity.Error,
        message: 'Unterminated block comment.',
        startLineNumber: range.startLineNumber,
        startColumn: range.startColumn,
        endLineNumber: range.endLineNumber,
        endColumn: range.endColumn,
        source: 'CodeCraft C/C++',
      });
    }

    for (const entry of stack.slice(-20)) {
      const range = makeRange(model, entry.offset);
      markers.push({
        severity: monaco.MarkerSeverity.Warning,
        message: `Unclosed '${entry.ch}'.`,
        startLineNumber: range.startLineNumber,
        startColumn: range.startColumn,
        endLineNumber: range.endLineNumber,
        endColumn: range.endColumn,
        source: 'CodeCraft C/C++',
      });
    }
  }
}

export const cxxService = new CxxLanguageService();
let _cxxReady: Promise<void> | null = null;

export function ensureCxxReady() {
  if (!_cxxReady) {
    _cxxReady = Promise.resolve().then(() => cxxService.initialize());
  }
  return _cxxReady;
}
