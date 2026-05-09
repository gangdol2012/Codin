# BrowserCSharp WASM (vendored)

Fork of [89netraM/browser-csharp](https://github.com/89netraM/browser-csharp) `wasm/` with extra `[JSInvokable]` APIs used by `src/browser-csharp-api.ts`:

- `ClearScriptContext(string contextId)`
- `HasScriptContext(string contextId)`
- `ExecuteRegular(string code)` — `SourceCodeKind.Regular` console program (optional auto-wrap for bare statements)
- `ExecuteRegularInteractive(string code)`
- `ExecuteRegularProject(string[] paths, string[] contents, string entryPath)`
- `ExecuteRegularProjectInteractive(string[] paths, string[] contents, string entryPath)`

## Build runtime for CodeCraft

From the repo root:

```bash
npm run csharp:browser:publish
```

Then `npm run prebuild` (or `node scripts/sync-browser-csharp-runtime.mjs`) copies `publish-out/wwwroot/_framework` → `public/_framework`.

`npm run prebuild` builds this vendored runtime automatically when `publish-out` is missing or older than the C# sources. If `dotnet` is not already available, the sync script installs .NET SDK 8.0 under `node_modules/.cache/codecraft-dotnet`.

This is intentionally strict for deployment builds because the stock `node_modules/browser-csharp` runtime does not include CodeCraft's JS-invokable methods, including `ExecuteRegularProjectInteractive`.
