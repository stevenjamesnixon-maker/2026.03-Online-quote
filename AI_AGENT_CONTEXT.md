# Nu-Heat Quote System — AI Agent Context Document

**Purpose:** Comprehensive context for AI agents (Claude, etc.) to efficiently continue development on this project without extensive re-reading of source files. Load this document at the start of every new AI session.

**Last Updated:** 20 August 2026

---

## Table of Contents

0. [Read This First — Five Things That Will Trip You Up](#0-read-this-first--five-things-that-will-trip-you-up)
1. [Project Overview](#1-project-overview)
2. [Complete Development History](#2-complete-development-history)
3. [Current System State](#3-current-system-state)
4. [Architecture Deep Dive](#4-architecture-deep-dive)
5. [Code Structure](#5-code-structure)
6. [Known Issues & Limitations](#6-known-issues--limitations)
7. [Future Enhancements](#7-future-enhancements)
8. [Development Guidelines](#8-development-guidelines)
9. [NetSuite-Specific Considerations](#9-netsuite-specific-considerations)
10. [How to Continue Development](#10-how-to-continue-development)

---

## 0. Read This First — Five Things That Will Trip You Up

Five failure modes account for most of the time lost on this project. Each is a pointer; the full
explanation lives in **Section 9**.

**1. There is no `src/` directory.** Every script sits at the repository root —
`nuheat_quote_suitelet.js`, not `src/nuheat_quote_suitelet.js`. Older documentation cites `src/…`
paths that have not existed for some time. Historical changelog entries still carry them and are
deliberately left alone; anything forward-looking should not.

**2. File Cabinet folder IDs are environment-specific and hardcoded in three files.**
Production `26895192`, Sandbox `21719365`. All three must change together —
`nuheat_quote_suitelet.js` (writes), `nuheat_master_proposal.js` (writes),
`nuheat_quote_viewer_sl.js` (searches). The repository holds the **production** values; Sandbox
copies are hand-edited in the File Cabinet and never committed. A mismatch surfaces as
`Invalid folder reference key <id>`. See §9, pitfall 12.

**File Cabinet script folder:** every script — all 15, shared modules included — lives in
`SuiteScripts/NuHeat/2026 Quote/`. Capitalisation is `NuHeat` (capital H), and the folder name
`2026 Quote` contains a space. Relative `define()` paths resolve against this folder.

**3. Three shared modules must be uploaded before their consumers.** `nuheat_bus_grant.js`,
`nuheat_vat_rates.js` and `nuheat_opp_update_lib.js` are `@NModuleScope Public` AMD modules with no
`@NScriptType`. They need no script record and no deployment record — File Cabinet upload to
`SuiteScripts/NuHeat/2026 Quote` only — but each must be present **before** a consumer is
redeployed (`nuheat_quote_suitelet.js`, `nuheat_send_quote_sl.js`, `nuheat_update_opp_sl.js`), or
the consumer fails at load time. See §9, pitfall 13.

**4. `custbody_quote_type` holds raw values, not display names.** It returns
`'Heat Pump (ASHP)'`, `'Multizone (DZM)'` and so on; `QUOTE_TYPE_MAPPING` translates those to four
display names. Any lookup keyed on display names must normalise first — `nuheat_vat_rates.js` does
this internally via `QUOTE_TYPE_ALIASES`. The failure is silent: plain `'Heat Pump'` matches both
maps and works, `'Heat Pump (ASHP)'` does not, and every UFH quote still looks correct because the
20% default happens to be the right answer for UFH. See §9, pitfall 14.

**5. Some custom field IDs are doubled or misspelled, and are correct as written.**
`custbody_opp_site_adress` (one `d`, and it lives on the **Opportunity**, not the Estimate),
`custitemcustitem_quote_fab_1`–`_6`, `custbodycustbody_quote_last_viewed`,
`custbodycustbody_quote_view_count`. These are the real internal IDs in NetSuite. "Correcting" the
spelling silently returns empty. See §9, pitfalls 8 and 15.

---

## 1. Project Overview

### Business Context

**Nu-Heat** is a UK underfloor heating company. They use **Oracle NetSuite** as their ERP, with Estimates (Quotes) as their primary pricing document for customers. The previous system used legacy hard-coded HTML emails to share quotes.

### Problem Being Solved

1. Customers needed a professional, online way to view their quotes without a NetSuite login
2. Quotes needed to be branded, responsive, and printable as PDF
3. When quotes were updated, previously shared URLs broke (changed file IDs)
4. Nu-Heat needed a "Master Proposal" to combine multiple quotes from a single Opportunity into one document
5. The system needed to work reliably with NetSuite's sometimes quirky SuiteScript APIs

### Solution Approach

A multi-component SuiteScript 2.1 solution:
- **Quote Suitelet** generates self-contained HTML quote pages from Estimate records
- **Quote Viewer Suitelet** acts as a proxy, serving the latest HTML via stable URLs
- **User Event Script** auto-generates quotes on every Estimate save
- **Client Script** provides a manual "Regen quote" button with fresh pricing
- **Master Proposal Module** aggregates multiple quotes into branded proposals
- **Send Quote Suitelet** provides a UI to select quotes and generate proposals

---

## 2. Complete Development History

### Phase 1: Core Quote Page (v1.0.0 → v3.6.1, Feb 2026)

**Initial build:**
- Created the Suitelet that generates branded HTML from Estimate records
- Implemented product categorisation using `custitem_prod_type` field
- Built responsive design with 768px breakpoint
- Added print-to-PDF functionality

**Key challenges solved:**
- **Product type filtering** — `custitem_prod_type` stores internal IDs, not text. Created hardcoded `PRODUCT_TYPE_ID_MAP` (52 values) for reliable categorisation
- **Item field loading** — `search.lookupFields()` doesn't work for all item fields. Used `record.load()` per-item as fallback
- **Logo rendering** — Original logo PNG had content occupying only 1.7% of canvas. Cropped and resized to 400×169px for proper display
- **Multi-system detection** — Deduplicate floor construction items to count unique systems per quote

**Versions of note:**
- v3.1.0: Fixed product type filtering (case-insensitive, partial matching)
- v3.3.0: Hardcoded product type ID mapping (most reliable approach)
- v3.4.1: Removed invalid `custitem_product_category` search column
- v3.5.0: Switched to `record.load()` for `custitem_prod_type`
- v3.6.0: Restructured products as tree (UFH with subcategories)

### Phase 2: Static HTML Generation & URLs (v4.0.0 → v4.0.9, Mar 2026)

**Key addition: Generate HTML files and store in File Cabinet**

- v4.0.0: Initial static HTML generation — save to File Cabinet, store URL on record
- v4.0.3: Added buttons (Generate, View, Copy URL)
- v4.0.4: Simplified to single "Regen quote" button
- v4.0.5: **Major fix** — UE script couldn't call Suitelet via `https.get()` (NetSuite blocks same-account HTTP calls). Solution: direct module import

**Key challenges:**
- NetSuite blocks HTTP requests from UE scripts to Suitelets in the same account
- `search.lookupFields()` doesn't support computed fields (subtotal, total, etc.)
- `record.load()` in `afterSubmit` can return stale data from pre-save state

### Phase 3: Pricing Reliability (v4.3.44 → v4.3.50, Mar 2026)

**The "stale pricing" saga — this took many iterations to solve:**

1. **v4.3.44**: Tried in-place file update (`file.load()` → set `.contents` → `.save()`). **Silent failure** — NetSuite doesn't reliably update loaded file contents.
2. **v4.3.45**: Added cache-busting `&v=timestamp` to URLs. Fixed browser caching, but root cause was stale data in the HTML itself.
3. **v4.3.46**: Used `search.lookupFields()` for fresh pricing. But `subtotal`/`total`/`discounttotal` are NOT valid search columns on Estimates → `SSS_INVALID_SRCH_COL` error.
4. **v4.3.47**: **Solution found** — pass pricing as URL parameters from Client Script. After `rec.save()`, the CS loads the record in a new context → gets fresh data → passes as `p_subtotal`, `p_taxtotal`, `p_total`, `p_discounttotal` to the Suitelet.
5. **v4.3.48**: Reverted file save to delete+create (in-place update was unreliable).
6. **v4.3.50**: Removed `search.lookupFields()` entirely. Two-tier pricing: TIER 1 = client overrides, TIER 2 = `record.load()`.

**Lesson learned:** In NetSuite, the most reliable way to get fresh pricing is to pass it from the Client Script execution context, not read it server-side in the same transaction.

### Phase 4: Stable URLs & Quote Viewer (v4.3.49 → v4.3.53, Mar 2026)

1. **v4.3.49**: Created Quote Viewer Suitelet proxy for stable URLs. Timestamped filenames + proxy URL = stable links + fresh content.
2. **v4.3.50**: Enhanced Viewer with `?diag=1` mode and better logging.
3. **v4.3.51**: Made proxy/direct URL configurable via `options.useProxyUrl`.
4. **v4.3.52**: Fixed popup URL mismatch — default was proxy but UE used direct. Aligned defaults.
5. **v4.3.53**: Proxy URLs enabled by default (Viewer permissions confirmed fixed).
6. **v4.3.54**: Added design package item detection constants and helper function. No rendering changes — data foundation only.

**Permissions saga:** The Quote Viewer Suitelet initially gave "You do not have privileges" errors even with "Available Without Login" checked. Required: setting Execute As Role = Administrator, and ensuring Audience includes All External Roles. Once configured correctly, proxy URLs work perfectly.

### Phase 5: Master Proposal (v1.0.0 → v1.6.3, Mar 2026)

- v1.0.0: Initial master proposal — basic HTML with quote cards
- v1.5.0: Complete redesign to match individual quote page styling
- v1.5.1: Logo as base64, greeting logic fix
- v1.5.2-v1.5.4: **Pricing fixes** — `totalIncVat` was double-counting VAT (NS `total` already includes VAT)
- v1.5.5-v1.5.8: Copy/text improvements, dynamic phone number
- v1.6.0: Quote card redesign — system cards with benefits row
- v1.6.2: Removed file cleanup (keep all versions for audit)
- v1.6.3: Fixed broken email proposal URL. `file.url` returns a relative path — added `getAccountHostname()` using `N/runtime.accountId` to construct absolute `https://` URL. Fixes "Redirect Notice: invalid URL" on desktop and silent button failure on mobile.

### Phase 6: UI Refinements (v4.3.35 → v4.3.56, Mar 2026)

- Design importance section, product links, section descriptions
- DRY refactoring — extracted helper functions, SVG constants
- Thermostat options conditional rendering
- Mobile CSS improvements (detailed in `nu-heat-quote-change-specification.md`)
- v4.3.54: Fixed thermostat options section. Refactored `loadThermostatOptionItems()` to two-step search+`record.load()` pattern (`custitem_*` fields invalid as search columns). Fixed double-prefixed fab field IDs (`custitemcustitem_quote_fab_1`). Added case-insensitive `RECOMMENDED_ITEM_ID` matching.
- v4.3.55: Fixed double-prefixed fab field IDs in `loadItemCustomFields()` — same root cause as v4.3.54 thermostat fix. All main product card feature bullets were silently empty across UFH, Heat Pump, Solar, and Commissioning sections.
- v4.3.56: Prefix-based exclusion on fixed thermostat card set. Added `THERMOSTAT_EXCLUSION_PREFIXES` map. Cards now suppressed when quote already contains any item from the same family. Earlier catalogue-scan approach (PR #1) caused 80+ second timeouts — this approach is O(4) record loads.

### Phase 7: Production Deployment & Post-Launch Fixes (Mar 2026)

**Production deployment completed:**
- Folder ID updated across all three scripts to production value (`26895192`)
- Quote Viewer Suitelet: Available Without Login ✅, Execute As Role = Administrator ✅, All External Roles in Audience ✅
- Quote Suitelet deployment updated to Execute As Role = Administrator — required for account manager name field to resolve correctly for non-admin users (no code change needed)

**Product image field migration (v4.3.57 → v4.3.59):**
- `custitem_quote_prod_visual_1` replaced with `custitem_test_image` across all card types
- v4.3.58: Thermostat upgrade card images were blank — `loadThermostatOptionItems()` used `getFileUrl()` alone; `custitem_test_image` stores plain URL strings not file IDs. Fixed by aligning with multi-approach resolution pattern: direct URL → `getFileUrl` → `getText` fallback
- v4.3.59: Thermostat mini card images were clipped — fixed by setting `object-fit: contain` on image element in `generateCSS()`
- v4.3.60: Hide product card image placeholder when `custitem_test_image` is empty — entire image column conditionally omitted from `renderProductCard()`; mini card placeholder else-branch removed; `min-height`/`background` removed from `.product-image` CSS

**Account manager name fix:**
- Non-admin users saw "Your Nu-Heat Team" instead of the account manager name
- Fix: Set Execute As Role = Administrator on the Quote Suitelet deployment record
- No code change required — purely a NetSuite deployment configuration fix

**Master Proposal post-launch fixes (v1.6.3):**
- `custbody_last_proposal_sent_date` not populating — root cause was the field was set to read-only in NetSuite. Fixed by updating field permissions to allow edit. No code change required.
- Note: PRs #7 and #8 (`format.parse` / `format.format` attempts) were closed without merging — the issue was field permissions, not code

**Send Quote Suitelet — Contact selector feature (v1.4.9 → v1.5.0):**
- Added contact selector dropdown to proposal email form — selecting a contact populates the To address field
- Key NetSuite pitfalls discovered during implementation (see Section 9, pitfall #11):

### Phase 8: Grant Funding Applied to Price (22 April 2026, v4.3.70 / v1.6.7)

- HP display price now shows subtotal minus £7,500 BUS grant on both the quote page and Master Proposal
- Grant banner updated from "may be eligible" to "£7,500 grant funding has been applied to this quote" with "*Subject to scheme eligibility" asterisk line
- `HP_GRANT_AMOUNT = 7500` constant in both files — blanket for now, intended to become conditional on a NetSuite field in future

### Phase 9: BUS Grant Rates & Post-Grant Balance (18 August 2026, v4.4.0 / v1.7.0 / v1.6.0 / v1.0.0)

**The bug it fixed.** v4.3.70 subtracted the grant in six places across two files. Five wrapped the
result in `Math.max(0, …)`; the heat pump price card did not. The clamps were therefore in exactly
the wrong places — a quote worth less than the grant rendered a **negative heat pump price**
(−£1,870.33) while the total clamped to **£0.00**. v4.4.0 inverts this: the component price is
clamped and can never go negative, and the **balance after BUS** carries the negative value, with a
refund line explaining what is owed back to the customer.

**The feature it added.** The blanket hard-coded £7,500 (applied to any quote containing a Heat Pump
line) became three outcomes resolved from the **Suppak line item**, which is authoritative:

| Suppak line | Rate |
|---|---|
| `Suppak N1(R)HP`, `Suppak N1(NB)HP`, `Suppak BUS` | £7,500 (standard) |
| `Suppak BUS - Uplift` | £9,000 (enhanced) |
| any other `Suppak…` line, or none | no grant |

**Key decisions:**
- **New shared module `nuheat_bus_grant.js`** so the rules cannot drift between the quote page and
  the Master Proposal. Follows the existing cross-script import precedent
  (`nuheat_send_quote_sl.js` already does `define(['./nuheat_master_proposal'])`).
- **One resolution per quote.** The Quote Suitelet resolves once in `loadQuoteData()` and stores
  every derived figure on `quoteData.bus`; all render sites read from it. Re-resolving per section
  is what produced the six-site duplication and the bug.
- **The Master Proposal has no line-item access** — it never loads an Estimate. The Send Quote SL
  does, so it resolves the grant there and passes `busAmount` / `busRate` through the
  `serverWidget` sublist as text.
- **Grant cascade** — leftover grant once the heat pump price hits £0 also reduces the displayed
  commissioning price (`CASCADE_GRANT_TO_COMMISSIONING`, default `true`) so the page reconciles.
- **Exact matching, not substring**, so a future SKU cannot silently match the wrong tier. A
  `BUS_UNMATCHED` audit entry logs the raw `itemName` of any unrecognised Suppak line.
- Removed both `HP_GRANT_AMOUNT` constants and the dead `.grant-banner` code (unreachable since
  both call sites passed `showGrantBanner = false`). `.hp-grant-banner` is the live card.

### Phase 10: VAT by Technology & Proposal Copy (18 August 2026, v4.5.0 / v1.8.0 / v1.7.0 / v1.0.0)

**The scripts had never calculated VAT.** There was no `0.2` multiplier anywhere in the codebase —
both surfaces echoed NetSuite's `taxtotal` verbatim. Heat pump quotes were displaying 20% because
**the tax codes on those Estimate lines were wrong in NetSuite at the time**. UK VAT on heat pump
installations is 0% under energy-saving materials relief; underfloor heating is standard-rated
at 20%.

At the time of the change the derived figure and NetSuite disagreed, because the source tax codes
were wrong. **The tax codes have since been corrected in Production (20 August 2026), so the two now
agree.** Every disagreement over 1p writes a `VAT_MISMATCH` audit entry naming the Estimate and both
figures — originally the work-list for correcting the source data, now an **early-warning signal**
that something has regressed at source. See §6.

**Key decisions:**
- **New shared module `nuheat_vat_rates.js`**, following the `nuheat_bus_grant.js` pattern from
  Phase 9 — File Cabinet upload only, no deployment record, imported by relative path.
- **No line-level tax capture.** Every Estimate is single-technology (the Master Proposal is what
  groups technologies), so one rate applies per quote and `extractLineItems()` was left alone.
- **VAT applies after discount** — `netAmount = subtotal - discount`, consistent with the codebase's
  documented invariant `total = subtotal - discount + tax`.
- **Total inc VAT is recomputed.** NetSuite's `total` carried the wrong VAT at the time, so
  recomputing VAT without recomputing the total would have left the two inconsistent. `balanceAfterBus` is ex-VAT
  and unchanged; the BUS grant applies to the 0%-rated heat pump, so deducting it from an inc-VAT
  total stays sound.
- **Raw list values are normalised inside the module.** `VAT_RATES` is keyed on display names but
  callers hold raw values like `'Heat Pump (ASHP)'`. Without normalisation those fall through to the
  20% default — charging a heat pump 20%, silently, because `'Heat Emitter'` defaults to 20% too and
  looks right.
- **Unknown types default to 20%**, never under-charging, and log `VAT_RATE_UNMATCHED`.
- **"plus VAT" removed from the section price cards** — VAT is referenced only in the total system
  price header.
- **Blended-VAT note** on the Master Proposal, gated on a heat pump quote **and** a 20%-rated quote,
  so it never claims a blend that isn't there.
- **⚠️ Solar assumed 0%** — only HP and UFH were specified. One-line change in `VAT_RATES` if wrong.

---

## 3. Current System State

### All Components and Versions

**All components below are live in both Production and Sandbox as of 20 August 2026.**

| Component | Version | File | Status |
|-----------|---------|------|--------|
| Quote Suitelet | v4.6.0 | `nuheat_quote_suitelet.js` | ✅ Live in Production |
| Quote UE | v4.0.9 | `nuheat_quote_ue.js` | ✅ Live in Production |
| Quote CS | v4.0.6 | `nuheat_quote_cs.js` | ✅ Live in Production |
| Quote Viewer | v1.1.0 | `nuheat_quote_viewer_sl.js` | ✅ Live in Production |
| Scheduled Script | v1.0.0 | `nuheat_quote_generator_ss.js` | ✅ Live in Production |
| Master Proposal | v1.8.3 | `nuheat_master_proposal.js` | ✅ Live in Production |
| Send Quote SL | 2.3.0 | `nuheat_send_quote_sl.js` | ✅ Live in Production (29 Sep 2026; R13–R19 passed in Sandbox) — forecast flags ⚠️ R4 open |
| Send Quote CS | v1.4.0 — detached | `nuheat_send_quote_cs.js` | Not attached (the Send Quote SL has its own inline script) — kept for reference |
| Update Opportunity SL | 1.0.0 | `nuheat_update_opp_sl.js` | ✅ Live in Production (29 Sep 2026; U1–U10 passed in Sandbox) |
| Opportunity Update Library | 1.0.0 | `nuheat_opp_update_lib.js` | ✅ Live in Production (29 Sep 2026; upload first) |
| Opportunity UE | 1.3.0 | `nuheat_opportunity_ue.js` | ✅ Live in Production (29 Sep 2026) |
| Opportunity CS | 1.2.0 | `nuheat_opportunity_cs.js` | ✅ Live in Production (29 Sep 2026) |
| Analytics Suitelet | v1.0.1 | `nuheat_analytics_sl.js` | ✅ Live in Production |
| **BUS Grant Module** | **v1.0.0** | **`nuheat_bus_grant.js`** | ✅ Live in Production |
| **VAT Rates Module** | **v1.0.0** | **`nuheat_vat_rates.js`** | ✅ Live in Production |

> **All scripts live at the repository root — there is no `src/` directory.** Older documentation
> cited `src/…` paths that have not existed for some time; those references are being corrected
> as sections are touched.

> **Versions above were read from the files, not carried over.** Every value in the table matches
> the `SCRIPT_VERSION` / `MODULE_VERSION` constant in its file as of this update. One discrepancy
> exists and is a **code** issue, not a documentation one: `nuheat_quote_ue.js` has
> `SCRIPT_VERSION = '4.0.9'` (~:106) but its header comment still reads `Version: 4.0.8` (~:13).
> The table follows `SCRIPT_VERSION`. See §6 — JSDoc `@version` drift.

> ⚠️ **`nuheat_bus_grant.js`, `nuheat_vat_rates.js` and `nuheat_opp_update_lib.js` are shared custom
> modules.** None needs a script deployment record, only a File Cabinet upload — but each must be
> uploaded to `SuiteScripts/NuHeat/2026 Quote` **before** a consumer (Quote Suitelet, Send Quote SL,
> Update Opportunity SL) is redeployed, or the consumer fails at load time.

### Current Configuration

Both environments are live. **The repository holds the Production values.**

| Setting | Production | Sandbox |
|---------|-----------|---------|
| Account ID | `472052` | `472052_SB1` |
| File Cabinet Folder | **`26895192`** — the value in this repo | `21719365` — hand-edited in the File Cabinet, never committed |
| URL Field | `custbody_test_new_quote` | `custbody_test_new_quote` |
| URL Strategy | Proxy (default) | Proxy (default) |
| `USE_PROXY_URL` | `true` | `true` |
| Max File Versions | 5 | 5 |
| Viewer Script ID | — | 3286 |
| Viewer Deploy ID | — | 1 |

> ⚠️ **The folder ID is the one line that legitimately differs between a Sandbox File Cabinet file
> and its repository counterpart.** The Sandbox value is edited directly in the File Cabinet and is
> never committed, so **the repository is always Production-ready** — upload repo versions straight
> to Production, and never upload a downloaded Sandbox copy.
>
> The constant lives in **three** files and all three must agree:
> - `QUOTE_HTML_FOLDER_ID` in `nuheat_quote_suitelet.js` (~:105) — writes
> - `FOLDER_ID` in `nuheat_master_proposal.js` (~:225) — writes
> - `QUOTE_HTML_FOLDER_ID` in `nuheat_quote_viewer_sl.js` (~:60) — searches
>
> See §9, pitfall 12.

### What Works

- ✅ Individual quote generation (auto + manual)
- ✅ Stable proxy URLs
- ✅ Public access without login
- ✅ Fresh pricing via client script URL params
- ✅ File versioning (last 5)
- ✅ Master Proposal generation
- ✅ Master Proposal preview
- ✅ Quote Viewer diagnostic mode
- ✅ Responsive design (desktop + mobile)
- ✅ Print-to-PDF
- ✅ Product categorisation by ID
- ✅ Thermostat options section
- ✅ Component Breakdown collapsible
- ✅ Room-by-room specification display
- ✅ BUS grant resolution from the Suppak line item
- ✅ VAT by technology, agreeing with the (now corrected) NetSuite tax codes
- ✅ **Deployed to Production** — all components live in both environments as of 20 August 2026

### What Needs Attention

Two open items:

- ⚠️ **Solar VAT rate is assumed 0% and remains unconfirmed.** Only Heat Pump and UFH were
  specified; Solar was set to 0% on the basis that solar thermal qualifies for the same
  energy-saving materials relief. One-line change in `VAT_RATES` (`nuheat_vat_rates.js`) if wrong.
- ⚠️ **`nuheat_quote_ue.js` JSDoc header says `Version: 4.0.8` (~:13) while
  `SCRIPT_VERSION = '4.0.9'` (~:106).** A code discrepancy, not a documentation one — bump the
  header to match on the next change to that file. See §6, JSDoc `@version` drift.

---

## 4. Architecture Deep Dive

### Why Each Component Exists

| Component | Why It Exists |
|-----------|--------------|
| **Quote Suitelet** | Core engine — only component that knows how to render a quote as HTML. Exported as a module so UE and SS scripts can call `generateAndSaveHTML()` directly. |
| **Quote UE** | Triggers auto-generation on save. Cannot use `https.get()` to call Suitelet (NetSuite blocks it), so imports the module directly. |
| **Quote CS** | Runs in browser context where `record.load()` after `rec.save()` gives fresh data. Passes pricing as URL params — solves the stale data problem. |
| **Quote Viewer** | Proxy pattern — decouples the URL from the physical file. Without this, every regeneration would produce a different URL, breaking shared links. |
| **Scheduled Script** | Fallback when UE script runs low on governance (1,000 units). The SS has 10,000 units. |
| **Master Proposal** | Business requirement to combine multiple quotes. Separated as a module (not Suitelet) so it can be called from the Send Quote SL. |
| **Send Quote SL** | UI for selecting which quotes to include in a proposal. Needed because the user must choose Main vs Alternative. From v1.8.0 also updates Opportunity fields after the email is sent (five from v2.0.2); from v2.0.0 sets the quotes' Include in Forecast and returns to the Opportunity. |
| **Opportunity UE/CS** | Entry point for Master Proposal workflow — "Send Quote" button on Opportunity form, **VIEW mode only** from UE v1.1.0, same tab from CS v1.1.0. UE v1.2.0 also shows the Send Quote result banner. |
| **Update Opportunity SL** | One place to log a call, update the opportunity and record customer objections, instead of three separate NetSuite screens. |
| **Opportunity Update Library** | The update-field rules, required gate and page building blocks shared by Send Quote and Update Opportunity, so the two pages cannot drift. |

### Design Decisions and Rationale

1. **Self-contained HTML** — No external CSS/JS dependencies. Everything is inline. This ensures quotes render correctly even offline or when printed.

2. **Base64 logo** — Logo embedded as base64 data URI. Avoids dependency on external image URLs that might change or require authentication.

3. **Proxy URL pattern** — The Quote Viewer Suitelet pattern was chosen over URL rewriting or URL shorteners because it's native NetSuite, requires no external services, and provides built-in diagnostics.

4. **Hardcoded product type IDs** — After trying text matching, case-insensitive matching, and partial matching, hardcoded ID mapping was the most reliable. NetSuite list field `getText()` is unreliable; `getValue()` returns numeric IDs consistently.

5. **Two-tier pricing** — Client overrides (TIER 1) + record.load (TIER 2). This solves the stale data problem without relying on `search.lookupFields()` which doesn't support computed fields.

6. **File versioning (keep 5)** — Balance between audit trail and File Cabinet size. The cleanup is non-critical — if it fails, it doesn't block generation.

7. **Direct module import (UE → Suitelet)** — NetSuite blocks `https.get()` from UE to Suitelet in the same account. Direct `require()` import is the supported pattern.

### Send proposal flow (SL v2.0.0) — and the Opportunity update rules (from v1.8.0)

**Page.** The Suitelet GET renders a `serverWidget` form (NetSuite's header and menu stay) carrying
**one** `INLINEHTML` field: header, "1 Choose quotes" (a Leave out / Main / Additional control per
quote — every quote starts at Leave out unless there is exactly one), "2 Send to" (To tags, contact
picker, CC/BCC), "3 Update the opportunity" (shown in this order: Status `entitystatus`, Build stage
`custbody_build_stage`, Expected close `expectedclosedate` (v2.0.2), Next contact
`custbody_next_contact`, Est. delivery date `custbody_opp_del_date`) and a sticky footer.
**Adding a field** means `OPP_UPDATE_FIELDS` and `OPP_UPDATE_DISPLAY_ORDER` in the Suitelet **and**
`BANNER_FIELDS` in `nuheat_opportunity_ue.js` — a key missing from the UE whitelist is silently
dropped from the banner. **No native buttons, no sublists and no client script** —
`nuheat_send_quote_cs.js` is **detached in 2.0.0** and kept for reference only. The page's static
inline script (`PAGE_SCRIPT`) submits NetSuite's own `main_form` (see §9 pitfall 18).

**POST order** (`handleFormSubmission()`):

1. rebuild quotes with `searchRelatedQuotes()` and validate (selection, ≥1 Main, To/CC/BCC) →
2. `generateMasterProposal()` (saves the file **and** writes `custbody_master_proposal_url` /
   `custbody_last_proposal_sent_date` — unchanged, in the Master Proposal) →
3. `sendProposalEmail()` → 4. **`updateForecastFlags()`** → 5. **`updateOpportunityFields()`** →
6. **`redirect.toRecord`** to the Opportunity in VIEW with code-only parameters; UE v1.2.0 shows the
   banner.

A failure in steps 1–3 re-renders the page with an error panel and the user's selections, addresses
and field values restored. Nothing further is written. ⚠️ If the **email** fails, step 2 has already
saved the file and written the proposal URL and sent date — the Master Proposal does that before the
email and is out of scope; the error panel says so.

Decisions — **do not reverse without asking Steve**:

- **The server rebuilds quote data; the browser sends only `{ estimateId: role }`.** Prices, VAT and
  BUS come from NetSuite, never from the page, for both send and preview. An ID that is not one of
  the Opportunity's quotes rejects the request. `toProposalQuote()` keeps the exact object shape the
  pre-2.0 hidden sublist produced — `nuheat_master_proposal.js` depends on it (the test suite
  compares against a fixture captured from 1.8.0).
- **Write after the email, never before, never blocking it.** Steps 4 and 5 run only if the email
  was sent, are independent of each other, and never throw; failures become an amber banner naming
  the fields / quotes. NetSuite's error text goes to the log, never the URL or banner.
- **Only changed, non-blank values are written**, in one `submitFields`. An untouched field is never
  re-saved (no pointless sales-order syncs), and clearing a field does nothing — the programme rule
  that an empty value never clears data. The POST knows what changed from hidden `custpage_orig_*`.
- **Estimates are written before the Opportunity** (v2.0.1): the Opportunity update is the last record
  write, because an Estimate save can re-sync its Status onto the Opportunity (§9 pitfall 20).
- **Dates use `<input type="date">`** (v2.0.1): posts `yyyy-mm-dd`, validated as a real calendar date,
  written as `new Date(y, m - 1, d)`; pre-fill built from the record Date's own parts, never
  `toISOString()`. The picker's display order follows the **browser's** UI language, not NetSuite's
  date preference.
- **`enableSourcing: true` only when Status changed** (v2.0.0), so Probability follows the new
  Status — with sourcing off it did not (1.8.0 Sandbox S5). Off otherwise.
- **Options come from the record**, not list IDs: the Opportunity is loaded `isDynamic: true` and
  `getField().getSelectOptions()` supplies both lists. All status options the record offers are
  shown, closed ones included — the deployment runs as the **current role**.
- **Forecast flags** (`includeinforecast`, ⚠️ assumed ID): true for Main, false for Additional and
  Leave out, **only on quotes the page showed**, only where the value differs, one `submitFields`
  per Estimate. The current value and the field's type are read off the Estimate record
  `searchRelatedQuotes()` already loads — **not** a search column, because one invalid column aborts
  the whole quote search. Not a checkbox / absent → no forecast writes, audit log only.
- **Leave out is the default with several quotes.** Choosing Main is deliberate — it drives the forecast.
- **Redirect parameters carry codes, never text** (`FIELD_REFERENCE.md` lists them). The banner's
  words come from the record and a fixed key → label map; it expires after **300 seconds**.
- **`custbody_opportunity_sub_status` is never written.** Some sub-status values create Design
  Instruction rows. It is permanently out of scope for this Suitelet.
- **The button is VIEW-only** (Opportunity UE v1.1.0) and opens the Suitelet **in the same tab**
  (Opportunity CS v1.1.0). In EDIT, a Suitelet write followed by the user's save either fails with
  "record has been changed" or silently overwrites the new values.
- **The page keeps the NetSuite chrome.** A chrome-less `response.write` page needs Steve's decision.
- Downstream scripts (sales-order sync, Design Instruction) see the writes as XEDIT and act only on
  changed values. A delivery-date change syncs to linked sales orders' ship dates — intended. An
  Estimate XEDIT does not regenerate the online quote (`nuheat_quote_ue.js` acts on CREATE/EDIT only).
- **Field types are partly assumed** (dates and Build stage). The GET hides a field whose reported
  type disagrees; the reported types are audit-logged as `SendQuoteSL.OppUpdate … reported field types`.

### Update Opportunity flow (Update Opportunity SL 1.0.0, library 1.0.0, UE 1.3.0)

A second VIEW-only button, **Update opportunity**, opens `nuheat_update_opp_sl.js` in the same tab: one
inline-HTML page in the Send Quote style with **1 Log the call → 2 Update the opportunity → 3 Log any
objections (optional)** and a sticky footer with Cancel and **Save**.

- **1 Log the call:** a "Standard title" select (`customlist_nh_call_title`, read at runtime) copied into
  an editable **Title** (only when Title is empty or still equals the previous standard title — typing
  is never overwritten; max `CALL_TITLE_MAX` = 99 — a deliberate cap, our choice, not a proven NetSuite limit); **Call date** (native picker, today by
  default, not in the future); optional **Contact** (the opportunity's contacts); **What was discussed**
  (required, max 3,900).
- **2 Update the opportunity:** the shared fields from `nuheat_opp_update_lib.js`, with rules
  `{ required: ['next_contact'] }`.
- **3 Log any objections:** one chip per Objection Type (`customrecord_nh_objection_type`), grouped by
  group; each ticked chip shows an optional one-line note (max 300); one optional **About quote** (every
  Estimate on the opportunity).

**Save:** validate everything → **phone call** → **one Customer Objection per tick** → **Opportunity fields
last** (`lib.updateFields`) → `redirect.toRecord` with codes `nsqs=upd, nsq, nsqt, nsqf/nsqff, nsqc, nsqo,
nsqof`. UE 1.3.0 builds the banner from the records.

Decisions — **settled, do not re-open without Steve** (brief of 29 Sep 2026):

| # | Decision |
|---|---|
| D1 | Update Opportunity does **not** touch forecast flags (R4 still open) |
| D2 | "About quote" = every Estimate on the opportunity (search columns only; no record loads) |
| D3 | **Next contact required** = the opportunity must end up with one. Blank submitted **and** the record empty → blocked, on the client and on the server **against the record** (`lib.validateRequired`, `lookupFields`) — never against posted originals. Send Quote stays optional |
| D4 | No numeric internal IDs in code; lists and records by script ID at runtime |
| D5 | Every banner word from the record or a fixed whitelist; codes only in the URL |
| D6 | The Send Quote suite changes only where agreed (library loader line; B3 retargeted; A13/B14/B17 for the second button) |
| D7 | Banner source `nsqs` = `send` \| `upd`; missing / unknown = `send`; `upd` never shows "View proposal" |
| D8 | Validate everything before any write. **Phone call fails → stop**, nothing else written, page re-rendered "Nothing was saved". Objection and field failures do not stop later steps; amber banner |
| D9 | Save order: phone call → objections → opportunity fields **last** (the 2.0.1 rule) |
| D10 | `custrecord_nhobj_raised_on` = the call date |
| D11 | Objection notes: `<per-objection note>` + blank line + `Call notes (<call date>): <call notes>`; without a note, just the call-notes line |
| D12 | Contact on the call: optional select from the opportunity's contacts |
| D13 | The call date may not be in the future — the browser's today; the server allows its own today + 1 (NetSuite's server clock runs behind the UK in the morning) |
| D14 | Call Titles and Objection Types display in internal-ID order (types grouped by group internal ID) |

Also: `custrecord_nhobj_group` and `custrecord_nhobj_customer` are sourced by NetSuite and **never set**;
the Phone Call field IDs (`title`, `message`, `startdate`, `status` = `COMPLETE`, `company`, `transaction`,
`assigned`, `contact`) are ✅ **confirmed** (Sandbox U3, Sep 2026). The UE deliberately does not import the
library — a missing library must never break the opportunity view.

### The Master Proposal never loads an Estimate

This is the single most important architectural constraint in the system, and it is not obvious
from reading `nuheat_master_proposal.js` in isolation. The module makes exactly **three**
`record.load()` calls — **Opportunity** (~:440), **Customer** (~:480) and **Employee** (~:534).
It never loads an Estimate and therefore has **no line-item access at all**.

Every pricing figure it renders arrives as a pre-formatted currency **string** on the quote objects
the Send Quote SL hands it.

**The consequence: anything the proposal needs must be resolved in the Send Quote SL and passed
through.** From SL 2.0.0 one function builds those objects for **both** send and preview —
`toProposalQuote()` in `nuheat_send_quote_sl.js`, from `searchRelatedQuotes()`. These keys carry the
values the proposal cannot resolve itself —

| Key | Carries | Added |
|---|---|---|
| `busAmount` | resolved BUS grant amount (number) | v1.6.0 |
| `busRate` | `standard` / `enhanced` / `none` | v1.6.0 |
| `vatRate` | numeric rate (`0` / `0.2`) | v1.7.0 |
| `vatPercent` | display string (`'0%'` / `'20%'`) | v1.7.0 |

**A new value is added in one place — `toProposalQuote()` — and nowhere else.** Before 2.0.0 these
round-tripped through hidden TEXT sublist columns (`custpage_bus_amount`, …) and preview was
assembled separately by `nuheat_send_quote_cs.js`; `toProposalQuote()` reproduces that round trip's
exact output (key order, `'£0.00'` / `'none'` / `'20%'` defaults, numbers parsed back).

### BUS grant derivation — one calculation block

`nuheat_quote_suitelet.js` resolves the grant **once**, in `loadQuoteData()` (~:1829), and stores
every derived figure on `quoteData.bus`. No render function re-derives anything; they all read from
that object. Re-resolving per section is what produced the pre-v4.4.0 six-site duplication and the
negative-price bug.

```
busAmount            = resolveBusGrant(lineItems).amount     // 7500 | 9000 | 0
grossSubtotal        = header.subtotal                       // gross — no grant line on the Estimate
commissioningTotal   = categoryTotals['Commissioning'].total
hpGross              = grossSubtotal - commissioningTotal

hpDisplayPrice       = Math.max(0, hpGross - busAmount)      // clamped
residualGrant        = Math.max(0, busAmount - hpGross)      // leftover grant
commissioningDisplay = CASCADE_GRANT_TO_COMMISSIONING
                         ? Math.max(0, commissioningTotal - residualGrant)
                         : commissioningTotal
balanceAfterBus      = grossSubtotal - busAmount             // MAY BE NEGATIVE (ex-VAT)
totalIncVatAfterBus  = correctedTotalIncVat - busAmount      // MAY BE NEGATIVE
creditDue            = Math.max(0, -balanceAfterBus)         // refundable amount
```

The whole block is logged as `BUS_FIGURES` (JSON) on every generation — that log is the fastest way
to diagnose a wrong figure on a rendered page.

> ### ⚠️ Clamp placement is deliberate, and was previously inverted
>
> The **heat pump price card is clamped** at £0.00 and can never show a negative price.
> The **total sections are not clamped**, so a negative balance shows its true value and a refund
> line explains what is owed back to the customer.
>
> Before v4.4.0 this was exactly the wrong way round: the totals clamped to £0.00 while the heat
> pump card rendered −£1,870.33. **Do not reintroduce a clamp on the totals** — it looks like a
> tidy-up and it re-creates the original bug in a form that hides the refund entirely.

### VAT is derived, not read from NetSuite

`VAT = rate × (subtotal − discount)`, with the rate keyed off `custbody_quote_type` via
`nuheat_vat_rates.js`. VAT applies **after** discount, consistent with the codebase invariant
`total = subtotal − discount + tax`.

The `taxTotal` and `amount` figures passed to the Master Proposal are therefore **derived values**,
not NetSuite's. This **deliberately reverses a v1.4.9 change** that made the Send Quote SL echo
NetSuite's own `taxtotal` — do not "restore" it.

At the time of v4.5.0 NetSuite's `total` carried the wrong VAT on heat pump quotes, so recomputing
VAT without also recomputing the total would have left the two figures inconsistent on the same
page. **The source tax codes were corrected in Production on 20 August 2026 and the two now agree** —
but deriving both remains the right design, because it is what makes a future regression at source
detectable. NetSuite's original `taxtotal` is retained alongside for comparison, logged in
`VAT_FIGURES`, and any disagreement over 1p raises `VAT_MISMATCH`. See §6.


---

## 5. Code Structure

### File Organisation

```
(repository root — there is no src/ directory)

├── nuheat_bus_grant.js         # Shared BUS grant resolution (v1.0.0)
│   ├── BUS_RATES                # STANDARD 7500 / ENHANCED 9000 / NONE 0
│   ├── BUS_STANDARD_ITEMS       # Suppak N1(R)HP, N1(NB)HP, BUS
│   ├── BUS_ENHANCED_ITEMS       # Suppak BUS - Uplift
│   ├── normaliseItemName()      # Strips "Parent : Child", collapses ws, lowercases
│   └── resolveBusGrant()        # -> {amount, rate, matchedItem, suppressedBy}
│
├── nuheat_vat_rates.js         # Shared VAT rate resolution (v1.0.0)
│   ├── VAT_RATES                # HP 0% / Solar 0% / UFH 20% / Other 20%
│   ├── QUOTE_TYPE_ALIASES       # Raw custbody_quote_type values -> display names
│   ├── resolveVatRate()         # -> {rate, percent, matched, quoteType}
│   ├── calculateVat()           # VAT on (subtotal - discount), 2dp
│   └── logVatMismatch()         # VAT_MISMATCH when derived != NetSuite taxtotal
│
├── nuheat_quote_suitelet.js    # ~4,500 lines — the big one
│   ├── Constants & Config       # BRAND, PRODUCT_TYPE_ID_MAP, etc.
│   ├── onRequest()              # Entry point — routes generate vs view
│   ├── generateAndSaveHTML()    # Core: load → render → save → URL
│   ├── loadQuoteData()          # Data loading from Estimate
│   ├── loadItemCustomFields()   # Per-item prod type loading
│   ├── renderQuotePage()        # Main HTML assembly
│   ├── renderHeader()           # Header with logo, contact
│   ├── renderUFHTreeSection()   # UFH products tree
│   ├── renderHeatPumpSection()  # Heat Pump products
│   ├── renderSolarSection()     # Solar Thermal products
│   ├── renderCommissioningSection() # Commissioning
│   ├── renderComponentBreakdown()   # Collapsible table
│   ├── renderProjectSpec()      # Room-by-room spec
│   ├── renderUpgradesSection()  # Thermostat options, upgrades
│   ├── renderProductCard()      # Individual product card
│   ├── generateCSS()            # All CSS styles
│   └── Helper functions         # escapeHtml, formatCurrency, etc.
│
├── nuheat_quote_ue.js          # ~200 lines
│   ├── beforeLoad()             # Add "Regen quote" button
│   └── afterSubmit()            # Auto-generate HTML
│
├── nuheat_quote_cs.js          # ~150 lines
│   └── generateOnlineQuote()    # Save → Load → Pass pricing → Call Suitelet
│
├── nuheat_quote_viewer_sl.js   # ~250 lines
│   └── onRequest()              # Search latest file → Serve with no-cache
│
├── nuheat_master_proposal.js   # ~2,000 lines
│   ├── generateMasterProposal() # Full generation
│   ├── generatePreviewHTML()    # Preview without saving
│   ├── loadOpportunityData()    # Opportunity + customer data
│   ├── generateQuoteCards()     # System cards with benefits
│   └── calculateTotals()        # Aggregate pricing
│
├── nuheat_opp_update_lib.js    # Shared by both opportunity pages (1.0.0): fields, required gate, redirect codes, page CSS/header/sections, PAGE_SCRIPT_CORE
├── nuheat_update_opp_sl.js     # Update Opportunity page (1.0.0): phone call, fields, objections
├── nuheat_send_quote_sl.js     # ~2,500 lines (2.1.0: update-field code moved to the library)
│   ├── onRequest()              # GET = form, POST = generate/preview/email
│   ├── buildForm()              # NetSuite form with sublists
│   └── searchRelatedQuotes()    # Find all Estimates for Opportunity
│
└── nuheat_analytics_sl.js      # ~120 lines
    └── onRequest()              # Receives POST view events from GTM; writes to Estimate or Opportunity
```

### Key Constants in `nuheat_quote_suitelet.js`

```javascript
var SCRIPT_VERSION = '4.6.0';
var QUOTE_HTML_FOLDER_ID = 26895192;
var MAX_FILE_VERSIONS = 5;
// v4.3.56: fixed card set + prefix-based exclusion map; v4.3.58: corrected item ID casing
var THERMOSTAT_OPTION_ITEM_IDS = ['DSSB5-C', 'neoHub+-C', 'neoStatWv3-C', 'neoAirWv3-C'];
var THERMOSTAT_EXCLUSION_PREFIXES = { 'DSSB5-C': 'DSSB', 'neoHub+-C': 'NeoHub', 'neoStatWv3-C': 'Neostat', 'neoAirWv3-C': 'NeoAir' };
var RECOMMENDED_ITEM_ID = 'neoHub+-C';

// Product Type ID Map — 52 entries mapping names to internal IDs
var PRODUCT_TYPE_ID_MAP = { ... };

// Product Category Map — maps IDs to categories (UFH, HP, SOLAR, COMMISSIONING)
var PRODUCT_CATEGORY_MAP = { ... };

// UFH Subcategory Map — Floor Construction IDs, Electrical/Thermostat IDs
var UFH_SUBCATEGORY_MAP = { FLOOR_CONSTRUCTION: [...], ELECTRICAL: [47, 48, 23, 24, 22] };

// Brand Configuration
var BRAND = {
    colors: { primary: '#00857D', ... },
    logo: { base64: '...' },
    ...
};
```

### ⚠️ Two total sections render the same figures

`renderTopTotalSection()` (~:4093) and `renderTotalSection()` (~:4799) render **the same figures**
in two places on the quote page. They differ only in their CSS class prefix:

| | Top section | Bottom section |
|---|---|---|
| Function | `renderTopTotalSection()` | `renderTotalSection()` |
| Breakdown rows | `.top-total-breakdown-item` | `.total-breakdown-item` |
| Amount | `.top-total-amount` | `.total-amount` |
| Inc-VAT row | `.top-total-inc-vat` | `.total-inc-vat` |

**Any change to one must be made to the other.** Changing only one produces a page whose two totals
disagree — and because they are ~700 lines apart, that is easy to ship. The same applies to the CSS
in `generateCSS()` (~:3141 and ~:3401).

### Grant banner CSS

`.hp-grant-banner` (and its `-icon` / `-text` children) is the **live** grant card, defined in
`generateCSS()` ~:3219. The older `.grant-banner` was **removed in v4.4.0** as dead code — both of
its call sites passed `showGrantBanner = false`, so it had been unreachable. If you find
`.grant-banner` referenced anywhere, it is a stale reference, not a second banner.


---

## 6. Known Issues & Limitations

### Active Issues

1. **Master Proposal doesn't auto-update** — If individual quotes are regenerated after a Master Proposal is created, the proposal's pricing summary is NOT automatically updated. A new proposal must be generated manually.

2. **Almost no automated tests** — Testing is manual via the NetSuite UI, with two exceptions:
   `test/send-quote-opp-update.js` (Send Quote SL, run with `node test/send-quote-opp-update.js`) and
   `test/update-opp.js` (Update Opportunity SL, the library and the UE banner, `node test/update-opp.js`).
   It stubs `define` and the `N/*` modules and loads the real Suitelet — the pattern to copy for any
   new test. There is no `package.json` and no test runner.

3. **Large script file** — `nuheat_quote_suitelet.js` is ~4,500 lines. Consider splitting into modules if it grows further.

4. **No email sending from Master Proposal** — The "email" functionality is stubbed but not fully implemented (depends on email templates).

### ✅ VAT tax codes — resolved, now a standing consistency check

**Background.** UK VAT on heat pump installations is 0% under energy-saving materials relief;
underfloor heating is standard-rated at 20%. The tax codes on heat pump Estimate lines in NetSuite
said 20%, so heat pump quotes displayed 20%. v4.5.0 began deriving the rate that *should* apply
rather than echoing NetSuite's `taxtotal`.

**The tax codes were corrected in Production on 20 August 2026.** The source data is now right, so
script-derived VAT and NetSuite's `taxtotal` should agree. There is no outstanding remediation
task here.

> ⚠️ **`VAT_MISMATCH` is now an early-warning signal, not a work-list.** It fires when derived VAT
> and NetSuite's `taxtotal` differ by more than 1p. With the source data correct, **a new entry
> means something has regressed at source** — a new Estimate created with the wrong tax code, a
> changed tax schedule, or a quote type whose rate is not what the module assumes. Keep watching it;
> treat any entry as a live defect to investigate rather than a backlog item to work through.

**Why the derivation stays.** Now that both agree, the derived figure is a genuine cross-check on
the source data — the reason a regression is detectable at all. It is not redundant, and reverting
to echoing `taxtotal` would remove the only signal that the tax codes have drifted again.

### Unconfirmed assumptions

- **Solar VAT rate is assumed 0%** — only Heat Pump and UFH were specified. It is set on the basis
  that solar thermal qualifies for the same relief. One-line change in `VAT_RATES`
  (`nuheat_vat_rates.js`) if wrong.
- **Suppak item strings are unconfirmed** — there were zero occurrences of "Suppak" anywhere in the
  repository when `nuheat_bus_grant.js` was written, so `BUS_STANDARD_ITEMS` / `BUS_ENHANCED_ITEMS`
  are best-guess strings. `BUS_UNMATCHED` in the Execution Log is the detector: it logs the raw and
  normalised `itemName` of any Suppak line that matched no tier. Grep for it during Sandbox testing
  and correct the arrays to whatever it reports.

### ⚠️ The `plus VAT` arithmetic trap

`plus VAT` equals `Total inc. VAT − subtotal` **only when there is no discount.** The headline
subtotal is **gross of discount**, so the real identity is:

```
subtotal − discount + VAT = Total inc. VAT
```

Check that identity when verifying a page, not the subtraction. On a discounted quote the naive
subtraction disagrees with the displayed VAT by exactly the discount, and reads as a VAT bug that
is not there.

### Further active issues

5. **The Master Proposal deducts the grant from a VAT-inclusive figure.** Currently sound, because
   the BUS grant applies to the heat pump and heat pumps are 0%-rated, so there is no VAT in the
   deducted amount. It is correct by coincidence of the rates, not by construction — revisit it if
   heat pump VAT ever stops being 0%.

6. **Solar and Heat Pump sections both compute `subtotal − commissioning`.** Two sections deriving
   their headline price the same way means a quote containing both technologies would show the same
   figure twice. Estimates are single-technology in practice (the Master Proposal is what groups
   technologies), so this has not bitten — but it is not defended against.

7. **`custbody_quote_hp_price` can disagree with the displayed heat pump price.** The field is read
   at `nuheat_quote_suitelet.js` ~:2774, while the displayed price comes from
   `quoteData.bus.hpDisplayPrice`. The two are derived independently and nothing reconciles them.

8. **Duplicate `hasDesignPackageItem()`** — defined twice in `nuheat_quote_suitelet.js`, at ~:420
   and again at ~:527. The second definition silently wins. Editing the first has no effect, which
   is a genuinely confusing debugging experience.

9. **Analytics Suitelet caveats** (`nuheat_analytics_sl.js`):
   - Requires **four custom fields created manually in NetSuite** before it will work —
     `custbodycustbody_quote_last_viewed`, `custbodycustbody_quote_view_count` on the Estimate, and
     `custbody_opp_quote_last_viewed`, `custbody_opp_view_count` on the Opportunity.
   - It is an **open CORS endpoint with no authentication** (`Access-Control-Allow-Origin: *`).
     This is necessary — it is called from public, unauthenticated quote pages — but it means
     **anyone with the URL can inflate the view counters**. Treat the numbers as indicative, not
     as an audit trail.

10. **JSDoc `@version` drifts from `SCRIPT_VERSION`.** These are two independent strings in the
    same file and they have been out of step by up to three patch versions. `nuheat_send_quote_sl.js`
    carries a note recording one such drift. **Always bump both** when releasing, and when reading a
    version off a file, trust `SCRIPT_VERSION` / `MODULE_VERSION` over the header comment.


### NetSuite Platform Limitations

1. **`search.lookupFields()` doesn't support computed fields** — `subtotal`, `total`, `taxtotal`, `discounttotal` are NOT valid search columns on Estimates. Must use `record.load()` instead.

2. **`file.load().save()` may not persist content changes** — Setting `.contents` on a loaded file and calling `.save()` silently fails to update. Use delete+create instead.

3. **`https.get()` from UE to Suitelet blocked** — NetSuite blocks same-account HTTP calls from User Event context. Use direct module imports.

4. **Governance limits** — UE scripts have 1,000 units; Suitelets have 10,000. The fallback Scheduled Script (10,000 units) handles edge cases.

5. **`getText()` on list fields unreliable** — Sometimes returns empty string. Always use `getValue()` (returns numeric ID) and map with hardcoded constants.

---

## 7. Future Enhancements

### Highest value

**1. Move environment and business values out of code.** Three classes of hardcoded value are
currently edited, tested and redeployed as if they were logic, when none of them is:

| Value | Where | Why it should not be in code |
|---|---|---|
| File Cabinet folder ID | 3 files (§9, pitfall 12) | environment-specific, not behaviour |
| VAT rates | `VAT_RATES` in `nuheat_vat_rates.js` | set by HMRC, changes on a known date |
| BUS grant amounts | `BUS_RATES` in `nuheat_bus_grant.js` | set by scheme policy |

**Script parameters** (which are per-deployment, so Sandbox and Production hold different values
for the same uploaded file) or a **custom record** would mean the March 2027 VAT change is a field
edit rather than a code change, a test cycle and a redeploy. It would also **retire the folder-ID
problem permanently** — the recurring "which environment is this file from" question disappears
when the value is not in the file.

**2. Sync `QUOTE_TYPE_ALIASES` with the NetSuite list.** A new heat pump sub-type added to the
`custbody_quote_type` list in NetSuite is unknown to `QUOTE_TYPE_ALIASES` and therefore defaults to
20% VAT — under a technology that should be 0%. `VAT_RATE_UNMATCHED` in the Execution Log detects
it after the fact, but the real fix is a step in the **NetSuite change process**: adding a quote
type means updating `QUOTE_TYPE_ALIASES` in `nuheat_vat_rates.js` **and** `QUOTE_TYPE_MAPPING` in
`nuheat_send_quote_sl.js`. A log entry nobody reads is not a control.

### Planned

- **Production deployment** — Deploy from Sandbox to Production environment
- **Design packages comparison** — Interactive comparison page (`design-packages-comparison.html`)
- **Landing page integration** — Landing page for new customers (`landing-page-redesign-v5.html`)

> Both mockups live outside this repository — there is no `mockups/` directory here and neither
> file has ever been committed. Ask Steve for them rather than searching the repo.

### Ideas for Improvement

- **Automated email sending** — Auto-send quote email when generated
- **Quote analytics** — Track when customers view their quotes
- **A/B testing** — Test different quote page designs
- **PDF generation** — Server-side PDF generation (currently browser-based print)
- **Multi-language support** — Quotes in different languages
- **Template system** — Configurable quote templates for different product types
- **Unit tests** — SuiteScript unit testing framework

---

## 8. Development Guidelines

### Split reconnaissance from implementation

For anything non-trivial, run a **read-only reconnaissance phase first** — no branch, no edits, no
PR, just a written report answering specific questions. Then write the implementation brief from
the confirmed findings.

This is not process for its own sake. During the PR #26 work it established, **before any code was
written**, that the code actually deployed in Sandbox was sitting on an unmerged branch and that
`main` contained no grant logic at all. Implementing against the assumed state would have produced
a diff against the wrong baseline.

**The safeguard that makes it work is keeping the implementation spec *out of* the recon document.**
A "report before proceeding" instruction sitting above a full specification will be read straight
through — the spec is the more actionable content and it wins. If the recon phase is to stay
read-only, the recon document must contain nothing to implement.

**Expect briefs to contain defects, and report contradictions rather than implementing around
them.** Two defects shipped in PR #26 briefs and both were caught this way. An agent that quietly
reconciles a contradiction has made a decision the author did not know was being made.

### How to Add New Product Categories

1. Add the new product type to `PRODUCT_TYPE_ID_MAP` in `nuheat_quote_suitelet.js`
2. Add it to the appropriate category in `PRODUCT_CATEGORY_MAP`
3. Create a render function (or add to existing section)
4. Update `renderQuotePage()` to include the new section
5. Add CSS styles to `generateCSS()`
6. Update this document and `CHANGELOG.md`

### How to Modify Product Cards

Product cards are rendered by `renderProductCard(item, quoteData)`. The function generates HTML with:
- Product image (from `custitem_test_image` or placeholder SVG)
- Product name
- Description
- Features grid (parsed from item fields)
- "View more details" link (from `custitem_prod_info_link`)

To modify, edit `renderProductCard()` and update CSS in `generateCSS()`.

### How to Add New Custom Fields

1. Create the field in NetSuite (Customization > Lists, Records & Fields)
2. Add it to `loadQuoteData()` — use `record.getValue()` or `record.getText()`
3. Pass it through to `renderQuotePage()` via the `quoteData` object
4. Use it in the appropriate render function
5. Update `FIELD_REFERENCE.md`

### Testing Approach

1. **Make changes** in the script file locally
2. **Upload** to NetSuite Sandbox via File Cabinet
3. **Test manually** — open Estimates, click "Regen quote", verify output
4. **Test public access** — open generated URL in incognito/private window
5. **Test mobile** — use browser DevTools responsive mode
6. **Check logs** — Customization > Scripting > Script Execution Log
7. **Verify File Cabinet** — Documents > Files > SuiteScripts > NuHeat > Quote HTML Files
8. **Run the committed tests** — `node test/send-quote-opp-update.js` (Send Quote SL); `node --check` every changed script

### Deployment Process

1. Update version number in script header
2. Upload script to Sandbox File Cabinet
3. Test thoroughly in Sandbox
4. Upload script to Production File Cabinet
5. Verify deployment settings match Sandbox
6. Test in Production

### Version Numbering

- Quote Suitelet: `4.x.y` — Major.Minor.Patch
- Quote UE: `4.0.x`
- Quote CS: `4.0.x`
- Other scripts: `1.x.y`

---

## 9. NetSuite-Specific Considerations

### SuiteScript 2.1 Best Practices Used

- `define([], function() {})` module pattern
- `'use strict'` in all functions
- `log.audit()` for operational logging, `log.error()` for errors
- Try-catch around all critical operations
- Governance-aware code (check remaining usage)

### Common Pitfalls to Avoid

1. **Don't use `search.lookupFields()` for computed fields** — Use `record.load().getValue()` instead
2. **Don't use `https.get()` from UE to Suitelet** — Use direct module import
3. **Don't trust `file.load().save()` to update contents** — Use delete+create
4. **Don't assume `getText()` returns meaningful values** — Use `getValue()` and map IDs
5. **Don't build URLs manually** — Use `url.resolveScript()` for Suitelet URLs
6. **Don't forget "Available Without Login"** — Required for all customer-facing scripts/files
7. **Don't use `log.warn()`** — It doesn't exist in NetSuite! Use `log.debug()` instead
8. **Custom item field double-prefix** — When a custom item field is created with a
   name already beginning with `custitem_`, NetSuite stores the internal ID with the
   prefix applied twice (e.g. field name `custitem_quote_fab_1` → internal ID
   `custitemcustitem_quote_fab_1`). Always verify internal IDs via
   Customization → Lists, Records & Fields → Item Fields. Use the internal ID
   (not the field name) in `record.load().getValue({ fieldId: '...' })`.
9. **Custom item fields not valid as search columns** — Fields like `custitem_quote_fab_1`
   cannot be used as columns in `search.create({ type: search.Type.ITEM })`. They throw
   `SSS_INVALID_SRCH_COL` and abort the entire search. Always use a two-step pattern:
   search with standard columns to get internal IDs, then `record.load()` per item to
   read custom fields.
10. **`custitem_test_image` stores plain URL strings, not file IDs** — Always check
    whether the value starts with `http` or `/` and use it directly as an image URL.
    Do not pass it to `getFileUrl()` first — that function expects a NetSuite file ID
    integer and will fail on a URL string. Pattern: direct URL check → `getFileUrl()`
    fallback → `getText()` fallback.
11. **Reading Opportunity contacts requires a search — sublist API does not work** —
    Despite multiple sublist IDs tried (`'contact'`, `'contactroles'`, `'contacts'`),
    `getLineCount()` returns `-1` or `0` on Opportunity records for contacts in all cases.
    The correct approach is a search on `search.Type.OPPORTUNITY` with `join: 'contact'` columns.
    Do **NOT** use `search.Type.CONTACT` with an `opportunity` filter — that join does not exist
    and throws `invalid search criteria: opportunity`. Correct pattern:
    ```javascript
    search.create({
        type: search.Type.OPPORTUNITY,
        filters: [['internalid', 'anyof', opportunityId]],
        columns: [
            search.createColumn({ name: 'internalid', join: 'contact' }),
            search.createColumn({ name: 'firstname',  join: 'contact' }),
            search.createColumn({ name: 'lastname',   join: 'contact' }),
            search.createColumn({ name: 'email',      join: 'contact' })
        ]
    });
    ```

12. **File Cabinet folder IDs are environment-specific and hardcoded in three files** —
    Production `26895192`, Sandbox `21719365`. They live at:

    | File | Constant | Line | Role |
    |---|---|---|---|
    | `nuheat_quote_suitelet.js` | `QUOTE_HTML_FOLDER_ID` | ~:105 | writes quote HTML |
    | `nuheat_master_proposal.js` | `FOLDER_ID` | ~:225 | writes proposal HTML |
    | `nuheat_quote_viewer_sl.js` | `QUOTE_HTML_FOLDER_ID` | ~:60 | searches for the latest file |

    **All three must change together.** The Suitelet writes, the Proposal writes, and the Viewer
    searches — leave one behind and quotes generate into one folder while the proxy looks in
    another, so the URL 404s or serves a stale file. The symptom of a bad ID is
    `Invalid folder reference key <id>`.

    **The repository holds the production values.** Sandbox copies are hand-edited directly in the
    File Cabinet and never committed, so a Sandbox File Cabinet file and its repository counterpart
    legitimately differ on this one line. When deploying to Production, upload the **repository**
    version — never a downloaded Sandbox copy.

13. **Custom module load order** — `nuheat_bus_grant.js`, `nuheat_vat_rates.js` and (from Send Quote
    2.1.0) `nuheat_opp_update_lib.js` follow the same rule: the library is imported by
    `nuheat_send_quote_sl.js` and `nuheat_update_opp_sl.js` as `'./nuheat_opp_update_lib'` and must be
    uploaded first. `nuheat_bus_grant.js` and `nuheat_vat_rates.js` are
    `@NModuleScope Public` AMD modules with **no `@NScriptType`**. They therefore need no script
    record and no deployment record; a File Cabinet upload to `SuiteScripts/NuHeat/2026 Quote` is the entire
    deployment. But `nuheat_quote_suitelet.js` and `nuheat_send_quote_sl.js` both `define()` them
    by relative path (`'./nuheat_bus_grant'`, `'./nuheat_vat_rates'`), so **both modules must be
    uploaded before either consumer is redeployed** or the consumers fail at load time. The
    relative path resolves against the calling script's own folder, so all of them must sit in the
    same folder. If a consumer is already erroring on load, uploading the missing module clears it
    — no redeploy of the consumer is required.

14. **`custbody_quote_type` returns raw list values, not display names** — `'Heat Pump (ASHP)'`,
    `'Multizone (DZM)'`, `'Full System (DFD/DFP)'` and so on. `QUOTE_TYPE_MAPPING` in
    `nuheat_send_quote_sl.js` (~:200) translates these to the four display names
    (`Heat Pump`, `Underfloor Heating`, `Solar`, `Other`). **Any lookup keyed on display names must
    normalise the raw value first.** `nuheat_vat_rates.js` does this internally via
    `QUOTE_TYPE_ALIASES`, so either form resolves correctly through that module.

    ⚠️ **The failure signature is why this is worth stating.** Plain `'Heat Pump'` is present in
    both maps and works. `'Heat Pump (ASHP)'` is not present in a display-name map, falls through to
    the 20% default, and charges a 0%-rated heat pump 20% VAT. Meanwhile every UFH quote looks
    perfectly correct, because the 20% default happens to be the right answer for UFH. A partially
    working feature reads as a working one.

15. **Doubled and misspelled field IDs are real and must not be "corrected"** — beyond the
    `custitem_` double-prefix rule in pitfall 8, these specific IDs are correct as written:

    | Internal ID | Record | Note |
    |---|---|---|
    | `custbody_opp_site_adress` | **Opportunity** | one `d` in "adress"; the `opp_` prefix is the clue it is not an Estimate field |
    | `custitemcustitem_quote_fab_1` … `_6` | Item | double-prefixed |
    | `custbodycustbody_quote_last_viewed` | Estimate | double-prefixed |
    | `custbodycustbody_quote_view_count` | Estimate | double-prefixed |

    Fixing the spelling or dropping a prefix does not throw — `getValue()` simply returns empty and
    the dependent row renders blank. See `FIELD_REFERENCE.md` for the full list.

16. **Negative currency formatting** — `formatNumber()` handles negatives correctly on its own; the
    `£-1,870.33` ordering seen before v4.4.0 was a caller problem, not a formatter bug.
    `formatSignedCurrency(value, symbol)` exists for figures that can legitimately go negative and
    emits `-£1,870.33`.

    ⚠️ **Two discount call sites deliberately hand-roll their own sign** — in
    `renderTopTotalSection()` (~:4108) and `renderTotalSection()` — and rely on
    `header.discountTotal` already being `Math.abs()`'d. Swapping either to `formatSignedCurrency`
    yields `-£-500.00`. **Leave them as they are**; both carry an inline comment saying so.

17. **`opportunityId` falls back to `createdfrom`, which is not necessarily an Opportunity** —
    `loadQuoteData()` reads `estimate.getValue({fieldId: 'opportunity'})` and falls back to
    `createdfrom` (~:1644). `createdfrom` can point at a different transaction type entirely, so a
    `record.load({type: record.Type.OPPORTUNITY, id: opportunityId})` on it can throw. The
    site-address path wraps that load in a try/catch precisely for this reason — a missing or
    unloadable Opportunity leaves `siteAddress` empty and the row hidden, and must never break the
    page. Any new code that loads an Opportunity from this ID needs the same guard.


18. **Hand-written HTML inside a Suitelet (SL 2.0.0) — the inline-script rules** —
    - Put record and user data **only** in element text and `data-` / `value` attributes, always
      through `escapeHtml()` (`& < > " '`). Tag-strip titles and descriptions first — quote titles
      can contain `<b>…</b>`.
    - **Never interpolate anything into a `<script>` block.** A `</script>` sequence ends the block
      whatever the HTML escaping, so the script must be a static string (`PAGE_SCRIPT`) that reads
      its data from `data-` attributes. The test suite asserts no record data appears in it.
    - Plain `<input>` / `<select>` elements inside an `INLINEHTML` field post with NetSuite's own
      `main_form`, under their `name`. The page submits with
      `HTMLFormElement.prototype.submit.call(form)` — immune to an input named `submit` shadowing the
      method, and it bypasses NetSuite's own onsubmit (there is no client script to run).
    - Prevent Enter in text inputs, or the browser submits `main_form` without the page's validation.

19. **Redirect-driven banners must not trust the URL** — `redirect.toRecord` parameters are visible
    and editable. Send only codes (whitelisted keys, counts, record IDs, a timestamp); build every
    word of the message from the record in `beforeLoad`; verify IDs belong to the record; expire the
    message (`nsqt`, 300 s); wrap the whole thing in try/catch so `beforeLoad` fails closed.

20. ✅ **CONFIRMED — saving an Estimate re-syncs its Status onto the Opportunity. Write Estimates
    before the Opportunity; the Opportunity is written last.** Inferred from Sandbox (28 Sep 2026): with Send Quote SL 2.0.0 a Status
    change did not stick (Quoted → "In Negotiation – Warm" stayed Quoted; Def Order → Quoted stayed Def
    Order), where 1.8.0 had worked. 2.0.0 added `submitFields` on Estimates (`includeinforecast`)
    *after* the Opportunity write, each Estimate still carrying the old Status. SL 2.0.1 reorders the
    writes. **Not yet observed directly** — to be confirmed or corrected from the Opportunity's system
    notes after Sandbox R13. The other change since 1.8.0, `enableSourcing: true` on a Status change,
    is the second suspect and is deliberately unchanged until that evidence is in.
    **Sandbox, 28 Sep 2026:** the 2.0.1 reorder fixed the reported revert. **Confirmed, Sep 2026:** R13
    passed (both variants) — Send Quote writes the forecast flags first and the Opportunity last.

21. **`<input type="date">` and NetSuite dates** — the value is always `yyyy-mm-dd` whatever the
    display. Build it from `getFullYear()` / `getMonth() + 1` / `getDate()`, never `toISOString()`
    (the UTC conversion moves a midnight date back a day in zones east of UTC); parse it back with
    `new Date(y, m - 1, d)` after checking the parts round-trip (rejects `2026-02-30`).

22. **Quote titles and descriptions can arrive entity-encoded; decode, then strip, then escape
    once.** A title can hold literal `<b>Ground Floor</b>` **or** the already-encoded
    `&lt;b&gt;Ground Floor&lt;/b&gt;`. `stripTags()` finds no tags in the second, and `escapeHtml()`
    then encodes it again, so the user sees `&lt;b&gt;`. SL 2.0.3's `cleanCardText()` runs
    `decodeEntities()` → `stripTags()` → whitespace collapse, and the caller escapes once. **Decode
    before stripping, never after** — decoding after would turn `&lt;script&gt;` into a live tag.
    The Master Proposal still receives the raw `title` / `description`; this is display only.

23. **The page-script core and its one known duplication.** New inline-HTML pages build their script
    with `lib.pageScript(PAGE_PART)` = `'(function(){' + PAGE_SCRIPT_CORE + PAGE_PART + <DOM-ready init> '})();'`,
    all constants. The page part implements the hook contract in the library header: `pageInit()`,
    `problem()`, `summary()`, `beforeSubmit()`, and calls `submitForm()`. Shared IDs: `#nsq-root`,
    `#nsq-send`, `#nsq-reason`, `#nsq-sum-line`, `#nsq-sum-changes`; update fields carry `.nsq-upd` and
    `data-orig` / `data-orig-text` / `data-label` / `data-required`.
    ⚠️ **Send Quote's inline script still carries its own copy of the update-field/changed-marker logic;
    PAGE_SCRIPT_CORE is the canonical version. Migrating Send Quote to CORE is a separate change with its
    own browser test — do not fold it into another PR.** (Kept so the 2.1.0 extraction could be proven
    byte-identical, script included.)

24. **A "required" gate must read the record, not the page.** Hidden `custpage_orig_*` values are posted
    by the browser and can be forged. They are fine for change detection (writing an unchanged value is
    harmless) but not for a gate: `lib.validateRequired()` reads the current value with
    `search.lookupFields`. Validation runs before the phone call, so a failed gate writes nothing.

25. **HTML email: Outlook fallbacks use `[if mso]`, never `display:none`; containers need an attribute
    width, not only `max-width`.** Some viewers strip inline styles (NetSuite's own message view, some
    webmail), and some strip `<style>` blocks too. Two consequences, both fixed in Send Quote SL 2.1.1's
    `buildEmailBody()`:
    - An Outlook-only copy wrapped in `<div style="display:none; mso-hide: none;">` becomes **visible**
      once the style is stripped, so the button appears twice. Wrap Outlook-only markup in
      `<!--[if mso]> … <![endif]-->`, which every non-Outlook client treats as a comment. (The
      `<!--[if !mso]><!-- --> … <!--<![endif]-->` copy is the non-Outlook half.) The hidden preheader
      `<span style="display:none…">` is a different thing and stays.
    - A container that is `width="100%"` with only `max-width:600px` in its style stretches to the full
      window when styles are gone, and the fixed-width content drifts left. Give it `width="600"` as
      the attribute and `width:100%;max-width:600px` as the style: styled clients behave as before,
      unstyled ones fall back to 600 px, centred by the parent `align="center"`. Mobile rules with
      `width: 100% !important` still win over the attribute.
    `test/send-quote-opp-update.js` M1–M4 check both, in a stripped and an Outlook view.

    **From Send Quote SL 2.2.0 (redesign) the email must look centred and single-column with every
    `style` attribute and every `<style>` block removed.** The rules `buildEmailBody()` follows, and
    N1–N9 enforce:
    1. Layout with tables and HTML attributes only: every structural `table` / `td` carries `align`,
       `width`, `bgcolor`, `valign` attributes. CSS may add polish, never be the only thing holding
       layout, width, alignment or background.
    2. No floats and no percentage-width side-by-side "col" tables. Two-up content (the 2 × 2 grid, the
       contact buttons) is one row of two `td width="50%"`; a media query stacks them on phones
       (`display:block; width:100% !important`).
    3. `align="center"` on every `td`; inner tables are centred by their parent `td` (and `align="center"`).
    4. Fixed widths as attributes: the container is `width="600"` + `style="width:100%;max-width:600px"`;
       images carry `width` / `height`.
    5. Buttons are bulletproof tables with exactly one `[if !mso]` / `[if mso]` pair each; padding comes
       from `cellpadding` in stripped views (CSS `padding:0` on the `td` overrides it when styles apply).
       No `display:none` wrappers (the preheader span excepted).
    6. Colours as attributes too: `bgcolor` on the header, panels and buttons; text colour via
       `<font color>`, so stripped views keep contrast.
    7. Every merge value HTML-escaped; URLs escaped for `href` / `src`; `tel:` digits only; tags
       substituted in one pass. A user-supplied image URL (the rep photo) is used only if `https://`.
    A stripped viewer also shows the preheader text at the top (its `display:none` is gone) — accepted.

26. **A missing role permission shows up as an empty dropdown or list, not as an error on screen.**
    Learned in Production (29 Sep 2026) on Update Opportunity: without Lists › Custom Lists: View the
    Call Title dropdown is empty (`customlist_nh_call_title` search → Permission Violation); a role not on
    the Objection Type record's "Use Permission List" gets an empty objection picker; without
    Create/Edit on Customer Objection the objections do not save (amber banner). A deployment left on
    **Testing** runs only for its owner ("That Suitelet is invalid, disabled, or no longer exists" for
    everyone else). **When a page looks empty for one role, check the Execution Log for Permission
    Violation first.** The full list is in DEPLOYMENT_CHECKLIST › Roles and permissions; test as a
    non-admin sales role (TESTING_GUIDE U11).

### NetSuite Record Types Used

| Record Type | Internal ID | Usage |
|------------|-------------|-------|
| Estimate | `estimate` | Primary data source for quotes |
| Opportunity | `opportunity` | Links multiple quotes; Master Proposal source |
| Customer | `customer` | Customer name, address |
| Employee | `employee` | Account manager details |
| File | `file` | Generated HTML storage |
| Folder | `folder` | File Cabinet folder |

---

## 10. How to Continue Development

### Send Quote: light search on Send, full loads for the selected quotes (SL 2.3.0)

`searchRelatedQuotes()` = `runQuoteSearch()` (the search, no loads) + `buildQuote()` per row (the full
`record.load`: pricing, BUS line loop, forecast flag). GET, preview and the re-render after a failed send
use it for **every** quote — the cards show derived VAT/BUS. The **Send POST** validates the selection
against `lightQuote()` rows (id, tranId, quote type — no load), then calls `buildQuote()` for the
**selected** quotes only; left-out quotes get their current forecast flag from
`lookupLeftOutForecast()` (one `search.lookupFields` each). The F6 type check reads the first loaded
quote, and the Main quote is always loaded. Anything new the Master Proposal needs must still come from
`buildQuote()` (the proposal never loads an Estimate). Timings: audit key `SendQuoteSL.Timing`.

### Deployment sequence

Order matters. Follow it exactly:

1. **Upload `nuheat_bus_grant.js`, `nuheat_vat_rates.js` and `nuheat_opp_update_lib.js` first.** Their consumers fail at load
   time if either is missing (§9, pitfall 13).
2. **Upload the remaining changed scripts** to `SuiteScripts/NuHeat/2026 Quote`.
3. **Verify the folder IDs match the target environment** before uploading — Production `26895192`,
   Sandbox `21719365`, in all three files (§9, pitfall 12). Upload the **repository** versions to
   Production; never upload a hand-edited Sandbox copy.
4. **Confirm the Quote HTML folder has "Available Without Login"** ticked. Without it, generation
   still succeeds and the record still gets a URL — but the public URL 403s, so the failure is
   invisible until a customer hits it.
5. **Regenerate one quote and read the Execution Log** before regenerating in bulk.

### Audit log keys worth grepping

The scripts log heavily on purpose. These are the keys that answer most questions:

| Key | Written by | Tells you |
|---|---|---|
| `BUS_RESOLVE` | `nuheat_bus_grant.js` | which Suppak line matched and at what rate |
| `BUS_UNMATCHED` | `nuheat_bus_grant.js` | a Suppak line matched no tier — includes the raw name to correct the arrays with |
| `BUS_FIGURES` | `nuheat_quote_suitelet.js` | every derived BUS figure for the quote, as JSON |
| `VAT_MISMATCH` | `nuheat_vat_rates.js` | derived VAT disagrees with NetSuite's — tax codes fixed 20 Aug 2026, so **a new entry means a regression at source** |
| `VAT_RATE_UNMATCHED` | `nuheat_vat_rates.js` | a quote type is missing from `QUOTE_TYPE_ALIASES` |
| `VAT_FIGURES` | `nuheat_quote_suitelet.js` | every derived VAT figure for the quote, as JSON |
| `VAT_QUOTE_TYPE` | `nuheat_quote_suitelet.js` | which route resolved the quote type (field vs inferred) |
| `SITE_ADDRESS` | `nuheat_quote_suitelet.js` | the resolved Opportunity ID and site address |
| `SendQuoteSL.Forecast` | `nuheat_send_quote_sl.js` | each Estimate's Include in Forecast change (from → to), failures with messages, or why no forecast writes happened (field absent / not a checkbox) |
| `SendQuoteSL.Selection` | `nuheat_send_quote_sl.js` | a POST or preview rejected because it named a quote not on the Opportunity (or was malformed) |
| `SendQuoteSL.Redirect` | `nuheat_send_quote_sl.js` | the exact code parameters sent back to the Opportunity |
| `SendQuoteSL.Timing` | `nuheat_send_quote_sl.js` | *(2.2.1)* one line per page load and per send: ms per phase (opportunity / quotes / render; rebuild / proposal / email / forecast / oppUpdate) and the quote counts — compare before and after a change |
| `SendQuoteSL.RepPhoto` | `nuheat_send_quote_sl.js` | *(2.2.0)* once per send: whether the account manager's photo was used in the email, or skipped and why |
| `OpportunityUE.banner` | `nuheat_opportunity_ue.js` | which banner was shown — `send/ok`, `upd/warn` … (audit) — or why it was not (error) |
| `UpdateOppSL.Call` | `nuheat_update_opp_sl.js` | the phone call created (ID, title) or the failure that stopped the save |
| `UpdateOppSL.Objection` | `nuheat_update_opp_sl.js` | each Customer Objection created, or failed with its message |
| `UpdateOppSL.OppUpdate` | `nuheat_update_opp_sl.js` / library | the field rules at page load, the required check, and the fields written (old → new) |
| `UpdateOppSL.Validation` | `nuheat_update_opp_sl.js` | a save rejected before any write, and why |
| `UpdateOppSL.Summary` | `nuheat_update_opp_sl.js` | one line per save: call ID, objections created / failed, fields changed / failed |
| `UpdateOppSL.Redirect` | `nuheat_update_opp_sl.js` | the exact code parameters sent back to the Opportunity |
| `SendQuoteSL.OppUpdate` | `nuheat_send_quote_sl.js` | GET: reported field types and any update field not shown (and why). POST: fields changed old → new, "no changes", skipped because the email failed, or the failed write (error level) |

### Starting a New Session

1. **Load this document** — It contains all the context you need
2. **Check current versions** — Review the version table in Section 3
3. **Read the CHANGELOG** — For recent changes, read `CHANGELOG.md` (first 100 lines)
4. **Understand the task** — Is it a bug fix, new feature, or UI change?

### What Context to Provide to the AI Agent

When starting a new session, provide:

```
I'm working on the Nu-Heat Online Quote System for NetSuite.
Please read AI_AGENT_CONTEXT.md (repository root) for full project context —
start with Section 0.

Current task: [describe what you need]
```

### How to Test Changes

1. After making code changes, the updated script needs to be uploaded to NetSuite File Cabinet
2. In NetSuite Sandbox: Documents > Files > SuiteScripts > NuHeat > 2026 Quote
3. Upload the modified file (overwrite existing)
4. Test by opening an Estimate and clicking "Regen quote"
5. Check Script Execution Log for errors

### Key Files to Read First

For most tasks, you only need to read:
- `nuheat_quote_suitelet.js` — Lines 1-100 (config) + the relevant render function
- `CHANGELOG.md` — First 50 lines (latest changes)
- This document

### Common Development Tasks

| Task | Files to Modify |
|------|----------------|
| Change quote page styling | `nuheat_quote_suitelet.js` → `generateCSS()` |
| Add new product section | `nuheat_quote_suitelet.js` → new render function + `renderQuotePage()` |
| Change pricing logic | `nuheat_quote_suitelet.js` → `loadQuoteData()` + `extractHeaderData()` |
| Modify buttons/form | `nuheat_quote_ue.js` → `beforeLoad()` |
| Fix stale pricing | `nuheat_quote_cs.js` → `generateOnlineQuote()` |
| Change Master Proposal | `nuheat_master_proposal.js` |
| Change Send Quote UI | `nuheat_send_quote_sl.js` |
| Fix Quote Viewer | `nuheat_quote_viewer_sl.js` |
| Change URL strategy | `nuheat_quote_ue.js` → `USE_PROXY_URL` + `nuheat_quote_suitelet.js` defaults |

---

*End of AI Agent Context Document*
