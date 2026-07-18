import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import fs from 'node:fs';
import https from 'node:https';
import path from 'path';
import { defineConfig } from 'vite';

const mavenProxyPrefix = '/__codecraft_maven/';
const mavenBaseUrl = 'https://repo.maven.apache.org/maven2/';
const packageJson = JSON.parse(fs.readFileSync(new URL('./package.json', import.meta.url), 'utf8')) as { version?: unknown };
const appVersion = typeof packageJson.version === 'string' ? packageJson.version : '0.0.0';

function codecraftMavenProxy() {
  function middleware(req: any, res: any, next: () => void) {
    const pathname = new URL(req.url || '/', 'http://localhost').pathname;
    if (!pathname.startsWith(mavenProxyPrefix)) {
      next();
      return;
    }

    const artifactPath = decodeURIComponent(pathname.slice(mavenProxyPrefix.length));
    if (!artifactPath || artifactPath.includes('..') || !artifactPath.endsWith('.jar')) {
      res.statusCode = 400;
      res.end('Invalid Maven artifact path.');
      return;
    }

    const upstreamUrl = new URL(artifactPath, mavenBaseUrl);
    https.get(upstreamUrl, upstream => {
      if (upstream.statusCode !== 200) {
        res.statusCode = upstream.statusCode || 502;
        upstream.resume();
        res.end(`Failed to fetch ${artifactPath}.`);
        return;
      }

      res.statusCode = 200;
      res.setHeader('Content-Type', 'application/java-archive');
      res.setHeader('Cache-Control', 'public, max-age=86400');
      upstream.pipe(res);
    }).on('error', error => {
      res.statusCode = 502;
      res.end(error instanceof Error ? error.message : String(error));
    });
  }

  return {
    name: 'codecraft-maven-proxy',
    configureServer(server: any) {
      server.middlewares.use(middleware);
    },
    configurePreviewServer(server: any) {
      server.middlewares.use(middleware);
    },
  };
}

export default defineConfig(() => {
  return {
    // Every production URL must remain relative to the directory containing index.html.
    // CodeCraft is deployed as a complete static tree and may live at any HTTPS subpath.
    base: './',
    plugins: [codecraftMavenProxy(), react(), tailwindcss()],
    define: {
      __APP_VERSION__: JSON.stringify(appVersion),
    },
    resolve: {
      alias: {
        '@': path.resolve(__dirname, '.'),
      },
    },
    optimizeDeps: {
      exclude: ['monaco-pyright-lsp'],
    },
    server: {
      port: 3000,
      host: '0.0.0.0',
      hmr: process.env.DISABLE_HMR !== 'true',
      headers: {
        'Cross-Origin-Opener-Policy': 'same-origin',
        'Cross-Origin-Embedder-Policy': 'credentialless',
      },
    },
    preview: {
      port: 8080,
      host: '0.0.0.0',
      headers: {
        'Cross-Origin-Opener-Policy': 'same-origin',
        'Cross-Origin-Embedder-Policy': 'credentialless',
      },
    },
  };
});
