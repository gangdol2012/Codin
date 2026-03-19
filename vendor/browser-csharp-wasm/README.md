# BrowserCSharp WASM (vendored)

Fork of [89netraM/browser-csharp](https://github.com/89netraM/browser-csharp) `wasm/` with extra `[JSInvokable]` APIs used by `src/browser-csharp-api.ts`:

- `ClearScriptContext(string contextId)`
- `HasScriptContext(string contextId)`
- `ExecuteRegular(string code)` — `SourceCodeKind.Regular` console program (optional auto-wrap for bare statements)

## Build runtime for CodeCraft

From this directory:

```bash
dotnet publish -c Release -o publish-out
```

Then from the repo root, `npm run prebuild` (or `node scripts/sync-browser-csharp-runtime.mjs`) copies `publish-out/wwwroot/_framework` → `public/_framework`.

If you skip this step, the sync script falls back to `node_modules/browser-csharp` (stock runtime **without** the new methods — `clearScriptContext` / `hasScriptContext` will fail at runtime).
