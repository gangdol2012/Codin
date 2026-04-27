import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { execFileSync } from 'node:child_process';

const repoPath = resolve(process.env.CODEX_CLI_REPO_PATH || '/Users/gangdol/codex');
const outputPath = resolve('public/codex-vm/codex-cli-static.json');

function readJson(path) {
  return JSON.parse(readFileSync(path, 'utf8'));
}

function git(args) {
  return execFileSync('git', args, { cwd: repoPath, encoding: 'utf8' }).trim();
}

if (!existsSync(repoPath)) {
  console.warn(`[codex-static] ${repoPath} does not exist; keeping existing static Codex metadata.`);
  process.exit(0);
}

const packageJsonPath = resolve(repoPath, 'codex-cli/package.json');
const modelsJsonPath = resolve(repoPath, 'codex-rs/models-manager/models.json');

if (!existsSync(packageJsonPath) || !existsSync(modelsJsonPath)) {
  console.warn(`[codex-static] ${repoPath} is not a Codex checkout; keeping existing static Codex metadata.`);
  process.exit(0);
}

const pkg = readJson(packageJsonPath);
const models = readJson(modelsJsonPath);
const codexModels = (models.models || [])
  .filter(model => typeof model.slug === 'string' && (model.slug.includes('codex') || model.slug.startsWith('gpt-5')))
  .slice(0, 12)
  .map(model => ({
    slug: model.slug,
    displayName: model.display_name || model.slug,
    description: model.description || '',
    defaultReasoningLevel: model.default_reasoning_level || null,
    supportedReasoningLevels: model.supported_reasoning_levels || [],
    supportedInApi: !!model.supported_in_api,
  }));

const payload = {
  generatedAt: new Date().toISOString(),
  sourceUrl: 'https://github.com/gangdol2012/codex.git',
  localClonePath: repoPath,
  branch: git(['rev-parse', '--abbrev-ref', 'HEAD']),
  commit: git(['rev-parse', 'HEAD']),
  packageName: pkg.name,
  packageVersion: pkg.version,
  cliEntrypoint: pkg.bin?.codex || 'bin/codex.js',
  authIssuer: 'https://auth.openai.com',
  clientId: 'app_EMoamEEZ73f0CkXaXp7hrann',
  mcpServerCrate: 'codex-rs/mcp-server',
  models: codexModels,
};

mkdirSync(dirname(outputPath), { recursive: true });
writeFileSync(outputPath, `${JSON.stringify(payload, null, 2)}\n`);
console.log(`[codex-static] wrote ${outputPath}`);
