const SECURITY_HEADERS = Object.freeze({
  'cache-control': 'no-store',
  'content-security-policy': "default-src 'none'; frame-ancestors 'none'",
  'content-type': 'application/json; charset=utf-8',
  'referrer-policy': 'no-referrer',
  'x-content-type-options': 'nosniff',
});

export default {
  async fetch(request) {
    const url = new URL(request.url);
    if (request.method === 'GET' && url.pathname === '/healthz') {
      return json({ status: 'ok', service: 'happy-wakey-edge' }, 200);
    }
    if (request.method === 'GET' && url.pathname === '/readyz') {
      return json({ status: 'ready', service: 'happy-wakey-edge' }, 200);
    }
    return json({ error: 'not_found' }, 404);
  },
};

function json(value, status) {
  return new Response(JSON.stringify(value), {
    status,
    headers: SECURITY_HEADERS,
  });
}
