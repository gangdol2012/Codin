import { cpSync, existsSync, mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = resolve(__dirname, '..');
const source = resolve(root, 'node_modules', 'browser-csharp', 'out', '_framework');
const target = resolve(root, 'public', '_framework');

if (!existsSync(source)) {
  console.warn(`Browser C# runtime not found at ${source}. Skipping runtime sync.`);
  process.exit(0);
}

mkdirSync(target, { recursive: true });
cpSync(source, target, { recursive: true, force: true });

console.log(`Synced Browser C# runtime -> ${target}`);
