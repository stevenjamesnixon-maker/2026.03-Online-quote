/**
 * @NApiVersion 2.1
 * @NModuleScope Public
 *
 * @name        Nu-Heat Opportunity Update Library
 * @description Shared by the "update the opportunity" pages — Send Quote (nuheat_send_quote_sl.js)
 *              and Update Opportunity (nuheat_update_opp_sl.js): field rules, preparing and writing
 *              the Opportunity fields, the required-field gate, redirect codes, text cleaning, and
 *              the page building blocks (CSS, header, update section, error page, page-script core).
 * @version     1.0.0
 * @author      Nu-Heat Development
 *
 * ⚠️ DEPLOYMENT: a shared AMD module — no script record, no deployment. Upload it to
 *    SuiteScripts/NuHeat/2026 Quote/ BEFORE either Suitelet is redeployed; both define() it as
 *    './nuheat_opp_update_lib' and fail at load time without it.
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

define(['N/ui/serverWidget', 'N/search', 'N/record', 'N/log', 'N/url', 'N/format'],
function (serverWidget, search, record, log, url, format) {

    'use strict';

    var LIB_VERSION = '1.0.0';

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
            params = params || {};
            var shownKeys = String(params[OPP_UPDATE_KEYS_FIELD] || '').split(',').filter(function (k) { return k; });

            OPP_UPDATE_FIELDS.forEach(function (def) {
                if (shownKeys.indexOf(def.key) === -1) return;

                var submitted = String(params[updFieldId(def)] || '').trim();
                var orig      = String(params[origFieldId(def)] || '').trim();
                var origText  = String(params[origTextFieldId(def)] || '').trim();

                if (!submitted) return;   // a blank never clears data

                if (def.kind === 'select') {
                    if (submitted === orig) return;
                    values[def.fieldId] = submitted;
                    result.changed.push({ key: def.key, label: def.label, fieldId: def.fieldId, from: origText || orig, to: submitted });
                    logParts.push(def.fieldId + ': ' + (orig || '(blank)') + ' → ' + submitted);
                } else {
                    // v2.0.1: yyyy-mm-dd from the date picker; compared as strings
                    var newDate = parseIsoDate(submitted);
                    if (!newDate) {
                        log.audit(logKey, 'Opportunity ' + opportunityId + ' — ' + def.fieldId +
                            ' value "' + submitted + '" is not a yyyy-mm-dd calendar date; not written');
                        return;
                    }
                    if (submitted === orig) return;
                    values[def.fieldId] = newDate;
                    result.changed.push({ key: def.key, label: def.label, fieldId: def.fieldId, from: origText || orig, to: submitted });
                    logParts.push(def.fieldId + ': ' + (orig || '(blank)') + ' → ' + submitted);
                }
            });

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
        showErrorPage:          showErrorPage
    };

});
