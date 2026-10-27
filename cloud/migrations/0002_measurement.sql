-- Additive paid-invoice measurement; existing access/billing tables are unchanged.
CREATE TABLE IF NOT EXISTS payment_receipts (
  invoice_id TEXT PRIMARY KEY NOT NULL,
  user_id TEXT NOT NULL REFERENCES users(id),
  subscription_id TEXT NOT NULL,
  paid_at INTEGER NOT NULL CHECK (paid_at > 0),
  amount_paid INTEGER NOT NULL CHECK (amount_paid > 0),
  currency TEXT NOT NULL CHECK (length(currency) = 3)
);
CREATE INDEX IF NOT EXISTS payment_receipts_user_paid ON payment_receipts(user_id, paid_at, invoice_id);
