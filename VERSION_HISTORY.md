# Version History

## VAT Rates Module (`nuheat_vat_rates.js`)

### v1.0.0 — 18 August 2026 ⏳ Draft — pending Sandbox testing

- NEW FILE: Shared VAT rate resolution module, `@NModuleScope Public`, imported by
  `nuheat_quote_suitelet.js` and `nuheat_send_quote_sl.js` as `'./nuheat_vat_rates'`.
- CONTEXT: the scripts had **never** calculated VAT — there was no `0.2` multiplier anywhere in the
  codebase. Both surfaces echoed NetSuite's `taxtotal`, and heat pump quotes were showing 20%
  because **the tax codes on those Estimates are wrong**.
- ⚠️ This module derives the rate that *should* apply. It is a **display stopgap** — NetSuite still
  invoices from its own tax codes until they are corrected at source.
- ADDED: `VAT_RATES` — Heat Pump 0%, Solar 0%, Underfloor Heating 20%, Other 20%.
  ⚠️ Solar 0% is an assumption; only HP and UFH were specified.
- ADDED: `DEFAULT_VAT_RATE = 0.20` — unknown types default to the standard rate (never under-charge)
  and log `VAT_RATE_UNMATCHED`.
- ADDED: `resolveVatRate(quoteType)` → `{rate, percent, matched, quoteType}`.
- ADDED: `calculateVat(netAmount, rate)` — 2dp. `netAmount` is subtotal **minus discount**.
- ADDED: `logVatMismatch(context, recordId, derivedVat, netsuiteTaxTotal, quoteType)` — audit-level
  `VAT_MISMATCH` beyond a 1p tolerance. These entries are the work-list for fixing the tax codes.
- ADDED: `normaliseQuoteType()` / `QUOTE_TYPE_ALIASES` — maps raw `custbody_quote_type` list values
  onto the display names `VAT_RATES` is keyed by. **Without this, `'Heat Pump (ASHP)'` would not
  match and would fall through to the 20% default** — charging a heat pump quote 20% VAT, silently.
  Mirrors `QUOTE_TYPE_MAPPING` in `nuheat_send_quote_sl.js`; add new types to both.
- ⚠️ DEPLOYMENT: upload to `SuiteScripts/NuHeat` **before** either consumer is redeployed.

---

## BUS Grant Module (`nuheat_bus_grant.js`)

### v1.0.0 — 18 August 2026 ⏳ Draft — pending Sandbox testing

- NEW FILE: Shared BUS (Boiler Upgrade Scheme) grant resolution module, `@NModuleScope Public`,
  imported by `nuheat_quote_suitelet.js` and `nuheat_send_quote_sl.js` as `'./nuheat_bus_grant'`.
  Exists so the Suppak → grant-rate rules cannot drift between the quote page and the Master Proposal.
- ADDED: `BUS_RATES` — `STANDARD: 7500`, `ENHANCED: 9000`, `NONE: 0`.
- ADDED: `BUS_STANDARD_ITEMS` — `suppak n1(r)hp`, `suppak n1(nb)hp`, `suppak bus`.
- ADDED: `BUS_ENHANCED_ITEMS` — `suppak bus - uplift`.
- ADDED: `normaliseItemName(name)` — takes the last colon-delimited segment (handles NetSuite's
  `"Parent : Child"` sub-item form), collapses whitespace, lowercases.
- ADDED: `resolveBusGrant(lineItems)` → `{amount, rate, matchedItem, suppressedBy}`. Precedence:
  enhanced → standard → none. A non-qualifying Suppak line suppresses the grant only when no
  qualifying line is present; it never overrides one.
- Matching is **exact array membership after normalisation, never substring** — `'suppak bus - uplift'`
  can therefore not be caught by the `'suppak bus'` entry, and no longest-match ordering is needed.
- LOGGING: `BUS_RESOLVE` on every resolution; `BUS_UNMATCHED` with the raw `itemName` whenever a
  Suppak line matches no tier, so a mismatch is visible rather than silently paying no grant.
- ⚠️ DEPLOYMENT: must be uploaded to `SuiteScripts/NuHeat` **before** either consumer is redeployed.
  Custom modules need no script deployment record — File Cabinet upload only.

---

## Master Proposal (`nuheat_master_proposal.js`)

### v1.8.3 — 18 August 2026 ⏳ Draft — pending Sandbox testing

**Copy only.**

- CHANGED: the blended-VAT note now reads "VAT is charged at 0% on your heat pump and 20% on your
  underfloor heating. The total amount shown combines the two — see more detail in the quote
  breakdowns below." (em dash, as before).
- UNCHANGED: the gating condition — still shown only when the proposal contains both a heat pump
  quote and at least one 20%-rated quote. `.top-total-vat-note` CSS unchanged.

---

### v1.8.2 — 18 August 2026 ⏳ Draft — pending Sandbox testing

**One CSS rule — no JavaScript, no HTML, no other file.**

- FIXED: `.top-total-plus-vat` wrapped mid-phrase once v1.8.1 appended the VAT amount, orphaning
  "plus" beside the price (`£10,603.12 plus` / `VAT £1,057.71`). Now `display: block`, so the whole
  phrase takes its own line and can never split however large the figure gets.
- REMOVED: `vertical-align: middle` — a no-op on a block element, meaningful only while inline.
- ADDED: `margin-top: 6px` — separates it from the 36px price without opening a gap that fights the
  `border-top` on `.top-total-inc-vat` below.
- UNCHANGED: the HTML at `generateTotalPriceBar()` — the markup was already correct.
- UNCHANGED: no mobile override added. There is no `.top-total-plus-vat` rule in the
  `max-width: 768px` block and none is needed — `.top-total-right { text-align: center; }` already
  centres the block span under the price there.
- Font size left at 20px; only the line break was requested.

> **Quote page deliberately untouched.** `nuheat_quote_suitelet.js` has its own
> `.top-total-plus-vat` class, but it renders the bare words "plus VAT" with no amount, so it is far
> too short to wrap. Changing it would alter a signed-off layout for no benefit.

---

### v1.8.1 — 18 August 2026 ⏳ Draft — pending Sandbox testing

**Presentation only — no calculation logic changed.**

- CHANGED: `generateQuoteCard()` price line now carries a `Refundable to you on completion` label
  when the balance is negative, replacing the third middot-chained clause in the detail line.
  ⚠️ Gated on `totalIncVat`, **not** `displaySubtotal` — the refundable amount is the VAT-inclusive
  balance. Identical today, correct in principle.
- REMOVED: the `Includes £x BUS grant` clause from the detail line — the grant is already announced
  by the `.grant-highlight` banner below the cards.
- REMOVED: the `£x refundable to you` clause from the detail line (replaced by the label above).
- UNCHANGED: the discount clause and the `Total inc. VAT:` clause.
- CHANGED: the total header now reads `plus VAT £1,057.71` rather than a bare `plus VAT`, which left
  the blended amount invisible unless the reader subtracted. `calculateTotals()` already returns
  `totals.vat`, so this is display only. No CSS change — `.top-total-plus-vat` already styles it.
- ADDED: `.system-card-refund` CSS (13px, weight 500, primary colour) plus a `max-width: 768px` rule
  so the label wraps onto its own line rather than squashing the price.

> **On the `plus VAT` sanity check.** `totals.vat` and `totals.totalIncVat` have **not** diverged.
> The check `vat === totalIncVat − subtotal` holds only without a discount; with one,
> `totalIncVat − subtotal = vat − discount`, because the headline subtotal is gross of discount and
> the discount is its own breakdown line. The displayed arithmetic is correct either way —
> `subtotal − discount + VAT = Total inc. VAT`.

---

### v1.8.0 — 18 August 2026 ⏳ Draft — pending Sandbox testing

- ADDED: `getVatRate(quote)` — parses the passed-through `vatRate` after its TEXT round trip,
  defaulting to 20% when absent so VAT is never under-stated.
- ADDED: blended-VAT note beneath the total price bar — "The VAT amount shown is blended between the
  underfloor heating at 20% and heat pump quote at 0%. Please see below for more information."
  ⚠️ Gated on **a heat pump quote AND at least one 20%-rated quote**, deliberately stricter than
  "the proposal includes a heat pump" — on a heat-pump-only proposal the note would otherwise
  describe blending with underfloor heating that is not in the proposal. Flags derive from the
  passed-through `vatRate` / `busRate`, not `quoteType` string matching.
- ADDED: `.top-total-vat-note` CSS rule and its mobile centre-align override.
- CHANGED: main quotes intro copy — "Your system covers every component needed for your project. Each
  quote contains a full component breakdown, tailored system details and benefits, and transparent
  pricing with no hidden extras." The "alternative options" intro is unchanged.
- UNCHANGED (verified): `calculateTotals()` already sums each quote's own `taxTotal`, so once the
  Send Quote SL supplies corrected per-quote figures the blend is right with no change to the
  summing logic. `parseCurrencyAmount()` handles the derived strings.

---

### v1.7.0 — 18 August 2026 ⏳ Draft — pending Sandbox testing

- CHANGED: `generateQuoteCard()` shows the **balance after BUS** (`subtotal - busAmount`), which
  **may be negative**. Keyed off the resolved Suppak rate via `hasBusGrant(quote)`, **not**
  `quote.quoteType === 'Heat Pump'`.
- FIXED: the `if (subtotal > 0)` guard that suppressed the price when the balance was negative.
- CHANGED: `Total inc. VAT` detail line follows the same un-clamped post-grant figure.
- ADDED: `Includes £7,500 BUS grant` detail (dynamic amount), and `£694.40 refundable to you`
  (dynamic) when the balance is negative.
- CHANGED: `generateBUSGrantBanner(busAmount)` now takes the amount as an argument, so it reads
  £9,000 on the enhanced rate. Gate changed from `isMain && hasHeatPump` to "at least one main quote
  carries a grant", using the highest rate present. `SHOW_BUS_GRANT_BANNER` remains the master switch.
- CHANGED: `calculateTotals()` aggregates post-grant balances **without clamping**, so a negative
  per-quote balance reduces the headline total instead of being skipped.
- ADDED: `formatSignedCurrency()` — `-£694.40`, not `£-694.40`. `formatCurrency()` is unchanged.
  Not used for the discount line, which is `Math.abs()`'d and hand-rolls its own sign.
- ADDED: `getBusAmount(quote)` / `hasBusGrant(quote)` — parse `busAmount` back after its
  `serverWidget` TEXT round trip and gate on `busRate !== 'none'`.
- REMOVED: `HP_GRANT_AMOUNT = 7500` constant.
- CHANGED: headline total bar uses `formatSignedCurrency()`.

---

### v1.6.7 — 22 April 2026 ⏳ Draft — pending Sandbox testing

- CHANGED: Heat Pump quote cards now display subtotal minus £7,500 BUS grant (`HP_GRANT_AMOUNT` constant). Uses `Math.max(0, subtotal - HP_GRANT_AMOUNT)` to prevent negative prices.
- CHANGED: `generateBUSGrantBanner()` text updated to "£7,500 grant funding has been applied to this quote" with asterisk line "*Subject to scheme eligibility".
- ADDED: `HP_GRANT_AMOUNT = 7500` constant alongside `SHOW_BUS_GRANT_BANNER`.
- ADDED: `.grant-highlight-asterisk` CSS modifier class for the asterisk line.

---

### v1.6.6 — 22 April 2026

- ADDED: `loadOpportunityData()` reads `custbody_opp_site_adress` from the Opportunity record using a defensive try-catch. Value stored as `siteAddress` on the returned `oppData` object.
- ADDED: `generateHeaderContent()` renders a "Site address:" info-item in the Customer Information card, between "Customer name" and "System reference". Conditionally rendered — row is omitted when `siteAddress` is empty.

---

### v1.6.5 — 22 April 2026

- CHANGED: `SYSTEM_BENEFITS` 'Underfloor Heating' array — 'Room-by-room heat losses' replaced with 'Detailed installation pack'
- CHANGED: `generateWhatHappensNext()` Step 2 description — "Through meticulous heat-loss calculations, we ensure..." replaced with "Our approach ensures..."

---

### v1.6.4 — April 2026

- ADDED: `GTM_CONTAINER_ID` constant (`GTM-5NJJSBMP`) for centralised GTM container reference
- ADDED: Data layer push (`nuheat_proposal_view` event) injected before GTM head snippet in all generated proposal pages — fields: `customerId`, `opportunityId`, `pageType`
- ADDED: GTM head snippet (`<script>` loader) injected immediately after `<head>` opening tag
- ADDED: GTM noscript fallback (`<noscript><iframe>`) injected immediately after `<body>` opening tag
- NOTE: No logic or rendering changes — GTM and data layer injection only

---

## Quote Suitelet (`nuheat_quote_suitelet.js`)

### v4.6.0 — 18 August 2026 ⏳ Draft — pending Sandbox testing

- FIXED: **the "Site address" row never rendered.** The row already existed in `renderHeader()`,
  conditionally rendered and correctly placed between "Customer name" and "System reference" — it
  was suppressed because `header.projectAddress` was always empty. `custbody_opp_site_adress` is an
  **Opportunity** field (the `opp_` prefix is the clue), and it was being read off the Estimate.
- ADDED: `loadQuoteData()` loads the Opportunity — whose ID it already extracts for file naming —
  and reads the field from there, mirroring `nuheat_master_proposal.js:463-467` and
  `nuheat_send_quote_sl.js:415-419`. Wrapped in try/catch: a missing or unreadable Opportunity
  leaves the row hidden and **never breaks the page**.
- The two Estimate-level fallbacks are kept, *after* the Opportunity value. Order matters —
  Opportunity first, Estimate second.
- Value is `.trim()`ed, so a whitespace-only field hides the row rather than rendering an empty label.
- ADDED: `SITE_ADDRESS` audit entry with the Opportunity ID and resolved value. An empty value
  against a valid `oppId` is a data issue on that Opportunity, not a code one.
- ⚠️ The field ID is misspelled in NetSuite — `adress`, one `d`. That is the real ID.
- CHANGED: label `Project address:` → **`Site address:`**, matching the Master Proposal.
- CHANGED: section header `Recommended Solutions and Costs` → **`Your solutions and costs`**.
  Visible text only — the section ID stays `recommendations`, as do `toggleSection('recommendations')`,
  the `recommendations-content` / `recommendations-icon` element IDs and the `.recommendations-header`
  CSS class, so the collapse toggle is unaffected.
- GOVERNANCE: one extra `record.load()` per quote generation (~10 units). Negligible —
  `loadItemCustomFields()` already loads a record per line item.

---

### v4.5.1 — 18 August 2026 ⏳ Draft — pending Sandbox testing

**Presentation only — no calculation logic changed.**

- ADDED: `Refundable amount: £x` line in **both** total sections, between the VAT line and
  `Total inc VAT`, shown only when the balance after BUS is negative. Both sections render the same
  figures at the top and bottom of the page and would look broken if only one changed.
- Rendered as a **positive** figure — it is money coming back to the customer.
  `Math.max(0, -bus.totalIncVatAfterBus)` also guarantees no `£0.00` row and no `-£0.00`.
- ⚠️ Derived from `bus.totalIncVatAfterBus`, **not** `bus.creditDue`. `creditDue` is ex-VAT, while
  the refundable amount is what the customer actually receives, which is VAT-inclusive. Identical
  today (heat pumps are 0%-rated) but correct rather than coincidental.
- UNCHANGED: the `Total inc VAT` line and its top border; all v4.4.0/v4.5.0 figures.

---

### v4.5.0 — 18 August 2026 ⏳ Draft — pending Sandbox testing

- ADDED: imports `'./nuheat_vat_rates'` as `vatRates`.
- ADDED: `headerData.quoteTypeText` — `custbody_quote_type` read in `extractHeaderData()` inside a
  try/catch, since `getText()` on a list field is unreliable.
- ADDED: single VAT calculation block in `loadQuoteData()`, placed **before** the BUS block so the
  corrected total can feed it. Stores `quoteData.vat` (`rate`, `percent`, `amount`, `quoteType`,
  `rawQuoteType`, `netAmount`, `correctedTotalIncVat`, `netsuiteTaxTotal`), logged as `VAT_FIGURES`.
- ADDED: fallback inference of the quote type from grouped items when `custbody_quote_type` comes
  back empty (`hasHeatPump` → Heat Pump, `hasSolar` → Solar, else Underfloor Heating). The route
  used is logged as `VAT_QUOTE_TYPE`.
- CHANGED: both total sections render `VAT at 0%: £0.00` / `VAT at 20%: £x` from `quoteData.vat`
  instead of `header.taxTotal`.
- CHANGED: **Total inc VAT is recomputed.** `correctedTotalIncVat = netAmount + derivedVat` replaces
  NetSuite's `total` for display, and `bus.totalIncVatAfterBus` is now built from it.
  `bus.balanceAfterBus` is ex-VAT and unchanged.
- REMOVED: `"plus VAT"` from the heat pump price card (`.hp-price-amount`) and the category cost
  card (`.category-cost-value`). VAT is referenced only in the total system price header. The
  `.hp-price-vat` / `.category-cost-vat` CSS rules are left in place (harmless; mobile overrides
  reference them). The Design+ upgrade banner's "plus VAT" is not a section price card — untouched.
- LOGGING: `VAT_MISMATCH` whenever the derived figure disagrees with NetSuite's `taxtotal` by more
  than 1p.

---

### v4.4.0 — 18 August 2026 ⏳ Draft — pending Sandbox testing

- ADDED: imports `'./nuheat_bus_grant'` as `busGrant`.
- ADDED: single BUS calculation block in `loadQuoteData()`, immediately after `categoryTotals`.
  Resolves once and stores every derived figure on `quoteData.bus` — `amount`, `rate`, `matchedItem`,
  `hpGross`, `hpDisplayPrice`, `residualGrant`, `commissioningDisplay`, `balanceAfterBus`,
  `totalIncVatAfterBus`, `creditDue`, `hasGrant`. Logged as `BUS_FIGURES`.
- FIXED: **the −£1,870.33 bug.** The heat pump price card now renders
  `quoteData.bus.hpDisplayPrice`, which is `Math.max(0, hpGross - busAmount)` — it can never go
  negative. Previously it was the one deduction site with no clamp.
- CHANGED: `renderTopTotalSection()` and `renderTotalSection()` **drop their `Math.max(0, …)` clamps**
  and use `formatSignedCurrency()`, so the balance after BUS shows its true negative value
  (−£694.40 in the reported case, previously £0.00).
- ADDED: "System price" and "BUS grant applied" breakdown lines in both total sections, rendered
  only when a grant applies.
- CHANGED: commissioning card receives a totals override built from
  `quoteData.bus.commissioningDisplay` (mirrors the existing Solar override pattern), so grant left
  over once the heat pump price reaches £0 cascades there and the page reconciles.
- ADDED: `CASCADE_GRANT_TO_COMMISSIONING` config constant, default `true`.
- CHANGED: the `.hp-grant-banner` grant card renders **only when a grant applies**, with the resolved
  amount, so it reads £9,000 on the enhanced rate and is hidden entirely with no Suppak line.
- ADDED: third grant-card line, shown only when the grant exceeds the quote value — "Any grant
  funding in excess of your quote value (£694.40) will be refunded to you once the grant has been
  claimed." — plus the `.hp-grant-banner-refund` CSS rule.
- ADDED: `formatSignedCurrency(value, symbol)`. `formatNumber()` is deliberately **unchanged** — it
  already handles negatives; the `£-` ordering was a caller problem. The two discount call sites
  keep `formatNumber()` because `header.discountTotal` is `Math.abs()`'d and they hand-roll their sign.
- REMOVED: `HP_GRANT_AMOUNT = 7500` constant.
- REMOVED: dead `.grant-banner` code — the `showGrantBanner` parameter of `renderCategorySection()`,
  the `if (showGrantBanner) { … }` block, the `false` argument at both call sites, and the five
  `.grant-banner*` CSS rules. Unreachable: both call sites passed `false` and Heat Pump/UFH do not
  use `renderCategorySection`. `.hp-grant-banner` is untouched.
- FIXED: JSDoc `@version` had drifted to `4.3.67` while `SCRIPT_VERSION` read `4.3.70`.

---

### v4.3.70 — 22 April 2026 ⏳ Draft — pending Sandbox testing

- CHANGED: Heat pump display price now deducts £7,500 BUS grant (`HP_GRANT_AMOUNT` constant). `hpGrantedPrice = hpDisplayPrice - 7500` shown in price card.
- CHANGED: `hp-grant-banner` text updated from "may be eligible for a £7,500 Government grant" to "£7,500 grant funding has been applied to this quote" with asterisk line "*Subject to scheme eligibility" in smaller italic text.
- ADDED: `HP_GRANT_AMOUNT = 7500` constant — blanket deduction, intended to become conditional on a NetSuite field in future.
- ADDED: `.hp-grant-banner-text .hp-grant-banner-asterisk` CSS class for the smaller italic asterisk line.

### v4.3.69 — 22 April 2026 ⏳ Draft — pending Sandbox testing

- CHANGED: Design+ upgrade banner — price (`designUpgradePrice`) now renders above the mailto CTA button rather than replacing it. Both are visible when price is present; only the button renders when price is absent.
- CHANGED: Button label "Ask your AM to include this" → "Email your AM to include this" (both branches).
- CHANGED: Price display uses new `.upgrade-banner-pricing` div (plain text) instead of the pink `.upgrade-banner-cta` pill. Button class and `href` unchanged for GTM compatibility.
- ADDED: `.upgrade-banner-pricing { margin-bottom: 10px; }` in `generateCSS()`.

### v4.3.68 — April 2026

- ADDED: `GTM_CONTAINER_ID` constant (`GTM-5NJJSBMP`) for centralised GTM container reference
- ADDED: Data layer push (`nuheat_quote_view` event) injected before GTM head snippet in all generated quote pages — fields: `customerId`, `opportunityId`, `quoteId`, `quoteInternalId`, `pageType`
- ADDED: GTM head snippet (`<script>` loader) injected immediately after `<head>` opening tag
- ADDED: GTM noscript fallback (`<noscript><iframe>`) injected immediately after `<body>` opening tag
- NOTE: No logic or rendering changes — GTM and data layer injection only

---

## Analytics Suitelet (`nuheat_analytics_sl.js`)

### v1.0.1 — April 2026

- FIXED: DateTime fields now receive a JavaScript `Date` object instead of an ISO 8601 string
- FIXED: NetSuite `record.submitFields()` rejects ISO strings for DateTime field types — both `custbodycustbody_quote_last_viewed` and `custbody_opp_quote_last_viewed` affected

### v1.0.0 — April 2026

- ADDED: New Suitelet that receives POST requests from GTM on quote and proposal view events
- ADDED: Quote views write `custbodycustbody_quote_last_viewed` (DateTime) and `custbodycustbody_quote_view_count` (Integer) to the Estimate record
- ADDED: Proposal views write `custbody_opp_quote_last_viewed` (DateTime) and `custbody_opp_view_count` (Integer) to the Opportunity record
- ADDED: Customer ID received and logged to Script Execution Log — not written to any field
- ADDED: CORS headers (`Access-Control-Allow-Origin: *`) and OPTIONS preflight handling for browser fetch() compatibility
- NOTE: Estimate fields use double-prefix IDs (`custbodycustbody_*`) matching how they were created in NetSuite — correct before go-live

---

## Master Proposal (`nuheat_master_proposal.js`)

### v1.6.3 — 29 March 2026 (email URL fix)

- FIXED: Email "VIEW YOUR QUOTES HERE" button broken on all clients (desktop: invalid URL redirect error, mobile: silent no-op)
- FIXED: `file.url` relative path now converted to absolute `https://` URL before storage and email injection
- ADDED: `getAccountHostname()` helper using `N/runtime.accountId` — dynamically derives correct subdomain for both Sandbox and Production
- ADDED: `N/runtime` module import

### v1.6.3 — 28 March 2026 (folder ID fix)

#### Fixed
- Updated File Cabinet folder ID from `21719365` (Sandbox) to `26895192` (Production)
- Resolves "Invalid folder reference key 21719365" error when generating Master Proposals
  in the Production account

---

## Send Quote Suitelet (`nuheat_send_quote_sl.js`) & Client Script (`nuheat_send_quote_cs (1).js`)

### Send Quote SL v1.7.0 / Send Quote CS v1.4.0 — 18 August 2026 ⏳ Draft — pending Sandbox testing

- ADDED (SL): imports `'./nuheat_vat_rates'`. `searchRelatedQuotes()` derives the VAT rate per
  Estimate alongside the existing BUS resolution.
- ⚠️ CHANGED (SL): `taxTotal` and `amount` pushed to the proposal are now **derived**, not raw
  NetSuite values. This is **not** a regression of the v1.4.9 fix — that fix was about reading
  `subtotal` / `discounttotal` / `taxtotal` reliably via `record.load()`, and those reads are
  unchanged. The tax figure is recalculated afterwards because the tax codes are wrong at source.
- ADDED (SL): when `record.load()` fails, the NetSuite fallback values are still used — deriving on
  that path would silently zero the quote's amount.
- ⚠️ FIXED (SL): passes `quoteTypeDisplay`, **not** `rawQuoteType`, to `resolveVatRate()`.
  `VAT_RATES` is keyed on display names; `'Heat Pump (ASHP)'` would not have matched and would have
  fallen through to the 20% default.
- ADDED (SL): hidden sublist fields `custpage_vat_rate` / `custpage_vat_percent`, mirrored into the
  preview path.
- ADDED (CS): collects both fields into the preview payload, so preview and the emailed proposal
  show identical VAT.
- LOGGING (SL): `SendQuoteSL.VAT` per Estimate, plus `VAT_MISMATCH` from the shared module.
- ⚠️ DEPLOYMENT: `nuheat_vat_rates.js` must be in `SuiteScripts/NuHeat` before redeploying.

---

### Send Quote SL v1.6.0 / Send Quote CS v1.3.0 — 18 August 2026 ⏳ Draft — pending Sandbox testing

- ADDED (SL): imports `'./nuheat_bus_grant'`. `searchRelatedQuotes()` reads the item sublist off the
  Estimate it already loads via `record.load()` and resolves the BUS grant there — the Master
  Proposal never loads an Estimate and so has no line-item access of its own.
- ADDED (SL): `busAmount` (0 | 7500 | 9000) and `busRate` ('none' | 'standard' | 'enhanced') carried
  on each quote entry and logged per Estimate as `SendQuoteSL.BUS`.
- ADDED (SL): hidden sublist fields `custpage_bus_amount` and `custpage_bus_rate`. Values are
  stringified on the way out (serverWidget sublists carry TEXT) and `parseFloat`'d on the way back in.
- ADDED (SL): the same treatment on the preview path, so preview and the saved/emailed proposal agree.
- ADDED (SL): `formatSignedCurrency()` for figures that can go negative once the grant exceeds the
  quote value. `formatCurrency()` is unchanged.
- ADDED (CS): collects `custpage_bus_amount` / `custpage_bus_rate` into the preview payload —
  without this the preview would show no grant while the saved proposal showed one.
- FIXED: drifted JSDoc `@version` headers — SL said `1.4.9` (constant `1.5.1`), CS said `1.1.1`
  (constant `1.2.0`).
- ⚠️ DEPLOYMENT: `nuheat_bus_grant.js` must be in `SuiteScripts/NuHeat` before this script is
  redeployed.

---

### v1.5.0 / v1.2.0 — 30 March 2026 ⏳ Draft — pending sandbox/production testing

- ADDED: Contact selector dropdown (`custpage_contact_selector`) on the Send Quote form.
  Loads all contacts from the Opportunity contact sublist via `record.load()`.
  Selecting a contact with an email populates the To address field.
  Contacts without an email display a "(no email)" warning and do not affect the field.
- ADDED: `fieldChanged` handler in client script updates both the visible HTML input
  (`custpage_email_to_input`) and the hidden NetSuite field (`custpage_email_to`) to
  keep both layers in sync when a contact is selected.

---

## Quote Suitelet (`nuheat_quote_suitelet.js`)

### v4.3.67 — 31 March 2026 ✅ Merged to main

- FIXED: `£` symbol conditionally prepended to Design+ upgrade price in UFH banner.
  Skipped if value already starts with `£`. All v4.3.66 styling unchanged.

### v4.3.66 — 31 March 2026 ✅ Merged to main

- FIXED: Design+ upgrade price in the UFH upgrade banner now uses the `.upgrade-banner-cta`
  class — same pink background and white text as the button it replaces. `cursor: default` added
  since the element is not a link. Font size adjusted to match button text size.

### v4.3.65 — 31 March 2026 ⏳ Draft — pending Sandbox testing

- ADDED: `getUpgradePrice()` helper — looks up a price from parallel `*`-delimited fields
  `custbody_upgrades_optiontype` and `custbody_upgrades_itemprice` by matching a target type string.
- ADDED: `quoteData.designUpgradePrice` — populated by matching "Design Charge Option" in the
  upgrades fields. Stored on `quoteData` and passed through to `renderDesignPackageCard()`.
- CHANGED: UFH Standard Design upgrade banner — "Ask your AM to include this" button is now
  replaced by the Design+ price (e.g. "£450.00 plus VAT") when `designUpgradePrice` is non-empty.
  Falls back to the original button when no price is found.

### v4.3.64 — 31 March 2026 ⏳ Draft — pending Sandbox testing

- FIXED: External link icon on the plant room guidance link in the Heat Pump section now appears
  to the left of the link text, consistent with icon placement on product card links.

### v4.3.63 — 31 March 2026 ⏳ Draft — pending Sandbox testing

- ADDED: Plant room layout guidance link in Heat Pump section. A second paragraph below the
  existing intro copy links to the plant room layout and space requirements PDF, styled with
  the `.view-datasheet` class (teal, external link icon). Only renders on quotes with Heat Pump
  items (`renderHeatPumpTreeSection()`).

### v4.3.62 — 31 March 2026 ⏳ Draft — pending Sandbox testing

- ADDED: `COMPONENT_BREAKDOWN_EXCLUDED_ITEMS` constant — "Hidden UFH Discount", "Hidden HP Discount",
  and "Hidden Subtotal" are now filtered out of the Component Breakdown table. Items remain in
  `quoteData.lineItems` for pricing and categorisation.
- ADDED: Right-aligned "View product info" link in the Component Breakdown Description column for
  items that have `custitem_prod_info_link` populated (`item.dataSheetUrl`). Matches behaviour on
  main product cards.

### v4.3.61 — 31 March 2026 ⏳ Draft — pending Sandbox testing

- FIXED: `DESIGN_PACKAGE_ITEMS` had MPDPCD-C (ID 5488) and MPDP-C (ID 480) mapped to the wrong
  keys. MPDPCD-C is the Standard UFH Design; MPDP-C is the UFH Design+ upgrade. The swap caused
  the wrong hardcoded card (and upgrade banner) to render for each item code.

### v4.3.60 — 31 March 2026 ⏳ Draft — pending Sandbox/Production testing

- FIXED: Product card image column (`product-image-column` + `product-image`) was always rendered,
  leaving an empty placeholder box on cards where `custitem_test_image` is blank. `renderProductCard()`
  now conditionally omits the entire image column when `item.productImage` is absent.
- FIXED: Thermostat mini card (`renderMiniProductCard()`) similarly showed a placeholder SVG when no
  image was set. Removed the else branch so no image div is output when `item.imageUrl` is empty.
- CHANGED: Removed `min-height: 150px` and `background: var(--color-bg)` from `.product-image` CSS
  rule to eliminate any residual empty-box appearance.

### v4.3.59 — 30 March 2026 ⏳ Draft — pending testing

- FIXED: Thermostat mini card images were cropped at top and bottom due to `object-fit: cover`.
  Changed to `object-fit: contain` in `generateCSS()` so the full image fits within the 120px
  container regardless of aspect ratio.

### v4.3.58 — 30 March 2026 ⏳ Draft — pending Sandbox/Production testing

- FIXED: Thermostat upgrade card images were blank despite `custitem_test_image` being
  populated. `loadThermostatOptionItems()` was calling `getFileUrl()` on a plain URL string,
  which silently fails. Aligned with the multi-approach resolution already in
  `loadItemCustomFields()`: direct URL detection → `getFileUrl()` → `getText()` fallback.
- CHANGED: Switched all image field reads from `custitem_quote_prod_visual_1` to
  `custitem_test_image` (production image field) — affects `loadThermostatOptionItems()`
  and the main product card enhanced image debug block.

### v4.3.56 — 29 March 2026 ⏳ Pending Sandbox testing

- IMPROVED: Thermostat upgrade cards now use prefix-based exclusion (`THERMOSTAT_EXCLUSION_PREFIXES`)
  against `quoteData.lineItems`. A card is hidden if the quote contains any item whose code begins
  with the card's family prefix. Any thermostat variant suppresses the corresponding upgrade card.
- PERFORMANCE: Fixed card set retained (max four `record.load()` calls). Earlier catalogue-scan
  approach (PR #1, `itemid STARTSWITH`) caused 80+ second timeouts and was abandoned.
- CHANGED: Sort — recommended card first, then `THERMOSTAT_OPTION_ITEM_IDS` defined order.
- ADDED: `THERMOSTAT_EXCLUSION_PREFIXES` constant.

### v4.3.55 — 29 March 2026

- FIXED: Main product card feature bullets empty across all sections (UFH, Heat Pump,
  Solar, Commissioning) — `loadItemCustomFields()` was using incorrect field IDs
  (`custitem_quote_fab_1`–`6`) instead of correct double-prefixed internal IDs
  (`custitemcustitem_quote_fab_1`–`6`). Same root cause as v4.3.54 thermostat fix.

### v4.3.54 — 29 March 2026 (thermostat options fix)

- FIXED: Thermostat options always showing static fallback — `custitem_*` fields invalid as `search.Type.ITEM` columns, causing `SSS_INVALID_SRCH_COL`. Refactored to two-step search + `record.load()` pattern.
- FIXED: Feature bullet points empty — fab field internal IDs are double-prefixed (`custitemcustitem_quote_fab_1` through `_6`). Updated all six field reads to use correct internal IDs.
- FIXED: neoHub+ Recommended banner not rendering — changed `RECOMMENDED_ITEM_ID` comparison to case-insensitive.

### v4.3.54 — 28 March 2026 (design package detection)

#### Added
- `DESIGN_PACKAGE_ITEMS` constant mapping item internal IDs for MPDP-C (Standard UFH Design, ID: 480)
  and MPDPCD-C (UFH Design+ Upgrade, ID: 5488)
- `hasDesignPackageItem(lineItems, targetItemId)` helper function — detects design package presence
  by matching item internal ID, not product type
- Three new flags on `quoteData` object:
  - `hasDesignPackage` — true if either design package is present
  - `hasDesignPackageStandard` — true if MPDP-C is present
  - `hasDesignPackageUpgrade` — true if MPDPCD-C is present
- Audit log entry in `loadQuoteData()` confirming design package detection result per quote

#### Notes
- No changes to rendered quote page output — this is detection/data only
- Flags are available to all render functions via the `quoteData` object, ready for a future
  design package rendering feature
