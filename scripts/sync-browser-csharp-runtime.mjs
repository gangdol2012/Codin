import { cpSync, existsSync, mkdirSync, readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import { dirname, extname, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = resolve(__dirname, '..');

const args = new Set(process.argv.slice(2));
const bestEffort = args.has('--best-effort');
const force = args.has('--force');

const vendorRoot = resolve(root, 'vendor', 'browser-csharp-wasm');
const vendorProject = resolve(vendorRoot, 'BrowserCSharp.csproj');
const vendorPublishOut = resolve(vendorRoot, 'publish-out');
const vendorFramework = resolve(vendorPublishOut, 'wwwroot', '_framework');
const vendorDll = resolve(vendorFramework, '_bin', 'BrowserCSharp.dll');

const npmFramework = resolve(root, 'node_modules', 'browser-csharp', 'out', '_framework');
const target = resolve(root, 'public', '_framework');
const localDotnetDir = resolve(root, 'node_modules', '.cache', 'codecraft-dotnet');
const localDotnet = resolve(localDotnetDir, process.platform === 'win32' ? 'dotnet.exe' : 'dotnet');
const dotnetInstallScript = resolve(localDotnetDir, 'dotnet-install.sh');
const requiredBrowserCSharpMethods = [
  'ClearScriptContext',
  'HasScriptContext',
  'ExecuteRegular',
  'ExecuteRegularInteractive',
  'ExecuteRegularProject',
  'ExecuteRegularProjectInteractive',
];

function getSourceFiles(dir) {
  const entries = readdirSync(dir, { withFileTypes: true });
  const files = [];

  for (const entry of entries) {
    if (entry.name === 'bin' || entry.name === 'obj' || entry.name === 'publish-out') {
      continue;
    }

    const fullPath = resolve(dir, entry.name);
    if (entry.isDirectory()) {
      files.push(...getSourceFiles(fullPath));
      continue;
    }

    if (entry.isFile() && (entry.name.endsWith('.csproj') || entry.name === 'LinkerConfig.xml' || extname(entry.name) === '.cs')) {
      files.push(fullPath);
    }
  }

  return files;
}

function latestSourceMtime() {
  return Math.max(...getSourceFiles(vendorRoot).map(file => statSync(file).mtimeMs));
}

function hasRequiredMethods(dllPath) {
  if (!existsSync(dllPath)) {
    return false;
  }

  const dll = statSync(dllPath).size > 0 ? readFileSync(dllPath) : Buffer.alloc(0);
  return requiredBrowserCSharpMethods.every(method => dll.includes(method));
}

function vendorBuildIsFresh() {
  return existsSync(vendorDll) && statSync(vendorDll).mtimeMs >= latestSourceMtime();
}

function dotnetWorks(command) {
  const result = spawnSync(command, ['--info'], { stdio: 'ignore' });
  return !result.error && result.status === 0;
}

async function downloadDotnetInstallScript() {
  const response = await fetch('https://dot.net/v1/dotnet-install.sh');
  if (!response.ok) {
    throw new Error(`failed to download dotnet-install.sh: ${response.status} ${response.statusText}`);
  }

  writeFileSync(dotnetInstallScript, await response.text(), { mode: 0o755 });
}

async function ensureDotnet() {
  if (dotnetWorks('dotnet')) {
    return 'dotnet';
  }

  if (dotnetWorks(localDotnet)) {
    return localDotnet;
  }

  console.log(`dotnet was not found; installing .NET SDK 8.0 into ${localDotnetDir}...`);
  mkdirSync(localDotnetDir, { recursive: true });
  await downloadDotnetInstallScript();

  const result = spawnSync(
    'bash',
    [dotnetInstallScript, '--channel', '8.0', '--install-dir', localDotnetDir, '--no-path'],
    {
      cwd: root,
      stdio: 'inherit',
    },
  );

  if (result.error) {
    throw result.error;
  }

  if (result.status !== 0) {
    throw new Error(`dotnet install failed with exit code ${result.status}.`);
  }

  if (!dotnetWorks(localDotnet)) {
    throw new Error(`installed dotnet is not executable at ${localDotnet}.`);
  }

  return localDotnet;
}

async function publishVendorRuntime() {
  const dotnet = await ensureDotnet();
  console.log('Publishing vendored Browser C# runtime...');
  const result = spawnSync(
    dotnet,
    ['publish', vendorProject, '-c', 'Release', '-o', vendorPublishOut],
    {
      cwd: root,
      stdio: 'inherit',
    },
  );

  if (result.error) {
    throw result.error;
  }

  if (result.status !== 0) {
    throw new Error(`dotnet publish failed with exit code ${result.status}.`);
  }
}

try {
  if (force || !vendorBuildIsFresh()) {
    await publishVendorRuntime();
  }
} catch (error) {
  if (!bestEffort) {
    console.error(
      'Unable to build the vendored Browser C# runtime. The stock browser-csharp runtime is missing CodeCraft JSInvokable methods.'
    );
    throw error;
  }

  console.warn(
    `Unable to build the vendored Browser C# runtime (${error instanceof Error ? error.message : String(error)}).`
  );
}

const source =
  existsSync(vendorDll) ? vendorFramework : npmFramework;

if (!existsSync(source)) {
  console.warn(
    `Browser C# runtime not found at ${npmFramework} (and no vendored build at ${vendorFramework}). Skipping runtime sync.`
  );
  process.exit(0);
}

const sourceDll = resolve(source, '_bin', 'BrowserCSharp.dll');
if (!hasRequiredMethods(sourceDll)) {
  const message = `Browser C# runtime at ${source} is missing required CodeCraft methods: ${requiredBrowserCSharpMethods.join(', ')}.`;
  if (!bestEffort) {
    throw new Error(message);
  }

  console.warn(`${message} C# project execution may fail until the vendored runtime is built.`);
}

mkdirSync(target, { recursive: true });
cpSync(source, target, { recursive: true, force: true });

console.log(
  `Synced Browser C# runtime -> ${target}` +
    (existsSync(vendorDll) ? ' (from vendor/browser-csharp-wasm publish-out)' : ' (from node_modules/browser-csharp)')
);
