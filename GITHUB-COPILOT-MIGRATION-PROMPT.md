# GitHub Copilot Prompt — Alliance Opportunity Tracker to WordPress

> **Use `GITHUB-COPILOT-FINAL-HANDOFF.md` as the definitive final instruction.**
>
> It supersedes any instruction below that conflicts with it, explains what was
> completed, and gives the complete migration path without requesting additional
> exports, ZIP files, or handoff material. The content below is retained only as
> earlier context.

You are helping migrate the Alliance Opportunity Tracker from Replit into a custom WordPress 7.1 installation on SiteGround.

Do not look for or request ZIP uploads. All migration material is already stored as ordinary repository files under `wordpress-migration/`.

## Required reading order

1. `wordpress-migration/README.md`
2. `wordpress-migration/docs/MIGRATION-NOTES.md`
3. `wordpress-migration/reference/gsi-wordpress-build-spec.html`
4. `wordpress-migration/reference/gsi-current-database-schema.md`
5. `wordpress-migration/reference/gsi-current-database-schema.sql`
6. `wordpress-migration/reference/openapi.yaml`
7. `wordpress-migration/reference/repo-tree.txt`

## Source locations

- Frontend pages/components: `wordpress-migration/source/artifacts/gsi-tracker/src/`
- Frontend styles/public assets: `wordpress-migration/source/artifacts/gsi-tracker/src/index.css` and `wordpress-migration/source/artifacts/gsi-tracker/public/`
- Route definitions: `wordpress-migration/source/artifacts/gsi-tracker/src/App.tsx`
- Shared layout/navigation: `wordpress-migration/source/artifacts/gsi-tracker/src/components/layout.tsx`
- API app setup: `wordpress-migration/source/artifacts/api-server/src/app.ts`
- API route registration: `wordpress-migration/source/artifacts/api-server/src/routes/index.ts`
- API route handlers: `wordpress-migration/source/artifacts/api-server/src/routes/`
- Auth/session implementation: `wordpress-migration/source/artifacts/api-server/src/lib/auth.ts` and `password.ts`
- Database schema: `wordpress-migration/source/lib/db/src/schema/`
- Database migrations: `wordpress-migration/source/lib/db/migrations/`
- API contract: `wordpress-migration/source/lib/api-spec/openapi.yaml` and `wordpress-migration/reference/openapi.yaml`

## Migration requirements

1. Build a custom WordPress must-use plugin and custom theme; do not depend on existing WordPress plugins or UI component libraries.
2. Recreate the PostgreSQL schema as custom WordPress database tables using the schema and migration references. Use `$wpdb` with prepared statements or a safe database abstraction.
3. Implement the REST API under `/wp-json/gsi/v1/`, mapping the operations in `openapi.yaml`.
4. Use WordPress users, roles, capabilities, nonces, and secure cookies for authentication. Do not reproduce the original raw session secret or cookie implementation.
5. Preserve admin versus rep access rules and organization/tenant scoping.
6. Preserve the weighted MEDDPICC score as server-owned business logic. AI company research must remain presentation-only and must never affect the score.
7. Recreate dashboard, opportunity detail, partners, outcomes, nearby contacts, admin users, profile/settings, reminders, and not-found states.
8. Preserve the navy/slate visual system and responsive layout shown by the SVG references in `wordpress-migration/assets/gsi-svg-screens/`.
9. Treat `wordpress-migration/config/.env.example` and `env-vars-list.txt` as variable-name references only; never insert values into source control.
10. Use `wordpress-migration/config/.replit` only to understand the original run configuration; it is not a WordPress deployment configuration.

## Deliverables to implement in the destination WordPress project

- Custom plugin directory with activation/schema migration routines.
- Custom theme directory with the application shell and route views.
- REST controllers for auth, dashboard, opportunities, partners, people, MEDDPICC, reminders, profile, admin, backup/export, and MCP-compatible read access where appropriate.
- A sanitized fixture importer based on the sample data if test records are needed. Do not import production data from this reference tree.
- A README documenting SiteGround setup, required environment values, database tables, roles/capabilities, cron expectations, and deployment steps.

Before making changes, summarize which source files you used and identify any ambiguity instead of inventing fields or endpoints.
