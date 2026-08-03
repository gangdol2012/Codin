import assert from 'node:assert/strict';
import test from 'node:test';

import {
  applyNotebookWorkspaceContentUpdate,
  getNotebookWorkspaceItemPath,
  resolveNotebookWorkspaceFile,
} from '../src/notebook-workspace.ts';

const items = [
  { id: 'root-notebook', name: 'demo.ipynb', type: 'file', parentId: null },
  { id: 'alpha', name: 'alpha', type: 'folder', parentId: null },
  { id: 'alpha-notebook', name: 'demo.ipynb', type: 'file', parentId: 'alpha' },
  { id: 'space-notebook', name: 'my notebook.ipynb', type: 'file', parentId: 'alpha' },
  { id: 'nested', name: 'nested', type: 'folder', parentId: 'alpha' },
  { id: 'nested-notebook', name: 'work.ipynb', type: 'file', parentId: 'nested' },
  { id: 'text-file', name: 'notes.txt', type: 'file', parentId: 'alpha' },
];

test('notebook paths resolve exactly from cwd or explicitly from workspace root', () => {
  const cwdRelative = resolveNotebookWorkspaceFile(items, 'alpha', 'demo.ipynb');
  assert.equal(cwdRelative.item.id, 'alpha-notebook');
  assert.equal(cwdRelative.path, 'alpha/demo.ipynb');

  const rootAbsolute = resolveNotebookWorkspaceFile(items, 'alpha', '/demo.ipynb');
  assert.equal(rootAbsolute.item.id, 'root-notebook');
  assert.equal(rootAbsolute.path, 'demo.ipynb');

  const tildeAbsolute = resolveNotebookWorkspaceFile(items, 'nested', '~/alpha/my notebook.ipynb');
  assert.equal(tildeAbsolute.item.id, 'space-notebook');
  assert.equal(tildeAbsolute.path, 'alpha/my notebook.ipynb');
});

test('cwd-relative lookup never falls back to a same-named root notebook', () => {
  const missing = resolveNotebookWorkspaceFile(items, 'nested', 'demo.ipynb');
  assert.equal('error' in missing, true);
  assert.equal(missing.path, 'alpha/nested/demo.ipynb');
  assert.match(missing.error, /No such file/);

  const explicit = resolveNotebookWorkspaceFile(items, 'nested', '/demo.ipynb');
  assert.equal(explicit.item.id, 'root-notebook');
});

test('a stale or invalid cwd never redirects a relative edit to the workspace root', () => {
  const missingCwd = resolveNotebookWorkspaceFile(items, 'deleted-folder', 'demo.ipynb');
  assert.equal('error' in missingCwd, true);
  assert.match(missingCwd.error, /current Terminal directory is no longer available/);

  const cyclicItems = [
    ...items,
    { id: 'cycle-a', name: 'a', type: 'folder', parentId: 'cycle-b' },
    { id: 'cycle-b', name: 'b', type: 'folder', parentId: 'cycle-a' },
  ];
  const cyclicCwd = resolveNotebookWorkspaceFile(cyclicItems, 'cycle-a', 'demo.ipynb');
  assert.equal('error' in cyclicCwd, true);
  assert.match(cyclicCwd.error, /current Terminal directory is no longer available/);

  const absolute = resolveNotebookWorkspaceFile(items, 'deleted-folder', '/demo.ipynb');
  assert.equal(absolute.item.id, 'root-notebook');
});

test('workspace resolution rejects folders and non-notebook files without ambiguity', () => {
  const folder = resolveNotebookWorkspaceFile(items, null, '/alpha');
  assert.equal('error' in folder, true);
  assert.match(folder.error, /Is a directory/);

  const text = resolveNotebookWorkspaceFile(items, 'alpha', 'notes.txt');
  assert.equal('error' in text, true);
  assert.match(text.error, /Expected a \.ipynb file/);

  assert.equal(getNotebookWorkspaceItemPath(items, 'nested-notebook'), 'alpha/nested/work.ipynb');
});

test('workspace resolution rejects duplicate items at the same normalized path', () => {
  const duplicateItems = [
    ...items,
    { id: 'root-notebook-duplicate', name: 'demo.ipynb', type: 'file', parentId: null },
  ];
  const duplicate = resolveNotebookWorkspaceFile(duplicateItems, null, '/demo.ipynb');
  assert.equal('error' in duplicate, true);
  assert.match(duplicate.error, /Ambiguous path \(2 workspace items match\)/);
});

test('notebook content commits preserve fresh unrelated state and reject stale target content', () => {
  const latest = [
    { id: 'notebook', name: 'demo.ipynb', type: 'file', parentId: null, content: 'newer user edit' },
    { id: 'other', name: 'notes.txt', type: 'file', parentId: null, content: 'new unrelated content' },
  ];
  const stale = applyNotebookWorkspaceContentUpdate(latest, 'notebook', 'old model snapshot', 'assistant edit');
  assert.equal(stale.ok, false);
  assert.equal(stale.items, latest);
  assert.match(stale.error, /file changed/);

  const staleNoOp = applyNotebookWorkspaceContentUpdate(latest, 'notebook', 'old model snapshot', 'old model snapshot');
  assert.equal(staleNoOp.ok, false, 'a snapshot-relative no-op must still conflict with newer live content');

  const committable = applyNotebookWorkspaceContentUpdate(latest, 'notebook', 'newer user edit', 'assistant edit');
  assert.equal(committable.ok, true);
  assert.equal(committable.items.find(item => item.id === 'notebook').content, 'assistant edit');
  assert.equal(committable.items.find(item => item.id === 'other').content, 'new unrelated content');
});
