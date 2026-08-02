// Keep this worker a classic script: the embedded Blazor loader uses
// importScripts(), which is unavailable in module workers. An `import type`
// still made Vite emit `export {}` in development, so use a non-emitting import
// type expression instead.
type CSharpProjectConfiguration = import('./csharp-project').CSharpProjectConfiguration;

declare const DotNet: {
  invokeMethodAsync(assemblyName: string, methodName: string, ...args: unknown[]): Promise<unknown>;
};

const workerScope = self as any;
const textEncoder = new TextEncoder();
const textDecoder = new TextDecoder();
// Vite emits this worker under <static-root>/assets/ in production and serves it
// under <static-root>/src/ in development. In both cases the parent directory is
// the complete static application root.
const workerAppBaseUrl = new URL('../', workerScope.location.href);
const workerFrameworkBaseUrl = new URL('_framework/', workerAppBaseUrl);
let runtimeReadyPromise: Promise<void> | null = null;

type RuntimeMessage = {
  type?: string;
  mode?: 'regular' | 'script' | 'script-context' | 'project';
  code?: string;
  contextId?: string;
  resetContext?: boolean;
  paths?: string[];
  contents?: string[];
  entryPath?: string;
  sourcePath?: string;
  configuration?: CSharpProjectConfiguration | null;
  runtimePaths?: string[];
  runtimeContents?: string[];
  includeNamespaces?: string[];
};

function toStaticFrameworkUrlObject(url: URL) {
  if (url.origin !== workerScope.location.origin) return url;
  const marker = '/_framework/';
  const markerIndex = url.pathname.lastIndexOf(marker);
  if (markerIndex < 0) return url;

  const nextUrl = new URL(url.pathname.slice(markerIndex + marker.length), workerFrameworkBaseUrl);
  nextUrl.search = url.search;
  nextUrl.hash = url.hash;
  return nextUrl;
}

function toStaticFrameworkUrl(value: string) {
  try {
    return toStaticFrameworkUrlObject(new URL(value, workerAppBaseUrl)).href;
  } catch {
    return value;
  }
}

function toWorkerFetchInput(input: RequestInfo | URL) {
  if (typeof input === 'string') {
    return toStaticFrameworkUrl(input);
  }

  if (input instanceof URL) {
    return toStaticFrameworkUrlObject(input);
  }

  if (typeof Request === 'function' && input instanceof Request) {
    const url = new URL(input.url);
    const staticUrl = toStaticFrameworkUrlObject(url);
    return staticUrl.href === input.url ? input : new Request(staticUrl, input);
  }

  return input;
}

function installWorkerBrowserShims() {
  if (workerScope.__codecraftCSharpWorkerBrowserShimsInstalled) {
    return;
  }

  const blazorScriptSrc = new URL('blazor.webassembly.js', workerFrameworkBaseUrl).href;
  const currentScript = {
    src: blazorScriptSrc,
    getAttribute(name: string) {
      return String(name).toLowerCase() === 'src' ? blazorScriptSrc : null;
    },
  };
  const originalFetch = workerScope.fetch.bind(workerScope);
  workerScope.fetch = (input: RequestInfo | URL, init?: RequestInit) => originalFetch(toWorkerFetchInput(input), init);

  function createScriptElement() {
    return {
      _src: '',
      text: '',
      type: '',
      defer: false,
      integrity: '',
      crossOrigin: '',
      set src(value: string) {
        this._src = toStaticFrameworkUrl(value);
      },
      get src() {
        return this._src;
      },
      setAttribute() {},
      appendChild() {},
    };
  }

  function appendElement(element: { src?: string; text?: string }) {
    if (element.src) {
      workerScope.importScripts(element.src);
    }
    if (element.text) {
      Function(element.text)();
    }
  }

  workerScope.window = workerScope;
  workerScope.global = workerScope;
  workerScope.document = workerScope.document || {
    baseURI: workerAppBaseUrl.href,
    location: workerScope.location,
    currentScript,
    documentElement: {
      style: {
        setProperty() {},
      },
    },
    body: {
      appendChild: appendElement,
    },
    createElement(tagName: string) {
      if (tagName === 'a') {
        const anchor = {
          _href: '',
          set href(value: string) {
            this._href = toStaticFrameworkUrl(value);
          },
          get href() {
            return this._href;
          },
        };
        return anchor;
      }
      if (tagName === 'script') {
        return createScriptElement();
      }
      return {
        tagName: String(tagName || '').toUpperCase(),
        style: {},
        setAttribute() {},
        appendChild() {},
      };
    },
    createElementNS() {
      return {
        style: {},
        setAttribute() {},
        appendChild() {},
      };
    },
    querySelector() {
      return null;
    },
    addEventListener() {},
    removeEventListener() {},
  };
  workerScope.__codecraftCSharpWorkerBrowserShimsInstalled = true;
}

function completeSharedBufferInteraction(headerBuffer: SharedArrayBuffer, payloadBuffer: SharedArrayBuffer, payload: unknown) {
  const header = new Int32Array(headerBuffer);
  const buffer = new Uint8Array(payloadBuffer);
  if (buffer.byteLength === 0) {
    Atomics.store(header, 1, 0);
    Atomics.store(header, 0, 1);
    Atomics.notify(header, 0, 1);
    return;
  }

  let encoded = textEncoder.encode(JSON.stringify(payload));
  if (encoded.length > buffer.byteLength) {
    encoded = textEncoder.encode(JSON.stringify({
      __codecraftError: `C# stdin response is too large for the ${buffer.byteLength} byte shared buffer.`,
    }));
  }
  if (encoded.length > buffer.byteLength) {
    encoded = textEncoder.encode('{}').subarray(0, buffer.byteLength);
  }
  buffer.fill(0);
  buffer.set(encoded, 0);
  Atomics.store(header, 1, encoded.length);
  Atomics.store(header, 0, 1);
  Atomics.notify(header, 0, 1);
}

function requestInputSync(prompt: unknown) {
  if (typeof SharedArrayBuffer !== 'function') {
    throw new Error('SharedArrayBuffer is required for runtime-interactive C# stdin.');
  }

  const headerBuffer = new SharedArrayBuffer(Int32Array.BYTES_PER_ELEMENT * 2);
  const payloadBuffer = new SharedArrayBuffer(262144);
  const header = new Int32Array(headerBuffer);
  workerScope.postMessage({
    type: 'stdin-request',
    prompt: String(prompt ?? ''),
    headerBuffer,
    payloadBuffer,
  });
  Atomics.wait(header, 0, 0);

  const payloadLength = Math.max(0, Atomics.load(header, 1));
  const sharedPayload = new Uint8Array(payloadBuffer, 0, payloadLength);
  const decodedPayload = new Uint8Array(payloadLength);
  decodedPayload.set(sharedPayload);
  const json = textDecoder.decode(decodedPayload);
  let parsed: any;
  try {
    parsed = json ? JSON.parse(json) : { value: '' };
  } catch {
    throw new Error('C# stdin response could not be decoded.');
  }
  if (parsed && parsed.__codecraftError) {
    throw new Error(String(parsed.__codecraftError));
  }
  return String(parsed && Object.prototype.hasOwnProperty.call(parsed, 'value') ? parsed.value : '');
}

function ensureRuntime() {
  if (runtimeReadyPromise) return runtimeReadyPromise;

  const pendingRuntime = new Promise<void>((resolve, reject) => {
    installWorkerBrowserShims();
    workerScope.BrowserCSharp = {
      loaded: () => resolve(),
      failed: () => reject(new Error('C# WebAssembly runtime failed to load in worker.')),
    };
    workerScope.CodeCraftCSharp = {
      writeOutput(stream: unknown, text: unknown) {
        workerScope.postMessage({
          type: stream === 'stderr' ? 'stderr' : 'stdout',
          text: String(text || ''),
        });
      },
      requestInput(prompt: unknown) {
        return requestInputSync(prompt);
      },
    };

    try {
      workerScope.importScripts(new URL('blazor.webassembly.js', workerFrameworkBaseUrl).href);
    } catch (error) {
      reject(error);
    }
  });

  runtimeReadyPromise = pendingRuntime.catch(error => {
    runtimeReadyPromise = null;
    throw error;
  });

  return runtimeReadyPromise;
}

async function invokeBrowserCSharp(message: RuntimeMessage) {
  await ensureRuntime();

  for (const namespaceName of message.includeNamespaces || []) {
    const trimmedNamespace = namespaceName.trim();
    if (trimmedNamespace) {
      await DotNet.invokeMethodAsync('BrowserCSharp', 'IncludeNamespace', trimmedNamespace);
    }
  }

  switch (message.mode) {
    case 'script':
      if (message.configuration) {
        return DotNet.invokeMethodAsync(
          'BrowserCSharp',
          'ExecuteScriptConfiguredInteractive',
          message.code || '',
          message.sourcePath || 'Script.cs',
          JSON.stringify(message.configuration),
        );
      }
      return DotNet.invokeMethodAsync('BrowserCSharp', 'ExecuteScriptInteractive', message.code || '');
    case 'script-context':
      if (message.resetContext) {
        try {
          await DotNet.invokeMethodAsync('BrowserCSharp', 'ClearScriptContext', message.contextId || 'default');
        } catch {
          // A missing context should not prevent the next interactive run from starting.
        }
      }
      return message.configuration
        ? DotNet.invokeMethodAsync(
          'BrowserCSharp',
          'ExecuteScriptInContextConfiguredInteractive',
          message.code || '',
          message.contextId || 'default',
          message.sourcePath || 'Script.cs',
          JSON.stringify(message.configuration),
        )
        : DotNet.invokeMethodAsync(
          'BrowserCSharp',
          'ExecuteScriptInContextInteractive',
          message.code || '',
          message.contextId || 'default',
        );
    case 'project':
      return message.configuration
        ? DotNet.invokeMethodAsync(
          'BrowserCSharp',
          'ExecuteRegularProjectWithFilesConfiguredInteractive',
          message.paths || [],
          message.contents || [],
          message.entryPath || '',
          message.runtimePaths || [],
          message.runtimeContents || [],
          JSON.stringify(message.configuration),
        )
        : DotNet.invokeMethodAsync(
          'BrowserCSharp',
          'ExecuteRegularProjectWithFilesInteractive',
          message.paths || [],
          message.contents || [],
          message.entryPath || '',
          message.runtimePaths || [],
          message.runtimeContents || [],
        );
    case 'regular':
    default:
      return DotNet.invokeMethodAsync('BrowserCSharp', 'ExecuteRegularInteractive', message.code || '');
  }
}

workerScope.onmessage = (event: MessageEvent<RuntimeMessage>) => {
  const message = event.data || {};
  if (message.type !== 'run') return;

  invokeBrowserCSharp(message)
    .then(result => {
      workerScope.postMessage({ type: 'done', result });
    })
    .catch(error => {
      workerScope.postMessage({
        type: 'error',
        message: error && error.stack ? String(error.stack) : String(error),
      });
    });
};
