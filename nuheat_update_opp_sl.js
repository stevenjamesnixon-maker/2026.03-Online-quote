/**
 * @NApiVersion 2.1
 * @NScriptType Suitelet
 * @NModuleScope SameAccount
 *
 * @name        Nu-Heat Update Opportunity Suitelet
 * @description "Update opportunity" page, opened from the Opportunity (VIEW) button: 1 Log the call →
 *              2 Update the opportunity → 3 Log any objections. Saves a completed Phone Call, one
 *              Customer Objection per ticked type, then the Opportunity fields LAST, and returns to the
 *              Opportunity with the result banner (nuheat_opportunity_ue.js, nsqs=upd).
 * @version     1.0.0
 * @author      Nu-Heat Development
 *
 * Script ID:      customscript_nuheat_update_opp_sl
 * Deployment ID:  customdeploy_nuheat_update_opp_sl
 *
 * ⚠️ DEPLOYMENT: nuheat_opp_update_lib.js must be uploaded to SuiteScripts/NuHeat/2026 Quote/ BEFORE
 *    this script, or it fails at load time.
 *
 * DECISIONS (see AI_AGENT_CONTEXT — do not reverse without Steve):
 *   - Never touches forecast flags (includeinforecast) and never writes custbody_opportunity_sub_status.
 *   - Validate everything BEFORE any write. If the phone call fails, stop: nothing else is written and
 *     the page re-renders ("Nothing was saved"). Objection and field failures do not stop later steps;
 *     they give an amber banner.
 *   - Save order: phone call → objections → Opportunity fields LAST (the 2.0.1 rule).
 *   - Next contact is required: the Opportunity must END UP with one — checked on the client and on
 *     the server against the record (lib.validateRequired), never against posted originals.
 *   - Objection notes: "<per-objection note>\n\nCall notes (<call date>): <call notes>", or just the
 *     "Call notes (…): …" line. Raised on = the call date.
 *   - Lists and records are read at runtime by script ID — no internal IDs in code. Call Titles and
 *     Objection Types display in internal-ID order (types grouped by group internal ID).
 *   - The call date may not be in the future. The page takes "today" from the BROWSER (the server
 *     runs on NetSuite's own clock and can be a day behind a UK user in the morning); the server
 *     accepts up to its own today + 1 day.
 *   - Redirect parameters are codes only (nsqs=upd, nsq, nsqt, nsqf/nsqff, nsqc, nsqo, nsqof).
 */

define([
    'N/ui/serverWidget',
    'N/search',
    'N/record',
    'N/log',
    'N/redirect',
    'N/runtime',
    'N/format',
    './nuheat_opp_update_lib'
], function (serverWidget, search, record, log, redirect, runtime, format, lib) {

    'use strict';

    var SCRIPT_VERSION = '1.0.0';

    /** Page rules for the shared update fields: Next contact must end up set. */
    var RULES = { required: ['next_contact'], logKey: 'UpdateOppSL.OppUpdate' };

    // ─── Account objects (script IDs only) ────────────────────────────────────────

    var CALL_TITLE_LIST = 'customlist_nh_call_title';

    var OBJECTION_TYPE_RECORD = 'customrecord_nh_objection_type';
    var OBJECTION_TYPE_GROUP  = 'custrecord_nhot_group';

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
     * Phone Call — ⚠️ ASSUMED standard field IDs, assumed until Sandbox U3 confirms them (the call
     * must appear under the Opportunity's Communication › Activities with title, notes, date,
     * completed status, customer and the user as assigned).
     */
    var CALL = {
        title:       'title',
        message:     'message',
        startDate:   'startdate',
        status:      'status',
        completed:   'COMPLETE',
        company:     'company',
        transaction: 'transaction',
        assigned:    'assigned',
        contact:     'contact'
    };

    /** ⚠️ ASSUMED Phone Call title limit — enforced on the client and the server. */
    var CALL_TITLE_MAX = 99;
    var CALL_NOTES_MAX = 3900;
    var OBJ_NOTE_MAX   = 300;

    var escapeHtml = lib.escapeHtml;

    // ─── Entry point ──────────────────────────────────────────────────────────────

    function onRequest(context) {
        log.audit('UpdateOppSL.onRequest', 'Method: ' + context.request.method + ' | Version: ' + SCRIPT_VERSION);
        try {
            if (context.request.method === 'GET') {
                var opportunityId = context.request.parameters.opportunityId;
                if (!opportunityId) {
                    showErrorPage(context, 'No Opportunity ID provided. Please open this page from an Opportunity record.');
                    return;
                }
                renderPage(context, opportunityId, null, null);
            } else {
                handleSave(context);
            }
        } catch (e) {
            log.error('UpdateOppSL.onRequest', 'Unhandled error: ' + e.message + '\n' + e.stack);
            showErrorPage(context, e.message);
        }
    }

    function showErrorPage(context, message) {
        lib.showErrorPage(context, message, 'Update opportunity — Error');
    }

    // ─── Lists read at runtime ────────────────────────────────────────────────────

    /** Active Call Titles in internal-ID order: [{ id, name }]. [] (logged) on failure. */
    function loadCallTitles() {
        var out = [];
        try {
            search.create({
                type:    CALL_TITLE_LIST,
                filters: [['isinactive', 'is', 'F']],
                columns: [search.createColumn({ name: 'internalid', sort: search.Sort.ASC }), 'name']
            }).run().each(function (r) {
                out.push({ id: String(r.getValue({ name: 'internalid' })), name: r.getValue({ name: 'name' }) || '' });
                return true;
            });
        } catch (e) {
            log.error('UpdateOppSL.Lists', 'Call Title list could not be read: ' + e.message);
        }
        return out;
    }

    /**
     * Active Objection Types: [{ id, name, groupId, groupName }], sorted by group internal ID, then
     * type internal ID (D14). [] (logged) on failure.
     */
    function loadObjectionTypes() {
        var out = [];
        try {
            search.create({
                type:    OBJECTION_TYPE_RECORD,
                filters: [['isinactive', 'is', 'F']],
                columns: ['internalid', 'name', OBJECTION_TYPE_GROUP]
            }).run().each(function (r) {
                out.push({
                    id:        String(r.getValue({ name: 'internalid' })),
                    name:      r.getValue({ name: 'name' }) || '',
                    groupId:   String(r.getValue({ name: OBJECTION_TYPE_GROUP }) || ''),
                    groupName: r.getText({ name: OBJECTION_TYPE_GROUP }) || 'Other'
                });
                return true;
            });
        } catch (e) {
            log.error('UpdateOppSL.Lists', 'Objection Types could not be read: ' + e.message);
        }
        out.sort(function (a, b) {
            return (idNum(a.groupId) - idNum(b.groupId)) || (idNum(a.id) - idNum(b.id));
        });
        return out;
    }

    function idNum(v) {
        var n = parseInt(v, 10);
        return isNaN(n) ? Number.MAX_SAFE_INTEGER : n;
    }

    /**
     * D2: every Estimate on the Opportunity (search columns only — no record loads), newest first:
     * [{ id, label }] where label = "tranid · description" (or title), cleaned.
     */
    function loadEstimates(opportunityId) {
        var out = [];
        try {
            search.create({
                type:    search.Type.ESTIMATE,
                filters: [
                    ['opportunity', 'anyof', opportunityId],
                    'AND',
                    ['mainline', 'is', 'T']
                ],
                columns: [
                    search.createColumn({ name: 'datecreated', sort: search.Sort.DESC }),
                    'internalid', 'tranid', 'title', 'custbody_quote_description'
                ]
            }).run().each(function (r) {
                var tranId = r.getValue({ name: 'tranid' }) || '';
                var text = lib.cleanText(r.getValue({ name: 'custbody_quote_description' })) || lib.cleanText(r.getValue({ name: 'title' }));
                out.push({ id: String(r.getValue({ name: 'internalid' })), label: text ? tranId + ' · ' + text : tranId });
                return true;
            });
        } catch (e) {
            log.error('UpdateOppSL.Lists', 'Estimates could not be read for Opportunity ' + opportunityId + ': ' + e.message);
        }
        return out;
    }

    // ─── GET ──────────────────────────────────────────────────────────────────────

    function renderPage(context, opportunityId, restore, error) {
        var page = lib.loadOppPageBase(opportunityId, { logPrefix: 'UpdateOppSL', customerEmail: false });
        if (page.loadError) {
            showErrorPage(context, page.loadError);
            return;
        }
        page.oppUrl       = lib.resolveOppUrl(opportunityId, 'UpdateOppSL');
        page.updateFields = lib.prepareFields(page.oppRecord, opportunityId, RULES);
        page.callTitles   = loadCallTitles();
        page.types        = loadObjectionTypes();
        page.estimates    = loadEstimates(opportunityId);

        var form = serverWidget.createForm({ title: 'Update opportunity' });
        var body = form.addField({ id: 'custpage_page', type: serverWidget.FieldType.INLINEHTML, label: ' ' });
        body.defaultValue = buildPageHTML(page, restore, error);
        context.response.writePage(form);
    }

    /** Today (server's calendar) as yyyy-mm-dd, from its own date parts. */
    function serverToday() {
        return lib.toIsoDate(new Date());
    }

    function buildPageHTML(page, restore, error) {
        var r = restore || {};
        var h = [];
        h.push(lib.baseCss() + PAGE_CSS);
        h.push('<div id="nsq-root" class="nsq" data-opp-url="' + escapeHtml(page.oppUrl) + '">');
        h.push('<div class="nsq-wrap">');
        h.push(lib.buildHeaderHTML(page, 'Update opportunity'));
        if (error) h.push(lib.buildErrorAlertHTML(error.lead, error.message));

        h.push('<input type="hidden" name="custpage_opportunity_id" value="' + escapeHtml(page.opportunityId) + '">');
        h.push('<input type="hidden" name="custpage_obj_sel" id="nsq-obj-sel" value="">');

        // ── 1 Log the call ──
        var today = serverToday();
        var dateValue = restore ? (r.date || '') : today;
        h.push('<section class="nsq-card"><h2 class="nsq-h2"><span class="nsq-num">1</span>Log the call</h2>');
        h.push('<div class="nsq-call-grid">');
        h.push('<div class="nsq-field"><label class="nsq-label" for="nsq-std-title">Standard title</label>' +
            '<select id="nsq-std-title" name="custpage_call_std" class="nsq-input"><option value=""></option>' +
            page.callTitles.map(function (t) {
                return '<option value="' + escapeHtml(t.name) + '"' + (r.std === t.name ? ' selected' : '') + '>' + escapeHtml(t.name) + '</option>';
            }).join('') + '</select></div>');
        h.push('<div class="nsq-field"><label class="nsq-label" for="nsq-call-title">Title <span class="nsq-req" aria-hidden="true">*</span></label>' +
            '<input type="text" class="nsq-input" id="nsq-call-title" name="custpage_call_title" maxlength="' + CALL_TITLE_MAX +
            '" autocomplete="off" value="' + escapeHtml(r.title || '') + '"></div>');
        h.push('<div class="nsq-field"><label class="nsq-label" for="nsq-call-date">Call date <span class="nsq-req" aria-hidden="true">*</span></label>' +
            '<input type="date" class="nsq-input" id="nsq-call-date" name="custpage_call_date" value="' + escapeHtml(dateValue) +
            '" max="' + escapeHtml(today) + '"' + (restore ? '' : ' data-default="1"') + '></div>');
        h.push('<div class="nsq-field"><label class="nsq-label" for="nsq-call-contact">Contact</label>' +
            '<select id="nsq-call-contact" name="custpage_call_contact" class="nsq-input"><option value="">No contact</option>' +
            page.contacts.map(function (c) {
                return '<option value="' + escapeHtml(String(c.id)) + '"' + (String(r.contact || '') === String(c.id) ? ' selected' : '') + '>' +
                    escapeHtml(c.name) + '</option>';
            }).join('') + '</select></div>');
        h.push('</div>');
        h.push('<div class="nsq-field"><label class="nsq-label" for="nsq-call-notes">What was discussed <span class="nsq-req" aria-hidden="true">*</span></label>' +
            '<textarea class="nsq-input nsq-textarea" id="nsq-call-notes" name="custpage_call_notes" rows="5" maxlength="' + CALL_NOTES_MAX + '">' +
            escapeHtml(r.notes || '') + '</textarea></div>');
        h.push('</section>');

        // ── 2 Update the opportunity ──
        h.push(lib.buildUpdateSectionHTML(page.updateFields, restore ? { upd: r.upd || {} } : null, 2));

        // ── 3 Log any objections ──
        var ticked = r.objSel || [];
        h.push('<section class="nsq-card"><h2 class="nsq-h2"><span class="nsq-num">3</span>Log any objections <span class="nsq-opt">(optional)</span></h2>');
        h.push('<p class="nsq-help">Tick every objection the customer raised. Each objection also stores the call notes from step 1.</p>');
        if (!page.types.length) {
            h.push('<p class="nsq-help">Objection types could not be loaded.</p>');
        }
        var lastGroup = null;
        page.types.forEach(function (t) {
            if (t.groupId !== lastGroup) {
                if (lastGroup !== null) h.push('</div>');
                h.push('<h3 class="nsq-h3">' + escapeHtml(lib.cleanText(t.groupName)) + '</h3><div class="nsq-chips">');
                lastGroup = t.groupId;
            }
            var on = ticked.indexOf(t.id) !== -1;
            h.push('<button type="button" class="nsq-chip" data-type-id="' + escapeHtml(t.id) + '" data-group="' + escapeHtml(t.groupId) +
                '" aria-pressed="' + (on ? 'true' : 'false') + '">' + escapeHtml(lib.cleanText(t.name)) + '</button>');
        });
        if (lastGroup !== null) h.push('</div>');
        h.push('<div class="nsq-obj-notes">');
        page.types.forEach(function (t) {
            var on = ticked.indexOf(t.id) !== -1;
            var nid = 'custpage_obj_note_' + t.id;
            h.push('<div class="nsq-field nsq-obj-note" id="nsq-obj-note-' + escapeHtml(t.id) + '"' + (on ? '' : ' hidden') + '>' +
                '<label class="nsq-label" for="' + escapeHtml(nid) + '">Note on “' + escapeHtml(lib.cleanText(t.name)) + '” (optional)</label>' +
                '<input type="text" class="nsq-input" id="' + escapeHtml(nid) + '" name="' + escapeHtml(nid) + '" maxlength="' + OBJ_NOTE_MAX +
                '" autocomplete="off" value="' + escapeHtml((r.objNotes || {})[t.id] || '') + '"></div>');
        });
        h.push('</div>');
        h.push('<div class="nsq-field nsq-about"><label class="nsq-label" for="nsq-obj-quote">About quote</label>' +
            '<select id="nsq-obj-quote" name="custpage_obj_quote" class="nsq-input"><option value="">No particular quote</option>' +
            page.estimates.map(function (e) {
                return '<option value="' + escapeHtml(e.id) + '"' + (String(r.quote || '') === e.id ? ' selected' : '') + '>' + escapeHtml(e.label) + '</option>';
            }).join('') + '</select></div>');
        h.push('</section>');

        h.push('</div>'); // .nsq-wrap

        // ── Sticky footer ──
        h.push('<div class="nsq-footer"><div class="nsq-footer-in">');
        h.push('<div class="nsq-sum"><div class="nsq-sum-main" id="nsq-sum-line"></div><div class="nsq-sum-sub" id="nsq-sum-changes"></div></div>');
        h.push('<div class="nsq-actions"><span class="nsq-reason" id="nsq-reason"></span>' +
            '<a class="nsq-btn nsq-btn-link" href="' + escapeHtml(page.oppUrl) + '">Cancel</a>' +
            '<button type="button" class="nsq-btn nsq-btn-primary" id="nsq-send" disabled>Save</button></div>');
        h.push('</div></div>');

        h.push('</div>'); // #nsq-root
        h.push('<script>' + lib.pageScript(PAGE_PART) + '</script>');
        return h.join('');
    }

    var PAGE_CSS = '<style>' +
        '.nsq-call-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(200px,1fr));gap:16px;}' +
        '.nsq-textarea{min-height:120px;resize:vertical;font-family:inherit;}' +
        '.nsq-req{color:#a4262c;}' +
        '.nsq-opt{font-weight:400;color:' + lib.PAGE_COLORS.muted + ';font-size:14px;}' +
        '.nsq-help{color:' + lib.PAGE_COLORS.muted + ';font-size:14px;margin:0 0 8px;}' +
        '.nsq-chips{display:flex;flex-wrap:wrap;gap:8px;}' +
        '.nsq-chip{min-height:44px;padding:0 14px;border:1px solid ' + lib.PAGE_COLORS.border + ';border-radius:999px;background:#fff;color:' + lib.PAGE_COLORS.text + ';font-size:14px;cursor:pointer;}' +
        '.nsq-chip[aria-pressed="true"]{background:' + lib.PAGE_COLORS.accent + ';border-color:' + lib.PAGE_COLORS.accent + ';color:#fff;font-weight:600;}' +
        '.nsq-obj-notes{margin-top:16px;}' +
        '.nsq-about{margin-top:12px;max-width:560px;}' +
        '</style>';

    /**
     * This page's part of the inline script (hook contract: lib header). STATIC — reads maxlength,
     * data-type-id and data-default from the page; nothing is interpolated.
     */
    var PAGE_PART = [
        '  function pad(n) { return (n < 10 ? "0" : "") + n; }',
        '  function ticked() {',
        '    var ids = [];',
        '    each(root.querySelectorAll(".nsq-chip"), function (c) { if (c.getAttribute("aria-pressed") === "true") ids.push(c.getAttribute("data-type-id")); });',
        '    return ids;',
        '  }',
        '  function showNote(id, on) { var n = $("nsq-obj-note-" + id); if (n) n.hidden = !on; }',
        '  function pageInit() {',
        '    var std = $("nsq-std-title"), title = $("nsq-call-title"), lastStd = std.value;',
        '    std.addEventListener("change", function () {',
        '      if (title.value.trim() === "" || title.value === lastStd) title.value = std.value;',
        '      lastStd = std.value;',
        '      update();',
        '    });',
        '    $("nsq-call-notes").addEventListener("input", update);',
        '    $("nsq-call-contact").addEventListener("change", update);',
        '    var date = $("nsq-call-date"), t = new Date();',
        '    var today = t.getFullYear() + "-" + pad(t.getMonth() + 1) + "-" + pad(t.getDate());',
        '    date.max = today;',
        '    if (date.getAttribute("data-default") === "1") date.value = today;',
        '    date.addEventListener("change", update);',
        '    each(root.querySelectorAll(".nsq-chip"), function (chip) {',
        '      chip.addEventListener("click", function () {',
        '        var on = chip.getAttribute("aria-pressed") !== "true";',
        '        chip.setAttribute("aria-pressed", on ? "true" : "false");',
        '        showNote(chip.getAttribute("data-type-id"), on);',
        '        update();',
        '      });',
        '    });',
        '    $("nsq-send").addEventListener("click", function () { submitForm("Saving…"); });',
        '  }',
        '  function problem() {',
        '    var title = $("nsq-call-title"), notes = $("nsq-call-notes"), date = $("nsq-call-date");',
        '    if (!title.value.trim()) return "Enter a call title.";',
        '    if (title.value.trim().length > title.maxLength) return "The call title is too long.";',
        '    if (!notes.value.trim()) return "Enter what was discussed.";',
        '    if (notes.value.trim().length > notes.maxLength) return "The call notes are too long.";',
        '    if (!/^\\d{4}-\\d{2}-\\d{2}$/.test(date.value)) return "Choose the call date.";',
        '    if (date.max && date.value > date.max) return "The call date can’t be in the future.";',
        '    return "";',
        '  }',
        '  function summary() {',
        '    var t = $("nsq-call-title").value.trim(), k = ticked().length;',
        '    return "Call: " + (t || "(no title yet)") + " · " + k + " objection" + (k === 1 ? "" : "s");',
        '  }',
        '  function beforeSubmit() { $("nsq-obj-sel").value = JSON.stringify(ticked()); }'
    ].join('\n');

    // ─── POST ─────────────────────────────────────────────────────────────────────

    /** The page state as posted — restored into the page after a failed save. */
    function readRestore(params) {
        var sel = parseObjSel(params.custpage_obj_sel);
        var objNotes = {};
        (sel.ids || []).forEach(function (id) {
            objNotes[id] = String(params['custpage_obj_note_' + id] || '');
        });
        return {
            std:      String(params.custpage_call_std || ''),
            title:    String(params.custpage_call_title || ''),
            date:     String(params.custpage_call_date || ''),
            contact:  String(params.custpage_call_contact || ''),
            notes:    String(params.custpage_call_notes || ''),
            objSel:   sel.ids,
            objNotes: objNotes,
            quote:    String(params.custpage_obj_quote || ''),
            upd:      lib.readPostedUpdateValues(params)
        };
    }

    /** custpage_obj_sel: a JSON array of type IDs (strings). */
    function parseObjSel(json) {
        if (!json) return { ids: [], invalid: false };
        try {
            var arr = JSON.parse(json);
            if (!Array.isArray(arr)) return { ids: [], invalid: true };
            var ids = arr.map(function (v) { return String(v); });
            return { ids: ids, invalid: ids.some(function (v) { return !/^\d{1,12}$/.test(v); }) };
        } catch (e) {
            return { ids: [], invalid: true };
        }
    }

    /** D11: "<note>\n\nCall notes (<date>): <notes>", or just the call-notes line. */
    function objectionNotes(note, callDateText, callNotes) {
        var line = 'Call notes (' + callDateText + '): ' + callNotes;
        return note ? note + '\n\n' + line : line;
    }

    /**
     * Validates everything (no writes), then: phone call → objections → Opportunity fields LAST →
     * redirect to the Opportunity with code-only parameters.
     */
    function handleSave(context) {
        var params = context.request.parameters || {};
        var opportunityId = params.custpage_opportunity_id;
        if (!opportunityId) {
            showErrorPage(context, 'No Opportunity ID provided. Please open this page from an Opportunity record.');
            return;
        }
        var restore = readRestore(params);
        function fail(lead, message) {
            renderPage(context, opportunityId, restore, { lead: lead, message: message });
        }
        function invalid(message) {
            log.audit('UpdateOppSL.Validation', 'Opportunity ' + opportunityId + ' — rejected: ' + message);
            fail('Not saved.', message);
        }

        // ── Validation — nothing is written until all of this passes ─────────────
        var title = String(params.custpage_call_title || '').trim();
        if (!title) return invalid('Enter a call title.');
        if (title.length > CALL_TITLE_MAX) return invalid('The call title is longer than ' + CALL_TITLE_MAX + ' characters.');

        var notes = String(params.custpage_call_notes || '').trim();
        if (!notes) return invalid('Enter what was discussed.');
        if (notes.length > CALL_NOTES_MAX) return invalid('The call notes are longer than ' + CALL_NOTES_MAX + ' characters.');

        var callDate = lib.parseIsoDate(String(params.custpage_call_date || '').trim());
        if (!callDate) return invalid('Choose a valid call date.');
        var latest = new Date();
        latest = new Date(latest.getFullYear(), latest.getMonth(), latest.getDate() + 1);   // server today + 1 (time zones)
        if (callDate > latest) return invalid('The call date can’t be in the future.');

        var sel = parseObjSel(params.custpage_obj_sel);
        if (sel.invalid) return invalid('The objection selection could not be read. Please try again.');
        var typeById = {};
        if (sel.ids.length) {
            loadObjectionTypes().forEach(function (t) { typeById[t.id] = t; });
            var seen = {};
            for (var i = 0; i < sel.ids.length; i++) {
                var tid = sel.ids[i];
                if (!typeById[tid]) return invalid('An objection type is not recognised. Please reload the page and try again.');
                if (seen[tid]) return invalid('An objection type was ticked twice. Please reload the page and try again.');
                seen[tid] = true;
                if (String(params['custpage_obj_note_' + tid] || '').trim().length > OBJ_NOTE_MAX) {
                    return invalid('The note on “' + lib.cleanText(typeById[tid].name) + '” is longer than ' + OBJ_NOTE_MAX + ' characters.');
                }
            }
        }

        var quoteId = String(params.custpage_obj_quote || '').trim();
        if (quoteId && !loadEstimates(opportunityId).some(function (e) { return e.id === quoteId; })) {
            return invalid('The chosen quote is not on this opportunity.');
        }

        var contactId = String(params.custpage_call_contact || '').trim();
        if (contactId && !lib.loadContacts(opportunityId, 'UpdateOppSL').some(function (c) { return String(c.id) === contactId; })) {
            return invalid('The chosen contact is not on this opportunity.');
        }

        var req = lib.validateRequired(opportunityId, params, RULES);
        if (!req.ok) {
            return invalid(req.missing.join(', ') + ' is required — the opportunity has none. Set it in step 2.');
        }

        var customerId = '';
        try {
            var opp = search.lookupFields({ type: search.Type.OPPORTUNITY, id: opportunityId, columns: ['entity'] });
            customerId = (opp.entity && opp.entity[0]) ? opp.entity[0].value : '';
        } catch (e) {
            log.error('UpdateOppSL.Call', 'Opportunity ' + opportunityId + ' — customer lookup failed: ' + e.message);
        }

        var userId = runtime.getCurrentUser().id;

        // ── 1. Phone call — if this fails, nothing else is written ───────────────
        var callId;
        try {
            var call = record.create({ type: record.Type.PHONE_CALL });
            call.setValue({ fieldId: CALL.title, value: title });
            call.setValue({ fieldId: CALL.message, value: notes });
            call.setValue({ fieldId: CALL.startDate, value: callDate });
            call.setValue({ fieldId: CALL.status, value: CALL.completed });
            if (customerId) call.setValue({ fieldId: CALL.company, value: customerId });
            call.setValue({ fieldId: CALL.transaction, value: opportunityId });
            call.setValue({ fieldId: CALL.assigned, value: userId });
            if (contactId) call.setValue({ fieldId: CALL.contact, value: contactId });
            callId = call.save();
            log.audit('UpdateOppSL.Call', 'Opportunity ' + opportunityId + ' — phone call ' + callId + ' created: "' + title + '"');
        } catch (e) {
            log.error('UpdateOppSL.Call', 'Opportunity ' + opportunityId + ' — phone call FAILED: ' + e.message);
            log.audit('UpdateOppSL.Summary', 'Opportunity ' + opportunityId + ' — call failed; nothing saved');
            fail('Nothing was saved:', e.message);
            return;
        }

        // ── 2. Objections — each in its own try/catch ────────────────────────────
        var callDateText = format.format({ value: callDate, type: format.Type.DATE });
        var created = [];
        var failedTypes = [];
        sel.ids.forEach(function (typeId) {
            try {
                var o = record.create({ type: OBJ.record });
                o.setValue({ fieldId: OBJ.opportunity, value: opportunityId });
                o.setValue({ fieldId: OBJ.type, value: typeId });
                if (quoteId) o.setValue({ fieldId: OBJ.quote, value: quoteId });
                o.setValue({ fieldId: OBJ.notes, value: objectionNotes(String(params['custpage_obj_note_' + typeId] || '').trim(), callDateText, notes) });
                o.setValue({ fieldId: OBJ.raisedBy, value: userId });
                o.setValue({ fieldId: OBJ.raisedOn, value: callDate });
                var oid = o.save();
                created.push(oid);
                log.audit('UpdateOppSL.Objection', 'Opportunity ' + opportunityId + ' — objection ' + oid + ' created (type ' + typeId + ')');
            } catch (e) {
                failedTypes.push(typeId);
                log.error('UpdateOppSL.Objection', 'Opportunity ' + opportunityId + ' — objection of type ' + typeId + ' FAILED: ' + e.message);
            }
        });

        // ── 3. Opportunity fields — LAST ─────────────────────────────────────────
        var oppUpdate = lib.updateFields(opportunityId, params, RULES);

        // ── 4. Back to the Opportunity with codes only ───────────────────────────
        var p = lib.fieldRedirectParams(oppUpdate);
        p.nsqs = 'upd';
        p.nsqc = String(callId);
        p.nsqo = String(created.length);
        if (failedTypes.length) {
            p.nsq = 'warn';
            p.nsqof = failedTypes.join(',');
        }
        log.audit('UpdateOppSL.Summary', 'Opportunity ' + opportunityId + ' — call ' + callId + '; objections created ' + created.length +
            ', failed ' + (failedTypes.join(',') || 'none') + '; fields changed ' +
            ((oppUpdate.error ? '' : oppUpdate.changed.map(function (c) { return c.key; }).join(',')) || 'none') +
            ', failed ' + ((oppUpdate.error ? oppUpdate.changed.map(function (c) { return c.key; }).join(',') : '') || 'none'));
        log.audit('UpdateOppSL.Redirect', 'Opportunity ' + opportunityId + ' — ' + JSON.stringify(p));

        redirect.toRecord({
            type:       record.Type.OPPORTUNITY,
            id:         opportunityId,
            isEditMode: false,
            parameters: p
        });
    }

    return {
        onRequest: onRequest
    };

});
