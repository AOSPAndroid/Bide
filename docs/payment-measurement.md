# Paid invoice measurement

This code is ready for the paid Cloudflare deployment. The public static demo does not run Stripe webhooks or collect these payment records. Deploying pages alone does not activate payment measurement.

## Activate with the paid service

1. Initialize a new database using `cloud/schema.sql`, or apply `cloud/migrations/0002_measurement.sql` to the existing paid-service database after the existing billing migration. The measurement migration is additive and can be reapplied.
2. Configure the existing Stripe secret key, Bide price ID and webhook secret. Use separate test and live databases and matching Stripe keys/webhook secrets.
3. Subscribe the existing signed webhook endpoint `/api/stripe/webhook` to `invoice.paid` in addition to its existing Checkout/subscription events.
4. Deploy the updated Worker, complete a Stripe test purchase, and inspect `payment_receipts`. Replay the same event and confirm there is still one row. Repeat with a new invoice to check repeat payments.

The handler checks the signature before measurement. It retrieves the invoice using the billing client's pinned Stripe API version, requires a paid invoice with a positive amount, checks the exact configured Bide price on its complete line list, and maps only an already-stored Stripe customer to a Bide user. Fully discounted or zero-value Bide lines do not qualify. Unrelated customers and products are ignored. Metadata and browser payment-return URLs cannot create receipts.

The receipt is keyed by invoice ID, not webhook event ID. Separate deliveries or event IDs for one invoice therefore count once. Storage failures return a retryable response for `invoice.paid`; other billing event types do not depend on the measurement table. Receipt writes never alter subscription access, trials, licences or the existing entitlement event deduplication.

## Definitions and limits

- `paid_at` is Stripe's payment timestamp converted to UTC epoch milliseconds. It is not webhook delivery time.
- `amount_paid` is the gross amount paid on the whole qualifying invoice in the currency's smallest unit. Do not assume every currency has two decimal places or add different currencies together.
- A qualifying invoice can contain other products as well as a positively charged Bide line. The recorded total is the whole invoice; it is not an allocation of Bide-only revenue.
- Stripe's `invoice.paid` includes invoices marked paid out of band. These records are confirmed paid invoices, not proof of a card collection.
- The records do not deduct tax, payment fees, refunds, disputes or later credit notes and therefore are not net revenue or profit.
- The first stored qualifying payment for an account is a **first observed paid conversion**. Earlier history is not automatically backfilled.
- A later paid invoice is a **repeat payment**. It may be a billing-cycle renewal, a proration, an upgrade or a reactivation. The six stored fields do not establish which of those occurred. Use Stripe's invoice billing reason if exact renewal classification is needed.
- Matching the single configured `STRIPE_PRICE_ID` means an old price is excluded after a price change. Update the measurement policy before introducing multiple paid prices.
- This dataset contains account/invoice identifiers and money amounts, never document contents, file names, search queries or browser visitor identifiers. It does not join an anonymous visit to a payment.

The authoritative references are [Stripe invoice fields](https://docs.stripe.com/api/invoices/object?api-version=2025-02-24.acacia) and [Stripe event definitions](https://docs.stripe.com/api/events/types).

## Read-only reports

Count first observed paid conversions and repeat payments per UTC day. Ranking all history before filtering dates handles delayed and out-of-order webhook delivery correctly. The invoice ID breaks ties between identical timestamps deterministically; it does not imply a causal order between payments made in the same second.

```sql
WITH ordered AS (
  SELECT *, ROW_NUMBER() OVER (
    PARTITION BY user_id ORDER BY paid_at, invoice_id
  ) AS payment_number
  FROM payment_receipts
)
SELECT date(paid_at / 1000, 'unixepoch') AS paid_day,
       SUM(CASE WHEN payment_number = 1 THEN 1 ELSE 0 END) AS first_observed_conversions,
       SUM(CASE WHEN payment_number > 1 THEN 1 ELSE 0 END) AS repeat_payments,
       COUNT(*) AS paid_invoices
FROM ordered
GROUP BY paid_day
ORDER BY paid_day;
```

Keep gross totals separated by currency:

```sql
SELECT currency, COUNT(*) AS paid_invoices,
       COUNT(DISTINCT user_id) AS paying_accounts,
       SUM(amount_paid) AS gross_invoice_amount_minor_units
FROM payment_receipts
GROUP BY currency;
```

Inspect individual records without exposing customer email addresses:

```sql
SELECT invoice_id, user_id, subscription_id,
       datetime(paid_at / 1000, 'unixepoch') AS paid_utc,
       amount_paid, currency
FROM payment_receipts
ORDER BY paid_at DESC, invoice_id DESC
LIMIT 100;
```

Run the cloud checks with `npm run test:cloud`. After its build step, the payment-only suite can also run with `node --test tests/cloud-measurement.test.mjs`. These checks use real SQLite, signed fixture webhooks and a fake Stripe transport; they do not replace a configured test-mode end-to-end purchase.
