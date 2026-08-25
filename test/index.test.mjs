import assert from 'node:assert/strict';
import test from 'node:test';

import worker from '../src/index.mjs';

test('health is bounded, non-cacheable JSON', async () => {
  const response = await worker.fetch(new Request('https://edge.example.test/healthz'));
  assert.equal(response.status, 200);
  assert.equal(response.headers.get('cache-control'), 'no-store');
  assert.equal(response.headers.get('x-content-type-options'), 'nosniff');
  assert.deepEqual(await response.json(), {
    status: 'ok',
    service: 'happy-wakey-edge',
  });
});

test('unknown routes fail closed without reflecting request data', async () => {
  const response = await worker.fetch(
    new Request('https://edge.example.test/private?token=do-not-reflect'),
  );
  assert.equal(response.status, 404);
  assert.deepEqual(await response.json(), { error: 'not_found' });
});
