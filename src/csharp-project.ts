/**
 * Browser-safe C# project discovery and compiler-option resolution.
 *
 * This module intentionally does not attempt to host MSBuild. It evaluates the
 * subset of SDK-style project XML that directly controls Roslyn compilation in
 * CodeCraft's fixed Release|AnyCPU environment. Keeping this logic pure makes
 * the exact same serializable configuration usable by authoring and execution.
 */

export interface CSharpWorkspaceFile {
  path: string;
  content: string;
}

export type CSharpNullableContext = 'Disable' | 'Enable' | 'Warnings' | 'Annotations';
export type CSharpOptimizationLevel = 'Debug' | 'Release';
export type CSharpPlatform =
  | 'AnyCPU'
  | 'AnyCPU32BitPreferred'
  | 'x86'
  | 'x64'
  | 'ARM'
  | 'ARM64';
export type CSharpOutputKind =
  | 'ConsoleApplication'
  | 'WindowsApplication'
  | 'DynamicallyLinkedLibrary'
  | 'NetModule'
  | 'WindowsRuntimeMetadata'
  | 'WindowsRuntimeApplication';

export interface CSharpProjectConfiguration {
  buildConfiguration: 'Release';
  platform: CSharpPlatform;
  targetFramework: string | null;
  languageVersion: string;
  nullable: CSharpNullableContext;
  allowUnsafeBlocks: boolean;
  checkForOverflowUnderflow: boolean;
  optimizationLevel: CSharpOptimizationLevel;
  defineConstants: string[];
  warningLevel: number;
  treatWarningsAsErrors: boolean;
  noWarn: string[];
  warningsAsErrors: string[];
  warningsNotAsErrors: string[];
  outputKind: CSharpOutputKind;
  mainTypeName: string | null;
  globalUsings: string[];
}

export interface CSharpProjectContext {
  mode: 'project' | 'unmanaged';
  currentPath: string;
  projectPath: string | null;
  projectDirectory: string;
  sourceFiles: CSharpWorkspaceFile[];
  configuration: CSharpProjectConfiguration;
  generatedGlobalUsingsSource: string;
  fingerprint: string;
}

export const DEFAULT_CSHARP_PROJECT_CONFIGURATION: Readonly<CSharpProjectConfiguration> = Object.freeze({
  buildConfiguration: 'Release',
  platform: 'AnyCPU',
  targetFramework: null,
  languageVersion: 'Preview',
  nullable: 'Disable',
  allowUnsafeBlocks: false,
  checkForOverflowUnderflow: false,
  optimizationLevel: 'Release',
  defineConstants: Object.freeze([]) as unknown as string[],
  warningLevel: 4,
  treatWarningsAsErrors: false,
  noWarn: Object.freeze([]) as unknown as string[],
  warningsAsErrors: Object.freeze([]) as unknown as string[],
  warningsNotAsErrors: Object.freeze([]) as unknown as string[],
  outputKind: 'ConsoleApplication',
  mainTypeName: null,
  globalUsings: Object.freeze([]) as unknown as string[],
});

interface XmlElement {
  name: string;
  attributes: Record<string, string>;
  children: XmlElement[];
  text: string;
}

interface UsingItem {
  identity: string;
  clause: string;
}

interface UsingOperation {
  kind: 'include' | 'remove';
  values: string[];
  alias: string;
  isStatic: boolean;
}

interface CompileItemOperation {
  kind: 'include' | 'remove';
  patterns: string[];
  excludes: string[];
}

interface ParsedCSharpProject {
  configuration: CSharpProjectConfiguration;
  sdkNames: string[];
  enableDefaultCompileItems: boolean;
  compileItemOperations: CompileItemOperation[];
}

interface EvaluatedCSharpProject {
  file: CSharpWorkspaceFile;
  parsed: ParsedCSharpProject;
  sourceFiles: CSharpWorkspaceFile[];
  nestedProjectPaths: string[];
}

const BASE_IMPLICIT_USINGS = [
  'System',
  'System.Collections.Generic',
  'System.IO',
  'System.Linq',
  'System.Net.Http',
  'System.Threading',
  'System.Threading.Tasks',
] as const;

const WEB_IMPLICIT_USINGS = [
  'System.Net.Http.Json',
  'Microsoft.AspNetCore.Builder',
  'Microsoft.AspNetCore.Hosting',
  'Microsoft.AspNetCore.Http',
  'Microsoft.AspNetCore.Routing',
  'Microsoft.Extensions.Configuration',
  'Microsoft.Extensions.DependencyInjection',
  'Microsoft.Extensions.Hosting',
  'Microsoft.Extensions.Logging',
] as const;

const BLAZOR_WEBASSEMBLY_IMPLICIT_USINGS = [
  'Microsoft.Extensions.Configuration',
  'Microsoft.Extensions.DependencyInjection',
  'Microsoft.Extensions.Logging',
] as const;

const WORKER_IMPLICIT_USINGS = [
  'Microsoft.Extensions.Configuration',
  'Microsoft.Extensions.DependencyInjection',
  'Microsoft.Extensions.Hosting',
  'Microsoft.Extensions.Logging',
] as const;

function compareText(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}

function normalizeWorkspacePath(path: string): string {
  const resolved: string[] = [];
  for (const rawPart of String(path ?? '').replace(/\\/g, '/').split('/')) {
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

function pathDirectory(path: string): string {
  const separator = path.lastIndexOf('/');
  return separator < 0 ? '' : path.slice(0, separator);
}

function isPathInDirectory(path: string, directory: string): boolean {
  return directory === '' || path === directory || path.startsWith(`${directory}/`);
}

function pathDepth(path: string): number {
  return path === '' ? 0 : path.split('/').length;
}

function isCSharpSourcePath(path: string): boolean {
  return /\.cs$/i.test(path);
}

function isCSharpProjectPath(path: string): boolean {
  return /\.csproj$/i.test(path);
}

function canonicalizeWorkspaceFiles(files: readonly CSharpWorkspaceFile[]): CSharpWorkspaceFile[] {
  const candidates = files
    .map(file => ({
      path: normalizeWorkspacePath(file?.path ?? ''),
      content: typeof file?.content === 'string' ? file.content : String(file?.content ?? ''),
    }))
    .filter(file => file.path !== '')
    .sort((left, right) => compareText(left.path, right.path) || compareText(left.content, right.content));

  // Workspace paths are expected to be unique. Coalescing accidental duplicates
  // by a content sort keeps project selection and fingerprints input-order stable.
  const result: CSharpWorkspaceFile[] = [];
  for (const candidate of candidates) {
    if (result[result.length - 1]?.path === candidate.path) continue;
    result.push(candidate);
  }
  return result;
}

function evaluateWorkspaceProjects(
  files: readonly CSharpWorkspaceFile[]
): EvaluatedCSharpProject[] {
  return files
    .filter(file => isCSharpProjectPath(file.path))
    .map(file => {
      const parsed = evaluateProjectXml(file.content);
      const scope = scopeProjectSources(files, file.path, parsed);
      return {
        file,
        parsed,
        sourceFiles: scope.sourceFiles,
        nestedProjectPaths: scope.nestedProjectPaths,
      };
    });
}

function compareProjectAffinity(
  left: EvaluatedCSharpProject,
  right: EvaluatedCSharpProject,
  currentDirectory: string
): number {
  const leftDirectory = pathDirectory(left.file.path);
  const rightDirectory = pathDirectory(right.file.path);
  const leftIsAncestor = isPathInDirectory(currentDirectory, leftDirectory);
  const rightIsAncestor = isPathInDirectory(currentDirectory, rightDirectory);
  if (leftIsAncestor !== rightIsAncestor) return leftIsAncestor ? -1 : 1;

  const depthDifference = pathDepth(rightDirectory) - pathDepth(leftDirectory);
  return depthDifference || compareText(left.file.path, right.file.path);
}

function selectProject(
  projects: readonly EvaluatedCSharpProject[],
  currentPath: string
): EvaluatedCSharpProject | null {
  const currentDirectory = pathDirectory(currentPath);
  if (isCSharpSourcePath(currentPath)) {
    // Compile ownership is stronger evidence than directory ancestry. In particular,
    // classic projects commonly link files from ../shared, so an opened linked file
    // must retain the project that explicitly includes it instead of falling into the
    // workspace-wide unmanaged compilation.
    const owners = projects
      .filter(project => project.sourceFiles.some(file => file.path === currentPath))
      .sort((left, right) => compareProjectAffinity(left, right, currentDirectory));
    if (owners.length > 0) return owners[0];
  }

  // An excluded or newly created file can still borrow the nearest ancestor's project
  // options even though it is not yet a Compile item.
  return projects
    .filter(project =>
      isPathInDirectory(currentDirectory, pathDirectory(project.file.path)))
    .sort((left, right) => compareProjectAffinity(left, right, currentDirectory))[0]
    ?? null;
}

function isDefaultBuildOutputSource(path: string, projectDirectory: string): boolean {
  const relativePath = projectDirectory === ''
    ? path
    : path.slice(projectDirectory.length + 1);
  const segments = relativePath.split('/');
  return segments.slice(0, -1).some(segment => /^(?:bin|obj)$/i.test(segment));
}

function scopeProjectSources(
  files: readonly CSharpWorkspaceFile[],
  projectPath: string | null,
  parsedProject?: ParsedCSharpProject
): { sourceFiles: CSharpWorkspaceFile[]; nestedProjectPaths: string[] } {
  if (projectPath === null) {
    return {
      sourceFiles: files.filter(file => isCSharpSourcePath(file.path)),
      nestedProjectPaths: [],
    };
  }

  const projectDirectory = pathDirectory(projectPath);
  const nestedProjects = files
    .filter(file => isCSharpProjectPath(file.path) && file.path !== projectPath)
    .filter(file => {
      const directory = pathDirectory(file.path);
      return directory !== projectDirectory && isPathInDirectory(directory, projectDirectory);
    })
    .sort((left, right) => compareText(left.path, right.path));
  const nestedProjectDirectories = nestedProjects.map(file => pathDirectory(file.path));

  const defaultSources = files
    .filter(file => isCSharpSourcePath(file.path))
    .filter(file => isPathInDirectory(file.path, projectDirectory))
    .filter(file => !isDefaultBuildOutputSource(file.path, projectDirectory))
    .filter(file => !nestedProjectDirectories.some(directory => isPathInDirectory(file.path, directory)));
  if (!parsedProject) {
    return {
      sourceFiles: defaultSources,
      nestedProjectPaths: nestedProjects.map(file => file.path),
    };
  }

  const allSources = files.filter(file => isCSharpSourcePath(file.path));
  const selected = new Map<string, CSharpWorkspaceFile>(
    (parsedProject.enableDefaultCompileItems ? defaultSources : [])
      .map(file => [file.path, file])
  );
  const resolvePattern = (pattern: string) => {
    const normalizedPattern = pattern.replace(/\\/g, '/').trim();
    if (!normalizedPattern) return '';
    return normalizeWorkspacePath(
      normalizedPattern.startsWith('/')
        ? normalizedPattern.slice(1)
        : projectDirectory
          ? `${projectDirectory}/${normalizedPattern}`
          : normalizedPattern
    );
  };

  for (const operation of parsedProject.compileItemOperations) {
    const patterns = operation.patterns.map(resolvePattern).filter(Boolean);
    const excludes = operation.excludes.map(resolvePattern).filter(Boolean);
    if (operation.kind === 'include') {
      for (const file of allSources) {
        if (
          patterns.some(pattern => workspaceGlobMatches(file.path, pattern))
          && !excludes.some(pattern => workspaceGlobMatches(file.path, pattern))
        ) {
          selected.set(file.path, file);
        }
      }
    } else {
      for (const path of selected.keys()) {
        if (patterns.some(pattern => workspaceGlobMatches(path, pattern))) {
          selected.delete(path);
        }
      }
    }
  }

  return {
    sourceFiles: [...selected.values()].sort((left, right) => compareText(left.path, right.path)),
    nestedProjectPaths: nestedProjects.map(file => file.path),
  };
}

function decodeXmlEntities(value: string): string {
  return value.replace(
    /&(?:#(\d+)|#x([0-9a-f]+)|([a-z]+));/gi,
    (entity, decimal: string | undefined, hexadecimal: string | undefined, named: string | undefined) => {
      if (decimal !== undefined) {
        const codePoint = Number.parseInt(decimal, 10);
        return Number.isSafeInteger(codePoint) && codePoint <= 0x10ffff
          ? String.fromCodePoint(codePoint)
          : entity;
      }
      if (hexadecimal !== undefined) {
        const codePoint = Number.parseInt(hexadecimal, 16);
        return Number.isSafeInteger(codePoint) && codePoint <= 0x10ffff
          ? String.fromCodePoint(codePoint)
          : entity;
      }
      switch (named?.toLowerCase()) {
        case 'amp': return '&';
        case 'apos': return "'";
        case 'gt': return '>';
        case 'lt': return '<';
        case 'quot': return '"';
        default: return entity;
      }
    }
  );
}

function xmlLocalName(name: string): string {
  const separator = name.lastIndexOf(':');
  return (separator < 0 ? name : name.slice(separator + 1)).toLowerCase();
}

function scanXmlTagEnd(source: string, start: number): number {
  let quote = '';
  for (let index = start; index < source.length; index += 1) {
    const character = source[index];
    if (quote) {
      if (character === quote) quote = '';
      continue;
    }
    if (character === '"' || character === "'") {
      quote = character;
      continue;
    }
    if (character === '>') return index;
  }
  return source.length - 1;
}

function parseXmlAttributes(source: string): Record<string, string> {
  const attributes: Record<string, string> = {};
  const nameMatch = /^\s*[^\s/>]+/.exec(source);
  let index = nameMatch?.[0].length ?? 0;

  while (index < source.length) {
    while (index < source.length && /\s/.test(source[index])) index += 1;
    if (index >= source.length || source[index] === '/') break;

    const nameStart = index;
    while (index < source.length && !/[\s=/>]/.test(source[index])) index += 1;
    const rawName = source.slice(nameStart, index);
    if (!rawName) {
      index += 1;
      continue;
    }

    while (index < source.length && /\s/.test(source[index])) index += 1;
    let value = '';
    if (source[index] === '=') {
      index += 1;
      while (index < source.length && /\s/.test(source[index])) index += 1;
      const quote = source[index] === '"' || source[index] === "'" ? source[index++] : '';
      const valueStart = index;
      if (quote) {
        while (index < source.length && source[index] !== quote) index += 1;
        value = source.slice(valueStart, index);
        if (source[index] === quote) index += 1;
      } else {
        while (index < source.length && !/[\s/>]/.test(source[index])) index += 1;
        value = source.slice(valueStart, index);
      }
    }
    attributes[xmlLocalName(rawName)] = decodeXmlEntities(value);
  }

  return attributes;
}

function parseXml(source: string): XmlElement {
  const root: XmlElement = { name: '#document', attributes: {}, children: [], text: '' };
  const stack = [root];
  let index = 0;

  const appendText = (text: string) => {
    if (text) stack[stack.length - 1].text += decodeXmlEntities(text);
  };

  while (index < source.length) {
    const tagStart = source.indexOf('<', index);
    if (tagStart < 0) {
      appendText(source.slice(index));
      break;
    }
    appendText(source.slice(index, tagStart));

    if (source.startsWith('<!--', tagStart)) {
      const end = source.indexOf('-->', tagStart + 4);
      index = end < 0 ? source.length : end + 3;
      continue;
    }
    if (source.startsWith('<![CDATA[', tagStart)) {
      const end = source.indexOf(']]>', tagStart + 9);
      const contentEnd = end < 0 ? source.length : end;
      stack[stack.length - 1].text += source.slice(tagStart + 9, contentEnd);
      index = end < 0 ? source.length : end + 3;
      continue;
    }
    if (source.startsWith('<?', tagStart)) {
      const end = source.indexOf('?>', tagStart + 2);
      index = end < 0 ? source.length : end + 2;
      continue;
    }
    if (source.startsWith('<!', tagStart)) {
      const end = scanXmlTagEnd(source, tagStart + 2);
      index = end + 1;
      continue;
    }

    const tagEnd = scanXmlTagEnd(source, tagStart + 1);
    const rawTag = source.slice(tagStart + 1, tagEnd);
    index = tagEnd + 1;

    if (/^\s*\//.test(rawTag)) {
      const closeName = xmlLocalName(rawTag.replace(/^\s*\//, '').trim().split(/\s/, 1)[0] ?? '');
      for (let stackIndex = stack.length - 1; stackIndex > 0; stackIndex -= 1) {
        if (stack[stackIndex].name !== closeName) continue;
        stack.length = stackIndex;
        break;
      }
      continue;
    }

    const nameMatch = /^\s*([^\s/>]+)/.exec(rawTag);
    if (!nameMatch) continue;
    const element: XmlElement = {
      name: xmlLocalName(nameMatch[1]),
      attributes: parseXmlAttributes(rawTag),
      children: [],
      text: '',
    };
    stack[stack.length - 1].children.push(element);
    if (!/\/\s*$/.test(rawTag)) stack.push(element);
  }

  return root;
}

function childText(element: XmlElement): string {
  let result = element.text;
  for (const child of element.children) result += childText(child);
  return result;
}

function findChild(element: XmlElement, name: string): XmlElement | undefined {
  const normalizedName = name.toLowerCase();
  return element.children.find(child => child.name === normalizedName);
}

function findProjectElement(document: XmlElement): XmlElement | null {
  const queue = [...document.children];
  while (queue.length > 0) {
    const element = queue.shift()!;
    if (element.name === 'project') return element;
    queue.push(...element.children);
  }
  return null;
}

function expandProperties(value: string, properties: ReadonlyMap<string, string>): string {
  let expanded = value;
  for (let pass = 0; pass < 8; pass += 1) {
    const next = expanded.replace(
      /\$\(([a-z0-9_.-]+)\)/gi,
      (_match, name: string) => properties.get(name.toLowerCase()) ?? ''
    );
    if (next === expanded) break;
    expanded = next;
  }
  return expanded;
}

type ConditionTokenKind =
  | 'value'
  | 'leftParen'
  | 'rightParen'
  | 'not'
  | 'equal'
  | 'notEqual'
  | 'less'
  | 'lessOrEqual'
  | 'greater'
  | 'greaterOrEqual'
  | 'and'
  | 'or';

interface ConditionToken {
  kind: ConditionTokenKind;
  value: string;
}

function tokenizeCondition(condition: string): ConditionToken[] | null {
  const tokens: ConditionToken[] = [];
  let index = 0;
  while (index < condition.length) {
    if (/\s/.test(condition[index])) {
      index += 1;
      continue;
    }
    const pair = condition.slice(index, index + 2);
    if (pair === '==') {
      tokens.push({ kind: 'equal', value: pair });
      index += 2;
      continue;
    }
    if (pair === '!=') {
      tokens.push({ kind: 'notEqual', value: pair });
      index += 2;
      continue;
    }
    if (pair === '<=') {
      tokens.push({ kind: 'lessOrEqual', value: pair });
      index += 2;
      continue;
    }
    if (pair === '>=') {
      tokens.push({ kind: 'greaterOrEqual', value: pair });
      index += 2;
      continue;
    }
    const character = condition[index];
    if (character === '(') {
      tokens.push({ kind: 'leftParen', value: character });
      index += 1;
      continue;
    }
    if (character === ')') {
      tokens.push({ kind: 'rightParen', value: character });
      index += 1;
      continue;
    }
    if (character === '!') {
      tokens.push({ kind: 'not', value: character });
      index += 1;
      continue;
    }
    if (character === '<' || character === '>') {
      tokens.push({ kind: character === '<' ? 'less' : 'greater', value: character });
      index += 1;
      continue;
    }
    if (character === '"' || character === "'") {
      const quote = character;
      index += 1;
      let value = '';
      let closed = false;
      while (index < condition.length) {
        if (condition[index] === quote) {
          // MSBuild accepts doubled quotes inside a quoted value.
          if (condition[index + 1] === quote) {
            value += quote;
            index += 2;
            continue;
          }
          index += 1;
          closed = true;
          break;
        }
        value += condition[index++];
      }
      if (!closed) return null;
      tokens.push({ kind: 'value', value });
      continue;
    }

    const start = index;
    while (
      index < condition.length &&
      !/\s/.test(condition[index]) &&
      !/[()!<>=]/.test(condition[index])
    ) {
      index += 1;
    }
    if (start === index) return null;
    const value = condition.slice(start, index);
    const keyword = value.toLowerCase();
    tokens.push({
      kind: keyword === 'and' ? 'and' : keyword === 'or' ? 'or' : 'value',
      value,
    });
  }
  return tokens;
}

function conditionValueAsBoolean(value: string): boolean | null {
  switch (value.trim().toLowerCase()) {
    case 'true': return true;
    case 'false': return false;
    default: return value.trim() === '' ? false : null;
  }
}

function compareConditionValues(left: string, right: string): number {
  const leftVersion = /^\d+(?:\.\d+)*$/.test(left) ? left.split('.').map(Number) : null;
  const rightVersion = /^\d+(?:\.\d+)*$/.test(right) ? right.split('.').map(Number) : null;
  if (leftVersion && rightVersion) {
    const length = Math.max(leftVersion.length, rightVersion.length);
    for (let index = 0; index < length; index += 1) {
      const difference = (leftVersion[index] ?? 0) - (rightVersion[index] ?? 0);
      if (difference !== 0) return difference < 0 ? -1 : 1;
    }
    return 0;
  }
  return compareText(left.toLowerCase(), right.toLowerCase());
}

function evaluateCondition(
  condition: string | undefined,
  properties: ReadonlyMap<string, string>
): boolean {
  if (condition === undefined) return true;
  const expanded = expandProperties(condition, properties).trim();
  if (!expanded) return false;
  // Property functions, item expressions, metadata, and MSBuild functions require
  // an MSBuild host. Treat them as non-applicable instead of guessing.
  if (/\$\(|@\(|%\(|\$\[/.test(expanded)) return false;
  const tokens = tokenizeCondition(expanded);
  if (!tokens || tokens.length === 0) return false;
  let position = 0;

  const readComparison = (): boolean | null => {
    const left = tokens[position];
    if (!left || left.kind !== 'value') return null;
    position += 1;
    const operator = tokens[position];
    if (
      operator &&
      (
        operator.kind === 'equal' ||
        operator.kind === 'notEqual' ||
        operator.kind === 'less' ||
        operator.kind === 'lessOrEqual' ||
        operator.kind === 'greater' ||
        operator.kind === 'greaterOrEqual'
      )
    ) {
      position += 1;
      const right = tokens[position];
      if (!right || right.kind !== 'value') return null;
      position += 1;
      const comparison = compareConditionValues(left.value, right.value);
      switch (operator.kind) {
        case 'equal': return comparison === 0;
        case 'notEqual': return comparison !== 0;
        case 'less': return comparison < 0;
        case 'lessOrEqual': return comparison <= 0;
        case 'greater': return comparison > 0;
        case 'greaterOrEqual': return comparison >= 0;
      }
    }
    return conditionValueAsBoolean(left.value);
  };

  const readPrimary = (): boolean | null => {
    if (tokens[position]?.kind === 'leftParen') {
      position += 1;
      const value = readOr();
      if (tokens[position]?.kind !== 'rightParen') return null;
      position += 1;
      return value;
    }
    return readComparison();
  };

  const readUnary = (): boolean | null => {
    if (tokens[position]?.kind === 'not') {
      position += 1;
      const value = readUnary();
      return value === null ? null : !value;
    }
    return readPrimary();
  };

  const readAnd = (): boolean | null => {
    let value = readUnary();
    while (tokens[position]?.kind === 'and') {
      position += 1;
      const right = readUnary();
      if (value === false || right === false) value = false;
      else if (value === null || right === null) value = null;
      else value = true;
    }
    return value;
  };

  function readOr(): boolean | null {
    let value = readAnd();
    while (tokens[position]?.kind === 'or') {
      position += 1;
      const right = readAnd();
      if (value === true || right === true) value = true;
      else if (value === null || right === null) value = null;
      else value = false;
    }
    return value;
  }

  const result = readOr();
  return result === true && position === tokens.length;
}

function readSdkNames(project: XmlElement): string[] {
  const names: string[] = [];
  const add = (value: string | undefined) => {
    for (const rawName of String(value ?? '').split(';')) {
      const name = rawName.trim().replace(/\/[^/]+$/, '');
      if (name) names.push(name);
    }
  };
  add(project.attributes.sdk);
  for (const child of project.children) {
    if (child.name === 'sdk') add(child.attributes.name);
    // MSBuild also permits the SDK to be declared on explicit Sdk.props/Sdk.targets
    // imports instead of Project@Sdk. Those projects still receive SDK default items.
    if (child.name === 'import') add(child.attributes.sdk);
  }
  return [...new Set(names)].sort(compareText);
}

function readUsingMetadata(element: XmlElement, name: string): string {
  return element.attributes[name.toLowerCase()] ?? childText(findChild(element, name) ?? {
    name: '',
    attributes: {},
    children: [],
    text: '',
  }).trim();
}

function splitMsBuildList(value: string): string[] {
  return value
    .split(/[;,]/)
    .map(item => item.trim())
    .filter(Boolean);
}

function splitDiagnosticList(value: string): string[] {
  const seen = new Set<string>();
  const result: string[] = [];
  for (const rawItem of value.split(/[;,\s]+/)) {
    const item = rawItem.trim();
    if (!item) continue;
    const normalized = /^\d+$/.test(item)
      ? `CS${item}`
      : item.toUpperCase();
    if (seen.has(normalized)) continue;
    seen.add(normalized);
    result.push(normalized);
  }
  return result;
}

function parsePlatformTarget(value: string | undefined, prefer32Bit: boolean): CSharpPlatform {
  switch (value?.trim().replace(/\s+/g, '').toLowerCase()) {
    case 'x86': return 'x86';
    case 'x64': return 'x64';
    case 'arm': return 'ARM';
    case 'arm64': return 'ARM64';
    case 'anycpu32bitpreferred':
    case 'anycpuprefer32bit':
      return 'AnyCPU32BitPreferred';
    default:
      return prefer32Bit ? 'AnyCPU32BitPreferred' : 'AnyCPU';
  }
}

function splitDefineConstants(value: string): string[] {
  const seen = new Set<string>();
  const result: string[] = [];
  for (const rawItem of value.split(/[;,\s]+/)) {
    const item = rawItem.trim();
    if (!item || seen.has(item)) continue;
    seen.add(item);
    result.push(item);
  }
  return result;
}

function usesDotNetCSharpSdk(sdkNames: readonly string[]): boolean {
  return [
    'Microsoft.NET.Sdk',
    'Microsoft.NET.Sdk.Web',
    'Microsoft.NET.Sdk.BlazorWebAssembly',
    'Microsoft.NET.Sdk.Worker',
    'Microsoft.NET.Sdk.Razor',
    'Microsoft.NET.Sdk.WindowsDesktop',
  ].some(expected => isSdk(sdkNames, expected));
}

function compareFrameworkVersion(
  left: readonly number[],
  right: readonly number[]
): number {
  const length = Math.max(left.length, right.length);
  for (let index = 0; index < length; index += 1) {
    const difference = (left[index] ?? 0) - (right[index] ?? 0);
    if (difference !== 0) return difference;
  }
  return 0;
}

function appendFrameworkConstant(
  constants: string[],
  seen: Set<string>,
  value: string
): void {
  if (value && !seen.has(value)) {
    seen.add(value);
    constants.push(value);
  }
}

function inferImplicitFrameworkConstants(targetFramework: string | null): string[] {
  const framework = targetFramework?.trim().toLowerCase() ?? '';
  const result: string[] = [];
  const seen = new Set<string>();
  const add = (value: string) => appendFrameworkConstant(result, seen, value);
  const versionSymbol = (version: readonly number[], compact = false) => (
    compact ? version.join('') : version.join('_')
  );
  const addCompatibleVersions = (
    prefix: string,
    target: readonly number[],
    supported: readonly (readonly number[])[],
    compact = false
  ) => {
    for (const version of supported) {
      if (compareFrameworkVersion(version, target) <= 0) {
        add(`${prefix}${versionSymbol(version, compact)}_OR_GREATER`);
      }
    }
  };

  const modern = /^net(\d+)\.(\d+)(?:-([a-z]+)(\d+(?:\.\d+)*)?)?(?:-|$)/.exec(framework);
  if (modern) {
    const version = [Number.parseInt(modern[1], 10), Number.parseInt(modern[2], 10)];
    add('NET');
    add(`NET${versionSymbol(version)}`);
    add('NETCOREAPP');
    const platform = modern[3]?.toUpperCase();
    const explicitPlatformVersion = modern[4]
      ?.split('.')
      .map(part => Number.parseInt(part, 10))
      .filter(Number.isFinite);
    const platformVersion = explicitPlatformVersion?.length
      ? explicitPlatformVersion
      : platform === 'WINDOWS'
        ? [7, 0]
        : undefined;
    if (platform) {
      add(platform);
      if (platformVersion) add(`${platform}${versionSymbol(platformVersion)}`);
    }
    const modernVersions: number[][] = [];
    for (let major = 5; major <= version[0]; major += 1) modernVersions.push([major, 0]);
    addCompatibleVersions('NET', version, modernVersions);
    addCompatibleVersions('NETCOREAPP', [3, 1], [
      [1, 0], [1, 1],
      [2, 0], [2, 1], [2, 2],
      [3, 0], [3, 1],
    ]);
    if (platform === 'WINDOWS' && platformVersion) {
      for (const supportedVersion of [
        [10, 0, 26100, 0],
        [10, 0, 22621, 0],
        [10, 0, 22000, 0],
        [10, 0, 20348, 0],
        [10, 0, 19041, 0],
        [10, 0, 18362, 0],
        [10, 0, 17763, 0],
        [8, 0],
        [7, 0],
      ]) {
        if (compareFrameworkVersion(supportedVersion, platformVersion) <= 0) {
          add(`WINDOWS${versionSymbol(supportedVersion)}_OR_GREATER`);
        }
      }
    }
    return result;
  }

  const coreApp = /^netcoreapp(\d+)(?:\.(\d+))?/.exec(framework);
  if (coreApp) {
    const version = [
      Number.parseInt(coreApp[1], 10),
      Number.parseInt(coreApp[2] ?? '0', 10),
    ];
    add('NETCOREAPP');
    add(`NETCOREAPP${versionSymbol(version)}`);
    addCompatibleVersions('NETCOREAPP', version, [
      [1, 0], [1, 1],
      [2, 0], [2, 1], [2, 2],
      [3, 0], [3, 1],
    ]);
    return result;
  }

  const standard = /^netstandard(\d+)(?:\.(\d+))?/.exec(framework);
  if (standard) {
    const version = [
      Number.parseInt(standard[1], 10),
      Number.parseInt(standard[2] ?? '0', 10),
    ];
    add('NETSTANDARD');
    add(`NETSTANDARD${versionSymbol(version)}`);
    addCompatibleVersions('NETSTANDARD', version, [
      [1, 0], [1, 1], [1, 2], [1, 3], [1, 4], [1, 5], [1, 6],
      [2, 0], [2, 1],
    ]);
    return result;
  }

  const netFramework = /^net(\d)(\d)(\d)?(?:-|$)/.exec(framework);
  if (netFramework) {
    const version = [
      Number.parseInt(netFramework[1], 10),
      Number.parseInt(netFramework[2], 10),
      ...(netFramework[3] ? [Number.parseInt(netFramework[3], 10)] : []),
    ];
    add('NETFRAMEWORK');
    add(`NET${versionSymbol(version, true)}`);
    addCompatibleVersions('NET', version, [
      [2, 0], [3, 0], [3, 5], [4, 0], [4, 5], [4, 5, 1], [4, 5, 2],
      [4, 6], [4, 6, 1], [4, 6, 2], [4, 7], [4, 7, 1], [4, 7, 2],
      [4, 8], [4, 8, 1],
    ], true);
  }
  return result;
}

function resolveDefineConstants(
  properties: ReadonlyMap<string, string>,
  sdkNames: readonly string[],
  targetFramework: string | null
): string[] {
  const constants = splitDefineConstants(properties.get('defineconstants') ?? '');
  if (usesDotNetCSharpSdk(sdkNames)) {
    if (!parseBoolean(properties.get('disableimplicitconfigurationdefines'), false)) {
      constants.push('RELEASE');
    }
    if (!parseBoolean(properties.get('disableimplicitframeworkdefines'), false)) {
      constants.push(...inferImplicitFrameworkConstants(targetFramework));
    }
  }
  const filtered = parseBoolean(properties.get('disablediagnostictracing'), false)
    ? constants.filter(value => value !== 'TRACE')
    : constants;
  return splitDefineConstants(filtered.join(';'));
}

function parseBoolean(value: string | undefined, fallback: boolean): boolean {
  switch (value?.trim().toLowerCase()) {
    case 'true':
    case 'yes':
    case 'on':
    case 'enable':
    case 'enabled':
    case '1':
      return true;
    case 'false':
    case 'no':
    case 'off':
    case 'disable':
    case 'disabled':
    case '0':
      return false;
    default:
      return fallback;
  }
}

function parseNullable(value: string | undefined): CSharpNullableContext {
  switch (value?.trim().toLowerCase()) {
    case 'true':
    case 'enable':
    case 'enabled':
      return 'Enable';
    case 'warnings':
      return 'Warnings';
    case 'annotations':
      return 'Annotations';
    default:
      return 'Disable';
  }
}

function normalizeLanguageVersion(value: string): string {
  const trimmed = value.trim();
  switch (trimmed.toLowerCase()) {
    case 'preview': return 'Preview';
    case 'latest': return 'Latest';
    case 'latestmajor':
    case 'latest-major': return 'LatestMajor';
    case 'default': return 'Default';
    case 'iso-1':
    case 'iso1': return 'ISO1';
    case 'iso-2':
    case 'iso2': return 'ISO2';
    default: return trimmed;
  }
}

export function inferCSharpLanguageVersion(targetFramework: string | null): string {
  const framework = targetFramework?.trim().toLowerCase() ?? '';
  const modernNet = /^net(\d+)\.(\d+)(?:-|$)/.exec(framework);
  if (modernNet) {
    const major = Number.parseInt(modernNet[1], 10);
    if (major >= 5) return `${major + 4}.0`;
  }
  const coreApp = /^netcoreapp(\d+)(?:\.(\d+))?/.exec(framework);
  if (coreApp) {
    const major = Number.parseInt(coreApp[1], 10);
    if (major >= 5) return `${major + 4}.0`;
    if (major === 3) return '8.0';
    return '7.3';
  }
  const standard = /^netstandard(\d+)(?:\.(\d+))?/.exec(framework);
  if (standard) {
    const major = Number.parseInt(standard[1], 10);
    const minor = Number.parseInt(standard[2] ?? '0', 10);
    return major > 2 || major === 2 && minor >= 1 ? '8.0' : '7.3';
  }
  if (/^net(?:1|2|3|4)\d{1,2}(?:-|$)/.test(framework)) return '7.3';
  return 'Preview';
}

function inferWarningLevel(targetFramework: string | null): number {
  const framework = targetFramework?.trim().toLowerCase() ?? '';
  const modernNet = /^net(\d+)\.\d+(?:-|$)/.exec(framework);
  if (modernNet) {
    const major = Number.parseInt(modernNet[1], 10);
    if (major >= 5) return major;
  }
  return 4;
}

function parseOutputKind(value: string | undefined): CSharpOutputKind {
  switch (value?.trim().toLowerCase()) {
    case 'exe':
    case 'console':
    case 'consoleapplication':
      return 'ConsoleApplication';
    case 'winexe':
    case 'windowsapplication':
      return 'WindowsApplication';
    case 'module':
    case 'netmodule':
      return 'NetModule';
    case 'winmdobj':
    case 'windowsruntimemetadata':
      return 'WindowsRuntimeMetadata';
    case 'appcontainerexe':
    case 'windowsruntimeapplication':
      return 'WindowsRuntimeApplication';
    case 'library':
    case 'dll':
    case 'dynamicallylinkedlibrary':
    default:
      return 'DynamicallyLinkedLibrary';
  }
}

function isSdk(sdkNames: readonly string[], expected: string): boolean {
  const normalized = expected.toLowerCase();
  return sdkNames.some(name => name.toLowerCase().split('/', 1)[0] === normalized);
}

function resolveProjectOutputKind(
  value: string | undefined,
  sdkNames: readonly string[]
): CSharpOutputKind {
  if (value?.trim()) return parseOutputKind(value);

  // These SDKs import props that set OutputType=Exe before the project body is
  // evaluated. A static browser cannot execute those imports, so mirror the
  // SDK defaults while still allowing an explicit project property to win.
  if (
    isSdk(sdkNames, 'Microsoft.NET.Sdk.Web')
    || isSdk(sdkNames, 'Microsoft.NET.Sdk.BlazorWebAssembly')
    || isSdk(sdkNames, 'Microsoft.NET.Sdk.Worker')
  ) {
    return 'ConsoleApplication';
  }
  return 'DynamicallyLinkedLibrary';
}

function wildcardMatches(value: string, pattern: string): boolean {
  if (!/[*?]/.test(pattern)) return value === pattern;
  const expression = pattern
    .replace(/[.+^${}()|[\]\\]/g, '\\$&')
    .replace(/\*/g, '.*')
    .replace(/\?/g, '.');
  return new RegExp(`^${expression}$`).test(value);
}

function workspaceGlobMatches(path: string, pattern: string): boolean {
  let expression = '';
  for (let index = 0; index < pattern.length; index += 1) {
    const character = pattern[index];
    if (character === '*' && pattern[index + 1] === '*') {
      index += 1;
      if (pattern[index + 1] === '/') {
        index += 1;
        expression += '(?:.*/)?';
      } else {
        expression += '.*';
      }
    } else if (character === '*') {
      expression += '[^/]*';
    } else if (character === '?') {
      expression += '[^/]';
    } else {
      expression += character.replace(/[.+^${}()|[\]\\]/g, '\\$&');
    }
  }
  return new RegExp(`^${expression}$`).test(path);
}

function resolveGlobalUsings(
  properties: ReadonlyMap<string, string>,
  sdkNames: readonly string[],
  operations: readonly UsingOperation[]
): string[] {
  const items: UsingItem[] = [];
  const addIdentity = (identity: string, alias = '', isStatic = false) => {
    const normalizedIdentity = identity.trim();
    if (!normalizedIdentity) return;
    const clause = alias.trim()
      ? `${alias.trim()} = ${normalizedIdentity}`
      : isStatic
        ? `static ${normalizedIdentity}`
        : normalizedIdentity;
    if (items.some(item => item.identity === normalizedIdentity && item.clause === clause)) return;
    items.push({ identity: normalizedIdentity, clause });
  };

  if (parseBoolean(properties.get('implicitusings'), false)) {
    BASE_IMPLICIT_USINGS.forEach(identity => addIdentity(identity));
    if (isSdk(sdkNames, 'Microsoft.NET.Sdk.Web')) {
      WEB_IMPLICIT_USINGS.forEach(identity => addIdentity(identity));
    }
    if (isSdk(sdkNames, 'Microsoft.NET.Sdk.BlazorWebAssembly')) {
      BLAZOR_WEBASSEMBLY_IMPLICIT_USINGS.forEach(identity => addIdentity(identity));
    }
    if (isSdk(sdkNames, 'Microsoft.NET.Sdk.Worker')) {
      WORKER_IMPLICIT_USINGS.forEach(identity => addIdentity(identity));
    }
    if (parseBoolean(properties.get('usewpf'), false)) {
      for (let index = items.length - 1; index >= 0; index -= 1) {
        if (items[index].identity === 'System.IO' || items[index].identity === 'System.Net.Http') {
          items.splice(index, 1);
        }
      }
    }
    if (parseBoolean(properties.get('usewindowsforms'), false)) {
      addIdentity('System.Drawing');
      addIdentity('System.Windows.Forms');
    }
  }

  for (const operation of operations) {
    if (operation.kind === 'include') {
      operation.values.forEach(identity => addIdentity(identity, operation.alias, operation.isStatic));
      continue;
    }
    for (let index = items.length - 1; index >= 0; index -= 1) {
      if (operation.values.some(pattern => wildcardMatches(items[index].identity, pattern))) {
        items.splice(index, 1);
      }
    }
  }

  return [...new Set(items.map(item => item.clause))].sort(compareText);
}

function evaluateProjectXml(content: string): ParsedCSharpProject {
  const document = parseXml(content);
  const project = findProjectElement(document);
  if (!project) {
    return {
      configuration: {
        ...DEFAULT_CSHARP_PROJECT_CONFIGURATION,
        defineConstants: [],
        noWarn: [],
        warningsAsErrors: [],
        warningsNotAsErrors: [],
        globalUsings: [],
        outputKind: 'DynamicallyLinkedLibrary',
      },
      sdkNames: [],
      enableDefaultCompileItems: false,
      compileItemOperations: [],
    };
  }

  const sdkNames = readSdkNames(project);
  const properties = new Map<string, string>([
    ['configuration', 'Release'],
    ['platform', 'AnyCPU'],
    ...(usesDotNetCSharpSdk(sdkNames) ? [['defineconstants', 'TRACE'] as const] : []),
  ]);
  const usingOperations: UsingOperation[] = [];
  const compileItemOperations: CompileItemOperation[] = [];

  const processPropertyGroup = (group: XmlElement) => {
    if (!evaluateCondition(group.attributes.condition, properties)) return;
    for (const property of group.children) {
      if (!evaluateCondition(property.attributes.condition, properties)) continue;
      // Configuration and Platform are fixed global properties for CodeCraft's
      // deterministic Release|AnyCPU browser build and cannot be reassigned by
      // a project body, matching MSBuild global-property behavior.
      if (property.name === 'configuration' || property.name === 'platform') continue;
      const value = expandProperties(childText(property), properties).trim();
      properties.set(property.name, value);
      // A browser build cannot perform MSBuild's outer/inner multi-targeting
      // evaluations. Select the first declared TFM and make it available to
      // later conditions, matching the target that this resolver returns.
      if (property.name === 'targetframeworks' && !properties.get('targetframework')) {
        const firstTargetFramework = splitMsBuildList(value)[0];
        if (firstTargetFramework) properties.set('targetframework', firstTargetFramework);
      }
    }
  };

  const processItemGroup = (group: XmlElement) => {
    if (!evaluateCondition(group.attributes.condition, properties)) return;
    for (const item of group.children) {
      if (!evaluateCondition(item.attributes.condition, properties)) continue;
      if (item.name === 'compile') {
        const include = splitMsBuildList(
          expandProperties(item.attributes.include ?? '', properties)
        );
        const remove = splitMsBuildList(
          expandProperties(item.attributes.remove ?? '', properties)
        );
        const excludes = splitMsBuildList(
          expandProperties(item.attributes.exclude ?? '', properties)
        );
        if (include.length > 0) {
          compileItemOperations.push({ kind: 'include', patterns: include, excludes });
        }
        if (remove.length > 0) {
          compileItemOperations.push({ kind: 'remove', patterns: remove, excludes: [] });
        }
        continue;
      }
      if (item.name !== 'using') continue;
      const include = expandProperties(item.attributes.include ?? '', properties);
      const remove = expandProperties(item.attributes.remove ?? '', properties);
      const alias = expandProperties(readUsingMetadata(item, 'alias'), properties).trim();
      const isStatic = parseBoolean(
        expandProperties(readUsingMetadata(item, 'static'), properties),
        false
      );
      if (include.trim()) {
        usingOperations.push({
          kind: 'include',
          values: splitMsBuildList(include),
          alias,
          isStatic,
        });
      }
      if (remove.trim()) {
        usingOperations.push({
          kind: 'remove',
          values: splitMsBuildList(remove),
          alias: '',
          isStatic: false,
        });
      }
    }
  };

  const processChildren = (children: readonly XmlElement[]) => {
    for (const child of children) {
      if (child.name === 'propertygroup') {
        processPropertyGroup(child);
      } else if (child.name === 'itemgroup') {
        processItemGroup(child);
      } else if (child.name === 'choose') {
        const applicableWhen = child.children.find(
          branch => branch.name === 'when' && evaluateCondition(branch.attributes.condition, properties)
        );
        const branch = applicableWhen ?? child.children.find(candidate => candidate.name === 'otherwise');
        if (branch) processChildren(branch.children);
      }
    }
  };

  processChildren(project.children);
  const enableDefaultItems = parseBoolean(
    properties.get('enabledefaultitems'),
    usesDotNetCSharpSdk(sdkNames)
  );
  const enableDefaultCompileItems = parseBoolean(
    properties.get('enabledefaultcompileitems'),
    enableDefaultItems
  );
  const targetFramework = (
    properties.get('targetframework') ||
    splitMsBuildList(properties.get('targetframeworks') ?? '')[0] ||
    ''
  ).trim() || null;
  const explicitLanguageVersion = properties.get('langversion')?.trim();
  const warningLevelValue = properties.get('warninglevel')?.trim() ?? '';
  const explicitWarningLevel = /^\d+$/.test(warningLevelValue)
    ? Number.parseInt(warningLevelValue, 10)
    : Number.NaN;
  const explicitOptimizationLevel = properties.get('optimizationlevel')?.trim().toLowerCase();
  const outputValue = properties.get('outputkind') || properties.get('outputtype');
  const mainTypeName = (
    properties.get('maintypename') ||
    properties.get('startupobject') ||
    ''
  ).trim() || null;

  const configuration: CSharpProjectConfiguration = {
    buildConfiguration: 'Release',
    platform: parsePlatformTarget(
      properties.get('platformtarget'),
      parseBoolean(properties.get('prefer32bit'), false)
    ),
    targetFramework,
    languageVersion: explicitLanguageVersion
      ? normalizeLanguageVersion(explicitLanguageVersion)
      : inferCSharpLanguageVersion(targetFramework),
    nullable: parseNullable(properties.get('nullable')),
    allowUnsafeBlocks: parseBoolean(properties.get('allowunsafeblocks'), false),
    checkForOverflowUnderflow: parseBoolean(properties.get('checkforoverflowunderflow'), false),
    optimizationLevel: explicitOptimizationLevel === 'debug'
      ? 'Debug'
      : explicitOptimizationLevel === 'release'
        ? 'Release'
        : parseBoolean(properties.get('optimize'), true)
          ? 'Release'
          : 'Debug',
    defineConstants: resolveDefineConstants(properties, sdkNames, targetFramework),
    warningLevel: Number.isSafeInteger(explicitWarningLevel) && explicitWarningLevel >= 0
      ? explicitWarningLevel
      : inferWarningLevel(targetFramework),
    treatWarningsAsErrors: parseBoolean(properties.get('treatwarningsaserrors'), false),
    noWarn: splitDiagnosticList(properties.get('nowarn') ?? ''),
    warningsAsErrors: splitDiagnosticList(properties.get('warningsaserrors') ?? ''),
    warningsNotAsErrors: splitDiagnosticList(properties.get('warningsnotaserrors') ?? ''),
    outputKind: resolveProjectOutputKind(outputValue, sdkNames),
    mainTypeName,
    globalUsings: resolveGlobalUsings(properties, sdkNames, usingOperations),
  };
  return {
    configuration,
    sdkNames,
    enableDefaultCompileItems,
    compileItemOperations,
  };
}

function normalizeGlobalUsingClause(value: string): string {
  return value
    .trim()
    .replace(/^global\s+using\s+/i, '')
    .replace(/;\s*$/, '')
    .trim();
}

export function renderCSharpGlobalUsings(globalUsings: readonly string[]): string {
  const clauses = [...new Set(globalUsings.map(normalizeGlobalUsingClause).filter(Boolean))].sort(compareText);
  return clauses.length === 0
    ? ''
    : `${clauses.map(clause => `global using ${clause};`).join('\n')}\n`;
}

function appendFingerprintPart(parts: string[], value: string): void {
  parts.push(`${value.length}:`, value);
}

function hashFingerprint(value: string): string {
  let first = 0x811c9dc5;
  let second = 0x9e3779b9;
  for (let index = 0; index < value.length; index += 1) {
    const code = value.charCodeAt(index);
    first ^= code & 0xff;
    first = Math.imul(first, 0x01000193);
    first ^= code >>> 8;
    first = Math.imul(first, 0x01000193);
    second ^= code + 0x9e3779b9 + (second << 6) + (second >>> 2);
    second = Math.imul(second, 0x85ebca6b);
  }
  return `${(first >>> 0).toString(16).padStart(8, '0')}${(second >>> 0).toString(16).padStart(8, '0')}`;
}

function createContextFingerprint(
  mode: CSharpProjectContext['mode'],
  projectFile: CSharpWorkspaceFile | null,
  nestedProjectPaths: readonly string[],
  sourceFiles: readonly CSharpWorkspaceFile[],
  configuration: CSharpProjectConfiguration
): string {
  const parts: string[] = [];
  appendFingerprintPart(parts, 'csharp-project-v1');
  appendFingerprintPart(parts, mode);
  appendFingerprintPart(parts, projectFile?.path ?? '');
  appendFingerprintPart(parts, projectFile?.content ?? '');
  for (const nestedProjectPath of nestedProjectPaths) appendFingerprintPart(parts, nestedProjectPath);
  appendFingerprintPart(parts, JSON.stringify(configuration));
  for (const sourceFile of sourceFiles) {
    appendFingerprintPart(parts, sourceFile.path);
    appendFingerprintPart(parts, sourceFile.content);
  }
  return `csharp-${hashFingerprint(parts.join(''))}`;
}

export function resolveCSharpProjectContext(
  workspaceFiles: readonly CSharpWorkspaceFile[],
  currentCSharpPath: string
): CSharpProjectContext {
  const files = canonicalizeWorkspaceFiles(workspaceFiles);
  const currentPath = normalizeWorkspacePath(currentCSharpPath);
  const projects = evaluateWorkspaceProjects(files);
  const selectedProject = selectProject(projects, currentPath);
  const projectFile = selectedProject?.file ?? null;
  const projectPath = projectFile?.path ?? null;
  const parsedProject = selectedProject?.parsed ?? null;
  const ownedSourcePaths = new Set(
    projects.flatMap(project => project.sourceFiles.map(file => file.path))
  );
  const sourceFiles = selectedProject
    ? selectedProject.sourceFiles
    : files
      .filter(file => isCSharpSourcePath(file.path))
      .filter(file => !ownedSourcePaths.has(file.path));
  const nestedProjectPaths = selectedProject?.nestedProjectPaths ?? [];
  const configuration = parsedProject
    ? parsedProject.configuration
    : {
      ...DEFAULT_CSHARP_PROJECT_CONFIGURATION,
      defineConstants: [],
      noWarn: [],
      warningsAsErrors: [],
      warningsNotAsErrors: [],
      globalUsings: [],
    };
  const generatedGlobalUsingsSource = renderCSharpGlobalUsings(configuration.globalUsings);

  return {
    mode: projectFile ? 'project' : 'unmanaged',
    currentPath,
    projectPath,
    projectDirectory: projectPath === null ? '' : pathDirectory(projectPath),
    sourceFiles,
    configuration,
    generatedGlobalUsingsSource,
    fingerprint: createContextFingerprint(
      projectFile ? 'project' : 'unmanaged',
      projectFile,
      nestedProjectPaths,
      sourceFiles,
      configuration
    ),
  };
}
