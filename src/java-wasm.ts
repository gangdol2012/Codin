export type JavaRuntimeVersion = 8 | 11 | 17;

export interface JavaProjectFile {
  path: string;
  content: string;
  language: 'java';
}

export interface JavaRunOptions {
  files: JavaProjectFile[];
  entryPath: string;
  javaVersion: JavaRuntimeVersion;
  args?: string[];
  timeoutMs?: number;
  onStatus?: (message: string) => void;
  onStdout?: (chunk: string) => void;
  onStderr?: (chunk: string) => void;
  requestStdin?: (prompt: string) => Promise<string | null | undefined>;
}

export interface JavaProcessResult {
  ok: boolean;
  code: number;
  stdout: string;
  stderr: string;
}

export interface JavaRunResult {
  entryClassName: string;
  compile: JavaProcessResult;
  run: JavaProcessResult;
}

interface JavaCompileWorkerResult {
  entryClassName: string;
  compile: JavaProcessResult;
  outputRoot: string;
}

interface JavaRunWorkerResult {
  entryClassName: string;
  run: JavaProcessResult;
}

export class JavaRuntimeError extends Error {
  readonly compile?: JavaProcessResult;
  readonly run?: JavaProcessResult;

  constructor(message: string, details?: { compile?: JavaProcessResult; run?: JavaProcessResult }) {
    super(message);
    this.name = 'JavaRuntimeError';
    this.compile = details?.compile;
    this.run = details?.run;
  }
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

function createJavaRunnerWorker() {
  const worker = new Worker(new URL('./java-runner.worker.ts', import.meta.url));
  activeJavaWorkers.add(worker);
  return worker;
}

const activeJavaWorkers = new Set<Worker>();

export function disposeJavaRuntime() {
  for (const worker of activeJavaWorkers) {
    try {
      worker.terminate();
    } catch {
      // A worker may already be terminated by a completed run.
    }
  }
  activeJavaWorkers.clear();
}

function toProcessResult(raw: any): JavaProcessResult {
  return {
    ok: !!raw?.ok,
    code: typeof raw?.code === 'number' ? raw.code : (raw?.ok ? 0 : 1),
    stdout: typeof raw?.stdout === 'string' ? raw.stdout : '',
    stderr: typeof raw?.stderr === 'string' ? raw.stderr : '',
  };
}

function formatJavaFailure(result: JavaRunResult) {
  const compileDetails = [
    result.compile.stderr.trim(),
    result.compile.stdout.trim(),
  ].filter(Boolean).join('\n');
  if (!result.compile.ok) {
    return compileDetails || `javac exited with code ${result.compile.code}.`;
  }

  const runDetails = [
    result.run.stderr.trim(),
    result.run.stdout.trim(),
  ].filter(Boolean).join('\n');
  return runDetails || `Java program exited with code ${result.run.code}.`;
}

function runJavaWorker<T>(message: Record<string, unknown>, options: JavaRunOptions): Promise<T> {
  const worker = createJavaRunnerWorker();

  return new Promise<T>((resolve, reject) => {
    let settled = false;
    const timeoutMs = Number.isFinite(options.timeoutMs) ? Math.max(0, Math.floor(options.timeoutMs || 0)) : 0;
    const timeoutId = timeoutMs > 0
      ? window.setTimeout(() => {
        finish(() => reject(new JavaRuntimeError(`Java execution timed out after ${timeoutMs} ms.`)));
      }, timeoutMs)
      : null;

    const finish = (callback: () => void) => {
      if (settled) return;
      settled = true;
      if (timeoutId !== null) {
        window.clearTimeout(timeoutId);
      }
      activeJavaWorkers.delete(worker);
      worker.terminate();
      callback();
    };

    worker.onmessage = (event) => {
      const workerMessage = event.data || {};
      if (workerMessage.type === 'status' && typeof workerMessage.message === 'string') {
        options.onStatus?.(workerMessage.message);
        return;
      }
      if (workerMessage.type === 'stdout' && typeof workerMessage.text === 'string') {
        options.onStdout?.(workerMessage.text);
        return;
      }
      if (workerMessage.type === 'stderr' && typeof workerMessage.text === 'string') {
        options.onStderr?.(workerMessage.text);
        return;
      }
      if (workerMessage.type === 'stdin-request' && typeof workerMessage.id === 'number') {
        Promise.resolve(options.requestStdin?.(typeof workerMessage.prompt === 'string' ? workerMessage.prompt : ''))
          .then(value => {
            if (settled) return;
            worker.postMessage({
              type: 'stdin-response',
              id: workerMessage.id,
              value: value ?? '',
            });
          })
          .catch(error => {
            const normalizedError = error instanceof Error ? error : new Error(String(error));
            finish(() => reject(normalizedError));
          });
        return;
      }
      if (workerMessage.type === 'done') {
        finish(() => resolve((workerMessage.result || {}) as T));
        return;
      }
      if (workerMessage.type === 'error') {
        finish(() => reject(new Error(typeof workerMessage.message === 'string' ? workerMessage.message : 'Java worker execution failed.')));
      }
    };

    worker.onerror = (event) => {
      finish(() => reject(new Error(event.message || 'Java worker execution failed.')));
    };

    worker.postMessage(message);
  });
}

export async function compileAndRunJavaProject(options: JavaRunOptions): Promise<JavaRunResult> {
  const files = options.files.map(file => ({
    ...file,
    path: normalizeProjectPath(file.path),
  }));

  if (files.length === 0) {
    throw new JavaRuntimeError('No Java source files were selected for the run.');
  }

  const compileRaw = await runJavaWorker<JavaCompileWorkerResult>({
    type: 'compile',
    files: files.map(file => ({ path: file.path, content: file.content })),
    entryPath: normalizeProjectPath(options.entryPath),
  }, options);

  const compile = toProcessResult(compileRaw.compile);
  const entryClassName = typeof compileRaw.entryClassName === 'string' ? compileRaw.entryClassName : '';
  const result: JavaRunResult = {
    entryClassName,
    compile,
    run: {
      ok: false,
      code: 1,
      stdout: '',
      stderr: '',
    },
  };

  if (compile.ok) {
    if (typeof compileRaw.outputRoot !== 'string' || !compileRaw.outputRoot) {
      throw new JavaRuntimeError('Java compilation succeeded but did not return an output directory.', { compile });
    }

    const runRaw = await runJavaWorker<JavaRunWorkerResult>({
      type: 'run-compiled',
      outputRoot: compileRaw.outputRoot,
      entryClassName,
      javaVersion: options.javaVersion,
      args: options.args || [],
    }, options);

    result.run = toProcessResult(runRaw.run);
    result.entryClassName = typeof runRaw.entryClassName === 'string' ? runRaw.entryClassName : entryClassName;
  }

  if (!result.compile.ok || !result.run.ok) {
    throw new JavaRuntimeError(formatJavaFailure(result), {
      compile: result.compile,
      run: result.run,
    });
  }

  return result;
}
