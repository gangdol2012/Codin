import assert from 'node:assert/strict';
import test from 'node:test';

import { resolveEditingMarkdownCellAfterClick } from '../src/notebook-markdown-interaction.ts';

test('clicking inside the active Markdown editor keeps it in edit mode', () => {
  assert.equal(resolveEditingMarkdownCellAfterClick('markdown-a', 'markdown-a'), 'markdown-a');
});

test('clicking elsewhere in the notebook returns the Markdown cell to preview', () => {
  assert.equal(resolveEditingMarkdownCellAfterClick('markdown-a', null), null);
  assert.equal(resolveEditingMarkdownCellAfterClick('markdown-a', 'markdown-b'), null);
});

test('notebook clicks are a no-op when no Markdown cell is being edited', () => {
  assert.equal(resolveEditingMarkdownCellAfterClick(null, null), null);
  assert.equal(resolveEditingMarkdownCellAfterClick(null, 'markdown-a'), null);
});
