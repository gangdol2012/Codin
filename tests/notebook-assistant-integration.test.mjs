import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const appSource = await readFile(new URL('../src/App.tsx', import.meta.url), 'utf8');

function sliceBetween(startMarker, endMarker, label = startMarker) {
  const start = appSource.indexOf(startMarker);
  assert.notEqual(start, -1, `missing ${label} start marker`);
  const end = appSource.indexOf(endMarker, start + startMarker.length);
  assert.notEqual(end, -1, `missing ${label} end marker`);
  return appSource.slice(start, end);
}

function occurrences(source, value) {
  return source.split(value).length - 1;
}

const expectedNotebookActions = [
  'show',
  'validate',
  'set-source',
  'add',
  'delete',
  'move',
  'set-type',
  'duplicate',
  'clear-outputs',
  'set-language',
];

test('notebook tool declares the complete cell-aware schema and is exposed in both tool sets', () => {
  const tool = sliceBetween(
    'const notebookTool: AssistantToolDefinition = {',
    'const lsTool: AssistantToolDefinition = {',
    'notebook tool',
  );
  const actionProperty = tool.slice(tool.indexOf('action: {'), tool.indexOf('path: {'));
  const actionEnum = actionProperty.match(/enum:\s*\[([^\]]+)\]/);

  assert.match(tool, /name:\s*["']notebook["']/);
  assert.match(tool, /\.ipynb/);
  assert.match(tool, /stable cell IDs/);
  assert.ok(actionEnum, 'notebook action enum must be declared');
  assert.deepEqual(
    [...actionEnum[1].matchAll(/'([^']+)'/g)].map(match => match[1]),
    expectedNotebookActions,
  );
  assert.match(tool, /source:\s*\{[\s\S]*Exact cell source[\s\S]*without shell escaping/);
  assert.match(tool, /required:\s*\[['"]action['"],\s*['"]path['"]\]/);

  const standardTools = sliceBetween(
    'const STANDARD_ASSISTANT_TOOLS: AssistantToolDefinition[] = [',
    'const CHAIN_OF_THOUGHT_ASSISTANT_TOOLS: AssistantToolDefinition[] = [',
    'standard assistant tools',
  );
  const chainTools = sliceBetween(
    'const CHAIN_OF_THOUGHT_ASSISTANT_TOOLS: AssistantToolDefinition[] = [',
    '// Utility for tailwind classes',
    'chain-of-thought assistant tools',
  );
  assert.equal(occurrences(standardTools, 'notebookTool'), 1);
  assert.equal(occurrences(chainTools, 'notebookTool'), 1);
});

test('Cursor normalizes notebook aliases and arguments while preserving the notebook bridge exception', () => {
  const names = sliceBetween(
    'function normalizeCursorLocalToolName',
    'function normalizeCursorLocalToolArgs',
    'Cursor tool-name normalization',
  );
  for (const alias of ['notebook', 'notebookcommand', 'editnotebook', 'ipynb']) {
    assert.match(names, new RegExp(`case '${alias}':`));
  }
  assert.match(names, /case 'ipynb':\s*return 'notebook';/);

  const args = sliceBetween(
    'function normalizeCursorLocalToolArgs',
    'function normalizeCursorLocalToolCall',
    'Cursor tool-argument normalization',
  );
  assert.match(args, /if \(toolName === 'notebook'\)/);
  assert.match(args, /hasOwnProperty\.call\(source, key\)/);
  assert.match(args, /cellAlias \? \{ cell: source\[cellAlias\] \} : \{\}/);
  for (const property of ['action', 'path', 'cell', 'source', 'cellType', 'index', 'language']) {
    assert.match(args, new RegExp(`\\b${property}:`));
  }
  assert.match(args, /pathOrName/);
  assert.match(args, /cellId/);
  assert.match(args, /targetIndex/);

  const bridge = sliceBetween(
    'function buildCursorLocalToolBridgeInstruction',
    'function calculateAssistantPaidCostUsd',
    'Cursor local-tool bridge',
  );
  assert.match(bridge, /regular text source file[\s\S]*proposeEdit/);
  assert.match(bridge, /\.ipynb file[\s\S]*notebook tool/);
  assert.match(bridge, /without replacing raw JSON/);
});

test('shared notebook workspace executor commits only successful changes through its host', () => {
  const executor = sliceBetween(
    'function executeNotebookWorkspaceRequest',
    'function normalizeRuntimeWorkspacePath',
    'shared notebook workspace executor',
  );
  assert.match(executor, /const isReadOnly = request\.command === 'show' \|\| request\.command === 'validate'/);
  assert.match(executor, /const items = isReadOnly \? host\.getCurrentItems\(\) : host\.items/);
  assert.match(executor, /resolveNotebookWorkspaceFile\(items, host\.cwdId, requestedPath\)/);
  assert.match(executor, /executeNotebookRequest\(resolution\.item\.content \|\| '', request/);
  assert.match(executor, /if \(result\.ok && !isReadOnly\)/);
  assert.match(executor, /applyNotebookWorkspaceContentUpdate\(/);
  assert.match(executor, /host\.getCurrentItems\(\)/);
  assert.match(executor, /resolution\.item\.content \|\| ''/);
  assert.match(executor, /if \(update\.ok === false\)/);
  assert.match(executor, /code: 'conflict'/);
  assert.match(executor, /if \(update\.changed\) host\.updateItems\(update\.items\)/);
  assert.match(executor, /host\.writeTerminalResult\(displayedCommand, result\.lines\)/);
});

test('assistant notebook dispatcher commits against live refs from its model-visible snapshot', () => {
  const dispatcher = sliceBetween(
    "if (call.name === 'notebook') {",
    "if (call.name === 'runTerminalCommand') {",
    'assistant notebook dispatcher',
  );
  assert.match(dispatcher, /parseNotebookAssistantRequest\(args\)/);
  assert.match(dispatcher, /result:\s*\{ ok: false, error: parsed\.error \}/);
  assert.match(dispatcher, /terminalOutputRef\.current/);
  assert.match(dispatcher, /executeNotebookWorkspaceRequest\(\{/);
  assert.match(dispatcher, /items:\s*assistantFiles/);
  assert.match(dispatcher, /getCurrentItems:\s*\(\) => filesRef\.current/);
  assert.match(dispatcher, /cwdId:\s*assistantTerminalCwd/);
  assert.match(dispatcher, /updateItems:\s*updateAssistantFiles/);
  assert.match(dispatcher, /writeTerminalResult:\s*appendTerminalCommandResult/);
  assert.match(dispatcher, /ok:\s*notebookResult\.ok/);
  assert.match(dispatcher, /changed:\s*notebookResult\.changed/);
  assert.match(dispatcher, /path:\s*notebookResult\.path \|\| parsed\.path/);
  assert.match(dispatcher, /command:\s*notebookResult\.command \|\| parsed\.request\.command/);
  assert.match(dispatcher, /lines:\s*notebookResult\.lines/);
  assert.match(dispatcher, /notebookResult\.error \? \{ error: notebookResult\.error \}/);
  assert.match(dispatcher, /assistantFiles = filesRef\.current\.map/);
  assert.match(dispatcher, /assistantTerminalCwd = terminalCwdRef\.current/);
  assert.match(dispatcher, /assistantTerminalOutput = terminalOutputRef\.current\.slice/);
});

test('Terminal notebook and ipynb commands use refs and the shared notebook executor', () => {
  const terminal = sliceBetween(
    "} else if (cmd === 'notebook' || cmd === 'ipynb') {",
    "} else if (cmd === 'pip') {",
    'Terminal notebook dispatcher',
  );
  assert.match(terminal, /parseNotebookCliArgs\(args\)/);
  assert.match(terminal, /filesRef\.current/);
  assert.match(terminal, /terminalCwdRef\.current/);
  assert.match(terminal, /terminalOutputRef\.current/);
  assert.match(terminal, /executeNotebookWorkspaceRequest\(\{/);
  assert.match(terminal, /items:\s*filesRef\.current/);
  assert.match(terminal, /getCurrentItems:\s*\(\) => filesRef\.current/);
  assert.match(terminal, /cwdId:\s*terminalCwdRef\.current/);
  assert.match(terminal, /filesRef\.current = nextItems/);
  assert.match(terminal, /setFiles\(nextItems\)/);
  assert.match(terminal, /ok:\s*notebookResult\.ok/);
  assert.match(terminal, /changed:\s*notebookResult\.changed/);
  assert.match(terminal, /path:\s*notebookResult\.path/);
});

test('proposeEdit rejects raw notebook replacement before enqueueing an edit', () => {
  const proposeEdit = sliceBetween(
    "if (call.name === 'proposeEdit') {",
    "if (call.name === 'navigateTo') {",
    'proposeEdit dispatcher',
  );
  const rejection = proposeEdit.indexOf('if (isNotebookFileItem(targetFile))');
  const enqueue = proposeEdit.indexOf('enqueuePendingEdit({');

  assert.notEqual(rejection, -1);
  assert.notEqual(enqueue, -1);
  assert.ok(rejection < enqueue, 'notebook rejection must happen before pending-edit enqueue');
  assert.match(proposeEdit, /Rejected raw JSON replacement/);
  assert.match(proposeEdit, /Notebook files must be edited with the notebook tool/);
  assert.match(proposeEdit, /result:\s*\{[\s\S]*ok:\s*false/);
});

test('both AI and interactive cat paths project notebook cells instead of raw JSON', () => {
  const assistantCat = sliceBetween(
    "if (call.name === 'terminalCat') {",
    "if (call.name === 'terminalRm') {",
    'assistant cat dispatcher',
  );
  assert.match(assistantCat, /isNotebookFileItem\(target\)/);
  assert.match(assistantCat, /formatNotebookForAssistant\(target\.content \|\| '', \{ path: targetPath \}\)/);
  assert.match(assistantCat, /without exposing raw JSON/);

  const terminalCat = sliceBetween(
    "} else if (cmd === 'cat') {",
    "} else if (cmd === 'rm') {",
    'interactive cat dispatcher',
  );
  assert.match(terminalCat, /filesRef\.current/);
  assert.match(terminalCat, /isNotebookFileItem\(file\)/);
  assert.match(terminalCat, /formatNotebookForAssistant\(file\.content \|\| '', \{ path \}\)/);
  assert.doesNotMatch(terminalCat, /setTerminalOutput\(\[\.\.\.newOutput, file\.content/);
});

test('assistant prompt contexts format notebooks instead of embedding raw JSON', () => {
  assert.match(
    appSource,
    /formatNotebookForAssistant[\s\S]*from '\.\/notebook-cli'/,
    'App must import the notebook prompt formatter',
  );

  const attachments = sliceBetween(
    'function formatAssistantAttachmentPromptSection',
    'function readDataTransferDirectoryEntries',
    'assistant attachment formatter',
  );
  assert.match(attachments, /isNotebookPath\(file\.path\)/);
  assert.match(attachments, /formatNotebookForAssistant\(file\.content \|\| '', \{ path: file\.path \}\)/);

  const prompt = sliceBetween(
    'function buildAssistantPromptFromSnapshot',
    'function revokeOutputPreviewUrls',
    'assistant prompt builder',
  );
  assert.match(prompt, /isNotebookPath\(activeSnapshotPath\)[\s\S]*formatNotebookForAssistant\(activeSnapshotItem\.content \|\| '', \{ path: activeSnapshotPath \}\)/);
  assert.match(prompt, /isNotebookPath\(path\)[\s\S]*formatNotebookForAssistant\(content, \{ path \}\)/);
  assert.match(prompt, /Active file content:\\n\$\{activeSnapshotVisibleContent\}/);
  assert.match(prompt, /Content:\\n\$\{activeSnapshotVisibleContent\}/);
  assert.doesNotMatch(prompt, /Active file content:\\n\$\{activeSnapshotItem\.content/);
  assert.match(prompt, /hasAssistantTools \? 'Jupyter notebook rule:/);
  assert.match(prompt, /Never use proposeEdit, terminalCat, or raw JSON replacement for a \.ipynb file/);
});

test('assistant and interactive Terminal help both expose the shared notebook usage', () => {
  const assistantHelp = sliceBetween(
    "if (call.name === 'terminalHelp') {",
    "if (call.name === 'terminalDate') {",
    'assistant Terminal help',
  );
  const interactiveHelp = sliceBetween(
    "} else if (cmd === 'help') {",
    "} else if (cmd === 'date') {",
    'interactive Terminal help',
  );

  for (const help of [assistantHelp, interactiveHelp]) {
    assert.match(help, /Jupyter notebooks:/);
    assert.match(help, /\.\.\.NOTEBOOK_CLI_USAGE_LINES/);
  }
});
