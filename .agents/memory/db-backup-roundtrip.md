---
name: DB backup/import round-trip
description: How generic JSON export/import of all tables avoids jsonb and serial-sequence corruption
---

Generic full-DB backup/restore (admin Data Management in Profile) uses raw SQL over the pg `pool`, not Drizzle ORM, so it can dump/restore every table without per-column type wiring.

**jsonb coercion rule:** On import, a value that is a JS array or plain object must be `JSON.stringify`-ed before being passed as an INSERT parameter.
**Why:** node-pg serializes a JS array as a Postgres array literal (`{...}`), not jsonb — so jsonb columns holding arrays (e.g. opportunity contacts/notes, section contactIds, company_research sections) corrupt unless stringified. Timestamps come back as ISO strings from JSON and pass through fine.
**How to apply:** detect by value type (array || typeof object), not by a hardcoded column list, so new jsonb columns work automatically.

**Sequence re-sync:** After `TRUNCATE … RESTART IDENTITY CASCADE` + re-inserting rows with explicit ids, call `setval(pg_get_serial_sequence(table,'id'), GREATEST(MAX(id),1), (COUNT(*)>0))` per table, or the next auto-id collides with restored ids.

**Lockout guard:** import rejects any payload whose users array contains no admin role; clear preserves the admin user row and only resets its profile to defaults.
