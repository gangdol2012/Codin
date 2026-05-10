import { cpSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = resolve(__dirname, '..');

const source = resolve(root, 'vendor', 'intellisage-wasm', 'publish', 'wwwroot');
const target = resolve(root, 'public', 'roslyn');

if (!existsSync(source)) {
  console.warn(
    `Local C# Roslyn publish output not found at ${source}. Skipping Roslyn runtime sync.`
  );
  process.exit(0);
}

mkdirSync(target, { recursive: true });
cpSync(source, target, { recursive: true, force: true });

const indexPath = resolve(target, 'index.html');
if (existsSync(indexPath)) {
  const indexHtml = readFileSync(indexPath, 'utf8')
    .replace(/<title>.*?<\/title>/, '<title>CodeCraft C# Roslyn</title>')
    .replace(/<base href="\/intellisage\/" \/>/, '<base href="/roslyn/" />')
    .replace(
      /If you're reading this, you've stumbled upon a headless API -- IntelliSage! Please refer to <a href="https:\/\/github\.com\/knervous\/intellisage">the documentation<\/a>/,
      "If you're reading this, you've stumbled upon CodeCraft's headless C# Roslyn API."
    );
  writeFileSync(indexPath, indexHtml);
}

const messageServicePath = resolve(target, 'message-service.js');
if (existsSync(messageServicePath)) {
  const messageService = readFileSync(messageServicePath, 'utf8')
    .replace(/intellisageInitialized/g, 'roslynInitialized')
    .replace(/intellisage/g, 'roslyn');
  writeFileSync(messageServicePath, messageService);
}

console.log(`Synced C# Roslyn runtime -> ${target}`);
