import assert from 'node:assert/strict';
import test from 'node:test';

import {
  NOTEBOOK_CLI_USAGE,
  executeNotebookCli,
  executeNotebookRequest,
  formatNotebookForAssistant,
  parseNotebookCliArgs,
} from '../src/notebook-cli.ts';
import {
  detectNotebookLanguage,
  notebookSourceToString,
  parseNotebook,
} from '../src/notebook-model.ts';
import { parseTerminalArgs, tryParseTerminalArgs } from '../src/terminal-args.ts';

function fixtureNotebookText() {
  return `${JSON.stringify({
    cells: [
      {
        id: 'code-cell',
        cell_type: 'code',
        execution_count: 7,
        metadata: { tags: ['keep'], vendor_cell: { untouched: true } },
        outputs: [
          {
            output_type: 'execute_result',
            execution_count: 7,
            data: { 'text/plain': ['old result'], 'application/vnd.vendor+json': { keep: true } },
            metadata: { expanded: true },
            vendor_output: 'preserve',
          },
        ],
        source: ['value = 1\n', 'value'],
        vendor_code_field: { keep: 1 },
      },
      {
        id: 'notes-cell',
        cell_type: 'markdown',
        metadata: { editable: false },
        source: '# Notes\n\nOriginal text',
        attachments: { 'pixel.png': { 'image/png': 'base64-payload-not-for-assistant-view' } },
        vendor_markdown_field: 9,
      },
      {
        id: 'raw-cell',
        cell_type: 'raw',
        metadata: {},
        source: 'raw payload',
      },
    ],
    metadata: {
      kernelspec: { display_name: 'Python 3', language: 'python', name: 'python3' },
      language_info: { name: 'python' },
      vendor_notebook: { preserve: ['all', 'of', 'this'] },
    },
    nbformat: 4,
    nbformat_minor: 5,
    vendor_root_field: { owner: 'another-client' },
  }, null, 2)}\n`;
}

test('show and assistant formatting expose readable cells without dumping notebook JSON or outputs', () => {
  const original = fixtureNotebookText();
  const shown = executeNotebookRequest(original, { command: 'show' }, { path: 'lab/demo.ipynb' });

  assert.equal(shown.ok, true);
  assert.equal(shown.changed, false);
  assert.equal(shown.content, original);
  assert.match(shown.lines.join('\n'), /Cell #1 \| id=code-cell \| type=code/);
  assert.match(shown.lines.join('\n'), /value = 1/);
  assert.match(shown.lines.join('\n'), /Cell #2 \| id=notes-cell \| type=markdown/);
  assert.doesNotMatch(shown.lines.join('\n'), /base64-payload|vendor_output/);

  const onlyNotes = executeNotebookRequest(original, { command: 'show', cell: '#2' }, { path: 'lab/demo.ipynb' });
  assert.equal(onlyNotes.ok, true);
  assert.equal(onlyNotes.cellId, 'notes-cell');
  assert.match(onlyNotes.lines.join('\n'), /Original text/);
  assert.doesNotMatch(onlyNotes.lines.join('\n'), /value = 1/);

  const assistantView = formatNotebookForAssistant(original, { path: 'lab/demo.ipynb' });
  assert.match(assistantView, /<jupyter_notebook path="lab\/demo\.ipynb">/);
  assert.match(assistantView, /Cell #3 \| id=raw-cell \| type=raw/);
  assert.doesNotMatch(assistantView, /"cells"\s*:/);
  assert.doesNotMatch(assistantView, /base64-payload|vendor_root_field/);

  const invalidView = formatNotebookForAssistant('{"secret_raw_json": true', { path: 'broken.ipynb' });
  assert.match(invalidView, /could not be parsed/);
  assert.match(invalidView, /Raw notebook JSON omitted/);
  assert.doesNotMatch(invalidView, /secret_raw_json/);

  const secretSyntax = '{"cells":[TOP_SECRET_123],"metadata":{},"nbformat":4,"nbformat_minor":5}';
  const invalidResult = executeNotebookRequest(secretSyntax, { command: 'validate' });
  assert.equal(invalidResult.ok, false);
  assert.match(invalidResult.error.message, /not valid JSON/);
  assert.doesNotMatch(invalidResult.lines.join('\n'), /TOP_SECRET_123/);
  assert.doesNotMatch(formatNotebookForAssistant(secretSyntax), /TOP_SECRET_123/);
});

test('set-source round-trips exact multiline tool text while preserving representation, outputs, and extension data', () => {
  const original = fixtureNotebookText();
  const source = 'title = "안녕하세요"\npath = r"C:\\\\temp\\\\file.txt"\nprint("literal \\\\n stays literal")\n\n\t# tab-indented comment';
  const edited = executeNotebookRequest(original, {
    command: 'set-source',
    cell: 'code-cell',
    source,
  }, { path: 'lab/demo.ipynb' });

  assert.equal(edited.ok, true);
  assert.equal(edited.changed, true);
  assert.equal(edited.cellId, 'code-cell');
  const notebook = parseNotebook(edited.content);
  const code = notebook.cells.find(cell => cell.id === 'code-cell');
  assert.ok(Array.isArray(code.source), 'array-backed Jupyter source remains array-backed');
  assert.equal(notebookSourceToString(code.source), source);
  assert.equal(code.execution_count, 7);
  assert.equal(code.outputs[0].vendor_output, 'preserve');
  assert.deepEqual(code.outputs[0].data['application/vnd.vendor+json'], { keep: true });
  assert.deepEqual(code.metadata.vendor_cell, { untouched: true });
  assert.deepEqual(code.vendor_code_field, { keep: 1 });
  assert.deepEqual(notebook.metadata.vendor_notebook, { preserve: ['all', 'of', 'this'] });
  assert.deepEqual(notebook.vendor_root_field, { owner: 'another-client' });
  assert.deepEqual(notebook.cells.find(cell => cell.id === 'notes-cell').attachments, {
    'pixel.png': { 'image/png': 'base64-payload-not-for-assistant-view' },
  });

  const repeated = executeNotebookRequest(edited.content, {
    command: 'set-source',
    cell: 'code-cell',
    source,
  });
  assert.equal(repeated.ok, true);
  assert.equal(repeated.changed, false);
  assert.equal(repeated.content, edited.content, 'semantic no-op keeps serialized text byte-for-byte unchanged');
});

test('structural cell operations accept stable IDs and explicit 1-based positions', () => {
  const original = fixtureNotebookText();
  const added = executeNotebookRequest(original, {
    command: 'add',
    cellType: 'markdown',
    source: 'Inserted **cell**',
    index: 2,
  });
  assert.equal(added.ok, true);
  const addedNotebook = parseNotebook(added.content);
  assert.equal(addedNotebook.cells[1].id, added.cellId);
  assert.equal(addedNotebook.cells[1].cell_type, 'markdown');

  const moved = executeNotebookRequest(added.content, {
    command: 'move',
    cell: 'raw-cell',
    index: 1,
  });
  assert.equal(parseNotebook(moved.content).cells[0].id, 'raw-cell');

  const duplicated = executeNotebookRequest(moved.content, {
    command: 'duplicate',
    cell: 'code-cell',
    index: 2,
  });
  const duplicatedNotebook = parseNotebook(duplicated.content);
  assert.notEqual(duplicated.cellId, 'code-cell');
  assert.equal(duplicatedNotebook.cells[1].id, duplicated.cellId);
  assert.equal(notebookSourceToString(duplicatedNotebook.cells[1].source), 'value = 1\nvalue');
  assert.equal(duplicatedNotebook.cells[1].outputs[0].vendor_output, 'preserve');

  const retyped = executeNotebookRequest(duplicated.content, {
    command: 'set-type',
    cell: duplicated.cellId,
    cellType: 'raw',
  });
  const retypedCell = parseNotebook(retyped.content).cells.find(cell => cell.id === duplicated.cellId);
  assert.equal(retypedCell.cell_type, 'raw');
  assert.equal('outputs' in retypedCell, false);
  assert.equal('execution_count' in retypedCell, false);

  const deleted = executeNotebookRequest(retyped.content, { command: 'delete', cell: '#1' });
  assert.equal(parseNotebook(deleted.content).cells.some(cell => cell.id === 'raw-cell'), false);
  assert.ok(parseNotebook(deleted.content).cells.some(cell => cell.id === 'code-cell'), 'unrelated stable IDs survive reordering and deletion');
});

test('output clearing and language updates target only the requested notebook fields', () => {
  const original = fixtureNotebookText();
  const cleared = executeNotebookRequest(original, { command: 'clear-outputs', cell: 'code-cell' });
  const clearedNotebook = parseNotebook(cleared.content);
  const code = clearedNotebook.cells.find(cell => cell.id === 'code-cell');
  assert.deepEqual(code.outputs, []);
  assert.equal(code.execution_count, null);
  assert.deepEqual(code.metadata.vendor_cell, { untouched: true });
  assert.equal(clearedNotebook.cells.find(cell => cell.id === 'notes-cell').source, '# Notes\n\nOriginal text');

  const csharp = executeNotebookRequest(cleared.content, { command: 'set-language', language: 'csharp' });
  const csharpNotebook = parseNotebook(csharp.content);
  assert.equal(detectNotebookLanguage(csharpNotebook), 'csharp');
  assert.deepEqual(csharpNotebook.metadata.vendor_notebook, { preserve: ['all', 'of', 'this'] });

  const csharpAgain = executeNotebookRequest(csharp.content, { command: 'set-language', language: 'csharp' });
  assert.equal(csharpAgain.ok, true);
  assert.equal(csharpAgain.changed, false);
  assert.equal(csharpAgain.content, csharp.content);
  assert.match(csharpAgain.lines.join('\n'), /already configured/);

  const clearedAgain = executeNotebookRequest(csharp.content, { command: 'clear-outputs' });
  assert.equal(clearedAgain.ok, true);
  assert.equal(clearedAgain.changed, false);
  assert.equal(clearedAgain.content, csharp.content);
});

test('invalid notebooks, selectors, indexes, and operations fail atomically', () => {
  const original = fixtureNotebookText();
  const cases = [
    executeNotebookRequest(original, { command: 'set-source', cell: 'missing-cell', source: 'x' }),
    executeNotebookRequest(original, { command: 'show', cell: '2' }),
    executeNotebookRequest(original, { command: 'move', cell: 'code-cell', index: 99 }),
    executeNotebookRequest(original, { command: 'clear-outputs', cell: 'notes-cell' }),
    executeNotebookRequest('{not json', { command: 'validate' }),
  ];

  for (const result of cases) {
    assert.equal(result.ok, false);
    assert.equal(result.changed, false);
  }
  assert.equal(cases[0].content, original);
  assert.equal(cases[1].content, original);
  assert.match(cases[1].error.message, /cell ID '2' was not found/);
  assert.equal(cases[2].content, original);
  assert.equal(cases[3].content, original);
  assert.equal(cases[4].content, '{not json');

  const numericIdNotebook = JSON.stringify({
    cells: [{ id: '2', cell_type: 'raw', metadata: {}, source: 'numeric stable id' }],
    metadata: {},
    nbformat: 4,
    nbformat_minor: 5,
  });
  const numericId = executeNotebookRequest(numericIdNotebook, { command: 'show', cell: '2' });
  assert.equal(numericId.ok, true, 'an existing numeric string remains a valid stable cell ID');
  assert.equal(numericId.cellId, '2');
});

test('CLI parsing and execution share the structured command engine', () => {
  const source = 'first line\n"quoted" \\\\ slash\n마지막 줄';
  const parsed = parseNotebookCliArgs([
    'notebook',
    'set-source',
    'folder/my notebook.ipynb',
    '#1',
    '--source',
    source,
  ]);
  assert.equal(parsed.ok, true);
  assert.deepEqual(parsed.invocation, {
    path: 'folder/my notebook.ipynb',
    request: { command: 'set-source', cell: '#1', source },
  });

  const executed = executeNotebookCli(fixtureNotebookText(), [
    'edit',
    'folder/my notebook.ipynb',
    'code-cell',
    '--source',
    source,
  ]);
  assert.equal(executed.ok, true);
  assert.equal(notebookSourceToString(parseNotebook(executed.content).cells[0].source), source);

  const missingSource = parseNotebookCliArgs(['set-source', 'demo.ipynb', '#1']);
  assert.equal(missingSource.ok, false);
  assert.match(missingSource.lines.join('\n'), /requires --source or --source-escaped/);

  const oneLineTerminalCommand = String.raw`notebook set-source "folder/my notebook.ipynb" '#1' --source-escaped 'first\nprint("x")\npath = r"C:\\temp"\nliteral = "\\n"'`;
  const terminalArgs = parseTerminalArgs(oneLineTerminalCommand);
  const escaped = parseNotebookCliArgs(terminalArgs);
  const decodedSource = 'first\nprint("x")\npath = r"C:\\temp"\nliteral = "\\n"';
  assert.equal(escaped.ok, true);
  assert.equal(escaped.invocation.request.source, decodedSource);
  const escapedExecution = executeNotebookCli(fixtureNotebookText(), terminalArgs);
  assert.equal(notebookSourceToString(parseNotebook(escapedExecution.content).cells[0].source), decodedSource);

  const doubleQuotedCommand = String.raw`notebook set-source demo.ipynb '#1' --source-escaped "path = C:\\temp\\file\nprint(path)"`;
  const doubleQuotedExecution = executeNotebookCli(fixtureNotebookText(), parseTerminalArgs(doubleQuotedCommand));
  assert.equal(doubleQuotedExecution.ok, true);
  assert.equal(
    notebookSourceToString(parseNotebook(doubleQuotedExecution.content).cells[0].source),
    'path = C:\\temp\\file\nprint(path)',
  );

  for (const conflicting of [
    ['set-source', 'demo.ipynb', '#1', '--source', 'kept', 'dropped'],
    ['add', 'demo.ipynb', 'code', '--source', 'kept', 'dropped'],
    ['move', 'demo.ipynb', '#1', '2', '--index', '3'],
    ['duplicate', 'demo.ipynb', '#1', '2', '--index', '3'],
    ['set-source', 'demo.ipynb', '#1', '--source', 'a', '--source-escaped', 'b'],
  ]) {
    const conflict = parseNotebookCliArgs(conflicting);
    assert.equal(conflict.ok, false, `conflicting arguments must fail: ${conflicting.join(' ')}`);
  }
  assert.match(NOTEBOOK_CLI_USAGE, /notebook show/);
  assert.match(NOTEBOOK_CLI_USAGE, /source-escaped/);
  assert.match(NOTEBOOK_CLI_USAGE, /1-based/);
});

test('Terminal tokenization handles escaped spaces and rejects unterminated quotes', () => {
  assert.deepEqual(parseTerminalArgs(String.raw`notebook show folder/my\ notebook.ipynb`), [
    'notebook',
    'show',
    'folder/my notebook.ipynb',
  ]);
  assert.deepEqual(parseTerminalArgs(String.raw`open "C:\\temp\\file.ipynb"`), [
    'open',
    'C:\\temp\\file.ipynb',
  ], 'ordinary JSON-quoted Terminal arguments retain the existing single unescape pass');
  const unterminated = tryParseTerminalArgs("notebook set-source demo.ipynb '#1' --source 'oops");
  assert.equal(unterminated.ok, false);
  assert.match(unterminated.error, /unterminated single-quoted argument/);
  assert.throws(
    () => parseTerminalArgs("notebook set-source demo.ipynb '#1' --source 'oops"),
    /unterminated single-quoted argument/,
  );
});

test('clear-outputs treats a stable cell ID named all as a cell, not a global alias', () => {
  const original = `${JSON.stringify({
    cells: [
      { id: 'all', cell_type: 'code', metadata: {}, source: 'first', execution_count: 1, outputs: [{ output_type: 'stream', name: 'stdout', text: 'first' }] },
      { id: 'other', cell_type: 'code', metadata: {}, source: 'second', execution_count: 2, outputs: [{ output_type: 'stream', name: 'stdout', text: 'second' }] },
    ],
    metadata: {},
    nbformat: 4,
    nbformat_minor: 5,
  })}\n`;
  const result = executeNotebookCli(original, ['clear-outputs', 'demo.ipynb', 'all']);
  assert.equal(result.ok, true);
  const notebook = parseNotebook(result.content);
  assert.deepEqual(notebook.cells[0].outputs, []);
  assert.equal(notebook.cells[1].outputs.length, 1);
});

test('legacy pre-nbformat-4 notebooks are rejected without creating a hybrid document', () => {
  const legacy = `${JSON.stringify({
    nbformat: 3,
    nbformat_minor: 0,
    metadata: { legacy: true },
    worksheets: [{ cells: [{ cell_type: 'code', input: ['print(1)'], outputs: [] }] }],
  })}\n`;
  const result = executeNotebookRequest(legacy, {
    command: 'add',
    cellType: 'code',
    source: 'print(2)',
  });
  assert.equal(result.ok, false);
  assert.equal(result.changed, false);
  assert.equal(result.content, legacy);
  assert.match(result.error.message, /only nbformat 4 notebooks can be edited safely/);

  const validation = executeNotebookRequest(legacy, { command: 'validate' });
  assert.equal(validation.ok, false);
  assert.equal(validation.content, legacy);
  assert.equal(Object.hasOwn(JSON.parse(validation.content), 'cells'), false);
  assert.match(formatNotebookForAssistant(legacy), /could not be parsed/);
});

test('schema-invalid nbformat-4 notebooks fail validation and mutations atomically', () => {
  const malformedCases = [
    {
      label: 'non-array cells',
      notebook: { nbformat: 4, nbformat_minor: 5, metadata: {}, cells: { unexpected: [] } },
      message: /cells must be an array/,
    },
    {
      label: 'invalid cell source',
      notebook: {
        nbformat: 4,
        nbformat_minor: 5,
        metadata: {},
        cells: [{ id: 'valuable', cell_type: 'code', metadata: {}, source: { text: 'valuable' }, execution_count: null, outputs: [] }],
      },
      message: /source must be a string or an array of strings/,
    },
    {
      label: 'invalid outputs',
      notebook: {
        nbformat: 4,
        nbformat_minor: 5,
        metadata: {},
        cells: [{ id: 'valuable', cell_type: 'code', metadata: {}, source: 'valuable', execution_count: null, outputs: { hidden: true } }],
      },
      message: /outputs must be an array/,
    },
  ];

  for (const { label, notebook, message } of malformedCases) {
    const original = `${JSON.stringify(notebook)}\n`;
    for (const request of [
      { command: 'validate' },
      { command: 'add', cellType: 'code', source: 'print(2)' },
    ]) {
      const result = executeNotebookRequest(original, request);
      assert.equal(result.ok, false, `${label}: ${request.command} should fail`);
      assert.equal(result.changed, false);
      assert.equal(result.content, original);
      assert.match(result.error.message, message);
    }
  }
});
