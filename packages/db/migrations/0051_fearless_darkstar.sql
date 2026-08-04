-- IF NOT EXISTS: the stranded fact-gate branch's own migration (old 0046_stormy_thunderbolts) already
-- added this column to DBs that ran the 2026-07-25 News Today PH production; fresh DBs get it here.
ALTER TABLE "channels" ADD COLUMN IF NOT EXISTS "fact_check" boolean DEFAULT false NOT NULL;
