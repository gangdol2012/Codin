/* eslint-disable no-restricted-globals */

if (typeof window === 'undefined') {
  self.addEventListener('install', () => {
    self.skipWaiting();
  });

  self.addEventListener('activate', event => {
    event.waitUntil(self.clients.claim());
  });

  self.addEventListener('message', event => {
    if (event.data?.type !== 'deregister') {
      return;
    }

    event.waitUntil((async () => {
      await self.registration.unregister();
      const clients = await self.clients.matchAll();
      await Promise.all(clients.map(client => client.navigate(client.url)));
    })());
  });

  self.addEventListener('fetch', event => {
    const { request } = event;
    const url = new URL(request.url);

    if (request.cache === 'only-if-cached' && request.mode !== 'same-origin') {
      return;
    }

    if (url.protocol !== 'http:' && url.protocol !== 'https:') {
      return;
    }

    if (url.origin !== self.location.origin) {
      return;
    }

    event.respondWith((async () => {
      const response = await fetch(request).catch(() => new Response('', {
        status: 502,
        statusText: 'Bad Gateway',
      }));

      if (response.status === 0) {
        return response;
      }

      const headers = new Headers(response.headers);
      headers.set('Cross-Origin-Embedder-Policy', 'credentialless');
      headers.set('Cross-Origin-Opener-Policy', 'same-origin');
      headers.set('Cross-Origin-Resource-Policy', 'cross-origin');

      return new Response(response.body, {
        status: response.status,
        statusText: response.statusText,
        headers,
      });
    })());
  });
} else if ('serviceWorker' in navigator) {
  // Resolve from the script that was actually loaded, rather than the origin root.
  // This keeps both the registration URL and its scope inside arbitrary static
  // deployment prefixes such as /tools/codecraft/.
  const loadedScriptUrl = document.currentScript?.src;
  const serviceWorkerUrl = new URL(
    loadedScriptUrl || './coi-serviceworker.js',
    document.baseURI
  );
  const serviceWorkerScope = new URL('./', serviceWorkerUrl);
  const reloadGuardKey = `coiReloadedBySelfAt:${serviceWorkerScope.pathname}`;

  if (window.crossOriginIsolated) {
    try {
      localStorage.removeItem(reloadGuardKey);
      localStorage.removeItem('coiReloadedBySelfAt');
    } catch { }
  } else {
    const reloadCooldownMs = 15_000;

    navigator.serviceWorker.register(serviceWorkerUrl.href, {
      scope: serviceWorkerScope.href,
      updateViaCache: 'none',
    }).then(registration => {
      const clearReloadGuard = () => {
        try {
          localStorage.removeItem(reloadGuardKey);
        } catch { }
      };

      const hasRecentReloadAttempt = () => {
        try {
          const raw = localStorage.getItem(reloadGuardKey);
          const timestamp = raw ? Number(raw) : 0;
          return Number.isFinite(timestamp) && timestamp > 0 && Date.now() - timestamp < reloadCooldownMs;
        } catch {
          return false;
        }
      };

      const reloadOnce = () => {
        if (hasRecentReloadAttempt()) {
          return;
        }

        try {
          localStorage.setItem(reloadGuardKey, String(Date.now()));
        } catch { }
        window.location.reload();
      };

      navigator.serviceWorker.addEventListener('controllerchange', clearReloadGuard, { once: true });

      if (window.crossOriginIsolated) {
        clearReloadGuard();
        return;
      }

      if (registration.active || navigator.serviceWorker.controller) {
        reloadOnce();
        return;
      }

      if (registration.installing) {
        registration.installing.addEventListener('statechange', event => {
          const worker = event.target;
          if (worker && 'state' in worker && worker.state === 'activated') {
            reloadOnce();
          }
        });
      }
    }).catch(error => {
      console.warn('Failed to register COI service worker:', error);
    });
  }
}
