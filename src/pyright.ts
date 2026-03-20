import { MonacoPyrightProvider } from 'monaco-pyright-lsp';
import { LspClient } from 'monaco-pyright-lsp/dist/client';
import type { UserFolder } from 'monaco-pyright-lsp/dist/message';
import * as monaco from 'monaco-editor';

export type { UserFolder };

let accumulatedStubs: UserFolder = {};
let getInitialStubs: (() => UserFolder) | null = null;

let pyrightProvider: MonacoPyrightProvider;
let _pyrightReady: Promise<void> | null = null;

const PYRIGHT_RUNTIME_SETTINGS = {
  settings: {
    python: {
      analysis: {
        typeshedPaths: ['/typeshed-fallback'],
        stubPath: '/typings',
        extraPaths: ['/typings'],
        useLibraryCodeForTypes: true,
      },
      pythonVersion: '3.13',
      pythonPlatform: 'All',
    },
  },
};

export function setInitialStubsGetter(fn: () => UserFolder) {
  getInitialStubs = fn;
}

async function loadMinimalTypeshed(): Promise<ArrayBuffer> {
  const res = await fetch('/minimal-typeshed.zip');
  if (!res.ok) return undefined as any;
  return res.arrayBuffer();
}

async function applyPyrightRuntimeSettings(client: LspClient): Promise<void> {
  await (client.connection as any).sendNotification('workspace/didChangeConfiguration', PYRIGHT_RUNTIME_SETTINGS);
}

export function ensurePyrightReady(): Promise<void> {
  if (!_pyrightReady) {
    _pyrightReady = (async () => {
      const typeshed = await loadMinimalTypeshed();
      const initialStubs = getInitialStubs ? getInitialStubs() : {};
      accumulatedStubs = initialStubs;
      pyrightProvider = new MonacoPyrightProvider(undefined, { typeshed: typeshed || false, typeStubs: initialStubs });
      await pyrightProvider.init(monaco);
      await applyPyrightRuntimeSettings(pyrightProvider.lspClient);
    })();
  }
  return _pyrightReady;
}

export { pyrightProvider };
export const pyrightReady = { then: (fn: () => void) => ensurePyrightReady().then(fn) };

export async function reloadPyrightWithStubs(newStubs: UserFolder, replace = false): Promise<void> {
  await ensurePyrightReady();

  accumulatedStubs = replace ? newStubs : mergeUserFolders(accumulatedStubs, newStubs);

  await reloadLspWithAccumulatedStubs();
}

export async function reloadPyrightAfterRemovingStubContribution(contribution: UserFolder): Promise<void> {
  await ensurePyrightReady();
  accumulatedStubs = removeStubContribution(accumulatedStubs, contribution);
  await reloadLspWithAccumulatedStubs();
}

async function reloadLspWithAccumulatedStubs(): Promise<void> {
  const oldClient = pyrightProvider.lspClient;
  try { oldClient.connection?.dispose(); } catch {}
  try { oldClient.worker?.terminate(); } catch {}

  pyrightProvider.editorChangeListener?.dispose();
  pyrightProvider.editorChangeListener = undefined as any;

  const newClient = new LspClient();
  await newClient.initialize('/', accumulatedStubs, pyrightProvider.options.typeshed);
  await newClient.updateSettings();
  await applyPyrightRuntimeSettings(newClient);

  pyrightProvider.lspClient = newClient;
}

function removeStubContribution(base: UserFolder, contribution: UserFolder): UserFolder {
  const result = JSON.parse(JSON.stringify(base)) as UserFolder;
  function remove(baseObj: Record<string, unknown>, remObj: Record<string, unknown>) {
    for (const key of Object.keys(remObj)) {
      const rem = remObj[key];
      const curr = baseObj[key];
      if (typeof rem === 'object' && rem !== null && !(rem instanceof ArrayBuffer) &&
          typeof curr === 'object' && curr !== null && !(curr instanceof ArrayBuffer)) {
        remove(curr as Record<string, unknown>, rem as Record<string, unknown>);
        if (Object.keys(curr as object).length === 0) delete baseObj[key];
      } else {
        delete baseObj[key];
      }
    }
  }
  remove(result as unknown as Record<string, unknown>, contribution as unknown as Record<string, unknown>);
  return result;
}

// --- Minimal ZIP reader for typeshed extraction ---

function u16(buf: Uint8Array, off: number) { return buf[off] | (buf[off + 1] << 8); }
function u32(buf: Uint8Array, off: number) { return (buf[off] | (buf[off + 1] << 8) | (buf[off + 2] << 16) | (buf[off + 3] << 24)) >>> 0; }

interface ZipCDEntry { name: string; method: number; compSize: number; uncompSize: number; localOff: number; }

function parseZipCD(data: Uint8Array): ZipCDEntry[] {
  let eocd = -1;
  for (let i = data.length - 22; i >= Math.max(0, data.length - 65557); i--) {
    if (u32(data, i) === 0x06054b50) { eocd = i; break; }
  }
  if (eocd === -1) return [];
  const cdOff = u32(data, eocd + 16);
  const cdSize = u32(data, eocd + 12);
  const entries: ZipCDEntry[] = [];
  let p = cdOff;
  while (p < cdOff + cdSize) {
    if (u32(data, p) !== 0x02014b50) break;
    const method = u16(data, p + 10);
    const compSize = u32(data, p + 20);
    const uncompSize = u32(data, p + 24);
    const nameLen = u16(data, p + 28);
    const extraLen = u16(data, p + 30);
    const commentLen = u16(data, p + 32);
    const localOff = u32(data, p + 42);
    const name = new TextDecoder().decode(data.subarray(p + 46, p + 46 + nameLen));
    entries.push({ name, method, compSize, uncompSize, localOff });
    p += 46 + nameLen + extraLen + commentLen;
  }
  return entries;
}

function readZipEntryRaw(data: Uint8Array, entry: ZipCDEntry): Uint8Array {
  const nameLen = u16(data, entry.localOff + 26);
  const extraLen = u16(data, entry.localOff + 28);
  const start = entry.localOff + 30 + nameLen + extraLen;
  return data.subarray(start, start + entry.compSize);
}

async function readZipEntry(data: Uint8Array, entry: ZipCDEntry): Promise<Uint8Array> {
  const raw = readZipEntryRaw(data, entry);
  if (entry.method === 0) return raw;
  if (entry.method === 8) {
    const ds = new DecompressionStream('deflate-raw');
    const writer = ds.writable.getWriter();
    writer.write(raw as unknown as BufferSource);
    writer.close();
    const chunks: Uint8Array[] = [];
    const reader = ds.readable.getReader();
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      chunks.push(value);
    }
    const total = chunks.reduce((s, c) => s + c.length, 0);
    const out = new Uint8Array(total);
    let off = 0;
    for (const c of chunks) { out.set(c, off); off += c.length; }
    return out;
  }
  throw new Error(`Unsupported ZIP method: ${entry.method}`);
}

function crc32(data: Uint8Array): number {
  let crc = 0xFFFFFFFF;
  for (let i = 0; i < data.length; i++) {
    crc ^= data[i];
    for (let j = 0; j < 8; j++) crc = (crc >>> 1) ^ (crc & 1 ? 0xEDB88320 : 0);
  }
  return (crc ^ 0xFFFFFFFF) >>> 0;
}

function buildUncompressedZip(files: Map<string, Uint8Array>): ArrayBuffer {
  const enc = new TextEncoder();
  const fileEntries: { name: Uint8Array; data: Uint8Array; crc: number; offset: number }[] = [];
  let offset = 0;

  for (const [name, data] of files) {
    const nameBytes = enc.encode(name);
    fileEntries.push({ name: nameBytes, data, crc: crc32(data), offset });
    offset += 30 + nameBytes.length + data.length;
  }

  const cdStart = offset;
  let cdSize = 0;
  for (const e of fileEntries) cdSize += 46 + e.name.length;
  const totalSize = cdStart + cdSize + 22;
  const buf = new Uint8Array(totalSize);
  const view = new DataView(buf.buffer);

  let pos = 0;
  for (const e of fileEntries) {
    view.setUint32(pos, 0x04034b50, true); pos += 4;
    view.setUint16(pos, 20, true); pos += 2;          // version needed
    view.setUint16(pos, 0, true); pos += 2;            // flags
    view.setUint16(pos, 0, true); pos += 2;            // method: stored
    view.setUint32(pos, 0, true); pos += 4;            // mod time+date
    view.setUint32(pos, e.crc, true); pos += 4;
    view.setUint32(pos, e.data.length, true); pos += 4;
    view.setUint32(pos, e.data.length, true); pos += 4;
    view.setUint16(pos, e.name.length, true); pos += 2;
    view.setUint16(pos, 0, true); pos += 2;            // extra length
    buf.set(e.name, pos); pos += e.name.length;
    buf.set(e.data, pos); pos += e.data.length;
  }

  for (const e of fileEntries) {
    view.setUint32(pos, 0x02014b50, true); pos += 4;
    view.setUint16(pos, 20, true); pos += 2;           // version made by
    view.setUint16(pos, 20, true); pos += 2;           // version needed
    view.setUint16(pos, 0, true); pos += 2;            // flags
    view.setUint16(pos, 0, true); pos += 2;            // method
    view.setUint32(pos, 0, true); pos += 4;            // mod time+date
    view.setUint32(pos, e.crc, true); pos += 4;
    view.setUint32(pos, e.data.length, true); pos += 4;
    view.setUint32(pos, e.data.length, true); pos += 4;
    view.setUint16(pos, e.name.length, true); pos += 2;
    view.setUint16(pos, 0, true); pos += 2;            // extra length
    view.setUint16(pos, 0, true); pos += 2;            // comment length
    view.setUint16(pos, 0, true); pos += 2;            // disk number
    view.setUint16(pos, 0, true); pos += 2;            // internal attrs
    view.setUint32(pos, 0, true); pos += 4;            // external attrs
    view.setUint32(pos, e.offset, true); pos += 4;
    buf.set(e.name, pos); pos += e.name.length;
  }

  view.setUint32(pos, 0x06054b50, true); pos += 4;
  view.setUint16(pos, 0, true); pos += 2;             // disk number
  view.setUint16(pos, 0, true); pos += 2;             // cd start disk
  view.setUint16(pos, fileEntries.length, true); pos += 2;
  view.setUint16(pos, fileEntries.length, true); pos += 2;
  view.setUint32(pos, cdSize, true); pos += 4;
  view.setUint32(pos, cdStart, true); pos += 4;
  view.setUint16(pos, 0, true);

  return buf.buffer;
}

// --- Typeshed on-demand inclusion ---

const CORE_TYPESHED_FILES = new Set([
  'stdlib/builtins.pyi', 'stdlib/typing.pyi', 'stdlib/sys.pyi', 'stdlib/types.pyi',
  'stdlib/abc.pyi', 'stdlib/io.pyi', 'stdlib/codecs.pyi', 'stdlib/re.pyi',
  'stdlib/math.pyi',
  'stdlib/json/__init__.pyi', 'stdlib/dataclasses.pyi', 'stdlib/functools.pyi',
  'stdlib/contextlib.pyi', 'stdlib/itertools.pyi', 'stdlib/warnings.pyi',
  'stdlib/os/__init__.pyi', 'stdlib/pathlib.pyi', 'stdlib/collections/__init__.pyi',
  'stdlib/collections/abc.pyi', 'stdlib/genericpath.pyi', 'stdlib/posixpath.pyi',
  'stdlib/ntpath.pyi', 'stdlib/_collections_abc.pyi', 'stdlib/_typeshed/__init__.pyi',
]);

let fullTypeshedData: Uint8Array | null = null;
let fullTypeshedCD: ZipCDEntry[] | null = null;
let typeshedFiles: Map<string, Uint8Array> | null = null;
const includedModules = new Set<string>();

async function ensureFullTypeshed(): Promise<void> {
  if (fullTypeshedData) return;
  const res = await fetch('/typeshed-full.zip');
  if (!res.ok) throw new Error('Failed to fetch full typeshed');
  fullTypeshedData = new Uint8Array(await res.arrayBuffer());
  fullTypeshedCD = parseZipCD(fullTypeshedData);
}

async function ensureTypeshedFiles(): Promise<void> {
  if (typeshedFiles) return;
  typeshedFiles = new Map();
  const current = pyrightProvider?.options?.typeshed;
  if (current instanceof ArrayBuffer) {
    const data = new Uint8Array(current);
    for (const e of parseZipCD(data)) {
      if (e.name.endsWith('/')) continue;
      typeshedFiles.set(e.name, await readZipEntry(data, e));
    }
  }
}

async function ensureCoreTypeshedFiles(): Promise<void> {
  await ensureFullTypeshed();
  for (const name of CORE_TYPESHED_FILES) {
    if (typeshedFiles!.has(name)) continue;
    const entry = fullTypeshedCD!.find(e => e.name === name);
    if (entry) typeshedFiles!.set(name, await readZipEntry(fullTypeshedData!, entry));
  }
}

export async function includeTypeshedModule(name: string, log?: (msg: string) => void): Promise<boolean> {
  if (includedModules.has(name)) {
    log?.(`Module '${name}' is already included in Pyright.`);
    return false;
  }

  await ensurePyrightReady();
  await ensureTypeshedFiles();
  await ensureFullTypeshed();

  const matching = fullTypeshedCD!.filter(e => {
    if (e.name.endsWith('/')) return false;
    return e.name === `stdlib/${name}.pyi`
      || e.name.startsWith(`stdlib/${name}/`)
      || e.name.startsWith(`stubs/${name}/`);
  });

  if (matching.length === 0) {
    log?.(`No typeshed stubs found for '${name}'.`);
    return false;
  }

  log?.(`Found ${matching.length} stub file(s) for '${name}'.`);

  for (const entry of matching) {
    typeshedFiles!.set(entry.name, await readZipEntry(fullTypeshedData!, entry));
  }
  includedModules.add(name);

  await ensureCoreTypeshedFiles();
  const newTypeshed = buildUncompressedZip(typeshedFiles!);
  pyrightProvider.options.typeshed = newTypeshed;

  log?.('Reloading Pyright with updated typeshed...');
  await reloadLspWithAccumulatedStubs();
  log?.(`Included '${name}' in Pyright.`);
  return true;
}

export function isModuleIncluded(name: string): boolean {
  return includedModules.has(name);
}

function normalizeTopLevelModuleName(name: string): string | null {
  const trimmed = name.trim();
  if (!trimmed) return null;
  const withoutExtension = trimmed.replace(/\.(pyi|py)$/i, '');
  if (!withoutExtension || withoutExtension === '__init__') return null;
  return withoutExtension;
}

function topLevelModuleFromTypeshedPath(path: string): string | null {
  const parts = path.split('/').filter(Boolean);
  if (parts.length < 2) return null;

  if (parts[0] === 'stdlib') {
    return normalizeTopLevelModuleName(parts[1]);
  }

  if (parts[0] === 'stubs') {
    return normalizeTopLevelModuleName(parts[1]);
  }

  return null;
}

function collectTopLevelUserFolderModules(folder: UserFolder): string[] {
  return Object.keys(folder)
    .map(normalizeTopLevelModuleName)
    .filter((name): name is string => Boolean(name));
}

export async function getCurrentPythonTypeModules(): Promise<string[]> {
  await ensurePyrightReady();
  await ensureTypeshedFiles();

  const modules = new Set<string>(['__future__']);

  for (const path of typeshedFiles!.keys()) {
    const moduleName = topLevelModuleFromTypeshedPath(path);
    if (moduleName) modules.add(moduleName);
  }

  for (const moduleName of includedModules) {
    modules.add(moduleName);
  }

  for (const moduleName of collectTopLevelUserFolderModules(accumulatedStubs)) {
    modules.add(moduleName);
  }

  return [...modules].sort();
}

function mergeUserFolders(base: UserFolder, overlay: UserFolder): UserFolder {
  const result: UserFolder = { ...base };
  for (const key of Object.keys(overlay)) {
    const bVal = result[key];
    const oVal = overlay[key];
    if (typeof oVal === 'object' && !(oVal instanceof ArrayBuffer) && typeof bVal === 'object' && !(bVal instanceof ArrayBuffer)) {
      result[key] = mergeUserFolders(bVal as UserFolder, oVal as UserFolder);
    } else {
      result[key] = oVal;
    }
  }
  return result;
}
