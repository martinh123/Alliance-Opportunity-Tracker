-- Geocoding cache for free-text contact locations (idempotent DDL).
CREATE TABLE IF NOT EXISTS geocode_cache (
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
