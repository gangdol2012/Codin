import React, { useState, useEffect, useRef, createContext, useContext, useCallback, useMemo } from 'react';
import {
  Binary,
  Boxes,
  Braces,
  Coffee,
  FileCode,
  FileArchive,
  FileCog,
  FileImage,
  FileJson,
  FileText,
  FileType,
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
  Search,
  X,
  Check,
  Settings,
  Folder,
  FolderPlus,
  FilePlus,
  FolderSync,
  Unlink,
  Download,
  Upload,
  Copy,
  CopyPlus,
  ClipboardPaste,
  Pencil,
  Bug,
  Activity,
  Database,
  GitBranch,
  GitCommitHorizontal,
  Hash,
  RefreshCw,
  CloudUpload,
  KeyRound
} from 'lucide-react';
import Editor, { DiffEditor } from '@monaco-editor/react';
import { configureMonacoSuggestionAcceptance } from './monaco-suggest';
import { CODECRAFT_MONACO_THEME } from './python-coloring';
import { motion, AnimatePresence } from 'motion/react';
import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';
import { GoogleGenAI, Type, type FunctionDeclaration } from "@google/genai";
import ReactMarkdown from 'react-markdown';
import { flushSync } from 'react-dom';
import { Layout, Model, TabNode, IJsonModel, Actions, DockLocation } from 'flexlayout-react';
import * as monaco from 'monaco-editor';
import 'flexlayout-react/style/dark.css';
import * as Tooltip from '@radix-ui/react-tooltip';
import * as Separator from '@radix-ui/react-separator';
import type * as TypeScript from 'typescript';
import coinstantLogo from '../coinstant-logo.jpg';
import type {
  CSharpIdeDebugEvent,
  CSharpIdeDebugFeatureSnapshot,
  CSharpIdeDebugSnapshot,
  CSharpOmniSharpSource,
} from './csharp-omnisharp';
import {
  deleteSemanticDocumentationRecord,
  formatSemanticDocumentationTimestamp,
  getSemanticDocumentationProgressLabel,
  limitSemanticPrompt,
  loadSemanticDocumentationRecord,
  parseCSharpSemanticDocumentationProject,
  runSemanticDocumentationGeneration,
  type CSharpMethodMember,
  type CSharpTypeDeclaration,
  type CSharpValueMember,
  type SemanticDocumentationItem,
  type SemanticDocumentationRecord,
  type SemanticDocumentationSourceFile,
} from './semantic-documentation';

const APP_VERSION = __APP_VERSION__;

type UserFolder = import('./pyright').UserFolder;
type PyrightModule = typeof import('./pyright');
type CSharpAuthoringModule = typeof import('./csharp-omnisharp');
type BrowserCSharpModule = typeof import('./browser-csharp-api');
type CxxAuthoringModule = typeof import('./cpp-authoring');
type CxxRuntimeModule = typeof import('./cpp-wasm');
type JavaAuthoringModule = typeof import('./java-authoring');
type JavaRuntimeModule = typeof import('./java-wasm');
type TypeScriptModule = typeof TypeScript;

let pyrightModulePromise: Promise<PyrightModule> | null = null;
let csharpAuthoringModulePromise: Promise<CSharpAuthoringModule> | null = null;
let browserCSharpModulePromise: Promise<BrowserCSharpModule> | null = null;
let cxxAuthoringModulePromise: Promise<CxxAuthoringModule> | null = null;
let cxxRuntimeModulePromise: Promise<CxxRuntimeModule> | null = null;
let javaAuthoringModulePromise: Promise<JavaAuthoringModule> | null = null;
let javaRuntimeModulePromise: Promise<JavaRuntimeModule> | null = null;
let typescriptModulePromise: Promise<TypeScriptModule> | null = null;

const loadPyrightModule = () => {
  if (!pyrightModulePromise) pyrightModulePromise = import('./pyright');
  return pyrightModulePromise;
};

const loadCSharpAuthoringModule = () => {
  if (!csharpAuthoringModulePromise) csharpAuthoringModulePromise = import('./csharp-omnisharp');
  return csharpAuthoringModulePromise;
};

const loadBrowserCSharpModule = () => {
  if (!browserCSharpModulePromise) browserCSharpModulePromise = import('./browser-csharp-api');
  return browserCSharpModulePromise;
};

const loadCxxAuthoringModule = () => {
  if (!cxxAuthoringModulePromise) cxxAuthoringModulePromise = import('./cpp-authoring');
  return cxxAuthoringModulePromise;
};

const loadCxxRuntimeModule = () => {
  if (!cxxRuntimeModulePromise) cxxRuntimeModulePromise = import('./cpp-wasm');
  return cxxRuntimeModulePromise;
};

const loadJavaAuthoringModule = () => {
  if (!javaAuthoringModulePromise) javaAuthoringModulePromise = import('./java-authoring');
  return javaAuthoringModulePromise;
};

const loadJavaRuntimeModule = () => {
  if (!javaRuntimeModulePromise) javaRuntimeModulePromise = import('./java-wasm');
  return javaRuntimeModulePromise;
};

const loadTypeScriptModule = () => {
  if (!typescriptModulePromise) typescriptModulePromise = import('typescript');
  return typescriptModulePromise;
};

const SYNC_DB_NAME = 'codecraft-sync';
const SYNC_STORE_NAME = 'handles';
const SYNC_META_KEY = 'codecraft-sync-meta';
const PROJECTS_STORAGE_KEY = 'codecraft-projects';
const ACTIVE_PROJECT_STORAGE_KEY = 'codecraft-active-project-id';
const PROJECT_STORAGE_PREFIX = 'codecraft-project';
const DEFAULT_PROJECT_ID = 'default';
const PROJECT_DATA_DB_NAME = 'codecraft-project-data';
const PROJECT_DATA_STORE_NAME = 'data';
const PYTHON_CACHE_DB_NAME = 'codecraft-python-cache';
const PYTHON_CACHE_STORE_NAME = 'pyodide-package-meta';
const PYTHON_CACHE_PACKAGE_META_KEY = 'packages';
const PYTHON_CACHE_PACKAGE_SNAPSHOT_KEY = 'snapshot';
const NPM_PACKAGE_DB_NAME = 'codecraft-npm-packages';
const NPM_PACKAGE_STORE_NAME = 'packages';
const GIT_STATE_DB_NAME = 'codecraft-git-state';
const GIT_STATE_STORE_NAME = 'state';
const MAX_NPM_INSTALL_PACKAGE_COUNT = 4096;
const NPM_INSTALL_BROWSER_YIELD_EVERY = 8;
const NPM_INSTALL_PROGRESS_DETAIL_LIMIT = 120;
const MAX_NPM_PACKAGE_TEXT_FILE_BYTES = 5 * 1024 * 1024;
const MAX_NPM_PACKAGE_TOTAL_TEXT_BYTES = 40 * 1024 * 1024;
const NPM_INCLUDE_FETCH_TIMEOUT_MS = 12000;
const CODECRAFT_EDITOR_INDENT_SIZE = 4;

interface CodeCraftProjectMeta {
  id: string;
  name: string;
  createdAt: number;
  updatedAt: number;
}

function createProjectId() {
  return `project_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}

function createDefaultProjectMeta(): CodeCraftProjectMeta {
  const now = Date.now();
  return {
    id: DEFAULT_PROJECT_ID,
    name: 'Default Project',
    createdAt: now,
    updatedAt: now,
  };
}

function normalizeProjectMeta(value: unknown): CodeCraftProjectMeta | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const raw = value as Partial<CodeCraftProjectMeta>;
  if (typeof raw.id !== 'string' || !raw.id.trim()) return null;
  return {
    id: raw.id.trim(),
    name: typeof raw.name === 'string' && raw.name.trim() ? raw.name.trim() : 'Untitled Project',
    createdAt: Number.isFinite(raw.createdAt) ? raw.createdAt! : Date.now(),
    updatedAt: Number.isFinite(raw.updatedAt) ? raw.updatedAt! : Date.now(),
  };
}

function loadProjectRegistry(): CodeCraftProjectMeta[] {
  try {
    const parsed = JSON.parse(localStorage.getItem(PROJECTS_STORAGE_KEY) || '[]');
    const projects = Array.isArray(parsed)
      ? parsed.map(normalizeProjectMeta).filter((project): project is CodeCraftProjectMeta => project !== null)
      : [];
    return projects.length > 0 ? projects : [createDefaultProjectMeta()];
  } catch {
    return [createDefaultProjectMeta()];
  }
}

function saveProjectRegistry(projects: CodeCraftProjectMeta[]) {
  const deduped = new Map<string, CodeCraftProjectMeta>();
  for (const project of projects) {
    const normalized = normalizeProjectMeta(project);
    if (normalized) deduped.set(normalized.id, normalized);
  }
  const next = [...deduped.values()].sort((left, right) => right.updatedAt - left.updatedAt);
  localStorage.setItem(PROJECTS_STORAGE_KEY, JSON.stringify(next.length > 0 ? next : [createDefaultProjectMeta()]));
}

function getUniqueProjectName(baseName: string, projects: CodeCraftProjectMeta[]) {
  const trimmedBase = baseName.trim() || 'Untitled Project';
  const existingNames = new Set(projects.map(project => project.name));
  if (!existingNames.has(trimmedBase)) return trimmedBase;

  let index = 2;
  while (existingNames.has(`${trimmedBase} ${index}`)) index += 1;
  return `${trimmedBase} ${index}`;
}

function getProjectNameFromDataFileName(fileName: string) {
  const withoutExtension = fileName.replace(/\.[^.]+$/, '');
  const cleaned = withoutExtension
    .replace(/^codecraft-user-data[-_ ]*/i, '')
    .replace(/[-_]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  return cleaned || 'Imported Project';
}

function touchProjectUpdatedAt(projectId = getActiveProjectId(), timestamp = Date.now()) {
  const projects = loadProjectRegistry();
  const nextProjects = projects.map(project => (
    project.id === projectId
      ? { ...project, updatedAt: timestamp }
      : project
  ));
  if (!nextProjects.some(project => project.id === projectId)) {
    nextProjects.push({
      id: projectId,
      name: projectId === DEFAULT_PROJECT_ID ? 'Default Project' : 'Untitled Project',
      createdAt: timestamp,
      updatedAt: timestamp,
    });
  }
  saveProjectRegistry(nextProjects);
  return loadProjectRegistry();
}

function getActiveProjectId() {
  const projects = loadProjectRegistry();
  const activeId = localStorage.getItem(ACTIVE_PROJECT_STORAGE_KEY) || DEFAULT_PROJECT_ID;
  const resolved = projects.some(project => project.id === activeId)
    ? activeId
    : projects[0]?.id || DEFAULT_PROJECT_ID;
  if (resolved !== activeId) {
    localStorage.setItem(ACTIVE_PROJECT_STORAGE_KEY, resolved);
  }
  return resolved;
}

function setActiveProjectId(projectId: string) {
  const projects = loadProjectRegistry();
  if (!projects.some(project => project.id === projectId)) return false;
  localStorage.setItem(ACTIVE_PROJECT_STORAGE_KEY, projectId);
  return true;
}

function getProjectStorageKey(baseKey: string, projectId = getActiveProjectId()) {
  return `${PROJECT_STORAGE_PREFIX}:${projectId}:${baseKey}`;
}

function getProjectDbKey(baseKey: string, projectId = getActiveProjectId()) {
  return `${projectId}::${baseKey}`;
}

function isProjectDbKeyForCurrentProject(key: IDBValidKey, projectId = getActiveProjectId()) {
  return typeof key === 'string' && key.startsWith(`${projectId}::`);
}

function unscopedProjectDbKey(key: string, projectId = getActiveProjectId()) {
  const prefix = `${projectId}::`;
  return key.startsWith(prefix) ? key.slice(prefix.length) : key;
}

function getLegacyProjectStorageKeys(baseKey: string, projectId = getActiveProjectId()) {
  const keys = [getProjectStorageKey(baseKey, projectId)];
  if (projectId === DEFAULT_PROJECT_ID) keys.push(baseKey);
  return keys;
}

function removeLegacyProjectStorageValue(baseKey: string, projectId = getActiveProjectId()) {
  for (const key of getLegacyProjectStorageKeys(baseKey, projectId)) {
    localStorage.removeItem(key);
  }
}

function openProjectDataDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(PROJECT_DATA_DB_NAME, 1);
    req.onupgradeneeded = () => {
      if (!req.result.objectStoreNames.contains(PROJECT_DATA_STORE_NAME)) {
        req.result.createObjectStore(PROJECT_DATA_STORE_NAME);
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

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
    tx.objectStore(SYNC_STORE_NAME).put(handle, getProjectDbKey(folderId));
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

async function removeSyncHandle(folderId: string) {
  const db = await openSyncDB();
  return new Promise<void>((resolve, reject) => {
    const tx = db.transaction(SYNC_STORE_NAME, 'readwrite');
    const store = tx.objectStore(SYNC_STORE_NAME);
    store.delete(getProjectDbKey(folderId));
    if (getActiveProjectId() === DEFAULT_PROJECT_ID) store.delete(folderId);
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
        const key = cursor.key;
        if (isProjectDbKeyForCurrentProject(key)) {
          map.set(unscopedProjectDbKey(key as string), cursor.value as FileSystemDirectoryHandle);
        } else if (getActiveProjectId() === DEFAULT_PROJECT_ID && typeof key === 'string' && !key.includes('::')) {
          map.set(key, cursor.value as FileSystemDirectoryHandle);
        }
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

function openNpmPackageDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(NPM_PACKAGE_DB_NAME, 1);
    req.onupgradeneeded = () => {
      if (!req.result.objectStoreNames.contains(NPM_PACKAGE_STORE_NAME)) {
        req.result.createObjectStore(NPM_PACKAGE_STORE_NAME);
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

function openGitStateDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(GIT_STATE_DB_NAME, 1);
    req.onupgradeneeded = () => {
      if (!req.result.objectStoreNames.contains(GIT_STATE_STORE_NAME)) {
        req.result.createObjectStore(GIT_STATE_STORE_NAME);
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
    return decompressBytes(raw, 'deflate-raw');
  }
  throw new Error(`Unsupported ZIP method: ${entry.method}`);
}

async function decompressBytes(data: Uint8Array, format: CompressionFormat) {
  const stream = new Blob([data as unknown as BlobPart])
    .stream()
    .pipeThrough(new DecompressionStream(format));
  return new Uint8Array(await new Response(stream).arrayBuffer());
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

type AssistantProvider =
  | 'gemini'
  | 'openai'
  | 'anthropic'
  | 'openrouter'
  | 'deepseek'
  | 'xai'
  | 'mistral'
  | 'groq'
  | 'together'
  | 'fireworks'
  | 'cerebras'
  | 'moonshot'
  | 'perplexity'
  | 'cursor';
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

interface AssistantProviderMetadata {
  label: string;
  apiKeyLabel: string;
}

interface AssistantOpenAIChatProviderConfig {
  endpoint: string;
  requestLabel: string;
  supportsLocalTools: boolean | ((model: string) => boolean);
  defaultMaxTokens: number;
}

interface AssistantOpenAIResponsesProviderConfig {
  endpoint: string;
  requestLabel: string;
}

interface CursorServerSentEvent {
  id?: string;
  event?: string;
  data: string;
}

interface CursorTextBuffer {
  value: string;
}

interface CursorLocalToolBridgeCall {
  name: string;
  args?: Record<string, any>;
}

interface CursorLocalToolBridgeResponse {
  message: string;
  toolCalls: CursorLocalToolBridgeCall[];
  consumedEntireResponse: boolean;
}

interface SharedEditorTarget {
  tabId: string;
  itemId: string;
  version: number;
}

function loadSyncMeta(): SyncMeta[] {
  try { return JSON.parse(localStorage.getItem(getProjectStorageKey(SYNC_META_KEY)) || '[]'); }
  catch { return []; }
}

function saveSyncMeta(meta: SyncMeta[]) {
  localStorage.setItem(getProjectStorageKey(SYNC_META_KEY), JSON.stringify(meta));
}

const DEFAULT_ASSISTANT_CHAT_NAME = "AI assistant";
const DEFAULT_ASSISTANT_TOOL_PASSES = 4;
const MAX_ASSISTANT_CHAIN_OF_THOUGHT_DEPTH = 64;
const DEFAULT_ASSISTANT_REQUEST_RATE_LIMIT_PER_MINUTE = 0;
const MAX_ASSISTANT_REQUEST_RATE_LIMIT_PER_MINUTE = 120;
const DEFAULT_ASSISTANT_ESTIMATED_OUTPUT_TOKENS = 1024;
const DEFAULT_AUTO_DOCUMENTATION_PROMPT_TOKEN_LIMIT = 24000;
const MAX_AUTO_DOCUMENTATION_PROMPT_TOKEN_LIMIT = 256000;
const DEFAULT_DOCS_FIND_TYPE_MATCH_COUNT = 3;
const DEFAULT_DOCS_FIND_MEMBER_MATCH_COUNT = 10;
const MAX_DOCS_FIND_TYPE_MATCH_COUNT = 25;
const MAX_DOCS_FIND_MEMBER_MATCH_COUNT = 50;
const CURSOR_AGENTS_API_BASE_URL = 'https://api.cursor.com';
const CURSOR_AGENTS_GITHUB_REPOSITORY_URL = 'https://github.com/gangdol2012/repository';
const CODECRAFT_DELEGATE_SERVER_URL = 'https://codecraft-delegate.codecraftide.workers.dev/delegate';
const CURSOR_AGENT_STATUS_POLL_INTERVAL_MS = 2500;
const CURSOR_AGENT_STATUS_TIMEOUT_MS = 10 * 60 * 1000;
const createAssistantChatId = () => `chat_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
const INITIAL_ASSISTANT_CHAT_ID = createAssistantChatId();
const DEFAULT_PYI_IMPORT_SIZE_LIMIT_BYTES = 200 * 1024;
const ABSOLUTE_PYI_IMPORT_SIZE_LIMIT_BYTES = 2 * 1024 * 1024;

const ASSISTANT_PROVIDER_METADATA: Record<AssistantProvider, AssistantProviderMetadata> = {
  gemini: { label: 'Google Gemini', apiKeyLabel: 'Gemini API key' },
  openai: { label: 'OpenAI', apiKeyLabel: 'OpenAI API key' },
  anthropic: { label: 'Anthropic', apiKeyLabel: 'Anthropic API key' },
  openrouter: { label: 'OpenRouter', apiKeyLabel: 'OpenRouter API key' },
  deepseek: { label: 'DeepSeek', apiKeyLabel: 'DeepSeek API key' },
  xai: { label: 'xAI', apiKeyLabel: 'xAI API key' },
  mistral: { label: 'Mistral AI', apiKeyLabel: 'Mistral API key' },
  groq: { label: 'Groq', apiKeyLabel: 'Groq API key' },
  together: { label: 'Together AI', apiKeyLabel: 'Together API key' },
  fireworks: { label: 'Fireworks AI', apiKeyLabel: 'Fireworks API key' },
  cerebras: { label: 'Cerebras', apiKeyLabel: 'Cerebras API key' },
  moonshot: { label: 'Moonshot/Kimi', apiKeyLabel: 'Moonshot API key' },
  perplexity: { label: 'Perplexity', apiKeyLabel: 'Perplexity API key' },
  cursor: { label: 'Cursor Agents', apiKeyLabel: 'Cursor API key' },
};

const ASSISTANT_PROVIDER_OPTIONS: { value: AssistantProvider; label: string }[] = ([
  'gemini',
  'openai',
  'anthropic',
  'openrouter',
  'deepseek',
  'xai',
  'mistral',
  'groq',
  'together',
  'fireworks',
  'cerebras',
  'moonshot',
  'perplexity',
  'cursor',
] as AssistantProvider[]).map(value => ({ value, label: ASSISTANT_PROVIDER_METADATA[value].label }));

const ASSISTANT_MODEL_PRESETS: Record<AssistantProvider, AssistantModelPreset[]> = {
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
  openrouter: [
    { id: 'openai/gpt-5', label: 'GPT-5 via OpenRouter', reasoningControl: 'toggleable' },
    { id: 'anthropic/claude-sonnet-4.5', label: 'Claude Sonnet 4.5 via OpenRouter', reasoningControl: 'toggleable' },
    { id: 'google/gemini-2.5-pro', label: 'Gemini 2.5 Pro via OpenRouter', reasoningControl: 'always_on' },
    { id: 'deepseek/deepseek-r1', label: 'DeepSeek R1 via OpenRouter', reasoningControl: 'always_on' },
    { id: 'qwen/qwen3-coder', label: 'Qwen3 Coder via OpenRouter', reasoningControl: 'toggleable' },
  ],
  deepseek: [
    { id: 'deepseek-chat', label: 'DeepSeek Chat', reasoningControl: 'always_off' },
    { id: 'deepseek-reasoner', label: 'DeepSeek Reasoner', reasoningControl: 'always_on' },
  ],
  xai: [
    { id: 'grok-4.20-reasoning', label: 'Grok 4.20 Reasoning', reasoningControl: 'always_on' },
    { id: 'grok-4', label: 'Grok 4', reasoningControl: 'always_on' },
    { id: 'grok-3-mini', label: 'Grok 3 Mini', reasoningControl: 'always_on' },
  ],
  mistral: [
    { id: 'mistral-large-latest', label: 'Mistral Large', reasoningControl: 'always_off' },
    { id: 'mistral-small-latest', label: 'Mistral Small', reasoningControl: 'toggleable' },
    { id: 'magistral-medium-latest', label: 'Magistral Medium', reasoningControl: 'always_on' },
    { id: 'magistral-small-latest', label: 'Magistral Small', reasoningControl: 'always_on' },
    { id: 'devstral-latest', label: 'Devstral', reasoningControl: 'always_off' },
  ],
  groq: [
    { id: 'openai/gpt-oss-120b', label: 'GPT-OSS 120B', reasoningControl: 'always_on' },
    { id: 'openai/gpt-oss-20b', label: 'GPT-OSS 20B', reasoningControl: 'always_on' },
    { id: 'qwen/qwen3-32b', label: 'Qwen3 32B', reasoningControl: 'toggleable' },
    { id: 'llama-3.1-8b-instant', label: 'Llama 3.1 8B Instant', reasoningControl: 'always_off' },
  ],
  together: [
    { id: 'zai-org/GLM-5', label: 'GLM-5', reasoningControl: 'always_off' },
    { id: 'Qwen/Qwen3-Coder-480B-A35B-Instruct-FP8', label: 'Qwen3 Coder 480B', reasoningControl: 'always_off' },
    { id: 'deepseek-ai/DeepSeek-V3', label: 'DeepSeek V3', reasoningControl: 'always_off' },
    { id: 'meta-llama/Llama-4-Maverick-17B-128E-Instruct-FP8', label: 'Llama 4 Maverick', reasoningControl: 'always_off' },
  ],
  fireworks: [
    { id: 'accounts/fireworks/models/deepseek-v3p1', label: 'DeepSeek V3.1', reasoningControl: 'always_off' },
    { id: 'accounts/fireworks/models/kimi-k2-instruct', label: 'Kimi K2 Instruct', reasoningControl: 'always_off' },
    { id: 'accounts/fireworks/models/qwen3-coder-480b-a35b-instruct', label: 'Qwen3 Coder 480B', reasoningControl: 'always_off' },
    { id: 'accounts/fireworks/models/deepseek-r1', label: 'DeepSeek R1', reasoningControl: 'always_on' },
  ],
  cerebras: [
    { id: 'gpt-oss-120b', label: 'GPT-OSS 120B', reasoningControl: 'always_on' },
    { id: 'zai-glm-4.7', label: 'Z.ai GLM 4.7', reasoningControl: 'toggleable' },
    { id: 'qwen-3-235b-a22b-instruct-2507', label: 'Qwen3 235B Instruct', reasoningControl: 'always_off' },
    { id: 'llama3.1-8b', label: 'Llama 3.1 8B', reasoningControl: 'always_off' },
  ],
  moonshot: [
    { id: 'kimi-k2-0711-preview', label: 'Kimi K2', reasoningControl: 'always_off' },
    { id: 'moonshot-v1-128k', label: 'Moonshot v1 128K', reasoningControl: 'always_off' },
    { id: 'moonshot-v1-32k', label: 'Moonshot v1 32K', reasoningControl: 'always_off' },
  ],
  perplexity: [
    { id: 'sonar-pro', label: 'Sonar Pro', reasoningControl: 'always_off' },
    { id: 'sonar', label: 'Sonar', reasoningControl: 'always_off' },
    { id: 'sonar-reasoning-pro', label: 'Sonar Reasoning Pro', reasoningControl: 'always_on' },
  ],
  cursor: [
    { id: 'composer-2', label: 'Composer 2', reasoningControl: 'toggleable' },
    { id: 'gpt-5.5', label: 'GPT-5.5', reasoningControl: 'toggleable' },
    { id: 'claude-4-sonnet-thinking', label: 'Claude 4 Sonnet Thinking', reasoningControl: 'always_on' },
  ],
};

const OPENAI_CHAT_PROVIDER_CONFIGS: Partial<Record<AssistantProvider, AssistantOpenAIChatProviderConfig>> = {
  openrouter: {
    endpoint: 'https://openrouter.ai/api/v1/chat/completions',
    requestLabel: 'OpenRouter request failed.',
    supportsLocalTools: true,
    defaultMaxTokens: 8192,
  },
  deepseek: {
    endpoint: 'https://api.deepseek.com/chat/completions',
    requestLabel: 'DeepSeek request failed.',
    supportsLocalTools: true,
    defaultMaxTokens: 8192,
  },
  mistral: {
    endpoint: 'https://api.mistral.ai/v1/chat/completions',
    requestLabel: 'Mistral request failed.',
    supportsLocalTools: true,
    defaultMaxTokens: 8192,
  },
  groq: {
    endpoint: 'https://api.groq.com/openai/v1/chat/completions',
    requestLabel: 'Groq request failed.',
    supportsLocalTools: true,
    defaultMaxTokens: 8192,
  },
  together: {
    endpoint: 'https://api.together.xyz/v1/chat/completions',
    requestLabel: 'Together AI request failed.',
    supportsLocalTools: true,
    defaultMaxTokens: 8192,
  },
  fireworks: {
    endpoint: 'https://api.fireworks.ai/inference/v1/chat/completions',
    requestLabel: 'Fireworks request failed.',
    supportsLocalTools: true,
    defaultMaxTokens: 8192,
  },
  cerebras: {
    endpoint: 'https://api.cerebras.ai/v1/chat/completions',
    requestLabel: 'Cerebras request failed.',
    supportsLocalTools: true,
    defaultMaxTokens: 8192,
  },
  moonshot: {
    endpoint: 'https://api.moonshot.ai/v1/chat/completions',
    requestLabel: 'Moonshot request failed.',
    supportsLocalTools: true,
    defaultMaxTokens: 8192,
  },
  perplexity: {
    endpoint: 'https://api.perplexity.ai/chat/completions',
    requestLabel: 'Perplexity request failed.',
    supportsLocalTools: true,
    defaultMaxTokens: 8192,
  },
};

const OPENAI_RESPONSES_PROVIDER_CONFIGS: Partial<Record<AssistantProvider, AssistantOpenAIResponsesProviderConfig>> = {
  xai: {
    endpoint: 'https://api.x.ai/v1/responses',
    requestLabel: 'xAI request failed.',
  },
};
const STORAGE_KEYS = {
  files: 'codecraft-files',
  settings: 'codecraft-settings',
  assistantChats: 'codecraft-assistant-chats',
  layout: 'codecraft-layout',
  pipPackages: 'codecraft-pip-packages',
  pipIncludedModules: 'codecraft-pip-included-modules',
  npmPackages: 'codecraft-npm-packages',
  javascriptIncludedModules: 'codecraft-javascript-included-modules',
  csharpNamespaces: 'codecraft-csharp-namespaces',
  pyiImportSizeLimits: 'codecraft-pyi-import-size-limits',
  gitState: 'codecraft-git-state'
};

const PROJECT_LOCAL_STORAGE_KEYS = [
  ...Object.entries(STORAGE_KEYS)
    .filter(([key]) => key !== 'gitState' && key !== 'files')
    .map(([, value]) => value),
  SYNC_META_KEY,
];

function migrateLegacyDefaultProjectStorage() {
  const hasProjectRegistry = localStorage.getItem(PROJECTS_STORAGE_KEY) != null;
  const projects = loadProjectRegistry();
  if (!hasProjectRegistry) {
    saveProjectRegistry(projects);
  }

  const resolvedProjects = loadProjectRegistry();
  const activeProjectId = localStorage.getItem(ACTIVE_PROJECT_STORAGE_KEY);
  if (!activeProjectId || !resolvedProjects.some(project => project.id === activeProjectId)) {
    localStorage.setItem(ACTIVE_PROJECT_STORAGE_KEY, resolvedProjects[0]?.id || DEFAULT_PROJECT_ID);
  }

  if (hasProjectRegistry) return;

  for (const baseKey of PROJECT_LOCAL_STORAGE_KEYS) {
    const projectKey = getProjectStorageKey(baseKey, DEFAULT_PROJECT_ID);
    if (localStorage.getItem(projectKey) != null) continue;
    const legacyValue = localStorage.getItem(baseKey);
    if (legacyValue != null) {
      localStorage.setItem(projectKey, legacyValue);
    }
  }
}

migrateLegacyDefaultProjectStorage();

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
  cpp: 'cpp', cc: 'cpp', cxx: 'cpp', 'c++': 'cpp', hpp: 'cpp', hh: 'cpp', hxx: 'cpp', ipp: 'cpp', tpp: 'cpp',
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

function getFilenameExtension(name: string) {
  const filename = name.split('/').pop()?.toLowerCase() || '';
  const parts = filename.split('.');
  return parts.length > 1 ? parts.pop() || '' : '';
}

function getFileIconMeta(path: string, language?: string) {
  const filename = path.split('/').pop()?.toLowerCase() || path.toLowerCase();
  const extension = getFilenameExtension(path);
  const resolvedLanguage = (language || langFromFilename(filename)).toLowerCase();

  if (filename === 'package.json' || filename === 'package-lock.json') return { Icon: Boxes, className: 'text-emerald-400' };
  if (/^(?:vite|wrangler|tailwind|postcss|eslint|prettier|tsconfig|jsconfig|babel|rollup|webpack|vercel)\b/.test(filename)) return { Icon: FileCog, className: 'text-zinc-400' };
  if (/^(?:dockerfile|containerfile)$/.test(filename)) return { Icon: Boxes, className: 'text-cyan-400' };

  if (['png', 'jpg', 'jpeg', 'gif', 'webp', 'avif', 'ico', 'bmp'].includes(extension)) return { Icon: FileImage, className: 'text-fuchsia-400' };
  if (['zip', 'tar', 'gz', 'tgz', 'br', 'rar', '7z'].includes(extension)) return { Icon: FileArchive, className: 'text-stone-400' };
  if (['wasm', 'dll', 'pdb', 'bin', 'dat'].includes(extension)) return { Icon: Binary, className: 'text-zinc-500' };

  switch (resolvedLanguage) {
    case 'javascript':
      return { Icon: Braces, className: 'text-yellow-300' };
    case 'typescript':
      return { Icon: Braces, className: 'text-sky-400' };
    case 'python':
      return { Icon: FileCode, className: 'text-emerald-400' };
    case 'csharp':
      return { Icon: Hash, className: 'text-violet-400' };
    case 'java':
      return { Icon: Coffee, className: 'text-orange-400' };
    case 'c':
    case 'cpp':
      return { Icon: Binary, className: 'text-blue-400' };
    case 'html':
      return { Icon: FileCode, className: 'text-orange-300' };
    case 'css':
    case 'scss':
    case 'less':
      return { Icon: Hash, className: 'text-cyan-400' };
    case 'json':
      return { Icon: FileJson, className: 'text-amber-300' };
    case 'markdown':
    case 'plaintext':
      return { Icon: FileText, className: 'text-zinc-400' };
    case 'xml':
      return extension === 'svg'
        ? { Icon: FileImage, className: 'text-pink-400' }
        : { Icon: FileCode, className: 'text-orange-300' };
    case 'yaml':
    case 'ini':
      return { Icon: FileCog, className: 'text-zinc-400' };
    case 'shell':
      return { Icon: TerminalIcon, className: 'text-lime-400' };
    case 'sql':
      return { Icon: Database, className: 'text-cyan-300' };
    default:
      return { Icon: FileType, className: 'text-zinc-500' };
  }
}

function FileTypeIcon({ path, language, size = 16, className }: { path: string; language?: string; size?: number; className?: string }) {
  const { Icon, className: iconClassName } = getFileIconMeta(path, language);
  return <Icon size={size} className={cn("shrink-0", iconClassName, className)} />;
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
          },
          {
            type: "tab",
            id: "source-control-panel-tab",
            name: "Source Control",
            component: "sourceControl",
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
  tabSize: CODECRAFT_EDITOR_INDENT_SIZE,
  indentSize: CODECRAFT_EDITOR_INDENT_SIZE,
  insertSpaces: true,
  detectIndentation: false,
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
  'semanticHighlighting.enabled': true as const,
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

const updateCodeCraftModelOptions = (model: monaco.editor.ITextModel | null | undefined) => {
  model?.updateOptions?.({
    tabSize: CODECRAFT_EDITOR_INDENT_SIZE,
    indentSize: CODECRAFT_EDITOR_INDENT_SIZE,
    insertSpaces: true,
    trimAutoWhitespace: true,
    bracketColorizationOptions: {
      enabled: false,
      independentColorPoolPerBracketType: false,
    },
  });
};

// Define AI tools
function isAssistantProvider(value: unknown): value is AssistantProvider {
  return typeof value === 'string' && value in ASSISTANT_PROVIDER_METADATA;
}

function getAssistantDefaultModel(provider: AssistantProvider) {
  return ASSISTANT_MODEL_PRESETS[provider][0]?.id || '';
}

function getAssistantProviderLabel(provider: AssistantProvider) {
  return ASSISTANT_PROVIDER_METADATA[provider]?.label || provider;
}

function getAssistantApiKeyLabel(provider: AssistantProvider) {
  return ASSISTANT_PROVIDER_METADATA[provider]?.apiKeyLabel || 'API key';
}

function getOpenAIChatProviderConfig(provider: AssistantProvider) {
  return OPENAI_CHAT_PROVIDER_CONFIGS[provider] || null;
}

function getOpenAIResponsesProviderConfig(provider: AssistantProvider) {
  return OPENAI_RESPONSES_PROVIDER_CONFIGS[provider] || null;
}

function getAssistantSupportsLocalTools(provider: AssistantProvider, model: string) {
  if (provider === 'gemini' || provider === 'openai' || provider === 'anthropic' || provider === 'xai' || provider === 'cursor') {
    return true;
  }
  const config = getOpenAIChatProviderConfig(provider);
  if (!config) return false;
  return typeof config.supportsLocalTools === 'function'
    ? config.supportsLocalTools(model)
    : config.supportsLocalTools;
}

function getAssistantReasoningControl(provider: AssistantProvider, model: string): AssistantReasoningControl {
  const trimmed = model.trim();
  const preset = ASSISTANT_MODEL_PRESETS[provider].find(entry => entry.id === trimmed);
  if (preset) return preset.reasoningControl;

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

  if (provider === 'openrouter') {
    if (/(gpt-5|o[134]|grok|deepseek-r1|qwen3|qwen-3|gemini-2\.5|gemini-3|claude|magistral)/i.test(trimmed)) return 'toggleable';
    return 'always_off';
  }

  if (provider === 'deepseek') {
    if (/^deepseek-reasoner$/i.test(trimmed)) return 'always_on';
    return 'always_off';
  }

  if (provider === 'xai') {
    if (/grok.*(reasoning|mini|4|3)/i.test(trimmed)) return 'always_on';
    return 'always_off';
  }

  if (provider === 'mistral') {
    if (/^mistral-small-latest$/i.test(trimmed)) return 'toggleable';
    if (/^magistral-/i.test(trimmed)) return 'always_on';
    return 'always_off';
  }

  if (provider === 'groq') {
    if (/^openai\/gpt-oss/i.test(trimmed)) return 'always_on';
    if (/^qwen\/qwen3-32b/i.test(trimmed)) return 'toggleable';
    return 'always_off';
  }

  if (provider === 'cerebras') {
    if (/^zai-glm-4\.7/i.test(trimmed)) return 'toggleable';
    if (/^gpt-oss/i.test(trimmed)) return 'always_on';
    return 'always_off';
  }

  if (provider === 'fireworks') {
    if (/deepseek-r1/i.test(trimmed)) return 'always_on';
    return 'always_off';
  }

  if (provider === 'perplexity') {
    if (/reasoning/i.test(trimmed)) return 'always_on';
    return 'always_off';
  }

  if (provider === 'cursor') {
    if (/(thinking|reasoning|gpt-5|claude|composer)/i.test(trimmed)) return 'toggleable';
    return 'toggleable';
  }

  return 'always_off';
}

function getAssistantReasoningAvailabilityNote(provider: AssistantProvider, model: string) {
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

function parseCursorServerSentEventFrame(frame: string): CursorServerSentEvent | null {
  const lines = frame.split('\n');
  let id: string | undefined;
  let event: string | undefined;
  const data: string[] = [];

  for (const rawLine of lines) {
    const line = rawLine.trimEnd();
    if (!line || line.startsWith(':')) continue;
    if (line.startsWith('id:')) {
      id = line.slice(3).trim();
    } else if (line.startsWith('event:')) {
      event = line.slice(6).trim();
    } else if (line.startsWith('data:')) {
      data.push(line.slice(5).trimStart());
    }
  }

  if (!id && !event && data.length === 0) return null;
  return {
    ...(id ? { id } : {}),
    ...(event ? { event } : {}),
    data: data.join('\n'),
  };
}

async function readCursorServerSentEvents(
  response: Response,
  onEvent: (event: CursorServerSentEvent) => Promise<boolean | void> | boolean | void
) {
  const reader = response.body?.getReader();
  if (!reader) return;

  const decoder = new TextDecoder();
  let buffer = '';

  const drainFrame = async (frame: string) => {
    const parsed = parseCursorServerSentEventFrame(frame);
    if (!parsed) return true;
    const shouldContinue = await onEvent(parsed);
    return shouldContinue !== false;
  };

  try {
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true }).replace(/\r\n/g, '\n');
      let separatorIndex = buffer.indexOf('\n\n');
      while (separatorIndex !== -1) {
        const frame = buffer.slice(0, separatorIndex);
        buffer = buffer.slice(separatorIndex + 2);
        if (!await drainFrame(frame)) {
          await reader.cancel();
          return;
        }
        separatorIndex = buffer.indexOf('\n\n');
      }
    }

    buffer += decoder.decode().replace(/\r\n/g, '\n');
    if (buffer.trim()) {
      await drainFrame(buffer);
    }
  } finally {
    reader.releaseLock();
  }
}

function buildDelegatedRequestUrl(targetUrl: string) {
  const delegateUrl = new URL(CODECRAFT_DELEGATE_SERVER_URL);
  delegateUrl.searchParams.set('url', targetUrl);
  return delegateUrl.toString();
}

function appendCursorText(buffer: CursorTextBuffer, text: string) {
  if (!text) return;
  if (!buffer.value || text === buffer.value || text.startsWith(buffer.value)) {
    buffer.value = text;
    return;
  }
  buffer.value += text;
}

function chooseCursorStreamText(preferred: CursorTextBuffer, fallback: CursorTextBuffer) {
  const preferredText = preferred.value.trim();
  const fallbackText = fallback.value.trim();
  if (!preferredText) return fallbackText;
  if (!fallbackText) return preferredText;
  if (preferredText.includes(fallbackText)) return preferredText;
  if (fallbackText.includes(preferredText)) return fallbackText;
  return preferredText;
}

function stripAssistantJsonFence(value: string) {
  const trimmed = value.trim();
  const match = trimmed.match(/^```(?:json|codecraft-tools)?\s*([\s\S]*?)\s*```$/i);
  return match ? match[1].trim() : trimmed;
}

function parseAssistantJsonCandidate(value: string) {
  try {
    return JSON.parse(stripAssistantJsonFence(value));
  } catch {
    return null;
  }
}

function normalizeCursorLocalToolName(value: unknown) {
  const rawName = typeof value === 'string' ? value.trim() : '';
  const normalized = rawName.replace(/[\s_-]+/g, '').toLowerCase();
  switch (normalized) {
    case 'edit':
    case 'editfile':
    case 'write':
    case 'writefile':
    case 'replacefile':
    case 'replacefilecontent':
    case 'updatefile':
      return 'proposeEdit';
    case 'read':
    case 'readfile':
    case 'cat':
      return 'terminalCat';
    case 'list':
    case 'listdirectory':
    case 'listfiles':
    case 'ls':
      return 'ls';
    case 'pwd':
      return 'terminalPwd';
    case 'cd':
      return 'terminalCd';
    case 'mkdir':
      return 'terminalMkdir';
    case 'touch':
      return 'terminalTouch';
    case 'open':
    case 'openfile':
      return 'terminalOpen';
    case 'rm':
    case 'remove':
    case 'removefile':
    case 'delete':
    case 'deletefile':
      return 'terminalRm';
    case 'clear':
      return 'terminalClear';
    case 'date':
      return 'terminalDate';
    case 'echo':
      return 'terminalEcho';
    case 'command':
    case 'runcommand':
    case 'executecommand':
    case 'terminal':
    case 'terminalcommand':
    case 'runterminalcommand':
    case 'executeterminalcommand':
    case 'shell':
    case 'shellcommand':
    case 'bash':
      return 'runTerminalCommand';
    case 'docsfind':
    case 'documentationfind':
    case 'finddocs':
    case 'finddocumentation':
      return 'docsFind';
    case 'docsget':
    case 'documentationget':
    case 'getdocs':
    case 'getdocumentation':
      return 'docsGet';
    case 'codinget':
    case 'codin':
      return 'codinGet';
    default:
      return rawName;
  }
}

function normalizeCursorLocalToolArgs(toolName: string, value: unknown): Record<string, any> {
  const source = value && typeof value === 'object' && !Array.isArray(value)
    ? { ...(value as Record<string, any>) }
    : {};

  const firstString = (...keys: string[]) => (
    keys.map(key => source[key]).find(entry => typeof entry === 'string')
  );

  if (toolName === 'proposeEdit') {
    return {
      ...source,
      pathOrName: source.pathOrName ?? firstString('path', 'filePath', 'filepath', 'file', 'filename', 'name'),
      newContent: source.newContent ?? source.content ?? source.text ?? source.replacement,
    };
  }

  if (
    toolName === 'navigateTo'
    || toolName === 'terminalOpen'
    || toolName === 'terminalCat'
    || toolName === 'terminalRm'
    || toolName === 'ls'
  ) {
    return {
      ...source,
      pathOrName: source.pathOrName ?? firstString('path', 'filePath', 'filepath', 'file', 'directory', 'dir', 'target', 'name'),
    };
  }

  if (toolName === 'terminalCd') {
    return {
      ...source,
      target: source.target ?? firstString('path', 'directory', 'dir', 'pathOrName', 'name'),
    };
  }

  if (toolName === 'terminalMkdir' || toolName === 'terminalTouch') {
    return {
      ...source,
      name: source.name ?? firstString('path', 'pathOrName', 'file', 'directory'),
    };
  }

  if (toolName === 'terminalEcho') {
    return {
      ...source,
      text: source.text ?? source.message ?? '',
    };
  }

  if (toolName === 'runTerminalCommand') {
    return {
      ...source,
      command: source.command ?? source.cmd ?? source.text ?? source.input ?? source.shell ?? source.terminal ?? source.query,
    };
  }

  if (toolName === 'docsFind') {
    return {
      ...source,
      description: source.description ?? source.query ?? source.prompt ?? source.text,
      typeLimit: source.typeLimit ?? source.types ?? source.typeMatches ?? source.typeCount,
      memberLimit: source.memberLimit ?? source.members ?? source.memberMatches ?? source.memberCount,
      hideReason: source.hideReason ?? source.noReason,
      hideDocumentation: source.hideDocumentation ?? source.hideDocs ?? source.noDocs,
    };
  }

  if (toolName === 'docsGet') {
    return {
      ...source,
      itemName: source.itemName ?? source.name ?? source.path ?? source.query ?? source.text,
    };
  }

  if (toolName === 'codinGet') {
    return {
      ...source,
      symbolPath: source.symbolPath ?? source.path ?? source.query ?? source.name ?? source.text,
    };
  }

  return source;
}

function normalizeCursorLocalToolCall(value: unknown): CursorLocalToolBridgeCall | null {
  if (!value || typeof value !== 'object') return null;
  const record = value as Record<string, any>;
  const name = normalizeCursorLocalToolName(record.name ?? record.tool ?? record.type);
  if (!name) return null;
  const rawArgs = record.args ?? record.arguments ?? record.input ?? {};
  return {
    name,
    args: normalizeCursorLocalToolArgs(name, rawArgs),
  };
}

function normalizeCursorLocalToolBridgePayload(value: unknown, consumedEntireResponse: boolean): CursorLocalToolBridgeResponse | null {
  if (!value || typeof value !== 'object') return null;
  const record = value as Record<string, any>;
  const rawToolCalls = Array.isArray(record.toolCalls)
    ? record.toolCalls
    : Array.isArray(record.tool_calls)
      ? record.tool_calls
      : Array.isArray(record.calls)
        ? record.calls
        : null;
  if (!rawToolCalls) return null;
  const toolCalls = rawToolCalls
    .map(normalizeCursorLocalToolCall)
    .filter((call): call is CursorLocalToolBridgeCall => call !== null);
  if (toolCalls.length === 0) return null;
  const rawMessage = [record.message, record.content, record.response, record.summary]
    .find(entry => typeof entry === 'string');
  return {
    message: typeof rawMessage === 'string' ? rawMessage.trim() : '',
    toolCalls,
    consumedEntireResponse,
  };
}

function parseCursorLocalToolBridgeResponse(text: string): CursorLocalToolBridgeResponse | null {
  const toolCalls: CursorLocalToolBridgeCall[] = [];
  const messages: string[] = [];
  let consumedEntireResponse = false;

  const absorbPayload = (value: unknown, consumed: boolean) => {
    const payload = normalizeCursorLocalToolBridgePayload(value, consumed);
    if (!payload) return false;
    toolCalls.push(...payload.toolCalls);
    if (payload.message) messages.push(payload.message);
    consumedEntireResponse = consumedEntireResponse || payload.consumedEntireResponse;
    return true;
  };

  const taggedBlockPattern = /<codecraft-tools>([\s\S]*?)<\/codecraft-tools>/gi;
  for (const match of text.matchAll(taggedBlockPattern)) {
    absorbPayload(parseAssistantJsonCandidate(match[1] || ''), false);
  }

  const fencedBlockPattern = /```(?:json|codecraft-tools)\s*([\s\S]*?)```/gi;
  for (const match of text.matchAll(fencedBlockPattern)) {
    absorbPayload(parseAssistantJsonCandidate(match[1] || ''), false);
  }

  if (toolCalls.length === 0) {
    const parsedEntireResponse = parseAssistantJsonCandidate(text);
    consumedEntireResponse = absorbPayload(parsedEntireResponse, true);
  }

  if (toolCalls.length === 0) return null;
  return {
    message: messages.filter(Boolean).join('\n\n').trim(),
    toolCalls,
    consumedEntireResponse,
  };
}

function stripCursorLocalToolBridgeBlocks(text: string) {
  return text
    .replace(/<codecraft-tools>[\s\S]*?<\/codecraft-tools>/gi, '')
    .replace(/```(?:json|codecraft-tools)\s*[\s\S]*?```/gi, '')
    .trim();
}

function buildCursorLocalToolBridgeInstruction(tools: AssistantToolDefinition[]) {
  const toolSchemas = tools.map(tool => ({
    name: tool.name,
    description: tool.description,
    parameters: tool.parameters,
  }));

  return `
    Cursor Cloud Agents are remote and repository-backed, but this CodeCraft integration must edit only the local IDE workspace.
    Do not use Cursor/provider-native shell, filesystem, source-control, repository, PR, branch, git, GitHub, or edit tools.
    To inspect or modify CodeCraft's local IDE, ask CodeCraft to run local tools by emitting one JSON object inside a <codecraft-tools> block.
    Use this exact shape:
    <codecraft-tools>
    {"message":"optional short user-facing progress note","toolCalls":[{"name":"toolName","args":{"argumentName":"value"}}]}
    </codecraft-tools>
    If you need to edit code, use proposeEdit with the complete new file content. CodeCraft will apply that request inside the IDE review flow.
    If the task is complete and no local tool is needed, respond normally without a <codecraft-tools> block.
    Allowed CodeCraft local tools:
    ${JSON.stringify(toolSchemas, null, 2)}
  `;
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

function toOpenAIChatToolDefinition(tool: AssistantToolDefinition) {
  return {
    type: 'function',
    function: {
      name: tool.name,
      description: tool.description,
      parameters: tool.parameters,
    },
  };
}

function toAnthropicToolDefinition(tool: AssistantToolDefinition) {
  return {
    name: tool.name,
    description: tool.description,
    input_schema: tool.parameters,
  };
}

function getOpenAIChatReasoningRequestOptions(
  provider: AssistantProvider,
  model: string,
  useChainOfThought: boolean,
) {
  const control = getAssistantReasoningControl(provider, model);
  if (control === 'always_off') return {};
  const reasoningEnabled = control === 'always_on' || useChainOfThought;

  if (provider === 'openrouter') {
    return {
      reasoning: reasoningEnabled
        ? { effort: 'medium', exclude: true }
        : { effort: 'none', exclude: true },
    };
  }

  if (provider === 'mistral') {
    if (/^mistral-small-latest$/i.test(model)) {
      return { reasoning_effort: reasoningEnabled ? 'high' : 'none' };
    }
    return {};
  }

  if (provider === 'groq') {
    if (/^qwen\/qwen3-32b/i.test(model)) {
      return {
        reasoning_effort: reasoningEnabled ? 'default' : 'none',
        reasoning_format: 'hidden',
      };
    }
    if (/^openai\/gpt-oss/i.test(model)) {
      return {
        reasoning_effort: 'medium',
        reasoning_format: 'hidden',
      };
    }
    return {};
  }

  if (provider === 'cerebras') {
    if (/^zai-glm-4\.7/i.test(model)) {
      return { reasoning_effort: reasoningEnabled ? 'high' : 'none' };
    }
    if (/^gpt-oss/i.test(model)) {
      return { reasoning_effort: 'medium' };
    }
  }

  return {};
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
  description: "Run any command supported by the built-in terminal emulator, including git, gh, docs, codin, pip, npm, nuget, and help.",
  parameters: {
    type: 'object',
    description: "Run any command supported by the built-in terminal emulator.",
    properties: {
      command: {
        type: 'string',
        description: "Terminal command text to execute exactly as it would be typed in CodeCraft's terminal.",
      },
    },
    required: ["command"],
  },
};

const lsTool: AssistantToolDefinition = {
  name: "ls",
  description: "List files and folders in the current working directory or in a target folder.",
  parameters: {
    type: 'object',
    description: "List files and folders in the fake terminal.",
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

const npmIncludeTool: AssistantToolDefinition = {
  name: "npmInclude",
  description: "Include an exact JavaScript/TypeScript module specifier in the fake terminal.",
  parameters: {
    type: 'object',
    properties: {
      moduleName: {
        type: 'string',
        description: "JavaScript module specifier to include.",
      },
      url: {
        type: 'string',
        description: "Optional module URL. If omitted, CodeCraft checks cdnjs, jsDelivr, Google Hosted Libraries, unpkg, then esm.sh.",
      },
    },
    required: ['moduleName'],
  },
};

const npmInstallTool: AssistantToolDefinition = {
  name: "npmInstall",
  description: "Install one or more JavaScript/TypeScript npm packages from the npm registry in the fake terminal.",
  parameters: {
    type: 'object',
    properties: {
      packageName: {
        type: 'string',
        description: "One or more npm package specifiers to install, separated by spaces.",
      },
    },
    required: ['packageName'],
  },
};

const npmUninstallTool: AssistantToolDefinition = {
  name: "npmUninstall",
  description: "Uninstall a JavaScript/TypeScript npm package from the fake terminal.",
  parameters: {
    type: 'object',
    properties: {
      packageName: {
        type: 'string',
        description: "One or more npm package specifiers to uninstall, separated by spaces.",
      },
    },
    required: ['packageName'],
  },
};

const npmListTool: AssistantToolDefinition = {
  name: "npmList",
  description: "List installed JavaScript/TypeScript modules in the fake terminal.",
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

const codinGetTool: AssistantToolDefinition = {
  name: "codinGet",
  description: "Get a C# type or member source snippet by exact C# symbol path, such as Calculator, Calculator.Foo, or MyNamespace.Calculator.Foo.",
  parameters: {
    type: 'object',
    properties: {
      symbolPath: {
        type: 'string',
        description: "Exact C# symbol path to retrieve. Use TypeName for global-namespace types, Namespace.TypeName for namespaced types, and append .MemberName for members.",
      },
    },
    required: ['symbolPath'],
  },
};

const docsFindTool: AssistantToolDefinition = {
  name: "docsFind",
  description: "Find generated C# semantic documentation that matches a natural-language description.",
  parameters: {
    type: 'object',
    description: "Run the docs find semantic documentation search.",
    properties: {
      description: {
        type: 'string',
        description: "Natural-language description of the C# type or member behavior to find.",
      },
      typeLimit: {
        type: 'number',
        description: "Optional number of type matches to rank before member ranking.",
      },
      memberLimit: {
        type: 'number',
        description: "Optional number of final member matches to return.",
      },
      hideReason: {
        type: 'boolean',
        description: "Whether to hide model selection reasons in the result.",
      },
      hideDocumentation: {
        type: 'boolean',
        description: "Whether to hide documentation excerpts in the result.",
      },
    },
    required: ['description'],
  },
};

const docsGetTool: AssistantToolDefinition = {
  name: "docsGet",
  description: "Get generated C# semantic documentation for an exact item name, with _ as a one-character wildcard and * as an any-length wildcard.",
  parameters: {
    type: 'object',
    properties: {
      itemName: {
        type: 'string',
        description: "Exact item name to retrieve, optionally using _ for one character and * for any-length wildcard matches.",
      },
    },
    required: ['itemName'],
  },
};

const STANDARD_ASSISTANT_TOOLS: AssistantToolDefinition[] = [
  proposeEditTool,
  navigateToTool,
  moveCursorTool,
  createItemTool,
  deleteItemTool,
  moveItemTool,
  lsTool,
  runTerminalCommandTool,
  codinGetTool,
  docsGetTool,
  docsFindTool,
];

const CHAIN_OF_THOUGHT_ASSISTANT_TOOLS: AssistantToolDefinition[] = [
  proposeEditTool,
  navigateToTool,
  moveCursorTool,
  createItemTool,
  deleteItemTool,
  moveItemTool,
  lsTool,
  runTerminalCommandTool,
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
  pipInstallTool,
  pipUpgradeTool,
  pipUninstallTool,
  pipIncludeTool,
  pipListTool,
  npmInstallTool,
  npmIncludeTool,
  npmUninstallTool,
  npmListTool,
  nugetIncludeTool,
  nugetListTool,
  codinGetTool,
  docsGetTool,
  docsFindTool,
];

// Utility for tailwind classes
function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

interface SavedPipPackage { name: string; version: string; }
interface SavedJavaScriptModule { name: string; url: string; }
interface JavaScriptModuleIncludeResolution {
  name: string;
  url: string;
  provider: string;
}
interface JavaScriptModuleIncludeProvider {
  id: string;
  label: string;
  resolve: (moduleName: string) => Promise<string | null>;
}
interface SavedNpmInstalledPackage {
  name: string;
  version: string;
  spec: string;
  entry: string;
  fileCount: number;
  dependencyCount: number;
  installedAt: number;
}
interface StoredNpmPackage extends SavedNpmInstalledPackage {
  packageKey: string;
  packageJson: Record<string, any>;
  files: Record<string, string>;
}
interface ParsedNpmPackageSpec {
  name: string;
  range: string;
  raw: string;
}
interface NpmInstallResult {
  installed: SavedNpmInstalledPackage[];
  skipped: string[];
}
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

interface SerializedUserFolder {
  [name: string]: string | SerializedArrayBuffer | SerializedUserFolder;
}

interface SerializedArrayBuffer {
  __codecraftType: 'ArrayBuffer';
  base64: string;
}

interface SerializedCachedPyodideSiteFile {
  relativePath: string;
  dataBase64: string;
}

interface SerializedCachedPyodidePackageMeta {
  version: string;
  source: PyodidePackageInstallSource;
  stubs: SerializedUserFolder;
}

interface SerializedCachedPyodideEnvironmentSnapshot {
  signature: string;
  files: SerializedCachedPyodideSiteFile[];
  packages: Record<string, SerializedCachedPyodidePackageMeta>;
}

interface CodeCraftUserDataExport {
  format: 'codecraft-user-data';
  version: 1;
  exportedAt: string;
  localStorage: Record<string, string>;
  indexedDB: {
    files?: FSItem[];
    npmPackages: StoredNpmPackage[];
    pyodidePackageMeta: Record<string, SerializedCachedPyodidePackageMeta>;
    pyodidePackageSnapshot: SerializedCachedPyodideEnvironmentSnapshot | null;
    gitState: GitRepositoryState;
  };
  browserBoundData: {
    fileSystemSyncHandlesExported: false;
  };
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
    const raw = JSON.parse(localStorage.getItem(getProjectStorageKey(STORAGE_KEYS.pipPackages)) || '[]');
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
  localStorage.setItem(getProjectStorageKey(STORAGE_KEYS.pipPackages), JSON.stringify(sortSavedPipPackages(pkgs)));
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

function bytesToBase64(bytes: Uint8Array) {
  let binary = '';
  const chunkSize = 0x8000;
  for (let offset = 0; offset < bytes.length; offset += chunkSize) {
    const chunk = bytes.subarray(offset, offset + chunkSize);
    binary += String.fromCharCode(...chunk);
  }
  return btoa(binary);
}

function base64ToBytes(base64: string) {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }
  return bytes;
}

function serializeUserFolder(folder: UserFolder): SerializedUserFolder {
  const serialized: SerializedUserFolder = {};
  for (const [name, value] of Object.entries(folder)) {
    if (typeof value === 'string') {
      serialized[name] = value;
      continue;
    }
    if (value instanceof ArrayBuffer) {
      serialized[name] = {
        __codecraftType: 'ArrayBuffer',
        base64: bytesToBase64(new Uint8Array(value)),
      };
      continue;
    }
    serialized[name] = serializeUserFolder(value);
  }
  return serialized;
}

function deserializeUserFolder(folder: unknown): UserFolder {
  if (!folder || typeof folder !== 'object' || Array.isArray(folder)) return {};

  const restored: UserFolder = {};
  for (const [name, value] of Object.entries(folder as Record<string, unknown>)) {
    if (typeof value === 'string') {
      restored[name] = value;
      continue;
    }
    if (
      value
      && typeof value === 'object'
      && !Array.isArray(value)
      && (value as SerializedArrayBuffer).__codecraftType === 'ArrayBuffer'
      && typeof (value as SerializedArrayBuffer).base64 === 'string'
    ) {
      const bytes = base64ToBytes((value as SerializedArrayBuffer).base64);
      restored[name] = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength);
      continue;
    }
    restored[name] = deserializeUserFolder(value);
  }
  return restored;
}

function serializeCachedPyodidePackageMetaRecord(
  cache: Record<string, CachedPyodidePackageMeta>
): Record<string, SerializedCachedPyodidePackageMeta> {
  const serialized: Record<string, SerializedCachedPyodidePackageMeta> = {};
  for (const [pkgName, meta] of Object.entries(cache)) {
    serialized[pkgName] = {
      version: meta.version,
      source: meta.source,
      stubs: serializeUserFolder(meta.stubs),
    };
  }
  return serialized;
}

function deserializeCachedPyodidePackageMetaRecord(
  cache: unknown
): Record<string, CachedPyodidePackageMeta> {
  if (!cache || typeof cache !== 'object' || Array.isArray(cache)) return {};

  const restored: Record<string, CachedPyodidePackageMeta> = {};
  for (const [pkgName, value] of Object.entries(cache as Record<string, unknown>)) {
    if (!value || typeof value !== 'object' || Array.isArray(value)) continue;
    const meta = value as Partial<SerializedCachedPyodidePackageMeta>;
    if (typeof meta.version !== 'string' || typeof meta.source !== 'string') continue;
    restored[pkgName] = {
      version: meta.version,
      source: meta.source as PyodidePackageInstallSource,
      stubs: deserializeUserFolder(meta.stubs),
    };
  }
  return restored;
}

function serializeCachedPyodideEnvironmentSnapshot(
  snapshot: CachedPyodideEnvironmentSnapshot | null
): SerializedCachedPyodideEnvironmentSnapshot | null {
  if (!snapshot) return null;
  return {
    signature: snapshot.signature,
    files: snapshot.files.map(file => ({
      relativePath: file.relativePath,
      dataBase64: bytesToBase64(file.data),
    })),
    packages: serializeCachedPyodidePackageMetaRecord(snapshot.packages),
  };
}

function deserializeCachedPyodideEnvironmentSnapshot(
  snapshot: unknown
): CachedPyodideEnvironmentSnapshot | null {
  if (!snapshot || typeof snapshot !== 'object' || Array.isArray(snapshot)) return null;
  const raw = snapshot as Partial<SerializedCachedPyodideEnvironmentSnapshot>;
  if (typeof raw.signature !== 'string' || !Array.isArray(raw.files)) return null;

  const files = raw.files
    .filter((file): file is SerializedCachedPyodideSiteFile => (
      !!file
      && typeof file.relativePath === 'string'
      && typeof file.dataBase64 === 'string'
    ))
    .map(file => ({
      relativePath: file.relativePath,
      data: base64ToBytes(file.dataBase64),
    }));

  return {
    signature: raw.signature,
    files,
    packages: deserializeCachedPyodidePackageMetaRecord(raw.packages),
  };
}

function getPyodidePackageMetaKey(projectId = getActiveProjectId()) {
  return getProjectDbKey(PYTHON_CACHE_PACKAGE_META_KEY, projectId);
}

function getPyodidePackageSnapshotKey(projectId = getActiveProjectId()) {
  return getProjectDbKey(PYTHON_CACHE_PACKAGE_SNAPSHOT_KEY, projectId);
}

async function loadPersistedPyodidePackageMetaCache(projectId = getActiveProjectId()): Promise<Record<string, CachedPyodidePackageMeta>> {
  try {
    const db = await openPythonCacheDB();
    return await new Promise((resolve, reject) => {
      const tx = db.transaction(PYTHON_CACHE_STORE_NAME, 'readonly');
      const store = tx.objectStore(PYTHON_CACHE_STORE_NAME);
      const req = store.get(getPyodidePackageMetaKey(projectId));
      const fallbackReq = projectId === DEFAULT_PROJECT_ID ? store.get(PYTHON_CACHE_PACKAGE_META_KEY) : null;
      tx.oncomplete = () => {
        const raw = req.result || fallbackReq?.result;
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
      if (fallbackReq) fallbackReq.onerror = () => reject(fallbackReq.error);
    });
  } catch {
    return {};
  }
}

async function savePersistedPyodidePackageMetaCache(cache: Record<string, CachedPyodidePackageMeta>, projectId = getActiveProjectId()) {
  const db = await openPythonCacheDB();
  const snapshot = cloneCachedPyodidePackageMetaRecord(cache);
  return new Promise<void>((resolve, reject) => {
    const tx = db.transaction(PYTHON_CACHE_STORE_NAME, 'readwrite');
    tx.objectStore(PYTHON_CACHE_STORE_NAME).put(snapshot, getPyodidePackageMetaKey(projectId));
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

async function loadPersistedPyodidePackageSnapshot(projectId = getActiveProjectId()): Promise<CachedPyodideEnvironmentSnapshot | null> {
  try {
    const db = await openPythonCacheDB();
    return await new Promise((resolve, reject) => {
      const tx = db.transaction(PYTHON_CACHE_STORE_NAME, 'readonly');
      const store = tx.objectStore(PYTHON_CACHE_STORE_NAME);
      const req = store.get(getPyodidePackageSnapshotKey(projectId));
      const fallbackReq = projectId === DEFAULT_PROJECT_ID ? store.get(PYTHON_CACHE_PACKAGE_SNAPSHOT_KEY) : null;
      tx.oncomplete = () => {
        const raw = req.result || fallbackReq?.result;
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
      if (fallbackReq) fallbackReq.onerror = () => reject(fallbackReq.error);
    });
  } catch {
    return null;
  }
}

async function savePersistedPyodidePackageSnapshot(snapshot: CachedPyodideEnvironmentSnapshot | null, projectId = getActiveProjectId()) {
  const db = await openPythonCacheDB();
  const clonedSnapshot = cloneCachedPyodideEnvironmentSnapshot(snapshot);
  return new Promise<void>((resolve, reject) => {
    const tx = db.transaction(PYTHON_CACHE_STORE_NAME, 'readwrite');
    const store = tx.objectStore(PYTHON_CACHE_STORE_NAME);
    if (clonedSnapshot) {
      store.put(clonedSnapshot, getPyodidePackageSnapshotKey(projectId));
    } else {
      store.delete(getPyodidePackageSnapshotKey(projectId));
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
    const raw = JSON.parse(localStorage.getItem(getProjectStorageKey(STORAGE_KEYS.pipIncludedModules)) || '[]');
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
  localStorage.setItem(getProjectStorageKey(STORAGE_KEYS.pipIncludedModules), JSON.stringify(
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

function normalizeJavaScriptModuleName(moduleName: string) {
  return moduleName.trim();
}

function isValidJavaScriptModuleName(moduleName: string) {
  const normalized = normalizeJavaScriptModuleName(moduleName);
  return (
    normalized.length > 0
    && !normalized.startsWith('.')
    && !normalized.startsWith('/')
    && !isExternalProjectResourceSpecifier(normalized)
  );
}

const GOOGLE_HOSTED_LIBRARY_CANDIDATES: Record<string, Array<{ library: string; version: string; file: string }>> = {
  angular: [{ library: 'angularjs', version: '1.8.3', file: 'angular.min.js' }],
  angularjs: [{ library: 'angularjs', version: '1.8.3', file: 'angular.min.js' }],
  dojo: [{ library: 'dojo', version: '1.13.0', file: 'dojo/dojo.js' }],
  extcore: [{ library: 'ext-core', version: '3.1.0', file: 'ext-core.js' }],
  'ext-core': [{ library: 'ext-core', version: '3.1.0', file: 'ext-core.js' }],
  jquery: [{ library: 'jquery', version: '3.7.1', file: 'jquery.min.js' }],
  jqueryui: [{ library: 'jqueryui', version: '1.13.3', file: 'jquery-ui.min.js' }],
  'jquery-ui': [{ library: 'jqueryui', version: '1.13.3', file: 'jquery-ui.min.js' }],
  mootools: [{ library: 'mootools', version: '1.6.0', file: 'mootools.min.js' }],
  prototype: [{ library: 'prototype', version: '1.7.3.0', file: 'prototype.js' }],
  scriptaculous: [{ library: 'scriptaculous', version: '1.9.0', file: 'scriptaculous.js' }],
  swfobject: [{ library: 'swfobject', version: '2.2', file: 'swfobject.js' }],
  webfont: [{ library: 'webfont', version: '1.6.26', file: 'webfont.js' }],
};

const JAVASCRIPT_MODULE_INCLUDE_PROVIDERS: JavaScriptModuleIncludeProvider[] = [
  { id: 'cdnjs', label: 'cdnjs', resolve: resolveCdnjsModuleUrl },
  { id: 'jsdelivr', label: 'jsDelivr', resolve: resolveJsDelivrModuleUrl },
  { id: 'google-hosted-libraries', label: 'Google Hosted Libraries', resolve: resolveGoogleHostedLibraryUrl },
  { id: 'unpkg', label: 'unpkg', resolve: resolveUnpkgModuleUrl },
  { id: 'esm.sh', label: 'esm.sh', resolve: resolveEsmShModuleUrl },
];

function getDefaultJavaScriptModuleUrl(moduleName: string) {
  const encodedName = normalizeJavaScriptModuleName(moduleName)
    .split('/')
    .map(part => encodeURIComponent(part))
    .join('/');
  return `https://esm.sh/${encodedName}`;
}

function normalizeJavaScriptModuleUrl(moduleName: string, url?: string) {
  const rawUrl = (url || '').trim();
  return rawUrl || getDefaultJavaScriptModuleUrl(moduleName);
}

function encodeJavaScriptModuleSpecifierForCdn(moduleName: string) {
  return normalizeJavaScriptModuleName(moduleName)
    .split('/')
    .map(part => encodeURIComponent(part))
    .join('/');
}

function getCdnjsLibraryUrl(libraryName: string, version: string, filename: string) {
  const encodedLibrary = encodeURIComponent(libraryName);
  const encodedVersion = encodeURIComponent(version);
  const encodedFile = filename.split('/').map(part => encodeURIComponent(part)).join('/');
  return `https://cdnjs.cloudflare.com/ajax/libs/${encodedLibrary}/${encodedVersion}/${encodedFile}`;
}

function isCdnjsEsmFile(filename: string) {
  const normalized = filename.toLowerCase();
  return (
    normalized.endsWith('.mjs')
    || normalized.endsWith('.esm.js')
    || normalized.endsWith('.esm.min.js')
    || normalized.endsWith('.es.js')
    || normalized.endsWith('.es.min.js')
    || normalized.endsWith('.module.js')
    || normalized.endsWith('.module.min.js')
    || normalized.endsWith('.legacy-esm.js')
    || normalized.endsWith('.legacy-esm.min.js')
  );
}

function getCdnjsPreferredEsmFile(libraryInfo: any) {
  const assets = Array.isArray(libraryInfo?.assets) ? libraryInfo.assets : [];
  const latestAsset = assets.find((asset: any) => asset?.version === libraryInfo?.version) || assets[0];
  const files = Array.isArray(latestAsset?.files)
    ? latestAsset.files.filter((file: unknown): file is string => typeof file === 'string')
    : [];
  if (typeof libraryInfo?.filename === 'string' && isCdnjsEsmFile(libraryInfo.filename)) {
    return libraryInfo.filename;
  }
  return files.find(isCdnjsEsmFile) || null;
}

async function fetchWithNpmIncludeTimeout(url: string, init: RequestInit = {}) {
  const controller = new AbortController();
  const timeoutId = window.setTimeout(() => controller.abort(), NPM_INCLUDE_FETCH_TIMEOUT_MS);
  try {
    return await fetch(url, { ...init, signal: controller.signal });
  } finally {
    window.clearTimeout(timeoutId);
  }
}

async function isReachableJavaScriptModuleUrl(url: string) {
  try {
    const headResponse = await fetchWithNpmIncludeTimeout(url, { method: 'HEAD', cache: 'no-store' });
    if (headResponse.ok) return true;
    if (headResponse.status !== 403 && headResponse.status !== 405) return false;
  } catch {
    // Some CDNs do not allow HEAD from every edge. Fall through to GET.
  }

  try {
    const getResponse = await fetchWithNpmIncludeTimeout(url, { method: 'GET', cache: 'no-store' });
    return getResponse.ok;
  } catch {
    return false;
  }
}

async function fetchCdnjsLibraryInfo(libraryName: string) {
  const response = await fetchWithNpmIncludeTimeout(
    `https://api.cdnjs.com/libraries/${encodeURIComponent(libraryName)}?fields=name,filename,version,assets`,
    { cache: 'no-store' }
  );
  if (!response.ok) return null;
  const data = await response.json();
  return data?.error ? null : data;
}

async function findCdnjsLibraryName(moduleName: string) {
  const exact = await fetchCdnjsLibraryInfo(moduleName);
  if (exact?.name) return exact.name;

  const response = await fetchWithNpmIncludeTimeout(
    `https://api.cdnjs.com/libraries?search=${encodeURIComponent(moduleName)}&fields=name,filename,version`,
    { cache: 'no-store' }
  );
  if (!response.ok) return null;
  const data = await response.json();
  const results = Array.isArray(data?.results) ? data.results : [];
  const exactResult = results.find((result: any) => (
    typeof result?.name === 'string'
    && (result.name === moduleName || result.name === `${moduleName}.js`)
  ));
  return exactResult?.name || null;
}

async function resolveCdnjsModuleUrl(moduleName: string) {
  if (moduleName.includes('/')) return null;

  const libraryName = await findCdnjsLibraryName(moduleName);
  if (!libraryName) return null;

  const libraryInfo = await fetchCdnjsLibraryInfo(libraryName);
  const version = typeof libraryInfo?.version === 'string' ? libraryInfo.version : '';
  const filename = getCdnjsPreferredEsmFile(libraryInfo);
  if (!version || !filename) return null;

  const url = getCdnjsLibraryUrl(libraryName, version, filename);
  return await isReachableJavaScriptModuleUrl(url) ? url : null;
}

async function resolveJsDelivrModuleUrl(moduleName: string) {
  const url = `https://cdn.jsdelivr.net/npm/${encodeJavaScriptModuleSpecifierForCdn(moduleName)}/+esm`;
  return await isReachableJavaScriptModuleUrl(url) ? url : null;
}

async function resolveGoogleHostedLibraryUrl(moduleName: string) {
  const normalized = moduleName.toLowerCase();
  if (normalized.includes('/')) return null;

  const candidates = GOOGLE_HOSTED_LIBRARY_CANDIDATES[normalized] || [];
  for (const candidate of candidates) {
    const url = `https://ajax.googleapis.com/ajax/libs/${candidate.library}/${candidate.version}/${candidate.file}`;
    if (await isReachableJavaScriptModuleUrl(url)) return url;
  }
  return null;
}

async function resolveUnpkgModuleUrl(moduleName: string) {
  const url = `https://unpkg.com/${encodeJavaScriptModuleSpecifierForCdn(moduleName)}?module`;
  return await isReachableJavaScriptModuleUrl(url) ? url : null;
}

async function resolveEsmShModuleUrl(moduleName: string) {
  const url = `https://esm.sh/${encodeJavaScriptModuleSpecifierForCdn(moduleName)}`;
  return await isReachableJavaScriptModuleUrl(url) ? url : null;
}

function getJavaScriptModuleNameFromNpmInstallSpec(packageSpec: string) {
  const normalized = normalizeJavaScriptModuleName(packageSpec);
  if (!normalized) return '';

  if (normalized.startsWith('@')) {
    const scopeSlashIndex = normalized.indexOf('/');
    if (scopeSlashIndex <= 1 || scopeSlashIndex === normalized.length - 1) {
      return normalized;
    }
    const versionAtIndex = normalized.indexOf('@', scopeSlashIndex + 1);
    return versionAtIndex === -1 ? normalized : normalized.slice(0, versionAtIndex);
  }

  const versionAtIndex = normalized.indexOf('@');
  return versionAtIndex === -1 ? normalized : normalized.slice(0, versionAtIndex);
}

function isValidNpmPackageInstallSpec(packageSpec: string) {
  const normalized = normalizeJavaScriptModuleName(packageSpec);
  if (
    !normalized
    || normalized.startsWith('.')
    || normalized.startsWith('/')
    || isExternalProjectResourceSpecifier(normalized)
    || /\s/.test(normalized)
  ) {
    return false;
  }

  const scopeSlashIndex = normalized.startsWith('@') ? normalized.indexOf('/') : -1;
  if (normalized.startsWith('@') && (scopeSlashIndex <= 1 || scopeSlashIndex === normalized.length - 1)) {
    return false;
  }

  const moduleName = getJavaScriptModuleNameFromNpmInstallSpec(normalized);
  if (!isValidJavaScriptModuleName(moduleName)) return false;
  if (!moduleName.startsWith('@') && moduleName.includes('/')) return false;
  if (moduleName.startsWith('@') && moduleName.slice(1).split('/').length !== 2) return false;

  const versionAtIndex = normalized.startsWith('@')
    ? normalized.indexOf('@', scopeSlashIndex + 1)
    : normalized.indexOf('@');
  return versionAtIndex === -1 || versionAtIndex < normalized.length - 1;
}

function sortSavedJavaScriptModules(modules: SavedJavaScriptModule[]) {
  return [...modules].sort((left, right) => left.name.localeCompare(right.name));
}

function loadSavedJavaScriptIncludedModules(): SavedJavaScriptModule[] {
  try {
    const raw = JSON.parse(localStorage.getItem(getProjectStorageKey(STORAGE_KEYS.javascriptIncludedModules)) || '[]');
    if (!Array.isArray(raw)) return [];

    const deduped = new Map<string, SavedJavaScriptModule>();
    for (const value of raw) {
      if (!value) continue;

      if (typeof value === 'string') {
        const name = normalizeJavaScriptModuleName(value);
        if (isValidJavaScriptModuleName(name)) {
          deduped.set(name, { name, url: getDefaultJavaScriptModuleUrl(name) });
        }
        continue;
      }

      if (typeof value.name !== 'string') continue;
      const name = normalizeJavaScriptModuleName(value.name);
      if (!isValidJavaScriptModuleName(name)) continue;

      const url = typeof value.url === 'string'
        ? normalizeJavaScriptModuleUrl(name, value.url)
        : getDefaultJavaScriptModuleUrl(name);
      deduped.set(name, { name, url });
    }

    return sortSavedJavaScriptModules([...deduped.values()]);
  } catch {
    return [];
  }
}

function saveJavaScriptIncludedModules(modules: SavedJavaScriptModule[]) {
  localStorage.setItem(getProjectStorageKey(STORAGE_KEYS.javascriptIncludedModules), JSON.stringify(
    sortSavedJavaScriptModules(
      modules
        .map(moduleInfo => {
          const name = normalizeJavaScriptModuleName(moduleInfo.name);
          if (!isValidJavaScriptModuleName(name)) return null;
          return {
            name,
            url: normalizeJavaScriptModuleUrl(name, moduleInfo.url),
          };
        })
        .filter((moduleInfo): moduleInfo is SavedJavaScriptModule => moduleInfo !== null)
    )
  ));
}

function addSavedJavaScriptIncludedModule(moduleName: string, url?: string) {
  const name = normalizeJavaScriptModuleName(moduleName);
  if (!isValidJavaScriptModuleName(name)) return null;

  const nextModule = {
    name,
    url: normalizeJavaScriptModuleUrl(name, url),
  };
  const current = loadSavedJavaScriptIncludedModules()
    .filter(moduleInfo => moduleInfo.name !== name);
  current.push(nextModule);
  saveJavaScriptIncludedModules(current);
  return nextModule;
}

async function includeJavaScriptModuleFromProviders(
  moduleName: string,
  url?: string,
  onStatus: (message: string) => void = () => { }
): Promise<JavaScriptModuleIncludeResolution | null> {
  const name = normalizeJavaScriptModuleName(moduleName);
  if (!isValidJavaScriptModuleName(name)) return null;

  const explicitUrl = (url || '').trim();
  if (explicitUrl) {
    const moduleInfo = addSavedJavaScriptIncludedModule(name, explicitUrl);
    return moduleInfo ? { ...moduleInfo, provider: 'custom URL' } : null;
  }

  const triedProviders: string[] = [];
  for (const provider of JAVASCRIPT_MODULE_INCLUDE_PROVIDERS) {
    triedProviders.push(provider.label);
    onStatus(`npm include: checking ${provider.label} for '${name}'...`);
    try {
      const resolvedUrl = await provider.resolve(name);
      if (!resolvedUrl) continue;

      const moduleInfo = addSavedJavaScriptIncludedModule(name, resolvedUrl);
      if (!moduleInfo) return null;
      return { ...moduleInfo, provider: provider.label };
    } catch (err) {
      onStatus(`npm include: ${provider.label} check failed: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  onStatus(`npm include: '${name}' was not found on ${triedProviders.join(', ')}.`);
  return null;
}

function removeSavedJavaScriptIncludedModule(moduleName: string) {
  const name = normalizeJavaScriptModuleName(moduleName);
  const current = loadSavedJavaScriptIncludedModules();
  const next = current.filter(moduleInfo => moduleInfo.name !== name);
  saveJavaScriptIncludedModules(next);
  return next.length !== current.length;
}

function getStoredNpmPackageKey(name: string, version: string) {
  return `${name}@${version}`;
}

function getStoredNpmPackageStorageKey(name: string, version: string, projectId = getActiveProjectId()) {
  return getProjectDbKey(getStoredNpmPackageKey(name, version), projectId);
}

function normalizeSavedNpmInstalledPackage(value: any): SavedNpmInstalledPackage | null {
  if (!value || typeof value.name !== 'string' || typeof value.version !== 'string') return null;
  const name = getJavaScriptModuleNameFromNpmInstallSpec(value.name);
  const version = value.version.trim();
  if (!isValidNpmPackageInstallSpec(name) || !version) return null;
  return {
    name,
    version,
    spec: typeof value.spec === 'string' && value.spec.trim() ? value.spec.trim() : `${name}@${version}`,
    entry: typeof value.entry === 'string' && value.entry.trim() ? normalizeProjectPath(value.entry) : 'index.js',
    fileCount: Number.isFinite(value.fileCount) ? Math.max(0, Math.floor(value.fileCount)) : 0,
    dependencyCount: Number.isFinite(value.dependencyCount) ? Math.max(0, Math.floor(value.dependencyCount)) : 0,
    installedAt: Number.isFinite(value.installedAt) ? value.installedAt : Date.now(),
  };
}

function sortSavedNpmInstalledPackages(packages: SavedNpmInstalledPackage[]) {
  return [...packages].sort((left, right) => left.name.localeCompare(right.name));
}

function loadSavedNpmInstalledPackages(): SavedNpmInstalledPackage[] {
  try {
    const raw = JSON.parse(localStorage.getItem(getProjectStorageKey(STORAGE_KEYS.npmPackages)) || '[]');
    if (!Array.isArray(raw)) return [];
    const deduped = new Map<string, SavedNpmInstalledPackage>();
    for (const value of raw) {
      const normalized = normalizeSavedNpmInstalledPackage(value);
      if (normalized) deduped.set(normalized.name, normalized);
    }
    return sortSavedNpmInstalledPackages([...deduped.values()]);
  } catch {
    return [];
  }
}

function saveNpmInstalledPackages(packages: SavedNpmInstalledPackage[]) {
  const deduped = new Map<string, SavedNpmInstalledPackage>();
  for (const packageInfo of packages) {
    const normalized = normalizeSavedNpmInstalledPackage(packageInfo);
    if (normalized) deduped.set(normalized.name, normalized);
  }
  localStorage.setItem(getProjectStorageKey(STORAGE_KEYS.npmPackages), JSON.stringify(sortSavedNpmInstalledPackages([...deduped.values()])));
}

function upsertSavedNpmInstalledPackage(packageInfo: SavedNpmInstalledPackage) {
  const next = loadSavedNpmInstalledPackages().filter(existing => existing.name !== packageInfo.name);
  next.push(packageInfo);
  saveNpmInstalledPackages(next);
}

function removeSavedNpmInstalledPackage(packageName: string) {
  const name = getJavaScriptModuleNameFromNpmInstallSpec(packageName);
  const current = loadSavedNpmInstalledPackages();
  const removed = current.find(packageInfo => packageInfo.name === name) || null;
  if (!removed) return null;
  saveNpmInstalledPackages(current.filter(packageInfo => packageInfo.name !== name));
  return removed;
}

async function putStoredNpmPackage(packageInfo: StoredNpmPackage) {
  const db = await openNpmPackageDB();
  return new Promise<void>((resolve, reject) => {
    const tx = db.transaction(NPM_PACKAGE_STORE_NAME, 'readwrite');
    tx.objectStore(NPM_PACKAGE_STORE_NAME).put(packageInfo, getStoredNpmPackageStorageKey(packageInfo.name, packageInfo.version));
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

async function loadStoredNpmPackage(name: string, version: string): Promise<StoredNpmPackage | null> {
  const db = await openNpmPackageDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(NPM_PACKAGE_STORE_NAME, 'readonly');
    const store = tx.objectStore(NPM_PACKAGE_STORE_NAME);
    const req = store.get(getStoredNpmPackageStorageKey(name, version));
    const fallbackReq = getActiveProjectId() === DEFAULT_PROJECT_ID ? store.get(getStoredNpmPackageKey(name, version)) : null;
    tx.oncomplete = () => resolve(normalizeStoredNpmPackage(req.result || fallbackReq?.result));
    req.onerror = () => reject(req.error);
    if (fallbackReq) fallbackReq.onerror = () => reject(fallbackReq.error);
  });
}

async function deleteStoredNpmPackage(name: string, version: string) {
  const db = await openNpmPackageDB();
  return new Promise<void>((resolve, reject) => {
    const tx = db.transaction(NPM_PACKAGE_STORE_NAME, 'readwrite');
    const store = tx.objectStore(NPM_PACKAGE_STORE_NAME);
    store.delete(getStoredNpmPackageStorageKey(name, version));
    if (getActiveProjectId() === DEFAULT_PROJECT_ID) store.delete(getStoredNpmPackageKey(name, version));
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

function normalizeStoredNpmPackage(value: unknown): StoredNpmPackage | null {
  const normalized = normalizeSavedNpmInstalledPackage(value);
  if (!normalized || !value || typeof value !== 'object') return null;

  const raw = value as Partial<StoredNpmPackage>;
  const files: Record<string, string> = {};
  if (raw.files && typeof raw.files === 'object' && !Array.isArray(raw.files)) {
    for (const [path, source] of Object.entries(raw.files)) {
      if (typeof source === 'string') files[path] = source;
    }
  }

  return {
    ...normalized,
    packageKey: typeof raw.packageKey === 'string'
      ? raw.packageKey
      : getStoredNpmPackageKey(normalized.name, normalized.version),
    packageJson: raw.packageJson && typeof raw.packageJson === 'object' && !Array.isArray(raw.packageJson)
      ? raw.packageJson as Record<string, any>
      : {},
    files,
  };
}

async function loadAllStoredNpmPackages(projectId = getActiveProjectId()): Promise<StoredNpmPackage[]> {
  const db = await openNpmPackageDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(NPM_PACKAGE_STORE_NAME, 'readonly');
    const req = tx.objectStore(NPM_PACKAGE_STORE_NAME).openCursor();
    const packages: StoredNpmPackage[] = [];
    req.onsuccess = () => {
      const cursor = req.result;
      if (!cursor) {
        resolve(packages);
        return;
      }
      const key = cursor.key;
      if (isProjectDbKeyForCurrentProject(key, projectId) || projectId === DEFAULT_PROJECT_ID && typeof key === 'string' && !key.includes('::')) {
        const normalized = normalizeStoredNpmPackage(cursor.value);
        if (normalized) packages.push(normalized);
      }
      cursor.continue();
    };
    req.onerror = () => reject(req.error);
  });
}

async function replaceAllStoredNpmPackages(packages: unknown[], projectId = getActiveProjectId()) {
  const db = await openNpmPackageDB();
  const normalizedPackages = packages
    .map(normalizeStoredNpmPackage)
    .filter((packageInfo): packageInfo is StoredNpmPackage => packageInfo !== null);

  return new Promise<void>((resolve, reject) => {
    const tx = db.transaction(NPM_PACKAGE_STORE_NAME, 'readwrite');
    const store = tx.objectStore(NPM_PACKAGE_STORE_NAME);
    const req = store.openCursor();
    req.onsuccess = () => {
      const cursor = req.result;
      if (!cursor) {
        for (const packageInfo of normalizedPackages) {
          store.put(packageInfo, getStoredNpmPackageStorageKey(packageInfo.name, packageInfo.version, projectId));
        }
        return;
      }
      const key = cursor.key;
      if (isProjectDbKeyForCurrentProject(key, projectId) || projectId === DEFAULT_PROJECT_ID && typeof key === 'string' && !key.includes('::')) {
        cursor.delete();
      }
      cursor.continue();
    };
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

async function clearStoredSyncHandles(projectId = getActiveProjectId()) {
  const db = await openSyncDB();
  return new Promise<void>((resolve, reject) => {
    const tx = db.transaction(SYNC_STORE_NAME, 'readwrite');
    const store = tx.objectStore(SYNC_STORE_NAME);
    const req = store.openCursor();
    req.onsuccess = () => {
      const cursor = req.result;
      if (!cursor) return;
      const key = cursor.key;
      if (isProjectDbKeyForCurrentProject(key, projectId) || projectId === DEFAULT_PROJECT_ID && typeof key === 'string' && !key.includes('::')) {
        cursor.delete();
      }
      cursor.continue();
    };
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

function normalizeStoredProjectFiles(raw: unknown): FSItem[] | null {
  if (!Array.isArray(raw)) return null;
  return raw.map((file: FSItem) => (
    file?.type === 'file' && file.name
      ? { ...file, language: langFromFilename(file.name) }
      : file
  ));
}

function parseStoredProjectFilesValue(value: string | null): FSItem[] | null {
  if (value == null) return null;
  try {
    return normalizeStoredProjectFiles(JSON.parse(value));
  } catch {
    return null;
  }
}

function loadLegacySavedProjectFiles(projectId = getActiveProjectId()): FSItem[] | null {
  for (const key of getLegacyProjectStorageKeys(STORAGE_KEYS.files, projectId)) {
    const parsed = parseStoredProjectFilesValue(localStorage.getItem(key));
    if (parsed) return parsed;
  }
  return null;
}

function loadInitialProjectFiles(projectId = getActiveProjectId()) {
  return loadLegacySavedProjectFiles(projectId) || INITIAL_FILES;
}

async function loadStoredProjectFiles(projectId = getActiveProjectId()): Promise<FSItem[] | null> {
  try {
    const db = await openProjectDataDB();
    const stored = await new Promise<unknown>((resolve, reject) => {
      const tx = db.transaction(PROJECT_DATA_STORE_NAME, 'readonly');
      const req = tx.objectStore(PROJECT_DATA_STORE_NAME).get(getProjectDbKey(STORAGE_KEYS.files, projectId));
      tx.oncomplete = () => resolve(req.result);
      tx.onerror = () => reject(tx.error);
      req.onerror = () => reject(req.error);
    });
    const normalized = normalizeStoredProjectFiles(stored);
    if (normalized) {
      removeLegacyProjectStorageValue(STORAGE_KEYS.files, projectId);
      return normalized;
    }
  } catch {
    return loadLegacySavedProjectFiles(projectId);
  }

  const legacy = loadLegacySavedProjectFiles(projectId);
  if (legacy) {
    await saveStoredProjectFiles(legacy, projectId);
    return legacy;
  }

  return null;
}

async function saveStoredProjectFiles(files: FSItem[], projectId = getActiveProjectId()) {
  const db = await openProjectDataDB();
  const snapshot = normalizeStoredProjectFiles(files) || [];
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(PROJECT_DATA_STORE_NAME, 'readwrite');
    tx.objectStore(PROJECT_DATA_STORE_NAME).put(snapshot, getProjectDbKey(STORAGE_KEYS.files, projectId));
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
  removeLegacyProjectStorageValue(STORAGE_KEYS.files, projectId);
}

async function deleteStoredProjectFiles(projectId = getActiveProjectId()) {
  try {
    const db = await openProjectDataDB();
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(PROJECT_DATA_STORE_NAME, 'readwrite');
      tx.objectStore(PROJECT_DATA_STORE_NAME).delete(getProjectDbKey(STORAGE_KEYS.files, projectId));
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  } finally {
    removeLegacyProjectStorageValue(STORAGE_KEYS.files, projectId);
  }
}

function getCodeCraftLocalStorageSnapshot(projectId = getActiveProjectId()) {
  const snapshot: Record<string, string> = {};
  for (const baseKey of PROJECT_LOCAL_STORAGE_KEYS) {
    const value = localStorage.getItem(getProjectStorageKey(baseKey, projectId));
    if (typeof value === 'string') snapshot[baseKey] = value;
  }
  return snapshot;
}

function replaceCodeCraftLocalStorageSnapshot(snapshot: Record<string, string>, projectId = getActiveProjectId()) {
  for (const baseKey of PROJECT_LOCAL_STORAGE_KEYS) {
    localStorage.removeItem(getProjectStorageKey(baseKey, projectId));
  }
  for (const [key, value] of Object.entries(snapshot)) {
    if (!PROJECT_LOCAL_STORAGE_KEYS.includes(key) || typeof value !== 'string') continue;
    localStorage.setItem(getProjectStorageKey(key, projectId), value);
  }
}

async function deleteCodeCraftProjectData(projectId: string) {
  replaceCodeCraftLocalStorageSnapshot({}, projectId);
  await Promise.all([
    deleteStoredProjectFiles(projectId),
    replaceAllStoredNpmPackages([], projectId),
    savePersistedPyodidePackageMetaCache({}, projectId),
    savePersistedPyodidePackageSnapshot(null, projectId),
    clearStoredSyncHandles(projectId),
    deleteStoredGitState(projectId),
  ]);
}

async function createCodeCraftUserDataExport(
  localStorageOverrides: Record<string, string> = {},
  projectId = getActiveProjectId(),
  gitStateOverride?: GitRepositoryState,
  projectFilesOverride?: FSItem[]
): Promise<CodeCraftUserDataExport> {
  const [
    storedProjectFiles,
    npmPackages,
    pyodidePackageMeta,
    pyodidePackageSnapshot,
    storedGitState,
  ] = await Promise.all([
    projectFilesOverride ? Promise.resolve(projectFilesOverride) : loadStoredProjectFiles(projectId).catch(() => null),
    loadAllStoredNpmPackages(projectId).catch(() => []),
    loadPersistedPyodidePackageMetaCache(projectId).catch(() => ({})),
    loadPersistedPyodidePackageSnapshot(projectId).catch(() => null),
    loadStoredGitState(projectId).catch(() => null),
  ]);

  return {
    format: 'codecraft-user-data',
    version: 1,
    exportedAt: new Date().toISOString(),
    localStorage: {
      ...getCodeCraftLocalStorageSnapshot(projectId),
      ...localStorageOverrides,
    },
    indexedDB: {
      files: normalizeStoredProjectFiles(storedProjectFiles) || [],
      npmPackages,
      pyodidePackageMeta: serializeCachedPyodidePackageMetaRecord(pyodidePackageMeta),
      pyodidePackageSnapshot: serializeCachedPyodideEnvironmentSnapshot(pyodidePackageSnapshot),
      gitState: normalizeGitState(gitStateOverride || storedGitState),
    },
    browserBoundData: {
      fileSystemSyncHandlesExported: false,
    },
  };
}

async function restoreCodeCraftUserDataExport(raw: unknown, projectId = getActiveProjectId()) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    throw new Error('Backup file is not a CodeCraft user data export.');
  }

  const backup = raw as Partial<CodeCraftUserDataExport>;
  if (backup.format !== 'codecraft-user-data' || backup.version !== 1) {
    throw new Error('Backup file is not a supported CodeCraft user data export.');
  }

  const localStorageSnapshot: Record<string, string> = {};
  if (backup.localStorage && typeof backup.localStorage === 'object' && !Array.isArray(backup.localStorage)) {
    for (const [key, value] of Object.entries(backup.localStorage)) {
      if (typeof value === 'string') localStorageSnapshot[key] = value;
    }
  }

  replaceCodeCraftLocalStorageSnapshot(localStorageSnapshot, projectId);

  const indexedDBSnapshot = backup.indexedDB && typeof backup.indexedDB === 'object'
    ? backup.indexedDB
    : null;
  const indexedDBFiles = normalizeStoredProjectFiles(indexedDBSnapshot?.files);
  const legacyLocalStorageFiles = parseStoredProjectFilesValue(localStorageSnapshot[STORAGE_KEYS.files] || null);
  if (indexedDBFiles || legacyLocalStorageFiles) {
    await saveStoredProjectFiles(indexedDBFiles || legacyLocalStorageFiles || [], projectId);
  } else {
    await deleteStoredProjectFiles(projectId);
  }

  let gitStateSnapshot: unknown = indexedDBSnapshot?.gitState;
  if (!gitStateSnapshot && localStorageSnapshot[STORAGE_KEYS.gitState]) {
    try {
      gitStateSnapshot = JSON.parse(localStorageSnapshot[STORAGE_KEYS.gitState]);
    } catch {
      gitStateSnapshot = null;
    }
  }
  await replaceAllStoredNpmPackages(Array.isArray(indexedDBSnapshot?.npmPackages) ? indexedDBSnapshot.npmPackages : [], projectId);
  await savePersistedPyodidePackageMetaCache(deserializeCachedPyodidePackageMetaRecord(indexedDBSnapshot?.pyodidePackageMeta), projectId);
  await savePersistedPyodidePackageSnapshot(deserializeCachedPyodideEnvironmentSnapshot(indexedDBSnapshot?.pyodidePackageSnapshot), projectId);
  await saveStoredGitState(normalizeGitState(gitStateSnapshot), projectId);
  await clearStoredSyncHandles(projectId);
}

function parseNpmPackageInstallSpec(packageSpec: string): ParsedNpmPackageSpec | null {
  const raw = packageSpec.trim();
  if (!raw || raw.startsWith('.') || raw.startsWith('/') || isExternalProjectResourceSpecifier(raw)) {
    return null;
  }

  if (raw.startsWith('@')) {
    const scopeSlashIndex = raw.indexOf('/');
    if (scopeSlashIndex <= 1 || scopeSlashIndex === raw.length - 1) return null;
    const versionAtIndex = raw.indexOf('@', scopeSlashIndex + 1);
    const name = versionAtIndex === -1 ? raw : raw.slice(0, versionAtIndex);
    const range = (versionAtIndex === -1 ? 'latest' : raw.slice(versionAtIndex + 1)).trim();
    return isValidNpmPackageInstallSpec(name) && range ? { name, range, raw } : null;
  }

  const versionAtIndex = raw.indexOf('@');
  const name = versionAtIndex === -1 ? raw : raw.slice(0, versionAtIndex);
  const range = (versionAtIndex === -1 ? 'latest' : raw.slice(versionAtIndex + 1)).trim();
  return isValidNpmPackageInstallSpec(name) && range ? { name, range, raw } : null;
}

function getNpmRegistryPackageUrl(packageName: string) {
  const encoded = packageName.startsWith('@')
    ? `@${packageName.slice(1).replace('/', '%2F')}`
    : encodeURIComponent(packageName);
  return `https://registry.npmjs.org/${encoded}`;
}

function parsePartialSemver(value: string) {
  const match = value.trim().match(/^v?(\d+)(?:\.(\d+|x|\*))?(?:\.(\d+|x|\*))?(?:[-+].*)?$/i);
  if (!match) return null;
  return {
    major: Number(match[1]),
    minor: match[2] == null || /x|\*/i.test(match[2]) ? null : Number(match[2]),
    patch: match[3] == null || /x|\*/i.test(match[3]) ? null : Number(match[3]),
  };
}

function parseFullSemver(value: string) {
  const parsed = parsePartialSemver(value);
  if (!parsed || parsed.minor == null || parsed.patch == null) return null;
  return parsed as { major: number; minor: number; patch: number };
}

function compareSemver(left: { major: number; minor: number; patch: number }, right: { major: number; minor: number; patch: number }) {
  return left.major - right.major || left.minor - right.minor || left.patch - right.patch;
}

function normalizePartialSemver(parsed: { major: number; minor: number | null; patch: number | null }) {
  return {
    major: parsed.major,
    minor: parsed.minor ?? 0,
    patch: parsed.patch ?? 0,
  };
}

function satisfiesNpmComparator(version: { major: number; minor: number; patch: number }, comparator: string) {
  const trimmed = comparator.trim();
  if (!trimmed || trimmed === '*' || trimmed.toLowerCase() === 'latest') return true;

  const operatorMatch = trimmed.match(/^(>=|<=|>|<|=)?\s*(.+)$/);
  if (!operatorMatch) return false;
  const operator = operatorMatch[1] || '=';
  const parsed = parsePartialSemver(operatorMatch[2]);
  if (!parsed) return false;
  const target = normalizePartialSemver(parsed);

  if (operator === '=') {
    if (parsed.minor == null) return version.major === target.major;
    if (parsed.patch == null) return version.major === target.major && version.minor === target.minor;
  }

  const comparison = compareSemver(version, target);
  if (operator === '>=') return comparison >= 0;
  if (operator === '>') return comparison > 0;
  if (operator === '<=') return comparison <= 0;
  if (operator === '<') return comparison < 0;
  return comparison === 0;
}

function satisfiesNpmCaretRange(version: { major: number; minor: number; patch: number }, range: string) {
  const parsed = parsePartialSemver(range.slice(1));
  if (!parsed) return false;
  const lower = normalizePartialSemver(parsed);
  let upper = { major: lower.major + 1, minor: 0, patch: 0 };
  if (lower.major === 0 && parsed.minor != null) {
    upper = parsed.minor === 0
      ? { major: 0, minor: 0, patch: lower.patch + 1 }
      : { major: 0, minor: lower.minor + 1, patch: 0 };
  }
  return compareSemver(version, lower) >= 0 && compareSemver(version, upper) < 0;
}

function satisfiesNpmTildeRange(version: { major: number; minor: number; patch: number }, range: string) {
  const parsed = parsePartialSemver(range.slice(1));
  if (!parsed) return false;
  const lower = normalizePartialSemver(parsed);
  const upper = parsed.minor == null
    ? { major: lower.major + 1, minor: 0, patch: 0 }
    : { major: lower.major, minor: lower.minor + 1, patch: 0 };
  return compareSemver(version, lower) >= 0 && compareSemver(version, upper) < 0;
}

function satisfiesNpmRange(versionString: string, range: string) {
  const version = parseFullSemver(versionString);
  if (!version) return versionString === range;
  const trimmed = (range || 'latest').trim();
  if (!trimmed || trimmed === '*' || trimmed.toLowerCase() === 'latest') return true;

  return trimmed.split('||').some(part => {
    const clause = part.trim();
    if (!clause) return false;
    if (clause.startsWith('^')) return satisfiesNpmCaretRange(version, clause);
    if (clause.startsWith('~')) return satisfiesNpmTildeRange(version, clause);
    return clause.split(/\s+/).every(token => satisfiesNpmComparator(version, token));
  });
}

function resolveNpmRegistryVersion(metadata: any, range: string) {
  const versions = metadata?.versions && typeof metadata.versions === 'object' ? metadata.versions : {};
  const distTags = metadata?.['dist-tags'] && typeof metadata['dist-tags'] === 'object' ? metadata['dist-tags'] : {};
  const requested = (range || 'latest').trim();

  if (typeof distTags[requested] === 'string' && versions[distTags[requested]]) {
    return distTags[requested];
  }
  if (versions[requested]) return requested;

  const matchingVersions = Object.keys(versions)
    .map(version => ({ version, parsed: parseFullSemver(version) }))
    .filter((entry): entry is { version: string; parsed: { major: number; minor: number; patch: number } } => (
      !!entry.parsed && satisfiesNpmRange(entry.version, requested)
    ))
    .sort((left, right) => compareSemver(right.parsed, left.parsed));

  if (matchingVersions[0]) return matchingVersions[0].version;
  if (typeof distTags.latest === 'string' && versions[distTags.latest]) return distTags.latest;
  return '';
}

async function decompressGzipBytes(data: Uint8Array) {
  return decompressBytes(data, 'gzip');
}

function readTarString(data: Uint8Array, offset: number, length: number) {
  let end = offset;
  const limit = offset + length;
  while (end < limit && data[end] !== 0) end += 1;
  return new TextDecoder().decode(data.subarray(offset, end)).trim();
}

function readTarOctal(data: Uint8Array, offset: number, length: number) {
  const raw = readTarString(data, offset, length).replace(/\0/g, '').trim();
  return raw ? parseInt(raw, 8) || 0 : 0;
}

function shouldStoreNpmPackageTextFile(path: string, size: number) {
  if (size > MAX_NPM_PACKAGE_TEXT_FILE_BYTES) return false;
  return (
    path === 'package.json'
    || /\.(?:mjs|js|jsx|cjs|ts|tsx|d\.ts|json|css)$/i.test(path)
  );
}

function parseNpmPackageTarballFiles(tarData: Uint8Array) {
  const files: Record<string, string> = {};
  const decoder = new TextDecoder();
  let offset = 0;
  let totalTextBytes = 0;

  while (offset + 512 <= tarData.length) {
    let empty = true;
    for (let index = offset; index < offset + 512; index += 1) {
      if (tarData[index] !== 0) {
        empty = false;
        break;
      }
    }
    if (empty) break;

    const name = readTarString(tarData, offset, 100);
    const size = readTarOctal(tarData, offset + 124, 12);
    const typeFlag = String.fromCharCode(tarData[offset + 156] || 0);
    const prefix = readTarString(tarData, offset + 345, 155);
    const fullName = normalizeProjectPath(prefix ? `${prefix}/${name}` : name);
    const fileStart = offset + 512;
    const fileEnd = fileStart + size;
    const relativePath = fullName.startsWith('package/')
      ? fullName.slice('package/'.length)
      : fullName;

    if ((typeFlag === '0' || typeFlag === '\0') && relativePath && shouldStoreNpmPackageTextFile(relativePath, size)) {
      totalTextBytes += size;
      if (totalTextBytes > MAX_NPM_PACKAGE_TOTAL_TEXT_BYTES) {
        throw new Error(`npm package text files exceed ${Math.round(MAX_NPM_PACKAGE_TOTAL_TEXT_BYTES / 1024 / 1024)}MB`);
      }
      files[relativePath] = decoder.decode(tarData.subarray(fileStart, fileEnd));
    }

    offset = fileStart + Math.ceil(size / 512) * 512;
  }

  return files;
}

function isJavaScriptLikeNpmPackagePath(path: string) {
  return !/\.d\.ts$/i.test(path) && /\.(?:mjs|js|jsx|cjs|ts|tsx)$/i.test(path);
}

function isRuntimeExposedNpmPackagePath(path: string) {
  return isJavaScriptLikeNpmPackagePath(path) || /\.(?:json|css)$/i.test(path);
}

function resolveNpmPackageFilePath(files: Record<string, string>, candidate: string) {
  const normalized = normalizeProjectPath(candidate.replace(/^\.\//, ''));
  const candidates = /\.[cm]?[jt]sx?$|\.json$|\.css$/i.test(normalized)
    ? [normalized]
    : [
      normalized,
      `${normalized}.mjs`,
      `${normalized}.js`,
      `${normalized}.jsx`,
      `${normalized}.cjs`,
      `${normalized}.ts`,
      `${normalized}.tsx`,
      `${normalized}.json`,
      `${normalized}/index.mjs`,
      `${normalized}/index.js`,
      `${normalized}/index.jsx`,
      `${normalized}/index.cjs`,
      `${normalized}/index.ts`,
      `${normalized}/index.tsx`,
    ];
  return candidates.find(path => Object.prototype.hasOwnProperty.call(files, path)) || '';
}

function pickNpmExportTarget(value: any): string {
  if (typeof value === 'string') return value;
  if (Array.isArray(value)) {
    for (const item of value) {
      const picked = pickNpmExportTarget(item);
      if (picked) return picked;
    }
    return '';
  }
  if (value && typeof value === 'object') {
    for (const key of ['browser', 'import', 'module', 'default', 'require', 'node']) {
      const picked = pickNpmExportTarget(value[key]);
      if (picked) return picked;
    }
    for (const item of Object.values(value)) {
      const picked = pickNpmExportTarget(item);
      if (picked) return picked;
    }
  }
  return '';
}

function resolveNpmPackageEntryPath(packageJson: Record<string, any>, files: Record<string, string>) {
  const exportsValue = packageJson.exports;
  const exportDot = exportsValue && typeof exportsValue === 'object' && !Array.isArray(exportsValue)
    ? exportsValue['.']
    : exportsValue;

  const candidates = [
    pickNpmExportTarget(exportDot),
    typeof packageJson.browser === 'string' ? packageJson.browser : '',
    typeof packageJson.module === 'string' ? packageJson.module : '',
    typeof packageJson['jsnext:main'] === 'string' ? packageJson['jsnext:main'] : '',
    typeof packageJson.main === 'string' ? packageJson.main : '',
    'index.mjs',
    'index.js',
    'dist/index.mjs',
    'dist/index.js',
  ].filter(Boolean);

  for (const candidate of candidates) {
    const resolved = resolveNpmPackageFilePath(files, candidate);
    if (resolved) return resolved;
  }
  return Object.keys(files).find(isJavaScriptLikeNpmPackagePath) || 'index.js';
}

function collectNpmPackageExportAliases(packageInfo: StoredNpmPackage) {
  const aliases = new Map<string, string>();
  const { packageJson, files, name } = packageInfo;
  aliases.set(name, packageInfo.entry);

  const exportsValue = packageJson.exports;
  if (exportsValue && typeof exportsValue === 'object' && !Array.isArray(exportsValue)) {
    const hasSubpathExports = Object.keys(exportsValue).some(key => key.startsWith('.'));
    if (hasSubpathExports) {
      for (const [key, value] of Object.entries(exportsValue)) {
        if (!key.startsWith('.')) continue;
        const target = pickNpmExportTarget(value);
        if (!target) continue;
        const resolved = resolveNpmPackageFilePath(files, target);
        if (!resolved) continue;
        const specifier = key === '.'
          ? name
          : `${name}/${key.replace(/^\.\//, '')}`;
        aliases.set(specifier, resolved);
      }
    }
  }

  for (const path of Object.keys(files)) {
    if (!isRuntimeExposedNpmPackagePath(path)) continue;
    const withoutExtension = path.replace(/\.(?:mjs|js|jsx|cjs|ts|tsx|json|css)$/i, '');
    aliases.set(`${name}/${path}`, path);
    aliases.set(`${name}/${withoutExtension}`, path);
    if (/\/index\.(?:mjs|js|jsx|cjs|ts|tsx|json|css)$/i.test(path)) {
      aliases.set(`${name}/${path.replace(/\/index\.(?:mjs|js|jsx|cjs|ts|tsx|json|css)$/i, '')}`, path);
    }
  }

  return aliases;
}

function getNpmPackageInternalSpecifier(packageInfo: Pick<StoredNpmPackage, 'packageKey'>, path: string) {
  return `codecraft-npm/${encodeURIComponent(packageInfo.packageKey)}/${normalizeProjectPath(path)}`;
}

function resolveNpmPackageRelativeSpecifier(packageInfo: StoredNpmPackage, importerPath: string, specifier: string) {
  const basePath = specifier.startsWith('/')
    ? specifier.slice(1)
    : normalizeProjectPath(`${dirnameProjectPath(importerPath)}/${specifier}`);
  const resolved = resolveNpmPackageFilePath(packageInfo.files, stripProjectResourceSuffix(basePath));
  return resolved ? getNpmPackageInternalSpecifier(packageInfo, resolved) : specifier;
}

function rewriteNpmPackageModuleSpecifiers(source: string, packageInfo: StoredNpmPackage, importerPath: string) {
  const rewriteSpecifier = (specifier: string) => {
    if (isExternalProjectResourceSpecifier(specifier)) return specifier;
    if (specifier.startsWith('.') || specifier.startsWith('/')) {
      return resolveNpmPackageRelativeSpecifier(packageInfo, importerPath, specifier);
    }
    if (specifier === packageInfo.name) {
      return getNpmPackageInternalSpecifier(packageInfo, packageInfo.entry);
    }
    if (specifier.startsWith(`${packageInfo.name}/`)) {
      const subpath = specifier.slice(packageInfo.name.length + 1);
      const resolved = resolveNpmPackageFilePath(packageInfo.files, subpath);
      return resolved ? getNpmPackageInternalSpecifier(packageInfo, resolved) : specifier;
    }
    return specifier;
  };

  const rewriteImportDeclaration = (fullMatch: string, quote: string, specifier: string) => (
    fullMatch.replace(`${quote}${specifier}${quote}`, `${quote}${rewriteSpecifier(specifier)}${quote}`)
  );

  return source
    .replace(
      /\bimport\s*(['"])([^'"]+)\1/g,
      (fullMatch, quote: string, specifier: string) => rewriteImportDeclaration(fullMatch, quote, specifier)
    )
    .replace(
      /\bimport\s*(?:type\s*)?(?:[\w$]+\s*,\s*)?(?:\{[^}]*\}|\*\s*as\s*[\w$]+|[\w$]+)\s*from\s*(['"])([^'"]+)\1/g,
      (fullMatch, quote: string, specifier: string) => rewriteImportDeclaration(fullMatch, quote, specifier)
    )
    .replace(
      /\bexport\s*(?:type\s*)?(?:\{[^}]*\}|\*)\s*(?:as\s+[\w$]+\s*)?from\s*(['"])([^'"]+)\1/g,
      (fullMatch, quote: string, specifier: string) => rewriteImportDeclaration(fullMatch, quote, specifier)
    )
    .replace(
      /\bimport\s*\(\s*(['"])([^'"]+)\1\s*\)/g,
      (fullMatch, quote: string, specifier: string) => rewriteImportDeclaration(fullMatch, quote, specifier)
    );
}

function collectNpmPackageCommonJsRequireSpecifiers(source: string) {
  const specifiers = new Set<string>();
  source.replace(
    /\brequire\s*\(\s*(['"])([^'"]+)\1\s*\)/g,
    (_fullMatch, _quote: string, specifier: string) => {
      specifiers.add(specifier);
      return '';
    }
  );
  return [...specifiers];
}

function collectNpmPackageCommonJsNamedExports(source: string) {
  const names = new Set<string>();
  const addName = (name: string) => {
    if (/^[A-Za-z_$][\w$]*$/.test(name) && name !== 'default') {
      names.add(name);
    }
  };

  source.replace(/\b(?:module\s*\.\s*)?exports\s*\.\s*([A-Za-z_$][\w$]*)\s*=/g, (_fullMatch, name: string) => {
    addName(name);
    return '';
  });
  source.replace(/\bObject\.defineProperty\s*\(\s*(?:module\s*\.\s*)?exports\s*,\s*(['"])([A-Za-z_$][\w$]*)\1/g, (_fullMatch, _quote: string, name: string) => {
    addName(name);
    return '';
  });

  return [...names].sort((left, right) => left.localeCompare(right));
}

function createNpmPackageCommonJsRuntimeModuleSource(packageInfo: StoredNpmPackage, path: string) {
  const source = packageInfo.files[path] ?? '';
  const requireSpecifiers = collectNpmPackageCommonJsRequireSpecifiers(source);
  const importLines: string[] = [];
  const requireEntries: string[] = [];

  requireSpecifiers.forEach((specifier, index) => {
    const resolvedSpecifier = (() => {
      if (isExternalProjectResourceSpecifier(specifier)) return specifier;
      if (specifier.startsWith('.') || specifier.startsWith('/')) {
        return resolveNpmPackageRelativeSpecifier(packageInfo, path, specifier);
      }
      if (specifier === packageInfo.name) {
        return getNpmPackageInternalSpecifier(packageInfo, packageInfo.entry);
      }
      if (specifier.startsWith(`${packageInfo.name}/`)) {
        const subpath = specifier.slice(packageInfo.name.length + 1);
        const resolved = resolveNpmPackageFilePath(packageInfo.files, subpath);
        return resolved ? getNpmPackageInternalSpecifier(packageInfo, resolved) : specifier;
      }
      return specifier;
    })();
    const bindingName = `__codecraftCjsRequire${index}`;
    importLines.push(`import * as ${bindingName} from ${JSON.stringify(resolvedSpecifier)};`);
    requireEntries.push(`${JSON.stringify(specifier)}: ${bindingName}`);
  });

  const namedExportLines = collectNpmPackageCommonJsNamedExports(source)
    .map(name => `export const ${name} = __codecraftCjsExports?.[${JSON.stringify(name)}];`);

  return `${importLines.join('\n')}
const __codecraftCjsRequireModules = { ${requireEntries.join(', ')} };
const __codecraftCjsInterop = (moduleValue) => (
  moduleValue
  && typeof moduleValue === 'object'
  && 'default' in moduleValue
  && Object.keys(moduleValue).every((key) => key === 'default' || key === '__esModule')
    ? moduleValue.default
    : moduleValue
);
const module = { exports: {} };
let exports = module.exports;
const __filename = ${JSON.stringify(`/codecraft-npm/${packageInfo.packageKey}/${path}`)};
const __dirname = ${JSON.stringify(`/codecraft-npm/${packageInfo.packageKey}/${dirnameProjectPath(path)}`)};
const require = (specifier) => {
  if (Object.prototype.hasOwnProperty.call(__codecraftCjsRequireModules, specifier)) {
    return __codecraftCjsInterop(__codecraftCjsRequireModules[specifier]);
  }
  throw new Error('CodeCraft npm CommonJS module could not require "' + specifier + '" from ${packageInfo.name}/${path}.');
};
require.cache = {};
require.extensions = {};
require.main = null;
require.resolve = (specifier) => specifier;
(0, Function)('exports', 'require', 'module', '__filename', '__dirname', ${JSON.stringify(`${source}\n//# sourceURL=codecraft-npm://${packageInfo.packageKey}/${path}`)})(exports, require, module, __filename, __dirname);
const __codecraftCjsExports = module.exports;
export default __codecraftCjsExports;
export const moduleExports = __codecraftCjsExports;
${namedExportLines.join('\n')}
//# sourceURL=codecraft-npm://${packageInfo.packageKey}/${path}.mjs`;
}

function createNpmPackageRuntimeModuleSource(packageInfo: StoredNpmPackage, path: string) {
  const source = packageInfo.files[path] ?? '';
  if (/\.json$/i.test(path)) {
    return `export default ${source.trim() || 'null'};\n//# sourceURL=codecraft-npm://${packageInfo.packageKey}/${path}`;
  }
  if (/\.css$/i.test(path)) {
    return `const css = ${JSON.stringify(source)};\nconst style = document.createElement('style');\nstyle.setAttribute('data-codecraft-npm-css', ${JSON.stringify(`${packageInfo.name}/${path}`)});\nstyle.textContent = css;\ndocument.head.appendChild(style);\nexport default css;\n//# sourceURL=codecraft-npm://${packageInfo.packageKey}/${path}`;
  }
  if (/\.cjs$/i.test(path)) {
    return createNpmPackageCommonJsRuntimeModuleSource(packageInfo, path);
  }
  return `${rewriteNpmPackageModuleSpecifiers(source, packageInfo, path)}\n//# sourceURL=codecraft-npm://${packageInfo.packageKey}/${path}`;
}

async function fetchNpmRegistryMetadata(packageName: string) {
  const response = await fetch(getNpmRegistryPackageUrl(packageName));
  if (!response.ok) {
    throw new Error(`Package "${packageName}" not found on the npm registry`);
  }
  return response.json();
}

function yieldToBrowser() {
  return new Promise<void>(resolve => window.setTimeout(resolve, 0));
}

function formatNpmPackageListForStatus(packages: string[]) {
  if (packages.length <= 8) return packages.join(', ');
  return `${packages.slice(0, 8).join(', ')}, and ${packages.length - 8} more`;
}

async function installNpmPackagesFromRegistry(
  packageSpecs: string[],
  onStatus: (message: string) => void = () => { }
): Promise<NpmInstallResult> {
  const queue: Array<{ name?: string; range?: string; raw: string; requestedBy?: string }> = packageSpecs.map(raw => ({ raw }));
  const visited = new Set<string>();
  const installed: SavedNpmInstalledPackage[] = [];
  const skipped: string[] = [];

  while (queue.length > 0) {
    if (visited.size >= MAX_NPM_INSTALL_PACKAGE_COUNT) {
      throw new Error(`npm install stopped after resolving ${MAX_NPM_INSTALL_PACKAGE_COUNT} packages. Install fewer packages at once, or uninstall unused packages and try again.`);
    }

    const item = queue.shift()!;
    const parsed = item.name
      ? { name: item.name, range: item.range || 'latest', raw: item.raw }
      : parseNpmPackageInstallSpec(item.raw);
    if (!parsed) {
      throw new Error(`Invalid npm package specifier: ${item.raw}`);
    }

    const visitKey = `${parsed.name}@${parsed.range}`;
    if (visited.has(visitKey)) continue;
    visited.add(visitKey);
    if (visited.size % NPM_INSTALL_BROWSER_YIELD_EVERY === 0) {
      await yieldToBrowser();
    }

    const metadata = await fetchNpmRegistryMetadata(parsed.name);
    const version = resolveNpmRegistryVersion(metadata, parsed.range);
    if (!version || !metadata.versions?.[version]) {
      throw new Error(`Could not resolve ${parsed.name}@${parsed.range} from the npm registry`);
    }

    const packageKey = getStoredNpmPackageKey(parsed.name, version);
    if (installed.some(packageInfo => packageInfo.name === parsed.name && packageInfo.version === version)) {
      continue;
    }

    const versionMeta = metadata.versions[version];
    const tarballUrl = versionMeta?.dist?.tarball;
    if (typeof tarballUrl !== 'string' || !tarballUrl) {
      throw new Error(`Package ${packageKey} does not expose a registry tarball`);
    }

    onStatus(`Fetching ${packageKey} from npm registry... (${visited.size} resolved, ${queue.length} queued)`);
    const tarballResponse = await fetch(tarballUrl);
    if (!tarballResponse.ok) {
      throw new Error(`Failed to download ${packageKey} tarball`);
    }

    const gzipBytes = new Uint8Array(await tarballResponse.arrayBuffer());
    const tarBytes = await decompressGzipBytes(gzipBytes);
    const files = parseNpmPackageTarballFiles(tarBytes);
    if (!files['package.json']) {
      files['package.json'] = JSON.stringify(versionMeta, null, 2);
    }

    let packageJson: Record<string, any> = {};
    try {
      packageJson = JSON.parse(files['package.json']);
    } catch {
      packageJson = {};
    }
    packageJson.name = typeof packageJson.name === 'string' ? packageJson.name : parsed.name;
    packageJson.version = typeof packageJson.version === 'string' ? packageJson.version : version;

    const dependencies = versionMeta.dependencies && typeof versionMeta.dependencies === 'object'
      ? versionMeta.dependencies as Record<string, string>
      : {};
    const entry = resolveNpmPackageEntryPath(packageJson, files);
    const savedPackage: SavedNpmInstalledPackage = {
      name: parsed.name,
      version,
      spec: parsed.raw,
      entry,
      fileCount: Object.keys(files).length,
      dependencyCount: Object.keys(dependencies).length,
      installedAt: Date.now(),
    };
    const storedPackage: StoredNpmPackage = {
      ...savedPackage,
      packageKey,
      packageJson,
      files,
    };

    const previous = loadSavedNpmInstalledPackages().find(packageInfo => packageInfo.name === parsed.name);
    await putStoredNpmPackage(storedPackage);
    upsertSavedNpmInstalledPackage(savedPackage);
    if (previous && previous.version !== version) {
      try {
        await deleteStoredNpmPackage(previous.name, previous.version);
      } catch { }
    }

    installed.push(savedPackage);
    onStatus(`Installed ${packageKey} (${installed.length} installed, ${savedPackage.fileCount} file${savedPackage.fileCount === 1 ? '' : 's'}).`);

    for (const [dependencyName, dependencyRange] of Object.entries(dependencies)) {
      const dependencyKey = `${dependencyName}@${dependencyRange}`;
      if (visited.has(dependencyKey)) continue;
      queue.push({
        name: dependencyName,
        range: dependencyRange,
        raw: dependencyKey,
        requestedBy: parsed.name,
      });
    }

    const peerDependencies = versionMeta.peerDependencies && typeof versionMeta.peerDependencies === 'object'
      ? Object.keys(versionMeta.peerDependencies)
      : [];
    if (peerDependencies.length > 0) {
      skipped.push(`${packageKey} peer dependencies: ${peerDependencies.join(', ')}`);
    }
  }

  return { installed, skipped };
}

function normalizePyiImportSizeLimitModuleName(moduleName: string) {
  return moduleName.trim().toLowerCase();
}

function sortSavedPyiImportSizeLimitOverrides(overrides: SavedPyiImportSizeLimitOverride[]) {
  return [...overrides].sort((a, b) => a.moduleName.localeCompare(b.moduleName));
}

function loadSavedPyiImportSizeLimitOverrides(): SavedPyiImportSizeLimitOverride[] {
  try {
    const raw = JSON.parse(localStorage.getItem(getProjectStorageKey(STORAGE_KEYS.pyiImportSizeLimits)) || '[]');
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
    getProjectStorageKey(STORAGE_KEYS.pyiImportSizeLimits),
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
    const raw = JSON.parse(localStorage.getItem(getProjectStorageKey(STORAGE_KEYS.csharpNamespaces)) || '[]');
    return Array.isArray(raw)
      ? raw.filter((value): value is string => typeof value === 'string' && value.trim().length > 0)
      : [];
  } catch {
    return [];
  }
}

function saveCSharpNamespaces(namespaces: string[]) {
  localStorage.setItem(getProjectStorageKey(STORAGE_KEYS.csharpNamespaces), JSON.stringify(namespaces));
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

interface UploadedProjectFile {
  path: string;
  content: string;
}

interface AssistantAttachmentFile extends UploadedProjectFile {
  id: string;
  source: 'workspace' | 'upload';
}

interface PackageJsonDependencyIssue {
  path: string;
  message: string;
}

interface PackageJsonDependencyConflict {
  packageName: string;
  ranges: string[];
  sources: string[];
}

interface PackageJsonDependencyRequirement {
  name: string;
  range: string;
  spec: string;
  sources: string[];
}

interface PackageJsonDependencySyncPlan {
  signature: string;
  packageJsonCount: number;
  requirements: PackageJsonDependencyRequirement[];
  conflicts: PackageJsonDependencyConflict[];
  invalidFiles: PackageJsonDependencyIssue[];
  unsupportedDependencies: PackageJsonDependencyIssue[];
}

const PACKAGE_JSON_DEPENDENCY_FIELDS = [
  'dependencies',
  'devDependencies',
  'optionalDependencies',
  'peerDependencies',
] as const;

function createFsItemId() {
  return Math.random().toString(36).slice(2, 11);
}

function getFsItemPath(items: FSItem[], id: string | undefined): string {
  if (!id) return '';
  const item = items.find(candidate => candidate.id === id);
  if (!item) return '';
  if (!item.parentId) return item.name;
  const parentPath = getFsItemPath(items, item.parentId);
  return parentPath ? `${parentPath}/${item.name}` : item.name;
}

function normalizeRuntimeWorkspacePath(path: string, fallback = 'main.txt') {
  return normalizeProjectPath(path || fallback) || fallback;
}

function buildRuntimeWorkspaceInitialFileMap(files: Array<RuntimeFileSnapshot & { name?: string }>) {
  const initialFiles = new Map<string, string>();
  for (const file of files) {
    initialFiles.set(normalizeRuntimeWorkspacePath(file.path, file.name || 'main.txt'), file.content || '');
  }
  return initialFiles;
}

function getRuntimeWorkspaceChangedFiles(initialFiles: Map<string, string>, finalFiles: RuntimeFileSnapshot[]) {
  const changed = new Map<string, RuntimeFileSnapshot>();
  for (const file of finalFiles) {
    const path = normalizeRuntimeWorkspacePath(file.path, 'output.txt');
    const content = String(file.content ?? '');
    if (initialFiles.get(path) === content) continue;
    changed.set(path, { path, content });
  }
  return [...changed.values()].sort((left, right) => left.path.localeCompare(right.path));
}

function upsertRuntimeWorkspaceFilesIntoExplorer(items: FSItem[], files: RuntimeFileSnapshot[]) {
  if (files.length === 0) return items;

  const next = items.map(item => ({ ...item }));
  const findChild = (parentId: string | null, name: string, type?: FSItem['type']) => (
    next.find(item => item.parentId === parentId && item.name === name && (!type || item.type === type))
  );
  const ensureFolder = (parentId: string | null, name: string) => {
    const existing = findChild(parentId, name, 'folder');
    if (existing) {
      existing.isOpen = true;
      return existing.id;
    }

    const folder: FSItem = {
      id: createFsItemId(),
      name,
      type: 'folder',
      parentId,
      isOpen: true,
    };
    next.push(folder);
    return folder.id;
  };

  for (const file of files) {
    const segments = normalizeRuntimeWorkspacePath(file.path, 'output.txt').split('/').filter(Boolean);
    if (segments.length === 0) continue;

    let parentId: string | null = null;
    for (const segment of segments.slice(0, -1)) {
      parentId = ensureFolder(parentId, segment);
    }

    const fileName = segments[segments.length - 1];
    const existingFile = findChild(parentId, fileName, 'file');
    if (existingFile) {
      existingFile.content = file.content;
      existingFile.language = langFromFilename(fileName);
      continue;
    }

    next.push({
      id: createFsItemId(),
      name: fileName,
      type: 'file',
      parentId,
      content: file.content,
      language: langFromFilename(fileName),
    });
  }

  return next;
}

function getRuntimeWorkspaceFilesFromExplorer(items: FSItem[]) {
  const byPath = new Map<string, RuntimeFileSnapshot>();
  for (const item of items) {
    if (item.type !== 'file') continue;
    const path = normalizeRuntimeWorkspacePath(getFsItemPath(items, item.id), item.name || 'file.txt');
    byPath.set(path, { path, content: item.content || '' });
  }
  return [...byPath.values()].sort((left, right) => left.path.localeCompare(right.path));
}

type GitChangeKind = 'added' | 'modified' | 'deleted';

interface GitCommitRecord {
  id: string;
  message: string;
  author: string;
  timestamp: number;
  parentIds: string[];
  files: Record<string, string>;
}

interface GitBranchRecord {
  name: string;
  head: string | null;
  upstream?: string;
}

interface GitTagRecord {
  name: string;
  target: string;
  message?: string;
  timestamp: number;
}

interface GitRemoteRecord {
  name: string;
  url: string;
  branchHeads: Record<string, string | null>;
  branchFiles: Record<string, Record<string, string>>;
}

interface GitHubAuthRecord {
  token: string;
  user: string;
  scopes: string[];
  loggedInAt: number;
}

interface GitHubRepositoryRef {
  owner: string;
  repo: string;
}

interface GitRepositoryState {
  initialized: boolean;
  currentBranch: string;
  branches: Record<string, GitBranchRecord>;
  commits: Record<string, GitCommitRecord>;
  tags: Record<string, GitTagRecord>;
  stashes: GitStashRecord[];
  remotes: Record<string, GitRemoteRecord>;
  config: Record<string, string>;
  ghAuth: GitHubAuthRecord | null;
  lastFetchedAt: number | null;
  stagedPaths: string[];
}

interface GitStashRecord {
  id: string;
  message: string;
  branch: string;
  baseHead: string | null;
  timestamp: number;
  files: Record<string, string>;
}

interface GitFileChange {
  path: string;
  kind: GitChangeKind;
  before?: string;
  after?: string;
}

interface GitBranchSyncStatus {
  upstream: string;
  remoteName: string;
  remoteBranch: string;
  remoteHead: string | null;
  localHead: string | null;
  needsPublish: boolean;
  needsPush: boolean;
  needsPull: boolean;
  diverged: boolean;
}

const DEFAULT_GIT_BRANCH = 'main';
const DEFAULT_GIT_REMOTE_URL = 'codecraft://remote/default';
const GIT_REMOTE_STORAGE_PREFIX = 'codecraft-git-remote:';
const GIT_STATE_STORAGE_PREFIX = 'codecraft-git-state:';

function createDefaultGitState(): GitRepositoryState {
  return {
    initialized: true,
    currentBranch: DEFAULT_GIT_BRANCH,
    branches: {
      [DEFAULT_GIT_BRANCH]: {
        name: DEFAULT_GIT_BRANCH,
        head: null,
        upstream: `origin/${DEFAULT_GIT_BRANCH}`,
      },
    },
    commits: {},
    tags: {},
    stashes: [],
    remotes: {
      origin: {
        name: 'origin',
        url: DEFAULT_GIT_REMOTE_URL,
        branchHeads: {},
        branchFiles: {},
      },
    },
    config: {
      'user.name': 'CodeCraft User',
      'user.email': 'codecraft@example.local',
    },
    ghAuth: null,
    lastFetchedAt: null,
    stagedPaths: [],
  };
}

function normalizeGitState(raw: unknown): GitRepositoryState {
  const fallback = createDefaultGitState();
  if (!raw || typeof raw !== 'object') return fallback;
  const source = raw as Partial<GitRepositoryState>;
  const branches = source.branches && typeof source.branches === 'object' ? source.branches : fallback.branches;
  const currentBranch = typeof source.currentBranch === 'string' && branches[source.currentBranch]
    ? source.currentBranch
    : Object.keys(branches)[0] || DEFAULT_GIT_BRANCH;
  const normalizedBranches = { ...branches };
  if (!normalizedBranches[currentBranch]) {
    normalizedBranches[currentBranch] = { name: currentBranch, head: null, upstream: `origin/${currentBranch}` };
  }

  return {
    initialized: source.initialized !== false,
    currentBranch,
    branches: normalizedBranches,
    commits: source.commits && typeof source.commits === 'object' ? source.commits : {},
    tags: source.tags && typeof source.tags === 'object' ? source.tags : {},
    stashes: Array.isArray(source.stashes) ? source.stashes.filter(stash => stash && typeof stash === 'object') as GitStashRecord[] : [],
    remotes: source.remotes && typeof source.remotes === 'object' ? source.remotes : fallback.remotes,
    config: source.config && typeof source.config === 'object' ? source.config : fallback.config,
    ghAuth: source.ghAuth && typeof source.ghAuth === 'object' ? source.ghAuth : null,
    lastFetchedAt: typeof source.lastFetchedAt === 'number' ? source.lastFetchedAt : null,
    stagedPaths: Array.isArray(source.stagedPaths) ? source.stagedPaths.filter(path => typeof path === 'string') : [],
  };
}

function getGitStateStorageKey(projectId = getActiveProjectId()) {
  return `${GIT_STATE_STORAGE_PREFIX}${projectId}`;
}

function getLegacyGitStateLocalStorageKeys(projectId = getActiveProjectId()) {
  const keys = [getProjectStorageKey(STORAGE_KEYS.gitState, projectId)];
  if (projectId === DEFAULT_PROJECT_ID) keys.push(STORAGE_KEYS.gitState);
  return keys;
}

function loadLegacySavedGitState(projectId = getActiveProjectId()) {
  for (const key of getLegacyGitStateLocalStorageKeys(projectId)) {
    try {
      const value = localStorage.getItem(key);
      if (value != null) return normalizeGitState(JSON.parse(value));
    } catch {
      return createDefaultGitState();
    }
  }
  return null;
}

function removeLegacySavedGitState(projectId = getActiveProjectId()) {
  for (const key of getLegacyGitStateLocalStorageKeys(projectId)) {
    localStorage.removeItem(key);
  }
}

async function loadStoredGitState(projectId = getActiveProjectId()): Promise<GitRepositoryState | null> {
  try {
    const db = await openGitStateDB();
    const stored = await new Promise<unknown>((resolve, reject) => {
      const tx = db.transaction(GIT_STATE_STORE_NAME, 'readonly');
      const req = tx.objectStore(GIT_STATE_STORE_NAME).get(getGitStateStorageKey(projectId));
      tx.oncomplete = () => resolve(req.result);
      tx.onerror = () => reject(tx.error);
      req.onerror = () => reject(req.error);
    });
    if (stored) {
      removeLegacySavedGitState(projectId);
      return normalizeGitState(stored);
    }
  } catch {
    const legacy = loadLegacySavedGitState(projectId);
    return legacy || null;
  }

  const legacy = loadLegacySavedGitState(projectId);
  if (legacy) {
    await saveStoredGitState(legacy, projectId);
    removeLegacySavedGitState(projectId);
    return legacy;
  }

  return null;
}

async function saveStoredGitState(state: GitRepositoryState, projectId = getActiveProjectId()) {
  const db = await openGitStateDB();
  const snapshot = normalizeGitState(state);
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(GIT_STATE_STORE_NAME, 'readwrite');
    tx.objectStore(GIT_STATE_STORE_NAME).put(snapshot, getGitStateStorageKey(projectId));
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
  removeLegacySavedGitState(projectId);
}

async function deleteStoredGitState(projectId = getActiveProjectId()) {
  const db = await openGitStateDB();
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(GIT_STATE_STORE_NAME, 'readwrite');
    tx.objectStore(GIT_STATE_STORE_NAME).delete(getGitStateStorageKey(projectId));
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
  removeLegacySavedGitState(projectId);
}

function serializeWorkspaceSnapshot(items: FSItem[]) {
  const snapshot: Record<string, string> = {};
  for (const item of items) {
    if (item.type !== 'file') continue;
    const path = normalizeProjectPath(getFsItemPath(items, item.id));
    if (!path) continue;
    snapshot[path] = item.content || '';
  }
  return snapshot;
}

function snapshotFingerprint(files: Record<string, string>) {
  const text = Object.keys(files)
    .sort()
    .map(path => `${path}\0${files[path]}`)
    .join('\0');
  let hash = 2166136261;
  for (let index = 0; index < text.length; index += 1) {
    hash ^= text.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(16).padStart(8, '0');
}

function createGitCommitId(files: Record<string, string>, message: string, timestamp: number) {
  return `${snapshotFingerprint(files)}${Math.abs(hashString(`${message}:${timestamp}`)).toString(16).slice(0, 4)}`;
}

function hashString(value: string) {
  let hash = 0;
  for (let index = 0; index < value.length; index += 1) {
    hash = Math.imul(31, hash) + value.charCodeAt(index) | 0;
  }
  return hash;
}

function getGitHeadCommit(state: GitRepositoryState) {
  const branch = state.branches[state.currentBranch];
  return branch?.head ? state.commits[branch.head] || null : null;
}

function diffGitSnapshots(base: Record<string, string>, current: Record<string, string>): GitFileChange[] {
  const paths = new Set([...Object.keys(base), ...Object.keys(current)]);
  const changes: GitFileChange[] = [];
  for (const path of [...paths].sort()) {
    const hadBase = Object.prototype.hasOwnProperty.call(base, path);
    const hasCurrent = Object.prototype.hasOwnProperty.call(current, path);
    if (!hadBase && hasCurrent) changes.push({ path, kind: 'added', after: current[path] });
    else if (hadBase && !hasCurrent) changes.push({ path, kind: 'deleted', before: base[path] });
    else if (base[path] !== current[path]) changes.push({ path, kind: 'modified', before: base[path], after: current[path] });
  }
  return changes;
}

function getGitWorkspaceChanges(state: GitRepositoryState, items: FSItem[]) {
  const head = getGitHeadCommit(state);
  return diffGitSnapshots(head?.files || {}, serializeWorkspaceSnapshot(items));
}

function matchesGitPathspec(path: string, pathspecs: string[]) {
  if (pathspecs.length === 0 || pathspecs.includes('.')) return true;
  return pathspecs.some(spec => {
    const normalized = normalizeProjectPath(spec);
    return path === normalized || path.startsWith(`${normalized}/`);
  });
}

function resolveGitRevision(state: GitRepositoryState, revision = 'HEAD') {
  const target = revision.trim() || 'HEAD';
  if (target === 'HEAD') return state.branches[state.currentBranch]?.head || null;
  if (state.branches[target]?.head) return state.branches[target].head;
  if (state.tags[target]?.target) return state.tags[target].target;
  const remoteRef = getGitRemoteBranchRefs(state).find(ref => ref.label === target || `remotes/${ref.label}` === target);
  if (remoteRef?.head) return remoteRef.head;
  const exactCommit = state.commits[target];
  if (exactCommit) return exactCommit.id;
  const matches = Object.keys(state.commits).filter(id => id.startsWith(target));
  return matches.length === 1 ? matches[0] : null;
}

function getGitRevisionCommit(state: GitRepositoryState, revision = 'HEAD') {
  const id = resolveGitRevision(state, revision);
  return id ? state.commits[id] || null : null;
}

function formatGitCommitDetails(commit: GitCommitRecord) {
  return [
    `commit ${commit.id}`,
    `Author: ${commit.author}`,
    `Date:   ${formatGitTimestamp(commit.timestamp)}`,
    '',
    `    ${commit.message}`,
  ];
}

function isGitAncestor(state: GitRepositoryState, ancestorId: string | null, descendantId: string | null) {
  if (!ancestorId) return true;
  if (!descendantId) return false;
  const stack = [descendantId];
  const seen = new Set<string>();
  while (stack.length > 0) {
    const id = stack.pop();
    if (!id || seen.has(id)) continue;
    if (id === ancestorId) return true;
    seen.add(id);
    const commit = state.commits[id];
    if (commit) stack.push(...commit.parentIds);
  }
  return false;
}

function getGitMergeBase(state: GitRepositoryState, leftId: string | null, rightId: string | null) {
  if (!leftId || !rightId) return null;
  const ancestors = new Set<string>();
  const collect = [leftId];
  while (collect.length > 0) {
    const id = collect.pop();
    if (!id || ancestors.has(id)) continue;
    ancestors.add(id);
    const commit = state.commits[id];
    if (commit) collect.push(...commit.parentIds);
  }
  const scan = [rightId];
  const seen = new Set<string>();
  while (scan.length > 0) {
    const id = scan.pop();
    if (!id || seen.has(id)) continue;
    if (ancestors.has(id)) return id;
    seen.add(id);
    const commit = state.commits[id];
    if (commit) scan.push(...commit.parentIds);
  }
  return null;
}

function getGitBranchSyncStatus(state: GitRepositoryState): GitBranchSyncStatus {
  const branch = state.branches[state.currentBranch] || { name: state.currentBranch, head: null };
  const upstream = branch.upstream || `origin/${branch.name}`;
  const slashIndex = upstream.indexOf('/');
  const remoteName = slashIndex >= 0 ? upstream.slice(0, slashIndex) : 'origin';
  const remoteBranch = slashIndex >= 0 ? upstream.slice(slashIndex + 1) : branch.name;
  const remote = state.remotes[remoteName];
  const remoteHasBranch = !!remote && Object.prototype.hasOwnProperty.call(remote.branchHeads, remoteBranch);
  const remoteHead = remoteHasBranch ? remote.branchHeads[remoteBranch] || null : null;
  const localHead = branch.head || null;
  const needsPublish = !!remote && !remoteHasBranch && !!localHead;
  const needsPush = !!remote && remoteHasBranch && localHead !== remoteHead && isGitAncestor(state, remoteHead, localHead);
  const needsPull = !!remote && remoteHasBranch && localHead !== remoteHead && isGitAncestor(state, localHead, remoteHead);
  const diverged = !!remote && remoteHasBranch && localHead !== remoteHead && !needsPush && !needsPull;
  return { upstream, remoteName, remoteBranch, remoteHead, localHead, needsPublish, needsPush, needsPull, diverged };
}

function formatGitChangeKind(kind: GitChangeKind) {
  if (kind === 'added') return 'A';
  if (kind === 'deleted') return 'D';
  return 'M';
}

function formatGitCommitLine(commit: GitCommitRecord) {
  return `${commit.id.slice(0, 7)} ${commit.message}`;
}

function formatGitTimestamp(timestamp: number) {
  return new Date(timestamp).toLocaleString();
}

function getGitRemoteStorageKey(url: string) {
  return `${GIT_REMOTE_STORAGE_PREFIX}${url || DEFAULT_GIT_REMOTE_URL}`;
}

function isGitRepositoryPublished(state: GitRepositoryState) {
  const origin = state.remotes.origin;
  return !!origin && origin.url !== DEFAULT_GIT_REMOTE_URL;
}

function parseGitHubRemoteUrl(url: string): GitHubRepositoryRef | null {
  const trimmed = url.trim().replace(/\.git$/i, '');
  const shorthand = trimmed.match(/^github:([^/\s]+)\/([^/\s]+)$/i);
  if (shorthand && isValidGitHubRepositoryPart(shorthand[1]) && isValidGitHubRepositoryPart(shorthand[2])) {
    return { owner: shorthand[1], repo: shorthand[2] };
  }
  const https = trimmed.match(/^https:\/\/github\.com\/([^/\s]+)\/([^/\s]+)$/i);
  if (https && isValidGitHubRepositoryPart(https[1]) && isValidGitHubRepositoryPart(https[2])) {
    return { owner: https[1], repo: https[2] };
  }
  const ssh = trimmed.match(/^git@github\.com:([^/\s]+)\/([^/\s]+)$/i);
  if (ssh && isValidGitHubRepositoryPart(ssh[1]) && isValidGitHubRepositoryPart(ssh[2])) {
    return { owner: ssh[1], repo: ssh[2] };
  }
  return null;
}

function isGitHubRemote(remote: GitRemoteRecord) {
  return !!parseGitHubRemoteUrl(remote.url);
}

function isValidGitHubRepositoryPart(value: string) {
  return /^[A-Za-z0-9_.-]+$/.test(value) && !value.startsWith('.') && !value.endsWith('.');
}

function parseGitHubRepositoryArg(value: string): GitHubRepositoryRef | null {
  const trimmed = value.trim().replace(/\.git$/i, '');
  const match = trimmed.match(/^([^/\s]+)\/([^/\s]+)$/);
  if (!match) return null;
  if (!isValidGitHubRepositoryPart(match[1]) || !isValidGitHubRepositoryPart(match[2])) return null;
  return { owner: match[1], repo: match[2] };
}

function isValidCodeCraftRemoteUrl(url: string) {
  return /^codecraft:\/\/remote\/[A-Za-z0-9._~:/-]+$/.test(url.trim());
}

function isSupportedGitRemoteUrl(url: string) {
  return !!parseGitHubRemoteUrl(url) || isValidCodeCraftRemoteUrl(url);
}

function getSupportedGitRemoteUrlHelp() {
  return 'Use github:owner/repo, https://github.com/owner/repo, git@github.com:owner/repo.git, or codecraft://remote/name.';
}

function isValidGitRemoteName(name: string) {
  return /^[A-Za-z0-9][A-Za-z0-9._-]*$/.test(name);
}

function isValidGitBranchName(name: string) {
  if (!name || name !== name.trim()) return false;
  if (/[\s\x00-\x1F\x7F~^:?*[\\]/.test(name)) return false;
  if (name.startsWith('-') || name.startsWith('/') || name.endsWith('/')) return false;
  if (name === '@' || name.includes('@{') || name.includes('..') || name.includes('//')) return false;
  if (name.endsWith('.') || name.endsWith('.lock')) return false;
  return name.split('/').every(part => !!part && part !== '.' && part !== '..' && !part.endsWith('.lock') && !part.endsWith('.'));
}

function getInvalidGitBranchMessage(name: string) {
  return `fatal: '${name || ''}' is not a valid branch name`;
}

function getGitRemoteBranchRefs(state: GitRepositoryState) {
  return Object.values(state.remotes).flatMap(remote => (
    Object.keys(remote.branchHeads)
      .sort()
      .map(branchName => ({
        remoteName: remote.name,
        branchName,
        label: `${remote.name}/${branchName}`,
        head: remote.branchHeads[branchName] || null,
        files: remote.branchFiles[branchName] || {},
      }))
  ));
}

function decodeGitHubBase64Content(content: string) {
  const binary = atob(content.replace(/\s/g, ''));
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }
  return new TextDecoder().decode(bytes);
}

async function loadStoredGitRemote(remote: GitRemoteRecord): Promise<GitRemoteRecord> {
  try {
    const db = await openGitStateDB();
    const parsed = await new Promise<unknown>((resolve, reject) => {
      const tx = db.transaction(GIT_STATE_STORE_NAME, 'readonly');
      const req = tx.objectStore(GIT_STATE_STORE_NAME).get(getGitRemoteStorageKey(remote.url));
      tx.oncomplete = () => resolve(req.result);
      tx.onerror = () => reject(tx.error);
      req.onerror = () => reject(req.error);
    });
    if (parsed && typeof parsed === 'object') {
      localStorage.removeItem(getGitRemoteStorageKey(remote.url));
      const stored = parsed as Partial<GitRemoteRecord>;
      return {
        ...remote,
        branchHeads: stored.branchHeads && typeof stored.branchHeads === 'object' ? stored.branchHeads : remote.branchHeads,
        branchFiles: stored.branchFiles && typeof stored.branchFiles === 'object' ? stored.branchFiles : remote.branchFiles,
      };
    }
  } catch {
    // Ignore corrupt IndexedDB remote storage and try the legacy localStorage value.
  }

  try {
    const parsed = JSON.parse(localStorage.getItem(getGitRemoteStorageKey(remote.url)) || 'null');
    if (parsed && typeof parsed === 'object') {
      const migratedRemote = {
        ...remote,
        branchHeads: parsed.branchHeads && typeof parsed.branchHeads === 'object' ? parsed.branchHeads : remote.branchHeads,
        branchFiles: parsed.branchFiles && typeof parsed.branchFiles === 'object' ? parsed.branchFiles : remote.branchFiles,
      };
      await saveStoredGitRemote(migratedRemote);
      localStorage.removeItem(getGitRemoteStorageKey(remote.url));
      return migratedRemote;
    }
  } catch {
    // Ignore corrupt legacy remote storage and keep the local remote metadata.
  }
  return remote;
}

async function saveStoredGitRemote(remote: GitRemoteRecord) {
  const db = await openGitStateDB();
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(GIT_STATE_STORE_NAME, 'readwrite');
    tx.objectStore(GIT_STATE_STORE_NAME).put({
      branchHeads: remote.branchHeads,
      branchFiles: remote.branchFiles,
    }, getGitRemoteStorageKey(remote.url));
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
  localStorage.removeItem(getGitRemoteStorageKey(remote.url));
}

function createFsItemsFromSnapshot(snapshot: Record<string, string>, previousItems: FSItem[]) {
  const previousByPath = new Map(previousItems.map(item => [normalizeProjectPath(getFsItemPath(previousItems, item.id)), item]));
  const next: FSItem[] = [];
  const folderIds = new Map<string, string>();
  const ensureFolder = (path: string, name: string, parentId: string | null) => {
    const normalized = normalizeProjectPath(path);
    const existing = previousByPath.get(normalized);
    const id = existing?.type === 'folder' ? existing.id : createFsItemId();
    if (!folderIds.has(normalized)) {
      folderIds.set(normalized, id);
      next.push({
        id,
        name,
        type: 'folder',
        parentId,
        isOpen: existing?.isOpen ?? true,
      });
    }
    return folderIds.get(normalized) || id;
  };

  for (const path of Object.keys(snapshot).sort()) {
    const segments = normalizeProjectPath(path).split('/').filter(Boolean);
    if (segments.length === 0) continue;
    let parentId: string | null = null;
    let currentPath = '';
    for (const segment of segments.slice(0, -1)) {
      currentPath = currentPath ? `${currentPath}/${segment}` : segment;
      parentId = ensureFolder(currentPath, segment, parentId);
    }
    const fileName = segments[segments.length - 1];
    const normalizedFilePath = normalizeProjectPath(path);
    const existing = previousByPath.get(normalizedFilePath);
    next.push({
      id: existing?.type === 'file' ? existing.id : createFsItemId(),
      name: fileName,
      type: 'file',
      parentId,
      content: snapshot[path] || '',
      language: langFromFilename(fileName),
    });
  }

  return next;
}

function formatRuntimeReturnValue(value: unknown) {
  if (value === undefined || value === null) return '';
  if (typeof value === 'object') {
    if (Array.isArray(value)) return value.length === 0 ? '' : JSON.stringify(value);
    if (Object.keys(value as Record<string, unknown>).length === 0) return '';
    try {
      return JSON.stringify(value);
    } catch {
      return String(value).trim();
    }
  }
  return String(value).trim();
}

function isPlainRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === 'object' && !Array.isArray(value);
}

function sanitizeUploadedProjectPath(path: string) {
  return path
    .replace(/\\/g, '/')
    .split('/')
    .map(part => part.trim())
    .filter(part => part && part !== '.' && part !== '..');
}

function hasFileDataTransferPayload(dataTransfer: DataTransfer | null) {
  if (!dataTransfer) return false;
  if (dataTransfer.files && dataTransfer.files.length > 0) return true;
  return Array.from(dataTransfer.items || []).some(item => item.kind === 'file');
}

function normalizeAssistantAttachmentPath(path: string) {
  return sanitizeUploadedProjectPath(path).join('/');
}

function formatAssistantAttachmentSummary(files: AssistantAttachmentFile[]) {
  if (files.length === 0) return '';
  return `\n\nAttached files:\n${files.map(file => `- ${file.path}`).join('\n')}`;
}

function formatAssistantAttachmentPromptSection(files: AssistantAttachmentFile[]) {
  if (files.length === 0) return '';
  return `\n\nAttached files for this user message. Each file name below is its path:\n${files.map(file => (
    `\n<attached_file path="${file.path.replace(/"/g, '&quot;')}">\n${file.content || ''}\n</attached_file>`
  )).join('\n')}`;
}

function readDataTransferDirectoryEntries(reader: any): Promise<any[]> {
  return new Promise((resolve, reject) => {
    const entries: any[] = [];
    const readBatch = () => {
      reader.readEntries(
        (batch: any[]) => {
          if (!batch.length) {
            resolve(entries);
            return;
          }
          entries.push(...batch);
          readBatch();
        },
        reject
      );
    };
    readBatch();
  });
}

function getFileFromDataTransferEntry(entry: any): Promise<File> {
  return new Promise((resolve, reject) => {
    entry.file(resolve, reject);
  });
}

async function readUploadedFilesFromFileSystemHandle(handle: FileSystemHandle, parentPath = ''): Promise<UploadedProjectFile[]> {
  if (handle.kind === 'file') {
    const file = await (handle as FileSystemFileHandle).getFile();
    return [{
      path: `${parentPath}${file.name}`,
      content: await file.text(),
    }];
  }

  const directoryHandle = handle as FileSystemDirectoryHandle;
  const nestedFiles: UploadedProjectFile[] = [];
  for await (const childHandle of (directoryHandle as any).values()) {
    nestedFiles.push(...await readUploadedFilesFromFileSystemHandle(childHandle, `${parentPath}${directoryHandle.name}/`));
  }
  return nestedFiles;
}

async function getFileSystemHandleFromDataTransferItem(item: DataTransferItem): Promise<FileSystemHandle | null> {
  const getAsFileSystemHandle = (item as any).getAsFileSystemHandle;
  if (typeof getAsFileSystemHandle !== 'function') return null;
  try {
    return await getAsFileSystemHandle.call(item);
  } catch {
    return null;
  }
}

async function readUploadedFilesFromEntry(entry: any, parentPath = ''): Promise<UploadedProjectFile[]> {
  if (!entry) return [];
  if (entry.isFile) {
    const file = await getFileFromDataTransferEntry(entry);
    return [{
      path: `${parentPath}${file.name}`,
      content: await file.text(),
    }];
  }

  if (!entry.isDirectory) return [];
  const reader = entry.createReader();
  const entries = await readDataTransferDirectoryEntries(reader);
  const nextParentPath = `${parentPath}${entry.name}/`;
  const nestedFiles = await Promise.all(entries.map(child => readUploadedFilesFromEntry(child, nextParentPath)));
  return nestedFiles.flat();
}

async function readUploadedProjectFilesFromDataTransfer(dataTransfer: DataTransfer): Promise<UploadedProjectFile[]> {
  const items = Array.from(dataTransfer.items || []);
  const handles = (await Promise.all(items.map(getFileSystemHandleFromDataTransferItem))).filter(Boolean) as FileSystemHandle[];

  if (handles.length > 0) {
    const files = await Promise.all(handles.map(handle => readUploadedFilesFromFileSystemHandle(handle)));
    return files.flat().filter(file => file.path.trim());
  }

  const entries = items
    .map(item => {
      const getEntry = (item as any).webkitGetAsEntry;
      return typeof getEntry === 'function' ? getEntry.call(item) : null;
    })
    .filter(Boolean);

  if (entries.length > 0) {
    const files = await Promise.all(entries.map(entry => readUploadedFilesFromEntry(entry)));
    return files.flat().filter(file => file.path.trim());
  }

  return Promise.all(Array.from(dataTransfer.files || []).map(async file => ({
    path: ((file as any).webkitRelativePath || file.name) as string,
    content: await file.text(),
  })));
}

function isNpmPackageJsonRegistryRange(range: string) {
  return !/^(?:workspace:|file:|link:|portal:|git\+|https?:|github:|npm:)/i.test(range.trim());
}

function createPackageJsonDependencySpec(packageName: string, range: string) {
  const trimmedRange = range.trim() || 'latest';
  return trimmedRange === 'latest' ? packageName : `${packageName}@${trimmedRange}`;
}

function collectPackageJsonDependencySyncPlan(items: FSItem[]): PackageJsonDependencySyncPlan {
  const packageJsonFiles = items
    .filter((item): item is FSItem & { type: 'file' } => item.type === 'file' && item.name === 'package.json')
    .sort((left, right) => getFsItemPath(items, left.id).localeCompare(getFsItemPath(items, right.id)));
  const dependencySources = new Map<string, Map<string, string[]>>();
  const invalidFiles: PackageJsonDependencyIssue[] = [];
  const unsupportedDependencies: PackageJsonDependencyIssue[] = [];

  for (const file of packageJsonFiles) {
    const path = getFsItemPath(items, file.id);
    let parsed: unknown;
    try {
      parsed = JSON.parse(file.content || '{}');
    } catch (error) {
      invalidFiles.push({
        path,
        message: error instanceof Error ? error.message : 'Invalid JSON',
      });
      continue;
    }

    if (!isPlainRecord(parsed)) {
      invalidFiles.push({ path, message: 'package.json must contain a JSON object.' });
      continue;
    }

    for (const field of PACKAGE_JSON_DEPENDENCY_FIELDS) {
      const dependencies = parsed[field];
      if (dependencies == null) continue;
      if (!isPlainRecord(dependencies)) {
        invalidFiles.push({ path, message: `${field} must be a JSON object.` });
        continue;
      }

      for (const [rawPackageName, rawRange] of Object.entries(dependencies)) {
        if (typeof rawRange !== 'string') {
          invalidFiles.push({ path, message: `${field}.${rawPackageName} must be a string range.` });
          continue;
        }

        const packageName = rawPackageName.trim();
        const range = rawRange.trim() || 'latest';
        if (!isValidNpmPackageInstallSpec(packageName)) {
          invalidFiles.push({ path, message: `${field}.${rawPackageName} is not a valid npm package name.` });
          continue;
        }

        const source = `${path}:${field}`;
        const ranges = dependencySources.get(packageName) || new Map<string, string[]>();
        ranges.set(range, [...(ranges.get(range) || []), source]);
        dependencySources.set(packageName, ranges);

        if (!isNpmPackageJsonRegistryRange(range)) {
          unsupportedDependencies.push({
            path,
            message: `${field}.${packageName}@${range} is not supported by the browser npm registry installer.`,
          });
        }
      }
    }
  }

  const conflicts: PackageJsonDependencyConflict[] = [];
  const requirements: PackageJsonDependencyRequirement[] = [];
  for (const [packageName, ranges] of dependencySources) {
    if (ranges.size > 1) {
      conflicts.push({
        packageName,
        ranges: [...ranges.keys()].sort(),
        sources: [...ranges.values()].flat().sort(),
      });
      continue;
    }

    const [[range, sources]] = [...ranges.entries()];
    if (!isNpmPackageJsonRegistryRange(range)) continue;
    requirements.push({
      name: packageName,
      range,
      spec: createPackageJsonDependencySpec(packageName, range),
      sources: sources.sort(),
    });
  }

  requirements.sort((left, right) => left.name.localeCompare(right.name));
  conflicts.sort((left, right) => left.packageName.localeCompare(right.packageName));
  invalidFiles.sort((left, right) => left.path.localeCompare(right.path));
  unsupportedDependencies.sort((left, right) => `${left.path}:${left.message}`.localeCompare(`${right.path}:${right.message}`));

  const signature = JSON.stringify({
    packageJsonFiles: packageJsonFiles.map(file => [getFsItemPath(items, file.id), file.content || '']),
    requirements: requirements.map(requirement => [requirement.name, requirement.range]),
    conflicts,
    invalidFiles,
    unsupportedDependencies,
  });

  return {
    signature,
    packageJsonCount: packageJsonFiles.length,
    requirements,
    conflicts,
    invalidFiles,
    unsupportedDependencies,
  };
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
  language: ProjectRuntimeLanguage | null;
  includedFiles: FSItem[];
  entryCandidates: FSItem[];
  entryFile: FSItem | null;
  error: string | null;
}

interface ProjectSourceFile {
  id: string;
  name: string;
  path: string;
  content: string;
  language: ProjectFileLanguage;
}

interface RuntimeFileSnapshot {
  path: string;
  content: string;
}

type JavaScriptExecutionMode = 'classic-function' | 'async-function';
type RuntimeIOMode = 'alert-output' | 'interactive-output-panel';
type RuntimeLifecycle = 'dispose-after-run' | 'keep-warm';
type CSharpExecutionMode = 'regular' | 'script' | 'script-context';
type CxxCStandard = 'c11' | 'c17' | 'c23';
type CxxCppStandard = 'c++17' | 'c++20' | 'c++23';
type CxxOptimizationLevel = 'O0' | 'O1' | 'O2' | 'O3';
type JavaRuntimeVersion = 8 | 11 | 17;
type RuntimeInteractionKind = 'alert' | 'confirm' | 'prompt' | 'stdin';
type RuntimeInteractionLanguage = 'javascript' | 'python' | 'csharp' | 'c' | 'cpp' | 'java';
type ProjectRuntimeLanguage = 'javascript' | 'python' | 'html' | 'csharp' | 'c' | 'cpp' | 'java';
type ProjectFileLanguage = ProjectRuntimeLanguage | 'typescript' | 'css';
type ProjectRunEntryKind = ProjectRuntimeLanguage | 'typescript' | 'tsx' | 'unknown';

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
  pythonRuntimeLifecycle: RuntimeLifecycle;
  pythonIOMode: RuntimeIOMode;
  csharpExecutionTimeoutMs: number;
  csharpOmniSharpSource: CSharpOmniSharpSource;
  csharpIdeDebugMode: boolean;
  csharpExecutionMode: CSharpExecutionMode;
  csharpResetScriptContextBeforeRun: boolean;
  csharpIOMode: RuntimeIOMode;
  cxxExecutionTimeoutMs: number;
  cxxRuntimeLifecycle: RuntimeLifecycle;
  cxxIOMode: RuntimeIOMode;
  cxxCStandard: CxxCStandard;
  cxxCppStandard: CxxCppStandard;
  cxxOptimizationLevel: CxxOptimizationLevel;
  javaExecutionTimeoutMs: number;
  javaRuntimeLifecycle: RuntimeLifecycle;
  javaIOMode: RuntimeIOMode;
  javaRuntimeVersion: JavaRuntimeVersion;
  projectRunEntryFileId: string | null;
  assistantProvider: AssistantProvider;
  assistantModel: string;
  assistantApiKey: string;
  assistantUseChainOfThought: boolean;
  assistantShowUsagePopup: boolean;
  assistantMaxChainOfThoughtDepth: number;
  assistantRequestRateLimitPerMinute: number;
  autoDocumentationModel: string;
  autoDocumentationEntryPoint: string;
  autoDocumentationPromptTokenLimit: number;
  docsFindTypeMatchCount: number;
  docsFindMemberMatchCount: number;
  docsFindIncludeAccessorDocs: boolean;
}

type AssistantDocumentationLookupByChatId = Record<string, boolean>;

const loadSavedAssistantChats = (): AssistantChat[] => {
  const saved = localStorage.getItem(getProjectStorageKey(STORAGE_KEYS.assistantChats));
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
  const saved = localStorage.getItem(getProjectStorageKey(STORAGE_KEYS.layout));
  if (!saved) return INITIAL_LAYOUT;
  try {
    const parsed = JSON.parse(saved);
    if (parsed && parsed.layout) return ensureSourceControlLayoutTab(parsed as IJsonModel);
    return INITIAL_LAYOUT;
  } catch {
    return INITIAL_LAYOUT;
  }
};

function ensureSourceControlLayoutTab(model: IJsonModel): IJsonModel {
  let hasSourceControl = false;
  let explorerTabset: any = null;
  const visit = (node: any) => {
    if (node?.type === 'tab' && node.component === 'sourceControl') hasSourceControl = true;
    if (
      node?.type === 'tabset'
      && Array.isArray(node.children)
      && node.children.some((child: any) => child?.type === 'tab' && child.component === 'explorer')
    ) {
      explorerTabset = node;
    }
    for (const child of node?.children || []) visit(child);
  };
  visit((model as any).layout);
  if (hasSourceControl || !explorerTabset) return model;
  const explorerIndex = explorerTabset.children.findIndex((child: any) => child?.type === 'tab' && child.component === 'explorer');
  explorerTabset.children.splice(Math.max(0, explorerIndex + 1), 0, {
    type: "tab",
    id: "source-control-panel-tab",
    name: "Source Control",
    component: "sourceControl",
    enableClose: false,
  });
  return model;
}

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
  csharpOmniSharpSource: 'local',
  csharpIdeDebugMode: false,
  csharpExecutionMode: 'regular',
  csharpResetScriptContextBeforeRun: false,
  csharpIOMode: 'alert-output',
  cxxExecutionTimeoutMs: 0,
  cxxRuntimeLifecycle: 'keep-warm',
  cxxIOMode: 'alert-output',
  cxxCStandard: 'c17',
  cxxCppStandard: 'c++20',
  cxxOptimizationLevel: 'O2',
  javaExecutionTimeoutMs: 0,
  javaRuntimeLifecycle: 'keep-warm',
  javaIOMode: 'alert-output',
  javaRuntimeVersion: 17,
  projectRunEntryFileId: null,
  assistantProvider: 'gemini',
  assistantModel: getAssistantDefaultModel('gemini'),
  assistantApiKey: '',
  assistantUseChainOfThought: false,
  assistantShowUsagePopup: true,
  assistantMaxChainOfThoughtDepth: DEFAULT_ASSISTANT_TOOL_PASSES,
  assistantRequestRateLimitPerMinute: DEFAULT_ASSISTANT_REQUEST_RATE_LIMIT_PER_MINUTE,
  autoDocumentationModel: getAssistantDefaultModel('gemini'),
  autoDocumentationEntryPoint: 'Program',
  autoDocumentationPromptTokenLimit: DEFAULT_AUTO_DOCUMENTATION_PROMPT_TOKEN_LIMIT,
  docsFindTypeMatchCount: DEFAULT_DOCS_FIND_TYPE_MATCH_COUNT,
  docsFindMemberMatchCount: DEFAULT_DOCS_FIND_MEMBER_MATCH_COUNT,
  docsFindIncludeAccessorDocs: true,
};

const LEGACY_CSHARP_AUTHORING_SOURCE_KEY = 'csharp' + 'Intelli' + 'SageSource';

const CXX_RUNTIME_IDLE_TIMEOUT = 60_000;
const JAVA_RUNTIME_IDLE_TIMEOUT = 60_000;

function normalizeProjectFileLanguage(language?: string): ProjectFileLanguage | null {
  switch ((language || '').toLowerCase()) {
    case 'javascript':
    case 'js':
      return 'javascript';
    case 'typescript':
    case 'ts':
    case 'tsx':
      return 'typescript';
    case 'python':
    case 'py':
      return 'python';
    case 'html':
      return 'html';
    case 'css':
      return 'css';
    case 'csharp':
    case 'cs':
      return 'csharp';
    case 'java':
      return 'java';
    case 'c':
      return 'c';
    case 'cpp':
    case 'c++':
      return 'cpp';
    default:
      return null;
  }
}

function normalizeProjectRuntimeLanguage(language?: string): ProjectRuntimeLanguage | null {
  const normalized = normalizeProjectFileLanguage(language);
  if (normalized === 'typescript') return 'javascript';
  return normalized && normalized !== 'css' ? normalized : null;
}

function getProjectFilePathForRuntime(file: Pick<ProjectSourceFile, 'path' | 'language'> | (Pick<FSItem, 'name' | 'language'> & { path?: string })) {
  return 'path' in file && file.path ? file.path : 'name' in file ? file.name : '';
}

function getProjectFileLanguageForRuntime(file: Pick<ProjectSourceFile, 'path' | 'language'> | (Pick<FSItem, 'name' | 'language'> & { path?: string })) {
  const directLanguage = normalizeProjectFileLanguage(file.language);
  if (directLanguage) return directLanguage;

  const path = getProjectFilePathForRuntime(file);
  const filename = path.split('/').pop() || path;
  return normalizeProjectFileLanguage(langFromFilename(filename));
}

function getProjectRuntimeLanguageForFile(file: Pick<ProjectSourceFile, 'path' | 'language'> | (Pick<FSItem, 'name' | 'language'> & { path?: string })) {
  const language = getProjectFileLanguageForRuntime(file);
  if (language === 'typescript') return 'javascript';
  return language && language !== 'css' ? language : null;
}

function getProjectRuntimeLanguageLabel(language: ProjectFileLanguage | null) {
  switch (language) {
    case 'javascript':
      return 'JavaScript';
    case 'typescript':
      return 'TypeScript';
    case 'python':
      return 'Python';
    case 'html':
      return 'HTML';
    case 'css':
      return 'CSS';
    case 'csharp':
      return 'C#';
    case 'c':
      return 'C';
    case 'cpp':
      return 'C++';
    case 'java':
      return 'Java';
    default:
      return 'Unknown';
  }
}

function isCxxRuntimeLanguage(language: ProjectRuntimeLanguage | ProjectFileLanguage | null | undefined): language is 'c' | 'cpp' {
  return language === 'c' || language === 'cpp';
}

function isCSourcePath(path: string) {
  return /\.c$/i.test(path);
}

function isCppSourcePath(path: string) {
  return /\.(?:cpp|cc|cxx|c\+\+)$/i.test(path);
}

function isCxxSourcePath(path: string) {
  return isCSourcePath(path) || isCppSourcePath(path);
}

function isCxxHeaderPath(path: string) {
  return /\.(?:h|hh|hpp|hxx|ipp|tpp)$/i.test(path);
}

function isCxxProjectFile(file: FSItem | ProjectSourceFile) {
  const language = getProjectFileLanguageForRuntime(file);
  const path = 'path' in file ? file.path : file.name;
  return isCxxRuntimeLanguage(language) && (isCxxSourcePath(path) || isCxxHeaderPath(path));
}

function getCxxResolvedRuntimeLanguage(files: FSItem[]) {
  const hasCpp = files.some(file => {
    const language = getProjectFileLanguageForRuntime(file);
    const path = file.name || '';
    return language === 'cpp' || isCppSourcePath(path);
  });
  return hasCpp ? 'cpp' : 'c';
}

function isProjectRunEntryCandidate(file: FSItem & { type: 'file' }) {
  const entryKind = getProjectRunEntryKind(file);
  if (entryKind === 'html' || entryKind === 'tsx' || entryKind === 'javascript' || entryKind === 'typescript') {
    return true;
  }

  const runtimeLanguage = getProjectRuntimeLanguageForFile(file);
  if (runtimeLanguage === 'c') return isCSourcePath(file.name);
  if (runtimeLanguage === 'cpp') return isCxxSourcePath(file.name);
  return runtimeLanguage === 'python' || runtimeLanguage === 'csharp' || runtimeLanguage === 'java';
}

function getProjectRunFilesForEntry(entryFile: FSItem & { type: 'file' }, runnableFiles: (FSItem & { type: 'file' })[]) {
  const entryKind = getProjectRunEntryKind(entryFile);
  if (entryKind === 'html' || entryKind === 'tsx') {
    return runnableFiles.filter(isHtmlTsxProjectRunCompatibleFile);
  }
  if (entryKind === 'javascript' || entryKind === 'typescript') {
    return runnableFiles.filter(isJavaScriptOrPlainTypeScriptProjectFile);
  }

  const runtimeLanguage = getProjectRuntimeLanguageForFile(entryFile);
  if (runtimeLanguage === 'c') {
    return runnableFiles.filter(file => getProjectFileLanguageForRuntime(file) === 'c' && isCxxProjectFile(file));
  }
  if (runtimeLanguage === 'cpp') {
    return runnableFiles.filter(isCxxProjectFile);
  }
  if (!runtimeLanguage) {
    return [];
  }
  return runnableFiles.filter(file => getProjectRuntimeLanguageForFile(file) === runtimeLanguage);
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

const CODECRAFT_MONACO_PROJECT_ROOT = '/codecraft-project';
const CODECRAFT_RUNTIME_PROJECT_ROOT = '__codecraft_project__';

function encodeProjectPathForSpecifier(path: string) {
  return normalizeProjectPath(path)
    .split('/')
    .map(part => encodeURIComponent(part))
    .join('/');
}

function getMonacoProjectModelUri(path: string) {
  return monaco.Uri.file(`${CODECRAFT_MONACO_PROJECT_ROOT}/${normalizeProjectPath(path)}`);
}

function getMonacoProjectModelPath(path: string) {
  return getMonacoProjectModelUri(path).toString();
}

function getProjectPathFromMonacoUri(uri: monaco.Uri) {
  const uriPath = decodeURIComponent(uri.path || '');
  const projectMarker = `${CODECRAFT_MONACO_PROJECT_ROOT}/`;
  const projectIndex = uriPath.indexOf(projectMarker);
  return projectIndex >= 0
    ? normalizeProjectPath(uriPath.slice(projectIndex + projectMarker.length))
    : '';
}

function isMonacoRangeLike(value: unknown): value is monaco.IRange {
  const candidate = value as Partial<monaco.IRange> | null;
  return typeof candidate?.startLineNumber === 'number'
    && typeof candidate.startColumn === 'number'
    && typeof candidate.endLineNumber === 'number'
    && typeof candidate.endColumn === 'number';
}

function isMonacoPositionLike(value: unknown): value is monaco.IPosition {
  const candidate = value as Partial<monaco.IPosition> | null;
  return typeof candidate?.lineNumber === 'number'
    && typeof candidate.column === 'number';
}

function getRuntimeProjectModuleSpecifier(path: string) {
  return `${CODECRAFT_RUNTIME_PROJECT_ROOT}/${encodeProjectPathForSpecifier(path)}`;
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

function isExternalProjectResourceSpecifier(specifier: string): boolean {
  const trimmed = specifier.trim();
  return /^(?:[a-z][a-z0-9+.-]*:|\/\/|#)/i.test(trimmed);
}

function stripProjectResourceSuffix(specifier: string): string {
  const suffixIndex = specifier.search(/[?#]/);
  return suffixIndex >= 0 ? specifier.slice(0, suffixIndex) : specifier;
}

function escapeHtml(value: string) {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function escapeHtmlRawTextElement(value: string) {
  return value.replace(/<\/(script|style)/gi, '<\\/$1');
}

function getOutputPreviewBrowserApiShimSource() {
  return `
(() => {
  const createMemoryStorage = () => {
    const store = new Map();
    return {
      get length() {
        return store.size;
      },
      key(index) {
        const key = Array.from(store.keys())[Number(index)];
        return key === undefined ? null : key;
      },
      getItem(key) {
        key = String(key);
        return store.has(key) ? store.get(key) : null;
      },
      setItem(key, value) {
        store.set(String(key), String(value));
      },
      removeItem(key) {
        store.delete(String(key));
      },
      clear() {
        store.clear();
      },
    };
  };

  const isUsableStorage = (storageName) => {
    try {
      const storage = globalThis[storageName];
      const probeKey = '__codecraft_storage_probe__';
      storage.setItem(probeKey, '1');
      storage.removeItem(probeKey);
      return true;
    } catch {
      return false;
    }
  };

  const installStorage = (storageName) => {
    if (isUsableStorage(storageName)) return;
    const storage = createMemoryStorage();
    try {
      Object.defineProperty(globalThis, storageName, {
        configurable: true,
        enumerable: true,
        value: storage,
      });
    } catch {
      try {
        globalThis[storageName] = storage;
      } catch {}
    }
  };

  installStorage('localStorage');
  installStorage('sessionStorage');
})();
`;
}

function getOutputPreviewBrowserApiShimScriptTag() {
  return `<script>${escapeHtmlRawTextElement(getOutputPreviewBrowserApiShimSource())}</script>`;
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

function containsJavaScriptModuleSyntax(source: string): boolean {
  return (
    /\bimport\s+(?:[\s\S]*?\sfrom\s*['"]|['"][^'"]+['"])/m.test(source)
    || /\bexport\s+(?:\{|default\b|const\b|let\b|var\b|function\b|class\b|\*)/m.test(source)
  );
}

function isJavaScriptRuntimeProjectFile(file: Pick<ProjectSourceFile, 'path' | 'language'> | (Pick<FSItem, 'name' | 'language'> & { path?: string })) {
  return getProjectRuntimeLanguageForFile(file) === 'javascript';
}

function isHtmlProjectFile(file: Pick<ProjectSourceFile, 'path' | 'language'> | (Pick<FSItem, 'name' | 'language'> & { path?: string })) {
  return getProjectFileLanguageForRuntime(file) === 'html' || /\.(?:html|htm)$/i.test(getProjectFilePathForRuntime(file));
}

function isTsxProjectPath(path: string) {
  return /\.tsx$/i.test(path);
}

function isTsxProjectFile(file: Pick<ProjectSourceFile, 'path' | 'language'> | (Pick<FSItem, 'name' | 'language'> & { path?: string })) {
  return isTsxProjectPath(getProjectFilePathForRuntime(file));
}

function isTypeScriptProjectPath(path: string) {
  return /\.(?:ts|tsx|mts|cts)$/i.test(path);
}

function isTypeScriptProjectFile(file: Pick<ProjectSourceFile, 'path' | 'language'> | (Pick<FSItem, 'name' | 'language'> & { path?: string })) {
  const path = getProjectFilePathForRuntime(file);
  return getProjectFileLanguageForRuntime(file) === 'typescript' || isTypeScriptProjectPath(path);
}

function isJavaScriptOrPlainTypeScriptProjectFile(file: Pick<ProjectSourceFile, 'path' | 'language'> | (Pick<FSItem, 'name' | 'language'> & { path?: string })) {
  const language = getProjectFileLanguageForRuntime(file);
  return language === 'javascript' || language === 'typescript' && !isTsxProjectFile(file);
}

function isHtmlTsxProjectRunCompatibleFile(file: Pick<ProjectSourceFile, 'path' | 'language'> | (Pick<FSItem, 'name' | 'language'> & { path?: string })) {
  const language = getProjectFileLanguageForRuntime(file);
  return language === 'html' || language === 'css' || language === 'javascript' || language === 'typescript';
}

function isCssProjectFile(file: Pick<ProjectSourceFile, 'path' | 'language'> | (Pick<FSItem, 'name' | 'language'> & { path?: string })) {
  return getProjectFileLanguageForRuntime(file) === 'css' || /\.css$/i.test(getProjectFilePathForRuntime(file));
}

function getProjectRunEntryKind(file: Pick<ProjectSourceFile, 'path' | 'language'> | (Pick<FSItem, 'name' | 'language'> & { path?: string })): ProjectRunEntryKind {
  if (isHtmlProjectFile(file)) return 'html';
  if (isTsxProjectFile(file)) return 'tsx';

  const fileLanguage = getProjectFileLanguageForRuntime(file);
  if (fileLanguage === 'typescript') return 'typescript';

  return getProjectRuntimeLanguageForFile(file) ?? 'unknown';
}

function getTypeScriptRuntimeCompilerOptions(tsModule: TypeScriptModule): TypeScript.CompilerOptions {
  return {
    target: tsModule.ScriptTarget.ES2022,
    module: tsModule.ModuleKind.ESNext,
    jsx: tsModule.JsxEmit.ReactJSX,
    jsxImportSource: 'react',
    useDefineForClassFields: false,
    esModuleInterop: true,
    allowSyntheticDefaultImports: true,
    allowJs: true,
    allowImportingTsExtensions: true,
    isolatedModules: true,
  };
}

function formatTypeScriptDiagnostic(tsModule: TypeScriptModule, diagnostic: TypeScript.Diagnostic) {
  const message = tsModule.flattenDiagnosticMessageText(diagnostic.messageText, '\n');
  if (diagnostic.file && typeof diagnostic.start === 'number') {
    const position = diagnostic.file.getLineAndCharacterOfPosition(diagnostic.start);
    return `${diagnostic.file.fileName}:${position.line + 1}:${position.character + 1} - ${message}`;
  }
  return message;
}

function getTypeScriptJsxRuntimeSource() {
  return `
const __codecraftAppendChild = (parent, child) => {
  if (child == null || child === false || child === true) return;
  if (Array.isArray(child)) {
    child.forEach((item) => __codecraftAppendChild(parent, item));
    return;
  }
  if (typeof Node !== 'undefined' && child instanceof Node) {
    parent.appendChild(child);
    return;
  }
  parent.appendChild(document.createTextNode(String(child)));
};
const __codecraftCreateElement = (type, props, ...children) => {
  props = props || {};
  if (typeof type === 'function') {
    return type({ ...props, children });
  }
  if (type === globalThis.React?.Fragment) {
    if (typeof document === 'undefined') return children;
    const fragment = document.createDocumentFragment();
    children.forEach((child) => __codecraftAppendChild(fragment, child));
    return fragment;
  }
  if (typeof document === 'undefined') {
    return { type, props, children };
  }
  const element = document.createElement(String(type));
  for (const [key, value] of Object.entries(props)) {
    if (key === 'children' || value == null || value === false) continue;
    if (key === 'className') {
      element.setAttribute('class', String(value));
    } else if (key === 'style' && value && typeof value === 'object') {
      Object.assign(element.style, value);
    } else if (/^on[A-Z]/.test(key) && typeof value === 'function') {
      element.addEventListener(key.slice(2).toLowerCase(), value);
    } else if (value === true) {
      element.setAttribute(key, '');
    } else {
      element.setAttribute(key, String(value));
    }
  }
  children.forEach((child) => __codecraftAppendChild(element, child));
  return element;
};
const __codecraftCreateJsxElement = (type, props, key) => {
  const normalizedProps = { ...(props || {}) };
  if (key !== undefined) {
    normalizedProps.key = key;
  }
  const { children, ...elementProps } = normalizedProps;
  const childList = children === undefined
    ? []
    : Array.isArray(children)
      ? children
      : [children];
  return __codecraftCreateElement(type, elementProps, ...childList);
};
const __codecraftHookState = globalThis.__codecraftHookState || [];
globalThis.__codecraftHookState = __codecraftHookState;
let __codecraftHookCursor = 0;
const __codecraftResetHooks = () => {
  __codecraftHookCursor = 0;
};
const __codecraftUseState = (initialValue) => {
  const stateIndex = __codecraftHookCursor++;
  if (!(stateIndex in __codecraftHookState)) {
    __codecraftHookState[stateIndex] = typeof initialValue === 'function' ? initialValue() : initialValue;
  }
  const setState = (nextValue) => {
    const previousValue = __codecraftHookState[stateIndex];
    __codecraftHookState[stateIndex] = typeof nextValue === 'function' ? nextValue(previousValue) : nextValue;
    if (typeof globalThis.__codecraftRerender === 'function') {
      globalThis.__codecraftRerender();
    }
  };
  return [__codecraftHookState[stateIndex], setState];
};
const __codecraftUseReducer = (reducer, initialValue) => {
  const [state, setState] = __codecraftUseState(initialValue);
  return [state, (action) => setState((current) => reducer(current, action))];
};
const __codecraftUseRef = (initialValue) => {
  const [ref] = __codecraftUseState({ current: initialValue });
  return ref;
};
const __codecraftUseEffect = (effect) => {
  queueMicrotask(() => {
    const cleanup = effect?.();
    if (typeof cleanup === 'function') {
      globalThis.addEventListener?.('beforeunload', cleanup, { once: true });
    }
  });
};
let __codecraftIdCounter = 0;
const __codecraftRender = (node, container) => {
  if (!container) return;
  const renderOnce = () => {
    __codecraftResetHooks();
    container.textContent = '';
    const resolvedNode = typeof node === 'function'
      ? __codecraftCreateElement(node, null)
      : node;
    __codecraftAppendChild(container, resolvedNode);
  };
  globalThis.__codecraftRerender = renderOnce;
  renderOnce();
};
globalThis.React = globalThis.React || {
  Fragment: Symbol.for('codecraft.react.fragment'),
  createElement: __codecraftCreateElement,
  useState: __codecraftUseState,
  useReducer: __codecraftUseReducer,
  useEffect: __codecraftUseEffect,
  useLayoutEffect: __codecraftUseEffect,
  useMemo: (factory) => factory(),
  useCallback: (callback) => callback,
  useRef: __codecraftUseRef,
  useId: () => \`codecraft-\${++__codecraftIdCounter}\`,
};
globalThis.ReactDOM = globalThis.ReactDOM || {
  render: __codecraftRender,
  createRoot: (container) => ({
    render: (node) => __codecraftRender(node, container),
    unmount: () => {
      if (container) container.textContent = '';
    },
  }),
};
globalThis.__codecraftJsx = globalThis.__codecraftJsx || __codecraftCreateJsxElement;
globalThis.__codecraftJsxDEV = globalThis.__codecraftJsxDEV || ((type, props, key) => __codecraftCreateJsxElement(type, props, key));
`;
}

function getTypeScriptReactShimModuleSource() {
  return `${getTypeScriptJsxRuntimeSource()}
const React = globalThis.React;
export const Fragment = React.Fragment;
export const createElement = React.createElement;
export const useState = React.useState;
export const useReducer = React.useReducer;
export const useEffect = React.useEffect;
export const useLayoutEffect = React.useLayoutEffect;
export const useMemo = React.useMemo;
export const useCallback = React.useCallback;
export const useRef = React.useRef;
export const useId = React.useId;
export default React;
`;
}

function getTypeScriptJsxRuntimeShimModuleSource() {
  return `${getTypeScriptJsxRuntimeSource()}
export const Fragment = globalThis.React.Fragment;
export const jsx = globalThis.__codecraftJsx;
export const jsxs = globalThis.__codecraftJsx;
export const jsxDEV = globalThis.__codecraftJsxDEV;
`;
}

function getTypeScriptReactDomShimModuleSource() {
  return `${getTypeScriptJsxRuntimeSource()}
const ReactDOM = globalThis.ReactDOM;
export const createRoot = ReactDOM.createRoot;
export const render = ReactDOM.render;
export default ReactDOM;
`;
}

function createJavaScriptDataUrl(source: string) {
  return `data:text/javascript;charset=utf-8,${encodeURIComponent(source)}`;
}

function getJavaScriptStyleRuntimeIdentifier(path: string) {
  let hash = 0;
  for (const char of normalizeProjectPath(path)) {
    hash = (Math.imul(hash, 31) + char.charCodeAt(0)) | 0;
  }
  return `__codecraft_css_${Math.abs(hash).toString(36)}`;
}

function createJavaScriptStyleRuntimeSource(file: ProjectSourceFile, moduleIdentifier: string) {
  return `
const ${moduleIdentifier} = (() => {
const cssPath = ${JSON.stringify(normalizeProjectPath(file.path))};
const cssText = ${JSON.stringify(file.content)};
if (typeof document !== 'undefined') {
  const existing = Array.from(document.querySelectorAll('style[data-codecraft-css]'))
    .find(style => style.getAttribute('data-codecraft-css') === cssPath);
  if (!existing) {
    const style = document.createElement('style');
    style.setAttribute('data-codecraft-css', cssPath);
    style.setAttribute('data-codecraft-source', 'import');
    style.textContent = "\\n/* " + cssPath + " */\\n" + cssText + "\\n";
    document.head.appendChild(style);
  }
}
const classes = new Proxy({}, {
  get(_target, key) {
    return typeof key === 'string' ? key : undefined;
  },
});
return classes;
})();`;
}

function createJavaScriptStyleModuleSource(file: ProjectSourceFile) {
  const moduleIdentifier = getJavaScriptStyleRuntimeIdentifier(file.path);
  return `${createJavaScriptStyleRuntimeSource(file, moduleIdentifier)}
const classes = ${moduleIdentifier};
export default classes;
//# sourceURL=codecraft://${normalizeProjectPath(file.path).replace(/\s/g, '%20')}.js`;
}

async function getJavaScriptRuntimeImportMapImports(): Promise<Record<string, string>> {
  const reactUrl = createJavaScriptDataUrl(getTypeScriptReactShimModuleSource());
  const reactDomUrl = createJavaScriptDataUrl(getTypeScriptReactDomShimModuleSource());
  const jsxRuntimeUrl = createJavaScriptDataUrl(getTypeScriptJsxRuntimeShimModuleSource());
  const imports: Record<string, string> = {
    react: reactUrl,
    'react-dom': reactDomUrl,
    'react-dom/client': reactDomUrl,
    'react/jsx-runtime': jsxRuntimeUrl,
    'react/jsx-dev-runtime': jsxRuntimeUrl,
  };

  for (const moduleInfo of loadSavedJavaScriptIncludedModules()) {
    imports[moduleInfo.name] = moduleInfo.url;
    imports[`${moduleInfo.name}/`] = moduleInfo.url.endsWith('/')
      ? moduleInfo.url
      : `${moduleInfo.url}/`;
  }

  const installedPackages = loadSavedNpmInstalledPackages();
  const storedPackages = (await Promise.all(
    installedPackages.map(packageInfo => loadStoredNpmPackage(packageInfo.name, packageInfo.version).catch(() => null))
  )).filter((packageInfo): packageInfo is StoredNpmPackage => packageInfo !== null);

  for (const packageInfo of storedPackages) {
    const aliases = collectNpmPackageExportAliases(packageInfo);
    const runtimeFiles = Object.keys(packageInfo.files).filter(isRuntimeExposedNpmPackagePath);
    const urlByPath = new Map<string, string>();

    for (const path of runtimeFiles) {
      const url = createJavaScriptDataUrl(createNpmPackageRuntimeModuleSource(packageInfo, path));
      urlByPath.set(path, url);
      imports[getNpmPackageInternalSpecifier(packageInfo, path)] = url;
    }

    for (const [specifier, path] of aliases) {
      const url = urlByPath.get(path);
      if (url) imports[specifier] = url;
    }
  }

  return imports;
}

const CODECRAFT_REACT_TYPE_DECLARATIONS = `
declare namespace React {
  type ReactNode = any;
  type Key = string | number;
  type CSSProperties = Record<string, string | number | undefined>;
  type Dispatch<A> = (value: A) => void;
  type SetStateAction<S> = S | ((previousState: S) => S);
  interface MutableRefObject<T> { current: T; }
  interface RefObject<T> { current: T | null; }
  interface FunctionComponent<P = {}> {
    (props: P & { children?: ReactNode }): ReactNode;
  }
  type FC<P = {}> = FunctionComponent<P>;
  type ComponentType<P = {}> = FunctionComponent<P>;
  type PropsWithChildren<P = {}> = P & { children?: ReactNode };
  namespace JSX {
    type Element = any;
    interface ElementClass { render: any; }
    interface ElementChildrenAttribute { children: {}; }
    interface IntrinsicAttributes { key?: Key; }
    interface IntrinsicElements { [elementName: string]: any; }
  }
}

declare namespace JSX {
  type Element = any;
  interface ElementClass { render: any; }
  interface ElementChildrenAttribute { children: {}; }
  interface IntrinsicAttributes { key?: React.Key; }
  interface IntrinsicElements { [elementName: string]: any; }
}

declare module 'react' {
  export type ReactNode = React.ReactNode;
  export type Key = React.Key;
  export type CSSProperties = React.CSSProperties;
  export type Dispatch<A> = React.Dispatch<A>;
  export type SetStateAction<S> = React.SetStateAction<S>;
  export type MutableRefObject<T> = React.MutableRefObject<T>;
  export type RefObject<T> = React.RefObject<T>;
  export type FunctionComponent<P = {}> = React.FunctionComponent<P>;
  export type FC<P = {}> = React.FC<P>;
  export type ComponentType<P = {}> = React.ComponentType<P>;
  export type PropsWithChildren<P = {}> = React.PropsWithChildren<P>;
  export const Fragment: any;
  export function createElement(type: any, props?: any, ...children: any[]): any;
  export function useState<S>(initialState: S | (() => S)): [S, (value: S | ((previousState: S) => S)) => void];
  export function useReducer<R extends (state: any, action: any) => any, S>(reducer: R, initialState: S): [S, (action: Parameters<R>[1]) => void];
  export function useEffect(effect: () => void | (() => void), deps?: readonly unknown[]): void;
  export function useLayoutEffect(effect: () => void | (() => void), deps?: readonly unknown[]): void;
  export function useMemo<T>(factory: () => T, deps?: readonly unknown[]): T;
  export function useCallback<T extends (...args: any[]) => any>(callback: T, deps?: readonly unknown[]): T;
  export function useRef<T>(initialValue: T): React.MutableRefObject<T>;
  export function useId(): string;
  const ReactDefault: {
    Fragment: typeof Fragment;
    createElement: typeof createElement;
    useState: typeof useState;
    useReducer: typeof useReducer;
    useEffect: typeof useEffect;
    useLayoutEffect: typeof useLayoutEffect;
    useMemo: typeof useMemo;
    useCallback: typeof useCallback;
    useRef: typeof useRef;
    useId: typeof useId;
  };
  export default ReactDefault;
}

declare module 'react/jsx-runtime' {
  export const Fragment: any;
  export function jsx(type: any, props: any, key?: React.Key): any;
  export function jsxs(type: any, props: any, key?: React.Key): any;
}

declare module 'react/jsx-dev-runtime' {
  export const Fragment: any;
  export function jsxDEV(type: any, props: any, key?: React.Key): any;
}

declare module 'react-dom' {
  export function render(node: any, container: Element | DocumentFragment | null): void;
  const ReactDOMDefault: { render: typeof render };
  export default ReactDOMDefault;
}

declare module 'react-dom/client' {
  export interface Root {
    render(node: any): void;
    unmount(): void;
  }
  export function createRoot(container: Element | DocumentFragment): Root;
}

declare module '*.css' {
  const classes: Record<string, string>;
  export default classes;
}
`;

let codecraftTypeScriptDefaultsConfigured = false;

function getJavaScriptIncludedModuleTypeDeclarations() {
  const declarations = loadSavedJavaScriptIncludedModules()
    .map(moduleInfo => {
      const escapedName = moduleInfo.name.replace(/\\/g, '\\\\').replace(/'/g, "\\'");
      return `declare module '${escapedName}';\ndeclare module '${escapedName}/*';`;
    });
  declarations.push(
    ...loadSavedNpmInstalledPackages().map(packageInfo => {
      const escapedName = packageInfo.name.replace(/\\/g, '\\\\').replace(/'/g, "\\'");
      return `declare module '${escapedName}';\ndeclare module '${escapedName}/*';`;
    })
  );

  return declarations.length > 0
    ? `\n${declarations.join('\n')}\n`
    : '';
}

function refreshCodeCraftTypeScriptExtraLibs() {
  const extraLibs = [
    {
      content: `${CODECRAFT_REACT_TYPE_DECLARATIONS}${getJavaScriptIncludedModuleTypeDeclarations()}`,
      filePath: 'file:///node_modules/@types/codecraft-runtime/index.d.ts',
    },
  ];

  const ts = monaco.languages.typescript;
  ts.typescriptDefaults.setExtraLibs(extraLibs);
  ts.javascriptDefaults.setExtraLibs(extraLibs);
}

function configureCodeCraftTypeScriptDefaults() {
  const ts = monaco.languages.typescript;
  if (codecraftTypeScriptDefaultsConfigured) {
    refreshCodeCraftTypeScriptExtraLibs();
    return;
  }
  codecraftTypeScriptDefaultsConfigured = true;

  const compilerOptions = {
    target: ts.ScriptTarget.ES2020,
    module: ts.ModuleKind.ESNext,
    moduleResolution: ts.ModuleResolutionKind.NodeJs,
    jsx: ts.JsxEmit.ReactJSX,
    jsxImportSource: 'react',
    allowJs: true,
    checkJs: false,
    allowNonTsExtensions: true,
    allowSyntheticDefaultImports: true,
    esModuleInterop: true,
    allowImportingTsExtensions: true,
    noEmit: true,
  } as monaco.languages.typescript.CompilerOptions;

  ts.typescriptDefaults.setCompilerOptions(compilerOptions);
  ts.javascriptDefaults.setCompilerOptions(compilerOptions);
  ts.typescriptDefaults.setDiagnosticsOptions({
    noSemanticValidation: false,
    noSyntaxValidation: false,
  });
  ts.javascriptDefaults.setDiagnosticsOptions({
    noSemanticValidation: false,
    noSyntaxValidation: false,
  });

  refreshCodeCraftTypeScriptExtraLibs();
}

async function transpileTypeScriptProjectFile(file: ProjectSourceFile) {
  if (!isTypeScriptProjectFile(file)) {
    return file.content;
  }

  const tsModule = await loadTypeScriptModule();
  const output = tsModule.transpileModule(file.content, {
    fileName: file.path,
    compilerOptions: getTypeScriptRuntimeCompilerOptions(tsModule),
    reportDiagnostics: true,
  });

  const diagnostics = (output.diagnostics ?? []).filter(diagnostic => diagnostic.category === tsModule.DiagnosticCategory.Error);
  if (diagnostics.length > 0) {
    throw new Error(`TypeScript compile failed:\n${diagnostics.map(diagnostic => formatTypeScriptDiagnostic(tsModule, diagnostic)).join('\n')}`);
  }

  return `${getTypeScriptJsxRuntimeSource()}\n${output.outputText}\n//# sourceURL=codecraft://${file.path.replace(/\s/g, '%20')}.js`;
}

function resolveProjectScriptPath(fromPath: string, specifier: string, availablePaths: Set<string>) {
  const basePath = resolveProjectRelativePath(fromPath, stripProjectResourceSuffix(specifier));
  const hasKnownExtension = /\.[cm]?[jt]sx?$/i.test(basePath);
  const candidates = hasKnownExtension
    ? [basePath]
    : [
      basePath,
      `${basePath}.ts`,
      `${basePath}.tsx`,
      `${basePath}.js`,
      `${basePath}.jsx`,
      `${basePath}.mjs`,
      `${basePath}.cjs`,
      `${basePath}/index.ts`,
      `${basePath}/index.tsx`,
      `${basePath}/index.js`,
      `${basePath}/index.jsx`,
    ];

  return candidates.find(path => availablePaths.has(path)) ?? '';
}

function resolveProjectStylePath(fromPath: string, specifier: string, availablePaths: Set<string>) {
  const basePath = resolveProjectRelativePath(fromPath, stripProjectResourceSuffix(specifier));
  const hasKnownExtension = /\.css$/i.test(basePath);
  const candidates = hasKnownExtension
    ? [basePath]
    : [
      basePath,
      `${basePath}.css`,
      `${basePath}/index.css`,
    ];

  return candidates.find(path => availablePaths.has(path)) ?? '';
}

function isValidJavaScriptIdentifier(value: string) {
  return /^[A-Za-z_$][\w$]*$/.test(value);
}

function getJavaScriptStyleImportBindings(fullMatch: string, moduleIdentifier: string) {
  const importClauseMatch = fullMatch.match(/\bimport\s+([\s\S]*?)\s+from\s*(['"])/);
  if (!importClauseMatch) return '';

  const statements: string[] = [];
  let clause = importClauseMatch[1].replace(/^type\s+/, '').trim();
  const parseNamedBindings = (namedClause: string) => {
    const inner = namedClause.replace(/^\{/, '').replace(/\}$/, '');
    for (const rawPart of inner.split(',')) {
      const part = rawPart.trim().replace(/^type\s+/, '');
      if (!part) continue;
      const pieces = part.split(/\s+as\s+/i).map(piece => piece.trim()).filter(Boolean);
      const exportName = pieces[0] ?? '';
      const localName = pieces[pieces.length - 1] ?? '';
      if (isValidJavaScriptIdentifier(exportName) && isValidJavaScriptIdentifier(localName)) {
        statements.push(`const ${localName} = ${moduleIdentifier}[${JSON.stringify(exportName)}];`);
      }
    }
  };

  if (clause.startsWith('*')) {
    const namespaceMatch = clause.match(/^\*\s+as\s+([A-Za-z_$][\w$]*)/);
    return namespaceMatch ? `const ${namespaceMatch[1]} = ${moduleIdentifier};` : '';
  }

  if (clause.startsWith('{')) {
    parseNamedBindings(clause);
    return statements.join('\n');
  }

  const commaIndex = clause.indexOf(',');
  const defaultName = (commaIndex >= 0 ? clause.slice(0, commaIndex) : clause).trim();
  if (isValidJavaScriptIdentifier(defaultName)) {
    statements.push(`const ${defaultName} = ${moduleIdentifier};`);
  }
  if (commaIndex >= 0) {
    clause = clause.slice(commaIndex + 1).trim();
    if (clause.startsWith('*')) {
      const namespaceMatch = clause.match(/^\*\s+as\s+([A-Za-z_$][\w$]*)/);
      if (namespaceMatch) statements.push(`const ${namespaceMatch[1]} = ${moduleIdentifier};`);
    } else if (clause.startsWith('{')) {
      parseNamedBindings(clause);
    }
  }

  return statements.join('\n');
}

function createJavaScriptStyleImportReplacement(fullMatch: string, file: ProjectSourceFile) {
  const moduleIdentifier = getJavaScriptStyleRuntimeIdentifier(file.path);
  const bindings = getJavaScriptStyleImportBindings(fullMatch, moduleIdentifier);
  return `${createJavaScriptStyleRuntimeSource(file, moduleIdentifier)}${bindings ? `\n${bindings}` : ''}`;
}

function rewriteJavaScriptModuleSpecifiers(
  source: string,
  importerPath: string,
  scriptPaths: Set<string>,
  styleFiles: Map<string, ProjectSourceFile>
) {
  const stylePaths = new Set(styleFiles.keys());
  const rewriteSpecifier = (specifier: string) => {
    if (isExternalProjectResourceSpecifier(specifier)) return specifier;
    const resolvedScriptPath = resolveProjectScriptPath(importerPath, specifier, scriptPaths);
    if (resolvedScriptPath) return getRuntimeProjectModuleSpecifier(resolvedScriptPath);

    const resolvedStylePath = resolveProjectStylePath(importerPath, specifier, stylePaths);
    return resolvedStylePath ? getRuntimeProjectModuleSpecifier(resolvedStylePath) : specifier;
  };

  const rewriteImportDeclaration = (fullMatch: string, quote: string, specifier: string) => {
    const resolvedStylePath = !isExternalProjectResourceSpecifier(specifier)
      ? resolveProjectStylePath(importerPath, specifier, stylePaths)
      : '';
    const styleFile = resolvedStylePath ? styleFiles.get(resolvedStylePath) : null;
    if (styleFile) {
      return createJavaScriptStyleImportReplacement(fullMatch, styleFile);
    }

    return fullMatch.replace(`${quote}${specifier}${quote}`, `${quote}${rewriteSpecifier(specifier)}${quote}`);
  };

  return source
    .replace(
      /\bimport\s*(['"])([^'"]+)\1/g,
      (fullMatch, quote: string, specifier: string) => rewriteImportDeclaration(fullMatch, quote, specifier)
    )
    .replace(
      /\bimport\s+((?:type\s+)?[^'"]*?)\s+from\s*(['"])([^'"]+)\2/g,
      (fullMatch, _importClause: string, quote: string, specifier: string) => rewriteImportDeclaration(fullMatch, quote, specifier)
    )
    .replace(
      /\bexport\s+(?:type\s+)?[^'"]*?\sfrom\s*(['"])([^'"]+)\1/g,
      (fullMatch, quote: string, specifier: string) => (
        fullMatch.replace(`${quote}${specifier}${quote}`, `${quote}${rewriteSpecifier(specifier)}${quote}`)
      )
    )
    .replace(
      /\bimport\s*\(\s*(['"])([^'"]+)\1\s*\)/g,
      (fullMatch, quote: string, specifier: string) => (
        fullMatch.replace(`${quote}${specifier}${quote}`, `${quote}${rewriteSpecifier(specifier)}${quote}`)
      )
    );
}

function normalizeExecutionTimeoutMs(value: number) {
  if (!Number.isFinite(value)) return 0;
  return Math.max(0, Math.floor(value));
}

function normalizeAutoDocumentationPromptTokenLimit(value: number) {
  if (!Number.isFinite(value)) return DEFAULT_AUTO_DOCUMENTATION_PROMPT_TOKEN_LIMIT;
  if (value <= 0) return 0;
  return Math.min(MAX_AUTO_DOCUMENTATION_PROMPT_TOKEN_LIMIT, Math.max(1024, Math.floor(value)));
}

function normalizeDocsFindTypeMatchCount(value: number) {
  if (!Number.isFinite(value)) return DEFAULT_DOCS_FIND_TYPE_MATCH_COUNT;
  return Math.min(MAX_DOCS_FIND_TYPE_MATCH_COUNT, Math.max(1, Math.floor(value)));
}

function normalizeDocsFindMemberMatchCount(value: number) {
  if (!Number.isFinite(value)) return DEFAULT_DOCS_FIND_MEMBER_MATCH_COUNT;
  return Math.min(MAX_DOCS_FIND_MEMBER_MATCH_COUNT, Math.max(1, Math.floor(value)));
}

function normalizeRuntimeIOMode(value: unknown): RuntimeIOMode {
  return value === 'interactive-output-panel' ? 'interactive-output-panel' : 'alert-output';
}

function normalizeRuntimeLifecycle(value: unknown): RuntimeLifecycle {
  return value === 'keep-warm' ? 'keep-warm' : 'dispose-after-run';
}

function normalizeCSharpOmniSharpSource(value: unknown): CSharpOmniSharpSource {
  return 'local';
}

function formatCSharpDebugDuration(value: number | null | undefined) {
  if (typeof value !== 'number') return 'n/a';
  return `${value.toFixed(value >= 100 ? 0 : 1)}ms`;
}

function formatCSharpDebugTimestamp(value: string | null | undefined) {
  if (!value) return 'n/a';
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : date.toLocaleTimeString();
}

function getCSharpDebugLevelClass(level: string) {
  if (level === 'error') return 'text-red-300';
  if (level === 'warning') return 'text-amber-300';
  if (level === 'success') return 'text-emerald-300';
  return 'text-indigo-300';
}

function stringifyCSharpDebugValue(value: unknown) {
  if (value === undefined) return 'undefined';
  try {
    return JSON.stringify(value, null, 2);
  } catch (error) {
    return String(error);
  }
}

function getCSharpDebugEventPayload(event: CSharpIdeDebugEvent) {
  return {
    callId: event.callId,
    model: event.model,
    request: event.request,
    response: event.response,
    error: event.error,
    environment: event.environment,
  };
}

function normalizeCxxCStandard(value: unknown): CxxCStandard {
  return value === 'c11' || value === 'c23' ? value : 'c17';
}

function normalizeCxxCppStandard(value: unknown): CxxCppStandard {
  return value === 'c++17' || value === 'c++23' ? value : 'c++20';
}

function normalizeCxxOptimizationLevel(value: unknown): CxxOptimizationLevel {
  return value === 'O0' || value === 'O1' || value === 'O3' ? value : 'O2';
}

function normalizeJavaRuntimeVersion(value: unknown): JavaRuntimeVersion {
  const numeric = typeof value === 'number' ? value : Number(value);
  return numeric === 8 || numeric === 11 ? numeric : 17;
}

function normalizeAssistantMaxChainOfThoughtDepth(value: number) {
  if (!Number.isFinite(value)) return DEFAULT_ASSISTANT_TOOL_PASSES;
  return Math.min(MAX_ASSISTANT_CHAIN_OF_THOUGHT_DEPTH, Math.max(1, Math.floor(value)));
}

function normalizeAssistantRequestRateLimitPerMinute(value: number) {
  if (!Number.isFinite(value)) return DEFAULT_ASSISTANT_REQUEST_RATE_LIMIT_PER_MINUTE;
  return Math.min(MAX_ASSISTANT_REQUEST_RATE_LIMIT_PER_MINUTE, Math.max(0, Math.floor(value)));
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
  },
  {
    id: '4',
    name: 'Main.java',
    type: 'file',
    language: 'java',
    parentId: 'root',
    content: 'import java.util.Scanner;\n\npublic class Main {\n    public static void main(String[] args) {\n        Scanner scanner = new Scanner(System.in);\n        System.out.print("Your name: ");\n        String name = scanner.nextLine();\n        System.out.println("Hello, " + name + " from Java!");\n    }\n}'
  }
];

interface FileTreeContextMenuState {
  itemId: string | null;
  x: number;
  y: number;
}

interface WorkspaceSearchResult {
  id: string;
  itemId: string;
  path: string;
  lineNumber: number;
  column: number;
  preview: string;
  previewMatchStart: number;
  matchLength: number;
  kind: 'name' | 'content';
}

function createWorkspaceSearchPreview(source: string, matchStart: number, matchLength: number) {
  const contextLength = 48;
  const rawStart = Math.max(0, matchStart - contextLength);
  const rawEnd = Math.min(source.length, matchStart + matchLength + contextLength);
  const prefix = rawStart > 0 ? '...' : '';
  const suffix = rawEnd < source.length ? '...' : '';
  const preview = `${prefix}${source.slice(rawStart, rawEnd)}${suffix}` || source;
  return {
    preview,
    previewMatchStart: prefix.length + matchStart - rawStart,
  };
}

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
  importFilesFromDataTransfer: (targetId: string | null, dataTransfer: DataTransfer) => Promise<void>;
  addNewItem: (type: 'file' | 'folder', parentId: string | null, mode?: 'modal' | 'inline') => void;
  deleteItem: (id: string) => void;
  duplicateItem: (id: string) => void;
  openContextMenu: (itemId: string | null, clientX: number, clientY: number) => void;
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
          if (hasFileDataTransferPayload(e.dataTransfer)) {
            void ctx.importFilesFromDataTransfer(item.type === 'folder' ? item.id : item.parentId, e.dataTransfer);
            return;
          }
          ctx.handleDrop(item.type === 'folder' ? item.id : item.parentId);
        }}
        onPointerDown={(e) => {
          if (e.button !== 0) return;
          if (isRenaming) return;
          if (item.type === 'folder') ctx.toggleFolder(item.id);
          ctx.openEditorTab(item.id);
        }}
        onContextMenu={(e) => {
          e.preventDefault();
          e.stopPropagation();
          if (isRenaming) return;
          ctx.openContextMenu(item.id, e.clientX, e.clientY);
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
              <FileTypeIcon path={item.name} language={item.language} size={16} className="pointer-events-none" />
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
  const [projects, setProjects] = useState<CodeCraftProjectMeta[]>(() => loadProjectRegistry());
  const [activeProjectId, setActiveProjectIdState] = useState(() => getActiveProjectId());
  const filesMutationVersionRef = useRef(0);
  const projectFilesPersistenceReadyRef = useRef(false);
  const [isProjectMenuOpen, setIsProjectMenuOpen] = useState(false);
  const [projectMenuStatus, setProjectMenuStatus] = useState('');
  const [renamingProjectId, setRenamingProjectId] = useState<string | null>(null);
  const [renamingProjectName, setRenamingProjectName] = useState('');
  const [files, setFilesState] = useState<FSItem[]>(() => loadInitialProjectFiles(activeProjectId));
  const setFiles = useCallback<React.Dispatch<React.SetStateAction<FSItem[]>>>((nextFiles) => {
    filesMutationVersionRef.current += 1;
    setFilesState(nextFiles);
  }, []);
  const [projectFilesHydrated, setProjectFilesHydrated] = useState(false);
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
  const [gitState, setGitState] = useState<GitRepositoryState>(() => loadLegacySavedGitState() || createDefaultGitState());
  const [sourceControlCommitMessage, setSourceControlCommitMessage] = useState('');
  const [sourceControlNewBranchName, setSourceControlNewBranchName] = useState('');
  const [sourceControlStatus, setSourceControlStatus] = useState('');
  const [isRunning, setIsRunning] = useState(false);
  const [assistantChats, setAssistantChats] = useState<AssistantChat[]>(() => loadSavedAssistantChats());
  const [assistantInputs, setAssistantInputs] = useState<Record<string, string>>({
    [INITIAL_ASSISTANT_CHAT_ID]: ''
  });
  const [assistantAttachmentsByChatId, setAssistantAttachmentsByChatId] = useState<Record<string, AssistantAttachmentFile[]>>({});
  const [assistantAttachmentStatusByChatId, setAssistantAttachmentStatusByChatId] = useState<Record<string, string>>({});
  const [assistantTokenEstimates, setAssistantTokenEstimates] = useState<Record<string, AssistantTokenEstimate>>({});
  const [assistantTurnUsageByChatId, setAssistantTurnUsageByChatId] = useState<Record<string, AssistantTurnUsage>>({});
  const [assistantDocumentationLookupByChatId, setAssistantDocumentationLookupByChatId] = useState<AssistantDocumentationLookupByChatId>({});
  const [loadingAssistantChatId, setLoadingAssistantChatId] = useState<string | null>(null);
  const [assistantHistoryOpenByChatId, setAssistantHistoryOpenByChatId] = useState<Record<string, boolean>>({});
  const [outputPreviewHtml, setOutputPreviewHtml] = useState<string | null>(null);
  const [pendingEdits, setPendingEdits] = useState<PendingEdit[]>([]);
  const [draggedItemId, setDraggedItemId] = useState<string | null>(null);
  const [fileTreeContextMenu, setFileTreeContextMenu] = useState<FileTreeContextMenuState | null>(null);
  const [fileTreeClipboardItemId, setFileTreeClipboardItemId] = useState<string | null>(null);
  const [layoutModel, setLayoutModel] = useState(() => Model.fromJson(loadSavedLayout()));
  const [namingState, setNamingState] = useState<{ type: 'file' | 'folder', parentId: string | null } | null>(null);
  const [namingName, setNamingName] = useState('');
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [renamingName, setRenamingName] = useState('');
  const [pendingNewItem, setPendingNewItem] = useState<FSItem | null>(null);
  const [isSearchOpen, setIsSearchOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [settings, setSettings] = useState<AppSettings>(() => {
    const saved = localStorage.getItem(getProjectStorageKey(STORAGE_KEYS.settings));
    if (!saved) return DEFAULT_SETTINGS;
    const parsed = JSON.parse(saved);
    const merged = { ...DEFAULT_SETTINGS, ...parsed };
    const cleanedMerged = { ...merged } as any;
    delete cleanedMerged.assistantMcpServerUrl;
    delete cleanedMerged.assistantMcpServerLabel;
    delete cleanedMerged.assistantMcpServerDescription;
    delete cleanedMerged.assistantMcpAllowedTools;
    delete cleanedMerged.assistantMcpAuthorization;
    delete cleanedMerged.assistantCotMessageRateLimitPerMinute;
    delete cleanedMerged.assistantCursorRepositoryUrl;
    delete cleanedMerged.assistantCursorRepositoryRef;
    delete cleanedMerged.assistantCursorAutoCreatePr;
    delete cleanedMerged.projectRunMode;
    delete cleanedMerged.projectRunCustomFileIds;
    delete cleanedMerged[LEGACY_CSHARP_AUTHORING_SOURCE_KEY];
    const assistantProvider = isAssistantProvider(merged.assistantProvider)
      ? merged.assistantProvider
      : DEFAULT_SETTINGS.assistantProvider;
    const assistantModel = typeof merged.assistantModel === 'string' && merged.assistantModel.trim()
      ? merged.assistantModel.trim()
      : getAssistantDefaultModel(assistantProvider);
    const autoDocumentationModel = typeof merged.autoDocumentationModel === 'string' && merged.autoDocumentationModel.trim()
      ? merged.autoDocumentationModel.trim()
      : getAssistantDefaultModel(assistantProvider);
    return {
      ...cleanedMerged,
      javascriptExecutionTimeoutMs: normalizeExecutionTimeoutMs(merged.javascriptExecutionTimeoutMs),
      pythonExecutionTimeoutMs: normalizeExecutionTimeoutMs(merged.pythonExecutionTimeoutMs),
      pythonRuntimeLifecycle: normalizeRuntimeLifecycle(merged.pythonRuntimeLifecycle),
      csharpExecutionTimeoutMs: normalizeExecutionTimeoutMs(merged.csharpExecutionTimeoutMs),
      csharpOmniSharpSource: normalizeCSharpOmniSharpSource(
        merged.csharpOmniSharpSource ?? (merged as Record<string, unknown>)[LEGACY_CSHARP_AUTHORING_SOURCE_KEY]
      ),
      csharpIdeDebugMode: !!merged.csharpIdeDebugMode,
      cxxExecutionTimeoutMs: normalizeExecutionTimeoutMs(merged.cxxExecutionTimeoutMs),
      cxxRuntimeLifecycle: normalizeRuntimeLifecycle(merged.cxxRuntimeLifecycle),
      cxxIOMode: normalizeRuntimeIOMode(merged.cxxIOMode),
      cxxCStandard: normalizeCxxCStandard(merged.cxxCStandard),
      cxxCppStandard: normalizeCxxCppStandard(merged.cxxCppStandard),
      cxxOptimizationLevel: normalizeCxxOptimizationLevel(merged.cxxOptimizationLevel),
      javaExecutionTimeoutMs: normalizeExecutionTimeoutMs(merged.javaExecutionTimeoutMs),
      javaRuntimeLifecycle: normalizeRuntimeLifecycle(merged.javaRuntimeLifecycle),
      javaIOMode: normalizeRuntimeIOMode(merged.javaIOMode),
      javaRuntimeVersion: normalizeJavaRuntimeVersion(merged.javaRuntimeVersion),
      projectRunEntryFileId: typeof merged.projectRunEntryFileId === 'string' ? merged.projectRunEntryFileId : null,
      assistantProvider,
      assistantModel,
      assistantApiKey: typeof merged.assistantApiKey === 'string' ? merged.assistantApiKey : '',
      assistantUseChainOfThought: !!merged.assistantUseChainOfThought,
      assistantShowUsagePopup: merged.assistantShowUsagePopup !== false,
      assistantMaxChainOfThoughtDepth: normalizeAssistantMaxChainOfThoughtDepth(
        typeof merged.assistantMaxChainOfThoughtDepth === 'number'
          ? merged.assistantMaxChainOfThoughtDepth
          : DEFAULT_SETTINGS.assistantMaxChainOfThoughtDepth
      ),
      assistantRequestRateLimitPerMinute: normalizeAssistantRequestRateLimitPerMinute(
        typeof merged.assistantRequestRateLimitPerMinute === 'number'
          ? merged.assistantRequestRateLimitPerMinute
          : typeof merged.assistantCotMessageRateLimitPerMinute === 'number'
            ? merged.assistantCotMessageRateLimitPerMinute
            : DEFAULT_SETTINGS.assistantRequestRateLimitPerMinute
      ),
      autoDocumentationModel,
      autoDocumentationEntryPoint: typeof merged.autoDocumentationEntryPoint === 'string' ? merged.autoDocumentationEntryPoint : DEFAULT_SETTINGS.autoDocumentationEntryPoint,
      autoDocumentationPromptTokenLimit: normalizeAutoDocumentationPromptTokenLimit(
        typeof merged.autoDocumentationPromptTokenLimit === 'number'
          ? merged.autoDocumentationPromptTokenLimit
          : DEFAULT_SETTINGS.autoDocumentationPromptTokenLimit
      ),
      docsFindTypeMatchCount: normalizeDocsFindTypeMatchCount(
        typeof merged.docsFindTypeMatchCount === 'number'
          ? merged.docsFindTypeMatchCount
          : DEFAULT_SETTINGS.docsFindTypeMatchCount
      ),
      docsFindMemberMatchCount: normalizeDocsFindMemberMatchCount(
        typeof merged.docsFindMemberMatchCount === 'number'
          ? merged.docsFindMemberMatchCount
          : DEFAULT_SETTINGS.docsFindMemberMatchCount
      ),
      docsFindIncludeAccessorDocs: merged.docsFindIncludeAccessorDocs !== false,
    };
  });
  const [settingsPipPackages, setSettingsPipPackages] = useState<SavedPipPackage[]>(() => loadSavedPipPackages());
  const [settingsPipIncludedModules, setSettingsPipIncludedModules] = useState<string[]>(() => loadSavedPipIncludedModules());
  const [settingsPyiImportSizeLimitOverrides, setSettingsPyiImportSizeLimitOverrides] = useState<SavedPyiImportSizeLimitOverride[]>(() => loadSavedPyiImportSizeLimitOverrides());
  const [settingsNpmInstalledPackages, setSettingsNpmInstalledPackages] = useState<SavedNpmInstalledPackage[]>(() => loadSavedNpmInstalledPackages());
  const [settingsJavaScriptIncludedModules, setSettingsJavaScriptIncludedModules] = useState<SavedJavaScriptModule[]>(() => loadSavedJavaScriptIncludedModules());
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
  const [settingsNpmPackageInput, setSettingsNpmPackageInput] = useState('');
  const [settingsNpmPackageBusy, setSettingsNpmPackageBusy] = useState(false);
  const [settingsNpmPackageStatus, setSettingsNpmPackageStatus] = useState('');
  const [settingsJavaScriptModuleInput, setSettingsJavaScriptModuleInput] = useState('');
  const [settingsJavaScriptModuleUrlInput, setSettingsJavaScriptModuleUrlInput] = useState('');
  const [settingsJavaScriptModuleBusy, setSettingsJavaScriptModuleBusy] = useState(false);
  const [settingsJavaScriptModuleStatus, setSettingsJavaScriptModuleStatus] = useState('');
  const [settingsCSharpNamespaceInput, setSettingsCSharpNamespaceInput] = useState('');
  const [settingsCSharpNamespaceBusy, setSettingsCSharpNamespaceBusy] = useState(false);
  const [settingsCSharpNamespaceStatus, setSettingsCSharpNamespaceStatus] = useState('');
  const [settingsUserDataBusy, setSettingsUserDataBusy] = useState(false);
  const [settingsUserDataStatus, setSettingsUserDataStatus] = useState('');
  const [csharpIdeDebugSnapshot, setCSharpIdeDebugSnapshot] = useState<CSharpIdeDebugSnapshot | null>(null);
  const [activeCSharpIdeDebugFeature, setActiveCSharpIdeDebugFeature] = useState('overview');
  const [showAssistantApiKey, setShowAssistantApiKey] = useState(false);
  const [isSemanticDocumentationOpen, setIsSemanticDocumentationOpen] = useState(false);
  const [semanticDocumentationActive, setSemanticDocumentationActive] = useState<SemanticDocumentationRecord | null>(null);
  const [semanticDocumentationDraft, setSemanticDocumentationDraft] = useState<SemanticDocumentationRecord | null>(null);
  const [semanticDocumentationMessage, setSemanticDocumentationMessage] = useState('');
  const [semanticDocumentationSelectedItemId, setSemanticDocumentationSelectedItemId] = useState<string | null>(null);
  const [isSemanticDocumentationRunning, setIsSemanticDocumentationRunning] = useState(false);
  const [syncMeta, setSyncMeta] = useState<SyncMeta[]>(loadSyncMeta);
  const pendingEdit = pendingEdits[0] ?? null;
  const editorRef = useRef<any>(null);
  const pendingEditorNavigationRef = useRef<{
    uri: string;
    itemId: string;
    selectionOrPosition?: monaco.IRange | monaco.IPosition;
  } | null>(null);
  const pythonDiagnosticsEditorRef = useRef<any>(null);
  const csharpDiagnosticsEditorRef = useRef<any>(null);
  const cxxDiagnosticsEditorRef = useRef<any>(null);
  const javaDiagnosticsEditorRef = useRef<any>(null);
  const pyrightModuleRef = useRef<PyrightModule | null>(null);
  const csharpAuthoringModuleRef = useRef<CSharpAuthoringModule | null>(null);
  const browserCSharpModuleRef = useRef<BrowserCSharpModule | null>(null);
  const cxxAuthoringModuleRef = useRef<CxxAuthoringModule | null>(null);
  const cxxRuntimeModuleRef = useRef<CxxRuntimeModule | null>(null);
  const javaAuthoringModuleRef = useRef<JavaAuthoringModule | null>(null);
  const javaRuntimeModuleRef = useRef<JavaRuntimeModule | null>(null);
  const cxxRuntimeIdleTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const javaRuntimeIdleTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [activeEditorTabId, setActiveEditorTabId] = useState<string | null>(null);
  const [mountedSharedEditorTarget, setMountedSharedEditorTarget] = useState<SharedEditorTarget | null>(null);
  const searchPanelRef = useRef<HTMLDivElement>(null);
  const searchButtonRef = useRef<HTMLButtonElement>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);
  const outputContainerRef = useRef<HTMLDivElement>(null);
  const outputInteractionInputRef = useRef<HTMLInputElement>(null);
  const terminalContainerRef = useRef<HTMLDivElement>(null);
  const outputInteractionResolverRef = useRef<((value: string | boolean | null | undefined) => void) | null>(null);
  const outputInteractionIdRef = useRef(0);
  const outputPreviewUrlsRef = useRef<string[]>([]);
  const assistantEstimateRequestIdRef = useRef(0);
  const terminalOutputRef = useRef(terminalOutput);
  terminalOutputRef.current = terminalOutput;
  const terminalCwdRef = useRef<string | null>(terminalCwd);
  terminalCwdRef.current = terminalCwd;
  const gitStateRef = useRef(gitState);
  gitStateRef.current = gitState;
  const gitStatePersistenceReadyRef = useRef(false);
  const gitStateMutationVersionRef = useRef(0);
  const lastSourceControlFetchFocusRef = useRef(0);
  const csharpRuntimeReadyRef = useRef<Promise<void> | null>(null);
  const csharpInteractiveWorkerRef = useRef<Worker | null>(null);
  const csharpInteractiveWorkerRunRejectRef = useRef<((error: Error) => void) | null>(null);
  const skipEditorSyncRef = useRef(false);
  const pendingSharedEditorTargetRef = useRef<{ tabId: string; itemId: string } | null>(null);
  const sharedEditorVersionRef = useRef(0);
  const monacoProjectModelUrisRef = useRef<Set<string>>(new Set());
  const pyodideEnsurePromiseRef = useRef<Promise<void> | null>(null);
  const persistedPyodidePackageMetaLoadPromiseRef = useRef<Promise<void> | null>(null);
  const persistedPyodidePackageMetaLoadedRef = useRef(false);
  const persistedPyodidePackageSnapshotLoadPromiseRef = useRef<Promise<void> | null>(null);
  const userDataImportInputRef = useRef<HTMLInputElement>(null);
  const projectDataImportInputRef = useRef<HTMLInputElement>(null);
  const packageJsonSyncFingerprintRef = useRef('');
  const packageJsonSyncRunningRef = useRef(false);
  const packageJsonSyncQueuedRef = useRef(false);
  const filesRef = useRef(files);
  filesRef.current = files;
  const syncHandlesRef = useRef<Map<string, FileSystemDirectoryHandle>>(new Map());
  const syncLocksRef = useRef<Map<string, Promise<void>>>(new Map());
  const syncInitializedRef = useRef<Set<string>>(new Set());
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const assistantRequestRateNextSlotAtRef = useRef(0);
  const semanticDocumentationAbortRef = useRef<AbortController | null>(null);
  const [activeSyncIds, setActiveSyncIds] = useState<Set<string>>(new Set());
  const persistedPipIncludesRestoredRef = useRef(false);
  const persistedCSharpNamespacesRestoredRef = useRef<CSharpOmniSharpSource | null>(null);
  const persistedPythonPackageStubsRestoredRef = useRef(false);

  const activeProject = projects.find(project => project.id === activeProjectId)
    || projects[0]
    || createDefaultProjectMeta();
  const activeItem = files.find(f => f.id === activeFileId);
  const assistantReasoningControl = getAssistantReasoningControl(settings.assistantProvider, settings.assistantModel);
  const effectiveAssistantUseChainOfThought =
    assistantReasoningControl === 'always_on'
      ? true
      : assistantReasoningControl === 'toggleable'
        ? settings.assistantUseChainOfThought
        : false;
  const effectiveAssistantMaxChainOfThoughtDepth = normalizeAssistantMaxChainOfThoughtDepth(settings.assistantMaxChainOfThoughtDepth);
  const effectiveAssistantRequestRateLimitPerMinute = normalizeAssistantRequestRateLimitPerMinute(settings.assistantRequestRateLimitPerMinute);
  const assistantConfiguredApiKey = settings.assistantApiKey.trim();
  const effectiveAutoDocumentationModel = settings.autoDocumentationModel.trim() || getAssistantDefaultModel(settings.assistantProvider);
  const effectiveAutoDocumentationPromptTokenLimit = normalizeAutoDocumentationPromptTokenLimit(settings.autoDocumentationPromptTokenLimit);
  const semanticDocumentationVisibleRecord = semanticDocumentationActive || semanticDocumentationDraft;
  const semanticDocumentationSelectedItem = semanticDocumentationVisibleRecord?.items.find(item => item.id === semanticDocumentationSelectedItemId)
    || semanticDocumentationVisibleRecord?.items[0]
    || null;
  const activeEditorTabNode: any = activeEditorTabId ? layoutModel.getNodeById(activeEditorTabId) : null;
  const activeEditorTabItemId =
    activeEditorTabNode?.getComponent?.() === 'editor'
    && typeof activeEditorTabNode?.getConfig?.()?.itemId === 'string'
      ? activeEditorTabNode.getConfig().itemId
      : null;
  const activeEditorTabItem = activeEditorTabItemId ? files.find(f => f.id === activeEditorTabItemId) : null;
  const gitChanges = useMemo(() => getGitWorkspaceChanges(gitState, files), [files, gitState]);
  const gitSyncStatus = useMemo(() => getGitBranchSyncStatus(gitState), [gitState]);
  const gitRepositoryPublished = useMemo(() => isGitRepositoryPublished(gitState), [gitState]);
  const sourceControlActionLabel = gitChanges.length > 0
    ? 'Commit'
    : !gitRepositoryPublished
      ? 'Publish Repository'
      : gitSyncStatus.needsPublish
      ? 'Publish Branch'
      : gitSyncStatus.needsPull || gitSyncStatus.needsPush || gitSyncStatus.diverged
        ? 'Sync Changes'
        : 'Commit';
  const sourceControlActionDisabled = gitChanges.length === 0
    && gitRepositoryPublished
    && !gitSyncStatus.needsPublish
    && !gitSyncStatus.needsPull
    && !gitSyncStatus.needsPush
    && !gitSyncStatus.diverged;

  useEffect(() => {
    if (!fileTreeContextMenu) return;

    const closeMenu = () => setFileTreeContextMenu(null);
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') closeMenu();
    };

    window.addEventListener('pointerdown', closeMenu);
    window.addEventListener('resize', closeMenu);
    window.addEventListener('scroll', closeMenu, true);
    window.addEventListener('keydown', handleKeyDown);
    return () => {
      window.removeEventListener('pointerdown', closeMenu);
      window.removeEventListener('resize', closeMenu);
      window.removeEventListener('scroll', closeMenu, true);
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [fileTreeContextMenu]);

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      const hasCommandModifier = event.metaKey || event.ctrlKey;
      const key = event.key.toLowerCase();
      const isSearchShortcut = hasCommandModifier && (
        (event.shiftKey && key === 'f')
        || (!event.shiftKey && key === 'p')
      );
      if (!isSearchShortcut) return;

      event.preventDefault();
      setIsSearchOpen(true);
      window.setTimeout(() => searchInputRef.current?.select(), 0);
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  useEffect(() => {
    if (!isSearchOpen) return;

    const focusTimer = window.setTimeout(() => searchInputRef.current?.focus(), 0);
    const closeSearch = () => setIsSearchOpen(false);
    const handlePointerDown = (event: PointerEvent) => {
      const target = event.target as Node | null;
      if (target && searchPanelRef.current?.contains(target)) return;
      if (target && searchButtonRef.current?.contains(target)) return;
      closeSearch();
    };
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') closeSearch();
    };

    window.addEventListener('pointerdown', handlePointerDown);
    window.addEventListener('resize', closeSearch);
    window.addEventListener('scroll', closeSearch, true);
    window.addEventListener('keydown', handleKeyDown);
    return () => {
      window.clearTimeout(focusTimer);
      window.removeEventListener('pointerdown', handlePointerDown);
      window.removeEventListener('resize', closeSearch);
      window.removeEventListener('scroll', closeSearch, true);
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [isSearchOpen]);

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

  const getCxxAuthoringModule = useCallback(async () => {
    if (!cxxAuthoringModuleRef.current) {
      cxxAuthoringModuleRef.current = await loadCxxAuthoringModule();
    }
    return cxxAuthoringModuleRef.current;
  }, []);

  const getCxxRuntimeModule = useCallback(async () => {
    if (cxxRuntimeIdleTimerRef.current) {
      clearTimeout(cxxRuntimeIdleTimerRef.current);
      cxxRuntimeIdleTimerRef.current = null;
    }
    if (!cxxRuntimeModuleRef.current) {
      cxxRuntimeModuleRef.current = await loadCxxRuntimeModule();
    }
    return cxxRuntimeModuleRef.current;
  }, []);

  const getJavaAuthoringModule = useCallback(async () => {
    if (!javaAuthoringModuleRef.current) {
      javaAuthoringModuleRef.current = await loadJavaAuthoringModule();
    }
    return javaAuthoringModuleRef.current;
  }, []);

  const getJavaRuntimeModule = useCallback(async () => {
    if (javaRuntimeIdleTimerRef.current) {
      clearTimeout(javaRuntimeIdleTimerRef.current);
      javaRuntimeIdleTimerRef.current = null;
    }
    if (!javaRuntimeModuleRef.current) {
      javaRuntimeModuleRef.current = await loadJavaRuntimeModule();
    }
    return javaRuntimeModuleRef.current;
  }, []);

  const disposeCxxRuntime = useCallback(() => {
    if (cxxRuntimeIdleTimerRef.current) {
      clearTimeout(cxxRuntimeIdleTimerRef.current);
      cxxRuntimeIdleTimerRef.current = null;
    }
    cxxRuntimeModuleRef.current?.disposeCxxRuntime?.();
    cxxRuntimeModuleRef.current = null;
    cxxRuntimeModulePromise = null;
  }, []);

  const resetCxxRuntimeIdleTimer = useCallback(() => {
    if (cxxRuntimeIdleTimerRef.current) {
      clearTimeout(cxxRuntimeIdleTimerRef.current);
    }
    cxxRuntimeIdleTimerRef.current = setTimeout(disposeCxxRuntime, CXX_RUNTIME_IDLE_TIMEOUT);
  }, [disposeCxxRuntime]);

  const disposeJavaRuntime = useCallback(() => {
    if (javaRuntimeIdleTimerRef.current) {
      clearTimeout(javaRuntimeIdleTimerRef.current);
      javaRuntimeIdleTimerRef.current = null;
    }
    javaRuntimeModuleRef.current?.disposeJavaRuntime?.();
    javaRuntimeModuleRef.current = null;
    javaRuntimeModulePromise = null;
  }, []);

  const resetJavaRuntimeIdleTimer = useCallback(() => {
    if (javaRuntimeIdleTimerRef.current) {
      clearTimeout(javaRuntimeIdleTimerRef.current);
    }
    javaRuntimeIdleTimerRef.current = setTimeout(disposeJavaRuntime, JAVA_RUNTIME_IDLE_TIMEOUT);
  }, [disposeJavaRuntime]);

  useEffect(() => () => {
    disposeCxxRuntime();
    disposeJavaRuntime();
  }, [disposeCxxRuntime, disposeJavaRuntime]);

  const clearPyrightEditorBinding = useCallback(() => {
    const provider = pyrightModuleRef.current?.pyrightProvider;
    if (!provider) return;
    provider.editorChangeListener?.dispose();
    provider.editorChangeListener = undefined as any;
  }, []);

  const clearCSharpEditorBinding = useCallback(() => {
    csharpAuthoringModuleRef.current?.csharpService.clearEditor();
  }, []);

  const clearCxxEditorBinding = useCallback(() => {
    cxxAuthoringModuleRef.current?.cxxService.clearEditor();
  }, []);

  const clearJavaEditorBinding = useCallback(() => {
    javaAuthoringModuleRef.current?.javaService.clearEditor();
  }, []);

  const resetSharedEditorOptions = useCallback((editor: any) => {
    editor.updateOptions(buildSharedEditorOptions(settings.fontSize));
    updateCodeCraftModelOptions(editor.getModel?.());
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
    const omniSharpSource = settings.csharpOmniSharpSource;
    await csharpAuthoring.ensureCSharpReady(omniSharpSource);
    if (persistedCSharpNamespacesRestoredRef.current === omniSharpSource) return csharpAuthoring;
    persistedCSharpNamespacesRestoredRef.current = omniSharpSource;

    for (const namespaceName of loadSavedCSharpNamespaces()) {
      try {
        await csharpAuthoring.csharpService.includeNamespace(namespaceName);
      } catch (error) {
        console.warn(`Failed to restore C# namespace '${namespaceName}':`, error);
      }
    }
    return csharpAuthoring;
  }, [getCSharpAuthoringModule, settings.csharpOmniSharpSource]);

  useEffect(() => {
    let disposed = false;

    if (!settings.csharpIdeDebugMode) {
      csharpAuthoringModuleRef.current?.csharpService.configureDebug({ enabled: false });
      setCSharpIdeDebugSnapshot(null);
      return () => {
        disposed = true;
      };
    }

    void getCSharpAuthoringModule().then(csharpAuthoring => {
      if (disposed) return;
      csharpAuthoring.csharpService.configureDebug({
        enabled: true,
        onDidChange: snapshot => {
          if (!disposed) setCSharpIdeDebugSnapshot(snapshot);
        },
      });
      setCSharpIdeDebugSnapshot(csharpAuthoring.csharpService.getDebugSnapshot());
    });

    return () => {
      disposed = true;
      csharpAuthoringModuleRef.current?.csharpService.configureDebug({ enabled: false });
    };
  }, [getCSharpAuthoringModule, settings.csharpIdeDebugMode]);

  const copyCSharpIdeDebugSnapshot = useCallback(async () => {
    if (!csharpIdeDebugSnapshot) return;
    try {
      await navigator.clipboard?.writeText(JSON.stringify(csharpIdeDebugSnapshot, null, 2));
    } catch (error) {
      console.warn('Failed to copy C# IDE debug snapshot:', error);
    }
  }, [csharpIdeDebugSnapshot]);

  const clearCSharpIdeDebugEvents = useCallback(() => {
    csharpAuthoringModuleRef.current?.csharpService.clearDebugEvents();
    setCSharpIdeDebugSnapshot(csharpAuthoringModuleRef.current?.csharpService.getDebugSnapshot() ?? null);
  }, []);

  const ensureCxxAuthoringReady = useCallback(async () => {
    const cxxAuthoring = await getCxxAuthoringModule();
    await cxxAuthoring.ensureCxxReady();
    return cxxAuthoring;
  }, [getCxxAuthoringModule]);

  const ensureJavaAuthoringReady = useCallback(async () => {
    const javaAuthoring = await getJavaAuthoringModule();
    await javaAuthoring.ensureJavaReady();
    return javaAuthoring;
  }, [getJavaAuthoringModule]);

  const getCSharpProjectFileSnapshots = useCallback(() => {
    const currentFiles = filesRef.current;
    return currentFiles
      .filter((item): item is FSItem & { type: 'file' } => (
        item.type === 'file'
        && getProjectRuntimeLanguageForFile(item) === 'csharp'
      ))
      .map(file => ({
        path: normalizeProjectPath(getFsItemPath(currentFiles, file.id)),
        content: file.content || '',
        language: 'csharp' as const,
      }))
      .filter(file => !!file.path)
      .sort((left, right) => left.path.localeCompare(right.path));
  }, []);

  const refreshSemanticDocumentationRecords = useCallback(async () => {
    const [activeRecord, draftRecord] = await Promise.all([
      loadSemanticDocumentationRecord(activeProjectId, 'csharp', 'active'),
      loadSemanticDocumentationRecord(activeProjectId, 'csharp', 'draft'),
    ]);
    setSemanticDocumentationActive(activeRecord);
    setSemanticDocumentationDraft(draftRecord);
    setSemanticDocumentationSelectedItemId(current => (
      current
      && (activeRecord?.items.some(item => item.id === current) || draftRecord?.items.some(item => item.id === current))
        ? current
        : activeRecord?.items[0]?.id || draftRecord?.items[0]?.id || null
    ));
  }, [activeProjectId]);

  useEffect(() => {
    void refreshSemanticDocumentationRecords().catch(error => {
      setSemanticDocumentationMessage(`Could not load semantic documentation: ${error instanceof Error ? error.message : String(error)}`);
    });
  }, [refreshSemanticDocumentationRecords]);

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

    const csharpAuthoring = await getCSharpAuthoringModule();
    if (csharpDiagnosticsEditorRef.current !== editor) return;
    if (editorRef.current !== editor) return;
    if (editor.getModel?.()?.getLanguageId?.() !== 'csharp') return;

    csharpAuthoring.csharpService.setupEditor(editor, getCSharpProjectFileSnapshots);
    void ensureCSharpAuthoringReady().catch(error => {
      console.warn('Failed to prepare C# language support:', error);
    });
  }, [ensureCSharpAuthoringReady, getCSharpAuthoringModule, getCSharpProjectFileSnapshots]);

  useEffect(() => {
    void refreshCSharpDiagnostics();
  }, [refreshCSharpDiagnostics]);

  const refreshCxxDiagnostics = useCallback(async () => {
    const editor = cxxDiagnosticsEditorRef.current;
    if (!editor) return;
    if (editorRef.current !== editor) return;
    const languageId = editor.getModel?.()?.getLanguageId?.();
    if (languageId !== 'c' && languageId !== 'cpp') return;

    const cxxAuthoring = await ensureCxxAuthoringReady();
    if (cxxDiagnosticsEditorRef.current !== editor) return;
    if (editorRef.current !== editor) return;
    const nextLanguageId = editor.getModel?.()?.getLanguageId?.();
    if (nextLanguageId !== 'c' && nextLanguageId !== 'cpp') return;

    cxxAuthoring.cxxService.setupEditor(editor, () => (
      toProjectSourceFiles(getProjectRunnableFiles())
        .filter(file => file.language === 'c' || file.language === 'cpp')
        .map(file => ({ path: file.path, content: file.content, language: file.language as 'c' | 'cpp' }))
    ));
  }, [ensureCxxAuthoringReady]);

  const refreshJavaDiagnostics = useCallback(async () => {
    const editor = javaDiagnosticsEditorRef.current;
    if (!editor) return;
    if (editorRef.current !== editor) return;
    if (editor.getModel?.()?.getLanguageId?.() !== 'java') return;

    const javaAuthoring = await ensureJavaAuthoringReady();
    if (javaDiagnosticsEditorRef.current !== editor) return;
    if (editorRef.current !== editor) return;
    if (editor.getModel?.()?.getLanguageId?.() !== 'java') return;

    javaAuthoring.javaService.setupEditor(editor, () => (
      toProjectSourceFiles(getProjectRunnableFiles())
        .filter(file => file.language === 'java')
        .map(file => ({ path: file.path, content: file.content, language: 'java' as const }))
    ));
  }, [ensureJavaAuthoringReady]);

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
      editor.updateOptions({
        quickSuggestions: {
          other: false,
          comments: false,
          strings: false,
        },
        wordBasedSuggestions: 'off',
        suggest: {
          showWords: false,
        },
      });
      csharpDiagnosticsEditorRef.current = editor;
      void refreshCSharpDiagnostics();
    } else if (csharpDiagnosticsEditorRef.current === editor) {
      clearCSharpEditorBinding();
      csharpDiagnosticsEditorRef.current = null;
    }

    if (languageId === 'c' || languageId === 'cpp') {
      cxxDiagnosticsEditorRef.current = editor;
      void refreshCxxDiagnostics();
    } else if (cxxDiagnosticsEditorRef.current === editor) {
      clearCxxEditorBinding();
      cxxDiagnosticsEditorRef.current = null;
    }

    if (languageId === 'java') {
      javaDiagnosticsEditorRef.current = editor;
      void refreshJavaDiagnostics();
    } else if (javaDiagnosticsEditorRef.current === editor) {
      clearJavaEditorBinding();
      javaDiagnosticsEditorRef.current = null;
    }
  }, [clearCSharpEditorBinding, clearCxxEditorBinding, clearJavaEditorBinding, clearPyrightEditorBinding, refreshCSharpDiagnostics, refreshCxxDiagnostics, refreshJavaDiagnostics, refreshPythonDiagnostics, resetSharedEditorOptions]);

  const applyPendingEditorNavigation = useCallback((editor: any) => {
    const pending = pendingEditorNavigationRef.current;
    if (!pending) return;

    const modelUri = editor.getModel?.()?.uri?.toString?.();
    if (modelUri !== pending.uri) return;

    const target = pending.selectionOrPosition;
    if (isMonacoRangeLike(target)) {
      editor.setSelection?.(target);
      editor.revealRangeInCenter?.(target);
    } else if (isMonacoPositionLike(target)) {
      editor.setPosition?.(target);
      editor.revealPositionInCenter?.(target);
    }

    editor.focus?.();
    pendingEditorNavigationRef.current = null;
  }, []);

  const handleEditorMount = useCallback((editor: any) => {
    bindLanguageServicesToEditor(editor);
    applyPendingEditorNavigation(editor);
    editor.onDidFocusEditorText(() => bindLanguageServicesToEditor(editor));
    editor.onDidChangeModel(() => {
      bindLanguageServicesToEditor(editor);
      applyPendingEditorNavigation(editor);
    });
    editor.onDidDispose(() => {
      if (pythonDiagnosticsEditorRef.current === editor) {
        clearPyrightEditorBinding();
        pythonDiagnosticsEditorRef.current = null;
      }
      if (csharpDiagnosticsEditorRef.current === editor) {
        clearCSharpEditorBinding();
        csharpDiagnosticsEditorRef.current = null;
      }
      if (cxxDiagnosticsEditorRef.current === editor) {
        clearCxxEditorBinding();
        cxxDiagnosticsEditorRef.current = null;
      }
      if (javaDiagnosticsEditorRef.current === editor) {
        clearJavaEditorBinding();
        javaDiagnosticsEditorRef.current = null;
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
  }, [applyPendingEditorNavigation, bindLanguageServicesToEditor, clearCSharpEditorBinding, clearCxxEditorBinding, clearJavaEditorBinding, clearPyrightEditorBinding, createSharedEditorTarget]);

  const disposeMountedSharedEditor = useCallback(() => {
    const editor = editorRef.current;
    if (!editor) return false;
    editor.dispose();
    return true;
  }, []);

  // Helper to get full path
  const getPath = (id: string | undefined): string => {
    return getFsItemPath(files, id);
  };
  const activePath = activeItem ? getPath(activeItem.id) : '';
  const activePathSegments = activePath.split('/').filter(Boolean);
  const activePathLabel = activePath || 'No selection';

  const searchResults = useMemo<WorkspaceSearchResult[]>(() => {
    const rawQuery = searchQuery.trim();
    const searchMode: WorkspaceSearchResult['kind'] = rawQuery.startsWith('#') ? 'content' : 'name';
    const query = searchMode === 'content' ? rawQuery.slice(1).trim() : rawQuery;
    if (!query) return [];

    const needle = query.toLocaleLowerCase();
    const matchLength = query.length;
    const maxResults = 300;
    const results: WorkspaceSearchResult[] = [];
    const searchableFiles = files
      .filter((item): item is FSItem & { type: 'file' } => item.type === 'file')
      .sort((left, right) => getFsItemPath(files, left.id).localeCompare(getFsItemPath(files, right.id)));

    for (const file of searchableFiles) {
      const path = getFsItemPath(files, file.id);
      if (searchMode === 'name') {
        const nameMatchStart = file.name.toLocaleLowerCase().indexOf(needle);
        if (nameMatchStart < 0) continue;

        const { preview, previewMatchStart } = createWorkspaceSearchPreview(file.name, nameMatchStart, matchLength);
        results.push({
          id: `${file.id}:name`,
          itemId: file.id,
          path,
          lineNumber: 1,
          column: 1,
          preview,
          previewMatchStart,
          matchLength,
          kind: 'name',
        });
        if (results.length >= maxResults) return results;
        continue;
      }

      const content = file.content || '';
      const lines = content.split(/\r\n|\r|\n/);
      for (let lineIndex = 0; lineIndex < lines.length; lineIndex += 1) {
        const line = lines[lineIndex];
        const lowerLine = line.toLocaleLowerCase();
        let fromIndex = 0;

        while (fromIndex <= lowerLine.length) {
          const matchStart = lowerLine.indexOf(needle, fromIndex);
          if (matchStart < 0) break;

          const { preview, previewMatchStart } = createWorkspaceSearchPreview(line, matchStart, matchLength);
          results.push({
            id: `${file.id}:${lineIndex + 1}:${matchStart + 1}:${results.length}`,
            itemId: file.id,
            path,
            lineNumber: lineIndex + 1,
            column: matchStart + 1,
            preview,
            previewMatchStart,
            matchLength,
            kind: 'content',
          });

          if (results.length >= maxResults) return results;
          fromIndex = matchStart + Math.max(1, needle.length);
        }
      }

      if (results.length >= maxResults) return results;
    }

    return results;
  }, [files, searchQuery]);

  useEffect(() => {
    configureCodeCraftTypeScriptDefaults();

    const nextModelUris = new Set<string>();
    for (const item of files) {
      if (item.type !== 'file') continue;

      const uri = getMonacoProjectModelUri(getPath(item.id));
      const uriKey = uri.toString();
      const language = item.language || langFromFilename(item.name);
      const content = item.content || '';
      const existingModel = monaco.editor.getModel(uri);

      nextModelUris.add(uriKey);
      if (!existingModel) {
        updateCodeCraftModelOptions(monaco.editor.createModel(content, language, uri));
        continue;
      }

      if (existingModel.getLanguageId() !== language) {
        monaco.editor.setModelLanguage(existingModel, language);
      }
      updateCodeCraftModelOptions(existingModel);
      if (existingModel.getValue() !== content) {
        existingModel.setValue(content);
      }
    }

    for (const uriKey of monacoProjectModelUrisRef.current) {
      if (nextModelUris.has(uriKey)) continue;
      monaco.editor.getModel(monaco.Uri.parse(uriKey))?.dispose();
    }
    monacoProjectModelUrisRef.current = nextModelUris;
  }, [files]);

  useEffect(() => () => {
    for (const uriKey of monacoProjectModelUrisRef.current) {
      monaco.editor.getModel(monaco.Uri.parse(uriKey))?.dispose();
    }
    monacoProjectModelUrisRef.current.clear();
  }, []);

  function getProjectRunnableFiles() {
    return files
      .filter((item): item is FSItem & { type: 'file' } => (
        item.type === 'file'
        && getProjectFileLanguageForRuntime(item) !== null
      ))
      .sort((left, right) => getPath(left.id).localeCompare(getPath(right.id)));
  }

  function getActiveRunnableFile() {
    if (activeItem?.type !== 'file') return null;
    const runtimeLanguage = getProjectRuntimeLanguageForFile(activeItem);
    if (!runtimeLanguage) return null;
    if (isCxxRuntimeLanguage(runtimeLanguage) && !isCxxSourcePath(activeItem.name)) return null;
    return activeItem;
  }

  function getResolvedProjectRun(): ResolvedProjectRun {
    const runnableFiles = getProjectRunnableFiles();
    const entryCandidates = runnableFiles.filter(isProjectRunEntryCandidate);
    const activeRunnableFile = activeFileId
      ? entryCandidates.find(file => file.id === activeFileId) ?? null
      : null;
    const configuredEntry = settings.projectRunEntryFileId
      ? entryCandidates.find(file => file.id === settings.projectRunEntryFileId) ?? null
      : null;
    const entryFile = configuredEntry ?? activeRunnableFile ?? entryCandidates[0] ?? null;

    if (!entryFile) {
      return {
        language: null,
        includedFiles: [],
        entryCandidates,
        entryFile: null,
        error: 'Project run could not determine an entry file.',
      };
    }

    const includedFiles = getProjectRunFilesForEntry(entryFile, runnableFiles);
    const selectedLanguageSet = new Set<ProjectFileLanguage>(
      includedFiles
        .map(file => getProjectFileLanguageForRuntime(file))
        .filter((language): language is ProjectFileLanguage => language !== null)
    );
    const selectedRuntimeLanguageSet = new Set<ProjectRuntimeLanguage>(
      includedFiles
        .map(file => getProjectRuntimeLanguageForFile(file))
        .filter((language): language is ProjectRuntimeLanguage => language !== null)
    );

    if (selectedLanguageSet.has('css') && !includedFiles.some(file => isHtmlProjectFile(file) || isTsxProjectFile(file))) {
      return {
        language: null,
        includedFiles,
        entryCandidates,
        entryFile: null,
        error: 'Project run with CSS needs an HTML or TSX entry file.',
      };
    }

    if (includedFiles.length === 0 || !includedFiles.some(file => file.id === entryFile.id)) {
      return {
        language: null,
        includedFiles,
        entryCandidates,
        entryFile,
        error: 'Project run could not include the configured entry file.',
      };
    }

    const entryKind = getProjectRunEntryKind(entryFile);
    if (entryKind === 'html' || entryKind === 'tsx') {
      if (!includedFiles.every(isHtmlTsxProjectRunCompatibleFile)) {
        return {
          language: null,
          includedFiles,
          entryCandidates,
          entryFile,
          error: 'HTML and TSX entry files can only be combined with included HTML, TSX, JavaScript, TypeScript, and CSS files.',
        };
      }

      return {
        language: entryKind === 'html' ? 'html' : 'javascript',
        includedFiles,
        entryCandidates,
        entryFile,
        error: null,
      };
    }

    if (entryKind === 'javascript' || entryKind === 'typescript') {
      if (!includedFiles.every(isJavaScriptOrPlainTypeScriptProjectFile)) {
        return {
          language: null,
          includedFiles,
          entryCandidates,
          entryFile,
          error: 'JavaScript and TypeScript entry files can only be combined with included JavaScript and TypeScript files.',
        };
      }

      return {
        language: 'javascript',
        includedFiles,
        entryCandidates,
        entryFile,
        error: null,
      };
    }

    let resolvedLanguage: ProjectRuntimeLanguage | null = getProjectRuntimeLanguageForFile(entryFile);
    if (!resolvedLanguage) {
      const runtimeLanguages = [...selectedRuntimeLanguageSet];
      const cxxOnly = includedFiles.every(file => isCxxProjectFile(file));

      if (cxxOnly) {
        resolvedLanguage = getCxxResolvedRuntimeLanguage(includedFiles);
      } else if (runtimeLanguages.length === 1) {
        resolvedLanguage = runtimeLanguages[0];
      }
    }

    const isCxxAssetRun =
      isCxxRuntimeLanguage(resolvedLanguage)
      && includedFiles.every(file => isCxxProjectFile(file));
    if (!resolvedLanguage || selectedRuntimeLanguageSet.size > 1 && !isCxxAssetRun) {
      return {
        language: null,
        includedFiles,
        entryCandidates,
        entryFile,
        error: 'Project run requires files from a single supported language, except HTML/TSX web projects or C/C++ source/header sets.',
      };
    }

    return {
      language: resolvedLanguage,
      includedFiles,
      entryCandidates,
      entryFile,
      error: null,
    };
  }

  const toProjectSourceFiles = (projectFiles: FSItem[]): ProjectSourceFile[] => (
    projectFiles
      .map((file) => {
        const language = getProjectFileLanguageForRuntime(file);
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

  const openSearchResult = (result: WorkspaceSearchResult) => {
    const item = files.find(candidate => candidate.id === result.itemId);
    if (!item || item.type !== 'file') return;

    const path = getPath(item.id);
    const uri = getMonacoProjectModelUri(path);
    const contentQuery = searchQuery.trim().startsWith('#') ? searchQuery.trim().slice(1).trim() : searchQuery.trim();
    pendingEditorNavigationRef.current = {
      uri: uri.toString(),
      itemId: item.id,
      selectionOrPosition: {
        startLineNumber: result.lineNumber,
        startColumn: result.column,
        endLineNumber: result.lineNumber,
        endColumn: result.kind === 'content'
          ? result.column + Math.max(1, contentQuery.length)
          : result.column,
      },
    };

    openEditorTabWithItem(item);
    setIsSearchOpen(false);
    queueMicrotask(() => {
      const editor = editorRef.current;
      if (editor) applyPendingEditorNavigation(editor);
    });
  };

  useEffect(() => {
    const disposable = monaco.editor.registerEditorOpener({
      openCodeEditor: (_source, resource, selectionOrPosition) => {
        const targetPath = getProjectPathFromMonacoUri(resource);
        if (!targetPath) return false;

        const currentFiles = filesRef.current;
        const targetItem = currentFiles.find(item => (
          item.type === 'file'
          && normalizeProjectPath(getFsItemPath(currentFiles, item.id)) === targetPath
        ));
        if (!targetItem || targetItem.type !== 'file') return false;

        pendingEditorNavigationRef.current = {
          uri: resource.toString(),
          itemId: targetItem.id,
          selectionOrPosition,
        };
        openEditorTabWithItem(targetItem);
        queueMicrotask(() => {
          const editor = editorRef.current;
          if (editor) applyPendingEditorNavigation(editor);
        });
        return true;
      },
    });

    return () => disposable.dispose();
  }, [applyPendingEditorNavigation, openEditorTabWithItem]);

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
    const projectId = activeProjectId;
    const startedMutationVersion = filesMutationVersionRef.current;
    projectFilesPersistenceReadyRef.current = false;
    setProjectFilesHydrated(false);

    loadStoredProjectFiles(projectId)
      .then(stored => {
        if (cancelled) return;
        const mutatedDuringHydration = filesMutationVersionRef.current !== startedMutationVersion;
        const nextFiles = stored && !mutatedDuringHydration
          ? stored
          : filesRef.current;
        if (stored && !mutatedDuringHydration) {
          filesRef.current = stored;
          setFilesState(stored);
        }
        projectFilesPersistenceReadyRef.current = true;
        setProjectFilesHydrated(true);
        void saveStoredProjectFiles(nextFiles, projectId);
      })
      .catch(() => {
        if (cancelled) return;
        projectFilesPersistenceReadyRef.current = true;
        setProjectFilesHydrated(true);
      });

    return () => {
      cancelled = true;
    };
  }, [activeProjectId]);

  useEffect(() => {
    if (!projectFilesHydrated) return;
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
  }, [projectFilesHydrated]);

  useEffect(() => {
    const timeoutId = window.setTimeout(() => {
      setProjects(touchProjectUpdatedAt(activeProjectId));
    }, 500);
    return () => window.clearTimeout(timeoutId);
  }, [activeProjectId, assistantChats, files, settings, syncMeta, gitState]);

  // Save settings to localStorage
  useEffect(() => {
    localStorage.setItem(getProjectStorageKey(STORAGE_KEYS.settings), JSON.stringify(settings));
  }, [settings]);

  useEffect(() => {
    let cancelled = false;
    const projectId = activeProjectId;
    const startedMutationVersion = gitStateMutationVersionRef.current;
    gitStatePersistenceReadyRef.current = false;

    loadStoredGitState(projectId)
      .then(stored => {
        if (cancelled) return;
        const mutatedDuringHydration = gitStateMutationVersionRef.current !== startedMutationVersion;
        if (stored && !mutatedDuringHydration) {
          gitStateRef.current = stored;
          setGitState(stored);
        }
        gitStatePersistenceReadyRef.current = true;
        void saveStoredGitState(gitStateRef.current, projectId);
      })
      .catch(() => {
        if (cancelled) return;
        gitStatePersistenceReadyRef.current = true;
      });

    return () => {
      cancelled = true;
    };
  }, [activeProjectId]);

  useEffect(() => {
    if (!gitStatePersistenceReadyRef.current) return;
    void saveStoredGitState(gitState, activeProjectId);
  }, [activeProjectId, gitState]);

  useEffect(() => {
    const nextRunnableFiles = getProjectRunnableFiles();
    const entryCandidateIds = nextRunnableFiles
      .filter(isProjectRunEntryCandidate)
      .map(file => file.id);

    setSettings(current => {
      const preferredEntryId =
        current.projectRunEntryFileId && entryCandidateIds.includes(current.projectRunEntryFileId)
          ? current.projectRunEntryFileId
          : entryCandidateIds.includes(activeFileId)
            ? activeFileId
            : entryCandidateIds[0] ?? null;

      if (preferredEntryId === current.projectRunEntryFileId) {
        return current;
      }

      return {
        ...current,
        projectRunEntryFileId: preferredEntryId,
      };
    });
  }, [activeFileId, files]);

  useEffect(() => {
    if (isSettingsOpen) {
      setSettingsPipPackages(loadSavedPipPackages());
      setSettingsPipIncludedModules(loadSavedPipIncludedModules());
      setSettingsPyiImportSizeLimitOverrides(loadSavedPyiImportSizeLimitOverrides());
      setSettingsNpmInstalledPackages(loadSavedNpmInstalledPackages());
      setSettingsJavaScriptIncludedModules(loadSavedJavaScriptIncludedModules());
      setSettingsCSharpNamespaces(loadSavedCSharpNamespaces());
      setSettingsPipStatus('');
      setSettingsPipIncludeStatus('');
      setSettingsPyiImportSizeLimitStatus('');
      setSettingsNpmPackageStatus('');
      setSettingsJavaScriptModuleStatus('');
      setSettingsCSharpNamespaceStatus('');
      setSettingsUserDataStatus('');
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
      if (settings.autoSave && projectFilesPersistenceReadyRef.current) void saveStoredProjectFiles(filesRef.current, activeProjectId);
      for (const folderId of syncHandlesRef.current.keys()) {
        if (!syncInitializedRef.current.has(folderId)) continue;
        syncToDisk(folderId);
      }
    }, 1000);
    return () => { if (saveTimerRef.current) clearTimeout(saveTimerRef.current); };
  }, [activeProjectId, files, settings.autoSave]);

  useEffect(() => {
    localStorage.setItem(getProjectStorageKey(STORAGE_KEYS.assistantChats), JSON.stringify(assistantChats));
  }, [assistantChats]);

  useEffect(() => {
    localStorage.setItem(getProjectStorageKey(STORAGE_KEYS.layout), JSON.stringify(layoutModel.toJson()));
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
    const chatIds = new Set(assistantChats.map(chat => chat.id));
    setAssistantAttachmentsByChatId(prev => {
      let changed = false;
      const next: Record<string, AssistantAttachmentFile[]> = {};
      for (const chatId of chatIds) {
        next[chatId] = prev[chatId] || [];
      }
      for (const chatId of Object.keys(prev)) {
        if (!chatIds.has(chatId)) changed = true;
      }
      for (const chatId of chatIds) {
        if (prev[chatId] === undefined) changed = true;
      }
      return changed ? next : prev;
    });
    setAssistantAttachmentStatusByChatId(prev => {
      const next: Record<string, string> = {};
      let changed = false;
      for (const chatId of chatIds) {
        if (prev[chatId]) next[chatId] = prev[chatId];
      }
      for (const chatId of Object.keys(prev)) {
        if (!chatIds.has(chatId)) changed = true;
      }
      return changed ? next : prev;
    });
    setAssistantDocumentationLookupByChatId(prev => {
      const next: AssistantDocumentationLookupByChatId = {};
      let changed = false;
      for (const chatId of chatIds) {
        if (prev[chatId]) next[chatId] = true;
      }
      for (const chatId of Object.keys(prev)) {
        if (!chatIds.has(chatId)) changed = true;
      }
      return changed ? next : prev;
    });
  }, [assistantChats]);

  useEffect(() => {
    const draftChats = assistantChats
      .map(chat => ({
        chatId: chat.id,
        chat,
        draft: (assistantInputs[chat.id] || '').trim(),
        attachments: assistantAttachmentsByChatId[chat.id] || [],
      }))
      .filter(entry => entry.draft.length > 0 || entry.attachments.length > 0);

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
      const estimateHasAssistantTools = getAssistantSupportsLocalTools(estimateProvider, estimateModel);
      draftChats.forEach(({ chatId, chat, draft, attachments }) => {
        const estimateUseSemanticDocumentationFirst =
          estimateHasAssistantTools
          && getSemanticDocumentationFiles().length > 0
          && !!semanticDocumentationVisibleRecord?.items.length
          && !!assistantDocumentationLookupByChatId[chatId];
        const projectedOutputTokens = assistantTurnUsageByChatId[chatId]?.outputTokenCount || DEFAULT_ASSISTANT_ESTIMATED_OUTPUT_TOKENS;
        const assistantFiles = files.map(file => ({ ...file }));
        const assistantActiveItemId = activeItem?.id || activeFileId || '';
        const userContent = `${draft}${selectionContext}${formatAssistantAttachmentPromptSection(attachments)}`;
        const prompt = buildAssistantPromptFromSnapshot({
          chatId,
          messages: chat.messages,
          userContent,
          assistantFiles,
          assistantActiveItemId,
          assistantTerminalCwd: terminalCwd,
          useChainOfThought: estimateUseChainOfThought,
          maxChainOfThoughtDepth: effectiveAssistantMaxChainOfThoughtDepth,
          hasAssistantTools: estimateHasAssistantTools,
          useSemanticDocumentationFirst: estimateUseSemanticDocumentationFirst,
          hasCSharpSemanticDocumentation: estimateUseSemanticDocumentationFirst,
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
            !estimateApiKey ? `Add your ${getAssistantApiKeyLabel(estimateProvider)} to enable live token counting.` : undefined
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
    assistantAttachmentsByChatId,
    assistantDocumentationLookupByChatId,
    semanticDocumentationActive,
    semanticDocumentationDraft,
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
      csharpInteractiveWorkerRunRejectRef.current?.(new Error('C# interactive runner was stopped.'));
      csharpInteractiveWorkerRunRejectRef.current = null;
      csharpInteractiveWorkerRef.current?.terminate();
      csharpInteractiveWorkerRef.current = null;
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

  const syncRuntimeWorkspaceFilesToExplorer = (initialFiles: Map<string, string>, finalFiles: RuntimeFileSnapshot[]) => {
    const changedFiles = getRuntimeWorkspaceChangedFiles(initialFiles, finalFiles);
    if (changedFiles.length === 0) return;

    setFiles(prev => upsertRuntimeWorkspaceFilesIntoExplorer(prev, changedFiles));
    appendExecutionStartupStatus(
      `Synced ${changedFiles.length} runtime file${changedFiles.length === 1 ? '' : 's'} into the Explorer workspace.`
    );
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
    hasAssistantTools?: boolean;
    toolProgressNotes?: string[];
    assistantLiveNotes?: string[];
    useSemanticDocumentationFirst?: boolean;
    hasCSharpSemanticDocumentation?: boolean;
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
      hasAssistantTools = true,
      toolProgressNotes = [],
      assistantLiveNotes = [],
      useSemanticDocumentationFirst = false,
      hasCSharpSemanticDocumentation = false,
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
    const projectFileItems = assistantFiles
      .filter((file): file is FSItem & { type: 'file' } => file.type === 'file')
      .map(file => ({
        file,
        path: getPathFromSnapshot(file.id),
        language: file.language || langFromFilename(file.name),
        content: file.content || '',
      }))
      .sort((left, right) => left.path.localeCompare(right.path));
    const projectTree = assistantFiles
      .map(file => `- Path: ${getPathFromSnapshot(file.id)}, Type: ${file.type}, Language: ${file.language || 'N/A'}`)
      .join('\n');
    const maxProjectContextFiles = 30;
    const maxProjectContextChars = 80000;
    const maxProjectContextCharsPerFile = 16000;
    let remainingProjectContextChars = maxProjectContextChars;
    let omittedProjectFileCount = 0;
    const projectFileContents = projectFileItems.flatMap(({ file, path, language, content }, index) => {
      if (remainingProjectContextChars <= 0 || index >= maxProjectContextFiles) {
        omittedProjectFileCount += 1;
        return [];
      }
      const pathOverhead = path.length + language.length + 120;
      const fileBudget = Math.max(0, Math.min(maxProjectContextCharsPerFile, remainingProjectContextChars - pathOverhead));
      if (fileBudget <= 0) {
        omittedProjectFileCount += 1;
        return [];
      }
      const truncated = content.length > fileBudget;
      const visibleContent = truncated
        ? `${content.slice(0, fileBudget)}\n... [truncated ${content.length - fileBudget} character${content.length - fileBudget === 1 ? '' : 's'}]`
        : content;
      remainingProjectContextChars -= visibleContent.length + pathOverhead;
      const escapedPath = path.replace(/"/g, '&quot;');
      const activeAttribute = file.id === assistantActiveItemId ? ' active="true"' : '';
      return [`<project_file path="${escapedPath}" language="${language}"${activeAttribute}>\n${visibleContent}\n</project_file>`];
    }).join('\n\n');
    const projectWorkspaceContext = `
        Project Workspace:
        ${projectTree || '(empty)'}

        Project File Contents:
        ${projectFileContents || '(no file contents available)'}
        ${omittedProjectFileCount > 0 ? `\n        (${omittedProjectFileCount} additional project file${omittedProjectFileCount === 1 ? '' : 's'} omitted from this prompt budget.)` : ''}
    `;
    const assistantCodingGuidance = `
        C# runtime constraint: Do not generate or modify code that sets System.Console.OutputEncoding, Console.OutputEncoding, or similar console encoding properties. CodeCraft manages console output encoding internally.
        When local tools are available, use docsGet for exact generated semantic-documentation lookups by item name. Use docsFind only for natural-language documentation search.
        ${useSemanticDocumentationFirst && hasCSharpSemanticDocumentation ? `
        The user enabled documentation-first lookup for this C# request.
        Before answering, editing, or inspecting source for a C# type/member/behavior, first run docsFind with only the natural-language description and hideReason=true. Do not set typeLimit, memberLimit, or hideDocumentation.
        If using the terminal command directly, the only docs find option you may add is --hide-reason: docs find --hide-reason <description>.
        After docsFind returns results, use codinGet with the exact C# symbol path from the chosen documentation result before relying on or modifying the source code.
        If docsFind returns no usable documentation result, explain that briefly, then continue with normal project inspection.
        ` : ''}
    `;

    if (useChainOfThought && hasAssistantTools) {
      return `
        Context: You are an AI coding assistant inside CodeCraft IDE.
        Internal Chat ID: ${chatId}
        Keep continuity with the existing chat history for this chat.
        You are in tool-driven Chain of Thought mode.
        Use local terminal tools to inspect the project one command at a time instead of assuming unseen files or folders.
        Use docsGet when the user asks for generated documentation for an exact item name.
        Use runTerminalCommand for any command supported by CodeCraft's built-in terminal, including source-control, package, documentation, and navigation commands.
        When you want to change code, use 'proposeEdit' so the user can review it.
        Keep user-facing explanations separate from tool and edit logs.
        If you need more context, discover it through the available terminal tools.
        You have at most ${maxChainOfThoughtDepth} tool rounds available for this turn, so prioritize your steps.
        ${assistantCodingGuidance}

        Current terminal working directory: ${assistantTerminalCwd ? `/${getPathFromSnapshot(assistantTerminalCwd)}` : '/'}
        ${projectWorkspaceContext}

        Active Item: ${activeSnapshotItem ? getPathFromSnapshot(activeSnapshotItem.id) : 'None selected'}
        ${activeSnapshotItem ? (activeSnapshotItem.type === 'file' ? `Active file content:\n${activeSnapshotItem.content || ''}` : 'The active item is a folder.') : 'No file is currently active.'}

        Chat History:
        ${history || '(empty)'}
        ${toolProgress}
        ${liveAssistantProgress}

        USER: ${userContent}
      `;
    }

    if (useChainOfThought) {
      return `
        Context: You are an AI coding assistant inside CodeCraft IDE.
        Internal Chat ID: ${chatId}
        Keep continuity with the existing chat history for this chat.
        The selected provider/model supports reasoning, but CodeCraft cannot expose its local tools through this provider/model.
        Reason carefully, keep conclusions user-facing, and avoid claiming you changed files unless a tool is available to do it.
        ${assistantCodingGuidance}

        Current terminal working directory: ${assistantTerminalCwd ? `/${getPathFromSnapshot(assistantTerminalCwd)}` : '/'}
        ${projectWorkspaceContext}

        Active Item: ${activeSnapshotItem ? getPathFromSnapshot(activeSnapshotItem.id) : 'None selected'}
        ${activeSnapshotItem ? (activeSnapshotItem.type === 'file' ? `Active file content:\n${activeSnapshotItem.content || ''}` : 'The active item is a folder.') : 'No file is currently active.'}

        Chat History:
        ${history || '(empty)'}
        ${toolProgress}
        ${liveAssistantProgress}

        USER: ${userContent}
      `;
    }

    if (!hasAssistantTools) {
      return `
        Context: You are an AI coding assistant inside CodeCraft IDE.
        Internal Chat ID: ${chatId}
        Keep continuity with the existing chat history for this chat.
        CodeCraft cannot expose its local tools through this provider/model, so answer from the visible workspace context below and avoid claiming you changed files.
        ${assistantCodingGuidance}

        Current terminal working directory: ${assistantTerminalCwd ? `/${getPathFromSnapshot(assistantTerminalCwd)}` : '/'}
        ${projectWorkspaceContext}

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
        Internal Chat ID: ${chatId}
        Keep continuity with the existing chat history for this chat.
        You have access to tools to propose edits, navigate, move cursor, directly create/delete/move files or folders, retrieve generated documentation with docsGet, and run built-in terminal commands.
        Do not suggest terminal-style commands for filesystem operations when a tool can be used, unless the user specifically asks for it.
        When you want to change code, use 'proposeEdit' so the user can review it.
        You may use multiple tool calls in a single response when the task needs several actions.
        If you have a plan, progress update, or explanation, include it in the same response as your tool calls. That text is shown to the user immediately.
        Do not save every explanation for one final summary if the work is happening in multiple steps.
        If you need the contents of another file before editing it, navigate to it first. On the next tool round in the same turn, the updated active item and its content will be shown to you.
        If more than one action is needed, emit all needed tool calls in order in the same response instead of stopping after the first action.
        ${assistantCodingGuidance}

        ${projectWorkspaceContext}

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
    if (buffer.byteLength === 0) {
      Atomics.store(header, 1, 0);
      Atomics.store(header, 0, 1);
      Atomics.notify(header, 0, 1);
      return;
    }

    const encoder = new TextEncoder();
    let encoded = encoder.encode(JSON.stringify(payload));
    if (encoded.length > buffer.byteLength) {
      encoded = encoder.encode(JSON.stringify({
        __codecraftError: `Runtime stdin response is too large for the ${buffer.byteLength} byte shared buffer.`,
      }));
    }
    if (encoded.length > buffer.byteLength) {
      encoded = encoder.encode('{}').subarray(0, buffer.byteLength);
    }
    buffer.fill(0);
    buffer.set(encoded, 0);
    Atomics.store(header, 1, encoded.length);
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

  const buildJavaScriptProjectUrlMap = async (projectFiles: ProjectSourceFile[]) => {
    const importableFileByPath = new Map<string, ProjectSourceFile>();
    for (const file of toProjectSourceFiles(getProjectRunnableFiles())) {
      importableFileByPath.set(file.path, file);
    }
    for (const file of projectFiles) {
      importableFileByPath.set(file.path, file);
    }

    const importableFiles = [...importableFileByPath.values()];
    const cssFiles = importableFiles.filter(isCssProjectFile);
    const selectedJavaScriptPaths = new Set(projectFiles.filter(isJavaScriptRuntimeProjectFile).map(file => file.path));
    const rawJavaScriptFiles = await Promise.all(importableFiles
      .filter(isJavaScriptRuntimeProjectFile)
      .map(async file => ({
        ...file,
        content: await transpileTypeScriptProjectFile(file),
      })));
    const scriptPaths = new Set(rawJavaScriptFiles.map(file => file.path));
    const styleFiles = new Map(cssFiles.map(file => [file.path, file]));
    const javascriptFiles = rawJavaScriptFiles.map(file => ({
      ...file,
      content: rewriteJavaScriptModuleSpecifiers(file.content, file.path, scriptPaths, styleFiles),
    }));
    const urlByPath = new Map<string, string>();
    const cssUrlByPath = new Map<string, string>();

    for (const file of javascriptFiles) {
      urlByPath.set(
        file.path,
        createJavaScriptDataUrl(file.content)
      );
    }

    for (const file of cssFiles) {
      cssUrlByPath.set(
        file.path,
        createJavaScriptDataUrl(createJavaScriptStyleModuleSource(file))
      );
    }

    const imports = await getJavaScriptRuntimeImportMapImports();
    for (const file of javascriptFiles) {
      const fileUrl = urlByPath.get(file.path);
      if (!fileUrl) continue;
      imports[getRuntimeProjectModuleSpecifier(file.path)] = fileUrl;
    }
    for (const file of cssFiles) {
      const fileUrl = cssUrlByPath.get(file.path);
      if (!fileUrl) continue;
      imports[getRuntimeProjectModuleSpecifier(file.path)] = fileUrl;
    }

    return {
      urlByPath,
      scopes: {},
      imports,
      files: javascriptFiles.filter(file => selectedJavaScriptPaths.has(file.path)),
      cssFiles,
    };
  };

  const buildJavaScriptProjectPreview = async (
    projectFiles: ProjectSourceFile[],
    entryFile: ProjectSourceFile
  ) => {
    const {
      urlByPath,
      scopes,
      imports,
      cssFiles: transformedCssFiles,
    } = await buildJavaScriptProjectUrlMap(projectFiles);
    const isTsxEntry = isTsxProjectFile(entryFile);
    const entryUrl = urlByPath.get(entryFile.path) || '';
    const selectedCssPaths = new Set(projectFiles.filter(isCssProjectFile).map(file => file.path));
    const cssFiles = isTsxProjectFile(entryFile)
      ? transformedCssFiles.filter(file => selectedCssPaths.has(file.path))
      : [];
    const cssAssetTags = cssFiles.map(file => (
      `  <style data-codecraft-css="${escapeHtml(file.path)}">\n/* ${escapeHtmlRawTextElement(file.path)} */\n${escapeHtmlRawTextElement(file.content)}\n  </style>`
    )).join('\n');
    const rootMarkup = isTsxEntry ? '  <div id="root"></div>\n' : '';
    const autoRenderTsxEntry = isTsxEntry
      ? `
      const renderTsxEntryExport = (value) => {
        if (value == null) return false;
        let root = document.getElementById('root');
        if (!root) {
          root = document.createElement('div');
          root.id = 'root';
          document.body.prepend(root);
        }
        globalThis.ReactDOM.createRoot(root).render(value);
        return true;
      };
      if (!renderTsxEntryExport(entryModule.default)) {
        renderTsxEntryExport(entryModule.App);
      }`
      : '';

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
    #root {
      min-height: 100vh;
    }
  </style>
${cssAssetTags}
  ${getOutputPreviewBrowserApiShimScriptTag()}
  <script type="importmap">${JSON.stringify({ imports, scopes })}</script>
</head>
<body>
${rootMarkup}
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
    appendLine('status', 'Running JavaScript / TypeScript project: ${escapeHtml(entryFile.path)}');

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
      const entryModule = await import(${JSON.stringify(entryUrl)});
${autoRenderTsxEntry}
      appendLine('status', 'JavaScript / TypeScript project finished.');
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
    const isTsxEntry = isTsxProjectFile(entryFile);
    const cssFiles = isTsxEntry ? projectFiles.filter(isCssProjectFile) : [];
    const htmlFiles = isTsxEntry ? projectFiles.filter(isHtmlProjectFile) : [];
    const details = [
      cssFiles.length > 0 ? `${cssFiles.length} selected CSS file(s) applied` : '',
      htmlFiles.length > 0 ? `${htmlFiles.length} selected HTML file(s) available as alternate entry pages` : '',
    ].filter(Boolean);

    setExecutionStartupStatus('');
    setOutput(
      details.length > 0
        ? `JavaScript / TypeScript project running from ${entryFile.path}. ${details.join('. ')}. Console output appears in the Output preview.`
        : `JavaScript / TypeScript project running from ${entryFile.path}. Console output appears in the Output preview.`
    );
    selectDockPanel('output');
    const preview = await buildJavaScriptProjectPreview(projectFiles, entryFile);
    showOutputPreview(preview.html, preview.objectUrls);
  };

  const runHtmlProject = async (
    projectFiles: ProjectSourceFile[],
    entryFile: ProjectSourceFile
  ) => {
    const buildHtmlProjectPreview = async () => {
      const {
        urlByPath: javascriptUrlByPath,
        scopes: javascriptScopes,
        imports: javascriptImports,
        files: javascriptFiles,
        cssFiles: transformedCssFiles,
      } = await buildJavaScriptProjectUrlMap(projectFiles);
      const selectedCssPaths = new Set(projectFiles.filter(isCssProjectFile).map(file => file.path));
      const cssFiles = transformedCssFiles.filter(file => selectedCssPaths.has(file.path));
      const cssByPath = new Map(cssFiles.map(file => [file.path, file]));
      const javascriptByPath = new Map(javascriptFiles.map(file => [file.path, file]));
      const javascriptPathSet = new Set(javascriptFiles.map(file => file.path));
      const appliedCssPaths = new Set<string>();
      const appliedJavaScriptPaths = new Set<string>();
      const parser = new DOMParser();
      const document = parser.parseFromString(entryFile.content, 'text/html');
      const browserApiShim = document.createElement('script');
      browserApiShim.textContent = getOutputPreviewBrowserApiShimSource();
      document.head.prepend(browserApiShim);

      const createStyleElement = (file: ProjectSourceFile, source: string) => {
        const style = document.createElement('style');
        style.setAttribute('data-codecraft-css', file.path);
        style.setAttribute('data-codecraft-source', source);
        style.textContent = `\n/* ${file.path} */\n${file.content}\n`;
        return style;
      };

      const createScriptElement = (file: ProjectSourceFile, source: string) => {
        const script = document.createElement('script');
        const scriptUrl = javascriptUrlByPath.get(file.path);
        script.setAttribute('data-codecraft-js', file.path);
        script.setAttribute('data-codecraft-source', source);
        if (containsJavaScriptModuleSyntax(file.content)) {
          script.type = 'module';
        }
        if (scriptUrl) {
          script.src = scriptUrl;
        }
        return script;
      };

      for (const link of Array.from(document.querySelectorAll('link[href]'))) {
        const rel = link.getAttribute('rel') || '';
        const href = link.getAttribute('href') || '';
        if (!/\bstylesheet\b/i.test(rel) || isExternalProjectResourceSpecifier(href)) continue;

        const resolvedPath = resolveProjectRelativePath(entryFile.path, stripProjectResourceSuffix(href));
        const cssFile = cssByPath.get(resolvedPath);
        if (!cssFile) {
          link.remove();
          continue;
        }

        const style = createStyleElement(cssFile, 'link');
        const media = link.getAttribute('media');
        if (media) style.setAttribute('media', media);
        link.replaceWith(style);
        appliedCssPaths.add(cssFile.path);
      }

      const javascriptScopeKeys = Object.keys(javascriptScopes);
      if (javascriptScopeKeys.length > 0 || Object.keys(javascriptImports).length > 0) {
        const importMap = document.createElement('script');
        importMap.type = 'importmap';
        importMap.textContent = JSON.stringify({ imports: javascriptImports, scopes: javascriptScopes });
        document.head.prepend(importMap);
      }

      for (const script of Array.from(document.querySelectorAll('script[src]'))) {
        const src = script.getAttribute('src') || '';
        if (isExternalProjectResourceSpecifier(src)) continue;

        const resolvedPath = resolveProjectScriptPath(entryFile.path, src, javascriptPathSet);
        const javascriptFile = javascriptByPath.get(resolvedPath);
        const scriptUrl = javascriptFile ? javascriptUrlByPath.get(javascriptFile.path) : '';
        if (!javascriptFile || !scriptUrl) {
          script.remove();
          continue;
        }

        script.setAttribute('src', scriptUrl);
        if (!script.getAttribute('type') && containsJavaScriptModuleSyntax(javascriptFile.content)) {
          script.setAttribute('type', 'module');
        }
        script.setAttribute('data-codecraft-js', javascriptFile.path);
        script.setAttribute('data-codecraft-source', 'script');
        script.removeAttribute('integrity');
        script.removeAttribute('crossorigin');
        appliedJavaScriptPaths.add(javascriptFile.path);
      }

      for (const cssFile of cssFiles) {
        if (appliedCssPaths.has(cssFile.path)) continue;
        document.head.appendChild(createStyleElement(cssFile, 'selection'));
      }

      for (const javascriptFile of javascriptFiles) {
        if (appliedJavaScriptPaths.has(javascriptFile.path)) continue;
        document.body.appendChild(createScriptElement(javascriptFile, 'selection'));
      }

      const html = `<!DOCTYPE html>\n${document.documentElement.outerHTML}`;
      return {
        html,
        objectUrls: [],
      };
    };

    const htmlFiles = projectFiles.filter(isHtmlProjectFile);
    const cssFiles = projectFiles.filter(isCssProjectFile);
    const javascriptFiles = projectFiles.filter(isJavaScriptRuntimeProjectFile);
    const details = [
      htmlFiles.length > 1
        ? `${htmlFiles.length - 1} additional HTML file(s) remain available as alternate entry pages`
        : '',
      cssFiles.length > 0
        ? `${cssFiles.length} selected CSS file(s) applied`
        : '',
      javascriptFiles.length > 0
        ? `${javascriptFiles.length} selected JavaScript/TypeScript file(s) available to the page`
        : '',
    ].filter(Boolean);

    setExecutionStartupStatus('');
    setOutput(
      details.length > 0
        ? `Previewing ${entryFile.path}. ${details.join('. ')}.`
        : `Previewing ${entryFile.path}.`
    );
    selectDockPanel('output');
    const preview = await buildHtmlProjectPreview();
    showOutputPreview(preview.html, preview.objectUrls);
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

  const getCSharpInteractiveWorker = () => {
    if (!csharpInteractiveWorkerRef.current) {
      csharpInteractiveWorkerRef.current = new Worker(new URL('./csharp-runner.worker.ts', import.meta.url));
    }
    return csharpInteractiveWorkerRef.current;
  };

  const terminateCSharpInteractiveWorker = (error = new Error('C# interactive runner was stopped.')) => {
    const rejectActiveRun = csharpInteractiveWorkerRunRejectRef.current;
    csharpInteractiveWorkerRunRejectRef.current = null;
    csharpInteractiveWorkerRef.current?.terminate();
    csharpInteractiveWorkerRef.current = null;
    rejectActiveRun?.(error);
  };

  const runCSharpInInteractiveWorker = (payload: {
    mode: 'regular' | 'script' | 'script-context' | 'project';
    code?: string;
    contextId?: string;
    resetContext?: boolean;
    paths?: string[];
    contents?: string[];
    entryPath?: string;
    runtimePaths?: string[];
    runtimeContents?: string[];
    includeNamespaces?: string[];
  }): Promise<any> => new Promise((resolve, reject) => {
    if (csharpInteractiveWorkerRunRejectRef.current) {
      reject(new Error('C# interactive runner is already active.'));
      return;
    }

    const worker = getCSharpInteractiveWorker();
    let settled = false;

    const finish = (callback: () => void) => {
      if (settled) return;
      settled = true;
      if (csharpInteractiveWorkerRunRejectRef.current) {
        csharpInteractiveWorkerRunRejectRef.current = null;
      }
      worker.onmessage = null;
      worker.onerror = null;
      callback();
    };

    csharpInteractiveWorkerRunRejectRef.current = (error) => {
      finish(() => reject(error));
    };

    worker.onmessage = (event) => {
      const message = event.data || {};
      if ((message.type === 'stdout' || message.type === 'stderr') && typeof message.text === 'string') {
        setOutput(prev => prev + message.text);
        return;
      }
      if (
        message.type === 'stdin-request'
        && message.headerBuffer instanceof SharedArrayBuffer
        && message.payloadBuffer instanceof SharedArrayBuffer
      ) {
        void performRuntimeInteraction(
          'csharp',
          settings.csharpIOMode,
          'stdin',
          typeof message.prompt === 'string' && message.prompt ? message.prompt : 'C# stdin> ',
          ''
        ).then((value) => {
          completeSharedBufferInteraction(
            message.headerBuffer,
            message.payloadBuffer,
            { value: value ?? '' }
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
        finish(() => resolve(message.result));
        return;
      }
      if (message.type === 'error') {
        finish(() => reject(new Error(typeof message.message === 'string' ? message.message : 'C# worker execution failed.')));
      }
    };

    worker.onerror = (event) => {
      terminateCSharpInteractiveWorker(new Error(event.message || 'C# worker execution failed.'));
    };

    worker.postMessage({ type: 'run', ...payload });
  });

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

  const writePythonRuntimeFiles = (pyodide: any, rootPath: string, runtimeFiles: RuntimeFileSnapshot[]) => {
    removePyodideFsPath(pyodide, rootPath);
    ensurePyodideDirectory(pyodide, rootPath);

    for (const file of runtimeFiles) {
      const fullPath = `${rootPath}/${normalizeRuntimeWorkspacePath(file.path, 'file.txt')}`;
      const parentPath = dirnameProjectPath(fullPath);
      if (parentPath) {
        ensurePyodideDirectory(pyodide, parentPath);
      }
      pyodide.FS.writeFile(fullPath, file.content, { encoding: 'utf8' });
    }
  };

  const collectPyodideRuntimeWorkspaceFiles = async (pyodide: any, rootPath: string): Promise<RuntimeFileSnapshot[]> => {
    const json = await pyodide.runPythonAsync(`
import json
import os

_codecraft_root = ${JSON.stringify(rootPath)}
_codecraft_files = []
if os.path.isdir(_codecraft_root):
    for _dirpath, _dirnames, _filenames in os.walk(_codecraft_root):
        _dirnames[:] = sorted(_dirnames)
        for _filename in sorted(_filenames):
            _path = os.path.join(_dirpath, _filename)
            _rel = os.path.relpath(_path, _codecraft_root).replace(os.sep, "/")
            try:
                with open(_path, "r", encoding="utf-8", errors="replace") as _file:
                    _content = _file.read()
            except Exception:
                continue
            _codecraft_files.append({"path": _rel, "content": _content})
json.dumps(_codecraft_files)
`);
    try {
      const parsed = JSON.parse(String(json || '[]'));
      return Array.isArray(parsed)
        ? parsed
          .filter((file): file is RuntimeFileSnapshot => (
            file
            && typeof file.path === 'string'
            && typeof file.content === 'string'
          ))
          .map(file => ({ path: normalizeRuntimeWorkspacePath(file.path, 'output.txt'), content: file.content }))
        : [];
    } catch {
      return [];
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

      const projectRoot = '/workspace';
      const runtimeFiles = getRuntimeWorkspaceFilesFromExplorer(filesRef.current);
      const initialRuntimeFiles = buildRuntimeWorkspaceInitialFileMap(runtimeFiles);
      writePythonRuntimeFiles(pyodide, projectRoot, runtimeFiles);
      appendExecutionStartupStatus(`Loaded ${projectFiles.length} Python project file(s).`);

      const entryPath = `${projectRoot}/${normalizeRuntimeWorkspacePath(entryFile.path, entryFile.name || 'main.py')}`;
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
    os.chdir(project_root)
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
      syncRuntimeWorkspaceFilesToExplorer(initialRuntimeFiles, await collectPyodideRuntimeWorkspaceFiles(pyodide, projectRoot));
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

  const runPython = async (entryFile: ProjectSourceFile) => {
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
      await ensurePyodideUsesTypeshedSurface(entryFile.content);
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

      const projectRoot = '/workspace';
      const runtimeFiles = getRuntimeWorkspaceFilesFromExplorer(filesRef.current);
      const initialRuntimeFiles = buildRuntimeWorkspaceInitialFileMap(runtimeFiles);
      writePythonRuntimeFiles(pyodide, projectRoot, runtimeFiles);
      const entryPath = `${projectRoot}/${normalizeRuntimeWorkspacePath(entryFile.path, entryFile.name || 'main.py')}`;
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
    os.chdir(project_root)
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
      syncRuntimeWorkspaceFilesToExplorer(initialRuntimeFiles, await collectPyodideRuntimeWorkspaceFiles(pyodide, projectRoot));
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

    const scriptId = 'codecraft-csharp-wasm-loader';
    const pendingRuntime = new Promise<void>((resolve, reject) => {
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

    csharpRuntimeReadyRef.current = pendingRuntime.catch(error => {
      csharpRuntimeReadyRef.current = null;
      document.getElementById(scriptId)?.remove();
      throw error;
    });

    return csharpRuntimeReadyRef.current;
  };

  const includeCSharpRuntimeNamespaces = async (
    BrowserCSharp: BrowserCSharpModule['BrowserCSharp'],
    namespaceNames = loadSavedCSharpNamespaces()
  ) => {
    const namespaces = [...new Set(namespaceNames.map(name => name.trim()).filter(Boolean))];
    if (namespaces.length === 0) return [];
    return BrowserCSharp.includeNamespaces(namespaces);
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

      const useInteractiveWorker = settings.csharpIOMode === 'interactive-output-panel';
      const csharpModule = useInteractiveWorker ? null : await getBrowserCSharpModule();
      if (!useInteractiveWorker) {
        await ensureCSharpRuntime();
      }
      const BrowserCSharp = csharpModule?.BrowserCSharp;
      const runtimeIncludeNamespaces = loadSavedCSharpNamespaces();
      if (BrowserCSharp) {
        await includeCSharpRuntimeNamespaces(BrowserCSharp, runtimeIncludeNamespaces);
      }
      const contextId = getCSharpScriptContextId(fileId);
      const sourceItem = filesRef.current.find(item => item.id === fileId && item.type === 'file');
      const sourcePath = sourceItem ? getFsItemPath(filesRef.current, sourceItem.id) : 'Program.cs';
      const runtimeProjectFiles: ProjectSourceFile[] = [{
        id: fileId,
        name: sourceItem?.name || sourcePath.split('/').pop() || 'Program.cs',
        path: normalizeRuntimeWorkspacePath(sourcePath, 'Program.cs'),
        content: code,
        language: 'csharp',
      }];
      const runtimeFiles = getRuntimeWorkspaceFilesFromExplorer(filesRef.current);
      const runtimeFilesWithCurrentSource = runtimeFiles.map(file => (
        file.path === runtimeProjectFiles[0].path ? { ...file, content: code } : file
      ));
      if (!runtimeFilesWithCurrentSource.some(file => file.path === runtimeProjectFiles[0].path)) {
        runtimeFilesWithCurrentSource.push({ path: runtimeProjectFiles[0].path, content: code });
      }
      const initialRuntimeFiles = buildRuntimeWorkspaceInitialFileMap(runtimeFilesWithCurrentSource);

      const executeCSharp = async () => {
        if (useInteractiveWorker) {
          if (settings.csharpExecutionMode === 'regular') {
            return runCSharpInInteractiveWorker({
              mode: 'project',
              paths: runtimeProjectFiles.map(file => file.path),
              contents: runtimeProjectFiles.map(file => file.content),
              entryPath: runtimeProjectFiles[0].path,
              runtimePaths: runtimeFilesWithCurrentSource.map(file => file.path),
              runtimeContents: runtimeFilesWithCurrentSource.map(file => file.content),
              includeNamespaces: runtimeIncludeNamespaces,
            });
          }
          if (settings.csharpExecutionMode === 'script-context') {
            return runCSharpInInteractiveWorker({
              mode: 'script-context',
              code,
              contextId,
              resetContext: settings.csharpResetScriptContextBeforeRun,
              includeNamespaces: runtimeIncludeNamespaces,
            });
          }
          if (settings.csharpExecutionMode === 'script') {
            return runCSharpInInteractiveWorker({ mode: 'script', code, includeNamespaces: runtimeIncludeNamespaces });
          }
          return runCSharpInInteractiveWorker({ mode: 'regular', code, includeNamespaces: runtimeIncludeNamespaces });
        }

        if (!BrowserCSharp) {
          throw new Error('C# runtime module is unavailable.');
        }
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
        return BrowserCSharp.executeRegularProjectWithFiles(
          runtimeProjectFiles.map(file => file.path),
          runtimeProjectFiles.map(file => file.content),
          runtimeProjectFiles[0].path,
          runtimeFilesWithCurrentSource.map(file => file.path),
          runtimeFilesWithCurrentSource.map(file => file.content)
        );
      };

      setExecutionStartupStatus('');
      const result = await withExecutionTimeout(
        'C# execution',
        settings.csharpExecutionTimeoutMs,
        executeCSharp,
        async () => {
          if (useInteractiveWorker) {
            resolveOutputPanelInteraction(null);
            terminateCSharpInteractiveWorker(
              createExecutionTimeoutError('C# execution', settings.csharpExecutionTimeoutMs)
            );
            return;
          }
          if (settings.csharpExecutionMode === 'script-context') {
            try {
              await BrowserCSharp?.clearScriptContext(contextId);
            } catch { }
          }
        }
      );

      const stdOut = (result.stdOut || '').trim();
      const stdErr = (result.stdErr || '').trim();
      const returnValue = formatRuntimeReturnValue(result.result);

      const chunks: string[] = [];
      if (stdErr) chunks.push(stdErr);
      if (stdOut) chunks.push(stdOut);
      if (returnValue) {
        chunks.push(`Return value: ${returnValue}`);
      }

      const finalOutput = chunks.join('\n');
      if (useInteractiveWorker) {
        setOutput(prev => {
          if (!finalOutput) return prev || 'C# executed successfully with no output.';
          return prev ? `${prev}${prev.endsWith('\n') ? '' : '\n'}${finalOutput}` : finalOutput;
        });
      } else {
        setOutput(finalOutput || 'C# executed successfully with no output.');
      }
      if (settings.csharpExecutionMode === 'regular') {
        syncRuntimeWorkspaceFilesToExplorer(initialRuntimeFiles, Array.isArray((result as any).files) ? (result as any).files : []);
      }
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

      const useInteractiveWorker = settings.csharpIOMode === 'interactive-output-panel';
      const csharpModule = useInteractiveWorker ? null : await getBrowserCSharpModule();
      if (!useInteractiveWorker) {
        await ensureCSharpRuntime();
      }
      const BrowserCSharp = csharpModule?.BrowserCSharp;
      const runtimeIncludeNamespaces = loadSavedCSharpNamespaces();
      if (BrowserCSharp) {
        await includeCSharpRuntimeNamespaces(BrowserCSharp, runtimeIncludeNamespaces);
      }
      const note = settings.csharpExecutionMode === 'regular'
        ? ''
        : ' Project run uses regular C# compilation.';
      setExecutionStartupStatus(`Compiling and executing C# project from ${entryFile.path}.${note}`);
      const runtimeProjectFiles = projectFiles.map(file => ({
        ...file,
        path: normalizeRuntimeWorkspacePath(file.path, file.name || 'Program.cs'),
      }));
      const runtimeFiles = getRuntimeWorkspaceFilesFromExplorer(filesRef.current);
      const runtimeSourceByPath = new Map(runtimeProjectFiles.map(file => [file.path, file.content]));
      const runtimeFilesWithCurrentSources = runtimeFiles.map(file => (
        runtimeSourceByPath.has(file.path) ? { ...file, content: runtimeSourceByPath.get(file.path) || '' } : file
      ));
      for (const file of runtimeProjectFiles) {
        if (!runtimeFilesWithCurrentSources.some(runtimeFile => runtimeFile.path === file.path)) {
          runtimeFilesWithCurrentSources.push({ path: file.path, content: file.content });
        }
      }
      const initialRuntimeFiles = buildRuntimeWorkspaceInitialFileMap(runtimeFilesWithCurrentSources);

      const result = await withExecutionTimeout(
        'C# execution',
        settings.csharpExecutionTimeoutMs,
        () => useInteractiveWorker
          ? runCSharpInInteractiveWorker({
            mode: 'project',
            paths: runtimeProjectFiles.map(file => file.path),
            contents: runtimeProjectFiles.map(file => file.content),
            entryPath: normalizeRuntimeWorkspacePath(entryFile.path, entryFile.name || 'Program.cs'),
            runtimePaths: runtimeFilesWithCurrentSources.map(file => file.path),
            runtimeContents: runtimeFilesWithCurrentSources.map(file => file.content),
            includeNamespaces: runtimeIncludeNamespaces,
          })
          : BrowserCSharp!.executeRegularProjectWithFiles(
            runtimeProjectFiles.map(file => file.path),
            runtimeProjectFiles.map(file => file.content),
            normalizeRuntimeWorkspacePath(entryFile.path, entryFile.name || 'Program.cs'),
            runtimeFilesWithCurrentSources.map(file => file.path),
            runtimeFilesWithCurrentSources.map(file => file.content)
          ),
        async () => {
          if (useInteractiveWorker) {
            resolveOutputPanelInteraction(null);
            terminateCSharpInteractiveWorker(
              createExecutionTimeoutError('C# execution', settings.csharpExecutionTimeoutMs)
            );
          }
        }
      );

      const stdOut = (result.stdOut || '').trim();
      const stdErr = (result.stdErr || '').trim();
      const returnValue = formatRuntimeReturnValue(result.result);

      const chunks: string[] = [];
      if (stdErr) chunks.push(stdErr);
      if (stdOut) chunks.push(stdOut);
      if (returnValue) {
        chunks.push(`Return value: ${returnValue}`);
      }

      setExecutionStartupStatus('');
      const finalOutput = chunks.join('\n');
      if (useInteractiveWorker) {
        setOutput(prev => {
          if (!finalOutput) return prev || 'C# project executed successfully with no output.';
          return prev ? `${prev}${prev.endsWith('\n') ? '' : '\n'}${finalOutput}` : finalOutput;
        });
      } else {
        setOutput(finalOutput || 'C# project executed successfully with no output.');
      }
      syncRuntimeWorkspaceFilesToExplorer(initialRuntimeFiles, Array.isArray((result as any).files) ? (result as any).files : []);
    } catch (err) {
      setExecutionStartupStatus('');
      setOutput(`C# Error: ${err instanceof Error ? err.message : String(err)}`);
    }
  };

  const getCxxRuntimeLabel = (language: ProjectRuntimeLanguage) => (
    language === 'cpp' ? 'C++' : 'C'
  );

  const requestCxxRuntimeInput = async (
    runtimeLanguage: 'c' | 'cpp',
    promptText = ''
  ) => {
    const label = getCxxRuntimeLabel(runtimeLanguage);
    if (settings.cxxIOMode === 'interactive-output-panel') {
      selectDockPanel('output');
      const response = await requestOutputPanelInteraction(
        runtimeLanguage,
        'stdin',
        '',
        '',
        {
          transcriptPrompt: promptText || `${label} stdin> `,
          inputMode: 'single-line',
          placeholder: 'Type input and press Enter',
          submitLabel: 'Send',
          cancelLabel: 'Cancel',
        }
      );
      if (response === null) {
        throw new Error(`${label} input cancelled.`);
      }
      return String(response ?? '');
    }

    const value = window.prompt(promptText || `${label} stdin:`, '');
    if (value === null) {
      throw new Error(`${label} input cancelled.`);
    }
    return value;
  };

  const formatCxxExecutionOutput = (
    result: Awaited<ReturnType<CxxRuntimeModule['compileAndRunCxxProject']>>,
    runtimeLanguage: 'c' | 'cpp',
    options?: { runtimeOutputStreamed?: boolean }
  ) => {
    const chunks: string[] = [];
    const compilerDiagnostics = [result.compile.stderr.trim(), result.compile.stdout.trim()]
      .filter(Boolean)
      .join('\n')
      .trim();
    if (compilerDiagnostics) {
      chunks.push(`Compiler diagnostics:\n${compilerDiagnostics}`);
    }

    if (!options?.runtimeOutputStreamed) {
      const stderr = result.run.stderr.trim();
      const stdout = result.run.stdout.trim();
      if (stderr) chunks.push(stderr);
      if (stdout) chunks.push(stdout);
    }
    if (!result.run.ok) {
      chunks.push(`Program exited with code ${result.run.code}.`);
    }

    return chunks.join('\n') || (options?.runtimeOutputStreamed
      ? ''
      : `${getCxxRuntimeLabel(runtimeLanguage)} executed successfully with no output.`);
  };

  const formatCxxRuntimeError = (err: unknown) => {
    const baseMessage = err instanceof Error ? err.message : String(err);
    const compile = (err as any)?.compile;
    const run = (err as any)?.run;
    const details = [
      compile?.stderr?.trim?.(),
      compile?.stdout?.trim?.(),
      run?.stderr?.trim?.(),
      run?.stdout?.trim?.(),
    ].filter(Boolean);
    return details.length > 0 ? `${baseMessage}\n${details.join('\n')}` : baseMessage;
  };

  const runCxxProject = async (
    projectFiles: ProjectSourceFile[],
    entryFile: ProjectSourceFile,
    runtimeLanguage: 'c' | 'cpp'
  ) => {
    const runtimeLabel = getCxxRuntimeLabel(runtimeLanguage);
    try {
      if (settings.cxxIOMode === 'interactive-output-panel') {
        selectDockPanel('output');
      }
      setOutput('');
      console.clear();

      const cxxProjectFiles = projectFiles
        .filter(file => file.language === 'c' || file.language === 'cpp')
        .map(file => ({
          path: file.path,
          content: file.content,
          language: file.language as 'c' | 'cpp',
        }));

      setExecutionStartupStatus(`Preparing ${runtimeLabel} project from ${entryFile.path}...`);

      const cxxRuntime = await getCxxRuntimeModule();
      const streamRuntimeOutput = settings.cxxIOMode === 'interactive-output-panel';
      const result = await withExecutionTimeout(
        `${runtimeLabel} execution`,
        settings.cxxExecutionTimeoutMs,
        () => cxxRuntime.compileAndRunCxxProject({
          files: cxxProjectFiles,
          entryPath: entryFile.path,
          language: runtimeLanguage,
          cStandard: settings.cxxCStandard,
          cppStandard: settings.cxxCppStandard,
          optimization: settings.cxxOptimizationLevel,
          requestStdin: (prompt) => requestCxxRuntimeInput(runtimeLanguage, prompt),
          onStdout: streamRuntimeOutput ? (chunk) => setOutput(prev => prev + chunk) : undefined,
          onStderr: streamRuntimeOutput ? (chunk) => setOutput(prev => prev + chunk) : undefined,
          onStatus: appendExecutionStartupStatus,
        })
      );

      setExecutionStartupStatus('');
      const formattedOutput = formatCxxExecutionOutput(result, runtimeLanguage, {
        runtimeOutputStreamed: streamRuntimeOutput,
      });
      if (formattedOutput) {
        setOutput(prev => [prev.trimEnd(), formattedOutput].filter(Boolean).join('\n'));
      }
    } catch (err) {
      setExecutionStartupStatus('');
      setOutput(prev => [prev.trimEnd(), `${runtimeLabel} Error: ${formatCxxRuntimeError(err)}`].filter(Boolean).join('\n'));
    } finally {
      if (settings.cxxRuntimeLifecycle === 'keep-warm') {
        resetCxxRuntimeIdleTimer();
      } else {
        disposeCxxRuntime();
      }
    }
  };

  const requestJavaRuntimeInput = async (promptText = '') => {
    if (settings.javaIOMode === 'interactive-output-panel') {
      selectDockPanel('output');
      const response = await requestOutputPanelInteraction(
        'java',
        'stdin',
        '',
        '',
        {
          transcriptPrompt: promptText,
          inputMode: 'single-line',
          placeholder: 'Type input and press Enter',
          submitLabel: 'Send',
          cancelLabel: 'Cancel',
        }
      );
      if (response === null) {
        throw new Error('Java input cancelled.');
      }
      return String(response ?? '');
    }

    const value = window.prompt(promptText || 'Java stdin:', '');
    if (value === null) {
      throw new Error('Java input cancelled.');
    }
    return value;
  };

  const formatJavaExecutionOutput = (
    result: Awaited<ReturnType<JavaRuntimeModule['compileAndRunJavaProject']>>,
    options?: { runtimeOutputStreamed?: boolean }
  ) => {
    const chunks: string[] = [];
    const compilerDiagnostics = [result.compile.stderr.trim(), result.compile.stdout.trim()]
      .filter(Boolean)
      .join('\n')
      .trim();
    if (compilerDiagnostics) {
      chunks.push(`Compiler diagnostics:\n${compilerDiagnostics}`);
    }

    if (!options?.runtimeOutputStreamed) {
      const stderr = result.run.stderr.trim();
      const stdout = result.run.stdout.trim();
      if (stderr) chunks.push(stderr);
      if (stdout) chunks.push(stdout);
    }
    if (!result.run.ok) {
      chunks.push(`Program exited with code ${result.run.code}.`);
    }

    return chunks.join('\n') || (options?.runtimeOutputStreamed
      ? ''
      : 'Java executed successfully with no output.');
  };

  const formatJavaRuntimeError = (err: unknown) => {
    const baseMessage = err instanceof Error ? err.message : String(err);
    if ((err as any)?.name === 'JavaRuntimeError') {
      return baseMessage;
    }
    const compile = (err as any)?.compile;
    const run = (err as any)?.run;
    const details = [
      compile?.stderr?.trim?.(),
      compile?.stdout?.trim?.(),
      run?.stderr?.trim?.(),
      run?.stdout?.trim?.(),
    ].filter(Boolean);
    return details.length > 0 ? `${baseMessage}\n${details.join('\n')}` : baseMessage;
  };

  const runJavaProject = async (
    projectFiles: ProjectSourceFile[],
    entryFile: ProjectSourceFile
  ) => {
    try {
      if (settings.javaIOMode === 'interactive-output-panel') {
        selectDockPanel('output');
      }
      setOutput('');
      console.clear();

      const javaProjectFiles = projectFiles
        .filter(file => file.language === 'java')
        .map(file => ({
          path: file.path,
          content: file.content,
          language: 'java' as const,
        }));

      setExecutionStartupStatus(`Preparing Java project from ${entryFile.path}...`);

      const javaRuntime = await getJavaRuntimeModule();
      const streamRuntimeOutput = settings.javaIOMode === 'interactive-output-panel';
      const result = await javaRuntime.compileAndRunJavaProject({
        files: javaProjectFiles,
        entryPath: entryFile.path,
        javaVersion: settings.javaRuntimeVersion,
        timeoutMs: normalizeExecutionTimeoutMs(settings.javaExecutionTimeoutMs),
        requestStdin: requestJavaRuntimeInput,
        onStdout: streamRuntimeOutput ? (chunk) => setOutput(prev => prev + chunk) : undefined,
        onStderr: streamRuntimeOutput ? (chunk) => setOutput(prev => prev + chunk) : undefined,
        onStatus: appendExecutionStartupStatus,
      });

      setExecutionStartupStatus('');
      const formattedOutput = formatJavaExecutionOutput(result, {
        runtimeOutputStreamed: streamRuntimeOutput,
      });
      if (formattedOutput) {
        setOutput(prev => [prev.trimEnd(), formattedOutput].filter(Boolean).join('\n'));
      }
    } catch (err) {
      setExecutionStartupStatus('');
      setOutput(prev => [prev.trimEnd(), `Java Error: ${formatJavaRuntimeError(err)}`].filter(Boolean).join('\n'));
    } finally {
      if (settings.javaRuntimeLifecycle === 'keep-warm') {
        resetJavaRuntimeIdleTimer();
      } else {
        disposeJavaRuntime();
      }
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
    const currentFile = activeRunnableFile?.type === 'file'
      ? activeRunnableFile as FSItem & { type: 'file' }
      : null;
    if (!currentFile) {
      clearOutputPreview();
      setExecutionStartupStatus('');
      setOutput('Error: Select a runnable Java, C, C++, C#, Python, HTML, JavaScript, or TypeScript source file first.');
      return;
    }

    await runWithExecutionLifecycle(async () => {
      await runPackageJsonDependencySync();

      const runtimeLanguage = getProjectRuntimeLanguageForFile(currentFile);
      const projectFiles = toProjectSourceFiles([currentFile]);
      const entryFile = projectFiles.find(file => file.id === currentFile.id) ?? projectFiles[0] ?? null;

      if (!runtimeLanguage || !entryFile) {
        clearOutputPreview();
        setExecutionStartupStatus('');
        setOutput('Error: The current file could not be prepared for execution.');
        return;
      }

      if (runtimeLanguage === 'javascript') {
        if (isTypeScriptProjectFile(entryFile)) {
          const compiledContent = await transpileTypeScriptProjectFile(entryFile);
          if (projectFiles.length > 1 || /\.tsx$/i.test(entryFile.path) || containsJavaScriptModuleSyntax(compiledContent)) {
            await runJavaScriptProject(projectFiles, entryFile);
          } else {
            clearOutputPreview();
            await runJavaScript(compiledContent);
          }
        } else if (projectFiles.length > 1 || containsJavaScriptModuleSyntax(entryFile.content)) {
          await runJavaScriptProject(projectFiles, entryFile);
        } else {
          clearOutputPreview();
          await runJavaScript(entryFile.content);
        }
        return;
      }

      if (runtimeLanguage === 'python') {
        clearOutputPreview();
        if (projectFiles.length > 1) {
          await runPythonProject(projectFiles, entryFile);
        } else {
          await runPython(entryFile);
        }
        return;
      }

      if (runtimeLanguage === 'html') {
        await runHtmlProject(projectFiles, entryFile);
        return;
      }

      if (runtimeLanguage === 'csharp') {
        clearOutputPreview();
        if (projectFiles.length > 1) {
          await runCSharpProject(projectFiles, entryFile);
        } else {
          await runCSharp(entryFile.content, entryFile.id);
        }
        return;
      }

      if (runtimeLanguage === 'c' || runtimeLanguage === 'cpp') {
        clearOutputPreview();
        await runCxxProject(projectFiles, entryFile, runtimeLanguage);
        return;
      }

      if (runtimeLanguage === 'java') {
        clearOutputPreview();
        await runJavaProject(projectFiles, entryFile);
        return;
      }

      clearOutputPreview();
      setExecutionStartupStatus('');
      setOutput(`Error: No local runtime available for ${runtimeLanguage}. Supported: HTML, JavaScript, TypeScript, Python, C#, C, C++, and Java.`);
    });
  };

  const handleProjectRun = async () => {
    const includedFiles = resolvedProjectRun.includedFiles;
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
      await runPackageJsonDependencySync();

      const projectFiles = toProjectSourceFiles(includedFiles);
      const entryFile = projectFiles.find(file => file.id === entryItem.id) ?? null;

      if (!entryFile) {
        clearOutputPreview();
        setExecutionStartupStatus('');
        setOutput('Error: The configured entry file is no longer part of the included project run files.');
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

      if (runtimeLanguage === 'c' || runtimeLanguage === 'cpp') {
        clearOutputPreview();
        await runCxxProject(projectFiles, entryFile, runtimeLanguage);
        return;
      }

      if (runtimeLanguage === 'java') {
        clearOutputPreview();
        await runJavaProject(projectFiles, entryFile);
        return;
      }

      clearOutputPreview();
      setExecutionStartupStatus('');
      setOutput(`Error: No local runtime available for ${runtimeLanguage}. Supported: HTML, JavaScript, TypeScript, Python, C#, C, C++, and Java.`);
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

  const collectWorkspaceAssistantAttachments = (itemId: string): UploadedProjectFile[] => {
    const currentFiles = filesRef.current;
    const item = currentFiles.find(candidate => candidate.id === itemId);
    if (!item) return [];

    const collectFiles = (rootId: string): UploadedProjectFile[] => {
      const root = currentFiles.find(candidate => candidate.id === rootId);
      if (!root) return [];
      if (root.type === 'file') {
        return [{
          path: getFsItemPath(currentFiles, root.id),
          content: root.content || '',
        }];
      }

      return currentFiles
        .filter(candidate => candidate.parentId === root.id)
        .flatMap(child => collectFiles(child.id));
    };

    return collectFiles(item.id).sort((left, right) => left.path.localeCompare(right.path));
  };

  const addAssistantAttachments = (chatId: string, uploadedFiles: UploadedProjectFile[], source: AssistantAttachmentFile['source']) => {
    const attachments = uploadedFiles
      .map(file => ({
        id: createFsItemId(),
        path: normalizeAssistantAttachmentPath(file.path),
        content: file.content,
        source,
      }))
      .filter(file => file.path);

    if (attachments.length === 0) {
      setAssistantAttachmentStatusByChatId(prev => ({
        ...prev,
        [chatId]: 'No readable files were found.',
      }));
      return;
    }

    setAssistantAttachmentsByChatId(prev => {
      const existing = prev[chatId] || [];
      const byPath = new Map(existing.map(file => [file.path, file]));
      for (const attachment of attachments) {
        byPath.set(attachment.path, attachment);
      }
      return {
        ...prev,
        [chatId]: [...byPath.values()].sort((left, right) => left.path.localeCompare(right.path)),
      };
    });
    setAssistantAttachmentStatusByChatId(prev => ({
      ...prev,
      [chatId]: `Attached ${attachments.length} file${attachments.length === 1 ? '' : 's'}.`,
    }));
  };

  const addAssistantAttachmentsFromDataTransfer = async (chatId: string, dataTransfer: DataTransfer) => {
    try {
      if (hasFileDataTransferPayload(dataTransfer)) {
        const uploadedFiles = await readUploadedProjectFilesFromDataTransfer(dataTransfer);
        addAssistantAttachments(chatId, uploadedFiles, 'upload');
        return;
      }

      const draggedItemId = dataTransfer.getData('text/plain');
      if (draggedItemId) {
        const workspaceFiles = collectWorkspaceAssistantAttachments(draggedItemId);
        addAssistantAttachments(chatId, workspaceFiles, 'workspace');
        return;
      }

      setAssistantAttachmentStatusByChatId(prev => ({
        ...prev,
        [chatId]: 'Drop files, folders, or explorer items to attach them.',
      }));
    } catch (err) {
      setAssistantAttachmentStatusByChatId(prev => ({
        ...prev,
        [chatId]: `Attachment failed: ${err instanceof Error ? err.message : String(err)}`,
      }));
    } finally {
      setDraggedItemId(null);
    }
  };

  const removeAssistantAttachment = (chatId: string, attachmentId: string) => {
    setAssistantAttachmentsByChatId(prev => ({
      ...prev,
      [chatId]: (prev[chatId] || []).filter(file => file.id !== attachmentId),
    }));
  };

  const clearAssistantAttachments = (chatId: string) => {
    setAssistantAttachmentsByChatId(prev => ({ ...prev, [chatId]: [] }));
    setAssistantAttachmentStatusByChatId(prev => ({ ...prev, [chatId]: '' }));
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
    setAssistantAttachmentsByChatId(prev => ({ ...prev, [chatId]: [] }));
    setAssistantAttachmentStatusByChatId(prev => ({ ...prev, [chatId]: '' }));

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
    let hasSelectedSourceControlTab = false;

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
        if (selectedTab?.component === 'sourceControl') {
          hasSelectedSourceControlTab = true;
        }
      }
      for (const child of node.children || []) {
        collectLayoutState(child);
      }
    };

    collectLayoutState(jsonModel.layout);
    localStorage.setItem(getProjectStorageKey(STORAGE_KEYS.layout), JSON.stringify(jsonModel));
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
    if (hasSelectedSourceControlTab) {
      const now = Date.now();
      if (now - lastSourceControlFetchFocusRef.current > 1000) {
        lastSourceControlFetchFocusRef.current = now;
        void refreshGitRemotes().catch(() => undefined);
      }
    }
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

  const extractOpenAIChatContentText = (content: any): string => {
    if (typeof content === 'string') return content;
    if (!Array.isArray(content)) return '';
    return content
      .flatMap((part: any) => {
        if (!part || part.type === 'thinking') return [];
        if (typeof part.text === 'string') return [part.text];
        if (typeof part.content === 'string') return [part.content];
        if (Array.isArray(part.thinking)) return [];
        return [];
      })
      .join('\n');
  };

  const extractOpenAIChatVisibleText = (response: any) => {
    const message = response?.choices?.[0]?.message;
    return extractOpenAIChatContentText(message?.content).trim();
  };

  const getOpenAIChatReasoningTokenCount = (response: any) => (
    typeof response?.usage?.completion_tokens_details?.reasoning_tokens === 'number'
      ? response.usage.completion_tokens_details.reasoning_tokens
      : 0
  );

  const normalizeOpenAIChatAssistantMessage = (provider: AssistantProvider, message: any) => {
    const normalized: any = {
      role: 'assistant',
      content: provider === 'mistral' && Array.isArray(message?.content)
        ? message.content
        : (extractOpenAIChatContentText(message?.content) || null),
    };
    if (Array.isArray(message?.tool_calls) && message.tool_calls.length > 0) {
      normalized.tool_calls = message.tool_calls;
    }
    if (provider === 'cerebras' && typeof message?.reasoning === 'string') {
      normalized.reasoning = message.reasoning;
    }
    return normalized;
  };

  const waitForSemanticDocumentationRequestRateLimit = async () => {
    if (effectiveAssistantRequestRateLimitPerMinute <= 0) return;
    const intervalMs = 60_000 / effectiveAssistantRequestRateLimitPerMinute;
    const now = Date.now();
    const waitMs = Math.max(0, assistantRequestRateNextSlotAtRef.current - now);
    if (waitMs > 0) {
      await new Promise(resolve => window.setTimeout(resolve, waitMs));
    }
    assistantRequestRateNextSlotAtRef.current = Date.now() + intervalMs;
  };

  const requestSemanticDocumentationText = async (prompt: string) => {
    const provider = settings.assistantProvider;
    const model = effectiveAutoDocumentationModel;
    const apiKey = assistantConfiguredApiKey;
    if (!apiKey) {
      throw new Error(`Add your ${getAssistantApiKeyLabel(provider)} in Settings before generating semantic documentation.`);
    }
    if (!model) {
      throw new Error('Choose an autodocumentation model in Settings before generating semantic documentation.');
    }
    if (provider === 'cursor') {
      throw new Error('Cursor Agents cannot be used for semantic documentation generation. Choose a direct API provider.');
    }

    await waitForSemanticDocumentationRequestRateLimit();

    if (provider === 'gemini') {
      const ai = new GoogleGenAI({ apiKey });
      const response = await ai.models.generateContent({
        model,
        contents: [{ role: 'user', parts: [{ text: prompt }] }],
        config: { maxOutputTokens: 4096 } as any,
      });
      return extractGeminiVisibleText(response);
    }

    if (provider === 'openai') {
      const payload: any = {
        model,
        input: [{ role: 'user', content: [{ type: 'input_text', text: prompt }] }],
        max_output_tokens: 4096,
      };
      if (getAssistantReasoningControl(provider, model) !== 'always_off') {
        payload.reasoning = { effort: 'none' };
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
      if (!response.ok) throw new Error(responseJson?.error?.message || 'OpenAI request failed.');
      return extractOpenAIVisibleText(responseJson);
    }

    if (provider === 'anthropic') {
      const response = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': apiKey,
          'anthropic-version': '2023-06-01',
        },
        body: JSON.stringify({
          model,
          max_tokens: 4096,
          messages: [{ role: 'user', content: prompt }],
        }),
      });
      const responseJson = await response.json();
      if (!response.ok) throw new Error(responseJson?.error?.message || 'Anthropic request failed.');
      return extractAnthropicVisibleText(responseJson);
    }

    const responsesConfig = getOpenAIResponsesProviderConfig(provider);
    if (responsesConfig) {
      const response = await fetch(responsesConfig.endpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${apiKey}`,
        },
        body: JSON.stringify({
          model,
          input: [{ role: 'user', content: [{ type: 'input_text', text: prompt }] }],
          max_output_tokens: 4096,
        }),
      });
      const responseJson = await response.json();
      if (!response.ok) throw new Error(responseJson?.error?.message || responsesConfig.requestLabel);
      return extractOpenAIVisibleText(responseJson);
    }

    const chatConfig = getOpenAIChatProviderConfig(provider);
    if (chatConfig) {
      const maxTokenKey = provider === 'cerebras' || provider === 'groq'
        ? 'max_completion_tokens'
        : 'max_tokens';
      const response = await fetch(chatConfig.endpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${apiKey}`,
        },
        body: JSON.stringify({
          model,
          messages: [{ role: 'user', content: prompt }],
          [maxTokenKey]: Math.min(chatConfig.defaultMaxTokens, 4096),
          ...getOpenAIChatReasoningRequestOptions(provider, model, false),
        }),
      });
      const responseJson = await response.json();
      if (!response.ok) throw new Error(responseJson?.error?.message || chatConfig.requestLabel);
      return extractOpenAIChatVisibleText(responseJson);
    }

    throw new Error(`${getAssistantProviderLabel(provider)} is not wired for semantic documentation generation.`);
  };

  const getSemanticDocumentationFiles = (): SemanticDocumentationSourceFile[] => (
    getCSharpProjectFileSnapshots().map(file => ({
      path: file.path,
      content: file.content,
      language: 'csharp',
    }))
  );

  interface DocsFindCandidate {
    item: SemanticDocumentationItem;
    documentation: string;
  }

  interface DocsFindSelection {
    id: string;
    reason: string;
  }

  interface DocsFindCommandOptions {
    description: string;
    typeLimit: number;
    memberLimit: number;
    hideReason: boolean;
    hideDocumentation: boolean;
    errors: string[];
  }

  const DOCS_FIND_USAGE = 'Usage: docs find [--types N] [--members N] [--hide-reason] [--hide-docs] <description>';
  const DOCS_GET_USAGE = 'Usage: docs get <item-name>';
  const CODIN_GET_USAGE = 'Usage: codin get <CSharpSymbolPath>';

  interface CodinGetMatch {
    kind: string;
    symbolPath: string;
    sourcePath: string;
    code: string;
  }

  const splitTerminalSnippetLines = (text: string) => {
    const normalized = text.replace(/\r\n/g, '\n').replace(/\r/g, '\n');
    return normalized.length > 0 ? normalized.split('\n') : [''];
  };

  const getCodinGetSourceSlice = (sourceFilesByPath: Map<string, string>, path: string, start: number, end: number) => (
    (sourceFilesByPath.get(path) || '').slice(start, end).replace(/\s+$/, '')
  );

  const getCodinGetTypeSymbolPath = (typeDecl: CSharpTypeDeclaration) => (
    typeDecl.fullName || typeDecl.name
  );

  const getCodinGetMemberSymbolPath = (member: CSharpValueMember | CSharpMethodMember) => (
    `${member.containerFullName || member.containerName}.${member.name}`
  );

  const executeCodinGetCommand = (rawArgs: string[]): string[] => {
    const query = rawArgs.join(' ').trim().replace(/:$/, '');
    if (!query) return [CODIN_GET_USAGE];

    const sourceFiles = getSemanticDocumentationFiles();
    if (sourceFiles.length === 0) {
      return ['codin get currently supports C# only, and no C# files were found.'];
    }

    const parsed = parseCSharpSemanticDocumentationProject(sourceFiles);
    const sourceFilesByPath = new Map(sourceFiles.map(file => [file.path, file.content]));
    const matches: CodinGetMatch[] = [];

    for (const typeDecl of parsed.types) {
      const symbolPath = getCodinGetTypeSymbolPath(typeDecl);
      if (symbolPath !== query) continue;
      matches.push({
        kind: typeDecl.kind,
        symbolPath,
        sourcePath: typeDecl.path,
        code: getCodinGetSourceSlice(sourceFilesByPath, typeDecl.path, typeDecl.spanStart, typeDecl.spanEnd),
      });
    }
    for (const member of parsed.valueMembers) {
      const symbolPath = getCodinGetMemberSymbolPath(member);
      if (symbolPath !== query) continue;
      matches.push({
        kind: member.kind,
        symbolPath,
        sourcePath: member.path,
        code: getCodinGetSourceSlice(sourceFilesByPath, member.path, member.spanStart, member.spanEnd),
      });
    }
    for (const member of parsed.methodMembers) {
      const symbolPath = getCodinGetMemberSymbolPath(member);
      if (symbolPath !== query) continue;
      matches.push({
        kind: member.kind,
        symbolPath,
        sourcePath: member.path,
        code: getCodinGetSourceSlice(sourceFilesByPath, member.path, member.spanStart, member.spanEnd),
      });
    }

    if (matches.length === 0) return ['no matches'];
    if (matches.length === 1) return splitTerminalSnippetLines(matches[0].code);

    const lines = [`${matches.length} matches:`];
    matches.forEach((match, index) => {
      if (index > 0) lines.push('');
      lines.push(`--- ${match.symbolPath} [${match.kind}] ${match.sourcePath} ---`);
      lines.push(...splitTerminalSnippetLines(match.code));
    });
    return lines;
  };

  const parseDocsFindCommandOptions = (rawArgs: string[]): DocsFindCommandOptions => {
    const descriptionParts: string[] = [];
    const errors: string[] = [];
    let typeLimit = normalizeDocsFindTypeMatchCount(settings.docsFindTypeMatchCount);
    let memberLimit = normalizeDocsFindMemberMatchCount(settings.docsFindMemberMatchCount);
    let hideReason = false;
    let hideDocumentation = false;

    const readCountOption = (index: number, label: string, normalize: (value: number) => number) => {
      const value = rawArgs[index + 1];
      if (!value || value.startsWith('-')) {
        errors.push(`${label} needs a number.`);
        return { value: normalize(Number.NaN), consumed: 0 };
      }
      const parsed = Number(value);
      if (!Number.isFinite(parsed)) {
        errors.push(`${label} must be a number.`);
        return { value: normalize(Number.NaN), consumed: 1 };
      }
      return { value: normalize(parsed), consumed: 1 };
    };

    for (let index = 0; index < rawArgs.length; index += 1) {
      const arg = rawArgs[index];
      if (!arg) continue;
      if (arg === '--') {
        descriptionParts.push(...rawArgs.slice(index + 1));
        break;
      }
      if (arg === '--hide-reason' || arg === '--no-reason') {
        hideReason = true;
        continue;
      }
      if (arg === '--hide-docs' || arg === '--hide-documentation' || arg === '--no-docs' || arg === '--no-documentation') {
        hideDocumentation = true;
        continue;
      }
      if (arg === '--types' || arg === '--type-matches' || arg === '--type-count' || arg === '--classes' || arg === '-t') {
        const parsed = readCountOption(index, arg, normalizeDocsFindTypeMatchCount);
        typeLimit = parsed.value;
        index += parsed.consumed;
        continue;
      }
      if (arg === '--members' || arg === '--member-matches' || arg === '--member-count' || arg === '-m') {
        const parsed = readCountOption(index, arg, normalizeDocsFindMemberMatchCount);
        memberLimit = parsed.value;
        index += parsed.consumed;
        continue;
      }
      if (arg.startsWith('-')) {
        errors.push(`Unknown docs find option: ${arg}`);
        continue;
      }
      descriptionParts.push(arg);
    }

    return {
      description: descriptionParts.join(' ').trim(),
      typeLimit,
      memberLimit,
      hideReason,
      hideDocumentation,
      errors,
    };
  };

  const getSemanticDocumentationRecordForFind = async () => {
    const [active, draft] = await Promise.all([
      loadSemanticDocumentationRecord(activeProjectId, 'csharp', 'active'),
      loadSemanticDocumentationRecord(activeProjectId, 'csharp', 'draft'),
    ]);
    return active || draft || semanticDocumentationActive || semanticDocumentationDraft;
  };

  const getSemanticDocumentationItemSymbolPathFromId = (item: SemanticDocumentationItem) => {
    const parts = item.id.split(':');
    return parts.length >= 4 && parts[2] ? parts[2] : '';
  };

  const formatDocsFindFullName = (item: SemanticDocumentationItem) => (
    item.symbolPath
    || getSemanticDocumentationItemSymbolPathFromId(item)
    || (item.containerName ? `${item.containerName}.${item.name}` : item.name)
  );

  const escapeDocsGetPatternCharacter = (value: string) => (
    value.replace(/[\\^$+?.()|[\]{}]/g, '\\$&')
  );

  const buildDocsGetNameMatcher = (pattern: string) => {
    const source = Array.from(pattern)
      .map(char => {
        if (char === '_') return '.';
        if (char === '*') return '.*';
        return escapeDocsGetPatternCharacter(char);
      })
      .join('');
    return new RegExp(`^${source}$`);
  };

  const docsGetCandidateName = (item: SemanticDocumentationItem, query: string) => (
    query.includes('.') ? formatDocsFindFullName(item) : item.name
  );

  const executeDocsGetCommand = async (rawArgs: string[]): Promise<string[]> => {
    const query = rawArgs.join(' ').trim();
    if (!query) return [DOCS_GET_USAGE];

    const record = await getSemanticDocumentationRecordForFind();
    if (!record || record.items.length === 0) {
      return ['No semantic documentation is available. Open Semantic Documentation and generate C# docs first.'];
    }

    const matcher = buildDocsGetNameMatcher(query);
    const matches = record.items
      .filter(item => matcher.test(docsGetCandidateName(item, query)))
      .sort((left, right) => formatDocsFindFullName(left).localeCompare(formatDocsFindFullName(right)));

    if (matches.length === 0) return [`No documentation matched \`${query}\`.`];
    if (matches.length === 1) return splitTerminalSnippetLines(matches[0].documentation);

    const lines = [`${matches.length} documentation matches for \`${query}\`:`];
    matches.forEach((item, index) => {
      if (index > 0) lines.push('');
      lines.push(`--- ${formatDocsFindFullName(item)} [${item.kind}] ${item.path} ---`);
      lines.push(...splitTerminalSnippetLines(item.documentation));
    });
    return lines;
  };

  const formatDocsFindCandidateBlock = (candidate: DocsFindCandidate) => (
    [
      `ID: ${candidate.item.id}`,
      `Kind: ${candidate.item.kind}`,
      `Name: ${formatDocsFindFullName(candidate.item)}`,
      `Path: ${candidate.item.path}`,
      `Documentation:\n${candidate.documentation}`,
    ].join('\n')
  );

  const extractDocsFindJson = (response: string) => {
    const cleaned = response.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/i, '').trim();
    const direct = safeJsonParse(cleaned);
    if (Object.keys(direct).length > 0 || cleaned === '{}') return direct;
    const objectStart = cleaned.indexOf('{');
    const objectEnd = cleaned.lastIndexOf('}');
    if (objectStart >= 0 && objectEnd > objectStart) {
      const parsed = safeJsonParse(cleaned.slice(objectStart, objectEnd + 1));
      if (Object.keys(parsed).length > 0 || cleaned.slice(objectStart, objectEnd + 1) === '{}') return parsed;
    }
    const arrayStart = cleaned.indexOf('[');
    const arrayEnd = cleaned.lastIndexOf(']');
    if (arrayStart >= 0 && arrayEnd > arrayStart) {
      try {
        return JSON.parse(cleaned.slice(arrayStart, arrayEnd + 1));
      } catch {
        return {};
      }
    }
    return {};
  };

  const parseDocsFindSelections = (
    response: string,
    candidates: DocsFindCandidate[],
    limit: number,
  ): DocsFindSelection[] => {
    const byId = new Map(candidates.map(candidate => [candidate.item.id, candidate]));
    const byName = new Map(candidates.map(candidate => [formatDocsFindFullName(candidate.item), candidate]));
    const parsed = extractDocsFindJson(response);
    const rawMatches = Array.isArray(parsed)
      ? parsed
      : Array.isArray((parsed as any).matches)
        ? (parsed as any).matches
        : Array.isArray((parsed as any).results)
          ? (parsed as any).results
          : Array.isArray((parsed as any).items)
            ? (parsed as any).items
            : [];
    const selected: DocsFindSelection[] = [];
    const seen = new Set<string>();

    const pushSelection = (idOrName: string, reason?: string) => {
      const direct = byId.get(idOrName);
      const byFullName = byName.get(idOrName);
      const bySimpleName = candidates.find(candidate => candidate.item.name === idOrName);
      const candidate = direct || byFullName || bySimpleName;
      if (!candidate || seen.has(candidate.item.id)) return;
      seen.add(candidate.item.id);
      selected.push({
        id: candidate.item.id,
        reason: typeof reason === 'string' && reason.trim() ? reason.trim() : 'Selected by the ranking model.',
      });
    };

    for (const match of rawMatches) {
      if (selected.length >= limit) break;
      if (typeof match === 'string') {
        pushSelection(match);
        continue;
      }
      if (!match || typeof match !== 'object') continue;
      const idOrName = typeof match.id === 'string'
        ? match.id
        : typeof match.name === 'string'
          ? match.name
          : typeof match.item === 'string'
            ? match.item
            : '';
      pushSelection(idOrName, typeof match.reason === 'string' ? match.reason : undefined);
    }

    if (selected.length > 0) return selected.slice(0, limit);

    for (const candidate of candidates) {
      if (selected.length >= limit) break;
      const fullName = formatDocsFindFullName(candidate.item);
      if (response.includes(candidate.item.id) || response.includes(fullName) || response.includes(candidate.item.name)) {
        pushSelection(candidate.item.id, 'Selected from a non-JSON model response.');
      }
    }

    return selected.slice(0, limit);
  };

  const buildDocsFindRankingPrompt = (
    description: string,
    candidates: DocsFindCandidate[],
    limit: number,
    stage: string,
  ) => limitSemanticPrompt(
    `You are ranking generated C# semantic documentation for an IDE terminal command.\n` +
    `User description: ${description}\n\n` +
    `${stage}\n` +
    `Choose up to ${limit} best matching candidate IDs, in best-first order. Use semantic meaning, not only lexical overlap.\n` +
    `Return ONLY JSON in this exact shape: {"matches":[{"id":"candidate id","reason":"short reason"}]}\n\n` +
    `Candidates:\n\n${candidates.map(formatDocsFindCandidateBlock).join('\n\n---\n\n')}`,
    effectiveAutoDocumentationPromptTokenLimit,
  );

  const collectDocsFindMemberCandidates = (
    record: SemanticDocumentationRecord,
    typeSelections: DocsFindSelection[],
  ): DocsFindCandidate[] => {
    const selectedTypeNames = new Set(
      typeSelections
        .map(selection => record.items.find(item => item.id === selection.id))
        .filter((item): item is SemanticDocumentationItem => !!item)
        .map(item => item.name)
    );
    const accessorDocsByProperty = new Map<string, string[]>();
    if (settings.docsFindIncludeAccessorDocs) {
      for (const item of record.items) {
        if (item.kind !== 'accessor' || !item.containerName) continue;
        const propertyName = item.name.split('.')[0];
        if (!propertyName) continue;
        const key = `${item.containerName}.${propertyName}`;
        const docs = accessorDocsByProperty.get(key) || [];
        docs.push(`[${item.name}]\n${item.documentation}`);
        accessorDocsByProperty.set(key, docs);
      }
    }

    return record.items
      .filter(item => item.kind !== 'type' && item.containerName && selectedTypeNames.has(item.containerName))
      .map(item => {
        const accessorDocs = item.kind === 'property'
          ? accessorDocsByProperty.get(`${item.containerName}.${item.name}`) || []
          : [];
        return {
          item,
          documentation: accessorDocs.length > 0
            ? `${item.documentation}\n\nAccessor documentation:\n${accessorDocs.join('\n\n')}`
            : item.documentation,
        };
      });
  };

  const formatDocsFindResultLines = (
    title: string,
    selections: DocsFindSelection[],
    candidates: DocsFindCandidate[],
    options: Pick<DocsFindCommandOptions, 'hideReason' | 'hideDocumentation'>,
  ) => {
    const candidateById = new Map(candidates.map(candidate => [candidate.item.id, candidate]));
    const lines = [title];
    selections.forEach((selection, index) => {
      const candidate = candidateById.get(selection.id);
      if (!candidate) return;
      lines.push(`${index + 1}. ${formatDocsFindFullName(candidate.item)} [${candidate.item.kind}]`);
      lines.push(`   Path: ${candidate.item.path}`);
      if (!options.hideReason) {
        lines.push(`   Reason: ${selection.reason}`);
      }
      if (!options.hideDocumentation) {
        lines.push('   Documentation:');
        for (const line of candidate.documentation.split('\n')) {
          lines.push(`     ${line}`);
        }
      }
    });
    return lines;
  };

  const executeDocsFindCommand = async (rawArgs: string[]): Promise<string[]> => {
    const commandOptions = parseDocsFindCommandOptions(rawArgs);
    const query = commandOptions.description;
    if (commandOptions.errors.length > 0) return [...commandOptions.errors, DOCS_FIND_USAGE];
    if (!query) return [DOCS_FIND_USAGE];
    const record = await getSemanticDocumentationRecordForFind();
    if (!record || record.items.length === 0) {
      return ['No semantic documentation is available. Open Semantic Documentation and generate C# docs first.'];
    }

    const typeCandidates = record.items
      .filter(item => item.kind === 'type')
      .map(item => ({ item, documentation: item.documentation }));
    if (typeCandidates.length === 0) {
      return ['No type documentation is available. Regenerate semantic documentation first.'];
    }

    const stage1Response = await requestSemanticDocumentationText(buildDocsFindRankingPrompt(
      query,
      typeCandidates,
      commandOptions.typeLimit,
      'Stage 1: rank classes, structs, enums, interfaces, records, and similar top-level type documentation.',
    ));
    const typeSelections = parseDocsFindSelections(stage1Response, typeCandidates, commandOptions.typeLimit);
    if (typeSelections.length === 0) {
      return ['The model did not return any matching types. Try a more specific description.'];
    }

    const memberCandidates = collectDocsFindMemberCandidates(record, typeSelections);
    if (memberCandidates.length === 0) {
      const selectedNames = typeSelections
        .map(selection => typeCandidates.find(candidate => candidate.item.id === selection.id)?.item.name)
        .filter(Boolean)
        .join(', ');
      return [`No documented members were found below the selected type${typeSelections.length === 1 ? '' : 's'}: ${selectedNames}.`];
    }

    const stage2Response = await requestSemanticDocumentationText(buildDocsFindRankingPrompt(
      query,
      memberCandidates,
      commandOptions.memberLimit,
      'Final stage: rank fields, properties, methods, accessors, and similar member documentation below the selected types.',
    ));
    const memberSelections = parseDocsFindSelections(stage2Response, memberCandidates, commandOptions.memberLimit);
    if (memberSelections.length === 0) {
      return ['The model did not return any matching members. Try a more specific description.'];
    }

    const selectedTypeNames = typeSelections
      .map(selection => typeCandidates.find(candidate => candidate.item.id === selection.id)?.item.name)
      .filter(Boolean)
      .join(', ');
    return [
      `Docs find: ${query}`,
      `Selected type scope: ${selectedTypeNames}`,
      '',
      ...formatDocsFindResultLines(`Final results (top ${memberSelections.length}):`, memberSelections, memberCandidates, commandOptions),
    ];
  };

  const startSemanticDocumentationGeneration = async (forceNewDraft = false) => {
    if (isSemanticDocumentationRunning) return;
    setIsSemanticDocumentationOpen(true);
    setSemanticDocumentationMessage(forceNewDraft ? 'Starting regeneration...' : 'Starting semantic documentation generation...');

    const sourceFiles = getSemanticDocumentationFiles();
    try {
      parseCSharpSemanticDocumentationProject(sourceFiles);
    } catch (error) {
      setSemanticDocumentationMessage(error instanceof Error ? error.message : String(error));
      return;
    }

    const abortController = new AbortController();
    semanticDocumentationAbortRef.current = abortController;
    setIsSemanticDocumentationRunning(true);

    try {
      await runSemanticDocumentationGeneration({
        projectId: activeProjectId,
        provider: settings.assistantProvider,
        model: effectiveAutoDocumentationModel,
        entryPoint: settings.autoDocumentationEntryPoint.trim(),
        promptTokenLimit: effectiveAutoDocumentationPromptTokenLimit,
        files: sourceFiles,
        existingDraft: semanticDocumentationDraft,
        forceNewDraft,
        signal: abortController.signal,
        requestDocumentation: requestSemanticDocumentationText,
        onProgress: ({ record, message }) => {
          setSemanticDocumentationDraft(record.kind === 'draft' ? record : null);
          setSemanticDocumentationMessage(message);
          setSemanticDocumentationSelectedItemId(current => current || record.items[0]?.id || null);
        },
      });
      await refreshSemanticDocumentationRecords();
      setSemanticDocumentationMessage('Semantic documentation is active.');
    } catch (error) {
      setSemanticDocumentationMessage(`Semantic documentation failed: ${error instanceof Error ? error.message : String(error)}`);
      await refreshSemanticDocumentationRecords();
    } finally {
      if (semanticDocumentationAbortRef.current === abortController) {
        semanticDocumentationAbortRef.current = null;
      }
      setIsSemanticDocumentationRunning(false);
    }
  };

  const pauseSemanticDocumentationGeneration = () => {
    semanticDocumentationAbortRef.current?.abort();
    setSemanticDocumentationMessage('Pausing after the current request completes...');
  };

  const discardSemanticDocumentationDraft = async () => {
    if (isSemanticDocumentationRunning) return;
    await deleteSemanticDocumentationRecord(activeProjectId, 'csharp', 'draft');
    setSemanticDocumentationDraft(null);
    setSemanticDocumentationMessage('Discarded draft semantic documentation progress.');
  };

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
    const submittedAttachments = assistantAttachmentsByChatId[chatId] || [];
    if ((!input && submittedAttachments.length === 0) || loadingAssistantChatId) return;

    const currentChat = assistantChats.find(chat => chat.id === chatId);
    if (!currentChat) return;

    if (currentChat.messages.length === 0 && currentChat.name === DEFAULT_ASSISTANT_CHAT_NAME) {
      const suggestedName = autoNameAssistantChat(input || submittedAttachments[0]?.path || 'Attached files');
      if (suggestedName !== DEFAULT_ASSISTANT_CHAT_NAME) {
        updateAssistantTabName(chatId, suggestedName);
      }
    }

    const selectionContext = getCurrentAssistantSelectionContext();
    const attachmentPromptSection = formatAssistantAttachmentPromptSection(submittedAttachments);
    const visibleUserContent = `${input || '(sent attached files)'}${formatAssistantAttachmentSummary(submittedAttachments)}`;
    const submittedUserContent = `${input}${selectionContext}${attachmentPromptSection}`;

    const userMsg: ChatMessage = { role: 'user', content: submittedUserContent };
    appendAssistantMessage(chatId, { role: 'user', content: visibleUserContent });
    setAssistantInputs(prev => ({ ...prev, [chatId]: '' }));
    clearAssistantAttachments(chatId);
    setLoadingAssistantChatId(chatId);

    try {
      const provider = settings.assistantProvider;
      const model = settings.assistantModel.trim();
      const apiKey = assistantConfiguredApiKey;
      const assistantSupportsLocalTools = getAssistantSupportsLocalTools(provider, model);
      const submittedUseSemanticDocumentationFirst =
        assistantSupportsLocalTools
        && getSemanticDocumentationFiles().length > 0
        && !!semanticDocumentationVisibleRecord?.items.length
        && !!assistantDocumentationLookupByChatId[chatId];
      const assistantTools = assistantSupportsLocalTools
        ? buildAssistantToolSet(effectiveAssistantUseChainOfThought)
        : [];
      const maxAssistantToolPasses = effectiveAssistantUseChainOfThought
        ? effectiveAssistantMaxChainOfThoughtDepth
        : DEFAULT_ASSISTANT_TOOL_PASSES;
      if (!apiKey) {
        appendAssistantMessage(chatId, {
          role: 'assistant',
          content: `Add your ${getAssistantApiKeyLabel(provider)} in Settings before using the assistant.`,
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
        hasAssistantTools: assistantSupportsLocalTools,
        toolProgressNotes,
        assistantLiveNotes,
        useSemanticDocumentationFirst: submittedUseSemanticDocumentationFirst,
        hasCSharpSemanticDocumentation: submittedUseSemanticDocumentationFirst,
      });

      const waitForAssistantRequestRateLimit = async () => {
        if (effectiveAssistantRequestRateLimitPerMinute <= 0) return;
        const intervalMs = 60_000 / effectiveAssistantRequestRateLimitPerMinute;
        const now = Date.now();
        const waitMs = Math.max(0, assistantRequestRateNextSlotAtRef.current - now);
        if (waitMs > 0) {
          await new Promise(resolve => window.setTimeout(resolve, waitMs));
        }
        assistantRequestRateNextSlotAtRef.current = Date.now() + intervalMs;
      };

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

        if (call.name === 'docsFind') {
          const description = typeof args.description === 'string' ? args.description.trim() : '';
          const rawDocsFindArgs: string[] = [];
          if (typeof args.typeLimit === 'number' && Number.isFinite(args.typeLimit)) {
            rawDocsFindArgs.push('--types', String(args.typeLimit));
          }
          if (typeof args.memberLimit === 'number' && Number.isFinite(args.memberLimit)) {
            rawDocsFindArgs.push('--members', String(args.memberLimit));
          }
          if (args.hideReason === true) rawDocsFindArgs.push('--hide-reason');
          if (args.hideDocumentation === true) rawDocsFindArgs.push('--hide-docs');
          if (description) rawDocsFindArgs.push(description);
          const command = `docs find${rawDocsFindArgs.length > 0 ? ` ${rawDocsFindArgs.map(quoteTerminalArg).join(' ')}` : ''}`;
          try {
            const lines = await executeDocsFindCommand(rawDocsFindArgs);
            appendTerminalCommandResult(command, lines);
            return {
              summary: description
                ? `Found documentation matches for \`${description}\`.`
                : 'docs find needs a description.',
              detail: lines.join('\n'),
              result: {
                ok: true,
                query: description,
                output: lines,
              },
            };
          } catch (error) {
            const message = `docs find error: ${error instanceof Error ? error.message : String(error)}`;
            appendTerminalCommandResult(command, [message]);
            return {
              summary: message,
              detail: message,
              result: {
                ok: false,
                query: description,
                error: message,
              },
            };
          }
        }

        if (call.name === 'docsGet') {
          const itemName = typeof args.itemName === 'string' ? args.itemName.trim() : '';
          const command = `docs get${itemName ? ` ${quoteTerminalArg(itemName)}` : ''}`;
          try {
            const lines = await executeDocsGetCommand(itemName ? [itemName] : []);
            appendTerminalCommandResult(command, lines);
            return {
              summary: itemName
                ? `Retrieved documentation for \`${itemName}\`.`
                : 'docs get needs an item name.',
              detail: lines.join('\n'),
              result: {
                ok: itemName.length > 0,
                itemName,
                output: lines,
              },
            };
          } catch (error) {
            const message = `docs get error: ${error instanceof Error ? error.message : String(error)}`;
            appendTerminalCommandResult(command, [message]);
            return {
              summary: message,
              detail: message,
              result: {
                ok: false,
                itemName,
                error: message,
              },
            };
          }
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

        if (call.name === 'ls' || call.name === 'terminalLs') {
          const rawPathArg = [args.pathOrName, args.path, args.directory, args.target]
            .find(value => typeof value === 'string' && value.trim());
          const requestedPath = typeof rawPathArg === 'string' ? rawPathArg.trim() : '';
          const listsCurrentDirectory = !requestedPath || requestedPath === '.';
          const listsRootDirectory = requestedPath === '/' || requestedPath === '~';
          const target = requestedPath && !listsCurrentDirectory && !listsRootDirectory
            ? findItemInTerminalContext(requestedPath)
            : undefined;
          if (!listsCurrentDirectory && !listsRootDirectory && (!target || target.type !== 'folder')) {
            const message = `ls: cannot access '${requestedPath}': No such directory`;
            appendTerminalCommandResult(`ls ${requestedPath}`, [message]);
            return { summary: message, detail: message, result: { ok: false } };
          }
          const folderId = listsRootDirectory ? null : target?.id ?? assistantTerminalCwd;
          const items = assistantFiles.filter(file => file.parentId === folderId).map(file => file.name).join('  ');
          appendTerminalCommandResult(requestedPath ? `ls ${requestedPath}` : 'ls', [items || '(empty)']);
          return {
            summary: `Listed ${target ? getPathFromSnapshot(target.id) : listsRootDirectory ? 'workspace root' : 'the current directory'}.`,
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
            'Documentation: docs find [--types N] [--members N] [--hide-reason] [--hide-docs] <description>',
            'Documentation: docs get <item-name>',
            'Code navigation: codin get <CSharpSymbolPath> (C#)',
            'Python: pip install <package> [-force] | pip upgrade <package> [-version <ver>] | pip uninstall <package> | pip include <module> | pip list',
            'JavaScript/TypeScript: npm install <package...> | npm uninstall <package...> | npm include <module> [url] | npm remove <module> | npm list',
            'C#: nuget include <namespace> | nuget list',
            'JavaScript/TypeScript: use Run or Project Run on .js, .jsx, .ts, and .tsx files',
            'C/C++: use Run or Project Run on .c, .cpp, .cc, .cxx, and matching header files',
            'Java: use Run or Project Run on .java files',
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

        if (call.name === 'npmInstall') {
          const packageName = typeof args.packageName === 'string' ? args.packageName.trim() : '';
          if (!packageName) {
            return { summary: 'npm install needs a package name.', detail: 'npm install needs a package name.', result: { ok: false } };
          }
          const packageSpecs = getNpmPackageArgs(parseTerminalArgs(packageName));
          const command = `npm install ${(packageSpecs.length > 0 ? packageSpecs : [packageName]).map(quoteTerminalArg).join(' ')}`;
          return runRawTerminalCommand(command, `Executed \`${command}\`.`, `Executed ${command}.`);
        }

        if (call.name === 'npmInclude') {
          const moduleName = typeof args.moduleName === 'string' ? args.moduleName.trim() : '';
          if (!moduleName) {
            return { summary: 'npm include needs a module name.', detail: 'npm include needs a module name.', result: { ok: false } };
          }
          const urlSegment = typeof args.url === 'string' && args.url.trim()
            ? ` ${quoteTerminalArg(args.url.trim())}`
            : '';
          const command = `npm include ${quoteTerminalArg(moduleName)}${urlSegment}`;
          return runRawTerminalCommand(command, `Executed \`${command}\`.`, `Executed ${command}.`);
        }

        if (call.name === 'npmList') {
          return runRawTerminalCommand('npm list', 'Listed installed npm packages and included JavaScript modules.', 'Listed installed npm packages and included JavaScript modules.');
        }

        if (call.name === 'npmUninstall') {
          const packageName = typeof args.packageName === 'string' ? args.packageName.trim() : '';
          if (!packageName) {
            return { summary: 'npm uninstall needs a package name.', detail: 'npm uninstall needs a package name.', result: { ok: false } };
          }
          const packageSpecs = getNpmPackageArgs(parseTerminalArgs(packageName));
          const command = `npm uninstall ${(packageSpecs.length > 0 ? packageSpecs : [packageName]).map(quoteTerminalArg).join(' ')}`;
          return runRawTerminalCommand(command, `Executed \`${command}\`.`, `Executed ${command}.`);
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

        if (call.name === 'codinGet') {
          const symbolPath = typeof args.symbolPath === 'string' ? args.symbolPath.trim() : '';
          if (!symbolPath) {
            return { summary: 'codin get needs a C# symbol path.', detail: 'codin get needs a C# symbol path.', result: { ok: false } };
          }
          const command = `codin get ${quoteTerminalArg(symbolPath)}`;
          return runRawTerminalCommand(command, `Retrieved \`${symbolPath}\` with codin get.`, `Retrieved ${symbolPath} with codin get.`);
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
          await waitForAssistantRequestRateLimit();
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

          await waitForAssistantRequestRateLimit();
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

      const runOpenAIResponsesCompatibleLoop = async (config: AssistantOpenAIResponsesProviderConfig) => {
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

          await waitForAssistantRequestRateLimit();
          const response = await fetch(config.endpoint, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'Authorization': `Bearer ${apiKey}`,
            },
            body: JSON.stringify(payload),
          });

          const responseJson = await response.json();
          if (!response.ok) {
            throw new Error(responseJson?.error?.message || config.requestLabel);
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

      const runOpenAIChatCompatibleLoop = async (config: AssistantOpenAIChatProviderConfig) => {
        const messages: any[] = [{ role: 'user', content: buildAssistantPrompt() }];
        const maxTokenKey = provider === 'cerebras' || provider === 'groq'
          ? 'max_completion_tokens'
          : 'max_tokens';

        for (let pass = 0; pass < maxAssistantToolPasses; pass++) {
          const payload: any = {
            model,
            messages,
            [maxTokenKey]: config.defaultMaxTokens,
            ...getOpenAIChatReasoningRequestOptions(provider, model, effectiveAssistantUseChainOfThought),
          };
          if (assistantTools.length > 0) {
            payload.tools = assistantTools.map(toOpenAIChatToolDefinition);
            payload.tool_choice = 'auto';
          }

          await waitForAssistantRequestRateLimit();
          const response = await fetch(config.endpoint, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'Authorization': `Bearer ${apiKey}`,
            },
            body: JSON.stringify(payload),
          });

          const responseJson = await response.json();
          if (!response.ok) {
            throw new Error(responseJson?.error?.message || config.requestLabel);
          }

          const assistantText = extractOpenAIChatVisibleText(responseJson);
          const outputTokens = typeof responseJson?.usage?.completion_tokens === 'number'
            ? responseJson.usage.completion_tokens
            : undefined;
          const reasoningTokens = getOpenAIChatReasoningTokenCount(responseJson);
          applyAssistantUsage(
            usageTotals,
            {
              promptTokenCount: responseJson?.usage?.prompt_tokens,
              candidateTokenCount: typeof outputTokens === 'number' ? Math.max(0, outputTokens - reasoningTokens) : undefined,
              thoughtsTokenCount: reasoningTokens,
              totalTokenCount: responseJson?.usage?.total_tokens,
              hasModelUsage: !!responseJson?.usage,
            },
            JSON.stringify(messages),
            assistantText,
          );

          if (assistantText) {
            emitAssistantLiveMessage(assistantText);
          }

          const responseMessage = responseJson?.choices?.[0]?.message || {};
          const toolCalls = Array.isArray(responseMessage?.tool_calls)
            ? responseMessage.tool_calls
            : [];
          if (toolCalls.length === 0) break;

          const passSummaries: string[] = [];
          const passDetails: string[] = [];
          messages.push(normalizeOpenAIChatAssistantMessage(provider, responseMessage));

          for (const toolCall of toolCalls) {
            const outcome = await executeAssistantToolCall({
              name: toolCall?.function?.name,
              args: safeJsonParse(toolCall?.function?.arguments || '{}'),
              callId: toolCall?.id,
            });
            passSummaries.push(outcome.summary);
            passDetails.push(outcome.detail);
            messages.push({
              role: 'tool',
              tool_call_id: toolCall.id,
              content: JSON.stringify(outcome.result ?? { summary: outcome.summary, detail: outcome.detail }),
            });
          }

          if (passSummaries.length > 0) {
            emitAssistantLog(`Step ${pass + 1} log:\n${passSummaries.map(summary => `- ${summary}`).join('\n')}`);
          }
          if (passDetails.length > 0) {
            toolProgressNotes.push(passDetails.join(' '));
          }
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

          await waitForAssistantRequestRateLimit();
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

      const runCursorAgentsLoop = async () => {
        const readCursorResponse = async (response: Response) => {
          const text = await response.text();
          return {
            text,
            json: text ? safeJsonParse(text) : {},
          };
        };

        const getCursorErrorMessage = (json: any, text: string, fallback: string) => {
          const error = json?.error && typeof json.error === 'object' ? json.error : json;
          const message = typeof error?.message === 'string' && error.message.trim()
            ? error.message.trim()
            : text.trim();
          const code = typeof error?.code === 'string' && error.code.trim()
            ? error.code.trim()
            : '';
          if (message && code) return `[${code}] ${message}`;
          return message || fallback;
        };

        const cursorRequest = async (
          path: string,
          init: RequestInit,
          fallbackErrorMessage: string,
        ) => {
          await waitForAssistantRequestRateLimit();
          const response = await fetch(buildDelegatedRequestUrl(`${CURSOR_AGENTS_API_BASE_URL}${path}`), {
            ...init,
            headers: {
              'Authorization': `Bearer ${apiKey}`,
              ...(init.body ? { 'Content-Type': 'application/json' } : {}),
              ...(init.headers || {}),
            },
          });
          const body = await readCursorResponse(response);
          if (!response.ok) {
            throw new Error(getCursorErrorMessage(body.json, body.text, fallbackErrorMessage));
          }
          return body.json;
        };

        const sleep = (ms: number) => new Promise(resolve => window.setTimeout(resolve, ms));

        const launchCursorAgent = async (promptText: string, passIndex: number) => {
          const branchSuffix = `${Date.now().toString(36)}-${passIndex + 1}`;
          const createPayload: any = {
            prompt: { text: promptText },
            source: {
              repository: CURSOR_AGENTS_GITHUB_REPOSITORY_URL,
            },
            target: {
              autoCreatePr: false,
              branchName: `codecraft/local-ide-bridge-${branchSuffix}`,
            },
          };
          if (model.trim()) createPayload.model = model.trim();

          const createJson = await cursorRequest(
            '/v0/agents',
            { method: 'POST', body: JSON.stringify(createPayload) },
            'Cursor Agents request failed.',
          );
          const agentId = createJson?.id;
          if (typeof agentId !== 'string' || !agentId.trim()) {
            throw new Error('Cursor Agents request did not return an agent id.');
          }
          return agentId;
        };

        const waitForCursorAgent = async (agentId: string) => {
          const startedAt = Date.now();
          let lastStatus: any = null;
          while (Date.now() - startedAt < CURSOR_AGENT_STATUS_TIMEOUT_MS) {
            const statusJson = await cursorRequest(
              `/v0/agents/${encodeURIComponent(agentId)}`,
              { method: 'GET' },
              'Cursor Agents status request failed.',
            );
            lastStatus = statusJson;
            const status = typeof statusJson?.status === 'string' ? statusJson.status : '';
            if (status === 'FINISHED') return statusJson;
            if (status === 'ERROR' || status === 'EXPIRED') {
              const summary = typeof statusJson?.summary === 'string' ? statusJson.summary.trim() : '';
              throw new Error(summary || `Cursor Agent ended with status ${status}.`);
            }
            await sleep(CURSOR_AGENT_STATUS_POLL_INTERVAL_MS);
          }

          const statusLabel = typeof lastStatus?.status === 'string' ? ` Last status: ${lastStatus.status}.` : '';
          throw new Error(`Cursor Agent timed out before completing.${statusLabel}`);
        };

        const readCursorConversation = async (agentId: string) => {
          const conversationJson = await cursorRequest(
            `/v0/agents/${encodeURIComponent(agentId)}/conversation`,
            { method: 'GET' },
            'Cursor Agents conversation request failed.',
          );
          const assistantMessages = (Array.isArray(conversationJson?.messages) ? conversationJson.messages : [])
            .filter((message: any) => message?.type === 'assistant_message' && typeof message?.text === 'string')
            .map((message: any) => String(message.text).trim())
            .filter(Boolean);
          return assistantMessages[assistantMessages.length - 1] || '';
        };

        const deleteCursorAgent = async (agentId: string) => {
          try {
            await cursorRequest(
              `/v0/agents/${encodeURIComponent(agentId)}`,
              { method: 'DELETE' },
              'Cursor Agents delete request failed.',
            );
          } catch {
            // Best-effort cleanup only; the local IDE state has already been updated.
          }
        };

        const runCursorAgentPrompt = async (promptText: string, passIndex: number) => {
          const agentId = await launchCursorAgent(promptText, passIndex);
          try {
            const statusJson = await waitForCursorAgent(agentId);
            const conversationText = await readCursorConversation(agentId);
            const summaryText = typeof statusJson?.summary === 'string' ? statusJson.summary.trim() : '';
            return conversationText || summaryText;
          } finally {
            await deleteCursorAgent(agentId);
          }
        };

        let cursorExecutedLocalTools = false;
        for (let pass = 0; pass < maxAssistantToolPasses; pass++) {
          const promptForRun = buildAssistantPrompt();
          const cursorPromptForRun = `
            Repository isolation rule:
            Cursor's public Background Agents API requires a GitHub repository source, but CodeCraft must not use that repository as the editing target. Treat the attached repository as a placeholder transport requirement only. Do not read, inspect, list, search, open, clone, diff, checkout, branch, commit, push, edit, delete, create pull requests for, or otherwise access that repository or any GitHub repository.

            Local IDE tool bridge:
            ${buildCursorLocalToolBridgeInstruction(assistantTools)}

            CodeCraft task context:
            ${promptForRun}
          `;

          const assistantText = (await runCursorAgentPrompt(cursorPromptForRun, pass)).trim();
          const bridgeResponse = parseCursorLocalToolBridgeResponse(assistantText);
          const visibleText = bridgeResponse
            ? (
              bridgeResponse.message
              || (bridgeResponse.consumedEntireResponse ? '' : stripCursorLocalToolBridgeBlocks(assistantText))
            ).trim()
            : assistantText;

          applyAssistantUsage(
            usageTotals,
            {},
            cursorPromptForRun,
            assistantText,
          );

          if (visibleText) {
            emitAssistantLiveMessage(visibleText);
          }

          const toolCalls = bridgeResponse?.toolCalls || [];
          if (toolCalls.length === 0) break;

          cursorExecutedLocalTools = true;
          const passSummaries: string[] = [];
          const passResults: unknown[] = [];
          for (const toolCall of toolCalls) {
            const outcome = await executeAssistantToolCall(toolCall);
            passSummaries.push(outcome.summary);
            passResults.push({
              toolCall,
              summary: outcome.summary,
              detail: outcome.detail,
              result: outcome.result ?? null,
            });
          }

          if (passSummaries.length > 0) {
            emitAssistantLog(`Cursor IDE step ${pass + 1} log:\n${passSummaries.map(summary => `- ${summary}`).join('\n')}`);
          }
          if (passResults.length > 0) {
            toolProgressNotes.push(`Cursor local tool results from step ${pass + 1}:\n${JSON.stringify(passResults, null, 2)}`);
          }
        }

        if (cursorExecutedLocalTools && !emittedAssistantMessage) {
          emitAssistantLiveMessage('I ran the Cursor-requested IDE tool steps. Review the editor changes and tool log above.');
        }
      };

      if (provider === 'gemini') {
        await runGeminiLoop();
      } else if (provider === 'openai') {
        await runOpenAILoop();
      } else if (provider === 'anthropic') {
        await runAnthropicLoop();
      } else if (provider === 'cursor') {
        await runCursorAgentsLoop();
      } else {
        const responsesConfig = getOpenAIResponsesProviderConfig(provider);
        const chatConfig = getOpenAIChatProviderConfig(provider);
        if (responsesConfig) {
          await runOpenAIResponsesCompatibleLoop(responsesConfig);
        } else if (chatConfig) {
          await runOpenAIChatCompatibleLoop(chatConfig);
        } else {
          throw new Error(`${getAssistantProviderLabel(provider)} is not wired yet.`);
        }
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

  const getNpmPackageArgs = (rawArgs: string[]) => {
    const packageArgs: string[] = [];
    const flagsWithValues = new Set(['--registry', '--tag', '--save-prefix', '--cache', '--prefix']);
    for (let index = 0; index < rawArgs.length; index += 1) {
      const arg = rawArgs[index];
      if (!arg) continue;
      if (arg === '--') {
        packageArgs.push(...rawArgs.slice(index + 1).filter(Boolean));
        break;
      }
      if (arg.startsWith('-')) {
        const flagName = arg.includes('=') ? arg.slice(0, arg.indexOf('=')) : arg;
        if (flagsWithValues.has(flagName) && !arg.includes('=')) index += 1;
        continue;
      }
      packageArgs.push(arg);
    }
    return packageArgs;
  };

  const updateGitState = (updater: (current: GitRepositoryState) => GitRepositoryState) => {
    const next = updater(gitStateRef.current);
    gitStateMutationVersionRef.current += 1;
    gitStateRef.current = next;
    setGitState(next);
    return next;
  };

  const getGitHubAuth = () => {
    const auth = gitStateRef.current.ghAuth;
    if (!auth?.token) throw new Error('GitHub authentication required. Run gh auth login first.');
    return auth;
  };

  const githubApiRequest = async (path: string, init: RequestInit = {}, token = getGitHubAuth().token) => {
    const response = await fetch(`https://api.github.com${path}`, {
      ...init,
      headers: {
        'Accept': 'application/vnd.github+json',
        'Authorization': `Bearer ${token}`,
        'X-GitHub-Api-Version': '2022-11-28',
        ...(init.body ? { 'Content-Type': 'application/json' } : {}),
        ...(init.headers || {}),
      },
    });
    const text = await response.text();
    const json = text ? safeJsonParse(text) : null;
    if (!response.ok) {
      const message = typeof json?.message === 'string' ? json.message : text || `GitHub request failed (${response.status})`;
      throw new Error(message);
    }
    return json;
  };

  const getGitHubRemoteFiles = async (repoRef: GitHubRepositoryRef, commitSha: string) => {
    const commit = await githubApiRequest(`/repos/${encodeURIComponent(repoRef.owner)}/${encodeURIComponent(repoRef.repo)}/git/commits/${encodeURIComponent(commitSha)}`);
    const treeSha = commit?.tree?.sha;
    if (!treeSha) return {};
    const tree = await githubApiRequest(`/repos/${encodeURIComponent(repoRef.owner)}/${encodeURIComponent(repoRef.repo)}/git/trees/${encodeURIComponent(treeSha)}?recursive=1`);
    const files: Record<string, string> = {};
    const blobs = (Array.isArray(tree?.tree) ? tree.tree : [])
      .filter((entry: any) => entry?.type === 'blob' && typeof entry.path === 'string' && typeof entry.sha === 'string');

    await Promise.all(blobs.map(async (entry: any) => {
      const blob = await githubApiRequest(`/repos/${encodeURIComponent(repoRef.owner)}/${encodeURIComponent(repoRef.repo)}/git/blobs/${encodeURIComponent(entry.sha)}`);
      if (typeof blob?.content === 'string') files[normalizeProjectPath(entry.path)] = decodeGitHubBase64Content(blob.content);
    }));
    return files;
  };

  const fetchGitHubRemote = async (remote: GitRemoteRecord) => {
    const repoRef = parseGitHubRemoteUrl(remote.url);
    if (!repoRef) return remote;
    getGitHubAuth();
    let refs: any;
    try {
      refs = await githubApiRequest(`/repos/${encodeURIComponent(repoRef.owner)}/${encodeURIComponent(repoRef.repo)}/git/matching-refs/heads`);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      if (/git repository is empty/i.test(message)) {
        return { ...remote, branchHeads: {}, branchFiles: {} };
      }
      throw error;
    }
    const branchHeads: Record<string, string | null> = {};
    const branchFiles: Record<string, Record<string, string>> = {};

    for (const ref of Array.isArray(refs) ? refs : []) {
      const refName = typeof ref?.ref === 'string' ? ref.ref.replace(/^refs\/heads\//, '') : '';
      const sha = typeof ref?.object?.sha === 'string' ? ref.object.sha : '';
      if (!refName || !sha) continue;
      branchHeads[refName] = sha;
      branchFiles[refName] = await getGitHubRemoteFiles(repoRef, sha);
    }

    return { ...remote, branchHeads, branchFiles };
  };

  const loadRemoteForGit = async (remote: GitRemoteRecord) => {
    if (!isSupportedGitRemoteUrl(remote.url)) {
      throw new Error(`fatal: '${remote.url}' is not a supported Git remote URL. ${getSupportedGitRemoteUrlHelp()}`);
    }
    if (isGitHubRemote(remote)) return fetchGitHubRemote(remote);
    return await loadStoredGitRemote(remote);
  };

  const refreshGitRemotes = async (state = gitStateRef.current, remoteName?: string) => {
    if (remoteName && !state.remotes[remoteName]) {
      throw new Error(`fatal: '${remoteName}' does not appear to be a git remote`);
    }
    const remotes: Record<string, GitRemoteRecord> = remoteName ? { ...state.remotes } : {};
    const entries = remoteName ? [[remoteName, state.remotes[remoteName]] as const] : Object.entries(state.remotes);
    for (const [name, remote] of entries) {
      remotes[name] = await loadRemoteForGit(remote);
    }
    return updateGitState(current => {
      const commits = { ...current.commits };
      const fetchedAt = Date.now();
      for (const remote of Object.values(remotes)) {
        for (const [branchName, sha] of Object.entries(remote.branchHeads)) {
          if (!sha || commits[sha]) continue;
          commits[sha] = {
            id: sha,
            message: `Remote ${remote.name}/${branchName}`,
            author: 'GitHub <noreply@github.com>',
            timestamp: fetchedAt,
            parentIds: [],
            files: remote.branchFiles[branchName] || {},
          };
        }
      }
      return { ...current, remotes, commits, lastFetchedAt: fetchedAt };
    });
  };

  const getCurrentGitHubRepositoryRef = () => {
    const origin = gitStateRef.current.remotes.origin;
    const repoRef = origin ? parseGitHubRemoteUrl(origin.url) : null;
    if (!repoRef) throw new Error('gh: current repository does not have a GitHub origin remote.');
    return repoRef;
  };

  const getCliOptionValue = (args: string[], names: string[]) => {
    for (const name of names) {
      const index = args.findIndex(arg => arg === name || arg.startsWith(`${name}=`));
      if (index < 0) continue;
      const arg = args[index];
      if (arg.includes('=')) return arg.slice(arg.indexOf('=') + 1);
      return args[index + 1] || '';
    }
    return '';
  };

  const createGitHubCommit = async (
    remote: GitRemoteRecord,
    branchName: string,
    files: Record<string, string>,
    message: string,
    parentSha: string | null,
  ) => {
    const repoRef = parseGitHubRemoteUrl(remote.url);
    if (!repoRef) throw new Error('Remote is not a GitHub repository.');
    getGitHubAuth();
    const tree = await githubApiRequest(
      `/repos/${encodeURIComponent(repoRef.owner)}/${encodeURIComponent(repoRef.repo)}/git/trees`,
      {
        method: 'POST',
        body: JSON.stringify({
          tree: Object.entries(files).map(([path, content]) => ({
            path,
            mode: '100644',
            type: 'blob',
            content,
          })),
        }),
      },
    );
    if (!tree?.sha) throw new Error('GitHub did not return a tree SHA.');
    const commitPayload: any = {
      message,
      tree: tree.sha,
      parents: parentSha ? [parentSha] : [],
    };
    const commit = await githubApiRequest(
      `/repos/${encodeURIComponent(repoRef.owner)}/${encodeURIComponent(repoRef.repo)}/git/commits`,
      {
        method: 'POST',
        body: JSON.stringify(commitPayload),
      },
    );
    if (!commit?.sha) throw new Error('GitHub did not return a commit SHA.');

    const branchExists = Object.prototype.hasOwnProperty.call(remote.branchHeads, branchName);
    if (branchExists) {
      await githubApiRequest(
        `/repos/${encodeURIComponent(repoRef.owner)}/${encodeURIComponent(repoRef.repo)}/git/refs/heads/${encodeURIComponent(branchName)}`,
        {
          method: 'PATCH',
          body: JSON.stringify({ sha: commit.sha, force: false }),
        },
      );
    } else {
      await githubApiRequest(
        `/repos/${encodeURIComponent(repoRef.owner)}/${encodeURIComponent(repoRef.repo)}/git/refs`,
        {
          method: 'POST',
          body: JSON.stringify({ ref: `refs/heads/${branchName}`, sha: commit.sha }),
        },
      );
    }

    return commit.sha as string;
  };

  const createGitCommit = (message: string, stagedPaths?: string[]) => {
    const commitMessage = message.trim();
    if (!commitMessage) return { ok: false, lines: ['git commit: commit message is required.'] };

    const currentState = gitStateRef.current;
    const currentFiles = filesRef.current;
    const allChanges = getGitWorkspaceChanges(currentState, currentFiles);
    const normalizedStagedPaths = stagedPaths?.map(normalizeProjectPath).filter(Boolean) || null;
    const stagedPathSet = normalizedStagedPaths ? new Set(normalizedStagedPaths) : null;
    const changes = stagedPathSet
      ? allChanges.filter(change => stagedPathSet.has(change.path))
      : allChanges;
    if (changes.length === 0) return { ok: false, lines: ['nothing to commit, working tree clean'] };

    const headSnapshot = getGitHeadCommit(currentState)?.files || {};
    const currentSnapshot = serializeWorkspaceSnapshot(currentFiles);
    const snapshot = stagedPathSet
      ? { ...headSnapshot }
      : currentSnapshot;
    if (stagedPathSet) {
      for (const change of changes) {
        if (change.kind === 'deleted') delete snapshot[change.path];
        else snapshot[change.path] = currentSnapshot[change.path] || '';
      }
    }
    const timestamp = Date.now();
    const branch = currentState.branches[currentState.currentBranch] || {
      name: currentState.currentBranch,
      head: null,
      upstream: `origin/${currentState.currentBranch}`,
    };
    const parentIds = branch.head ? [branch.head] : [];
    const id = createGitCommitId(snapshot, commitMessage, timestamp);
    const authorName = currentState.config['user.name'] || currentState.ghAuth?.user || 'CodeCraft User';
    const authorEmail = currentState.config['user.email'] || 'codecraft@example.local';
    const commit: GitCommitRecord = {
      id,
      message: commitMessage,
      author: `${authorName} <${authorEmail}>`,
      timestamp,
      parentIds,
      files: snapshot,
    };

    updateGitState(state => ({
      ...state,
      currentBranch: branch.name,
      branches: {
        ...state.branches,
        [branch.name]: {
          ...branch,
          head: id,
        },
      },
      commits: {
        ...state.commits,
        [id]: commit,
      },
      stagedPaths: [],
    }));

    setSourceControlCommitMessage('');
    return {
      ok: true,
      lines: [
        `[${branch.name} ${id.slice(0, 7)}] ${commitMessage}`,
        `${changes.length} file${changes.length === 1 ? '' : 's'} changed`,
      ],
    };
  };

  const stageGitPaths = (pathspecs: string[] = []) => {
    const state = gitStateRef.current;
    const changes = getGitWorkspaceChanges(state, filesRef.current);
    if (changes.length === 0) return { ok: true, lines: ['nothing to add'] };
    const matchedPaths = changes
      .filter(change => matchesGitPathspec(change.path, pathspecs))
      .map(change => change.path);
    if (matchedPaths.length === 0) return { ok: false, lines: [`fatal: pathspec '${pathspecs.join(' ')}' did not match any files`] };
    updateGitState(current => ({
      ...current,
      stagedPaths: [...new Set([...(current.stagedPaths || []), ...matchedPaths])],
    }));
    return { ok: true, lines: [`Staged ${matchedPaths.length} change${matchedPaths.length === 1 ? '' : 's'}.`] };
  };

  const unstageGitPaths = (pathspecs: string[] = []) => {
    const state = gitStateRef.current;
    const staged = state.stagedPaths || [];
    const nextStaged = pathspecs.length === 0 || pathspecs.includes('.')
      ? []
      : staged.filter(path => !matchesGitPathspec(path, pathspecs));
    updateGitState(current => ({ ...current, stagedPaths: nextStaged }));
    return { ok: true, lines: [`Unstaged ${staged.length - nextStaged.length} path${staged.length - nextStaged.length === 1 ? '' : 's'}.`] };
  };

  const restoreGitPaths = (pathspecs: string[] = [], stagedOnly = false) => {
    if (stagedOnly) return unstageGitPaths(pathspecs);
    const state = gitStateRef.current;
    const headFiles = getGitHeadCommit(state)?.files || {};
    const currentSnapshot = serializeWorkspaceSnapshot(filesRef.current);
    const nextSnapshot = { ...currentSnapshot };
    const paths = new Set([...Object.keys(currentSnapshot), ...Object.keys(headFiles)]);
    let restoredCount = 0;
    for (const path of paths) {
      if (!matchesGitPathspec(path, pathspecs)) continue;
      restoredCount += 1;
      if (Object.prototype.hasOwnProperty.call(headFiles, path)) nextSnapshot[path] = headFiles[path];
      else delete nextSnapshot[path];
    }
    if (restoredCount === 0) return { ok: false, lines: [`error: pathspec '${pathspecs.join(' ')}' did not match any files`] };
    setFiles(current => createFsItemsFromSnapshot(nextSnapshot, current));
    updateGitState(current => ({
      ...current,
      stagedPaths: (current.stagedPaths || []).filter(path => !matchesGitPathspec(path, pathspecs)),
    }));
    return { ok: true, lines: [`Restored ${restoredCount} path${restoredCount === 1 ? '' : 's'}.`] };
  };

  const resetGitToRevision = (revision = 'HEAD', mode: 'soft' | 'mixed' | 'hard' = 'mixed') => {
    const state = gitStateRef.current;
    const targetCommit = getGitRevisionCommit(state, revision);
    if (!targetCommit) return { ok: false, lines: [`fatal: ambiguous argument '${revision}': unknown revision or path not in the working tree`] };
    if (mode === 'hard') setFiles(current => createFsItemsFromSnapshot(targetCommit.files, current));
    updateGitState(current => ({
      ...current,
      branches: {
        ...current.branches,
        [current.currentBranch]: {
          ...current.branches[current.currentBranch],
          head: targetCommit.id,
        },
      },
      stagedPaths: mode === 'soft' ? current.stagedPaths || [] : [],
    }));
    return { ok: true, lines: [`HEAD is now at ${targetCommit.id.slice(0, 7)} ${targetCommit.message}`] };
  };

  const cleanGitWorkspace = () => {
    const state = gitStateRef.current;
    const headFiles = getGitHeadCommit(state)?.files || {};
    const currentSnapshot = serializeWorkspaceSnapshot(filesRef.current);
    const addedPaths = Object.keys(currentSnapshot).filter(path => !Object.prototype.hasOwnProperty.call(headFiles, path));
    if (addedPaths.length === 0) return { ok: true, lines: ['Nothing to clean.'] };
    const nextSnapshot = { ...currentSnapshot };
    for (const path of addedPaths) delete nextSnapshot[path];
    setFiles(current => createFsItemsFromSnapshot(nextSnapshot, current));
    updateGitState(current => ({ ...current, stagedPaths: (current.stagedPaths || []).filter(path => !addedPaths.includes(path)) }));
    return { ok: true, lines: addedPaths.map(path => `Removing ${path}`) };
  };

  const createGitStash = (message?: string) => {
    const state = gitStateRef.current;
    const changes = getGitWorkspaceChanges(state, filesRef.current);
    if (changes.length === 0) return { ok: true, lines: ['No local changes to save'] };
    const branch = state.branches[state.currentBranch];
    const stash: GitStashRecord = {
      id: `stash-${Date.now().toString(36)}`,
      message: message?.trim() || `WIP on ${state.currentBranch}`,
      branch: state.currentBranch,
      baseHead: branch?.head || null,
      timestamp: Date.now(),
      files: serializeWorkspaceSnapshot(filesRef.current),
    };
    const headFiles = getGitHeadCommit(state)?.files || {};
    setFiles(current => createFsItemsFromSnapshot(headFiles, current));
    updateGitState(current => ({ ...current, stashes: [stash, ...(current.stashes || [])], stagedPaths: [] }));
    return { ok: true, lines: [`Saved working directory and index state ${stash.id}: ${stash.message}`] };
  };

  const applyGitStash = (index = 0, drop = false) => {
    const state = gitStateRef.current;
    const stash = state.stashes[index];
    if (!stash) return { ok: false, lines: [`fatal: log for stash is empty`] };
    if (getGitWorkspaceChanges(state, filesRef.current).length > 0) {
      return { ok: false, lines: ['error: Your local changes would be overwritten by stash apply. Commit, reset, or stash them first.'] };
    }
    setFiles(current => createFsItemsFromSnapshot(stash.files, current));
    updateGitState(current => ({
      ...current,
      stashes: drop ? current.stashes.filter((_, stashIndex) => stashIndex !== index) : current.stashes,
      stagedPaths: [],
    }));
    return { ok: true, lines: [drop ? `Dropped and applied stash@{${index}}.` : `Applied stash@{${index}}.`] };
  };

  const mergeGitRevision = (revision: string) => {
    const state = gitStateRef.current;
    const targetCommit = getGitRevisionCommit(state, revision);
    const currentBranch = state.branches[state.currentBranch];
    const currentHead = currentBranch?.head || null;
    if (!targetCommit) return { ok: false, lines: [`merge: ${revision} - not something we can merge`] };
    if (getGitWorkspaceChanges(state, filesRef.current).length > 0) return { ok: false, lines: ['error: Your local changes would be overwritten by merge. Commit or stash them first.'] };
    if (!currentHead || isGitAncestor(state, currentHead, targetCommit.id)) {
      setFiles(current => createFsItemsFromSnapshot(targetCommit.files, current));
      updateGitState(current => ({
        ...current,
        branches: {
          ...current.branches,
          [current.currentBranch]: { ...current.branches[current.currentBranch], head: targetCommit.id },
        },
        stagedPaths: [],
      }));
      return { ok: true, lines: [`Fast-forward to ${targetCommit.id.slice(0, 7)}`] };
    }
    if (isGitAncestor(state, targetCommit.id, currentHead)) return { ok: true, lines: ['Already up to date.'] };

    const currentCommit = state.commits[currentHead];
    const baseId = getGitMergeBase(state, currentHead, targetCommit.id);
    const baseFiles = baseId ? state.commits[baseId]?.files || {} : {};
    const currentFiles = currentCommit?.files || {};
    const targetFiles = targetCommit.files;
    const paths = new Set([...Object.keys(baseFiles), ...Object.keys(currentFiles), ...Object.keys(targetFiles)]);
    const conflicts: string[] = [];
    const merged = { ...currentFiles };
    for (const path of paths) {
      const base = baseFiles[path];
      const currentValue = currentFiles[path];
      const targetValue = targetFiles[path];
      const currentChanged = currentValue !== base;
      const targetChanged = targetValue !== base;
      if (currentChanged && targetChanged && currentValue !== targetValue) conflicts.push(path);
      else if (targetChanged) {
        if (targetValue === undefined) delete merged[path];
        else merged[path] = targetValue;
      }
    }
    if (conflicts.length > 0) return { ok: false, lines: ['Automatic merge failed; fix conflicts and then commit the result.', ...conflicts.map(path => `CONFLICT ${path}`)] };

    const timestamp = Date.now();
    const message = `Merge ${revision} into ${state.currentBranch}`;
    const id = createGitCommitId(merged, message, timestamp);
    const authorName = state.config['user.name'] || state.ghAuth?.user || 'CodeCraft User';
    const authorEmail = state.config['user.email'] || 'codecraft@example.local';
    const commit: GitCommitRecord = {
      id,
      message,
      author: `${authorName} <${authorEmail}>`,
      timestamp,
      parentIds: [currentHead, targetCommit.id],
      files: merged,
    };
    setFiles(current => createFsItemsFromSnapshot(merged, current));
    updateGitState(current => ({
      ...current,
      branches: {
        ...current.branches,
        [current.currentBranch]: { ...current.branches[current.currentBranch], head: id },
      },
      commits: { ...current.commits, [id]: commit },
      stagedPaths: [],
    }));
    return { ok: true, lines: [`Merge made by the CodeCraft strategy.`, formatGitCommitLine(commit)] };
  };

  const getGitSyncStatusForOperation = (remoteName?: string, remoteBranch?: string) => {
    const currentState = gitStateRef.current;
    const branch = currentState.branches[currentState.currentBranch];
    if (!branch) throw new Error(`fatal: current branch '${currentState.currentBranch}' is missing`);
    if (!remoteName && !remoteBranch) return getGitBranchSyncStatus(currentState);
    const resolvedRemote = remoteName || (branch.upstream?.split('/')[0] || 'origin');
    const resolvedBranch = remoteBranch || currentState.currentBranch;
    if (!isValidGitRemoteName(resolvedRemote) || !currentState.remotes[resolvedRemote]) {
      throw new Error(`fatal: '${resolvedRemote}' does not appear to be a git remote`);
    }
    if (!isValidGitBranchName(resolvedBranch)) throw new Error(getInvalidGitBranchMessage(resolvedBranch));
    return getGitBranchSyncStatus({
      ...currentState,
      branches: {
        ...currentState.branches,
        [currentState.currentBranch]: {
          ...branch,
          upstream: `${resolvedRemote}/${resolvedBranch}`,
        },
      },
    });
  };

  const publishGitBranch = async () => {
    const currentState = gitStateRef.current;
    const status = getGitBranchSyncStatus(currentState);
    const remote = currentState.remotes[status.remoteName];
    const branch = currentState.branches[currentState.currentBranch];
    if (!remote) return { ok: false, lines: [`fatal: '${status.remoteName}' does not appear to be a git remote`] };
    if (!branch?.head) return { ok: false, lines: ['No commits to publish.'] };
    const headCommit = currentState.commits[branch.head];
    if (!headCommit) return { ok: false, lines: ['Current branch head is missing.'] };

    let nextRemote: GitRemoteRecord;
    let nextHead = branch.head;
    if (isGitHubRemote(remote)) {
      const githubCommitSha = await createGitHubCommit(remote, status.remoteBranch, headCommit.files, headCommit.message, status.remoteHead);
      nextHead = githubCommitSha;
      nextRemote = await fetchGitHubRemote({ ...remote, branchHeads: { ...remote.branchHeads, [status.remoteBranch]: githubCommitSha } });
    } else {
      nextRemote = {
        ...remote,
        branchHeads: { ...remote.branchHeads, [status.remoteBranch]: branch.head },
        branchFiles: { ...remote.branchFiles, [status.remoteBranch]: headCommit.files },
      };
      await saveStoredGitRemote(nextRemote);
    }
    const pushedCommit: GitCommitRecord = nextHead === branch.head ? headCommit : {
      ...headCommit,
      id: nextHead,
      parentIds: status.remoteHead ? [status.remoteHead] : [],
    };
    updateGitState(state => ({
      ...state,
      branches: {
        ...state.branches,
        [branch.name]: { ...branch, head: nextHead, upstream: `${status.remoteName}/${status.remoteBranch}` },
      },
      commits: { ...state.commits, [nextHead]: pushedCommit },
      remotes: {
        ...state.remotes,
        [status.remoteName]: nextRemote,
      },
      lastFetchedAt: Date.now(),
    }));
    return { ok: true, lines: [`Published branch ${branch.name} to ${status.remoteName}/${status.remoteBranch}.`] };
  };

  const publishGitRepository = async () => {
    const currentState = gitStateRef.current;
    if (isGitRepositoryPublished(currentState)) return publishGitBranch();

    const repoSlug = activeProject.name
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '') || activeProject.id || 'codecraft-project';
    const owner = currentState.ghAuth?.user || 'codecraft';
    const url = currentState.ghAuth
      ? `github:${owner}/${repoSlug}`
      : `codecraft://remote/${activeProject.id || repoSlug}`;
    if (currentState.ghAuth) {
      try {
        await githubApiRequest('/user/repos', {
          method: 'POST',
          body: JSON.stringify({
            name: repoSlug,
            private: true,
            auto_init: false,
          }),
        });
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        if (!/name already exists|already exists/i.test(message)) throw error;
      }
    }
    const origin = await loadStoredGitRemote({
      name: 'origin',
      url,
      branchHeads: {},
      branchFiles: {},
    });

    updateGitState(state => ({
      ...state,
      remotes: {
        ...state.remotes,
        origin,
      },
      branches: {
        ...state.branches,
        [state.currentBranch]: {
          ...state.branches[state.currentBranch],
          upstream: `origin/${state.currentBranch}`,
        },
      },
    }));

    const publishedBranch = await publishGitBranch();
    return {
      ok: publishedBranch.ok,
      lines: [
        currentState.ghAuth
          ? `Published repository ${owner}/${repoSlug}.`
          : `Published repository to ${url}.`,
        ...publishedBranch.lines,
      ],
    };
  };

  const pushGitBranch = async (remoteName?: string, remoteBranch?: string) => {
    const currentState = gitStateRef.current;
    const status = getGitSyncStatusForOperation(remoteName, remoteBranch);
    if (status.needsPublish) {
      if (remoteName || remoteBranch) {
        updateGitState(state => ({
          ...state,
          branches: {
            ...state.branches,
            [state.currentBranch]: {
              ...state.branches[state.currentBranch],
              upstream: `${status.remoteName}/${status.remoteBranch}`,
            },
          },
        }));
      }
      return publishGitBranch();
    }
    const remote = currentState.remotes[status.remoteName];
    const branch = currentState.branches[currentState.currentBranch];
    if (!remote) return { ok: false, lines: [`fatal: '${status.remoteName}' does not appear to be a git remote`] };
    if (!branch?.head) return { ok: false, lines: ['Everything up-to-date'] };
    if (status.needsPull && !status.needsPush) return { ok: false, lines: ['Updates were rejected because the remote contains work that you do not have locally. Run git pull first.'] };
    const headCommit = currentState.commits[branch.head];
    if (!headCommit) return { ok: false, lines: ['Current branch head is missing.'] };

    let nextRemote: GitRemoteRecord;
    let nextHead = branch.head;
    if (isGitHubRemote(remote)) {
      const githubCommitSha = await createGitHubCommit(remote, status.remoteBranch, headCommit.files, headCommit.message, status.remoteHead);
      nextHead = githubCommitSha;
      nextRemote = await fetchGitHubRemote({ ...remote, branchHeads: { ...remote.branchHeads, [status.remoteBranch]: githubCommitSha } });
    } else {
      nextRemote = {
        ...remote,
        branchHeads: { ...remote.branchHeads, [status.remoteBranch]: branch.head },
        branchFiles: { ...remote.branchFiles, [status.remoteBranch]: headCommit.files },
      };
      await saveStoredGitRemote(nextRemote);
    }
    const pushedCommit: GitCommitRecord = nextHead === branch.head ? headCommit : {
      ...headCommit,
      id: nextHead,
      parentIds: status.remoteHead ? [status.remoteHead] : [],
    };
    updateGitState(state => ({
      ...state,
      branches: {
        ...state.branches,
        [branch.name]: { ...branch, head: nextHead, upstream: `${status.remoteName}/${status.remoteBranch}` },
      },
      commits: { ...state.commits, [nextHead]: pushedCommit },
      remotes: {
        ...state.remotes,
        [status.remoteName]: nextRemote,
      },
      lastFetchedAt: Date.now(),
    }));
    return { ok: true, lines: [`Pushed ${branch.name} to ${status.remoteName}/${status.remoteBranch}.`] };
  };

  const pullGitBranch = async (remoteName?: string, remoteBranch?: string) => {
    const fetchedState = await refreshGitRemotes(gitStateRef.current, remoteName);
    const branch = fetchedState.branches[fetchedState.currentBranch] || {
      name: fetchedState.currentBranch,
      head: null,
      upstream: `origin/${fetchedState.currentBranch}`,
    };
    const resolvedRemoteName = remoteName || (branch?.upstream?.split('/')[0] || 'origin');
    const resolvedRemoteBranch = remoteBranch || fetchedState.currentBranch;
    if ((remoteName || remoteBranch) && (!isValidGitRemoteName(resolvedRemoteName) || !fetchedState.remotes[resolvedRemoteName])) {
      return { ok: false, lines: [`fatal: '${resolvedRemoteName}' does not appear to be a git remote`] };
    }
    if ((remoteName || remoteBranch) && !isValidGitBranchName(resolvedRemoteBranch)) {
      return { ok: false, lines: [getInvalidGitBranchMessage(resolvedRemoteBranch)] };
    }
    const status = remoteName || remoteBranch
      ? getGitBranchSyncStatus({
          ...fetchedState,
          branches: {
            ...fetchedState.branches,
            [fetchedState.currentBranch]: {
              ...branch,
              upstream: `${resolvedRemoteName}/${resolvedRemoteBranch}`,
            },
          },
        })
      : getGitBranchSyncStatus(fetchedState);
    const remote = fetchedState.remotes[status.remoteName];
    if (!remote || !Object.prototype.hasOwnProperty.call(remote.branchHeads, status.remoteBranch)) {
      return { ok: false, lines: [`There is no tracking branch for ${fetchedState.currentBranch}.`] };
    }
    if (gitChanges.length > 0) return { ok: false, lines: ['error: Your local changes would be overwritten by pull. Commit them first.'] };
    const remoteHead = remote.branchHeads[status.remoteBranch] || null;
    const remoteFiles = remote.branchFiles[status.remoteBranch] || {};
    if (!remoteHead || status.localHead === remoteHead) return { ok: true, lines: ['Already up to date.'] };
    if (status.needsPush && !status.needsPull || status.diverged) {
      return { ok: false, lines: ['fatal: Not possible to fast-forward. Commit or push local work first.'] };
    }

    setFiles(current => createFsItemsFromSnapshot(remoteFiles, current));
    updateGitState(state => ({
      ...state,
      branches: {
        ...state.branches,
        [state.currentBranch]: {
          ...state.branches[state.currentBranch],
          head: remoteHead,
          upstream: `${status.remoteName}/${status.remoteBranch}`,
        },
      },
      stagedPaths: [],
    }));
    return { ok: true, lines: [`Fast-forwarded ${fetchedState.currentBranch} to ${remoteHead.slice(0, 7)}.`] };
  };

  const syncGitBranch = async () => {
    const status = getGitBranchSyncStatus(gitStateRef.current);
    if (status.needsPull || status.diverged) {
      const pulled = await pullGitBranch();
      if (!pulled.ok) return pulled;
    }
    return pushGitBranch();
  };

  const checkoutGitBranch = (branchName: string, create = false) => {
    const name = branchName.trim();
    if (!name) return { ok: false, lines: ['git checkout: branch name is required.'] };
    if (!isValidGitBranchName(name)) return { ok: false, lines: [getInvalidGitBranchMessage(name)] };
    if (gitChanges.length > 0) return { ok: false, lines: ['error: Your local changes would be overwritten by checkout. Commit them first.'] };

    const currentState = gitStateRef.current;
    const existing = currentState.branches[name];
    if (create && existing) return { ok: false, lines: [`fatal: a branch named '${name}' already exists`] };
    const currentBranch = currentState.branches[currentState.currentBranch];
    const remoteBranch = !existing && !create
      ? getGitRemoteBranchRefs(currentState)
          .filter(ref => ref.label === name || ref.branchName === name)
          .sort((left, right) => (left.remoteName === 'origin' ? -1 : 0) - (right.remoteName === 'origin' ? -1 : 0))[0] || null
      : null;
    if (!existing && !create && !remoteBranch) return { ok: false, lines: [`error: pathspec '${name}' did not match any branch`] };
    const nextName = remoteBranch ? remoteBranch.branchName : name;
    const nextBranch = existing || (remoteBranch ? {
      name: remoteBranch.branchName,
      head: remoteBranch.head,
      upstream: remoteBranch.label,
    } : {
      name,
      head: currentBranch?.head || null,
      upstream: `origin/${name}`,
    });
    const headFiles = nextBranch.head ? currentState.commits[nextBranch.head]?.files || {} : {};
    const remoteFiles = remoteBranch ? remoteBranch.files : headFiles;
    setFiles(current => createFsItemsFromSnapshot(remoteFiles, current));
    updateGitState(state => ({
      ...state,
      currentBranch: nextName,
      branches: {
        ...state.branches,
        [nextName]: nextBranch,
      },
      stagedPaths: [],
      commits: remoteBranch?.head && !state.commits[remoteBranch.head]
        ? {
            ...state.commits,
            [remoteBranch.head]: {
              id: remoteBranch.head,
              message: `Remote ${remoteBranch.label}`,
              author: 'GitHub <noreply@github.com>',
              timestamp: Date.now(),
              parentIds: [],
              files: remoteFiles,
            },
          }
        : state.commits,
    }));
    setSourceControlNewBranchName('');
    if (remoteBranch) return { ok: true, lines: [`Switched to a new branch '${nextName}' tracking '${remoteBranch.label}'.`] };
    return { ok: true, lines: [create && !existing ? `Switched to a new branch '${name}'` : `Switched to branch '${name}'`] };
  };

  const resetGitRepository = () => {
    const next = createDefaultGitState();
    gitStateMutationVersionRef.current += 1;
    gitStateRef.current = next;
    setGitState(next);
    setSourceControlCommitMessage('');
    setSourceControlStatus('');
    return next;
  };

  const handleSourceControlAction = async () => {
    try {
      const result = gitChanges.length > 0
        ? createGitCommit(sourceControlCommitMessage || 'Update workspace')
        : !gitRepositoryPublished
          ? await publishGitRepository()
          : gitSyncStatus.needsPublish
          ? await publishGitBranch()
          : await syncGitBranch();
      setSourceControlStatus(result.lines.join('\n'));
    } catch (error) {
      setSourceControlStatus(`GitHub error: ${error instanceof Error ? error.message : String(error)}`);
    }
  };

  const handleSourceControlFetch = async () => {
    try {
      await refreshGitRemotes();
      setSourceControlStatus(`Fetched remotes at ${new Date().toLocaleTimeString()}.`);
    } catch (error) {
      setSourceControlStatus(`Fetch failed: ${error instanceof Error ? error.message : String(error)}`);
    }
  };

  const handleSourceControlCreateBranch = () => {
    const result = checkoutGitBranch(sourceControlNewBranchName, true);
    setSourceControlStatus(result.lines.join('\n'));
  };

  const runSourceControlGitCommand = async (args: string[]) => {
    try {
      setSourceControlStatus((await executeGitCli(args)).join('\n'));
    } catch (error) {
      setSourceControlStatus(`Git failed: ${error instanceof Error ? error.message : String(error)}`);
    }
  };

  const promptSourceControlValue = (label: string, fallback = '') => {
    const value = window.prompt(label, fallback);
    return value === null ? null : value.trim();
  };

  const executeGitCli = async (args: string[]) => {
    const subCmd = (args[1] || '').toLowerCase();
    const state = gitStateRef.current;
    const branch = state.branches[state.currentBranch];
    const changes = getGitWorkspaceChanges(state, filesRef.current);
    const stagedPathSet = new Set(state.stagedPaths || []);
    const stagedChanges = changes.filter(change => stagedPathSet.has(change.path));
    const unstagedChanges = changes.filter(change => !stagedPathSet.has(change.path));

    if (!subCmd || subCmd === '--help' || subCmd === 'help') {
      return [
        'usage: git <command> [<args>]',
        'Commands: init, status, add, restore, reset, commit, log, show, branch, checkout, switch, merge, tag, stash, remote, fetch, pull, push, ls-remote, clean, diff, config, rev-parse, clone',
      ];
    }
    if (subCmd === '--version' || subCmd === 'version') return ['git version 2.45.0-codecraft'];
    if (subCmd === 'init') {
      resetGitRepository();
      return ['Initialized empty CodeCraft Git repository.'];
    }
    if (subCmd === 'status') {
      const syncStatus = getGitBranchSyncStatus(state);
      const lines = [`On branch ${state.currentBranch}`];
      if (!isGitRepositoryPublished(state)) lines.push('Your repository is not published.');
      else if (syncStatus.needsPublish) lines.push(`Your branch is not published to ${syncStatus.upstream}.`);
      if (syncStatus.needsPull) lines.push(`Your branch is behind '${syncStatus.upstream}'.`);
      if (syncStatus.needsPush) lines.push(`Your branch is ahead of '${syncStatus.upstream}'.`);
      if (syncStatus.diverged) lines.push(`Your branch and '${syncStatus.upstream}' have diverged.`);
      if (changes.length === 0) {
        lines.push('nothing to commit, working tree clean');
      } else {
        if (stagedChanges.length > 0) {
          lines.push('Changes to be committed:');
          lines.push(...stagedChanges.map(change => `  ${formatGitChangeKind(change.kind)} ${change.path}`));
        }
        if (unstagedChanges.length > 0) {
          lines.push('Changes not staged for commit:');
          lines.push(...unstagedChanges.map(change => `  ${formatGitChangeKind(change.kind)} ${change.path}`));
        }
      }
      return lines;
    }
    if (subCmd === 'add') {
      const pathspecs = args.slice(2).filter(arg => arg && !arg.startsWith('-'));
      const stageAll = args.includes('-A') || args.includes('--all') || pathspecs.includes('.');
      if (!stageAll && pathspecs.length === 0) return ['Nothing specified, nothing added.'];
      return stageGitPaths(stageAll ? [] : pathspecs).lines;
    }
    if (subCmd === 'restore') {
      const stagedOnly = args.includes('--staged');
      const pathspecs = args.slice(2).filter(arg => arg && !arg.startsWith('-'));
      return restoreGitPaths(pathspecs, stagedOnly).lines;
    }
    if (subCmd === 'reset') {
      const revision = args.slice(2).find(arg => arg && !arg.startsWith('-')) || 'HEAD';
      if (args.includes('--hard')) return resetGitToRevision(revision, 'hard').lines;
      if (args.includes('--soft')) return resetGitToRevision(revision, 'soft').lines;
      if (args.includes('--mixed')) return resetGitToRevision(revision, 'mixed').lines;
      const pathspecs = args.slice(2).filter(arg => arg && !arg.startsWith('-'));
      if (pathspecs.length > 0) return unstageGitPaths(pathspecs).lines;
      return resetGitToRevision('HEAD', 'mixed').lines;
    }
    if (subCmd === 'commit') {
      const messageIndex = args.findIndex(arg => arg === '-m' || arg === '--message');
      if (messageIndex < 0) return ['usage: git commit -m <message>'];
      const message = args[messageIndex + 1] || '';
      if (stagedChanges.length === 0) return ['no changes added to commit'];
      return createGitCommit(message, state.stagedPaths || []).lines;
    }
    if (subCmd === 'log') {
      const lines: string[] = [];
      let head = branch?.head || null;
      const seen = new Set<string>();
      while (head && !seen.has(head)) {
        const commit = state.commits[head];
        if (!commit) break;
        seen.add(head);
        lines.push(`commit ${commit.id}`);
        lines.push(`Author: ${commit.author}`);
        lines.push(`Date:   ${formatGitTimestamp(commit.timestamp)}`);
        lines.push('');
        lines.push(`    ${commit.message}`);
        lines.push('');
        head = commit.parentIds[0] || null;
      }
      return lines.length ? lines : ['fatal: your current branch does not have any commits yet'];
    }
    if (subCmd === 'show') {
      const revision = args[2] || 'HEAD';
      const commit = getGitRevisionCommit(state, revision);
      if (!commit) return [`fatal: bad revision '${revision}'`];
      return [
        ...formatGitCommitDetails(commit),
        '',
        ...diffGitSnapshots(commit.parentIds[0] ? state.commits[commit.parentIds[0]]?.files || {} : {}, commit.files)
          .flatMap(change => [`${formatGitChangeKind(change.kind)}\t${change.path}`]),
      ];
    }
    if (subCmd === 'branch') {
      const upstreamIndex = args.findIndex(arg => arg === '--set-upstream-to' || arg.startsWith('--set-upstream-to='));
      if (upstreamIndex >= 0) {
        const upstream = args[upstreamIndex].includes('=') ? args[upstreamIndex].slice(args[upstreamIndex].indexOf('=') + 1) : args[upstreamIndex + 1] || '';
        const branchName = args.find((arg, index) => index > upstreamIndex + (args[upstreamIndex].includes('=') ? 0 : 1) && !arg.startsWith('-')) || state.currentBranch;
        const slashIndex = upstream.indexOf('/');
        const remoteName = slashIndex >= 0 ? upstream.slice(0, slashIndex) : '';
        const remoteBranch = slashIndex >= 0 ? upstream.slice(slashIndex + 1) : '';
        if (!state.branches[branchName]) return [`fatal: branch '${branchName}' does not exist`];
        if (!remoteName || !state.remotes[remoteName] || !Object.prototype.hasOwnProperty.call(state.remotes[remoteName].branchHeads, remoteBranch)) {
          return [`fatal: the requested upstream branch '${upstream}' does not exist`];
        }
        updateGitState(current => ({
          ...current,
          branches: {
            ...current.branches,
            [branchName]: { ...current.branches[branchName], upstream },
          },
        }));
        return [`branch '${branchName}' set up to track '${upstream}'.`];
      }
      const renameIndex = args.findIndex(arg => arg === '-m' || arg === '-M');
      if (renameIndex >= 0) {
        const oldName = args[renameIndex + 2] ? args[renameIndex + 1] : state.currentBranch;
        const newName = args[renameIndex + 2] || args[renameIndex + 1];
        if (!newName || !isValidGitBranchName(newName)) return [getInvalidGitBranchMessage(newName || '')];
        if (!state.branches[oldName]) return [`fatal: branch '${oldName}' does not exist`];
        if (state.branches[newName] && args[renameIndex] !== '-M') return [`fatal: a branch named '${newName}' already exists`];
        updateGitState(current => {
          const branches = { ...current.branches };
          branches[newName] = { ...branches[oldName], name: newName };
          delete branches[oldName];
          return { ...current, currentBranch: current.currentBranch === oldName ? newName : current.currentBranch, branches };
        });
        return [`Renamed branch ${oldName} to ${newName}.`];
      }
      const deleteIndex = args.findIndex(arg => arg === '-d' || arg === '-D');
      if (deleteIndex >= 0) {
        const name = args[deleteIndex + 1];
        if (!name || !state.branches[name]) return [`error: branch '${name || ''}' not found`];
        if (name === state.currentBranch) return [`error: Cannot delete branch '${name}' checked out at CodeCraft workspace`];
        updateGitState(current => {
          const nextBranches = { ...current.branches };
          delete nextBranches[name];
          return { ...current, branches: nextBranches };
        });
        return [`Deleted branch ${name}.`];
      }
      const listRemote = args.includes('-r') || args.includes('--remotes');
      const listAll = args.includes('-a') || args.includes('--all');
      if (listRemote || listAll) {
        const localLines = listAll ? Object.keys(state.branches).sort().map(name => `${name === state.currentBranch ? '*' : ' '} ${name}`) : [];
        const remoteLines = getGitRemoteBranchRefs(state).map(ref => `  remotes/${ref.label}`);
        return [...localLines, ...remoteLines].length ? [...localLines, ...remoteLines] : [];
      }
      const createName = args[2];
      if (createName) {
        if (!isValidGitBranchName(createName)) return [getInvalidGitBranchMessage(createName)];
        if (state.branches[createName]) return [`fatal: a branch named '${createName}' already exists`];
        updateGitState(current => ({
          ...current,
          branches: {
            ...current.branches,
            [createName]: {
              name: createName,
              head: current.branches[current.currentBranch]?.head || null,
              upstream: `origin/${createName}`,
            },
          },
        }));
        return [`Created branch ${createName}.`];
      }
      return Object.keys(state.branches).sort().map(name => `${name === state.currentBranch ? '*' : ' '} ${name}`);
    }
    if (subCmd === 'checkout') {
      if (args[2] === '--') return restoreGitPaths(args.slice(3)).lines;
      if (args[2] === '-b') return checkoutGitBranch(args[3] || '', true).lines;
      return checkoutGitBranch(args[2] || '', false).lines;
    }
    if (subCmd === 'switch') {
      const create = args.includes('-c') || args.includes('--create');
      const name = create ? args[args.findIndex(arg => arg === '-c' || arg === '--create') + 1] : args[2];
      return checkoutGitBranch(name || '', create).lines;
    }
    if (subCmd === 'remote') {
      const remoteSub = (args[2] || '').toLowerCase();
      if (!remoteSub || remoteSub === '-v') {
        const remotes = Object.values(state.remotes);
        return remotes.length ? remotes.flatMap(remote => [`${remote.name}\t${remote.url} (fetch)`, `${remote.name}\t${remote.url} (push)`]) : [];
      }
      if (remoteSub === 'add') {
        const name = args[3];
        const url = args[4];
        if (!name || !url) return ['usage: git remote add <name> <url>'];
        if (!isValidGitRemoteName(name)) return [`fatal: '${name}' is not a valid remote name`];
        if (state.remotes[name]) return [`error: remote ${name} already exists.`];
        if (!isSupportedGitRemoteUrl(url)) return [`fatal: '${url}' is not a supported Git remote URL. ${getSupportedGitRemoteUrlHelp()}`];
        const storedRemote = await loadStoredGitRemote({ name, url, branchHeads: {}, branchFiles: {} });
        updateGitState(current => ({
          ...current,
          remotes: {
            ...current.remotes,
            [name]: storedRemote,
          },
        }));
        return [`Added remote ${name} -> ${url}`];
      }
      if (remoteSub === 'remove' || remoteSub === 'rm') {
        const name = args[3];
        if (!name || !state.remotes[name]) return [`error: No such remote: '${name || ''}'`];
        updateGitState(current => {
          const remotes = { ...current.remotes };
          delete remotes[name];
          return { ...current, remotes };
        });
        return [`Removed remote ${name}.`];
      }
      if (remoteSub === 'rename') {
        const oldName = args[3];
        const newName = args[4];
        if (!oldName || !newName) return ['usage: git remote rename <old> <new>'];
        if (!state.remotes[oldName]) return [`error: No such remote: '${oldName}'`];
        if (!isValidGitRemoteName(newName)) return [`fatal: '${newName}' is not a valid remote name`];
        if (state.remotes[newName]) return [`error: remote ${newName} already exists.`];
        updateGitState(current => {
          const remotes = { ...current.remotes };
          remotes[newName] = { ...remotes[oldName], name: newName };
          delete remotes[oldName];
          const branches = Object.fromEntries(Object.entries(current.branches).map(([name, branch]) => [
            name,
            branch.upstream?.startsWith(`${oldName}/`) ? { ...branch, upstream: `${newName}/${branch.upstream.slice(oldName.length + 1)}` } : branch,
          ]));
          return { ...current, remotes, branches };
        });
        return [`Renamed remote ${oldName} to ${newName}.`];
      }
      if (remoteSub === 'set-url') {
        const name = args[3];
        const url = args[4];
        if (!name || !url || !state.remotes[name]) return ['usage: git remote set-url <name> <url>'];
        if (!isSupportedGitRemoteUrl(url)) return [`fatal: '${url}' is not a supported Git remote URL. ${getSupportedGitRemoteUrlHelp()}`];
        const storedRemote = await loadStoredGitRemote({ ...state.remotes[name], url });
        updateGitState(current => ({
          ...current,
          remotes: {
            ...current.remotes,
            [name]: storedRemote,
          },
        }));
        return [`Updated remote ${name} -> ${url}`];
      }
      return ['usage: git remote [-v] | git remote add <name> <url> | git remote remove <name> | git remote rename <old> <new> | git remote set-url <name> <url>'];
    }
    if (subCmd === 'fetch') {
      const remoteName = args[2];
      if (remoteName && !isValidGitRemoteName(remoteName)) return [`fatal: '${remoteName}' does not appear to be a git remote`];
      await refreshGitRemotes(state, remoteName);
      return [remoteName ? `Fetched ${remoteName}.` : 'Fetch complete.'];
    }
    if (subCmd === 'pull') return (await pullGitBranch(args[2], args[3])).lines;
    if (subCmd === 'push') return (await pushGitBranch(args[2], args[3])).lines;
    if (subCmd === 'ls-remote') {
      const remoteName = args[2] || 'origin';
      if (!state.remotes[remoteName]) return [`fatal: '${remoteName}' does not appear to be a git remote`];
      const fetchedState = await refreshGitRemotes(state, remoteName);
      const remote = fetchedState.remotes[remoteName];
      return Object.entries(remote.branchHeads).flatMap(([name, sha]) => sha ? [`${sha}\trefs/heads/${name}`] : []);
    }
    if (subCmd === 'clean') {
      if (!args.includes('-f') && !args.includes('--force')) return ['fatal: clean.requireForce defaults to true and neither -f nor -i given'];
      return cleanGitWorkspace().lines;
    }
    if (subCmd === 'stash') {
      const stashSub = (args[2] || 'push').toLowerCase();
      if (stashSub === 'push' || stashSub === 'save') return createGitStash(getCliOptionValue(args, ['-m', '--message']) || args.slice(3).filter(arg => !arg.startsWith('-')).join(' ')).lines;
      if (stashSub === 'list') return state.stashes.length ? state.stashes.map((stash, index) => `stash@{${index}}: ${stash.message}`) : [];
      if (stashSub === 'apply') return applyGitStash(Number((args[3] || 'stash@{0}').match(/\d+/)?.[0] || 0), false).lines;
      if (stashSub === 'pop') return applyGitStash(Number((args[3] || 'stash@{0}').match(/\d+/)?.[0] || 0), true).lines;
      if (stashSub === 'drop') {
        const index = Number((args[3] || 'stash@{0}').match(/\d+/)?.[0] || 0);
        if (!state.stashes[index]) return [`fatal: stash@{${index}} does not exist`];
        updateGitState(current => ({ ...current, stashes: current.stashes.filter((_, stashIndex) => stashIndex !== index) }));
        return [`Dropped stash@{${index}}.`];
      }
      return ['usage: git stash push|list|apply|pop|drop'];
    }
    if (subCmd === 'tag') {
      const deleteIndex = args.findIndex(arg => arg === '-d' || arg === '--delete');
      if (deleteIndex >= 0) {
        const name = args[deleteIndex + 1];
        if (!name || !state.tags[name]) return [`error: tag '${name || ''}' not found.`];
        updateGitState(current => {
          const tags = { ...current.tags };
          delete tags[name];
          return { ...current, tags };
        });
        return [`Deleted tag '${name}'.`];
      }
      const tagArgs: string[] = [];
      for (let index = 2; index < args.length; index += 1) {
        const arg = args[index];
        if (arg === '-m' || arg === '--message') {
          index += 1;
          continue;
        }
        if (arg.startsWith('-')) continue;
        tagArgs.push(arg);
      }
      const tagName = tagArgs[0];
      if (!tagName) return Object.keys(state.tags).sort();
      if (!isValidGitBranchName(tagName)) return [`fatal: '${tagName}' is not a valid tag name`];
      if (state.tags[tagName]) return [`fatal: tag '${tagName}' already exists`];
      const targetRevision = tagArgs[1] || 'HEAD';
      const target = resolveGitRevision(state, targetRevision);
      if (!target) return [`fatal: Failed to resolve '${targetRevision}' as a valid ref.`];
      updateGitState(current => ({
        ...current,
        tags: {
          ...current.tags,
          [tagName]: {
            name: tagName,
            target,
            message: getCliOptionValue(args, ['-m', '--message']) || undefined,
            timestamp: Date.now(),
          },
        },
      }));
      return [`Created tag ${tagName} at ${target.slice(0, 7)}.`];
    }
    if (subCmd === 'merge') {
      const revision = args.slice(2).find(arg => !arg.startsWith('-'));
      if (!revision) return ['usage: git merge <branch|commit|tag>'];
      return mergeGitRevision(revision).lines;
    }
    if (subCmd === 'diff') {
      if (changes.length === 0) return [];
      return changes.flatMap(change => {
        const lines = [`diff --git a/${change.path} b/${change.path}`, `${formatGitChangeKind(change.kind)} ${change.path}`];
        if (change.kind !== 'added') lines.push(`--- a/${change.path}`);
        if (change.kind !== 'deleted') lines.push(`+++ b/${change.path}`);
        if (change.before !== undefined) lines.push(...change.before.split('\n').slice(0, 40).map(line => `-${line}`));
        if (change.after !== undefined) lines.push(...change.after.split('\n').slice(0, 40).map(line => `+${line}`));
        return lines;
      });
    }
    if (subCmd === 'config') {
      if (args[2] === '--list') return Object.entries(state.config).map(([key, value]) => `${key}=${value}`);
      const key = args[2];
      const value = args[3];
      if (!key) return ['usage: git config [--list] <key> [value]'];
      if (value === undefined) return [state.config[key] || ''];
      updateGitState(current => ({ ...current, config: { ...current.config, [key]: value } }));
      return [];
    }
    if (subCmd === 'rev-parse') {
      if (args[2] === '--abbrev-ref' && args[3] === 'HEAD') return [state.currentBranch];
      if (args[2] === 'HEAD') return [branch?.head || ''];
      return ['.'];
    }
    if (subCmd === 'clone') {
      const url = args.slice(2).find(arg => !arg.startsWith('-'));
      if (!url) return ['usage: git clone <url>'];
      if (!isSupportedGitRemoteUrl(url)) return [`fatal: repository '${url}' is not a supported Git remote URL. ${getSupportedGitRemoteUrlHelp()}`];
      if (!args.includes('--force') && Object.keys(serializeWorkspaceSnapshot(filesRef.current)).length > 0) {
        return ['fatal: destination path current CodeCraft workspace already exists and is not an empty directory. Use git clone <url> --force to replace it.'];
      }
      const remote = await loadRemoteForGit({ name: 'origin', url, branchHeads: {}, branchFiles: {} });
      const branchNames = Object.keys(remote.branchHeads);
      const cloneBranchName = branchNames.includes(DEFAULT_GIT_BRANCH) ? DEFAULT_GIT_BRANCH : branchNames[0] || DEFAULT_GIT_BRANCH;
      const head = remote.branchHeads[cloneBranchName] || null;
      const commits = head ? {
        [head]: {
          id: head,
          message: `Remote origin/${cloneBranchName}`,
          author: 'GitHub <noreply@github.com>',
          timestamp: Date.now(),
          parentIds: [],
          files: remote.branchFiles[cloneBranchName] || {},
        },
      } : {};
      setFiles(current => createFsItemsFromSnapshot(remote.branchFiles[cloneBranchName] || {}, current));
      updateGitState(current => ({
        ...current,
        currentBranch: cloneBranchName,
        branches: {
          [cloneBranchName]: { name: cloneBranchName, head, upstream: `origin/${cloneBranchName}` },
        },
        commits,
        remotes: { origin: remote },
        lastFetchedAt: Date.now(),
        stagedPaths: [],
      }));
      return [`Cloned ${url} into current CodeCraft workspace.`];
    }
    return [`git: '${subCmd}' is not implemented in CodeCraft Git yet.`];
  };

  const executeGhCli = async (args: string[]) => {
    const area = (args[1] || '').toLowerCase();
    const subCmd = (args[2] || '').toLowerCase();
    const state = gitStateRef.current;

    if (!area || area === '--help' || area === 'help') {
      return [
        'GitHub CLI for CodeCraft',
        'Commands: gh auth login|status|logout, gh repo view|create|clone, gh pr list|create, gh issue list|create',
      ];
    }
    if (area === '--version' || area === 'version') return ['gh version 2.63.0-codecraft'];
    if (area === 'auth') {
      if (subCmd === 'login') {
        const tokenIndex = args.findIndex(arg => arg === '--with-token' || arg === '--token');
        const token = tokenIndex >= 0 ? args[tokenIndex + 1] || '' : window.prompt('GitHub token for CodeCraft gh auth') || '';
        if (!token.trim()) return ['gh auth login: token is required.'];
        const userIndex = args.findIndex(arg => arg === '--user');
        const viewer = await githubApiRequest('/user', {}, token.trim());
        const user = userIndex >= 0 ? args[userIndex + 1] || viewer?.login || 'github-user' : viewer?.login || 'github-user';
        updateGitState(current => ({
          ...current,
          ghAuth: {
            token: token.trim(),
            user,
            scopes: ['repo', 'workflow', 'read:org'],
            loggedInAt: Date.now(),
          },
        }));
        return [`Logged in to github.com as ${user}.`];
      }
      if (subCmd === 'status') {
        return state.ghAuth
          ? [`github.com`, `  Logged in to github.com account ${state.ghAuth.user}`, `  Token scopes: ${state.ghAuth.scopes.join(', ')}`]
          : ['You are not logged into any GitHub hosts. Run gh auth login.'];
      }
      if (subCmd === 'logout') {
        updateGitState(current => ({ ...current, ghAuth: null }));
        return ['Logged out of github.com.'];
      }
      return ['usage: gh auth login|status|logout'];
    }
    if (!state.ghAuth) return ['gh: authentication required. Run gh auth login first.'];
    if (area === 'repo') {
      if (subCmd === 'view') {
        const repoRef = args[3] ? parseGitHubRepositoryArg(args[3]) : getCurrentGitHubRepositoryRef();
        if (!repoRef) return ['usage: gh repo view [owner/repo]'];
        const repo = await githubApiRequest(`/repos/${encodeURIComponent(repoRef.owner)}/${encodeURIComponent(repoRef.repo)}`);
        return [
          `name:\t${repo?.full_name || `${repoRef.owner}/${repoRef.repo}`}`,
          `owner:\t${repo?.owner?.login || repoRef.owner}`,
          `visibility:\t${repo?.private ? 'private' : 'public'}`,
          `default branch:\t${repo?.default_branch || DEFAULT_GIT_BRANCH}`,
          `url:\t${repo?.html_url || `https://github.com/${repoRef.owner}/${repoRef.repo}`}`,
        ];
      }
      if (subCmd === 'create') {
        const rawName = args[3] || `${activeProject.name.replace(/\s+/g, '-').toLowerCase()}-repo`;
        const parsed = rawName.includes('/') ? parseGitHubRepositoryArg(rawName) : null;
        const owner = parsed?.owner || state.ghAuth.user;
        const name = parsed?.repo || rawName;
        if (!isValidGitHubRepositoryPart(owner) || !isValidGitHubRepositoryPart(name)) return ['usage: gh repo create [owner/]name'];
        const url = `github:${owner}/${name}`;
        try {
          await githubApiRequest(owner === state.ghAuth.user ? '/user/repos' : `/orgs/${encodeURIComponent(owner)}/repos`, {
            method: 'POST',
            body: JSON.stringify({
              name,
              private: true,
              auto_init: false,
            }),
          });
        } catch (error) {
          const message = error instanceof Error ? error.message : String(error);
          if (!/name already exists|already exists/i.test(message)) throw error;
        }
        const originRemote = await loadStoredGitRemote({ name: 'origin', url, branchHeads: {}, branchFiles: {} });
        updateGitState(current => ({
          ...current,
          remotes: {
            ...current.remotes,
            origin: originRemote,
          },
          branches: {
            ...current.branches,
            [current.currentBranch]: {
              ...current.branches[current.currentBranch],
              upstream: `origin/${current.currentBranch}`,
            },
          },
        }));
        return [`Created repository ${owner}/${name}`, `Added remote origin -> ${url}`];
      }
      if (subCmd === 'clone') {
        const repo = args[3];
        if (!repo) return ['usage: gh repo clone <owner/name>'];
        const repoRef = parseGitHubRepositoryArg(repo);
        if (!repoRef) return ['usage: gh repo clone <owner/name>'];
        return executeGitCli(['git', 'clone', `github:${repoRef.owner}/${repoRef.repo}`, ...args.slice(4)]);
      }
      return ['usage: gh repo view|create|clone'];
    }
    if (area === 'pr') {
      if (subCmd === 'list') {
        const repoRef = getCurrentGitHubRepositoryRef();
        const stateValue = getCliOptionValue(args, ['--state']) || 'open';
        const pulls = await githubApiRequest(`/repos/${encodeURIComponent(repoRef.owner)}/${encodeURIComponent(repoRef.repo)}/pulls?state=${encodeURIComponent(stateValue)}`);
        if (!Array.isArray(pulls) || pulls.length === 0) return ['No pull requests found.'];
        return pulls.map((pull: any) => `#${pull.number}\t${pull.title}\t${pull.head?.ref || ''} -> ${pull.base?.ref || ''}\t${pull.html_url || ''}`);
      }
      if (subCmd === 'create') {
        const repoRef = getCurrentGitHubRepositoryRef();
        const title = getCliOptionValue(args, ['--title', '-t']);
        const body = getCliOptionValue(args, ['--body', '-b']);
        const base = getCliOptionValue(args, ['--base', '-B']) || DEFAULT_GIT_BRANCH;
        const head = getCliOptionValue(args, ['--head', '-H']) || state.currentBranch;
        if (!title.trim()) return ['usage: gh pr create --title <title> [--body <body>] [--base <branch>] [--head <branch>]'];
        if (!isValidGitBranchName(base) || !isValidGitBranchName(head)) return ['gh pr create: invalid base or head branch name'];
        const pull = await githubApiRequest(`/repos/${encodeURIComponent(repoRef.owner)}/${encodeURIComponent(repoRef.repo)}/pulls`, {
          method: 'POST',
          body: JSON.stringify({ title, body, base, head }),
        });
        return [`Created pull request #${pull?.number || ''}: ${pull?.title || title}`, `URL: ${pull?.html_url || ''}`];
      }
      return ['usage: gh pr list|create'];
    }
    if (area === 'issue') {
      if (subCmd === 'list') {
        const repoRef = getCurrentGitHubRepositoryRef();
        const stateValue = getCliOptionValue(args, ['--state']) || 'open';
        const issues = await githubApiRequest(`/repos/${encodeURIComponent(repoRef.owner)}/${encodeURIComponent(repoRef.repo)}/issues?state=${encodeURIComponent(stateValue)}`);
        const plainIssues = Array.isArray(issues) ? issues.filter((issue: any) => !issue.pull_request) : [];
        if (plainIssues.length === 0) return ['No issues found.'];
        return plainIssues.map((issue: any) => `#${issue.number}\t${issue.title}\t${issue.html_url || ''}`);
      }
      if (subCmd === 'create') {
        const repoRef = getCurrentGitHubRepositoryRef();
        const title = getCliOptionValue(args, ['--title', '-t']);
        const body = getCliOptionValue(args, ['--body', '-b']);
        if (!title.trim()) return ['usage: gh issue create --title <title> [--body <body>]'];
        const issue = await githubApiRequest(`/repos/${encodeURIComponent(repoRef.owner)}/${encodeURIComponent(repoRef.repo)}/issues`, {
          method: 'POST',
          body: JSON.stringify({ title, body }),
        });
        return [`Created issue #${issue?.number || ''}: ${issue?.title || title}`, `URL: ${issue?.html_url || ''}`];
      }
      return ['usage: gh issue list|create'];
    }
    return [`gh: '${area}' is not implemented in CodeCraft gh yet.`];
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

  const cloneItemIntoParent = (id: string, targetParentId: string | null) => {
    const currentFiles = filesRef.current;
    const source = currentFiles.find(item => item.id === id);
    if (!source) return null;

    const nextFiles = currentFiles.map(item => ({ ...item }));
    const getPastedName = (name: string, type: FSItem['type'], parentId: string | null) => {
      const siblingNames = new Set(nextFiles.filter(item => item.parentId === parentId).map(item => item.name));
      if (!siblingNames.has(name)) return name;

      const dotIndex = type === 'file' ? name.lastIndexOf('.') : -1;
      const hasExtension = dotIndex > 0;
      const baseName = hasExtension ? name.slice(0, dotIndex) : name;
      const extension = hasExtension ? name.slice(dotIndex) : '';
      const candidateBase = `${baseName} copy`;
      let candidate = `${candidateBase}${extension}`;
      let index = 2;

      while (siblingNames.has(candidate)) {
        candidate = `${candidateBase} ${index}${extension}`;
        index += 1;
      }

      return candidate;
    };

    const cloneRecursively = (item: FSItem, parentId: string | null, isRootClone: boolean): FSItem => {
      const clone: FSItem = {
        ...item,
        id: createFsItemId(),
        parentId,
        name: isRootClone ? getPastedName(item.name, item.type, parentId) : item.name,
      };
      nextFiles.push(clone);

      if (item.type === 'folder') {
        currentFiles
          .filter(child => child.parentId === item.id)
          .forEach(child => cloneRecursively(child, clone.id, false));
      }

      return clone;
    };

    if (targetParentId) {
      const targetFolder = nextFiles.find(item => item.id === targetParentId && item.type === 'folder');
      if (!targetFolder) return null;
      targetFolder.isOpen = true;
    }

    const clone = cloneRecursively(source, targetParentId, true);
    setFiles(nextFiles);
    openEditorTabWithItem(clone);
    return clone;
  };

  const duplicateItem = (id: string) => {
    const source = filesRef.current.find(item => item.id === id);
    if (!source) return;
    cloneItemIntoParent(id, source.parentId);
  };

  const pasteFileTreeClipboardItem = (targetParentId: string | null) => {
    if (!fileTreeClipboardItemId) return;
    cloneItemIntoParent(fileTreeClipboardItemId, targetParentId);
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
    } else if (cmd === 'git') {
      try {
        setTerminalOutput([...newOutput, ...await executeGitCli(args)]);
      } catch (error) {
        setTerminalOutput([...newOutput, `git: ${error instanceof Error ? error.message : String(error)}`]);
      }
    } else if (cmd === 'gh') {
      try {
        setTerminalOutput([...newOutput, ...await executeGhCli(args)]);
      } catch (error) {
        setTerminalOutput([...newOutput, `gh: ${error instanceof Error ? error.message : String(error)}`]);
      }
    } else if (cmd === 'docs') {
      const subCmd = (args[1] || '').toLowerCase();
      if (subCmd === 'find') {
        setTerminalOutput([...newOutput, `Finding documentation matches with ${getAssistantProviderLabel(settings.assistantProvider)} · ${effectiveAutoDocumentationModel || 'no model'}...`]);
        try {
          const lines = await executeDocsFindCommand(args.slice(2));
          setTerminalOutput(prev => [...prev, ...lines]);
        } catch (error) {
          setTerminalOutput(prev => [...prev, `docs find error: ${error instanceof Error ? error.message : String(error)}`]);
        }
      } else if (subCmd === 'get') {
        try {
          setTerminalOutput([...newOutput, ...await executeDocsGetCommand(args.slice(2))]);
        } catch (error) {
          setTerminalOutput([...newOutput, `docs get error: ${error instanceof Error ? error.message : String(error)}`]);
        }
      } else {
        setTerminalOutput([...newOutput, DOCS_FIND_USAGE, DOCS_GET_USAGE]);
      }
    } else if (cmd === 'codin') {
      const subCmd = (args[1] || '').toLowerCase();
      if (subCmd === 'get') {
        try {
          setTerminalOutput([...newOutput, ...executeCodinGetCommand(args.slice(2))]);
        } catch (error) {
          setTerminalOutput([...newOutput, `codin get error: ${error instanceof Error ? error.message : String(error)}`]);
        }
      } else {
        setTerminalOutput([...newOutput, CODIN_GET_USAGE]);
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
    } else if (cmd === 'npm' || cmd === 'js' || cmd === 'javascript') {
      const subCmd = (args[1] || '').toLowerCase();
      const moduleName = args[2];

      if (subCmd === 'install' || subCmd === 'i') {
        const packageSpecs = getNpmPackageArgs(args.slice(2));
        if (packageSpecs.length === 0) {
          setTerminalOutput([...newOutput, 'Usage: npm install <package...>']);
        } else {
          setTerminalOutput([...newOutput, `Installing ${formatNpmPackageListForStatus(packageSpecs)} from npm registry...`]);
          try {
            let npmInstallProgressDetailCount = 0;
            let npmInstallSuppressedProgressCount = 0;
            const result = await installNpmPackagesFromRegistry(packageSpecs, msg => {
              const installedMatch = msg.match(/^Installed .* \((\d+) installed,/);
              const installedCount = installedMatch ? Number(installedMatch[1]) : 0;
              const fetchMatch = msg.match(/\((\d+) resolved,/);
              const resolvedCount = fetchMatch ? Number(fetchMatch[1]) : 0;
              const shouldShowDetail = (
                npmInstallProgressDetailCount < NPM_INSTALL_PROGRESS_DETAIL_LIMIT
                || installedCount > 0 && installedCount % 25 === 0
                || resolvedCount > 0 && resolvedCount % 50 === 0
                || /complete|error|failed/i.test(msg)
              );
              if (shouldShowDetail) {
                npmInstallProgressDetailCount += 1;
                const suppressedLine = npmInstallSuppressedProgressCount > 0
                  ? [`... ${npmInstallSuppressedProgressCount} npm install progress update${npmInstallSuppressedProgressCount === 1 ? '' : 's'} suppressed ...`]
                  : [];
                npmInstallSuppressedProgressCount = 0;
                setTerminalOutput(prev => [...prev, ...suppressedLine, msg]);
              } else {
                npmInstallSuppressedProgressCount += 1;
              }
            });
            refreshCodeCraftTypeScriptExtraLibs();
            setSettingsNpmInstalledPackages(loadSavedNpmInstalledPackages());
            setTerminalOutput(prev => [
              ...prev,
              ...(npmInstallSuppressedProgressCount > 0
                ? [`... ${npmInstallSuppressedProgressCount} npm install progress update${npmInstallSuppressedProgressCount === 1 ? '' : 's'} suppressed ...`]
                : []),
              `npm install complete: ${result.installed.length} package${result.installed.length === 1 ? '' : 's'} installed.`,
              ...result.skipped.map(note => `Note: skipped ${note}`)
            ]);
          } catch (err) {
            setTerminalOutput(prev => [...prev, `npm install error: ${err instanceof Error ? err.message : String(err)}`]);
          }
        }
      } else if (subCmd === 'include' && moduleName) {
        const url = args[3];
        if (!isValidJavaScriptModuleName(moduleName)) {
          setTerminalOutput([...newOutput, `npm include: invalid module specifier '${moduleName}'`]);
        } else {
          setTerminalOutput([
            ...newOutput,
            url
              ? `Including JavaScript module '${moduleName}' from custom URL...`
              : `Resolving JavaScript module '${moduleName}' through CDN providers...`
          ]);
          const moduleInfo = await includeJavaScriptModuleFromProviders(moduleName, url, msg => {
            setTerminalOutput(prev => [...prev, msg]);
          });
          refreshCodeCraftTypeScriptExtraLibs();
          setSettingsJavaScriptIncludedModules(loadSavedJavaScriptIncludedModules());
          setTerminalOutput(prev => [
            ...prev,
            moduleInfo
              ? `Included JavaScript module '${moduleInfo.name}' from ${moduleInfo.provider} -> ${moduleInfo.url}`
              : `npm include: could not include '${moduleName}'. No provider produced an available module URL.`,
            ...(moduleInfo
              ? ['Project Run will resolve this module through the import map. The editor will treat it as an available module.']
              : [])
          ]);
        }
      } else if (subCmd === 'uninstall' && moduleName) {
        const packageSpecs = getNpmPackageArgs(args.slice(2));
        const removedPackages: SavedNpmInstalledPackage[] = [];
        for (const packageSpec of packageSpecs) {
          const removed = removeSavedNpmInstalledPackage(packageSpec);
          if (removed) {
            removedPackages.push(removed);
            try {
              await deleteStoredNpmPackage(removed.name, removed.version);
            } catch { }
          }
        }
        refreshCodeCraftTypeScriptExtraLibs();
        setSettingsNpmInstalledPackages(loadSavedNpmInstalledPackages());
        setTerminalOutput([
          ...newOutput,
          removedPackages.length > 0
            ? `Uninstalled npm package${removedPackages.length === 1 ? '' : 's'}: ${removedPackages.map(packageInfo => `${packageInfo.name}@${packageInfo.version}`).join(', ')}.`
            : `No saved npm package matched ${packageSpecs.join(', ') || moduleName}.`
        ]);
      } else if (subCmd === 'remove' && moduleName) {
        const removed = removeSavedJavaScriptIncludedModule(moduleName);
        refreshCodeCraftTypeScriptExtraLibs();
        setSettingsJavaScriptIncludedModules(loadSavedJavaScriptIncludedModules());
        setTerminalOutput([
          ...newOutput,
          removed
            ? `Removed JavaScript module '${moduleName}'.`
            : `No saved JavaScript module named '${moduleName}'.`
        ]);
      } else if (subCmd === 'list') {
        const packages = loadSavedNpmInstalledPackages();
        const modules = loadSavedJavaScriptIncludedModules();
        setTerminalOutput([
          ...newOutput,
          packages.length === 0 ? 'No npm packages installed.' : `Installed npm packages (${packages.length}):`,
          ...packages.map(packageInfo => `  ${packageInfo.name}@${packageInfo.version} (${packageInfo.fileCount} files, entry ${packageInfo.entry})`),
          modules.length === 0 ? 'No npm include modules saved.' : `Included JavaScript modules (${modules.length}):`,
          ...modules.map(moduleInfo => `  ${moduleInfo.name} -> ${moduleInfo.url}`)
        ]);
      } else {
        setTerminalOutput([...newOutput, 'Usage: npm install <package...> | npm uninstall <package...> | npm include <module> [url] | npm remove <module> | npm list']);
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
          if (result.success) {
            try {
              const { BrowserCSharp } = await getBrowserCSharpModule();
              await ensureCSharpRuntime();
              const runtimeResults = await includeCSharpRuntimeNamespaces(BrowserCSharp, [namespaceName]);
              const runtimeResult = runtimeResults[0];
              if (runtimeResult?.message) {
                lines.push(runtimeResult.message);
              }
              if (runtimeResult?.addedAssemblies && runtimeResult.addedAssemblies.length > 0) {
                lines.push(`Added runtime references: ${runtimeResult.addedAssemblies.join(', ')}`);
              }
            } catch (err) {
              lines.push(`Runtime include error: ${err instanceof Error ? err.message : String(err)}`);
            }
          }
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
      setTerminalOutput([...newOutput, 'Standard commands: ls, pwd, cd, mkdir, touch, open, cat, rm, clear, help, date, echo', 'Documentation: docs find [--types N] [--members N] [--hide-reason] [--hide-docs] <description>', 'Documentation: docs get <item-name>', 'Code navigation: codin get <CSharpSymbolPath> (C#)', 'Source control: git status|add|restore|reset|commit|log|show|branch|checkout|switch|merge|tag|stash|remote|fetch|pull|push|ls-remote|clean|diff|config|rev-parse|clone, gh auth|repo|pr|issue', 'Python: pip install <package> [-force] | pip upgrade <package> [-version <ver>] | pip uninstall <package> | pip include <module> | pip list', 'JavaScript/TypeScript: npm install <package...> | npm uninstall <package...> | npm include <module> [url] | npm remove <module> | npm list', 'C#: nuget include <namespace> | nuget list', 'JavaScript/TypeScript: use Run or Project Run on .js, .jsx, .ts, and .tsx files', 'C/C++: use Run or Project Run on .c, .cpp, .cc, .cxx, and matching header files', 'Java: use Run or Project Run on .java files']);
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

  const refreshSettingsNpmInstalledPackages = () => {
    const saved = loadSavedNpmInstalledPackages();
    setSettingsNpmInstalledPackages(saved);
    return saved;
  };

  const refreshSettingsJavaScriptIncludedModules = () => {
    const saved = loadSavedJavaScriptIncludedModules();
    setSettingsJavaScriptIncludedModules(saved);
    return saved;
  };

  const refreshSettingsCSharpNamespaces = () => {
    const saved = loadSavedCSharpNamespaces();
    setSettingsCSharpNamespaces(saved);
    return saved;
  };

  const runPackageJsonDependencySync = useCallback(async () => {
    if (packageJsonSyncRunningRef.current) {
      packageJsonSyncQueuedRef.current = true;
      return;
    }

    const plan = collectPackageJsonDependencySyncPlan(filesRef.current);
    const installedPackages = loadSavedNpmInstalledPackages();
    const syncFingerprint = JSON.stringify({
      packageJson: plan.signature,
      installed: installedPackages.map(packageInfo => [packageInfo.name, packageInfo.version, packageInfo.spec]),
    });
    if (syncFingerprint === packageJsonSyncFingerprintRef.current) return;
    packageJsonSyncFingerprintRef.current = syncFingerprint;
    if (plan.packageJsonCount === 0) return;

    packageJsonSyncRunningRef.current = true;
    try {
      if (plan.invalidFiles.length > 0) {
        setTerminalOutput(prev => [
          ...prev,
          `package.json sync skipped: ${plan.invalidFiles.length} invalid package.json issue${plan.invalidFiles.length === 1 ? '' : 's'} found.`,
          ...plan.invalidFiles.slice(0, 8).map(issue => `  ${issue.path}: ${issue.message}`),
          ...(plan.invalidFiles.length > 8 ? [`  ... ${plan.invalidFiles.length - 8} more issue${plan.invalidFiles.length - 8 === 1 ? '' : 's'}`] : [])
        ]);
        return;
      }

      if (plan.conflicts.length > 0) {
        setTerminalOutput(prev => [
          ...prev,
          `package.json sync skipped: conflicting dependency ranges were found across ${plan.packageJsonCount} package.json file${plan.packageJsonCount === 1 ? '' : 's'}.`,
          ...plan.conflicts.slice(0, 8).map(conflict => `  ${conflict.packageName}: ${conflict.ranges.join(' vs ')} (${conflict.sources.join(', ')})`),
          ...(plan.conflicts.length > 8 ? [`  ... ${plan.conflicts.length - 8} more conflict${plan.conflicts.length - 8 === 1 ? '' : 's'}`] : [])
        ]);
        return;
      }

      const installedByName = new Map(installedPackages.map(packageInfo => [packageInfo.name, packageInfo]));
      const specsToInstall = plan.requirements
        .filter(requirement => {
          const existing = installedByName.get(requirement.name);
          if (!existing) return true;
          return existing.spec !== requirement.spec || !satisfiesNpmRange(existing.version, requirement.range);
        })
        .map(requirement => requirement.spec);

      if (specsToInstall.length === 0) {
        if (plan.unsupportedDependencies.length > 0) {
          setTerminalOutput(prev => [
            ...prev,
            `package.json sync: all supported dependencies are already installed. Skipped ${plan.unsupportedDependencies.length} unsupported dependenc${plan.unsupportedDependencies.length === 1 ? 'y' : 'ies'}.`,
            ...plan.unsupportedDependencies.slice(0, 6).map(issue => `  ${issue.path}: ${issue.message}`),
          ]);
        }
        return;
      }

      setTerminalOutput(prev => [
        ...prev,
        `package.json sync: installing ${formatNpmPackageListForStatus(specsToInstall)} from npm registry...`,
        ...(plan.unsupportedDependencies.length > 0
          ? [`package.json sync: skipped ${plan.unsupportedDependencies.length} unsupported dependenc${plan.unsupportedDependencies.length === 1 ? 'y' : 'ies'}.`]
          : [])
      ]);

      let progressDetailCount = 0;
      let suppressedProgressCount = 0;
      const result = await installNpmPackagesFromRegistry(specsToInstall, message => {
        const installedMatch = message.match(/^Installed .* \((\d+) installed,/);
        const installedCount = installedMatch ? Number(installedMatch[1]) : 0;
        const shouldShowDetail = (
          progressDetailCount < 20
          || installedCount > 0 && installedCount % 25 === 0
          || /complete|error|failed/i.test(message)
        );
        if (shouldShowDetail) {
          progressDetailCount += 1;
          const suppressedLine = suppressedProgressCount > 0
            ? [`... ${suppressedProgressCount} package.json sync progress update${suppressedProgressCount === 1 ? '' : 's'} suppressed ...`]
            : [];
          suppressedProgressCount = 0;
          setTerminalOutput(prev => [...prev, ...suppressedLine, message]);
        } else {
          suppressedProgressCount += 1;
        }
      });

      refreshCodeCraftTypeScriptExtraLibs();
      setSettingsNpmInstalledPackages(loadSavedNpmInstalledPackages());
      setTerminalOutput(prev => [
        ...prev,
        ...(suppressedProgressCount > 0
          ? [`... ${suppressedProgressCount} package.json sync progress update${suppressedProgressCount === 1 ? '' : 's'} suppressed ...`]
          : []),
        `package.json sync complete: ${result.installed.length} package${result.installed.length === 1 ? '' : 's'} installed or updated.`,
        ...result.skipped.map(note => `Note: skipped ${note}`),
      ]);
    } catch (err) {
      packageJsonSyncFingerprintRef.current = '';
      setTerminalOutput(prev => [...prev, `package.json sync error: ${err instanceof Error ? err.message : String(err)}`]);
    } finally {
      packageJsonSyncRunningRef.current = false;
      if (packageJsonSyncQueuedRef.current) {
        packageJsonSyncQueuedRef.current = false;
        packageJsonSyncFingerprintRef.current = '';
        window.setTimeout(() => void runPackageJsonDependencySync(), 0);
      }
    }
  }, []);

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

  const runSettingsNpmPackageCommand = async (command: string) => {
    setSettingsNpmPackageBusy(true);
    setSettingsNpmPackageStatus(`Running \`${command}\`. Detailed logs will appear in Terminal.`);
    try {
      await executeTerminalCommand(command, false);
      return refreshSettingsNpmInstalledPackages();
    } finally {
      setSettingsNpmPackageBusy(false);
    }
  };

  const runSettingsJavaScriptModuleCommand = async (command: string) => {
    setSettingsJavaScriptModuleBusy(true);
    setSettingsJavaScriptModuleStatus(`Running \`${command}\`. Detailed logs will appear in Terminal.`);
    try {
      const beforeOutputLength = terminalOutputRef.current.length;
      await executeTerminalCommand(command, false);
      await new Promise(resolve => window.setTimeout(resolve, 0));
      return {
        modules: refreshSettingsJavaScriptIncludedModules(),
        output: terminalOutputRef.current.slice(beforeOutputLength),
      };
    } finally {
      setSettingsJavaScriptModuleBusy(false);
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

  const handleSettingsNpmPackageApply = async () => {
    const packageSpecs = getNpmPackageArgs(parseTerminalArgs(settingsNpmPackageInput));
    if (packageSpecs.length === 0) {
      setSettingsNpmPackageStatus('Enter one or more npm package names first.');
      return;
    }

    const invalidPackage = packageSpecs.find(packageSpec => !parseNpmPackageInstallSpec(packageSpec));
    if (invalidPackage) {
      setSettingsNpmPackageStatus(`Invalid npm package specifier: ${invalidPackage}`);
      return;
    }

    const command = `npm install ${packageSpecs.map(quoteTerminalArg).join(' ')}`;
    const saved = await runSettingsNpmPackageCommand(command);
    const installedNames = new Set(saved.map(packageInfo => packageInfo.name));
    const requestedNames = packageSpecs
      .map(packageSpec => parseNpmPackageInstallSpec(packageSpec)?.name || '')
      .filter(Boolean);
    if (requestedNames.every(name => installedNames.has(name))) {
      setSettingsNpmPackageStatus(`Installed ${formatNpmPackageListForStatus(requestedNames)}.`);
      setSettingsNpmPackageInput('');
    } else {
      setSettingsNpmPackageStatus('One or more package entries were not added. Check Terminal output for the failure details.');
    }
  };

  const handleSettingsNpmPackageRemove = async (packageName: string) => {
    const saved = await runSettingsNpmPackageCommand(`npm uninstall ${quoteTerminalArg(packageName)}`);
    if (saved.some(packageInfo => packageInfo.name === packageName)) {
      setSettingsNpmPackageStatus(`Could not uninstall ${packageName}. Check Terminal output for the failure details.`);
    } else {
      setSettingsNpmPackageStatus(`Uninstalled ${packageName}.`);
    }
  };

  const handleSettingsJavaScriptModuleApply = async () => {
    const moduleName = settingsJavaScriptModuleInput.trim();
    const moduleUrl = settingsJavaScriptModuleUrlInput.trim();
    if (!moduleName) {
      setSettingsJavaScriptModuleStatus('Enter a JavaScript module specifier first.');
      return;
    }
    if (!isValidJavaScriptModuleName(moduleName)) {
      setSettingsJavaScriptModuleStatus(`Invalid JavaScript module specifier: ${moduleName}`);
      return;
    }

    const command = `npm include ${quoteTerminalArg(moduleName)}${moduleUrl ? ` ${quoteTerminalArg(moduleUrl)}` : ''}`;
    const { modules: saved, output } = await runSettingsJavaScriptModuleCommand(command);
    const moduleInfo = saved.find(entry => entry.name === moduleName);
    const includeFailed = output.some(line => line.includes(`npm include: could not include '${moduleName}'`));
    if (moduleInfo && !includeFailed) {
      setSettingsJavaScriptModuleStatus(`Included ${moduleInfo.name} -> ${moduleInfo.url}.`);
      setSettingsJavaScriptModuleInput('');
      setSettingsJavaScriptModuleUrlInput('');
    } else {
      setSettingsJavaScriptModuleStatus(`No saved JavaScript module entry was added for ${moduleName}. Check Terminal output for the failure details.`);
    }
  };

  const handleSettingsJavaScriptModuleRemove = async (moduleName: string) => {
    const { modules: saved } = await runSettingsJavaScriptModuleCommand(`npm remove ${quoteTerminalArg(moduleName)}`);
    if (saved.some(moduleInfo => moduleInfo.name === moduleName)) {
      setSettingsJavaScriptModuleStatus(`Could not remove ${moduleName}. Check Terminal output for the failure details.`);
    } else {
      setSettingsJavaScriptModuleStatus(`Removed saved JavaScript module ${moduleName}.`);
    }
  };

  const getLiveUserDataLocalStorageOverrides = () => ({
    [STORAGE_KEYS.settings]: JSON.stringify(settings),
    [STORAGE_KEYS.assistantChats]: JSON.stringify(assistantChats),
    [STORAGE_KEYS.layout]: JSON.stringify(layoutModel.toJson()),
    [SYNC_META_KEY]: JSON.stringify(syncMeta),
  });

  const persistCurrentProjectSnapshot = async (projectId = activeProjectId) => {
    const overrides = getLiveUserDataLocalStorageOverrides();
    for (const [key, value] of Object.entries(overrides)) {
      localStorage.setItem(getProjectStorageKey(key, projectId), value);
    }
    await saveStoredProjectFiles(filesRef.current, projectId);
    await saveStoredGitState(gitStateRef.current, projectId);
    setProjects(touchProjectUpdatedAt(projectId));
  };

  const switchProject = async (projectId: string) => {
    if (projectId === activeProjectId) {
      setIsProjectMenuOpen(false);
      return;
    }
    await persistCurrentProjectSnapshot(activeProjectId);
    if (!setActiveProjectId(projectId)) {
      setProjectMenuStatus('Project no longer exists.');
      setProjects(loadProjectRegistry());
      return;
    }
    touchProjectUpdatedAt(projectId);
    setActiveProjectIdState(projectId);
    setProjectMenuStatus('Switching project...');
    window.setTimeout(() => window.location.reload(), 100);
  };

  const startRenamingProject = (project: CodeCraftProjectMeta) => {
    setRenamingProjectId(project.id);
    setRenamingProjectName(project.name);
    setProjectMenuStatus('');
  };

  const cancelRenamingProject = () => {
    setRenamingProjectId(null);
    setRenamingProjectName('');
  };

  const confirmRenamingProject = () => {
    if (!renamingProjectId) return;

    const nextName = renamingProjectName.trim();
    if (!nextName) {
      cancelRenamingProject();
      return;
    }

    const currentProjects = loadProjectRegistry();
    const renamedProject = currentProjects.find(project => project.id === renamingProjectId);
    if (!renamedProject) {
      setProjectMenuStatus('Project no longer exists.');
      setProjects(loadProjectRegistry());
      cancelRenamingProject();
      return;
    }
    if (renamedProject.name === nextName) {
      cancelRenamingProject();
      return;
    }

    const uniqueName = getUniqueProjectName(nextName, currentProjects.filter(project => project.id !== renamingProjectId));
    saveProjectRegistry(currentProjects.map(project => (
      project.id === renamingProjectId
        ? { ...project, name: uniqueName, updatedAt: Date.now() }
        : project
    )));
    setProjects(loadProjectRegistry());
    setProjectMenuStatus(uniqueName === nextName ? 'Renamed project.' : `Renamed project to ${uniqueName}.`);
    cancelRenamingProject();
  };

  const handleDeleteProject = async (projectId: string) => {
    const currentProjects = loadProjectRegistry();
    const project = currentProjects.find(candidate => candidate.id === projectId);
    if (!project) {
      setProjectMenuStatus('Project no longer exists.');
      setProjects(loadProjectRegistry());
      return;
    }
    if (currentProjects.length <= 1) {
      setProjectMenuStatus('Keep at least one project.');
      return;
    }
    if (!window.confirm(`Delete project "${project.name}" and its stored data?`)) return;

    if (projectId !== activeProjectId) {
      await persistCurrentProjectSnapshot(activeProjectId);
    }

    const remainingProjects = currentProjects.filter(candidate => candidate.id !== projectId);
    saveProjectRegistry(remainingProjects);
    let cleanupStatus = '';
    try {
      await deleteCodeCraftProjectData(projectId);
    } catch (err) {
      cleanupStatus = `Deleted project entry, but cleanup failed: ${err instanceof Error ? err.message : String(err)}`;
    }

    const nextProjects = loadProjectRegistry();
    setProjects(nextProjects);
    if (renamingProjectId === projectId) cancelRenamingProject();

    if (projectId === activeProjectId) {
      const nextProjectId = nextProjects[0]?.id || DEFAULT_PROJECT_ID;
      setActiveProjectId(nextProjectId);
      setActiveProjectIdState(nextProjectId);
      setProjectMenuStatus('Deleted project. Loading another project...');
      window.setTimeout(() => window.location.reload(), 100);
      return;
    }

    setProjectMenuStatus(cleanupStatus || `Deleted ${project.name}.`);
  };

  const handleCreateProject = async () => {
    await persistCurrentProjectSnapshot(activeProjectId);
    const existingProjects = loadProjectRegistry();
    const now = Date.now();
    const project: CodeCraftProjectMeta = {
      id: createProjectId(),
      name: getUniqueProjectName('Untitled Project', existingProjects),
      createdAt: now,
      updatedAt: now,
    };
    saveProjectRegistry([project, ...existingProjects]);
    setProjects(loadProjectRegistry());
    setActiveProjectId(project.id);
    setActiveProjectIdState(project.id);
    setProjectMenuStatus('Created project. Loading...');
    window.setTimeout(() => window.location.reload(), 100);
  };

  const handleImportProjectDataFile = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.currentTarget.files?.[0];
    event.currentTarget.value = '';
    if (!file) return;

    await persistCurrentProjectSnapshot(activeProjectId);
    const existingProjects = loadProjectRegistry();
    const now = Date.now();
    const project: CodeCraftProjectMeta = {
      id: createProjectId(),
      name: getUniqueProjectName(getProjectNameFromDataFileName(file.name), existingProjects),
      createdAt: now,
      updatedAt: now,
    };

    setProjectMenuStatus(`Importing ${file.name}...`);
    saveProjectRegistry([project, ...existingProjects]);
    setProjects(loadProjectRegistry());
    try {
      const parsed = JSON.parse(await file.text());
      await restoreCodeCraftUserDataExport(parsed, project.id);
      setActiveProjectId(project.id);
      setActiveProjectIdState(project.id);
      setProjectMenuStatus('Imported project. Loading...');
      window.setTimeout(() => window.location.reload(), 100);
    } catch (err) {
      saveProjectRegistry(loadProjectRegistry().filter(existing => existing.id !== project.id));
      setProjects(loadProjectRegistry());
      setProjectMenuStatus(`Project import failed: ${err instanceof Error ? err.message : String(err)}`);
    }
  };

  const handleExportUserData = async () => {
    setSettingsUserDataBusy(true);
    setSettingsUserDataStatus('Preparing export...');
    try {
      if ((window as any).pyodide) {
        setSettingsUserDataStatus('Preparing Python runtime cache...');
        await capturePyodidePackageRestoreSnapshot();
      } else {
        await persistPyodidePackageMetaCache();
      }
      const backup = await createCodeCraftUserDataExport(getLiveUserDataLocalStorageOverrides(), activeProjectId, gitStateRef.current, filesRef.current);
      const blob = new Blob([JSON.stringify(backup, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
      link.href = url;
      link.download = `codecraft-user-data-${timestamp}.json`;
      document.body.appendChild(link);
      link.click();
      link.remove();
      URL.revokeObjectURL(url);
      setSettingsUserDataStatus('Exported complete user data.');
    } catch (err) {
      setSettingsUserDataStatus(`Export failed: ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      setSettingsUserDataBusy(false);
    }
  };

  const handleImportUserDataFile = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.currentTarget.files?.[0];
    event.currentTarget.value = '';
    if (!file) return;
    if (!window.confirm('Importing this backup will replace the current CodeCraft user data in this browser. Continue?')) {
      return;
    }

    setSettingsUserDataBusy(true);
    setSettingsUserDataStatus(`Importing ${file.name}...`);
    try {
      const parsed = JSON.parse(await file.text());
      await restoreCodeCraftUserDataExport(parsed);
      setSettingsUserDataStatus('Imported complete user data. Reloading...');
      window.setTimeout(() => window.location.reload(), 500);
    } catch (err) {
      setSettingsUserDataStatus(`Import failed: ${err instanceof Error ? err.message : String(err)}`);
      setSettingsUserDataBusy(false);
    }
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

  const openFileTreeContextMenu = (itemId: string | null, clientX: number, clientY: number) => {
    const menuWidth = 176;
    const menuHeight = 220;
    const x = Math.max(8, Math.min(clientX, window.innerWidth - menuWidth - 8));
    const y = Math.max(8, Math.min(clientY, window.innerHeight - menuHeight - 8));
    setFileTreeContextMenu({ itemId, x, y });
  };

  const addUploadedProjectFiles = useCallback((uploadedFiles: UploadedProjectFile[], targetId: string | null) => {
    const currentFiles = filesRef.current;
    const targetFolder = targetId
      ? currentFiles.find(item => item.id === targetId && item.type === 'folder') || null
      : null;
    const targetParentId = targetFolder?.id ?? null;
    const nextFiles = currentFiles.map(item => ({ ...item }));
    const conflicts: string[] = [];
    const importedPaths: string[] = [];
    let firstImportedFileItem: FSItem | null = null;

    const findChild = (parentId: string | null, name: string) => (
      nextFiles.find(item => item.parentId === parentId && item.name === name)
    );

    const ensureOpenFolder = (folderId: string) => {
      const folder = nextFiles.find(item => item.id === folderId && item.type === 'folder');
      if (folder) folder.isOpen = true;
    };

    const ensureFolder = (parentId: string | null, name: string, uploadPath: string) => {
      const existing = findChild(parentId, name);
      if (existing) {
        if (existing.type !== 'folder') {
          conflicts.push(uploadPath);
          return null;
        }
        existing.isOpen = true;
        return existing.id;
      }

      const folderId = createFsItemId();
      nextFiles.push({
        id: folderId,
        name,
        type: 'folder',
        parentId,
        isOpen: true,
      });
      return folderId;
    };

    if (targetParentId) ensureOpenFolder(targetParentId);

    for (const uploadedFile of uploadedFiles) {
      const segments = sanitizeUploadedProjectPath(uploadedFile.path);
      if (segments.length === 0) continue;

      let parentId: string | null = targetParentId;
      let canImport = true;
      for (const folderName of segments.slice(0, -1)) {
        const folderId = ensureFolder(parentId, folderName, uploadedFile.path);
        if (!folderId) {
          canImport = false;
          break;
        }
        parentId = folderId;
      }
      if (!canImport) continue;

      const fileName = segments[segments.length - 1];
      const existing = findChild(parentId, fileName);
      if (existing?.type === 'folder') {
        conflicts.push(uploadedFile.path);
        continue;
      }

      if (existing?.type === 'file') {
        existing.content = uploadedFile.content;
        existing.language = langFromFilename(fileName);
        firstImportedFileItem ??= existing;
      } else {
        const fileId = createFsItemId();
        const newFile: FSItem = {
          id: fileId,
          name: fileName,
          type: 'file',
          parentId,
          content: uploadedFile.content,
          language: langFromFilename(fileName),
        };
        nextFiles.push(newFile);
        firstImportedFileItem ??= newFile;
      }
      importedPaths.push(uploadedFile.path);
    }

    if (importedPaths.length === 0 && conflicts.length === 0) {
      setTerminalOutput(prev => [...prev, 'File import: no readable files found.']);
      return;
    }

    setFiles(nextFiles);
    if (firstImportedFileItem) openEditorTabWithItem(firstImportedFileItem);
    setTerminalOutput(prev => [
      ...prev,
      importedPaths.length > 0
        ? `File import: imported ${importedPaths.length} file${importedPaths.length === 1 ? '' : 's'}.`
        : 'File import: no files imported.',
      ...(conflicts.length > 0
        ? [`File import skipped ${conflicts.length} conflicting path${conflicts.length === 1 ? '' : 's'}: ${formatNpmPackageListForStatus(conflicts)}`]
        : [])
    ]);
  }, [openEditorTabWithItem]);

  const importFilesFromDataTransfer = useCallback(async (targetId: string | null, dataTransfer: DataTransfer) => {
    try {
      const uploadedFiles = await readUploadedProjectFilesFromDataTransfer(dataTransfer);
      addUploadedProjectFiles(uploadedFiles, targetId);
    } catch (err) {
      setTerminalOutput(prev => [...prev, `File import error: ${err instanceof Error ? err.message : String(err)}`]);
    }
  }, [addUploadedProjectFiles]);

  useEffect(() => {
    const handleWindowPaste = (event: ClipboardEvent) => {
      const target = event.target;
      if (target instanceof Element && target.closest('[data-codecraft-ai-panel="true"]')) return;
      if (!hasFileDataTransferPayload(event.clipboardData)) return;

      event.preventDefault();
      void importFilesFromDataTransfer(null, event.clipboardData!);
    };

    window.addEventListener('paste', handleWindowPaste);
    return () => window.removeEventListener('paste', handleWindowPaste);
  }, [importFilesFromDataTransfer]);

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
    openEditorTab, toggleFolder, setDraggedItemId, handleDrop, importFilesFromDataTransfer, addNewItem,
    deleteItem, duplicateItem, openContextMenu: openFileTreeContextMenu,
    confirmRename, setRenamingId, setRenamingName, setPendingNewItem,
  };

  const renderCSharpIdeDebugPanel = (tabItem: FSItem) => {
    if (!settings.csharpIdeDebugMode || getProjectFileLanguageForRuntime(tabItem) !== 'csharp') return null;

    const snapshot = csharpIdeDebugSnapshot;
    const features = snapshot?.features ?? [];
    const hasSelectedFeature = features.some(feature => feature.key === activeCSharpIdeDebugFeature);
    const selectedFeatureKey = activeCSharpIdeDebugFeature === 'overview' || hasSelectedFeature
      ? activeCSharpIdeDebugFeature
      : 'overview';
    const selectedFeature = features.find(feature => feature.key === selectedFeatureKey) ?? null;
    const timelineEvents = selectedFeature
      ? [...selectedFeature.events].reverse()
      : [...(snapshot?.events ?? [])].slice(-80).reverse();

    const renderJsonBlock = (title: string, value: unknown, emptyLabel = 'No data recorded yet.') => (
      <div className="min-w-0 rounded-lg border border-white/10 bg-black/30">
        <div className="border-b border-white/10 px-2 py-1 text-[10px] font-medium uppercase tracking-wide text-zinc-500">
          {title}
        </div>
        <pre className="max-h-44 overflow-auto p-2 text-[10px] leading-snug text-zinc-400 custom-scrollbar">
          {value === undefined || value === null ? emptyLabel : stringifyCSharpDebugValue(value)}
        </pre>
      </div>
    );

    const renderFeatureMetrics = (feature: CSharpIdeDebugFeatureSnapshot) => (
      <div className="grid grid-cols-2 lg:grid-cols-6 gap-2 text-[10px]">
        <div className="rounded-lg border border-white/10 bg-white/5 px-2 py-1.5">
          <div className="text-zinc-500">Events</div>
          <div className="mt-1 text-zinc-100">{feature.eventCount}</div>
        </div>
        <div className="rounded-lg border border-white/10 bg-white/5 px-2 py-1.5">
          <div className="text-zinc-500">Provider / Runtime</div>
          <div className="mt-1 text-zinc-100">{feature.providerCallCount} / {feature.runtimeCallCount}</div>
        </div>
        <div className="rounded-lg border border-white/10 bg-white/5 px-2 py-1.5">
          <div className="text-zinc-500">Errors</div>
          <div className={cn("mt-1", feature.errorCount ? "text-red-300" : "text-zinc-100")}>{feature.errorCount}</div>
        </div>
        <div className="rounded-lg border border-white/10 bg-white/5 px-2 py-1.5">
          <div className="text-zinc-500">Warnings</div>
          <div className={cn("mt-1", feature.warningCount ? "text-amber-300" : "text-zinc-100")}>{feature.warningCount}</div>
        </div>
        <div className="rounded-lg border border-white/10 bg-white/5 px-2 py-1.5">
          <div className="text-zinc-500">Avg / Max</div>
          <div className="mt-1 text-zinc-100">{formatCSharpDebugDuration(feature.averageDurationMs)} / {formatCSharpDebugDuration(feature.maxDurationMs)}</div>
        </div>
        <div className="rounded-lg border border-white/10 bg-white/5 px-2 py-1.5">
          <div className="text-zinc-500">In Flight</div>
          <div className={cn("mt-1", feature.inFlightCount ? "text-indigo-300" : "text-zinc-100")}>{feature.inFlightCount}</div>
        </div>
      </div>
    );

    return (
      <div className="absolute right-3 bottom-3 z-20 w-[min(1080px,calc(100%-1.5rem))] max-h-[72%] overflow-hidden rounded-xl border border-indigo-400/30 bg-zinc-950/95 shadow-2xl backdrop-blur">
        <div className="flex items-center justify-between gap-3 border-b border-white/10 px-3 py-2">
          <div className="flex items-center gap-2 min-w-0">
            <Bug size={14} className="text-indigo-300 shrink-0" />
            <div className="min-w-0">
              <div className="text-xs font-semibold text-white">C# IDE Debug</div>
              <div className="text-[10px] text-zinc-500 truncate">
                {snapshot?.activeModel?.path ?? getPath(tabItem.id)}
              </div>
            </div>
          </div>
          <div className="flex items-center gap-1.5 shrink-0">
            <button
              type="button"
              onClick={copyCSharpIdeDebugSnapshot}
              disabled={!snapshot}
              className="inline-flex items-center gap-1 rounded-lg border border-white/10 bg-white/5 px-2 py-1 text-[10px] text-zinc-300 transition-colors hover:bg-white/10 disabled:opacity-50"
            >
              <Copy size={11} /> Copy JSON
            </button>
            <button
              type="button"
              onClick={clearCSharpIdeDebugEvents}
              className="rounded-lg border border-white/10 bg-white/5 px-2 py-1 text-[10px] text-zinc-300 transition-colors hover:bg-white/10"
            >
              Clear
            </button>
          </div>
        </div>

        {snapshot ? (
          <div className="max-h-[calc(72vh-2.5rem)] overflow-hidden">
            <div className="border-b border-white/10 px-3 py-2">
              <div className="grid grid-cols-2 lg:grid-cols-5 gap-2 text-[10px]">
                <div className="rounded-lg border border-white/10 bg-white/5 px-2 py-1.5">
                  <div className="flex items-center gap-1 text-zinc-500"><Activity size={10} /> Runtime</div>
                  <div className="mt-1 text-zinc-200">
                    {snapshot.runtime.hasOmniSharpBridge ? 'Bridge ready' : snapshot.runtime.initializationPending ? 'Initializing' : 'Bridge missing'}
                  </div>
                </div>
                <div className="rounded-lg border border-white/10 bg-white/5 px-2 py-1.5">
                  <div className="flex items-center gap-1 text-zinc-500"><FileCode size={10} /> C# Files</div>
                  <div className="mt-1 text-zinc-200">{snapshot.project.csharpFileCount}/{snapshot.project.providerFileCount}</div>
                </div>
                <div className="rounded-lg border border-white/10 bg-white/5 px-2 py-1.5">
                  <div className="flex items-center gap-1 text-zinc-500"><Database size={10} /> Cache</div>
                  <div className="mt-1 text-zinc-200">
                    C {snapshot.cache.completionCacheSize} · D {snapshot.cache.diagnosticCacheMarkerCount}
                  </div>
                </div>
                <div className="rounded-lg border border-white/10 bg-white/5 px-2 py-1.5">
                  <div className="flex items-center gap-1 text-zinc-500"><History size={10} /> Events</div>
                  <div className="mt-1 text-zinc-200">{snapshot.events.length}</div>
                </div>
                <div className="rounded-lg border border-white/10 bg-white/5 px-2 py-1.5">
                  <div className="text-zinc-500">Active Version</div>
                  <div className="mt-1 text-zinc-200">
                    {snapshot.activeModel ? `v${snapshot.activeModel.versionId} · ${snapshot.activeModel.hash}` : 'No C# model'}
                  </div>
                </div>
              </div>
            </div>

            <div className="flex max-h-[calc(72vh-8.25rem)] min-h-0">
              <div className="w-52 shrink-0 overflow-y-auto border-r border-white/10 p-2 custom-scrollbar">
                <button
                  type="button"
                  onClick={() => setActiveCSharpIdeDebugFeature('overview')}
                  className={cn(
                    "mb-1 w-full rounded-lg px-2 py-1.5 text-left text-[11px] transition-colors",
                    selectedFeatureKey === 'overview' ? "bg-indigo-500/20 text-indigo-100" : "text-zinc-400 hover:bg-white/5 hover:text-white"
                  )}
                >
                  <div className="font-medium">Overview</div>
                  <div className="text-[10px] text-zinc-500">All features</div>
                </button>
                {features.map(feature => (
                  <button
                    key={feature.key}
                    type="button"
                    onClick={() => setActiveCSharpIdeDebugFeature(feature.key)}
                    className={cn(
                      "mb-1 w-full rounded-lg px-2 py-1.5 text-left text-[11px] transition-colors",
                      selectedFeatureKey === feature.key ? "bg-indigo-500/20 text-indigo-100" : "text-zinc-400 hover:bg-white/5 hover:text-white"
                    )}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className="truncate font-medium">{feature.label}</span>
                      <span className={cn(
                        "shrink-0",
                        feature.errorCount ? "text-red-300" : feature.warningCount ? "text-amber-300" : "text-zinc-600"
                      )}>
                        {feature.eventCount}
                      </span>
                    </div>
                    <div className="mt-0.5 flex items-center justify-between gap-2 text-[10px] text-zinc-500">
                      <span className="truncate">{feature.category}</span>
                      <span>{formatCSharpDebugDuration(feature.lastDurationMs)}</span>
                    </div>
                  </button>
                ))}
              </div>

              <div className="min-w-0 flex-1 overflow-y-auto p-3 custom-scrollbar">
                {selectedFeature ? (
                  <div className="space-y-3">
                    <div>
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          <div className="text-sm font-semibold text-white">{selectedFeature.label}</div>
                          <div className="mt-1 text-[11px] leading-relaxed text-zinc-500">{selectedFeature.description}</div>
                        </div>
                        <div className="shrink-0 rounded-lg border border-white/10 bg-white/5 px-2 py-1 text-[10px] text-zinc-400">
                          {selectedFeature.category} · last {formatCSharpDebugTimestamp(selectedFeature.lastEventAt)}
                        </div>
                      </div>
                    </div>

                    {renderFeatureMetrics(selectedFeature)}

                    <div className="grid grid-cols-1 lg:grid-cols-2 gap-2">
                      {renderJsonBlock('Phase Counts', selectedFeature.phases)}
                      {renderJsonBlock('Level Counts', selectedFeature.levels)}
                    </div>

                    <div className="grid grid-cols-1 xl:grid-cols-2 gap-2">
                      {renderJsonBlock('Last Request', selectedFeature.lastRequest)}
                      {renderJsonBlock('Last Response', selectedFeature.lastResponse)}
                      {renderJsonBlock('Last Error', selectedFeature.lastError)}
                      {renderJsonBlock('Last Environment', selectedFeature.lastEnvironment)}
                    </div>
                  </div>
                ) : (
                  <div className="space-y-3">
                    <div>
                      <div className="text-sm font-semibold text-white">Overview</div>
                      <div className="mt-1 text-[11px] leading-relaxed text-zinc-500">
                        Full C# IDE debug state grouped by feature. Pick a feature tab to inspect its request/response timeline.
                      </div>
                    </div>

                    <div className="grid grid-cols-1 xl:grid-cols-2 gap-2">
                      {renderJsonBlock('Runtime', snapshot.runtime)}
                      {renderJsonBlock('Active Model', snapshot.activeModel)}
                      {renderJsonBlock('Cache', snapshot.cache)}
                      {renderJsonBlock('Last Diagnostic Project Request', snapshot.project.lastDiagnosticRequest)}
                    </div>

                    <div className="rounded-lg border border-white/10 bg-black/30 px-2 py-1.5 text-[10px]">
                      <div className="text-zinc-500">Project Snapshot</div>
                      <div className="mt-1 space-y-1">
                        {snapshot.project.files.map(file => (
                          <div key={file.path} className="flex items-center justify-between gap-2 text-zinc-300">
                            <span className="truncate">{file.path}</span>
                            <span className="shrink-0 text-zinc-500">
                              {file.lines} lines · {file.length} chars · {file.hash}{file.hasMonacoModel ? ' · model' : ''}
                            </span>
                          </div>
                        ))}
                        {snapshot.project.files.length === 0 ? (
                          <div className="text-zinc-500">No C# files reported by the project provider.</div>
                        ) : null}
                        {snapshot.project.providerError ? (
                          <div className="text-red-300">{snapshot.project.providerError}</div>
                        ) : null}
                      </div>
                    </div>

                    <div className="grid grid-cols-1 lg:grid-cols-2 gap-2">
                      {features.map(feature => (
                        <button
                          key={feature.key}
                          type="button"
                          onClick={() => setActiveCSharpIdeDebugFeature(feature.key)}
                          className="rounded-lg border border-white/10 bg-black/30 px-2 py-2 text-left transition-colors hover:bg-white/5"
                        >
                          <div className="flex items-center justify-between gap-2">
                            <div className="text-xs font-medium text-zinc-100">{feature.label}</div>
                            <div className={cn("text-[10px]", feature.errorCount ? "text-red-300" : feature.warningCount ? "text-amber-300" : "text-zinc-500")}>
                              {feature.eventCount} events
                            </div>
                          </div>
                          <div className="mt-1 text-[10px] text-zinc-500">
                            {feature.category} · {feature.providerCallCount} provider · {feature.runtimeCallCount} runtime · avg {formatCSharpDebugDuration(feature.averageDurationMs)}
                          </div>
                        </button>
                      ))}
                    </div>
                  </div>
                )}

                <div className="mt-3 space-y-2">
                  <div className="text-[10px] font-medium uppercase tracking-wide text-zinc-500">
                    {selectedFeature ? `${selectedFeature.label} Timeline` : 'Recent Timeline'}
                  </div>
                  {timelineEvents.map(event => (
                    <div key={event.id} className="rounded-lg border border-white/10 bg-black/30 px-2 py-1.5">
                      <div className="flex items-center justify-between gap-2 text-[10px]">
                        <div className="min-w-0">
                          <span className={cn("font-semibold", getCSharpDebugLevelClass(event.level))}>
                            {event.featureLabel ?? event.feature}
                          </span>
                          <span className="text-zinc-500"> · {event.feature} · {event.phase}</span>
                        </div>
                        <div className="shrink-0 text-zinc-500">
                          {event.durationMs != null ? formatCSharpDebugDuration(event.durationMs) : formatCSharpDebugTimestamp(event.timestamp)}
                        </div>
                      </div>
                      <div className="mt-1 text-[10px] text-zinc-300">{event.message}</div>
                      <pre className="mt-1 max-h-40 overflow-auto rounded bg-black/40 p-1.5 text-[10px] leading-snug text-zinc-500 custom-scrollbar">
                        {stringifyCSharpDebugValue(getCSharpDebugEventPayload(event))}
                      </pre>
                    </div>
                  ))}
                  {timelineEvents.length === 0 ? (
                    <div className="rounded-lg border border-white/10 bg-black/30 px-2 py-2 text-[11px] text-zinc-500">
                      No events recorded for this tab yet.
                    </div>
                  ) : null}
                </div>
              </div>
            </div>
          </div>
        ) : (
          <div className="p-3 text-xs text-zinc-400">Waiting for the C# language service to load.</div>
        )}
      </div>
    );
  };

  const factoryImpl = (node: TabNode) => {
    const component = node.getComponent();
    if (component === "editor") {
      const tabNodeId = node.getId();
      const tabItemId = (node as any).getConfig?.()?.itemId as string | undefined;
      const resolvedTabItemId = tabItemId || activeFileId;
      const tabItem = resolvedTabItemId ? files.find(f => f.id === resolvedTabItemId) : undefined;
      const editorModelPath = tabItem
        ? getMonacoProjectModelPath(getPath(tabItem.id))
        : undefined;
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
                <DiffEditor height="100%" original={pendingEdit.originalContent} modified={pendingEdit.proposedContent} language={files.find(f => f.id === pendingEdit.fileId)?.language} theme={CODECRAFT_MONACO_THEME} options={{ fontSize: 14, fontFamily: '"JetBrains Mono", "Fira Code", monospace', minimap: { enabled: false }, scrollBeyondLastLine: false, automaticLayout: true, renderSideBySide: true, readOnly: true, 'semanticHighlighting.enabled': true } as any} />
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
                        {child.type === 'folder' ? <Folder size={20} className="text-amber-400" /> : <FileTypeIcon path={child.name} language={child.language} size={20} />}
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
                  path={editorModelPath}
                  defaultPath={editorModelPath}
                  saveViewState={false}
                  keepCurrentModel={false}
                  height="100%"
                  defaultLanguage={tabItem.language}
                  language={tabItem.language}
                  theme={CODECRAFT_MONACO_THEME}
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
              {renderCSharpIdeDebugPanel(tabItem)}
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
              {terminalOutput.map((line, i) => <div key={i} className="text-zinc-400 whitespace-pre-wrap">{line}</div>)}
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

    if (component === "sourceControl") {
      const commits = Object.values(gitState.commits)
        .sort((left, right) => right.timestamp - left.timestamp);
      const branchNames = Object.keys(gitState.branches).sort();
      const remoteBranchRefs = getGitRemoteBranchRefs(gitState)
        .filter(ref => !gitState.branches[ref.branchName])
        .sort((left, right) => left.label.localeCompare(right.label));
      const currentBranch = gitState.branches[gitState.currentBranch];
      const statusPills = [
        !gitRepositoryPublished ? 'Repository unpublished' : '',
        gitSyncStatus.needsPull ? 'Pull' : '',
        gitSyncStatus.needsPush ? 'Push' : '',
        gitRepositoryPublished && gitSyncStatus.needsPublish ? 'Branch unpublished' : '',
        gitSyncStatus.diverged ? 'Diverged' : '',
      ].filter(Boolean);
      const sourceControlGitActionGroups: { title: string; actions: { label: string; run: () => void | Promise<void>; disabled?: boolean }[] }[] = [
        {
          title: 'Workspace',
          actions: [
            { label: 'Status', run: () => runSourceControlGitCommand(['git', 'status']) },
            { label: 'Diff', run: () => runSourceControlGitCommand(['git', 'diff']) },
            { label: 'Stage All', run: () => runSourceControlGitCommand(['git', 'add', '-A']), disabled: gitChanges.length === 0 },
            { label: 'Unstage', run: () => runSourceControlGitCommand(['git', 'reset']) },
            {
              label: 'Commit',
              run: () => {
                const message = sourceControlCommitMessage.trim() || promptSourceControlValue('Commit message') || '';
                if (!message) return setSourceControlStatus('Commit cancelled: message is required.');
                const staged = stageGitPaths();
                if (!staged.ok) return setSourceControlStatus(staged.lines.join('\n'));
                setSourceControlStatus(createGitCommit(message, gitStateRef.current.stagedPaths || []).lines.join('\n'));
              },
              disabled: gitChanges.length === 0,
            },
            {
              label: 'Restore',
              run: () => {
                const pathspec = promptSourceControlValue('Pathspec to restore', '.');
                if (pathspec !== null) void runSourceControlGitCommand(['git', 'restore', pathspec || '.']);
              },
              disabled: gitChanges.length === 0,
            },
            { label: 'Clean', run: () => runSourceControlGitCommand(['git', 'clean', '-f']), disabled: gitChanges.every(change => change.kind !== 'added') },
            {
              label: 'Reset Mixed',
              run: () => {
                const revision = promptSourceControlValue('Revision', 'HEAD');
                if (revision !== null) void runSourceControlGitCommand(['git', 'reset', '--mixed', revision || 'HEAD']);
              },
            },
            {
              label: 'Reset Hard',
              run: () => {
                const revision = promptSourceControlValue('Revision', 'HEAD');
                if (revision !== null) void runSourceControlGitCommand(['git', 'reset', '--hard', revision || 'HEAD']);
              },
            },
          ],
        },
        {
          title: 'History',
          actions: [
            { label: 'Log', run: () => runSourceControlGitCommand(['git', 'log']) },
            { label: 'Show HEAD', run: () => runSourceControlGitCommand(['git', 'show', 'HEAD']) },
            { label: 'Tags', run: () => runSourceControlGitCommand(['git', 'tag']) },
            {
              label: 'Create Tag',
              run: () => {
                const tag = promptSourceControlValue('Tag name');
                if (tag) void runSourceControlGitCommand(['git', 'tag', tag]);
              },
              disabled: !currentBranch?.head,
            },
            {
              label: 'Delete Tag',
              run: () => {
                const tag = promptSourceControlValue('Tag to delete');
                if (tag) void runSourceControlGitCommand(['git', 'tag', '-d', tag]);
              },
              disabled: Object.keys(gitState.tags).length === 0,
            },
            {
              label: 'Stash',
              run: () => {
                const message = promptSourceControlValue('Stash message', `WIP on ${gitState.currentBranch}`);
                if (message !== null) void runSourceControlGitCommand(['git', 'stash', 'push', '-m', message]);
              },
              disabled: gitChanges.length === 0,
            },
            { label: 'Stashes', run: () => runSourceControlGitCommand(['git', 'stash', 'list']) },
            { label: 'Pop Stash', run: () => runSourceControlGitCommand(['git', 'stash', 'pop']), disabled: gitState.stashes.length === 0 },
          ],
        },
        {
          title: 'Branches',
          actions: [
            { label: 'Branches', run: () => runSourceControlGitCommand(['git', 'branch', '-a']) },
            {
              label: 'Checkout',
              run: () => {
                const branch = promptSourceControlValue('Branch to checkout', gitState.currentBranch);
                if (branch) void runSourceControlGitCommand(['git', 'checkout', branch]);
              },
            },
            {
              label: 'Create Branch',
              run: () => {
                const branch = promptSourceControlValue('New branch');
                if (branch) setSourceControlStatus(checkoutGitBranch(branch, true).lines.join('\n'));
              },
            },
            {
              label: 'Rename Branch',
              run: () => {
                const branch = promptSourceControlValue('New branch name', gitState.currentBranch);
                if (branch) void runSourceControlGitCommand(['git', 'branch', '-m', gitState.currentBranch, branch]);
              },
            },
            {
              label: 'Delete Branch',
              run: () => {
                const branch = promptSourceControlValue('Branch to delete');
                if (branch) void runSourceControlGitCommand(['git', 'branch', '-d', branch]);
              },
            },
            {
              label: 'Set Upstream',
              run: () => {
                const upstream = promptSourceControlValue('Upstream', currentBranch?.upstream || `origin/${gitState.currentBranch}`);
                if (upstream) void runSourceControlGitCommand(['git', 'branch', '--set-upstream-to', upstream]);
              },
            },
            {
              label: 'Merge',
              run: () => {
                const revision = promptSourceControlValue('Branch, tag, or commit to merge');
                if (revision) void runSourceControlGitCommand(['git', 'merge', revision]);
              },
            },
          ],
        },
        {
          title: 'Remote',
          actions: [
            { label: 'Fetch', run: () => runSourceControlGitCommand(['git', 'fetch']) },
            { label: 'Pull', run: () => runSourceControlGitCommand(['git', 'pull']) },
            { label: 'Push', run: () => runSourceControlGitCommand(['git', 'push']) },
            { label: 'Sync', run: async () => setSourceControlStatus((await syncGitBranch()).lines.join('\n')) },
            { label: 'Publish Repo', run: async () => setSourceControlStatus((await publishGitRepository()).lines.join('\n')), disabled: gitRepositoryPublished },
            { label: 'Publish Branch', run: async () => setSourceControlStatus((await publishGitBranch()).lines.join('\n')), disabled: !gitSyncStatus.needsPublish },
            { label: 'Remotes', run: () => runSourceControlGitCommand(['git', 'remote', '-v']) },
            {
              label: 'LS Remote',
              run: () => {
                const remote = promptSourceControlValue('Remote', 'origin');
                if (remote !== null) void runSourceControlGitCommand(['git', 'ls-remote', remote || 'origin']);
              },
            },
            {
              label: 'Add Remote',
              run: () => {
                const name = promptSourceControlValue('Remote name', 'origin');
                const url = promptSourceControlValue('Remote URL');
                if (name && url) void runSourceControlGitCommand(['git', 'remote', 'add', name, url]);
              },
            },
            {
              label: 'Set URL',
              run: () => {
                const name = promptSourceControlValue('Remote name', 'origin');
                if (name === null) return;
                const url = promptSourceControlValue('Remote URL', gitState.remotes[name]?.url || '');
                if (name && url) void runSourceControlGitCommand(['git', 'remote', 'set-url', name, url]);
              },
            },
            {
              label: 'Rename Remote',
              run: () => {
                const oldName = promptSourceControlValue('Old remote name', 'origin');
                const newName = promptSourceControlValue('New remote name');
                if (oldName && newName) void runSourceControlGitCommand(['git', 'remote', 'rename', oldName, newName]);
              },
            },
            {
              label: 'Remove Remote',
              run: () => {
                const name = promptSourceControlValue('Remote to remove');
                if (name) void runSourceControlGitCommand(['git', 'remote', 'remove', name]);
              },
            },
            {
              label: 'Clone',
              run: () => {
                const url = promptSourceControlValue('Clone URL');
                if (!url) return;
                const force = window.confirm('Clone replaces the current CodeCraft workspace. Continue?');
                if (force) void runSourceControlGitCommand(['git', 'clone', url, '--force']);
              },
            },
          ],
        },
        {
          title: 'Repository',
          actions: [
            {
              label: 'Init',
              run: () => {
                if (window.confirm('Reinitialize the virtual Git repository for this workspace?')) void runSourceControlGitCommand(['git', 'init']);
              },
            },
            { label: 'Config', run: () => runSourceControlGitCommand(['git', 'config', '--list']) },
            { label: 'HEAD', run: () => runSourceControlGitCommand(['git', 'rev-parse', 'HEAD']) },
            { label: 'Branch Name', run: () => runSourceControlGitCommand(['git', 'rev-parse', '--abbrev-ref', 'HEAD']) },
            { label: 'Terminal', run: () => selectDockPanel('terminal') },
          ],
        },
      ];

      return (
        <div className="h-full w-full flex flex-col bg-[rgb(28,28,28)] text-zinc-300 border-white/10">
          <div className="flex items-center justify-between gap-2 border-b border-white/10 px-3 py-2">
            <div className="flex min-w-0 items-center gap-2">
              <GitBranch size={15} className="shrink-0 text-emerald-300" />
              <div className="min-w-0">
                <div className="truncate text-xs font-medium text-zinc-200">{gitState.currentBranch}</div>
                <div className="truncate text-[10px] text-zinc-500">
                  {currentBranch?.upstream || `origin/${gitState.currentBranch}`}
                </div>
              </div>
            </div>
            <button
              type="button"
              onClick={() => void handleSourceControlFetch()}
              className="rounded-md p-1.5 text-zinc-500 transition-colors hover:bg-white/10 hover:text-white"
              title="Fetch"
            >
              <RefreshCw size={14} />
            </button>
          </div>

          <div className="flex-1 overflow-y-auto custom-scrollbar p-3 space-y-3">
            <div className="space-y-2">
              <input
                type="text"
                value={sourceControlCommitMessage}
                onChange={(event) => setSourceControlCommitMessage(event.target.value)}
                placeholder="Commit message"
                className="w-full rounded-md border border-white/10 bg-black/20 px-3 py-2 text-xs text-zinc-100 outline-none transition-colors placeholder:text-zinc-600 focus:border-emerald-500/50"
              />
              <button
                type="button"
                disabled={sourceControlActionDisabled}
                onClick={() => void handleSourceControlAction()}
                className={cn(
                  "flex w-full items-center justify-center gap-2 rounded-md px-3 py-2 text-xs font-semibold transition-colors",
                  sourceControlActionDisabled
                    ? "cursor-not-allowed bg-white/5 text-zinc-600"
                    : "bg-emerald-600 text-white hover:bg-emerald-500"
                )}
              >
                {sourceControlActionLabel === 'Publish Branch' || sourceControlActionLabel === 'Publish Repository' ? <CloudUpload size={14} /> : sourceControlActionLabel === 'Sync Changes' ? <RefreshCw size={14} /> : <GitCommitHorizontal size={14} />}
                {sourceControlActionLabel}
              </button>
              {statusPills.length > 0 && (
                <div className="flex flex-wrap gap-1">
                  {statusPills.map(label => (
                    <span key={label} className="rounded bg-emerald-500/10 px-2 py-0.5 text-[10px] text-emerald-300">{label}</span>
                  ))}
                </div>
              )}
            </div>

            <div className="space-y-2 border-t border-white/10 pt-3">
              <div className="flex items-center gap-2">
                <select
                  value={gitState.currentBranch}
                  onChange={(event) => {
                    const result = checkoutGitBranch(event.target.value);
                    setSourceControlStatus(result.lines.join('\n'));
                  }}
                  className="min-w-0 flex-1 rounded-md border border-white/10 bg-black/20 px-2 py-2 text-xs text-zinc-200 outline-none"
                >
                  {branchNames.map(name => <option key={name} value={name}>{name}</option>)}
                  {remoteBranchRefs.length > 0 ? (
                    <optgroup label="Remote branches">
                      {remoteBranchRefs.map(ref => <option key={ref.label} value={ref.label}>{ref.label}</option>)}
                    </optgroup>
                  ) : null}
                </select>
              </div>
              <div className="flex items-center gap-2">
                <input
                  type="text"
                  value={sourceControlNewBranchName}
                  onChange={(event) => setSourceControlNewBranchName(event.target.value)}
                  placeholder="New branch"
                  className="min-w-0 flex-1 rounded-md border border-white/10 bg-black/20 px-2 py-2 text-xs text-zinc-100 outline-none placeholder:text-zinc-600"
                />
                <button
                  type="button"
                  onClick={handleSourceControlCreateBranch}
                  disabled={!sourceControlNewBranchName.trim() || !isValidGitBranchName(sourceControlNewBranchName.trim())}
                  className="rounded-md bg-white/10 px-2 py-2 text-xs text-zinc-200 transition-colors hover:bg-white/15 disabled:cursor-not-allowed disabled:text-zinc-600"
                >
                  Create
                </button>
              </div>
            </div>

            <div className="space-y-2 border-t border-white/10 pt-3">
              <div className="text-[10px] font-medium uppercase tracking-wide text-zinc-500">Actions</div>
              <div className="space-y-3">
                {sourceControlGitActionGroups.map(group => (
                  <div key={group.title} className="space-y-1.5">
                    <div className="text-[10px] text-zinc-600">{group.title}</div>
                    <div className="grid grid-cols-3 gap-1.5">
                      {group.actions.map(action => (
                        <button
                          key={action.label}
                          type="button"
                          onClick={() => void action.run()}
                          disabled={action.disabled}
                          className="min-h-8 rounded-md bg-white/5 px-2 py-1.5 text-[11px] leading-tight text-zinc-300 transition-colors hover:bg-white/10 disabled:cursor-not-allowed disabled:text-zinc-600"
                        >
                          {action.label}
                        </button>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <div className="space-y-2 border-t border-white/10 pt-3">
              <div className="flex items-center justify-between gap-2">
                <div className="text-[10px] font-medium uppercase tracking-wide text-zinc-500">Changes</div>
                <div className="text-[10px] text-zinc-600">{gitChanges.length}</div>
              </div>
              {gitChanges.length === 0 ? (
                <div className="rounded-md border border-white/10 bg-white/5 px-3 py-2 text-xs text-zinc-500">Working tree clean.</div>
              ) : (
                <div className="space-y-1">
                  {gitChanges.map(change => (
                    <button
                      type="button"
                      key={`${change.kind}:${change.path}`}
                      onClick={() => {
                        const item = files.find(file => file.type === 'file' && normalizeProjectPath(getFsItemPath(files, file.id)) === change.path);
                        if (item) openEditorTab(item.id);
                      }}
                      className="flex w-full items-center gap-2 rounded-md bg-white/5 px-2 py-1.5 text-left text-xs text-zinc-300 transition-colors hover:bg-white/10"
                    >
                      <span className={cn(
                        "w-4 shrink-0 font-mono text-[10px]",
                        change.kind === 'added' ? "text-emerald-300" : change.kind === 'deleted' ? "text-red-300" : "text-amber-300"
                      )}>
                        {formatGitChangeKind(change.kind)}
                      </span>
                      <span className="min-w-0 flex-1 truncate">{change.path}</span>
                    </button>
                  ))}
                </div>
              )}
            </div>

            <div className="space-y-2 border-t border-white/10 pt-3">
              <div className="text-[10px] font-medium uppercase tracking-wide text-zinc-500">Repository Graph</div>
              {commits.length === 0 ? (
                <div className="rounded-md border border-white/10 bg-white/5 px-3 py-2 text-xs text-zinc-500">No commits yet.</div>
              ) : (
                <div className="space-y-2">
                  {commits.slice(0, 24).map(commit => {
                    const branchLabels = branchNames.filter(name => gitState.branches[name]?.head === commit.id);
                    const remoteLabels = Object.values(gitState.remotes).flatMap(remote => (
                      Object.entries(remote.branchHeads)
                        .filter(([, head]) => head === commit.id)
                        .map(([name]) => `${remote.name}/${name}`)
                    ));
                    return (
                      <div key={commit.id} className="relative rounded-md border border-white/10 bg-black/20 px-3 py-2">
                        <div className="flex items-start gap-2">
                          <GitCommitHorizontal size={14} className="mt-0.5 shrink-0 text-emerald-300" />
                          <div className="min-w-0 flex-1">
                            <div className="truncate text-xs text-zinc-200">{formatGitCommitLine(commit)}</div>
                            <div className="mt-1 text-[10px] text-zinc-500">{formatGitTimestamp(commit.timestamp)}</div>
                            {(branchLabels.length > 0 || remoteLabels.length > 0) && (
                              <div className="mt-2 flex flex-wrap gap-1">
                                {[...branchLabels, ...remoteLabels].map(label => (
                                  <span key={label} className="rounded bg-white/10 px-1.5 py-0.5 text-[10px] text-zinc-300">{label}</span>
                                ))}
                              </div>
                            )}
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            {sourceControlStatus && (
              <pre className="whitespace-pre-wrap rounded-md border border-white/10 bg-black/30 px-3 py-2 font-mono text-[11px] text-zinc-400">
                {sourceControlStatus}
              </pre>
            )}

            <div className="space-y-2 border-t border-white/10 pt-3">
              <div className="text-[10px] font-medium uppercase tracking-wide text-zinc-500">GitHub</div>
              <div className="flex items-center gap-2 rounded-md border border-white/10 bg-white/5 px-3 py-2 text-xs">
                <KeyRound size={13} className={gitState.ghAuth ? "text-emerald-300" : "text-zinc-600"} />
                <span className="min-w-0 flex-1 truncate">
                  {gitState.ghAuth ? `Logged in as ${gitState.ghAuth.user}` : 'Run gh auth login in Terminal'}
                </span>
              </div>
            </div>
          </div>
        </div>
      );
    }

    if (component === "explorer") {
      const contextMenuItem = fileTreeContextMenu?.itemId
        ? files.find(item => item.id === fileTreeContextMenu.itemId) || null
        : null;
      const contextMenuClipboardItem = fileTreeClipboardItemId
        ? files.find(item => item.id === fileTreeClipboardItemId) || null
        : null;
      const isRootContextMenu = fileTreeContextMenu?.itemId === null;
      const canPasteInContextMenu = !!contextMenuClipboardItem && (isRootContextMenu || contextMenuItem?.type === 'folder');
      const contextMenuPasteParentId = contextMenuItem?.type === 'folder' ? contextMenuItem.id : null;

      return (
        <FileTreeContext.Provider value={fileTreeCtx}>
          <div className="h-full w-full flex flex-col bg-[rgb(28,28,28)] text-zinc-300 border-white/10 relative">
            <div
              className="flex-1 overflow-y-auto custom-scrollbar"
              onDragOver={(e) => e.preventDefault()}
              onContextMenu={(e) => {
                e.preventDefault();
                openFileTreeContextMenu(null, e.clientX, e.clientY);
              }}
              onDrop={(e) => {
                e.preventDefault();
                if (hasFileDataTransferPayload(e.dataTransfer)) {
                  void importFilesFromDataTransfer(null, e.dataTransfer);
                  return;
                }
                handleDrop(null);
              }}
            >
              {[...files.filter(f => !f.parentId), ...(pendingNewItem && !pendingNewItem.parentId ? [pendingNewItem] : [])].map(item => (
                <FileTreeItem key={item.id} item={item} />
              ))}
            </div>
            {fileTreeContextMenu && (isRootContextMenu || contextMenuItem) && (
              <div
                className="fixed z-[80] w-44 rounded-lg border border-white/10 bg-zinc-950 py-1 shadow-2xl shadow-black/40"
                style={{ left: fileTreeContextMenu.x, top: fileTreeContextMenu.y }}
                onPointerDown={(e) => e.stopPropagation()}
                onContextMenu={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                }}
              >
                {isRootContextMenu ? (
                  <>
                    <button
                      type="button"
                      onClick={() => {
                        addNewItem('file', null, 'inline');
                        setFileTreeContextMenu(null);
                      }}
                      className="flex w-full items-center gap-2 px-3 py-2 text-left text-xs text-zinc-300 transition-colors hover:bg-white/10 hover:text-white"
                    >
                      <FilePlus size={14} className="text-indigo-400" />
                      <span>Create New File</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        addNewItem('folder', null, 'inline');
                        setFileTreeContextMenu(null);
                      }}
                      className="flex w-full items-center gap-2 px-3 py-2 text-left text-xs text-zinc-300 transition-colors hover:bg-white/10 hover:text-white"
                    >
                      <FolderPlus size={14} className="text-amber-400" />
                      <span>Create New Folder</span>
                    </button>
                  </>
                ) : contextMenuItem ? (
                  <>
                    <button
                      type="button"
                      onClick={() => {
                        setRenamingId(contextMenuItem.id);
                        setRenamingName(contextMenuItem.name);
                        setFileTreeContextMenu(null);
                      }}
                      className="flex w-full items-center gap-2 px-3 py-2 text-left text-xs text-zinc-300 transition-colors hover:bg-white/10 hover:text-white"
                    >
                      <Pencil size={14} className="text-zinc-500" />
                      <span>Rename</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        duplicateItem(contextMenuItem.id);
                        setFileTreeContextMenu(null);
                      }}
                      className="flex w-full items-center gap-2 px-3 py-2 text-left text-xs text-zinc-300 transition-colors hover:bg-white/10 hover:text-white"
                    >
                      <CopyPlus size={14} className="text-zinc-500" />
                      <span>Duplicate</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setFileTreeClipboardItemId(contextMenuItem.id);
                        setFileTreeContextMenu(null);
                      }}
                      className="flex w-full items-center gap-2 px-3 py-2 text-left text-xs text-zinc-300 transition-colors hover:bg-white/10 hover:text-white"
                    >
                      <Copy size={14} className="text-zinc-500" />
                      <span>Copy</span>
                    </button>
                  </>
                ) : null}
                {(isRootContextMenu || contextMenuItem?.type === 'folder') && (
                  <>
                    <div className="my-1 h-px bg-white/10" />
                    <button
                      type="button"
                      disabled={!canPasteInContextMenu}
                      onClick={() => {
                        if (!canPasteInContextMenu) return;
                        pasteFileTreeClipboardItem(contextMenuPasteParentId);
                        setFileTreeContextMenu(null);
                      }}
                      className={cn(
                        "flex w-full items-center gap-2 px-3 py-2 text-left text-xs transition-colors",
                        canPasteInContextMenu
                          ? "text-zinc-300 hover:bg-white/10 hover:text-white"
                          : "cursor-not-allowed text-zinc-600"
                      )}
                    >
                      <ClipboardPaste size={14} className={canPasteInContextMenu ? "text-zinc-500" : "text-zinc-700"} />
                      <span>Paste</span>
                    </button>
                  </>
                )}
                {contextMenuItem && (
                  <>
                    <div className="my-1 h-px bg-white/10" />
                    <button
                      type="button"
                      onClick={() => {
                        deleteItem(contextMenuItem.id);
                        setFileTreeContextMenu(null);
                      }}
                      className="flex w-full items-center gap-2 px-3 py-2 text-left text-xs text-red-300 transition-colors hover:bg-red-500/10 hover:text-red-200"
                    >
                      <Trash2 size={14} className="text-red-400" />
                      <span>Delete</span>
                    </button>
                  </>
                )}
              </div>
            )}
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
      const chatAttachments = assistantAttachmentsByChatId[chatId] || [];
      const chatAttachmentStatus = assistantAttachmentStatusByChatId[chatId] || '';
      const isChatLoading = loadingAssistantChatId === chatId;
      const isHistoryOpen = !!assistantHistoryOpenByChatId[chatId];
      const tokenEstimate = assistantTokenEstimates[chatId];
      const lastTurnUsage = assistantTurnUsageByChatId[chatId];
      const assistantStatusLabel = `${getAssistantProviderLabel(settings.assistantProvider)} · ${settings.assistantModel || 'No model selected'}`;
      const assistantCanUseDocumentationFirst =
        getAssistantSupportsLocalTools(settings.assistantProvider, settings.assistantModel.trim())
        && getSemanticDocumentationFiles().length > 0
        && !!semanticDocumentationVisibleRecord?.items.length;

      return (
        <div
          data-codecraft-ai-panel="true"
          className="h-full w-full bg-[rgb(28,28,28)] border-white/10 flex flex-col min-h-0 relative"
          onDragOver={(e) => {
            if (hasFileDataTransferPayload(e.dataTransfer) || Array.from(e.dataTransfer.types || []).includes('text/plain')) {
              e.preventDefault();
            }
          }}
          onDrop={(e) => {
            if (!hasFileDataTransferPayload(e.dataTransfer) && !Array.from(e.dataTransfer.types || []).includes('text/plain')) return;
            e.preventDefault();
            e.stopPropagation();
            void addAssistantAttachmentsFromDataTransfer(chatId, e.dataTransfer);
          }}
          onPaste={(e) => {
            if (!hasFileDataTransferPayload(e.clipboardData)) return;
            e.preventDefault();
            e.stopPropagation();
            void addAssistantAttachmentsFromDataTransfer(chatId, e.clipboardData);
          }}
        >
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
                Chain of Thought: {effectiveAssistantUseChainOfThought ? 'On' : 'Off'} · {assistantConfiguredApiKey ? 'API key ready' : `Add your ${getAssistantApiKeyLabel(settings.assistantProvider)} in Settings`}
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
            {!assistantConfiguredApiKey && (
              <div className="mb-3 rounded-xl border border-amber-500/20 bg-amber-500/10 px-3 py-2 text-[11px] text-amber-200">
                Add your {getAssistantApiKeyLabel(settings.assistantProvider)} in Settings to send requests.
              </div>
            )}
            {(chatAttachments.length > 0 || chatAttachmentStatus) && (
              <div className="mb-3 rounded-xl border border-white/10 bg-white/5 px-3 py-2">
                {chatAttachments.length > 0 && (
                  <div className="flex items-center justify-between gap-3">
                    <div className="text-[10px] font-medium uppercase tracking-wide text-zinc-500">
                      Files to send ({chatAttachments.length})
                    </div>
                    <button
                      type="button"
                      onClick={() => clearAssistantAttachments(chatId)}
                      className="text-[10px] text-zinc-500 transition-colors hover:text-white"
                    >
                      Clear
                    </button>
                  </div>
                )}
                {chatAttachments.length > 0 && (
                  <div className="mt-2 max-h-24 space-y-1 overflow-y-auto custom-scrollbar pr-1">
                    {chatAttachments.map(file => (
                      <div key={file.id} className="flex items-center gap-2 rounded-lg bg-black/20 px-2 py-1.5">
                        <FileTypeIcon path={file.path} size={13} className={file.source === 'upload' ? "opacity-90" : undefined} />
                        <span className="min-w-0 flex-1 truncate text-[11px] text-zinc-300">{file.path}</span>
                        <button
                          type="button"
                          onClick={() => removeAssistantAttachment(chatId, file.id)}
                          className="shrink-0 rounded p-0.5 text-zinc-600 transition-colors hover:bg-white/10 hover:text-white"
                          title="Remove"
                        >
                          <X size={12} />
                        </button>
                      </div>
                    ))}
                  </div>
                )}
                {chatAttachmentStatus && (
                  <div className={cn("text-[10px] text-zinc-500", chatAttachments.length > 0 && "mt-2")}>
                    {chatAttachmentStatus}
                  </div>
                )}
              </div>
            )}
            <div className="relative flex flex-col gap-2">
              {assistantCanUseDocumentationFirst && (
                <label className="flex items-start gap-2 rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-left">
                  <input
                    type="checkbox"
                    checked={!!assistantDocumentationLookupByChatId[chatId]}
                    onChange={(event) => setAssistantDocumentationLookupByChatId(prev => ({
                      ...prev,
                      [chatId]: event.target.checked,
                    }))}
                    className="mt-0.5 h-4 w-4 rounded border-white/20 bg-black/30 accent-indigo-500"
                  />
                  <span className="min-w-0">
                    <span className="block text-xs font-medium text-zinc-200">Look at C# docs first</span>
                    <span className="block text-[10px] text-zinc-500">
                      Runs `docs find --hide-reason`, then `codin get` for the selected symbol.
                    </span>
                  </span>
                </label>
              )}
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
                disabled={(!chatInput.trim() && chatAttachments.length === 0) || isChatLoading || !assistantConfiguredApiKey}
                className="absolute right-2 bottom-2 p-2 text-indigo-400 hover:text-indigo-300 disabled:text-zinc-600 transition-colors"
              >
                <ChevronRight size={20} />
              </button>
            </div>
            {settings.assistantShowUsagePopup && (chatInput.trim() || chatAttachments.length > 0 || lastTurnUsage) && (
              <div className="mt-3 grid grid-cols-1 gap-2">
                {(chatInput.trim() || chatAttachments.length > 0) && tokenEstimate && (
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

  const getDockTabIcon = (node: any, component?: string) => {
    if (component === 'editor') {
      const itemId = typeof node.getConfig === 'function' ? node.getConfig()?.itemId : undefined;
      const item = typeof itemId === 'string' ? files.find(candidate => candidate.id === itemId) : null;
      if (item?.type === 'file') return <FileTypeIcon path={item.name} language={item.language} size={14} />;
      if (item?.type === 'folder') return <Folder size={14} className="text-amber-400" />;
    }
    if (component === 'explorer') return <Folder size={14} />;
    if (component === 'sourceControl') return <GitBranch size={14} />;
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
        {getDockTabIcon(node, component)}
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
        <header className="h-12 border-b border-white/10 bg-[rgb(28,28,28)] flex items-center justify-between gap-3 px-3 shrink-0 w-full z-10">
          <div className="flex min-w-0 flex-1 items-center gap-1 overflow-hidden">
            {/* Logo */}
            <div className="flex items-center gap-2 font-semibold text-white shrink-0 pr-2">
              <img src={coinstantLogo} alt="<cod/in> logo" className="w-6 h-6 rounded-md object-cover" />
              <span className="text-sm tracking-wide hidden sm:inline-block text-zinc-100">{'<cod/in>'}</span>
            </div>

            <Separator.Root orientation="vertical" className="h-5 w-px bg-zinc-800 mx-1 shrink-0" />

            {/* Breadcrumbs */}
            <nav
              aria-label="Current path"
              title={activePathLabel}
              className="flex min-w-0 flex-1 items-center gap-1 overflow-hidden text-xs text-zinc-500"
            >
              <button
                type="button"
                onClick={() => setActiveFileId('')}
                className="max-w-28 shrink-0 truncate rounded px-1 py-0.5 text-zinc-500 transition-colors hover:bg-white/5 hover:text-zinc-200"
              >
                Workspace
              </button>
              {activePathSegments.length > 0 ? (
                activePathSegments.map((segment, index) => {
                  const isLast = index === activePathSegments.length - 1;
                  const segmentPath = activePathSegments.slice(0, index + 1).join('/');
                  return (
                    <React.Fragment key={segmentPath}>
                      <ChevronRight
                        size={12}
                        className={cn("shrink-0 text-zinc-700", !isLast && "hidden md:block")}
                      />
                      <span
                        className={cn(
                          "min-w-0 truncate rounded px-1 py-0.5",
                          isLast
                            ? "flex-1 text-zinc-200"
                            : "hidden max-w-24 shrink-0 text-zinc-500 md:inline"
                        )}
                      >
                        {segment}
                      </span>
                    </React.Fragment>
                  );
                })
              ) : (
                <>
                  <ChevronRight size={12} className="shrink-0 text-zinc-700" />
                  <span className="min-w-0 flex-1 truncate px-1 py-0.5 text-zinc-600">
                    No selection
                  </span>
                </>
              )}
            </nav>
          </div>

          {/* Right Actions */}
          <div className="flex items-center gap-1 shrink-0">
            <input
              ref={projectDataImportInputRef}
              type="file"
              accept="application/json,.json"
              className="hidden"
              onChange={handleImportProjectDataFile}
            />
            <Tooltip.Root>
              <Tooltip.Trigger asChild>
                <button
                  ref={searchButtonRef}
                  type="button"
                  onClick={() => setIsSearchOpen(open => !open)}
                  className={cn(
                    "inline-flex items-center justify-center h-8 w-8 rounded-md transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-zinc-600",
                    isSearchOpen
                      ? "bg-zinc-800 text-zinc-100"
                      : "text-zinc-400 hover:text-zinc-100 hover:bg-zinc-800"
                  )}
                  aria-label="Search"
                >
                  <Search size={16} />
                </button>
              </Tooltip.Trigger>
              <Tooltip.Portal>
                <Tooltip.Content sideOffset={6} className="z-50 overflow-hidden rounded-md bg-zinc-900 border border-zinc-700 px-3 py-1.5 text-xs text-zinc-200 shadow-md animate-in fade-in-0 zoom-in-95 data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=closed]:zoom-out-95">
                  Search
                  <Tooltip.Arrow className="fill-zinc-700" />
                </Tooltip.Content>
              </Tooltip.Portal>
            </Tooltip.Root>
            <div className="relative">
              <Tooltip.Root>
                <Tooltip.Trigger asChild>
                  <button
                    type="button"
                    onClick={() => setIsProjectMenuOpen(open => !open)}
                    className="inline-flex h-8 w-8 items-center justify-center gap-1.5 rounded-md border border-zinc-800 px-0 text-xs text-zinc-300 transition-colors hover:bg-zinc-800 hover:text-zinc-100 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-zinc-600 md:w-auto md:max-w-[180px] md:justify-start md:px-2.5"
                  >
                    <Folder size={14} className="shrink-0 text-amber-400" />
                    <span className="hidden truncate md:inline">{activeProject.name}</span>
                    <ChevronDown size={12} className="hidden shrink-0 text-zinc-500 md:block" />
                  </button>
                </Tooltip.Trigger>
                <Tooltip.Portal>
                  <Tooltip.Content sideOffset={6} className="z-50 overflow-hidden rounded-md bg-zinc-900 border border-zinc-700 px-3 py-1.5 text-xs text-zinc-200 shadow-md animate-in fade-in-0 zoom-in-95 data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=closed]:zoom-out-95">
                    Projects
                    <Tooltip.Arrow className="fill-zinc-700" />
                  </Tooltip.Content>
                </Tooltip.Portal>
              </Tooltip.Root>

              {isProjectMenuOpen && (
                <div className="absolute right-0 top-10 z-50 w-80 max-w-[calc(100vw-1rem)] rounded-xl border border-white/10 bg-zinc-950 shadow-2xl overflow-hidden">
                  <div className="px-3 py-2 border-b border-white/10">
                    <div className="text-[11px] font-semibold uppercase tracking-wide text-zinc-500">Projects</div>
                    {projectMenuStatus ? (
                      <div className="mt-1 text-[10px] text-zinc-400">{projectMenuStatus}</div>
                    ) : null}
                  </div>
                  <div className="max-h-64 overflow-y-auto p-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
                    {projects.map(project => {
                      const isRenamingProject = renamingProjectId === project.id;
                      return (
                        <div
                          key={project.id}
                          className={cn(
                            "group mb-1 flex items-stretch rounded-lg transition-colors last:mb-0",
                            project.id === activeProjectId
                              ? "bg-indigo-500/15 text-indigo-200"
                              : "text-zinc-300 hover:bg-white/5 hover:text-white"
                          )}
                        >
                          {isRenamingProject ? (
                            <div className="min-w-0 flex-1 px-3 py-2">
                              <div className="flex items-center gap-2">
                                <Folder size={14} className="shrink-0 text-amber-400" />
                                <input
                                  autoFocus
                                  type="text"
                                  value={renamingProjectName}
                                  onChange={(e) => setRenamingProjectName(e.target.value)}
                                  onBlur={confirmRenamingProject}
                                  onKeyDown={(e) => {
                                    if (e.key === 'Enter') confirmRenamingProject();
                                    if (e.key === 'Escape') cancelRenamingProject();
                                  }}
                                  className="min-w-0 flex-1 rounded border border-indigo-500/50 bg-black/30 px-2 py-1 text-sm text-white outline-none"
                                />
                              </div>
                              <div className="mt-1 pl-6 text-[10px] text-zinc-500">
                                Updated {new Date(project.updatedAt).toLocaleDateString()}
                              </div>
                            </div>
                          ) : (
                            <button
                              type="button"
                              onClick={() => switchProject(project.id)}
                              className="min-w-0 flex-1 px-3 py-2 text-left"
                            >
                              <div className="flex items-center gap-2">
                                <Folder size={14} className="shrink-0 text-amber-400" />
                                <span className="min-w-0 truncate text-sm">{project.name}</span>
                              </div>
                              <div className="mt-1 text-[10px] text-zinc-500">
                                Updated {new Date(project.updatedAt).toLocaleDateString()}
                              </div>
                            </button>
                          )}
                          <div className="flex shrink-0 items-start gap-1 py-2 pr-2 opacity-100 transition-opacity sm:opacity-0 sm:group-hover:opacity-100">
                            {isRenamingProject ? (
                              <>
                                <button
                                  type="button"
                                  title="Save project name"
                                  onMouseDown={(e) => e.preventDefault()}
                                  onClick={confirmRenamingProject}
                                  className="rounded-md p-1 text-emerald-300 transition-colors hover:bg-emerald-500/10 hover:text-emerald-200"
                                >
                                  <Check size={14} />
                                </button>
                                <button
                                  type="button"
                                  title="Cancel rename"
                                  onMouseDown={(e) => e.preventDefault()}
                                  onClick={cancelRenamingProject}
                                  className="rounded-md p-1 text-zinc-500 transition-colors hover:bg-white/10 hover:text-zinc-200"
                                >
                                  <X size={14} />
                                </button>
                              </>
                            ) : (
                              <>
                                <button
                                  type="button"
                                  title="Rename project"
                                  onClick={() => startRenamingProject(project)}
                                  className="rounded-md p-1 text-zinc-500 transition-colors hover:bg-white/10 hover:text-zinc-200"
                                >
                                  <Pencil size={14} />
                                </button>
                                <button
                                  type="button"
                                  title="Delete project"
                                  disabled={projects.length <= 1}
                                  onClick={() => void handleDeleteProject(project.id)}
                                  className={cn(
                                    "rounded-md p-1 transition-colors",
                                    projects.length <= 1
                                      ? "cursor-not-allowed text-zinc-700"
                                      : "text-zinc-500 hover:bg-red-500/10 hover:text-red-300"
                                  )}
                                >
                                  <Trash2 size={14} />
                                </button>
                              </>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                  <div className="grid grid-cols-2 gap-2 border-t border-white/10 p-2">
                    <button
                      type="button"
                      onClick={handleCreateProject}
                      className="inline-flex items-center justify-center gap-1.5 rounded-lg bg-white/5 px-3 py-2 text-xs text-zinc-200 hover:bg-white/10 transition-colors"
                    >
                      <FolderPlus size={14} />
                      New
                    </button>
                    <button
                      type="button"
                      onClick={() => projectDataImportInputRef.current?.click()}
                      className="inline-flex items-center justify-center gap-1.5 rounded-lg bg-white/5 px-3 py-2 text-xs text-zinc-200 hover:bg-white/10 transition-colors"
                    >
                      <Upload size={14} />
                      Import
                    </button>
                  </div>
                </div>
              )}
            </div>

            <button
              onClick={handleRun}
              disabled={!canRunCurrentFile}
              className={cn(
                "inline-flex h-8 w-8 items-center justify-center gap-1.5 rounded-md px-0 text-xs font-medium transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-emerald-600 md:w-auto md:px-3",
                !canRunCurrentFile
                  ? "border border-zinc-800 text-zinc-600 cursor-not-allowed"
                  : "bg-emerald-700 hover:bg-emerald-600 text-white border border-emerald-600"
              )}
            >
              {isRunning ? <Cpu className="animate-spin" size={13} /> : <Play size={13} />}
              <span className="hidden md:inline">Run</span>
            </button>

            <button
              onClick={handleProjectRun}
              disabled={!canRunProject}
              className={cn(
                "inline-flex h-8 w-8 items-center justify-center gap-1.5 rounded-md px-0 text-xs font-medium transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-indigo-600 md:w-auto md:px-3",
                !canRunProject
                  ? "border border-zinc-800 text-zinc-600 cursor-not-allowed"
                  : "bg-indigo-700 hover:bg-indigo-600 text-white border border-indigo-600"
              )}
            >
              {isRunning ? <Cpu className="animate-spin" size={13} /> : <Folder size={13} />}
              <span className="hidden md:inline">Project Run</span>
            </button>

            <Separator.Root orientation="vertical" className="h-5 w-px bg-zinc-800 mx-2 shrink-0" />

            <Tooltip.Root>
              <Tooltip.Trigger asChild>
                <button
                  onClick={() => setIsSemanticDocumentationOpen(true)}
                  aria-label="Semantic Documentation"
                  className={cn(
                    "inline-flex items-center justify-center h-8 w-8 rounded-md transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-zinc-600",
                    semanticDocumentationDraft
                      ? "text-amber-300 hover:text-amber-200 hover:bg-zinc-800"
                      : semanticDocumentationActive
                        ? "text-emerald-300 hover:text-emerald-200 hover:bg-zinc-800"
                        : "text-zinc-400 hover:text-zinc-100 hover:bg-zinc-800"
                  )}
                >
                  <FileText size={16} />
                </button>
              </Tooltip.Trigger>
              <Tooltip.Portal>
                <Tooltip.Content sideOffset={6} className="z-50 overflow-hidden rounded-md bg-zinc-900 border border-zinc-700 px-3 py-1.5 text-xs text-zinc-200 shadow-md animate-in fade-in-0 zoom-in-95 data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=closed]:zoom-out-95">
                  Semantic Documentation
                  <Tooltip.Arrow className="fill-zinc-700" />
                </Tooltip.Content>
              </Tooltip.Portal>
            </Tooltip.Root>

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

      <AnimatePresence>
        {isSearchOpen && (
          <motion.div
            ref={searchPanelRef}
            initial={{ opacity: 0, y: -8, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -8, scale: 0.98 }}
            transition={{ duration: 0.12 }}
            className="fixed right-3 top-14 z-50 w-[min(42rem,calc(100vw-1.5rem))] overflow-hidden rounded-xl border border-white/10 bg-zinc-950 shadow-2xl"
          >
            <div className="flex h-12 items-center gap-3 border-b border-white/10 px-3">
              <Search size={16} className="shrink-0 text-zinc-500" />
              <input
                ref={searchInputRef}
                type="text"
                value={searchQuery}
                onChange={(event) => setSearchQuery(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === 'Enter' && searchResults[0]) {
                    event.preventDefault();
                    openSearchResult(searchResults[0]);
                  }
                  if (event.key === 'Escape') {
                    event.preventDefault();
                    setIsSearchOpen(false);
                  }
                }}
                placeholder="Search"
                className="min-w-0 flex-1 bg-transparent text-sm text-white outline-none placeholder:text-zinc-600"
              />
              {searchQuery ? (
                <button
                  type="button"
                  onClick={() => {
                    setSearchQuery('');
                    searchInputRef.current?.focus();
                  }}
                  className="rounded-md p-1 text-zinc-500 transition-colors hover:bg-white/10 hover:text-zinc-200"
                  aria-label="Clear search"
                >
                  <X size={14} />
                </button>
              ) : null}
            </div>

            <div className="max-h-[min(30rem,calc(100vh-8rem))] overflow-y-auto p-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
              {!searchQuery.trim() ? (
                <div className="px-3 py-8 text-center text-sm text-zinc-500">No query</div>
              ) : searchResults.length === 0 ? (
                <div className="px-3 py-8 text-center text-sm text-zinc-500">No matches</div>
              ) : (
                <>
                  {searchResults.map(result => {
                    const matchStart = Math.max(0, Math.min(result.previewMatchStart, result.preview.length));
                    const matchEnd = Math.max(matchStart, Math.min(matchStart + result.matchLength, result.preview.length));
                    const beforeMatch = result.preview.slice(0, matchStart);
                    const matchedText = result.preview.slice(matchStart, matchEnd);
                    const afterMatch = result.preview.slice(matchEnd);

                    return (
                      <button
                        key={result.id}
                        type="button"
                        onClick={() => openSearchResult(result)}
                        className="group mb-1 w-full rounded-lg px-3 py-2 text-left transition-colors last:mb-0 hover:bg-white/5 focus-visible:bg-white/5 focus-visible:outline-none"
                      >
                        <div className="flex items-center gap-2 text-xs">
                          <FileTypeIcon path={result.path} size={13} />
                          <span className="min-w-0 flex-1 truncate text-zinc-300 group-hover:text-white">{result.path}</span>
                          <span className="shrink-0 font-mono text-[10px] text-zinc-600">
                            {result.kind === 'content' ? `${result.lineNumber}:${result.column}` : 'file'}
                          </span>
                        </div>
                        <div className="mt-1 truncate pl-5 font-mono text-[11px] leading-5 text-zinc-500">
                          {beforeMatch}
                          <span className="rounded bg-indigo-500/20 px-0.5 text-indigo-200">{matchedText}</span>
                          {afterMatch}
                        </div>
                      </button>
                    );
                  })}
                  {searchResults.length >= 300 ? (
                    <div className="px-3 py-2 text-center text-[11px] text-zinc-600">Showing first 300 matches</div>
                  ) : null}
                </>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>

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

      {isSemanticDocumentationOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm">
          <motion.div
            initial={{ opacity: 0, scale: 0.98 }}
            animate={{ opacity: 1, scale: 1 }}
            className="flex h-[min(780px,90vh)] w-full max-w-6xl flex-col overflow-hidden rounded-2xl border border-white/10 bg-[rgb(28,28,28)] shadow-2xl"
          >
            <div className="flex items-center justify-between gap-4 border-b border-white/10 px-5 py-4">
              <div className="min-w-0">
                <div className="flex items-center gap-2 text-lg font-semibold text-white">
                  <FileText size={20} className="text-emerald-300" />
                  Semantic Documentation
                </div>
                <div className="mt-1 truncate text-xs text-zinc-500">
                  C# only for now · {getAssistantProviderLabel(settings.assistantProvider)} · {effectiveAutoDocumentationModel || 'No autodocumentation model'}
                </div>
              </div>
              <div className="flex shrink-0 items-center gap-2">
                {isSemanticDocumentationRunning ? (
                  <button
                    type="button"
                    onClick={pauseSemanticDocumentationGeneration}
                    className="inline-flex items-center gap-1.5 rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-xs font-medium text-amber-200 transition-colors hover:bg-amber-500/20"
                  >
                    <RefreshCw size={14} className="animate-spin" />
                    Pause
                  </button>
                ) : (
                  <>
                    <button
                      type="button"
                      onClick={() => void startSemanticDocumentationGeneration(false)}
                      className="inline-flex items-center gap-1.5 rounded-lg border border-emerald-500/30 bg-emerald-600 px-3 py-2 text-xs font-medium text-white transition-colors hover:bg-emerald-500"
                    >
                      <Play size={14} />
                      {semanticDocumentationDraft ? 'Resume' : semanticDocumentationActive ? 'Start New Draft' : 'Start'}
                    </button>
                    <button
                      type="button"
                      onClick={() => void startSemanticDocumentationGeneration(true)}
                      className="inline-flex items-center gap-1.5 rounded-lg border border-indigo-500/30 bg-indigo-600 px-3 py-2 text-xs font-medium text-white transition-colors hover:bg-indigo-500"
                    >
                      <RefreshCw size={14} />
                      Regenerate
                    </button>
                    <button
                      type="button"
                      disabled={!semanticDocumentationDraft}
                      onClick={() => void discardSemanticDocumentationDraft()}
                      className="inline-flex items-center gap-1.5 rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-xs font-medium text-zinc-300 transition-colors hover:bg-white/10 disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      <Trash2 size={14} />
                      Discard Draft
                    </button>
                  </>
                )}
                <button
                  type="button"
                  onClick={() => setIsSemanticDocumentationOpen(false)}
                  aria-label="Close semantic documentation"
                  className="rounded-lg p-2 text-zinc-500 transition-colors hover:bg-white/10 hover:text-white"
                >
                  <X size={18} />
                </button>
              </div>
            </div>

            <div className="grid grid-cols-1 gap-3 border-b border-white/10 px-5 py-3 text-xs md:grid-cols-3">
              <div className="rounded-xl border border-white/10 bg-white/5 px-3 py-2">
                <div className="text-[10px] uppercase tracking-wide text-zinc-500">Active</div>
                <div className="mt-1 text-zinc-200">{getSemanticDocumentationProgressLabel(semanticDocumentationActive)}</div>
                <div className="mt-1 text-[10px] text-zinc-500">
                  Updated {formatSemanticDocumentationTimestamp(semanticDocumentationActive?.updatedAt)}
                </div>
              </div>
              <div className="rounded-xl border border-white/10 bg-white/5 px-3 py-2">
                <div className="text-[10px] uppercase tracking-wide text-zinc-500">Draft</div>
                <div className="mt-1 text-zinc-200">{getSemanticDocumentationProgressLabel(semanticDocumentationDraft)}</div>
                <div className="mt-1 text-[10px] text-zinc-500">
                  Active docs stay visible until a draft completes.
                </div>
              </div>
              <div className="rounded-xl border border-white/10 bg-white/5 px-3 py-2">
                <div className="text-[10px] uppercase tracking-wide text-zinc-500">Status</div>
                <div className="mt-1 text-zinc-200">{semanticDocumentationMessage || 'Idle'}</div>
                <div className="mt-1 text-[10px] text-zinc-500">
                  Prompt limit {effectiveAutoDocumentationPromptTokenLimit > 0 ? effectiveAutoDocumentationPromptTokenLimit.toLocaleString() : 'unlimited'}
                </div>
              </div>
            </div>

            <div className="min-h-0 flex-1 grid grid-cols-1 md:grid-cols-[280px_minmax(0,1fr)]">
              <div className="min-h-0 border-r border-white/10">
                <div className="border-b border-white/10 px-3 py-2 text-[10px] font-medium uppercase tracking-wide text-zinc-500">
                  Items ({semanticDocumentationVisibleRecord?.items.length || 0})
                </div>
                <div className="max-h-full overflow-y-auto p-2 custom-scrollbar">
                  {semanticDocumentationVisibleRecord?.items.length ? (
                    semanticDocumentationVisibleRecord.items.map(item => (
                      <button
                        key={item.id}
                        type="button"
                        onClick={() => setSemanticDocumentationSelectedItemId(item.id)}
                        className={cn(
                          "mb-1 w-full rounded-lg border px-2 py-2 text-left transition-colors last:mb-0",
                          semanticDocumentationSelectedItem?.id === item.id
                            ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-100"
                            : "border-white/10 bg-white/5 text-zinc-300 hover:bg-white/10 hover:text-white"
                        )}
                      >
                        <div className="flex items-center justify-between gap-2">
                          <span className="min-w-0 truncate text-xs font-medium">
                            {item.containerName ? `${item.containerName}.` : ''}{item.name}
                          </span>
                          <span className="shrink-0 rounded bg-black/30 px-1.5 py-0.5 text-[10px] text-zinc-500">
                            {item.kind}
                          </span>
                        </div>
                        <div className="mt-1 truncate text-[10px] text-zinc-500">{item.path}</div>
                      </button>
                    ))
                  ) : (
                    <div className="px-3 py-8 text-center text-sm text-zinc-500">
                      No semantic documentation yet.
                    </div>
                  )}
                </div>
              </div>

              <div className="min-h-0 overflow-y-auto p-5 custom-scrollbar">
                {semanticDocumentationSelectedItem ? (
                  <div className="mx-auto max-w-4xl">
                    <div className="mb-4">
                      <div className="flex flex-wrap items-center gap-2 text-xs text-zinc-500">
                        <span>{semanticDocumentationSelectedItem.kind}</span>
                        <span>·</span>
                        <span>{semanticDocumentationSelectedItem.path}</span>
                        <span>·</span>
                        <span>{formatSemanticDocumentationTimestamp(semanticDocumentationSelectedItem.generatedAt)}</span>
                      </div>
                      <h3 className="mt-2 text-xl font-semibold text-white">
                        {semanticDocumentationSelectedItem.containerName ? `${semanticDocumentationSelectedItem.containerName}.` : ''}{semanticDocumentationSelectedItem.name}
                      </h3>
                    </div>
                    <div className="rounded-xl border border-white/10 bg-black/20 p-4 prose prose-invert prose-sm max-w-none text-zinc-300">
                      <ReactMarkdown
                        components={{
                          code({ node, inline, className, children, ...props }: any) {
                            return (
                              <code
                                className={cn(
                                  "rounded bg-black/40 px-1.5 py-0.5 font-mono text-xs text-emerald-200",
                                  !inline && "block overflow-x-auto border border-white/10 p-3",
                                  className
                                )}
                                {...props}
                              >
                                {children}
                              </code>
                            );
                          }
                        }}
                      >
                        {semanticDocumentationSelectedItem.documentation}
                      </ReactMarkdown>
                    </div>
                  </div>
                ) : (
                  <div className="flex h-full items-center justify-center text-sm text-zinc-500">
                    Start semantic documentation generation to populate this view.
                  </div>
                )}
              </div>
            </div>
          </motion.div>
        </div>
      )}

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
                              autoDocumentationModel: getAssistantDefaultModel(nextProvider),
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

                    <div className="space-y-2">
                      <div className="text-xs font-medium uppercase tracking-wide text-zinc-500">
                        {getAssistantApiKeyLabel(settings.assistantProvider)}
                      </div>
                      <div className="flex items-stretch gap-2">
                        <input
                          type={showAssistantApiKey ? 'text' : 'password'}
                          value={settings.assistantApiKey}
                          onChange={(e) => setSettings(current => ({ ...current, assistantApiKey: e.target.value }))}
                          placeholder={`Paste your ${getAssistantApiKeyLabel(settings.assistantProvider).toLowerCase()}`}
                          className="flex-1 rounded-xl border border-white/10 bg-black/20 px-3 py-2 text-sm text-white outline-none transition-colors focus:border-indigo-500"
                        />
                        <button
                          type="button"
                          onClick={() => setShowAssistantApiKey(value => !value)}
                          className="px-3 rounded-xl border border-white/10 bg-black/20 text-xs text-zinc-300 hover:bg-white/5 transition-colors"
                        >
                          {showAssistantApiKey ? 'Hide' : 'Show'}
                        </button>
                      </div>
                      <div className="text-xs text-zinc-500">
                        This key is used from the settings input instead of `.env`, and it stays in this browser’s local storage.
                      </div>
                    </div>

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
                        max={MAX_ASSISTANT_CHAIN_OF_THOUGHT_DEPTH}
                        step={1}
                        value={settings.assistantMaxChainOfThoughtDepth}
                        onChange={(e) => setSettings(current => ({
                          ...current,
                          assistantMaxChainOfThoughtDepth: normalizeAssistantMaxChainOfThoughtDepth(Number(e.target.value)),
                        }))}
                        className="w-full rounded-xl border border-white/10 bg-black/20 px-3 py-2 text-sm text-white outline-none transition-colors focus:border-indigo-500"
                      />
                      <div className="text-xs text-zinc-500">
                        Limits Chain of Thought tool rounds per assistant turn. Range: 1 to {MAX_ASSISTANT_CHAIN_OF_THOUGHT_DEPTH}. Current effective limit: {effectiveAssistantMaxChainOfThoughtDepth}.
                      </div>
                    </label>

                    <label className="block space-y-2">
                      <div className="text-xs font-medium uppercase tracking-wide text-zinc-500">Assistant Request Rate Limit</div>
                      <input
                        type="number"
                        min={0}
                        max={MAX_ASSISTANT_REQUEST_RATE_LIMIT_PER_MINUTE}
                        step={1}
                        value={settings.assistantRequestRateLimitPerMinute}
                        onChange={(e) => setSettings(current => ({
                          ...current,
                          assistantRequestRateLimitPerMinute: normalizeAssistantRequestRateLimitPerMinute(Number(e.target.value)),
                        }))}
                        className="w-full rounded-xl border border-white/10 bg-black/20 px-3 py-2 text-sm text-white outline-none transition-colors focus:border-indigo-500"
                      />
                      <div className="text-xs text-zinc-500">
                        Limits outbound assistant provider requests per minute across all providers and reasoning modes. Use 0 for unlimited; when the limit is reached, CodeCraft waits and then continues automatically. Current effective rate: {effectiveAssistantRequestRateLimitPerMinute > 0 ? `${effectiveAssistantRequestRateLimitPerMinute}/min` : 'Unlimited'}.
                      </div>
                    </label>
                  </div>
                </section>

                <section>
                  <h4 className="text-xs font-bold uppercase tracking-widest text-zinc-500 mb-4">Semantic Documentation</h4>
                  <div className="rounded-2xl border border-white/10 bg-white/5 p-4 space-y-4">
                    <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)] gap-4">
                      <label className="block space-y-2">
                        <div className="text-xs font-medium uppercase tracking-wide text-zinc-500">Autodocumentation Model</div>
                        <input
                          list="auto-documentation-model-options"
                          value={settings.autoDocumentationModel}
                          onChange={(e) => setSettings(current => ({ ...current, autoDocumentationModel: e.target.value }))}
                          placeholder="Enter or choose a model"
                          className="w-full rounded-xl border border-white/10 bg-black/20 px-3 py-2 text-sm text-white outline-none transition-colors focus:border-indigo-500"
                        />
                        <datalist id="auto-documentation-model-options">
                          {ASSISTANT_MODEL_PRESETS[settings.assistantProvider].map(option => (
                            <option key={option.id} value={option.id}>{option.label}</option>
                          ))}
                        </datalist>
                        <div className="text-xs text-zinc-500">
                          Uses the selected AI provider API key, but this model is separate from the chat assistant model.
                        </div>
                      </label>

                      <label className="block space-y-2">
                        <div className="text-xs font-medium uppercase tracking-wide text-zinc-500">Entry Point Class</div>
                        <input
                          value={settings.autoDocumentationEntryPoint}
                          onChange={(e) => setSettings(current => ({ ...current, autoDocumentationEntryPoint: e.target.value }))}
                          placeholder="Program"
                          className="w-full rounded-xl border border-white/10 bg-black/20 px-3 py-2 text-sm text-white outline-none transition-colors focus:border-indigo-500"
                        />
                        <div className="text-xs text-zinc-500">
                          Stage 3 starts from this C# class. If it is not found, CodeCraft falls back to a class containing `Main`, then the first discovered type.
                        </div>
                      </label>
                    </div>

                    <label className="block space-y-2">
                      <div className="text-xs font-medium uppercase tracking-wide text-zinc-500">Per-Prompt Token Limit</div>
                      <input
                        type="number"
                        min={0}
                        max={MAX_AUTO_DOCUMENTATION_PROMPT_TOKEN_LIMIT}
                        step={1024}
                        value={settings.autoDocumentationPromptTokenLimit}
                        onChange={(e) => setSettings(current => ({
                          ...current,
                          autoDocumentationPromptTokenLimit: normalizeAutoDocumentationPromptTokenLimit(Number(e.target.value)),
                        }))}
                        className="w-full rounded-xl border border-white/10 bg-black/20 px-3 py-2 text-sm text-white outline-none transition-colors focus:border-indigo-500"
                      />
                      <div className="text-xs text-zinc-500">
                        Current effective limit: {effectiveAutoDocumentationPromptTokenLimit > 0 ? `${effectiveAutoDocumentationPromptTokenLimit.toLocaleString()} tokens` : 'Unlimited'}. Use 0 for virtually unlimited prompts.
                      </div>
                    </label>

                    <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)] gap-4">
                      <label className="block space-y-2">
                        <div className="text-xs font-medium uppercase tracking-wide text-zinc-500">Docs Find Type Matches</div>
                        <input
                          type="number"
                          min={1}
                          max={MAX_DOCS_FIND_TYPE_MATCH_COUNT}
                          step={1}
                          value={settings.docsFindTypeMatchCount}
                          onChange={(e) => setSettings(current => ({
                            ...current,
                            docsFindTypeMatchCount: normalizeDocsFindTypeMatchCount(Number(e.target.value)),
                          }))}
                          className="w-full rounded-xl border border-white/10 bg-black/20 px-3 py-2 text-sm text-white outline-none transition-colors focus:border-indigo-500"
                        />
                        <div className="text-xs text-zinc-500">
                          Stage 1 selects this many classes, structs, enums, interfaces, records, and similar types. Current: {normalizeDocsFindTypeMatchCount(settings.docsFindTypeMatchCount)}.
                        </div>
                      </label>

                      <label className="block space-y-2">
                        <div className="text-xs font-medium uppercase tracking-wide text-zinc-500">Docs Find Member Matches</div>
                        <input
                          type="number"
                          min={1}
                          max={MAX_DOCS_FIND_MEMBER_MATCH_COUNT}
                          step={1}
                          value={settings.docsFindMemberMatchCount}
                          onChange={(e) => setSettings(current => ({
                            ...current,
                            docsFindMemberMatchCount: normalizeDocsFindMemberMatchCount(Number(e.target.value)),
                          }))}
                          className="w-full rounded-xl border border-white/10 bg-black/20 px-3 py-2 text-sm text-white outline-none transition-colors focus:border-indigo-500"
                        />
                        <div className="text-xs text-zinc-500">
                          Stage 2 outputs this many fields, properties, methods, accessors, and similar members. Current: {normalizeDocsFindMemberMatchCount(settings.docsFindMemberMatchCount)}.
                        </div>
                      </label>
                    </div>

                    <div className="flex items-center justify-between gap-4 rounded-xl border border-white/10 bg-black/20 px-4 py-3">
                      <div>
                        <div className="text-sm font-medium text-white">Include Accessor Docs</div>
                        <div className="text-xs text-zinc-500">
                          Adds getter, setter, and init documentation beneath property candidates during `docs find`.
                        </div>
                      </div>
                      <button
                        type="button"
                        onClick={() => setSettings(current => ({
                          ...current,
                          docsFindIncludeAccessorDocs: !current.docsFindIncludeAccessorDocs,
                        }))}
                        className={cn(
                          "w-10 h-5 rounded-full transition-all relative",
                          settings.docsFindIncludeAccessorDocs ? "bg-indigo-600" : "bg-zinc-700"
                        )}
                      >
                        <div className={cn(
                          "absolute top-1 w-3 h-3 bg-white rounded-full transition-all",
                          settings.docsFindIncludeAccessorDocs ? "right-1" : "left-1"
                        )} />
                      </button>
                    </div>
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
                      <label className="block space-y-2">
                        <div className="text-xs font-medium uppercase tracking-wide text-zinc-500">Entry File</div>
                        <select
                          value={resolvedProjectRun.entryFile?.id ?? ''}
                          onChange={(e) => setSettings(current => ({
                            ...current,
                            projectRunEntryFileId: e.target.value || null,
                          }))}
                          disabled={resolvedProjectRun.entryCandidates.length === 0}
                          className="w-full rounded-xl border border-white/10 bg-black/20 px-3 py-2 text-sm text-white outline-none transition-colors focus:border-indigo-500 disabled:opacity-60 disabled:cursor-not-allowed"
                        >
                          {resolvedProjectRun.entryCandidates.length === 0 ? (
                            <option value="">No entry files available</option>
                          ) : (
                            resolvedProjectRun.entryCandidates.map(file => (
                              <option key={file.id} value={file.id}>{getPath(file.id)}</option>
                            ))
                          )}
                        </select>
                        <div className="text-xs text-zinc-500">
                          Project Run automatically includes the compatible project files for this entry.
                        </div>
                      </label>

                      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                        <div className="rounded-xl border border-white/10 bg-black/20 px-4 py-3">
                          <div className="text-[11px] uppercase tracking-wide text-zinc-500">Resolved Language</div>
                          <div className="mt-1 text-sm text-white">
                            {resolvedProjectRun.language ? getProjectRuntimeLanguageLabel(resolvedProjectRun.language) : 'Not resolved yet'}
                          </div>
                        </div>
                        <div className="rounded-xl border border-white/10 bg-black/20 px-4 py-3">
                          <div className="text-[11px] uppercase tracking-wide text-zinc-500">Included Files</div>
                          <div className="mt-1 text-sm text-white">{resolvedProjectRun.includedFiles.length}</div>
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
                    </div>
                  </div>
                </section>

                <section>
                  <h4 className="text-xs font-bold uppercase tracking-widest text-zinc-500 mb-4">Language Runtimes</h4>
                  <div className="grid grid-cols-1 xl:grid-cols-5 gap-4">
                    <div className="rounded-2xl border border-white/10 bg-white/5 p-4 space-y-4">
                      <div>
                        <div className="text-sm font-medium text-white">JavaScript / TypeScript</div>
                        <div className="text-xs text-zinc-500 mt-1">Runs JavaScript directly and transpiles TypeScript or TSX before execution. Set timeout to `0` to disable it.</div>
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
                            pythonRuntimeLifecycle: e.target.value as RuntimeLifecycle,
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
                            : 'Routes Python stdin requests to the Output panel as the program asks for input.'}
                        </div>
                      </label>
                    </div>

                    <div className="rounded-2xl border border-white/10 bg-white/5 p-4 space-y-4">
                      <div>
                        <div className="text-sm font-medium text-white">C#</div>
                        <div className="text-xs text-zinc-500 mt-1">Timeout is best-effort for the WebAssembly runtime. Set timeout to `0` to disable it.</div>
                      </div>

                      <label className="block space-y-2">
                        <div className="text-xs font-medium uppercase tracking-wide text-zinc-500">OmniSharp Source</div>
                        <select
                          value={settings.csharpOmniSharpSource}
                          onChange={(e) => setSettings(s => ({
                            ...s,
                            csharpOmniSharpSource: normalizeCSharpOmniSharpSource(e.target.value),
                          }))}
                          className="w-full rounded-xl border border-white/10 bg-black/20 px-3 py-2 text-sm text-white outline-none transition-colors focus:border-indigo-500"
                        >
                          <option value="local">Local OmniSharp</option>
                        </select>
                        <div className="text-xs text-zinc-500">
                          Uses the OmniSharp runtime bundled with CodeCraft.
                        </div>
                      </label>

                      <div className="flex items-center justify-between gap-4 rounded-xl border border-white/10 bg-black/20 px-4 py-3">
                        <div>
                          <div className="text-sm font-medium text-white">C# IDE Debug Mode</div>
                          <div className="text-xs text-zinc-500">
                            Records provider calls, OmniSharp requests, project snapshots, caches, timing, and failures.
                          </div>
                        </div>
                        <button
                          type="button"
                          onClick={() => setSettings(s => ({ ...s, csharpIdeDebugMode: !s.csharpIdeDebugMode }))}
                          className={cn(
                            "w-10 h-5 rounded-full transition-all relative shrink-0",
                            settings.csharpIdeDebugMode ? "bg-indigo-600" : "bg-zinc-700"
                          )}
                        >
                          <div className={cn(
                            "absolute top-1 w-3 h-3 bg-white rounded-full transition-all",
                            settings.csharpIdeDebugMode ? "right-1" : "left-1"
                          )} />
                        </button>
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
                            : 'Runs C# in a worker and routes Console input/output through the Output panel as the program runs.'}
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

                    <div className="rounded-2xl border border-white/10 bg-white/5 p-4 space-y-4">
                      <div>
                        <div className="text-sm font-medium text-white">Java</div>
                        <div className="text-xs text-zinc-500 mt-1">Compiles with javac in a CheerpJ worker, then runs the selected main class with live stdin/stdout.</div>
                      </div>

                      <label className="block space-y-2">
                        <div className="text-xs font-medium uppercase tracking-wide text-zinc-500">Execution Timeout (ms)</div>
                        <input
                          type="number"
                          min="0"
                          step="100"
                          value={settings.javaExecutionTimeoutMs}
                          onChange={(e) => setSettings(s => ({
                            ...s,
                            javaExecutionTimeoutMs: normalizeExecutionTimeoutMs(Number(e.target.value))
                          }))}
                          className="w-full rounded-xl border border-white/10 bg-black/20 px-3 py-2 text-sm text-white outline-none transition-colors focus:border-indigo-500"
                        />
                        <div className="text-xs text-zinc-500">Current: {formatExecutionTimeoutLabel(settings.javaExecutionTimeoutMs)}</div>
                      </label>

                      <label className="block space-y-2">
                        <div className="text-xs font-medium uppercase tracking-wide text-zinc-500">Runtime Version</div>
                        <select
                          value={settings.javaRuntimeVersion}
                          onChange={(e) => setSettings(s => ({
                            ...s,
                            javaRuntimeVersion: normalizeJavaRuntimeVersion(e.target.value),
                          }))}
                          className="w-full rounded-xl border border-white/10 bg-black/20 px-3 py-2 text-sm text-white outline-none transition-colors focus:border-indigo-500"
                        >
                          <option value={17}>Java 17</option>
                          <option value={11}>Java 11</option>
                          <option value={8}>Java 8</option>
                        </select>
                        <div className="text-xs text-zinc-500">Java 17 is the default for current language features.</div>
                      </label>

                      <label className="block space-y-2">
                        <div className="text-xs font-medium uppercase tracking-wide text-zinc-500">Runtime Lifecycle</div>
                        <select
                          value={settings.javaRuntimeLifecycle}
                          onChange={(e) => setSettings(s => ({
                            ...s,
                            javaRuntimeLifecycle: e.target.value as RuntimeLifecycle,
                          }))}
                          className="w-full rounded-xl border border-white/10 bg-black/20 px-3 py-2 text-sm text-white outline-none transition-colors focus:border-indigo-500"
                        >
                          <option value="dispose-after-run">Dispose After Run</option>
                          <option value="keep-warm">Keep Warm Until Idle Timeout</option>
                        </select>
                        <div className="text-xs text-zinc-500">
                          {settings.javaRuntimeLifecycle === 'dispose-after-run'
                            ? 'Disposes Java runtime state as soon as the run finishes.'
                            : 'Starts the Java idle timer after each run and disposes when it expires.'}
                        </div>
                      </label>

                      <label className="block space-y-2">
                        <div className="text-xs font-medium uppercase tracking-wide text-zinc-500">I/O Mode</div>
                        <select
                          value={settings.javaIOMode}
                          onChange={(e) => setSettings(s => ({
                            ...s,
                            javaIOMode: e.target.value as RuntimeIOMode,
                          }))}
                          className="w-full rounded-xl border border-white/10 bg-black/20 px-3 py-2 text-sm text-white outline-none transition-colors focus:border-indigo-500"
                        >
                          <option value="alert-output">Alert &amp; Output Mode</option>
                          <option value="interactive-output-panel">Interactive Output Panel Mode</option>
                        </select>
                        <div className="text-xs text-zinc-500">
                          {settings.javaIOMode === 'alert-output'
                            ? 'Uses browser prompts when Java reads from System.in.'
                            : 'Routes Java System.in requests to the Output panel exactly when the program reads input.'}
                        </div>
                      </label>
                    </div>

                    <div className="rounded-2xl border border-white/10 bg-white/5 p-4 space-y-4">
                      <div>
                        <div className="text-sm font-medium text-white">C/C++</div>
                        <div className="text-xs text-zinc-500 mt-1">Compiles with Clang through Wasmer, then runs the produced WebAssembly program. The first run may download the compiler package.</div>
                      </div>

                      <label className="block space-y-2">
                        <div className="text-xs font-medium uppercase tracking-wide text-zinc-500">Execution Timeout (ms)</div>
                        <input
                          type="number"
                          min="0"
                          step="100"
                          value={settings.cxxExecutionTimeoutMs}
                          onChange={(e) => setSettings(s => ({
                            ...s,
                            cxxExecutionTimeoutMs: normalizeExecutionTimeoutMs(Number(e.target.value))
                          }))}
                          className="w-full rounded-xl border border-white/10 bg-black/20 px-3 py-2 text-sm text-white outline-none transition-colors focus:border-indigo-500"
                        />
                        <div className="text-xs text-zinc-500">Current: {formatExecutionTimeoutLabel(settings.cxxExecutionTimeoutMs)}</div>
                      </label>

                      <label className="block space-y-2">
                        <div className="text-xs font-medium uppercase tracking-wide text-zinc-500">Runtime Lifecycle</div>
                        <select
                          value={settings.cxxRuntimeLifecycle}
                          onChange={(e) => setSettings(s => ({
                            ...s,
                            cxxRuntimeLifecycle: e.target.value as RuntimeLifecycle,
                          }))}
                          className="w-full rounded-xl border border-white/10 bg-black/20 px-3 py-2 text-sm text-white outline-none transition-colors focus:border-indigo-500"
                        >
                          <option value="dispose-after-run">Dispose After Run</option>
                          <option value="keep-warm">Keep Warm Until Idle Timeout</option>
                        </select>
                        <div className="text-xs text-zinc-500">
                          {settings.cxxRuntimeLifecycle === 'dispose-after-run'
                            ? 'Disposes the C/C++ compiler runtime as soon as the run finishes.'
                            : 'Starts the C/C++ idle timer after each run and disposes when it expires.'}
                        </div>
                      </label>

                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                        <label className="block space-y-2">
                          <div className="text-xs font-medium uppercase tracking-wide text-zinc-500">C Standard</div>
                          <select
                            value={settings.cxxCStandard}
                            onChange={(e) => setSettings(s => ({
                              ...s,
                              cxxCStandard: normalizeCxxCStandard(e.target.value),
                            }))}
                            className="w-full rounded-xl border border-white/10 bg-black/20 px-3 py-2 text-sm text-white outline-none transition-colors focus:border-indigo-500"
                          >
                            <option value="c11">C11</option>
                            <option value="c17">C17</option>
                            <option value="c23">C23</option>
                          </select>
                        </label>

                        <label className="block space-y-2">
                          <div className="text-xs font-medium uppercase tracking-wide text-zinc-500">C++ Standard</div>
                          <select
                            value={settings.cxxCppStandard}
                            onChange={(e) => setSettings(s => ({
                              ...s,
                              cxxCppStandard: normalizeCxxCppStandard(e.target.value),
                            }))}
                            className="w-full rounded-xl border border-white/10 bg-black/20 px-3 py-2 text-sm text-white outline-none transition-colors focus:border-indigo-500"
                          >
                            <option value="c++17">C++17</option>
                            <option value="c++20">C++20</option>
                            <option value="c++23">C++23</option>
                          </select>
                        </label>
                      </div>

                      <label className="block space-y-2">
                        <div className="text-xs font-medium uppercase tracking-wide text-zinc-500">Optimization</div>
                        <select
                          value={settings.cxxOptimizationLevel}
                          onChange={(e) => setSettings(s => ({
                            ...s,
                            cxxOptimizationLevel: normalizeCxxOptimizationLevel(e.target.value),
                          }))}
                          className="w-full rounded-xl border border-white/10 bg-black/20 px-3 py-2 text-sm text-white outline-none transition-colors focus:border-indigo-500"
                        >
                          <option value="O0">O0</option>
                          <option value="O1">O1</option>
                          <option value="O2">O2</option>
                          <option value="O3">O3</option>
                        </select>
                        <div className="text-xs text-zinc-500">Applies to both C and C++ compiler invocations.</div>
                      </label>

                      <label className="block space-y-2">
                        <div className="text-xs font-medium uppercase tracking-wide text-zinc-500">I/O Mode</div>
                        <select
                          value={settings.cxxIOMode}
                          onChange={(e) => setSettings(s => ({
                            ...s,
                            cxxIOMode: e.target.value as RuntimeIOMode,
                          }))}
                          className="w-full rounded-xl border border-white/10 bg-black/20 px-3 py-2 text-sm text-white outline-none transition-colors focus:border-indigo-500"
                        >
                          <option value="alert-output">Alert &amp; Output Mode</option>
                          <option value="interactive-output-panel">Interactive Output Panel Mode</option>
                        </select>
                        <div className="text-xs text-zinc-500">
                          {settings.cxxIOMode === 'alert-output'
                            ? 'Uses browser prompts when the compiled program reads from stdin.'
                            : 'Runs the compiled program in a worker and routes stdin/stdout/stderr through the Output panel as it runs.'}
                        </div>
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
                        <div className="text-sm font-medium text-white">Manage Saved `npm install` Packages</div>
                        <div className="text-xs text-zinc-500 mt-1">Packages are fetched from the npm registry and unpacked into CodeCraft's browser npm store.</div>
                      </div>

                      <div className="grid grid-cols-1 sm:grid-cols-[minmax(0,1fr)_auto] gap-3">
                        <input
                          type="text"
                          value={settingsNpmPackageInput}
                          onChange={(e) => setSettingsNpmPackageInput(e.target.value)}
                          onKeyDown={async (e) => {
                            if (e.key === 'Enter' && !settingsNpmPackageBusy) {
                              e.preventDefault();
                              await handleSettingsNpmPackageApply();
                            }
                          }}
                          placeholder="Packages, e.g. tailwindcss @tailwindcss/vite"
                          className="w-full rounded-xl border border-white/10 bg-black/20 px-3 py-2 text-sm text-white outline-none transition-colors focus:border-indigo-500"
                        />
                        <button
                          onClick={handleSettingsNpmPackageApply}
                          disabled={settingsNpmPackageBusy}
                          className={cn(
                            "px-4 py-2 rounded-xl text-sm font-semibold transition-colors",
                            settingsNpmPackageBusy
                              ? "bg-zinc-700 text-zinc-400 cursor-not-allowed"
                              : "bg-indigo-600 hover:bg-indigo-500 text-white"
                          )}
                        >
                          {settingsNpmPackageBusy ? 'Working...' : 'Install'}
                        </button>
                      </div>

                      {settingsNpmPackageStatus && (
                        <p className="text-xs text-indigo-300 bg-indigo-500/10 border border-indigo-500/20 rounded-xl px-3 py-2">
                          {settingsNpmPackageStatus}
                        </p>
                      )}

                      {settingsNpmInstalledPackages.length === 0 ? (
                        <p className="text-sm text-zinc-500">No saved `npm install` packages.</p>
                      ) : (
                        <div className="space-y-2">
                          {settingsNpmInstalledPackages.map(packageInfo => (
                            <div key={packageInfo.name} className="flex items-center justify-between gap-3 p-3 rounded-xl bg-black/20 border border-white/10">
                              <div className="min-w-0">
                                <div className="text-sm font-medium text-white break-all">{packageInfo.name}@{packageInfo.version}</div>
                                <div className="text-xs text-zinc-500 break-all">{packageInfo.fileCount} files, entry {packageInfo.entry}</div>
                              </div>
                              <button
                                onClick={() => handleSettingsNpmPackageRemove(packageInfo.name)}
                                disabled={settingsNpmPackageBusy}
                                className={cn(
                                  "px-3 py-1.5 rounded-lg text-xs font-medium transition-colors shrink-0",
                                  settingsNpmPackageBusy
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
                    </div>

                    <div className="rounded-2xl border border-white/10 bg-white/5 p-4 space-y-3">
                      <div>
                        <div className="text-sm font-medium text-white">Manage Saved `npm include` Modules</div>
                        <div className="text-xs text-zinc-500 mt-1">Include checks cdnjs, jsDelivr, Google Hosted Libraries, unpkg, then esm.sh when no URL is provided.</div>
                      </div>

                      <div className="grid grid-cols-1 sm:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_auto] gap-3">
                        <input
                          type="text"
                          value={settingsJavaScriptModuleInput}
                          onChange={(e) => setSettingsJavaScriptModuleInput(e.target.value)}
                          onKeyDown={async (e) => {
                            if (e.key === 'Enter' && !settingsJavaScriptModuleBusy) {
                              e.preventDefault();
                              await handleSettingsJavaScriptModuleApply();
                            }
                          }}
                          placeholder="Module, e.g. lodash-es"
                          className="w-full rounded-xl border border-white/10 bg-black/20 px-3 py-2 text-sm text-white outline-none transition-colors focus:border-indigo-500"
                        />
                        <input
                          type="text"
                          value={settingsJavaScriptModuleUrlInput}
                          onChange={(e) => setSettingsJavaScriptModuleUrlInput(e.target.value)}
                          onKeyDown={async (e) => {
                            if (e.key === 'Enter' && !settingsJavaScriptModuleBusy) {
                              e.preventDefault();
                              await handleSettingsJavaScriptModuleApply();
                            }
                          }}
                          placeholder="Optional URL, skips provider checks"
                          className="w-full rounded-xl border border-white/10 bg-black/20 px-3 py-2 text-sm text-white outline-none transition-colors focus:border-indigo-500"
                        />
                        <button
                          onClick={handleSettingsJavaScriptModuleApply}
                          disabled={settingsJavaScriptModuleBusy}
                          className={cn(
                            "px-4 py-2 rounded-xl text-sm font-semibold transition-colors",
                            settingsJavaScriptModuleBusy
                              ? "bg-zinc-700 text-zinc-400 cursor-not-allowed"
                              : "bg-indigo-600 hover:bg-indigo-500 text-white"
                          )}
                        >
                          {settingsJavaScriptModuleBusy ? 'Working...' : 'Include'}
                        </button>
                      </div>

                      {settingsJavaScriptModuleStatus && (
                        <p className="text-xs text-indigo-300 bg-indigo-500/10 border border-indigo-500/20 rounded-xl px-3 py-2">
                          {settingsJavaScriptModuleStatus}
                        </p>
                      )}

                      {settingsJavaScriptIncludedModules.length === 0 ? (
                        <p className="text-sm text-zinc-500">No saved `npm include` modules.</p>
                      ) : (
                        <div className="space-y-2">
                          {settingsJavaScriptIncludedModules.map(moduleInfo => (
                            <div key={moduleInfo.name} className="flex items-center justify-between gap-3 p-3 rounded-xl bg-black/20 border border-white/10">
                              <div className="min-w-0">
                                <div className="text-sm font-medium text-white break-all">{moduleInfo.name}</div>
                                <div className="text-xs text-zinc-500 break-all">{moduleInfo.url}</div>
                              </div>
                              <button
                                onClick={() => handleSettingsJavaScriptModuleRemove(moduleInfo.name)}
                                disabled={settingsJavaScriptModuleBusy}
                                className={cn(
                                  "px-3 py-1.5 rounded-lg text-xs font-medium transition-colors shrink-0",
                                  settingsJavaScriptModuleBusy
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
	
	                {/* User Data */}
	                <section>
	                  <h4 className="text-xs font-bold uppercase tracking-widest text-zinc-500 mb-4">User Data</h4>
	                  <div className="rounded-2xl border border-white/10 bg-white/5 p-4 space-y-4">
	                    <div>
	                      <div className="text-sm font-medium text-white">Complete Backup</div>
	                      <div className="text-xs text-zinc-500 mt-1">Includes projects, settings, chats, layout, saved packages, npm package cache, and Python package cache. Folder permissions are browser-bound and must be reconnected after import.</div>
	                    </div>
	                    <input
	                      ref={userDataImportInputRef}
	                      type="file"
	                      accept="application/json,.json"
	                      className="hidden"
	                      onChange={handleImportUserDataFile}
	                    />
	                    <div className="flex flex-wrap gap-3">
	                      <button
	                        onClick={handleExportUserData}
	                        disabled={settingsUserDataBusy}
	                        className={cn(
	                          "inline-flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-semibold transition-colors",
	                          settingsUserDataBusy
	                            ? "bg-zinc-700 text-zinc-400 cursor-not-allowed"
	                            : "bg-indigo-600 hover:bg-indigo-500 text-white"
	                        )}
	                      >
	                        <Download size={16} /> Export
	                      </button>
	                      <button
	                        onClick={() => userDataImportInputRef.current?.click()}
	                        disabled={settingsUserDataBusy}
	                        className={cn(
	                          "inline-flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-semibold transition-colors",
	                          settingsUserDataBusy
	                            ? "bg-zinc-700 text-zinc-400 cursor-not-allowed"
	                            : "bg-white/10 hover:bg-white/15 text-white border border-white/10"
	                        )}
	                      >
	                        <Upload size={16} /> Import
	                      </button>
	                    </div>
	                    {settingsUserDataStatus && (
	                      <p className="text-xs text-indigo-300 bg-indigo-500/10 border border-indigo-500/20 rounded-xl px-3 py-2">
	                        {settingsUserDataStatus}
	                      </p>
	                    )}
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

              <div className="p-6 border-t border-white/5 bg-white/2 flex items-center justify-between gap-4">
                <div className="text-xs text-zinc-500">Version {APP_VERSION}</div>
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
