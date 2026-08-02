import type { NotebookLanguage } from './notebook-model';

/**
 * Planning only: this module never executes code, starts a process, changes the
 * working directory, or writes a file. UI/runtime adapters must explicitly handle
 * every returned plan, which keeps recognized-but-unavailable IPython and .NET
 * Interactive syntax from accidentally being sent to Python or Roslyn as code.
 */

export type NotebookMagicSupport = 'supported' | 'compatibility' | 'unsupported';
export type NotebookMagicSyntax = 'python-line' | 'python-cell' | 'dotnet-directive' | 'trailing-query';
export type NotebookRichCellFormat = 'html' | 'markdown' | 'svg' | 'latex' | 'javascript';
export type NotebookMagicCommand =
  | 'pwd'
  | 'cd'
  | 'ls'
  | 'env'
  | 'who'
  | 'whos'
  | 'reset'
  | 'run'
  | 'load'
  | 'history'
  | 'pinfo'
  | 'lsmagic'
  | 'magic'
  | 'quickref'
  | 'matplotlib'
  | 'pip';

export type NotebookCommandDisposition =
  | 'runtime'
  | 'workspace'
  | 'package-manager'
  | 'ui-help'
  | 'compatibility-noop';

export type NotebookUnsupportedCategory =
  | 'shell-process'
  | 'unavailable-language'
  | 'unavailable-polyglot'
  | 'unsupported-backend'
  | 'unknown-magic'
  | 'invalid-arguments'
  | 'invalid-combination';

export interface NotebookPlannedDirective {
  syntax: NotebookMagicSyntax;
  name: string;
  raw: string;
  arguments: string;
  support: NotebookMagicSupport;
}

interface NotebookPlanBase {
  kind: string;
  support: NotebookMagicSupport;
  /** Language selected after applying %%python/%%csharp or #!python/#!csharp. */
  language: NotebookLanguage;
  originalSource: string;
  directives: NotebookPlannedDirective[];
  summary: string;
}

export interface NotebookTimingConfiguration {
  mode: 'time' | 'timeit';
  number?: number;
  repeat?: number;
  quiet?: boolean;
  returnResult?: boolean;
  rawOptions: string[];
}

export interface NotebookCaptureConfiguration {
  variable: string | null;
  captureStdout: boolean;
  captureStderr: boolean;
  captureDisplay: boolean;
}

export interface NotebookExecutePlan extends NotebookPlanBase {
  kind: 'execute';
  support: 'supported';
  code: string;
  timing: NotebookTimingConfiguration | null;
  capture: NotebookCaptureConfiguration | null;
}

export interface NotebookRenderPlan extends NotebookPlanBase {
  kind: 'render';
  support: 'supported';
  format: NotebookRichCellFormat;
  mimeType: string;
  content: string;
  /** %%javascript intentionally requests local front-end execution. */
  executeInFrontend: boolean;
}

export interface NotebookCommandPlan extends NotebookPlanBase {
  kind: 'command';
  support: 'supported' | 'compatibility';
  command: NotebookMagicCommand;
  arguments: string;
  argumentTokens: string[];
  disposition: NotebookCommandDisposition;
  /** Code below a line magic; run it only after the command succeeds. */
  remainingCode: string;
  details: Record<string, unknown>;
}

export interface NotebookWriteFilePlan extends NotebookPlanBase {
  kind: 'write-file';
  support: 'supported';
  path: string;
  content: string;
  append: boolean;
}

export interface NotebookUnsupportedPlan extends NotebookPlanBase {
  kind: 'unsupported';
  support: 'unsupported';
  command: string;
  arguments: string;
  category: NotebookUnsupportedCategory;
  reason: string;
}

export type NotebookExecutionPlan =
  | NotebookExecutePlan
  | NotebookRenderPlan
  | NotebookCommandPlan
  | NotebookWriteFilePlan
  | NotebookUnsupportedPlan;

export interface NotebookMagicCatalogEntry {
  id: string;
  forms: string[];
  languages: Array<NotebookLanguage | 'all'>;
  support: NotebookMagicSupport;
  category: 'language' | 'rich-output' | 'execution' | 'workspace' | 'introspection' | 'packages' | 'compatibility' | 'unavailable';
  description: string;
}

interface ParsedDirectiveLine {
  syntax: NotebookMagicSyntax;
  name: string;
  arguments: string;
  raw: string;
  body: string;
}

interface MagicArgumentToken {
  value: string;
  start: number;
  end: number;
}

interface PlanContext {
  originalSource: string;
  directives: NotebookPlannedDirective[];
  depth: number;
}

const MAX_DIRECTIVE_DEPTH = 16;
const SHELL_CELL_MAGICS = new Set([
  'bash', 'sh', 'shell', 'script', 'cmd', 'powershell', 'pwsh', 'perl', 'ruby', 'node', 'system', 'sx',
]);
const UNAVAILABLE_DOTNET_LANGUAGES = new Set([
  'fsharp', 'f#', 'javascript', 'js', 'sql', 'kql', 'pwsh', 'powershell', 'mermaid',
]);
const UNAVAILABLE_DOTNET_POLYGLOT = new Set([
  'connect', 'share', 'value', 'set', 'import', 'send', 'about', 'help', 'kernel', 'choose-kernel',
]);

const RICH_CELL_FORMATS: Record<string, { format: NotebookRichCellFormat; mimeType: string; executeInFrontend: boolean }> = {
  html: { format: 'html', mimeType: 'text/html', executeInFrontend: false },
  markdown: { format: 'markdown', mimeType: 'text/markdown', executeInFrontend: false },
  svg: { format: 'svg', mimeType: 'image/svg+xml', executeInFrontend: false },
  latex: { format: 'latex', mimeType: 'text/latex', executeInFrontend: false },
  javascript: { format: 'javascript', mimeType: 'application/javascript', executeInFrontend: true },
};

const COMMAND_DISPOSITIONS: Record<NotebookMagicCommand, NotebookCommandDisposition> = {
  pwd: 'workspace',
  cd: 'workspace',
  ls: 'workspace',
  env: 'runtime',
  who: 'runtime',
  whos: 'runtime',
  reset: 'runtime',
  run: 'workspace',
  load: 'workspace',
  history: 'runtime',
  pinfo: 'runtime',
  lsmagic: 'ui-help',
  magic: 'ui-help',
  quickref: 'ui-help',
  matplotlib: 'compatibility-noop',
  pip: 'package-manager',
};

function firstMeaningfulLine(source: string): { line: string; body: string } | null {
  const lines = source.split(/\r\n|\n|\r/);
  const index = lines.findIndex(line => line.trim().length > 0);
  if (index < 0) return null;
  return {
    line: lines[index].trim(),
    body: [...lines.slice(0, index), ...lines.slice(index + 1)].join('\n'),
  };
}

function parseDirectiveLine(source: string): ParsedDirectiveLine | null {
  const first = firstMeaningfulLine(source);
  if (!first) return null;

  const cellMagic = first.line.match(/^%%([A-Za-z][\w#-]*)(?:\s+(.*))?$/s);
  if (cellMagic) {
    return {
      syntax: 'python-cell',
      name: cellMagic[1].toLowerCase(),
      arguments: (cellMagic[2] || '').trim(),
      raw: first.line,
      body: first.body,
    };
  }

  const lineMagic = first.line.match(/^%([A-Za-z][\w#-]*)(?:\s+(.*))?$/s);
  if (lineMagic) {
    return {
      syntax: 'python-line',
      name: lineMagic[1].toLowerCase(),
      arguments: (lineMagic[2] || '').trim(),
      raw: first.line,
      body: first.body,
    };
  }

  const dotnetDirective = first.line.match(/^#!([A-Za-z][\w#-]*)(?:\s+(.*))?$/s);
  if (dotnetDirective) {
    return {
      syntax: 'dotnet-directive',
      name: dotnetDirective[1].toLowerCase(),
      arguments: (dotnetDirective[2] || '').trim(),
      raw: first.line,
      body: first.body,
    };
  }

  return null;
}

function tokenizeMagicArgumentsWithSpans(value: string): MagicArgumentToken[] {
  const tokens: MagicArgumentToken[] = [];
  let token = '';
  let quote: '"' | "'" | null = null;
  let escaping = false;
  let started = false;
  let tokenStart = 0;

  const push = (end: number) => {
    if (!started) return;
    tokens.push({ value: token, start: tokenStart, end });
    token = '';
    started = false;
  };

  for (let index = 0; index < value.length; index += 1) {
    const character = value[index];
    if (!started) tokenStart = index;
    if (escaping) {
      token += character;
      escaping = false;
      started = true;
      continue;
    }
    if (character === '\\') {
      escaping = true;
      started = true;
      continue;
    }
    if (quote) {
      if (character === quote) quote = null;
      else token += character;
      started = true;
      continue;
    }
    if (character === '"' || character === "'") {
      quote = character;
      started = true;
      continue;
    }
    if (/\s/.test(character)) {
      push(index);
      continue;
    }
    token += character;
    started = true;
  }
  if (escaping) token += '\\';
  push(value.length);
  return tokens;
}

export function tokenizeMagicArguments(value: string): string[] {
  return tokenizeMagicArgumentsWithSpans(value).map(token => token.value);
}

function plannedDirective(
  directive: ParsedDirectiveLine,
  support: NotebookMagicSupport
): NotebookPlannedDirective {
  return {
    syntax: directive.syntax,
    name: directive.name,
    raw: directive.raw,
    arguments: directive.arguments,
    support,
  };
}

function unsupportedPlan(
  language: NotebookLanguage,
  context: PlanContext,
  directive: ParsedDirectiveLine | null,
  command: string,
  argumentText: string,
  category: NotebookUnsupportedCategory,
  reason: string,
  syntax: NotebookMagicSyntax = 'python-line'
): NotebookUnsupportedPlan {
  const fallbackDirective: NotebookPlannedDirective = {
    syntax,
    name: command,
    raw: command,
    arguments: argumentText,
    support: 'unsupported',
  };
  return {
    kind: 'unsupported',
    support: 'unsupported',
    language,
    originalSource: context.originalSource,
    directives: [
      ...context.directives,
      directive ? plannedDirective(directive, 'unsupported') : fallbackDirective,
    ],
    summary: `Unsupported notebook command: ${command}`,
    command,
    arguments: argumentText,
    category,
    reason,
  };
}

function executePlan(
  language: NotebookLanguage,
  context: PlanContext,
  code: string,
  timing: NotebookTimingConfiguration | null = null,
  capture: NotebookCaptureConfiguration | null = null,
  summary = `Execute ${language === 'python' ? 'Python' : 'C#'} cell`
): NotebookExecutePlan {
  return {
    kind: 'execute',
    support: 'supported',
    language,
    originalSource: context.originalSource,
    directives: context.directives,
    summary,
    code,
    timing,
    capture,
  };
}

function renderPlan(
  language: NotebookLanguage,
  context: PlanContext,
  directive: ParsedDirectiveLine,
  rich: { format: NotebookRichCellFormat; mimeType: string; executeInFrontend: boolean }
): NotebookRenderPlan {
  return {
    kind: 'render',
    support: 'supported',
    language,
    originalSource: context.originalSource,
    directives: [...context.directives, plannedDirective(directive, 'supported')],
    summary: rich.executeInFrontend
      ? 'Execute JavaScript in the notebook front end'
      : `Render ${rich.format} cell`,
    format: rich.format,
    mimeType: rich.mimeType,
    content: directive.body,
    executeInFrontend: rich.executeInFrontend,
  };
}

function commandPlan(
  language: NotebookLanguage,
  context: PlanContext,
  directive: ParsedDirectiveLine,
  command: NotebookMagicCommand,
  support: 'supported' | 'compatibility' = 'supported',
  details: Record<string, unknown> = {}
): NotebookCommandPlan {
  return {
    kind: 'command',
    support,
    language,
    originalSource: context.originalSource,
    directives: [...context.directives, plannedDirective(directive, support)],
    summary: support === 'compatibility'
      ? `Apply ${directive.raw} compatibility behavior`
      : `Handle %${command}`,
    command,
    arguments: directive.arguments,
    argumentTokens: tokenizeMagicArguments(directive.arguments),
    disposition: COMMAND_DISPOSITIONS[command],
    remainingCode: directive.body,
    details,
  };
}

function parsePositiveInteger(value: string | undefined): number | undefined {
  if (!value || !/^\d+$/.test(value)) return undefined;
  const parsed = Number(value);
  return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : undefined;
}

function parseTimeitArguments(
  raw: string,
  cellBody: string,
  isCellMagic: boolean
): { configuration: NotebookTimingConfiguration; code: string; error?: string } {
  const tokens = tokenizeMagicArgumentsWithSpans(raw);
  const optionTokens: string[] = [];
  const codeTokens: string[] = [];
  let number: number | undefined;
  let repeat: number | undefined;
  let quiet = false;
  let returnResult = false;

  for (let index = 0; index < tokens.length; index += 1) {
    const token = tokens[index].value;
    if (token === '-n' || token === '--number') {
      const value = tokens[++index]?.value;
      const parsed = parsePositiveInteger(value);
      if (!parsed) return { configuration: { mode: 'timeit', rawOptions: optionTokens }, code: '', error: `${token} needs a positive integer.` };
      number = parsed;
      optionTokens.push(token, value!);
      continue;
    }
    if (token.startsWith('--number=')) {
      const parsed = parsePositiveInteger(token.slice('--number='.length));
      if (!parsed) return { configuration: { mode: 'timeit', rawOptions: optionTokens }, code: '', error: '--number needs a positive integer.' };
      number = parsed;
      optionTokens.push(token);
      continue;
    }
    if (token === '-r' || token === '--repeat') {
      const value = tokens[++index]?.value;
      const parsed = parsePositiveInteger(value);
      if (!parsed) return { configuration: { mode: 'timeit', rawOptions: optionTokens }, code: '', error: `${token} needs a positive integer.` };
      repeat = parsed;
      optionTokens.push(token, value!);
      continue;
    }
    if (token.startsWith('--repeat=')) {
      const parsed = parsePositiveInteger(token.slice('--repeat='.length));
      if (!parsed) return { configuration: { mode: 'timeit', rawOptions: optionTokens }, code: '', error: '--repeat needs a positive integer.' };
      repeat = parsed;
      optionTokens.push(token);
      continue;
    }
    if (token === '-q' || token === '--quiet') {
      quiet = true;
      optionTokens.push(token);
      continue;
    }
    if (token === '-o') {
      returnResult = true;
      optionTokens.push(token);
      continue;
    }
    if (token.startsWith('-')) {
      return { configuration: { mode: 'timeit', rawOptions: optionTokens }, code: '', error: `Unsupported %timeit option: ${token}` };
    }
    codeTokens.push(raw.slice(tokens[index].start));
    break;
  }

  const inlineCode = codeTokens.join(' ');
  const code = isCellMagic
    ? cellBody
    : [inlineCode, cellBody].filter(part => part.trim()).join('\n');
  return {
    configuration: {
      mode: 'timeit',
      number,
      repeat,
      quiet,
      returnResult,
      rawOptions: optionTokens,
    },
    code,
  };
}

function parseCaptureArguments(raw: string): { capture?: NotebookCaptureConfiguration; error?: string } {
  const tokens = tokenizeMagicArguments(raw);
  let variable: string | null = null;
  let captureStdout = true;
  let captureStderr = true;
  let captureDisplay = true;

  for (const token of tokens) {
    if (token === '--no-stdout') captureStdout = false;
    else if (token === '--no-stderr') captureStderr = false;
    else if (token === '--no-display') captureDisplay = false;
    else if (token.startsWith('-')) return { error: `Unsupported %%capture option: ${token}` };
    else if (variable === null) variable = token;
    else return { error: '%%capture accepts at most one capture variable.' };
  }
  return { capture: { variable, captureStdout, captureStderr, captureDisplay } };
}

function planWriteFile(
  language: NotebookLanguage,
  context: PlanContext,
  directive: ParsedDirectiveLine
): NotebookExecutionPlan {
  const tokens = tokenizeMagicArguments(directive.arguments);
  let append = false;
  const paths: string[] = [];
  for (const token of tokens) {
    if (token === '-a' || token === '--append') append = true;
    else if (token.startsWith('-')) {
      return unsupportedPlan(
        language,
        context,
        directive,
        directive.name,
        directive.arguments,
        'invalid-arguments',
        `Unsupported ${directive.raw.split(/\s/, 1)[0]} option: ${token}`
      );
    } else paths.push(token);
  }
  if (paths.length !== 1) {
    return unsupportedPlan(
      language,
      context,
      directive,
      directive.name,
      directive.arguments,
      'invalid-arguments',
      `${directive.raw.split(/\s/, 1)[0]} requires exactly one workspace file path.`
    );
  }
  return {
    kind: 'write-file',
    support: 'supported',
    language,
    originalSource: context.originalSource,
    directives: [...context.directives, plannedDirective(directive, 'supported')],
    summary: `${append ? 'Append to' : 'Write'} workspace file ${paths[0]}`,
    path: paths[0],
    content: directive.body,
    append,
  };
}

function planMatplotlib(
  language: NotebookLanguage,
  context: PlanContext,
  directive: ParsedDirectiveLine
): NotebookExecutionPlan {
  if (language !== 'python') {
    return unsupportedPlan(
      language,
      context,
      directive,
      'matplotlib',
      directive.arguments,
      'unavailable-language',
      '%matplotlib is available only for Python notebook cells.'
    );
  }
  const backend = tokenizeMagicArguments(directive.arguments)[0]?.toLowerCase() ?? '';
  if (!backend || backend === 'inline' || backend === 'notebook') {
    return commandPlan(language, context, directive, 'matplotlib', 'compatibility', {
      backend: backend || 'inline',
      note: 'CodeCraft already captures supported rich display output inline; no desktop GUI backend is started.',
    });
  }
  return unsupportedPlan(
    language,
    context,
    directive,
    'matplotlib',
    directive.arguments,
    'unsupported-backend',
    `The '${backend}' Matplotlib backend is not available in CodeCraft. Use %matplotlib inline.`
  );
}

function commandDetails(command: NotebookMagicCommand, args: string[]): Record<string, unknown> {
  switch (command) {
    case 'cd':
      return { path: args.join(' ') || null };
    case 'ls':
      return { path: args.join(' ') || null };
    case 'run':
      return { path: args[0] ?? null, argv: args.slice(1) };
    case 'load':
      return { path: args[0] ?? null };
    case 'pinfo':
      return { target: args.join(' '), detailLevel: 1 };
    case 'env': {
      const joined = args.join(' ');
      const equals = joined.indexOf('=');
      return equals >= 0
        ? { action: 'set', name: joined.slice(0, equals).trim(), value: joined.slice(equals + 1) }
        : args.length >= 2
          ? { action: 'set', name: args[0], value: args.slice(1).join(' ') }
          : { action: args.length ? 'get' : 'list', name: joined || null };
    }
    case 'reset':
      return { force: args.includes('-f') || args.includes('--force') };
    case 'pip':
      return { operation: args[0] ?? 'list', packageArguments: args.slice(1) };
    default:
      return {};
  }
}

function planSimpleCommand(
  language: NotebookLanguage,
  context: PlanContext,
  directive: ParsedDirectiveLine,
  command: NotebookMagicCommand
): NotebookExecutionPlan {
  if (command === 'matplotlib') return planMatplotlib(language, context, directive);
  if (command === 'pip' && language !== 'python') {
    return unsupportedPlan(
      language,
      context,
      directive,
      'pip',
      directive.arguments,
      'unavailable-language',
      '%pip manages the Python environment and is unavailable in a C# cell.'
    );
  }
  const args = tokenizeMagicArguments(directive.arguments);
  if ((command === 'run' || command === 'load') && !args[0]) {
    return unsupportedPlan(
      language,
      context,
      directive,
      command,
      directive.arguments,
      'invalid-arguments',
      `%${command} requires a workspace file path.`
    );
  }
  return commandPlan(language, context, directive, command, 'supported', commandDetails(command, args));
}

function withDirective(
  context: PlanContext,
  directive: ParsedDirectiveLine,
  support: NotebookMagicSupport
): PlanContext {
  return {
    ...context,
    directives: [...context.directives, plannedDirective(directive, support)],
    depth: context.depth + 1,
  };
}

function applyTimingToPlan(
  plan: NotebookExecutionPlan,
  timing: NotebookTimingConfiguration,
  language: NotebookLanguage,
  context: PlanContext,
  directive: ParsedDirectiveLine
): NotebookExecutionPlan {
  if (plan.kind !== 'execute') {
    return unsupportedPlan(
      language,
      context,
      directive,
      directive.name,
      directive.arguments,
      'invalid-combination',
      `${directive.raw} must be followed by executable Python or C# code.`
    );
  }
  return {
    ...plan,
    timing,
    summary: timing.mode === 'timeit' ? `Benchmark ${plan.language} cell` : `Time ${plan.language} cell`,
  };
}

function planDotnetDirective(
  directive: ParsedDirectiveLine,
  language: NotebookLanguage,
  context: PlanContext
): NotebookExecutionPlan {
  if (directive.name === 'python' || directive.name === 'csharp' || directive.name === 'cs') {
    const nextLanguage: NotebookLanguage = directive.name === 'python' ? 'python' : 'csharp';
    return planInternal(directive.body, nextLanguage, withDirective(context, directive, 'supported'));
  }

  const rich = RICH_CELL_FORMATS[directive.name];
  if (rich && (directive.name === 'html' || directive.name === 'markdown')) {
    return renderPlan(language, context, directive, rich);
  }

  if (directive.name === 'time') {
    const nextContext = withDirective(context, directive, 'supported');
    const nested = planInternal(directive.body, language, nextContext);
    return applyTimingToPlan(
      nested,
      { mode: 'time', rawOptions: tokenizeMagicArguments(directive.arguments) },
      language,
      context,
      directive
    );
  }

  if (directive.name === 'reset' || directive.name === 'lsmagic' || directive.name === 'who' || directive.name === 'whos') {
    return planSimpleCommand(language, context, directive, directive.name as NotebookMagicCommand);
  }

  if (UNAVAILABLE_DOTNET_LANGUAGES.has(directive.name)) {
    return unsupportedPlan(
      language,
      context,
      directive,
      `#!${directive.name}`,
      directive.arguments,
      directive.name === 'pwsh' || directive.name === 'powershell' ? 'shell-process' : 'unavailable-language',
      `The #!${directive.name} kernel is not available. CodeCraft notebooks currently execute only Python and C# locally.`
    );
  }
  if (UNAVAILABLE_DOTNET_POLYGLOT.has(directive.name)) {
    return unsupportedPlan(
      language,
      context,
      directive,
      `#!${directive.name}`,
      directive.arguments,
      'unavailable-polyglot',
      `The #!${directive.name} polyglot directive requires a .NET Interactive kernel service that CodeCraft does not host.`
    );
  }
  return unsupportedPlan(
    language,
    context,
    directive,
    `#!${directive.name}`,
    directive.arguments,
    'unknown-magic',
    `CodeCraft does not recognize the #!${directive.name} directive.`
  );
}

function planCellMagic(
  directive: ParsedDirectiveLine,
  language: NotebookLanguage,
  context: PlanContext
): NotebookExecutionPlan {
  if (directive.name === 'python' || directive.name === 'csharp' || directive.name === 'cs') {
    const nextLanguage: NotebookLanguage = directive.name === 'python' ? 'python' : 'csharp';
    return planInternal(directive.body, nextLanguage, withDirective(context, directive, 'supported'));
  }

  const rich = RICH_CELL_FORMATS[directive.name];
  if (rich) return renderPlan(language, context, directive, rich);

  if (directive.name === 'time') {
    return executePlan(
      language,
      withDirective(context, directive, 'supported'),
      directive.body,
      { mode: 'time', rawOptions: tokenizeMagicArguments(directive.arguments) },
      null,
      `Time ${language === 'python' ? 'Python' : 'C#'} cell`
    );
  }

  if (directive.name === 'timeit') {
    const parsed = parseTimeitArguments(directive.arguments, directive.body, true);
    if (parsed.error) {
      return unsupportedPlan(language, context, directive, '%%timeit', directive.arguments, 'invalid-arguments', parsed.error);
    }
    return executePlan(
      language,
      withDirective(context, directive, 'supported'),
      parsed.code,
      parsed.configuration,
      null,
      `Benchmark ${language === 'python' ? 'Python' : 'C#'} cell`
    );
  }

  if (directive.name === 'capture') {
    if (language !== 'python') {
      return unsupportedPlan(
        language,
        context,
        directive,
        '%%capture',
        directive.arguments,
        'unavailable-language',
        '%%capture is an IPython compatibility feature and is available only in Python cells.'
      );
    }
    const parsed = parseCaptureArguments(directive.arguments);
    if (!parsed.capture) {
      return unsupportedPlan(language, context, directive, '%%capture', directive.arguments, 'invalid-arguments', parsed.error || 'Invalid %%capture arguments.');
    }
    return executePlan(
      language,
      withDirective(context, directive, 'supported'),
      directive.body,
      null,
      parsed.capture,
      'Execute Python cell with captured output'
    );
  }

  if (directive.name === 'writefile' || directive.name === 'file') {
    return planWriteFile(language, context, directive);
  }

  if (SHELL_CELL_MAGICS.has(directive.name)) {
    return unsupportedPlan(
      language,
      context,
      directive,
      `%%${directive.name}`,
      directive.arguments,
      'shell-process',
      `%%${directive.name} would start an external shell or process. CodeCraft notebook execution is local and does not expose a host process runner.`
    );
  }

  return unsupportedPlan(
    language,
    context,
    directive,
    `%%${directive.name}`,
    directive.arguments,
    'unknown-magic',
    `CodeCraft does not recognize the %%${directive.name} cell magic.`
  );
}

function planLineMagic(
  directive: ParsedDirectiveLine,
  language: NotebookLanguage,
  context: PlanContext
): NotebookExecutionPlan {
  if (directive.name === 'time') {
    const code = [directive.arguments, directive.body].filter(part => part.trim()).join('\n');
    if (!code.trim()) {
      return unsupportedPlan(language, context, directive, '%time', directive.arguments, 'invalid-arguments', '%time requires an expression or statement.');
    }
    return executePlan(
      language,
      withDirective(context, directive, 'supported'),
      code,
      { mode: 'time', rawOptions: [] },
      null,
      `Time ${language === 'python' ? 'Python' : 'C#'} expression`
    );
  }

  if (directive.name === 'timeit') {
    const parsed = parseTimeitArguments(directive.arguments, directive.body, false);
    if (parsed.error || !parsed.code.trim()) {
      return unsupportedPlan(
        language,
        context,
        directive,
        '%timeit',
        directive.arguments,
        'invalid-arguments',
        parsed.error || '%timeit requires an expression or statement.'
      );
    }
    return executePlan(
      language,
      withDirective(context, directive, 'supported'),
      parsed.code,
      parsed.configuration,
      null,
      `Benchmark ${language === 'python' ? 'Python' : 'C#'} expression`
    );
  }

  const commandNames = new Set<NotebookMagicCommand>([
    'pwd', 'cd', 'ls', 'env', 'who', 'whos', 'reset', 'run', 'load', 'history',
    'pinfo', 'lsmagic', 'magic', 'quickref', 'matplotlib', 'pip',
  ]);
  if (commandNames.has(directive.name as NotebookMagicCommand)) {
    return planSimpleCommand(language, context, directive, directive.name as NotebookMagicCommand);
  }

  if (directive.name === 'system' || directive.name === 'sx' || SHELL_CELL_MAGICS.has(directive.name)) {
    return unsupportedPlan(
      language,
      context,
      directive,
      `%${directive.name}`,
      directive.arguments,
      'shell-process',
      `%${directive.name} requires an external shell or process, which CodeCraft notebooks do not expose.`
    );
  }

  return unsupportedPlan(
    language,
    context,
    directive,
    `%${directive.name}`,
    directive.arguments,
    'unknown-magic',
    `CodeCraft does not recognize the %${directive.name} line magic.`
  );
}

function planTrailingQuery(
  source: string,
  language: NotebookLanguage,
  context: PlanContext
): NotebookCommandPlan | null {
  const trimmed = source.trim();
  const match = trimmed.match(/^(.+?)(\?\??)$/s);
  if (!match || !match[1].trim()) return null;
  const target = match[1].trim();
  const detailLevel = match[2] === '??' ? 2 : 1;
  const directive: ParsedDirectiveLine = {
    syntax: 'trailing-query',
    name: 'pinfo',
    raw: `${target}${match[2]}`,
    arguments: target,
    body: '',
  };
  return commandPlan(language, context, directive, 'pinfo', 'supported', { target, detailLevel });
}

function planInternal(
  source: string,
  language: NotebookLanguage,
  context: PlanContext
): NotebookExecutionPlan {
  if (context.depth >= MAX_DIRECTIVE_DEPTH) {
    return unsupportedPlan(
      language,
      context,
      null,
      'directive-chain',
      '',
      'invalid-combination',
      `A notebook cell may contain at most ${MAX_DIRECTIVE_DEPTH} leading language/time directives.`
    );
  }

  const first = firstMeaningfulLine(source);
  if (language === 'python' && first && /^!!?(?!#)/.test(first.line)) {
    return unsupportedPlan(
      language,
      context,
      null,
      first.line.split(/\s/, 1)[0],
      first.line.replace(/^!!?/, '').trim(),
      'shell-process',
      'IPython ! and !! process escapes are recognized but unavailable because CodeCraft notebooks do not expose a host shell.'
    );
  }

  const directive = parseDirectiveLine(source);
  if (directive?.syntax === 'python-cell') return planCellMagic(directive, language, context);
  if (directive?.syntax === 'python-line') return planLineMagic(directive, language, context);
  if (directive?.syntax === 'dotnet-directive') return planDotnetDirective(directive, language, context);

  const trailingQuery = planTrailingQuery(source, language, context);
  return trailingQuery ?? executePlan(language, context, source);
}

export function planNotebookCell(
  source: string,
  defaultLanguage: NotebookLanguage
): NotebookExecutionPlan {
  const normalizedSource = String(source ?? '');
  return planInternal(normalizedSource, defaultLanguage, {
    originalSource: normalizedSource,
    directives: [],
    depth: 0,
  });
}

/** More explicit alias for runtime/UI call sites. */
export const planNotebookCellExecution = planNotebookCell;

export const NOTEBOOK_MAGIC_CATALOG: readonly NotebookMagicCatalogEntry[] = [
  {
    id: 'language-switches',
    forms: ['%%python', '%%csharp', '#!python', '#!csharp', '#!cs'],
    languages: ['all'],
    support: 'supported',
    category: 'language',
    description: 'Run the cell in the selected local Python or C# script context.',
  },
  {
    id: 'rich-cells',
    forms: ['%%html', '%%markdown', '%%svg', '%%latex', '%%javascript', '#!html', '#!markdown'],
    languages: ['all'],
    support: 'supported',
    category: 'rich-output',
    description: 'Render rich content inline; JavaScript is explicitly marked for sandboxed front-end execution.',
  },
  {
    id: 'time',
    forms: ['%time EXPR', '%%time', '#!time'],
    languages: ['all'],
    support: 'supported',
    category: 'execution',
    description: 'Measure one execution of an expression or cell.',
  },
  {
    id: 'timeit',
    forms: ['%timeit [-n N] [-r R] EXPR', '%%timeit [-n N] [-r R]'],
    languages: ['all'],
    support: 'supported',
    category: 'execution',
    description: 'Plan repeatable local benchmarking without pretending to use an IPython kernel.',
  },
  {
    id: 'capture',
    forms: ['%%capture [--no-stdout] [--no-stderr] [--no-display] [NAME]'],
    languages: ['python'],
    support: 'supported',
    category: 'execution',
    description: 'Capture selected Python stream/display output for the cell.',
  },
  {
    id: 'write-file',
    forms: ['%%writefile [-a] PATH', '%%file [-a] PATH'],
    languages: ['all'],
    support: 'supported',
    category: 'workspace',
    description: 'Write or append the cell body to a CodeCraft workspace file.',
  },
  {
    id: 'workspace',
    forms: ['%pwd', '%cd PATH', '%ls [PATH]', '%run PATH [ARGS...]', '%load PATH'],
    languages: ['all'],
    support: 'supported',
    category: 'workspace',
    description: 'Inspect or operate on CodeCraft’s local project workspace.',
  },
  {
    id: 'environment',
    forms: ['%env [NAME[=VALUE]]', '%pip [COMMAND] [ARGS...]'],
    languages: ['python'],
    support: 'supported',
    category: 'packages',
    description: 'Plan Python environment and package-manager operations through CodeCraft.',
  },
  {
    id: 'introspection',
    forms: ['%who', '%whos', '%history', '%pinfo NAME', 'NAME?', 'NAME??', '#!who', '#!whos'],
    languages: ['all'],
    support: 'supported',
    category: 'introspection',
    description: 'Inspect the active local script context and notebook history.',
  },
  {
    id: 'reset',
    forms: ['%reset [-f]', '#!reset'],
    languages: ['all'],
    support: 'supported',
    category: 'execution',
    description: 'Request an explicit reset of the notebook’s local script context.',
  },
  {
    id: 'help',
    forms: ['%lsmagic', '%magic', '%quickref', '#!lsmagic'],
    languages: ['all'],
    support: 'supported',
    category: 'introspection',
    description: 'Show the CodeCraft notebook magic catalog or concise help.',
  },
  {
    id: 'matplotlib-inline',
    forms: ['%matplotlib', '%matplotlib inline', '%matplotlib notebook'],
    languages: ['python'],
    support: 'compatibility',
    category: 'compatibility',
    description: 'Accepted as an inline-display compatibility request; desktop GUI backends are unavailable.',
  },
  {
    id: 'shell-process',
    forms: ['!COMMAND', '!!COMMAND', '%system', '%sx', '%%bash', '%%sh', '%%script', '%%cmd', '%%pwsh'],
    languages: ['all'],
    support: 'unsupported',
    category: 'unavailable',
    description: 'Recognized but unavailable: notebooks do not expose a host shell or arbitrary process runner.',
  },
  {
    id: 'polyglot-kernels',
    forms: ['#!fsharp', '#!javascript', '#!sql', '#!kql', '#!pwsh'],
    languages: ['all'],
    support: 'unsupported',
    category: 'unavailable',
    description: 'Recognized but unavailable: only local Python and C# script contexts are implemented.',
  },
  {
    id: 'polyglot-services',
    forms: ['#!connect', '#!share', '#!value', '#!set', '#!import'],
    languages: ['all'],
    support: 'unsupported',
    category: 'unavailable',
    description: 'Recognized but unavailable without a hosted .NET Interactive/polyglot kernel service.',
  },
];

export function getNotebookMagicCatalog(
  language?: NotebookLanguage,
  includeUnsupported = true
): NotebookMagicCatalogEntry[] {
  return NOTEBOOK_MAGIC_CATALOG
    .filter(entry => includeUnsupported || entry.support !== 'unsupported')
    .filter(entry => !language || entry.languages.includes('all') || entry.languages.includes(language))
    .map(entry => ({ ...entry, forms: [...entry.forms], languages: [...entry.languages] }));
}

export function getNotebookMagicHelpText(
  language?: NotebookLanguage,
  includeUnsupported = true
): string {
  const catalog = getNotebookMagicCatalog(language, includeUnsupported);
  const groups = new Map<string, NotebookMagicCatalogEntry[]>();
  for (const entry of catalog) {
    const current = groups.get(entry.category) ?? [];
    current.push(entry);
    groups.set(entry.category, current);
  }

  const sections = [...groups.entries()].map(([category, entries]) => [
    category.replace(/(^|-)([a-z])/g, (_match, prefix, letter) => `${prefix ? ' ' : ''}${letter.toUpperCase()}`),
    ...entries.map(entry => (
      `  ${entry.forms.join(', ')}\n    [${entry.support}] ${entry.description}`
    )),
  ].join('\n'));
  return `CodeCraft notebook magics (${language ?? 'Python and C#'})\n\n${sections.join('\n\n')}`;
}

export const NOTEBOOK_MAGIC_HELP_TEXT = getNotebookMagicHelpText();
