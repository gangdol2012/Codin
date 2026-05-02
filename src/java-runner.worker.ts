export {};

declare function cheerpjInit(options?: {
  version?: number;
  status?: 'splash' | 'none' | 'default';
  natives?: Record<string, (...args: any[]) => any>;
  execCallback?: (cmdPath: string, argsArray: string[]) => void;
}): Promise<void>;
declare function cheerpjRunMain(className: string, classPath: string, ...args: string[]): Promise<number>;
declare function cheerpjRunLibrary(classPath: string): Promise<any>;
declare function cheerpOSAddStringFile(path: string, data: string | Uint8Array): void;
declare function cheerpOSRemoveStringFile(path: string): void;

type JavaRuntimeVersion = 8 | 11 | 17;

interface JavaRunnerFile {
  path: string;
  content: string;
}

interface CompileMessage {
  type: 'compile';
  files: JavaRunnerFile[];
  entryPath: string;
  entryClassName?: string;
}

interface RunCompiledMessage {
  type: 'run-compiled';
  outputRoot: string;
  entryClassName: string;
  javaVersion: JavaRuntimeVersion;
  args?: string[];
}

type WorkerMessage = CompileMessage | RunCompiledMessage;

interface StdinResponseMessage {
  type: 'stdin-response';
  id: number;
  value?: string | null;
  error?: string;
}

interface JavaProcessResult {
  ok: boolean;
  code: number;
  stdout: string;
  stderr: string;
}

interface JavaCompileWorkerResult {
  entryClassName: string;
  compile: JavaProcessResult;
  outputRoot: string;
}

const workerScope = self as any;
const textEncoder = new TextEncoder();
const ECJ_COMPILER_VERSION = '3.26.0';
const ECJ_COMPILER_PATH = '/str/ecj.jar';
const ECJ_COMPILER_URLS = [
  `/ecj.jar?v=${ECJ_COMPILER_VERSION}`,
  `/__codecraft_maven/org/eclipse/jdt/ecj/${ECJ_COMPILER_VERSION}/ecj-${ECJ_COMPILER_VERSION}.jar`,
];
let runtimeReadyPromise: Promise<void> | null = null;
let runtimeVersion: JavaRuntimeVersion | null = null;
let libraryPromise: Promise<any> | null = null;
let compilerReadyPromise: Promise<string> | null = null;
let nextInputRequestId = 1;
let collectRuntimeOutput = false;
let runtimeStdout = '';
let runtimeStderr = '';
const pendingInputRequests = new Map<number, {
  resolve: (value: string) => void;
  reject: (error: Error) => void;
}>();

const BRIDGE_SOURCE = `package codecraft.runtime;

public final class CodeCraftBridge {
    private CodeCraftBridge() {}

    public static native void writeStdout(String text);
    public static native void writeStderr(String text);
    public static native String requestInput(String prompt);
}
`;

const LAUNCHER_SOURCE = `package codecraft.runtime;

import java.io.IOException;
import java.io.InputStream;
import java.io.OutputStream;
import java.io.PrintStream;
import java.lang.reflect.InvocationTargetException;
import java.lang.reflect.Method;
import java.lang.reflect.Modifier;
import java.nio.charset.StandardCharsets;
import java.util.Arrays;

public final class CodeCraftLauncher {
    private CodeCraftLauncher() {}

    private static final class BridgeOutputStream extends OutputStream {
        private final boolean stderr;

        BridgeOutputStream(boolean stderr) {
            this.stderr = stderr;
        }

        @Override
        public void write(int value) throws IOException {
            byte[] single = new byte[] { (byte) value };
            write(single, 0, 1);
        }

        @Override
        public void write(byte[] buffer, int offset, int length) throws IOException {
            if (buffer == null) {
                throw new NullPointerException("buffer");
            }
            if (offset < 0 || length < 0 || offset + length > buffer.length) {
                throw new IndexOutOfBoundsException();
            }
            if (length == 0) {
                return;
            }
            String text = new String(buffer, offset, length, StandardCharsets.UTF_8);
            if (stderr) {
                CodeCraftBridge.writeStderr(text);
            } else {
                CodeCraftBridge.writeStdout(text);
            }
        }
    }

    private static final class BridgeInputStream extends InputStream {
        private byte[] buffer = new byte[0];
        private int index = 0;

        private boolean ensureBuffer() throws IOException {
            if (index < buffer.length) {
                return true;
            }
            String value = CodeCraftBridge.requestInput("");
            if (value == null) {
                return false;
            }
            buffer = (value + System.lineSeparator()).getBytes(StandardCharsets.UTF_8);
            index = 0;
            return true;
        }

        @Override
        public int read() throws IOException {
            if (!ensureBuffer()) {
                return -1;
            }
            return buffer[index++] & 0xff;
        }

        @Override
        public int read(byte[] target, int offset, int length) throws IOException {
            if (target == null) {
                throw new NullPointerException("target");
            }
            if (offset < 0 || length < 0 || offset + length > target.length) {
                throw new IndexOutOfBoundsException();
            }
            if (length == 0) {
                return 0;
            }
            if (!ensureBuffer()) {
                return -1;
            }
            int copied = Math.min(length, buffer.length - index);
            System.arraycopy(buffer, index, target, offset, copied);
            index += copied;
            return copied;
        }

        @Override
        public int available() {
            return Math.max(0, buffer.length - index);
        }
    }

    public static void main(String[] args) throws Throwable {
        if (args.length == 0 || args[0] == null || args[0].trim().isEmpty()) {
            throw new IllegalArgumentException("Missing Java entry class name.");
        }

        System.setOut(new PrintStream(new BridgeOutputStream(false), true, "UTF-8"));
        System.setErr(new PrintStream(new BridgeOutputStream(true), true, "UTF-8"));
        System.setIn(new BridgeInputStream());

        String className = args[0];
        String[] userArgs = Arrays.copyOfRange(args, 1, args.length);
        Class<?> entryClass = Class.forName(className);
        Method main = entryClass.getMethod("main", String[].class);
        int modifiers = main.getModifiers();
        if (!Modifier.isStatic(modifiers) || main.getReturnType() != Void.TYPE) {
            throw new NoSuchMethodException(className + ".main(String[]) must be public static void.");
        }

        try {
            main.invoke(null, (Object) userArgs);
        } catch (InvocationTargetException error) {
            throw error.getCause();
        }
    }
}
`;

function post(type: string, payload: Record<string, unknown> = {}) {
  workerScope.postMessage({ type, ...payload });
}

function postStream(type: 'stdout' | 'stderr', text: string) {
  if (!text) return;
  if (collectRuntimeOutput) {
    if (type === 'stdout') runtimeStdout += text;
    else runtimeStderr += text;
  }
  post(type, { text });
}

function normalizeProjectPath(path: string) {
  const resolved: string[] = [];
  for (const raw of String(path || '').replace(/\\/g, '/').split('/')) {
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

function stripJavaCommentsAndStrings(source: string) {
  return source
    .replace(/\/\*[\s\S]*?\*\//g, match => ' '.repeat(match.length))
    .replace(/\/\/[^\n\r]*/g, match => ' '.repeat(match.length))
    .replace(/"(?:\\.|[^"\\])*"/g, match => ' '.repeat(match.length))
    .replace(/'(?:\\.|[^'\\])+'/g, match => ' '.repeat(match.length));
}

function inferJavaEntryClassName(path: string, source: string) {
  const clean = stripJavaCommentsAndStrings(source);
  const packageMatch = clean.match(/^\s*package\s+([A-Za-z_$][\w$]*(?:\.[A-Za-z_$][\w$]*)*)\s*;/m);
  const packageName = packageMatch?.[1] || '';
  const mainIndex = clean.search(/public\s+static\s+void\s+main\s*\(\s*String(?:\s*\[\s*\]\s*[A-Za-z_$][\w$]*|\s+[A-Za-z_$][\w$]*\s*\[\s*\])\s*\)/m);
  const classMatches = [...clean.matchAll(/\b(?:public\s+)?(?:abstract\s+|final\s+|sealed\s+|non-sealed\s+|strictfp\s+)*?(?:class|record|enum)\s+([A-Za-z_$][\w$]*)/g)];

  let className = '';
  if (mainIndex >= 0) {
    for (const match of classMatches) {
      if ((match.index ?? 0) <= mainIndex) {
        className = match[1];
      }
    }
  }
  if (!className) {
    className = clean.match(/\bpublic\s+(?:abstract\s+|final\s+|sealed\s+|non-sealed\s+|strictfp\s+)*?(?:class|record|enum)\s+([A-Za-z_$][\w$]*)/)?.[1] || '';
  }
  if (!className) {
    className = classMatches[0]?.[1] || '';
  }
  if (!className) {
    className = normalizeProjectPath(path).split('/').pop()?.replace(/\.java$/i, '') || 'Main';
  }

  return packageName ? `${packageName}.${className}` : className;
}

function createRunId() {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
}

function dirname(path: string) {
  const normalizedPath = normalizeProjectPath(path);
  const index = normalizedPath.lastIndexOf('/');
  return index >= 0 ? normalizedPath.slice(0, index) : '';
}

function javaComplianceArg(version: JavaRuntimeVersion) {
  // CheerpJ exposes Java 9+ runtimes under /lt/<version>, which ECJ does not
  // recognize as a normal JDK system-module location. Compile portable Java 8
  // bytecode under the Java 8 runtime.
  void version;
  return '-1.8';
}

function isJar(bytes: Uint8Array) {
  return bytes.byteLength > 4
    && bytes[0] === 0x50
    && bytes[1] === 0x4b;
}

function hideIgnorableCompilerDiagnostics(text: string) {
  return text
    .split(/\r?\n/)
    .filter(line => !/^JIT failure - please report a bug: Class .*org\/eclipse\/jdt\/internal\/compiler\/parser\/Parser, method: consumeRule\(I\)V$/.test(line))
    .join('\n');
}

async function requestInput(prompt: string) {
  const id = nextInputRequestId++;
  post('stdin-request', { id, prompt });
  return new Promise<string>((resolve, reject) => {
    pendingInputRequests.set(id, { resolve, reject });
  });
}

function handleStdinResponse(message: StdinResponseMessage) {
  const pending = pendingInputRequests.get(message.id);
  if (!pending) return;
  pendingInputRequests.delete(message.id);
  if (message.error) {
    pending.reject(new Error(message.error));
    return;
  }
  pending.resolve(String(message.value ?? ''));
}

async function ensureJavaCompiler() {
  if (compilerReadyPromise) return compilerReadyPromise;

  compilerReadyPromise = (async () => {
    post('status', { message: 'Loading Java compiler (ECJ)...' });
    const errors: string[] = [];
    for (const url of ECJ_COMPILER_URLS) {
      try {
        const response = await fetch(url, { cache: 'no-store' });
        if (!response.ok) {
          errors.push(`${url}: HTTP ${response.status}`);
          continue;
        }
        const bytes = new Uint8Array(await response.arrayBuffer());
        if (!isJar(bytes)) {
          errors.push(`${url}: response was not a jar`);
          continue;
        }
        cheerpOSAddStringFile(ECJ_COMPILER_PATH, bytes);
        post('status', { message: 'Java compiler ready.' });
        return ECJ_COMPILER_PATH;
      } catch (error) {
        errors.push(`${url}: ${error instanceof Error ? error.message : String(error)}`);
      }
    }

    throw new Error(`Java compiler jar was not available. Tried: ${errors.join('; ')}`);
  })();

  return compilerReadyPromise;
}

async function ensureRuntime(version: JavaRuntimeVersion) {
  if (runtimeReadyPromise && runtimeVersion === version) return runtimeReadyPromise;
  if (runtimeReadyPromise && runtimeVersion !== version) {
    throw new Error('This Java worker has already been initialized with a different runtime version.');
  }

  runtimeVersion = version;
  runtimeReadyPromise = (async () => {
    post('status', { message: `Loading Java ${version} runtime (CheerpJ)...` });
    workerScope.importScripts('https://cjrtnc.leaningtech.com/4.3/loader.js');
    await cheerpjInit({
      version,
      status: 'none',
      execCallback(cmdPath, argsArray) {
        postStream('stderr', `External command blocked: ${cmdPath}${argsArray?.length ? ` ${argsArray.join(' ')}` : ''}\n`);
      },
      natives: {
        Java_codecraft_runtime_CodeCraftBridge_writeStdout(_lib: unknown, text: unknown) {
          postStream('stdout', String(text ?? ''));
        },
        Java_codecraft_runtime_CodeCraftBridge_writeStderr(_lib: unknown, text: unknown) {
          postStream('stderr', String(text ?? ''));
        },
        async Java_codecraft_runtime_CodeCraftBridge_requestInput(_lib: unknown, prompt: unknown) {
          return requestInput(String(prompt ?? ''));
        },
      },
    });
    post('status', { message: `Java ${version} runtime ready.` });
  })();

  return runtimeReadyPromise;
}

async function getJavaLibrary() {
  if (!libraryPromise) {
    libraryPromise = cheerpjRunLibrary('');
  }
  return libraryPromise;
}

async function ensureJavaDirectory(path: string) {
  const lib = await getJavaLibrary();
  const Files = await lib.java.nio.file.Files;
  const Paths = await lib.java.nio.file.Paths;
  await Files.createDirectories(await Paths.get(path));
}

async function writeSourceFile(root: string, path: string, content: string) {
  const normalizedPath = normalizeProjectPath(path);
  if (!normalizedPath || !/\.java$/i.test(normalizedPath)) return null;
  const fullPath = `${root}/${normalizedPath}`;
  const parentPath = dirname(fullPath);
  if (parentPath) {
    await ensureJavaDirectory(`/${parentPath}`);
  }
  const lib = await getJavaLibrary();
  const Files = await lib.java.nio.file.Files;
  const Paths = await lib.java.nio.file.Paths;
  const encoded = textEncoder.encode(content);
  await Files.write(
    await Paths.get(fullPath),
    new Int8Array(encoded.buffer, encoded.byteOffset, encoded.byteLength),
  );
  return fullPath;
}

async function removeSourceFile(path: string) {
  try {
    const lib = await getJavaLibrary();
    const Files = await lib.java.nio.file.Files;
    const Paths = await lib.java.nio.file.Paths;
    await Files.deleteIfExists(await Paths.get(path));
  } catch {
    // Runtime scratch files are best-effort cleanup.
  }
}

async function runJavaMainWithConsoleCapture(
  className: string,
  classPath: string,
  args: string[],
  streamOutput = false
): Promise<JavaProcessResult> {
  let stdout = '';
  let stderr = '';
  const originalLog = console.log;
  const originalWarn = console.warn;
  const originalError = console.error;
  const appendStdout = (...values: unknown[]) => {
    const text = `${values.map(value => String(value)).join(' ')}\n`;
    stdout += text;
    if (streamOutput) postStream('stdout', text);
  };
  const appendStderr = (...values: unknown[]) => {
    const text = `${values.map(value => String(value)).join(' ')}\n`;
    stderr += text;
    if (streamOutput) postStream('stderr', text);
  };

  console.log = appendStdout;
  console.warn = appendStderr;
  console.error = appendStderr;

  try {
    const code = await cheerpjRunMain(className, classPath, ...args);
    return {
      ok: code === 0,
      code: Number.isFinite(code) ? code : 1,
      stdout,
      stderr,
    };
  } catch (error) {
    const message = error instanceof Error && error.stack ? error.stack : String(error);
    stderr += stderr && message ? `\n${message}` : message;
    if (streamOutput && message) postStream('stderr', `${message}\n`);
    return {
      ok: false,
      code: 1,
      stdout,
      stderr,
    };
  } finally {
    console.log = originalLog;
    console.warn = originalWarn;
    console.error = originalError;
  }
}

async function compileJavaProject(message: CompileMessage): Promise<JavaCompileWorkerResult> {
  // ECJ probes the running VM for system libraries. CheerpJ 11/17 expose those
  // as /lt/<version>, which is not a standard JDK module image, so compile in a
  // Java 8 worker and run the program in a separate worker using the selected runtime.
  await ensureRuntime(8);

  const runId = createRunId();
  const sourceRoot = `/files/codecraft-java-${runId}/src`;
  const outputRoot = `/files/codecraft-java-${runId}/classes`;
  await ensureJavaDirectory(sourceRoot);
  await ensureJavaDirectory(outputRoot);

  const normalizedFiles = message.files
    .map(file => ({
      path: normalizeProjectPath(file.path),
      content: String(file.content ?? ''),
    }))
    .filter(file => file.path && /\.java$/i.test(file.path));

  if (normalizedFiles.length === 0) {
    throw new Error('No Java source files were selected for the run.');
  }

  const sourcePaths: string[] = [];
  for (const file of normalizedFiles) {
    const sourcePath = await writeSourceFile(sourceRoot, file.path, file.content);
    if (sourcePath) sourcePaths.push(sourcePath);
  }
  sourcePaths.push(
    await writeSourceFile(sourceRoot, 'codecraft/runtime/CodeCraftBridge.java', BRIDGE_SOURCE)!,
    await writeSourceFile(sourceRoot, 'codecraft/runtime/CodeCraftLauncher.java', LAUNCHER_SOURCE)!,
  );

  const entryFile = normalizedFiles.find(file => file.path === normalizeProjectPath(message.entryPath)) ?? normalizedFiles[0];
  const entryClassName = (message.entryClassName && message.entryClassName.trim())
    || inferJavaEntryClassName(entryFile.path, entryFile.content);
  const projectClassPath = `${outputRoot}:${sourceRoot}`;
  const compilerClassPath = `${await ensureJavaCompiler()}:${projectClassPath}`;

  post('status', {
    message: `Compiling ${normalizedFiles.length} Java source file${normalizedFiles.length === 1 ? '' : 's'}...`,
  });

  const compile = await runJavaMainWithConsoleCapture(
    'org.eclipse.jdt.internal.compiler.batch.Main',
    compilerClassPath,
    [
      javaComplianceArg(8),
      '-encoding',
      'UTF-8',
      '-proc:none',
      '-classpath',
      projectClassPath,
      '-d',
      outputRoot,
      ...sourcePaths,
    ],
  );
  compile.stdout = hideIgnorableCompilerDiagnostics(compile.stdout);
  compile.stderr = hideIgnorableCompilerDiagnostics(compile.stderr);

  await Promise.all(sourcePaths.map(removeSourceFile));

  if (!compile.ok) {
    return {
      entryClassName,
      compile,
      outputRoot,
    };
  }

  return { entryClassName, compile, outputRoot };
}

async function runCompiledJavaProject(message: RunCompiledMessage) {
  await ensureRuntime(message.javaVersion);

  const runtimeClassPath = message.outputRoot;
  const entryClassName = message.entryClassName;

  post('status', { message: `Running Java entry class ${entryClassName}...` });
  runtimeStdout = '';
  runtimeStderr = '';
  collectRuntimeOutput = true;
  let run: JavaProcessResult;
  try {
    run = await runJavaMainWithConsoleCapture(
      'codecraft.runtime.CodeCraftLauncher',
      runtimeClassPath,
      [entryClassName, ...(message.args || [])],
      true,
    );
  } finally {
    collectRuntimeOutput = false;
  }
  run.stdout = runtimeStdout || run.stdout;
  run.stderr = runtimeStderr || run.stderr;

  return { entryClassName, run };
}

workerScope.onmessage = (event: MessageEvent<WorkerMessage | StdinResponseMessage>) => {
  const message = event.data;
  if (!message) return;

  if (message.type === 'stdin-response') {
    handleStdinResponse(message);
    return;
  }

  if (message.type === 'compile') {
    compileJavaProject(message)
      .then(result => post('done', { result }))
      .catch(error => {
        post('error', {
          message: error instanceof Error && error.stack ? error.stack : String(error),
        });
      });
    return;
  }

  if (message.type === 'run-compiled') {
    runCompiledJavaProject(message)
      .then(result => post('done', { result }))
      .catch(error => {
        post('error', {
          message: error instanceof Error && error.stack ? error.stack : String(error),
        });
      });
  }
};
