-- Move parenthesized locations embedded in contact name/function fields into the
-- dedicated location column, e.g. "Andy Haigh (London)" -> name "Andy Haigh",
-- location "London"; "Senior Solutions Lead (Finland)" -> function stripped,
-- location "Finland".
--
-- Extraction is whitelist-based: only parentheticals exactly matching a value in
-- the reviewed list below (validated against every affected production row) are
-- treated as locations. Any other parenthetical ("(ex CTO)", "(EMEA)", "(GSI)",
-- "(CloudOps)", nicknames, credentials, etc.) is left completely untouched, and
-- only the single matched parenthetical is removed from the source field.
--
-- This is a one-shot data migration: it records itself in data_migrations and
-- is a no-op on every subsequent run, so rows created later are never rewritten.
CREATE TABLE IF NOT EXISTS data_migrations (
  name text PRIMARY KEY,
  applied_at timestamptz NOT NULL DEFAULT now()
);

DO $$
DECLARE
  -- Reviewed against actual data on 2026-08-07: every value below appeared as a
  -- parenthesized location in an existing contact name or function field.
  allowed text[] := ARRAY[
    'London', 'UK', 'MI', 'MO', 'India', 'Denmark', 'NC', 'Finland', 'Czechia',
    'AZ', 'NY', 'Mexico', 'Atlanta', 'Spain', 'Miss', 'Dallas', 'Austin',
    'Bulgaria', 'Bangalor', 'Brussels', 'Slovakia', 'Toronto', 'Mumbai', 'Fl',
    'Cinci', 'Bangalore', 'West Bengal', 'Boston', 'Georgia', 'NJ', 'Dubai',
    'Noida', 'Dibia', 'Casper', 'DC', 'FL', 'NYC', 'IL', 'PA'
  ];
BEGIN
  IF EXISTS (SELECT 1 FROM data_migrations WHERE name = '0003_extract_contact_locations') THEN
    RETURN;
  END IF;

  -- Directory tables: whitelisted parenthetical in the name field.
  -- Non-global regexp_replace removes only the first (matched) parenthetical.
  UPDATE partner_resources SET
    location = (regexp_match(name, '\(\s*([^)]+?)\s*\)'))[1],
    name = btrim(regexp_replace(name, '\s*\([^)]*\)', ''))
  WHERE name ~ '\('
    AND COALESCE(location, '') = ''
    AND (regexp_match(name, '\(\s*([^)]+?)\s*\)'))[1] = ANY (allowed);

  UPDATE internal_resources SET
    location = (regexp_match(name, '\(\s*([^)]+?)\s*\)'))[1],
    name = btrim(regexp_replace(name, '\s*\([^)]*\)', ''))
  WHERE name ~ '\('
    AND COALESCE(location, '') = ''
    AND (regexp_match(name, '\(\s*([^)]+?)\s*\)'))[1] = ANY (allowed);

  -- Directory tables: whitelisted parenthetical in the function field
  UPDATE partner_resources SET
    location = (regexp_match(function, '\(\s*([^)]+?)\s*\)'))[1],
    function = btrim(regexp_replace(function, '\s*\([^)]*\)', ''))
  WHERE function ~ '\('
    AND COALESCE(location, '') = ''
    AND (regexp_match(function, '\(\s*([^)]+?)\s*\)'))[1] = ANY (allowed);

  UPDATE internal_resources SET
    location = (regexp_match(function, '\(\s*([^)]+?)\s*\)'))[1],
    function = btrim(regexp_replace(function, '\s*\([^)]*\)', ''))
  WHERE function ~ '\('
    AND COALESCE(location, '') = ''
    AND (regexp_match(function, '\(\s*([^)]+?)\s*\)'))[1] = ANY (allowed);

  -- Opportunity contacts (jsonb array): whitelisted parenthetical in name or role
  UPDATE opportunities o SET contacts = (
    SELECT jsonb_agg(
      CASE
        WHEN COALESCE(c->>'location', '') = '' AND c->>'name' ~ '\('
             AND (regexp_match(c->>'name', '\(\s*([^)]+?)\s*\)'))[1] = ANY (allowed)
        THEN c || jsonb_build_object(
               'name', btrim(regexp_replace(c->>'name', '\s*\([^)]*\)', '')),
               'location', (regexp_match(c->>'name', '\(\s*([^)]+?)\s*\)'))[1])
        WHEN COALESCE(c->>'location', '') = '' AND c->>'role' ~ '\('
             AND (regexp_match(c->>'role', '\(\s*([^)]+?)\s*\)'))[1] = ANY (allowed)
        THEN c || jsonb_build_object(
               'role', btrim(regexp_replace(c->>'role', '\s*\([^)]*\)', '')),
               'location', (regexp_match(c->>'role', '\(\s*([^)]+?)\s*\)'))[1])
        ELSE c
      END ORDER BY ord)
    FROM jsonb_array_elements(o.contacts) WITH ORDINALITY AS t(c, ord)
  )
  WHERE jsonb_array_length(COALESCE(o.contacts, '[]'::jsonb)) > 0
    AND EXISTS (
      SELECT 1 FROM jsonb_array_elements(o.contacts) c2
      WHERE c2->>'name' LIKE '%(%' OR c2->>'role' LIKE '%(%'
    );

  INSERT INTO data_migrations (name) VALUES ('0003_extract_contact_locations');
END $$;
