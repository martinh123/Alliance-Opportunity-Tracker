#!/bin/bash
set -e
pnpm install --frozen-lockfile
pnpm --filter db push
# Apply idempotent DDL migrations (safe to re-run; all statements use IF NOT EXISTS / IF EXISTS guards)
psql -v ON_ERROR_STOP=1 "$DATABASE_URL" -f lib/db/migrations/0001_mcp_rls.sql
psql -v ON_ERROR_STOP=1 "$DATABASE_URL" -f lib/db/migrations/0002_contact_location.sql
psql -v ON_ERROR_STOP=1 "$DATABASE_URL" -f lib/db/migrations/0004_geocode_cache.sql
# One-shot data migration; guarded by the data_migrations marker table (no-op after first run)
psql -v ON_ERROR_STOP=1 "$DATABASE_URL" -f lib/db/migrations/0003_extract_contact_locations.sql
