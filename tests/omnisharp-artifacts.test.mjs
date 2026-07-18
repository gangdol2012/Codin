import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readdir, readFile } from 'node:fs/promises';
import { join, relative, resolve } from 'node:path';
import test from 'node:test';
import { brotliDecompressSync, gunzipSync } from 'node:zlib';

const root = resolve(import.meta.dirname, '..');
const publishRoot = join(root, 'vendor', 'omnisharp-wasm', 'publish', 'wwwroot');
const publicRoot = join(root, 'public', 'omnisharp');
const distRoot = join(root, 'dist', 'omnisharp');
const frameworkRoot = join(publishRoot, '_framework');

async function filesBelow(directory) {
  const files = [];
  const visit = async current => {
    for (const entry of await readdir(current, { withFileTypes: true })) {
      const path = join(current, entry.name);
      if (entry.isDirectory()) await visit(path);
      else if (entry.isFile()) files.push(relative(directory, path));
    }
  };
  await visit(directory);
  return files.sort();
}

function sha256Integrity(bytes) {
  return 'sha256-' + createHash('sha256').update(bytes).digest('base64');
}

function sha256Hex(bytes) {
  return createHash('sha256').update(bytes).digest('hex').toUpperCase();
}

test('published, public, and production OmniSharp trees are byte-identical', async () => {
  const expectedFiles = await filesBelow(publishRoot);
  assert.deepEqual(await filesBelow(publicRoot), expectedFiles);
  assert.deepEqual(await filesBelow(distRoot), expectedFiles);

  for (const path of expectedFiles) {
    const expected = await readFile(join(publishRoot, path));
    assert.deepEqual(await readFile(join(publicRoot, path)), expected, 'public/' + path);
    assert.deepEqual(await readFile(join(distRoot, path)), expected, 'dist/' + path);
  }
});

test('the static host does not duplicate validated metadata transfers with preloads', async () => {
  const html = await readFile(join(publishRoot, 'index.html'), 'utf8');
  assert.doesNotMatch(html, /<link\b[^>]*\brel=["']preload["'][^>]*codecraft-namespace-index/i);
  assert.doesNotMatch(html, /<link\b[^>]*\brel=["']preload["'][^>]*codecraft-reference-pack/i);
  assert.doesNotMatch(html, /<link\b[^>]*\brel=["']preload["'][^>]*System\.Runtime\.xml/i);
});

test('every paired compressed OmniSharp asset expands to its exact raw bytes', async () => {
  const files = await filesBelow(publishRoot);
  const fileSet = new Set(files);
  let verifiedPairs = 0;
  for (const path of files) {
    const extension = path.endsWith('.gz') ? '.gz' : path.endsWith('.br') ? '.br' : null;
    if (!extension) continue;
    const rawPath = path.slice(0, -extension.length);
    if (!fileSet.has(rawPath)) continue;

    const compressed = await readFile(join(publishRoot, path));
    const expanded = extension === '.gz'
      ? gunzipSync(compressed)
      : brotliDecompressSync(compressed);
    assert.deepEqual(expanded, await readFile(join(publishRoot, rawPath)), path);
    verifiedPairs++;
  }

  assert.ok(verifiedPairs > 100, 'expected the complete Blazor sidecar set');
  assert.ok(fileSet.has('System.Runtime.xml.gz'));
  assert.ok(fileSet.has('_framework/codecraft-reference-pack.bin.gz'));
  assert.ok(fileSet.has('_framework/codecraft-reference-pack.bin.br'));
});

test('Blazor resource hashes and aggregate cache identity match exact artifacts', async () => {
  const boot = JSON.parse(await readFile(join(frameworkRoot, 'blazor.boot.json'), 'utf8'));
  const resources = boot.resources;
  const directKinds = [
    'assembly',
    'jsModuleWorker',
    'jsModuleNative',
    'jsModuleRuntime',
    'wasmNative',
    'wasmSymbols',
    'icu',
    'runtime',
    'lazyAssembly',
  ];

  for (const kind of directKinds) {
    for (const [name, integrity] of Object.entries(resources[kind] ?? {})) {
      assert.equal(sha256Integrity(await readFile(join(frameworkRoot, name))), integrity, name);
    }
  }
  for (const kind of ['satelliteResources', 'vfs']) {
    for (const [group, entries] of Object.entries(resources[kind] ?? {})) {
      for (const [name, integrity] of Object.entries(entries)) {
        assert.equal(
          sha256Integrity(await readFile(join(frameworkRoot, group, name))),
          integrity,
          group + '/' + name
        );
      }
    }
  }

  let aggregateInput = '';
  const resourceHashComparer = new Intl.Collator().compare;
  for (const kind of directKinds) {
    aggregateInput += Object.values(resources[kind] ?? {}).sort(resourceHashComparer).join('');
  }
  for (const kind of ['satelliteResources', 'vfs']) {
    for (const entries of Object.values(resources[kind] ?? {})) {
      aggregateInput += Object.values(entries).sort(resourceHashComparer).join('');
    }
  }
  assert.equal(
    sha256Integrity(Buffer.from(aggregateInput, 'utf8')),
    resources.hash,
    'resources.hash'
  );
});

test('reference-pack manifest, slices, and documentation match exact static bytes', async () => {
  const manifestPath = join(frameworkRoot, 'codecraft-namespace-index.json');
  const manifest = JSON.parse(await readFile(manifestPath, 'utf8'));
  const pack = await readFile(join(frameworkRoot, manifest.referencePack.path));
  assert.equal(pack.byteLength, manifest.referencePack.length);
  assert.equal(sha256Hex(pack), manifest.referencePack.sha256.toUpperCase());

  const assemblies = Object.entries(manifest.referencePack.assemblies);
  assert.equal(assemblies.length, 163);
  for (const [name, slice] of assemblies) {
    const bytes = pack.subarray(slice.offset, slice.offset + slice.length);
    assert.equal(bytes.byteLength, slice.length, name + ' length');
    assert.equal(sha256Hex(bytes), slice.sha256.toUpperCase(), name + ' hash');
  }

  const documentationPath = resolve(publishRoot, manifest.documentation.path);
  const documentation = await readFile(documentationPath);
  assert.equal(documentation.byteLength, manifest.documentation.length);
  assert.equal(
    sha256Hex(documentation),
    manifest.documentation.sha256.toUpperCase(),
    'System.Runtime.xml hash'
  );
});
