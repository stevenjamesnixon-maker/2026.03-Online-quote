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
 * @version     1.1.0
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
 *   The settings search failing (no View permission on the record, no record type) → the page refuses:
 *   "Create order can’t run: its settings can’t be read. Ask an administrator."
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
 *     (each in its own try/catch) → the email (only if switched on; only the orders created) → the
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
    './nuheat_opp_update_lib',
    './nuheat_order_lib'
], function (serverWidget, search, record, log, redirect, runtime, cache, url, lib, orderLib) {

    'use strict';

    var SCRIPT_VERSION = '1.1.0';

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
        parentOppField:  'ORDER_PARENT_OPP_FIELD'
    };
    var SETTING_KEYS = Object.keys(S).map(function (k) { return S[k]; });

    var ADMIN_ROLE_ID = 'administrator';   // the standard Administrator role's script ID (roleId)

    var MAX_QUOTES = 8;           // per submission (governance)
    var MIN_USAGE_TO_CONVERT = 100;   // units left before another quote is attempted
    var UNITS_MAX = 999999;
    var EMAIL_MESSAGE_MAX = 10000;

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
        peCardEmail:  'design@nu-heat.co.uk',   // Update Opportunity's rule for the project engineer's card
        modeOff:      'Create order is switched off.',
        modeAdmin:    'Create order is only available to administrators at the moment.',
        noSettings:   'Create order can’t run: its settings can’t be read. Ask an administrator.'
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

    /** Active sales reps by name: [{ id, text }]. [] (logged) on failure. */
    function loadSalesReps() {
        var out = [];
        try {
            search.create({
                type:    search.Type.EMPLOYEE,
                filters: [['issalesrep', 'is', 'T'], 'AND', ['isinactive', 'is', 'F']],
                columns: [search.createColumn({ name: 'entityid', sort: search.Sort.ASC }), 'internalid']
            }).run().each(function (r) {
                out.push({ id: String(r.getValue({ name: 'internalid' })), text: lib.cleanText(r.getValue({ name: 'entityid' })) });
                return true;
            });
        } catch (e) {
            log.error('CreateOrderSL.Lists', 'Sales reps could not be read: ' + e.message);
        }
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
        page.reps         = loadSalesReps();
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
        var h = [];
        h.push('<div class="nsq-qrow' + (sel ? ' nsq-qrow-on' : '') + '" data-qid="' + escapeHtml(q.id) + '" data-tranid="' + escapeHtml(name) +
            '" data-total="' + escapeHtml(q.total === null ? '' : String(q.total)) + '" data-projtype="' + escapeHtml(pt) + '">');
        h.push('<label class="nsq-qtick"><input type="checkbox" class="nsq-qsel" data-qid="' + escapeHtml(q.id) + '"' + (sel ? ' checked' : '') +
            ' aria-label="Order ' + escapeHtml(name) + '"></label>');
        h.push('<div class="nsq-q"><div class="nsq-q-title">' +
            (link ? '<a href="' + escapeHtml(link) + '" target="_blank" rel="noopener">' + escapeHtml(name) + '</a>' : escapeHtml(name)) +
            (text ? ' · ' + escapeHtml(text) : '') +
            (q.expired ? ' <span class="nsq-tag-exp">' + escapeHtml(COPY.expired) + '</span>' : '') + '</div>' +
            '<div class="nsq-q-desc">' + [q.dateCreated ? 'Created ' + q.dateCreated : '', q.quoteTypeText].filter(function (s) { return s; }).map(escapeHtml).join(' · ') + '</div></div>');
        h.push('<div class="nsq-price"><strong>' + escapeHtml(q.total === null ? '—' : orderLib.money(q.total)) + '</strong>' +
            (q.exVat === null ? '' : '<span class="nsq-exvat">' + escapeHtml(orderLib.money(q.exVat)) + ' ex VAT</span>') +
            (page.upFront && q.deposit !== null && q.deposit > 0 ? '<span class="nsq-dep">Deposit ' + escapeHtml(orderLib.money(q.deposit)) + '</span>' : '') +
            '</div>');
        var uid = 'nsq-units-' + q.id, cid = 'nsq-comm-' + q.id;
        h.push('<div class="nsq-qin">' +
            '<div class="nsq-field"><label class="nsq-label" for="' + uid + '">Units <span class="nsq-req" aria-hidden="true">*</span></label>' +
            '<input type="text" inputmode="numeric" class="nsq-input nsq-units" id="' + uid + '" name="custpage_units_' + escapeHtml(q.id) +
            '" maxlength="6" autocomplete="off" value="' + escapeHtml(units) + '"></div>' +
            '<div class="nsq-field"><label class="nsq-label" for="' + cid + '">Partner commission <span class="nsq-opt">(optional)</span></label>' +
            '<div class="nsq-comm-row"><span class="nsq-seg-row" role="radiogroup" aria-label="Commission as">' +
            '<label class="nsq-seg"><input type="radio" class="nsq-comm-kind" name="custpage_comm_kind_' + escapeHtml(q.id) + '" value="pct"' + (kind === 'pct' ? ' checked' : '') + '><span>%</span></label>' +
            '<label class="nsq-seg"><input type="radio" class="nsq-comm-kind" name="custpage_comm_kind_' + escapeHtml(q.id) + '" value="amt"' + (kind === 'amt' ? ' checked' : '') + '><span>£</span></label>' +
            '</span><input type="text" inputmode="decimal" class="nsq-input nsq-comm" id="' + cid + '" name="custpage_comm_' + escapeHtml(q.id) +
            '" maxlength="12" autocomplete="off" value="' + escapeHtml(comm) + '"></div></div>' +
            '</div>');
        h.push('</div>');
        return h.join('');
    }

    function buildPageHTML(page, restore, error) {
        var r = restore || {};
        var emailOn = restore ? r.emailOn === true : false;   // off by default; never automatic
        var emailFresh = !restore || !emailOn;
        var h = [];
        h.push(lib.baseCss() + PAGE_CSS);
        h.push('<div id="nsq-root" class="nsq" data-opp-url="' + escapeHtml(page.oppUrl) + '">');
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
            page.quotes.forEach(function (q) { h.push(quoteRowHTML(q, page, r)); });
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

        // ── 4 Confirmation email ──
        h.push('<section class="nsq-card"><h2 class="nsq-h2"><span class="nsq-num">4</span>Confirmation email' +
            switchHTML('nsq-email-on', 'Send the customer an order confirmation', emailOn, 'nsq-email-off') + '</h2>');
        h.push('<div id="nsq-email-body"' + (emailOn ? '' : ' hidden') + '>');
        var defaultFrom = page.senders.some(function (o) { return o.code === 'rep'; }) ? 'rep' : 'me';
        var fromCode = (!emailFresh && page.senders.some(function (o) { return o.code === r.from; })) ? r.from : defaultFrom;
        var fromOpt = page.senders.filter(function (o) { return o.code === fromCode; })[0];
        h.push('<div class="nsq-field"><label class="nsq-label" for="nsq-email-from">From</label>' +
            '<select id="nsq-email-from" name="custpage_email_from" class="nsq-input">' +
            page.senders.map(function (o) {
                return '<option value="' + o.code + '"' + (o.code === fromCode ? ' selected' : '') + '>' + escapeHtml(o.label) + '</option>';
            }).join('') + '</select></div>');
        h.push(lib.buildRecipientsHTML(page.contacts, page.customerEmail, emailFresh ? { customer: !!page.customerEmail } : r.rcpt));
        h.push('<div class="nsq-field"><label class="nsq-label" for="nsq-email-message">Message <span class="nsq-opt">(optional)</span></label>' +
            '<textarea class="nsq-input nsq-textarea" id="nsq-email-message" name="custpage_email_message" rows="6" maxlength="' + EMAIL_MESSAGE_MAX + '">' +
            escapeHtml(emailFresh ? '' : (r.message || '')) + '</textarea></div>');
        h.push('<p class="nsq-help nsq-email-note" id="nsq-email-note" data-note-me="' + escapeHtml(COPY.pageNote) +
            '" data-note-pre="' + escapeHtml(COPY.pageNoteOtherStart) + '" data-note-post="' + escapeHtml(COPY.pageNoteOtherEnd) + '">' +
            escapeHtml(senderNote(fromOpt)) + '</p>');
        h.push('<p class="nsq-help">The email lists only the orders actually created' + (page.upFront ? ', with the deposit due.' : '. No deposit is shown: this customer is on account terms.') + '</p>');
        h.push('</div></section>');

        h.push('</div>'); // .nsq-wrap

        // ── Sticky footer ──
        h.push('<div class="nsq-footer"><div class="nsq-footer-in">');
        h.push('<div class="nsq-sum"><div class="nsq-sum-main" id="nsq-sum-line"></div><div class="nsq-sum-sub" id="nsq-sum-changes"></div></div>');
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
        '.nsq-textarea{min-height:100px;resize:vertical;font-family:inherit;}' +
        '.nsq-switch{margin-left:auto;display:inline-flex;align-items:center;gap:6px;font-size:14px;font-weight:400;cursor:pointer;}' +
        '.nsq-switch input{width:18px;height:18px;}' +
        '.nsq-off{font-size:13px;font-weight:600;color:' + lib.PAGE_COLORS.muted + ';}' +
        '.nsq-tick{display:flex;align-items:center;gap:8px;min-height:36px;font-size:14px;cursor:pointer;}' +
        '.nsq-tick input{width:18px;height:18px;}' +
        '.nsq-tick-addr{color:' + lib.PAGE_COLORS.muted + ';}' +
        '.nsq-email-note{margin-top:12px;}' +
        '.nsq-qrow{display:grid;grid-template-columns:auto 1fr auto;gap:8px 16px;align-items:start;border:1px solid ' + lib.PAGE_COLORS.border + ';border-radius:10px;padding:12px 14px;margin-bottom:8px;}' +
        '.nsq-qrow-on{border:2px solid ' + lib.PAGE_COLORS.accent + ';padding:11px 13px;}' +
        '.nsq-qtick input{width:22px;height:22px;margin-top:2px;cursor:pointer;}' +
        '.nsq-qin{grid-column:2 / -1;display:grid;grid-template-columns:repeat(auto-fit,minmax(180px,260px));gap:12px 16px;}' +
        '.nsq-qin .nsq-field{margin-bottom:0;}' +
        '.nsq-tag-exp{display:inline-block;background:#fbeaea;color:#7a1d1d;border-radius:999px;padding:1px 8px;font-size:12px;font-weight:600;vertical-align:middle;}' +
        '.nsq-dep{display:block;color:' + lib.PAGE_COLORS.accent + ';font-size:13px;font-weight:600;}' +
        '.nsq-comm-row{display:flex;gap:8px;align-items:center;}' +
        '.nsq-seg-row{display:inline-flex;flex:0 0 auto;border:1px solid ' + lib.PAGE_COLORS.border + ';border-radius:8px;overflow:hidden;}' +
        '.nsq-seg{position:relative;cursor:pointer;}' +
        '.nsq-seg input{position:absolute;opacity:0;width:1px;height:1px;}' +
        '.nsq-seg span{display:inline-flex;align-items:center;min-height:42px;padding:0 12px;font-size:14px;background:#fff;color:' + lib.PAGE_COLORS.text + ';}' +
        '.nsq-seg + .nsq-seg span{border-left:1px solid ' + lib.PAGE_COLORS.border + ';}' +
        '.nsq-seg input:checked + span{background:' + lib.PAGE_COLORS.accent + ';color:#fff;font-weight:600;}' +
        '.nsq-seg input:focus-visible + span{outline:2px solid ' + lib.PAGE_COLORS.accent + ';outline-offset:-4px;}' +
        '.nsq-seg input:disabled + span{opacity:.5;cursor:not-allowed;}' +
        '@media (max-width:700px){.nsq-qrow{grid-template-columns:auto 1fr;}.nsq-qrow .nsq-price{grid-column:2;text-align:left;}}' +
        '</style>';

    /**
     * This page's part of the inline script (hook contract: lib header), after the library's
     * RECIPIENTS_SCRIPT. STATIC — everything is read from the page (data- attributes, values); nothing
     * is interpolated. The project type follows the ticked quotes (data-projtype, data-mixed) until the
     * rep chooses one themselves.
     */
    var PAGE_PART = [
        '  var ptTouched = false;',
        '  function rows() { return root.querySelectorAll(".nsq-qrow"); }',
        '  function tickedRows() {',
        '    var out = [];',
        '    each(rows(), function (r) { var c = r.querySelector(".nsq-qsel"); if (c && c.checked) out.push(r); });',
        '    return out;',
        '  }',
        '  function emailOn() { var s = $("nsq-email-on"); return !!(s && s.checked); }',
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
        '    each(r.querySelectorAll(".nsq-qin input"), function (el) { el.disabled = !on; });',
        '  }',
        '  function money(n) { return "£" + n.toFixed(2).replace(/\\B(?=(\\d{3})+(?!\\d))/g, ","); }',
        '  function setEmail() {',
        '    var on = emailOn(), body = $("nsq-email-body");',
        '    body.hidden = !on;',
        '    each(body.querySelectorAll("input, select, textarea"), function (el) { el.disabled = !on; });',
        '    $("nsq-email-off").hidden = on;',
        '    $("nsq-email-on-val").value = on ? "T" : "F";',
        '  }',
        '  function pageInit() {',
        '    var pt = $("nsq-projtype");',
        '    if (pt.getAttribute("data-touched") === "1") ptTouched = true;',
        '    pt.addEventListener("change", function () { ptTouched = true; update(); });',
        '    each(rows(), function (r) {',
        '      setRow(r);',
        '      r.querySelector(".nsq-qsel").addEventListener("change", function () { setRow(r); applyInference(); update(); });',
        '      each(r.querySelectorAll(".nsq-comm-kind"), function (k) { k.addEventListener("change", update); });',
        '    });',
        '    ["nsq-auth", "nsq-rep", "nsq-substatus", "nsq-valueprop"].forEach(function (id) { $(id).addEventListener("change", update); });',
        '    $("nsq-email-message").addEventListener("input", update);',
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
        '    }',
        '    if (!$("nsq-projtype").value) return "Choose a project type.";',
        '    if (!$("nsq-auth").value) return "Choose the order authority.";',
        '    if (!$("nsq-rep").value) return "Choose the sales rep taking the order.";',
        '    if (!$("nsq-substatus").value) return "Choose a sub-status.";',
        '    if (!$("nsq-valueprop").value) return "Choose a value proposition.";',
        '    if (emailOn()) {',
        '      var msg = $("nsq-email-message");',
        '      if (msg.value.trim().length > msg.maxLength) return "The message is too long.";',
        '      var rp = recipientsProblem();',
        '      if (rp) return rp;',
        '    }',
        '    return "";',
        '  }',
        '  function summary() {',
        '    var t = tickedRows(), sum = 0;',
        '    t.forEach(function (r) { sum += parseFloat(r.getAttribute("data-total")) || 0; });',
        '    return t.length + " order" + (t.length === 1 ? "" : "s") + " · " + money(sum) + " inc VAT · email " + (emailOn() ? "on" : "off");',
        '  }',
        '  function beforeSubmit() {',
        '    $("nsq-q-sel").value = JSON.stringify(tickedRows().map(function (r) { return r.getAttribute("data-qid"); }));',
        '    if (emailOn()) recipientsBeforeSubmit();',
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
            projType:  String(params.custpage_projtype || ''),
            auth:      String(params.custpage_auth || ''),
            rep:       String(params.custpage_rep || ''),
            subStatus: String(params.custpage_substatus || ''),
            valueProp: String(params.custpage_valueprop || ''),
            upd:       lib.readPostedUpdateValues(params),
            emailOn:   params.custpage_email_on === 'T',
            from:      String(params.custpage_email_from || ''),
            message:   String(params.custpage_email_message || ''),
            rcpt:      lib.readPostedRecipients(params),
            token:     String(params.custpage_save_token || '')
        };
    }

    /** A failure reason with the quote's number: "EST901 is not an open quote…" / "EST901: total differs…". */
    function reasonFor(q, e) {
        var msg = (e && e.message) || String(e);
        var name = q.tranId || ('Quote ' + q.id);
        return (/^ORDERLIB_/.test(String(e && e.name)) && /^[a-z]/.test(msg)) ? name + ' ' + msg : name + ': ' + msg;
    }

    /**
     * Validates everything (no writes), claims the token, guards against duplicates, creates one Sales
     * Order + order log per ticked quote, sends the email (only if on), writes the Opportunity LAST and
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

        // Email first: its customer lookup (email + terms) also decides the deposit
        var emailOn = params.custpage_email_on === 'T';
        var message = '', rcpt = null, sender = null, fromCode = '', ccMeEmail = '', upFront = false;
        if (emailOn) {
            message = String(params.custpage_email_message || '').trim();
            if (message.length > EMAIL_MESSAGE_MAX) return invalid('The message is longer than ' + EMAIL_MESSAGE_MAX + ' characters.');
            var cust = {};
            if (customerId) {
                try {
                    cust = search.lookupFields({ type: search.Type.CUSTOMER, id: customerId, columns: ['email', 'terms'] }) || {};
                } catch (e) {
                    log.error('CreateOrderSL.Email', 'Opportunity ' + opportunityId + ' — customer lookup failed: ' + e.message);
                }
            }
            upFront = orderLib.paysUpFront(firstId(cust.terms), cfg.prepayTerms);
            var postedR = lib.readPostedRecipients(params);
            var rcptContacts = postedR.contacts.length ? lib.loadContacts(opportunityId, 'CreateOrderSL') : [];
            rcpt = lib.resolveRecipients(params, rcptContacts, postedR.customer ? lib.lookupText(cust.email) : '');
            if (rcpt.error) return invalid(rcpt.error);
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
            sender.cardEmail = fromCode === 'pe' ? COPY.peCardEmail : sender.email;
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

        // Quotes: OPEN Estimates on THIS opportunity (the header search; extras only for the email's deposit)
        var listing = orderLib.listOrderableQuotes(opportunityId, { extras: emailOn && upFront, logKey: 'CreateOrderSL.List' });
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

        var repId = String(params.custpage_rep || '').trim();
        if (!ID_RE.test(repId)) return invalid('Choose the sales rep taking the order.');
        var repOk = false;
        try {
            var rf = search.lookupFields({ type: search.Type.EMPLOYEE, id: repId, columns: ['issalesrep', 'isinactive'] }) || {};
            repOk = isTrue(rf.issalesrep) && !isTrue(rf.isinactive);
        } catch (e) {
            log.debug('CreateOrderSL.Validation', 'Rep ' + repId + ' lookup failed: ' + e.message);
        }
        if (!repOk) return invalid('The sales rep taking the order must be an active sales rep.');

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
            if (script.getRemainingUsage() < MIN_USAGE_TO_CONVERT) {
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
                created.push({ q: x.q, res: res });
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

        // ── The email — only if switched on; only the orders created ──────────────
        var emailState = 'off', emailCount = 0;
        if (emailOn) {
            var cc = [];
            var me = ccMeEmail.toLowerCase();
            if (rcpt.ccMe && !rcpt.to.some(function (a) { return a.toLowerCase() === me; })) cc.push(ccMeEmail);
            var body = null;
            try {
                body = orderLib.orderConfirmationEmail({
                    orders: created.map(function (c) {
                        return { tranId: c.res.tranId || ('SO ' + c.res.soId), description: c.q.description || c.q.title || c.q.tranId,
                                 quoteTypeText: c.q.quoteTypeText, total: c.res.total !== null ? c.res.total : c.q.total, deposit: c.q.deposit };
                    }),
                    customerPaysUpFront: upFront,
                    sender:  sender,
                    message: message,
                    opp:     { tranId: currentValue(opp, 'tranid') }
                });
            } catch (e) {
                log.error('CreateOrderSL.Email', 'Opportunity ' + opportunityId + ' — email body could not be built; not sent: ' + ((e && e.message) || String(e)));
            }
            log.audit('CreateOrderSL.Email', 'Opportunity ' + opportunityId + ' — from ' + fromCode + ' (employee ' + sender.id + '), ' + created.length + ' order(s), deposit rows ' + (upFront ? 'on' : 'off'));
            if (body === null) {
                emailState = 'fail';
            } else {
                var sent = lib.sendEmail({ author: sender.id, to: rcpt.to, cc: cc, subject: orderLib.EMAIL_COPY.subject, body: body,
                    customerId: customerId, oppId: opportunityId, logKey: 'CreateOrderSL.Email' });
                emailState = sent.ok ? 'sent' : 'fail';
            }
            emailCount = rcpt.to.length;
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
        if (emailState === 'sent') { p.nsqe = 'sent'; p.nsqen = String(emailCount); }
        else if (emailState === 'fail') { p.nsqe = 'fail'; p.nsq = 'warn'; }

        log.audit('CreateOrderSL.Summary', 'Opportunity ' + opportunityId + ' — created ' +
            created.map(function (c) { return (c.res.tranId || c.res.soId) + ' from ' + c.q.tranId + (c.res.logId ? ' (log ' + c.res.logId + ')' : ' (NO LOG)'); }).join(', ') +
            '; failed ' + (failed.map(function (f) { return f.reason; }).join(' | ') || 'none') +
            '; warnings ' + (created.reduce(function (a, c) { return a.concat(c.res.warnings); }, []).join(' | ') || 'none') +
            '; fields ' + (oppUpdate.error ? 'FAILED' : (oppUpdate.changed.map(function (c) { return c.key; }).join(',') || 'none')) +
            ' + ' + (extraKeys.join(',') || 'none') + (extraError ? ' (FAILED)' : '') +
            '; email ' + emailState + (emailOn ? ' (' + emailCount + ' recipient' + (emailCount === 1 ? '' : 's') + ')' : '') +
            '; usage left ' + script.getRemainingUsage());
        log.audit('CreateOrderSL.Redirect', 'Opportunity ' + opportunityId + ' — ' + JSON.stringify(p));

        redirect.toRecord({ type: record.Type.OPPORTUNITY, id: opportunityId, isEditMode: false, parameters: p });
    }

    return {
        onRequest: onRequest
    };

});
