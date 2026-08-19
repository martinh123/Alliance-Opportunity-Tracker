-- Migration: MCP read-only access layer
-- Adds per-org MCP API keys and PostgreSQL Row-Level Security for the
-- mcp_reader role so Claude (and other MCP clients) can only ever read
-- data that belongs to the organisation whose key was presented.
--
-- Safe to re-run: uses IF NOT EXISTS / IF EXISTS guards throughout.

-- ── 1. Per-org MCP key column ────────────────────────────────────────────────
ALTER TABLE organizations ADD COLUMN IF NOT EXISTS mcp_key TEXT UNIQUE;

-- ── 2. Restricted reader role ────────────────────────────────────────────────
DO $$ BEGIN
  IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'mcp_reader') THEN
    CREATE ROLE mcp_reader NOLOGIN NOINHERIT;
  END IF;
END $$;

-- Allow the application user to SET ROLE mcp_reader within a transaction.
-- Grants to superuser roles are silently ignored if already granted.
DO $$ BEGIN
  BEGIN GRANT mcp_reader TO CURRENT_USER; EXCEPTION WHEN OTHERS THEN NULL; END;
END $$;

GRANT SELECT ON ALL TABLES IN SCHEMA public TO mcp_reader;

-- ── 3. Enable Row-Level Security on all user-data tables ─────────────────────
-- The postgres superuser bypasses RLS by default, so existing app queries
-- are completely unaffected.  Only the mcp_reader role (non-superuser) is
-- subject to these policies.
ALTER TABLE organizations          ENABLE ROW LEVEL SECURITY;
ALTER TABLE users                  ENABLE ROW LEVEL SECURITY;
ALTER TABLE partners               ENABLE ROW LEVEL SECURITY;
ALTER TABLE internal_resources     ENABLE ROW LEVEL SECURITY;
ALTER TABLE partner_resources      ENABLE ROW LEVEL SECURITY;
ALTER TABLE opportunities          ENABLE ROW LEVEL SECURITY;
ALTER TABLE profiles               ENABLE ROW LEVEL SECURITY;
ALTER TABLE meddpicc_entries       ENABLE ROW LEVEL SECURITY;
ALTER TABLE meddpicc_section_meta  ENABLE ROW LEVEL SECURITY;
ALTER TABLE company_research       ENABLE ROW LEVEL SECURITY;
ALTER TABLE reminders              ENABLE ROW LEVEL SECURITY;

-- ── 4. SECURITY DEFINER helpers ───────────────────────────────────────────────
-- These functions run as the table owner (postgres), bypassing RLS on the
-- tables they query.  They are used only inside RLS policy expressions to
-- resolve parent IDs for child tables, preventing circular policy evaluation.

CREATE OR REPLACE FUNCTION mcp_org_partner_ids(oid int)
  RETURNS SETOF int LANGUAGE sql SECURITY DEFINER AS
  $$ SELECT id FROM partners WHERE org_id = oid $$;

CREATE OR REPLACE FUNCTION mcp_org_user_ids(oid int)
  RETURNS SETOF int LANGUAGE sql SECURITY DEFINER AS
  $$ SELECT id FROM users WHERE org_id = oid $$;

CREATE OR REPLACE FUNCTION mcp_org_opportunity_ids(oid int)
  RETURNS SETOF int LANGUAGE sql SECURITY DEFINER AS
  $$ SELECT o.id FROM opportunities o
     JOIN partners p ON o.partner_id = p.id
     WHERE p.org_id = oid $$;

-- ── 5. Per-org RLS policies for mcp_reader ────────────────────────────────────
-- Drop and recreate so the migration is idempotent.
DO $$ DECLARE r RECORD; BEGIN
  FOR r IN SELECT policyname, tablename FROM pg_policies WHERE policyname LIKE 'mcp_%' LOOP
    EXECUTE format('DROP POLICY %I ON %I', r.policyname, r.tablename);
  END LOOP;
END $$;

-- Direct org_id tables
CREATE POLICY mcp_organizations ON organizations FOR SELECT TO mcp_reader
  USING (id = current_setting('app.org_id', true)::int);

CREATE POLICY mcp_users ON users FOR SELECT TO mcp_reader
  USING (org_id = current_setting('app.org_id', true)::int);

CREATE POLICY mcp_partners ON partners FOR SELECT TO mcp_reader
  USING (org_id = current_setting('app.org_id', true)::int);

CREATE POLICY mcp_internal_resources ON internal_resources FOR SELECT TO mcp_reader
  USING (org_id = current_setting('app.org_id', true)::int);

-- Child tables — resolved via SECURITY DEFINER helpers
CREATE POLICY mcp_partner_resources ON partner_resources FOR SELECT TO mcp_reader
  USING (partner_id IN (
    SELECT mcp_org_partner_ids(current_setting('app.org_id', true)::int)
  ));

CREATE POLICY mcp_opportunities ON opportunities FOR SELECT TO mcp_reader
  USING (partner_id IN (
    SELECT mcp_org_partner_ids(current_setting('app.org_id', true)::int)
  ));

CREATE POLICY mcp_profiles ON profiles FOR SELECT TO mcp_reader
  USING (user_id IN (
    SELECT mcp_org_user_ids(current_setting('app.org_id', true)::int)
  ));

CREATE POLICY mcp_meddpicc_entries ON meddpicc_entries FOR SELECT TO mcp_reader
  USING (opportunity_id IN (
    SELECT mcp_org_opportunity_ids(current_setting('app.org_id', true)::int)
  ));

CREATE POLICY mcp_meddpicc_section_meta ON meddpicc_section_meta FOR SELECT TO mcp_reader
  USING (opportunity_id IN (
    SELECT mcp_org_opportunity_ids(current_setting('app.org_id', true)::int)
  ));

CREATE POLICY mcp_company_research ON company_research FOR SELECT TO mcp_reader
  USING (opportunity_id IN (
    SELECT mcp_org_opportunity_ids(current_setting('app.org_id', true)::int)
  ));

CREATE POLICY mcp_reminders ON reminders FOR SELECT TO mcp_reader
  USING (user_id IN (
    SELECT mcp_org_user_ids(current_setting('app.org_id', true)::int)
  ));

-- ── 6. Prevent session variable tampering ────────────────────────────────────
-- Revoke the ability for mcp_reader to call set_config so that even if code
-- changes reintroduce parameterized SQL execution, the role cannot override
-- app.org_id (the GUC the RLS policies trust) from inside a query.
-- The postgres superuser is unaffected (superusers always bypass permission
-- checks on built-in functions).
REVOKE EXECUTE ON FUNCTION pg_catalog.set_config(text, text, boolean) FROM PUBLIC;
