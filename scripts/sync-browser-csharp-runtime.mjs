import { cpSync, existsSync, mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = resolve(__dirname, '..');

/** Vendored WASM: run `dotnet publish -c Release -o publish-out` in `vendor/browser-csharp-wasm`. */
const vendorFramework = resolve(root, 'vendor', 'browser-csharp-wasm', 'publish-out', 'wwwroot', '_framework');
const vendorDll = resolve(vendorFramework, '_bin', 'BrowserCSharp.dll');

const npmFramework = resolve(root, 'node_modules', 'browser-csharp', 'out', '_framework');
const target = resolve(root, 'public', '_framework');

const source =
  existsSync(vendorDll) ? vendorFramework : npmFramework;

if (!existsSync(source)) {
  console.warn(
    `Browser C# runtime not found at ${npmFramework} (and no vendored build at ${vendorFramework}). Skipping runtime sync.`
  );
  process.exit(0);
}

mkdirSync(target, { recursive: true });
cpSync(source, target, { recursive: true, force: true });

console.log(
  `Synced Browser C# runtime -> ${target}` +
    (existsSync(vendorDll) ? ' (from vendor/browser-csharp-wasm publish-out)' : ' (from node_modules/browser-csharp)')
);
