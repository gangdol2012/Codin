export interface CSharpDiagnosticProjectTransactionOptions<TResponse> {
  initialProjectPayload: string;
  fullProjectPayload: string;
  invoke: (projectPayload: string) => Promise<TResponse>;
  invalidateProjectState: () => void;
  markProjectStateApplied: () => void;
}

function hasBooleanFlag(
  value: unknown,
  name: 'cancelled' | 'requiresFullSync'
): boolean {
  return (
    typeof value === 'object' &&
    value !== null &&
    !Array.isArray(value) &&
    (value as Record<string, unknown>)[name] === true
  );
}

/**
 * Applies the browser/worker diagnostic snapshot handshake.
 *
 * The worker is authoritative: cancellation may happen before mutation, and an empty
 * delta is safe only while both sides agree on the last full project revision.
 */
export async function runCSharpDiagnosticProjectTransaction<TResponse>(
  options: CSharpDiagnosticProjectTransactionOptions<TResponse>
): Promise<TResponse> {
  let projectPayload = options.initialProjectPayload;

  for (let attempt = 0; attempt < 2; attempt += 1) {
    const response = await options.invoke(projectPayload);
    if (hasBooleanFlag(response, 'requiresFullSync')) {
      options.invalidateProjectState();
      if (!projectPayload && attempt === 0) {
        projectPayload = options.fullProjectPayload;
        continue;
      }
      throw new Error('OmniSharp diagnostic project state requires a full resynchronization.');
    }

    if (hasBooleanFlag(response, 'cancelled')) {
      // A pre-gate cancellation never entered the project mutation callback.
      options.invalidateProjectState();
      return response;
    }

    options.markProjectStateApplied();
    return response;
  }

  throw new Error('OmniSharp diagnostic project state could not be synchronized.');
}
