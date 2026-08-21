-- Add a location field to both people directories.
-- Idempotent: safe to run on databases where the column already exists.
ALTER TABLE partner_resources ADD COLUMN IF NOT EXISTS location text;
ALTER TABLE internal_resources ADD COLUMN IF NOT EXISTS location text;
