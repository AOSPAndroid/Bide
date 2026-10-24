# Public website and search setup

The public homepage and six supporting pages are generated as real HTML. The
editor lives at `/app/`, with finite `tool=edit`, `tool=merge`, or `tool=compress`
entry points. Marketing stays public in both the demo and subscription builds;
the subscription gate surrounds the editor only.

## Build and configure

- `npm run build` prepares the hosted engines and builds the public demo into
  `out/`, which is the directory declared in `.openai/hosting.json`.
- `npm run build:demo` rebuilds the public demo when assets are already prepared.
- `npm run build:saas` builds the public site and gated editor into `dist-saas/`;
  it still requires the existing licence and payment configuration.
- `npm run build:local` preserves the standalone local editor build into `dist/`.
  Its Office runtime must first be downloaded using `npm run assets:office`.
- `npm run build:all` builds both local and demo editions with the full local
  asset prerequisites.
- `node scripts/check-discovery.mjs out` verifies the deployed-output structure.

`discovery.config.json` contains public website configuration. No field in this
file is a private credential. Empty verification and analytics values are
deliberate: they must not be represented as connected services.

Build-time overrides: `VITE_SITE_ORIGIN`, `VITE_GOOGLE_SITE_VERIFICATION`,
`VITE_BING_SITE_VERIFICATION`, `VITE_GA_MEASUREMENT_ID`, `VITE_PRICE_LABEL`.
Runtime Site environment changes alone do not rebuild static HTML.

## Domain

Canonical URLs use the existing live origin until an owned custom domain is
selected and attached. Do not put an unowned or unconnected hostname in the
canonical tags or sitemap. After a custom domain is live, update `origin`,
rebuild, verify the new Search Console property and arrange permanent redirects
from the old origin where the host supports them. A domain purchase and DNS
change require an actual selected domain and registrar access.

## Google Search Console

1. In the owner's Google account, add the URL-prefix property for the exact
   HTTPS origin, including its final `/`. This works on the existing hosted
   subdomain without controlling the parent domain's DNS.
2. Choose HTML tag verification and copy only the real `content` token into
   `googleSiteVerification` (or its build-time override).
3. Rebuild and publish. Verify the token in the homepage's returned HTML, then
   select Verify in Search Console. Keep the token in later builds.
4. Submit `/sitemap.xml` in Sitemaps. Inspect the homepage and tool pages using
   URL Inspection. Check AI inclusion settings and reports once data exists.

Account verification, sitemap submission and actual indexing are distinct
states. Publishing this file does not complete any account-side action.

Official instructions: https://support.google.com/webmasters/answer/9008080
and https://support.google.com/webmasters/answer/7451001

## Bing Webmaster Tools and IndexNow

In Bing Webmaster Tools, either import the verified Google property or add the
site independently and put Bing's real token into `bingSiteVerification`.
After publishing the token, complete Verify and submit the same sitemap.

The public IndexNow key file enables a separate account-free URL notification:

```sh
node scripts/submit-indexnow.mjs
```

The script first checks the live key and only then sends the URLs from the
generated sitemap. A successful response acknowledges receipt, or queued key
validation for HTTP 202. It is not proof of indexing, a ranking, an AI
recommendation, or Bing Webmaster account verification.

Official protocol: https://www.indexnow.org/documentation

## Measurement

See [measurement.md](measurement.md) for optional consented browser measurement
and [payment-measurement.md](payment-measurement.md) for verified invoice metrics.
No GA4 identifier is configured in the initial release. Browser collection is
disabled until a real destination has been connected and its settings reviewed.
The payment backend also needs a real deployment and Stripe connection before
paid-conversion receipts can be recorded.

Measure visits, successful document output, checkout starts, confirmed first
paid invoices and repeat use separately. A generated download does not prove
that a user saved the file; a checkout redirect does not prove payment.
