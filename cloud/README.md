# bide subscription: trial, payments and hosted deployment

The subscription edition offers a **7-day trial without a card**, then **€2/month** through Stripe Checkout. Editing happens in the browser. The server handles account emails, sign-in codes, sessions, subscriptions and signed licences; it does not receive the documents being edited.

The public ChatGPT Sites deployment currently serves the demo from `out/`. A working demo does not mean the payment backend is deployed or that real payments have been tested.

## Deployment architecture

Use the existing **Cloudflare Worker + Static Assets + D1** configuration in `wrangler.example.toml` for the paid edition. Serve the frontend and `/api/*` on the same origin. Keep `VITE_LICENCE_API` unset. The HttpOnly licence cookie protects engine downloads on that origin, so pointing a static website at a separate API is not an equivalent deployment.

Keep `assets.run_worker_first = true`: the Worker must check protected requests before the asset service responds. See [Cloudflare's asset binding documentation](https://developers.cloudflare.com/workers/static-assets/binding/).

ChatGPT Sites supports Workers, D1 and runtime secrets. Its existing `.openai/hosting.json` is nevertheless a **static-demo manifest**, and cannot deploy this backend as written. Its documented full-stack starter uses Vinext. The small Worker-ESM starter does not support Bide's standalone asset bundle. A future Sites migration needs to preserve the project ID and public audience, and verify authentication runs before protected assets are served. Do not add unverified hosting fields or change the existing demo as part of the Cloudflare launch.

## How the paid edition works

- **Sign-in:** Resend sends a six-digit code. Codes expire after ten minutes and allow five attempts; an email can request at most five per hour. A successful verification consumes the code atomically.
- **Trial:** the seven days start at first sign-in and belong to the account. Clearing browser storage does not restart them.
- **Licence:** `/api/licence` returns an ECDSA P-256 signed entitlement and an HttpOnly licence cookie. The public verification key is built into the frontend; the private signing key stays on the server. Cached licences allow access for up to three days, including some delay in reflecting subscription changes.
- **Protected downloads:** the Worker checks the licence cookie for `/ai/`, `/ocr/`, `/office/`.
- **Checkout:** one Stripe customer is associated with the account. A pending purchase is reused; customers with an existing subscription use the billing portal instead of starting another purchase.
- **Subscription updates:** verified webhook events trigger reconciliation against Stripe's current subscriptions for the configured Bide price. Successfully processed event IDs are recorded. Delayed or repeated event snapshots cannot simply overwrite the current entitlement.
- **Cancellation:** Stripe's customer portal handles cancellation and payment-method changes. Normal cancellation at period end retains access through the paid period. For `past_due`, the existing policy uses Stripe's recorded subscription-period end **plus seven days**. That is not necessarily seven days after the failed payment: a renewal can already have advanced the billed period. Review that policy before live launch; this patch preserves its existing behavior.

Stripe can deliver events repeatedly and out of order. See its [webhook guidance](https://docs.stripe.com/webhooks). The server tests use mocked Stripe responses; they do not establish that a merchant account or live webhook is configured.

## Configure a test deployment first

1. **Choose the paid origin and create D1.** Copy `cloud/wrangler.example.toml` to the repository root as `wrangler.toml`. Set its Worker name, database ID, `APP_URL`, sender and test price ID. Authenticate Wrangler to the intended Cloudflare account, then create a database:

   ```sh
   npx wrangler d1 create bide
   ```

   For a fresh database, apply the complete schema:

   ```sh
   npx wrangler d1 execute bide --remote --file cloud/schema.sql
   ```

   For an existing database made with the earlier subscription code, apply the additive migration before deploying the new Worker:

   ```sh
   npx wrangler d1 execute bide --remote --file cloud/migrations/0001_billing_safety.sql
   ```

   This adds billing-operation state and processed-event records without replacing accounts. Use a separate database and keys for testing and production.

2. **Create licence keys.** Run `node cloud/keys.mjs` locally. It prints both keys: keep the private value out of chat, Git and build logs. Store `LICENCE_PRIVATE_KEY` as a Worker secret. Put only `VITE_LICENCE_PUBLIC_KEY` in the build environment or ignored `.env.saas.local`. Test-build keys must be replaced for a real deployment.

3. **Configure Stripe in a sandbox.** Create a recurring Bide price matching the displayed **€2/month**, then set `STRIPE_PRICE_ID`. Enable the customer portal. Configure a snapshot webhook at `https://<paid-origin>/api/stripe/webhook` for:

   - `checkout.session.completed`
   - `customer.subscription.created`
   - `customer.subscription.updated`
   - `customer.subscription.deleted`

   Store `STRIPE_SECRET_KEY` and the endpoint's `STRIPE_WEBHOOK_SECRET` as Worker secrets. Use keys, price IDs and a webhook from the same Stripe environment. Apple Pay and Google Pay depend on Stripe settings, customer device/browser and eligibility; do not promise that every wallet appears for every buyer.

4. **Configure sign-in email.** Verify a sending domain in Resend. Set `MAIL_FROM` to its approved sender and store `RESEND_API_KEY` as a Worker secret. Do not set `DEV_SHOW_CODE=1` on a remotely accessible deployment.

   Worker secrets can be entered at Wrangler's prompt, for example:

   ```sh
   npx wrangler secret put LICENCE_PRIVATE_KEY
   npx wrangler secret put STRIPE_SECRET_KEY
   npx wrangler secret put STRIPE_WEBHOOK_SECRET
   npx wrangler secret put RESEND_API_KEY
   ```

5. **Build and verify.** Install the locked dependencies, then run:

   ```sh
   npm ci
   npm run typecheck:cloud
   npm run test:cloud
   npm run build:saas
   npx wrangler deploy --dry-run
   ```

   The SaaS prebuild prepares OCR and pinned AI models. The output is `dist-saas/`. Large ONNX models are split into 20 MiB parts. The build checks required engines, model parts and the host's 25 MiB per-file limit. The paid website omits Office conversion; the local edition keeps it.

6. **Deploy the configured sandbox and exercise it.** `npx wrangler deploy` publishes to the account in the active Wrangler configuration. Complete a test purchase through the real website, verify the webhook's D1 update, and then test retries, cancellation at period end, renewal, payment failure/recovery and protected downloads without a valid cookie. Verify email delivery and the final return URL. These checks need the actual provider accounts.

## Decisions before accepting real payments

### MuPDF licensing

Charging for a hosted service is compatible with the AGPL. Bide's MuPDF dependency is dual licensed: **AGPL or an appropriate commercial agreement with Artifex**. Choose the route for the actual distributed application:

- **Paid hosting with AGPL compliance:** provide the required notices, licence and complete corresponding source for the covered work, including the necessary build material. An Apache-2.0 file at the repository root, or a public repository by itself, is not proof that the combined distribution satisfies the dependency's requirements.
- **Proprietary distribution:** obtain suitable commercial terms if the intended model cannot meet the AGPL obligations.

Browser-delivered JavaScript and WebAssembly are distributed copies even though documents stay on the device. The same licensing question therefore applies to the existing free demo. Whether a separate authentication/billing service is part of the covered work depends on its integration; do not assume every separate service must share the frontend's licence.

Charging does **not** require making the repository private or deleting free releases. Review the actual covered work and source delivery before choosing a licence or publishing a proprietary edition. See [MuPDF.js licensing](https://github.com/ArtifexSoftware/mupdf.js#license), [Artifex's guidance](https://artifex.com/licensing), and [the AGPL text](https://www.gnu.org/licenses/agpl-3.0.en.html).

### Merchant details and the offer

Supply the real operator identity, support contact, privacy/terms pages, cancellation/refund information and applicable consumer-rights wording. The privacy description must distinguish local document processing from account/payment data handled by the service, Resend and Stripe. Decide whether the displayed price includes applicable taxes and configure Stripe consistently. Optional `STRIPE_AUTOMATIC_TAX=1` requires a correctly configured Stripe Tax account; enabling it alone does not establish the merchant's tax obligations.

The current €2/month offer has not been changed. The displayed `VITE_PRICE_LABEL` and Stripe price must agree. Monthly and annual billing are separate product decisions; this implementation uses one configured price.

The existing public demo offers much of the same editor without a subscription. Once the paid deployment is verified, decide which hosted features remain free and make the public entry point explain the paid offer or its trial. Running identical unrestricted free and paid websites gives customers little reason to subscribe. This is separate from the source-distribution rights granted by an open-source licence; changing the free hosted offer does not revoke those rights.

### Technical limits customers should understand

- Office import is unavailable in the hosted edition because its engine exceeds the asset limit. PDF-to-Word text export is a different feature and remains available.
- Local document processing still downloads application assets and engines. Account, email and payment operations contact their respective services.
- A browser-side paywall cannot make already-delivered software uncopyable. Sell reliable hosted access, updates and support, while honoring the licences of bundled components.
- A three-day cached licence is not the same as a guarantee that every feature works offline: engines must already be cached and browser storage may be cleared.

Keep the production switch blocked until provider configuration, the real test checkout/webhook flow, the licensing choice and the customer-facing merchant information are complete.

## Mobile apps and account deletion

The iOS and Android apps use this same server; see [MOBILE.md](../MOBILE.md). Configure `APP_ORIGINS` for their origins. Gated models accept a signed licence as a bearer token. `/api/account/delete` removes the account, sessions, billing records and Stripe customer, preserving only a hashed email and its original trial end.

For an existing database, apply `cloud/migrations/0001_billing_safety.sql`, `0002_measurement.sql`, and `0003_used_trials.sql` before this Worker. Fresh databases use `cloud/schema.sql`.
