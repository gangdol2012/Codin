export type TerminalArgsParseResult =
  | { ok: true; args: string[] }
  | { ok: false; error: string };

/**
 * Tokenizes CodeCraft's deliberately small, shell-like Terminal syntax.
 * Double-quoted notebook --source-escaped values retain backslashes for their
 * deliberate decode pass; ordinary quoted arguments keep the prior unescaping.
 */
export function tryParseTerminalArgs(input: string): TerminalArgsParseResult {
  const args: string[] = [];
  let token = '';
  let tokenStarted = false;
  let quote: 'single' | 'double' | null = null;
  let preserveDoubleQuotedBackslashes = false;

  const finishToken = () => {
    if (!tokenStarted) return;
    args.push(token);
    token = '';
    tokenStarted = false;
    preserveDoubleQuotedBackslashes = false;
  };

  for (let index = 0; index < input.length; index += 1) {
    const character = input[index];

    if (quote === 'single') {
      if (character === "'") {
        quote = null;
      } else if (character === '\\' && input[index + 1] === "'") {
        token += "'";
        index += 1;
      } else {
        token += character;
      }
      continue;
    }

    if (quote === 'double') {
      if (character === '"') {
        quote = null;
      } else if (character === '\\' && input[index + 1] === '"') {
        token += '"';
        index += 1;
      } else if (
        character === '\\'
        && input[index + 1] === '\\'
        && !preserveDoubleQuotedBackslashes
      ) {
        token += '\\';
        index += 1;
      } else {
        // Preserve encoded source escapes (including doubled backslashes) for
        // the notebook command's single, deliberate decoding pass.
        token += character;
      }
      continue;
    }

    if (/\s/.test(character)) {
      finishToken();
      continue;
    }
    tokenStarted = true;
    if (character === "'") {
      quote = 'single';
      continue;
    }
    if (character === '"') {
      quote = 'double';
      preserveDoubleQuotedBackslashes = args[args.length - 1] === '--source-escaped';
      continue;
    }
    if (character === '\\' && index + 1 < input.length && /\s/.test(input[index + 1])) {
      token += input[index + 1];
      index += 1;
      continue;
    }
    token += character;
  }

  if (quote) {
    return { ok: false, error: `terminal: unterminated ${quote}-quoted argument` };
  }
  finishToken();
  return { ok: true, args };
}

export function parseTerminalArgs(input: string): string[] {
  const parsed = tryParseTerminalArgs(input);
  if (parsed.ok === false) throw new SyntaxError(parsed.error);
  return parsed.args;
}
