---
name: Stale bundle after schema changes
description: api-server must be restarted after any lib/db schema change or Drizzle will see missing columns at runtime
---

The api-server's `dev` script runs `esbuild` to bundle from TypeScript source (lib/db exports point to `.ts` files directly). If you add a column to a Drizzle table in `lib/db/src/schema/` and do NOT restart the api-server workflow, the bundle still has the old schema. Drizzle then filters out the unknown column key and throws "No values to set" on PATCH routes.

**Why:** lib/db has no separate build step for runtime — esbuild reads source at api-server build time. The bundle is only refreshed on workflow restart.

**How to apply:** After any `lib/db/src/schema/*.ts` change, always restart the `artifacts/api-server: API Server` workflow. Also add a defensive PATCH guard (iterate parsed.data keys, filter to `k in tableObject`) so unknown keys return the current record gracefully instead of crashing.
