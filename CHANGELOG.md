## [Quote Suitelet v4.4.0 · Master Proposal v1.7.0 · Send Quote SL v1.6.0 · BUS Grant Module v1.0.0] — 17 August 2026
**Status:** ⏳ Draft — pending Sandbox (472052_SB1) testing

BUS (Boiler Upgrade Scheme) grant rate resolution and post-grant balance display.

### Why
Two related problems:
1. **Bug** — when a heat pump quote was worth less than the BUS grant, the quote page rendered a
   misleading negative heat pump price (e.g. `£-1,870.33`) next to a positive commissioning price.
   A component price must never go negative; the *balance after BUS* is what carries the negative
   value, and it needs explaining to the customer.
2. **Feature** — the grant was effectively a fixed £7,500 in all customer-facing copy. It must be one
   of three outcomes (£7,500 / £9,000 / none), driven by the Suppak line item on the Estimate, and
   applied consistently on the quote page *and* the Master Proposal.

### Added
- **New file `nuheat_bus_grant.js` (v1.0.0)** — shared AMD module and single source of truth for BUS
  rates. Exports `BUS_RATES`, `BUS_STANDARD_ITEMS`, `BUS_ENHANCED_ITEMS`, `SUPPAK_PREFIX`,
  `normaliseItemName()` and `resolveBusGrant()`. Imported directly by the Quote Suitelet and the
  Send Quote SL — never via `https.get()`, per project rules.
- `resolveBusGrant()` returns `{ amount, rate, matchedItem, suppressedBy }` and logs a `BUS_RESOLVE`
  audit line. Precedence: enhanced beats standard; a non-qualifying Suppak line suppresses the grant
  only when no qualifying line is present; no Suppak line means no grant.
- `normaliseItemName()` takes the last colon-delimited segment (NetSuite returns sub-items as
  `"Parent : Child"`), collapses whitespace and lowercases. Matching is by **exact equality**, so
  `Suppak BUS - Uplift` can never be caught by the `Suppak BUS` entry.
- Quote Suitelet: `quoteData.bus` — resolved once in `loadQuoteData()` and read by every render
  function. Carries `amount`, `rate`, `grossSubtotal`, `hpGross`, `hpDisplayPrice`, `residualGrant`,
  `commissioningDisplay`, `balanceAfterBus` and `creditDue`.
- Quote Suitelet: `formatSignedCurrency()` and `formatGrantAmount()` helpers.
- Quote Suitelet: `CASCADE_GRANT_TO_COMMISSIONING` constant (default `false`) — see Open Point below.
- Quote Suitelet: `.hp-grant-banner-refund` CSS class.
- Master Proposal: `formatSignedCurrency()`, `formatGrantAmount()`, `getBusAmount()`,
  `hasBusGrant()`, `getQuoteBalance()`.
- Master Proposal: "BUS grant applied" line on the total price bar; `busTotal` returned by
  `calculateTotals()`.
- Send Quote SL: `extractItemNames()`; hidden sublist fields `custpage_bus_amount` and
  `custpage_bus_rate`.

### Fixed
- **The reported bug** — the heat pump price card is now clamped at £0.00 and can never render a
  negative figure. Previously `header.subtotal - commissioningTotal` produced `£-1,870.33`.
- Negative currency now renders as `-£694.40`, never `£-694.40`. Applied to both total bars and the
  Master Proposal cards and totals.
- A balance that rounds to zero renders `£0.00`, never `-£0.00`. `formatSignedCurrency()` takes the
  sign from the value **as displayed** (rounded to 2dp), so a floating-point residue in a sum of
  NetSuite line amounts cannot leak a spurious minus sign.
- Master Proposal `generateQuoteCard()`: the `if (subtotal > 0)` guard suppressed the price entirely
  when the grant exceeded the quote value. A negative balance now renders.
- Master Proposal: "Total inc. VAT" detail used a `> 0` guard, hiding a negative total. Now `!== 0`.
- Quote page "Total inc VAT" lines (both bars) previously rendered `£-694.40`.
- Solar price now derives from `grossSubtotal`, so a BUS grant on a mixed Solar + Heat Pump quote is
  not silently absorbed into the solar figure. No change for solar-only quotes.

### Changed
- Quote page grant card is now conditional (`quoteData.bus.amount > 0`) and dynamic — reads
  "£7,500 grant funding has been applied to this quote" or "£9,000" on the enhanced rate, with
  "*Subject to scheme eligibility" beneath. A third line appears **only** when the grant exceeds the
  quote value: "Any grant funding in excess of your quote value (£694.40) will be refunded to you
  once the grant has been claimed."
- Quote page total sections (top and bottom bars) show the post-grant balance as the headline plus
  "System price", "BUS grant applied" and "Balance after BUS grant" breakdown lines. With no grant
  the output is byte-identical to v4.3.69.
- Heat Pump design package bullet no longer hard-codes £7,500; falls back to generic copy when no
  grant applies.
- Master Proposal `generateBUSGrantBanner()` takes the amount as an argument and renders only when a
  main heat pump quote actually carries a grant. Where rates differ, the highest present is shown.
- Master Proposal card price shows the post-grant balance, with "Includes £7,500 BUS grant" and,
  when negative, "£694.40 refundable to you".
- Send Quote CS bumped to v1.3.0 to carry the new fields into the preview payload.

### Removed
- Legacy `.grant-banner` block in `renderCategorySection()` and its CSS — dead code, both call sites
  passed `showGrantBanner = false`. The `showGrantBanner` parameter was removed with it.
- Legacy "This system may be eligible for a £7,500 Government grant" copy, superseded by the
  dynamic grant card.

### Important implementation note — no double-deduction
The grant is a **line on the NetSuite Estimate**, so the standard `subtotal` field is *already net*
of it. There was never a hard-coded 7500 subtraction in code — the only `7500` occurrences were
display copy. All new code therefore derives `grossSubtotal = header.subtotal + busAmount` to recover
the ex-VAT value **before** the grant, then deducts exactly once. The Master Proposal's
`getQuoteBalance()` returns `subtotal` unchanged for the same reason — subtracting `busAmount` there
would double-count the grant.

### Testing notes
Verified with three offline suites against the shipped source (arithmetic, Master Proposal pricing
helpers, and emitted HTML): all 10 brief scenarios plus name-normalisation, precedence,
negative/`-£0.00` formatting and float-residue edge cases. Sandbox verification still required —
see `TESTING_GUIDE.md`.

**Note on brief scenario 8:** the brief's expected balance of £0.00 for "HP gross exactly £7,500"
holds only when commissioning is zero. With commissioning billed, the balance correctly retains the
commissioning value. The `-£0.00` guard is verified separately against the whole-quote-equals-grant
case and against float residue.

### Open point for Steve — confirm before merge
With `CASCADE_GRANT_TO_COMMISSIONING = false` (the chosen default), scenario 1 renders a heat pump
price of £0.00 and a commissioning price of £1,175.93 while the total shows -£694.40. Those visible
components do not sum to the total — the £1,870.33 of grant absorbed by the clamp is not shown
anywhere. Flipping the flag to `true` makes the page add up but makes commissioning appear free.
One-line change either way once seen rendered.

---

## [Quote Suitelet v4.3.69] — 22 April 2026
**Status:** ✅ Merged to main
### Changed
- Design+ upgrade banner: price now renders above the mailto CTA button rather than replacing it — both price and button are visible together when `designUpgradePrice` is present
- Button label updated: "Ask your AM to include this" → "Email your AM to include this" (both the price-present and price-absent cases)
- Price display changed from pink `.upgrade-banner-cta` pill to plain `.upgrade-banner-pricing` div — button retains the pink styling
- `.upgrade-banner-cta` class and `href` unchanged (GTM click tracking preserved)
### Added
- `.upgrade-banner-pricing { margin-bottom: 10px; }` CSS rule in `generateCSS()`

---

## [Master Proposal v1.6.6] — 22 April 2026
**Status:** ✅ Merged to main
### Added
- Site address (`custbody_opp_site_adress`) read from Opportunity record in `loadOpportunityData()` using defensive try-catch pattern
- "Site address:" row rendered in Customer Information card between Customer name and System reference — conditionally hidden when field is empty

---

## [Master Proposal v1.6.5] — 22 April 2026
**Status:** ✅ Merged to main
### Changed
- UFH benefits: 'Room-by-room heat losses' replaced with 'Detailed installation pack'
- Step 2 "Bespoke design" description: removed reference to heat-loss calculations

---

## [Master Proposal v1.6.4] — April 2026
### Added
- GTM container GTM-5NJJSBMP injected into all generated proposal pages
- Data layer push fires nuheat_proposal_view event on page load with:
  customerId, opportunityId, pageType
- GTM noscript fallback added immediately after <body> tag
- Data layer populated before GTM snippet to ensure values available on load

---

## [Quote Suitelet v4.3.68] — April 2026
### Added
- GTM container GTM-5NJJSBMP injected into all generated quote pages
- Data layer push fires nuheat_quote_view event on page load with:
  customerId, opportunityId, quoteId (tranId), quoteInternalId, pageType
- GTM noscript fallback added immediately after <body> tag
- Data layer populated before GTM snippet to ensure values available on load

---

## [Analytics Suitelet v1.0.1] — April 2026
### Fixed
- DateTime fields now receive a JavaScript Date object instead of an ISO string
- NetSuite record.submitFields() rejects ISO 8601 strings for DateTime field types

---

## [Analytics Suitelet v1.0.0] — April 2026
### Added
- New script: nuheat_analytics_sl.js
- Receives POST from GTM on quote and proposal view events
- Quote views: writes last viewed date and view count to Estimate record
- Proposal views: writes last viewed date and view count to Opportunity record
- Customer ID logged to Script Execution Log for diagnostic purposes
- CORS headers included for browser fetch() compatibility
- Fire-and-forget pattern — never blocks customer page load
### Notes
- Estimate fields use double-prefix IDs (custbodycustbody_*) due to field creation error in NetSuite — correct in production before go-live

---

## v4.3.67 — Prepend £ symbol to Design+ upgrade price in UFH banner
**Date:** 31 March 2026
**Component:** Quote Suitelet (`nuheat_quote_suitelet.js`)
**Status:** ✅ Merged to main

### Fixed
- **£ symbol on upgrade price** — The Design+ upgrade price in the UFH Standard Design banner
  now displays with a `£` prefix. Applied conditionally — if the value in
  `custbody_upgrades_itemprice` already begins with `£`, it is used as-is to prevent doubling.
  All styling from v4.3.66 is preserved unchanged.

### Files Changed
- `nuheat_quote_suitelet.js` — Price span updated with conditional `£` prefix; version bumped to v4.3.67

---

## v4.3.66 — Style Design+ upgrade price to match pink CTA button
**Date:** 31 March 2026
**Component:** Quote Suitelet (`nuheat_quote_suitelet.js`)
**Status:** ⏳ Draft — pending Sandbox testing

### Fixed
- **Design+ upgrade price styling** — The price pill in the UFH Standard Design upgrade banner
  now uses the existing `.upgrade-banner-cta` class, giving it the same pink (`#AA0061`)
  background and white text as the "Ask your AM to include this" button it replaces. Font sizes
  brought in line with the button (15px bold for the price, 13px regular for "plus VAT").
  `cursor: default` prevents the pointer cursor since this is not a link. No new CSS required.

### Files Changed
- `nuheat_quote_suitelet.js` — Price display block in `renderDesignPackageCard()` updated;
  version bumped to v4.3.66

---

## v4.3.65 — Show Design+ upgrade price in UFH upgrade banner
**Date:** 31 March 2026
**Component:** Quote Suitelet (`nuheat_quote_suitelet.js`)
**Status:** ⏳ Draft — pending Sandbox testing

### Added
- **Design+ upgrade price in UFH upgrade banner** — The "Ask your AM to include this" CTA button
  in the Standard UFH Design card's upgrade banner is now replaced by the actual Design+ upgrade
  price when available. Price is looked up by splitting `custbody_upgrades_optiontype` and
  `custbody_upgrades_itemprice` on `*`, finding the entry whose type equals "Design Charge Option"
  (case-insensitive), and displaying the corresponding price as e.g. "£450.00 plus VAT".
  Falls back to the original CTA button when no matching price is found, so quotes without these
  fields populated are unaffected.
- **New helper:** `getUpgradePrice(optionTypeStr, itemPriceStr, targetType)` — generic parallel
  delimited-list lookup, reusable for other upgrade option types.

### Files Changed
- `nuheat_quote_suitelet.js` — `getUpgradePrice()` helper added; `loadQuoteData()` reads
  `custbody_upgrades_optiontype` / `custbody_upgrades_itemprice` and stores result as
  `quoteData.designUpgradePrice`; upgrade banner in `renderDesignPackageCard()` updated;
  version bumped to v4.3.65

---

## v4.3.64 — Move external link icon to left of plant room guidance link text
**Date:** 31 March 2026
**Component:** Quote Suitelet (`nuheat_quote_suitelet.js`)
**Status:** ⏳ Draft — pending Sandbox testing

### Fixed
- **External link icon position on plant room guidance link** — The `SVG_EXTERNAL_LINK` icon was
  appearing to the right of the link text. It now appears to the left, consistent with icon
  placement on "View more details" links throughout the product cards.

### Files Changed
- `nuheat_quote_suitelet.js` — Icon moved before link text in `renderHeatPumpTreeSection()`;
  version bumped to v4.3.64

---

## v4.3.63 — Add plant room layout guidance link to Heat Pump section
**Date:** 31 March 2026
**Component:** Quote Suitelet (`nuheat_quote_suitelet.js`)
**Status:** ⏳ Draft — pending Sandbox testing

### Added
- **Plant room guidance link in Heat Pump section** — A second paragraph now appears directly
  below the existing Heat Pump intro copy, containing a link to the plant room layout and space
  requirements PDF. Styled using the existing `.view-datasheet` class (teal `#00857D`, external
  link icon) for visual consistency with "View more details" links on product cards. The link only
  appears on quotes that include Heat Pump line items, as it is rendered inside
  `renderHeatPumpTreeSection()`.

### Files Changed
- `nuheat_quote_suitelet.js` — Second intro paragraph added in `renderHeatPumpTreeSection()`;
  version bumped to v4.3.63

---

## v4.3.62 — Component Breakdown improvements
**Date:** 31 March 2026
**Component:** Quote Suitelet (`nuheat_quote_suitelet.js`)
**Status:** ⏳ Draft — pending Sandbox testing

### Added
- **"View product info" link in Component Breakdown** — Items that have a value in
  `custitem_prod_info_link` (loaded as `item.dataSheetUrl`) now display a right-aligned
  "View product info" link in the Description column, consistent with the same link already
  shown on main product cards.

### Fixed
- **Internal items hidden from Component Breakdown** — "Hidden UFH Discount", "Hidden HP Discount",
  and "Hidden Subtotal" line items no longer appear in the customer-facing Component Breakdown table.
  A new `COMPONENT_BREAKDOWN_EXCLUDED_ITEMS` constant controls the exclusion list. These items remain
  in `quoteData.lineItems` for all other purposes (pricing, categorisation, design package detection).

### Files Changed
- `nuheat_quote_suitelet.js` — `COMPONENT_BREAKDOWN_EXCLUDED_ITEMS` constant added; Component
  Breakdown loop updated with exclusion check and conditional info link; version bumped to v4.3.62

---

## v4.3.61 — Fix swapped DESIGN_PACKAGE_ITEMS constants
**Date:** 31 March 2026
**Component:** Quote Suitelet (`nuheat_quote_suitelet.js`)
**Status:** ⏳ Draft — pending Sandbox testing

### Fixed
- **Swapped design package item IDs** — `DESIGN_PACKAGE_ITEMS` had MPDPCD-C and MPDP-C mapped
  to the wrong keys. MPDPCD-C (internal ID 5488) is the Standard UFH Design package; MPDP-C
  (internal ID 480) is the UFH Design+ upgrade package. The swapped mapping caused the wrong
  hardcoded card to render for each item code, and the upgrade banner appeared on the wrong card.

### Files Changed
- `nuheat_quote_suitelet.js` — `DESIGN_PACKAGE_ITEMS` constant corrected; version bumped to v4.3.61

---

## v4.3.60 — Hide product card image placeholder when custitem_test_image is empty
**Date:** 31 March 2026
**Component:** Quote Suitelet (`nuheat_quote_suitelet.js`)
**Status:** ⏳ Draft — pending Sandbox/Production testing

### Fixed
- **Empty image placeholder box on product cards** — The image container (`product-image-column`
  and `product-image`) was always rendered even when `custitem_test_image` was blank, leaving a
  visible empty box on cards with no image. The entire image column is now conditionally omitted
  from the HTML when `item.productImage` is absent. Applies to all card types rendered via
  `renderProductCard()` (UFH, Heat Pump, Solar, Commissioning).
- **Mini card placeholder** — The thermostat mini card (`renderMiniProductCard()`) similarly
  rendered a placeholder SVG box when no image was set. The else branch has been removed so no
  image div is output when `item.imageUrl` is empty.

### Changed
- Removed `min-height: 150px` and `background: var(--color-bg)` from `.product-image` CSS rule —
  these properties had no effect on the card layout once the column is conditionally omitted, but
  removing them prevents any residual empty-box appearance if the element is rendered without an image.

### Files Changed
- `nuheat_quote_suitelet.js` — `renderProductCard()` and mini card conditional updated;
  `.product-image` CSS rule cleaned up; version bumped to v4.3.60

---

## Send Quote SL v1.5.1 — Fix contact sublist ID
**Date:** 31 March 2026
**Component:** Send Quote Suitelet (`nuheat_send_quote_sl.js`)
**Status:** ⏳ Draft — pending sandbox/production testing

### Fixed
- **Contact selector showing no contacts** — `getLineCount()` and `getSublistValue()` were
  using sublist ID `'contact'`, which does not exist on Opportunity records. The correct
  internal ID is `'contactroles'`. The field ID within the sublist (`fieldId: 'contact'`)
  is unchanged.

### Files Changed
- `nuheat_send_quote_sl.js` — Sublist ID corrected to `'contactroles'`; version bumped to v1.5.1

---

## Send Quote SL v1.5.0 — Add contact selector dropdown to email field
**Date:** 30 March 2026
**Component:** Send Quote Suitelet (`nuheat_send_quote_sl.js`) + Client Script (`nuheat_send_quote_cs.js`)
**Status:** ⏳ Draft — pending sandbox/production testing

### Added
- **Contact selector dropdown** — Users can now select a contact from the
  Opportunity's contact list to populate the To email address. Contacts without
  an email address are shown with a "(no email)" warning and do not overwrite
  the email field when selected. No contact is pre-selected by default.

### Files Changed
- `nuheat_send_quote_sl.js` — Contact sublist loading + `custpage_contact_selector` SELECT field added; version bumped to v1.5.0
- `nuheat_send_quote_cs.js` — `fieldChanged` handler added for contact selector; version bumped to v1.2.0

---

## v4.3.59 — Fix thermostat mini card image clipping
**Date:** 30 March 2026
**Component:** Quote Suitelet (`nuheat_quote_suitelet.js`)
**Status:** ⏳ Draft — pending testing

### Fixed
- **Thermostat mini card image clipping** — Images were being cropped at the top and
  bottom due to `object-fit: cover` scaling behaviour. Changed to `object-fit: contain`
  so the full image is always visible within the container regardless of aspect ratio.

### Files Changed
- `nuheat_quote_suitelet.js` — CSS updated for mini card image element;
  version bumped to v4.3.59

---

## v4.3.58 — Fix thermostat upgrade card images not rendering
**Date:** 30 March 2026
**Component:** Quote Suitelet (`nuheat_quote_suitelet.js`)
**Status:** ⏳ Draft — pending Sandbox/Production testing

### Fixed
- **Thermostat upgrade card images** — Images were blank despite `custitem_test_image`
  being populated on item records. Root cause: `loadThermostatOptionItems()` was using
  `getFileUrl()` alone, which fails when the field contains a plain URL string rather
  than a NetSuite file ID. Fixed by aligning with the multi-approach resolution pattern
  already used in `loadItemCustomFields()` (direct URL → getFileUrl → getText fallback).
- **Product card image field** — Switched both `loadThermostatOptionItems()` and the
  main product card path from `custitem_quote_prod_visual_1` to `custitem_test_image`
  (production image field). No remaining references to the old field.

### Files Changed
- `nuheat_quote_suitelet.js` — Image resolution updated in `loadThermostatOptionItems()`;
  field switched to `custitem_test_image` in all three read locations; version bumped to v4.3.58

---

## v4.3.56 — Thermostat upgrade cards: prefix-based exclusion on fixed card set
**Date:** 29 March 2026
**Component:** Quote Suitelet (`src/nuheat_quote_suitelet.js`)
**Status:** ⏳ Pending Sandbox testing sign-off — do not deploy to Production until confirmed

### Improvement
Thermostat upgrade cards now use prefix-based exclusion against the main quote
materials list, replacing the old exact item ID comparison. A card is hidden if
the main quote already contains any item whose ID begins with the corresponding
family prefix — meaning any variant of that thermostat suppresses the upgrade card.

### Performance note
An earlier approach (closed PR #1) attempted prefix-based catalogue searching using
`itemid STARTSWITH` filters. This caused 80+ second execution times and
ScriptNullObjectAdapter errors because it scanned the full item catalogue and called
`record.load()` for every match. The final implementation retains a fixed set of four
item IDs (maximum four `record.load()` calls) and moves prefix logic to the exclusion
check only — where it has no performance cost.

### Constants
- `THERMOSTAT_OPTION_ITEM_IDS` — fixed four card IDs (unchanged from original)
- `THERMOSTAT_EXCLUSION_PREFIXES` — new map of card ID → family prefix
- `RECOMMENDED_ITEM_ID` — unchanged

### Exclusion logic
| Card | Hidden when main quote contains item starting with |
|------|---------------------------------------------------|
| DSSB5-C | DSSB |
| neoHub+-C | NeoHub |
| Neostatwv2-C | Neostat |
| NeoAirwv3-C | NeoAir |

### Files Changed
- `src/nuheat_quote_suitelet.js` — v4.3.55 → v4.3.56

### Testing
- [ ] All four cards render on a UFH-only quote with no thermostat on the order
- [ ] Each card is correctly suppressed when its family prefix is on the quote
- [ ] neoHub+-C Recommended badge present, card appears first
- [ ] Execution time normal (under 5 seconds)
- [ ] No THERMOSTAT_OPTIONS_ERROR in Script Execution Log

---

## v4.3.55 — Fix double-prefixed fab field IDs in main product cards
**Date:** 29 March 2026
**Component:** Quote Suitelet (`src/nuheat_quote_suitelet.js`)

### Bug Fixed
Feature/benefit bullet points were empty on all main product cards (UFH, Heat Pump,
Solar, Commissioning sections). Root cause is identical to the thermostat section fix
in v4.3.54: the six fab fields have double-prefixed internal IDs
(`custitemcustitem_quote_fab_1` through `custitemcustitem_quote_fab_6`), but
`loadItemCustomFields()` was calling `getValue()` with the shorter name-based ID
(`custitem_quote_fab_1`), which silently returns empty in NetSuite without throwing
an error.

### Fix
Updated all `custitem_quote_fab_` field ID references in `loadItemCustomFields()`
(and any other non-thermostat, non-comment occurrences in the file) to use the
correct double-prefixed internal IDs (`custitemcustitem_quote_fab_`).

Note: Comments and log strings intentionally retain the shorter form for readability.

### Files Changed
- `src/nuheat_quote_suitelet.js` — v4.3.54 → v4.3.55

### Testing
- [ ] Regen a UFH quote — feature bullet points should be populated on all product cards
- [ ] Regen a Heat Pump quote — feature bullets populated on Heat Pump product cards
- [ ] Regen a Solar quote — feature bullets populated on Solar product cards
- [ ] Regen a Commissioning-only quote — feature bullets populated where configured
- [ ] Verify no regressions on thermostat cards (should still work from v4.3.54)
- [ ] Check Script Execution Log — no new errors

---

## v4.3.54 — Fix thermostat options section (search columns + field ID double-prefix)
**Date:** 29 March 2026
**Component:** Quote Suitelet (`src/nuheat_quote_suitelet.js`)

### Bugs Fixed

**Bug 1 — Thermostat cards never rendered (static fallback always showing)**
`loadThermostatOptionItems()` included `custitem_quote_fab_1` through `fab_6` as
`search.create()` columns. NetSuite throws `SSS_INVALID_SRCH_COL` for custom item
fields used as search columns on `search.Type.ITEM`, aborting the entire search and
returning zero results. The static fallback tiles rendered instead of live product cards.

Fix: Refactored to a two-step approach — Step 1 searches with standard columns only
(`itemid`, `displayname`, `description`); Step 2 calls `record.load()` per matched
item to read all `custitem_*` fields reliably.

**Bug 2 — Feature/benefit bullets always empty**
The six fab fields have double-prefixed internal IDs (`custitemcustitem_quote_fab_1`
through `custitemcustitem_quote_fab_6`) because the field names already begin with
`custitem_`. `record.load().getValue({ fieldId: 'custitem_quote_fab_1' })` silently
returned empty. All other custom item fields use standard IDs and are unaffected.

Fix: Updated all six fab field reads to use the correct internal IDs
(`custitemcustitem_quote_fab_1` through `custitemcustitem_quote_fab_6`).

**Bug 3 — Recommended banner not showing on neoHub+ card**
`isRecommended` used strict `===` comparison against `RECOMMENDED_ITEM_ID`. If
NetSuite returns `itemid` in different casing the comparison silently fails.

Fix: Changed to case-insensitive comparison using `.toLowerCase()` on both sides.

### Files Changed
- `src/nuheat_quote_suitelet.js` — `loadThermostatOptionItems()` rewritten
- `docs/AI_AGENT_CONTEXT.md` — Added two new NetSuite quirks (Section 9)
- `CHANGELOG.md` — This entry

### Testing
- [ ] Regen a UFH-only quote — thermostat options section should show live product cards (not static tiles)
- [ ] Verify neoHub+ card shows the "Recommended" banner
- [ ] Verify feature bullet points are populated on each card
- [ ] Verify product images load correctly
- [ ] Verify "View more details" links are present where configured
- [ ] Regen a Heat Pump or Solar quote — thermostat section should be hidden entirely
- [ ] Check Script Execution Log — no `THERMOSTAT_OPTIONS_ERROR` entries
- [ ] Check debug log — confirm `featuresCount > 0` and `isRecommended: true` for neoHub+

---

## v1.6.3 — Master Proposal: Fix broken email button URL
**Date:** 29 March 2026
**Component:** Master Proposal (`src/nuheat_master_proposal.js`)

### Bug Fixed
The "VIEW YOUR QUOTES HERE" button in the customer proposal email was broken for all recipients:
- **Desktop:** Google "Redirect Notice — The page you were on is trying to send you to an invalid URL (`http:///core/media/media.nl?id=...`)"
- **Mobile:** Button tap did nothing (mail clients silently drop malformed hrefs)

### Root Cause
`file.load().url` in NetSuite returns a **relative path** (e.g. `/core/media/media.nl?id=43237660&c=472052&h=...`). This was being stored directly as `proposalUrl` and injected into the email `href` attribute. Email clients have no NetSuite base URL to resolve it against, producing `http:///` (protocol with no hostname).

### Fix
- Added `getAccountHostname()` helper using `N/runtime.accountId` to dynamically derive the fully-qualified account URL (e.g. `https://472052-sb1.app.netsuite.com`). Handles both Sandbox (`_SB1` → `-sb1`) and Production automatically.
- `saveProposalToFileCabinet()` now prepends the hostname to produce an absolute `https://` URL.
- Added `N/runtime` to module imports.

### Files Changed
- `src/nuheat_master_proposal.js` — v1.6.2 → v1.6.3

### Testing
- [ ] Generate and send a proposal from the Send Quote UI
- [ ] Click "VIEW YOUR QUOTES HERE" in the received email on desktop — should open proposal page
- [ ] Click the button on mobile — should open proposal page
- [ ] Check Script Execution Log — verify "Absolute URL" log entry shows a valid `https://` URL
- [ ] Confirm "View Master Proposal" link on the NetSuite success page also works
- [ ] Repeat test from Sandbox to verify subdomain format is correct (`472052-sb1.app.netsuite.com`)

---

## [1.6.3] Master Proposal — 28 March 2026

### Fixed
- Updated File Cabinet folder ID from `21719365` (Sandbox) to `26895192` (Production)
- Resolves "Invalid folder reference key 21719365" error when generating Master Proposals
  in the Production account

---

## [4.3.54] Quote Suitelet — 28 March 2026

### Added
- `DESIGN_PACKAGE_ITEMS` constant mapping item internal IDs for MPDP-C (Standard UFH Design, ID: 480)
  and MPDPCD-C (UFH Design+ Upgrade, ID: 5488)
- `hasDesignPackageItem(lineItems, targetItemId)` helper function — detects design package presence
  by matching item internal ID, not product type
- Three new flags on `quoteData` object:
  - `hasDesignPackage` — true if either design package is present
  - `hasDesignPackageStandard` — true if MPDP-C is present
  - `hasDesignPackageUpgrade` — true if MPDPCD-C is present
- Audit log entry in `loadQuoteData()` confirming design package detection result per quote

### Fixed
- Removed duplicate `DESIGN_PACKAGE_ITEMS` declaration that caused SyntaxError on script load
  (constant already existed in the file prior to v4.3.54)

### Notes
- No changes to rendered quote page output — this is detection/data only
- Flags are available to all render functions via the `quoteData` object, ready for a future
  design package rendering feature

---

## [Config] File Cabinet Folder ID — 28 March 2026

### Changed
- Updated File Cabinet folder ID from `21719365` (Sandbox) to `26895192` (Production)
- Functional change in: `src/nuheat_quote_viewer_sl.js`, `src/nuheat_quote_suitelet.js`
- Comment/doc updates in: `src/nuheat_quote_ue.js`, `src/nuheat_quote_generator_ss.js`, `README.md`, `docs/AI_AGENT_CONTEXT.md`

### Notes
- Sandbox folder ID `21719365` preserved in `docs/AI_AGENT_CONTEXT.md` for reference
- If reverting to Sandbox, update `QUOTE_HTML_FOLDER_ID` in the two functional files above
