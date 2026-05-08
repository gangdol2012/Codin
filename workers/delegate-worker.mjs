const hopByHopHeaders = new Set([
  'connection',
  'keep-alive',
  'proxy-authenticate',
  'proxy-authorization',
  'te',
  'trailer',
  'transfer-encoding',
  'upgrade',
]);

const browserManagedRequestHeaders = new Set([
  'accept-encoding',
  'content-length',
  'host',
  'origin',
  'referer',
]);

function buildCorsHeaders(request) {
  const headers = new Headers();
  headers.set('Access-Control-Allow-Origin', request.headers.get('Origin') || '*');
  headers.set('Access-Control-Allow-Methods', 'GET,POST,PUT,PATCH,DELETE,HEAD,OPTIONS');
  headers.set('Access-Control-Allow-Headers', request.headers.get('Access-Control-Request-Headers') || '*');
  headers.set('Access-Control-Expose-Headers', '*');
  headers.set('Access-Control-Max-Age', '7200');
  headers.set('Vary', 'Origin');
  return headers;
}

function stripRequestHeaders(headers) {
  const nextHeaders = new Headers(headers);
  for (const name of [...nextHeaders.keys()]) {
    const normalized = name.toLowerCase();
    if (
      hopByHopHeaders.has(normalized)
      || browserManagedRequestHeaders.has(normalized)
      || normalized.startsWith('access-control-request-')
      || normalized.startsWith('sec-fetch-')
    ) {
      nextHeaders.delete(name);
    }
  }
  return nextHeaders;
}

function stripResponseHeaders(headers) {
  const nextHeaders = new Headers(headers);
  for (const name of [...nextHeaders.keys()]) {
    const normalized = name.toLowerCase();
    if (
      hopByHopHeaders.has(normalized)
      || normalized.startsWith('access-control-')
    ) {
      nextHeaders.delete(name);
    }
  }
  return nextHeaders;
}

function getTargetUrl(request) {
  const requestUrl = new URL(request.url);
  if (requestUrl.pathname !== '/delegate') return null;

  const rawTargetUrl = requestUrl.searchParams.get('url');
  if (!rawTargetUrl) return null;

  try {
    const targetUrl = new URL(rawTargetUrl);
    if (targetUrl.protocol !== 'http:' && targetUrl.protocol !== 'https:') return null;
    return targetUrl;
  } catch {
    return null;
  }
}

function textResponse(request, status, body) {
  const headers = buildCorsHeaders(request);
  headers.set('content-type', 'text/plain; charset=utf-8');
  return new Response(body, { status, headers });
}

export default {
  async fetch(request) {
    if (request.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: buildCorsHeaders(request) });
    }

    const targetUrl = getTargetUrl(request);
    if (!targetUrl) {
      return textResponse(request, 404, 'Use /delegate?url=<absolute http or https URL>.');
    }

    const method = request.method || 'GET';
    const hasRequestBody = method !== 'GET' && method !== 'HEAD';

    try {
      const upstream = await fetch(targetUrl.toString(), {
        method,
        headers: stripRequestHeaders(request.headers),
        body: hasRequestBody ? request.body : undefined,
        redirect: 'manual',
      });

      const responseHeaders = stripResponseHeaders(upstream.headers);
      for (const [name, value] of buildCorsHeaders(request)) {
        responseHeaders.set(name, value);
      }

      return new Response(upstream.body, {
        status: upstream.status,
        statusText: upstream.statusText,
        headers: responseHeaders,
      });
    } catch (error) {
      return textResponse(
        request,
        502,
        error instanceof Error ? error.message : String(error)
      );
    }
  },
};
