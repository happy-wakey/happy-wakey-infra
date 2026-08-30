# happy-wakey-infra

Cloudflare Worker code and Kubernetes/GitOps deployment contracts for the Happy Wakey service fleet. Infrastructure stays standalone and is referenced by versioned release inputs; it is not nested inside `happy-wakey-monorepo`.

## Contents

- `src/index.mjs` is a fail-closed Cloudflare edge Worker with bounded health/readiness responses and security headers. Its request classifier is a pure function from an explicit method/path input to an immutable response description; the Worker adapter owns URL parsing and `Response` construction at the effect boundary.
- `k8s/base/fleet.yaml` declares non-root API and web deployments, services, probes, resource bounds, disruption budgets, runtime secret references, the four interaction-mode endpoints, and default-deny network policy.
- Each API and web pod includes `happy-wakey-sidecar` at exact source revision
  `6bee12449fb421b142d3c5836bbc0547f805462a`. The sidecar binds only to
  loopback, probes only its adjacent product process, reads Shared Auth and
  Opto Sync authority URLs from the non-secret ConfigMap, and receives no
  application credentials. Promotion must replace the source tag with the
  reviewed immutable image digest produced from that revision.
- `nats/topology.json` is the declarative JetStream desired state: separate
  file-backed request and response streams, a durable explicit-ack pull
  consumer, bounded messages and retention, duplicate windows, and direct
  response reads. It contains no credential material.
- `wrangler.toml` contains non-secret Worker metadata only.

The base intentionally contains no Secret objects and its default-deny policy blocks traffic until a reviewed environment overlay adds exact DNS, Shared Auth, PostgreSQL, NATS, ingress, API, and web rules. Deployment promotion must replace image tags with reviewed immutable digests. Do not claim this base alone is deployable production evidence.

The sidecar intentionally has startup and liveness exec probes but no
Kubernetes readiness probe. Product readiness remains owned by the product
container, while the sidecar's loopback `/readyz` exposes its reducer state for
diagnosis and independent monitoring.

The environment overlay must also satisfy these transport prerequisites:

- The web deployment selects one exact `HAPPY_WAKEY_INTERACTION_MODE`; there
  is no automatic downgrade or cross-mode fallback.
- `direct_db_read` uses the web runtime's database credential. That database
  role must be read-only in PostgreSQL/CockroachDB in addition to the
  application using only the lib-core read capability.
- `stateless_https` requires the configured internal API hostname to terminate
  TLS through the approved gateway or service mesh. The plain cluster Service
  port is not a valid web API base.
- `stateful_tls` uses the API certificate/key secret and a CA-only view of that
  secret in the web pod. Every request frame is independently authenticated.
- The topology provisioner applies `nats/topology.json` through the JetStream
  management API before either application starts. Application identities may
  get the named streams and consumer, publish to their exact subjects, and
  read/ack as required, but may not create, update, delete, or purge topology.
  API and web NATS credentials are separate secrets mounted at the same
  credential-file path. Core NATS request/reply is not an allowed substitute.

Customer and admin Shared Auth realms must use independent issuers, keys, databases, provider projects, cookies, service credentials, secret paths, and audit streams. Only the customer realm belongs in the Happy Wakey customer service overlay.

## Dependency management and validation

Use the released `zed-pkg` CLI:

```sh
zed validate
zed install --adapter node
zed run npm test
kubectl apply --dry-run=client -f k8s/base/fleet.yaml
```

Cloudflare and Kubernetes credentials belong in the approved secret manager and deployment identity. Never commit them, pass them as command-line flags, or render them into Worker variables, manifests, images, logs, or telemetry.

RxJS is intentionally not used in this Worker. A single request has no continuing event stream, cancellation graph, fan-out, or replay requirement; introducing an observable would add state and lifecycle surface without improving semantics. RxJS remains appropriate in the TypeScript client, where cold requests, polling, cancellation, and overlap prevention are real stream concerns.
