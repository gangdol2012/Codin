function registerService(monacoService) {
  // Broadcast init finished
  if (window !== window.top) {
    window.parent.postMessage(
      {
        omnisharpInitialized: true
      },
      "*"
    );
  }

  const methods = {};
  const methodQueues = {};
  const serializeError = (method, error) => ({
    __codecraftOmniSharpError: true,
    method,
    name: error && typeof error.name === "string" ? error.name : typeof error,
    message: error && typeof error.message === "string" ? error.message : String(error),
    stack: error && typeof error.stack === "string" ? error.stack.slice(0, 4000) : undefined
  });

  // Override the invokeMethod prototype
  // Biggest bottleneck here is marshalling JS to WASM for strings
  // So we cut out the middleman and intercept this in our message listener and save one round trip
  const orig = monacoService.__proto__.invokeMethod;
  monacoService.__proto__.invokeMethod = function (...args) {
    try {
      const parsed = JSON.parse(args[args.length - 1]);
      if (typeof parsed?.ResultPayload !== "string") {
        return orig.call(this, ...args);
      }
      const parsedResult = JSON.parse(
        atob(parsed.ResultPayload.slice(1, parsed.ResultPayload.length - 1))
      );
      methods[parsedResult.type]?.(parsedResult.payload);
      parsed.ResultPayload = JSON.stringify(JSON.stringify("{}"));
      return orig.call(this, args[0], null);
    } catch (e) {
      console.warn(e);
    }
    return orig.call(this, ...args);
  };

  // Thin message layer to communicate with parent
  // Proxy for invoking on DotNet
  window.addEventListener("message", (e) => {
    if (e.data?.omnisharp) {
      const { method, args, id } = e.data.omnisharp;
      const source = e.source;
      const respond = (payload) => {
        source.postMessage(
          {
            omnisharp: {
              method,
              id,
              payload,
            },
          },
          "*"
        );
      };
      const invoke = () => new Promise((resolve) => {
        methods[method] = (payload) => {
          try {
            respond(payload);
          } finally {
            delete methods[method];
            resolve();
          }
        };

        monacoService.invokeMethodAsync(
          "RunAsync",
          method,
          args.map((a) => (typeof a === "object" ? JSON.stringify(a) : a))
        ).catch((error) => {
          console.warn(error);
          delete methods[method];
          respond(serializeError(method, error));
          resolve();
        });
      });

      methodQueues[method] = (methodQueues[method] || Promise.resolve()).then(invoke, invoke);
    }
  });
}

window.registerService = registerService;
