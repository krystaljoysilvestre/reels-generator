-- Where a seed topic came from: 'creator' (compiled from what they wrote, or typed by them later) vs
-- 'generated' (the engine replenished a dry queue on their behalf, so they never have to do data entry).
--
-- Worth a column rather than being inferred: for a channel about REAL subjects — folklore, history, real
-- places — a generated topic is the one row that could be fabricated, and each one becomes a whole
-- published video. Keeping the distinction on the row is what makes "which of these did we invent?"
-- answerable later, for review and for measuring the invention rate honestly.
ALTER TABLE "series_topics" ADD COLUMN IF NOT EXISTS "origin" text DEFAULT 'creator' NOT NULL;
