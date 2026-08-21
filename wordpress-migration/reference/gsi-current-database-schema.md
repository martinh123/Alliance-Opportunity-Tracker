# GSI Partner Opportunity Tracker — Current Database Schema

**Generated:** 2026-08-20  
**Source:** `lib/db/src/schema/` (Drizzle ORM, PostgreSQL)  
**Scope:** schema definition only — no row data, credentials, or secrets.

## Overview

- **Primary application tables:** 12
- **Migration support table:** 1 (`data_migrations`, created when migration 0003 is applied)
- **Database dialect:** PostgreSQL
- **Primary keys:** `serial` integer keys except `data_migrations.name`
- **Tenant boundary:** `org_id` is used on users, partners, and internal resources. It is a logical relationship in current source; it is not declared as an FK in the Drizzle definitions.

## Relationships

- `profiles.user_id` → `users.id` (`ON DELETE CASCADE`)
- `partner_resources.partner_id` → `partners.id` (`ON DELETE CASCADE`)
- `opportunities.partner_id` → `partners.id` (`ON DELETE CASCADE`)
- `opportunities.owner_id` → `users.id` (`ON DELETE NO ACTION`)
- `meddpicc_entries.opportunity_id` → `opportunities.id` (`ON DELETE CASCADE`)
- `meddpicc_section_meta.opportunity_id` → `opportunities.id` (`ON DELETE CASCADE`)
- `company_research.opportunity_id` → `opportunities.id` (`ON DELETE CASCADE`)
- `reminders.user_id` → `users.id` (`ON DELETE CASCADE`)
- Logical, non-declared relationships: `users.org_id`, `partners.org_id`, `internal_resources.org_id` → `organizations.id`; `internal_resources.manager_id` → `internal_resources.id`; `partner_resources.manager_id` → `partner_resources.id`; `partners.primary_contact_id` → `partner_resources.id`.

## Tables

### `organizations`

Tenant / organization records, including the organization-level MCP key.

| Column | PostgreSQL type | Constraints / defaults | Notes |
|---|---|---|---|
| `id` | `serial` | NOT NULL, primary key | — |
| `name` | `text` | NOT NULL | — |
| `mcp_key` | `text` | nullable; unique constraint added by migration 0001 | — |
| `created_at` | `timestamptz` | NOT NULL, default now() | — |

### `users`

Application users and their organization membership.

| Column | PostgreSQL type | Constraints / defaults | Notes |
|---|---|---|---|
| `id` | `serial` | NOT NULL, primary key | — |
| `email` | `text` | NOT NULL, unique | — |
| `password_hash` | `text` | NOT NULL | — |
| `name` | `text` | NOT NULL | — |
| `role` | `text` | NOT NULL, default rep | admin | rep |
| `quota` | `numeric(15,2)` | nullable | — |
| `region` | `text` | nullable | — |
| `org_id` | `integer` | nullable; no declared FK in current Drizzle source | organizations.id (logical) |
| `created_at` | `timestamptz` | NOT NULL, default now() | — |
| `updated_at` | `timestamptz` | NOT NULL, default now() | — |

### `profiles`

One profile/settings row per user.

| Column | PostgreSQL type | Constraints / defaults | Notes |
|---|---|---|---|
| `id` | `serial` | NOT NULL, primary key | — |
| `user_id` | `integer` | NOT NULL, unique | users.id ON DELETE CASCADE |
| `revenue_metric` | `text` | NOT NULL, default ACV | ACV | TCV | ARR | Bookings |
| `fiscal_year_start` | `text` | NOT NULL, default 1 | month 1–12 |
| `fiscal_year_end` | `text` | NOT NULL, default 12 | month 1–12 |
| `quota` | `numeric(15,2)` | nullable | — |
| `q1_goal_pct` | `numeric(5,2)` | nullable, default 25 | — |
| `q2_goal_pct` | `numeric(5,2)` | nullable, default 25 | — |
| `q3_goal_pct` | `numeric(5,2)` | nullable, default 25 | — |
| `q4_goal_pct` | `numeric(5,2)` | nullable, default 25 | — |
| `created_at` | `timestamptz` | NOT NULL, default now() | — |
| `updated_at` | `timestamptz` | NOT NULL, default now() | — |

### `partners`

GSI partner organizations.

| Column | PostgreSQL type | Constraints / defaults | Notes |
|---|---|---|---|
| `id` | `serial` | NOT NULL, primary key | — |
| `name` | `text` | NOT NULL | — |
| `tier` | `text` | nullable | — |
| `region` | `text` | nullable | — |
| `contact_name` | `text` | nullable; legacy free-text | — |
| `contact_email` | `text` | nullable; legacy free-text | — |
| `primary_contact_id` | `integer` | nullable; no declared Drizzle FK | partner_resources.id (logical / SQL constraint referenced in source) |
| `notes` | `jsonb` | NOT NULL, default [] | Note[] |
| `revenue_target` | `numeric(15,2)` | nullable | — |
| `org_id` | `integer` | nullable; no declared FK in current Drizzle source | organizations.id (logical) |
| `created_at` | `timestamptz` | NOT NULL, default now() | — |
| `updated_at` | `timestamptz` | NOT NULL, default now() | — |

### `internal_resources`

Internal people directory, optionally arranged in a manager hierarchy.

| Column | PostgreSQL type | Constraints / defaults | Notes |
|---|---|---|---|
| `id` | `serial` | NOT NULL, primary key | — |
| `name` | `text` | NOT NULL | — |
| `function` | `text` | nullable | — |
| `email` | `text` | nullable | — |
| `phone` | `text` | nullable | — |
| `location` | `text` | nullable | — |
| `is_manager` | `boolean` | NOT NULL, default false | — |
| `manager_id` | `integer` | nullable; no declared FK | internal_resources.id (logical) |
| `notes` | `jsonb` | NOT NULL, default [] | InternalResourceNote[] |
| `org_id` | `integer` | nullable; no declared FK | organizations.id (logical) |
| `created_at` | `timestamptz` | NOT NULL, default now() | — |
| `updated_at` | `timestamptz` | NOT NULL, default now() | — |

### `partner_resources`

People directory for each GSI partner, optionally arranged in a manager hierarchy.

| Column | PostgreSQL type | Constraints / defaults | Notes |
|---|---|---|---|
| `id` | `serial` | NOT NULL, primary key | — |
| `partner_id` | `integer` | NOT NULL | partners.id ON DELETE CASCADE |
| `name` | `text` | NOT NULL | — |
| `function` | `text` | nullable | — |
| `email` | `text` | nullable | — |
| `phone` | `text` | nullable | — |
| `location` | `text` | nullable | — |
| `is_manager` | `boolean` | NOT NULL, default false | — |
| `manager_id` | `integer` | nullable; no declared FK | partner_resources.id (logical) |
| `notes` | `jsonb` | NOT NULL, default [] | Note[] |
| `created_at` | `timestamptz` | NOT NULL, default now() | — |
| `updated_at` | `timestamptz` | NOT NULL, default now() | — |

### `opportunities`

Core opportunity and initiative records. Partner and owner are required.

| Column | PostgreSQL type | Constraints / defaults | Notes |
|---|---|---|---|
| `id` | `serial` | NOT NULL, primary key | — |
| `name` | `text` | NOT NULL | — |
| `type` | `text` | NOT NULL, default opportunity | opportunity | initiative |
| `partner_id` | `integer` | NOT NULL | partners.id ON DELETE CASCADE |
| `owner_id` | `integer` | NOT NULL | users.id |
| `stage` | `text` | NOT NULL, default Qualify | Qualify | Discovery | Propose | Negotiate | Commit | ClosedWon | ClosedLost | Dormant |
| `country` | `text` | nullable | — |
| `date_in` | `date` | nullable | — |
| `hpe_team` | `text` | nullable | — |
| `partner_contact` | `text` | nullable | — |
| `partner_contact_role` | `text` | nullable | — |
| `num_endpoints` | `integer` | nullable | — |
| `use_case` | `text` | nullable | — |
| `end_customer` | `text` | nullable | — |
| `end_customer_domain` | `text` | nullable | — |
| `revenue_value` | `numeric(15,2)` | nullable | — |
| `close_date` | `date` | nullable | — |
| `description` | `text` | nullable | — |
| `notes` | `jsonb` | NOT NULL, default [] | OppNote[] |
| `contacts` | `jsonb` | NOT NULL, default [] | OppContact[] |
| `meddpicc_score` | `numeric(5,2)` | nullable | server-computed weighted score |
| `closed_won_at` | `timestamptz` | nullable | set on first ClosedWon transition |
| `created_at` | `timestamptz` | NOT NULL, default now() | — |
| `updated_at` | `timestamptz` | NOT NULL, default now() | — |

### `meddpicc_entries`

Rep-authored MEDDPICC qualification entries per opportunity.

| Column | PostgreSQL type | Constraints / defaults | Notes |
|---|---|---|---|
| `id` | `serial` | NOT NULL, primary key | — |
| `opportunity_id` | `integer` | NOT NULL | opportunities.id ON DELETE CASCADE |
| `element` | `text` | NOT NULL | Metrics / EconomicBuyer / DecisionCriteria / DecisionProcess / IdentifyPain / Champion / Competition / PaperProcess |
| `content` | `text` | NOT NULL | — |
| `customer_validated` | `boolean` | NOT NULL, default false | — |
| `relevance_score` | `integer` | nullable | 1–5 |
| `created_at` | `timestamptz` | NOT NULL, default now() | — |
| `updated_at` | `timestamptz` | NOT NULL, default now() | — |

### `meddpicc_section_meta`

One per-opportunity, per-MEDDPICC-element working area.

| Column | PostgreSQL type | Constraints / defaults | Notes |
|---|---|---|---|
| `id` | `serial` | NOT NULL, primary key | — |
| `opportunity_id` | `integer` | NOT NULL | opportunities.id ON DELETE CASCADE |
| `element` | `text` | NOT NULL | MEDDPICC element |
| `notes` | `jsonb` | NOT NULL, default [] | Note[] |
| `contact_ids` | `jsonb` | NOT NULL, default [] | string[]; identifiers in opportunity contacts JSON |
| `owner_id` | `text` | nullable | identifier in opportunity contacts JSON |
| `created_at` | `timestamptz` | NOT NULL, default now() | — |
| `updated_at` | `timestamptz` | NOT NULL, default now() | — |

**Unique constraints:** `meddpicc_section_meta_opp_element` on `(opportunity_id, element)`.

### `company_research`

AI-synthesized company intelligence for one opportunity; presentation-only.

| Column | PostgreSQL type | Constraints / defaults | Notes |
|---|---|---|---|
| `id` | `serial` | NOT NULL, primary key | — |
| `opportunity_id` | `integer` | NOT NULL, unique | opportunities.id ON DELETE CASCADE |
| `company_name` | `text` | NOT NULL | — |
| `company_domain` | `text` | nullable | — |
| `industry` | `text` | nullable | — |
| `location` | `text` | nullable | — |
| `overview` | `text` | nullable | — |
| `sections` | `jsonb` | NOT NULL, default [] | CompanyResearchSection[] |
| `status` | `text` | NOT NULL, default ready | ready | error |
| `error` | `text` | nullable | — |
| `generated_at` | `timestamptz` | nullable | — |
| `created_at` | `timestamptz` | NOT NULL, default now() | — |
| `updated_at` | `timestamptz` | NOT NULL, default now() | — |

### `reminders`

Personal reminders with optional generic entity association.

| Column | PostgreSQL type | Constraints / defaults | Notes |
|---|---|---|---|
| `id` | `serial` | NOT NULL, primary key | — |
| `user_id` | `integer` | NOT NULL | users.id ON DELETE CASCADE |
| `name` | `text` | NOT NULL | — |
| `due_at` | `timestamptz` | NOT NULL | — |
| `entity_type` | `text` | nullable | generic association type |
| `entity_id` | `text` | nullable | generic association identifier |
| `entity_label` | `text` | nullable | generic association display label |
| `notes` | `text` | nullable | — |
| `completed_at` | `timestamptz` | nullable | NULL = open |
| `created_at` | `timestamptz` | NOT NULL, default now() | — |

### `geocode_cache`

Server-side positive and negative geocoding cache for normalized free-text locations.

| Column | PostgreSQL type | Constraints / defaults | Notes |
|---|---|---|---|
| `id` | `serial` | NOT NULL, primary key | — |
| `query` | `text` | NOT NULL, unique | normalized / lowercased cache key |
| `canonical_name` | `text` | nullable | — |
| `lat` | `double precision` | nullable | — |
| `lon` | `double precision` | nullable | — |
| `resolved` | `boolean` | NOT NULL, default false | false also stores negative cache entries |
| `source` | `text` | nullable | nominatim | ai+nominatim | ai |
| `created_at` | `timestamptz` | NOT NULL, default now() | — |
| `updated_at` | `timestamptz` | NOT NULL, default now() | — |

### `data_migrations`

One-shot data migration tracking table created by migration 0003 when that migration is applied.

| Column | PostgreSQL type | Constraints / defaults | Notes |
|---|---|---|---|
| `name` | `text` | NOT NULL, primary key | — |
| `applied_at` | `timestamptz` | NOT NULL, default now() | — |

## Migration & Security Notes

- `0001_mcp_rls.sql` adds `organizations.mcp_key` as a unique column, creates the non-login `mcp_reader` role, grants read access, and enables PostgreSQL row-level security on tenant data tables.
- `0002_contact_location.sql` adds `location` to both people directories.
- `0003_extract_contact_locations.sql` introduces `data_migrations` and runs a one-time cleanup to move reviewed parenthesized location strings into dedicated fields.
- `0004_geocode_cache.sql` creates `geocode_cache`.
- AI company research remains presentation-only and must not influence `opportunities.meddpicc_score`.
