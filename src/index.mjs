const SECURITY_HEADERS = Object.freeze({
  'cache-control': 'no-store',
  'content-security-policy': "default-src 'none'; frame-ancestors 'none'",
  'content-type': 'application/json; charset=utf-8',
  'referrer-policy': 'no-referrer',
  'x-content-type-options': 'nosniff',
});

const LOCAL_ROUTES = Object.freeze({
  'GET /healthz': Object.freeze({
    status: 200,
    body: Object.freeze({ status: 'ok', service: 'happy-wakey-edge' }),
  }),
  'GET /readyz': Object.freeze({
    status: 200,
    body: Object.freeze({ status: 'ready', service: 'happy-wakey-edge' }),
  }),
});

const HOSTS = Object.freeze({
  'hawky.pro': Object.freeze({ binding: 'MARKETING_SITE', audience: 'public' }),
  'www.hawky.pro': Object.freeze({ binding: 'MARKETING_SITE', audience: 'public' }),
  'app.hawky.pro': Object.freeze({ binding: 'PUBLIC_WEB', audience: 'public', realtime: true }),
  'user.hawky.pro': Object.freeze({ binding: 'PUBLIC_WEB', audience: 'public', realtime: true }),
  'org.hawky.pro': Object.freeze({ binding: 'PUBLIC_WEB', audience: 'public', realtime: true }),
  'main.hawky.pro': Object.freeze({ binding: 'PUBLIC_WEB', audience: 'public', realtime: true }),
  'm.hawky.pro': Object.freeze({ binding: 'PUBLIC_WEB', audience: 'public', realtime: true }),
  'api.hawky.pro': Object.freeze({ binding: 'PUBLIC_API', audience: 'public' }),
  'admin.hawky.pro': Object.freeze({ binding: 'ADMIN_WEB', audience: 'admin' }),
  'admin-api.hawky.pro': Object.freeze({ binding: 'ADMIN_API', audience: 'admin' }),
  'api-admin.hawky.pro': Object.freeze({ binding: 'ADMIN_API', audience: 'admin', alias: true }),
});

const NOT_FOUND = Object.freeze({
  status: 404,
  body: Object.freeze({ error: 'not_found' }),
});

/**
 * Purely classify an HTTP request into one immutable response description.
 * Query strings and request bodies are intentionally excluded from the input,
 * so they cannot leak into a bounded diagnostic response.
 */
export function routeRequest({ method, pathname }) {
  return LOCAL_ROUTES[`${method} ${pathname}`] ?? NOT_FOUND;
}

/** Pure host/path classifier used by deployment tests and the effectful adapter. */
export function routeEdgeRequest({ method, hostname, pathname, upgrade = '' }) {
  const local = LOCAL_ROUTES[`${method} ${pathname}`];
  if (local) return local;
  const host = HOSTS[String(hostname).toLowerCase()];
  if (!host) return NOT_FOUND;
  if (
    method === 'GET' &&
    pathname === '/v1/realtime' &&
    upgrade.toLowerCase() === 'websocket'
  ) {
    return host.realtime
      ? Object.freeze({ action: 'realtime', audience: host.audience })
      : NOT_FOUND;
  }
  return Object.freeze({
    action: 'proxy',
    binding: host.binding,
    audience: host.audience,
    alias: host.alias === true,
  });
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const description = routeEdgeRequest({
      method: request.method,
      hostname: url.hostname,
      pathname: url.pathname,
      upgrade: request.headers.get('upgrade') ?? '',
    });
    if (description.action === 'realtime') return openRealtime(request, env, url);
    if (description.action === 'proxy') {
      if (description.audience === 'admin' && !hasCloudflareAccessIdentity(request)) {
        return json({ error: 'admin_access_required' }, 401);
      }
      const binding = env?.[description.binding];
      if (!binding || typeof binding.fetch !== 'function') {
        return json({ error: 'upstream_unavailable' }, 503);
      }
      return binding.fetch(request);
    }
    return json(description.body, description.status);
  },
};

function hasCloudflareAccessIdentity(request) {
  return Boolean(
    request.headers.get('cf-access-jwt-assertion') &&
      request.headers.get('cf-access-authenticated-user-email'),
  );
}

async function openRealtime(request, env, url) {
  if (!env?.SHARED_AUTH || !env?.REALTIME_HUBS) {
    return json({ error: 'realtime_unavailable' }, 503);
  }
  const origin = request.headers.get('origin');
  if (origin !== `https://${url.hostname}`) {
    return json({ error: 'origin_rejected' }, 403);
  }
  const authHeaders = new Headers();
  for (const name of ['authorization', 'cookie', 'origin', 'x-request-id']) {
    const value = request.headers.get(name);
    if (value) authHeaders.set(name, value);
  }
  authHeaders.set('x-happy-wakey-operation', 'realtime:connect');
  const authResponse = await env.SHARED_AUTH.fetch(
    new Request('https://shared-auth.internal/v1/session/authorize', {
      method: 'POST',
      headers: authHeaders,
    }),
  );
  if (!authResponse.ok) return json({ error: 'authentication_required' }, 401);
  const raw = await authResponse.text();
  if (raw.length > 4096) return json({ error: 'invalid_auth_response' }, 502);
  let identity;
  try {
    identity = JSON.parse(raw);
  } catch {
    return json({ error: 'invalid_auth_response' }, 502);
  }
  if (!validRealtimeIdentity(identity)) {
    return json({ error: 'invalid_auth_response' }, 502);
  }
  const id = env.REALTIME_HUBS.idFromName(identity.tenant_id);
  const headers = new Headers(request.headers);
  headers.set('x-happy-wakey-tenant', identity.tenant_id);
  headers.set('x-happy-wakey-subject', identity.subject);
  headers.set('x-happy-wakey-session-expires-at', identity.expires_at);
  return env.REALTIME_HUBS.get(id).fetch(new Request(request, { headers }));
}

export function validRealtimeIdentity(value, now = Date.now()) {
  if (!value || typeof value !== 'object') return false;
  const id = /^[A-Za-z0-9][A-Za-z0-9_.:@-]{0,127}$/;
  const expiry = Date.parse(value.expires_at);
  return (
    id.test(value.tenant_id ?? '') &&
    id.test(value.subject ?? '') &&
    Number.isFinite(expiry) &&
    expiry > now &&
    expiry <= now + 15 * 60 * 1000
  );
}

export class RealtimeHub {
  constructor(state, env) {
    this.state = state;
    this.env = env;
  }

  async fetch(request) {
    const url = new URL(request.url);
    if (request.method === 'POST' && url.pathname === '/internal/publish') {
      return this.publish(request);
    }
    if (request.headers.get('upgrade')?.toLowerCase() !== 'websocket') {
      return json({ error: 'websocket_required' }, 426);
    }
    const identity = {
      tenant_id: request.headers.get('x-happy-wakey-tenant'),
      subject: request.headers.get('x-happy-wakey-subject'),
      expires_at: request.headers.get('x-happy-wakey-session-expires-at'),
    };
    if (!validRealtimeIdentity(identity) || this.state.getWebSockets().length >= 128) {
      return json({ error: 'realtime_admission_rejected' }, 503);
    }
    const pair = new WebSocketPair();
    const [client, server] = Object.values(pair);
    this.state.acceptWebSocket(server, [identity.tenant_id]);
    server.serializeAttachment(identity);
    server.send(JSON.stringify({ type: 'ready', expires_at: identity.expires_at }));
    return new Response(null, { status: 101, webSocket: client });
  }

  async publish(request) {
    const supplied = request.headers.get('authorization')?.replace(/^Bearer /, '') ?? '';
    if (!(await equalSecret(supplied, this.env.REALTIME_PUBLISH_TOKEN ?? ''))) {
      return json({ error: 'publish_unauthorized' }, 401);
    }
    const raw = await request.text();
    if (raw.length > 32768) return json({ error: 'message_too_large' }, 413);
    let envelope;
    try {
      envelope = JSON.parse(raw);
    } catch {
      return json({ error: 'invalid_envelope' }, 400);
    }
    if (!validEnvelope(envelope)) return json({ error: 'invalid_envelope' }, 400);
    let delivered = 0;
    for (const socket of this.state.getWebSockets(envelope.tenant_id)) {
      const identity = socket.deserializeAttachment();
      if (Date.parse(identity?.expires_at ?? '') <= Date.now()) {
        socket.close(4001, 'session_expired');
        continue;
      }
      socket.send(raw);
      delivered += 1;
    }
    return json({ status: 'accepted', delivered }, 202);
  }

  webSocketMessage(socket, message) {
    const size = typeof message === 'string' ? new TextEncoder().encode(message).byteLength : message.byteLength;
    if (size > 32768) return socket.close(1009, 'message_too_large');
    const identity = socket.deserializeAttachment();
    if (Date.parse(identity?.expires_at ?? '') <= Date.now()) {
      return socket.close(4001, 'session_expired');
    }
    let command;
    try {
      command = JSON.parse(typeof message === 'string' ? message : new TextDecoder().decode(message));
    } catch {
      return socket.send(JSON.stringify({ type: 'error', code: 'invalid_json' }));
    }
    if (command?.type === 'ping') {
      socket.send(JSON.stringify({ type: 'pong', at: new Date().toISOString() }));
    } else if (command?.type !== 'ack') {
      socket.send(JSON.stringify({ type: 'error', code: 'unsupported_command' }));
    }
  }

  webSocketError(socket) {
    socket.close(1011, 'realtime_error');
  }
}

function validEnvelope(value) {
  const id = /^[A-Za-z0-9][A-Za-z0-9_.:@-]{0,127}$/;
  return (
    value &&
    typeof value === 'object' &&
    id.test(value.tenant_id ?? '') &&
    id.test(value.id ?? '') &&
    ['briefing.updated', 'message.useful', 'sync.committed', 'chat.updated'].includes(value.type) &&
    value.payload &&
    typeof value.payload === 'object' &&
    !Array.isArray(value.payload)
  );
}

async function equalSecret(left, right) {
  if (!left || !right) return false;
  const bytes = new TextEncoder();
  const [a, b] = await Promise.all([
    crypto.subtle.digest('SHA-256', bytes.encode(left)),
    crypto.subtle.digest('SHA-256', bytes.encode(right)),
  ]);
  return new Uint8Array(a).every((value, index) => value === new Uint8Array(b)[index]);
}

function json(value, status) {
  return new Response(JSON.stringify(value), {
    status,
    headers: SECURITY_HEADERS,
  });
}
