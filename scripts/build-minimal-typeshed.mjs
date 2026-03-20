#!/usr/bin/env node
/**
 * Builds a minimal typeshed ZIP with only essential stdlib modules.
 * Pyright eagerly loads all typeshed files - a minimal set keeps memory low.
 * Uses unzip/zip CLI (macOS/Linux).
 */
import { mkdirSync, readdirSync, rmSync, statSync, copyFileSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';
import { execSync } from 'child_process';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');
const FULL_ZIP = join(ROOT, 'node_modules/monaco-pyright-lsp/assets/typeshed-fallback.zip');
const TMP = join(ROOT, '.tmp-typeshed');
const OUT_ZIP = join(ROOT, 'public/minimal-typeshed.zip');
const FULL_COPY = join(ROOT, 'public/typeshed-full.zip');

// Essential modules - minimal set to reduce memory (~50 files vs 5300)
const INCLUDE = new Set([
  'stdlib/builtins.pyi', 'stdlib/typing.pyi', 'stdlib/sys.pyi', 'stdlib/types.pyi',
  'stdlib/abc.pyi', 'stdlib/io.pyi', 'stdlib/codecs.pyi', 'stdlib/re.pyi',
  'stdlib/math.pyi',
  'stdlib/json/__init__.pyi', 'stdlib/dataclasses.pyi', 'stdlib/functools.pyi',
  'stdlib/contextlib.pyi', 'stdlib/itertools.pyi', 'stdlib/warnings.pyi',
  'stdlib/os/__init__.pyi', 'stdlib/pathlib.pyi', 'stdlib/collections/__init__.pyi',
  'stdlib/collections/abc.pyi', 'stdlib/genericpath.pyi', 'stdlib/posixpath.pyi',
  'stdlib/ntpath.pyi', 'stdlib/_collections_abc.pyi', 'stdlib/_typeshed/__init__.pyi',
]);

function matches(name) {
  if (INCLUDE.has(name)) return true;
  if (name.endsWith('/')) return false;
  const dir = name.replace(/\/[^/]+$/, '');
  return INCLUDE.has(dir + '/__init__.pyi') && name.startsWith(dir + '/');
}

function main() {
  rmSync(TMP, { recursive: true, force: true });
  mkdirSync(TMP, { recursive: true });
  mkdirSync(dirname(OUT_ZIP), { recursive: true });

  execSync(`unzip -q -o "${FULL_ZIP}" -d "${TMP}"`);

  const toKeep = [];
  function walk(dir, prefix = '') {
    for (const name of readdirSync(dir)) {
      const path = join(dir, name);
      const rel = prefix ? `${prefix}/${name}` : name;
      const stat = statSync(path);
      if (stat.isDirectory()) walk(path, rel);
      else if (matches(rel)) toKeep.push(rel);
    }
  }
  walk(TMP);

  execSync(`cd "${TMP}" && zip -q -r -0 "${OUT_ZIP}" ${toKeep.map((f) => `"${f}"`).join(' ')}`);

  rmSync(TMP, { recursive: true, force: true });
  console.log(`Created minimal typeshed: ${toKeep.length} files -> ${OUT_ZIP}`);

  copyFileSync(FULL_ZIP, FULL_COPY);
  console.log(`Copied full typeshed -> ${FULL_COPY}`);
}

main();
