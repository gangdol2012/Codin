import assert from 'node:assert/strict';
import test from 'node:test';

import {
  removeGitHubAuthFromBackup,
  sanitizeBackupLocalStorage,
  sanitizeSettingsStorageValueForBackup,
} from '../src/user-data-backup.ts';

test('backup settings remove API keys while preserving ordinary settings', () => {
  const sanitized = sanitizeSettingsStorageValueForBackup(JSON.stringify({
    assistantProvider: 'gemini',
    assistantApiKey: 'gemini-secret',
    nested: {
      openai_api_key: 'openai-secret',
      theme: 'dark',
    },
  }));

  assert.deepEqual(JSON.parse(sanitized), {
    assistantProvider: 'gemini',
    assistantApiKey: '',
    nested: {
      openai_api_key: '',
      theme: 'dark',
    },
  });
});

test('backup localStorage omits unreadable settings and legacy Git state', () => {
  const sanitized = sanitizeBackupLocalStorage({
    'codecraft-settings': 'not valid JSON with a leaked API key',
    'codecraft-git-state': JSON.stringify({ ghAuth: { token: 'github-secret' } }),
    'codecraft-layout': '{"layout":"safe"}',
  }, 'codecraft-settings', 'codecraft-git-state');

  assert.deepEqual(sanitized, {
    'codecraft-layout': '{"layout":"safe"}',
  });
});

test('backup Git state is logged out without mutating live authentication', () => {
  const liveState = {
    initialized: true,
    ghAuth: {
      token: 'github-secret',
      user: 'octocat',
    },
  };

  const sanitized = removeGitHubAuthFromBackup(liveState);

  assert.equal(sanitized.ghAuth, null);
  assert.equal(liveState.ghAuth.token, 'github-secret');
  assert.doesNotMatch(JSON.stringify(sanitized), /github-secret/);
});
