import { cpSync, existsSync, mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = resolve(__dirname, '..');

const source = resolve(root, 'node_modules', 'pyodide');
const target = resolve(root, 'public', 'pyodide');
const runtimeFiles = [
  'pyodide.js',
  'pyodide.mjs',
  'pyodide.asm.js',
  'pyodide.asm.wasm',
  'pyodide-lock.json',
  'python_stdlib.zip',
  'pyodide.js.map',
  'pyodide.mjs.map',
];

if (!existsSync(source)) {
  console.warn(`Pyodide runtime not found at ${source}. Skipping runtime sync.`);
  process.exit(0);
}

mkdirSync(target, { recursive: true });

const copied = [];
for (const fileName of runtimeFiles) {
  const sourceFile = resolve(source, fileName);
  if (!existsSync(sourceFile)) {
    continue;
  }
  cpSync(sourceFile, resolve(target, fileName), { force: true });
  copied.push(fileName);
}

console.log(`Synced Pyodide runtime -> ${target} (${copied.length} file${copied.length === 1 ? '' : 's'})`);
