-- The waitlist. `email` is the primary key and is stored lower-cased by the worker, so a
-- re-submission collides instead of creating a second row (and instead of sending a second
-- notification). created_at is UTC.
CREATE TABLE IF NOT EXISTS access_requests (
  email      TEXT PRIMARY KEY,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  source     TEXT
);

CREATE INDEX IF NOT EXISTS access_requests_created_at ON access_requests (created_at);
