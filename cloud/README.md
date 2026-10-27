# bide subscription: trial, paywall and licence server

The subscription build of bide asks people to sign in. They get **7 days free** (no card), then subscribe at **€2/month** through Stripe Checkout, which offers **Apple Pay, Google Pay** and cards. Editing still happens on the user's device; this server only handles accounts, payments and licences.

## How it works

- **Sign-in:** the user types an email; `/api/auth/start` emails a 6-digit code (Resend), `/api/auth/verify` checks it and returns a session. Codes expire after 10 minutes, allow 5 attempts, and at most 5 can be requested per hour.
- **Trial:** it starts at the first sign-in and belongs to the email address (`users.trial_ends`), so clearing the browser does not restart it.
- **Licence:** `/api/licence` returns a licence signed with ECDSA P-256 (`src/licence.ts`): status `trial`, `active` or `expired`, valid at most 3 days. The app checks it with the public key built into it. That lets it open offline for up to 3 days, and it can't be forged. The same licence is set as an HttpOnly cookie.
- **Gated files:** when the worker serves the app (`ASSETS`), the AI models, OCR data and Office engine (`/ai/`, `/ocr/`, `/office/`) are only served with a valid licence cookie.
- **Payment:** `/api/checkout` opens Stripe Checkout (subscription). Stripe's webhook (`/api/stripe/webhook`, signature checked) records the subscription; `active` lasts until the end of the paid period, `past_due` keeps a week's grace. `/api/portal` opens Stripe's customer portal to cancel or change the card.

The code is a standard fetch handler (`cloud/worker.ts`) with a D1 database (`cloud/schema.sql`). `npm test` covers it (`tests/cloud.test.mjs`), and `tests/e2e/paywall.e2e.mjs` runs the whole flow in a browser.

## Set up

1. **Keys:** `node cloud/keys.mjs`. Put `LICENCE_PRIVATE_KEY` in the server secrets, and `VITE_LICENCE_PUBLIC_KEY` in the build environment (or `.env.saas.local`, which git ignores).
2. **Stripe:**
   - Create a product "bide" with a recurring price of €2/month; its id is `STRIPE_PRICE_ID`.
   - Under Settings → Payment methods, make sure Apple Pay and Google Pay are on. Hosted Checkout needs no Apple Pay domain verification.
   - Turn on the customer portal (Settings → Billing → Customer portal).
   - Add a webhook endpoint `https://<your app>/api/stripe/webhook` for `checkout.session.completed` and `customer.subscription.created`, `.updated`, `.deleted`. Its signing secret is `STRIPE_WEBHOOK_SECRET`.
   - EU VAT is yours to collect and file with Stripe. `STRIPE_AUTOMATIC_TAX=1` lets Stripe Tax add it at checkout once Stripe Tax is set up.
3. **Email:** create a Resend account, verify your sending domain, and set `RESEND_API_KEY` and `MAIL_FROM`.
4. **Build:** `npm run build:saas` writes `dist-saas/`. AI models over 24 MiB are split into 20 MiB parts there, because static hosts such as Sites and Cloudflare refuse files over 25 MiB; the app joins them again.
5. **Deploy:**
   - **ChatGPT Sites:** the current `.openai/hosting.json` deploys only the static demo (`out/`). The subscription needs the worker and a database as well. Sites reportedly runs on Cloudflare Workers with D1, but I could not confirm how a worker and secrets are declared there. Check with OpenAI that a Site can run `cloud/worker.ts` with a D1 database and secrets. If it can't, host the worker on Cloudflare (next option) and keep only the demo on Sites.
   - **Cloudflare Workers:** copy `cloud/wrangler.example.toml` to `wrangler.toml`, then:
     - `npx wrangler d1 create bide`
     - `npx wrangler d1 execute bide --remote --file cloud/schema.sql`
     - set the secrets
     - `npx wrangler deploy`

     The `_headers` file keeps the cross-origin isolation headers the app needs.

## Apps

The iOS and Android apps use this same server. MOBILE.md covers what to configure: `APP_ORIGINS`, the `used_trials` table, and models fetched with a bearer licence. `/api/account/delete` deletes an account from the web or the apps.

## Still to do before charging

- **MuPDF licence:** buy a commercial MuPDF licence from Artifex. Without it, a closed hosted version must offer its source under the AGPL. Then make the repository private, and stop distributing the free Windows ZIP, which has no paywall.
- **Legal pages:** terms of service, privacy policy (account email and Stripe data only; documents stay on the device), and the EU withdrawal-right wording for digital services.
- **Office files on Sites/Cloudflare:** the Office engine (soffice.wasm, soffice.data) is still over the 25 MiB file limit, so Office import is missing there.
- **Licence check limits:** the in-browser check stops ordinary use but not someone patching the JavaScript. The AI models and engines are protected on the server only when this worker serves them.
