import { cpSync, existsSync, mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = resolve(__dirname, '..');

const source = resolve(root, 'vendor', 'intellisage-wasm', 'publish', 'wwwroot');
const target = resolve(root, 'public', 'intellisage');

if (!existsSync(source)) {
  console.warn(
    `Local IntelliSage publish output not found at ${source}. Skipping IntelliSage runtime sync.`
  );
  process.exit(0);
}

mkdirSync(target, { recursive: true });
cpSync(source, target, { recursive: true, force: true });

console.log(`Synced IntelliSage runtime -> ${target}`);
