import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import vm from 'node:vm';

const messageServiceSource = await readFile(
  new URL('../vendor/omnisharp-wasm/wwwroot/message-service.js', import.meta.url),
  'utf8'
);

function deferred() {
  let resolve;
  const promise = new Promise(currentResolve => {
    resolve = currentResolve;
  });
  return { promise, resolve };
}

test('metadata hydration requires interactive work and thirty idle seconds after completion', async () => {
  let now = 0;
  let nextTimerId = 0;
  const timers = new Map();
  const listeners = new Map();
  const invocations = [];
  const longRequest = deferred();
  const resumedRequest = deferred();
  let messageListener;
  let injectedResumedAuthoring = false;

  const setTimeoutFake = (callback, delay = 0) => {
    const id = ++nextTimerId;
    timers.set(id, { callback, dueAt: now + Number(delay) });
    return id;
  };
  const clearTimeoutFake = id => timers.delete(id);
  const advanceTo = async target => {
    while (true) {
      const next = [...timers.entries()]
        .filter(([, timer]) => timer.dueAt <= target)
        .sort((left, right) => left[1].dueAt - right[1].dueAt || left[0] - right[0])[0];
      if (!next) break;
      const [id, timer] = next;
      timers.delete(id);
      now = timer.dueAt;
      timer.callback();
      await Promise.resolve();
    }
    now = target;
    await Promise.resolve();
  };
  const flushMicrotasks = async () => {
    for (let index = 0; index < 8; index += 1) await Promise.resolve();
  };

  const parent = { postMessage() {} };
  const window = {
    top: {},
    parent,
    location: { origin: 'https://static.example' },
    addEventListener(type, listener) {
      const current = listeners.get(type) ?? [];
      current.push(listener);
      listeners.set(type, current);
    },
  };
  const context = vm.createContext({
    window,
    performance: { now: () => now },
    setTimeout: setTimeoutFake,
    clearTimeout: clearTimeoutFake,
    TextDecoder,
    Uint8Array,
    atob,
    JSON,
    Promise,
    Error,
    console: { warn() {} },
  });
  vm.runInContext(messageServiceSource, context, { filename: 'message-service.js' });

  const servicePrototype = { invokeMethod() {} };
  const monacoService = Object.create(servicePrototype);
  const emitInternalResponse = method => {
    const response = Buffer.from(JSON.stringify({
      type: method,
      payload: {
        version: 0,
        fullyHydrated: false,
        hydrationRunning: method === 'BeginMetadataHydrationAsync',
      },
      metadataVersion: 0,
    }), 'utf8').toString('base64');
    servicePrototype.invokeMethod.call(
      monacoService,
      'RunAsync',
      JSON.stringify({ ResultPayload: JSON.stringify(response) })
    );
    if (method === 'GetMetadataStateAsync' && !injectedResumedAuthoring) {
      injectedResumedAuthoring = true;
      messageListener({
        source: parent,
        origin: window.location.origin,
        data: { omnisharp: { method: 'ResumedFeature', args: [], id: 'session:2' } },
      });
    }
  };
  monacoService.invokeMethodAsync = (_entryPoint, method, args) => {
    invocations.push({ method, args });
    if (method === 'LongFeature') return longRequest.promise;
    if (method === 'ResumedFeature') return resumedRequest.promise;
    Promise.resolve().then(() => emitInternalResponse(method));
    return Promise.resolve();
  };
  window.registerService(monacoService);

  messageListener = listeners.get('message')?.[0];
  assert.equal(typeof messageListener, 'function');

  await advanceTo(60_000);
  assert.deepEqual(
    invocations.filter(invocation => invocation.method === 'GetMetadataStateAsync'),
    [],
    'an untouched worker must never start optional hydration on page-age alone'
  );

  messageListener({
    source: parent,
    origin: window.location.origin,
    data: { omnisharp: { method: 'LongFeature', args: [], id: 'session:1' } },
  });
  await flushMicrotasks();

  await advanceTo(70_000);
  assert.deepEqual(
    invocations.filter(invocation => invocation.method === 'GetMetadataStateAsync'),
    [],
    'hydration must not start while accepted external work is running or queued'
  );

  longRequest.resolve();
  await flushMicrotasks();
  await advanceTo(99_999);
  assert.deepEqual(
    invocations.filter(invocation => invocation.method === 'GetMetadataStateAsync'),
    [],
    'the idle interval starts when the last external request completes'
  );

  await advanceTo(100_000);
  await flushMicrotasks();
  assert.equal(
    invocations.filter(invocation => invocation.method === 'GetMetadataStateAsync').length,
    1,
    'hydration may query its baseline after thirty complete idle seconds'
  );
  assert.equal(
    invocations.filter(invocation => invocation.method === 'BeginMetadataHydrationAsync').length,
    0,
    'authoring accepted during the asynchronous baseline query must postpone hydration'
  );

  resumedRequest.resolve();
  await flushMicrotasks();
  await advanceTo(129_999);
  assert.equal(
    invocations.filter(invocation => invocation.method === 'GetMetadataStateAsync').length,
    1,
    'resumed authoring must establish a fresh thirty-second quiet interval'
  );

  await advanceTo(130_000);
  await flushMicrotasks();
  assert.equal(
    invocations.filter(invocation => invocation.method === 'GetMetadataStateAsync').length,
    2,
    'hydration should query a fresh baseline after the renewed idle interval'
  );
  assert.equal(
    invocations.filter(invocation => invocation.method === 'BeginMetadataHydrationAsync').length,
    1,
    'the intercepted default-typed baseline response must advance hydration startup once idle'
  );
  assert.deepEqual(
    invocations
      .filter(invocation => invocation.method.endsWith('MetadataHydrationAsync') ||
        invocation.method === 'GetMetadataStateAsync')
      .map(invocation => Array.from(invocation.args)),
    [[], [], []],
    'internal calls must select the parameterless worker methods and their default response keys'
  );
});

test('eager fully hydrated metadata stops before the legacy hydration start call', async () => {
  let now = 0;
  let nextTimerId = 0;
  const timers = new Map();
  const listeners = new Map();
  const invocations = [];

  const setTimeoutFake = (callback, delay = 0) => {
    const id = ++nextTimerId;
    timers.set(id, { callback, dueAt: now + Number(delay) });
    return id;
  };
  const clearTimeoutFake = id => timers.delete(id);
  const flushMicrotasks = async () => {
    for (let index = 0; index < 12; index += 1) await Promise.resolve();
  };
  const advanceTo = async target => {
    while (true) {
      const next = [...timers.entries()]
        .filter(([, timer]) => timer.dueAt <= target)
        .sort((left, right) => left[1].dueAt - right[1].dueAt || left[0] - right[0])[0];
      if (!next) break;
      const [id, timer] = next;
      timers.delete(id);
      now = timer.dueAt;
      timer.callback();
      await flushMicrotasks();
    }
    now = target;
    await flushMicrotasks();
  };

  const parent = { postMessage() {} };
  const window = {
    top: {},
    parent,
    location: { origin: 'https://static.example' },
    addEventListener(type, listener) {
      const current = listeners.get(type) ?? [];
      current.push(listener);
      listeners.set(type, current);
    },
  };
  const context = vm.createContext({
    window,
    performance: { now: () => now },
    setTimeout: setTimeoutFake,
    clearTimeout: clearTimeoutFake,
    TextDecoder,
    Uint8Array,
    atob,
    JSON,
    Promise,
    Error,
    console: { warn() {} },
  });
  vm.runInContext(messageServiceSource, context, { filename: 'message-service.js' });

  const servicePrototype = { invokeMethod() {} };
  const monacoService = Object.create(servicePrototype);
  const emitResponse = method => {
    const payload = method === 'GetMetadataStateAsync'
      ? { version: 1, fullyHydrated: true, hydrationRunning: false }
      : { success: true };
    const response = Buffer.from(JSON.stringify({
      type: method,
      payload,
      metadataVersion: 1,
    }), 'utf8').toString('base64');
    servicePrototype.invokeMethod.call(
      monacoService,
      'RunAsync',
      JSON.stringify({ ResultPayload: JSON.stringify(response) })
    );
  };
  monacoService.invokeMethodAsync = (_entryPoint, method, args) => {
    invocations.push({ method, args });
    Promise.resolve().then(() => emitResponse(method));
    return Promise.resolve();
  };
  window.registerService(monacoService);

  const messageListener = listeners.get('message')?.[0];
  assert.equal(typeof messageListener, 'function');
  messageListener({
    source: parent,
    origin: window.location.origin,
    data: { omnisharp: { method: 'SeedFeature', args: [], id: 'seed:fully-hydrated' } },
  });
  await flushMicrotasks();

  await advanceTo(30_000);
  assert.equal(
    invocations.filter(invocation => invocation.method === 'GetMetadataStateAsync').length,
    1,
    'the first authoring-idle window may read the eager metadata state once'
  );
  assert.equal(
    invocations.filter(invocation => invocation.method === 'BeginMetadataHydrationAsync').length,
    0,
    'a fully hydrated baseline must never invoke the obsolete background transition'
  );

  await advanceTo(330_000);
  assert.equal(
    invocations.filter(invocation => invocation.method === 'GetMetadataStateAsync').length,
    1,
    'the fully hydrated baseline must permanently stop polling for this service lifetime'
  );
});

test('cancelled metadata hydration retries forever with capped exponential backoff', async () => {
  let now = 0;
  let nextTimerId = 0;
  const timers = new Map();
  const listeners = new Map();
  const invocations = [];

  const setTimeoutFake = (callback, delay = 0) => {
    const id = ++nextTimerId;
    timers.set(id, { callback, dueAt: now + Number(delay) });
    return id;
  };
  const clearTimeoutFake = id => timers.delete(id);
  const flushMicrotasks = async () => {
    for (let index = 0; index < 12; index += 1) await Promise.resolve();
  };
  const advanceTo = async target => {
    while (true) {
      const next = [...timers.entries()]
        .filter(([, timer]) => timer.dueAt <= target)
        .sort((left, right) => left[1].dueAt - right[1].dueAt || left[0] - right[0])[0];
      if (!next) break;
      const [id, timer] = next;
      timers.delete(id);
      now = timer.dueAt;
      timer.callback();
      await flushMicrotasks();
    }
    now = target;
    await flushMicrotasks();
  };

  const parent = { postMessage() {} };
  const window = {
    top: {},
    parent,
    location: { origin: 'https://static.example' },
    addEventListener(type, listener) {
      const current = listeners.get(type) ?? [];
      current.push(listener);
      listeners.set(type, current);
    },
  };
  const context = vm.createContext({
    window,
    performance: { now: () => now },
    setTimeout: setTimeoutFake,
    clearTimeout: clearTimeoutFake,
    TextDecoder,
    Uint8Array,
    atob,
    JSON,
    Promise,
    Error,
    console: { warn() {} },
  });
  vm.runInContext(messageServiceSource, context, { filename: 'message-service.js' });

  const servicePrototype = { invokeMethod() {} };
  const monacoService = Object.create(servicePrototype);
  const emitResponse = (method, payload) => {
    const response = Buffer.from(JSON.stringify({
      type: method,
      payload,
      metadataVersion: 0,
    }), 'utf8').toString('base64');
    servicePrototype.invokeMethod.call(
      monacoService,
      'RunAsync',
      JSON.stringify({ ResultPayload: JSON.stringify(response) })
    );
  };
  monacoService.invokeMethodAsync = (_entryPoint, method) => {
    invocations.push({ method, at: now });
    Promise.resolve().then(() => emitResponse(method, method === 'SeedFeature'
      ? { seeded: true }
      : { version: 0, fullyHydrated: false, hydrationRunning: false }));
    return Promise.resolve();
  };
  window.registerService(monacoService);

  const messageListener = listeners.get('message')?.[0];
  assert.equal(typeof messageListener, 'function');
  messageListener({
    source: parent,
    origin: window.location.origin,
    data: { omnisharp: { method: 'SeedFeature', args: [], id: 'seed:retry' } },
  });
  await flushMicrotasks();
  await advanceTo(188_500);

  const beginTimes = invocations
    .filter(invocation => invocation.method === 'BeginMetadataHydrationAsync')
    .map(invocation => invocation.at);
  assert.deepEqual(
    beginTimes,
    [30_000, 31_500, 37_000, 67_500, 128_000, 188_500],
    'cancellation must never stop retries, and retry delay must cap at sixty seconds'
  );
});

test('a timed-out internal call keeps its method lane until the late response is consumed', async () => {
  let now = 0;
  let nextTimerId = 0;
  const timers = new Map();
  const listeners = new Map();
  const invocations = [];
  const postedMessages = [];
  const internalTransport = deferred();
  const externalTransport = deferred();

  const setTimeoutFake = (callback, delay = 0) => {
    const id = ++nextTimerId;
    timers.set(id, { callback, dueAt: now + Number(delay) });
    return id;
  };
  const clearTimeoutFake = id => timers.delete(id);
  const flushMicrotasks = async () => {
    for (let index = 0; index < 12; index += 1) await Promise.resolve();
  };
  const advanceTo = async target => {
    while (true) {
      const next = [...timers.entries()]
        .filter(([, timer]) => timer.dueAt <= target)
        .sort((left, right) => left[1].dueAt - right[1].dueAt || left[0] - right[0])[0];
      if (!next) break;
      const [id, timer] = next;
      timers.delete(id);
      now = timer.dueAt;
      timer.callback();
      await flushMicrotasks();
    }
    now = target;
    await flushMicrotasks();
  };

  const parent = {
    postMessage(message) {
      postedMessages.push(message);
    },
  };
  const window = {
    top: {},
    parent,
    location: { origin: 'https://static.example' },
    addEventListener(type, listener) {
      const current = listeners.get(type) ?? [];
      current.push(listener);
      listeners.set(type, current);
    },
  };
  const context = vm.createContext({
    window,
    performance: { now: () => now },
    setTimeout: setTimeoutFake,
    clearTimeout: clearTimeoutFake,
    TextDecoder,
    Uint8Array,
    atob,
    JSON,
    Promise,
    Error,
    console: { warn() {} },
  });
  vm.runInContext(messageServiceSource, context, { filename: 'message-service.js' });

  const servicePrototype = { invokeMethod() {} };
  const monacoService = Object.create(servicePrototype);
  const emitResponse = (method, payload) => {
    const response = Buffer.from(JSON.stringify({
      type: method,
      payload,
      metadataVersion: 0,
    }), 'utf8').toString('base64');
    servicePrototype.invokeMethod.call(
      monacoService,
      'RunAsync',
      JSON.stringify({ ResultPayload: JSON.stringify(response) })
    );
  };
  monacoService.invokeMethodAsync = (_entryPoint, method, args) => {
    invocations.push({ method, args });
    if (method === 'SeedFeature') {
      Promise.resolve().then(() => emitResponse(method, { seeded: true }));
      return Promise.resolve();
    }
    const sameMethodCalls = invocations.filter(invocation =>
      invocation.method === 'GetMetadataStateAsync'
    ).length;
    return sameMethodCalls === 1 ? internalTransport.promise : externalTransport.promise;
  };
  window.registerService(monacoService);

  const messageListener = listeners.get('message')?.[0];
  assert.equal(typeof messageListener, 'function');
  messageListener({
    source: parent,
    origin: window.location.origin,
    data: { omnisharp: { method: 'SeedFeature', args: [], id: 'seed:1' } },
  });
  await flushMicrotasks();

  await advanceTo(30_000);
  assert.equal(
    invocations.filter(invocation => invocation.method === 'GetMetadataStateAsync').length,
    1,
    'the internal baseline query should occupy the method lane'
  );

  messageListener({
    source: parent,
    origin: window.location.origin,
    data: {
      omnisharp: {
        method: 'GetMetadataStateAsync',
        args: ['external-response-key'],
        id: 'external:1',
      },
    },
  });
  await advanceTo(60_000);
  assert.equal(
    invocations.filter(invocation => invocation.method === 'GetMetadataStateAsync').length,
    1,
    'the timeout must reject only its caller and leave newer same-method work queued'
  );

  emitResponse('GetMetadataStateAsync', { marker: 'late-internal' });
  await flushMicrotasks();
  assert.equal(
    invocations.filter(invocation => invocation.method === 'GetMetadataStateAsync').length,
    2,
    'consuming the late internal response should release exactly one queued invocation'
  );

  emitResponse('GetMetadataStateAsync', { marker: 'external' });
  externalTransport.resolve();
  internalTransport.resolve();
  await flushMicrotasks();

  const externalResponse = postedMessages.find(message =>
    message?.omnisharp?.id === 'external:1'
  );
  assert.deepEqual(
    externalResponse?.omnisharp?.payload,
    { marker: 'external' },
    'the late internal payload must never satisfy the newer external request'
  );
  assert.deepEqual(
    Array.from(invocations.at(-1).args),
    ['external-response-key'],
    'the external invocation must retain its own arguments after the internal timeout'
  );
});
