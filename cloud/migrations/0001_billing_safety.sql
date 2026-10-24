-- Additive upgrade for an existing database initialized by cloud/schema.sql.
-- Safe for new databases too; existing users, trials and sessions are unchanged.
CREATE TABLE IF NOT EXISTS billing_state (
  user_id TEXT PRIMARY KEY REFERENCES users(id),
  lock_token TEXT,
  lock_expires INTEGER NOT NULL DEFAULT 0,
  checkout_key TEXT,
  checkout_params TEXT,
  checkout_session TEXT,
  checkout_url TEXT,
  checkout_expires INTEGER
);
CREATE TABLE IF NOT EXISTS stripe_events (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id),
  processed_at INTEGER NOT NULL
);
