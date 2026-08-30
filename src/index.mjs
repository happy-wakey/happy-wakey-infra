const SECURITY_HEADERS = Object.freeze({
  'cache-control': 'no-store',
  'content-security-policy': "default-src 'none'; frame-ancestors 'none'",
  'content-type': 'application/json; charset=utf-8',
  'referrer-policy': 'no-referrer',
  'x-content-type-options': 'nosniff',
});

const ROUTES = Object.freeze({
  'GET /healthz': Object.freeze({
    status: 200,
    body: Object.freeze({ status: 'ok', service: 'happy-wakey-edge' }),
  }),
  'GET /readyz': Object.freeze({
    status: 200,
    body: Object.freeze({ status: 'ready', service: 'happy-wakey-edge' }),
  }),
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
  return ROUTES[`${method} ${pathname}`] ?? NOT_FOUND;
}

export default {
  async fetch(request) {
    const url = new URL(request.url);
    const description = routeRequest({
      method: request.method,
      pathname: url.pathname,
    });
    return json(description.body, description.status);
  },
};

function json(value, status) {
  return new Response(JSON.stringify(value), {
    status,
    headers: SECURITY_HEADERS,
  });
}
