# Version History

## BUS Grant Module (`nuheat_bus_grant.js`)

### v1.0.0 — 17 August 2026 ⏳ Draft — pending Sandbox testing

- ADDED: New shared AMD module — single source of truth for BUS grant rates, imported directly by
  both `nuheat_quote_suitelet.js` and `nuheat_send_quote_sl.js`.
- ADDED: `BUS_RATES` (`STANDARD: 7500`, `ENHANCED: 9000`).
- ADDED: `BUS_STANDARD_ITEMS` — `suppak n1(r)hp`, `suppak n1(nb)hp`, `suppak bus`.
- ADDED: `BUS_ENHANCED_ITEMS` — `suppak bus - uplift`.
- ADDED: `SUPPAK_PREFIX` (`suppak`) — a line matching the prefix but neither list suppresses the grant.
- ADDED: `normaliseItemName()` — last colon-delimited segment, whitespace collapsed, lowercased.
- ADDED: `resolveBusGrant()` — returns `{ amount, rate, matchedItem, suppressedBy }`, logs `BUS_RESOLVE`.
- NOTE: Matching is exact equality, NOT substring — `suppak bus - uplift` cannot be caught by the
  `suppak bus` entry, so no longest-match ordering is needed. Do not switch to `startsWith`.

---

## Master Proposal (`nuheat_master_proposal.js`)

### v1.7.0 — 17 August 2026 ⏳ Draft — pending Sandbox testing

- CHANGED: `generateQuoteCard()` renders the post-grant balance for heat pump quotes carrying a BUS
  grant, via `getQuoteBalance()`. NS `subtotal` is already net of the grant, so the balance IS the
  subtotal — `busAmount` is never deducted again.
- FIXED: the `if (subtotal > 0)` guard suppressed the price entirely when the grant exceeded the
  quote value. A negative balance now renders.
- FIXED: "Total inc. VAT" detail used a `> 0` guard, hiding a negative total. Now `!== 0`.
- ADDED: `.system-card-price-detail` shows "Includes £7,500 BUS grant" (dynamic) and, when the
  balance is negative, "£694.40 refundable to you" (dynamic).
- CHANGED: `generateBUSGrantBanner(busAmount)` takes the amount as an argument instead of hard-coding
  £7,500 in title and description. Rendered only when a main heat pump quote actually carries a
  grant; where rates differ, the highest present is used.
- CHANGED: `calculateTotals()` aggregates via `getQuoteBalance()` and returns `busTotal`. Negative
  per-quote balances reduce the total rather than being skipped, so the headline bar matches the sum
  of the cards.
- CHANGED: total price bar shows a "BUS grant applied" line and renders negative aggregates.
- ADDED: `formatSignedCurrency()` — "-£694.40", never "£-694.40", and never "-£0.00" for a value that
  rounds to zero (sign taken from the 2dp-rounded value).
- ADDED: `formatGrantAmount()`, `getBusAmount()`, `hasBusGrant()`, `getQuoteBalance()`.

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

### v4.4.0 — 17 August 2026 ⏳ Draft — pending Sandbox testing

- ADDED: `./nuheat_bus_grant` imported via `define()`; `BUS_RATES` aliased from it.
- ADDED: `CASCADE_GRANT_TO_COMMISSIONING` constant (default `false`) — when `true`, grant left over
  after the heat pump price reaches £0 also reduces the displayed commissioning price.
- ADDED: `quoteData.bus` — BUS resolved ONCE in `loadQuoteData()` and read by every render function.
  Carries `amount`, `rate`, `matchedItem`, `suppressedBy`, `grossSubtotal`, `commissioningTotal`,
  `hpGross`, `hpDisplayPrice`, `residualGrant`, `commissioningDisplay`, `balanceAfterBus`, `creditDue`.
- ADDED: `formatSignedCurrency(value, symbol)` — minus sign before the symbol; sign taken from the
  2dp-rounded value so a float residue never renders "-£0.00".
- ADDED: `formatGrantAmount(value)` — strips the trailing ".00" for headline copy (£7,500 not £7,500.00).
- FIXED: heat pump price card is clamped at £0.00 via `bus.hpDisplayPrice`. Previously
  `header.subtotal - commissioningTotal` rendered `£-1,870.33` when the grant exceeded the quote.
- CHANGED: grant card is conditional on `bus.amount > 0` and dynamic — "£7,500 grant funding has been
  applied to this quote" / "£9,000", with "*Subject to scheme eligibility" beneath, plus a refund
  line when `creditDue > 0`.
- ADDED: `.hp-grant-banner-refund` CSS class in `generateCSS()`.
- CHANGED: `renderTotalSection()` AND `renderTopTotalSection()` — headline becomes the post-grant
  balance, with "System price", "BUS grant applied" and "Balance after BUS grant" lines. Byte-identical
  to v4.3.69 when `bus.amount === 0`. The existing conditional discount line still works alongside.
- FIXED: "Total inc VAT" on both bars rendered `£-694.40`; now uses `formatSignedCurrency()`.
- CHANGED: commissioning price card reads `bus.commissioningDisplay`. Identical to v4.3.69 with the
  cascade flag at its `false` default.
- FIXED: solar price derives from `bus.grossSubtotal`, so a grant on a mixed Solar + Heat Pump quote
  is not silently absorbed into the solar figure. Unchanged for solar-only quotes.
- CHANGED: Heat Pump design package BUS bullet no longer hard-codes £7,500; generic copy when no
  grant applies.
- REMOVED: legacy `.grant-banner` block in `renderCategorySection()`, its CSS, and the
  `showGrantBanner` parameter — dead code, both call sites passed `false`.
- NOTE: NS `subtotal` is already net of the grant (it is a line on the Estimate), so `grossSubtotal`
  ADDS the grant back. Never deduct `busAmount` from `header.subtotal`.

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

## Send Quote Suitelet (`nuheat_send_quote_sl.js`) & Client Script (`nuheat_send_quote_cs.js`)

### v1.6.0 / v1.3.0 — 17 August 2026 ⏳ Draft — pending Sandbox testing

**Suitelet v1.6.0**
- ADDED: `./nuheat_bus_grant` imported via `define()` — direct module import, never `https.get()`.
- ADDED: `extractItemNames()` reads every item line off the loaded Estimate as `{ itemName }` objects.
  Deliberately unfiltered — the Suppak lines that drive the rate sit in the Commissioning category
  (product type Labour, ID 41). Never throws: a BUS rate must not break quote gathering.
- ADDED: `searchRelatedQuotes()` resolves `busAmount` (0 | 7500 | 9000) and `busRate`
  ('none' | 'standard' | 'enhanced') per quote, reusing the `record.load()` already performed for
  pricing — no extra governance cost.
- ADDED: hidden sublist fields `custpage_bus_amount` and `custpage_bus_rate`, populated on render and
  read back in `handleSubmission()`. The form POSTs back through the sublist, so without these the
  resolved rate would be lost on the round-trip.
- ADDED: `busAmount`/`busRate` to the `handlePreview()` mapping so preview and sent proposal agree.

**Client Script v1.3.0**
- ADDED: `custpage_bus_amount` / `custpage_bus_rate` collected into the preview payload. Without
  these the preview would show no grant while the sent proposal showed the resolved rate.

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
