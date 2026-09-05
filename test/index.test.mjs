import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

import worker, {
  routeEdgeRequest,
  routeRequest,
  validRealtimeIdentity,
} from '../src/index.mjs';

test('route classification is a pure, immutable, fail-closed projection', () => {
  const input = Object.freeze({ method: 'GET', pathname: '/readyz' });
  const first = routeRequest(input);
  const second = routeRequest(input);
  assert.strictEqual(first, second);
  assert.equal(Object.isFrozen(first), true);
  assert.equal(Object.isFrozen(first.body), true);

  assert.deepEqual(routeRequest({ method: 'POST', pathname: '/readyz' }), {
    status: 404,
    body: { error: 'not_found' },
  });
});

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

test('hawky host routing is explicit and admin origins fail closed', async () => {
  assert.deepEqual(
    routeEdgeRequest({ method: 'GET', hostname: 'app.hawky.pro', pathname: '/' }),
    { action: 'proxy', binding: 'PUBLIC_WEB', audience: 'public', alias: false },
  );
  assert.deepEqual(
    routeEdgeRequest({
      method: 'GET',
      hostname: 'user.hawky.pro',
      pathname: '/v1/realtime',
      upgrade: 'websocket',
    }),
    { action: 'realtime', audience: 'public' },
  );
  assert.deepEqual(
    routeEdgeRequest({ method: 'GET', hostname: 'api-admin.hawky.pro', pathname: '/' }),
    { action: 'proxy', binding: 'ADMIN_API', audience: 'admin', alias: true },
  );
  assert.equal(
    routeEdgeRequest({ method: 'GET', hostname: 'feeds.hawky.pro', pathname: '/' }).status,
    404,
  );

  const response = await worker.fetch(
    new Request('https://admin.hawky.pro/'),
    { ADMIN_WEB: { fetch: () => new Response('unexpected') } },
  );
  assert.equal(response.status, 401);
});

test('realtime authorization claims are bounded and short lived', () => {
  const now = Date.parse('2026-09-05T12:00:00Z');
  assert.equal(
    validRealtimeIdentity(
      {
        tenant_id: 'org_123',
        subject: 'user_456',
        expires_at: '2026-09-05T12:10:00Z',
      },
      now,
    ),
    true,
  );
  assert.equal(
    validRealtimeIdentity(
      {
        tenant_id: 'org_123',
        subject: 'user_456',
        expires_at: '2026-09-05T12:30:00Z',
      },
      now,
    ),
    false,
  );
});

test('deployment inventory includes every public, admin and event role', async () => {
  const deployment = JSON.parse(
    await readFile(new URL('../deploy/gcp-cloud-run.json', import.meta.url), 'utf8'),
  );
  assert.deepEqual(
    deployment.services.map((service) => service.role).sort(),
    [
      'admin-api-server',
      'admin-web-server',
      'api-server',
      'lambda-dispatcher',
      'mcp-server',
      'web-server',
    ],
  );
  assert.equal(deployment.runtime.imagePolicy, 'digest-only');
  assert.equal(deployment.runtime.directPublicOrigin, false);
  assert.equal(deployment.network.adminMcpColocation, true);
});

test('admin base has no secrets and requires private mTLS admission', async () => {
  const manifest = await readFile(
    new URL('../k8s/base/admin.yaml', import.meta.url),
    'utf8',
  );
  assert.equal(manifest.includes('kind: Secret'), false);
  assert.equal(manifest.includes('mtls-required: "true"'), true);
  assert.equal(manifest.includes('cloudflare-access'), true);
  assert.equal(manifest.includes('happy-wakey.oresoftware.com/plane: admin'), true);
  assert.equal(manifest.includes('automountServiceAccountToken: false'), true);
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
