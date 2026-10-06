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
 *              Creates one Sales Order and one order log per ticked quote (nuheat_order_lib.convertQuote),
 *              sends the confirmation only when switched on, writes the Opportunity LAST, and returns to
 *              the Opportunity with the result banner (nuheat_opportunity_ue.js, nsqs=ord).
 * @version     1.2.1
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
 *   The settings search failing (no View permission on the record, no record type) → the page refuses:
 *   "Create order can’t run: its settings can’t be read. Ask an administrator."
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
 *   - Order: validate → token → duplicate guard (SO createdfrom) → one Sales Order + order log per quote
 *     (each in its own try/catch) → the emails (only if switched on; one per order created, from its template) → the
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

    var SCRIPT_VERSION = '1.2.1';

    /** Page rules for the shared update fields: Next contact must end up set (D3, as Update Opportunity). */
    var RULES = { required: ['next_contact'], logKey: 'CreateOrderSL.OppUpdate' };

    /** The library fields this page shows and writes. Anything else posted is dropped on the server. */
    var UPDATE_KEYS = ['del_date', 'next_contact', 'build_stage'];

    // ─── Account objects (script IDs only) ────────────────────────────────────────

    var OPP_FIELDS = {
        subStatus: 'custbody_opportunity_sub_status',
        valueProp: 'custbody_value_proposition'
    };
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
        emailTemplates:  'ORDER_EMAIL_TEMPLATES'   // 1.2.0: the confirmation templates offered, in display order
    };
    var SETTING_KEYS = Object.keys(S).map(function (k) { return S[k]; });

    var ADMIN_ROLE_ID = 'administrator';   // the standard Administrator role's script ID (roleId)

    /**
     * Governance (1.2.0). A quote costs about 50 units to convert (60 with the fallback total search) and,
     * with the email on, one render.mergeEmail + one email.send — counted as 20 + 20 (the conservative
     * figures; Sandbox check). 8 quotes with emails came to ~830 units, so MAX_QUOTES is 6 (~660).
     */
    var MAX_QUOTES = 6;               // per submission (1.2.0: was 8)
    var MIN_USAGE_TO_CONVERT = 100;   // a conversion (60) + the opportunity writes (20) + slack (20)
    var EMAIL_UNITS = 40;             // mergeEmail + email.send, reserved per order while the email is on
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
        attachNote:   'Optional. Up to 5 files, 10 MB in total. They are attached to every confirmation email sent now.',
        tplLabel:     'Confirmation email'
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

    function switchHTML(id, label, on, offId) {
        return '<label class="nsq-switch"><input type="checkbox" id="' + id + '"' + (on ? ' checked' : '') + '> ' + escapeHtml(label) + '</label>' +
            '<span class="nsq-off" id="' + offId + '"' + (on ? ' hidden' : '') + '>Off</span>';
    }

    /**
     * 1.2.0: one compact row per quote (~56px): tick · number + description (one line, ellipsis, full text on
     * hover) · type · created · Units · Commission · [Confirmation email] · total (ex VAT and deposit small
     * beneath). The inputs sit inline; an unticked row greys them out (disabled) at the same height. At phone
     * width the inputs wrap to a second line. Totals sit in data- attributes for the live totals only.
     */
    function quoteRowHTML(q, page, r, emailOn) {
        var sel = (r.sel || []).indexOf(q.id) !== -1;
        var restoring = !!r.sel;
        var units = restoring && r.units[q.id] !== undefined ? r.units[q.id] : q.units;
        var kind = restoring && r.commKind[q.id] === 'amt' ? 'amt' : 'pct';
        var comm = restoring && r.comm[q.id] !== undefined ? r.comm[q.id] : '';
        var tplSel = restoring && r.tpl && r.tpl[q.id] ? r.tpl[q.id] : '';
        var pt = Object.prototype.hasOwnProperty.call(page.projTypeMap, q.quoteTypeId) ? page.projTypeMap[q.quoteTypeId] : '';
        var link = estimateUrl(q.id);
        var name = q.tranId || ('Quote ' + q.id);
        var text = q.description || q.title;
        var deposit = page.upFront && q.deposit !== null && q.deposit > 0 ? q.deposit : null;
        var id = escapeHtml(q.id);
        var uid = 'nsq-units-' + q.id, cid = 'nsq-comm-' + q.id, tid = 'nsq-tpl-' + q.id;
        var h = [];
        h.push('<div class="nsq-qrow' + (sel ? ' nsq-qrow-on' : '') + '" data-qid="' + id + '" data-tranid="' + escapeHtml(name) +
            '" data-total="' + escapeHtml(q.total === null ? '' : String(q.total)) + '" data-exvat="' + escapeHtml(q.exVat === null ? '' : String(q.exVat)) +
            '" data-deposit="' + escapeHtml(deposit === null ? '' : String(deposit)) + '" data-projtype="' + escapeHtml(pt) + '">');
        h.push('<label class="nsq-qtick"><input type="checkbox" class="nsq-qsel" data-qid="' + id + '"' + (sel ? ' checked' : '') +
            ' aria-label="Order ' + escapeHtml(name) + '"></label>');
        var full = name + (text ? ' · ' + text : '');
        h.push('<div class="nsq-qmain" title="' + escapeHtml(full) + '">' +
            (link ? '<a href="' + escapeHtml(link) + '" target="_blank" rel="noopener">' + escapeHtml(name) + '</a>' : escapeHtml(name)) +
            (q.expired ? ' <span class="nsq-tag-exp">' + escapeHtml(COPY.expired) + '</span>' : '') +
            (text ? ' · ' + escapeHtml(text) : '') + '</div>');
        h.push('<div class="nsq-qmeta">' + [q.quoteTypeText, q.dateCreated].filter(function (x) { return x; }).map(escapeHtml).join(' · ') + '</div>');
        h.push('<div class="nsq-qin">');
        h.push('<label class="nsq-qf nsq-qf-units" for="' + uid + '"><span class="nsq-ql">Units</span>' +
            '<input type="text" inputmode="numeric" class="nsq-input nsq-units" id="' + uid + '" name="custpage_units_' + id +
            '" maxlength="6" autocomplete="off" value="' + escapeHtml(units) + '"></label>');
        h.push('<div class="nsq-qf nsq-qf-comm"><label class="nsq-ql" for="' + cid + '"><span class="nsq-ql-long">Commission</span><span class="nsq-ql-short">Comm.</span></label>' +
            '<span class="nsq-seg-row" role="radiogroup" aria-label="Commission as">' +
            '<label class="nsq-seg"><input type="radio" class="nsq-comm-kind" name="custpage_comm_kind_' + id + '" value="pct"' + (kind === 'pct' ? ' checked' : '') + '><span>%</span></label>' +
            '<label class="nsq-seg"><input type="radio" class="nsq-comm-kind" name="custpage_comm_kind_' + id + '" value="amt"' + (kind === 'amt' ? ' checked' : '') + '><span>£</span></label>' +
            '</span><input type="text" inputmode="decimal" class="nsq-input nsq-comm" id="' + cid + '" name="custpage_comm_' + id +
            '" maxlength="12" autocomplete="off" value="' + escapeHtml(comm) + '"><span class="nsq-comm-calc" aria-live="polite"></span></div>');
        h.push('<label class="nsq-qf nsq-qf-tpl" for="' + tid + '"' + (emailOn ? '' : ' hidden') + '><span class="nsq-sr">' + escapeHtml(COPY.tplLabel) + '</span>' +
            '<select class="nsq-input nsq-tpl" id="' + tid + '" name="custpage_tpl_' + id + '">' + optionsHTML(page.templates, tplSel, COPY.tplLabel + '…') + '</select></label>');
        h.push('</div>');
        h.push('<div class="nsq-qprice"><strong>' + escapeHtml(q.total === null ? '—' : orderLib.money(q.total)) + '</strong>' +
            (q.exVat === null ? '' : '<span class="nsq-qsub">' + escapeHtml(orderLib.money(q.exVat)) + ' ex VAT</span>') +
            (deposit === null ? '' : '<span class="nsq-qsub nsq-dep">Deposit ' + escapeHtml(orderLib.money(deposit)) + '</span>') + '</div>');
        h.push('</div>');
        return h.join('');
    }

    function buildPageHTML(page, restore, error) {
        var r = restore || {};
        var emailOn = !page.emailBlocked && (restore ? r.emailOn === true : false);   // off by default; never automatic
        var emailFresh = !restore || !emailOn;
        var h = [];
        h.push(lib.baseCss() + PAGE_CSS);
        h.push('<div id="nsq-root" class="nsq" data-opp-url="' + escapeHtml(page.oppUrl) + '" data-upfront="' + (page.upFront ? '1' : '0') + '">');
        h.push('<div class="nsq-wrap">');
        h.push(lib.buildHeaderHTML(page, COPY.title));
        if (error) h.push(lib.buildErrorAlertHTML(error.lead, error.message));

        h.push('<input type="hidden" name="custpage_opportunity_id" value="' + escapeHtml(page.opportunityId) + '">');
        h.push('<input type="hidden" name="custpage_q_sel" id="nsq-q-sel" value="">');
        h.push('<input type="hidden" name="custpage_email_on" id="nsq-email-on-val" value="' + (emailOn ? 'T' : 'F') + '">');
        h.push('<input type="hidden" name="custpage_save_token" value="' + escapeHtml(page.saveToken) + '">');

        // ── 1 Quotes ──
        h.push('<section class="nsq-card"><h2 class="nsq-h2"><span class="nsq-num">1</span>Quotes</h2>');
        if (page.listError) {
            h.push('<p class="nsq-help nsq-bad">The quotes could not be read. Please reload the page.</p>');
        } else if (!page.quotes.length) {
            h.push('<p class="nsq-help" id="nsq-no-quotes">' + escapeHtml(COPY.noQuotes) + '</p>');
        } else {
            h.push('<p class="nsq-help">Tick each quote to order. One sales order is created per quote.</p>');
            page.quotes.forEach(function (q) { h.push(quoteRowHTML(q, page, r, emailOn)); });
            // 1.2.0: the live total of the ticked quotes (display only — the server never reads it)
            h.push('<div class="nsq-qtotal" id="nsq-qtotal" aria-live="polite"><div class="nsq-qtotal-line" id="nsq-qtotal-line"></div>' +
                '<div class="nsq-qtotal-ex" id="nsq-qtotal-ex"></div></div>');
        }
        h.push('</section>');

        // ── 2 Order details ──
        h.push('<section class="nsq-card"><h2 class="nsq-h2"><span class="nsq-num">2</span>Order details</h2>');
        h.push('<p class="nsq-help">These apply to every order created now.</p><div class="nsq-upd-grid">');
        h.push(selectHTML('nsq-projtype', 'custpage_projtype', 'Project type', page.projTypes, r.projType || '',
            ' data-mixed="' + escapeHtml(page.mixed) + '"' + (r.projType ? ' data-touched="1"' : '')));
        h.push(selectHTML('nsq-auth', 'custpage_auth', 'Order authority', page.auths, r.auth || ''));
        h.push(selectHTML('nsq-rep', 'custpage_rep', 'Sales rep taking the order', page.reps, restore ? (r.rep || '') : page.repDefault));
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
        h.push('<p class="nsq-help">One email per order created, using the template chosen on each quote above.</p>');
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

        h.push('</div>'); // .nsq-wrap

        // ── Sticky footer ──
        h.push('<div class="nsq-footer"><div class="nsq-footer-in">');
        h.push('<div class="nsq-sum"><div class="nsq-sum-main" id="nsq-sum-line"></div><div class="nsq-sum-ex" id="nsq-sum-ex"></div>' +
            '<div class="nsq-sum-sub" id="nsq-sum-changes"></div></div>');
        h.push('<div class="nsq-actions"><span class="nsq-reason" id="nsq-reason"></span>' +
            '<a class="nsq-btn nsq-btn-link" href="' + escapeHtml(page.oppUrl) + '">Cancel</a>' +
            '<button type="button" class="nsq-btn nsq-btn-primary" id="nsq-send" disabled>Create orders</button></div>');
        h.push('</div></div>');

        h.push('</div>'); // #nsq-root
        h.push('<script>' + lib.pageScript(lib.RECIPIENTS_SCRIPT + PAGE_PART) + '</script>');
        return h.join('');
    }

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
        // 1.2.0: compact rows — one line per quote at desktop (~56px), the inputs on a second line at phone width
        // fixed widths (except the description) so the columns line up from row to row
        '.nsq-qrow{display:grid;grid-template-columns:24px minmax(120px,1fr) 150px 100px 198px auto 112px;grid-template-areas:"tick main meta units comm tpl price";' +
            'align-items:center;column-gap:14px;row-gap:6px;min-height:56px;padding:6px 12px;border:1px solid ' + lib.PAGE_COLORS.border + ';border-radius:8px;margin-bottom:6px;background:#fff;}' +
        '.nsq-qrow-on{border-color:' + lib.PAGE_COLORS.accent + ';box-shadow:inset 0 0 0 1px ' + lib.PAGE_COLORS.accent + ';}' +
        '.nsq-qtick{grid-area:tick;display:flex;align-items:center;}' +
        '.nsq-qtick input{width:20px;height:20px;margin:0;cursor:pointer;}' +
        '.nsq-qmain{grid-area:main;min-width:0;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;font-size:14px;}' +
        '.nsq-qmain a{font-weight:600;}' +
        '.nsq-qmeta{grid-area:meta;font-size:12px;color:' + lib.PAGE_COLORS.muted + ';white-space:nowrap;overflow:hidden;text-overflow:ellipsis;}' +
        '.nsq-sr{position:absolute;width:1px;height:1px;overflow:hidden;clip:rect(0 0 0 0);white-space:nowrap;}' +
        '.nsq-ql-short{display:none;}' +
        '.nsq-qin{display:contents;}' +
        '.nsq-qf{display:inline-flex;align-items:center;gap:6px;margin:0;}' +
        '.nsq-qf-units{grid-area:units;}.nsq-qf-comm{grid-area:comm;position:relative;}.nsq-qf-tpl{grid-area:tpl;}' +
        // 1.2.1: "= £154.39" under the commission input — absolutely placed, so the row keeps its height
        '.nsq-comm-calc{position:absolute;right:0;top:100%;font-size:10px;line-height:12px;color:' + lib.PAGE_COLORS.accent + ';white-space:nowrap;}' +
        '.nsq-qf[hidden]{display:none;}' +
        '.nsq-ql{font-size:12px;color:' + lib.PAGE_COLORS.muted + ';white-space:nowrap;}' +
        '.nsq-qrow .nsq-input{min-height:32px;height:32px;padding:4px 8px;font-size:14px;text-align:right;}' +
        '.nsq-qrow .nsq-units{width:56px;}.nsq-qrow .nsq-comm{width:72px;}.nsq-qrow .nsq-tpl{width:200px;text-align:left;}' +
        '.nsq-qrow:not(.nsq-qrow-on) .nsq-qf{opacity:.45;}' +
        '.nsq-qprice{grid-area:price;text-align:right;white-space:nowrap;line-height:1.2;}' +
        '.nsq-qprice strong{display:block;font-size:14px;}' +
        '.nsq-qsub{display:block;font-size:11px;color:' + lib.PAGE_COLORS.muted + ';}' +
        '.nsq-dep{color:' + lib.PAGE_COLORS.accent + ';font-weight:600;}' +
        '.nsq-tag-exp{display:inline-block;background:#fbeaea;color:#7a1d1d;border-radius:999px;padding:0 7px;font-size:11px;font-weight:600;vertical-align:1px;}' +
        '.nsq-qtotal{margin-top:10px;padding-top:10px;border-top:1px solid ' + lib.PAGE_COLORS.border + ';text-align:right;}' +
        '.nsq-qtotal-line{font-weight:600;}' +
        '.nsq-qtotal-ex,.nsq-sum-ex{font-size:12px;color:' + lib.PAGE_COLORS.muted + ';}' +
        '.nsq-seg-row{display:inline-flex;flex:0 0 auto;border:1px solid ' + lib.PAGE_COLORS.border + ';border-radius:8px;overflow:hidden;}' +
        '.nsq-seg{position:relative;cursor:pointer;}' +
        '.nsq-seg input{position:absolute;opacity:0;width:1px;height:1px;}' +
        '.nsq-seg span{display:inline-flex;align-items:center;min-height:32px;padding:0 10px;font-size:13px;background:#fff;color:' + lib.PAGE_COLORS.text + ';}' +
        '.nsq-seg + .nsq-seg span{border-left:1px solid ' + lib.PAGE_COLORS.border + ';}' +
        '.nsq-seg input:checked + span{background:' + lib.PAGE_COLORS.accent + ';color:#fff;font-weight:600;}' +
        '.nsq-seg input:focus-visible + span{outline:2px solid ' + lib.PAGE_COLORS.accent + ';outline-offset:-4px;}' +
        '.nsq-seg input:disabled + span{cursor:not-allowed;}' +
        '@media (max-width:1000px){.nsq-qrow{grid-template-columns:24px minmax(0,1fr) auto;grid-template-areas:"tick main price" "tick meta price" ". in in";}' +
            '.nsq-qin{grid-area:in;display:flex;flex-wrap:wrap;align-items:center;gap:6px 10px;}' +
            '.nsq-ql-long{display:none;}.nsq-ql-short{display:inline;}' +
            '.nsq-qrow .nsq-units{width:44px;}.nsq-qrow .nsq-comm{width:56px;}.nsq-qrow .nsq-seg span{padding:0 7px;}' +
            '.nsq-qf-tpl{flex:1 1 100%;}.nsq-qrow .nsq-tpl{width:100%;}}' +
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
        '    var on = r.querySelector(".nsq-qsel").checked, em = emailOn();',
        '    if (on) r.classList.add("nsq-qrow-on"); else r.classList.remove("nsq-qrow-on");',
        '    each(r.querySelectorAll(".nsq-qin input, .nsq-qin select"), function (el) { el.disabled = !on; });',
        '    var tf = r.querySelector(".nsq-qf-tpl"), ts = r.querySelector(".nsq-tpl");',
        '    if (tf) tf.hidden = !em;',
        '    if (ts && !em) ts.disabled = true;',
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
        '      each(r.querySelectorAll(".nsq-comm-kind, .nsq-tpl"), function (k) { k.addEventListener("change", update); });',
        '    });',
        '    ["nsq-auth", "nsq-rep", "nsq-substatus", "nsq-valueprop"].forEach(function (id) { $(id).addEventListener("change", update); });',
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
        '      if (emailOn() && !r.querySelector(".nsq-tpl").value) return "Choose the confirmation email for " + name + ".";',
        '    }',
        '    if (!$("nsq-projtype").value) return "Choose a project type.";',
        '    if (!$("nsq-auth").value) return "Choose the order authority.";',
        '    if (!$("nsq-rep").value) return "Choose the sales rep taking the order.";',
        '    if (!$("nsq-substatus").value) return "Choose a sub-status.";',
        '    if (!$("nsq-valueprop").value) return "Choose a value proposition.";',
        '    if (emailOn()) {',
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
        '  function totals() {',
        '    var t = tickedRows(), sum = 0, ex = 0, dep = 0, exMissing = false;',
        '    t.forEach(function (r) {',
        '      sum += parseFloat(r.getAttribute("data-total")) || 0;',
        '      var e = r.getAttribute("data-exvat"); if (e === "") exMissing = true; else ex += parseFloat(e) || 0;',
        '      dep += parseFloat(r.getAttribute("data-deposit")) || 0;',
        '    });',
        '    var line = t.length + " order" + (t.length === 1 ? "" : "s") + " · " + money(sum) + " inc VAT" +',
        '      (root.getAttribute("data-upfront") === "1" ? " · Deposit " + money(dep) : "");',
        '    var exLine = !t.length ? "" : (exMissing ? "ex VAT not available for every quote" : money(ex) + " ex VAT");',
        '    return { line: line, ex: exLine };',
        '  }',
        '  function commCalc(r) {',   // 1.2.1: % × the row's ex VAT, display only (the server recalculates from the SO)
        '    var out = r.querySelector(".nsq-comm-calc"); if (!out) return;',
        '    var k = r.querySelector(".nsq-comm-kind:checked"), c = r.querySelector(".nsq-comm").value.trim(), ex = r.getAttribute("data-exvat");',
        '    var ok = k && k.value === "pct" && /^\\d+(\\.\\d{1,2})?$/.test(c) && parseFloat(c) <= 100 && ex !== "";',
        '    out.textContent = ok ? "= " + money(Math.round(parseFloat(c) * parseFloat(ex)) / 100) : "";',
        '  }',
        '  function summary() {',   // also refreshes the section 1 total, the footer's ex VAT line and the commission £ (display only)
        '    each(rows(), commCalc);',
        '    var tt = totals();',
        '    if ($("nsq-qtotal-line")) { $("nsq-qtotal-line").textContent = tt.line; $("nsq-qtotal-ex").textContent = tt.ex; }',
        '    $("nsq-sum-ex").textContent = tt.ex;',
        '    return tt.line;',
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
        var units = {}, commKind = {}, comm = {}, tpl = {};
        sel.ids.forEach(function (id) {
            if (!ID_RE.test(id)) return;
            tpl[id]      = String(params['custpage_tpl_' + id] || '');   // 1.2.0
            units[id]    = String(params['custpage_units_' + id] || '');
            commKind[id] = params['custpage_comm_kind_' + id] === 'amt' ? 'amt' : 'pct';
            comm[id]     = String(params['custpage_comm_' + id] || '');
        });
        return {
            sel:       sel.invalid ? [] : sel.ids,
            units:     units,
            commKind:  commKind,
            comm:      comm,
            tpl:       tpl,
            projType:  String(params.custpage_projtype || ''),
            auth:      String(params.custpage_auth || ''),
            rep:       String(params.custpage_rep || ''),
            subStatus: String(params.custpage_substatus || ''),
            valueProp: String(params.custpage_valueprop || ''),
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
    function reasonFor(q, e) {
        var msg = (e && e.message) || String(e);
        var name = q.tranId || ('Quote ' + q.id);
        return (/^ORDERLIB_/.test(String(e && e.name)) && /^[a-z]/.test(msg)) ? name + ' ' + msg : name + ': ' + msg;
    }

    /**
     * Validates everything (no writes), claims the token, guards against duplicates, creates one Sales
     * Order + order log per ticked quote, sends one template email per order (only if on), writes the Opportunity LAST and
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

        // Email first (1.2.0: a template per order; the attachments)
        var emailOn = params.custpage_email_on === 'T';
        var rcpt = null, sender = null, fromCode = '', ccMeEmail = '', attach = { files: [], bytes: 0 }, templates = [];
        if (emailOn) {
            var tpls = loadTemplates(cfg.emailTemplates);
            templates = tpls.list;
            if (!cfg.emailTemplates.length || !templates.length) return invalid(tpls.error ? COPY.badTemplates : COPY.noTemplates);
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
            var tplId = '';
            if (emailOn) {   // 1.2.0: one of the offered templates, for every ticked quote
                tplId = String(params['custpage_tpl_' + q.id] || '').trim();
                if (!tplId) return invalid('Choose the confirmation email for ' + name + '.');
                if (!hasOption(templates, tplId)) return invalid('The confirmation email chosen for ' + name + ' is not one of the offered templates.');
            }
            quotes.push({ q: q, units: u, commission: c ? { kind: kind, value: c } : null, templateId: tplId });
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

        // The status the parameter names must be one of this opportunity's options (else not written; amber)
        var statusTo = '', statusProblem = false;
        if (cfg.oppStatus) {
            if (hasOption(fieldOptions(opp, 'entitystatus'), cfg.oppStatus)) statusTo = cfg.oppStatus;
            else {
                statusProblem = true;
                log.error('CreateOrderSL.Config', S.oppStatus + ' = ' + cfg.oppStatus + ' is not a status option on Opportunity ' + opportunityId + '; the status will not be written');
            }
        }

        // ── Save guard — before the first write ─────────────────────────────────
        var guard = claimToken(restore.token, opportunityId);
        if (guard.dup) {
            var dp = { nsqs: 'ord', nsq: 'dup', nsqt: String(Math.floor(Date.now() / 1000)) };
            log.audit('CreateOrderSL.Redirect', 'Opportunity ' + opportunityId + ' — ' + JSON.stringify(dp));
            redirect.toRecord({ type: record.Type.OPPORTUNITY, id: opportunityId, isEditMode: false, parameters: dp });
            return;
        }

        // ── Duplicate guard: an SO created from a ticked quote refuses that quote ─
        var existing;
        try {
            existing = orderLib.findExistingOrders(quotes.map(function (x) { return x.q.id; }));
        } catch (e) {
            log.error('CreateOrderSL.Guard', 'Opportunity ' + opportunityId + ' — existing-order check failed: ' + e.message);
            releaseToken(guard.key, opportunityId);
            fail('Nothing was created:', 'existing orders could not be checked (' + e.message + '). Please try again.');
            return;
        }

        // ── One Sales Order + order log per quote, each in its own try/catch ─────
        var created = [], failed = [];
        var script = runtime.getCurrentScript();
        quotes.forEach(function (x) {
            if (existing[x.q.id]) {
                failed.push({ q: x.q, reason: (x.q.tranId || 'Quote ' + x.q.id) + ' already converted to ' + existing[x.q.id].join(', ') });
                return;
            }
            if (script.getRemainingUsage() < MIN_USAGE_TO_CONVERT + (emailOn ? EMAIL_UNITS * (created.length + 1) : 0)) {   // room for the emails too
                failed.push({ q: x.q, reason: (x.q.tranId || 'Quote ' + x.q.id) + ' not attempted (script usage limit) — please create it separately' });
                return;
            }
            try {
                var res = orderLib.convertQuote({
                    estimateId:  x.q.id,
                    oppId:       opportunityId,
                    projectType: projectType,
                    commission:  x.commission,
                    units:       x.units,
                    auth:        auth,
                    repId:       repId,
                    cfg:         { soForm: cfg.soForm, recordStatus: cfg.recordStatus, parentOppField: cfg.parentOppField, logKey: 'CreateOrderSL.Convert' }
                });
                created.push({ q: x.q, res: res, templateId: x.templateId });
            } catch (e) {
                var why = reasonFor(x.q, e);
                log.error('CreateOrderSL.Convert', 'Opportunity ' + opportunityId + ' — ' + why);
                failed.push({ q: x.q, reason: why });
            }
        });

        // ── Nothing created: no email, no opportunity write, the token is released ─
        if (!created.length) {
            releaseToken(guard.key, opportunityId);
            log.audit('CreateOrderSL.Summary', 'Opportunity ' + opportunityId + ' — nothing created: ' + failed.map(function (f) { return f.reason; }).join(' | '));
            fail('Nothing was created:', failed.map(function (f) { return f.reason; }).join(' · '));
            return;
        }

        // ── The emails (1.2.0) — only if switched on; one per order created, each from its template ──
        var emailState = 'off', emailsSent = [], emailsFailed = [];
        if (emailOn) {
            var cc = [];
            var me = ccMeEmail.toLowerCase();
            if (rcpt.ccMe && !rcpt.to.some(function (a) { return a.toLowerCase() === me; })) cc.push(ccMeEmail);
            created.forEach(function (c) {
                var label = c.res.tranId || ('SO ' + c.res.soId);
                if (script.getRemainingUsage() < EMAIL_UNITS + 30) {
                    emailsFailed.push(c.res.soId);
                    log.error('CreateOrderSL.Email', label + ' — not sent (script usage limit)');
                    return;
                }
                var merged;
                try {
                    merged = render.mergeEmail({
                        templateId:    parseInt(c.templateId, 10),
                        entity:        { type: 'customer', id: parseInt(customerId, 10) },
                        recipient:     { type: 'customer', id: parseInt(customerId, 10) },
                        transactionId: parseInt(c.res.soId, 10)
                    });
                } catch (e) {
                    emailsFailed.push(c.res.soId);
                    log.error('CreateOrderSL.Email', label + ' — template ' + c.templateId + ' could not be merged (a legacy CRMSDK template can’t be; it must be FreeMarker); not sent: ' + ((e && e.message) || String(e)));
                    return;
                }
                log.audit('CreateOrderSL.Email', label + ' (SO ' + c.res.soId + ') — template ' + c.templateId + ' merged; from ' + fromCode +
                    ' (employee ' + sender.id + '), ' + rcpt.to.length + ' recipient' + (rcpt.to.length === 1 ? '' : 's') + (cc.length ? ' + CC me' : '') +
                    ', ' + attach.files.length + ' attachment' + (attach.files.length === 1 ? '' : 's') + ' (' + attach.bytes + ' bytes)');
                try {
                    var opts = {
                        author:         sender.id,
                        recipients:     rcpt.to,
                        subject:        merged.subject,
                        body:           merged.body,
                        relatedRecords: { transactionId: parseInt(c.res.soId, 10), entityId: parseInt(customerId, 10) }
                    };
                    if (cc.length) opts.cc = cc;
                    if (attach.files.length) opts.attachments = attach.files;
                    email.send(opts);
                    emailsSent.push(c.res.soId);
                    log.audit('CreateOrderSL.Email', label + ' — sent');
                } catch (e) {
                    emailsFailed.push(c.res.soId);
                    log.error('CreateOrderSL.Email', label + ' — email FAILED: ' + ((e && e.message) || String(e)));
                }
            });
            emailState = emailsSent.length ? 'sent' : 'fail';
        }

        // ── The Opportunity — LAST ───────────────────────────────────────────────
        var oppUpdate = lib.updateFields(opportunityId, updParams, RULES);
        var extra = {}, extraKeys = [];
        if (subStatus !== currentValue(opp, OPP_FIELDS.subStatus)) { extra[OPP_FIELDS.subStatus] = subStatus; extraKeys.push('sub_status'); }
        if (valueProp !== currentValue(opp, OPP_FIELDS.valueProp)) { extra[OPP_FIELDS.valueProp] = valueProp; extraKeys.push('value_prop'); }
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
        if (emailState === 'sent') { p.nsqe = 'sent'; p.nsqen = String(emailsSent.length); }   // 1.2.0: nsqen = emails sent
        else if (emailState === 'fail') { p.nsqe = 'fail'; p.nsq = 'warn'; }
        if (emailsFailed.length) { p.nsq = 'warn'; p.nsqef = emailsFailed.join(','); }   // 1.2.0: the orders whose email failed

        log.audit('CreateOrderSL.Summary', 'Opportunity ' + opportunityId + ' — created ' +
            created.map(function (c) { return (c.res.tranId || c.res.soId) + ' from ' + c.q.tranId + (c.res.logId ? ' (log ' + c.res.logId + ')' : ' (NO LOG)'); }).join(', ') +
            '; failed ' + (failed.map(function (f) { return f.reason; }).join(' | ') || 'none') +
            '; warnings ' + (created.reduce(function (a, c) { return a.concat(c.res.warnings); }, []).join(' | ') || 'none') +
            '; fields ' + (oppUpdate.error ? 'FAILED' : (oppUpdate.changed.map(function (c) { return c.key; }).join(',') || 'none')) +
            ' + ' + (extraKeys.join(',') || 'none') + (extraError ? ' (FAILED)' : '') +
            '; email ' + (emailOn ? 'sent for ' + (emailsSent.join(',') || 'none') + ', NOT sent for ' + (emailsFailed.join(',') || 'none') : 'off') +
            '; usage left ' + script.getRemainingUsage());
        log.audit('CreateOrderSL.Redirect', 'Opportunity ' + opportunityId + ' — ' + JSON.stringify(p));

        redirect.toRecord({ type: record.Type.OPPORTUNITY, id: opportunityId, isEditMode: false, parameters: p });
    }

    return {
        onRequest: onRequest
    };

});
