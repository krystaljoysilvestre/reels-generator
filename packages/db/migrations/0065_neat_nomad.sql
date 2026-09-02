-- Some pre-migration production laps created this column through the schema sync path. Keep the
-- migration replay-safe so those databases can adopt the ledger without dropping their reel data.
ALTER TABLE "scenes" ADD COLUMN IF NOT EXISTS "depiction_basis" text DEFAULT 'reconstruction' NOT NULL;
