import assert from 'node:assert/strict';
import test from 'node:test';

import {
  appendNotebookCellOutput,
  clearNotebookCellOutputs,
  createCSharpNotebook,
  createDisplayDataOutput,
  createErrorOutput,
  createExecuteResultOutput,
  createNotebookCell,
  createPythonNotebook,
  createStreamOutput,
  deleteNotebookCell,
  detectNotebookLanguage,
  duplicateNotebookCell,
  insertNotebookCell,
  moveNotebookCell,
  notebookSourceToString,
  normalizeNotebook,
  parseNotebook,
  serializeNotebook,
  setNotebookCellExecutionCount,
  setNotebookCellOutputs,
  setNotebookCellSource,
  setNotebookCellType,
  setNotebookLanguage,
  tryParseNotebook,
} from '../src/notebook-model.ts';

test('tolerant nbformat normalization preserves extension data and standard output payloads', () => {
  const raw = {
    nbformat: 4,
    nbformat_minor: 2,
    metadata: {
      kernelspec: { name: 'python3', language: 'python', custom_kernel_key: 7 },
      vendor: { nested: ['preserve', { everything: true }] },
    },
    custom_notebook_field: { owner: 'another-client' },
    cells: [
      {
        id: 'stable-cell',
        cell_type: 'code',
        source: ['print("hello")\n', '42'],
        metadata: { tags: ['keep-me'], vendor_cell: { enabled: true } },
        execution_count: 3,
        custom_cell_field: 'retained',
        outputs: [
          { output_type: 'stream', name: 'stdout', text: ['hello\n'], vendor_stream: 1 },
          {
            output_type: 'display_data',
            data: { 'text/plain': ['display'], 'application/vnd.example+json': { x: 1 } },
            metadata: { isolated: true },
            transient: { display_id: 'display-1' },
          },
          {
            output_type: 'execute_result',
            execution_count: 3,
            data: { 'text/plain': '42' },
            metadata: { expanded: false },
            vendor_result: 'yes',
          },
          {
            output_type: 'error',
            ename: 'ValueError',
            evalue: 'bad value',
            traceback: ['line one\n', 'line two'],
            vendor_error: { code: 9 },
          },
          {
            output_type: 'application/vnd.future-output',
            payload: { future: true },
          },
        ],
      },
      {
        cell_type: 'markdown',
        source: '# Heading',
        metadata: { editable: false },
        attachments: { 'image.png': { 'image/png': 'base64' } },
        custom_markdown_field: 11,
      },
      {
        id: 'stable-cell',
        cell_type: 'raw',
        source: ['raw\n', 'text'],
        metadata: { format: 'text/plain' },
      },
    ],
  };

  const notebook = normalizeNotebook(raw);
  const repeated = normalizeNotebook(raw);

  assert.equal(notebook.nbformat, 4);
  assert.equal(notebook.nbformat_minor, 5, 'cell ids upgrade old nbformat 4 documents to minor 5');
  assert.deepEqual(notebook.metadata.vendor, raw.metadata.vendor);
  assert.deepEqual(notebook.custom_notebook_field, raw.custom_notebook_field);
  assert.notEqual(notebook.metadata.vendor, raw.metadata.vendor, 'normalization deep-clones unknown metadata');

  const code = notebook.cells[0];
  assert.equal(code.id, 'stable-cell');
  assert.deepEqual(code.source, raw.cells[0].source);
  assert.equal(code.custom_cell_field, 'retained');
  assert.equal(code.outputs[0].vendor_stream, 1);
  assert.deepEqual(code.outputs[1].transient, { display_id: 'display-1' });
  assert.deepEqual(code.outputs[1].data['application/vnd.example+json'], { x: 1 });
  assert.equal(code.outputs[2].vendor_result, 'yes');
  assert.deepEqual(code.outputs[3].vendor_error, { code: 9 });
  assert.deepEqual(code.outputs[4], raw.cells[0].outputs[4]);

  assert.match(notebook.cells[1].id, /^[A-Za-z0-9_-]{1,64}$/);
  assert.match(notebook.cells[2].id, /^[A-Za-z0-9_-]{1,64}$/);
  assert.notEqual(notebook.cells[2].id, 'stable-cell', 'duplicate ids are repaired');
  assert.equal(notebook.cells[1].id, repeated.cells[1].id, 'generated ids are stable for the same input');
  assert.equal(notebook.cells[2].id, repeated.cells[2].id);
  assert.deepEqual(notebook.cells[1].attachments, raw.cells[1].attachments);
  assert.equal(notebook.cells[1].custom_markdown_field, 11);

  const reparsed = parseNotebook(serializeNotebook(notebook));
  assert.deepEqual(reparsed, notebook, 'a normalized notebook survives a save/load round trip');
});

test('parsing rejects invalid JSON/non-object roots while tryParseNotebook remains nonthrowing', () => {
  assert.throws(() => parseNotebook('{not-json'), SyntaxError);
  assert.throws(() => parseNotebook('[]'), /must be a JSON object/);

  const malformed = tryParseNotebook('{not-json');
  assert.equal(malformed.notebook, null);
  assert.ok(malformed.error instanceof Error);

  const sparse = parseNotebook('{"metadata":null,"cells":null}', { defaultLanguage: 'python' });
  assert.deepEqual(sparse.cells, []);
  assert.equal(detectNotebookLanguage(sparse), 'python');
});

test('Python and C# defaults and language updates preserve unrelated metadata', () => {
  const python = createPythonNotebook({ metadata: { vendor: { keep: true } } });
  assert.equal(detectNotebookLanguage(python), 'python');
  assert.equal(python.cells.length, 1);
  assert.equal(python.cells[0].cell_type, 'code');
  assert.equal(python.metadata.kernelspec.name, 'python3');
  assert.equal(python.metadata.language_info.name, 'python');

  const csharp = setNotebookLanguage(python, 'csharp');
  assert.equal(detectNotebookLanguage(csharp), 'csharp');
  assert.deepEqual(csharp.metadata.vendor, { keep: true });
  assert.equal(csharp.metadata.kernelspec.name, '.net-csharp');
  assert.equal(csharp.metadata.kernelspec.language, 'C#');
  assert.equal(csharp.metadata.polyglot_notebook.defaultKernelName, 'csharp');
  assert.notEqual(csharp.metadata, python.metadata);

  const directCSharp = createCSharpNotebook({ includeInitialCodeCell: false });
  assert.equal(detectNotebookLanguage(directCSharp), 'csharp');
  assert.deepEqual(directCSharp.cells, []);

  assert.equal(detectNotebookLanguage({ cells: [{ cell_type: 'code', source: '#!cs\n1 + 1' }] }), 'csharp');
  assert.equal(detectNotebookLanguage({ cells: [{ cell_type: 'code', source: '%%python\n1 + 1' }] }), 'python');
});

test('cell insertion, duplication, movement, deletion, type, and source changes are immutable', () => {
  const first = createNotebookCell('code', ['value = 1\n'], {
    id: 'first',
    metadata: { tags: ['source'] },
    outputs: [createStreamOutput('old output\n')],
    executionCount: 1,
  });
  const second = createNotebookCell('markdown', '# Notes', { id: 'second' });
  const base = createPythonNotebook({ cells: [first, second] });

  const inserted = insertNotebookCell(base, 1, createNotebookCell('raw', 'raw text', { id: 'raw' }));
  assert.deepEqual(base.cells.map(cell => cell.id), ['first', 'second']);
  assert.deepEqual(inserted.cells.map(cell => cell.id), ['first', 'raw', 'second']);

  const duplicate = duplicateNotebookCell(inserted, 'first');
  assert.equal(duplicate.cells.length, 4);
  assert.notEqual(duplicate.cells[1].id, 'first');
  assert.deepEqual(duplicate.cells[1].metadata, first.metadata);
  assert.deepEqual(duplicate.cells[1].outputs, first.outputs);
  assert.notEqual(duplicate.cells[1].metadata, first.metadata);
  assert.notEqual(duplicate.cells[1].outputs, first.outputs);

  const moved = moveNotebookCell(duplicate, 'second', 0);
  assert.equal(moved.cells[0].id, 'second');
  assert.deepEqual(duplicate.cells.map(cell => cell.id), ['first', duplicate.cells[1].id, 'raw', 'second']);

  const sourceChanged = setNotebookCellSource(moved, 'first', 'value = 2\nprint(value)');
  assert.ok(Array.isArray(sourceChanged.cells.find(cell => cell.id === 'first').source));
  assert.equal(notebookSourceToString(sourceChanged.cells.find(cell => cell.id === 'first').source), 'value = 2\nprint(value)');
  assert.equal(notebookSourceToString(moved.cells.find(cell => cell.id === 'first').source), 'value = 1\n');

  const stringBackedSource = setNotebookCellSource(
    sourceChanged,
    'first',
    'value = 2\nprint(value)',
    { preserveRepresentation: false },
  );
  assert.equal(stringBackedSource.cells.find(cell => cell.id === 'first').source, 'value = 2\nprint(value)');

  const markdown = setNotebookCellType(sourceChanged, 'first', 'markdown');
  const converted = markdown.cells.find(cell => cell.id === 'first');
  assert.equal(converted.cell_type, 'markdown');
  assert.equal('outputs' in converted, false);
  assert.equal('execution_count' in converted, false);

  const codeAgain = setNotebookCellType(markdown, 'first', 'code');
  const restoredCode = codeAgain.cells.find(cell => cell.id === 'first');
  assert.equal(restoredCode.cell_type, 'code');
  assert.deepEqual(restoredCode.outputs, []);
  assert.equal(restoredCode.execution_count, null);

  const deleted = deleteNotebookCell(codeAgain, 'raw');
  assert.equal(deleted.cells.some(cell => cell.id === 'raw'), false);
  assert.equal(deleteNotebookCell(deleted, 'missing'), deleted, 'missing-cell edits are cheap no-ops');
});

test('output constructors and immutable output operations cover nbformat standard output kinds', () => {
  const stream = createStreamOutput(['hello\n'], 'stdout', { custom: 1 });
  const display = createDisplayDataOutput(
    { 'text/html': '<strong>Hello</strong>', 'image/png': 'base64' },
    { isolated: true },
    { transient: { display_id: 'x' } }
  );
  const result = createExecuteResultOutput({ 'text/plain': '4' }, 2, { expanded: true });
  const error = createErrorOutput('RuntimeError', 'failed', ['trace\n']);

  assert.equal(stream.output_type, 'stream');
  assert.equal(display.output_type, 'display_data');
  assert.equal(result.output_type, 'execute_result');
  assert.equal(error.output_type, 'error');

  const notebook = createPythonNotebook();
  const cellId = notebook.cells[0].id;
  const set = setNotebookCellOutputs(notebook, cellId, [stream, display, result], 2);
  assert.equal(set.cells[0].outputs.length, 3);
  assert.equal(set.cells[0].execution_count, 2);
  assert.deepEqual(notebook.cells[0].outputs, []);

  const appended = appendNotebookCellOutput(set, cellId, error);
  assert.equal(appended.cells[0].outputs.length, 4);
  assert.equal(set.cells[0].outputs.length, 3);

  const recounted = setNotebookCellExecutionCount(appended, cellId, 8);
  assert.equal(recounted.cells[0].execution_count, 8);

  const clearedOne = clearNotebookCellOutputs(recounted, cellId);
  assert.deepEqual(clearedOne.cells[0].outputs, []);
  assert.equal(clearedOne.cells[0].execution_count, null);

  const twoCells = insertNotebookCell(
    setNotebookCellOutputs(clearedOne, cellId, [stream], 1),
    1,
    createNotebookCell('code', '', { outputs: [error], executionCount: 2 })
  );
  const clearedAll = clearNotebookCellOutputs(twoCells);
  assert.ok(clearedAll.cells.every(cell => cell.cell_type !== 'code' || (cell.outputs.length === 0 && cell.execution_count === null)));
});
