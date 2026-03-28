# Nu-Heat Quote System — Deployment Checklist

**Version:** 2.0.0  
**Last Updated:** 28 March 2026  
**Applies to:** Full system deployment (all 10 scripts)

---

## Table of Contents

1. [Pre-Deployment Checklist](#1-pre-deployment-checklist)
2. [Deployment Steps](#2-deployment-steps)
3. [Post-Deployment Verification](#3-post-deployment-verification)
4. [Rollback Procedures](#4-rollback-procedures)
5. [Production vs Sandbox Differences](#5-production-vs-sandbox-differences)

---

## 1. Pre-Deployment Checklist

### 1.1 Script Readiness

- [ ] All scripts are at their target versions:

| Script | File | Target Version |
|--------|------|---------------|
| Quote Suitelet | `nuheat_quote_suitelet.js` | v4.3.53 |
| Quote UE | `nuheat_quote_ue.js` | v4.0.9 |
| Quote CS | `nuheat_quote_cs.js` | v4.0.6 |
| Quote Viewer | `nuheat_quote_viewer_sl.js` | v1.1.0 |
| Scheduled Script | `nuheat_quote_generator_ss.js` | v1.0.0 |
| Master Proposal | `nuheat_master_proposal.js` | v1.6.2 |
| Send Quote SL | `nuheat_send_quote_sl.js` | v1.4.9 |
| Send Quote CS | `nuheat_send_quote_cs.js` | v1.1.1 |
| Opportunity UE | `nuheat_opportunity_ue.js` | v1.0.0 |
| Opportunity CS | `nuheat_opportunity_cs.js` | v1.0.0 |

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

- [ ] Folder `SuiteScripts > NuHeat` exists
- [ ] Folder `SuiteScripts > NuHeat > Quote HTML Files` exists
- [ ] Quote HTML Files folder ID is `21719365` (or update in scripts if different)
- [ ] Quote HTML Files folder has "Available Without Login" = ✅

### 1.4 Environment

- [ ] Target environment identified (Sandbox / Production)
- [ ] Administrator access confirmed
- [ ] Backup plan documented

---

## 2. Deployment Steps

### Step 1: Upload Scripts to File Cabinet

1. Navigate to **Documents > Files > SuiteScripts > NuHeat**
2. Upload all 10 scripts from `src/`:
   - `nuheat_quote_suitelet.js`
   - `nuheat_quote_ue.js`
   - `nuheat_quote_cs.js`
   - `nuheat_quote_viewer_sl.js`
   - `nuheat_quote_generator_ss.js`
   - `nuheat_master_proposal.js`
   - `nuheat_send_quote_sl.js`
   - `nuheat_send_quote_cs.js`
   - `nuheat_opportunity_ue.js`
   - `nuheat_opportunity_cs.js`
3. If updating existing files, select "Replace" when prompted

### Step 2: Create Script Records

Navigate to **Customization > Scripting > Scripts > New** for each:

#### 2a. Quote Suitelet
- **Name:** Nu-Heat Quote Page Suitelet
- **Script File:** `SuiteScripts/NuHeat/nuheat_quote_suitelet.js`
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
- **Script File:** `SuiteScripts/NuHeat/nuheat_quote_ue.js`
- **Deployment:**
  - ID: `customdeploy_nuheat_quote_ue`
  - Applies To: Estimate
  - Event Types: Before Load, After Submit
  - Status: Released

#### 2c. Quote Client Script
- **Name:** Nu-Heat Quote CS
- **Script File:** `SuiteScripts/NuHeat/nuheat_quote_cs.js`
- **Deployment:**
  - ID: `customdeploy_nuheat_quote_cs`
  - Applies To: Estimate
  - Status: Released

#### 2d. Quote Viewer Suitelet ⚠️ CRITICAL
- **Name:** Nu-Heat Quote Viewer
- **Script File:** `SuiteScripts/NuHeat/nuheat_quote_viewer_sl.js`
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
- **Script File:** `SuiteScripts/NuHeat/nuheat_quote_generator_ss.js`
- **Deployment:**
  - ID: `customdeploy_nuheat_quote_gen_ss`
  - Status: Released
- **Parameters:**
  - `custscript_nuheat_gen_quote_id` (Free-Form Text)

#### 2f. Send Quote Suitelet
- **Name:** Nu-Heat Send Quote Selection
- **Script File:** `SuiteScripts/NuHeat/nuheat_send_quote_sl.js`
- **Deployment:**
  - ID: `customdeploy_nuheat_send_quote_sl`
  - Status: Released

#### 2g. Opportunity User Event
- **Name:** Nu-Heat Opportunity UE
- **Script File:** `SuiteScripts/NuHeat/nuheat_opportunity_ue.js`
- **Deployment:**
  - ID: `customdeploy_nuheat_opportunity_ue`
  - Applies To: Opportunity
  - Event Types: Before Load
  - Status: Released

#### 2h. Opportunity Client Script
- **Name:** Nu-Heat Opportunity CS
- **Script File:** `SuiteScripts/NuHeat/nuheat_opportunity_cs.js`
- **Deployment:**
  - ID: `customdeploy_nuheat_opportunity_cs`
  - Applies To: Opportunity
  - Status: Released

> **Note:** `nuheat_send_quote_cs.js` does NOT need a separate script record — it's loaded inline by the Send Quote Suitelet.

### Step 3: Verify Folder Permissions

1. Navigate to **Documents > Files > SuiteScripts > NuHeat > Quote HTML Files**
2. Click "Edit" on the folder
3. Ensure **"Available Without Login"** is checked ✅
4. Save

### Step 4: Update Script Parameters (if Folder ID differs)

If the File Cabinet folder ID is different from `21719365`:
1. Update `QUOTE_HTML_FOLDER_ID` in `nuheat_quote_suitelet.js`
2. Update `QUOTE_HTML_FOLDER_ID` in `nuheat_quote_viewer_sl.js`
3. Re-upload both scripts

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
| Folder ID | 21719365 | **Must be created/identified** |
| Viewer Script ID | 3286 | **Will differ** |
| Viewer Deploy ID | 1 | **Will differ** |
| Log Level | Debug | Audit (recommended) |

### Pre-Production Steps

- [ ] Create `Quote HTML Files` folder in Production File Cabinet
- [ ] Note the Production folder ID
- [ ] Update `QUOTE_HTML_FOLDER_ID` in scripts if different
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
