import * as monaco from 'monaco-editor';
import { loader } from '@monaco-editor/react';
import editorWorkerUrl from 'monaco-editor/esm/vs/editor/editor.worker?worker&url';
import jsonWorkerUrl from 'monaco-editor/esm/vs/language/json/json.worker?worker&url';
import cssWorkerUrl from 'monaco-editor/esm/vs/language/css/css.worker?worker&url';
import htmlWorkerUrl from 'monaco-editor/esm/vs/language/html/html.worker?worker&url';
import tsWorkerUrl from 'monaco-editor/esm/vs/language/typescript/ts.worker?worker&url';
import { ensureJavaScriptColoringReady, ensurePythonColoringReady } from './python-coloring';

function createMonacoWorker(workerUrl: string, label: string) {
  const url = new URL(workerUrl, import.meta.url);
  if (__APP_BUILD_ID__) {
    url.searchParams.set('v', __APP_BUILD_ID__);
  }
  return new Worker(url, { name: label });
}

self.MonacoEnvironment = {
  getWorker(_: string, label: string) {
    if (label === 'json') return createMonacoWorker(jsonWorkerUrl, label);
    if (label === 'css' || label === 'scss' || label === 'less') return createMonacoWorker(cssWorkerUrl, label);
    if (label === 'html' || label === 'handlebars' || label === 'razor') return createMonacoWorker(htmlWorkerUrl, label);
    if (label === 'typescript' || label === 'javascript') return createMonacoWorker(tsWorkerUrl, label);
    return createMonacoWorker(editorWorkerUrl, label);
  }
};

loader.config({ monaco });
ensurePythonColoringReady();
ensureJavaScriptColoringReady();
