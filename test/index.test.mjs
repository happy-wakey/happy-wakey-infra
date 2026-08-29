import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
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

test('JetStream desired state is durable, bounded, and credential-free', async () => {
  const topology = JSON.parse(
    await readFile(new URL('../nats/topology.json', import.meta.url), 'utf8'),
  );
  assert.equal(topology.schema, 'happy-wakey.jetstream-topology.v1');

  const requests = topology.streams.find(
    (stream) => stream.name === 'HAPPY_WAKEY_OPERATIONS',
  );
  assert.deepEqual(requests.subjects, ['happy-wakey.operations']);
  assert.equal(requests.storage, 'file');
  assert.equal(requests.retention, 'workqueue');
  assert.equal(requests.max_message_bytes, 4096);
  assert.ok(requests.duplicate_window_seconds >= requests.max_age_seconds);

  const responses = topology.streams.find(
    (stream) => stream.name === 'HAPPY_WAKEY_RESPONSES',
  );
  assert.deepEqual(responses.subjects, ['happy-wakey.responses.*']);
  assert.equal(responses.storage, 'file');
  assert.equal(responses.retention, 'limits');
  assert.equal(responses.allow_direct, true);
  assert.equal(responses.max_messages_per_subject, 1);

  assert.deepEqual(topology.consumers, [
    {
      stream: 'HAPPY_WAKEY_OPERATIONS',
      durable_name: 'happy-wakey-api',
      filter_subject: 'happy-wakey.operations',
      delivery: 'pull',
      ack_policy: 'explicit',
      ack_wait_seconds: 30,
      max_deliver: 10,
      max_ack_pending: 256,
    },
  ]);
  const serialized = JSON.stringify(topology);
  assert.equal(serialized.includes('bearer'), false);
  assert.equal(serialized.includes('owner_id'), false);
  assert.equal(serialized.includes('reply_to'), false);
});

test('API and web pods inherit the exact credential-free sidecar contract', async () => {
  const manifest = await readFile(
    new URL('../k8s/base/fleet.yaml', import.meta.url),
    'utf8',
  );
  const exactImage =
    'ghcr.io/happy-wakey/happy-wakey-sidecar.rs:git-6bee12449fb421b142d3c5836bbc0547f805462a';
  assert.equal(manifest.split(`image: ${exactImage}`).length - 1, 2);
  assert.equal(manifest.split('- name: sidecar').length - 1, 2);
  assert.equal(
    manifest.split('command: [/usr/local/bin/happy-wakey-sidecar, probe-healthz]')
      .length - 1,
    4,
  );
  assert.equal(manifest.split('value: 127.0.0.1:9090').length - 1, 2);
  assert.equal(manifest.split('value: api').length - 1, 1);
  assert.equal(manifest.split('value: web').length - 1, 1);
  assert.equal(manifest.includes('HAPPY_WAKEY_SIDECAR_ALLOW_NON_LOOPBACK'), false);

  for (const block of manifest.split('- name: sidecar').slice(1)) {
    const sidecar = block.split('\n      volumes:')[0];
    assert.equal(sidecar.includes('secretKeyRef:'), false);
    assert.equal(sidecar.includes('readinessProbe:'), false);
    assert.equal(sidecar.includes('allowPrivilegeEscalation: false'), true);
    assert.equal(sidecar.includes('readOnlyRootFilesystem: true'), true);
    assert.equal(sidecar.includes('runAsUser: 65532'), true);
  }
});
