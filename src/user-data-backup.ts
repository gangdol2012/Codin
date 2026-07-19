type JsonRecord = Record<string, unknown>;

function isJsonRecord(value: unknown): value is JsonRecord {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function isApiKeyField(fieldName: string) {
  const normalized = fieldName.replace(/[^a-z0-9]/gi, '').toLowerCase();
  return normalized === 'apikey' || normalized.endsWith('apikey');
}

function redactApiKeyFields(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map(redactApiKeyFields);
  }
  if (!isJsonRecord(value)) {
    return value;
  }

  return Object.fromEntries(
    Object.entries(value).map(([key, nestedValue]) => [
      key,
      isApiKeyField(key) ? '' : redactApiKeyFields(nestedValue),
    ])
  );
}

export function sanitizeSettingsStorageValueForBackup(value: string): string | null {
  let parsed: unknown;
  try {
    parsed = JSON.parse(value);
  } catch {
    return null;
  }

  if (!isJsonRecord(parsed)) {
    return null;
  }

  const serialized = JSON.stringify(redactApiKeyFields(parsed));
  return typeof serialized === 'string' ? serialized : null;
}

export function sanitizeBackupLocalStorage(
  snapshot: Record<string, string>,
  settingsStorageKey: string,
  gitStateStorageKey: string
) {
  const sanitized = { ...snapshot };

  // Git state is exported from IndexedDB after its authentication record is
  // removed. Never preserve a legacy localStorage copy alongside it.
  delete sanitized[gitStateStorageKey];

  const settingsValue = sanitized[settingsStorageKey];
  if (typeof settingsValue === 'string') {
    const safeSettingsValue = sanitizeSettingsStorageValueForBackup(settingsValue);
    if (safeSettingsValue == null) {
      // An unreadable settings payload cannot be proven credential-free.
      delete sanitized[settingsStorageKey];
    } else {
      sanitized[settingsStorageKey] = safeSettingsValue;
    }
  }

  return sanitized;
}

export function removeGitHubAuthFromBackup<T extends { ghAuth: unknown }>(
  gitState: T
): Omit<T, 'ghAuth'> & { ghAuth: null } {
  return {
    ...gitState,
    ghAuth: null,
  };
}
