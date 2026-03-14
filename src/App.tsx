import React, { useState, useEffect, useRef } from 'react';
import { 
  FileCode, 
  Play, 
  Plus, 
  Trash2, 
  MessageSquare, 
  ChevronRight, 
  ChevronDown, 
  Terminal as TerminalIcon,
  Code2,
  Cpu,
  Sparkles,
  X,
  Check,
  Save,
  Settings,
  Eye,
  EyeOff,
  Folder,
  FolderPlus,
  FilePlus
} from 'lucide-react';
import Editor, { DiffEditor } from '@monaco-editor/react';
import { motion, AnimatePresence } from 'motion/react';
import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';
import { GoogleGenAI, Type, type FunctionDeclaration } from "@google/genai";
import ReactMarkdown from 'react-markdown';

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

// Utility for tailwind classes
function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

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

export default function App() {
  const [files, setFiles] = useState<FSItem[]>(INITIAL_FILES);
  const [activeFileId, setActiveFileId] = useState<string>('1');
  const [output, setOutput] = useState<string>('Click "Run" to see output...');
  const [terminalOutput, setTerminalOutput] = useState<string[]>([
    'Welcome to CodeCraft Terminal v2.0',
    'Type "help" for a list of commands.'
  ]);
  const [terminalInput, setTerminalInput] = useState('');
  const [terminalCwd, setTerminalCwd] = useState<string | null>(null); // null is root
  const [isRunning, setIsRunning] = useState(false);
  const [isSidebarOpen, setIsSidebarOpen] = useState(true);
  const [isChatOpen, setIsChatOpen] = useState(false);
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([]);
  const [chatInput, setChatInput] = useState('');
  const [isChatLoading, setIsChatLoading] = useState(false);
  const [showPreview, setShowPreview] = useState(false);
  const [pendingEdit, setPendingEdit] = useState<PendingEdit | null>(null);
  const [draggedItemId, setDraggedItemId] = useState<string | null>(null);
  const [sidebarWidth, setSidebarWidth] = useState(260);
  const [bottomHeight, setBottomHeight] = useState(300);
  const [terminalRatio, setTerminalRatio] = useState(0.5);
  const [isBottomSwapped, setIsBottomSwapped] = useState(false);
  const [namingState, setNamingState] = useState<{ type: 'file' | 'folder', parentId: string | null } | null>(null);
  const [namingName, setNamingName] = useState('');
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [renamingName, setRenamingName] = useState('');
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [settings, setSettings] = useState<AppSettings>(() => {
    const saved = localStorage.getItem('codecraft-settings');
    return saved ? JSON.parse(saved) : DEFAULT_SETTINGS;
  });
  const editorRef = useRef<any>(null);
  const outputContainerRef = useRef<HTMLDivElement>(null);
  const terminalContainerRef = useRef<HTMLDivElement>(null);

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

  // Initialize Gemini
  const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY || '' });

  // Save settings to localStorage
  useEffect(() => {
    localStorage.setItem('codecraft-settings', JSON.stringify(settings));
  }, [settings]);

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

  const runPython = async (code: string) => {
    try {
      if (!(window as any).pyodide) {
        setOutput(prev => prev + (prev ? '\n' : '') + 'Loading Python runtime (Pyodide)... this may take a few seconds.');
        (window as any).pyodide = await (window as any).loadPyodide();
      }
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
      
      setOutput(prev => prev + (prev ? '\n' : '') + 'Executing Python...');
      const result = await pyodide.runPythonAsync(code);
      
      if (result !== undefined) {
        setOutput(prev => prev + (prev ? '\n' : '') + `Return value: ${String(result)}`);
      }
    } catch (err) {
      setOutput(prev => prev + (prev ? '\n' : '') + `Python Error: ${err instanceof Error ? err.message : String(err)}`);
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
      if (activeItem.type === 'file' && activeItem.language === 'javascript') {
        runJavaScript(activeItem.content || '');
        return;
      }

      if (activeItem.type === 'file' && activeItem.language === 'python') {
        await runPython(activeItem.content || '');
        return;
      }

      // Fallback for unsupported languages
      if (activeItem.type === 'file') {
        setOutput(`Error: No local runtime available for ${activeItem.language}. Only HTML, JavaScript, and Python are supported for local execution.`);
      } else {
        setOutput('Error: Cannot run a folder.');
      }
    } catch (error) {
      setOutput(`Error: ${error instanceof Error ? error.message : 'Execution failed'}`);
    } finally {
      setIsRunning(false);
    }
  };

  const handleChatSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!chatInput.trim() || isChatLoading) return;

    // Get selection context if available
    let selectionContext = "";
    if (editorRef.current && activeItem) {
      const selection = editorRef.current.getSelection();
      const model = editorRef.current.getModel();
      if (selection && model && !selection.isEmpty()) {
        const selectedText = model.getValueInRange(selection);
        selectionContext = `\n\n[User has selected the following code in ${activeItem.name}]:\n\`\`\`${activeItem.language || 'text'}\n${selectedText}\n\`\`\``;
      }
    }

    const userMsg: ChatMessage = { role: 'user', content: chatInput + selectionContext };
    setChatMessages(prev => [...prev, { role: 'user', content: chatInput }]); // Show clean input to user
    setChatInput('');
    setIsChatLoading(true);

    try {
      const prompt = `
        Context: You are an AI coding assistant inside CodeCraft IDE.
        You have access to tools to propose edits to files, navigate between files/folders, and move the cursor.
        When you want to change code, use 'proposeEdit' so the user can review it.
        
        Current File System:
        ${files.map(f => `- Path: ${getPath(f.id)}, Type: ${f.type}, Language: ${f.language || 'N/A'}`).join('\n')}
        
        Active Item: ${activeItem ? getPath(activeItem.id) : 'None selected'}
        ${activeItem ? (activeItem.type === 'file' ? `Content:\n${activeItem.content}` : 'This is a folder.') : 'No file is currently active.'}
        
        ${userMsg.content}
      `;

      const response = await ai.models.generateContent({
        model: "gemini-3-flash-preview",
        contents: prompt,
        config: {
          tools: [{ 
            functionDeclarations: [proposeEditTool, navigateToTool, moveCursorTool] 
          }],
        }
      });

      // Handle function calls
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
              setChatMessages(prev => [...prev, { role: 'assistant', content: `I've proposed some changes to \`${targetFile.name}\`. Please review them in the editor.` }]);
            } else {
              setChatMessages(prev => [...prev, { role: 'assistant', content: `I couldn't find a file at \`${pathOrName}\` to edit.` }]);
            }
          } else if (call.name === 'navigateTo') {
            const { pathOrName } = call.args as any;
            const target = findItem(pathOrName);
            if (target) {
              setActiveFileId(target.id);
              if (target.type === 'folder') {
                setFiles(prev => prev.map(f => f.id === target.id ? { ...f, isOpen: true } : f));
              }
              setChatMessages(prev => [...prev, { role: 'assistant', content: `Navigated to \`${pathOrName}\`.` }]);
            } else {
              setChatMessages(prev => [...prev, { role: 'assistant', content: `I couldn't find \`${pathOrName}\`.` }]);
            }
          } else if (call.name === 'moveCursor') {
            const { line, column } = call.args as any;
            if (editorRef.current) {
              editorRef.current.setPosition({ lineNumber: line, column: column });
              editorRef.current.revealPositionInCenter({ lineNumber: line, column: column });
              editorRef.current.focus();
            }
            setChatMessages(prev => [...prev, { role: 'assistant', content: `Moved cursor to line ${line}, column ${column}.` }]);
          }
        }
      }

      if (response.text) {
        setChatMessages(prev => [...prev, { role: 'assistant', content: response.text }]);
      }
    } catch (error) {
      console.error(error);
      setChatMessages(prev => [...prev, { role: 'assistant', content: 'Sorry, I encountered an error connecting to the AI.' }]);
    } finally {
      setIsChatLoading(false);
    }
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
        language: type === 'file' ? 'text' : undefined
      };

      setFiles(prev => {
        const updated = [...prev, newItem];
        if (parentId) {
          return updated.map(f => f.id === parentId ? { ...f, isOpen: true } : f);
        }
        return updated;
      });
      
      setRenamingId(id);
      setRenamingName('');
      if (type === 'file') setActiveFileId(id);
    }
  };

  const confirmRename = () => {
    if (!renamingId) return;
    const name = renamingName.trim();
    
    if (!name) {
      // If name is empty, delete the newly created item
      setFiles(prev => prev.filter(f => f.id !== renamingId));
    } else {
      setFiles(prev => prev.map(f => 
        f.id === renamingId 
          ? { ...f, name, language: f.type === 'file' ? name.split('.').pop() || 'text' : undefined } 
          : f
      ));
    }
    
    setRenamingId(null);
    setRenamingName('');
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
      language: type === 'file' ? name.split('.').pop() || 'text' : undefined
    };

    setFiles(prev => {
      const updated = [...prev, newItem];
      if (parentId) {
        return updated.map(f => f.id === parentId ? { ...f, isOpen: true } : f);
      }
      return updated;
    });
    
    if (type === 'file') setActiveFileId(id);
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
    
    setFiles(prev => prev.filter(f => !toDelete.includes(f.id)));
    if (toDelete.includes(activeFileId)) setActiveFileId(files.find(f => !toDelete.includes(f.id))?.id || '');
  };

  const handleTerminalCommand = async (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      const fullInput = terminalInput.trim();
      const args = fullInput.split(/\s+/);
      const cmd = args[0].toLowerCase();
      const newOutput = [...terminalOutput, `${terminalCwd ? getPath(terminalCwd) : '~'} $ ${terminalInput}`];
      
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
          setFiles(prev => [...prev, { id, name, type: 'file', parentId: terminalCwd, content: '', language: name.split('.').pop() || 'text' }]);
          setTerminalOutput(newOutput);
        } else {
          setTerminalOutput([...newOutput, 'touch: missing operand']);
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
        if (subCmd === 'install' && pkg) {
          setTerminalOutput([...newOutput, `Collecting ${pkg}...`, `Downloading ${pkg}...`]);
          try {
            if (!(window as any).pyodide) {
              setTerminalOutput(prev => [...prev, 'Loading Pyodide...']);
              (window as any).pyodide = await (window as any).loadPyodide();
            }
            const pyodide = (window as any).pyodide;
            await pyodide.loadPackage("micropip");
            const micropip = pyodide.pyimport("micropip");
            await micropip.install(pkg);
            setTerminalOutput(prev => [...prev, `Successfully installed ${pkg}`]);
          } catch (err) {
            setTerminalOutput(prev => [...prev, `pip error: ${err instanceof Error ? err.message : String(err)}`]);
          }
        } else {
          setTerminalOutput([...newOutput, 'Usage: pip install <package>']);
        }
      } else if (cmd === 'help') {
        setTerminalOutput([...newOutput, 'Standard commands: ls, pwd, cd, mkdir, touch, cat, rm, clear, help, date, echo', 'Python: pip install <package>']);
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
      
      setTerminalInput('');
    }
  };

  const handleSidebarResize = (e: React.MouseEvent) => {
    const startX = e.clientX;
    const startWidth = sidebarWidth;
    
    const onMouseMove = (moveEvent: MouseEvent) => {
      const newWidth = startWidth + (moveEvent.clientX - startX);
      setSidebarWidth(Math.max(150, Math.min(500, newWidth)));
    };
    
    const onMouseUp = () => {
      document.removeEventListener('mousemove', onMouseMove);
      document.removeEventListener('mouseup', onMouseUp);
    };
    
    document.addEventListener('mousemove', onMouseMove);
    document.addEventListener('mouseup', onMouseUp);
  };

  const handleBottomResize = (e: React.MouseEvent) => {
    const startY = e.clientY;
    const startHeight = bottomHeight;
    
    const onMouseMove = (moveEvent: MouseEvent) => {
      const newHeight = startHeight - (moveEvent.clientY - startY);
      setBottomHeight(Math.max(100, Math.min(window.innerHeight - 200, newHeight)));
    };
    
    const onMouseUp = () => {
      document.removeEventListener('mousemove', onMouseMove);
      document.removeEventListener('mouseup', onMouseUp);
    };
    
    document.addEventListener('mousemove', onMouseMove);
    document.addEventListener('mouseup', onMouseUp);
  };

  const handlePanelSplitResize = (e: React.MouseEvent) => {
    const startX = e.clientX;
    const startRatio = terminalRatio;
    const containerWidth = window.innerWidth - (isSidebarOpen ? sidebarWidth : 0);
    
    const onMouseMove = (moveEvent: MouseEvent) => {
      const delta = (moveEvent.clientX - startX) / containerWidth;
      const newRatio = isBottomSwapped ? startRatio + delta : startRatio - delta;
      setTerminalRatio(Math.max(0.1, Math.min(0.9, newRatio)));
    };
    
    const onMouseUp = () => {
      document.removeEventListener('mousemove', onMouseMove);
      document.removeEventListener('mouseup', onMouseUp);
    };
    
    document.addEventListener('mousemove', onMouseMove);
    document.addEventListener('mouseup', onMouseUp);
  };

  const toggleFolder = (id: string) => {
    setFiles(prev => prev.map(f => f.id === id ? { ...f, isOpen: !f.isOpen } : f));
  };

  const handleDrop = (targetId: string | null) => {
    if (!draggedItemId || draggedItemId === targetId) return;
    
    const isChild = (childId: string, parentId: string): boolean => {
      const item = files.find(f => f.id === childId);
      if (!item || !item.parentId) return false;
      if (item.parentId === parentId) return true;
      return isChild(item.parentId, parentId);
    };

    if (targetId && isChild(targetId, draggedItemId)) return;

    setFiles(prev => prev.map(f => f.id === draggedItemId ? { ...f, parentId: targetId } : f));
    setDraggedItemId(null);
  };

  const FileTreeItem = ({ item, depth = 0 }: { item: FSItem, depth?: number }) => {
    const children = files.filter(f => f.parentId === item.id);
    const isActive = activeFileId === item.id;
    const isRenaming = renamingId === item.id;

    return (
      <div className="flex flex-col">
        <div 
          draggable={!isRenaming}
          onDragStart={(e) => {
            if (isRenaming) return;
            setDraggedItemId(item.id);
            e.dataTransfer.setData('text/plain', item.id);
            e.dataTransfer.effectAllowed = 'move';
          }}
          onDragOver={(e) => {
            e.preventDefault();
            e.stopPropagation();
            if (item.type === 'folder') e.currentTarget.classList.add('bg-white/10');
          }}
          onDragLeave={(e) => {
            e.stopPropagation();
            e.currentTarget.classList.remove('bg-white/10');
          }}
          onDrop={(e) => {
            e.preventDefault();
            e.stopPropagation();
            e.currentTarget.classList.remove('bg-white/10');
            handleDrop(item.type === 'folder' ? item.id : item.parentId);
          }}
          onClick={() => {
            if (isRenaming) return;
            if (item.type === 'folder') toggleFolder(item.id);
            setActiveFileId(item.id);
          }}
          className={cn(
            "group flex items-center justify-between px-4 py-2 cursor-pointer transition-all border-l-2 relative",
            isActive ? "bg-indigo-600/20 border-indigo-500 text-white" : "border-transparent text-zinc-400 hover:bg-white/5",
            draggedItemId === item.id && "opacity-50",
            isRenaming && "bg-indigo-600/10"
          )}
          style={{ paddingLeft: `${depth * 1.5 + 1}rem` }}
        >
          <div className="flex items-center gap-2 overflow-hidden flex-1">
            {item.type === 'folder' ? (
              <>
                {item.isOpen ? <ChevronDown size={14} className="shrink-0" /> : <ChevronRight size={14} className="shrink-0" />}
                <Folder size={16} className={cn("shrink-0", isActive ? "text-indigo-400" : "text-amber-400")} />
              </>
            ) : (
              <>
                <div className="w-3.5 shrink-0" /> {/* Spacer to align with folder icons */}
                <FileCode size={16} className={cn("shrink-0", isActive ? "text-indigo-400" : "text-zinc-500")} />
              </>
            )}
            {isRenaming ? (
              <input
                autoFocus
                type="text"
                value={renamingName}
                onChange={(e) => setRenamingName(e.target.value)}
                onBlur={confirmRename}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') confirmRename();
                  if (e.key === 'Escape') {
                    setRenamingId(null);
                    setRenamingName('');
                    // If it was a new item with no name, delete it
                    if (!item.name) setFiles(prev => prev.filter(f => f.id !== item.id));
                  }
                }}
                className="bg-white/10 border border-indigo-500/50 rounded px-1 py-0.5 text-sm text-white focus:outline-none w-full"
                onClick={(e) => e.stopPropagation()}
              />
            ) : (
              <span className="truncate text-sm select-none">{item.name}</span>
            )}
          </div>
          {!isRenaming && (
            <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-all shrink-0">
              {item.type === 'folder' && (
                <>
                  <button 
                    onClick={(e) => { e.stopPropagation(); addNewItem('file', item.id, 'inline'); }}
                    className="p-1 hover:text-indigo-400 transition-colors"
                    title="New File in Folder"
                  >
                    <FilePlus size={14} />
                  </button>
                  <button 
                    onClick={(e) => { e.stopPropagation(); addNewItem('folder', item.id, 'inline'); }}
                    className="p-1 hover:text-amber-400 transition-colors"
                    title="New Folder in Folder"
                  >
                    <FolderPlus size={14} />
                  </button>
                </>
              )}
              <button 
                onClick={(e) => { e.stopPropagation(); deleteItem(item.id); }}
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
  };

  const updateContent = (content: string) => {
    setFiles(prev => prev.map(f => f.id === activeFileId ? { ...f, content } : f));
  };

  return (
    <div className="flex h-screen w-full bg-[#0a0a0a] text-zinc-300 overflow-hidden font-sans">
      {/* Sidebar */}
      <motion.aside 
        initial={false}
        animate={{ width: isSidebarOpen ? sidebarWidth : 0 }}
        className="border-r border-white/10 bg-[#0d0d0d] flex flex-col overflow-hidden relative group shrink-0"
      >
        <div className="p-4 flex items-center justify-between border-b border-white/5">
          <div className="flex items-center gap-2 font-bold text-white">
            <div className="w-8 h-8 bg-indigo-600 rounded-lg flex items-center justify-center">
              <Code2 size={18} />
            </div>
            <span>CodeCraft</span>
          </div>
          <div className="flex items-center gap-1">
            <button 
              onClick={() => addNewItem('folder', null, 'inline')} 
              className="p-1.5 hover:bg-white/5 rounded-md text-zinc-400 hover:text-white transition-colors"
              title="New Folder"
            >
              <FolderPlus size={16} />
            </button>
            <button 
              onClick={() => addNewItem('file', null, 'inline')} 
              className="p-1.5 hover:bg-white/5 rounded-md text-zinc-400 hover:text-white transition-colors"
              title="New File"
            >
              <FilePlus size={16} />
            </button>
          </div>
        </div>

        <div 
          className="flex-1 overflow-y-auto py-2 custom-scrollbar"
          onDragOver={(e) => e.preventDefault()}
          onDrop={() => handleDrop(null)}
        >
          {files.filter(f => !f.parentId).map(item => (
            <FileTreeItem key={item.id} item={item} />
          ))}
        </div>

        <div className="p-4 border-t border-white/5 bg-[#0a0a0a]">
          <div 
            onClick={() => setIsSettingsOpen(true)}
            className="flex items-center gap-3 px-2 py-1.5 rounded-md hover:bg-white/5 cursor-pointer transition-colors"
          >
            <Settings size={16} />
            <span className="text-sm">Settings</span>
          </div>
        </div>

        {/* Sidebar Resizer */}
        <div 
          onMouseDown={handleSidebarResize}
          className="absolute top-0 right-0 w-1 h-full cursor-col-resize hover:bg-indigo-500/50 transition-colors z-50"
        />
      </motion.aside>

      {/* Main Content */}
      <main className="flex-1 flex flex-col relative min-w-0">
        {/* Header */}
        <header className="h-14 border-b border-white/10 bg-[#0d0d0d] flex items-center justify-between px-4 shrink-0">
          <div className="flex items-center gap-4 overflow-hidden">
            <button 
              onClick={() => setIsSidebarOpen(!isSidebarOpen)}
              className="p-2 hover:bg-white/5 rounded-md text-zinc-400 shrink-0"
            >
              <ChevronRight className={cn("transition-transform", isSidebarOpen && "rotate-180")} size={20} />
            </button>
            <div className="flex items-center gap-2 text-sm font-medium text-zinc-400 overflow-hidden">
              <span className="hover:text-white cursor-pointer shrink-0" onClick={() => setActiveFileId('')}>src</span>
              <ChevronRight size={14} className="shrink-0" />
              <span className="text-white truncate">{activeItem ? getPath(activeItem.id) : 'No selection'}</span>
            </div>
          </div>

          <div className="flex items-center gap-2">
            {activeItem && activeItem.type === 'file' && activeItem.language === 'html' && (
              <button 
                onClick={() => setShowPreview(!showPreview)}
                className={cn(
                  "flex items-center gap-2 px-4 py-1.5 rounded-full text-sm font-semibold transition-all",
                  showPreview 
                    ? "bg-indigo-600 text-white" 
                    : "bg-white/5 text-zinc-400 hover:bg-white/10"
                )}
              >
                {showPreview ? <EyeOff size={16} /> : <Eye size={16} />}
                {showPreview ? 'Editor' : 'Preview'}
              </button>
            )}
            <button 
              onClick={handleRun}
              disabled={isRunning || !activeItem || activeItem.type === 'folder'}
              className={cn(
                "flex items-center gap-2 px-4 py-1.5 rounded-full text-sm font-semibold transition-all",
                (isRunning || !activeItem || activeItem.type === 'folder')
                  ? "bg-zinc-800 text-zinc-500 cursor-not-allowed" 
                  : "bg-emerald-600 hover:bg-emerald-500 text-white shadow-lg shadow-emerald-600/20"
              )}
            >
              {isRunning ? <Cpu className="animate-spin" size={16} /> : <Play size={16} />}
              Run
            </button>
            <button 
              onClick={() => setIsChatOpen(!isChatOpen)}
              className={cn(
                "p-2 rounded-full transition-all",
                isChatOpen ? "bg-indigo-600 text-white" : "bg-white/5 text-zinc-400 hover:bg-white/10"
              )}
            >
              <Sparkles size={20} />
            </button>
          </div>
        </header>

        {/* Editor & Terminal Split */}
        <div className="flex-1 flex flex-col min-h-0">
          {pendingEdit ? (
            <div className="flex-1 flex flex-col">
              <div className="h-10 bg-indigo-900/30 border-b border-indigo-500/30 flex items-center justify-between px-4">
                <div className="flex items-center gap-2 text-xs font-medium text-indigo-300">
                  <Sparkles size={14} />
                  <span>Reviewing changes to {files.find(f => f.id === pendingEdit.fileId)?.name}</span>
                </div>
                <div className="flex items-center gap-2">
                  <button 
                    onClick={declineEdit}
                    className="px-3 py-1 rounded bg-red-500/20 hover:bg-red-500/30 text-red-400 text-xs font-semibold transition-all flex items-center gap-1"
                  >
                    <X size={14} />
                    Decline
                  </button>
                  <button 
                    onClick={acceptEdit}
                    className="px-3 py-1 rounded bg-emerald-500/20 hover:bg-emerald-500/30 text-emerald-400 text-xs font-semibold transition-all flex items-center gap-1"
                  >
                    <Check size={14} />
                    Accept
                  </button>
                </div>
              </div>
              <div className="flex-1 overflow-hidden">
                <DiffEditor
                  height="100%"
                  original={pendingEdit.originalContent}
                  modified={pendingEdit.proposedContent}
                  language={files.find(f => f.id === pendingEdit.fileId)?.language}
                  theme="vs-dark"
                  options={{
                    fontSize: 14,
                    fontFamily: '"JetBrains Mono", "Fira Code", monospace',
                    minimap: { enabled: false },
                    scrollBeyondLastLine: false,
                    automaticLayout: true,
                    renderSideBySide: true,
                    readOnly: true,
                  }}
                />
              </div>
            </div>
          ) : !activeItem ? (
            <div className="flex-1 flex flex-col items-center justify-center bg-[#0d0d0d] text-zinc-500 p-8 text-center">
              <div className="w-20 h-20 bg-white/5 rounded-3xl flex items-center justify-center mb-6">
                <Code2 size={40} className="text-zinc-400" />
              </div>
              <h2 className="text-xl font-semibold text-white mb-2">Welcome to CodeCraft IDE</h2>
              <p className="max-w-md text-sm leading-relaxed mb-8">
                Select a file from the sidebar to start editing, or create a new one to begin your project.
              </p>
              <div className="flex gap-4">
                <button 
                  onClick={() => addNewItem('file', null, 'inline')}
                  className="flex items-center gap-2 px-6 py-2.5 bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl text-sm font-semibold transition-all shadow-lg shadow-indigo-900/20"
                >
                  <FilePlus size={18} />
                  New File
                </button>
                <button 
                  onClick={() => addNewItem('folder', null, 'inline')}
                  className="flex items-center gap-2 px-6 py-2.5 bg-white/5 hover:bg-white/10 text-white rounded-xl text-sm font-semibold transition-all border border-white/10"
                >
                  <FolderPlus size={18} />
                  New Folder
                </button>
              </div>
            </div>
          ) : activeItem.type === 'folder' ? (
            <div className="flex-1 bg-[#0d0d0d] p-8 overflow-y-auto">
              <div className="max-w-4xl mx-auto">
                <div className="flex items-center gap-4 mb-8">
                  <div className="w-16 h-16 bg-amber-500/10 rounded-2xl flex items-center justify-center">
                    <Folder size={32} className="text-amber-500" />
                  </div>
                  <div>
                    <h2 className="text-2xl font-bold text-white">{activeItem.name}</h2>
                    <p className="text-zinc-500 text-sm">{getPath(activeItem.id)}</p>
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                  {files.filter(f => f.parentId === activeItem.id).map(child => (
                    <div 
                      key={child.id}
                      onClick={() => {
                        setActiveFileId(child.id);
                        if (child.type === 'folder') toggleFolder(child.id);
                      }}
                      className="p-4 rounded-xl bg-white/5 border border-white/10 hover:bg-white/10 hover:border-indigo-500/30 transition-all cursor-pointer group"
                    >
                      <div className="flex items-center gap-3">
                        {child.type === 'folder' ? (
                          <Folder size={20} className="text-amber-400" />
                        ) : (
                          <FileCode size={20} className="text-indigo-400" />
                        )}
                        <span className="text-sm font-medium text-zinc-300 group-hover:text-white transition-colors">{child.name}</span>
                      </div>
                    </div>
                  ))}
                  <div 
                    onClick={() => addNewItem('file', activeItem.id)}
                    className="p-4 rounded-xl border border-dashed border-white/10 hover:border-indigo-500/50 hover:bg-indigo-500/5 transition-all cursor-pointer flex items-center gap-3 text-zinc-500 hover:text-indigo-400"
                  >
                    <Plus size={20} />
                    <span className="text-sm font-medium">Add File</span>
                  </div>
                  <div 
                    onClick={() => addNewItem('folder', activeItem.id)}
                    className="p-4 rounded-xl border border-dashed border-white/10 hover:border-amber-500/50 hover:bg-amber-500/5 transition-all cursor-pointer flex items-center gap-3 text-zinc-500 hover:text-amber-400"
                  >
                    <FolderPlus size={20} />
                    <span className="text-sm font-medium">Add Folder</span>
                  </div>
                </div>
              </div>
            </div>
          ) : showPreview && activeItem.language === 'html' ? (
            <div className="flex-1 bg-white">
              <iframe 
                title="preview"
                srcDoc={activeItem.content}
                className="w-full h-full border-none"
                sandbox="allow-scripts"
              />
            </div>
          ) : (
            <div className="flex-1 overflow-hidden bg-[#1e1e1e]">
              <Editor
                height="100%"
                language={activeItem.language}
                theme="vs-dark"
                value={activeItem.content}
                onMount={(editor) => {
                  editorRef.current = editor;
                }}
                onChange={(value) => {
                  setFiles(prev => prev.map(f => f.id === activeFileId ? { ...f, content: value || '' } : f));
                }}
                options={{
                  fontSize: settings.fontSize,
                  fontFamily: '"JetBrains Mono", "Fira Code", monospace',
                  minimap: { enabled: true },
                  scrollBeyondLastLine: false,
                  automaticLayout: true,
                  padding: { top: 20 },
                  lineNumbers: 'on',
                  renderLineHighlight: 'all',
                  scrollbar: {
                    vertical: 'visible',
                    horizontal: 'visible',
                    useShadows: false,
                    verticalScrollbarSize: 10,
                    horizontalScrollbarSize: 10,
                  },
                }}
              />
            </div>
          )}

            {/* Bottom Panels Resizer */}
            <div 
              onMouseDown={handleBottomResize}
              className="h-1 w-full cursor-row-resize hover:bg-indigo-500/50 transition-colors z-50 bg-white/5"
            />

            {/* Bottom Panels */}
            <div 
              style={{ height: bottomHeight }}
              className="border-t border-white/10 bg-[#0d0d0d] flex relative shrink-0"
            >
              {/* Panels Container */}
              <div className={cn("flex-1 flex", isBottomSwapped ? "flex-row-reverse" : "flex-row")}>
                {/* Output Panel */}
                <div 
                  style={{ width: `${(1 - terminalRatio) * 100}%` }}
                  className={cn("flex flex-col", isBottomSwapped ? "border-l" : "border-r", "border-white/10")}
                >
                  <div className="flex items-center justify-between px-4 py-2 border-b border-white/5 bg-white/2">
                    <div className="flex items-center gap-2 text-[10px] uppercase tracking-widest font-bold text-zinc-500">
                      <Play size={12} className="text-emerald-500" />
                      Output
                    </div>
                    <div className="flex items-center gap-2">
                      <button 
                        onClick={() => setIsBottomSwapped(!isBottomSwapped)}
                        className="text-[10px] text-zinc-500 hover:text-zinc-300 flex items-center gap-1"
                        title="Swap Panels"
                      >
                        <Settings size={10} />
                      </button>
                      <button onClick={() => setOutput('')} className="text-[10px] text-zinc-500 hover:text-zinc-300">Clear</button>
                    </div>
                  </div>
                  <div 
                    ref={outputContainerRef}
                    className="flex-1 p-4 font-mono text-sm overflow-y-auto whitespace-pre-wrap text-zinc-400 custom-scrollbar"
                  >
                    {output}
                  </div>
                </div>

                {/* Panel Split Resizer */}
                <div 
                  onMouseDown={handlePanelSplitResize}
                  className="w-1 h-full cursor-col-resize hover:bg-indigo-500/50 transition-colors z-50 bg-white/5"
                />

                {/* Terminal Panel */}
                <div 
                  style={{ width: `${terminalRatio * 100}%` }}
                  className="flex flex-col"
                >
                  <div className="flex items-center justify-between px-4 py-2 border-b border-white/5 bg-white/2">
                    <div className="flex items-center gap-2 text-[10px] uppercase tracking-widest font-bold text-zinc-500">
                      <TerminalIcon size={12} className="text-indigo-400" />
                      Terminal
                    </div>
                    <button onClick={() => setTerminalOutput([])} className="text-[10px] text-zinc-500 hover:text-zinc-300">Reset</button>
                  </div>
                  <div 
                    ref={terminalContainerRef}
                    className="flex-1 p-4 font-mono text-sm overflow-y-auto flex flex-col custom-scrollbar"
                  >
                    <div className="space-y-1 mb-2">
                      {terminalOutput.map((line, i) => (
                        <div key={i} className="text-zinc-400">{line}</div>
                      ))}
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="text-zinc-500 font-mono text-xs">{terminalCwd ? getPath(terminalCwd) : '~'}</span>
                      <span className="text-indigo-400 font-bold">$</span>
                      <input 
                        type="text"
                        value={terminalInput}
                        onChange={(e) => setTerminalInput(e.target.value)}
                        onKeyDown={handleTerminalCommand}
                        className="flex-1 bg-transparent border-none outline-none text-white p-0 m-0 font-mono text-sm"
                        autoFocus
                      />
                    </div>
                  </div>
                </div>
              </div>
            </div>
        </div>

        {/* AI Chat Drawer */}
        <AnimatePresence>
          {isChatOpen && (
            <motion.div 
              initial={{ x: '100%' }}
              animate={{ x: 0 }}
              exit={{ x: '100%' }}
              transition={{ type: 'spring', damping: 25, stiffness: 200 }}
              className="absolute top-0 right-0 bottom-0 w-80 bg-[#0d0d0d] border-l border-white/10 shadow-2xl z-50 flex flex-col"
            >
              <div className="p-4 border-b border-white/5 flex items-center justify-between bg-indigo-600/5">
                <div className="flex items-center gap-2 text-indigo-400 font-semibold">
                  <Sparkles size={18} />
                  <span>AI Assistant</span>
                </div>
                <button onClick={() => setIsChatOpen(false)} className="p-1 hover:bg-white/5 rounded-md">
                  <X size={18} />
                </button>
              </div>

              <div className="flex-1 overflow-y-auto p-4 space-y-4 custom-scrollbar">
                {chatMessages.length === 0 && (
                  <div className="text-center py-10 space-y-4">
                    <div className="w-12 h-12 bg-indigo-600/20 rounded-full flex items-center justify-center mx-auto text-indigo-400">
                      <MessageSquare size={24} />
                    </div>
                    <p className="text-sm text-zinc-500 px-4">
                      Ask me anything about your code! I can explain logic, find bugs, or suggest improvements.
                    </p>
                  </div>
                )}
                {chatMessages.map((msg, i) => (
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

              <form onSubmit={handleChatSubmit} className="p-4 border-t border-white/5 bg-[#0a0a0a]">
                <div className="relative flex flex-col gap-2">
                  <textarea 
                    value={chatInput}
                    onChange={(e) => setChatInput(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' && !e.shiftKey) {
                        e.preventDefault();
                        handleChatSubmit(e);
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
            </motion.div>
          )}
        </AnimatePresence>
      </main>

      {/* New Item Modal */}
      <AnimatePresence>
        {namingState && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
            <motion.div 
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="w-full max-w-md bg-[#1a1a1a] border border-white/10 rounded-2xl shadow-2xl overflow-hidden"
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
              className="w-full max-w-lg bg-[#1a1a1a] border border-white/10 rounded-2xl shadow-2xl overflow-hidden flex flex-col max-h-[80vh]"
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

      <style dangerouslySetInnerHTML={{ __html: `
        .custom-scrollbar::-webkit-scrollbar {
          width: 6px;
          height: 6px;
        }
        .custom-scrollbar::-webkit-scrollbar-track {
          background: transparent;
        }
        .custom-scrollbar::-webkit-scrollbar-thumb {
          background: rgba(255, 255, 255, 0.1);
          border-radius: 10px;
        }
        .custom-scrollbar::-webkit-scrollbar-thumb:hover {
          background: rgba(255, 255, 255, 0.2);
        }
        textarea {
          caret-color: white;
        }
      `}} />
    </div>
  );
}
