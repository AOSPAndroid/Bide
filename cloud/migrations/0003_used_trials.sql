-- Deleted accounts: a hash of the email and when its trial ended, so a new
-- account for the same email does not get a second trial.
CREATE TABLE IF NOT EXISTS used_trials (
  email_hash TEXT PRIMARY KEY,
  trial_ends INTEGER NOT NULL
);
