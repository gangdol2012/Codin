window.reportOmniSharpInitializationProgress = function (phase) {
  if (
    window !== window.top &&
    typeof phase === "string" &&
    phase.length > 0 &&
    phase.length <= 64
  ) {
    window.parent.postMessage(
      { omnisharpInitializationProgress: { phase } },
      window.location.origin
    );
  }
};

window.reportOmniSharpInitializationFailure = function (phase, message) {
  if (
    window !== window.top &&
    typeof phase === "string" &&
    phase.length > 0 &&
    phase.length <= 64 &&
    typeof message === "string" &&
    message.length > 0
  ) {
    window.parent.postMessage(
      {
        omnisharpInitializationFailed: {
          phase,
          message: message.slice(0, 1000),
        },
      },
      window.location.origin
    );
  }
};

window.addEventListener("blazorworker:jsdirect", function (event) {
  const phase = event?.detail?.data?.codecraftStaticAssetPhase;
  if (typeof phase === "string" && /^[a-z-]{1,40}$/.test(phase)) {
    window.reportOmniSharpInitializationProgress(`static-asset-${phase}`);
  }
});

function registerService(monacoService) {
  // Broadcast init finished
  if (window !== window.top) {
    window.parent.postMessage(
      {
        omnisharpInitialized: true
      },
      window.location.origin
    );
  }

  const methods = Object.create(null);
  const methodQueues = Object.create(null);
  let pendingExternalRequestCount = 0;
  let hasCompletedExternalRequest = false;
  let lastExternalRequestCompletedAt = performance.now();
  const utf8Decoder = new TextDecoder("utf-8");
  const decodeBase64Utf8 = (base64) => {
    const binary = atob(base64);
    const bytes = new Uint8Array(binary.length);
    for (let index = 0; index < binary.length; index += 1) {
      bytes[index] = binary.charCodeAt(index);
    }
    return utf8Decoder.decode(bytes);
  };
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
        decodeBase64Utf8(parsed.ResultPayload.slice(1, parsed.ResultPayload.length - 1))
      );
      methods[parsedResult.type]?.(
        parsedResult.payload,
        Number.isSafeInteger(parsedResult.metadataVersion) && parsedResult.metadataVersion >= 0
          ? parsedResult.metadataVersion
          : undefined
      );
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
    if (
      e.source === window.parent &&
      e.origin === window.location.origin &&
      e.data?.omnisharp
    ) {
      const { method, args, id } = e.data.omnisharp;
      const source = e.source;
      if (
        typeof method !== "string" ||
        !method ||
        typeof id !== "string" ||
        !Array.isArray(args) ||
        !source ||
        typeof source.postMessage !== "function"
      ) {
        return;
      }
      const respond = (payload, metadataVersion) => {
        const response = {
          method,
          id,
          payload,
        };
        if (Number.isSafeInteger(metadataVersion) && metadataVersion >= 0) {
          response.metadataVersion = metadataVersion;
        }
        source.postMessage(
          {
            omnisharp: response,
          },
          e.origin
        );
      };
      const invoke = () => new Promise((resolve) => {
        let settled = false;
        const finish = (payload, metadataVersion) => {
          if (settled) return;
          settled = true;
          try {
            respond(payload, metadataVersion);
          } finally {
            delete methods[method];
            resolve();
          }
        };
        methods[method] = finish;

        monacoService.invokeMethodAsync(
          "RunAsync",
          method,
          args.map((a) => (typeof a === "object" ? JSON.stringify(a) : a))
        ).then(() => {
          if (!settled) {
            finish(serializeError(
              method,
              new Error("OmniSharp completed without an intercepted response payload.")
            ));
          }
        }, (error) => {
          console.warn(error);
          finish(serializeError(method, error));
        });
      });

      // Count requests as soon as they are accepted, including work queued behind an
      // earlier invocation of the same method. Optional full-reference hydration may
      // start only after every accepted external request has finished and the worker has
      // then remained quiet for the complete idle interval.
      pendingExternalRequestCount += 1;
      const trackedInvoke = async () => {
        try {
          await invoke();
        } finally {
          pendingExternalRequestCount = Math.max(0, pendingExternalRequestCount - 1);
          hasCompletedExternalRequest = true;
          lastExternalRequestCompletedAt = performance.now();
        }
      };
      methodQueues[method] = (methodQueues[method] || Promise.resolve()).then(
        trackedInvoke,
        trackedInvoke
      );
    }
  });

  let hydrationPollingStopped = false;
  let lastHydrationVersion = -1;
  let hydrationRetryCount = 0;
  let invalidHydrationPolls = 0;
  let hydrationPollTimer;
  const hydrationRetryDelays = [1000, 5000, 30000, 60000];
  const hydrationIdleDelayMilliseconds = 30000;
  const externalRequestBusyPollMilliseconds = 100;
  const internalInvocationTimeoutMilliseconds = 30000;
  const observeHydrationVersion = (version, baseline = false) => {
    if (!Number.isSafeInteger(version) || version < 0) return;
    const advanced = version > lastHydrationVersion;
    lastHydrationVersion = Math.max(lastHydrationVersion, version);
    if (advanced && !baseline && window !== window.top) {
      window.parent.postMessage(
        { omnisharpMetadataChanged: { version } },
        window.location.origin
      );
    }
  };
  const invokeInternal = (method) => {
    let resultSettled = false;
    let resolveResult;
    let rejectResult;
    const result = new Promise((resolve, reject) => {
      resolveResult = resolve;
      rejectResult = reject;
    });

    const invoke = () => new Promise((releaseQueue) => {
      let responseReceived = false;
      let queueReleased = false;
      let timeout;
      const release = () => {
        if (queueReleased) return;
        queueReleased = true;
        releaseQueue();
      };
      const removeHandler = () => {
        // A timeout does not release this method lane. Still use an identity check so
        // unloading/re-registration can never let an old transport delete a new handler.
        if (methods[method] === finish) delete methods[method];
      };
      const rejectPendingResult = (error) => {
        if (resultSettled) return;
        resultSettled = true;
        rejectResult(error);
      };
      const finish = (payload, metadataVersion) => {
        if (responseReceived) return;
        responseReceived = true;
        clearTimeout(timeout);
        removeHandler();
        if (!resultSettled) {
          resultSettled = true;
          resolveResult({ payload, metadataVersion });
        }
        // The intercepted payload is the one response for this invocation. It is safe
        // to admit the next same-method call even if the JS interop promise resolves on
        // the following microtask.
        release();
      };

      methods[method] = finish;
      timeout = setTimeout(() => {
        rejectPendingResult(new Error(
          `${method} did not respond within ${internalInvocationTimeoutMilliseconds}ms.`
        ));
        // Keep both the handler and method lane until the old transport really settles.
        // Otherwise its late default-typed payload could complete a newer invocation.
      }, internalInvocationTimeoutMilliseconds);

      let invocation;
      try {
        // BlazorWorker's serialized expression reliably selects the parameterless worker
        // method. Its payload therefore uses the method name as the response type.
        invocation = monacoService.invokeMethodAsync("RunAsync", method, []);
      } catch (error) {
        clearTimeout(timeout);
        removeHandler();
        rejectPendingResult(error);
        release();
        return;
      }

      Promise.resolve(invocation).then(() => {
        if (responseReceived) return;
        clearTimeout(timeout);
        removeHandler();
        rejectPendingResult(new Error(
          `${method} completed without an intercepted response payload.`
        ));
        release();
      }, (error) => {
        if (responseReceived) return;
        clearTimeout(timeout);
        removeHandler();
        rejectPendingResult(error);
        release();
      });
    });

    // Internal state probes share the same lane as externally requested methods. This
    // prevents either side from replacing the other's single response handler.
    const previous = methodQueues[method] || Promise.resolve();
    methodQueues[method] = previous.then(invoke, invoke);
    return result;
  };
  const scheduleHydrationPoll = (delay) => {
    if (!hydrationPollingStopped) {
      hydrationPollTimer = setTimeout(pollHydration, delay);
    }
  };
  const scheduleHydrationRetry = () => {
    if (hydrationPollingStopped) return;
    // Interactive-priority cancellation is expected, not a terminal hydration failure.
    // Keep retrying only in a fresh authoring-idle window, with a capped delay so an
    // uncommon reference never becomes permanently unavailable in a long-lived tab.
    const delay = hydrationRetryDelays[
      Math.min(hydrationRetryCount++, hydrationRetryDelays.length - 1)
    ];
    hydrationPollTimer = setTimeout(() => {
      runHydrationStartWhenIdle(async () => {
        if (hydrationPollingStopped) return;
        try {
          const { payload } = await invokeInternal("BeginMetadataHydrationAsync");
          if (payload) observeHydrationVersion(payload.version);
          invalidHydrationPolls = 0;
          scheduleHydrationPoll(500);
        } catch (error) {
          console.warn("Could not retry OmniSharp metadata hydration.", error);
          scheduleHydrationRetry();
        }
      });
    }, delay);
  };
  const pollHydration = async () => {
    if (hydrationPollingStopped) return;
    try {
      const { payload } = await invokeInternal("GetMetadataStateAsync");
      if (
        payload &&
        Number.isSafeInteger(payload.version) &&
        payload.version >= 0 &&
        typeof payload.fullyHydrated === "boolean" &&
        typeof payload.hydrationRunning === "boolean"
      ) {
        invalidHydrationPolls = 0;
        observeHydrationVersion(payload.version);
        if (payload.fullyHydrated) {
          hydrationPollingStopped = true;
          return;
        }
        if (!payload.hydrationRunning) {
          scheduleHydrationRetry();
          return;
        }
        hydrationRetryCount = 0;
        // A valid hydration may legitimately outlive normal request timeouts (for
        // example on a throttled static host). Keep one cheap status poll per second
        // without imposing a wall-clock deadline.
        scheduleHydrationPoll(1000);
        return;
      }
      invalidHydrationPolls += 1;
    } catch (error) {
      console.warn("Could not poll OmniSharp metadata hydration.", error);
      invalidHydrationPolls += 1;
    }
    if (invalidHydrationPolls >= 8) {
      invalidHydrationPolls = 0;
      scheduleHydrationRetry();
      return;
    }
    scheduleHydrationPoll(Math.min(8000, 500 * (2 ** invalidHydrationPolls)));
  };

  const runHydrationStartWhenIdle = (start) => {
    if (hydrationPollingStopped) return;
    // Never let an untouched worker begin optional full-pack work simply because the
    // page has been open for a few seconds. The first real authoring request establishes
    // that startup and its demand-driven metadata promotions have finished.
    if (!hasCompletedExternalRequest) {
      hydrationPollTimer = setTimeout(
        () => runHydrationStartWhenIdle(start),
        1000
      );
      return;
    }
    if (pendingExternalRequestCount > 0) {
      hydrationPollTimer = setTimeout(
        () => runHydrationStartWhenIdle(start),
        externalRequestBusyPollMilliseconds
      );
      return;
    }

    const idleFor = performance.now() - lastExternalRequestCompletedAt;
    if (idleFor < hydrationIdleDelayMilliseconds) {
      hydrationPollTimer = setTimeout(
        () => runHydrationStartWhenIdle(start),
        Math.max(1, Math.ceil(hydrationIdleDelayMilliseconds - idleFor))
      );
      return;
    }
    void start();
  };

  const hydrationIsStillIdle = () =>
    hasCompletedExternalRequest &&
    pendingExternalRequestCount === 0 &&
    performance.now() - lastExternalRequestCompletedAt >= hydrationIdleDelayMilliseconds;

  // Full-reference hydration is optional because namespaces are promoted on demand.
  // Starting it while the user is actively typing defeats the worker's interactive
  // priority: single-threaded WASM cannot preempt Roslyn in the middle of a materialization.
  // Wait for a real quiet window, then remember the baseline version and notify only for
  // subsequent commits. Continuous authoring postpones this work without losing features.
  const startInitialHydration = async () => {
    if (hydrationPollingStopped) return;
    try {
      // Capture the version before starting. A single-threaded worker can finish a very
      // fast hydration before BeginMetadataHydrationAsync's response crosses back into
      // this frame; treating that response itself as the baseline would suppress the
      // cache-invalidation notification for a real metadata change.
      const baseline = await invokeInternal("GetMetadataStateAsync");
      if (baseline.payload) {
        observeHydrationVersion(baseline.payload.version, true);
        // Eager static-site startup now publishes the complete immutable reference
        // generation before service registration. Stop here instead of waking the
        // worker again after every tab's first thirty-second idle interval.
        if (baseline.payload.fullyHydrated === true) {
          hydrationPollingStopped = true;
          return;
        }
      }
      // The baseline crosses an async worker boundary. Authoring may have resumed while
      // it was in flight, so require a fresh full idle interval before starting the
      // non-preemptible reference-pack materialization.
      if (!hydrationIsStillIdle()) {
        runHydrationStartWhenIdle(startInitialHydration);
        return;
      }
      const started = await invokeInternal("BeginMetadataHydrationAsync");
      if (started.payload) observeHydrationVersion(started.payload.version);
    } catch (error) {
      console.warn("Could not start OmniSharp metadata hydration.", error);
      scheduleHydrationRetry();
      return;
    }
    scheduleHydrationPoll(500);
  };
  runHydrationStartWhenIdle(startInitialHydration);

  window.addEventListener("unload", () => {
    hydrationPollingStopped = true;
    if (hydrationPollTimer) clearTimeout(hydrationPollTimer);
  }, { once: true });
}

window.registerService = registerService;
