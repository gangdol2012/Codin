export {};

declare const DotNet: {
  invokeMethodAsync(assemblyName: string, methodName: string, ...args: unknown[]): Promise<unknown>;
};

const workerScope = self as any;
const textEncoder = new TextEncoder();
const textDecoder = new TextDecoder();
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
};

function toRootedFrameworkUrl(value: string) {
  return value.startsWith('_framework/') ? `/${value}` : value;
}

function installWorkerBrowserShims() {
  const blazorScriptSrc = `${workerScope.location.origin}/_framework/blazor.webassembly.js`;
  const currentScript = {
    src: blazorScriptSrc,
    getAttribute(name: string) {
      return String(name).toLowerCase() === 'src' ? blazorScriptSrc : null;
    },
  };
  const originalFetch = workerScope.fetch.bind(workerScope);
  workerScope.fetch = (input: RequestInfo | URL, init?: RequestInit) => {
    if (typeof input === 'string') {
      return originalFetch(toRootedFrameworkUrl(input), init);
    }
    return originalFetch(input, init);
  };

  function createScriptElement() {
    return {
      _src: '',
      text: '',
      type: '',
      defer: false,
      integrity: '',
      crossOrigin: '',
      set src(value: string) {
        this._src = new URL(toRootedFrameworkUrl(value), workerScope.location.href).href;
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
    baseURI: `${workerScope.location.origin}/`,
    location: workerScope.location,
    currentScript,
    body: {
      appendChild: appendElement,
    },
    createElement(tagName: string) {
      if (tagName === 'a') {
        const anchor = {
          _href: '',
          set href(value: string) {
            this._href = new URL(toRootedFrameworkUrl(value), workerScope.location.href).href;
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
}

function completeSharedBufferInteraction(headerBuffer: SharedArrayBuffer, payloadBuffer: SharedArrayBuffer, payload: unknown) {
  const header = new Int32Array(headerBuffer);
  const buffer = new Uint8Array(payloadBuffer);
  const encoded = textEncoder.encode(JSON.stringify(payload));
  const maxLength = Math.min(encoded.length, buffer.byteLength);
  buffer.fill(0);
  buffer.set(encoded.subarray(0, maxLength), 0);
  Atomics.store(header, 1, maxLength);
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
    prompt: String(prompt || ''),
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
  if (parsed && parsed.__codecraftError) {
    throw new Error(String(parsed.__codecraftError));
  }
  return String(parsed && Object.prototype.hasOwnProperty.call(parsed, 'value') ? parsed.value : '');
}

function ensureRuntime() {
  if (runtimeReadyPromise) return runtimeReadyPromise;

  runtimeReadyPromise = new Promise((resolve, reject) => {
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
      workerScope.importScripts('/_framework/blazor.webassembly.js');
    } catch (error) {
      reject(error);
    }
  });

  return runtimeReadyPromise;
}

async function invokeBrowserCSharp(message: RuntimeMessage) {
  await ensureRuntime();

  switch (message.mode) {
    case 'script':
      return DotNet.invokeMethodAsync('BrowserCSharp', 'ExecuteScriptInteractive', message.code || '');
    case 'script-context':
      if (message.resetContext) {
        try {
          await DotNet.invokeMethodAsync('BrowserCSharp', 'ClearScriptContext', message.contextId || 'default');
        } catch {
          // A missing context should not prevent the next interactive run from starting.
        }
      }
      return DotNet.invokeMethodAsync(
        'BrowserCSharp',
        'ExecuteScriptInContextInteractive',
        message.code || '',
        message.contextId || 'default',
      );
    case 'project':
      return DotNet.invokeMethodAsync(
        'BrowserCSharp',
        'ExecuteRegularProjectInteractive',
        message.paths || [],
        message.contents || [],
        message.entryPath || '',
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
