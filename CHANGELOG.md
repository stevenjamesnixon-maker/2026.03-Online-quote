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
