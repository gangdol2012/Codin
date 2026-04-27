import React, { useState, useEffect, useRef, createContext, useContext, useCallback } from 'react';
import {
  FileCode,
  Play,
  Plus,
  Trash2,
  MessageSquare,
  History,
  ChevronRight,
  ChevronDown,
  Terminal as TerminalIcon,
  Code2,
  Cpu,
  Sparkles,
  X,
  Check,
  Settings,
  Folder,
  FolderPlus,
  FilePlus,
  FolderSync,
  Unlink
} from 'lucide-react';
import Editor, { DiffEditor } from '@monaco-editor/react';
import { configureMonacoSuggestionAcceptance } from './monaco-suggest';
import { motion, AnimatePresence } from 'motion/react';
import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';
import { GoogleGenAI, Type, type FunctionDeclaration } from "@google/genai";
import ReactMarkdown from 'react-markdown';
import { flushSync } from 'react-dom';
import { Layout, Model, TabNode, IJsonModel, Actions, DockLocation } from 'flexlayout-react';
import 'flexlayout-react/style/dark.css';
import * as Tooltip from '@radix-ui/react-tooltip';
import * as Separator from '@radix-ui/react-separator';
import {
  CODEX_CLI_RESPONSES_ENDPOINT,
  CODEX_CLI_STATIC_REPOSITORY,
  DEFAULT_CODEX_CLI_OAUTH_SESSION,
  buildCodexCliPromptPrefix,
  completeCodexCliBrowserLogin,
  extractCodexCliVisibleText,
  formatCodexCliStatusLines,
  normalizeCodexCliMcpServers,
  normalizeCodexCliOAuthSession,
  normalizeCodexCliReasoningEffort,
  runCodexCliTerminalCommand,
  type CodexCliMcpServer,
  type CodexCliOAuthSession,
  type CodexCliReasoningEffort,
  type CodexCliRuntimeState,
} from './codex-cli-static';

type UserFolder = import('./pyright').UserFolder;
type PyrightModule = typeof import('./pyright');
type CSharpAuthoringModule = typeof import('./csharp-intellisage');
type BrowserCSharpModule = typeof import('./browser-csharp-api');

let pyrightModulePromise: Promise<PyrightModule> | null = null;
let csharpAuthoringModulePromise: Promise<CSharpAuthoringModule> | null = null;
let browserCSharpModulePromise: Promise<BrowserCSharpModule> | null = null;

const loadPyrightModule = () => {
  if (!pyrightModulePromise) pyrightModulePromise = import('./pyright');
  return pyrightModulePromise;
};

const loadCSharpAuthoringModule = () => {
  if (!csharpAuthoringModulePromise) csharpAuthoringModulePromise = import('./csharp-intellisage');
  return csharpAuthoringModulePromise;
};

const loadBrowserCSharpModule = () => {
  if (!browserCSharpModulePromise) browserCSharpModulePromise = import('./browser-csharp-api');
  return browserCSharpModulePromise;
};

const SYNC_DB_NAME = 'codecraft-sync';
const SYNC_STORE_NAME = 'handles';
const SYNC_META_KEY = 'codecraft-sync-meta';
const PYTHON_CACHE_DB_NAME = 'codecraft-python-cache';
const PYTHON_CACHE_STORE_NAME = 'pyodide-package-meta';
const PYTHON_CACHE_PACKAGE_META_KEY = 'packages';
const PYTHON_CACHE_PACKAGE_SNAPSHOT_KEY = 'snapshot';

function openSyncDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(SYNC_DB_NAME, 1);
    req.onupgradeneeded = () => { req.result.createObjectStore(SYNC_STORE_NAME); };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function saveSyncHandle(folderId: string, handle: FileSystemDirectoryHandle) {
  const db = await openSyncDB();
  return new Promise<void>((resolve, reject) => {
    const tx = db.transaction(SYNC_STORE_NAME, 'readwrite');
    tx.objectStore(SYNC_STORE_NAME).put(handle, folderId);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

async function removeSyncHandle(folderId: string) {
  const db = await openSyncDB();
  return new Promise<void>((resolve, reject) => {
    const tx = db.transaction(SYNC_STORE_NAME, 'readwrite');
    tx.objectStore(SYNC_STORE_NAME).delete(folderId);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

async function loadAllSyncHandles(): Promise<Map<string, FileSystemDirectoryHandle>> {
  const db = await openSyncDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(SYNC_STORE_NAME, 'readonly');
    const store = tx.objectStore(SYNC_STORE_NAME);
    const req = store.openCursor();
    const map = new Map<string, FileSystemDirectoryHandle>();
    req.onsuccess = () => {
      const cursor = req.result;
      if (cursor) {
        map.set(cursor.key as string, cursor.value as FileSystemDirectoryHandle);
        cursor.continue();
      } else {
        resolve(map);
      }
    };
    req.onerror = () => reject(req.error);
  });
}

function openPythonCacheDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(PYTHON_CACHE_DB_NAME, 1);
    req.onupgradeneeded = () => {
      if (!req.result.objectStoreNames.contains(PYTHON_CACHE_STORE_NAME)) {
        req.result.createObjectStore(PYTHON_CACHE_STORE_NAME);
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

interface ZipArchiveEntry {
  name: string;
  method: number;
  compSize: number;
  uncompSize: number;
  localOff: number;
}

function zipU16(buf: Uint8Array, off: number) {
  return buf[off] | (buf[off + 1] << 8);
}

function zipU32(buf: Uint8Array, off: number) {
  return (buf[off] | (buf[off + 1] << 8) | (buf[off + 2] << 16) | (buf[off + 3] << 24)) >>> 0;
}

function parseZipEntries(data: Uint8Array): ZipArchiveEntry[] {
  let eocd = -1;
  for (let i = data.length - 22; i >= Math.max(0, data.length - 65557); i--) {
    if (zipU32(data, i) === 0x06054b50) {
      eocd = i;
      break;
    }
  }
  if (eocd === -1) return [];

  const cdOff = zipU32(data, eocd + 16);
  const cdSize = zipU32(data, eocd + 12);
  const entries: ZipArchiveEntry[] = [];
  let p = cdOff;

  while (p < cdOff + cdSize) {
    if (zipU32(data, p) !== 0x02014b50) break;
    const method = zipU16(data, p + 10);
    const compSize = zipU32(data, p + 20);
    const uncompSize = zipU32(data, p + 24);
    const nameLen = zipU16(data, p + 28);
    const extraLen = zipU16(data, p + 30);
    const commentLen = zipU16(data, p + 32);
    const localOff = zipU32(data, p + 42);
    const name = new TextDecoder().decode(data.subarray(p + 46, p + 46 + nameLen));
    entries.push({ name, method, compSize, uncompSize, localOff });
    p += 46 + nameLen + extraLen + commentLen;
  }

  return entries;
}

function readZipEntryRaw(data: Uint8Array, entry: ZipArchiveEntry): Uint8Array {
  const nameLen = zipU16(data, entry.localOff + 26);
  const extraLen = zipU16(data, entry.localOff + 28);
  const start = entry.localOff + 30 + nameLen + extraLen;
  return data.subarray(start, start + entry.compSize);
}

async function readZipEntryData(data: Uint8Array, entry: ZipArchiveEntry): Promise<Uint8Array> {
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

    const total = chunks.reduce((sum, chunk) => sum + chunk.length, 0);
    const out = new Uint8Array(total);
    let off = 0;
    for (const chunk of chunks) {
      out.set(chunk, off);
      off += chunk.length;
    }
    return out;
  }
  throw new Error(`Unsupported ZIP method: ${entry.method}`);
}

function crc32(data: Uint8Array): number {
  let crc = 0xFFFFFFFF;
  for (let i = 0; i < data.length; i++) {
    crc ^= data[i];
    for (let j = 0; j < 8; j++) {
      crc = (crc >>> 1) ^ (crc & 1 ? 0xEDB88320 : 0);
    }
  }
  return (crc ^ 0xFFFFFFFF) >>> 0;
}

function buildStoredZip(files: Map<string, Uint8Array>): ArrayBuffer {
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
  for (const entry of fileEntries) {
    cdSize += 46 + entry.name.length;
  }

  const totalSize = cdStart + cdSize + 22;
  const buf = new Uint8Array(totalSize);
  const view = new DataView(buf.buffer);

  let pos = 0;
  for (const entry of fileEntries) {
    view.setUint32(pos, 0x04034b50, true); pos += 4;
    view.setUint16(pos, 20, true); pos += 2;
    view.setUint16(pos, 0, true); pos += 2;
    view.setUint16(pos, 0, true); pos += 2;
    view.setUint32(pos, 0, true); pos += 4;
    view.setUint32(pos, entry.crc, true); pos += 4;
    view.setUint32(pos, entry.data.length, true); pos += 4;
    view.setUint32(pos, entry.data.length, true); pos += 4;
    view.setUint16(pos, entry.name.length, true); pos += 2;
    view.setUint16(pos, 0, true); pos += 2;
    buf.set(entry.name, pos); pos += entry.name.length;
    buf.set(entry.data, pos); pos += entry.data.length;
  }

  for (const entry of fileEntries) {
    view.setUint32(pos, 0x02014b50, true); pos += 4;
    view.setUint16(pos, 20, true); pos += 2;
    view.setUint16(pos, 20, true); pos += 2;
    view.setUint16(pos, 0, true); pos += 2;
    view.setUint16(pos, 0, true); pos += 2;
    view.setUint32(pos, 0, true); pos += 4;
    view.setUint32(pos, entry.crc, true); pos += 4;
    view.setUint32(pos, entry.data.length, true); pos += 4;
    view.setUint32(pos, entry.data.length, true); pos += 4;
    view.setUint16(pos, entry.name.length, true); pos += 2;
    view.setUint16(pos, 0, true); pos += 2;
    view.setUint16(pos, 0, true); pos += 2;
    view.setUint16(pos, 0, true); pos += 2;
    view.setUint16(pos, 0, true); pos += 2;
    view.setUint32(pos, 0, true); pos += 4;
    view.setUint32(pos, entry.offset, true); pos += 4;
    buf.set(entry.name, pos); pos += entry.name.length;
  }

  view.setUint32(pos, 0x06054b50, true); pos += 4;
  view.setUint16(pos, 0, true); pos += 2;
  view.setUint16(pos, 0, true); pos += 2;
  view.setUint16(pos, fileEntries.length, true); pos += 2;
  view.setUint16(pos, fileEntries.length, true); pos += 2;
  view.setUint32(pos, cdSize, true); pos += 4;
  view.setUint32(pos, cdStart, true); pos += 4;
  view.setUint16(pos, 0, true);

  return buf.buffer;
}

function pyodideStdlibRootFromZipEntry(name: string): string | null {
  const first = name.split('/')[0]?.trim();
  if (!first || first === '__pycache__' || first === 'site-packages') {
    return null;
  }
  if (first === 'lib-dynload') {
    const base = name.split('/').pop()?.trim() || '';
    if (!base) return null;
    return base.replace(/(\.cpython-[^.]+)?\.(so|pyd)$/i, '');
  }
  if (first.endsWith('.py') || first.endsWith('.pyi')) {
    return first.replace(/\.(py|pyi)$/i, '');
  }
  return first;
}

function collectImportedTopLevelModulesFromPythonSource(source: string, currentRoot: string): string[] {
  const normalized = source
    .replace(/\\\r?\n/g, ' ')
    .replace(/#[^\n]*/g, '');
  const imports = new Set<string>();

  for (const match of normalized.matchAll(/^\s*import\s+([^\n]+)/gm)) {
    const clause = match[1] || '';
    for (const part of clause.split(',')) {
      const spec = part.trim().replace(/\s+as\s+.+$/, '');
      const root = spec.split('.')[0]?.trim();
      if (root) imports.add(root);
    }
  }

  for (const match of normalized.matchAll(/^\s*from\s+([.\w]+)\s+import\b/gm)) {
    const spec = (match[1] || '').trim();
    if (!spec) continue;
    if (spec.startsWith('.')) {
      imports.add(currentRoot);
      continue;
    }
    const root = spec.split('.')[0]?.trim();
    if (root) imports.add(root);
  }

  return [...imports];
}

function shouldAlwaysKeepPyodideStdlibRoot(root: string): boolean {
  return root.startsWith('_sysconfigdata__');
}

async function expandPyodideStdlibAllowedRoots(stdlibZip: ArrayBuffer, allowedRoots: Set<string>) {
  const data = new Uint8Array(stdlibZip);
  const entries = parseZipEntries(data);
  const rootToEntries = new Map<string, ZipArchiveEntry[]>();
  const textCache = new Map<string, string>();

  for (const entry of entries) {
    if (entry.name.endsWith('/')) continue;
    const root = pyodideStdlibRootFromZipEntry(entry.name);
    if (!root) continue;
    const list = rootToEntries.get(root) || [];
    list.push(entry);
    rootToEntries.set(root, list);
  }

  const expandedRoots = new Set<string>(allowedRoots);
  for (const root of rootToEntries.keys()) {
    if (shouldAlwaysKeepPyodideStdlibRoot(root)) {
      expandedRoots.add(root);
    }
  }
  const queue = [...allowedRoots].filter(root => rootToEntries.has(root));

  while (queue.length > 0) {
    const root = queue.shift()!;
    const rootEntries = rootToEntries.get(root) || [];
    for (const entry of rootEntries) {
      if (!entry.name.endsWith('.py') && !entry.name.endsWith('.pyi')) continue;

      let source = textCache.get(entry.name);
      if (source === undefined) {
        source = new TextDecoder().decode(await readZipEntryData(data, entry));
        textCache.set(entry.name, source);
      }

      const importedRoots = collectImportedTopLevelModulesFromPythonSource(source, root);
      for (const importedRoot of importedRoots) {
        if (!rootToEntries.has(importedRoot) || expandedRoots.has(importedRoot)) continue;
        expandedRoots.add(importedRoot);
        queue.push(importedRoot);
      }
    }
  }

  return { data, entries, expandedRoots };
}

async function buildFilteredPyodideStdlibZip(stdlibZip: ArrayBuffer, allowedRoots: Set<string>): Promise<ArrayBuffer> {
  const { data, entries, expandedRoots } = await expandPyodideStdlibAllowedRoots(stdlibZip, allowedRoots);

  const filtered = new Map<string, Uint8Array>();

  for (const entry of entries) {
    if (entry.name.endsWith('/')) continue;
    const root = pyodideStdlibRootFromZipEntry(entry.name);
    if (!root || !expandedRoots.has(root)) continue;
    filtered.set(entry.name, await readZipEntryData(data, entry));
  }

  return buildStoredZip(filtered);
}

interface SyncMeta {
  folderId: string;
  folderName: string;
  localPath: string;
  connectedAt: number;
}

type AssistantProvider = 'codex-cli' | 'gemini' | 'openai' | 'anthropic';
type AssistantMessageKind = 'message' | 'log';
type AssistantReasoningControl = 'toggleable' | 'always_on' | 'always_off';
type AssistantSchemaPrimitive = 'string' | 'number' | 'boolean';

interface AssistantToolPropertyDefinition {
  type: AssistantSchemaPrimitive;
  description: string;
  enum?: string[];
}

interface AssistantToolDefinition {
  name: string;
  description: string;
  parameters: {
    type: 'object';
    description?: string;
    properties: Record<string, AssistantToolPropertyDefinition>;
    required?: string[];
  };
}

interface AssistantModelPreset {
  id: string;
  label: string;
  reasoningControl: AssistantReasoningControl;
}

interface SharedEditorTarget {
  tabId: string;
  itemId: string;
  version: number;
}

function loadSyncMeta(): SyncMeta[] {
  try { return JSON.parse(localStorage.getItem(SYNC_META_KEY) || '[]'); }
  catch { return []; }
}

function saveSyncMeta(meta: SyncMeta[]) {
  localStorage.setItem(SYNC_META_KEY, JSON.stringify(meta));
}

const DEFAULT_ASSISTANT_CHAT_NAME = "AI assistant";
const DEFAULT_ASSISTANT_TOOL_PASSES = 4;
const DEFAULT_ASSISTANT_ESTIMATED_OUTPUT_TOKENS = 1024;
const createAssistantChatId = () => `chat_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
const INITIAL_ASSISTANT_CHAT_ID = createAssistantChatId();
const DEFAULT_PYI_IMPORT_SIZE_LIMIT_BYTES = 200 * 1024;
const ABSOLUTE_PYI_IMPORT_SIZE_LIMIT_BYTES = 2 * 1024 * 1024;

const ASSISTANT_PROVIDER_OPTIONS: { value: AssistantProvider; label: string }[] = [
  { value: 'codex-cli', label: 'Codex CLI' },
  { value: 'gemini', label: 'Google Gemini' },
  { value: 'openai', label: 'OpenAI' },
  { value: 'anthropic', label: 'Anthropic' },
];

const ASSISTANT_MODEL_PRESETS: Record<AssistantProvider, AssistantModelPreset[]> = {
  'codex-cli': [
    { id: 'gpt-5.4', label: 'GPT-5.4', reasoningControl: 'toggleable' },
    { id: 'gpt-5.3-codex', label: 'GPT-5.3 Codex', reasoningControl: 'toggleable' },
    { id: 'gpt-5.2', label: 'GPT-5.2', reasoningControl: 'toggleable' },
  ],
  gemini: [
    { id: 'gemini-2.5-flash', label: 'Gemini 2.5 Flash', reasoningControl: 'toggleable' },
    { id: 'gemini-2.5-flash-lite', label: 'Gemini 2.5 Flash Lite', reasoningControl: 'toggleable' },
    { id: 'gemini-2.5-pro', label: 'Gemini 2.5 Pro', reasoningControl: 'always_on' },
  ],
  openai: [
    { id: 'gpt-5.1', label: 'GPT-5.1', reasoningControl: 'toggleable' },
    { id: 'gpt-5.1-mini', label: 'GPT-5.1 mini', reasoningControl: 'toggleable' },
    { id: 'gpt-5.1-nano', label: 'GPT-5.1 nano', reasoningControl: 'toggleable' },
  ],
  anthropic: [
    { id: 'claude-sonnet-4-20250514', label: 'Claude Sonnet 4', reasoningControl: 'toggleable' },
    { id: 'claude-opus-4-1-20250805', label: 'Claude Opus 4.1', reasoningControl: 'toggleable' },
    { id: 'claude-3-7-sonnet-20250219', label: 'Claude 3.7 Sonnet', reasoningControl: 'toggleable' },
  ],
};
const STORAGE_KEYS = {
  files: 'codecraft-files',
  settings: 'codecraft-settings',
  assistantChats: 'codecraft-assistant-chats',
  layout: 'codecraft-layout',
  pipPackages: 'codecraft-pip-packages',
  pipIncludedModules: 'codecraft-pip-included-modules',
  csharpNamespaces: 'codecraft-csharp-namespaces',
  pyiImportSizeLimits: 'codecraft-pyi-import-size-limits'
};

const EXT_TO_LANGUAGE: Record<string, string> = {
  js: 'javascript', jsx: 'javascript', mjs: 'javascript', cjs: 'javascript',
  ts: 'typescript', tsx: 'typescript', mts: 'typescript', cts: 'typescript',
  py: 'python', pyw: 'python',
  cs: 'csharp',
  html: 'html', htm: 'html',
  css: 'css', scss: 'scss', less: 'less',
  json: 'json', jsonc: 'json',
  md: 'markdown', mdx: 'markdown',
  xml: 'xml', svg: 'xml',
  yaml: 'yaml', yml: 'yaml',
  sh: 'shell', bash: 'shell', zsh: 'shell',
  sql: 'sql',
  c: 'c', h: 'c',
  cpp: 'cpp', cc: 'cpp', cxx: 'cpp', hpp: 'cpp',
  java: 'java',
  go: 'go',
  rs: 'rust',
  rb: 'ruby',
  php: 'php',
  swift: 'swift',
  kt: 'kotlin', kts: 'kotlin',
  r: 'r',
  lua: 'lua',
  dockerfile: 'dockerfile',
  toml: 'ini', ini: 'ini', cfg: 'ini',
  txt: 'plaintext'
};

function langFromFilename(name: string): string {
  const ext = name.split('.').pop()?.toLowerCase() || '';
  return EXT_TO_LANGUAGE[ext] || 'plaintext';
}

const INITIAL_LAYOUT: IJsonModel = {
  global: {
    tabEnableClose: true
  },
  borders: [],
  layout: {
    type: "row",
    weight: 100,
    children: [
      {
        type: "tabset",
        weight: 20,
        enableDrop: true,
        children: [
          {
            type: "tab",
            id: "explorer-panel-tab",
            name: "Explorer",
            component: "explorer",
            enableClose: false
          }
        ]
      },
      {
        type: "row",
        weight: 55,
        children: [
          {
            type: "tabset",
            id: "editor-tabset",
            weight: 70,
            enableDrop: true,
            children: [
              {
                type: "tab",
                id: "editor-fallback-tab",
                name: "Editor",
                component: "editor",
                config: {
                  isFallback: true
                },
                enableClose: false
              }
            ]
          },
          {
            type: "row",
            weight: 30,
            children: [
              {
                type: "tabset",
                weight: 50,
                enableDrop: true,
                children: [
                  {
                    type: "tab",
                    id: "output-panel-tab",
                    name: "Output",
                    component: "output",
                    enableClose: false
                  }
                ]
              },
              {
                type: "tabset",
                weight: 50,
                enableDrop: true,
                children: [
                  {
                    type: "tab",
                    id: "terminal-panel-tab",
                    name: "Terminal",
                    component: "terminal",
                    enableClose: false
                  }
                ]
              }
            ]
          }
        ]
      },
      {
        type: "tabset",
        weight: 25,
        enableDrop: true,
        children: [
          {
            type: "tab",
            id: "assistant-panel-tab",
            name: DEFAULT_ASSISTANT_CHAT_NAME,
            component: "assistant",
            config: {
              chatId: INITIAL_ASSISTANT_CHAT_ID
            },
            enableClose: true
          }
        ]
      }
    ]
  }
};

const buildSharedEditorOptions = (fontSize: number) => ({
  fontSize,
  fontFamily: '"JetBrains Mono", "Fira Code", monospace',
  readOnly: false,
  domReadOnly: false,
  tabFocusMode: false,
  useTabStops: true,
  stickyTabStops: false,
  insertSpaces: true,
  detectIndentation: true,
  minimap: { enabled: true },
  scrollBeyondLastLine: false,
  scrollBeyondLastColumn: 5,
  automaticLayout: true,
  smoothScrolling: false,
  padding: { top: 20 },
  lineNumbers: 'on' as const,
  lineNumbersMinChars: 5,
  renderLineHighlight: 'all' as const,
  renderValidationDecorations: 'editable' as const,
  selectionHighlight: true,
  occurrencesHighlight: 'singleFile' as const,
  emptySelectionClipboard: true,
  copyWithSyntaxHighlighting: true,
  formatOnType: false,
  formatOnPaste: false,
  autoIndent: 'advanced' as const,
  autoClosingBrackets: 'languageDefined' as const,
  autoClosingComments: 'languageDefined' as const,
  autoClosingQuotes: 'languageDefined' as const,
  autoClosingDelete: 'auto' as const,
  autoClosingOvertype: 'auto' as const,
  autoSurround: 'languageDefined' as const,
  matchBrackets: 'always' as const,
  linkedEditing: false,
  codeLens: true,
  folding: true,
  foldingStrategy: 'auto' as const,
  foldingHighlight: true,
  hover: {
    enabled: true,
    delay: 300,
    sticky: true,
    hidingDelay: 300,
    above: false,
  },
  guides: {
    indentation: true,
    highlightActiveIndentation: true,
    bracketPairs: false,
    bracketPairsHorizontal: false,
    highlightActiveBracketPair: false,
  },
  unicodeHighlight: {
    ambiguousCharacters: false,
    invisibleCharacters: false,
    nonBasicASCII: false,
    includeComments: false,
    includeStrings: false,
    allowedCharacters: {},
    allowedLocales: { _os: true as const, _vscode: true as const },
  },
  inlayHints: {
    enabled: 'on' as const,
    fontSize: 0,
    fontFamily: '',
    padding: false,
  },
  quickSuggestions: {
    other: true,
    comments: false,
    strings: true
  },
  quickSuggestionsDelay: 10,
  suggest: {
    insertMode: 'insert' as const,
    filterGraceful: true,
    snippetsPreventQuickSuggestions: false,
    localityBonus: false,
    shareSuggestSelections: false,
    selectionMode: 'always' as const,
    showIcons: true,
    showStatusBar: false,
    preview: false,
    previewMode: 'prefix' as const,
    showInlineDetails: true,
    showMethods: true,
    showFunctions: true,
    showConstructors: true,
    showDeprecated: true,
    matchOnWordStartOnly: false,
    showFields: true,
    showVariables: true,
    showClasses: true,
    showStructs: true,
    showInterfaces: true,
    showModules: true,
    showProperties: true,
    showEvents: true,
    showOperators: true,
    showUnits: true,
    showValues: true,
    showConstants: true,
    showEnums: true,
    showEnumMembers: true,
    showKeywords: true,
    showWords: true,
    showColors: true,
    showFiles: true,
    showReferences: true,
    showFolders: true,
    showTypeParameters: true,
    showIssues: true,
    showUsers: true,
    showSnippets: true,
  },
  suggestOnTriggerCharacters: true,
  acceptSuggestionOnEnter: 'on' as const,
  acceptSuggestionOnCommitCharacter: true,
  tabCompletion: 'off' as const,
  snippetSuggestions: 'inline' as const,
  suggestSelection: 'first' as const,
  parameterHints: {
    enabled: true,
    cycle: true
  },
  inlineSuggest: {
    enabled: true
  },
  wordBasedSuggestions: 'currentDocument' as const,
  wordBasedSuggestionsOnlySameLanguage: false,
  scrollbar: {
    vertical: 'visible' as const,
    horizontal: 'visible' as const,
    useShadows: false,
    verticalScrollbarSize: 10,
    horizontalScrollbarSize: 10
  }
});

// Define AI tools
function isAssistantProvider(value: unknown): value is AssistantProvider {
  return value === 'codex-cli' || value === 'gemini' || value === 'openai' || value === 'anthropic';
}

function getAssistantDefaultModel(provider: AssistantProvider) {
  return ASSISTANT_MODEL_PRESETS[provider][0]?.id || '';
}

function getAssistantProviderLabel(provider: AssistantProvider) {
  return ASSISTANT_PROVIDER_OPTIONS.find(option => option.value === provider)?.label || provider;
}

function getAssistantReasoningControl(provider: AssistantProvider, model: string): AssistantReasoningControl {
  const trimmed = model.trim();
  const preset = ASSISTANT_MODEL_PRESETS[provider].find(entry => entry.id === trimmed);
  if (preset) return preset.reasoningControl;

  if (provider === 'codex-cli') {
    return 'toggleable';
  }

  if (provider === 'gemini') {
    if (/^gemini-2\.5-flash(-lite)?/i.test(trimmed)) return 'toggleable';
    if (/^gemini-2\.5-pro/i.test(trimmed) || /^gemini-3/i.test(trimmed)) return 'always_on';
    return 'always_off';
  }

  if (provider === 'openai') {
    if (/^gpt-5\.1/i.test(trimmed)) return 'toggleable';
    if (/^(gpt-5|o[134])\b/i.test(trimmed)) return 'always_on';
    return 'always_off';
  }

  if (provider === 'anthropic') {
    if (/^claude-(opus-4|opus-4-1|sonnet-4|3-7-sonnet)/i.test(trimmed)) return 'toggleable';
    return 'always_off';
  }

  return 'always_off';
}

function getAssistantReasoningAvailabilityNote(provider: AssistantProvider, model: string) {
  if (provider === 'codex-cli') {
    return 'Codex CLI mode sends a reasoning effort control and shows only user-visible summaries.';
  }

  switch (getAssistantReasoningControl(provider, model)) {
    case 'toggleable':
      return 'This provider/model can switch Chain of Thought on or off.';
    case 'always_on':
      return 'This provider/model does not offer a full thinking-off mode, so Chain of Thought stays on.';
    case 'always_off':
    default:
      return 'This provider/model does not expose a Chain of Thought mode in CodeCraft.';
  }
}

function calculateAssistantPaidCostUsd(
  _provider: AssistantProvider,
  _model: string,
  _inputTokenCount: number,
  _outputTokenCount: number
) {
  return null;
}

function toGeminiFunctionDeclaration(tool: AssistantToolDefinition): FunctionDeclaration {
  const toGeminiType = (value: AssistantSchemaPrimitive) => {
    switch (value) {
      case 'string':
        return Type.STRING;
      case 'number':
        return Type.NUMBER;
      case 'boolean':
        return Type.BOOLEAN;
      default:
        return Type.STRING;
    }
  };

  return {
    name: tool.name,
    description: tool.description,
    parameters: {
      type: Type.OBJECT,
      description: tool.parameters.description,
      properties: Object.fromEntries(
        Object.entries(tool.parameters.properties).map(([key, value]) => [
          key,
          {
            type: toGeminiType(value.type),
            description: value.description,
            ...(value.enum ? { enum: value.enum } : {}),
          },
        ])
      ),
      ...(tool.parameters.required ? { required: tool.parameters.required } : {}),
    },
  };
}

function toOpenAIToolDefinition(tool: AssistantToolDefinition) {
  return {
    type: 'function',
    name: tool.name,
    description: tool.description,
    parameters: tool.parameters,
  };
}

function toAnthropicToolDefinition(tool: AssistantToolDefinition) {
  return {
    name: tool.name,
    description: tool.description,
    input_schema: tool.parameters,
  };
}

const proposeEditTool: AssistantToolDefinition = {
  name: "proposeEdit",
  description: "Propose changes to a file for user review.",
  parameters: {
    type: 'object',
    description: "Propose changes to a file for user review.",
    properties: {
      pathOrName: {
        type: 'string',
        description: "The path or name of the file to edit.",
      },
      newContent: {
        type: 'string',
        description: "The complete proposed content for the file.",
      },
    },
    required: ["pathOrName", "newContent"],
  },
};

const navigateToTool: AssistantToolDefinition = {
  name: "navigateTo",
  description: "Switch the active file or folder in the editor.",
  parameters: {
    type: 'object',
    description: "Switch the active file or folder in the editor.",
    properties: {
      pathOrName: {
        type: 'string',
        description: "The path or name of the file or folder to navigate to.",
      },
    },
    required: ["pathOrName"],
  },
};

const moveCursorTool: AssistantToolDefinition = {
  name: "moveCursor",
  description: "Move the editor cursor to a specific position.",
  parameters: {
    type: 'object',
    description: "Move the editor cursor to a specific position.",
    properties: {
      line: {
        type: 'number',
        description: "The line number (1-indexed).",
      },
      column: {
        type: 'number',
        description: "The column number (1-indexed).",
      },
    },
    required: ["line", "column"],
  },
};

const createItemTool: AssistantToolDefinition = {
  name: "createItem",
  description: "Create a file or folder in the workspace.",
  parameters: {
    type: 'object',
    description: "Create a file or folder in the workspace.",
    properties: {
      type: {
        type: 'string',
        description: "Either 'file' or 'folder'.",
        enum: ['file', 'folder'],
      },
      name: {
        type: 'string',
        description: "Name of the new file or folder.",
      },
      parentPathOrName: {
        type: 'string',
        description: "Optional parent folder path or name. Omit for workspace root.",
      },
      content: {
        type: 'string',
        description: "Optional file content. Ignored for folders.",
      },
    },
    required: ["type", "name"],
  },
};

const deleteItemTool: AssistantToolDefinition = {
  name: "deleteItem",
  description: "Delete a file or folder by path or name.",
  parameters: {
    type: 'object',
    description: "Delete a file or folder by path or name.",
    properties: {
      pathOrName: {
        type: 'string',
        description: "Path or name of the item to delete.",
      },
    },
    required: ["pathOrName"],
  },
};

const moveItemTool: AssistantToolDefinition = {
  name: "moveItem",
  description: "Move a file or folder into another folder.",
  parameters: {
    type: 'object',
    description: "Move a file or folder into another folder.",
    properties: {
      sourcePathOrName: {
        type: 'string',
        description: "Path or name of the item to move.",
      },
      destinationFolderPathOrName: {
        type: 'string',
        description: "Destination folder path or name. Use '/' to move to workspace root.",
      },
    },
    required: ["sourcePathOrName", "destinationFolderPathOrName"],
  },
};

const runTerminalCommandTool: AssistantToolDefinition = {
  name: "runTerminalCommand",
  description: "Run a command in the built-in terminal emulator.",
  parameters: {
    type: 'object',
    description: "Run a command in the built-in terminal emulator.",
    properties: {
      command: {
        type: 'string',
        description: "Terminal command text to execute.",
      },
    },
    required: ["command"],
  },
};

const terminalLsTool: AssistantToolDefinition = {
  name: "terminalLs",
  description: "List files and folders in the current working directory or in a target folder.",
  parameters: {
    type: 'object',
    properties: {
      pathOrName: {
        type: 'string',
        description: "Optional folder path or folder name. Omit to list the current working directory.",
      },
    },
  },
};

const terminalPwdTool: AssistantToolDefinition = {
  name: "terminalPwd",
  description: "Show the current working directory in the fake terminal.",
  parameters: {
    type: 'object',
    properties: {},
  },
};

const terminalCdTool: AssistantToolDefinition = {
  name: "terminalCd",
  description: "Change the current working directory in the fake terminal.",
  parameters: {
    type: 'object',
    properties: {
      target: {
        type: 'string',
        description: "Folder name or path. Use '..' for parent, '/' or '~' for workspace root.",
      },
    },
  },
};

const terminalMkdirTool: AssistantToolDefinition = {
  name: "terminalMkdir",
  description: "Create a folder in the current working directory.",
  parameters: {
    type: 'object',
    properties: {
      name: {
        type: 'string',
        description: "Folder name to create.",
      },
    },
    required: ['name'],
  },
};

const terminalTouchTool: AssistantToolDefinition = {
  name: "terminalTouch",
  description: "Create an empty file in the current working directory.",
  parameters: {
    type: 'object',
    properties: {
      name: {
        type: 'string',
        description: "File name to create.",
      },
    },
    required: ['name'],
  },
};

const terminalOpenTool: AssistantToolDefinition = {
  name: "terminalOpen",
  description: "Open a file or folder in the editor from the fake terminal.",
  parameters: {
    type: 'object',
    properties: {
      pathOrName: {
        type: 'string',
        description: "Path or name of the file or folder to open.",
      },
    },
    required: ['pathOrName'],
  },
};

const terminalCatTool: AssistantToolDefinition = {
  name: "terminalCat",
  description: "Read the contents of a file from the fake terminal.",
  parameters: {
    type: 'object',
    properties: {
      pathOrName: {
        type: 'string',
        description: "Path or name of the file to print.",
      },
    },
    required: ['pathOrName'],
  },
};

const terminalRmTool: AssistantToolDefinition = {
  name: "terminalRm",
  description: "Remove a file or folder from the current working directory or by path.",
  parameters: {
    type: 'object',
    properties: {
      pathOrName: {
        type: 'string',
        description: "Path or name of the item to remove.",
      },
    },
    required: ['pathOrName'],
  },
};

const terminalClearTool: AssistantToolDefinition = {
  name: "terminalClear",
  description: "Clear the built-in terminal output.",
  parameters: {
    type: 'object',
    properties: {},
  },
};

const terminalHelpTool: AssistantToolDefinition = {
  name: "terminalHelp",
  description: "Show the list of available fake terminal commands.",
  parameters: {
    type: 'object',
    properties: {},
  },
};

const terminalDateTool: AssistantToolDefinition = {
  name: "terminalDate",
  description: "Show the current local date and time inside the fake terminal.",
  parameters: {
    type: 'object',
    properties: {},
  },
};

const terminalEchoTool: AssistantToolDefinition = {
  name: "terminalEcho",
  description: "Echo text in the fake terminal.",
  parameters: {
    type: 'object',
    properties: {
      text: {
        type: 'string',
        description: "Text to echo.",
      },
    },
    required: ['text'],
  },
};

const terminalWhoamiTool: AssistantToolDefinition = {
  name: "terminalWhoami",
  description: "Show the current fake terminal user.",
  parameters: {
    type: 'object',
    properties: {},
  },
};

const codexMcpListServersTool: AssistantToolDefinition = {
  name: "codexMcpListServers",
  description: "List MCP servers configured for Codex CLI mode in CodeCraft.",
  parameters: {
    type: 'object',
    properties: {},
  },
};

const codexMcpListToolsTool: AssistantToolDefinition = {
  name: "codexMcpListTools",
  description: "List tools exposed by a configured streamable HTTP MCP server.",
  parameters: {
    type: 'object',
    properties: {
      serverName: {
        type: 'string',
        description: "Configured MCP server name.",
      },
    },
    required: ['serverName'],
  },
};

const codexMcpCallTool: AssistantToolDefinition = {
  name: "codexMcpCallTool",
  description: "Call a tool on a configured streamable HTTP MCP server.",
  parameters: {
    type: 'object',
    properties: {
      serverName: {
        type: 'string',
        description: "Configured MCP server name.",
      },
      toolName: {
        type: 'string',
        description: "MCP tool name to call.",
      },
      argumentsJson: {
        type: 'string',
        description: "JSON object string containing the tool arguments.",
      },
    },
    required: ['serverName', 'toolName'],
  },
};

const pipInstallTool: AssistantToolDefinition = {
  name: "pipInstall",
  description: "Install a Python package in the fake terminal.",
  parameters: {
    type: 'object',
    properties: {
      packageName: {
        type: 'string',
        description: "Python package name or URL to install.",
      },
      forceBuild: {
        type: 'boolean',
        description: "Whether to force the source-build fallback with the equivalent of -force.",
      },
    },
    required: ['packageName'],
  },
};

const pipUpgradeTool: AssistantToolDefinition = {
  name: "pipUpgrade",
  description: "Upgrade a Python package in the fake terminal.",
  parameters: {
    type: 'object',
    properties: {
      packageName: {
        type: 'string',
        description: "Python package name to upgrade.",
      },
      version: {
        type: 'string',
        description: "Optional version to upgrade to.",
      },
    },
    required: ['packageName'],
  },
};

const pipUninstallTool: AssistantToolDefinition = {
  name: "pipUninstall",
  description: "Uninstall a Python package in the fake terminal.",
  parameters: {
    type: 'object',
    properties: {
      packageName: {
        type: 'string',
        description: "Python package name to uninstall.",
      },
    },
    required: ['packageName'],
  },
};

const pipIncludeTool: AssistantToolDefinition = {
  name: "pipInclude",
  description: "Include a stdlib module in the Pyright type checker from the fake terminal.",
  parameters: {
    type: 'object',
    properties: {
      moduleName: {
        type: 'string',
        description: "Module name to include.",
      },
    },
    required: ['moduleName'],
  },
};

const pipListTool: AssistantToolDefinition = {
  name: "pipList",
  description: "List installed Python packages in the fake terminal.",
  parameters: {
    type: 'object',
    properties: {},
  },
};

const nugetIncludeTool: AssistantToolDefinition = {
  name: "nugetInclude",
  description: "Include a C# namespace in the fake terminal.",
  parameters: {
    type: 'object',
    properties: {
      namespaceName: {
        type: 'string',
        description: "C# namespace to include.",
      },
    },
    required: ['namespaceName'],
  },
};

const nugetListTool: AssistantToolDefinition = {
  name: "nugetList",
  description: "List included C# namespaces in the fake terminal.",
  parameters: {
    type: 'object',
    properties: {},
  },
};

const STANDARD_ASSISTANT_TOOLS: AssistantToolDefinition[] = [
  proposeEditTool,
  navigateToTool,
  moveCursorTool,
  createItemTool,
  deleteItemTool,
  moveItemTool,
  runTerminalCommandTool,
];

const CHAIN_OF_THOUGHT_ASSISTANT_TOOLS: AssistantToolDefinition[] = [
  proposeEditTool,
  navigateToTool,
  moveCursorTool,
  createItemTool,
  deleteItemTool,
  moveItemTool,
  terminalLsTool,
  terminalPwdTool,
  terminalCdTool,
  terminalMkdirTool,
  terminalTouchTool,
  terminalOpenTool,
  terminalCatTool,
  terminalRmTool,
  terminalClearTool,
  terminalHelpTool,
  terminalDateTool,
  terminalEchoTool,
  terminalWhoamiTool,
  codexMcpListServersTool,
  codexMcpListToolsTool,
  codexMcpCallTool,
  pipInstallTool,
  pipUpgradeTool,
  pipUninstallTool,
  pipIncludeTool,
  pipListTool,
  nugetIncludeTool,
  nugetListTool,
];

// Utility for tailwind classes
function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

interface SavedPipPackage { name: string; version: string; }
interface SavedPyiImportSizeLimitOverride { moduleName: string; maxBytes: number | null; }
type PyodidePackageInstallSource = 'pyodide-prebuilt' | 'micropip' | 'sdist' | 'url';

interface CachedPyodideSiteFile {
  relativePath: string;
  data: Uint8Array;
}

interface CachedPyodidePackageMeta {
  version: string;
  source: PyodidePackageInstallSource;
  stubs: UserFolder;
}

interface CachedPyodideEnvironmentSnapshot {
  signature: string;
  files: CachedPyodideSiteFile[];
  packages: Record<string, CachedPyodidePackageMeta>;
}

interface PyodideStubExtractionSummary {
  namesTried: string[];
  discovery: string;
  scanDirCount: number;
  scanRoots: string[];
  stubLimit: number;
  maxTotal: number;
  pyiCandidateCount: number;
  pyiTotalSize: number;
  nativeMinimalCandidateCount: number;
  nativeMinimalTotalSize: number;
  nativeCompressionAttempted: boolean;
  generatedCandidateCount: number;
  generatedTotalSize: number;
  generatedMinimalCandidateCount: number;
  generatedMinimalTotalSize: number;
  generatedPhaseAttempted: boolean;
  pyTotalSize: number;
  rawPhaseAttempted: boolean;
  phase: string;
  returnedEntryCount: number;
  returnedTotalSize: number;
  returnedSamplePaths: string[];
}

interface PyodideStubExtractionResult {
  folder: UserFolder;
  summary: PyodideStubExtractionSummary;
}

function normalizeSavedPipPackageName(pkg: string) {
  return pkg.toLowerCase().replace(/[=<>!].*/, '').trim();
}

function sortSavedPipPackages(pkgs: SavedPipPackage[]) {
  return [...pkgs].sort((a, b) => a.name.localeCompare(b.name));
}

function loadSavedPipPackages(): SavedPipPackage[] {
  try {
    const raw = JSON.parse(localStorage.getItem(STORAGE_KEYS.pipPackages) || '[]');
    if (Array.isArray(raw) && raw.length > 0 && typeof raw[0] === 'string') {
      return sortSavedPipPackages(raw.map((s: string) => ({ name: normalizeSavedPipPackageName(s), version: '' })));
    }
    return sortSavedPipPackages(
      Array.isArray(raw)
        ? raw
          .filter((value): value is { name: string; version?: string } => (
            !!value
            && typeof value.name === 'string'
          ))
          .map(value => ({
            name: normalizeSavedPipPackageName(value.name),
            version: typeof value.version === 'string' ? value.version : '',
          }))
        : []
    );
  } catch { return []; }
}

function savePipPackages(pkgs: SavedPipPackage[]) {
  localStorage.setItem(STORAGE_KEYS.pipPackages, JSON.stringify(sortSavedPipPackages(pkgs)));
}

function addSavedPipPackage(pkg: string, version: string) {
  const pkgs = loadSavedPipPackages();
  const normalized = normalizeSavedPipPackageName(pkg);
  const idx = pkgs.findIndex(p => p.name === normalized);
  if (idx >= 0) {
    pkgs[idx].version = version;
  } else {
    pkgs.push({ name: normalized, version });
  }
  savePipPackages(pkgs);
}

function removeSavedPipPackage(pkg: string) {
  const normalized = normalizeSavedPipPackageName(pkg);
  savePipPackages(loadSavedPipPackages().filter(p => p.name !== normalized));
}

function cloneUserFolder(folder: UserFolder): UserFolder {
  const cloned: UserFolder = {};
  for (const [name, value] of Object.entries(folder)) {
    if (typeof value === 'string') {
      cloned[name] = value;
      continue;
    }
    if (value instanceof ArrayBuffer) {
      cloned[name] = value.slice(0);
      continue;
    }
    cloned[name] = cloneUserFolder(value);
  }
  return cloned;
}

function cloneCachedPyodidePackageMetaRecord(
  cache: Record<string, CachedPyodidePackageMeta>
): Record<string, CachedPyodidePackageMeta> {
  const cloned: Record<string, CachedPyodidePackageMeta> = {};
  for (const [pkgName, meta] of Object.entries(cache)) {
    cloned[pkgName] = {
      version: meta.version,
      source: meta.source,
      stubs: cloneUserFolder(meta.stubs),
    };
  }
  return cloned;
}

function cloneCachedPyodideEnvironmentSnapshot(
  snapshot: CachedPyodideEnvironmentSnapshot | null
): CachedPyodideEnvironmentSnapshot | null {
  if (!snapshot) return null;
  return {
    signature: snapshot.signature,
    files: snapshot.files.map(file => ({
      relativePath: file.relativePath,
      data: new Uint8Array(file.data),
    })),
    packages: cloneCachedPyodidePackageMetaRecord(snapshot.packages),
  };
}

async function loadPersistedPyodidePackageMetaCache(): Promise<Record<string, CachedPyodidePackageMeta>> {
  try {
    const db = await openPythonCacheDB();
    return await new Promise((resolve, reject) => {
      const tx = db.transaction(PYTHON_CACHE_STORE_NAME, 'readonly');
      const req = tx.objectStore(PYTHON_CACHE_STORE_NAME).get(PYTHON_CACHE_PACKAGE_META_KEY);
      tx.oncomplete = () => {
        const raw = req.result;
        if (!raw || typeof raw !== 'object') {
          resolve({});
          return;
        }

        const next: Record<string, CachedPyodidePackageMeta> = {};
        for (const [pkgName, value] of Object.entries(raw as Record<string, CachedPyodidePackageMeta>)) {
          if (!value || typeof value !== 'object') continue;
          if (typeof value.version !== 'string') continue;
          if (typeof value.source !== 'string') continue;
          const stubs = value.stubs && typeof value.stubs === 'object'
            ? cloneUserFolder(value.stubs as UserFolder)
            : {};
          next[pkgName] = {
            version: value.version,
            source: value.source as PyodidePackageInstallSource,
            stubs,
          };
        }
        resolve(next);
      };
      tx.onerror = () => reject(tx.error);
      req.onerror = () => reject(req.error);
    });
  } catch {
    return {};
  }
}

async function savePersistedPyodidePackageMetaCache(cache: Record<string, CachedPyodidePackageMeta>) {
  const db = await openPythonCacheDB();
  const snapshot = cloneCachedPyodidePackageMetaRecord(cache);
  return new Promise<void>((resolve, reject) => {
    const tx = db.transaction(PYTHON_CACHE_STORE_NAME, 'readwrite');
    tx.objectStore(PYTHON_CACHE_STORE_NAME).put(snapshot, PYTHON_CACHE_PACKAGE_META_KEY);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

async function loadPersistedPyodidePackageSnapshot(): Promise<CachedPyodideEnvironmentSnapshot | null> {
  try {
    const db = await openPythonCacheDB();
    return await new Promise((resolve, reject) => {
      const tx = db.transaction(PYTHON_CACHE_STORE_NAME, 'readonly');
      const req = tx.objectStore(PYTHON_CACHE_STORE_NAME).get(PYTHON_CACHE_PACKAGE_SNAPSHOT_KEY);
      tx.oncomplete = () => {
        const raw = req.result;
        if (!raw || typeof raw !== 'object' || typeof raw.signature !== 'string' || !Array.isArray(raw.files)) {
          resolve(null);
          return;
        }
        const files = raw.files
          .filter((file: CachedPyodideSiteFile) => (
            !!file
            && typeof file.relativePath === 'string'
            && file.data instanceof Uint8Array
          ))
          .map((file: CachedPyodideSiteFile) => ({
            relativePath: file.relativePath,
            data: new Uint8Array(file.data),
          }));
        const packages = raw.packages && typeof raw.packages === 'object'
          ? cloneCachedPyodidePackageMetaRecord(raw.packages as Record<string, CachedPyodidePackageMeta>)
          : {};
        resolve({
          signature: raw.signature,
          files,
          packages,
        });
      };
      tx.onerror = () => reject(tx.error);
      req.onerror = () => reject(req.error);
    });
  } catch {
    return null;
  }
}

async function savePersistedPyodidePackageSnapshot(snapshot: CachedPyodideEnvironmentSnapshot | null) {
  const db = await openPythonCacheDB();
  const clonedSnapshot = cloneCachedPyodideEnvironmentSnapshot(snapshot);
  return new Promise<void>((resolve, reject) => {
    const tx = db.transaction(PYTHON_CACHE_STORE_NAME, 'readwrite');
    const store = tx.objectStore(PYTHON_CACHE_STORE_NAME);
    if (clonedSnapshot) {
      store.put(clonedSnapshot, PYTHON_CACHE_PACKAGE_SNAPSHOT_KEY);
    } else {
      store.delete(PYTHON_CACHE_PACKAGE_SNAPSHOT_KEY);
    }
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

function hasUserFolderEntries(folder: UserFolder) {
  return Object.keys(folder).length > 0;
}

function createEmptyPyodideStubExtractionSummary(
  pkgName: string,
  stubLimit = DEFAULT_PYI_IMPORT_SIZE_LIMIT_BYTES
): PyodideStubExtractionSummary {
  return {
    namesTried: [pkgName],
    discovery: 'not-started',
    scanDirCount: 0,
    scanRoots: [],
    stubLimit,
    maxTotal: ABSOLUTE_PYI_IMPORT_SIZE_LIMIT_BYTES,
    pyiCandidateCount: 0,
    pyiTotalSize: 0,
    nativeMinimalCandidateCount: 0,
    nativeMinimalTotalSize: 0,
    nativeCompressionAttempted: false,
    generatedCandidateCount: 0,
    generatedTotalSize: 0,
    generatedMinimalCandidateCount: 0,
    generatedMinimalTotalSize: 0,
    generatedPhaseAttempted: false,
    pyTotalSize: 0,
    rawPhaseAttempted: false,
    phase: 'none',
    returnedEntryCount: 0,
    returnedTotalSize: 0,
    returnedSamplePaths: [],
  };
}

function formatByteSize(bytes: number) {
  if (!Number.isFinite(bytes) || bytes <= 0) return '0 B';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}

function describePyodideStubExtractionPhase(phase: string) {
  switch (phase) {
    case 'native-pyi-full':
      return 'used the complete native .pyi surface';
    case 'native-pyi-minimal-full':
      return 'compressed native .pyi files into a minimal stub surface and kept the full compressed set';
    case 'native-pyi-minimal-partial':
      return 'compressed native .pyi files into a minimal stub surface, but still had to return a prioritized subset';
    case 'native-pyi-partial':
      return 'native .pyi files were too large, so a prioritized subset of native .pyi files was returned';
    case 'generated-pyi-full':
      return 'generated .pyi files from .py sources and kept the full generated set';
    case 'generated-pyi-partial':
      return 'generated .pyi files from .py sources, but had to return a prioritized subset';
    case 'minimal-pyi-full':
      return 'generated absolute-minimal .pyi files and kept the full minimal set';
    case 'minimal-pyi-partial':
      return 'generated absolute-minimal .pyi files, but still had to return a prioritized subset';
    case 'raw-py-full':
      return 'fell back to raw .py files and kept the full raw source surface';
    case 'raw-py-too-large':
      return 'raw .py fallback exceeded the size limit';
    case 'import-single-py':
      return 'resolved a single-file module directly by import';
    case 'site-packages-single-py':
      return 'resolved a single-file module directly from site-packages';
    case 'not-found':
      return 'no matching importable package surface was found';
    case 'empty':
      return 'package files were found, but no usable stub or raw-source payload fit the extraction limits';
    case 'pyodide-not-loaded':
      return 'Pyodide was not loaded, so extraction could not start';
    case 'error':
      return 'stub extraction failed before a usable surface was produced';
    default:
      return phase;
  }
}

function formatPyodideStubCandidateSummary(attempted: boolean, count: number, totalSize: number, skipReason: string) {
  if (!attempted) return skipReason;
  return `${count} file(s), ${formatByteSize(totalSize)}`;
}

function formatPyodideStubFallbackSummary(attempted: boolean, totalSize: number, skipReason: string) {
  if (!attempted) return skipReason;
  return formatByteSize(totalSize);
}

function logPyodideStubExtractionSummary(
  pkgName: string,
  summary: PyodideStubExtractionSummary,
  log: (msg: string) => void
) {
  const resolvedFromNativePyi = summary.phase === 'native-pyi-full';
  const nativeOverflowed = summary.pyiCandidateCount > 0 && summary.pyiTotalSize > summary.stubLimit && !resolvedFromNativePyi;
  const skippedGeneratedReason = resolvedFromNativePyi
    ? 'skipped because native .pyi files were already available'
    : 'not reached';
  const skippedRawReason = summary.generatedPhaseAttempted || resolvedFromNativePyi
    ? 'skipped because a stub surface was already selected'
    : 'not reached';
  const nativeDisposition = summary.pyiCandidateCount === 0
    ? 'no native .pyi files found'
    : resolvedFromNativePyi
      ? 'kept the native .pyi surface'
      : nativeOverflowed
        ? 'discarded the oversized native .pyi surface and continued to generated stubs'
        : 'native .pyi files were found but not selected';
  log(`  Stub extraction package: ${pkgName}`);
  log(`  Stub extraction order: native .pyi -> generated .pyi -> generated .pyi compression -> raw .py`);
  log(`  Names tried: ${summary.namesTried.join(', ') || '(none)'}`);
  log(`  Discovery mode: ${summary.discovery}`);
  log(`  Scan roots (${summary.scanDirCount}): ${summary.scanRoots.join(', ') || '(none)'}`);
  log(`  Size limits: stub cap ${formatByteSize(summary.stubLimit)}, absolute cap ${formatByteSize(summary.maxTotal)}`);
  log(`  Native .pyi candidates: ${summary.pyiCandidateCount} file(s), ${formatByteSize(summary.pyiTotalSize)}`);
  log(`  Native .pyi disposition: ${nativeDisposition}`);
  log(`  Generated .pyi candidates: ${formatPyodideStubCandidateSummary(summary.generatedPhaseAttempted, summary.generatedCandidateCount, summary.generatedTotalSize, skippedGeneratedReason)}`);
  log(`  Generated minimal .pyi candidates: ${formatPyodideStubCandidateSummary(summary.generatedPhaseAttempted, summary.generatedMinimalCandidateCount, summary.generatedMinimalTotalSize, skippedGeneratedReason)}`);
  log(`  Raw .py fallback size: ${formatPyodideStubFallbackSummary(summary.rawPhaseAttempted, summary.pyTotalSize, skippedRawReason)}`);
  log(`  Selected extraction phase: ${summary.phase}`);
  log(`  Outcome: ${describePyodideStubExtractionPhase(summary.phase)}`);
  log(`  Returned payload: ${summary.returnedEntryCount} file(s), ${formatByteSize(summary.returnedTotalSize)}`);
  if (summary.returnedSamplePaths.length > 0) {
    log(`  Returned sample paths: ${summary.returnedSamplePaths.join(', ')}`);
  }
}

function buildSavedPipPackageSignature(pkgs: SavedPipPackage[]) {
  return sortSavedPipPackages(pkgs)
    .map(pkg => `${pkg.name}==${pkg.version}`)
    .join('\n');
}

function ensurePyodideFsDirectory(pyodide: any, dirPath: string) {
  const parts = dirPath.split('/').filter(Boolean);
  let current = '';
  for (const part of parts) {
    current += `/${part}`;
    try {
      pyodide.FS.mkdir(current);
    } catch { }
  }
}

function readPyodideFsTree(pyodide: any, rootPath: string): CachedPyodideSiteFile[] {
  const files: CachedPyodideSiteFile[] = [];

  const visit = (currentPath: string) => {
    let entries: string[] = [];
    try {
      entries = pyodide.FS.readdir(currentPath);
    } catch {
      return;
    }

    for (const entry of entries) {
      if (entry === '.' || entry === '..') continue;
      const fullPath = currentPath === '/' ? `/${entry}` : `${currentPath}/${entry}`;
      let stat: any;
      try {
        stat = pyodide.FS.stat(fullPath);
      } catch {
        continue;
      }

      if (pyodide.FS.isDir(stat.mode)) {
        visit(fullPath);
        continue;
      }
      if (!pyodide.FS.isFile(stat.mode)) continue;

      try {
        const data = pyodide.FS.readFile(fullPath, { encoding: 'binary' });
        const bytes = data instanceof Uint8Array ? new Uint8Array(data) : new Uint8Array(data);
        const relativePath = fullPath.startsWith(`${rootPath}/`)
          ? fullPath.slice(rootPath.length + 1)
          : fullPath.slice(rootPath.length).replace(/^\/+/, '');
        files.push({ relativePath, data: bytes });
      } catch { }
    }
  };

  visit(rootPath);
  return files.sort((a, b) => a.relativePath.localeCompare(b.relativePath));
}

function writePyodideFsTree(pyodide: any, rootPath: string, files: CachedPyodideSiteFile[]) {
  ensurePyodideFsDirectory(pyodide, rootPath);
  for (const file of files) {
    const fullPath = `${rootPath}/${file.relativePath}`.replace(/\/+/g, '/');
    const lastSlash = fullPath.lastIndexOf('/');
    if (lastSlash > 0) {
      ensurePyodideFsDirectory(pyodide, fullPath.slice(0, lastSlash));
    }
    pyodide.FS.writeFile(fullPath, file.data);
  }
}

function loadSavedPipIncludedModules(): string[] {
  try {
    const raw = JSON.parse(localStorage.getItem(STORAGE_KEYS.pipIncludedModules) || '[]');
    return Array.isArray(raw)
      ? [...new Set(
        raw
          .filter((value): value is string => typeof value === 'string')
          .map(value => value.trim())
          .filter(Boolean)
      )].sort((a, b) => a.localeCompare(b))
      : [];
  } catch {
    return [];
  }
}

function savePipIncludedModules(modules: string[]) {
  localStorage.setItem(STORAGE_KEYS.pipIncludedModules, JSON.stringify(
    [...new Set(modules.map(value => value.trim()).filter(Boolean))].sort((a, b) => a.localeCompare(b))
  ));
}

function addSavedPipIncludedModule(moduleName: string) {
  const normalized = moduleName.trim();
  if (!normalized) return;
  const current = loadSavedPipIncludedModules();
  if (!current.includes(normalized)) {
    current.push(normalized);
    savePipIncludedModules(current);
  }
}

function normalizePyiImportSizeLimitModuleName(moduleName: string) {
  return moduleName.trim().toLowerCase();
}

function sortSavedPyiImportSizeLimitOverrides(overrides: SavedPyiImportSizeLimitOverride[]) {
  return [...overrides].sort((a, b) => a.moduleName.localeCompare(b.moduleName));
}

function loadSavedPyiImportSizeLimitOverrides(): SavedPyiImportSizeLimitOverride[] {
  try {
    const raw = JSON.parse(localStorage.getItem(STORAGE_KEYS.pyiImportSizeLimits) || '[]');
    if (!Array.isArray(raw)) return [];

    const deduped = new Map<string, SavedPyiImportSizeLimitOverride>();
    for (const value of raw) {
      if (!value || typeof value.moduleName !== 'string') continue;
      const moduleName = normalizePyiImportSizeLimitModuleName(value.moduleName);
      if (!moduleName) continue;

      const numericMaxBytes = Number(value.maxBytes);
      const maxBytes = value.maxBytes == null
        ? null
        : Number.isFinite(numericMaxBytes) && numericMaxBytes > 0
          ? Math.min(Math.round(numericMaxBytes), ABSOLUTE_PYI_IMPORT_SIZE_LIMIT_BYTES)
          : DEFAULT_PYI_IMPORT_SIZE_LIMIT_BYTES;

      deduped.set(moduleName, { moduleName, maxBytes });
    }

    return sortSavedPyiImportSizeLimitOverrides([...deduped.values()]);
  } catch {
    return [];
  }
}

function saveSavedPyiImportSizeLimitOverrides(overrides: SavedPyiImportSizeLimitOverride[]) {
  localStorage.setItem(
    STORAGE_KEYS.pyiImportSizeLimits,
    JSON.stringify(sortSavedPyiImportSizeLimitOverrides(
      overrides.map(override => ({
        moduleName: normalizePyiImportSizeLimitModuleName(override.moduleName),
        maxBytes: override.maxBytes == null
          ? null
          : Math.min(Math.max(1, Math.round(override.maxBytes)), ABSOLUTE_PYI_IMPORT_SIZE_LIMIT_BYTES),
      })).filter(override => override.moduleName.length > 0)
    ))
  );
}

function getSavedPyiImportSizeLimitOverride(moduleName: string): SavedPyiImportSizeLimitOverride | null {
  const normalized = normalizePyiImportSizeLimitModuleName(moduleName);
  if (!normalized) return null;
  return loadSavedPyiImportSizeLimitOverrides().find(override => override.moduleName === normalized) || null;
}

function resolveSavedPyiImportSizeLimit(moduleName: string): number {
  const override = getSavedPyiImportSizeLimitOverride(moduleName);
  if (!override) return DEFAULT_PYI_IMPORT_SIZE_LIMIT_BYTES;
  if (override.maxBytes == null) return ABSOLUTE_PYI_IMPORT_SIZE_LIMIT_BYTES;
  return Math.min(Math.max(1, override.maxBytes), ABSOLUTE_PYI_IMPORT_SIZE_LIMIT_BYTES);
}

function loadSavedCSharpNamespaces(): string[] {
  try {
    const raw = JSON.parse(localStorage.getItem(STORAGE_KEYS.csharpNamespaces) || '[]');
    return Array.isArray(raw)
      ? raw.filter((value): value is string => typeof value === 'string' && value.trim().length > 0)
      : [];
  } catch {
    return [];
  }
}

function saveCSharpNamespaces(namespaces: string[]) {
  localStorage.setItem(STORAGE_KEYS.csharpNamespaces, JSON.stringify(namespaces));
}

function addSavedCSharpNamespace(namespaceName: string) {
  const normalized = namespaceName.trim();
  if (!normalized) return;
  const current = loadSavedCSharpNamespaces();
  if (!current.includes(normalized)) {
    current.push(normalized);
    current.sort((a, b) => a.localeCompare(b));
    saveCSharpNamespaces(current);
  }
}

const GLOBAL_STYLE_HTML = {
  __html: `
.custom-scrollbar::-webkit-scrollbar { width: 6px; height: 6px; }
.custom-scrollbar::-webkit-scrollbar-track { background: transparent; }
.custom-scrollbar::-webkit-scrollbar-thumb { background: rgba(255,255,255,0.1); border-radius: 10px; }
.custom-scrollbar::-webkit-scrollbar-thumb:hover { background: rgba(255,255,255,0.2); }
textarea { caret-color: white; }
.flexlayout__tabset-selected, .flexlayout__tabset-maximized { background-image: none !important; }
.flexlayout__layout, .flexlayout__tab, .flexlayout__tabset, .flexlayout__tabset_content,
.flexlayout__tabset_tabbar_outer, .flexlayout__tabset_header { background: rgb(28,28,28) !important; }
.flexlayout__tab_button, .flexlayout__tabset_header, .flexlayout__tab_toolbar {
  font-family: system-ui, -apple-system, "Segoe UI", Roboto, "Noto Sans", "Helvetica Neue", sans-serif !important;
  font-weight: 400 !important;
}
` };

// Types
interface FSItem {
  id: string;
  name: string;
  type: 'file' | 'folder';
  language?: string;
  content?: string;
  parentId: string | null;
  isOpen?: boolean;
}

interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
  kind?: AssistantMessageKind;
}

interface AssistantChat {
  id: string;
  name: string;
  messages: ChatMessage[];
}

type AssistantTokenEstimateSource = 'model' | 'approximation';
type AssistantTurnUsageSource = 'model' | 'mixed' | 'approximation';

interface AssistantTokenEstimate {
  status: 'loading' | 'ready' | 'error';
  promptTokenCount: number | null;
  estimatedOutputTokenCount: number;
  estimatedTotalTokenCount: number | null;
  estimatedPaidCostUsd: number | null;
  source: AssistantTokenEstimateSource;
  error?: string;
  updatedAt: number;
}

interface AssistantTurnUsage {
  promptTokenCount: number;
  toolUsePromptTokenCount: number;
  inputTokenCount: number;
  candidateTokenCount: number;
  thoughtsTokenCount: number;
  outputTokenCount: number;
  totalTokenCount: number;
  paidCostUsd: number | null;
  passCount: number;
  source: AssistantTurnUsageSource;
  updatedAt: number;
}

interface PendingEdit {
  fileId: string;
  originalContent: string;
  proposedContent: string;
}

interface AssistantToolExecutionResult {
  summary: string;
  detail: string;
  result?: unknown;
}

interface ResolvedProjectRun {
  mode: ProjectRunMode;
  language: ProjectRuntimeLanguage | null;
  selectedFiles: FSItem[];
  entryFile: FSItem | null;
  error: string | null;
}

interface ProjectSourceFile {
  id: string;
  name: string;
  path: string;
  content: string;
  language: ProjectRuntimeLanguage;
}

type JavaScriptExecutionMode = 'classic-function' | 'async-function';
type RuntimeIOMode = 'alert-output' | 'interactive-output-panel';
type PythonRuntimeLifecycle = 'dispose-after-run' | 'keep-warm';
type CSharpExecutionMode = 'regular' | 'script' | 'script-context';
type RuntimeInteractionKind = 'alert' | 'confirm' | 'prompt' | 'stdin';
type RuntimeInteractionLanguage = 'javascript' | 'python' | 'csharp';
type ProjectRuntimeLanguage = 'javascript' | 'python' | 'html' | 'csharp';
type ProjectRunMode = 'csharp-only' | 'python-only' | 'html-only' | 'javascript-only' | 'custom';

interface OutputPanelInteraction {
  id: number;
  kind: RuntimeInteractionKind;
  language: RuntimeInteractionLanguage;
  message: string;
  defaultValue: string;
  transcriptPrompt?: string;
  transcriptPromptSequence?: string[];
  inputMode?: 'single-line' | 'buffered-lines';
  expectedLineCount?: number | null;
  placeholder?: string;
  submitLabel?: string;
  cancelLabel?: string;
}

interface AppSettings {
  clearOutputOnRun: boolean;
  showExecutionDivisor: boolean;
  fontSize: number;
  autoSave: boolean;
  javascriptExecutionTimeoutMs: number;
  javascriptExecutionMode: JavaScriptExecutionMode;
  javascriptIOMode: RuntimeIOMode;
  pythonExecutionTimeoutMs: number;
  pythonRuntimeLifecycle: PythonRuntimeLifecycle;
  pythonIOMode: RuntimeIOMode;
  csharpExecutionTimeoutMs: number;
  csharpExecutionMode: CSharpExecutionMode;
  csharpResetScriptContextBeforeRun: boolean;
  csharpIOMode: RuntimeIOMode;
  projectRunMode: ProjectRunMode;
  projectRunCustomFileIds: string[];
  projectRunEntryFileId: string | null;
  assistantProvider: AssistantProvider;
  assistantModel: string;
  assistantApiKey: string;
  assistantOAuthSession: CodexCliOAuthSession;
  codexCliMcpServers: CodexCliMcpServer[];
  codexCliReasoningEffort: CodexCliReasoningEffort;
  codexCliResponsesEndpoint: string;
  assistantUseChainOfThought: boolean;
  assistantShowUsagePopup: boolean;
  assistantMaxChainOfThoughtDepth: number;
}

const loadSavedAssistantChats = (): AssistantChat[] => {
  const saved = localStorage.getItem(STORAGE_KEYS.assistantChats);
  if (!saved) return [{ id: INITIAL_ASSISTANT_CHAT_ID, name: DEFAULT_ASSISTANT_CHAT_NAME, messages: [] }];
  try {
    const parsed = JSON.parse(saved);
    if (!Array.isArray(parsed)) return [{ id: INITIAL_ASSISTANT_CHAT_ID, name: DEFAULT_ASSISTANT_CHAT_NAME, messages: [] }];
    const chats = parsed.filter((chat: any) => (
      chat
      && typeof chat.id === 'string'
      && typeof chat.name === 'string'
      && Array.isArray(chat.messages)
    )).map((chat: any) => ({
      id: chat.id,
      name: chat.name,
      messages: chat.messages.filter((message: any) => (
        message
        && (message.role === 'user' || message.role === 'assistant')
        && typeof message.content === 'string'
        && (message.kind === undefined || message.kind === 'message' || message.kind === 'log')
      )).map((message: any) => ({
        role: message.role,
        content: message.content,
        ...(message.kind === 'log' ? { kind: 'log' as const } : {}),
      })),
    }));
    return chats.length > 0 ? chats : [{ id: INITIAL_ASSISTANT_CHAT_ID, name: DEFAULT_ASSISTANT_CHAT_NAME, messages: [] }];
  } catch {
    return [{ id: INITIAL_ASSISTANT_CHAT_ID, name: DEFAULT_ASSISTANT_CHAT_NAME, messages: [] }];
  }
};

const loadSavedLayout = (): IJsonModel => {
  const saved = localStorage.getItem(STORAGE_KEYS.layout);
  if (!saved) return INITIAL_LAYOUT;
  try {
    const parsed = JSON.parse(saved);
    if (parsed && parsed.layout) return parsed as IJsonModel;
    return INITIAL_LAYOUT;
  } catch {
    return INITIAL_LAYOUT;
  }
};

const DEFAULT_SETTINGS: AppSettings = {
  clearOutputOnRun: true,
  showExecutionDivisor: true,
  fontSize: 14,
  autoSave: true,
  javascriptExecutionTimeoutMs: 0,
  javascriptExecutionMode: 'classic-function',
  javascriptIOMode: 'alert-output',
  pythonExecutionTimeoutMs: 0,
  pythonRuntimeLifecycle: 'dispose-after-run',
  pythonIOMode: 'alert-output',
  csharpExecutionTimeoutMs: 0,
  csharpExecutionMode: 'regular',
  csharpResetScriptContextBeforeRun: false,
  csharpIOMode: 'alert-output',
  projectRunMode: 'custom',
  projectRunCustomFileIds: [],
  projectRunEntryFileId: null,
  assistantProvider: 'codex-cli',
  assistantModel: getAssistantDefaultModel('codex-cli'),
  assistantApiKey: '',
  assistantOAuthSession: DEFAULT_CODEX_CLI_OAUTH_SESSION,
  codexCliMcpServers: [],
  codexCliReasoningEffort: 'medium',
  codexCliResponsesEndpoint: CODEX_CLI_RESPONSES_ENDPOINT,
  assistantUseChainOfThought: false,
  assistantShowUsagePopup: true,
  assistantMaxChainOfThoughtDepth: DEFAULT_ASSISTANT_TOOL_PASSES,
};

const PROJECT_RUN_MODE_OPTIONS: { value: ProjectRunMode; label: string; language: ProjectRuntimeLanguage | null }[] = [
  { value: 'csharp-only', label: 'C# only', language: 'csharp' },
  { value: 'python-only', label: 'Python only', language: 'python' },
  { value: 'html-only', label: 'HTML only', language: 'html' },
  { value: 'javascript-only', label: 'JS only', language: 'javascript' },
  { value: 'custom', label: 'Custom', language: null },
];

function normalizeProjectRuntimeLanguage(language?: string): ProjectRuntimeLanguage | null {
  switch ((language || '').toLowerCase()) {
    case 'javascript':
    case 'js':
      return 'javascript';
    case 'python':
    case 'py':
      return 'python';
    case 'html':
      return 'html';
    case 'csharp':
    case 'cs':
      return 'csharp';
    default:
      return null;
  }
}

function getProjectRuntimeLanguageLabel(language: ProjectRuntimeLanguage | null) {
  switch (language) {
    case 'javascript':
      return 'JavaScript';
    case 'python':
      return 'Python';
    case 'html':
      return 'HTML';
    case 'csharp':
      return 'C#';
    default:
      return 'Unknown';
  }
}

function getProjectRunModeLanguage(mode: ProjectRunMode): ProjectRuntimeLanguage | null {
  return PROJECT_RUN_MODE_OPTIONS.find(option => option.value === mode)?.language ?? null;
}

function normalizeProjectPath(path: string): string {
  const normalized = path.replace(/\\/g, '/');
  const parts = normalized.split('/');
  const resolved: string[] = [];
  for (const rawPart of parts) {
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

function dirnameProjectPath(path: string): string {
  const normalized = normalizeProjectPath(path);
  const index = normalized.lastIndexOf('/');
  return index >= 0 ? normalized.slice(0, index) : '';
}

function resolveProjectRelativePath(fromPath: string, specifier: string): string {
  const normalizedSpecifier = specifier.replace(/\\/g, '/').trim();
  if (!normalizedSpecifier) {
    return '';
  }
  if (normalizedSpecifier.startsWith('/')) {
    return normalizeProjectPath(normalizedSpecifier.slice(1));
  }
  if (normalizedSpecifier.startsWith('./') || normalizedSpecifier.startsWith('../')) {
    const baseDir = dirnameProjectPath(fromPath);
    return normalizeProjectPath(baseDir ? `${baseDir}/${normalizedSpecifier}` : normalizedSpecifier);
  }
  return normalizeProjectPath(normalizedSpecifier);
}

function escapeHtml(value: string) {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function extractJavaScriptModuleSpecifiers(source: string): string[] {
  const matches = new Set<string>();
  const patterns = [
    /\bimport\s+[\s\S]*?\sfrom\s*(['"])([^'"]+)\1/g,
    /\bexport\s+[\s\S]*?\sfrom\s*(['"])([^'"]+)\1/g,
    /\bimport\s*\(\s*(['"])([^'"]+)\1\s*\)/g,
  ];

  for (const pattern of patterns) {
    for (const match of source.matchAll(pattern)) {
      const specifier = (match[2] || '').trim();
      if (specifier) {
        matches.add(specifier);
      }
    }
  }

  return [...matches];
}

function normalizeExecutionTimeoutMs(value: number) {
  if (!Number.isFinite(value)) return 0;
  return Math.max(0, Math.floor(value));
}

function normalizeAssistantMaxChainOfThoughtDepth(value: number) {
  if (!Number.isFinite(value)) return DEFAULT_ASSISTANT_TOOL_PASSES;
  return Math.min(12, Math.max(1, Math.floor(value)));
}

function estimateFallbackTokenCount(text: string) {
  if (!text) return 0;
  return Math.max(1, Math.ceil(text.length / 4));
}

function formatAssistantTokenCount(value: number | null | undefined) {
  if (value == null || !Number.isFinite(value)) return '—';
  return new Intl.NumberFormat().format(Math.max(0, Math.round(value)));
}

function formatAssistantCostUsd(value: number | null | undefined) {
  if (value == null || !Number.isFinite(value)) return '—';
  if (value === 0) return '$0.0000';
  if (value < 0.001) return `$${value.toFixed(6)}`;
  if (value < 0.01) return `$${value.toFixed(5)}`;
  return `$${value.toFixed(4)}`;
}

function getAssistantErrorMessage(error: unknown) {
  if (error instanceof Error && error.message.trim()) {
    return error.message.trim();
  }
  if (typeof error === 'string' && error.trim()) {
    return error.trim();
  }
  return 'Unknown error';
}

function formatExecutionTimeoutLabel(timeoutMs: number) {
  if (timeoutMs <= 0) return 'Disabled';
  if (timeoutMs < 1000) return `${timeoutMs} ms`;
  if (timeoutMs % 1000 === 0) return `${timeoutMs / 1000}s`;
  return `${(timeoutMs / 1000).toFixed(1)}s`;
}

function createExecutionTimeoutError(label: string, timeoutMs: number) {
  return new Error(`${label} timed out after ${formatExecutionTimeoutLabel(timeoutMs)}.`);
}

const PYODIDE_TIMEOUT_ERROR_MARKER = '__CODECRAFT_PYTHON_TIMEOUT__';

const INITIAL_FILES: FSItem[] = [
  {
    id: 'root',
    name: 'src',
    type: 'folder',
    parentId: null,
    isOpen: true
  },
  {
    id: '1',
    name: 'index.html',
    type: 'file',
    language: 'html',
    parentId: 'root',
    content: '<!DOCTYPE html>\n<html>\n<head>\n  <style>\n    body { \n      background: #0f172a; \n      color: white; \n      font-family: system-ui, -apple-system, sans-serif; \n      display: flex; \n      flex-direction: column;\n      justify-content: center; \n      align-items: center; \n      height: 100vh; \n      margin: 0; \n    }\n    .card {\n      background: rgba(255, 255, 255, 0.05);\n      backdrop-filter: blur(10px);\n      border: 1px solid rgba(255, 255, 255, 0.1);\n      padding: 2rem;\n      border-radius: 1rem;\n      box-shadow: 0 25px 50px -12px rgba(0, 0, 0, 0.5);\n    }\n    h1 { color: #818cf8; margin: 0; font-size: 3rem; }\n    p { color: #94a3b8; margin-top: 1rem; }\n  </style>\n</head>\n<body>\n  <div class="card">\n    <h1>CodeCraft IDE</h1>\n    <p>Now powered by Monaco Editor</p>\n  </div>\n</body>\n</html>'
  },
  {
    id: '2',
    name: 'main.js',
    type: 'file',
    language: 'javascript',
    parentId: 'root',
    content: '// Welcome to CodeCraft IDE\n// Now with native browser execution!\n\nconsole.log("Hello, World!");\n\nfunction greet(name) {\n  return `Hello, ${name}!`;\n}\n\nconst user = "Developer";\nconsole.log(greet(user));\n\n// Try some modern JS features\nconst items = [1, 2, 3, 4, 5];\nconst doubled = items.map(n => n * 2);\nconsole.log("Doubled items:", doubled);'
  },
  {
    id: '3',
    name: 'script.py',
    type: 'file',
    language: 'python',
    parentId: 'root',
    content: '# Python running in your browser via Pyodide!\nimport sys\n\nprint("Hello from Python " + sys.version)\n\ndef fib(n):\n    if n <= 1: return n\n    return fib(n-1) + fib(n-2)\n\nprint("Fibonacci(10):", fib(10))\n\n# You can even use standard libraries\nimport math\nprint("Square root of 144 is:", math.sqrt(144))'
  }
];

interface FileTreeContextValue {
  files: FSItem[];
  activeFileId: string;
  pendingNewItem: FSItem | null;
  renamingId: string | null;
  renamingName: string;
  draggedItemId: string | null;
  openEditorTab: (id: string) => void;
  toggleFolder: (id: string) => void;
  setDraggedItemId: (id: string | null) => void;
  handleDrop: (targetId: string | null) => void;
  addNewItem: (type: 'file' | 'folder', parentId: string | null, mode?: 'modal' | 'inline') => void;
  deleteItem: (id: string) => void;
  confirmRename: () => void;
  setRenamingId: (id: string | null) => void;
  setRenamingName: (name: string) => void;
  setPendingNewItem: (item: FSItem | null) => void;
}

const FileTreeContext = createContext<FileTreeContextValue>(null!);

const FileTreeItem = React.memo(({ item, depth = 0 }: { item: FSItem; depth?: number }) => {
  const ctx = useContext(FileTreeContext);
  const realChildren = ctx.files.filter(f => f.parentId === item.id);
  const children = ctx.pendingNewItem && ctx.pendingNewItem.parentId === item.id
    ? [...realChildren, ctx.pendingNewItem]
    : realChildren;
  const isActive = ctx.activeFileId === item.id;
  const isRenaming = ctx.renamingId === item.id;

  return (
    <div className="flex flex-col">
      <div
        draggable={!isRenaming}
        onDragStart={(e) => {
          if (isRenaming) {
            e.preventDefault();
            return;
          }
          setTimeout(() => ctx.setDraggedItemId(item.id), 0);
          e.dataTransfer.setData('text/plain', item.id);
        }}
        onDragOver={(e) => {
          e.stopPropagation();
          e.preventDefault();
          if (item.type === 'folder') e.currentTarget.classList.add('bg-white/10');
        }}
        onDragLeave={(e) => {
          e.preventDefault();
          e.stopPropagation();
          e.currentTarget.classList.remove('bg-white/10');
        }}
        onDrop={(e) => {
          e.preventDefault();
          e.stopPropagation();
          e.currentTarget.classList.remove('bg-white/10');
          ctx.handleDrop(item.type === 'folder' ? item.id : item.parentId);
        }}
        onPointerDown={(e) => {
          if (e.button !== 0) return;
          if (isRenaming) return;
          if (item.type === 'folder') ctx.toggleFolder(item.id);
          ctx.openEditorTab(item.id);
        }}
        className={cn(
          "group flex items-center justify-between px-4 py-2 cursor-pointer transition-all border-l-2 relative",
          isActive ? "bg-indigo-600/20 border-indigo-500 text-white" : "border-transparent text-zinc-400 hover:bg-white/5",
          ctx.draggedItemId === item.id && "opacity-0",
          isRenaming && "bg-indigo-600/10"
        )}
        style={{ paddingLeft: `${depth * 1.5 + 1}rem` }}
      >
        <div className="flex items-center gap-2 overflow-hidden flex-1 pointer-events-none">
          {item.type === 'folder' ? (
            <>
              {item.isOpen ? <ChevronDown size={14} className="shrink-0 pointer-events-none" /> : <ChevronRight size={14} className="shrink-0 pointer-events-none" />}
              <Folder size={16} className={cn("shrink-0 pointer-events-none", isActive ? "text-indigo-400" : "text-amber-400")} />
            </>
          ) : (
            <>
              <div className="w-3.5 shrink-0 pointer-events-none" />
              <FileCode size={16} className={cn("shrink-0 pointer-events-none", isActive ? "text-indigo-400" : "text-zinc-500")} />
            </>
          )}
          {isRenaming ? (
            <input
              autoFocus
              type="text"
              value={ctx.renamingName}
              onChange={(e) => ctx.setRenamingName(e.target.value)}
              onBlur={ctx.confirmRename}
              onKeyDown={(e) => {
                if (e.key === 'Enter') ctx.confirmRename();
                if (e.key === 'Escape') {
                  ctx.setRenamingId(null);
                  ctx.setRenamingName('');
                  if (ctx.pendingNewItem && ctx.pendingNewItem.id === item.id) ctx.setPendingNewItem(null);
                }
              }}
              className="bg-white/10 border border-indigo-500/50 rounded px-1 py-0.5 text-sm text-white focus:outline-none w-full pointer-events-auto"
              onClick={(e) => e.stopPropagation()}
            />
          ) : (
            <span className="truncate text-sm pointer-events-auto select-none pl-1 w-full h-full block">{item.name}</span>
          )}
        </div>
        {!isRenaming && (
          <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-all shrink-0" onPointerDown={(e) => e.stopPropagation()}>
            {item.type === 'folder' && (
              <>
                <button
                  onClick={(e) => { e.stopPropagation(); ctx.addNewItem('file', item.id, 'inline'); }}
                  className="p-1 hover:text-indigo-400 transition-colors"
                  title="New File in Folder"
                >
                  <FilePlus size={14} />
                </button>
                <button
                  onClick={(e) => { e.stopPropagation(); ctx.addNewItem('folder', item.id, 'inline'); }}
                  className="p-1 hover:text-amber-400 transition-colors"
                  title="New Folder in Folder"
                >
                  <FolderPlus size={14} />
                </button>
              </>
            )}
            <button
              onClick={(e) => { e.stopPropagation(); ctx.deleteItem(item.id); }}
              className="p-1 hover:text-red-400 transition-colors"
              title="Delete"
            >
              <Trash2 size={14} />
            </button>
          </div>
        )}
      </div>
      {item.type === 'folder' && item.isOpen && (
        <div className="flex flex-col">
          {children.map(child => (
            <FileTreeItem key={child.id} item={child} depth={depth + 1} />
          ))}
        </div>
      )}
    </div>
  );
});

export default function App() {
  const [files, setFiles] = useState<FSItem[]>(() => {
    const saved = localStorage.getItem(STORAGE_KEYS.files);
    if (!saved) return INITIAL_FILES;
    const parsed: FSItem[] = JSON.parse(saved);
    return parsed.map(f => f.type === 'file' && f.name ? { ...f, language: langFromFilename(f.name) } : f);
  });
  const [activeFileId, setActiveFileId] = useState<string>('');
  const [output, setOutput] = useState<string>('Click "Run" or "Project Run" to see output...');
  const [executionStartupStatus, setExecutionStartupStatus] = useState('');
  const [outputInteraction, setOutputInteraction] = useState<OutputPanelInteraction | null>(null);
  const [outputInteractionInput, setOutputInteractionInput] = useState('');
  const [outputInteractionBufferedLines, setOutputInteractionBufferedLines] = useState<string[]>([]);
  const [terminalOutput, setTerminalOutput] = useState<string[]>([
    'Welcome to CodeCraft Terminal v2.0',
    'Type "help" for a list of commands.'
  ]);
  const [terminalInput, setTerminalInput] = useState('');
  const [terminalCwd, setTerminalCwd] = useState<string | null>(null); // null is root
  const [isRunning, setIsRunning] = useState(false);
  const [assistantChats, setAssistantChats] = useState<AssistantChat[]>(() => loadSavedAssistantChats());
  const [assistantInputs, setAssistantInputs] = useState<Record<string, string>>({
    [INITIAL_ASSISTANT_CHAT_ID]: ''
  });
  const [assistantTokenEstimates, setAssistantTokenEstimates] = useState<Record<string, AssistantTokenEstimate>>({});
  const [assistantTurnUsageByChatId, setAssistantTurnUsageByChatId] = useState<Record<string, AssistantTurnUsage>>({});
  const [loadingAssistantChatId, setLoadingAssistantChatId] = useState<string | null>(null);
  const [assistantHistoryOpenByChatId, setAssistantHistoryOpenByChatId] = useState<Record<string, boolean>>({});
  const [outputPreviewHtml, setOutputPreviewHtml] = useState<string | null>(null);
  const [pendingEdits, setPendingEdits] = useState<PendingEdit[]>([]);
  const [draggedItemId, setDraggedItemId] = useState<string | null>(null);
  const [layoutModel, setLayoutModel] = useState(() => Model.fromJson(loadSavedLayout()));
  const [namingState, setNamingState] = useState<{ type: 'file' | 'folder', parentId: string | null } | null>(null);
  const [namingName, setNamingName] = useState('');
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [renamingName, setRenamingName] = useState('');
  const [pendingNewItem, setPendingNewItem] = useState<FSItem | null>(null);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [settings, setSettings] = useState<AppSettings>(() => {
    const saved = localStorage.getItem(STORAGE_KEYS.settings);
    if (!saved) return DEFAULT_SETTINGS;
    const parsed = JSON.parse(saved);
    const merged = { ...DEFAULT_SETTINGS, ...parsed };
    const assistantProvider = isAssistantProvider(merged.assistantProvider)
      ? merged.assistantProvider
      : DEFAULT_SETTINGS.assistantProvider;
    const assistantModel = typeof merged.assistantModel === 'string' && merged.assistantModel.trim()
      ? merged.assistantModel.trim()
      : getAssistantDefaultModel(assistantProvider);
    return {
      ...merged,
      javascriptExecutionTimeoutMs: normalizeExecutionTimeoutMs(merged.javascriptExecutionTimeoutMs),
      pythonExecutionTimeoutMs: normalizeExecutionTimeoutMs(merged.pythonExecutionTimeoutMs),
      csharpExecutionTimeoutMs: normalizeExecutionTimeoutMs(merged.csharpExecutionTimeoutMs),
      projectRunMode: PROJECT_RUN_MODE_OPTIONS.some(option => option.value === merged.projectRunMode)
        ? merged.projectRunMode
        : DEFAULT_SETTINGS.projectRunMode,
      projectRunCustomFileIds: Array.isArray(merged.projectRunCustomFileIds)
        ? merged.projectRunCustomFileIds.filter((value: unknown): value is string => typeof value === 'string')
        : [],
      projectRunEntryFileId: typeof merged.projectRunEntryFileId === 'string' ? merged.projectRunEntryFileId : null,
      assistantProvider,
      assistantModel,
      assistantApiKey: typeof merged.assistantApiKey === 'string' ? merged.assistantApiKey : '',
      assistantOAuthSession: normalizeCodexCliOAuthSession(merged.assistantOAuthSession),
      codexCliMcpServers: normalizeCodexCliMcpServers(merged.codexCliMcpServers),
      codexCliReasoningEffort: normalizeCodexCliReasoningEffort(merged.codexCliReasoningEffort),
      codexCliResponsesEndpoint: typeof merged.codexCliResponsesEndpoint === 'string' && merged.codexCliResponsesEndpoint.trim()
        ? merged.codexCliResponsesEndpoint.trim()
        : CODEX_CLI_RESPONSES_ENDPOINT,
      assistantUseChainOfThought: !!merged.assistantUseChainOfThought,
      assistantShowUsagePopup: merged.assistantShowUsagePopup !== false,
      assistantMaxChainOfThoughtDepth: normalizeAssistantMaxChainOfThoughtDepth(
        typeof merged.assistantMaxChainOfThoughtDepth === 'number'
          ? merged.assistantMaxChainOfThoughtDepth
          : DEFAULT_SETTINGS.assistantMaxChainOfThoughtDepth
      ),
    };
  });
  const [settingsPipPackages, setSettingsPipPackages] = useState<SavedPipPackage[]>(() => loadSavedPipPackages());
  const [settingsPipIncludedModules, setSettingsPipIncludedModules] = useState<string[]>(() => loadSavedPipIncludedModules());
  const [settingsPyiImportSizeLimitOverrides, setSettingsPyiImportSizeLimitOverrides] = useState<SavedPyiImportSizeLimitOverride[]>(() => loadSavedPyiImportSizeLimitOverrides());
  const [settingsCSharpNamespaces, setSettingsCSharpNamespaces] = useState<string[]>(() => loadSavedCSharpNamespaces());
  const [settingsPipInput, setSettingsPipInput] = useState('');
  const [settingsPipForceBuild, setSettingsPipForceBuild] = useState(false);
  const [settingsPipBusy, setSettingsPipBusy] = useState(false);
  const [settingsPipStatus, setSettingsPipStatus] = useState('');
  const [settingsPipIncludeInput, setSettingsPipIncludeInput] = useState('');
  const [settingsPipIncludeBusy, setSettingsPipIncludeBusy] = useState(false);
  const [settingsPipIncludeStatus, setSettingsPipIncludeStatus] = useState('');
  const [settingsPyiImportSizeLimitModuleInput, setSettingsPyiImportSizeLimitModuleInput] = useState('');
  const [settingsPyiImportSizeLimitInput, setSettingsPyiImportSizeLimitInput] = useState('200');
  const [settingsPyiImportSizeUnlimited, setSettingsPyiImportSizeUnlimited] = useState(false);
  const [settingsPyiImportSizeLimitStatus, setSettingsPyiImportSizeLimitStatus] = useState('');
  const [settingsCSharpNamespaceInput, setSettingsCSharpNamespaceInput] = useState('');
  const [settingsCSharpNamespaceBusy, setSettingsCSharpNamespaceBusy] = useState(false);
  const [settingsCSharpNamespaceStatus, setSettingsCSharpNamespaceStatus] = useState('');
  const [syncMeta, setSyncMeta] = useState<SyncMeta[]>(loadSyncMeta);
  const pendingEdit = pendingEdits[0] ?? null;
  const editorRef = useRef<any>(null);
  const pythonDiagnosticsEditorRef = useRef<any>(null);
  const csharpDiagnosticsEditorRef = useRef<any>(null);
  const pyrightModuleRef = useRef<PyrightModule | null>(null);
  const csharpAuthoringModuleRef = useRef<CSharpAuthoringModule | null>(null);
  const browserCSharpModuleRef = useRef<BrowserCSharpModule | null>(null);
  const [activeEditorTabId, setActiveEditorTabId] = useState<string | null>(null);
  const [mountedSharedEditorTarget, setMountedSharedEditorTarget] = useState<SharedEditorTarget | null>(null);
  const outputContainerRef = useRef<HTMLDivElement>(null);
  const outputInteractionInputRef = useRef<HTMLInputElement>(null);
  const terminalContainerRef = useRef<HTMLDivElement>(null);
  const outputInteractionResolverRef = useRef<((value: string | boolean | null | undefined) => void) | null>(null);
  const outputInteractionIdRef = useRef(0);
  const outputPreviewUrlsRef = useRef<string[]>([]);
  const assistantEstimateRequestIdRef = useRef(0);
  const codexLoginCallbackHandledRef = useRef(false);
  const terminalOutputRef = useRef(terminalOutput);
  terminalOutputRef.current = terminalOutput;
  const terminalCwdRef = useRef<string | null>(terminalCwd);
  terminalCwdRef.current = terminalCwd;
  const csharpRuntimeReadyRef = useRef<Promise<void> | null>(null);
  const skipEditorSyncRef = useRef(false);
  const pendingSharedEditorTargetRef = useRef<{ tabId: string; itemId: string } | null>(null);
  const sharedEditorVersionRef = useRef(0);
  const pyodideEnsurePromiseRef = useRef<Promise<void> | null>(null);
  const persistedPyodidePackageMetaLoadPromiseRef = useRef<Promise<void> | null>(null);
  const persistedPyodidePackageMetaLoadedRef = useRef(false);
  const persistedPyodidePackageSnapshotLoadPromiseRef = useRef<Promise<void> | null>(null);
  const filesRef = useRef(files);
  filesRef.current = files;
  const syncHandlesRef = useRef<Map<string, FileSystemDirectoryHandle>>(new Map());
  const syncLocksRef = useRef<Map<string, Promise<void>>>(new Map());
  const syncInitializedRef = useRef<Set<string>>(new Set());
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [activeSyncIds, setActiveSyncIds] = useState<Set<string>>(new Set());
  const persistedPipIncludesRestoredRef = useRef(false);
  const persistedCSharpNamespacesRestoredRef = useRef(false);
  const persistedPythonPackageStubsRestoredRef = useRef(false);

  const activeItem = files.find(f => f.id === activeFileId);
  const assistantReasoningControl = getAssistantReasoningControl(settings.assistantProvider, settings.assistantModel);
  const effectiveAssistantUseChainOfThought =
    assistantReasoningControl === 'always_on'
      ? true
      : assistantReasoningControl === 'toggleable'
        ? settings.assistantUseChainOfThought
        : false;
  const effectiveAssistantMaxChainOfThoughtDepth = normalizeAssistantMaxChainOfThoughtDepth(settings.assistantMaxChainOfThoughtDepth);
  const assistantConfiguredApiKey = settings.assistantApiKey.trim();
  const assistantConfiguredOAuth =
    settings.assistantOAuthSession?.status === 'connected'
    && !!settings.assistantOAuthSession.accessToken;
  const assistantAuthReady = settings.assistantProvider === 'codex-cli'
    ? assistantConfiguredOAuth
    : !!assistantConfiguredApiKey;
  const codexCliRuntimeState: CodexCliRuntimeState = {
    oauth: settings.assistantOAuthSession,
    mcpServers: settings.codexCliMcpServers,
    reasoningEffort: settings.codexCliReasoningEffort,
    responsesEndpoint: settings.codexCliResponsesEndpoint || CODEX_CLI_RESPONSES_ENDPOINT,
  };
  const activeEditorTabNode: any = activeEditorTabId ? layoutModel.getNodeById(activeEditorTabId) : null;
  const activeEditorTabItemId =
    activeEditorTabNode?.getComponent?.() === 'editor'
    && typeof activeEditorTabNode?.getConfig?.()?.itemId === 'string'
      ? activeEditorTabNode.getConfig().itemId
      : null;
  const activeEditorTabItem = activeEditorTabItemId ? files.find(f => f.id === activeEditorTabItemId) : null;

  const createSharedEditorTarget = useCallback((tabId: string, itemId: string): SharedEditorTarget => {
    sharedEditorVersionRef.current += 1;
    return {
      tabId,
      itemId,
      version: sharedEditorVersionRef.current,
    };
  }, []);

  const getPyrightModule = useCallback(async () => {
    if (!pyrightModuleRef.current) {
      pyrightModuleRef.current = await loadPyrightModule();
    }
    return pyrightModuleRef.current;
  }, []);

  const getCSharpAuthoringModule = useCallback(async () => {
    if (!csharpAuthoringModuleRef.current) {
      csharpAuthoringModuleRef.current = await loadCSharpAuthoringModule();
    }
    return csharpAuthoringModuleRef.current;
  }, []);

  const getBrowserCSharpModule = useCallback(async () => {
    if (!browserCSharpModuleRef.current) {
      browserCSharpModuleRef.current = await loadBrowserCSharpModule();
    }
    return browserCSharpModuleRef.current;
  }, []);

  const clearPyrightEditorBinding = useCallback(() => {
    const provider = pyrightModuleRef.current?.pyrightProvider;
    if (!provider) return;
    provider.editorChangeListener?.dispose();
    provider.editorChangeListener = undefined as any;
  }, []);

  const clearCSharpEditorBinding = useCallback(() => {
    csharpAuthoringModuleRef.current?.csharpService.clearEditor();
  }, []);

  const resetSharedEditorOptions = useCallback((editor: any) => {
    editor.updateOptions(buildSharedEditorOptions(settings.fontSize));
    editor.getModel?.()?.updateOptions?.({
      tabSize: 2,
      indentSize: 2,
      insertSpaces: true,
      trimAutoWhitespace: true,
      bracketColorizationOptions: {
        enabled: false,
        independentColorPoolPerBracketType: false,
      },
    });
  }, [settings.fontSize]);

  const buildMergedCachedPythonPackageStubs = useCallback(() => {
    const nextStubContributions: Record<string, UserFolder> = {};
    let mergedStubs: UserFolder = {};

    for (const pkg of loadSavedPipPackages()) {
      const normalized = normalizeSavedPipPackageName(pkg.name);
      const cachedMeta = pyodideCachedPackageMetaRef.current[normalized];
      if (!cachedMeta || !hasUserFolderEntries(cachedMeta.stubs)) continue;

      const clonedStubs = cloneUserFolder(cachedMeta.stubs);
      nextStubContributions[normalized] = clonedStubs;
      mergedStubs = { ...mergedStubs, ...clonedStubs };
    }

    return { nextStubContributions, mergedStubs };
  }, []);

  const ensurePersistedPyodidePackageMetaLoaded = useCallback(async () => {
    if (persistedPyodidePackageMetaLoadedRef.current) return;
    if (persistedPyodidePackageMetaLoadPromiseRef.current) {
      await persistedPyodidePackageMetaLoadPromiseRef.current;
      return;
    }

    const loadPromise = (async () => {
      try {
        const persistedCache = await loadPersistedPyodidePackageMetaCache();
        if (Object.keys(persistedCache).length > 0) {
          pyodideCachedPackageMetaRef.current = {
            ...persistedCache,
            ...pyodideCachedPackageMetaRef.current,
          };
        }
      } catch (error) {
        console.warn('Failed to load persisted Python package language-support cache:', error);
      } finally {
        persistedPyodidePackageMetaLoadedRef.current = true;
      }
    })();

    persistedPyodidePackageMetaLoadPromiseRef.current = loadPromise;
    try {
      await loadPromise;
    } finally {
      if (persistedPyodidePackageMetaLoadPromiseRef.current === loadPromise) {
        persistedPyodidePackageMetaLoadPromiseRef.current = null;
      }
    }
  }, []);

  const ensurePersistedPyodidePackageSnapshotLoaded = useCallback(async (savedPkgs: SavedPipPackage[]) => {
    if (savedPkgs.length === 0) {
      pyodidePackageSnapshotRef.current = null;
      return;
    }

    const signature = buildSavedPipPackageSignature(savedPkgs);
    if (pyodidePackageSnapshotRef.current?.signature === signature) {
      return;
    }
    if (persistedPyodidePackageSnapshotLoadPromiseRef.current) {
      await persistedPyodidePackageSnapshotLoadPromiseRef.current;
      return;
    }

    const loadPromise = (async () => {
      try {
        const persistedSnapshot = await loadPersistedPyodidePackageSnapshot();
        if (persistedSnapshot?.signature === signature) {
          pyodidePackageSnapshotRef.current = persistedSnapshot;
        }
      } catch (error) {
        console.warn('Failed to load persisted Pyodide package snapshot:', error);
      }
    })();

    persistedPyodidePackageSnapshotLoadPromiseRef.current = loadPromise;
    try {
      await loadPromise;
    } finally {
      if (persistedPyodidePackageSnapshotLoadPromiseRef.current === loadPromise) {
        persistedPyodidePackageSnapshotLoadPromiseRef.current = null;
      }
    }
  }, []);

  const ensurePythonAuthoringReady = useCallback(async () => {
    await ensurePersistedPyodidePackageMetaLoaded();

    const initialCachedStubs = buildMergedCachedPythonPackageStubs();

    const pyright = await getPyrightModule();
    pyright.setInitialStubsGetter(() => {
      const { mergedStubs } = buildMergedCachedPythonPackageStubs();
      return cloneUserFolder(mergedStubs);
    });
    await pyright.ensurePyrightReady();
    if (!persistedPipIncludesRestoredRef.current) {
      persistedPipIncludesRestoredRef.current = true;

      for (const moduleName of loadSavedPipIncludedModules()) {
        try {
          await pyright.includeTypeshedModule(moduleName);
        } catch (error) {
          console.warn(`Failed to restore persisted pip include '${moduleName}':`, error);
        }
      }
    }

    if (!persistedPythonPackageStubsRestoredRef.current) {
      const { nextStubContributions, mergedStubs } = buildMergedCachedPythonPackageStubs();
      if (Object.keys(nextStubContributions).length > 0) {
        pythonStubContributionsRef.current = nextStubContributions;
      }
      persistedPythonPackageStubsRestoredRef.current = true;

      if (hasUserFolderEntries(mergedStubs)) {
        try {
          await pyright.reloadPyrightWithStubs(mergedStubs);
        } catch (error) {
          console.warn('Failed to restore cached Python package stubs into Pyright:', error);
        }
      }
    }

    return pyright;
  }, [buildMergedCachedPythonPackageStubs, ensurePersistedPyodidePackageMetaLoaded, getPyrightModule]);

  const ensureCSharpAuthoringReady = useCallback(async () => {
    const csharpAuthoring = await getCSharpAuthoringModule();
    await csharpAuthoring.ensureCSharpReady();
    if (persistedCSharpNamespacesRestoredRef.current) return csharpAuthoring;
    persistedCSharpNamespacesRestoredRef.current = true;

    for (const namespaceName of loadSavedCSharpNamespaces()) {
      try {
        await csharpAuthoring.csharpService.includeNamespace(namespaceName);
      } catch (error) {
        console.warn(`Failed to restore C# namespace '${namespaceName}':`, error);
      }
    }
    return csharpAuthoring;
  }, [getCSharpAuthoringModule]);

  const refreshPythonDiagnostics = useCallback(async () => {
    const editor = pythonDiagnosticsEditorRef.current;
    if (!editor) return;
    if (editorRef.current !== editor) return;
    if (editor.getModel?.()?.getLanguageId?.() !== 'python') return;

    const pyright = await ensurePythonAuthoringReady();
    if (pythonDiagnosticsEditorRef.current !== editor) return;
    if (editorRef.current !== editor) return;
    if (editor.getModel?.()?.getLanguageId?.() !== 'python') return;

    clearPyrightEditorBinding();
    pyright.pyrightProvider.setupDiagnostics(editor);
  }, [clearPyrightEditorBinding, ensurePythonAuthoringReady]);

  const refreshCSharpDiagnostics = useCallback(async () => {
    const editor = csharpDiagnosticsEditorRef.current;
    if (!editor) return;
    if (editorRef.current !== editor) return;
    if (editor.getModel?.()?.getLanguageId?.() !== 'csharp') return;

    const csharpAuthoring = await ensureCSharpAuthoringReady();
    if (csharpDiagnosticsEditorRef.current !== editor) return;
    if (editorRef.current !== editor) return;
    if (editor.getModel?.()?.getLanguageId?.() !== 'csharp') return;

    csharpAuthoring.csharpService.setupEditor(editor);
  }, [ensureCSharpAuthoringReady]);

  const bindLanguageServicesToEditor = useCallback((editor: any) => {
    editorRef.current = editor;
    configureMonacoSuggestionAcceptance(editor);
    resetSharedEditorOptions(editor);
    const languageId = editor.getModel?.()?.getLanguageId?.();

    if (languageId === 'python') {
      pythonDiagnosticsEditorRef.current = editor;
      void refreshPythonDiagnostics();
    } else if (pythonDiagnosticsEditorRef.current === editor) {
      clearPyrightEditorBinding();
      pythonDiagnosticsEditorRef.current = null;
    }

    if (languageId === 'csharp') {
      csharpDiagnosticsEditorRef.current = editor;
      void refreshCSharpDiagnostics();
    } else if (csharpDiagnosticsEditorRef.current === editor) {
      clearCSharpEditorBinding();
      csharpDiagnosticsEditorRef.current = null;
    }
  }, [clearCSharpEditorBinding, clearPyrightEditorBinding, refreshCSharpDiagnostics, refreshPythonDiagnostics, resetSharedEditorOptions]);

  const handleEditorMount = useCallback((editor: any) => {
    bindLanguageServicesToEditor(editor);
    editor.onDidFocusEditorText(() => bindLanguageServicesToEditor(editor));
    editor.onDidChangeModel(() => bindLanguageServicesToEditor(editor));
    editor.onDidDispose(() => {
      if (pythonDiagnosticsEditorRef.current === editor) {
        clearPyrightEditorBinding();
        pythonDiagnosticsEditorRef.current = null;
      }
      if (csharpDiagnosticsEditorRef.current === editor) {
        clearCSharpEditorBinding();
        csharpDiagnosticsEditorRef.current = null;
      }
      if (editorRef.current === editor) {
        editorRef.current = null;
      }

      const pendingTarget = pendingSharedEditorTargetRef.current;
      if (pendingTarget) {
        pendingSharedEditorTargetRef.current = null;
        setMountedSharedEditorTarget(current =>
          current ?? createSharedEditorTarget(pendingTarget.tabId, pendingTarget.itemId)
        );
      }
    });
  }, [bindLanguageServicesToEditor, clearCSharpEditorBinding, clearPyrightEditorBinding, createSharedEditorTarget]);

  const disposeMountedSharedEditor = useCallback(() => {
    const editor = editorRef.current;
    if (!editor) return false;
    editor.dispose();
    return true;
  }, []);

  // Helper to get full path
  const getPath = (id: string | undefined): string => {
    if (!id) return '';
    const item = files.find(f => f.id === id);
    if (!item) return '';
    if (!item.parentId) return item.name;
    return `${getPath(item.parentId)}/${item.name}`;
  };

  function getProjectRunnableFiles() {
    return files
      .filter((item): item is FSItem & { type: 'file' } => (
        item.type === 'file'
        && normalizeProjectRuntimeLanguage(item.language) !== null
      ))
      .sort((left, right) => getPath(left.id).localeCompare(getPath(right.id)));
  }

  function getActiveRunnableFile() {
    if (activeItem?.type !== 'file') return null;
    return normalizeProjectRuntimeLanguage(activeItem.language) ? activeItem : null;
  }

  function getResolvedProjectRun(): ResolvedProjectRun {
    const runnableFiles = getProjectRunnableFiles();
    const fixedLanguage = getProjectRunModeLanguage(settings.projectRunMode);

    const selectedFiles = settings.projectRunMode === 'custom'
      ? runnableFiles.filter(file => settings.projectRunCustomFileIds.includes(file.id))
      : runnableFiles.filter(file => normalizeProjectRuntimeLanguage(file.language) === fixedLanguage);

    if (selectedFiles.length === 0) {
      return {
        mode: settings.projectRunMode,
        language: fixedLanguage,
        selectedFiles,
        entryFile: null,
        error: settings.projectRunMode === 'custom'
          ? 'Custom project run has no files selected.'
          : `No ${getProjectRuntimeLanguageLabel(fixedLanguage)} files are available for project run.`,
      };
    }

    const selectedLanguageSet = new Set<ProjectRuntimeLanguage>(
      selectedFiles
        .map(file => normalizeProjectRuntimeLanguage(file.language))
        .filter((language): language is ProjectRuntimeLanguage => language !== null)
    );

    if (selectedLanguageSet.size > 1) {
      return {
        mode: settings.projectRunMode,
        language: null,
        selectedFiles,
        entryFile: null,
        error: 'Project run requires files from a single supported language.',
      };
    }

    const resolvedLanguage = fixedLanguage ?? selectedLanguageSet.values().next().value ?? null;
    const activeRunnableFile = activeFileId
      ? selectedFiles.find(file => file.id === activeFileId) ?? null
      : null;
    const configuredEntry = settings.projectRunEntryFileId
      ? selectedFiles.find(file => file.id === settings.projectRunEntryFileId) ?? null
      : null;
    const entryFile = configuredEntry ?? activeRunnableFile ?? selectedFiles[0] ?? null;

    return {
      mode: settings.projectRunMode,
      language: resolvedLanguage,
      selectedFiles,
      entryFile,
      error: entryFile ? null : 'Project run could not determine an entry file.',
    };
  }

  const toProjectSourceFiles = (projectFiles: FSItem[]): ProjectSourceFile[] => (
    projectFiles
      .map((file) => {
        const language = normalizeProjectRuntimeLanguage(file.language);
        if (!language) return null;
        return {
          id: file.id,
          name: file.name,
          path: normalizeProjectPath(getPath(file.id)),
          content: file.content || '',
          language,
        } satisfies ProjectSourceFile;
      })
      .filter((file): file is ProjectSourceFile => file !== null)
      .sort((left, right) => left.path.localeCompare(right.path))
  );

  const projectRunnableFiles = getProjectRunnableFiles();
  const resolvedProjectRun = getResolvedProjectRun();
  const activeRunnableFile = getActiveRunnableFile();
  const canRunCurrentFile = !isRunning && activeRunnableFile !== null;
  const canRunProject = !isRunning && !resolvedProjectRun.error;

  // Helper to find item by path or name
  const findItem = (pathOrName: string): FSItem | undefined => {
    // Try exact path match first
    const byPath = files.find(f => getPath(f.id) === pathOrName);
    if (byPath) return byPath;
    // Try name match
    return files.find(f => f.name === pathOrName);
  };

  const findEditorTabset = (node: any): any => {
    if (node.type === 'tabset' && (node.id === 'editor-tabset' || (node.children || []).some((child: any) => child.component === 'editor'))) {
      return node;
    }
    for (const child of node.children || []) {
      const found = findEditorTabset(child);
      if (found) return found;
    }
    return null;
  };

  const findEditorTabByItemId = (node: any, itemId: string): any => {
    if (node.type === 'tab' && node.component === 'editor' && node.config?.itemId === itemId) {
      return node;
    }
    for (const child of node.children || []) {
      const found = findEditorTabByItemId(child, itemId);
      if (found) return found;
    }
    return null;
  };

  const resolveEditorTabsetId = (jsonModel: IJsonModel): string | null => {
    const editorTabset = findEditorTabset((jsonModel as any).layout);
    if (editorTabset?.id) return editorTabset.id;

    let firstEditorTabId: string | null = null;
    const findFirstEditorTabId = (node: any) => {
      if (firstEditorTabId) return;
      if (node.type === 'tab' && node.component === 'editor' && typeof node.id === 'string') {
        firstEditorTabId = node.id;
        return;
      }
      for (const child of node.children || []) {
        findFirstEditorTabId(child);
      }
    };

    findFirstEditorTabId((jsonModel as any).layout);
    if (!firstEditorTabId) return null;
    const tabNode: any = layoutModel.getNodeById(firstEditorTabId);
    return tabNode?.getParent?.()?.getId?.() || null;
  };

  const selectTabById = (node: any, tabId: string): boolean => {
    if (node.type === 'tabset') {
      const index = (node.children || []).findIndex((child: any) => child.id === tabId);
      if (index >= 0) {
        node.selected = index;
        return true;
      }
    }
    for (const child of node.children || []) {
      if (selectTabById(child, tabId)) return true;
    }
    return false;
  };

  const collectFallbackEditorTabIds = (node: any, ids: string[] = []): string[] => {
    if (node.type === 'tab' && node.component === 'editor' && node.config?.isFallback) {
      ids.push(node.id);
    }
    for (const child of node.children || []) {
      collectFallbackEditorTabIds(child, ids);
    }
    return ids;
  };

  const buildFallbackEditorTab = () => ({
    type: 'tab',
    id: 'editor-fallback-tab',
    name: 'Editor',
    component: 'editor',
    config: { isFallback: true },
    enableClose: false
  });

  const openEditorTabWithItem = (item: FSItem) => {
    skipEditorSyncRef.current = true;
    setActiveFileId(item.id);

    const jsonModel = layoutModel.toJson() as IJsonModel;
    const fallbackTabIds = collectFallbackEditorTabIds(jsonModel.layout);
    const existingTab = findEditorTabByItemId(jsonModel.layout, item.id);
    if (existingTab?.id) {
      setActiveEditorTabId(existingTab.id);
      layoutModel.doAction(Actions.selectTab(existingTab.id));
      fallbackTabIds
        .filter(id => id !== existingTab.id)
        .forEach(id => layoutModel.doAction(Actions.deleteTab(id)));
      skipEditorSyncRef.current = false;
      return;
    }

    const primaryFallbackTabId = fallbackTabIds[0];
    if (primaryFallbackTabId) {
      const fallbackNode: any = layoutModel.getNodeById(primaryFallbackTabId);
      const parentTabsetId = fallbackNode?.getParent?.()?.getId?.();
      if (parentTabsetId) {
        layoutModel.doAction(Actions.addNode({
          type: 'tab',
          id: `editor-panel-tab-${item.id}`,
          name: item.name,
          component: 'editor',
          config: { itemId: item.id },
          enableClose: true
        }, parentTabsetId, DockLocation.CENTER, -1, true));
        setActiveEditorTabId(`editor-panel-tab-${item.id}`);
        fallbackTabIds.forEach(id => layoutModel.doAction(Actions.deleteTab(id)));
      }
      skipEditorSyncRef.current = false;
      return;
    }

    const editorTabsetId = resolveEditorTabsetId(jsonModel);
    if (!editorTabsetId) {
      skipEditorSyncRef.current = false;
      return;
    }

    layoutModel.doAction(Actions.addNode({
      type: 'tab',
      id: `editor-panel-tab-${item.id}`,
      name: item.name,
      component: 'editor',
      config: { itemId: item.id },
      enableClose: true
    }, editorTabsetId, DockLocation.CENTER, -1, true));
    setActiveEditorTabId(`editor-panel-tab-${item.id}`);
    skipEditorSyncRef.current = false;
  };

  const openEditorTab = (itemId: string) => {
    const item = files.find(f => f.id === itemId);
    if (!item) return;
    openEditorTabWithItem(item);
  };

  const readDirRecursive = async (dirHandle: FileSystemDirectoryHandle, parentId: string, existingFiles: FSItem[]): Promise<FSItem[]> => {
    const items: FSItem[] = [];
    for await (const entry of (dirHandle as any).values()) {
      const existingItem = existingFiles.find(f => f.parentId === parentId && f.name === entry.name);
      if (entry.kind === 'file') {
        const file: File = await entry.getFile();
        const content = await file.text();
        items.push({
          id: existingItem?.id || Math.random().toString(36).slice(2, 11),
          name: entry.name,
          type: 'file',
          parentId,
          content,
          language: langFromFilename(entry.name),
        });
      } else if (entry.kind === 'directory') {
        const folderId = existingItem?.id || Math.random().toString(36).slice(2, 11);
        items.push({
          id: folderId,
          name: entry.name,
          type: 'folder',
          parentId,
          isOpen: existingItem?.isOpen ?? false,
        });
        const children = await readDirRecursive(entry as FileSystemDirectoryHandle, folderId, existingFiles);
        items.push(...children);
      }
    }
    return items;
  };

  const writeDirRecursive = async (dirHandle: FileSystemDirectoryHandle, folderId: string, currentFiles: FSItem[]) => {
    const children = currentFiles.filter(f => f.parentId === folderId);
    const localEntryNames = new Set<string>();
    for await (const entry of (dirHandle as any).values()) {
      localEntryNames.add(entry.name as string);
    }

    for (const child of children) {
      if (child.type === 'file') {
        const fileHandle = await dirHandle.getFileHandle(child.name, { create: true });
        const writable = await (fileHandle as any).createWritable();
        await writable.write(child.content || '');
        await writable.close();
      } else if (child.type === 'folder') {
        const subDirHandle = await dirHandle.getDirectoryHandle(child.name, { create: true });
        await writeDirRecursive(subDirHandle, child.id, currentFiles);
      }
    }

    const childNames = new Set(children.map(c => c.name));
    for (const localName of localEntryNames) {
      if (!childNames.has(localName)) {
        try {
          await (dirHandle as any).removeEntry(localName, { recursive: true });
        } catch { /* ignore removal failures */ }
      }
    }
  };

  const getDescendants = (id: string, items: FSItem[]): FSItem[] => {
    const result: FSItem[] = [];
    for (const item of items) {
      if (item.parentId === id) {
        result.push(item);
        if (item.type === 'folder') result.push(...getDescendants(item.id, items));
      }
    }
    return result;
  };

  const getDescendantIds = (id: string, items: FSItem[]): Set<string> => {
    const ids = new Set<string>();
    for (const item of items) {
      if (item.parentId === id) {
        ids.add(item.id);
        if (item.type === 'folder') for (const dId of getDescendantIds(item.id, items)) ids.add(dId);
      }
    }
    return ids;
  };

  const withSyncLock = async (folderId: string, fn: () => Promise<void>) => {
    const prev = syncLocksRef.current.get(folderId) || Promise.resolve();
    const next = prev.then(fn, fn).then(() => {
      if (syncLocksRef.current.get(folderId) === next) {
        syncLocksRef.current.delete(folderId);
      }
    });
    syncLocksRef.current.set(folderId, next);
    await next;
  };

  const checkPermission = async (handle: FileSystemDirectoryHandle): Promise<boolean> => {
    const perm = await (handle as any).queryPermission({ mode: 'readwrite' });
    if (perm === 'granted') return true;
    const req = await (handle as any).requestPermission({ mode: 'readwrite' });
    return req === 'granted';
  };

  const addSyncHandle = (folderId: string, handle: FileSystemDirectoryHandle) => {
    syncHandlesRef.current.set(folderId, handle);
    setActiveSyncIds(prev => { const next = new Set(prev); next.add(folderId); return next; });
  };

  const removeSyncHandleLocal = (folderId: string) => {
    syncHandlesRef.current.delete(folderId);
    syncInitializedRef.current.delete(folderId);
    setActiveSyncIds(prev => { const next = new Set(prev); next.delete(folderId); return next; });
  };

  const syncToDisk = async (folderId: string) => {
    await withSyncLock(folderId, async () => {
      const handle = syncHandlesRef.current.get(folderId);
      if (!handle) return;
      const perm = await (handle as any).queryPermission({ mode: 'readwrite' });
      if (perm !== 'granted') return;
      await writeDirRecursive(handle, folderId, filesRef.current);
    });
  };

  const mergeLocalIntoCurrent = async (folderId: string, dirHandle: FileSystemDirectoryHandle) => {
    await withSyncLock(folderId, async () => {
      if (!await checkPermission(dirHandle)) return;

      const currentFiles = filesRef.current;
      const diskItems = await readDirRecursive(dirHandle, folderId, currentFiles);
      const existingDescendants = getDescendants(folderId, currentFiles);

      const merged: FSItem[] = [];
      const usedDiskIds = new Set<string>();

      for (const memItem of existingDescendants) {
        const diskMatch = diskItems.find(d =>
          d.parentId === memItem.parentId && d.name === memItem.name && d.type === memItem.type
        );
        if (diskMatch) usedDiskIds.add(diskMatch.id);
        merged.push(memItem);
      }

      for (const diskItem of diskItems) {
        if (usedDiskIds.has(diskItem.id)) continue;
        const alreadyInMerged = merged.some(m =>
          m.parentId === diskItem.parentId && m.name === diskItem.name && m.type === diskItem.type
        );
        if (!alreadyInMerged) merged.push(diskItem);
      }

      setFiles(prev => {
        const descendantIds = getDescendantIds(folderId, prev);
        const nonDescendants = prev.filter(f => !descendantIds.has(f.id));
        return [...nonDescendants, ...merged];
      });

      await writeDirRecursive(dirHandle, folderId, filesRef.current);
      syncInitializedRef.current.add(folderId);
    });
  };

  const startFolderSync = async (folderId: string) => {
    try {
      const dirHandle = await (window as any).showDirectoryPicker({ mode: 'readwrite' });
      addSyncHandle(folderId, dirHandle);

      await saveSyncHandle(folderId, dirHandle);
      const folderItem = files.find(f => f.id === folderId);
      const meta: SyncMeta = {
        folderId,
        folderName: folderItem?.name || folderId,
        localPath: dirHandle.name,
        connectedAt: Date.now(),
      };
      setSyncMeta(prev => {
        const next = prev.filter(m => m.folderId !== folderId);
        next.push(meta);
        saveSyncMeta(next);
        return next;
      });

      await mergeLocalIntoCurrent(folderId, dirHandle);
    } catch {
      // User cancelled picker
    }
  };

  const stopFolderSync = (folderId: string) => {
    removeSyncHandleLocal(folderId);
    setSyncMeta(prev => {
      const next = prev.filter(m => m.folderId !== folderId);
      saveSyncMeta(next);
      return next;
    });
    removeSyncHandle(folderId);
  };

  useEffect(() => {
    let cancelled = false;
    loadAllSyncHandles().then(async handles => {
      if (cancelled) return;
      for (const [folderId, handle] of handles) {
        if (cancelled) return;
        const folderExists = filesRef.current.some(f => f.id === folderId && f.type === 'folder');
        if (!folderExists) {
          await removeSyncHandle(folderId);
          setSyncMeta(prev => { const next = prev.filter(m => m.folderId !== folderId); saveSyncMeta(next); return next; });
          continue;
        }
        try {
          if (await checkPermission(handle)) {
            addSyncHandle(folderId, handle);
            await mergeLocalIntoCurrent(folderId, handle);
          } else {
            await removeSyncHandle(folderId);
            setSyncMeta(prev => { const next = prev.filter(m => m.folderId !== folderId); saveSyncMeta(next); return next; });
          }
        } catch (e) {
          console.warn(`Failed to reconnect sync for folder ${folderId}:`, e);
          await removeSyncHandle(folderId);
          setSyncMeta(prev => { const next = prev.filter(m => m.folderId !== folderId); saveSyncMeta(next); return next; });
        }
      }
    });
    return () => { cancelled = true; };
  }, []);

  // Save settings to localStorage
  useEffect(() => {
    localStorage.setItem(STORAGE_KEYS.settings, JSON.stringify(settings));
  }, [settings]);

  useEffect(() => {
    if (codexLoginCallbackHandledRef.current || typeof window === 'undefined') return;
    const callbackUrl = new URL(window.location.href);
    const hasCodexCallback = callbackUrl.searchParams.has('code') || callbackUrl.searchParams.has('error');
    if (!hasCodexCallback) return;

    codexLoginCallbackHandledRef.current = true;
    completeCodexCliBrowserLogin(callbackUrl.toString(), settings.assistantOAuthSession).then(result => {
      setSettings(current => ({
        ...current,
        assistantProvider: 'codex-cli',
        assistantOAuthSession: result.nextOAuthSession ?? current.assistantOAuthSession,
      }));
      setTerminalOutput(prev => [...prev, '~ $ codex login --callback', ...result.lines]);
      const cleanPath = callbackUrl.pathname.endsWith('/auth/callback') ? '/' : callbackUrl.pathname;
      window.history.replaceState({}, document.title, `${cleanPath}${callbackUrl.hash || ''}`);
      selectDockPanel('terminal');
    });
  }, [settings.assistantOAuthSession]);

  useEffect(() => {
    const nextRunnableFiles = getProjectRunnableFiles();
    const runnableIds = new Set(nextRunnableFiles.map(file => file.id));

    setSettings(current => {
      const nextCustomFileIds = current.projectRunCustomFileIds.filter(id => runnableIds.has(id));
      const modeLanguage = getProjectRunModeLanguage(current.projectRunMode);
      const selectedIds = current.projectRunMode === 'custom'
        ? nextCustomFileIds
        : nextRunnableFiles
          .filter(file => normalizeProjectRuntimeLanguage(file.language) === modeLanguage)
          .map(file => file.id);

      const preferredEntryId =
        current.projectRunEntryFileId && selectedIds.includes(current.projectRunEntryFileId)
          ? current.projectRunEntryFileId
          : selectedIds.includes(activeFileId)
            ? activeFileId
            : selectedIds[0] ?? null;

      if (
        nextCustomFileIds.length === current.projectRunCustomFileIds.length
        && nextCustomFileIds.every((id, index) => id === current.projectRunCustomFileIds[index])
        && preferredEntryId === current.projectRunEntryFileId
      ) {
        return current;
      }

      return {
        ...current,
        projectRunCustomFileIds: nextCustomFileIds,
        projectRunEntryFileId: preferredEntryId,
      };
    });
  }, [activeFileId, files]);

  useEffect(() => {
    if (isSettingsOpen) {
      setSettingsPipPackages(loadSavedPipPackages());
      setSettingsPipIncludedModules(loadSavedPipIncludedModules());
      setSettingsPyiImportSizeLimitOverrides(loadSavedPyiImportSizeLimitOverrides());
      setSettingsCSharpNamespaces(loadSavedCSharpNamespaces());
      setSettingsPipStatus('');
      setSettingsPipIncludeStatus('');
      setSettingsPyiImportSizeLimitStatus('');
      setSettingsCSharpNamespaceStatus('');
    }
  }, [isSettingsOpen]);

  useEffect(() => {
    if (!activeEditorTabId || !activeEditorTabItemId || activeEditorTabItem?.type !== 'file') {
      pendingSharedEditorTargetRef.current = null;
      setMountedSharedEditorTarget(null);
      void disposeMountedSharedEditor();
      return;
    }

    if (!mountedSharedEditorTarget) {
      if (pendingSharedEditorTargetRef.current) {
        return;
      }
      pendingSharedEditorTargetRef.current = null;
      setMountedSharedEditorTarget(createSharedEditorTarget(activeEditorTabId, activeEditorTabItemId));
      return;
    }

    if (
      mountedSharedEditorTarget.tabId === activeEditorTabId
      && mountedSharedEditorTarget.itemId === activeEditorTabItemId
    ) {
      pendingSharedEditorTargetRef.current = null;
      return;
    }

    pendingSharedEditorTargetRef.current = { tabId: activeEditorTabId, itemId: activeEditorTabItemId };
    setMountedSharedEditorTarget(null);
    if (!disposeMountedSharedEditor()) {
      pendingSharedEditorTargetRef.current = null;
      setMountedSharedEditorTarget(createSharedEditorTarget(activeEditorTabId, activeEditorTabItemId));
    }
  }, [activeEditorTabId, activeEditorTabItem?.type, activeEditorTabItemId, createSharedEditorTarget, disposeMountedSharedEditor, mountedSharedEditorTarget]);

  useEffect(() => {
    const editor = editorRef.current;
    if (!editor) return;
    resetSharedEditorOptions(editor);
    bindLanguageServicesToEditor(editor);
  }, [bindLanguageServicesToEditor, mountedSharedEditorTarget?.version, resetSharedEditorOptions, settings.fontSize]);


  useEffect(() => {
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    saveTimerRef.current = setTimeout(() => {
      if (settings.autoSave) {
        localStorage.setItem(STORAGE_KEYS.files, JSON.stringify(filesRef.current));
      }
      for (const folderId of syncHandlesRef.current.keys()) {
        if (!syncInitializedRef.current.has(folderId)) continue;
        syncToDisk(folderId);
      }
    }, 1000);
    return () => { if (saveTimerRef.current) clearTimeout(saveTimerRef.current); };
  }, [files, settings.autoSave]);

  useEffect(() => {
    localStorage.setItem(STORAGE_KEYS.assistantChats, JSON.stringify(assistantChats));
  }, [assistantChats]);

  useEffect(() => {
    localStorage.setItem(STORAGE_KEYS.layout, JSON.stringify(layoutModel.toJson()));
  }, []);

  useEffect(() => {
    return () => {
      if (pyodideIdleTimerRef.current) clearTimeout(pyodideIdleTimerRef.current);
      if (outputPreviewUrlsRef.current.length > 0) {
        for (const url of outputPreviewUrlsRef.current) {
          try {
            URL.revokeObjectURL(url);
          } catch { }
        }
        outputPreviewUrlsRef.current = [];
      }
    };
  }, []);

  useEffect(() => {
    setAssistantInputs(prev => {
      const next = { ...prev };
      assistantChats.forEach(chat => {
        if (next[chat.id] === undefined) next[chat.id] = '';
      });
      return next;
    });
  }, [assistantChats]);

  useEffect(() => {
    const draftChats = assistantChats
      .map(chat => ({
        chatId: chat.id,
        chat,
        draft: (assistantInputs[chat.id] || '').trim(),
      }))
      .filter(entry => entry.draft.length > 0);

    const draftChatIds = new Set(draftChats.map(entry => entry.chatId));
    setAssistantTokenEstimates(prev => {
      const next: Record<string, AssistantTokenEstimate> = {};
      for (const [chatId, estimate] of Object.entries(prev)) {
        if (draftChatIds.has(chatId)) {
          next[chatId] = estimate;
        }
      }
      return next;
    });

    if (draftChats.length === 0) {
      assistantEstimateRequestIdRef.current += 1;
      return;
    }

    if (!settings.assistantShowUsagePopup) {
      assistantEstimateRequestIdRef.current += 1;
      setAssistantTokenEstimates({});
      return;
    }

    const requestId = assistantEstimateRequestIdRef.current + 1;
    assistantEstimateRequestIdRef.current = requestId;
    const timeoutId = window.setTimeout(() => {
      const selectionContext = getCurrentAssistantSelectionContext();
      const estimateProvider = settings.assistantProvider;
      const estimateModel = settings.assistantModel.trim();
      const estimateApiKey = settings.assistantApiKey.trim();
      const estimateReasoningControl = getAssistantReasoningControl(estimateProvider, estimateModel);
      const estimateUseChainOfThought =
        estimateReasoningControl === 'always_on'
          ? true
          : estimateReasoningControl === 'toggleable'
            ? settings.assistantUseChainOfThought
            : false;
      draftChats.forEach(({ chatId, chat, draft }) => {
        const projectedOutputTokens = assistantTurnUsageByChatId[chatId]?.outputTokenCount || DEFAULT_ASSISTANT_ESTIMATED_OUTPUT_TOKENS;
        const assistantFiles = files.map(file => ({ ...file }));
        const assistantActiveItemId = activeItem?.id || activeFileId || '';
        const prompt = buildAssistantPromptFromSnapshot({
          chatId,
          messages: chat.messages,
          userContent: draft + selectionContext,
          assistantFiles,
          assistantActiveItemId,
          assistantTerminalCwd: terminalCwd,
          useChainOfThought: estimateUseChainOfThought,
          maxChainOfThoughtDepth: effectiveAssistantMaxChainOfThoughtDepth,
          codexCliPrefix: estimateProvider === 'codex-cli' ? buildCodexCliPromptPrefix(codexCliRuntimeState) : '',
        });

        setAssistantTokenEstimates(prev => ({
          ...prev,
          [chatId]: {
            status: 'loading',
            promptTokenCount: prev[chatId]?.promptTokenCount ?? null,
            estimatedOutputTokenCount: projectedOutputTokens,
            estimatedTotalTokenCount: prev[chatId]?.estimatedTotalTokenCount ?? null,
            estimatedPaidCostUsd: prev[chatId]?.estimatedPaidCostUsd ?? null,
            source: prev[chatId]?.source ?? 'approximation',
            error: prev[chatId]?.error,
            updatedAt: Date.now(),
          },
        }));

        const finalizeApproximateEstimate = (error?: unknown) => {
          if (assistantEstimateRequestIdRef.current !== requestId) return;
          const promptTokenCount = estimateFallbackTokenCount(prompt);
          const estimatedTotalTokenCount = promptTokenCount + projectedOutputTokens;
          setAssistantTokenEstimates(prev => ({
            ...prev,
            [chatId]: {
              status: 'ready',
              promptTokenCount,
              estimatedOutputTokenCount: projectedOutputTokens,
              estimatedTotalTokenCount,
              estimatedPaidCostUsd: calculateAssistantPaidCostUsd(estimateProvider, estimateModel, promptTokenCount, projectedOutputTokens),
              source: 'approximation',
              ...(error ? { error: error instanceof Error ? error.message : String(error) } : {}),
              updatedAt: Date.now(),
            },
          }));
        };

        if (estimateProvider !== 'gemini' || !estimateApiKey || !estimateModel) {
          finalizeApproximateEstimate(
            !estimateApiKey && estimateProvider !== 'codex-cli'
              ? 'Live token counting is unavailable without a saved legacy credential.'
              : undefined
          );
          return;
        }

        const geminiClient = new GoogleGenAI({ apiKey: estimateApiKey });
        void geminiClient.models.countTokens({
          model: estimateModel,
          contents: prompt,
        }).then((response: any) => {
          if (assistantEstimateRequestIdRef.current !== requestId) return;
          const promptTokenCount = typeof response?.totalTokens === 'number'
            ? response.totalTokens
            : estimateFallbackTokenCount(prompt);
          const estimatedTotalTokenCount = promptTokenCount + projectedOutputTokens;
          setAssistantTokenEstimates(prev => ({
            ...prev,
            [chatId]: {
              status: 'ready',
              promptTokenCount,
              estimatedOutputTokenCount: projectedOutputTokens,
              estimatedTotalTokenCount,
              estimatedPaidCostUsd: calculateAssistantPaidCostUsd(estimateProvider, estimateModel, promptTokenCount, projectedOutputTokens),
              source: typeof response?.totalTokens === 'number' ? 'model' : 'approximation',
              updatedAt: Date.now(),
            },
          }));
        }).catch((error) => {
          finalizeApproximateEstimate(error);
        });
      });
    }, 500);

    return () => {
      clearTimeout(timeoutId);
    };
  }, [
    activeFileId,
    activeItem,
    assistantChats,
    assistantInputs,
    assistantTurnUsageByChatId,
    files,
    settings.assistantApiKey,
    settings.assistantMaxChainOfThoughtDepth,
    settings.assistantModel,
    settings.assistantProvider,
    settings.assistantShowUsagePopup,
    settings.assistantUseChainOfThought,
    terminalCwd,
    effectiveAssistantMaxChainOfThoughtDepth,
  ]);

  // Auto-scroll output and terminal
  useEffect(() => {
    if (outputContainerRef.current) {
      outputContainerRef.current.scrollTop = outputContainerRef.current.scrollHeight;
    }
  }, [output, outputInteraction]);

  useEffect(() => {
    if (!outputInteraction || (outputInteraction.kind !== 'prompt' && outputInteraction.kind !== 'stdin')) return;
    const timeoutId = window.setTimeout(() => {
      outputInteractionInputRef.current?.focus();
      outputInteractionInputRef.current?.select?.();
    }, 0);
    return () => clearTimeout(timeoutId);
  }, [outputInteraction]);

  useEffect(() => {
    return () => {
      outputInteractionResolverRef.current?.(null);
      outputInteractionResolverRef.current = null;
    };
  }, []);

  useEffect(() => {
    if (terminalContainerRef.current) {
      terminalContainerRef.current.scrollTop = terminalContainerRef.current.scrollHeight;
    }
  }, [terminalOutput]);

  const withExecutionTimeout = useCallback(async <T,>(
    label: string,
    timeoutMs: number,
    task: () => Promise<T>,
    onTimeout?: () => void | Promise<void>
  ): Promise<T> => {
    const normalizedTimeout = normalizeExecutionTimeoutMs(timeoutMs);
    if (normalizedTimeout <= 0) {
      return task();
    }

    return new Promise<T>((resolve, reject) => {
      let settled = false;
      const timeoutId = window.setTimeout(() => {
        if (settled) return;
        settled = true;
        Promise.resolve(onTimeout?.())
          .catch(() => {})
          .finally(() => reject(createExecutionTimeoutError(label, normalizedTimeout)));
      }, normalizedTimeout);

      Promise.resolve(task())
        .then(result => {
          if (settled) return;
          settled = true;
          clearTimeout(timeoutId);
          resolve(result);
        })
        .catch(error => {
          if (settled) return;
          settled = true;
          clearTimeout(timeoutId);
          reject(error);
      });
    });
  }, []);

  const appendExecutionStartupStatus = (message: string) => {
    setExecutionStartupStatus(prev => prev ? `${prev}\n${message}` : message);
  };

  function getCurrentAssistantSelectionContext() {
    if (!editorRef.current || !activeItem) {
      return "";
    }
    const selection = editorRef.current.getSelection?.();
    const model = editorRef.current.getModel?.();
    if (!selection || !model || selection.isEmpty?.()) {
      return "";
    }
    const selectedText = model.getValueInRange(selection);
    if (!selectedText) {
      return "";
    }
    return `\n\n[User selected code in ${activeItem.name}]:\n\`\`\`${activeItem.language || 'text'}\n${selectedText}\n\`\`\``;
  }

  function buildAssistantPromptFromSnapshot(params: {
    chatId: string;
    messages: ChatMessage[];
    userContent: string;
    assistantFiles: FSItem[];
    assistantActiveItemId: string;
    assistantTerminalCwd?: string | null;
    useChainOfThought?: boolean;
    maxChainOfThoughtDepth?: number;
    toolProgressNotes?: string[];
    assistantLiveNotes?: string[];
    codexCliPrefix?: string;
  }) {
    const {
      chatId,
      messages,
      userContent,
      assistantFiles,
      assistantActiveItemId,
      assistantTerminalCwd = null,
      useChainOfThought = false,
      maxChainOfThoughtDepth = DEFAULT_ASSISTANT_TOOL_PASSES,
      toolProgressNotes = [],
      assistantLiveNotes = [],
      codexCliPrefix = '',
    } = params;

    const getPathFromSnapshot = (id: string | undefined): string => {
      if (!id) return '';
      const item = assistantFiles.find(file => file.id === id);
      if (!item) return '';
      if (!item.parentId) return item.name;
      return `${getPathFromSnapshot(item.parentId)}/${item.name}`;
    };

    const activeSnapshotItem = assistantActiveItemId
      ? assistantFiles.find(file => file.id === assistantActiveItemId) || null
      : null;
    const history = messages.map(msg => `${msg.role.toUpperCase()}: ${msg.content}`).join('\n');
    const toolProgress = toolProgressNotes.length > 0
      ? `\nTurn Progress:\n${toolProgressNotes.map((note, index) => `${index + 1}. ${note}`).join('\n')}\nUse the updated workspace state above when deciding the next action. If the task is complete, respond to the user normally.`
      : '';
    const liveAssistantProgress = assistantLiveNotes.length > 0
      ? `\nAssistant Messages Already Shown This Turn:\n${assistantLiveNotes.map((note, index) => `${index + 1}. ${note}`).join('\n')}\nContinue from there and avoid repeating the same message word-for-word.`
      : '';

    if (useChainOfThought) {
      return `
        Context: You are an AI coding assistant inside CodeCraft IDE.
        ${codexCliPrefix ? `\n${codexCliPrefix}\n` : ''}
        Internal Chat ID: ${chatId}
        Keep continuity with the existing chat history for this chat.
        You are in tool-driven Chain of Thought mode.
        Use the discrete MCP-style terminal tools to inspect the project one command at a time instead of assuming unseen files or folders.
        When you want to change code, use 'proposeEdit' so the user can review it.
        Keep user-facing explanations separate from tool and edit logs.
        If you need more context, discover it through the available terminal tools.
        You have at most ${maxChainOfThoughtDepth} tool rounds available for this turn, so prioritize your steps.

        Current terminal working directory: ${assistantTerminalCwd ? `/${getPathFromSnapshot(assistantTerminalCwd)}` : '/'}
        Active Item: ${activeSnapshotItem ? getPathFromSnapshot(activeSnapshotItem.id) : 'None selected'}
        ${activeSnapshotItem ? (activeSnapshotItem.type === 'file' ? `Active file content:\n${activeSnapshotItem.content || ''}` : 'The active item is a folder.') : 'No file is currently active.'}

        Chat History:
        ${history || '(empty)'}
        ${toolProgress}
        ${liveAssistantProgress}

        USER: ${userContent}
      `;
    }

    return `
        Context: You are an AI coding assistant inside CodeCraft IDE.
        ${codexCliPrefix ? `\n${codexCliPrefix}\n` : ''}
        Internal Chat ID: ${chatId}
        Keep continuity with the existing chat history for this chat.
        You have access to tools to propose edits, navigate, move cursor, directly create/delete/move files or folders, and run built-in terminal commands.
        Do not suggest terminal-style commands for filesystem operations when a tool can be used, unless the user specifically asks for it.
        When you want to change code, use 'proposeEdit' so the user can review it.
        You may use multiple tool calls in a single response when the task needs several actions.
        If you have a plan, progress update, or explanation, include it in the same response as your tool calls. That text is shown to the user immediately.
        Do not save every explanation for one final summary if the work is happening in multiple steps.
        If you need the contents of another file before editing it, navigate to it first. On the next tool round in the same turn, the updated active item and its content will be shown to you.
        If more than one action is needed, emit all needed tool calls in order in the same response instead of stopping after the first action.

        Current File System:
        ${assistantFiles.map(file => `- Path: ${getPathFromSnapshot(file.id)}, Type: ${file.type}, Language: ${file.language || 'N/A'}`).join('\n')}

        Active Item: ${activeSnapshotItem ? getPathFromSnapshot(activeSnapshotItem.id) : 'None selected'}
        ${activeSnapshotItem ? (activeSnapshotItem.type === 'file' ? `Content:\n${activeSnapshotItem.content || ''}` : 'This is a folder.') : 'No file is currently active.'}

        Chat History:
        ${history || '(empty)'}
        ${toolProgress}
        ${liveAssistantProgress}

        USER: ${userContent}
        `;
  }

  function revokeOutputPreviewUrls() {
    if (outputPreviewUrlsRef.current.length === 0) return;
    for (const url of outputPreviewUrlsRef.current) {
      try {
        URL.revokeObjectURL(url);
      } catch { }
    }
    outputPreviewUrlsRef.current = [];
  }

  const showOutputPreview = useCallback((html: string, objectUrls: string[] = []) => {
    revokeOutputPreviewUrls();
    outputPreviewUrlsRef.current = objectUrls;
    setOutputPreviewHtml(html);
  }, [revokeOutputPreviewUrls]);

  const clearOutputPreview = useCallback(() => {
    revokeOutputPreviewUrls();
    setOutputPreviewHtml(null);
  }, [revokeOutputPreviewUrls]);

  const resolveOutputPanelInteraction = (value: string | boolean | null | undefined) => {
    const resolver = outputInteractionResolverRef.current;
    flushSync(() => {
      outputInteractionResolverRef.current = null;
      setOutputInteraction(null);
      setOutputInteractionInput('');
      setOutputInteractionBufferedLines([]);
    });
    resolver?.(value);
  };

  const requestOutputPanelInteraction = (
    language: RuntimeInteractionLanguage,
    kind: RuntimeInteractionKind,
    message: string,
    defaultValue = '',
    options?: {
      transcriptPrompt?: string;
      transcriptPromptSequence?: string[];
      inputMode?: 'single-line' | 'buffered-lines';
      expectedLineCount?: number | null;
      placeholder?: string;
      submitLabel?: string;
      cancelLabel?: string;
    }
  ) => {
    if (outputInteractionResolverRef.current) {
      throw new Error('Another interactive output request is already active.');
    }

    selectDockPanel('output');
    clearOutputPreview();
    outputInteractionIdRef.current += 1;
    setOutputInteractionInput(defaultValue);
    setOutputInteractionBufferedLines([]);

    return new Promise<string | boolean | null | undefined>((resolve) => {
      outputInteractionResolverRef.current = resolve;
      setOutputInteraction({
        id: outputInteractionIdRef.current,
        language,
        kind,
        message,
        defaultValue,
        transcriptPrompt: options?.transcriptPrompt,
        transcriptPromptSequence: options?.transcriptPromptSequence,
        inputMode: options?.inputMode,
        expectedLineCount: options?.expectedLineCount ?? null,
        placeholder: options?.placeholder,
        submitLabel: options?.submitLabel,
        cancelLabel: options?.cancelLabel,
      });
    });
  };

  const getVisibleOutputInteractionMessage = (
    interaction: OutputPanelInteraction,
    transcriptLineIndex = outputInteractionBufferedLines.length
  ) => {
    if (interaction.kind === 'stdin') {
      if (interaction.inputMode === 'buffered-lines' && interaction.transcriptPromptSequence?.length) {
        return interaction.transcriptPromptSequence[Math.min(transcriptLineIndex, interaction.transcriptPromptSequence.length - 1)] || '';
      }
      return interaction.transcriptPrompt || '';
    }
    return interaction.transcriptPrompt || interaction.message || '';
  };

  const appendOutputInteractionTranscript = (text: string) => {
    if (!text) return;
    setOutput(prev => prev + text);
  };

  const commitResolvedOutputInteraction = (
    interaction: OutputPanelInteraction,
    resolvedValue: string | boolean | null | undefined,
    options?: {
      appendNewline?: boolean;
      transcriptLineIndex?: number;
    }
  ) => {
    const message = getVisibleOutputInteractionMessage(
      interaction,
      options?.transcriptLineIndex ?? outputInteractionBufferedLines.length
    );
    let text = message;

    if (interaction.kind === 'stdin' || interaction.kind === 'prompt') {
      text += typeof resolvedValue === 'string' ? resolvedValue : '';
    }

    if (options?.appendNewline) {
      text += '\n';
    }

    appendOutputInteractionTranscript(text);
  };

  const shouldAutoSubmitBufferedOutputInteraction = (
    interaction: OutputPanelInteraction,
    nextLines: string[]
  ) => (
    interaction.kind === 'stdin'
    && interaction.inputMode === 'buffered-lines'
    && interaction.expectedLineCount != null
    && interaction.expectedLineCount > 0
    && nextLines.length >= interaction.expectedLineCount
  );

  const queueBufferedOutputInteractionLine = () => {
    if (!outputInteraction || outputInteraction.kind !== 'stdin') return;
    const nextLine = outputInteractionInput;
    commitResolvedOutputInteraction(outputInteraction, nextLine, {
      appendNewline: true,
      transcriptLineIndex: outputInteractionBufferedLines.length,
    });
    const nextLines = [...outputInteractionBufferedLines, nextLine];
    if (shouldAutoSubmitBufferedOutputInteraction(outputInteraction, nextLines)) {
      resolveOutputPanelInteraction(nextLines.join('\n'));
      return;
    }
    setOutputInteractionBufferedLines(nextLines);
    setOutputInteractionInput('');
  };

  const submitOutputPanelStdinInteraction = () => {
    if (!outputInteraction || outputInteraction.kind !== 'stdin') return;

    if (outputInteraction.inputMode === 'buffered-lines') {
      let nextLines = [...outputInteractionBufferedLines];
      if (outputInteractionInput !== '') {
        commitResolvedOutputInteraction(outputInteraction, outputInteractionInput, {
          appendNewline: true,
          transcriptLineIndex: outputInteractionBufferedLines.length,
        });
        nextLines = [...nextLines, outputInteractionInput];
      }
      resolveOutputPanelInteraction(nextLines.join('\n'));
      return;
    }

    flushSync(() => {
      commitResolvedOutputInteraction(outputInteraction, outputInteractionInput, {
        appendNewline: true,
      });
    });
    resolveOutputPanelInteraction(outputInteractionInput);
  };

  const completeSharedBufferInteraction = (
    headerBuffer: SharedArrayBuffer,
    payloadBuffer: SharedArrayBuffer,
    payload: unknown
  ) => {
    const header = new Int32Array(headerBuffer);
    const buffer = new Uint8Array(payloadBuffer);
    const encoded = new TextEncoder().encode(JSON.stringify(payload));
    const maxLength = Math.min(encoded.length, buffer.byteLength);
    buffer.fill(0);
    buffer.set(encoded.subarray(0, maxLength), 0);
    Atomics.store(header, 1, maxLength);
    Atomics.store(header, 0, 1);
    Atomics.notify(header, 0, 1);
  };

  const performRuntimeInteraction = async (
    language: RuntimeInteractionLanguage,
    ioMode: RuntimeIOMode,
    kind: RuntimeInteractionKind,
    message: string,
    defaultValue = ''
  ) => {
    if (ioMode === 'interactive-output-panel') {
      return requestOutputPanelInteraction(language, kind, message, defaultValue, kind === 'stdin'
        ? {
          inputMode: 'single-line',
          placeholder: 'Type input and press Enter',
          submitLabel: 'Send',
          cancelLabel: 'Cancel',
        }
        : undefined);
    }

    if (kind === 'alert') {
      window.alert(message);
      return undefined;
    }
    if (kind === 'confirm') {
      return window.confirm(message);
    }
    return window.prompt(message, defaultValue) ?? null;
  };

  const requestPythonInteractiveOutputInput = async (promptText = '') => {
    const normalizedPrompt = typeof promptText === 'string' ? promptText : String(promptText ?? '');
    const response = await requestOutputPanelInteraction(
      'python',
      'stdin',
      '',
      '',
      {
        transcriptPrompt: normalizedPrompt,
        inputMode: 'single-line',
        placeholder: 'Type input and press Enter',
        submitLabel: 'Send',
        cancelLabel: 'Cancel',
      }
    );
    if (response === null) {
      throw new Error('Python input cancelled.');
    }
    return String(response ?? '');
  };

  const requestPythonInput = (promptText = '') => {
    const normalizedPrompt = typeof promptText === 'string' ? promptText : String(promptText ?? '');
    const value = window.prompt(normalizedPrompt || 'Python input:', '');
    if (value === null) {
      throw new Error('Python input cancelled.');
    }
    return value;
  };

  const collectPythonOutputPanelInput = async (pyodide: any, code: string) => {
    if (settings.pythonIOMode !== 'interactive-output-panel') {
      return [] as string[];
    }

    let requiresInput = false;
    let detectedPrompts: string[] = [];

    try {
      const raw = await pyodide.runPythonAsync(`
import ast, json, re

_code = ${JSON.stringify(code)}
_result = {
    "requiresInput": False,
    "prompts": [],
}

try:
    _tree = ast.parse(_code)
except Exception:
    _tree = None

if _tree is not None:
    class _InputVisitor(ast.NodeVisitor):
        def visit_Call(self, node):
            func = node.func
            if isinstance(func, ast.Name) and func.id == "input":
                _result["requiresInput"] = True
                prompt = ""
                if node.args:
                    first = node.args[0]
                    if isinstance(first, ast.Constant) and isinstance(first.value, str):
                        prompt = first.value
                _result["prompts"].append(prompt)
            self.generic_visit(node)

    _InputVisitor().visit(_tree)

if not _result["requiresInput"]:
    _patterns = (
        r"\\binput\\s*\\(",
        r"\\bsys\\s*\\.\\s*stdin\\s*\\.\\s*(?:read|readline|readlines)\\s*\\(",
        r"\\bstdin\\s*\\.\\s*(?:read|readline|readlines)\\s*\\(",
        r"\\bopen\\s*\\(\\s*0\\s*(?:,|\\))",
    )
    _result["requiresInput"] = any(re.search(pattern, _code) for pattern in _patterns)

json.dumps(_result)
`);
      const parsed = JSON.parse(String(raw));
      requiresInput = !!parsed?.requiresInput;
      detectedPrompts = Array.isArray(parsed?.prompts)
        ? parsed.prompts.filter((prompt: unknown): prompt is string => typeof prompt === 'string')
        : [];
    } catch {
      requiresInput = /\binput\s*\(|\bsys\s*\.\s*stdin\s*\.\s*(?:read|readline|readlines)\s*\(|\bstdin\s*\.\s*(?:read|readline|readlines)\s*\(|\bopen\s*\(\s*0\s*(?:,|\))/m.test(code);
      detectedPrompts = [];
    }

    if (!requiresInput) {
      return [] as string[];
    }

    const response = await requestOutputPanelInteraction(
      'python',
      'stdin',
      '',
      '',
      {
        transcriptPromptSequence: detectedPrompts,
        inputMode: 'buffered-lines',
        expectedLineCount: detectedPrompts.length > 0 ? detectedPrompts.length : null,
        submitLabel: 'Start Run',
        cancelLabel: 'Cancel Run',
      }
    );

    if (response === null) {
      throw new Error('Python execution cancelled while waiting for Output panel input.');
    }

    return String(response ?? '').replace(/\r\n/g, '\n').split('\n');
  };

  const buildJavaScriptProjectPreview = (
    projectFiles: ProjectSourceFile[],
    entryFile: ProjectSourceFile
  ) => {
    const urlByPath = new Map<string, string>();

    for (const file of projectFiles) {
      urlByPath.set(
        file.path,
        `data:text/javascript;charset=utf-8,${encodeURIComponent(file.content)}`
      );
    }

    const scopes: Record<string, Record<string, string>> = {};
    for (const file of projectFiles) {
      const importerUrl = urlByPath.get(file.path);
      if (!importerUrl) continue;

      const scopedImports: Record<string, string> = {};
      for (const specifier of extractJavaScriptModuleSpecifiers(file.content)) {
        const resolvedPath = resolveProjectRelativePath(file.path, specifier);
        const resolvedUrl = urlByPath.get(resolvedPath);
        if (!resolvedUrl) continue;
        scopedImports[specifier] = resolvedUrl;
      }

      if (Object.keys(scopedImports).length > 0) {
        scopes[importerUrl] = scopedImports;
      }
    }

    const runnerHtml = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>${escapeHtml(entryFile.name)}</title>
  <style>
    html, body {
      margin: 0;
      min-height: 100%;
      background: #0b1120;
      color: #e5e7eb;
      font-family: system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
    }
  </style>
  <script type="importmap">${JSON.stringify({ imports: {}, scopes })}</script>
</head>
<body>
  <script type="module">
    const formatValue = (value) => {
      if (typeof value === 'string') return value;
      try {
        return JSON.stringify(value, null, 2);
      } catch {
        return String(value);
      }
    };

    const host = document.createElement('codecraft-console-host');
    const shadowRoot = host.attachShadow({ mode: 'open' });
    shadowRoot.innerHTML = \`
      <style>
        :host {
          all: initial;
        }
        .console {
          position: fixed;
          left: 12px;
          right: 12px;
          bottom: 12px;
          max-height: 40vh;
          overflow: auto;
          box-sizing: border-box;
          padding: 12px 14px;
          border-radius: 14px;
          border: 1px solid rgba(148, 163, 184, 0.25);
          background: rgba(15, 23, 42, 0.88);
          color: #cbd5e1;
          font: 12px/1.5 "JetBrains Mono", "Fira Code", ui-monospace, SFMono-Regular, monospace;
          backdrop-filter: blur(16px);
          box-shadow: 0 18px 48px rgba(15, 23, 42, 0.35);
          z-index: 2147483647;
          white-space: pre-wrap;
        }
        .line + .line {
          margin-top: 6px;
        }
        .line[data-level="warn"] {
          color: #fbbf24;
        }
        .line[data-level="error"] {
          color: #fca5a5;
        }
        .line[data-level="status"] {
          color: #93c5fd;
        }
      </style>
      <div class="console" part="console"></div>
    \`;

    const consoleNode = shadowRoot.querySelector('.console');
    const appendLine = (level, text) => {
      if (!consoleNode) return;
      const line = document.createElement('div');
      line.className = 'line';
      line.dataset.level = level;
      line.textContent = String(text);
      consoleNode.appendChild(line);
      consoleNode.scrollTop = consoleNode.scrollHeight;
    };

    document.documentElement.appendChild(host);
    appendLine('status', 'Running JavaScript project: ${escapeHtml(entryFile.path)}');

    const originalConsole = window.console;
    window.console = {
      ...originalConsole,
      log: (...args) => appendLine('log', args.map(formatValue).join(' ')),
      warn: (...args) => appendLine('warn', args.map(formatValue).join(' ')),
      error: (...args) => appendLine('error', args.map(formatValue).join(' ')),
      clear: () => {
        if (consoleNode) {
          consoleNode.textContent = '';
        }
      },
    };

    window.addEventListener('error', (event) => {
      appendLine('error', event.error?.stack || event.message || 'Unhandled error');
    });

    window.addEventListener('unhandledrejection', (event) => {
      const reason = event.reason;
      appendLine('error', reason?.stack || reason?.message || String(reason));
    });

    try {
      await import(${JSON.stringify(urlByPath.get(entryFile.path) || '')});
      appendLine('status', 'JavaScript project finished.');
    } catch (error) {
      appendLine('error', error?.stack || error?.message || String(error));
    }
  </script>
</body>
</html>`;

    return {
      html: runnerHtml,
      objectUrls: [],
    };
  };

  const runJavaScriptProject = async (
    projectFiles: ProjectSourceFile[],
    entryFile: ProjectSourceFile
  ) => {
    setExecutionStartupStatus('');
    setOutput(`JavaScript project running from ${entryFile.path}. Console output appears in the Output preview.`);
    selectDockPanel('output');
    const preview = buildJavaScriptProjectPreview(projectFiles, entryFile);
    showOutputPreview(preview.html, preview.objectUrls);
  };

  const runHtmlProject = async (
    projectFiles: ProjectSourceFile[],
    entryFile: ProjectSourceFile
  ) => {
    setExecutionStartupStatus('');
    setOutput(
      projectFiles.length > 1
        ? `Previewing ${entryFile.path}. ${projectFiles.length - 1} additional HTML file(s) remain available as alternate entry pages.`
        : `Previewing ${entryFile.path}.`
    );
    selectDockPanel('output');
    showOutputPreview(entryFile.content);
  };

  const runJavaScript = async (code: string) => {
    setExecutionStartupStatus('');
    setOutput('');
    console.clear();

    const timeoutMs = normalizeExecutionTimeoutMs(settings.javascriptExecutionTimeoutMs);
    const mode = settings.javascriptExecutionMode;
    const ioMode = settings.javascriptIOMode;

    if (ioMode === 'interactive-output-panel') {
      selectDockPanel('output');
    }

    const workerSource = `
const formatValue = (value) => {
  if (typeof value === 'string') return value;
  try {
    return JSON.stringify(value, null, 2);
  } catch {
    return String(value);
  }
};

const post = (type, payload = {}) => self.postMessage({ type, ...payload });
const postStream = (level, message = '') => post('stream', {
  level,
  message: typeof message === 'string' ? message : String(message),
});
const runtimeState = {
  activeTimeouts: new Set(),
  activeIntervals: new Set(),
  pendingMicrotasks: 0,
  waiters: [],
  notify() {
    if (this.waiters.length === 0) return;
    const waiters = this.waiters.splice(0, this.waiters.length);
    waiters.forEach((resolve) => resolve());
  },
  hasActiveHandles() {
    return this.activeTimeouts.size > 0 || this.activeIntervals.size > 0 || this.pendingMicrotasks > 0;
  },
  waitForChange() {
    return new Promise((resolve) => {
      this.waiters.push(resolve);
    });
  },
};
const nativeSetTimeout = self.setTimeout.bind(self);
const nativeClearTimeout = self.clearTimeout.bind(self);
const nativeSetInterval = self.setInterval.bind(self);
const nativeClearInterval = self.clearInterval.bind(self);
const nativeQueueMicrotask = self.queueMicrotask.bind(self);
const registerTimer = (bucket, handle) => {
  bucket.add(handle);
  runtimeState.notify();
  return handle;
};
const unregisterTimer = (bucket, handle) => {
  if (bucket.delete(handle)) {
    runtimeState.notify();
  }
};
const queueMicrotask = (callback) => {
  runtimeState.pendingMicrotasks += 1;
  runtimeState.notify();
  nativeQueueMicrotask(() => {
    try {
      callback();
    } finally {
      runtimeState.pendingMicrotasks = Math.max(0, runtimeState.pendingMicrotasks - 1);
      runtimeState.notify();
    }
  });
};
self.queueMicrotask = queueMicrotask;
self.setTimeout = (callback, delay = 0, ...args) => {
  let handle;
  const wrapped = (...innerArgs) => {
    unregisterTimer(runtimeState.activeTimeouts, handle);
    return callback(...innerArgs);
  };
  handle = registerTimer(runtimeState.activeTimeouts, nativeSetTimeout(wrapped, delay, ...args));
  return handle;
};
self.clearTimeout = (handle) => {
  unregisterTimer(runtimeState.activeTimeouts, handle);
  return nativeClearTimeout(handle);
};
self.setInterval = (callback, delay = 0, ...args) => registerTimer(
  runtimeState.activeIntervals,
  nativeSetInterval(callback, delay, ...args)
);
self.clearInterval = (handle) => {
  unregisterTimer(runtimeState.activeIntervals, handle);
  return nativeClearInterval(handle);
};
const waitForRuntimeToSettle = async () => {
  while (true) {
    await Promise.resolve();
    if (!runtimeState.hasActiveHandles()) {
      await new Promise((resolve) => nativeSetTimeout(resolve, 0));
      await Promise.resolve();
      if (!runtimeState.hasActiveHandles()) {
        return;
      }
    }
    await runtimeState.waitForChange();
  }
};
const createProcessExitSignal = (code = 0) => ({
  __codecraftProcessExit: true,
  code: Number.isFinite(Number(code)) ? Math.trunc(Number(code)) : 0,
});
const createProcessStream = (level) => ({
  write: (chunk = '') => {
    postStream(level, chunk);
    return true;
  },
  clear: () => {},
  clearLine: () => {},
  cursorTo: () => {},
  moveCursor: () => {},
  isTTY: false,
  columns: 80,
  rows: 24,
});
const requestStdinValue = (message = 'JavaScript stdin requested.', defaultValue = '') => {
  const response = self.__codecraftRequestSyncIO(
    'stdin',
    String(message),
    defaultValue == null ? '' : String(defaultValue)
  );
  return response && Object.prototype.hasOwnProperty.call(response, 'value')
    ? (response.value == null ? null : String(response.value))
    : null;
};
const createProcessStdin = () => {
  const listeners = {
    data: [],
    readable: [],
    end: [],
    close: [],
    error: [],
  };
  const queue = [];
  let encoding = 'utf8';
  let destroyed = false;
  let ended = false;
  let paused = true;
  let flowing = false;
  let pumping = false;
  let readableFlowing = null;

  const getListeners = (event) => (
    Array.isArray(listeners[event]) ? listeners[event] : []
  );

  const listenerCount = (event) => getListeners(event).length;

  const emit = (event, ...args) => {
    const handlers = getListeners(event);
    if (handlers.length === 0) return false;
    let handled = false;
    const snapshot = [...handlers];
    snapshot.forEach((handler) => {
      handled = true;
      if (!getListeners(event).includes(handler)) return;
      if (handler && handler.__codecraftOnce) {
        api.off(event, handler);
      }
      try {
        handler(...args);
      } catch (error) {
        post('error', {
          message: error && error.stack ? String(error.stack) : (error && error.message ? String(error.message) : String(error))
        });
      }
    });
    return handled;
  };

  const updateFlowState = () => {
    api.readable = !destroyed;
    api.readableEnded = ended;
    api.destroyed = destroyed;
    api.readableFlowing = readableFlowing;
  };

  const toChunk = (text) => {
    const normalized = String(text);
    if (encoding != null) {
      return normalized;
    }
    const bytes = new TextEncoder().encode(normalized);
    try {
      Object.defineProperty(bytes, 'toString', {
        value: () => normalized,
        configurable: true,
      });
    } catch { }
    return bytes;
  };

  const finishStream = (event = 'end') => {
    if (ended) return;
    ended = true;
    flowing = false;
    paused = true;
    readableFlowing = false;
    updateFlowState();
    emit(event);
    emit('close');
  };

  const pullChunk = () => {
    if (destroyed || ended) return null;
    const raw = requestStdinValue();
    if (raw === null) {
      finishStream('end');
      return null;
    }
    return toChunk(raw);
  };

  const ensureBufferedChunk = () => {
    if (destroyed || ended) return null;
    if (queue.length > 0) return queue[0] ?? null;
    const chunk = pullChunk();
    if (chunk === null) return null;
    queue.push(chunk);
    emit('readable');
    return chunk;
  };

  const scheduleReadable = () => {
    if (destroyed || ended) return;
    if (queue.length > 0 || listenerCount('readable') === 0 || listenerCount('data') > 0) return;
    queueMicrotask(() => {
      if (destroyed || ended) return;
      if (queue.length > 0 || listenerCount('readable') === 0 || listenerCount('data') > 0) return;
      ensureBufferedChunk();
    });
  };

  const pump = () => {
    if (pumping || destroyed || ended || paused || !flowing || listenerCount('data') === 0) return;
    pumping = true;
    try {
      while (!destroyed && !ended && !paused && flowing && listenerCount('data') > 0) {
        const chunk = queue.length > 0 ? queue.shift() ?? null : pullChunk();
        if (chunk === null) {
          break;
        }
        emit('data', chunk);
      }
    } finally {
      pumping = false;
    }
  };

  const schedulePump = () => {
    if (destroyed || ended || paused || !flowing || listenerCount('data') === 0) return;
    queueMicrotask(() => {
      pump();
    });
  };

  const addHandler = (event, handler, prepend = false, once = false) => {
    if (typeof handler !== 'function') {
      return api;
    }
    const bucket = getListeners(event);
    if (!Array.isArray(bucket)) {
      return api;
    }
    const wrapped = once
      ? Object.assign((...args) => handler(...args), {
        __codecraftOnce: true,
        __codecraftOriginalHandler: handler,
      })
      : handler;
    if (prepend) {
      bucket.unshift(wrapped);
    } else {
      bucket.push(wrapped);
    }

    if (event === 'data') {
      paused = false;
      flowing = true;
      readableFlowing = true;
      updateFlowState();
      schedulePump();
    } else if (event === 'readable') {
      if (!flowing) {
        paused = true;
        readableFlowing = false;
        updateFlowState();
      }
      scheduleReadable();
    }

    return api;
  };

  const api = {
    isTTY: false,
    readable: true,
    readableEnded: false,
    readableFlowing: null,
    readableEncoding: encoding,
    destroyed: false,
    setEncoding: (value) => {
      encoding = value == null ? null : String(value);
      api.readableEncoding = encoding;
      for (let index = 0; index < queue.length; index += 1) {
        const queued = queue[index];
        queue[index] = typeof queued === 'string'
          ? toChunk(queued)
          : queued;
      }
      return api;
    },
    isPaused: () => paused,
    pause: () => {
      paused = true;
      flowing = false;
      readableFlowing = false;
      updateFlowState();
      return api;
    },
    resume: () => {
      if (destroyed || ended) return api;
      paused = false;
      flowing = true;
      readableFlowing = true;
      updateFlowState();
      schedulePump();
      return api;
    },
    read: () => {
      if (destroyed) return null;
      if (queue.length === 0) {
        ensureBufferedChunk();
      }
      return queue.length > 0 ? queue.shift() ?? null : null;
    },
    on: (event, handler) => addHandler(event, handler, false, false),
    addListener: (event, handler) => addHandler(event, handler, false, false),
    once: (event, handler) => addHandler(event, handler, false, true),
    prependListener: (event, handler) => addHandler(event, handler, true, false),
    prependOnceListener: (event, handler) => addHandler(event, handler, true, true),
    off: (event, handler) => {
      if (!Array.isArray(listeners[event])) return api;
      listeners[event] = listeners[event].filter((candidate) => (
        candidate !== handler
        && candidate?.__codecraftOriginalHandler !== handler
      ));
      if (event === 'data' && listenerCount('data') === 0) {
        flowing = false;
        paused = true;
        readableFlowing = false;
        updateFlowState();
      }
      return api;
    },
    removeListener: (event, handler) => api.off(event, handler),
    removeAllListeners: (event) => {
      if (typeof event === 'string' && Array.isArray(listeners[event])) {
        listeners[event] = [];
        return api;
      }
      Object.keys(listeners).forEach((key) => {
        listeners[key] = [];
      });
      flowing = false;
      paused = true;
      readableFlowing = false;
      updateFlowState();
      return api;
    },
    listeners: (event) => getListeners(event).map((handler) => handler?.__codecraftOriginalHandler || handler),
    listenerCount: (event) => listenerCount(event),
    emit: (event, ...args) => emit(event, ...args),
    destroy: () => {
      if (destroyed) return api;
      destroyed = true;
      flowing = false;
      paused = true;
      readableFlowing = false;
      updateFlowState();
      finishStream('end');
      return api;
    },
    [Symbol.asyncIterator]: () => ({
      next: async () => {
        const chunk = api.read();
        if (chunk === null) {
          return { value: undefined, done: true };
        }
        return { value: chunk, done: false };
      },
      return: async () => {
        api.pause();
        return { value: undefined, done: true };
      },
    }),
  };

  updateFlowState();
  return api;
};
const createProcessShim = () => {
  const nowSeconds = () => performance.now() / 1000;
  const normalizeExitCode = (code) => (
    Number.isFinite(Number(code)) ? Math.trunc(Number(code)) : 0
  );
  const hrtime = (previous) => {
    const totalNanoseconds = Math.floor(performance.now() * 1e6);
    const seconds = Math.floor(totalNanoseconds / 1e9);
    const nanoseconds = totalNanoseconds - seconds * 1e9;
    if (!Array.isArray(previous) || previous.length !== 2) {
      return [seconds, nanoseconds];
    }
    let diffSeconds = seconds - Number(previous[0] || 0);
    let diffNanoseconds = nanoseconds - Number(previous[1] || 0);
    if (diffNanoseconds < 0) {
      diffSeconds -= 1;
      diffNanoseconds += 1e9;
    }
    return [diffSeconds, diffNanoseconds];
  };
  const processShim = {
    env: Object.create(null),
    argv: [],
    browser: true,
    platform: 'browser',
    version: '',
    versions: {},
    arch: 'wasm32',
    exitCode: 0,
    cwd: () => '/',
    chdir: () => {
      throw new Error('process.chdir is not supported in CodeCraft\\'s JavaScript runtime.');
    },
    exit: (code = 0) => {
      processShim.exitCode = normalizeExitCode(code);
      throw createProcessExitSignal(processShim.exitCode);
    },
    nextTick: (callback, ...args) => queueMicrotask(() => callback(...args)),
    hrtime,
    uptime: nowSeconds,
    stdout: createProcessStream('stdout'),
    stderr: createProcessStream('stderr'),
    stdin: createProcessStdin(),
  };
  return processShim;
};
if (typeof self.global === 'undefined') {
  self.global = self;
}
if (typeof self.process === 'undefined') {
  self.process = createProcessShim();
}
self.__codecraftRequestSyncIO = (kind, message, defaultValue = '') => {
  if (typeof SharedArrayBuffer !== 'function') {
    throw new Error('SharedArrayBuffer is required for JavaScript runtime dialogs in worker execution.');
  }
  const headerBuffer = new SharedArrayBuffer(Int32Array.BYTES_PER_ELEMENT * 2);
  const payloadBuffer = new SharedArrayBuffer(262144);
  const header = new Int32Array(headerBuffer);
  post('io-request', { kind, message, defaultValue, headerBuffer, payloadBuffer });
  Atomics.wait(header, 0, 0);
  const payloadLength = Math.max(0, Atomics.load(header, 1));
  const sharedPayload = new Uint8Array(payloadBuffer, 0, payloadLength);
  const decodedPayload = new Uint8Array(payloadLength);
  decodedPayload.set(sharedPayload);
  const json = new TextDecoder().decode(decodedPayload);
  if (!json) return { value: null };
  const parsed = JSON.parse(json);
  if (parsed && parsed.__codecraftError) {
    throw new Error(parsed.__codecraftError);
  }
  return parsed;
};
self.alert = (message = '') => {
  self.__codecraftRequestSyncIO('alert', String(message));
};
self.confirm = (message = '') => {
  return Boolean(self.__codecraftRequestSyncIO('confirm', String(message)).value);
};
self.prompt = (message = '', defaultValue = '') => {
  const response = self.__codecraftRequestSyncIO(
    'prompt',
    String(message),
    defaultValue == null ? '' : String(defaultValue)
  );
  return response && Object.prototype.hasOwnProperty.call(response, 'value')
    ? response.value
    : null;
};
self.console = {
  log: (...args) => post('log', { level: 'log', message: args.map(formatValue).join(' ') }),
  error: (...args) => post('log', { level: 'error', message: '[ERROR] ' + args.map(formatValue).join(' ') }),
  warn: (...args) => post('log', { level: 'warn', message: '[WARN] ' + args.map(formatValue).join(' ') }),
  clear: () => {}
};

self.onmessage = async (event) => {
  const { code, mode } = event.data || {};
  try {
    let result;
    if (mode === 'async-function') {
      const AsyncFunction = Object.getPrototypeOf(async function () {}).constructor;
      const fn = new AsyncFunction(code);
      result = await fn();
    } else {
      const fn = new Function(code);
      result = fn();
      if (result && typeof result.then === 'function') {
        result = await result;
      }
    }
    if (result !== undefined) {
      post('result', { message: 'Return value: ' + formatValue(result) });
    }
    await waitForRuntimeToSettle();
    post('done');
  } catch (error) {
    if (error && error.__codecraftProcessExit) {
      post('done', { exitCode: error.code ?? 0 });
      return;
    }
    post('error', { message: error && error.stack ? String(error.stack) : (error && error.message ? String(error.message) : String(error)) });
  }
};
`;

    const workerUrl = URL.createObjectURL(new Blob([workerSource], { type: 'text/javascript' }));
    const worker = new Worker(workerUrl);
    let streamOutput = '';
    const applyJavaScriptStreamChunk = (chunk: string) => {
      const normalizedChunk = chunk.replace(/\r\n/g, '\n');
      let nextOutput = streamOutput;
      let index = 0;

      const trimCurrentLine = () => {
        const lastNewlineIndex = nextOutput.lastIndexOf('\n');
        nextOutput = lastNewlineIndex >= 0 ? nextOutput.slice(0, lastNewlineIndex + 1) : '';
      };

      while (index < normalizedChunk.length) {
        const clearIndex = normalizedChunk.indexOf('\x1b[2J', index);
        const homeIndex = normalizedChunk.indexOf('\x1b[H', index);
        const carriageReturnIndex = normalizedChunk.indexOf('\r', index);
        const controlIndexCandidates = [clearIndex, homeIndex, carriageReturnIndex].filter((value) => value >= 0);
        const nextControlIndex = controlIndexCandidates.length > 0 ? Math.min(...controlIndexCandidates) : -1;

        if (nextControlIndex === -1) {
          nextOutput += normalizedChunk.slice(index);
          break;
        }

        if (nextControlIndex > index) {
          nextOutput += normalizedChunk.slice(index, nextControlIndex);
        }

        if (nextControlIndex === clearIndex) {
          nextOutput = '';
          index = clearIndex + '\x1b[2J'.length;
          continue;
        }

        if (nextControlIndex === homeIndex) {
          nextOutput = '';
          index = homeIndex + '\x1b[H'.length;
          continue;
        }

        trimCurrentLine();
        index = carriageReturnIndex + 1;
      }

      streamOutput = nextOutput;
      setOutput(nextOutput);
    };

    try {
      await new Promise<void>((resolve, reject) => {
        let timeoutId: number | null = null;
        let finished = false;
        const finish = (callback: () => void) => {
          if (finished) return;
          finished = true;
          if (timeoutId != null) {
            clearTimeout(timeoutId);
          }
          worker.terminate();
          URL.revokeObjectURL(workerUrl);
          callback();
        };

        if (timeoutMs > 0) {
          timeoutId = window.setTimeout(() => {
            finish(() => reject(createExecutionTimeoutError('JavaScript execution', timeoutMs)));
          }, timeoutMs);
        }

        worker.onmessage = (event) => {
          const message = event.data || {};
          if (message.type === 'stream' && typeof message.message === 'string') {
            applyJavaScriptStreamChunk(message.message);
            return;
          }
          if (message.type === 'log' && typeof message.message === 'string') {
            setOutput(prev => prev + (prev ? '\n' : '') + message.message);
            return;
          }
          if (message.type === 'result' && typeof message.message === 'string') {
            setOutput(prev => prev + (prev ? '\n' : '') + message.message);
            return;
          }
          if (message.type === 'error' && typeof message.message === 'string') {
            finish(() => reject(new Error(message.message)));
            return;
          }
          if (
            message.type === 'io-request'
            && message.headerBuffer instanceof SharedArrayBuffer
            && message.payloadBuffer instanceof SharedArrayBuffer
          ) {
            void performRuntimeInteraction(
              'javascript',
              ioMode,
              message.kind === 'confirm'
                ? 'confirm'
                : message.kind === 'prompt'
                  ? 'prompt'
                  : message.kind === 'stdin'
                    ? 'stdin'
                    : 'alert',
              typeof message.message === 'string' ? message.message : '',
              typeof message.defaultValue === 'string' ? message.defaultValue : ''
            ).then((value) => {
              completeSharedBufferInteraction(
                message.headerBuffer,
                message.payloadBuffer,
                { value: value ?? null }
              );
            }).catch((error) => {
              completeSharedBufferInteraction(
                message.headerBuffer,
                message.payloadBuffer,
                { __codecraftError: error instanceof Error ? error.message : String(error) }
              );
            });
            return;
          }
          if (message.type === 'done') {
            finish(resolve);
          }
        };

        worker.onerror = (event) => {
          finish(() => reject(new Error(event.message || 'JavaScript execution failed.')));
        };

        worker.postMessage({ code, mode });
      });
    } catch (err) {
      setOutput(prev => prev + (prev ? '\n' : '') + `Runtime Error: ${err instanceof Error ? err.message : String(err)}`);
    }
  };

  const extractPyodideStubsDetailed = async (pkgName: string): Promise<PyodideStubExtractionResult> => {
    const pyodide = (window as any).pyodide;
    const stubLimitOverride = getSavedPyiImportSizeLimitOverride(pkgName);
    const resolvedStubLimit = resolveSavedPyiImportSizeLimit(pkgName);
    if (!pyodide) {
      return {
        folder: {},
        summary: {
          ...createEmptyPyodideStubExtractionSummary(pkgName, resolvedStubLimit),
          discovery: 'pyodide-not-loaded',
          phase: 'pyodide-not-loaded',
        },
      };
    }
    try {
      const json = await pyodide.runPythonAsync(`
import importlib, json, os, site, sys

def _extract(pkg_name):
    MAX_TOTAL = ${ABSOLUTE_PYI_IMPORT_SIZE_LIMIT_BYTES}
    USER_PYI_LIMIT = ${stubLimitOverride?.maxBytes == null && stubLimitOverride ? 'None' : JSON.stringify(resolvedStubLimit)}
    PY_MAX = MAX_TOTAL if USER_PYI_LIMIT is None else min(MAX_TOTAL, max(1, int(USER_PYI_LIMIT)))
    _names_to_try = list(dict.fromkeys([
        pkg_name,
        pkg_name.replace('-', '_').lower(),
        pkg_name.replace('-', '_'),
        pkg_name.lower(),
    ]))
    _summary = {
        "namesTried": list(_names_to_try),
        "discovery": "not-found",
        "scanDirCount": 0,
        "scanRoots": [],
        "stubLimit": PY_MAX,
        "maxTotal": MAX_TOTAL,
        "pyiCandidateCount": 0,
        "pyiTotalSize": 0,
        "nativeMinimalCandidateCount": 0,
        "nativeMinimalTotalSize": 0,
        "nativeCompressionAttempted": False,
        "generatedCandidateCount": 0,
        "generatedTotalSize": 0,
        "generatedMinimalCandidateCount": 0,
        "generatedMinimalTotalSize": 0,
        "generatedPhaseAttempted": False,
        "pyTotalSize": 0,
        "rawPhaseAttempted": False,
        "phase": "none",
        "returnedEntryCount": 0,
        "returnedTotalSize": 0,
        "returnedSamplePaths": [],
    }

    sys.path_importer_cache.clear()

    # Find package directories to scan
    scan_dirs = []  # list of (base_dir, rel_parent)

    def _entry_priority(item):
        rel, _content = item
        parts = rel.split('/')
        name = parts[-1] if parts else rel
        depth = max(0, len(parts) - 1)
        is_init = name in ('__init__.pyi', '__init__.py')
        is_root = depth == 0
        is_public = not name.startswith('_') or is_init
        is_typing_related = 'typing' in name
        return (
            0 if is_init else (1 if is_root else 2),
            0 if is_public else 1,
            0 if is_typing_related else 1,
            depth,
            len(rel),
            rel,
        )

    def _pack_entries(entries, limit):
        packed = {}
        packed_size = 0
        for rel, content in sorted(entries, key=_entry_priority):
            if packed_size + len(content) > limit:
                continue
            packed[rel] = content
            packed_size += len(content)
        return packed

    def _emit(files, phase, discovery=None):
        if discovery is not None:
            _summary["discovery"] = discovery
        _summary["phase"] = phase
        _summary["scanDirCount"] = len(scan_dirs)
        _summary["scanRoots"] = [base for base, _ in scan_dirs]
        _summary["returnedEntryCount"] = len(files)
        _summary["returnedTotalSize"] = sum(len(v) for v in files.values())
        _summary["returnedSamplePaths"] = [rel for rel, _content in sorted(files.items(), key=_entry_priority)[:8]]
        return {"files": files, "summary": _summary}

    # Try import first to get __path__
    for _n in _names_to_try:
        try:
            mod = importlib.import_module(_n)
            paths = getattr(mod, '__path__', None)
            if paths:
                _summary["discovery"] = "import-package"
                for base in paths:
                    scan_dirs.append((base, os.path.dirname(base)))
            else:
                f = getattr(mod, '__file__', None)
                if f and os.path.isfile(f):
                    with open(f, 'r', errors='replace') as fp:
                        content = fp.read()
                    return _emit({os.path.basename(f): content[:MAX_TOTAL]}, "import-single-py", "import-single-py")
            break
        except Exception:
            continue

    # Fallback: scan site-packages directly
    if not scan_dirs:
        sp_list = site.getsitepackages()
        for sp in sp_list:
            if not os.path.isdir(sp):
                continue
            for _n in _names_to_try:
                pkg_path = os.path.join(sp, _n)
                if os.path.isdir(pkg_path):
                    _summary["discovery"] = "site-packages-directory"
                    scan_dirs.append((pkg_path, sp))
                    break
                single = pkg_path + '.py'
                if os.path.isfile(single):
                    with open(single, 'r', errors='replace') as fp:
                        return _emit({_n + '.py': fp.read()[:MAX_TOTAL]}, "site-packages-single-py", "site-packages-single-py")
            if scan_dirs:
                break

    if not scan_dirs:
        return _emit({}, "not-found", "not-found")

    stub_limit = min(PY_MAX, MAX_TOTAL)

    # Phase 1B: generate .pyi stubs from .py files using ast
    import ast
    def _iter_named_targets(target):
        if isinstance(target, ast.Name):
            yield target.id
        elif isinstance(target, (ast.Tuple, ast.List)):
            for item in target.elts:
                yield from _iter_named_targets(item)

    def _collect_named_targets(targets):
        names = []
        for target in targets:
            names.extend(_iter_named_targets(target))
        return names

    def _make_stub(source):
        try:
            tree = ast.parse(source)
        except SyntaxError:
            return None
        lines = []
        for node in ast.iter_child_nodes(tree):
            if isinstance(node, ast.Import):
                lines.append(ast.unparse(node))
            elif isinstance(node, ast.ImportFrom):
                lines.append(ast.unparse(node))
            elif isinstance(node, ast.Assign):
                for name in _collect_named_targets(node.targets):
                    if node.type_comment:
                        lines.append(f'{name}: {node.type_comment}')
                    else:
                        lines.append(f'{name}: ...')
            elif isinstance(node, ast.AnnAssign) and node.target:
                for name in _iter_named_targets(node.target):
                    ann = ast.unparse(node.annotation)
                    lines.append(f'{name}: {ann}')
            elif isinstance(node, ast.FunctionDef) or isinstance(node, ast.AsyncFunctionDef):
                args = ast.unparse(node.args)
                ret = ''
                if node.returns:
                    ret = f' -> {ast.unparse(node.returns)}'
                prefix = 'async def ' if isinstance(node, ast.AsyncFunctionDef) else 'def '
                lines.append(f'{prefix}{node.name}({args}){ret}: ...')
            elif isinstance(node, ast.ClassDef):
                bases = ', '.join(ast.unparse(b) for b in node.bases)
                cls_lines = []
                for item in ast.iter_child_nodes(node):
                    if isinstance(item, (ast.FunctionDef, ast.AsyncFunctionDef)):
                        a = ast.unparse(item.args)
                        r = f' -> {ast.unparse(item.returns)}' if item.returns else ''
                        p = 'async def ' if isinstance(item, ast.AsyncFunctionDef) else 'def '
                        decs = ''
                        for d in item.decorator_list:
                            decs += f'    @{ast.unparse(d)}\\n'
                        cls_lines.append(f'{decs}    {p}{item.name}({a}){r}: ...')
                    elif isinstance(item, ast.AnnAssign) and item.target:
                        ann = ast.unparse(item.annotation)
                        for name in _iter_named_targets(item.target):
                            cls_lines.append(f'    {name}: {ann}')
                    elif isinstance(item, ast.Assign):
                        for target in item.targets:
                            for name in _iter_named_targets(target):
                                cls_lines.append(f'    {name}: ...')
                header = f'class {node.name}({bases}):' if bases else f'class {node.name}:'
                if cls_lines:
                    lines.append(header + '\\n' + '\\n'.join(cls_lines))
                else:
                    lines.append(header + ' ...')
        if not lines:
            return None
        return '\\n'.join(lines) + '\\n'

    def _make_minimal_stub(source):
        try:
            tree = ast.parse(source)
        except SyntaxError:
            return None
        lines = []

        def _append_minimal_var(name, indent=''):
            lines.append(f'{indent}{name} = ...')

        def _append_minimal_func(node, indent=''):
            prefix = 'async def ' if isinstance(node, ast.AsyncFunctionDef) else 'def '
            lines.append(f'{indent}{prefix}{node.name}(*args, **kwargs): ...')

        for node in ast.iter_child_nodes(tree):
            if isinstance(node, ast.Assign):
                for target in node.targets:
                    for name in _iter_named_targets(target):
                        _append_minimal_var(name)
            elif isinstance(node, ast.AnnAssign) and node.target:
                for name in _iter_named_targets(node.target):
                    _append_minimal_var(name)
            elif isinstance(node, (ast.FunctionDef, ast.AsyncFunctionDef)):
                _append_minimal_func(node)
            elif isinstance(node, ast.ClassDef):
                cls_lines = []
                for item in ast.iter_child_nodes(node):
                    if isinstance(item, ast.Assign):
                        for target in item.targets:
                            for name in _iter_named_targets(target):
                                cls_lines.append(f'    {name} = ...')
                    elif isinstance(item, ast.AnnAssign) and item.target:
                        for name in _iter_named_targets(item.target):
                            cls_lines.append(f'    {name} = ...')
                    elif isinstance(item, (ast.FunctionDef, ast.AsyncFunctionDef)):
                        prefix = 'async def ' if isinstance(item, ast.AsyncFunctionDef) else 'def '
                        cls_lines.append(f'    {prefix}{item.name}(*args, **kwargs): ...')
                if cls_lines:
                    lines.append(f'class {node.name}:\\n' + '\\n'.join(cls_lines))
                else:
                    lines.append(f'class {node.name}: ...')

        if not lines:
            return None
        return '\\n'.join(lines) + '\\n'

    # Phase 1: keep native .pyi files only if the full surface fits the cap
    pyi_total = 0
    pyi_candidate_count = 0
    pyi_entries = []
    for base, parent in scan_dirs:
        for root, dirs, files in os.walk(base):
            for fn in files:
                if not fn.endswith('.pyi'):
                    continue
                pyi_candidate_count += 1
                full = os.path.join(root, fn)
                rel = os.path.relpath(full, parent)
                try:
                    with open(full, 'r', errors='replace') as fp:
                        c = fp.read()
                    pyi_total += len(c)
                    pyi_entries.append((rel, c))
                except Exception:
                    pass
    _summary["pyiCandidateCount"] = pyi_candidate_count
    _summary["pyiTotalSize"] = pyi_total
    if pyi_entries:
        if pyi_total <= stub_limit:
            return _emit({rel: content for rel, content in sorted(pyi_entries, key=_entry_priority)}, "native-pyi-full")

    generated_entries = []
    generated_total_size = 0
    minimal_entries = []
    minimal_total_size = 0
    _summary["generatedPhaseAttempted"] = True

    for base, parent in scan_dirs:
        for root, dirs, files in os.walk(base):
            for fn in files:
                if not fn.endswith('.py'):
                    continue
                full = os.path.join(root, fn)
                rel = os.path.relpath(full, parent)
                stub_rel = rel[:-3] + '.pyi'
                try:
                    with open(full, 'r', errors='replace') as fp:
                        src = fp.read()
                    stub = _make_stub(src)
                    if stub:
                        generated_entries.append((stub_rel, stub))
                        generated_total_size += len(stub)
                    minimal_stub = _make_minimal_stub(src)
                    if minimal_stub:
                        minimal_entries.append((stub_rel, minimal_stub))
                        minimal_total_size += len(minimal_stub)
                except Exception:
                    pass

    _summary["generatedCandidateCount"] = len(generated_entries)
    _summary["generatedTotalSize"] = generated_total_size
    _summary["generatedMinimalCandidateCount"] = len(minimal_entries)
    _summary["generatedMinimalTotalSize"] = minimal_total_size
    if generated_entries or minimal_entries:
        if generated_entries and generated_total_size <= stub_limit:
            return _emit({rel: content for rel, content in sorted(generated_entries, key=_entry_priority)}, "generated-pyi-full")
        if minimal_entries:
            if minimal_total_size <= stub_limit:
                return _emit({rel: content for rel, content in sorted(minimal_entries, key=_entry_priority)}, "minimal-pyi-full")
            result = _pack_entries(minimal_entries, stub_limit)
            if result:
                return _emit(result, "minimal-pyi-partial")
        result = _pack_entries(generated_entries, stub_limit)
        if result:
            return _emit(result, "generated-pyi-partial")

    # Phase 2: fall back to .py files only if total .py size <= 200KB
    _summary["rawPhaseAttempted"] = True
    py_total_size = 0
    for base, parent in scan_dirs:
        for root, dirs, files in os.walk(base):
            for fn in files:
                if fn.endswith('.py'):
                    try:
                        py_total_size += os.path.getsize(os.path.join(root, fn))
                    except Exception:
                        pass
    _summary["pyTotalSize"] = py_total_size

    if py_total_size > PY_MAX:
        return _emit({}, "raw-py-too-large")

    result = {}
    total_size = 0
    for base, parent in scan_dirs:
        for root, dirs, files in os.walk(base):
            for fn in files:
                if not fn.endswith('.py'):
                    continue
                full = os.path.join(root, fn)
                rel = os.path.relpath(full, parent)
                try:
                    with open(full, 'r', errors='replace') as fp:
                        c = fp.read()
                    if total_size + len(c) > MAX_TOTAL:
                        continue
                    result[rel] = c
                    total_size += len(c)
                except Exception:
                    pass

    if result:
        return _emit(result, "raw-py-full")

    return _emit({}, "empty")

json.dumps(_extract(${JSON.stringify(pkgName)}))
`);
      const parsed = JSON.parse(json) as { files?: Record<string, string>, summary?: Partial<PyodideStubExtractionSummary> } | Record<string, string>;
      const flat = parsed && typeof parsed === 'object' && 'files' in parsed
        ? ((parsed as { files?: Record<string, string> }).files || {})
        : (parsed as Record<string, string>);
      const summary = {
        ...createEmptyPyodideStubExtractionSummary(pkgName, resolvedStubLimit),
        ...(parsed && typeof parsed === 'object' && 'summary' in parsed ? (parsed as { summary?: Partial<PyodideStubExtractionSummary> }).summary : {}),
      };
      const folder: UserFolder = {};
      for (const [path, content] of Object.entries(flat)) {
        const parts = path.split('/');
        let current = folder;
        for (let i = 0; i < parts.length - 1; i++) {
          if (!current[parts[i]] || typeof current[parts[i]] === 'string') {
            current[parts[i]] = {};
          }
          current = current[parts[i]] as UserFolder;
        }
        current[parts[parts.length - 1]] = content;
      }
      return { folder, summary };
    } catch {
      return {
        folder: {},
        summary: {
          ...createEmptyPyodideStubExtractionSummary(pkgName, resolvedStubLimit),
          discovery: 'error',
          phase: 'error',
        },
      };
    }
  };

  const extractPyodideStubs = async (pkgName: string): Promise<UserFolder> => {
    const { folder } = await extractPyodideStubsDetailed(pkgName);
    return folder;
  };

  const pyodideRestoredRef = useRef(false);
  const pyodideIdleTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pythonStubContributionsRef = useRef<Record<string, UserFolder>>({});
  const pyodideCachedPackageMetaRef = useRef<Record<string, CachedPyodidePackageMeta>>({});
  const pyodidePackageSnapshotRef = useRef<CachedPyodideEnvironmentSnapshot | null>(null);
  const pyodideStdlibSourceBufferRef = useRef<ArrayBuffer | null>(null);
  const pyodideFilteredStdlibUrlRef = useRef<string | null>(null);
  const pyodideFilteredStdlibSignatureRef = useRef('');
  const pyodideStdlibSurfaceSignatureRef = useRef('');
  const pyodideHostFrameRef = useRef<HTMLIFrameElement | null>(null);
  const pyodideScriptLoadPromiseRef = useRef<Promise<Window & typeof globalThis> | null>(null);
  const pyodideRuntimeSourceRef = useRef<{
    kind: 'cdn' | 'local';
    indexURL: string;
    lockFileURL: string;
    stdlibURL: string;
    scriptURL: string;
    packageBaseUrl: string;
  } | null>(null);
  const PYODIDE_IDLE_TIMEOUT = 60_000;
  const PYODIDE_RUNTIME_VERSION = '0.29.3';
  const PYODIDE_CDN_INDEX_URL = `https://cdn.jsdelivr.net/pyodide/v${PYODIDE_RUNTIME_VERSION}/full/`;
  const PYODIDE_LOCAL_INDEX_URL = new URL('pyodide/', document.baseURI).toString();
  const PYODIDE_RUNTIME_SOURCES = [
    {
      kind: 'cdn' as const,
      indexURL: PYODIDE_CDN_INDEX_URL,
      lockFileURL: `${PYODIDE_CDN_INDEX_URL}pyodide-lock.json`,
      stdlibURL: `${PYODIDE_CDN_INDEX_URL}python_stdlib.zip`,
      scriptURL: `${PYODIDE_CDN_INDEX_URL}pyodide.js`,
      packageBaseUrl: PYODIDE_CDN_INDEX_URL,
    },
    {
      kind: 'local' as const,
      indexURL: PYODIDE_LOCAL_INDEX_URL,
      lockFileURL: `${PYODIDE_LOCAL_INDEX_URL}pyodide-lock.json`,
      stdlibURL: `${PYODIDE_LOCAL_INDEX_URL}python_stdlib.zip`,
      scriptURL: `${PYODIDE_LOCAL_INDEX_URL}pyodide.js`,
      packageBaseUrl: PYODIDE_CDN_INDEX_URL,
    },
  ];
  const PYODIDE_INTERNAL_RUNTIME_MODULES = [
    '__future__', '_collections_abc', '_frozen_importlib', '_frozen_importlib_external', '_imp', '_io',
    '_pyodide', '_pyodide_core', '_sitebuiltins', '_stat', '_thread', 'abc', 'ast', 'base64', 'binascii', 'builtins', 'codecs',
    'collections', 'configparser', 'contextlib', 'copy', 'copyreg', 'dataclasses', 'email',
    'encodings', 'enum', 'fnmatch', 'functools', 'genericpath', 'glob', 'hashlib', 'html',
    'importlib', 'inspect', 'io', 'js', 'json', 'keyword', 'linecache', 'marshal', 'math', 'os',
    'pathlib', 'pkgutil', 'platform', 'posixpath', 'queue', 're', 'reprlib', 'shutil', 'site',
    'stat', 'string', 'struct', 'sys', 'sysconfig', 'tarfile', 'tempfile', 'textwrap',
    'threading', 'token', 'tokenize', 'traceback', 'types', 'typing', 'urllib', 'warnings',
    'weakref', 'zipfile', 'zipimport'
  ];

  const clearPyodideIdleTimer = () => {
    if (pyodideIdleTimerRef.current) {
      clearTimeout(pyodideIdleTimerRef.current);
      pyodideIdleTimerRef.current = null;
    }
  };

  const getPyodideHostWindow = () => (
    pyodideHostFrameRef.current?.contentWindow as (Window & typeof globalThis) | null
  );

  const getActivePyodideRuntimeSource = () => (
    pyodideRuntimeSourceRef.current ?? PYODIDE_RUNTIME_SOURCES[1]
  );

  const resolvePyodideRuntimeLoadSource = async () => {
    const activeSource = getActivePyodideRuntimeSource();
    if (activeSource.kind !== 'cdn') {
      return activeSource;
    }

    try {
      const probe = await fetch(activeSource.lockFileURL, {
        method: 'HEAD',
        cache: 'no-store',
      });
      if (probe.ok) {
        return activeSource;
      }
    } catch { }

    return PYODIDE_RUNTIME_SOURCES[1];
  };

  const destroyPyodideHostFrame = () => {
    pyodideScriptLoadPromiseRef.current = null;
    const frame = pyodideHostFrameRef.current;
    if (!frame) return;
    pyodideHostFrameRef.current = null;
    try {
      frame.src = 'about:blank';
    } catch { }
    try {
      frame.remove();
    } catch { }
  };

  const ensurePyodideHostWindow = async (): Promise<Window & typeof globalThis> => {
    const existing = getPyodideHostWindow();
    if (existing?.document?.head) {
      return existing;
    }

    const frame = document.createElement('iframe');
    frame.setAttribute('aria-hidden', 'true');
    frame.tabIndex = -1;
    frame.style.position = 'fixed';
    frame.style.width = '0';
    frame.style.height = '0';
    frame.style.border = '0';
    frame.style.opacity = '0';
    frame.style.pointerEvents = 'none';
    frame.style.visibility = 'hidden';

    (document.body || document.documentElement).appendChild(frame);
    const hostWindow = frame.contentWindow as (Window & typeof globalThis) | null;
    if (!hostWindow) {
      frame.remove();
      throw new Error('Failed to create the Pyodide runtime host.');
    }

    hostWindow.document.open();
    hostWindow.document.write('<!doctype html><html><head></head><body></body></html>');
    hostWindow.document.close();
    pyodideHostFrameRef.current = frame;
    return hostWindow;
  };

  const ensurePyodideScript = async (): Promise<Window & typeof globalThis> => {
    const hostWindow = await ensurePyodideHostWindow();
    if ((hostWindow as any).loadPyodide) {
      return hostWindow;
    }
    if (pyodideScriptLoadPromiseRef.current) {
      return pyodideScriptLoadPromiseRef.current;
    }

    const tryLoadScriptFromSource = (source: typeof PYODIDE_RUNTIME_SOURCES[number]) => (
      new Promise<Window & typeof globalThis>((resolve, reject) => {
        const script = hostWindow.document.createElement('script');
        script.src = source.scriptURL;
        script.async = true;
        script.onload = () => {
          pyodideRuntimeSourceRef.current = source;
          resolve(hostWindow);
        };
        script.onerror = () => {
          try {
            script.remove();
          } catch { }
          reject(new Error(`Failed to load Pyodide from ${source.kind}.`));
        };
        hostWindow.document.head.appendChild(script);
      })
    );

    pyodideScriptLoadPromiseRef.current = (async () => {
      let lastError: unknown = null;
      for (const source of PYODIDE_RUNTIME_SOURCES) {
        try {
          return await tryLoadScriptFromSource(source);
        } catch (error) {
          lastError = error;
        }
      }
      pyodideScriptLoadPromiseRef.current = null;
      throw (lastError instanceof Error ? lastError : new Error('Failed to load Pyodide.'));
    })();

    return pyodideScriptLoadPromiseRef.current;
  };

  const unloadPyodide = () => {
    clearPyodideIdleTimer();
    const hostWindow = getPyodideHostWindow();
    const py = (window as any).pyodide || (hostWindow as any)?.pyodide;
    if (py) {
      try {
        py.runPython(`
import gc
import sys

sys.path_importer_cache.clear()
sys.modules.clear()
gc.collect()
`);
      } catch { }
      try { py.FS?.syncfs?.(false, () => {}); } catch { }
      try { py.ffi?.destroy_proxies?.(); } catch { }
    }
    try {
      if (hostWindow) {
        (hostWindow as any).pyodide = undefined;
        (hostWindow as any).loadPyodide = undefined;
        hostWindow.stop?.();
      }
    } catch { }
    (window as any).pyodide = undefined;
    (window as any).loadPyodide = undefined;
    destroyPyodideHostFrame();
    pyodideRuntimeSourceRef.current = null;
    pyodideRestoredRef.current = false;
    pyodideStdlibSourceBufferRef.current = null;
    pyodideStdlibSurfaceSignatureRef.current = '';
    if (pyodideFilteredStdlibUrlRef.current) {
      URL.revokeObjectURL(pyodideFilteredStdlibUrlRef.current);
      pyodideFilteredStdlibUrlRef.current = null;
      pyodideFilteredStdlibSignatureRef.current = '';
    }
  };

  useEffect(() => () => {
    unloadPyodide();
  }, []);

  const resetPyodideIdleTimer = () => {
    clearPyodideIdleTimer();
    pyodideIdleTimerRef.current = setTimeout(unloadPyodide, PYODIDE_IDLE_TIMEOUT);
  };

  const persistPyodidePackageMetaCache = useCallback(async () => {
    try {
      await savePersistedPyodidePackageMetaCache(pyodideCachedPackageMetaRef.current);
    } catch (error) {
      console.warn('Failed to persist Python package language-support cache:', error);
    }
  }, []);

  const persistPyodidePackageSnapshot = useCallback(async () => {
    try {
      await savePersistedPyodidePackageSnapshot(pyodidePackageSnapshotRef.current);
    } catch (error) {
      console.warn('Failed to persist Pyodide package snapshot:', error);
    }
  }, []);

  const rememberCachedPyodidePackageMeta = useCallback((
    pkgName: string,
    version: string,
    source: PyodidePackageInstallSource,
    stubs: UserFolder
  ) => {
    const normalized = normalizeSavedPipPackageName(pkgName);
    const clonedStubs = cloneUserFolder(stubs);
    pyodideCachedPackageMetaRef.current[normalized] = {
      version,
      source,
      stubs: clonedStubs,
    };
    pythonStubContributionsRef.current[normalized] = cloneUserFolder(clonedStubs);
    void persistPyodidePackageMetaCache();
  }, [persistPyodidePackageMetaCache]);

  const forgetCachedPyodidePackageMeta = useCallback((pkgName: string) => {
    const normalized = normalizeSavedPipPackageName(pkgName);
    delete pyodideCachedPackageMetaRef.current[normalized];
    delete pythonStubContributionsRef.current[normalized];
    void persistPyodidePackageMetaCache();
  }, [persistPyodidePackageMetaCache]);

  const getCurrentPyodideSitePackagesPath = useCallback(async () => {
    const pyodide = (window as any).pyodide;
    if (!pyodide) throw new Error('Pyodide runtime is not loaded.');

    const json = await pyodide.runPythonAsync(`
import json
import site
import sys

try:
    _paths = site.getsitepackages()
except Exception:
    _paths = []

if not _paths:
    _paths = [next(
        (_path for _path in sys.path if _path and _path.endswith('site-packages')),
        "/lib/python{}.{}/site-packages".format(*sys.version_info[:2])
    )]

json.dumps(_paths[0])
`);
    return JSON.parse(json);
  }, []);

  const capturePyodidePackageRestoreSnapshot = useCallback(async (log?: (msg: string) => void) => {
    const pyodide = (window as any).pyodide;
    if (!pyodide) return;

    const savedPkgs = loadSavedPipPackages();
    if (savedPkgs.length === 0) {
      pyodidePackageSnapshotRef.current = null;
      await persistPyodidePackageSnapshot();
      return;
    }

    const sitePackagesPath = await getCurrentPyodideSitePackagesPath();
    const files = readPyodideFsTree(pyodide, sitePackagesPath);
    const packages: Record<string, CachedPyodidePackageMeta> = {};

    for (const pkg of savedPkgs) {
      const normalized = normalizeSavedPipPackageName(pkg.name);
      const cachedMeta = pyodideCachedPackageMetaRef.current[normalized];
      const stubs = cachedMeta?.stubs || pythonStubContributionsRef.current[normalized] || {};
      packages[normalized] = {
        version: pkg.version,
        source: cachedMeta?.source || 'micropip',
        stubs: cloneUserFolder(stubs),
      };
    }

    pyodidePackageSnapshotRef.current = {
      signature: buildSavedPipPackageSignature(savedPkgs),
      files,
      packages,
    };
    await persistPyodidePackageSnapshot();
    log?.(`Cached ${savedPkgs.length} package(s) in memory for fast restore.`);
  }, [getCurrentPyodideSitePackagesPath, persistPyodidePackageSnapshot]);

  const restorePyodidePackageRestoreSnapshot = useCallback(async (
    savedPkgs: SavedPipPackage[],
    log?: (msg: string) => void
  ): Promise<UserFolder | null> => {
    const pyodide = (window as any).pyodide;
    const snapshot = pyodidePackageSnapshotRef.current;
    if (!pyodide || !snapshot) return null;
    if (snapshot.signature !== buildSavedPipPackageSignature(savedPkgs)) return null;
    if (snapshot.files.length === 0) return null;

    const sitePackagesPath = await getCurrentPyodideSitePackagesPath();
    writePyodideFsTree(pyodide, sitePackagesPath, snapshot.files);
    await pyodide.runPythonAsync(`
import sys
sys.path_importer_cache.clear()
`);

    const prebuiltPackages = savedPkgs
      .filter(pkg => snapshot.packages[normalizeSavedPipPackageName(pkg.name)]?.source === 'pyodide-prebuilt')
      .map(pkg => pkg.name);
    if (prebuiltPackages.length > 0) {
      log?.(`Rehydrating ${prebuiltPackages.length} Pyodide prebuilt package(s): ${prebuiltPackages.join(', ')}...`);
      try {
        await pyodide.loadPackage(prebuiltPackages);
      } catch (error) {
        log?.(
          `Continuing with cached package snapshot after prebuilt package rehydrate failed: ` +
          `${error instanceof Error ? error.message : String(error)}`
        );
      }
    }

    const nextStubContributions: Record<string, UserFolder> = {};
    let mergedStubs: UserFolder = {};

    for (const pkg of savedPkgs) {
      const normalized = normalizeSavedPipPackageName(pkg.name);
      const cachedMeta = snapshot.packages[normalized];
      if (!cachedMeta) continue;

      rememberCachedPyodidePackageMeta(
        normalized,
        pkg.version || cachedMeta.version,
        cachedMeta.source,
        cachedMeta.stubs
      );

      if (!hasUserFolderEntries(cachedMeta.stubs)) continue;
      const clonedStubs = cloneUserFolder(cachedMeta.stubs);
      nextStubContributions[normalized] = clonedStubs;
      mergedStubs = { ...mergedStubs, ...clonedStubs };
    }

    pythonStubContributionsRef.current = nextStubContributions;
    await persistPyodidePackageMetaCache();
    log?.(`Restored ${savedPkgs.length} package(s) from cached package snapshot.`);
    return mergedStubs;
  }, [getCurrentPyodideSitePackagesPath, persistPyodidePackageMetaCache, rememberCachedPyodidePackageMeta]);

  const getAllowedPyodideStdlibModules = useCallback(() => (
    [...new Set([
      ...PYODIDE_INTERNAL_RUNTIME_MODULES,
      ...loadSavedPipIncludedModules(),
    ])].sort((a, b) => a.localeCompare(b))
  ), []);

  const ensureFilteredPyodideStdlibUrl = useCallback(async (log?: (msg: string) => void) => {
    const allowedModules = getAllowedPyodideStdlibModules();
    const runtimeSource = await resolvePyodideRuntimeLoadSource();
    const nextSignature = allowedModules.join('\n');
    if (
      pyodideFilteredStdlibSignatureRef.current === nextSignature
      && pyodideFilteredStdlibUrlRef.current
    ) {
      return pyodideFilteredStdlibUrlRef.current;
    }

    if (!pyodideStdlibSourceBufferRef.current) {
      log?.('Preparing filtered Pyodide standard library...');
      const stdlibRes = await fetch(runtimeSource.stdlibURL);
      if (!stdlibRes.ok) {
        throw new Error('Failed to download Pyodide standard library archive.');
      }
      pyodideStdlibSourceBufferRef.current = await stdlibRes.arrayBuffer();
    }

    const filteredZip = await buildFilteredPyodideStdlibZip(
      pyodideStdlibSourceBufferRef.current,
      new Set(allowedModules)
    );

    if (pyodideFilteredStdlibUrlRef.current) {
      URL.revokeObjectURL(pyodideFilteredStdlibUrlRef.current);
    }

    pyodideFilteredStdlibUrlRef.current = URL.createObjectURL(
      new Blob([filteredZip], { type: 'application/zip' })
    );
    pyodideFilteredStdlibSignatureRef.current = nextSignature;
    return pyodideFilteredStdlibUrlRef.current;
  }, [getAllowedPyodideStdlibModules]);

  const syncPyodideStdlibSurface = async (log?: (msg: string) => void) => {
    const pyodide = (window as any).pyodide;
    if (!pyodide) return;
    const allowedModules = getAllowedPyodideStdlibModules();
    const expandedAllowedModules = pyodideStdlibSourceBufferRef.current
      ? [...(await expandPyodideStdlibAllowedRoots(
        pyodideStdlibSourceBufferRef.current,
        new Set(allowedModules)
      )).expandedRoots].sort((a, b) => a.localeCompare(b))
      : allowedModules;

    const nextSignature = expandedAllowedModules.join('\n');
    if (pyodideStdlibSurfaceSignatureRef.current === nextSignature) {
      return;
    }

    const summaryJson = await pyodide.runPythonAsync(`
import json
import os
import re
import shutil
import sys
import sysconfig
import zipfile

_allowed = set(json.loads(${JSON.stringify(JSON.stringify(expandedAllowedModules))}))
_target_root = "/tmp/codecraft-stdlib"
_target_stdlib = os.path.join(_target_root, "stdlib")
_target_dynload = os.path.join(_target_stdlib, "lib-dynload")

if os.path.isdir(_target_root):
    shutil.rmtree(_target_root)
os.makedirs(_target_stdlib, exist_ok=True)
os.makedirs(_target_dynload, exist_ok=True)

def _stdlib_root_from_entry(name: str):
    first = name.split('/', 1)[0].strip()
    if not first or first in {"__pycache__", "site-packages", "lib-dynload"}:
        return None
    if first.endswith((".py", ".pyi")):
        return re.sub(r'\\.(pyi|py)$', '', first)
    return first

def _dynload_root_from_entry(name: str):
    base = os.path.basename(name).strip()
    if not base or base == "__pycache__":
        return None
    return re.sub(r'(\\.cpython-[^.]+)?\\.(so|pyd)$', '', base)

def _copy_file(src: str, dest: str):
    os.makedirs(os.path.dirname(dest), exist_ok=True)
    with open(src, 'rb') as _sf:
        _data = _sf.read()
    with open(dest, 'wb') as _df:
        _df.write(_data)

_stdlib_dir = sysconfig.get_paths().get('stdlib') or ''
_stdlib_parent = os.path.dirname(_stdlib_dir) if _stdlib_dir else ''
_dynload_dir = os.path.join(_stdlib_dir, 'lib-dynload') if _stdlib_dir else ''
_zip_paths = [
    _path for _path in list(sys.path)
    if _path
    and _path.endswith('.zip')
    and os.path.isfile(_path)
    and (
        os.path.basename(_path).startswith('python')
        or (_stdlib_parent and os.path.dirname(_path) == _stdlib_parent)
    )
]

_copied_roots = set()
_copied_dynload = set()

if _stdlib_dir and os.path.isdir(_stdlib_dir):
    for _entry in os.listdir(_stdlib_dir):
        _src = os.path.join(_stdlib_dir, _entry)
        if _entry == 'site-packages':
            continue
        if _entry == 'lib-dynload':
            if os.path.isdir(_src):
                for _dyn_entry in os.listdir(_src):
                    _root = _dynload_root_from_entry(_dyn_entry)
                    if _root and _root in _allowed:
                        _copy_file(os.path.join(_src, _dyn_entry), os.path.join(_target_dynload, _dyn_entry))
                        _copied_dynload.add(_root)
            continue

        _root = _stdlib_root_from_entry(_entry)
        if not _root or _root not in _allowed:
            continue

        _dest = os.path.join(_target_stdlib, _entry)
        if os.path.isdir(_src):
            shutil.copytree(_src, _dest, dirs_exist_ok=True)
        elif os.path.isfile(_src):
            _copy_file(_src, _dest)
        _copied_roots.add(_root)

for _zip_path in _zip_paths:
    try:
        with zipfile.ZipFile(_zip_path) as _zf:
            for _member in _zf.infolist():
                if _member.is_dir():
                    continue
                _name = _member.filename
                if _name.startswith('lib-dynload/'):
                    _root = _dynload_root_from_entry(_name)
                    if not _root or _root not in _allowed:
                        continue
                    _dest = os.path.join(_target_stdlib, _name)
                    os.makedirs(os.path.dirname(_dest), exist_ok=True)
                    with open(_dest, 'wb') as _df:
                        _df.write(_zf.read(_member))
                    _copied_dynload.add(_root)
                    continue

                _root = _stdlib_root_from_entry(_name)
                if not _root or _root not in _allowed:
                    continue
                _dest = os.path.join(_target_stdlib, _name)
                os.makedirs(os.path.dirname(_dest), exist_ok=True)
                with open(_dest, 'wb') as _df:
                    _df.write(_zf.read(_member))
                _copied_roots.add(_root)
    except Exception:
        pass

_removed_path_entries = set(_zip_paths)
if _stdlib_dir:
    _removed_path_entries.add(_stdlib_dir)
if _dynload_dir:
    _removed_path_entries.add(_dynload_dir)

_preserved_sys_path = [
    _path for _path in sys.path
    if _path not in _removed_path_entries
]
_next_sys_path = [_target_stdlib]
if os.path.isdir(_target_dynload) and os.listdir(_target_dynload):
    _next_sys_path.append(_target_dynload)
_next_sys_path.extend(_preserved_sys_path)
sys.path[:] = _next_sys_path

_removed_modules = []
def _is_stdlib_origin(origin):
    if not origin or origin in ('built-in', 'frozen'):
        return False
    _origin = str(origin)
    if _origin.startswith(_target_stdlib) or _origin.startswith(_target_dynload):
        return True
    if _stdlib_dir and _origin.startswith(_stdlib_dir):
        return True
    if _dynload_dir and _origin.startswith(_dynload_dir):
        return True
    for _zip_path in _zip_paths:
        if _origin.startswith(_zip_path) or os.path.basename(_zip_path) in _origin:
            return True
    return False

for _name in list(sys.modules.keys()):
    _root = _name.split('.', 1)[0]
    if not _root or _root in _allowed:
        continue
    _module = sys.modules.get(_name)
    _origin = getattr(getattr(_module, '__spec__', None), 'origin', None) if _module is not None else None
    if not _is_stdlib_origin(_origin):
        continue
    sys.modules.pop(_name, None)
    _removed_modules.append(_name)

sys.path_importer_cache.clear()

json.dumps({
    "allowed_count": len(_allowed),
    "copied_stdlib_roots": sorted(_copied_roots),
    "copied_dynload_roots": sorted(_copied_dynload),
    "removed_modules_count": len(_removed_modules),
})
`);

    pyodideStdlibSurfaceSignatureRef.current = nextSignature;

    try {
      const summary = JSON.parse(summaryJson);
      log?.(
        `Pyodide stdlib synced to ${summary.allowed_count} allowed top-level modules ` +
        `(${summary.copied_stdlib_roots.length} stdlib, ${summary.copied_dynload_roots.length} dynload).`
      );
    } catch {
      log?.('Pyodide stdlib surface updated.');
    }
  };

  const ensurePyodideWithPackages = async (log?: (msg: string) => void) => {
    if (pyodideEnsurePromiseRef.current) {
      await pyodideEnsurePromiseRef.current;
      return;
    }

    const ensurePromise = (async () => {
      clearPyodideIdleTimer();
      if (!(window as any).pyodide) {
        log?.('Loading Python runtime (Pyodide)... this may take a few seconds.');
        const hostWindow = await ensurePyodideScript();
        const runtimeSource = await resolvePyodideRuntimeLoadSource();
        const stdLibURL = await ensureFilteredPyodideStdlibUrl(log);
        const pyodide = await (hostWindow as any).loadPyodide({
          indexURL: runtimeSource.indexURL,
          lockFileURL: runtimeSource.lockFileURL,
          packageBaseUrl: runtimeSource.packageBaseUrl,
          enableRunUntilComplete: true,
          fullStdLib: false,
          stdLibURL,
        });
        (hostWindow as any).pyodide = pyodide;
        (window as any).loadPyodide = (hostWindow as any).loadPyodide;
        (window as any).pyodide = pyodide;
      }
      if (!pyodideRestoredRef.current) {
        pyodideRestoredRef.current = true;
        const savedPkgs = loadSavedPipPackages();
        let mergedStubs: UserFolder = {};

        if (savedPkgs.length > 0) {
          await ensurePersistedPyodidePackageSnapshotLoaded(savedPkgs);
          const restoredFromCache = await restorePyodidePackageRestoreSnapshot(savedPkgs, log);
          if (restoredFromCache) {
            mergedStubs = restoredFromCache;
          } else {
            const pyodide = (window as any).pyodide;
            const specs = savedPkgs.map(p => p.version ? `${p.name}==${p.version}` : p.name);
            const nextStubContributions: Record<string, UserFolder> = {};
            let restoredFromNetwork = false;

            log?.(`Restoring ${savedPkgs.length} package(s): ${specs.join(', ')}...`);
            try {
              await pyodide.loadPackage("micropip");
              const micropip = pyodide.pyimport("micropip");
              await micropip.install(specs, { keep_going: true });
              restoredFromNetwork = true;
              log?.(`Restored: ${specs.join(', ')}`);
            } catch (err) {
              log?.(`Warning: some packages could not be restored: ${err instanceof Error ? err.message : String(err)}`);
            }

            for (const pkg of savedPkgs) {
              const normalized = normalizeSavedPipPackageName(pkg.name);
              const cachedMeta = pyodideCachedPackageMetaRef.current[normalized];
              let stubs = cachedMeta?.stubs && hasUserFolderEntries(cachedMeta.stubs)
                ? cloneUserFolder(cachedMeta.stubs)
                : {};

              if (!hasUserFolderEntries(stubs)) {
                try {
                  stubs = await extractPyodideStubs(pkg.name);
                } catch {
                  alert('Failed to extract stubs from Pyodide package');
                  stubs = {};
                }
              }

              rememberCachedPyodidePackageMeta(
                pkg.name,
                pkg.version,
                cachedMeta?.source || 'micropip',
                stubs
              );

              if (!hasUserFolderEntries(stubs)) continue;
              nextStubContributions[normalized] = cloneUserFolder(stubs);
              mergedStubs = { ...mergedStubs, ...stubs };
            }

            pythonStubContributionsRef.current = nextStubContributions;
            await persistPyodidePackageMetaCache();

            if (restoredFromNetwork) {
              try {
                await capturePyodidePackageRestoreSnapshot(log);
              } catch (snapshotError) {
                log?.(`Warning: failed to cache restored packages in memory: ${snapshotError instanceof Error ? snapshotError.message : String(snapshotError)}`);
              }
            }
          }

          if (Object.keys(mergedStubs).length > 0) {
            log?.('Updating Pyright language support...');
            try {
              persistedPythonPackageStubsRestoredRef.current = true;
              const pyright = await ensurePythonAuthoringReady();
              await pyright.reloadPyrightWithStubs(mergedStubs);
              await refreshPythonDiagnostics();
            } catch { }
          }
        } else {
          pythonStubContributionsRef.current = {};
        }
      }
      await syncPyodideStdlibSurface(log);
      resetPyodideIdleTimer();
    })();

    pyodideEnsurePromiseRef.current = ensurePromise;
    try {
      await ensurePromise;
    } finally {
      if (pyodideEnsurePromiseRef.current === ensurePromise) {
        pyodideEnsurePromiseRef.current = null;
      }
    }
  };

  const syncInstalledPythonPackageSupport = useCallback(async (
    pkgName: string,
    version: string,
    source: PyodidePackageInstallSource,
    log: (msg: string) => void
  ) => {
    const normalized = normalizeSavedPipPackageName(pkgName);
    let stubs: UserFolder = {};

    addSavedPipPackage(pkgName, version);
    log('Updating editor language support...');
    log('  Extracting type stubs...');

    try {
      const extraction = await extractPyodideStubsDetailed(pkgName);
      stubs = extraction.folder;
      logPyodideStubExtractionSummary(pkgName, extraction.summary, log);
    } catch (extractErr) {
      log(`  Stub extraction error: ${extractErr instanceof Error ? extractErr.message : String(extractErr)}`);
      stubs = {};
    }

    rememberCachedPyodidePackageMeta(pkgName, version, source, stubs);
    await persistPyodidePackageMetaCache();

    if (hasUserFolderEntries(stubs)) {
      log('  Reloading Pyright LSP...');
      try {
        const hadPersistedPythonPackageStubs = persistedPythonPackageStubsRestoredRef.current;
        const pyright = await ensurePythonAuthoringReady();
        if (hadPersistedPythonPackageStubs) {
          await pyright.reloadPyrightWithStubs(stubs);
        }
      } catch (reloadErr) {
        log(`  Pyright reload error: ${reloadErr instanceof Error ? reloadErr.message : String(reloadErr)}`);
      }

      try {
        await refreshPythonDiagnostics();
      } catch (diagErr) {
        log(`  Diagnostics setup error: ${diagErr instanceof Error ? diagErr.message : String(diagErr)}`);
      }

      log(`Language support updated for ${pkgName}`);
    } else {
      delete pythonStubContributionsRef.current[normalized];
      log(`No type stubs found for ${pkgName} (import may still work)`);
    }

    try {
      await capturePyodidePackageRestoreSnapshot();
    } catch (snapshotErr) {
      log(`Warning: Could not cache installed packages for fast restore: ${snapshotErr instanceof Error ? snapshotErr.message : String(snapshotErr)}`);
    }
  }, [capturePyodidePackageRestoreSnapshot, ensurePythonAuthoringReady, extractPyodideStubs, persistPyodidePackageMetaCache, rememberCachedPyodidePackageMeta, refreshPythonDiagnostics]);

  const collectImportedPythonModules = async (code: string): Promise<string[]> => {
    const pyodide = (window as any).pyodide;
    if (!pyodide) return [];
    try {
      const json = await pyodide.runPythonAsync(`
import ast, json

_code = ${JSON.stringify(code)}
_imports = set()

try:
    _tree = ast.parse(_code)
except SyntaxError:
    _tree = None

if _tree is not None:
    for _node in ast.walk(_tree):
        if isinstance(_node, ast.Import):
            for _alias in _node.names:
                _root = (_alias.name or '').split('.')[0]
                if _root:
                    _imports.add(_root)
        elif isinstance(_node, ast.ImportFrom):
            if _node.module:
                _root = _node.module.split('.')[0]
                if _root:
                    _imports.add(_root)
        elif isinstance(_node, ast.Call):
            if isinstance(_node.func, ast.Name) and _node.func.id == '__import__' and _node.args:
                _arg = _node.args[0]
                if isinstance(_arg, ast.Constant) and isinstance(_arg.value, str):
                    _root = _arg.value.split('.')[0]
                    if _root:
                        _imports.add(_root)
            elif isinstance(_node.func, ast.Attribute) and _node.func.attr == 'import_module' and _node.args:
                _base = _node.func.value
                _arg = _node.args[0]
                if isinstance(_base, ast.Name) and _base.id == 'importlib' and isinstance(_arg, ast.Constant) and isinstance(_arg.value, str):
                    _root = _arg.value.split('.')[0]
                    if _root:
                        _imports.add(_root)

json.dumps(sorted(_imports))
`);
      return JSON.parse(json);
    } catch {
      return [];
    }
  };

  const ensurePyodideUsesTypeshedSurface = async (code: string) => {
    const importedModules = await collectImportedPythonModules(code);
    if (importedModules.length === 0) return;

    const pyright = await ensurePythonAuthoringReady();
    const allowedModules = new Set(await pyright.getCurrentPythonTypeModules());
    const missingModules = importedModules.filter(moduleName => !allowedModules.has(moduleName));

    if (missingModules.length > 0) {
      throw new Error(
        `Pyodide runtime is limited to modules that exist in the current typeshed/stub set. Missing: ${missingModules.join(', ')}. Use \`pip include <module>\` for stdlib modules or install a package that provides stubs first.`
      );
    }
  };

  const getCSharpScriptContextId = (fileId: string) => `codecraft-csharp-script:${fileId}`;

  const installPyodideExecutionTimeoutGuard = (pyodide: any, timeoutMs: number) => {
    const normalizedTimeout = normalizeExecutionTimeoutMs(timeoutMs);
    if (normalizedTimeout <= 0) return;

    const timeoutMessage = JSON.stringify(createExecutionTimeoutError('Python execution', normalizedTimeout).message);
    pyodide.runPython(`
import js
import sys

__codecraft_timeout_deadline_ms = js.performance.now() + ${normalizedTimeout}

class __CodeCraftPythonExecutionTimeout(Exception):
    pass

def __codecraft_timeout_trace(frame, event, arg):
    if event in ("call", "line") and js.performance.now() >= __codecraft_timeout_deadline_ms:
        raise __CodeCraftPythonExecutionTimeout(${JSON.stringify(PYODIDE_TIMEOUT_ERROR_MARKER)} + ":" + ${timeoutMessage})
    return __codecraft_timeout_trace

sys.settrace(__codecraft_timeout_trace)
`);
  };

  const clearPyodideExecutionTimeoutGuard = (pyodide: any) => {
    try {
      pyodide.runPython(`
import sys

sys.settrace(None)

for _name in (
    "__codecraft_timeout_trace",
    "__codecraft_timeout_deadline_ms",
    "__CodeCraftPythonExecutionTimeout",
):
    globals().pop(_name, None)
`);
    } catch { }
  };

  const normalizePythonExecutionError = (error: unknown, timeoutMs: number) => {
    const message = error instanceof Error ? error.message : String(error);
    if (message.includes(`${PYODIDE_TIMEOUT_ERROR_MARKER}:`)) {
      return createExecutionTimeoutError('Python execution', timeoutMs);
    }
    return error instanceof Error ? error : new Error(message);
  };

  const installPyodideInlineInputOverride = async (
    pyodide: any,
    requestInput: (prompt: string) => Promise<string | null>
  ) => {
    try {
      pyodide.globals.set('__codecraft_request_python_input_async', requestInput);
      await pyodide.runPythonAsync(`
import builtins
import io
import sys
from pyodide.ffi import can_run_sync, run_sync

__codecraft_original_input = builtins.input
__codecraft_original_stdin = sys.stdin
__codecraft_original___stdin__ = sys.__stdin__

class __CodeCraftInlineStdin(io.TextIOBase):
    encoding = "utf-8"
    errors = "strict"
    newlines = None
    name = "<stdin>"
    mode = "r"

    def __init__(self):
        self._buffer = ""

    def readable(self):
        return True

    def writable(self):
        return False

    def seekable(self):
        return False

    def isatty(self):
        return True

    @property
    def closed(self):
        return False

    def fileno(self):
        raise OSError("Interactive Output Panel stdin has no file descriptor.")

    def flush(self):
        return None

    def close(self):
        self._buffer = ""

    def _request_value(self, prompt=""):
        _request = globals().get("__codecraft_request_python_input_async")
        if _request is None:
            raise RuntimeError("Python input bridge is unavailable.")
        if not can_run_sync():
            raise RuntimeError("Python input bridge requires Promise integration.")
        _value = run_sync(_request("" if prompt is None else str(prompt)))
        if _value is None:
            raise EOFError("Python input cancelled.")
        return str(_value)

    def input(self, prompt=""):
        self._buffer = ""
        return self._request_value(prompt)

    def _read_line_from_panel(self):
        return self._request_value("") + "\\n"

    def readline(self, size=-1):
        if not self._buffer:
            self._buffer = self._read_line_from_panel()
        if size is None or size < 0:
            data = self._buffer
            self._buffer = ""
            return data
        data = self._buffer[:size]
        self._buffer = self._buffer[size:]
        return data

    def read(self, size=-1):
        if size == 0:
            return ""
        if size is None or size < 0:
            if not self._buffer:
                self._buffer = self._read_line_from_panel()
            data = self._buffer
            self._buffer = ""
            return data
        while len(self._buffer) < size:
            self._buffer += self._read_line_from_panel()
        data = self._buffer[:size]
        self._buffer = self._buffer[size:]
        return data

    def readlines(self, hint=-1):
        if hint == 0:
            return []
        return [self.readline()]

    def __iter__(self):
        return self

    def __next__(self):
        line = self.readline()
        if line == "":
            raise StopIteration
        return line

__codecraft_inline_stdin = __CodeCraftInlineStdin()

def __codecraft_inline_input(prompt=""):
    return __codecraft_inline_stdin.input(prompt)

builtins.input = __codecraft_inline_input
sys.stdin = __codecraft_inline_stdin
sys.__stdin__ = __codecraft_inline_stdin
`);
    } catch { }
  };

  const clearPyodideInlineInputOverride = (pyodide: any) => {
    try {
      pyodide.runPython(`
import builtins
import sys

if "__codecraft_original_input" in globals():
    builtins.input = __codecraft_original_input
if "__codecraft_original_stdin" in globals():
    sys.stdin = __codecraft_original_stdin
if "__codecraft_original___stdin__" in globals():
    sys.__stdin__ = __codecraft_original___stdin__

for _name in (
    "__codecraft_inline_input",
    "__CodeCraftInlineStdin",
    "__codecraft_inline_stdin",
    "__codecraft_original_input",
    "__codecraft_original_stdin",
    "__codecraft_original___stdin__",
    "__codecraft_request_python_input_async",
):
    globals().pop(_name, None)
`);
    } catch { }
    try {
      pyodide.globals.delete('__codecraft_request_python_input_async');
    } catch { }
  };

  const removePyodideFsPath = (pyodide: any, targetPath: string) => {
    try {
      const stat = pyodide.FS.stat(targetPath);
      if (pyodide.FS.isDir(stat.mode)) {
        const entries = pyodide.FS.readdir(targetPath);
        for (const entry of entries) {
          if (entry === '.' || entry === '..') continue;
          removePyodideFsPath(pyodide, `${targetPath}/${entry}`);
        }
        pyodide.FS.rmdir(targetPath);
        return;
      }
      if (pyodide.FS.isFile(stat.mode)) {
        pyodide.FS.unlink(targetPath);
      }
    } catch { }
  };

  const ensurePyodideDirectory = (pyodide: any, targetPath: string) => {
    const normalized = normalizeProjectPath(targetPath);
    let current = '';
    for (const part of normalized.split('/')) {
      if (!part) continue;
      current = current ? `${current}/${part}` : `/${part}`;
      try {
        pyodide.FS.mkdir(current);
      } catch { }
    }
  };

  const writePythonProjectFiles = (pyodide: any, rootPath: string, projectFiles: ProjectSourceFile[]) => {
    removePyodideFsPath(pyodide, rootPath);
    ensurePyodideDirectory(pyodide, rootPath);

    for (const file of projectFiles) {
      const fullPath = `${rootPath}/${file.path}`;
      const parentPath = dirnameProjectPath(fullPath);
      if (parentPath) {
        ensurePyodideDirectory(pyodide, parentPath);
      }
      pyodide.FS.writeFile(fullPath, file.content, { encoding: 'utf8' });
    }
  };

  const runPythonProject = async (
    projectFiles: ProjectSourceFile[],
    entryFile: ProjectSourceFile
  ) => {
    const timeoutMs = normalizeExecutionTimeoutMs(settings.pythonExecutionTimeoutMs);
    const pythonStdoutDecoder = new TextDecoder();
    const flushPythonStdout = () => {
      try {
        const remaining = pythonStdoutDecoder.decode();
        if (remaining) {
          setOutput(prev => prev + remaining);
        }
      } catch { }
    };

    try {
      if (settings.pythonIOMode === 'interactive-output-panel') {
        selectDockPanel('output');
      }
      await ensurePyodideWithPackages(appendExecutionStartupStatus);
      setExecutionStartupStatus('');
      clearPyodideIdleTimer();
      await ensurePyodideUsesTypeshedSurface(projectFiles.map(file => file.content).join('\n\n'));
      const pyodide = (window as any).pyodide;

      pyodide.setStdout({
        write: (buffer: Uint8Array) => {
          const safeBuffer = buffer.buffer instanceof SharedArrayBuffer ? new Uint8Array(buffer) : buffer;
          const text = pythonStdoutDecoder.decode(safeBuffer, { stream: true });
          if (text) {
            setOutput(prev => prev + text);
          }
          return buffer.length;
        },
      });
      pyodide.setStderr({
        batched: (text: string) => {
          setOutput(prev => prev + `[STDERR] ${text}`);
        },
      });
      setOutput('');
      console.clear();

      if (settings.pythonIOMode === 'interactive-output-panel') {
        pyodide.setStdin({
          stdin: () => {
            throw new Error('Python stdin must be read through the interactive Output panel.');
          },
          isatty: true,
        });
        await installPyodideInlineInputOverride(pyodide, requestPythonInteractiveOutputInput);
      } else {
        pyodide.setStdin({
          stdin: () => requestPythonInput(''),
          isatty: true
        });
      }

      const projectRoot = '/codecraft_project';
      writePythonProjectFiles(pyodide, projectRoot, projectFiles);
      appendExecutionStartupStatus(`Loaded ${projectFiles.length} Python project file(s).`);

      const entryPath = `${projectRoot}/${entryFile.path}`;
      const entryDir = entryPath.includes('/') ? entryPath.slice(0, entryPath.lastIndexOf('/')) || projectRoot : projectRoot;
      const runner = `
import os
import runpy
import sys

project_root = ${JSON.stringify(projectRoot)}
entry_path = ${JSON.stringify(entryPath)}
entry_dir = ${JSON.stringify(entryDir)}
previous_cwd = os.getcwd()

for candidate in (entry_dir, project_root):
    if candidate and candidate not in sys.path:
        sys.path.insert(0, candidate)

try:
    os.chdir(entry_dir or project_root)
    runpy.run_path(entry_path, run_name="__main__")
finally:
    os.chdir(previous_cwd)
`;

      installPyodideExecutionTimeoutGuard(pyodide, timeoutMs);
      await withExecutionTimeout(
        'Python execution',
        timeoutMs,
        () => pyodide.runPythonAsync(runner),
        async () => {
          unloadPyodide();
        }
      );

      flushPythonStdout();
    } catch (err) {
      setExecutionStartupStatus('');
      flushPythonStdout();
      const normalizedError = normalizePythonExecutionError(err, timeoutMs);
      setOutput(prev => prev + (prev ? '\n' : '') + `Python Error: ${normalizedError.message}`);
    } finally {
      flushPythonStdout();
      if ((window as any).pyodide) {
        clearPyodideInlineInputOverride((window as any).pyodide);
        clearPyodideExecutionTimeoutGuard((window as any).pyodide);
      }
      if (settings.pythonRuntimeLifecycle === 'keep-warm' && (window as any).pyodide) {
        resetPyodideIdleTimer();
      } else {
        unloadPyodide();
      }
    }
  };

  const runPython = async (code: string) => {
    const timeoutMs = normalizeExecutionTimeoutMs(settings.pythonExecutionTimeoutMs);
    const pythonStdoutDecoder = new TextDecoder();
    const flushPythonStdout = () => {
      try {
        const remaining = pythonStdoutDecoder.decode();
        if (remaining) {
          setOutput(prev => prev + remaining);
        }
      } catch { }
    };
    try {
      if (settings.pythonIOMode === 'interactive-output-panel') {
        selectDockPanel('output');
      }
      await ensurePyodideWithPackages(appendExecutionStartupStatus);
      setExecutionStartupStatus('');
      clearPyodideIdleTimer();
      await ensurePyodideUsesTypeshedSurface(code);
      const pyodide = (window as any).pyodide;

      pyodide.setStdout({
        write: (buffer: Uint8Array) => {
          const safeBuffer = buffer.buffer instanceof SharedArrayBuffer ? new Uint8Array(buffer) : buffer;
          const text = pythonStdoutDecoder.decode(safeBuffer, { stream: true });
          if (text) {
            setOutput(prev => prev + text);
          }
          return buffer.length;
        },
      });
      pyodide.setStderr({
        batched: (text: string) => {
          setOutput(prev => prev + `[STDERR] ${text}`);
        },
      });
      setOutput('');
      console.clear();
      if (settings.pythonIOMode === 'interactive-output-panel') {
        pyodide.setStdin({
          stdin: () => {
            throw new Error('Python stdin must be read through the interactive Output panel.');
          },
          isatty: true,
        });
        await installPyodideInlineInputOverride(pyodide, requestPythonInteractiveOutputInput);
      } else {
        pyodide.setStdin({
          stdin: () => requestPythonInput(''),
          isatty: true
        });
      }

      installPyodideExecutionTimeoutGuard(pyodide, timeoutMs);
      const result = await withExecutionTimeout(
        'Python execution',
        timeoutMs,
        () => pyodide.runPythonAsync(code),
        async () => {
          unloadPyodide();
        }
      );

      flushPythonStdout();
      if (result !== undefined) {
        setOutput(prev => prev + (prev ? '\n' : '') + `Return value: ${String(result)}`);
      }
    } catch (err) {
      setExecutionStartupStatus('');
      flushPythonStdout();
      const normalizedError = normalizePythonExecutionError(err, timeoutMs);
      setOutput(prev => prev + (prev ? '\n' : '') + `Python Error: ${normalizedError.message}`);
    } finally {
      flushPythonStdout();
      if ((window as any).pyodide) {
        clearPyodideInlineInputOverride((window as any).pyodide);
        clearPyodideExecutionTimeoutGuard((window as any).pyodide);
      }
      if (settings.pythonRuntimeLifecycle === 'keep-warm' && (window as any).pyodide) {
        resetPyodideIdleTimer();
      } else {
        unloadPyodide();
      }
    }
  };

  const ensureCSharpRuntime = async () => {
    if (csharpRuntimeReadyRef.current) return csharpRuntimeReadyRef.current;

    csharpRuntimeReadyRef.current = new Promise<void>((resolve, reject) => {
      let settled = false;
      const settle = (success: boolean, error?: Error) => {
        if (settled) return;
        settled = true;
        if (success) resolve();
        else reject(error || new Error('Failed to initialize C# WebAssembly runtime.'));
      };

      void getBrowserCSharpModule()
        .then(({ BrowserCSharp }) => {
          BrowserCSharp.OnReady((success) => {
            settle(success, new Error('C# WebAssembly runtime failed to load.'));
          });

          const scriptId = 'codecraft-csharp-wasm-loader';
          if (document.getElementById(scriptId)) return;

          const script = document.createElement('script');
          script.id = scriptId;
          script.src = '/_framework/blazor.webassembly.js';
          script.async = true;
          script.onerror = () => settle(false, new Error('Unable to load blazor.webassembly.js for C# runtime.'));
          document.body.appendChild(script);
        })
        .catch((error) => {
          settle(false, error instanceof Error ? error : new Error(String(error)));
        });
    });

    return csharpRuntimeReadyRef.current;
  };

  const runCSharp = async (code: string, fileId: string) => {
    try {
      if (settings.csharpIOMode === 'interactive-output-panel') {
        selectDockPanel('output');
      }
      setOutput('');
      console.clear();
      const modeLabel =
        settings.csharpExecutionMode === 'regular'
          ? 'regular program'
          : settings.csharpExecutionMode === 'script'
            ? 'script'
            : 'script context';
      setExecutionStartupStatus(`Compiling and executing C# (WebAssembly, ${modeLabel})...`);

      await ensureCSharpRuntime();
      const { BrowserCSharp } = await getBrowserCSharpModule();
      const contextId = getCSharpScriptContextId(fileId);

      const executeCSharp = async () => {
        if (settings.csharpExecutionMode === 'script-context') {
          if (settings.csharpResetScriptContextBeforeRun) {
            try {
              await BrowserCSharp.clearScriptContext(contextId);
            } catch { }
          }
          return BrowserCSharp.executeScriptInContext(code, contextId);
        }
        if (settings.csharpExecutionMode === 'script') {
          return BrowserCSharp.ExecuteScript(code);
        }
        return BrowserCSharp.executeRegular(code);
      };

      setExecutionStartupStatus('');
      const result = await withExecutionTimeout(
        'C# execution',
        settings.csharpExecutionTimeoutMs,
        executeCSharp,
        async () => {
          if (settings.csharpExecutionMode === 'script-context') {
            try {
              await BrowserCSharp.clearScriptContext(contextId);
            } catch { }
          }
        }
      );

      const stdOut = (result.stdOut || '').trim();
      const stdErr = (result.stdErr || '').trim();
      const returnValue = result.result;

      const chunks: string[] = [];
      if (stdErr) chunks.push(stdErr);
      if (stdOut) chunks.push(stdOut);
      if (returnValue !== undefined && returnValue !== null && String(returnValue).trim()) {
        chunks.push(`Return value: ${String(returnValue)}`);
      }

      setOutput(chunks.join('\n') || 'C# executed successfully with no output.');
    } catch (err) {
      setExecutionStartupStatus('');
      setOutput(`C# Error: ${err instanceof Error ? err.message : String(err)}`);
    }
  };

  const runCSharpProject = async (
    projectFiles: ProjectSourceFile[],
    entryFile: ProjectSourceFile
  ) => {
    try {
      if (settings.csharpIOMode === 'interactive-output-panel') {
        selectDockPanel('output');
      }
      setOutput('');
      console.clear();
      setExecutionStartupStatus(`Compiling C# project (${projectFiles.length} file${projectFiles.length === 1 ? '' : 's'})...`);

      await ensureCSharpRuntime();
      const { BrowserCSharp } = await getBrowserCSharpModule();
      const note = settings.csharpExecutionMode === 'regular'
        ? ''
        : ' Project run uses regular C# compilation.';
      setExecutionStartupStatus(`Compiling and executing C# project from ${entryFile.path}.${note}`);

      const result = await withExecutionTimeout(
        'C# execution',
        settings.csharpExecutionTimeoutMs,
        () => BrowserCSharp.executeRegularProject(
          projectFiles.map(file => file.path),
          projectFiles.map(file => file.content),
          entryFile.path
        )
      );

      const stdOut = (result.stdOut || '').trim();
      const stdErr = (result.stdErr || '').trim();
      const returnValue = result.result;

      const chunks: string[] = [];
      if (stdErr) chunks.push(stdErr);
      if (stdOut) chunks.push(stdOut);
      if (returnValue !== undefined && returnValue !== null && String(returnValue).trim()) {
        chunks.push(`Return value: ${String(returnValue)}`);
      }

      setExecutionStartupStatus('');
      setOutput(chunks.join('\n') || 'C# project executed successfully with no output.');
    } catch (err) {
      setExecutionStartupStatus('');
      setOutput(`C# Error: ${err instanceof Error ? err.message : String(err)}`);
    }
  };

  const runWithExecutionLifecycle = async (executor: () => Promise<void>) => {
    setIsRunning(true);

    setExecutionStartupStatus('');
    if (settings.clearOutputOnRun) {
      setOutput('');
      setExecutionStartupStatus('Starting execution...');
    } else {
      const divisor = settings.showExecutionDivisor
        ? `\n\n${'='.repeat(20)} EXECUTION: ${new Date().toLocaleTimeString()} ${'='.repeat(20)}\n`
        : '\n';
      setExecutionStartupStatus(`${divisor}Starting execution...`);
    }

    try {
      await executor();
    } catch (error) {
      setExecutionStartupStatus('');
      setOutput(`Error: ${error instanceof Error ? error.message : 'Execution failed'}`);
    } finally {
      setIsRunning(false);
    }
  };

  const handleRun = async () => {
    const currentFile = activeRunnableFile;
    if (!currentFile) {
      clearOutputPreview();
      setExecutionStartupStatus('');
      setOutput('Error: Select a runnable C#, Python, HTML, or JavaScript file first.');
      return;
    }

    await runWithExecutionLifecycle(async () => {
      const runtimeLanguage = normalizeProjectRuntimeLanguage(currentFile.language);
      const projectFiles = toProjectSourceFiles([currentFile]);
      const entryFile = projectFiles[0] ?? null;

      if (!runtimeLanguage || !entryFile) {
        clearOutputPreview();
        setExecutionStartupStatus('');
        setOutput('Error: The current file could not be prepared for execution.');
        return;
      }

      if (runtimeLanguage === 'javascript') {
        clearOutputPreview();
        await runJavaScript(entryFile.content);
        return;
      }

      if (runtimeLanguage === 'python') {
        clearOutputPreview();
        await runPython(entryFile.content);
        return;
      }

      if (runtimeLanguage === 'html') {
        await runHtmlProject(projectFiles, entryFile);
        return;
      }

      if (runtimeLanguage === 'csharp') {
        clearOutputPreview();
        await runCSharp(entryFile.content, entryFile.id);
        return;
      }

      clearOutputPreview();
      setExecutionStartupStatus('');
      setOutput(`Error: No local runtime available for ${runtimeLanguage}. Supported: HTML, JavaScript, Python, and C#.`);
    });
  };

  const handleProjectRun = async () => {
    const selectedFiles = resolvedProjectRun.selectedFiles;
    const entryItem = resolvedProjectRun.entryFile;
    const runtimeLanguage = resolvedProjectRun.language;
    const runError = resolvedProjectRun.error;

    if (!entryItem || !runtimeLanguage || runError) {
      clearOutputPreview();
      setExecutionStartupStatus('');
      setOutput(`Error: ${runError || 'Project run is not configured yet.'}`);
      return;
    }

    await runWithExecutionLifecycle(async () => {
      const projectFiles = toProjectSourceFiles(selectedFiles);
      const entryFile = projectFiles.find(file => file.id === entryItem.id) ?? null;

      if (!entryFile) {
        clearOutputPreview();
        setExecutionStartupStatus('');
        setOutput('Error: The configured entry file is no longer part of the selected project run files.');
        return;
      }

      if (runtimeLanguage === 'javascript') {
        await runJavaScriptProject(projectFiles, entryFile);
        return;
      }

      if (runtimeLanguage === 'python') {
        clearOutputPreview();
        await runPythonProject(projectFiles, entryFile);
        return;
      }

      if (runtimeLanguage === 'html') {
        await runHtmlProject(projectFiles, entryFile);
        return;
      }

      if (runtimeLanguage === 'csharp') {
        clearOutputPreview();
        await runCSharpProject(projectFiles, entryFile);
        return;
      }

      clearOutputPreview();
      setExecutionStartupStatus('');
      setOutput(`Error: No local runtime available for ${runtimeLanguage}. Supported: HTML, JavaScript, Python, and C#.`);
    });
  };

  const isDescendant = (descendantId: string, ancestorId: string) => {
    let cursorId: string | null = descendantId;
    while (cursorId) {
      if (cursorId === ancestorId) return true;
      const item = files.find(f => f.id === cursorId);
      cursorId = item?.parentId || null;
    }
    return false;
  };

  const appendAssistantMessage = (chatId: string, message: ChatMessage) => {
    setAssistantChats(prev => prev.map(chat =>
      chat.id === chatId
        ? { ...chat, messages: [...chat.messages, message] }
        : chat
    ));
  };

  const autoNameAssistantChat = (prompt: string) => {
    const words = prompt.trim().replace(/\s+/g, ' ').split(' ').filter(Boolean).slice(0, 5);
    if (words.length === 0) return DEFAULT_ASSISTANT_CHAT_NAME;
    const base = words.join(' ');
    return base.length > 42 ? `${base.slice(0, 39).trim()}...` : base;
  };

  const updateAssistantTabName = (chatId: string, newName: string) => {
    setAssistantChats(prev => prev.map(chat => chat.id === chatId ? { ...chat, name: newName } : chat));
    const jsonModel = layoutModel.toJson() as IJsonModel;
    const assistantTabIds: string[] = [];
    const collectAssistantTabIds = (node: any) => {
      if (node.type === 'tab' && node.component === 'assistant' && node.config?.chatId === chatId) {
        assistantTabIds.push(node.id);
      }
      for (const child of node.children || []) {
        collectAssistantTabIds(child);
      }
    };
    collectAssistantTabIds(jsonModel.layout);
    assistantTabIds.forEach(tabId => layoutModel.doAction(Actions.updateNodeAttributes(tabId, { name: newName })));
  };

  const createAssistantChatWindow = () => {
    const chatId = createAssistantChatId();
    setAssistantChats(prev => [...prev, {
      id: chatId,
      name: DEFAULT_ASSISTANT_CHAT_NAME,
      messages: []
    }]);
    setAssistantInputs(prev => ({ ...prev, [chatId]: '' }));

    openAssistantChatTab(chatId);
  };

  const findAssistantTabByChatId = (node: any, chatId: string): any => {
    if (node.type === 'tab' && node.component === 'assistant' && node.config?.chatId === chatId) {
      return node;
    }
    for (const child of node.children || []) {
      const found = findAssistantTabByChatId(child, chatId);
      if (found) return found;
    }
    return null;
  };

  const openAssistantChatTab = (chatId: string) => {
    const jsonModel = layoutModel.toJson() as IJsonModel;
    const existingTab = findAssistantTabByChatId(jsonModel.layout, chatId);
    if (existingTab?.id) {
      layoutModel.doAction(Actions.selectTab(existingTab.id));
      return;
    }
    const assistantTabset = findTabsetContainingComponent(jsonModel.layout, 'assistant');
    const chatName = assistantChats.find(c => c.id === chatId)?.name || DEFAULT_ASSISTANT_CHAT_NAME;
    const newTab = {
      type: 'tab',
      id: `assistant-panel-tab-${chatId}`,
      name: chatName,
      component: 'assistant',
      config: { chatId },
      enableClose: true
    };

    if (assistantTabset?.id) {
      layoutModel.doAction(Actions.addNode(newTab, assistantTabset.id, DockLocation.CENTER, -1, true));
      return;
    }
    const editorTabsetId = resolveEditorTabsetId(jsonModel);
    if (!editorTabsetId) return;
    layoutModel.doAction(Actions.addNode(newTab, editorTabsetId, DockLocation.RIGHT, -1, true));
  };

  const handleLayoutAction = (action: any) => {
    if (action?.type === Actions.DELETE_TAB) {
      const closingTabId = action.data?.node;
      const closingNode: any = closingTabId ? layoutModel.getNodeById(closingTabId) : undefined;
      if (
        closingNode?.getType?.() === 'tab'
        && closingNode.getComponent?.() === 'editor'
        && !closingNode.getConfig?.()?.isFallback
      ) {
        const parent: any = closingNode.getParent?.();
        const siblings: any[] = parent?.getChildren?.() || [];
        const normalEditorTabs = siblings.filter((child: any) =>
          child?.getType?.() === 'tab'
          && child.getComponent?.() === 'editor'
          && !child.getConfig?.()?.isFallback
        );

        if (normalEditorTabs.length === 1) {
          setActiveFileId('');
          skipEditorSyncRef.current = true;
          const parentTabsetId = parent?.getId?.();
          if (parentTabsetId) {
            layoutModel.doAction(Actions.addNode(
              buildFallbackEditorTab(),
              parentTabsetId, DockLocation.CENTER, -1, true
            ));
          }
          skipEditorSyncRef.current = false;
          return action;
        }
      }
    }

    return action;
  };

  const syncAssistantChatsWithLayout = (_model?: Model, action?: any) => {
    const jsonModel = layoutModel.toJson() as IJsonModel;
    const assistantChatIds = new Set<string>();
    let selectedEditorItemId: string | null = null;
    let selectedEditorTabId: string | null = null;
    let hasSelectedEditorTab = false;

    const collectLayoutState = (node: any) => {
      if (node.type === 'tab' && node.component === 'assistant' && typeof node.config?.chatId === 'string') {
        assistantChatIds.add(node.config.chatId);
      }
      if (node.type === 'tabset' && node.children?.length > 0) {
        const selectedIndex = typeof node.selected === 'number' ? node.selected : 0;
        const selectedTab = node.children[selectedIndex];
        if (selectedTab?.component === 'editor') {
          hasSelectedEditorTab = true;
          selectedEditorTabId = typeof selectedTab.id === 'string' ? selectedTab.id : null;
          selectedEditorItemId = typeof selectedTab.config?.itemId === 'string' ? selectedTab.config.itemId : null;
        }
      }
      for (const child of node.children || []) {
        collectLayoutState(child);
      }
    };

    collectLayoutState(jsonModel.layout);
    localStorage.setItem(STORAGE_KEYS.layout, JSON.stringify(jsonModel));
    if (assistantChatIds.size > 0) {
      setAssistantChats(prev => {
        const existingIds = new Set(prev.map(chat => chat.id));
        const missingChats = Array.from(assistantChatIds)
          .filter(chatId => !existingIds.has(chatId))
          .map(chatId => ({ id: chatId, name: DEFAULT_ASSISTANT_CHAT_NAME, messages: [] }));
        return missingChats.length > 0 ? [...prev, ...missingChats] : prev;
      });
      setAssistantInputs(prev => {
        const next = { ...prev };
        assistantChatIds.forEach(chatId => {
          if (next[chatId] === undefined) next[chatId] = '';
        });
        return next;
      });
    }
    if (skipEditorSyncRef.current) return;
    setActiveEditorTabId(selectedEditorTabId);
    setActiveFileId(hasSelectedEditorTab ? (selectedEditorItemId || '') : '');
  };

  useEffect(() => {
    syncAssistantChatsWithLayout();
  }, []);

  useEffect(() => {
    const jsonModel = layoutModel.toJson() as IJsonModel;
    const tabNameUpdates: { id: string; name: string }[] = [];
    const collectEditorTabNameUpdates = (node: any) => {
      if (node.type === 'tab' && node.component === 'editor' && typeof node.config?.itemId === 'string') {
        const item = files.find(f => f.id === node.config.itemId);
        const nextName = item?.name || 'Unknown';
        if (node.name !== nextName) {
          tabNameUpdates.push({ id: node.id, name: nextName });
        }
      }
      for (const child of node.children || []) {
        collectEditorTabNameUpdates(child);
      }
    };

    collectEditorTabNameUpdates(jsonModel.layout);
    tabNameUpdates.forEach(({ id, name }) => layoutModel.doAction(Actions.updateNodeAttributes(id, { name })));
  }, [files]);

  const buildAssistantToolSet = (useChainOfThought: boolean) => (
    useChainOfThought ? CHAIN_OF_THOUGHT_ASSISTANT_TOOLS : STANDARD_ASSISTANT_TOOLS
  );

  const safeJsonParse = (value: string) => {
    try {
      return JSON.parse(value);
    } catch {
      return {};
    }
  };

  const quoteTerminalArg = (value: string) => JSON.stringify(value);

  const extractGeminiVisibleText = (response: any) => {
    const parts = response?.candidates?.[0]?.content?.parts;
    if (!Array.isArray(parts)) {
      return typeof response?.text === 'string' ? response.text.trim() : '';
    }
    return parts
      .filter((part: any) => typeof part?.text === 'string' && !part?.thought)
      .map((part: any) => String(part.text))
      .join('\n')
      .trim();
  };

  const extractOpenAIVisibleText = (response: any) => {
    const parts: string[] = [];
    for (const item of Array.isArray(response?.output) ? response.output : []) {
      if (item?.type !== 'message' || !Array.isArray(item?.content)) continue;
      for (const contentItem of item.content) {
        if ((contentItem?.type === 'output_text' || contentItem?.type === 'text') && typeof contentItem?.text === 'string') {
          parts.push(contentItem.text);
        }
      }
    }
    if (parts.length > 0) return parts.join('\n').trim();
    return typeof response?.output_text === 'string' ? response.output_text.trim() : '';
  };

  const extractAnthropicVisibleText = (response: any) => (
    (Array.isArray(response?.content) ? response.content : [])
      .filter((block: any) => block?.type === 'text' && typeof block?.text === 'string')
      .map((block: any) => block.text)
      .join('\n')
      .trim()
  );

  const applyAssistantUsage = (
    accumulator: {
      totalPromptTokenCount: number;
      totalCandidateTokenCount: number;
      totalThoughtsTokenCount: number;
      totalToolUsePromptTokenCount: number;
      totalTokenCount: number;
      modelUsagePassCount: number;
      approximationPassCount: number;
    },
    usage: {
      promptTokenCount?: number;
      candidateTokenCount?: number;
      thoughtsTokenCount?: number;
      toolUsePromptTokenCount?: number;
      totalTokenCount?: number;
      hasModelUsage?: boolean;
    },
    promptFallbackText?: string,
    responseFallbackText?: string,
  ) => {
    if (usage.hasModelUsage) {
      accumulator.modelUsagePassCount += 1;
      accumulator.totalPromptTokenCount += usage.promptTokenCount ?? 0;
      accumulator.totalCandidateTokenCount += usage.candidateTokenCount ?? 0;
      accumulator.totalThoughtsTokenCount += usage.thoughtsTokenCount ?? 0;
      accumulator.totalToolUsePromptTokenCount += usage.toolUsePromptTokenCount ?? 0;
      accumulator.totalTokenCount += usage.totalTokenCount
        ?? (
          (usage.promptTokenCount ?? 0)
          + (usage.candidateTokenCount ?? 0)
          + (usage.thoughtsTokenCount ?? 0)
          + (usage.toolUsePromptTokenCount ?? 0)
        );
      return;
    }

    accumulator.approximationPassCount += 1;
    const approximatedPromptTokenCount = estimateFallbackTokenCount(promptFallbackText || '');
    const approximatedOutputTokenCount = estimateFallbackTokenCount(responseFallbackText || '');
    accumulator.totalPromptTokenCount += approximatedPromptTokenCount;
    accumulator.totalCandidateTokenCount += approximatedOutputTokenCount;
    accumulator.totalTokenCount += approximatedPromptTokenCount + approximatedOutputTokenCount;
  };

  const handleChatSubmit = async (chatId: string, e: React.FormEvent) => {
    e.preventDefault();
    const input = (assistantInputs[chatId] || '').trim();
    if (!input || loadingAssistantChatId) return;

    const currentChat = assistantChats.find(chat => chat.id === chatId);
    if (!currentChat) return;

    if (currentChat.messages.length === 0 && currentChat.name === DEFAULT_ASSISTANT_CHAT_NAME) {
      const suggestedName = autoNameAssistantChat(input);
      if (suggestedName !== DEFAULT_ASSISTANT_CHAT_NAME) {
        updateAssistantTabName(chatId, suggestedName);
      }
    }

    const selectionContext = getCurrentAssistantSelectionContext();

    const userMsg: ChatMessage = { role: 'user', content: input + selectionContext };
    appendAssistantMessage(chatId, { role: 'user', content: input });
    setAssistantInputs(prev => ({ ...prev, [chatId]: '' }));
    setLoadingAssistantChatId(chatId);

    try {
      const provider = settings.assistantProvider;
      const model = settings.assistantModel.trim();
      const apiKey = assistantConfiguredApiKey;
      const oauthSession = settings.assistantOAuthSession;
      const assistantTools = buildAssistantToolSet(effectiveAssistantUseChainOfThought);
      const maxAssistantToolPasses = effectiveAssistantUseChainOfThought
        ? effectiveAssistantMaxChainOfThoughtDepth
        : DEFAULT_ASSISTANT_TOOL_PASSES;
      if (provider === 'codex-cli' && (!oauthSession.accessToken || oauthSession.status !== 'connected')) {
        appendAssistantMessage(chatId, {
          role: 'assistant',
          content: 'Connect Codex OAuth in Settings or run `codex login` in the Terminal before using Codex CLI mode.',
        });
        return;
      }

      if (provider !== 'codex-cli' && !apiKey) {
        appendAssistantMessage(chatId, {
          role: 'assistant',
          content: `This provider still needs a saved credential. Switch to Codex CLI for OAuth-only mode.`,
        });
        return;
      }

      let assistantFiles = filesRef.current.map(file => ({ ...file }));
      let assistantActiveItemId = activeItem?.id || activeFileId || '';
      let assistantTerminalCwd = terminalCwdRef.current;
      let assistantTerminalOutput = terminalOutputRef.current.slice();
      const toolProgressNotes: string[] = [];
      const assistantLiveNotes: string[] = [];
      let emittedAssistantMessage = false;
      const usageTotals = {
        totalPromptTokenCount: 0,
        totalCandidateTokenCount: 0,
        totalThoughtsTokenCount: 0,
        totalToolUsePromptTokenCount: 0,
        totalTokenCount: 0,
        modelUsagePassCount: 0,
        approximationPassCount: 0,
      };

      const getPathFromSnapshot = (id: string | undefined): string => {
        if (!id) return '';
        const item = assistantFiles.find(f => f.id === id);
        if (!item) return '';
        if (!item.parentId) return item.name;
        return `${getPathFromSnapshot(item.parentId)}/${item.name}`;
      };

      const findItemInSnapshot = (pathOrName: string): FSItem | undefined => {
        const byPath = assistantFiles.find(f => getPathFromSnapshot(f.id) === pathOrName);
        if (byPath) return byPath;
        return assistantFiles.find(f => f.name === pathOrName);
      };

      const findItemInTerminalContext = (pathOrName: string): FSItem | undefined => {
        const normalized = pathOrName.startsWith('/') ? pathOrName.slice(1) : pathOrName;
        const scoped = assistantFiles.find(
          f => f.name === normalized && f.parentId === assistantTerminalCwd
        );
        return scoped || findItemInSnapshot(normalized);
      };

      const isDescendantInSnapshot = (descendantId: string, ancestorId: string) => {
        let cursorId: string | null = descendantId;
        while (cursorId) {
          if (cursorId === ancestorId) return true;
          const item = assistantFiles.find(f => f.id === cursorId);
          cursorId = item?.parentId || null;
        }
        return false;
      };

      const buildAssistantPrompt = () => buildAssistantPromptFromSnapshot({
        chatId,
        messages: currentChat.messages,
        userContent: userMsg.content,
        assistantFiles,
        assistantActiveItemId,
        assistantTerminalCwd,
        useChainOfThought: effectiveAssistantUseChainOfThought,
        maxChainOfThoughtDepth: maxAssistantToolPasses,
        toolProgressNotes,
        assistantLiveNotes,
        codexCliPrefix: provider === 'codex-cli' ? buildCodexCliPromptPrefix(codexCliRuntimeState) : '',
      });

      const emitAssistantLiveMessage = (content: string) => {
        const trimmed = content.trim();
        if (!trimmed) return;
        emittedAssistantMessage = true;
        assistantLiveNotes.push(trimmed);
        appendAssistantMessage(chatId, {
          role: 'assistant',
          content: trimmed,
        });
      };

      const emitAssistantLog = (content: string) => {
        const trimmed = content.trim();
        if (!trimmed) return;
        appendAssistantMessage(chatId, {
          role: 'assistant',
          content: trimmed,
          kind: 'log',
        });
      };

      const updateAssistantFiles = (nextFiles: FSItem[]) => {
        assistantFiles = nextFiles;
        filesRef.current = nextFiles;
        setFiles(nextFiles);
      };

      const updateAssistantTerminalCwd = (nextCwd: string | null) => {
        assistantTerminalCwd = nextCwd;
        terminalCwdRef.current = nextCwd;
        setTerminalCwd(nextCwd);
      };

      const writeTerminalOutput = (nextOutput: string[]) => {
        assistantTerminalOutput = nextOutput;
        terminalOutputRef.current = nextOutput;
        setTerminalOutput(nextOutput);
      };

      const appendTerminalCommandResult = (command: string, lines: string[] = []) => {
        const cwdLabel = assistantTerminalCwd ? getPathFromSnapshot(assistantTerminalCwd) : '~';
        const nextOutput = [...assistantTerminalOutput, `${cwdLabel} $ ${command}`, ...lines];
        writeTerminalOutput(nextOutput);
      };

      const runRawTerminalCommand = async (command: string, summary: string, detail: string) => {
        const beforeOutputLength = terminalOutputRef.current.length;
        selectDockPanel('terminal');
        await executeTerminalCommand(command, false);
        await new Promise(resolve => window.setTimeout(resolve, 0));
        assistantFiles = filesRef.current.map(file => ({ ...file }));
        assistantTerminalCwd = terminalCwdRef.current;
        assistantTerminalOutput = terminalOutputRef.current.slice();
        return {
          summary,
          detail,
          result: {
            ok: true,
            summary,
            detail,
            output: assistantTerminalOutput.slice(beforeOutputLength),
            currentWorkingDirectory: assistantTerminalCwd ? `/${getPathFromSnapshot(assistantTerminalCwd)}` : '/',
          },
        } satisfies AssistantToolExecutionResult;
      };

      const callCodexMcpServer = async (server: CodexCliMcpServer, method: string, params: Record<string, any>) => {
        const response = await fetch(server.url, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            ...(server.authStatus === 'connected' && settings.assistantOAuthSession.accessToken
              ? { Authorization: `Bearer ${settings.assistantOAuthSession.accessToken}` }
              : {}),
          },
          body: JSON.stringify({
            jsonrpc: '2.0',
            id: `codecraft-${Date.now()}`,
            method,
            params,
          }),
        });
        const text = await response.text();
        let body: any = text;
        try {
          body = text ? JSON.parse(text) : null;
        } catch {
          // Keep non-JSON MCP gateway responses visible to the model.
        }
        if (!response.ok) {
          throw new Error(typeof body === 'string' ? body : (body?.error?.message || `MCP request failed with ${response.status}`));
        }
        return body;
      };

      const executeAssistantToolCall = async (call: { name: string; args?: Record<string, any>; callId?: string | null }): Promise<AssistantToolExecutionResult> => {
        const args = call.args || {};
        if (call.name === 'proposeEdit') {
          const { pathOrName, newContent } = args as any;
          const targetFile = typeof pathOrName === 'string' ? findItemInSnapshot(pathOrName) : undefined;
          if (targetFile && targetFile.type === 'file' && typeof newContent === 'string') {
            enqueuePendingEdit({
              fileId: targetFile.id,
              originalContent: targetFile.content || '',
              proposedContent: newContent
            });
            return {
              summary: `Proposed changes to \`${getPathFromSnapshot(targetFile.id)}\`.`,
              detail: `Proposed reviewed edits for ${getPathFromSnapshot(targetFile.id)}.`,
              result: {
                ok: true,
                path: getPathFromSnapshot(targetFile.id),
                action: 'proposed_edit',
              },
            };
          }
          return {
            summary: `I couldn't find a file at \`${String(pathOrName || '')}\` to edit.`,
            detail: `Edit failed because the target file ${String(pathOrName || '')} was not found.`,
            result: { ok: false },
          };
        }

        if (call.name === 'navigateTo') {
          const { pathOrName } = args as any;
          const target = typeof pathOrName === 'string' ? findItemInSnapshot(pathOrName) : undefined;
          if (!target) {
            return {
              summary: `I couldn't find \`${String(pathOrName || '')}\`.`,
              detail: `Navigation failed because ${String(pathOrName || '')} was not found.`,
              result: { ok: false },
            };
          }

          assistantActiveItemId = target.id;
          openEditorTabWithItem(target);
          if (target.type === 'folder') {
            updateAssistantFiles(assistantFiles.map(f => f.id === target.id ? { ...f, isOpen: true } : f));
          }

          return {
            summary: `Navigated to \`${getPathFromSnapshot(target.id)}\`.`,
            detail: `Navigated to ${getPathFromSnapshot(target.id)} (${target.type}).`,
            result: {
              ok: true,
              path: getPathFromSnapshot(target.id),
              type: target.type,
            },
          };
        }

        if (call.name === 'moveCursor') {
          const { line, column } = args as any;
          if (typeof line === 'number' && typeof column === 'number' && editorRef.current) {
            editorRef.current.setPosition({ lineNumber: line, column: column });
            editorRef.current.revealPositionInCenter({ lineNumber: line, column: column });
            editorRef.current.focus();
            return {
              summary: `Moved cursor to line ${line}, column ${column}.`,
              detail: `Moved the editor cursor to line ${line}, column ${column}.`,
              result: { ok: true, line, column },
            };
          }
          return {
            summary: "I couldn't move the cursor because the editor wasn't ready.",
            detail: 'Cursor movement failed because there was no mounted editor.',
            result: { ok: false },
          };
        }

        if (call.name === 'createItem') {
          const { type, name, parentPathOrName, content } = args as any;
          const normalizedType = type === 'folder' ? 'folder' : type === 'file' ? 'file' : null;
          const trimmedName = typeof name === 'string' ? name.trim() : '';
          const parent = typeof parentPathOrName === 'string' && parentPathOrName
            ? findItemInSnapshot(parentPathOrName)
            : undefined;

          if (!normalizedType || !trimmedName) {
            return {
              summary: "I couldn't create the item because type or name was invalid.",
              detail: 'Create item failed because the type or name was invalid.'
            };
          }
          if (parentPathOrName && (!parent || parent.type !== 'folder')) {
            return {
              summary: `I couldn't find destination folder \`${parentPathOrName}\`.`,
              detail: `Create item failed because destination folder ${parentPathOrName} was not found.`
            };
          }

          const id = Math.random().toString(36).substr(2, 9);
          const parentId = parent ? parent.id : null;
          const newItem: FSItem = {
            id,
            name: trimmedName,
            type: normalizedType,
            parentId,
            isOpen: normalizedType === 'folder',
            content: normalizedType === 'file' ? (typeof content === 'string' ? content : '') : undefined,
            language: normalizedType === 'file' ? langFromFilename(trimmedName) : undefined
          };

          let nextFiles = [...assistantFiles, newItem];
          if (parentId) {
            nextFiles = nextFiles.map(f => f.id === parentId ? { ...f, isOpen: true } : f);
          }
          updateAssistantFiles(nextFiles);

          if (normalizedType === 'file') {
            assistantActiveItemId = newItem.id;
            openEditorTabWithItem(newItem);
          }

          return {
            summary: `Created ${normalizedType} \`${getPathFromSnapshot(newItem.id)}\`.`,
            detail: `Created ${normalizedType} at ${getPathFromSnapshot(newItem.id)}.`,
            result: {
              ok: true,
              path: getPathFromSnapshot(newItem.id),
              type: normalizedType,
            },
          };
        }

        if (call.name === 'deleteItem') {
          const { pathOrName } = args as any;
          const target = typeof pathOrName === 'string' ? findItemInSnapshot(pathOrName) : undefined;
          if (!target) {
            return {
              summary: `I couldn't find \`${String(pathOrName || '')}\` to delete.`,
              detail: `Delete failed because ${String(pathOrName || '')} was not found.`,
              result: { ok: false },
            };
          }

          const toDelete = [target.id];
          const collectChildren = (parentId: string) => {
            assistantFiles.forEach(file => {
              if (file.parentId === parentId) {
                toDelete.push(file.id);
                if (file.type === 'folder') collectChildren(file.id);
              }
            });
          };
          collectChildren(target.id);

          for (const deleteId of toDelete) {
            if (syncHandlesRef.current.has(deleteId)) stopFolderSync(deleteId);
          }

          const nextFiles = assistantFiles.filter(file => !toDelete.includes(file.id));
          if (toDelete.includes(assistantActiveItemId)) {
            assistantActiveItemId = '';
            setActiveFileId('');
          }
          updateAssistantFiles(nextFiles);

          return {
            summary: `Deleted \`${target.name}\`.`,
            detail: `Deleted ${target.type} ${target.name}${toDelete.length > 1 ? ` and ${toDelete.length - 1} descendant item(s)` : ''}.`,
            result: { ok: true },
          };
        }

        if (call.name === 'moveItem') {
          const { sourcePathOrName, destinationFolderPathOrName } = args as any;
          const source = typeof sourcePathOrName === 'string' ? findItemInSnapshot(sourcePathOrName) : undefined;
          const moveToRoot = destinationFolderPathOrName === '/' || destinationFolderPathOrName === '~' || destinationFolderPathOrName === '';
          const destination = moveToRoot
            ? null
            : (typeof destinationFolderPathOrName === 'string' ? findItemInSnapshot(destinationFolderPathOrName) : undefined);

          if (!source) {
            return {
              summary: `I couldn't find \`${String(sourcePathOrName || '')}\` to move.`,
              detail: `Move failed because ${String(sourcePathOrName || '')} was not found.`
            };
          }
          if (!moveToRoot && (!destination || destination.type !== 'folder')) {
            return {
              summary: `I couldn't find destination folder \`${String(destinationFolderPathOrName || '')}\`.`,
              detail: `Move failed because destination folder ${String(destinationFolderPathOrName || '')} was not found.`
            };
          }
          if (destination && source.type === 'folder' && isDescendantInSnapshot(destination.id, source.id)) {
            return {
              summary: "I can't move a folder into itself or one of its descendants.",
              detail: `Move failed because ${getPathFromSnapshot(source.id)} contains ${getPathFromSnapshot(destination.id)}.`
            };
          }

          updateAssistantFiles(assistantFiles.map(file => {
            if (file.id === source.id) {
              return { ...file, parentId: destination ? destination.id : null };
            }
            if (destination && file.id === destination.id) {
              return { ...file, isOpen: true };
            }
            return file;
          }));

          return {
            summary: `Moved \`${source.name}\` to ${destination ? `\`${getPathFromSnapshot(destination.id)}\`` : '`root`'}.`,
            detail: `Moved ${source.name} to ${destination ? getPathFromSnapshot(destination.id) : 'root'}.`,
            result: { ok: true },
          };
        }

        if (call.name === 'runTerminalCommand') {
          const { command } = args as any;
          if (typeof command === 'string' && command.trim()) {
            return runRawTerminalCommand(
              command,
              `Executed terminal command: \`${command}\`.`,
              `Executed terminal command: ${command}.`
            );
          }
          return {
            summary: "I couldn't run the terminal command because it was empty.",
            detail: 'Terminal command execution failed because the command was empty.',
            result: { ok: false },
          };
        }

        if (call.name === 'terminalLs') {
          const target = typeof args.pathOrName === 'string' && args.pathOrName.trim()
            ? findItemInTerminalContext(args.pathOrName.trim())
            : undefined;
          if (args.pathOrName && (!target || target.type !== 'folder')) {
            const message = `ls: cannot access '${String(args.pathOrName)}': No such directory`;
            appendTerminalCommandResult(`ls ${String(args.pathOrName)}`, [message]);
            return { summary: message, detail: message, result: { ok: false } };
          }
          const folderId = target?.id ?? assistantTerminalCwd;
          const items = assistantFiles.filter(file => file.parentId === folderId).map(file => file.name).join('  ');
          appendTerminalCommandResult(args.pathOrName ? `ls ${String(args.pathOrName)}` : 'ls', [items || '(empty)']);
          return {
            summary: `Listed ${target ? getPathFromSnapshot(target.id) : 'the current directory'}.`,
            detail: items || '(empty)',
            result: {
              ok: true,
              output: items || '(empty)',
              currentWorkingDirectory: assistantTerminalCwd ? `/${getPathFromSnapshot(assistantTerminalCwd)}` : '/',
            },
          };
        }

        if (call.name === 'terminalPwd') {
          const pwd = assistantTerminalCwd ? `/${getPathFromSnapshot(assistantTerminalCwd)}` : '/';
          appendTerminalCommandResult('pwd', [pwd]);
          return { summary: `Current directory is \`${pwd}\`.`, detail: pwd, result: { ok: true, output: pwd } };
        }

        if (call.name === 'terminalCd') {
          const target = typeof args.target === 'string' ? args.target.trim() : '';
          if (!target || target === '~' || target === '/') {
            updateAssistantTerminalCwd(null);
            appendTerminalCommandResult(target ? `cd ${target}` : 'cd');
            return { summary: 'Changed directory to workspace root.', detail: 'Changed directory to workspace root.', result: { ok: true, currentWorkingDirectory: '/' } };
          }
          if (target === '..') {
            const current = assistantTerminalCwd ? assistantFiles.find(f => f.id === assistantTerminalCwd) : null;
            updateAssistantTerminalCwd(current?.parentId || null);
            appendTerminalCommandResult('cd ..');
            return {
              summary: `Changed directory to \`${assistantTerminalCwd ? `/${getPathFromSnapshot(assistantTerminalCwd)}` : '/'}\`.`,
              detail: 'Changed directory to the parent folder.',
              result: { ok: true, currentWorkingDirectory: assistantTerminalCwd ? `/${getPathFromSnapshot(assistantTerminalCwd)}` : '/' },
            };
          }
          const folder = findItemInTerminalContext(target);
          if (!folder || folder.type !== 'folder') {
            const message = `cd: no such directory: ${target}`;
            appendTerminalCommandResult(`cd ${target}`, [message]);
            return { summary: message, detail: message, result: { ok: false } };
          }
          updateAssistantTerminalCwd(folder.id);
          appendTerminalCommandResult(`cd ${target}`);
          return {
            summary: `Changed directory to \`${getPathFromSnapshot(folder.id)}\`.`,
            detail: `Changed directory to ${getPathFromSnapshot(folder.id)}.`,
            result: { ok: true, currentWorkingDirectory: `/${getPathFromSnapshot(folder.id)}` },
          };
        }

        if (call.name === 'terminalMkdir') {
          const name = typeof args.name === 'string' ? args.name.trim() : '';
          if (!name) {
            const message = 'mkdir: missing operand';
            appendTerminalCommandResult('mkdir', [message]);
            return { summary: message, detail: message, result: { ok: false } };
          }
          const id = Math.random().toString(36).substr(2, 9);
          updateAssistantFiles([...assistantFiles, { id, name, type: 'folder', parentId: assistantTerminalCwd, isOpen: true }]);
          appendTerminalCommandResult(`mkdir ${name}`);
          return {
            summary: `Created folder \`${assistantTerminalCwd ? `${getPathFromSnapshot(assistantTerminalCwd)}/` : ''}${name}\`.`,
            detail: `Created folder ${name}.`,
            result: { ok: true },
          };
        }

        if (call.name === 'terminalTouch') {
          const name = typeof args.name === 'string' ? args.name.trim() : '';
          if (!name) {
            const message = 'touch: missing operand';
            appendTerminalCommandResult('touch', [message]);
            return { summary: message, detail: message, result: { ok: false } };
          }
          const id = Math.random().toString(36).substr(2, 9);
          updateAssistantFiles([...assistantFiles, { id, name, type: 'file', parentId: assistantTerminalCwd, content: '', language: langFromFilename(name) }]);
          appendTerminalCommandResult(`touch ${name}`);
          return {
            summary: `Created file \`${assistantTerminalCwd ? `${getPathFromSnapshot(assistantTerminalCwd)}/` : ''}${name}\`.`,
            detail: `Created file ${name}.`,
            result: { ok: true },
          };
        }

        if (call.name === 'terminalOpen') {
          const pathOrName = typeof args.pathOrName === 'string' ? args.pathOrName.trim() : '';
          const target = pathOrName ? findItemInTerminalContext(pathOrName) : undefined;
          if (!target) {
            const message = `open: ${pathOrName}: No such file or directory`;
            appendTerminalCommandResult(`open ${pathOrName}`, [message]);
            return { summary: message, detail: message, result: { ok: false } };
          }
          if (target.type === 'folder') {
            updateAssistantFiles(assistantFiles.map(file => file.id === target.id ? { ...file, isOpen: true } : file));
          }
          assistantActiveItemId = target.id;
          openEditorTabWithItem(target);
          appendTerminalCommandResult(`open ${pathOrName}`);
          return {
            summary: `Opened \`${getPathFromSnapshot(target.id)}\`.`,
            detail: `Opened ${getPathFromSnapshot(target.id)}.`,
            result: { ok: true, path: getPathFromSnapshot(target.id), type: target.type },
          };
        }

        if (call.name === 'terminalCat') {
          const pathOrName = typeof args.pathOrName === 'string' ? args.pathOrName.trim() : '';
          const target = pathOrName ? findItemInTerminalContext(pathOrName) : undefined;
          if (!target || target.type !== 'file') {
            const message = `cat: ${pathOrName}: No such file`;
            appendTerminalCommandResult(`cat ${pathOrName}`, [message]);
            return { summary: message, detail: message, result: { ok: false } };
          }
          const content = target.content || '';
          appendTerminalCommandResult(`cat ${pathOrName}`, [content]);
          return {
            summary: `Read \`${getPathFromSnapshot(target.id)}\`.`,
            detail: `Read ${getPathFromSnapshot(target.id)}.`,
            result: { ok: true, content },
          };
        }

        if (call.name === 'terminalRm') {
          const pathOrName = typeof args.pathOrName === 'string' ? args.pathOrName.trim() : '';
          const target = pathOrName ? findItemInTerminalContext(pathOrName) : undefined;
          if (!target) {
            const message = `rm: cannot remove '${pathOrName}': No such file or directory`;
            appendTerminalCommandResult(`rm ${pathOrName}`, [message]);
            return { summary: message, detail: message, result: { ok: false } };
          }
          const toDelete = [target.id];
          const collectChildren = (parentId: string) => {
            assistantFiles.forEach(file => {
              if (file.parentId === parentId) {
                toDelete.push(file.id);
                if (file.type === 'folder') collectChildren(file.id);
              }
            });
          };
          collectChildren(target.id);
          for (const deleteId of toDelete) {
            if (syncHandlesRef.current.has(deleteId)) stopFolderSync(deleteId);
          }
          if (toDelete.includes(assistantActiveItemId)) {
            assistantActiveItemId = '';
            setActiveFileId('');
          }
          updateAssistantFiles(assistantFiles.filter(file => !toDelete.includes(file.id)));
          appendTerminalCommandResult(`rm ${pathOrName}`);
          return {
            summary: `Removed \`${getPathFromSnapshot(target.id)}\`.`,
            detail: `Removed ${getPathFromSnapshot(target.id)}.`,
            result: { ok: true },
          };
        }

        if (call.name === 'terminalClear') {
          writeTerminalOutput([]);
          return { summary: 'Cleared the terminal output.', detail: 'Cleared the terminal output.', result: { ok: true } };
        }

        if (call.name === 'terminalHelp') {
          const helpLines = [
            'Standard commands: ls, pwd, cd, mkdir, touch, open, cat, rm, clear, help, date, echo, whoami',
            'Codex CLI: codex help | codex login | codex status | codex exec <prompt> | codex mcp list',
            'Python: pip install <package> [-force] | pip upgrade <package> [-version <ver>] | pip uninstall <package> | pip include <module> | pip list',
            'C#: nuget include <namespace> | nuget list',
          ];
          appendTerminalCommandResult('help', helpLines);
          return { summary: 'Displayed terminal help.', detail: helpLines.join(' '), result: { ok: true, output: helpLines } };
        }

        if (call.name === 'terminalDate') {
          const value = new Date().toLocaleString();
          appendTerminalCommandResult('date', [value]);
          return { summary: `Displayed the current date and time.`, detail: value, result: { ok: true, output: value } };
        }

        if (call.name === 'terminalEcho') {
          const text = typeof args.text === 'string' ? args.text : '';
          appendTerminalCommandResult(`echo ${text}`, [text]);
          return { summary: 'Echoed text in the terminal.', detail: text, result: { ok: true, output: text } };
        }

        if (call.name === 'terminalWhoami') {
          appendTerminalCommandResult('whoami', ['codecraft-user']);
          return { summary: 'Displayed the current terminal user.', detail: 'codecraft-user', result: { ok: true, output: 'codecraft-user' } };
        }

        if (call.name === 'codexMcpListServers') {
          const servers = settings.codexCliMcpServers.filter(server => server.enabled);
          return {
            summary: `Listed ${servers.length} Codex MCP server${servers.length === 1 ? '' : 's'}.`,
            detail: servers.length
              ? servers.map(server => `${server.name} ${server.url} auth=${server.authStatus}`).join('\n')
              : 'No Codex MCP servers configured.',
            result: { ok: true, servers },
          };
        }

        if (call.name === 'codexMcpListTools') {
          const serverName = typeof args.serverName === 'string' ? args.serverName.trim() : '';
          const server = settings.codexCliMcpServers.find(candidate => candidate.name === serverName && candidate.enabled);
          if (!server) {
            return {
              summary: `MCP server \`${serverName || 'unknown'}\` is not configured.`,
              detail: `MCP server ${serverName || 'unknown'} is not configured.`,
              result: { ok: false },
            };
          }
          try {
            const body = await callCodexMcpServer(server, 'tools/list', {});
            return {
              summary: `Listed tools from MCP server \`${server.name}\`.`,
              detail: JSON.stringify(body),
              result: { ok: true, server: server.name, response: body },
            };
          } catch (error) {
            const message = error instanceof Error ? error.message : String(error);
            return {
              summary: `Could not list MCP tools from \`${server.name}\`: ${message}`,
              detail: message,
              result: { ok: false, error: message },
            };
          }
        }

        if (call.name === 'codexMcpCallTool') {
          const serverName = typeof args.serverName === 'string' ? args.serverName.trim() : '';
          const toolName = typeof args.toolName === 'string' ? args.toolName.trim() : '';
          const server = settings.codexCliMcpServers.find(candidate => candidate.name === serverName && candidate.enabled);
          if (!server || !toolName) {
            return {
              summary: 'Could not call MCP tool because the server or tool name was missing.',
              detail: 'MCP call failed because the server or tool name was missing.',
              result: { ok: false },
            };
          }
          try {
            const toolArguments = typeof args.argumentsJson === 'string' && args.argumentsJson.trim()
              ? safeJsonParse(args.argumentsJson)
              : {};
            const body = await callCodexMcpServer(server, 'tools/call', {
              name: toolName,
              arguments: toolArguments,
            });
            return {
              summary: `Called MCP tool \`${toolName}\` on \`${server.name}\`.`,
              detail: JSON.stringify(body),
              result: { ok: true, server: server.name, tool: toolName, response: body },
            };
          } catch (error) {
            const message = error instanceof Error ? error.message : String(error);
            return {
              summary: `MCP tool call failed: ${message}`,
              detail: message,
              result: { ok: false, error: message },
            };
          }
        }

        if (call.name === 'pipInstall') {
          const packageName = typeof args.packageName === 'string' ? args.packageName.trim() : '';
          if (!packageName) {
            return { summary: 'pip install needs a package name.', detail: 'pip install needs a package name.', result: { ok: false } };
          }
          const command = `pip install ${quoteTerminalArg(packageName)}${args.forceBuild ? ' -force' : ''}`;
          return runRawTerminalCommand(command, `Executed \`${command}\`.`, `Executed ${command}.`);
        }

        if (call.name === 'pipUpgrade') {
          const packageName = typeof args.packageName === 'string' ? args.packageName.trim() : '';
          if (!packageName) {
            return { summary: 'pip upgrade needs a package name.', detail: 'pip upgrade needs a package name.', result: { ok: false } };
          }
          const versionSegment = typeof args.version === 'string' && args.version.trim()
            ? ` -version ${quoteTerminalArg(args.version.trim())}`
            : '';
          const command = `pip upgrade ${quoteTerminalArg(packageName)}${versionSegment}`;
          return runRawTerminalCommand(command, `Executed \`${command}\`.`, `Executed ${command}.`);
        }

        if (call.name === 'pipUninstall') {
          const packageName = typeof args.packageName === 'string' ? args.packageName.trim() : '';
          if (!packageName) {
            return { summary: 'pip uninstall needs a package name.', detail: 'pip uninstall needs a package name.', result: { ok: false } };
          }
          const command = `pip uninstall ${quoteTerminalArg(packageName)}`;
          return runRawTerminalCommand(command, `Executed \`${command}\`.`, `Executed ${command}.`);
        }

        if (call.name === 'pipInclude') {
          const moduleName = typeof args.moduleName === 'string' ? args.moduleName.trim() : '';
          if (!moduleName) {
            return { summary: 'pip include needs a module name.', detail: 'pip include needs a module name.', result: { ok: false } };
          }
          const command = `pip include ${quoteTerminalArg(moduleName)}`;
          return runRawTerminalCommand(command, `Executed \`${command}\`.`, `Executed ${command}.`);
        }

        if (call.name === 'pipList') {
          return runRawTerminalCommand('pip list', 'Listed installed Python packages.', 'Listed installed Python packages.');
        }

        if (call.name === 'nugetInclude') {
          const namespaceName = typeof args.namespaceName === 'string' ? args.namespaceName.trim() : '';
          if (!namespaceName) {
            return { summary: 'nuget include needs a namespace.', detail: 'nuget include needs a namespace.', result: { ok: false } };
          }
          const command = `nuget include ${quoteTerminalArg(namespaceName)}`;
          return runRawTerminalCommand(command, `Executed \`${command}\`.`, `Executed ${command}.`);
        }

        if (call.name === 'nugetList') {
          return runRawTerminalCommand('nuget list', 'Listed included C# namespaces.', 'Listed included C# namespaces.');
        }

        return {
          summary: `Ignored unsupported tool call \`${String(call.name || 'unknown')}\`.`,
          detail: `Unsupported tool call encountered: ${String(call.name || 'unknown')}.`,
          result: { ok: false },
        };
      };

      const geminiThinkingConfig = (() => {
        if (!effectiveAssistantUseChainOfThought && getAssistantReasoningControl(provider, model) === 'always_on') {
          return undefined;
        }
        if (/^gemini-2\.5-flash-lite/i.test(model)) {
          return { thinkingBudget: effectiveAssistantUseChainOfThought ? 512 : 0 };
        }
        if (/^gemini-2\.5-flash/i.test(model)) {
          return { thinkingBudget: effectiveAssistantUseChainOfThought ? -1 : 0 };
        }
        if (/^gemini-2\.5-pro/i.test(model) && effectiveAssistantUseChainOfThought) {
          return { thinkingBudget: -1 };
        }
        return undefined;
      })();

      const runGeminiLoop = async () => {
        const promptForPass = buildAssistantPrompt();
        const ai = new GoogleGenAI({ apiKey });
        const contents: any[] = [{ role: 'user', parts: [{ text: promptForPass }] }];

        for (let pass = 0; pass < maxAssistantToolPasses; pass++) {
          const response = await ai.models.generateContent({
            model,
            contents,
            config: {
              tools: [{ functionDeclarations: assistantTools.map(toGeminiFunctionDeclaration) }],
              ...(geminiThinkingConfig ? { thinkingConfig: geminiThinkingConfig } : {}),
            } as any,
          });

          const assistantText = extractGeminiVisibleText(response);
          applyAssistantUsage(
            usageTotals,
            {
              promptTokenCount: response?.usageMetadata?.promptTokenCount,
              candidateTokenCount: response?.usageMetadata?.candidatesTokenCount,
              thoughtsTokenCount: response?.usageMetadata?.thoughtsTokenCount,
              toolUsePromptTokenCount: response?.usageMetadata?.toolUsePromptTokenCount,
              totalTokenCount: response?.usageMetadata?.totalTokenCount,
              hasModelUsage: !!response?.usageMetadata,
            },
            pass === 0 ? promptForPass : toolProgressNotes[toolProgressNotes.length - 1],
            assistantText,
          );

          if (assistantText) {
            emitAssistantLiveMessage(assistantText);
          }

          const functionCalls = Array.isArray(response?.functionCalls) ? response.functionCalls : [];
          if (functionCalls.length === 0) break;

          const passSummaries: string[] = [];
          const passDetails: string[] = [];
          const functionResponseParts: any[] = [];

          for (const functionCall of functionCalls) {
            const outcome = await executeAssistantToolCall({
              name: functionCall.name,
              args: functionCall.args,
            });
            passSummaries.push(outcome.summary);
            passDetails.push(outcome.detail);
            functionResponseParts.push({
              functionResponse: {
                name: functionCall.name,
                response: {
                  result: outcome.result ?? { summary: outcome.summary, detail: outcome.detail },
                },
              },
            });
          }

          if (passSummaries.length > 0) {
            emitAssistantLog(`Step ${pass + 1} log:\n${passSummaries.map(summary => `- ${summary}`).join('\n')}`);
          }
          if (passDetails.length > 0) {
            toolProgressNotes.push(passDetails.join(' '));
          }

          const modelContent = response?.candidates?.[0]?.content;
          if (modelContent) contents.push(modelContent);
          contents.push({ role: 'user', parts: functionResponseParts });
        }
      };

      const runOpenAILoop = async () => {
        let previousResponseId: string | undefined;
        let nextInput: any = [{
          role: 'user',
          content: [{ type: 'input_text', text: buildAssistantPrompt() }],
        }];

        for (let pass = 0; pass < maxAssistantToolPasses; pass++) {
          const payload: any = {
            model,
            input: nextInput,
            tools: assistantTools.map(toOpenAIToolDefinition),
          };
          if (previousResponseId) payload.previous_response_id = previousResponseId;
          if (getAssistantReasoningControl(provider, model) !== 'always_off') {
            payload.reasoning = { effort: effectiveAssistantUseChainOfThought ? 'medium' : 'none' };
          }

          const response = await fetch('https://api.openai.com/v1/responses', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'Authorization': `Bearer ${apiKey}`,
            },
            body: JSON.stringify(payload),
          });

          const responseJson = await response.json();
          if (!response.ok) {
            throw new Error(responseJson?.error?.message || 'OpenAI request failed.');
          }

          const assistantText = extractOpenAIVisibleText(responseJson);
          const outputTokens = typeof responseJson?.usage?.output_tokens === 'number' ? responseJson.usage.output_tokens : undefined;
          const reasoningTokens = typeof responseJson?.usage?.output_tokens_details?.reasoning_tokens === 'number'
            ? responseJson.usage.output_tokens_details.reasoning_tokens
            : 0;
          applyAssistantUsage(
            usageTotals,
            {
              promptTokenCount: responseJson?.usage?.input_tokens,
              candidateTokenCount: typeof outputTokens === 'number' ? Math.max(0, outputTokens - reasoningTokens) : undefined,
              thoughtsTokenCount: reasoningTokens,
              totalTokenCount: responseJson?.usage?.total_tokens,
              hasModelUsage: !!responseJson?.usage,
            },
            Array.isArray(nextInput) ? JSON.stringify(nextInput) : String(nextInput || ''),
            assistantText,
          );

          if (assistantText) {
            emitAssistantLiveMessage(assistantText);
          }

          const functionCalls = (Array.isArray(responseJson?.output) ? responseJson.output : [])
            .filter((item: any) => item?.type === 'function_call');
          if (functionCalls.length === 0) break;

          const passSummaries: string[] = [];
          const passDetails: string[] = [];
          nextInput = [];

          for (const functionCall of functionCalls) {
            const outcome = await executeAssistantToolCall({
              name: functionCall.name,
              args: safeJsonParse(functionCall.arguments || '{}'),
              callId: functionCall.call_id,
            });
            passSummaries.push(outcome.summary);
            passDetails.push(outcome.detail);
            nextInput.push({
              type: 'function_call_output',
              call_id: functionCall.call_id,
              output: JSON.stringify(outcome.result ?? { summary: outcome.summary, detail: outcome.detail }),
            });
          }

          if (passSummaries.length > 0) {
            emitAssistantLog(`Step ${pass + 1} log:\n${passSummaries.map(summary => `- ${summary}`).join('\n')}`);
          }
          if (passDetails.length > 0) {
            toolProgressNotes.push(passDetails.join(' '));
          }

          previousResponseId = responseJson.id;
        }
      };

      const runCodexCliLoop = async () => {
        let previousResponseId: string | undefined;
        let nextInput: any = [{
          role: 'user',
          content: [{ type: 'input_text', text: buildAssistantPrompt() }],
        }];
        emitAssistantLog(
          [
            `Codex CLI mode: exec --experimental-json --model ${model}`,
            `Static source: ${CODEX_CLI_STATIC_REPOSITORY.localClonePath} @ ${CODEX_CLI_STATIC_REPOSITORY.commit.slice(0, 7)}`,
            `Reasoning effort: ${settings.codexCliReasoningEffort}`,
          ].join('\n')
        );

        for (let pass = 0; pass < maxAssistantToolPasses; pass++) {
          const payload: any = {
            model,
            input: nextInput,
            tools: assistantTools.map(toOpenAIToolDefinition),
            metadata: {
              client: 'codecraft-codex-cli-static',
              codex_git_commit: CODEX_CLI_STATIC_REPOSITORY.commit,
            },
          };
          if (previousResponseId) payload.previous_response_id = previousResponseId;
          if (settings.codexCliReasoningEffort !== 'off') {
            payload.reasoning = {
              effort: settings.codexCliReasoningEffort,
              summary: effectiveAssistantUseChainOfThought ? 'auto' : 'none',
            };
          }

          const response = await fetch(settings.codexCliResponsesEndpoint || CODEX_CLI_RESPONSES_ENDPOINT, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'Authorization': `Bearer ${oauthSession.accessToken}`,
            },
            body: JSON.stringify(payload),
          });

          const responseJson = await response.json();
          if (!response.ok) {
            throw new Error(responseJson?.error?.message || 'Codex CLI mode request failed.');
          }

          const assistantText = extractCodexCliVisibleText(responseJson);
          const outputTokens = typeof responseJson?.usage?.output_tokens === 'number' ? responseJson.usage.output_tokens : undefined;
          const reasoningTokens = typeof responseJson?.usage?.output_tokens_details?.reasoning_tokens === 'number'
            ? responseJson.usage.output_tokens_details.reasoning_tokens
            : 0;
          applyAssistantUsage(
            usageTotals,
            {
              promptTokenCount: responseJson?.usage?.input_tokens,
              candidateTokenCount: typeof outputTokens === 'number' ? Math.max(0, outputTokens - reasoningTokens) : undefined,
              thoughtsTokenCount: reasoningTokens,
              totalTokenCount: responseJson?.usage?.total_tokens,
              hasModelUsage: !!responseJson?.usage,
            },
            Array.isArray(nextInput) ? JSON.stringify(nextInput) : String(nextInput || ''),
            assistantText,
          );

          if (assistantText) {
            emitAssistantLiveMessage(assistantText);
          }

          const functionCalls = (Array.isArray(responseJson?.output) ? responseJson.output : [])
            .filter((item: any) => item?.type === 'function_call');
          if (functionCalls.length === 0) break;

          const passSummaries: string[] = [];
          const passDetails: string[] = [];
          nextInput = [];

          for (const functionCall of functionCalls) {
            const outcome = await executeAssistantToolCall({
              name: functionCall.name,
              args: safeJsonParse(functionCall.arguments || '{}'),
              callId: functionCall.call_id,
            });
            passSummaries.push(outcome.summary);
            passDetails.push(outcome.detail);
            nextInput.push({
              type: 'function_call_output',
              call_id: functionCall.call_id,
              output: JSON.stringify(outcome.result ?? { summary: outcome.summary, detail: outcome.detail }),
            });
          }

          if (passSummaries.length > 0) {
            emitAssistantLog(`Codex step ${pass + 1} log:\n${passSummaries.map(summary => `- ${summary}`).join('\n')}`);
          }
          if (passDetails.length > 0) {
            toolProgressNotes.push(passDetails.join(' '));
          }

          previousResponseId = responseJson.id;
        }
      };

      const runAnthropicLoop = async () => {
        const messages: any[] = [{ role: 'user', content: buildAssistantPrompt() }];

        for (let pass = 0; pass < maxAssistantToolPasses; pass++) {
          const payload: any = {
            model,
            max_tokens: effectiveAssistantUseChainOfThought ? 8192 : 4096,
            messages,
            tools: assistantTools.map(toAnthropicToolDefinition),
          };
          if (effectiveAssistantUseChainOfThought) {
            payload.thinking = { type: 'enabled', budget_tokens: 2048 };
          }

          const response = await fetch('https://api.anthropic.com/v1/messages', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'x-api-key': apiKey,
              'anthropic-version': '2023-06-01',
            },
            body: JSON.stringify(payload),
          });

          const responseJson = await response.json();
          if (!response.ok) {
            throw new Error(responseJson?.error?.message || 'Anthropic request failed.');
          }

          const assistantText = extractAnthropicVisibleText(responseJson);
          applyAssistantUsage(
            usageTotals,
            {
              promptTokenCount: responseJson?.usage?.input_tokens,
              candidateTokenCount: responseJson?.usage?.output_tokens,
              totalTokenCount: (
                typeof responseJson?.usage?.input_tokens === 'number'
                && typeof responseJson?.usage?.output_tokens === 'number'
              ) ? responseJson.usage.input_tokens + responseJson.usage.output_tokens : undefined,
              hasModelUsage: !!responseJson?.usage,
            },
            JSON.stringify(messages),
            assistantText,
          );

          if (assistantText) {
            emitAssistantLiveMessage(assistantText);
          }

          const toolCalls = (Array.isArray(responseJson?.content) ? responseJson.content : [])
            .filter((block: any) => block?.type === 'tool_use');
          if (toolCalls.length === 0) break;

          const passSummaries: string[] = [];
          const passDetails: string[] = [];
          const toolResults: any[] = [];

          for (const toolCall of toolCalls) {
            const outcome = await executeAssistantToolCall({
              name: toolCall.name,
              args: toolCall.input,
              callId: toolCall.id,
            });
            passSummaries.push(outcome.summary);
            passDetails.push(outcome.detail);
            toolResults.push({
              type: 'tool_result',
              tool_use_id: toolCall.id,
              content: JSON.stringify(outcome.result ?? { summary: outcome.summary, detail: outcome.detail }),
            });
          }

          if (passSummaries.length > 0) {
            emitAssistantLog(`Step ${pass + 1} log:\n${passSummaries.map(summary => `- ${summary}`).join('\n')}`);
          }
          if (passDetails.length > 0) {
            toolProgressNotes.push(passDetails.join(' '));
          }

          messages.push({ role: 'assistant', content: responseJson.content });
          messages.push({ role: 'user', content: toolResults });
        }
      };

      if (provider === 'codex-cli') {
        await runCodexCliLoop();
      } else if (provider === 'gemini') {
        await runGeminiLoop();
      } else if (provider === 'openai') {
        await runOpenAILoop();
      } else {
        await runAnthropicLoop();
      }

      if (!emittedAssistantMessage) {
        appendAssistantMessage(chatId, {
          role: 'assistant',
          content: "I couldn't complete the requested action."
        });
      }

      const inputTokenCount = usageTotals.totalPromptTokenCount + usageTotals.totalToolUsePromptTokenCount;
      const outputTokenCount = usageTotals.totalCandidateTokenCount + usageTotals.totalThoughtsTokenCount;
      const normalizedTotalTokenCount = usageTotals.totalTokenCount > 0
        ? usageTotals.totalTokenCount
        : inputTokenCount + outputTokenCount;
      const source: AssistantTurnUsageSource =
        usageTotals.modelUsagePassCount > 0 && usageTotals.approximationPassCount === 0
          ? 'model'
          : usageTotals.modelUsagePassCount > 0
            ? 'mixed'
            : 'approximation';

      setAssistantTurnUsageByChatId(prev => ({
        ...prev,
        [chatId]: {
          promptTokenCount: usageTotals.totalPromptTokenCount,
          toolUsePromptTokenCount: usageTotals.totalToolUsePromptTokenCount,
          inputTokenCount,
          candidateTokenCount: usageTotals.totalCandidateTokenCount,
          thoughtsTokenCount: usageTotals.totalThoughtsTokenCount,
          outputTokenCount,
          totalTokenCount: normalizedTotalTokenCount,
          paidCostUsd: calculateAssistantPaidCostUsd(provider, model, inputTokenCount, outputTokenCount),
          passCount: usageTotals.modelUsagePassCount + usageTotals.approximationPassCount,
          source,
          updatedAt: Date.now(),
        },
      }));
    } catch (error) {
      console.error(error);
      appendAssistantMessage(chatId, {
        role: 'assistant',
        content: `The assistant request failed.\n\nError: \`${getAssistantErrorMessage(error)}\``,
      });
    } finally {
      setLoadingAssistantChatId(null);
    }
  };

  const findTabsetContainingComponent = (node: any, component: string): any => {
    if (node.type === 'tabset' && (node.children || []).some((child: any) => child.type === 'tab' && child.component === component)) {
      return node;
    }
    for (const child of node.children || []) {
      const found = findTabsetContainingComponent(child, component);
      if (found) return found;
    }
    return null;
  };

  const selectDockPanel = (component: string) => {
    const jsonModel = layoutModel.toJson() as IJsonModel;
    const targetTabset = findTabsetContainingComponent(jsonModel.layout, component);
    if (!targetTabset) return;
    const targetTab = (targetTabset.children || []).find((child: any) => child.component === component);
    if (!targetTab?.id) return;
    layoutModel.doAction(Actions.selectTab(targetTab.id));
  };

  const enqueuePendingEdit = (nextEdit: PendingEdit) => {
    setPendingEdits(prev => {
      const existingIndex = prev.findIndex(edit => edit.fileId === nextEdit.fileId);
      if (existingIndex === -1) return [...prev, nextEdit];
      const next = [...prev];
      next[existingIndex] = nextEdit;
      return next;
    });
  };

  const acceptEdit = () => {
    if (!pendingEdit) return;
    setFiles(prev => prev.map(f => f.id === pendingEdit.fileId ? { ...f, content: pendingEdit.proposedContent } : f));
    setPendingEdits(prev => prev.slice(1));
  };

  const declineEdit = () => {
    setPendingEdits(prev => prev.slice(1));
  };

  const addNewItem = (type: 'file' | 'folder', parentId: string | null = null, mode: 'modal' | 'inline' = 'modal') => {
    if (mode === 'modal') {
      setNamingState({ type, parentId });
      setNamingName('');
    } else {
      const id = Math.random().toString(36).substr(2, 9);
      const newItem: FSItem = {
        id,
        name: '',
        type,
        parentId,
        isOpen: type === 'folder',
        content: type === 'file' ? '' : undefined,
        language: type === 'file' ? 'plaintext' : undefined
      };

      if (parentId) {
        setFiles(prev => prev.map(f => f.id === parentId ? { ...f, isOpen: true } : f));
      }

      setPendingNewItem(newItem);
      setRenamingId(id);
      setRenamingName('');
    }
  };

  const confirmRename = () => {
    if (!renamingId) return;
    const name = renamingName.trim();
    const isPending = pendingNewItem && pendingNewItem.id === renamingId;

    if (isPending) {
      if (name) {
        const finalized: FSItem = {
          ...pendingNewItem,
          name,
          language: pendingNewItem.type === 'file' ? langFromFilename(name) : undefined,
        };
        setFiles(prev => [...prev, finalized]);
        if (finalized.type === 'file') openEditorTabWithItem(finalized);
      }
      setPendingNewItem(null);
    } else {
      if (name) {
        setFiles(prev => prev.map(f =>
          f.id === renamingId
            ? { ...f, name, language: f.type === 'file' ? langFromFilename(name) : undefined }
            : f
        ));
      }
    }

    setRenamingId(null);
    setRenamingName('');
  };

  const parseTerminalArgs = (input: string): string[] => {
    const tokens = input.match(/"[^"\\]*(?:\\.[^"\\]*)*"|'[^'\\]*(?:\\.[^'\\]*)*'|\S+/g) || [];
    return tokens.map(token => {
      if ((token.startsWith('"') && token.endsWith('"')) || (token.startsWith("'") && token.endsWith("'"))) {
        const quote = token[0];
        let value = token.slice(1, -1);
        if (quote === '"') value = value.replace(/\\"/g, '"');
        if (quote === "'") value = value.replace(/\\'/g, "'");
        return value.replace(/\\\\/g, "\\");
      }
      return token.replace(/\\ /g, " ");
    });
  };

  const confirmNewItem = () => {
    if (!namingState || !namingName.trim()) {
      setNamingState(null);
      return;
    }

    const { type, parentId } = namingState;
    const name = namingName.trim();
    const id = Math.random().toString(36).substr(2, 9);

    const newItem: FSItem = {
      id,
      name,
      type,
      parentId,
      isOpen: type === 'folder',
      content: type === 'file' ? '' : undefined,
      language: type === 'file' ? langFromFilename(name) : undefined
    };

    setFiles(prev => {
      const updated = [...prev, newItem];
      if (parentId) {
        return updated.map(f => f.id === parentId ? { ...f, isOpen: true } : f);
      }
      return updated;
    });

    if (type === 'file') openEditorTabWithItem(newItem);
    setNamingState(null);
    setNamingName('');
  };

  const deleteItem = (id: string) => {
    const toDelete = [id];
    const findChildren = (pid: string) => {
      files.forEach(f => {
        if (f.parentId === pid) {
          toDelete.push(f.id);
          if (f.type === 'folder') findChildren(f.id);
        }
      });
    };
    findChildren(id);

    for (const delId of toDelete) {
      if (syncHandlesRef.current.has(delId)) stopFolderSync(delId);
    }

    setFiles(prev => prev.filter(f => !toDelete.includes(f.id)));
    if (toDelete.includes(activeFileId)) {
      setActiveFileId('');
    }
  };

  const executeTerminalCommand = async (rawCommand: string, clearInputAfter = false) => {
    const fullInput = rawCommand.trim();
    const args = fullInput ? parseTerminalArgs(fullInput) : [];
    const cmd = (args[0] || '').toLowerCase();
    const newOutput = [...terminalOutput, `${terminalCwd ? getPath(terminalCwd) : '~'} $ ${rawCommand}`];

    if (cmd === 'clear') {
      setTerminalOutput([]);
    } else if (cmd === 'ls') {
      const currentFiles = files.filter(f => f.parentId === terminalCwd).map(f => f.name).join('  ');
      setTerminalOutput([...newOutput, currentFiles || '(empty)']);
    } else if (cmd === 'pwd') {
      setTerminalOutput([...newOutput, terminalCwd ? `/${getPath(terminalCwd)}` : '/']);
    } else if (cmd === 'cd') {
      const target = args[1];
      if (!target || target === '~' || target === '/') {
        setTerminalCwd(null);
        setTerminalOutput(newOutput);
      } else if (target === '..') {
        if (terminalCwd) {
          const current = files.find(f => f.id === terminalCwd);
          setTerminalCwd(current?.parentId || null);
        }
        setTerminalOutput(newOutput);
      } else {
        const folder = files.find(f => f.name === target && f.type === 'folder' && f.parentId === terminalCwd);
        if (folder) {
          setTerminalCwd(folder.id);
          setTerminalOutput(newOutput);
        } else {
          setTerminalOutput([...newOutput, `cd: no such directory: ${target}`]);
        }
      }
    } else if (cmd === 'mkdir') {
      const name = args[1];
      if (name) {
        const id = Math.random().toString(36).substr(2, 9);
        setFiles(prev => [...prev, { id, name, type: 'folder', parentId: terminalCwd, isOpen: true }]);
        setTerminalOutput(newOutput);
      } else {
        setTerminalOutput([...newOutput, 'mkdir: missing operand']);
      }
    } else if (cmd === 'touch') {
      const name = args[1];
      if (name) {
        const id = Math.random().toString(36).substr(2, 9);
        setFiles(prev => [...prev, { id, name, type: 'file', parentId: terminalCwd, content: '', language: langFromFilename(name) }]);
        setTerminalOutput(newOutput);
      } else {
        setTerminalOutput([...newOutput, 'touch: missing operand']);
      }
    } else if (cmd === 'open') {
      const targetRaw = args[1];
      if (!targetRaw) {
        setTerminalOutput([...newOutput, 'open: missing operand']);
      } else {
        const target = targetRaw.startsWith('/') ? targetRaw.slice(1) : targetRaw;
        const localItem = files.find(f => f.name === target && f.parentId === terminalCwd);
        const item = localItem || findItem(target);
        if (!item) {
          setTerminalOutput([...newOutput, `open: ${targetRaw}: No such file or directory`]);
        } else {
          if (item.type === 'folder') {
            setFiles(prev => prev.map(f => f.id === item.id ? { ...f, isOpen: true } : f));
          }
          openEditorTab(item.id);
          setTerminalOutput(newOutput);
        }
      }
    } else if (cmd === 'cat') {
      const name = args[1];
      const file = files.find(f => f.name === name && f.type === 'file' && f.parentId === terminalCwd);
      if (file) {
        setTerminalOutput([...newOutput, file.content || '']);
      } else {
        setTerminalOutput([...newOutput, `cat: ${name}: No such file`]);
      }
    } else if (cmd === 'rm') {
      const name = args[1];
      const item = files.find(f => f.name === name && f.parentId === terminalCwd);
      if (item) {
        deleteItem(item.id);
        setTerminalOutput(newOutput);
      } else {
        setTerminalOutput([...newOutput, `rm: cannot remove '${name}': No such file or directory`]);
      }
    } else if (cmd === 'codex') {
      const pendingAuthWindow = (args[1] || '').toLowerCase() === 'login' && !args[2]
        ? window.open('about:blank', '_blank')
        : null;
      const result = await runCodexCliTerminalCommand(args.slice(1), codexCliRuntimeState, settings.assistantModel);
      const nextRuntimeState: CodexCliRuntimeState = {
        ...codexCliRuntimeState,
        oauth: result.nextOAuthSession ?? codexCliRuntimeState.oauth,
        mcpServers: result.nextMcpServers ?? codexCliRuntimeState.mcpServers,
        reasoningEffort: result.nextReasoningEffort ?? codexCliRuntimeState.reasoningEffort,
      };
      if (
        result.nextOAuthSession
        || result.nextMcpServers
        || result.nextReasoningEffort
        || result.nextModel
      ) {
        setSettings(current => ({
          ...current,
          assistantProvider: 'codex-cli',
          assistantModel: result.nextModel || current.assistantModel,
          assistantOAuthSession: result.nextOAuthSession ?? current.assistantOAuthSession,
          codexCliMcpServers: result.nextMcpServers ?? current.codexCliMcpServers,
          codexCliReasoningEffort: result.nextReasoningEffort ?? current.codexCliReasoningEffort,
          assistantUseChainOfThought: result.nextReasoningEffort
            ? result.nextReasoningEffort !== 'off'
            : current.assistantUseChainOfThought,
        }));
      }

      const terminalLines = [...newOutput, ...result.lines];
      setTerminalOutput(terminalLines);
      if (result.openUrl) {
        if (pendingAuthWindow) {
          pendingAuthWindow.opener = null;
          pendingAuthWindow.location.href = result.openUrl;
        } else {
          window.open(result.openUrl, '_blank', 'noopener,noreferrer');
        }
      } else {
        pendingAuthWindow?.close();
      }

      if (result.prompt) {
        if (nextRuntimeState.oauth.status !== 'connected' || !nextRuntimeState.oauth.accessToken) {
          setTerminalOutput([...terminalLines, 'codex exec error: OAuth is not connected. Run codex login first.']);
        } else {
          setTerminalOutput([...terminalLines, 'Codex CLI adapter: sending prompt...']);
          try {
            const activeContext = activeItem?.type === 'file'
              ? `Active file ${getPath(activeItem.id)}:\n${activeItem.content || ''}`
              : activeItem
                ? `Active item ${getPath(activeItem.id)} is a folder.`
                : 'No active file is selected.';
            const response = await fetch(nextRuntimeState.responsesEndpoint, {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${nextRuntimeState.oauth.accessToken}`,
              },
              body: JSON.stringify({
                model: result.nextModel || settings.assistantModel,
                input: [{
                  role: 'user',
                  content: [{
                    type: 'input_text',
                    text: [
                      buildCodexCliPromptPrefix(nextRuntimeState),
                      `Current fake terminal cwd: ${terminalCwd ? `/${getPath(terminalCwd)}` : '/'}`,
                      activeContext,
                      `USER: ${result.prompt}`,
                    ].join('\n\n'),
                  }],
                }],
                ...(nextRuntimeState.reasoningEffort !== 'off'
                  ? { reasoning: { effort: nextRuntimeState.reasoningEffort, summary: 'auto' } }
                  : {}),
              }),
            });
            const json = await response.json();
            if (!response.ok) throw new Error(json?.error?.message || `request failed with ${response.status}`);
            const text = extractCodexCliVisibleText(json) || '(no assistant text returned)';
            setTerminalOutput(prev => [...prev, text]);
          } catch (error) {
            setTerminalOutput(prev => [...prev, `codex exec error: ${error instanceof Error ? error.message : String(error)}`]);
          }
        }
      }
    } else if (cmd === 'pip') {
      const subCmd = args[1];
      const pkg = args[2];

      const upgradePkg = async (name: string, ver?: string) => {
        await ensurePyodideWithPackages(msg => setTerminalOutput(prev => [...prev, msg]));
        const py = (window as any).pyodide;
        await py.loadPackage("micropip");
        const micropip = py.pyimport("micropip");

        if (/^https?:\/\//i.test(name)) {
          setTerminalOutput(prev => [...prev, `Installing from URL: ${name}`]);
          await micropip.install(name, { deps: false });
          setTerminalOutput(prev => [...prev, `Successfully installed from URL`]);
          await syncInstalledPythonPackageSupport(name, '', 'url', msg => setTerminalOutput(prev => [...prev, msg]));
          return;
        }

        const spec = ver ? `${name}==${ver}` : name;
        const verPath = ver ? `/${ver}` : '';
        const res = await fetch(`https://pypi.org/pypi/${name}${verPath}/json`);
        if (!res.ok) throw new Error(`Package "${name}" not found on PyPI`);
        const data = await res.json();
        const urls: any[] = data.urls || [];
        const wheel = urls.find((u: any) =>
          u.packagetype === 'bdist_wheel' && u.filename.endsWith('-none-any.whl')
        );

        if (wheel) {
          setTerminalOutput(prev => [...prev, `Downloading ${wheel.filename}...`]);
          try { micropip.uninstall(name); } catch { }
          await micropip.install(wheel.url, { deps: false });
        } else {
          try { micropip.uninstall(name); } catch { }
          await micropip.install(spec, { deps: false });
        }
        setTerminalOutput(prev => [...prev, `Successfully upgraded ${name} to ${data.info.version}`]);
        await syncInstalledPythonPackageSupport(name, data.info.version, 'micropip', msg => setTerminalOutput(prev => [...prev, msg]));
      };

      if (subCmd === 'upgrade' && pkg) {
        setTerminalOutput([...newOutput, `Upgrading ${pkg}...`]);
        try {
          const versionIdx = args.indexOf('-version');
          const ver = versionIdx !== -1 ? args[versionIdx + 1] : undefined;
          await upgradePkg(pkg, ver);
        } catch (err) {
          setTerminalOutput(prev => [...prev, `pip upgrade error: ${err instanceof Error ? err.message : String(err)}`]);
        }
      } else if (subCmd === 'install' && pkg) {
        const forceFlag = args.includes('-force');
        setTerminalOutput([...newOutput, `Collecting ${pkg}...${forceFlag ? ' (force build from source)' : ''}`]);
        try {
          await ensurePyodideWithPackages(msg => setTerminalOutput(prev => [...prev, msg]));
          const pyodide = (window as any).pyodide;
          await pyodide.loadPackage("micropip");
          const micropip = pyodide.pyimport("micropip");

          const micropipInstallWithRetry = async (target: string, attempt = 0): Promise<void> => {
            try {
              await micropip.install(target, { keep_going: true });
            } catch (err) {
              const msg = err instanceof Error ? err.message : String(err);
              const versionConflict = msg.match(/Requested '([^']+)'.*but\s+(\S+)==\S+\s+is already installed/);
              if (versionConflict && attempt < 5) {
                const conflictSpec = versionConflict[1];
                const conflictPkg = versionConflict[2];
                setTerminalOutput(prev => [...prev, `  Auto-upgrading ${conflictPkg} to satisfy ${conflictSpec}...`]);
                try {
                  await upgradePkg(conflictPkg);
                } catch {
                  try {
                    const cRes = await fetch(`https://pypi.org/pypi/${conflictPkg}/json`);
                    if (cRes.ok) {
                      const cData = await cRes.json();
                      const cWheel = (cData.urls || []).find((u: any) =>
                        u.packagetype === 'bdist_wheel' && u.filename.endsWith('-none-any.whl')
                      );
                      if (cWheel) {
                        try { micropip.uninstall(conflictPkg); } catch { }
                        await micropip.install(cWheel.url, { deps: false });
                        setTerminalOutput(prev => [...prev, `  Upgraded ${conflictPkg} to ${cData.info.version}`]);
                      }
                    }
                  } catch { }
                }
                return micropipInstallWithRetry(target, attempt + 1);
              }
              throw err;
            }
          };

          let installed = false;
          let installSource: PyodidePackageInstallSource | null = null;
          const isUrl = /^https?:\/\//i.test(pkg);

          if (isUrl) {
            // Direct URL install — skip to micropip with retry
            setTerminalOutput(prev => [...prev, `Installing from URL: ${pkg}`]);
            try {
              await micropipInstallWithRetry(pkg);
              setTerminalOutput(prev => [...prev, `Installed from URL`]);
              installed = true;
              installSource = 'url';
            } catch (urlErr) {
              setTerminalOutput(prev => [...prev, `Failed to install from URL: ${urlErr instanceof Error ? urlErr.message : String(urlErr)}`]);
            }
          } else {
            // --- Tier 1: Pyodide pre-built WASM packages ---
            try {
              setTerminalOutput(prev => [...prev, `[Tier 1] Trying Pyodide pre-built package for ${pkg}...`]);
              await pyodide.loadPackage(pkg);
              setTerminalOutput(prev => [...prev, `[Tier 1] Loaded pre-built WASM package: ${pkg}`]);
              installed = true;
              installSource = 'pyodide-prebuilt';
            } catch {
              setTerminalOutput(prev => [...prev, `[Tier 1] ${pkg} not in Pyodide pre-built index, trying PyPI...`]);
            }

            // --- Tier 2: micropip pure Python wheels ---
            if (!installed) {
              // Tier 2a: standard micropip resolution
              try {
                await micropipInstallWithRetry(pkg);
                setTerminalOutput(prev => [...prev, `[Tier 2] Installed ${pkg} from PyPI`]);
                installed = true;
                installSource = 'micropip';
              } catch {
                setTerminalOutput(prev => [...prev, `[Tier 2a] micropip index resolution failed, trying direct wheel URL...`]);
              }

              // Tier 2b: fetch wheel URL from PyPI, upgrade conflicting deps, retry
              if (!installed) {
                for (let t2bAttempt = 0; t2bAttempt < 3 && !installed; t2bAttempt++) {
                  try {
                    const pypiRes = await fetch(`https://pypi.org/pypi/${pkg}/json`);
                    if (!pypiRes.ok) throw new Error(`Not found on PyPI`);
                    const pypiData = await pypiRes.json();
                    const urls: any[] = pypiData.urls || [];
                    const wheel = urls.find((u: any) =>
                      u.packagetype === 'bdist_wheel' &&
                      u.filename.endsWith('-none-any.whl')
                    );
                    if (!wheel) throw new Error(`No pure Python wheel found on PyPI`);
                    if (t2bAttempt === 0) {
                      setTerminalOutput(prev => [...prev, `[Tier 2b] Found wheel: ${wheel.filename}`]);
                    }
                    await micropipInstallWithRetry(wheel.url);
                    setTerminalOutput(prev => [...prev, `[Tier 2] Installed ${pkg} from direct wheel URL`]);
                    installed = true;
                    installSource = 'micropip';
                  } catch (directErr) {
                    const errMsg = directErr instanceof Error ? directErr.message : String(directErr);
                    const conflict = errMsg.match(/Requested '([^']+)'.*but\s+(\S+)==\S+\s+is already installed/);
                    if (conflict && t2bAttempt < 2) {
                      setTerminalOutput(prev => [...prev, `[Tier 2b] Version conflict on attempt ${t2bAttempt + 1}, upgrading ${conflict[2]} and retrying...`]);
                      try { await upgradePkg(conflict[2]); } catch { }
                    } else {
                      setTerminalOutput(prev => [...prev, `[Tier 2] Failed: ${errMsg}`]);
                      break;
                    }
                  }
                }
              }
            }
          }

          // --- Tier 3: Build from source (only with -force flag) ---
          if (!installed && !forceFlag) {
            setTerminalOutput(prev => [...prev, `pip install failed. Try: pip install ${pkg} -force (builds from source)`]);
          } else if (!installed && forceFlag) {
            setTerminalOutput(prev => [...prev, `[Tier 3] Attempting to build ${pkg} from source...`]);
            try {
              const pypiRes = await fetch(`https://pypi.org/pypi/${pkg}/json`);
              if (!pypiRes.ok) throw new Error(`Package "${pkg}" not found on PyPI`);
              const pypiData = await pypiRes.json();
              const version = pypiData.info.version;
              const urls: any[] = pypiData.urls || [];

              const sdist = urls.find((u: any) => u.packagetype === 'sdist');
              if (!sdist) throw new Error(`No source distribution found for ${pkg}==${version}`);

              setTerminalOutput(prev => [...prev, `[Tier 3] Downloading source: ${pkg}==${version}...`]);
              const sdistRes = await fetch(sdist.url);
              if (!sdistRes.ok) throw new Error(`Failed to download sdist`);
              const sdistBytes = new Uint8Array(await sdistRes.arrayBuffer());

              setTerminalOutput(prev => [...prev, `[Tier 3] Extracting source archive...`]);
              const archivePath = `/tmp/_sdist_${pkg}.tar.gz`;
              pyodide.FS.writeFile(archivePath, sdistBytes);

              const buildInfoJson = await pyodide.runPythonAsync(`
import tarfile, zipfile, io, os, json, glob, site as _site

_archive_path = ${JSON.stringify(archivePath)}
_build_dir = "/tmp/_pip_build_${pkg}"
if os.path.exists(_build_dir):
    import shutil
    shutil.rmtree(_build_dir)
os.makedirs(_build_dir, exist_ok=True)

with open(_archive_path, 'rb') as _f:
    _data = _f.read()

_bio = io.BytesIO(_data)
_extracted = False
for _opener in [
    lambda b: tarfile.open(fileobj=b, mode='r:gz'),
    lambda b: tarfile.open(fileobj=b, mode='r:bz2'),
    lambda b: tarfile.open(fileobj=b, mode='r:xz'),
    lambda b: tarfile.open(fileobj=b),
    lambda b: zipfile.ZipFile(b),
]:
    _bio.seek(0)
    try:
        _arc = _opener(_bio)
        if isinstance(_arc, zipfile.ZipFile):
            _arc.extractall(_build_dir)
            _arc.close()
        else:
            _arc.extractall(_build_dir)
            _arc.close()
        _extracted = True
        break
    except Exception:
        continue

if not _extracted:
    raise RuntimeError("Could not extract source archive")

_entries = os.listdir(_build_dir)
_pkg_dir = _build_dir
if len(_entries) == 1 and os.path.isdir(os.path.join(_build_dir, _entries[0])):
    _pkg_dir = os.path.join(_build_dir, _entries[0])

_c_files = glob.glob(os.path.join(_pkg_dir, '**', '*.c'), recursive=True)
_c_files += glob.glob(os.path.join(_pkg_dir, '**', '*.cpp'), recursive=True)
_c_files += glob.glob(os.path.join(_pkg_dir, '**', '*.cxx'), recursive=True)

_py_count = 0
for _root, _dirs, _fnames in os.walk(_pkg_dir):
    for _fn in _fnames:
        if _fn.endswith(('.py', '.pyi')):
            _py_count += 1

_sp = _site.getsitepackages()
_site_packages = _sp[0] if _sp else "/lib/python{}.{}/site-packages".format(*__import__('sys').version_info[:2])

import sysconfig as _sysconfig
_py_include = _sysconfig.get_path('include') or ''
_c_rels = [os.path.relpath(f, _pkg_dir) for f in _c_files]

json.dumps({
    "pkg_dir": _pkg_dir,
    "c_files": _c_rels,
    "py_count": _py_count,
    "has_native": len(_c_files) > 0,
    "site_packages": _site_packages,
    "py_include": _py_include
})
`);
              const buildInfo = JSON.parse(buildInfoJson);
              setTerminalOutput(prev => [...prev,
              `[Tier 3] Source extracted: ${buildInfo.py_count} Python files, ${buildInfo.c_files.length} C/C++ files`
              ]);

              if (buildInfo.has_native) {
                setTerminalOutput(prev => [...prev, `[Tier 3] Native extensions detected. Loading in-browser C compiler (Clang via Wasmer ~100MB)...`]);
                try {
                  if (!crossOriginIsolated) {
                    throw new Error('SharedArrayBuffer not available. Restart the dev server for Cross-Origin-Isolation headers to take effect, then hard-refresh (Ctrl+Shift+R).');
                  }
                  const compiledFiles: { baseName: string; wasmBytes: Uint8Array }[] = [];
                  {
                    const wasmerSdk = await import('@wasmer/sdk');
                    await (wasmerSdk as any).init();
                    setTerminalOutput(prev => [...prev, '  Downloading clang compiler (~106MB)...']);
                    const clangRes = await fetch('/clang.webc');
                    if (!clangRes.ok) throw new Error('Failed to fetch /clang.webc');
                    const clangBytes = await clangRes.arrayBuffer();
                    const clang = await wasmerSdk.Wasmer.fromFile(new Uint8Array(clangBytes));
                    setTerminalOutput(prev => [...prev, `[Tier 3] Clang compiler loaded. Preparing source tree...`]);

                    // Collect all package source/header files + Python headers in one Python call
                    const allFilesJson: string = await pyodide.runPythonAsync(`
import os as _os, json as _json
_pkg = ${JSON.stringify(buildInfo.pkg_dir)}
_pyinc = ${JSON.stringify(buildInfo.py_include)}
_result = {}
for _root, _dirs, _fnames in _os.walk(_pkg):
    for _fn in _fnames:
        if _fn.endswith(('.c','.cpp','.cxx','.h','.hpp','.hh','.inc')):
            _full = _os.path.join(_root, _fn)
            _rel = _os.path.relpath(_full, _pkg)
            try:
                with open(_full, 'r', errors='replace') as _fp:
                    _result['src/' + _rel] = _fp.read()
            except Exception:
                pass
if _pyinc and _os.path.isdir(_pyinc):
    for _root, _dirs, _fnames in _os.walk(_pyinc):
        for _fn in _fnames:
            if _fn.endswith('.h'):
                _full = _os.path.join(_root, _fn)
                _rel = _os.path.relpath(_full, _pyinc)
                try:
                    with open(_full, 'r', errors='replace') as _fp:
                        _result['pyinclude/' + _rel] = _fp.read()
                except Exception:
                    pass
_json.dumps(_result)
`);
                    const allFiles: Record<string, string> = JSON.parse(allFilesJson);

                    // If Pyodide didn't have Python headers, fetch pre-packaged CPython headers
                    const hasPyHeaders = Object.keys(allFiles).some(p => p.startsWith('pyinclude/') && p.endsWith('.h'));
                    if (!hasPyHeaders) {
                      setTerminalOutput(prev => [...prev, '  Python headers not found in runtime, downloading CPython headers...']);
                      const hdrRes = await fetch('/cpython-headers.zip');
                      if (hdrRes.ok) {
                        const hdrZip = new Uint8Array(await hdrRes.arrayBuffer());
                        const hdrView = new DataView(hdrZip.buffer, hdrZip.byteOffset, hdrZip.byteLength);
                        const decoder = new TextDecoder();
                        let off = 0;
                        while (off < hdrZip.length - 4) {
                          const sig = hdrView.getUint32(off, true);
                          if (sig !== 0x04034b50) break;
                          const compSize = hdrView.getUint32(off + 18, true);
                          const fnLen = hdrView.getUint16(off + 26, true);
                          const extraLen = hdrView.getUint16(off + 28, true);
                          const fn = decoder.decode(hdrZip.subarray(off + 30, off + 30 + fnLen));
                          const fileData = hdrZip.subarray(off + 30 + fnLen + extraLen, off + 30 + fnLen + extraLen + compSize);
                          if (fn.endsWith('.h') && compSize > 0) {
                            const cleanPath = fn.startsWith('./') ? fn.slice(2) : fn;
                            allFiles[`pyinclude/${cleanPath}`] = decoder.decode(fileData);
                          }
                          off += 30 + fnLen + extraLen + compSize;
                        }
                        const hdrCount = Object.keys(allFiles).filter(p => p.startsWith('pyinclude/')).length;
                        setTerminalOutput(prev => [...prev, `  Loaded ${hdrCount} CPython headers`]);
                      }
                    }

                    const fileCount = Object.keys(allFiles).length;
                    setTerminalOutput(prev => [...prev, `  Loaded ${fileCount} source/header files into virtual filesystem`]);

                    const project = new wasmerSdk.Directory();
                    const createdDirs = new Set<string>();
                    for (const filePath of Object.keys(allFiles)) {
                      const parts = filePath.split('/');
                      for (let i = 1; i < parts.length; i++) {
                        const dir = parts.slice(0, i).join('/');
                        if (!createdDirs.has(dir)) {
                          try { await project.createDir(dir); } catch { }
                          createdDirs.add(dir);
                        }
                      }
                    }
                    for (const [path, content] of Object.entries(allFiles)) {
                      await project.writeFile(path, content);
                    }

                    setTerminalOutput(prev => [...prev, `[Tier 3] Compiling ${buildInfo.c_files.length} source files...`]);

                    for (const cRel of buildInfo.c_files) {
                      const fileName = cRel.split('/').pop()!;
                      const baseName = fileName.replace(/\.(c|cpp|cxx)$/, '');
                      const dirName = cRel.includes('/') ? cRel.substring(0, cRel.lastIndexOf('/')) : '';

                      setTerminalOutput(prev => [...prev, `  Compiling ${cRel}...`]);
                      const incArgs = [
                        "-I", "/project/pyinclude",
                        "-I", "/project/src",
                      ];
                      if (dirName) {
                        incArgs.push("-I", `/project/src/${dirName}`);
                      }

                      const instance = await clang.entrypoint!.run({
                        args: [
                          `/project/src/${cRel}`,
                          "-c",
                          "-o", `/project/out_${baseName}.wasm`,
                          "-target", "wasm32-unknown-emscripten",
                          "-fno-integrated-cc1",
                          "-fPIC", "-O2",
                          ...incArgs,
                          "-Wno-implicit-int",
                          "-Wno-implicit-function-declaration",
                          "-Wno-incompatible-library-redeclaration",
                        ],
                        mount: { "/project": project },
                      });
                      const result = await instance.wait();
                      const stderr = (result.stderr || '').trim();
                      const stdout = (result.stdout || '').trim();
                      if (!result.ok) {
                        setTerminalOutput(prev => [...prev, `  FAIL ${cRel} (exit ${result.code})`]);
                        if (stderr) for (const line of stderr.split('\n')) setTerminalOutput(prev => [...prev, `    ${line}`]);
                        if (stdout) for (const line of stdout.split('\n')) setTerminalOutput(prev => [...prev, `    ${line}`]);
                      } else {
                        if (stderr) {
                          const warnings = stderr.split('\n').filter(l => l.includes('warning:'));
                          if (warnings.length > 0) setTerminalOutput(prev => [...prev, `  Compiled ${cRel} (${warnings.length} warning${warnings.length > 1 ? 's' : ''})`]);
                          else setTerminalOutput(prev => [...prev, `  Compiled ${cRel}`]);
                        } else {
                          setTerminalOutput(prev => [...prev, `  Compiled ${cRel}`]);
                        }
                        try {
                          const wasmBytes = await project.readFile(`out_${baseName}.wasm`);
                          if (wasmBytes && wasmBytes.byteLength > 0) {
                            compiledFiles.push({ baseName, wasmBytes: new Uint8Array(wasmBytes) });
                          }
                        } catch {
                          setTerminalOutput(prev => [...prev, `  Warning: Could not read compiled ${baseName}`]);
                        }
                      }
                    }
                  }

                  const failed = buildInfo.c_files.length - compiledFiles.length;
                  if (compiledFiles.length > 0) {
                    for (const { baseName, wasmBytes } of compiledFiles) {
                      const destPath = `${buildInfo.site_packages}/${baseName}.so`;
                      pyodide.FS.writeFile(destPath, wasmBytes);
                      setTerminalOutput(prev => [...prev, `  Installed ${baseName}.so into site-packages`]);
                    }
                    setTerminalOutput(prev => [...prev, `[Tier 3] ${compiledFiles.length}/${buildInfo.c_files.length} native extensions compiled${failed > 0 ? ` (${failed} failed)` : ''}`]);
                  } else {
                    setTerminalOutput(prev => [...prev, `[Tier 3] All ${buildInfo.c_files.length} native extensions failed to compile`]);
                  }
                } catch (clangErr) {
                  setTerminalOutput(prev => [...prev, `[Tier 3] Native compilation unavailable: ${clangErr instanceof Error ? clangErr.message : String(clangErr)}`]);
                  setTerminalOutput(prev => [...prev, `[Tier 3] Installing pure Python portions only...`]);
                }
              }

              // Install the pure Python portions into Pyodide's filesystem
              const installResultJson = await pyodide.runPythonAsync(`
import os, sys, json, configparser

_pkg_dir = ${JSON.stringify(buildInfo.pkg_dir)}
_pkg_name = ${JSON.stringify(pkg)}
_version = ${JSON.stringify(version)}
_sp = ${JSON.stringify(buildInfo.site_packages)}

# --- Detect the actual source root (handle src/ layout) ---
_src_dir = os.path.join(_pkg_dir, 'src')
_source_root = _src_dir if os.path.isdir(_src_dir) else _pkg_dir

# --- Try to discover the importable package name from metadata ---
_import_names = set()

# Check setup.cfg
_setup_cfg = os.path.join(_pkg_dir, 'setup.cfg')
if os.path.isfile(_setup_cfg):
    _cfg = configparser.ConfigParser()
    _cfg.read(_setup_cfg)
    _pf = _cfg.get('options', 'packages', fallback='')
    if 'find' not in _pf:
        for _p in _pf.split(','):
            _p = _p.strip()
            if _p:
                _import_names.add(_p.split('.')[0])
    _name = _cfg.get('options', 'py_modules', fallback='')
    for _m in _name.split(','):
        _m = _m.strip()
        if _m:
            _import_names.add(_m)

# Check pyproject.toml (basic parsing)
_pyproject = os.path.join(_pkg_dir, 'pyproject.toml')
if os.path.isfile(_pyproject):
    try:
        with open(_pyproject, 'r') as _f:
            _toml_text = _f.read()
        import re as _re
        for _match in _re.finditer(r'packages\s*=\s*\[([^\]]*)\]', _toml_text):
            for _p in _re.findall(r'"([^"]+)"', _match.group(1)):
                _import_names.add(_p.split('.')[0])
    except Exception:
        pass

# If no metadata found, scan for directories with __init__.py or standalone .py modules
if not _import_names:
    for _entry in os.listdir(_source_root):
        _entry_path = os.path.join(_source_root, _entry)
        if os.path.isdir(_entry_path) and os.path.isfile(os.path.join(_entry_path, '__init__.py')):
            _import_names.add(_entry)
        elif _entry.endswith('.py') and _entry not in ('setup.py', 'conftest.py', 'noxfile.py', 'tasks.py'):
            _import_names.add(_entry[:-3])

_skip_names = {'setup', 'test', 'tests', 'docs', 'doc', 'examples', 'benchmarks',
               'bench', 'scripts', 'tools', 'ci', 'build', 'dist', 'egg-info'}
_import_names = {n for n in _import_names if n and n not in _skip_names and not n.startswith(('_', '.'))}

# Fallback: normalize package name as module name
if not _import_names:
    _import_names = {_pkg_name.replace('-', '_').lower()}

# --- Copy package files from source_root to site-packages ---
_file_count = 0
_installed_records = []
for _mod_name in _import_names:
    _mod_src = os.path.join(_source_root, _mod_name)

    # Single-file module
    _single_file = _mod_src + '.py'
    if os.path.isfile(_single_file):
        _dest = os.path.join(_sp, _mod_name + '.py')
        with open(_single_file, 'r', errors='replace') as _sf:
            _c = _sf.read()
        with open(_dest, 'w') as _df:
            _df.write(_c)
        _file_count += 1
        _installed_records.append(_mod_name + '.py')
        continue

    # Package directory
    if not os.path.isdir(_mod_src):
        continue
    for _root, _dirs, _fnames in os.walk(_mod_src):
        _dirs[:] = [d for d in _dirs if not d.startswith('.')]
        for _fn in _fnames:
            if not _fn.endswith(('.py', '.pyi', '.json', '.txt', '.cfg', '.ini', '.typed')):
                continue
            _full = os.path.join(_root, _fn)
            _rel = os.path.relpath(_full, _source_root)
            _dest = os.path.join(_sp, _rel)
            os.makedirs(os.path.dirname(_dest), exist_ok=True)
            try:
                with open(_full, 'r', errors='replace') as _sf:
                    _c = _sf.read()
                if len(_c) < 500000:
                    with open(_dest, 'w') as _df:
                        _df.write(_c)
                    _file_count += 1
                    _installed_records.append(_rel)
            except Exception:
                pass

# --- Create .dist-info so importlib.metadata recognizes the package ---
if _file_count > 0:
    _dist_dir = os.path.join(_sp, f"{_pkg_name.replace('-','_')}-{_version}.dist-info")
    os.makedirs(_dist_dir, exist_ok=True)

    with open(os.path.join(_dist_dir, 'METADATA'), 'w') as _mf:
        _mf.write(f"Metadata-Version: 2.1\\nName: {_pkg_name}\\nVersion: {_version}\\n")

    with open(os.path.join(_dist_dir, 'INSTALLER'), 'w') as _inf:
        _inf.write("codecraft-pip-tier3\\n")

    with open(os.path.join(_dist_dir, 'RECORD'), 'w') as _rf:
        for _rec in _installed_records:
            _rf.write(f"{_rec},,\\n")
        _rf.write(f"{_pkg_name.replace('-','_')}-{_version}.dist-info/METADATA,,\\n")
        _rf.write(f"{_pkg_name.replace('-','_')}-{_version}.dist-info/INSTALLER,,\\n")
        _rf.write(f"{_pkg_name.replace('-','_')}-{_version}.dist-info/RECORD,,\\n")

    _top_level = os.path.join(_dist_dir, 'top_level.txt')
    with open(_top_level, 'w') as _tlf:
        _tlf.write("\\n".join(_import_names) + "\\n")

# --- Clear importer caches so Python discovers the new modules ---
sys.path_importer_cache.clear()

# Also clear any failed import attempts from sys.modules
for _mod in list(sys.modules.keys()):
    if any(_mod == n or _mod.startswith(n + '.') for n in _import_names):
        if isinstance(sys.modules[_mod], type(None)) or sys.modules[_mod] is None:
            del sys.modules[_mod]

json.dumps({"modules": list(_import_names), "count": _file_count})
`);
              const installResult = JSON.parse(installResultJson);
              if (installResult.count > 0) {
                setTerminalOutput(prev => [...prev, `[Tier 3] Installed ${installResult.count} files (modules: ${installResult.modules.join(', ')})`]);
                installed = true;
                installSource = 'sdist';
              } else {
                throw new Error(`No installable Python files found in ${pkg} source`);
              }

              // Clean up temp files
              try { pyodide.FS.unlink(archivePath); } catch { }
            } catch (buildErr) {
              setTerminalOutput(prev => [...prev, `[Tier 3] Build from source failed: ${buildErr instanceof Error ? buildErr.message : String(buildErr)}`]);
            }
          }

          if (installed) {
            let installedVersion = '';
            if (!/^https?:\/\//i.test(pkg)) {
              try {
                const pypiRes2 = await fetch(`https://pypi.org/pypi/${pkg}/json`);
                if (pypiRes2.ok) installedVersion = (await pypiRes2.json()).info.version;
              } catch { }
            }
            setTerminalOutput(prev => [...prev, `Successfully installed ${pkg}${installedVersion ? `==${installedVersion}` : ''}`]);
            try {
              await syncInstalledPythonPackageSupport(
                pkg,
                installedVersion,
                installSource || 'micropip',
                msg => setTerminalOutput(prev => [...prev, msg])
              );
            } catch (stubErr) {
              setTerminalOutput(prev => [...prev, `Warning: Could not update language support: ${stubErr instanceof Error ? stubErr.message : String(stubErr)}`]);
            }
          }
        } catch (err) {
          setTerminalOutput(prev => [...prev, `pip error: ${err instanceof Error ? err.message : String(err)}`]);
        }
      } else if (subCmd === 'uninstall' && pkg) {
        try {
          await ensurePyodideWithPackages(msg => setTerminalOutput(prev => [...prev, msg]));
          const pyodide = (window as any).pyodide;
          await pyodide.loadPackage("micropip");
          const micropip = pyodide.pyimport("micropip");
          micropip.uninstall(pkg);
          const normalizedPkg = normalizeSavedPipPackageName(pkg);
          const stubContribution = pythonStubContributionsRef.current[normalizedPkg];
          if (stubContribution && Object.keys(stubContribution).length > 0) {
            const pyright = await ensurePythonAuthoringReady();
            await pyright.reloadPyrightAfterRemovingStubContribution(stubContribution);
            await refreshPythonDiagnostics();
          }
          forgetCachedPyodidePackageMeta(pkg);
          removeSavedPipPackage(pkg);
          await persistPyodidePackageMetaCache();
          await capturePyodidePackageRestoreSnapshot();
          setTerminalOutput([...newOutput, `Successfully uninstalled ${pkg}`]);
        } catch (err) {
          setTerminalOutput([...newOutput, `pip uninstall error: ${err instanceof Error ? err.message : String(err)}`]);
        }
      } else if (subCmd === 'include' && pkg) {
        setTerminalOutput([...newOutput, `Including '${pkg}' in Pyright type checker...`]);
        try {
          const pyright = await ensurePythonAuthoringReady();
          const reloaded = await pyright.includeTypeshedModule(pkg, msg => setTerminalOutput(prev => [...prev, msg]));
          if (reloaded || pyright.isModuleIncluded(pkg)) {
            addSavedPipIncludedModule(pkg);
            if ((window as any).pyodide) {
              try {
                await capturePyodidePackageRestoreSnapshot();
              } catch (snapshotErr) {
                setTerminalOutput(prev => [...prev, `Warning: failed to cache installed packages before restarting Pyodide: ${snapshotErr instanceof Error ? snapshotErr.message : String(snapshotErr)}`]);
              }
              unloadPyodide();
              setTerminalOutput(prev => [
                ...prev,
                'Pyodide runtime unloaded. The next Python action will boot with the updated filtered stdlib.'
              ]);
            }
          }
          if (reloaded) {
            await refreshPythonDiagnostics();
          }
        } catch (err) {
          setTerminalOutput(prev => [...prev, `pip include error: ${err instanceof Error ? err.message : String(err)}`]);
        }
      } else if (subCmd === 'list') {
        const saved = loadSavedPipPackages();
        if (saved.length === 0) {
          setTerminalOutput([...newOutput, 'No packages installed.']);
        } else {
          setTerminalOutput([...newOutput, `Installed packages (${saved.length}):`, ...saved.map(p => `  ${p.name}${p.version ? `==${p.version}` : ''}`)]);
        }
      } else {
        setTerminalOutput([...newOutput, 'Usage: pip install <package> [-force] | pip upgrade <package> [-version <ver>] | pip uninstall <package> | pip include <module> | pip list']);
      }
    } else if (cmd === 'nuget') {
      const subCmd = (args[1] || '').toLowerCase();
      const namespaceName = args[2];

      if (subCmd === 'include' && namespaceName) {
        setTerminalOutput([...newOutput, `Including C# namespace '${namespaceName}'...`]);
        try {
          const csharpAuthoring = await ensureCSharpAuthoringReady();
          const result = await csharpAuthoring.csharpService.includeNamespace(namespaceName);
          if (result.success) {
            addSavedCSharpNamespace(namespaceName);
          }

          const lines = [result.message || `Finished processing '${namespaceName}'.`];
          if (result.matchedAssemblies && result.matchedAssemblies.length > 0) {
            lines.push(`Matched assemblies: ${result.matchedAssemblies.join(', ')}`);
          }
          if (result.addedAssemblies && result.addedAssemblies.length > 0) {
            lines.push(`Added metadata references: ${result.addedAssemblies.join(', ')}`);
          }
          setTerminalOutput(prev => [...prev, ...lines]);
        } catch (err) {
          setTerminalOutput(prev => [...prev, `nuget include error: ${err instanceof Error ? err.message : String(err)}`]);
        }
      } else if (subCmd === 'list') {
        const namespaces = loadSavedCSharpNamespaces();
        if (namespaces.length === 0) {
          setTerminalOutput([...newOutput, 'No C# namespaces have been included yet.']);
        } else {
          setTerminalOutput([...newOutput, `Included C# namespaces (${namespaces.length}):`, ...namespaces.map(name => `  ${name}`)]);
        }
      } else {
        setTerminalOutput([...newOutput, 'Usage: nuget include <namespace> | nuget list']);
      }
    } else if (cmd === 'help') {
      setTerminalOutput([...newOutput, 'Standard commands: ls, pwd, cd, mkdir, touch, open, cat, rm, clear, help, date, echo', 'Codex CLI: codex help | codex login | codex status | codex exec <prompt> | codex mcp list', 'Python: pip install <package> [-force] | pip upgrade <package> [-version <ver>] | pip uninstall <package> | pip include <module> | pip list', 'C#: nuget include <namespace> | nuget list']);
    } else if (cmd === 'date') {
      setTerminalOutput([...newOutput, new Date().toLocaleString()]);
    } else if (cmd === 'echo') {
      setTerminalOutput([...newOutput, args.slice(1).join(' ')]);
    } else if (cmd === 'whoami') {
      setTerminalOutput([...newOutput, 'codecraft-user']);
    } else if (cmd !== '') {
      setTerminalOutput([...newOutput, `Command not found: ${cmd}`]);
    } else {
      setTerminalOutput(newOutput);
    }

    if (clearInputAfter) setTerminalInput('');
  };

  const refreshSettingsPipPackages = () => {
    const saved = loadSavedPipPackages();
    setSettingsPipPackages(saved);
    return saved;
  };

  const refreshSettingsPipIncludedModules = () => {
    const saved = loadSavedPipIncludedModules();
    setSettingsPipIncludedModules(saved);
    return saved;
  };

  const refreshSettingsPyiImportSizeLimitOverrides = () => {
    const saved = loadSavedPyiImportSizeLimitOverrides();
    setSettingsPyiImportSizeLimitOverrides(saved);
    return saved;
  };

  const refreshSettingsCSharpNamespaces = () => {
    const saved = loadSavedCSharpNamespaces();
    setSettingsCSharpNamespaces(saved);
    return saved;
  };

  const formatSettingsPyiImportSizeLimit = (maxBytes: number | null) => {
    if (maxBytes == null) {
      return `Unlimited (up to ${formatByteSize(ABSOLUTE_PYI_IMPORT_SIZE_LIMIT_BYTES)} overall)`;
    }
    return formatByteSize(maxBytes);
  };

  const runSettingsPipCommand = async (command: string) => {
    setSettingsPipBusy(true);
    setSettingsPipStatus(`Running \`${command}\`. Detailed logs will appear in Terminal.`);
    try {
      await executeTerminalCommand(command, false);
      return refreshSettingsPipPackages();
    } finally {
      setSettingsPipBusy(false);
    }
  };

  const runSettingsPipIncludeCommand = async (command: string) => {
    setSettingsPipIncludeBusy(true);
    setSettingsPipIncludeStatus(`Running \`${command}\`. Detailed logs will appear in Terminal.`);
    try {
      await executeTerminalCommand(command, false);
      return refreshSettingsPipIncludedModules();
    } finally {
      setSettingsPipIncludeBusy(false);
    }
  };

  const runSettingsCSharpNamespaceCommand = async (command: string) => {
    setSettingsCSharpNamespaceBusy(true);
    setSettingsCSharpNamespaceStatus(`Running \`${command}\`. Detailed logs will appear in Terminal.`);
    try {
      await executeTerminalCommand(command, false);
      return refreshSettingsCSharpNamespaces();
    } finally {
      setSettingsCSharpNamespaceBusy(false);
    }
  };

  const handleSettingsPipApply = async () => {
    const pkg = settingsPipInput.trim();
    if (!pkg) {
      setSettingsPipStatus('Enter a Python package name first.');
      return;
    }

    const normalized = normalizeSavedPipPackageName(pkg);
    const alreadyInstalled = settingsPipPackages.some(p => p.name === normalized);
    const command = alreadyInstalled
      ? `pip upgrade ${pkg}`
      : `pip install ${pkg}${settingsPipForceBuild ? ' -force' : ''}`;

    const saved = await runSettingsPipCommand(command);
    const nowInstalled = saved.some(p => p.name === normalized);

    if (nowInstalled) {
      setSettingsPipStatus(
        alreadyInstalled
          ? `Finished checking ${normalized}. Review Terminal output for upgrade details.`
          : `Installed ${normalized}.`
      );
      if (!alreadyInstalled) {
        setSettingsPipInput('');
        setSettingsPipForceBuild(false);
      }
    } else {
      setSettingsPipStatus(`No saved package entry was added for ${normalized}. Check Terminal output for the failure details.`);
    }
  };

  const handleSettingsPipUninstall = async (pkg: string) => {
    const normalized = normalizeSavedPipPackageName(pkg);
    const saved = await runSettingsPipCommand(`pip uninstall ${normalized}`);
    if (saved.some(p => p.name === normalized)) {
      setSettingsPipStatus(`Could not remove ${normalized}. Check Terminal output for the failure details.`);
    } else {
      setSettingsPipStatus(`Removed ${normalized}.`);
    }
  };

  const handleSettingsPipIncludeApply = async () => {
    const moduleName = settingsPipIncludeInput.trim();
    if (!moduleName) {
      setSettingsPipIncludeStatus('Enter a Python module name first.');
      return;
    }

    const saved = await runSettingsPipIncludeCommand(`pip include ${moduleName}`);
    if (saved.includes(moduleName)) {
      setSettingsPipIncludeStatus(`Saved ${moduleName} for future restores.`);
      setSettingsPipIncludeInput('');
    } else {
      setSettingsPipIncludeStatus(`No saved include entry was added for ${moduleName}. Check Terminal output for the failure details.`);
    }
  };

  const handleSettingsPipIncludeRemove = async (moduleName: string) => {
    const next = settingsPipIncludedModules.filter(name => name !== moduleName);
    savePipIncludedModules(next);
    setSettingsPipIncludedModules(next);
    if ((window as any).pyodide) {
      try {
        await capturePyodidePackageRestoreSnapshot();
      } catch (snapshotErr) {
        setSettingsPipIncludeStatus(`Removed saved include ${moduleName}, but failed to cache installed packages before restart: ${snapshotErr instanceof Error ? snapshotErr.message : String(snapshotErr)}`);
      }
      unloadPyodide();
      setSettingsPipIncludeStatus(`Removed saved include ${moduleName}. Pyodide will reload with the reduced stdlib on the next Python action.`);
      return;
    }
    setSettingsPipIncludeStatus(`Removed saved include ${moduleName}.`);
  };

  const handleSettingsPyiImportSizeLimitApply = () => {
    const moduleName = normalizePyiImportSizeLimitModuleName(settingsPyiImportSizeLimitModuleInput);
    if (!moduleName) {
      setSettingsPyiImportSizeLimitStatus('Enter a module or package name first.');
      return;
    }

    let maxBytes: number | null = null;
    if (!settingsPyiImportSizeUnlimited) {
      const parsedKb = Number(settingsPyiImportSizeLimitInput);
      if (!Number.isFinite(parsedKb) || parsedKb <= 0) {
        setSettingsPyiImportSizeLimitStatus('Enter a positive size in KB or switch the override to Unlimited.');
        return;
      }
      maxBytes = Math.min(
        Math.max(1, Math.round(parsedKb * 1024)),
        ABSOLUTE_PYI_IMPORT_SIZE_LIMIT_BYTES
      );
    }

    const next = refreshSettingsPyiImportSizeLimitOverrides()
      .filter(override => override.moduleName !== moduleName);
    next.push({ moduleName, maxBytes });
    saveSavedPyiImportSizeLimitOverrides(next);
    setSettingsPyiImportSizeLimitOverrides(sortSavedPyiImportSizeLimitOverrides(next));
    setSettingsPyiImportSizeLimitStatus(
      maxBytes == null
        ? `Saved ${moduleName} with an unlimited per-module cap. It will apply the next time stubs are extracted for that module.`
        : `Saved ${moduleName} with a ${formatByteSize(maxBytes)} cap. It will apply the next time stubs are extracted for that module.`
    );
    setSettingsPyiImportSizeLimitModuleInput('');
    if (!settingsPyiImportSizeUnlimited) {
      setSettingsPyiImportSizeLimitInput(String(Math.max(1, Math.round(maxBytes! / 1024))));
    }
  };

  const handleSettingsPyiImportSizeLimitRemove = (moduleName: string) => {
    const next = settingsPyiImportSizeLimitOverrides.filter(override => override.moduleName !== moduleName);
    saveSavedPyiImportSizeLimitOverrides(next);
    setSettingsPyiImportSizeLimitOverrides(next);
    setSettingsPyiImportSizeLimitStatus(
      `Removed the custom stub cap for ${moduleName}. The default ${formatByteSize(DEFAULT_PYI_IMPORT_SIZE_LIMIT_BYTES)} cap will apply the next time stubs are extracted.`
    );
  };

  const handleSettingsCSharpNamespaceApply = async () => {
    const namespaceName = settingsCSharpNamespaceInput.trim();
    if (!namespaceName) {
      setSettingsCSharpNamespaceStatus('Enter a C# namespace first.');
      return;
    }

    const saved = await runSettingsCSharpNamespaceCommand(`nuget include ${namespaceName}`);
    if (saved.includes(namespaceName)) {
      setSettingsCSharpNamespaceStatus(`Saved ${namespaceName} for future restores.`);
      setSettingsCSharpNamespaceInput('');
    } else {
      setSettingsCSharpNamespaceStatus(`No saved namespace entry was added for ${namespaceName}. Check Terminal output for the failure details.`);
    }
  };

  const handleSettingsCSharpNamespaceRemove = (namespaceName: string) => {
    const next = settingsCSharpNamespaces.filter(name => name !== namespaceName);
    saveCSharpNamespaces(next);
    setSettingsCSharpNamespaces(next);
    setSettingsCSharpNamespaceStatus(`Removed saved namespace ${namespaceName}.`);
  };

  const handleTerminalCommand = async (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      await executeTerminalCommand(terminalInput, true);
    }
  };

  const toggleFolder = (id: string) => {
    setFiles(prev => prev.map(f => f.id === id ? { ...f, isOpen: !f.isOpen } : f));
  };

  const handleDrop = (targetId: string | null) => {
    if (!draggedItemId || draggedItemId === targetId) {
      setDraggedItemId(null);
      return;
    }

    const isChild = (childId: string, parentId: string): boolean => {
      const item = files.find(f => f.id === childId);
      if (!item || !item.parentId) return false;
      if (item.parentId === parentId) return true;
      return isChild(item.parentId, parentId);
    };

    if (targetId && isChild(targetId, draggedItemId)) {
      setDraggedItemId(null);
      return;
    }

    setFiles(prev => prev.map(f => f.id === draggedItemId ? { ...f, parentId: targetId } : f));
    setDraggedItemId(null);
  };

  const fileTreeCtx: FileTreeContextValue = {
    files, activeFileId, pendingNewItem, renamingId, renamingName, draggedItemId,
    openEditorTab, toggleFolder, setDraggedItemId, handleDrop, addNewItem,
    deleteItem, confirmRename, setRenamingId, setRenamingName, setPendingNewItem,
  };

  const factoryImpl = (node: TabNode) => {
    const component = node.getComponent();
    if (component === "editor") {
      const tabNodeId = node.getId();
      const tabItemId = (node as any).getConfig?.()?.itemId as string | undefined;
      const resolvedTabItemId = tabItemId || activeFileId;
      const tabItem = resolvedTabItemId ? files.find(f => f.id === resolvedTabItemId) : undefined;
      const editorModelPath = tabItem ? `codecraft-model/${tabItem.id}/${encodeURI(getPath(tabItem.id))}` : undefined;
      const shouldRenderSharedEditor =
        mountedSharedEditorTarget?.tabId === tabNodeId
        && mountedSharedEditorTarget.itemId === resolvedTabItemId;

      return (
        <div className="h-full w-full flex flex-col bg-[rgb(28,28,28)] text-zinc-300 relative">
          {pendingEdit ? (
            <div className="flex-1 flex flex-col">
              <div className="h-10 bg-indigo-900/30 border-b border-indigo-500/30 flex items-center justify-between px-4">
                <div className="flex items-center gap-2 text-xs font-medium text-indigo-300">
                  <Sparkles size={14} />
                  <span>Reviewing changes to {files.find(f => f.id === pendingEdit.fileId)?.name}</span>
                  {pendingEdits.length > 1 ? (
                    <span className="text-[10px] text-indigo-200/80">
                      ({pendingEdits.length - 1} more queued)
                    </span>
                  ) : null}
                </div>
                <div className="flex items-center gap-2">
                  <button onClick={declineEdit} className="px-3 py-1 rounded bg-red-500/20 hover:bg-red-500/30 text-red-400 text-xs font-semibold transition-all flex items-center gap-1">
                    <X size={14} /> Decline
                  </button>
                  <button onClick={acceptEdit} className="px-3 py-1 rounded bg-emerald-500/20 hover:bg-emerald-500/30 text-emerald-400 text-xs font-semibold transition-all flex items-center gap-1">
                    <Check size={14} /> Accept
                  </button>
                </div>
              </div>
              <div className="flex-1 overflow-hidden">
                <DiffEditor height="100%" original={pendingEdit.originalContent} modified={pendingEdit.proposedContent} language={files.find(f => f.id === pendingEdit.fileId)?.language} theme="vs-dark" options={{ fontSize: 14, fontFamily: '"JetBrains Mono", "Fira Code", monospace', minimap: { enabled: false }, scrollBeyondLastLine: false, automaticLayout: true, renderSideBySide: true, readOnly: true }} />
              </div>
            </div>
          ) : !tabItem ? (
            <div className="flex-1 flex flex-col items-center justify-center bg-[rgb(28,28,28)] text-zinc-500 p-8 text-center">
              <div className="w-20 h-20 bg-white/5 rounded-3xl flex items-center justify-center mb-6"><Code2 size={40} className="text-zinc-400" /></div>
              <h2 className="text-xl font-semibold text-white mb-2">Welcome to CodeCraft IDE</h2>
              <p className="max-w-md text-sm leading-relaxed mb-8">Select a file from the sidebar to start editing, or create a new one to begin your project.</p>
              <div className="flex gap-4">
                <button onClick={() => addNewItem('file', null, 'inline')} className="flex items-center gap-2 px-6 py-2.5 bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl text-sm font-semibold transition-all shadow-lg shadow-indigo-900/20"><FilePlus size={18} /> New File</button>
                <button onClick={() => addNewItem('folder', null, 'inline')} className="flex items-center gap-2 px-6 py-2.5 bg-white/5 hover:bg-white/10 text-white rounded-xl text-sm font-semibold transition-all border border-white/10"><FolderPlus size={18} /> New Folder</button>
              </div>
            </div>
          ) : tabItem.type === 'folder' ? (
            <div className="flex-1 bg-[rgb(28,28,28)] p-8 overflow-y-auto w-full h-full relative">
              <div className="max-w-4xl mx-auto">
                <div className="flex items-center gap-4 mb-8">
                  <div className="w-16 h-16 bg-amber-500/10 rounded-2xl flex items-center justify-center">
                    <Folder size={32} className="text-amber-500" />
                  </div>
                  <div className="flex-1">
                    <h2 className="text-2xl font-bold text-white">{tabItem.name}</h2>
                    <p className="text-zinc-500 text-sm">{getPath(tabItem.id)}</p>
                  </div>
                  {activeSyncIds.has(tabItem.id) ? (
                    <div className="flex items-center gap-2">
                      <span className="flex items-center gap-1.5 text-xs text-emerald-400 bg-emerald-500/10 border border-emerald-500/20 rounded-lg px-3 py-1.5">
                        <FolderSync size={12} /> Synced
                      </span>
                      <button onClick={() => stopFolderSync(tabItem.id)} className="flex items-center gap-1.5 text-xs text-red-400 bg-red-500/10 hover:bg-red-500/20 border border-red-500/20 rounded-lg px-3 py-1.5 transition-all cursor-pointer">
                        <Unlink size={12} /> Unsync
                      </button>
                    </div>
                  ) : (
                    <button onClick={() => startFolderSync(tabItem.id)} className="flex items-center gap-2 px-4 py-2 bg-emerald-600 hover:bg-emerald-500 text-white rounded-xl text-sm font-semibold transition-all cursor-pointer">
                      <FolderSync size={16} /> Sync with Local Folder
                    </button>
                  )}
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                  {files.filter(f => f.parentId === tabItem.id).map(child => (
                    <div key={child.id} onClick={() => { openEditorTab(child.id); if (child.type === 'folder') toggleFolder(child.id); }} className="p-4 rounded-xl bg-white/5 border border-white/10 hover:bg-white/10 hover:border-indigo-500/30 transition-all cursor-pointer group">
                      <div className="flex items-center gap-3">
                        {child.type === 'folder' ? <Folder size={20} className="text-amber-400" /> : <FileCode size={20} className="text-indigo-400" />}
                        <span className="text-sm font-medium text-zinc-300 group-hover:text-white transition-colors">{child.name}</span>
                      </div>
                    </div>
                  ))}
                  <div onClick={() => addNewItem('file', tabItem.id)} className="p-4 rounded-xl border border-dashed border-white/10 hover:border-indigo-500/50 hover:bg-indigo-500/5 transition-all cursor-pointer flex items-center gap-3 text-zinc-500 hover:text-indigo-400">
                    <Plus size={20} /> <span className="text-sm font-medium">Add File</span>
                  </div>
                  <div onClick={() => addNewItem('folder', tabItem.id)} className="p-4 rounded-xl border border-dashed border-white/10 hover:border-amber-500/50 hover:bg-amber-500/5 transition-all cursor-pointer flex items-center gap-3 text-zinc-500 hover:text-amber-400">
                    <FolderPlus size={20} /> <span className="text-sm font-medium">Add Folder</span>
                  </div>
                </div>
              </div>
            </div>
          ) : (
            <div className="flex-1 overflow-hidden bg-[rgb(28,28,28)] w-full min-h-0 relative">
              {shouldRenderSharedEditor ? (
                <Editor
                  key={`shared-editor:${mountedSharedEditorTarget.version}`}
                  defaultPath={editorModelPath}
                  saveViewState={false}
                  keepCurrentModel={false}
                  height="100%"
                  defaultLanguage={tabItem.language}
                  language={tabItem.language}
                  theme="vs-dark"
                  value={tabItem.content}
                  onMount={handleEditorMount}
                  onChange={(value) => {
                    setFiles(prev => prev.map(f => f.id === resolvedTabItemId ? { ...f, content: value || '' } : f));
                  }}
                  options={buildSharedEditorOptions(settings.fontSize)}
                />
              ) : (
                <div className="h-full w-full bg-[rgb(28,28,28)]" />
              )}
            </div>
          )}
        </div>
      );
    }

    if (component === "terminal") {
      return (
        <div className="h-full w-full flex flex-col bg-[rgb(28,28,28)] text-zinc-300 border-white/10 group relative">
          <button onClick={() => setTerminalOutput([])} className="absolute top-2 right-4 text-[10px] px-2 py-1 rounded bg-white/5 hover:bg-white/10 text-zinc-500 hover:text-white transition-all z-10 opacity-0 group-hover:opacity-100 backdrop-blur-sm cursor-pointer">Reset</button>
          <div ref={terminalContainerRef} className="flex-1 p-4 font-mono text-sm overflow-y-auto flex flex-col custom-scrollbar">
            <div className="space-y-1 mb-2">
              {terminalOutput.map((line, i) => <div key={i} className="text-zinc-400">{line}</div>)}
            </div>
            <div className="flex items-center gap-2">
              <span className="text-zinc-500 font-mono text-xs">{terminalCwd ? getPath(terminalCwd) : '~'}</span>
              <span className="text-indigo-400 font-bold">$</span>
              <input type="text" value={terminalInput} onChange={(e) => setTerminalInput(e.target.value)} onKeyDown={handleTerminalCommand} className="flex-1 bg-transparent border-none outline-none text-white p-0 m-0 font-mono text-sm" autoFocus={false} />
            </div>
          </div>
        </div>
      );
    }

    if (component === "output") {
      return (
        <div className="h-full w-full flex flex-col bg-[rgb(28,28,28)] text-zinc-300 border-white/10 group relative">
            <button
            onClick={() => {
              setExecutionStartupStatus('');
              clearOutputPreview();
              setOutput('');
            }}
            className="absolute top-2 right-4 text-[10px] px-2 py-1 rounded bg-white/5 hover:bg-white/10 text-zinc-500 hover:text-white transition-all z-10 opacity-0 group-hover:opacity-100 backdrop-blur-sm cursor-pointer"
          >
            Clear
          </button>
          <div ref={outputContainerRef} className="flex-1 p-4 font-mono text-sm overflow-y-auto custom-scrollbar">
            {outputPreviewHtml ? (
              <iframe
                title="output-preview"
                srcDoc={outputPreviewHtml}
                className="w-full h-full border-none bg-white rounded-md"
                sandbox="allow-scripts"
              />
            ) : (
              <div className="min-h-full flex flex-col justify-end gap-2">
                {executionStartupStatus ? (
                  <div className="whitespace-pre-wrap text-zinc-500">
                    {executionStartupStatus}
                  </div>
                ) : null}
                <div className="whitespace-pre-wrap text-zinc-400 leading-relaxed">
                  <span>{output}</span>
                  {outputInteraction && (
                    <>
                      {getVisibleOutputInteractionMessage(outputInteraction) ? (
                        <span className="text-zinc-300">
                          {getVisibleOutputInteractionMessage(outputInteraction)}
                        </span>
                      ) : null}
                      {(outputInteraction.kind === 'stdin' || outputInteraction.kind === 'prompt') && (
                        <input
                          ref={outputInteractionInputRef}
                          type="text"
                          value={outputInteractionInput}
                          onChange={(e) => setOutputInteractionInput(e.target.value)}
                          onKeyDown={(e) => {
                            if (e.key === 'Escape') {
                              resolveOutputPanelInteraction(null);
                              return;
                            }
                            if (e.key !== 'Enter') return;
                            e.preventDefault();
                            if (outputInteraction.kind === 'stdin') {
                              if (outputInteraction.inputMode === 'buffered-lines') {
                                if (outputInteractionInput === '' && outputInteractionBufferedLines.length > 0) {
                                  submitOutputPanelStdinInteraction();
                                  return;
                                }
                                queueBufferedOutputInteractionLine();
                              } else {
                                submitOutputPanelStdinInteraction();
                              }
                              return;
                            }
                            commitResolvedOutputInteraction(outputInteraction, outputInteractionInput);
                            resolveOutputPanelInteraction(outputInteractionInput);
                          }}
                          spellCheck={false}
                          className="inline-block align-baseline bg-transparent border-none outline-none text-white p-0 m-0 font-mono text-sm caret-indigo-400"
                          style={{
                            width: `${Math.max(
                              1,
                              outputInteractionInput.length + 1,
                              outputInteraction.defaultValue.length + (outputInteraction.defaultValue ? 1 : 0)
                            )}ch`,
                          }}
                        />
                      )}
                    </>
                  )}
                </div>
                {outputInteraction && (
                  <div className="flex flex-wrap gap-2">
                    {outputInteraction.kind === 'stdin' && outputInteraction.inputMode === 'buffered-lines' && (
                      <button
                        onClick={queueBufferedOutputInteractionLine}
                        className="px-3 py-1.5 rounded-lg bg-white/5 hover:bg-white/10 text-zinc-200 text-xs transition-colors"
                      >
                        Queue Line
                      </button>
                    )}
                    {outputInteraction.kind === 'stdin' && (
                      <>
                        <button
                          onClick={submitOutputPanelStdinInteraction}
                          className="px-3 py-1.5 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white text-xs transition-colors"
                        >
                          {outputInteraction.submitLabel || 'Send'}
                        </button>
                        <button
                          onClick={() => resolveOutputPanelInteraction(null)}
                          className="px-3 py-1.5 rounded-lg bg-white/5 hover:bg-white/10 text-zinc-200 text-xs transition-colors"
                        >
                          {outputInteraction.cancelLabel || 'Cancel'}
                        </button>
                      </>
                    )}
                    {outputInteraction.kind === 'alert' && (
                      <button
                        onClick={() => {
                          commitResolvedOutputInteraction(outputInteraction, undefined);
                          resolveOutputPanelInteraction(undefined);
                        }}
                        className="px-3 py-1.5 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white text-xs transition-colors"
                      >
                        Continue
                      </button>
                    )}
                    {outputInteraction.kind === 'confirm' && (
                      <>
                        <button
                          onClick={() => {
                            commitResolvedOutputInteraction(outputInteraction, true);
                            resolveOutputPanelInteraction(true);
                          }}
                          className="px-3 py-1.5 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white text-xs transition-colors"
                        >
                          OK
                        </button>
                        <button
                          onClick={() => {
                            commitResolvedOutputInteraction(outputInteraction, false);
                            resolveOutputPanelInteraction(false);
                          }}
                          className="px-3 py-1.5 rounded-lg bg-white/5 hover:bg-white/10 text-zinc-200 text-xs transition-colors"
                        >
                          Cancel
                        </button>
                      </>
                    )}
                    {outputInteraction.kind === 'prompt' && (
                      <>
                        <button
                          onClick={() => {
                            commitResolvedOutputInteraction(outputInteraction, outputInteractionInput);
                            resolveOutputPanelInteraction(outputInteractionInput);
                          }}
                          className="px-3 py-1.5 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white text-xs transition-colors"
                        >
                          {outputInteraction.submitLabel || 'Submit'}
                        </button>
                        <button
                          onClick={() => resolveOutputPanelInteraction(null)}
                          className="px-3 py-1.5 rounded-lg bg-white/5 hover:bg-white/10 text-zinc-200 text-xs transition-colors"
                        >
                          {outputInteraction.cancelLabel || 'Cancel'}
                        </button>
                      </>
                    )}
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      );
    }

    if (component === "explorer") {
      return (
        <FileTreeContext.Provider value={fileTreeCtx}>
          <div className="h-full w-full flex flex-col bg-[rgb(28,28,28)] text-zinc-300 border-white/10 relative">
            <div
              className="flex-1 overflow-y-auto custom-scrollbar"
              onDragOver={(e) => e.preventDefault()}
              onDrop={() => handleDrop(null)}
            >
              {[...files.filter(f => !f.parentId), ...(pendingNewItem && !pendingNewItem.parentId ? [pendingNewItem] : [])].map(item => (
                <FileTreeItem key={item.id} item={item} />
              ))}
            </div>
          </div>
        </FileTreeContext.Provider>
      );
    }

    if (component === "assistant") {
      const chatId = ((node as any).getConfig?.()?.chatId as string) || INITIAL_ASSISTANT_CHAT_ID;
      const chat = assistantChats.find(c => c.id === chatId) || {
        id: chatId,
        name: DEFAULT_ASSISTANT_CHAT_NAME,
        messages: []
      };
      const chatInput = assistantInputs[chatId] || '';
      const isChatLoading = loadingAssistantChatId === chatId;
      const isHistoryOpen = !!assistantHistoryOpenByChatId[chatId];
      const tokenEstimate = assistantTokenEstimates[chatId];
      const lastTurnUsage = assistantTurnUsageByChatId[chatId];
      const assistantStatusLabel = `${getAssistantProviderLabel(settings.assistantProvider)} · ${settings.assistantModel || 'No model selected'}`;
      const assistantAuthStatusLabel = settings.assistantProvider === 'codex-cli'
        ? (assistantConfiguredOAuth ? 'OAuth connected' : 'Connect Codex OAuth')
        : (assistantConfiguredApiKey ? 'Legacy credential ready' : 'Switch to Codex CLI OAuth');

      return (
        <div className="h-full w-full bg-[rgb(28,28,28)] border-white/10 flex flex-col min-h-0 relative">
          <button
            type="button"
            onClick={() => setAssistantHistoryOpenByChatId(prev => ({ ...prev, [chatId]: !prev[chatId] }))}
            className="absolute top-2 right-3 z-10 text-[10px] px-2 py-1 rounded bg-white/5 hover:bg-white/10 text-zinc-500 hover:text-white transition-all backdrop-blur-sm"
          >
            <span className="inline-flex items-center gap-1">
              <History size={12} />
              History
            </span>
          </button>
          {isHistoryOpen && (
            <div className="absolute inset-3 z-20 rounded-xl border border-white/10 bg-[rgb(28,28,28)]/95 backdrop-blur-sm shadow-2xl flex flex-col">
              <div className="flex items-center justify-between px-3 py-2 border-b border-white/10">
                <span className="text-xs font-medium text-zinc-300">Chat History</span>
                <button
                  type="button"
                  onClick={() => setAssistantHistoryOpenByChatId(prev => ({ ...prev, [chatId]: false }))}
                  className="text-zinc-500 hover:text-white text-xs px-2 py-1 rounded hover:bg-white/10 transition-colors"
                >
                  Close
                </button>
              </div>
              <div className="flex-1 overflow-y-auto custom-scrollbar p-2 space-y-1">
                {[...assistantChats].reverse().map(historyChat => (
                  <button
                    key={historyChat.id}
                    type="button"
                    onClick={() => {
                      openAssistantChatTab(historyChat.id);
                      setAssistantHistoryOpenByChatId(prev => ({ ...prev, [chatId]: false }));
                    }}
                    className={cn(
                      "w-full text-left px-3 py-2 rounded-lg border transition-colors",
                      historyChat.id === chatId
                        ? "border-indigo-500/40 bg-indigo-500/10 text-indigo-300"
                        : "border-white/10 bg-white/5 text-zinc-300 hover:bg-white/10 hover:text-white"
                    )}
                  >
                    <div className="text-xs truncate">{historyChat.name || DEFAULT_ASSISTANT_CHAT_NAME}</div>
                    <div className="text-[10px] text-zinc-500 mt-1">{historyChat.messages.length} messages</div>
                  </button>
                ))}
              </div>
            </div>
          )}
          <div className="flex-1 overflow-y-auto p-4 space-y-4 custom-scrollbar">
            <div className="rounded-xl border border-white/10 bg-white/5 px-3 py-2">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="text-[11px] font-medium uppercase tracking-wide text-zinc-500">Assistant Session</div>
                <div className="text-[10px] text-zinc-400">{assistantStatusLabel}</div>
              </div>
              <div className="mt-1 text-[10px] text-zinc-500">
                Chain of Thought: {effectiveAssistantUseChainOfThought ? 'On' : 'Off'} · {assistantAuthStatusLabel}
              </div>
            </div>
            {chat.messages.length === 0 && (
              <div className="text-center py-10 space-y-4">
                <div className="w-12 h-12 bg-indigo-600/20 rounded-full flex items-center justify-center mx-auto text-indigo-400">
                  <MessageSquare size={24} />
                </div>
                <p className="text-sm text-zinc-500 px-4">
                  Ask me anything about your code! I can explain logic, find bugs, or suggest improvements.
                </p>
              </div>
            )}
            {chat.messages.map((msg, i) => (
              <div key={i} className={cn(
                "flex flex-col gap-1",
                msg.role === 'user' ? "items-end" : "items-start"
              )}>
                <div className={cn(
                  "max-w-[95%] p-3 rounded-2xl text-sm prose prose-invert prose-sm",
                  msg.role === 'user'
                    ? "bg-indigo-600 text-white rounded-tr-none"
                    : msg.kind === 'log'
                      ? "bg-black/30 text-zinc-400 rounded-tl-none border border-amber-500/20"
                      : "bg-white/5 text-zinc-300 rounded-tl-none border border-white/5"
                )}>
                  {msg.role === 'assistant' ? (
                    <>
                      {msg.kind === 'log' && (
                        <div className="mb-2 text-[10px] font-medium uppercase tracking-wide text-amber-300/80">
                          Agent Log
                        </div>
                      )}
                      <ReactMarkdown
                        components={{
                          code({ node, inline, className, children, ...props }: any) {
                            return (
                              <code
                                className={cn(
                                  "bg-black/40 px-1.5 py-0.5 rounded text-indigo-300 font-mono text-xs",
                                  !inline && "block p-3 my-2 overflow-x-auto border border-white/10",
                                  className
                                )}
                                {...props}
                              >
                                {children}
                              </code>
                            )
                          }
                        }}
                      >
                        {msg.content}
                      </ReactMarkdown>
                    </>
                  ) : (
                    <div className="whitespace-pre-wrap">{msg.content}</div>
                  )}
                </div>
              </div>
            ))}
            {isChatLoading && (
              <div className="flex items-start gap-2">
                <div className="bg-white/5 p-3 rounded-2xl rounded-tl-none border border-white/5">
                  <div className="flex gap-1">
                    <span className="w-1.5 h-1.5 bg-zinc-600 rounded-full animate-bounce" />
                    <span className="w-1.5 h-1.5 bg-zinc-600 rounded-full animate-bounce [animation-delay:0.2s]" />
                    <span className="w-1.5 h-1.5 bg-zinc-600 rounded-full animate-bounce [animation-delay:0.4s]" />
                  </div>
                </div>
              </div>
            )}
          </div>

          <form onSubmit={(e) => handleChatSubmit(chatId, e)} className="p-4 border-t border-white/5 bg-[rgb(28,28,28)]">
            {!assistantAuthReady && (
              <div className="mb-3 rounded-xl border border-amber-500/20 bg-amber-500/10 px-3 py-2 text-[11px] text-amber-200">
                {settings.assistantProvider === 'codex-cli'
                  ? 'Connect Codex OAuth in Settings or run `codex login` in Terminal.'
                  : 'OAuth-only mode is available through the Codex CLI provider.'}
              </div>
            )}
            <div className="relative flex flex-col gap-2">
              <textarea
                value={chatInput}
                onChange={(e) => setAssistantInputs(prev => ({ ...prev, [chatId]: e.target.value }))}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && !e.shiftKey) {
                    e.preventDefault();
                    handleChatSubmit(chatId, e);
                  }
                }}
                placeholder="Ask AI... (Shift+Enter for new line)"
                rows={1}
                className="w-full bg-white/5 border border-white/10 rounded-xl py-3 pl-4 pr-12 text-sm focus:outline-none focus:border-indigo-500/50 transition-all resize-none max-h-40 custom-scrollbar"
              />
              <button
                type="submit"
                disabled={!chatInput.trim() || isChatLoading || !assistantAuthReady}
                className="absolute right-2 bottom-2 p-2 text-indigo-400 hover:text-indigo-300 disabled:text-zinc-600 transition-colors"
              >
                <ChevronRight size={20} />
              </button>
            </div>
            {settings.assistantShowUsagePopup && (chatInput.trim() || lastTurnUsage) && (
              <div className="mt-3 grid grid-cols-1 gap-2">
                {chatInput.trim() && tokenEstimate && (
                  <div className="rounded-xl border border-white/10 bg-white/5 px-3 py-2">
                    <div className="flex items-center justify-between gap-3">
                      <div className="text-[11px] font-medium uppercase tracking-wide text-zinc-500">Next Send Estimate</div>
                      <div className="text-[10px] text-zinc-500">
                        {assistantStatusLabel} · {tokenEstimate.source === 'model' ? 'model count' : 'local estimate'}
                      </div>
                    </div>
                    <div className="mt-2 grid grid-cols-2 sm:grid-cols-4 gap-2">
                      <div>
                        <div className="text-[10px] uppercase tracking-wide text-zinc-500">Input</div>
                        <div className="text-sm text-white">
                          {tokenEstimate.status === 'loading' ? '…' : formatAssistantTokenCount(tokenEstimate.promptTokenCount)}
                        </div>
                      </div>
                      <div>
                        <div className="text-[10px] uppercase tracking-wide text-zinc-500">Projected Output</div>
                        <div className="text-sm text-white">{formatAssistantTokenCount(tokenEstimate.estimatedOutputTokenCount)}</div>
                      </div>
                      <div>
                        <div className="text-[10px] uppercase tracking-wide text-zinc-500">Projected Total</div>
                        <div className="text-sm text-white">
                          {tokenEstimate.status === 'loading' ? '…' : formatAssistantTokenCount(tokenEstimate.estimatedTotalTokenCount)}
                        </div>
                      </div>
                      <div>
                        <div className="text-[10px] uppercase tracking-wide text-zinc-500">Paid Cost</div>
                        <div className="text-sm text-emerald-300">
                          {tokenEstimate.status === 'loading' ? '…' : formatAssistantCostUsd(tokenEstimate.estimatedPaidCostUsd)}
                        </div>
                      </div>
                    </div>
                    <div className="mt-2 text-[10px] text-zinc-500">
                      Projected output uses the last actual response size for this chat, or {formatAssistantTokenCount(DEFAULT_ASSISTANT_ESTIMATED_OUTPUT_TOKENS)} tokens by default. Cost is only shown when pricing data is available for the selected provider/model.
                    </div>
                    {tokenEstimate.error && tokenEstimate.source === 'approximation' && (
                      <div className="mt-1 text-[10px] text-amber-300">
                        Fell back to a local approximation because live token counting was unavailable.
                        {' '}Error: <span className="font-mono">{tokenEstimate.error}</span>
                      </div>
                    )}
                  </div>
                )}

                {lastTurnUsage && (
                  <div className="rounded-xl border border-indigo-500/20 bg-indigo-500/10 px-3 py-2">
                    <div className="flex items-center justify-between gap-3">
                      <div className="text-[11px] font-medium uppercase tracking-wide text-indigo-300">Last Actual Usage</div>
                      <div className="text-[10px] text-indigo-200/80">
                        {lastTurnUsage.passCount} pass{lastTurnUsage.passCount === 1 ? '' : 'es'} · {lastTurnUsage.source}
                      </div>
                    </div>
                    <div className="mt-2 grid grid-cols-2 sm:grid-cols-4 gap-2">
                      <div>
                        <div className="text-[10px] uppercase tracking-wide text-indigo-200/70">Input</div>
                        <div className="text-sm text-white">{formatAssistantTokenCount(lastTurnUsage.inputTokenCount)}</div>
                      </div>
                      <div>
                        <div className="text-[10px] uppercase tracking-wide text-indigo-200/70">Output</div>
                        <div className="text-sm text-white">{formatAssistantTokenCount(lastTurnUsage.outputTokenCount)}</div>
                      </div>
                      <div>
                        <div className="text-[10px] uppercase tracking-wide text-indigo-200/70">Total</div>
                        <div className="text-sm text-white">{formatAssistantTokenCount(lastTurnUsage.totalTokenCount)}</div>
                      </div>
                      <div>
                        <div className="text-[10px] uppercase tracking-wide text-indigo-200/70">Paid Cost</div>
                        <div className="text-sm text-emerald-300">{formatAssistantCostUsd(lastTurnUsage.paidCostUsd)}</div>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            )}
          </form>
        </div>
      );
    }

    return null;
  };
  const factoryRef = useRef(factoryImpl);
  factoryRef.current = factoryImpl;
  const factory = useCallback((node: TabNode) => factoryRef.current(node), []);

  const getDockTabIcon = (component?: string) => {
    if (component === 'explorer') return <Folder size={14} />;
    if (component === 'terminal') return <TerminalIcon size={14} />;
    if (component === 'output') return <Play size={14} />;
    if (component === 'assistant') return <Sparkles size={14} />;
    return <FileCode size={14} />;
  };

  const renderDockTab = (node: any, renderValues: any) => {
    const component = typeof node.getComponent === 'function' ? node.getComponent() : '';
    const label = typeof node.getName === 'function' ? node.getName() : '';
    renderValues.content = (
      <span className="inline-flex items-center gap-2 text-sm font-normal">
        {getDockTabIcon(component)}
        <span>{label}</span>
      </span>
    );
  };

  const renderDockTabSet = (_node: any, _renderValues: any) => {
    // Keep default tabset controls while enabling React-based tab rendering.
  };

  const updateContent = (content: string) => {
    setFiles(prev => prev.map(f => f.id === activeFileId ? { ...f, content } : f));
  };

  return (
    <div className="flex flex-col h-screen w-full bg-[rgb(28,28,28)] text-zinc-300 overflow-hidden font-sans">
      {/* Global Top Header */}
      <Tooltip.Provider delayDuration={400}>
        <header className="h-12 border-b border-white/10 bg-[rgb(28,28,28)] flex items-center justify-between px-3 shrink-0 w-full z-10">
          <div className="flex items-center gap-1 overflow-hidden">
            {/* Logo */}
            <div className="flex items-center gap-2 font-semibold text-white shrink-0 pr-2">
              <div className="w-6 h-6 bg-indigo-600 rounded-md flex items-center justify-center">
                <Code2 size={14} />
              </div>
              <span className="text-sm tracking-wide hidden sm:inline-block text-zinc-100">CodeCraft</span>
            </div>

            <Separator.Root orientation="vertical" className="h-5 w-px bg-zinc-800 mx-1 shrink-0" />

            {/* Breadcrumbs */}
            <nav className="flex items-center gap-1.5 text-sm text-zinc-500 overflow-hidden">
              <button onClick={() => setActiveFileId('')} className="hover:text-zinc-200 transition-colors shrink-0 text-xs">src</button>
              <ChevronRight size={12} className="shrink-0 text-zinc-700" />
              <span className="text-zinc-300 truncate text-xs">{activeItem ? getPath(activeItem.id) : 'No selection'}</span>
            </nav>
          </div>

          {/* Right Actions */}
          <div className="flex items-center gap-1 shrink-0">
            <button
              onClick={handleRun}
              disabled={!canRunCurrentFile}
              className={cn(
                "inline-flex items-center gap-1.5 h-8 px-3 rounded-md text-xs font-medium transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-emerald-600",
                !canRunCurrentFile
                  ? "border border-zinc-800 text-zinc-600 cursor-not-allowed"
                  : "bg-emerald-700 hover:bg-emerald-600 text-white border border-emerald-600"
              )}
            >
              {isRunning ? <Cpu className="animate-spin" size={13} /> : <Play size={13} />}
              Run
            </button>

            <button
              onClick={handleProjectRun}
              disabled={!canRunProject}
              className={cn(
                "inline-flex items-center gap-1.5 h-8 px-3 rounded-md text-xs font-medium transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-indigo-600",
                !canRunProject
                  ? "border border-zinc-800 text-zinc-600 cursor-not-allowed"
                  : "bg-indigo-700 hover:bg-indigo-600 text-white border border-indigo-600"
              )}
            >
              {isRunning ? <Cpu className="animate-spin" size={13} /> : <Folder size={13} />}
              Project Run
            </button>

            <Separator.Root orientation="vertical" className="h-5 w-px bg-zinc-800 mx-2 shrink-0" />

            <Tooltip.Root>
              <Tooltip.Trigger asChild>
                <button
                  onClick={() => setIsSettingsOpen(true)}
                  className="inline-flex items-center justify-center h-8 w-8 rounded-md text-zinc-400 hover:text-zinc-100 hover:bg-zinc-800 transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-zinc-600"
                >
                  <Settings size={16} />
                </button>
              </Tooltip.Trigger>
              <Tooltip.Portal>
                <Tooltip.Content sideOffset={6} className="z-50 overflow-hidden rounded-md bg-zinc-900 border border-zinc-700 px-3 py-1.5 text-xs text-zinc-200 shadow-md animate-in fade-in-0 zoom-in-95 data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=closed]:zoom-out-95">
                  Settings
                  <Tooltip.Arrow className="fill-zinc-700" />
                </Tooltip.Content>
              </Tooltip.Portal>
            </Tooltip.Root>

            <Tooltip.Root>
              <Tooltip.Trigger asChild>
                <button
                  onClick={createAssistantChatWindow}
                  className="inline-flex items-center justify-center h-8 w-8 rounded-md text-zinc-400 hover:text-zinc-100 hover:bg-zinc-800 transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-zinc-600"
                >
                  <Sparkles size={16} />
                </button>
              </Tooltip.Trigger>
              <Tooltip.Portal>
                <Tooltip.Content sideOffset={6} className="z-50 overflow-hidden rounded-md bg-zinc-900 border border-zinc-700 px-3 py-1.5 text-xs text-zinc-200 shadow-md animate-in fade-in-0 zoom-in-95 data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=closed]:zoom-out-95">
                  New AI Chat
                  <Tooltip.Arrow className="fill-zinc-700" />
                </Tooltip.Content>
              </Tooltip.Portal>
            </Tooltip.Root>
          </div>
        </header>
      </Tooltip.Provider>

      <main className="flex-1 flex flex-col relative min-w-0 bg-[rgb(28,28,28)]">
        <div className="flex-1 flex flex-col min-h-0 relative bg-[rgb(28,28,28)]">
          <Layout
            model={layoutModel}
            factory={factory}
            onRenderTab={renderDockTab}
            onRenderTabSet={renderDockTabSet}
            onAction={handleLayoutAction}
            onModelChange={syncAssistantChatsWithLayout}
          />
        </div>
      </main>

      {/* New Item Modal */}
      <AnimatePresence>
        {namingState && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="w-full max-w-md bg-[rgb(28,28,28)] border border-white/10 rounded-2xl shadow-2xl overflow-hidden"
            >
              <div className="p-6">
                <h3 className="text-lg font-semibold text-white mb-4 flex items-center gap-2">
                  {namingState.type === 'file' ? <FilePlus size={20} className={cn("text-indigo-400")} /> : <FolderPlus size={20} className={cn("text-amber-400")} />}
                  New {namingState.type === 'file' ? 'File' : 'Folder'}
                </h3>
                <input
                  autoFocus
                  type="text"
                  value={namingName}
                  onChange={(e) => setNamingName(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') confirmNewItem();
                    if (e.key === 'Escape') setNamingState(null);
                  }}
                  placeholder={`Enter ${namingState.type} name...`}
                  className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-white placeholder:text-zinc-600 focus:outline-none focus:border-indigo-500/50 transition-all mb-6"
                />
                <div className="flex items-center justify-end gap-3">
                  <button
                    onClick={() => setNamingState(null)}
                    className="px-4 py-2 rounded-lg text-zinc-400 hover:text-white hover:bg-white/5 transition-all text-sm font-medium"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={confirmNewItem}
                    disabled={!namingName.trim()}
                    className="px-6 py-2 rounded-lg bg-indigo-600 hover:bg-indigo-500 disabled:bg-zinc-800 disabled:text-zinc-600 text-white transition-all text-sm font-semibold"
                  >
                    Create
                  </button>
                </div>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Settings Modal */}
      <AnimatePresence>
        {isSettingsOpen && (
          <div className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="w-full max-w-4xl bg-[rgb(28,28,28)] border border-white/10 rounded-2xl shadow-2xl overflow-hidden flex flex-col max-h-[85vh]"
            >
              <div className="p-6 border-b border-white/5 flex items-center justify-between">
                <h3 className="text-lg font-semibold text-white flex items-center gap-2">
                  <Settings size={20} className="text-indigo-400" />
                  IDE Settings
                </h3>
                <button
                  onClick={() => setIsSettingsOpen(false)}
                  className="p-2 hover:bg-white/5 rounded-full text-zinc-400 hover:text-white transition-colors"
                >
                  <X size={20} />
                </button>
              </div>

              <div className="flex-1 overflow-y-auto p-6 space-y-8 custom-scrollbar">
                <section>
                  <h4 className="text-xs font-bold uppercase tracking-widest text-zinc-500 mb-4">AI Assistant</h4>
                  <div className="rounded-2xl border border-white/10 bg-white/5 p-4 space-y-4">
                    <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)] gap-4">
                      <label className="block space-y-2">
                        <div className="text-xs font-medium uppercase tracking-wide text-zinc-500">Provider</div>
                        <select
                          value={settings.assistantProvider}
                          onChange={(e) => {
                            const nextProvider = e.target.value as AssistantProvider;
                            setSettings(current => ({
                              ...current,
                              assistantProvider: nextProvider,
                              assistantModel: getAssistantDefaultModel(nextProvider),
                            }));
                          }}
                          className="w-full rounded-xl border border-white/10 bg-black/20 px-3 py-2 text-sm text-white outline-none transition-colors focus:border-indigo-500"
                        >
                          {ASSISTANT_PROVIDER_OPTIONS.map(option => (
                            <option key={option.value} value={option.value}>{option.label}</option>
                          ))}
                        </select>
                        <div className="text-xs text-zinc-500">
                          Choose which API provider CodeCraft should call for the assistant.
                        </div>
                      </label>

                      <label className="block space-y-2">
                        <div className="text-xs font-medium uppercase tracking-wide text-zinc-500">Model</div>
                        <input
                          list="assistant-model-options"
                          value={settings.assistantModel}
                          onChange={(e) => setSettings(current => ({ ...current, assistantModel: e.target.value }))}
                          placeholder="Enter or choose a model"
                          className="w-full rounded-xl border border-white/10 bg-black/20 px-3 py-2 text-sm text-white outline-none transition-colors focus:border-indigo-500"
                        />
                        <datalist id="assistant-model-options">
                          {ASSISTANT_MODEL_PRESETS[settings.assistantProvider].map(option => (
                            <option key={option.id} value={option.id}>{option.label}</option>
                          ))}
                        </datalist>
                        <div className="text-xs text-zinc-500">
                          Pick one of the recommended models or type a custom model id.
                        </div>
                      </label>
                    </div>

                    <div className="rounded-xl border border-white/10 bg-black/20 px-4 py-3 space-y-3">
                      <div className="flex flex-wrap items-center justify-between gap-3">
                        <div>
                          <div className="text-sm font-medium text-white">OAuth</div>
                          <div className="text-xs text-zinc-500">
                            {settings.assistantProvider === 'codex-cli'
                              ? `Codex CLI OAuth is ${settings.assistantOAuthSession.status.replace('_', ' ')}.`
                              : 'OAuth-only settings are wired through Codex CLI mode.'}
                          </div>
                        </div>
                        <div className="flex flex-wrap gap-2">
                          <button
                            type="button"
                            onClick={async () => {
                              const pendingAuthWindow = window.open('about:blank', '_blank');
                              const result = await runCodexCliTerminalCommand(['login'], codexCliRuntimeState, settings.assistantModel);
                              setSettings(current => ({
                                ...current,
                                assistantProvider: 'codex-cli',
                                assistantOAuthSession: result.nextOAuthSession ?? current.assistantOAuthSession,
                              }));
                              setTerminalOutput(prev => [...prev, '~ $ codex login', ...result.lines]);
                              if (result.openUrl) {
                                if (pendingAuthWindow) {
                                  pendingAuthWindow.opener = null;
                                  pendingAuthWindow.location.href = result.openUrl;
                                } else {
                                  window.open(result.openUrl, '_blank', 'noopener,noreferrer');
                                }
                              } else {
                                pendingAuthWindow?.close();
                              }
                              selectDockPanel('terminal');
                            }}
                            className="px-3 py-2 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-xs text-white transition-colors"
                          >
                            Connect
                          </button>
                          <button
                            type="button"
                            onClick={() => setSettings(current => ({
                              ...current,
                              assistantOAuthSession: DEFAULT_CODEX_CLI_OAUTH_SESSION,
                            }))}
                            className="px-3 py-2 rounded-lg border border-white/10 bg-white/5 text-xs text-zinc-200 hover:bg-white/10 transition-colors"
                          >
                            Disconnect
                          </button>
                        </div>
                      </div>
                      {settings.assistantOAuthSession.login && (
                        <div className="rounded-lg border border-indigo-500/20 bg-indigo-500/10 px-3 py-2 text-xs text-indigo-100">
                          <div>Browser login pending</div>
                          <div className="font-mono text-[10px] mt-1 break-all">{settings.assistantOAuthSession.login.authUrl}</div>
                        </div>
                      )}
                    </div>

                    {settings.assistantProvider === 'codex-cli' && (
                      <div className="rounded-xl border border-white/10 bg-black/20 px-4 py-3 space-y-3">
                        <div className="flex flex-wrap items-center justify-between gap-3">
                          <div>
                            <div className="text-sm font-medium text-white">Codex CLI</div>
                            <div className="text-xs text-zinc-500">
                              Static source {CODEX_CLI_STATIC_REPOSITORY.commit.slice(0, 7)} · {settings.codexCliMcpServers.length} MCP server{settings.codexCliMcpServers.length === 1 ? '' : 's'}
                            </div>
                          </div>
                          <button
                            type="button"
                            onClick={() => {
                              setTerminalOutput(prev => [
                                ...prev,
                                '~ $ codex status',
                                ...formatCodexCliStatusLines(codexCliRuntimeState, settings.assistantModel),
                              ]);
                              selectDockPanel('terminal');
                            }}
                            className="px-3 py-2 rounded-lg border border-white/10 bg-white/5 text-xs text-zinc-200 hover:bg-white/10 transition-colors"
                          >
                            Status
                          </button>
                        </div>
                        <label className="block space-y-2">
                          <div className="text-xs font-medium uppercase tracking-wide text-zinc-500">Responses Endpoint</div>
                          <input
                            value={settings.codexCliResponsesEndpoint}
                            onChange={(e) => setSettings(current => ({ ...current, codexCliResponsesEndpoint: e.target.value }))}
                            className="w-full rounded-xl border border-white/10 bg-black/20 px-3 py-2 text-sm text-white outline-none transition-colors focus:border-indigo-500"
                          />
                        </label>
                        <div className="space-y-1">
                          {settings.codexCliMcpServers.length === 0 ? (
                            <div className="text-xs text-zinc-500">No MCP servers configured. Add one with `codex mcp add name https://server.example/mcp`.</div>
                          ) : settings.codexCliMcpServers.map(server => (
                            <div key={server.name} className="flex items-center justify-between gap-2 rounded-lg border border-white/10 bg-white/5 px-3 py-2">
                              <div className="min-w-0">
                                <div className="text-xs text-white truncate">{server.name}</div>
                                <div className="text-[10px] text-zinc-500 truncate">{server.url} · {server.authStatus}</div>
                              </div>
                              <button
                                type="button"
                                onClick={() => setSettings(current => ({
                                  ...current,
                                  codexCliMcpServers: current.codexCliMcpServers.filter(candidate => candidate.name !== server.name),
                                }))}
                                className="p-1.5 rounded-md text-zinc-400 hover:text-white hover:bg-white/10 transition-colors"
                                title="Remove MCP server"
                              >
                                <Unlink size={14} />
                              </button>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}

                    <div className="flex items-center justify-between gap-4 rounded-xl border border-white/10 bg-black/20 px-4 py-3">
                      <div>
                        <div className="text-sm font-medium text-white">Chain of Thought</div>
                        <div className="text-xs text-zinc-500">
                          {getAssistantReasoningAvailabilityNote(settings.assistantProvider, settings.assistantModel)}
                        </div>
                      </div>
                      <button
                        type="button"
                        disabled={assistantReasoningControl !== 'toggleable'}
                        onClick={() => setSettings(current => ({
                          ...current,
                          assistantUseChainOfThought: !current.assistantUseChainOfThought,
                        }))}
                        className={cn(
                          "w-10 h-5 rounded-full transition-all relative disabled:cursor-not-allowed disabled:opacity-60",
                          effectiveAssistantUseChainOfThought ? "bg-indigo-600" : "bg-zinc-700"
                        )}
                      >
                        <div className={cn(
                          "absolute top-1 w-3 h-3 bg-white rounded-full transition-all",
                          effectiveAssistantUseChainOfThought ? "right-1" : "left-1"
                        )} />
                      </button>
                    </div>

                    <div className="flex items-center justify-between gap-4 rounded-xl border border-white/10 bg-black/20 px-4 py-3">
                      <div>
                        <div className="text-sm font-medium text-white">Show Usage Popup</div>
                        <div className="text-xs text-zinc-500">
                          Show or hide the assistant usage panel beneath the chat input.
                        </div>
                      </div>
                      <button
                        type="button"
                        onClick={() => setSettings(current => ({
                          ...current,
                          assistantShowUsagePopup: !current.assistantShowUsagePopup,
                        }))}
                        className={cn(
                          "w-10 h-5 rounded-full transition-all relative",
                          settings.assistantShowUsagePopup ? "bg-indigo-600" : "bg-zinc-700"
                        )}
                      >
                        <div className={cn(
                          "absolute top-1 w-3 h-3 bg-white rounded-full transition-all",
                          settings.assistantShowUsagePopup ? "right-1" : "left-1"
                        )} />
                      </button>
                    </div>

                    <label className="block space-y-2">
                      <div className="text-xs font-medium uppercase tracking-wide text-zinc-500">Max CoT Depth</div>
                      <input
                        type="number"
                        min={1}
                        max={12}
                        step={1}
                        value={settings.assistantMaxChainOfThoughtDepth}
                        onChange={(e) => setSettings(current => ({
                          ...current,
                          assistantMaxChainOfThoughtDepth: normalizeAssistantMaxChainOfThoughtDepth(Number(e.target.value)),
                        }))}
                        className="w-full rounded-xl border border-white/10 bg-black/20 px-3 py-2 text-sm text-white outline-none transition-colors focus:border-indigo-500"
                      />
                      <div className="text-xs text-zinc-500">
                        Limits Chain of Thought tool rounds per assistant turn. Range: 1 to 12. Current effective limit: {effectiveAssistantMaxChainOfThoughtDepth}.
                      </div>
                    </label>
                  </div>
                </section>

                {/* Execution Settings */}
                <section>
                  <h4 className="text-xs font-bold uppercase tracking-widest text-zinc-500 mb-4">Execution</h4>
                  <div className="space-y-4">
                    <div className="flex items-center justify-between">
                      <div>
                        <div className="text-sm font-medium text-white">Clear Output on Run</div>
                        <div className="text-xs text-zinc-500">Automatically clear the output panel before each execution</div>
                      </div>
                      <button
                        onClick={() => setSettings(s => ({ ...s, clearOutputOnRun: !s.clearOutputOnRun }))}
                        className={cn(
                          "w-10 h-5 rounded-full transition-all relative",
                          settings.clearOutputOnRun ? "bg-indigo-600" : "bg-zinc-700"
                        )}
                      >
                        <div className={cn(
                          "absolute top-1 w-3 h-3 bg-white rounded-full transition-all",
                          settings.clearOutputOnRun ? "right-1" : "left-1"
                        )} />
                      </button>
                    </div>

                    {!settings.clearOutputOnRun && (
                      <div className="flex items-center justify-between">
                        <div>
                          <div className="text-sm font-medium text-white">Show Execution Divisor</div>
                          <div className="text-xs text-zinc-500">Draw a visual line between consecutive execution logs</div>
                        </div>
                        <button
                          onClick={() => setSettings(s => ({ ...s, showExecutionDivisor: !s.showExecutionDivisor }))}
                          className={cn(
                            "w-10 h-5 rounded-full transition-all relative",
                            settings.showExecutionDivisor ? "bg-indigo-600" : "bg-zinc-700"
                          )}
                        >
                          <div className={cn(
                            "absolute top-1 w-3 h-3 bg-white rounded-full transition-all",
                            settings.showExecutionDivisor ? "right-1" : "left-1"
                          )} />
                        </button>
                      </div>
                    )}
                  </div>
                </section>

                <section>
                  <h4 className="text-xs font-bold uppercase tracking-widest text-zinc-500 mb-4">Project Run</h4>
                  <div className="space-y-4">
                    <div className="rounded-2xl border border-white/10 bg-white/5 p-4 space-y-4">
                      <div className="text-xs text-zinc-500">
                        These settings apply only to the `Project Run` button. The regular `Run` button always executes just the current file.
                      </div>

                      <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)] gap-4">
                        <label className="block space-y-2">
                          <div className="text-xs font-medium uppercase tracking-wide text-zinc-500">Run Scope</div>
                          <select
                            value={settings.projectRunMode}
                            onChange={(e) => {
                              const nextMode = e.target.value as ProjectRunMode;
                              setSettings(current => {
                                const modeLanguage = getProjectRunModeLanguage(nextMode);
                                const activeRunnableLanguage = activeItem?.type === 'file'
                                  ? normalizeProjectRuntimeLanguage(activeItem.language)
                                  : null;
                                const nextCustomFileIds = nextMode === 'custom'
                                  ? current.projectRunCustomFileIds.length > 0
                                    ? current.projectRunCustomFileIds
                                    : activeItem?.type === 'file' && activeRunnableLanguage
                                      ? [activeItem.id]
                                      : []
                                  : current.projectRunCustomFileIds;
                                const selectedIds = nextMode === 'custom'
                                  ? nextCustomFileIds
                                  : projectRunnableFiles
                                    .filter(file => normalizeProjectRuntimeLanguage(file.language) === modeLanguage)
                                    .map(file => file.id);
                                const nextEntryFileId =
                                  current.projectRunEntryFileId && selectedIds.includes(current.projectRunEntryFileId)
                                    ? current.projectRunEntryFileId
                                    : selectedIds.includes(activeFileId)
                                      ? activeFileId
                                      : selectedIds[0] ?? null;
                                return {
                                  ...current,
                                  projectRunMode: nextMode,
                                  projectRunCustomFileIds: nextCustomFileIds,
                                  projectRunEntryFileId: nextEntryFileId,
                                };
                              });
                            }}
                            className="w-full rounded-xl border border-white/10 bg-black/20 px-3 py-2 text-sm text-white outline-none transition-colors focus:border-indigo-500"
                          >
                            {PROJECT_RUN_MODE_OPTIONS.map(option => (
                              <option key={option.value} value={option.value}>{option.label}</option>
                            ))}
                          </select>
                          <div className="text-xs text-zinc-500">
                            Language-specific modes automatically include every runnable file for that language. `Custom` lets you pick the exact files to include for project execution.
                          </div>
                        </label>

                        <label className="block space-y-2">
                          <div className="text-xs font-medium uppercase tracking-wide text-zinc-500">Entry File</div>
                          <select
                            value={resolvedProjectRun.entryFile?.id ?? ''}
                            onChange={(e) => setSettings(current => ({
                              ...current,
                              projectRunEntryFileId: e.target.value || null,
                            }))}
                            disabled={resolvedProjectRun.selectedFiles.length === 0}
                            className="w-full rounded-xl border border-white/10 bg-black/20 px-3 py-2 text-sm text-white outline-none transition-colors focus:border-indigo-500 disabled:opacity-60 disabled:cursor-not-allowed"
                          >
                            {resolvedProjectRun.selectedFiles.length === 0 ? (
                              <option value="">No project files selected</option>
                            ) : (
                              resolvedProjectRun.selectedFiles.map(file => (
                                <option key={file.id} value={file.id}>{getPath(file.id)}</option>
                              ))
                            )}
                          </select>
                          <div className="text-xs text-zinc-500">
                            The entry file is the file CodeCraft executes or previews when you press `Project Run`.
                          </div>
                        </label>
                      </div>

                      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                        <div className="rounded-xl border border-white/10 bg-black/20 px-4 py-3">
                          <div className="text-[11px] uppercase tracking-wide text-zinc-500">Resolved Language</div>
                          <div className="mt-1 text-sm text-white">
                            {resolvedProjectRun.language ? getProjectRuntimeLanguageLabel(resolvedProjectRun.language) : 'Not resolved yet'}
                          </div>
                        </div>
                        <div className="rounded-xl border border-white/10 bg-black/20 px-4 py-3">
                          <div className="text-[11px] uppercase tracking-wide text-zinc-500">Selected Files</div>
                          <div className="mt-1 text-sm text-white">{resolvedProjectRun.selectedFiles.length}</div>
                        </div>
                        <div className="rounded-xl border border-white/10 bg-black/20 px-4 py-3">
                          <div className="text-[11px] uppercase tracking-wide text-zinc-500">Current Entry</div>
                          <div className="mt-1 text-sm text-white truncate">{resolvedProjectRun.entryFile ? getPath(resolvedProjectRun.entryFile.id) : 'None'}</div>
                        </div>
                      </div>

                      {resolvedProjectRun.error && (
                        <div className="rounded-xl border border-amber-500/20 bg-amber-500/10 px-3 py-2 text-xs text-amber-200">
                          {resolvedProjectRun.error}
                        </div>
                      )}

                      {settings.projectRunMode === 'custom' && (
                        <div className="space-y-3">
                          <div>
                            <div className="text-sm font-medium text-white">Custom File Selection</div>
                            <div className="text-xs text-zinc-500 mt-1">Select the files to include in the run. Cross-language project execution is intentionally blocked.</div>
                          </div>

                          {projectRunnableFiles.length === 0 ? (
                            <div className="rounded-xl border border-white/10 bg-black/20 px-4 py-3 text-sm text-zinc-500">
                              Add at least one runnable `C#`, `Python`, `HTML`, or `JS` file to configure a project run.
                            </div>
                          ) : (
                            <div className="max-h-64 overflow-y-auto custom-scrollbar rounded-xl border border-white/10 bg-black/20 divide-y divide-white/5">
                              {projectRunnableFiles.map(file => {
                                const language = normalizeProjectRuntimeLanguage(file.language);
                                const isChecked = settings.projectRunCustomFileIds.includes(file.id);
                                return (
                                  <label key={file.id} className="flex items-center gap-3 px-4 py-3 cursor-pointer hover:bg-white/5">
                                    <input
                                      type="checkbox"
                                      checked={isChecked}
                                      onChange={(e) => {
                                        const checked = e.target.checked;
                                        setSettings(current => {
                                          const nextIds = checked
                                            ? [...current.projectRunCustomFileIds, file.id]
                                            : current.projectRunCustomFileIds.filter(id => id !== file.id);
                                          const nextEntryFileId =
                                            current.projectRunEntryFileId && nextIds.includes(current.projectRunEntryFileId)
                                              ? current.projectRunEntryFileId
                                              : nextIds.includes(activeFileId)
                                                ? activeFileId
                                                : nextIds[0] ?? null;
                                          return {
                                            ...current,
                                            projectRunCustomFileIds: nextIds,
                                            projectRunEntryFileId: nextEntryFileId,
                                          };
                                        });
                                      }}
                                      className="h-4 w-4 rounded border-white/20 bg-black/20 text-indigo-500 focus:ring-indigo-500"
                                    />
                                    <div className="min-w-0 flex-1">
                                      <div className="text-sm text-white truncate">{getPath(file.id)}</div>
                                      <div className="text-xs text-zinc-500">{getProjectRuntimeLanguageLabel(language)}</div>
                                    </div>
                                  </label>
                                );
                              })}
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  </div>
                </section>

                <section>
                  <h4 className="text-xs font-bold uppercase tracking-widest text-zinc-500 mb-4">Language Runtimes</h4>
                  <div className="grid grid-cols-1 xl:grid-cols-3 gap-4">
                    <div className="rounded-2xl border border-white/10 bg-white/5 p-4 space-y-4">
                      <div>
                        <div className="text-sm font-medium text-white">JavaScript</div>
                        <div className="text-xs text-zinc-500 mt-1">Runs in a dedicated worker so timeout termination can stop long-running scripts. Set timeout to `0` to disable it.</div>
                      </div>

                      <label className="block space-y-2">
                        <div className="text-xs font-medium uppercase tracking-wide text-zinc-500">Execution Timeout (ms)</div>
                        <input
                          type="number"
                          min="0"
                          step="100"
                          value={settings.javascriptExecutionTimeoutMs}
                          onChange={(e) => setSettings(s => ({
                            ...s,
                            javascriptExecutionTimeoutMs: normalizeExecutionTimeoutMs(Number(e.target.value))
                          }))}
                          className="w-full rounded-xl border border-white/10 bg-black/20 px-3 py-2 text-sm text-white outline-none transition-colors focus:border-indigo-500"
                        />
                        <div className="text-xs text-zinc-500">Current: {formatExecutionTimeoutLabel(settings.javascriptExecutionTimeoutMs)}</div>
                      </label>

                      <label className="block space-y-2">
                        <div className="text-xs font-medium uppercase tracking-wide text-zinc-500">Execution Mode</div>
                        <select
                          value={settings.javascriptExecutionMode}
                          onChange={(e) => setSettings(s => ({
                            ...s,
                            javascriptExecutionMode: e.target.value as JavaScriptExecutionMode,
                          }))}
                          className="w-full rounded-xl border border-white/10 bg-black/20 px-3 py-2 text-sm text-white outline-none transition-colors focus:border-indigo-500"
                        >
                          <option value="classic-function">Classic Function</option>
                          <option value="async-function">Async Function Wrapper</option>
                        </select>
                        <div className="text-xs text-zinc-500">
                          {settings.javascriptExecutionMode === 'classic-function'
                            ? 'Evaluates with `new Function(code)`.'
                            : 'Evaluates with an async function so top-level `await` can be used.'}
                        </div>
                      </label>

                      <label className="block space-y-2">
                        <div className="text-xs font-medium uppercase tracking-wide text-zinc-500">I/O Mode</div>
                        <select
                          value={settings.javascriptIOMode}
                          onChange={(e) => setSettings(s => ({
                            ...s,
                            javascriptIOMode: e.target.value as RuntimeIOMode,
                          }))}
                          className="w-full rounded-xl border border-white/10 bg-black/20 px-3 py-2 text-sm text-white outline-none transition-colors focus:border-indigo-500"
                        >
                          <option value="alert-output">Alert &amp; Output Mode</option>
                          <option value="interactive-output-panel">Interactive Output Panel Mode</option>
                        </select>
                        <div className="text-xs text-zinc-500">
                          {settings.javascriptIOMode === 'alert-output'
                            ? 'Uses browser alert, confirm, and prompt dialogs while keeping logs in the Output panel.'
                            : 'Routes JavaScript alert, confirm, and prompt requests into the Output panel instead of browser dialogs.'}
                        </div>
                      </label>
                    </div>

                    <div className="rounded-2xl border border-white/10 bg-white/5 p-4 space-y-4">
                      <div>
                        <div className="text-sm font-medium text-white">Python</div>
                        <div className="text-xs text-zinc-500 mt-1">Uses a Pyodide execution guard for running Python code and unloads the runtime on timeout. Set timeout to `0` to disable it.</div>
                      </div>

                      <label className="block space-y-2">
                        <div className="text-xs font-medium uppercase tracking-wide text-zinc-500">Execution Timeout (ms)</div>
                        <input
                          type="number"
                          min="0"
                          step="100"
                          value={settings.pythonExecutionTimeoutMs}
                          onChange={(e) => setSettings(s => ({
                            ...s,
                            pythonExecutionTimeoutMs: normalizeExecutionTimeoutMs(Number(e.target.value))
                          }))}
                          className="w-full rounded-xl border border-white/10 bg-black/20 px-3 py-2 text-sm text-white outline-none transition-colors focus:border-indigo-500"
                        />
                        <div className="text-xs text-zinc-500">Current: {formatExecutionTimeoutLabel(settings.pythonExecutionTimeoutMs)}</div>
                      </label>

                      <label className="block space-y-2">
                        <div className="text-xs font-medium uppercase tracking-wide text-zinc-500">Runtime Lifecycle</div>
                        <select
                          value={settings.pythonRuntimeLifecycle}
                          onChange={(e) => setSettings(s => ({
                            ...s,
                            pythonRuntimeLifecycle: e.target.value as PythonRuntimeLifecycle,
                          }))}
                          className="w-full rounded-xl border border-white/10 bg-black/20 px-3 py-2 text-sm text-white outline-none transition-colors focus:border-indigo-500"
                        >
                          <option value="dispose-after-run">Dispose After Run</option>
                          <option value="keep-warm">Keep Warm Until Idle Timeout</option>
                        </select>
                        <div className="text-xs text-zinc-500">
                          {settings.pythonRuntimeLifecycle === 'dispose-after-run'
                            ? 'Matches the current fresh-runtime-per-run behavior.'
                            : 'Keeps Pyodide loaded between runs until the idle timer unloads it.'}
                        </div>
                      </label>

                      <label className="block space-y-2">
                        <div className="text-xs font-medium uppercase tracking-wide text-zinc-500">I/O Mode</div>
                        <select
                          value={settings.pythonIOMode}
                          onChange={(e) => setSettings(s => ({
                            ...s,
                            pythonIOMode: e.target.value as RuntimeIOMode,
                          }))}
                          className="w-full rounded-xl border border-white/10 bg-black/20 px-3 py-2 text-sm text-white outline-none transition-colors focus:border-indigo-500"
                        >
                          <option value="alert-output">Alert &amp; Output Mode</option>
                          <option value="interactive-output-panel">Interactive Output Panel Mode</option>
                        </select>
                        <div className="text-xs text-zinc-500">
                          {settings.pythonIOMode === 'alert-output'
                            ? 'Uses browser prompts for Python input while keeping stdout and stderr in the Output panel.'
                            : 'Lets you queue Python stdin lines from the Output panel before execution. If the script asks for more lines than you supplied, it falls back to browser prompt.'}
                        </div>
                      </label>
                    </div>

                    <div className="rounded-2xl border border-white/10 bg-white/5 p-4 space-y-4">
                      <div>
                        <div className="text-sm font-medium text-white">C#</div>
                        <div className="text-xs text-zinc-500 mt-1">Timeout is best-effort for the WebAssembly runtime. Set timeout to `0` to disable it.</div>
                      </div>

                      <label className="block space-y-2">
                        <div className="text-xs font-medium uppercase tracking-wide text-zinc-500">Execution Timeout (ms)</div>
                        <input
                          type="number"
                          min="0"
                          step="100"
                          value={settings.csharpExecutionTimeoutMs}
                          onChange={(e) => setSettings(s => ({
                            ...s,
                            csharpExecutionTimeoutMs: normalizeExecutionTimeoutMs(Number(e.target.value))
                          }))}
                          className="w-full rounded-xl border border-white/10 bg-black/20 px-3 py-2 text-sm text-white outline-none transition-colors focus:border-indigo-500"
                        />
                        <div className="text-xs text-zinc-500">Current: {formatExecutionTimeoutLabel(settings.csharpExecutionTimeoutMs)}</div>
                      </label>

                      <label className="block space-y-2">
                        <div className="text-xs font-medium uppercase tracking-wide text-zinc-500">Execution Mode</div>
                        <select
                          value={settings.csharpExecutionMode}
                          onChange={(e) => setSettings(s => ({
                            ...s,
                            csharpExecutionMode: e.target.value as CSharpExecutionMode,
                          }))}
                          className="w-full rounded-xl border border-white/10 bg-black/20 px-3 py-2 text-sm text-white outline-none transition-colors focus:border-indigo-500"
                        >
                          <option value="regular">Regular Program</option>
                          <option value="script">Script</option>
                          <option value="script-context">Script Context</option>
                        </select>
                        <div className="text-xs text-zinc-500">
                          {settings.csharpExecutionMode === 'regular'
                            ? 'Compiles as a normal console program.'
                            : settings.csharpExecutionMode === 'script'
                              ? 'Runs as a Roslyn script without preserving previous state.'
                              : 'Runs as a Roslyn script and keeps state per file between runs.'}
                        </div>
                      </label>

                      <label className="block space-y-2">
                        <div className="text-xs font-medium uppercase tracking-wide text-zinc-500">I/O Mode</div>
                        <select
                          value={settings.csharpIOMode}
                          onChange={(e) => setSettings(s => ({
                            ...s,
                            csharpIOMode: e.target.value as RuntimeIOMode,
                          }))}
                          className="w-full rounded-xl border border-white/10 bg-black/20 px-3 py-2 text-sm text-white outline-none transition-colors focus:border-indigo-500"
                        >
                          <option value="alert-output">Alert &amp; Output Mode</option>
                          <option value="interactive-output-panel">Interactive Output Panel Mode</option>
                        </select>
                        <div className="text-xs text-zinc-500">
                          {settings.csharpIOMode === 'alert-output'
                            ? 'Uses the standard Output panel flow for C# execution results.'
                            : 'Keeps the Output panel front-and-center for C# runs. The current C# runtime is output-only, so there is no extra prompt handling yet.'}
                        </div>
                      </label>

                      <label className="flex items-center justify-between gap-4">
                        <div>
                          <div className="text-sm font-medium text-white">Reset Script Context Before Run</div>
                          <div className="text-xs text-zinc-500">
                            Only used for `Script Context` mode. Clears the file-specific script state before each run.
                          </div>
                        </div>
                        <button
                          onClick={() => setSettings(s => ({ ...s, csharpResetScriptContextBeforeRun: !s.csharpResetScriptContextBeforeRun }))}
                          className={cn(
                            "w-10 h-5 rounded-full transition-all relative shrink-0",
                            settings.csharpResetScriptContextBeforeRun ? "bg-indigo-600" : "bg-zinc-700"
                          )}
                        >
                          <div className={cn(
                            "absolute top-1 w-3 h-3 bg-white rounded-full transition-all",
                            settings.csharpResetScriptContextBeforeRun ? "right-1" : "left-1"
                          )} />
                        </button>
                      </label>
                    </div>
                  </div>
                </section>

                {/* Editor Settings */}
                <section>
                  <h4 className="text-xs font-bold uppercase tracking-widest text-zinc-500 mb-4">Editor</h4>
                  <div className="space-y-6">
                    <div className="flex items-center justify-between">
                      <div>
                        <div className="text-sm font-medium text-white">Font Size</div>
                        <div className="text-xs text-zinc-500">Adjust the editor text size (px)</div>
                      </div>
                      <div className="flex items-center gap-3">
                        <button
                          onClick={() => setSettings(s => ({ ...s, fontSize: Math.max(8, s.fontSize - 1) }))}
                          className="w-8 h-8 flex items-center justify-center bg-white/5 hover:bg-white/10 rounded-lg text-white transition-colors"
                        >
                          -
                        </button>
                        <span className="text-sm font-mono text-indigo-400 w-6 text-center">{settings.fontSize}</span>
                        <button
                          onClick={() => setSettings(s => ({ ...s, fontSize: Math.min(32, s.fontSize + 1) }))}
                          className="w-8 h-8 flex items-center justify-center bg-white/5 hover:bg-white/10 rounded-lg text-white transition-colors"
                        >
                          +
                        </button>
                      </div>
                    </div>

                    <div className="flex items-center justify-between">
                      <div>
                        <div className="text-sm font-medium text-white">Auto Save</div>
                        <div className="text-xs text-zinc-500">Automatically save changes to local storage (simulated)</div>
                      </div>
                      <button
                        onClick={() => setSettings(s => ({ ...s, autoSave: !s.autoSave }))}
                        className={cn(
                          "w-10 h-5 rounded-full transition-all relative",
                          settings.autoSave ? "bg-indigo-600" : "bg-zinc-700"
                        )}
                      >
                        <div className={cn(
                          "absolute top-1 w-3 h-3 bg-white rounded-full transition-all",
                          settings.autoSave ? "right-1" : "left-1"
                        )} />
                      </button>
                    </div>
                  </div>
                </section>

                <section>
                  <h4 className="text-xs font-bold uppercase tracking-widest text-zinc-500 mb-4">Python Packages</h4>
                  <div className="space-y-4">
                    <div className="rounded-2xl border border-white/10 bg-white/5 p-4 space-y-4">
                      <div>
                        <div className="text-sm font-medium text-white">Manage Restored `pip` Packages</div>
                        <div className="text-xs text-zinc-500 mt-1">Packages saved here are restored automatically the next time the Pyodide runtime loads.</div>
                      </div>

                      <div className="grid grid-cols-1 sm:grid-cols-[minmax(0,1fr)_auto] gap-3">
                        <input
                          type="text"
                          value={settingsPipInput}
                          onChange={(e) => setSettingsPipInput(e.target.value)}
                          onKeyDown={async (e) => {
                            if (e.key === 'Enter' && !settingsPipBusy) {
                              e.preventDefault();
                              await handleSettingsPipApply();
                            }
                          }}
                          placeholder="Package name, e.g. requests"
                          className="w-full rounded-xl border border-white/10 bg-black/20 px-3 py-2 text-sm text-white outline-none transition-colors focus:border-indigo-500"
                        />
                        <button
                          onClick={handleSettingsPipApply}
                          disabled={settingsPipBusy}
                          className={cn(
                            "px-4 py-2 rounded-xl text-sm font-semibold transition-colors",
                            settingsPipBusy
                              ? "bg-zinc-700 text-zinc-400 cursor-not-allowed"
                              : "bg-indigo-600 hover:bg-indigo-500 text-white"
                          )}
                        >
                          {settingsPipBusy ? 'Working...' : 'Install / Upgrade'}
                        </button>
                      </div>

                      <label className="flex items-center justify-between gap-4">
                        <div>
                          <div className="text-sm font-medium text-white">Force Build Fallback</div>
                          <div className="text-xs text-zinc-500">Only used for new installs when a pure wheel is unavailable.</div>
                        </div>
                        <button
                          onClick={() => setSettingsPipForceBuild(flag => !flag)}
                          disabled={settingsPipBusy}
                          className={cn(
                            "w-10 h-5 rounded-full transition-all relative shrink-0",
                            settingsPipForceBuild ? "bg-indigo-600" : "bg-zinc-700",
                            settingsPipBusy && "opacity-60 cursor-not-allowed"
                          )}
                        >
                          <div className={cn(
                            "absolute top-1 w-3 h-3 bg-white rounded-full transition-all",
                            settingsPipForceBuild ? "right-1" : "left-1"
                          )} />
                        </button>
                      </label>

                      {settingsPipStatus && (
                        <p className="text-xs text-indigo-300 bg-indigo-500/10 border border-indigo-500/20 rounded-xl px-3 py-2">
                          {settingsPipStatus}
                        </p>
                      )}
                    </div>

                    {settingsPipPackages.length === 0 ? (
                      <p className="text-sm text-zinc-500">No saved Python packages yet.</p>
                    ) : (
                      <div className="space-y-2">
                        {settingsPipPackages.map(pkg => (
                          <div key={pkg.name} className="flex items-center justify-between gap-3 p-3 rounded-xl bg-white/5 border border-white/10">
                            <div className="min-w-0">
                              <div className="text-sm font-medium text-white truncate">{pkg.name}</div>
                              <div className="text-xs text-zinc-500">{pkg.version ? `Version ${pkg.version}` : 'Version not recorded'}</div>
                            </div>
                            <button
                              onClick={() => handleSettingsPipUninstall(pkg.name)}
                              disabled={settingsPipBusy}
                              className={cn(
                                "px-3 py-1.5 rounded-lg text-xs font-medium transition-colors shrink-0",
                                settingsPipBusy
                                  ? "bg-zinc-700 text-zinc-400 cursor-not-allowed"
                                  : "bg-red-500/10 text-red-300 hover:bg-red-500/20 border border-red-500/20"
                              )}
                            >
                              Uninstall
                            </button>
                          </div>
                        ))}
                      </div>
                    )}

                    <div className="rounded-2xl border border-white/10 bg-white/5 p-4 space-y-4">
                      <div>
                        <div className="text-sm font-medium text-white">Calibrate `.pyi` Import Size Per Module</div>
                        <div className="text-xs text-zinc-500 mt-1">
                          Default imports stop at {formatByteSize(DEFAULT_PYI_IMPORT_SIZE_LIMIT_BYTES)} per module. Add an override here or mark a module as unlimited to use only the overall {formatByteSize(ABSOLUTE_PYI_IMPORT_SIZE_LIMIT_BYTES)} extraction ceiling.
                        </div>
                      </div>

                      <div className="grid grid-cols-1 sm:grid-cols-[minmax(0,1.2fr)_120px_auto] gap-3">
                        <input
                          type="text"
                          value={settingsPyiImportSizeLimitModuleInput}
                          onChange={(e) => setSettingsPyiImportSizeLimitModuleInput(e.target.value)}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter') {
                              e.preventDefault();
                              handleSettingsPyiImportSizeLimitApply();
                            }
                          }}
                          placeholder="Module or package, e.g. numpy"
                          className="w-full rounded-xl border border-white/10 bg-black/20 px-3 py-2 text-sm text-white outline-none transition-colors focus:border-indigo-500"
                        />
                        <input
                          type="number"
                          min="1"
                          step="1"
                          value={settingsPyiImportSizeLimitInput}
                          onChange={(e) => setSettingsPyiImportSizeLimitInput(e.target.value)}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter') {
                              e.preventDefault();
                              handleSettingsPyiImportSizeLimitApply();
                            }
                          }}
                          placeholder="Size KB"
                          disabled={settingsPyiImportSizeUnlimited}
                          className={cn(
                            "w-full rounded-xl border border-white/10 bg-black/20 px-3 py-2 text-sm text-white outline-none transition-colors focus:border-indigo-500",
                            settingsPyiImportSizeUnlimited && "opacity-60 cursor-not-allowed"
                          )}
                        />
                        <button
                          onClick={handleSettingsPyiImportSizeLimitApply}
                          className="px-4 py-2 rounded-xl text-sm font-semibold transition-colors bg-indigo-600 hover:bg-indigo-500 text-white"
                        >
                          Save Limit
                        </button>
                      </div>

                      <label className="flex items-center justify-between gap-4">
                        <div>
                          <div className="text-sm font-medium text-white">Unlimited</div>
                          <div className="text-xs text-zinc-500">Disables the per-module cap and relies only on the overall extraction ceiling.</div>
                        </div>
                        <button
                          onClick={() => setSettingsPyiImportSizeUnlimited(flag => !flag)}
                          className={cn(
                            "w-10 h-5 rounded-full transition-all relative shrink-0",
                            settingsPyiImportSizeUnlimited ? "bg-indigo-600" : "bg-zinc-700"
                          )}
                        >
                          <div className={cn(
                            "absolute top-1 w-3 h-3 bg-white rounded-full transition-all",
                            settingsPyiImportSizeUnlimited ? "right-1" : "left-1"
                          )} />
                        </button>
                      </label>

                      {settingsPyiImportSizeLimitStatus && (
                        <p className="text-xs text-indigo-300 bg-indigo-500/10 border border-indigo-500/20 rounded-xl px-3 py-2">
                          {settingsPyiImportSizeLimitStatus}
                        </p>
                      )}

                      {settingsPyiImportSizeLimitOverrides.length === 0 ? (
                        <p className="text-sm text-zinc-500">No custom `.pyi` import size overrides yet.</p>
                      ) : (
                        <div className="space-y-2">
                          {settingsPyiImportSizeLimitOverrides.map(override => (
                            <div key={override.moduleName} className="flex items-center justify-between gap-3 p-3 rounded-xl bg-black/20 border border-white/10">
                              <div className="min-w-0">
                                <div className="text-sm font-medium text-white break-all">{override.moduleName}</div>
                                <div className="text-xs text-zinc-500">{formatSettingsPyiImportSizeLimit(override.maxBytes)}</div>
                              </div>
                              <button
                                onClick={() => handleSettingsPyiImportSizeLimitRemove(override.moduleName)}
                                className="px-3 py-1.5 rounded-lg text-xs font-medium transition-colors shrink-0 bg-red-500/10 text-red-300 hover:bg-red-500/20 border border-red-500/20"
                              >
                                Remove
                              </button>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>
                </section>

                <section>
                  <h4 className="text-xs font-bold uppercase tracking-widest text-zinc-500 mb-4">Package Includes</h4>
                  <div className="space-y-4">
                    <div className="rounded-2xl border border-white/10 bg-white/5 p-4 space-y-3">
                      <div>
                        <div className="text-sm font-medium text-white">Manage Saved `pip include` Modules</div>
                        <div className="text-xs text-zinc-500 mt-1">These modules are restored the first time Python authoring loads.</div>
                      </div>

                      <div className="grid grid-cols-1 sm:grid-cols-[minmax(0,1fr)_auto] gap-3">
                        <input
                          type="text"
                          value={settingsPipIncludeInput}
                          onChange={(e) => setSettingsPipIncludeInput(e.target.value)}
                          onKeyDown={async (e) => {
                            if (e.key === 'Enter' && !settingsPipIncludeBusy) {
                              e.preventDefault();
                              await handleSettingsPipIncludeApply();
                            }
                          }}
                          placeholder="Module name, e.g. asyncio"
                          className="w-full rounded-xl border border-white/10 bg-black/20 px-3 py-2 text-sm text-white outline-none transition-colors focus:border-indigo-500"
                        />
                        <button
                          onClick={handleSettingsPipIncludeApply}
                          disabled={settingsPipIncludeBusy}
                          className={cn(
                            "px-4 py-2 rounded-xl text-sm font-semibold transition-colors",
                            settingsPipIncludeBusy
                              ? "bg-zinc-700 text-zinc-400 cursor-not-allowed"
                              : "bg-indigo-600 hover:bg-indigo-500 text-white"
                          )}
                        >
                          {settingsPipIncludeBusy ? 'Working...' : 'Include'}
                        </button>
                      </div>

                      {settingsPipIncludeStatus && (
                        <p className="text-xs text-indigo-300 bg-indigo-500/10 border border-indigo-500/20 rounded-xl px-3 py-2">
                          {settingsPipIncludeStatus}
                        </p>
                      )}

                      {settingsPipIncludedModules.length === 0 ? (
                        <p className="text-sm text-zinc-500">No saved `pip include` modules.</p>
                      ) : (
                        <div className="space-y-2">
                          {settingsPipIncludedModules.map(moduleName => (
                            <div key={moduleName} className="flex items-center justify-between gap-3 p-3 rounded-xl bg-black/20 border border-white/10">
                              <div className="text-sm font-medium text-white break-all min-w-0">{moduleName}</div>
                              <button
                                onClick={() => handleSettingsPipIncludeRemove(moduleName)}
                                disabled={settingsPipIncludeBusy}
                                className={cn(
                                  "px-3 py-1.5 rounded-lg text-xs font-medium transition-colors shrink-0",
                                  settingsPipIncludeBusy
                                    ? "bg-zinc-700 text-zinc-400 cursor-not-allowed"
                                    : "bg-red-500/10 text-red-300 hover:bg-red-500/20 border border-red-500/20"
                                )}
                              >
                                Remove
                              </button>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>

                    <div className="rounded-2xl border border-white/10 bg-white/5 p-4 space-y-3">
                      <div>
                        <div className="text-sm font-medium text-white">Manage Saved `nuget include` Namespaces</div>
                        <div className="text-xs text-zinc-500 mt-1">These namespaces are restored when C# authoring initializes.</div>
                      </div>

                      <div className="grid grid-cols-1 sm:grid-cols-[minmax(0,1fr)_auto] gap-3">
                        <input
                          type="text"
                          value={settingsCSharpNamespaceInput}
                          onChange={(e) => setSettingsCSharpNamespaceInput(e.target.value)}
                          onKeyDown={async (e) => {
                            if (e.key === 'Enter' && !settingsCSharpNamespaceBusy) {
                              e.preventDefault();
                              await handleSettingsCSharpNamespaceApply();
                            }
                          }}
                          placeholder="Namespace, e.g. System.Xml"
                          className="w-full rounded-xl border border-white/10 bg-black/20 px-3 py-2 text-sm text-white outline-none transition-colors focus:border-indigo-500"
                        />
                        <button
                          onClick={handleSettingsCSharpNamespaceApply}
                          disabled={settingsCSharpNamespaceBusy}
                          className={cn(
                            "px-4 py-2 rounded-xl text-sm font-semibold transition-colors",
                            settingsCSharpNamespaceBusy
                              ? "bg-zinc-700 text-zinc-400 cursor-not-allowed"
                              : "bg-indigo-600 hover:bg-indigo-500 text-white"
                          )}
                        >
                          {settingsCSharpNamespaceBusy ? 'Working...' : 'Include'}
                        </button>
                      </div>

                      {settingsCSharpNamespaceStatus && (
                        <p className="text-xs text-indigo-300 bg-indigo-500/10 border border-indigo-500/20 rounded-xl px-3 py-2">
                          {settingsCSharpNamespaceStatus}
                        </p>
                      )}

                      {settingsCSharpNamespaces.length === 0 ? (
                        <p className="text-sm text-zinc-500">No saved `nuget include` namespaces.</p>
                      ) : (
                        <div className="space-y-2">
                          {settingsCSharpNamespaces.map(namespaceName => (
                            <div key={namespaceName} className="flex items-center justify-between gap-3 p-3 rounded-xl bg-black/20 border border-white/10">
                              <div className="text-sm font-medium text-white break-all min-w-0">{namespaceName}</div>
                              <button
                                onClick={() => handleSettingsCSharpNamespaceRemove(namespaceName)}
                                disabled={settingsCSharpNamespaceBusy}
                                className={cn(
                                  "px-3 py-1.5 rounded-lg text-xs font-medium transition-colors shrink-0",
                                  settingsCSharpNamespaceBusy
                                    ? "bg-zinc-700 text-zinc-400 cursor-not-allowed"
                                    : "bg-red-500/10 text-red-300 hover:bg-red-500/20 border border-red-500/20"
                                )}
                              >
                                Remove
                              </button>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>
                </section>

                {/* Folder Sync */}
                <section>
                  <h4 className="text-xs font-bold uppercase tracking-widest text-zinc-500 mb-4">Folder Sync</h4>
                  {syncMeta.length === 0 ? (
                    <p className="text-sm text-zinc-500">No folders have been synced yet. Open a folder and use the "Sync with Local Folder" button to get started.</p>
                  ) : (
                    <div className="space-y-2">
                      {syncMeta.map(m => {
                        const folder = files.find(f => f.id === m.folderId);
                        const isActive = activeSyncIds.has(m.folderId);
                        return (
                          <div key={m.folderId} className="flex items-center justify-between p-3 rounded-xl bg-white/5 border border-white/10">
                            <div className="flex items-center gap-3 min-w-0">
                              <Folder size={16} className="text-amber-400 shrink-0" />
                              <div className="min-w-0">
                                <p className="text-sm text-zinc-300 truncate">{folder?.name || m.folderName}</p>
                                <p className="text-xs text-zinc-500 truncate">{m.localPath} &middot; {new Date(m.connectedAt).toLocaleDateString()}</p>
                              </div>
                            </div>
                            <div className="flex items-center gap-2 shrink-0">
                              {isActive ? (
                                <>
                                  <span className="text-xs text-emerald-400 bg-emerald-500/10 border border-emerald-500/20 rounded-lg px-2 py-1">Active</span>
                                  <button onClick={() => stopFolderSync(m.folderId)} className="text-xs text-red-400 bg-red-500/10 hover:bg-red-500/20 border border-red-500/20 rounded-lg px-2 py-1 transition-all cursor-pointer">Unsync</button>
                                </>
                              ) : (
                                <>
                                  <span className="text-xs text-zinc-500 bg-white/5 border border-white/10 rounded-lg px-2 py-1">Disconnected</span>
                                  {folder && <button onClick={() => startFolderSync(m.folderId)} className="text-xs text-emerald-400 bg-emerald-500/10 hover:bg-emerald-500/20 border border-emerald-500/20 rounded-lg px-2 py-1 transition-all cursor-pointer">Reconnect</button>}
                                </>
                              )}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </section>

              </div>

              <div className="p-6 border-t border-white/5 bg-white/2 flex justify-end">
                <button
                  onClick={() => setIsSettingsOpen(false)}
                  className="px-6 py-2 bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl text-sm font-semibold transition-all shadow-lg shadow-indigo-900/20"
                >
                  Done
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      <style dangerouslySetInnerHTML={GLOBAL_STYLE_HTML} />
    </div>
  );
}
