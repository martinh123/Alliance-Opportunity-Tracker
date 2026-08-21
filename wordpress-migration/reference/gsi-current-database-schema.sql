-- GSI Partner Opportunity Tracker — current source-derived PostgreSQL schema
-- Generated from lib/db/src/schema on 2026-08-20.
-- This is a schema export for reference / rebuilding; it contains no data or secrets.

BEGIN;

CREATE TABLE organizations (
  id serial PRIMARY KEY,
  name text NOT NULL,
  mcp_key text UNIQUE,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE users (
  id serial PRIMARY KEY,
  email text NOT NULL UNIQUE,
  password_hash text NOT NULL,
  name text NOT NULL,
  role text NOT NULL DEFAULT 'rep',
  quota numeric(15,2),
  region text,
  org_id integer,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE profiles (
  id serial PRIMARY KEY,
  user_id integer NOT NULL UNIQUE,
  revenue_metric text NOT NULL DEFAULT 'ACV',
  fiscal_year_start text NOT NULL DEFAULT '1',
  fiscal_year_end text NOT NULL DEFAULT '12',
  quota numeric(15,2),
  q1_goal_pct numeric(5,2) DEFAULT '25',
  q2_goal_pct numeric(5,2) DEFAULT '25',
  q3_goal_pct numeric(5,2) DEFAULT '25',
  q4_goal_pct numeric(5,2) DEFAULT '25',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE TABLE partners (
  id serial PRIMARY KEY,
  name text NOT NULL,
  tier text,
  region text,
  contact_name text,
  contact_email text,
  primary_contact_id integer,
  notes jsonb NOT NULL DEFAULT '[]'::jsonb,
  revenue_target numeric(15,2),
  org_id integer,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE internal_resources (
  id serial PRIMARY KEY,
  name text NOT NULL,
  function text,
  email text,
  phone text,
  location text,
  is_manager boolean NOT NULL DEFAULT false,
  manager_id integer,
  notes jsonb NOT NULL DEFAULT '[]'::jsonb,
  org_id integer,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE partner_resources (
  id serial PRIMARY KEY,
  partner_id integer NOT NULL,
  name text NOT NULL,
  function text,
  email text,
  phone text,
  location text,
  is_manager boolean NOT NULL DEFAULT false,
  manager_id integer,
  notes jsonb NOT NULL DEFAULT '[]'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  FOREIGN KEY (partner_id) REFERENCES partners(id) ON DELETE CASCADE
);

CREATE TABLE opportunities (
  id serial PRIMARY KEY,
  name text NOT NULL,
  type text NOT NULL DEFAULT 'opportunity',
  partner_id integer NOT NULL,
  owner_id integer NOT NULL,
  stage text NOT NULL DEFAULT 'Qualify',
  country text,
  date_in date,
  hpe_team text,
  partner_contact text,
  partner_contact_role text,
  num_endpoints integer,
  use_case text,
  end_customer text,
  end_customer_domain text,
  revenue_value numeric(15,2),
  close_date date,
  description text,
  notes jsonb NOT NULL DEFAULT '[]'::jsonb,
  contacts jsonb NOT NULL DEFAULT '[]'::jsonb,
  meddpicc_score numeric(5,2),
  closed_won_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  FOREIGN KEY (partner_id) REFERENCES partners(id) ON DELETE CASCADE,
  FOREIGN KEY (owner_id) REFERENCES users(id) ON DELETE NO ACTION
);

CREATE TABLE meddpicc_entries (
  id serial PRIMARY KEY,
  opportunity_id integer NOT NULL,
  element text NOT NULL,
  content text NOT NULL,
  customer_validated boolean NOT NULL DEFAULT false,
  relevance_score integer,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  FOREIGN KEY (opportunity_id) REFERENCES opportunities(id) ON DELETE CASCADE
);

CREATE TABLE meddpicc_section_meta (
  id serial PRIMARY KEY,
  opportunity_id integer NOT NULL,
  element text NOT NULL,
  notes jsonb NOT NULL DEFAULT '[]'::jsonb,
  contact_ids jsonb NOT NULL DEFAULT '[]'::jsonb,
  owner_id text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  FOREIGN KEY (opportunity_id) REFERENCES opportunities(id) ON DELETE CASCADE,
  CONSTRAINT meddpicc_section_meta_opp_element UNIQUE (opportunity_id, element)
);

CREATE TABLE company_research (
  id serial PRIMARY KEY,
  opportunity_id integer NOT NULL,
  company_name text NOT NULL,
  company_domain text,
  industry text,
  location text,
  overview text,
  sections jsonb NOT NULL DEFAULT '[]'::jsonb,
  status text NOT NULL DEFAULT 'ready',
  error text,
  generated_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  FOREIGN KEY (opportunity_id) REFERENCES opportunities(id) ON DELETE CASCADE
);

CREATE TABLE reminders (
  id serial PRIMARY KEY,
  user_id integer NOT NULL,
  name text NOT NULL,
  due_at timestamptz NOT NULL,
  entity_type text,
  entity_id text,
  entity_label text,
  notes text,
  completed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE TABLE geocode_cache (
  id serial PRIMARY KEY,
  query text NOT NULL UNIQUE,
  canonical_name text,
  lat double precision,
  lon double precision,
  resolved boolean NOT NULL DEFAULT false,
  source text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE data_migrations (
  name text NOT NULL,
  applied_at timestamptz NOT NULL DEFAULT now()
);

-- Important source-model notes:
-- • org_id and manager_id columns are logical relationships, not declared FKs in the current Drizzle schema.
-- • partners.primary_contact_id is described in source as a SQL-level constraint but is not declared in current Drizzle TypeScript or checked-in migrations.
-- • Migration 0001 adds a unique organizations.mcp_key column and Postgres RLS policies for mcp_reader.
-- • Migration 0003 creates data_migrations only when applied.

COMMIT;
