function registerService(monacoService) {
  // Broadcast init finished
  if (window !== window.top) {
    window.parent.postMessage(
      {
        intellisageInitialized: true
      },
      "*"
    );
  }

  const methods = {};

  // Override the invokeMethod prototype
  // Biggest bottleneck here is marshalling JS to WASM for strings
  // So we cut out the middleman and intercept this in our message listener and save one round trip
  const orig = monacoService.__proto__.invokeMethod;
  monacoService.__proto__.invokeMethod = function (...args) {
    try {
      const serializedResult = args[args.length - 1];
      if (typeof serializedResult !== "string") {
        return orig.call(this, ...args);
      }

      const parsed = JSON.parse(serializedResult);
      const resultPayload = parsed.ResultPayload;
      if (typeof resultPayload !== "string" || resultPayload.length < 2) {
        return orig.call(this, ...args);
      }

      const parsedResult = JSON.parse(
        atob(resultPayload.slice(1, resultPayload.length - 1))
      );
      const callback = methods[parsedResult.type];
      if (typeof callback !== "function") {
        return orig.call(this, ...args);
      }

      callback(parsedResult.payload);
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
    if (e.data?.intellisage) {
      const { method, args, id } = e.data.intellisage;
      methods[method] = (payload) => {
        delete methods[method];
        if (e.source) {
          e.source.postMessage(
            {
              intellisage: {
                method,
                id,
                payload,
              },
            },
            "*"
          );
        }
      };

      monacoService.invokeMethodAsync(
        "RunAsync",
        method,
        args.map((a) => (typeof a === "object" ? JSON.stringify(a) : a))
      ).catch((error) => {
        console.warn("IntelliSage method failed", method, error);
        const callback = methods[method];
        if (typeof callback === "function") {
          callback(false);
        }
      });
    }
  });
}

window.registerService = registerService;
