import { cpSync, existsSync, mkdirSync, rmSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = resolve(__dirname, '..');

const source = resolve(root, 'vendor', 'omnisharp-wasm', 'publish', 'wwwroot');
const target = resolve(root, 'public', 'omnisharp');

if (!existsSync(source)) {
  console.warn(
    `Local OmniSharp publish output not found at ${source}. Skipping OmniSharp runtime sync.`
  );
  process.exit(0);
}

rmSync(target, { recursive: true, force: true });
mkdirSync(target, { recursive: true });
cpSync(source, target, { recursive: true, force: true });

console.log(`Synced OmniSharp runtime -> ${target}`);
