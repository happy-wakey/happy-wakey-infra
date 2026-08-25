# happy-wakey-infra

Cloudflare Worker code and Kubernetes/GitOps deployment contracts for the Happy Wakey service fleet. Infrastructure stays standalone and is referenced by versioned release inputs; it is not nested inside `happy-wakey-monorepo`.

## Contents

- `src/index.mjs` is a fail-closed Cloudflare edge Worker with bounded health/readiness responses and security headers.
- `k8s/base/fleet.yaml` declares non-root API and web deployments, services, probes, resource bounds, disruption budgets, runtime secret references, the four interaction-mode endpoints, and default-deny network policy.
- `wrangler.toml` contains non-secret Worker metadata only.

The base intentionally contains no Secret objects and its default-deny policy blocks traffic until a reviewed environment overlay adds exact DNS, Shared Auth, PostgreSQL, NATS, ingress, API, and web rules. Deployment promotion must replace image tags with reviewed immutable digests. Do not claim this base alone is deployable production evidence.

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
