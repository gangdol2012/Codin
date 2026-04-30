import {
  ConsoleStdout,
  Directory,
  Fd,
  File,
  PreopenDirectory,
  WASI,
  wasi,
} from '@bjorn3/browser_wasi_shim';

interface RunnerFile {
  path: string;
  content: string;
}

interface RunMessage {
  type: 'run';
  wasmBytes: Uint8Array;
  files: RunnerFile[];
  stdinPrompt: string;
}

interface BuiltImports {
  imports: WebAssembly.Imports;
  memory?: WebAssembly.Memory;
}

const workerScope = self as any;
const textEncoder = new TextEncoder();
const textDecoder = new TextDecoder();

function normalizeProjectPath(path: string) {
  const resolved: string[] = [];
  for (const raw of path.replace(/\\/g, '/').split('/')) {
    const part = raw.trim();
    if (!part || part === '.') continue;
    if (part === '..') {
      resolved.pop();
      continue;
    }
    resolved.push(part);
  }
  return resolved.join('/');
}

function requestInputSync(prompt: string) {
  if (typeof SharedArrayBuffer !== 'function') {
    throw new Error('SharedArrayBuffer is required for runtime-interactive C/C++ stdin.');
  }

  const headerBuffer = new SharedArrayBuffer(Int32Array.BYTES_PER_ELEMENT * 2);
  const payloadBuffer = new SharedArrayBuffer(262144);
  const header = new Int32Array(headerBuffer);
  workerScope.postMessage({
    type: 'stdin-request',
    prompt,
    headerBuffer,
    payloadBuffer,
  });

  Atomics.wait(header, 0, 0);
  const payloadLength = Math.max(0, Atomics.load(header, 1));
  const sharedPayload = new Uint8Array(payloadBuffer, 0, payloadLength);
  const decodedPayload = new Uint8Array(payloadLength);
  decodedPayload.set(sharedPayload);
  const json = textDecoder.decode(decodedPayload);
  const parsed = json ? JSON.parse(json) : { value: '' };
  if (parsed?.__codecraftError) {
    throw new Error(String(parsed.__codecraftError));
  }
  return String(parsed?.value ?? '');
}

class InteractiveStdin extends Fd {
  private buffer = new Uint8Array(0);

  constructor(private readonly prompt: string) {
    super();
  }

  fd_fdstat_get() {
    const fdstat = new wasi.Fdstat(wasi.FILETYPE_CHARACTER_DEVICE, 0);
    fdstat.fs_rights_base = BigInt(wasi.RIGHTS_FD_READ);
    return { ret: wasi.ERRNO_SUCCESS, fdstat };
  }

  fd_filestat_get() {
    return {
      ret: wasi.ERRNO_SUCCESS,
      filestat: new wasi.Filestat(0n, wasi.FILETYPE_CHARACTER_DEVICE, 0n),
    };
  }

  fd_read(size: number) {
    if (this.buffer.byteLength === 0) {
      this.buffer = textEncoder.encode(`${requestInputSync(this.prompt)}\n`);
    }

    const data = this.buffer.slice(0, size);
    this.buffer = this.buffer.slice(data.byteLength);
    return { ret: wasi.ERRNO_SUCCESS, data };
  }
}

function buildDirectoryContents(files: RunnerFile[]) {
  const root = new Map<string, any>();

  for (const file of files) {
    const parts = normalizeProjectPath(file.path).split('/').filter(Boolean);
    if (parts.length === 0) continue;

    let current = root;
    for (let index = 0; index < parts.length; index++) {
      const part = parts[index];
      if (!part) continue;

      if (index === parts.length - 1) {
        current.set(part, new File(textEncoder.encode(file.content)));
        continue;
      }

      const existing = current.get(part);
      if (existing instanceof Directory) {
        current = existing.contents;
        continue;
      }

      const directory = new Directory(new Map());
      current.set(part, directory);
      current = directory.contents;
    }
  }

  return root;
}

function createFallbackImport(importKind: WebAssembly.ImportExportKind, useSharedMemory: boolean) {
  switch (importKind) {
    case 'function':
      return () => 0;
    case 'memory':
      return new WebAssembly.Memory(useSharedMemory
        ? { initial: 256, maximum: 4096, shared: true }
        : { initial: 256, maximum: 4096 });
    case 'table':
      return new WebAssembly.Table({ initial: 0, element: 'anyfunc' });
    case 'global':
      return new WebAssembly.Global({ value: 'i32', mutable: true }, 0);
    default:
      return {};
  }
}

function buildImportObject(module: WebAssembly.Module, wasiImport: Record<string, unknown>, useSharedMemory: boolean): BuiltImports {
  const imports: WebAssembly.Imports = {
    env: {},
    wasi_snapshot_preview1: wasiImport as WebAssembly.ModuleImports,
    wasi_unstable: wasiImport as WebAssembly.ModuleImports,
  };
  let importedMemory: WebAssembly.Memory | undefined;

  for (const descriptor of WebAssembly.Module.imports(module)) {
    if (!imports[descriptor.module]) {
      imports[descriptor.module] = {};
    }
    const moduleImports = imports[descriptor.module] as WebAssembly.ModuleImports;
    if (moduleImports[descriptor.name] === undefined) {
      const fallbackImport = createFallbackImport(descriptor.kind, useSharedMemory) as WebAssembly.ImportValue;
      moduleImports[descriptor.name] = fallbackImport;
      if (descriptor.kind === 'memory') {
        importedMemory = fallbackImport as WebAssembly.Memory;
      }
    }
  }

  return { imports, memory: importedMemory };
}

function expectsSharedImportedMemory(error: unknown) {
  const message = error instanceof Error ? error.message : String(error);
  return message.includes('WebAssembly.instantiate')
    && message.includes('mismatch in shared state of memory')
    && message.includes('declared = 1')
    && message.includes('imported = 0');
}

async function runProgram(message: RunMessage) {
  let stdout = '';
  let stderr = '';
  const stdoutDecoder = new TextDecoder();
  const stderrDecoder = new TextDecoder();
  const fds = [
    new InteractiveStdin(message.stdinPrompt),
    new ConsoleStdout((buffer: Uint8Array) => {
      const text = stdoutDecoder.decode(buffer, { stream: true });
      stdout += text;
      workerScope.postMessage({ type: 'stdout', text });
    }),
    new ConsoleStdout((buffer: Uint8Array) => {
      const text = stderrDecoder.decode(buffer, { stream: true });
      stderr += text;
      workerScope.postMessage({ type: 'stderr', text });
    }),
    new PreopenDirectory('.', buildDirectoryContents(message.files)),
  ];

  const runner = new WASI(['codecraft-output.wasm'], [], fds);
  const wasmBytes = new Uint8Array(message.wasmBytes);
  const module = await WebAssembly.compile(wasmBytes.buffer.slice(wasmBytes.byteOffset, wasmBytes.byteOffset + wasmBytes.byteLength));
  let instance: WebAssembly.Instance;
  let importedMemory: WebAssembly.Memory | undefined;
  try {
    const builtImports = buildImportObject(module, runner.wasiImport, false);
    importedMemory = builtImports.memory;
    instance = await WebAssembly.instantiate(module, builtImports.imports);
  } catch (error) {
    if (!expectsSharedImportedMemory(error)) throw error;
    const builtImports = buildImportObject(module, runner.wasiImport, true);
    importedMemory = builtImports.memory;
    instance = await WebAssembly.instantiate(module, builtImports.imports);
  }
  const exports = instance.exports as Record<string, unknown>;
  const wasiInstance = exports.memory
    ? instance
    : { exports: { ...exports, memory: importedMemory } };

  let code = 0;
  if (typeof exports._start === 'function') {
    code = runner.start(wasiInstance as any);
  } else if (typeof exports._initialize === 'function') {
    runner.initialize(wasiInstance as any);
  } else if (typeof exports.main === 'function') {
    code = Number((exports.main as () => unknown)() ?? 0);
  } else {
    throw new Error('Compiled WebAssembly does not export a WASI _start, _initialize, or main entry point.');
  }

  const stdoutTail = stdoutDecoder.decode();
  const stderrTail = stderrDecoder.decode();
  if (stdoutTail) {
    stdout += stdoutTail;
    workerScope.postMessage({ type: 'stdout', text: stdoutTail });
  }
  if (stderrTail) {
    stderr += stderrTail;
    workerScope.postMessage({ type: 'stderr', text: stderrTail });
  }

  workerScope.postMessage({
    type: 'done',
    result: {
      ok: code === 0,
      code,
      stdout,
      stderr,
    },
  });
}

workerScope.onmessage = (event: MessageEvent<RunMessage>) => {
  const message = event.data;
  if (message?.type !== 'run') return;

  runProgram(message).catch(error => {
    workerScope.postMessage({
      type: 'error',
      message: error instanceof Error && error.stack ? error.stack : String(error),
    });
  });
};
