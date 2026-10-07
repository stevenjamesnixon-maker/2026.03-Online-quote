/**
 * @NApiVersion 2.1
 * @NModuleScope Public
 *
 * @name        Nu-Heat Order Library
 * @description Turning open quotes (Estimates) into Sales Orders: the orderable-quote listing, the
 *              conversion in two phases (1.3.0: every quote locked, re-checked, guarded against duplicates,
 *              transformed and total-checked BEFORE any save; then each saved → total check → order log), project-type inference and the settings record. Used by the
 *              reps' "Create order" page (nuheat_create_order_sl.js); written for reuse by the
 *              customer version (part 2), which will run as Administrator.
 * @version     1.3.0
 * @author      Nu-Heat Development
 *
 * ⚠️ DEPLOYMENT: a shared AMD module — no script record, no deployment. Upload it to
 *    SuiteScripts/NuHeat/2026 Quote/ AFTER nuheat_opp_update_lib.js (which it requires as
 *    './nuheat_opp_update_lib') and BEFORE nuheat_create_order_sl.js, or the Suitelet fails at load time.
 *
 * ⚠️ EXTERNAL CONSUMER (planned): the customer version of Create order (part 2) will require this
 *    library. Don't rename, move or change the signatures of listOrderableQuotes, convertQuotes,
 *    prepareOrder, saveOrder, releaseOrder, convertQuote, findExistingOrders, inferProjectType,
 *    paysUpFront, loadListOptions, loadOrderSettings, parseSettingRows or LIB_VERSION without a matching
 *    change there. 1.3.0: part 2 converts through convertQuotes (or prepareOrder for every quote, then
 *    saveOrder for each) — NOT convertQuote in a loop, which fails from the second quote (see 1.3.0).
 *
 * ⚠️ RECORD DEPENDENCY (1.1.0): the settings live on the customer dashboard's settings record,
 *    customrecord_cdb_setting (Name = the key, custrecord_cdb_setting_value = the value). This is a
 *    record dependency, not a code dependency: nothing of the dashboard is required. The rules mirror
 *    the dashboard's cdb_lib_config.js 3.x (trimmed Name, blank = missing, two active rows = that key
 *    missing, a failed search = every key missing).
 *
 * CHANGELOG v1.3.0 (Create order amendment 6 — several quotes, when NetSuite closes the siblings; Steve 7 Oct):
 *   - FIXED: with two quotes ticked, the second was always refused ("is not an open quote on this opportunity"):
 *     saving the first SO makes NetSuite mark the opportunity's other open quotes as no longer open (Processed),
 *     and convertQuote re-checked openness per quote AFTER the earlier save.
 *   - ADDED: convertQuotes(orders, common) — phase 1 prepares every quote (lock → re-check → duplicate guard →
 *     transform → fields → total check; nothing saved) while all are still open; any refusal releases every lock
 *     and saves nothing. Phase 2 saves each (no re-check) → total check after save → order log; a failed save
 *     never stops the others. Logs "prepared n/n" and each save.
 *   - ADDED: prepareOrder(o), saveOrder(prepared), releaseOrder(prepared) — the two phases for one quote.
 *     convertQuote(o) = saveOrder(prepareOrder(o)), for a single quote. A failed save now logs NetSuite's
 *     message (and error name) at error and releases the lock.
 *   - The duplicate guard moves inside phase 1 (ORDERLIB_DUPLICATE "already converted to SO…"): one
 *     findExistingOrders search for the submission, checked per quote after its lock and re-check.
 *
 * CHANGELOG v1.2.1 (Create order amendment 3 — partner commission always as £, Steve 6 Oct 2026):
 *   - custbody_partner_commission_amount (£) is written on EVERY new SO, as a number: the £ entered; or,
 *     for a %, round(% × base / 100, 2); or 0 when nothing was entered. custbody_partner_commission (%) is
 *     written only when the rep chose %, holding the % entered.
 *   - Base = the transformed SO's total − taxtotal, read before save (ex VAT, after discounts — the same total
 *     the 1p check reads). With a % and no readable base → not saved: "commission could not be calculated".
 *   - Audit: "commission: 5% → £64.33 (base £1,286.61)" or "commission: £250.00".
 *
 * CHANGELOG v1.2.0 (Create order amendment 2 — template emails, 6 Oct 2026):
 *   - REMOVED: orderConfirmationEmail and EMAIL_COPY (with their emailText / messageParagraphs helpers).
 *     The confirmation is now a NetSuite email template per order, merged and sent by the Suitelet
 *     (render.mergeEmail + email.send); the template owns the wording. Nothing else changed.
 *
 * CHANGELOG v1.1.0 (Create order amendment 1 — settings from the settings record, 6 Oct 2026):
 *   - ADDED: loadOrderSettings(keys, logKey) — one search of customrecord_cdb_setting (~10 units),
 *     parsed by the pure parseSettingRows(list, keys). Logs found / missing keys once at audit (never
 *     the values), a duplicate key at error (ORDER_SETTING_DUPLICATE, naming the row IDs) and a failed
 *     search at error (ORDER_SETTINGS_UNAVAILABLE).
 *
 * CHANGELOG v1.0.0 (Create order, part 1 — 6 Oct 2026):
 *   - listOrderableQuotes(oppId, opts): two searches, no Estimate loads — the header search (open
 *     Estimates, status Estimate:A, newest first) and a fail-safe extras search (units, deposit, ex VAT).
 *   - convertQuote(o): see its comment. TRUSTS NO INPUT: it re-checks that the Estimate is open and on
 *     the given opportunity itself, and checks the shape of every value it writes.
 *   - inferProjectType(quoteTypeIds, map, mixedId): pure.
 *   - orderConfirmationEmail(o) [removed in 1.2.0]: the v2 customer email (lib.emailShellV2, emailFactBoxV2,
 *     emailSenderCardV2) — one YOUR ORDER box per Sales Order.
 *   - paysUpFront(customerTermsId, prepayTermsIds): the customer dashboard's terms rule.
 *   - loadListOptions(listScriptId, logKey): a custom list's active options, read at run time.
 *
 * RULES:
 *   - No internal IDs in code: the form, the Record Status and every list value come from the caller
 *     (script parameters), or are read at run time by script ID.
 *   - Validate before any write. A refused or failed conversion throws (nothing was saved); once the
 *     Sales Order is saved, NOTHING throws — later problems are warnings and the SO stands (never
 *     deleted).
 *   - The order log's customer, revenue, margin, quote type, department… are sourced by NetSuite from
 *     its links. They are NEVER set here.
 */

define(['N/record', 'N/search', 'N/log', 'N/cache', 'N/format', './nuheat_opp_update_lib'],
function (record, search, log, cache, format, lib) {

    'use strict';

    var LIB_VERSION = '1.3.0';

    // ─── Account objects (script IDs only) ────────────────────────────────────────

    var EST = {
        units:     'custbody_qdt_number_of_units',
        deposit:   'custbody_deposit',            // inc VAT; only shown to customers who pay up front
        quoteType: 'custbody_quote_type',
        desc:      'custbody_quote_description',
        openStatus: 'Estimate:A'                  // the standard "Open" status filter value
    };

    var SO = {
        recordStatus: 'custbody_finance_status',
        projectType:  'custbody_bund_proj_type',
        commPct:      'custbody_partner_commission',          // percent
        commAmt:      'custbody_partner_commission_amount',   // £
        opportunity:  'opportunity',
        quoteType:    'custbody_quote_type'
    };

    /** The order log. Customer, revenue, margin, quote type, department… are sourced — never set. */
    var LOG = {
        record:    'customrecord_order_log',
        so:        'custrecord_order_so',
        parentOpp: 'custrecord_parent_opp',
        units:     'custrecord_order_units',
        auth:      'custrecord_order_auth',
        rep:       'custrecord_order_rep'
    };

    /** Body fields reported after the transform (carried or blank) — the audit log's evidence. */
    var CARRY_REPORT = ['entity', 'opportunity', 'custbody_quote_type', 'salesrep', 'department', 'class', 'location',
        'terms', 'custbody_qdt_number_of_units', 'custbody_deposit', 'custbody_bund_proj_type', 'custbody_finance_status',
        'custbody_partner_commission', 'custbody_partner_commission_amount', 'total', 'taxtotal'];

    var LOCK_CACHE = 'nh_order_estimate_lock';   // PUBLIC: the customer version must see the reps' locks
    var LOCK_TTL   = 300;                         // seconds (N/cache minimum)
    var TOTAL_TOLERANCE = 0.01;                   // 1p

    var ID_RE    = /^\d{1,12}$/;
    var FIELD_RE = /^[a-z][a-z0-9_]{2,60}$/;

    /** The customer dashboard's settings record (its cdb_lib_config.js SETTING_RECORD). */
    var SETTING = {
        type:  'customrecord_cdb_setting',
        name:  'name',
        value: 'custrecord_cdb_setting_value'
    };

    // ─── Small helpers ────────────────────────────────────────────────────────────

    function orderLibError(code, message) {
        var e = new Error(message);
        e.name = code;
        return e;
    }

    function str(v) { return v === null || v === undefined ? '' : String(v); }

    /** A search / lookupFields value as one id: [{ value }] → value; a plain value → itself. */
    function firstValue(v) {
        if (Array.isArray(v)) return v.length ? str(v[0].value) : '';
        return str(v);
    }

    /** A money string or number → a number, or null when not a finite number. */
    function num(v) {
        if (v === null || v === undefined || v === '') return null;
        var n = parseFloat(String(v).replace(/,/g, ''));
        return isFinite(n) ? n : null;
    }

    /** "£14,250.00" (−£1.00 for negatives — never "£-1.00"). */
    function money(n) {
        var v = Number(n);
        if (!isFinite(v)) return '';
        var neg = v < 0;
        var parts = Math.abs(v).toFixed(2).split('.');
        parts[0] = parts[0].replace(/\B(?=(\d{3})+(?!\d))/g, ',');
        return (neg ? '-£' : '£') + parts.join('.');
    }

    function parseDate(v) {
        if (v instanceof Date) return isNaN(v.getTime()) ? null : v;
        if (!v) return null;
        try {
            var d = format.parse({ value: String(v), type: format.Type.DATE });
            return (d instanceof Date && !isNaN(d.getTime())) ? d : null;
        } catch (e) {
            return null;
        }
    }

    function startOfDay(d) { return new Date(d.getFullYear(), d.getMonth(), d.getDate()); }

    // ─── Settings (1.1.0): the customer dashboard's settings record ───────────────

    /**
     * PURE. The rows of customrecord_cdb_setting → the values of the keys asked for. The dashboard's
     * rules (cdb_lib_config.js 3.x): the Name is trimmed before matching (case as typed); a blank value
     * is missing; two or more active rows for one key make that key missing (fail closed). Rows for
     * other keys are ignored. Values are returned trimmed, unparsed (the caller parses by kind).
     *
     * @param {Array<{id: string, name: *, value: *}>} list - active rows
     * @param {string[]} keys
     * @returns {{ values: Object<string, string>, found: string[], missing: string[], duplicates: string[] }}
     *          duplicates: 'KEY (id, id)'; a duplicate key is also in missing
     */
    function parseSettingRows(list, keys) {
        var byKey = {};
        (keys || []).forEach(function (k) { byKey[k] = []; });
        (list || []).forEach(function (r) {
            var name = str(r && r.name).replace(/^\s+|\s+$/g, '');
            if (Object.prototype.hasOwnProperty.call(byKey, name)) byKey[name].push({ id: str(r.id), value: str(r.value).trim() });
        });
        var out = { values: {}, found: [], missing: [], duplicates: [] };
        (keys || []).forEach(function (k) {
            var rows = byKey[k];
            if (rows.length > 1) {
                out.duplicates.push(k + ' (' + rows.map(function (r) { return r.id; }).join(', ') + ')');
                out.missing.push(k);
            } else if (rows.length === 1 && rows[0].value !== '') {
                out.values[k] = rows[0].value;
                out.found.push(k);
            } else {
                out.missing.push(k);
            }
        });
        return out;
    }

    /**
     * The settings Create order needs, from customrecord_cdb_setting: ONE search (~10 units) of the
     * active rows whose Name contains one of the keys (each row then matched exactly on its trimmed
     * Name). Never throws: a failed search (no permission, no record type) → every key missing and
     * failed = the reason.
     *
     * @param {string[]} keys
     * @param {string} [logKey] - the audit title for the found / missing line
     * @returns {{ values: Object<string, string>, found: string[], missing: string[], duplicates: string[], failed: string }}
     */
    function loadOrderSettings(keys, logKey) {
        var title = logKey || 'OrderLib.Settings';
        var list = [];
        var failed = '';
        try {
            var nameFilter = [];
            (keys || []).forEach(function (k, i) {
                if (i) nameFilter.push('OR');
                nameFilter.push([SETTING.name, 'contains', k]);
            });
            search.create({
                type:    SETTING.type,
                filters: [['isinactive', 'is', 'F'], 'AND', nameFilter],
                columns: [SETTING.name, SETTING.value]
            }).run().each(function (r) {
                list.push({ id: str(r.id), name: r.getValue({ name: SETTING.name }), value: r.getValue({ name: SETTING.value }) });
                return true;
            });
        } catch (e) {
            failed = (e && e.message) || String(e);
            list = [];
        }
        var out = parseSettingRows(list, keys);
        out.failed = failed;
        if (failed) {
            log.error('ORDER_SETTINGS_UNAVAILABLE', 'The ' + SETTING.type + ' search failed, so every Create order setting is missing: ' + failed);
        }
        if (out.duplicates.length) {
            log.error('ORDER_SETTING_DUPLICATE', out.duplicates.join('; ') + '. Each key must have exactly one active ' +
                SETTING.type + ' row: make all but one inactive. Treated as missing.');
        }
        log.audit(title, 'found: ' + (out.found.join(', ') || 'none') + ' | missing: ' + (out.missing.join(', ') || 'none') +
            (failed ? ' | search FAILED' : ''));
        return out;
    }

    // ─── Terms rule (the customer dashboard's) ────────────────────────────────────

    /**
     * Does the customer pay up front? The customer dashboard's rule (cdb_lib_data.js isPrepay, customer
     * half): no prepay list → nobody is shown a deposit (the Create order parameter's "empty means");
     * blank customer terms → up front (the dashboard's fail-closed direction); else the customer's terms
     * must be in the list. Customers on credit (trade) terms pay no deposit.
     */
    function paysUpFront(customerTermsId, prepayTermsIds) {
        var list = (prepayTermsIds || []).map(str).filter(function (s) { return s; });
        if (!list.length) return false;
        var t = str(customerTermsId).trim();
        if (!t) return true;
        return list.indexOf(t) !== -1;
    }

    // ─── Lists read at run time ───────────────────────────────────────────────────

    /** A custom list's active options in internal-ID order: [{ id, text }]. [] (logged) on failure. */
    function loadListOptions(listScriptId, logKey) {
        var out = [];
        try {
            search.create({
                type:    listScriptId,
                filters: [['isinactive', 'is', 'F']],
                columns: [search.createColumn({ name: 'internalid', sort: search.Sort.ASC }), 'name']
            }).run().each(function (r) {
                out.push({ id: str(r.getValue({ name: 'internalid' })), text: lib.cleanText(r.getValue({ name: 'name' })) });
                return true;
            });
        } catch (e) {
            log.error(logKey || 'OrderLib.Lists', listScriptId + ' could not be read: ' + e.message);
        }
        return out;
    }

    // ─── Listing ──────────────────────────────────────────────────────────────────

    /**
     * The open quotes on an opportunity — status Estimate:A, newest first. TWO searches, no Estimate loads:
     *   1. the header search: id, number, title, description, date created, quote type, total (inc VAT),
     *      expiry (duedate);
     *   2. (opts.extras !== false) a fail-safe extras search: units, deposit and ex VAT. These are in
     *      their own search so a column the account rejects can only blank them — the listing stands.
     * Converted quotes are no longer open, so they never appear.
     *
     * @param {string} oppId
     * @param {Object} [opts] - { extras: boolean (default true), today: Date (default now), logKey }
     * @returns {{ quotes: Array<Object>, error: string, extrasError: string }} each quote:
     *   { id, tranId, title, description, dateCreated, quoteTypeId, quoteTypeText, total (number|null),
     *     exVat (number|null), dueDate (Date|null), expired (boolean), units ('' | string), deposit (number|null) }
     */
    function listOrderableQuotes(oppId, opts) {
        opts = opts || {};
        var logKey = opts.logKey || 'OrderLib.List';
        var out = { quotes: [], error: '', extrasError: '' };
        if (!ID_RE.test(str(oppId))) {
            out.error = 'No opportunity.';
            return out;
        }
        var today = startOfDay(opts.today instanceof Date ? opts.today : new Date());
        try {
            search.create({
                type:    search.Type.ESTIMATE,
                filters: [
                    ['opportunity', 'anyof', oppId],
                    'AND',
                    ['mainline', 'is', 'T'],
                    'AND',
                    ['status', 'anyof', EST.openStatus]
                ],
                columns: [
                    search.createColumn({ name: 'datecreated', sort: search.Sort.DESC }),
                    'internalid', 'tranid', 'title', EST.desc, EST.quoteType, 'total', 'duedate'
                ]
            }).run().each(function (r) {
                var due = parseDate(r.getValue({ name: 'duedate' }));
                out.quotes.push({
                    id:            str(r.getValue({ name: 'internalid' })),
                    tranId:        str(r.getValue({ name: 'tranid' })),
                    title:         lib.cleanText(r.getValue({ name: 'title' })),
                    description:   lib.cleanText(r.getValue({ name: EST.desc })),
                    dateCreated:   str(r.getValue({ name: 'datecreated' })).split(' ')[0],
                    quoteTypeId:   str(r.getValue({ name: EST.quoteType })),
                    quoteTypeText: lib.cleanText(r.getText({ name: EST.quoteType })),
                    total:         num(r.getValue({ name: 'total' })),
                    exVat:         null,
                    dueDate:       due,
                    expired:       !!(due && startOfDay(due) < today),
                    units:         '',
                    deposit:       null
                });
                return out.quotes.length < 100;
            });
        } catch (e) {
            out.error = e.message || String(e);
            log.error(logKey, 'Opportunity ' + oppId + ' — open quotes could not be read: ' + out.error);
            return out;
        }

        if (opts.extras === false || !out.quotes.length) return out;
        var byId = {};
        out.quotes.forEach(function (q) { byId[q.id] = q; });
        try {
            search.create({
                type:    search.Type.ESTIMATE,
                filters: [
                    ['internalid', 'anyof', Object.keys(byId)],
                    'AND',
                    ['mainline', 'is', 'T']
                ],
                columns: ['internalid', EST.units, EST.deposit, 'netamountnotax']
            }).run().each(function (r) {
                var q = byId[str(r.getValue({ name: 'internalid' }))];
                if (!q) return true;
                var u = str(r.getValue({ name: EST.units })).trim();
                var un = num(u);
                q.units   = (un !== null && un >= 1 && Math.floor(un) === un) ? String(un) : '';
                q.deposit = num(r.getValue({ name: EST.deposit }));
                q.exVat   = num(r.getValue({ name: 'netamountnotax' }));
                return true;
            });
        } catch (e) {
            out.extrasError = e.message || String(e);
            log.error(logKey, 'Opportunity ' + oppId + ' — quote extras (units, deposit, ex VAT) could not be read; shown blank: ' + out.extrasError);
        }
        return out;
    }

    // ─── Project type inference ───────────────────────────────────────────────────

    /**
     * PURE. The project type the ticked quotes point to:
     *   - every quote type maps (map[quoteTypeId]) to the SAME project type → that type;
     *   - they map to DIFFERENT types → mixedId ('' when not set);
     *   - any quote type unmapped, or no quotes → ''.
     * @param {Array<string>} quoteTypeIds
     * @param {Object} map - { "<quote type id>": "<project type id>" }
     * @param {string} mixedId
     * @returns {string}
     */
    function inferProjectType(quoteTypeIds, map, mixedId) {
        var ids = (quoteTypeIds || []).map(str);
        if (!ids.length) return '';
        var m = (map && typeof map === 'object') ? map : {};
        var found = [];
        for (var i = 0; i < ids.length; i++) {
            var pt = Object.prototype.hasOwnProperty.call(m, ids[i]) ? str(m[ids[i]]) : '';
            if (!pt) return '';
            if (found.indexOf(pt) === -1) found.push(pt);
        }
        return found.length === 1 ? found[0] : str(mixedId);
    }

    // ─── Duplicate guard ──────────────────────────────────────────────────────────

    /**
     * Sales Orders already created from any of these Estimates: { <estimateId>: [SO tranid, …] }.
     * One search. Throws on a search failure (the caller fails closed).
     */
    function findExistingOrders(estimateIds) {
        var out = {};
        var ids = (estimateIds || []).map(str).filter(function (id) { return ID_RE.test(id); });
        if (!ids.length) return out;
        search.create({
            type:    search.Type.SALES_ORDER,
            filters: [
                ['createdfrom', 'anyof', ids],
                'AND',
                ['mainline', 'is', 'T']
            ],
            columns: ['createdfrom', 'tranid']
        }).run().each(function (r) {
            var from = str(r.getValue({ name: 'createdfrom' }));
            if (!out[from]) out[from] = [];
            out[from].push(str(r.getValue({ name: 'tranid' })));
            return true;
        });
        return out;
    }

    // ─── Lock (best effort) ───────────────────────────────────────────────────────

    function lockCache() {
        return cache.getCache({ name: LOCK_CACHE, scope: cache.Scope.PUBLIC });
    }

    /** { held: true } when another request holds it; { key } when taken; { key: null } without a cache. */
    function takeLock(estimateId, logKey) {
        var key = 'est_' + estimateId;
        try {
            var c = lockCache();
            if (c.get({ key: key })) return { held: true, key: null };
            c.put({ key: key, value: String(Date.now()), ttl: LOCK_TTL });
            return { held: false, key: key };
        } catch (e) {
            log.error(logKey, 'Estimate ' + estimateId + ' — lock unavailable (' + e.message + '); converting without it');
            return { held: false, key: null };
        }
    }

    function releaseLock(key, logKey) {
        if (!key) return;
        try {
            lockCache().remove({ key: key });
        } catch (e) {
            log.error(logKey, key + ' — lock could not be released (it expires in ' + LOCK_TTL + 's): ' + e.message);
        }
    }

    // ─── Conversion ───────────────────────────────────────────────────────────────

    /**
     * 1.2.1: the commission as entered — { kind: 'pct'|'amt', n } — or null for none (blank or absent). Shape
     * only; no I/O. Throws ORDERLIB_BAD_INPUT on a bad value.
     */
    function commissionInput(c) {
        if (!c || c.value === null || c.value === undefined || str(c.value).trim() === '') return null;
        var v = str(c.value).trim();
        if (!/^\d{1,9}(\.\d{1,2})?$/.test(v)) throw orderLibError('ORDERLIB_BAD_INPUT', 'Partner commission must be a number with up to 2 decimal places.');
        var n = parseFloat(v);
        if (c.kind === 'pct') {
            if (n > 100) throw orderLibError('ORDERLIB_BAD_INPUT', 'Partner commission % must be between 0 and 100.');
            return { kind: 'pct', n: n };
        }
        if (c.kind === 'amt') return { kind: 'amt', n: n };
        throw orderLibError('ORDERLIB_BAD_INPUT', 'Partner commission must be % or £.');
    }

    /** round(x, 2) without the binary drift of x * 100 (1.005 → 1.01). */
    function round2(x) {
        return Math.round((x + (x >= 0 ? 1 : -1) * 1e-9) * 100) / 100;
    }

    /**
     * 1.2.1 — PURE. Steve's rule: the £ field is ALWAYS written (a number): the £ entered; for a %,
     * round(% × base / 100, 2); none → 0. The % field only for a %.
     * @param {{kind, n}|null} input - commissionInput()
     * @param {number|null} base - the SO's ex VAT total after discounts (total − taxtotal); needed only for a %
     * @returns {{ amount: number, pct: (number|null), log: string }}
     * @throws ORDERLIB_COMMISSION when a % has no base
     */
    function commissionValues(input, base) {
        if (!input) return { amount: 0, pct: null, log: 'commission: ' + money(0) };
        if (input.kind === 'amt') return { amount: round2(input.n), pct: null, log: 'commission: ' + money(input.n) };
        if (base === null || base === undefined || !isFinite(base)) {
            throw orderLibError('ORDERLIB_COMMISSION', 'commission could not be calculated (the order’s ex VAT total could not be read)');
        }
        var amount = round2(input.n * base / 100);
        return { amount: amount, pct: input.n, log: 'commission: ' + input.n + '% → ' + money(amount) + ' (base ' + money(base) + ')' };
    }

    /**
     * The Estimate as it is NOW — one search, filtered to OPEN Estimates on THIS opportunity, so a quote
     * that has been converted, closed or moved simply isn't found (no status value has to be read).
     * @returns {{ tranId, quoteTypeId, total (number|null), oppId }}
     * @throws ORDERLIB_NOT_ORDERABLE
     */
    function recheckEstimate(estimateId, oppId) {
        var row = null;
        search.create({
            type:    search.Type.ESTIMATE,
            filters: [
                ['internalid', 'anyof', estimateId],
                'AND',
                ['mainline', 'is', 'T'],
                'AND',
                ['status', 'anyof', EST.openStatus],
                'AND',
                ['opportunity', 'anyof', oppId]
            ],
            columns: ['tranid', 'opportunity', EST.quoteType, 'total']
        }).run().each(function (r) {
            row = {
                tranId:      str(r.getValue({ name: 'tranid' })),
                oppId:       str(r.getValue({ name: 'opportunity' })),
                quoteTypeId: str(r.getValue({ name: EST.quoteType })),
                total:       num(r.getValue({ name: 'total' }))
            };
            return false;
        });
        if (!row || row.oppId !== str(oppId)) {
            throw orderLibError('ORDERLIB_NOT_ORDERABLE', 'is not an open quote on this opportunity (already converted, closed or moved?)');
        }
        return row;
    }

    /** The saved SO's tranid and total — lookupFields (1 unit), a search when total isn't returned. */
    function readSavedOrder(soId, logKey) {
        var out = { tranId: '', total: null };
        try {
            var f = search.lookupFields({ type: search.Type.SALES_ORDER, id: soId, columns: ['tranid', 'total'] }) || {};
            out.tranId = lib.lookupText(f.tranid);
            out.total = num(firstValue(f.total));
        } catch (e) {
            log.debug(logKey, 'SO ' + soId + ' — lookupFields tranid/total failed (' + e.message + '); using a search');
        }
        if (out.total === null || !out.tranId) {
            search.create({
                type:    search.Type.SALES_ORDER,
                filters: [['internalid', 'anyof', soId], 'AND', ['mainline', 'is', 'T']],
                columns: ['tranid', 'total']
            }).run().each(function (r) {
                out.tranId = out.tranId || str(r.getValue({ name: 'tranid' }));
                if (out.total === null) out.total = num(r.getValue({ name: 'total' }));
                return false;
            });
        }
        return out;
    }

    /** The order log's parent opportunity: the parent field's value when set and filled, else oppId. */
    function parentOpportunity(oppId, field, logKey) {
        if (!field) return str(oppId);
        if (!FIELD_RE.test(field)) {
            log.error(logKey, 'Parent opportunity field "' + str(field).substring(0, 60) + '" is not a field ID; using opportunity ' + oppId);
            return str(oppId);
        }
        try {
            var f = search.lookupFields({ type: search.Type.OPPORTUNITY, id: oppId, columns: [field] }) || {};
            var v = firstValue(f[field]);
            if (ID_RE.test(v)) return v;
        } catch (e) {
            log.error(logKey, 'Opportunity ' + oppId + ' — ' + field + ' could not be read (' + e.message + '); using this opportunity');
        }
        return str(oppId);
    }

    /**
     * 1.3.0: the shape of one quote's inputs — before anything else. Throws ORDERLIB_BAD_INPUT / ORDERLIB_CONFIG.
     * @returns {{ estimateId, oppId, units (number), comm, cfg, logKey }}
     */
    function checkOrderInput(o) {
        var cfg = o.cfg || {};
        var estimateId = str(o.estimateId), oppId = str(o.oppId);
        if (!ID_RE.test(estimateId)) throw orderLibError('ORDERLIB_BAD_INPUT', 'No quote.');
        if (!ID_RE.test(oppId)) throw orderLibError('ORDERLIB_BAD_INPUT', 'No opportunity.');
        if (!ID_RE.test(str(cfg.soForm))) throw orderLibError('ORDERLIB_CONFIG', 'The Sales Order form is not set.');
        if (!ID_RE.test(str(cfg.recordStatus))) throw orderLibError('ORDERLIB_CONFIG', 'The Record Status for new orders is not set.');
        if (!ID_RE.test(str(o.projectType))) throw orderLibError('ORDERLIB_BAD_INPUT', 'No project type.');
        if (!ID_RE.test(str(o.auth))) throw orderLibError('ORDERLIB_BAD_INPUT', 'No order authority.');
        if (!ID_RE.test(str(o.repId))) throw orderLibError('ORDERLIB_BAD_INPUT', 'No sales rep.');
        var units = str(o.units).trim();
        if (!/^\d{1,6}$/.test(units) || parseInt(units, 10) < 1) throw orderLibError('ORDERLIB_BAD_INPUT', 'Units must be a whole number of 1 or more.');
        return {
            estimateId: estimateId, oppId: oppId, units: parseInt(units, 10),
            comm:       commissionInput(o.commission),   // 1.2.1: shape now; the £ after the transform (it needs the base)
            cfg:        cfg, logKey: cfg.logKey || 'OrderLib.Convert'
        };
    }

    /**
     * 1.3.0 PHASE 1 for ONE quote — NOTHING IS SAVED. TRUSTS NO INPUT (the customer version will run as
     * Administrator): it re-checks ownership and openness itself, and checks every value's shape. Option
     * membership (project type, authority, rep) is the caller's validation.
     *
     *   1. N/cache lock est_<id> (best effort; held by another request → refused).
     *   2. Re-check: the Estimate must be OPEN and on oppId (one search; see recheckEstimate).
     *   3. The duplicate guard: o.existingOrders (the SO numbers findExistingOrders found for this quote)
     *      non-empty → refused "already converted to SO…".
     *   4. record.transform Estimate → Sales Order, standard mode, customform = cfg.soForm (set first,
     *      through defaultValues). Every CARRY_REPORT field is reported (carried / blank) in the audit log.
     *   5. Set: Record Status = cfg.recordStatus; project type; the commission (the £ field always, the % field
     *      for a %); opportunity and quote type ONLY when they came across blank (copied from the Estimate).
     *   6. Total check before save: the SO's total against the Estimate's; more than 1p apart (or either
     *      unreadable) → refused: "total differs from the quote (£x vs £y)".
     * Any refusal releases this quote's lock and throws. On success the lock stays HELD until saveOrder or
     * releaseOrder: the caller must call one of them for every prepared order.
     *
     * Governance: lock 2 (+1 release on failure) · search 10 · transform 10 → about 22.
     *
     * @param {Object} o - as convertQuote, plus [o.existingOrders] (string[], from findExistingOrders)
     * @returns {Object} the prepared order — opaque; pass it to saveOrder or releaseOrder
     * @throws when refused (e.name ORDERLIB_*, or NetSuite's own error from the transform)
     */
    function prepareOrder(o) {
        o = o || {};
        var i = checkOrderInput(o);
        var logKey = i.logKey, estimateId = i.estimateId, oppId = i.oppId, cfg = i.cfg, comm = i.comm;

        // ── 1. Lock ──
        var lock = takeLock(estimateId, logKey);
        if (lock.held) throw orderLibError('ORDERLIB_LOCKED', 'is being converted by another request — try again in a few minutes');

        try {
            // ── 2. Re-check ──
            var est = recheckEstimate(estimateId, oppId);

            // ── 3. Duplicate guard ──
            var dup = (o.existingOrders || []).map(str).filter(function (s) { return s; });
            if (dup.length) throw orderLibError('ORDERLIB_DUPLICATE', 'already converted to ' + dup.join(', '));

            // ── 4. Transform (standard mode; the form first) ──
            var so = record.transform({
                fromType:      record.Type.ESTIMATE,
                fromId:        estimateId,
                toType:        record.Type.SALES_ORDER,
                isDynamic:     false,
                defaultValues: { customform: str(cfg.soForm) }
            });

            // What the transform carried — reported, then the fields set
            var carried = [], blank = [];
            CARRY_REPORT.forEach(function (f) {
                var v;
                try { v = so.getValue({ fieldId: f }); } catch (e) { v = ''; }
                if (v === null || v === undefined || v === '' || (Array.isArray(v) && !v.length)) blank.push(f);
                else carried.push(f + '=' + str(v).substring(0, 40));
            });
            log.audit(logKey, 'Estimate ' + estimateId + ' (' + est.tranId + ') → SO, before setting fields — carried: ' +
                (carried.join(', ') || 'none') + ' | blank: ' + (blank.join(', ') || 'none'));

            // ── 5. Fields ──
            var set = [];
            so.setValue({ fieldId: SO.recordStatus, value: str(cfg.recordStatus) }); set.push(SO.recordStatus);
            so.setValue({ fieldId: SO.projectType, value: str(o.projectType) }); set.push(SO.projectType);
            // 1.2.1: the base and the commission — before the total check, so a % with no base is refused like it
            var soTotal = num(so.getValue({ fieldId: 'total' }));
            var taxTotal = num(so.getValue({ fieldId: 'taxtotal' }));
            var base = (soTotal === null || taxTotal === null) ? null : round2(soTotal - taxTotal);
            var cv;
            try {
                cv = commissionValues(comm, base);
            } catch (e) {
                log.audit(logKey, 'Estimate ' + estimateId + ' — commission ' + comm.n + '% NOT calculated; not saved. total ' + str(so.getValue({ fieldId: 'total' })) +
                    ', taxtotal ' + str(so.getValue({ fieldId: 'taxtotal' })));
                throw e;
            }
            so.setValue({ fieldId: SO.commAmt, value: cv.amount }); set.push(SO.commAmt + '=' + cv.amount);   // always, a number (0 included)
            if (cv.pct !== null) { so.setValue({ fieldId: SO.commPct, value: cv.pct }); set.push(SO.commPct + '=' + cv.pct); }
            if (!firstValue(so.getValue({ fieldId: SO.opportunity }))) {
                so.setValue({ fieldId: SO.opportunity, value: oppId }); set.push(SO.opportunity + ' (copied)');
            }
            if (!firstValue(so.getValue({ fieldId: SO.quoteType })) && est.quoteTypeId) {
                so.setValue({ fieldId: SO.quoteType, value: est.quoteTypeId }); set.push(SO.quoteType + ' (copied)');
            }

            // ── 6. Total check before save ──
            if (soTotal === null || est.total === null || Math.abs(soTotal - est.total) > TOTAL_TOLERANCE + 1e-9) {
                log.audit(logKey, 'Estimate ' + estimateId + ' — TOTAL MISMATCH before save; not saved. SO ' + str(soTotal) + ' vs quote ' + str(est.total));
                throw orderLibError('ORDERLIB_TOTAL', 'total differs from the quote (' + (soTotal === null ? 'unreadable' : money(soTotal)) +
                    ' vs ' + (est.total === null ? 'unreadable' : money(est.total)) + ')');
            }

            return {
                estimateId: estimateId, oppId: oppId, tranId: est.tranId, estTotal: est.total, so: so, lockKey: lock.key,
                set: set, commLog: cv.log, units: i.units, auth: str(o.auth), repId: str(o.repId), cfg: cfg, logKey: logKey,
                state: 'prepared'
            };
        } catch (e) {
            releaseLock(lock.key, logKey);   // nothing was saved — the rep may retry
            throw e;
        }
    }

    /** 1.3.0: gives up a prepared order that will not be saved — releases its lock. Safe to call twice. */
    function releaseOrder(p) {
        if (!p || p.state !== 'prepared') return;
        p.state = 'released';
        p.so = null;
        releaseLock(p.lockKey, p.logKey);
    }

    /**
     * 1.3.0 PHASE 2 for ONE prepared order. No openness re-check: phase 1 proved it, the lock is held and the
     * duplicate guard ran (a source Estimate NetSuite marks Processed after the transform is EXPECTED here —
     * Sandbox check S21 — and is not worked around).
     *
     *   1. Save (ignoreMandatoryFields: false — the form's mandatory fields are respected). A failure logs
     *      NetSuite's message, releases the lock and throws (nothing was saved for this quote).
     *   2. Total check after save (lookupFields): a mismatch is a WARNING — never deleted.
     *   3. The order log (custrecord_order_so, _parent_opp, _units, _auth, _rep). A failure is a warning:
     *      "SOxxxx created; order log NOT created: …" — the SO stands.
     * After a save NOTHING throws. The lock is left to expire (LOCK_TTL): the quote is no longer open.
     *
     * Governance: save 20 · lookupFields 1 [+ search 10] · [parent lookup 1] · log create 2 + save 4 → about 27–38.
     *
     * @returns {{ soId, tranId, total, logId, warnings: string[], totalMismatch: boolean, logFailed: boolean }}
     * @throws NetSuite's own error from the save (nothing saved), or ORDERLIB_BAD_INPUT for an order not prepared
     */
    function saveOrder(p) {
        if (!p || p.state !== 'prepared') throw orderLibError('ORDERLIB_BAD_INPUT', 'No prepared order.');
        var logKey = p.logKey, estimateId = p.estimateId, soId = '';
        p.state = 'saving';
        try {
            soId = str(p.so.save({ ignoreMandatoryFields: false }));
        } catch (e) {
            p.state = 'failed';
            p.so = null;
            log.error(logKey, 'Estimate ' + estimateId + ' (' + p.tranId + ') — SO save FAILED, not created: ' + ((e && e.message) || String(e)) +
                (e && e.name ? ' [' + e.name + ']' : ''));
            releaseLock(p.lockKey, logKey);   // nothing was saved for this quote — the rep may retry
            throw e;
        }
        p.state = 'saved';
        p.so = null;
        log.audit(logKey, 'Estimate ' + estimateId + ' (' + p.tranId + ') → SO ' + soId + ' saved | set: ' + p.set.join(', '));
        log.audit(logKey, 'SO ' + soId + ' — ' + p.commLog);   // 1.2.1: "commission: 5% → £64.33 (base £1,286.61)" / "commission: £250.00"

        var out = { soId: soId, tranId: '', total: null, logId: '', warnings: [], totalMismatch: false, logFailed: false };

        // ── 2. Total check after save ──
        try {
            var saved = readSavedOrder(soId, logKey);
            out.tranId = saved.tranId;
            out.total = saved.total;
            if (saved.total === null || p.estTotal === null || Math.abs(saved.total - p.estTotal) > TOTAL_TOLERANCE + 1e-9) {
                var w = (out.tranId || 'SO ' + soId) + ': total after save differs from the quote (' +
                    (saved.total === null ? 'unreadable' : money(saved.total)) + ' vs ' + money(p.estTotal) + ')';
                out.warnings.push(w);
                out.totalMismatch = true;
                log.audit(logKey, 'Estimate ' + estimateId + ' — TOTAL MISMATCH after save (SO kept): ' + w);
            }
        } catch (e) {
            out.warnings.push('SO ' + soId + ': total after save could not be checked');
            out.totalMismatch = true;
            log.error(logKey, 'SO ' + soId + ' — total after save could not be read: ' + e.message);
        }
        var soLabel = out.tranId || ('SO ' + soId);

        // ── 3. The order log ──
        try {
            var parent = parentOpportunity(p.oppId, p.cfg.parentOppField, logKey);
            var ol = record.create({ type: LOG.record });
            ol.setValue({ fieldId: LOG.so, value: soId });
            ol.setValue({ fieldId: LOG.parentOpp, value: parent });
            ol.setValue({ fieldId: LOG.units, value: p.units });
            ol.setValue({ fieldId: LOG.auth, value: p.auth });
            ol.setValue({ fieldId: LOG.rep, value: p.repId });
            out.logId = str(ol.save({ ignoreMandatoryFields: false }));
            log.audit(logKey, soLabel + ' — order log ' + out.logId + ' created (parent opportunity ' + parent + ', units ' + p.units + ')');
        } catch (e) {
            var lw = soLabel + ' created; order log NOT created: ' + ((e && e.message) || String(e));
            out.warnings.push(lw);
            out.logFailed = true;
            log.error(logKey, lw);
        }
        return out;
    }

    /**
     * 1.3.0: converts SEVERAL quotes of one opportunity as ONE decision, in two phases — because saving the
     * first Sales Order makes NetSuite mark the opportunity's other open quotes as no longer open (Production,
     * 7 Oct), so a per-quote re-check after an earlier save refuses every later quote.
     *
     *   Phase 1 (nothing saved): ONE duplicate search (findExistingOrders) for every quote, then prepareOrder
     *   for each, in order — every quote is checked while all of them are still open. ANY refusal → every
     *   prepared order is released (locks freed), nothing is saved: { ok: false, problems }. Every quote is
     *   still prepared so that the problems list is complete.
     *   Phase 2: saveOrder for each prepared order, in order. A failed save never stops the others; the SOs
     *   already saved stand: { ok: true, created, failed }.
     *
     * Governance: duplicate search 10, then about 22 per quote (phase 1) + 27–38 per quote (phase 2) — the
     * same total as one convertQuote per quote. The caller checks the worst case BEFORE calling (it holds up
     * to MAX_QUOTES transformed records in memory).
     *
     * @param {Object[]} orders - [{ estimateId, commission, units }]
     * @param {Object} common - { oppId, projectType, auth, repId, cfg } (as convertQuote)
     * @returns {{ ok: boolean, prepared: number, problems: {estimateId, error}[], created: {estimateId, res}[], failed: {estimateId, error}[] }}
     *          error = the Error thrown (ORDERLIB_* or NetSuite's); a failed duplicate search is one problem with estimateId ''
     */
    function convertQuotes(orders, common) {
        orders = orders || [];
        common = common || {};
        var logKey = (common.cfg && common.cfg.logKey) || 'OrderLib.Convert';
        var out = { ok: false, prepared: 0, problems: [], created: [], failed: [] };
        var n = orders.length;

        var existing;
        try {
            existing = findExistingOrders(orders.map(function (x) { return x.estimateId; }));
        } catch (e) {
            log.error(logKey, 'Opportunity ' + str(common.oppId) + ' — existing-order check failed; nothing saved: ' + e.message);
            out.problems.push({ estimateId: '', error: orderLibError('ORDERLIB_GUARD', 'existing orders could not be checked (' + e.message + '). Please try again.') });
            return out;
        }

        // ── Phase 1: prepare every quote ──
        var prepared = [];
        orders.forEach(function (x) {
            try {
                prepared.push(prepareOrder({
                    estimateId: x.estimateId, oppId: common.oppId, projectType: common.projectType, commission: x.commission,
                    units: x.units, auth: common.auth, repId: common.repId, cfg: common.cfg,
                    existingOrders: existing[str(x.estimateId)] || []
                }));
            } catch (e) {
                out.problems.push({ estimateId: str(x.estimateId), error: e });
                log.error(logKey, 'Estimate ' + str(x.estimateId) + ' — refused in phase 1: ' + ((e && e.message) || String(e)));
            }
        });
        out.prepared = prepared.length;
        if (out.problems.length) {
            prepared.forEach(releaseOrder);
            log.audit(logKey, 'Opportunity ' + str(common.oppId) + ' — prepared ' + prepared.length + '/' + n + '; NOTHING SAVED (' +
                out.problems.length + ' refused); every lock released');
            return out;
        }
        log.audit(logKey, 'Opportunity ' + str(common.oppId) + ' — prepared ' + n + '/' + n);

        // ── Phase 2: save each ──
        out.ok = true;
        prepared.forEach(function (p, k) {
            try {
                out.created.push({ estimateId: p.estimateId, res: saveOrder(p) });
                log.audit(logKey, 'Opportunity ' + str(common.oppId) + ' — saved ' + (k + 1) + '/' + n + ': ' + p.tranId);
            } catch (e) {
                out.failed.push({ estimateId: p.estimateId, error: e });
                log.audit(logKey, 'Opportunity ' + str(common.oppId) + ' — save ' + (k + 1) + '/' + n + ' FAILED: ' + p.tranId);
            }
        });
        return out;
    }

    /**
     * Converts ONE open Estimate: prepareOrder then saveOrder (1.3.0: kept for a single quote; for several
     * quotes of one opportunity use convertQuotes — saving one SO closes the opportunity's other quotes).
     * No duplicate guard here (the caller's, as before). Governance about 49.
     *
     * @param {Object} o
     * @param {string} o.estimateId
     * @param {string} o.oppId
     * @param {string} o.projectType - a customlist_bund_proj_type id
     * @param {{kind: 'pct'|'amt', value: *}} [o.commission] - blank value = none
     * @param {*} o.units - a whole number ≥ 1
     * @param {string} o.auth - a customlist_order_auth id
     * @param {string} o.repId - the employee taking the order
     * @param {{soForm: string, recordStatus: string, parentOppField: string, logKey: string}} o.cfg
     * @returns as saveOrder
     * @throws when nothing was saved (e.name ORDERLIB_*, or NetSuite's own error from transform / save)
     */
    function convertQuote(o) {
        return saveOrder(prepareOrder(o));
    }

    return {
        LIB_VERSION:            LIB_VERSION,
        EST_FIELDS:             EST,
        SO_FIELDS:              SO,
        LOG_FIELDS:             LOG,
        money:                  money,
        commissionValues:       commissionValues,
        paysUpFront:            paysUpFront,
        SETTING_RECORD:         SETTING,
        parseSettingRows:       parseSettingRows,
        loadOrderSettings:      loadOrderSettings,
        loadListOptions:        loadListOptions,
        listOrderableQuotes:    listOrderableQuotes,
        inferProjectType:       inferProjectType,
        findExistingOrders:     findExistingOrders,
        convertQuotes:          convertQuotes,   // 1.3.0
        prepareOrder:           prepareOrder,    // 1.3.0
        saveOrder:              saveOrder,       // 1.3.0
        releaseOrder:           releaseOrder,    // 1.3.0
        convertQuote:           convertQuote
    };

});
