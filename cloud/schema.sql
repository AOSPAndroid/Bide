-- bide licence server (Cloudflare D1 / SQLite).
CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY,
  email TEXT NOT NULL UNIQUE,
  created_at INTEGER NOT NULL,
  trial_ends INTEGER NOT NULL,
  stripe_customer TEXT,
  subscription_id TEXT,
  subscription_status TEXT,
  paid_until INTEGER
);
CREATE INDEX IF NOT EXISTS users_customer ON users(stripe_customer);
-- One-time sign-in codes, stored hashed; a few attempts each.
CREATE TABLE IF NOT EXISTS codes (
  email TEXT NOT NULL,
  hash TEXT NOT NULL,
  expires INTEGER NOT NULL,
  attempts INTEGER NOT NULL DEFAULT 0,
  created_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS codes_email ON codes(email);
-- Sign-in sessions, stored hashed.
CREATE TABLE IF NOT EXISTS sessions (
  hash TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  expires INTEGER NOT NULL
);
-- Deleted accounts: a hash of the email and when its trial ended, so a new
-- account for the same email does not get a second trial.
CREATE TABLE IF NOT EXISTS used_trials (
  email_hash TEXT PRIMARY KEY,
  trial_ends INTEGER NOT NULL
);
