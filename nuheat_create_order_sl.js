/**
 * @NApiVersion 2.1
 * @NScriptType Suitelet
 * @NModuleScope SameAccount
 *
 * @name        Nu-Heat Create Order Suitelet
 * @description "Create order" page, opened from the Opportunity (VIEW) button: 1 Quotes (tick the open
 *              quotes to order, with units and partner commission) → 2 Order details (project type,
 *              order authority, the rep taking the order) → 3 Update the opportunity (delivery date, next
 *              contact, build stage, sub-status, value proposition) → 4 Confirmation email (switch, off).
 *              Creates one Sales Order and one order log per ticked quote (nuheat_order_lib.convertQuotes, 1.3.2),
 *              sends the confirmation only when switched on, writes the Opportunity LAST, and returns to
 *              the Opportunity with the result banner (nuheat_opportunity_ue.js, nsqs=ord).
 * @version     1.5.0
 * @author      Nu-Heat Development
 *
 * Script ID:      customscript_nuheat_create_order_sl
 * Deployment ID:  customdeploy_nuheat_create_order_sl
 *
 * ⚠️ DEPLOYMENT: nuheat_opp_update_lib.js and nuheat_order_lib.js (1.1.0) must be uploaded to
 *    SuiteScripts/NuHeat/2026 Quote/ BEFORE this script, or it fails at load time. NO script parameters:
 *    every setting is a row of the customer dashboard's settings record (1.1.0). ORDER_MODE missing = OFF.
 *
 * SETTINGS (customrecord_cdb_setting rows: Name = the key, custrecord_cdb_setting_value = the value;
 * empty, missing, duplicate or invalid means the right-hand column):
 *   ORDER_MODE               OFF / ADMIN / ALL   → OFF: the page refuses, and the Opportunity UE shows no button
 *   ORDER_SO_FORM            id                  → refuse to run, naming the key
 *   ORDER_RECORD_STATUS      id                  → refuse to run, naming the key
 *   NEEDINFO_SUBSTATUS       idlist (dashboard)  → the FIRST id is the default sub-status; else the current one
 *   ORDER_SUBSTATUS_OPTIONS  idlist              → every option of the field
 *   ORDER_OPP_STATUS         id                  → the status is not written
 *   ORDER_PROJTYPE_MAP       JSON {qt: pt}       → no inference; the rep must choose
 *   ORDER_PROJTYPE_MIXED     id                  → no "mixed" inference
 *   PREPAY_TERMS             idlist (dashboard)  → no deposit is shown anywhere
 *   ORDER_PARENT_OPP_FIELD   field ID            → the order log's parent opportunity = this one
 *   ORDER_EMAIL_TEMPLATES    idlist (1.2.0)      → the email switch is disabled ("No confirmation templates are set up")
 *   ORDER_BUS_AMOUNTS        JSON {elig: £} 1.4.0 → no BUS voucher is ever deducted on the page (display only)
 *   ORDER_DEPOSIT_PCT        number 0–100 1.4.0  → no deposit is shown
 *   The settings search failing (no View permission on the record, no record type) → the page refuses:
 *   "Create order can’t run: its settings can’t be read. Ask an administrator."
 *
 * CHANGELOG v1.5.0 (amendment 8 — the checkout layout; the BUS voucher against the heat pump order; Steve 7 Oct, option B):
 *   - LAYOUT (desktop ≥ 1001px): [1 Choose quotes | Order summary panel, 380px, sticky], sections 2–4 under the quotes
 *     (the panel's column runs the page's height so its button stays in view). No footer on desktop. ≤ 1000px: the
 *     panel below the quotes; a slim sticky footer "Customer pays £x" + a button that presses the panel's.
 *   - Cards: ticked = two lines (~96–116px): tick · number · the full description (≤ 2 lines) · meta; price inc VAT;
 *     for the voucher order "BUS voucher −£…" (green) and "Customer pays £…"; line 2 Units · Commission [%|£] "= £…"
 *     (replaces 1.3.1's fixed-width "→ £…"). The ex VAT moves to the summary. Unticked = one faint dashed line, its
 *     inputs hidden and disabled; ticking expands it.
 *   - The panel: per order (name · type, inc VAT; the voucher order's green "BUS voucher · Standard −£…" and "Customer
 *     pays"); "Orders total £… inc VAT (VAT £…)"; Customer pays (large); "Deposit due now · 20%" (up front, > £0);
 *     "Balance before delivery"; the full-value note (when a voucher applies); "Create N orders" + the reason.
 *   - THE VOUCHER goes against ONE heat pump order (orderLib.pickVoucherOrder: the first, page order), capped at its
 *     total; nothing carried. Customer pays = the sum per order; deposit = pct × that. Display only, as 1.4.0.
 *   - ONE summary function: orderLib.buildOrderSummary (pure) — inlined into the page script from its own source
 *     (orderLib.SUMMARY_SCRIPT) and called by the CreateOrderSL.BUS log. Amendment 7's single totals line is gone.
 *
 * CHANGELOG v1.4.0 (amendment 7 — BUS voucher in the totals (display only) and the BUS eligibility write-back, Steve 7 Oct):
 *   - BUS IS DISPLAY ONLY: the quote and the SO keep their full value; nothing BUS is written to any transaction
 *     (the voucher is taken off at invoice, by hand). The SO and the order log are byte-for-byte as before.
 *   - Section 2: "BUS eligibility" (optional) — the opportunity's custbody_bus_eligibility options (getSelectOptions)
 *     + "Not set", pre-selected with the current value; beside it "Voucher £7,500" / "No voucher" (ORDER_BUS_AMOUNTS).
 *   - The voucher applies when at least one ticked quote is a heat pump quote — its quote type (customrecord16) has
 *     custrecord_qt_requires_installer_certs ticked; one search when the page loads (only when ORDER_BUS_AMOUNTS is
 *     set). One voucher per submission. Eligible with no heat pump quote → "BUS voucher: applies when a heat pump
 *     quote is ordered", no deduction.
 *   - Totals (section 1 and the footer, live): "2 orders · £… inc VAT", then "BUS voucher (Standard) −£7,500.00 ·
 *     Customer pays £… · Deposit (20%) £…"; customer pays = max(0, total − voucher); deposit = round(pays × % / 100,
 *     2), up-front customers only, ORDER_DEPOSIT_PCT set only. The ex VAT line stays the full ex VAT. The note
 *     "Display only. The orders keep their full value; the voucher is taken off at invoice."
 *   - REMOVED: the per-row "Deposit £…" (the Estimate's custbody_deposit) and data-deposit.
 *   - Server: a posted eligibility must be blank or an option; written in the final opportunity write (the second
 *     submitFields) only when changed (banner key bus_elig, UE 1.5.4). CreateOrderSL.BUS logs the figures (audit).
 *
 * CHANGELOG v1.3.2 (amendment 6 — several quotes when NetSuite closes the siblings, Steve's Production tests 7 Oct):
 *   - FIXED: with two quotes ticked only the first converted; the second was refused "is not an open quote on this
 *     opportunity" — saving the first SO makes NetSuite mark the opportunity's other open quotes Processed.
 *   - The conversion is orderLib.convertQuotes (lib 1.3.0): phase 1 checks and transforms EVERY quote (lock,
 *     re-check, duplicate guard, transform, fields, total check) before any save; any refusal → nothing saved,
 *     every lock released, the page "Nothing was created: …" with each reason (all-or-nothing, as validation).
 *     Phase 2 saves each; a failed save never stops the others ("Not created: …"; NetSuite's message in the log).
 *   - The duplicate guard now refuses the whole submission (it was per quote) — it is part of phase 1.
 *   - Governance: checked ONCE before the token, for the worst case of the ticked count (usageNeeded =
 *     MIN_USAGE_TO_CONVERT 100 + 62 per quote + 40 with the email); short → refused before any write.
 *
 * CHANGELOG v1.3.1 (amendment 5 — the commission £ inline; the attachment note, Steve 7 Oct):
 *   - The worked-out commission is an inline read-only figure to the right of the commission input, in the same
 *     row ("→ £64.33"): the inputs' size (14px), the muted colour, a fixed width (CALC_W) so the columns line up.
 *     Shown only while % is selected (hidden for £, keeping its space); blank or 0 → "→ £0.00"; an invalid entry
 *     shows nothing (the footer says why). Display only, as before: the server (order lib 1.2.1) is unchanged.
 *   - Desktop: the commission column is 232 + CALC_W px (198 was already too narrow for label, toggle and input);
 *     the description's minimum 120 → 100px so the row still fits at 1001px. Rows stay ~56px.
 *   - Phones: the toggle, input and figure stay together on one line (.nsq-comm-box); at ≤ 480px the inputs use
 *     the row's full width; under ~375px the "Comm." label goes above them.
 *   - The attachments note reads "Attached to the confirmation email."
 *
 * CHANGELOG v1.3.0 (amendment 4 — one confirmation email per submission, on the opportunity, Steve 6 Oct):
 *   - The per-row template select (custpage_tpl_<id>) and its column are gone: the rows are back to compact.
 *   - Section 4 has ONE "Confirmation email template" select (custpage_email_tpl), required while the email is
 *     on, options ORDER_EMAIL_TEMPLATES in order. The server accepts only an offered template, before any write.
 *   - After the orders are created (at least one), ONE email: render.mergeEmail(templateId, entity and recipient
 *     = the customer, transactionId = the OPPORTUNITY) + email.send filed on the opportunity
 *     (relatedRecords.transactionId = the opportunity, entityId = the customer), with the attachments.
 *     Sent even when only some quotes converted. Redirect: nsqe = sent | fail (nsqef and nsqen dropped).
 *   - Governance: one merge + one send per submission (no per-order reserve); MAX_QUOTES back to 8.
 *
 * CHANGELOG v1.2.1 (amendment 3 — partner commission always written as £, 6 Oct 2026):
 *   - The page shows the worked-out £ under the commission input as soon as a % is entered ("= £154.39",
 *     from the row's ex VAT). Display only: the server (order lib 1.2.1) recalculates from the new SO.
 *   - A blank commission is "no commission": the order lib writes £0 (the £ field is always written).
 *
 * CHANGELOG v1.2.0 (amendment 2 — Steve's first Production test, 6 Oct 2026):
 *   - FIXED: the sales rep list was empty — "invalid search criteria: issalesrep". The Employee SEARCH filter
 *     is `salesrep` (issalesrep is the record field). The opportunity's own rep is always offered first and
 *     pre-selected (ticked Sales Rep or not); a failed search offers that rep alone. The POST no longer looks the
 *     rep up (issalesrep isn't a lookupFields column either): it rebuilds the same list and accepts only a rep in it.
 *   - CHANGED: compact quote rows — one line (~56px) on desktop, fixed columns so rows line up; the inputs wrap
 *     to a second line on phones; an unticked row greys its inputs at the same height.
 *   - ADDED: live totals of the ticked quotes in section 1 and the footer ("2 orders · £… inc VAT · Deposit £…",
 *     deposit only for up-front customers; ex VAT beneath). Display only: the server never reads a total.
 *   - CHANGED: the confirmation email. ORDER_EMAIL_TEMPLATES (idlist, a new settings row) names the templates
 *     offered; each ticked row chooses one (required while the email is on). One email per Sales Order:
 *     render.mergeEmail (customer, the SO) + email.send filed against the SO and the customer, with the optional
 *     attachments (≤ 5 files, ≤ 10 MB, none empty; request.files, never saved). One failure never stops the
 *     others (nsqef). The free-text message is gone (the template owns the wording); lib 1.2.0 removed
 *     orderConfirmationEmail. The page's form is multipart/form-data.
 *   - CHANGED: on the POST the listing needs no extras search (no deposit is used any more).
 *   - CHANGED: MAX_QUOTES 8 → 6; each conversion reserves room for the emails still to send.
 *
 * CHANGELOG v1.1.0 (amendment 1 — settings from the settings record, 6 Oct 2026):
 *   - The ten custscript_nuheat_co_* parameters are gone. readConfig() reads the rows above through
 *     orderLib.loadOrderSettings (one search per request, ~10 units; found / missing keys logged at audit
 *     as CreateOrderSL.Settings, never the values). Parsing and validation unchanged; only the source.
 *   - NEEDINFO_SUBSTATUS (the dashboard's, an idlist) replaces _substatus: its first id is the default.
 *   - The refusal for a missing form / Record Status names the settings key.
 *
 * CHANGELOG v1.0.0 (Create order, part 1 — 6 Oct 2026):
 *   - New page. The same look as Update Opportunity (lib.buildHeaderHTML, numbered cards, sticky footer,
 *     save guard). newSaveToken / claimToken / releaseToken are COPIES of Update Opportunity's, with
 *     their own cache — nuheat_update_opp_sl.js and nuheat_opp_update_lib.js are deliberately untouched
 *     (a later tidy-up, AI_AGENT_CONTEXT).
 *
 * DECISIONS (see AI_AGENT_CONTEXT — do not reverse without Steve):
 *   - Validate everything BEFORE any write. A validation failure re-renders the page with every entry
 *     restored; nothing is written and the save token is not claimed.
 *   - The server rebuilds from IDs: ticked quotes must be OPEN Estimates on THIS opportunity (the header
 *     search), every list value must be an option read at run time, the rep must be an active sales rep.
 *     No posted price, total or ID is trusted.
 *   - Order (1.3.2): validate → usage check → token → orderLib.convertQuotes: phase 1 (duplicate guard, then per
 *     quote lock → re-check → transform → fields → total check; any refusal = nothing saved) → phase 2 (each SO
 *     saved → total check → order log; each in its own try/catch) → the email (only if switched on; one per submission, filed on the opportunity) → the
 *     Opportunity LAST. Nothing created → no email, no Opportunity write, the token is released.
 *   - THE EXCEPTION TO THE SUB-STATUS RULE (Steve, 6 Oct): this page writes custbody_opportunity_sub_status,
 *     as the rep chooses it (default Awaiting Design Info). Send Quote and Update Opportunity still never do.
 *   - The Opportunity write: lib.updateFields (delivery date, next contact, build stage — the posted key
 *     list is cut to those three on the server), then ONE more submitFields for the sub-status, the
 *     value proposition (each only when changed) and entitystatus (only when its parameter is set):
 *     lib.updateFields takes no extra values. enableSourcing only when the status changes.
 *   - Redirect parameters are codes only.
 */

define([
    'N/ui/serverWidget',
    'N/search',
    'N/record',
    'N/log',
    'N/redirect',
    'N/runtime',
    'N/cache',
    'N/url',
    'N/render',
    'N/email',
    './nuheat_opp_update_lib',
    './nuheat_order_lib'
], function (serverWidget, search, record, log, redirect, runtime, cache, url, render, email, lib, orderLib) {

    'use strict';

    var SCRIPT_VERSION = '1.5.0';

    /** Page rules for the shared update fields: Next contact must end up set (D3, as Update Opportunity). */
    var RULES = { required: ['next_contact'], logKey: 'CreateOrderSL.OppUpdate' };

    /** The library fields this page shows and writes. Anything else posted is dropped on the server. */
    var UPDATE_KEYS = ['del_date', 'next_contact', 'build_stage'];

    // ─── Account objects (script IDs only) ────────────────────────────────────────

    var OPP_FIELDS = {
        subStatus: 'custbody_opportunity_sub_status',
        valueProp: 'custbody_value_proposition',
        busElig:   'custbody_bus_eligibility'   // 1.4.0: list customlist_bus_eligibility; options read at run time
    };

    /**
     * 1.4.0: the quote type record and its "requires installer certs" checkbox — a ticked quote whose type has it
     * ticked is a heat pump quote, so the BUS voucher applies (Steve, 7 Oct: the readiness rule already in use).
     * ⚠️ Sandbox check S22: the field ID is not referenced anywhere else in this repository; a failed search is
     * logged at error with the raw message and means "no heat pump quote" (no deduction shown).
     */
    var QUOTE_TYPE = { record: 'customrecord16', hpField: 'custrecord_qt_requires_installer_certs' };
    var LISTS = {
        projType: 'customlist_bund_proj_type',
        auth:     'customlist_order_auth'
    };

    /**
     * 1.1.0: the settings rows (customrecord_cdb_setting, Name = the key) — no script parameters.
     * NEEDINFO_SUBSTATUS and PREPAY_TERMS are the dashboard's own keys, shared.
     */
    var S = {
        mode:            'ORDER_MODE',
        soForm:          'ORDER_SO_FORM',
        recordStatus:    'ORDER_RECORD_STATUS',
        subStatus:       'NEEDINFO_SUBSTATUS',
        subStatusOpts:   'ORDER_SUBSTATUS_OPTIONS',
        oppStatus:       'ORDER_OPP_STATUS',
        projTypeMap:     'ORDER_PROJTYPE_MAP',
        projTypeMixed:   'ORDER_PROJTYPE_MIXED',
        prepayTerms:     'PREPAY_TERMS',
        parentOppField:  'ORDER_PARENT_OPP_FIELD',
        emailTemplates:  'ORDER_EMAIL_TEMPLATES',  // 1.2.0: the confirmation templates offered, in display order
        busAmounts:      'ORDER_BUS_AMOUNTS',      // 1.4.0: JSON {"<eligibility id>": "<£ amount>"}; display only
        depositPct:      'ORDER_DEPOSIT_PCT'       // 1.4.0: number 0–100; display only
    };
    var SETTING_KEYS = Object.keys(S).map(function (k) { return S[k]; });

    var ADMIN_ROLE_ID = 'administrator';   // the standard Administrator role's script ID (roleId)

    /**
     * Governance. A quote costs about 50 units to convert (60 with the fallback total search). 1.3.0: the email
     * is ONE render.mergeEmail + ONE email.send per submission, counted as 20 + 20 (the conservative figures;
     * Sandbox check). 8 quotes with the email on come to ~520 units, so MAX_QUOTES is 8 again (1.2.0: 6).
     * 1.3.2: every quote is prepared before any save (orderLib.convertQuotes), so the check is made ONCE, up
     * front, for the worst case of the ticked count (usageNeeded); a submission that wouldn't fit is refused
     * before any write. The total per quote is unchanged.
     */
    var MAX_QUOTES = 8;               // per submission (1.2.0: 6; 1.3.0: back to 8 — one email per submission)
    var QUOTE_UNITS = 62;             // 1.3.2: worst case per quote — lock 2 + release 1 + re-check 10 + transform 10 + save 20
                                      //        + lookupFields 1 + fallback total search 10 + parent lookup 1 + order log 6 = 61, +1
    var MIN_USAGE_TO_CONVERT = 100;   // 1.3.2: once per submission — the duplicate search (10) + the opportunity writes (20) +
                                      //        slack (70); was per quote: a conversion (60) + the opportunity writes (20) + slack (20)
    var EMAIL_UNITS = 40;             // 1.3.0: the ONE mergeEmail + email.send, reserved once while the email is on
    var UNITS_MAX = 999999;

    /** 1.2.0: the attachments — the page splits the picker into these hidden file inputs. */
    var ATTACH = { max: 5, maxBytes: 10 * 1024 * 1024, prefix: 'custpage_att_' };

    var ID_RE    = /^\d{1,12}$/;
    var FIELD_RE = /^[a-z][a-z0-9_]{2,60}$/;

    var escapeHtml = lib.escapeHtml;

    /** D18a (Update Opportunity): who the email can be from. The page posts only the code. */
    var FROM_ROLES = {
        rep: { field: 'salesrep',    label: 'Sales rep' },
        pe:  { field: 'custbody_pe', label: 'Project engineer' }
    };

    var COPY = {
        title:        'Create order',
        noQuotes:     'No open quotes to order',
        expired:      'Expired',
        pageNote:     'Sent from you, with your contact details. Replies come to you.',
        pageNoteOtherStart: 'Sent as ',
        pageNoteOtherEnd:   ', with their contact details. Replies go to them.',
        modeOff:      'Create order is switched off.',
        modeAdmin:    'Create order is only available to administrators at the moment.',
        noSettings:   'Create order can’t run: its settings can’t be read. Ask an administrator.',
        noTemplates:  'No confirmation templates are set up (ORDER_EMAIL_TEMPLATES).',
        badTemplates: 'The confirmation templates could not be read.',
        attachNote:   'Attached to the confirmation email.',
        busNote:      'The orders keep their full value. The BUS voucher is taken off at invoice.',   // 1.5.0 (1.4.0: "Display only. …")
        busPending:   'BUS voucher applies when a heat pump quote is ordered',                       // 1.5.0
        busCapped:    '(capped at the order value)',                                                  // 1.5.0
        tplLabel:     'Confirmation email template'
    };

    // ─── Save guard (copied from Update Opportunity 1.3.3, D25 — own cache) ───────

    var GUARD_CACHE = 'nh_create_order_save_guard';
    var GUARD_TTL   = 3600;   // seconds
    var TOKEN_RE    = /^[A-Za-z0-9_-]{8,80}$/;

    /** D25: unique, not secret — the user, the time and a random part. */
    function newSaveToken() {
        var user = String(runtime.getCurrentUser().id || '0').replace(/[^A-Za-z0-9_-]/g, '');
        return 'o' + user + '-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 12);
    }

    /**
     * Claims the page's one-time token. { dup: true } if it was already used (nothing may be written);
     * { key } when claimed; { key: null } with no usable token or no cache — the save goes ahead without
     * the guard, logged.
     */
    function claimToken(token, opportunityId) {
        if (!TOKEN_RE.test(token)) {
            log.audit('CreateOrderSL.Guard', 'Opportunity ' + opportunityId + ' — no save token; created without the guard');
            return { dup: false, key: null };
        }
        try {
            var c = cache.getCache({ name: GUARD_CACHE, scope: cache.Scope.PRIVATE });
            if (c.get({ key: token })) {
                log.audit('CreateOrderSL.Guard', 'Opportunity ' + opportunityId + ' — duplicate submission (token already used); nothing written');
                return { dup: true, key: null };
            }
            c.put({ key: token, value: String(opportunityId), ttl: GUARD_TTL });
            return { dup: false, key: token };
        } catch (e) {
            log.error('CreateOrderSL.Guard', 'Opportunity ' + opportunityId + ' — cache unavailable (' + e.message + '); created without the guard');
            return { dup: false, key: null };
        }
    }

    /** Frees a claimed token (nothing was created — the rep may retry). */
    function releaseToken(key, opportunityId) {
        if (!key) return;
        try {
            cache.getCache({ name: GUARD_CACHE, scope: cache.Scope.PRIVATE }).remove({ key: key });
            log.audit('CreateOrderSL.Guard', 'Opportunity ' + opportunityId + ' — token released (nothing was created)');
        } catch (e) {
            log.error('CreateOrderSL.Guard', 'Opportunity ' + opportunityId + ' — token could not be released: ' + e.message);
        }
    }

    // ─── Configuration (1.1.0: the customer dashboard's settings record) ─────────

    /** The settings value for a key: trimmed, '' when missing (missing, blank, duplicate, unreadable). */
    function setting(settings, key) {
        return Object.prototype.hasOwnProperty.call(settings.values, key) ? String(settings.values[key]).trim() : '';
    }

    /** 1.4.0: ORDER_BUS_AMOUNTS — { "<id>": amount > 0 }. Unreadable → {} (no voucher anywhere; logged). */
    function amountMapSetting(settings, key) {
        var raw = setting(settings, key);
        if (!raw) return {};
        try {
            var m = JSON.parse(raw);
            if (!m || typeof m !== 'object' || Array.isArray(m)) throw new Error('not an object');
            var out = {};
            Object.keys(m).forEach(function (k) {
                var v = String(m[k] === null || m[k] === undefined ? '' : m[k]).trim();
                if (!ID_RE.test(String(k).trim()) || !/^\d{1,7}(\.\d{1,2})?$/.test(v) || !(parseFloat(v) > 0)) {
                    throw new Error('"' + k + '" → "' + v + '" is not id → amount');
                }
                out[String(k).trim()] = parseFloat(v);
            });
            return out;
        } catch (e) {
            log.error('CreateOrderSL.Config', key + ' could not be read (' + e.message + '); no BUS voucher is shown');
            return {};
        }
    }

    /** 1.4.0: ORDER_DEPOSIT_PCT — a number 0–100, else null (no deposit line; logged when not blank). */
    function pctSetting(settings, key) {
        var v = setting(settings, key);
        if (!v) return null;
        if (!/^\d{1,3}(\.\d{1,2})?$/.test(v) || parseFloat(v) > 100) {
            log.error('CreateOrderSL.Config', key + ' = "' + v.substring(0, 20) + '" is not a number from 0 to 100; no deposit is shown');
            return null;
        }
        return parseFloat(v);
    }

    /** An id setting: digits, else '' (logged). */
    function idSetting(settings, key) {
        var v = setting(settings, key);
        if (v && !ID_RE.test(v)) {
            log.error('CreateOrderSL.Config', key + ' = "' + v.substring(0, 40) + '" is not an internal ID; treated as empty');
            return '';
        }
        return v;
    }

    /** An idlist setting: comma-separated ids, de-duplicated; anything else dropped (logged). */
    function idListSetting(settings, key) {
        var out = [];
        setting(settings, key).split(/[,\s]+/).forEach(function (v) {
            if (!v) return;
            if (!ID_RE.test(v)) { log.error('CreateOrderSL.Config', key + ': "' + v.substring(0, 20) + '" is not an internal ID; dropped'); return; }
            if (out.indexOf(v) === -1) out.push(v);
        });
        return out;
    }

    /** { "<quote type id>": "<project type id>" } — any bad JSON or entry → {} (no inference), logged. */
    function mapSetting(settings, key) {
        var raw = setting(settings, key);
        if (!raw) return {};
        try {
            var m = JSON.parse(raw);
            if (!m || typeof m !== 'object' || Array.isArray(m)) throw new Error('not an object');
            var out = {};
            Object.keys(m).forEach(function (k) {
                var v = String(m[k] === null || m[k] === undefined ? '' : m[k]).trim();
                if (!ID_RE.test(String(k).trim()) || !ID_RE.test(v)) throw new Error('"' + k + '" → "' + v + '" is not id → id');
                out[String(k).trim()] = v;
            });
            return out;
        } catch (e) {
            log.error('CreateOrderSL.Config', key + ' could not be read (' + e.message + '); no project type inference');
            return {};
        }
    }

    /**
     * The whole configuration, once per request — ONE search of customrecord_cdb_setting
     * (orderLib.loadOrderSettings, ~10 units). errors[] (shown on the page, and the page refuses): no
     * ORDER_SO_FORM, no ORDER_RECORD_STATUS. unavailable: the settings search failed (the page refuses).
     * The mode: empty, unknown, duplicate or unreadable → OFF.
     */
    function readConfig() {
        var settings = orderLib.loadOrderSettings(SETTING_KEYS, 'CreateOrderSL.Settings');
        var cfg = {
            mode:            'OFF',
            allowed:         false,
            unavailable:     !!settings.failed,
            soForm:          idSetting(settings, S.soForm),
            recordStatus:    idSetting(settings, S.recordStatus),
            subStatus:       idListSetting(settings, S.subStatus)[0] || '',   // the FIRST id of NEEDINFO_SUBSTATUS
            subStatusOpts:   idListSetting(settings, S.subStatusOpts),
            oppStatus:       idSetting(settings, S.oppStatus),
            projTypeMap:     mapSetting(settings, S.projTypeMap),
            projTypeMixed:   idSetting(settings, S.projTypeMixed),
            prepayTerms:     idListSetting(settings, S.prepayTerms),
            parentOppField:  '',
            emailTemplates:  idListSetting(settings, S.emailTemplates),   // 1.2.0
            busAmounts:      amountMapSetting(settings, S.busAmounts),   // 1.4.0
            depositPct:      pctSetting(settings, S.depositPct),         // 1.4.0
            errors:          []
        };
        var m = setting(settings, S.mode).toUpperCase();
        if (m !== '' && m !== 'OFF' && m !== 'ADMIN' && m !== 'ALL') {
            log.debug('CreateOrderSL.Config', 'Unknown ' + S.mode + ' "' + m.substring(0, 40) + '"; OFF');
            m = 'OFF';
        }
        cfg.mode = m || 'OFF';
        if (cfg.mode === 'ALL') cfg.allowed = true;
        else if (cfg.mode === 'ADMIN') {
            var role = '';
            try { role = String(runtime.getCurrentUser().roleId || ''); } catch (e) { role = ''; }
            cfg.allowed = role === ADMIN_ROLE_ID;
        }
        var pf = setting(settings, S.parentOppField);
        if (pf && !FIELD_RE.test(pf)) log.error('CreateOrderSL.Config', S.parentOppField + ' = "' + pf.substring(0, 60) + '" is not a field ID; treated as empty');
        else cfg.parentOppField = pf;
        if (!cfg.soForm) cfg.errors.push(S.soForm + ' is not set in Customer Dashboard Settings.');
        if (!cfg.recordStatus) cfg.errors.push(S.recordStatus + ' is not set in Customer Dashboard Settings.');
        return cfg;
    }

    // ─── Entry point ──────────────────────────────────────────────────────────────

    function onRequest(context) {
        log.audit('CreateOrderSL.onRequest', 'Method: ' + context.request.method + ' | Version: ' + SCRIPT_VERSION +
            ' | order lib ' + orderLib.LIB_VERSION + ' | opp lib ' + lib.LIB_VERSION);
        try {
            var cfg = readConfig();
            if (cfg.unavailable) {   // 1.1.0: no settings, no page
                showErrorPage(context, COPY.noSettings);
                return;
            }
            if (!cfg.allowed) {
                log.audit('CreateOrderSL.Mode', 'Refused: mode ' + cfg.mode);
                showErrorPage(context, cfg.mode === 'ADMIN' ? COPY.modeAdmin : COPY.modeOff);
                return;
            }
            if (cfg.errors.length) {
                log.error('CreateOrderSL.Config', 'Refused: ' + cfg.errors.join(' '));
                showErrorPage(context, 'Create order can’t run: ' + cfg.errors.join(' ') + ' Ask an administrator.');
                return;
            }
            if (context.request.method === 'GET') {
                var opportunityId = String(context.request.parameters.opportunityId || '');
                if (!ID_RE.test(opportunityId)) {
                    showErrorPage(context, 'No Opportunity ID provided. Please open this page from an Opportunity record.');
                    return;
                }
                renderPage(context, opportunityId, cfg, null, null);
            } else {
                handleCreate(context, cfg);
            }
        } catch (e) {
            log.error('CreateOrderSL.onRequest', 'Unhandled error: ' + e.message + '\n' + e.stack);
            showErrorPage(context, e.message);
        }
    }

    function showErrorPage(context, message) {
        lib.showErrorPage(context, message, 'Create order — Error');
    }

    // ─── Options read at run time ─────────────────────────────────────────────────

    /** A select field's options on a DYNAMIC Opportunity: [{ id, text }], blanks dropped. [] when unavailable (logged). */
    function fieldOptions(oppRecord, fieldId) {
        try {
            var f = oppRecord.getField({ fieldId: fieldId });
            if (!f) { log.error('CreateOrderSL.Lists', fieldId + ' is not on the Opportunity'); return []; }
            return (f.getSelectOptions() || []).map(function (o) { return { id: String(o.value), text: lib.cleanText(o.text) }; })
                .filter(function (o) { return o.id !== ''; });
        } catch (e) {
            log.error('CreateOrderSL.Lists', fieldId + ' options could not be read: ' + e.message);
            return [];
        }
    }

    /** The sub-statuses the rep may choose: the parameter's ids in its order (those that are options), else all. */
    function subStatusOffered(oppRecord, cfg) {
        var all = fieldOptions(oppRecord, OPP_FIELDS.subStatus);
        if (!cfg.subStatusOpts.length) return all;
        var out = [];
        cfg.subStatusOpts.forEach(function (id) {
            var o = all.filter(function (x) { return x.id === id; })[0];
            if (o) out.push(o);
            else log.error('CreateOrderSL.Config', S.subStatusOpts + ': ' + id + ' is not a sub-status option; not offered');
        });
        return out;
    }

    /**
     * 1.4.0: the BUS eligibility options — the opportunity field's own (getSelectOptions), plus the current value
     * when it isn't among them (an inactive option), so pre-selecting it never clears it. Options unreadable → [].
     */
    function busOptions(oppRecord) {
        var opts = fieldOptions(oppRecord, OPP_FIELDS.busElig);
        var cur = currentValue(oppRecord, OPP_FIELDS.busElig);
        if (opts.length && cur && !hasOption(opts, cur)) {   // unreadable options → [] (no select, nothing written)
            var text = '';
            try { text = lib.cleanText(oppRecord.getText({ fieldId: OPP_FIELDS.busElig }) || ''); } catch (e) { text = ''; }
            opts.push({ id: cur, text: text || cur });
        }
        return opts;
    }

    /**
     * 1.4.0: which quote types are heat pump types (QUOTE_TYPE.hpField ticked) — ONE search on the quote type
     * record for the given type IDs. { ids: { typeId: true }, error }. A failure → no heat pump type (logged).
     */
    function heatPumpTypes(typeIds) {
        var out = { ids: {}, error: '' };
        var ids = (typeIds || []).map(String).filter(function (id, i, a) { return ID_RE.test(id) && a.indexOf(id) === i; });
        if (!ids.length) return out;
        try {
            search.create({
                type:    QUOTE_TYPE.record,
                filters: [['internalid', 'anyof', ids]],
                columns: ['internalid', QUOTE_TYPE.hpField]
            }).run().each(function (r) {
                var v = r.getValue({ name: QUOTE_TYPE.hpField });
                if (v === true || v === 'T') out.ids[String(r.getValue({ name: 'internalid' }) || r.id)] = true;
                return true;
            });
        } catch (e) {
            out.error = e.message || String(e);
            log.error('CreateOrderSL.BUS', QUOTE_TYPE.record + '.' + QUOTE_TYPE.hpField + ' could not be read for types ' + ids.join(',') +
                ' (' + out.error + '); no quote counts as a heat pump quote, so no BUS voucher is deducted');
        }
        return out;
    }

    function hasOption(options, id) {
        return options.some(function (o) { return o.id === String(id); });
    }

    function currentValue(oppRecord, fieldId) {
        try {
            var v = oppRecord.getValue({ fieldId: fieldId });
            return v === null || v === undefined ? '' : String(v);
        } catch (e) {
            return '';
        }
    }

    /**
     * The reps the page offers (1.2.0): active Employees ticked Sales Rep — the Employee SEARCH filter is
     * `salesrep` (`issalesrep` is the record field ID and an invalid search criterion) — by name, with the
     * opportunity's own sales rep always first when it isn't among them (even when not ticked Sales Rep).
     * A failed search → the opportunity's rep alone (logged). The POST rebuilds this list and accepts
     * only a rep in it.
     * @returns {Array<{id: string, text: string}>}
     */
    function loadSalesReps(oppRecord) {
        var out = [];
        try {
            search.create({
                type:    search.Type.EMPLOYEE,
                filters: [['salesrep', 'is', 'T'], 'AND', ['isinactive', 'is', 'F']],
                columns: [search.createColumn({ name: 'entityid', sort: search.Sort.ASC }), 'internalid']
            }).run().each(function (r) {
                out.push({ id: String(r.getValue({ name: 'internalid' })), text: lib.cleanText(r.getValue({ name: 'entityid' })) });
                return true;
            });
        } catch (e) {
            out = [];
            log.error('CreateOrderSL.Lists', 'Sales reps could not be read: ' + e.message + ' — offering the opportunity’s sales rep only');
        }
        var repId = currentValue(oppRecord, 'salesrep');
        if (ID_RE.test(repId) && !hasOption(out, repId)) {
            var text = '';
            try { text = lib.cleanText(oppRecord.getText({ fieldId: 'salesrep' })); } catch (e) { text = ''; }
            out.unshift({ id: repId, text: text || ('Employee ' + repId) });
        }
        return out;
    }

    /**
     * 1.2.0: the confirmation templates — ORDER_EMAIL_TEMPLATES in its order, named from one search of
     * emailtemplate. Inactive or missing templates are left out (logged). { list, error }.
     */
    function loadTemplates(ids) {
        var out = { list: [], error: '' };
        if (!ids.length) return out;
        var byId = {};
        try {
            search.create({
                type:    'emailtemplate',
                filters: [['internalid', 'anyof', ids]],
                columns: ['internalid', 'name', 'isinactive']
            }).run().each(function (r) {
                byId[String(r.getValue({ name: 'internalid' }))] = { name: lib.cleanText(r.getValue({ name: 'name' })), inactive: isTrue(r.getValue({ name: 'isinactive' })) };
                return true;
            });
        } catch (e) {
            out.error = e.message || String(e);
            log.error('CreateOrderSL.Lists', 'Email templates could not be read: ' + out.error);
            return out;
        }
        ids.forEach(function (id) {
            var t = byId[id];
            if (!t) log.error('CreateOrderSL.Config', S.emailTemplates + ': template ' + id + ' not found; not offered');
            else if (t.inactive) log.error('CreateOrderSL.Config', S.emailTemplates + ': template ' + id + ' is inactive; not offered');
            else out.list.push({ id: id, text: t.name || ('Template ' + id) });
        });
        return out;
    }

    function isTrue(v) { return v === true || v === 'T' || v === 'true'; }

    /** True if the employee is ACTIVE and has a usable email address (one lookupFields; false on any error). */
    function employeeHasEmail(employeeId) {
        try {
            var f = search.lookupFields({ type: search.Type.EMPLOYEE, id: employeeId, columns: ['email', 'isinactive'] }) || {};
            if (isTrue(f.isinactive)) return false;
            return lib.EMAIL_RE.test(lib.lookupText(f.email).trim());
        } catch (e) {
            log.debug('CreateOrderSL.Email', 'Employee ' + employeeId + ' email check failed: ' + e.message);
            return false;
        }
    }

    /** Update Opportunity's From options (D18a): Me, then the sales rep and project engineer when set and emailable. */
    function senderOptions(oppRecord) {
        var user = runtime.getCurrentUser();
        var opts = [{ code: 'me', id: String(user.id || ''), label: 'Me' + (user.name ? ' (' + user.name + ')' : '') }];
        ['rep', 'pe'].forEach(function (code) {
            var role = FROM_ROLES[code];
            var id = '', name = '';
            try {
                id   = String(oppRecord.getValue({ fieldId: role.field }) || '');
                name = oppRecord.getText({ fieldId: role.field }) || '';
            } catch (e) {
                log.debug('CreateOrderSL.Email', role.field + ' could not be read: ' + e.message);
            }
            if (!id || opts.some(function (o) { return o.id === id; })) return;
            if (!employeeHasEmail(id)) return;
            opts.push({ code: code, id: id, label: role.label + (name ? ' (' + name + ')' : '') });
        });
        return opts;
    }

    function senderNote(opt) {
        return (!opt || opt.code === 'me') ? COPY.pageNote : COPY.pageNoteOtherStart + opt.label + COPY.pageNoteOtherEnd;
    }

    function estimateUrl(id) {
        try {
            return url.resolveRecord({ recordType: 'estimate', recordId: id, isEditMode: false });
        } catch (e) {
            return '';
        }
    }

    /** The posted parameters with the update-field key list cut to UPDATE_KEYS (nothing else can be written). */
    function updateParams(params) {
        var out = {};
        Object.keys(params || {}).forEach(function (k) { out[k] = params[k]; });
        out[lib.KEYS_FIELD] = String((params || {})[lib.KEYS_FIELD] || '').split(',')
            .map(function (k) { return k.trim(); })
            .filter(function (k) { return UPDATE_KEYS.indexOf(k) !== -1; }).join(',');
        return out;
    }

    // ─── GET ──────────────────────────────────────────────────────────────────────

    function renderPage(context, opportunityId, cfg, restore, error) {
        var page = lib.loadOppPageBase(opportunityId, { logPrefix: 'CreateOrderSL', customerEmail: true, customerColumns: ['terms'] });
        if (page.loadError) {
            showErrorPage(context, page.loadError);
            return;
        }
        var opp = page.oppRecord;
        page.oppUrl       = lib.resolveOppUrl(opportunityId, 'CreateOrderSL');
        page.updateFields = lib.prepareFields(opp, opportunityId, RULES).filter(function (p) { return UPDATE_KEYS.indexOf(p.def.key) !== -1; });
        page.upFront      = orderLib.paysUpFront(firstId(page.customerFields.terms), cfg.prepayTerms);
        var listing       = orderLib.listOrderableQuotes(opportunityId, { logKey: 'CreateOrderSL.List' });
        page.quotes       = listing.quotes;
        page.listError    = listing.error;
        page.projTypes    = orderLib.loadListOptions(LISTS.projType, 'CreateOrderSL.Lists');
        page.auths        = orderLib.loadListOptions(LISTS.auth, 'CreateOrderSL.Lists');
        page.reps         = loadSalesReps(opp);
        page.repDefault   = currentValue(opp, 'salesrep');
        page.subStatuses  = subStatusOffered(opp, cfg);
        page.subStatusCur = currentValue(opp, OPP_FIELDS.subStatus);
        page.subStatusDefault = (cfg.subStatus && hasOption(page.subStatuses, cfg.subStatus)) ? cfg.subStatus
            : (hasOption(page.subStatuses, page.subStatusCur) ? page.subStatusCur : '');
        if (cfg.subStatus && !hasOption(page.subStatuses, cfg.subStatus)) {
            log.error('CreateOrderSL.Config', S.subStatus + ' (first id) = ' + cfg.subStatus + ' is not an offered sub-status; the current value is pre-selected');
        }
        page.valueProps   = fieldOptions(opp, OPP_FIELDS.valueProp);
        page.valuePropCur = currentValue(opp, OPP_FIELDS.valueProp);
        page.busOpts      = busOptions(opp);                                 // 1.4.0
        page.busCur       = currentValue(opp, OPP_FIELDS.busElig);
        page.busAmounts   = cfg.busAmounts;
        page.depositPct   = cfg.depositPct;
        // 1.4.0: heat pump quote types — one search, only when a voucher can apply at all
        page.hpTypes      = Object.keys(cfg.busAmounts).length ? heatPumpTypes(page.quotes.map(function (q) { return q.quoteTypeId; })).ids : {};
        page.senders      = senderOptions(opp);
        var tpl           = loadTemplates(cfg.emailTemplates);   // 1.2.0
        page.templates    = tpl.list;
        page.emailBlocked = !cfg.emailTemplates.length ? COPY.noTemplates : (tpl.error ? COPY.badTemplates : (!tpl.list.length ? COPY.noTemplates : ''));
        page.mixed        = cfg.projTypeMixed;
        page.projTypeMap  = cfg.projTypeMap;
        page.saveToken    = (restore && TOKEN_RE.test(restore.token || '')) ? restore.token : newSaveToken();
        page.today        = new Date();

        var form = serverWidget.createForm({ title: COPY.title });
        var body = form.addField({ id: 'custpage_page', type: serverWidget.FieldType.INLINEHTML, label: ' ' });
        body.defaultValue = buildPageHTML(page, restore, error);
        context.response.writePage(form);
    }

    /** A lookupFields select value ([{ value }] or a plain value) as its id. */
    function firstId(v) {
        if (Array.isArray(v)) return v.length ? String(v[0].value || '') : '';
        return v === null || v === undefined ? '' : String(v);
    }

    function optionsHTML(options, selected, blankLabel) {
        return '<option value="">' + escapeHtml(blankLabel || '') + '</option>' + options.map(function (o) {
            return '<option value="' + escapeHtml(o.id) + '"' + (o.id === String(selected || '') ? ' selected' : '') + '>' + escapeHtml(o.text) + '</option>';
        }).join('');
    }

    function selectHTML(id, name, label, options, selected, extraAttrs) {
        return '<div class="nsq-field"><label class="nsq-label" for="' + id + '">' + escapeHtml(label) +
            ' <span class="nsq-req" aria-hidden="true">*</span></label>' +
            '<select id="' + id + '" name="' + name + '" class="nsq-input"' + (extraAttrs || '') + '>' +
            optionsHTML(options, selected, '') + '</select></div>';
    }

    /**
     * 1.4.0: BUS eligibility — optional; the opportunity's options + "Not set"; each option carries the voucher it
     * means (data-voucher, from ORDER_BUS_AMOUNTS) and a short label; the voucher shown read-only beside it.
     * No options readable → no select (nothing posted, nothing written).
     */
    function busFieldHTML(page, selected) {
        if (!page.busOpts.length) return '';
        var opts = '<option value="" data-voucher="0" data-short="">Not set</option>' + page.busOpts.map(function (o) {
            var amt = Object.prototype.hasOwnProperty.call(page.busAmounts, o.id) ? page.busAmounts[o.id] : 0;
            return '<option value="' + escapeHtml(o.id) + '" data-voucher="' + amt + '" data-short="' + escapeHtml(busShort(o.text)) + '"' +
                (o.id === String(selected || '') ? ' selected' : '') + '>' + escapeHtml(o.text) + '</option>';
        }).join('');
        return '<div class="nsq-field"><label class="nsq-label" for="nsq-bus">BUS eligibility <span class="nsq-opt">(optional)</span></label>' +
            '<div class="nsq-bus-row"><select id="nsq-bus" name="custpage_bus_elig" class="nsq-input">' + opts + '</select>' +
            '<span class="nsq-bus-voucher" id="nsq-bus-voucher" aria-live="polite"></span></div></div>';
    }

    /** 1.4.0: "Standard BUS (£7500)" → "Standard" for the totals line; anything else as it is. */
    function busShort(text) {
        var t = String(text || '').replace(/\s*\([^)]*\)\s*$/, '').replace(/\s*\bBUS\b\s*/i, ' ').trim();
        return t || String(text || '');
    }

    function switchHTML(id, label, on, offId) {
        return '<label class="nsq-switch"><input type="checkbox" id="' + id + '"' + (on ? ' checked' : '') + '> ' + escapeHtml(label) + '</label>' +
            '<span class="nsq-off" id="' + offId + '"' + (on ? ' hidden' : '') + '>Off</span>';
    }

    /**
     * 1.5.0 (amendment 8, the checkout layout): one card per quote.
     *   Ticked (~96px): line 1 — the tick; the number (a link) · the full description (up to 2 lines); the meta line
     *   (type · date created) beneath; on the right the price inc VAT in bold and, for the order the BUS voucher goes
     *   against, "BUS voucher −£…" (green) and "Customer pays £…" (filled live by the page). Line 2, under the text:
     *   Units · Commission [%|£] [ ] "= £…" (% only). The ex VAT figure is in the summary, not on the card.
     *   Unticked: one faint line (dashed border): tick · number · description · type · date · price; its inputs are
     *   hidden (and disabled, so they never post) until it's ticked.
     * The figures sit in data- attributes for the live summary only — the server never reads them.
     */
    function quoteRowHTML(q, page, r) {
        var sel = (r.sel || []).indexOf(q.id) !== -1;
        var restoring = !!r.sel;
        var units = restoring && r.units[q.id] !== undefined ? r.units[q.id] : q.units;
        var kind = restoring && r.commKind[q.id] === 'amt' ? 'amt' : 'pct';
        var comm = restoring && r.comm[q.id] !== undefined ? r.comm[q.id] : '';
        var pt = Object.prototype.hasOwnProperty.call(page.projTypeMap, q.quoteTypeId) ? page.projTypeMap[q.quoteTypeId] : '';
        var link = estimateUrl(q.id);
        var name = q.tranId || ('Quote ' + q.id);
        var text = q.description || q.title;
        var id = escapeHtml(q.id);
        var uid = 'nsq-units-' + q.id, cid = 'nsq-comm-' + q.id;
        var h = [];
        h.push('<div class="nsq-qrow' + (sel ? ' nsq-qrow-on' : '') + '" data-qid="' + id + '" data-tranid="' + escapeHtml(name) +
            '" data-total="' + escapeHtml(q.total === null ? '' : String(q.total)) + '" data-exvat="' + escapeHtml(q.exVat === null ? '' : String(q.exVat)) +
            '" data-hp="' + (page.hpTypes[q.quoteTypeId] ? '1' : '0') + '" data-type="' + escapeHtml(q.quoteTypeText || '') +
            '" data-projtype="' + escapeHtml(pt) + '">');
        h.push('<div class="nsq-qline">');
        h.push('<label class="nsq-qtick"><input type="checkbox" class="nsq-qsel" data-qid="' + id + '"' + (sel ? ' checked' : '') +
            ' aria-label="Order ' + escapeHtml(name) + '"></label>');
        var full = name + (text ? ' · ' + text : '');
        h.push('<div class="nsq-qtext"><div class="nsq-qmain" title="' + escapeHtml(full) + '">' +
            (link ? '<a href="' + escapeHtml(link) + '" target="_blank" rel="noopener">' + escapeHtml(name) + '</a>' : escapeHtml(name)) +
            (q.expired ? ' <span class="nsq-tag-exp">' + escapeHtml(COPY.expired) + '</span>' : '') +
            (text ? ' · ' + escapeHtml(text) : '') + '</div>');
        h.push('<div class="nsq-qmeta">' + [q.quoteTypeText, q.dateCreated].filter(function (x) { return x; }).map(escapeHtml).join(' · ') + '</div></div>');
        h.push('<div class="nsq-qprice"><strong>' + escapeHtml(q.total === null ? '—' : orderLib.money(q.total)) + '</strong>' +
            '<span class="nsq-qv" hidden></span><span class="nsq-qpays" hidden></span></div>');
        h.push('</div>');   // .nsq-qline
        h.push('<div class="nsq-qin"' + (sel ? '' : ' hidden') + '>');
        h.push('<label class="nsq-qf nsq-qf-units" for="' + uid + '"><span class="nsq-ql">Units</span>' +
            '<input type="text" inputmode="numeric" class="nsq-input nsq-units" id="' + uid + '" name="custpage_units_' + id +
            '" maxlength="6" autocomplete="off" value="' + escapeHtml(units) + '"' + (sel ? '' : ' disabled') + '></label>');
        h.push('<div class="nsq-qf nsq-qf-comm"><label class="nsq-ql" for="' + cid + '">Commission</label>' +
            '<span class="nsq-comm-box"><span class="nsq-seg-row" role="radiogroup" aria-label="Commission as">' +
            '<label class="nsq-seg"><input type="radio" class="nsq-comm-kind" name="custpage_comm_kind_' + id + '" value="pct"' + (kind === 'pct' ? ' checked' : '') + (sel ? '' : ' disabled') + '><span>%</span></label>' +
            '<label class="nsq-seg"><input type="radio" class="nsq-comm-kind" name="custpage_comm_kind_' + id + '" value="amt"' + (kind === 'amt' ? ' checked' : '') + (sel ? '' : ' disabled') + '><span>£</span></label>' +
            '</span><input type="text" inputmode="decimal" class="nsq-input nsq-comm" id="' + cid + '" name="custpage_comm_' + id +
            '" maxlength="12" autocomplete="off" value="' + escapeHtml(comm) + '"' + (sel ? '' : ' disabled') + '>' +
            '<span class="nsq-comm-calc" aria-live="polite"' + (kind === 'pct' ? '' : ' hidden') + '></span></span></div>');
        h.push('</div>');   // .nsq-qin
        h.push('</div>');
        return h.join('');
    }

    /**
     * 1.5.0: the Order summary panel (right column on desktop, sticky; below the quotes on a phone). Static shell —
     * the page fills it from orderLib.buildOrderSummary (inlined). Holds the primary button (#nsq-send), its reason
     * and the changes line the library's update() writes.
     */
    function summaryPanelHTML(page) {
        return '<aside class="nsq-co-side"><div class="nsq-panel" id="nsq-panel">' +
            '<h2 class="nsq-ph">Order summary</h2>' +
            '<div class="nsq-ps-orders" id="nsq-ps-orders" aria-live="polite"></div>' +
            '<p class="nsq-ps-pending" id="nsq-ps-pending" hidden>' + escapeHtml(COPY.busPending) + '</p>' +
            '<div class="nsq-ps-total" id="nsq-ps-total"></div>' +
            '<div class="nsq-ps-pays"><span>Customer pays</span><strong id="nsq-ps-pays">£0.00</strong></div>' +
            '<div class="nsq-ps-dep" id="nsq-ps-dep" hidden><span id="nsq-ps-dep-label"></span><strong id="nsq-ps-dep-amt"></strong></div>' +
            '<div class="nsq-ps-bal" id="nsq-ps-bal" hidden><span>Balance before delivery</span><span id="nsq-ps-bal-amt"></span></div>' +
            '<p class="nsq-ps-note" id="nsq-ps-note" hidden>' + escapeHtml(COPY.busNote) + '</p>' +
            '<button type="button" class="nsq-btn nsq-btn-primary nsq-ps-btn" id="nsq-send" disabled>Create orders</button>' +
            '<div class="nsq-reason nsq-ps-reason" id="nsq-reason"></div>' +
            '<div class="nsq-sum-sub nsq-ps-changes" id="nsq-sum-changes"></div>' +
            '<a class="nsq-btn nsq-btn-link nsq-ps-cancel" href="' + escapeHtml(page.oppUrl) + '">Cancel</a>' +
            '</div></aside>';
    }

    function buildPageHTML(page, restore, error) {
        var r = restore || {};
        var emailOn = !page.emailBlocked && (restore ? r.emailOn === true : false);   // off by default; never automatic
        var emailFresh = !restore || !emailOn;
        var h = [];
        h.push(lib.baseCss() + PAGE_CSS);
        h.push('<div id="nsq-root" class="nsq" data-opp-url="' + escapeHtml(page.oppUrl) + '" data-upfront="' + (page.upFront ? '1' : '0') +
            '" data-deposit-pct="' + (page.depositPct === null ? '' : String(page.depositPct)) + '">');
        h.push('<div class="nsq-wrap">');
        h.push(lib.buildHeaderHTML(page, COPY.title));
        if (error) h.push(lib.buildErrorAlertHTML(error.lead, error.message));

        h.push('<input type="hidden" name="custpage_opportunity_id" value="' + escapeHtml(page.opportunityId) + '">');
        h.push('<input type="hidden" name="custpage_q_sel" id="nsq-q-sel" value="">');
        h.push('<input type="hidden" name="custpage_email_on" id="nsq-email-on-val" value="' + (emailOn ? 'T' : 'F') + '">');
        h.push('<input type="hidden" name="custpage_save_token" value="' + escapeHtml(page.saveToken) + '">');

        // ── 1.5.0: the checkout layout — [section 1 | the summary panel] then sections 2–4 under section 1. On desktop
        // the panel's column runs the full height (sticky), so the button stays in view; on a phone it drops below
        // the quotes (grid areas). ──
        h.push('<div class="nsq-co"><div class="nsq-co-quotes">');
        h.push('<section class="nsq-card"><h2 class="nsq-h2"><span class="nsq-num">1</span>Choose quotes</h2>');
        if (page.listError) {
            h.push('<p class="nsq-help nsq-bad">The quotes could not be read. Please reload the page.</p>');
        } else if (!page.quotes.length) {
            h.push('<p class="nsq-help" id="nsq-no-quotes">' + escapeHtml(COPY.noQuotes) + '</p>');
        } else {
            h.push('<p class="nsq-help">Each ticked quote becomes its own order.</p>');
            page.quotes.forEach(function (q) { h.push(quoteRowHTML(q, page, r)); });
        }
        h.push('</section></div>');   // .nsq-co-quotes
        h.push(summaryPanelHTML(page));
        h.push('<div class="nsq-co-rest">');

        // ── 2 Order details ──
        h.push('<section class="nsq-card"><h2 class="nsq-h2"><span class="nsq-num">2</span>Order details</h2>');
        h.push('<p class="nsq-help">These apply to every order created now.</p><div class="nsq-upd-grid">');
        h.push(selectHTML('nsq-projtype', 'custpage_projtype', 'Project type', page.projTypes, r.projType || '',
            ' data-mixed="' + escapeHtml(page.mixed) + '"' + (r.projType ? ' data-touched="1"' : '')));
        h.push(selectHTML('nsq-auth', 'custpage_auth', 'Order authority', page.auths, r.auth || ''));
        h.push(selectHTML('nsq-rep', 'custpage_rep', 'Sales rep taking the order', page.reps, restore ? (r.rep || '') : page.repDefault));
        h.push(busFieldHTML(page, restore ? (r.busElig || '') : page.busCur));   // 1.4.0
        h.push('</div></section>');

        // ── 3 Update the opportunity ──
        h.push('<section class="nsq-card"><h2 class="nsq-h2"><span class="nsq-num">3</span>Update the opportunity</h2>');
        h.push('<div class="nsq-upd-grid">');
        page.updateFields.slice().sort(function (a, b) {
            return lib.DISPLAY_ORDER.indexOf(a.def.key) - lib.DISPLAY_ORDER.indexOf(b.def.key);
        }).forEach(function (p) {
            h.push(lib.buildUpdateFieldHTML(p, restore ? { upd: r.upd || {} } : null));
        });
        h.push(selectHTML('nsq-substatus', 'custpage_substatus', 'Sub-status', page.subStatuses, restore ? (r.subStatus || '') : page.subStatusDefault));
        h.push(selectHTML('nsq-valueprop', 'custpage_valueprop', 'Value proposition', page.valueProps, restore ? (r.valueProp || '') : page.valuePropCur));
        h.push('</div>');
        h.push('<input type="hidden" name="' + lib.KEYS_FIELD + '" value="' + escapeHtml(page.updateFields.map(function (p) { return p.def.key; }).join(',')) + '">');
        h.push('</section>');

        // ── 4 Confirmation email (1.2.0: a NetSuite template per order, chosen on each quote row) ──
        h.push('<section class="nsq-card"><h2 class="nsq-h2"><span class="nsq-num">4</span>Confirmation email' +
            '<label class="nsq-switch"><input type="checkbox" id="nsq-email-on"' + (emailOn ? ' checked' : '') + (page.emailBlocked ? ' disabled' : '') +
            '> Send the customer an order confirmation</label><span class="nsq-off" id="nsq-email-off"' + (emailOn ? ' hidden' : '') + '>Off</span></h2>');
        if (page.emailBlocked) h.push('<p class="nsq-help nsq-bad" id="nsq-email-why">' + escapeHtml(page.emailBlocked) + '</p>');
        h.push('<div id="nsq-email-body"' + (emailOn ? '' : ' hidden') + '>');
        h.push('<p class="nsq-help">One email to the customer for this opportunity, sent once the orders are created and filed on the opportunity.</p>');
        h.push('<div class="nsq-field"><label class="nsq-label" for="nsq-email-tpl">' + escapeHtml(COPY.tplLabel) + ' <span class="nsq-req" aria-hidden="true">*</span></label>' +
            '<select id="nsq-email-tpl" name="custpage_email_tpl" class="nsq-input">' + optionsHTML(page.templates, emailFresh ? '' : (r.emailTpl || ''), '') + '</select></div>');
        var defaultFrom = page.senders.some(function (o) { return o.code === 'rep'; }) ? 'rep' : 'me';
        var fromCode = (!emailFresh && page.senders.some(function (o) { return o.code === r.from; })) ? r.from : defaultFrom;
        var fromOpt = page.senders.filter(function (o) { return o.code === fromCode; })[0];
        h.push('<div class="nsq-field"><label class="nsq-label" for="nsq-email-from">From</label>' +
            '<select id="nsq-email-from" name="custpage_email_from" class="nsq-input">' +
            page.senders.map(function (o) {
                return '<option value="' + o.code + '"' + (o.code === fromCode ? ' selected' : '') + '>' + escapeHtml(o.label) + '</option>';
            }).join('') + '</select></div>');
        h.push(lib.buildRecipientsHTML(page.contacts, page.customerEmail, emailFresh ? { customer: !!page.customerEmail } : r.rcpt));
        // The picker posts nothing; beforeSubmit() copies each file into its own custpage_att_<n> input
        h.push('<div class="nsq-field"><label class="nsq-label" for="nsq-att">Attachments <span class="nsq-opt">(optional)</span></label>' +
            '<input type="file" id="nsq-att" class="nsq-att" multiple>' +
            '<p class="nsq-help" id="nsq-att-note">' + escapeHtml(COPY.attachNote) + (restore && emailOn ? ' Choose the files again: a page that comes back after a refusal can’t keep them.' : '') + '</p>' +
            [1, 2, 3, 4, 5].map(function (n) { return '<input type="file" name="' + ATTACH.prefix + n + '" class="nsq-att-slot" hidden>'; }).join('') + '</div>');
        h.push('<p class="nsq-help nsq-email-note" id="nsq-email-note" data-note-me="' + escapeHtml(COPY.pageNote) +
            '" data-note-pre="' + escapeHtml(COPY.pageNoteOtherStart) + '" data-note-post="' + escapeHtml(COPY.pageNoteOtherEnd) + '">' +
            escapeHtml(senderNote(fromOpt)) + '</p>');
        h.push('</div></section>');

        h.push('</div></div>'); // .nsq-co-rest, .nsq-co
        h.push('</div>'); // .nsq-wrap

        // ── 1.5.0: a slim sticky footer on phones and narrow screens only (the panel replaces it on desktop):
        // "Customer pays £x" (#nsq-sum-line, from summary()) and a button that presses #nsq-send ──
        h.push('<div class="nsq-footer nsq-footer-slim"><div class="nsq-footer-in">');
        h.push('<div class="nsq-sum"><div class="nsq-sum-main" id="nsq-sum-line"></div></div>');
        h.push('<button type="button" class="nsq-btn nsq-btn-primary" id="nsq-send-m" disabled>Create orders</button>');
        h.push('</div></div>');

        h.push('</div>'); // #nsq-root
        h.push('<script>' + lib.pageScript(lib.RECIPIENTS_SCRIPT + PAGE_PART) + '</script>');
        return h.join('');
    }

    var GREEN = '#1d6b3a';      // 1.5.0: the BUS voucher lines
    var TINT  = '#f6f1f7';      // 1.5.0: the deposit box (a tint of the accent)

    var PAGE_CSS = '<style>' +
        '.nsq-req{color:#a4262c;}' +
        '.nsq-bad{color:#a4262c;}' +
        '.nsq-opt{font-weight:400;color:' + lib.PAGE_COLORS.muted + ';font-size:14px;}' +
        '.nsq-help{color:' + lib.PAGE_COLORS.muted + ';font-size:14px;margin:0 0 8px;}' +
        '.nsq-switch{margin-left:auto;display:inline-flex;align-items:center;gap:6px;font-size:14px;font-weight:400;cursor:pointer;}' +
        '.nsq-switch input{width:18px;height:18px;}' +
        '.nsq-off{font-size:13px;font-weight:600;color:' + lib.PAGE_COLORS.muted + ';}' +
        '.nsq-tick{display:flex;align-items:center;gap:8px;min-height:36px;font-size:14px;cursor:pointer;}' +
        '.nsq-tick input{width:18px;height:18px;}' +
        '.nsq-tick-addr{color:' + lib.PAGE_COLORS.muted + ';}' +
        '.nsq-email-note{margin-top:12px;}' +
        // 1.5.0: the checkout layout. Desktop: [quotes | panel 380px] with sections 2–4 under the quotes; the panel's
        // column spans both rows and the panel is sticky. ≤ 1000px: one column — quotes, panel, sections 2–4.
        '.nsq-wrap{max-width:1240px;}' +
        '.nsq-co{display:grid;grid-template-columns:minmax(0,1fr) 380px;grid-template-rows:auto 1fr;grid-template-areas:"quotes side" "rest side";column-gap:20px;align-items:start;}' +
        '.nsq-co-quotes{grid-area:quotes;min-width:0;}.nsq-co-rest{grid-area:rest;min-width:0;}' +
        '.nsq-co-side{grid-area:side;align-self:stretch;min-width:0;}' +
        '.nsq-panel{position:sticky;top:16px;background:#fff;border:1px solid ' + lib.PAGE_COLORS.border + ';border-radius:10px;padding:20px;margin-bottom:16px;}' +
        '.nsq-ph{font-size:18px;margin:0 0 12px;color:' + lib.PAGE_COLORS.text + ';}' +
        '.nsq-ps-empty{color:' + lib.PAGE_COLORS.muted + ';font-size:14px;margin:0 0 4px;}' +
        '.nsq-ps-order{padding:8px 0;border-bottom:1px solid ' + lib.PAGE_COLORS.border + ';}' +
        '.nsq-ps-row{display:flex;justify-content:space-between;gap:12px;align-items:baseline;font-size:14px;}' +
        '.nsq-ps-row > span:first-child{min-width:0;overflow-wrap:anywhere;}.nsq-ps-row > :last-child{white-space:nowrap;}' +
        '.nsq-ps-head{font-weight:600;}' +
        '.nsq-ps-v{padding-left:14px;color:' + GREEN + ';font-size:13px;margin-top:2px;}' +
        '.nsq-ps-sub{padding-left:14px;color:' + lib.PAGE_COLORS.muted + ';font-size:13px;margin-top:2px;}' +
        '.nsq-ps-pending{font-size:12px;color:' + lib.PAGE_COLORS.muted + ';margin:8px 0 0;}' +
        '.nsq-ps-total{font-size:12px;color:' + lib.PAGE_COLORS.muted + ';padding:10px 0;border-bottom:1px solid ' + lib.PAGE_COLORS.border + ';}' +
        '.nsq-ps-pays{display:flex;justify-content:space-between;align-items:baseline;gap:12px;padding:12px 0 10px;font-weight:600;}' +
        '.nsq-ps-pays strong{font-size:24px;line-height:1.2;white-space:nowrap;}' +
        '.nsq-ps-dep{display:flex;justify-content:space-between;align-items:center;gap:12px;background:' + TINT + ';border:1px solid #e3d6e6;border-radius:8px;padding:10px 12px;font-size:14px;}' +
        '.nsq-ps-dep strong{font-size:16px;white-space:nowrap;}' +
        '.nsq-ps-bal{display:flex;justify-content:space-between;gap:12px;font-size:13px;color:' + lib.PAGE_COLORS.muted + ';padding:8px 2px 0;}' +
        '.nsq-ps-note{font-size:12px;color:' + lib.PAGE_COLORS.muted + ';margin:10px 0 0;}' +
        '.nsq-ps-btn{width:100%;justify-content:center;margin-top:14px;}' +
        '.nsq-ps-reason{display:block;font-size:13px;color:' + lib.PAGE_COLORS.muted + ';margin-top:8px;}' +
        '.nsq-ps-reason:empty,.nsq-ps-changes:empty{display:none;}.nsq-ps-changes{margin-top:6px;}' +
        '.nsq-ps-cancel{width:100%;justify-content:center;margin-top:6px;}' +
        '.nsq-ps-pending[hidden],.nsq-ps-dep[hidden],.nsq-ps-bal[hidden],.nsq-ps-note[hidden],.nsq-qin[hidden],.nsq-qv[hidden],.nsq-qpays[hidden]{display:none;}' +
        // the quote cards
        '.nsq-qrow{border:1px solid ' + lib.PAGE_COLORS.border + ';border-radius:8px;margin-bottom:8px;padding:8px 12px;background:#fff;}' +
        '.nsq-qrow-on{border-color:' + lib.PAGE_COLORS.accent + ';box-shadow:inset 0 0 0 1px ' + lib.PAGE_COLORS.accent + ';min-height:96px;}' +
        '.nsq-qline{display:flex;align-items:flex-start;gap:10px;}' +
        '.nsq-qtick{flex:0 0 24px;display:flex;align-items:center;min-height:22px;}' +
        '.nsq-qtick input{width:20px;height:20px;margin:0;cursor:pointer;}' +
        '.nsq-qtext{flex:1 1 auto;min-width:0;}' +
        '.nsq-qmain{font-size:14px;line-height:20px;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden;overflow-wrap:anywhere;}' +
        '.nsq-qmain a{font-weight:600;}' +
        '.nsq-qmeta{font-size:12px;color:' + lib.PAGE_COLORS.muted + ';margin-top:2px;}' +
        '.nsq-qprice{flex:0 0 auto;text-align:right;line-height:1.25;max-width:45%;}' +
        '.nsq-qprice strong{display:block;font-size:15px;white-space:nowrap;}' +
        '.nsq-qv{display:block;font-size:13px;color:' + GREEN + ';font-weight:600;}' +
        '.nsq-qpays{display:block;font-size:13px;color:' + lib.PAGE_COLORS.muted + ';}' +
        // unticked: one faint line — dashed, number · description · type · date, the price; no inputs
        '.nsq-qrow:not(.nsq-qrow-on){border-style:dashed;padding:8px 12px;opacity:.72;}' +
        '.nsq-qrow:not(.nsq-qrow-on) .nsq-qline{align-items:center;}' +
        '.nsq-qrow:not(.nsq-qrow-on) .nsq-qtext{display:flex;align-items:baseline;gap:6px;white-space:nowrap;overflow:hidden;}' +
        '.nsq-qrow:not(.nsq-qrow-on) .nsq-qmain{display:block;flex:0 1 auto;min-width:0;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;}' +
        '.nsq-qrow:not(.nsq-qrow-on) .nsq-qmeta{flex:0 0 auto;margin:0;}' +
        '.nsq-qrow:not(.nsq-qrow-on) .nsq-qmeta::before{content:"· ";}' +
        '.nsq-qrow:not(.nsq-qrow-on) .nsq-qprice strong{font-weight:400;font-size:14px;}' +
        // line 2: Units · Commission [%|£] [ ] = £…, indented under the text
        '.nsq-qin{display:flex;flex-wrap:wrap;align-items:center;gap:8px 18px;margin:6px 0 0 34px;}' +
        '.nsq-qf{display:inline-flex;align-items:center;gap:6px;margin:0;}' +
        '.nsq-qf-comm{flex-wrap:wrap;max-width:100%;}' +
        '.nsq-ql{font-size:13px;color:' + lib.PAGE_COLORS.muted + ';white-space:nowrap;}' +
        '.nsq-comm-box{display:inline-flex;align-items:center;gap:6px;flex:0 0 auto;}' +
        // 1.5.0: "= £525.44" — normal-size text, % only (replaces 1.3.1's fixed-width "→ £…")
        '.nsq-comm-calc{font-size:14px;color:' + lib.PAGE_COLORS.text + ';white-space:nowrap;font-variant-numeric:tabular-nums;}' +
        '.nsq-comm-calc[hidden]{display:none;}' +
        '.nsq-qrow .nsq-input{min-height:32px;height:32px;padding:4px 8px;font-size:14px;text-align:right;}' +
        '.nsq-qrow .nsq-units{width:56px;}.nsq-qrow .nsq-comm{width:72px;}' +
        '.nsq-tag-exp{display:inline-block;background:#fbeaea;color:#7a1d1d;border-radius:999px;padding:0 7px;font-size:11px;font-weight:600;vertical-align:1px;}' +
        // 1.4.0: the eligibility select + its voucher
        '.nsq-bus-row{display:flex;align-items:center;gap:10px;flex-wrap:wrap;}.nsq-bus-row select{flex:1 1 180px;min-width:0;}' +
        '.nsq-bus-voucher{font-size:14px;color:' + lib.PAGE_COLORS.muted + ';white-space:nowrap;}' +
        '.nsq-seg-row{display:inline-flex;flex:0 0 auto;border:1px solid ' + lib.PAGE_COLORS.border + ';border-radius:8px;overflow:hidden;}' +
        '.nsq-seg{position:relative;cursor:pointer;}' +
        '.nsq-seg input{position:absolute;opacity:0;width:1px;height:1px;}' +
        '.nsq-seg span{display:inline-flex;align-items:center;min-height:32px;padding:0 10px;font-size:13px;background:#fff;color:' + lib.PAGE_COLORS.text + ';}' +
        '.nsq-seg + .nsq-seg span{border-left:1px solid ' + lib.PAGE_COLORS.border + ';}' +
        '.nsq-seg input:checked + span{background:' + lib.PAGE_COLORS.accent + ';color:#fff;font-weight:600;}' +
        '.nsq-seg input:focus-visible + span{outline:2px solid ' + lib.PAGE_COLORS.accent + ';outline-offset:-4px;}' +
        '.nsq-seg input:disabled + span{cursor:not-allowed;}' +
        // the slim footer: phones and narrow screens only
        '.nsq-footer-slim .nsq-footer-in{padding:8px 16px;flex-wrap:nowrap;gap:12px;}' +
        '.nsq-footer-slim .nsq-sum{min-width:0;}.nsq-footer-slim .nsq-sum-main{font-size:14px;line-height:1.25;overflow-wrap:anywhere;}' +
        '.nsq-footer-slim .nsq-btn{flex:0 0 auto;}' +
        '@media (min-width:1001px){.nsq-footer-slim{display:none;}.nsq{padding-bottom:24px;}}' +
        '@media (max-width:1000px){.nsq-co{grid-template-columns:minmax(0,1fr);grid-template-rows:none;grid-template-areas:"quotes" "side" "rest";}' +
            '.nsq-panel{position:static;}' +
            '}' +
        '@media (max-width:600px){.nsq-qin{margin-left:0;gap:8px 14px;}.nsq-qrow .nsq-units{width:48px;}.nsq-qrow .nsq-comm{width:60px;}' +
            '.nsq-qrow .nsq-seg span{padding:0 7px;}.nsq-comm-box{gap:4px;}' +
            '.nsq-qrow:not(.nsq-qrow-on) .nsq-qmeta{display:none;}' +
            '}' +
        '</style>';

    /**
     * This page's part of the inline script (hook contract: lib header), after the library's
     * RECIPIENTS_SCRIPT. STATIC — everything is read from the page (data- attributes, values); nothing
     * is interpolated. The project type follows the ticked quotes (data-projtype, data-mixed) until the
     * rep chooses one themselves.
     */
    var PAGE_PART = [
        '  var ptTouched = false;',
        '  var MAX_FILES = ' + ATTACH.max + ', MAX_BYTES = ' + ATTACH.maxBytes + ';',
        '  function rows() { return root.querySelectorAll(".nsq-qrow"); }',
        '  function tickedRows() {',
        '    var out = [];',
        '    each(rows(), function (r) { var c = r.querySelector(".nsq-qsel"); if (c && c.checked) out.push(r); });',
        '    return out;',
        '  }',
        '  function emailOn() { var s = $("nsq-email-on"); return !!(s && s.checked && !s.disabled); }',
        '  function hasOpt(sel, v) { for (var i = 0; i < sel.options.length; i++) { if (sel.options[i].value === v) return true; } return false; }',
        '  function inferPt() {',
        '    var t = tickedRows(), ids = [], unmapped = false;',
        '    t.forEach(function (r) { var m = r.getAttribute("data-projtype") || ""; if (!m) unmapped = true; else if (ids.indexOf(m) === -1) ids.push(m); });',
        '    if (!t.length || unmapped) return "";',
        '    if (ids.length === 1) return ids[0];',
        '    return $("nsq-projtype").getAttribute("data-mixed") || "";',
        '  }',
        '  function applyInference() {',
        '    var sel = $("nsq-projtype");',
        '    if (!sel || ptTouched) return;',
        '    var v = inferPt();',
        '    sel.value = hasOpt(sel, v) ? v : "";',
        '  }',
        '  function setRow(r) {',
        '    var on = r.querySelector(".nsq-qsel").checked;',
        '    if (on) r.classList.add("nsq-qrow-on"); else r.classList.remove("nsq-qrow-on");',
        '    var q = r.querySelector(".nsq-qin"); if (q) q.hidden = !on;',   // 1.5.0: unticked = one line, no inputs
        '    each(r.querySelectorAll(".nsq-qin input, .nsq-qin select"), function (el) { el.disabled = !on; });',
        '  }',
        '  function money(n) { var neg = n < 0; return (neg ? "-£" : "£") + Math.abs(n).toFixed(2).replace(/\\B(?=(\\d{3})+(?!\\d))/g, ","); }',
        '  function files() { var a = $("nsq-att"); return a && a.files ? Array.prototype.slice.call(a.files) : []; }',
        '  function setEmail() {',
        '    var on = emailOn(), body = $("nsq-email-body");',
        '    body.hidden = !on;',
        '    each(body.querySelectorAll("input, select, textarea"), function (el) { el.disabled = !on; });',
        '    $("nsq-email-off").hidden = on;',
        '    $("nsq-email-on-val").value = on ? "T" : "F";',
        '    each(body.querySelectorAll(".nsq-att-slot"), function (el) { el.disabled = true; });',   // only a filled slot posts (beforeSubmit)
        '    each(rows(), setRow);',
        '  }',
        '  function pageInit() {',
        '    var f = formEl();',
        '    if (f) { f.enctype = "multipart/form-data"; f.encoding = "multipart/form-data"; }',   // request.files carries the attachments
        '    var pt = $("nsq-projtype");',
        '    if (pt.getAttribute("data-touched") === "1") ptTouched = true;',
        '    pt.addEventListener("change", function () { ptTouched = true; update(); });',
        '    each(rows(), function (r) {',
        '      r.querySelector(".nsq-qsel").addEventListener("change", function () { setRow(r); applyInference(); update(); });',
        '      each(r.querySelectorAll(".nsq-comm-kind"), function (k) { k.addEventListener("change", update); });',
        '    });',
        '    ["nsq-auth", "nsq-rep", "nsq-substatus", "nsq-valueprop", "nsq-email-tpl"].forEach(function (id) { $(id).addEventListener("change", update); });',
        '    if ($("nsq-bus")) $("nsq-bus").addEventListener("change", update);',   // 1.4.0
        '    $("nsq-att").addEventListener("change", update);',
        '    var from = $("nsq-email-from"), note = $("nsq-email-note");',
        '    function setNote() {',
        '      var o = from.options[from.selectedIndex];',
        '      note.textContent = (!o || o.value === "me") ? note.getAttribute("data-note-me") : note.getAttribute("data-note-pre") + o.text + note.getAttribute("data-note-post");',
        '    }',
        '    from.addEventListener("change", setNote);',
        '    setNote();',
        '    recipientsInit();',
        '    var sw = $("nsq-email-on");',
        '    setEmail();',
        '    sw.addEventListener("change", function () { setEmail(); update(); });',
        '    applyInference();',
        '    $("nsq-send").addEventListener("click", function () { submitForm("Creating…"); });',
        '    $("nsq-send-m").addEventListener("click", function () {',   // 1.5.0: the slim footer's button presses the panel's
        '      var b = $("nsq-send"); if (b.disabled) return;',
        '      b.click(); var m = $("nsq-send-m"); m.disabled = true; m.textContent = b.textContent;',
        '    });',
        '  }',
        '  function problem() {',
        '    if (!rows().length) return "No open quotes to order.";',
        '    var t = tickedRows();',
        '    if (!t.length) return "Tick at least one quote.";',
        '    if (t.length > ' + MAX_QUOTES + ') return "Create up to ' + MAX_QUOTES + ' orders at a time.";',
        '    for (var i = 0; i < t.length; i++) {',
        '      var r = t[i], name = r.getAttribute("data-tranid");',
        '      var u = r.querySelector(".nsq-units").value.trim();',
        '      if (!/^\\d+$/.test(u) || parseInt(u, 10) < 1) return "Enter the units for " + name + " (a whole number, 1 or more).";',
        '      var c = r.querySelector(".nsq-comm").value.trim();',
        '      if (c) {',
        '        if (!/^\\d+(\\.\\d{1,2})?$/.test(c)) return "Partner commission on " + name + " must be a number with up to 2 decimal places.";',
        '        var k = r.querySelector(".nsq-comm-kind:checked");',
        '        if ((!k || k.value === "pct") && parseFloat(c) > 100) return "Partner commission on " + name + " must be 100% or less.";',
        '      }',
        '    }',
        '    if (!$("nsq-projtype").value) return "Choose a project type.";',
        '    if (!$("nsq-auth").value) return "Choose the order authority.";',
        '    if (!$("nsq-rep").value) return "Choose the sales rep taking the order.";',
        '    if (!$("nsq-substatus").value) return "Choose a sub-status.";',
        '    if (!$("nsq-valueprop").value) return "Choose a value proposition.";',
        '    if (emailOn()) {',
        '      if (!$("nsq-email-tpl").value) return "Choose the confirmation email template.";',
        '      var rp = recipientsProblem();',
        '      if (rp) return rp;',
        '      var fl = files(), bytes = 0;',
        '      if (fl.length > MAX_FILES) return "Attach up to " + MAX_FILES + " files.";',
        '      for (var j = 0; j < fl.length; j++) { if (!fl[j].size) return "The file " + fl[j].name + " is empty."; bytes += fl[j].size; }',
        '      if (bytes > MAX_BYTES) return "The attachments come to more than 10 MB.";',
        '      if (fl.length && typeof DataTransfer !== "function") return "This browser can’t attach files here. Leave the attachments out, or use another browser.";',
        '    }',
        '    return "";',
        '  }',
        // 1.5.0: orderLib.buildOrderSummary + pickVoucherOrder, inlined from the library's own source (SUMMARY_SCRIPT)
        orderLib.SUMMARY_SCRIPT,
        '  var CAPPED = ' + JSON.stringify(COPY.busCapped) + ';',
        '  function busOpt() { var s = $("nsq-bus"); return s ? s.options[s.selectedIndex] : null; }',
        '  function busVoucherText() {',   // 1.4.0: beside the select — the voucher the eligibility means
        '    var o = busOpt(), a = o ? parseFloat(o.getAttribute("data-voucher")) || 0 : 0;',
        '    return a > 0 ? "Voucher " + money(a).replace(/\\.00$/, "") : "No voucher";',
        '  }',
        '  function summaryInput() {',   // the ticked quotes, in page order, as buildOrderSummary's plain data
        '    var o = busOpt(), pctRaw = root.getAttribute("data-deposit-pct");',
        '    return {',
        '      orders: tickedRows().map(function (r) {',
        '        var ex = r.getAttribute("data-exvat");',
        '        return { id: r.getAttribute("data-qid"), label: r.getAttribute("data-tranid"), typeLabel: r.getAttribute("data-type"),',
        '                 incVat: r.getAttribute("data-total"), exVat: ex === "" ? null : ex, isHeatPump: r.getAttribute("data-hp") === "1" };',
        '      }),',
        '      voucher: { amount: o ? parseFloat(o.getAttribute("data-voucher")) || 0 : 0, label: o ? o.getAttribute("data-short") || "" : "" },',
        '      depositPct: pctRaw === null || pctRaw === "" ? null : parseFloat(pctRaw),',
        '      upFront: root.getAttribute("data-upfront") === "1"',
        '    };',
        '  }',
        '  function el(tag, cls, text) { var e = document.createElement(tag); if (cls) e.className = cls; if (text !== undefined) e.textContent = text; return e; }',
        '  function pair(cls, left, right) { var d = el("div", "nsq-ps-row " + cls); d.appendChild(el("span", "", left)); d.appendChild(el("span", "", right)); return d; }',
        '  function renderRows(s) {',   // the voucher order's card: "BUS voucher −£…" and "Customer pays £…" under its price
        '    each(rows(), function (r) {',
        '      var l = null;',
        '      s.lines.forEach(function (x) { if (x.id === r.getAttribute("data-qid") && x.voucher > 0) l = x; });',
        '      var v = r.querySelector(".nsq-qv"), p = r.querySelector(".nsq-qpays");',
        '      v.hidden = !l; p.hidden = !l;',
        '      v.textContent = l ? "BUS voucher −\\u2060" + money(l.voucher) + (l.capped ? " " + CAPPED : "") : "";',   // never break inside −£
        '      p.textContent = l ? "Customer pays " + money(l.pays) : "";',
        '    });',
        '  }',
        '  function renderSummary(s) {',   // the Order summary panel
        '    var box = $("nsq-ps-orders");',
        '    while (box.firstChild) box.removeChild(box.firstChild);',
        '    if (!s.count) box.appendChild(el("p", "nsq-ps-empty", "No quotes ticked."));',
        '    s.lines.forEach(function (l) {',
        '      var b = el("div", "nsq-ps-order");',
        '      b.appendChild(pair("nsq-ps-head", l.label + (l.typeLabel ? " · " + l.typeLabel : ""), money(l.incVat)));',
        '      if (l.voucher > 0) {',
        '        b.appendChild(pair("nsq-ps-v", "BUS voucher" + (s.voucherLabel ? " · " + s.voucherLabel : "") + (l.capped ? " " + CAPPED : ""), "−" + money(l.voucher)));',
        '        b.appendChild(pair("nsq-ps-sub", "Customer pays", money(l.pays)));',
        '      }',
        '      box.appendChild(b);',
        '    });',
        '    $("nsq-ps-pending").hidden = !s.voucherPending;',
        '    $("nsq-ps-total").textContent = s.count ? "Orders total " + money(s.totalIncVat) + " inc VAT" + (s.vat === null ? "" : " (VAT " + money(s.vat) + ")") : "";',
        '    $("nsq-ps-pays").textContent = money(s.customerPays);',
        '    $("nsq-ps-dep").hidden = s.deposit === null;',
        '    $("nsq-ps-dep-label").textContent = s.deposit === null ? "" : "Deposit due now · " + s.depositPct + "%";',
        '    $("nsq-ps-dep-amt").textContent = s.deposit === null ? "" : money(s.deposit);',
        '    $("nsq-ps-bal").hidden = s.balance === null;',
        '    $("nsq-ps-bal-amt").textContent = s.balance === null ? "" : money(s.balance);',
        '    $("nsq-ps-note").hidden = !s.showNote;',
        '  }',
        '  function commCalc(r) {',   // % × the row's ex VAT, display only (the server recalculates from the SO). 1.5.0: "= £…",
        '    var out = r.querySelector(".nsq-comm-calc"); if (!out) return;',   // % only; blank or 0 → £0.00; nothing for an invalid entry
        '    var k = r.querySelector(".nsq-comm-kind:checked"), c = r.querySelector(".nsq-comm").value.trim(), ex = r.getAttribute("data-exvat");',
        '    var pct = !k || k.value === "pct";',
        '    out.hidden = !pct;',
        '    var n = c === "" ? 0 : (/^\\d+(\\.\\d{1,2})?$/.test(c) && parseFloat(c) <= 100 ? parseFloat(c) : null);',
        '    out.textContent = !pct || n === null || (n > 0 && ex === "") ? "" : "= " + money(n > 0 ? Math.round(n * parseFloat(ex)) / 100 : 0);',
        '  }',
        '  function createLabel(n) { return n ? "Create " + n + " order" + (n === 1 ? "" : "s") : "Create orders"; }',
        '  function summary() {',   // 1.5.0: the cards' voucher lines, the panel, the buttons; returns the slim footer's line
        '    each(rows(), commCalc);',
        '    var s = buildOrderSummary(summaryInput());',
        '    renderRows(s);',
        '    renderSummary(s);',
        '    if ($("nsq-bus-voucher")) $("nsq-bus-voucher").textContent = busVoucherText();',
        '    var label = createLabel(s.count), m = $("nsq-send-m");',
        '    $("nsq-send").textContent = label; m.textContent = label;',
        '    var why = problem() || requiredProblem();',   // update() sets #nsq-send from the same check; the footer's mirrors it
        '    m.disabled = !!why; m.title = why;',
        '    return s.count ? "Customer pays " + money(s.customerPays) : "No quotes ticked";',
        '  }',
        '  function beforeSubmit() {',
        '    $("nsq-q-sel").value = JSON.stringify(tickedRows().map(function (r) { return r.getAttribute("data-qid"); }));',
        '    if (!emailOn()) return;',
        '    recipientsBeforeSubmit();',
        '    var slots = root.querySelectorAll(".nsq-att-slot"), fl = files();',
        '    for (var i = 0; i < slots.length; i++) {',
        '      if (!fl[i]) continue;',
        '      var dt = new DataTransfer();',
        '      dt.items.add(fl[i]);',
        '      slots[i].files = dt.files;',
        '      slots[i].disabled = false;',
        '    }',
        '  }'
    ].join('\n');

    // ─── POST ─────────────────────────────────────────────────────────────────────

    /** custpage_q_sel: a JSON array of Estimate IDs (strings). */
    function parseSel(json) {
        if (!json) return { ids: [], invalid: false };
        try {
            var arr = JSON.parse(json);
            if (!Array.isArray(arr)) return { ids: [], invalid: true };
            var ids = arr.map(function (v) { return String(v); });
            var dup = ids.some(function (v, i) { return ids.indexOf(v) !== i; });
            return { ids: ids, invalid: dup || ids.some(function (v) { return !ID_RE.test(v); }) };
        } catch (e) {
            return { ids: [], invalid: true };
        }
    }

    /** The page state as posted — restored into the page after a refusal. */
    function readRestore(params) {
        var sel = parseSel(params.custpage_q_sel);
        var units = {}, commKind = {}, comm = {};
        sel.ids.forEach(function (id) {
            if (!ID_RE.test(id)) return;
            units[id]    = String(params['custpage_units_' + id] || '');
            commKind[id] = params['custpage_comm_kind_' + id] === 'amt' ? 'amt' : 'pct';
            comm[id]     = String(params['custpage_comm_' + id] || '');
        });
        return {
            sel:       sel.invalid ? [] : sel.ids,
            units:     units,
            commKind:  commKind,
            comm:      comm,
            emailTpl:  String(params.custpage_email_tpl || ''),   // 1.3.0
            projType:  String(params.custpage_projtype || ''),
            auth:      String(params.custpage_auth || ''),
            rep:       String(params.custpage_rep || ''),
            subStatus: String(params.custpage_substatus || ''),
            valueProp: String(params.custpage_valueprop || ''),
            busElig:   String(params.custpage_bus_elig || ''),   // 1.4.0
            upd:       lib.readPostedUpdateValues(params),
            emailOn:   params.custpage_email_on === 'T',
            from:      String(params.custpage_email_from || ''),
            rcpt:      lib.readPostedRecipients(params),
            token:     String(params.custpage_save_token || '')
        };
    }

    /**
     * 1.2.0: the uploaded attachments — every request.files entry named custpage_att_<n> (the page's slots),
     * in slot order. A part with no name and no content (an empty slot) is skipped.
     * @returns {{ files: Array<file.File>, bytes: number, error: string }}
     */
    function readAttachments(request) {
        var out = { files: [], bytes: 0, error: '' };
        var all = (request && request.files) || {};
        var keys = Object.keys(all).filter(function (k) { return k.indexOf(ATTACH.prefix) === 0 && /^\d{1,3}$/.test(k.substring(ATTACH.prefix.length)); })
            .sort(function (a, b) { return parseInt(a.substring(ATTACH.prefix.length), 10) - parseInt(b.substring(ATTACH.prefix.length), 10); });
        for (var i = 0; i < keys.length; i++) {
            var f = all[keys[i]];
            if (!f) continue;
            var size = Number(f.size) || 0;
            var name = String(f.name || '');
            if (!name && !size) continue;
            if (!size) { out.error = 'The file ' + (name || keys[i]) + ' is empty.'; return out; }
            out.files.push(f);
            out.bytes += size;
        }
        if (out.files.length > ATTACH.max) out.error = 'Attach up to ' + ATTACH.max + ' files (' + out.files.length + ' chosen).';
        else if (out.bytes > ATTACH.maxBytes) out.error = 'The attachments come to more than 10 MB.';
        return out;
    }

    /** A failure reason with the quote's number: "EST901 is not an open quote…" / "EST901: total differs…". */
    /**
     * 1.4.0: CreateOrderSL.BUS — the eligibility (posted / was), whether a heat pump quote is ticked, the voucher,
     * customer pays, the deposit and its %. Audit only: the figures are display-only and written nowhere. One
     * quote type search (10) + the customer's terms (1), only when a voucher or a deposit can show.
     */
    function logBus(opportunityId, cfg, quotes, eligibility, posted, was, customerId, listed) {
        try {
            if (!Object.keys(cfg.busAmounts).length && cfg.depositPct === null) {
                log.audit('CreateOrderSL.BUS', 'Opportunity ' + opportunityId + ' — eligibility ' + (posted ? (eligibility || 'blank') : 'not posted') +
                    ' (was ' + (was || 'blank') + '); ' + S.busAmounts + ' and ' + S.depositPct + ' not set — nothing to show');
                return;
            }
            var hp = heatPumpTypes(quotes.map(function (x) { return x.q.quoteTypeId; }));
            var upFront = false;
            if (cfg.depositPct !== null && ID_RE.test(String(customerId))) {
                var f = search.lookupFields({ type: search.Type.CUSTOMER, id: customerId, columns: ['terms'] }) || {};
                upFront = orderLib.paysUpFront(firstId(f.terms), cfg.prepayTerms);
            }
            // 1.5.0: the same summary as the page (orderLib.buildOrderSummary), the ticked quotes in PAGE order (as listed)
            var ticked = {};
            quotes.forEach(function (x) { ticked[x.q.id] = true; });
            var amount = Object.prototype.hasOwnProperty.call(cfg.busAmounts, String(eligibility || '')) ? cfg.busAmounts[String(eligibility)] : 0;
            var orders = listed.filter(function (q) { return ticked[q.id]; }).map(function (q) {
                return { id: q.id, label: q.tranId || q.id, typeLabel: q.quoteTypeText || '', incVat: q.total, exVat: q.exVat, isHeatPump: !!hp.ids[q.quoteTypeId] };
            });
            var sm = orderLib.buildOrderSummary({
                orders:     orders,
                voucher:    { amount: amount, label: '' },
                depositPct: cfg.depositPct,
                upFront:    upFront
            });
            var vLine = sm.lines.filter(function (l) { return l.id === sm.voucherOrderId; })[0];
            var hpQuotes = orders.filter(function (o) { return o.isHeatPump; }).map(function (o) { return o.label; });
            log.audit('CreateOrderSL.BUS', 'Opportunity ' + opportunityId + ' — eligibility ' + (posted ? (eligibility || 'blank') : 'not posted') +
                ' (was ' + (was || 'blank') + '); heat pump quote ticked: ' + (hpQuotes.length ? 'yes (' + hpQuotes.join(', ') + ')' : 'no') +
                (hp.error ? ' [types unreadable]' : '') + '; total ' + orderLib.money(sm.totalIncVat) + ' inc VAT; voucher ' +
                (vLine ? orderLib.money(vLine.voucher) + ' against ' + vLine.label + (vLine.capped ? ' (capped at the order value; ' + orderLib.money(sm.voucherAmount) + ' eligible)' : '') +
                    ', which pays ' + orderLib.money(vLine.pays) : orderLib.money(0) + (sm.voucherPending ? ' (eligible, no heat pump quote)' : '')) +
                '; customer pays ' + orderLib.money(sm.customerPays) +
                '; deposit ' + (sm.deposit === null ? 'none' : orderLib.money(sm.deposit)) + ' (' + (cfg.depositPct === null ? 'no %' : cfg.depositPct + '%') +
                ', ' + (upFront ? 'up front' : 'account customer') + '). Display only — the orders keep their full value');
        } catch (e) {
            log.error('CreateOrderSL.BUS', 'Opportunity ' + opportunityId + ' — the BUS figures could not be logged: ' + e.message);
        }
    }

    /** 1.3.2: the worst case for n quotes (see QUOTE_UNITS): checked once, before any write. */
    function usageNeeded(n, emailOn) {
        return MIN_USAGE_TO_CONVERT + n * QUOTE_UNITS + (emailOn ? EMAIL_UNITS : 0);
    }

    function reasonFor(q, e) {
        var msg = (e && e.message) || String(e);
        var name = q.tranId || ('Quote ' + q.id);
        return (/^ORDERLIB_/.test(String(e && e.name)) && /^[a-z]/.test(msg)) ? name + ' ' + msg : name + ': ' + msg;
    }

    /**
     * Validates everything (no writes), claims the token, guards against duplicates, creates one Sales
     * Order + order log per ticked quote, sends ONE template email for the opportunity (only if on), writes the Opportunity LAST and
     * redirects with codes only.
     */
    function handleCreate(context, cfg) {
        var params = context.request.parameters || {};
        var opportunityId = String(params.custpage_opportunity_id || '');
        if (!ID_RE.test(opportunityId)) {
            showErrorPage(context, 'No Opportunity ID provided. Please open this page from an Opportunity record.');
            return;
        }
        var restore = readRestore(params);
        function fail(lead, message) {
            renderPage(context, opportunityId, cfg, restore, { lead: lead, message: message });
        }
        function invalid(message) {
            log.audit('CreateOrderSL.Validation', 'Opportunity ' + opportunityId + ' — rejected: ' + message);
            fail('Not created.', message);
        }

        // ── The Opportunity as it is now (dynamic: the select options; 10 units) ──
        var opp;
        try {
            opp = record.load({ type: record.Type.OPPORTUNITY, id: opportunityId, isDynamic: true });
        } catch (e) {
            log.error('CreateOrderSL.Load', 'Opportunity ' + opportunityId + ' could not be loaded: ' + e.message);
            showErrorPage(context, 'Could not load Opportunity record (ID: ' + opportunityId + '). Please check the record exists and you have permission to view it.');
            return;
        }
        var customerId = currentValue(opp, 'entity');

        // ── Validation — nothing is written until all of this passes ─────────────
        var sel = parseSel(params.custpage_q_sel);
        if (sel.invalid) return invalid('The quote selection could not be read. Please reload the page and try again.');
        if (!sel.ids.length) return invalid('Tick at least one quote.');
        if (sel.ids.length > MAX_QUOTES) return invalid('Create up to ' + MAX_QUOTES + ' orders at a time.');

        // Email first (1.3.0: ONE template for the submission; the attachments)
        var emailOn = params.custpage_email_on === 'T';
        var rcpt = null, sender = null, fromCode = '', ccMeEmail = '', attach = { files: [], bytes: 0 }, templates = [], emailTemplateId = '';
        if (emailOn) {
            var tpls = loadTemplates(cfg.emailTemplates);
            templates = tpls.list;
            if (!cfg.emailTemplates.length || !templates.length) return invalid(tpls.error ? COPY.badTemplates : COPY.noTemplates);
            emailTemplateId = String(params.custpage_email_tpl || '').trim();
            if (!emailTemplateId) return invalid('Choose the confirmation email template.');
            if (!hasOption(templates, emailTemplateId)) return invalid('The confirmation email template is not one of the offered templates.');
            attach = readAttachments(context.request);
            if (attach.error) return invalid(attach.error);
            var cust = {};
            var postedR = lib.readPostedRecipients(params);
            if (customerId && postedR.customer) {
                try {
                    cust = search.lookupFields({ type: search.Type.CUSTOMER, id: customerId, columns: ['email'] }) || {};
                } catch (e) {
                    log.error('CreateOrderSL.Email', 'Opportunity ' + opportunityId + ' — customer lookup failed: ' + e.message);
                }
            }
            var rcptContacts = postedR.contacts.length ? lib.loadContacts(opportunityId, 'CreateOrderSL') : [];
            rcpt = lib.resolveRecipients(params, rcptContacts, postedR.customer ? lib.lookupText(cust.email) : '');
            if (rcpt.error) return invalid(rcpt.error);
            if (!ID_RE.test(String(customerId))) return invalid('The opportunity has no customer, so no confirmation email can be sent.');
            fromCode = params.custpage_email_from === undefined || params.custpage_email_from === '' ? 'rep' : String(params.custpage_email_from);
            if (fromCode !== 'me' && !FROM_ROLES.hasOwnProperty(fromCode)) return invalid('Choose who the email is from.');
            if (fromCode === 'me') {
                sender = lib.loadSender('CreateOrderSL.Email');
                if (sender.error) return invalid('Your employee record could not be read, so the email can’t be sent from you.');
                if (!sender.email || !lib.EMAIL_RE.test(sender.email)) return invalid('Your employee record has no email address, so the email can’t be sent from you.');
            } else {
                var role = FROM_ROLES[fromCode];
                var noEmail = role.label + ' has no email address on their employee record, so the email can’t be sent from them.';
                var empId = currentValue(opp, role.field);
                if (!empId) return invalid(noEmail);
                sender = lib.loadSender('CreateOrderSL.Email', empId);
                if (sender.error) return invalid(role.label + '’s employee record could not be read, so the email can’t be sent from them.');
                if (sender.inactive) return invalid(role.label + ' is no longer active, so the email can’t be sent from them.');
                if (!sender.email || !lib.EMAIL_RE.test(sender.email)) return invalid(noEmail);
            }
            if (rcpt.ccMe) {
                if (fromCode === 'me') {
                    ccMeEmail = sender.email;
                } else {
                    try {
                        ccMeEmail = lib.lookupText(search.lookupFields({ type: search.Type.EMPLOYEE, id: runtime.getCurrentUser().id, columns: ['email'] }).email).trim();
                    } catch (e) {
                        ccMeEmail = '';
                    }
                    if (!lib.EMAIL_RE.test(ccMeEmail)) return invalid('Your employee record has no email address, so you can’t be copied in. Untick CC me.');
                }
            }
        }

        // Quotes: OPEN Estimates on THIS opportunity (the header search; 1.2.0: no extras — nothing here needs them)
        var listing = orderLib.listOrderableQuotes(opportunityId, { extras: false, logKey: 'CreateOrderSL.List' });
        if (listing.error) return invalid('The open quotes could not be read. Please try again.');
        var byId = {};
        listing.quotes.forEach(function (q) { byId[q.id] = q; });
        var quotes = [];
        for (var i = 0; i < sel.ids.length; i++) {
            var q = byId[sel.ids[i]];
            if (!q) return invalid('A ticked quote is not an open quote on this opportunity (it may have been converted or closed). Please reload the page.');
            var name = q.tranId || ('Quote ' + q.id);
            var u = String(params['custpage_units_' + q.id] || '').trim();
            if (!/^\d{1,6}$/.test(u) || parseInt(u, 10) < 1 || parseInt(u, 10) > UNITS_MAX) return invalid('Enter the units for ' + name + ' (a whole number, 1 or more).');
            var kind = String(params['custpage_comm_kind_' + q.id] || 'pct');
            if (kind !== 'pct' && kind !== 'amt') return invalid('Choose % or £ for the partner commission on ' + name + '.');
            var c = String(params['custpage_comm_' + q.id] || '').trim();
            if (c) {
                if (!/^\d{1,9}(\.\d{1,2})?$/.test(c)) return invalid('Partner commission on ' + name + ' must be a number with up to 2 decimal places.');
                if (kind === 'pct' && parseFloat(c) > 100) return invalid('Partner commission on ' + name + ' must be between 0 and 100%.');
            }
            quotes.push({ q: q, units: u, commission: c ? { kind: kind, value: c } : null });
        }

        // Order details: options read at run time; the server repeats the inference
        var projTypes = orderLib.loadListOptions(LISTS.projType, 'CreateOrderSL.Lists');
        var inferred = orderLib.inferProjectType(quotes.map(function (x) { return x.q.quoteTypeId; }), cfg.projTypeMap, cfg.projTypeMixed);
        var postedPt = String(params.custpage_projtype || '').trim();
        var projectType = '';
        if (postedPt) {
            if (!hasOption(projTypes, postedPt)) return invalid('Choose a project type from the list.');
            projectType = postedPt;   // the rep's choice wins
        } else if (inferred && hasOption(projTypes, inferred)) {
            projectType = inferred;
        } else {
            return invalid('Choose a project type.');
        }
        log.audit('CreateOrderSL.ProjectType', 'Opportunity ' + opportunityId + ' — inferred ' + (inferred || 'none') + ', posted ' + (postedPt || 'none') + ' → ' + projectType);

        var auth = String(params.custpage_auth || '').trim();
        if (!auth) return invalid('Choose the order authority.');
        if (!hasOption(orderLib.loadListOptions(LISTS.auth, 'CreateOrderSL.Lists'), auth)) return invalid('Choose an order authority from the list.');

        // 1.2.0: the rep must be one the page offers — the same list, rebuilt here
        var repId = String(params.custpage_rep || '').trim();
        if (!ID_RE.test(repId)) return invalid('Choose the sales rep taking the order.');
        if (!hasOption(loadSalesReps(opp), repId)) return invalid('The sales rep taking the order must be one of the reps offered.');

        // Update the opportunity: the three library fields (key list cut on the server) + D3
        var updParams = updateParams(params);
        var bad = lib.pendingChanges(updParams).invalidDates;
        if (bad.length) return invalid('A date in step 3 is not a valid date. Please choose it again.');
        var req = lib.validateRequired(opportunityId, updParams, RULES);
        if (!req.ok) return invalid(req.missing.join(', ') + ' is required — the opportunity has none. Set it in step 3.');

        var offered = subStatusOffered(opp, cfg);
        var subStatus = String(params.custpage_substatus || '').trim();
        if (!subStatus) return invalid('Choose a sub-status.');
        if (!hasOption(offered, subStatus)) return invalid('Choose a sub-status from the list.');
        var valueProp = String(params.custpage_valueprop || '').trim();
        if (!valueProp) return invalid('Choose a value proposition.');
        if (!hasOption(fieldOptions(opp, OPP_FIELDS.valueProp), valueProp)) return invalid('Choose a value proposition from the list.');

        // 1.4.0: BUS eligibility — optional; blank or one of the field's options. Not posted (no select on the page,
        // the options unreadable) → not written.
        var busPosted = Object.prototype.hasOwnProperty.call(params, 'custpage_bus_elig');
        var busElig = String(params.custpage_bus_elig || '').trim();
        var busWas = currentValue(opp, OPP_FIELDS.busElig);
        if (busPosted) {
            var busOpts = busOptions(opp);
            if (!busOpts.length) {
                busPosted = false;
                log.error('CreateOrderSL.BUS', 'Opportunity ' + opportunityId + ' — ' + OPP_FIELDS.busElig + ' options could not be read; posted "' +
                    busElig.substring(0, 20) + '" not written');
            } else if (busElig && !hasOption(busOpts, busElig)) {
                return invalid('Choose a BUS eligibility from the list.');
            }
        }

        // The status the parameter names must be one of this opportunity's options (else not written; amber)
        var statusTo = '', statusProblem = false;
        if (cfg.oppStatus) {
            if (hasOption(fieldOptions(opp, 'entitystatus'), cfg.oppStatus)) statusTo = cfg.oppStatus;
            else {
                statusProblem = true;
                log.error('CreateOrderSL.Config', S.oppStatus + ' = ' + cfg.oppStatus + ' is not a status option on Opportunity ' + opportunityId + '; the status will not be written');
            }
        }

        // ── Governance (1.3.2): the worst case for the ticked count must fit, or nothing is attempted ──
        var script = runtime.getCurrentScript();
        var needed = usageNeeded(quotes.length, emailOn), left = script.getRemainingUsage();
        if (left < needed) {
            log.audit('CreateOrderSL.Validation', 'Opportunity ' + opportunityId + ' — usage: ' + quotes.length + ' quote' + (quotes.length === 1 ? '' : 's') +
                (emailOn ? ' + the email' : '') + ' need up to ' + needed + ' units; ' + left + ' left');
            return invalid('These ' + quotes.length + ' orders can’t all be created in one go (NetSuite’s usage limit). Create fewer at a time.');
        }

        // ── 1.4.0: the BUS figures, for the audit log only — nothing here is written to any transaction ──
        logBus(opportunityId, cfg, quotes, busPosted ? busElig : busWas, busPosted, busWas, customerId, listing.quotes);

        // ── Save guard — before the first write ─────────────────────────────────
        var guard = claimToken(restore.token, opportunityId);
        if (guard.dup) {
            var dp = { nsqs: 'ord', nsq: 'dup', nsqt: String(Math.floor(Date.now() / 1000)) };
            log.audit('CreateOrderSL.Redirect', 'Opportunity ' + opportunityId + ' — ' + JSON.stringify(dp));
            redirect.toRecord({ type: record.Type.OPPORTUNITY, id: opportunityId, isEditMode: false, parameters: dp });
            return;
        }

        // ── 1.3.2: the orders, in two phases (orderLib.convertQuotes) ──────────────
        // Phase 1 (nothing saved): the duplicate guard, then every quote locked, re-checked (open, this
        // opportunity), transformed and total-checked while all of them are still open. Any refusal → nothing
        // saved, every lock released, the page comes back "Nothing was created: …" (all-or-nothing, as validation).
        // Phase 2: each SO saved → total check after save → order log. A failed save never stops the others;
        // the SOs already saved stand ("Not created: …", NetSuite's message in the log).
        var conv = orderLib.convertQuotes(quotes.map(function (x) {
            return { estimateId: x.q.id, commission: x.commission, units: x.units };
        }), {
            oppId:       opportunityId,
            projectType: projectType,
            auth:        auth,
            repId:       repId,
            cfg:         { soForm: cfg.soForm, recordStatus: cfg.recordStatus, parentOppField: cfg.parentOppField, logKey: 'CreateOrderSL.Convert' }
        });
        var byId = {};
        quotes.forEach(function (x) { byId[x.q.id] = x.q; });
        function why(item) {
            if (!item.estimateId) return (item.error && item.error.message) || String(item.error);   // the duplicate search failed
            return reasonFor(byId[item.estimateId] || { id: item.estimateId }, item.error);
        }
        if (!conv.ok) {
            releaseToken(guard.key, opportunityId);
            var problems = conv.problems.map(why);
            log.audit('CreateOrderSL.Summary', 'Opportunity ' + opportunityId + ' — nothing created (phase 1, prepared ' + conv.prepared + '/' + quotes.length +
                '): ' + problems.join(' | '));
            fail('Nothing was created:', problems.join(' · '));
            return;
        }
        var created = conv.created.map(function (c) { return { q: byId[c.estimateId], res: c.res }; });
        var failed = conv.failed.map(function (f) {
            var reason = why(f);
            log.error('CreateOrderSL.Convert', 'Opportunity ' + opportunityId + ' — ' + reason);
            return { q: byId[f.estimateId], reason: reason };
        });

        // ── Nothing created: no email, no opportunity write, the token is released ─
        if (!created.length) {
            releaseToken(guard.key, opportunityId);
            log.audit('CreateOrderSL.Summary', 'Opportunity ' + opportunityId + ' — nothing created: ' + failed.map(function (f) { return f.reason; }).join(' | '));
            fail('Nothing was created:', failed.map(function (f) { return f.reason; }).join(' · '));
            return;
        }

        // ── The email (1.3.0) — only if switched on and at least one order was created: ONE, for the opportunity ──
        var emailState = 'off';
        if (emailOn) {
            emailState = 'fail';
            var cc = [];
            var me = ccMeEmail.toLowerCase();
            if (rcpt.ccMe && !rcpt.to.some(function (a) { return a.toLowerCase() === me; })) cc.push(ccMeEmail);
            var oppLabel = 'Opportunity ' + opportunityId;
            var merged = null;
            try {
                merged = render.mergeEmail({
                    templateId:    parseInt(emailTemplateId, 10),
                    entity:        { type: 'customer', id: parseInt(customerId, 10) },
                    recipient:     { type: 'customer', id: parseInt(customerId, 10) },
                    transactionId: parseInt(opportunityId, 10)
                });
            } catch (e) {
                log.error('CreateOrderSL.Email', oppLabel + ' — template ' + emailTemplateId + ' could not be merged (a legacy CRMSDK template can’t be; it must be FreeMarker); not sent: ' + ((e && e.message) || String(e)));
            }
            if (merged) {
                log.audit('CreateOrderSL.Email', oppLabel + ' — template ' + emailTemplateId + ' merged; from ' + fromCode +
                    ' (employee ' + sender.id + '), ' + rcpt.to.length + ' recipient' + (rcpt.to.length === 1 ? '' : 's') + (cc.length ? ' + CC me' : '') +
                    ', ' + attach.files.length + ' attachment' + (attach.files.length === 1 ? '' : 's') + ' (' + attach.bytes + ' bytes), ' +
                    created.length + ' order' + (created.length === 1 ? '' : 's') + ' created');
                try {
                    var opts = {
                        author:         sender.id,
                        recipients:     rcpt.to,
                        subject:        merged.subject,
                        body:           merged.body,
                        relatedRecords: { transactionId: parseInt(opportunityId, 10), entityId: parseInt(customerId, 10) }   // the opportunity's Communication tab
                    };
                    if (cc.length) opts.cc = cc;
                    if (attach.files.length) opts.attachments = attach.files;
                    email.send(opts);
                    emailState = 'sent';
                    log.audit('CreateOrderSL.Email', oppLabel + ' — sent');
                } catch (e) {
                    log.error('CreateOrderSL.Email', oppLabel + ' — email FAILED: ' + ((e && e.message) || String(e)));
                }
            }
        }

        // ── The Opportunity — LAST ───────────────────────────────────────────────
        var oppUpdate = lib.updateFields(opportunityId, updParams, RULES);
        var extra = {}, extraKeys = [];
        if (subStatus !== currentValue(opp, OPP_FIELDS.subStatus)) { extra[OPP_FIELDS.subStatus] = subStatus; extraKeys.push('sub_status'); }
        if (valueProp !== currentValue(opp, OPP_FIELDS.valueProp)) { extra[OPP_FIELDS.valueProp] = valueProp; extraKeys.push('value_prop'); }
        if (busPosted && busElig !== busWas) { extra[OPP_FIELDS.busElig] = busElig; extraKeys.push('bus_elig'); }   // 1.4.0: only when changed
        if (statusTo && statusTo !== currentValue(opp, 'entitystatus')) { extra.entitystatus = statusTo; extraKeys.push('entitystatus'); }
        var extraError = '';
        if (extraKeys.length) {
            var statusChanged = extra.hasOwnProperty('entitystatus');
            try {
                record.submitFields({
                    type:    record.Type.OPPORTUNITY,
                    id:      opportunityId,
                    values:  extra,
                    options: { enableSourcing: statusChanged, ignoreMandatoryFields: true }
                });
                log.audit('CreateOrderSL.OppUpdate', 'Opportunity ' + opportunityId + ' — updated ' + JSON.stringify(extra) + ' (enableSourcing: ' + statusChanged + ')');
            } catch (e) {
                extraError = e.message || String(e);
                log.error('CreateOrderSL.OppUpdate', 'Opportunity ' + opportunityId + ' — update FAILED (the orders stand). Attempted: ' + JSON.stringify(extra) + ' | Error: ' + extraError);
            }
        }

        // ── Back to the Opportunity with codes only ──────────────────────────────
        var p = lib.fieldRedirectParams(oppUpdate);
        p.nsqs = 'ord';
        function addKeys(name, keys) {
            if (!keys.length) return;
            p[name] = (p[name] ? p[name] + ',' : '') + keys.join(',');
        }
        if (extraError) { p.nsq = 'warn'; addKeys('nsqff', extraKeys); } else addKeys('nsqf', extraKeys);
        if (statusProblem) { p.nsq = 'warn'; addKeys('nsqff', ['entitystatus']); }
        p.nsqso = created.map(function (c) { return c.res.soId; }).join(',');
        if (failed.length) { p.nsq = 'warn'; p.nsqqf = failed.map(function (f) { return f.q.id; }).join(','); }
        var logFailed = created.filter(function (c) { return c.res.logFailed; }).map(function (c) { return c.res.soId; });
        var mismatch = created.filter(function (c) { return c.res.totalMismatch; }).map(function (c) { return c.res.soId; });
        if (logFailed.length) { p.nsq = 'warn'; p.nsqlf = logFailed.join(','); }
        if (mismatch.length) { p.nsq = 'warn'; p.nsqtm = mismatch.join(','); }
        if (emailState === 'sent') p.nsqe = 'sent';   // 1.3.0: one email — no nsqen / nsqef
        else if (emailState === 'fail') { p.nsqe = 'fail'; p.nsq = 'warn'; }

        log.audit('CreateOrderSL.Summary', 'Opportunity ' + opportunityId + ' — created ' +
            created.map(function (c) { return (c.res.tranId || c.res.soId) + ' from ' + c.q.tranId + (c.res.logId ? ' (log ' + c.res.logId + ')' : ' (NO LOG)'); }).join(', ') +
            '; failed ' + (failed.map(function (f) { return f.reason; }).join(' | ') || 'none') +
            '; warnings ' + (created.reduce(function (a, c) { return a.concat(c.res.warnings); }, []).join(' | ') || 'none') +
            '; fields ' + (oppUpdate.error ? 'FAILED' : (oppUpdate.changed.map(function (c) { return c.key; }).join(',') || 'none')) +
            ' + ' + (extraKeys.join(',') || 'none') + (extraError ? ' (FAILED)' : '') +
            '; email ' + emailState + (emailOn ? ' (template ' + emailTemplateId + ')' : '') +
            '; usage left ' + script.getRemainingUsage());
        log.audit('CreateOrderSL.Redirect', 'Opportunity ' + opportunityId + ' — ' + JSON.stringify(p));

        redirect.toRecord({ type: record.Type.OPPORTUNITY, id: opportunityId, isEditMode: false, parameters: p });
    }

    return {
        onRequest: onRequest
    };

});
