import assert from 'node:assert/strict';
import test from 'node:test';

import { parseNotebookAssistantRequest } from '../src/notebook-assistant.ts';

test('assistant notebook requests reject invalid supplied optional cell selectors', () => {
  for (const cell of [0, false, '', '   ', null]) {
    const parsed = parseNotebookAssistantRequest({
      action: 'clear-outputs',
      path: '/demo.ipynb',
      cell,
    });
    assert.equal(parsed.ok, false, `invalid cell ${JSON.stringify(cell)} must not become an all-cells operation`);
    assert.match(parsed.error, /cell must be/);
  }

  const allCells = parseNotebookAssistantRequest({ action: 'clear-outputs', path: '/demo.ipynb' });
  assert.deepEqual(allCells.request, { command: 'clear-outputs' });

  const oneCell = parseNotebookAssistantRequest({ action: 'clear-outputs', path: '/demo.ipynb', cell: 2 });
  assert.deepEqual(oneCell.request, { command: 'clear-outputs', cell: '#2' });

  for (const irrelevant of [
    { action: 'clear-outputs', path: '/demo.ipynb', index: 2 },
    { action: 'validate', path: '/demo.ipynb', source: 'ignored' },
    { action: 'show', path: '/demo.ipynb', language: 'python' },
  ]) {
    const parsed = parseNotebookAssistantRequest(irrelevant);
    assert.equal(parsed.ok, false);
    assert.match(parsed.error, /does not accept/);
  }
});

test('assistant notebook source is passed structurally without shell escaping', () => {
  const source = 'first line\npath = r"C:\\\\temp"\n마지막 줄';
  const parsed = parseNotebookAssistantRequest({
    action: 'set-source',
    path: '/folder/demo.ipynb',
    cell: 'stable-id',
    source,
  });
  assert.equal(parsed.ok, true);
  assert.deepEqual(parsed.request, { command: 'set-source', cell: 'stable-id', source });
  assert.doesNotMatch(parsed.displayedCommand, new RegExp(source));
});
