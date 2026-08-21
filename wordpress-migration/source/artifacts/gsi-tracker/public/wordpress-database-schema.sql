-- ============================================================================
-- GSI Partner Opportunity Tracker — WordPress (MySQL/MariaDB) Database Schema
-- ============================================================================
-- Companion file to wordpress-rebuild-prompt.md.
-- This is a faithful translation of the production PostgreSQL schema into
-- MySQL DDL using WordPress conventions (wp_ table prefix, utf8mb4).
--
-- Conventions used throughout:
--   * All tables use the `wp_gsi_` prefix (change `wp_` to your site prefix).
--   * PostgreSQL SERIAL        -> BIGINT UNSIGNED AUTO_INCREMENT
--   * PostgreSQL TIMESTAMPTZ   -> DATETIME, stored in UTC
--   * PostgreSQL JSONB         -> JSON
--   * PostgreSQL NUMERIC(p,s)  -> DECIMAL(p,s)
--   * "Timestamped notes" JSON columns hold an array of objects:
--       [{ "id": "<uuid>", "text": "<string>", "createdAt": "<ISO-8601>" }]
--     Notes are appended/deleted individually, never overwritten as a blob.
--
-- USER ACCOUNTS: Two valid approaches in WordPress —
--   (A) RECOMMENDED: use native wp_users + wp_usermeta, adding custom roles
--       `gsi_admin` and `gsi_rep`, and usermeta keys: gsi_org_id, gsi_region,
--       gsi_quota. In that case SKIP the wp_gsi_users table below and point
--       every `user_id` / `owner_id` FK at wp_users.ID instead.
--   (B) Standalone custom table (defined below) if the builder prefers to
--       keep application users separate from WordPress accounts.
-- Either way, passwords must be hashed (WordPress's phpass/bcrypt is fine).
-- ============================================================================

SET NAMES utf8mb4;

-- ----------------------------------------------------------------------------
-- 1. ORGANIZATIONS — multi-tenant root. Every user, partner, and (through the
--    partner) every opportunity belongs to exactly one organization. All
--    queries MUST be filtered by the current user's org_id server-side.
-- ----------------------------------------------------------------------------
CREATE TABLE wp_gsi_organizations (
  id          BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  name        VARCHAR(255)    NOT NULL,
  -- API key for external AI/integration access (nullable until generated).
  -- Store a securely generated random token; treat like a password.
  mcp_key     VARCHAR(255)    NULL,
  created_at  DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ----------------------------------------------------------------------------
-- 2. USERS — application accounts (see note above about option A vs B).
--    role: 'admin' (full access, user management, exports)
--          'rep'   (default; manages partners/opportunities, no user admin)
-- ----------------------------------------------------------------------------
CREATE TABLE wp_gsi_users (
  id             BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  email          VARCHAR(255)    NOT NULL,
  password_hash  VARCHAR(255)    NOT NULL,
  name           VARCHAR(255)    NOT NULL,
  role           VARCHAR(20)     NOT NULL DEFAULT 'rep',   -- 'admin' | 'rep'
  quota          DECIMAL(15,2)   NULL,                     -- annual quota ($)
  region         VARCHAR(255)    NULL,
  org_id         BIGINT UNSIGNED NULL,
  created_at     DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at     DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP
                                 ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_gsi_users_email (email),
  KEY idx_gsi_users_org (org_id),
  CONSTRAINT fk_gsi_users_org FOREIGN KEY (org_id)
    REFERENCES wp_gsi_organizations (id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ----------------------------------------------------------------------------
-- 3. PROFILES — one row per user; personal fiscal/quota preferences that
--    drive the Dashboard KPI calculations.
-- ----------------------------------------------------------------------------
CREATE TABLE wp_gsi_profiles (
  id                 BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  user_id            BIGINT UNSIGNED NOT NULL,
  revenue_metric     VARCHAR(20)     NOT NULL DEFAULT 'ACV',  -- ACV|TCV|ARR|Bookings
  fiscal_year_start  TINYINT         NOT NULL DEFAULT 1,      -- month 1-12
  fiscal_year_end    TINYINT         NOT NULL DEFAULT 12,     -- month 1-12
  quota              DECIMAL(15,2)   NULL,
  q1_goal_pct        DECIMAL(5,2)    NULL DEFAULT 25.00,      -- quarterly split
  q2_goal_pct        DECIMAL(5,2)    NULL DEFAULT 25.00,      --   of quota;
  q3_goal_pct        DECIMAL(5,2)    NULL DEFAULT 25.00,      --   should sum
  q4_goal_pct        DECIMAL(5,2)    NULL DEFAULT 25.00,      --   to 100
  created_at         DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at         DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP
                                     ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_gsi_profiles_user (user_id),
  CONSTRAINT fk_gsi_profiles_user FOREIGN KEY (user_id)
    REFERENCES wp_gsi_users (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ----------------------------------------------------------------------------
-- 4. PARTNERS — GSI partner companies. Org-scoped.
-- ----------------------------------------------------------------------------
CREATE TABLE wp_gsi_partners (
  id                  BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  name                VARCHAR(255)    NOT NULL,
  tier                VARCHAR(100)    NULL,
  region              VARCHAR(255)    NULL,
  -- Legacy free-text contact fields (read-only in the UI; kept for imports).
  contact_name        VARCHAR(255)    NULL,
  contact_email       VARCHAR(255)    NULL,
  -- Canonical primary contact: FK to wp_gsi_partner_resources. The FK
  -- constraint is added AFTER that table is created (circular reference).
  primary_contact_id  BIGINT UNSIGNED NULL,
  -- Timestamped notes JSON array (see header).
  notes               JSON            NOT NULL,
  revenue_target      DECIMAL(15,2)   NULL,
  org_id              BIGINT UNSIGNED NULL,
  created_at          DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at          DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP
                                      ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_gsi_partners_org (org_id),
  CONSTRAINT fk_gsi_partners_org FOREIGN KEY (org_id)
    REFERENCES wp_gsi_organizations (id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ----------------------------------------------------------------------------
-- 5. PARTNER RESOURCES — people who work at a partner company (the partner's
--    contact directory). Self-referencing manager_id builds a reporting
--    hierarchy within the partner.
-- ----------------------------------------------------------------------------
CREATE TABLE wp_gsi_partner_resources (
  id          BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  partner_id  BIGINT UNSIGNED NOT NULL,
  name        VARCHAR(255)    NOT NULL,
  function    VARCHAR(255)    NULL,      -- job function / role title
  email       VARCHAR(255)    NULL,
  phone       VARCHAR(100)    NULL,
  is_manager  TINYINT(1)      NOT NULL DEFAULT 0,
  manager_id  BIGINT UNSIGNED NULL,      -- self-reference within this table
  notes       JSON            NOT NULL,  -- timestamped notes array
  created_at  DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at  DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP
                              ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_gsi_partner_resources_partner (partner_id),
  KEY idx_gsi_partner_resources_manager (manager_id),
  CONSTRAINT fk_gsi_partner_resources_partner FOREIGN KEY (partner_id)
    REFERENCES wp_gsi_partners (id) ON DELETE CASCADE,
  CONSTRAINT fk_gsi_partner_resources_manager FOREIGN KEY (manager_id)
    REFERENCES wp_gsi_partner_resources (id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Now that partner_resources exists, add the deferred FK from partners:
ALTER TABLE wp_gsi_partners
  ADD CONSTRAINT fk_gsi_partners_primary_contact
  FOREIGN KEY (primary_contact_id)
  REFERENCES wp_gsi_partner_resources (id) ON DELETE SET NULL;

-- ----------------------------------------------------------------------------
-- 6. INTERNAL RESOURCES — the rep's own company's people directory
--    (specialists, SEs, managers). Org-scoped. Mirrors partner_resources.
-- ----------------------------------------------------------------------------
CREATE TABLE wp_gsi_internal_resources (
  id          BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  name        VARCHAR(255)    NOT NULL,
  function    VARCHAR(255)    NULL,
  email       VARCHAR(255)    NULL,
  phone       VARCHAR(100)    NULL,
  is_manager  TINYINT(1)      NOT NULL DEFAULT 0,
  manager_id  BIGINT UNSIGNED NULL,      -- self-reference (reporting chain)
  notes       JSON            NOT NULL,  -- timestamped notes array
  org_id      BIGINT UNSIGNED NULL,
  created_at  DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at  DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP
                              ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_gsi_internal_resources_org (org_id),
  KEY idx_gsi_internal_resources_manager (manager_id),
  CONSTRAINT fk_gsi_internal_resources_manager FOREIGN KEY (manager_id)
    REFERENCES wp_gsi_internal_resources (id) ON DELETE SET NULL,
  CONSTRAINT fk_gsi_internal_resources_org FOREIGN KEY (org_id)
    REFERENCES wp_gsi_organizations (id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ----------------------------------------------------------------------------
-- 7. OPPORTUNITIES — the core entity. One row per deal/lead.
--
--    stage values: 'Qualify' (default) | 'Discovery' | 'Propose' |
--                  'Negotiate' | 'Commit' | 'ClosedWon' | 'ClosedLost' |
--                  'Dormant'
--       Active   = Qualify, Discovery, Propose, Negotiate, Commit
--       Terminal = ClosedWon, ClosedLost, Dormant (shown on Outcomes page)
--
--    type values:  'opportunity' (default) | 'initiative'
--
--    meddpicc_score: 0.00-100.00, COMPUTED SERVER-SIDE whenever a row in
--       wp_gsi_meddpicc_entries for this opportunity is created, updated,
--       or deleted. Never accept this value from the client. Formula is in
--       wordpress-rebuild-prompt.md section 4.
--
--    closed_won_at: set server-side to NOW() the FIRST time stage becomes
--       'ClosedWon'. Never cleared on reopen; never overwritten if the deal
--       is re-closed.
--
--    contacts JSON array — deal-specific contact objects:
--       [{ "id": "<uuid>", "name": "...", "email": null, "phone": null,
--          "role": null, "location": null,
--          "org": "HPE" | "Partner" | "Customer" | "Other",
--          "directoryRef": "internal:<id>" | "partner:<id>" | null,
--          "createdAt": "<ISO-8601>" }]
--       directoryRef optionally links a contact back to the internal or
--       partner people directory.
-- ----------------------------------------------------------------------------
CREATE TABLE wp_gsi_opportunities (
  id                    BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  name                  VARCHAR(255)    NOT NULL,
  type                  VARCHAR(20)     NOT NULL DEFAULT 'opportunity',
  partner_id            BIGINT UNSIGNED NOT NULL,
  owner_id              BIGINT UNSIGNED NOT NULL,   -- the rep who owns the deal
  stage                 VARCHAR(20)     NOT NULL DEFAULT 'Qualify',
  -- Deal metadata
  country               VARCHAR(100)    NULL,
  date_in               DATE            NULL,       -- date the deal came in
  hpe_team              VARCHAR(255)    NULL,       -- internal team engaged
  partner_contact       VARCHAR(255)    NULL,       -- free-text name
  partner_contact_role  VARCHAR(255)    NULL,
  num_endpoints         INT             NULL,       -- deal size in endpoints
  use_case              VARCHAR(255)    NULL,
  end_customer          VARCHAR(255)    NULL,       -- end-customer company name
  end_customer_domain   VARCHAR(255)    NULL,       -- canonical domain, e.g. "acme.com"
  revenue_value         DECIMAL(15,2)   NULL,
  close_date            DATE            NULL,
  description           TEXT            NULL,
  notes                 JSON            NOT NULL,   -- timestamped notes array
  contacts              JSON            NOT NULL,   -- contact objects (see above)
  meddpicc_score        DECIMAL(5,2)    NULL,       -- 0-100, server-computed
  closed_won_at         DATETIME        NULL,
  created_at            DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at            DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP
                                        ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_gsi_opportunities_partner (partner_id),
  KEY idx_gsi_opportunities_owner (owner_id),
  KEY idx_gsi_opportunities_stage (stage),
  KEY idx_gsi_opportunities_close_date (close_date),
  CONSTRAINT fk_gsi_opportunities_partner FOREIGN KEY (partner_id)
    REFERENCES wp_gsi_partners (id) ON DELETE CASCADE,
  CONSTRAINT fk_gsi_opportunities_owner FOREIGN KEY (owner_id)
    REFERENCES wp_gsi_users (id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ----------------------------------------------------------------------------
-- 8. MEDDPICC ENTRIES — the ONLY input to the weighted MEDDPICC score.
--    One row per rep-authored note per element per opportunity.
--
--    element values (exactly these 8 keys):
--      'metrics' | 'economic_buyer' | 'decision_criteria' |
--      'decision_process' | 'paper_process' | 'identify_pain' |
--      'champion' | 'competition'
-- ----------------------------------------------------------------------------
CREATE TABLE wp_gsi_meddpicc_entries (
  id                  BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  opportunity_id      BIGINT UNSIGNED NOT NULL,
  element             VARCHAR(30)     NOT NULL,
  content             TEXT            NOT NULL,
  customer_validated  TINYINT(1)      NOT NULL DEFAULT 0,
  relevance_score     TINYINT         NULL,      -- 1-5, nullable
  created_at          DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at          DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP
                                      ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_gsi_meddpicc_entries_opp (opportunity_id),
  KEY idx_gsi_meddpicc_entries_opp_element (opportunity_id, element),
  CONSTRAINT fk_gsi_meddpicc_entries_opp FOREIGN KEY (opportunity_id)
    REFERENCES wp_gsi_opportunities (id) ON DELETE CASCADE,
  CONSTRAINT chk_gsi_meddpicc_relevance
    CHECK (relevance_score IS NULL OR relevance_score BETWEEN 1 AND 5)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ----------------------------------------------------------------------------
-- 9. MEDDPICC SECTION META — per-opportunity, per-element working area:
--    the rep's free-form section notes and which deal contacts are associated
--    with the element. Feeds AI research context. PRESENTATION-ONLY:
--    this table NEVER affects the weighted MEDDPICC score.
--
--    contact_ids JSON: array of contact id strings referencing entries in
--      wp_gsi_opportunities.contacts (the JSON column), e.g. ["<uuid>", ...]
--    owner_id: the contact id (string, from the same contacts array)
--      designated as the key person for this element; nullable.
-- ----------------------------------------------------------------------------
CREATE TABLE wp_gsi_meddpicc_section_meta (
  id              BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  opportunity_id  BIGINT UNSIGNED NOT NULL,
  element         VARCHAR(30)     NOT NULL,   -- same 8 keys as entries table
  notes           JSON            NOT NULL,   -- timestamped notes array
  contact_ids     JSON            NOT NULL,   -- ["<contact uuid>", ...]
  owner_id        VARCHAR(64)     NULL,       -- contact uuid string, not an FK
  created_at      DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at      DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP
                                  ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_gsi_section_meta_opp_element (opportunity_id, element),
  CONSTRAINT fk_gsi_section_meta_opp FOREIGN KEY (opportunity_id)
    REFERENCES wp_gsi_opportunities (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ----------------------------------------------------------------------------
-- 10. COMPANY RESEARCH — AI-generated end-customer intelligence, one row per
--     opportunity (upserted). PRESENTATION-ONLY: never feeds the MEDDPICC
--     score. MUST be deleted/cleared whenever the opportunity's
--     end_customer_domain changes (stale-intel rule).
--
--     sections JSON: one AI summary per MEDDPICC element:
--       [{ "element": "<one of the 8 keys>",
--          "summary": "<paragraph>",
--          "sources": [{ "title": "...", "url": "..." }] }]
-- ----------------------------------------------------------------------------
CREATE TABLE wp_gsi_company_research (
  id              BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  opportunity_id  BIGINT UNSIGNED NOT NULL,
  company_name    VARCHAR(255)    NOT NULL,
  company_domain  VARCHAR(255)    NULL,
  industry        VARCHAR(255)    NULL,
  location        VARCHAR(255)    NULL,
  overview        TEXT            NULL,
  sections        JSON            NOT NULL,
  status          VARCHAR(20)     NOT NULL DEFAULT 'ready',  -- 'ready' | 'error'
  error           TEXT            NULL,
  generated_at    DATETIME        NULL,
  created_at      DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at      DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP
                                  ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_gsi_company_research_opp (opportunity_id),
  CONSTRAINT fk_gsi_company_research_opp FOREIGN KEY (opportunity_id)
    REFERENCES wp_gsi_opportunities (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ----------------------------------------------------------------------------
-- 11. REMINDERS — per-user follow-up tasks. A reminder can generically point
--     at the record it was created from via entity_type/entity_id/entity_label
--     (no hard FK, since it may reference an opportunity, partner, internal
--     or partner resource, or a MEDDPICC section).
--
--     entity_type examples: 'opportunity' | 'partner' | 'internal_resource' |
--                           'partner_resource' | 'meddpicc_section' | NULL
-- ----------------------------------------------------------------------------
CREATE TABLE wp_gsi_reminders (
  id            BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  user_id       BIGINT UNSIGNED NOT NULL,
  name          VARCHAR(255)    NOT NULL,
  due_at        DATETIME        NOT NULL,
  entity_type   VARCHAR(50)     NULL,
  entity_id     VARCHAR(64)     NULL,     -- string: may be a numeric id or uuid
  entity_label  VARCHAR(255)    NULL,     -- display label, e.g. deal name
  notes         TEXT            NULL,     -- free text (NOT the JSON notes pattern)
  completed_at  DATETIME        NULL,     -- NULL = open, set = done
  created_at    DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_gsi_reminders_user (user_id),
  KEY idx_gsi_reminders_due (due_at),
  CONSTRAINT fk_gsi_reminders_user FOREIGN KEY (user_id)
    REFERENCES wp_gsi_users (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ============================================================================
-- RELATIONSHIP SUMMARY
-- ============================================================================
-- organizations 1─* users, partners, internal_resources   (org_id, tenant scope)
-- users         1─1 profiles                              (cascade delete)
-- users         1─* opportunities (owner), reminders      (reminders cascade)
-- partners      1─* partner_resources, opportunities      (both cascade delete)
-- partners      *─1 partner_resources (primary_contact_id, SET NULL)
-- opportunities 1─* meddpicc_entries                      (cascade delete)
-- opportunities 1─1 meddpicc_section_meta per element     (cascade delete,
--                                                          unique opp+element)
-- opportunities 1─1 company_research                      (cascade delete)
-- partner_resources / internal_resources: self-referencing manager_id
--
-- SERVER-SIDE INVARIANTS (enforce in PHP, not just the schema):
--  1. meddpicc_score is recomputed from wp_gsi_meddpicc_entries on every
--     entry create/update/delete. Never trusted from the client.
--  2. closed_won_at is set once, on the first transition to stage='ClosedWon'.
--  3. Changing end_customer_domain deletes the wp_gsi_company_research row.
--  4. Every query is scoped to the requesting user's org_id.
--  5. AI content (company_research, section_meta) never affects scoring.
-- ============================================================================
