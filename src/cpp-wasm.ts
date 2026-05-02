export type CxxRuntimeLanguage = 'c' | 'cpp';
export type CxxCStandard = 'c11' | 'c17' | 'c23';
export type CxxCppStandard = 'c++17' | 'c++20' | 'c++23';
export type CxxOptimizationLevel = 'O0' | 'O1' | 'O2' | 'O3';

export interface CxxProjectFile {
  path: string;
  content: string;
  language: CxxRuntimeLanguage;
}

export interface CxxRunOptions {
  files: CxxProjectFile[];
  entryPath: string;
  language: CxxRuntimeLanguage;
  cStandard: CxxCStandard;
  cppStandard: CxxCppStandard;
  optimization: CxxOptimizationLevel;
  stdin?: string;
  onStatus?: (message: string) => void;
  onStdout?: (chunk: string) => void;
  onStderr?: (chunk: string) => void;
  requestStdin?: (prompt: string) => Promise<string | null | undefined>;
}

export interface CxxProcessResult {
  ok: boolean;
  code: number;
  stdout: string;
  stderr: string;
}

export interface CxxRunResult {
  compilerPackage: 'local' | 'registry';
  compile: CxxProcessResult;
  run: CxxProcessResult;
  outputWasmSize: number;
}

export class CxxRuntimeError extends Error {
  readonly compile?: CxxProcessResult;
  readonly run?: CxxProcessResult;

  constructor(message: string, details?: { compile?: CxxProcessResult; run?: CxxProcessResult }) {
    super(message);
    this.name = 'CxxRuntimeError';
    this.compile = details?.compile;
    this.run = details?.run;
  }
}

interface LoadedClangPackage {
  sdk: any;
  clang: any;
  source: 'local' | 'registry';
}

let wasmerSdkPromise: Promise<any> | null = null;
let clangPackagePromise: Promise<LoadedClangPackage> | null = null;

function disposeMaybe(value: unknown) {
  const candidate = value as {
    dispose?: () => unknown;
    close?: () => unknown;
    free?: () => unknown;
  } | null | undefined;
  try {
    if (typeof candidate?.dispose === 'function') {
      candidate.dispose();
    } else if (typeof candidate?.close === 'function') {
      candidate.close();
    } else if (typeof candidate?.free === 'function') {
      candidate.free();
    }
  } catch {
    // Runtime packages do not expose a stable disposal API across SDK builds.
  }
}

export function disposeCxxRuntime() {
  const pendingClangPackage = clangPackagePromise;
  const pendingWasmerSdk = wasmerSdkPromise;
  clangPackagePromise = null;
  wasmerSdkPromise = null;

  void pendingClangPackage
    ?.then(({ sdk, clang }) => {
      disposeMaybe(clang);
      disposeMaybe(sdk);
    })
    .catch(() => {});

  void pendingWasmerSdk
    ?.then(sdk => disposeMaybe(sdk))
    .catch(() => {});
}

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

function dirname(path: string) {
  const normalized = normalizeProjectPath(path);
  const index = normalized.lastIndexOf('/');
  return index >= 0 ? normalized.slice(0, index) : '';
}

function isCSourcePath(path: string) {
  return /\.c$/i.test(path);
}

function isCppSourcePath(path: string) {
  return /\.(?:cpp|cc|cxx|c\+\+)$/i.test(path);
}

function isHeaderPath(path: string) {
  return /\.(?:h|hh|hpp|hxx|ipp|tpp)$/i.test(path);
}

function toProcessResult(raw: any): CxxProcessResult {
  return {
    ok: !!raw?.ok,
    code: typeof raw?.code === 'number' ? raw.code : (raw?.ok ? 0 : 1),
    stdout: typeof raw?.stdout === 'string' ? raw.stdout : '',
    stderr: typeof raw?.stderr === 'string' ? raw.stderr : '',
  };
}

async function loadWasmerSdk() {
  if (!wasmerSdkPromise) {
    wasmerSdkPromise = (async () => {
      if (!crossOriginIsolated) {
        throw new Error('SharedArrayBuffer is not available. Restart the dev server so the Cross-Origin-Opener-Policy and Cross-Origin-Embedder-Policy headers are active, then hard-refresh.');
      }
      const sdk = await import('@wasmer/sdk') as any;
      await sdk.init({});
      return sdk;
    })();
  }
  return wasmerSdkPromise;
}

async function loadClangPackage(onStatus?: (message: string) => void): Promise<LoadedClangPackage> {
  if (!clangPackagePromise) {
    clangPackagePromise = (async () => {
      const sdk = await loadWasmerSdk();

      try {
        onStatus?.('Looking for local C/C++ compiler package...');
        const local = await fetch('/clang.webc', { cache: 'force-cache' });
        if (local.ok) {
          const bytes = new Uint8Array(await local.arrayBuffer());
          if (bytes.byteLength > 0) {
            onStatus?.('Loading local Clang compiler package...');
            return {
              sdk,
              clang: await sdk.Wasmer.fromFile(bytes),
              source: 'local' as const,
            };
          }
        }
      } catch {
        // Fall through to the registry package.
      }

      onStatus?.('Downloading Clang compiler package from Wasmer registry...');
      return {
        sdk,
        clang: await sdk.Wasmer.fromRegistry('clang/clang'),
        source: 'registry' as const,
      };
    })();
  }

  const loaded = await clangPackagePromise;
  onStatus?.(loaded.source === 'local'
    ? 'Clang compiler ready.'
    : 'Clang compiler ready from Wasmer registry.');
  return loaded;
}

async function ensureDirectory(project: any, path: string, createdDirs: Set<string>) {
  const normalized = normalizeProjectPath(path);
  if (!normalized) return;

  const parts = normalized.split('/');
  for (let i = 1; i <= parts.length; i++) {
    const dir = parts.slice(0, i).join('/');
    if (!dir || createdDirs.has(dir)) continue;
    try {
      await project.createDir(dir);
    } catch {
      // Directory may already exist in the virtual filesystem.
    }
    createdDirs.add(dir);
  }
}

async function writeProjectFiles(sdk: any, files: CxxProjectFile[]) {
  const project = new sdk.Directory();
  const createdDirs = new Set<string>();

  for (const file of files) {
    const normalizedPath = normalizeProjectPath(file.path);
    const parent = dirname(normalizedPath);
    if (parent) {
      await ensureDirectory(project, parent, createdDirs);
    }
    await project.writeFile(normalizedPath, file.content);
  }

  return project;
}

function getSourceFiles(files: CxxProjectFile[], language: CxxRuntimeLanguage) {
  if (language === 'c') {
    return files.filter(file => isCSourcePath(file.path));
  }
  return files.filter(file => isCSourcePath(file.path) || isCppSourcePath(file.path));
}

function buildCompilerArgs(files: CxxProjectFile[], sourceFiles: CxxProjectFile[], options: CxxRunOptions) {
  const includeDirs = new Set<string>(['/project']);
  for (const file of files) {
    const dir = dirname(file.path);
    if (dir) includeDirs.add(`/project/${dir}`);
  }

  const standard = options.language === 'cpp' ? options.cppStandard : options.cStandard;
  const args = [
    ...(options.language === 'cpp' ? ['--driver-mode=g++'] : []),
    `-std=${standard}`,
    `-${options.optimization}`,
    '-Wall',
    '-Wextra',
    ...Array.from(includeDirs).flatMap(dir => ['-I', dir]),
    ...sourceFiles.map(file => `/project/${normalizeProjectPath(file.path)}`),
    '-o',
    '/project/codecraft-output.wasm',
  ];

  return args;
}

function completeSharedBufferInteraction(
  headerBuffer: SharedArrayBuffer,
  payloadBuffer: SharedArrayBuffer,
  payload: unknown
) {
  const header = new Int32Array(headerBuffer);
  const buffer = new Uint8Array(payloadBuffer);
  const encoded = new TextEncoder().encode(JSON.stringify(payload));
  const maxLength = Math.min(encoded.length, buffer.byteLength);
  buffer.fill(0);
  buffer.set(encoded.subarray(0, maxLength), 0);
  Atomics.store(header, 1, maxLength);
  Atomics.store(header, 0, 1);
  Atomics.notify(header, 0, 1);
}

function createCxxRunnerWorker() {
  return new Worker(new URL('./cpp-runner.worker.ts', import.meta.url), { type: 'module' });
}

async function runCompiledWasm(wasmBytes: Uint8Array, files: CxxProjectFile[], options: CxxRunOptions) {
  const worker = createCxxRunnerWorker();

  return new Promise<CxxProcessResult>((resolve, reject) => {
    let settled = false;

    const finish = (callback: () => void) => {
      if (settled) return;
      settled = true;
      worker.terminate();
      callback();
    };

    worker.onmessage = (event) => {
      const message = event.data || {};
      if (message.type === 'stdout' && typeof message.text === 'string') {
        options.onStdout?.(message.text);
        return;
      }
      if (message.type === 'stderr' && typeof message.text === 'string') {
        options.onStderr?.(message.text);
        return;
      }
      if (
        message.type === 'stdin-request'
        && message.headerBuffer instanceof SharedArrayBuffer
        && message.payloadBuffer instanceof SharedArrayBuffer
      ) {
        Promise.resolve(options.requestStdin?.(typeof message.prompt === 'string' ? message.prompt : ''))
          .then(value => {
            completeSharedBufferInteraction(message.headerBuffer, message.payloadBuffer, { value: value ?? '' });
          })
          .catch(error => {
            completeSharedBufferInteraction(message.headerBuffer, message.payloadBuffer, {
              __codecraftError: error instanceof Error ? error.message : String(error),
            });
          });
        return;
      }
      if (message.type === 'done') {
        finish(() => resolve(toProcessResult(message.result)));
        return;
      }
      if (message.type === 'error') {
        finish(() => reject(new Error(typeof message.message === 'string' ? message.message : 'C/C++ program execution failed.')));
      }
    };

    worker.onerror = (event) => {
      finish(() => reject(new Error(event.message || 'C/C++ program execution failed.')));
    };

    worker.postMessage({
      type: 'run',
      wasmBytes,
      files: files.map(file => ({ path: file.path, content: file.content })),
      stdinPrompt: options.language === 'cpp' ? 'C++ stdin> ' : 'C stdin> ',
    });
  });
}

export async function compileAndRunCxxProject(options: CxxRunOptions): Promise<CxxRunResult> {
  const files = options.files.map(file => ({
    ...file,
    path: normalizeProjectPath(file.path),
  }));
  const sourceFiles = getSourceFiles(files, options.language);

  if (sourceFiles.length === 0) {
    throw new CxxRuntimeError(options.language === 'cpp'
      ? 'No C or C++ source files were selected for the C++ run.'
      : 'No C source files were selected for the C run.');
  }

  if (files.some(file => !file.path || isHeaderPath(file.path) && !file.content.trim())) {
    options.onStatus?.('Headers with empty content are included as empty files.');
  }

  const { sdk, clang, source } = await loadClangPackage(options.onStatus);
  options.onStatus?.(`Preparing ${files.length} C/C++ project file${files.length === 1 ? '' : 's'}...`);
  const project = await writeProjectFiles(sdk, files);
  const args = buildCompilerArgs(files, sourceFiles, options);

  options.onStatus?.(`Compiling ${sourceFiles.length} source file${sourceFiles.length === 1 ? '' : 's'} with Clang...`);
  const compileInstance = await clang.entrypoint.run({
    args,
    mount: { '/project': project },
    cwd: '/project',
  });
  const compile = toProcessResult(await compileInstance.wait());
  if (!compile.ok) {
    const detail = [compile.stderr.trim(), compile.stdout.trim()].filter(Boolean).join('\n');
    throw new CxxRuntimeError(detail || `Clang exited with code ${compile.code}.`, { compile });
  }

  let wasmBytes: Uint8Array;
  try {
    wasmBytes = new Uint8Array(await project.readFile('codecraft-output.wasm'));
  } catch (error) {
    throw new CxxRuntimeError(`Compilation finished but CodeCraft could not read the output WebAssembly file: ${error instanceof Error ? error.message : String(error)}`, { compile });
  }

  if (wasmBytes.byteLength === 0) {
    throw new CxxRuntimeError('Compilation produced an empty WebAssembly file.', { compile });
  }

  options.onStatus?.('Running compiled WebAssembly program...');
  const run = await runCompiledWasm(wasmBytes, files, options);

  return {
    compilerPackage: source,
    compile,
    run,
    outputWasmSize: wasmBytes.byteLength,
  };
}
