import assert from 'node:assert/strict';
import { gzipSync } from 'node:zlib';
import { test } from 'node:test';
import { webcrypto } from 'node:crypto';

import {
    createBrowserTaskYield,
    createStaticAssetByteLoader,
    createVerifiedGzipBootResourceLoader,
    createVerifiedReferencePackFetch,
    installVerifiedReferencePackFetch
} from '../vendor/omnisharp-wasm/wwwroot/boot-resource-loader.js';

if (!globalThis.crypto) {
    globalThis.crypto = webcrypto;
}

const encodeIntegrity = bytes => `sha256-${Buffer.from(bytes).toString('base64')}`;

async function integrityFor(bytes) {
    return encodeIntegrity(await globalThis.crypto.subtle.digest('SHA-256', bytes));
}

test('browser task yield prefers scheduler.yield without a timer', async () => {
    let calls = 0;
    class UnexpectedMessageChannel {
        constructor() {
            throw new Error('MessageChannel fallback must not be constructed when scheduler.yield exists');
        }
    }
    const yieldToBrowser = createBrowserTaskYield({
        MessageChannel: UnexpectedMessageChannel,
        scheduler: {
            yield: async () => {
                calls++;
            }
        }
    });

    await yieldToBrowser();
    assert.equal(calls, 1);
});

test('browser task yield falls back to FIFO MessageChannel tasks', async () => {
    class TestMessageChannel {
        constructor() {
            this.port1 = { onmessage: null, start() {} };
            this.port2 = {
                postMessage: () => queueMicrotask(() => this.port1.onmessage?.({}))
            };
        }
    }
    const yieldToBrowser = createBrowserTaskYield({ MessageChannel: TestMessageChannel });
    const completions = [];

    await Promise.all([
        yieldToBrowser().then(() => completions.push(1)),
        yieldToBrowser().then(() => completions.push(2)),
        yieldToBrowser().then(() => completions.push(3))
    ]);

    assert.deepEqual(completions, [1, 2, 3]);
});

test('returns the verified decompressed boot resource', async () => {
    const raw = new TextEncoder().encode('verified Roslyn assembly bytes');
    const compressed = gzipSync(raw);
    const calls = [];
    const loader = createVerifiedGzipBootResourceLoader(async (url, options) => {
        calls.push({ url, options });
        return new Response(compressed);
    });

    const response = await loader('assembly', 'Roslyn.dll', '/Roslyn.dll', await integrityFor(raw));

    assert.deepEqual(new Uint8Array(await response.arrayBuffer()), raw);
    assert.deepEqual(calls.map(call => call.url), ['/Roslyn.dll.gz']);
    assert.equal(response.headers.get('content-type'), 'application/octet-stream');
});

test('accepts a body already decoded through HTTP Content-Encoding', async () => {
    const raw = new TextEncoder().encode('browser-decoded assembly bytes');
    const loader = createVerifiedGzipBootResourceLoader(async () => new Response(raw, {
        headers: { 'content-encoding': 'gzip' }
    }));

    const response = await loader('assembly', 'Decoded.dll', '/Decoded.dll', await integrityFor(raw));

    assert.deepEqual(new Uint8Array(await response.arrayBuffer()), raw);
});

test('latches a corrupt sidecar and uses integrity-checked raw fallback', async () => {
    const raw = new TextEncoder().encode('correct bytes');
    const wrong = gzipSync(new TextEncoder().encode('stale bytes'));
    const calls = [];
    const loader = createVerifiedGzipBootResourceLoader(async (url, options) => {
        calls.push({ url, options });
        return url.endsWith('.gz') ? new Response(wrong) : new Response(raw);
    });
    const integrity = await integrityFor(raw);

    const first = await loader('assembly', 'Project.dll', '/Project.dll', integrity);
    const second = await loader('assembly', 'Project.dll', '/Project.dll', integrity);

    assert.deepEqual(new Uint8Array(await first.arrayBuffer()), raw);
    assert.deepEqual(new Uint8Array(await second.arrayBuffer()), raw);
    assert.deepEqual(calls.map(call => call.url), [
        '/Project.dll.gz',
        '/Project.dll',
        '/Project.dll'
    ]);
    assert.equal(calls[1].options.integrity, integrity);
    assert.equal(calls[2].options.integrity, integrity);
});

test('leaves JavaScript and unhashed resources to Blazor', () => {
    const loader = createVerifiedGzipBootResourceLoader(() => {
        throw new Error('fetch should not be called');
    });

    assert.equal(loader('dotnetjs', 'dotnet.js', '/dotnet.js', 'sha256-value'), undefined);
    assert.equal(loader('manifest', 'blazor.boot.json', '/blazor.boot.json', ''), undefined);
    assert.equal(loader('configuration', 'appsettings.json', '/appsettings.json', ''), undefined);
});

test('moves static assets through an exact Uint8Array result', async () => {
    const expected = new TextEncoder().encode('native WebAssembly byte transfer');
    const calls = [];
    const loader = createStaticAssetByteLoader(async (url, options) => {
        calls.push({ url, options });
        return new Response(expected);
    });

    const result = await loader('https://static.example/compiler.pack', 1_000);

    assert.deepEqual(result, expected);
    assert.equal(calls.length, 1);
    assert.equal(calls[0].url, 'https://static.example/compiler.pack');
    assert.equal(calls[0].options.cache, 'no-cache');
    assert.equal(calls[0].options.credentials, 'same-origin');
    assert.equal(calls[0].options.signal.aborted, false);
});

test('bounds a stalled native static-asset transfer', async () => {
    let signal;
    const loader = createStaticAssetByteLoader((_url, options) => {
        signal = options.signal;
        return new Promise(() => {});
    });

    await assert.rejects(
        loader('https://static.example/stalled.pack', 1),
        /timed out after 1000 ms/
    );
    assert.equal(signal.aborted, true);
});

test('a stalled compressed boot resource aborts and falls back to raw', async () => {
    const raw = new TextEncoder().encode('raw boot resource');
    const calls = [];
    let compressedSignal;
    const loader = createVerifiedGzipBootResourceLoader(async (url, options) => {
        calls.push(url);
        if (url.endsWith('.gz')) {
            compressedSignal = options.signal;
            return new Promise(() => {});
        }
        return new Response(raw);
    }, 5);

    const response = await loader('assembly', 'Bounded.dll', '/Bounded.dll', await integrityFor(raw));

    assert.deepEqual(new Uint8Array(await response.arrayBuffer()), raw);
    assert.deepEqual(calls, ['/Bounded.dll.gz', '/Bounded.dll']);
    assert.equal(compressedSignal.aborted, true);
});

test('shares one verified compressed reference pack across callers', async () => {
    const raw = new TextEncoder().encode('one immutable compiler pack');
    const compressed = gzipSync(raw);
    const calls = [];
    const packHash = Buffer.from(await globalThis.crypto.subtle.digest('SHA-256', raw)).toString('hex');
    const wrappedFetch = createVerifiedReferencePackFetch(async url => {
        const requestedUrl = url.toString();
        calls.push(requestedUrl);
        if (requestedUrl.endsWith('codecraft-namespace-index.json')) {
            return Response.json({
                referencePack: {
                    path: 'codecraft-reference-pack.bin',
                    length: raw.byteLength,
                    sha256: packHash
                }
            });
        }
        if (requestedUrl.endsWith('.bin.gz')) {
            return new Response(compressed);
        }
        throw new Error(`Unexpected raw pack fetch: ${requestedUrl}`);
    });

    const url = 'https://static.example/ide/omnisharp/_framework/codecraft-reference-pack.bin';
    const [first, second] = await Promise.all([wrappedFetch(url), wrappedFetch(url)]);

    assert.deepEqual(new Uint8Array(await first.arrayBuffer()), raw);
    assert.deepEqual(new Uint8Array(await second.arrayBuffer()), raw);
    assert.deepEqual(calls, [
        'https://static.example/ide/omnisharp/_framework/codecraft-namespace-index.json',
        `${url}.gz`
    ]);
});

test('shares the managed manifest response with pack verification', async () => {
    const raw = new TextEncoder().encode('one pack after one manifest transfer');
    const compressed = gzipSync(raw);
    const packHash = Buffer.from(
        await globalThis.crypto.subtle.digest('SHA-256', raw)
    ).toString('hex');
    const calls = [];
    const manifest = {
        referencePack: {
            path: 'codecraft-reference-pack.bin',
            length: raw.byteLength,
            sha256: packHash
        }
    };
    const manifestUrl = 'https://static.example/ide/omnisharp/_framework/codecraft-namespace-index.json';
    const packUrl = 'https://static.example/ide/omnisharp/_framework/codecraft-reference-pack.bin';
    const wrappedFetch = createVerifiedReferencePackFetch(async requested => {
        const requestedUrl = requested.toString();
        calls.push(requestedUrl);
        if (requestedUrl === manifestUrl) return Response.json(manifest);
        if (requestedUrl === `${packUrl}.gz`) return new Response(compressed);
        throw new Error(`Unexpected request: ${requestedUrl}`);
    });

    const managedManifestResponse = await wrappedFetch(manifestUrl);
    assert.deepEqual(await managedManifestResponse.json(), manifest);
    const packResponse = await wrappedFetch(packUrl);

    assert.deepEqual(new Uint8Array(await packResponse.arrayBuffer()), raw);
    assert.deepEqual(calls, [manifestUrl, `${packUrl}.gz`]);
});

test('native loader reuses verified pack bytes without a Response body copy', async () => {
    const raw = new TextEncoder().encode('zero extra response body copies');
    const compressed = gzipSync(raw);
    const packHash = Buffer.from(
        await globalThis.crypto.subtle.digest('SHA-256', raw)
    ).toString('hex');
    const url = 'https://static.example/omnisharp/_framework/codecraft-reference-pack.bin';
    const wrappedFetch = createVerifiedReferencePackFetch(async requested => {
        const requestedUrl = requested.toString();
        if (requestedUrl.endsWith('codecraft-namespace-index.json')) {
            return Response.json({
                referencePack: {
                    path: 'codecraft-reference-pack.bin',
                    length: raw.byteLength,
                    sha256: packHash
                }
            });
        }
        if (requestedUrl.endsWith('.bin.gz')) {
            return new Response(compressed);
        }
        throw new Error(`Unexpected raw pack fetch: ${requestedUrl}`);
    });
    const verifiedResponse = await wrappedFetch(url);
    verifiedResponse.arrayBuffer = () => {
        throw new Error('Response.arrayBuffer must not be called for verified worker bytes');
    };
    const nativeLoader = createStaticAssetByteLoader(async () => verifiedResponse);

    const result = await nativeLoader(url, 1_000, raw.byteLength);

    assert.deepEqual(result, raw);
});

test('verifies compressed System.Runtime documentation under a non-root base path', async () => {
    const raw = new TextEncoder().encode('<doc><member name="T:System.String" /></doc>');
    const compressed = gzipSync(raw);
    const documentationHash = Buffer.from(
        await globalThis.crypto.subtle.digest('SHA-256', raw)
    ).toString('hex');
    const calls = [];
    const wrappedFetch = createVerifiedReferencePackFetch(async (requested, options) => {
        const requestedUrl = requested.toString();
        calls.push({ url: requestedUrl, options });
        if (requestedUrl.endsWith('codecraft-namespace-index.json')) {
            return Response.json({
                documentation: {
                    path: 'System.Runtime.xml',
                    length: raw.byteLength,
                    sha256: documentationHash
                }
            });
        }
        if (requestedUrl.endsWith('System.Runtime.xml.gz')) {
            return new Response(compressed);
        }
        throw new Error(`Unexpected raw documentation fetch: ${requestedUrl}`);
    });

    const url = 'https://static.example/tools/codecraft/omnisharp/System.Runtime.xml';
    const response = await wrappedFetch(url);

    assert.deepEqual(new Uint8Array(await response.arrayBuffer()), raw);
    assert.equal(response.headers.get('content-type'), 'application/xml; charset=utf-8');
    assert.equal(response.headers.get('content-length'), raw.byteLength.toString());
    assert.deepEqual(calls.map(call => call.url), [
        'https://static.example/tools/codecraft/omnisharp/_framework/codecraft-namespace-index.json',
        `${url}.gz`
    ]);
    assert.equal(calls[0].options.signal.aborted, false);
    assert.equal(calls[1].options.signal.aborted, false);
});

test('latches a bad documentation sidecar but keeps validating every raw fallback', async () => {
    const raw = new TextEncoder().encode('correct System.Runtime docs');
    const staleSidecar = new TextEncoder().encode('stale!! System.Runtime docs');
    const staleRaw = raw.slice();
    staleRaw[0] ^= 0x01;
    assert.equal(staleSidecar.byteLength, raw.byteLength);
    const documentationHash = Buffer.from(
        await globalThis.crypto.subtle.digest('SHA-256', raw)
    ).toString('hex');
    const calls = [];
    let rawRequestCount = 0;
    const wrappedFetch = createVerifiedReferencePackFetch(async requested => {
        const requestedUrl = requested.toString();
        calls.push(requestedUrl);
        if (requestedUrl.endsWith('codecraft-namespace-index.json')) {
            return Response.json({
                documentation: {
                    path: 'System.Runtime.xml',
                    length: raw.byteLength,
                    sha256: documentationHash
                }
            });
        }
        if (requestedUrl.endsWith('.gz')) {
            return new Response(gzipSync(staleSidecar));
        }
        rawRequestCount += 1;
        return new Response(rawRequestCount === 1 ? raw : staleRaw);
    });
    const url = 'https://static.example/omnisharp/System.Runtime.xml';

    const first = await wrappedFetch(url);
    assert.deepEqual(new Uint8Array(await first.arrayBuffer()), raw);
    await assert.rejects(
        wrappedFetch(url),
        /System\.Runtime documentation SHA-256 mismatch/
    );
    assert.deepEqual(calls, [
        'https://static.example/omnisharp/_framework/codecraft-namespace-index.json',
        `${url}.gz`,
        url,
        url,
        url
    ]);
});

test('rejects a wrong-length raw documentation fallback after a bad sidecar', async () => {
    const expected = new TextEncoder().encode('expected System.Runtime documentation');
    const truncated = expected.subarray(0, expected.byteLength - 1);
    const documentationHash = Buffer.from(
        await globalThis.crypto.subtle.digest('SHA-256', expected)
    ).toString('hex');
    const calls = [];
    const wrappedFetch = createVerifiedReferencePackFetch(async requested => {
        const requestedUrl = requested.toString();
        calls.push(requestedUrl);
        if (requestedUrl.endsWith('codecraft-namespace-index.json')) {
            return Response.json({
                documentation: {
                    path: 'System.Runtime.xml',
                    length: expected.byteLength,
                    sha256: documentationHash
                }
            });
        }
        return requestedUrl.endsWith('.gz')
            ? new Response(gzipSync(truncated))
            : new Response(truncated);
    });
    const url = 'https://static.example/omnisharp/System.Runtime.xml';

    await assert.rejects(
        wrappedFetch(url),
        /System\.Runtime documentation length mismatch/
    );
    assert.deepEqual(calls, [
        'https://static.example/omnisharp/_framework/codecraft-namespace-index.json',
        `${url}.gz`,
        url,
        url
    ]);
});

test('installs raw documentation verification without gzip APIs', { concurrency: false }, async () => {
    const expected = new TextEncoder().encode('trusted raw System.Runtime docs');
    const corrupt = expected.slice();
    corrupt[0] ^= 0x01;
    const documentationHash = Buffer.from(
        await globalThis.crypto.subtle.digest('SHA-256', expected)
    ).toString('hex');
    const calls = [];
    const marker = Symbol.for('codecraft.reference-pack-fetch-installed');
    const fetchDescriptor = Object.getOwnPropertyDescriptor(globalThis, 'fetch');
    const decompressionDescriptor = Object.getOwnPropertyDescriptor(
        globalThis,
        'DecompressionStream'
    );
    const markerDescriptor = Object.getOwnPropertyDescriptor(globalThis, marker);
    const url = 'https://static.example/omnisharp/System.Runtime.xml';

    try {
        Object.defineProperty(globalThis, 'DecompressionStream', {
            value: undefined,
            writable: true,
            configurable: true
        });
        delete globalThis[marker];
        globalThis.fetch = async requested => {
            const requestedUrl = requested.toString();
            calls.push(requestedUrl);
            if (requestedUrl.endsWith('codecraft-namespace-index.json')) {
                return Response.json({
                    documentation: {
                        path: 'System.Runtime.xml',
                        length: expected.byteLength,
                        sha256: documentationHash
                    }
                });
            }
            return new Response(corrupt);
        };

        assert.equal(installVerifiedReferencePackFetch(), true);
        await assert.rejects(
            globalThis.fetch(url),
            /System\.Runtime documentation SHA-256 mismatch/
        );
        assert.deepEqual(calls, [
            'https://static.example/omnisharp/_framework/codecraft-namespace-index.json',
            url,
            url
        ]);
    } finally {
        if (fetchDescriptor) {
            Object.defineProperty(globalThis, 'fetch', fetchDescriptor);
        } else {
            delete globalThis.fetch;
        }
        if (decompressionDescriptor) {
            Object.defineProperty(globalThis, 'DecompressionStream', decompressionDescriptor);
        } else {
            delete globalThis.DecompressionStream;
        }
        if (markerDescriptor) {
            Object.defineProperty(globalThis, marker, markerDescriptor);
        } else {
            delete globalThis[marker];
        }
    }
});

test('aborts a stalled documentation sidecar before raw fail-open', async () => {
    const raw = new TextEncoder().encode('raw documentation after timeout');
    const documentationHash = Buffer.from(
        await globalThis.crypto.subtle.digest('SHA-256', raw)
    ).toString('hex');
    const calls = [];
    let compressedSignal;
    const wrappedFetch = createVerifiedReferencePackFetch(async (requested, options) => {
        const requestedUrl = requested.toString();
        calls.push(requestedUrl);
        if (requestedUrl.endsWith('codecraft-namespace-index.json')) {
            return Response.json({
                documentation: {
                    path: 'System.Runtime.xml',
                    length: raw.byteLength,
                    sha256: documentationHash
                }
            });
        }
        if (requestedUrl.endsWith('.gz')) {
            compressedSignal = options.signal;
            return new Promise(() => {});
        }
        return new Response(raw);
    }, 5);
    const url = 'https://static.example/omnisharp/System.Runtime.xml';

    const response = await wrappedFetch(url);

    assert.deepEqual(new Uint8Array(await response.arrayBuffer()), raw);
    assert.deepEqual(calls, [
        'https://static.example/omnisharp/_framework/codecraft-namespace-index.json',
        `${url}.gz`,
        url
    ]);
    assert.equal(compressedSignal.aborted, true);
});

test('validates and retries the raw reference pack after a bad sidecar', async () => {
    const raw = new TextEncoder().encode('valid fallback compiler pack');
    const wrongCompressed = gzipSync(new TextEncoder().encode('stale pack'));
    const packHash = Buffer.from(await globalThis.crypto.subtle.digest('SHA-256', raw)).toString('hex');
    const calls = [];
    const wrappedFetch = createVerifiedReferencePackFetch(async url => {
        const requestedUrl = url.toString();
        calls.push(requestedUrl);
        if (requestedUrl.endsWith('codecraft-namespace-index.json')) {
            return Response.json({
                referencePack: {
                    path: 'codecraft-reference-pack.bin',
                    length: raw.byteLength,
                    sha256: packHash
                }
            });
        }
        return requestedUrl.endsWith('.gz')
            ? new Response(wrongCompressed)
            : new Response(raw);
    });
    const url = 'https://static.example/omnisharp/_framework/codecraft-reference-pack.bin';

    const response = await wrappedFetch(url);

    assert.deepEqual(new Uint8Array(await response.arrayBuffer()), raw);
    assert.deepEqual(calls, [
        'https://static.example/omnisharp/_framework/codecraft-namespace-index.json',
        `${url}.gz`,
        url
    ]);
});

test('a stalled compression path fails open to the managed-validated raw pack', async () => {
    const raw = new TextEncoder().encode('raw compiler pack after a stalled sidecar');
    const packHash = Buffer.from(await globalThis.crypto.subtle.digest('SHA-256', raw)).toString('hex');
    const calls = [];
    const url = 'https://static.example/omnisharp/_framework/codecraft-reference-pack.bin';
    const manifestUrl = 'https://static.example/omnisharp/_framework/codecraft-namespace-index.json';
    const wrappedFetch = createVerifiedReferencePackFetch(async requested => {
        const requestedUrl = requested.toString();
        calls.push(requestedUrl);
        if (requestedUrl === manifestUrl) {
            return Response.json({
                referencePack: {
                    path: 'codecraft-reference-pack.bin',
                    length: raw.byteLength,
                    sha256: packHash
                }
            });
        }
        if (requestedUrl.endsWith('.gz')) {
            return new Promise(() => {});
        }
        return new Response(raw);
    }, 5);

    const response = await wrappedFetch(url);

    assert.deepEqual(new Uint8Array(await response.arrayBuffer()), raw);
    assert.deepEqual(calls, [manifestUrl, `${url}.gz`, url]);
});
