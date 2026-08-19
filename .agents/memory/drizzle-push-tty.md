---
name: Drizzle push TTY blocker
description: Why schema changes in this repo are applied via psql, not drizzle-kit push
---

`pnpm --filter @workspace/db run push` (drizzle-kit push) opens interactive TTY
prompts (create vs rename, truncate confirmations) that hang in the agent
environment — even with `--force` / push-force the prompts can still block.

**Workaround:** apply DDL directly with `psql "$DATABASE_URL"` (CREATE TABLE,
ALTER, DROP COLUMN, etc.), then verify the schema is in sync.

**Why:** A recurring trap is constraint naming. drizzle generates unique/constraint
names a specific way (e.g. `<table>_<col>_unique`). If an existing DB constraint has
a different name (e.g. an old `_key` suffix), every later push re-prompts to
"rename" it. Rename the live constraint to match drizzle's generated name so future
pushes/post-merge reconciliation stop prompting.

**How to apply:** when adding/altering schema in `lib/db`, write the Drizzle schema
for typecheck, then push the DDL via psql, and make sure live constraint names equal
what drizzle would generate.
