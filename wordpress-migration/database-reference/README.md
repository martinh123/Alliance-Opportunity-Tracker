# Database export reference for Copilot

This directory contains a Copilot-sized, sanitized export in the same version-2 shape as the administrator organization export endpoint.

## Files

- `sanitized-admin-export-v2.json` — fictional, export-shaped data for migration development.
- `EXPORT-LIMITATIONS.md` — explains what was intentionally excluded.
- `../reference/gsi-current-database-schema.sql` — schema-only SQL.
- `../reference/gsi-current-database-schema.md` — readable schema documentation.
- `../source/lib/db/src/schema/` — source-of-truth Drizzle table definitions.
- `../source/lib/db/migrations/` — checked-in SQL migrations.

## Copilot URL

Use this repository URL:

<https://github.com/martinh123/Alliance-Opportunity-Tracker/blob/main/wordpress-migration/database-reference/sanitized-admin-export-v2.json>

Raw file URL:

<https://raw.githubusercontent.com/martinh123/Alliance-Opportunity-Tracker/main/wordpress-migration/database-reference/sanitized-admin-export-v2.json>

## Important

The JSON is deliberately fictional and safe for source control. It preserves the entity names, field names, JSON shapes, foreign-key relationships, and representative values needed to implement the WordPress importer. It is not a production backup and must not be treated as one.
