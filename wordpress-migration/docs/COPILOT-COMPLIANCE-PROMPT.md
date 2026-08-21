# Copy-ready Copilot prompt — final export compliance

Copy the following message into Copilot:

---

The requested Replit-to-WordPress migration materials have been audited and
published in this GitHub repository. Use the links and paths below as the
authoritative handoff. Do not request ZIP files, credentials, or raw production
database rows.

## 1. Sanitized database material

The originally requested 3.5 MB raw PostgreSQL export is not present in the
Replit project and was not fabricated. Raw production data is not committed to
Git because it can contain real contacts, notes, password hashes, MCP keys, and
other credential-bearing fields.

Instead, two safe JSON references are published:

1. Full table-shaped fixture with representative fictional rows for every source
   table, including organizations, users, partners, internal/partner contacts,
   opportunities, MEDDPICC records, company research, reminders, geocode cache,
   and data-migration history:

   `wordpress-migration/database/sanitized-postgresql-table-export-v1.json`

2. The source application's administrator import/export version-2 bundle shape:

   `wordpress-migration/database-reference/sanitized-admin-export-v2.json`

Both files contain only fictional data. Password hashes and MCP keys are
nonfunctional redaction markers. They are intended for development fixtures,
relationship mapping, and importer testing—not restoration of the production
database.

Use a fresh SiteGround WordPress database for the rebuild. Preserve the source
schema and import relationships from:

- `wordpress-migration/reference/gsi-current-database-schema.sql`
- `wordpress-migration/reference/gsi-current-database-schema.md`
- `wordpress-migration/source/lib/db/src/schema/`
- `wordpress-migration/source/lib/db/migrations/`

## 2. WordPress WXR status

No complete WXR/XML export exists. This Replit application is not a WordPress
application and does not use WordPress posts/pages as its data store. The file
`Unconfirmed 136855.crdownload.txt` is not a valid WXR export and is not part
of this repository handoff.

Do not wait for WXR. Implement this as a custom-table and REST migration.

## 3. Environment example

Use:

`wordpress-migration/config/.env.dev.example`

It includes non-working placeholders for requested `POSTGRES_*`, `GEO_*`, and
`AI_*` names, plus every original Express/Replit environment variable name.
The source runtime uses `DATABASE_URL`, Gemini integration variables, `PORT`,
`BASE_PATH`, `LOG_LEVEL`, and `SESSION_SECRET`; it does not use split
`POSTGRES_*`, `GEO_API_KEY`, or generic `AI_API_KEY` variable names.

Do not copy the Express session secret or password-hash implementation into
WordPress. Use native WordPress authentication, roles, capabilities, nonces,
and secure cookies.

## 4. Exact Replit commands and fresh startup output

The exact package scripts and managed workflow commands are documented at:

`wordpress-migration/reference/replit-fresh-start-log.txt`

The source commands are:

```bash
pnpm install --frozen-lockfile
pnpm run typecheck
pnpm run build
pnpm --filter @workspace/gsi-tracker run dev
pnpm --filter @workspace/api-server run dev
pnpm --filter @workspace/gsi-tracker run build
pnpm --filter @workspace/api-server run build
pnpm --filter @workspace/api-server test
```

Managed Replit runtime details:

- Frontend: `pnpm --filter @workspace/gsi-tracker run dev`, Vite on port 19844.
- API: `pnpm --filter @workspace/api-server run dev`, which sets
  `NODE_ENV=development`, runs `node ./build.mjs`, then starts
  `node --enable-source-maps ./dist/index.mjs` on port 8080.

## 5. External services

| Service | Production usage | Can be simulated in development? |
| --- | --- | --- |
| Gemini 2.5 Flash via Replit-managed Gemini integration | User-triggered company and MEDDPICC presentation research; Google Search grounding is used for public research. | Yes — return canned, fictional research payloads. |
| Nominatim/OpenStreetMap | User-triggered contact-location geocoding and nearby-contact distance features. Calls are serialized to about one per second and results are cached. | Yes — use fixed fictional coordinates or a mock geocoder. |
| Email provider | None found. | Not applicable. |
| Analytics provider | None found. | Not applicable. |

AI research is presentation-only and must never modify MEDDPICC scoring.

## 6. PostgreSQL features to preserve conceptually

No PostgreSQL extension or PostGIS dependency was found.

The original source does rely on:

- standard PostgreSQL tables, serial IDs, numeric/date/timestamptz values, and
  JSONB fields;
- unique constraints, including `users.email`, `organizations.mcp_key`,
  `geocode_cache.query`, `profiles.user_id`, and the composite
  MEDDPICC-section constraint;
- cascading foreign keys for profiles, partner resources, MEDDPICC entries,
  MEDDPICC section metadata, company research, and reminders;
- a restricted `mcp_reader` database role with row-level security policies,
  `app.org_id` session scoping, and SECURITY DEFINER helper functions for
  read-only MCP access.

In WordPress, preserve organization isolation and equivalent least-privilege
access checks in the custom must-use plugin and REST permission callbacks. Do
not attempt to copy the source database role verbatim into standard SiteGround
WordPress hosting unless the host explicitly supports it.

## 7. Background work and schedules

No cron job, queue, background worker, or scheduled research/geocode process
exists in the source.

- Company research is generated synchronously only when a user calls the
  relevant API endpoint.
- Geocoding is performed synchronously during the relevant user request, with
  an in-process, one-request-per-second rate limiter and a persistent
  `geocode_cache` table.
- There is no enqueue command, cron command, or worker process to port.

## 8. Required WordPress implementation

Build a pixel-conscious custom WordPress theme plus a custom must-use plugin.
Do not use a page builder, third-party component library, or block-based
approximation. Preserve the React app's navigation, responsive navy/slate
visual system, route-equivalent screens, organization scoping, server-owned
MEDDPICC calculation, import validation, and presentation-only AI boundary.

For the complete source, API map, assets, styling tokens, and build context,
read:

`wordpress-migration/docs/COPILOT-COMPLETE-TRANSFER-INVENTORY.md`

and then:

`GITHUB-COPILOT-FINAL-HANDOFF.md`

---

End of Copilot prompt.