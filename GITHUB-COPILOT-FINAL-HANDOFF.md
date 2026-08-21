# FINAL COPILOT HANDOFF — Alliance Opportunity Tracker to WordPress

This is the final instruction for the Alliance Opportunity Tracker migration. Do not ask for ZIP uploads, repeated exports, repository access, a schema dump, an API document, sample production data, or a new project tree. The complete sanitized migration reference is already committed to this Git repository as normal files.

## Your assignment

Migrate the current Alliance Opportunity Tracker into a fully custom WordPress 7.1 application for SiteGround.

Build:

- A custom must-use plugin for custom database tables, REST endpoints, organization scoping, roles/capabilities, import/export, and business rules.
- A custom WordPress theme for the application shell, dashboard, forms, detail views, responsive layout, and navy/slate visual system.
- Custom PHP, JavaScript, and CSS only. Do not require a third-party WordPress plugin, page builder, or UI component library.

Use WordPress users, roles, capabilities, nonces, and secure WordPress cookies. Do not copy the original Replit HMAC cookie format, password hashes, session secret, or development configuration.

## What has already been completed

The migration reference tree was created and published to the repository's `main` branch. It was checked remotely after publishing:

- The migration prompt, documentation, source copies, schema, migrations, OpenAPI contract, route map, screenshots, and SVG screen references are present.
- The migration tree has no ZIP files.
- The tree has no `.env` file, password hashes, API keys, session secrets, cookies, private keys, build output, or dependency directories.
- A WXR/XML export was not found. Do not wait for one: this is a custom table and REST migration, not a WordPress content import.
- No production data is included. Create only fictional fixtures if the new WordPress project needs test data.
- A sanitized administrator-export-shaped JSON fixture is available at `wordpress-migration/database-reference/sanitized-admin-export-v2.json`.
- That fixture preserves the version-2 export keys, entity relationships, JSON shapes, and representative fields without publishing real rows or credentials.

The exact file inventory is in:

`wordpress-migration/reference/manifest.txt`

## Mandatory reading order

1. `wordpress-migration/README.md`
2. `wordpress-migration/docs/MIGRATION-NOTES.md`
3. `wordpress-migration/docs/COPILOT-COMPLETE-TRANSFER-INVENTORY.md`
4. `wordpress-migration/docs/COPILOT-COMPLIANCE-PROMPT.md`
5. `wordpress-migration/reference/manifest.txt`
6. `wordpress-migration/reference/gsi-wordpress-build-spec.html`
7. `wordpress-migration/reference/gsi-current-database-schema.md`
8. `wordpress-migration/reference/gsi-current-database-schema.sql`
9. `wordpress-migration/reference/gsi-current-database-schema.json`
10. `wordpress-migration/reference/gsi-route-map.json`
11. `wordpress-migration/reference/openapi.yaml`
12. `wordpress-migration/reference/repo-tree.txt`

Then inspect the exact source locations below. Source code is the authority when documentation and a UI reference differ.

## Source map

### React frontend reference

- All UI source: `wordpress-migration/source/artifacts/gsi-tracker/src/`
- Routes and login gating: `wordpress-migration/source/artifacts/gsi-tracker/src/App.tsx`
- Shared shell, sidebar, profile, sign-out, and actions: `wordpress-migration/source/artifacts/gsi-tracker/src/components/layout.tsx`
- Global design tokens and styling: `wordpress-migration/source/artifacts/gsi-tracker/src/index.css`
- MEDDPICC labels, guidance, and display bands: `wordpress-migration/source/artifacts/gsi-tracker/src/lib/meddpicc.ts`
- All route pages: `wordpress-migration/source/artifacts/gsi-tracker/src/pages/`
- Public assets: `wordpress-migration/source/artifacts/gsi-tracker/public/`
- SVG screen references: `wordpress-migration/assets/gsi-svg-screens/`

Recreate dashboard, opportunity detail, partners, outcomes, nearby contacts, admin users, profile/settings, login, and not-found states. Preserve the navy/slate visual language, responsive behavior, loading states, empty states, and destructive-action confirmations.

### Express API reference

- API application setup: `wordpress-migration/source/artifacts/api-server/src/app.ts`
- Route registration: `wordpress-migration/source/artifacts/api-server/src/routes/index.ts`
- All route handlers: `wordpress-migration/source/artifacts/api-server/src/routes/`
- Original auth reference: `wordpress-migration/source/artifacts/api-server/src/lib/auth.ts`
- Original password reference: `wordpress-migration/source/artifacts/api-server/src/lib/password.ts`
- AI research implementation: `wordpress-migration/source/artifacts/api-server/src/lib/companyIntel.ts`
- Geocoding implementation: `wordpress-migration/source/artifacts/api-server/src/lib/geocode.ts`
- API specification: `wordpress-migration/source/lib/api-spec/openapi.yaml`

Map the API behavior to custom WordPress REST endpoints under `/wp-json/gsi/v1/`. Preserve endpoint fields and validation from the OpenAPI contract; do not invent fields or omit routes that exist in the source.

### Database reference

- Drizzle schema: `wordpress-migration/source/lib/db/src/schema/`
- SQL migrations: `wordpress-migration/source/lib/db/migrations/`
- Current schema SQL: `wordpress-migration/reference/gsi-current-database-schema.sql`
- Current schema documentation: `wordpress-migration/reference/gsi-current-database-schema.md`
- Database file inventory: `wordpress-migration/reference/lib-db-file-list.txt`
- Sanitized admin-export-shaped fixture: `wordpress-migration/database-reference/sanitized-admin-export-v2.json`
- Fixture limitations: `wordpress-migration/database-reference/EXPORT-LIMITATIONS.md`

Recreate this model as custom WordPress tables. Use `$wpdb` prepared statements or an equally safe database abstraction. Preserve foreign-key relationships, organization ownership, server-side validations, import behavior, and audit timestamps.

## Non-negotiable business rules

### MEDDPICC is server-owned

Authoritative implementation:

`wordpress-migration/source/artifacts/api-server/src/routes/meddpicc.ts`

Never implement the overall score as a browser-only calculation or a flat completion percentage.

Weights:

| Element | Weight |
| --- | ---: |
| `metrics` | 15 |
| `economic_buyer` | 15 |
| `identify_pain` | 15 |
| `champion` | 15 |
| `decision_criteria` | 10 |
| `decision_process` | 10 |
| `paper_process` | 10 |
| `competition` | 10 |

For each element:

```text
if there are no entries: strength = 0
otherwise:
  validatedRatio = validated entries / total entries
  avgRelevance = average relevanceScore, treating null as 3
  strength = 0.40 + (0.40 * validatedRatio) + (0.20 * (avgRelevance / 5))
```

Overall score:

```text
sum(element weight * element strength)
```

Weights total 100, so the result is already a 0–100 score. Recalculate and persist the opportunity score after every MEDDPICC entry create, update, and delete. The user interface may only display the server result.

### AI research is presentation-only

Route handlers:

`wordpress-migration/source/artifacts/api-server/src/routes/company.ts`

AI implementation:

`wordpress-migration/source/artifacts/api-server/src/lib/companyIntel.ts`

The existing application uses Gemini 2.5 Flash through a Replit-managed integration, with Google Search grounding for public web research. It supports company resolution, company research, per-MEDDPICC-section research, partner macro research, and end-customer macro research.

AI output must never create, modify, or affect a MEDDPICC score. AI work is triggered by user API requests. There are no cron jobs, workers, queues, scheduled research jobs, or background processors in the current application.

### Nearby contacts and geocoding

Implementation:

`wordpress-migration/source/artifacts/api-server/src/lib/geocode.ts`

Pipeline:

1. Gemini normalizes free-text location strings to canonical places.
2. Nominatim/OpenStreetMap geocodes those places.
3. Nominatim calls are serialized at about one request per second.
4. Definitive outcomes are cached in `geocode_cache`.
5. Haversine distance determines nearby contacts.

Do not permanently cache transient failures. Preserve the provenance distinction between AI-only and Nominatim-backed coordinates.

### Data isolation and lifecycle

- Preserve admin versus rep access rules.
- Scope users, partners, resources, contacts, opportunities, and related data to the current organization.
- Set `closed_won_at` server-side when an opportunity first changes to `ClosedWon`; do not clear it when reopened.
- Clear stored company research when an opportunity's end customer or end-customer domain changes.
- Do not cache authenticated user-specific REST responses in the browser.
- Preserve reminders, notes, partner resources, internal resources, contacts, backup/export, and import validation.
- Broken relationships in imports must create an explicit validation error or import report. Never silently skip records.

## Required WordPress deliverables

1. Custom must-use plugin with activation and database-migration routines.
2. Custom tables that represent the source schema and maintain organization isolation.
3. REST controllers under `/wp-json/gsi/v1/` with secure permission callbacks, nonces, and capability checks.
4. Custom theme with the application shell and all route-equivalent views.
5. Native WordPress user/role/capability integration for administrator and rep access.
6. Secure backup/export and a fictional fixture importer if test records are needed.
7. Documentation for SiteGround setup, table creation, required variable names, roles/capabilities, backup strategy, REST/permalink configuration, and deployment.

## Runtime facts from the source application

- Node: `v24.13.0`
- pnpm: `10.26.1`
- Root build: `pnpm run build`
- Root typecheck: `pnpm run typecheck`
- Frontend build: `pnpm --filter @workspace/gsi-tracker run build`
- API build: `pnpm --filter @workspace/api-server run build`
- API tests: `pnpm --filter @workspace/api-server test`

The reference includes source and public assets only. It intentionally excludes generated `dist` folders, `node_modules`, caches, and build artifacts. The source application uses pnpm, not npm or yarn.

Environment variable names only are documented in:

- `wordpress-migration/config/.env.example`
- `wordpress-migration/config/env-vars-list.txt`

Never commit values for those variables.

## How to proceed

Do not return another intake questionnaire and do not ask the user to re-send migration material. Start by reading the required files, then build the custom plugin and theme from the actual source, schema, API contract, and visual references.

If a value is external to the repository—such as a SiteGround database credential, SFTP access, or a production AI provider key—do not ask for it in chat. Implement the configuration point securely, name the required variable or external setup action in the final deployment notes, and continue with everything that can be completed from the repository.

Before declaring the migration complete, validate the REST endpoints, role and organization isolation, MEDDPICC formula, import errors, visual routes, and responsive states against the references above.