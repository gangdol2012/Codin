export type SemanticDocumentationLanguage = 'csharp';
export type SemanticDocumentationPhase = 'idle' | 'types' | 'members' | 'methods' | 'complete' | 'error' | 'cancelled';
export type SemanticDocumentationItemKind = 'type' | 'field' | 'property' | 'method' | 'accessor';
export type SemanticDocumentationRecordKind = 'active' | 'draft';

export interface SemanticDocumentationSourceFile {
  path: string;
  content: string;
  language: SemanticDocumentationLanguage;
}

export interface SemanticDocumentationItem {
  id: string;
  kind: SemanticDocumentationItemKind;
  name: string;
  containerName?: string;
  header: string;
  path: string;
  documentation: string;
  generatedAt: number;
}

export interface SemanticDocumentationRecord {
  id: string;
  projectId: string;
  language: SemanticDocumentationLanguage;
  kind: SemanticDocumentationRecordKind;
  provider: string;
  model: string;
  entryPoint: string;
  promptTokenLimit: number;
  sourceFingerprint: string;
  status: SemanticDocumentationPhase;
  phase: SemanticDocumentationPhase;
  phaseLabel: string;
  completedRequests: number;
  totalRequests: number;
  startedAt: number;
  updatedAt: number;
  completedAt?: number;
  error?: string;
  items: SemanticDocumentationItem[];
}

export interface SemanticDocumentationProgress {
  record: SemanticDocumentationRecord;
  message: string;
}

export interface SemanticDocumentationGenerateOptions {
  projectId: string;
  provider: string;
  model: string;
  entryPoint: string;
  promptTokenLimit: number;
  files: SemanticDocumentationSourceFile[];
  existingDraft?: SemanticDocumentationRecord | null;
  forceNewDraft?: boolean;
  signal?: AbortSignal;
  requestDocumentation: (prompt: string) => Promise<string>;
  onProgress?: (progress: SemanticDocumentationProgress) => void;
}

export interface ParsedCSharpProject {
  files: SemanticDocumentationSourceFile[];
  types: CSharpTypeDeclaration[];
  valueMembers: CSharpValueMember[];
  methodMembers: CSharpMethodMember[];
  methodGraph: Map<string, Set<string>>;
  sourceFingerprint: string;
}

export interface CSharpTypeDeclaration {
  id: string;
  name: string;
  kind: string;
  header: string;
  path: string;
  code: string;
  spanStart: number;
  spanEnd: number;
  bodyStart: number;
  bodyEnd: number;
}

export interface CSharpValueMember {
  id: string;
  kind: 'field' | 'property';
  name: string;
  containerName: string;
  header: string;
  path: string;
  spanStart: number;
  spanEnd: number;
}

export interface CSharpMethodMember {
  id: string;
  kind: 'method' | 'accessor';
  name: string;
  containerName: string;
  header: string;
  path: string;
  code: string;
  bodyCode: string;
  spanStart: number;
  spanEnd: number;
}

const SEMANTIC_DOCUMENTATION_DB_NAME = 'codecraft-semantic-documentation';
const SEMANTIC_DOCUMENTATION_STORE_NAME = 'records';
const SEMANTIC_DOCUMENTATION_DB_VERSION = 1;
const CSHARP_CONTROL_CALLS = new Set([
  'if', 'for', 'foreach', 'while', 'switch', 'catch', 'using', 'lock', 'return',
  'throw', 'new', 'typeof', 'sizeof', 'nameof', 'checked', 'unchecked', 'fixed',
]);
const CSHARP_TYPE_KEYWORDS = new Set(['class', 'struct', 'interface', 'enum', 'record']);

function openSemanticDocumentationDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(SEMANTIC_DOCUMENTATION_DB_NAME, SEMANTIC_DOCUMENTATION_DB_VERSION);
    req.onupgradeneeded = () => {
      if (!req.result.objectStoreNames.contains(SEMANTIC_DOCUMENTATION_STORE_NAME)) {
        req.result.createObjectStore(SEMANTIC_DOCUMENTATION_STORE_NAME);
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

function semanticDocumentationRecordKey(projectId: string, language: SemanticDocumentationLanguage, kind: SemanticDocumentationRecordKind) {
  return `${projectId}::${language}::${kind}`;
}

export async function loadSemanticDocumentationRecord(
  projectId: string,
  language: SemanticDocumentationLanguage,
  kind: SemanticDocumentationRecordKind,
): Promise<SemanticDocumentationRecord | null> {
  const db = await openSemanticDocumentationDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(SEMANTIC_DOCUMENTATION_STORE_NAME, 'readonly');
    const req = tx.objectStore(SEMANTIC_DOCUMENTATION_STORE_NAME).get(semanticDocumentationRecordKey(projectId, language, kind));
    req.onsuccess = () => resolve((req.result as SemanticDocumentationRecord | undefined) ?? null);
    req.onerror = () => reject(req.error);
  });
}

export async function saveSemanticDocumentationRecord(record: SemanticDocumentationRecord) {
  const db = await openSemanticDocumentationDB();
  return new Promise<void>((resolve, reject) => {
    const tx = db.transaction(SEMANTIC_DOCUMENTATION_STORE_NAME, 'readwrite');
    tx.objectStore(SEMANTIC_DOCUMENTATION_STORE_NAME).put(
      record,
      semanticDocumentationRecordKey(record.projectId, record.language, record.kind),
    );
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

export async function deleteSemanticDocumentationRecord(
  projectId: string,
  language: SemanticDocumentationLanguage,
  kind: SemanticDocumentationRecordKind,
) {
  const db = await openSemanticDocumentationDB();
  return new Promise<void>((resolve, reject) => {
    const tx = db.transaction(SEMANTIC_DOCUMENTATION_STORE_NAME, 'readwrite');
    tx.objectStore(SEMANTIC_DOCUMENTATION_STORE_NAME).delete(semanticDocumentationRecordKey(projectId, language, kind));
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

export function formatSemanticDocumentationTimestamp(timestamp?: number) {
  if (!timestamp) return 'Never';
  return new Date(timestamp).toLocaleString();
}

export function getSemanticDocumentationProgressLabel(record: SemanticDocumentationRecord | null | undefined) {
  if (!record) return 'No documentation generated';
  if (record.status === 'complete') return `Complete: ${record.items.length} item${record.items.length === 1 ? '' : 's'}`;
  if (record.status === 'error') return `Error after ${record.completedRequests}/${record.totalRequests || '?'} requests`;
  if (record.status === 'cancelled') return `Paused at ${record.completedRequests}/${record.totalRequests || '?'} requests`;
  return `${record.phaseLabel || record.phase}: ${record.completedRequests}/${record.totalRequests || '?'}`;
}

export function parseCSharpSemanticDocumentationProject(files: SemanticDocumentationSourceFile[]) {
  return parseCSharpProject(files);
}

export async function runSemanticDocumentationGeneration(options: SemanticDocumentationGenerateOptions) {
  const parsed = parseCSharpProject(options.files);
  if (parsed.files.length === 0) {
    throw new Error('Semantic documentation currently supports C# projects, but no C# files were found.');
  }
  if (parsed.types.length === 0) {
    throw new Error('No C# class, struct, interface, enum, record, or similar type declaration was found.');
  }

  const entryType = resolveEntryPointType(parsed, options.entryPoint);
  const methodComponents = collectMethodGenerationComponents(parsed, entryType);
  const totalRequests = parsed.types.length + parsed.valueMembers.length + methodComponents.length;
  const now = Date.now();
  let record: SemanticDocumentationRecord = (
    !options.forceNewDraft
    && options.existingDraft
    && options.existingDraft.sourceFingerprint === parsed.sourceFingerprint
    && options.existingDraft.provider === options.provider
    && options.existingDraft.model === options.model
    && options.existingDraft.entryPoint === options.entryPoint
    && options.existingDraft.promptTokenLimit === options.promptTokenLimit
  )
    ? {
      ...options.existingDraft,
      kind: 'draft' as const,
      status: 'types' as SemanticDocumentationPhase,
      phase: options.existingDraft.phase === 'complete' ? 'types' as SemanticDocumentationPhase : options.existingDraft.phase,
      totalRequests,
      updatedAt: now,
      error: undefined,
    }
    : {
      id: `semantic_docs_${now.toString(36)}_${Math.random().toString(36).slice(2, 8)}`,
      projectId: options.projectId,
      language: 'csharp' as const,
      kind: 'draft' as const,
      provider: options.provider,
      model: options.model,
      entryPoint: options.entryPoint,
      promptTokenLimit: options.promptTokenLimit,
      sourceFingerprint: parsed.sourceFingerprint,
      status: 'types' as SemanticDocumentationPhase,
      phase: 'types' as SemanticDocumentationPhase,
      phaseLabel: 'Type pass',
      completedRequests: 0,
      totalRequests,
      startedAt: now,
      updatedAt: now,
      items: [],
    } as SemanticDocumentationRecord;

  record = normalizeRecordProgress(record, parsed, methodComponents);
  await persistProgress(record, options, 'Starting semantic documentation generation.');

  try {
    const itemMap = new Map<string, SemanticDocumentationItem>(record.items.map(item => [item.id, item]));

    for (const typeDecl of parsed.types) {
      await throwIfAborted(options.signal);
      if (itemMap.has(typeDecl.id)) continue;
      record.phase = 'types';
      record.phaseLabel = 'Type pass';
      const prompt = limitSemanticPrompt(buildTypePrompt(typeDecl), options.promptTokenLimit);
      const documentation = normalizeDocumentationText(await options.requestDocumentation(prompt));
      const item = createDocumentationItem(typeDecl, 'type', documentation);
      itemMap.set(item.id, item);
      record.items = [...itemMap.values()];
      record.completedRequests += 1;
      await persistProgress(record, options, `Documented type ${typeDecl.name}.`);
    }

    for (const member of parsed.valueMembers) {
      await throwIfAborted(options.signal);
      if (itemMap.has(member.id)) continue;
      record.phase = 'members';
      record.phaseLabel = 'Field/property pass';
      const references = collectValueMemberReferences(parsed, member);
      const prompt = limitSemanticPrompt(buildValueMemberPrompt(member, references), options.promptTokenLimit);
      const documentation = normalizeDocumentationText(await options.requestDocumentation(prompt));
      const item = createDocumentationItem(member, member.kind, documentation);
      itemMap.set(item.id, item);
      record.items = [...itemMap.values()];
      record.completedRequests += 1;
      await persistProgress(record, options, `Documented ${member.containerName}.${member.name}.`);
    }

    for (const component of methodComponents) {
      await throwIfAborted(options.signal);
      if (component.every(member => itemMap.has(member.id))) continue;
      record.phase = 'methods';
      record.phaseLabel = 'Method/accessor pass';
      const prompt = limitSemanticPrompt(buildMethodComponentPrompt(parsed, component, itemMap), options.promptTokenLimit);
      const response = normalizeDocumentationText(await options.requestDocumentation(prompt));
      const docs = component.length === 1
        ? new Map([[component[0].id, response]])
        : parseGroupedMethodDocumentation(response, component);
      for (const member of component) {
        const documentation = normalizeDocumentationText(docs.get(member.id) || response);
        const item = createDocumentationItem(member, member.kind, documentation);
        itemMap.set(item.id, item);
      }
      record.items = [...itemMap.values()];
      record.completedRequests += 1;
      await persistProgress(record, options, `Documented ${component.map(member => `${member.containerName}.${member.name}`).join(', ')}.`);
    }

    record = {
      ...record,
      status: 'complete',
      phase: 'complete',
      phaseLabel: 'Complete',
      completedRequests: totalRequests,
      totalRequests,
      completedAt: Date.now(),
      updatedAt: Date.now(),
      error: undefined,
    };
    await saveSemanticDocumentationRecord(record);
    await saveSemanticDocumentationRecord({ ...record, kind: 'active' });
    await deleteSemanticDocumentationRecord(options.projectId, 'csharp', 'draft');
    options.onProgress?.({ record, message: 'Semantic documentation generation complete.' });
    return record;
  } catch (error) {
    if (options.signal?.aborted) {
      record = {
        ...record,
        status: 'cancelled',
        phase: record.phase === 'complete' ? 'cancelled' : record.phase,
        phaseLabel: 'Paused',
        updatedAt: Date.now(),
        error: undefined,
      };
      await saveSemanticDocumentationRecord(record);
      options.onProgress?.({ record, message: 'Semantic documentation generation paused.' });
      return record;
    }
    record = {
      ...record,
      status: 'error',
      phase: 'error',
      phaseLabel: 'Error',
      error: error instanceof Error ? error.message : String(error),
      updatedAt: Date.now(),
    };
    await saveSemanticDocumentationRecord(record);
    options.onProgress?.({ record, message: record.error || 'Semantic documentation generation failed.' });
    throw error;
  }
}

async function persistProgress(
  record: SemanticDocumentationRecord,
  options: SemanticDocumentationGenerateOptions,
  message: string,
) {
  record.updatedAt = Date.now();
  record.status = record.phase === 'complete' ? 'complete' : record.status === 'error' ? 'error' : record.phase;
  await saveSemanticDocumentationRecord(record);
  options.onProgress?.({ record: { ...record, items: [...record.items] }, message });
  await new Promise(resolve => window.setTimeout(resolve, 0));
}

async function throwIfAborted(signal?: AbortSignal) {
  if (!signal?.aborted) return;
  throw new DOMException('Semantic documentation generation was cancelled.', 'AbortError');
}

function normalizeRecordProgress(
  record: SemanticDocumentationRecord,
  parsed: ParsedCSharpProject,
  methodComponents: CSharpMethodMember[][],
) {
  const validIds = new Set<string>([
    ...parsed.types.map(item => item.id),
    ...parsed.valueMembers.map(item => item.id),
    ...parsed.methodMembers.map(item => item.id),
  ]);
  const items = record.items.filter(item => validIds.has(item.id));
  const completedMethodComponentCount = methodComponents
    .filter(component => component.every(member => items.some(item => item.id === member.id)))
    .length;
  return {
    ...record,
    items,
    completedRequests: (
      items.filter(item => item.kind === 'type').length
      + items.filter(item => item.kind === 'field' || item.kind === 'property').length
      + completedMethodComponentCount
    ),
  };
}

function createDocumentationItem(
  source: CSharpTypeDeclaration | CSharpValueMember | CSharpMethodMember,
  kind: SemanticDocumentationItemKind,
  documentation: string,
): SemanticDocumentationItem {
  return {
    id: source.id,
    kind,
    name: source.name,
    containerName: 'containerName' in source ? source.containerName : undefined,
    header: source.header,
    path: source.path,
    documentation: `${source.header}\n\n${documentation}`.trim(),
    generatedAt: Date.now(),
  };
}

function normalizeDocumentationText(text: string) {
  return (text || '').replace(/\r\n/g, '\n').trim() || '(No semantic documentation returned.)';
}

function buildTypePrompt(typeDecl: CSharpTypeDeclaration) {
  return `You are generating internal semantic documentation for a C# IDE. Do not write code comments. Explain the semantic meaning and responsibility of this ${typeDecl.kind}. Return concise prose only.\n\nHeader:\n${typeDecl.header}\n\nCode:\n\`\`\`csharp\n${typeDecl.code}\n\`\`\``;
}

function buildValueMemberPrompt(member: CSharpValueMember, references: string[]) {
  return `You are generating internal semantic documentation for a C# IDE. The backtick character marks the exact usage of the target member and is not part of C# grammar. Explain what this ${member.kind} semantically means based on its declaration and references. Return concise prose only.\n\nDeclaration:\n${member.header}\n\nReferences:\n${references.length ? references.map((reference, index) => `Reference ${index + 1}:\n\`\`\`csharp\n${reference}\n\`\`\``).join('\n\n') : '(No references were found in project methods/accessors.)'}`;
}

function buildMethodComponentPrompt(
  parsed: ParsedCSharpProject,
  component: CSharpMethodMember[],
  existingDocs: Map<string, SemanticDocumentationItem>,
) {
  const componentIds = component.map(member => member.id);
  const knownDocs = [...existingDocs.values()]
    .filter(item => item.documentation.trim())
    .sort((left, right) => left.id.localeCompare(right.id))
    .map(item => `[${item.kind}] ${item.containerName ? `${item.containerName}.` : ''}${item.name}\n${item.documentation}`)
    .join('\n\n');
  const dependencyIds = new Set<string>();
  for (const member of component) {
    for (const calleeId of parsed.methodGraph.get(member.id) || []) {
      if (!componentIds.includes(calleeId)) dependencyIds.add(calleeId);
    }
  }
  const dependencyDocs = [...dependencyIds]
    .map(id => existingDocs.get(id))
    .filter((item): item is SemanticDocumentationItem => !!item)
    .map(item => `${item.containerName}.${item.name}: ${item.documentation}`)
    .join('\n\n');
  const targetBlocks = component.map(member => (
    `Target ID: ${member.id}\nHeader:\n${member.header}\nCode:\n\`\`\`csharp\n${member.code}\n\`\`\``
  )).join('\n\n');

  if (component.length === 1) {
    return `You are generating internal semantic documentation for a C# IDE. Explain the semantic meaning and behavior of the target C# method/accessor. Use the known semantic documentation for related types, fields, properties, accessors, and callees. Return concise prose only.\n\nKnown semantic documentation:\n${knownDocs || '(none yet)'}\n\nDirect callee documentation:\n${dependencyDocs || '(none)'}\n\nTarget:\n${targetBlocks}`;
  }

  return `You are generating internal semantic documentation for a C# IDE. The target methods/accessors are recursive or mutually dependent, so document all targets together in this one request. Use the known semantic documentation for related types, fields, properties, accessors, and callees. Return a JSON object whose keys are exactly the Target ID values and whose values are concise prose strings.\n\nKnown semantic documentation:\n${knownDocs || '(none yet)'}\n\nDirect callee documentation:\n${dependencyDocs || '(none)'}\n\nTargets:\n${targetBlocks}`;
}

function parseGroupedMethodDocumentation(response: string, component: CSharpMethodMember[]) {
  const result = new Map<string, string>();
  try {
    const cleaned = response.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/i, '').trim();
    const parsed = JSON.parse(cleaned);
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
      for (const member of component) {
        const value = parsed[member.id];
        if (typeof value === 'string' && value.trim()) result.set(member.id, value.trim());
      }
    }
  } catch {
    // Fallback below.
  }
  if (result.size > 0) return result;
  for (const member of component) result.set(member.id, response);
  return result;
}

export function limitSemanticPrompt(prompt: string, tokenLimit: number) {
  if (!Number.isFinite(tokenLimit) || tokenLimit <= 0) return prompt;
  const charLimit = Math.max(4000, Math.floor(tokenLimit * 4));
  if (prompt.length <= charLimit) return prompt;
  const headLength = Math.floor(charLimit * 0.64);
  const tailLength = charLimit - headLength - 160;
  return `${prompt.slice(0, headLength)}\n\n[Prompt truncated to fit the configured semantic documentation token limit.]\n\n${prompt.slice(Math.max(headLength, prompt.length - tailLength))}`;
}

function parseCSharpProject(files: SemanticDocumentationSourceFile[]): ParsedCSharpProject {
  const csharpFiles = files
    .filter(file => file.language === 'csharp')
    .map(file => ({ ...file, path: normalizeProjectPath(file.path) }))
    .sort((left, right) => left.path.localeCompare(right.path));
  const types: CSharpTypeDeclaration[] = [];
  const valueMembers: CSharpValueMember[] = [];
  const methodMembers: CSharpMethodMember[] = [];

  for (const file of csharpFiles) {
    const clean = maskCSharpTrivia(file.content);
    const fileTypes = parseCSharpTypes(file, clean);
    types.push(...fileTypes);
    for (const typeDecl of fileTypes) {
      const members = parseCSharpTypeMembers(file, clean, typeDecl);
      valueMembers.push(...members.valueMembers);
      methodMembers.push(...members.methodMembers);
    }
  }

  const methodGraph = buildMethodGraph(methodMembers);
  return {
    files: csharpFiles,
    types,
    valueMembers,
    methodMembers,
    methodGraph,
    sourceFingerprint: hashText(csharpFiles.map(file => `${file.path}\0${file.content}`).join('\n\0\n')),
  };
}

function parseCSharpTypes(file: SemanticDocumentationSourceFile, clean: string): CSharpTypeDeclaration[] {
  const source = file.content;
  const types: CSharpTypeDeclaration[] = [];
  const pattern = /\b(?:(?:public|private|protected|internal|static|abstract|sealed|partial|readonly|unsafe|ref)\s+)*(?:(record)\s+(class|struct)?|(class|struct|interface|enum))\s+([A-Za-z_]\w*)([^{};]*)\{/g;
  let match: RegExpExecArray | null;
  while ((match = pattern.exec(clean))) {
    const braceIndex = clean.indexOf('{', match.index);
    const closeBrace = findMatchingBrace(clean, braceIndex);
    if (closeBrace < 0) continue;
    const kind = match[1] ? `record${match[2] ? ` ${match[2]}` : ''}` : (match[3] || 'type');
    const name = match[4] || '';
    const header = normalizeHeader(source.slice(match.index, braceIndex));
    const id = `type:${file.path}:${name}:${match.index}`;
    types.push({
      id,
      name,
      kind,
      header,
      path: file.path,
      code: source.slice(match.index, closeBrace + 1),
      spanStart: match.index,
      spanEnd: closeBrace + 1,
      bodyStart: braceIndex + 1,
      bodyEnd: closeBrace,
    });
    pattern.lastIndex = match.index + Math.max(1, match[0].length);
  }
  return types;
}

function parseCSharpTypeMembers(
  file: SemanticDocumentationSourceFile,
  clean: string,
  typeDecl: CSharpTypeDeclaration,
) {
  const source = file.content;
  const valueMembers: CSharpValueMember[] = [];
  const methodMembers: CSharpMethodMember[] = [];
  let depth = 0;
  let segmentStart = typeDecl.bodyStart;
  let i = typeDecl.bodyStart;

  while (i < typeDecl.bodyEnd) {
    const ch = clean[i];
    if (ch === '{') {
      if (depth === 0) {
        const headerStart = findMemberHeaderStart(clean, segmentStart, i);
        const header = normalizeHeader(source.slice(headerStart, i));
        const closeBrace = findMatchingBrace(clean, i);
        if (closeBrace < 0 || closeBrace > typeDecl.bodyEnd) break;
        if (isMethodLikeHeader(header)) {
          const methodName = extractMethodName(header) || typeDecl.name;
          methodMembers.push({
            id: `method:${file.path}:${typeDecl.name}.${methodName}:${headerStart}`,
            kind: 'method',
            name: methodName,
            containerName: typeDecl.name,
            header,
            path: file.path,
            code: source.slice(headerStart, closeBrace + 1),
            bodyCode: source.slice(i + 1, closeBrace),
            spanStart: headerStart,
            spanEnd: closeBrace + 1,
          });
        } else if (isPropertyHeader(header, source.slice(i + 1, closeBrace))) {
          const propertyName = extractPropertyName(header);
          if (propertyName) {
            const accessorHeader = buildPropertyAccessorHeader(header, source.slice(i + 1, closeBrace));
            valueMembers.push({
              id: `property:${file.path}:${typeDecl.name}.${propertyName}:${headerStart}`,
              kind: 'property',
              name: propertyName,
              containerName: typeDecl.name,
              header: accessorHeader,
              path: file.path,
              spanStart: headerStart,
              spanEnd: closeBrace + 1,
            });
            methodMembers.push(...parsePropertyAccessors(file, typeDecl, propertyName, accessorHeader, source, clean, i, closeBrace));
          }
        }
        i = closeBrace + 1;
        segmentStart = i;
        continue;
      }
      depth += 1;
    } else if (ch === '}') {
      depth = Math.max(0, depth - 1);
    } else if (ch === ';' && depth === 0) {
      const statementStart = findMemberHeaderStart(clean, segmentStart, i);
      const statement = normalizeHeader(source.slice(statementStart, i + 1));
      for (const field of parseFieldDeclarations(statement, file.path, typeDecl.name, statementStart)) {
        valueMembers.push(field);
      }
      const expressionProperty = parseExpressionProperty(statement, file.path, typeDecl.name, statementStart);
      if (expressionProperty) valueMembers.push(expressionProperty);
      segmentStart = i + 1;
    }
    i += 1;
  }

  return { valueMembers, methodMembers };
}

function parsePropertyAccessors(
  file: SemanticDocumentationSourceFile,
  typeDecl: CSharpTypeDeclaration,
  propertyName: string,
  propertyHeader: string,
  source: string,
  clean: string,
  bodyStartBrace: number,
  bodyEndBrace: number,
) {
  const members: CSharpMethodMember[] = [];
  const body = clean.slice(bodyStartBrace + 1, bodyEndBrace);
  const accessorPattern = /\b(?:(?:public|private|protected|internal)\s+)?(get|set|init)\b/g;
  let match: RegExpExecArray | null;
  while ((match = accessorPattern.exec(body))) {
    const absoluteStart = bodyStartBrace + 1 + match.index;
    const accessorName = match[1];
    const nextNonSpace = findNextNonWhitespace(clean, absoluteStart + match[0].length);
    let spanEnd = nextNonSpace + 1;
    let code = source.slice(absoluteStart, spanEnd);
    let bodyCode = '';
    if (clean[nextNonSpace] === '{') {
      const close = findMatchingBrace(clean, nextNonSpace);
      if (close > 0 && close <= bodyEndBrace) {
        spanEnd = close + 1;
        code = source.slice(absoluteStart, spanEnd);
        bodyCode = source.slice(nextNonSpace + 1, close);
      }
    } else {
      const semi = clean.indexOf(';', nextNonSpace);
      if (semi > 0 && semi <= bodyEndBrace) {
        spanEnd = semi + 1;
        code = source.slice(absoluteStart, spanEnd);
      }
    }
    members.push({
      id: `accessor:${file.path}:${typeDecl.name}.${propertyName}.${accessorName}:${absoluteStart}`,
      kind: 'accessor',
      name: `${propertyName}.${accessorName}`,
      containerName: typeDecl.name,
      header: `${propertyHeader} ${accessorName}`,
      path: file.path,
      code,
      bodyCode,
      spanStart: absoluteStart,
      spanEnd,
    });
  }
  return members;
}

function parseFieldDeclarations(statement: string, path: string, containerName: string, offset: number) {
  if (!statement || statement.includes('(') || statement.includes('=>')) return [];
  if (/\b(get|set|init|add|remove)\b/.test(statement)) return [];
  const withoutAttrs = statement.replace(/^\s*(?:\[[^\]]+\]\s*)+/, '').trim();
  const firstWord = withoutAttrs.split(/\s+/)[0];
  if (CSHARP_TYPE_KEYWORDS.has(firstWord) || firstWord === 'using' || firstWord === 'return') return [];
  const withoutSemi = withoutAttrs.replace(/;$/, '').trim();
  const equalsTrimmed = withoutSemi.replace(/\s*=\s*[\s\S]*$/, '').trim();
  const nameMatch = equalsTrimmed.match(/([A-Za-z_]\w*)$/);
  if (!nameMatch) return [];
  const name = nameMatch[1];
  return [{
    id: `field:${path}:${containerName}.${name}:${offset}`,
    kind: 'field' as const,
    name,
    containerName,
    header: withoutSemi.endsWith(name) ? withoutSemi : `${withoutSemi} ${name}`,
    path,
    spanStart: offset,
    spanEnd: offset + statement.length,
  }];
}

function parseExpressionProperty(statement: string, path: string, containerName: string, offset: number): CSharpValueMember | null {
  if (!statement.includes('=>')) return null;
  const beforeArrow = normalizeHeader(statement.split('=>')[0] || '');
  const name = extractPropertyName(beforeArrow);
  if (!name) return null;
  return {
    id: `property:${path}:${containerName}.${name}:${offset}`,
    kind: 'property',
    name,
    containerName,
    header: `${beforeArrow} { get; }`,
    path,
    spanStart: offset,
    spanEnd: offset + statement.length,
  };
}

function isMethodLikeHeader(header: string) {
  if (!header.includes('(') || !header.includes(')')) return false;
  const name = extractMethodName(header);
  return !!name && !CSHARP_CONTROL_CALLS.has(name);
}

function extractMethodName(header: string) {
  const beforeParen = header.slice(0, header.indexOf('(')).trim();
  return beforeParen.match(/(?:operator\s*[^\s]+|[A-Za-z_]\w*)$/)?.[0]?.trim() || '';
}

function isPropertyHeader(header: string, body: string) {
  if (!header || header.includes('(')) return false;
  return /\b(get|set|init)\b/.test(body);
}

function extractPropertyName(header: string) {
  return header.trim().match(/([A-Za-z_]\w*)\s*$/)?.[1] || '';
}

function buildPropertyAccessorHeader(header: string, body: string) {
  const accessors = [...body.matchAll(/\b(?:(public|private|protected|internal)\s+)?(get|set|init)\b/g)]
    .map(match => `${match[1] ? `${match[1]} ` : ''}${match[2]};`);
  return `${normalizeHeader(header)} { ${accessors.join(' ')} }`;
}

function collectValueMemberReferences(parsed: ParsedCSharpProject, member: CSharpValueMember) {
  const references: string[] = [];
  const seen = new Set<string>();
  for (const method of parsed.methodMembers) {
    if (!new RegExp(`\\b${escapeRegex(member.name)}\\b`).test(maskCSharpTrivia(method.code))) continue;
    const highlighted = highlightIdentifierUsages(method.code, member.name);
    const key = `${method.id}:${highlighted}`;
    if (seen.has(key)) continue;
    seen.add(key);
    references.push(`${method.header}\n${highlighted}`);
  }
  return references;
}

function highlightIdentifierUsages(code: string, name: string) {
  return code.replace(new RegExp(`\\b${escapeRegex(name)}\\b`, 'g'), match => `\`${match}\``);
}

function buildMethodGraph(methodMembers: CSharpMethodMember[]) {
  const byName = new Map<string, CSharpMethodMember[]>();
  for (const member of methodMembers) {
    const baseName = member.name.split('.').pop() || member.name;
    const list = byName.get(baseName) || [];
    list.push(member);
    byName.set(baseName, list);
  }
  const graph = new Map<string, Set<string>>();
  for (const member of methodMembers) {
    const callees = new Set<string>();
    const cleanBody = maskCSharpTrivia(member.bodyCode || member.code);
    for (const match of cleanBody.matchAll(/\b([A-Za-z_]\w*)\s*(?:<[^>\n]+>)?\s*\(/g)) {
      const name = match[1];
      if (!name || CSHARP_CONTROL_CALLS.has(name)) continue;
      for (const candidate of byName.get(name) || []) {
        if (candidate.id !== member.id) callees.add(candidate.id);
      }
    }
    graph.set(member.id, callees);
  }
  return graph;
}

function resolveEntryPointType(parsed: ParsedCSharpProject, entryPoint: string) {
  const trimmed = entryPoint.trim();
  if (trimmed) {
    const exact = parsed.types.find(type => type.name === trimmed || type.header.includes(trimmed));
    if (exact) return exact;
  }
  const mainMethod = parsed.methodMembers.find(member => member.name === 'Main');
  const mainType = mainMethod ? parsed.types.find(type => type.name === mainMethod.containerName) : null;
  return mainType || parsed.types[0];
}

function collectMethodGenerationComponents(parsed: ParsedCSharpProject, entryType: CSharpTypeDeclaration) {
  const byId = new Map(parsed.methodMembers.map(member => [member.id, member]));
  const roots = parsed.methodMembers.filter(member => member.containerName === entryType.name);
  const reachable = new Set<string>();
  const visitReachable = (id: string) => {
    if (reachable.has(id)) return;
    reachable.add(id);
    for (const calleeId of parsed.methodGraph.get(id) || []) visitReachable(calleeId);
  };
  roots.forEach(member => visitReachable(member.id));
  const components = stronglyConnectedComponents(reachable, parsed.methodGraph);
  const byComponent = new Map<string, number>();
  components.forEach((component, index) => component.forEach(id => byComponent.set(id, index)));
  const ordered: number[] = [];
  const seenComponents = new Set<number>();
  const visitComponent = (index: number) => {
    if (seenComponents.has(index)) return;
    seenComponents.add(index);
    for (const id of components[index]) {
      for (const calleeId of parsed.methodGraph.get(id) || []) {
        const calleeIndex = byComponent.get(calleeId);
        if (calleeIndex !== undefined && calleeIndex !== index) visitComponent(calleeIndex);
      }
    }
    ordered.push(index);
  };
  components.forEach((_, index) => visitComponent(index));
  return ordered
    .map(index => components[index].map(id => byId.get(id)).filter((member): member is CSharpMethodMember => !!member))
    .filter(component => component.length > 0);
}

function stronglyConnectedComponents(nodes: Set<string>, graph: Map<string, Set<string>>) {
  let index = 0;
  const stack: string[] = [];
  const onStack = new Set<string>();
  const indices = new Map<string, number>();
  const low = new Map<string, number>();
  const components: string[][] = [];

  const connect = (node: string) => {
    indices.set(node, index);
    low.set(node, index);
    index += 1;
    stack.push(node);
    onStack.add(node);

    for (const next of graph.get(node) || []) {
      if (!nodes.has(next)) continue;
      if (!indices.has(next)) {
        connect(next);
        low.set(node, Math.min(low.get(node)!, low.get(next)!));
      } else if (onStack.has(next)) {
        low.set(node, Math.min(low.get(node)!, indices.get(next)!));
      }
    }

    if (low.get(node) === indices.get(node)) {
      const component: string[] = [];
      while (stack.length > 0) {
        const current = stack.pop()!;
        onStack.delete(current);
        component.push(current);
        if (current === node) break;
      }
      components.push(component.sort());
    }
  };

  for (const node of nodes) {
    if (!indices.has(node)) connect(node);
  }
  return components;
}

function maskCSharpTrivia(source: string) {
  const chars = source.split('');
  let i = 0;
  while (i < chars.length) {
    if (chars[i] === '/' && chars[i + 1] === '/') {
      chars[i] = ' ';
      chars[i + 1] = ' ';
      i += 2;
      while (i < chars.length && chars[i] !== '\n') {
        chars[i] = ' ';
        i += 1;
      }
      continue;
    }
    if (chars[i] === '/' && chars[i + 1] === '*') {
      chars[i] = ' ';
      chars[i + 1] = ' ';
      i += 2;
      while (i < chars.length - 1) {
        if (chars[i] === '*' && chars[i + 1] === '/') {
          chars[i] = ' ';
          chars[i + 1] = ' ';
          i += 2;
          break;
        }
        if (chars[i] !== '\n') chars[i] = ' ';
        i += 1;
      }
      continue;
    }
    if (chars[i] === '"' || chars[i] === '\'') {
      const quote = chars[i];
      chars[i] = ' ';
      i += 1;
      while (i < chars.length) {
        if (chars[i] === '\\') {
          chars[i] = ' ';
          if (chars[i + 1] && chars[i + 1] !== '\n') chars[i + 1] = ' ';
          i += 2;
          continue;
        }
        if (chars[i] === quote) {
          chars[i] = ' ';
          i += 1;
          break;
        }
        if (chars[i] !== '\n') chars[i] = ' ';
        i += 1;
      }
      continue;
    }
    i += 1;
  }
  return chars.join('');
}

function findMatchingBrace(clean: string, openIndex: number) {
  if (openIndex < 0 || clean[openIndex] !== '{') return -1;
  let depth = 0;
  for (let i = openIndex; i < clean.length; i += 1) {
    if (clean[i] === '{') depth += 1;
    if (clean[i] === '}') {
      depth -= 1;
      if (depth === 0) return i;
    }
  }
  return -1;
}

function findMemberHeaderStart(clean: string, segmentStart: number, end: number) {
  let start = segmentStart;
  for (let i = end - 1; i >= segmentStart; i -= 1) {
    const ch = clean[i];
    if (ch === ';' || ch === '}') {
      start = i + 1;
      break;
    }
  }
  while (start < end && /\s/.test(clean[start])) start += 1;
  return start;
}

function findNextNonWhitespace(source: string, index: number) {
  let i = index;
  while (i < source.length && /\s/.test(source[i])) i += 1;
  return i;
}

function normalizeHeader(header: string) {
  return header.replace(/\s+/g, ' ').trim();
}

function normalizeProjectPath(path: string) {
  return path.replace(/\\/g, '/').replace(/^\/+/, '').replace(/\/+/g, '/');
}

function escapeRegex(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function hashText(value: string) {
  let hash = 2166136261;
  for (let i = 0; i < value.length; i += 1) {
    hash ^= value.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(16).padStart(8, '0');
}
