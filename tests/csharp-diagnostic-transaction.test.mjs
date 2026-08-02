import assert from 'node:assert/strict';
import test from 'node:test';

import { runCSharpDiagnosticProjectTransaction } from '../src/csharp-diagnostic-transaction.ts';

test('pre-mutation diagnostic cancellation invalidates without acknowledging the snapshot', async () => {
  let invalidations = 0;
  let acknowledgements = 0;
  const payloads = [];
  const response = await runCSharpDiagnosticProjectTransaction({
    initialProjectPayload: '{"full":true}',
    fullProjectPayload: '{"full":true}',
    invoke: async payload => {
      payloads.push(payload);
      return { cancelled: true };
    },
    invalidateProjectState: () => { invalidations += 1; },
    markProjectStateApplied: () => { acknowledgements += 1; },
  });

  assert.deepEqual(response, { cancelled: true });
  assert.deepEqual(payloads, ['{"full":true}']);
  assert.equal(invalidations, 1);
  assert.equal(acknowledgements, 0);
});

test('an authoritative mismatch retries an empty diagnostic delta with one full snapshot', async () => {
  let invalidations = 0;
  let acknowledgements = 0;
  const payloads = [];
  const response = await runCSharpDiagnosticProjectTransaction({
    initialProjectPayload: '',
    fullProjectPayload: '{"revision":"p2"}',
    invoke: async payload => {
      payloads.push(payload);
      return payload
        ? [{ id: 'CS0000' }]
        : { requiresFullSync: true, projectStateKey: 'p1' };
    },
    invalidateProjectState: () => { invalidations += 1; },
    markProjectStateApplied: () => { acknowledgements += 1; },
  });

  assert.deepEqual(response, [{ id: 'CS0000' }]);
  assert.deepEqual(payloads, ['', '{"revision":"p2"}']);
  assert.equal(invalidations, 1);
  assert.equal(acknowledgements, 1);
});

test('a rejected full diagnostic snapshot never advances browser state', async () => {
  let invalidations = 0;
  let acknowledgements = 0;
  await assert.rejects(
    runCSharpDiagnosticProjectTransaction({
      initialProjectPayload: '{"revision":"p2"}',
      fullProjectPayload: '{"revision":"p2"}',
      invoke: async () => ({ requiresFullSync: true }),
      invalidateProjectState: () => { invalidations += 1; },
      markProjectStateApplied: () => { acknowledgements += 1; },
    }),
    /requires a full resynchronization/
  );
  assert.equal(invalidations, 1);
  assert.equal(acknowledgements, 0);
});
