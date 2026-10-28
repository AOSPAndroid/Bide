# Bide conversion measurement

## Deployment status

The public site has an optional Google Analytics 4 adapter. **Without a real, valid `G-…` measurement ID, it is disabled:** no Google tag is loaded, no analytics identifiers are created, no events are sent, and no analytics consent prompt is shown. The privacy page's preferences control can still explain that optional analytics are off.

Adding these files does not create a Google Analytics account, configure a property, verify a website, or demonstrate that reports are receiving data. A production stream and the settings below must be connected and verified before describing collection as live.

## Owner setup before activation

1. Create or select the intended GA4 property and web data stream. Confirm the correct production origin. Never use a made-up stream ID in a production build.
2. Turn **Enhanced Measurement off** for this stream. In particular, disable automatic history pageviews, forms, file downloads, site search, outbound clicks and video tracking. Also inspect the Google tag's automatic event detection settings. Those features can collect form fields, filenames, link URLs or search terms outside this adapter's allowlist. This repository cannot change account-side settings. Google's [Enhanced Measurement documentation](https://support.google.com/analytics/answer/9216061) explains these controls.
3. Keep Google signals, advertising features, user-provided data collection, connected advertising tags, cross-domain tracking and other automatically attached destinations off. This adapter sets `allow_google_signals: false` and `allow_ad_personalization_signals: false`, denies all advertising consent types, and never sends a user ID or email. Review the actual account configuration too.
4. Select and record the property's event/user data retention period. The browser's 180-day consent and cookie lifetime are **not** the server-side retention period. The owner must also finalize the operator/contact details, processor disclosures and any required data-transfer arrangements before enabling collection. This implementation is not a legal-compliance certification.
5. Set `VITE_GA_MEASUREMENT_ID` for the editor build and supply the same ID to the public-page generator/configuration. Render the JSON using an HTML-safe JSON serializer, not string interpolation of untrusted data:

   ```html
   <script id="bide-measurement-config" type="application/json">{"measurementId":"G-YOURREALID","page":"home"}</script>
   <script defer src="/measurement.js"></script>
   ```

   Public page keys are `home`, `pdf-editor`, `merge-pdf`, `compress-pdf`, `pricing`, `privacy`, `help` and `app`. Unknown routes collapse to a fixed `other` label and the origin's `/` URL. Never put a document name into this configuration.

6. Verify an actual deployment with a test visitor: no provider request before consent, rejection leaves every available tool usable, acceptance permits expected events, withdrawal stops events, a return visit respects the choice, and Global Privacy Control keeps collection off. Confirm sanitized events in the chosen GA4 property. Check the site's security/embedding headers and any CSP against the actual tag load; do not loosen document-processing protections merely to enable analytics.

Google documents the supported [GA4 configuration fields](https://developers.google.com/analytics/devguides/collection/ga4/reference/config), [basic consent implementation](https://developers.google.com/tag-platform/security/guides/consent), and [analytics disable flag](https://developers.google.com/tag-platform/security/guides/privacy). `send_page_view: false` prevents the configuration call from emitting a default pageview; the adapter emits its own sanitized pageview. It does not replace the account-side Enhanced Measurement check.

## What is collected after acceptance

Only fixed page names, a finite acquisition-source category and the allowlisted event/task/format fields below are added by Bide. The provider receives normal connection information and may derive browser/device, session, engagement and returning-visitor information. Do not describe GA4 as anonymous or as receiving only the custom fields below.

The source categories are `google`, `bing`, `chatgpt`, `copilot`, `perplexity`, `direct` and `other`. Classification uses known referring hosts. Raw referring paths, searches, URL query strings and fragments are not sent. GA4 campaign fields are explicitly overridden with fixed category values so arbitrary UTM parameters are not forwarded. The source is approximate: browsers and AI applications can omit referrers, making those visits appear direct. Attribution starts when the visitor accepts; earlier navigation is not reconstructed or replayed.

After acceptance, a source-only record in session storage preserves the category from the public page to `/app/`. It expires after 30 minutes of inactivity and contains no visitor identifier or URL. GA4's consented first-party cookie supplies returning-visitor/session measurement; there is no extra Bide analytics visitor ID.

The adapter does not accept document text, file contents, file names, file sizes, passwords, email addresses, account IDs, raw page titles or arbitrary event properties. It does not observe form fields or editor contents. Public CTA tracking reads only `data-bide-event` and `data-bide-tool`.

## Events and interpretation

| Event | Boundary | What it means |
| --- | --- | --- |
| `page_view` | Accepted visitor loads a public page or editor | A sanitized page was viewed; not a unique customer. |
| `editor_cta_clicked` | Public link/button with the matching data attribute | Intent to open an editor; not confirmation it loaded. |
| `editor_opened` | Editor entry/mount hook | The editor was entered; not a successful task. |
| `document_opened` | Successful document/project import | An input opened successfully; no input details are sent. |
| `export_completed` | Output rendering finished and download was initiated | An output was generated; not proof it was saved to disk. Exclude internal rotate/crop reimports. |
| `sign_in_complete` | Successful account sign-in | Authentication completed; not necessarily a new account or trial. |
| `checkout_started` | Server supplied a checkout URL | Checkout was initiated; not a confirmed payment. |

Optional `tool` values: `edit`, `merge`, `compress`, `split`, `convert`, `ocr`, `other`.

Optional `format` values: `pdf`, `png`, `jpg`, `svg`, `split`, `txt`, `docx`, `psd`, `bide`, `other`.

Use `export_completed` as the initial activation metric. Register the event-scoped custom dimensions `bide_page`, `acquisition_source`, `tool` and `format` in GA4 when useful. Counts cover consenting visitors whose analytics requests succeed; blockers, missing referrers and unavailable scripts limit coverage. Compare the same eligible population when calculating a funnel.

### Confirmed payment and retention

**There is deliberately no browser `purchase` event.** A checkout redirect, `?subscribed=1`, active licence, trialing subscription or invoiced-period end does not establish a payment. Confirmed paid conversions belong to verified, product-matched Stripe payment/invoice records with deduplication. Record first payments separately from renewals and zero-value invoices. The paid backend/provider connection must be operational before this can be measured.

Use consenting visitors' later successful task events for product return behaviour. Keep this distinct from subscription retention, which comes from authoritative billing records. This client adapter does not implement revenue reporting or join GA visitor identifiers to Stripe customers.

## Consent and withdrawal

- No Google script is requested before acceptance; this is basic, opt-in loading rather than pre-consent cookieless pings.
- Accept and Decline have equal visual treatment. Rejection does not limit the editor.
- The essential preference record `bide.analytics.choice.v1` stores only the decision, stream ID, schema version and expiry. Both acceptance and rejection expire after 180 days. A changed stream ID requires a new matching choice.
- Bide requests host-only analytics cookies prefixed `bide_analytics`, with a fixed lifetime capped by the remaining consent duration and no rolling expiry extension.
- A `data-measurement-preferences` button/link reopens the preferences. Global Privacy Control overrides stored acceptance.
- Withdrawal sets Google's `ga-disable-<stream-id>` flag before stopping adapter events, drops the adapter queue, clears the source-only session record, and attempts to expire Bide-prefixed first-party analytics cookies. It leaves document storage, sign-in and licence storage untouched.
- The code cannot recall in-flight requests, unload already-executed third-party code, erase data already held by Google, or guarantee deletion of inaccessible/cross-domain cookies. Account-side deletion requests are a separate process.
- Events that occur before acceptance or before the bridge is ready are dropped; they are not buffered for later replay.

## Integration API

The classic public script exposes:

```js
window.bideMeasurement.init({ measurementId, page: 'app' });
window.bideMeasurement.setTool('merge');
window.bideMeasurement.track('export_completed', { tool: 'merge', format: 'pdf' });
window.bideMeasurement.preferences();
```

The editor imports `startMeasurement`, `setMeasurementTool`, `trackMeasurement` and `measurementPreferences` from `src/measurement.ts`. The bridge isolates failures and does not load a provider itself. It queues only configuration/task selection while the public script becomes ready, never historical events.

Public CTAs use `data-bide-event="editor_cta_clicked" data-bide-tool="merge"`; use only documented values. Preferences controls use `data-measurement-preferences`.

## Local validation

Run `node tests/measurement.test.mjs` (the test file uses Node's test runner directly). The focused tests check disabled operation, no requests before consent, both consent actions, strict field sanitization, source-only continuity, withdrawal, cookie scoping, expiry, cross-tab changes, Global Privacy Control and unavailable storage/provider handling. They execute the real adapter with a small browser stub and do not send data to Google. They cannot establish that a live GA4 stream or account-side settings are correct.
