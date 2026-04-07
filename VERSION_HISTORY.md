# Version History

## Quote Suitelet (`nuheat_quote_suitelet.js`)

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
