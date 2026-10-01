/**
 * @NApiVersion 2.1
 * @NModuleScope Public
 *
 * @name        Nu-Heat Opportunity Update Library
 * @description Shared by the "update the opportunity" pages — Send Quote (nuheat_send_quote_sl.js)
 *              and Update Opportunity (nuheat_update_opp_sl.js): field rules, preparing and writing
 *              the Opportunity fields, the required-field gate, redirect codes, text cleaning, and
 *              the page building blocks (CSS, header, update section, error page, page-script core).
 * @version     1.2.0
 * @author      Nu-Heat Development
 *
 * ⚠️ EXTERNAL CONSUMER: the customer dashboard (NS-Customer-Dashboard) requires this library by
 *    absolute path (/SuiteScripts/NuHeat/2026 Quote/nuheat_opp_update_lib). Don't rename, move or
 *    change the signatures of fieldOptions, writeOppUpdate, createObjections or LIB_VERSION without
 *    a matching dashboard change.
 *
 * ⚠️ DEPLOYMENT: a shared AMD module — no script record, no deployment. Upload it to
 *    SuiteScripts/NuHeat/2026 Quote/ BEFORE either Suitelet is redeployed; both define() it as
 *    './nuheat_opp_update_lib' and fail at load time without it.
 *
 * CHANGELOG v1.2.0 (Release 2.1 part A — customer-safe server functions; additive only):
 *   - ADDED: fieldOptions(key, [oppId]) — a select field's options [{ id, text }] by prepareFields()'
 *     mechanism (dynamic Opportunity + getSelectOptions()). Not a select → OPPLIB_NOT_A_SELECT.
 *   - ADDED: writeOppUpdate({ oppId, values, allowed }) — validated server write: unknown key →
 *     OPPLIB_UNKNOWN_FIELD; a select value outside allowed[key] or the options →
 *     OPPLIB_VALUE_NOT_ALLOWED; bad date → OPPLIB_INVALID_DATE; nothing written on any of them.
 *     Compares with pendingChanges() against one lookupFields; writes as updateFields() does.
 *   - ADDED: createObjections({ oppId, typeIds, notes, contextLine, raisedBy, raisedOn, quoteId }) —
 *     moved from Update Opportunity SL 1.1.0 (same fields, same notes format); the Suitelet (1.1.1)
 *     now calls it. Also OBJECTION_FIELDS and objectionNotes.
 *   - LIB_VERSION exported (it already was; now 1.2.0). No existing export changed; define() unchanged.
 *
 * CHANGELOG v1.1.0 (in Production, 1 Oct 2026):
 *   - ADDED (moved from Send Quote SL 2.3.0, unchanged bytes): the email shell emailShell(slots),
 *     the contact card emailRepCard(rep, label), emailButton, lookupText / resolveFirstName /
 *     checkPhotoUrl, GENERIC_REP_NAME, EMAIL_IMG / EMAIL_FONT / EMAIL_FACE / SOCIAL_LINKS, EMAIL_RE,
 *     parseEmails (comma-only, as Send Quote) and invalidEmails. No merge-tag substitution here.
 *   - ADDED: sendEmail(o) — email.send with relatedRecords { entityId, transactionId }; never throws.
 *   - ADDED: pendingChanges(params) — the pure "what would change" half of updateFields(), which
 *     now uses it (identical behaviour: Send Quote's suites and hashes pass unchanged).
 *   - ADDED (Update Opportunity 1.1.0): loadSender(logKey, [employeeId]) — an employee's card (the
 *     current user by default; amendment 2: the sales rep or project engineer when given);
 *     the recipients component — buildRecipientsHTML, RECIPIENTS_SCRIPT (constant script fragment),
 *     readPostedRecipients, resolveRecipients (server rebuilds every address; 1–10 To addresses).
 *   - define() gains N/email and N/runtime (NOT N/render).
 *
 * RULES (carried from Send Quote 1.8.0–2.0.4 — see AI_AGENT_CONTEXT):
 *   - Write only changed, non-blank values; blank never clears. One submitFields on the Opportunity,
 *     which each page makes its LAST record write.
 *   - enableSourcing: true only when Status changes (Probability follows Status).
 *   - custbody_opportunity_sub_status is NEVER written.
 *   - Page rules: { required: ['next_contact'], logKey: 'UpdateOppSL.OppUpdate' }. Send Quote passes
 *     { logKey: 'SendQuoteSL.OppUpdate' } — nothing required.
 *   - "Required" (validateRequired) = the Opportunity must END UP with a value: a valid submitted
 *     value, or a value already on the RECORD (search.lookupFields) — never the posted originals.
 *
 * PAGE SCRIPT HOOK CONTRACT (PAGE_SCRIPT_CORE, via pageScript(pagePart)):
 *   A page's inline script is '(function(){' + PAGE_SCRIPT_CORE + PAGE_PART + <DOM-ready init> '})();'
 *   — all constants, nothing interpolated. CORE defines $, each, fieldText, guardEnter, updChanges,
 *   requiredProblem, update, submitForm and init. PAGE_PART must define:
 *     pageInit(root)  — wire the page's own widgets (called once from init)
 *     problem()       — '' when Save may proceed, else the one-line reason
 *     summary()       — the footer's first line
 *     beforeSubmit()  — fill the page's hidden inputs just before the form is submitted
 *   and call submitForm(busyText) from its Save button. Shared element IDs: #nsq-root, #nsq-send (the
 *   Save/Send button), #nsq-reason, #nsq-sum-line, #nsq-sum-changes. Update fields carry class
 *   .nsq-upd and data-orig / data-orig-text / data-label / data-required.
 *
 * ⚠️ KNOWN DUPLICATION: Send Quote's inline script still carries its own copy of the
 *    update-field/changed-marker logic; PAGE_SCRIPT_CORE is the canonical version. Migrating Send
 *    Quote to CORE is a separate change with its own browser test — do not fold it into another PR.
 */

define(['N/ui/serverWidget', 'N/search', 'N/record', 'N/log', 'N/url', 'N/format', 'N/email', 'N/runtime'],
function (serverWidget, search, record, log, url, format, email, runtime) {

    'use strict';

    var LIB_VERSION = '1.2.0';

    // ─── Field rules ──────────────────────────────────────────────────────────────

    /**
     * v1.8.0: Opportunity fields the account manager can update when sending a proposal.
     *
     * `kind` is the field type ASSUMED for each field — the GET checks it against the type
     * NetSuite reports (record.getField().type) and does not show a field that disagrees.
     * The two date types and the Build stage type are assumptions awaiting confirmation.
     *
     * ⚠️ custbody_opportunity_sub_status must NEVER be added here. Some sub-status values
     * create Design Instruction rows; this Suitelet does not own that field.
     */
    var OPP_UPDATE_FIELDS = [
        { key: 'entitystatus', fieldId: 'entitystatus',          label: 'Status',             kind: 'select', blankOption: false },
        { key: 'next_contact', fieldId: 'custbody_next_contact', label: 'Next contact',       kind: 'date' },
        { key: 'del_date',     fieldId: 'custbody_opp_del_date', label: 'Est. delivery date', kind: 'date' },
        { key: 'build_stage',  fieldId: 'custbody_build_stage',  label: 'Build stage',        kind: 'select', blankOption: true },
        { key: 'close_date',   fieldId: 'expectedclosedate',     label: 'Expected close',     kind: 'date' }   // v2.0.2, standard field
    ];

    /** v2.0.2: order the fields appear in on the page (processing order above is unchanged). */
    var OPP_UPDATE_DISPLAY_ORDER = ['entitystatus', 'build_stage', 'close_date', 'next_contact', 'del_date'];

    var OPP_UPDATE_KEYS_FIELD = 'custpage_upd_fields';   // hidden: keys of the fields actually shown

    function updFieldId(def)     { return 'custpage_upd_' + def.key; }
    function origFieldId(def)    { return 'custpage_orig_' + def.key; }
    function origTextFieldId(def) { return 'custpage_origtxt_' + def.key; }

    function fieldDef(key) {
        for (var i = 0; i < OPP_UPDATE_FIELDS.length; i++) {
            if (OPP_UPDATE_FIELDS[i].key === key) return OPP_UPDATE_FIELDS[i];
        }
        return null;
    }

    function logKeyFor(rules) {
        return (rules && rules.logKey) || 'OppUpdateLib.OppUpdate';
    }

    // ─── Prepare and write (moved unchanged from Send Quote 2.0.4) ────────────────

    /**
     * Prepares the four "Update the opportunity" fields.
     *
     * Each field is shown only if NetSuite reports the assumed type and, for SELECTs, the
     * record returns options. Options come from the Opportunity itself (dynamic record,
     * getSelectOptions()), so the list is exactly what NetSuite offers on this record and no
     * internal IDs appear in code.
     *
     * @param {record.Record} oppRecord - Opportunity, loaded with isDynamic: true
     * @param {string} opportunityId
     * @param {Object} rules - page rules: { required: [keys], logKey: 'PageSL.OppUpdate' }
     * @returns {Array<{def: Object, options: Array, orig: string, origText: string, required: boolean}>}
     */
    function prepareFields(oppRecord, opportunityId, rules) {
        var logKey = logKeyFor(rules);
        var required = (rules && rules.required) || [];
        var prepared = [];
        var typeReport = [];

        OPP_UPDATE_FIELDS.forEach(function (def) {
            try {
                var nsField = oppRecord.getField({ fieldId: def.fieldId });
                if (!nsField) {
                    typeReport.push(def.fieldId + '=(not on record)');
                    log.audit(logKey, 'Opportunity ' + opportunityId + ' — ' + def.fieldId +
                        ' not available on the record; field not shown');
                    return;
                }

                var reportedType = String(nsField.type || '').toLowerCase();
                typeReport.push(def.fieldId + '=' + reportedType);
                if (reportedType !== def.kind) {
                    log.audit(logKey, 'Opportunity ' + opportunityId + ' — ' + def.fieldId +
                        ' reports type "' + reportedType + '" but "' + def.kind + '" was assumed; field not shown');
                    return;
                }

                var raw = oppRecord.getValue({ fieldId: def.fieldId });

                if (def.kind === 'select') {
                    var options = nsField.getSelectOptions() || [];
                    if (!options.length) {
                        log.audit(logKey, 'Opportunity ' + opportunityId + ' — ' + def.fieldId +
                            ' returned no select options; field not shown');
                        return;
                    }
                    var rawStr = (raw === null || raw === undefined) ? '' : String(raw);
                    var origText = '';
                    options.forEach(function (o) {
                        if (String(o.value) === rawStr) origText = o.text;
                    });
                    // Without a blank option the dropdown would default to its first entry, and an
                    // untouched submit would then write a value the user never chose.
                    if (!def.blankOption && !origText) {
                        log.audit(logKey, 'Opportunity ' + opportunityId + ' — current ' + def.fieldId +
                            ' value "' + rawStr + '" is not among its ' + options.length + ' options; field not shown');
                        return;
                    }
                    prepared.push({ def: def, options: options, orig: rawStr, origText: origText, required: required.indexOf(def.key) !== -1 });
                } else {
                    // v2.0.1: <input type="date"> takes yyyy-mm-dd. Built from the Date's own parts —
                    // toISOString() would convert to UTC and can move the date back a day.
                    var isoStr = '';
                    var dateText = '';
                    if (raw instanceof Date && !isNaN(raw.getTime())) {
                        isoStr = toIsoDate(raw);
                        dateText = format.format({ value: raw, type: format.Type.DATE });
                    } else if (raw) {
                        log.debug(logKey, def.fieldId + ' returned a non-Date value "' + raw + '"; shown blank');
                        dateText = String(raw);
                    }
                    prepared.push({ def: def, orig: isoStr, origText: dateText, required: required.indexOf(def.key) !== -1 });
                }
            } catch (e) {
                log.audit(logKey, 'Opportunity ' + opportunityId + ' — ' + def.fieldId +
                    ' could not be prepared (' + e.message + '); field not shown');
            }
        });

        // F3 check: the reported types are the evidence for the assumed ones.
        log.audit(logKey, 'Opportunity ' + opportunityId + ' — reported field types: ' + typeReport.join(', '));

        return prepared;
    }

    function pad2(n) { return (n < 10 ? '0' : '') + n; }

    /**
     * v2.0.1: Date → 'yyyy-mm-dd' from its own date parts. Never toISOString() (UTC shift).
     */
    function toIsoDate(d) {
        return d.getFullYear() + '-' + pad2(d.getMonth() + 1) + '-' + pad2(d.getDate());
    }

    /**
     * v2.0.1: Parses an <input type="date"> value. Accepts only yyyy-mm-dd naming a real
     * calendar date; returns new Date(y, m - 1, d), or null for anything else.
     */
    function parseIsoDate(str) {
        var m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(str || ''));
        if (!m) return null;
        var y = +m[1], mo = +m[2], d = +m[3];
        var date = new Date(y, mo - 1, d);
        if (date.getFullYear() !== y || date.getMonth() !== mo - 1 || date.getDate() !== d) return null;
        return date;
    }

    /**
     * v1.1.0: the field changes a POST would write — PURE (no logging, no I/O). Split out of
     * updateFields() so a page can ask "is anything changing?" before any write (Update Opportunity
     * D23); updateFields() uses it, so both always agree.
     *
     * Only the fields the page showed (custpage_upd_fields); a blank never clears; selects compared
     * as values; dates must be yyyy-mm-dd calendar dates (else listed in invalidDates, not written).
     *
     * @param {Object} params - request.parameters
     * @returns {{ values: Object, changed: Array<{key, label, fieldId, from, to}>, logParts: string[],
     *             invalidDates: Array<{fieldId: string, submitted: string}> }}
     */
    function pendingChanges(params) {
        params = params || {};
        var out = { values: {}, changed: [], logParts: [], invalidDates: [] };
        var shownKeys = String(params[OPP_UPDATE_KEYS_FIELD] || '').split(',').filter(function (k) { return k; });

        OPP_UPDATE_FIELDS.forEach(function (def) {
            if (shownKeys.indexOf(def.key) === -1) return;

            var submitted = String(params[updFieldId(def)] || '').trim();
            var orig      = String(params[origFieldId(def)] || '').trim();
            var origText  = String(params[origTextFieldId(def)] || '').trim();

            if (!submitted) return;   // a blank never clears data

            if (def.kind === 'select') {
                if (submitted === orig) return;
                out.values[def.fieldId] = submitted;
            } else {
                // v2.0.1: yyyy-mm-dd from the date picker; compared as strings
                var newDate = parseIsoDate(submitted);
                if (!newDate) {
                    out.invalidDates.push({ fieldId: def.fieldId, submitted: submitted });
                    return;
                }
                if (submitted === orig) return;
                out.values[def.fieldId] = newDate;
            }
            out.changed.push({ key: def.key, label: def.label, fieldId: def.fieldId, from: origText || orig, to: submitted });
            out.logParts.push(def.fieldId + ': ' + (orig || '(blank)') + ' → ' + submitted);
        });
        return out;
    }

    /**
     * Writes the Opportunity fields the user changed in "Update the opportunity".
     *
     * Called only after the proposal email has been sent. Rules:
     *   - Only fields that were shown on the page are considered.
     *   - A blank submitted value is never written (clearing here does nothing).
     *   - An unchanged value is never written; nothing changed → no write at all.
     *   - Everything that did change goes in ONE record.submitFields; dates as Date objects.
     *   - Never throws. A failure is logged and returned in `error`.
     *   - custbody_opportunity_sub_status is never written (not in OPP_UPDATE_FIELDS).
     *
     * @param {string} opportunityId
     * @param {Object} params - request.parameters
     * @param {Object} rules - page rules (logKey)
     * @returns {{attempted: boolean, changed: Array<{key: string, label: string, fieldId: string, from: string, to: string}>, error: string}}
     *          On error, `changed` lists the fields that were attempted but not saved.
     */
    function updateFields(opportunityId, params, rules) {
        var logKey = logKeyFor(rules);
        var result = { attempted: false, changed: [], error: '' };
        var values = {};
        var logParts = [];

        try {
            // v1.1.0: the comparison lives in pendingChanges() — same rules, same order
            var pending = pendingChanges(params);
            pending.invalidDates.forEach(function (d) {
                log.audit(logKey, 'Opportunity ' + opportunityId + ' — ' + d.fieldId +
                    ' value "' + d.submitted + '" is not a yyyy-mm-dd calendar date; not written');
            });
            values   = pending.values;
            logParts = pending.logParts;
            result.changed = pending.changed;

            if (result.changed.length === 0) {
                log.audit(logKey, 'Opportunity ' + opportunityId + ' — no changes');
                return result;
            }

            // v2.0.0: sourcing ON only when Status changed. With enableSourcing: false, Probability
            // did not follow a new Status in Sandbox (1.8.0, S5) — Probability is sourced from the
            // status. Kept OFF otherwise so a date/Build stage change sources nothing.
            var statusChanged = values.hasOwnProperty('entitystatus');

            result.attempted = true;
            record.submitFields({
                type:    record.Type.OPPORTUNITY,
                id:      opportunityId,
                values:  values,
                options: {
                    enableSourcing:        statusChanged,
                    ignoreMandatoryFields: true
                }
            });

            log.audit(logKey, 'Opportunity ' + opportunityId + ' — updated ' + logParts.join('; ') +
                ' (enableSourcing: ' + statusChanged + ')');

        } catch (e) {
            log.error(logKey, 'Opportunity ' + opportunityId + ' — update FAILED. Attempted: ' +
                (logParts.join('; ') || '(none)') + ' | Error: ' + e.message);
            result.error = e.message || String(e);
        }

        return result;
    }

    // ─── Server-side, customer-safe functions (v1.2.0) ────────────────────────────
    //
    // ⚠️ EXTERNAL CONSUMER: the customer dashboard (NS-Customer-Dashboard) requires this library by
    //    absolute path. Don't rename, move or change the signatures of fieldOptions, writeOppUpdate,
    //    createObjections or LIB_VERSION without a matching dashboard change.
    //
    // Errors are plain Error objects whose `name` is the code (OPPLIB_*), so this module's define()
    // list stays as it was (no N/error). Catch and test e.name.

    function oppLibError(code, message) {
        var e = new Error(code + ': ' + message);
        e.name = code;
        return e;
    }

    /**
     * The field definition for a library key ('build_stage') or its NetSuite field ID
     * ('custbody_build_stage') — both name the same field. null when it is neither. The sub-status is
     * not in OPP_UPDATE_FIELDS, so it never resolves.
     */
    function resolveFieldDef(keyOrFieldId) {
        var k = String(keyOrFieldId === null || keyOrFieldId === undefined ? '' : keyOrFieldId);
        for (var i = 0; i < OPP_UPDATE_FIELDS.length; i++) {
            if (OPP_UPDATE_FIELDS[i].key === k || OPP_UPDATE_FIELDS[i].fieldId === k) return OPP_UPDATE_FIELDS[i];
        }
        return null;
    }

    /**
     * A select field's options from a DYNAMIC Opportunity record — prepareFields()' mechanism
     * (getField() → reported type check → getSelectOptions()). Throws OPPLIB_FIELD_UNAVAILABLE when
     * the field is missing, reports another type or has no options.
     */
    function selectOptionsFrom(oppRecord, def) {
        var nsField = oppRecord.getField({ fieldId: def.fieldId });
        if (!nsField) throw oppLibError('OPPLIB_FIELD_UNAVAILABLE', def.fieldId + ' is not available on the Opportunity');
        var reportedType = String(nsField.type || '').toLowerCase();
        if (reportedType !== 'select') {
            throw oppLibError('OPPLIB_FIELD_UNAVAILABLE', def.fieldId + ' reports type "' + reportedType + '", not "select"');
        }
        var options = nsField.getSelectOptions() || [];
        if (!options.length) throw oppLibError('OPPLIB_FIELD_UNAVAILABLE', def.fieldId + ' returned no select options');
        return options.map(function (o) { return { id: String(o.value), text: String(o.text) }; });
    }

    /**
     * v1.2.0: the options of one of the library's select fields, read on the server —
     * [{ id, text }], exactly what the internal pages put in their dropdowns.
     *
     * Mechanism (the same as prepareFields): a DYNAMIC Opportunity record and
     * Field.getSelectOptions(). With oppId, that Opportunity is loaded (record.load, 10 units),
     * so the list is the one its own page shows; without, a new dynamic Opportunity is created in
     * memory and never saved (record.create, 10 units). getSelectOptions() itself costs nothing.
     *
     * @param {string} key - a library key ('build_stage') or its field ID ('custbody_build_stage')
     * @param {string} [oppId]
     * @returns {Array<{id: string, text: string}>}
     * @throws OPPLIB_NOT_A_SELECT (not one of the library's select fields), OPPLIB_FIELD_UNAVAILABLE
     */
    function fieldOptions(key, oppId) {
        var def = resolveFieldDef(key);
        if (!def || def.kind !== 'select') {
            throw oppLibError('OPPLIB_NOT_A_SELECT', '"' + key + '" is not one of the library\'s select fields');
        }
        var oppRecord = oppId
            ? record.load({ type: record.Type.OPPORTUNITY, id: oppId, isDynamic: true })
            : record.create({ type: record.Type.OPPORTUNITY, isDynamic: true });
        return selectOptionsFrom(oppRecord, def);
    }

    /** A lookupFields value as the page's original: select → its value, date → yyyy-mm-dd. */
    function lookupOrig(def, v) {
        if (def.kind === 'select') {
            if (Array.isArray(v)) return { orig: v.length ? String(v[0].value || '') : '', origText: v.length ? String(v[0].text || '') : '' };
            return { orig: v === null || v === undefined ? '' : String(v), origText: '' };
        }
        if (v === null || v === undefined || v === '') return { orig: '', origText: '' };
        var d = v instanceof Date ? v : null;
        if (!d) {
            try { d = format.parse({ value: String(v), type: format.Type.DATE }); } catch (e) { d = null; }
        }
        if (!(d instanceof Date) || isNaN(d.getTime())) return { orig: '', origText: String(v) };
        return { orig: toIsoDate(d), origText: String(v) };
    }

    /**
     * v1.2.0: a validated server write of the library's fields — for callers that do not post the
     * internal page's form (the customer dashboard). Validates EVERYTHING before any write; any
     * failure throws and nothing is written.
     *
     *   values  { <key>: value } — library keys or their field IDs, OPP_UPDATE_FIELDS only
     *           (unknown → OPPLIB_UNKNOWN_FIELD; the sub-status is never one). Selects: an option id.
     *           Dates: 'yyyy-mm-dd' (parseIsoDate; invalid → OPPLIB_INVALID_DATE). Blank never clears.
     *   allowed { <key>: [ids] } — every non-blank select value must be in allowed[key] AND among
     *           the field's options on this Opportunity (fieldOptions' mechanism), else
     *           OPPLIB_VALUE_NOT_ALLOWED.
     *
     * The comparison is pendingChanges() itself, fed with the Opportunity's CURRENT values (one
     * search.lookupFields — never caller-supplied originals). The write is updateFields()' write:
     * one record.submitFields, ignoreMandatoryFields: true, enableSourcing: true only when Status is
     * among the values written. Nothing changed → no write.
     *
     * Governance: lookupFields 1 + (a non-blank select) record.load 10 + (a change) submitFields 10.
     *
     * @param {{oppId: string, values: Object, allowed: Object, statusChange: *, logKey: string}} o
     *        statusChange is accepted and not used: sourcing follows whether Status is written.
     * @returns {{written: Object<string, {old: string, new: string}>, unchanged: string[]}}
     *          keys are library keys; old/new are option ids or yyyy-mm-dd. Blank values are in
     *          unchanged (they never clear).
     */
    function writeOppUpdate(o) {
        o = o || {};
        var logKey = o.logKey || 'OppUpdateLib.writeOppUpdate';
        var oppId = o.oppId;
        if (!oppId) throw oppLibError('OPPLIB_BAD_ARGS', 'oppId is required');
        var values = o.values;
        if (!values || typeof values !== 'object' || Array.isArray(values)) throw oppLibError('OPPLIB_BAD_ARGS', 'values must be an object');
        var allowed = (o.allowed && typeof o.allowed === 'object') ? o.allowed : {};

        // ── 1. Keys, dates and the allowed lists — no I/O ──
        var items = [];
        var seen = {};
        Object.keys(values).forEach(function (k) {
            var def = resolveFieldDef(k);
            if (!def) throw oppLibError('OPPLIB_UNKNOWN_FIELD', '"' + k + '" is not a field this library writes');
            if (seen[def.key]) throw oppLibError('OPPLIB_UNKNOWN_FIELD', '"' + k + '" names ' + def.key + ' twice');
            seen[def.key] = true;
            var raw = values[k];
            var v = String(raw === null || raw === undefined ? '' : raw).trim();
            if (v && def.kind === 'date' && !parseIsoDate(v)) {
                throw oppLibError('OPPLIB_INVALID_DATE', def.key + ' value "' + v + '" is not a yyyy-mm-dd calendar date');
            }
            if (v && def.kind === 'select') {
                var list = allowed.hasOwnProperty(def.key) ? allowed[def.key] : allowed[def.fieldId];
                var ok = Array.isArray(list) && list.some(function (a) { return String(a) === v; });
                if (!ok) throw oppLibError('OPPLIB_VALUE_NOT_ALLOWED', def.key + ' value "' + v + '" is not in the allowed list');
            }
            items.push({ def: def, value: v });
        });

        var result = { written: {}, unchanged: [] };
        var toCheck = items.filter(function (it) { return it.value; });
        items.forEach(function (it) { if (!it.value) result.unchanged.push(it.def.key); });   // blank never clears
        if (!toCheck.length) {
            log.audit(logKey, 'Opportunity ' + oppId + ' — no values to write');
            return result;
        }

        // ── 2. Select values must be real options on this Opportunity (one load for all) ──
        var selects = toCheck.filter(function (it) { return it.def.kind === 'select'; });
        if (selects.length) {
            var oppRecord = record.load({ type: record.Type.OPPORTUNITY, id: oppId, isDynamic: true });
            selects.forEach(function (it) {
                var options = selectOptionsFrom(oppRecord, it.def);
                if (!options.some(function (op) { return op.id === it.value; })) {
                    throw oppLibError('OPPLIB_VALUE_NOT_ALLOWED', it.def.key + ' value "' + it.value + '" is not an option on Opportunity ' + oppId);
                }
            });
        }

        // ── 3. Current values (one lookupFields), then pendingChanges() decides ──
        var current = search.lookupFields({
            type:    search.Type.OPPORTUNITY,
            id:      oppId,
            columns: toCheck.map(function (it) { return it.def.fieldId; })
        }) || {};
        var params = {};
        var origByKey = {};
        params[OPP_UPDATE_KEYS_FIELD] = toCheck.map(function (it) { return it.def.key; }).join(',');
        toCheck.forEach(function (it) {
            var cur = lookupOrig(it.def, current[it.def.fieldId]);
            origByKey[it.def.key] = cur.orig;
            params[updFieldId(it.def)]      = it.value;
            params[origFieldId(it.def)]     = cur.orig;
            params[origTextFieldId(it.def)] = cur.origText;
        });
        var pending = pendingChanges(params);
        if (pending.invalidDates.length) {   // already rejected above; kept so the two can never disagree silently
            throw oppLibError('OPPLIB_INVALID_DATE', pending.invalidDates.map(function (d) { return d.fieldId; }).join(', '));
        }
        var changedKeys = pending.changed.map(function (c) { return c.key; });
        toCheck.forEach(function (it) {
            if (changedKeys.indexOf(it.def.key) === -1) result.unchanged.push(it.def.key);
        });
        if (!pending.changed.length) {
            log.audit(logKey, 'Opportunity ' + oppId + ' — no changes');
            return result;
        }

        // ── 4. The write — updateFields()' options; the sub-status is never in values ──
        var statusChanged = pending.values.hasOwnProperty('entitystatus');
        try {
            record.submitFields({
                type:    record.Type.OPPORTUNITY,
                id:      oppId,
                values:  pending.values,
                options: {
                    enableSourcing:        statusChanged,
                    ignoreMandatoryFields: true
                }
            });
        } catch (e) {
            log.error(logKey, 'Opportunity ' + oppId + ' — update FAILED. Attempted: ' + pending.logParts.join('; ') + ' | Error: ' + e.message);
            throw e;
        }
        log.audit(logKey, 'Opportunity ' + oppId + ' — updated ' + pending.logParts.join('; ') + ' (enableSourcing: ' + statusChanged + ')');
        pending.changed.forEach(function (c) {
            result.written[c.key] = { old: origByKey[c.key], new: c.to };
        });
        return result;
    }

    // ─── Customer Objections (v1.2.0: moved from Update Opportunity SL 1.1.0) ─────

    /**
     * Customer Objection. custrecord_nhobj_group and custrecord_nhobj_customer are sourced by
     * NetSuite — NEVER set them here.
     */
    var OBJ = {
        record:      'customrecord_nh_objection',
        opportunity: 'custrecord_nhobj_opportunity',
        type:        'custrecord_nhobj_type',
        quote:       'custrecord_nhobj_quote',
        notes:       'custrecord_nhobj_notes',
        raisedBy:    'custrecord_nhobj_raised_by',
        raisedOn:    'custrecord_nhobj_raised_on'
    };

    /**
     * D11 / D21: "<note>\n\n<context line>", or just the context line (or just the note when there
     * is no context line). custrecord_nhobj_notes is mandatory on the record.
     */
    function objectionNotes(note, contextLine) {
        if (!contextLine) return note;
        return note ? note + '\n\n' + contextLine : contextLine;
    }

    /**
     * v1.2.0: creates one Customer Objection per type — the Update Opportunity Suitelet's own loop
     * (D10, D11), moved here unchanged. One failure does not stop the others.
     *
     *   notes        per-type notes { <typeId>: note } or one string for every type (optional)
     *   contextLine  appended after a blank line (D11/D21); the note alone without it
     *   raisedBy     employee id; blank (a customer) → custrecord_nhobj_raised_by left empty
     *   raisedOn     Date or 'yyyy-mm-dd'; default the server's today
     *   quoteId      optional Estimate id
     *
     * The caller validates the type ids and the quote (the Suitelet does, against the record).
     * A type whose notes would be empty → OPPLIB_NOTES_REQUIRED before ANY record is created.
     * Governance: per objection record.create 2 + save 4 (custom record).
     *
     * @returns {{created: string[], failed: string[], errors: Object<string, string>}}
     */
    function createObjections(o) {
        o = o || {};
        var logKey = o.logKey || 'OppUpdateLib.Objection';
        var oppId = o.oppId;
        if (!oppId) throw oppLibError('OPPLIB_BAD_ARGS', 'oppId is required');
        var typeIds = Array.isArray(o.typeIds) ? o.typeIds : [];
        var contextLine = String(o.contextLine || '');

        var raisedOn = o.raisedOn;
        if (raisedOn === undefined || raisedOn === null || raisedOn === '') {
            var now = new Date();
            raisedOn = new Date(now.getFullYear(), now.getMonth(), now.getDate());
        } else if (!(raisedOn instanceof Date)) {
            var parsed = parseIsoDate(String(raisedOn).trim());
            if (!parsed) throw oppLibError('OPPLIB_INVALID_DATE', 'raisedOn "' + raisedOn + '" is not a yyyy-mm-dd calendar date');
            raisedOn = parsed;
        }

        function noteFor(typeId) {
            var n = (o.notes && typeof o.notes === 'object') ? o.notes[typeId] : o.notes;
            return String(n === null || n === undefined ? '' : n).trim();
        }
        var notesByType = {};
        typeIds.forEach(function (typeId) {
            var text = objectionNotes(noteFor(typeId), contextLine);
            if (!text) throw oppLibError('OPPLIB_NOTES_REQUIRED', 'objection of type ' + typeId + ' would have no notes');
            notesByType[typeId] = text;
        });

        var out = { created: [], failed: [], errors: {} };
        typeIds.forEach(function (typeId) {
            try {
                var rec = record.create({ type: OBJ.record });
                rec.setValue({ fieldId: OBJ.opportunity, value: oppId });
                rec.setValue({ fieldId: OBJ.type, value: typeId });
                if (o.quoteId) rec.setValue({ fieldId: OBJ.quote, value: o.quoteId });
                rec.setValue({ fieldId: OBJ.notes, value: notesByType[typeId] });
                if (o.raisedBy) rec.setValue({ fieldId: OBJ.raisedBy, value: o.raisedBy });
                rec.setValue({ fieldId: OBJ.raisedOn, value: raisedOn });   // D10 / D22
                var oid = rec.save();
                out.created.push(oid);
                log.audit(logKey, 'Opportunity ' + oppId + ' — objection ' + oid + ' created (type ' + typeId + ')');
            } catch (e) {
                out.failed.push(typeId);
                out.errors[typeId] = e.message || String(e);
                log.error(logKey, 'Opportunity ' + oppId + ' — objection of type ' + typeId + ' FAILED: ' + e.message);
            }
        });
        return out;
    }

    // ─── Page data ────────────────────────────────────────────────────────────────

    /**
     * Loads what every "update the opportunity" page shows at the top: the Opportunity (dynamic,
     * for getSelectOptions()), its header fields, the customer (and, optionally, the customer's
     * email) and the Opportunity's contacts.
     *
     * @param {string} opportunityId
     * @param {Object} opts - { logPrefix: 'SendQuoteSL', customerEmail: boolean }
     * @returns {Object} page base; loadError is set (and nothing else) when the record can't load
     */
    function loadOppPageBase(opportunityId, opts) {
        opts = opts || {};
        var logPrefix = opts.logPrefix || 'OppUpdateLib';
        var page = { opportunityId: String(opportunityId), loadError: '' };

        // ── Load Opportunity record ──────────────────────────────────────────────
        // v1.8.0: isDynamic so getSelectOptions() works for the update fields.
        var oppRecord;
        try {
            oppRecord = record.load({ type: record.Type.OPPORTUNITY, id: opportunityId, isDynamic: true });
        } catch (e) {
            log.error(logPrefix + '.showForm', 'Failed to load Opportunity ' + opportunityId + ': ' + e.message);
            page.loadError = 'Could not load Opportunity record (ID: ' + opportunityId + '). Please check the record exists and you have permission to view it.';
            return page;
        }
        page.oppRecord = oppRecord;

        page.tranId       = oppRecord.getValue({ fieldId: 'tranid' })    || '';
        page.title        = oppRecord.getValue({ fieldId: 'title' })     || '';
        page.customerName = oppRecord.getText({ fieldId: 'entity' })     || '';
        var customerId    = oppRecord.getValue({ fieldId: 'entity' })    || '';
        page.customerId   = customerId;
        page.status       = oppRecord.getText({ fieldId: 'entitystatus' }) || '';

        // v1.4.5: Defensive loading of site address — field may not exist on all environments
        page.siteAddress = '';
        try {
            page.siteAddress = oppRecord.getValue({ fieldId: 'custbody_opp_site_adress' }) || '';
        } catch (siteErr) {
            log.debug(logPrefix + '.showForm', 'Could not read custbody_opp_site_adress: ' + siteErr.message + ' — field may not exist');
        }

        // Customer email — the default To address (Send Quote only)
        page.customerEmail = '';
        if (opts.customerEmail && customerId) {
            try {
                var custFields = search.lookupFields({
                    type: search.Type.CUSTOMER,
                    id: customerId,
                    columns: ['email']
                });
                page.customerEmail = custFields.email || '';
            } catch (e) {
                log.debug(logPrefix + '.showForm', 'Could not look up customer email: ' + e.message);
            }
        }

        log.audit(logPrefix + '.showForm', 'Opportunity: ' + page.tranId + ' | Title: ' + page.title +
            ' | Customer: ' + page.customerName + ' | Email: ' + page.customerEmail + ' | SiteAddr: ' + page.siteAddress);

        page.contacts = loadContacts(opportunityId, logPrefix);
        return page;
    }

    /**
     * v1.5.0: Contacts linked to this Opportunity via Opportunity search + contact join
     * (the contact sublist API does not work on Opportunities — §9 pitfall 11).
     * @returns {Array<{id: string, name: string, email: string}>}
     */
    function loadContacts(opportunityId, logPrefix) {
        var contacts = [];
        try {
            var contactSearch = search.create({
                type: search.Type.OPPORTUNITY,
                filters: [
                    ['internalid', 'anyof', opportunityId]
                ],
                columns: [
                    search.createColumn({ name: 'internalid',  join: 'contact' }),
                    search.createColumn({ name: 'firstname',   join: 'contact' }),
                    search.createColumn({ name: 'lastname',    join: 'contact' }),
                    search.createColumn({ name: 'email',       join: 'contact' })
                ]
            });

            contactSearch.run().each(function (result) {
                var contactId = result.getValue({ name: 'internalid', join: 'contact' });
                if (!contactId) return true;
                var firstName = result.getValue({ name: 'firstname',  join: 'contact' }) || '';
                var lastName  = result.getValue({ name: 'lastname',   join: 'contact' }) || '';
                var email     = result.getValue({ name: 'email',      join: 'contact' }) || '';
                contacts.push({
                    id:    contactId,
                    name:  (firstName + ' ' + lastName).trim() || 'Contact ' + contactId,
                    email: email
                });
                return true;
            });
        } catch (contactErr) {
            log.debug((logPrefix || 'OppUpdateLib') + '.loadContacts', 'Contact search failed: ' + contactErr.message);
        }
        return contacts;
    }

    /** The Opportunity's VIEW URL, or '' (logged). */
    function resolveOppUrl(opportunityId, logPrefix) {
        try {
            return url.resolveRecord({ recordType: 'opportunity', recordId: opportunityId, isEditMode: false });
        } catch (e) {
            log.debug((logPrefix || 'OppUpdateLib') + '.showForm', 'Could not resolve Opportunity URL: ' + e.message);
            return '';
        }
    }

    // ─── Posted values, required gate, redirect codes ─────────────────────────────

    /** The update fields' posted values by key — for re-rendering a page after a failed save. */
    function readPostedUpdateValues(params) {
        var upd = {};
        OPP_UPDATE_FIELDS.forEach(function (def) {
            var v = params[updFieldId(def)];
            if (v !== undefined && v !== null) upd[def.key] = String(v);
        });
        return upd;
    }

    /**
     * D3 gate: every key in rules.required must END UP with a value on the Opportunity — either a
     * valid submitted value, or a value already on the RECORD. The record is read with
     * search.lookupFields (1 unit); the posted custpage_orig_* values are client-supplied and are
     * NOT trusted. Blank never clears, so "blank submitted + record has a value" passes.
     *
     * @returns {{ok: boolean, missing: Array<string>}} missing = labels of the fields that fail
     */
    function validateRequired(opportunityId, params, rules) {
        var result = { ok: true, missing: [] };
        var required = (rules && rules.required) || [];
        if (!required.length) return result;
        var logKey = logKeyFor(rules);
        params = params || {};

        var needLookup = [];
        required.forEach(function (key) {
            var def = fieldDef(key);
            if (!def) return;
            var submitted = String(params[updFieldId(def)] || '').trim();
            var valid = submitted && (def.kind !== 'date' || parseIsoDate(submitted));
            if (!valid) needLookup.push(def);
        });
        if (!needLookup.length) return result;

        var current = {};
        try {
            current = search.lookupFields({
                type:    search.Type.OPPORTUNITY,
                id:      opportunityId,
                columns: needLookup.map(function (d) { return d.fieldId; })
            }) || {};
        } catch (e) {
            log.error(logKey, 'Opportunity ' + opportunityId + ' — required-field lookup failed: ' + e.message);
        }

        needLookup.forEach(function (def) {
            var v = current[def.fieldId];
            var has = Array.isArray(v) ? (v.length > 0 && String(v[0].value) !== '') : (v !== undefined && v !== null && String(v) !== '');
            if (!has) {
                result.ok = false;
                result.missing.push(def.label);
            }
        });
        log.audit(logKey, 'Opportunity ' + opportunityId + ' — required check: ' +
            (result.ok ? 'ok' : 'missing ' + result.missing.join(', ')));
        return result;
    }

    /**
     * The field part of the redirect codes (nuheat_opportunity_ue.js banner): nsq, nsqt and
     * nsqf / nsqff. Codes only — never text. Pages add their own codes after these.
     */
    function fieldRedirectParams(oppUpdate) {
        var p = {
            nsq:  'ok',
            nsqt: String(Math.floor(Date.now() / 1000))
        };

        var keys = (oppUpdate.changed || []).map(function (c) { return c.key; });
        if (oppUpdate.error) {
            p.nsq = 'warn';
            if (keys.length) p.nsqff = keys.join(',');
        } else if (keys.length) {
            p.nsqf = keys.join(',');
        }
        return p;
    }

    // ─── Page building blocks ─────────────────────────────────────────────────────
    //
    // ⚠️ Inline-HTML rules (see AI_AGENT_CONTEXT §9):
    //   - Every interpolated value goes through escapeHtml() (& < > " '). Record text is decoded
    //     and tag-stripped FIRST (cleanText).
    //   - Record and user data live ONLY in element text and data- / value attributes.
    //     NOTHING is interpolated into a <script> block.

    /** Back link, H1 and the meta line (title · customer · site · status). */
    function buildHeaderHTML(page, h1Text) {
        var h = [];
        h.push('<a class="nsq-back" href="' + escapeHtml(page.oppUrl) + '">&larr; Back to opportunity ' + escapeHtml(page.tranId) + '</a>');
        h.push('<h1 class="nsq-h1">' + escapeHtml(h1Text) + '</h1>');
        var meta = [];
        if (page.title)        meta.push('<span>' + escapeHtml(cleanCardText(page.title)) + '</span>');   // v2.0.4: decode first
        if (page.customerName) meta.push('<span>' + escapeHtml(page.customerName) + '</span>');
        if (page.siteAddress)  meta.push('<span>Site: ' + escapeHtml(page.siteAddress) + '</span>');
        if (page.status)       meta.push('<span class="nsq-badge">' + escapeHtml(page.status) + '</span>');
        h.push('<div class="nsq-meta">' + meta.join('<span class="nsq-dot">&middot;</span>') + '</div>');
        return h.join('');
    }

    /** The red error panel at the top of a re-rendered page. */
    function buildErrorAlertHTML(lead, message) {
        return '<div class="nsq-alert nsq-alert-error" role="alert"><strong>' + escapeHtml(lead) + '</strong> ' + escapeHtml(message) + '</div>';
    }

    /**
     * The "Update the opportunity" card: fields in OPP_UPDATE_DISPLAY_ORDER plus the hidden list of
     * shown keys. '' when no field could be prepared.
     */
    function buildUpdateSectionHTML(prepared, restore, sectionNumber) {
        if (!prepared.length) return '';
        var h = [];
        h.push('<section class="nsq-card"><h2 class="nsq-h2"><span class="nsq-num">' + sectionNumber + '</span>Update the opportunity</h2>');
        h.push('<div class="nsq-upd-grid">');
        prepared.slice().sort(function (a, b) {
            return OPP_UPDATE_DISPLAY_ORDER.indexOf(a.def.key) - OPP_UPDATE_DISPLAY_ORDER.indexOf(b.def.key);
        }).forEach(function (p) {
            h.push(buildUpdateFieldHTML(p, restore));
        });
        h.push('</div>');
        h.push('<input type="hidden" name="' + OPP_UPDATE_KEYS_FIELD + '" value="' +
            escapeHtml(prepared.map(function (p) { return p.def.key; }).join(',')) + '">');
        h.push('</section>');
        return h.join('');
    }

    // ─── Text and page CSS (moved unchanged from Send Quote 2.0.4) ────────────────

    var PAGE_COLORS = {
        page:   '#f4f2ef',
        card:   '#ffffff',
        border: '#e2ded9',
        text:   '#2b2a2e',
        muted:  '#5f5b66',
        accent: '#59315f',
        send:   '#ffb500'
    };

    function stripTags(str) {
        return String(str || '').replace(/<[^>]*>/g, '').replace(/\s+/g, ' ').trim();
    }

    /**
     * v2.0.3: Decodes HTML entities — &amp; &lt; &gt; &quot; &#39; &apos; &nbsp; and numeric
     * &#nnn; / &#xhh;. Single pass. ⚠️ Call BEFORE stripTags(), never after: decoding after
     * stripping would turn "&lt;script&gt;" into a live tag.
     */
    function decodeEntities(str) {
        var named = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ' };
        return String(str || '').replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, function (m, e) {
            var code;
            if (e.charAt(0) === '#') {
                code = (e.charAt(1) === 'x' || e.charAt(1) === 'X') ? parseInt(e.substring(2), 16) : parseInt(e.substring(1), 10);
                return (code > 0 && code <= 0x10FFFF) ? String.fromCodePoint(code) : m;
            }
            var k = e.toLowerCase();
            return Object.prototype.hasOwnProperty.call(named, k) ? named[k] : m;
        });
    }

    /**
     * v2.0.3: Card text — decode, then strip tags, then collapse whitespace. The caller escapes
     * the result exactly once with escapeHtml().
     */
    function cleanCardText(str) {
        return stripTags(decodeEntities(str));
    }

    /**
     * Basic HTML escaping to prevent XSS.
     */
    function escapeHtml(str) {
        if (!str) return '';
        return String(str)
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#039;');
    }

    /**
     * One update field: a plain <select> / text <input> named as the 1.8.0 parameters, plus
     * its hidden originals. Originals are also data- attributes for the "Changed" marker.
     */
    function buildUpdateFieldHTML(p, restore) {
        var def = p.def;
        var id = updFieldId(def);
        var value = (restore && restore.upd[def.key] !== undefined) ? restore.upd[def.key] : p.orig;
        var attrs = ' name="' + id + '" id="' + id + '" class="nsq-input nsq-upd" data-key="' + def.key +
            '" data-label="' + escapeHtml(def.label) + '" data-orig="' + escapeHtml(p.orig) +
            '" data-orig-text="' + escapeHtml(p.origText) + '"' + (p.required ? ' data-required="1"' : '');
        var control;

        if (def.kind === 'select') {
            var known = p.options.some(function (o) { return String(o.value) === value; });
            if (!known && !(def.blankOption && value === '')) value = p.orig;
            var opts = [];
            if (def.blankOption) {
                opts.push('<option value=""' + (value === '' ? ' selected' : '') + '></option>');
            }
            p.options.forEach(function (o) {
                var v = String(o.value);
                opts.push('<option value="' + escapeHtml(v) + '"' + (v === value ? ' selected' : '') + '>' + escapeHtml(o.text) + '</option>');
            });
            control = '<select' + attrs + '>' + opts.join('') + '</select>';
        } else {
            // v2.0.1: native date picker — displays in the browser's locale, posts yyyy-mm-dd
            control = '<input type="date"' + attrs + ' value="' + escapeHtml(value) + '">';
        }

        return '<div class="nsq-field nsq-upd-field"><label class="nsq-label" for="' + id + '">' + escapeHtml(def.label) +
            (p.required ? ' <span class="nsq-req" aria-hidden="true">*</span>' : '') + '</label>' +
            control + '<div class="nsq-was" hidden></div>' +
            '<input type="hidden" name="' + origFieldId(def) + '" value="' + escapeHtml(p.orig) + '">' +
            '<input type="hidden" name="' + origTextFieldId(def) + '" value="' + escapeHtml(p.origText) + '">' +
            '</div>';
    }

    function baseCss() {
        var c = PAGE_COLORS;
        return '<style>' +
            '.nsq{font-size:15px;color:' + c.text + ';background:' + c.page + ';margin:0;padding:20px 16px 140px;box-sizing:border-box;font-family:inherit;}' +
            '.nsq *{box-sizing:border-box;}' +
            '.nsq-wrap{max-width:1120px;margin:0 auto;}' +
            '.nsq a{color:' + c.accent + ';}' +
            '.nsq-back{display:inline-block;margin-bottom:8px;text-decoration:none;font-size:14px;}' +
            '.nsq-h1{font-size:26px;margin:0 0 6px;font-weight:700;color:' + c.text + ';}' +
            '.nsq-meta{color:' + c.muted + ';margin-bottom:18px;display:flex;flex-wrap:wrap;align-items:center;gap:6px;}' +
            '.nsq-dot{color:' + c.border + ';}' +
            '.nsq-badge{background:#ede6ef;color:' + c.accent + ';border-radius:999px;padding:2px 10px;font-weight:600;font-size:13px;}' +
            '.nsq-alert{border-radius:10px;padding:14px 16px;margin:0 0 16px;border:1px solid;}' +
            '.nsq-alert-error{background:#fbeaea;border-color:#e3a5a5;color:#7a1d1d;}' +
            '.nsq-alert-warn{background:#fff6e0;border-color:#f0cf7a;color:#6b4d00;}' +
            '.nsq-card{background:' + c.card + ';border:1px solid ' + c.border + ';border-radius:10px;padding:20px;margin-bottom:16px;}' +
            '.nsq-h2{font-size:18px;margin:0 0 14px;display:flex;align-items:center;gap:10px;color:' + c.text + ';}' +
            '.nsq-num{display:inline-flex;width:28px;height:28px;border-radius:50%;background:' + c.accent + ';color:#fff;align-items:center;justify-content:center;font-size:14px;}' +
            '.nsq-h3{font-size:14px;text-transform:uppercase;letter-spacing:.04em;color:' + c.muted + ';margin:16px 0 8px;}' +
            '.nsq-count{background:' + c.page + ';border-radius:999px;padding:1px 8px;font-size:12px;margin-left:4px;}' +
            '.nsq-row{display:grid;grid-template-columns:auto 1fr auto auto;gap:16px;align-items:center;border:1px solid ' + c.border + ';border-radius:10px;padding:12px 14px;margin-bottom:8px;}' +
            '.nsq-row-main{border:2px solid ' + c.accent + ';padding:11px 13px;}' +
            '.nsq-seg{display:inline-flex;border:1px solid ' + c.border + ';border-radius:8px;overflow:hidden;}' +
            '.nsq-seg-btn{min-height:44px;padding:0 14px;border:0;background:#fff;color:' + c.muted + ';font-size:14px;cursor:pointer;}' +
            '.nsq-seg-btn+.nsq-seg-btn{border-left:1px solid ' + c.border + ';}' +
            '.nsq-seg-btn[aria-pressed="true"]{background:' + c.accent + ';color:#fff;font-weight:600;}' +
            '.nsq-q{min-width:0;}' +
            '.nsq-q-title{font-weight:600;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden;text-overflow:ellipsis;overflow-wrap:anywhere;}' +
            '.nsq-q-desc{color:' + c.muted + ';font-size:13px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;}' +
            '.nsq-price{text-align:right;white-space:nowrap;}' +
            '.nsq-price strong{display:block;font-size:16px;}' +
            '.nsq-exvat{display:block;color:' + c.muted + ';font-size:13px;}' +
            '.nsq-view{font-weight:600;min-width:40px;}' +
            '.nsq-to-row{display:flex;gap:16px;flex-wrap:wrap;}' +
            '.nsq-grow{flex:1 1 360px;}' +
            '.nsq-field{margin-bottom:12px;}' +
            '.nsq-label{display:block;font-weight:600;font-size:14px;margin-bottom:6px;}' +
            '.nsq-input{min-height:44px;width:100%;padding:8px 10px;border:1px solid ' + c.border + ';border-radius:8px;font-size:15px;color:' + c.text + ';background:#fff;}' +
            '.nsq-tagbox{display:flex;flex-wrap:wrap;gap:6px;align-items:center;min-height:44px;padding:6px 8px;border:1px solid ' + c.border + ';border-radius:8px;background:#fff;}' +
            '.nsq-tag{display:inline-flex;align-items:center;gap:6px;background:#ede6ef;color:' + c.accent + ';border-radius:999px;padding:4px 6px 4px 12px;font-size:14px;}' +
            '.nsq-tag-bad{background:#fbeaea;color:#7a1d1d;}' +
            '.nsq-tag button{border:0;background:transparent;cursor:pointer;font-size:16px;line-height:1;color:inherit;padding:0 4px;}' +
            '.nsq-tag-input{flex:1 1 180px;border:0;outline:0;min-height:30px;font-size:15px;}' +
            '.nsq-links{display:flex;gap:18px;margin-bottom:12px;}' +
            '.nsq-upd-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(200px,1fr));gap:16px;}' +
            '.nsq-upd-changed{border:2px solid ' + c.accent + ';}' +
            '.nsq-was{font-size:13px;color:' + c.accent + ';margin-top:4px;}' +
            '.nsq-footer{position:fixed;left:0;right:0;bottom:0;background:#fff;border-top:1px solid ' + c.border + ';box-shadow:0 -2px 8px rgba(0,0,0,.06);z-index:1000;}' +
            '.nsq-footer-in{max-width:1120px;margin:0 auto;padding:12px 16px;display:flex;gap:16px;align-items:center;justify-content:space-between;flex-wrap:wrap;}' +
            '.nsq-sum-main{font-weight:600;}' +
            '.nsq-sum-sub{color:' + c.muted + ';font-size:13px;}' +
            '.nsq-actions{display:flex;gap:10px;align-items:center;flex-wrap:wrap;}' +
            '.nsq-reason{color:' + c.muted + ';font-size:13px;}' +
            '.nsq-btn{min-height:44px;padding:0 18px;border-radius:8px;font-size:15px;font-weight:600;cursor:pointer;display:inline-flex;align-items:center;text-decoration:none;}' +
            '.nsq-btn-link{background:transparent;border:0;}' +
            '.nsq-btn-secondary{background:#fff;border:1px solid ' + c.accent + ';color:' + c.accent + ';}' +
            '.nsq-btn-primary{background:' + c.send + ';border:0;color:' + c.text + ';}' +
            '.nsq-btn[disabled]{opacity:.45;cursor:not-allowed;}' +
            '@media (max-width:900px){.nsq-row{grid-template-columns:1fr auto;}}' +
            '</style>';
    }

    /**
     * The shared part of a page's inline script (hook contract in the header). STATIC — nothing is
     * ever interpolated into it; it reads everything from data- attributes. The canonical version
     * of the update-field / changed-marker logic (Send Quote still has its own copy — see KNOWN
     * DUPLICATION in the header).
     */
    var PAGE_SCRIPT_CORE = [
        '  "use strict";',
        '  function $(id) { return document.getElementById(id); }',
        '  function each(list, fn) { Array.prototype.forEach.call(list, fn); }',
        '  var root, upd;',
        '  function fieldText(el) {',
        '    if (el.tagName === "SELECT") return el.options[el.selectedIndex] ? el.options[el.selectedIndex].text : "";',
        '    if (el.type === "date" && el.valueAsDate) return el.valueAsDate.toLocaleDateString(undefined, { timeZone: "UTC" });',
        '    return el.value.trim();',
        '  }',
        '  function guardEnter(scope) {',
        '    each(scope.querySelectorAll("input[type=text], input[type=date]"), function (el) {',
        '      el.addEventListener("keydown", function (e) { if (e.key === "Enter") e.preventDefault(); });',
        '      el.addEventListener("input", update);',
        '    });',
        '  }',
        '  function updChanges() {',
        '    var changes = [];',
        '    each(upd, function (el) {',
        '      var wrap = el.parentNode, was = wrap.querySelector(".nsq-was");',
        '      var v = el.value.trim(), orig = el.getAttribute("data-orig");',
        '      var origText = el.getAttribute("data-orig-text") || "blank";',
        '      if (v !== orig && v !== "") {',
        '        el.classList.add("nsq-upd-changed"); was.hidden = false; was.textContent = "Changed · was " + origText;',
        '        changes.push(el.getAttribute("data-label") + " → " + fieldText(el));',
        '      } else if (v === "" && orig !== "") {',
        '        el.classList.remove("nsq-upd-changed"); was.hidden = false; was.textContent = "Blank is not saved · stays " + origText;',
        '      } else {',
        '        el.classList.remove("nsq-upd-changed"); was.hidden = true; was.textContent = "";',
        '      }',
        '    });',
        '    return changes;',
        '  }',
        '  function requiredProblem() {',
        '    var missing = [];',
        '    each(upd, function (el) {',
        '      if (el.getAttribute("data-required") === "1" && el.value.trim() === "" && el.getAttribute("data-orig") === "") missing.push(el.getAttribute("data-label"));',
        '    });',
        '    return missing.length ? "Set " + missing.join(", ") + "." : "";',
        '  }',
        '  function update() {',
        '    if (!root) return;',
        '    var changes = updChanges();',
        '    $("nsq-sum-line").textContent = summary();',
        '    $("nsq-sum-changes").textContent = changes.join(" · ");',
        '    var p = problem() || requiredProblem();',
        '    $("nsq-send").disabled = !!p;',
        '    $("nsq-reason").textContent = p;',
        '  }',
        '  function formEl() { return document.getElementById("main_form") || root.closest("form"); }',
        '  function submitForm(busyText) {',
        '    var p = problem() || requiredProblem(); if (p) { $("nsq-reason").textContent = p; return; }',
        '    var form = formEl();',
        '    if (!form) { $("nsq-reason").textContent = "Could not find the page form. Please reload and try again."; return; }',
        '    beforeSubmit();',
        '    $("nsq-send").disabled = true; $("nsq-send").textContent = busyText;',
        '    HTMLFormElement.prototype.submit.call(form);',
        '  }',
        '  function init() {',
        '    root = $("nsq-root");',
        '    if (!root || !$("nsq-send")) return;',
        '    upd = root.querySelectorAll(".nsq-upd");',
        '    each(upd, function (el) { el.addEventListener("change", update); el.addEventListener("input", update); });',
        '    guardEnter(root);',
        '    pageInit(root);',
        '    update();',
        '  }'
    ].join('\n') + '\n';

    /**
     * Assembles a page's inline script from constants only: '(function(){' + CORE + pagePart +
     * DOM-ready init + '})();'. pagePart must be a constant string.
     */
    function pageScript(pagePart) {
        return '(function(){\n' + PAGE_SCRIPT_CORE + pagePart +
            '\n  if (document.readyState === "loading") { document.addEventListener("DOMContentLoaded", init); } else { init(); }\n})();';
    }

    /**
     * Shows a fatal error page (no Opportunity, record not loadable, unhandled error).
     */
    function showErrorPage(context, message, title) {
        var form = serverWidget.createForm({ title: title || 'Error' });

        var errorField = form.addField({ id: 'custpage_error', type: serverWidget.FieldType.INLINEHTML, label: ' ' });
        errorField.defaultValue = baseCss() +
            '<div class="nsq"><div class="nsq-wrap">' +
            '<div class="nsq-alert nsq-alert-error" role="alert"><strong>Error.</strong> ' + escapeHtml(message) + '</div>' +
            '<p>Please try again or contact your administrator if the problem persists. ' +
            '<a href="javascript:history.back()">Go back</a></p>' +
            '</div></div>';

        context.response.writePage(form);
    }

    // ─── Email (v1.1.0: moved from Send Quote SL 2.3.0, unchanged bytes) ──────────
    //
    // The branded email column (Send Quote 2.2.0 design) as a shell with slots, so Send Quote's
    // proposal email and Update Opportunity's bespoke email share one layout. Pitfall 25: Outlook
    // fallbacks are [if mso] pairs, never display:none wrappers (the preheader span excepted); the
    // container carries width="600" as an attribute.
    //
    // ⚠️ NO MERGE-TAG SUBSTITUTION HAPPENS HERE. Every slot is HTML the caller has already escaped.
    //    Send Quote runs its own one-pass {{KEY}} substitution over the template it assembles (which
    //    contains no user-typed text); Update Opportunity never runs a substitution pass at all, so
    //    user text cannot be re-read as a tag (pitfall 28).

    /** Same check as Send Quote 2.0.0+: one plain address, no spaces, separators or quotes. */
    var EMAIL_RE = /^[^\s@,;<>"']+@[^\s@,;<>"']+\.[^\s@,;<>"']+$/;

    /**
     * Send Quote's address list: comma-separated only (unchanged). [] for empty/null.
     * The recipients component (Update Opportunity) splits on , and ; itself.
     */
    function parseEmails(emailStr) {
        if (!emailStr || !emailStr.trim()) return [];
        return emailStr.split(',').map(function (e) { return e.trim(); }).filter(function (e) { return e.length > 0; });
    }

    /** The addresses in a comma list that fail EMAIL_RE. */
    function invalidEmails(str) {
        return parseEmails(str).filter(function (e) { return !EMAIL_RE.test(e); });
    }

    /** loadSalesRepData()'s placeholder name when the Opportunity has no usable sales rep. */
    var GENERIC_REP_NAME = 'Your Account Manager';

    var EMAIL_IMG = 'https://images.chamaileon.io/5b1fac592f38b800113c85ca/5ca8626420e2346b3ee9a013/';
    var EMAIL_FONT = 'font-family:Calibri, Arial, sans-serif;';
    var EMAIL_FACE = 'Calibri, Arial, sans-serif';
    var SOCIAL_LINKS = [
        ['https://www.facebook.com/nuheatuk/',                   '1604502171665_white%20-%20facebook.png'],
        ['https://www.instagram.com/nuheatufh/',                 '1604502172039_white%20-%20instagram.png'],
        ['https://www.linkedin.com/company/nu-heat/',            '1604502171857_white%20-%20linkedin.png'],
        ['https://twitter.com/nuheatuk',                         '1604502172417_white%20-%20twitter.png'],
        ['https://youtube.com/channel/UCsfB8s56fcERuaBFovwYnGQ', '1604502172308_white%20-%20youtube.png']
    ];

    /** A lookupFields value as text: plain values as-is, select/document values as their first entry. */
    function lookupText(v) {
        if (Array.isArray(v)) return v.length ? String(v[0].text || v[0].value || '') : '';
        return v == null ? '' : String(v);
    }

    /** The first name for the contact buttons: firstname, else the first word of the name, else ''. */
    function resolveFirstName(firstname, fullName) {
        var first = lookupText(firstname).trim();
        if (first) return first;
        var name = String(fullName || '').trim();
        if (!name || name === GENERIC_REP_NAME) return '';
        return name.split(/\s+/)[0];
    }

    /** The photo URL if it is usable in an email (absolute https, no spaces/quotes/angle brackets). */
    function checkPhotoUrl(value) {
        var s = lookupText(value).trim();
        if (!s) return { url: '', reason: 'custentity_employee_photo_link is empty' };
        if (!/^https:\/\//i.test(s)) return { url: '', reason: 'not an https:// URL' };
        if (/[\s"'<>]/.test(s)) return { url: '', reason: 'URL contains spaces, quotes or angle brackets' };
        return { url: s, reason: '' };
    }

    /**
     * A bulletproof button: one [if !mso] / [if mso] pair, never a display:none wrapper. Colour is
     * carried by bgcolor and <font color>, padding by cellpadding, so it survives stripped styles.
     * href and label must already be escaped.
     */
    function emailButton(href, label) {
        var bg = '#ffb500', fg = '#3e3b39';
        var text = EMAIL_FONT + 'font-size:18px;line-height:22px;font-weight:bold;color:' + fg + ';text-decoration:none;';
        return '' +
            '<!--[if !mso]><!-- -->\n' +
            '<table role="presentation" class="btn-full" align="center" cellpadding="14" cellspacing="0" border="0" bgcolor="' + bg + '" style="background-color:' + bg + ';border-radius:5px;border-collapse:separate;">\n' +
            '<tr><td align="center" valign="middle" bgcolor="' + bg + '" style="padding:0;border-radius:5px;"><a href="' + href + '" target="_blank" style="display:block;padding:15px 28px;' + text + '"><font face="' + EMAIL_FACE + '" color="' + fg + '"><b>' + label + '</b></font></a></td></tr>\n' +
            '</table>\n' +
            '<!--<![endif]-->\n' +
            '<!--[if mso]>\n' +
            '<table role="presentation" align="center" cellpadding="0" cellspacing="0" border="0" bgcolor="' + bg + '">\n' +
            '<tr><td align="center" valign="middle" bgcolor="' + bg + '" style="padding:15px 28px;"><a href="' + href + '" target="_blank" style="' + text + '"><font face="Arial, sans-serif" color="' + fg + '"><b>' + label + '</b></font></a></td></tr>\n' +
            '</table>\n' +
            '<![endif]-->\n';
    }

    /**
     * The contact card (Send Quote 2.2.0's Account Manager card) with a label slot.
     *
     * Every rep value is HTML the caller has ALREADY escaped (Send Quote passes its {{…}} tags):
     *   name, phone, email — card text (phone '' = email alone; Send Quote always has one);  photo — img src ('' = no photo row);
     *   tel — digits for the tel: button ('' = no CALL button);  mailto — address for the EMAIL
     *   button ('' = none);  firstUpper — upper-cased first name ('' = CLICK TO CALL / SEND AN EMAIL).
     * label — the card's small heading, escaped.
     */
    function emailRepCard(rep, label) {
        var callLabel  = rep.firstUpper ? 'CALL ' + rep.firstUpper : 'CLICK TO CALL';
        var emailLabel = rep.firstUpper ? 'EMAIL ' + rep.firstUpper : 'SEND AN EMAIL';
        var contactButtons = [];
        if (rep.tel) contactButtons.push(emailButton('tel:' + rep.tel, callLabel));
        if (rep.mailto) contactButtons.push(emailButton('mailto:' + rep.mailto, emailLabel));
        return '' +
            '<table role="presentation" class="main-card" width="440" align="center" cellpadding="0" cellspacing="0" border="0" bgcolor="#f6f2f7" style="width:100%;max-width:440px;background-color:#f6f2f7;border-radius:8px;">\n' +
            (rep.photo
                ? '<tr><td align="center" valign="top" style="padding:24px 20px 0 20px;"><img src="' + rep.photo + '" width="96" height="96" alt="' + rep.name + '" border="0" style="display:block;margin:0 auto;width:96px;height:96px;border-radius:48px;object-fit:cover;"></td></tr>\n'
                : '') +
            '<tr><td align="center" valign="top" style="padding:' + (rep.photo ? '14px' : '24px') + ' 20px 0 20px;">\n' +
            '<p style="margin:0 0 4px 0;' + EMAIL_FONT + 'font-size:13px;line-height:16px;letter-spacing:2px;color:#59315f;"><font face="' + EMAIL_FACE + '" color="#59315f"><b>' + label + '</b></font></p>\n' +
            '<p style="margin:0 0 6px 0;' + EMAIL_FONT + 'font-size:24px;line-height:28px;font-weight:bold;color:#000000;"><font face="' + EMAIL_FACE + '" color="#000000"><b>' + rep.name + '</b></font></p>\n' +
            '<p style="margin:0;' + EMAIL_FONT + 'font-size:17px;line-height:23px;color:#131313;"><font face="' + EMAIL_FACE + '" color="#131313">' + (rep.phone ? '<span class="cl-line">' + rep.phone + '</span><span class="cl-sep"> · </span>' : '') + '<span class="cl-line">' + rep.email + '</span></font></p>\n' +
            '</td></tr>\n' +
            '<tr><td align="center" valign="top" style="padding:16px 14px 20px 14px;">\n' +
            '<table role="presentation" width="100%" align="center" cellpadding="0" cellspacing="0" border="0">\n' +
            '<tr>\n' +
            contactButtons.map(function (b) {
                return '<td class="stack" width="' + (contactButtons.length === 2 ? '50%' : '100%') + '" align="center" valign="top" style="padding:6px;">\n' + b + '</td>\n';
            }).join('') +
            '</tr>\n' +
            '</table>\n' +
            '</td></tr>\n' +
            '</table>\n';
    }

    /**
     * The branded email column (Send Quote 2.2.0 design) with slots. Every slot is HTML the caller
     * has already escaped; nothing is substituted here.
     *
     * @param {Object} s
     * @param {string} s.title        - <title> text
     * @param {string} s.preheader    - hidden preview text (the one allowed display:none span)
     * @param {string} s.headerLabel  - small capitals line in the purple header
     * @param {string} s.headerH1     - the headline
     * @param {string} [s.headerSub]  - optional line under the headline ('' / absent = none)
     * @param {string} s.rows         - body rows (<tr>…</tr>) between the header and the card
     * @param {Object} [s.card]       - { intro: HTML above the card, html: emailRepCard() } or null
     * @param {string} s.footerLine   - the small line under the green footer
     * @returns {string} the complete HTML document
     */
    function emailShell(s) {
        var social = SOCIAL_LINKS.map(function (sl) {
            return '<td align="center" valign="middle" width="42" style="padding:0 10px;"><a href="' + sl[0] + '" target="_blank"><img src="' + EMAIL_IMG + sl[1] + '" width="22" height="22" alt="" border="0" style="display:block;width:22px;height:22px;"></a></td>\n';
        }).join('');

        return '' +
            '<!DOCTYPE html>\n' +
            '<html lang="en" xmlns="http://www.w3.org/1999/xhtml" xmlns:v="urn:schemas-microsoft-com:vml" xmlns:o="urn:schemas-microsoft-com:office:office">\n' +
            '<head>\n' +
            '<meta http-equiv="Content-Type" content="text/html; charset=utf-8">\n' +
            '<meta name="viewport" content="width=device-width, initial-scale=1.0">\n' +
            '<meta http-equiv="X-UA-Compatible" content="IE=edge">\n' +
            '<meta name="x-apple-disable-message-reformatting">\n' +
            '<meta name="format-detection" content="telephone=no">\n' +
            '<title>' + s.title + '</title>\n' +
            '<link href="https://www.nu-heat.co.uk/wp-content/themes/nu-heat/assets/fonts/calibri/calibri-font.css" rel="stylesheet" type="text/css">\n' +
            '<!--[if gte mso 16]>\n' +
            '<xml><o:OfficeDocumentSettings><o:AllowPNG/><o:PixelsPerInch>96</o:PixelsPerInch></o:OfficeDocumentSettings></xml>\n' +
            '<![endif]-->\n' +
            '<style>\n' +
            'body { margin:0; padding:0; -ms-text-size-adjust:100%; -webkit-text-size-adjust:100%; }\n' +
            'table { border-spacing:0; mso-table-lspace:0pt; mso-table-rspace:0pt; }\n' +
            'td { border-collapse:collapse; }\n' +
            'img { -ms-interpolation-mode:bicubic; border:0; outline:none; text-decoration:none; }\n' +
            'a[x-apple-data-detectors=true] { color:inherit !important; text-decoration:inherit !important; }\n' +
            '@media all and (max-width: 599px) {\n' +
            '.main-container { width:100% !important; }\n' +
            '.fluid { width:100% !important; height:auto !important; }\n' +
            '.stack { display:block !important; width:100% !important; box-sizing:border-box; }\n' +
            '.btn-full { width:100% !important; }\n' +
            '.cl-sep { display:none !important; }\n' +
            '.cl-line { display:block !important; }\n' +
            '.h1 { font-size:30px !important; line-height:34px !important; }\n' +
            '}\n' +
            '</style>\n' +
            '<!--[if mso]>\n' +
            '<style>h1, h2, p, td, a, span, font { font-family:Arial, sans-serif !important; }</style>\n' +
            '<![endif]-->\n' +
            '</head>\n' +
            '<body id="body" bgcolor="#ffffff" style="margin:0;padding:0;background-color:#ffffff;">\n' +
            '<span style="display:none;font-size:0px;line-height:0px;max-height:0px;max-width:0px;opacity:0;overflow:hidden;">' + s.preheader + '</span>\n' +
            '<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" bgcolor="#ffffff" style="background-color:#ffffff;">\n' +
            '<tr><td align="center" valign="top">\n' +
            '<!--[if mso]><table role="presentation" width="600" align="center" cellpadding="0" cellspacing="0" border="0"><tr><td align="center" valign="top"><![endif]-->\n' +
            '<table role="presentation" class="width600 main-container" width="600" align="center" cellpadding="0" cellspacing="0" border="0" style="width:100%;max-width:600px;">\n' +

            // Logo
            '<tr><td align="center" valign="top" style="padding:20px 10px;">\n' +
            '<img src="' + EMAIL_IMG + '1698400306920_Nu-Heat%20Master%20logo%20green%20-%20transparent%20v3.png" width="170" height="73" alt="Nu-Heat Underfloor Heating &amp; Renewables" border="0" style="display:block;margin:0 auto;width:170px;height:auto;max-width:100%;">\n' +
            '</td></tr>\n' +

            // Purple header
            '<tr><td align="center" valign="top" bgcolor="#59315f" style="background-color:#59315f;padding:28px 24px;">\n' +
            '<p style="margin:0 0 10px 0;' + EMAIL_FONT + 'font-size:13px;line-height:16px;letter-spacing:2px;color:#ffffff;"><font face="' + EMAIL_FACE + '" color="#ffffff"><b>' + s.headerLabel + '</b></font></p>\n' +
            '<h1 class="h1" style="margin:0 0 12px 0;' + EMAIL_FONT + 'font-size:38px;line-height:42px;font-weight:bold;color:#ffffff;"><font face="' + EMAIL_FACE + '" color="#ffffff">' + s.headerH1 + '</font></h1>\n' +
            (s.headerSub
                ? '<p style="margin:0;' + EMAIL_FONT + 'font-size:20px;line-height:25px;color:#ffffff;word-break:break-word;"><font face="' + EMAIL_FACE + '" color="#ffffff">' + s.headerSub + '</font></p>\n'
                : '') +
            '</td></tr>\n' +

            // Body rows (the caller's)
            s.rows +

            // Contact card
            (s.card
                ? '<tr><td align="center" valign="top" style="padding:28px 20px 32px 20px;">\n' + (s.card.intro || '') + s.card.html + '</td></tr>\n'
                : '') +

            // Footer (logo and social links) and the reason line
            '<tr><td align="center" valign="top" bgcolor="#00857d" style="background-color:#00857d;padding:10px 10px 24px 10px;">\n' +
            '<img src="' + EMAIL_IMG + '1604422010305_Nu-Heat%20Master%20logo%20wht%20on%20green.png" width="167" height="94" alt="Nu-Heat Underfloor Heating &amp; Renewables" border="0" style="display:block;margin:0 auto 10px auto;width:167px;height:auto;">\n' +
            '<table role="presentation" align="center" cellpadding="0" cellspacing="0" border="0">\n' +
            '<tr>\n' + social + '</tr>\n' +
            '</table>\n' +
            '</td></tr>\n' +
            '<tr><td align="center" valign="top" style="padding:16px 20px 24px 20px;">\n' +
            '<p style="margin:0;' + EMAIL_FONT + 'font-size:13px;line-height:17px;color:#6b6b6b;"><font face="' + EMAIL_FACE + '" color="#6b6b6b">' + s.footerLine + '</font></p>\n' +
            '</td></tr>\n' +

            '</table>\n' +
            '<!--[if mso]></td></tr></table><![endif]-->\n' +
            '</td></tr>\n' +
            '</table>\n' +
            '</body>\n' +
            '</html>\n';
    }

    /**
     * Sends one email and logs it against the customer and the Opportunity (Communication ›
     * Messages). Never throws.
     *
     * @param {Object} o - { author, to: [], cc: [], bcc: [], subject, body, customerId, oppId, logKey }
     * @returns {{ ok: boolean, count: number, error: string }} count = To + CC + BCC addresses
     */
    function sendEmail(o) {
        var to = o.to || [], cc = o.cc || [], bcc = o.bcc || [];
        var count = to.length + cc.length + bcc.length;
        var logKey = o.logKey || 'OppUpdateLib.Email';
        try {
            if (!to.length) throw new Error('No To address.');
            var params = {
                author:     o.author,
                recipients: to,
                subject:    o.subject,
                body:       o.body,
                relatedRecords: {
                    entityId:      o.customerId || undefined,
                    transactionId: o.oppId
                }
            };
            if (cc.length) params.cc = cc;
            if (bcc.length) params.bcc = bcc;
            email.send(params);
            log.audit(logKey, 'Opportunity ' + o.oppId + ' — email sent OK to ' + count + ' address' + (count === 1 ? '' : 'es'));
            return { ok: true, count: count, error: '' };
        } catch (e) {
            var msg = (e && e.message) || String(e);
            log.error(logKey, 'Opportunity ' + o.oppId + ' — email FAILED (' + count + ' address' + (count === 1 ? '' : 'es') + '): ' + msg);
            return { ok: false, count: count, error: msg };
        }
    }

    // ─── Sender (v1.1.0) ──────────────────────────────────────────────────────────

    /**
     * An employee record, for an email sent FROM them (Update Opportunity D18 / D18a) — the current
     * user, or the employee given (the Opportunity's sales rep or project engineer):
     * one search.lookupFields — firstname, lastname, entityid (name fallback), email, phone (the
     * card phone for every sender: the same employee field Send Quote's card reads via
     * loadSalesRepData — Steve, 1 Oct; no fallback, no switchboard), isinactive (amendment 3) and the
     * photo link (https only, checkPhotoUrl). No Opportunity override fields — custbody_sales_rep_phone,
     * which Send Quote reads first, is NOT read here. Never throws: error is set instead.
     * ⚠️ Send Design (NS-Design-Email) reads `officephone` for the PE — a known difference, left as is.
     *
     * @param {string} logKey - audit key (no address is ever logged)
     * @param {string} [employeeId] - the employee to read; omitted → the current user
     * @returns {{ id, firstName, fullName, email, phone, inactive, photoUrl, error }}
     */
    function loadSender(logKey, employeeId) {
        var out = { id: '', firstName: '', fullName: '', email: '', phone: '', inactive: false, photoUrl: '', error: '' };
        var photo = { url: '', reason: 'not read' };
        try {
            out.id = String(employeeId || runtime.getCurrentUser().id || '');
            var f = search.lookupFields({
                type:    search.Type.EMPLOYEE,
                id:      out.id,
                columns: ['firstname', 'lastname', 'entityid', 'email', 'phone', 'isinactive', 'custentity_employee_photo_link']
            }) || {};
            out.fullName  = (lookupText(f.firstname).trim() + ' ' + lookupText(f.lastname).trim()).trim() || lookupText(f.entityid).trim();
            out.firstName = resolveFirstName(f.firstname, out.fullName);
            out.email     = lookupText(f.email).trim();
            out.phone     = lookupText(f.phone).trim();   // the employee `phone` field (A3 — not officephone)
            // lookupFields returns a checkbox as true/false, but 'T' / 'true' also occur — all mean inactive
            out.inactive  = f.isinactive === true || f.isinactive === 'T' || f.isinactive === 'true';
            photo         = checkPhotoUrl(f.custentity_employee_photo_link);
            out.photoUrl  = photo.url;
        } catch (e) {
            out.error = (e && e.message) || String(e);
        }
        log.audit(logKey || 'OppUpdateLib.Sender', 'Sender employee ' + (out.id || 'none') +
            (out.error ? ' — lookup FAILED: ' + out.error
                : ' — email ' + (out.email ? 'present' : 'MISSING') + ', phone ' + (out.phone ? 'present' : 'missing') + (out.inactive ? ', INACTIVE' : '') +
                  (photo.url ? ', photo used' : ', photo skipped — ' + photo.reason)));
        return out;
    }

    // ─── Recipients component (v1.1.0 — Update Opportunity only) ──────────────────
    //
    // Ticks for the Opportunity's contacts that have an email (value = the contact ID), a Customer
    // tick (only if the customer has an email), "Other addresses" (, or ; separated) and "CC me".
    // The addresses shown sit in data-email attributes for the live count only; the server rebuilds
    // every address itself (resolveRecipients). Posted: custpage_rcpt_contacts (comma list of contact
    // IDs), custpage_rcpt_customer (T/F), custpage_rcpt_extra (as typed), custpage_rcpt_ccme (T/F).

    var RECIPIENTS_MAX = 10;

    /**
     * @param {Array<{id, name, email}>} contacts - lib.loadContacts()
     * @param {string} customerEmail - '' hides the Customer tick
     * @param {Object} [restore] - { contacts: [ids], customer: bool, extra: string, ccMe: bool }
     */
    function buildRecipientsHTML(contacts, customerEmail, restore) {
        var r = restore || {};
        var ticked = (r.contacts || []).map(String);
        var h = [];
        h.push('<div class="nsq-field nsq-rcpts"><span class="nsq-label">To <span class="nsq-req" aria-hidden="true">*</span></span>');
        var withEmail = (contacts || []).filter(function (c) { return c.email; });
        withEmail.forEach(function (c) {
            h.push('<label class="nsq-tick"><input type="checkbox" class="nsq-rcpt" data-contact-id="' + escapeHtml(String(c.id)) +
                '" data-email="' + escapeHtml(c.email) + '"' + (ticked.indexOf(String(c.id)) !== -1 ? ' checked' : '') + '> ' +
                escapeHtml(c.name) + ' <span class="nsq-tick-addr">' + escapeHtml(c.email) + '</span></label>');
        });
        if (customerEmail) {
            h.push('<label class="nsq-tick"><input type="checkbox" class="nsq-rcpt" data-customer="1" data-email="' + escapeHtml(customerEmail) + '"' +
                (r.customer ? ' checked' : '') + '> Customer <span class="nsq-tick-addr">' + escapeHtml(customerEmail) + '</span></label>');
        }
        if (!withEmail.length && !customerEmail) {
            h.push('<p class="nsq-help">No contact on this opportunity has an email address. Add one under Other addresses.</p>');
        }
        h.push('</div>');
        h.push('<div class="nsq-field"><label class="nsq-label" for="nsq-rcpt-extra">Other addresses</label>' +
            '<input type="text" class="nsq-input" id="nsq-rcpt-extra" name="custpage_rcpt_extra" autocomplete="off" placeholder="Separate addresses with commas" value="' +
            escapeHtml(r.extra || '') + '"></div>');
        h.push('<label class="nsq-tick"><input type="checkbox" id="nsq-rcpt-ccme"' + (r.ccMe ? ' checked' : '') + '> CC me</label>');
        h.push('<input type="hidden" name="custpage_rcpt_contacts" id="nsq-rcpt-contacts" value="' + escapeHtml(ticked.join(',')) + '">');
        h.push('<input type="hidden" name="custpage_rcpt_customer" id="nsq-rcpt-customer" value="' + (r.customer ? 'T' : 'F') + '">');
        h.push('<input type="hidden" name="custpage_rcpt_ccme" id="nsq-rcpt-ccme-val" value="' + (r.ccMe ? 'T' : 'F') + '">');
        return h.join('');
    }

    /**
     * The recipients' part of a page script — a CONSTANT (no data). Uses the core's $, each, root
     * and update. A page calls recipientsInit() from pageInit, recipientsProblem() from problem(),
     * recipients().to.length for its summary and recipientsBeforeSubmit() from beforeSubmit().
     */
    var RECIPIENTS_SCRIPT = [
        '  var RCPT_RE = /^[^\\s@,;<>"\']+@[^\\s@,;<>"\']+\\.[^\\s@,;<>"\']+$/;',
        '  var RCPT_MAX = ' + RECIPIENTS_MAX + ';',
        '  function rcptSplit(v) { return String(v || "").split(/[,;]/).map(function (s) { return s.trim(); }).filter(Boolean); }',
        '  function recipients() {',
        '    var to = [], seen = {}, bad = [];',
        '    function add(a) { var k = a.toLowerCase(); if (!seen[k]) { seen[k] = true; to.push(a); } }',
        '    each(root.querySelectorAll(".nsq-rcpt"), function (c) { if (c.checked && c.getAttribute("data-email")) add(c.getAttribute("data-email")); });',
        '    var extra = $("nsq-rcpt-extra");',
        '    if (extra) rcptSplit(extra.value).forEach(function (a) { if (RCPT_RE.test(a)) add(a); else bad.push(a); });',
        '    return { to: to, bad: bad };',
        '  }',
        '  function recipientsProblem() {',
        '    var r = recipients();',
        '    if (r.bad.length) return "Check the other addresses.";',
        '    if (!r.to.length) return "Choose at least one recipient.";',
        '    if (r.to.length > RCPT_MAX) return "Send to " + RCPT_MAX + " addresses or fewer.";',
        '    return "";',
        '  }',
        '  function recipientsInit() {',
        '    each(root.querySelectorAll(".nsq-rcpt"), function (c) { c.addEventListener("change", update); });',
        '    var me = $("nsq-rcpt-ccme"); if (me) me.addEventListener("change", update);',
        '  }',
        '  function recipientsBeforeSubmit() {',
        '    var ids = [], cust = "F";',
        '    each(root.querySelectorAll(".nsq-rcpt"), function (c) {',
        '      if (!c.checked) return;',
        '      if (c.getAttribute("data-customer") === "1") cust = "T"; else ids.push(c.getAttribute("data-contact-id"));',
        '    });',
        '    $("nsq-rcpt-contacts").value = ids.join(",");',
        '    $("nsq-rcpt-customer").value = cust;',
        '    $("nsq-rcpt-ccme-val").value = $("nsq-rcpt-ccme").checked ? "T" : "F";',
        '  }'
    ].join('\n') + '\n';

    /** What the page posted for the recipients — for restoring the page after a failed save. */
    function readPostedRecipients(params) {
        params = params || {};
        return {
            contacts: String(params.custpage_rcpt_contacts || '').split(',').map(function (v) { return v.trim(); }).filter(function (v) { return v; }),
            customer: params.custpage_rcpt_customer === 'T',
            extra:    String(params.custpage_rcpt_extra || ''),
            ccMe:     params.custpage_rcpt_ccme === 'T'
        };
    }

    /**
     * Rebuilds the To list on the server (D20): ticked contact IDs must be among `contacts` and have
     * an email; the customer's email comes from the caller's lookup; only the extras are taken as
     * typed (EMAIL_RE). De-duplicated case-insensitively, first occurrence kept. 1 to 10 addresses.
     *
     * @param {Object} params - request.parameters
     * @param {Array<{id, name, email}>} contacts - lib.loadContacts() for this Opportunity
     * @param {string} customerEmail - the customer's email from a lookup ('' = none)
     * @returns {{ error: string, to: string[], ccMe: boolean }}
     */
    function resolveRecipients(params, contacts, customerEmail) {
        var posted = readPostedRecipients(params);
        var out = { error: '', to: [], ccMe: posted.ccMe };
        var seen = {};
        function add(a) {
            var k = a.toLowerCase();
            if (!seen[k]) { seen[k] = true; out.to.push(a); }
        }
        var byId = {};
        (contacts || []).forEach(function (c) { byId[String(c.id)] = c; });
        for (var i = 0; i < posted.contacts.length; i++) {
            var c = /^\d{1,12}$/.test(posted.contacts[i]) ? byId[posted.contacts[i]] : null;
            if (!c) { out.error = 'A chosen contact is not on this opportunity.'; return out; }
            if (!c.email || !EMAIL_RE.test(String(c.email).trim())) { out.error = 'A chosen contact has no valid email address.'; return out; }
            add(String(c.email).trim());
        }
        if (posted.customer) {
            var ce = String(customerEmail || '').trim();
            if (!ce || !EMAIL_RE.test(ce)) { out.error = 'The customer has no valid email address.'; return out; }
            add(ce);
        }
        var extras = posted.extra.split(/[,;]/).map(function (a) { return a.trim(); }).filter(function (a) { return a; });
        var bad = extras.filter(function (a) { return !EMAIL_RE.test(a); });
        if (bad.length) { out.error = 'These addresses are not valid: ' + bad.join(', '); return out; }
        extras.forEach(add);
        if (!out.to.length) { out.error = 'Choose at least one recipient.'; return out; }
        if (out.to.length > RECIPIENTS_MAX) { out.error = 'Send to ' + RECIPIENTS_MAX + ' addresses or fewer (' + out.to.length + ' chosen).'; return out; }
        return out;
    }

    return {
        LIB_VERSION:            LIB_VERSION,
        FIELDS:                 OPP_UPDATE_FIELDS,
        DISPLAY_ORDER:          OPP_UPDATE_DISPLAY_ORDER,
        KEYS_FIELD:             OPP_UPDATE_KEYS_FIELD,
        PAGE_COLORS:            PAGE_COLORS,
        PAGE_SCRIPT_CORE:       PAGE_SCRIPT_CORE,
        updFieldId:             updFieldId,
        origFieldId:            origFieldId,
        origTextFieldId:        origTextFieldId,
        fieldDef:               fieldDef,
        loadOppPageBase:        loadOppPageBase,
        loadContacts:           loadContacts,
        resolveOppUrl:          resolveOppUrl,
        prepareFields:          prepareFields,
        validateRequired:       validateRequired,
        updateFields:           updateFields,
        readPostedUpdateValues: readPostedUpdateValues,
        fieldRedirectParams:    fieldRedirectParams,
        pad2:                   pad2,
        toIsoDate:              toIsoDate,
        parseIsoDate:           parseIsoDate,
        escapeHtml:             escapeHtml,
        decodeEntities:         decodeEntities,
        stripTags:              stripTags,
        cleanText:              cleanCardText,
        cleanCardText:          cleanCardText,
        baseCss:                baseCss,
        buildHeaderHTML:        buildHeaderHTML,
        buildErrorAlertHTML:    buildErrorAlertHTML,
        buildUpdateFieldHTML:   buildUpdateFieldHTML,
        buildUpdateSectionHTML: buildUpdateSectionHTML,
        pageScript:             pageScript,
        showErrorPage:          showErrorPage,
        // v1.1.0: email
        EMAIL_RE:               EMAIL_RE,
        parseEmails:            parseEmails,
        invalidEmails:          invalidEmails,
        GENERIC_REP_NAME:       GENERIC_REP_NAME,
        EMAIL_IMG:              EMAIL_IMG,
        EMAIL_FONT:             EMAIL_FONT,
        EMAIL_FACE:             EMAIL_FACE,
        SOCIAL_LINKS:           SOCIAL_LINKS,
        lookupText:             lookupText,
        resolveFirstName:       resolveFirstName,
        checkPhotoUrl:          checkPhotoUrl,
        emailButton:            emailButton,
        emailRepCard:           emailRepCard,
        emailShell:             emailShell,
        sendEmail:              sendEmail,
        loadSender:             loadSender,
        pendingChanges:         pendingChanges,
        RECIPIENTS_MAX:         RECIPIENTS_MAX,
        RECIPIENTS_SCRIPT:      RECIPIENTS_SCRIPT,
        buildRecipientsHTML:    buildRecipientsHTML,
        readPostedRecipients:   readPostedRecipients,
        resolveRecipients:      resolveRecipients,
        // v1.2.0: customer-safe server functions (external consumer: the customer dashboard)
        fieldOptions:           fieldOptions,
        writeOppUpdate:         writeOppUpdate,
        createObjections:       createObjections,
        OBJECTION_FIELDS:       OBJ,
        objectionNotes:         objectionNotes
    };

});
