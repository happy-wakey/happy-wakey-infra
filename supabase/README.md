# Supabase overlays for happy-wakey

Per the fleet ADR (k8s-libs-and-shared-defs `docs/db-providers-in-infra-adr.md`): provider overlays live here,
one directory per Supabase project ref, each connected to the Supabase GitHub App with working directory
`supabase/<ref>` and "Supabase changes only" on.

**Near-term shared model (owner decision 2026-09-04):** this org uses the shared `oresoftware` Supabase org —
`canonical` (app data) and `auth` (shared-auth customer realm, project `szzbuljocwprjhaqnbvb`) — isolated by the
Postgres schema `happy_wakey`. Migrations here must be scoped to `happy_wakey` (`create schema if not exists happy_wakey;` first).
`migrationTarget: own-org-later` in `.db-providers.json` marks the planned move to a per-org Supabase org, at which
point `pg_dump --schema=happy_wakey` moves the namespace into the org's own projects.

Portable SQL stays in `happy-wakey-orm-core`; only Supabase-specific overlays (RLS, grants, Auth/Storage/Realtime
config, Edge Functions such as `telemetry-ws-ingest`) go under `supabase/<ref>/supabase/`.
