import assert from 'node:assert/strict';
import test from 'node:test';

import {
  getCodeCraftProjectPathFromUriPath,
  getCodeCraftSourcePathFromUriPath,
} from '../src/monaco-project-path.ts';

test('Monaco project paths preserve literal percent text without decoding it twice', () => {
  assert.equal(
    getCodeCraftProjectPathFromUriPath('/codecraft-project/Assets/A%20B.cs'),
    'Assets/A%20B.cs'
  );
  assert.equal(
    getCodeCraftProjectPathFromUriPath('/codecraft-project/Assets/100%25Ready.cs'),
    'Assets/100%25Ready.cs'
  );
  assert.equal(
    getCodeCraftProjectPathFromUriPath('/codecraft-project/Assets/Bad%Name.cs'),
    'Assets/Bad%Name.cs'
  );
  assert.equal(
    getCodeCraftProjectPathFromUriPath('/codecraft-project/Assets/Literal%2FSlash.cs'),
    'Assets/Literal%2FSlash.cs'
  );
  assert.equal(
    getCodeCraftProjectPathFromUriPath('/codecraft-project/Assets/%2E%2E/StillNested.cs'),
    'Assets/%2E%2E/StillNested.cs'
  );
});

test('temporary model paths and fallbacks use the same lossless normalization', () => {
  assert.equal(
    getCodeCraftSourcePathFromUriPath(
      '/codecraft-model/session-1/Assets/A%20B.cs',
      'unused'
    ),
    'Assets/A%20B.cs'
  );
  assert.equal(
    getCodeCraftSourcePathFromUriPath('', 'Assets/Fallback%20Name.cs'),
    'Assets/Fallback%20Name.cs'
  );
});
