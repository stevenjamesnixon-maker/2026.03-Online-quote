/**
 * @NApiVersion 2.1
 * @NModuleScope Public
 *
 * @name        Nu-Heat Order Library
 * @description Turning open quotes (Estimates) into Sales Orders: the orderable-quote listing, the
 *              conversion (lock → re-check → transform → set fields → total check → save → total check →
 *              order log), project-type inference and the order confirmation email. Used by the
 *              reps' "Create order" page (nuheat_create_order_sl.js); written for reuse by the
 *              customer version (part 2), which will run as Administrator.
 * @version     1.0.0
 * @author      Nu-Heat Development
 *
 * ⚠️ DEPLOYMENT: a shared AMD module — no script record, no deployment. Upload it to
 *    SuiteScripts/NuHeat/2026 Quote/ AFTER nuheat_opp_update_lib.js (which it requires as
 *    './nuheat_opp_update_lib') and BEFORE nuheat_create_order_sl.js, or the Suitelet fails at load time.
 *
 * ⚠️ EXTERNAL CONSUMER (planned): the customer version of Create order (part 2) will require this
 *    library. Don't rename, move or change the signatures of listOrderableQuotes, convertQuote,
 *    inferProjectType, orderConfirmationEmail, paysUpFront, loadListOptions or LIB_VERSION without
 *    a matching change there.
 *
 * CHANGELOG v1.0.0 (Create order, part 1 — 6 Oct 2026):
 *   - listOrderableQuotes(oppId, opts): two searches, no Estimate loads — the header search (open
 *     Estimates, status Estimate:A, newest first) and a fail-safe extras search (units, deposit, ex VAT).
 *   - convertQuote(o): see its comment. TRUSTS NO INPUT: it re-checks that the Estimate is open and on
 *     the given opportunity itself, and checks the shape of every value it writes.
 *   - inferProjectType(quoteTypeIds, map, mixedId): pure.
 *   - orderConfirmationEmail(o): the v2 customer email (lib.emailShellV2, emailFactBoxV2,
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

    var LIB_VERSION = '1.0.0';

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
        'custbody_partner_commission', 'custbody_partner_commission_amount', 'total'];

    var LOCK_CACHE = 'nh_order_estimate_lock';   // PUBLIC: the customer version must see the reps' locks
    var LOCK_TTL   = 300;                         // seconds (N/cache minimum)
    var TOTAL_TOLERANCE = 0.01;                   // 1p

    var ID_RE    = /^\d{1,12}$/;
    var FIELD_RE = /^[a-z][a-z0-9_]{2,60}$/;

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

    /** The commission as { fieldId, value } or null. Throws ORDERLIB_BAD_INPUT on a bad value. */
    function commissionField(c) {
        if (!c || c.value === null || c.value === undefined || str(c.value).trim() === '') return null;
        var v = str(c.value).trim();
        if (!/^\d{1,9}(\.\d{1,2})?$/.test(v)) throw orderLibError('ORDERLIB_BAD_INPUT', 'Partner commission must be a number with up to 2 decimal places.');
        var n = parseFloat(v);
        if (c.kind === 'pct') {
            if (n > 100) throw orderLibError('ORDERLIB_BAD_INPUT', 'Partner commission % must be between 0 and 100.');
            return { fieldId: SO.commPct, value: n, label: 'pct' };
        }
        if (c.kind === 'amt') return { fieldId: SO.commAmt, value: n, label: 'amt' };
        throw orderLibError('ORDERLIB_BAD_INPUT', 'Partner commission must be % or £.');
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
     * Converts ONE open Estimate into a Sales Order and logs it. TRUSTS NO INPUT (the customer version
     * will run as Administrator): it re-checks ownership and openness itself, and checks every value's
     * shape. Option membership (project type, authority, rep) is the caller's validation.
     *
     *   1. N/cache lock est_<id> (best effort; held by another request → refused).
     *   2. Re-check: the Estimate must be OPEN and on oppId (one search; see recheckEstimate).
     *   3. record.transform Estimate → Sales Order, standard mode, customform = cfg.soForm (set first,
     *      through defaultValues).
     *   4. Set: Record Status = cfg.recordStatus; project type; ONE commission field; opportunity and
     *      quote type ONLY when they came across blank (copied from the Estimate). Every CARRY_REPORT
     *      field is reported (carried / blank) in the audit log.
     *   5. Total check before save: the SO's total against the Estimate's; more than 1p apart (or either
     *      unreadable) → NOT saved: "total differs from the quote (£x vs £y)".
     *   6. Save (ignoreMandatoryFields: false — the form's mandatory fields are respected).
     *   7. Total check after save (lookupFields): a mismatch is a WARNING — never deleted.
     *   8. The order log (custrecord_order_so, _parent_opp, _units, _auth, _rep). A failure is a warning:
     *      "SOxxxx created; order log NOT created: …" — the SO stands.
     *
     * Governance: lock 2 (+1 release on failure) · search 10 · [parent lookup 1] · transform 10 · save 20
     * · lookupFields 1 [+ search 10] · log create 2 + save 4 → about 49.
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
     * @returns {{ soId, tranId, total, logId, warnings: string[], totalMismatch: boolean, logFailed: boolean }}
     *          totalMismatch / logFailed: the warnings' kinds, for the banner codes
     * @throws when nothing was saved (e.name ORDERLIB_*, or NetSuite's own error from transform / save)
     */
    function convertQuote(o) {
        o = o || {};
        var cfg = o.cfg || {};
        var logKey = cfg.logKey || 'OrderLib.Convert';
        var estimateId = str(o.estimateId), oppId = str(o.oppId);

        // ── Shape of every input — before anything else ──
        if (!ID_RE.test(estimateId)) throw orderLibError('ORDERLIB_BAD_INPUT', 'No quote.');
        if (!ID_RE.test(oppId)) throw orderLibError('ORDERLIB_BAD_INPUT', 'No opportunity.');
        if (!ID_RE.test(str(cfg.soForm))) throw orderLibError('ORDERLIB_CONFIG', 'The Sales Order form is not set.');
        if (!ID_RE.test(str(cfg.recordStatus))) throw orderLibError('ORDERLIB_CONFIG', 'The Record Status for new orders is not set.');
        if (!ID_RE.test(str(o.projectType))) throw orderLibError('ORDERLIB_BAD_INPUT', 'No project type.');
        if (!ID_RE.test(str(o.auth))) throw orderLibError('ORDERLIB_BAD_INPUT', 'No order authority.');
        if (!ID_RE.test(str(o.repId))) throw orderLibError('ORDERLIB_BAD_INPUT', 'No sales rep.');
        var units = str(o.units).trim();
        if (!/^\d{1,6}$/.test(units) || parseInt(units, 10) < 1) throw orderLibError('ORDERLIB_BAD_INPUT', 'Units must be a whole number of 1 or more.');
        units = parseInt(units, 10);
        var comm = commissionField(o.commission);

        // ── 1. Lock ──
        var lock = takeLock(estimateId, logKey);
        if (lock.held) throw orderLibError('ORDERLIB_LOCKED', 'is being converted by another request — try again in a few minutes');

        var soId = '';
        try {
            // ── 2. Re-check ──
            var est = recheckEstimate(estimateId, oppId);

            // ── 3. Transform (standard mode; the form first) ──
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

            // ── 4. Fields ──
            var set = [];
            so.setValue({ fieldId: SO.recordStatus, value: str(cfg.recordStatus) }); set.push(SO.recordStatus);
            so.setValue({ fieldId: SO.projectType, value: str(o.projectType) }); set.push(SO.projectType);
            if (comm) { so.setValue({ fieldId: comm.fieldId, value: comm.value }); set.push(comm.fieldId); }
            if (!firstValue(so.getValue({ fieldId: SO.opportunity }))) {
                so.setValue({ fieldId: SO.opportunity, value: oppId }); set.push(SO.opportunity + ' (copied)');
            }
            if (!firstValue(so.getValue({ fieldId: SO.quoteType })) && est.quoteTypeId) {
                so.setValue({ fieldId: SO.quoteType, value: est.quoteTypeId }); set.push(SO.quoteType + ' (copied)');
            }

            // ── 5. Total check before save ──
            var soTotal = num(so.getValue({ fieldId: 'total' }));
            if (soTotal === null || est.total === null || Math.abs(soTotal - est.total) > TOTAL_TOLERANCE + 1e-9) {
                log.audit(logKey, 'Estimate ' + estimateId + ' — TOTAL MISMATCH before save; not saved. SO ' + str(soTotal) + ' vs quote ' + str(est.total));
                throw orderLibError('ORDERLIB_TOTAL', 'total differs from the quote (' + (soTotal === null ? 'unreadable' : money(soTotal)) +
                    ' vs ' + (est.total === null ? 'unreadable' : money(est.total)) + ')');
            }

            // ── 6. Save ──
            soId = str(so.save({ ignoreMandatoryFields: false }));
            log.audit(logKey, 'Estimate ' + estimateId + ' (' + est.tranId + ') → SO ' + soId + ' saved | set: ' + set.join(', '));
        } catch (e) {
            releaseLock(lock.key, logKey);   // nothing was saved — the rep may retry
            throw e;
        }

        // ── From here on NOTHING throws: the SO stands. The lock is left to expire (LOCK_TTL): the quote
        //    is no longer open, and leaving it saves a unit per order. ──
        var out = { soId: soId, tranId: '', total: null, logId: '', warnings: [], totalMismatch: false, logFailed: false };

        // ── 7. Total check after save ──
        try {
            var saved = readSavedOrder(soId, logKey);
            out.tranId = saved.tranId;
            out.total = saved.total;
            if (saved.total === null || est.total === null || Math.abs(saved.total - est.total) > TOTAL_TOLERANCE + 1e-9) {
                var w = (out.tranId || 'SO ' + soId) + ': total after save differs from the quote (' +
                    (saved.total === null ? 'unreadable' : money(saved.total)) + ' vs ' + money(est.total) + ')';
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

        // ── 8. The order log ──
        try {
            var parent = parentOpportunity(oppId, cfg.parentOppField, logKey);
            var ol = record.create({ type: LOG.record });
            ol.setValue({ fieldId: LOG.so, value: soId });
            ol.setValue({ fieldId: LOG.parentOpp, value: parent });
            ol.setValue({ fieldId: LOG.units, value: units });
            ol.setValue({ fieldId: LOG.auth, value: str(o.auth) });
            ol.setValue({ fieldId: LOG.rep, value: str(o.repId) });
            out.logId = str(ol.save({ ignoreMandatoryFields: false }));
            log.audit(logKey, soLabel + ' — order log ' + out.logId + ' created (parent opportunity ' + parent + ', units ' + units + ')');
        } catch (e) {
            var lw = soLabel + ' created; order log NOT created: ' + ((e && e.message) || String(e));
            out.warnings.push(lw);
            out.logFailed = true;
            log.error(logKey, lw);
        }
        return out;
    }

    // ─── Order confirmation email ─────────────────────────────────────────────────

    /** The email's fixed copy. Steve may reword these — keep them in this one block. */
    var EMAIL_COPY = {
        subject:   'Your Nu-Heat order confirmation',
        eyebrow:   'Order confirmation',
        headline:  'Thank you for your order',
        boxLabel:  'YOUR ORDER',
        factOrder: 'Order',
        factType:  'Quote type',
        factTotal: 'Total inc VAT',
        factDeposit: 'Deposit due',
        cardLabel: 'YOUR NU-HEAT CONTACT',
        replyLine: 'Any questions at all, just reply to this email – it comes straight to me.',
        footer:    'You’re receiving this because you have a project with Nu-Heat.',
        nameFallback: 'Nu-Heat'
    };

    function emailText(s) {
        return lib.escapeHtml(str(s)).replace(/\{\{/g, '&#123;&#123;');
    }

    /** Plain-text message → v2 paragraphs (a blank line starts a paragraph, a newline is <br>). */
    function messageParagraphs(message) {
        return str(message).replace(/\r\n?/g, '\n').split(/\n[ \t]*\n\s*/)
            .map(function (p) { return p.replace(/^\n+|\n+$/g, ''); })
            .filter(function (p) { return p.trim(); })
            .map(function (p) { return lib.emailParagraphV2(p.split('\n').map(emailText).join('<br>')); })
            .join('');
    }

    /**
     * The order confirmation (v2 customer email): eyebrow "Order confirmation", headline "Thank you for
     * your order", the rep's message, one YOUR ORDER box per Sales Order (description; Order SO…; quote
     * type; Total inc VAT; Deposit due — only when the customer pays up front and the deposit is > 0),
     * the sender card and the footer. Every value is PLAIN text, escaped here; no merge pass runs.
     *
     * @param {Object} o
     * @param {Array<{tranId, description, quoteTypeText, total, deposit}>} o.orders - ONLY the orders created
     * @param {boolean} o.customerPaysUpFront
     * @param {Object} o.sender - lib.loadSender(); o.sender.cardEmail overrides the card's address
     * @param {string} [o.message]
     * @param {Object} [o.opp] - { tranId } (accepted for the customer version; not shown)
     * @returns {string} HTML
     */
    function orderConfirmationEmail(o) {
        o = o || {};
        var sender = o.sender || {};
        var boxes = (o.orders || []).map(function (ord) {
            var rows = [
                [EMAIL_COPY.factOrder, str(ord.tranId)],
                [EMAIL_COPY.factType, str(ord.quoteTypeText)],
                [EMAIL_COPY.factTotal, ord.total === null || ord.total === undefined ? '' : money(ord.total)]
            ];
            var dep = num(ord.deposit);
            if (o.customerPaysUpFront === true && dep !== null && dep > 0) rows.push([EMAIL_COPY.factDeposit, money(dep)]);
            var box = lib.emailFactBoxV2(EMAIL_COPY.boxLabel, str(ord.description), rows);
            return box ? '<table role="presentation" width="100%" align="center" cellpadding="0" cellspacing="0" border="0"><tr><td align="left" valign="top" style="padding:0 0 24px 0;">\n' +
                box + '</td></tr></table>\n' : '';
        }).join('');
        var preheader = str(o.message).replace(/\s+/g, ' ').trim().substring(0, 90) || EMAIL_COPY.headline;
        var card = lib.emailSenderCardV2({
            fullName:  sender.fullName || EMAIL_COPY.nameFallback,
            firstName: sender.firstName,
            phone:     sender.phone,
            photoUrl:  sender.photoUrl
        }, sender.cardEmail || sender.email, EMAIL_COPY.cardLabel);
        return lib.emailShellV2({
            preheader:  emailText(preheader),
            eyebrow:    emailText(EMAIL_COPY.eyebrow),
            headline:   emailText(EMAIL_COPY.headline),
            heroUrl:    lib.EMAIL_HERO_V2,
            bodyHtml:   messageParagraphs(o.message) + boxes,
            senderCard: card,
            footerLine: emailText(EMAIL_COPY.replyLine) + '<br>' + emailText(EMAIL_COPY.footer)
        });
    }

    return {
        LIB_VERSION:            LIB_VERSION,
        EST_FIELDS:             EST,
        SO_FIELDS:              SO,
        LOG_FIELDS:             LOG,
        EMAIL_COPY:             EMAIL_COPY,
        money:                  money,
        paysUpFront:            paysUpFront,
        loadListOptions:        loadListOptions,
        listOrderableQuotes:    listOrderableQuotes,
        inferProjectType:       inferProjectType,
        findExistingOrders:     findExistingOrders,
        convertQuote:           convertQuote,
        orderConfirmationEmail: orderConfirmationEmail
    };

});
