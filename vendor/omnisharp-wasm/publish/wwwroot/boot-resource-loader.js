const SHA256_INTEGRITY_PREFIX = 'sha256-';
const MAX_DECOMPRESSED_BOOT_RESOURCE_BYTES = 32 * 1024 * 1024;
const BOOT_RESOURCE_OPTIMIZATION_TIMEOUT_MILLISECONDS = 8_000;
const REFERENCE_PACK_PATH = 'codecraft-reference-pack.bin';
const DOCUMENTATION_PATH = 'System.Runtime.xml';
const MAX_DOCUMENTATION_BYTES = 8 * 1024 * 1024;
const REFERENCE_PACK_OPTIMIZATION_TIMEOUT_MILLISECONDS = 8_000;
const REFERENCE_PACK_FETCH_INSTALLATION = Symbol.for('codecraft.reference-pack-fetch-installed');
const STATIC_ASSET_BYTE_LOADER_INSTALLATION = Symbol.for('codecraft.static-asset-byte-loader-installed');
const VERIFIED_STATIC_ASSET_BYTES = Symbol.for('codecraft.verified-static-asset-bytes');

/**
 * Produces a real browser task boundary without using timers. Hidden iframes clamp
 * setTimeout/Task.Delay aggressively (often to one second), which can turn hundreds
 * of cooperative metadata checkpoints into minutes. scheduler.yield is ideal when
 * available; MessageChannel is the broadly supported, unclamped worker fallback.
 */
export function createBrowserTaskYield(scope = globalThis) {
    if (typeof scope.scheduler?.yield === 'function') {
        return () => scope.scheduler.yield();
    }

    if (typeof scope.MessageChannel === 'function') {
        const channel = new scope.MessageChannel();
        const pending = [];
        channel.port1.onmessage = () => {
            const resolve = pending.shift();
            resolve?.();
        };
        channel.port1.start?.();
        return () => new Promise(resolve => {
            pending.push(resolve);
            channel.port2.postMessage(0);
        });
    }

    // Old engines without either task primitive retain correctness. They lose
    // preemption, but never inherit the catastrophic hidden-timer clamp.
    return () => Promise.resolve();
}

function canLoadVerifiedGzip() {
    return typeof globalThis.DecompressionStream === 'function'
        && typeof globalThis.TransformStream === 'function'
        && canVerifySha256()
        && typeof globalThis.btoa === 'function';
}

function canVerifySha256() {
    return typeof globalThis.crypto?.subtle?.digest === 'function';
}

function contentTypeFor(type) {
    return type === 'dotnetwasm' ? 'application/wasm' : 'application/octet-stream';
}

function rawFetchOptions(integrity, signal) {
    const options = {
        cache: 'no-cache',
        credentials: 'same-origin'
    };
    if (typeof integrity === 'string' && integrity.length > 0) {
        options.integrity = integrity;
    }
    if (signal) {
        options.signal = signal;
    }
    return options;
}

async function hasExpectedSha256(buffer, integrity) {
    const digest = new Uint8Array(await globalThis.crypto.subtle.digest('SHA-256', buffer));
    let binaryDigest = '';
    for (const value of digest) {
        binaryDigest += String.fromCharCode(value);
    }
    return globalThis.btoa(binaryDigest) === integrity.slice(SHA256_INTEGRITY_PREFIX.length);
}

async function hasExpectedSha256Hex(buffer, expectedHash) {
    const digest = new Uint8Array(await globalThis.crypto.subtle.digest('SHA-256', buffer));
    let actualHash = '';
    for (const value of digest) {
        actualHash += value.toString(16).padStart(2, '0');
    }
    return actualHash === expectedHash;
}

async function decompressWithLimit(
    response,
    maximumLength = MAX_DECOMPRESSED_BOOT_RESOURCE_BYTES
) {
    if (!response.body) {
        throw new Error('The compressed response has no readable body.');
    }
    validatedMaximumLength(maximumLength);

    let decompressedBytes = 0;
    const limit = new TransformStream({
        transform(chunk, controller) {
            decompressedBytes += chunk.byteLength;
            if (decompressedBytes > maximumLength) {
                throw new Error('The decompressed boot resource exceeds the safety limit.');
            }
            controller.enqueue(chunk);
        }
    });
    // Fetch transparently decodes HTTP Content-Encoding. Literal static hosts return
    // `.gz` bytes unchanged, while helpers such as Vite may attach `Content-Encoding:
    // gzip` even for the sidecar URL. Avoid trying to decompress the already-decoded body.
    const contentEncoding = response.headers.get('content-encoding') ?? '';
    const responseStream = /(^|,)\s*gzip\s*(,|$)/i.test(contentEncoding)
        ? response.body
        : response.body.pipeThrough(new DecompressionStream('gzip'));
    const decompressedStream = responseStream.pipeThrough(limit);
    return new Response(decompressedStream).arrayBuffer();
}

/**
 * Uses publish-time gzip sidecars on hosts that only serve literal static files.
 * Every decoded asset is checked against Blazor's original SHA-256 integrity value.
 * A failed sidecar is latched per URL and falls back to the normal raw asset, so this
 * optimization can never be required for correctness or browser compatibility.
 */
export function createVerifiedGzipBootResourceLoader(
    fetchImplementation = globalThis.fetch.bind(globalThis),
    optimizationTimeoutMilliseconds = BOOT_RESOURCE_OPTIMIZATION_TIMEOUT_MILLISECONDS
) {
    if (!canLoadVerifiedGzip()) {
        return () => undefined;
    }

    const failedCompressedUrls = new Set();
    const fetchRaw = (defaultUri, integrity) => fetchImplementation(
        defaultUri,
        rawFetchOptions(integrity)
    );

    return function loadBootResource(type, name, defaultUri, integrity) {
        // JavaScript modules must be returned as URLs. Configuration/manifest responses
        // don't carry a content hash, so leave all three to Blazor's default loader.
        if (
            type === 'dotnetjs'
            || type === 'configuration'
            || type === 'manifest'
            || typeof defaultUri !== 'string'
            || typeof integrity !== 'string'
            || !integrity.startsWith(SHA256_INTEGRITY_PREFIX)
        ) {
            return undefined;
        }

        if (failedCompressedUrls.has(defaultUri)) {
            return fetchRaw(defaultUri, integrity);
        }

        return (async () => {
            const controller = typeof AbortController === 'function'
                ? new AbortController()
                : undefined;
            try {
                return await withTimeout((async () => {
                    const compressedResponse = await fetchImplementation(`${defaultUri}.gz`, {
                        cache: 'no-cache',
                        credentials: 'same-origin',
                        ...(controller ? { signal: controller.signal } : {})
                    });
                    if (!compressedResponse.ok) {
                        throw new Error(`HTTP ${compressedResponse.status}`);
                    }

                    const decompressed = await decompressWithLimit(compressedResponse);
                    if (!await hasExpectedSha256(decompressed, integrity)) {
                        throw new Error('SHA-256 integrity mismatch');
                    }

                    return new Response(decompressed, {
                        headers: { 'content-type': contentTypeFor(type) }
                    });
                })(),
                optimizationTimeoutMilliseconds,
                `Compressed boot-resource optimization timed out after ${optimizationTimeoutMilliseconds} ms.`,
                () => controller?.abort());
            } catch (error) {
                failedCompressedUrls.add(defaultUri);
                console.warn(
                    `Could not use the compressed Blazor boot resource '${name}'. Falling back to the verified raw asset.`,
                    error
                );
                return fetchRaw(defaultUri, integrity);
            }
        })();
    };
}

function requestUrl(input) {
    if (typeof input === 'string' || input instanceof URL) {
        return input.toString();
    }
    return typeof input?.url === 'string' ? input.url : '';
}

function requestMethod(input, init) {
    const method = init?.method ?? (typeof input === 'object' ? input?.method : undefined) ?? 'GET';
    return method.toUpperCase();
}

function validatedReferencePackManifest(document) {
    const pack = document?.referencePack;
    if (
        pack?.path !== REFERENCE_PACK_PATH
        || !Number.isSafeInteger(pack.length)
        || pack.length <= 0
        || pack.length > MAX_DECOMPRESSED_BOOT_RESOURCE_BYTES
        || typeof pack.sha256 !== 'string'
        || !/^[0-9a-f]{64}$/.test(pack.sha256)
    ) {
        throw new Error('The reference-pack manifest is invalid.');
    }
    return pack;
}

function validatedDocumentationManifest(document) {
    const documentation = document?.documentation;
    if (
        documentation?.path !== DOCUMENTATION_PATH
        || !Number.isSafeInteger(documentation.length)
        || documentation.length <= 0
        || documentation.length > MAX_DOCUMENTATION_BYTES
        || typeof documentation.sha256 !== 'string'
        || !/^[0-9a-f]{64}$/.test(documentation.sha256)
    ) {
        throw new Error('The documentation manifest is invalid.');
    }
    return documentation;
}

function withTimeout(promise, timeoutMilliseconds, message, onTimeout) {
    let timeout;
    return Promise.race([
        promise,
        new Promise((_, reject) => {
            timeout = setTimeout(() => {
                try {
                    onTimeout?.();
                } finally {
                    reject(new Error(message));
                }
            }, timeoutMilliseconds);
        })
    ]).finally(() => clearTimeout(timeout));
}

function validatedMaximumLength(maximumLength) {
    if (
        !Number.isSafeInteger(maximumLength)
        || maximumLength <= 0
        || maximumLength > MAX_DECOMPRESSED_BOOT_RESOURCE_BYTES
    ) {
        throw new Error('Static asset maximum length is invalid.');
    }
    return maximumLength;
}

async function readResponseBytesWithLimit(response, maximumLength) {
    const verifiedBytes = response?.[VERIFIED_STATIC_ASSET_BYTES];
    if (verifiedBytes !== undefined) {
        if (!(verifiedBytes instanceof Uint8Array) || verifiedBytes.byteLength > maximumLength) {
            throw new Error('Verified static asset bytes are outside the safety limit.');
        }
        // Both wrappers run in the same worker. Reuse the exact verified view instead of
        // copying it through Response.arrayBuffer() before the managed Span copy.
        return verifiedBytes;
    }

    const declaredLength = response.headers.get('content-length');
    if (declaredLength !== null && declaredLength !== '') {
        const parsedLength = Number(declaredLength);
        if (!Number.isSafeInteger(parsedLength) || parsedLength < 0 || parsedLength > maximumLength) {
            throw new Error('Static asset Content-Length exceeds its safety limit.');
        }

        const bytes = new Uint8Array(await response.arrayBuffer());
        if (bytes.byteLength > maximumLength) {
            throw new Error('Static asset exceeds its safety limit.');
        }
        return bytes;
    }

    if (!response.body || typeof response.body.getReader !== 'function') {
        const bytes = new Uint8Array(await response.arrayBuffer());
        if (bytes.byteLength > maximumLength) {
            throw new Error('Static asset exceeds its safety limit.');
        }
        return bytes;
    }

    const reader = response.body.getReader();
    const chunks = [];
    let totalLength = 0;
    try {
        while (true) {
            const { done, value } = await reader.read();
            if (done) break;
            const chunk = value instanceof Uint8Array ? value : new Uint8Array(value);
            totalLength += chunk.byteLength;
            if (totalLength > maximumLength) {
                await reader.cancel('Static asset exceeds its safety limit.');
                throw new Error('Static asset exceeds its safety limit.');
            }
            chunks.push(chunk);
        }
    } finally {
        reader.releaseLock();
    }

    const bytes = new Uint8Array(totalLength);
    let offset = 0;
    for (const chunk of chunks) {
        bytes.set(chunk, offset);
        offset += chunk.byteLength;
    }
    return bytes;
}

function reportStaticAssetPhase(phase) {
    try {
        if (typeof globalThis.postMessage === 'function') {
            globalThis.postMessage({
                isJsDirect: true,
                jsData: { codecraftStaticAssetPhase: phase }
            });
        }
    } catch {
        // Advisory progress must never affect static asset loading.
    }
}

/**
 * Buffers an immutable static response entirely in the worker. .NET receives the
 * Uint8Array as a JSObject and copies it straight into a preallocated managed Span;
 * Task<byte[]> isn't a supported source-generated interop shape in .NET 8.
 */
export function createStaticAssetByteLoader(fetchImplementation = globalThis.fetch.bind(globalThis)) {
    return async function loadStaticAssetBytes(
        url,
        timeoutMilliseconds,
        maximumLength = MAX_DECOMPRESSED_BOOT_RESOURCE_BYTES
    ) {
        const boundedTimeout = Number.isSafeInteger(timeoutMilliseconds)
            ? Math.min(Math.max(timeoutMilliseconds, 1_000), 120_000)
            : 30_000;
        const boundedMaximumLength = validatedMaximumLength(maximumLength);
        const controller = typeof AbortController === 'function'
            ? new AbortController()
            : undefined;
        reportStaticAssetPhase('fetch-started');
        const operation = (async () => {
            const response = await fetchImplementation(url, {
                cache: 'no-cache',
                credentials: 'same-origin',
                ...(controller ? { signal: controller.signal } : {})
            });
            if (!response.ok) {
                throw new Error(`Static asset returned HTTP ${response.status}.`);
            }

            reportStaticAssetPhase('response-received');
            const result = await readResponseBytesWithLimit(response, boundedMaximumLength);
            reportStaticAssetPhase('bytes-buffered');
            return result;
        })();

        try {
            const result = await withTimeout(
                operation,
                boundedTimeout,
                `Static asset transfer timed out after ${boundedTimeout} ms.`,
                () => controller?.abort()
            );
            return result;
        } catch (error) {
            reportStaticAssetPhase('failed');
            throw error;
        }
    };
}

export function installStaticAssetByteLoader() {
    if (globalThis[STATIC_ASSET_BYTE_LOADER_INSTALLATION]) {
        return true;
    }
    if (typeof globalThis.fetch !== 'function') {
        return false;
    }

    globalThis.codecraftLoadStaticAsset = createStaticAssetByteLoader(
        globalThis.fetch.bind(globalThis)
    );
    globalThis.codecraftCopyStaticAssetBytes = (source, destination) => {
        if (
            !(source instanceof Uint8Array)
            || source.length !== destination.length
        ) {
            throw new Error('Static asset byte-copy source is invalid.');
        }
        destination.set(source);
    };
    const yieldBrowserTask = createBrowserTaskYield(globalThis);
    // Return an explicit primitive so .NET 8's source-generated Promise marshaller
    // never has to represent JavaScript `undefined` as Task completion data.
    globalThis.codecraftYieldToBrowser = async () => {
        await yieldBrowserTask();
        return true;
    };
    globalThis.codecraftReportStaticAssetPhase = reportStaticAssetPhase;
    globalThis[STATIC_ASSET_BYTE_LOADER_INSTALLATION] = true;
    reportStaticAssetPhase('loader-installed');
    return true;
}

/**
 * Wraps worker fetch so immutable compiler assets are transferred through verified
 * gzip sidecars even though managed HttpClient remains unaware of compression. The
 * reference pack and System.Runtime documentation share the publish-time namespace
 * manifest, while every optimized response is checked against its exact raw length
 * and SHA-256 before it can reach managed code.
 */
export function createVerifiedReferencePackFetch(
    fetchImplementation,
    optimizationTimeoutMilliseconds = REFERENCE_PACK_OPTIMIZATION_TIMEOUT_MILLISECONDS
) {
    if (!canVerifySha256()) {
        return fetchImplementation;
    }

    const canUseCompressedAssets = canLoadVerifiedGzip();

    let compressedAssetFailed = false;
    let manifestDocumentPromise;
    let packPromise;
    let packAbortController;
    let activePackConsumers = 0;
    let documentationCompressedAssetFailed = false;
    let documentationPromise;
    let documentationAbortController;
    let activeDocumentationConsumers = 0;

    const validateManifestDocument = document => {
        if (!document || typeof document !== 'object') {
            throw new Error('The compiler-asset manifest is invalid.');
        }
        return document;
    };

    const publishManifestDocument = promise => {
        let publishedPromise;
        publishedPromise = Promise.resolve(promise)
            .then(validateManifestDocument)
            .catch(error => {
                if (manifestDocumentPromise === publishedPromise) {
                    manifestDocumentPromise = undefined;
                }
                throw error;
            });
        manifestDocumentPromise = publishedPromise;
        // The direct managed manifest consumer may fail before requesting either sidecar.
        // Mark the cached rejection observed while preserving it for any later verifier.
        publishedPromise.catch(() => {});
        return publishedPromise;
    };

    const loadManifestDocument = (manifestUrl, signal) => {
        if (!manifestDocumentPromise) {
            publishManifestDocument((async () => {
                // Tewr's worker fetch proxy intentionally accepts URL strings (it rewrites
                // the worker blob base to the static app root) rather than URL objects.
                const response = await fetchImplementation(manifestUrl.href, {
                    cache: 'no-cache',
                    credentials: 'same-origin',
                    ...(signal ? { signal } : {})
                });
                if (!response.ok) {
                    throw new Error(`Compiler-asset manifest returned HTTP ${response.status}.`);
                }
                return response.json();
            })());
        }
        return manifestDocumentPromise;
    };

    const validateBytes = async (bytes, manifest, assetName) => {
        const view = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
        if (view.byteLength !== manifest.length) {
            throw new Error(`${assetName} length mismatch.`);
        }
        if (!await hasExpectedSha256Hex(view, manifest.sha256)) {
            throw new Error(`${assetName} SHA-256 mismatch.`);
        }
        return view;
    };

    const loadPack = (input, init, packUrl) => {
        if (!packPromise) {
            packAbortController = typeof AbortController === 'function'
                ? new AbortController()
                : undefined;
            packPromise = (async () => {
                const signal = packAbortController?.signal;
                const manifestUrl = new URL('codecraft-namespace-index.json', packUrl);
                const manifest = validatedReferencePackManifest(
                    await loadManifestDocument(manifestUrl, signal));
                if (canUseCompressedAssets && !compressedAssetFailed) {
                    try {
                        const compressedResponse = await fetchImplementation(`${packUrl}.gz`, {
                            cache: 'no-cache',
                            credentials: 'same-origin',
                            ...(signal ? { signal } : {})
                        });
                        if (!compressedResponse.ok) {
                            throw new Error(`HTTP ${compressedResponse.status}`);
                        }
                        return await validateBytes(
                            await decompressWithLimit(compressedResponse, manifest.length),
                            manifest,
                            'Reference pack'
                        );
                    } catch (error) {
                        compressedAssetFailed = true;
                        console.warn(
                            'Could not use the compressed compiler reference pack. Falling back to the raw asset.',
                            error
                        );
                    }
                }

                const rawResponse = await fetchImplementation(input, {
                    ...init,
                    ...(signal ? { signal } : {})
                });
                if (!rawResponse.ok) {
                    throw new Error(`Reference pack returned HTTP ${rawResponse.status}.`);
                }
                return validateBytes(
                    await readResponseBytesWithLimit(rawResponse, manifest.length),
                    manifest,
                    'Reference pack');
            })().catch(error => {
                // A transient raw/manifest failure must remain retryable. Only a failed
                // compressed sidecar is latched because retrying it cannot improve safety.
                packPromise = undefined;
                throw error;
            });
        }
        return packPromise;
    };

    const loadDocumentation = (input, init, documentationUrl) => {
        if (!documentationPromise) {
            documentationAbortController = typeof AbortController === 'function'
                ? new AbortController()
                : undefined;
            documentationPromise = (async () => {
                const signal = documentationAbortController?.signal;
                // System.Runtime.xml lives at the static application root. Resolving the
                // manifest from the requested URL (rather than `/`) preserves arbitrary
                // deployment prefixes such as `/tools/codecraft/`.
                const manifestUrl = new URL('_framework/codecraft-namespace-index.json', documentationUrl);
                const manifest = validatedDocumentationManifest(
                    await loadManifestDocument(manifestUrl, signal));
                if (canUseCompressedAssets && !documentationCompressedAssetFailed) {
                    try {
                        const compressedResponse = await fetchImplementation(`${documentationUrl}.gz`, {
                            cache: 'no-cache',
                            credentials: 'same-origin',
                            ...(signal ? { signal } : {})
                        });
                        if (!compressedResponse.ok) {
                            throw new Error(`HTTP ${compressedResponse.status}`);
                        }

                        return await validateBytes(
                            await decompressWithLimit(compressedResponse, manifest.length),
                            manifest,
                            'System.Runtime documentation');
                    } catch (error) {
                        documentationCompressedAssetFailed = true;
                        console.warn(
                            'Could not use compressed System.Runtime documentation. Falling back to the verified raw asset.',
                            error
                        );
                    }
                }

                const rawResponse = await fetchImplementation(input, {
                    ...init,
                    ...(signal ? { signal } : {})
                });
                if (!rawResponse.ok) {
                    throw new Error(`System.Runtime documentation returned HTTP ${rawResponse.status}.`);
                }
                return validateBytes(
                    await readResponseBytesWithLimit(rawResponse, manifest.length),
                    manifest,
                    'System.Runtime documentation');
            })().catch(error => {
                documentationPromise = undefined;
                throw error;
            });
        }
        return documentationPromise;
    };

    return async function verifiedReferencePackFetch(input, init) {
        const url = requestUrl(input);
        let parsedUrl;
        try {
            parsedUrl = new URL(url);
        } catch {
            return fetchImplementation(input, init);
        }
        if (requestMethod(input, init) !== 'GET') {
            return fetchImplementation(input, init);
        }

        const isManifest = parsedUrl.pathname.endsWith(
            '/_framework/codecraft-namespace-index.json');
        if (isManifest) {
            const response = await fetchImplementation(input, init);
            if (response.ok && typeof response.clone === 'function') {
                // Managed startup needs the exact same immutable document that validates
                // the pack and XML sidecars. Parse a clone while returning the original
                // response so all three consumers share one no-cache network request.
                publishManifestDocument(response.clone().json());
            }
            return response;
        }

        const isReferencePack = parsedUrl.pathname.endsWith(`/_framework/${REFERENCE_PACK_PATH}`);
        const isDocumentation = parsedUrl.pathname.endsWith(`/${DOCUMENTATION_PATH}`);
        if (!isReferencePack && !isDocumentation) {
            return fetchImplementation(input, init);
        }

        if (isDocumentation) {
            activeDocumentationConsumers += 1;
            try {
                let bytes;
                try {
                    bytes = await withTimeout(
                        loadDocumentation(input, init, parsedUrl.href),
                        optimizationTimeoutMilliseconds,
                        'Verified documentation loading timed out.',
                        () => documentationAbortController?.abort()
                    );
                } catch (firstError) {
                    // An aborted sidecar attempt leaves its signal unusable. Retry the raw,
                    // manifest-verified path once with a fresh bounded controller. This also
                    // recovers a transient manifest/raw fetch without ever accepting bytes
                    // that failed the published length or SHA-256 contract.
                    documentationCompressedAssetFailed = true;
                    documentationPromise = undefined;
                    documentationAbortController = undefined;
                    console.warn(
                        'Retrying verified raw System.Runtime documentation after a failed optimized load.',
                        firstError
                    );
                    bytes = await withTimeout(
                        loadDocumentation(input, init, parsedUrl.href),
                        optimizationTimeoutMilliseconds,
                        'Verified raw documentation loading timed out.',
                        () => documentationAbortController?.abort()
                    );
                }
                const response = new Response(bytes, {
                    headers: {
                        'content-type': 'application/xml; charset=utf-8',
                        'content-length': bytes.byteLength.toString()
                    }
                });
                Object.defineProperty(response, VERIFIED_STATIC_ASSET_BYTES, { value: bytes });
                return response;
            } catch (error) {
                // Documentation is optional. Correct raw bytes already pass above; bytes
                // that cannot be matched to the publish manifest must not influence hover
                // or completion documentation. Managed code repeats this verification as
                // the compatibility backstop when Web Crypto is unavailable.
                documentationPromise = undefined;
                console.warn(
                    'Could not load verified System.Runtime documentation.',
                    error
                );
                throw error;
            } finally {
                activeDocumentationConsumers -= 1;
                if (activeDocumentationConsumers === 0) {
                    documentationPromise = undefined;
                    documentationAbortController = undefined;
                }
            }
        }

        activePackConsumers += 1;
        try {
            const bytes = await withTimeout(
                loadPack(input, init, parsedUrl.href),
                optimizationTimeoutMilliseconds,
                'Compressed reference-pack optimization timed out.',
                () => packAbortController?.abort()
            );
            const response = new Response(bytes, {
                headers: {
                    'content-type': 'application/octet-stream',
                    'content-length': bytes.byteLength.toString()
                }
            });
            Object.defineProperty(response, VERIFIED_STATIC_ASSET_BYTES, { value: bytes });
            return response;
        } catch (error) {
            // Compression is an optional transfer optimization. Never let it become a
            // startup dependency: the managed loader still validates the raw pack's
            // exact length, full SHA-256, per-slice hashes, and PE identities.
            compressedAssetFailed = true;
            packPromise = undefined;
            console.warn('Bypassing compressed compiler reference-pack loading.', error);
            return fetchImplementation(input, init);
        } finally {
            activePackConsumers -= 1;
            if (activePackConsumers === 0) {
                // Managed code owns the validated bytes after this response is consumed.
                // Retaining a second 3.8 MiB JavaScript copy for the session only adds GC pressure.
                packPromise = undefined;
                packAbortController = undefined;
            }
        }
    };
}

export function installVerifiedReferencePackFetch() {
    if (globalThis[REFERENCE_PACK_FETCH_INSTALLATION]) {
        return true;
    }
    if (!canVerifySha256() || typeof globalThis.fetch !== 'function') {
        return false;
    }

    const originalFetch = globalThis.fetch.bind(globalThis);
    globalThis.fetch = createVerifiedReferencePackFetch(originalFetch);
    globalThis[REFERENCE_PACK_FETCH_INSTALLATION] = true;
    return true;
}
