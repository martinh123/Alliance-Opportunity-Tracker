# WordPress Migration — Git-Native Reference

This directory contains the migration materials as ordinary repository files. No ZIP files are used here.

## Start here

1. Read `../GITHUB-COPILOT-MIGRATION-PROMPT.md`.
2. Read `docs/MIGRATION-NOTES.md`.
3. Read `docs/COPILOT-COMPLETE-TRANSFER-INVENTORY.md` for the complete source, data, assets, environment, and build checklist.
4. Read `docs/COPILOT-COMPLIANCE-PROMPT.md` for the final export-response prompt.
5. Review `reference/gsi-wordpress-build-spec.html` for the target custom WordPress architecture.
6. Review `reference/gsi-current-database-schema.md` and `reference/gsi-current-database-schema.sql` for the current PostgreSQL model.
7. Review `reference/openapi.yaml` for the current API contract.

## Directory map

- `source/artifacts/gsi-tracker/` — React/Vite frontend source and public assets.
- `source/artifacts/api-server/` — Express API source and route handlers.
- `source/lib/db/` — Drizzle schema and SQL migrations.
- `source/lib/api-spec/` — OpenAPI source and code-generation configuration.
- `source/lib/api-client-react/` and `source/lib/api-zod/` — generated API clients/types.
- `reference/` — package manifests, OpenAPI, schema exports, route map, ERD, and WordPress specification.
- `config/` — Replit configuration and sanitized environment variable templates.
- `docs/` — migration notes and implementation checklist.
- `assets/` — screenshots and SVG screen references.

The original application source also remains available at the repository root paths referenced by the prompt. These copies are organized for Copilot review and should be treated as read-only migration references.
