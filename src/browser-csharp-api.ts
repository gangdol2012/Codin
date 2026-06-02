import { BrowserCSharp as BrowserCSharpBase, type ScriptResult } from 'browser-csharp';

declare global {
  // Provided by blazor.webassembly.js after load (same timing as BrowserCSharp.ExecuteScript).
  var DotNet: {
    invokeMethodAsync<T>(
      assemblyName: string,
      methodIdentifier: string,
      ...args: unknown[]
    ): Promise<T>;
  };
}

const assemblyName = 'BrowserCSharp';

function invoke<T>(method: string, ...args: unknown[]): Promise<T> {
  return DotNet.invokeMethodAsync<T>(assemblyName, method, ...args);
}

/**
 * CodeCraft extension of [browser-csharp](https://www.npmjs.com/package/browser-csharp):
 * named helpers for context execution, plus WASM methods added in `vendor/browser-csharp-wasm/Program.cs`.
 */
export const BrowserCSharp = {
  OnReady: BrowserCSharpBase.OnReady,
  ExecuteScript: BrowserCSharpBase.ExecuteScript,

  /** Same as `ExecuteScript(code, contextId)` — explicit name for REPL-style runs. */
  executeScriptInContext(code: string, contextId: string): Promise<ScriptResult> {
    return BrowserCSharpBase.ExecuteScript(code, contextId);
  },

  executeScriptInteractive(code: string): Promise<ScriptResult> {
    return invoke<ScriptResult>('ExecuteScriptInteractive', code);
  },

  executeScriptInContextInteractive(code: string, contextId: string): Promise<ScriptResult> {
    return invoke<ScriptResult>('ExecuteScriptInContextInteractive', code, contextId);
  },

  /** Forget accumulated compilations for a REPL `contextId` (see `executeScriptInContext`). */
  clearScriptContext(contextId: string): Promise<boolean> {
    return invoke<boolean>('ClearScriptContext', contextId);
  },

  /** Whether a REPL context has been created for this id. */
  hasScriptContext(contextId: string): Promise<boolean> {
    return invoke<boolean>('HasScriptContext', contextId);
  },

  /**
   * Compiles and runs as a normal console program (`SourceCodeKind.Regular`), not Roslyn script.
   * Full programs with `Main` run as-is; bare statements are wrapped in a synthetic `async Task Main`.
   */
  executeRegular(code: string): Promise<ScriptResult> {
    return invoke<ScriptResult>('ExecuteRegular', code);
  },

  executeRegularInteractive(code: string): Promise<ScriptResult> {
    return invoke<ScriptResult>('ExecuteRegularInteractive', code);
  },

  /** Compiles and runs a multi-file C# console project. */
  executeRegularProject(paths: string[], contents: string[], entryPath: string): Promise<ScriptResult> {
    return invoke<ScriptResult>('ExecuteRegularProject', paths, contents, entryPath);
  },

  executeRegularProjectInteractive(paths: string[], contents: string[], entryPath: string): Promise<ScriptResult> {
    return invoke<ScriptResult>('ExecuteRegularProjectInteractive', paths, contents, entryPath);
  },

  executeRegularProjectWithFiles(
    paths: string[],
    contents: string[],
    entryPath: string,
    runtimePaths: string[],
    runtimeContents: string[]
  ): Promise<ScriptResult & { files?: RuntimeFileSnapshot[] }> {
    return invoke<ScriptResult & { files?: RuntimeFileSnapshot[] }>(
      'ExecuteRegularProjectWithFiles',
      paths,
      contents,
      entryPath,
      runtimePaths,
      runtimeContents
    );
  },

  executeRegularProjectWithFilesInteractive(
    paths: string[],
    contents: string[],
    entryPath: string,
    runtimePaths: string[],
    runtimeContents: string[]
  ): Promise<ScriptResult & { files?: RuntimeFileSnapshot[] }> {
    return invoke<ScriptResult & { files?: RuntimeFileSnapshot[] }>(
      'ExecuteRegularProjectWithFilesInteractive',
      paths,
      contents,
      entryPath,
      runtimePaths,
      runtimeContents
    );
  },
};

export interface RuntimeFileSnapshot {
  path: string;
  content: string;
}

export type { ScriptResult } from 'browser-csharp';
