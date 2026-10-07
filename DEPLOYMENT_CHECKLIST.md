# Nu-Heat Quote System — Deployment Checklist

**Version:** 2.0.0  
**Last Updated:** 20 August 2026  
**Applies to:** Full system deployment (11 scripts + 2 shared modules)

---

## Table of Contents

1. [Pre-Deployment Checklist](#1-pre-deployment-checklist)
2. [Deployment Steps](#2-deployment-steps)
   - [Roles and permissions](#roles-and-permissions-update-opportunity--send-quote)
3. [Post-Deployment Verification](#3-post-deployment-verification)
4. [Rollback Procedures](#4-rollback-procedures)
5. [Production vs Sandbox Differences](#5-production-vs-sandbox-differences)

---

## 1. Pre-Deployment Checklist

### 1.1 Script Readiness

- [ ] All scripts are at their target versions:

| Script | File | Target Version |
|--------|------|---------------|
| **BUS Grant Module** | `nuheat_bus_grant.js` | v1.0.0 |
| **VAT Rates Module** | `nuheat_vat_rates.js` | v1.0.0 |
| **Opportunity Update Library** | `nuheat_opp_update_lib.js` | 1.1.0 — ✅ in Production (1 Oct 2026) |
| Quote Suitelet | `nuheat_quote_suitelet.js` | v4.6.0 |
| Quote UE | `nuheat_quote_ue.js` | v4.0.9 |
| Quote CS | `nuheat_quote_cs.js` | v4.0.6 |
| Quote Viewer | `nuheat_quote_viewer_sl.js` | v1.1.0 |
| Scheduled Script | `nuheat_quote_generator_ss.js` | v1.0.0 |
| Master Proposal | `nuheat_master_proposal.js` | v1.8.3 |
| Send Quote SL | `nuheat_send_quote_sl.js` | 2.3.1 — ✅ in Production (1 Oct 2026) |
| Update Opportunity SL | `nuheat_update_opp_sl.js` | 1.1.0 — ✅ in Production (1 Oct 2026) |
| Send Quote CS | `nuheat_send_quote_cs.js` | v1.4.0 — detached, kept for reference (no upload needed) |
| Analytics Suitelet | `nuheat_analytics_sl.js` | v1.0.1 |
| Opportunity UE | `nuheat_opportunity_ue.js` | 1.5.3 — 🔶 in review (Create order button, `ORDER_MODE`). 1.4.0 in Production (1 Oct 2026) |
| Opportunity CS | `nuheat_opportunity_cs.js` | 1.3.0 — 🔶 in review. 1.2.0 in Production (29 Sep 2026) |
| **Order Library** | `nuheat_order_lib.js` | 1.2.1 — 🔶 new, in review |
| Create Order SL | `nuheat_create_order_sl.js` | 1.3.1 — 🔶 new, in review |

> Read each version from the `SCRIPT_VERSION` / `MODULE_VERSION` constant in the file, not from the
> JSDoc header — the two drift. `nuheat_quote_ue.js` is currently out by one patch version
> (`SCRIPT_VERSION = '4.0.9'`, header comment `Version: 4.0.8`).

- [ ] All scripts have been tested in Sandbox
- [ ] `CHANGELOG.md` is up to date

### 1.2 Custom Fields Exist

- [ ] `custbody_test_new_quote` (URL field on Estimate)
- [ ] `custbody_project_name` (Free-Form Text on Estimate)
- [ ] `custbody_project_address` (Text Area on Estimate)
- [ ] `custbody_project_id` (Free-Form Text on Estimate)
- [ ] `custbody_quote_version` (Integer on Estimate)
- [ ] `custbody_rooms_html` (Rich Text on Estimate)
- [ ] `custbody_quote_note_title` (Free-Form Text on Estimate)
- [ ] `custbody_quote_note_description` (Rich Text on Estimate)
- [ ] `custbody_quote_ufh_price` (Currency on Estimate)
- [ ] `custbody_quote_hp_price` (Currency on Estimate)
- [ ] `custbody_quote_description` (Rich Text on Estimate)
- [ ] `custbody_sales_rep_phone` (Phone on Opportunity)
- [ ] `custitem_prod_type` (List/Record on Item)
- [ ] `custitem_prod_info_link` (URL on Item)
- [ ] `custitem_quote_image` (Image on Item)

### 1.3 File Cabinet

- [ ] Folder `SuiteScripts > NuHeat > 2026 Quote` exists (all 13 scripts)
- [ ] Folder `SuiteScripts > NuHeat > Quote HTML Files` exists
- [ ] Quote HTML Files folder ID matches the **target environment** — Production `26895192`,
      Sandbox `21719365` — in **all three** files (see the warning under Step 4)
- [ ] Quote HTML Files folder has "Available Without Login" = ✅

### 1.4 Objection configuration (Update Opportunity)

- [ ] Objection config built first, before the Update Opportunity SL is deployed: the lists
      (`customlist_nh_call_title`, `customlist_nh_objection_group`), the **Objection Type** record
      (`customrecord_nh_objection_type`, with its types) and the **Customer Objection** record
      (`customrecord_nh_objection`). Field IDs: `FIELD_REFERENCE.md` › Update Opportunity SL 1.0.0.
      ✅ Built directly in **Production**. A **Sandbox refresh** is needed before any Sandbox testing.

### 1.5 Environment

- [ ] Target environment identified (Sandbox / Production)
- [ ] Administrator access confirmed
- [ ] Backup plan documented

---

## 2. Deployment Steps

### Step 1: Upload Scripts to File Cabinet

1. Navigate to **Documents > Files > SuiteScripts > NuHeat > 2026 Quote**

> ### ⚠️ UPLOAD ORDER MATTERS (v4.4.0, v4.5.0, Send Quote 2.1.0)
>
> **`nuheat_bus_grant.js`, `nuheat_vat_rates.js` AND `nuheat_opp_update_lib.js` MUST be uploaded
> FIRST**, before `nuheat_quote_suitelet.js`, `nuheat_send_quote_sl.js` or `nuheat_update_opp_sl.js`
> are redeployed. The consumers `define()` them as `'./nuheat_bus_grant'`, `'./nuheat_vat_rates'` and
> `'./nuheat_opp_update_lib'`, and **fail at load time** if a module they import is not already
> present in `SuiteScripts/NuHeat/2026 Quote`.
>
> All three are shared custom modules — they need **no script record and no script deployment record**,
> only the File Cabinet upload. The relative path resolves against the calling script's own folder,
> so all files must sit in the same `SuiteScripts/NuHeat/2026 Quote` folder.
>
> If you have already redeployed a consumer and it is erroring on load, upload the missing module
> and the error clears — no redeploy of the consumer is needed.
>
> **Update Opportunity 1.1.0 / Send Quote 2.3.1 — ✅ deployed to Production 1 Oct 2026, in this order:**
>
> | # | File | Version |
> |---|---|---|
> | 1 | `nuheat_opp_update_lib.js` — **first** (both Suitelets call its email functions) | 1.1.0 |
> | 2 | `nuheat_send_quote_sl.js` | 2.3.1 |
> | 3 | `nuheat_update_opp_sl.js` | 1.1.0 |
> | 4 | `nuheat_opportunity_ue.js` | 1.4.0 |
>
> Read back every version header after upload. `nuheat_opportunity_cs.js` stays 1.2.0 (29 Sep). No new
> script parameters or records.

> **Create order 1.0.0 (6 Oct 2026) — upload in this order:**
>
> | # | File | Version |
> |---|---|---|
> | 1 | `nuheat_opp_update_lib.js` — already in place (unchanged by this release; the order library requires it) | as live |
> | 2 | `nuheat_order_lib.js` — **before the Suitelet** | 1.2.1 |
> | 3 | `nuheat_create_order_sl.js` | 1.3.1 |
> | 4 | `nuheat_opportunity_cs.js` | 1.3.0 |
> | 5 | `nuheat_opportunity_ue.js` — **last** (no `ORDER_MODE` row = no button) | 1.5.3 |
>
> Read back every version header after upload. Then create the script record and the settings rows (2f-3).
> **No script parameters.**

2. Upload the scripts (all files live at the **repository root** — there is no `src/` directory):
   - **`nuheat_bus_grant.js`** ← **upload FIRST** (shared module, no script record needed)
   - **`nuheat_vat_rates.js`** ← **upload FIRST** (shared module, no script record needed)
   - **`nuheat_opp_update_lib.js`** ← **upload FIRST** (shared module, no script record needed)
   - `nuheat_quote_suitelet.js`
   - `nuheat_quote_ue.js`
   - `nuheat_quote_cs.js`
   - `nuheat_quote_viewer_sl.js`
   - `nuheat_quote_generator_ss.js`
   - `nuheat_master_proposal.js`
   - `nuheat_send_quote_sl.js`
   - `nuheat_send_quote_cs.js`
   - `nuheat_update_opp_sl.js`
   - `nuheat_opportunity_ue.js`
   - `nuheat_opportunity_cs.js`
3. If updating existing files, select "Replace" when prompted

### Step 2: Create Script Records

Navigate to **Customization > Scripting > Scripts > New** for each:

#### 2a. Quote Suitelet
- **Name:** Nu-Heat Quote Page Suitelet
- **Script File:** `SuiteScripts/NuHeat/2026 Quote/nuheat_quote_suitelet.js`
- **Deployment:**
  - ID: `customdeploy1`
  - Title: Nu-Heat Quote Page
  - Status: Released
  - Available Without Login: ✅
  - Log Level: Audit (Debug for testing)
- **Parameters:**
  - `custscript_viewer_script_id` = Viewer script internal ID (e.g., `3286`)
  - `custscript_viewer_deploy_id` = Viewer deployment internal ID (e.g., `1`)

#### 2b. Quote User Event
- **Name:** Nu-Heat Quote UE
- **Script File:** `SuiteScripts/NuHeat/2026 Quote/nuheat_quote_ue.js`
- **Deployment:**
  - ID: `customdeploy_nuheat_quote_ue`
  - Applies To: Estimate
  - Event Types: Before Load, After Submit
  - Status: Released

#### 2c. Quote Client Script
- **Name:** Nu-Heat Quote CS
- **Script File:** `SuiteScripts/NuHeat/2026 Quote/nuheat_quote_cs.js`
- **Deployment:**
  - ID: `customdeploy_nuheat_quote_cs`
  - Applies To: Estimate
  - Status: Released

#### 2d. Quote Viewer Suitelet ⚠️ CRITICAL
- **Name:** Nu-Heat Quote Viewer
- **Script File:** `SuiteScripts/NuHeat/2026 Quote/nuheat_quote_viewer_sl.js`
- **Deployment:**
  - ID: `customdeploy_nuheat_quote_viewer`
  - Title: Nu-Heat Quote Viewer
  - Status: Released
  - **Available Without Login: ✅** (CRITICAL)
  - **Execute As Role: Administrator** (CRITICAL)
  - **Audience > Internal Roles: All Internal Roles** (CRITICAL)
  - **Audience > External Roles: All External Roles** (CRITICAL)

#### 2e. Scheduled Script
- **Name:** Nu-Heat Quote Generator SS
- **Script File:** `SuiteScripts/NuHeat/2026 Quote/nuheat_quote_generator_ss.js`
- **Deployment:**
  - ID: `customdeploy_nuheat_quote_gen_ss`
  - Status: Released
- **Parameters:**
  - `custscript_nuheat_gen_quote_id` (Free-Form Text)

#### 2f. Send Quote Suitelet
- **Name:** Nu-Heat Send Quote Selection
- **Script File:** `SuiteScripts/NuHeat/2026 Quote/nuheat_send_quote_sl.js`
- **Deployment:**
  - ID: `customdeploy_nuheat_send_quote_sl`
  - Status: Released

#### 2f-2. Update Opportunity Suitelet (new in 1.0.0; 1.1.0 adds the email and the save guard)
- **Name:** Nu-Heat Update Opportunity
- **Script ID:** `customscript_nuheat_update_opp_sl`
- **Script File:** `SuiteScripts/NuHeat/2026 Quote/nuheat_update_opp_sl.js`
- **Deployment:**
  - ID: `customdeploy_nuheat_update_opp_sl`
  - Status: **Released** — never leave it on Testing: Testing runs only for the deployment's owner
  - **Execute As Role: Current Role** — the account manager's own permissions decide what can be written
  - Audience: the sales / account-manager roles
  - **Log Level: Audit** (the `UpdateOppSL.*` lines are audit-level)
- The roles need the permissions under **Roles and permissions** below.
- **1.1.0:** the email is sent as the chosen sender (Me, the sales rep or the project engineer) and
  logged on the customer and the opportunity (`relatedRecords`), so the role must be able to send email
  and read **Employee** records (`firstname`, `lastname`, `entityid`, `email`, `phone`, `isinactive`,
  `custentity_employee_photo_link`) and the customer's `email`. `N/cache` needs no setup. No new script
  parameters.
- **Account checks (done for 1.1.0, 1 Oct 2026):** no workflow or user event script runs on **Message**
  records; every rep's employee record has an email address and a phone number. Sandbox may redirect
  outgoing email, which hides real-recipient bugs — test recipients should be your own addresses.
- **1.2.1 — new script parameter (create it BEFORE uploading 1.2.x; the deployment is already Released
  to the sales roles):**
  - Script record › Parameters › New: ID `custscript_nuheat_updbtn_mode` (enter `_nuheat_updbtn_mode`;
    NetSuite adds `custscript`), Label **Give us an update button: OFF, ADMIN or ALL**, Type
    **Free-Form Text**, no default.
  - On `customdeploy_nuheat_update_opp_sl` › Parameters: leave it **empty (= OFF)** in Production until
    the dashboard go-live and team training. `ADMIN` = the Administrator role only (Steve's testing);
    `ALL` = everyone. Anything else, or an unreadable value, is OFF (logged at debug).
  - OFF gives exactly the 1.1.1 email section; the customer lookup reads only `email`.
- **1.3.0 — the v2 email design (needs library 1.4.0, uploaded first):** not behind the switch — once
  uploaded, every "Write an email" from every rep uses the new design (logo, purple band, hero, sender
  card, teal footer; no "Best wishes" sign-off). No new parameters or permissions. Previews:
  `docs/email-previews/`. Send Quote's email is unchanged (byte-identical; Send Quote needs no redeploy).
- **1.3.1 — the "Your project" box (needs library 1.4.1):** the role must be able to read the
  opportunity's `title`, `custbody_opp_site_adress`, `custbody_build_stage` and `custbody_opp_del_date`
  (one extra lookup when an email is sent). No new parameters.
- **1.3.2 (needs library 1.4.2):** the box reads only `custbody_build_stage` and `custbody_opp_del_date`.
  When a save changes the build stage, the email reads the stage options (one record load, 10 units).
- **1.3.3 (library 1.4.2, unchanged):** the box reads `tranid`, `title` and `custbody_opp_site_adress` again
  (for its title) as well as the stage and the date — the same one lookup.

#### 2f-3. Create order Suitelet (new in Create order 1.0.0)
- **Name:** Nu-Heat Create Order
- **Script File:** `SuiteScripts/NuHeat/2026 Quote/nuheat_create_order_sl.js`
- **Script ID:** `customscript_nuheat_create_order_sl` · **Deployment ID:** `customdeploy_nuheat_create_order_sl`
- **Deployment:** Released, Audience = the sales roles, **Log Level Audit**. Released is safe before go-live:
  the `ORDER_MODE` setting keeps it switched off.
- **No script parameters are created for Create order** — not on this Suitelet and not on the Opportunity UE
  (amendment 1). Every setting is a row of the customer dashboard's settings record, **Customer Dashboard
  Settings** (`customrecord_cdb_setting`): Name = the key, `custrecord_cdb_setting_value` = the value. One switch,
  `ORDER_MODE`, drives both the button and the page. Add the `ORDER_*` rows (the two dashboard rows already exist);
  look up each ID in the target environment and never copy Sandbox IDs to Production. Exactly **one active row
  per key** — two active rows make that key missing.

| Key (row Name) | Value | Empty, missing, duplicate or invalid means |
|---|---|---|
| `ORDER_MODE` | `OFF` / `ADMIN` / `ALL` (case-insensitive). **ADMIN** for Sandbox testing, **ALL** at go-live | OFF: no button, and the page refuses |
| `ORDER_SO_FORM` | id: **NH Sales Order (2026)** (Customization › Forms › Transaction Forms) | the page refuses: "ORDER_SO_FORM is not set in Customer Dashboard Settings." |
| `ORDER_RECORD_STATUS` | id: **Awaiting Design Info** in the Record Status (`custbody_finance_status`) list | the page refuses, naming the key |
| `NEEDINFO_SUBSTATUS` | **existing dashboard row** (idlist) — its **first** id is the default sub-status (expected: Awaiting Design Info) | the opportunity's current sub-status is pre-selected |
| `ORDER_SUBSTATUS_OPTIONS` | idlist: the sub-statuses reps may choose, in display order (Steve to choose) | every option of the field |
| `ORDER_OPP_STATUS` | id: the Won status, **if** Steve decides the page sets it | the status isn't written |
| `ORDER_PROJTYPE_MAP` | JSON `{"<quote type id>":"<project type id>"}`, one entry per `custbody_quote_type` value | no inference; the rep chooses |
| `ORDER_PROJTYPE_MIXED` | id: **UFH & Renewables** in `customlist_bund_proj_type` | no "mixed" inference |
| `PREPAY_TERMS` | **existing dashboard row** (idlist; `9`) — the same value the dashboard uses | no deposit shown |
| `ORDER_PARENT_OPP_FIELD` | field ID of the opportunity field holding a parent opportunity, if there is one | the order log's parent is this opportunity |
| `ORDER_EMAIL_TEMPLATES` | idlist: the email template internal IDs offered in the email section's one "Confirmation email template" select, in display order (Steve: `3198,4186,3182,4185,3185`). **FreeMarker templates only** — a legacy CRMSDK template can't be merged | the email switch is shown disabled: "No confirmation templates are set up (ORDER_EMAIL_TEMPLATES)." |

- **After changing `ORDER_MODE`**, the button can take **up to 5 minutes** to appear or disappear (the UE caches the
  value); the page itself reads the record on every request.

#### 2g. Opportunity User Event
- **Name:** Nu-Heat Opportunity UE
- **Script File:** `SuiteScripts/NuHeat/2026 Quote/nuheat_opportunity_ue.js`
- **Deployment:**
  - ID: `customdeploy_nuheat_opportunity_ue`
  - Applies To: Opportunity
  - Event Types: Before Load
  - Status: Released

#### 2h. Opportunity Client Script
- **Name:** Nu-Heat Opportunity CS
- **Script File:** `SuiteScripts/NuHeat/2026 Quote/nuheat_opportunity_cs.js`
- **Deployment:**
  - ID: `customdeploy_nuheat_opportunity_cs`
  - Applies To: Opportunity
  - Status: Released

> **Note:** `nuheat_send_quote_cs.js` does NOT need a separate script record. From Send Quote SL 2.0.0 it is **not attached at all** (the page has its own inline script); it stays in the repository for reference.
>
> **Send Quote SL deployment Log Level must be Audit or Debug** — the `SendQuoteSL.OppUpdate`, `SendQuoteSL.Forecast` and `SendQuoteSL.Redirect` lines are audit-level.

- [ ] **Set both Suitelet deployments (Send Quote, Update Opportunity) to Released, Audience = the sales
      roles, Log Level Audit.**

### Roles and permissions (Update Opportunity / Send Quote)

Learned in Production, 29 Sep 2026, when account managers hit errors. Fixed for **NH Account Manager**;
**any other role that uses these pages needs the same.** A missing permission usually shows as an empty
dropdown or list, not an error on screen — check the Execution Log for **Permission Violation**.

- **Deployment status Released.** The Update Opportunity (and Send Quote) Suitelet deployment must be
  **Released**. On **Testing** it runs only for the deployment's owner; everyone else sees "That Suitelet
  is invalid, disabled, or no longer exists".
- **Lists › Custom Lists: View.** Without it the Call Title dropdown is empty — the
  `customlist_nh_call_title` search fails with a Permission Violation.
- **View on the Objection Type custom record** (`customrecord_nh_objection_type`). The record uses
  "Use Permission List", so a role not on its list cannot read the types and the objection picker is empty.
- **Create/Edit on Customer Objection** (`customrecord_nh_objection`). Without it the objections do not
  save (U9's amber banner).
- **Create on Phone Call** (Lists › Calls, or the equivalent Activities permission).
- **Edit on Opportunity** and **Edit on Estimate** — Estimate for the forecast flags.

Verify with TESTING_GUIDE **U24** (as a non-admin sales role).

**Create order (1.2.0) also needs, for every role that uses it (start with NH Account Manager):**
- **View on the Customer Dashboard Settings record** (`customrecord_cdb_setting`). **Without it the button never
  shows and the page refuses** ("Create order can’t run: its settings can’t be read."); the log shows
  `ORDER_SETTINGS_UNAVAILABLE`. (A button already cached by another user can show for up to 5 minutes; the page
  still refuses.)
- **Sales Order: Create** (Transactions), and **Estimate: View** — the transform reads the Estimate.
- **Create on the Order Log custom record** (`customrecord_order_log`) — check its permission list.
- **Opportunity: Edit** (already needed for Update Opportunity).
- **Lists › Custom Lists: View** (project type, order authority) and **Lists › Employees: View** (the rep select).
- *(1.2.0, the confirmation email)* **Email templates: View** (Lists › Email Template / Setup › Company › Templates — the `emailtemplate` search and `render.mergeEmail`) and permission to send email. Without them the email switch is disabled ("The confirmation templates could not be read.") or the emails fail, logged under `CreateOrderSL.Email`.
- **Test as NH Account Manager, not Administrator** (TESTING_GUIDE O12): Administrator hides every one of these,
  the settings record's permission included.

### Step 3: Verify Folder Permissions

1. Navigate to **Documents > Files > SuiteScripts > NuHeat > Quote HTML Files**
2. Click "Edit" on the folder
3. Ensure **"Available Without Login"** is checked ✅
4. Save

### Step 4: Verify the File Cabinet Folder ID for this environment

> ### ⚠️ FOLDER IDs ARE ENVIRONMENT-SPECIFIC AND LIVE IN THREE FILES
>
> | Environment | Folder ID |
> |---|---|
> | **Production** | `26895192` |
> | **Sandbox (472052_SB1)** | `21719365` |
>
> The value is hardcoded in **three** files, and **all three must agree**:
>
> | File | Constant | Line | Role |
> |---|---|---|---|
> | `nuheat_quote_suitelet.js` | `QUOTE_HTML_FOLDER_ID` | ~:105 | **writes** quote HTML |
> | `nuheat_master_proposal.js` | `FOLDER_ID` | ~:225 | **writes** proposal HTML |
> | `nuheat_quote_viewer_sl.js` | `QUOTE_HTML_FOLDER_ID` | ~:60 | **searches** for the latest file |
>
> Miss one and the writers and the searcher point at different folders: generation succeeds, the
> record gets a URL, and the proxy URL then 404s or serves a stale file. A wrong ID surfaces as
> `Invalid folder reference key <id>` in the Execution Log.
>
> ⚠️ **The repository holds the Production values.** Sandbox copies are hand-edited directly in the
> File Cabinet and are never committed, so a Sandbox File Cabinet file and its repository
> counterpart legitimately differ on this one line.
>
> **When deploying to Production, upload the repository version of each file.** Never upload a copy
> downloaded from the Sandbox File Cabinet — it carries the Sandbox folder ID.

Checklist:

- [ ] Confirm which environment you are deploying to
- [ ] `nuheat_quote_suitelet.js` — `QUOTE_HTML_FOLDER_ID` matches that environment
- [ ] `nuheat_master_proposal.js` — `FOLDER_ID` matches that environment
- [ ] `nuheat_quote_viewer_sl.js` — `QUOTE_HTML_FOLDER_ID` matches that environment
- [ ] All three re-uploaded if any was changed

---

## 3. Post-Deployment Verification

### 3.1 Individual Quote Generation

- [ ] Open an Estimate record
- [ ] Verify "Regen quote" button appears
- [ ] Click "Regen quote" — success dialog with URL appears
- [ ] Click URL — quote page opens correctly
- [ ] `custbody_test_new_quote` field is populated
- [ ] URL is a proxy URL (contains `scriptlet.nl?script=`)
- [ ] Open URL in incognito/private window — works without login
- [ ] Check Script Execution Log — no errors

### 3.2 Auto-Generation

- [ ] Edit an Estimate and Save
- [ ] `custbody_test_new_quote` is populated automatically
- [ ] Open URL — shows latest data
- [ ] Check Script Execution Log for UE v4.0.9 audit entries

### 3.3 URL Stability

- [ ] Note the URL from `custbody_test_new_quote`
- [ ] Click "Regen quote" again
- [ ] Verify the URL has NOT changed
- [ ] Open the same URL — shows updated content

### 3.4 Quote Viewer Diagnostic

- [ ] Open Quote Viewer URL with `?diag=1` appended
- [ ] Verify JSON response with script info
- [ ] Confirm `deploymentId` matches expected value

### 3.5 Master Proposal

- [ ] Open an Opportunity with linked Estimates
- [ ] Click "Send Quote" button
- [ ] Send Quote selection page loads with quotes listed
- [ ] Select quotes, choose Main/Alternative
- [ ] Click "Preview" — proposal opens in new tab
- [ ] Click "Generate" — proposal saved successfully

### 3.6 Mobile Responsiveness

- [ ] Open a quote URL on a mobile device (or browser DevTools responsive mode)
- [ ] Header shows phone number only (email hidden)
- [ ] Content stacks vertically
- [ ] Product images are full-width
- [ ] "Print quote" button works

### 3.7 Print/PDF

- [ ] Open a quote page
- [ ] Click "Print quote" button
- [ ] Browser print dialog appears
- [ ] Save as PDF — layout is correct

---

## 4. Rollback Procedures

### 4.1 Quick Rollback — Disable Proxy URLs

If proxy URLs cause permissions errors:

1. Edit `nuheat_quote_ue.js`: Change `USE_PROXY_URL = true` to `false`
2. Edit `nuheat_quote_suitelet.js`: Change `shouldUseProxy` default to `false`
3. Re-upload both scripts

### 4.2 Full Rollback — Revert Scripts

1. Download the previous version scripts from File Cabinet version history
2. Upload previous versions to File Cabinet
3. Verify deployment settings haven't changed

### 4.3 Emergency — Disable Scripts

If scripts are causing errors on Estimate saves:

1. Go to **Customization > Scripting > Script Deployments**
2. Find `customdeploy_nuheat_quote_ue`
3. Change Status from "Released" to "Not Scheduled" / uncheck "Deployed"
4. This stops auto-generation without removing the script

---

## 5. Production vs Sandbox Differences

### Configuration Differences

| Setting | Sandbox | Production |
|---------|---------|------------|
| Account ID | 472052_SB1 | TBD |
| Domain | 472052-sb1.extforms.netsuite.com | TBD |
| Folder ID | 21719365 | 26895192 |
| Viewer Script ID | 3286 | **Will differ** |
| Viewer Deploy ID | 1 | **Will differ** |
| Log Level | Debug | Audit (recommended) |

### Pre-Production Steps

- [ ] Confirm the `Quote HTML Files` folder exists in the Production File Cabinet (ID `26895192`)
- [ ] Confirm all three files carry the Production folder ID (see Step 4)
- [ ] Note all script/deployment internal IDs after creation
- [ ] Update `custscript_viewer_script_id` and `custscript_viewer_deploy_id` parameters
- [ ] Set log levels to Audit (not Debug) for performance

### Post-Production Verification

- [ ] Run all verification checks from Section 3
- [ ] Monitor Script Execution Log for first 24 hours
- [ ] Verify file sizes in File Cabinet are reasonable
- [ ] Confirm email sending works (if applicable)

---

*End of Deployment Checklist*
