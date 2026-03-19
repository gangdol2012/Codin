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
import { pyrightProvider, pyrightReady, reloadPyrightWithStubs, includeTypeshedModule } from './pyright';
import type { UserFolder } from './pyright';
import { csharpService, csharpReady, ensureCSharpReady } from './csharp-intellisage';
import { configureMonacoSuggestionAcceptance } from './monaco-suggest';
import { motion, AnimatePresence } from 'motion/react';
import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';
import { GoogleGenAI, Type, type FunctionDeclaration } from "@google/genai";
import ReactMarkdown from 'react-markdown';
import { Layout, Model, TabNode, IJsonModel, Actions, DockLocation } from 'flexlayout-react';
import { BrowserCSharp } from './browser-csharp-api';
import 'flexlayout-react/style/dark.css';
import * as Tooltip from '@radix-ui/react-tooltip';
import * as Separator from '@radix-ui/react-separator';

const SYNC_DB_NAME = 'codecraft-sync';
const SYNC_STORE_NAME = 'handles';
const SYNC_META_KEY = 'codecraft-sync-meta';

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

interface SyncMeta {
  folderId: string;
  folderName: string;
  localPath: string;
  connectedAt: number;
}

function loadSyncMeta(): SyncMeta[] {
  try { return JSON.parse(localStorage.getItem(SYNC_META_KEY) || '[]'); }
  catch { return []; }
}

function saveSyncMeta(meta: SyncMeta[]) {
  localStorage.setItem(SYNC_META_KEY, JSON.stringify(meta));
}

const DEFAULT_ASSISTANT_CHAT_NAME = "AI assistant";
const createAssistantChatId = () => `chat_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
const INITIAL_ASSISTANT_CHAT_ID = createAssistantChatId();
const STORAGE_KEYS = {
  files: 'codecraft-files',
  settings: 'codecraft-settings',
  assistantChats: 'codecraft-assistant-chats',
  layout: 'codecraft-layout',
  pipPackages: 'codecraft-pip-packages'
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

// Define AI tools
const proposeEditTool: FunctionDeclaration = {
  name: "proposeEdit",
  parameters: {
    type: Type.OBJECT,
    description: "Propose changes to a file for user review.",
    properties: {
      pathOrName: {
        type: Type.STRING,
        description: "The path or name of the file to edit.",
      },
      newContent: {
        type: Type.STRING,
        description: "The complete proposed content for the file.",
      },
    },
    required: ["pathOrName", "newContent"],
  },
};

const navigateToTool: FunctionDeclaration = {
  name: "navigateTo",
  parameters: {
    type: Type.OBJECT,
    description: "Switch the active file or folder in the editor.",
    properties: {
      pathOrName: {
        type: Type.STRING,
        description: "The path or name of the file or folder to navigate to.",
      },
    },
    required: ["pathOrName"],
  },
};

const moveCursorTool: FunctionDeclaration = {
  name: "moveCursor",
  parameters: {
    type: Type.OBJECT,
    description: "Move the editor cursor to a specific position.",
    properties: {
      line: {
        type: Type.NUMBER,
        description: "The line number (1-indexed).",
      },
      column: {
        type: Type.NUMBER,
        description: "The column number (1-indexed).",
      },
    },
    required: ["line", "column"],
  },
};

const createItemTool: FunctionDeclaration = {
  name: "createItem",
  parameters: {
    type: Type.OBJECT,
    description: "Create a file or folder in the workspace.",
    properties: {
      type: {
        type: Type.STRING,
        description: "Either 'file' or 'folder'.",
      },
      name: {
        type: Type.STRING,
        description: "Name of the new file or folder.",
      },
      parentPathOrName: {
        type: Type.STRING,
        description: "Optional parent folder path or name. Omit for workspace root.",
      },
      content: {
        type: Type.STRING,
        description: "Optional file content. Ignored for folders.",
      },
    },
    required: ["type", "name"],
  },
};

const deleteItemTool: FunctionDeclaration = {
  name: "deleteItem",
  parameters: {
    type: Type.OBJECT,
    description: "Delete a file or folder by path or name.",
    properties: {
      pathOrName: {
        type: Type.STRING,
        description: "Path or name of the item to delete.",
      },
    },
    required: ["pathOrName"],
  },
};

const moveItemTool: FunctionDeclaration = {
  name: "moveItem",
  parameters: {
    type: Type.OBJECT,
    description: "Move a file or folder into another folder.",
    properties: {
      sourcePathOrName: {
        type: Type.STRING,
        description: "Path or name of the item to move.",
      },
      destinationFolderPathOrName: {
        type: Type.STRING,
        description: "Destination folder path or name. Use '/' to move to workspace root.",
      },
    },
    required: ["sourcePathOrName", "destinationFolderPathOrName"],
  },
};

const runTerminalCommandTool: FunctionDeclaration = {
  name: "runTerminalCommand",
  parameters: {
    type: Type.OBJECT,
    description: "Run a command in the built-in terminal emulator.",
    properties: {
      command: {
        type: Type.STRING,
        description: "Terminal command text to execute.",
      },
    },
    required: ["command"],
  },
};

// Utility for tailwind classes
function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

const geminiAi = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY || '' });

interface SavedPipPackage { name: string; version: string; }

function loadSavedPipPackages(): SavedPipPackage[] {
  try {
    const raw = JSON.parse(localStorage.getItem(STORAGE_KEYS.pipPackages) || '[]');
    if (Array.isArray(raw) && raw.length > 0 && typeof raw[0] === 'string') {
      return raw.map((s: string) => ({ name: s, version: '' }));
    }
    return raw;
  } catch { return []; }
}

function savePipPackages(pkgs: SavedPipPackage[]) {
  localStorage.setItem(STORAGE_KEYS.pipPackages, JSON.stringify(pkgs));
}

function addSavedPipPackage(pkg: string, version: string) {
  const pkgs = loadSavedPipPackages();
  const normalized = pkg.toLowerCase().replace(/[=<>!].*/, '');
  const idx = pkgs.findIndex(p => p.name === normalized);
  if (idx >= 0) {
    pkgs[idx].version = version;
  } else {
    pkgs.push({ name: normalized, version });
  }
  savePipPackages(pkgs);
}

function removeSavedPipPackage(pkg: string) {
  const normalized = pkg.toLowerCase().replace(/[=<>!].*/, '');
  savePipPackages(loadSavedPipPackages().filter(p => p.name !== normalized));
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
}

interface AssistantChat {
  id: string;
  name: string;
  messages: ChatMessage[];
}

interface PendingEdit {
  fileId: string;
  originalContent: string;
  proposedContent: string;
}

interface AppSettings {
  clearOutputOnRun: boolean;
  showExecutionDivisor: boolean;
  fontSize: number;
  autoSave: boolean;
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
      ))
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
};

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
  const [output, setOutput] = useState<string>('Click "Run" to see output...');
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
  const [loadingAssistantChatId, setLoadingAssistantChatId] = useState<string | null>(null);
  const [assistantHistoryOpenByChatId, setAssistantHistoryOpenByChatId] = useState<Record<string, boolean>>({});
  const [outputPreviewHtml, setOutputPreviewHtml] = useState<string | null>(null);
  const [pendingEdit, setPendingEdit] = useState<PendingEdit | null>(null);
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
    return { ...DEFAULT_SETTINGS, ...parsed };
  });
  const [syncMeta, setSyncMeta] = useState<SyncMeta[]>(loadSyncMeta);
  const editorRef = useRef<any>(null);
  const outputContainerRef = useRef<HTMLDivElement>(null);
  const terminalContainerRef = useRef<HTMLDivElement>(null);
  const csharpRuntimeReadyRef = useRef<Promise<void> | null>(null);
  const skipEditorSyncRef = useRef(false);
  const filesRef = useRef(files);
  filesRef.current = files;
  const syncHandlesRef = useRef<Map<string, FileSystemDirectoryHandle>>(new Map());
  const syncLocksRef = useRef<Map<string, Promise<void>>>(new Map());
  const syncInitializedRef = useRef<Set<string>>(new Set());
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [activeSyncIds, setActiveSyncIds] = useState<Set<string>>(new Set());

  const activeItem = files.find(f => f.id === activeFileId);

  // Helper to get full path
  const getPath = (id: string | undefined): string => {
    if (!id) return '';
    const item = files.find(f => f.id === id);
    if (!item) return '';
    if (!item.parentId) return item.name;
    return `${getPath(item.parentId)}/${item.name}`;
  };

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

  const openEditorTab = (itemId: string) => {
    const item = files.find(f => f.id === itemId);
    if (!item) return;

    skipEditorSyncRef.current = true;
    setActiveFileId(itemId);

    const jsonModel = layoutModel.toJson() as IJsonModel;
    const fallbackTabIds = collectFallbackEditorTabIds(jsonModel.layout);
    const existingTab = findEditorTabByItemId(jsonModel.layout, itemId);
    if (existingTab?.id) {
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
          id: `editor-panel-tab-${itemId}`,
          name: item.name,
          component: 'editor',
          config: { itemId },
          enableClose: true
        }, parentTabsetId, DockLocation.CENTER, -1, true));
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
      id: `editor-panel-tab-${itemId}`,
      name: item.name,
      component: 'editor',
      config: { itemId },
      enableClose: true
    }, editorTabsetId, DockLocation.CENTER, -1, true));
    skipEditorSyncRef.current = false;
  };

  const aiRef = useRef(geminiAi);

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
    if (loadSavedPipPackages().length > 0) {
      ensurePyodideWithPackages(msg => setTerminalOutput(prev => [...prev, msg]));
    }
    return () => {
      if (pyodideIdleTimerRef.current) clearTimeout(pyodideIdleTimerRef.current);
    };
  }, []);

  useEffect(() => {
    ensureCSharpReady().catch(error => {
      console.warn('Failed to initialize C# IntelliSense on app startup:', error);
    });
    ensureCSharpRuntime().catch(error => {
      console.warn('Failed to initialize C# runtime on app startup:', error);
    });
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

  // Auto-scroll output and terminal
  useEffect(() => {
    if (outputContainerRef.current) {
      outputContainerRef.current.scrollTop = outputContainerRef.current.scrollHeight;
    }
  }, [output]);

  useEffect(() => {
    if (terminalContainerRef.current) {
      terminalContainerRef.current.scrollTop = terminalContainerRef.current.scrollHeight;
    }
  }, [terminalOutput]);

  const runJavaScript = (code: string) => {
    const originalLog = console.log;
    const originalError = console.error;

    // Capture logs and stream to output
    console.log = (...args) => {
      const msg = args.map(a => typeof a === 'object' ? JSON.stringify(a, null, 2) : String(a)).join(' ');
      setOutput(prev => prev + (prev ? '\n' : '') + msg);
      originalLog(...args);
    };
    console.error = (...args) => {
      const msg = `[ERROR] ${args.map(a => String(a)).join(' ')}`;
      setOutput(prev => prev + (prev ? '\n' : '') + msg);
      originalError(...args);
    };

    try {
      setOutput('');
      console.clear();
      const fn = new Function(code);
      const result = fn();

      if (result !== undefined) {
        setOutput(prev => prev + (prev ? '\n' : '') + `Return value: ${String(result)}`);
      }
    } catch (err) {
      setOutput(prev => prev + (prev ? '\n' : '') + `Runtime Error: ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      console.log = originalLog;
      console.error = originalError;
    }
  };

  const extractPyodideStubs = async (pkgName: string): Promise<UserFolder> => {
    const pyodide = (window as any).pyodide;
    if (!pyodide) return {};
    try {
      const json = await pyodide.runPythonAsync(`
import json, os, importlib, site

def _extract(pkg_name):
    MAX_TOTAL = 2 * 1024 * 1024  # 2MB total cap
    _names_to_try = list(dict.fromkeys([
        pkg_name,
        pkg_name.replace('-', '_').lower(),
        pkg_name.replace('-', '_'),
        pkg_name.lower(),
    ]))

    importlib.invalidate_caches()

    # Find package directories to scan
    scan_dirs = []  # list of (base_dir, rel_parent)

    # Try import first to get __path__
    for _n in _names_to_try:
        try:
            mod = importlib.import_module(_n)
            paths = getattr(mod, '__path__', None)
            if paths:
                for base in paths:
                    scan_dirs.append((base, os.path.dirname(base)))
            else:
                f = getattr(mod, '__file__', None)
                if f and os.path.isfile(f):
                    with open(f, 'r', errors='replace') as fp:
                        content = fp.read()
                    return {os.path.basename(f): content[:MAX_TOTAL]}
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
                    scan_dirs.append((pkg_path, sp))
                    break
                single = pkg_path + '.py'
                if os.path.isfile(single):
                    with open(single, 'r', errors='replace') as fp:
                        return {_n + '.py': fp.read()[:MAX_TOTAL]}
            if scan_dirs:
                break

    if not scan_dirs:
        return {}

    result = {}
    total_size = 0
    PY_MAX = 10 * 1024

    # Phase 1: collect .pyi files (cap at PY_MAX, include up to limit)
    pyi_total = 0
    for base, parent in scan_dirs:
        for root, dirs, files in os.walk(base):
            for fn in files:
                if fn.endswith('.pyi'):
                    try:
                        pyi_total += os.path.getsize(os.path.join(root, fn))
                    except Exception:
                        pass
    if pyi_total > 0:
        for base, parent in scan_dirs:
            for root, dirs, files in os.walk(base):
                for fn in files:
                    if not fn.endswith('.pyi'):
                        continue
                    full = os.path.join(root, fn)
                    rel = os.path.relpath(full, parent)
                    try:
                        with open(full, 'r', errors='replace') as fp:
                            c = fp.read()
                        if total_size + len(c) > min(PY_MAX, MAX_TOTAL):
                            continue
                        result[rel] = c
                        total_size += len(c)
                    except Exception:
                        pass
        if result:
            return result

    # Phase 1B: generate .pyi stubs from .py files using ast
    import ast
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
                for t in node.targets:
                    if isinstance(t, ast.Name):
                        if node.type_comment:
                            lines.append(f'{t.id}: {node.type_comment}')
                        else:
                            lines.append(f'{t.id}: ...')
            elif isinstance(node, ast.AnnAssign) and node.target and isinstance(node.target, ast.Name):
                ann = ast.unparse(node.annotation)
                lines.append(f'{node.target.id}: {ann}')
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
                    elif isinstance(item, ast.AnnAssign) and item.target and isinstance(item.target, ast.Name):
                        ann = ast.unparse(item.annotation)
                        cls_lines.append(f'    {item.target.id}: {ann}')
                    elif isinstance(item, ast.Assign):
                        for t in item.targets:
                            if isinstance(t, ast.Name):
                                cls_lines.append(f'    {t.id}: ...')
                header = f'class {node.name}({bases}):' if bases else f'class {node.name}:'
                if cls_lines:
                    lines.append(header + '\\n' + '\\n'.join(cls_lines))
                else:
                    lines.append(header + ' ...')
        if not lines:
            return None
        return '\\n'.join(lines) + '\\n'

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
                    if stub and total_size + len(stub) <= min(PY_MAX, MAX_TOTAL):
                        result[stub_rel] = stub
                        total_size += len(stub)
                except Exception:
                    pass

    if result:
        return result

    # Phase 2: fall back to .py files only if total .py size <= 10KB
    py_total_size = 0
    for base, parent in scan_dirs:
        for root, dirs, files in os.walk(base):
            for fn in files:
                if fn.endswith('.py'):
                    try:
                        py_total_size += os.path.getsize(os.path.join(root, fn))
                    except Exception:
                        pass

    if py_total_size > PY_MAX:
        return result

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

    return result

json.dumps(_extract(${JSON.stringify(pkgName)}))
`);
      const flat: Record<string, string> = JSON.parse(json);
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
      return folder;
    } catch {
      return {};
    }
  };

  const ensurePyodideScript = async () => {
    if ((window as any).loadPyodide) return;
    await new Promise<void>((resolve, reject) => {
      const script = document.createElement('script');
      script.src = 'https://cdn.jsdelivr.net/pyodide/v0.29.3/full/pyodide.js';
      script.onload = () => resolve();
      script.onerror = () => reject(new Error('Failed to load Pyodide'));
      document.head.appendChild(script);
    });
  };

  const pyodideRestoredRef = useRef(false);
  const pyodideIdleTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const PYODIDE_IDLE_TIMEOUT = 60_000;

  const unloadPyodide = () => {
    const py = (window as any).pyodide;
    if (py) {
      try { py.runPython(''); } catch { }
      try {
        // Release internal FS, module loader, and WASM memory references
        if (py._module) {
          if (py._module.wasmMemory) py._module.wasmMemory = null;
          if (py._module.wasmModule) py._module.wasmModule = null;
          py._module = null;
        }
        if (py._api) py._api = null;
      } catch { }
      (window as any).pyodide = undefined;
      (window as any).loadPyodide = undefined;
      // Remove the CDN script so re-init starts fresh
      const scripts = document.querySelectorAll('script[src*="pyodide"]');
      scripts.forEach(s => s.remove());
      pyodideRestoredRef.current = false;
    }
  };

  const resetPyodideIdleTimer = () => {
    if (pyodideIdleTimerRef.current) clearTimeout(pyodideIdleTimerRef.current);
    pyodideIdleTimerRef.current = setTimeout(unloadPyodide, PYODIDE_IDLE_TIMEOUT);
  };

  const ensurePyodideWithPackages = async (log?: (msg: string) => void) => {
    if (!(window as any).pyodide) {
      log?.('Loading Python runtime (Pyodide)... this may take a few seconds.');
      await ensurePyodideScript();
      (window as any).pyodide = await (window as any).loadPyodide({ enableRunUntilComplete: false });
    }
    if (!pyodideRestoredRef.current) {
      pyodideRestoredRef.current = true;
      const savedPkgs = loadSavedPipPackages();
      if (savedPkgs.length > 0) {
        const pyodide = (window as any).pyodide;
        const specs = savedPkgs.map(p => p.version ? `${p.name}==${p.version}` : p.name);
        log?.(`Restoring ${savedPkgs.length} package(s): ${specs.join(', ')}...`);
        try {
          await pyodide.loadPackage("micropip");
          const micropip = pyodide.pyimport("micropip");
          await micropip.install(specs, { keep_going: true });
          log?.(`Restored: ${specs.join(', ')}`);
        } catch (err) {
          log?.(`Warning: some packages could not be restored: ${err instanceof Error ? err.message : String(err)}`);
        }

        let mergedStubs: UserFolder = {};
        for (const p of savedPkgs) {
          try {
            const stubs = await extractPyodideStubs(p.name);
            if (Object.keys(stubs).length > 0) {
              mergedStubs = { ...mergedStubs, ...stubs };
            }
          } catch { alert('Failed to extract stubs from Pyodide package'); }
        }
        if (Object.keys(mergedStubs).length > 0) {
          log?.('Updating Pyright language support...');
          try {
            await reloadPyrightWithStubs(mergedStubs);
            if (editorRef.current) {
              pyrightProvider.setupDiagnostics(editorRef.current);
            }
          } catch { }
        }
      }
    }
    resetPyodideIdleTimer();
  };

  const runPython = async (code: string) => {
    try {
      await ensurePyodideWithPackages(msg => setOutput(prev => prev + (prev ? '\n' : '') + msg));
      const pyodide = (window as any).pyodide;

      pyodide.setStdout({
        batched: (text: string) => {
          setOutput(prev => prev + (prev ? '\n' : '') + text);
        }
      });
      pyodide.setStderr({
        batched: (text: string) => {
          setOutput(prev => prev + (prev ? '\n' : '') + `[STDERR] ${text}`);
        }
      });
      pyodide.setStdin({
        stdin: () => {
          const value = window.prompt('Python input:', '');
          return value ?? '';
        },
        isatty: true
      });

      setOutput(prev => prev + (prev ? '\n' : '') + 'Executing Python...');
      setOutput('');
      console.clear();
      const result = await pyodide.runPythonAsync(code);

      if (result !== undefined) {
        setOutput(prev => prev + (prev ? '\n' : '') + `Return value: ${String(result)}`);
      }
    } catch (err) {
      setOutput(prev => prev + (prev ? '\n' : '') + `Python Error: ${err instanceof Error ? err.message : String(err)}`);
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
    });

    return csharpRuntimeReadyRef.current;
  };

  const runCSharp = async (code: string) => {
    try {
      setOutput('');
      console.clear();
      setOutput('Compiling and executing C# (WebAssembly, regular program)...');

      await ensureCSharpRuntime();
      const result = await BrowserCSharp.executeRegular(code);

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
      setOutput(`C# Error: ${err instanceof Error ? err.message : String(err)}`);
    }
  };

  const handleRun = async () => {
    if (!activeItem) {
      setOutput('Error: No file selected to run.');
      return;
    }
    setIsRunning(true);

    if (settings.clearOutputOnRun) {
      setOutput('Starting execution...\n');
    } else {
      const divisor = settings.showExecutionDivisor
        ? `\n\n${'='.repeat(20)} EXECUTION: ${new Date().toLocaleTimeString()} ${'='.repeat(20)}\n`
        : '\n';
      setOutput(prev => prev + divisor + 'Starting execution...\n');
    }

    try {
      if (activeItem.type === 'file' && (activeItem.language === 'javascript' || activeItem.language === 'js')) {
        setOutputPreviewHtml(null);
        runJavaScript(activeItem.content || '');
        return;
      }

      if (activeItem.type === 'file' && (activeItem.language === 'python' || activeItem.language === 'py')) {
        setOutputPreviewHtml(null);
        await runPython(activeItem.content || '');
        return;
      }

      if (activeItem.type === 'file' && activeItem.language === 'html') {
        setOutputPreviewHtml(activeItem.content || '');
        selectDockPanel('output');
        setOutput('Preview rendered in Output panel.');
        return;
      }

      if (activeItem.type === 'file' && (activeItem.language === 'cs' || activeItem.language === 'csharp')) {
        setOutputPreviewHtml(null);
        await runCSharp(activeItem.content || '');
        return;
      }

      // Fallback for unsupported languages
      if (activeItem.type === 'file') {
        setOutput(`Error: No local runtime available for ${activeItem.language}. Supported: HTML, JavaScript, Python, and C#.`);
      } else {
        setOutput('Error: Cannot run a folder.');
      }
    } catch (error) {
      setOutput(`Error: ${error instanceof Error ? error.message : 'Execution failed'}`);
    } finally {
      setIsRunning(false);
    }
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
    const shouldSyncEditorSelection =
      action?.type === Actions.SELECT_TAB || action?.type === Actions.DELETE_TAB;
    if (shouldSyncEditorSelection && hasSelectedEditorTab) {
      setActiveFileId(selectedEditorItemId || '');
    }
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

    let selectionContext = "";
    if (editorRef.current && activeItem) {
      const selection = editorRef.current.getSelection();
      const model = editorRef.current.getModel();
      if (selection && model && !selection.isEmpty()) {
        const selectedText = model.getValueInRange(selection);
        selectionContext = `\n\n[User selected code in ${activeItem.name}]:\n\`\`\`${activeItem.language || 'text'}\n${selectedText}\n\`\`\``;
      }
    }

    const userMsg: ChatMessage = { role: 'user', content: input + selectionContext };
    appendAssistantMessage(chatId, { role: 'user', content: input });
    setAssistantInputs(prev => ({ ...prev, [chatId]: '' }));
    setLoadingAssistantChatId(chatId);

    try {
      const history = currentChat.messages.map(msg => `${msg.role.toUpperCase()}: ${msg.content}`).join('\n');
      const prompt = `
        Context: You are an AI coding assistant inside CodeCraft IDE.
        Internal Chat ID: ${chatId}
        Keep continuity with the existing chat history for this chat.
        You have access to tools to propose edits, navigate, move cursor, directly create/delete/move files or folders, and run built-in terminal commands.
        Do not suggest terminal-style commands for filesystem operations when a tool can be used, unless the user specifically asks for it.
        When you want to change code, use 'proposeEdit' so the user can review it.
        
        Current File System:
        ${files.map(f => `- Path: ${getPath(f.id)}, Type: ${f.type}, Language: ${f.language || 'N/A'}`).join('\n')}
        
        Active Item: ${activeItem ? getPath(activeItem.id) : 'None selected'}
        ${activeItem ? (activeItem.type === 'file' ? `Content:\n${activeItem.content}` : 'This is a folder.') : 'No file is currently active.'}
        
        Chat History:
        ${history || '(empty)'}
        
        USER: ${userMsg.content}
      `;

      const response = await aiRef.current.models.generateContent({
        model: "gemini-3-flash-preview",
        contents: prompt,
        config: {
          tools: [{
            functionDeclarations: [proposeEditTool, navigateToTool, moveCursorTool, createItemTool, deleteItemTool, moveItemTool, runTerminalCommandTool]
          }],
        }
      });

      const functionCalls = response.functionCalls;
      if (functionCalls) {
        for (const call of functionCalls) {
          if (call.name === 'proposeEdit') {
            const { pathOrName, newContent } = call.args as any;
            const targetFile = findItem(pathOrName);
            if (targetFile && targetFile.type === 'file') {
              setPendingEdit({
                fileId: targetFile.id,
                originalContent: targetFile.content || '',
                proposedContent: newContent
              });
              appendAssistantMessage(chatId, { role: 'assistant', content: `I've proposed some changes to \`${targetFile.name}\`. Please review them in the editor.` });
            } else {
              appendAssistantMessage(chatId, { role: 'assistant', content: `I couldn't find a file at \`${pathOrName}\` to edit.` });
            }
          } else if (call.name === 'navigateTo') {
            const { pathOrName } = call.args as any;
            const target = findItem(pathOrName);
            if (target) {
              openEditorTab(target.id);
              if (target.type === 'folder') {
                setFiles(prev => prev.map(f => f.id === target.id ? { ...f, isOpen: true } : f));
              }
              appendAssistantMessage(chatId, { role: 'assistant', content: `Navigated to \`${pathOrName}\`.` });
            } else {
              appendAssistantMessage(chatId, { role: 'assistant', content: `I couldn't find \`${pathOrName}\`.` });
            }
          } else if (call.name === 'moveCursor') {
            const { line, column } = call.args as any;
            if (editorRef.current) {
              editorRef.current.setPosition({ lineNumber: line, column: column });
              editorRef.current.revealPositionInCenter({ lineNumber: line, column: column });
              editorRef.current.focus();
            }
            appendAssistantMessage(chatId, { role: 'assistant', content: `Moved cursor to line ${line}, column ${column}.` });
          } else if (call.name === 'createItem') {
            const { type, name, parentPathOrName, content } = call.args as any;
            const normalizedType = type === 'folder' ? 'folder' : type === 'file' ? 'file' : null;
            const trimmedName = typeof name === 'string' ? name.trim() : '';
            const parent = parentPathOrName ? findItem(parentPathOrName) : undefined;

            if (!normalizedType || !trimmedName) {
              appendAssistantMessage(chatId, { role: 'assistant', content: "I couldn't create the item because type/name were invalid." });
            } else if (parentPathOrName && (!parent || parent.type !== 'folder')) {
              appendAssistantMessage(chatId, { role: 'assistant', content: `I couldn't find destination folder \`${parentPathOrName}\`.` });
            } else {
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

              setFiles(prev => {
                const updated = [...prev, newItem];
                if (parentId) {
                  return updated.map(f => f.id === parentId ? { ...f, isOpen: true } : f);
                }
                return updated;
              });

              if (normalizedType === 'file') {
                openEditorTab(id);
              }

              appendAssistantMessage(chatId, { role: 'assistant', content: `Created ${normalizedType} \`${trimmedName}\`.` });
            }
          } else if (call.name === 'deleteItem') {
            const { pathOrName } = call.args as any;
            const target = findItem(pathOrName);
            if (!target) {
              appendAssistantMessage(chatId, { role: 'assistant', content: `I couldn't find \`${pathOrName}\` to delete.` });
            } else {
              deleteItem(target.id);
              appendAssistantMessage(chatId, { role: 'assistant', content: `Deleted \`${pathOrName}\`.` });
            }
          } else if (call.name === 'moveItem') {
            const { sourcePathOrName, destinationFolderPathOrName } = call.args as any;
            const source = findItem(sourcePathOrName);
            const moveToRoot = destinationFolderPathOrName === '/' || destinationFolderPathOrName === '~' || destinationFolderPathOrName === '';
            const destination = moveToRoot ? null : findItem(destinationFolderPathOrName);

            if (!source) {
              appendAssistantMessage(chatId, { role: 'assistant', content: `I couldn't find \`${sourcePathOrName}\` to move.` });
            } else if (!moveToRoot && (!destination || destination.type !== 'folder')) {
              appendAssistantMessage(chatId, { role: 'assistant', content: `I couldn't find destination folder \`${destinationFolderPathOrName}\`.` });
            } else if (destination && source.type === 'folder' && isDescendant(destination.id, source.id)) {
              appendAssistantMessage(chatId, { role: 'assistant', content: "I can't move a folder into itself or one of its descendants." });
            } else {
              setFiles(prev => prev.map(f => f.id === source.id ? { ...f, parentId: destination ? destination.id : null } : f));
              if (destination) {
                setFiles(prev => prev.map(f => f.id === destination.id ? { ...f, isOpen: true } : f));
              }
              appendAssistantMessage(chatId, { role: 'assistant', content: `Moved \`${source.name}\` to ${destination ? `\`${destination.name}\`` : '`root`'}.` });
            }
          } else if (call.name === 'runTerminalCommand') {
            const { command } = call.args as any;
            if (typeof command === 'string' && command.trim()) {
              selectDockPanel('terminal');
              await executeTerminalCommand(command, false);
              appendAssistantMessage(chatId, { role: 'assistant', content: `Executed terminal command: \`${command}\`.` });
            } else {
              appendAssistantMessage(chatId, { role: 'assistant', content: "I couldn't run the terminal command because it was empty." });
            }
          }
        }
      }

      if (response.text) {
        appendAssistantMessage(chatId, { role: 'assistant', content: response.text });
      }
    } catch (error) {
      console.error(error);
      appendAssistantMessage(chatId, { role: 'assistant', content: 'Sorry, I encountered an error connecting to the AI.' });
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

  const acceptEdit = () => {
    if (!pendingEdit) return;
    setFiles(prev => prev.map(f => f.id === pendingEdit.fileId ? { ...f, content: pendingEdit.proposedContent } : f));
    setPendingEdit(null);
  };

  const declineEdit = () => {
    setPendingEdit(null);
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
        if (finalized.type === 'file') openEditorTab(finalized.id);
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

    if (type === 'file') openEditorTab(id);
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
        addSavedPipPackage(name, data.info.version);
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
          const isUrl = /^https?:\/\//i.test(pkg);

          if (isUrl) {
            // Direct URL install — skip to micropip with retry
            setTerminalOutput(prev => [...prev, `Installing from URL: ${pkg}`]);
            try {
              await micropipInstallWithRetry(pkg);
              setTerminalOutput(prev => [...prev, `Installed from URL`]);
              installed = true;
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
import os, sys, json, importlib, configparser

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

# --- Invalidate import caches so Python discovers the new modules ---
importlib.invalidate_caches()

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
            try {
              installedVersion = await pyodide.runPythonAsync(
                `__import__('importlib.metadata').metadata.version(${JSON.stringify(pkg.replace(/-/g, '_'))})`
              );
            } catch {
              try {
                const pypiRes2 = await fetch(`https://pypi.org/pypi/${pkg}/json`);
                if (pypiRes2.ok) installedVersion = (await pypiRes2.json()).info.version;
              } catch { }
            }
            addSavedPipPackage(pkg, installedVersion);
            setTerminalOutput(prev => [...prev, `Successfully installed ${pkg}${installedVersion ? `==${installedVersion}` : ''}`]);
            setTerminalOutput(prev => [...prev, 'Updating editor language support...']);
            try {
              setTerminalOutput(prev => [...prev, '  Extracting type stubs...']);
              let stubs: UserFolder;
              try {
                stubs = await extractPyodideStubs(pkg);
              } catch (extractErr) {
                setTerminalOutput(prev => [...prev, `  Stub extraction error: ${extractErr instanceof Error ? extractErr.message : String(extractErr)}`]);
                stubs = {};
              }
              const stubCount = Object.keys(stubs).length;
              setTerminalOutput(prev => [...prev, `  Found ${stubCount} stub entries`]);
              if (stubCount > 0) {
                setTerminalOutput(prev => [...prev, '  Reloading Pyright LSP...']);
                try {
                  await reloadPyrightWithStubs(stubs);
                } catch (reloadErr) {
                  setTerminalOutput(prev => [...prev, `  Pyright reload error: ${reloadErr instanceof Error ? reloadErr.message : String(reloadErr)}`]);
                }
                if (editorRef.current) {
                  try {
                    pyrightProvider.setupDiagnostics(editorRef.current);
                  } catch (diagErr) {
                    setTerminalOutput(prev => [...prev, `  Diagnostics setup error: ${diagErr instanceof Error ? diagErr.message : String(diagErr)}`]);
                  }
                }
                setTerminalOutput(prev => [...prev, `Language support updated for ${pkg}`]);
              } else {
                setTerminalOutput(prev => [...prev, `No type stubs found for ${pkg} (import may still work)`]);
              }
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
          removeSavedPipPackage(pkg);
          setTerminalOutput([...newOutput, `Successfully uninstalled ${pkg}`]);
        } catch (err) {
          setTerminalOutput([...newOutput, `pip uninstall error: ${err instanceof Error ? err.message : String(err)}`]);
        }
      } else if (subCmd === 'include' && pkg) {
        setTerminalOutput([...newOutput, `Including '${pkg}' in Pyright type checker...`]);
        try {
          const reloaded = await includeTypeshedModule(pkg, msg => setTerminalOutput(prev => [...prev, msg]));
          if (reloaded && editorRef.current) {
            pyrightProvider.setupDiagnostics(editorRef.current);
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
    } else if (cmd === 'help') {
      setTerminalOutput([...newOutput, 'Standard commands: ls, pwd, cd, mkdir, touch, open, cat, rm, clear, help, date, echo', 'Python: pip install <package> [-force] | pip upgrade <package> [-version <ver>] | pip uninstall <package> | pip include <module> | pip list']);
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
      const tabItemId = (node as any).getConfig?.()?.itemId as string | undefined;
      const resolvedTabItemId = tabItemId || activeFileId;
      const tabItem = resolvedTabItemId ? files.find(f => f.id === resolvedTabItemId) : undefined;
      const editorModelPath = tabItem ? `file:///${encodeURI(getPath(tabItem.id))}` : undefined;

      return (
        <div className="h-full w-full flex flex-col bg-[rgb(28,28,28)] text-zinc-300 relative">
          {pendingEdit ? (
            <div className="flex-1 flex flex-col">
              <div className="h-10 bg-indigo-900/30 border-b border-indigo-500/30 flex items-center justify-between px-4">
                <div className="flex items-center gap-2 text-xs font-medium text-indigo-300">
                  <Sparkles size={14} />
                  <span>Reviewing changes to {files.find(f => f.id === pendingEdit.fileId)?.name}</span>
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
              <Editor path={editorModelPath} height="100%" defaultLanguage={tabItem.language} language={tabItem.language} theme="vs-dark" value={tabItem.content} onMount={(editor) => { editorRef.current = editor; configureMonacoSuggestionAcceptance(editor); if (tabItem.language === 'python') { pyrightReady.then(() => { pyrightProvider.editorChangeListener?.dispose(); pyrightProvider.editorChangeListener = undefined as any; pyrightProvider.setupDiagnostics(editor); }); } if (tabItem.language === 'csharp') { csharpReady.then(() => { csharpService.setupEditor(editor); }); } }} onChange={(value) => { setFiles(prev => prev.map(f => f.id === resolvedTabItemId ? { ...f, content: value || '' } : f)); }} options={{ fontSize: settings.fontSize, fontFamily: '"JetBrains Mono", "Fira Code", monospace', minimap: { enabled: true }, scrollBeyondLastLine: false, automaticLayout: true, padding: { top: 20 }, lineNumbers: 'on', renderLineHighlight: 'all', acceptSuggestionOnEnter: 'on', acceptSuggestionOnCommitCharacter: true, scrollbar: { vertical: 'visible', horizontal: 'visible', useShadows: false, verticalScrollbarSize: 10, horizontalScrollbarSize: 10 } }} />
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
              setOutputPreviewHtml(null);
              setOutput('');
            }}
            className="absolute top-2 right-4 text-[10px] px-2 py-1 rounded bg-white/5 hover:bg-white/10 text-zinc-500 hover:text-white transition-all z-10 opacity-0 group-hover:opacity-100 backdrop-blur-sm cursor-pointer"
          >
            Clear
          </button>
          <div ref={outputContainerRef} className="flex-1 p-4 font-mono text-sm overflow-y-auto whitespace-pre-wrap text-zinc-400 custom-scrollbar">
            {outputPreviewHtml ? (
              <iframe
                title="output-preview"
                srcDoc={outputPreviewHtml}
                className="w-full h-full border-none bg-white rounded-md"
                sandbox="allow-scripts"
              />
            ) : (
              output
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
                    : "bg-white/5 text-zinc-300 rounded-tl-none border border-white/5"
                )}>
                  {msg.role === 'assistant' ? (
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
                disabled={!chatInput.trim() || isChatLoading}
                className="absolute right-2 bottom-2 p-2 text-indigo-400 hover:text-indigo-300 disabled:text-zinc-600 transition-colors"
              >
                <ChevronRight size={20} />
              </button>
            </div>
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
              disabled={isRunning || !activeItem || activeItem.type === 'folder'}
              className={cn(
                "inline-flex items-center gap-1.5 h-8 px-3 rounded-md text-xs font-medium transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-emerald-600",
                (isRunning || !activeItem || activeItem.type === 'folder')
                  ? "border border-zinc-800 text-zinc-600 cursor-not-allowed"
                  : "bg-emerald-700 hover:bg-emerald-600 text-white border border-emerald-600"
              )}
            >
              {isRunning ? <Cpu className="animate-spin" size={13} /> : <Play size={13} />}
              Run
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
              className="w-full max-w-lg bg-[rgb(28,28,28)] border border-white/10 rounded-2xl shadow-2xl overflow-hidden flex flex-col max-h-[80vh]"
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
