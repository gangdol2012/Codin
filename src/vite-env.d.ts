/// <reference types="vite/client" />

declare const __APP_VERSION__: string;
declare const __APP_BUILD_ID__: string;

declare module 'monaco-editor/esm/vs/editor/editor.worker?worker&url' {
  const workerUrl: string;
  export default workerUrl;
}

declare module 'monaco-editor/esm/vs/language/json/json.worker?worker&url' {
  const workerUrl: string;
  export default workerUrl;
}

declare module 'monaco-editor/esm/vs/language/css/css.worker?worker&url' {
  const workerUrl: string;
  export default workerUrl;
}

declare module 'monaco-editor/esm/vs/language/html/html.worker?worker&url' {
  const workerUrl: string;
  export default workerUrl;
}

declare module 'monaco-editor/esm/vs/language/typescript/ts.worker?worker&url' {
  const workerUrl: string;
  export default workerUrl;
}
