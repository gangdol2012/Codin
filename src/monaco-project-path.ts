/**
 * Monaco's Uri.path is already decoded. Decoding it again changes literal percent-encoded
 * filename text (for example, `A%20B.cs`) into a different path and can make the active
 * document re-enter a project snapshot as a second source file.
 */
export function normalizeMonacoProjectPath(path: string): string {
  const resolved: string[] = [];
  for (const rawPart of path.replace(/\\/g, '/').split('/')) {
    const part = rawPart.trim();
    if (!part || part === '.') continue;
    if (part === '..') {
      resolved.pop();
      continue;
    }
    resolved.push(part);
  }
  return resolved.join('/');
}

const PROJECT_MARKER = '/codecraft-project/';
const MODEL_MARKER = '/codecraft-model/';

export function getCodeCraftProjectPathFromUriPath(uriPath: string): string {
  const projectIndex = uriPath.indexOf(PROJECT_MARKER);
  return projectIndex < 0
    ? ''
    : normalizeMonacoProjectPath(uriPath.slice(projectIndex + PROJECT_MARKER.length));
}

export function getCodeCraftSourcePathFromUriPath(
  uriPath: string,
  fallback: string
): string {
  const projectPath = getCodeCraftProjectPathFromUriPath(uriPath);
  if (projectPath) return projectPath;

  const modelIndex = uriPath.indexOf(MODEL_MARKER);
  if (modelIndex >= 0) {
    const withoutPrefix = uriPath.slice(modelIndex + MODEL_MARKER.length);
    const slash = withoutPrefix.indexOf('/');
    return normalizeMonacoProjectPath(
      slash >= 0 ? withoutPrefix.slice(slash + 1) : withoutPrefix
    );
  }

  return normalizeMonacoProjectPath(uriPath.replace(/^\//, '') || fallback);
}
