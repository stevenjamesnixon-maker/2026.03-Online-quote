# Nu-Heat Quote System — AI Agent Context Document

**Purpose:** Comprehensive context for AI agents (Claude, etc.) to efficiently continue development on this project without extensive re-reading of source files. Load this document at the start of every new AI session.

**Last Updated:** 31 March 2026

---

## Table of Contents

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

---

## 3. Current System State

### All Components and Versions

| Component | Version | File | Status |
|-----------|---------|------|--------|
| Quote Suitelet | v4.3.60 | `nuheat_quote_suitelet.js` | ✅ Production ready |
| Quote UE | v4.0.9 | `nuheat_quote_ue.js` | ✅ Production ready |
| Quote CS | v4.0.6 | `nuheat_quote_cs.js` | ✅ Production ready |
| Quote Viewer | v1.1.0 | `nuheat_quote_viewer_sl.js` | ✅ Production ready |
| Scheduled Script | v1.0.0 | `nuheat_quote_generator_ss.js` | ✅ Production ready |
| Master Proposal | v1.6.3 | `nuheat_master_proposal.js` | ✅ Production ready |
| Send Quote SL | v1.5.0 | `nuheat_send_quote_sl.js` | ✅ Production ready |
| Send Quote CS | v1.2.0 | `nuheat_send_quote_cs.js` | ✅ Production ready |
| Opportunity UE | v1.0.0 | `src/nuheat_opportunity_ue.js` | ✅ Production ready |
| Opportunity CS | v1.0.0 | `src/nuheat_opportunity_cs.js` | ✅ Production ready |

### Current Configuration

| Setting | Value |
|---------|-------|
| Environment | Sandbox (472052_SB1) |
| File Cabinet Folder | 26895192 |
| URL Field | `custbody_test_new_quote` |
| URL Strategy | Proxy (default) |
| `USE_PROXY_URL` | `true` |
| Max File Versions | 5 |
| Viewer Script ID | 3286 |
| Viewer Deploy ID | 1 |

> **Environment note — File Cabinet Folder IDs**
> | Environment | Folder ID |
> |-------------|-----------|
> | Sandbox (472052_SB1) | 21719365 |
> | Production | 26895192 |
> If switching between environments, update the folder ID constant in all three files:
> - `QUOTE_HTML_FOLDER_ID` in `src/nuheat_quote_viewer_sl.js`
> - `QUOTE_HTML_FOLDER_ID` in `src/nuheat_quote_suitelet.js`
> - `FOLDER_ID` in `src/nuheat_master_proposal.js`

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

### What Needs Attention

- ⚠️ Master Proposal pricing relies on individual quote data passed through Send Quote SL — if quotes are modified after proposal creation, the proposal doesn't auto-update
- ⚠️ Production deployment not yet done (currently Sandbox only)
- ⚠️ No automated testing framework — testing is manual
- ⚠️ Design packages comparison page exists as mockup but not integrated

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
| **Send Quote SL** | UI for selecting which quotes to include in a proposal. Needed because the user must choose Main vs Alternative. |
| **Opportunity UE/CS** | Entry point for Master Proposal workflow — "Send Quote" button on Opportunity form. |

### Design Decisions and Rationale

1. **Self-contained HTML** — No external CSS/JS dependencies. Everything is inline. This ensures quotes render correctly even offline or when printed.

2. **Base64 logo** — Logo embedded as base64 data URI. Avoids dependency on external image URLs that might change or require authentication.

3. **Proxy URL pattern** — The Quote Viewer Suitelet pattern was chosen over URL rewriting or URL shorteners because it's native NetSuite, requires no external services, and provides built-in diagnostics.

4. **Hardcoded product type IDs** — After trying text matching, case-insensitive matching, and partial matching, hardcoded ID mapping was the most reliable. NetSuite list field `getText()` is unreliable; `getValue()` returns numeric IDs consistently.

5. **Two-tier pricing** — Client overrides (TIER 1) + record.load (TIER 2). This solves the stale data problem without relying on `search.lookupFields()` which doesn't support computed fields.

6. **File versioning (keep 5)** — Balance between audit trail and File Cabinet size. The cleanup is non-critical — if it fails, it doesn't block generation.

7. **Direct module import (UE → Suitelet)** — NetSuite blocks `https.get()` from UE to Suitelet in the same account. Direct `require()` import is the supported pattern.

---

## 5. Code Structure

### File Organisation

```
src/
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
└── nuheat_send_quote_sl.js     # ~1,800 lines
    ├── onRequest()              # GET = form, POST = generate/preview/email
    ├── buildForm()              # NetSuite form with sublists
    └── searchRelatedQuotes()    # Find all Estimates for Opportunity
```

### Key Constants in `nuheat_quote_suitelet.js`

```javascript
var SCRIPT_VERSION = '4.3.60';
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

---

## 6. Known Issues & Limitations

### Active Issues

1. **Master Proposal doesn't auto-update** — If individual quotes are regenerated after a Master Proposal is created, the proposal's pricing summary is NOT automatically updated. A new proposal must be generated manually.

2. **No automated tests** — All testing is manual via the NetSuite UI. No unit tests or integration tests exist.

3. **Large script file** — `nuheat_quote_suitelet.js` is ~4,500 lines. Consider splitting into modules if it grows further.

4. **No email sending from Master Proposal** — The "email" functionality is stubbed but not fully implemented (depends on email templates).

### NetSuite Platform Limitations

1. **`search.lookupFields()` doesn't support computed fields** — `subtotal`, `total`, `taxtotal`, `discounttotal` are NOT valid search columns on Estimates. Must use `record.load()` instead.

2. **`file.load().save()` may not persist content changes** — Setting `.contents` on a loaded file and calling `.save()` silently fails to update. Use delete+create instead.

3. **`https.get()` from UE to Suitelet blocked** — NetSuite blocks same-account HTTP calls from User Event context. Use direct module imports.

4. **Governance limits** — UE scripts have 1,000 units; Suitelets have 10,000. The fallback Scheduled Script (10,000 units) handles edge cases.

5. **`getText()` on list fields unreliable** — Sometimes returns empty string. Always use `getValue()` (returns numeric ID) and map with hardcoded constants.

---

## 7. Future Enhancements

### Planned

- **Production deployment** — Deploy from Sandbox to Production environment
- **Design packages comparison** — Interactive comparison page (mockup exists at `design-packages-comparison.html`)
- **Landing page integration** — Landing page for new customers (prototype at `landing-page-redesign-v5.html`)

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

### Starting a New Session

1. **Load this document** — It contains all the context you need
2. **Check current versions** — Review the version table in Section 3
3. **Read the CHANGELOG** — For recent changes, read `CHANGELOG.md` (first 100 lines)
4. **Understand the task** — Is it a bug fix, new feature, or UI change?

### What Context to Provide to the AI Agent

When starting a new session, provide:

```
I'm working on the Nu-Heat Online Quote System for NetSuite.
Please read docs/AI_AGENT_CONTEXT.md for full project context.
The project is at /home/ubuntu/nuheat_netsuite_suitelet/

Current task: [describe what you need]
```

### How to Test Changes

1. After making code changes, the updated script needs to be uploaded to NetSuite File Cabinet
2. In NetSuite Sandbox: Documents > Files > SuiteScripts > NuHeat
3. Upload the modified file (overwrite existing)
4. Test by opening an Estimate and clicking "Regen quote"
5. Check Script Execution Log for errors

### Key Files to Read First

For most tasks, you only need to read:
- `src/nuheat_quote_suitelet.js` — Lines 1-100 (config) + the relevant render function
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
