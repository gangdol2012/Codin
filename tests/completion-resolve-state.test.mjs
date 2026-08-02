import assert from 'node:assert/strict';
import test from 'node:test';

import {
  CompletionResolveStateStore,
  completionResolveSnapshotMode,
  isCompletionAcceptedText,
  mapCompletionSnapshotOffsetRange,
  selectCompletionResolveContext,
} from '../src/completion-resolve-state.ts';

test('completion resolve state survives typing and publication of another list', () => {
  const store = new CompletionResolveStateStore();
  const visibleImport = {};
  const newerItem = {};
  const importState = {
    runtimeSession: 7,
    listKey: 'normal:7:first',
    rawItem: { label: 'HttpClient' },
  };

  store.set(visibleImport, importState);

  // These are the transient caches the editor clears/replaces on every filter character.
  const exactResults = new Map([['first', visibleImport]]);
  exactResults.clear();
  store.set(newerItem, {
    runtimeSession: 7,
    listKey: 'normal:7:second',
    rawItem: { label: 'Console' },
  });

  assert.equal(store.get(visibleImport, 7), importState);
  assert.equal(store.get(newerItem, 7)?.listKey, 'normal:7:second');
});

test('completion resolve state never crosses a worker runtime generation', () => {
  const store = new CompletionResolveStateStore();
  const item = {};
  store.set(item, { runtimeSession: 3, listKey: 'normal:3:item' });

  assert.equal(store.get(item, 4), undefined);
  assert.equal(store.get(item, 3)?.listKey, 'normal:3:item');

  store.reset();
  assert.equal(store.get(item, 3), undefined);
});

test('completion snapshots rebase typing but reject a changed authoring structure', () => {
  const snapshot = { modelVersionId: 11, structuralVersion: 4 };

  assert.equal(completionResolveSnapshotMode(snapshot, 11, 4), 'current');
  assert.equal(completionResolveSnapshotMode(snapshot, 12, 4), 'rebase');
  assert.equal(completionResolveSnapshotMode(snapshot, 11, 5), 'invalid');
  assert.equal(completionResolveSnapshotMode(snapshot, 12, 5), 'invalid');
});

test('an accepted async main edit retains its pre-insertion resolve context', () => {
  const dispatchContext = {
    valid: true,
    lateContext: { insertedLength: 2 },
  };
  const invalidAfterMainInsertion = { valid: false, lateContext: null };

  assert.equal(
    selectCompletionResolveContext(
      dispatchContext,
      invalidAfterMainInsertion,
      true,
      true,
      8,
      8
    ),
    dispatchContext
  );
  assert.equal(
    selectCompletionResolveContext(
      dispatchContext,
      invalidAfterMainInsertion,
      false,
      true,
      8,
      8
    ),
    dispatchContext
  );
  assert.equal(
    selectCompletionResolveContext(
      dispatchContext,
      invalidAfterMainInsertion,
      true,
      false,
      8,
      8
    ),
    null
  );
  assert.equal(
    selectCompletionResolveContext(
      dispatchContext,
      invalidAfterMainInsertion,
      false,
      true,
      8,
      9
    ),
    null
  );
});

test('a canceled details resolve is retained only when the main completion was accepted', () => {
  const dispatchText = 'class Demo { private HttpCl value; }';
  const start = dispatchText.indexOf('HttpCl');
  const range = [{ start, end: start + 'HttpCl'.length }];

  assert.equal(
    isCompletionAcceptedText(
      dispatchText,
      'class Demo { private HttpClient value; }',
      'HttpClient',
      range
    ),
    true
  );
  assert.equal(
    isCompletionAcceptedText(
      dispatchText,
      'class Demo { private HttpClientX value; }',
      'HttpClient',
      range
    ),
    true
  );
  assert.equal(
    isCompletionAcceptedText(
      dispatchText,
      'class Changed { private HttpCl value; }',
      'HttpClient',
      range
    ),
    false
  );
});

test('resolved using edits stay fixed while later snapshot edits are rebased', () => {
  assert.deepEqual(
    mapCompletionSnapshotOffsetRange(0, 0, 20, 2, 42, 'edit'),
    { start: 0, end: 0 }
  );
  assert.deepEqual(
    mapCompletionSnapshotOffsetRange(30, 30, 20, 2, 42, 'edit'),
    { start: 32, end: 32 }
  );
  assert.deepEqual(
    mapCompletionSnapshotOffsetRange(15, 20, 20, 2, 42, 'main'),
    { start: 15, end: 22 }
  );
});
