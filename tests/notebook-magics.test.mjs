import assert from 'node:assert/strict';
import test from 'node:test';

import {
  NOTEBOOK_MAGIC_CATALOG,
  NOTEBOOK_MAGIC_HELP_TEXT,
  getNotebookMagicCatalog,
  getNotebookMagicHelpText,
  planNotebookCell,
  tokenizeMagicArguments,
} from '../src/notebook-magics.ts';

test('ordinary cells execute unchanged in their selected local script language', () => {
  const python = planNotebookCell('value = 41\nvalue + 1', 'python');
  assert.equal(python.kind, 'execute');
  assert.equal(python.language, 'python');
  assert.equal(python.code, 'value = 41\nvalue + 1');
  assert.equal(python.timing, null);
  assert.deepEqual(python.directives, []);

  const csharp = planNotebookCell('var value = 42;\nvalue', 'csharp');
  assert.equal(csharp.kind, 'execute');
  assert.equal(csharp.language, 'csharp');
  assert.equal(csharp.code, 'var value = 42;\nvalue');
});

test('IPython and .NET language switches choose Python/C# and compose with #!time', () => {
  const csharp = planNotebookCell('%%csharp\n#!time\nvar answer = 42;\nanswer', 'python');
  assert.equal(csharp.kind, 'execute');
  assert.equal(csharp.language, 'csharp');
  assert.equal(csharp.code, 'var answer = 42;\nanswer');
  assert.equal(csharp.timing.mode, 'time');
  assert.deepEqual(csharp.directives.map(directive => directive.raw), ['%%csharp', '#!time']);

  const python = planNotebookCell('#!python\nprint("hello")', 'csharp');
  assert.equal(python.kind, 'execute');
  assert.equal(python.language, 'python');
  assert.equal(python.code, 'print("hello")');

  const csAlias = planNotebookCell('#!cs\n1 + 1', 'python');
  assert.equal(csAlias.kind, 'execute');
  assert.equal(csAlias.language, 'csharp');
});

test('rich cell magics return explicit MIME render plans', () => {
  const cases = [
    ['%%html\n<strong>Hello</strong>', 'html', 'text/html', false],
    ['%%markdown\n# Hello', 'markdown', 'text/markdown', false],
    ['%%svg\n<svg></svg>', 'svg', 'image/svg+xml', false],
    ['%%latex\nx^2', 'latex', 'text/latex', false],
    ['%%javascript\nwindow.answer = 42;', 'javascript', 'application/javascript', true],
    ['#!html\n<em>Hi</em>', 'html', 'text/html', false],
    ['#!markdown\n**Hi**', 'markdown', 'text/markdown', false],
  ];

  for (const [source, format, mimeType, executeInFrontend] of cases) {
    const plan = planNotebookCell(source, 'python');
    assert.equal(plan.kind, 'render', source);
    assert.equal(plan.format, format, source);
    assert.equal(plan.mimeType, mimeType, source);
    assert.equal(plan.executeInFrontend, executeInFrontend, source);
    assert.ok(plan.content.length > 0, source);
  }
});

test('time, timeit, and capture produce structured execution modifiers', () => {
  const lineTime = planNotebookCell('%time sum(range(10))', 'python');
  assert.equal(lineTime.kind, 'execute');
  assert.equal(lineTime.code, 'sum(range(10))');
  assert.equal(lineTime.timing.mode, 'time');

  const cellTime = planNotebookCell('%%time\nvalue = 21\nvalue * 2', 'python');
  assert.equal(cellTime.kind, 'execute');
  assert.equal(cellTime.code, 'value = 21\nvalue * 2');
  assert.equal(cellTime.timing.mode, 'time');

  const lineTimeit = planNotebookCell('%timeit -n 5 -r 3 -q -o sum(range(100))', 'python');
  assert.equal(lineTimeit.kind, 'execute');
  assert.equal(lineTimeit.code, 'sum(range(100))');
  assert.deepEqual(
    {
      mode: lineTimeit.timing.mode,
      number: lineTimeit.timing.number,
      repeat: lineTimeit.timing.repeat,
      quiet: lineTimeit.timing.quiet,
      returnResult: lineTimeit.timing.returnResult,
    },
    { mode: 'timeit', number: 5, repeat: 3, quiet: true, returnResult: true }
  );

  const quotedTimeit = planNotebookCell('%timeit -n 2 print("hello world")', 'python');
  assert.equal(quotedTimeit.kind, 'execute');
  assert.equal(quotedTimeit.code, 'print("hello world")');

  const cellTimeit = planNotebookCell('%%timeit -n 2 --repeat=4\nMath.Sqrt(144);', 'csharp');
  assert.equal(cellTimeit.kind, 'execute');
  assert.equal(cellTimeit.language, 'csharp');
  assert.equal(cellTimeit.code, 'Math.Sqrt(144);');
  assert.equal(cellTimeit.timing.number, 2);
  assert.equal(cellTimeit.timing.repeat, 4);

  const capture = planNotebookCell('%%capture --no-stderr captured\nprint("hello")', 'python');
  assert.equal(capture.kind, 'execute');
  assert.deepEqual(capture.capture, {
    variable: 'captured',
    captureStdout: true,
    captureStderr: false,
    captureDisplay: true,
  });

  const invalidCapture = planNotebookCell('%%capture first second\nprint(1)', 'python');
  assert.equal(invalidCapture.kind, 'unsupported');
  assert.equal(invalidCapture.category, 'invalid-arguments');
});

test('writefile/file and workspace commands are planned without mutating the host', () => {
  const write = planNotebookCell('%%writefile "notes/hello world.txt"\nhello\nworld', 'python');
  assert.equal(write.kind, 'write-file');
  assert.equal(write.path, 'notes/hello world.txt');
  assert.equal(write.append, false);
  assert.equal(write.content, 'hello\nworld');

  const append = planNotebookCell('%%file -a log.txt\nnext line', 'csharp');
  assert.equal(append.kind, 'write-file');
  assert.equal(append.path, 'log.txt');
  assert.equal(append.append, true);

  const invalid = planNotebookCell('%%writefile\nmissing path', 'python');
  assert.equal(invalid.kind, 'unsupported');
  assert.equal(invalid.category, 'invalid-arguments');

  const commands = [
    ['%pwd', 'pwd', 'workspace'],
    ['%cd "folder with spaces"', 'cd', 'workspace'],
    ['%ls src', 'ls', 'workspace'],
    ['%env NAME=value', 'env', 'runtime'],
    ['%who', 'who', 'runtime'],
    ['%whos', 'whos', 'runtime'],
    ['%reset -f', 'reset', 'runtime'],
    ['%run scripts/main.py one two', 'run', 'workspace'],
    ['%load scripts/main.py', 'load', 'workspace'],
    ['%history -n 1-5', 'history', 'runtime'],
    ['%pinfo value', 'pinfo', 'runtime'],
    ['%lsmagic', 'lsmagic', 'ui-help'],
    ['%magic', 'magic', 'ui-help'],
    ['%quickref', 'quickref', 'ui-help'],
    ['%pip install numpy', 'pip', 'package-manager'],
    ['#!reset', 'reset', 'runtime'],
    ['#!lsmagic', 'lsmagic', 'ui-help'],
    ['#!who', 'who', 'runtime'],
    ['#!whos', 'whos', 'runtime'],
  ];

  for (const [source, command, disposition] of commands) {
    const plan = planNotebookCell(source, source.startsWith('#!') ? 'csharp' : 'python');
    assert.equal(plan.kind, 'command', source);
    assert.equal(plan.command, command, source);
    assert.equal(plan.disposition, disposition, source);
  }

  const run = planNotebookCell('%run "scripts/main file.py" one two', 'python');
  assert.deepEqual(run.details, { path: 'scripts/main file.py', argv: ['one', 'two'] });

  const env = planNotebookCell('%env NAME some value', 'python');
  assert.deepEqual(env.details, { action: 'set', name: 'NAME', value: 'some value' });
});

test('trailing question marks and matplotlib compatibility remain explicit', () => {
  const pinfo = planNotebookCell('some.module.value?', 'python');
  assert.equal(pinfo.kind, 'command');
  assert.equal(pinfo.command, 'pinfo');
  assert.deepEqual(pinfo.details, { target: 'some.module.value', detailLevel: 1 });

  const sourceInfo = planNotebookCell('some.module.value??', 'python');
  assert.equal(sourceInfo.kind, 'command');
  assert.deepEqual(sourceInfo.details, { target: 'some.module.value', detailLevel: 2 });

  const matplotlib = planNotebookCell('%matplotlib inline\nprint("after setup")', 'python');
  assert.equal(matplotlib.kind, 'command');
  assert.equal(matplotlib.support, 'compatibility');
  assert.equal(matplotlib.disposition, 'compatibility-noop');
  assert.equal(matplotlib.remainingCode, 'print("after setup")');

  const unavailableBackend = planNotebookCell('%matplotlib qt', 'python');
  assert.equal(unavailableBackend.kind, 'unsupported');
  assert.equal(unavailableBackend.category, 'unsupported-backend');
  assert.match(unavailableBackend.reason, /inline/);
});

test('shell, process, unavailable kernel, and polyglot directives never fall through to execution', () => {
  const cases = [
    ['!ls -la', 'python', 'shell-process'],
    ['!!pwd', 'python', 'shell-process'],
    ['%system uname -a', 'python', 'shell-process'],
    ['%sx ls', 'python', 'shell-process'],
    ['%%bash\necho hello', 'python', 'shell-process'],
    ['%%script node\nconsole.log(1)', 'python', 'shell-process'],
    ['#!pwsh\nGet-ChildItem', 'csharp', 'shell-process'],
    ['#!fsharp\n1 + 1', 'csharp', 'unavailable-language'],
    ['#!javascript\n1 + 1', 'csharp', 'unavailable-language'],
    ['#!sql\nselect 1', 'csharp', 'unavailable-language'],
    ['#!connect jupyter --kernel-name python', 'csharp', 'unavailable-polyglot'],
    ['#!share value --from csharp', 'csharp', 'unavailable-polyglot'],
    ['#!value --name x', 'csharp', 'unavailable-polyglot'],
    ['%unknown value', 'python', 'unknown-magic'],
    ['#!unknown value', 'csharp', 'unknown-magic'],
  ];

  for (const [source, language, category] of cases) {
    const plan = planNotebookCell(source, language);
    assert.equal(plan.kind, 'unsupported', source);
    assert.equal(plan.support, 'unsupported', source);
    assert.equal(plan.category, category, source);
    assert.ok(plan.reason.length > 20, source);
  }

  const csharpNegation = planNotebookCell('!flag', 'csharp');
  assert.equal(csharpNegation.kind, 'execute', 'C# unary ! must not be mistaken for an IPython shell escape');
});

test('argument tokenization and catalog/help exports are safe for UI use', () => {
  assert.deepEqual(
    tokenizeMagicArguments('install "package one" \'package two\' escaped\\ value'),
    ['install', 'package one', 'package two', 'escaped value']
  );

  assert.ok(NOTEBOOK_MAGIC_CATALOG.length >= 15);
  assert.ok(NOTEBOOK_MAGIC_CATALOG.some(entry => entry.forms.includes('%%python') && entry.support === 'supported'));
  assert.ok(NOTEBOOK_MAGIC_CATALOG.some(entry => entry.forms.includes('!COMMAND') && entry.support === 'unsupported'));
  assert.match(NOTEBOOK_MAGIC_HELP_TEXT, /CodeCraft notebook magics/);
  assert.match(NOTEBOOK_MAGIC_HELP_TEXT, /Recognized but unavailable/i);
  assert.match(getNotebookMagicHelpText('python'), /%pip/);
  assert.doesNotMatch(getNotebookMagicHelpText('csharp'), /%pip/);
  assert.ok(getNotebookMagicCatalog('python', false).every(entry => entry.support !== 'unsupported'));
});
