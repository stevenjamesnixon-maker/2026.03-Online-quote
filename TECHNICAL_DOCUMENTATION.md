# Nu-Heat Quote System — Technical Documentation

**Version:** 1.0.0  
**Last Updated:** 28 March 2026  
**Applies to:** Suitelet v4.3.53, UE v4.0.9, CS v4.0.6, Viewer v1.1.0, Master Proposal v1.6.2

---

## Table of Contents

1. [System Architecture](#1-system-architecture)
2. [Components Overview](#2-components-overview)
3. [Configuration Guide](#3-configuration-guide)
4. [URL Strategy](#4-url-strategy)
5. [File Management](#5-file-management)
6. [Security & Permissions](#6-security--permissions)
7. [Troubleshooting Guide](#7-troubleshooting-guide)
8. [API Reference](#8-api-reference)

---

## 1. System Architecture

### 1.1 Component Diagram

```
┌─────────────────────────────────────────────────────────────────────────┐
│                        NETSUITE PLATFORM                                │
│                                                                         │
│  ┌─────────────────┐    ┌─────────────────┐    ┌──────────────────┐    │
│  │ Opportunity      │    │ Estimate (Quote) │    │ Customer Record  │    │
│  │ Record           │───▶│ Record           │───▶│                  │    │
│  └────────┬─────────┘    └───────┬──────────┘    └──────────────────┘    │
│           │                      │                                       │
│  ┌────────▼─────────┐   ┌───────▼──────────┐                           │
│  │ Opportunity UE    │   │ Quote UE Script   │                           │
│  │ (v1.0.0)          │   │ (v4.0.9)          │                           │
│  │ Adds "Send Quote" │   │ Auto-generates    │                           │
│  │ button             │   │ HTML on save      │                           │
│  └────────┬──────────┘   └───────┬──────────┘                           │
│           │                      │                                       │
│           │              ┌───────▼──────────┐                           │
│           │              │ Quote Suitelet    │                           │
│           │              │ (v4.3.53)         │                           │
│           │              │ generateAndSave   │                           │
│           │              │ HTML()            │                           │
│           │              └───────┬──────────┘                           │
│           │                      │                                       │
│  ┌────────▼──────────┐  ┌───────▼──────────┐   ┌──────────────────┐    │
│  │ Send Quote SL      │  │ File Cabinet      │   │ Quote Viewer SL  │    │
│  │ (v1.4.9)           │  │ Folder: 21719365  │   │ (v1.1.0)         │    │
│  │ Select quotes for  │  │ Quote HTML Files  │   │ Proxy for stable │    │
│  │ master proposal    │  └──────────────────┘   │ URLs              │    │
│  └────────┬──────────┘                          └──────────────────┘    │
│           │                                                              │
│  ┌────────▼──────────┐                                                  │
│  │ Master Proposal    │                                                  │
│  │ (v1.6.2)           │                                                  │
│  │ Generates multi-   │                                                  │
│  │ quote proposals    │                                                  │
│  └───────────────────┘                                                  │
│                                                                         │
│  CLIENT-SIDE SCRIPTS:                                                   │
│  ┌─────────────────┐  ┌─────────────────┐  ┌──────────────────┐       │
│  │ Quote CS (v4.0.6)│  │ Send Quote CS   │  │ Opportunity CS   │       │
│  │ "Regen quote"    │  │ (v1.1.1)        │  │ (v1.0.0)         │       │
│  │ button handler   │  │ Preview/Submit  │  │ "Send Quote" btn │       │
│  └─────────────────┘  └─────────────────┘  └──────────────────┘       │
│                                                                         │
│  FALLBACK:                                                              │
│  ┌─────────────────┐                                                    │
│  │ Scheduled Script │                                                    │
│  │ (v1.0.0)         │                                                    │
│  │ High-governance  │                                                    │
│  │ fallback         │                                                    │
│  └─────────────────┘                                                    │
└─────────────────────────────────────────────────────────────────────────┘

EXTERNAL ACCESS:
┌─────────────────┐                    ┌──────────────────┐
│ Customer Browser │───── Proxy URL ──▶│ Quote Viewer SL  │
│ (No login req'd) │                    │ → Serves latest  │
│                  │◀── HTML Content ──│   HTML from File  │
│                  │                    │   Cabinet          │
└─────────────────┘                    └──────────────────┘
```

### 1.2 Data Flow — Individual Quote Generation

```
1. TRIGGER
   ├── Automatic: Estimate saved → UE afterSubmit → generateAndSaveHTML()
   └── Manual: User clicks "Regen quote" → CS saves record → calls Suitelet
       └── CS passes fresh pricing as URL params (p_subtotal, p_taxtotal, etc.)

2. DATA LOADING (loadQuoteData)
   ├── record.load() — Estimate record
   ├── Extract: customer info, line items, custom fields
   ├── Per-item: load custitem_prod_type for product categorisation
   └── Pricing priority:
       ├── TIER 1: Client script overrides (URL params) — most reliable
       └── TIER 2: record.load() values — used by UE script / direct access

3. HTML RENDERING (renderQuotePage)
   ├── Self-contained HTML with embedded CSS
   ├── Base64-encoded logo
   ├── Product sections: UFH, Heat Pump, Solar, Commissioning
   ├── Component Breakdown, Project Specification, Upgrades
   └── Responsive design (desktop + mobile at 768px breakpoint)

4. FILE STORAGE
   ├── Timestamped filename: quote_{quoteId}_{oppId}_{timestamp}.html
   ├── Saved to File Cabinet folder 21719365
   ├── isOnline = true (public access)
   └── Old versions cleaned up (keep last 5)

5. URL GENERATION
   ├── Proxy URL via Quote Viewer Suitelet (stable, never changes)
   └── Stored in custbody_test_new_quote on Estimate record
```

### 1.3 Data Flow — Master Proposal

```
1. TRIGGER
   └── User clicks "Send Quote" on Opportunity → Opens Send Quote Suitelet

2. QUOTE SELECTION (Send Quote Suitelet v1.4.9)
   ├── Searches all Estimates linked to Opportunity
   ├── Groups by type: UFH, Heat Pump, Solar, Other
   ├── User selects Main vs Alternative quotes
   └── User enters email recipients

3. PROPOSAL GENERATION (Master Proposal v1.6.2)
   ├── Loads customer/opportunity data
   ├── Aggregates pricing across selected quotes
   ├── Generates branded HTML with quote cards
   ├── Each card links to individual quote via Viewer proxy URL
   └── Saves to File Cabinet, updates Opportunity record

4. DELIVERY
   └── Email sent with proposal link (or manual sharing)
```

### 1.4 Integration Points

| Integration Point | From | To | Method |
|---|---|---|---|
| Quote auto-generation | UE Script | Suitelet | Direct module import |
| Manual regen | Client Script | Suitelet | HTTP GET with pricing params |
| Governance fallback | UE Script | Scheduled Script | N/task.create() |
| Master Proposal | Send Quote SL | Master Proposal module | require() import |
| Customer access | Browser | Quote Viewer SL | HTTP GET (no auth) |
| Quote in proposal | Master Proposal | Quote Viewer SL | Embedded proxy URL |

---

## 2. Components Overview

### 2.1 Script Summary

| Script | File | Version | Type | Purpose |
|--------|------|---------|------|---------|
| Quote Suitelet | `nuheat_quote_suitelet.js` | v4.3.53 | Suitelet | Core HTML quote generation engine |
| Quote User Event | `nuheat_quote_ue.js` | v4.0.9 | UserEventScript | Auto-generates quotes on Estimate save; adds "Regen quote" button |
| Quote Client Script | `nuheat_quote_cs.js` | v4.0.6 | ClientScript | Handles "Regen quote" button click; saves record first, passes fresh pricing |
| Quote Viewer | `nuheat_quote_viewer_sl.js` | v1.1.0 | Suitelet | Proxy that serves latest quote HTML via stable URL |
| Scheduled Script | `nuheat_quote_generator_ss.js` | v1.0.0 | ScheduledScript | Fallback for governance-limited UE contexts |
| Master Proposal | `nuheat_master_proposal.js` | v1.6.2 | Module | Generates multi-quote master proposals |
| Send Quote SL | `nuheat_send_quote_sl.js` | v1.4.9 | Suitelet | Quote selection UI for proposal generation |
| Send Quote CS | `nuheat_send_quote_cs.js` | v1.1.1 | ClientScript | Handles Send Quote form interactions |
| Opportunity UE | `nuheat_opportunity_ue.js` | v1.0.0 | UserEventScript | Adds "Send Quote" button to Opportunity form |
| Opportunity CS | `nuheat_opportunity_cs.js` | v1.0.0 | ClientScript | Opens Send Quote Suitelet from Opportunity |

### 2.2 Dependencies Between Components

```
nuheat_quote_cs.js ──────────────▶ nuheat_quote_suitelet.js (HTTP call)
nuheat_quote_ue.js ──────────────▶ nuheat_quote_suitelet.js (module import)
nuheat_quote_generator_ss.js ───▶ nuheat_quote_suitelet.js (module import)
nuheat_quote_suitelet.js ────────▶ nuheat_quote_viewer_sl.js (URL generation)
nuheat_send_quote_sl.js ─────────▶ nuheat_master_proposal.js (module import)
nuheat_send_quote_sl.js ─────────▶ nuheat_send_quote_cs.js (inline client script)
nuheat_opportunity_ue.js ────────▶ nuheat_opportunity_cs.js (button handler)
nuheat_opportunity_cs.js ────────▶ nuheat_send_quote_sl.js (opens Suitelet)
nuheat_master_proposal.js ──────▶ nuheat_quote_viewer_sl.js (embed proxy URLs)
```

### 2.3 Key Functions

#### `nuheat_quote_suitelet.js`

| Function | Purpose |
|----------|---------|
| `onRequest(context)` | Entry point — routes to generate mode or view mode |
| `generateAndSaveHTML(quoteId, options)` | **Core function** — generates HTML, saves to File Cabinet, returns URL |
| `loadQuoteData(quoteId, pricingOverrides)` | Loads all Estimate data from NetSuite |
| `renderQuotePage(quoteData)` | Renders complete self-contained HTML page |
| `loadItemCustomFields(items)` | Loads `custitem_prod_type` and other item fields |
| `filterItemsByProductTypeId(items, categoryIds)` | Filters items by product type ID map |
| `getProductTypeId(item)` | Extracts numeric product type ID from item |
| `filterForRender(items, categoryKey)` | Consolidated render-time filtering |
| `renderUFHTreeSection(quoteData)` | Renders UFH product tree (Floor Construction, Thermostat, etc.) |
| `renderHeatPumpSection(quoteData)` | Renders Heat Pump products section |
| `renderSolarSection(quoteData)` | Renders Solar Thermal products section |
| `renderCommissioningSection(quoteData)` | Renders Commissioning products section |
| `cleanupOldFiles(quoteId, oppId, currentFileId)` | Keeps last 5 file versions per quote |

#### `nuheat_quote_viewer_sl.js`

| Function | Purpose |
|----------|---------|
| `onRequest(context)` | Looks up latest HTML file and serves it with no-cache headers |
| `renderErrorPage(title, message)` | Branded error page for invalid requests |

#### `nuheat_master_proposal.js`

| Function | Purpose |
|----------|---------|
| `generateMasterProposal(opportunityId, selectedQuotes)` | Full generation — save to File Cabinet + update Opportunity |
| `generatePreviewHTML(opportunityId, selectedQuotes)` | Preview — generate HTML without saving |
| `generateBenefitsRow(quoteType)` | Renders benefit checkmarks per quote type |
| `generateBUSGrantBanner()` | Renders BUS grant banner for Heat Pump quotes |
| `calculateTotals(selectedQuotes)` | Aggregates pricing across all selected quotes |

---

## 3. Configuration Guide

### 3.1 NetSuite Script Records

| Script | Script ID | Deployment ID | Status |
|--------|-----------|---------------|--------|
| Quote Suitelet | `customscript_nuheat_quote_suitelet` | `customdeploy1` | Released |
| Quote UE | `customscript_nuheat_quote_ue` | `customdeploy_nuheat_quote_ue` | Released |
| Quote CS | `customscript_nuheat_quote_cs` | `customdeploy_nuheat_quote_cs` | Released |
| Quote Viewer | `customscript_nuheat_quote_viewer` | `customdeploy_nuheat_quote_viewer` | Released |
| Scheduled Script | `customscript_nuheat_quote_gen_ss` | `customdeploy_nuheat_quote_gen_ss` | Released |
| Send Quote SL | `customscript_nuheat_send_quote_sl` | `customdeploy_nuheat_send_quote_sl` | Released |
| Opportunity UE | `customscript_nuheat_opportunity_ue` | `customdeploy_nuheat_opportunity_ue` | Released |
| Opportunity CS | `customscript_nuheat_opportunity_cs` | `customdeploy_nuheat_opportunity_cs` | Released |

### 3.2 Script Parameters

#### Quote Suitelet Parameters

| Parameter ID | Value | Purpose |
|---|---|---|
| `custscript_viewer_script_id` | `3286` (or `customscript_nuheat_quote_viewer`) | Quote Viewer script internal ID |
| `custscript_viewer_deploy_id` | `1` (or `customdeploy_nuheat_quote_viewer`) | Quote Viewer deployment internal ID |

#### Scheduled Script Parameters

| Parameter ID | Type | Purpose |
|---|---|---|
| `custscript_nuheat_gen_quote_id` | Free-Form Text | Estimate internal ID to generate |

### 3.3 Deployment Settings

#### Quote Viewer Suitelet (CRITICAL)

| Setting | Value | Notes |
|---------|-------|-------|
| Available Without Login | ✅ Yes | **Required** for public customer access |
| Status | Released | Must NOT be "Testing" |
| Execute As Role | Administrator | Or role with File Cabinet access |
| Audience - Internal Roles | All Internal Roles | |
| Audience - External Roles | All External Roles | |

#### Quote Suitelet

| Setting | Value |
|---------|-------|
| Available Without Login | ✅ Yes |
| Status | Released |

#### Quote UE Script

| Setting | Value |
|---------|-------|
| Applies To | Estimate |
| Event Types | Before Load, After Submit |

### 3.4 Custom Fields

#### Transaction Body Fields (Estimate)

| Field ID | Type | Purpose |
|----------|------|---------|
| `custbody_test_new_quote` | URL | Stores generated quote URL |
| `custbody_project_name` | Free-Form Text | Project name display |
| `custbody_project_address` | Text Area | Project address display |
| `custbody_project_id` | Free-Form Text | Project reference |
| `custbody_quote_version` | Integer | Quote version number |
| `custbody_rooms_html` | Rich Text | Pre-formatted rooms table |
| `custbody_quote_note_title` | Free-Form Text | Important info note title |
| `custbody_quote_note_description` | Rich Text | Important info note content |
| `custbody_quote_ufh_price` | Currency | UFH subtotal price |
| `custbody_quote_hp_price` | Currency | Heat Pump subtotal price |
| `custbody_quote_description` | Rich Text | Quote description for proposals |
| `custbody_sales_rep_phone` | Phone | Account manager phone |

#### Item Fields

| Field ID | Type | Purpose |
|----------|------|---------|
| `custitem_prod_type` | List/Record | Product type ID (52 values) |
| `custitem_prod_info_link` | URL | Product datasheet link |
| `custitem_quote_image` | Image | Product image for quote |

### 3.5 File Cabinet Structure

```
SuiteScripts/
└── NuHeat/
    ├── nuheat_quote_suitelet.js
    ├── nuheat_quote_ue.js
    ├── nuheat_quote_cs.js
    ├── nuheat_quote_viewer_sl.js
    ├── nuheat_quote_generator_ss.js
    ├── nuheat_master_proposal.js
    ├── nuheat_send_quote_sl.js
    ├── nuheat_send_quote_cs.js
    ├── nuheat_opportunity_ue.js
    ├── nuheat_opportunity_cs.js
    └── Quote HTML Files/          ← Folder ID: 21719365
        ├── quote_12345_67890_1711612800000.html
        ├── quote_12345_67890_1711612900000.html
        ├── proposal_67890_1711613000000.html
        └── ...
```

**Folder Settings:**
- Folder ID: `21719365`
- Path: `SuiteScripts > NuHeat > Quote HTML Files`
- Available Without Login: ✅ Yes

---

## 4. URL Strategy

### 4.1 Proxy URLs vs Direct URLs

| Aspect | Proxy URL (Default) | Direct File Cabinet URL |
|--------|-------------------|------------------------|
| **Format** | `scriptlet.nl?script=3286&deploy=1&quote={id}` | `media.nl?id={fileId}` |
| **Stability** | ✅ Never changes | ❌ Changes on every regeneration |
| **Content freshness** | ✅ Always serves latest | ⚠️ May serve cached version |
| **Master Proposal safe** | ✅ Links always work | ❌ Links break on regen |
| **Requires** | Quote Viewer deployed with correct permissions | Nothing extra |

### 4.2 How Proxy URL Generation Works

1. **HTML file saved** to File Cabinet with timestamped name
2. **`url.resolveScript()`** generates a Suitelet URL pointing to Quote Viewer
3. **Parameters**: `quote={quoteId}&opp={opportunityId}`
4. **URL stored** in `custbody_test_new_quote` field
5. **On access**: Quote Viewer searches for latest file matching `quote_{id}_*`, serves its content

### 4.3 URL Stability Mechanism

- Each regeneration creates a **new timestamped file** (e.g., `quote_12345_67890_1711612900000.html`)
- The **proxy URL** stays the same: `?quote=12345&opp=67890`
- Quote Viewer always finds the **newest file** (sorted by filename DESC)
- No-cache headers (`Cache-Control: no-cache, no-store, must-revalidate`) ensure browsers fetch fresh content

### 4.4 Configuration Toggle

In `nuheat_quote_ue.js`:
```javascript
var USE_PROXY_URL = true;  // Stable proxy URLs (default)
// var USE_PROXY_URL = false; // Direct File Cabinet URLs (fallback)
```

---

## 5. File Management

### 5.1 Naming Conventions

| File Type | Pattern | Example |
|-----------|---------|---------|
| Quote HTML | `quote_{quoteId}_{oppId}_{timestamp}.html` | `quote_15393991_13859229.html` |
| Proposal HTML | `proposal_{oppId}_{timestamp}.html` | `proposal_13859229_1711612800000.html` |

### 5.2 Versioning Strategy

- **Quotes**: Configurable via `MAX_FILE_VERSIONS` constant (default: 5)
- After each generation, `cleanupOldFiles()` removes the oldest files, keeping the last 5
- Cleanup is non-critical — failures are logged but don't block generation
- Safety: never deletes the file that was just created

- **Proposals**: All versions retained (cleanup removed in v1.6.2)
- Timestamped filenames provide audit trail
- `cleanupOldProposals()` function retained in code but not called

### 5.3 File Properties

| Property | Value |
|----------|-------|
| Type | `file.Type.HTMLDOC` |
| Folder | `21719365` |
| `isOnline` | `true` |
| Encoding | `file.Encoding.UTF_8` |

---

## 6. Security & Permissions

### 6.1 Role Requirements

| Operation | Minimum Role |
|-----------|-------------|
| Upload scripts | Administrator or Developer |
| Configure deployments | Administrator |
| View execution logs | Administrator |
| Access quotes (internal) | Any internal role |
| Access quotes (external) | No role required (Available Without Login) |

### 6.2 Public Access Configuration

For customer-facing URLs to work without login:

1. **Quote Viewer Suitelet** deployment must have:
   - "Available Without Login" = ✅
   - Status = "Released"
   - Execute As Role = Administrator
   - Audience: All Internal + All External Roles

2. **File Cabinet folder** (`Quote HTML Files`) must have:
   - "Available Without Login" = ✅

3. **Quote Suitelet** deployment must have:
   - "Available Without Login" = ✅

### 6.3 XSS Prevention

All user-supplied data is HTML-escaped before rendering:

```javascript
function escapeHtml(str) {
    return String(str)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#039;');
}
```

### 6.4 Access Security

- Quote IDs are NetSuite internal IDs (not sequential, harder to guess)
- Proxy URLs require both quote ID and opportunity ID
- No sensitive financial data beyond pricing is exposed
- Full audit trail in NetSuite Script Execution Logs

---

## 7. Troubleshooting Guide

### 7.1 Common Issues

| Issue | Cause | Solution |
|-------|-------|----------|
| "You do not have privileges to view this page" | Quote Viewer deployment misconfigured | Check "Available Without Login", Status = Released, Execute As Role = Administrator |
| `SSS_INVALID_SRCH_COL` error in logs | Using `search.lookupFields()` with computed fields | Ensure Suitelet v4.3.50+ is deployed (this was fixed) |
| Quote URL empty after save | UE script failed silently | Check Script Execution Log for errors |
| Stale pricing in generated HTML | Database read-back timing | Ensure CS v4.0.6+ (passes pricing as URL params) |
| "Missing Quote ID" error page | URL missing `?quote=` parameter | Verify URL includes quote ID |
| Master Proposal prices incorrect | Double-counting VAT | Ensure Master Proposal v1.5.4+ (`totalIncVat = total` directly) |
| "Invalid page parameter" | Wrong Suitelet URL format | Use correct script/deployment IDs |
| Buttons not appearing on form | UE script not deployed correctly | Verify deployment applies to Estimate, Before Load event |
| Duplicate buttons on form | Old + new UE deployments both active | Deactivate old deployment |

### 7.2 Diagnostic Tools

#### Quote Viewer Diagnostic Mode

Append `?diag=1` to the Quote Viewer URL to get JSON diagnostics:

```
https://{domain}/app/site/hosting/scriptlet.nl?script=3286&deploy=1&diag=1
```

Returns:
```json
{
    "version": "1.1.0",
    "scriptId": "customscript_nuheat_quote_viewer",
    "deploymentId": "customdeploy_nuheat_quote_viewer",
    "userId": -4,
    "userRole": "anonymous",
    "remainingUsage": 9990,
    "folderId": 21719365,
    "timestamp": "2026-03-28T12:00:00.000Z"
}
```

#### Script Execution Log Entries

| Log Key | Script | Meaning |
|---------|--------|---------|
| `URL_STRATEGY` | Suitelet | Shows whether proxy or direct URL was used |
| `FILE_SAVE_STEP1-5` | Suitelet | File save progress (search → delete → create) |
| `STALE DATA DETECTED` | Suitelet | Pricing mismatch between sources |
| `Quote UE v4.0.9` | UE Script | UE execution with version tracking |
| `QuoteViewer` | Viewer | Request logging with user/role info |

### 7.3 Log Analysis

To find relevant logs in NetSuite:
1. Go to **Customization > Scripting > Script Execution Log**
2. Filter by Script: `Nu-Heat Quote Page Suitelet`
3. Filter by Type: `AUDIT` for operational logs, `ERROR` for failures
4. Search for version-specific entries (e.g., `v4.3.53`)

---

## 8. API Reference

### 8.1 `generateAndSaveHTML(quoteId, options)`

The core function exported by `nuheat_quote_suitelet.js`.

**Parameters:**

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `quoteId` | String/Number | Yes | NetSuite Estimate internal ID |
| `options` | Object | No | Configuration options |
| `options.useProxyUrl` | Boolean | No | Use proxy URL (default: `true`) |
| `options.calledFrom` | String | No | Caller identifier for logging |
| `options.debugLog` | Boolean | No | Enable debug logging |
| `options.pricingOverrides` | Object | No | Fresh pricing values from client |

**Options (legacy signature):**
```javascript
// Old: generateAndSaveHTML(quoteId, debugLog, pricingOverrides)
// New: generateAndSaveHTML(quoteId, { debugLog, pricingOverrides, useProxyUrl, calledFrom })
```

**Returns:**

```javascript
{
    success: true,
    fileId: 35786689,
    url: "https://472052-sb1.extforms.netsuite.com/app/site/hosting/scriptlet.nl?script=3286&deploy=1&quote=15393991&opp=13859229",
    urlType: "proxy",  // or "direct"
    quoteId: "15393991",
    version: "4.3.53"
}
```

### 8.2 Quote Suitelet URL Parameters

#### View Mode (default)

```
GET /app/site/hosting/scriptlet.nl?script={scriptId}&deploy={deployId}&quoteid={quoteId}
```

| Parameter | Required | Description |
|-----------|----------|-------------|
| `quoteid` / `quoteId` / `id` | Yes | Estimate internal ID |

#### Generate Mode

```
GET /app/site/hosting/scriptlet.nl?script={scriptId}&deploy={deployId}&mode=generate&quoteid={quoteId}
```

| Parameter | Required | Description |
|-----------|----------|-------------|
| `mode` | Yes | Must be `generate` |
| `quoteid` | Yes | Estimate internal ID |
| `p_subtotal` | No | Pricing override from client |
| `p_taxtotal` | No | VAT override from client |
| `p_total` | No | Total override from client |
| `p_discounttotal` | No | Discount override from client |

### 8.3 Quote Viewer URL Parameters

```
GET /app/site/hosting/scriptlet.nl?script=3286&deploy=1&quote={quoteId}&opp={oppId}
```

| Parameter | Required | Description |
|-----------|----------|-------------|
| `quote` / `quoteid` / `quoteId` | Yes | Estimate internal ID |
| `opp` / `opportunityId` | No | Opportunity internal ID |
| `diag` | No | Set to `1` for diagnostic mode |

### 8.4 Product Type ID Map

The system uses 52 product type IDs to categorise items. Key categories:

| Category | Product Type IDs |
|----------|-----------------|
| UFH - Floor Construction | 1-21 (various floor types) |
| UFH - Electrical (Thermostat) | 22, 23, 24, 47, 48 |
| Heat Pump | 25-35 (HP units, components) |
| Solar Thermal | 36-42 |
| Commissioning | 43-46 |
| Design Package | 49-52 |

Refer to `PRODUCT_TYPE_ID_MAP` and `PRODUCT_CATEGORY_MAP` in `nuheat_quote_suitelet.js` for the complete mapping.

---

## Appendix A: NetSuite Environment

| Setting | Value |
|---------|-------|
| Account ID | 472052_SB1 (Sandbox) |
| Environment | Sandbox |
| SuiteScript Version | 2.1 |
| Script Folder | SuiteScripts > NuHeat |
| HTML Folder ID | 21719365 |
| Domain (External) | 472052-sb1.extforms.netsuite.com |

## Appendix B: Brand Configuration

| Setting | Value |
|---------|-------|
| Primary Colour | `#00857D` (Teal) |
| Dark Blue | `#074F71` |
| Light Teal | `#00B0B9` |
| CTA Orange | `#E35205` |
| Text Grey | `#53565A` |
| Font | Poppins (Google Fonts) |
| Logo | Base64-encoded PNG (400×169px) |

---

*End of Technical Documentation*
